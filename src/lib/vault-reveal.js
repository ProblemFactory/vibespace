// THE PAGE'S REVEAL WINDOW (lane vault-contents-window r2 — verify r1: the window was the SIGN-IN's, so a hub with no
// sign-in shared it with every local process, and a second tab shared it too). 「验证是你」 (the second password again,
// POST /api/vault/reveal-session) answers a random PAGE SECRET; it lives HERE, in this page's memory only (a module `let` —
// never storage, never a message), and every reveal sends it back (the body, or X-Vault-Page on a GET). A reload or a
// second tab has none, so it asks again. Used by the Vault window (src/lib/vault-window.js), Manage Agents' Show key…
// and the storage edit dialog (sidebar-mounts.js) — one window per page, one countdown.
import { t } from './i18n.js';
import { createModalShell, fetchJson } from './utils.js';
import { enterSubmits } from './chat-enter-keys.js';
import { vaultWords, vaultFacts, onVaultFacts, sayVaultWait } from './vault-unlock.js';

let pageSecret = null;   // THIS page's window — memory only
let revealUntil = 0;     // its end on this page's clock (the hub's own clock is the authority)
let asking = null;
const subs = new Set();
const rvPost = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const changed = () => { for (const fn of subs) { try { fn(); } catch { /* a subscriber's own trouble */ } } };
const rvEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** ms left in this page's window (0 = none). */
export const revealLeftMs = () => (pageSecret && revealUntil > Date.now() ? revealUntil - Date.now() : 0);
/** The header a GET carries while this page's window is open (the hub reads X-Vault-Page). */
export const revealHeaders = () => (revealLeftMs() > 0 ? { 'X-Vault-Page': pageSecret } : {});
/** Follow the window (open / its time / its end). → unsubscribe. */
export function onRevealChange(fn) { subs.add(fn); return () => subs.delete(fn); }
/** A reveal answered: the hub's time left. */
export function noteRevealLeft(ms) { if (pageSecret && Number(ms) > 0) { revealUntil = Date.now() + Number(ms); changed(); } }
/** Forget the window here (a lock, the 5 minutes, the hub said so) — nothing to tell the hub. */
export function forgetReveal() { const had = !!pageSecret; pageSecret = null; revealUntil = 0; if (had) changed(); }
/** End it at the hub too (the Vault window closed / 隐藏全部). */
export async function endReveal() { const p = pageSecret; forgetReveal(); if (p) await rvPost('/api/vault/reveal-end', { page: p }); }
// lane takeover-surface-census (q-050): forget this page's window the moment the vault is not unlocked — a lock→unlock (an
// agent can lock), a hub restart or the 5-minute boundary leaves a window the hub will reject; forgetting here means the
// NEXT press asks FIRST (in its own task), never a round trip late (the second late-ask road q-050 found).
onVaultFacts((f) => { if (!f || f.state !== 'unlocked') forgetReveal(); });

/** A reveal door's refusal in the person's words (the vault's own codes first). */
export function revealWords(r) {
  const c = r && r.code;
  if (c === 'reveal_needs_password') return t('Enter the second password again to see stored values');
  if (c === 'vault_locked') return t('The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)');
  if (c === 'vault_not_set_up') return t('Set a second password first — stored values are shown only behind it');
  if (c === 'paced' && r.retryInMs && !r.failedTries) return t('Too many values shown — try again in {n} s', { n: Math.max(1, Math.ceil(r.retryInMs / 1000)) });
  if (c === 'not_found') return t('That stored value is not there any more');
  if (c === 'unreadable') return t('That stored value could not be opened');
  if (c === 'not_revealable') return t('That stored value is never shown — VibeSpace uses it itself');
  return vaultWords(r);
}

