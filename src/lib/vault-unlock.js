// THE VAULT IN THE PAGE (lane vault-e2e-password — the owner 2026-10-19: "vibespace 重启后的第一次登陆必须输入 secondary
// password 解锁 vault"). Every credential the hub stores is sealed under one vault key that only the second password opens
// (src/server/vault-engine.js; the doors are src/routes/vault.js). This module draws it:
//   · LOCKED (every start) ⇒ the unlock modal right after the page loads behind its sign-in — a phone gets the same modal;
//     「稍后」 leaves a lock chip in the taskbar (the door back) and every feature that needs a key says
//     「保险库已锁定——先解锁」 (key-file-words.js);
//   · NOT SET UP ⇒ the setup modal at every load once the welcome tour is done (`maybeNagVault`, from the tour's end and
//     from app.js's onboarding check) — 「稍后」 snoozes it for THIS tab only;
//   · ⚙ System ▸ Vault… — the state, Lock now, change the second password, the idle lock (default never).
// The `vault-state` broadcast keeps every open page on one state (the multi-client law). Passwords live in the inputs and
// one request body each — never stored, never logged, never in an error line.
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { UI_ICONS } from './icons.js';
import { registerMenuItem } from './contributions.js';
import { enterSubmits } from './chat-enter-keys.js';

const MIN = 8;
let facts = null;
let appRef = null;
let activityAt = 0;

const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** A door's refusal in the person's words. */
export function vaultWords(r) {
  const c = r && r.code;
  if (c === 'wrong_password') return t('That is not the second password');
  if (c === 'paced') return t('Too many wrong passwords — try again in {n} s', { n: Math.max(1, Math.ceil((Number(r.retryInMs) || 60e3) / 1000)) });
  if (c === 'corrupt') return t('The vault record is damaged — nothing can be opened; restore data/vault.json from a backup');
  if (c === 'password_too_short') return t('At least 8 characters');
  if (c === 'same_as_sign_in') return t('The second password must not be the sign-in password');
  if (c === 'same_password') return t('The new second password is the old one');
  if (c === 'migration_failed') return t('The key files could not be moved into the vault — nothing changed ({why})', { why: (r && (r.file || r.why)) || '?' });
  if (c === 'vault_not_set_up') return t('The vault is not set up yet');
  if (c === 'already_set_up') return t('The vault is already set up');
  if (c === 'busy') return t('The vault is being set up — try again in a moment');
  if (c === 'human_only') return t('Only a person can do this');
  return t('Could not reach the vault — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') });
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function pwInput(id, placeholder, autocomplete = 'off') {
  const i = el('input', 'vault-pw');
  i.type = 'password'; i.id = id; i.placeholder = placeholder; i.autocomplete = autocomplete; i.spellcheck = false;
  i.setAttribute('aria-label', placeholder);
  return i;
}
function footerOf(dialog, buttons) {
  const f = el('div', 'dialog-footer');
  for (const b of buttons) f.appendChild(b);
  dialog.appendChild(f);
}

// ── the lock chip (taskbar + phone nav): the door back while locked ──
function drawChip() {
  const locked = !!facts && facts.state === 'locked';
  for (const [hostId, beforeId, id] of [['taskbar-tray', 'taskbar-user-todos', 'taskbar-vault'], ['mobile-nav', 'mobile-nav-todos', 'mobile-nav-vault']]) {
    const host = document.getElementById(hostId);
    let chip = document.getElementById(id);
    if (!locked) { chip?.remove(); continue; }
    if (!host || chip) continue;
    chip = el('button', 'vault-chip');
    chip.id = id; chip.type = 'button';
    chip.innerHTML = UI_ICONS.lock || '';
    chip.appendChild(el('span', 'vault-chip-label', t('Vault locked')));
    chip.title = t('Vault locked — click to unlock');
    chip.onclick = () => showUnlock();
    host.insertBefore(chip, document.getElementById(beforeId) || null);
  }
}

function applyVaultFacts(f) {
  if (!f || !f.state) return;
  facts = f;
  drawChip();
  if (f.state !== 'locked') document.getElementById('vault-unlock-dialog')?.remove();
  if (f.state !== 'not_set_up') document.getElementById('vault-setup-dialog')?.remove();
  document.getElementById('vault-dialog')?.dispatchEvent(new CustomEvent('vault-facts'));
}

