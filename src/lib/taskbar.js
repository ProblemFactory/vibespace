import { startFileDownload } from './file-download.js';
import { createPopover, showContextMenu, showToast, uiScale } from './utils.js';
import { stripHidden, wheelScroll } from './taskbar-fit.js'; // PURE (lane desktop-small P2-2): the tiles the strip cuts, the wheel's sideways scroll
import { menuPlace } from './menu-place.js'; // PURE: THE ONE placement — the «+N» list beside its chip (lane desktop-small r2 ②)
import { groupClickVerdict, hoverVerdict, hoverStep, groupKeyVerdict, inFrontOf, GROUP_HOVER_INTENT_MS, GROUP_HOVER_LEAVE_MS } from './taskbar-group.js';
import { t } from './i18n.js';
import { terminalOnly } from './agent-meta.js'; // the harness table's own word for a plain shell (§78: no id branch here)
import { visualTabOrder } from './chain-layout.js'; // the chooser lists a group in its STRIP order (split tabs v2: left half, then right)
import { registerCommand, registerMenuItem, menuItems as contribMenuItems } from './contributions.js';
import { otherDesktopWindows } from '../desktop-switch.js'; // lane desktop-switch-phone: the ⧉ list's «Other desktops» group (PURE)

/** The ⧉ list's «Other desktops» group: folded (the active desktop's windows stay the list's view) until opened; this page's. */
let otherDesksOpen = false;

/** Every other desktop's windows — the ones this page built there and the ones a held record lists that it has not built. */
function otherDeskRows(app) {
  const dm = app.desktopManager, wm = app.wm;
  if (!dm || (dm.desktops || []).length < 2) return [];
  const zOf = (w) => parseInt(w.element?.style?.zIndex, 10) || 0;
  const built = [...wm.windows.values()].filter((w) => w._desktopId && !w._isStagePlaceholder && !(w._tabChain && w._tabChain.tabs[0] !== w.id))
    .map((w) => ({ id: w.id, title: w.title, desk: w._desktopId, z: zOf(w) }));
  const held = [];
  for (const d of dm.desktops) for (const ws of dm._savedStates?.get(d.id)?.windows || []) {
    const id = ws && (ws.winId || ws.id);
    if (id && !wm.windows.has(id)) held.push({ id, title: ws.title, desk: d.id, z: Number(ws.zIndex) || 0 });
  }
  return otherDesktopWindows({ desktops: dm.desktops, activeId: dm.activeDesktopId, built, held });
}

/** A row of another desktop: switch there AND raise it. A built window = THE door (wm.revealWindow switches its desktop
 *  first, test-architecture §62); one its desktop's record holds that this page has not built = the switch, then the door
 *  once the switch's replay has built it. */
function goOtherDesk(app, r) {
  if (r.built) { app.wm.revealWindow(r.id); return; }
  const dm = app.desktopManager;
  const go = app.stage?.isActive ? app.stage.leave(r.deskId) : dm.switchTo(r.deskId);
  let tries = 0;
  const look = () => {
    if (dm.activeDesktopId !== r.deskId) return;
    if (app.wm.windows.has(r.id)) { app.wm.revealWindow(r.id); return; }
    if (++tries < 20) setTimeout(look, 250);
  };
  Promise.resolve(go).then(look, look);
}

// Resolve the sidebar SESSION object behind a session window (chat/terminal)
// — identity kept fresh in _openSpec by syncSessionIdentity. Non-session
// windows (files/editor/browser) return null: Rename/Task-Groups are
// session-level concepts.
export function sessionForWin(app, win) { // exported: the trailing bar's live-view button asks the same row (lane duo-build-1)
  if (!win || (win.type !== 'chat' && win.type !== 'terminal')) return null;
  const spec = win._openSpec || {};
  const all = app.sidebar?._allSessions || [];
  return all.find((s) =>
    (spec.backendSessionId && s.sessionId === spec.backendSessionId)
    || (spec.serverId && s.webuiId === spec.serverId)) || null;
}

/** P2-2 (lane phone-refusal-wrap — the duo walk: ✕ closed a working conversation's window without a word, the list still
 *  said working; a newcomer could not tell «closed the window» from «ended the conversation»). PURE: what a user's close
 *  of a session window says — the session still RUNNING (live on the hub, or in tmux) ⇒ it keeps running (a plain shell:
 *  the terminal does); ended, or not a session window ⇒ null (nothing to say). The window close stays ONE tap, no ask. */
