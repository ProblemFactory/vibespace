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
// THE KEPT FACT (主开发's follow-up, 01:54Z): a wrapper buffer keeps only its tail — a conversation that outlived a process
// loses the earlier segments from it, and a restart would show the present segment only (the figure SHRANK). The fold's
// state {done, last, key} is therefore kept on the conversation's own meta record (`costKept`, written after each result
// by the claude stdout consumer) and resumed BEFORE the buffer: `costResume(kept, records)` folds only the results after
// the kept one (its `key`), or every result when the kept one was trimmed away (they are all newer). On a CLI too old to
// write its share, a process's first result says so itself: `result_index` 0 — a restart even when its total is higher.
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

/** A result's own key: its uuid (2.1.308+), else a fingerprint of what it reports. */
function costKey(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.uuid === 'string' && raw.uuid) return raw.uuid;
  return ['fp', raw.session_id, raw.result_index, raw.num_turns, raw.duration_ms, raw.total_cost_usd].join('|');
}

/** A fold state that can be resumed: {done ≥ 0, last null | ≥ 0, key}. */
function validCost(st) {
  return !!st && typeof st === 'object' && Number.isFinite(st.done) && st.done >= 0 && (st.last === null || (Number.isFinite(st.last) && st.last >= 0));
}

/** One RESULT RECORD folded in (both roads call this): its key is kept; the same record twice folds once; with no
 *  since-last share (a CLI before 2.1.312) `result_index` 0 marks a process's first result — a restart whatever its total. */
function costFold(state, raw) {
  const st = validCost(state) ? state : COST_START;
  if (!raw || raw.type !== 'result') return st;
  const t = raw.total_cost_usd;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return st;
  const key = costKey(raw);
  if (key && st.key === key) return st;
  const since = sinceLastCost(raw);
  // a CLI too old to write its share (before 2.1.312) still numbers its results per process: index 0 = a restart. With the
  // share present it decides alone — a resume that CARRIES its total forward also starts at index 0, and stays one segment
  const first = since === null && raw.result_index === 0 && st.last !== null;
  const next = costStep(first ? { done: st.done + st.last, last: null } : st, t, since);
  return next === st || next === COST_START ? st : { ...next, key };
}

/** THE RESTORE: the kept fact first, then the results the buffer holds after it. */
function costResume(kept, records) {
  const rs = (records || []).filter((m) => m && m.type === 'result');
  if (!validCost(kept)) return rs.reduce(costFold, COST_START);
  const at = kept.key ? rs.findIndex((r) => costKey(r) === kept.key) : -1;
  return rs.slice(at + 1).reduce(costFold, { done: kept.done, last: kept.last, key: kept.key || null });
}

/** The result records of a wrapper buffer's text (the boot reads the file; only a line naming a result is parsed). */
function resultsIn(text) {
  const out = [];
  for (const l of String(text || '').split('\n')) {
    if (!l.includes('"type":"result"')) continue;
    try { const o = JSON.parse(l); if (o && o.type === 'result') out.push(o); } catch { }
  }
  return out;
}

/** The figure a fold shows. */
function costShown(state) { return state && Number.isFinite(state.done) ? state.done + (state.last || 0) : 0; }

/** Every claude `result` record on record, in order, with no kept fact. */
function costOfResults(records) { return costResume(null, records); }

module.exports = { COST_START, sinceLastCost, costStep, costShown, costOfResults, costKey, validCost, costFold, costResume, resultsIn };
