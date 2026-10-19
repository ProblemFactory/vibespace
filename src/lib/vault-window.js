// THE VAULT WINDOW (lane vault-contents-window — the owner 2026-10-19: "vault 能不能加一个查看现在所有存储内容的功能，类似
// google password manager，需要输入密码才能查看一段时间"). Every credential the vault seals, listed MASKED, grouped by store
// (src/vault-inventory.js makes the rows: no character of a value, only a length class). The first 「显示」 (or 「全部显示」)
// asks for the second password again (「验证是你」, POST /api/vault/reveal-session — src/lib/vault-reveal.js: the window is
// THIS PAGE's, its secret in page memory only); for the next 5 minutes — a FIXED window the hub keeps, the countdown chip
// says how long — each 「显示」 is ONE POST /api/vault/reveal answering ONE value. A value goes in through `.value` only (never innerHTML), lives only in its row's field while that row is open
// (hiding it forgets it; the window closing ends the reveal window), and never rides StateSync / WS. 「复制」 clears the
// clipboard after 30 s when the page can. The doors per row are the store's own: 「删除」 through its own route with its
// card's confirm, 「换新…」 opens the re-authorize door where the store has one (integrations, channels).
// THE ONE DOOR (lane vault-one-door — the owner 2026-10-19, 「这个没必要分成两个按钮吧」): ⚙ System ▸ Vault… is the only gear row
// and opens THIS window; its HEADER is what the old ⚙ dialog held — the state (since when, set up when), the doors by state
// (设置第二密码… · 解锁… · 立即锁定 · 修改第二密码…) and 闲置后锁定 — over vault-unlock.js's facts and modals.
// Entry points: ⚙ System ▸ Vault…, the sidebar's System panel line, the vault's door (`vs-vault-door`) while unlocked.
import { t } from './i18n.js';
import { fetchJson, showToast, showConfirmDialog, copyText } from './utils.js';
import { UI_ICONS } from './icons.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { showUnlock, showSetup, showChange, vaultFacts, onVaultFacts, refreshVaultFacts, lockNow, setIdleHours, stateIconEl } from './vault-unlock.js';
import { revealLeftMs, revealHeaders, onRevealChange, noteRevealLeft, forgetReveal, endReveal, revealValue, revealWords } from './vault-reveal.js'; // r2: THE PAGE's window (its secret in page memory)
import { removeAccount, showReauthAccountDialog } from './channel-account-dialogs.js';
import { passkeyDeleteWords } from './browser-panel-model.js';
import { GROUPS, KIND_WORDS, searchRows, sortRows, countdownText, CLIPBOARD_CLEAR_MS } from '../vault-inventory.js'; // PURE: the rows' rules (test-vault-inventory)

const ICON = svgIcon16('<rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/><circle cx="8" cy="10.5" r="1"/>');
const MASK = '••••••••';
const vwEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const STORE_WORDS = { accounts: () => t('Accounts'), integrations: () => t('Integrations'), channels: () => t('Channels'), mounts: () => t('Storage'), 'app-secrets': () => t('App logins'), passkeys: () => t('Passkeys'), secrets: () => t('Hub secrets') };
const SIZE_WORDS = { short: () => t('short'), medium: () => t('medium'), long: () => t('long'), 'very long': () => t('very long'), unknown: () => t('unknown length') };
const kindWord = (k) => t(KIND_WORDS[k] || 'Secret');
const whenText = (ms) => (ms ? new Date(ms).toLocaleString() : '');
/** A row's name in the page's words: an integration's / a hub secret's label is an English key (` · <machine>` after it). */
const WORDED = new Set(['integrations', 'secrets']);
const labelWord = (row) => (WORDED.has(row.store) ? String(row.label).split(' · ').map((p, i) => (i ? p : t(p))).join(' · ') : row.label);

