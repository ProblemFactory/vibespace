import { createAgentKindIcon } from './agent-meta.js';
import { escHtml , uiScale, showToast, showContextMenu } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { inboxCountText } from './title-chips.js'; // lane G: the inbox chip never grows past icon + '99+'
import { showWindowContextMenu } from './taskbar.js';
import { normalizeChain, displayedPanes, splitReplaceable, clampRatio, splitColumns, paneMinPx, pairFor, visualTabOrder, swappedPair, splitPartner, ownerColor, SPLIT_RATIO_DEFAULT } from './chain-layout.js';

/**
 * Tab grouping — mixin methods for WindowManager.
 * Adds tab chain support: drag window icon onto another to merge into tabs.
 *
 * Chain model: { tabs: [hostId, ...guestIds], active: index, layout, split }
 * All grouped windows share the same chain reference via win._tabChain.
 * tabs[0] is always the host (owns the physical .window element).
 *
 * SPLIT (agent browser P7, docs/design-agent-browser-v2.md §4.6): `layout`
 * 'tabs' | 'split' (missing = 'tabs') and `split: { pair, ratio, dir }` —
 * PURE src/lib/chain-layout.js owns the model; a split is another RENDERING
 * of the same chain: the host's element becomes a grid (title bar across,
 * pane / divider / pane below) and the pair's `content` elements lose
 * `.tab-hidden` together — no re-parenting, no second container, the window's
 * EXTERNAL geometry is unchanged (gridBounds / snap / desktops keep working).
 * `_normalizeChain` runs at EVERY chain mutation (create / add / detach /
 * restore / switch) so a pair member that left the chain collapses the layout
 * to tabs — never a dangling id (the §4.6 invariant, ONE place).
 *
 * SPLIT UX (docs/design-split-ux.zh.md, 2026-09-23 — the owner: "I wanted to
 * drag the window to the left and it went side by side"): NO DRAG EVER SPLITS.
 * A window drag = move / snap / grid; the tab MERGE (icon stack / tab bar) is
 * the one drag exception. A split is the explicit SECOND step after a merge —
 * the strip's ONE `.tab-split-btn` (the columns icon; in a split the same
 * button is the badge: Unsplit / Swap left and right), the toast that follows
 * a user merge (`_afterUserMerge`), the window menu (taskbar.js: Show side by
 * side ▸ Beside {name} (on the right) / Unsplit / Swap) and command mode (`v` / `V`).
 * The strip is drawn in VISUAL order (the left pane's tab on the left), each
 * pane tab underlined in its owner colour, a glyph between them; every
 * announced split can be undone for 5 s (`undoSplit`).
 */

// Window-kind icons live in the WINDOW-TYPE REGISTRY (window-types.js, Plugin
// Ph1): each owning module registers its kind + icon there; TYPE_ICONS is the
// live compatibility view over it (kept for pre-registry importers).
export { TYPE_ICONS } from './window-types.js';

/**
 * Install tab group methods onto a WindowManager instance.
 * Called once from WindowManager constructor.
 */
export function installTabGroupMixin(wm) {
  Object.assign(wm, tabGroupMethods);
}

