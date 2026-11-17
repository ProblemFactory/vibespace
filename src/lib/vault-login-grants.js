// WHO MAY HAVE A WEB LOGIN FILLED — THE THREE GRANT DIALOGS (the owner 2026-11-17: «这个界面逻辑有点问题 最上面那个选项会影响下面的表格
// 内容，容易引起困惑。另外这里配置apply之后似乎会直接对所有网站login生效？反正我没用明白»). The arithmetic is PURE in
// src/lib/login-grant-model.js; the house picker is src/lib/principal-picker.js. THE LAWS (主开发 19:53Z / 19:59Z):
//   · a login's 用于… dialog is about THAT login alone — its title, its list, its Save; no radio, nothing that changes the list's meaning;
//   · «any account on a site» and «any site» are their own dialogs, opened from the Vault's «Web logins» header (and from a locked
//     row's «through» press), each with its title and its consequence in plain words;
//   · a subject a wider row admits is drawn ticked AND locked, «through» that row, with its door — the hub's «by what», never a test here;
//   · «除了» under a Task Group or Everyone; nothing ticked is lost silently (the unsaved guard covers the whole dialog);
//   · the same two routes as before (POST /api/vault/web-logins/grants — now with the exceptions — and /ungrant), the same store;
//   · WHAT THE LOGIN HOLDS (主开发 20:28Z) — on its row and at the top of its dialog: the bound two-step code FIRST, by name or «none»,
//     with its door (POST /api/vault/web-logins/totp — change or unbind), then the slots it keeps, with when. Names and times only.
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell, agoText } from './utils.js';
import { principalPicker } from './principal-picker.js';
import { rowToPick, pickToRow } from './principal-picker-model.js';
import { showUnlock } from './vault-unlock.js';
import { loadTotp } from './vault-totp-row.js';
import { EVERYONE_KEY, rosterFromSubjects, lockedPlan, rowAt, savePlan, sitesOf, wideSummary, principalKeyOf, heldFacts } from './login-grant-model.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const siteOf = (origin) => String(origin || '').replace(/^https:\/\//, '');
const throughWords = (scope) => (scope === 'any-site' ? t('through: any site') : t('through: any account on this site'));
const doorWords = (scope) => (scope === 'any-site' ? t('Any site…') : t('Any account on this site…'));
const FENCE = () => t('VibeSpace never hands them the password and types it only on the matching site into a password or code field; our fence stops accidental reads and wrong sites, and we do not promise to stop an agent that deliberately digs into a page it controls.');
/** A refusal in the page's words, with its door (the vault locked ⇒ Unlock…). */
function refusalOf(r) {
  const code = r && r.code;
  if (code === 'vault_locked') return { text: t('The vault is locked — press Unlock…, then save again.'), door: { label: t('Unlock…'), run: () => { try { showUnlock(); } catch { /* the vault's own */ } } } };
  if (code === 'bad_except') return { text: t('An exception is a running conversation, under a Task Group or Everyone.') };
  if (code === 'bad_totp') return { text: t('No two-step code of that name is in this vault any more — choose one from the list.') };
  return { text: code ? t('Not saved ({code}).', { code: String(code) }) : t('Not saved — the server did not answer.') };
}

/** ONE grant dialog for ONE resource. `scope` names it; `resource` is its row; `name` = a login of its reach (what the route reads the
 *  resource from); `byWhat` = the hub's verdict for that login (who a WIDER row admits); `openWider(scope)` = the wider door. */