export function closeKeepsWord(s) {
  if (!s || (s.status !== 'live' && s.status !== 'tmux')) return null;
  return terminalOnly(s.backend) ? 'Closed the window — the terminal keeps running' : 'Closed the window — the conversation keeps running';
}
// ONE toast per close burst: a group's Close (each member through requestClose) re-words the toast already up
let _closedSaid = null;
export function sayClosedKeepsRunning(word) {
  const now = Date.now();
  if (_closedSaid && _closedSaid.el.isConnected && now - _closedSaid.at < 1500) {
    _closedSaid.n++; _closedSaid.at = now;
    const b = _closedSaid.el.querySelector('.global-toast-body');
    if (b) b.textContent = t('Closed {n} windows — what ran in them keeps running', { n: _closedSaid.n });
    return _closedSaid.el;
  }
  _closedSaid = { el: showToast(t(word)), n: 1, at: now };
  return _closedSaid.el;
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
    for (const id of _hoverSpent) if (!entries.some((e) => e.id === id && e.group)) _hoverSpent.delete(id); // a group gone from the taskbar ends its visit
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
  fitTaskbarStrip(app);
}

// ── THE STRIP AT A SMALL SCREEN (lane desktop-small — P2-2 of the small-viewport walk: past ~8 windows the tiles ran on
//    under the tray, no scrollbar, no «+N», the wheel inert). The tiles keep a readable floor (style.css .taskbar-item
//    min-width = PURE TILE_MIN_PX); the tiles the strip cuts are counted on ONE «+N» chip right after it, which lists them;
//    a vertical wheel over the strip scrolls it sideways. Re-fitted at every taskbar update, scroll and strip resize. ──
let _fitRaf = 0;
function _stripTiles(strip) {
  const sr = strip.getBoundingClientRect();
  return { sr, tiles: [...strip.children].filter((el) => el.classList.contains('taskbar-item')).map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.winId, left: r.left - sr.left, width: r.width, el }; }) };
}
export function fitTaskbarStrip(app) {
  const strip = document.getElementById('taskbar-items');
  if (!strip) return;
  let chip = document.getElementById('taskbar-overflow');
  if (!chip) {
    chip = document.createElement('button');
    chip.id = 'taskbar-overflow'; chip.type = 'button'; chip.className = 'taskbar-overflow'; chip.hidden = true;
    chip.addEventListener('click', (e) => { e.stopPropagation(); showHiddenTiles(app, chip); });
    strip.after(chip);
  }
  if (!strip._fitWired) {
    strip._fitWired = true;
    // a vertical wheel scrolls the strip sideways (PURE wheelScroll) — it has no height to scroll
    strip.addEventListener('wheel', (e) => {
      const v = wheelScroll({ scrollLeft: strip.scrollLeft, max: strip.scrollWidth - strip.clientWidth, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, width: strip.clientWidth });
      if (v.used) { strip.scrollLeft = v.left; e.preventDefault(); }
    }, { passive: false });
    const again = () => { if (_fitRaf) return; _fitRaf = requestAnimationFrame(() => { _fitRaf = 0; fitTaskbarStrip(app); }); };
    strip.addEventListener('scroll', again, { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(again).observe(strip);
  }
  const { sr, tiles } = _stripTiles(strip);
  const { hidden } = stripHidden({ tiles, width: sr.width });
  chip.hidden = hidden.length === 0;
  chip.textContent = '+' + hidden.length;
  chip.title = t('{n} more windows — click for the list', { n: hidden.length });
  chip.setAttribute('aria-label', chip.title);
}

/** The «+N» chip's list: the windows whose tiles the strip cuts — a row raises its window (the tile's own activation) and
 *  scrolls its tile into the strip. */
function showHiddenTiles(app, chip) {
  const strip = document.getElementById('taskbar-items');
  if (!strip) return;
  const { sr, tiles } = _stripTiles(strip);
  const ids = new Set(stripHidden({ tiles, width: sr.width }).hidden);
  const pop = createPopover(chip, 'overlap-switcher taskbar-overflow-list');
  if (pop._closedByAnchor) return; // the chip pressed while its list was open: closed
  for (const tl of tiles) {
    if (!ids.has(tl.id)) continue;
    const win = app.wm.windows.get(tl.id);
    if (!win) continue;
    const item = document.createElement('div');
    item.className = 'overlap-switcher-item' + (tl.id === app.wm.activeWindowId && !win.isMinimized ? ' active' : '');
    item.dataset.winId = tl.id;
    const icon = document.createElement('span');
    icon.innerHTML = win._typeIcon || '';
    icon.style.cssText = 'font-size:11px;flex-shrink:0;display:inline-flex;align-items:center';
    const label = document.createElement('span');
    label.textContent = (win.isMinimized ? '\u229E ' : '') + win.title;
    item.append(icon, label);
    item.onclick = () => {
      pop.remove();
      activateWindow(app, tl.id);
      // then its tile into the strip — looked up afresh (the activation may have re-drawn the strip), the nearest edge
      requestAnimationFrame(() => {
        const el = [...strip.children].find((c) => c.dataset && c.dataset.winId === tl.id);
        if (!el) return;
        const r = el.getBoundingClientRect(), sr = strip.getBoundingClientRect();
        if (r.left < sr.left) strip.scrollLeft -= sr.left - r.left + 4;
        else if (r.right > sr.right) strip.scrollLeft += r.right - sr.right + 4;
      });
    };
    pop.appendChild(item);
  }
  // THE ONE placement (PURE menuPlace — r2 ②: this list was self-placed with no cap, so 26 windows at 951×585 left its tail
  // unreachable): in the room on the chip's open side — above it on a bottom taskbar, below on a top one, never over it —
  // a list taller than that room capped there and scrolling (createPopover's own clamp follows)
  requestAnimationFrame(() => {
    if (!pop.isConnected) return;
    const Z = uiScale(), r = chip.getBoundingClientRect(), pr = pop.getBoundingClientRect(), up = r.top > window.innerHeight / 2;
    const room = up ? r.top - 2 : window.innerHeight - r.bottom - 2;
    const at = menuPlace({ x: r.right - pr.width, y: up ? room : 0, w: pr.width, h: pr.height, vw: window.innerWidth, vh: room, up });
    if (at.maxH != null) { pop.style.maxHeight = (at.maxH / Z) + 'px'; pop.style.overflowY = 'auto'; }
    pop.style.left = (at.left / Z) + 'px';
    pop.style.top = ((up ? at.top : r.bottom + 2 + at.top) / Z) + 'px';
  });
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
    if (win.element.classList.contains('window-arrived')) item.classList.add('arrived'); // an agent placed it (window.js markArrived)
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
    item.addEventListener('dragend', () => app.desktopManager?.dragDone?.()); // its drag over — a sprung desktop list closes (lane desktop-small r3 ①)
    item.addEventListener('click', () => {
      // the focused window's tile minimizes it — unless its title bar is out of reach: then the click brings it back (lane desktop-small P2-1)
      if (!win.isMinimized && id === app.wm.activeWindowId && app.wm.isReachable?.(id) !== false) { app.wm.witnessGeometry?.(id); app.wm.minimize(id); } // the user's act: witnessed (verify r4 ③)
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
//    window, else null), switchSubmenu, closeLabel, group (the menu is a WHOLE
//    tab group's — its Close ends every tab, asked first: B-a67c) }. Items carry `kind`; the
//    renderer fires onAction(kind) after each action (children inherit their
//    parent's kind — Task Groups / Move to Desktop — never the Switch-window
//    submenu, which had none).
//    Keep this block self-contained (the gate suite extracts + replays it):
//    it closes over registerCommand, registerMenuItem, t, switchWindowItems only. ──
export function registerWindowMenu() {
  const M = 'window';
  const hasSess = (c) => !!c.s;
  const live = (c) => hasSess(c) && c.s.status === 'live';
  // the regular class (lane duo-build-1, SPEC-v3 §2.4): a column is a level of the list, not a window — no window-manager
  // verbs (move, minimize, side by side, find, desktops) and no Close (leave = pick another row; end = terminate / archive)
  const wmVerbs = (c) => c.app._vc !== 'regular';
  registerCommand({ id: 'window.move', title: () => t('Move'), run: (c) => c.app.wm.startMoveMode(c.id) });
  registerCommand({ id: 'window.minimizeOrRestore', title: (c) => (c.win.isMinimized ? t('Restore') : t('Minimize')), run: (c) => { c.app.wm.witnessGeometry?.(c.id); c.win.isMinimized ? c.app.wm.restore(c.id) : c.app.wm.minimize(c.id); } }); // the user's act: witnessed (verify r4 ③)
  registerCommand({ id: 'window.renameSession', title: () => t('Rename…'), run: (c) => c.app.sidebar?.renameSession?.(c.s, c.s.name) });
  registerCommand({ id: 'window.terminateSession', title: () => t('Terminate session'), run: (c) => c.app.killSession(c.s.webuiId) });
  registerCommand({ id: 'window.close', title: () => t('Close'), run: (c) => (c.group ? c.app.wm.requestCloseGroup(c.id) : c.app.wm.requestClose(c.id)) }); // ctx.group = a WHOLE group's menu (the frame's, the taskbar group's): asked first (B-a67c)
  // P2-2: Close and Terminate never read alike — a running session's window Close says it keeps running and is not red
  const closeStyle = (c) => (c.closeKeeps ? '' : 'color:var(--red, #e55)');
  // Title-bar variant (2.212.0): the whole right-click used to BE the overlap
  // switcher — now it's a submenu whose scope is user-configurable.
  registerMenuItem({ menu: M, group: 'navigation', order: 10, id: 'window/switch-window', when: (c) => !!c.switchSubmenu, label: () => t('Switch window'), children: (c) => switchWindowItems(c.app, c.id) });
  registerMenuItem({ menu: M, group: 'navigation', order: 20, when: (c) => !!c.switchSubmenu, separator: true });
  registerMenuItem({ menu: M, group: '1_window', order: 10, command: 'window.move', kind: 'move', when: wmVerbs, label: (c, title) => '✥ ' + title });
  registerMenuItem({ menu: M, group: '1_window', order: 20, command: 'window.minimizeOrRestore', kind: 'minimize', when: wmVerbs, label: (c, title) => (c.win.isMinimized ? '□ ' : '– ') + title });
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
    menu: M, group: '1_window', order: 50, id: 'window/side-by-side', kind: 'split', when: (c) => inTabsGroup(c) && wmVerbs(c), label: () => t('Show side by side'),
    children: (c) => chainOf(c).tabs.filter((tid) => tid !== c.id).map((tid) => c.app.wm.windows.get(tid)).filter(Boolean)
      .map((w) => ({ label: t('Beside {name} (on the right)', { name: nameOfWin(w) }), action: () => c.app.wm.bindSplit(c.win, w, { side: 'right', announce: true, focus: 'anchor' }) })), // the focus stays on the window right-clicked (split r1)
  });
  registerMenuItem({ menu: M, group: '1_window', order: 50, command: 'window.unsplit', kind: 'split', when: (c) => inSplit(c) && wmVerbs(c) });
  registerMenuItem({ menu: M, group: '1_window', order: 55, command: 'window.swapSides', kind: 'split', when: (c) => inSplit(c) && !c.app.isMobile });
  // a window that shows ONE file (every viewer kind, the hex viewer, the code editor) downloads it — the same helper as its button (lane viewer-download)
  registerCommand({ id: 'window.download', title: () => t('Download'), run: (c) => startFileDownload(c.win._fileDownload) });
  registerMenuItem({ menu: M, group: '1_window', order: 60, command: 'window.download', kind: 'download', when: (c) => !!(c.win && c.win._fileDownload) });
  // Common SESSION ops on the window chrome (owner UX 2.369.8: restart after a
  // style pick meant a sidebar hunt; the title menu is right here)
  registerMenuItem({ menu: M, group: '2_session', order: 0, when: hasSess, separator: true });
  registerMenuItem({ menu: M, group: '2_session', order: 10, id: 'window/restart-session', command: 'session.restart', kind: 'restart', when: live, label: () => '⟳ ' + t('Restart session') });
  registerMenuItem({ menu: M, group: '2_session', order: 20, command: 'window.terminateSession', kind: 'terminate', when: live, style: 'color:var(--red, #e55)' });
  registerMenuItem({ menu: M, group: '2_session', order: 10, id: 'window/resume-session', command: 'session.restart', kind: 'resume', when: (c) => hasSess(c) && c.s.status !== 'live' && !!c.s.sessionId, label: () => t('Resume session') });
  registerMenuItem({ menu: M, group: '2_session', order: 30, command: 'session.locate', kind: 'locate', when: (c) => hasSess(c) && wmVerbs(c) });
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
  registerMenuItem({ menu: M, group: '3_close', order: 10, id: 'window/move-to-desktop', kind: 'desktop', when: wmVerbs, label: () => '➤ ' + t('Move to Desktop'), children: (c) => c.app.desktopManager?.getDesktopMenuItems(c.id) || [] });
  registerMenuItem({ menu: M, group: '3_close', order: 20, command: 'window.close', kind: 'close', when: wmVerbs, label: (c) => c.closeLabel, style: closeStyle });
}
registerWindowMenu();
// end registerWindowMenu (scripts/test-contributions.mjs extracts the block above)

export function showWindowContextMenu(app, id, x, y, { closeLabel = null, onAction, switchSubmenu = false, group = false } = {}) {
  const win = app.wm.windows.get(id);
  if (!win) return;
  // Items come from the 'window' MENU REGISTRY (registerWindowMenu above; a
  // plugin adds rows through the same call). Every kinded action — and each
  // child of a kinded submenu — reports onAction(kind) after it runs.
  const sess = sessionForWin(app, win);
  const closeKeeps = !closeLabel && !group && !!closeKeepsWord(sess);   // P2-2: a running session's window — its Close is not its Terminate
  closeLabel = closeLabel || '✕ ' + (closeKeeps ? t('Close window — it keeps running') : t('Close'));
  const ctx = { app, id, win, s: sess, switchSubmenu, closeLabel, group: !!group };
  ctx.closeKeeps = closeKeeps;   // closeStyle reads it (the line above is test-tab-close-confirm's pin)
  const wrapAct = (item, kind = item.kind) => {
    const out = { ...item };
    if (kind && typeof item.action === 'function') out.action = () => { item.action(); onAction?.(kind); };
    if (Array.isArray(item.children)) out.children = item.children.map((ch) => wrapAct(ch, kind));
    return out;
  };
  const menuItems = contribMenuItems('window', ctx).map((it) => wrapAct(it));
  // opened in the lower half (a title bar near the taskbar, a tile): upward when there is room — PURE menuPlace keeps it
  // inside the viewport either way (lane desktop-small P2-3: a bottom-anchored menu used to run off the top, Move first)
  return showContextMenu(x, y, menuItems, 'taskbar-context-menu', { up: y > window.innerHeight / 2 });
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
  el.classList.toggle('arrived', ids.some(tid => app.wm.windows.get(tid)?.element.classList.contains('window-arrived')));
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
  app.wm.revealWindow(id); // THE door for a named window (inc-muiq348r-jwb5): its own tab, the group restored, raised
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
// THE HOVER VISIT per GROUP (host id), never per button element: a rebuild replaces the element under a resting pointer
// (no pointerleave reaches the detached one), and the rebuilt button must know the visit is already spent (hoverStep)
const _hoverSpent = new Set();
// …and a pointer MOVING anywhere but that group's button ends its visit ('away') even when no pointerleave reached the
// live element (it left while the button was being rebuilt). A RESTING pointer sends no pointermove, so a rebuild under
// it keeps the visit. ONE capture listener for the app's life, idle while no visit is spent.
let _visitWatch = false;
function _watchHoverVisits() {
  if (_visitWatch) return;
  _visitWatch = true;
  document.addEventListener('pointermove', (e) => {
    if (!_hoverSpent.size) return;
    const on = e.target?.closest?.('.taskbar-group')?.dataset.winId;
    for (const id of [..._hoverSpent]) if (id !== on && !hoverStep({ spent: true }, 'away').spent) _hoverSpent.delete(id);
  }, { capture: true, passive: true });
}

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
  // hover intent: armed by MOVEMENT over the button (a bare pointerenter is also Chrome re-targeting a RESTING pointer —
  // this button rebuilt under it, its hover recompute after a layout change), once per visit; cancelled by leaving,
  // pressing, dragging; re-judged when it fires (a drag or a menu may have begun). The visit is the GROUP's (hoverStep)
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
  _watchHoverVisits();
  const step = (ev) => {
    const r = hoverStep({ spent: _hoverSpent.has(hostId) }, ev);
    if (r.spent) _hoverSpent.add(hostId); else _hoverSpent.delete(hostId);
    if (r.act === 'cancel') cancelIntent();
    return r.act;
  };
  const armFrom = (e) => {
    cancelIntent();
    fine = (e.pointerType === 'mouse' || e.pointerType === 'pen') && _finePointer(); // a mouse or a pen hovers; a touch never arms
    if (hoverNow(0) !== 'wait') return;
    armed = true; enteredAt = performance.now();
    timer = setTimeout(fire, GROUP_HOVER_INTENT_MS);
  };
  // enter AND move ask hoverStep (the ONE rule): an enter never arms — the visit's first MOVEMENT does, once
  item.addEventListener('pointerenter', (e) => {
    lastButtons = e.buttons;
    _chooserOf(hostId)?._chooser.keep(); // back onto the button from its own chooser
    if (step('enter') === 'arm' && !_chooserOf(hostId)) armFrom(e);
  });
  item.addEventListener('pointermove', (e) => {
    lastButtons = e.buttons;
    if (step('move') === 'arm' && !_chooserOf(hostId)) armFrom(e); // a chooser already open spends the visit without arming
  });
  item.addEventListener('pointerleave', () => { step('leave'); _chooserOf(hostId)?._chooser.leave(); });
  item.addEventListener('pointerdown', () => step('press')); // a press is not a hover — and the visit stays spent until the pointer leaves, through a rebuild

  item.draggable = true;
  item.addEventListener('dragstart', (e) => {
    step('press');
    const open = _chooserOf(hostId); if (open && open._chooser.mode === 'hover') open.remove();
    e.dataTransfer.setData('text/window-id', hostId);
    e.dataTransfer.effectAllowed = 'move';
  });
  item.addEventListener('dragend', () => app.desktopManager?.dragDone?.()); // its drag over — a sprung desktop list closes (lane desktop-small r3 ①)
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
    step('press');
    _chooserOf(hostId)?.remove();
    showWindowContextMenu(app, hostId, e.clientX, e.clientY, { closeLabel: '\u2715 ' + t('Close group'), group: true }); // its Close ends every tab, asked first (B-a67c)
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
      app.wm.revealWindow(tid); // the row names THIS tab — the host's own row included (the door that used to be spelled here by hand)
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
  if (!app.wm.windows.size && !otherDeskRows(app).length) return;
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
        app.wm.revealWindow(id); // the row is labelled with the HOST's title — show the host's tab, never the guest under its name
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
    // lane desktop-switch-phone: the OTHER desktops' windows, folded under the active desktop's (its filter above stays the
    // default view) — a window on another desktop is one press away: the switch, then the raise
    const others = otherDeskRows(app);
    if (others.length) {
      const head = document.createElement('div');
      head.className = 'overlap-switcher-item overlap-switcher-group' + (otherDesksOpen ? ' open' : '');
      head.setAttribute('role', 'button'); head.setAttribute('aria-expanded', otherDesksOpen ? 'true' : 'false');
      head.innerHTML = `<span class="osg-chev">${otherDesksOpen ? '\u25BE' : '\u25B8'}</span>`;
      head.append(document.createTextNode(t('Other desktops ({n})', { n: others.length })));
      head.onclick = (e) => { e.stopPropagation(); otherDesksOpen = !otherDesksOpen; render(); };
      pop.appendChild(head);
      if (otherDesksOpen) for (const r of others) {
        const item = document.createElement('div');
        item.className = 'overlap-switcher-item overlap-switcher-other';
        item.dataset.winId = r.id; item.dataset.desktopId = r.deskId;
        const label = document.createElement('span');
        label.textContent = r.title + ' \u00B7 ' + r.deskName;
        item.append(label);
        item.onclick = () => { pop.remove(); goOtherDesk(app, r); };
        pop.appendChild(item);
      }
    }
    if (!count && !others.length) { pop.remove(); return; }
    place();
  };
  render();
}
