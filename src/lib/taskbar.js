import { createPopover, showContextMenu, uiScale } from './utils.js';
import { groupClickVerdict, hoverVerdict, groupKeyVerdict, inFrontOf, GROUP_HOVER_INTENT_MS, GROUP_HOVER_LEAVE_MS } from './taskbar-group.js';
import { t } from './i18n.js';
import { visualTabOrder } from './chain-layout.js'; // the chooser lists a group in its STRIP order (split tabs v2: left half, then right)
import { registerCommand, registerMenuItem, menuItems as contribMenuItems } from './contributions.js';

// Resolve the sidebar SESSION object behind a session window (chat/terminal)
// — identity kept fresh in _openSpec by syncSessionIdentity. Non-session
// windows (files/editor/browser) return null: Rename/Task-Groups are
// session-level concepts.
function sessionForWin(app, win) {
  if (!win || (win.type !== 'chat' && win.type !== 'terminal')) return null;
  const spec = win._openSpec || {};
  const all = app.sidebar?._allSessions || [];
  return all.find((s) =>
    (spec.backendSessionId && s.sessionId === spec.backendSessionId)
    || (spec.serverId && s.webuiId === spec.serverId)) || null;
}

// "Switch window" submenu items (2.212.0, title-bar right-click). Scope from
// window.titlebarSwitchScope: 'overlap' (windows intersecting this one — the
// pre-2.212 behavior of the whole right-click) | 'desktop' (all windows on
// the active desktop) | 'all' (every window, cross-desktop entries labeled
// with their desktop name). Click routes through app.goToWinId (tab-chain +
// stage + desktop aware).
function switchWindowItems(app, selfId) {
  const scope = app.settings?.get('window.titlebarSwitchScope') || 'overlap';
  const wm = app.wm;
  const self = wm.windows.get(selfId);
  if (!self) return [];
  const dm = app.desktopManager;
  const activeDesk = dm?.activeDesktopId;
  const deskName = (id) => dm?.desktops?.find((d) => d.id === id)?.name || '';
  const selfRect = self.element.getBoundingClientRect();
  const items = [];
  for (const [wid, w] of wm.windows) {
    if (wid === selfId || w._isStagePlaceholder) continue;
    // tab-group GUESTS have no geometry of their own (content reparented into
    // the host element) — skip them in the geometric scope; the wider scopes
    // list them as direct jump-to-tab entries (goToWinId resolves host+tab).
    const isGuest = w._tabChain && w._tabChain.tabs[0] !== wid;
    if (scope === 'overlap') {
      if (isGuest || w._hiddenByDesktop || w._hiddenByStage || w.isMinimized) continue;
      if (!wm._rectsOverlap(selfRect, w.element.getBoundingClientRect())) continue;
    } else if (scope === 'desktop') {
      if (w._hiddenByStage) continue;
      if (activeDesk && w._desktopId && w._desktopId !== activeDesk) continue;
    }
    const otherDesk = scope === 'all' && w._desktopId && w._desktopId !== activeDesk && w._desktopId !== '__stage__';
    items.push({
      label: (w.title || w.type) + (otherDesk ? `  — ${deskName(w._desktopId)}` : '') + (w.isMinimized ? ' ' + t('(minimized)') : ''),
      action: () => app.goToWinId(wid),
    });
  }
  if (!items.length) items.push({ label: t('(no windows)'), disabled: true });
  return items;
}

/**
 * Rebuild the taskbar items from the current window state.
 * Called as app.updateTaskbar() — the App method delegates here.
 */
export function updateTaskbar(app) {
  const container = document.getElementById('taskbar-items');
  const activeDesk = app.desktopManager?.activeDesktopId;

  // Collect visible entries + per-entry star prefix (one sidebar map instead
  // of an Array.find per window)
  const webuiIdToSession = new Map();
  for (const s of app.sidebar?._allSessions || []) { if (s.webuiId) webuiIdToSession.set(s.webuiId, s); }
  const entries = [];
  for (const [id, win] of app.wm.windows) {
    // Skip grouped guests — only the host appears in taskbar
    if (win._tabChain && win._tabChain.tabs[0] !== id) continue;
    // Skip windows on other desktops
    if (activeDesk && win._desktopId && win._desktopId !== activeDesk) continue;
    const term = app.sessions.get(id);
    let starPrefix = '';
    if (term?.sessionId) {
      const match = webuiIdToSession.get(term.sessionId);
      if (match && app.sidebar.isStarred(match)) starPrefix = '\u2605 ';
    }
    // Tab group host → collect its tabs so the taskbar shows a stacked entry
    let group = null;
    if (win._tabChain && win._tabChain.tabs[0] === id) {
      const chain = win._tabChain;
      const tabWins = chain.tabs.map(tid => ({ id: tid, win: app.wm.windows.get(tid) })).filter(t => t.win);
      if (tabWins.length > 1) group = { chain, tabWins, active: Math.min(chain.active, tabWins.length - 1) };
    }
    entries.push({ id, win, starPrefix, group });
  }

  // Structure unchanged → update state classes in place. onWindowsChanged
  // fires on EVERY focus (each mousedown); a full innerHTML rebuild + listener
  // re-wiring per click was constant churn.
  const structKey = entries.map(e => {
    const g = e.group
      ? `\tG:${e.group.tabWins.map(t => t.id).join(',')}:${e.group.active}:${e.group.tabWins.map(t => t.win.title).join('\t')}`
      : '';
    return `${e.id}\t${e.win.title}\t${e.starPrefix}${g}`;
  }).join('\n');
  if (container._structKey === structKey) {
    for (const el of container.children) _applyTaskbarItemState(app, el);
  } else {
    container._structKey = structKey;
    container.innerHTML = '';
    _rebuildTaskbarItems(app, container, entries);
  }
  const winCount = [...app.wm.windows.values()].filter(w => !activeDesk || w._desktopId === activeDesk).length;
  // Compact chip: window-stack icon + bare count; the wordy label lives in the tooltip
  const countEl = document.getElementById('active-count');
  countEl.textContent = winCount;
  const chip = document.getElementById('taskbar-status');
  chip.title = `${winCount} window${winCount === 1 ? '' : 's'} — click for window list`;
  chip.onclick = (e) => { e.stopPropagation(); showWindowList(app, chip); };
}

