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
const { bucketCounts } = require('./quota-model.js');
const { globalUsageKeyOf } = require('./backend-caps.js'); // PURE: the machine login's ledger key per harness

// THE ANCHOR-FILE SLUG. Exported because the repair has to walk this the OTHER
// way — from a stream file name back to the identity it stands for, and from a
// usage-cache key's identity forward to the stream that holds its readings. A
// second spelling of a name-mangling rule is a twin, and a twin that drifts
// silently re-files readings under a key nothing else uses.
function anchorSlug(key) { return String(key).replace(/[^\w.@-]/g, '_').slice(0, 80); }

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
  _file(key) { return path.join(this.dir, 'anchors-' + anchorSlug(key) + '.ndjson'); }
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
        // AN EMPTY WINDOW IS THE SAME CLASS (B-8b12): a window that has not
        // started reports `resetsAt = now + duration` at every read, so
        // anchoring it records a "reset time" that was never a deadline — and
        // the by-window repair FINGERPRINTS on exactly these resets, where a
        // number that moves on every read is the worst possible evidence.
        // `bucketCounts` is quota-model's one predicate (the derived cache view
        // stamps `state` on the bucket for it).
        fiveHour: cache.fiveHour && cache.fiveHour.status !== 'unknown' && bucketCounts(cache.fiveHour) ? { u: cache.fiveHour.utilization, resetsAt: cache.fiveHour.resetsAt } : null,
        sevenDay: cache.sevenDay && cache.sevenDay.status !== 'unknown' && bucketCounts(cache.sevenDay) ? { u: cache.sevenDay.utilization, resetsAt: cache.sevenDay.resetsAt } : null,
        // asOf: WHEN the scoped reading was true, so estimation starts its cost
        // window there, not at the anchor write. The NEWER of the entry's own
        // stamp (a stream event stamps the entry it wrote) and the file-level
        // `scopedFetchedAt` (the panel stamps the file) — r2: taking the file
        // stamp alone gave every stream-written cap the last panel's clock, and
        // the estimator discarded every such pair as the same reading.
        scopedWeekly: (cache.scopedWeekly || []).filter(bucketCounts).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt, asOf: Math.max(Number(s.asOf) || 0, Number(cache.scopedFetchedAt) || 0) || undefined })),
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
// INTERVAL MEMO (2.369.36, inc-mtox23xw): learnRates asks for the cost of
// every historical anchor pair on every recompute (thousands of pairs, several
// recomputes a minute — one per new anchor) — the pairs never change, only
// the ledger grows. Key = ids + interval + the count of events at or before
// `to` (a late backfill INTO the interval changes that count ⇒ recompute)
// + the PRICE-TABLE token.
//
// PRICING IS PART OF THE VERSION (2.369.43): a pricing edit (a tier rate or a
// per-account discount, POST /api/usage-stats/pricing or a config import)
// changes every historical cost while the event count is untouched — without
// the token the memo served pre-edit dollars forever, so the learned rates and
// every anchor's costSince kept quoting the old price table (reproduced: a 10×
// tier edit AND a 50% account discount both returned the pre-edit total). No
// token available ⇒ NO memo: an un-versionable cost is never cached.
//
// ONE MEMO PER LEDGER (2.369.43): it hangs off the UsageHistory instance
// (WeakMap), so two ledgers can never read each other's costs through a key
// that names neither.
//
// RANDOM VICTIM, NOT FIFO (2.369.43): learnRates walks one identity's anchor
// pairs in the SAME order on every recompute — a cyclic reference string, the
// one access pattern where FIFO *and* LRU fall off a CLIFF rather than
// degrading (measured on this code: a 20000-key working set hits 100%, 21000
// hits 0.0%, and the per-pair ledger walk comes back). Anchor files are
// append-only forever (real production data: 5124 pairs over 28 days across 8
// identities, ~180 new pairs/day), so the cap IS reached — with a random
// victim the hit rate then decays as cap/working-set instead of vanishing.
const _costMemos = new WeakMap(); // UsageHistory → { map, keys, tok, gen }
// THE PAIR'S OWN VERSION (hotfix usage-ledger-walk, 2026-11-11 — the owner's hub froze 5–6 s every half minute): the 60 s
// anchor sweep invalidates every identity a statusline keeps fresh, and the next GET /api/usage relearns it over EVERY
// anchor pair (ratesFor → learnRates → one costBetweenMulti per pair). The production working set was 82 k pairs against
// a 20 000-key cap, so three asks in four missed and walked again (the old pairs through the cold columns: a row built per
// visit) — measured 4.9 s for one relearn of the owner's 27 identities, the same on the second. Now:
//   · the KEY is ids|from and an entry holds up to two intervals from that start: [to, rows counted in [from, to], sums];
//   · a lookup HITS when the rows in [from, to'] are still what the entry counted and to' ≥ its to — no row entered the
//     interval and none arrived between the two ends, so the set is the same (rows only ARRIVE within a ledger
//     generation): two asks with no new row are one computation whatever the clock says (`to` = now included);
//   · the version is the interval's OWN row count — a backfill elsewhere no longer invalidates it (countUpTo(to), the
//     old version, moved for every pair after any late row), a late row INTO it does (what the live recompute is for);
//   · a pricing edit or a rewritten ledger (ledgerGen) empties the memo: every cost it holds is of another table/ledger;
//   · the capacity is the anchor working set: entries are a Float64Array of the sums (anchor files grow ~180 pairs a
//     day; ≈ 509 bytes a key measured — 82 k pairs ≈ 40 MB, 97 MB at the cap), with the random victim kept for the day a
//     history outgrows it.
const COST_MEMO_MAX = 200000;     // keys (ids|from) — ≈ 509 bytes a key measured (the verifier: 97 MB at the cap; 82 k pairs ≈ 40 MB)
function _memoFor(usageHistory) {
  let m = _costMemos.get(usageHistory);
  if (!m) { m = { map: new Map(), keys: [], tok: null, gen: null, epoch: 0 }; _costMemos.set(usageHistory, m); }
  return m;
}
/** The memo, current for this ledger's generation and price table (emptied — a new EPOCH — when either moved), or null
 *  when costs here cannot be memoized (a ledger still loading, or one that cannot version its prices). Call it AFTER any
 *  count: a count may load, and a load may rebuild. */
