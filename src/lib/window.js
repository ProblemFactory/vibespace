import { attachPopoverClose, escHtml, uiScale } from './utils.js';
import { minOf, clampToMin, raiseToMin, keepInside } from './window-min-size.js';
import { track } from './telemetry-client.js';
import { t } from './i18n.js';
import { showWindowContextMenu } from './taskbar.js';
import { installTabGroupMixin } from './tab-group.js';
import { windowTypeIcon } from './window-types.js';
import { createAgentKindIcon, createBackendIcon, createModeBackendIcon, getAgentKindMeta } from './agent-meta.js';
import { HIDE_REASONS, hiddenReasons } from './view-visibility.js';
import { chipMode, chipWords, titleMinText, CHIP_MODES } from './title-chips.js'; // THE TITLE WINS (lane G): the billing chip's form per title bar / tab
import { displayedPanes } from './chain-layout.js'; // agent browser P7 (§4.6): a split's displayed panes on a narrow layout // PURE: which hiders hold a window's content off-screen (inc-mu6bfv1t-4drq)

/** Show one of the billing chip's three forms (lane G): a class per form + data-mode. */
function setChipMode(chip, mode) {
  for (const m of CHIP_MODES) chip.classList.toggle('wab-' + m, m === mode);
  chip.dataset.mode = mode;
}

class WindowManager {
  constructor(workspace) {
    this.workspace = workspace;
    // The workspace is a LAYOUT container, never a scroller — but an
    // overflow:hidden element is still PROGRAMMATICALLY scrollable, and the
    // browser's focus-scrolling scrolls it whenever focus lands inside a
    // window that extends past the workspace bottom (freeform windows may).
    // There is no scrollbar to undo it, so the whole workspace appeared
    // permanently shifted (tracer-diagnosed real report: scrollTop stuck at
    // 239, every window "pushed" by exactly that amount, correlated with
    // bottom-edge right-clicks). CSS overflow:clip forbids it; this listener
    // is the belt for engines/paths that scroll anyway.
    workspace.addEventListener('scroll', () => {
      if (workspace.scrollTop !== 0) workspace.scrollTop = 0;
      if (workspace.scrollLeft !== 0) workspace.scrollLeft = 0;
    }, { passive: true });
    this.windows = new Map(); this.zIndex = 100; this.activeWindowId = null;
    // Window z-indexes grow on every focus AND persist across reloads — left
    // unchecked they eventually pass the fixed chrome layers (snap indicator
    // 9990, theme editor 9999). Renumber preserving stacking order.
    this._normalizeZIndices = () => {
      const ordered = [...this.windows.values()].sort((a, b) => (parseInt(a.element.style.zIndex) || 0) - (parseInt(b.element.style.zIndex) || 0));
      let z = 100;
      for (const w of ordered) w.element.style.zIndex = z++;
      this.zIndex = z;
    };
    this.snapIndicator = document.getElementById('snap-indicator');
    this.gridOverlay = document.getElementById('grid-overlay');
    this.onWindowsChanged = null; this.windowCounter = 0;
    this.grid = null; // { rows, cols }
    this._overlapDebounceTimer = null;
    this._settings = null; // set by App after construction
    this._reflowScheduled = false;

    // Reflow grid-tracked windows when workspace resizes (sidebar toggle, browser resize)
    this._resizeObserver = new ResizeObserver(() => this._scheduleReflowWindows());
    this._resizeObserver.observe(workspace);

    // Install tab grouping methods (from tab-group.js mixin)
    installTabGroupMixin(this);
  }

  // Mobile: the sidebar is a full-screen overlay, so creating/focusing a
  // window with it open looks like a no-op (window lands BEHIND it — real
  // report: card menu → Properties "did nothing"). Any window navigation
  // yields the sidebar. Guard: layout restore / remote layout-sync apply
  // (layoutManager._restoring covers both) must not yank a sidebar the user
  // is browsing. Deliberately NOT guarded on desktopManager._restoring — it
  // stays true for 1s past switchTo's resolve, which would make cross-desktop
  // goToWindow (the sidebar's own 前往窗口) leave the sidebar open; on mobile
  // no other switchTo path can run while the sidebar is open.
  _mobileYieldSidebar() {
    const app = this.app;
    if (!app?.isMobile || !app.sidebar?.isOpen) return;
    if (app.layoutManager?._restoring) return;
    app.sidebar.toggle(false);
  }

