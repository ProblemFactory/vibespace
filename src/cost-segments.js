'use strict';
// THE SHOWN COST OF A CONVERSATION (lane artifacts-by-intent, 2.369.402 — the owner's red «本次对话约 $63854.44»).
// A claude `result` record's total_cost_usd is the CLI PROCESS's running total so far — measured on the real 2.1.308 and
// 2.1.312 stdout (scripts/fixtures/claude-cli/*-frames / *-stamped.jsonl): each total = the one before + that result's
// own share, which 2.1.312+ also writes as model_usage_since_last_result; 2.1.322 builds it from its cost ledger's total,
// the figure its own status line calls the session's cost. Adding the results up (the restore's sum and the bar's live
// `+=`, 2.369.400 and before) counted a process of n equal turns as n(n+1)/2 turns.
// THE LAW: the shown cost = the sum over the conversation's SEGMENTS of each segment's LAST total. A segment begins where
// the total restarts: the first result of a process (its total IS its own since-last share) or a total lower than the one
// before (a CLI too old to write the share). A head the buffer trimmed away still counts — the first total seen already
// holds it; a resume that carries the total forward stays one segment.
// ONE fold for both roads: the restore (session-store chatStatus: every result on record) and the live road
// (message-manager: each result as it lands; its turn_complete carries the folded figure and the bar REPLACES its number
// with it — never adds). What the figure means is unchanged: the CLI's own estimate at API prices.
// PURE: imports nothing.

/** The fold before any result: `done` = the closed segments' last totals summed, `last` = the open segment's last total. */
const COST_START = Object.freeze({ done: 0, last: null });

/** A result's own share since its process's previous result (2.1.312+: Σ costUSD of model_usage_since_last_result), else null. */
function sinceLastCost(raw) {
  const m = raw && raw.model_usage_since_last_result;
  if (!m || typeof m !== 'object') return null;
  let s = 0;
  for (const v of Object.values(m)) { const c = Number(v && v.costUSD); if (Number.isFinite(c)) s += c; }
  return s;
}

/** One result folded in. A restart — no total before, a total lower than the last, or a total that IS its own share —
 *  closes the open segment; any other total replaces the open segment's (a running total, never added). */
function costStep(state, total, since = null) {
  const st = state && Number.isFinite(state.done) ? state : COST_START;
  const t = typeof total === 'number' ? total : NaN;
  if (!Number.isFinite(t) || t < 0) return st;
  const own = typeof since === 'number' && Number.isFinite(since) && Math.abs(since - t) <= 1e-9 * Math.max(1, t);
  const restart = st.last === null || t < st.last || own;
  return restart ? { done: st.done + (st.last || 0), last: t } : { done: st.done, last: t };
}

/** The figure a fold shows. */
function costShown(state) { return state && Number.isFinite(state.done) ? state.done + (state.last || 0) : 0; }

/** The restore: every claude `result` record on record, in order. */
function costOfResults(records) {
  let st = COST_START;
  for (const m of records || []) if (m && m.type === 'result') st = costStep(st, m.total_cost_usd, sinceLastCost(m));
  return st;
}

module.exports = { COST_START, sinceLastCost, costStep, costShown, costOfResults };
