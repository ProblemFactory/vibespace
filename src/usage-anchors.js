// Quota dead-reckoning DATA FOUNDATION (user-designed, 2026-08-09): record
// every ground-truth usage reading (anchor) together with the ledger cost
// consumed since the previous anchor — the complete training set for the
// prediction system, improvable OFFLINE forever (rates/models re-derivable
// from raw pairs; we never store only a lossy EWMA). Zero API calls: anchors
// are whatever the passive statusline / human ⟳ / get_usage / limit banner
// already wrote; cost deltas come from the local usage-history ledger.
//
// PRIMARY KEY = IDENTITY KEY, not the minted account id (user requirement:
// tracking must survive remove + re-add of a subscription — a re-add mints a
// fresh sub-<hex> id). Precedence: Anthropic orgUuid (baked into usage-cache
// by the ⟳ roles fetch) > lowercased email (account record / cache) > the
// account id as last resort. Files: data/usage-anchors/anchors-<slug>.ndjson.
const fs = require('fs');
const path = require('path');

function identityKeyFor({ accountId, cache, email }) {
  if (cache?.orgUuid) return 'org:' + String(cache.orgUuid).toLowerCase();
  const em = email || cache?.orgEmail || cache?.email || null;
  if (em) return 'email:' + String(em).trim().toLowerCase();
  return 'acct:' + (accountId || '__global__');
}

class UsageAnchors {
  constructor({ dataDir }) {
    this.dir = path.join(dataDir, 'usage-anchors');
    this._last = new Map(); // identityKey → last recorded fetchedAt (dedup)
  }
  _file(key) { return path.join(this.dir, 'anchors-' + key.replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); }
  // Last recorded anchor for a key (tail line) — used by the engine to compute
  // the cost delta window and by future prediction code as the base point.
  lastAnchor(key) {
    try {
      const data = fs.readFileSync(this._file(key), 'utf-8');
      const nl = data.lastIndexOf('\n', data.length - 2);
      return JSON.parse(data.slice(nl + 1));
    } catch { return null; }
  }
  // Record one ground-truth reading. Dedup by fetchedAt (statusline rewrites
  // the same snapshot every 8s while a terminal runs). costSince = ledger cost
  // between the previous anchor's fetchedAt and this one, split by model
  // family so scoped-bucket (Fable) rates stay derivable offline.
  maybeRecord({ identityKey, accountId, cache, costSince }) {
    if (!cache || !cache.fetchedAt) return false;
    const seen = this._last.get(identityKey) ?? this.lastAnchor(identityKey)?.fetchedAt ?? 0;
    if (cache.fetchedAt <= seen) { this._last.set(identityKey, seen); return false; }
    const prev = this.lastAnchor(identityKey);
    const rec = {
      ts: Date.now(), fetchedAt: cache.fetchedAt, source: cache.source || 'unknown',
      accountId: accountId || null, identityKey,
      buckets: {
        fiveHour: cache.fiveHour ? { u: cache.fiveHour.utilization, resetsAt: cache.fiveHour.resetsAt } : null,
        sevenDay: cache.sevenDay ? { u: cache.sevenDay.utilization, resetsAt: cache.sevenDay.resetsAt } : null,
        scopedWeekly: (cache.scopedWeekly || []).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt })),
      },
      prevFetchedAt: prev?.fetchedAt || null,
      elapsedSec: prev ? Math.round((cache.fetchedAt - prev.fetchedAt) / 1000) : null,
      costSince: costSince || null, // {total, byFamily:{fable,opus,sonnet,other}, requests}
    };
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(this._file(identityKey), JSON.stringify(rec) + '\n');
      this._last.set(identityKey, cache.fetchedAt);
      return true;
    } catch { return false; }
  }
}

// Ledger cost between two times for one account id, split by model family —
// the "odometer reading" of the dead-reckoning pair.
function costBetween(usageHistory, accountId, fromMs, toMs) {
  const out = { total: 0, byFamily: { fable: 0, opus: 0, sonnet: 0, haiku: 0, other: 0 }, requests: 0 };
  try {
    for (const ev of usageHistory._events(fromMs, toMs)) {
      const acct = ev.acct || '__global__';
      if (acct !== (accountId || '__global__')) continue;
      if (ev.host) continue; // local odometer only; remote rides the harvest separately
      if (ev.ts < fromMs || ev.ts > toMs) continue;
      const c = usageHistory._cost(ev);
      out.total += c; out.requests++;
      const m = String(ev.model || '').toLowerCase();
      const fam = m.includes('fable') ? 'fable' : m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : 'other';
      out.byFamily[fam] += c;
    }
  } catch { }
  out.total = Math.round(out.total * 10000) / 10000;
  for (const k of Object.keys(out.byFamily)) out.byFamily[k] = Math.round(out.byFamily[k] * 10000) / 10000;
  return out;
}

module.exports = { UsageAnchors, identityKeyFor, costBetween };