function grantDialog({ id, scope, resource, name, title, head = null, consequence, data, byWhat, openWider, refresh }) {
  const roster = rosterFromSubjects((data && data.subjects) || {});
  const grants = ((data && data.entries) || []).flatMap((e) => e.grants || []);
  const stored = rowAt(grants, resource);
  const words = { everyoneKey: EVERYONE_KEY, notRunning: t('not running now'), deletedGroup: t('a deleted Task Group') };
  const drawn = rowToPick(stored, roster, words);
  const extra = drawn.extra || [];
  const held = drawn.except;
  let picker = null, start = null;
  const stateOf = () => JSON.stringify([picker ? picker.selected().slice().sort() : [], picker ? picker.except({ held }).slice().sort() : []]);
  // THE KEY IS THE RESOURCE — one row, one dialog (a login's `origin#user`, a site's `origin#*`, the star `*`)
  // not the subject: name — a login within the resource's reach (what the route reads the resource from)
  // not the subject: scope — the resource's own scope (the key names the resource)
  // not the subject: data — the vault's catalog (its entries and subjects), the same for every dialog
  // not the subject: data.entries — the vault's logins (where the stored row is read)
  // not the subject: data.subjects — the conversations and groups the picker offers
  // not the subject: byWhat — the hub's verdict for the resource's logins: what is drawn locked, never what the key chooses
  const { body, close, raised } = createModalShell({ id, kind: 'form', key: resource, title, dialogClass: 'vault-dialog-box vw-ak-dialog vw-login-grant-dialog', escapeToClose: true,
    unsaved: { isDirty: () => start !== null && stateOf() !== start, save: () => doSave() } });
  if (raised) return null;
  if (head) body.append(head);
  body.append(el('div', 'vw-ak-hint vw-login-consequence', consequence));
  // what «by what» says, drawn (主开发 22:41Z): a subject only a wider row admits — locked «through» it, with its door; one that also
  // holds THIS row — ticked and removable, «also through» beside it; Everyone held wider — ONE line, not one chip per conversation
  const plan = lockedPlan(byWhat || {}, scope, EVERYONE_KEY);
  const locked = plan.locked.map((l) => ({ key: l.key, why: throughWords(l.through), door: { label: doorWords(l.through), run: () => openWider && openWider(l.through) } }));
  const alsoHint = new Map(plan.also.map((l) => [l.key, l.through === 'any-site' ? t('also through: any site') : t('also through: any account on this site')]));
  // a conversation a wider row holds that is not running has its row too — «not running now» (its name as the row stored it)
  const nameIn = (pk) => { for (const g of grants) for (const p of g.to || []) if (p && p.kind === 'conversation' && `conversation:${p.key}` === pk && p.name) return String(p.name); return null; };
  const own = [...roster, ...extra.filter((x) => !roster.some((r) => r.key === x.key))];
  const stopped = [...plan.locked, ...plan.also].filter((l) => l.principal.startsWith('conversation:') && !own.some((r) => r.key === l.key))
    .map((l) => { const id = l.principal.slice(13); return { key: l.key, kind: 'agent', id, name: nameIn(l.principal) || id.slice(0, 8), hint: words.notRunning, groupIds: [], groupNames: [] }; });
  const items = [...own, ...stopped].map((r) => (alsoHint.has(r.key) ? { ...r, hint: [r.hint, alsoHint.get(r.key)].filter(Boolean).join(' · ') } : r));
  picker = principalPicker({ items: () => items, multi: true, selected: drawn.selected,
    placeholder: t('Search conversations and groups…'), label: t('Who may have it filled'), emptyText: t('No conversation is running'),
    everyone: { key: EVERYONE_KEY, name: t('Everyone'), hint: t('every conversation on this instance, now and later') }, except: { selected: held, extra }, locked });
  body.append(el('div', 'vw-ak-sec', t('Who')), picker.el);
  if (locked.length) body.append(el('div', 'vw-ak-hint vw-login-locked-note', t('Ticked and locked: a wider grant already lets them — change it at its own door.')));
  const refusal = el('div', 'vw-ak-hint vw-login-refusal'); refusal.hidden = true;
  const doorB = el('button', 'vw-btn vw-login-refusal-door'); doorB.type = 'button'; doorB.hidden = true;
  body.append(refusal, doorB);
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-login-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  let busy = false;
  async function doSave() {
    if (busy) return false;
    busy = true; save.disabled = true;
    try {
      const exNow = picker.except({ held });
      const picked = pickToRow(picker.knownRows(), picker.selected(), exNow, { held: exNow });
      const plan = savePlan(stored, picked);
      let bad = null;
      for (const g of plan.grant) { const r = await post('/api/vault/web-logins/grants', { name, scope, subject: g.subject, ...(g.except ? { except: g.except } : {}) }); if (!r || !r.ok) { bad = r || {}; break; } }
      if (!bad) for (const k of plan.ungrant) { const r = await post('/api/vault/web-logins/ungrant', { resource, principal: k }); if (!r || !r.ok) { bad = r || {}; break; } }
      if (bad) { const w = refusalOf(bad); refusal.textContent = w.text; refusal.hidden = false; doorB.hidden = !w.door; if (w.door) { doorB.textContent = w.door.label; doorB.onclick = w.door.run; } refresh?.(); return false; }
      start = stateOf();
      showToast(t('Saved'));
      close();
      refresh?.();
      return true;
    } finally { busy = false; save.disabled = false; }
  }
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
  start = stateOf();
  return { close };
}