/** THE UNLOCK MODAL — right after the page loads while the vault is locked. */
export function showUnlock() {
  const { dialog, body, close } = createModalShell({ id: 'vault-unlock-dialog', title: t('Unlock the vault'), dialogClass: 'vault-dialog-box', minWidth: 'min(420px, 92vw)', closeOnBackdrop: false });
  body.appendChild(el('p', 'vault-text', t('VibeSpace restarted — the credentials it stores (accounts, mounts, channels, integrations, app logins, passkeys) stay locked until you enter the second password.')));
  const pw = pwInput('vault-unlock-pw', t('Second password'));
  const err = el('div', 'vault-err'); err.setAttribute('role', 'alert');
  body.append(pw, err);
  const later = el('button', 'btn-cancel vault-later', t('Later'));
  later.onclick = () => close();
  const go = el('button', 'btn-create vault-unlock-go', t('Unlock'));
  const submit = async () => {
    err.textContent = '';
    if (!pw.value) { pw.focus(); return; }
    go.disabled = true;
    const r = await post('/api/vault/unlock', { password: pw.value });
    go.disabled = false;
    if (r && r.ok) { pw.value = ''; applyVaultFacts(r); close(); showToast(t('Vault unlocked')); return; }
    pw.value = ''; pw.focus();
    err.textContent = vaultWords(r);
    if (r && r.state) applyVaultFacts(r);
  };
  go.onclick = submit;
  pw.addEventListener('keydown', (e) => { if (enterSubmits(e)) { e.preventDefault(); submit(); } });
  footerOf(dialog, [later, go]);
  setTimeout(() => pw.focus(), 0);
}

/** THE SETUP MODAL — the second password, twice, with the plain warning. `nag` = the load-time ask (「稍后」 snoozes this tab). */
export function showSetup({ nag = false } = {}) {
  const { dialog, body, close } = createModalShell({ id: 'vault-setup-dialog', title: t('Set a second password'), dialogClass: 'vault-dialog-box', minWidth: 'min(460px, 92vw)', closeOnBackdrop: false });
  body.appendChild(el('p', 'vault-text', t('Every credential VibeSpace stores is sealed in a vault that only this second password opens. After every restart, the first sign-in asks for it; until then nothing stored can be read.')));
  body.appendChild(el('p', 'vault-warn', t('There is no recovery: forget it and the stored credentials are gone — you would connect every account again. An export of the credentials is not part of this version.')));
  const a = pwInput('vault-setup-pw', t('Second password'), 'new-password');
  const b = pwInput('vault-setup-pw2', t('Repeat the second password'), 'new-password');
  const err = el('div', 'vault-err'); err.setAttribute('role', 'alert');
  body.append(a, b, err);
  const later = el('button', 'btn-cancel vault-later', t('Later'));
  later.onclick = () => { if (nag) { try { sessionStorage.setItem('vs-vault-later', '1'); } catch { } } close(); };
  const go = el('button', 'btn-create vault-setup-go', t('Set'));
  const submit = async () => {
    err.textContent = '';
    if ([...a.value].length < MIN) { err.textContent = t('At least 8 characters'); a.focus(); return; }
    if (a.value !== b.value) { err.textContent = t('The two passwords differ'); b.focus(); return; }
    go.disabled = true;
    const r = await post('/api/vault/setup', { password: a.value });
    go.disabled = false;
    if (r && r.ok) { a.value = ''; b.value = ''; applyVaultFacts(r); close(); showToast(t('Vault set up — {n} key(s) sealed', { n: (r.sealed || []).length })); return; }
    err.textContent = vaultWords(r);
  };
  go.onclick = submit;
  b.addEventListener('keydown', (e) => { if (enterSubmits(e)) { e.preventDefault(); submit(); } });
  footerOf(dialog, [later, go]);
  setTimeout(() => a.focus(), 0);
}

function showChange() {
  const { dialog, body, close } = createModalShell({ id: 'vault-change-dialog', title: t('Change the second password'), dialogClass: 'vault-dialog-box', minWidth: 'min(440px, 92vw)', escapeToClose: true });
  const o = pwInput('vault-old-pw', t('Current second password'));
  const a = pwInput('vault-new-pw', t('New second password'), 'new-password');
  const b = pwInput('vault-new-pw2', t('Repeat the second password'), 'new-password');
  const err = el('div', 'vault-err'); err.setAttribute('role', 'alert');
  body.append(o, a, b, err);
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  cancel.onclick = () => close();
  const go = el('button', 'btn-create vault-change-go', t('Change'));
  go.onclick = async () => {
    err.textContent = '';
    if ([...a.value].length < MIN) { err.textContent = t('At least 8 characters'); return; }
    if (a.value !== b.value) { err.textContent = t('The two passwords differ'); return; }
    go.disabled = true;
    const r = await post('/api/vault/change', { old: o.value, new: a.value });
    go.disabled = false;
    if (r && r.ok) { o.value = a.value = b.value = ''; applyVaultFacts(r); close(); showToast(t('Second password changed')); return; }
    o.value = ''; err.textContent = vaultWords(r);
  };
  footerOf(dialog, [cancel, go]);
  setTimeout(() => o.focus(), 0);
}

const STATE_WORD = { unlocked: () => t('Unlocked'), locked: () => t('Locked'), not_set_up: () => t('Not set up') };
const IDLE_HOURS = [0, 1, 4, 8, 24];

