import { chipMode, titleMinText, billingPillForms, billingPillHtml } from './title-chips.js'; // lane phone-chip: the row's billing pill folds, never cuts
import { t } from './i18n.js';
import { escHtml, onOutsidePress, showContextMenu, uiScale } from './utils.js';
import { showWindowContextMenu } from './taskbar.js';
import { UI_ICONS, FILE_ICONS } from './icons.js';
import { getCommand, runCommand } from './contributions.js';
import { openDesktopPicker } from './desktop-picker.js';
import { installNavFilesDoor } from './phone-files.js'; // lane phone-files-door: the nav's 文件 — one tap to the files
import { installTrailingBar } from './trailing-bar.js'; // lane duo-build-1: the regular class's trailing bar (this nav, standing)

const SHOWN_KEY = 'vibespace.phoneShown'; // { [desktopId]: winId } — this tab's window on show per desktop (§6b guard 10)
function readShown() {
  try { const v = JSON.parse(sessionStorage.getItem(SHOWN_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

/** lane phone-chip (B-e5ff): a switcher row's billing pill takes the widest form that leaves the window's title
 *  readable — lane G's `chipMode` over MEASURED widths (the title and the pill share the row, as on a desktop title
 *  bar); a row not laid out keeps its full form. */
function fitRowPill(label, chip) {
  if (!label.isConnected || !chip.isConnected || !label.offsetWidth) return;
  const w = {};
  for (const m of ['full', 'compact', 'icon']) { chip.dataset.mode = m; w[m] = chip.getBoundingClientRect().width; }
  if (!chip.querySelector('.pill-compact')) w.compact = w.full;
  chip.dataset.mode = 'full';
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
  label.appendChild(probe);
  probe.textContent = label.firstChild && label.firstChild.nodeType === 3 ? label.firstChild.nodeValue : label.textContent;
  const titlePx = probe.getBoundingClientRect().width;
  probe.textContent = titleMinText(probe.textContent);
  const titleMinPx = probe.getBoundingClientRect().width;
  probe.remove();
  chip.dataset.mode = chipMode({ availablePx: label.offsetWidth + w.full, titlePx, titleMinPx, chipFullPx: w.full, chipCompactPx: w.compact });
}

/**
 * MobileNav — mobile navigation bar controller.
 *
 * Manages: hamburger menu, window switcher (tap title), close button,
 * new session button, title updates, edge-swipe gestures.
 *
 * Constructed by App when isMobile is true. Receives app reference
 * for sidebar/window/session access.
 */

/** Is `w` minimized? A tab group is minimized as ONE frame — the HOST carries the flag, its guests are hidden with it. */
const minimizedOf = (wm, w) => !!((w._tabChain && wm.windows.get(w._tabChain.tabs[0])) || w).isMinimized;

/** A desktop's windows (the Desktops menu's count): the ones this page built there + the ones its held record lists that
 *  the page has not built (a desktop not opened since the page loaded holds nothing else). */
function deskWindowCount(app, deskId) {
  const wm = app.wm, held = app.desktopManager?._savedStates?.get(deskId)?.windows || [];
  let n = 0;
  for (const w of wm.windows.values()) if (w._desktopId === deskId && !w._isStagePlaceholder) n++;
  for (const ws of held) { const id = ws && (ws.winId || ws.id); if (id && !wm.windows.has(id)) n++; }
  return n;
}

export class MobileNav {
  constructor(app) {
    this.app = app;
    this._titleEl = document.getElementById('mobile-nav-title');
    // THE PHONE'S WINDOW ON SHOW IS ITS OWN (§6b guard 10): per tab, per desktop (sessionStorage), read once before the
    // boot's restore focuses anything — a reload shows the same window; a record from another client never changes it
    this._shown = readShown();
    this._shownBooted = false;

    // ☰: the phone's drawer; in the regular class (the Duo's inner portrait) the list COLUMN's show / hide (lane duo-build-1)
    document.getElementById('mobile-nav-menu').onclick = () => (app.viewportClass?.() === 'regular' ? app.sidebar.toggleList() : app.sidebar.toggle(true));
    // 文件 (lane phone-files-door): the files were reachable only through the «+» long-press sheet — a person looking for
    // their files never looks under «new». One tap: the explorer this phone showed last, else a new one at home
    installNavFilesDoor(app);
    const newBtn = document.getElementById('mobile-nav-new');
    newBtn.onclick = () => app.showNewSessionDialog();
    // "+" LONG-PRESS SHEET (docs/design-mobile-gaps.md #3): #toolbar is
    // display:none ≤768px and with it the Terminal / Files / Browser / Desktop
    // entry points — a plain shell was reachable only through the dialog's
    // Backend=shell, the browser not at all. installLongPressContextMenu
    // synthesizes `contextmenu` on a 500 ms press (a mouse right-click lands
    // here too); the tap keeps opening the New Session dialog.
    newBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this._showCreateSheet(); });
    // ⚙ — the taskbar (and its gear-adjacent chrome) is hidden on phones, so
    // without this the gs-menu (Usage/Manage agents/Diagnostics/Settings…)
    // has no entry point at all on mobile.
    const gear = document.getElementById('mobile-nav-gear');
    if (gear) gear.onclick = (e) => { e.stopPropagation(); app._pressGlobalSettings(gear); };   // lane vault-locked-loud: a locked vault unlocks first

    document.getElementById('mobile-nav-close').onclick = () => {
      const activeId = app.wm.activeWindowId;
      if (activeId) app.wm.requestClose(activeId);
    };

    // the title = the window switcher with its desktop tabs — in the regular class too (lane desktop-switch-phone: SPEC-v3
    // §2.2 had turned it off there, «the list IS the switcher» — but the list lists conversations, never desktops, and a
    // person with many desktops could reach none but the one the page booted on); in its landscape the conversation's
    // head is the window's own title bar, so a tap on it opens the same switcher
    this._titleEl.onclick = () => this._showWindowSwitcher();
    document.getElementById('workspace')?.addEventListener('click', (e) => {
      if (app.viewportClass?.() !== 'regular' || getComputedStyle(document.getElementById('mobile-nav')).flexDirection !== 'column') return;
      const head = e.target.closest?.('.window.window-active > .window-titlebar');
      if (head && !e.target.closest('button, input, textarea, select, .window-controls')) this._showWindowSwitcher(head);
    });
    this._setupGestures();
    this.desktopsBtn = this._buildDesktopsDoor();
    this.bar = installTrailingBar(app); // the regular class's buttons (shown by the stylesheet there only)
    // the regular class's landscape: the list column's ☰ at the conversation's head (the owner 2026-10-25, 与原文不同 —
    // SPEC-v3 §4 kept the landscape list static; userW wants the conversation to take the width) — the portrait ☰'s act
    const listBtn = document.createElement('button');
    listBtn.id = 'list-column-toggle'; listBtn.type = 'button'; listBtn.textContent = '\u2630';
    listBtn.title = t('Sessions'); listBtn.setAttribute('aria-label', listBtn.title);
    listBtn.onclick = (e) => { e.stopPropagation(); app.sidebar.toggleList(); };
    document.body.appendChild(listBtn);
    this.listBtn = listBtn;
  }

  /** THE DESKTOPS DOOR (lane desktop-switch-phone, 2026-10-25 — userW on the Duo's inner display: «如何在这个界面下切换桌面？»).
   *  The virtual-desktop switcher lives in the taskbar's corner (desktop-manager.js _renderSwitcher) and neither phone class
   *  shows the taskbar: the regular class had no way to another desktop, the compact one only a tap on the title nobody
   *  finds. One button on this nav — the compact bar beside the title, the regular class's trailing bar first in its bottom
   *  section (the stylesheet orders it) — with the active desktop's number as its badge when there are two or more. */
  _buildDesktopsDoor() {
    const nav = document.getElementById('mobile-nav');
    if (!nav) return null;
    const b = document.createElement('button');
    b.id = 'mobile-nav-desktops'; b.type = 'button'; b.className = 'mnav-dest mnav-desktops';
    b.innerHTML = UI_ICONS.desktops;
    const badge = document.createElement('span'); badge.className = 'mnav-badge hidden'; b.appendChild(badge);
    b.onclick = (e) => { e.stopPropagation(); this._showDesktops(b); };
    const usage = document.getElementById('mobile-nav-usage');
    if (usage && usage.parentNode === nav) nav.insertBefore(b, usage); else nav.appendChild(b);
    return b;
  }

  /** The door's words and badge follow the desktops: every switch / create / rename / delete / remote change (they all
   *  re-render the taskbar's switcher — desktop-manager.js _renderSwitcher calls this) and every window change. */
  updateDesktopsDoor() {
    const b = this.desktopsBtn, dm = this.app.desktopManager;
    if (!b) return;
    const desks = dm?.desktops || [], k = desks.findIndex((d) => d.id === dm?.activeDesktopId) + 1;
    const label = k ? t('Desktops — {name} ({k}/{n})', { name: desks[k - 1].name, k, n: desks.length }) : t('Desktops');
    if (b.title !== label) { b.title = label; b.setAttribute('aria-label', label); }
    const badge = b.querySelector('.mnav-badge'), num = desks.length > 1 && k ? String(k) : '';
    if (badge && badge.textContent !== num) { badge.textContent = num; badge.classList.toggle('hidden', !num); }
  }

  /** The Desktops menu: every desktop by name with its window count, the active one marked; a tap = the manager's own
   *  switch road (the taskbar preview's click — the Stage left first); the last row «+ New desktop» = the taskbar's «+».
   *  The compact class lays it out as the phone's sheet under the nav (the «+» long-press sheet's pattern); the regular
   *  class opens it beside the button, into the conversation column (the ⋯'s placement). */
  _showDesktops(anchor) {
    const app = this.app, dm = app.desktopManager;
    if (!dm) return null;
    const mark = (svg) => `<span class="mdesk-mark">${svg || ''}</span>`;
    const items = dm.desktops.map((d) => {
      const n = deskWindowCount(app, d.id);
      return { labelHtml: `${mark(d.id === dm.activeDesktopId ? UI_ICONS.check : '')}<span class="mdesk-name">${escHtml(d.name)}</span><span class="mdesk-count">${escHtml(n === 1 ? t('1 window') : t('{n} windows', { n }))}</span>`,
        action: () => this.switchDesktop(d.id) };
    });
    items.push({ labelHtml: `${mark(UI_ICONS.plus)}<span class="mdesk-name">${escHtml(t('New desktop'))}</span>`, action: () => this.switchDesktop(dm.createDesktop()) });
    const regular = app.viewportClass?.() === 'regular';
    const r = anchor.getBoundingClientRect();
    const menu = regular ? showContextMenu(r.left, r.top, items) : this._sheet(items);
    menu.classList.add('mdesk-menu');
    menu.querySelectorAll('.context-menu-item').forEach((el, i) => {
      const d = dm.desktops[i];
      if (!d) { el.classList.add('mdesk-new'); return; }
      el.dataset.desktopId = d.id;
      el.classList.toggle('active', d.id === dm.activeDesktopId);
    });
    if (regular) {
      const Z = uiScale(), nav = document.getElementById('mobile-nav');
      if (getComputedStyle(nav).flexDirection === 'column') { menu.style.left = 'auto'; menu.style.right = ((innerWidth - r.left + 8) / Z) + 'px'; }
      else { menu.style.top = ((r.bottom + 4) / Z) + 'px'; menu.style.bottom = ''; menu.style.left = 'auto'; menu.style.right = (Math.max(4, innerWidth - r.right) / Z) + 'px'; }
    }
    return menu;
  }

  /** Switch this tab to desktop `id` by the manager's road (the Stage left first, as the taskbar's preview does), then show
   *  that desktop's window on show (§6b guard 10): the one this tab showed there, else its topmost — a lazy replay lands
   *  later, so it looks again for a few seconds unless the person picked a window meanwhile. */
  switchDesktop(id) {
    const app = this.app, dm = app.desktopManager;
    if (!dm || !id) return Promise.resolve();
    const go = app.stage?.isActive ? app.stage.leave(id) : id === dm.activeDesktopId ? null : dm.switchTo(id);
    return Promise.resolve(go).then(() => this._showOnDesk(id), () => this._showOnDesk(id));
  }

  _showOnDesk(desk) {
    const app = this.app, wm = app.wm, dm = app.desktopManager;
    const wantId = this._shown[desk], since = app.layoutManager?._lastUserInputAt || 0;
    const here = (w) => !!w && w._desktopId === desk && !w._hiddenByDesktop && !w._hiddenByStage;
    let tries = 0;
    const look = () => {
      if (dm.activeDesktopId !== desk) return; // another switch since
      const want = wantId && wm.windows.get(wantId);
      if (here(want)) { if (wm.activeWindowId !== wantId) wm.focusWindow(wantId); this.updateTitle(); return; }
      if (!here(wm.windows.get(wm.activeWindowId))) wm._focusMostRecent();
      this.updateTitle();
      if ((wantId || !here(wm.windows.get(wm.activeWindowId))) && ++tries < 16 && (app.layoutManager?._lastUserInputAt || 0) === since) setTimeout(look, 250);
    };
    look();
  }

  /** A context menu laid out as a full-width sheet under the nav bar (the
   *  .mobile-sheet stylesheet rule beats showContextMenu's inline x/y — the
   *  same !important-over-inline shape the usage popup uses). */
  _sheet(items) {
    // ONE class name to showContextMenu (it derives the row class from it —
    // a two-word name would strip every row of .context-menu-item); the
    // sheet modifier is added afterwards.
    const menu = showContextMenu(0, 0, items);
    menu.classList.add('mobile-sheet');
    return menu;
  }

  _showCreateSheet() {
    const app = this.app;
    const row = (icon, label, action) => ({ labelHtml: `${icon}<span>${escHtml(label)}</span>`, action });
    const items = [
      row(UI_ICONS.robot, t('Agent session'), () => app.showNewSessionDialog()),
      row(UI_ICONS.terminal, t('Terminal'), () => app.openShellTerminal()),
      row(FILE_ICONS.folder, t('Files'), () => app.openFileExplorer()),
      row(UI_ICONS.globe, t('Web view'), () => app.openBrowser()),
    ];
    // gated exactly like the toolbar button (app._vncAvailable = /api/vnc/status)
    if (app._vncAvailable) items.push(row(UI_ICONS.monitor, t('Desktop'), () => openDesktopPicker(app))); // lane desktop-v2-entry: recent / local / remote
    // THE THREE BROWSER FACES on the phone (design-browser-faces direction B, D5):
    // the web view above, then the desktop-app launcher (gated like its ⚙ row on
    // the /api/desktop/apps probe; the ONE command, its own icon) and the AGENT
    // browser (gated like its ⚙ row on the profile digest)
    const APPS_ICON = getCommand('desktopApps.open')?.icon || UI_ICONS.monitor;
    if (app._desktopAppsAvailable) items.push(row(APPS_ICON, t('Apps…'), () => runCommand('desktopApps.open', { app }))); // design 009 §B6: one word — Apps
    if (app._browserProfiles) items.push(row(UI_ICONS.browserLive, t('Agent browser'), () => this._openAgentBrowser()));
    return this._sheet(items);
  }

  /** The phone's Agent browser row. The agent browser is SESSION-scoped (a live
   *  view belongs to one conversation's browser), the "+" sheet is not — so:
   *  the ACTIVE window's session when it holds a browser ⇒ its live view; else a
   *  session picker over every live local session holding a browser (one row
   *  each, then the Agent browser window itself); none ⇒ the Agent browser
   *  window (profiles, ephemeral browsers, housekeeping). */
  _openAgentBrowser() {
    const app = this.app;
    const rows = (app.sidebar?._allSessions || []).filter((s) => s && s.status === 'live' && s.webuiId && s.browserKey && !s.host);
    const term = app.sessions?.get?.(app.wm.activeWindowId);
    const here = term && rows.find((s) => s.webuiId === term.sessionId);
    if (here) { app.openBrowserLive({ sessionId: here.webuiId }); return; }
    if (!rows.length) { app.openBrowserProfiles(); return; }
    const row = (icon, label, action) => ({ labelHtml: `${icon}<span>${escHtml(label)}</span>`, action });
    this._sheet([
      ...rows.map((s) => row(UI_ICONS.browserLive, s.webuiName || s.name || s.webuiId, () => app.openBrowserLive({ sessionId: s.webuiId }))),
      row(UI_ICONS.browserLive, t('Agent browser…'), () => app.openBrowserProfiles()),
    ]);
  }

  /** The window on show, noted for this tab once the boot's restore is over (every window change ends here). */
  _noteShown() {
    const desk = this.app.desktopManager?.activeDesktopId || '', id = this.app.wm.activeWindowId;
    if (!this._shownBooted || !id || this._shown[desk] === id) return;
    const w = this.app.wm.windows.get(id);
    if (desk && w?._desktopId && w._desktopId !== desk) return; // a switch's in-between: the old desktop's window is still the active one
    this._shown[desk] = id;
    try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify(this._shown)); } catch { }
  }

  /** After the boot's restore (layout.js loadAutoSave): show the window this tab showed before the reload, once it is
   *  built (a lazy replay lands later) — unless the person picked another one meanwhile. */
  restoreShown() {
    const desk = this.app.desktopManager?.activeDesktopId || '', want = this._shown[desk], wm = this.app.wm;
    const since = this.app.layoutManager?._lastUserInputAt || 0;
    let tries = 0;
    const go = () => {
      if (want && (this.app.layoutManager?._lastUserInputAt || 0) === since && wm.windows.has(want)) {
        if (wm.activeWindowId !== want) wm.focusWindow(want);
      } else if (want && (this.app.layoutManager?._lastUserInputAt || 0) === since && ++tries < 24) { setTimeout(go, 250); return; }
      this._shownBooted = true;
      this._noteShown();
    };
    go();
  }

  updateTitle() {
    this._noteShown();
    if (!this._titleEl) return;
    const wm = this.app.wm;
    const win = wm.windows.get(wm.activeWindowId);
    const count = [...wm.windows.values()].filter(w => !w._hiddenByDesktop && !minimizedOf(wm, w)).length;
    // lane phone-first-screen: the attention page covers the window area — the bar names the page, never a window it hides
    // (a tap on the title still lists the windows; the ✕ that closes the active one is hidden meanwhile — style.css)
    // the regular class (lane duo-build-1): the conversation's NAME (never its folder, never a window count — its list is beside it)
    this._titleEl.textContent = this.app.phoneHome?.shown?.() ? t('For you')
      : this.app.viewportClass?.() === 'regular' ? String(win?.title || 'VibeSpace').split(' — ')[0]
      : (win?.title || 'VibeSpace') + (count > 1 ? ` (${count})` : '');
    this._titleEl.classList.toggle('arrived', [...wm.windows.values()].some((w) => w.element.classList.contains('window-arrived'))); // an agent placed a window (never shown in front of this one)
    this.bar?.update?.();
    this.updateDesktopsDoor();
  }

  _showWindowSwitcher(anchor = this._titleEl) {
    if (!anchor) return;
    const existing = document.querySelector('.mobile-win-switcher');
    if (existing) { existing.remove(); return; }

    const pop = document.createElement('div');
    pop.className = 'mobile-win-switcher';
    pop.style.cssText = 'position:fixed;left:0;right:0;z-index:90001;background:var(--bg-dialog);border-bottom:1px solid var(--border);box-shadow:0 4px 16px rgba(0,0,0,0.3);max-height:60vh;overflow-y:auto;-webkit-overflow-scrolling:touch';
    const navRect = (anchor.closest('#mobile-nav') || anchor).getBoundingClientRect();
    // at the regular class's landscape the nav is the VERTICAL trailing bar (full height) — its bottom is the viewport's bottom;
    // the sheet then hangs from the top (HOTFIX 2.369.356), and from the conversation's head when that is the anchor
    const top = navRect.height > navRect.width ? 0 : navRect.bottom;
    pop.style.top = top + 'px';
    // the regular class: over the conversation column only (the list column and the trailing bar stay)
    const col = this.app.viewportClass?.() === 'regular' && document.getElementById('workspace')?.getBoundingClientRect();
    if (col && col.width) { pop.style.left = col.left + 'px'; pop.style.right = Math.max(0, innerWidth - col.right) + 'px'; pop.style.top = Math.max(top, col.top) + 'px'; }

    const wm = this.app.wm;
    const dm = this.app.desktopManager;
    const desktops = dm?.desktops || [];

    // Window list container (rebuilt on desktop switch)
    const winList = document.createElement('div');

    const renderContent = () => {
      // FRESH each render (inc-mtfici94: a stale open-time snapshot showed
      // nothing after a switch materialized the lazy-replayed windows — the
      // popup had to be reopened to see them)
      const allWindows = [...wm.windows.values()].filter(w => !minimizedOf(wm, w));
      // not-yet-materialized windows live only in the desktop's saved state
      // until its first switchTo — count them or fresh-load desktops read 0
      const savedCount = (deskId) => ((dm._savedStates?.get(deskId)?.windows) || [])
        .filter((ws) => ws.openSpec && !wm.windows.has(ws.winId || ws.id)).length;
      const rerender = () => { if (pop.isConnected) renderContent(); };
      const afterSwitch = () => {
        rerender();
        // lazy-replayed windows materialize on a ~500ms timer inside
        // switchTo — render once more after they land
        setTimeout(rerender, 700);
      };
      // Desktop tabs — ALWAYS rendered now (design-mobile-gaps #7): the "+"
      // tab is the phone's only way to create a desktop (the taskbar previews
      // are hidden ≤768px), and a long-press on a tab renames / deletes it.
      if (dm) {
        const oldTabs = pop.querySelector('.mobile-desk-tabs');
        if (oldTabs) oldTabs.remove();
        const tabBar = document.createElement('div');
        tabBar.className = 'mobile-desk-tabs';
        tabBar.style.cssText = 'display:flex;gap:0;border-bottom:2px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch;flex-shrink:0';
        const tabCss = (isActive) => `flex-shrink:0;min-height:40px;padding:10px 14px;border:none;background:none;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;color:${isActive ? 'var(--accent)' : 'var(--text-dim)'};border-bottom:2px solid ${isActive ? 'var(--accent)' : 'transparent'};margin-bottom:-2px`;
        for (const desk of desktops) {
          const tab = document.createElement('button');
          tab.className = 'mobile-desk-tab';
          const isActive = desk.id === dm.activeDesktopId;
          const deskWindows = allWindows.filter(w => w._desktopId === desk.id);
          tab.textContent = `${desk.name} (${deskWindows.length + savedCount(desk.id)})`;
          tab.style.cssText = tabCss(isActive);
          tab.onclick = () => { this.switchDesktop(desk.id).then(afterSwitch); }; // the window on show follows the desktop (§6b guard 10)
          tab.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            const items = [{ label: t('Rename'), action: async () => { await dm._startRename(desk); rerender(); } }];
            if (desktops.length > 1) items.push({ label: t('Delete'), style: 'color:var(--red, #e55)', action: async () => { await dm.deleteDesktop(desk.id); afterSwitch(); } });
            showContextMenu(e.clientX, e.clientY, items);
          });
          tabBar.appendChild(tab);
        }
        const addTab = document.createElement('button');
        addTab.className = 'mobile-desk-tab mobile-desk-add';
        addTab.textContent = '+';
        addTab.title = t('Add desktop');
        addTab.style.cssText = tabCss(false) + ';font-size:16px;padding:6px 14px';
        addTab.onclick = () => { const id = dm.createDesktop(); this.switchDesktop(id).then(afterSwitch); };
        tabBar.appendChild(addTab);
        pop.insertBefore(tabBar, winList);
      }
      // Window list for current desktop
      winList.innerHTML = '';
      const windows = allWindows.filter(w => !w._hiddenByDesktop);
      if (!windows.length) {
        winList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:13px">${escHtml(t('No windows on this desktop'))}</div>`;
      } else {
        for (const win of windows) {
          winList.appendChild(this._buildWindowItem(win, wm, pop, rerender));
        }
      }
      // Minimized windows (design-mobile-gaps #10): WindowManager.minimize is a
      // no-op ≤768px now, but a window minimized on a desktop client before
      // this phone joined would otherwise vanish from every list — a tap
      // restores it.
      // a tab group is minimized as ONE frame (the host carries the flag) — its guests are listed here too
      const minimized = [...wm.windows.values()].filter(w => minimizedOf(wm, w) && !w._hiddenByDesktop);
      if (minimized.length) {
        const head = document.createElement('div');
        head.className = 'mobile-win-minimized-head';
        head.style.cssText = 'padding:8px 16px 2px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim)';
        head.textContent = t('Minimized');
        winList.appendChild(head);
        for (const win of minimized) {
          const item = this._buildWindowItem(win, wm, pop, rerender);
          item.classList.add('mobile-win-minimized');
          item.onclick = () => { pop.remove(); wm.revealWindow(win.id); }; // restores the group AND shows this tab (a host too)
          winList.appendChild(item);
        }
      }
    };

    pop.appendChild(winList);
    renderContent();

    document.body.appendChild(pop);
    // An outside tap closes the list — THE ONE closer (utils.js onOutsidePress: capture phase, a touch counts as a
    // TAP, so a scroll outside the list no longer dismisses it). Chained-popover rule (same as attachPopoverClose): a
    // context menu or dialog opened FROM a row (billing switcher + its confirm) is a child interaction, not a
    // dismissal of the list; a press ON the nav button itself is its toggle's.
    onOutsidePress(pop, () => pop.remove(), { ignore: (t) => t === anchor || !!anchor.contains?.(t) || !!t?.closest?.('.dialog-overlay, #dialog-overlay') });
  }

  _buildWindowItem(win, wm, pop, rerender) {
    const item = document.createElement('div');
    item.className = 'mobile-win-row';
    item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.1s';
    if (win.id === wm.activeWindowId) item.style.background = 'var(--accent-dim)';
    // Long-press → the window's own menu (design-mobile-gaps #7/#22): the
    // registered 'window' contributions — rename / restart / terminate /
    // locate / properties / Move to Desktop / close — the title-bar menu the
    // phone has no title bar for. The list stays open underneath (its
    // outside-tap close exempts [data-popover]).
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      showWindowContextMenu(this.app, win.id, e.clientX, e.clientY, { onAction: () => setTimeout(() => rerender?.(), 50) });
    });

    const icon = document.createElement('span');
    icon.style.cssText = 'flex-shrink:0;font-size:16px';
    icon.innerHTML = win._typeIcon || '';

    const label = document.createElement('span');
    label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--text)';
    label.textContent = win.title || 'Window';

    // Billing identity chip — mirrors the desktop title-bar badge (which has
    // no home on mobile). setAuthBadge stashes the auth object on the window.
    let billChip = null;
    const auth = win._authBadge;
    if (auth) {
      const isApi = auth.source === 'api-key' || auth.source === 'api-console' || auth.source === 'api-other';
      billChip = document.createElement('span');
      billChip.className = 'mobile-win-billing' + (isApi ? ' api' : '');
      // pooled parity with the desktop badge: name the pool AND its current real target (2.267.1). lane phone-chip
      // (B-e5ff): the three forms, never cut — the row's title and the chip share the row (lane G's chipMode, fitted
      // once the row is laid out); the full words in title + aria-label
      const forms = billingPillForms({ kind: auth.source === 'unknown' ? 'unknown' : auth.source === 'pooled' ? 'pooled' : isApi ? 'api' : 'subscription',
        name: auth.source === 'pooled' ? (auth.name || t('pool')) : (auth.name || (isApi ? (auth.source === 'api-console' ? 'Console' : 'API') : t('CLI login'))),
        target: auth.source === 'pooled' ? (auth.poolTarget || '') : '' });
      billChip.innerHTML = billingPillHtml(forms, escHtml);
      billChip.title = forms.tip + ' — ' + t('Click to switch billing');
      billChip.setAttribute('aria-label', forms.tip);
      billChip.onclick = (e) => {
        // Keep the window list open underneath — closing it left the switcher
        // menu floating context-less (real report). The list's outside-tap
        // close exempts [data-popover]/dialogs, same as attachPopoverClose.
        e.stopPropagation();
        this.app.showBillingSwitcher?.(win.id, billChip);
      };
    }

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);font-size:16px;padding:4px 8px;cursor:pointer;flex-shrink:0;min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = (e) => { e.stopPropagation(); if (wm.requestClose(win.id)) item.remove(); };

    if (billChip) item.append(icon, label, billChip, closeBtn);
    else item.append(icon, label, closeBtn);
    if (billChip) requestAnimationFrame(() => fitRowPill(label, billChip));
    item.addEventListener('pointerdown', () => { item.style.background = 'var(--bg-hover)'; });
    // THE ROW NAMES THE WINDOW — reveal it as itself (inc-muiq348r-jwb5: a tab group's HOST row, tapped while the group
    // showed a guest, only raised the frame — the guest stayed on screen under the host's title and highlight)
    item.onclick = () => { pop.remove(); wm.revealWindow(win.id); };
    return item;
  }

  _setupGestures() {
    const app = this.app;
    let startX = 0, startY = 0;
    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!app.isMobile) return; // built at a fold (lane duo-build-1): unfolded to the desktop, an edge swipe is no drawer
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dy) < 50 && app.viewportClass?.() === 'regular') { // the list column (SPEC-v3 §4): the left edge shows it, a swipe left FROM it hides it
        if (dx > 0 && startX < 30) app.sidebar.setListHidden(false);
        else if (dx < 0 && startX < 320 && matchMedia('(orientation: portrait)').matches) app.sidebar.setListHidden(true);
        return;
      }
      if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
        if (dx > 0 && startX < 30) app.sidebar.toggle(true);
        else if (dx < 0 && app.sidebar.isOpen) app.sidebar.toggle(false);
      }
    }, { passive: true });
  }
}
