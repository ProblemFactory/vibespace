// WEB LOGINS IN THE VAULT WINDOW (lane browser-login, P3 of the custom browser kernel — the hub's half: src/server/browser-logins.js
// over PURE src/browser-login.js). A website login's row (kind 'login', purpose Web logins) gets:
//   · its provenance line (the owner's own · registered by an agent through the vault · typed by an agent itself) — the row's detail;
//   · 「用于…」: who may have the custom browser kernel fill it — THIS account, ANY account on this site, or ANY site — to running
//     conversations, Task Groups or everyone (POST /api/vault/web-logins/grants; one row of the ONE grants store per scope); the
//     chips list the grants that reach this login, ✕ takes one back. An agent never sees the password: the kernel fills it;
//   · 显示 = the password (the window's reveal door — the second password again), 删除 = its own door (its own grant row goes too).
// 添加 → 「网站登录…」: the owner's own login (the site's address, the user name, the password, an optional paired two-step entry).
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { loadTotp } from './vault-totp-row.js';   // lane vault-totp-add: the two-step field lists the vault's own codes

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const failWords = (r) => t('Not done — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') });
const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
/** The scopes of a grant — the resource it is written under (src/browser-login.js scopeOf). */
const SCOPES = ['this-account', 'any-account', 'any-site'];
const scopeWords = (s) => (s === 'any-site' ? t('Any site') : s === 'any-account' ? t('Any account on this site') : t('This account'));
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

/** A web login's row extras: `box` (the grant chips, for the main column), `doors` (用于…). `show` = the row's 显示. */
export function loginExtras(row, data, { refresh, show } = {}) {
  const entry = ((data && data.entries) || []).find((e) => e.name === row.entry) || { name: row.entry, grants: [] };
  if (show) show.title = t('Shows the password — after the second password. An agent never sees it: the custom browser kernel fills it');
  const box = el('div', 'vw-ak vw-login');
  box.dataset.login = row.entry;
  const chips = el('div', 'vw-ak-grants');
  const grants = (entry.grants || []).filter((g) => !g.unknown);
  if (grants.length) {
    chips.append(el('span', 'vw-ak-to', t('Filled for:')));
    for (const g of grants) for (const p of g.to || []) {
      const chip = el('span', 'vw-ak-chip');
      chip.dataset.scope = g.scope || '';
      chip.append(el('span', null, `${principalName(p, data)} · ${scopeWords(g.scope)}`));
      const x = el('button', 'vw-ak-x', '✕');
      x.type = 'button'; x.title = t('Take this grant back'); x.setAttribute('aria-label', x.title);
      x.onclick = async () => { const r = await post('/api/vault/web-logins/ungrant', { resource: g.resource, principal: keyOfEntry(p) }); if (!r || !r.ok) showToast(failWords(r), { type: 'error' }); refresh?.(); };
      chip.append(x);
      chips.append(chip);
    }
    box.append(chips);
  }
  const useB = el('button', 'vw-btn vw-login-grant', t('Use for…'));
  useB.type = 'button';
  useB.title = t('Let the custom browser kernel fill this login for a conversation, a task group or everyone — they never see the password');
  useB.onclick = () => showLoginGrantPicker(entry, data, { refresh });
  return { box, doors: [useB] };
}