const tabGroupMethods = {

  // Mirror each grouped window's waiting blink onto its TAB header — a guest's
  // own titlebar is hidden inside the group, so without this the blink was
  // invisible until you happened to be on that tab. Called from the taskbar
  // update funnel (every waiting toggle passes through it); cheap class sync.
  refreshTabWaiting() {
    for (const [id, win] of this.windows) {
      const chain = win._tabChain;
      if (!chain || chain.tabs[0] !== id) continue; // hosts only
      const bar = win.titleBar?.querySelector('.tab-bar-tabs');
      if (!bar) continue;
      for (const tab of bar.children) {
        const tw = this.windows.get(tab.dataset?.winId);
        if (tw) tab.classList.toggle('waiting', tw.element.classList.contains('window-waiting'));
      }
    }
  },

  _syncChainBounds(chain) {
    const host = this.windows.get(chain.tabs[0]);
    if (!host) return;
    for (let i = 1; i < chain.tabs.length; i++) {
      const guest = this.windows.get(chain.tabs[i]);
      if (guest) guest.gridBounds = host.gridBounds ? { ...host.gridBounds } : null;
    }
  },

  /**
   * Hit-test for tab merge. Uses elementFromPoint so occluded icons don't
   * match. `sourceWinId` is excluded, and elements listed in `hiddenEls`
   * are temporarily hidden so elementFromPoint sees past them (pass the
   * ghost + source element for icon/tab drags).
   * Returns the target winInfo (chain host) or null.
   */
  _detectTabMergeTarget(clientX, clientY, sourceWinId, hiddenEls = []) {
    const savedPE = hiddenEls.map(el => {
      const prev = el.style.pointerEvents;
      el.style.pointerEvents = 'none';
      return prev;
    });
    const topEl = document.elementFromPoint(clientX, clientY);
    hiddenEls.forEach((el, i) => { el.style.pointerEvents = savedPE[i]; });
    const hitZoneEl = topEl?.closest('.window-icon-stack, .tab-bar-tabs, .tab-icon-wrap');
    if (!hitZoneEl) return null;
    const hitWinEl = hitZoneEl.closest('.window');
    if (!hitWinEl) return null;
    for (const [id, w] of this.windows) {
      if (id === sourceWinId) continue;
      if (w._tabChain && w._tabChain.tabs[0] !== w.id) continue; // skip guests
      if (w._hiddenByDesktop || w.isMinimized) continue;
      if (w.element === hitWinEl) return w;
    }
    return null;
  },

  _setupIconDrag(winInfo) {
    const icon = winInfo.iconWrap || winInfo.iconSpan;
    if (!icon) return;
    let mouseDown = false, dragging = false, ghost = null, startX, startY;
    let targetWin = null;

    icon.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      mouseDown = true; dragging = false;
      startX = e.clientX; startY = e.clientY;
    });

    let prevVisibility = '';
    const processMove = (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        dragging = true;
        // Hide source window during icon drag — the ghost represents it
        prevVisibility = winInfo.element.style.visibility;
        winInfo.element.style.visibility = 'hidden';
        ghost = document.createElement('div');
        ghost.className = 'tab-ghost';
        const ghostIcon = winInfo.backendIconSlot?.children.length ? winInfo.backendIconSlot.children[0].cloneNode(true).outerHTML : (winInfo._typeIcon || '');
        ghost.innerHTML = `<span>${ghostIcon}</span><span>${escHtml(winInfo.title)}</span>`;
        document.body.appendChild(ghost);
      }
      // /uiScale(): ghost is a body child — layout px differ from viewport px
      // under the DPI zoom (see window.js drag note)
      ghost.style.left = (e.clientX / uiScale() + 12) + 'px';
      ghost.style.top = (e.clientY / uiScale() + 12) + 'px';

      targetWin = this._detectTabMergeTarget(e.clientX, e.clientY, winInfo.id, [ghost]);
      for (const [, w] of this.windows) {
        w.element.classList.toggle('tab-drop-target', w === targetWin);
      }
    };
    // rAF-coalesce (same as window.js drags): _detectTabMergeTarget forces a
    // style recalc + hit-test per event — once per frame is enough.
    let pendingEv = null, raf = 0;
    const onMove = (e) => {
      if (!mouseDown) return;
      pendingEv = e;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; const ev = pendingEv; pendingEv = null; if (ev && mouseDown) processMove(ev); });
    };

    const onUp = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; pendingEv = null; }
      if (!mouseDown) return;
      mouseDown = false;
      if (ghost) { ghost.remove(); ghost = null; }
      for (const [, w] of this.windows) w.element.classList.remove('tab-drop-target');
      if (dragging) {
        // Restore source window visibility
        winInfo.element.style.visibility = prevVisibility;
      }
      if (!dragging) return;
      dragging = false;

      if (targetWin && targetWin.id !== winInfo.id) {
        if (winInfo._tabChain && winInfo._tabChain === targetWin._tabChain) return;
        if (winInfo._tabChain) this._detachFromChain(winInfo._tabChain, winInfo.id);
        if (targetWin._tabChain) this.addToTabChain(targetWin._tabChain, winInfo);
        else this.createTabChain(targetWin, winInfo);
        this._afterUserMerge(winInfo._tabChain); // the bridge to the explicit second step (never from restore / sync)
      }
      targetWin = null;
    };

    const signal = winInfo._listenerCtl?.signal;
    document.addEventListener('mousemove', onMove, { signal });
    document.addEventListener('mouseup', onUp, { signal });
  },

  createTabChain(hostWin, guestWin) {
    // `recent` (most recent first) = the default side-by-side partner — LOCAL state: never persisted, never in the sync key
    const chain = { tabs: [hostWin.id, guestWin.id], active: 1, layout: 'tabs', recent: [guestWin.id, hostWin.id] };
    hostWin._tabChain = chain;
    guestWin._tabChain = chain;
    // Enforce same desktop: guest inherits host's desktop
    if (hostWin._desktopId) guestWin._desktopId = hostWin._desktopId;
    // Host content hidden, guest content visible (guest = newly dragged in = active)
    hostWin.content.classList.add('tab-hidden');
    hostWin.element.appendChild(guestWin.content);
    guestWin.element.style.display = 'none';
    guestWin.gridBounds = hostWin.gridBounds ? { ...hostWin.gridBounds } : null;
    this.activeWindowId = guestWin.id;
    this._normalizeChain(chain);
    this._applyChainLayout(chain);
    this._renderTabBar(chain);
    this._notify();
  },

  addToTabChain(chain, guestWin, insertIndex) {
    let insertedAt;
    if (insertIndex != null && insertIndex >= 0 && insertIndex < chain.tabs.length) {
      insertedAt = insertIndex + 1;
      chain.tabs.splice(insertedAt, 0, guestWin.id); // insert after the tab at insertIndex
    } else {
      chain.tabs.push(guestWin.id);
      insertedAt = chain.tabs.length - 1;
    }
    guestWin._tabChain = chain;
    const hostWin = this.windows.get(chain.tabs[0]);
    // Enforce same desktop
    if (hostWin?._desktopId) guestWin._desktopId = hostWin._desktopId;
    if (!hostWin) return;
    guestWin.content.classList.add('tab-hidden');
    hostWin.element.appendChild(guestWin.content);
    guestWin.element.style.display = 'none';
    guestWin.gridBounds = hostWin.gridBounds ? { ...hostWin.gridBounds } : null;
    this._normalizeChain(chain);
    this._renderTabBar(chain);
    // Activate the tab that was just dropped — not the last one (dropping
    // between tabs used to light up an unrelated trailing tab)
    this.switchTab(chain, insertedAt);
    this._notify();
  },

  // ── SPLIT (§4.6) ──────────────────────────────────────────────────────
  /** The ONE validation of `split` against `tabs` (PURE chain-layout.js). */
  _normalizeChain(chain) { return normalizeChain(chain); },

  /** Render the chain's LAYOUT: which pane contents are displayed, the host's
   *  grid columns, the divider. Idempotent; every chain mutation ends here. */
  _applyChainLayout(chain) {
    if (!chain) return;
    const host = this.windows.get(chain.tabs[0]); if (!host) return;
    this._normalizeChain(chain);
    const split = chain.layout === 'split' ? chain.split : null;
    const shown = new Set(displayedPanes(chain));
    for (const id of chain.tabs) {
      const w = this.windows.get(id); if (!w) continue;
      const c = w.content;
      c.classList.toggle('tab-hidden', !shown.has(id));
      const paneIdx = split ? split.pair.indexOf(id) : -1;
      c.classList.toggle('tab-split-pane', paneIdx >= 0);
      c.classList.toggle('tab-split-focus', paneIdx >= 0 && chain.tabs[chain.active] === id);
      c.style.gridColumn = paneIdx === 0 ? '1' : paneIdx === 1 ? '3' : '';
    }
    const el = host.element;
    let divider = el.querySelector(':scope > .tab-split-divider');
    if (split) {
      if (!divider) {
        divider = document.createElement('div');
        divider.className = 'tab-split-divider';
        divider.title = t('Drag to resize the panes — double-click to even them out, right-click for Unsplit / Swap');
        this._setupSplitDivider(chain, divider);
        el.appendChild(divider);
      }
      el.classList.add('tab-split');
      el.style.gridTemplateColumns = splitColumns(split.ratio, this._paneMins(split));
    } else {
      if (divider) divider.remove();
      el.classList.remove('tab-split');
      el.style.gridTemplateColumns = '';
    }
    this.syncHiddenViews?.(); // a pane's display just changed (inc-mu6bfv1t-4drq: every hider suspends)
  },

  /** Strip every split mark off a window that is leaving a chain / a host that is no longer one. */
  _clearSplitDom(win) {
    if (!win) return;
    win.element.classList.remove('tab-split', 'split-resizing');
    win.titleBar?.querySelector(':scope > .tab-split-btn')?.remove();
    win.titleBar?.classList.remove('split-btn-hidden');
    if (win.titleBar) this._titleRO?.unobserve(win.titleBar);
    win.element.style.gridTemplateColumns = '';
    win.element.querySelector(':scope > .tab-split-divider')?.remove();
    win.content.classList.remove('tab-split-pane', 'tab-split-focus');
    win.content.style.gridColumn = '';
  },

  _resizePanes(chain) {
    for (const id of displayedPanes(chain)) { const w = this.windows.get(id); if (w && w.onResize) w.onResize(); }
  },

  /** The split pair's OWN pane floors [left, right] (layout px; `winInfo.paneMinWidth`, 0 = none) — splitColumns turns
   *  them into the tracks' minimums. */
  _paneMins(split) {
    return split && Array.isArray(split.pair) ? split.pair.map((id) => { const w = this.windows.get(id); return (w && w.paneMinWidth) || 0; }) : [0, 0];
  },

  /** A window's OWN floor as a split PANE (layout px; null/0 clears — lane I verify r1, 2026-09-25: a bound live view
   *  dragged to the divider's clamp was 134 px beside a bar whose never-fold set was 169–222 px, its toggle cut and its
   *  ⋯ clipped out). While the window is a pane of a split its grid track never renders narrower (chain-layout.js
   *  splitColumns — capped at SPLIT_PANE_MIN_MAX so a host at the window floor still holds it); the divider stops there
   *  and the partner takes the rest; the ratio is untouched. A free window is unaffected (its floor is the .window
   *  320 px), a tab that is not a pane too; the value waits for the next split. Local to this client (never persisted:
   *  every client's view measures its own). The phone layout ignores the grid (style.css). */
  setPaneMinWidth(id, px) {
    const win = this.windows.get(id); if (!win) return;
    const v = paneMinPx(px) || null;
    if ((win.paneMinWidth || null) === v) return;
    win.paneMinWidth = v;
    const chain = win._tabChain;
    if (!chain || chain.layout !== 'split' || !chain.split || !chain.split.pair.includes(id)) return;
    const host = this.windows.get(chain.tabs[0]); if (!host) return;
    host.element.style.gridTemplateColumns = splitColumns(chain.split.ratio, this._paneMins(chain.split));
    requestAnimationFrame(() => this._resizePanes(chain)); // the partner pane just changed width
  },

  /** The divider drag — this repository's three laws: a PER-DRAG
   *  AbortController (a per-render one tears itself down mid-drag),
   *  rAF-coalesced moves, and ONE kind of pixel: the host's bounding rect and
   *  `clientX` are both VIEWPORT px, so the ratio is scale-free under the body
   *  zoom (inc-mtdrm922 — `clientWidth` is layout px and never enters). */
  _setupSplitDivider(chain, divider) {
    let ctl = null, raf = 0, pending = null;
    const host = () => this.windows.get(chain.tabs[0]);
    const end = () => { if (ctl) { ctl.abort(); ctl = null; } if (raf) { cancelAnimationFrame(raf); raf = 0; } pending = null; };
    const apply = (e) => {
      const h = host(); if (!h || chain.layout !== 'split') return;
      const r = h.element.getBoundingClientRect();
      if (!(r.width > 0)) return;
      this.setSplitRatio(chain, (e.clientX - r.left) / r.width, { notify: false });
    };
    divider.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || chain.layout !== 'split') return;
      e.preventDefault(); e.stopPropagation();
      end(); ctl = new AbortController();
      divider.classList.add('dragging'); host()?.element.classList.add('split-resizing');
      try { divider.setPointerCapture(e.pointerId); } catch { /* optional */ }
      const onMove = (ev) => { pending = ev; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const x = pending; pending = null; if (x) apply(x); }); };
      const onUp = () => { const h = host(); end(); divider.classList.remove('dragging'); h?.element.classList.remove('split-resizing'); this._resizePanes(chain); this._notify(); };
      document.addEventListener('pointermove', onMove, { signal: ctl.signal });
      document.addEventListener('pointerup', onUp, { signal: ctl.signal });
      document.addEventListener('pointercancel', onUp, { signal: ctl.signal });
    });
    divider.addEventListener('dblclick', (e) => { e.stopPropagation(); this.setSplitRatio(chain, SPLIT_RATIO_DEFAULT); });
    divider.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this._showSplitMenu(chain, e.clientX, e.clientY); });
  },

  setSplitRatio(chain, ratio, { notify = true } = {}) {
    if (!chain || chain.layout !== 'split' || !chain.split) return;
    const host = this.windows.get(chain.tabs[0]); if (!host) return;
    chain.split.ratio = clampRatio(ratio);
    host.element.style.gridTemplateColumns = splitColumns(chain.split.ratio, this._paneMins(chain.split));
    if (notify) { this._resizePanes(chain); this._notify(); }
    else if (!this._splitResizeRaf) this._splitResizeRaf = requestAnimationFrame(() => { this._splitResizeRaf = 0; this._resizePanes(chain); });
  },

  /** BIND: show `guestWin` beside `anchorWin` in ONE chain (the anchor's chain
   *  wins; the guest leaves its own). `side` is where the guest lands — named by
   *  the CALLER's verb, never by a pointer position (split UX R2). `announce`
   *  (a user's explicit act) snapshots BEFORE the mutation and offers Undo for
   *  5 s (R5); the programmatic bind (`createWindow({intoChain})`) stays silent.
   *  `focus: 'anchor'` keeps the focus on the window the user ACTED ON — every
   *  user verb passes it (the strip's button, the window menu's "Beside {name}",
   *  command mode's splitBeside; split r1); the default 'guest' is the
   *  programmatic bind's and the live view's (whose guest IS the acted-on window). */
  bindSplit(anchorWin, guestWin, { side = 'right', announce = false, focus = 'guest' } = {}) {
    if (!anchorWin || !guestWin || anchorWin.id === guestWin.id) return null;
    let snap = null;
    if (announce) {
      // the element that SHOWS a window right now: a chain guest is drawn by its host
      const shownBy = (w) => (w._tabChain ? this.windows.get(w._tabChain.tabs[0]) || w : w);
      const rectOf = (w) => (w ? { id: w.id, left: w.element.style.left, top: w.element.style.top, width: w.element.style.width, height: w.element.style.height, z: w.element.style.zIndex, gridBounds: w.gridBounds ? { ...w.gridBounds } : null } : null);
      const ac = anchorWin._tabChain;
      const guestWasFree = !(ac && guestWin._tabChain === ac); // free, or in ANOTHER chain (it comes back out free where that group stood)
      snap = {
        anchorId: anchorWin.id, guestId: guestWin.id, guestWasFree,
        guestRect: rectOf(shownBy(guestWin)), hostRect: rectOf(shownBy(anchorWin)),
        chainBefore: guestWasFree ? null : { layout: ac.layout, split: ac.split ? { pair: [...ac.split.pair], ratio: ac.split.ratio } : null, activeId: ac.tabs[ac.active] },
      };
    }
    if (guestWin._tabChain && guestWin._tabChain !== anchorWin._tabChain) this._detachFromChain(guestWin._tabChain, guestWin.id);
    let chain = anchorWin._tabChain;
    if (!chain) { this.createTabChain(anchorWin, guestWin); chain = anchorWin._tabChain; }
    else if (!chain.tabs.includes(guestWin.id)) this.addToTabChain(chain, guestWin);
    if (!chain) return null;
    this._withdrawMergeToast(chain); // the bridge's offer is taken — by this act, whichever entry made it
    chain.layout = 'split';
    chain.split = { pair: pairFor({ anchorId: anchorWin.id, guestId: guestWin.id, side }), ratio: chain.split ? chain.split.ratio : SPLIT_RATIO_DEFAULT, dir: 'row' };
    const focusWin = focus === 'anchor' ? anchorWin : guestWin;
    chain.active = Math.max(0, chain.tabs.indexOf(focusWin.id));
    this._normalizeChain(chain);
    this._applyChainLayout(chain);
    this._renderTabBar(chain);
    this.activeWindowId = focusWin.id;
    requestAnimationFrame(() => this._resizePanes(chain));
    this._notify();
    if (snap && chain.layout === 'split') {
      snap.chain = chain; snap.pairAfter = [...chain.split.pair];
      const nameOf = (id) => String(this.windows.get(id)?.title || id);
      showToast(t('Side by side: {left} | {right}', { left: nameOf(chain.split.pair[0]), right: nameOf(chain.split.pair[1]) }), { action: { label: t('Undo'), run: () => this.undoSplit(snap) } });
    }
    return chain;
  },

  /** UNBIND: back to tabs; nothing leaves the chain, nothing moves. */
  unbindSplit(chain) {
    if (!chain || chain.layout !== 'split') return;
    chain.layout = 'tabs'; delete chain.split;
    this._normalizeChain(chain);
    this._applyChainLayout(chain);
    this._renderTabBar(chain);
    requestAnimationFrame(() => this._resizePanes(chain));
    this._notify();
  },

  /** "Swap left and right": the pair reversed (the sync key carries the order —
   *  other clients rebuild the pair; the ratio stays the ratio). */
  swapSplit(chain) {
    const pair = swappedPair(chain);
    if (!pair) return;
    chain.split.pair = pair;
    this._normalizeChain(chain);
    this._applyChainLayout(chain);
    this._renderTabBar(chain);
    requestAnimationFrame(() => this._resizePanes(chain));
    this._notify();
  },

  /** The strip's button in the tabs state: the ACTIVE tab on the left, the
   *  default partner (PURE splitPartner — the most recent other tab, else the
   *  next neighbour) on the right; the focus stays on the active tab. */
  splitActive(chain, { announce = false } = {}) {
    if (!chain || chain.layout === 'split' || !Array.isArray(chain.tabs) || chain.tabs.length < 2) return null;
    const anchor = this.windows.get(chain.tabs[chain.active]);
    const guest = this.windows.get(splitPartner(chain, chain.recent));
    if (!anchor || !guest) return null;
    return this.bindSplit(anchor, guest, { side: 'right', announce, focus: 'anchor' });
  },

  /** R5: put back what an announced bind changed — ONLY while nothing else has
   *  touched the group since (same chain object, still split, same pair, both
   *  windows alive and in it); otherwise SAY so (never a silent no-op). A guest
   *  that was free comes back out at its own rect, the host at its rect; a guest
   *  that was already a tab goes back to the chain's previous layout, nothing moves. */
  undoSplit(snap) {
    const chain = snap && snap.chain;
    const anchor = snap && this.windows.get(snap.anchorId), guest = snap && this.windows.get(snap.guestId);
    const pairSame = !!(chain && chain.split && Array.isArray(snap.pairAfter) && chain.split.pair[0] === snap.pairAfter[0] && chain.split.pair[1] === snap.pairAfter[1]);
    if (!chain || chain.layout !== 'split' || !pairSame || !this.windows.has(snap.anchorId) || !this.windows.has(snap.guestId) || anchor._tabChain !== chain || guest._tabChain !== chain) {
      showToast(t('Nothing to undo any more — the group changed'));
      return false;
    }
    const put = (r) => {
      const w = r && this.windows.get(r.id); if (!w) return;
      w.element.style.left = r.left; w.element.style.top = r.top; w.element.style.width = r.width; w.element.style.height = r.height;
      if (r.z) w.element.style.zIndex = r.z;
      w.gridBounds = r.gridBounds ? { ...r.gridBounds } : null;
    };
    if (snap.guestWasFree) {
      this._detachFromChain(chain, guest.id); // normalizes: a pair member left ⇒ tabs; a one-tab chain ungroups
      put({ ...snap.guestRect, id: guest.id });
      const host = this.windows.get(chain.tabs[0]) || anchor;
      put({ ...snap.hostRect, id: host.id });
      this._normalizeChain(chain);
      requestAnimationFrame(() => { if (guest.onResize) guest.onResize(); this._resizePanes(chain); });
    } else {
      const b = snap.chainBefore || { layout: 'tabs' };
      chain.layout = b.layout === 'split' && b.split ? 'split' : 'tabs';
      if (chain.layout === 'split') chain.split = { pair: [...b.split.pair], ratio: b.split.ratio, dir: 'row' }; else delete chain.split;
      const ai = chain.tabs.indexOf(b.activeId);
      if (ai >= 0) chain.active = ai;
      this._normalizeChain(chain);
      this._applyChainLayout(chain);
      this._renderTabBar(chain);
      requestAnimationFrame(() => this._resizePanes(chain));
    }
    this._notify();
    return true;
  },

  /** The two verbs of a split (the badge click and the divider's right-click). */
  _showSplitMenu(chain, x, y) {
    if (!chain || chain.layout !== 'split') return null;
    return showContextMenu(x, y, [
      { label: t('Unsplit'), action: () => this.unbindSplit(chain) },
      { label: t('Swap left and right'), action: () => this.swapSplit(chain) },
    ], 'taskbar-context-menu');
  },

  /** The bridge between the two steps (R1): called ONLY by the three user merge
   *  drops (icon drag / tab drag / title-bar drag) — never by restore, a remote
   *  sync or a programmatic chain. The button pulses once (1.2 s; none under
   *  prefers-reduced-motion) and a toast offers the second step in one click. */
  _afterUserMerge(chain) {
    if (!chain || !Array.isArray(chain.tabs) || chain.tabs.length < 2 || chain.layout === 'split') return;
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches) return; // the phone shows one pane — nothing to offer
    chain._pulseUntil = Date.now() + 1200;
    const host = this.windows.get(chain.tabs[0]);
    const btn = host?.titleBar.querySelector(':scope > .tab-split-btn');
    if (btn) { btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse'); }
    setTimeout(() => { const h = this.windows.get(chain.tabs[0]); h?.titleBar.querySelector(':scope > .tab-split-btn')?.classList.remove('pulse'); }, 1250);
    this._withdrawMergeToast(chain);
    // the toast is kept on the chain so a split taken ANY other way withdraws it
    // (bindSplit); should its action still run after the group changed (a remote
    // apply, a detach), it SAYS why — never a silent no-op (split r1)
    chain._mergeToast = showToast(t('Grouped as tabs'), { action: { label: t('Show side by side'), run: () => {
      chain._mergeToast = null;
      const alive = chain.tabs.length >= 2 && chain.tabs.every((id) => this.windows.get(id)?._tabChain === chain);
      if (!alive) return showToast(t('The tab group changed — nothing to show side by side'));
      if (chain.layout === 'split') return showToast(t('Already shown side by side'));
      this.splitActive(chain, { announce: true });
    } } });
  },

  /** Remove the post-merge toast of `chain` (if it is still up). */
  _withdrawMergeToast(chain) {
    const el = chain && chain._mergeToast;
    if (!el) return;
    chain._mergeToast = null;
    const stack = el.parentElement;
    el.remove();
    if (stack && stack.id === 'global-toasts' && !stack.children.length) stack.remove();
  },

  /** A pane tab's underline colour = the pane's OWNER colour: its badge's first
   *  dot, else the session's own colour, else a colour keyed on the window id
   *  (ownerSeq gives every id a slot). */
  _paneColorOf(win) {
    const dot = win?._ownerBadge?.dots?.[0]?.color;
    if (dot) return String(dot);
    const sid = this._app?.sessions?.get?.(win?.id)?.sessionId;
    return ownerColor(sid || win?.id || '');
  },

  /** The ownership badge element (§4.6): one dot per owner, names one per line in the title. */
  _ownerBadgeEl(badge) {
    const el = document.createElement('span');
    el.className = 'win-owner-badge';
    const dots = (badge && Array.isArray(badge.dots) ? badge.dots : []).slice(0, 6);
    for (const d of dots) {
      const dot = document.createElement('i');
      dot.className = 'win-owner-dot';
      dot.style.background = String(d.color || '');
      el.appendChild(dot);
    }
    el.title = dots.map((d) => String(d.name || d.sessionId || '')).join('\n');
    return el;
  },

  /** The MINI INBOX badge element (design-user-inbox-reply §3): a <button> with
   *  the inbox SVG (aria-hidden, icons.js) + the count as TEXT, coloured by
   *  `data-urgency`, labelled in plain words (never the session name — a peer-
   *  controlled string; the popover names the session as text). The mousedown
   *  stops HERE so the title bar's drag / focus and the For-you panel's
   *  outside-click closer never see it; the click opens this window's mini inbox. */
  _inboxBadgeEl(winId, badge) {
    const n = Math.max(0, Math.floor(Number(badge && badge.count) || 0));
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'win-inbox-badge';
    el.dataset.key = `${n}:${(badge && badge.urgency) || ''}`;
    el.dataset.urgency = String((badge && badge.urgency) || 'normal');
    el.innerHTML = UI_ICONS.inbox;
    const num = document.createElement('span');
    num.className = 'win-inbox-n';
    num.textContent = inboxCountText(n); // the number stays, never wider than 99+ (the label says the real count)
    el.appendChild(num);
    const label = t('{n} items from this agent', { n });
    el.title = label;
    el.setAttribute('aria-label', label);
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('dblclick', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); this._app?.openMiniInbox?.(el, winId); });
    return el;
  },

  /** A window entered / left a chain (or its chain was re-rendered): `winInfo.onChainChanged` lets it re-decide what
   *  it shows — a seamless desktop-app window PAUSES in a chain (the tab bar lives in the title bar it would fold;
   *  docs/design-desktop-apps-seamless §3.3). Deferred a microtask so the chain's own bookkeeping has settled. */
  _notifyChainChange(ids) {
    queueMicrotask(() => { for (const id of ids) { const w = this.windows.get(id); if (w && typeof w.onChainChanged === 'function') { try { w.onChainChanged(); } catch (e) { console.warn('[tab-group] onChainChanged threw:', e); } } } });
  },

  _renderTabBar(chain) {
    const hostWin = this.windows.get(chain.tabs[0]);
    if (!hostWin) return;
    this._notifyChainChange([...chain.tabs]);
    // Rebuilding the tab DOM destroys per-tab auth badges — re-apply them
    // after this render instead of waiting for the next identity broadcast.
    queueMicrotask(() => {
      // Purge the host's pre-merge standalone badge (it reads as a stray
      // "global" chip left of the tabs), then re-apply per-tab badges.
      hostWin.titleBar.querySelector(':scope > .win-auth-badge')?.remove();
      for (const tid of chain.tabs) {
        const w = this.windows.get(tid);
        if (w && w._authBadge !== undefined) this.setAuthBadge(tid, w._authBadge);
      }
    });
    // Tab-drag listeners are now scoped per-drag (created on mousedown, aborted
    // on mouseup in _setupTabDrag) instead of per-render, so re-rendering the
    // tab bar mid-drag no longer kills an in-flight drag.
    const titleBar = hostWin.titleBar;
    // the mini inbox badge rides each window's TAB while grouped — never a stray standalone one
    for (const tid of chain.tabs) this.windows.get(tid)?.titleBar.querySelector(':scope > .win-inbox-badge')?.remove();
    const existing = titleBar.querySelector('.tab-bar-tabs');
    if (existing) existing.remove();
    titleBar.querySelector(':scope > .tab-split-btn')?.remove();
    const standaloneIcon = titleBar.querySelector(':scope > .window-icon-stack');
    if (standaloneIcon) standaloneIcon.style.display = 'none';
    hostWin.titleSpan.style.display = 'none';

    const tabBar = document.createElement('div');
    tabBar.className = 'tab-bar-tabs';
    const wrap = this._settings?.get('window.tabWrap');
    if (wrap) tabBar.classList.add('tab-wrap');
    hostWin.element.classList.toggle('tab-wrap-mode', !!wrap);

    // split UX R3: the strip in VISUAL order — [left pane, glyph, right pane, …the rest]
    const isSplit = chain.layout === 'split' && chain.split && Array.isArray(chain.split.pair);
    const order = visualTabOrder(chain);
    const activeId = chain.tabs[chain.active];
    for (const tabWinId of order) {
      const tabWin = this.windows.get(tabWinId);
      if (!tabWin) continue;

      const tab = document.createElement('div');
      tab.className = 'tab-item';
      tab.dataset.winId = tabWinId;
      if (tabWinId === activeId) tab.classList.add('active');

      const iconWrap = document.createElement('span');
      iconWrap.className = 'tab-icon-wrap';
      // Use composite backend+mode icon if available, else generic type icon
      if (tabWin.backendIconSlot?.children.length) {
        const clone = tabWin.backendIconSlot.children[0].cloneNode(true);
        iconWrap.appendChild(clone);
      } else {
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.innerHTML = tabWin._typeIcon || '';
        iconWrap.appendChild(icon);
      }
      if (tabWin.titleMeta?.agentKind && tabWin.titleMeta.agentKind !== 'primary') {
        iconWrap.appendChild(createAgentKindIcon(tabWin.titleMeta.agentKind, { className: 'tab-agent-kind-icon' }));
      }
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = tabWin.title;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '\u2715';
      closeBtn.addEventListener('click', (e) => { e.stopPropagation(); if (tabWin.onCloseRequest && tabWin.onCloseRequest() === false) return; this.removeFromTabChain(chain, tabWinId); }); // a user close: the window may answer first (WindowManager.requestClose)

      // A grouped guest's own titlebar is hidden — the tab carries its
      // waiting blink (kept live by refreshTabWaiting via the taskbar funnel).
      if (tabWin.element.classList.contains('window-waiting')) tab.classList.add('waiting');
      // §4.6: a pane of the split is marked; the OWNERSHIP badge (the session's
      // own colour + name) rides the tab because the guest's title bar is hidden
      const paneIdx = isSplit ? chain.split.pair.indexOf(tabWinId) : -1;
      if (paneIdx >= 0) {
        tab.classList.add('split-member', 'tab-pane');
        tab.classList.toggle('tab-split-focus', tabWinId === activeId);
        tab.style.setProperty('--pane-color', this._paneColorOf(tabWin));
        tab.title = t('Shown side by side');
      }
      tab.append(iconWrap, label);
      if (tabWin._ownerBadge && tabWin._ownerBadge.dots && tabWin._ownerBadge.dots.length) tab.appendChild(this._ownerBadgeEl(tabWin._ownerBadge));
      if (tabWin._inboxBadge && tabWin._inboxBadge.count) tab.appendChild(this._inboxBadgeEl(tabWinId, tabWin._inboxBadge));
      tab.appendChild(closeBtn);
      tab.addEventListener('mousedown', (e) => {
        if (e.target.closest('.tab-close')) return;
        e.stopPropagation();
        const idx = chain.tabs.indexOf(tabWinId);
        if (idx >= 0 && idx !== chain.active) this.switchTab(chain, idx);
      });
      // right-click a tab = THAT tab's own window menu (it used to open the host's)
      tab.addEventListener('contextmenu', (e) => {
        if (!this._app) return;
        e.preventDefault(); e.stopPropagation();
        showWindowContextMenu(this._app, tabWinId, e.clientX, e.clientY, { switchSubmenu: true });
      });
      this._setupTabDrag(tab, tabWinId, chain);
      tabBar.appendChild(tab);
      if (paneIdx === 0) {
        // the divider's mirror between the two pane tabs — paint, not a node
        const glyph = document.createElement('span');
        glyph.className = 'tab-split-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        tabBar.appendChild(glyph);
      }
    }

    const controls = titleBar.querySelector('.window-controls');
    titleBar.insertBefore(tabBar, controls);

    // R1/R4: the ONE split button — the entry in the tabs state, the badge in the split state
    if (chain.tabs.length >= 2) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-split-btn';
      btn.innerHTML = UI_ICONS.columns;
      this._labelSplitBtn(chain, btn);
      btn.setAttribute('aria-pressed', isSplit ? 'true' : 'false');
      btn.classList.toggle('on', !!isSplit);
      if (!isSplit && chain._pulseUntil && Date.now() < chain._pulseUntil) btn.classList.add('pulse');
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      btn.addEventListener('dblclick', (e) => { e.stopPropagation(); });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chain.layout === 'split') { const r = btn.getBoundingClientRect(); this._showSplitMenu(chain, r.left, r.bottom + 2); }
        else this.splitActive(chain, { announce: true });
      });
      titleBar.insertBefore(btn, controls);
      // a very narrow host (< 260 px) hides the button — one observer for every host title bar
      if (typeof ResizeObserver === 'function') {
        this._titleRO = this._titleRO || new ResizeObserver((entries) => { for (const en of entries) en.target.classList.toggle('split-btn-hidden', en.contentRect.width < 260); });
        this._titleRO.observe(titleBar);
      }
    }
  },

  /** The strip button's words (title + aria-label) from the chain AS IT IS NOW:
   *  in the tabs state they name splitPartner(chain, chain.recent) — the window
   *  the click WILL use. `recent` changes on every tab switch, so switchTab
   *  re-labels (split r1: a label computed once at render named a stale partner). */
  _labelSplitBtn(chain, btn) {
    if (!chain || !btn) return;
    const label = chain.layout === 'split' && chain.split && Array.isArray(chain.split.pair) // the same predicate as _renderTabBar's isSplit
      ? t('Shown side by side — click for Unsplit / Swap')
      : t('Show side by side — this tab on the left, {name} on the right', { name: String(this.windows.get(splitPartner(chain, chain.recent))?.title || '') });
    btn.title = label;
    btn.setAttribute('aria-label', label);
  },

  switchTab(chain, index) {
    if (index < 0 || index >= chain.tabs.length) return;
    const hostWin = this.windows.get(chain.tabs[0]);
    if (!hostWin) return;
    this._normalizeChain(chain);
    const targetId = chain.tabs[index];
    let pairChanged = false;
    if (chain.layout === 'split' && chain.split && !chain.split.pair.includes(targetId)) {
      // D19 (a): a THIRD tab of a split chain replaces the NON-ANCHOR pane in
      // place — the binding survives (the pane the browser is bound TO stays
      // put), and the pane that changes is the one that was not the anchor.
      const out = splitReplaceable(chain);
      const i = chain.split.pair.indexOf(out);
      if (i >= 0) { chain.split.pair[i] = targetId; pairChanged = true; }
    }
    const prevWin = this.windows.get(chain.tabs[chain.active]);
    if (prevWin) prevWin.content.classList.add('tab-hidden');
    // the recent tabs (most recent first) = the default side-by-side partner (local, never persisted)
    const prevId = chain.tabs[chain.active];
    chain.recent = [targetId, ...(prevId && prevId !== targetId ? [prevId] : []), ...(Array.isArray(chain.recent) ? chain.recent : []).filter((x) => x !== targetId && x !== prevId && chain.tabs.includes(x))].slice(0, 16);
    chain.active = index;
    const newWin = this.windows.get(chain.tabs[index]);
    if (newWin) {
      newWin.content.classList.remove('tab-hidden');
      // Switching to the tab acknowledges its waiting blink — its own titlebar
      // is hidden (the shared tab bar stands in), so the usual focus-clears
      // path doesn't reach it. The class IS the indicator contract (terminal
      // and chat both read/toggle it directly), so clearing here is consistent.
      newWin.element.classList.remove('window-waiting');
    }
    // the strip is in VISUAL order — mark by window id, never by strip index
    const tabs = hostWin.titleBar.querySelectorAll('.tab-item');
    tabs.forEach((t) => { t.classList.toggle('active', t.dataset.winId === targetId); t.classList.toggle('tab-split-focus', t.classList.contains('tab-pane') && t.dataset.winId === targetId); });
    this._fitChipsSoon?.(hostWin); // the active tab's label is drawn bolder — its billing chip re-decides (lane G: the title wins)
    this.activeWindowId = chain.tabs[index];
    this.syncHiddenViews?.(); // the guest's content just flipped display (inc-mu6bfv1t-4drq)
    this._applyChainLayout(chain); // re-derives every pane's display (a split keeps its pair shown) and syncs again
    if (pairChanged) this._renderTabBar(chain);
    else this._labelSplitBtn(chain, hostWin.titleBar.querySelector(':scope > .tab-split-btn')); // `recent` moved ⇒ so did the default partner
    requestAnimationFrame(() => this._resizePanes(chain));
    this._notify();
  },

  _setupTabDrag(tabEl, winId, chain) {
    let mouseDown = false, startX = 0, startY = 0, detached = false;
    let mergeTarget = null;
    let mergeGhost = null;
    let savedBounds = null;
    let dragCtl = null;
    const endDrag = () => { if (dragCtl) { dragCtl.abort(); dragCtl = null; } };

    tabEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tab-close') || e.button !== 0) return;
      if (chain.tabs.length <= 1) return;
      mouseDown = true; detached = false; mergeTarget = null;
      startX = e.clientX; startY = e.clientY;
      // Drag listeners live on a per-drag controller, NOT chain._tabCtl:
      // detaching re-renders the tab bar (which aborts _tabCtl) MID-DRAG, which
      // used to kill onMove/onUp — freezing the drag and leaving the grid
      // highlight stuck until something else repainted it.
      endDrag();
      dragCtl = new AbortController();
      document.addEventListener('mousemove', onMove, { signal: dragCtl.signal });
      document.addEventListener('mouseup', onUp, { signal: dragCtl.signal });
      e.preventDefault();
    });

    const processMove = (e) => {
      if (!mouseDown) return;
      if (!detached && Math.abs(e.clientY - startY) > 30) {
        detached = true;
        this._detachFromChain(chain, winId);
        const win = this.windows.get(winId);
        if (!win) { mouseDown = false; return; }
        // Raise to front so the detached window isn't hidden behind others
        // (especially the original tab chain host it came from).
        this.focusWindow(winId);
        // clientX/Y are viewport coords, style.left/top are workspace coords
        // (sidebar/toolbar offset) — same fix as window.js's un-snap re-anchor
        const w = parseInt(win.element.style.width) || 700;
        const wr0 = this.workspace.getBoundingClientRect();
        win.element.style.left = ((e.clientX - wr0.left) / uiScale() - w / 2) + 'px';
        win.element.style.top = ((e.clientY - wr0.top) / uiScale() - 15) + 'px';
        win.element.classList.add('dragging');
        if (this.grid) this.gridOverlay.classList.add('dragging');
      }
      if (!detached) return;
      const win = this.windows.get(winId);
      if (!win) return;

      // Hit-test merge targets first (takes priority over snap). Matches the
      // window.js titleBar-drag pattern: window follows cursor normally in
      // empty space, but collapses to a small ghost preview while hovering
      // another window's icon/tab bar.
      const prevMerge = mergeTarget;
      mergeTarget = this._detectTabMergeTarget(e.clientX, e.clientY, winId, [win.element, mergeGhost].filter(Boolean));
      for (const [, w] of this.windows) {
        w.element.classList.toggle('tab-drop-target', w === mergeTarget);
      }

      if (mergeTarget && !prevMerge) {
        // Entering merge zone: save window bounds, hide it, show ghost
        savedBounds = { left: win.element.style.left, top: win.element.style.top, width: win.element.style.width, height: win.element.style.height };
        win.element.style.display = 'none';
        mergeGhost = document.createElement('div');
        mergeGhost.className = 'tab-ghost';
        const ghostIcon = win.backendIconSlot?.children.length ? win.backendIconSlot.children[0].cloneNode(true).outerHTML : (win._typeIcon || '');
        mergeGhost.innerHTML = `<span>${ghostIcon}</span><span>${escHtml(win.title)}</span>`;
        document.body.appendChild(mergeGhost);
        this.snapIndicator.style.display = 'none';
        this._clearGridHighlight();
      } else if (!mergeTarget && prevMerge && mergeGhost) {
        // Leaving merge zone: remove ghost, restore window, re-sync to cursor
        mergeGhost.remove(); mergeGhost = null;
        win.element.style.display = '';
        if (savedBounds) {
          win.element.style.width = savedBounds.width;
          win.element.style.height = savedBounds.height;
          savedBounds = null;
        }
      }

      if (mergeGhost) {
        mergeGhost.style.left = (e.clientX / uiScale() + 12) + 'px';
        mergeGhost.style.top = (e.clientY / uiScale() + 12) + 'px';
      } else {
        // Not in merge zone: window follows cursor + snap/grid indicators
        // (cursor converted to workspace space — viewport coords drift by the
        // sidebar width otherwise)
        const w = parseInt(win.element.style.width) || 700;
        const wr1 = this.workspace.getBoundingClientRect();
        win.element.style.left = ((e.clientX - wr1.left) / uiScale() - w / 2) + 'px';
        win.element.style.top = ((e.clientY - wr1.top) / uiScale() - 15) + 'px';
        if (!e.altKey) {
          if (this.grid) this._showGridHighlight(e.clientX, e.clientY);
          else this._showSnap(e.clientX, e.clientY);
        }
      }
    };
    // rAF-coalesce the merge hit-test + highlight work (see window.js drag)
    let pendingEv = null, moveRaf = 0;
    const onMove = (e) => {
      if (!mouseDown) return;
      pendingEv = e;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => { moveRaf = 0; const ev = pendingEv; pendingEv = null; if (ev && mouseDown) processMove(ev); });
    };

    const onUp = (e) => {
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; pendingEv = null; }
      // Release the per-drag listeners first — the drag is over regardless of
      // which branch we take below (safe to abort the signal mid-handler).
      endDrag();
      if (!mouseDown) return;
      mouseDown = false;
      if (!detached) return;
      const win = this.windows.get(winId);
      if (!win) return;
      win.element.classList.remove('dragging');
      this.snapIndicator.style.display = 'none';
      this.gridOverlay.classList.remove('dragging');
      for (const [, w] of this.windows) w.element.classList.remove('tab-drop-target');
      // split UX R1: no drop ever splits — a tab dragged out is moved / snapped / merged, nothing else

      // Merge into another window's tab group takes priority over snap
      if (mergeTarget && mergeTarget.id !== winId) {
        if (mergeGhost) { mergeGhost.remove(); mergeGhost = null; }
        // Window still display:none from merge zone — addToTabChain/createTabChain
        // will manage it as a tab guest, so no need to restore.
        if (mergeTarget._tabChain) this.addToTabChain(mergeTarget._tabChain, win);
        else this.createTabChain(mergeTarget, win);
        this._afterUserMerge(win._tabChain); // the bridge to the explicit second step
        mergeTarget = null;
        savedBounds = null;
        this._clearGridHighlight();
        return;
      }
      mergeTarget = null;

      // Not a merge drop — clean up any leftover ghost state
      if (mergeGhost) { mergeGhost.remove(); mergeGhost = null; }
      if (win.element.style.display === 'none') {
        win.element.style.display = '';
        if (savedBounds) {
          win.element.style.width = savedBounds.width;
          win.element.style.height = savedBounds.height;
          savedBounds = null;
        }
        // Reposition to cursor since window was hidden during merge hover
        // (workspace space — see the detach-site note)
        const w = parseInt(win.element.style.width) || 700;
        const wr2 = this.workspace.getBoundingClientRect();
        win.element.style.left = ((e.clientX - wr2.left) / uiScale() - w / 2) + 'px';
        win.element.style.top = ((e.clientY - wr2.top) / uiScale() - 15) + 'px';
      }
      savedBounds = null;

      let snapped = false;
      if (!e.altKey) {
        if (this.grid) { this._snapToGrid(winId, e.clientX, e.clientY); snapped = true; }
        else { const snap = this._getSnapZone(e.clientX, e.clientY); if (snap) { this._applySnap(winId, snap); snapped = true; } }
      }
      if (snapped) win._isSnapped = true;
      this._clearGridHighlight();
      setTimeout(() => { this._captureGridBounds(win); this._scheduleOverlapUpdate(); this._notify(); }, 250);
    };

  },

  _detachFromChain(chain, winId) {
    const idx = chain.tabs.indexOf(winId);
    if (idx < 0) return;
    const win = this.windows.get(winId);
    if (!win) return;
    // The detached window's standalone title bar needs its badge back.
    queueMicrotask(() => { if (win._authBadge !== undefined) this.setAuthBadge(winId, win._authBadge); });
    const hostWin = this.windows.get(chain.tabs[0]);
    const isHost = idx === 0;
    // §4.6: the split renders INSIDE the host's element — whoever leaves (and an
    // old host on promotion) sheds every split mark; the survivor re-derives.
    this._clearSplitDom(win);
    if (hostWin && hostWin !== win) this._clearSplitDom(hostWin);

    if (isHost && chain.tabs.length > 1) {
      const newHostId = chain.tabs[1];
      const newHost = this.windows.get(newHostId);
      if (!newHost) return;
      for (let i = 1; i < chain.tabs.length; i++) {
        const gw = this.windows.get(chain.tabs[i]);
        if (gw && gw.id !== winId) {
          hostWin.element.removeChild(gw.content);
          newHost.element.appendChild(gw.content);
        }
      }
      newHost.element.style.left = hostWin.element.style.left;
      newHost.element.style.top = hostWin.element.style.top;
      newHost.element.style.width = hostWin.element.style.width;
      newHost.element.style.height = hostWin.element.style.height;
      newHost.element.style.zIndex = hostWin.element.style.zIndex;
      newHost.element.style.display = '';
      newHost.gridBounds = hostWin.gridBounds ? { ...hostWin.gridBounds } : null;
      newHost.isMaximized = hostWin.isMaximized;
      newHost.prevBounds = hostWin.prevBounds;
      chain.tabs.splice(idx, 1);
      if (chain.active >= chain.tabs.length) chain.active = chain.tabs.length - 1;
      if (chain.active < 0) chain.active = 0;
    } else {
      if (hostWin && hostWin.element.contains(win.content)) {
        hostWin.element.removeChild(win.content);
        win.element.appendChild(win.content);
      }
      chain.tabs.splice(idx, 1);
      if (chain.active >= chain.tabs.length) chain.active = chain.tabs.length - 1;
      if (chain.active < 0) chain.active = 0;
    }

    win.content.classList.remove('tab-hidden');
    win._tabChain = null;
    this._notifyChainChange([win.id]);
    if (hostWin && win.id !== hostWin.id) {
      win.element.style.left = hostWin.element.style.left;
      win.element.style.top = hostWin.element.style.top;
      win.element.style.width = hostWin.element.style.width;
      win.element.style.height = hostWin.element.style.height;
      win.element.style.zIndex = hostWin.element.style.zIndex;
      win.gridBounds = hostWin.gridBounds ? { ...hostWin.gridBounds } : null;
    }
    win.element.style.display = '';
    const standaloneIcon = win.titleBar.querySelector(':scope > .window-icon-stack');
    if (standaloneIcon) standaloneIcon.style.display = '';
    win.titleSpan.style.display = '';
    const existingTabBar = win.titleBar.querySelector('.tab-bar-tabs');
    if (existingTabBar) existingTabBar.remove();
    this._placeInboxBadge(win); // standalone again ⇒ its mini inbox badge is back on its own bar

    this._normalizeChain(chain); // a pair member that left ⇒ layout collapses to tabs (never a dangling id)
    if (chain.tabs.length <= 1) {
      this._ungroupLast(chain);
      // The remaining (now standalone) window's title bar needs its badge
      // back immediately — not on the next identity broadcast.
      const last = this.windows.get(chain.tabs[0]);
      queueMicrotask(() => { if (last && last._authBadge !== undefined) this.setAuthBadge(last.id, last._authBadge); });
    } else {
      const currentHost = this.windows.get(chain.tabs[0]);
      if (currentHost) {
        const activeWin = this.windows.get(chain.tabs[chain.active]);
        if (activeWin) activeWin.content.classList.remove('tab-hidden');
        this._applyChainLayout(chain);
        this._renderTabBar(chain);
      }
    }

    requestAnimationFrame(() => { if (win.onResize) win.onResize(); });
    this._notify();
  },

  removeFromTabChain(chain, winId) {
    const win = this.windows.get(winId);
    if (!win) return;
    win._listenerCtl?.abort(); // release document-level listeners (also reached via tab ✕, not just closeWindow)
    this._detachFromChain(chain, winId);
    if (win.onClose) win.onClose();
    win.element.remove();
    this.windows.delete(winId);
    this._notify(); this._scheduleOverlapUpdate();
    // Closing the active tab: hand focus to the chain's new active tab (or the
    // MRU window if the chain dissolved) so keyboard commands / taskbar active
    // state don't point at a deleted id
    if (this.activeWindowId === winId) {
      this.activeWindowId = null;
      const next = chain.tabs[chain.active] ?? chain.tabs[0];
      if (next && this.windows.has(next)) {
        this.focusWindow(next);
      } else {
        let best = null, bestZ = -1;
        for (const [wid, w] of this.windows) {
          if (w._hiddenByDesktop || w.isMinimized) continue;
          if (w._tabChain && w._tabChain.tabs[0] !== w.id) continue;
          const z = parseInt(w.element.style.zIndex) || 0;
          if (z > bestZ) { best = wid; bestZ = z; }
        }
        if (best) this.focusWindow(best);
      }
    }
  },

  _ungroupLast(chain) {
    if (chain.tabs.length !== 1) return;
    const lastWin = this.windows.get(chain.tabs[0]);
    if (!lastWin) return;
    lastWin._tabChain = null;
    this._notifyChainChange([lastWin.id]);
    this._clearSplitDom(lastWin);
    lastWin.content.classList.remove('tab-hidden');
    const standaloneIcon = lastWin.titleBar.querySelector(':scope > .window-icon-stack');
    if (standaloneIcon) standaloneIcon.style.display = '';
    lastWin.titleSpan.style.display = '';
    const tabBar = lastWin.titleBar.querySelector('.tab-bar-tabs');
    if (tabBar) tabBar.remove();
    this._placeInboxBadge(lastWin);
    lastWin.element.style.display = '';
    requestAnimationFrame(() => { if (lastWin.onResize) lastWin.onResize(); });
  },

  restoreTabChain(tabIds, activeIndex, { layout, split } = {}) {
    if (!tabIds || tabIds.length < 2) return;
    const hostWin = this.windows.get(tabIds[0]);
    if (!hostWin) return;
    const chain = { tabs: [], active: activeIndex || 0, layout: layout === 'split' ? 'split' : 'tabs', split: split ? { pair: Array.isArray(split.pair) ? [...split.pair] : [], ratio: split.ratio, dir: 'row' } : undefined };
    chain.tabs.push(hostWin.id);
    hostWin._tabChain = chain;
    for (let i = 1; i < tabIds.length; i++) {
      const guestWin = this.windows.get(tabIds[i]);
      if (!guestWin) continue;
      chain.tabs.push(guestWin.id);
      guestWin._tabChain = chain;
      guestWin.content.classList.add('tab-hidden');
      hostWin.element.appendChild(guestWin.content);
      guestWin.element.style.display = 'none';
      guestWin.gridBounds = hostWin.gridBounds ? { ...hostWin.gridBounds } : null;
    }
    const activeWin = this.windows.get(chain.tabs[chain.active]);
    if (activeWin) activeWin.content.classList.remove('tab-hidden');
    if (chain.active !== 0) hostWin.content.classList.add('tab-hidden');
    this._normalizeChain(chain); // a persisted pair whose member did not come back ⇒ tabs
    this._applyChainLayout(chain);
    this._renderTabBar(chain);
  },
};