function _rebuildTaskbarItems(app, container, entries) {
  for (const { id, win, starPrefix, group } of entries) {
    const item = document.createElement('div'); item.className = 'taskbar-item';
    item.dataset.winId = id;
    // Tab group → render a stacked entry (Windows-style) instead of a single icon
    if (group) { _buildGroupItem(app, container, item, win, starPrefix, group); continue; }
    if (id === app.wm.activeWindowId && !win.isMinimized) item.classList.add('active');
    if (win.isMinimized) item.classList.add('minimized');
    if (win.element.classList.contains('window-waiting')) item.classList.add('waiting');
    // Icon: clone the window's backend+mode icon if available, else use type emoji
    const icon = document.createElement('span');
    icon.className = 'taskbar-icon';
    if (win.backendIconSlot?.children.length) {
      const clone = win.backendIconSlot.children[0].cloneNode(true);
      clone.style.width = ''; clone.style.height = '';
      icon.appendChild(clone);
    } else {
      icon.innerHTML = win._typeIcon || '';
    }
    item.title = win.title; // full title — taskbar items truncate hard
    // Text column (title + subtitle)
    const textCol = document.createElement('div');
    textCol.className = 'taskbar-text';
    const title = document.createElement('div');
    title.className = 'taskbar-title';
    // Split title: first part = name, second part = path (after " — ")
    const parts = win.title.split(' \u2014 ');
    title.textContent = starPrefix + (parts[0] || win.title);
    const subtitle = document.createElement('div');
    subtitle.className = 'taskbar-subtitle';
    subtitle.textContent = parts[1] || win.type;
    textCol.append(title, subtitle);
    item.append(icon, textCol);
    // Draggable: allow dropping onto desktop previews
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/window-id', id);
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('click', () => {
      if (!win.isMinimized && id === app.wm.activeWindowId) app.wm.minimize(id);
      else activateWindow(app, id); // restore a minimized one, else focus + raise (the grouped button's activation too)
    });
    // Right-click context menu for window recovery
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showWindowContextMenu(app, id, e.clientX, e.clientY);
    });
    container.appendChild(item);
  }
}

