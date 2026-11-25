// THE TRAILING BAR of the regular class (lane duo-build-1 slice 2 + 2b — SPEC-v3 rev 3.3 §2.2 + the owner, 2026-10-25:
// 「因为 duo 有那个特殊的侧栏，可以考虑把一些电脑版的侧边按钮放过去，比普通手机版访问容易一些效率高一些 … 你自己综合考虑吧」).
// On the iPhone Duo's inner display (the regular class, src/viewport-class.js) the phone's own #mobile-nav stands on the
// trailing edge as ONE vertical bar of 44 px buttons — our bar. In a Safari tab (and on a shape with no side column) it stands
// beside the page, our own 56 px; in the HOME-SCREEN copy it stands INSIDE the system's side column, under the system's clock
// and status marks (B-78db, src/lib/side-column.js — the column then holds GLOBAL things only: see THE COLUMN below).
// Apple's order for a vertical bar (HIG «Vertical controls»: toolbar above, tab bar below):
//   · TOP — THIS conversation's actions: ✕ (only while a window other than a conversation covers the column: a viewer,
//     a panel — it closes and the conversation is back) → Artifacts (its count as a badge) → ⋯ (the window's menu, the
//     one More of this conversation) → Agent browser — live view (only while the conversation holds a browser)
//   · a visible gap
//   · BOTTOM — GLOBAL DESTINATIONS from the desktop rail, the ones a phone reaches only through ☰ / ⚙: Task Groups (the
//     list column's own board view), Files, Channels, Agent browser, Background Work — then ⚙ last. The rest of the
//     rail (Remote = the list's third tab; Ports, Agents, Plugins, System, Diagnostics = ⚙'s rows) stays where it is:
//     a second ⋯ on one bar would be a second overflow (HIG: the ellipsis is reserved for the one overflow).
// A destination opens IN the conversation column (its existing window — the list column stays); the one on show wears
// the selected state. Icons only; the label is the title / aria-label, and a long press shows it beside the button.
// The inner portrait (the regular class, portrait) keeps the bar horizontal over the conversation column (SPEC-v3 §4:
// ☰ · ✕ · title · Artifacts · ⋯ · ⚙) — the stylesheet decides which buttons show where; this module only builds them,
// keeps their state and runs their commands.
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { RAIL_ICONS } from './sidebar-rail.js';
import { showWindowContextMenu, sessionForWin, windowMenuHolds } from './taskbar.js';
import { openChannelsWindow } from './channels-panel.js';
import { openJobsWindow } from './jobs-panel.js';
import { openFilesDoor } from './phone-files.js';
import { SESSION_STATE_META } from './sidebar-tasks.js';
import { uiScale } from './utils.js';
import { registerMenuItem } from './contributions.js';
import { columnShape, yieldShape, columnFit, COLUMN_YIELDS } from './side-column.js';

/** The destination each bottom button opens and how it knows it is on show. */
const DESTS = [
  { id: 'tasks', label: 'Task Groups', icon: () => RAIL_ICONS.tasks, on: (app) => app.sidebar?._activeTab === 'tasks',
    run: (app) => { const tab = document.querySelector('.sidebar-tab[data-tab="tasks"]'); if (tab) tab.click(); else { app.sidebar._activeTab = 'tasks'; app.sidebar._updateTabs?.(); app.sidebar._render?.(); } } },
  { id: 'files', label: 'Files', existing: 'mobile-nav-files', on: (app, w) => w?.type === 'files', run: (app) => openFilesDoor(app, { pressed: true }) },
  { id: 'channels', label: 'Channels', icon: () => RAIL_ICONS.channels, on: (app, w) => w?.type === 'channels', run: (app) => openChannelsWindow(app) },
  { id: 'browser', label: 'Agent browser', icon: () => RAIL_ICONS.browser, on: (app, w) => w?.type === 'browser-profiles', run: (app) => app.openBrowserProfiles?.() },
  { id: 'jobs', label: 'Background Work', icon: () => RAIL_ICONS.jobs, on: (app, w) => w?.type === 'jobs', run: (app) => openJobsWindow(app) },
];
/** THE COLUMN (B-78db slice 1b — 主开发 r3949, the owner: the side column holds GLOBAL things only; what acts on the conversation
 *  on show stands at the BOTTOM with it). Where the bar stands in the system's column (side-column.js columnShape): For you, Task
 *  Groups, Files, Channels, Desktops (it has no row in Global settings, so it stays), Global settings last — and on the outer
 *  display before them the list of conversations and «+» (create or open). OUT of the column (style.css): Artifacts (the strip's
 *  own door — once), this conversation's search and its window's menu (the strip's «Conversation settings» door, its last two
 *  rows — chat-status-bar.js), a held browser's live view (the strip's Browser door, «Open live view»), Agent browser and
 *  Background Work (Global settings ▸ Tools). A window with no strip wears its own ⋯ (a terminal) and its ✕ (a viewer) at its
 *  head's end. THE LAW (r3948 3 (a)): the column never overflows — fitColumn measures it and what does not fit yields, in
 *  COLUMN_YIELDS' order, into a row of Global settings (the rows below). */