/** WHAT THE LOGIN HOLDS besides its secret (the owner 2026-11-17: «这里也无法显示除了密码之外的信息，比如绑定了哪个两步验证码»;
 *  主开发 20:28Z) — the bound two-step code FIRST, by name or «none», with its door (`onTotp(entry)` — change or unbind it); then the
 *  slots it keeps, named as kept, with when. Names and times only — never a value, a seed or a code. */
export function heldBlock(entry, { onTotp = null } = {}) {
  const held = heldFacts(entry);
  const box = el('div', 'vw-login-held');
  const otp = el('div', 'vw-login-held-otp');
  otp.append(el('span', 'vw-login-held-otp-name', held.totpName ? t('Two-step code: {name}', { name: held.totpName }) : t('Two-step code: none')));
  if (typeof onTotp === 'function') {
    const b = el('button', 'vw-ak-door vw-login-held-otp-door', held.totpName ? t('Change…') : t('Bind…'));
    b.type = 'button';
    b.title = held.totpName ? t('Change or unbind the two-step code this login uses') : t('Bind one of this vault\'s two-step codes to this login');
    b.onclick = () => onTotp(entry);
    otp.append(b);
  }
  box.append(otp);
  if (held.hasPrevious) box.append(el('div', 'vw-login-held-kept', held.previousReplacedAt ? t('Previous password kept — replaced {ago}', { ago: agoText(held.previousReplacedAt) }) : t('Previous password kept')));
  if (held.pending) box.append(el('div', 'vw-login-held-kept', held.pendingCreatedAt ? t('Pending password kept — made {ago}', { ago: agoText(held.pendingCreatedAt) }) : t('Pending password kept')));
  return box;
}
/** The row's `held` (src/lib/vault-login-row.js loginExtras draws it FIRST): the block with the two-step door. */
export function loginHeld(entry, data, { refresh } = {}) {
  return heldBlock(entry, { onTotp: (e) => showLoginTotpDialog(e, { refresh }) });
}

/** The two-step code a login uses — bound to one this vault holds, or none (POST /api/vault/web-logins/totp). The list is the vault's
 *  two-step codes BY NAME (GET /api/vault/totp); a name bound but gone from the vault stays listed as itself until it is changed.
 *  `onSaved(name)` = the caller redraws what it shows ('' = unbound). */
