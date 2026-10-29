// THE VAULT WINDOW (lane vault-contents-window — the owner 2026-10-19: "vault 能不能加一个查看现在所有存储内容的功能，类似
// google password manager，需要输入密码才能查看一段时间"). Every credential the vault seals, listed MASKED (src/vault-inventory.js
// makes the rows: no character of a value, only a length class). The first 「显示」 (or 「全部显示」)
// asks for the second password again (「验证是你」, POST /api/vault/reveal-session — src/lib/vault-reveal.js: the window is
// THIS PAGE's, its secret in page memory only); for the next 5 minutes — a FIXED window the hub keeps, the countdown chip
// says how long — each 「显示」 is ONE POST /api/vault/reveal answering ONE value. A value goes in through `.value` only (never innerHTML), lives only in its row's field while that row is open
// (hiding it forgets it; the window closing ends the reveal window), and never rides StateSync / WS. 「复制」 clears the
// clipboard after 30 s when the page can. The doors per row are the store's own: 「删除」 through its own route with its
// card's confirm, 「换新…」 opens the re-authorize door where the store has one (integrations, channels).
// THE ONE DOOR (lane vault-one-door — the owner 2026-10-19, 「这个没必要分成两个按钮吧」): ⚙ System ▸ Vault… is the only gear row
// and opens THIS window; its HEADER is what the old ⚙ dialog held — the state (since when, set up when), the doors by state
// (设置第二密码… · 解锁… · 立即锁定 · 修改第二密码…) and 闲置后锁定 — over vault-unlock.js's facts and modals.
// V2 (lane vault-window-v2, design q-047 §3 — the owner 2026-10-19 「鉴于要支持的种类越来越复杂，建议重新设计一下 vault 界面的
// UI」; decision ④: group by the nine purposes, the store named under 技术细节): a RAIL of purposes with counts (PURE
// purposeOf — one row, one purpose), a BAR (search · sort · provenance · 只看可显示 · 添加…), each row = name + meta · kind chip
// · provenance chip (PURE provenanceOf) · state chip · last use · its doors by kind, and 「需要你」 at the top = For you's OWN open
// items of origin 'vault' (inboxModel — the same items, the same answers: answered here, gone from the tray; answered there,
// gone here). A reveal's reason is its 「显示」's HELP (title), never a chip-like sentence beside the value (the owner's
// confusion note 2026-10-20: 「只为交给外界」 read as the key's state). KEYED: a row element lives while its row's facts do — a
// search, a filter, a sort or a refresh MOVES nodes (an open value stays where it is); a phone (or a narrow window) gets the
// rail as a chip strip and the filters behind ONE 筛选… (a container query over the same nodes, never a second renderer).
// Locked: the rail counts say «—», the list one sentence + 解锁…, NO 添加… (locked = read-only, q-033; no greyed control).
// Entry points: ⚙ System ▸ Vault…, the sidebar's System panel line, the vault's door (`vs-vault-door`) while unlocked, a
// 「需要你」 item's door in For you (focus = its row).
import { t } from './i18n.js';
import { fetchJson, showToast, showConfirmDialog, copyText, createModalShell, showContextMenu } from './utils.js';
import { UI_ICONS } from './icons.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { showUnlock, showSetup, showChange, vaultFacts, onVaultFacts, refreshVaultFacts, lockNow, setIdleHours, stateIconEl, vaultWaitLine } from './vault-unlock.js';
import { revealLeftMs, revealHeaders, onRevealChange, noteRevealLeft, forgetReveal, endReveal, revealValue, revealWords, askRevealPassword } from './vault-reveal.js'; // r2: THE PAGE's window (its secret in page memory)
import { removeAccount, showReauthAccountDialog } from './channel-account-dialogs.js';
import { passkeyDeleteWords } from './browser-panel-model.js';
import { KIND_WORDS, countdownText, CLIPBOARD_CLEAR_MS, PURPOSES, purposeOf, PROVENANCES, provenanceOf, PROVENANCE_FILTERS, stateChipsOf, viewOf, bandItemsOf, bandDoorsOf, SEARCHED_FIELDS } from '../vault-inventory.js'; // PURE: the rows' rules (test-vault-inventory)
import { useExtras, useSigOf } from './vault-use-row.js'; // lane vault-use-grants: «Who may use it» — the members (hosts, end, uses) + 「Who may use it…」
import { loadAutomation, automationExtras, showMintDialog } from './vault-automation.js'; // design q-046: «Automation keys» — mint, grant, revoke (never a value)
import { loadLogins, loginExtras, showLoginAddDialog } from './vault-login-row.js'; // lane browser-login: a website login's row — 用于… (this account / any account on this site / any site) + 网站登录…
import { loadTotp, totpExtras, showTotpAddDialog } from './vault-totp-row.js'; // design q-047 L1 (lane vault-totp): a two-step code's row — 看码 + its ring (GET /api/vault/totp/:name), 用于…; lane vault-totp-add: 添加… ▸ 两步验证…
import { addOrderOf } from '../vault-kinds.js'; // PURE: THE KIND REGISTRY — which 添加… doors must exist, in its order (scripts/test-vault-kinds-census.mjs)
import { inboxModel } from './user-todos-actions.js'; // lane vault-window-v2: 「需要你」 = For you's own items (one store, one set of answers)
import { showSecretAddDialog, showSecretPasteDialog } from './vault-paste-box.js'; // lane vault-paste-request: 「其他密钥或密码…」 + an agent's paste request answered here (THE box, as a dialog)

