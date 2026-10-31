// THE WHY OF A STOPPED SESSION (lane dead-socket-keeps-chat-meta — the owner's 2026-10-30 incident: a session whose process
// ended while the server was down vanished at the next boot). The boot now keeps it STOPPED (src/server/boot-restore.js
// retireDeadSocket → /api/sessions' row: `stopReason: 'dead-socket-at-boot'`, the name / cwd / account it had), and every
// door that shows it says the same sentence: the sidebar's card, the read-only window's resume bar, the resume-all offer,
// the window's stopped tile. PURE but for t().
import { t } from './i18n.js';

const seen = new Map(); // backend:id → {reason, at} — the rows a door read before the sidebar had its list (the boot's restore)
const keyOf = (backend, id) => `${backend || 'claude'}:${id}`;
const rowFor = (rows, backend, id) => (rows || []).find((s) => s && (s.backend || 'claude') === (backend || 'claude') && (s.backendSessionId || s.sessionId) === id) || null;

/** Remember the stopped rows' reasons from a /api/sessions list (layout restoreState reads one at boot). */
export function noteStoppedRows(rows) {
  for (const r of rows || []) if (r && r.status === 'stopped' && r.stopReason) seen.set(keyOf(r.backend, r.backendSessionId || r.sessionId), { reason: r.stopReason, at: r.stoppedAt || null });
}
/** The sentence for a stop reason — '' for none (a conversation simply not running) or one this build does not word. */
export function stoppedWhyText(reason) {
  return reason === 'dead-socket-at-boot' ? t('Its process ended while the server was down.') : '';
}
/** The sentence for a session row (the sidebar's card): only a STOPPED row says why. */
export function stoppedWhyOf(row) {
  return row && row.status === 'stopped' ? stoppedWhyText(row.stopReason) : '';
}
/** The sentence for a conversation (a window's resume bar, its tile, the resume-all offer): its row in `rows`, else what a
 *  door saw listed. */
export function stoppedWhyFor(backend, id, rows) {
  if (!id) return '';
  const k = keyOf(backend, id), r = rowFor(rows, backend, id), was = seen.get(k);
  if (r && r.status !== 'stopped') { seen.delete(k); return ''; } // it runs again: the boot's reason is spent
  // the row's own reason first; the remembered one only for THAT stop (r2: a later stop for another reason is never worded
  // «ended while the server was down» for the page's life)
  if (r) return stoppedWhyText(r.stopReason || (was && was.at && r.stoppedAt === was.at ? was.reason : null));
  return stoppedWhyText(was ? was.reason : null);
}
/** The account a conversation's row names (a kept meta's, the agy index's account root) — a resume nobody gave an account
 *  goes there, never to the harness's default (the conversation lives in that account's store). undefined = no row says. */
export function keptAccountOf(rows, backend, id) {
  const r = rowFor(rows, backend, id);
  return r && r.status !== 'live' && typeof r.accountId === 'string' && r.accountId ? r.accountId : undefined;
}
/** THE ONE ACCOUNT A RESUME GOES TO (r2 — the Resume press's verdict, the create, the create-failure re-check all read
 *  THIS): the conversation's saved config names one ⇒ it; else its row's (keptAccountOf); undefined ⇒ the harness default
 *  (the server's seam then asks the same row, src/routes/sessions.js heldAccountOf). */
export function resumeAccountOf(savedAccount, rows, backend, id) {
  return savedAccount !== undefined && savedAccount !== null && savedAccount !== '' ? savedAccount : keptAccountOf(rows, backend, id);
}
