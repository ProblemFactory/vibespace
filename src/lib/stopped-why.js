// THE WHY OF A STOPPED SESSION (lane dead-socket-keeps-chat-meta — the owner's 2026-10-30 incident: a session whose process
// ended while the server was down vanished at the next boot). The boot now keeps it STOPPED (src/server/boot-restore.js
// retireDeadSocket → /api/sessions' row: `stopReason: 'dead-socket-at-boot'`, the name / cwd / account it had), and every
// door that shows it says the same sentence: the sidebar's card, the read-only window's resume bar, the resume-all offer,
// the window's stopped tile. PURE but for t().
import { t } from './i18n.js';
import { stampAt } from './page-time.js';

const seen = new Map(); // backend:id → {reason, at} — the rows a door read before the sidebar had its list (the boot's restore)
const keyOf = (backend, id) => `${backend || 'claude'}:${id}`;
const rowFor = (rows, backend, id) => (rows || []).find((s) => s && (s.backend || 'claude') === (backend || 'claude') && (s.backendSessionId || s.sessionId) === id) || null;

/** Remember the stopped rows' reasons from a /api/sessions list (layout restoreState reads one at boot). */
export function noteStoppedRows(rows) {
  for (const r of rows || []) if (r && r.status === 'stopped' && r.stopReason) seen.set(keyOf(r.backend, r.backendSessionId || r.sessionId), { reason: r.stopReason, at: r.stoppedAt || null, endedBy: r.endedBy || null });
}
/** The sentence for a stop reason — '' for none (a conversation simply not running) or one this build does not word.
 *  `ended` (lane end-obeys-verdict, majordomo piece 3): an end on purpose says WHO and when — an agent by its name, a person
 *  «by hand» (the row's endedBy + stoppedAt). */
export function stoppedWhyText(reason, row = null) {
  if (reason === 'dead-socket-at-boot') return t('Its process ended while the server was down.');
  if (reason === 'ended') {
    const by = row && row.endedBy && typeof row.endedBy === 'object' ? row.endedBy : null;
    const time = row && row.stoppedAt ? stampAt(Number(row.stoppedAt)) : '';
    if (by && by.kind === 'agent' && by.forced === true) return t('Ended mid-task by «{name}» at {time}.', { name: String(by.name || '?'), time });   // a forced end: the worker was cut
    if (by && by.kind === 'agent' && by.name) return t('Terminated by «{name}» at {time}.', { name: String(by.name), time });
    return t('Terminated by hand at {time}.', { time });
  }
  return '';
}
/** The sentence for a session row (the sidebar's card): only a STOPPED row says why. */
export function stoppedWhyOf(row) {
  return row && row.status === 'stopped' ? stoppedWhyText(row.stopReason, row) : '';
}
/** The sentence for a conversation (a window's resume bar, its tile, the resume-all offer): its row in `rows`, else what a
 *  door saw listed. */
/** The stop REASON itself (lane end-obeys-verdict, 主开发's must 4): what a reader that COUNTS must ask — the Resume-all offer counts
 *  only what a restart ended (`dead-socket-at-boot`), never an end on purpose (`ended`). Same rule as stoppedWhyFor: the row's own
 *  reason, else the remembered one only for THAT stop. → the reason string, or null. */
export function stoppedReasonFor(backend, id, rows) {
  if (!id) return null;
  const k = keyOf(backend, id), r = rowFor(rows, backend, id), was = seen.get(k);
  if (r && r.status !== 'stopped') return null;
  if (r) return r.stopReason || (was && was.at && r.stoppedAt === was.at ? was.reason : null) || null;
  return was ? was.reason || null : null;
}
export function stoppedWhyFor(backend, id, rows) {
  if (!id) return '';
  const k = keyOf(backend, id), r = rowFor(rows, backend, id), was = seen.get(k);
  if (r && r.status !== 'stopped') { seen.delete(k); return ''; } // it runs again: the boot's reason is spent
  // the row's own reason first; the remembered one only for THAT stop (r2: a later stop for another reason is never worded
  // «ended while the server was down» for the page's life)
  if (r) return stoppedWhyText(r.stopReason || (was && was.at && r.stoppedAt === was.at ? was.reason : null), r.stopReason ? r : { stoppedAt: was && was.at, endedBy: was && was.endedBy });
  return stoppedWhyText(was ? was.reason : null, was ? { stoppedAt: was.at, endedBy: was.endedBy } : null);
}
/** The account a conversation's row names (a kept meta's, the agy index's account root) — a resume nobody gave an account
 *  goes there, never to the harness's default (the conversation lives in that account's store). undefined = no row says. */
export function keptAccountOf(rows, backend, id) {
  const r = rowFor(rows, backend, id);
  return r && r.status !== 'live' && typeof r.accountId === 'string' && r.accountId ? r.accountId : undefined;
}
/** B-a5a4 cure 2: a server sentence's params with its interface WORDS (`words`: the param names that hold one — the machine's
 *  login in the billing word) said in the reader's language; any other param as it is (a person's own account name). */
export function i18nParams(i) {
  const p = { ...((i && i.params) || {}) };
  for (const k of (i && Array.isArray(i.words) ? i.words : [])) if (typeof p[k] === 'string') p[k] = t(p[k]);
  return p;
}
/** THE ONE ACCOUNT A RESUME GOES TO (r2 — the Resume press's verdict, the create, the create-failure re-check all read
 *  THIS): a harness that keeps a conversation in ONE account's own store (`bound`) ⇒ the account its row names first; else
 *  the conversation's saved config names one ⇒ it; else its row's (keptAccountOf); undefined ⇒ the harness default
 *  (the server's seam then asks the same row, src/routes/sessions.js heldAccountOf). */
export function resumeAccountOf(savedAccount, rows, backend, id, { bound = false } = {}) {
  // B-a5a4 follow-up r2: a harness whose conversation lives in ONE account's own store (`bound`) resumes on the account that holds
  // it — a stale saved pick (logged in or not) was refused by the server on every press with nothing to pick
  if (bound) { const held = keptAccountOf(rows, backend, id); if (held) return held; }
  return savedAccount !== undefined && savedAccount !== null && savedAccount !== '' ? savedAccount : keptAccountOf(rows, backend, id);
}