export function showLoginTotpDialog(entry, { refresh, onSaved } = {}) {
  const login = entry.user ? `${entry.user} · ${siteOf(entry.origin)}` : entry.name;
  const bound = heldFacts(entry).totpName;
  const sel = el('select', 'vw-login-totp-select');
  let start = null;
  // THE KEY IS THE LOGIN — one login, one binding
  // not the subject: entry.user — the title's words for the login the key names
  // not the subject: entry.origin — the title's words for the login the key names
  // not the subject: entry.totpName — the name bound now (where the choice starts)
  const { body, close, raised, ready } = createModalShell({ id: 'vault-login-totp', kind: 'form', key: entry.name, title: t('The two-step code «{login}» uses', { login }), dialogClass: 'vault-dialog-box vw-ak-dialog vw-login-totp-dialog', escapeToClose: true,
    unsaved: { isDirty: () => start !== null && sel.value !== start, save: () => doSave() } });
  if (raised) return null;
  body.append(el('div', 'vw-ak-hint', t('Hub types its code only on this login\'s site, into the field an agent names — no agent is ever shown the code or its seed.')));
  const none = el('option', null, t('None — no two-step code'));
  none.value = '';
  sel.append(none);
  const label = el('label', 'vault-secret-field');
  label.append(el('span', 'vault-secret-label', t('Two-step code')), sel);
  const empty = el('div', 'vw-ak-hint vw-login-totp-empty', t('This vault holds no two-step code yet — add one with Add… ▸ Two-step code…, then bind it here.'));
  empty.hidden = true;
  const refusal = el('div', 'vw-ak-hint vw-login-refusal'); refusal.hidden = true;
  const doorB = el('button', 'vw-btn vw-login-refusal-door'); doorB.type = 'button'; doorB.hidden = true;
  body.append(label, empty, refusal, doorB);
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-login-totp-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  save.disabled = true;
  let busy = false;
  async function doSave() {
    if (busy) return false;
    busy = true; save.disabled = true;
    try {
      const want = sel.value;
      const r = await post('/api/vault/web-logins/totp', { name: entry.name, totpName: want || null });
      if (!r || !r.ok) { const w = refusalOf(r || {}); refusal.textContent = w.text; refusal.hidden = false; doorB.hidden = !w.door; if (w.door) { doorB.textContent = w.door.label; doorB.onclick = w.door.run; } return false; }
      start = want;
      showToast(want ? t('Two-step code bound: {name}', { name: want }) : t('Two-step code unbound'));
      close();
      onSaved?.(want);
      refresh?.();
      return true;
    } finally { busy = false; save.disabled = false; }
  }
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
  // the vault's codes are read once it OPENS (a keyed form may wait behind the open one's ask; null = the person kept that one)
  ready.then((shell) => (shell ? loadTotp() : undefined)).then((d) => {
    if (d === undefined) return;
    const names = ((d && d.entries) || []).map((x) => String((x && x.name) || '')).filter(Boolean);
    for (const n of names) { const o = el('option', null, n); o.value = n; sel.append(o); }
    if (bound && !names.includes(bound)) { const o = el('option', null, t('{name} (not in this vault any more)', { name: bound })); o.value = bound; sel.append(o); }
    sel.value = bound || '';
    empty.hidden = names.length > 0;
    start = sel.value;
    save.disabled = false;
  }).catch(() => { sel.value = bound || ''; start = sel.value; save.disabled = false; });
  return { close };
}

/** The top of a login's 用于… dialog — the login itself: its user name, its site, what it holds (the two-step code first, with its door). */
function loginHead(entry, { refresh } = {}) {
  const head = el('div', 'vw-login-head');
  const draw = (e) => {
    head.replaceChildren(el('div', 'vw-login-head-id', t('User name: {name}', { name: e.user || '' })), el('div', 'vw-login-head-id', t('Site: {site}', { site: siteOf(e.origin) })),
      heldBlock(e, { onTotp: (x) => showLoginTotpDialog(x, { refresh, onSaved: (name) => draw({ ...x, totpName: name || undefined }) }) }));
  };
  draw(entry);
  return head;
}

/** 用于… — who may have THIS login filled (its own row, `origin#user`). */
export function showLoginGrantPicker(entry, data, { refresh } = {}) {
  const login = entry.user ? `${entry.user} · ${siteOf(entry.origin)}` : entry.name;
  return grantDialog({ id: 'vault-login-grant', scope: 'this-account', resource: `${entry.origin}#${entry.user}`, name: entry.name,
    title: t('Who may have «{login}» filled', { login }), head: loginHead(entry, { refresh }),
    consequence: t('These conversations can sign in as you with this account, on this site only.') + ' ' + FENCE(),
    data, byWhat: entry.byWhat || {}, refresh,
    openWider: (scope) => (scope === 'any-site' ? showAnySiteDialog(data, { refresh }) : showAnyAccountDialog(data, { refresh, site: entry.origin })) });
}

/** «任何网站…» — who may have ANY saved web login filled, on every site (the star row, `*`). */
export function showAnySiteDialog(data, { refresh } = {}) {
  const entries = (data && data.entries) || [];
  if (!entries.length) { showToast(t('No web login is saved yet')); return null; }
  return grantDialog({ id: 'vault-login-grant-any-site', scope: 'any-site', resource: '*', name: entries[0].name,
    title: t('Who may have ANY web login filled — on every site'),
    consequence: t('Every web login this vault holds, on every site — the ones added later too. Grant this only to conversations you would trust with all of them.') + ' ' + FENCE(),
    data, byWhat: {}, refresh, openWider: null });
}

/** «某个网站的任何账号…» — the site chosen from the sites the vault holds (a site per dialog), then who may have any account of it
 *  filled (`origin#*`) — which also lets an agent register a NEW account there through the vault. */