// Shared per-window context menu (taskbar items, group items, window-list
// rows). Opens upward only when invoked in the lower half of the screen
// (bottom taskbar); downward otherwise \u2014 a top-docked taskbar or a
// window-count chip moved into the toolbar must not push the menu off-screen.
// opts.onAction(kind) fires after any action ('move'|'minimize'|'desktop'|
// 'close') so a hosting popover can refresh itself instead of going stale.
// ── WINDOW COMMANDS + the 'window' MENU (contributions registry, Plugin Ph1).
//    The title-bar / taskbar / window-list right-click menu is the
//    registrations below, rendered by menuItems('window', ctx) in the
//    hand-built order (scripts/test-contributions.mjs diffs it against a
//    verbatim copy of the pre-registry builder over a state matrix). Window
//    verbs are `window.*` commands over ctx.id; the session block reuses the
//    `session.*` commands session-card.js registers (same semantics: restart /
//    resume / locate / properties over ctx.s) plus two window-flavoured ones
//    (rename via the sidebar, terminate WITHOUT the card's confirm — as before).
//    ctx = { app, id, win, s (the sidebar session behind a chat/terminal
//    window, else null), switchSubmenu, closeLabel }. Items carry `kind`; the
//    renderer fires onAction(kind) after each action (children inherit their
//    parent's kind — Task Groups / Move to Desktop — never the Switch-window
//    submenu, which had none).
//    Keep this block self-contained (the gate suite extracts + replays it):
//    it closes over registerCommand, registerMenuItem, t, switchWindowItems only. ──
export function registerWindowMenu() {
  const M = 'window';
  const hasSess = (c) => !!c.s;
  const live = (c) => hasSess(c) && c.s.status === 'live';
  registerCommand({ id: 'window.move', title: () => t('Move'), run: (c) => c.app.wm.startMoveMode(c.id) });
  registerCommand({ id: 'window.minimizeOrRestore', title: (c) => (c.win.isMinimized ? t('Restore') : t('Minimize')), run: (c) => (c.win.isMinimized ? c.app.wm.restore(c.id) : c.app.wm.minimize(c.id)) });
  registerCommand({ id: 'window.renameSession', title: () => t('Rename…'), run: (c) => c.app.sidebar?.renameSession?.(c.s, c.s.name) });
  registerCommand({ id: 'window.terminateSession', title: () => t('Terminate session'), run: (c) => c.app.killSession(c.s.webuiId) });
  registerCommand({ id: 'window.close', title: () => t('Close'), run: (c) => c.app.wm.requestClose(c.id) });
  // Title-bar variant (2.212.0): the whole right-click used to BE the overlap
  // switcher — now it's a submenu whose scope is user-configurable.
  registerMenuItem({ menu: M, group: 'navigation', order: 10, id: 'window/switch-window', when: (c) => !!c.switchSubmenu, label: () => t('Switch window'), children: (c) => switchWindowItems(c.app, c.id) });
  registerMenuItem({ menu: M, group: 'navigation', order: 20, when: (c) => !!c.switchSubmenu, separator: true });
  registerMenuItem({ menu: M, group: '1_window', order: 10, command: 'window.move', kind: 'move', label: (c, title) => '✥ ' + title });
  registerMenuItem({ menu: M, group: '1_window', order: 20, command: 'window.minimizeOrRestore', kind: 'minimize', label: (c, title) => (c.win.isMinimized ? '□ ' : '– ') + title });
  // Session windows: rename + Task Group binding straight from the window
  // chrome (2.212.0, user request) — same semantics as the session card menu.
  registerMenuItem({ menu: M, group: '1_window', order: 30, command: 'window.renameSession', kind: 'rename', when: hasSess });
  const activeGroups = (c) => (c.app.sidebar?._tasks || []).filter((tg) => !tg.archived);
  registerMenuItem({
    menu: M, group: '1_window', order: 40, id: 'window/task-groups', kind: 'groups', when: hasSess, label: () => t('Task Groups'),
    children: (c) => { // an empty list drops the submenu (registry rule) — the legacy `if (groups.length)`
      const sb = c.app.sidebar;
      const explicitIds = new Set((sb._getSessionTasks?.(c.s) || []).map((tg) => tg.id));
      const folderIds = new Set((sb._getSessionTaskGroups?.(c.s) || []).map((tg) => tg.id));
      return activeGroups(c).map((tg) => ({
        label: (explicitIds.has(tg.id) ? '✓ ' : folderIds.has(tg.id) ? '◇ ' : ' ') + tg.title + (!explicitIds.has(tg.id) && folderIds.has(tg.id) ? t(' (folder)') : ''),
        disabled: !explicitIds.has(tg.id) && folderIds.has(tg.id),
        action: () => { explicitIds.has(tg.id) ? sb._taskUnbind(tg.id, c.s) : sb._taskBind(tg.id, c.s); },
      }));
    },
  });
  // SIDE BY SIDE (split UX chunk 2, docs/design-split-ux.zh.md R1 ②/R2): the
  // verb NAMES the side — "Beside {name} (on the right)" puts THIS window on the
  // left and the named tab on the right; no pointer position ever picks it. Offered
  // only inside a ≥2-tab group (a split is a layout OF a tab chain — merge first),
  // never on a phone (one pane shown, R6). A split chain offers its two verbs
  // instead. Every entry is announced ⇒ undoable for 5 s (bindSplit's toast).
  const chainOf = (c) => (c.win && c.win._tabChain && Array.isArray(c.win._tabChain.tabs) ? c.win._tabChain : null);
  const inTabsGroup = (c) => { const ch = chainOf(c); return !!(ch && ch.layout !== 'split' && ch.tabs.length >= 2 && ch.tabs.includes(c.id) && !c.app.isMobile); };
  const inSplit = (c) => { const ch = chainOf(c); return !!(ch && ch.layout === 'split' && ch.split); };
  const nameOfWin = (w) => String((w && w.title) || '').split(' \u2014 ')[0] || String(w && w.id);
  registerCommand({ id: 'window.unsplit', title: () => t('Unsplit'), run: (c) => c.app.wm.unbindSplit(chainOf(c)) });
  registerCommand({ id: 'window.swapSides', title: () => t('Swap left and right'), run: (c) => c.app.wm.swapSplit(chainOf(c)) });
  registerMenuItem({
    menu: M, group: '1_window', order: 50, id: 'window/side-by-side', kind: 'split', when: inTabsGroup, label: () => t('Show side by side'),
    children: (c) => chainOf(c).tabs.filter((tid) => tid !== c.id).map((tid) => c.app.wm.windows.get(tid)).filter(Boolean)
      .map((w) => ({ label: t('Beside {name} (on the right)', { name: nameOfWin(w) }), action: () => c.app.wm.bindSplit(c.win, w, { side: 'right', announce: true, focus: 'anchor' }) })), // the focus stays on the window right-clicked (split r1)
  });
  registerMenuItem({ menu: M, group: '1_window', order: 50, command: 'window.unsplit', kind: 'split', when: inSplit });
  registerMenuItem({ menu: M, group: '1_window', order: 55, command: 'window.swapSides', kind: 'split', when: (c) => inSplit(c) && !c.app.isMobile });
  // Common SESSION ops on the window chrome (owner UX 2.369.8: restart after a
  // style pick meant a sidebar hunt; the title menu is right here)
  registerMenuItem({ menu: M, group: '2_session', order: 0, when: hasSess, separator: true });
  registerMenuItem({ menu: M, group: '2_session', order: 10, id: 'window/restart-session', command: 'session.restart', kind: 'restart', when: live, label: () => '⟳ ' + t('Restart session') });
  registerMenuItem({ menu: M, group: '2_session', order: 20, command: 'window.terminateSession', kind: 'terminate', when: live, style: 'color:var(--red, #e55)' });
  registerMenuItem({ menu: M, group: '2_session', order: 10, id: 'window/resume-session', command: 'session.restart', kind: 'resume', when: (c) => hasSess(c) && c.s.status !== 'live' && !!c.s.sessionId, label: () => t('Resume session') });
  registerMenuItem({ menu: M, group: '2_session', order: 30, command: 'session.locate', kind: 'locate', when: hasSess });
  // AGENT BROWSER — the live view from the session's OWN window (lane I, 2026-09-25: the owner was told to open it "from
  // the menu" and looked here; only the sidebar card had it). Offered on a live local session whose conversation HAS a
  // browser — one running now (`browserInput`) or used since its start (`browserProfileActive`: null = never) — and it
  // opens the live view BOUND beside this window (open-or-focus: an existing view is bound / brought forward, never a
  // second viewer; browser-live-window.js openBrowserLiveBeside).
  const hasBrowser = (c) => live(c) && !!c.app._browserProfiles && !!c.s.webuiId && !!c.s.browserKey && !c.s.host && (c.s.browserProfileActive != null || !!c.s.browserInput);
  registerCommand({ id: 'window.browserLive', title: () => t('Agent browser — live view'), run: (c) => c.app.openBrowserLiveBeside(c.win, c.s.webuiId) });
  registerMenuItem({ menu: M, group: '2_session', order: 35, command: 'window.browserLive', kind: 'browser-live', when: hasBrowser });
  registerMenuItem({ menu: M, group: '2_session', order: 40, command: 'session.properties', kind: 'props', when: hasSess, label: () => t('Session properties…') });
  registerMenuItem({ menu: M, group: '2_session', order: 50, when: hasSess, separator: true });
  registerMenuItem({ menu: M, group: '3_close', order: 10, id: 'window/move-to-desktop', kind: 'desktop', label: () => '➤ ' + t('Move to Desktop'), children: (c) => c.app.desktopManager?.getDesktopMenuItems(c.id) || [] });
  registerMenuItem({ menu: M, group: '3_close', order: 20, command: 'window.close', kind: 'close', label: (c) => c.closeLabel, style: 'color:var(--red, #e55)' });
}
registerWindowMenu();
// end registerWindowMenu (scripts/test-contributions.mjs extracts the block above)