  createWindow({ title, type, x, y, width, height, syncId, openSpec, titleMeta, intoChain }) {
    this._mobileYieldSidebar();
    const id = syncId || ('win-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6));
    this.windowCounter++;
    if (x === undefined) { const o = (this.windowCounter % 8) * 30; x = 40 + o; y = 40 + o; }
    width = width || 700; height = height || 500;
    // BORN IN A CHAIN (agent browser P7, §4.6): `intoChain: { hostId, split, side }`
    // — the window is never painted standalone (no visible jump, no
    // created-then-merged autosave churn); it joins the host's chain below.
    const born = intoChain && intoChain.hostId && intoChain.hostId !== id ? (this.windows.get(intoChain.hostId) || null) : null;

    const el = document.createElement('div');
    el.className = 'window';
    el.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${this.zIndex++}${born ? ';display:none' : ''}`;

    const titleBar = document.createElement('div'); titleBar.className = 'window-titlebar';
    const iconWrap = document.createElement('div'); iconWrap.className = 'window-icon-stack';
    const backendIconSlot = document.createElement('span'); backendIconSlot.className = 'window-backend-slot';
    const agentKindSlot = document.createElement('span'); agentKindSlot.className = 'window-agent-kind-slot';
    const iconSpan = document.createElement('span'); iconSpan.className = 'window-type-icon'; iconSpan.innerHTML = windowTypeIcon(type);
    iconWrap.append(backendIconSlot, agentKindSlot, iconSpan);
    const titleSpan = document.createElement('span'); titleSpan.className = 'window-title'; titleSpan.textContent = title;
    const controls = document.createElement('div'); controls.className = 'window-controls';
    // the four titlebar tooltips are human-visible chrome (a3 i18n: they were the last untranslated words on every window)
    controls.innerHTML = `<button class="win-btn win-overlap-btn no-overlap" title="${escHtml(t('Overlapping windows'))}">□</button><button class="win-btn win-minimize" title="${escHtml(t('Minimize'))}">─</button><button class="win-btn win-maximize" title="${escHtml(t('Maximize'))}">□</button><button class="win-btn win-close" title="${escHtml(t('Close'))}">✕</button>`;
    titleBar.append(iconWrap, titleSpan, controls);

    const content = document.createElement('div'); content.className = 'window-content';
    // the 8 resize handles are paint-only (design-accessibility-tree §3 row 2): empty divs, aria-hidden so none is a node
    for (const dir of ['n','s','e','w','ne','nw','se','sw']) {
      const h = document.createElement('div'); h.className = `resize-handle resize-${dir}`; h.dataset.dir = dir; h.setAttribute('aria-hidden', 'true'); el.appendChild(h);
    }
    el.append(titleBar, content); this.workspace.appendChild(el);

    const winInfo = { id, element: el, titleBar, titleSpan, iconSpan, iconWrap, backendIconSlot, agentKindSlot, content, title, type,
      isMaximized: false, isMinimized: false, prevBounds: null, onResize: null, onClose: null, exited: false, minWidth: null, minHeight: null, paneMinWidth: null,
      _typeIcon: windowTypeIcon(type), _tabChain: null, titleMeta: { ...(titleMeta || {}) },
      // All document-level listeners for this window register with this signal
      // and are removed together on close (they used to leak per window).
      _listenerCtl: new AbortController() };
    this.windows.set(id, winInfo);
    this._applyTitleMeta(winInfo);
    this._setupDrag(winInfo); this._setupResize(winInfo); this._setupIconDrag(winInfo);
    controls.querySelector('.win-overlap-btn').onclick = (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      if (btn.classList.contains('no-overlap')) return;
      this._showOverlapSwitcher(winInfo, e.clientX, e.clientY);
    };
    controls.querySelector('.win-minimize').onclick = (e) => { e.stopPropagation(); this.minimize(winInfo.id); };
    controls.querySelector('.win-maximize').onclick = (e) => { e.stopPropagation(); this.toggleMaximize(winInfo.id); };
    controls.querySelector('.win-close').onclick = (e) => { e.stopPropagation(); this.requestClose(winInfo.id); };
    el.addEventListener('mousedown', () => this.focusWindow(winInfo.id));
    titleBar.addEventListener('dblclick', (e) => { if (!e.target.closest('.window-controls')) this.toggleMaximize(winInfo.id); });
    // Right-click on title bar (2.212.0): full window menu — the old direct
    // overlap-switcher popup now lives inside it as the "Switch window"
    // submenu (scope configurable via window.titlebarSwitchScope). The □
    // overlap BUTTON keeps the classic popup.
    titleBar.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.window-controls')) return;
      e.preventDefault();
      if (this._app) showWindowContextMenu(this._app, winInfo.id, e.clientX, e.clientY, { switchSubmenu: true });
      else this._showOverlapSwitcher(winInfo, e.clientX, e.clientY);
    });
    if (openSpec) winInfo._openSpec = openSpec;
    track('event', 'window-open:' + type);
    this._app?.stage?.onWindowCreated(winInfo); // stage aux binding / transient tag
    if (born) {
      if (intoChain.split) this.bindSplit(born, winInfo, { side: intoChain.side || 'right' });
      else if (born._tabChain) this.addToTabChain(born._tabChain, winInfo);
      else this.createTabChain(born, winInfo);
    }
    this.focusWindow(id); this._notify(); this._scheduleOverlapUpdate(); return winInfo;
  }

  // ── Grid Bounds Tracking ──
  // Store window position as fractions of workspace (0-1) so it scales with resize.
  // Set on grid snap or applyLayout. Updated on user resize. Cleared on manual drag or freeform.
  _captureGridBounds(win) {
    // Stage slot: geometry edits on the placeholder OR the hero persist the
    // shared slot record (user decision: hero resize edits the slot).
    if (win && (win._isStagePlaceholder || win._isStageHero)) {
      setTimeout(() => this._app?.stage?.onGeometryCaptured(win), 0);
    }
    // Skip grouped guests — they share host bounds via _syncChainBounds
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) return;
    // LAYOUT px, never getBoundingClientRect: offsetLeft is layout px and gBCR
    // is viewport px — under the DPI zoom the mixed ratio recorded fractions
    // divided by the zoom, which poisoned layouts.json for every client (F1)
    const r = { width: this.workspace.offsetWidth, height: this.workspace.offsetHeight };
    const el = win.element;
    // Quantize to 4 decimals: offsetLeft/Width are integer px, so raw
    // fractions carry viewport-dependent rounding noise — two clients would
    // never agree on the "same" bounds and layout-sync bounced forever.
    const q = (v) => Math.round(v * 10000) / 10000;
    win.gridBounds = {
      left: q(el.offsetLeft / r.width),
      top: q(el.offsetTop / r.height),
      width: q(el.offsetWidth / r.width),
      height: q(el.offsetHeight / r.height),
    };
    // Keep the desktop previews honest: the drag path mutates preview rects
    // DIRECTLY (live tracking), which the switcher's digest guard cannot see —
    // a drag that ends back on the same bounds (re-snap to the same zone)
    // left the rect frozen mid-drag forever. Every bounds capture forces a
    // (debounced, digest-invalidating) re-render.
    this.app?.desktopManager?.refreshSwitcher?.();
  }

  _applyGridBounds(win) {
    if (!win.gridBounds) return;
    const r = { width: this.workspace.offsetWidth, height: this.workspace.offsetHeight }; // layout px (F1)
    const b = win.gridBounds;
    const el = win.element;
    el.style.left = (b.left * r.width) + 'px';
    el.style.top = (b.top * r.height) + 'px';
    el.style.width = (b.width * r.width) + 'px';
    el.style.height = (b.height * r.height) + 'px';
    if (win.onResize) win.onResize();
  }

  _reflowWindows() {
    if (this._suppressReflow) return;
    // Skip on mobile — windows are position:fixed via CSS
    if (window.innerWidth <= 768) return;
    for (const win of this.windows.values()) {
      // Skip grouped guests — they share the host's element
      if (win._tabChain && win._tabChain.tabs[0] !== win.id) continue;
      if (win._hiddenByDesktop) continue;
      if (win.gridBounds && !win.isMinimized && !win.isMaximized) {
        this._applyGridBounds(win);
      }
      if (win.minWidth || win.minHeight) this._applyOwnMin(win); // the workspace cap follows the workspace (r2)
    }
  }

  _scheduleReflowWindows() {
    if (this._suppressReflow || this._reflowScheduled) return;
    this._reflowScheduled = true;
    requestAnimationFrame(() => {
      this._reflowScheduled = false;
      this._reflowWindows();
    });
  }

  _setupDrag(win) {
    const { element, titleBar } = win;
    let mouseDown = false, dragging = false, startX, startY, initL, initT;
    let shiftDragStart = -1;
    let tabMergeTarget = null;
    let mergeGhost = null; // floating ghost shown when hovering over a merge target
    let savedBounds = null; // window bounds saved before collapsing to ghost
    let deskPreviewTarget = null; // desktop preview element we're hovering over
    let deskMiniWin = null; // mini window rect inside the preview
    let deskSavedBounds = null; // window bounds saved before entering desktop preview
    const DRAG_THRESHOLD = 5;

    // Shake-to-bypass-snap: vigorously shaking the window for ≥1s during a drag
    // latches "grid snap off" for the REST of that drag — a mouse-only alternative
    // to holding Alt. Detected by counting per-frame direction reversals: ≥3
    // reversals inside a 500ms sliding window = "vigorous", and vigor sustained
    // for SHAKE_HOLD ms latches the bypass.
    const SHAKE_MIN_SPEED = 6;   // px/frame on an axis to count as intentional motion
    const SHAKE_WINDOW = 500;    // ms sliding window for the reversal count
    const SHAKE_REVERSALS = 3;   // reversals within the window ⇒ vigorous
    let shakeHoldMs = 1000;      // ms of sustained vigor ⇒ latch — from settings, read per drag
    let shakeBypass = false, shakeReversals = [], shakeActiveSince = 0;
    let shakeDirX = 0, shakeDirY = 0, shakeLastX = 0, shakeLastY = 0, shakeBadge = null;
    const resetShake = (e) => {
      shakeBypass = false; shakeReversals = []; shakeActiveSince = 0;
      shakeDirX = 0; shakeDirY = 0; shakeLastX = e.clientX; shakeLastY = e.clientY;
      const secs = this._settings?.get('layout.shakeBypassSeconds');
      shakeHoldMs = (typeof secs === 'number' && secs > 0 ? secs : 1) * 1000; // re-read each drag → live-adjustable
    };
    const clearShakeBadge = () => {
      if (shakeBadge) { shakeBadge.remove(); shakeBadge = null; }
      element.classList.remove('snap-bypassed');
    };
    const updateShake = (e) => {
      if (shakeBypass) return; // already latched — stays on for the rest of the drag
      if (!(this._settings?.get('layout.shakeBypassSnap') ?? true)) return;
      const now = e.timeStamp || performance.now();
      const mdx = e.clientX - shakeLastX, mdy = e.clientY - shakeLastY;
      shakeLastX = e.clientX; shakeLastY = e.clientY;
      let reversed = false;
      if (Math.abs(mdx) >= SHAKE_MIN_SPEED) { const s = Math.sign(mdx); if (shakeDirX && s !== shakeDirX) reversed = true; shakeDirX = s; }
      if (Math.abs(mdy) >= SHAKE_MIN_SPEED) { const s = Math.sign(mdy); if (shakeDirY && s !== shakeDirY) reversed = true; shakeDirY = s; }
      if (reversed) shakeReversals.push(now);
      const cutoff = now - SHAKE_WINDOW;
      while (shakeReversals.length && shakeReversals[0] < cutoff) shakeReversals.shift();
      if (shakeReversals.length >= SHAKE_REVERSALS) {
        if (!shakeActiveSince) shakeActiveSince = now;
        else if (now - shakeActiveSince >= shakeHoldMs) {
          shakeBypass = true; // latch — the drop handler now skips snap
          element.classList.add('snap-bypassed');
          this.snapIndicator.style.display = 'none';
          this._clearGridHighlight();
          if (shiftDragStart >= 0) shiftDragStart = -1;
          if (!shakeBadge) {
            shakeBadge = document.createElement('div');
            shakeBadge.className = 'snap-bypass-badge';
            shakeBadge.textContent = t('Grid snap off');
            document.body.appendChild(shakeBadge);
          }
        }
      } else {
        shakeActiveSince = 0; // vigor lapsed — the 1s must be continuous
      }
    };

    // ONE start for every drag of this window: the title bar's mousedown, and (seamless, round 3 lane B) a pointer
    // the app's own header bar handed over (beginDragFromPointer) — the same move and drop handlers from here on
    const beginAt = (x, y) => {
      mouseDown = true; dragging = false; tabMergeTarget = null;
      startX = x; startY = y;
      initL = element.offsetLeft; initT = element.offsetTop;
      shiftDragStart = -1;
      resetShake({ clientX: x, clientY: y });
    };
    titleBar.addEventListener('mousedown', (e) => {
      // the split button is a button, never a drag handle (split UX R1)
      if (e.target.closest('.window-controls') || e.target.closest('.tab-item') || e.target.closest('.window-icon-stack') || e.target.closest('.tab-split-btn') || e.button !== 0) return;
      beginAt(e.clientX, e.clientY);
      e.preventDefault();
    });

    const processMove = (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;

      // Start dragging only after threshold (prevents click-to-focus from snapping)
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragging = true;
        // Save pre-snap size for restore on un-snap
        if (!win._preSnapBounds) {
          win._preSnapBounds = { width: element.style.width, height: element.style.height, left: element.style.left, top: element.style.top };
        }
        // COORDINATE SPACES (the drag-drift bug, diagnosed from a live trace):
        // e.clientX/Y are VIEWPORT coords; style.left/top are WORKSPACE coords
        // (offset by the sidebar + toolbar). Every "center on cursor" re-anchor
        // must convert — raw clientX landed the window a full sidebar-width
        // away from the pointer whenever the sidebar was open, then it tracked
        // parallel at that offset for the whole drag.
        const wsr = this.workspace.getBoundingClientRect();
        if (win.isMaximized) {
          const prev = win.prevBounds, prevW = parseInt(prev.width) || 700;
          win.isMaximized = false; element.style.width = prev.width; element.style.height = prev.height;
    element.style.left = ((e.clientX - wsr.left) / uiScale() - prevW * ((e.clientX - wsr.left) / (this.workspace.offsetWidth * uiScale()))) + 'px'; element.style.top = '0px';
          initL = element.offsetLeft; initT = element.offsetTop;
          startX = e.clientX; startY = e.clientY;
          // the drag UN-MAXIMIZED the window — say so like every other un-maximize (restore / toggleMaximize): a seamless
          // desktop app's own header bar keeps its maximize / restore state from this (lane B fix r1 — without it the app
          // kept its restore glyph and its next click was dead)
          if (win.onResize) { try { win.onResize(); } catch {} }
        }
        // Restore pre-snap size when dragging out of a snap
        if (win._isSnapped && win._preSnapBounds) {
          const ps = win._preSnapBounds;
          element.style.width = ps.width; element.style.height = ps.height;
          // Center on cursor (in workspace space)
          initL = (e.clientX - wsr.left) / uiScale() - (parseInt(ps.width) || 350) / 2;
          initT = (e.clientY - wsr.top) / uiScale() - 15;
          element.style.left = initL + 'px'; element.style.top = initT + 'px';
          startX = e.clientX; startY = e.clientY;
          win._isSnapped = false;
        }
        element.classList.add('dragging');
        if (this.grid) this.gridOverlay.classList.add('dragging');
      }

      // Recompute against the CURRENT drag base — the un-snap/un-maximize
      // branches above re-anchor initL/startX mid-frame (center on cursor),
      // and applying the dx computed against the OLD startX offset the window
      // by however far the pointer had traveled since mousedown (with rAF
      // coalescing that's the whole first-frame sweep — the reported
      // "snapped window drifts away from the pointer").
      // Deltas arrive in VIEWPORT px; style.left/top are LAYOUT px — under the
      // body DPI zoom (ui scale) they differ by the zoom factor, so an
      // uncompensated delta made the window outrun (or lag) the cursor.
      element.style.left = (initL + (e.clientX - startX) / uiScale()) + 'px';
      element.style.top = (initT + (e.clientY - startY) / uiScale()) + 'px';

      // Shake detection runs on the raw cursor path (before any snap decision).
      updateShake(e);
      if (shakeBadge) { shakeBadge.style.left = (e.clientX / uiScale() + 14) + 'px'; shakeBadge.style.top = (e.clientY / uiScale() - 26) + 'px'; }

      // Live-update this window's rect in the active desktop preview
      if (!deskPreviewTarget) {
        // offsetLeft is LAYOUT px — ratio against offsetWidth (same space),
        // never getBoundingClientRect (viewport px, differs under the DPI zoom)
        const wsW = this.workspace.offsetWidth, wsH = this.workspace.offsetHeight;
        const srcRect = document.querySelector(`.desktop-preview.active .desktop-preview-win[data-win-id="${win.id}"]`);
        if (srcRect && wsW > 0 && wsH > 0) {
          srcRect.style.left = ((element.offsetLeft / wsW) * 100) + '%';
          srcRect.style.top = ((element.offsetTop / wsH) * 100) + '%';
        }
      }

      const snapEnabled = this._settings?.get('layout.enableDragSnap') ?? true;
      const shiftDragEnabled = this._settings?.get('layout.enableShiftDragSelection') ?? true;
      if (!e.altKey && !shakeBypass && snapEnabled) {
        if (e.shiftKey && this.grid && shiftDragEnabled) {
          if (shiftDragStart < 0) shiftDragStart = this._getGridCell(e.clientX, e.clientY);
          const current = this._getGridCell(e.clientX, e.clientY);
          if (shiftDragStart >= 0 && current >= 0) this._showGridRangeHighlight(shiftDragStart, current);
        } else {
          if (shiftDragStart >= 0) { shiftDragStart = -1; this._clearGridHighlight(); }
          if (this.grid) this._showGridHighlight(e.clientX, e.clientY);
          else this._showSnap(e.clientX, e.clientY);
        }
      } else {
        this.snapIndicator.style.display = 'none';
        this._clearGridHighlight();
      }

      // Tab merge hit-test via shared helper (uses elementFromPoint so
      // occluded icons don't match). Pass the dragged window so it's
      // ignored by elementFromPoint.
      const prevTarget = tabMergeTarget;
      tabMergeTarget = this._detectTabMergeTarget(e.clientX, e.clientY, win.id, [element]);
      for (const [, w] of this.windows) w.element.classList.toggle('tab-drop-target', w === tabMergeTarget);
      // split UX R1 (docs/design-split-ux.zh.md): NO split zone — a window drag is move / snap / grid; the merge above is the one exception

      // Collapse window to ghost when over merge target, restore when leaving
      if (tabMergeTarget && !prevTarget) {
        // Entering merge zone — save bounds, hide window, show ghost
        savedBounds = { left: element.style.left, top: element.style.top, width: element.style.width, height: element.style.height };
        element.style.display = 'none';
        mergeGhost = document.createElement('div');
        mergeGhost.className = 'tab-ghost';
        const ghostIcon = win.backendIconSlot?.children.length ? win.backendIconSlot.children[0].cloneNode(true).outerHTML : (win._typeIcon || '');
        mergeGhost.innerHTML = `<span>${ghostIcon}</span><span>${escHtml(win.title)}</span>`;
        document.body.appendChild(mergeGhost);
      } else if (!tabMergeTarget && prevTarget && mergeGhost) {
        // Leaving merge zone — remove ghost, restore window
        mergeGhost.remove(); mergeGhost = null;
        element.style.display = '';
        if (savedBounds) {
          element.style.left = savedBounds.left; element.style.top = savedBounds.top;
          element.style.width = savedBounds.width; element.style.height = savedBounds.height;
          // Re-sync position to cursor (workspace space — see the un-snap note)
          const wr2 = this.workspace.getBoundingClientRect();
          initL = (e.clientX - wr2.left) / uiScale() - (parseInt(savedBounds.width) || 350) / 2;
          initT = (e.clientY - wr2.top) / uiScale() - 15;
          element.style.left = initL + 'px'; element.style.top = initT + 'px';
          startX = e.clientX; startY = e.clientY;
          savedBounds = null;
        }
      }
      if (mergeGhost) {
        mergeGhost.style.left = (e.clientX / uiScale() + 12) + 'px';
        mergeGhost.style.top = (e.clientY / uiScale() + 12) + 'px';
      }

      // Desktop preview: detect hover, collapse window into mini preview inside it
      const prevVis = element.style.visibility;
      element.style.visibility = 'hidden';
      let hoverPreview = document.elementFromPoint(e.clientX, e.clientY)?.closest('.desktop-preview');
      element.style.visibility = prevVis;
      // Stage↔desktop drags are blocked BOTH directions: the stage preview is
      // not a drop target, and stage-view windows (placeholder/hero/aux) never
      // drag out to a desktop preview (real report: an escaped placeholder).
      if (hoverPreview && (hoverPreview.classList.contains('stage-preview')
        || this._app?.stage?.dragToDesktopBlocked?.(win))) hoverPreview = null;

      const prevDeskTarget = deskPreviewTarget;
      deskPreviewTarget = hoverPreview || null;

      if (deskPreviewTarget && !prevDeskTarget) {
        // Entering a desktop preview — hide window, create mini rect inside preview
        deskSavedBounds = { left: element.style.left, top: element.style.top, width: element.style.width, height: element.style.height };
        element.style.visibility = 'hidden';
        element.style.pointerEvents = 'none';
        deskPreviewTarget.classList.add('desktop-preview-drop');
        // Hide this window's rect in the source (active) desktop preview
        const srcRect = document.querySelector(`.desktop-preview.active .desktop-preview-win[data-win-id="${win.id}"]`);
        if (srcRect) srcRect.style.visibility = 'hidden';
        deskMiniWin = document.createElement('div');
        deskMiniWin.className = 'desktop-preview-win desktop-preview-dragging';
        // Size: proportional to window's gridBounds (or default 40%x40%)
        const gb = win.gridBounds || { width: 0.4, height: 0.4 };
        deskMiniWin.style.width = (gb.width * 100) + '%';
        deskMiniWin.style.height = (gb.height * 100) + '%';
        deskPreviewTarget.appendChild(deskMiniWin);
      } else if (!deskPreviewTarget && prevDeskTarget) {
        // Left desktop preview — restore window, remove mini rect
        if (deskMiniWin) { deskMiniWin.remove(); deskMiniWin = null; }
        prevDeskTarget.classList.remove('desktop-preview-drop');
        element.style.visibility = '';
        element.style.pointerEvents = '';
        // Show this window's rect back in the source desktop preview
        const srcRect = document.querySelector(`.desktop-preview.active .desktop-preview-win[data-win-id="${win.id}"]`);
        if (srcRect) srcRect.style.visibility = '';
        if (deskSavedBounds) {
          // workspace space, not viewport — see the un-snap note
          const wr3 = this.workspace.getBoundingClientRect();
          initL = (e.clientX - wr3.left) / uiScale() - (parseInt(deskSavedBounds.width) || 350) / 2;
          initT = (e.clientY - wr3.top) / uiScale() - 15;
          element.style.left = initL + 'px'; element.style.top = initT + 'px';
          element.style.width = deskSavedBounds.width; element.style.height = deskSavedBounds.height;
          startX = e.clientX; startY = e.clientY;
          deskSavedBounds = null;
        }
      } else if (deskPreviewTarget && prevDeskTarget && deskPreviewTarget !== prevDeskTarget) {
        // Moved to a different preview — migrate mini rect
        prevDeskTarget.classList.remove('desktop-preview-drop');
        deskPreviewTarget.classList.add('desktop-preview-drop');
        if (deskMiniWin) deskPreviewTarget.appendChild(deskMiniWin);
      }

      // Position mini window inside preview based on cursor location
      if (deskMiniWin && deskPreviewTarget) {
        const pr = deskPreviewTarget.getBoundingClientRect();
        const gb = win.gridBounds || { width: 0.4, height: 0.4 };
        // Map cursor to 0-1 within preview, center the mini window on cursor
        const rx = Math.max(0, Math.min(1 - gb.width, (e.clientX - pr.left) / pr.width - gb.width / 2));
        const ry = Math.max(0, Math.min(1 - gb.height, (e.clientY - pr.top) / pr.height - gb.height / 2));
        deskMiniWin.style.left = (rx * 100) + '%';
        deskMiniWin.style.top = (ry * 100) + '%';
      }
    };

    // rAF-coalesce mousemove: processMove does 2 elementFromPoint hit-tests
    // (each preceded by a style flip = forced synchronous recalc), a per-window
    // class toggle loop, and several getBoundingClientRect reads. Uncoalesced
    // mousemove fires at pointer rate (125-1000Hz) — with several live chat
    // windows that alone made dragging stutter. One processMove per frame is
    // visually identical (the compositor only paints per frame anyway).
    let pendingMoveEv = null, moveRaf = 0;
    const onMove = (e) => {
      if (!mouseDown) return;
      pendingMoveEv = e;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        const ev = pendingMoveEv; pendingMoveEv = null;
        if (ev && mouseDown) processMove(ev);
      });
    };

    /** The drag's transient chrome, gone (the drop and the cancel share it). */
    const clearDragVisuals = () => {
      element.classList.remove('dragging');
      clearShakeBadge(); // remove the "snap off" indicator (all drop paths below may early-return)
      this.snapIndicator.style.display = 'none';
      for (const [, w] of this.windows) w.element.classList.remove('tab-drop-target');
      if (mergeGhost) { mergeGhost.remove(); mergeGhost = null; }
      document.querySelectorAll('.desktop-preview').forEach(p => p.classList.remove('desktop-preview-drop'));
    };
    // SEAMLESS (round 3 lane B): a drag started from a pointer the app's header bar handed over is fed by POINTER
    // events (the pane cancelled its pointerdown, so the browser sends no compatibility mouse events for that press);
    // they drive the SAME onMove / onUp and are removed with the drag (a per-drag controller, never a per-render one)
    let pointerFeed = null, cancelBounds = null;
    const onUp = (e) => {
      // Cancel any queued frame so processMove can't run after the drop
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; pendingMoveEv = null; }
      if (pointerFeed) { pointerFeed.abort(); pointerFeed = null; }
      cancelBounds = null;
      if (!mouseDown) return;
      mouseDown = false;
      if (!dragging) return;
      dragging = false;
      clearDragVisuals();

      // Desktop preview drop: if we have a mini window inside a preview, commit the move
      if (deskPreviewTarget && deskMiniWin) {
        const dm = this._app?.desktopManager;
        // Resolve the target by the preview's OWN desktop id — never by DOM
        // index: the Stage preview also matches `.desktop-preview` and sits
        // before the real ones, so an index map lands the window one desktop
        // to the right (real report). No id (Stage preview / unknown) ⇒ not a
        // desktop-move drop.
        const targetDeskId = deskPreviewTarget.dataset?.desktopId || null;
        const isOtherDesktop = dm && targetDeskId && dm.desktops.some((d) => d.id === targetDeskId) && targetDeskId !== dm.activeDesktopId;

        if (isOtherDesktop) {
          this._clearGridHighlight(); this.gridOverlay.classList.remove('dragging');
          // Update gridBounds from mini window position for the target desktop
          const ml = parseFloat(deskMiniWin.style.left) / 100;
          const mt = parseFloat(deskMiniWin.style.top) / 100;
          const gb = win.gridBounds || { width: 0.4, height: 0.4 };
          win.gridBounds = { left: ml, top: mt, width: gb.width, height: gb.height };
          deskMiniWin.remove(); deskMiniWin = null; deskPreviewTarget = null;
          element.style.visibility = ''; element.style.pointerEvents = '';
          if (deskSavedBounds) deskSavedBounds = null;
          dm.moveWindowToDesktop(win.id, targetDeskId);
          tabMergeTarget = null; savedBounds = null;
          return;
        }
        // Dropped on current desktop's preview — apply mini rect position
        if (!isOtherDesktop && deskMiniWin) {
          this._clearGridHighlight(); this.gridOverlay.classList.remove('dragging');
          const ml = parseFloat(deskMiniWin.style.left) / 100;
          const mt = parseFloat(deskMiniWin.style.top) / 100;
          const gb = win.gridBounds || { width: 0.4, height: 0.4 };
          win.gridBounds = { left: ml, top: mt, width: gb.width, height: gb.height };
          deskMiniWin.remove(); deskMiniWin = null; deskPreviewTarget = null;
          element.style.visibility = ''; element.style.pointerEvents = '';
          deskSavedBounds = null;
          this._applyGridBounds(win);
          setTimeout(() => { this._captureGridBounds(win); this._notify(); }, 250);
          tabMergeTarget = null; savedBounds = null;
          return;
        }
      }
      // Clean up desktop drag state — restore window to pre-drag position
      if (deskMiniWin) { deskMiniWin.remove(); deskMiniWin = null; }
      if (deskPreviewTarget) deskPreviewTarget.classList.remove('desktop-preview-drop');
      if (deskSavedBounds) {
        element.style.visibility = ''; element.style.pointerEvents = '';
        element.style.left = deskSavedBounds.left; element.style.top = deskSavedBounds.top;
        element.style.width = deskSavedBounds.width; element.style.height = deskSavedBounds.height;
        initL = parseInt(deskSavedBounds.left) || element.offsetLeft;
        initT = parseInt(deskSavedBounds.top) || element.offsetTop;
        deskSavedBounds = null;
      }
      deskPreviewTarget = null;

      // Tab merge takes priority over snap
      if (tabMergeTarget) {
        this._clearGridHighlight(); this.gridOverlay.classList.remove('dragging');
        element.style.display = '';
        if (savedBounds) { element.style.left = savedBounds.left; element.style.top = savedBounds.top; element.style.width = savedBounds.width; element.style.height = savedBounds.height; savedBounds = null; }
        if (tabMergeTarget._tabChain) {
          // Calculate insert position from cursor relative to existing tabs. The
          // strip is in VISUAL order in a split (split UX R3) — map the strip
          // neighbour back to its CHAIN index by window id, never by position.
          const ch = tabMergeTarget._tabChain;
          const tabItems = [...tabMergeTarget.element.querySelectorAll('.tab-item')];
          let before = tabItems.length; // append at end
          for (let i = 0; i < tabItems.length; i++) {
            const r = tabItems[i].getBoundingClientRect();
            if (e.clientX < r.left + r.width / 2) { before = i; break; }
          }
          const prevId = before > 0 ? tabItems[before - 1].dataset.winId : null;
          const insertIdx = prevId ? ch.tabs.indexOf(prevId) : -1;
          this.addToTabChain(ch, win, insertIdx < 0 ? 0 : insertIdx);
        } else {
          this.createTabChain(tabMergeTarget, win);
        }
        this._afterUserMerge(win._tabChain); // the bridge to the explicit second step (split UX R1)
        tabMergeTarget = null;
        return;
      }
      tabMergeTarget = null;
      savedBounds = null;

      const snapEnabled = this._settings?.get('layout.enableDragSnap') ?? true;
      const shiftDragEnabled = this._settings?.get('layout.enableShiftDragSelection') ?? true;
      let snapped = false;
      if (!e.altKey && !shakeBypass && snapEnabled) {
        if (shiftDragStart >= 0 && e.shiftKey && this.grid && shiftDragEnabled) {
          const endCell = this._getGridCell(e.clientX, e.clientY);
          if (endCell >= 0) { this._snapToGridRange(win.id, shiftDragStart, endCell); snapped = true; }
          shiftDragStart = -1;
        } else if (this.grid) {
          this._snapToGrid(win.id, e.clientX, e.clientY); snapped = true;
        } else {
          const snap = this._getSnapZone(e.clientX, e.clientY);
          if (snap) { this._applySnap(win.id, snap); snapped = true; }
        }
      }
      if (snapped) {
        win._isSnapped = true;
      } else {
        // Free drop — clear pre-snap memory
        win._preSnapBounds = null;
        win._isSnapped = false;
      }
      this._clearGridHighlight(); this.gridOverlay.classList.remove('dragging');
      // Re-capture proportional bounds after final position (snap or free drop)
      setTimeout(() => {
        this._captureGridBounds(win);
        if (win._tabChain) this._syncChainBounds(win._tabChain);
        this._scheduleOverlapUpdate(); this._notify();
        if (win.onMoved) { try { win.onMoved(); } catch {} } // a MOVE (no resize): a device-pixel-exact surface re-snaps (the xpra view, 2.369.158)
      }, 250);
    };
    const signal = win._listenerCtl?.signal;
    document.addEventListener('mousemove', onMove, { signal }); document.addEventListener('mouseup', onUp, { signal });
    /** seamless: enter THIS drag from a pointer already down elsewhere (the app's header bar) — `press` = where the
     *  gesture began (the window follows the pointer from there), `at` = where the pointer is now (applied at once). */
    win._beginDragFromPointer = ({ press = null, at = null } = {}) => {
      if (mouseDown) return false;
      const p0 = press || at;
      if (!p0 || !Number.isFinite(p0.clientX) || !Number.isFinite(p0.clientY)) return false;
      cancelBounds = { left: element.style.left, top: element.style.top, width: element.style.width, height: element.style.height, isMaximized: win.isMaximized, prevBounds: win.prevBounds, isSnapped: win._isSnapped };
      beginAt(p0.clientX, p0.clientY);
      pointerFeed = new AbortController();
      const fs = { signal: pointerFeed.signal };
      document.addEventListener('pointermove', onMove, fs);
      document.addEventListener('pointerup', onUp, fs);
      document.addEventListener('pointercancel', () => win._cancelPointerDrag?.(), fs);
      if (at && (at.clientX !== p0.clientX || at.clientY !== p0.clientY)) onMove({ clientX: at.clientX, clientY: at.clientY, altKey: !!at.altKey, shiftKey: !!at.shiftKey, timeStamp: performance.now() });
      return true;
    };
    /** seamless (X's MOVERESIZE_CANCEL): end the drag with NO drop — the window goes back where it was. */
    win._cancelPointerDrag = () => {
      if (!mouseDown) return false;
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; pendingMoveEv = null; }
      if (pointerFeed) { pointerFeed.abort(); pointerFeed = null; }
      mouseDown = false;
      if (dragging) {
        dragging = false;
        clearDragVisuals();
        if (deskMiniWin) { deskMiniWin.remove(); deskMiniWin = null; }
        const srcRect = document.querySelector(`.desktop-preview.active .desktop-preview-win[data-win-id="${win.id}"]`);
        if (srcRect) srcRect.style.visibility = '';
        this._clearGridHighlight(); this.gridOverlay.classList.remove('dragging');
      }
      element.style.display = ''; element.style.visibility = ''; element.style.pointerEvents = '';
      const b = cancelBounds; cancelBounds = null;
      if (b) {
        const wasMax = win.isMaximized;
        element.style.left = b.left; element.style.top = b.top; element.style.width = b.width; element.style.height = b.height; win.isMaximized = b.isMaximized; win.prevBounds = b.prevBounds; win._isSnapped = b.isSnapped;
        if (wasMax !== win.isMaximized && win.onResize) { try { win.onResize(); } catch {} } // a cancel that RE-maximizes says so too
      }
      tabMergeTarget = null; savedBounds = null; deskPreviewTarget = null; deskSavedBounds = null; shiftDragStart = -1;
      return true;
    };
  }

  _snapVal(val, gridLines, threshold) {
    for (const gl of gridLines) {
      if (Math.abs(val - gl) < threshold) return gl;
    }
    return val;
  }

  _getGridLines() {
    if (!this.grid) return { x: [], y: [] };
    const r = { width: this.workspace.offsetWidth, height: this.workspace.offsetHeight }; // layout px (F1)
    const gap = 4;
    const { rows, cols } = this.grid;
    const cw = (r.width - gap * (cols + 1)) / cols;
    const ch = (r.height - gap * (rows + 1)) / rows;
    const x = [], y = [];
    for (let c = 0; c <= cols; c++) x.push(gap + c * (cw + gap));
    for (let rr = 0; rr <= rows; rr++) y.push(gap + rr * (ch + gap));
    return { x, y };
  }

  _setupResize(win) {
    // ONE resize for every start: a handle's mousedown, and (seamless, round 3 lane B) a pointer the app's own window
    // edge handed over (beginResizeFromPointer — fed by pointer events, the pane cancelled its pointerdown)
    const startResize = (dir, sX, sY, { pointer = false, at = null } = {}) => {
        if (win._resizeOp) return false;
        const sW = win.element.offsetWidth, sH = win.element.offsetHeight, sL = win.element.offsetLeft, sT = win.element.offsetTop;
        const sBounds = { left: win.element.style.left, top: win.element.style.top, width: win.element.style.width, height: win.element.style.height };
        const SNAP_T = 15;

        const processMove = (e) => {
          // viewport→layout px under the DPI zoom (see the titlebar-drag note)
          const dx = (e.clientX - sX) / uiScale(), dy = (e.clientY - sY) / uiScale();
          let newL = sL, newT = sT, newW = sW, newH = sH;

          // the window's minimum (the .window floor, or its own — a desktop app's size constraints, 2.369.158):
          // the drag STOPS there, the opposite edge stays put (window-min-size.js)
          const min = this._ownMinOf(win); // capped at the workspace (r2): never a window the screen cannot hold
          if (dir.includes('e')) newW = Math.max(min.w, sW + dx);
          if (dir.includes('w')) { newW = Math.max(min.w, sW - dx); newL = sL + sW - newW; }
          if (dir.includes('s')) newH = Math.max(min.h, sH + dy);
          if (dir.includes('n')) { newH = Math.max(min.h, sH - dy); newT = sT + sH - newH; }

          if (this.grid && !e.altKey) {
            const gl = this._getGridLines();
            if (dir.includes('e')) { const snapped = this._snapVal(newL + newW, gl.x, SNAP_T); newW = snapped - newL; }
            if (dir.includes('w')) { const snapped = this._snapVal(newL, gl.x, SNAP_T); newW = newW + (newL - snapped); newL = snapped; }
            if (dir.includes('s')) { const snapped = this._snapVal(newT + newH, gl.y, SNAP_T); newH = snapped - newT; }
            if (dir.includes('n')) { const snapped = this._snapVal(newT, gl.y, SNAP_T); newH = newH + (newT - snapped); newT = snapped; }
          }

          ({ left: newL, top: newT, width: newW, height: newH } = clampToMin({ left: newL, top: newT, width: newW, height: newH }, dir, min)); // a grid snap never takes it below
          win.element.style.left = newL + 'px'; win.element.style.top = newT + 'px';
          win.element.style.width = newW + 'px'; win.element.style.height = newH + 'px';
          if (win.onResize) win.onResize();
        };
        // rAF-coalesce: win.onResize() per raw mousemove means an xterm fit()
        // reflow at pointer rate while resizing a terminal — cap it per frame.
        let pendingEv = null, raf = 0;
        const onMove = (e) => {
          pendingEv = e;
          if (raf) return;
          raf = requestAnimationFrame(() => { raf = 0; const ev = pendingEv; pendingEv = null; if (ev) processMove(ev); });
        };
        const feed = pointer ? new AbortController() : null;
        const detach = () => {
          win._resizeOp = null;
          if (raf) { cancelAnimationFrame(raf); raf = 0; pendingEv = null; }
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          feed?.abort();
        };
        const onUp = () => {
          detach();
          // Update gridBounds after resize (if window was grid-tracked, keep tracking with new proportions)
          if (win.gridBounds) this._captureGridBounds(win);
          if (win._tabChain) this._syncChainBounds(win._tabChain);
          if (win.onResize) win.onResize();
          this._scheduleOverlapUpdate();
          // Manual resize = new baseline for snap restore
          if (!win._isSnapped) {
            win._preSnapBounds = { width: win.element.style.width, height: win.element.style.height, left: win.element.style.left, top: win.element.style.top };
          }
          this._notify();
        };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        if (feed) {
          document.addEventListener('pointermove', onMove, { signal: feed.signal });
          document.addEventListener('pointerup', onUp, { signal: feed.signal });
          document.addEventListener('pointercancel', () => win._resizeOp?.cancel(), { signal: feed.signal });
        }
        // X's MOVERESIZE_CANCEL: stop with the window back at its size before the gesture
        win._resizeOp = { cancel: () => { detach(); Object.assign(win.element.style, sBounds); if (win.onResize) win.onResize(); return true; } };
        if (at && (at.clientX !== sX || at.clientY !== sY)) processMove({ clientX: at.clientX, clientY: at.clientY, altKey: !!at.altKey });
        return true;
    };
    win._beginResizeFromPointer = (dir, { press = null, at = null } = {}) => {
      const p0 = press || at;
      if (!/^(n|s|e|w|ne|nw|se|sw)$/.test(String(dir)) || !p0 || !Number.isFinite(p0.clientX) || !Number.isFinite(p0.clientY)) return false;
      return startResize(dir, p0.clientX, p0.clientY, { pointer: true, at });
    };
    win.element.querySelectorAll('.resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); e.preventDefault();
        startResize(handle.dataset.dir, e.clientX, e.clientY);
      });
    });
  }

  /** SEAMLESS (round 3 lane B, docs/design-desktop-apps-seamless §3.3): the app's own header bar asked its window
   *  manager to MOVE the window (xpra `initiate-moveresize` direction 8) — enter this window's EXISTING title-bar drag
   *  from the pointer that is already down (grid snap, shake bypass, the tab-merge hit test, the desktop-preview drop:
   *  all as a title-bar drag). `press` / `at` are viewport points ({clientX, clientY}). A tab guest drags its chain's
   *  host (the title bar that carries the chain). Returns whether a drag started. */
  beginDragFromPointer(id, { press = null, at = null } = {}) {
    let win = this.windows.get(id); if (!win) return false;
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) win = this.windows.get(win._tabChain.tabs[0]);
    if (!win || win.isMinimized || typeof win._beginDragFromPointer !== 'function') return false;
    this.focusWindow(win.id);
    return win._beginDragFromPointer({ press, at });
  }
  /** SEAMLESS: …to RESIZE it from an edge (directions 0–7 ⇒ 'nw' 'n' 'ne' 'e' 'se' 's' 'sw' 'w') — the resize handle's
   *  own path (the window's minimum, the grid-line snap, the chain bounds on release). */
  beginResizeFromPointer(id, dir, { press = null, at = null } = {}) {
    let win = this.windows.get(id); if (!win) return false;
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) win = this.windows.get(win._tabChain.tabs[0]);
    if (!win || win.isMinimized || win.isMaximized || typeof win._beginResizeFromPointer !== 'function') return false;
    return win._beginResizeFromPointer(dir, { press, at });
  }
  /** SEAMLESS (MOVERESIZE_CANCEL): end a pointer-started move or resize of this window and put it back. */
  cancelPointerOp(id) {
    let win = this.windows.get(id); if (!win) return false;
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) win = this.windows.get(win._tabChain.tabs[0]);
    if (!win) return false;
    const a = win._cancelPointerDrag ? win._cancelPointerDrag() : false;
    const b = win._resizeOp ? win._resizeOp.cancel() : false;
    return a || b;
  }

  /**
   * A window's OWN minimum size (layout px; 2.369.158 — a desktop-app window from its app's size
   * constraints; null clears it). The terminal's rule, per window: the inline min-width/min-height
   * holds it through snap zones, grid cells, presets, maximize and layout restore (a cell smaller than
   * the minimum leaves the window at its minimum, overlapping the next cell — never squeezed), the
   * resize drag stops at it, and an open window below it is raised NOW (its top-left kept, or slid
   * up/left just enough to stay on the workspace). NEVER LARGER THAN THE WORKSPACE (r2): the minimum is
   * capped at the workspace box and re-capped when the workspace resizes — a minimum the screen cannot
   * hold leaves the content smaller than it wants, and the content scales (the desktop-app view's badge).
   * The ≤768 px phone layout ignores it (style.css) — there the content scales instead.
   */
  setMinSize(id, size) {
    const win = this.windows.get(id); if (!win) return;
    const w = size && Number(size.w) > 0 ? Math.ceil(size.w) : null, h = size && Number(size.h) > 0 ? Math.ceil(size.h) : null;
    if (win.minWidth === w && win.minHeight === h) return;
    win.minWidth = w; win.minHeight = h;
    this._applyOwnMin(win);
  }

  /** The workspace box (layout px) a window's own minimum is capped at; null while the workspace is not laid out. */
  _workspaceBox() {
    const w = this.workspace.offsetWidth, h = this.workspace.offsetHeight;
    return w > 0 && h > 0 ? { w, h } : null;
  }
  /** A window's effective minimum: its own (or the floor), capped at the workspace (window-min-size.js minOf). */
  _ownMinOf(win) { return minOf(win, this._workspaceBox()); }

  /**
   * Apply a window's own minimum: the inline min-width/min-height (the workspace-capped value — re-applied
   * when the workspace resizes, so a larger screen gets the app's full minimum back) and, off the phone
   * layout and unless maximized, a window below it RAISED now and slid inside the workspace when it fits.
   */
  _applyOwnMin(win) {
    const el = win.element, own = !!(win.minWidth || win.minHeight), min = this._ownMinOf(win);
    // measured BEFORE the inline min (which would already report the raised box); a window that is not rendered
    // (minimized = display:none ⇒ offset 0) is judged by its inline size — never "raised" from a zero measurement
    let before = { width: el.offsetWidth, height: el.offsetHeight };
    if (!(before.width > 0) || !(before.height > 0)) before = { width: parseFloat(el.style.width) || Infinity, height: parseFloat(el.style.height) || Infinity };
    const mw = win.minWidth ? `${min.w}px` : '', mh = win.minHeight ? `${min.h}px` : '';
    if (el.style.minWidth !== mw) el.style.minWidth = mw;
    if (el.style.minHeight !== mh) el.style.minHeight = mh;
    if (!own || win.isMaximized || this._mobileLayout()) return;
    const r = raiseToMin(before, min);
    if (!r.raised) return;
    const ws = this._workspaceBox();
    const k = keepInside({ left: el.offsetLeft, top: el.offsetTop, width: r.width, height: r.height }, ws);
    el.style.width = r.width + 'px'; el.style.height = r.height + 'px';
    if (k.moved) { el.style.left = k.left + 'px'; el.style.top = k.top + 'px'; }
    if (win.gridBounds) this._captureGridBounds(win);
    if (win._tabChain) this._syncChainBounds(win._tabChain);
    if (win.onResize) win.onResize();
    this._scheduleOverlapUpdate();
    this._notify();
  }

  // ── Snap Zones ──
  _getSnapZone(cx, cy) {
    const r = this.workspace.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, T = 30;
    if (x < T && y < T) return 'top-left'; if (x > r.width - T && y < T) return 'top-right';
    if (x < T && y > r.height - T) return 'bottom-left'; if (x > r.width - T && y > r.height - T) return 'bottom-right';
    if (x < T) return 'left'; if (x > r.width - T) return 'right';
    if (y < T) return 'top'; if (y > r.height - T) return 'bottom'; return null;
  }
  _getSnapZones(g) {
    const r = { width: this.workspace.offsetWidth, height: this.workspace.offsetHeight }; // layout px (F1)
    return {
      left:{left:g,top:g,width:r.width/2-g*1.5,height:r.height-g*2}, right:{left:r.width/2+g/2,top:g,width:r.width/2-g*1.5,height:r.height-g*2},
      top:{left:g,top:g,width:r.width-g*2,height:r.height/2-g*1.5}, bottom:{left:g,top:r.height/2+g/2,width:r.width-g*2,height:r.height/2-g*1.5},
      'top-left':{left:g,top:g,width:r.width/2-g*1.5,height:r.height/2-g*1.5}, 'top-right':{left:r.width/2+g/2,top:g,width:r.width/2-g*1.5,height:r.height/2-g*1.5},
      'bottom-left':{left:g,top:r.height/2+g/2,width:r.width/2-g*1.5,height:r.height/2-g*1.5}, 'bottom-right':{left:r.width/2+g/2,top:r.height/2+g/2,width:r.width/2-g*1.5,height:r.height/2-g*1.5},
    };
  }
  _showSnap(cx, cy) {
    const zone = this._getSnapZone(cx, cy);
    if (!zone) { this.snapIndicator.style.display = 'none'; return; }
    const z = this._getSnapZones(6)[zone]; const si = this.snapIndicator;
    si.style.display = 'block'; si.style.left = z.left+'px'; si.style.top = z.top+'px'; si.style.width = z.width+'px'; si.style.height = z.height+'px';
  }
  _applySnap(winId, zone) {
    const win = this.windows.get(winId); if (!win) return;
    const z = this._getSnapZones(4)[zone], el = win.element;
    el.classList.add('snap-animating');
    el.style.left=z.left+'px'; el.style.top=z.top+'px'; el.style.width=z.width+'px'; el.style.height=z.height+'px';
    win.isMaximized = false;
    setTimeout(() => { el.classList.remove('snap-animating'); if (win.onResize) win.onResize(); this._captureGridBounds(win); if (win._tabChain) this._syncChainBounds(win._tabChain); }, 220);
  }

  // ── Custom Grid ──
  setGrid(rows, cols) {
    this.grid = rows && cols ? { rows, cols } : null;
    this._renderGridOverlay();
    this._notify();
  }
  _renderGridOverlay() {
    const ov = this.gridOverlay; ov.innerHTML = '';
    if (!this.grid) { ov.classList.remove('active'); return; }
    ov.classList.add('active');
    ov.style.gridTemplateRows = `repeat(${this.grid.rows}, 1fr)`;
    ov.style.gridTemplateColumns = `repeat(${this.grid.cols}, 1fr)`;
    for (let i = 0; i < this.grid.rows * this.grid.cols; i++) {
      const cell = document.createElement('div'); cell.className = 'grid-cell'; cell.dataset.idx = i; ov.appendChild(cell);
    }
  }
  _getGridCell(cx, cy) {
    if (!this.grid) return -1;
    const r = this.workspace.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    const col = Math.floor(x / (r.width / this.grid.cols));
    const row = Math.floor(y / (r.height / this.grid.rows));
    if (col < 0 || col >= this.grid.cols || row < 0 || row >= this.grid.rows) return -1;
    return row * this.grid.cols + col;
  }
  _showGridHighlight(cx, cy) {
    const idx = this._getGridCell(cx, cy);
    this.gridOverlay.querySelectorAll('.grid-cell').forEach((c, i) => c.classList.toggle('highlight', i === idx));
  }
  _clearGridHighlight() { this.gridOverlay.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('highlight')); }

  _snapToGrid(winId, cx, cy) {
    const idx = this._getGridCell(cx, cy); if (idx < 0) return;
    const win = this.windows.get(winId); if (!win) return;
    this._positionToCell(win, idx, true);
    this._captureGridBounds(win); // Track as proportional bounds
  }

  snapActiveToCell(cellIdx) {
    const win = this.windows.get(this.activeWindowId);
    if (!win || !this.grid) return;
    const totalCells = this.grid.rows * this.grid.cols;
    if (cellIdx < 0 || cellIdx >= totalCells) return; // bounds check
    this._positionToCell(win, cellIdx, true);
    setTimeout(() => this._captureGridBounds(win), 250);
  }

  // Snap a window to half the workspace without changing the grid
  snapToHalf(winId, side) {
    const win = this.windows.get(winId); if (!win) return;
    const r = { width: this.workspace.offsetWidth, height: this.workspace.offsetHeight }, g = 4; // layout px (F1)
    const el = win.element;
    const zones = {
      left:   { left: g, top: g, width: r.width / 2 - g * 1.5, height: r.height - g * 2 },
      right:  { left: r.width / 2 + g / 2, top: g, width: r.width / 2 - g * 1.5, height: r.height - g * 2 },
      top:    { left: g, top: g, width: r.width - g * 2, height: r.height / 2 - g * 1.5 },
      bottom: { left: g, top: r.height / 2 + g / 2, width: r.width - g * 2, height: r.height / 2 - g * 1.5 },
    };
    const z = zones[side]; if (!z) return;
    el.classList.add('snap-animating');
    el.style.left = z.left + 'px'; el.style.top = z.top + 'px';
    el.style.width = z.width + 'px'; el.style.height = z.height + 'px';
    win.isMaximized = false;
    setTimeout(() => { el.classList.remove('snap-animating'); if (win.onResize) win.onResize(); this._captureGridBounds(win); if (win._tabChain) this._syncChainBounds(win._tabChain); }, 220);
  }

  _showGridRangeHighlight(startIdx, endIdx) {
    const { cols } = this.grid;
    const r1 = Math.floor(startIdx / cols), c1 = startIdx % cols;
    const r2 = Math.floor(endIdx / cols), c2 = endIdx % cols;
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    this.gridOverlay.querySelectorAll('.grid-cell').forEach((cell, i) => {
      const cr = Math.floor(i / cols), cc = i % cols;
      cell.classList.toggle('highlight', cr >= minR && cr <= maxR && cc >= minC && cc <= maxC);
    });
  }

  _snapToGridRange(winId, startIdx, endIdx) {
    const win = this.windows.get(winId); if (!win || !this.grid) return;
    const { rows, cols } = this.grid;
    const r1 = Math.floor(startIdx / cols), c1 = startIdx % cols;
    const r2 = Math.floor(endIdx / cols), c2 = endIdx % cols;
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);

    const r = { width: this.workspace.offsetWidth, height: this.workspace.offsetHeight }, g = 4; // layout px (F1)
    const cw = (r.width - g * (cols + 1)) / cols;
    const ch = (r.height - g * (rows + 1)) / rows;

    const el = win.element;
    el.classList.add('snap-animating');
    el.style.left = (g + minC * (cw + g)) + 'px';
    el.style.top = (g + minR * (ch + g)) + 'px';
    el.style.width = ((maxC - minC + 1) * (cw + g) - g) + 'px';
    el.style.height = ((maxR - minR + 1) * (ch + g) - g) + 'px';
    win.isMaximized = false;
    setTimeout(() => { el.classList.remove('snap-animating'); if (win.onResize) win.onResize(); this._captureGridBounds(win); if (win._tabChain) this._syncChainBounds(win._tabChain); }, 220);
  }

  _positionToCell(win, idx, animate) {
    if (!this.grid) return;
    const r = { width: this.workspace.offsetWidth, height: this.workspace.offsetHeight }, g = 4; // layout px (F1)
    const { rows, cols } = this.grid;
    const row = Math.floor(idx / cols), col = idx % cols;
    const cw = (r.width - g * (cols + 1)) / cols, ch = (r.height - g * (rows + 1)) / rows;
    const el = win.element;
    if (animate) el.classList.add('snap-animating');
    el.style.left = (g + col * (cw + g)) + 'px'; el.style.top = (g + row * (ch + g)) + 'px';
    el.style.width = cw + 'px'; el.style.height = ch + 'px';
    win.isMaximized = false;
    if (animate) setTimeout(() => { el.classList.remove('snap-animating'); if (win.onResize) win.onResize(); }, 220);
    else if (win.onResize) win.onResize();
  }

  // ── Layout Presets ──
  focusWindow(id, { bounce = false, _stageBypass = false } = {}) {
    const win = this.windows.get(id); if (!win) return;
    // Dynamic desktop (Stage): while the stage view is active, focusing a
    // session window MATERIALIZES it into the slot instead (the one choke
    // point every switch-to-session path funnels through — sidebar, taskbar,
    // palette, find/goto, createWindow's trailing focus). _stageBypass lets
    // the stage itself raise the hero without recursing.
    if (!_stageBypass && this._app?.stage?.shouldIntercept(win)) {
      this._app.stage.materialize(win);
      return;
    }
    this._mobileYieldSidebar();
    // If this window is a grouped guest, focus the host and switch to this tab
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) {
      const idx = win._tabChain.tabs.indexOf(win.id);
      if (idx >= 0) this.switchTab(win._tabChain, idx);
      const hostId = win._tabChain.tabs[0];
      const host = this.windows.get(hostId);
      if (host) {
        this.windows.forEach(w => w.element.classList.remove('window-active', 'highlight-subtle', 'highlight-strong'));
        host.element.style.zIndex = this.zIndex++; host.element.classList.add('window-active');
        const intensity = this._settings?.get('window.activeHighlightIntensity') ?? 'normal';
        if (intensity === 'subtle') host.element.classList.add('highlight-subtle');
        else if (intensity === 'strong') host.element.classList.add('highlight-strong');
      }
      this.activeWindowId = id; this.syncHiddenViews(); this._notify();
      return;
    }
    this.windows.forEach(w => w.element.classList.remove('window-active', 'highlight-subtle', 'highlight-strong'));
    if (this.zIndex > 9000) this._normalizeZIndices();
    win.element.style.zIndex = this.zIndex++; win.element.classList.add('window-active');
    const intensity = this._settings?.get('window.activeHighlightIntensity') ?? 'normal';
    if (intensity === 'subtle') win.element.classList.add('highlight-subtle');
    else if (intensity === 'strong') win.element.classList.add('highlight-strong');
    this.activeWindowId = id; this.syncHiddenViews(); this._notify();
    if (bounce && (this._settings?.get('window.enableBounceOnFocus') ?? false)) {
      win.element.classList.remove('window-bounce');
      requestAnimationFrame(() => win.element.classList.add('window-bounce'));
      setTimeout(() => win.element.classList.remove('window-bounce'), 300);
    }
  }
  /** TELL EVERY CHAT VIEW WHICH HIDERS HOLD ITS WINDOW OFF-SCREEN (inc-mu6bfv1t-4drq,
   *  owner: "每次手机上切对话都会滚到对话历史里"). The desktop model suspends a hidden
   *  view (visibility:hidden, desktop-manager); the three display:none hiders
   *  this manager owns — the mobile inactive window, a grouped guest's hidden
   *  tab, a minimized window — never did, and display:none also ZEROES the
   *  scroller's scrollTop: the view then read "scrolled to the top, no input",
   *  unpinned, paged history in and trimmed the live tail (captured 3/3
   *  windows). ONE derivation (src/lib/view-visibility.js) over the classes
   *  this manager writes, called at every site that changes them (focus, tab
   *  switch, minimize/restore, a view registering, the breakpoint flipping);
   *  the view keeps a reason SET so the desktop hider and these compose. */
  syncHiddenViews() {
    const app = this._app; if (!app?.sessions) return;
    const mobile = this._mobileLayout();
    for (const w of this.windows.values()) {
      const sess = app.sessions.get(w.id);
      if (!sess || typeof sess.setHidden !== 'function') continue;
      const top = (w._tabChain && this.windows.get(w._tabChain.tabs[0])) || w; // a guest is displayed through its host
      // §4.6: on the narrow layout a split shows only its focused pane (CSS) — the other pane is a hidden tab
      const narrowHidden = !!(mobile && w._tabChain && w._tabChain.layout === 'split' && !displayedPanes(w._tabChain, { narrow: true }).includes(w.id));
      const reasons = hiddenReasons({
        mobile,
        active: !!top.element?.classList?.contains('window-active'),
        tabHidden: !!w.content?.classList?.contains('tab-hidden') || narrowHidden,
        minimized: !!top.isMinimized,
      });
      for (const r of HIDE_REASONS) { try { sess.setHidden(r, reasons[r]); } catch { } }
    }
  }

  // Move mode: window attaches to cursor, click to place (for recovering off-screen windows)
  startMoveMode(id) {
    const win = this.windows.get(id); if (!win) return;
    if (win.isMinimized) this.restore(id);
    this.focusWindow(id);
    const el = win.element;

    // Restore from maximized state (same as normal drag-out-of-maximize)
    if (win.isMaximized && win.prevBounds) {
      win.isMaximized = false;
      el.style.width = win.prevBounds.width; el.style.height = win.prevBounds.height;
    }
    // Restore from snapped state
    if (win._isSnapped && win._preSnapBounds) {
      el.style.width = win._preSnapBounds.width; el.style.height = win._preSnapBounds.height;
      win._isSnapped = false;
    }
    if (win.onResize) win.onResize();

    // Full-screen overlay blocks all other interaction during move
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;cursor:move';
    document.body.appendChild(overlay);
    el.style.zIndex = '99999'; // above overlay
    el.style.pointerEvents = 'none';

    const wr = this.workspace.getBoundingClientRect();
    // rAF-coalesced like every other drag path (project invariant): raw
    // mousemove fires at pointer rate and this handler interleaves layout
    // reads (offsetWidth/offsetLeft) with style writes — uncoalesced it
    // thrashed layout at up to 1000Hz (audit round-3). The preview rect is
    // resolved ONCE per move session, not per event.
    const srcRect = document.querySelector(`.desktop-preview.active .desktop-preview-win[data-win-id="${win.id}"]`);
    let pendingEv = null, rafId = null;
    const processMove = () => {
      rafId = null;
      const e = pendingEv; if (!e) return;
      pendingEv = null;
      const w = el.offsetWidth || parseInt(el.style.width) || 350;
      // workspace-relative (pre-existing 2.100.3-class bug, review-flagged:
      // absolute clientX dropped the window a sidebar-width right)
      el.style.left = ((e.clientX - wr.left) / uiScale() - w / 2) + 'px';
      el.style.top = ((e.clientY - wr.top) / uiScale() - 15) + 'px';
      // Live-update desktop preview rect (layout-px ratio — see the drag note)
      const mwW = this.workspace.offsetWidth, mwH = this.workspace.offsetHeight;
      if (mwW > 0 && mwH > 0 && srcRect) {
        srcRect.style.left = ((el.offsetLeft / mwW) * 100) + '%';
        srcRect.style.top = ((el.offsetTop / mwH) * 100) + '%';
      }
    };
    const onMove = (e) => {
      pendingEv = e;
      if (!rafId) rafId = requestAnimationFrame(processMove);
    };
    const onClick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      pendingEv = null;
      overlay.remove();
      el.style.pointerEvents = '';
      el.style.zIndex = this.zIndex++;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onClick, true);
      this._captureGridBounds(win);
      this._notify();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onClick, true);
  }

  toggleMaximize(id) {
    let win = this.windows.get(id); if (!win) return;
    // For grouped guests, operate on host
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) {
      win = this.windows.get(win._tabChain.tabs[0]);
      if (!win) return;
    }
    const el = win.element;
    if (win.isMaximized) { const p = win.prevBounds; el.style.left=p.left; el.style.top=p.top; el.style.width=p.width; el.style.height=p.height; win.isMaximized = false; }
    else { win.prevBounds={left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height}; el.style.left='0';el.style.top='0';el.style.width='100%';el.style.height='100%'; win.isMaximized = true; }
    setTimeout(() => {
      if (win.onResize) win.onResize();
      this._captureGridBounds(win);
      if (win._tabChain) this._syncChainBounds(win._tabChain);
    }, 50); this._notify(); this._scheduleOverlapUpdate();
  }
  /** Is the ≤768px layout in force? (one lazily-built matchMedia, shared
   *  with syncHiddenViews so the two never disagree about the breakpoint) */
  _mobileLayout() {
    if (!this._hideMq && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        this._hideMq = window.matchMedia('(max-width: 768px)');
        this._hideMq.addEventListener?.('change', () => this.syncHiddenViews());
      } catch { this._hideMq = null; }
    }
    return !!this._hideMq?.matches;
  }
  minimize(id) {
    let win = this.windows.get(id); if (!win) return;
    // For grouped guests, minimize the host
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) {
      win = this.windows.get(win._tabChain.tabs[0]);
      if (!win) return;
    }
    win.element.style.display='none'; win.isMinimized=true;
    // ≤768px (docs/design-mobile-gaps.md #10/#23, verifier r2): the TRUTH is
    // kept on every client — `isMinimized` rides captureState, so the phone's
    // next layout save says min:true like the desktop that asked. (The r1
    // guard REFUSED the minimize here instead; the phone then carried
    // min:false and its next save RESTORED every window a desktop client had
    // minimized — measured across two CDP clients.) What the phone changes is
    // only what IT displays: `.window.window-active {display:flex !important}`
    // beats the inline display:none, so a minimized ACTIVE window must also
    // stop being active — show the most recently used remaining one (or
    // nothing), exactly closeWindow's rule. The switcher's Minimized section
    // is the restore path; a window that cannot be shown is still carried.
    if (this._mobileLayout() && win.element.classList.contains('window-active')) this._focusMostRecent(win.id);
    this.syncHiddenViews(); this._notify(); this._scheduleOverlapUpdate();
  }
  /** Focus the most recently used window that can be displayed (highest
   *  z-index; never a guest, a minimized one, or one hidden by a desktop or
   *  the stage) — the ONE rule closeWindow and the phone's minimize share.
   *  `excludeId` = the window that just left the screen (its class is
   *  cleared here so `.window-active` cannot keep it displayed ≤768px). */
  _focusMostRecent(excludeId = null) {
    const ex = excludeId ? this.windows.get(excludeId) : null;
    ex?.element.classList.remove('window-active', 'highlight-subtle', 'highlight-strong');
    this.activeWindowId = null;
    let best = null, bestZ = -1;
    for (const [wid, w] of this.windows) {
      if (wid === excludeId || w._hiddenByDesktop || w._hiddenByStage || w.isMinimized) continue;
      if (w._tabChain && w._tabChain.tabs[0] !== w.id) continue; // skip tab guests
      const z = parseInt(w.element.style.zIndex) || 0;
      if (z > bestZ) { best = wid; bestZ = z; }
    }
    if (best) this.focusWindow(best);
  }
  restore(id) {
    let win = this.windows.get(id); if (!win) return;
    // For grouped guests, restore the host
    if (win._tabChain && win._tabChain.tabs[0] !== win.id) {
      win = this.windows.get(win._tabChain.tabs[0]);
      if (!win) return;
    }
    win.element.style.display=''; win.isMinimized=false; this.focusWindow(id); setTimeout(() => { if (win.onResize) win.onResize(); this._captureGridBounds(win); }, 50); this._scheduleOverlapUpdate();
  }
  /** Re-key a window to a different unique id (stage identity adoption: a
   *  session window created locally must CONVERGE onto the winId other
   *  clients/desktop records already use for that session — same precedent as
   *  the layout-restore ID remap; all UI references read winInfo.id live).
   *  Safe only for chain-less windows; returns false when it can't rekey. */
  rekeyWindow(oldId, newId) {
    const win = this.windows.get(oldId);
    if (!win || !newId || newId === oldId || this.windows.has(newId) || win._tabChain) return false;
    this.windows.delete(oldId);
    win.id = newId;
    this.windows.set(newId, win);
    const sess = this._app?.sessions?.get(oldId);
    if (sess) { this._app.sessions.delete(oldId); this._app.sessions.set(newId, sess); }
    this._app?.updateTaskbar?.();
    return true;
  }

  /** A USER'S close (the title-bar ✕, a tab ✕, the taskbar menu, Ctrl+\\ x, the phone nav ✕): the window may answer
   *  first — `winInfo.onCloseRequest()` returning false keeps it (round 3 A2: a desktop-app window asks its APP to
   *  close, docs/design-desktop-apps-seamless §3.2). Programmatic closes (layout sync, a window closing itself) call
   *  closeWindow directly and are never vetoed. Returns true when the window closed. */
  requestClose(id) {
    const win = this.windows.get(id); if (!win) return false;
    if (typeof win.onCloseRequest === 'function') {
      let go = true;
      try { go = win.onCloseRequest() !== false; } catch (e) { console.warn('[window] onCloseRequest threw — closing', e); }
      if (!go) return false;
    }
    this.closeWindow(id);
    return true;
  }
  closeWindow(id) {
    this._app?.stage?.onWindowClosed(id);
    // A user-closed window must die in every cached desktop record too —
    // switchTo's merge-preserve (2.141.1) cannot tell "closed" from "not yet
    // materialized" (both openSpec-backed + absent from wm.windows), so stale
    // records resurrected every closed window on the next desktop round-trip
    // (2.151.1 real report: 关闭→切桌面→切回来→窗口复活成history状态).
    this._app?.desktopManager?.purgeClosedWindow(id);
    const win = this.windows.get(id); if (!win) return;
    win._listenerCtl?.abort(); // release document-level drag/icon listeners
    if (win._tabChain) {
      this.removeFromTabChain(win._tabChain, id);
      // onClose fires inside removeFromTabChain
      return;
    }
    if (win.onClose) win.onClose(); win.element.remove(); this.windows.delete(id);
    // If closed window was active, focus the most recently used remaining window (highest z-index)
    if (this.activeWindowId === id) this._focusMostRecent();
    this._notify(); this._scheduleOverlapUpdate();
  }
  setTitle(id, t) {
    const win = this.windows.get(id); if (!win) return;
    if (win.title === t) return; // no-op guard: called per 5s identity sync for every window
    win.title = t; win.titleSpan.textContent = t;
    // Update tab label if in a chain
    if (win._tabChain) {
      const host = this.windows.get(win._tabChain.tabs[0]);
      if (host) {
        const tabEl = host.titleBar.querySelector(`.tab-item[data-win-id="${id}"] .tab-label`);
        if (tabEl) tabEl.textContent = t;
      }
    }
    this._fitChipsSoon(win); // a new title may need the room the billing chip holds (or give it back)
    this._notify();
  }

  /** THE OWNERSHIP BADGE (agent browser P7, §4.6): `{ dots: [{ color, name, sessionId }] }`
   *  — the session(s) a window belongs to, drawn on the standalone title bar
   *  (a sibling after the title span; setTitle wipes the span's children) and
   *  on the window's TAB when grouped (rendered by _renderTabBar from
   *  `win._ownerBadge`). Colours are per-SESSION (chain-layout.ownerColor),
   *  never the task-group colour. null removes it. */
  setOwnerBadge(id, badge) {
    const win = this.windows.get(id); if (!win) return;
    const dots = badge && Array.isArray(badge.dots) ? badge.dots.filter(Boolean) : [];
    const key = dots.map((d) => `${d.color || ''}:${d.name || ''}`).join('|');
    win._ownerBadge = dots.length ? { dots } : null;
    let el = win.titleBar.querySelector(':scope > .win-owner-badge');
    if (!dots.length) { el?.remove(); }
    else if (!el || el.dataset.key !== key) {
      const fresh = this._ownerBadgeEl(win._ownerBadge);
      fresh.dataset.key = key;
      if (el) el.replaceWith(fresh); else win.titleSpan.insertAdjacentElement('afterend', fresh);
    }
    if (win._tabChain && win._ownerBadgeKey !== key) this._renderTabBar(win._tabChain);
    else if (win._ownerBadgeKey !== key) this._fitChipsSoon(win); // the title and the billing chip share what is left
    win._ownerBadgeKey = key;
  }

  /** THE MINI INBOX BADGE (design-user-inbox-reply §3, chunk 3) — setOwnerBadge's
   *  twin: `{ count, urgency }` = the open For-you ACTION items of the session
   *  this window shows (the panel module computes it after every broadcast and
   *  calls this; count 0 / null removes it). A `.win-inbox-badge` <button> is a
   *  SIBLING after the title span (setTitle writes the span's textContent), keyed
   *  `count:urgency` so an unchanged badge is never rebuilt; grouped in a tab
   *  chain it rides the window's TAB (_renderTabBar) and no standalone bar shows
   *  it. A click opens the session's mini inbox (app.openMiniInbox). */
  setInboxBadge(id, badge) {
    const win = this.windows.get(id); if (!win) return;
    const count = badge && Number.isFinite(Number(badge.count)) ? Math.max(0, Math.floor(Number(badge.count))) : 0;
    const urgency = count ? String((badge && badge.urgency) || 'normal') : '';
    const key = count ? `${count}:${urgency}` : '';
    win._inboxBadge = count ? { count, urgency } : null;
    this._placeInboxBadge(win);
    if (win._tabChain && (win._inboxBadgeKey || '') !== key) this._renderTabBar(win._tabChain);
    win._inboxBadgeKey = key;
  }

  /** Put (or take off) the STANDALONE title-bar badge for `win`: none while the
   *  window is in a tab chain (the tab carries it), none at 0, rebuilt only when
   *  its key changed. Called by setInboxBadge and whenever a chain dissolves. */
  _placeInboxBadge(win) {
    if (!win) return;
    const el = win.titleBar.querySelector(':scope > .win-inbox-badge');
    const b = win._inboxBadge;
    if (!b || win._tabChain) { if (el) { el.remove(); if (!win._tabChain) this._fitChipsSoon(win); } return; }
    const key = `${b.count}:${b.urgency}`;
    if (el && el.dataset.key === key) return;
    const fresh = this._inboxBadgeEl(win.id, b);
    if (el) el.replaceWith(fresh); else win.titleSpan.insertAdjacentElement('afterend', fresh);
    this._fitChipsSoon(win); // the title and the billing chip share what is left
  }

  // Billing identity indicator in the TITLE BAR (mirrors the session card's
  // amber key badge): API-billed sessions show a key, unknown live ones a
  // dashed '?', subscription stays quiet. Synced from active-sessions via
  // app.syncSessionIdentity — auth can land seconds after window creation
  // (the CLI's init record) or change across a resume.
  setAuthBadge(id, auth) {
    const win = this.windows.get(id); if (!win) return;
    const key = auth ? `${auth.source}:${auth.name || ''}:${auth.poolTarget || ''}:${auth.hostName || ''}:${auth.guessed ? 1 : 0}` : '';
    win._authBadge = auth; // kept for re-apply after tab-bar rebuilds
    // No-op guard, but SELF-HEALING: tab-bar re-renders (switch/merge/detach/
    // drag) rebuild the tab DOM and destroy the badge span — with a pure key
    // guard it never came back until the billing identity changed (real
    // report: badges flaky on tabbed windows). Verify the badge actually
    // exists where it should before skipping.
    if (win._authBadgeKey === key) {
      if (!key) return;
      const there = win._tabChain
        ? !!this.windows.get(win._tabChain.tabs[0])?.titleBar.querySelector(`.tab-item[data-win-id="${id}"] .win-auth-badge`)
        : !!win.titleBar.querySelector(':scope > .win-auth-badge');
      if (there) return;
    }
    win._authBadgeKey = key;
    const KEY_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="8" r="3"/><path d="M8 8h6.5M12 8v2.5M14.5 8v2"/></svg>';
    const POOL_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5c1.5 1 4 1 6 0s4.5-1 6 0M2 8.5c1.5 1 4 1 6 0s4.5-1 6 0M2 11.5c1.5 1 4 1 6 0s4.5-1 6 0"/></svg>';
    // the subscription chip had no glyph (a name is its whole face) — its ICON form needs one: the sidebar card's crown
    const CROWN_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12.5h11M3 12.5L2 4.5l3.2 2.6L8 3l2.8 4.1L14 4.5l-1 8z"/></svg>';
    // Standalone: SIBLING right after the title span (setTitle wipes
    // titleSpan's children via textContent — same reason the bell icon
    // re-inserts). Tab group: sibling of the tab's label inside the tab item.
    const applyAfter = (anchorEl) => {
      if (!anchorEl || !anchorEl.parentElement) return;
      let el = anchorEl.parentElement.querySelector(':scope > .win-auth-badge');
      // ALWAYS render for a billed session (2.71.0 — the old badge only marked
      // API/unknown, so subscription windows showed nothing and you couldn't
      // tell which account a window bills to without the sidebar).
      if (!auth) { el?.remove(); return; }
      if (!el) {
        el = document.createElement('span');
        el.className = 'win-auth-badge';
        anchorEl.insertAdjacentElement('afterend', el);
      }
      const isApi = auth.source === 'api-key' || auth.source === 'api-console' || auth.source === 'api-other';
      const isUnknown = auth.source === 'unknown';
      const isPooled = auth.source === 'pooled';
      el.classList.toggle('unknown', isUnknown);
      el.classList.toggle('pooled', isPooled);
      el.classList.toggle('sub', !isApi && !isUnknown && !isPooled);
      // A remote session's CLI login is the HOST's, not this machine's — name
      // the machine on the chip and in the tooltip (2.188.0: a remote host-
      // login window was indistinguishable from a local one, and the tooltip's
      // "machine's own" pointed at the wrong box).
      const hn = auth.hostName;
      const machineTip = hn ? t('"{name}"’s own CLI login', { name: hn }) : t("The machine's own CLI login");
      let tip;
      // THE TITLE WINS (lane G, the owner 2026-09-25: "这个全部->UCI Max占据了绝大部分空间，都看不到窗口标题了"):
      // the chip carries all three of its forms — full (every word), compact (the glyph + the member's
      // SHORT name), icon (the glyph) — and CSS shows the one `_fitChip` picked for the room the title
      // leaves (PURE src/lib/title-chips.js). The words any form drops lead the tooltip, and the
      // click still opens the switcher that names them all.
      const glyph = (svg) => `<span class="wab-glyph">${svg}</span>`;
      let words;
      if (isPooled) {
        // Pooled pseudo-account: a distinct chip (never the API key), naming
        // the POOL + the real account it currently bills (inline if room, else
        // the tooltip carries it) — real report: pooled sessions read as API.
        const poolName = auth.name || t('Pool');
        words = chipWords({ name: poolName, target: auth.poolTarget || '' });
        const tgt = auth.poolTarget ? escHtml(auth.poolTarget) : '';
        el.innerHTML = glyph(POOL_SVG) + `<span class="wab-name">${escHtml(poolName)}</span>${tgt ? `<span class="wab-pool-tgt"> → ${tgt}</span>` : ''}<span class="wab-short">${escHtml(words.short)}</span>`;
        tip = words.full + ' · ' + t('Pooled account') + (auth.poolTarget ? '' : ' · ' + t('no target')) + (hn ? ' · ' + t('on "{name}"', { name: hn }) : '');
      } else if (isApi) {
        const nm = auth.name || (auth.source === 'api-console' ? 'Console' : 'API');
        words = chipWords({ name: nm });
        el.innerHTML = glyph(KEY_SVG) + `<span class="wab-name">${escHtml(nm)}</span><span class="wab-short">${escHtml(words.short)}</span>`;
        tip = t('API billing (pay per use)') + ` — ${auth.source === 'api-console' ? t('Console login') : (auth.name ? auth.name + (auth.tail ? ' (…' + auth.tail + ')' : '') : (auth.detail || t('API key')))}${hn ? ' · ' + t('on "{name}"', { name: hn }) : ''}${auth.guessed ? ' · ' + t('estimated from the login state at spawn') : ''}`;
      } else if (isUnknown) {
        words = { full: '', short: '' };
        el.innerHTML = glyph(KEY_SVG) + '?';
        tip = t('Billing identity unknown (started before tracking)');
      } else {
        const label = auth.name || (hn ? t('CLI login') + ' @ ' + hn : t('CLI login'));
        words = chipWords({ name: label });
        el.innerHTML = glyph(CROWN_SVG) + `<span class="wab-name">${escHtml(label)}</span><span class="wab-short">${escHtml(words.short)}</span>`;
        tip = words.full + ' · ' + (auth.source === 'codex-subscription' ? t('ChatGPT account') + (hn ? ' · ' + t('on "{name}"', { name: hn }) : '')
          : auth.source === 'codex-cli' ? machineTip
          : auth.name ? t('Subscription account') + (hn ? ' · ' + t('on "{name}"', { name: hn }) : '') : machineTip)
          + (auth.guessed ? ' · ' + t('estimated from the login state at spawn') : '');
      }
      el.dataset.tip = tip + ' · ' + t('Click to switch billing');
      // the new words need new measurements; the form it had is kept until the next frame decides (no flash of the full chip on every tab-bar rebuild)
      el.dataset.words = (isPooled ? 'pooled' : isApi ? 'api' : isUnknown ? 'unknown' : 'sub') + '\n' + words.full + '\n' + words.short;
      setChipMode(el, win._chipMode || 'full');
      el.onclick = (e) => { e.stopPropagation(); this.app?.showBillingSwitcher?.(id, el); };
      this._fitChipsSoon(win);
    };
    if (win._tabChain) {
      // Grouped: the badge lives ONLY on this window's tab item. A leftover
      // standalone badge (inserted before the merge) reads as a meaningless
      // "global" chip to the left of the tabs (real report) — remove it.
      const host = this.windows.get(win._tabChain.tabs[0]);
      host?.titleBar.querySelector(':scope > .win-auth-badge')?.remove();
      win.titleBar.querySelector(':scope > .win-auth-badge')?.remove();
      const tabEl = host?.titleBar.querySelector(`.tab-item[data-win-id="${id}"] .tab-label`);
      applyAfter(tabEl);
    } else if (win.titleSpan.parentElement === win.titleBar) {
      applyAfter(win.titleSpan);
    }
  }

  // ── THE TITLE WINS (lane G, 2026-09-25) ─────────────────────────────────────
  // The billing chip's FORM is decided per title bar (a standalone window) or
  // per TAB (a grouped one) by the PURE rule src/lib/title-chips.js from
  // measured widths, all in LAYOUT px (offsetWidth + a canvas text measure —
  // never a viewport rect, so the UI scale never enters): the room the label
  // and the chip share = the label's width + the chip's width as drawn now,
  // less any overflow (the same number whatever form is showing ⇒ no
  // oscillation). Re-decided in ONE frame per burst: on a new chip / words
  // (setAuthBadge — the pool broadcast arrives through it), a new title
  // (setTitle, setTitleMeta), a sibling badge placed or removed, and a resize
  // of the host's title bar (ONE ResizeObserver for every bar; the tab strip
  // lives inside the bar and only changes with it or with a re-render, which
  // re-applies the chips). A bar not laid out (the ≤768 px phone layout hides
  // title bars; a minimized window) keeps the form it has.

  /** Re-decide the chip forms on `win`'s visible bar (its chain host's strip when grouped) in the next frame. */
  _fitChipsSoon(win) {
    if (!win || typeof requestAnimationFrame !== 'function') return;
    const host = win._tabChain ? this.windows.get(win._tabChain.tabs[0]) : win;
    if (!host || !host.titleBar?.querySelector('.win-auth-badge')) return; // a bar with no billing chip has nothing to decide (and is never observed)
    this._observeChipBar(host);
    (this._chipFitIds ||= new Set()).add(host.id);
    if (this._chipFitRaf) return;
    this._chipFitRaf = requestAnimationFrame(() => {
      this._chipFitRaf = 0;
      const ids = [...this._chipFitIds]; this._chipFitIds.clear();
      for (const hid of ids) { const w = this.windows.get(hid); if (w) this._fitChipsOf(w); }
    });
  }

  /** ONE ResizeObserver over every host title bar that carries a chip; unobserved when the window closes. */
  _observeChipBar(host) {
    if (typeof ResizeObserver !== 'function' || !host?.titleBar || host._chipObserved) return;
    if (!this._chipRO) {
      this._chipROHost = new WeakMap();
      this._chipRO = new ResizeObserver((entries) => {
        for (const en of entries) { const w = this.windows.get(this._chipROHost.get(en.target)); if (w) this._fitChipsSoon(w); }
      });
    }
    host._chipObserved = true;
    this._chipROHost.set(host.titleBar, host.id);
    this._chipRO.observe(host.titleBar);
    host._listenerCtl?.signal?.addEventListener('abort', () => { this._chipRO.unobserve(host.titleBar); host._chipObserved = false; }, { once: true });
  }

  /** Decide every chip on `win`'s host bar now: each TAB of a chain, else the standalone title bar. */
  _fitChipsOf(win) {
    const host = win._tabChain ? this.windows.get(win._tabChain.tabs[0]) : win;
    if (!host) return;
    if (host._tabChain) {
      for (const tab of host.titleBar.querySelectorAll(':scope > .tab-bar-tabs > .tab-item')) {
        const chip = tab.querySelector(':scope > .win-auth-badge');
        if (chip) this._fitChip(tab, tab.querySelector(':scope > .tab-label'), chip, this.windows.get(tab.dataset.winId));
      }
    } else {
      const chip = host.titleBar.querySelector(':scope > .win-auth-badge');
      if (chip) this._fitChip(host.titleBar, host.titleSpan, chip, host);
    }
  }

  /** One chip beside one label inside `box` (a .tab-item or a standalone .window-titlebar). */
  _fitChip(box, label, chip, owner) {
    if (!box || !label || !chip || !box.isConnected || !box.offsetWidth) return; // not laid out: keep the form it has
    const w = this._chipWidths(chip, owner);
    if (!w) return;
    const deficit = Math.max(0, box.scrollWidth - box.clientWidth); // an overflowing box: the chip cannot have what is clipped
    const availablePx = label.offsetWidth + chip.offsetWidth - deficit;
    const tw = this._titleWidths(label);
    const mode = chipMode({ availablePx, titlePx: tw.full, titleMinPx: tw.min, chipFullPx: w.full, chipCompactPx: w.compact });
    if (chip.dataset.mode !== mode) setChipMode(chip, mode);
    if (owner) owner._chipMode = mode;
  }

  /** The chip's natural width in each form (layout px), measured once per set of words and place
   *  (a tab's chip is drawn smaller than a title bar's) — kept on the WINDOW, because a chain's tab
   *  bar is rebuilt (and its chips re-created) on every identity sync. */
  _chipWidths(chip, owner) {
    const key = (chip.dataset.words || '') + '\n' + (chip.parentElement?.classList.contains('tab-item') ? 'tab' : 'bar');
    const holder = owner || chip;
    if (holder._chipFitW && holder._chipFitW.key === key) return holder._chipFitW;
    const cur = chip.dataset.mode || 'full';
    const out = { key };
    for (const m of CHIP_MODES) { setChipMode(chip, m); out[m] = chip.offsetWidth; }
    setChipMode(chip, cur);
    if (!(out.full > 0)) return null; // not rendered yet — measured on a later pass
    holder._chipFitW = out;
    return out;
  }

  /** The title's natural width and the width that shows its first TITLE_MIN_CHARS characters + the
   *  ellipsis (layout px, the label's own computed font; +2 px for the box's rounding). */
  _titleWidths(label) {
    const text = label.textContent || '';
    const cs = getComputedStyle(label);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const c = label._fitT;
    if (c && c.text === text && c.font === font) return c;
    const ctx = (this._chipMeasureCtx ||= document.createElement('canvas').getContext('2d'));
    if (!ctx) return { text, font, full: 0, min: 0 };
    ctx.font = font;
    const full = Math.ceil(ctx.measureText(text).width);
    const minText = titleMinText(text);
    const min = minText === text.replace(/\s+/g, ' ').trim() ? full : Math.ceil(ctx.measureText(minText).width) + 2; // a title that short shows whole
    label._fitT = { text, font, full, min };
    return label._fitT;
  }

  _applyTitleMeta(win) {
    if (!win?.backendIconSlot || !win?.agentKindSlot) return;
    const meta = win.titleMeta || {};
    const backend = meta.backend || null;
    const agentKind = meta.agentKind || 'primary';
    win.backend = backend;
    win.agentKind = agentKind;
    win.backendIconSlot.innerHTML = '';
    win.agentKindSlot.innerHTML = '';
    if (backend && (win.type === 'chat' || win.type === 'terminal')) {
      // Show composite backend+mode icon, hide generic type emoji
      const mode = win.type; // 'chat' or 'terminal'
      win.backendIconSlot.appendChild(createModeBackendIcon(backend, mode, { className: 'window-backend-icon' }));
      win.backendIconSlot.style.display = '';
      win.iconSpan.style.display = 'none';
    } else if (backend) {
      win.backendIconSlot.appendChild(createBackendIcon(backend, { className: 'window-backend-icon' }));
      win.backendIconSlot.style.display = '';
      win.iconSpan.style.display = 'none';
    } else {
      win.backendIconSlot.style.display = 'none';
      win.iconSpan.style.display = '';
    }
    if (agentKind && agentKind !== 'primary') {
      const kindMeta = getAgentKindMeta(agentKind);
      win.agentKindSlot.style.display = '';
      win.agentKindSlot.appendChild(createAgentKindIcon(agentKind, {
        className: 'window-agent-kind-icon',
        title: kindMeta.label,
      }));
      win.element.dataset.agentKind = agentKind;
    } else {
      win.agentKindSlot.style.display = 'none';
      delete win.element.dataset.agentKind;
    }
    if (backend) win.element.dataset.backend = backend;
    else delete win.element.dataset.backend;
  }

  setTitleMeta(id, meta = {}) {
    const win = this.windows.get(id); if (!win) return;
    const nextMeta = { ...(win.titleMeta || {}) };
    for (const [key, value] of Object.entries(meta)) {
      if (value == null || value === '') delete nextMeta[key];
      else nextMeta[key] = value;
    }
    win.titleMeta = nextMeta;
    this._applyTitleMeta(win);
    if (win._tabChain) this._renderTabBar(win._tabChain);
    else this._fitChipsSoon(win); // the icon stack beside the title may have changed width
    this._notify();
  }

  applyLayout(layout) {
    if (layout === 'freeform') { this.setGrid(null); return; }

    const gridMap = {
      'maximize':      { rows: 1, cols: 1 },
      'two-vertical':  { rows: 1, cols: 2 },
      'two-horizontal':{ rows: 2, cols: 1 },
      'quad':          { rows: 2, cols: 2 },
      'three-columns': { rows: 1, cols: 3 },
    };
    let g = gridMap[layout];
    if (!g && layout.startsWith('grid-')) {
      const parts = layout.split('-');
      g = { rows: parseInt(parts[1]), cols: parseInt(parts[2]) };
    }
    if (!g || !g.rows || !g.cols) return;

    this.setGrid(g.rows, g.cols);

    // Skip grouped guests, minimized, and windows on other desktops
    const activeDesk = this._app?.desktopManager?.activeDesktopId;
    const visible = [...this.windows.values()].filter(w =>
      !w.isMinimized && !w._hiddenByDesktop && !w._hiddenByStage
      && !(w._tabChain && w._tabChain.tabs[0] !== w.id)
      && (!activeDesk || !w._desktopId || w._desktopId === activeDesk)
    );
    if (!visible.length) return;
    const totalCells = g.rows * g.cols;

    // Round-robin: all windows get a cell, wrapping around if more windows than cells
    visible.forEach((w, i) => {
      const cellIdx = i % totalCells;
      this._positionToCell(w, cellIdx, true);
      setTimeout(() => { this._captureGridBounds(w); if (w._tabChain) this._syncChainBounds(w._tabChain); }, 250);
    });
    // One-shot mode (layout.presetOneShot): the arrangement is a single
    // action — drop back to free-form once windows have settled, instead of
    // keeping the grid armed for every future drag.
    const oneShot = this._app?.settings?.get('layout.presetOneShot') === true;
    setTimeout(() => { this._scheduleOverlapUpdate(); this._notify(); if (oneShot) this.setGrid(null); }, 300);
  }
  // ── Overlap Switcher (middle-click on title bar) ──
  _rectsOverlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  _showOverlapSwitcher(win, cx, cy) {
    document.querySelectorAll('.overlap-switcher').forEach(p => p.remove());
    const el = win.element;
    const rect = { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight };

    const overlapping = [];
    for (const [id, w] of this.windows) {
      if (id === win.id || w.isMinimized || w._hiddenByDesktop || w._hiddenByStage) continue;
      if (w._tabChain && w._tabChain.tabs[0] !== w.id) continue; // skip grouped guests
      const wEl = w.element;
      const wr = { left: wEl.offsetLeft, top: wEl.offsetTop, right: wEl.offsetLeft + wEl.offsetWidth, bottom: wEl.offsetTop + wEl.offsetHeight };
      if (this._rectsOverlap(rect, wr)) overlapping.push(w);
    }
    if (!overlapping.length) return;

    const pop = document.createElement('div');
    pop.className = 'overlap-switcher';

    for (const w of overlapping) {
      const item = document.createElement('div');
      item.className = 'overlap-switcher-item';
      // waiting blink — hosts aggregate their grouped tabs (guests skipped above)
      const tabIds = w._tabChain ? w._tabChain.tabs : [w.id];
      if (tabIds.some(tid => this.windows.get(tid)?.element.classList.contains('window-waiting'))) item.classList.add('waiting');
      const icon = document.createElement('span');
      icon.innerHTML = w._typeIcon || '';
      icon.style.cssText = 'font-size:11px;flex-shrink:0;display:inline-flex;align-items:center';
      const label = document.createElement('span');
      label.textContent = w.title;
      item.append(icon, label);
      item.onclick = () => { this.focusWindow(w.id); pop.remove(); };
      pop.appendChild(item);
    }

    document.body.appendChild(pop);
    // Position at cursor, clamp to viewport
    requestAnimationFrame(() => {
      // clamp in VIEWPORT space (offset sizes ×Z), write layout px (F3)
      const pw = pop.offsetWidth * uiScale(), ph = pop.offsetHeight * uiScale();
      pop.style.left = (Math.min(cx, window.innerWidth - pw - 8) / uiScale()) + 'px';
      pop.style.top = (Math.min(cy, window.innerHeight - ph - 8) / uiScale()) + 'px';
    });

    attachPopoverClose(pop);
  }

  // ── Overlap Indicators ──
  _scheduleOverlapUpdate() {
    clearTimeout(this._overlapDebounceTimer);
    this._overlapDebounceTimer = setTimeout(() => this._updateOverlapIndicators(), 200);
  }

  _updateOverlapIndicators() {
    if (this._restoring) return;
    // _hiddenByDesktop windows are geometrically present (visibility:hidden) —
    // counting them lit the ⧉ indicator for windows the user can't see
    const allWins = [...this.windows.values()].filter(w => !w.isMinimized && !w._hiddenByDesktop && !w._hiddenByStage && !(w._tabChain && w._tabChain.tabs[0] !== w.id));
    // Build rects for all visible windows
    const rects = new Map();
    for (const w of allWins) {
      const el = w.element;
      rects.set(w.id, { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight });
    }
    for (const w of allWins) {
      const btn = w.element.querySelector('.win-overlap-btn');
      if (!btn) continue;
      const myRect = rects.get(w.id);
      let hasOverlap = false;
      for (const other of allWins) {
        if (other.id === w.id) continue;
        if (this._rectsOverlap(myRect, rects.get(other.id))) { hasOverlap = true; break; }
      }
      if (hasOverlap) {
        btn.classList.remove('no-overlap');
        btn.textContent = '\u29C9'; // ⧉ stacked windows
        btn.title = t('Show overlapping windows');
      } else {
        btn.classList.add('no-overlap');
        btn.textContent = '\u25A1'; // □ single window
        btn.title = t('No overlapping windows');
      }
    }
  }

  // Tab grouping methods installed from tab-group.js mixin

  // RESTORE BATCH MODE (2.338.0, Windows freeze audit): the boot restore
  // loop creates N windows in one tick; each creation used to run the full
  // O(windows) bookkeeping (taskbar rebuild + desktop-switcher digest +
  // overlap rects with forced layout) = O(N²) at boot. While _restoring is
  // set both are suppressed; layout.js fires ONE _notify at the end.
  _notify() { if (this._restoring) return; if (this.onWindowsChanged) this.onWindowsChanged(); }
}

export { WindowManager };
