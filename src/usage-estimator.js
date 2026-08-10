// Quota dead-reckoning ESTIMATOR (B-fcff v2, 2.263.0) — the prediction layer
// on top of the 2.261.0 anchor data foundation. Between ground-truth readings
// (anchors) it estimates each bucket's CURRENT utilization as
//   est_u = anchor_u + rate × ledger_cost_since_anchor
// with per-identity per-bucket rates LEARNED from the accumulated anchor pairs
// and re-derived automatically as data grows (weighted least squares through
// the origin: rate = Σ Δu / Σ cost — integer-% quantization noise averages
// out as total Δu accumulates; single-pair rates are ±3× noise, NEVER use
// them directly). Zero API calls anywhere (§ban-safety): inputs are the local
// anchor files + the local usage-history ledger only.
//
// PRIORS: seeded from the measured ProblemFactory Max quotas (2026-08-09,
// odometer method over full windows, 5 anchors self-consistent to ±3%):
// 5h ≈ $500, 7d ≈ $1730, Fable weekly ≈ $875 API-equivalent. Blended as a
// pseudo-pair with Δu-weight PRIOR_WEIGHT_DU so real observations dominate
// once an identity has ~15%+ of observed utilization movement. Caveat: these
// are Max-20x numbers — a Pro account starts ~4-10× off and self-corrects as
// its own pairs accumulate (the limit banner remains the hard backstop).
//
// Rates learn the EFFECTIVE local rate: an identity consuming on other
// devices too (the org-account ~1/7 case) learns a proportionally HIGHER
// rate per local dollar — external share is absorbed automatically as long
// as it stays roughly stable. Pod-exclusive accounts converge to 1/full.
const fs = require('fs');
const path = require('path');

// Δu-equivalent weight of the prior pseudo-observation.
const PRIOR_WEIGHT_DU = 0.15;
// Measured Max-20x full-quota sizes in API-equivalent USD (see header).
const CLAUDE_MAX_PRIOR_FULL_USD = { fiveHour: 500, sevenDay: 1730, 'scoped:fable': 875 };
// 5h TOKEN-CLASS priors (B-536b): the 5h bucket weights cache-WRITE tokens
// far below our $ pricing — hourly-scale evidence put cw-heavy windows at
// implied full ~$500-800 and fresh/output-heavy at ~$150-300. Two pseudo-
// pairs (pure-cw / pure-other) seed the 2-var regression; real mixed data
// dominates quickly (PRIOR_WEIGHT_DU each).
const PRIOR_5H_CW_FULL_USD = 800;
const PRIOR_5H_OTHER_FULL_USD = 250;
const WEEK_SEC = 7 * 86400;

function normU(u) {
  const n = Number(u);
  if (!Number.isFinite(n)) return null;
  if (n > 1.5) return Math.min(n / 100, 1.5); // integer-% reading
  return Math.max(0, n);
}
function scopedKey(name) { return 'scoped:' + String(name || '').trim().toLowerCase(); }
// Which ledger model family a scoped bucket's cost comes from ('Fable' → the
// fable-family column; unknown scope names fall back to total cost).
function scopedFamily(name) {
  const n = String(name || '').toLowerCase();
  for (const fam of ['fable', 'opus', 'sonnet', 'haiku']) if (n.includes(fam)) return fam;
  return null;
}
function costForKey(key, costSince) {
  if (!costSince) return null;
  if (key === 'fiveHour' || key === 'sevenDay') return Number(costSince.total) || 0;
  const fam = scopedFamily(key.slice('scoped:'.length));
  if (fam && costSince.byFamily && Number.isFinite(Number(costSince.byFamily[fam]))) return Number(costSince.byFamily[fam]) || 0;
  return Number(costSince.total) || 0;
}

