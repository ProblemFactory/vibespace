'use strict';
// THE STATUS-BAR FACTS ROW (lane agy-status-bar-facts, 2026-10-21 — the owner, on an Antigravity conversation: «agy 的
// chatview 缺少很多信息啊 什么 context 啊，cache rate，产物啊啥的下面都没有了»). What a chat harness's status bar can show is a
// DESCRIPTOR ROW, `ui.statusBar` (mirrored key for key in the client META, src/lib/agent-meta.js): the bar renders what
// the row declares and says «not reported by this harness» for what it lacks — never a blank, and never a number another
// harness's stream would have produced (an ACP agent reports no cache reads; its bar used to draw ⚡0%). Gated on the
// row, never on a harness id. PURE: imports nothing — the descriptors, the registry suite and the bar read it.
//   context   'reported'  the stream names the context window (claude modelUsage, codex token_count, ACP usage_update)
//             'table'     the descriptor's `windows` names it per model (antigravity: agy's stream reports none)
//             null        no context fact
//   cache     the last model call's cache reads are reported (claude, codex, antigravity; ACP has no such field)
//   odometer  the conversation's running token total is reported (codex totals, agy's own running sums)
//   model     the model the turn ran on is reported
//   duration  the turn's own time is reported (agy's duration_seconds)
//   windows   'table' only: [{prefix, tokens}] — a model slug matches a prefix followed by '-' or by its end
const STATUS_BAR_ROWS = Object.freeze(['context', 'cache', 'odometer', 'model', 'duration']);
const CONTEXT_SOURCES = Object.freeze(['reported', 'table']);
const NO_STATUS_BAR = Object.freeze({ context: null, cache: false, odometer: false, model: false, duration: false, windows: null });

/** What is wrong with a declared row ([] = nothing): every key present, a known context source, booleans, a window
 *  table exactly where the context comes from one. */
function statusBarErrors(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['no statusBar row'];
  const errs = [];
  for (const k of [...STATUS_BAR_ROWS, 'windows']) if (!(k in row)) errs.push(`missing ${k}`);
  if (row.context !== null && !CONTEXT_SOURCES.includes(row.context)) errs.push(`context ${JSON.stringify(row.context)} is not one of ${CONTEXT_SOURCES.join(' | ')} | null`);
  for (const k of STATUS_BAR_ROWS.slice(1)) if (typeof row[k] !== 'boolean') errs.push(`${k} is not a boolean`);
  if (row.context === 'table') {
    if (!Array.isArray(row.windows) || !row.windows.length) errs.push("context 'table' without a windows table");
    else for (const w of row.windows) if (!w || typeof w.prefix !== 'string' || !w.prefix || !Number.isInteger(w.tokens) || w.tokens <= 0) errs.push(`bad window row ${JSON.stringify(w)}`);
  } else if (row.windows !== null) errs.push("a windows table without context 'table'");
  return errs;
}

/** The row a harness's ui answers (its declared `statusBar`, else nothing reported — a shell, an unknown id). */
function statusBarOf(ui) {
  return ui && ui.statusBar && typeof ui.statusBar === 'object' ? ui.statusBar : NO_STATUS_BAR;
}

/** The context window of `model` from a 'table' row, or 0 (unknown — the bar then says «window unknown»). */
function windowOf(row, model) {
  if (!row || row.context !== 'table' || !Array.isArray(row.windows)) return 0;
  const m = String(model || '').trim().toLowerCase();
  if (!m) return 0;
  let best = null;
  for (const w of row.windows) {
    const p = String((w && w.prefix) || '').toLowerCase();
    if (p && (m === p || m.startsWith(p + '-')) && (!best || p.length > best.prefix.length)) best = { prefix: p, tokens: w.tokens };
  }
  return best ? best.tokens : 0;
}

/** The facts a row does NOT report, in the bar's order (each one the bar says «not reported» for). */
function unreportedRows(row) {
  const r = row || NO_STATUS_BAR;
  return STATUS_BAR_ROWS.filter((k) => (k === 'context' ? !r.context : r[k] !== true));
}

module.exports = { STATUS_BAR_ROWS, CONTEXT_SOURCES, NO_STATUS_BAR, statusBarErrors, statusBarOf, windowOf, unreportedRows };