/** The store card's own confirm words for its delete door (the same keys the card uses). */
function confirmWords(key, row) {
  if (key === 'account') return { title: t('Remove account'), message: t('Remove "{name}" from VibeSpace? Sessions already running keep working.', { name: row.label }), confirm: t('Remove') };
  if (key === 'oat') return { title: t('Remove token'), message: t('Remove the long-lived token from “{name}”? Machines relying on it lose access at their next spawn (running sessions keep working).', { name: row.label }), confirm: t('Remove') };
  if (key === 'mount') return { title: t('Remove "{name}"?', { name: row.label }), message: t('The mount record and local mountpoint go away. Nothing is deleted remotely.'), confirm: t('Remove') };
  if (key === 'integration') return { title: t('Clear my keys'), message: t('Clear the keys you entered for {label}? The row falls back to the cluster default when one exists.', { label: row.label }), confirm: t('Clear') };
  if (key === 'passkey') { const [site, user] = String(row.label).split(' · '); const w = passkeyDeleteWords({ site, user: user || '' }, { w: t }); return { title: w.title, message: w.message, confirm: w.confirm }; }
  if (key === 'app-logins') return { title: t('Forget the logins this app keeps?'), message: t('VibeSpace keeps this app\'s logins for it in its own session; after you forget them the app asks again.'), confirm: t('Forget') };
  return { title: t('Delete'), message: row.label, confirm: t('Delete') };
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
    if (since) line.append(vwEl('span', 'vault-state-when', t('since {when}', { when: whenText(since) })));
    if (f.setUpAt) line.append(vwEl('span', 'vault-state-when', t('Set up {when}', { when: whenText(f.setUpAt) })));
    const acts = vwEl('div', 'vault-actions');
    const btn = (label, cls, fn) => { const b = vwEl('button', cls, label); b.type = 'button'; b.onclick = fn; acts.append(b); };
    if (state === 'not_set_up') btn(t('Set a second password…'), 'btn-create vault-do-setup', () => showSetup());
    if (state === 'locked') btn(t('Unlock…'), 'btn-create vault-do-unlock', () => showUnlock());
    if (state === 'unlocked') btn(t('Lock now'), 'btn-cancel vault-do-lock', () => lockNow());
    if (state !== 'not_set_up') btn(t('Change the second password…'), 'btn-cancel vault-do-change', () => showChange());
    head.append(line, acts);
    if (state === 'not_set_up') return;
    const idle = vwEl('label', 'vault-idle');
    const sel = vwEl('select', 'vault-idle-select');
    const cur = String(Number(f.idleLockHours) || 0);
    for (const k of IDLE_HOURS.map(String)) { const o = vwEl('option', null, k !== '0' ? t('{n} h', { n: Number(k) }) : t('Never')); o.value = k; o.selected = k === cur; sel.append(o); }
    sel.title = t('Lock the vault after this long with no keyboard or mouse on any VibeSpace page');
    sel.onchange = () => setIdleHours(sel.value);
    idle.append(vwEl('span', null, t('Lock after idle')), sel);
    head.append(idle);
  };
  return { head, draw };
}

async function channelAccount(id) {
  const d = await fetchJson('/api/channels?scope=accounts');
  return { a: (d && Array.isArray(d.adapters) ? d.adapters.find((x) => x && x.id === id) : null) || null, kinds: (d && d.kinds) || [] };
}