// Per-bucket (Δu, cost) observations from an identity's anchor lines. Each
// line's costSince covers [prevFetchedAt, fetchedAt] — the base anchor is
// matched BY fetchedAt (identity files can interleave sources; positional
// adjacency is not guaranteed). Guards: a reset crossing inside the pair
// (resetsAt moved >120s) voids the bucket's pair; a utilization DECREASE
// beyond quantization jitter (>0.02) without a reset change is an anomaly
// (skip); small negatives clamp to 0 with the cost still counted (the spend
// really happened — dropping it would bias rates high).
// opts.costFn(fromMs, toMs) → {total, byFamily}: when provided, each pair's
// cost is RECOMPUTED from the live ledger instead of the frozen costSince —
// the sweep records costSince against a ledger scan that LAGS fast burns
// (worst case: a $205 workflow run whose transcripts weren't even scanned),
// so frozen pairs systematically under-count cost and teach HOT rates
// (calib-caught: a 3-4× overestimating 5h rate). The ledger is append-only
// and eventually complete; recomputing at learn time self-heals every
// stale-cost pair retroactively.
function extractPairs(lines, opts = {}) {
  const byFetched = new Map();
  for (const l of lines || []) if (l && l.fetchedAt) byFetched.set(l.fetchedAt, l);
  // v1-era interleaved records (pre-2.263.0 per-cache-file sweep): an identity
  // file MIXING distinct accountId values was double-anchored, each record's
  // costSince missing the sibling account's spend — such pairs contribute full
  // Δu against fractional cost and bias the rate HIGH. Grouped records on
  // multi-id identities carry `accountIds`; unmarked lines in a mixed-id file
  // are the legacy signature and are excluded from learning.
  const distinctIds = new Set();
  for (const l of lines || []) if (l && l.fetchedAt) distinctIds.add(l.accountId ?? '__global__');
  const out = {};
  const add = (key, du, cost, cls = null) => { (out[key] = out[key] || []).push(cls ? { du, cost, cw: cls.cw, ot: cls.ot } : { du, cost }); };
  // BOUNCE-BACK taint (2.267.0, real poison caught in the Personal Max calib
  // stream): a stale sibling cache file briefly promoted to freshest anchors a
  // WEEK-OLD reading — the u-DECREASE pair into it is already voided by the
  // anomaly guard below, but the RECOVERY pair out of it (stale→fresh, e.g.
  // fable 19%→51% over $1.68) read as a huge du for near-zero cost and taught
  // a ~30%-hot rate (= the user-visible systematic overestimate). An anomalous
  // reading poisons BOTH its incoming and outgoing pair: record the anomalous
  // anchor's fetchedAt per bucket and skip any pair BASED on it. Lines append
  // chronologically, so the decrease pair is always seen before the bounce.
  const tainted = {}; // key → Set<fetchedAt of the anomalous anchor>
  for (const l of lines || []) {
    if (!l || !l.prevFetchedAt || !l.costSince) continue;
    if (distinctIds.size > 1 && !Array.isArray(l.accountIds)) continue; // legacy under-counted pair
    const base = byFetched.get(l.prevFetchedAt);
    if (!base || !base.buckets || !l.buckets) continue;
    const spanSec = (l.fetchedAt - base.fetchedAt) / 1000;
    let liveCost = null; // lazily recomputed once per pair when costFn given
    const pairBucket = (key, b0, b1) => {
      if (!b0 || !b1) return;
      if (tainted[key]?.has(base.fetchedAt)) return; // recovery from an anomalous base
      const u0 = normU(b0.u), u1 = normU(b1.u);
      if (u0 == null || u1 == null) return;
      // AT-CAP readings are CENSORED data: a bucket clipped at 100% (the
      // limit-banner mark writes exactly 1, and a real exhausted ⟳ reads
      // 100 too) says nothing about how much spend got it there — the
      // incident's 9%→100%-over-$50 pair taught full≈$139 vs true $500.
      if (u0 >= 0.995 || u1 >= 0.995) return;
      const r0 = Number(b0.resetsAt) || 0, r1 = Number(b1.resetsAt) || 0;
      if (r0 && r1 && Math.abs(r0 - r1) > 120) return; // window rolled inside the pair
      // resetsAt can be 0/absent (partial cache writes) — the crossing guard
      // above is then disarmed, so bound pairs by the WINDOW LENGTH instead: a
      // 5h-bucket pair spanning >5h has definitionally crossed a reset.
      if (spanSec > (key === 'fiveHour' ? 5 * 3600 : WEEK_SEC)) return;
      // Scoped readings only refresh via ⟳ (asOf = scopedFetchedAt) — two
      // anchors carrying the SAME stale reading have zero information (du=0
      // with real cost would bias the rate low).
      if (key.startsWith('scoped:') && b0.asOf && b1.asOf && b0.asOf === b1.asOf) return;
      let du = u1 - u0;
      if (du < -0.02) { (tainted[key] = tainted[key] || new Set()).add(l.fetchedAt); return; } // anomalous decrease without a reset change — and the NEXT pair off this anchor is the bounce-back
      if (du < 0) du = 0;
      if (opts.costFn && liveCost === null) { try { liveCost = opts.costFn(base.fetchedAt, l.fetchedAt) || null; } catch { liveCost = null; } }
      // A ZERO live total with a non-zero recorded snapshot means the ledger
      // no longer covers this window (retention/pruning) — the frozen
      // snapshot is then the better source, not zero.
      const src = (liveCost && liveCost.total > 0) ? liveCost : l.costSince;
      const cost = costForKey(key, src);
      if (cost == null) return;
      // token-class split rides only where the source carries it (the live
      // recompute always does since B-536b — historical pairs get classes
      // RETROACTIVELY; a frozen pre-B-536b snapshot yields null = the pair
      // still feeds the blended fallback, never the regression)
      const cls = key === 'fiveHour' && src.byClass && Number.isFinite(Number(src.byClass.cw))
        ? { cw: Number(src.byClass.cw) || 0, ot: Math.max(0, cost - (Number(src.byClass.cw) || 0)) } : null;
      add(key, du, cost, cls);
    };
    pairBucket('fiveHour', base.buckets.fiveHour, l.buckets.fiveHour);
    pairBucket('sevenDay', base.buckets.sevenDay, l.buckets.sevenDay);
    for (const s1 of l.buckets.scopedWeekly || []) {
      const s0 = (base.buckets.scopedWeekly || []).find((x) => scopedKey(x.name) === scopedKey(s1.name));
      if (s0) pairBucket(scopedKey(s1.name), s0, s1);
    }
  }
  return out;
}

