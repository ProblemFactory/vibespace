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
const { resetLanded, withOwnAbsence } = require('./quota-model.js');
const { evictIdle, cacheRow, ESTIMATOR_LINES_MAX_BYTES, ESTIMATOR_LINES_IDLE_MS, ESTIMATOR_LIVE_MAX_BYTES } = require('./cache-bounds.js'); // PURE (B-9428)

// Δu-equivalent weight of the prior pseudo-observation.
const PRIOR_WEIGHT_DU = 0.15;
// Measured Max-20x full-quota sizes in API-equivalent USD (see header).
const CLAUDE_MAX_PRIOR_FULL_USD = { fiveHour: 500, sevenDay: 1730, 'scoped:fable': 875 };
// 5h TOKEN-CLASS priors (B-536b; 3-class since 2.268.1): the 5h bucket
// weights each token class differently from our $ pricing — cache WRITES
// burn ~half per $, cache READS are nearly FREE (incremental caching makes
// cr-dominated windows: real-data fit cw ~$443 / cr ~$2556 / fresh ~$185).
// Three pure-class pseudo-pairs seed the regression; real data dominates
// quickly (PRIOR_WEIGHT_DU each).
const PRIOR_5H_CW_FULL_USD = 500;
const PRIOR_5H_CR_FULL_USD = 3000;
const PRIOR_5H_FRESH_FULL_USD = 200;
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
// THE PAIRS, A SLICE AT A TIME (lane usage-relearn-stepped): extractPairs is one ordered pass over the lines — its only state
// is the pairs so far and the taint sets — so it is ONE generator that yields after every `step` lines; the synchronous
// extractPairs drives it to its end. A stepped relearn (UsageEstimator._relearn) drives the same generator a slice a turn:
// the same lines in the same order, the same additions — the same bits.
function extractPairs(lines, opts = {}) { const g = _extractPairsSteps(lines, opts); for (;;) { const r = g.next(); if (r.done) return r.value; } }
function* _extractPairsSteps(lines, opts = {}, step = Infinity) {
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
  const add = (key, du, cost, cls = null) => { (out[key] = out[key] || []).push(cls ? { du, cost, cw: cls.cw, cr: cls.cr, ot: cls.ot } : { du, cost }); };
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
  let inSlice = 0;
  for (const l of lines || []) {
    if (++inSlice > step) { inSlice = 1; yield; } // a slice ends here: the loop is handed back (the state above is the fold's)
    if (!l || !l.prevFetchedAt || !l.costSince) continue;
    if (distinctIds.size > 1 && !Array.isArray(l.accountIds)) continue; // legacy under-counted pair
    const base = byFetched.get(l.prevFetchedAt);
    if (!base || !base.buckets || !l.buckets) continue;
    // OFFLINE-GAP exclusion (2.297.0, design §Cross-device): either side
    // recorded while a tainted source was ACTIVE-DARK ⇒ the pair's Δu is real
    // but its cost is missing that machine's spend — learning from it teaches
    // a falsely HOT rate (the exact multi-device bias this stack exists to
    // absorb, now excluded instead of averaged in).
    if ((Array.isArray(l.dark) && l.dark.length) || (Array.isArray(base.dark) && base.dark.length)) continue;
    // ① SOURCE LINEAGE (2.340.0 audit): endpoints from different reading
    // channels (statusline vs cli-panel vs get_usage vs banner) carry an
    // unknown inter-source offset — the Δu of a cross-source pair includes
    // that step and teaches phantom rates. Pairs must be same-source.
    if ((base.source || 'unknown') !== (l.source || 'unknown')) continue;
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
      // ① UNCORROBORATED JUMP (2.340.0 audit: 11-13pt steps inside 1-minute
      // windows with near-zero cost — cache-file/source discontinuities and
      // unattributed burn, both poison): a big Δu whose ledger cost is under
      // 20% of what the measured Max-20x priors say that movement costs is
      // not rate information. Taint like the anomalous decrease so the
      // recovery pair off this anchor is skipped too.
      if (du >= 0.05) {
        const full = CLAUDE_MAX_PRIOR_FULL_USD[key] || CLAUDE_MAX_PRIOR_FULL_USD.sevenDay;
        const corroborating = costForKey(key, (liveCost && liveCost.total > 0) ? liveCost : l.costSince);
        if (corroborating != null && corroborating < du * full * 0.2) {
          (tainted[key] = tainted[key] || new Set()).add(l.fetchedAt);
          return;
        }
      }
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
      const bc = src.byClass;
      const cls = key === 'fiveHour' && bc && Number.isFinite(Number(bc.cw)) && Number.isFinite(Number(bc.cr))
        ? { cw: Number(bc.cw) || 0, cr: Number(bc.cr) || 0, ot: Math.max(0, cost - (Number(bc.cw) || 0) - (Number(bc.cr) || 0)) } : null;
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
function learnRates(lines, { priors = null, costFn = null } = {}) { return _fitRates(extractPairs(lines, { costFn }), priors); }
/** The fit over the extracted pairs (per bucket: the sums; the 5h token-class normal equations) — a fold in the pairs' order,
 *  run whole at the end of a relearn (≈ 10 ns a pair: under a millisecond for the owner's largest identity). */
function _fitRates(pairs, priors = null) {
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
      const cls = (pairs[key] || []).filter((p) => Number.isFinite(p.cw) && Number.isFinite(p.cr));
      if (cls.length >= 3) {
        const obs = [
          ...cls.map((p) => [p.cw, p.cr, p.ot, p.du]),
          [PRIOR_WEIGHT_DU * PRIOR_5H_CW_FULL_USD, 0, 0, PRIOR_WEIGHT_DU],
          [0, PRIOR_WEIGHT_DU * PRIOR_5H_CR_FULL_USD, 0, PRIOR_WEIGHT_DU],
          [0, 0, PRIOR_WEIGHT_DU * PRIOR_5H_FRESH_FULL_USD, PRIOR_WEIGHT_DU],
        ];
        // 3-var normal equations, Cramer solve
        const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Bv = [0, 0, 0];
        for (const [x0, x1, x2, y] of obs) {
          const x = [x0, x1, x2];
          for (let i = 0; i < 3; i++) { Bv[i] += x[i] * y; for (let j = 0; j < 3; j++) A[i][j] += x[i] * x[j]; }
        }
        const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        const D = det3(A);
        if (Number.isFinite(D) && Math.abs(D) > 1e-9) {
          const rep = (m, col, v) => m.map((row, i) => row.map((x, j) => (j === col ? v[i] : x)));
          const [a, b, c2] = [0, 1, 2].map((col) => det3(rep(A, col, Bv)) / D);
          // positivity + per-class sanity bounds — a negative/absurd
          // coefficient = ill-conditioned mix, keep blended. cr legitimately
          // fits huge implied fulls (reads are nearly free), wider bound.
          const okA = Number.isFinite(a) && a > 1 / 20000 && a < 1 / 40;
          const okB = Number.isFinite(b) && b > 1 / 100000 && b < 1 / 100;
          const okC = Number.isFinite(c2) && c2 > 1 / 20000 && c2 < 1 / 40;
          if (okA && okB && okC) {
            out[key].rateCw = a;
            out[key].rateCr = b;
            out[key].rateFresh = c2;
            out[key].impliedFullCwUsd = Math.round(10 / a) / 10;
            out[key].impliedFullCrUsd = Math.round(10 / b) / 10;
            out[key].impliedFullFreshUsd = Math.round(10 / c2) / 10;
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
function estimateBuckets({ anchor, rates, costFn, nowMs, lagS = 20 }) {
  if (!anchor || !anchor.buckets || !rates || !costFn) return null;
  const costMemo = new Map();
  const cost = (fromMs) => {
    if (!costMemo.has(fromMs)) { try { costMemo.set(fromMs, costFn(fromMs, nowMs) || { total: 0, byFamily: {} }); } catch { costMemo.set(fromMs, { total: 0, byFamily: {} }); } }
    return costMemo.get(fromMs);
  };
  let sinceCostUsd = 0;
  // ③ LEDGER TAIL (2.340.0 audit): the transcript scan is throttled (~15s)
  // and writes lag the requests, so at predict time the last ~LAG seconds of
  // burn are not in the ledger yet — during a fast burst that's a standing
  // under-estimate. Extrapolate the missing tail at the trailing 120s burn
  // rate; idle accounts have a zero trail and are untouched.
  let trailMemo = null;
  const trail = () => {
    if (trailMemo === null) { try { trailMemo = costFn(nowMs - 120000, nowMs) || { total: 0 }; } catch { trailMemo = { total: 0 }; } }
    return trailMemo;
  };
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
      // NOT LANDED YET (B-a4f1): a stated reset is minute-precise, so for
      // RESET_GRACE_SEC after it the window may still be the old one. Abstain:
      // the overlay keeps the raw bucket and `bucketRemaining` applies the same
      // grace to it. Re-basing here handed the pool a 0 % Fable bucket 15 s after
      // a panel's "8:59am" (true reset 16:00:00Z) — 2026-09-18 15:59:15Z, nine
      // conversations moved onto Personal Max and the vendor rejected them.
      if (!resetLanded(resetSec, nowMs / 1000)) return null; // THE one inequality (quota-model resetLanded, lane pool-silent-members R4)
      // new weekly window(s): re-base at the last reset boundary whose grace
      // has passed — a LATER boundary still inside its landing minute stays
      // this window's (stated) reset, and `bucketRemaining` applies the grace
      // to it (verify r1: an anchor a week old crossed the first boundary and
      // rolled the next one on its bare stated instant)
      while (resetLanded(resetSec, nowMs / 1000)) { fromMs = resetSec * 1000; resetSec += WEEK_SEC; }
      baseU = 0;
    }
    let c = costForKey(key, cost(fromMs));
    if (c == null) return null;
    if (lagS > 0) {
      const trailC = costForKey(key, trail());
      if (trailC != null && trailC > 0) c += (trailC / 120) * lagS;
    }
    sinceCostUsd = Math.max(sinceCostUsd, (cost(fromMs).total || 0));
    // 5h class-aware prediction (B-536b): when the regression produced class
    // rates AND the cost source carries the split, predict per component —
    // the blended rate stays the fallback (pre-B-536b snapshots, degenerate
    // regressions).
    let du;
    const bc = cost(fromMs).byClass;
    if (key === 'fiveHour' && r.rateCw != null && r.rateCr != null && r.rateFresh != null
        && bc && Number.isFinite(Number(bc.cw)) && Number.isFinite(Number(bc.cr))) {
      const cw = Number(bc.cw) || 0, cr = Number(bc.cr) || 0;
      du = r.rateCw * cw + r.rateCr * cr + r.rateFresh * Math.max(0, c - cw - cr);
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

// THE BURN (B-f69c ③, 2026-09-23): how fast each bucket is moving RIGHT NOW,
// in utilization (0..1) per MINUTE — the learned rate × the ledger cost of the
// trailing window (the live odometer included, through the caller's costFn).
// It is what turns an estimate of NOW into a projection of LATER: the pool's
// early move and the auto-cli fast rung both ask "does this bucket cross its
// line before the next reading lands", and only the burn can answer that. The
// 5h bucket uses the class-aware coefficients when the regression produced
// them (the same rule estimateBuckets predicts with); a bucket with no rate or
// no cost in the window has NO burn entry (absent = no claim, never 0 by
// default — a projection must not rest on a number nobody measured).
// B3: THE RELEARN SPREAD — ratesFor's 10-minute TTL, spread ±25 % per identity by a hash of its key (the same identity keeps
// its own TTL): the identities first learned together at a boot fall due across ~5 minutes, never all in one pass
const RELEARN_STEP_LINES = 2000; // a loop turn's relearn budget (the asks + the scheduler share it): ≈ 16 ms at the owner's shape (8 µs a pair, the lane bench)
const RELEARN_CHUNK_LINES = 250; // the grain a fold is costed in inside a turn
// THE TAIL READ'S PROOF (round 2, MUST 1): a grown anchor file is read by its tail only when the bytes already cached are
// still there — the same file (inode + birth time: a tmp + rename, a delete + re-create, another file taking the inode all
// change it) and every proof window read back equal (the cached region's first and last 64 bytes and 8 spread across it, +
// each tail's first and last: an in-place rewrite shifts or changes them). Anything else is read whole.
const PROOF_WIN = 64, PROOF_SAMPLES = 8, PROOF_MAX = 24;
/** A file's signature: what a reader may trust for «unchanged» without its bytes (round 3, small 2: ctime moves with every
 *  write and cannot be set back — a same-size rewrite with the mtime restored is not «unchanged»). */
const sigOf = (st) => st ? `${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.birthtimeMs || 0}` : 'absent';
/** What the account walk and the estimate need of an identity's lines (round 3 — kept per identity, tiny, whether or not the
 *  cache keeps the lines): its named account ids, the last record by fetchedAt, the newest ts and the newest __global__ ts. */
function linesMeta(lines) {
  const named = new Set(); let lastGlobalTs = 0, lastTs = 0;
  for (const l of lines) {
    const ts = l.ts || l.fetchedAt || 0;
    if (ts > lastTs) lastTs = ts;
    if (l.accountId === undefined || l.accountId === null || l.accountId === '__global__') { if (ts > lastGlobalTs) lastGlobalTs = ts; }
    else named.add(l.accountId);
  }
  return { named: [...named], lastGlobalTs, lastTs, last: lines.length ? lines[lines.length - 1] : null, n: lines.length };
}
const BASIS_HOLD_MAX_MS = 60000; // round 4b: a member's first learn holds its pool's basis raw at most this long (a throw: not at all)
const COLD_READ_TURN_BYTES = 4 * 1024 * 1024; // round 3: cold anchor files read whole in one loop turn stop opening past this (≈ 35 ms of parse; the turn's FIRST cold read is never deferred, whatever its size)
const FOLD_RETRY_MS = 5000, FOLD_RETRY_MAX_MS = 5 * 60e3; // a fold that THROWS (a malformed record): said once, tried again after 5 s doubling ≤ 5 min
/** `n` + 2 windows of [from, to) — its first and last PROOF_WIN bytes and n spread between — from `buf` (= the bytes of [from, to)). */
function proofWindows(buf, from, to, n) {
  const out = []; if (to <= from) return out;
  const at = (o) => { const a = Math.max(from, Math.min(o, to - PROOF_WIN)), b = Math.min(to, a + PROOF_WIN); out.push([a, Buffer.from(buf.subarray(a - from, b - from))]); };
  at(from); for (let k = 1; k <= n; k++) at(from + Math.floor(((to - from) * k) / (n + 1))); at(to - PROOF_WIN);
  return out;
}
function rateTtlMs(identityKey) {
  let h = 2166136261; const k = String(identityKey || '');
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return Math.round(600000 * (0.75 + 0.5 * (h / 4294967296)));
}
const BURN_WINDOW_MS = 10 * 60e3;
function burnRates({ rates, costFn, nowMs, windowMs = BURN_WINDOW_MS }) {
  if (!rates || !costFn || !(windowMs > 0)) return {};
  let c = null;
  try { c = costFn(nowMs - windowMs, nowMs) || null; } catch { c = null; }
  if (!c || !(Number(c.total) > 0)) return {};
  const min = windowMs / 60e3;
  const out = {};
  for (const key of Object.keys(rates)) {
    const r = rates[key];
    if (!r || !(r.rate > 0)) continue;
    const cost = costForKey(key, c);
    if (cost == null || !(cost > 0)) continue;
    let du;
    const bc = c.byClass;
    if (key === 'fiveHour' && r.rateCw != null && r.rateCr != null && r.rateFresh != null && bc && Number.isFinite(Number(bc.cw)) && Number.isFinite(Number(bc.cr))) {
      const cw = Number(bc.cw) || 0, cr = Number(bc.cr) || 0;
      du = r.rateCw * cw + r.rateCr * cr + r.rateFresh * Math.max(0, cost - cw - cr);
    } else du = r.rate * cost;
    if (du > 0) out[key] = du / min;
  }
  return out;
}

// Merge an estimate over a raw cache entry → a cache-SHAPED view the pool
// decision logic consumes unchanged. Estimated buckets replace their raw
// counterparts; buckets the estimator abstained on keep the raw reading.
function overlayCache(rawCache, est) {
  if (!est) return rawCache;
  const out = { ...(rawCache || {}) };
  // AN ESTIMATE MAY NOT OVERWRITE "THIS WINDOW HAS NOT STARTED" (B-8b12). The
  // raw bucket's `empty` is a measurement taken NOW; every anchor an estimate
  // is built from is older, and extrapolating cost into a window the vendor
  // says nobody has opened would hand the pool a fabricated utilization AND a
  // sliding reset dressed up as a deadline. The estimator abstains here rather
  // than the raw reading losing.
  const emptyRaw = (b) => b && typeof b === 'object' && b.state === 'empty';
  if (est.fiveHour && !emptyRaw(out.fiveHour)) out.fiveHour = est.fiveHour;
  if (est.sevenDay && !emptyRaw(out.sevenDay)) out.sevenDay = est.sevenDay;
  if (est.scopedWeekly?.length) {
    const raw = Array.isArray(out.scopedWeekly) ? [...out.scopedWeekly] : [];
    for (const e of est.scopedWeekly) {
      const i = raw.findIndex((x) => scopedKey(x?.name) === scopedKey(e.name));
      if (i >= 0) { if (!emptyRaw(raw[i])) raw[i] = e; } else raw.push(e);
    }
    out.scopedWeekly = raw;
  }
  out.estimated = true;
  // …and a bucket the member's OWN reading tombstoned is never overlaid back (lane no-5h-window r5): the view is a
  // reader of the member's buckets like any other (quotaModel.withOwnAbsence, the one accessor)
  return withOwnAbsence(out, rawCache);
}

// «NO 5h LIMIT» IS THE MEMBER'S OWN (lane no-5h-window r5, acceptance r4 #1). An anchor is the IDENTITY's: the sweep
// records the identity group's freshest file, which may be a SIBLING's still holding a 5h window — so the estimate is
// a READER of the member's buckets like any other, and a bucket the member's own reading tombstoned is never estimated
// back (quotaModel.withOwnAbsence). Null when nothing estimated is left (the no-estimate road: the reading stands).
function ownEstimate(est, rawCache) {
  const out = withOwnAbsence(est, rawCache);
  return out !== est && !out.sevenDay && !(out.scopedWeekly && out.scopedWeekly.length) ? null : out;
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
    // DELTA-RELATIVE is the honest accuracy measure (owner-corrected,
    // 2.368.13): absolute |pred−act| shrinks with refresh cadence alone —
    // refresh every minute and any model looks perfect. What the model
    // actually claims is the MOVEMENT (rate × cost), so record predicted vs
    // actual Δu and their ratio; rel is null when the window barely moved
    // (|actΔ| < 2pt ⇒ the ratio is noise division, not signal).
    const predDu = Math.round((pred - u0) * 10000) / 10000;
    const actDu = Math.round((act - u0) * 10000) / 10000;
    out[key] = {
      pred: Math.round(pred * 10000) / 10000, act, err: Math.round((pred - act) * 10000) / 10000,
      u0: Math.round(u0 * 10000) / 10000, predDu, actDu,
      rel: Math.abs(actDu) >= 0.02 ? Math.round((predDu / actDu) * 1000) / 1000 : null,
    };
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
  constructor({ anchorsDir, usageHistory, resolveIdentity, priorsFor, lagS }) {
    this.dir = anchorsDir;
    // May be the object OR a () => object thunk — server.js constructs this
    // estimator far above usageHistory's declaration (TDZ), so it passes a
    // lazy ref; everything here only dereferences at call time.
    this._usageHistory = usageHistory;
    this.resolveIdentity = resolveIdentity; // (accountId|null) → {identityKey} | null
    this.priorsFor = priorsFor || (() => CLAUDE_MAX_PRIOR_FULL_USD);
    this.lagS = lagS == null ? 20 : lagS; // ledger-tail extrapolation seconds (0 = off, exact-math tests)
    this._lineCache = new Map();  // identityKey → {mtimeMs, size, lines} — LRU by file bytes (B-9428, cache-bounds.js)
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
  noteLive({ rid, accountId, model, usd, cwUsd = 0, crUsd = 0, ts = Date.now() }) {
    if (!rid || !Number.isFinite(usd) || usd <= 0) return;
    if (!this._liveRids) this._liveRids = new Map(); // rid → ring entry
    // A streamed message is emitted SEVERAL times with GROWING usage (partial
    // → final; measured up to 3 emissions per msg.id) — the LAST emission is
    // the complete request, so a re-note of a known rid updates the entry to
    // the max instead of being dropped (first-wins under-counted the live
    // part). File-tail feeders re-reading ranges stay idempotent either way.
    const prev = this._liveRids.get(rid);
    if (prev) { if (usd > prev.usd) { prev.usd = usd; prev.cwUsd = Math.max(prev.cwUsd || 0, cwUsd || 0); prev.crUsd = Math.max(prev.crUsd || 0, crUsd || 0); this._estMemo.clear(); } return; }
    const m = String(model || '').toLowerCase();
    const fam = m.includes('fable') ? 'fable' : m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : 'other';
    const entry = { rid, acct: accountId || '__global__', fam, usd, cwUsd: Number(cwUsd) || 0, crUsd: Number(crUsd) || 0, ts };
    this._liveRids.set(rid, entry);
    const ring = this._liveRing, last = ring[ring.length - 1];
    if (last && !(entry.ts >= last.ts)) this._liveOutOfOrder = true; // the range search below needs the ring in ts order
    ring.push(entry);
    if (ring.length > 3000) {
      ring.splice(0, ring.length - 2000);
      this._liveRids = new Map(ring.map((e) => [e.rid, e]));
      this._liveOutOfOrder = ring.some((e, i) => i > 0 && !(e.ts >= ring[i - 1].ts));
    }
    // freshest signal there is — estimates must not serve a pre-burn memo
    this._estMemo.clear();
  }
  // Un-ledgered live cost for a set of account ids within [fromMs, nowMs] —
  // entries whose rid the ledger ALREADY holds are skipped (scan caught up).
  _liveDelta(accountIds, fromMs, nowMs) {
    if (!this._liveRing.length) return null;
    const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory;
    // B-9428: the ledger answers by id (its hot ids + the cold rows' hashes) — no resident Set of every id ever
    const knows = typeof uh?.ledgerKnowsId === 'function' ? (id) => uh.ledgerKnowsId(id) : null;
    const known = knows ? null : uh?._evCache?.rids || null;
    // THE 2.267.3 est-2× root cause: STDOUT stream records carry NO requestId,
    // so ring entries are keyed by msg.id ('msg_…') while ledger events are
    // keyed by requestId ('req_…') — `known.has(rid)` could NEVER exclude a
    // scanned entry, and every request counted TWICE while a conversation was
    // active (user saw est 27% vs ⟳ 9%). The ledger now bakes `mid`
    // (message.id) alongside rid; exclusion checks BOTH id spaces.
    const knownMids = knows ? null : uh?._evCache?.mids || null;
    const want = new Set(accountIds);
    // No age-out: ledger-dedup is the ONLY exit — an age cutoff made
    // un-scanned cost vanish from the estimate after N minutes (a dip
    // exactly when the scan lags worst); the ring cap bounds memory instead.
    const out = { total: 0, byFamily: { fable: 0, opus: 0, sonnet: 0, haiku: 0, other: 0 }, byClass: { cw: 0, cr: 0, other: 0 } };
    // THE RING BY RANGE (hotfix usage-ledger-walk ③ — the full ring, up to 3 000 entries, was scanned on every costFn call:
    // per anchor pair in a relearn, per bucket per member per conversation in a pool evaluation, and the ring only fills
    // with uptime): in ts order the entries in [from, now] are ONE block — found by binary search, walked in ring order
    // (the same entries, the same sums); an interval outside the ring's span is answered at once. A ring noted out of
    // order keeps the whole scan.
    const ring = this._liveRing;
    let lo = 0, hi = ring.length;
    if (!this._liveOutOfOrder) {
      if (!(ring[ring.length - 1].ts >= fromMs) || !(ring[0].ts <= nowMs)) return null;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ring[m].ts < fromMs) lo = m + 1; else hi = m; }
      hi = ring.length;
    }
    for (let i = lo; i < hi; i++) {
      const e = ring[i];
      if (!this._liveOutOfOrder && e.ts > nowMs) break;
      if (e.ts < fromMs || e.ts > nowMs) continue;
      if (!want.has(e.acct)) continue;
      if (knows && knows(e.rid)) continue;
      if (known && known.has(e.rid)) continue;
      if (knownMids && knownMids.has(e.rid)) continue;
      out.total += e.usd; out.byFamily[e.fam] += e.usd;
      const cw = Number(e.cwUsd) || 0, cr = Number(e.crUsd) || 0;
      out.byClass.cw += cw; out.byClass.cr += cr; out.byClass.other += Math.max(0, e.usd - cw - cr);
    }
    return out.total > 0 ? out : null;
  }
  _file(key) { return path.join(this.dir, 'anchors-' + String(key).replace(/[^\w.@-]/g, '_').slice(0, 80) + '.ndjson'); }
  lines(identityKey) {
    const fp = this._file(identityKey);
    let st; try { st = fs.statSync(fp); } catch { this._lastRead = { key: identityKey, sig: 'absent' }; if (this._meta) this._meta.delete(identityKey); return []; }
    const c = this._lineCache.get(identityKey);
    if (c && c.sig === sigOf(st)) { this._lineCache.delete(identityKey); this._lineCache.set(identityKey, c); c.usedAt = Date.now(); this._readDone(identityKey, st, c.lines, c.wins, c.endsNl); return c.lines; }
    const parse = (l) => { try { return JSON.parse(l); } catch { return null; } }, byAt = (a, b) => (a.fetchedAt || 0) - (b.fetchedAt || 0);
    let lines = null, wins = null;
    // APPENDED (lane usage-relearn-stepped — an anchor sweep appends one record and a relearn re-parsed the whole file: 11 286
    // lines on the loop for one record): only the new bytes are parsed — a NEW array (a fold in flight keeps the lines it began
    // with), sorted again only if a new line sorts before the last (the stable sort of the whole file's order: the same array a
    // full read gives). ROUND 2 (MUST 1 — two tmp + rename rewrites hand the inode back on ext4; an in-place truncate-and-grow
    // keeps it): ONLY ON PROVEN BYTES — the same inode AND birth time, and every proof window of the cached bytes read back
    // equal (PROOF_WIN bytes at the head, the end and spread between). Anything else — a rewrite, a shrink, a window that
    // differs — is read whole.
    if (c && c.wins && c.ino === st.ino && (c.btime || 0) === (st.birthtimeMs || 0) && st.size > c.size && c.endsNl) {
      let fd = null;
      try {
        fd = fs.openSync(fp, 'r');
        let proven = true;
        for (const [off, want] of c.wins) { const got = Buffer.alloc(want.length); if (fs.readSync(fd, got, 0, want.length, off) !== want.length || !got.equals(want)) { proven = false; break; } }
        if (!proven) this.tailRefused = (this.tailRefused || 0) + 1;
        else {
          const len = st.size - c.size, buf = Buffer.alloc(len); let got = 0;
          while (got < len) { const n = fs.readSync(fd, buf, got, len - got, c.size + got); if (!n) break; got += n; }
          const text = buf.toString('utf-8', 0, got);
          if (got === len && text.endsWith('\n')) {
            const add = text.split('\n').filter(Boolean).map(parse).filter(Boolean), last = c.lines.length ? (c.lines[c.lines.length - 1].fetchedAt || 0) : -Infinity;
            lines = c.lines.concat(add);
            let inOrder = true; for (let k = 0, prev = last; k < add.length; k++) { const t = add[k].fetchedAt || 0; if (t < prev) { inOrder = false; break; } prev = t; }
            if (!inOrder) lines.sort(byAt);
            const tw = proofWindows(buf, c.size, st.size, 2), base = c.wins.slice(0, PROOF_SAMPLES + 2), tails = c.wins.slice(PROOF_SAMPLES + 2).concat(tw);
            wins = base.concat(tails.slice(Math.max(0, tails.length - (PROOF_MAX - base.length))));
            this.tailReads = (this.tailReads || 0) + 1;
          }
        }
      } catch { lines = null; } finally { if (fd !== null) { try { fs.closeSync(fd); } catch { } } }
    }
    let endsNl = true;
    if (!lines) {
      lines = []; wins = [];
      try { const buf = fs.readFileSync(fp); const text = buf.toString('utf-8'); endsNl = !text.length || text.endsWith('\n'); lines = text.split('\n').filter(Boolean).map(parse).filter(Boolean); wins = proofWindows(buf, 0, buf.length, PROOF_SAMPLES); } catch { wins = null; }
      lines.sort(byAt);
      this.wholeReads = (this.wholeReads || 0) + 1;
      if (!this.wholeReadsOf) this.wholeReadsOf = new Map(); this.wholeReadsOf.set(identityKey, (this.wholeReadsOf.get(identityKey) || 0) + 1);
    }
    this._lineCache.delete(identityKey);
    this._lineCache.set(identityKey, { mtimeMs: st.mtimeMs, size: st.size, ino: st.ino, btime: st.birthtimeMs || 0, sig: sigOf(st), endsNl, lines, wins, usedAt: Date.now() });
    // r2 (verify #3/#11): every identity asked for in the last 30 min stays (a sweep reads each one — a byte
    // LRU under the live set re-parsed every file on the loop every sweep); the floor applies to idle ones
    const r = evictIdle(this._lineCache, { floorBytes: ESTIMATOR_LINES_MAX_BYTES, maxEntries: 256, idleMs: ESTIMATOR_LINES_IDLE_MS, liveMaxBytes: ESTIMATOR_LIVE_MAX_BYTES, ...(this.linesLiveMaxBytes ? { liveMaxBytes: this.linesLiveMaxBytes } : {}) /* a suite's scaled cap (round 3) */, now: Date.now(), sizeOf: (e) => e.size, usedAt: (e) => e.usedAt });
    this._lineBytes = r.bytes; this._lineLive = r.live; this._lineLiveEvicted = (this._lineLiveEvicted || 0) + r.liveEvicted;
    this._readDone(identityKey, st, lines, wins, endsNl);
    return lines;
  }
  /** After every read of an identity's lines: the read's own stat (a fold's proof of what it read — round 3: «moved» is a
   *  statement about the file since the fold began, never «the cache has no entry») and the identity's meta (kept whether or
   *  not the cache admitted the lines: the account walk and the estimate's anchor read it, not the file). */
  _readDone(key, st, lines, wins = null, endsNl = true) {
    const sig = sigOf(st); this._lastRead = { key, sig };
    if (!this._meta) this._meta = new Map();
    const m = this._meta.get(key); if (!m || m.sig !== sig) this._meta.set(key, { sig, ino: st.ino, btime: st.birthtimeMs || 0, size: st.size, endsNl, wins, ...linesMeta(lines) });
  }
  /** The identity's meta now: by its file's signature (one stat), else one read of its lines. */
  _metaOf(key) {
    let st = null; try { st = fs.statSync(this._file(key)); } catch { }
    const m = this._meta && this._meta.get(key);
    if (m && m.sig === sigOf(st)) return m;
    if (!st) return null;
    // a grown file whose meta's proof holds (the same inode and birth time, every proof window read back equal — lines()'s rule):
    // its appended records extend the meta — an anchor sweep's one record costs a tail read, never the file
    if (m && m.wins && m.ino === st.ino && (m.btime || 0) === (st.birthtimeMs || 0) && st.size > m.size && m.endsNl) { const r = this._metaTail(key, m, st); if (r) return r; }
    // round 4 (small 1): a whole read for the meta only inside the turn's cold-read budget (an estimate poll or a pool eval after a
    // rewrite never reads every identity whole in one call) — past it: no meta this turn (the pool's basis reads that as not ready)
    if ((this._coldBytes || 0) >= COLD_READ_TURN_BYTES) return null;
    const w0 = this.wholeReads || 0; this.lines(key); if ((this.wholeReads || 0) !== w0) this._coldSpent(st.size);
    return (this._meta && this._meta.get(key)) || null;
  }
  _metaTail(key, m, st) {
    let fd = null;
    try {
      fd = fs.openSync(this._file(key), 'r');
      for (const [off, want] of m.wins) { const got = Buffer.alloc(want.length); if (fs.readSync(fd, got, 0, want.length, off) !== want.length || !got.equals(want)) return null; }
      const len = st.size - m.size, buf = Buffer.alloc(len); let got = 0;
      while (got < len) { const n = fs.readSync(fd, buf, got, len - got, m.size + got); if (!n) break; got += n; }
      const text = buf.toString('utf-8', 0, got); if (got !== len || !text.endsWith('\n')) return null;
      const add = []; for (const l of text.split('\n')) { if (!l) continue; try { add.push(JSON.parse(l)); } catch { } }
      const named = new Set(m.named); let { lastTs, lastGlobalTs, last } = m;
      for (const l of add) { const ts = l.ts || l.fetchedAt || 0; if (ts > lastTs) lastTs = ts; if (l.accountId === undefined || l.accountId === null || l.accountId === '__global__') { if (ts > lastGlobalTs) lastGlobalTs = ts; } else named.add(l.accountId); if (!last || (l.fetchedAt || 0) >= (last.fetchedAt || 0)) last = l; }
      const tw = proofWindows(buf, m.size, st.size, 2), base = m.wins.slice(0, PROOF_SAMPLES + 2), tails = m.wins.slice(PROOF_SAMPLES + 2).concat(tw);
      const nm = { sig: sigOf(st), ino: st.ino, btime: st.birthtimeMs || 0, size: st.size, endsNl: true, wins: base.concat(tails.slice(Math.max(0, tails.length - (PROOF_MAX - base.length)))), named: [...named], lastTs, lastGlobalTs, last, n: m.n + add.length };
      this._meta.set(key, nm); this.metaTailReads = (this.metaTailReads || 0) + 1;
      return nm;
    } catch { return null; } finally { if (fd !== null) { try { fs.closeSync(fd); } catch { } } }
  }
  /** The census row (anchor-file bytes; the parsed lines cost ~1.6× that, measured on the owner's snapshot). */
  lineCacheCensus() { return cacheRow('estimator anchor lines', { bytes: this._lineBytes || 0, count: this._lineCache.size, unit: 'identities', ceiling: ESTIMATOR_LINES_MAX_BYTES, basis: `anchor-file bytes (32 MB floor for idle identities; the live set ≤ ${ESTIMATOR_LIVE_MAX_BYTES / 1048576} MB${this._lineLiveEvicted ? ', ' + this._lineLiveEvicted + ' live evicted past it' : ''})`, live: this._lineLive || 0 }); }
  // Every account id this identity has EVER anchored under — ledger events
  // for removed/re-added subs live under their old ids. '__global__' is the
  // ONE reassignable id (a machine /login switch hands it to a DIFFERENT
  // identity): historical anchor lines must not union it in forever, or
  // identity X's odometer counts identity Y's post-switch machine-login spend
  // — it joins only via `extra` (the CURRENT identity-group mapping).
  accountIdsFor(identityKey, extra = [], lines = null) {
    const ids = new Set(extra.filter(Boolean));
    // ② of the 2.340.0 calibration batch: an org-merged identity (machine
    // login + named sub) was EXCLUDING '__global__' the moment any named id
    // existed — every global-login session's spend vanished from the
    // identity's cost while its utilization still moved = systematic
    // under-estimate (the burst-interval -20..-45% audit). If the identity
    // was EVER anchored through the global login, it IS the machine org:
    // include the pseudo-account always.
    // ROUND 3: from the identity's meta (its file's signature) or the fold's own lines — a file the line cache does not admit
    // is never read whole again for its ids
    const m = lines ? linesMeta(lines) : (this._metaOf(identityKey) || { named: [], lastGlobalTs: 0, lastTs: 0 });
    for (const id of m.named) ids.add(id);
    const { lastGlobalTs, lastTs } = m;
    // RECENCY GATE (the 2.263 reassignment concern, kept): a machine login
    // moved to another org stops producing __global__ anchors here — after
    // 14 days of stream time without one, stop unioning (the ≤14d overlap
    // over-counts for THIS identity = conservative, safe direction).
    if (!ids.size || (lastGlobalTs && lastTs - lastGlobalTs < 14 * 86400e3)) ids.add('__global__');
    return [...ids];
  }
  ratesFor(identityKey) {
    if (!this._seeded) this._seedRates();
    // TTL 10min (not only invalidate-on-anchor): the LEDGER keeps backfilling
    // between anchors (late-scanned workflow transcripts), and learn-time
    // live-cost recomputation should see it without waiting for a new anchor.
    const c = this._rateCache.get(identityKey);
    const loading = this._ledgerLoading();
    if (c && (loading || (!c.partial && !c.stale && Date.now() - c.at < rateTtlMs(identityKey)))) return c.rates; // B3: the TTL SPREAD per identity (a whole population never relearns in one pass)
    // A RELEARN HOLDS THE LOOP A SLICE A TURN (lane usage-relearn-stepped — the owner's bench: one identity of 11 286 pairs held
    // the loop 106 ms, a tick 0.69 s): ONE fold an identity, RELEARN_STEP_LINES lines a turn; the rates it has are served
    // meanwhile (none yet ⇒ «still learning»: null — no estimate, no burn claim, no calib); a fold that ends inside its first
    // slice (most identities) answers at once. THE BOUND (round 2, MUST 4 — measured): before its first slice a fold walks its
    // identity's lines whole once (the fetched map, the distinct ids; accountIdsFor) and a cold file is read whole — 6.7–8.5 ms
    // at 11 286 lines (the owner's largest), 37–62 ms at 200 000, 256–333 ms at 700 000; past the live cap (128 MB of anchor
    // files) a handler asking every identity re-reads the evicted ones whole (1.3 s at 27 × 20 000 lines). Commit B: more in
    // every cell.
    const f = this._relearn(identityKey, !!loading);
    if (f && f.rates) return f.rates;
    return c ? c.rates : null;
  }
  /** THE SYNCHRONOUS LEARN — the boot migration's road only (ledger-slot-backfill re-learns and writes before the hub serves). */
  learnNow(identityKey) {
    const f = this._folds && this._folds.get(identityKey); if (f) this._foldEnd(f, false);
    const at = Date.now(), lines = this.lines(identityKey), rates = learnRates(lines, { priors: this.priorsFor(identityKey), costFn: this._costFn(this.accountIdsFor(identityKey, [], lines)) });
    this._rateCache.set(identityKey, { rates, at }); this._ratesLanded(identityKey); this._persistRates(identityKey, rates, lines.length);
    return rates;
  }
  /** ONE FOLD AN IDENTITY, ONE BUDGET A TURN: a fold costs its pairs RELEARN_CHUNK_LINES at a time, drawn from the loop turn's
   *  budget (RELEARN_STEP_LINES lines — shared by every ask in the turn and the one fold scheduler, so a GET that finds every
   *  identity stale after an anchor sweep's invalidation still holds the loop one slice, never a slice an identity); judged
   *  before every chunk after its first (the memo's epoch and the identity's lines — a move abandons it, the next ask starts a
   *  new one: never a fold over two ledgers or two line sets); the fit at the end, the rates swapped in. `loading` = the boot
   *  warm or a prime is on: the anchors' frozen costSince only (lane ledger-dedup-law r2 — NO LEARNED RATE FROM A PARTIAL
   *  LEDGER), never persisted, learned again live after. */
  _relearn(identityKey, loading) {
    if (!this._folds) { this._folds = new Map(); this._relearnQueue = []; }
    if (this._closed) return null;
    const run = this._folds.get(identityKey);
    if (run && !run.done && run.loading === loading) { if (this._relearnQueue.length) this._armTurn(); return run; } // a second ask joins the fold in flight (and arms a turn if none is: round 6 — a turn that spent nothing arms none)
    if (run) this._foldEnd(run, false);
    const ff = this._foldFail && this._foldFail.get(identityKey);
    if (ff && Date.now() < ff.retryAt && ff.sig === this._sigNow(identityKey)) return null; // a fold that threw: its last rates served until the backoff ends (small 3) — or until its file changes (round 3, small 4: the repair is tried at once)
    const { costMemoEpoch } = require('./usage-anchors.js');
    const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory;
    const epochNow = () => { try { return costMemoEpoch(uh); } catch { return null; } };
    // THE FOLD'S OWN INPUTS (round 2, MUST 3): the memo's epoch and THE IDENTITY'S LINES — the anchor file as the fold read it.
    // An invalidation that leaves both abandons nothing: it marks the fold `dirty`, its landing stale at once.
    // A FOLD OWNS WHAT IT FOLDS (round 3, the MUST — past the line cache's 128 MB live cap the cache refuses a newcomer, and
    // round 2's fold took «no cache entry» for «moved»: never landed, read whole at every ask): the fold holds the lines it read
    // and the signature of the file it read them from, for its own life. ONE fold at a time holds lines the cache did NOT admit
    // (the cap's only overdraft: one identity's lines) — a cold identity asked while another such fold runs is queued UNREAD
    // and opens when it ends.
    const f = { key: identityKey, loading, ep: loading ? null : epochNow(), file: null, at: Date.now(), done: false, dirty: false, rates: null, chunks: 0, nLines: 0, steps: null };
    // AN IDENTITY WITH NO RATES GOES BEFORE ONE THAT HAS (round 5 — a cold boot under a row a second: every row invalidated every
    // identity, the landed small ones re-folded first and the large never-learned ones starved): `first` = no rates to serve
    f.first = !((this._rateCache.get(identityKey) || {}).rates);
    f.moved = () => this._folds.get(identityKey) !== f || (!loading && epochNow() !== f.ep) || this._sigNow(identityKey) !== f.file;
    f.open = () => {
      const w0 = this.wholeReads || 0;
      const lines = this.lines(identityKey), lr = this._lastRead && this._lastRead.key === identityKey ? this._lastRead : null;
      f.file = lr ? lr.sig : this._sigNow(identityKey); f.nLines = lines.length; f.at = Date.now(); f.lines = lines; f.dirty = false; // an invalidation before the open is in what it reads (round 4, small 2)
      f.own = !this._lineCache.has(identityKey); if (f.own) this._ownFold = f; // its lines are the fold's alone (the cache refused them)
      f.lastAt = 0; for (const l of lines) if ((l.fetchedAt || 0) > f.lastAt) f.lastAt = l.fetchedAt || 0;
      f.ids = this.accountIdsFor(identityKey, [], lines);
      try { f.seq0 = !loading && uh && typeof uh.arrivalSeq === 'function' ? uh.arrivalSeq() : null; } catch { f.seq0 = null; }
      // learn-time LIVE cost recomputation (see extractPairs) — the frozen costSince snapshots under-count fast burns whose ledger
      // events land after the sweep; the live ledger heals them retroactively (while loading: the frozen ones only)
      f.steps = _extractPairsSteps(lines, { costFn: loading ? null : this._costFn(f.ids) }, RELEARN_CHUNK_LINES);
      if ((this.wholeReads || 0) !== w0) { let sz = 0; try { sz = fs.statSync(this._file(identityKey)).size; } catch { } this._coldSpent(sz); } // this turn's cold reads (a budget of COLD_READ_TURN_BYTES)
    };
    f.late = () => { // round 3 (small 1): a row of its accounts that ARRIVED mid-fold with a ts inside its anchors' span (the hub's own session rows bring no invalidation) — the landing is a mix of two ledger states: stale at once
      if (f.loading || f.seq0 == null || !uh || typeof uh.arrivalsFor !== 'function') return false;
      let r = null; try { r = uh.arrivalsFor(f.seq0, f.ids, null, f.lastAt); } catch { r = null; }
      return r === null || r.length > 0;
    };
    // …and a cold-read budget a turn (round 3 — the owner's shape × 8: a turn may not open every queued cold identity at once)
    const own = this._ownFold && !this._ownFold.done && this._ownFold !== f ? this._ownFold : null;
    const cachedNow = this._readsNoFile(identityKey); // unchanged (no read) or provably grown (its tail) — never cold (round 4, small 3); a REWRITE is cold (round 5)
    const firstsWaiting = !f.first && this._firstsQueued();
    if (!firstsWaiting && (cachedNow || (!own && (this._coldBytes || 0) < COLD_READ_TURN_BYTES))) f.open(); // a cached identity (no read), or a cold read inside the turn's budget: open now — a re-fold never while a first learn waits
    this._folds.set(identityKey, f);
    this.foldsStarted = (this.foldsStarted || 0) + 1;
    if (firstsWaiting || !this._foldRun(f)) { this._relearnQueue.push(f); } // a re-fold waits in the queue while a first learn does
    this._armTurn(); // the turn's budget is reset at the next turn (and the queue folded there)
    return f;
  }
  /** The fold's chunks while the turn's budget lasts → true when it ended (landed or abandoned). */
  _foldRun(f) {
    const step = this.relearnStepLines || RELEARN_STEP_LINES;
    if (this._turnLeft === undefined) this._turnLeft = step;
    try {
      for (;;) {
        if (f.done) return true;
        if (!f.steps) { const own = this._ownFold && !this._ownFold.done && this._ownFold !== f; if (own || (!this._readsNoFile(f.key) && (this._coldBytes || 0) >= COLD_READ_TURN_BYTES) || (!f.first && this._firstsQueued(f))) return false; f.open(); } // queued unread: opens when the fold that holds uncached lines ended, inside the turn's cold-read budget, a re-fold after the first learns
        if (f.chunks && this._ownJudge(f)) return true; // the cache let its lines go mid-fold: yielded (another holds the slot)
        if (f.chunks && f.moved()) { if (this._sigNow(f.key) !== f.file) { if (!this._movedN) this._movedN = new Map(); this._movedN.set(f.key, (this._movedN.get(f.key) || 0) + 1); } this._foldEnd(f, false); this.foldsAbandoned = (this.foldsAbandoned || 0) + 1; return true; } // abandoned: the next ask folds again (a moved file counted: the basis line's reason — round 6)
        if (this._turnLeft <= 0) return false;
        f.chunks++; this._turnLeft -= RELEARN_CHUNK_LINES;
        const r = f.steps.next();
        if (!r.done) continue;
        const rates = _fitRates(r.value, this.priorsFor(f.key));
        f.rates = rates; this._foldEnd(f, true);
        if (f.loading) this._rateCache.set(f.key, { rates, at: Date.now(), partial: true });
        else { const stale = f.dirty || f.late(); this._rateCache.set(f.key, { rates, at: f.at, ...(stale ? { stale: true } : {}) }); this._persistRates(f.key, rates, f.nLines); if (stale) this.landedStale = (this.landedStale || 0) + 1; }
        if (this._movedN) this._movedN.delete(f.key);
        this._ratesLanded(f.key); // round 2 (MUST 2): every estimate built on this identity's earlier rates — or on none — goes
        if (this._foldFail) this._foldFail.delete(f.key);
        return true;
      }
    } catch (e) { this._foldEnd(f, false); this._foldThrew(f.key, e); return true; }
  }
  _foldEnd(f, landed) { f.done = true; if (this._folds && this._folds.get(f.key) === f) this._folds.delete(f.key); if (!landed) f.rates = null; if (this._ownFold === f) { this._ownFold = null; if (this._relearnQueue && this._relearnQueue.length) this._armTurn(); } }
  /** THE TURN'S COLD-READ BUDGET (round 3; round 4 — the meta's whole reads count too): `bytes` read whole this turn; the
   *  count resets at the next turn whether or not a relearn is queued. */
  _coldSpent(bytes) {
    this._coldBytes = (this._coldBytes || 0) + bytes;
    if (!this._coldResetArmed) { this._coldResetArmed = true; (this.relearnNext || ((fn) => setImmediate(fn)))(() => { this._coldResetArmed = false; this._coldBytes = 0; }); }
  }
  /** A FOLD'S OWNERSHIP (round 4 at every chunk; round 6 also at every turn's start): a fold whose lines the cache let go
   *  (evictIdle's live block) holds them alone now — it takes the one slot if free, else it YIELDS (ended, its lines let go,
   *  refolded at its next ask): ONE fold at a time holds lines the cache does not. → true when it yielded. */
  _ownJudge(f) {
    if (f.done || !f.steps || f.own || this._lineCache.get(f.key)?.lines === f.lines) return false;
    if (this._ownFold && !this._ownFold.done && this._ownFold !== f) { this._foldEnd(f, false); this.foldsYielded = (this.foldsYielded || 0) + 1; return true; }
    f.own = true; this._ownFold = f; return false;
  }
  /** What a fold that has not moved waits for — from the state, never a guess (round 6). */
  _waitWhy(f) {
    if (!f) return 'no fold of it under way';
    if (f.steps) return `its fold is still running (${f.chunks} of ${Math.max(1, Math.ceil(f.nLines / RELEARN_CHUNK_LINES))} chunks)`;
    const own = this._ownFold && !this._ownFold.done && this._ownFold !== f ? this._ownFold : null;
    if (own) return `it waits behind ${own.key}'s fold (the one fold that holds lines outside the cache)`;
    if (!f.first && this._firstsQueued(f)) return 'it waits for the first learns queued before it';
    if ((this._coldBytes || 0) >= COLD_READ_TURN_BYTES && !this._readsNoFile(f.key)) return "it waits for a turn's cold-read budget";
    return 'it is queued, not yet opened';
  }
  /** A turn that spent nothing while `n` folds are owed (round 6): counted, said once a process — never a silent stall. */
  _turnIdle(head, n) {
    this.turnsIdle = (this.turnsIdle || 0) + 1;
    if (this._idleSaid) return; this._idleSaid = true;
    try { console.warn(`[usage] a relearn turn spent nothing with ${n} folds owed — its head ${head.key}: ${this._waitWhy(head)}`); } catch { }
  }
  /** A first learn still queued (another than `but`) — a re-fold waits behind it (round 5). */
  _firstsQueued(but = null) { return !!(this._relearnQueue && this._relearnQueue.some((q) => q.first && !q.done && q !== but)); }
  /** Opening `key` reads no file whole: the cache holds it unchanged, or it only grew (its tail, under the proof) — a rewrite is a
   *  cold read, bound by the turn's budget (round 5, small: the 4 MB stop did not bind a cached identity's open after a rewrite). */
  _readsNoFile(key) {
    const e = this._lineCache.get(key); if (!e) return false;
    let st = null; try { st = fs.statSync(this._file(key)); } catch { return false; }
    return e.sig === sigOf(st) || (e.ino === st.ino && (e.btime || 0) === (st.birthtimeMs || 0) && st.size > e.size && e.endsNl);
  }
  /** The identity's anchor file's signature now (one stat). */
  _sigNow(key) { let st = null; try { st = fs.statSync(this._file(key)); } catch { } return sigOf(st); }
  /** The rates of `key` landed: its version moves — an estimate memoized on an older version (or on none) is never served again. */
  _ratesLanded(key) { if (!this._ratesVer) this._ratesVer = new Map(); this._ratesVer.set(key, (this._ratesVer.get(key) || 0) + 1); }
  _ratesVerOf(key) { return (this._ratesVer && this._ratesVer.get(key)) || 0; }
  /** A fold that THREW (round 2, small 3 — a malformed record was restarted by every ask, silently): said once by name, the
   *  identity's last rates served, tried again after a backoff (5 s doubling ≤ 5 min); a fold that lands clears it. */
  _foldThrew(key, e) {
    if (!this._foldFail) this._foldFail = new Map();
    const n = ((this._foldFail.get(key) || {}).n || 0) + 1, wait = Math.min(FOLD_RETRY_MAX_MS, FOLD_RETRY_MS * 2 ** (n - 1));
    this._foldFail.set(key, { n, retryAt: Date.now() + wait, why: String((e && e.message) || e).slice(0, 160), sig: this._sigNow(key) });
    this.foldsFailed = (this.foldsFailed || 0) + 1;
    if (n === 1) { try { console.warn(`[usage] the relearn of ${key} failed (${String((e && e.message) || e).slice(0, 160)}) — its last rates are served; it is tried again after ${Math.round(wait / 1000)} s, then doubling to ≤ ${FOLD_RETRY_MAX_MS / 60e3} min`); } catch { } try { global.__vsEvent?.('usage-relearn-failed', String(key).slice(0, 80)); } catch { } }
  }
  /** A RESTART DOES NOT FORGET (round 4 — rates.json was written as a snapshot for offline inspection and never read back: on
   *  master the first ask learned at once, so nothing needed it; stepped, an identity would read «still learning» for its first
   *  relearn): ONCE (and again after reloadRates), every identity's last learned rates are seeded into the rate cache, STALE — the
   *  first ask serves them while its relearn folds the new ones. */
  _seedRates() {
    this._seeded = true;
    let all = null; try { all = JSON.parse(fs.readFileSync(path.join(this.dir, 'rates.json'), 'utf-8')); } catch { return; }
    let n = 0;
    for (const [k, v] of Object.entries(all || {})) { if (!v || !v.buckets || this._rateCache.has(k)) continue; this._rateCache.set(k, { rates: v.buckets, at: 0, stale: true, seeded: true }); n++; }
    this.ratesSeeded = (this.ratesSeeded || 0) + n;
  }
  /** THE POOL'S BASIS (round 4 — NO DECISION ON A MIXED BASIS): true while any of these accounts' identities cannot be estimated
   *  yet — anchors on disk but no rates (not even seeded), or no meta this turn — so a decision that compares them reads them ALL
   *  raw, never one estimated beside one raw. The ledger's own load and prime are the gate's (estimates are null for all then). */
  basisRaw(accountIds) {
    if (this._ledgerLoading()) return false;
    if (!this._learnSince) this._learnSince = new Map();
    const now = Date.now(), notReady = [];
    for (const id of accountIds || []) {
      let ik = null; try { ik = this.resolveIdentity(id)?.identityKey; } catch { } if (!ik) continue;
      if (this._sigNow(ik) === 'absent') continue; // no anchors: never estimated — raw on every basis
      const rates = this.ratesFor(ik), meta = rates ? this._metaOf(ik) : null;
      if (rates && meta) { this._learnSince.delete(ik); if (this._aloneSaid && this._aloneSaid.get(ik) !== 'estimate') this._sayBack(ik); continue; }
      // BOUNDED (round 4b — 主开发 06:00Z): a member holds its pool raw only while its first learn is UNDER WAY and young; one
      // whose fold threw, or still not ready after BASIS_HOLD_MAX_MS (its file keeps changing / no read of it any turn), is read
      // raw ALONE — the pool estimates its other members, as the release does — and said once by name
      if (!this._learnSince.has(ik)) this._learnSince.set(ik, now);
      const age = now - this._learnSince.get(ik), failed = this._foldFail && this._foldFail.get(ik);
      // round 6: the reason read from the state, never a guess (round 5 said «its file keeps changing» of files nobody touched)
      const moves = this._movedN ? this._movedN.get(ik) || 0 : 0, fold = this._folds && this._folds.get(ik);
      const why = failed ? `its fold threw (${failed.why})` : age >= (this.basisHoldMaxMs || BASIS_HOLD_MAX_MS) ? (rates ? ((this._coldBytes || 0) >= COLD_READ_TURN_BYTES ? "the turn's cold-read budget was spent when it was asked" : 'its file could not be read') : moves ? `its file changed ${moves} times since its first learn began` : this._waitWhy(fold && !fold.done ? fold : null)) : null;
      if (why) { this._sayAlone(ik, why, age, rates ? 'meta' : 'rates'); continue; }
      notReady.push(ik);
    }
    if (notReady.length && !this._basisSaid) { this._basisSaid = true; try { console.log(`[usage] the pool reads its members raw while ${notReady.length} identit${notReady.length > 1 ? 'ies are' : 'y is'} on a first learn — never one estimated beside one raw (≤ ${Math.round((this.basisHoldMaxMs || BASIS_HOLD_MAX_MS) / 1000)} s each)`); } catch { } }
    this.basisRawAsks = (this.basisRawAsks || 0) + (notReady.length ? 1 : 0);
    return notReady.length > 0;
  }
  /** A member read raw alone (round 4b): said once by name, with why — and said again when it recovers (round 5: the journal
   *  never ends on the bad news). `estimate` = its rates and meta are there but its estimate failed (the release reads it raw too). */
  _sayAlone(ik, why, age, kind = 'rates') {
    if (!this._aloneSaid) this._aloneSaid = new Map(); // ik → what it lacks: 'rates' | 'meta' (no read of its file) | 'estimate'
    if (this._aloneSaid.has(ik)) return; this._aloneSaid.set(ik, kind);
    try { console.warn(kind === 'estimate' ? `[usage] ${ik} is read raw: its estimate failed (${why}) — the pool estimates its other members` : kind === 'meta' ? `[usage] ${ik} has no read of its file after ${Math.round(age / 1000)} s (${why}) — the pool estimates its members without waiting for it` : `[usage] ${ik} has no rates after ${Math.round(age / 1000)} s (${why}) — the pool estimates its other members and reads it raw`); } catch { }
    try { global.__vsEvent?.('usage-basis-alone', String(ik).slice(0, 80)); } catch { }
  }
  _sayBack(ik) {
    const kind = this._aloneSaid && this._aloneSaid.get(ik); if (!kind) return; this._aloneSaid.delete(ik);
    try { console.log(kind === 'rates' ? `[usage] ${ik} has rates again — estimated with its pool` : `[usage] ${ik} is estimated again (${kind === 'meta' ? 'its file read' : 'its estimate no longer fails'}) — with its pool`); } catch { }
  }
  /** Let go (round 2, small 4 — a dropped estimator's fold went on and wrote rates.json after its successor): every fold in
   *  flight ends, the queue empties, nothing more is folded or persisted by this estimator (the slot backfill closes its own).
   *  One NOT closed keeps folding until its queue drains, and its copy's text is what the store writer writes last. */
  close() { this._closed = true; if (this._folds) for (const f of [...this._folds.values()]) this._foldEnd(f, false); if (this._relearnQueue) this._relearnQueue.length = 0; }
  /** ONE scheduler: a turn spends what the asks left of its budget on the queue's oldest folds, then resets it for the next. */
  _armTurn() {
    if (this._turnArmed) return; this._turnArmed = true;
    const next = this.relearnNext || ((fn) => setImmediate(fn));
    next(() => {
      this._turnArmed = false; this._coldBytes = 0; // a new turn: its cold-read budget
      const Q = this._relearnQueue || [], n0 = Q.length, left0 = this._turnLeft ?? (this.relearnStepLines || RELEARN_STEP_LINES);
      // THE HOLDER OF THE ONE SLOT ALWAYS RUNS (round 6 — a restart with a partial seed: a seeded identity's re-fold opened at boot
      // and took the slot for uncached lines, round 5's order put the first learns ahead of it, the head could not open, the turn
      // stopped there and the holder was never reached: 7 identities never learned). The order: the first learns (round 5), then
      // the slot's holder — it inherits the priority of the first learns that wait for its slot, ahead of every re-fold —, then
      // the re-folds, each class the smallest left first (round 2, small 5); a fold that cannot open is passed over, never a
      // wall, and a fold that ended (the slot freed) lets the turn look again from the head
      for (const f of Q) this._ownJudge(f); // every queued fold's ownership judged at the turn's start (the holder runs first: one behind it must not keep lines the cache let go)
      const holder = this._ownFold && !this._ownFold.done ? this._ownFold : null;
      if (Q.length > 1) Q.sort((x, y) => ((x.first ? 0 : x === holder ? 1 : 2) - (y.first ? 0 : y === holder ? 1 : 2)) || ((x.steps ? x.nLines - x.chunks * RELEARN_CHUNK_LINES : Infinity) - (y.steps ? y.nLines - y.chunks * RELEARN_CHUNK_LINES : Infinity)));
      for (let ended = true; ended && Q.length && (this._turnLeft ?? 1) > 0;) { ended = false; for (let i = 0; i < Q.length && (this._turnLeft ?? 1) > 0; i++) if (this._foldRun(Q[i])) { Q.splice(i--, 1); ended = true; } }
      for (let k = Q.length - 1; k >= 0; k--) if (Q[k].done) Q.splice(k, 1);
      // A TURN THAT SPENDS NOTHING WHILE FOLDS ARE OWED is a defect (round 6): said once — the head and what it waits for — and
      // no next turn armed for it (a turn that cannot move would spin the loop): the next ask or a fold's end arms one
      const idle = Q.length > 0 && Q.length === n0 && left0 > 0 && (this._turnLeft ?? left0) === left0;
      if (idle) this._turnIdle(Q[0], Q.length);
      this._turnLeft = this.relearnStepLines || RELEARN_STEP_LINES; // the next turn's budget
      if (Q.length && !idle) this._armTurn();
    });
  }
  /** THE FIRST LEARN IS ONE SWEEP (hotfix usage-ledger-walk ③): once per cost-memo epoch (a boot, a pricing edit, a
   *  rewritten ledger — usage-anchors costMemoEpoch) every identity's anchor pairs are costed by ONE ledger walk
   *  (usage-anchors primeCosts) before the first live relearn asks them one by one; afterwards a relearn reads the memo
   *  and walks only an interval a row entered (a new pair, a late row). */
  /** A first-learn line, said once per memo epoch and kind («slow» per phase, «dropped», «stopped»); a repeat is counted and
   *  told on the next line that is said (B r4 — a stalling loop once repeated them at every new prime). */
  _sayPrime(ep, m, say) {
    const kind = /is slow \(reading/.test(m) ? 'slow (the anchor files)' : /is slow/.test(m) ? 'slow' : /made no step/.test(m) ? 'dropped' : /stopped/.test(m) ? 'stopped' : 'said';
    const S = this._primeSaid || (this._primeSaid = { ep: undefined, kinds: new Set(), held: new Map() });
    if (S.ep !== ep) { S.ep = ep; S.kinds = new Set(); }
    if (S.kinds.has(kind)) { S.held.set(kind, (S.held.get(kind) || 0) + 1); return; }
    S.kinds.add(kind);
    let tail = '';
    if (S.held.size) { tail = ` (not said again since: ${[...S.held].map(([k, n]) => `${k} ×${n}`).join(', ')})`; S.held.clear(); }
    try { say(m + tail); } catch { }
  }
  /** The pool engine's gate asks this before it reads the ledger's signal (A2): a cold memo starts priming — and holds. */
  primeIfCold() { try { this._primePairs(); } catch { } }
  _primePairs() {
    const { costMemoEpoch, primeCostsStepped } = require('./usage-anchors.js');
    const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory;
    let ep = null; try { ep = costMemoEpoch(uh); } catch { ep = null; }
    if (ep == null || ep === this._primedEpoch || (this._priming && !this._priming.done && this._priming.epoch === ep)) return;
    let files = []; try { files = fs.readdirSync(this.dir).filter((f) => /^anchors-.*\.ndjson$/.test(f)); } catch { }
    const pr = { epoch: ep, done: false, at: Date.now() };
    this._priming = pr;
    // a landing marks the epoch learned; so does a THROW (failed — master's road for this epoch, as A5); a stall or a moved epoch
    // leaves it UNLEARNED: the next ask starts a new stepped prime (the first learn never runs on the synchronous road)
    const land = (r) => { if (pr.done) return; pr.done = true; pr.result = r || null; if (this._priming === pr) { if (!(r && r.abandoned && !r.failed)) this._primedEpoch = ep; this._estMemo.clear(); } };
    const opts0 = this.primeOpts || {};
    const opts = { ...opts0, say: (m) => this._sayPrime(ep, m, opts0.say || ((x) => console.warn(x))) }; // the prime's lines, once an epoch
    const groupOf = (f) => { // one identity: its anchor file's pairs (a step's work — B3: never all files on the first ask)
      let key = null;
      try { const data = fs.readFileSync(path.join(this.dir, f), 'utf-8'); const nl = data.lastIndexOf('\n', data.length - 2); key = JSON.parse(data.slice(nl + 1)).identityKey || null; } catch { key = null; }
      if (!key || this._file(key) !== path.join(this.dir, f)) return null;
      const lines = this.lines(key), at = new Set(lines.map((l) => l.fetchedAt)), intervals = [];
      for (const l of lines) if (l && l.prevFetchedAt && l.costSince && at.has(l.prevFetchedAt) && l.fetchedAt > l.prevFetchedAt) intervals.push([l.prevFetchedAt, l.fetchedAt]);
      return intervals.length ? { ids: this.accountIdsFor(key), intervals } : null;
    };
    const finish = (groups, release) => { // the prime's own watchdog windows (round 3's «one bound» went: a slow file phase must not shorten the prime's)
      let p; try { p = primeCostsStepped(uh, groups, opts); } catch { p = null; }
      if (p && typeof p.then === 'function') p.then((r) => { land(r); release(); }, () => { land(null); release(); }); else { land(p); release(); } // r4: land first, release after (no gap between the hold and the verdict)
    };
    let small = true; try { small = !(uh && typeof uh._evCountUpTo === 'function') || uh._evCountUpTo(Infinity) <= (opts.syncMaxRows ?? 50000); } catch { small = true; }
    if (small) { const groups = []; for (const f of files) { const g = groupOf(f); if (g) groups.push(g); } finish(groups, () => { }); return; }
    // THE FIRST ASK HOLDS ONLY (B3): ITS OWN hold (every reader answers «still learning» — A2; r4: a prime's hold is its own), then one
    // identity's file a step, then the stepped prime (holding its own too); a watchdog per window: slow ⇒ said, it goes on; no step
    // in a whole window ⇒ dropped, the epoch unlearned (the next ask primes again, stepped)
    const hold = typeof uh._holdForPrime === 'function' ? uh._holdForPrime() : null;
    let released = false;
    const release = () => { if (released) return; released = true; if (hold) { try { uh._releasePrime(hold); } catch { } } };
    // SAID ONCE AN EPOCH (B r4): a loop that keeps stalling drops and restarts primes for ever — each kind of line («slow»,
    // «dropped», «stopped») is said once per memo epoch; the repeats are counted and told on the next line that IS said
    const winMs = opts.holdMaxMs || 30000, sayP = opts.say; // opts.say IS the once-an-epoch wrapper
    let fsteps = 0, fseen = 0, fslow = false, bound = null;
    const watch = () => { // THE FIRST LEARN NEVER RUNS ON THE SYNCHRONOUS ROAD: a slow file phase goes on; one with no step in a window is dropped (unlearned)
      if (pr.done) return;
      if (fsteps === fseen) { try { sayP(`[usage] the first cost sweep made no step for ${winMs} ms — it is dropped; the next ask starts a new one (stepped)`); } catch { } try { global.__vsEvent?.('usage-prime-dropped', 'the anchor files'); } catch { } land({ abandoned: true, stalled: true }); release(); return; } // r4: land first, release after
      fseen = fsteps;
      if (!fslow) { fslow = true; try { sayP(`[usage] the first cost sweep is slow (reading the anchor files: ${fsteps} of ${files.length} in ${winMs} ms — the loop is busy) — estimates wait for it; it goes on`); } catch { } }
      bound = setTimeout(watch, winMs); if (bound && typeof bound.unref === 'function') bound.unref();
    };
    bound = setTimeout(watch, winMs);
    if (bound && typeof bound.unref === 'function') bound.unref();
    const next = opts.next || ((fn) => setImmediate(fn));
    const groups = []; let k = 0;
    const step = () => {
      if (pr.done || this._priming !== pr) { release(); return; }
      fsteps++;
      try {
        if (costMemoEpoch(uh) !== ep) { clearTimeout(bound); land({ abandoned: true, moved: true }); release(); return; } // B r3: the memo's epoch moved during the file steps — this priming ends; the next ask primes the new epoch (a throw: the guard below)
        if (k < files.length) { const g = groupOf(files[k++]); if (g) groups.push(g); next(step); return; }
        clearTimeout(bound);
        finish(groups, release);
      } catch (e) { // A5 / B r3: a throw in a file step (an anchor file, the epoch's own read) ends this priming — master's road, said once an epoch, naming the step
        clearTimeout(bound);
        const why = String((e && e.message) || e || 'unknown').slice(0, 160), where = k > 0 ? `reading anchor file ${k} of ${files.length}` : "the memo epoch's read";
        try { sayP(`[usage] the first cost sweep stopped (${where} threw: ${why}) — the costs of this price table / ledger are walked interval by interval, as before the sweep existed`); } catch { }
        try { global.__vsEvent?.('usage-prime-failed', where); } catch { }
        land({ abandoned: true, failed: why }); release();
      }
    };
    try { next(step); } catch { clearTimeout(bound); land(null); release(); }
  }
  invalidate(identityKey) {
    const c = this._rateCache.get(identityKey); if (c) c.stale = true; // served while the relearn folds (usage-relearn-stepped)
    const f = this._folds && this._folds.get(identityKey); if (f) f.dirty = true; // round 2 (MUST 3): it goes on; what it lands is stale at once
    this._estMemo.clear(); // the line cache stays: lines() reads a grown file by its tail and a rewritten one whole (its stat says which)
  }
  /** The ledger this estimator reads is still loading past its takeover bound (the boot's stepped warm) → {bytesLeft, at},
   *  else null (lane ledger-dedup-law r2): a cost read now is part of the ledger. */
  _ledgerLoading() {
    let loading = null;
    try { const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory; loading = uh && typeof uh.ledgerLoading === 'function' ? uh.ledgerLoading() : null; } catch { loading = null; }
    if (loading) return loading;
    // THE FIRST LEARN IS ONE SWEEP, STEPPED (hotfix usage-ledger-walk ②, 主开发's ruling): a whole ledger whose cost memo is
    // new (a boot, a pricing edit, a rewritten ledger) primes every identity's anchor pairs off the request path first —
    // until it lands this estimator answers as while the ledger loads (no estimate, the reading stands; rates from the
    // frozen costSince, never persisted). A small span primes at once and says nothing.
    try { this._primePairs(); } catch { }
    try { const uh = typeof this._usageHistory === 'function' ? this._usageHistory() : this._usageHistory; return uh && typeof uh.ledgerLoading === 'function' ? uh.ledgerLoading() : null; } catch { return null; } // the ONE signal (A2): the ledger's own, its priming hold included
  }

  // B3 ON THE STORE WRITER (usage-ledger-walk B, rebased onto hub-loop-stalls commit 2 — ONE writer of rates.json): a relearn of
  // every identity costs the loop no read and no write of this file per identity — the copy is read once (the first persist
  // after a (re)load), each persist merges into it and marks the file dirty, the writer builds the text when its write is due
  // (once, whatever the persists since) and writes it on its own thread. B r2's law is commit 2's road: every caller that
  // archives and drops this file runs inside the boot's migrations, between server.js's settleRates and reloadRates.
  _persistRates(identityKey, rates, nAnchors) {
    if (this._closed) return; // usage-relearn-stepped round 2 (small 4): an estimator let go writes nothing more
    // lane hub-loop-stalls commit 2: through THE STORE WRITER (its own thread; on the owner's hub this write held the loop
    // twice ≥ 1 s in six hours). The file is read at the first persist after a (re)load and kept here; each persist merges
    // into that copy and the writer takes its latest text. A lost last write costs a re-learn of that identity's rates from
    // its anchors (idempotent). THE ORDER AROUND THE BOOT'S MIGRATIONS (round 2, smaller 2 — four of them archive and drop
    // this file, one re-learns into it): server.js settles it BEFORE them (settleRates: what this process learned is on disk,
    // nothing of it in flight) and reloads AFTER (reloadRates: the copy is dropped and re-read at the next persist) — a
    // copy read before a migration never writes back what it dropped.
    try {
      const fp = path.join(this.dir, 'rates.json');
      if (!this._ratesAll) { let all = {}; try { all = JSON.parse(fs.readFileSync(fp, 'utf-8')) || {}; } catch { } this._ratesAll = all; fs.mkdirSync(this.dir, { recursive: true }); }
      this._ratesAll[identityKey] = { computedAt: Date.now(), nAnchors, buckets: rates };
      require('./store-writer.js').storeWriter().dirty(fp, { name: 'usage-rates.write', produce: () => JSON.stringify(this._ratesAll, null, 1) });
    } catch { }
  }
  /** the rates written NOW, on this thread — a one-shot repair (src/ledger-slot-backfill.js) records itself only after the
   *  rates it re-learned are on disk (a kill inside it re-learns them at the retry) */
  flushRates() { try { require('./store-writer.js').storeWriter().flushSync([path.join(this.dir, 'rates.json')]); } catch { } }
  /** BEFORE the boot's migrations: this process's learned rates on disk now and no write of them in flight (a write that
   *  landed after a migration's unlink would put the dropped rates back) */
  settleRates() { this.flushRates(); }
  /** AFTER the boot's migrations: the copy read before them is dropped (the next persist re-reads what they left), the rates
   *  learned from the anchors before them re-learned at the next ask */
  reloadRates() { this._seeded = false; this._ratesAll = null; this._rateCache.clear(); this._lineCache.clear(); this._estMemo.clear(); }
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
          c.byClass = c.byClass || { cw: 0, cr: 0, other: 0 };
          c.byClass.cw += live.byClass.cw;
          c.byClass.cr = (c.byClass.cr || 0) + live.byClass.cr;
          c.byClass.other += live.byClass.other;
        }
      }
      return c;
    };
  }
  /** The per-bucket burn (utilization per minute) of one account NOW — the
   *  identity's learned rates over the trailing window's ledger + live cost
   *  (burnRates). {} = no rate or no recent spend: no claim. */
  burnFor(accountId, nowMs = Date.now(), { windowMs = BURN_WINDOW_MS } = {}) {
    if (this._ledgerLoading()) return {}; // lane ledger-dedup-law r2: the trailing window's cost would be part of the ledger — no claim
    try {
      const ident = this.resolveIdentity(accountId);
      if (!ident?.identityKey) return {};
      const rates = this.ratesFor(ident.identityKey);
      const accountIds = this.accountIdsFor(ident.identityKey, [accountId || '__global__']);
      return burnRates({ rates, costFn: this._costFn(accountIds), nowMs, windowMs });
    } catch { return {}; }
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
    // round 2 (MUST 2): …and the moment the identity's rates LANDED after it was built (on older rates, or on none)
    if (m && nowMs - m.at < 30000 && !(rawCache?.fetchedAt > (m.baseFetchedAt || 0)) && (!m.ik || this._ratesVerOf(m.ik) === m.rv)) return ownEstimate(m.est, rawCache);
    // lane ledger-dedup-law r2: no estimate from a partial ledger — the cost since the anchor would be part of it (the
    // newest month loads last); null = the reading stands (every caller's no-estimate road), nothing memoized
    if (this._ledgerLoading()) return null;
    let est = null, baseFetchedAt = 0, ik = null, rv = 0, rates0 = null;
    try {
      const ident = this.resolveIdentity(accountId);
      if (ident?.identityKey) {
        ik = ident.identityKey; rv = this._ratesVerOf(ik);
        let anchor = null;
        // round 3: the rates FIRST — an identity still learning has no estimate whatever its anchor (estimateBuckets needs both), so its
        // file is never read for one; then the last record from the meta (no whole read of a file the cache refused)
        rates0 = this.ratesFor(ident.identityKey);
        const meta = rates0 ? this._metaOf(ident.identityKey) : null;
        if (meta && meta.last) anchor = meta.last;
        if (rawCache?.fetchedAt && (!anchor || rawCache.fetchedAt > anchor.fetchedAt)) {
          anchor = {
            fetchedAt: rawCache.fetchedAt,
            buckets: {
              fiveHour: rawCache.fiveHour ? { u: rawCache.fiveHour.utilization, resetsAt: rawCache.fiveHour.resetsAt } : null,
              sevenDay: rawCache.sevenDay ? { u: rawCache.sevenDay.utilization, resetsAt: rawCache.sevenDay.resetsAt } : null,
              // the reading's clock: the newer of the entry's own stamp and the file's (usage-anchors' rule, r2)
              scopedWeekly: (rawCache.scopedWeekly || []).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt, asOf: Math.max(Number(s.asOf) || 0, Number(rawCache.scopedFetchedAt) || 0) || undefined })),
            },
          };
        }
        if (anchor) {
          baseFetchedAt = anchor.fetchedAt; rv = this._ratesVerOf(ik); // a fold that landed inside this ask: its version
          if (rates0) {
            const accountIds = this.accountIdsFor(ident.identityKey, [accountId || '__global__']); est = estimateBuckets({ anchor, rates: rates0, costFn: this._costFn(accountIds), nowMs, lagS: this.lagS });
            const rc = this._rateCache.get(ik); if (est && rc && rc.seeded && rc.rates === rates0) est.ratesSeeded = true; // round 5: built on the last run's rates (rates.json) until its relearn lands — marked
            if (est && this._aloneSaid && this._aloneSaid.has(ik)) this._sayBack(ik);
          }
        }
      }
    } catch (e) { est = null; if (ik && rates0) this._sayAlone(ik, String((e && e.message) || e).slice(0, 120), 0, 'estimate'); } // round 5: a failed estimate is named (read raw, as the release does)
    this._estMemo.set(memoKey, { at: nowMs, est, baseFetchedAt, ik, rv });
    return ownEstimate(est, rawCache); // read through the member's own «no 5h limit» on EVERY return (the memo is the identity's)
  }
}