export function showWindowContextMenu(app, id, x, y, { closeLabel = null, onAction, switchSubmenu = false } = {}) {
  const win = app.wm.windows.get(id);
  if (!win) return;
  closeLabel = closeLabel || '✕ ' + t('Close');
  // Items come from the 'window' MENU REGISTRY (registerWindowMenu above; a
  // plugin adds rows through the same call). Every kinded action — and each
  // child of a kinded submenu — reports onAction(kind) after it runs.
  const sess = sessionForWin(app, win);
  const ctx = { app, id, win, s: sess, switchSubmenu, closeLabel };
  const wrapAct = (item, kind = item.kind) => {
    const out = { ...item };
    if (kind && typeof item.action === 'function') out.action = () => { item.action(); onAction?.(kind); };
    if (Array.isArray(item.children)) out.children = item.children.map((ch) => wrapAct(ch, kind));
    return out;
  };
  const menuItems = contribMenuItems('window', ctx).map((it) => wrapAct(it));
  const menu = showContextMenu(x, y, menuItems, 'taskbar-context-menu');
  if (y > window.innerHeight / 2) {
    menu.style.top = '';
    menu.style.bottom = (window.innerHeight - y + 4) + 'px';
  }
  return menu;
}

// Group-aware item state: a tab-group item is active/waiting if ANY of its tabs
// is, minimized if the host (which all tabs share) is. Stored tab ids let the
// in-place update path (no rebuild) stay correct without re-reading the chain.
function _applyTaskbarItemState(app, el) {
  const hostId = el.dataset.winId;
  const win = app.wm.windows.get(hostId);
  if (!win) return;
  const ids = el.dataset.groupTabs ? el.dataset.groupTabs.split(',') : [hostId];
  el.classList.toggle('active', ids.includes(app.wm.activeWindowId) && !win.isMinimized);
  el.classList.toggle('minimized', win.isMinimized);
  el.classList.toggle('waiting', ids.some(tid => app.wm.windows.get(tid)?.element.classList.contains('window-waiting')));
}