// rate (utilization fraction per API-equivalent $) per bucket key. Prior is a
// pseudo-pair {du: PRIOR_WEIGHT_DU, cost: PRIOR_WEIGHT_DU × priorFullUsd}.
// Without a prior, a bucket needs real signal (≥$1 cost AND ≥0.5% movement)
// before we dare emit a rate at all.
function learnRates(lines, { priors = null, costFn = null } = {}) {
  const pairs = extractPairs(lines, { costFn });
  const keys = new Set([...Object.keys(pairs), ...Object.keys(priors || {})]);
  const out = {};
  for (const key of keys) {
    let sumDu = 0, sumCost = 0, n = 0;
    for (const p of pairs[key] || []) { sumDu += p.du; sumCost += p.cost; n++; }
    const prior = priors ? Number(priors[key]) || null : null;
    let rate = null;
    if (prior) rate = (sumDu + PRIOR_WEIGHT_DU) / (sumCost + PRIOR_WEIGHT_DU * prior);
    else if (sumCost >= 1 && sumDu >= 0.005) rate = sumDu / sumCost;
    if (!rate || !Number.isFinite(rate) || rate <= 0) continue;
    out[key] = {
      rate,
      impliedFullUsd: Math.round(10 / rate) / 10,
      nPairs: n,
      obsDu: Math.round(sumDu * 10000) / 10000,
      obsCostUsd: Math.round(sumCost * 100) / 100,
      priorFullUsd: prior,
    };
    // 5h TOKEN-CLASS regression (B-536b, user-approved): du = a·cw$ + b·other$
    // — the 5h bucket weights cache-write tokens far below our pricing, so
    // one blended $-rate swings ±2.5× with the hour's mix. Ordinary least
    // squares on class-split pairs + the two pure-class prior pseudo-pairs;
    // the blended rate above stays as DISPLAY/back-compat + the fallback for
    // degenerate data (all pairs same mix ⇒ near-singular normal equations).
    if (key === 'fiveHour' && prior) {
      const cls = (pairs[key] || []).filter((p) => Number.isFinite(p.cw));
      if (cls.length >= 3) {
        const obs = [
          ...cls.map((p) => ({ du: p.du, cw: p.cw, ot: p.ot })),
          { du: PRIOR_WEIGHT_DU, cw: PRIOR_WEIGHT_DU * PRIOR_5H_CW_FULL_USD, ot: 0 },
          { du: PRIOR_WEIGHT_DU, cw: 0, ot: PRIOR_WEIGHT_DU * PRIOR_5H_OTHER_FULL_USD },
        ];
        let scc = 0, soo = 0, sco = 0, scd = 0, sod = 0;
        for (const o of obs) { scc += o.cw * o.cw; soo += o.ot * o.ot; sco += o.cw * o.ot; scd += o.cw * o.du; sod += o.ot * o.du; }
        const det = scc * soo - sco * sco;
        if (det > 1e-6) {
          const a = (scd * soo - sod * sco) / det;
          const b = (sod * scc - scd * sco) / det;
          // positivity + sanity bounds (implied fulls within [40, 20000]$):
          // a negative/absurd coefficient = ill-conditioned mix — keep blended
          const okA = Number.isFinite(a) && a > 1 / 20000 && a < 1 / 40;
          const okB = Number.isFinite(b) && b > 1 / 20000 && b < 1 / 40;
          if (okA && okB) {
            out[key].rateCw = a;
            out[key].rateOther = b;
            out[key].impliedFullCwUsd = Math.round(10 / a) / 10;
            out[key].impliedFullOtherUsd = Math.round(10 / b) / 10;
            out[key].nClassPairs = cls.length;
          }
        }
      }
    }
  }
  return out;
}

