'use strict';
/**
 * usage-predict.js — WHETHER A SOURCE'S PROJECTION MAY BE DRAWN, AND WHETHER THE POOL MAY READ IT (lane usage-predict, 2026-11-15;
 * the owner: «把预测系统做成通用的adapter接在不同的账号来源上»). PURE: no fs, no env, no clock — every input is an argument.
 *
 * The estimator draws «the last reading + a learned rate × the ledger's use since». Its own record already holds, for every new
 * reading, what it had projected just before (the anchor's calib: pred, act, u0). Replayed over THIS instance's record, per
 * source and per lane, that says whether the projection helps: each new reading against the projection made just before it, and
 * against the stale reading. The verdict is the instance's own, recomputed as pairs arrive — never a table from anyone's data.
 *
 * FOUR STATES:
 *   learning     — too few pairs to say anything: nothing is drawn; the plain line says how much was used here since
 *   provisional  — enough to draw a band, MARKED with its count of readings on this hub; the pool NEVER reads it
 *   on           — the pool may read it; drawn without the mark
 *   off          — not clearly better than the stale reading: the plain line, and nothing more
 *
 * THE HOLD (主开发's look of 2026-11-15, law B — the verdict does not flap, and one pair set gives one verdict): the verdict is
 * a WALK over fixed boundaries (every STEP_MS, the same instants on every hub). At each boundary the WINDOW_MS of pairs before
 * it is judged once; a state enters on a margin and leaves only when clearly worse, and after any change it holds DWELL_STEPS
 * boundaries. The verdict now = the state after the boundaries of the last WALK_MS, the walk starting where the kept pairs
 * start (never from an imagined empty past). So it is a function of the recorded pairs and the clock alone — no stored
 * state, nothing a restart or the road that read the file can change.
 */
const HOUR_MS = 3600e3, DAY_MS = 24 * HOUR_MS;
// ONE TABLE OF THE CONSTANTS (amendment 2 of 06:19Z: each with its reason and the replay figure that sets it; nothing more —
// no second hold, no per-member tuning, no setting). «Replay» = the owner's record, last 14 days, read-only (page 1).
const PREDICT = Object.freeze({
  STEP_MS: 6 * HOUR_MS,    // the boundary: 00 / 06 / 12 / 18 UTC — a lane can move at most 4× a day before the dwell; every hub judges the same instants
  WINDOW_MS: 14 * DAY_MS,  // each boundary judges the 14 days before it: two weekly windows, the span the accuracy research measured
  WALK_MS: 28 * DAY_MS,    // the boundaries walked: 28 days (two windows) — the start's empty state is forgotten long before now
  KEEP_MS: 42 * DAY_MS,    // the pairs the estimator keeps for it: WALK_MS + WINDOW_MS — exactly what the walk reads, never more
  ON_ENTER_N: 30,          // over 30 pairs a p90 is the projection's, not one lucky turn (the replay's Claude cap: 3 899 pairs)
  ON_STAY_N: 20,           // 30 in / 20 out: the refuter's lane at 29–31 pairs flapped 6× with its quality unchanged
  PROV_ENTER_N: 5,         // fewer and a band is noise: an error measured on 4 readings says nothing
  PROV_STAY_N: 4,          // the same shape one pair lower: a provisional lane does not drop on one ageing pair
  ENTER_MEAN: 0.90,        // to enter, the projection's mean error is ≤ 90 % of the stale reading's: the cap lane (0.49 vs 0.64 = 0.77×)
                           // enters; the 7d lane (0.37 vs 0.35) never does; a tie (1.00×) never does
  WORSE_P90: 1.05,         // clearly worse: the p90 more than 5 % over the stale reading's (a 1-point reading quantizes p90 at 1.00)
  WORSE_P99: 1.10,         // …or the p99 more than 10 % over it (the 7d lane: 1.29 vs 1.00 — the tail that made it OFF)
  // …or a mean no lower than the stale reading's (mean ≥ 1.00×): a projection that is not better on average is not kept
  DWELL_STEPS: 4,          // after any change the state holds 4 boundaries (24 h): at most one change a day reaches the pool
  RING_MAX: 20000,         // pairs per source and lane in a window: a busy Claude week lane records ~6 500 in 14 days
});
/** The account SOURCE of an estimator identity key: the harness whose quota it is. */
const CLAUDE_KEY_KINDS = new Set(['org', 'email', 'acct']);   // src/usage-anchors.js identityKeyFor's three spellings
function sourceOf(identityKey) {
  const k = String(identityKey || '');
  // a non-Claude identity is `<harness id>:` + its key (the pool's identity groups); Claude's own kinds are org: / email: / acct:
  // — so an unknown harness's key is ITS source (no adapter ⇒ no prior), never Claude's (usage-predict pick 3)
  const m = /^([a-z][a-z0-9-]*):/.exec(k);
  return m && !CLAUDE_KEY_KINDS.has(m[1]) ? m[1] : 'claude';
}
/** A source the estimator learns (its pairs mean something) — a source with a prediction adapter (src/harnesses/
 *  predict-adapters.js). ANY OTHER SOURCE READS OFF, the said limit of the look: never Claude's verdict by default, never a
 *  band nobody has checked. */