function _cloneTabIcon(win) {
  if (win.backendIconSlot?.children.length) {
    const clone = win.backendIconSlot.children[0].cloneNode(true);
    clone.style.width = ''; clone.style.height = '';
    return clone;
  }
  const span = document.createElement('span');
  span.innerHTML = win._typeIcon || '';
  return span;
}

// Stacked icon: the unique tab icons (active tab frontmost) offset like a card
// stack, plus a count badge. A single unique icon gets a faded ghost behind so
// it still reads as a stack.
function _buildStackIcon(app, group) {
  const stack = document.createElement('span');
  stack.className = 'taskbar-icon taskbar-icon-stack';
  const activeIdx = group.active;
  const order = [activeIdx, ...group.tabWins.map((_, i) => i).filter(i => i !== activeIdx)];
  const seen = new Set();
  const layers = [];
  for (const i of order) {
    const w = group.tabWins[i].win;
    const key = w.backendIconSlot?.children.length
      ? 'b:' + w.backendIconSlot.children[0].outerHTML
      : 't:' + (w._typeIcon || w.type || '');
    if (seen.has(key)) continue;
    seen.add(key);
    layers.push(w);
    if (layers.length >= 3) break;
  }
  if (layers.length === 1) layers.push(layers[0]); // ghost duplicate behind
  for (let j = layers.length - 1; j >= 0; j--) {
    const layer = document.createElement('span');
    layer.className = 'stack-layer' + (j > 0 ? ' stack-ghost' : '');
    layer.style.transform = `translate(${j * 3}px, ${j * 3}px)`;
    layer.style.zIndex = String(10 - j);
    layer.appendChild(_cloneTabIcon(layers[j]));
    stack.appendChild(layer);
  }
  const badge = document.createElement('span');
  badge.className = 'taskbar-stack-count';
  badge.textContent = String(group.tabWins.length);
  stack.appendChild(badge);
  return stack;
}

// THE activation a taskbar button performs (lane K): restore a minimized window
// (a tab restores its chain's host), else focus + raise it; the session inside
// takes the keyboard. A single window's click when it is not the focused one,
// and a GROUP's click when the group is behind (its active tab), both come here.
export function activateWindow(app, id) {
  const win = app.wm.windows.get(id);
  if (!win) return;
  const hostId = win._tabChain ? win._tabChain.tabs[0] : id;
  if (app.wm.windows.get(hostId)?.isMinimized) app.wm.restore(id);
  else app.wm.focusWindow(id);
  const session = app.sessions.get(id); if (session) session.focus();
}

// ── THE GROUPED BUTTON (lane K, 2026-09-25 — the owner: every click on a grouped
//    button popped the chooser, "这个体验比较差"). The rules are PURE
//    (src/lib/taskbar-group.js); this reads the world for them. CLICK = activate
//    the group, or the chooser when the group is already in front; HOVER with
//    intent on a fine pointer = the same chooser, non-modal; Enter/Space = the
//    click rule, ArrowUp = the chooser. Right-click = the window menu, as before.
function _groupInFront(app, hostId) {
  const host = app.wm.windows.get(hostId);
  const chain = host?._tabChain;
  if (!host || !chain) return false;
  const activeDesk = app.desktopManager?.activeDesktopId;
  return inFrontOf({
    focusedId: app.wm.activeWindowId, hostId, tabIds: chain.tabs, minimized: !!host.isMinimized,
    sameDesktop: !host._hiddenByDesktop && !host._hiddenByStage && (!activeDesk || !host._desktopId || host._desktopId === activeDesk),
  });
}
// A drag of any kind: a held primary button, a window / tab drag, a split divider, a window resize.
function _dragInProgress(app, buttons = 0) {
  if (buttons & 1) return true;
  if (document.querySelector('.window.dragging, .tab-ghost, .split-resizing')) return true;
  for (const w of app.wm.windows.values()) if (w._resizeOp) return true;
  return false;
}
// The chooser open for this group (either mode), or null.
function _chooserOf(hostId) {
  const pop = document.querySelector('.taskbar-group-chooser');
  return pop && pop._chooser && pop._chooser.hostId === hostId ? pop : null;
}
// Another popover or menu on screen — a HOVER chooser (this group's or a
// neighbour's) is not one: it yields to the next hover. The window list, every
// context menu and every createPopover carry [data-popover]; the quota/For-you
// popups are toggled by class instead. (Every class named here is one the tree
// PRODUCES — test-taskbar-group §7's census; `.taskbar-window-list` never was.)
function _otherPopoverOpen() {
  if (document.querySelector('.usage-popup:not(.hidden)')) return true;
  for (const el of document.querySelectorAll('[data-popover]')) {
    if (el._chooser && el._chooser.mode === 'hover') continue;
    if (el.getClientRects().length) return true;
  }
  return false;
}
const _finePointer = () => !!window.matchMedia?.('(any-pointer: fine)').matches;