// Estimate each bucket's utilization NOW from the last anchor + ledger cost.
// costFn(fromMs, toMs) → {total, byFamily} (the caller binds account ids).
// Window-roll semantics: a 7d/scoped reset that PASSED since the anchor means
// a new window began at the old resetsAt — re-base from utilization 0 at that
// moment and advance resetsAt in 7-day steps (the weekly window is a fixed
// cadence). The 5h window is NOT fixed-cadence (it opens with the first
// request after idle), so a passed 5h reset yields null (unknown — consumers
// treat it as full-again, exactly like the raw cache path).
function estimateBuckets({ anchor, rates, costFn, nowMs }) {
  if (!anchor || !anchor.buckets || !rates || !costFn) return null;
  const costMemo = new Map();
  const cost = (fromMs) => {
    if (!costMemo.has(fromMs)) { try { costMemo.set(fromMs, costFn(fromMs, nowMs) || { total: 0, byFamily: {} }); } catch { costMemo.set(fromMs, { total: 0, byFamily: {} }); } }
    return costMemo.get(fromMs);
  };
  let sinceCostUsd = 0;
  const estBucket = (key, b, { weekly }) => {
    const r = rates[key];
    if (!b || !r) return null;
    let baseU = normU(b.u);
    if (baseU == null) return null;
    let resetSec = Number(b.resetsAt) || 0;
    // Scoped readings arrive only via ⟳ — the anchor may carry a reading
    // OLDER than its own fetchedAt (preserve-merged). Cost accrues from when
    // the READING was true, not from the anchor write (else fable spend since
    // the last ⟳ silently vanishes from the estimate).
    let fromMs = (b.asOf && b.asOf < anchor.fetchedAt) ? b.asOf : anchor.fetchedAt;
    // resetsAt-less reading (defensive statusline fallbacks write resetsAt:0):
    // window state unknowable — dead-reckon only within ONE window length of
    // the base, then abstain (verifier repro: a 3-day-old anchor + $600 of
    // ledger cost otherwise rendered a 120% FIVE-HOUR arc and false-tripped
    // the pool's min-across-buckets gate).
    if (!resetSec && nowMs - fromMs > (weekly ? WEEK_SEC : 5 * 3600) * 1000) return null;
    if (resetSec && resetSec * 1000 <= nowMs) {
      if (!weekly) return null; // 5h roll — window start unknowable
      // new weekly window(s): re-base at the last reset boundary before now
      while (resetSec * 1000 <= nowMs) { fromMs = resetSec * 1000; resetSec += WEEK_SEC; }
      baseU = 0;
    }
    const c = costForKey(key, cost(fromMs));
    if (c == null) return null;
    sinceCostUsd = Math.max(sinceCostUsd, (cost(fromMs).total || 0));
    // 5h class-aware prediction (B-536b): when the regression produced class
    // rates AND the cost source carries the split, predict per component —
    // the blended rate stays the fallback (pre-B-536b snapshots, degenerate
    // regressions).
    let du;
    const bc = cost(fromMs).byClass;
    if (key === 'fiveHour' && r.rateCw != null && r.rateOther != null && bc && Number.isFinite(Number(bc.cw))) {
      const cw = Number(bc.cw) || 0;
      du = r.rateCw * cw + r.rateOther * Math.max(0, c - cw);
    } else {
      du = r.rate * c;
    }
    const u = Math.min(1.2, baseU + du);
    return { utilization: Math.round(u * 10000) / 10000, resetsAt: resetSec || undefined, estimated: true };
  };
  const out = { estimated: true, anchorAt: anchor.fetchedAt, asOf: nowMs };
  const b = anchor.buckets;
  out.fiveHour = estBucket('fiveHour', b.fiveHour, { weekly: false });
  out.sevenDay = estBucket('sevenDay', b.sevenDay, { weekly: true });
  out.scopedWeekly = [];
  for (const s of b.scopedWeekly || []) {
    const e = estBucket(scopedKey(s.name), s, { weekly: true });
    if (e) out.scopedWeekly.push({ name: s.name, ...e });
  }
  if (!out.fiveHour && !out.sevenDay && !out.scopedWeekly.length) return null;
  out.sinceCostUsd = Math.round(sinceCostUsd * 100) / 100;
  return out;
}

