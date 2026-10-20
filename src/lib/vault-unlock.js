// THE VAULT IN THE PAGE (lane vault-e2e-password — the owner 2026-10-19: "vibespace 重启后的第一次登陆必须输入 secondary
// password 解锁 vault"). Every credential the hub stores is sealed under one vault key that only the second password opens
// (src/server/vault-engine.js; the doors are src/routes/vault.js). This module draws it:
//   · LOCKED (every start) ⇒ the unlock modal right after the page loads behind its sign-in — a phone gets the same modal;
//     「稍后」 leaves a lock chip in the taskbar (the door back) and every feature that needs a key says
//     「保险库已锁定——先解锁」 (key-file-words.js);
//   · NOT SET UP ⇒ the setup modal at every load once the welcome tour is done (`maybeNagVault`, from the tour's end and
//     from app.js's onboarding check) — 「稍后」 snoozes it for THIS tab only;
//   · the Vault WINDOW's header (src/lib/vault-window.js; ⚙ System ▸ Vault…, the ONE row — lane vault-one-door) draws the
//     state and its doors: set up / unlock / lock now / change the second password / the idle lock (default never). This
//     module keeps the modals those doors open and the requests behind them (`lockNow`, `setIdleHours`, `onVaultFacts`).
// The `vault-state` broadcast keeps every open page on one state (the multi-client law). Passwords live in the inputs and
// one request body each — never stored, never logged, never in an error line.
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { UI_ICONS } from './icons.js';
import { enterSubmits } from './chat-enter-keys.js';
import { replayOpenSpec } from './window-types.js'; // the door (vs-vault-door) opens the Vault window while unlocked (src/lib/vault-window.js registers it)

const MIN = 8;
let facts = null;
let appRef = null;
let activityAt = 0;
const factsListeners = new Set();   // the Vault window's header (onVaultFacts)

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

// ── the persistent lock-warning strip (lane vault-relock-door, owner 2026-10-20 「那需要一个常驻的警告提醒还没解锁」): while the
// vault is LOCKED a strip at the top of the workspace says so with an Unlock button — the maintenance banner's shape and
// place (a flex child of #main-wrapper, BELOW it when both show). It is NOT dismissable (no ×, no 「稍后」 — only the
// unlock dialog's 「稍后」 closes the dialog). Drawn by applyVaultFacts: shown WHENEVER locked (incl. after a person's lock
// act), removed as soon as the vault is unlocked or not set up. ──
function drawLockStrip() {
  const locked = !!facts && facts.state === 'locked';
  let strip = document.getElementById('vault-lock-strip');
  if (!locked) { strip?.remove(); return; }
  if (strip) return;
  const wrap = document.getElementById('main-wrapper');
  if (!wrap) return;
  strip = el('div', 'vault-lock-strip');
  strip.id = 'vault-lock-strip';
  strip.setAttribute('role', 'status');
  const ic = el('span', 'vls-ic'); ic.innerHTML = UI_ICONS.lock || '';
  const go = el('button', 'vls-unlock', t('Unlock…'));
  go.type = 'button';
  go.onclick = () => window.dispatchEvent(new CustomEvent(VAULT_DOOR_EVENT));
  strip.append(ic, el('span', 'vls-text', t('The vault is locked — device links, the relay and account switching are waiting.')), go);
  // below the maintenance banner (that one inserts itself as #main-wrapper's first child), else the first strip at the top
  const mb = document.getElementById('maintenance-banner');
  if (mb && mb.parentNode === wrap) wrap.insertBefore(strip, mb.nextSibling);
  else wrap.insertBefore(strip, wrap.firstChild);
}

function applyVaultFacts(f) {
  if (!f || !f.state) return;
  facts = f;
  drawChip();
  drawLockStrip();   // lane vault-relock-door: the persistent warning while locked (shown/removed with the state, never per restart)
  if (f.state !== 'locked') document.getElementById('vault-unlock-dialog')?.remove();
  if (f.state !== 'not_set_up') document.getElementById('vault-setup-dialog')?.remove();
  for (const fn of [...factsListeners]) { try { fn(f); } catch { /* one header's error never stops another */ } }
}

/** The vault's facts as this page knows them (null before the first read). */
export const vaultFacts = () => facts;
/** Follow the facts — every door's answer and the `vault-state` broadcast → `off()`. The Vault window's header. */
export function onVaultFacts(fn) { factsListeners.add(fn); return () => factsListeners.delete(fn); }
/** Read the state now (the Vault window's header, when the window opens). */
export async function refreshVaultFacts() { const f = await fetchJson('/api/vault/state'); if (f && f.state) applyVaultFacts(f); return facts; }
/** 立即锁定 (the Vault window's header). A lock signs every login out (vault-e2e-password-fix-r2): the page may land on the sign-in. */
export async function lockNow() {
  const r = await post('/api/vault/lock');
  if (r && r.ok) { applyVaultFacts(r); showToast(t('Vault locked')); } else showToast(vaultWords(r), { type: 'error' });
  return r;
}
/** 闲置后锁定 (the Vault window's header): hours, 0 = never. The door answers `{ok, idleLockHours}` — merged into the facts. */
export async function setIdleHours(hours) {
  const r = await post('/api/vault/idle', { hours: Number(hours) });
  if (r && r.ok) { if (facts) applyVaultFacts({ ...facts, idleLockHours: r.idleLockHours }); } else showToast(vaultWords(r), { type: 'error' });
  return r;
}
/** The state's icon as an element — the Vault window's header (that module names no HTML sink: test-vault-inventory ①b). */
export function stateIconEl(state) { const s = el('span', 'vault-state-icon'); s.innerHTML = (state === 'unlocked' ? UI_ICONS.unlock : UI_ICONS.lock) || ''; return s; }