// Render a stacked tab-group taskbar item: click activates the group (the chooser
// when it is already in front), hover shows the chooser, right click acts on the
// whole group (host).
function _buildGroupItem(app, container, item, hostWin, starPrefix, group) {
  item.classList.add('taskbar-group');
  item.dataset.groupTabs = group.tabWins.map(t => t.id).join(',');
  _applyTaskbarItemState(app, item);
  item.appendChild(_buildStackIcon(app, group));

  const activeTab = group.tabWins[group.active] || group.tabWins[0];
  const textCol = document.createElement('div'); textCol.className = 'taskbar-text';
  const title = document.createElement('div'); title.className = 'taskbar-title';
  const parts = activeTab.win.title.split(' \u2014 ');
  title.textContent = starPrefix + (parts[0] || activeTab.win.title);
  const subtitle = document.createElement('div'); subtitle.className = 'taskbar-subtitle';
  subtitle.textContent = t('{n} windows grouped', { n: group.tabWins.length });
  textCol.append(title, subtitle);
  item.appendChild(textCol);
  // no native tooltip: the hover chooser lists every title (a tooltip would sit
  // over it); the keyboard / screen reader get the button's name
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-haspopup', 'menu');
  item.setAttribute('aria-expanded', 'false');
  item.setAttribute('aria-label', `${activeTab.win.title} \u2014 ${subtitle.textContent}`);

  const hostId = group.chain.tabs[0];
  // a REBUILD under an open chooser (a tab title change re-keys the structure)
  // hands it this button: aria-expanded, the Esc focus return and the
  // outside-mousedown exclusion follow the live button, never a detached one
  _chooserOf(hostId)?._chooser.reanchor(item);
  const liveChain = () => app.wm.windows.get(hostId)?._tabChain || null; // never the build-time object (a layout sync may swap it)
  const activeTabOf = (chain) => chain.tabs[Math.min(chain.active, chain.tabs.length - 1)] || hostId;
  // hover intent: armed on entry by a fine pointer, cancelled by leaving,
  // pressing, dragging; re-judged when it fires (a drag or a menu may have begun)
  let timer = null, armed = false, enteredAt = 0, lastButtons = 0, fine = false;
  const cancelIntent = () => { armed = false; if (timer) { clearTimeout(timer); timer = null; } };
  const hoverNow = (intentMs) => hoverVerdict({ pointerFine: fine, touch: !!app.isTouch, dragging: _dragInProgress(app, lastButtons), popoverOpen: _otherPopoverOpen(), intentMs });
  const fire = () => {
    timer = null;
    if (!armed || !item.isConnected) return;
    const elapsed = performance.now() - enteredAt;
    const v = hoverNow(elapsed);
    if (v === 'wait') { timer = setTimeout(fire, Math.max(1, GROUP_HOVER_INTENT_MS - elapsed)); return; }
    armed = false;
    const chain = liveChain();
    if (v === 'open' && chain) showTabGroupList(app, item, chain, { hover: true });
  };
  item.addEventListener('pointerenter', (e) => {
    lastButtons = e.buttons;
    const open = _chooserOf(hostId);
    if (open) { open._chooser.keep(); return; } // back onto the button from its own chooser
    cancelIntent();
    fine = (e.pointerType === 'mouse' || e.pointerType === 'pen') && _finePointer(); // a mouse or a pen hovers; a touch pointerenter never arms
    if (hoverNow(0) !== 'wait') return;
    armed = true; enteredAt = performance.now();
    timer = setTimeout(fire, GROUP_HOVER_INTENT_MS);
  });
  item.addEventListener('pointermove', (e) => { lastButtons = e.buttons; });
  item.addEventListener('pointerleave', () => { cancelIntent(); _chooserOf(hostId)?._chooser.leave(); });
  item.addEventListener('pointerdown', cancelIntent); // a press is not a hover (and the hover does not come back until the pointer leaves)

  item.draggable = true;
  item.addEventListener('dragstart', (e) => {
    cancelIntent();
    const open = _chooserOf(hostId); if (open && open._chooser.mode === 'hover') open.remove();
    e.dataTransfer.setData('text/window-id', hostId);
    e.dataTransfer.effectAllowed = 'move';
  });
  const act = (verdict, { keyboard = false } = {}) => {
    const chain = liveChain();
    if (!chain) return;
    if (verdict === 'activate') { _chooserOf(hostId)?.remove(); activateWindow(app, activeTabOf(chain)); }
    else if (verdict === 'chooser') showTabGroupList(app, item, chain, { keyboard });
  };
  item.addEventListener('click', (e) => {
    cancelIntent();
    // `dragging` from THIS event only (a primary button still held): a leaked drag class must never eat a click
    act(groupClickVerdict({ inFront: _groupInFront(app, hostId), pointerType: e.pointerType || '', dragging: !!(e.buttons & 1), popoverOpen: !!_chooserOf(hostId) }));
  });
  item.addEventListener('keydown', (e) => {
    if (e.target !== item || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const v = groupKeyVerdict({ key: e.key, inFront: _groupInFront(app, hostId) });
    if (!v) return;
    e.preventDefault();
    cancelIntent();
    act(v, { keyboard: true });
  });
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancelIntent();
    _chooserOf(hostId)?.remove();
    showWindowContextMenu(app, hostId, e.clientX, e.clientY, { closeLabel: '\u2715 ' + t('Close group') });
  });
  container.appendChild(item);
}