function _memoNow(usageHistory, { forPrime = false } = {}) {
  let loading = null; try { loading = forPrime && typeof usageHistory?._warmLoading === 'function' ? usageHistory._warmLoading() : typeof usageHistory?.ledgerLoading === 'function' ? usageHistory.ledgerLoading() : null; } catch { loading = null; }
  if (loading || typeof usageHistory?._evCountUpTo !== 'function' || typeof usageHistory?.pricingToken !== 'function') return null;
  const m = _memoFor(usageHistory), tok = usageHistory.pricingToken(), gen = usageHistory.ledgerGen || 0;
  if (m.tok !== tok || m.gen !== gen) { m.map.clear(); m.keys.length = 0; m.tok = tok; m.gen = gen; m.epoch++; } // another price table / ledger: nothing it holds is this one's
  return m;
}
/** The cost memo's census row (condition 3): its keys at ≈ 509 bytes a key (the verifier's measure), its cap. */
function costMemoCensus(usageHistory) { const m = _costMemos.get(usageHistory); const n = m ? m.map.size : 0; return { bytes: n * 509, count: n, unit: 'intervals (ids|from)', ceiling: COST_MEMO_MAX * 509, kind: 'heap', basis: '≈ 509 bytes a key (measured)' }; }
/** The memo's epoch (a new one at every emptying) — the estimator primes every identity's pairs once per epoch; null =
 *  nothing is memoized here (see _memoNow). */