/** THE WINDOW (singleton). */
export function openVaultWindow(app, { syncId } = {}) {
  for (const [id, w] of app.wm.windows || []) {
    if (w && w.type === 'vault') { app.wm.revealWindow(id, { replay: !!syncId }); return w; }
  }
  const winInfo = app.wm.createWindow({ title: t('Vault'), type: 'vault', syncId, openSpec: { action: 'openVault' }, width: 780, height: 600 });
  const sig = winInfo._listenerCtl?.signal;
  // THE STATE: rows (masked) and the row elements (a value lives only in its row's <input> — nothing here holds one); the
  // reveal window is the page's (src/lib/vault-reveal.js)
  const st = { data: null, q: '', sort: 'name', closed: false, wasOpen: false };
  const rowEls = new Map(), headEls = new Map();

  const root = vwEl('div', 'vw');
  const bar = vwEl('div', 'vw-bar');
  const hd = vaultHead();   // lane vault-one-door: the old ⚙ dialog, as this window's header
  const timer = vwEl('span', 'vw-timer');
  timer.hidden = true;
  const search = vwEl('input', 'vw-search');
  search.type = 'search'; search.placeholder = t('Search'); search.setAttribute('aria-label', t('Search')); search.spellcheck = false;
  const sortSel = vwEl('select', 'vw-sort');
  sortSel.setAttribute('aria-label', t('Sort'));
  for (const [k, w] of [['name', t('Name')], ['kind', t('Kind')], ['created', t('Newest')], ['used', t('Recently used')]]) { const o = vwEl('option', null, w); o.value = k; sortSel.append(o); }
  const showAllB = vwEl('button', 'vw-btn vw-show-all', t('Show all'));
  const hideAllB = vwEl('button', 'vw-btn vw-hide-all', t('Hide all'));
  showAllB.type = hideAllB.type = 'button';
  bar.append(timer, search, sortSel, showAllB, hideAllB);
  const note = vwEl('div', 'vw-note');
  const list = vwEl('div', 'vw-list');
  root.append(hd.head, bar, note, list);
  winInfo.content.appendChild(root);

  // ── the reveal window: its countdown, its end ──
  const openRows = () => [...rowEls.values()].filter((x) => x.plain);
  function hideValue(x) {
    if (!x || !x.plain) return;
    x.plain.value = '';
    x.plain.remove();
    x.plain = null;
    x.mask.hidden = false; x.copy.hidden = true;
    x.show.textContent = t('Show');
    x.el.classList.remove('vw-open');
  }
  function hideAll() { for (const x of openRows()) hideValue(x); }
  function drawTimer() {
    const left = revealLeftMs();
    if (st.wasOpen && left <= 0) { st.wasOpen = false; const had = openRows().length; hideAll(); forgetReveal(); if (had) showToast(t('Values hidden again — the 5 minutes are over')); }   // wasOpen first: forgetReveal re-enters through onRevealChange
    st.wasOpen = left > 0;
    timer.hidden = !(left > 0);
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
      x.show.textContent = t('Hide');
      x.el.classList.add('vw-open');
      return true;
    }
    if (r && r.code === 'cancelled') return false;
    if (r && r.code === 'vault_locked') { lockedNow(); return false; }
    showToast(revealWords(r), { type: 'error' });
    return false;
  }

  async function copyValue(x) {
    if (!x.plain) return;
    const v = x.plain.value;
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
    if (!r) return;
    if (r.open === 'integration') { app.openIntegration?.(r.id); return; }
    if (r.open === 'channel-reauth') {
      const { a, kinds } = await channelAccount(r.id);
      if (a) showReauthAccountDialog(app, a, { kinds }); else showToast(t('That stored value is not there any more'), { type: 'error' });
    }
  }

  // ── the rows (keyed: a search or a sort moves them; an open value stays where it is) ──
  function rowFor(row) {
    const e = vwEl('div', 'vw-row');
    e.dataset.id = row.id; e.dataset.store = row.store;
    const main = vwEl('div', 'vw-main');
    main.append(vwEl('div', 'vw-label', labelWord(row)));
    const meta = [kindWord(row.kind)];
    if (!(row.store === 'secrets' && row.size === 'unknown')) meta.push(t('length: {size}', { size: (SIZE_WORDS[row.size] || SIZE_WORDS.unknown)() }));   // a hub secret: names and dates only
    if (row.detail) meta.unshift(WORDED.has(row.store) ? t(row.detail) : row.detail);   // an integration's field label is an English key (the registry's)
    if (row.createdAt) meta.push(t('saved {when}', { when: whenText(row.createdAt) }));
    if (row.lastUsed) meta.push(row.lastUsed.by === 'human' ? t('last opened {when} by you', { when: whenText(row.lastUsed.at) }) : t('key last used {when} by VibeSpace', { when: whenText(row.lastUsed.at) }));
    main.append(vwEl('div', 'vw-meta', meta.join(' · ')));
    const tech = vwEl('details', 'vw-tech');
    tech.append(vwEl('summary', null, t('Technical details')), vwEl('div', 'vw-tech-body', `${row.store} · ${row.entry} · ${row.field}`));
    main.append(tech);
    const val = vwEl('div', 'vw-value');
    const mask = vwEl('span', 'vw-mask', MASK);
    mask.setAttribute('aria-label', t('Hidden'));
    const show = vwEl('button', 'vw-btn vw-show', t('Show'));
    const copy = vwEl('button', 'vw-btn vw-copy', t('Copy'));
    show.type = copy.type = 'button';
    copy.hidden = true;
    if (row.revealable === false) show.hidden = true;   // int317: a machine's link token / a sealed file's key — never shown (the hub refuses it by name)
    val.append(mask, show, copy);
    const doors = vwEl('div', 'vw-doors');
    const x = { row, el: e, mask, show, copy, plain: null };
    if (row.doors && row.doors.rotate) { const b = vwEl('button', 'vw-btn vw-renew', t('Renew…')); b.type = 'button'; b.onclick = () => doRenew(row); doors.append(b); }
    if (row.doors && row.doors.delete) { const b = vwEl('button', 'vw-btn vw-del', t('Delete')); b.type = 'button'; b.onclick = () => doDelete(row); doors.append(b); }
    show.onclick = () => (x.plain ? hideValue(x) : revealRow(x));
    copy.onclick = () => copyValue(x);
    e.append(main, val, doors);
    return x;
  }
  function build() {
    hideAll();
    rowEls.clear(); headEls.clear();
    list.textContent = '';
    const d = st.data;
    if (!d || !Array.isArray(d.rows)) return;
    for (const s of GROUPS) {
      const info = (d.stores || []).find((x) => x.store === s.store) || { count: 0 };
      const h = vwEl('div', 'vw-group');
      h.dataset.store = s.store;
      h.append(vwEl('span', 'vw-group-name', (STORE_WORDS[s.store] || (() => s.label))()), vwEl('span', 'vw-group-n', String(info.count || 0)));
      if (info.error) h.append(vwEl('span', 'vw-group-err', t('could not be read ({code})', { code: info.error })));
      headEls.set(s.store, h);
    }
    for (const row of d.rows) rowEls.set(row.id, rowFor(row));
  }
  function place() {
    const d = st.data;
    if (!d || d.state === 'locked') return;
    const shown = sortRows(searchRows(d.rows || [], st.q), st.sort);
    const frag = document.createDocumentFragment();
    for (const s of GROUPS) {
      const mine = shown.filter((r) => r.store === s.store);
      const h = headEls.get(s.store);
      if (!h || (!mine.length && st.q)) continue;
      frag.append(h);
      if (!mine.length) { const empty = vwEl('div', 'vw-empty', t('Nothing stored here')); frag.append(empty); continue; }
      for (const r of mine) { const x = rowEls.get(r.id); if (x) frag.append(x.el); }
    }
    list.textContent = '';
    list.append(frag);
    if (!shown.length && st.q) list.append(vwEl('div', 'vw-empty', t('No stored value matches “{q}”', { q: st.q })));
  }
  function drawHead() {
    const d = st.data, state = d ? d.state : null;
    note.textContent = '';
    const locked = state === 'locked';
    root.classList.toggle('vw-nobar', !d || state !== 'unlocked');   // lane vault-one-door: no greyed controls — the bar shows once there is something to search
    if (locked) note.append(vwEl('span', null, t('The vault is locked — unlock it to see what it holds.')));   // the header's 解锁… is the one door
    else if (state === 'not_set_up') note.append(vwEl('span', null, t('Set a second password first — stored values are shown only behind it')));
    else if (d) note.append(vwEl('span', null, t('{n} stored values, sealed in the vault. Showing one asks for the second password again; they stay visible for 5 minutes.', { n: (d.rows || []).length })));
  }
  function lockedNow() { forgetReveal(); hideAll(); drawTimer(); refresh(); }
  async function refresh() {
    const r = await fetchJson('/api/vault/contents', { headers: revealHeaders() });
    if (st.closed) return;
    if (!r || r.ok === false) { st.data = null; drawHead(); list.textContent = ''; note.textContent = revealWords(r || {}); return; }
    st.data = { state: r.state, stores: r.stores || [], rows: r.rows || [] };
    if (r.reveal && r.reveal.open) noteRevealLeft(r.reveal.leftMs); else forgetReveal();
    drawTimer();
    build(); drawHead(); place();
  }

  search.addEventListener('input', () => { st.q = search.value; place(); }, { signal: sig });
  sortSel.onchange = () => { st.sort = sortSel.value; place(); };
  showAllB.onclick = async () => {
    const shown = sortRows(searchRows((st.data && st.data.rows) || [], st.q), st.sort);
    for (const r of shown) { if (r.revealable === false) continue; const x = rowEls.get(r.id); if (x && !x.plain && !(await revealRow(x))) break; }   // int317: never-shown rows are skipped (not a stop)
  };
  hideAllB.onclick = () => hideAll();
  // a lock anywhere (another tab, an agent's lock, the idle lock) hides every value at once
  const off = app.ws?.onGlobal?.((msg) => {
    if (!msg || msg.type !== 'vault-state' || st.closed) return;
    if (msg.state !== 'unlocked') { if (st.data && st.data.state !== msg.state) lockedNow(); else { forgetReveal(); hideAll(); drawTimer(); } }
    else if (st.data && st.data.state !== 'unlocked') refresh();
  });
  const offFacts = onVaultFacts(() => { if (!st.closed) hd.draw(); });
  sig?.addEventListener('abort', () => {
    st.closed = true;
    offFacts();
    hideAll();
    clearInterval(tick);
    offReveal();
    try { off?.(); } catch { /* the socket is gone */ }
    document.getElementById('vault-reveal-dialog')?.remove();
    endReveal();   // the window closed: this page's reveal window ends with it
  });
  hd.draw(); refreshVaultFacts();
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
  replay: (app, spec, { syncId } = {}) => openVaultWindow(app, { syncId }),
});
/** ⚙ System ▸ Vault… — THE ONE ROW (lane vault-one-door: the old dialog's row and Vault contents… became this one). */
registerMenuItem({
  menu: 'gear', parent: 'system', order: 62, icon: UI_ICONS.lock, // gear-menu.js head 'system'; Integrations… 55 · Change password… 60 · this 62 (test-gear-menu: Integrations sits right before the password row; ONE vault row)
  label: () => t('Vault…'),
  run: (c) => openVaultWindow(c.app),
});
