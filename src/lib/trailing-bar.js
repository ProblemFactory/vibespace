// THE TRAILING BAR of the regular class (lane duo-build-1 slice 2 + 2b — SPEC-v3 rev 3.3 §2.2 + the owner, 2026-10-25:
// 「因为 duo 有那个特殊的侧栏，可以考虑把一些电脑版的侧边按钮放过去，比普通手机版访问容易一些效率高一些 … 你自己综合考虑吧」).
// On the iPhone Duo's inner display (the regular class, src/viewport-class.js) the phone's own #mobile-nav stands on the
// trailing edge as ONE vertical bar of 44 px buttons — our bar, never Apple's system vertical bar (no status cluster, no
// 84 pt, no system material). Apple's order for a vertical bar (HIG «Vertical controls»: toolbar above, tab bar below):
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
import { showWindowContextMenu, sessionForWin } from './taskbar.js';
import { openChannelsWindow } from './channels-panel.js';
import { openJobsWindow } from './jobs-panel.js';
import { openFilesDoor } from './phone-files.js';
import { SESSION_STATE_META } from './sidebar-tasks.js';
import { uiScale } from './utils.js';

/** The destination each bottom button opens and how it knows it is on show. */
const DESTS = [
  { id: 'tasks', label: 'Task Groups', icon: () => RAIL_ICONS.tasks, on: (app) => app.sidebar?._activeTab === 'tasks',
    run: (app) => { const tab = document.querySelector('.sidebar-tab[data-tab="tasks"]'); if (tab) tab.click(); else { app.sidebar._activeTab = 'tasks'; app.sidebar._updateTabs?.(); app.sidebar._render?.(); } } },
  { id: 'files', label: 'Files', existing: 'mobile-nav-files', on: (app, w) => w?.type === 'files', run: (app) => openFilesDoor(app) },
  { id: 'channels', label: 'Channels', icon: () => RAIL_ICONS.channels, on: (app, w) => w?.type === 'channels', run: (app) => openChannelsWindow(app) },
  { id: 'browser', label: 'Agent browser', icon: () => RAIL_ICONS.browser, on: (app, w) => w?.type === 'browser-profiles', run: (app) => app.openBrowserProfiles?.() },
  { id: 'jobs', label: 'Background Work', icon: () => RAIL_ICONS.jobs, on: (app, w) => w?.type === 'jobs', run: (app) => openJobsWindow(app) },
];
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
    const r = more.getBoundingClientRect();
    const menu = showWindowContextMenu(app, w.id, r.left, r.top);
    // the menu opens INTO the conversation column, its top on the button's (SPEC-v3 §2.2): its RIGHT edge beside a vertical
    // bar (a menu that grows after it is measured grows leftwards, never over the bar), under a horizontal one
    const Z = uiScale();
    if (menu && getComputedStyle(nav).flexDirection === 'column') { menu.style.left = 'auto'; menu.style.right = ((innerWidth - r.left + 8) / Z) + 'px'; }
    else if (menu) { menu.style.top = ((r.bottom + 4) / Z) + 'px'; menu.style.bottom = ''; menu.style.left = 'auto'; menu.style.right = (Math.max(4, innerWidth - r.right) / Z) + 'px'; }
  };
  live.onclick = () => { const w = activeWin(); const s = sessionForWin(app, w); if (w && s?.webuiId) app.openBrowserLiveBeside?.(w, s.webuiId); };
  for (const { d, b } of dests) if (!d.existing) b.onclick = () => { d.run(app); update(); };
  // the files door keeps its own onclick (phone-files.js) — the selected state follows the window it opens

  // a long press (touch: the synthesized contextmenu) says the label beside the button
  let tip = null, tipTimer = null;
  nav.addEventListener('contextmenu', (e) => {
    const b = e.target.closest?.('.mnav-bar-btn, .mnav-dest, #mobile-nav-gear');
    if (!b || !regular()) return;
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
    more.classList.toggle('on', !!w);
    live.classList.toggle('on', conv && holdsBrowser(app, sessionForWin(app, w)));
    for (const { d, b } of dests) { const sel = !!d.on(app, w); b.classList.toggle('selected', sel); b.setAttribute('aria-pressed', sel ? 'true' : 'false'); }
    // the conversation's head = its name + its state word (SPEC-v3 §2.4): the title bar in landscape, the bar's title in portrait
    const s = conv ? sessionForWin(app, w) : null;
    const st = s ? app.sidebar?.getSessionStatus?.(s) : null;
    const running = !!s && (s.status === 'live' || s.status === 'tmux');
    const state = st?.state && (running || !['working', 'needs-input'].includes(st.state)) ? st.state : (running ? 'working' : '');
    const meta = state ? SESSION_STATE_META[state] : null;
    if (w?.titleSpan) { w.titleSpan.dataset.state = meta ? meta.label : ''; w.titleSpan.style.setProperty('--state-color', meta?.color || 'var(--text-dim)'); }
    stateEl.textContent = meta ? meta.label : '';
    stateEl.style.setProperty('--state-color', meta?.color || 'var(--text-dim)');
  }
  update();
  return { update, el: nav };
}