// Merge an estimate over a raw cache entry → a cache-SHAPED view the pool
// decision logic consumes unchanged. Estimated buckets replace their raw
// counterparts; buckets the estimator abstained on keep the raw reading.
function overlayCache(rawCache, est) {
  if (!est) return rawCache;
  const out = { ...(rawCache || {}) };
  if (est.fiveHour) out.fiveHour = est.fiveHour;
  if (est.sevenDay) out.sevenDay = est.sevenDay;
  if (est.scopedWeekly?.length) {
    const raw = Array.isArray(out.scopedWeekly) ? [...out.scopedWeekly] : [];
    for (const e of est.scopedWeekly) {
      const i = raw.findIndex((x) => scopedKey(x?.name) === scopedKey(e.name));
      if (i >= 0) raw[i] = e; else raw.push(e);
    }
    out.scopedWeekly = raw;
  }
  out.estimated = true;
  return out;
}

// Predicted utilizations at a NEW anchor's time, from the PREVIOUS anchor +
// its recorded costSince — the calibration half of the design (predicted vs
// actual logged into the anchor record itself, offline-analyzable forever).
// Reset-crossed buckets are skipped (prediction across a roll is a different
// model — don't pollute the calibration record with it).
function predictCalib(prevAnchor, newBuckets, rates, costSince, spanSec = 0) {
  if (!prevAnchor?.buckets || !newBuckets || !rates || !costSince) return null;
  const out = {};
  const one = (key, b0, b1) => {
    const r = rates[key];
    if (!r || !b0 || !b1) return;
    const u0 = normU(b0.u), act = normU(b1.u);
    if (u0 == null || act == null) return;
    // Honesty guards (2.267.0 — the calib stream carried p100/a0 rows across
    // 5h rolls and p5/a100 banner marks, drowning the real error signal it
    // exists to expose): mirror extractPairs — at-cap readings carry no
    // prediction information; a one-sided/absent resetsAt disarms the
    // roll-crossing guard (skip those pairs outright — calib prefers
    // precision over coverage); a span exceeding the window length has
    // definitionally crossed a reset.
    if (u0 >= 0.995 || act >= 0.995) return;
    const r0 = Number(b0.resetsAt) || 0, r1 = Number(b1.resetsAt) || 0;
    if (!r0 || !r1) return;
    if (Math.abs(r0 - r1) > 120) return;
    if (spanSec && spanSec > (key === 'fiveHour' ? 5 * 3600 : WEEK_SEC)) return;
    const c = costForKey(key, costSince);
    if (c == null) return;
    const pred = Math.min(1.2, u0 + r.rate * c);
    out[key] = { pred: Math.round(pred * 10000) / 10000, act, err: Math.round((pred - act) * 10000) / 10000 };
  };
  one('fiveHour', prevAnchor.buckets.fiveHour, newBuckets.fiveHour);
  one('sevenDay', prevAnchor.buckets.sevenDay, newBuckets.sevenDay);
  for (const s1 of newBuckets.scopedWeekly || []) {
    const s0 = (prevAnchor.buckets.scopedWeekly || []).find((x) => scopedKey(x.name) === scopedKey(s1.name));
    if (s0) one(scopedKey(s1.name), s0, s1);
  }
  return Object.keys(out).length ? out : null;
}