function costMemoEpoch(usageHistory) { const m = _memoNow(usageHistory, { forPrime: true }); return m ? m.epoch : null; } // the memo's own epoch — its priming hold is not a reason to have none
const _rowsIn = (usageHistory, fromMs, toV) => usageHistory._evCountUpTo(toV) - usageHistory._evCountUpTo((fromMs || 0) - 1);
function _memoPut(m, key, slot) {
  const e = m.map.get(key);
  if (e) { const i = e.findIndex((x) => x[0] === slot[0]); if (i >= 0) e.splice(i, 1); e.unshift(slot); if (e.length > 2) e.length = 2; return; }
  // map and keys move in lockstep (only a NEW key is pushed); the length check keeps a future divergence from growing
  // the map without bound
  if (m.map.size >= COST_MEMO_MAX && m.keys.length) {
    const j = Math.floor(Math.random() * m.keys.length);
    m.map.delete(m.keys[j]);
    m.keys[j] = m.keys[m.keys.length - 1];
    m.keys.pop();
  }
  m.map.set(key, [slot]);
  m.keys.push(key);
}
// THE empty sum — the walk's, the sweep's and the slot layout's one spelling of the families and token classes
const _zero = () => ({ total: 0, byFamily: { fable: 0, opus: 0, sonnet: 0, haiku: 0, other: 0 }, byClass: { cw: 0, cr: 0, other: 0 }, requests: 0 });
const FAMS = Object.keys(_zero().byFamily), CLASSES = Object.keys(_zero().byClass);
// slot = [to, rowsIn, seq, total, …byFamily (FAMS), …byClass (CLASSES), requests] — the RAW sums (rounded on the way out, as the
// walk rounds them), so an interval that grows at its end goes on adding to the very bits a full walk would hold
const _r4 = (x) => Math.round(x * 10000) / 10000;
function _slotOf(to, rowsIn, out, seq = -1) { return Float64Array.of(to, rowsIn, seq, out.total, ...FAMS.map((f) => out.byFamily[f]), ...CLASSES.map((k) => out.byClass[k]), out.requests); } // seq (B1): the arrival log's position the sums have seen (-1: none — the log is not consulted)
function _rawOf(s) {
  const byFamily = {}, byClass = {};
  FAMS.forEach((f, i) => { byFamily[f] = s[4 + i]; });
  CLASSES.forEach((k, i) => { byClass[k] = s[4 + FAMS.length + i]; });
  return { total: s[3], byFamily, byClass, requests: s[4 + FAMS.length + CLASSES.length] };
}
function _round(out) {
  out.total = _r4(out.total);
  for (const k of Object.keys(out.byFamily)) out.byFamily[k] = _r4(out.byFamily[k]);
  for (const k of Object.keys(out.byClass)) out.byClass[k] = _r4(out.byClass[k]);
  return out;
}
const _outOf = (s) => _round(_rawOf(s));
// One row into a cost sum — the walk's arithmetic, in its order (the sweep below adds rows through the same function).
function _addRow(out, usageHistory, ev) {
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
  // priced as parts of the WHOLE request: a long-context row (OpenAI >272K)
  // is decided on the request's prompt, so the parts still add up to `c`
  const whole = (ev.i || 0) + (ev.cr || 0) + (ev.cw5 || 0) + (ev.cw1 || 0);
  const cw = usageHistory._cost({ ...ev, i: 0, o: 0, cr: 0 }, whole);
  const cr = usageHistory._cost({ ...ev, i: 0, o: 0, cw5: 0, cw1: 0 }, whole);
  out.byClass.cw += cw; out.byClass.cr += cr; out.byClass.other += Math.max(0, c - cw - cr);
}
// THE HOUR SUMS (hotfix usage-ledger-walk B3 — the sweep's costSince for a reading 28–94 days after the last walked the whole
// gap): per account key, per UTC hour, the raw sums of its counting rows (an absent count's NaN kept: NaN in, NaN out). Built
// by the prime's sweep (all rows), installed on the ledger's cache with the price table and generation it was built under,
// and kept by _take for every row that arrives after (c.hours.add). A long interval with no usable slot = its whole hours'
// sums + its two edges walked (≤ 2 hours of rows) — the sums in another order than the walk's: equal to the walk's to
// $0.0001 (the walk's own rounding), the tolerance pinned. ≈ 30 accounts × 2 400 hours × 80 bytes of sums at the owner's shape.
const HOUR_MS = 3600e3, HOURS_MIN_MS = 6 * HOUR_MS;
// B r2 — THE SUMS IN DAY BLOCKS: per account key, per UTC day, one Float64Array of 24 hours × HOUR_W numbers (an hour =
// [total, requests, cw, cr, other, …byFamily] — the walk's own additions, _addRow's arithmetic, onto an array). A block
// = 1 920 bytes of buffer + ≈ HOUR_BLOCK_OVERHEAD of object and Map entry (measured); THE CEILING HOURS_MAX_BYTES: a
// block that would pass it leaves the sums `over` — not installed, or stood down if installed (a long interval walks,
// master's road) — and this ledger builds none again (the cache's `hoursOver`).
const HOUR_W = 2 + CLASSES.length + FAMS.length, HOUR_BLOCK_OVERHEAD = 240, HOUR_BLOCK_BYTES = 24 * HOUR_W * 8 + HOUR_BLOCK_OVERHEAD;
const HOURS_MAX_BYTES = 48 * 1048576;
const _hourBook = (max = HOURS_MAX_BYTES) => ({ m: new Map(), bytes: 0, blocks: 0, over: false, max });
function _hourAdd(H, usageHistory, key, ev) {
  if (H.over) return;
  const h = Math.floor((ev.ts || 0) / HOUR_MS), d = Math.floor(h / 24);
  let m = H.m.get(key); if (!m) H.m.set(key, m = new Map());
  let a = m.get(d);
  if (!a) {
    if (H.bytes + HOUR_BLOCK_BYTES > H.max) { H.over = true; return; }
    m.set(d, a = new Float64Array(24 * HOUR_W)); H.bytes += HOUR_BLOCK_BYTES; H.blocks++;
  }
  const o = _zero(); _addRow(o, usageHistory, ev);
  const x = (h - d * 24) * HOUR_W;
  a[x] += o.total; a[x + 1] += o.requests; a[x + 2] += o.byClass.cw; a[x + 3] += o.byClass.cr; a[x + 4] += o.byClass.other;
  for (let i = 0; i < FAMS.length; i++) a[x + 5 + i] += o.byFamily[FAMS[i]];
}
function _hoursInstall(usageHistory, plan, seqNow) {
  if (usageHistory._evCache !== plan.cache) return; // r3: a mark is never read against a log it was not taken from
  // the rows that ARRIVED during the stepped sweep and that no slice saw (their slice was swept before they came) — from the log
  if (plan.seq >= 0 && seqNow > plan.seq && typeof usageHistory.arrivalsSince === 'function') {
    const late = usageHistory.arrivalsSince(plan.seq);
    if (!late) return; // the log no longer holds them: no hour sums this epoch (long intervals walk, master's road)
    for (let q = 0; q < late.length; q++) {
      const r = late[q], arrived = plan.seq + q;
      let k = plan.slices.length - 1; while (k > 0 && !(plan.slices[k].a <= r.ts)) k--;
      const sl = plan.slices[k];
      if (sl && arrived >= sl.seq) _hourAdd(plan.hourCells, usageHistory, r.key, r);
    }
  }
  const c = usageHistory._evCache; if (!c) return;
  if (plan.hourCells.over) { _hoursStandDown(c, plan.hourCells); return; } // past the ceiling: no sums for this ledger (long intervals walk)
  const hours = { cells: plan.hourCells, tok: plan.tok, gen: plan.gen };
  hours.add = (ev) => { // _take's: a row that arrives after the install
    if (usageHistory.pricingToken() !== hours.tok || (usageHistory.ledgerGen || 0) !== hours.gen) { if (c.hours === hours) c.hours = null; return; }
    if (ev.host && ev.atype === 'host') return;
    _hourAdd(hours.cells, usageHistory, ev.acct || globalUsageKeyOf(ev.be), ev);
    if (hours.cells.over) { if (c.hours === hours) c.hours = null; _hoursStandDown(c, hours.cells); } // the ceiling reached: the sums stand down
  };
  c.hours = hours;
}
// A STAND-DOWN IS SAID (B r3): once per ledger cache — the journal line and the event name what stood down, at what size, and
// what the hub does instead; the census row reads «stood down» with that size (usage-history _ledgerWalkCensus)
function _hoursStandDown(c, H) {
  if (c.hoursOver) return;
  c.hoursOver = { at: Date.now(), bytes: H.bytes + HOUR_BLOCK_BYTES, blocks: H.blocks };
  const mb = (c.hoursOver.bytes / 1048576).toFixed(1);
  const cap = H.max >= 1048576 ? `${Math.round(H.max / 1048576)} MB` : `${(H.max / 1024).toFixed(1)} kB`;
  try { console.warn(`[usage] the hour sums stood down at their ${cap} ceiling (${mb} MB, ${H.blocks} day blocks) — a long interval is walked as before, until the ledger is rebuilt`); } catch { }
  try { global.__vsEvent?.('usage-hours-stood-down', `${mb} MB`); } catch { }
}
/** A long interval from the hour sums (raw), or null (no usable sums, or too short to be worth it). */
function _byHours(usageHistory, want, fromMs, toMs) {
  const c = usageHistory._evCache, H = c && c.hours;
  if (!H || !(toMs - fromMs >= HOURS_MIN_MS) || H.tok !== usageHistory.pricingToken() || H.gen !== (usageHistory.ledgerGen || 0)) return null;
  const h0 = Math.ceil(fromMs / HOUR_MS), h1 = Math.floor((toMs + 1) / HOUR_MS); // whole hours [h0, h1): every ts in them lies in [from, to]
  if (!(h1 > h0)) return null;
  const out = _zero(), d0 = Math.floor(h0 / 24), d1 = Math.floor((h1 - 1) / 24);
  const edge = (a, b) => { for (const ev of usageHistory._events(a, b)) { const acct = ev.acct || globalUsageKeyOf(ev.be); if (!want.has(acct)) continue; if (ev.host && ev.atype === 'host') continue; if (ev.ts < a || ev.ts > b) continue; _addRow(out, usageHistory, ev); } };
  edge(fromMs, h0 * HOUR_MS - 1);
  for (const key of want) {
    const m = H.cells.m.get(key); if (!m) continue;
    for (let d = d0; d <= d1; d++) {
      const a = m.get(d); if (!a) continue;
      for (let h = Math.max(h0, d * 24), e = Math.min(h1, d * 24 + 24); h < e; h++) {
        const x = (h - d * 24) * HOUR_W;
        out.total += a[x]; out.requests += a[x + 1]; out.byClass.cw += a[x + 2]; out.byClass.cr += a[x + 3]; out.byClass.other += a[x + 4];
        for (let i = 0; i < FAMS.length; i++) out.byFamily[FAMS[i]] += a[x + 5 + i];
      }
    }
  }
  edge(h1 * HOUR_MS, toMs);
  return out;
}
// A PARTIAL LEDGER IS SAID (lane ledger-dedup-law r2 — the acceptance read 840 of 20 000 requests, $5.92 of $140.90, from
// a boot warm half done, and nothing said so): while the ledger is still loading past its takeover bound the rows walked
// here are only part of it — the answer carries `partial: true` and is never memoized; no caller writes a learned rate,
// records an anchor's costSince or moves a conversation on it (usage-estimator `wholeLedgerGate`, UsageEstimator).
// ONE SNAPSHOT PER ASK (B r2, MUST 2 — both verifiers): a slot's version (the rows in [from, to]), its arrival mark and its
// sums are read from ONE load of the ledger: the pin's (usage-history _pinLoad); nothing inside the ask loads again. A
// re-check that took rows in between them would put rows in the sums that the version and the mark do not count — the
// next ask would add them a second time from the log and the slot would stay wrong (master's short version just walks).
function costBetweenMulti(usageHistory, accountIds, fromMs, toMs) {
  let unpin = null;
  try { unpin = usageHistory && typeof usageHistory._pinLoad === 'function' ? usageHistory._pinLoad() : null; }
  catch (e) { // r3: a load that throws while the ledger is still loading is master's — the ask walks what it has, «partial»; a whole ledger's throws
    let loading = null; try { loading = typeof usageHistory.ledgerLoading === 'function' ? usageHistory.ledgerLoading() : null; } catch { loading = null; }
    if (!loading) throw e;
  }
  try { return _costOneLoad(usageHistory, accountIds, fromMs, toMs); } finally { if (unpin) unpin(); }
}
function _costOneLoad(usageHistory, accountIds, fromMs, toMs) {
  const want = new Set((accountIds || []).map((a) => a || '__global__'));
  let loading = null; try { loading = typeof usageHistory?.ledgerLoading === 'function' ? usageHistory.ledgerLoading() : null; } catch { loading = null; }
  const versioned = !loading && typeof usageHistory?._evCountUpTo === 'function' && typeof usageHistory?.pricingToken === 'function';
  let memo = null;
  let memoKey = null, toV = null, rowsIn = null, seqNow = -1;
  if (versioned && !(toMs != null && fromMs != null && toMs < fromMs)) { // A1: an ask whose START is after its END (a reading newer than the caller's now) is master's empty walk — it never reads or leaves a slot
    toV = toMs || Infinity;
    rowsIn = _rowsIn(usageHistory, fromMs, toV); // the rows IN [from, to] — the interval's own version (counted FIRST: the count may load, and a load may rebuild)
    memo = _memoNow(usageHistory);
    seqNow = typeof usageHistory.arrivalSeq === 'function' ? usageHistory.arrivalSeq() : -1; // B1: the arrivals these sums will have seen
  }
  if (memo) {
    memoKey = `${[...want].sort().join(',')}|${fromMs}`;
    const e = memo.map.get(memoKey);
    if (e) {
      for (const sl of e) if (sl[1] === rowsIn && toV >= sl[0]) { sl[0] = toV; if (seqNow >= 0) sl[2] = seqNow; return _outOf(sl); } // no row entered [from, to'] since (its mark moves on: what arrived meanwhile lies outside it — a row stamped ahead is the extension's when the end passes it)
      // THE PREVIOUS SUM + THE NEW ROWS: an interval from this start whose own part saw no new row since — only the rows after
      // its end are walked, added to its raw sums in the walk's order (every row after it comes later in ts order: the bits of
      // a full walk). A `to = now` ask on an account that is burning costs the rows that arrived since the last ask.
      for (const sl of e) {
        if (!(toV >= sl[0])) continue;
        // which rows the slot's own part [from, its end] gained since: none (the count stands), or — B1, THE ARRIVALS SINCE —
        // the log's rows arrived after the slot's mark: another account's ⇒ nothing; its own account's with ts in
        // [from, its end] (a scan-lagged arrival) ⇒ ADDED once, the walk's own arithmetic. A mark the log no longer holds,
        // or more arrivals to read than the interval holds rows (×4, ≥ 64), ⇒ the walk (master's road).
        const ownSame = _rowsIn(usageHistory, fromMs, sl[0]) === sl[1];
        let late = [];
        if (!ownSame) {
          const mark = sl[2];
          if (!(mark >= 0) || typeof usageHistory.arrivalsFor !== 'function' || seqNow - mark > Math.max(64, 4 * sl[1])) continue;
          late = usageHistory.arrivalsFor(mark, want, fromMs, sl[0]); // B r2: read by the columns — a row is built only for an arrival of these keys in [from, its end]
          if (!late) continue;
        }
        const out = _rawOf(sl), after = sl[0];
        let threw = false;
        try {
          for (const r of late) _addRow(out, usageHistory, r);
          // THE PREVIOUS SUM + THE NEW ROWS: the rows after its end, by ts — a row there is added here, once, whenever it arrived
          if (toV > after) {
            for (const ev of usageHistory._events(after, toMs)) {
              if (!(ev.ts > after)) continue;
              const acct = ev.acct || globalUsageKeyOf(ev.be);
              if (!want.has(acct)) continue;
              if (ev.host && ev.atype === 'host') continue;
              if (ev.ts > toMs) continue;
              _addRow(out, usageHistory, ev);
            }
          }
        } catch { threw = true; }
        if (!threw) _memoPut(memo, memoKey, _slotOf(toV, rowsIn, out, seqNow));
        return _round(out);
      }
    }
  }
  if (memo && toMs != null && fromMs != null) { // B3: a long interval with no usable slot — its whole hours from the sums, its edges walked
    let byH = null; try { byH = _byHours(usageHistory, want, fromMs, toMs); } catch { byH = null; }
    if (byH) { _memoPut(memo, memoKey, _slotOf(toV, rowsIn, byH, seqNow)); return _round(byH); }
  }
  const out = _zero();
  try {
    for (const ev of usageHistory._events(fromMs, toMs)) {
      // Same keying as the ledger aggregate: the two CLIs' machine logins are
      // DIFFERENT identities. The old bare '__global__' default silently
      // counted codex CLI-login events into the CLAUDE global identity's cost
      // (and starved '__global_codex__' of its own) — found wiring codex into
      // the estimator (P1, 2.368.18).
      const acct = ev.acct || globalUsageKeyOf(ev.be);
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
      _addRow(out, usageHistory, ev);
    }
  } catch { }
  if (memoKey) _memoPut(memo, memoKey, _slotOf(toV, rowsIn, out, seqNow)); // RAW — rounded below, as before
  _round(out);
  if (loading) out.partial = true;
  return out;
}