// THE CHOOSER: the tabs of a group, anchored above its taskbar button; a row
// activates THAT tab (focus + raise + switch the chain's active tab).
// opts.hover = opened by hover intent — non-modal (no focus moves), closes
// GROUP_HOVER_LEAVE_MS after the pointer leaves the button + chooser; a click or
// a key on the button PINS it (then it closes on a row, Esc or a click elsewhere).
// opts.keyboard = the focus goes to the active row (Arrow keys / Home / End /
// Enter / Space / Esc inside). Esc closes it in every mode.
export function showTabGroupList(app, anchor, chain, { hover = false, keyboard = false } = {}) {
  const hostId = chain.tabs[0];
  const existing = _chooserOf(hostId);
  if (existing && existing._chooser.anchor === anchor) { // already open for this button: never re-created (no flicker)
    if (!hover) existing._chooser.pin({ keyboard });
    return existing;
  }
  const pop = createPopover(anchor, 'overlap-switcher taskbar-group-chooser');
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', t('Windows in this group'));
  const rows = [];
  const focusRow = () => requestAnimationFrame(() => { // after createPopover's reveal frame (a hidden subtree takes no focus)
    if (pop.isConnected) (rows.find((r) => r.classList.contains('active')) || rows[0])?.focus();
  });
  let leaveTimer = null;
  const state = pop._chooser = {
    hostId, anchor, mode: hover ? 'hover' : 'click',
    keep() { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } },
    leave() {
      if (state.mode !== 'hover') return;
      state.keep();
      leaveTimer = setTimeout(() => { leaveTimer = null; if (state.mode === 'hover') pop.remove(); }, GROUP_HOVER_LEAVE_MS);
    },
    pin({ keyboard: kb = false } = {}) { state.keep(); state.mode = 'click'; pop.dataset.mode = 'click'; if (kb) focusRow(); },
    reanchor(el) { state.anchor = el; el.setAttribute?.('aria-expanded', 'true'); pop._closeExclude?.push(el); },
    // after a row's window menu acted: re-list from the LIVE chain (a tab
    // closed, renamed, split), or close when the group is gone from here
    relist() {
      const live = app.wm.windows.get(hostId)?._tabChain, el = state.anchor;
      pop.remove();
      if (live && live.tabs[0] === hostId && live.tabs.length > 1 && el.isConnected) showTabGroupList(app, el, live);
    },
  };
  pop.dataset.mode = state.mode;
  // the rows follow the group's STRIP (visualTabOrder — split tabs v2: a split's left half, then its right; a
  // reordered strip its own order), never the chain's internal array; the active row is marked by window id
  const activeId = chain.tabs[Math.min(chain.active, chain.tabs.length - 1)];
  for (const tid of visualTabOrder(chain)) {
    const win = app.wm.windows.get(tid);
    if (!win) continue;
    const item = document.createElement('div');
    item.className = 'overlap-switcher-item';
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    item.dataset.winId = tid;
    if (tid === activeId) { item.classList.add('active'); item.setAttribute('aria-current', 'true'); }
    // carry the waiting blink into the list — the stacked icon only says "one
    // of these is waiting"; the row says WHICH
    if (win.element.classList.contains('window-waiting')) item.classList.add('waiting');
    const icon = document.createElement('span');
    icon.style.cssText = 'flex-shrink:0;display:inline-flex;align-items:center';
    icon.appendChild(_cloneTabIcon(win));
    const label = document.createElement('span');
    label.textContent = win.title;
    item.append(icon, label);
    item.onclick = () => {
      if (app.wm.windows.get(chain.tabs[0])?.isMinimized) app.wm.restore(chain.tabs[0]);
      app.wm.focusWindow(chain.tabs[0]);
      const idx = chain.tabs.indexOf(tid);
      if (idx >= 0) app.wm.switchTab(chain, idx);
      const session = app.sessions.get(tid);
      if (session) session.focus();
      pop.remove();
    };
    // right-click = THAT tab's window menu, as a window-list row does; the
    // chooser stays beneath it PINNED (the pointer leaves it for the menu) and
    // re-lists after the action — a Move takes the whole screen: it closes
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.pin();
      showWindowContextMenu(app, tid, e.clientX, e.clientY, {
        onAction: (kind) => { if (pop.isConnected) (kind === 'move' ? pop.remove() : state.relist()); },
      });
    });
    rows.push(item);
    pop.appendChild(item);
  }
  pop.addEventListener('pointerenter', () => state.keep());
  pop.addEventListener('pointerleave', () => state.leave());
  pop.addEventListener('keydown', (e) => {
    const i = rows.indexOf(document.activeElement);
    const go = (j) => { e.preventDefault(); rows[(j + rows.length) % rows.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? rows.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(rows.length - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); rows[i].click(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pop.remove(); state.anchor.focus?.(); } // the LIVE button (a rebuild re-anchors)
  });
  // Esc closes it wherever the keyboard is — also inside a terminal, where the
  // global Esc handler stands aside; never swallowed (the terminal still gets it)
  const ctl = new AbortController();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing && !pop.contains(e.target)) pop.remove(); }, { capture: true, signal: ctl.signal });
  // ONE cleanup whichever path removed it (a row, Esc, a click elsewhere, the
  // leave timer, createPopover's dedup, an activation): EVERY listener the
  // chooser caused goes with it — its own Esc listener and createPopover's
  // outside-click close (`_closeCtl`: a hover chooser opens and closes with no
  // click at all, so nothing else would ever remove that one — lane K verify r1
  // measured 3 → 33 document mousedown listeners over 30 hovers, each holding
  // its detached chooser)
  anchor.setAttribute?.('aria-expanded', 'true');
  const mo = new MutationObserver(() => {
    if (pop.isConnected) return;
    mo.disconnect(); ctl.abort(); pop._closeCtl?.abort(); state.keep();
    // the LIVE button (a rebuild re-anchors); a re-list already opened the next
    // chooser on the same button: it stays expanded
    if (_chooserOf(hostId)?._chooser.anchor !== state.anchor) state.anchor.setAttribute?.('aria-expanded', 'false');
  });
  mo.observe(pop.parentNode, { childList: true });
  requestAnimationFrame(() => {
    if (!pop.isConnected) return;
    // viewport px in, layout px out (a fixed body child under the UI-scale zoom)
    const Z = uiScale();
    const rect = state.anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    pop.style.left = (Math.max(4, Math.min(rect.left, window.innerWidth - pr.width - 4)) / Z) + 'px';
    // Prefer above (bottom taskbar); flip below when the anchor is near the
    // top edge (top-docked taskbar)
    const above = rect.top - pr.height - 4;
    pop.style.top = ((above >= 4 ? above : rect.bottom + 4) / Z) + 'px';
    if (keyboard) focusRow();
  });
  return pop;
}