/** 用于…: the scope (this account / any account on this site / any site) and who — checked = granted at that scope. */
export function showLoginGrantPicker(entry, data, { refresh } = {}) {
  // not the subject: data — the vault's catalog (the subjects it offers), the same for every entry
  const { body, close, raised } = createModalShell({ id: 'vault-login-grant', key: entry.id, title: t('Who may have "{name}" filled', { name: entry.user ? `${entry.user} · ${String(entry.origin || '').replace(/^https:\/\//, '')}` : entry.name }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true,
    unsaved: { isDirty: () => boxes.some((b) => b.checked !== hadAt(scope).has(b.value)), save: () => doSave() }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const subjects = (data && data.subjects) || { sessions: [], groups: [] };
  const rowOf = (s) => (entry.grants || []).find((g) => g.scope === s && !g.unknown) || null;
  const hadAt = (s) => new Set(((rowOf(s) || {}).to || []).map(keyOfEntry).filter(Boolean));
  let scope = 'this-account';
  const scopes = el('div', 'vw-login-scopes');
  for (const s of SCOPES) {
    const lab = el('label', 'vw-ak-pick');
    const rb = el('input');
    rb.type = 'radio'; rb.name = 'vw-login-scope'; rb.value = s; rb.checked = s === scope;
    rb.onchange = () => { scope = s; paint(); };
    lab.append(rb, el('span', null, scopeWords(s)));
    scopes.append(lab);
  }
  body.append(el('div', 'vw-ak-sec', t('For')), scopes);
  const boxes = [];
  const pick = el('div', 'vw-login-who');
  const section = (title, list) => {
    if (!list.length) return;
    pick.append(el('div', 'vw-ak-sec', title));
    for (const s of list) {
      const k = keyOfSubject(s.subject);
      if (!k) continue;
      const lab = el('label', 'vw-ak-pick');
      const cb = el('input');
      cb.type = 'checkbox'; cb.value = k; cb.dataset.subject = s.subject;
      lab.append(cb, el('span', null, s.name));
      pick.append(lab);
      boxes.push(cb);
    }
  };
  section(t('Conversations'), subjects.sessions || []);
  section(t('Task groups'), subjects.groups || []);
  section(t('Everyone'), [{ subject: 'everyone', name: t('Every conversation on this instance') }]);
  body.append(pick);
  const paint = () => { const had = hadAt(scope); for (const b of boxes) b.checked = had.has(b.value); };
  paint();
  body.append(el('div', 'vw-ak-hint', t('The custom browser kernel fills the user name and password into the site\'s own form — the conversation never sees them. «Any account on this site» also lets an agent register new accounts there, through the vault.')));
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-login-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  const doSave = async () => {
    const had = hadAt(scope), row = rowOf(scope);
    let bad = null;
    for (const b of boxes) {
      if (b.checked && !had.has(b.value)) { const r = await post('/api/vault/web-logins/grants', { name: entry.name, scope, subject: b.dataset.subject }); if (!r || !r.ok) bad = r || {}; }
      else if (!b.checked && had.has(b.value) && row) { const r = await post('/api/vault/web-logins/ungrant', { resource: row.resource, principal: b.value }); if (!r || !r.ok) bad = r || {}; }
    }
    if (bad) showToast(failWords(bad), { type: 'error' }); else showToast(t('Saved'));
    close();
    refresh?.();
    return true;
  };
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
}

/** 添加 → 网站登录…: the owner's own login (by: owner). The password field is taken off the body by the route (`loginPassword`). */
export function showLoginAddDialog({ refresh = () => {} } = {}) {
  let saveNow = () => {};
  // one subject: one website login being added
  const { dialog, body, close, raised } = createModalShell({ id: 'vault-login-add', title: t('Add a website login'), dialogClass: 'vault-login-add-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!(site.value || user.value || pw.value), save: () => saveNow(), discard: () => { pw.value = ''; } }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const field = (label, control) => { const l = el('label', 'vault-secret-field'); l.append(el('span', 'vault-secret-label', label), control); return l; };
  const input = (cls, type, ph) => { const i = el('input', `vault-pw ${cls}`); i.type = type; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = ph; return i; };
  const site = input('vault-login-site', 'text', t('The site — e.g. https://example.com'));
  const user = input('vault-login-user', 'text', t('The user name or email you sign in with'));
  const pw = input('vault-login-pass', 'password', t('Its password'));
  pw.autocomplete = 'new-password';
  const otp = input('vault-login-otp', 'text', t('Optional — the name of its two-step code in this vault'));
  // lane vault-totp-add: the field offers the two-step codes the vault holds (names only — GET /api/vault/totp; a code added in
  // 添加… ▸ 两步验证… is listed at once)
  const otpNames = el('datalist');
  otpNames.id = 'vault-login-otp-names';
  otp.setAttribute('list', otpNames.id);
  loadTotp().then((d) => { for (const e of (d && d.entries) || []) { const o = el('option'); o.value = e.name; otpNames.append(o); } }).catch(() => {});
  const err = el('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const foot = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create', t('Save to vault'));
  cancel.type = save.type = 'button';
  foot.append(cancel, save);
  body.append(field(t('Site'), site), field(t('User name'), user), field(t('Password'), pw), field(t('Two-step code'), otp), el('div', 'vw-ak-hint', t('Only the site itself (its exact address, over https) is ever filled with it — never another site, never a frame of one.')), err, otpNames);
  dialog.append(foot);
  cancel.onclick = () => { pw.value = ''; close(); };
  save.onclick = saveNow = async () => {
    save.disabled = true;
    const r = await post('/api/vault/web-logins', { origin: site.value.trim(), username: user.value.trim(), loginPassword: pw.value, ...(otp.value.trim() ? { totpName: otp.value.trim() } : {}) });
    save.disabled = false;
    if (r && r.ok) { pw.value = ''; close(); showToast(r.updated ? t('Updated the login in the vault') : t('Saved the login to the vault')); try { refresh(); } catch { } return; }
    const code = r && r.code;
    err.textContent = code === 'login_bad_origin' ? t('Give the site\'s address over https (http only for this machine\'s localhost)') : code === 'login_bad_user' ? t('Give the user name (no spaces, no #)') : code === 'value_required' ? t('Type its password') : code === 'bad_totp' ? t('The two-step code\'s name, as it is listed in this vault') : code === 'vault_locked' ? t('The vault is locked (vault_locked) — unlock it, then save') : failWords(r);
  };
  setTimeout(() => site.focus(), 0);
  return { dialog, close };
}