/** 「验证是你」 — the second password again ⇒ the hub's 5-minute window for THIS page. Resolves true when opened. */
export function askRevealPassword() {
  if (asking) return asking;
  asking = new Promise((resolve) => {
    let opened = false;
    const { dialog, body, close } = createModalShell({ id: 'vault-reveal-dialog', title: t('Verify it’s you'), dialogClass: 'vault-dialog-box', minWidth: 'min(420px, 92vw)', escapeToClose: true, onClose: () => { asking = null; resolve(opened); }, kind: 'decision' }); // decision: the vault password before a secret shows — the caller awaits it, one password
    body.appendChild(rvEl('p', 'vault-text', t('Enter the second password to see stored values on this page for the next 5 minutes. Another tab or window asks again. Every value you open is recorded.')));
    const pw = rvEl('input', 'vault-pw');
    pw.type = 'password'; pw.id = 'vault-reveal-pw'; pw.autocomplete = 'off'; pw.spellcheck = false; pw.placeholder = t('Second password'); pw.setAttribute('aria-label', t('Second password'));
    const err = rvEl('div', 'vault-err'); err.setAttribute('role', 'alert');
    body.append(pw, err);
    const cancel = rvEl('button', 'btn-cancel', t('Cancel'));
    cancel.onclick = () => close();
    const go = rvEl('button', 'btn-create vault-reveal-go', t('Confirm'));
    const submit = async () => {
      err.textContent = '';
      if (!pw.value) { pw.focus(); return; }
      const done = sayVaultWait(go, err, t('Verifying…'), t('Checking the second password…'));   // lane vault-slow-load: the wait is said
      const r = await rvPost('/api/vault/reveal-session', { password: pw.value });
      done();
      pw.value = '';
      if (r && r.ok && typeof r.page === 'string') { pageSecret = r.page; revealUntil = Date.now() + (Number(r.leftMs) || 0); opened = true; changed(); close(); return; }
      pw.focus();
      err.textContent = revealWords(r);
      if (r && r.code === 'vault_locked') close();
    };
    go.onclick = submit;
    pw.addEventListener('keydown', (e) => { if (enterSubmits(e)) { e.preventDefault(); submit(); } });
    const f = rvEl('div', 'dialog-footer'); f.append(cancel, go); dialog.appendChild(f);
    setTimeout(() => pw.focus(), 0);
  });
  return asking;
}

/** ONE value for ONE row reference (asks 验证是你 first when this page has no window; a stale window the hub rejects forgets + refuses — the next press asks fresh, q-050).
 *  → the door's answer { ok, value, leftMs } | { ok: false, code } (`cancelled` = the person closed the ask). */
export async function revealValue(id) {
  for (let i = 0; i < 2; i++) {
    if (!revealLeftMs() && !(await askRevealPassword())) return { ok: false, code: 'cancelled' };
    const r = await rvPost('/api/vault/reveal', { id, page: pageSecret });
    if (r && r.ok) { noteRevealLeft(r.leftMs); return r; }
    if (r && r.code === 'reveal_needs_password') { forgetReveal(); return { ok: false, code: 'reveal_needs_password' }; }
    if (r && r.code === 'vault_locked') forgetReveal();
    return r || { ok: false, code: 'error' };
  }
  return { ok: false, code: 'reveal_needs_password' };
}

/** Manage Agents' Show key…: the account route answers through this page's window (a set-up vault) — 验证是你 first when
 *  the hub asks for it. → { key } | { error, code } | null (the person closed the ask).
 *  lane takeover-surface-census: an unlocked vault always asks for the window, so with none 验证是你 opens FIRST, in the press's
 *  own task — a dialog the person's act opened takes the keys while they drive an agent's browser. Asked after the hub's
 *  refusal, it opened a round trip late (past USER_PRESS_MS, src/browser-takeover.js) and the second password went to the page. */
export async function revealAccountKey(id) {
  if (!revealLeftMs() && vaultFacts()?.state === 'unlocked' && !(await askRevealPassword())) return null;
  for (let i = 0; i < 2; i++) {
    const r = await fetchJson(`/api/accounts/${encodeURIComponent(id)}/key`, { headers: revealHeaders() });
    if (r && r.key) { noteRevealLeft(r.leftMs); return r; }
    if (!(r && r.code === 'reveal_needs_password')) return r ? { ...r, error: r.code ? revealWords(r) : r.error } : r;
    forgetReveal();
    return { code: 'reveal_needs_password', error: revealWords({ code: 'reveal_needs_password' }) };
  }
  return { code: 'reveal_needs_password', error: revealWords({ code: 'reveal_needs_password' }) };
}