/** ⚙ System ▸ Vault… — the state, the doors, the idle lock. */
export async function openVaultDialog() {
  const f = await fetchJson('/api/vault/state');
  if (f && f.state) applyVaultFacts(f);
  const { overlay, body } = createModalShell({ id: 'vault-dialog', title: t('Vault'), dialogClass: 'vault-dialog-box', minWidth: 'min(440px, 92vw)', escapeToClose: true });
  const draw = () => {
    body.textContent = '';
    const st = (facts && facts.state) || 'not_set_up';
    const line = el('div', 'vault-state-line');
    line.dataset.state = st;
    line.innerHTML = (st === 'unlocked' ? UI_ICONS.unlock : UI_ICONS.lock) || '';
    line.appendChild(el('span', 'vault-state-word', (STATE_WORD[st] || STATE_WORD.locked)()));
    if (facts && facts.setUpAt) line.appendChild(el('span', 'vault-state-when', t('Set up {when}', { when: new Date(facts.setUpAt).toLocaleString() })));
    body.appendChild(line);
    const row = el('div', 'vault-actions');
    const btn = (label, cls, fn) => { const b = el('button', cls, label); b.onclick = fn; row.appendChild(b); return b; };
    if (st === 'not_set_up') btn(t('Set a second password'), 'btn-create vault-do-setup', () => showSetup());
    if (st === 'locked') btn(t('Unlock'), 'btn-create vault-do-unlock', () => showUnlock());
    if (st === 'unlocked') btn(t('Lock now'), 'btn-cancel vault-do-lock', async () => { const r = await post('/api/vault/lock'); if (r && r.ok) { applyVaultFacts(r); showToast(t('Vault locked')); } else showToast(vaultWords(r), { type: 'error' }); });
    if (st !== 'not_set_up') btn(t('Change the second password'), 'btn-cancel vault-do-change', () => showChange());
    body.appendChild(row);
    if (st !== 'not_set_up') {
      const idle = el('label', 'vault-idle');
      idle.appendChild(el('span', null, t('Lock after idle')));
      const sel = document.createElement('select');
      sel.className = 'vault-idle-select';
      for (const h of IDLE_HOURS) { const o = document.createElement('option'); o.value = String(h); o.textContent = h ? t('{n} h', { n: h }) : t('Never'); sel.appendChild(o); }
      sel.value = String((facts && facts.idleLockHours) || 0);
      sel.title = t('Lock the vault after this long with no keyboard or mouse on any VibeSpace page');
      sel.onchange = async () => { const r = await post('/api/vault/idle', { hours: Number(sel.value) }); if (r && r.ok) applyVaultFacts(r); else showToast(vaultWords(r), { type: 'error' }); };
      idle.appendChild(sel);
      body.appendChild(idle);
    }
  };
  overlay.addEventListener('vault-facts', draw);
  draw();
}

/** The load-time ask while NOT SET UP — after the welcome tour (setup-flows.js) or straight away when there is none
 *  (app.js `_maybeShowOnboarding`). Snoozed for this tab by 「稍后」, or by `vs-vault-later` (an epoch ms in localStorage:
 *  the chrome suites' scratch hubs — scripts/scratch.mjs ONBOARDED_SOURCE). Never shown while the vault is set up. */
export async function maybeNagVault() {
  if (!facts) { const f = await fetchJson('/api/vault/state'); if (f && f.state) applyVaultFacts(f); }
  if (!facts || facts.state !== 'not_set_up') return;
  try { if (sessionStorage.getItem('vs-vault-later') || Number(localStorage.getItem('vs-vault-later') || 0) > Date.now()) return; } catch { }
  if (document.getElementById('vault-setup-dialog')) return;
  showSetup({ nag: true });
}

/** Boot: read the state, follow the broadcast, and ask for the second password while locked. */
export async function initVault(app) {
  appRef = app;
  appRef?.ws?.onGlobal?.((msg) => { if (msg && msg.type === 'vault-state') applyVaultFacts(msg); });
  // the idle lock's clock: a person's keyboard / pointer, at most one ping per 5 min, only while an idle lock is set
  const ping = () => {
    if (!facts || facts.state !== 'unlocked' || !facts.idleLockHours || Date.now() - activityAt < 300e3) return;
    activityAt = Date.now();
    post('/api/vault/active');
  };
  document.addEventListener('pointerdown', ping, { capture: true, passive: true });
  document.addEventListener('keydown', ping, { capture: true, passive: true });
  const f = await fetchJson('/api/vault/state');
  if (!f || !f.state) return;
  applyVaultFacts(f);
  if (f.state === 'locked') showUnlock();
}

registerMenuItem({
  menu: 'gear', parent: 'system', order: 62, icon: UI_ICONS.lock, // gear-menu.js head 'system'; Integrations… 55 · Change password… 60 · this 62 (test-gear-menu: Integrations sits right before the password row)
  label: () => t('Vault…'),
  run: () => openVaultDialog(),
});