const ICON = svgIcon16('<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/><circle cx="8" cy="10.5" r="1"/>');
const MASK = '••••••••';
const vwEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** THE ICONS as elements (this module names no HTML sink — test-vault-inventory ①b): 16-unit stroke glyphs, built node by node. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const GLYPHS = {
  person: [['circle', { cx: 8, cy: 5, r: 3 }], ['path', { d: 'M2.5 14a5.5 5.5 0 0111 0' }]],
  bot: [['rect', { x: 3, y: 5, width: 10, height: 8, rx: 2 }], ['path', { d: 'M8 2v3M6 9h.01M10 9h.01' }]],
  key: [['circle', { cx: 5.5, cy: 10.5, r: 3 }], ['path', { d: 'M8 8l6-6M11 5l2 2M9.5 6.5l1.5 1.5' }]],
  lock: [['rect', { x: 3, y: 7, width: 10, height: 7, rx: 1.5 }], ['path', { d: 'M5.5 7V5a2.5 2.5 0 015 0v2' }]],
  qr: [['rect', { x: 2, y: 2, width: 5, height: 5 }], ['rect', { x: 9, y: 2, width: 5, height: 5 }], ['rect', { x: 2, y: 9, width: 5, height: 5 }], ['path', { d: 'M9 9h2v2M14 9v2h-2M9 14h2M12 12h2v2' }]],
  warn: [['path', { d: 'M8 2l6.5 11.5h-13z' }], ['path', { d: 'M8 7v3M8 12h.01' }]],
  bolt: [['path', { d: 'M9 1.5L3 9h4.5L7 14.5 13 7H8.5z' }]],
  search: [['circle', { cx: 7, cy: 7, r: 4.5 }], ['path', { d: 'M10.5 10.5L14 14' }]],
  plus: [['path', { d: 'M8 3v10M3 8h10' }]],
  eye: [['path', { d: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z' }], ['circle', { cx: 8, cy: 8, r: 2 }]],
  copy: [['rect', { x: 5, y: 5, width: 8, height: 8, rx: 1.5 }], ['path', { d: 'M3 11V4a1 1 0 011-1h7' }]],
  filter: [['path', { d: 'M2 3.5h12M4.5 8h7M7 12.5h2' }]],
};
function glyph(name, size = 12) {
  const s = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'vw-ico' })) s.setAttribute(k, String(v));
  for (const [tag, attrs] of GLYPHS[name] || []) { const c = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, String(v)); s.append(c); }
  return s;
}
const btnEl = (label, cls, { icon = null, title = null } = {}) => { const b = vwEl('button', `vw-btn ${cls || ''}`.trim()); b.type = 'button'; if (icon) b.append(glyph(icon)); b.append(document.createTextNode(label)); if (title) b.title = title; return b; };
const SIZE_WORDS = { short: () => t('short'), medium: () => t('medium'), long: () => t('long'), 'very long': () => t('very long'), unknown: () => t('unknown length') };
const kindWord = (k) => t(KIND_WORDS[k] || 'Secret');
const whenText = (ms) => (ms ? new Date(ms).toLocaleString() : '');
const whenShort = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');
/** A row's name in the page's words: an integration's / a hub secret's label is an English key (` · <machine>` after it). */
const WORDED = new Set(['integrations', 'secrets']);
const labelWord = (row) => (WORDED.has(row.store) ? String(row.label).split(' · ').map((p, i) => (i ? p : t(p))).join(' · ') : row.label);
const purposeWord = (id) => t((PURPOSES.find((p) => p.id === id) || { label: 'Other' }).label);
const PROV_ICON = { me: 'person', scan: 'qr', 'hub-mint': 'key', 'agent-mint': 'bot', 'agent-put': 'bot', system: 'lock', request: 'person' };
/** The provenance chip's help — where the value came from (a fact of its making; a later reveal does not change it). */
const PROV_HELP = {
  me: () => t('A person stored it — in this window, a card or Settings'),
  scan: () => t('A person scanned or pasted it'),
  'hub-mint': () => t('VibeSpace made it itself — nobody typed it in'),
  'agent-mint': () => t('An agent had VibeSpace make it — the agent never saw the value'),
  'agent-put': () => t('An agent stored a value it had seen — rotate it'),
  system: () => t('VibeSpace uses it itself — it is never shown'),
  request: () => t('You typed it in at an agent\'s request — the conversation that asked is named'),   // lane vault-use-grants
};
const provWord = (id) => t((PROVENANCES.find((p) => p.id === id) || PROVENANCES[0]).label);
/** lane vault-use-grants: a ROW's provenance words — a request-made entry names the conversation that asked. */
const provWordOf = (row) => { const id = provenanceOf(row) || 'me'; return id === 'request' ? t('Filled by you · asked for by {who}', { who: (row.askedBy && row.askedBy.name) || t('an agent') }) : provWord(id); };
/** THE REVEAL DOOR'S HELP (the owner's confusion note 2026-10-20): why a value is shown is the 「显示」 button's own help. */
const showHelp = (row) => (row.store === 'automation'
  ? t('Show the key\'s value — only to hand it to an outside system; agents inside use it by grant and never need to see it')
  : isTotp(row) ? t('Show the seed and its settings as an otpauth link — the second password is asked once; the code itself needs none')   // the owner's amendment to q-047 ①: the seed behind 验证是你
  : t('Show this value — the second password is asked once, then values stay visible for 5 minutes'));
const stateWord = (c) => (c.id === 'expired' ? t('Expired') : c.id === 'expires' ? t('Expires in {n} days', { n: c.days }) : t('Rotate suggested'));
const isTotp = (row) => row.kind === 'totp' || !!(row.doors && row.doors.code);
const isLogin = (row) => row.kind === 'login' && !!(row.doors && row.doors.login);   // lane browser-login
const SORT_CHOICES = [['used', () => t('Recently used')], ['name', () => t('Name')], ['kind', () => t('Kind')], ['created', () => t('Newest')]];   // design q-047 §3.2: 最近使用 first

/** 删除'S CONFIRM WORDS, keyed by the registry's `confirmKey` (src/vault-kinds.js — doorsOf hands it on as the door's
 *  `confirm`): the store cards' own words, one entry per key a family names and none it does not (scripts/
 *  test-vault-kinds-census.mjs reads this table's keys — acceptance r2: no hand-keyed per-kind list outside the registry). */
const CONFIRM_WORDS = {
  account: (row) => (row.field === 'oat'   // an account's long-lived token (the account stays)
    ? { title: t('Remove token'), message: t('Remove the long-lived token from “{name}”? Machines relying on it lose access at their next spawn (running sessions keep working).', { name: row.label }), confirm: t('Remove') }
    : { title: t('Remove account'), message: t('Remove "{name}" from VibeSpace? Sessions already running keep working.', { name: row.label }), confirm: t('Remove') }),
  mount: (row) => ({ title: t('Remove "{name}"?', { name: row.label }), message: t('The mount record and local mountpoint go away. Nothing is deleted remotely.'), confirm: t('Remove') }),
  integration: (row) => ({ title: t('Clear my keys'), message: t('Clear the keys you entered for {label}? The row falls back to the cluster default when one exists.', { label: row.label }), confirm: t('Clear') }),
  passkey: (row) => { const [site, user] = String(row.label).split(' · '); const w = passkeyDeleteWords({ site, user: user || '' }, { w: t }); return { title: w.title, message: w.message, confirm: w.confirm }; },
  'app-logins': () => ({ title: t('Forget the logins this app keeps?'), message: t('VibeSpace keeps this app\'s logins for it in its own session; after you forget them the app asks again.'), confirm: t('Forget') }),
  secret: (row) => ({ title: t('Delete "{name}"?', { name: row.label }), message: t('The value leaves the vault. A conversation that uses it in a command loses it at its next run.'), confirm: t('Delete') }),   // lane vault-paste-request: a free entry
  'web-login': (row) => ({ title: t('Delete the login "{name}"?', { name: row.label }), message: t('Its password leaves the vault and this account\'s own grant goes with it. Agents can no longer be signed in there with it.'), confirm: t('Delete') }),   // lane browser-login
  totp: (row) => ({ title: t('Delete the two-step code "{name}"?', { name: row.label }), message: t('Its seed leaves the vault and every grant of its code stops. A site that asks for this code needs it set up again.'), confirm: t('Delete') }),
};
function confirmWords(key, row) {
  const w = Object.prototype.hasOwnProperty.call(CONFIRM_WORDS, key) ? CONFIRM_WORDS[key] : null;
  return w ? w(row) : { title: t('Delete'), message: row.label, confirm: t('Delete') };
}

const STATE_WORD = { unlocked: () => t('Unlocked'), locked: () => t('Locked'), not_set_up: () => t('Not set up') };
const IDLE_HOURS = [0, 1, 4, 8, 24];

/** THE HEADER (lane vault-one-door): the old ⚙ System ▸ Vault… dialog, whole — the state line, the doors by state (修改第二密码…
 *  while locked too, as the dialog had it: the change rewraps under the old password), the idle lock. Redrawn from the facts
 *  at every door's answer and every `vault-state` broadcast (vault-unlock.js onVaultFacts). → { head, draw } */