// ── Estimator telemetry hygiene (B-a5c0) ─────────────────────────────────────
// A metric that reports on every tick is not a metric: the old absolute-error
// stream wrote 118k rows in two days, nearly all 0 and none of them naming an
// account — the real errors drowned in the zeros (the "gauge that can never
// fall" class). THE calibration metric is therefore emitted from exactly ONE
// place — `sweepAnchorGroup` below — and only when a NEW ground-truth reading
// arrived to compare against (the reading was accepted as an anchor), once
// per moved bucket, carrying WHICH account and WHICH bucket it measured.
const CALIB_METRIC = 'usage-est-rel-err-pct';
function calibMetricRows(calib, { account } = {}) {
  const rows = [];
  for (const [bucket, c] of Object.entries(calib || {})) {
    if (!c || c.rel == null || !Number(c.actDu)) continue; // barely-moved window ⇒ noise division, not accuracy (2.368.13)
    rows.push({ name: CALIB_METRIC, value: Math.abs(c.predDu - c.actDu) / Math.abs(c.actDu) * 100, detail: `account=${account || '__global__'} bucket=${bucket}` });
  }
  return rows;
}

// ONE identity group's step of the engine's 60 s anchor sweep (moved out of
// usage-pool-engine so the "no new reading ⇒ nothing" rule is a TESTED
// behaviour, not a comment). Every dependency is injected; the engine passes
// its real anchors store, estimator, ledger cost and dark-host reader.
//   anchors   — { lastAnchor(key), maybeRecord(rec) → true iff a NEW anchor was written }
//   estimator — { accountIdsFor, ratesFor, invalidate }
//   costBetween(ids, fromMs, toMs), darkHosts(allIds) → [host], metric(name, value, detail)
// Returns { fresh, recorded, metrics } (the rows it emitted).
function sweepAnchorGroup({ identityKey, group, anchors, estimator, costBetween, darkHosts, metric }) {
  // «no 5h limit» is the identity's to keep (lane no-5h-window r5): its freshest file may be a SIBLING still holding a
  // 5h window, and an anchor carrying it is estimated back onto the member whose own file tombstoned it — `tomb5h` is
  // the group's file that stands «no 5h limit» (usageIdentityGroups); none ⇒ the freshest file as it is
  const cache = withOwnAbsence(group?.cache, group?.tomb5h);
  const prev = anchors.lastAnchor(identityKey);
  // NEW ground truth = a reading newer than the last anchor. Anything else is
  // the same snapshot re-seen (statusline rewrites it every 8 s) or an older
  // sibling cache — there is nothing to compare against, so no cost walk, no
  // calibration, no metric.
  const fresh = !!cache?.fetchedAt && (!prev || Number(cache.fetchedAt) > (Number(prev.fetchedAt) || 0));
  if (!fresh) return { fresh: false, recorded: false, metrics: [] };
  const allIds = estimator.accountIdsFor(identityKey, group.accountIds);
  const costSince = prev ? costBetween(allIds, prev.fetchedAt, cache.fetchedAt) : null;
  // calibration: what the CURRENT rates would have predicted for this new
  // reading — recorded into the anchor for offline analysis + Diagnostics.
  // Same-source only (B-b3cd metric hygiene): a cross-source pair carries the
  // unknown inter-source offset, not prediction error — the exact rule
  // extractPairs already enforces for LEARNING (2.340.0).
  let calib = null;
  if (prev && costSince && (prev.source || 'unknown') === (cache.source || 'unknown')) {
    try {
      const newBuckets = {
        fiveHour: cache.fiveHour ? { u: cache.fiveHour.utilization, resetsAt: cache.fiveHour.resetsAt } : null,
        sevenDay: cache.sevenDay ? { u: cache.sevenDay.utilization, resetsAt: cache.sevenDay.resetsAt } : null,
        scopedWeekly: (cache.scopedWeekly || []).map((s) => ({ name: s.name, u: s.utilization, resetsAt: s.resetsAt })),
      };
      calib = predictCalib(prev, newBuckets, estimator.ratesFor(identityKey), costSince, (cache.fetchedAt - prev.fetchedAt) / 1000);
    } catch { calib = null; }
  }
  // pairs recorded while ANY tainted source was dark must not teach rates
  // (Δu real, cost missing ⇒ a falsely HOT rate) — mark the record so
  // extractPairs voids pairs touching it (both sides of the gap).
  let dark = [];
  try { dark = darkHosts ? darkHosts(allIds) || [] : []; } catch { dark = []; }
  const recorded = !!anchors.maybeRecord({ identityKey, accountId: group.accountId, cache, costSince, calib, accountIds: allIds, dark });
  if (!recorded) return { fresh: true, recorded: false, metrics: [] };
  estimator.invalidate(identityKey); // rates re-derive from the grown pair set
  const metrics = calibMetricRows(calib, { account: group.accountId || identityKey });
  for (const m of metrics) { try { metric?.(m.name, m.value, m.detail); } catch { } }
  return { fresh: true, recorded: true, metrics };
}

