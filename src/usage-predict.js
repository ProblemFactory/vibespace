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
 * THREE STATES (and the fourth that a projection worse than the stale reading falls back to):
 *   learning     — fewer than PROVISIONAL_MIN pairs: nothing is drawn; the plain line says how much was used here since
 *   provisional  — enough to draw the band, MARKED with its count of readings; the pool NEVER reads it
 *   on           — the rule over ON_MIN pairs: drawn without the mark; the pool may read it
 *   off          — worse than the stale reading at any of the rule's three measures: the plain line, and nothing more
 */
const DAY_MS = 24 * 3600e3;
const PREDICT = Object.freeze({
  PROVISIONAL_MIN: 5,      // fewer pairs than this and a band is noise: an error measured on 4 readings says nothing
  ON_MIN: 30,              // the rule's floor: over 30 pairs a p90 is a measure of the projection, not of one lucky turn
  WINDOW_MS: 14 * DAY_MS,  // the pairs counted: the last two weekly windows, the span the accuracy research measured
  RING_MAX: 20000,         // per source and lane: a busy Claude week lane records ~6 500 pairs in 14 days
});
/** The account SOURCE of an estimator identity key: the harness whose quota it is. */
function sourceOf(identityKey) {
  const k = String(identityKey || '');
  return k.startsWith('codex:') ? 'codex' : k.startsWith('antigravity:') ? 'antigravity' : 'claude';
}
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
function q(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), k = (s.length - 1) * p, f = Math.floor(k), c = Math.ceil(k);
  return f === c ? s[f] : s[f] + (s[c] - s[f]) * (k - f);
}
const measure = (xs) => (xs.length ? { p90: q(xs, 0.9), p99: q(xs, 0.99), mean: xs.reduce((a, b) => a + b, 0) / xs.length } : null);
/** THE RULE over a lane's pairs: → { state, n, stale, proj }. Better = a lower p90, a p99 no higher, a lower mean. */
function verdictOf(pairs, consts = PREDICT) {
  const n = pairs.length;
  if (n < consts.PROVISIONAL_MIN) return { state: 'learning', n };
  const stale = measure(pairs.map((p) => p.stale)), proj = measure(pairs.map((p) => p.proj));
  const better = proj.p90 < stale.p90 && proj.p99 <= stale.p99 && proj.mean < stale.mean;
  return { state: !better ? 'off' : n >= consts.ON_MIN ? 'on' : 'provisional', n, stale, proj };
}
/** An estimate kept to the lanes whose state `keep(state)` admits (the pool: 'on' only). null when none is left. */
function gateEstimate(est, stateOf, keep) {
  if (!est) return null;
  const out = { ...est };
  for (const k of ['fiveHour', 'sevenDay']) if (out[k] && !keep(stateOf(k))) out[k] = null;
  if (Array.isArray(out.scopedWeekly)) out.scopedWeekly = out.scopedWeekly.filter((s) => s && keep(stateOf('scoped:' + String(s.name || '').trim().toLowerCase())));
  return out.fiveHour || out.sevenDay || (out.scopedWeekly && out.scopedWeekly.length) ? out : null;
}
module.exports = { PREDICT, sourceOf, laneOf, pairsOf, verdictOf, gateEstimate };