// Stateful wrapper the server owns: anchor-file reading (mtime-cached), rate
// memoization with explicit invalidation on new anchors, a 30s estimate memo
// (the taskbar polls /api/usage every 8s), and a rates.json snapshot for
// offline inspection. All reads are read-only — NEVER instantiate anything
// that scans/advances ledger cursors here.
class UsageEstimator {
  constructor({ anchorsDir, usageHistory, resolveIdentity, priorsFor }) {
    this.dir = anchorsDir;
    // May be the object OR a () => object thunk — server.js constructs this
    // estimator far above usageHistory's declaration (TDZ), so it passes a
    // lazy ref; everything here only dereferences at call time.
    this._usageHistory = usageHistory;
    this.resolveIdentity = resolveIdentity; // (accountId|null) → {identityKey} | null
    this.priorsFor = priorsFor || (() => CLAUDE_MAX_PRIOR_FULL_USD);
    this._lineCache = new Map();  // identityKey → {mtimeMs, size, lines}
    this._rateCache = new Map();  // identityKey → {rates, at}
    this._estMemo = new Map();    // accountId|'__global__' → {at, est}
    // LIVE odometer ring (event-driven estimation, user-designed 2026-08-09
    // after exhaustion #2): every usage record seen on a session's stdout is
    // noted HERE the moment it streams — before the transcript flushes and
    // long before the ledger scan absorbs it. estimateFor adds ring entries
    // the ledger hasn't caught up to yet (rid-deduped against the ledger's
    // own rid set, so nothing double-counts once the scan lands).
    this._liveRing = []; // {rid, acct, fam, usd, ts}
  }
  noteLive({ rid, accountId, model, usd, cwUsd = 0, ts = Date.now() }) {
    if (!rid || !Number.isFinite(usd) || usd <= 0) return;
    if (!this._liveRids) this._liveRids = new Map(); // rid → ring entry
    // A streamed message is emitted SEVERAL times with GROWING usage (partial
    // → final; measured up to 3 emissions per msg.id) — the LAST emission is
    // the complete request, so a re-note of a known rid updates the entry to
    // the max instead of being dropped (first-wins under-counted the live
    // part). File-tail feeders re-reading ranges stay idempotent either way.
    const prev = this._liveRids.get(rid);
    if (prev) { if (usd > prev.usd) { prev.usd = usd; prev.cwUsd = Math.max(prev.cwUsd || 0, cwUsd || 0); this._estMemo.clear(); } return; }
    const m = String(model || '').toLowerCase();
    const fam = m.includes('fable') ? 'fable' : m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : 'other';
    const entry = { rid, acct: accountId || '__global__', fam, usd, cwUsd: Number(cwUsd) || 0, ts };
    this._liveRids.set(rid, entry);
    this._liveRing.push(entry);
    if (this._liveRing.length > 3000) {
      this._liveRing.splice(0, this._liveRing.length - 2000);
      this._liveRids = new Map(this._liveRing.map((e) => [e.rid, e]));
    }
    // freshest signal there is — estimates must not serve a pre-burn memo
    this._estMemo.clear();
  }
  // Un-ledgered live cost for a set of account ids within [fromMs, nowMs] —
  // entries whose rid the ledger ALREADY holds are skipped (scan caught up).
  _liveDelta(accountIds, fromMs, nowMs) {
    if (!this._liveRing.length) return null;
    const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory;
    const known = uh?._evCache?.rids || null;
    // THE 2.267.3 est-2× root cause: STDOUT stream records carry NO requestId,
    // so ring entries are keyed by msg.id ('msg_…') while ledger events are
    // keyed by requestId ('req_…') — `known.has(rid)` could NEVER exclude a
    // scanned entry, and every request counted TWICE while a conversation was
    // active (user saw est 27% vs ⟳ 9%). The ledger now bakes `mid`
    // (message.id) alongside rid; exclusion checks BOTH id spaces.
    const knownMids = uh?._evCache?.mids || null;
    const want = new Set(accountIds);
    // No age-out: ledger-dedup is the ONLY exit — an age cutoff made
    // un-scanned cost vanish from the estimate after N minutes (a dip
    // exactly when the scan lags worst); the ring cap bounds memory instead.
    const out = { total: 0, byFamily: { fable: 0, opus: 0, sonnet: 0, haiku: 0, other: 0 }, byClass: { cw: 0, other: 0 } };
    for (const e of this._liveRing) {
      if (e.ts < fromMs || e.ts > nowMs) continue;
      if (!want.has(e.acct)) continue;
      if (known && known.has(e.rid)) continue;
      if (knownMids && knownMids.has(e.rid)) continue;
      out.total += e.usd; out.byFamily[e.fam] += e.usd;
      const cw = Number(e.cwUsd) || 0;
      out.byClass.cw += cw; out.byClass.other += Math.max(0, e.usd - cw);
    }
    return out.total > 0 ? out : null;
  }
  _file(key) { return path.join(this.dir, 'anchors-' + String(key).replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); }
  lines(identityKey) {
    const fp = this._file(identityKey);
    let st; try { st = fs.statSync(fp); } catch { return []; }
    const c = this._lineCache.get(identityKey);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.lines;
    let lines = [];
    try {
      lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { }
    lines.sort((a, b) => (a.fetchedAt || 0) - (b.fetchedAt || 0));
    this._lineCache.set(identityKey, { mtimeMs: st.mtimeMs, size: st.size, lines });
    return lines;
  }
  // Every account id this identity has EVER anchored under — ledger events
  // for removed/re-added subs live under their old ids. '__global__' is the
  // ONE reassignable id (a machine /login switch hands it to a DIFFERENT
  // identity): historical anchor lines must not union it in forever, or
  // identity X's odometer counts identity Y's post-switch machine-login spend
  // — it joins only via `extra` (the CURRENT identity-group mapping).
  accountIdsFor(identityKey, extra = []) {
    const ids = new Set(extra.filter(Boolean));
    for (const l of this.lines(identityKey)) {
      if (l.accountId !== undefined && l.accountId !== null && l.accountId !== '__global__') ids.add(l.accountId);
    }
    if (!ids.size) ids.add('__global__');
    return [...ids];
  }
  ratesFor(identityKey) {
    // TTL 10min (not only invalidate-on-anchor): the LEDGER keeps backfilling
    // between anchors (late-scanned workflow transcripts), and learn-time
    // live-cost recomputation should see it without waiting for a new anchor.
    const c = this._rateCache.get(identityKey);
    if (c && Date.now() - c.at < 600000) return c.rates;
    const lines = this.lines(identityKey);
    // learn-time LIVE cost recomputation (see extractPairs) — the frozen
    // costSince snapshots under-count fast burns whose ledger events land
    // after the sweep; the live ledger heals them retroactively.
    const rates = learnRates(lines, { priors: this.priorsFor(identityKey), costFn: this._costFn(this.accountIdsFor(identityKey)) });
    this._rateCache.set(identityKey, { rates, at: Date.now() });
    this._persistRates(identityKey, rates, lines.length);
    return rates;
  }
  invalidate(identityKey) { this._rateCache.delete(identityKey); this._lineCache.delete(identityKey); this._estMemo.clear(); }
  _persistRates(identityKey, rates, nAnchors) {
    try {
      const fp = path.join(this.dir, 'rates.json');
      let all = {}; try { all = JSON.parse(fs.readFileSync(fp, 'utf-8')) || {}; } catch { }
      all[identityKey] = { computedAt: Date.now(), nAnchors, buckets: rates };
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(fp + '.tmp', JSON.stringify(all, null, 1)); fs.renameSync(fp + '.tmp', fp);
    } catch { }
  }
  _costFn(accountIds) {
    const { costBetweenMulti } = require('./usage-anchors.js');
    const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory;
    return (fromMs, toMs) => {
      const c = costBetweenMulti(uh, accountIds, fromMs, toMs);
      // + streamed-but-not-yet-ledgered records (the live odometer): closes
      // the transcript-flush + scan-lag blind window during fast burns.
      const live = this._liveDelta(accountIds, fromMs, toMs);
      if (live) {
        c.total += live.total;
        for (const k of Object.keys(live.byFamily)) c.byFamily[k] = (c.byFamily[k] || 0) + live.byFamily[k];
        if (live.byClass) {
          c.byClass = c.byClass || { cw: 0, other: 0 };
          c.byClass.cw += live.byClass.cw; c.byClass.other += live.byClass.other;
        }
      }
      return c;
    };
  }
  // Estimated bucket view for one account NOW (memo 30s). rawCache is only a
  // freshness reference: when the cache reading is NEWER than the last anchor
  // (sweep lag ≤60s), the cache itself is the better base — build a pseudo-
  // anchor from it rather than estimating from the stale anchor.
  estimateFor(accountId, rawCache, nowMs = Date.now()) {
    const memoKey = accountId || '__global__';
    const m = this._estMemo.get(memoKey);
    // Memo is stale the moment FRESHER ground truth exists (rawCache newer
    // than what the memo was computed against) — a frozen estimate vs an
    // advancing reading (a) trips estDisplayPair's est<reading roll rule into
    // a false "window reset" collapse, and (b) MASKS a limit-banner mark
    // (utilization 1, fetchedAt now) so the pool's immediate switch reads
    // 85%-ish instead of dead and stays put (adversarial-review major).
    if (m && nowMs - m.at < 30000 && !(rawCache?.fetchedAt > (m.baseFetchedAt || 0))) return m.est;
    let est = null, baseFetchedAt = 0;
    try {
      const ident = this.resolveIdentity(accountId);
      if (ident?.identityKey) {
        let anchor = null;
        const lines = this.lines(ident.identityKey);
        if (lines.length) anchor = lines[lines.length - 1];
        if (rawCache?.fetchedAt && (!anchor || rawCache.fetchedAt > anchor.fetchedAt)) {
          anchor = {
            fetchedAt: rawCache.fetchedAt,
            buckets: {
              fiveHour: rawCache.fiveHour ? { u: rawCache.fiveHour.utilization, resetsAt: rawCache.fiveHour.resetsAt } : null,
              sevenDay: rawCache.sevenDay ? { u: rawCache.sevenDay.utilization, resetsAt: rawCache.sevenDay.resetsAt } : null,
              scopedWeekly: (rawCache.scopedWeekly || []).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt, asOf: rawCache.scopedFetchedAt || undefined })),
            },
          };
        }
        if (anchor) {
          baseFetchedAt = anchor.fetchedAt;
          const rates = this.ratesFor(ident.identityKey);
          const accountIds = this.accountIdsFor(ident.identityKey, [accountId || '__global__']);
          est = estimateBuckets({ anchor, rates, costFn: this._costFn(accountIds), nowMs });
        }
      }
    } catch { est = null; }
    this._estMemo.set(memoKey, { at: nowMs, est, baseFetchedAt });
    return est;
  }
}

module.exports = {
  PRIOR_WEIGHT_DU, CLAUDE_MAX_PRIOR_FULL_USD,
  normU, scopedKey, scopedFamily, costForKey,
  extractPairs, learnRates, estimateBuckets, overlayCache, predictCalib,
  UsageEstimator,
};