const COLUMN_EL = Object.freeze({ menu: 'mobile-nav-menu', todos: 'mobile-nav-todos', new: 'mobile-nav-new', tasks: 'mobile-nav-dest-tasks', files: 'mobile-nav-files', channels: 'mobile-nav-dest-channels', desktops: 'mobile-nav-desktops', browser: 'mobile-nav-dest-browser', jobs: 'mobile-nav-dest-jobs', gear: 'mobile-nav-gear' });
const KEY_OF_EL = Object.freeze(Object.fromEntries(Object.entries(COLUMN_EL).map(([k, id]) => [id, k])));
const COLUMN_YIELDED = new Set();   // the keys fitColumn took out of the column now — each a row of Global settings
const forYouCount = () => Number(document.querySelector('#mobile-nav-todos .mnav-one')?.textContent) || 0;
const COLUMN_LABEL = Object.freeze({
  menu: () => t('Sessions'), todos: () => (forYouCount() ? t('For you · {n}', { n: forYouCount() }) : t('For you')), new: () => t('Create or open…'),
  tasks: () => t('Task Groups'), files: () => t('Files'), channels: () => t('Channels'), desktops: () => t('Desktops'),
  browser: () => t('Agent browser'), jobs: () => t('Background Work'),   // the bar's two extra doors (r4185: the bar's own yield)
});
for (const [i, k] of ['menu', 'todos', 'new', 'tasks', 'files', 'channels', 'desktops', 'browser', 'jobs'].entries()) {
  registerMenuItem({ menu: 'gear', group: '0_column', order: 10 + i, id: `gear/column-${k}`, when: () => COLUMN_YIELDED.has(k), label: COLUMN_LABEL[k], run: () => document.getElementById(COLUMN_EL[k])?.click() });
}

/** THE LAW, measured: the column's content height against every drawn child (the gap at its least, 8 px), the verdict applied
 *  as .col-yield (style.css hides it) and remembered for Global settings' rows. In the side column, and (主开发 r4185) in the
 *  regular class's trailing bar held landscape with no column, whose doors overflowed a short screen since the release.
 *  Anywhere else nothing yields. */
export function fitColumn(nav = document.getElementById('mobile-nav')) {
  for (const id of Object.values(COLUMN_EL)) document.getElementById(id)?.classList.remove('col-yield');
  COLUMN_YIELDED.clear();
  const shape = nav ? yieldShape() : null;
  if (!shape || !nav.getClientRects().length) { if (nav) delete nav.dataset.colYield; return null; }
  const cs = getComputedStyle(nav);
  const room = nav.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  const items = [...nav.children].filter((el) => el.getClientRects().length && getComputedStyle(el).position !== 'fixed').map((el) => ({
    key: KEY_OF_EL[el.id] || (el.classList.contains('mnav-gap') ? 'gap' : el.id || 'other'),
    px: el.classList.contains('mnav-gap') ? (parseFloat(getComputedStyle(el).minHeight) || 0) : el.offsetHeight,
  }));
  const v = columnFit({ room, items, gap: parseFloat(cs.rowGap) || 0, yields: COLUMN_YIELDS[shape] });
  for (const k of v.yielded) { document.getElementById(COLUMN_EL[k])?.classList.add('col-yield'); COLUMN_YIELDED.add(k); }
  if (v.yielded.length) nav.dataset.colYield = v.yielded.join(' '); else delete nav.dataset.colYield;
  return v;
}

