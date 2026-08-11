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
  maybeRecord({ identityKey, accountId, cache, costSince, calib = null, accountIds = null, dark = null }) {
    if (!cache || !cache.fetchedAt) return false;
    const seen = this._last.get(identityKey) ?? this.lastAnchor(identityKey)?.fetchedAt ?? 0;
    if (cache.fetchedAt <= seen) { this._last.set(identityKey, seen); return false; }
    const prev = this.lastAnchor(identityKey);
    const rec = {
      ts: Date.now(), fetchedAt: cache.fetchedAt, source: cache.source || 'unknown',
      accountId: accountId || null, identityKey,
      // OFFLINE-BIAS honesty (2.297.0): hosts that were ACTIVE-DARK while this
      // reading's interval accrued — Δu is real but their cost is missing, so
      // learning must void pairs touching this record (extractPairs). Kept in
      // the raw record forever like everything else (models re-derive offline).
      ...(Array.isArray(dark) && dark.length ? { dark } : {}),
      buckets: {
        // status 'unknown' = a FABRICATED placeholder (data/bin/vibespace-usage
        // writes {utilization:0, status:'unknown', resetsAt:0} when a window is
        // absent from the payload) — anchoring it once and pairing with the
        // next real reading forged a du=+full pair that inflated the learned
        // rate ~6× (verifier repro). Record as no-bucket instead.
        fiveHour: cache.fiveHour && cache.fiveHour.status !== 'unknown' ? { u: cache.fiveHour.utilization, resetsAt: cache.fiveHour.resetsAt } : null,
        sevenDay: cache.sevenDay && cache.sevenDay.status !== 'unknown' ? { u: cache.sevenDay.utilization, resetsAt: cache.sevenDay.resetsAt } : null,
        // asOf: scoped readings only refresh via ⟳ (preserve-merged into
        // fresher caches) — record WHEN the reading was true so estimation
        // starts its cost window there, not at the anchor write.
        scopedWeekly: (cache.scopedWeekly || []).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt, asOf: cache.scopedFetchedAt || undefined })),
      },
      prevFetchedAt: prev?.fetchedAt || null,
      elapsedSec: prev ? Math.round((cache.fetchedAt - prev.fetchedAt) / 1000) : null,
      costSince: costSince || null, // {total, byFamily:{fable,opus,sonnet,other}, requests}
    };
    // Calibration record (2.263.0): predicted-vs-actual per bucket, computed
    // by the caller from the PREVIOUS anchor + current learned rates. Lives in
    // the anchor itself so prediction quality is offline-analyzable forever.
    if (calib) rec.calib = calib;
    if (Array.isArray(accountIds) && accountIds.length > 1) rec.accountIds = accountIds;
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
  return costBetweenMulti(usageHistory, [accountId || '__global__'], fromMs, toMs);
}
// Multi-id variant (one ledger pass): a single IDENTITY can span several
// account ids — the org-merge case (__global__ + the named sub are the same
// login) and remove+re-add (fresh sub-<hex> id, same identity). Cost must sum
// across all of them or the odometer under-reads.
function costBetweenMulti(usageHistory, accountIds, fromMs, toMs) {
  const want = new Set((accountIds || []).map((a) => a || '__global__'));
  const out = { total: 0, byFamily: { fable: 0, opus: 0, sonnet: 0, haiku: 0, other: 0 }, byClass: { cw: 0, cr: 0, other: 0 }, requests: 0 };
  try {
    for (const ev of usageHistory._events(fromMs, toMs)) {
      const acct = ev.acct || '__global__';
      if (!want.has(acct)) continue;
      // Remote events RESOLVED to a real account (2.294.0 attribution) COUNT:
      // quota is a per-account global fact, and excluding another machine's
      // spend from the odometer is precisely the 1/7-coverage bias this
      // stack self-learns around — worse, after 2.294.0 the estimate ROSE
      // during a remote burn (live ring) then DROPPED when the harvest landed
      // (mid-excluded from the ring, host-excluded here: the spend visibly
      // un-counted itself). Only UNRESOLVED host-bucket events stay out —
      // 'that machine's own login' is not an estimable identity.
      if (ev.host && ev.atype === 'host') continue;
      if (ev.ts < fromMs || ev.ts > toMs) continue;
      const c = usageHistory._cost(ev);
      out.total += c; out.requests++;
      const m = String(ev.model || '').toLowerCase();
      const fam = m.includes('fable') ? 'fable' : m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : 'other';
      out.byFamily[fam] += c;
      // TOKEN-CLASS split (B-536b; 3-class since 2.268.1): the 5h bucket's
      // internal weighting differs per token class from our $ pricing —
      // cache WRITES burn ~half per $, cache READS are nearly free (real-data
      // fit: cw-full ~$443, cr-full ~$2556, fresh ~$185). cw and cr priced
      // alone; other = fresh input + output.
      const cw = usageHistory._cost({ ...ev, i: 0, o: 0, cr: 0 });
      const cr = usageHistory._cost({ ...ev, i: 0, o: 0, cw5: 0, cw1: 0 });
      out.byClass.cw += cw; out.byClass.cr += cr; out.byClass.other += Math.max(0, c - cw - cr);
    }
  } catch { }
  out.total = Math.round(out.total * 10000) / 10000;
  for (const k of Object.keys(out.byFamily)) out.byFamily[k] = Math.round(out.byFamily[k] * 10000) / 10000;
  for (const k of Object.keys(out.byClass)) out.byClass[k] = Math.round(out.byClass[k] * 10000) / 10000;
  return out;
}

module.exports = { UsageAnchors, identityKeyFor, costBetween, costBetweenMulti };
