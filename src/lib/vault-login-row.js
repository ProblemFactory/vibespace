// WEB LOGINS IN THE VAULT WINDOW (lane browser-login, P3 of the custom browser kernel — the hub's half: src/server/browser-logins.js
// over PURE src/browser-login.js). A website login's row (kind 'login', purpose Web logins) gets:
//   · its provenance line (the owner's own · registered by an agent through the vault · typed by an agent itself) — the row's detail;
//   · 「用于…」: who may have Hub fill it on that site — THIS account, ANY account on this site, or ANY site — to running
//     conversations, Task Groups or everyone (POST /api/vault/web-logins/grants; one row of the ONE grants store per scope); the
//     chips list the grants that reach this login, ✕ takes one back. VibeSpace never hands the password to an agent: Hub types it;
//   · 显示 = the password (the window's reveal door — the second password again), 删除 = its own door (its own grant row goes too).
// 添加 → 「网站登录…」: the owner's own login (the site's address, the user name, the password, an optional paired two-step entry).
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { showTotpAddDialog } from './vault-totp-row.js';   // lane vault-2fa-pick: the add dialog's «Two-step code…» door (an empty vault's list offers it)
import { otpField } from './vault-otp-field.js';   // lane vault-2fa-pick: the two-step field's OWN list (never the browser's native one)
import { chipSiteOf } from './use-login-words.js';   // lane login-request-card: one login, several sites — a chip's site (the picker's own row: vault-login-grants.js)

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const failWords = (r) => t('Not done — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') });
const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
/** A subject of the picker (`session:<cid>` | `group:<gid>` | 'everyone') ⇄ the grant model's principal key. */
const keyOfSubject = (s) => (s === 'everyone' ? 'everyone' : /^session:/.test(s) ? `conversation:${s.slice(8)}` : /^group:/.test(s) ? s : null);
const keyOfEntry = (e) => (e && e.kind === 'everyone' ? 'everyone' : e && e.kind === 'group' ? `group:${e.id}` : e && e.kind === 'conversation' ? `conversation:${e.key}` : null);

/** The window's web-login facts: every login's grants + the picker's subjects (never a password). */
export async function loadLogins() {
  const r = await fetchJson('/api/vault/web-logins');
  return r && r.ok ? r : null;
}
function principalName(e, data) {
  const k = keyOfEntry(e);
  if (k === 'everyone') return t('Everyone');
  const all = [...((data && data.subjects && data.subjects.sessions) || []), ...((data && data.subjects && data.subjects.groups) || [])];
  const hit = all.find((s) => keyOfSubject(s.subject) === k);
  return hit ? hit.name : e.name || (e.kind === 'group' ? `${t('Task group')} ${e.id}` : String(e.key || ''));
}

/** A web login's row extras: `box` (what it holds + pending notice + grant chips, for the main column), `doors` (Confirm / Discard /
 *  用于…). `show` = the row's 显示. `doors` (the window's, src/lib/vault-login-grants.js) = `held` (what the login holds, drawn FIRST)
 *  and the openers `grant`, `anySite`, `anyAccount`. */