/** THE DOOR (lane vault-e2e-password-fix-r2): every card that cannot read its secret while the vault is LOCKED (a channel, the
 *  voice sign-in, the relay, a machine's session) says 「保险库已锁定——先解锁」 and offers this — the unlock modal (or, once
 *  unlocked meanwhile, the Vault window; not set up, the setup modal). One event (`window.dispatchEvent(new CustomEvent('vs-vault-door'))`), so a card
 *  needs no import of this module. */
const VAULT_DOOR_EVENT = 'vs-vault-door';

/** THE UNLOCK MODAL — right after the page loads while the vault is locked. */
export function showUnlock() {
  if (document.getElementById('vault-unlock-dialog')) return;   // one modal (the door may be pressed while it is open)
  const { dialog, body, close } = createModalShell({ id: 'vault-unlock-dialog', title: t('Unlock the vault'), dialogClass: 'vault-dialog-box', minWidth: 'min(420px, 92vw)', closeOnBackdrop: false });
  body.appendChild(el('p', 'vault-text', t('The credentials VibeSpace stores (accounts, mounts, channels, integrations, app logins, passkeys, the links to paired machines, the relay and voice sign-ins) stay locked until you enter the second password — after every restart and every lock.')));
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

/** 修改第二密码… (the Vault window's header, locked or unlocked — the change rewraps under the old password either way). */
export function showChange() {
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

/** A `vault-state` this page received (the boot fetch, the broadcast, a reconnect's re-read): apply it, then decide whether
 *  to RE-ASK. lane vault-relock-door: a LOCKED state whose `startedAt` differs from the one this page last saw is a RESTART
 *  (the server booted again — the DEK was zeroed by law) — open the unlock modal ONCE for that boot. A lock ACT (the SAME
 *  startedAt: 立即锁定 from another device, an agent's lock, the idle lock) draws only the chip + the persistent strip
 *  (applyVaultFacts); the dialog stays closed, and a 「稍后」 within one boot survives every later lock act. */
function onVaultState(f) {
  const prevStartedAt = facts ? facts.startedAt : undefined;
  applyVaultFacts(f);
  if (f && f.state === 'locked' && f.startedAt != null && f.startedAt !== prevStartedAt) showUnlock();
}

/** Boot: read the state, follow the broadcast, and ask for the second password while locked. */
export async function initVault(app) {
  appRef = app;
  appRef?.ws?.onGlobal?.((msg) => { if (msg && msg.type === 'vault-state') onVaultState(msg); });
  // lane vault-relock-door: a bundle-preserving restart (a crash, the Restart=always respawn, a same-build systemctl
  // restart) reconnects this tab WITHOUT a reload — the stale-bundle reload fires only when the bundle CHANGED (app.js
  // `_checkBundleFreshness`). So on every reconnect AFTER the boot read, re-read the state: a NEW boot (`startedAt`) re-asks
  // the second password, while a reconnect to the SAME process (the same startedAt) changes nothing. The gate matters: the
  // page's first ws connect is the load itself — the boot read below is the one that asks then, after the app's DOM exists.
  let vaultBooted = false;
  appRef?.ws?.onStateChange?.((connected) => { if (connected && vaultBooted) fetchJson('/api/vault/state').then((f) => { if (f && f.state) onVaultState(f); }).catch(() => {}); });
  // the idle lock's clock: a person's keyboard / pointer, at most one ping per 5 min, only while an idle lock is set
  const ping = () => {
    if (!facts || facts.state !== 'unlocked' || !facts.idleLockHours || Date.now() - activityAt < 300e3) return;
    activityAt = Date.now();
    post('/api/vault/active');
  };
  document.addEventListener('pointerdown', ping, { capture: true, passive: true });
  document.addEventListener('keydown', ping, { capture: true, passive: true });
  window.addEventListener(VAULT_DOOR_EVENT, () => { if (facts && facts.state === 'unlocked') replayOpenSpec(appRef, { action: 'openVault' }); else if (facts && facts.state === 'not_set_up') showSetup(); else showUnlock(); });   // lane vault-one-door: the window, not the old ⚙ dialog
  const f = await fetchJson('/api/vault/state');
  vaultBooted = true;   // from here a reconnect may re-ask; the first connect was the load, handled by this read
  if (!f || !f.state) return;
  // the LOAD-TIME ask is unconditional (the original behaviour): the page always asks for the second password while locked at
  // load — `maybeNagVault` (app.js) may have pre-read the facts, so the startedAt gate (reconnect only) must NOT suppress it.
  applyVaultFacts(f);
  if (f.state === 'locked') showUnlock();
}
