// THE ONE RESET-CREDIT CONFIRM DIALOG (docs/design-reset-credits.zh.md §5, p2).
// Three entry points open it and nothing else spends a credit by hand: the
// Manage Agents roster's "Use…" button, the wall / auto-resume arm card's
// button in chat, and the ask-mode For-you item. What it SAYS is the PURE
// `dialogModel` (src/reset-credit.js — the same sentences the For-you item and
// the auto notice use); this module only fetches the server's preview, draws
// it (textContent — every string, including the account name, is data), and
// POSTs the one decision. Owner rulings: nothing is ever spent without this
// Confirm; a refusal is shown BY NAME with the button disabled, never a silent
// no-op; a failed POST reaches the user as a toast.
import { t, deviceLocale } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { UI_ICONS } from './icons.js';
import { dialogModel, refusalLine } from '../reset-credit.js';

/** An instant in the device's own words (the dialog names WHEN, never UTC). */
export function fmtInstant(sec) {
  const d = new Date(Number(sec) * 1000);
  try { return d.toLocaleString(deviceLocale(), { dateStyle: 'medium', timeStyle: 'short' }); } catch { return d.toLocaleString(); }
}
const words = (l) => t(l.key, l.params || {});

/**
 * openResetCreditDialog(app, {accountKey, sessionId?, todoId?}) — THE entry
 * point (the three callers pass what they know: the row's usage key; the
 * card's `resetCredit.accountKey` + its window's session; the item's
 * `action.accountKey` + `action.sessionId` + the item id, resolved after the
 * decision: Confirm ⇒ done, "Not now" ⇒ dismissed, closing ⇒ left open).
 * Resolves to 'used' | 'declined' | 'closed' | 'failed'.
 */
export async function openResetCreditDialog(app, { accountKey, sessionId = null, todoId = null } = {}) {
  if (!accountKey) { showToast(t('No account is named for this reset credit'), { type: 'error' }); return 'failed'; }
  const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  const p = await fetchJson(`/api/accounts/${encodeURIComponent(accountKey)}/reset-credit${q}`);
  if (!p || !p.key) {
    showToast(t('Could not read the reset credits — {reason}', { reason: (p && p.error) || t('server unreachable') }), { type: 'error' });
    return 'failed';
  }
  if (!p.name) p.name = t('CLI login'); // no account record = the machine's own login
  const m = dialogModel(p, { nowSec: Math.floor(Date.now() / 1000), fmtTime: fmtInstant });
  const resolveTodo = async (status) => {
    if (!todoId) return;
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(todoId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r || !r.success) showToast(t('Could not update the item') + (r?.error ? `: ${r.error}` : ''), { type: 'error' });
  };
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    const { dialog, body, close } = createModalShell({ id: 'reset-credit-dialog', title: t('Use a reset credit'), bodyClass: 'reset-credit-body', minWidth: 'min(460px, 92vw)', escapeToClose: true, onClose: () => settle('closed') });
    for (const l of m.lines) {
      const el = document.createElement('div');
      el.className = 'reset-credit-line';
      el.textContent = words(l);
      body.appendChild(el);
    }
    if (m.refusal) {
      const el = document.createElement('div');
      el.className = 'reset-credit-refusal usage-warn';
      el.innerHTML = UI_ICONS.alert || '';
      const s = document.createElement('span'); s.textContent = words(m.refusal);
      el.appendChild(s);
      body.appendChild(el);
    }
    const footer = document.createElement('div'); footer.className = 'dialog-footer';
    if (todoId) {
      const no = document.createElement('button'); no.className = 'btn-cancel reset-credit-decline'; no.textContent = t('Not now');
      no.title = t('Keep the credit — the item is dismissed');
      no.onclick = async () => { await resolveTodo('dismissed'); settle('declined'); close(); };
      footer.appendChild(no);
    }
    const cancel = document.createElement('button'); cancel.className = 'btn-cancel'; cancel.textContent = t('Cancel');
    cancel.onclick = () => close();
    const ok = document.createElement('button'); ok.className = 'btn-create reset-credit-confirm'; ok.textContent = t('Use a reset credit');
    ok.disabled = !m.canConfirm;
    if (m.refusal) ok.title = words(m.refusal);
    ok.onclick = async () => {
      ok.disabled = true;
      const r = await fetchJson(`/api/accounts/${encodeURIComponent(p.key)}/reset-credit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: p.sessionId || sessionId || null }) });
      if (r && r.ok) {
        showToast(t('Reset credit requested on {account} — the result arrives as a notice and in the usage panel', { account: p.name || p.key }));
        await resolveTodo('done');
        settle('used'); close();
        return;
      }
      const why = r && r.code ? words(refusalLine(r.code, { until: r.cooldownUntilSec ? fmtInstant(r.cooldownUntilSec) : null, why: r.error, member: r.restartPending ? (r.restartPending.name || r.restartPending.id || null) : null })) : (r && r.error) || t('server unreachable');
      showToast(t('Reset credit not used — {reason}', { reason: why }), { type: 'error' });
      settle('failed'); close();
    };
    footer.append(cancel, ok);
    dialog.appendChild(footer);
  });
}