/** The window types that ARE a conversation (a session window) — anything else covering the column wears the ✕. */
const isConversation = (app, w) => !!w && app.sessions?.has?.(w.id);

/** The conversation's browser (taskbar.js's own rule for the window menu's live-view row). */
const holdsBrowser = (app, s) => !!s && s.status === 'live' && !!app._browserProfiles && !!s.webuiId && !!s.browserKey && !s.host && (s.browserProfileActive != null || !!s.browserInput);

export function installTrailingBar(app) {
  const nav = document.getElementById('mobile-nav');
  if (!nav) return null;
  const mk = (id, label, svg, cls = '') => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = 'mnav-bar-btn ' + cls;
    b.innerHTML = svg || '';
    b.title = label; b.setAttribute('aria-label', label);
    return b;
  };
  const close = mk('mobile-nav-viewer-close', t('Close'), UI_ICONS.close, 'mnav-top');
  const arts = mk('mobile-nav-artifacts', t('Artifacts · {n}', { n: 0 }), UI_ICONS.memo, 'mnav-top');
  const badge = document.createElement('span'); badge.className = 'mnav-badge hidden'; arts.appendChild(badge);
  const more = mk('mobile-nav-more', t('More'), UI_ICONS.more, 'mnav-top');
  const live = mk('mobile-nav-live', t('Agent browser — live view'), UI_ICONS.browserLive, 'mnav-top');
  const gap = document.createElement('span'); gap.className = 'mnav-gap'; gap.setAttribute('aria-hidden', 'true');
  const dests = DESTS.map((d) => {
    const b = d.existing ? document.getElementById(d.existing) : mk('mobile-nav-dest-' + d.id, t(d.label), d.icon(), 'mnav-dest');
    if (!b) return null;
    b.classList.add('mnav-dest');
    b.dataset.dest = d.id;
    if (d.existing) { b.title = t(d.label); b.setAttribute('aria-label', t(d.label)); }
    return { d, b };
  }).filter(Boolean);
  // the portrait head's state word: its own span after the title, so the name's ellipsis never eats it (SPEC-v3 §4)
  const stateEl = document.createElement('span'); stateEl.id = 'mobile-nav-state'; stateEl.className = 'mnav-state';
  document.getElementById('mobile-nav-title')?.after(stateEl);
  const gear = document.getElementById('mobile-nav-gear');
  gear?.classList.add('mnav-gear');
  nav.append(close, arts, more, live, gap, ...dests.filter((x) => !x.d.existing).map((x) => x.b));
  nav.classList.add('has-bar');

  const activeWin = () => app.wm?.windows?.get(app.wm.activeWindowId) || null;
  const regular = () => app.viewportClass?.() === 'regular';
  close.onclick = () => { const w = activeWin(); if (w && !isConversation(app, w)) app.wm.requestClose(w.id); };
  arts.onclick = () => { const w = activeWin(); const cv = w && app.sessions?.get?.(w.id); cv?._statusBar?._onOpenArtifactsWindow?.(); };
  more.onclick = (e) => {
    e.stopPropagation();
    const w = activeWin(); if (!w) return;
    if (!windowMenuHolds(app, w.id)) { update(); return; }   // its rows left since the last update: no empty menu — ⋯ leaves
    const r = more.getBoundingClientRect();
    const menu = showWindowContextMenu(app, w.id, r.left, r.top);
    // the menu opens INTO the conversation column, its top on the button's (SPEC-v3 §2.2): its RIGHT edge beside a vertical
    // bar (a menu that grows after it is measured grows leftwards, never over the bar), under a horizontal one
    const Z = uiScale();
    if (menu && getComputedStyle(nav).flexDirection === 'column' && !columnShape()) { menu.style.left = 'auto'; menu.style.right = ((innerWidth - r.left + 8) / Z) + 'px'; }
    else if (menu) { menu.style.top = ((r.bottom + 4) / Z) + 'px'; menu.style.bottom = ''; menu.style.left = 'auto'; menu.style.right = (Math.max(4, innerWidth - r.right) / Z) + 'px'; }
  };
  live.onclick = () => { const w = activeWin(); const s = sessionForWin(app, w); if (w && s?.webuiId) app.openBrowserLiveBeside?.(w, s.webuiId); };
  for (const { d, b } of dests) if (!d.existing) b.onclick = () => { d.run(app); update(); };
  // the files door keeps its own onclick (phone-files.js) — the selected state follows the window it opens

  // a long press (touch: the synthesized contextmenu) says the label beside the button
  let tip = null, tipTimer = null;
  nav.addEventListener('contextmenu', (e) => {
    const b = e.target.closest?.('.mnav-bar-btn, .mnav-dest, #mobile-nav-gear, .mnav-state[data-form="dot"]');   // the state's dot says its word too (主开发 r1344)
    if (!b || (!regular() && !columnShape())) return;
    e.preventDefault(); e.stopPropagation();
    if (!tip) { tip = document.createElement('div'); tip.className = 'mnav-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
    tip.textContent = b.getAttribute('aria-label') || b.title || '';
    const r = b.getBoundingClientRect();
    tip.style.display = 'block';
    const vertical = getComputedStyle(nav).flexDirection === 'column';
    tip.style.top = (vertical ? r.top + r.height / 2 - tip.offsetHeight / 2 : r.bottom + 6) + 'px';
    tip.style.left = (vertical ? r.left - tip.offsetWidth - 8 : Math.max(4, Math.min(r.left, innerWidth - tip.offsetWidth - 4))) + 'px';
    clearTimeout(tipTimer); tipTimer = setTimeout(() => { if (tip) tip.style.display = 'none'; }, 1600);
  });

  /** Every window change, a list-tab change, an artifacts count: the bar's buttons follow the window on show. */
  function update() {
    const w = activeWin();
    const conv = isConversation(app, w);
    close.classList.toggle('on', !!w && !conv);
    const cv = conv ? app.sessions.get(w.id) : null;
    const n = (cv?._statusBar?._artifacts?.count) || 0;
    arts.classList.toggle('on', !!cv && w.type === 'chat');
    arts.title = t('Artifacts · {n}', { n }); arts.setAttribute('aria-label', arts.title);
    badge.textContent = n > 99 ? '99+' : String(n); badge.classList.toggle('hidden', !n);
    // ⋯ STANDS ONLY WHEN IT HOLDS A ROW (主开发 2026-11-18 23:09Z): this class has no window-manager verb, so a files window's
    // menu holds none — and ⚙ folds only into a ⋯ that stands (style.css). Its coming or going moves the head's room: re-fit.
    const holds = !!w && (regular() || !!columnShape()) && windowMenuHolds(app, w.id), moved = holds !== more.classList.contains('on');   // judged only where ⋯ is drawn (the outer column: at the head's end)
    more.classList.toggle('on', holds);
    live.classList.toggle('on', conv && holdsBrowser(app, sessionForWin(app, w)));
    for (const { d, b } of dests) { const sel = !!d.on(app, w); b.classList.toggle('selected', sel); b.setAttribute('aria-pressed', sel ? 'true' : 'false'); }
    // what is on show, for the column's stylesheet (B-78db): a chat's ⋯ is its strip's; a viewer's ✕ and a terminal's ⋯ stand at its head
    const onshow = !w ? 'none' : !conv ? 'viewer' : w.type === 'chat' ? 'chat' : 'session';
    if (document.documentElement.dataset.onshow !== onshow) document.documentElement.dataset.onshow = onshow;
    fitColumn(nav);
    // the conversation's head = its name + its state word (SPEC-v3 §2.4): the title bar in landscape, the bar's title in portrait
    const s = conv ? sessionForWin(app, w) : null;
    const st = s ? app.sidebar?.getSessionStatus?.(s) : null;
    const running = !!s && (s.status === 'live' || s.status === 'tmux');
    const state = st?.state && (running || !['working', 'needs-input'].includes(st.state)) ? st.state : (running ? 'working' : '');
    const meta = state ? SESSION_STATE_META[state] : null;
    if (w?.titleSpan) { w.titleSpan.dataset.state = meta ? meta.label : ''; w.titleSpan.style.setProperty('--state-color', meta?.color || 'var(--text-dim)'); }
    const had = !!stateEl.textContent.trim();
    stateEl.textContent = meta ? meta.label : '';
    stateEl.style.setProperty('--state-color', meta?.color || 'var(--text-dim)');
    // a new word: whole, or its dot alone (主开发 r1344) — a word that appears or leaves moves the room the head's ladder
    // measured the name in (the dot's room held or not), so the head runs again; a word that only changes is re-decided
    if (moved || had !== !!stateEl.textContent.trim()) app._mobileNav?._paintHead?.(); else app._mobileNav?._paintState?.();
  }
  update();
  /** The list moved (sidebar.js _mergeAndRender — every poll, every frame). Of it the bar reads only the window on show's own
   *  session facts (its rows, the live view, the state word), so it updates only when those changed: a merge that moved
   *  nothing runs no window registry and no style read (the reading w7vpg6swt). */
  let listSeen = '';
  function onList() {
    const w = activeWin(), s = sessionForWin(app, w);
    const key = JSON.stringify([w?.id || null, regular(), s && [s.webuiId, s.sessionId, s.status, s.browserKey, s.host, s.browserProfileActive, !!s.browserInput], s ? app.sidebar?.getSessionStatus?.(s)?.state || '' : '']);
    if (key === listSeen) return;
    listSeen = key;
    update();
  }
  /** THE WINDOW'S MENU FROM THE BOTTOM (B-78db, r3949): the strip's «Conversation settings» door, in the column, opens window
   *  `id`'s menu above the strip's door `anchor` — the conversation's own overflow, at the bottom with it */
  function windowMenuAt(id, anchor) {
    if (!id || !app.wm?.windows?.get(id)) return null;
    const r = anchor.getBoundingClientRect();
    const menu = showWindowContextMenu(app, id, r.left, r.top);
    const Z = uiScale();
    if (menu) { menu.style.top = 'auto'; menu.style.bottom = (Math.max(4, innerHeight - r.top + 4) / Z) + 'px'; menu.style.right = 'auto'; menu.style.left = (Math.max(4, r.left) / Z) + 'px'; }
    return menu;
  }
  // the column's height or its shape moved (a rotation, the sidecol read again, a zoom): the law runs again
  try { new ResizeObserver(() => fitColumn(nav)).observe(nav); } catch { }
  window.addEventListener('resize', () => fitColumn(nav));
  window.addEventListener('vs-viewport-class', () => update());
  return { update, onList, el: nav, state: stateEl, windowMenuAt, fitColumn: () => fitColumn(nav) };   // the head's state word (mobile-nav.js _paintState reads it here)
}