function vaultHead() {
  const head = vwEl('div', 'vw-head');
  const draw = () => {
    const f = vaultFacts(), state = (f && f.state) || '';
    head.textContent = '';
    head.dataset.state = state;
    if (!state) return;
    const line = vwEl('div', 'vault-state-line');
    line.dataset.state = state;
    const word = vwEl('span', 'vw-state', (STATE_WORD[state] || STATE_WORD.locked)());
    word.dataset.state = state;
    line.append(stateIconEl(state), word);
    const since = state === 'unlocked' ? f.unlockedSince : state === 'locked' ? f.lockedSince : null;
    // v2: the short form (the mock's 「自 10/19 15:28 起」); the full instant is its help
    const whenEl = (text, at) => { const e = vwEl('span', 'vault-state-when', text); e.title = whenText(at); return e; };
    if (since) line.append(whenEl(t('since {when}', { when: whenShort(since) }), since));
    if (f.setUpAt) line.append(whenEl(t('Set up {when}', { when: whenShort(f.setUpAt) }), f.setUpAt));
    const acts = vwEl('div', 'vault-actions');
    const btn = (label, cls, fn) => { const b = vwEl('button', cls, label); b.type = 'button'; b.onclick = fn; acts.append(b); };
    if (state === 'not_set_up') btn(t('Set a second password…'), 'btn-create vault-do-setup', () => showSetup());
    if (state === 'locked') btn(t('Unlock…'), 'btn-create vault-do-unlock', () => showUnlock());
    if (state === 'unlocked') btn(t('Lock now'), 'btn-cancel vault-do-lock', () => lockNow());
    if (state !== 'not_set_up') btn(t('Change the second password…'), 'btn-cancel vault-do-change', () => showChange());
    head.append(line);
    if (state === 'not_set_up') { head.append(acts); return; }
    const idle = vwEl('label', 'vault-idle');
    const sel = vwEl('select', 'vault-idle-select');
    const cur = String(Number(f.idleLockHours) || 0);
    for (const k of IDLE_HOURS.map(String)) { const o = vwEl('option', null, k !== '0' ? t('{n} h', { n: Number(k) }) : t('Never')); o.value = k; o.selected = k === cur; sel.append(o); }
    sel.title = t('Lock the vault after this long with no keyboard or mouse on any VibeSpace page');
    sel.onchange = () => setIdleHours(sel.value);
    idle.append(vwEl('span', null, t('Lock after idle')), sel);
    acts.append(idle);   // v2: the idle lock on the doors' line (the mock's header: two lines)
    head.append(acts);
  };
  return { head, draw };
}

async function channelAccount(id) {
  const d = await fetchJson('/api/channels?scope=accounts');
  return { a: (d && Array.isArray(d.adapters) ? d.adapters.find((x) => x && x.id === id) : null) || null, kinds: (d && d.kinds) || [] };
}

/** 添加… — the doors that add a stored value, each its own (this window never re-implements one): { id, label: () => string,
 *  run: (app, ctx) => void }. THE KIND REGISTRY (src/vault-kinds.js, lane vault-totp-add — the owner 2026-10-26: 「这种不是应该有个
 *  统一的注册表之类的吗」) says which doors must exist and in what order: a door it does not name is refused, and
 *  scripts/test-vault-kinds-census.mjs fails a kind family whose declared door is not registered here (两步验证 had a rail
 *  category, a row and a route — and no door). */
const ADD_DOORS = [];
export function registerVaultAdd(door) {
  const order = door && typeof door.id === 'string' ? addOrderOf(door.id) : null;
  if (order == null || typeof door.run !== 'function' || ADD_DOORS.some((d) => d.id === door.id)) return false;
  ADD_DOORS.push({ ...door, order }); ADD_DOORS.sort((a, b) => a.order - b.order);
  return true;
}
registerVaultAdd({ id: 'account', label: () => t('Account…'), run: (app) => app._showAgentsDialog?.() });
registerVaultAdd({ id: 'integration', label: () => t('Integration key…'), run: (app) => app.openIntegration?.() });
registerVaultAdd({ id: 'channel', label: () => t('Channel account…'), run: (app) => app.openChannels?.() });
// lane vault-totp-add (design q-047 §3 — the L2 the owner found missing): a two-step code — an otpauth link or the seed, the
// hub's preview first. Registered HERE, beside its siblings: vault-totp-row.js is imported by this module (a registration
// from there would run before ADD_DOORS exists in the bundle)
registerVaultAdd({ id: 'totp', label: () => t('Two-step code…'), run: (app, c) => showTotpAddDialog({ refresh: c.refresh }) });
registerVaultAdd({ id: 'automation', label: () => t('Automation key…'), run: (app, c) => showMintDialog({ refresh: c.refresh, data: c.auto() }) });
// lane vault-paste-request (the owner 2026-10-23: 「我压根没法添加啊」): a plain secret the registry lists no row for — a password, an
// API key, an OAuth client secret — a FREE entry `secret:<id>` (name, kind, value, note), the same masked field as For you's paste box
registerVaultAdd({ id: 'web-login', label: () => t('Website login…'), run: (app, c) => showLoginAddDialog({ refresh: c.refresh }) });   // lane browser-login: the owner's own login (the custom kernel fills it; agents never see it)
registerVaultAdd({ id: 'secret', label: () => t('Other key or password…'), run: (app, c) => showSecretAddDialog({ refresh: c.refresh }) });