// THE FIRST LEARN IS ONE SWEEP (hotfix usage-ledger-walk ③): after the memo empties (a boot, a pricing edit, a rewritten
// ledger) the first relearn costs every anchor pair once — measured 4.9 s at the owner's shape as one walk PER PAIR (82 k
// walks, each over every account's rows in its interval). `groups` = [{ ids, intervals: [[from, to], …] }]: every interval
// not already memoized is costed by ONE walk of the ledger over their span, each row added (_addRow) to every interval of
// its account's groups that holds its ts — the same rows in the same order as that interval's own walk, so the same sums —
// and stored under the interval's own version, counted BEFORE the walk (a row that arrives meanwhile makes the version
// short, never a wrong hit). A row that throws stores nothing (each pair is then walked on its own, master's partial rule).
// THE PLAN, IN THREE PARTS (B3 — the plan held the first ask 205–452 ms): the items (cheap, at once), their versions counted
// a chunk per step (_primePlanCount), then the finish (the memo, the already-held filtered out, the span). A plan that also
// builds the HOUR SUMS spans the whole ledger.
// THE PRIME IS OF ONE EPOCH FROM ITS FIRST STEP (B r3 — both verifiers, the real rebuild road): the plan takes its epoch — the
// memo, the ledger generation, the price token and the cache whose arrival log it marks — at its BIRTH, before the first
// version is counted, and every step after a loop turn (each count step, the finish, each sweep slice, each store chunk, the
// hour sums' install) judges it with _primeLive and abandons the rest when it moved. A rebuild's swap between two count steps
// once passed unseen (the epoch was stamped when the count ENDED): versions of the old ledger, sums of the new, a mark of the
// old log read against the new one.
function _primeLive(usageHistory, plan) {
  if (!usageHistory) return true;
  const m = _memoNow(usageHistory, { forPrime: true });
  return !!m && m === plan.memo && m.epoch === plan.epoch && (usageHistory.ledgerGen || 0) === plan.gen && usageHistory.pricingToken() === plan.tok && usageHistory._evCache === plan.cache;
}
function _primePlanItems(usageHistory, groups, { hours = false, hoursMaxBytes = HOURS_MAX_BYTES } = {}) {
  if (!usageHistory || typeof usageHistory._evCountUpTo !== 'function') return null;
  const seq = typeof usageHistory.arrivalSeq === 'function' ? usageHistory.arrivalSeq() : -1; // a load first (it may rebuild) — then the epoch
  const memo = _memoNow(usageHistory, { forPrime: true });
  if (!memo) return null;
  const todo = new Map(), items = []; // idsKey → { ids, items }
  for (const g of groups || []) {
    const ids = [...new Set((g.ids || []).map((a) => a || '__global__'))].sort(), idsKey = ids.join(',');
    let G = todo.get(idsKey); if (!G) { G = { ids, items: [], seen: new Set() }; todo.set(idsKey, G); }
    for (const [from, to] of g.intervals || []) {
      const toV = to || Infinity;
      if (!(toV >= from) || G.seen.has(from + '|' + toV)) continue;
      G.seen.add(from + '|' + toV);
      const it = { from, toV, rowsIn: -1, key: `${idsKey}|${from}` }; G.items.push(it); items.push(it);
    }
  }
  return { todo, items, counted: 0, hours: hours && !(usageHistory._evCache && usageHistory._evCache.hoursOver), hoursMaxBytes, seq, rows: 0,
    memo, epoch: memo.epoch, gen: usageHistory.ledgerGen || 0, tok: usageHistory.pricingToken(), cache: usageHistory._evCache }; // THE STAMP
}
function _primePlanCount(usageHistory, plan, n = Infinity) { // versions counted BEFORE the sweep (a row arriving later makes an interval's version short: the store drops it)
  const end = Math.min(plan.items.length, plan.counted + n);
  for (let k = plan.counted; k < end; k++) plan.items[k].rowsIn = _rowsIn(usageHistory, plan.items[k].from, plan.items[k].toV);
  plan.counted = end;
  return plan.counted >= plan.items.length;
}
function _primePlanFinish(usageHistory, plan) {
  const memo = plan.memo; // the plan's own (stamped at its birth; the caller judged it live)
  if (!plan.items.length && !plan.hours) return null;
  let lo = Infinity, hi = -Infinity, n = 0;
  const byAcct = new Map(), gs = [];
  for (const G of plan.todo.values()) {
    G.items = G.items.filter((it) => { const e = memo.map.get(it.key); return !(e && e.some((sl) => sl[1] === it.rowsIn && it.toV >= sl[0])); });
    if (!G.items.length) continue;
    G.items.sort((a, b) => a.from - b.from);
    G.maxTo = []; let m = -Infinity;
    for (const it of G.items) { m = Math.max(m, it.toV); G.maxTo.push(m); it.out = _zero(); }
    lo = Math.min(lo, G.items[0].from); hi = Math.max(hi, m); n += G.items.length; gs.push(G);
    for (const a of G.ids) { if (!byAcct.has(a)) byAcct.set(a, []); byAcct.get(a).push(G); }
  }
  if (plan.hours) { lo = -Infinity; hi = Infinity; } // the hour sums are every row's
  if (!n && !plan.hours) return null;
  Object.assign(plan, { gs, byAcct, lo, hi, n, slices: [], hourCells: plan.hours ? _hourBook(plan.hoursMaxBytes) : null });
  return plan;
}
function _primePlan(usageHistory, groups, opts) { const p = _primePlanItems(usageHistory, groups, opts); if (!p) return null; _primePlanCount(usageHistory, p); return _primePlanFinish(usageHistory, p); }
// the rows with ts in [a, b) — or [a, b] for the last slice — added to every interval of their account's groups that holds them
function _primeSlice(usageHistory, plan, a, b, last) {
  if (plan.slices) plan.slices.push({ a, seq: typeof usageHistory.arrivalSeq === 'function' ? usageHistory.arrivalSeq() : -1 }); // B3: what this slice could see
  for (const ev of usageHistory._events(a === -Infinity ? undefined : a, b === Infinity ? undefined : b)) {
    if (!last && !(ev.ts < b)) continue; // the next slice's (a slice never adds a row twice)
    plan.rows++;
    const key = ev.acct || globalUsageKeyOf(ev.be);
    if (plan.hourCells && !(ev.host && ev.atype === 'host')) _hourAdd(plan.hourCells, usageHistory, key, ev); // B3: every counting row into its account's hour
    const gs = plan.byAcct.get(key); // the walk's keying and filters, in its order
    if (!gs) continue;
    if (ev.host && ev.atype === 'host') continue;
    for (const G of gs) {
      let x = 0, y = G.items.length;
      while (x < y) { const mid = (x + y) >> 1; if (G.items[mid].from <= ev.ts) x = mid + 1; else y = mid; }
      for (let k = x - 1; k >= 0 && G.maxTo[k] >= ev.ts; k--) if (ev.ts <= G.items[k].toV) _addRow(G.items[k].out, usageHistory, ev);
    }
  }
}
// ALL OR NOTHING (A5): every slot is built first, then stored; a store that throws empties the memo — nothing of the prime
// lands (each interval is then walked on its own, master's road) — and the throw goes to the caller's guard
// THE STORE, A CHUNK A STEP (B3 — 82 k slots stored in one turn measured 245 ms): STORE_STEP slots a step; a chunk checks the
// arrivals at ITS moment (an interval a row entered since its version was counted is not stored); the hour sums last. The hold
// keeps every reader off the memo until the end, and a step that throws empties it (nothing of the prime lands).
// A SLOT IS OF ONE PRICE TABLE AND ONE LEDGER (B r2, MUST 1 — both verifiers): a pricing edit or a swapped ledger can land in
// the turn between two chunks, and any reader's costMemoEpoch then empties the memo into a new epoch — so EVERY chunk (and
// the hour sums) is put only while the memo's epoch is still the one the sums were computed under (_memoNow judged at the
// put); an epoch that moved abandons the rest of the prime, as the sweep's steps do (master stored in its last step).
const STORE_STEP = 15000;
function* _primeStoreSteps(plan, storeHook = null, usageHistory = null, storeStep = STORE_STEP) {
  const live = () => _primeLive(usageHistory, plan);
  try {
    const items = []; for (const G of plan.gs) for (const it of G.items) items.push(it);
    if (typeof storeHook === 'function') storeHook(items.length); // a suite's seam (a store that fails)
    for (let k = 0; k < items.length; k += storeStep) {
      if (k) yield;
      if (!live()) return { abandoned: true }; // a price table / ledger moved under the store: nothing more of it lands
      // B1: rows that ARRIVED while a stepped sweep ran may sit in its sums or not (their ts decides which slice saw them) — an
      // interval one of them entered is not stored (walked on its own later); the others are stored as of NOW's arrival mark
      const seqNow = usageHistory && typeof usageHistory.arrivalSeq === 'function' ? usageHistory.arrivalSeq() : plan.seq, moved = usageHistory && seqNow !== plan.seq;
      for (const it of items.slice(k, k + storeStep)) { if (moved && _rowsIn(usageHistory, it.from, it.toV) !== it.rowsIn) continue; _memoPut(plan.memo, it.key, _slotOf(it.toV, it.rowsIn, it.out, seqNow)); } // RAW sums
    }
    if (plan.hourCells && usageHistory) { if (items.length) yield; if (!live()) return { abandoned: true }; _hoursInstall(usageHistory, plan, typeof usageHistory.arrivalSeq === 'function' ? usageHistory.arrivalSeq() : plan.seq); }
  } catch (e) { try { plan.memo.map.clear(); plan.memo.keys.length = 0; } catch { } throw e; }
  return { intervals: plan.n, rows: plan.rows };
}
function _primeStore(plan, storeHook = null, usageHistory = null) { const g = _primeStoreSteps(plan, storeHook, usageHistory); for (;;) { const r = g.next(); if (r.done) return r.value; } }
// a whole synchronous prime is one snapshot too (MUST 2)
const _pinned = (usageHistory, fn) => { const unpin = usageHistory && typeof usageHistory._pinLoad === 'function' ? usageHistory._pinLoad() : null; try { return fn(); } finally { if (unpin) unpin(); } };
/** The sweep at once (a small span, a suite): → { intervals, rows }. */
function primeCosts(usageHistory, groups) {
  return _pinned(usageHistory, () => {
    const plan = _primePlan(usageHistory, groups);
    if (!plan) return { intervals: 0, rows: 0 };
    try { _primeSlice(usageHistory, plan, plan.lo, plan.hi, true); return _primeStore(plan, null, usageHistory); } catch { return { intervals: 0, rows: plan.rows }; } // A5: nothing of a failed sweep lands
  });
}
/** …STEPPED, OFF THE REQUEST PATH (主开发's ruling): `sliceMs` of ledger time per step, each step synchronous (no walk is
 *  held across a yield — the cold columns may re-sort between steps), `next` hands the loop back between them. A row that
 *  arrives between steps can only make an interval's version short of its sum (a miss later, never a wrong hit). A new
 *  memo epoch (a pricing edit, a rewritten ledger) under the sweep abandons it. A span of at most `syncMaxRows` rows is
 *  swept at once and answered at once (a plain object, no promise).
 *  A THROW ENDS IT (A5): every step is guarded whole — a throw anywhere in it (the memo's version read, a slice, the store)
 *  ends the prime: the hold is released, nothing of it lands, nothing is thrown out of the timer, it is said once with the
 *  step that threw — and the estimator then answers as master does for that epoch (each pair walked on its own). SLOWNESS
 *  NEVER ENDS IT (the owner's boot): each `holdMaxMs` window a watchdog says «slow, it goes on»; only a whole window with NO
 *  step drops it ({abandoned, stalled} — its epoch unlearned, the next ask starts a new stepped prime).
 *  → { intervals, rows } | Promise<{ intervals, rows } | { abandoned: true, failed? }> */