// The auto-cli scheduler's drift read (server.js, B-a5c0): est vs the last
// raw reading, per bucket. A raw bucket whose `resetsAt` is already PAST is
// no control — its window rolled, the estimator re-based it at 0 and the
// comparison is "old window vs new window", the 100-point "drift" the log
// used to print. `drift` is the max over CONTROLLED buckets only (null when
// none had a control — the log says so instead of a number). The SCHEDULER'S
// inputs are unchanged: `triggerDrift`/`moved` still count a rolled bucket,
// because a reading from a closed window IS stale and refreshing it is the
// right act (the backlog's own finding: the trigger was correct, only the
// number was wrong) — this keeps the vendor-facing spawn cadence identical.
function cliRefreshDrift(est, raw, nowMs = Date.now()) {
  const nowSec = nowMs / 1000;
  let drift = null, triggerDrift = 0, moved = false, rolled = 0;
  const cmp = (e, r) => {
    if (!e || !r || typeof e.utilization !== 'number' || typeof r.utilization !== 'number') return;
    const d = Math.abs(e.utilization - r.utilization) * 100;
    triggerDrift = Math.max(triggerDrift, d); if (d > 0.2) moved = true;
    const rs = Number(r.resetsAt) || 0;
    if (rs && rs <= nowSec) { rolled++; return; } // stale raw ⇒ no control
    drift = Math.max(drift == null ? 0 : drift, d);
  };
  cmp(est?.fiveHour, raw?.fiveHour); cmp(est?.sevenDay, raw?.sevenDay);
  for (const s of est?.scopedWeekly || []) cmp(s, (raw?.scopedWeekly || []).find((x) => x.name === s.name));
  return { drift, triggerDrift, moved, rolled };
}

