import { t } from './i18n.js';
import { escHtml, showContextMenu } from './utils.js';
import { showWindowContextMenu } from './taskbar.js';
import { UI_ICONS, FILE_ICONS } from './icons.js';

/**
 * MobileNav — mobile navigation bar controller.
 *
 * Manages: hamburger menu, window switcher (tap title), close button,
 * new session button, title updates, edge-swipe gestures.
 *
 * Constructed by App when isMobile is true. Receives app reference
 * for sidebar/window/session access.
 */

export class MobileNav {
  constructor(app) {
    this.app = app;
    this._titleEl = document.getElementById('mobile-nav-title');

    document.getElementById('mobile-nav-menu').onclick = () => app.sidebar.toggle(true);
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
    if (gear) gear.onclick = (e) => { e.stopPropagation(); app._showGlobalSettings(gear); };

    document.getElementById('mobile-nav-close').onclick = () => {
      const activeId = app.wm.activeWindowId;
      if (activeId) app.wm.closeWindow(activeId);
    };

    this._titleEl.onclick = () => this._showWindowSwitcher();
    this._setupGestures();
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
      row(UI_ICONS.globe, t('Browser'), () => app.openBrowser()),
    ];
    // gated exactly like the toolbar button (app._vncAvailable = /api/vnc/status)
    if (app._vncAvailable) items.push(row(UI_ICONS.monitor, t('Desktop'), () => app.openDesktop()));
    return this._sheet(items);
  }

  updateTitle() {
    if (!this._titleEl) return;
    const win = this.app.wm.windows.get(this.app.wm.activeWindowId);
    const count = [...this.app.wm.windows.values()].filter(w => !w._hiddenByDesktop && !w.isMinimized).length;
    this._titleEl.textContent = (win?.title || 'VibeSpace') + (count > 1 ? ` (${count})` : '');
  }

  _showWindowSwitcher() {
    const anchor = this._titleEl;
    if (!anchor) return;
    const existing = document.querySelector('.mobile-win-switcher');
    if (existing) { existing.remove(); return; }

    const pop = document.createElement('div');
    pop.className = 'mobile-win-switcher';
    pop.style.cssText = 'position:fixed;left:0;right:0;z-index:90001;background:var(--bg-dialog);border-bottom:1px solid var(--border);box-shadow:0 4px 16px rgba(0,0,0,0.3);max-height:60vh;overflow-y:auto;-webkit-overflow-scrolling:touch';
    const navRect = anchor.closest('#mobile-nav').getBoundingClientRect();
    pop.style.top = navRect.bottom + 'px';

    const wm = this.app.wm;
    const dm = this.app.desktopManager;
    const desktops = dm?.desktops || [];

    // Window list container (rebuilt on desktop switch)
    const winList = document.createElement('div');

    const renderContent = () => {
      // FRESH each render (inc-mtfici94: a stale open-time snapshot showed
      // nothing after a switch materialized the lazy-replayed windows — the
      // popup had to be reopened to see them)
      const allWindows = [...wm.windows.values()].filter(w => !w.isMinimized);
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
          tab.onclick = () => { dm.switchTo(desk.id).then(afterSwitch); };
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
        addTab.onclick = () => { const id = dm.createDesktop(); dm.switchTo(id).then(afterSwitch); };
        tabBar.appendChild(addTab);
        pop.insertBefore(tabBar, winList);
      }
      // Window list for current desktop
      winList.innerHTML = '';
      const windows = allWindows.filter(w => !w._hiddenByDesktop && !w.isMinimized);
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
      const minimized = [...wm.windows.values()].filter(w => w.isMinimized && !w._hiddenByDesktop);
      if (minimized.length) {
        const head = document.createElement('div');
        head.className = 'mobile-win-minimized-head';
        head.style.cssText = 'padding:8px 16px 2px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim)';
        head.textContent = t('Minimized');
        winList.appendChild(head);
        for (const win of minimized) {
          const item = this._buildWindowItem(win, wm, pop, rerender);
          item.classList.add('mobile-win-minimized');
          item.onclick = () => { pop.remove(); wm.restore(win.id); };
          winList.appendChild(item);
        }
      }
    };

    pop.appendChild(winList);
    renderContent();

    document.body.appendChild(pop);
    // Chained-popover rule (same as attachPopoverClose): a context menu or
    // dialog opened FROM a row (billing switcher + its confirm) is a child
    // interaction, not a dismissal of the list.
    const onTap = (e) => {
      if (pop.contains(e.target) || e.target === anchor) return;
      if (e.target.closest('[data-popover], .dialog-overlay, #dialog-overlay')) return;
      pop.remove();
      document.removeEventListener('pointerdown', onTap);
    };
    setTimeout(() => document.addEventListener('pointerdown', onTap), 0);
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
      billChip.textContent = auth.source === 'unknown' ? '?'
        // pooled parity with the desktop badge: name the pool AND its current
        // real target (2.267.1, mobile pooling support)
        : auth.source === 'pooled' ? (auth.name || t('pool')) + (auth.poolTarget ? ` → ${auth.poolTarget}` : '')
        : (auth.name || (isApi ? (auth.source === 'api-console' ? 'Console' : 'API') : t('CLI login')));
      billChip.title = t('Click to switch billing');
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
    closeBtn.onclick = (e) => { e.stopPropagation(); wm.closeWindow(win.id); item.remove(); };

    if (billChip) item.append(icon, label, billChip, closeBtn);
    else item.append(icon, label, closeBtn);
    item.addEventListener('pointerdown', () => { item.style.background = 'var(--bg-hover)'; });
    item.onclick = () => { pop.remove(); wm.focusWindow(win.id); };
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
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
        if (dx > 0 && startX < 30) app.sidebar.toggle(true);
        else if (dx < 0 && app.sidebar.isOpen) app.sidebar.toggle(false);
      }
    }, { passive: true });
  }
}