/** THE WINDOW (singleton). `focus` = a row (or an entry) to bring into view — a 「需要你」 item's door. */
export function openVaultWindow(app, { syncId, focus = null } = {}) {
  for (const [id, w] of app.wm.windows || []) {
    if (w && w.type === 'vault') { app.wm.revealWindow(id, { replay: !!syncId }); if (focus) w._vwFocus?.(focus); return w; }
  }
  const winInfo = app.wm.createWindow({ title: t('Vault'), type: 'vault', syncId, openSpec: { action: 'openVault' }, width: 980, height: 680 });
  const sig = winInfo._listenerCtl?.signal;
  // THE STATE: rows (masked) and the row elements (a value lives only in its row's <input> — nothing here holds one); the
  // reveal window is the page's (src/lib/vault-reveal.js). The view (search / sort / provenance / 只看可显示 / the purpose)
  // is never stored: every open starts at 全部 (design q-047 §3.2)
  const st = { data: null, q: '', sort: 'used', prov: new Set(), revealOnly: false, purpose: 'all', closed: false, wasOpen: false, auto: null, focus };
  const rowEls = new Map(), headEls = new Map(), railEls = new Map(), bandEls = new Map();

  const root = vwEl('div', 'vw');
  const hd = vaultHead();   // lane vault-one-door: the old ⚙ dialog, as this window's header
  // 「需要你」 (design q-047 §3.4)
  const band = vwEl('div', 'vw-band');
  band.hidden = true;
  const bandHead = vwEl('div', 'vw-band-head');
  const bandN = vwEl('span', 'vw-band-n');
  bandHead.append(glyph('bolt'), vwEl('span', 'vw-band-title', t('Needs you')), bandN);
  const bandRows = vwEl('div', 'vw-band-rows');
  band.append(bandHead, bandRows);
  // THE BODY: the rail (purposes + counts) and the pane (bar, note, list)
  const body = vwEl('div', 'vw-body');
  const rail = vwEl('div', 'vw-rail');
  rail.setAttribute('role', 'tablist'); rail.setAttribute('aria-label', t('What it is for'));
  const pane = vwEl('div', 'vw-pane');
  const bar = vwEl('div', 'vw-bar');
  const searchBox = vwEl('label', 'vw-search-box');
  const search = vwEl('input', 'vw-search');
  search.type = 'search'; search.placeholder = t('Search names, kinds, where they came from…'); search.setAttribute('aria-label', t('Search')); search.spellcheck = false;
  searchBox.append(glyph('search'), search);
  const filters = vwEl('div', 'vw-filters');
  const sortSel = vwEl('select', 'vw-sort vw-chip');
  sortSel.setAttribute('aria-label', t('Sort'));
  for (const [k, w] of SORT_CHOICES) { const o = vwEl('option', null, w()); o.value = k; o.selected = k === st.sort; sortSel.append(o); }
  const provChips = PROVENANCE_FILTERS.map((f) => { const b = vwEl('button', 'vw-chip vw-fchip', t(f.label)); b.type = 'button'; b.dataset.prov = f.id; b.setAttribute('aria-pressed', 'false'); return b; });
  const onlyShown = vwEl('button', 'vw-chip vw-only-shown', t('Only the ones I can show'));
  onlyShown.type = 'button'; onlyShown.setAttribute('aria-pressed', 'false');
  filters.append(vwEl('span', 'vw-flabel', t('Sort')), sortSel, vwEl('span', 'vw-flabel', t('Where from')), ...provChips, onlyShown);
  const filterB = btnEl(t('Filter…'), 'vw-filter-btn', { icon: 'filter' });   // a phone / a narrow window: the filters behind one door
  const addB = btnEl(t('Add…'), 'vw-add vw-primary', { icon: 'plus' });
  bar.append(searchBox, filters, filterB, addB);
  const note = vwEl('div', 'vw-note');
  const noteText = vwEl('span', 'vw-note-text');
  const timer = vwEl('span', 'vw-timer');
  timer.hidden = true;
  const showAllB = btnEl(t('Show all'), 'vw-show-all', { title: t('Show every value listed — the second password is asked once, then values stay visible for 5 minutes') });
  const hideAllB = btnEl(t('Hide all'), 'vw-hide-all');
  hideAllB.hidden = true;
  note.append(noteText, timer, hideAllB, showAllB);
  const list = vwEl('div', 'vw-list');
  pane.append(bar, note, list);
  body.append(rail, pane);
  root.append(hd.head, band, body);
  winInfo.content.appendChild(root);

  // ── the reveal window: its countdown, its end ──
  const openRows = () => [...rowEls.values()].filter((x) => x.plain);
  function hideValue(x) {
    if (!x || !x.plain) return;
    x.plain.value = '';
    x.plain.remove();
    x.plain = null;
    x.mask.hidden = false; x.copy.hidden = true;
    x.show.lastChild.textContent = t('Show');
    x.show.title = showHelp(x.row);
    x.el.classList.remove('vw-open');
  }
  function hideAll() { for (const x of openRows()) hideValue(x); }
  function drawTimer() {
    const left = revealLeftMs();
    if (st.wasOpen && left <= 0) { st.wasOpen = false; const had = openRows().length; hideAll(); forgetReveal(); if (had) showToast(t('Values hidden again — the 5 minutes are over')); }   // wasOpen first: forgetReveal re-enters through onRevealChange
    st.wasOpen = left > 0;
    timer.hidden = !(left > 0);
    hideAllB.hidden = !openRows().length;
    if (left > 0) timer.textContent = t('Visible for {time}', { time: countdownText(left) });
  }
  const tick = setInterval(() => { if (!st.closed) drawTimer(); }, 1000);
  const offReveal = onRevealChange(() => { if (!st.closed) { if (!revealLeftMs()) hideAll(); drawTimer(); } });

  /** ONE value into ONE row (src/lib/vault-reveal.js asks 验证是你 first when this page has no window). → true when shown. */
  async function revealRow(x) {
    if (!x || st.closed) return false;
    const r = await revealValue(x.row.id);
    if (st.closed) return false;
    if (r && r.ok && typeof r.value === 'string') {
      if (!x.plain) {
        x.plain = vwEl('input', 'vw-plain');
        x.plain.type = 'text'; x.plain.readOnly = true; x.plain.spellcheck = false; x.plain.setAttribute('aria-label', labelWord(x.row));
        x.mask.after(x.plain);
      }
      x.plain.value = r.value;   // THE ONE SINK of a value: an input's value (never innerHTML, never kept elsewhere)
      x.mask.hidden = true; x.copy.hidden = false;
      x.show.lastChild.textContent = t('Hide');
      x.show.title = t('Hide this value');
      x.el.classList.add('vw-open');
      drawTimer();
      return true;
    }
    if (r && r.code === 'cancelled') return false;
    if (r && r.code === 'vault_locked') { lockedNow(); return false; }
    showToast(revealWords(r), { type: 'error' });
    return false;
  }

  async function copyValue(x) {
    const v = x.plain ? x.plain.value : x.codeText ? x.codeText.textContent.replace(/\s+/g, '') : '';
    if (!v) return;
    await copyText(v);
    showToast(t('Copied — cleared from the clipboard in 30 s if this tab stays open'));
    // our own timer: clear what we put there (when the page can read it back, only if it is still ours)
    setTimeout(async () => {
      try { if ((await navigator.clipboard.readText()) !== v) return; } catch { /* cannot read it back: clear anyway */ }
      try { await navigator.clipboard.writeText(''); } catch { /* the page is not focused — nothing more it can do */ }
    }, CLIPBOARD_CLEAR_MS);
  }

  async function doDelete(row) {
    const d = row.doors && row.doors.delete;
    if (!d) return;
    if (d.open === 'channel-remove') {
      const { a } = await channelAccount(d.id);
      if (!a) { showToast(t('That stored value is not there any more'), { type: 'error' }); return; }
      if (await removeAccount(app, a)) refresh();
      return;
    }
    const w = confirmWords(d.confirm, row);
    if (!(await showConfirmDialog({ title: w.title, message: w.message, confirmText: w.confirm, danger: true }))) return;
    const r = await fetchJson(d.path, { method: d.method, headers: { 'Content-Type': 'application/json' }, ...(d.method === 'POST' ? { body: '{}' } : {}) });
    if (!r || r.error || r.ok === false) { showToast(t('Could not delete — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') }), { type: 'error' }); return; }
    showToast(t('Deleted'));
    refresh();
  }
  async function doRenew(row) {
    const r = row.doors && row.doors.rotate;
    if (!r) return false;
    if (r.open === 'integration') { app.openIntegration?.(r.id); return true; }
    if (r.open === 'channel-reauth') {
      const { a, kinds } = await channelAccount(r.id);
      if (a) showReauthAccountDialog(app, a, { kinds }); else showToast(t('That stored value is not there any more'), { type: 'error' });
      return true;
    }
    return false;
  }

  // ── the rows (keyed: a row element lives while its row's facts do; a search, a filter or a sort moves it) ──
  const autoOf = (row) => (row.store === 'automation' && st.auto ? ((st.auto.keys || []).find((k) => `apikey:${k.id}` === row.entry) || null) : null);
  // a row's signature leaves its last use out: a reveal moves the store key's last use, and an open value must survive the
  // next refresh — the 「最近使用」 cell is patched in place instead
  const loginOf = (row) => (isLogin(row) && st.logins ? ((st.logins.entries || []).find((e) => e.name === row.entry) || null) : null);   // lane browser-login: a web login's grant chips are part of its row's facts
  const sigOf = (row) => JSON.stringify([{ ...row, lastUsed: null, run: row.run ? { ...row.run, use: !!row.run.use } : row.run }, autoOf(row), row.store === 'automation' ? !!st.auto : 0, loginOf(row)]);   // lane vault-use-grants: a member moving patches the row's «Who may use it» box in place (an open value stays open)
  // lane vault-key-row-compact: an automation key's 最近使用 is its last USE by a conversation (the head's one — the old extra line went)
  const keyUsed = (row) => { const k = autoOf(row); return k ? (k.lastUsedAt ? whenShort(k.lastUsedAt) : t('Never used')) : null; };
  const usedText = (row) => keyUsed(row) ?? (row.lastUsed ? (row.lastUsed.by === 'human' ? t('{when} · you', { when: whenShort(row.lastUsed.at) }) : t('{when} · VibeSpace', { when: whenShort(row.lastUsed.at) })) : '');
  const usedHelp = (row) => { const k = autoOf(row); if (k) return k.lastUsedAt ? t('Last used {when}', { when: whenText(k.lastUsedAt) }) : ''; return row.lastUsed ? (row.lastUsed.by === 'human' ? t('last opened {when} by you', { when: whenText(row.lastUsed.at) }) : t('key last used {when} by VibeSpace', { when: whenText(row.lastUsed.at) })) : ''; };
  /** lane vault-run-door (design q-043 decision ⑤): «Usable by agent runs» — OFF by default; ON asks 验证是你 FIRST (in the
   *  press's own task), OFF never asks. The hub refuses a row with its own door by name whatever the page sends. */
  async function setRun(row, box) {
    if (box._vwBusy) return;   // SEAM (int330): re-entry guard, no 'disabled' — vault-window-v2 forbids a greyed control (test-vault-inventory)
    const on = box.checked;
    box._vwBusy = true;
    try {
      if (on && !revealLeftMs() && !(await askRevealPassword())) { box.checked = false; return; }
      const r = await fetchJson('/api/vault/runnable', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(on ? revealHeaders() : {}) }, body: JSON.stringify({ id: row.id, on }) });
      if (r && r.ok) { row.run = { ...(row.run || {}), open: !!r.open }; box.checked = !!r.open; showToast(r.open ? t('Agents may use it in a run now — each new command asks you first') : t('Agents can no longer use it in a run')); return; }
      box.checked = !on;
      if (r && r.code === 'reveal_needs_password') forgetReveal();
      showToast(revealWords(r || {}), { type: 'error' });
    } finally { box._vwBusy = false; }
  }

  function rowFor(row) {
    const e = vwEl('div', 'vw-row');
    const purpose = purposeOf(row) || 'other', prov = provenanceOf(row) || 'me';
    e.dataset.id = row.id; e.dataset.store = row.store; e.dataset.purpose = purpose; e.dataset.prov = prov;
    const main = vwEl('div', 'vw-main');
    const label = vwEl('div', 'vw-label', labelWord(row));
    main.append(label);
    const meta = [];
    if (row.detail && row.store !== 'automation') meta.push(WORDED.has(row.store) ? t(row.detail) : row.detail);   // an integration's field label is an English key (the registry's); an automation key's why is its 显示's help, never a line beside it (the owner's confusion note)
    meta.push(kindWord(row.kind));
    if (!(row.store === 'secrets' && row.size === 'unknown')) meta.push(t('length: {size}', { size: (SIZE_WORDS[row.size] || SIZE_WORDS.unknown)() }));   // a hub secret: names and dates only
    if (row.createdAt) meta.push(t('saved {when}', { when: whenShort(row.createdAt) }));
    if (Array.isArray(row.hosts) && row.hosts.length) meta.push(t('for {hosts}', { hosts: row.hosts.join(', ') }));   // lane vault-use-grants: the hosts its request named
    // lane vault-agent-own: what an agent kept itself says its rule — its own conversation uses it with no switch, no card —
    // on its OWN line under the meta (the meta is one clipped line: words past its width were never read)
    const pv = row.provenance && row.provenance.by === 'agent' ? row.provenance : null;
    const ruleWords = row.run && row.run.own ? t('Its own conversation uses it directly · other conversations cannot use it') : pv && pv.owner ? t('Its own conversation uses it directly · other conversations need a grant') : null;
    const ownRule = ruleWords ? vwEl('div', 'vw-own-rule', pv && pv.actor ? `${ruleWords} · ${t('kept by {name}', { name: pv.actor })}` : ruleWords) : null;
    // lane vault-key-row-compact: an automation key's head is ONE line — its kind is the chip and a minted value's length says
    // nothing, so the meta line goes; the name's title keeps when it was made
    if (row.store === 'automation') label.title = row.createdAt ? `${labelWord(row)} · ${t('saved {when}', { when: whenText(row.createdAt) })}` : labelWord(row);
    else main.append(vwEl('div', 'vw-meta', meta.join(' · ')));
    if (ownRule) main.append(ownRule);
    // THE CHIPS: kind · provenance · state (a fact the row holds — never a hint, never a greyed control)
    const chips = vwEl('div', 'vw-chips');
    chips.append(vwEl('span', 'vw-chip vw-chip-kind', kindWord(row.kind)));
    const pc = vwEl('span', `vw-chip vw-chip-prov vw-prov-${prov}`);
    pc.dataset.prov = prov; pc.title = PROV_HELP[prov] ? PROV_HELP[prov]() : '';
    pc.append(glyph(PROV_ICON[prov] || 'person', 11), vwEl('span', 'vw-chip-words', provWordOf(row)));   // lane vault-key-row-compact: the words in a span (a phone's key row shows the glyph; aria-label keeps them)
    pc.setAttribute('aria-label', provWordOf(row));
    chips.append(pc);
    for (const c of stateChipsOf(row, Date.now())) { const s = vwEl('span', 'vw-chip vw-chip-state'); s.dataset.state = c.id; s.append(glyph('warn', 11), document.createTextNode(stateWord(c))); chips.append(s); }
    const used = vwEl('div', 'vw-used', usedText(row));
    used.title = usedHelp(row);
    if (row.run && row.run.can) {   // lane vault-run-door: a storage secret / an app login — the owner opens it for runs, one by one
      const lab = vwEl('label', 'vw-run');
      const box = vwEl('input', 'vw-run-box');
      box.type = 'checkbox'; box.checked = !!row.run.open;
      lab.title = t('An agent may use it in vibespace-vault run without ever seeing it — each new command asks you first');
      lab.append(box, vwEl('span', null, t('Usable by agent runs')));
      box.onchange = () => setRun(row, box);
      main.append(lab);
    }
    // THE VALUE + THE DOORS (by kind — a door the row has not is not drawn; design q-047 §3.3)
    const val = vwEl('div', 'vw-value');
    const mask = vwEl('span', 'vw-mask', MASK);
    mask.setAttribute('aria-label', t('Hidden'));
    const show = btnEl(t('Show'), 'vw-show', { icon: 'eye', title: showHelp(row) });
    const copy = btnEl(t('Copy'), 'vw-copy', { icon: 'copy' });
    copy.hidden = true;
    const x = { row, el: e, mask, show, copy, used, plain: null, codeText: null, codeLeft: null, sig: sigOf(row) };
    let totpTx = null;   // design q-047 L1: lazily holds the ported totpExtras (its box / doors land once `doors` exists)
    if (isTotp(row)) {
      // design q-047 L1 (lane vault-totp): 看码 + its ring + 复制 + 用于… (its own door GET /api/vault/totp/:name) — never a mask for the code;
      // the SEED and its settings stay behind 验证是你 (显示), the owner's amendment to ① — so a revealable two-step row also draws mask + show
      totpTx = totpExtras(row, st.totp, { refresh, signal: sig, show });
      x.stopCode = totpTx.stop;
      val.append(...totpTx.value);
      if (row.revealable !== false) val.append(mask, show);
    } else if (row.revealable === false) val.append(mask);   // int317: a machine's link token / a sealed file's key — never shown (the hub refuses it by name): no 显示 at all
    else val.append(mask, show, copy);
    const doors = vwEl('div', 'vw-doors');
    let wide = null;   // lane vault-key-row-compact: an automation key's head chips count, its limits line + grants fold sit UNDER the head (full width)
    if (row.store === 'automation' && st.auto) { const ex = automationExtras(row, st.auto, { refresh }); chips.append(...(ex.chips || [])); wide = ex.box; doors.append(...ex.doors); }
    if (row.run && row.run.use) { const ux = useExtras(row, { app, refresh }); main.append(ux.box); doors.append(...ux.doors); x.use = ux; x.useSig = useSigOf(row); }   // lane vault-use-grants: who may use it with no card
    if (totpTx) { main.append(totpTx.box); doors.append(...totpTx.doors); }   // design q-047 L1: the code's grant chips + 用于…
    if (isLogin(row) && st.logins) { const lx = loginExtras(row, st.logins, { refresh, show }); main.append(lx.box); doors.append(...lx.doors); }   // lane browser-login: who may have it filled + 用于…
    if (row.doors && row.doors.rotate) { const b = btnEl(t('Renew…'), 'vw-renew'); b.onclick = () => doRenew(row); doors.append(b); }
    if (row.doors && row.doors.delete) { const b = btnEl(t('Delete'), 'vw-del'); b.onclick = () => doDelete(row); doors.append(b); }
    show.onclick = () => (x.plain ? hideValue(x) : revealRow(x));
    copy.onclick = () => copyValue(x);
    const tech = vwEl('details', 'vw-tech');
    tech.append(vwEl('summary', null, t('Technical details')), vwEl('div', 'vw-tech-body', `${row.store} · ${row.entry} · ${row.field}`));
    const act = vwEl('div', 'vw-act');
    act.append(val, doors);
    e.append(main, chips, used, act, ...(wide ? [wide] : []), tech);
    return x;
  }
  /** The rows after a refresh: a row whose facts did not change KEEPS its element (an open value stays open); a changed one
   *  is drawn again; a gone one leaves. */
  function build() {
    const d = st.data;
    const rows = d && Array.isArray(d.rows) ? d.rows : [];
    const live = new Set(rows.map((r) => r.id));
    for (const [id, x] of rowEls) if (!live.has(id)) { x.stopCode?.(); hideValue(x); x.el.remove(); rowEls.delete(id); }
    for (const row of rows) {
      const old = rowEls.get(row.id);
      if (old && old.sig === sigOf(row)) { old.row = row; const u = usedText(row); if (old.used.textContent !== u) { old.used.textContent = u; old.used.title = usedHelp(row); } if (old.use && old.useSig !== useSigOf(row)) { old.use.redraw(row); old.useSig = useSigOf(row); } continue; }
      if (old) { old.stopCode?.(); hideValue(old); old.el.remove(); }
      rowEls.set(row.id, rowFor(row));
    }
  }
  function headFor(id) {
    if (headEls.has(id)) return headEls.get(id);
    const h = vwEl('div', 'vw-group');
    h.dataset.purpose = id;
    const n = vwEl('span', 'vw-group-n');
    h.append(vwEl('span', 'vw-group-name', purposeWord(id)), n);
    const help = (PURPOSES.find((p) => p.id === id) || {}).help;   // lane vault-agent-own: «Kept by agents» says its rule under its name
    if (help) h.append(vwEl('span', 'vw-group-help', t(help)));
    headEls.set(id, { el: h, n, mint: null });
    return headEls.get(id);
  }
  const wordsOf = (r) => [kindWord(r.kind), purposeWord(purposeOf(r)), provWordOf(r), labelWord(r)];
  /** THE VIEW → the rail, the group heads and the rows in place (nodes MOVED, never rebuilt). */
  function place() {
    const d = st.data;
    const locked = !d || d.state === 'locked';
    drawRail(locked ? null : d, { locked: !!d && d.state === 'locked' });
    if (locked) return;
    const v = viewOf(d.rows || [], { q: st.q, prov: [...st.prov], revealOnly: st.revealOnly, purpose: st.purpose, sort: st.sort, wordsOf });
    const want = [];
    const filtered = !!(st.q || st.prov.size || st.revealOnly);
    for (const g of v.groups) {
      if (!g.rows.length && (st.purpose === 'all' || filtered)) continue;
      const h = headFor(g.id);
      h.n.textContent = String(g.rows.length);
      // design q-046: 铸造… on the «Automation keys» head — the vault unlocked only (a key's value is sealed at once)
      if (g.id === 'automation' && d.state === 'unlocked' && !h.mint) { h.mint = btnEl(t('Mint…'), 'vw-ak-mint'); h.mint.onclick = () => showMintDialog({ refresh, data: st.auto }); h.el.append(h.mint); }
      if (h.mint) h.mint.hidden = d.state !== 'unlocked';
      want.push(h.el);
      if (!g.rows.length) { want.push(emptyEl(t('Nothing stored here'), `empty-${g.id}`)); continue; }
      for (const r of g.rows) { const x = rowEls.get(r.id); if (x) want.push(x.el); }
    }
    if (!v.rows.length && filtered) want.push(st.q ? noMatchEl(v) : emptyEl(t('No stored value matches these filters'), 'empty-match'));
    else if (!v.rows.length && st.purpose === 'all') want.push(emptyEl(t('Nothing stored here'), 'empty-all'));
    reconcile(list, want);
    railCounts(v.counts);
    if (st.focus) { const f = st.focus; st.focus = null; focusRow(f); }
  }
  // lane vault-use-grants: «no match» NAMES what was searched — the fields, and the purpose when one is picked (a value
  // under another purpose is one press away: 「Search all」) — the owner's «Unifi» answered nothing while the rail stood elsewhere
  let noMatch = null;
  function noMatchEl(v) {
    if (!noMatch) { noMatch = { el: vwEl('div', 'vw-empty vw-nomatch'), txt: vwEl('span', 'vw-nomatch-text'), all: btnEl(t('Search all'), 'vw-nomatch-all') }; noMatch.el.dataset.key = 'empty-match'; noMatch.all.onclick = () => { st.purpose = 'all'; place(); }; noMatch.el.append(noMatch.txt, noMatch.all); }
    const fields = SEARCHED_FIELDS.map((f) => t(f)).join(', ');
    const elsewhere = st.purpose !== 'all' ? (v.counts && v.counts.all) || 0 : 0;
    const text = st.purpose === 'all' ? t('No stored value matches “{q}” — searched: {fields}', { q: st.q, fields })
      : t('No stored value matches “{q}” in «{purpose}» — searched: {fields}', { q: st.q, purpose: purposeWord(st.purpose), fields }) + (elsewhere ? ' · ' + t('{n} match under other purposes', { n: elsewhere }) : '');
    if (noMatch.txt.textContent !== text) noMatch.txt.textContent = text;
    noMatch.all.hidden = st.purpose === 'all';
    return noMatch.el;
  }
  const empties = new Map();
  function emptyEl(text, key) { let e = empties.get(key); if (!e) { e = vwEl('div', 'vw-empty'); e.dataset.key = key; empties.set(key, e); } if (e.textContent !== text) e.textContent = text; return e; }
  /** Keyed reconciliation: `want` in order, by MOVING nodes (an element already in place is never touched; nothing is rebuilt). */
  function reconcile(box, want) {
    const keep = new Set(want);
    for (const c of [...box.children]) if (!keep.has(c)) c.remove();
    want.forEach((node, i) => { if (box.children[i] !== node) box.insertBefore(node, box.children[i] || null); });
  }
  // ── the rail ──
  function railItem(id, label) {
    let it = railEls.get(id);
    if (it) return it;
    const b = vwEl('button', 'vw-rail-item');
    b.type = 'button'; b.dataset.purpose = id; b.setAttribute('role', 'tab');
    const n = vwEl('span', 'vw-rail-n');
    b.append(vwEl('span', 'vw-rail-name', label), n);
    const help = (PURPOSES.find((p) => p.id === id) || {}).help;
    if (help) b.title = t(help);   // lane vault-agent-own: the rail item's help — the same sentence
    b.onclick = () => { if (b.classList.contains('vw-rail-off')) return; st.purpose = id; place(); list.scrollTop = 0; };   // before the first answer too: the pick waits for the rows
    it = { el: b, n };
    railEls.set(id, it);
    return it;
  }
  /** `locked` = the hub said locked: a table of what is kept, its counts «—», nothing to pick; no rows yet (the first answer
   *  still on its way) = the purposes with no count, a pick already kept. */
  function drawRail(d, { locked = false } = {}) {
    const ids = ['all', ...PURPOSES.filter((p) => !p.onlyWhenAny || (d && (d.rows || []).some((r) => purposeOf(r) === p.id))).map((p) => p.id)];
    const want = ids.map((id) => railItem(id, id === 'all' ? t('All') : purposeWord(id)).el);
    reconcile(rail, want);
    for (const [id, it] of railEls) {
      const on = id === st.purpose;
      it.el.classList.toggle('on', on); it.el.setAttribute('aria-selected', on ? 'true' : 'false');
      it.el.classList.toggle('vw-rail-off', locked);
      it.el.tabIndex = locked ? -1 : 0;
      if (locked) it.n.textContent = '—'; else if (!d) it.n.textContent = '';
    }
  }
  function railCounts(counts) { for (const [id, it] of railEls) it.n.textContent = String(counts[id] || 0); }
  /** Bring a row (an id, or an entry's rows) into view, flashed — a 「需要你」 item's 打开 / For you's door. */
  function focusRow(ref) {
    const s = String(ref || '');
    const x = rowEls.get(s) || [...rowEls.values()].find((y) => y.row.entry === s || `${y.row.store}:${y.row.entry}` === s);
    if (!x) { if (s.startsWith('apikey:')) { st.purpose = 'automation'; place(); } return false; }
    if (!x.el.isConnected) { st.q = ''; search.value = ''; st.prov.clear(); st.revealOnly = false; st.purpose = 'all'; syncFilters(); place(); }
    x.el.scrollIntoView({ block: 'center' });
    x.el.classList.remove('vw-flash'); void x.el.offsetWidth; x.el.classList.add('vw-flash');
    return true;
  }
  winInfo._vwFocus = (ref) => { if (st.data && st.data.rows) focusRow(ref); else st.focus = ref; };

  // ── 「需要你」 — For you's own open items of origin 'vault' (the same store; answered here = answered there) ──
  const inbox = (() => { try { return inboxModel(app); } catch { return null; } })();
  function bandDoor(item, door) {
    const label = { once: t('Allow once'), always: t('Always for this conversation'), deny: t('Deny'), unlock: t('Unlock…'), renew: t('Renew…'), ack: t('Got it'), open: t('Open the row'), paste: t('Paste and save…') }[door];
    const b = btnEl(label, `vw-band-${door}${door === 'once' || door === 'unlock' || door === 'paste' ? ' vw-primary' : ''}${door === 'deny' ? ' vw-del' : ''}`);
    b.dataset.door = door;
    b.onclick = async () => {
      if (door === 'paste') { showSecretPasteDialog(inbox, item, { words: inbox.wordsOf(item), detail: inbox.detailOf(item) }); return; }   // lane vault-paste-request: THE paste box (the store resolves the item — the band follows)
      if (door === 'once' || door === 'always' || door === 'deny') { await inbox.runAction(item, door); return; }   // THE tray's own answer (src/lib/user-todos-actions.js)
      if (door === 'unlock') { showUnlock(); return; }
      if (door === 'ack') { await inbox.setStatus(item.id, 'done'); return; }
      const entry = item.action && item.action.entry;
      if (door === 'renew') { const x = [...rowEls.values()].find((y) => y.row.entry === entry); if (!(x && (await doRenew(x.row)))) focusRow(entry); return; }
      if (entry) focusRow(entry); else inbox.jump(item.sessionKey, item);
    };
    return b;
  }
  function drawBand() {
    if (!inbox) { band.hidden = true; return; }
    const { items, total } = bandItemsOf((inbox.todos && inbox.todos.open) || []);
    band.hidden = !items.length;
    bandN.textContent = String(total);
    const want = [];
    for (const it of items) {
      const sigB = JSON.stringify([it.id, it.text, it.i18n, it.action, it.urgency]);
      let r = bandEls.get(it.id);
      if (!r || r.sig !== sigB) {
        const el = vwEl('div', 'vw-band-row');
        el.dataset.id = it.id;
        if (it.action && it.action.type) el.dataset.type = it.action.type;
        // lane vault-key-row-compact (the card grammar): the HEAD speaks (a use failure: who · the key · the verb · refused), a
        // use failure's CAUSE is the second line (its first detail line, with the door), the rest under ONE fold — nothing raw
        const words = vwEl('div', 'vw-band-words');
        const head = inbox.wordsOf(it);
        const txt = vwEl('span', 'vw-band-txt', head);
        txt.title = head;
        words.append(txt);
        const lines = inbox.detailLinesOf ? inbox.detailLinesOf(it) : String(inbox.detailOf(it) || '').split('\n').filter(Boolean);
        const failed = !!(it.action && it.action.type === 'vault-use-failed');
        if (failed && lines[0]) words.append(vwEl('div', 'vw-band-cause', lines[0]));
        const rest = failed ? lines.slice(1) : lines;
        if (rest.length) { const more = vwEl('details', 'vw-band-more'); more.append(vwEl('summary', null, t('Details')), vwEl('div', 'vw-band-more-body', rest.join('\n'))); words.append(more); }
        const doors = vwEl('span', 'vw-band-doors');
        for (const d of bandDoorsOf(it)) doors.append(bandDoor(it, d));
        el.append(words, doors);
        r = { el, sig: sigB };
        bandEls.set(it.id, r);
      }
      want.push(r.el);
    }
    for (const id of [...bandEls.keys()]) if (!items.some((i) => i.id === id)) bandEls.delete(id);
    reconcile(bandRows, want);
  }
  inbox?.on('todos', () => { if (!st.closed) drawBand(); }, { signal: sig });

  // ── the bar ──
  function syncFilters() {
    for (const b of provChips) { const on = st.prov.has(b.dataset.prov); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    onlyShown.classList.toggle('on', st.revealOnly); onlyShown.setAttribute('aria-pressed', st.revealOnly ? 'true' : 'false');
    for (const o of sortSel.options) o.selected = o.value === st.sort;
    filterB.classList.toggle('on', !!(st.prov.size || st.revealOnly));
  }
  const toggleProv = (id) => { if (st.prov.has(id)) st.prov.delete(id); else st.prov.add(id); syncFilters(); place(); };
  for (const b of provChips) b.onclick = () => toggleProv(b.dataset.prov);
  onlyShown.onclick = () => { st.revealOnly = !st.revealOnly; syncFilters(); place(); };
  /** 筛选… (a phone): the same filters in a modal — each press applies at once (the list behind it follows). */
  filterB.onclick = () => {
    const { dialog, body: mb, close } = createModalShell({ id: 'vault-filter-dialog', title: t('Filter'), dialogClass: 'vault-dialog-box vw-filter-dialog', minWidth: 'min(340px, 92vw)' });
    const mk = (label, on, fn, cls) => { const b = vwEl('button', `vw-chip ${cls}${on ? ' on' : ''}`, label); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.onclick = () => { fn(); const now = b.classList.toggle('on'); b.setAttribute('aria-pressed', now ? 'true' : 'false'); }; return b; };
    const sortRow = vwEl('div', 'vw-fsec');
    const sel2 = vwEl('select', 'vw-sort vw-chip');
    for (const [k, w] of SORT_CHOICES) { const o = vwEl('option', null, w()); o.value = k; o.selected = k === st.sort; sel2.append(o); }
    sel2.onchange = () => { st.sort = sel2.value; syncFilters(); place(); };
    sortRow.append(vwEl('div', 'vw-flabel', t('Sort')), sel2);
    const provRow = vwEl('div', 'vw-fsec vw-fchips');
    provRow.append(vwEl('div', 'vw-flabel', t('Where from')), ...PROVENANCE_FILTERS.map((f) => { const b = mk(t(f.label), st.prov.has(f.id), () => toggleProv(f.id), 'vw-fchip'); b.dataset.prov = f.id; return b; }));
    const onlyRow = vwEl('div', 'vw-fsec');
    onlyRow.append(mk(t('Only the ones I can show'), st.revealOnly, () => { st.revealOnly = !st.revealOnly; syncFilters(); place(); }, 'vw-only-shown'));
    mb.append(sortRow, provRow, onlyRow);
    const footer = vwEl('div', 'dialog-footer');
    const done = vwEl('button', 'btn-create vw-filter-done', t('Close'));
    done.type = 'button'; done.onclick = () => close();
    footer.append(done);
    dialog.append(footer);
  };
  addB.onclick = (ev) => {
    const r = addB.getBoundingClientRect();
    const ctx = { refresh, auto: () => st.auto };
    showContextMenu(r.left, r.bottom + 4, ADD_DOORS.map((d) => ({ label: d.label(), action: () => d.run(app, ctx) })));
    ev.stopPropagation();
  };

  function drawHead() {
    const d = st.data, state = d ? d.state : null;
    const locked = state === 'locked';
    root.classList.toggle('vw-nobar', !d || state !== 'unlocked');   // lane vault-one-door: no greyed controls — the bar shows once there is something to search (and 添加… once the vault can take a value)
    root.classList.toggle('vw-locked', locked);
    noteText.textContent = '';
    showAllB.hidden = state !== 'unlocked';
    if (state === 'not_set_up') noteText.textContent = t('Set a second password first — stored values are shown only behind it');
    else if (d && !locked) noteText.textContent = t('{n} stored values, sealed in the vault. Showing one asks for the second password again; they stay visible for 5 minutes. Every reveal is recorded.', { n: (d.rows || []).length });
    if (locked) {
      // design q-047 §3.5: the list says it is locked + 解锁… — no 添加… (locked = read-only), nothing greyed
      const box = vwEl('div', 'vw-locked-box');
      const icon = vwEl('div', 'vw-locked-icon');
      icon.append(glyph('lock', 28));
      const txt = vwEl('div', 'vw-locked-text');
      txt.append(vwEl('div', null, t('The vault is locked — Unlock… above shows what it holds (For you names what is waiting on it).')), vwEl('div', null, t('While it is locked every use answers «locked» — nothing fails in another way.')));
      const u = btnEl(t('Unlock…'), 'vw-unlock vw-primary');
      u.onclick = () => showUnlock();
      box.append(icon, txt, u);
      reconcile(list, [box]);
    }
  }
  function lockedNow() { forgetReveal(); hideAll(); drawTimer(); refresh(); }
  async function refresh() {
    // lane vault-slow-load (inc-mvk5jyv3 «保险库操作好像加载时间有点长»): until the first answer the list SAYS it is reading — a busy
    // hub left it blank, the rail without counts — and the keys' grants are asked WITH the list, not after it (one round trip,
    // not two; q-046's order below is kept: no row is published before them)
    if (!st.data) reconcile(list, [vaultWaitLine(t('Reading the vault…'))]);
    const autoEarly = vaultFacts()?.state === 'unlocked' ? loadAutomation() : null;
    const r = await fetchJson('/api/vault/contents', { headers: revealHeaders() });
    if (st.closed) return;
    if (!r || r.ok === false) { st.data = null; drawHead(); reconcile(list, []); noteText.textContent = revealWords(r || {}); drawRail(null, { locked: !!r && r.code === 'vault_locked' }); return; }
    // design q-046: the keys' grants + the picker's subjects (never a value) — read BEFORE the new rows are published: a pick in
    // the rail between the two drew the purpose with no row and a 铸造… with no choices (test-automation-keys-chrome ⑨b, 2/3)
    const auto = r.state === 'unlocked' ? await (autoEarly || loadAutomation()) : null;
    if (st.closed) return;
    st.data = { state: r.state, stores: r.stores || [], rows: r.rows || [] };
    st.auto = auto;
    st.totp = r.state === 'unlocked' && st.data.rows.some(isTotp) ? await loadTotp() : null;   // design q-047 L1: the codes' grants + the picker's subjects (never a value)
    st.logins = r.state === 'unlocked' && st.data.rows.some(isLogin) ? await loadLogins() : null;   // lane browser-login: the logins' grants + the picker's subjects (never a password)
    if (r.reveal && r.reveal.open) noteRevealLeft(r.reveal.leftMs); else forgetReveal();
    drawTimer();
    if (r.state === 'locked') { hideAll(); for (const [id, x] of rowEls) { x.stopCode?.(); x.el.remove(); rowEls.delete(id); } }
    build(); drawHead(); place();
  }

  search.addEventListener('input', () => { st.q = search.value; place(); }, { signal: sig });
  sortSel.onchange = () => { st.sort = sortSel.value; place(); };
  showAllB.onclick = async () => {
    if (showAllB._vwBusy) return;   // a re-entry guard, never a greyed control (vault-window-v2)
    const shown = [...rowEls.values()].filter((x) => x.el.isConnected).sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1));
    const todo = shown.filter((x) => x.row.revealable !== false && !isTotp(x.row) && !x.plain);   // int317: never-shown rows are skipped (not a stop)
    if (!todo.length || (!revealLeftMs() && !(await askRevealPassword()))) return;
    // lane vault-slow-load: the press says how far it is — one reveal per value, each its own answer
    showAllB._vwBusy = true;
    const word = showAllB.lastChild.textContent;
    try {
      for (const [i, x] of todo.entries()) {
        showAllB.lastChild.textContent = t('Showing {n} of {total}…', { n: i + 1, total: todo.length });
        if (!x.plain && !(await revealRow(x))) break;
      }
    } finally { showAllB._vwBusy = false; showAllB.lastChild.textContent = word; }
  };
  hideAllB.onclick = () => { hideAll(); drawTimer(); };
  // a lock anywhere (another tab, an agent's lock, the idle lock) hides every value at once
  // lane vault-use-grants (the owner 2026-10-27 «我现在完全无法在 vault 里看到刚才建立的密码» — measured: an OPEN window learnt nothing
  // until it was reopened): the vault's ONE notify (`vault-contents`, a counter — a paste, mint / put, a delete, a grant, in this
  // tab or any other client) ⇒ the list read again and PATCHED in place (keyed rows: the search box, the scroll and an open
  // value stay; a row the search now matches shows, the counts and the «N stored values» line follow). One read at a time.
  let contentsDue = null, contentsBusy = false, contentsAgain = false;
  const contentsMoved = () => {
    if (st.closed || !st.data || st.data.state === 'locked') return;
    if (contentsBusy) { contentsAgain = true; return; }
    clearTimeout(contentsDue);
    contentsDue = setTimeout(async () => { contentsBusy = true; try { await refresh(); } finally { contentsBusy = false; if (contentsAgain && !st.closed) { contentsAgain = false; contentsMoved(); } } }, 120);
  };
  const off = app.ws?.onGlobal?.((msg) => {
    if (msg && msg.type === 'vault-contents') { contentsMoved(); return; }
    if (!msg || msg.type !== 'vault-state' || st.closed) return;
    if (msg.state !== 'unlocked') { if (st.data && st.data.state !== msg.state) lockedNow(); else { forgetReveal(); hideAll(); drawTimer(); } }
    else if (st.data && st.data.state !== 'unlocked') refresh();
  });
  const offFacts = onVaultFacts(() => { if (!st.closed) hd.draw(); });
  sig?.addEventListener('abort', () => {
    st.closed = true;
    clearTimeout(contentsDue);   // lane vault-use-grants
    offFacts();
    hideAll();
    clearInterval(tick);
    offReveal();
    try { off?.(); } catch { /* the socket is gone */ }
    document.getElementById('vault-reveal-dialog')?.remove();
    document.getElementById('vault-filter-dialog')?.remove();
    endReveal();   // the window closed: this page's reveal window ends with it
  });
  hd.draw(); refreshVaultFacts();
  syncFilters(); drawRail(null); drawBand();
  refresh();
  return winInfo;
}