function primeCostsStepped(usageHistory, groups, { sliceMs = 2 * 3600e3, next = (fn) => setImmediate(fn), syncMaxRows = PRIME_SYNC_MAX_ROWS, holdMaxMs = PRIME_HOLD_MAX_MS, storeHook = null, say = (m) => console.warn(m), hours = true, countStep = PRIME_COUNT_STEP, storeStep = STORE_STEP, hoursMaxBytes = HOURS_MAX_BYTES, holdNamedMs = holdMaxMs } = {}) {
  const total = _rowsIn(usageHistory, -Infinity, Infinity);
  if (total <= syncMaxRows) return _pinned(usageHistory, () => { // a small ledger: the whole plan and sweep at once (and answered at once) — one snapshot
    let plan; try { plan = _primePlan(usageHistory, groups, { hours, hoursMaxBytes }); } catch (e) { return { abandoned: true, failed: String((e && e.message) || e) }; }
    if (!plan) return { intervals: 0, rows: 0 };
    try { _primeSlice(usageHistory, plan, plan.lo, plan.hi, true); return _primeStore(plan, storeHook, usageHistory); } catch (e) { try { say(`[usage] the first cost sweep stopped (${String((e && e.message) || e).slice(0, 160)})`); } catch { } return { abandoned: true, failed: String((e && e.message) || e) }; }
  });
  const fail = (e, where = 'a step') => { const why = String((e && e.message) || e || 'unknown').slice(0, 160); try { say(`[usage] the first cost sweep stopped (${where} threw: ${why}) — the costs of this price table / ledger are walked interval by interval, as before the sweep existed`); } catch { } try { global.__vsEvent?.('usage-prime-failed', why); } catch { } return { abandoned: true, failed: why }; };
  let plan; try { plan = _pinned(usageHistory, () => _primePlanItems(usageHistory, groups, { hours, hoursMaxBytes })); } catch (e) { return fail(e, "the plan's birth"); } // at once: the items and THE STAMP (B3 — the versions are counted in steps); a throw here ends it as a step's does
  if (!plan) return { intervals: 0, rows: 0 };
  const hold = typeof usageHistory._holdForPrime === 'function' ? usageHistory._holdForPrime() : null; // A2: every reader waits
  return new Promise((resolve) => {
    let a = null, over = false, timer = null, phase = 'count', store = null, steps = 0, seen = 0, slowSaid = false;
    const end = (r) => { if (over) return; over = true; if (timer) clearTimeout(timer); if (hold) { try { usageHistory._releasePrime(hold); } catch { } } resolve(r); };
    // THE FIRST LEARN NEVER RUNS ON THE SYNCHRONOUS ROAD (the owner's boot, 2.369.392: 36 conversations restoring, the loop busy, the
    // bound fired twice and the pair-by-pair walk froze the hub): SLOWNESS IS NOT FATAL. Each `holdMaxMs` window the watchdog asks
    // whether a step ran: yes ⇒ «slow, it goes on» (said once) and it re-arms; no step in a whole window ⇒ the prime is dropped
    // ({abandoned, stalled}: its epoch stays unlearned — the next ask starts a new STEPPED prime). Only a THROW is master's road (fail).
    const watch = () => {
      if (over) return;
      if (steps === seen) { try { say(`[usage] the first cost sweep made no step for ${holdNamedMs} ms — it is dropped; the next ask starts a new one (stepped)`); } catch { } try { global.__vsEvent?.('usage-prime-dropped', 'the sweep'); } catch { } end({ abandoned: true, stalled: true }); return; }
      seen = steps;
      if (!slowSaid) { slowSaid = true; try { say(`[usage] the first cost sweep is slow (${steps} steps in ${holdNamedMs} ms — the loop is busy) — estimates wait for it; it goes on`); } catch { } try { global.__vsEvent?.('usage-prime-slow', String(steps)); } catch { } }
      timer = setTimeout(watch, holdMaxMs); if (timer && typeof timer.unref === 'function') timer.unref();
    };
    timer = setTimeout(watch, holdMaxMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
    const step = () => {
      if (over) return;
      steps++;
      let unpin = null;
      try {
        unpin = usageHistory && typeof usageHistory._pinLoad === 'function' ? usageHistory._pinLoad() : null; // MUST 2: a step is one snapshot
        if (phase === 'store') { const r = store.next(); if (r.done) end(r.value); else next(step); return; } // the store, a chunk a step (each judged in _primeStoreSteps)
        if (!_primeLive(usageHistory, plan)) { end({ abandoned: true }); return; } // r3: EVERY step after a loop turn — a count step, the finish, a slice: a price table / ledger moved under it ⇒ nothing of it lands
        if (phase === 'count') { // the versions, a chunk a step
          if (!_primePlanCount(usageHistory, plan, countStep)) { next(step); return; }
          if (!_primePlanFinish(usageHistory, plan)) { end({ intervals: 0, rows: 0 }); return; }
          phase = 'sweep'; a = plan.lo === -Infinity ? _firstTs(usageHistory) : plan.lo; next(step); return;
        }
        const b = a + sliceMs, last = !(b < Math.min(plan.hi, Date.now() + sliceMs)); // a whole-ledger sweep ends with the slice past now — [a, ∞): a row stamped ahead is in it
        _primeSlice(usageHistory, plan, plan.slices.length ? a : plan.lo, last ? plan.hi : b, last);
        if (last) { phase = 'store'; store = _primeStoreSteps(plan, storeHook, usageHistory, storeStep); next(step); return; }
        a = b; next(step);
      } catch (e) { end(fail(e, phase === 'sweep' ? `the sweep (slice ${plan.slices ? plan.slices.length : 0})` : phase === 'store' ? 'the store' : 'the count')); } finally { if (unpin) unpin(); }
    };
    try { next(step); } catch (e) { end(fail(e, 'the first step')); }
  });
}
const PRIME_HOLD_MAX_MS = 30000; // the watchdog's window: «slow» is said after one; a prime with NO step in a whole one is dropped (never the sync road)
const PRIME_COUNT_STEP = 4000; // interval versions counted per step (2 binary searches each)
function _firstTs(usageHistory) { try { for (const ev of usageHistory._events(undefined, undefined)) return ev.ts || 0; } catch { } return 0; } // the whole-ledger sweep's first slice starts at the oldest row
const PRIME_SYNC_MAX_ROWS = 50000; // ≈ 20–40 ms of sweep: below it the first learn needs no «loading» window at all

module.exports = { UsageAnchors, identityKeyFor, anchorSlug, costBetween, costBetweenMulti, primeCosts, primeCostsStepped, costMemoEpoch, costMemoCensus, HOURS_MAX_BYTES, HOUR_BLOCK_BYTES };