export function loginExtras(row, data, { refresh, show, doors: open = {} } = {}) {
  const entry = ((data && data.entries) || []).find((e) => e.name === row.entry) || { name: row.entry, grants: [] };
  if (show) show.title = t('Shows the password — after the second password. VibeSpace never hands it to an agent: it types it itself, only on the matching site, into the field the agent names');
  const box = el('div', 'vw-ak vw-login');
  box.dataset.login = row.entry;
  // what it holds FIRST — the bound two-step code leads (the owner 2026-11-17: «比如绑定了哪个两步验证码»)
  const held = typeof open.held === 'function' ? open.held(entry, data, { refresh }) : null;
  if (held) box.append(held);
  if (entry.pending === 'register' || entry.pending === 'change') {
    box.append(el('div', 'vw-desc-pending vw-login-pending', entry.pending === 'register'
      ? t('Pending your confirmation — registered by an agent (Confirm promotes it to current; Discard removes it)')
      : t('Pending your confirmation — generated replacement password (Confirm promotes it to current and keeps the old password in previous; Discard drops the candidate)')));
  }
  const chips = el('div', 'vw-ak-grants');
  const grants = (entry.grants || []).filter((g) => !g.unknown);
  if (grants.length) {
    chips.append(el('span', 'vw-ak-to', t('Filled for:')));
    for (const g of grants) for (const p of g.to || []) {
      const chip = el('span', 'vw-ak-chip');
      chip.dataset.scope = g.scope || '';
      const on = chipSiteOf(entry, g);   // one login, several sites: a row of an added site names that site
      if (g.scope === 'this-account') {
        // this login's OWN grant: taken back here
        chip.append(el('span', null, on ? `${principalName(p, data)} · ${on}` : principalName(p, data)));
        const x = el('button', 'vw-ak-x', '✕');
        x.type = 'button'; x.title = t('Take this grant back'); x.setAttribute('aria-label', x.title);
        x.onclick = async () => { const r = await post('/api/vault/web-logins/ungrant', { resource: g.resource, principal: keyOfEntry(p) }); if (!r || !r.ok) showToast(failWords(r), { type: 'error' }); refresh?.(); };
        chip.append(x);
      } else {
        // a WIDER grant reaches this login: «through» it, NO ✕ here (it is taken back at its own door — never from one login's row)
        chip.classList.add('vw-ak-chip-through');
        chip.append(el('span', null, `${principalName(p, data)} · ${g.scope === 'any-site' ? t('through: any site') : t('through: any account on this site')}${on ? ` · ${on}` : ''}`));
        const d = el('button', 'vw-ak-door', t('Open that grant…'));   // the label names the act; the «through» words name the grant
        d.type = 'button';
        d.onclick = () => (g.scope === 'any-site' ? open.anySite?.(data, { refresh }) : open.anyAccount?.(data, { refresh, site: g.site || entry.origin }));   // an added site's row: ITS site's dialog
        chip.append(d);
      }
      chips.append(chip);
    }
    box.append(chips);
  }
  const doors = [];
  if (entry.pending === 'register' || entry.pending === 'change') {
    const confirmB = el('button', 'vw-btn vw-login-confirm', t('Confirm'));
    confirmB.type = 'button';
    confirmB.title = t('Promotes the pending password to current in the vault');
    confirmB.onclick = async () => {
      const r = await post('/api/vault/web-logins/confirm', { name: entry.name, ...(entry.rev != null ? { rev: entry.rev } : {}) });
      if (!r || !r.ok) showToast(failWords(r), { type: 'error' });
      else showToast(t('Confirmed the password in the vault'));
      refresh?.();
    };
    const discardB = el('button', 'vw-btn vw-login-discard', t('Discard'));
    discardB.type = 'button';
    discardB.title = t('Discards the pending password without changing current');
    discardB.onclick = async () => {
      const r = await post('/api/vault/web-logins/discard', { name: entry.name, ...(entry.rev != null ? { rev: entry.rev } : {}) });
      if (!r || !r.ok) showToast(failWords(r), { type: 'error' });
      else showToast(t('Discarded the pending password'));
      refresh?.();
    };
    doors.push(confirmB, discardB);
  }
  // B-ab6c (the owner 2026-11-26): the password changed HERE — the form with the site and the user name fixed, one field for the new one
  const changeB = el('button', 'vw-btn vw-login-change', t('Change password…'));
  changeB.type = 'button';
  changeB.title = t('Type its new password — the current one is kept as the previous one');
  changeB.onclick = () => showLoginChangeDialog(entry, { refresh });
  doors.push(changeB);
  // …and the previous one back by a swap (a person's press; shown only when the login keeps one — never its age or content here)
  if (entry.hasPrevious) {
    const prevB = el('button', 'vw-btn vw-login-previous', t('Use the previous password'));
    prevB.type = 'button';
    prevB.title = t('Makes the previous password current again — the current one becomes the previous one');
    prevB.onclick = async () => {
      prevB.disabled = true;
      const r = await post('/api/vault/web-logins/use-previous', { name: entry.name, ...(entry.rev != null ? { rev: entry.rev } : {}) });
      prevB.disabled = false;
      if (r && r.ok) showToast(t('The previous password is now current — press «Use the previous password» again to undo'));
      else showToast(loginRefusalWords(r && r.code, r), { type: 'error' });
      try { refresh(); } catch { }
    };
    doors.push(prevB);
  }
  const useB = el('button', 'vw-btn vw-login-grant', t('Use for…'));
  useB.type = 'button';
  useB.title = t('Choose who may sign in with this login — VibeSpace never hands them the password');
  useB.onclick = () => open.grant?.(entry, data, { refresh });
  doors.push(useB);
  return { box, doors };
}