// ⚙ folded into ⋯ (lane phone-six r2 — the name keeps 8 em, mobile-nav.js _paintHead's 'gear' step): ⋯'s last row is it
const gearFolded = () => { const nav = document.getElementById('mobile-nav'), g = document.getElementById('mobile-nav-gear'); return !!nav && !!g && ['gear', 'icon'].includes(nav.dataset.yield) && getComputedStyle(g).display === 'none'; };
registerMenuItem({ menu: 'window', group: '9_bar', order: 10, id: 'window/bar-gear', when: gearFolded, label: () => t('Global settings'), run: (c) => c.app._pressGlobalSettings(document.getElementById('mobile-nav-more')) });
// lane mask-value-shape (the strip's step two): the conversation's search door yields with the window's own extras (the head's
// ladder, from its first step — the hosted test-duo-layout at 669 portrait: a seventh button pushed ⚙ off) — its row in ⋯, so
// search stays one press away there
const searchFolded = () => { const nav = document.getElementById('mobile-nav'), s = document.getElementById('mobile-nav-search'); return !!nav && !!s && s.classList.contains('on') && !!nav.dataset.yield && getComputedStyle(s).display === 'none'; };
registerMenuItem({ menu: 'window', group: '9_bar', order: 5, id: 'window/bar-search', when: searchFolded, label: () => t('Search this conversation'), run: (c) => c.app._mobileNav?._shownChat?.()?._search?.open?.() });