// THE WHOLE-LEDGER GATE (lane ledger-dedup-law r2 — no money decision from a partial ledger). While the boot's stepped warm has
// more of the ledger left than a reader may take over, every sync reader answers from the rows loaded so far
// (costBetweenMulti says `partial`). The pool engine's two money writers stand behind this gate: its anchor sweep (it
// records costSince + the calibration into the anchor files, and re-learns rates) WAITS — `run(fn)`: now when the ledger is
// whole, else once when the warm ends (an ask meanwhile joins that one run; the first sweep at 20 s simply waits); its
// automatic pool decision is SKIPPED — `holds()`: true while loading, said once ("ledger still loading"), and `onWhole`
// hears the warm's end so every auto pool is decided again. Never throws.
function wholeLedgerGate({ ledger, log = () => {}, onWhole = () => {}, prime = null } = {}) {
  const queued = [];
  let waiting = null, said = false, held = false;
  // `prime` (hotfix usage-ledger-walk A2): a cold cost memo starts its first learn BEFORE the signal is read — the gate then
  // holds through it like through the warm (one signal: the ledger's ledgerLoading, its priming hold included)
  const loading = () => { try { if (typeof prime === 'function') prime(); } catch { } try { return ledger && typeof ledger.ledgerLoading === 'function' ? ledger.ledgerLoading() : null; } catch { return null; } };
  const wait = (l) => {
    if (!said) { said = true; log(l && l.priming ? 'the usage costs are priming (the first learn after a boot, a pricing edit or a rewritten ledger) — the anchor sweep and the automatic pool decisions wait for it' : `ledger still loading (${Math.ceil(((l && l.bytesLeft) || 0) / 1048576)} MiB left) — the anchor sweep and the automatic pool decisions wait for the whole ledger`); }
    if (waiting) return;
    waiting = Promise.resolve(typeof ledger.whenWarm === 'function' ? ledger.whenWarm() : null).catch(() => { }).then(() => {
      waiting = null;
      const again = loading();
      if (again) { wait(again); return; }
      said = false;
      for (const fn of queued.splice(0)) { try { fn(); } catch { } }
      if (held) { held = false; try { onWhole(); } catch { } }
    });
  };
  return {
    loading,
    holds() { const l = loading(); if (!l) return false; held = true; wait(l); return true; },
    run(fn) { const l = loading(); if (!l) { fn(); return 'ran'; } if (!queued.includes(fn)) queued.push(fn); wait(l); return 'waiting'; },
  };
}

module.exports = {
  PRIOR_WEIGHT_DU, CLAUDE_MAX_PRIOR_FULL_USD,
  normU, scopedKey, scopedFamily, costForKey,
  extractPairs, learnRates, estimateBuckets, overlayCache, predictCalib,
  CALIB_METRIC, calibMetricRows, sweepAnchorGroup, cliRefreshDrift, wholeLedgerGate,
  burnRates, BURN_WINDOW_MS, rateTtlMs, RELEARN_STEP_LINES, _extractPairsSteps, _fitRates, // the stepped fold's two halves (a suite drives them against learnRates)
  UsageEstimator,
};