// 用于… — who may have THIS login filled: src/lib/vault-login-grants.js (the owner 2026-11-17 — one dialog, one resource; the wider grants
// at their own doors on the «Web logins» header; a wider admit shown locked «through»). The window hands this row its openers (`doors`):
// this module imports no dialog, so what imports it for its add fields (the paste box, the login card) does not carry the picker.

/** THE ADD DOOR'S FIELDS — ONE form module (lane login-request-card, B-a681): the Vault window's 添加 ▸ 网站登录… dialog AND the
 *  login card an agent's ask files in For you (src/lib/vault-paste-box.js) draw THESE fields, and one validator stands behind both
 *  (src/server/browser-logins.js addOwn). `fixed` = the card's: the site the ask names, shown and not editable. → the inputs, the
 *  labelled `fields` in order, the add door's `hint`, the two-step field's list (`otpList` — placed under the field's row;
 *  `otpPick` its handle), `values()` (the body the add door posts) and `field()`. `addCode` = the caller's «Two-step code…»
 *  door, which the list offers when the vault holds no code. */
export function loginFields({ site = '', fixed = false, addCode = null, user: userName = '', fixedUser = false, change = false } = {}) {   // B-ab6c: `fixedUser` + `change` — Change password… and the update card
  const field = (label, control) => { const l = el('label', 'vault-secret-field'); l.append(el('span', 'vault-secret-label', label), control); return l; };
  const input = (cls, type, ph) => { const i = el('input', `vault-pw ${cls}`); i.type = type; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = ph; return i; };
  const s = input('vault-login-site', 'text', t('The site — e.g. https://example.com'));
  if (fixed) { s.value = String(site || ''); s.readOnly = true; s.setAttribute('aria-readonly', 'true'); }   // the card's: the ask fixed it
  const user = input('vault-login-user', 'text', t('The user name or email you sign in with'));
  if (fixedUser) { user.value = String(userName || ''); user.readOnly = true; user.setAttribute('aria-readonly', 'true'); }   // B-ab6c: the login's own, shown
  const pw = input('vault-login-pass', 'password', change ? t('The new password') : t('Its password'));
  pw.autocomplete = 'new-password';
  const otp = input('vault-login-otp', 'text', t('Optional — the name of its two-step code in this vault'));
  // lane vault-totp-add: the field offers the two-step codes the vault holds (names only — GET /api/vault/totp). lane
  // vault-2fa-pick (the owner: «只弹出了我截图里那个浏览器的推荐输入，没有vibespace自己的下拉框»): through THE PAGE's own list —
  // headed, a row per code BY NAME (the vault's own names — no record is unsealed to decorate a row: the owner's word,
  // 2026-11-17 20:36Z) — never the browser's native list, which every platform draws as its own
  // suggestion (src/lib/vault-otp-field.js)
  const otpPick = otpField(otp, { addCode });
  const hint = el('div', 'vw-ak-hint', t('Only the site itself (its exact address, over https) is ever filled with it — never another site, never a frame of one.'));
  const values = () => ({ origin: s.value.trim(), username: user.value.trim(), loginPassword: pw.value, ...(otp.value.trim() ? { totpName: otp.value.trim() } : {}) });
  const otpRow = field(t('Two-step code'), otpPick.wrap);   // (not «otpField»: that is the imported field maker above — a local of that name put the maker's call in its dead zone)
  const otpWords = otpRow.querySelector('.vault-secret-label');   // the open list sits inside this <label>: the field is named by the label's words alone
  if (otpWords) { otpWords.id = `${otp.getAttribute('aria-controls')}-label`; otp.setAttribute('aria-labelledby', otpWords.id); }
  return { site: s, user, pw, otp, otpPick, otpList: otpPick.el, hint, field, values, fields: [field(t('Site'), s), field(t('User name'), user), field(change ? t('New password') : t('Password'), pw), otpRow] };
}
/** The add door's refusals in words — the dialog's and the card's (one map; the card's own codes too). */
export function loginRefusalWords(code, r) {
  return code === 'login_bad_origin' ? t('Give the site\'s address over https (http only for this machine\'s localhost)') : code === 'login_bad_user' ? t('Give the user name (no spaces, no #)') : code === 'value_required' ? t('Type its password') : code === 'vault_locked' ? t('The vault is locked (vault_locked) — unlock it, then save')
    : code === 'login_totp_unknown' || code === 'bad_totp' ? t('No two-step code of that name is in this vault — pick one from its list, or add it with «Two-step code…»') : code === 'login_password_lines' ? t('A password holds no line break — type or paste it again')
    : code === 'login_site_exists' && r && r.there && r.first ? t('{site} is this login\'s own first site and signs in there as {user} — to sign in there under another name, type a new login', { site: String(r.site || ''), user: String(r.there) })   // its first site cannot be removed: the one door is a new login
    : code === 'login_site_exists' && r && r.there ? t('{site} is on this login already and signs in there as {user} — to sign in there under another name, remove that site from the login in Vault ▸ Web logins first, or type a new login', { site: String(r.site || ''), user: String(r.there) })   // one login, several sites: the use road's own refusal
    : code === 'login_would_update' ? t('{site} as {user} is already in the vault — saving changes its password (the current one is kept as the previous one). To add a separate login, change the user name.', { site: String((r && r.site) || ''), user: String((r && r.user) || '') })   // B-ab6c
    : code === 'login_gone' ? t('That login is no longer in the vault — nothing was saved')
    : code === 'login_no_previous' ? t('This login keeps no previous password')
    : code === 'card_changed' ? t('That login changed after it was shown — nothing was changed; it is shown again now')
    : failWords(r);   // lane login-request-card
}