/**
 * Show a popover listing all open windows (triggered by "x active" click).
 */
export function showWindowList(app, anchor) {
  if (!app.wm.windows.size) return;
  const pop = createPopover(anchor, 'overlap-switcher');

  const place = () => requestAnimationFrame(() => {
    if (!pop.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    pop.style.left = Math.max(4, Math.min(rect.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 4)) + 'px';
    // Prefer opening above the anchor (bottom taskbar); flip below when
    // there's no room -- e.g. the chip was moved into the top toolbar
    const above = rect.top - pop.offsetHeight - 4;
    pop.style.top = (above >= 4 ? above : rect.bottom + 4) + 'px';
  });

  const render = () => {
    pop.innerHTML = '';
    const activeDesk = app.desktopManager?.activeDesktopId;
    let count = 0;
    for (const [id, win] of app.wm.windows) {
      // Skip grouped guests -- only the host appears in the list
      if (win._tabChain && win._tabChain.tabs[0] !== id) continue;
      if (activeDesk && win._desktopId && win._desktopId !== activeDesk) continue;
      count++;
      const item = document.createElement('div');
      item.className = 'overlap-switcher-item';
      if (id === app.wm.activeWindowId && !win.isMinimized) item.classList.add('active');
      // waiting blink — for a tab-group host, aggregate over ALL its tabs
      // (guests are skipped from this list, so the host row speaks for them)
      const tabIds = win._tabChain ? win._tabChain.tabs : [id];
      if (tabIds.some(tid => app.wm.windows.get(tid)?.element.classList.contains('window-waiting'))) item.classList.add('waiting');

      const icon = document.createElement('span');
      icon.innerHTML = win._typeIcon || '';
      icon.style.cssText = 'font-size:11px;flex-shrink:0;display:inline-flex;align-items:center';
      if (win.isMinimized) icon.style.opacity = '0.4';
      const label = document.createElement('span');
      label.textContent = (win.isMinimized ? '\u229E ' : '') + win.title;
      item.append(icon, label);
      item.onclick = () => {
        if (win.isMinimized) app.wm.restore(id);
        else app.wm.focusWindow(id);
        const session = app.sessions.get(id);
        if (session) session.focus();
        pop.remove();
      };
      // Right-click: same per-window menu as the taskbar item. The list stays
      // open under the menu (attachPopoverClose ignores clicks inside other
      // popovers) and refreshes in place after the action -- except Move,
      // which takes over the whole screen, so the list gets out of the way.
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showWindowContextMenu(app, id, e.clientX, e.clientY, {
          onAction: (kind) => {
            if (!pop.isConnected) return;
            if (kind === 'move') pop.remove();
            else render();
          },
        });
      });
      pop.appendChild(item);
    }
    if (!count) { pop.remove(); return; }
    place();
  };
  render();
}