export function showAnyAccountDialog(data, { refresh, site = null } = {}) {
  const entries = (data && data.entries) || [];
  const sites = sitesOf(entries);
  const openFor = (origin) => {
    const of = entries.filter((e) => e.origin === origin);
    if (!of.length) return null;
    // who the star row admits — locked here too, through «any site» (the «by what» of any login of the site carries it)
    const byWhat = {};
    for (const [k, scopes] of Object.entries(of[0].byWhat || {})) if ((scopes || []).includes('any-site')) byWhat[k] = ['any-site'];
    return grantDialog({ id: 'vault-login-grant-any-account', scope: 'any-account', resource: `${origin}#*`, name: of[0].name,
      title: t('Who may have any account of {site} filled', { site: siteOf(origin) }),
      consequence: t('Any login this vault holds for {site} — the ones added later too — and an agent may register a NEW account there through the vault.', { site: siteOf(origin) }) + ' ' + FENCE(),
      data, byWhat, refresh, openWider: (scope) => (scope === 'any-site' ? showAnySiteDialog(data, { refresh }) : null) });
  };
  if (site && sites.includes(site)) return openFor(site);
  if (sites.length === 1) return openFor(sites[0]);
  if (!sites.length) { showToast(t('No web login is saved yet')); return null; }
  // the site first — one site, one dialog: a list of the vault's sites, each with how many accounts it holds and whether a grant stands
  // its subject: the sites the vault holds (the chooser's one input)
  const { body, close, raised } = createModalShell({ id: 'vault-login-site-pick', kind: 'form', key: sites.join(' '), title: t('Any account on which site?'), dialogClass: 'vault-dialog-box vw-ak-dialog vw-login-site-pick', escapeToClose: true });
  if (raised) return null;
  const held = new Set(wideSummary(entries).anyAccountSites);
  body.append(el('div', 'vw-ak-hint', t('Choose the site; its own dialog then says who may have any of its accounts filled.')));
  for (const s of sites) {
    const n = entries.filter((e) => e.origin === s).length;
    const b = el('button', 'vw-btn vw-login-site');
    b.type = 'button';
    b.append(el('span', 'vw-login-site-name', siteOf(s)), el('span', 'vw-login-site-n', t('{n} account(s)', { n })));
    if (held.has(s)) b.append(el('span', 'vw-login-site-held', t('granted')));
    b.onclick = () => { close(); openFor(s); };
    body.append(b);
  }
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel')); cancel.type = 'button'; cancel.onclick = () => close();
  f.append(cancel); body.parentNode.append(f);
  return { close };
}

/** The «Web logins» header's wider doors and their one line — what the wider rows hold (the star row: who; the site rows: which sites).
 *  `getData()` = the window's current logins facts. → { el, update() }. */
export function wideHeaderDoors(getData, { refresh } = {}) {
  const box = el('span', 'vw-login-wide');
  const line = el('span', 'vw-login-wide-line');
  const anySite = el('button', 'vw-btn vw-login-wide-any-site', t('Any site…'));
  const anyAccount = el('button', 'vw-btn vw-login-wide-any-account', t('Any account on a site…'));
  anySite.type = anyAccount.type = 'button';
  anySite.title = t('Who may have ANY web login filled — on every site');
  anyAccount.title = t('Who may have any account of one site filled');
  anySite.onclick = () => showAnySiteDialog(getData(), { refresh });
  anyAccount.onclick = () => showAnyAccountDialog(getData(), { refresh });
  box.append(line, anySite, anyAccount);
  const nameOf = (p, subjects) => {
    const k = principalKeyOf(p);
    if (k === 'everyone') return t('Everyone');
    const roster = rosterFromSubjects(subjects || {});
    const hit = roster.find((r) => (k.startsWith('group:') ? r.key === k : r.key === `agent:${k.slice(13)}`));
    return hit ? hit.name : (p.name || k.replace(/^(group|conversation):/, '').slice(0, 8));
  };
  const update = () => {
    const d = getData() || {};
    const s = wideSummary(d.entries || []);
    const parts = [];
    if (s.anySite.length) parts.push(t('Any site: {who}', { who: s.anySite.map((p) => nameOf(p, d.subjects)).join(', ') }));
    if (s.anyAccountSites.length) parts.push(t('Any account on: {sites}', { sites: s.anyAccountSites.map(siteOf).join(', ') }));
    line.textContent = parts.join(' · ');
    line.hidden = !parts.length;
  };
  update();
  return { el: box, update };
}