/** 添加 → 网站登录…: the owner's own login (by: owner). The password field is taken off the body by the route (`loginPassword`). */
export function showLoginAddDialog({ refresh = () => {} } = {}) {
  let saveNow = () => {}, f = null;
  // one subject: one website login being added
  const { dialog, body, close, raised } = createModalShell({ id: 'vault-login-add', title: t('Add a website login'), dialogClass: 'vault-login-add-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!(f && (f.site.value || f.user.value || f.pw.value)), save: () => saveNow(), discard: () => { if (f) f.pw.value = ''; } }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  // lane vault-2fa-pick: an empty vault's list offers THE 两步验证… dialog; the name it saves fills the field (the list re-read)
  f = loginFields({ addCode: () => showTotpAddDialog({ refresh: (r) => { if (r && typeof r.name === 'string' && r.name) { f.otpPick.added(r.name); try { refresh(); } catch { } } } }) });   // …and the Vault window lists the new code at once
  const err = el('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const foot = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create', t('Save to vault'));
  cancel.type = save.type = 'button';
  foot.append(cancel, save);
  body.append(...f.fields, f.otpList, f.hint, err);
  dialog.append(foot);
  cancel.onclick = () => { f.pw.value = ''; close(); };
  // B-ab6c: the form says it BEFORE the save when the site and user name name a login already here — the server's own naming
  // (expect 'new' ⇒ login_would_update, nothing written); the button then reads «Change its password» and a second press updates.
  // Another site or user name typed meanwhile is a new login again.
  let expect = 'new', named = '';
  const keyOf = () => `${f.site.value.trim()}\n${f.user.value.trim()}`;
  const reset = () => { if (expect === 'update' && keyOf() !== named) { expect = 'new'; save.textContent = t('Save to vault'); err.textContent = ''; } };
  f.site.addEventListener('input', reset); f.user.addEventListener('input', reset);
  save.onclick = saveNow = async () => {
    save.disabled = true;
    const r = await post('/api/vault/web-logins', { ...f.values(), expect });
    save.disabled = false;
    if (r && r.ok) { f.pw.value = ''; close(); showToast(r.updated ? t('Password changed — the old one is kept as the previous one') : t('Saved the login to the vault')); try { refresh(); } catch { } return; }
    if (r && r.code === 'login_would_update') { expect = 'update'; named = keyOf(); save.textContent = t('Change its password'); }
    err.textContent = loginRefusalWords(r && r.code, r);
  };
  setTimeout(() => f.site.focus(), 0);
  return { dialog, close };
}

/** B-ab6c (the owner 2026-11-26: «现在修改已存网站密码的方式非常蠢»): Change password… — the row's own door. The add door's fields with
 *  the site AND the user name fixed and shown, ONE field for the new password, the two-step code as bound now in WORDS (r5200: no
 *  field a person could empty and believe unbound — the row's own «Change…» / «Bind…» door changes it); the save
 *  is an UPDATE (expect 'update': the old password kept as previous, the grants and the binding untouched; a login gone meanwhile is
 *  refused, never created). It asks what the add door asks — an unlocked vault — and nothing more. */
export function showLoginChangeDialog(entry, { refresh = () => {} } = {}) {
  const site = String((entry && entry.origin) || ''), user = String((entry && entry.user) || '');
  let saveNow = () => {}, f = null;
  const { dialog, body, close, raised, ready } = createModalShell({ id: 'vault-login-change', key: (entry && entry.name) || '', title: t('Change password'),   // the subject: THIS login (one form a login)
    dialogClass: 'vault-login-add-dialog vault-login-change-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!(f && f.pw.value), save: () => saveNow(), discard: () => { if (f) f.pw.value = ''; } }, kind: 'form' });
  if (raised) return null;
  f = loginFields({ site, fixed: true, user, fixedUser: true, change: true });
  const bound = String((entry && entry.totpName) || '');
  const otpWords = el('div', 'vw-ak-hint vault-login-change-totp', bound ? t('Two-step code: {name}', { name: bound }) : t('Two-step code: none'));   // r5200: words, never a field
  const kept = el('div', 'vw-ak-hint vault-login-change-kept', t('The current password is kept as the previous one.'));
  const pend = entry && (entry.pending === 'change' || entry.pending === 'register') ? el('div', 'vw-desc-pending vault-login-change-pending', t('A generated password waits for your confirmation — saving this drops it.')) : null;
  const err = el('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const foot = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create', t('Change password'));
  cancel.type = save.type = 'button';
  foot.append(cancel, save);
  body.append(f.fields[0], f.fields[1], f.fields[2], otpWords, kept, ...(pend ? [pend] : []), err);
  dialog.append(foot);
  cancel.onclick = () => { f.pw.value = ''; close(); };
  save.onclick = saveNow = async () => {
    save.disabled = true;
    const r = await post('/api/vault/web-logins', { ...f.values(), expect: 'update' });
    save.disabled = false;
    if (r && r.ok) { f.pw.value = ''; close(); showToast(t('Password changed — the old one is kept as the previous one')); try { refresh(); } catch { } return; }
    err.textContent = loginRefusalWords(r && r.code, r);
  };
  ready.then((shell) => { if (shell) setTimeout(() => f.pw.focus(), 0); });   // §103 r4: a keyed form may wait behind the open one — its focus waits for its own open
  return { dialog, close };
}