const knownSource = (src) => require('./harnesses/predict-adapters.js').adapterOf(src) !== null;
/** A calib bucket key → its lane: 'fiveHour' | 'sevenDay' | 'scoped:<name>'. */
const laneOf = (bucketKey) => String(bucketKey);
/** One anchor line's pairs: for each bucket of its calib, the stale reading's |error| and the projection's |error| at the new
 *  reading, in percentage points. A line older than `since` gives none. */
function pairsOf(line, since = -Infinity) {
  const out = [];
  const t = Number(line && (line.fetchedAt || line.ts)) || 0;
  if (!line || !line.calib || t < since) return out;
  for (const [key, c] of Object.entries(line.calib)) {
    if (!c || typeof c.act !== 'number' || typeof c.u0 !== 'number' || typeof c.pred !== 'number') continue;
    out.push({ lane: laneOf(key), t, stale: Math.abs(c.act - c.u0) * 100, proj: Math.abs(c.act - c.pred) * 100 });
  }
  return out;
}
function q(sorted, p, off = 0, len = sorted.length - off) {
  if (len <= 0) return null;
  const k = (len - 1) * p, f = Math.floor(k), c = Math.ceil(k);
  return f === c ? sorted[off + f] : sorted[off + f] + (sorted[off + c] - sorted[off + f]) * (k - f);
}
/** Wirth's selection: after it, a[k] is the k-th smallest, everything before ≤ it, everything after ≥ it (in place, O(n)). */
function selectK(a, k) {
  let l = 0, m = a.length - 1;
  while (l < m) {
    const x = a[k]; let i = l, j = m;
    do { while (a[i] < x) i++; while (x < a[j]) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } } while (i <= j);
    if (j < k) l = i;
    if (k < i) m = j;
  }
}
/** p90, p99 and the mean of `xs` — the 90th percentile's index selected in O(n), only the top tenth sorted (a busy window
 *  holds ~6 500 pairs and the walk judges ~112 of them). */
function measure(xs) {
  const n = xs.length;
  if (!n) return null;
  const a = Float64Array.from(xs);
  let sum = 0; for (let i = 0; i < n; i++) sum += a[i];
  const f = Math.floor((n - 1) * 0.9);
  selectK(a, f);
  const top = a.subarray(f).sort();   // a[f..] in order: the 90th's neighbour and the 99th are in it
  const at = (p) => { const k = (n - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); const v = (i) => top[i - f]; return lo === hi ? v(lo) : v(lo) + (v(hi) - v(lo)) * (k - lo); };
  return { p90: at(0.9), p99: at(0.99), mean: sum / n };
}
/** ONE BOUNDARY'S JUDGEMENT of a window's pairs: → { n, stale, proj, enter, worse }. `enter` = clearly better (the margin to
 *  enter); `worse` = clearly worse (the margin to leave); neither = a lane keeps the state it has. */