/** The sidebar's System panel: one line — the vault's state, how many values it seals, 「查看内容…」. */
export async function paintVaultLine(host, app) {
  if (!host) return;
  const f = await fetchJson('/api/vault/state').catch(() => null);
  if (!host.isConnected || !f || !f.state) return;
  host.textContent = '';
  const line = vwEl('div', 'sys-search-line sys-vault-line');
  const word = f.state === 'unlocked' ? t('Unlocked') : f.state === 'locked' ? t('Locked') : t('Not set up');
  line.append(vwEl('span', null, t('Vault') + ': ' + word));
  const btn = vwEl('button', 'sys-search-rebuild sys-vault-open', t('View contents…'));
  btn.type = 'button';
  btn.onclick = () => openVaultWindow(app);
  line.append(btn);
  host.append(line);
}

registerWindowType({
  type: 'vault', label: 'Vault', singleton: true, icon: ICON, persist: false,
  action: 'openVault',
  replay: (app, spec, { syncId } = {}) => openVaultWindow(app, { syncId, focus: (spec && spec.focus) || null }),
});
/** ⚙ System ▸ Vault… — THE ONE ROW (lane vault-one-door: the old dialog's row and Vault contents… became this one). */
registerMenuItem({
  menu: 'gear', parent: 'system', order: 62, icon: UI_ICONS.lock, // gear-menu.js head 'system'; Integrations… 55 · Change password… 60 · this 62 (test-gear-menu: Integrations sits right before the password row; ONE vault row)
  label: () => t('Vault…'),
  run: (c) => openVaultWindow(c.app),
});