function judge(pairs, C = PREDICT) {
  const n = pairs.length;
  if (!n) return { n: 0, stale: null, proj: null, enter: false, worse: false };
  const stale = measure(pairs.map((p) => p.stale)), proj = measure(pairs.map((p) => p.proj));
  const enter = proj.p90 < stale.p90 && proj.p99 <= stale.p99 && proj.mean <= C.ENTER_MEAN * stale.mean;
  const worse = proj.p90 > C.WORSE_P90 * stale.p90 || proj.p99 > C.WORSE_P99 * stale.p99 || proj.mean >= stale.mean;
  return { n, stale, proj, enter, worse };
}
/** THE STEP: the state a lane takes at a boundary, from the one it had and that boundary's judgement (before the dwell). */
function stepState(prev, j, C = PREDICT) {
  const { n, enter, worse } = j;
  if (prev === 'on') return worse ? 'off' : n >= C.ON_STAY_N ? 'on' : n >= C.PROV_STAY_N ? 'provisional' : 'learning';
  if (prev === 'provisional') return worse ? 'off' : (n >= C.ON_ENTER_N && enter) ? 'on' : n >= C.PROV_STAY_N ? 'provisional' : 'learning';
  if (n >= C.ON_ENTER_N && enter) return 'on';
  if (n >= C.PROV_ENTER_N && enter) return 'provisional';
  return n < C.PROV_ENTER_N ? 'learning' : 'off';
}
/** A lane judged ALONE at one boundary (from learning, no dwell) — the shape of the rule, for the page and the suites. */
function verdictOf(pairs, C = PREDICT) { const j = judge(pairs, C); return { state: stepState('learning', j, C), n: j.n, stale: j.stale, proj: j.proj }; }
const boundaryAt = (ms, C = PREDICT) => Math.floor(ms / C.STEP_MS) * C.STEP_MS;
/** The oldest pair the walk can read at `nowMs` (one step of margin: a file read just after a boundary keeps the first window whole). */
const keepSince = (nowMs, C = PREDICT) => boundaryAt(nowMs, C) - C.KEEP_MS - C.STEP_MS;
/** THE VERDICT — the walk. `pairs` = one source's lane, in time order (t ascending); `nowMs` = the clock. → { state, n,
 *  boundary (the last passed), since (the boundary of its last change, or null), stale, proj }. */
function walkVerdict(pairs, nowMs, C = PREDICT, cache = null, trace = null) {
  const last = boundaryAt(nowMs, C);
  const ps = (pairs || []).filter((p) => p && Number.isFinite(p.t) && p.t <= last);
  if (!ps.length) return { state: 'learning', n: 0, boundary: last, since: null, stale: null, proj: null };
  // the walk starts where the kept pairs start (the first boundary at or after the first pair), never before last − WALK_MS
  let b = Math.max(last - C.WALK_MS, boundaryAt(ps[0].t, C) + C.STEP_MS);
  let state = 'learning', changedAt = -Infinity, since = null, lo = 0, hi = 0, j = null;
  for (; b <= last; b += C.STEP_MS) {
    while (hi < ps.length && ps[hi].t <= b) hi++;
    while (lo < hi && ps[lo].t <= b - C.WINDOW_MS) lo++;
    const from = Math.max(lo, hi - C.RING_MAX);
    // a passed boundary's window never changes unless its pairs do: `cache` (the caller's Map) keeps each judgement by the
    // window's signature, so a new reading costs only the boundaries that are new
    const sig = hi > from ? `${hi - from}|${ps[from].t}|${ps[hi - 1].t}` : '0';
    const hit = cache && cache.get(b);
    if (hit && hit.sig === sig) j = hit.j;
    else { j = judge(ps.slice(from, hi), C); if (cache) cache.set(b, { sig, j }); }
    const next = stepState(state, j, C);
    if (next !== state && (b - changedAt) >= C.DWELL_STEPS * C.STEP_MS) { state = next; changedAt = b; since = b; }
    if (trace) trace.push({ b, state, n: j.n });   // suites: the state at every boundary walked
  }
  if (cache) for (const k of cache.keys()) if (k < last - C.WALK_MS) cache.delete(k);   // a boundary the walk no longer reaches
  return { state, n: j ? j.n : 0, boundary: last, since, stale: j ? j.stale : null, proj: j ? j.proj : null };
}
/** An estimate kept to the lanes whose state `keep(state)` admits (the pool: 'on' only). null when none is left. */
function gateEstimate(est, stateOf, keep) {
  if (!est) return null;
  const out = { ...est };
  for (const k of ['fiveHour', 'sevenDay']) if (out[k] && !keep(stateOf(k))) out[k] = null;
  if (Array.isArray(out.scopedWeekly)) out.scopedWeekly = out.scopedWeekly.filter((s) => s && keep(stateOf('scoped:' + String(s.name || '').trim().toLowerCase())));
  return out.fiveHour || out.sevenDay || (out.scopedWeekly && out.scopedWeekly.length) ? out : null;
}
// ── THE ADAPTERS (pick 3, P1: the prediction as a generic adapter on each account source) ──
// Each source's facts — its unit, its prior — are its descriptor's `quota.predict`; the core reaches them by source through
// src/harnesses/predict-adapters.js (the data files themselves, never the registry).
const { ADAPTERS, adapterOf } = require('./harnesses/predict-adapters.js');
const UNITS = Object.freeze(['usd-api', 'tokens']);
/** Is `k` a lane key of a prior (fiveHour / sevenDay / scoped:<name>)? A prior's other members (classes5h) are not lanes. */
const isLaneKey = (k) => k === 'fiveHour' || k === 'sevenDay' || String(k).startsWith('scoped:');
/** A source's prior — lane → full-quota size in its unit (+ its own members) — or null when it declares none. */
function priorOf(source) {
  const a = adapterOf(source), p = a && a.prior;
  return p && typeof p === 'object' && !('none' in p) ? p : null;
}
/** The prior of the source an identity key belongs to (the estimator's and the pool's `priorsFor`). */
const priorsForIdentity = (identityKey) => priorOf(sourceOf(identityKey));
/** The contract of `quota.predict` → the errors (empty = good): `{ none: '<why>' }`, or `{ unit, prior }` where prior is
 *  `{ none: '<why>' }` or lanes → positive sizes (and `classes5h: { cw, cr, fresh }` positive when present). */
function checkPredict(p) {
  const errs = [];
  const why = (x) => typeof x === 'string' && x.trim().length > 0;
  if (!p || typeof p !== 'object') return ['missing — declare { unit, prior } or { none: \'<why>\' }'];
  if ('none' in p) return why(p.none) ? [] : ['`none` must say why'];
  if (!UNITS.includes(p.unit)) errs.push(`unit must be one of ${UNITS.join(' | ')} (got ${JSON.stringify(p.unit)})`);
  const pr = p.prior;
  if (!pr || typeof pr !== 'object') errs.push('prior must be an object ({ none } or lanes → sizes)');
  else if ('none' in pr) { if (!why(pr.none)) errs.push('prior.none must say why'); }
  else {
    const lanes = Object.keys(pr).filter(isLaneKey);
    if (!lanes.length) errs.push('prior names no lane');
    for (const k of lanes) if (!(Number(pr[k]) > 0)) errs.push(`prior.${k} must be a positive size`);
    for (const k of Object.keys(pr)) if (!isLaneKey(k) && k !== 'classes5h') errs.push(`prior.${k} is no lane and no known member`);
    if (pr.classes5h !== undefined && !['cw', 'cr', 'fresh'].every((c) => Number(pr.classes5h && pr.classes5h[c]) > 0)) errs.push('prior.classes5h needs positive cw, cr and fresh');
  }
  return errs;
}

module.exports = { PREDICT, sourceOf, knownSource, laneOf, pairsOf, judge, stepState, verdictOf, boundaryAt, keepSince, walkVerdict, gateEstimate, ADAPTERS, UNITS, adapterOf, isLaneKey, priorOf, priorsForIdentity, checkPredict };
