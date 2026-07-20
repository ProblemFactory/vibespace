// StageManager — the dynamic desktop ("Stage") view. Blueprint:
// docs/design-dynamic-desktop.md. Key model decisions (user-approved
// 2026-07-12): the stage is a VIEW, not an owner — one window object, two
// geometries (home gridBounds vs stage slot bounds); a single shared SLOT
// whose geometry is edited by dragging/resizing whatever occupies it
// (placeholder or hero); materialization intercepts wm.focusWindow (the one
// choke point every switch-to-session path funnels through, including
// createWindow's trailing focus).
//
// Ported field lessons from walter's feat/task-centric (task-manager.js):
//  - hero switches are SERIALIZED (lock + latest-wins queue) — two concurrent
//    async switch pipelines corrupt shared state ("white screen").
//  - reconcile/replay passes never spawn; spawn keys are tracked with a hard
//    timeout (duplicate-window race: a chat window exists long before its
//    backendSessionId fills in).
//  - hidden-state flags are SEPARATE booleans (_hiddenByStage here vs
//    _hiddenByDesktop) — never overload _desktopId.
//  - closing session windows requires busy re-checks AT FIRE TIME (Phase D).
//
// Persistence: SyncStore 'stage' (versioned diff sync, reconnect recovery):
//   'slot'              → JSON {gridBounds}
//   'ws:<backend:sid>'  → JSON [{openSpec, stageBounds}]   (workspace sets)
//   'grid'              → JSON {rows, cols}                (stage's own grid)
//   'hero'              → JSON {key, openSpec}             (SHARED active hero)
//   'lru'               → JSON [sessionKey…]
// The active hero is SHARED across clients (2.112.6, user directive — the
// 挂机/walk-over scenario); which tab is staged at all stays per-tab.

import { getStateSync, showToast } from './utils.js';
import { t } from './i18n.js';

export const STAGE_ID = '__stage__';

export class StageManager {
  constructor(app) {
    this.app = app;
    this._active = false;          // this tab is currently viewing the stage
    this._heroWinId = null;        // winId of the materialized session window
    this._heroKey = null;          // backend:backendSessionId of the hero
    this._placeholderId = null;    // winId of the placeholder pseudo-window
    this._prevDesktopId = null;    // desktop to return to on leave
    this._switchInFlight = false;  // walter lesson #1: serialize switches
    this._queued = undefined;      // latest queued materialize target
    this._replayingKeys = new Map(); // walter lesson #2: spawn/replay dedup (key → timeout)
    this._boundAux = new Map();    // winId → heroKey (live bindings this tab)
  }

  get enabled() {
    return this.app.settings?.get('desktop.dynamicEnabled') === true && !this.app.isMobile;
  }

  get isActive() { return this._active; }
  get heroKey() { return this._heroKey; }

  async init() {
    const sync = getStateSync();
    if (sync) {
      await sync.init('stage');
      // Multi-client live sync: StateSync events fire for REMOTE ops only
      // (the server excludes the sender), so no self-echo guard is needed.
      sync.on('stage', '*', (value, key) => { try { this._onRemoteStageOp(key); } catch (e) { console.error('[Stage] remote op failed:', e); } });
    }
    // Live-apply the settings toggle: the switcher's stage preview appears/
    // disappears immediately (its digest includes stage.enabled — it just
    // needs a render kick); turning the feature OFF while actually staged
    // returns to the previous desktop first.
    this.app.settings?.on('desktop.dynamicEnabled', () => {
      if (!this.enabled && this._active) this.leave();
      else this.app.desktopManager?._renderSwitcher();
    });
    setTimeout(() => this.healStray(), 3000); // past layout restore
  }

  /** Another client changed stage state — mirror it live (same philosophy as
   *  layout-sync: CONTENT mirrors across clients; which VIEW a tab looks at
   *  — staged or not, which hero — stays per-tab like the active desktop). */
  _onRemoteStageOp(key) {
    if (!this.enabled) return;
    if (key === 'slot') {
      if (this._active && !this.app.layoutManager?._pointerDown) {
        const occ = this.app.wm.windows.get(this._heroWinId || this._placeholderId);
        if (occ && !occ._hiddenByStage) { occ.gridBounds = this.slotBounds(); this.app.wm._applyGridBounds(occ); }
      }
      this.app.desktopManager?.refreshSwitcher?.();
    } else if (key === 'grid') {
      if (!this._active) return;
      const g = this.stageGrid();
      if (g) this.app.wm.setGrid(g.rows, g.cols); else this.app.wm.setGrid(null);
    } else if (key === 'hero') {
      if (!this._active) return; // not staged — enter() adopts the shared hero
      clearTimeout(this._heroFollowTimer);
      this._heroFollowTimer = setTimeout(() => this._followRemoteHero(), 150);
    } else if (key.startsWith('ws:')) {
      // a workspace set was rewritten — if it's OUR active hero, reconcile
      const k = key.slice(3);
      if (this._active && this._heroWinId && this._heroKey && k === this._heroKey) {
        clearTimeout(this._wsReconcileTimer);
        this._wsReconcileTimer = setTimeout(() => this._reconcileWorkspace(k), 400);
      }
    }
  }

  /** Shared-view sync (user directive: 挂机 scenario — a device left idle on
   *  the stage must mirror what the user does on another device, so walking
   *  over shows the CURRENT workspace). The active hero is SHARED state in
   *  the stage store ('hero' → {key, openSpec}); staged clients follow
   *  changes live, and entering the stage adopts the shared hero. This
   *  supersedes the v1 "hero is per-tab" decision. */
  _publishHero(win) {
    if (this._applyingRemoteHero) return;
    if (!this._heroKey) return; // brand-new session, id not landed — publish next time
    const payload = JSON.stringify({ key: this._heroKey, openSpec: this._freshOpenSpec(win) || null });
    const sync = this._sync();
    if (sync && (sync.get('stage', 'hero') || '') !== payload) sync.set('stage', 'hero', payload);
  }

  _publishNoHero() {
    if (this._applyingRemoteHero) return;
    const sync = this._sync();
    if (sync && sync.get('stage', 'hero')) sync.set('stage', 'hero', ''); // '' deletes the key
  }

  /** Apply the shared hero locally (debounced from the remote op / on enter).
   *  Deferred while the local pointer is down — never yank mid-interaction. */
  _followRemoteHero() {
    if (!this._active || !this.enabled) return;
    if (this.app.layoutManager?._pointerDown) {
      clearTimeout(this._heroFollowTimer);
      this._heroFollowTimer = setTimeout(() => this._followRemoteHero(), 900);
      return;
    }
    let rec = null;
    try { const raw = this._sync()?.get('stage', 'hero'); rec = raw ? JSON.parse(raw) : null; } catch {}
    if (!rec || !rec.key) {
      // shared hero cleared (closed on another client) → placeholder here too
      if (this._heroWinId) {
        this._applyingRemoteHero = true;
        try {
          this._recordActiveWorkspace();
          this._deactivateHero();
          this._ensurePlaceholder();
          this.app.desktopManager?._renderSwitcher();
        } finally { this._applyingRemoteHero = false; }
      }
      return;
    }
    if (rec.key === this._heroKey) return; // already showing it
    let target = null;
    for (const [, w] of this.app.wm.windows) {
      const sid = w._openSpec?.backendSessionId;
      if (sid && `${w._openSpec.backend || 'claude'}:${sid}` === rec.key) { target = w; break; }
    }
    this._applyingRemoteHero = true;
    try {
      if (target) this.materialize(target);
      else if (rec.openSpec) this.app.replayOpenSpec(rec.openSpec, 'stage-' + Math.random().toString(36).slice(2, 9));
    } finally {
      // materialize is serialized/async — hold the flag briefly so the inner
      // publish sees it (a same-value publish is a no-op anyway).
      setTimeout(() => { this._applyingRemoteHero = false; }, 800);
    }
  }

  /** Debounced re-record of the active workspace — keeps the ws:<key> record
   *  live for other staged clients (aux create/close/move), not just at
   *  switch/leave time. */
  _scheduleRecord() {
    if (!this._active || !this._heroWinId) return;
    clearTimeout(this._recordTimer);
    this._recordTimer = setTimeout(() => { if (this._active && this._heroWinId) this._recordActiveWorkspace(); }, 500);
  }

  /** Remote-driven reconcile: show/replay members per the record (that's
   *  _restoreWorkspace), then close local bound aux whose spec is GONE from
   *  the record (another client closed it) — except dirty editors. */
  _reconcileWorkspace(key) {
    if (!this._active || key !== this._heroKey) return;
    const specs = new Set(this._workspaceRecords(key).map((r) => JSON.stringify(r.openSpec || null)));
    for (const [winId, owner] of [...this._boundAux]) {
      if (owner !== key) continue;
      const aux = this.app.wm.windows.get(winId);
      if (!aux) { this._boundAux.delete(winId); continue; }
      if (aux._openSpec && !specs.has(JSON.stringify(aux._openSpec))) {
        if (typeof aux._editorDirty === 'function' && aux._editorDirty()) continue; // never lose unsaved edits
        this._boundAux.delete(winId);
        try { this.app.wm.closeWindow(winId); } catch {}
      }
    }
    this._restoreWorkspace(key);
  }

  /** Lazy belt-and-braces: every read/write path goes through this — if the
   *  store isn't registered yet (init-order regression), register it now.
   *  StateSync.set() silently drops writes for unknown stores (that's how the
   *  "placeholder never moves" bug hid). */
  _sync() {
    const sync = getStateSync();
    if (sync && !sync.stores?.stage) sync.init('stage');
    return sync;
  }

  // ── Slot (shared geometry) ──

  slotBounds() {
    try {
      const raw = this._sync()?.get('stage', 'slot');
      const gb = raw ? JSON.parse(raw).gridBounds : null;
      if (gb && [gb.left, gb.top, gb.width, gb.height].every(Number.isFinite)) return gb;
    } catch {}
    return { left: 0, top: 0, width: 0.5, height: 0.5 }; // default: top-left quadrant
  }

  saveSlot(gridBounds) {
    if (!gridBounds) return;
    const q = (n) => Math.round(n * 10000) / 10000;
    this._sync()?.set('stage', 'slot', JSON.stringify({ gridBounds: {
      left: q(gridBounds.left), top: q(gridBounds.top), width: q(gridBounds.width), height: q(gridBounds.height),
    } }));
  }

  // ── Stage grid (the stage's own MxN snap config) ──

  stageGrid() {
    try {
      const g = JSON.parse(this._sync()?.get('stage', 'grid') || 'null');
      if (g && g.rows > 0 && g.cols > 0) return g;
    } catch {}
    return null;
  }

  /** Called from the layout autosave gate while staged (desktop autosave is
   *  suppressed then — this is the stage's own persistence for the one piece
   *  of stage-level layout state outside the workspace records: the grid). */
  onStageLayoutChanged() {
    const g = this.app.wm.grid;
    const next = JSON.stringify(g ? { rows: g.rows, cols: g.cols } : null);
    const sync = this._sync();
    if (sync && (sync.get('stage', 'grid') || 'null') !== next) sync.set('stage', 'grid', next);
  }

  // ── Enter / leave the stage view ──

  async enter() {
    if (this._active || !this.enabled) return;
    const dm = this.app.desktopManager;
    const lm = this.app.layoutManager;
    if (!dm || dm._restoring) return;
    this._active = true;
    try {
      // Capture + hide the current desktop (same primitives as dm.switchTo).
      this._prevDesktopId = dm.activeDesktopId;
      const state = lm.captureState();
      dm._savedStates.set(this._prevDesktopId, state);
      for (const [, win] of this.app.wm.windows) {
        if (win._desktopId === dm.activeDesktopId && !win._hiddenByDesktop) dm._hideWin(win);
      }
      // The stage takes over the active-desktop pointer so windows created on
      // it are tagged STAGE_ID; desktop autosave is SUPPRESSED while active
      // (layout.js gate) — the stage persists through its own SyncStore.
      dm._activeId = STAGE_ID;
      const g = this.stageGrid(); // the stage's own persisted grid config
      if (g) this.app.wm.setGrid(g.rows, g.cols); else this.app.wm.setGrid(null);
      this.healStray();
      this._ensurePlaceholder();
      // Re-show ONLY this tab's LIVE hero workspace (the remembered hero +
      // aux bound to it). The old blanket every-_hiddenByStage re-show also
      // resurrected every slot-PARKED ex-hero (stage-created sessions hidden
      // at slot geometry by _deactivateHero accumulate for the whole staged
      // lifetime) — N sessions stacked in the slot on each desktop round
      // trip (walter's 超级重叠). Parked windows stay hidden; clicking their
      // session re-materializes them normally.
      for (const [, win] of this.app.wm.windows) {
        if (!win._hiddenByStage) continue;
        const owner = this._boundAux.get(win.id);
        if (win.id === this._heroWinId || (owner !== undefined && (owner === this._heroKey || owner === '__pending__'))) {
          this._showWin(win);
        }
      }
      // Re-borrow the live hero: leave() handed it back to its home desktop
      // (home geometry, desktop-owned hidden flag) — take it onto the slot
      // again so the stage resumes exactly where it left off.
      const hero = this._heroWinId && this.app.wm.windows.get(this._heroWinId);
      if (hero) {
        this._borrowHero(hero);
        const ph = this._placeholderId && this.app.wm.windows.get(this._placeholderId);
        if (ph) this._hideStage(ph);
      }
      // Shared-view sync: adopt the shared hero if one is published (the
      // walk-over-to-the-idle-device case — the OTHER device's operations
      // win); publish ours only when nothing is shared yet.
      if (this._sync()?.get('stage', 'hero')) {
        setTimeout(() => this._followRemoteHero(), 100);
      } else if (hero) {
        this._publishHero(hero);
      }
      dm._renderSwitcher();
      this.app.updateTaskbar();
    } finally {
      // parity with switchTo's guard release
      setTimeout(() => { dm._restoring = false; }, 0);
    }
  }

  async leave(targetDesktopId) {
    if (!this._active) return;
    this._recordActiveWorkspace();
    this._sweepTransient();
    const dm = this.app.desktopManager;
    // Target must be a LIVE desktop — _prevDesktopId can have been deleted
    // remotely while we were staged (leaving to a dead id strands _activeId).
    const validIds = new Set(dm.desktops.map((d) => d.id));
    let target = targetDesktopId || this._prevDesktopId || dm.desktops[0]?.id;
    if (!validIds.has(target)) target = dm.desktops[0]?.id;
    this._active = false;
    // Hand the hero back to the desktop system at its HOME geometry (view
    // model: the slot geometry is stage-only — real report: a hero returned
    // to its normal desktop at the stage slot size). _heroWinId stays set so
    // a re-enter re-borrows it. Heroes created ON the stage (_desktopId ===
    // STAGE_ID) have no home desktop and stay stage-hidden instead.
    const hero = this._heroWinId && this.app.wm.windows.get(this._heroWinId);
    if (hero) {
      // Late adoption retry: a hero whose backendSessionId arrived AFTER
      // materialization (createSession/resume fills openSpec async) still
      // must converge onto the desktop record before we capture/broadcast.
      if (hero._desktopId === STAGE_ID) this._adoptDesktopIdentity(hero);
      this._handBackHero(hero);
      if (hero._desktopId !== STAGE_ID) {
        hero._hiddenByStage = false;
        dm._hideWin(hero); // desktop-owned again; the target loop below re-shows it if home === target
      } else {
        this._hideStage(hero);
      }
    }
    // Hide everything else stage-visible (placeholder, aux) with the STAGE
    // flag so a re-enter can restore them instantly.
    for (const [, win] of this.app.wm.windows) {
      if (win !== hero && this._isStageVisible(win)) this._hideStage(win);
    }
    // Restore the target desktop exactly like switchTo steps 4-7.
    dm._activeId = target;
    const targetState = dm._savedStates.get(target);
    if (targetState?.grid) this.app.wm.setGrid(targetState.grid.rows, targetState.grid.cols);
    else this.app.wm.setGrid(null);
    for (const [, win] of this.app.wm.windows) {
      if (win._desktopId === target && win._hiddenByDesktop) dm._showWin(win);
    }
    this.app.wm._reflowWindows();
    if (targetState?.windows) {
      // Sessions already open locally under a DIFFERENT winId must not be
      // replayed: attachSession's same-session dedup would silently create
      // nothing and the follow-up autosave would broadcast a state missing
      // the recorded window — closing it on every other client.
      const liveSids = new Set([...this.app.wm.windows.values()].map((w) => w._openSpec?.backendSessionId).filter(Boolean));
      for (const ws of targetState.windows) {
        const winId = ws.winId || ws.id;
        if (!this.app.wm.windows.has(winId) && ws.openSpec) {
          if (ws.openSpec.backendSessionId && liveSids.has(ws.openSpec.backendSessionId)) continue;
          this.app.replayOpenSpec(ws.openSpec, winId);
          setTimeout(() => {
            const newWin = this.app.wm.windows.get(winId);
            if (newWin) {
              newWin._desktopId = target;
              if (ws.gridBounds) { newWin.gridBounds = ws.gridBounds; this.app.wm._applyGridBounds(newWin); }
            }
          }, 500);
        }
      }
    }
    dm._renderSwitcher();
    this.app.updateTaskbar();
    // Mirror switchTo's delayed digest-invalidating refreshes: replayed
    // windows get _desktopId/gridBounds in the 500ms timeout above — without
    // these the target desktop's preview misses them until an unrelated
    // interaction (same class as the switchTo white-preview fix).
    setTimeout(() => dm.refreshSwitcher(), 400);
    setTimeout(() => dm.refreshSwitcher(), 1300);
    setTimeout(() => this.app.layoutManager.scheduleAutoSave(), 300);
  }

  _isStageVisible(win) {
    if (win._hiddenByStage || win._hiddenByDesktop || win.isMinimized) return false;
    return win.id === this._placeholderId || win.id === this._heroWinId
      || this._boundAux.has(win.id) || win._desktopId === STAGE_ID
      || !!win._onStage;
  }

  _hideStage(win) {
    win.element.style.visibility = 'hidden';
    win.element.style.pointerEvents = 'none';
    win._hiddenByStage = true;
  }

  _showWin(win) {
    win.element.style.visibility = '';
    win.element.style.pointerEvents = '';
    win._hiddenByStage = false;
  }

  // ── Placeholder ──

  _ensurePlaceholder() {
    let win = this._placeholderId && this.app.wm.windows.get(this._placeholderId);
    if (win) {
      if (!this._heroWinId) { this._showWin(win); win.gridBounds = this.slotBounds(); this.app.wm._applyGridBounds(win); }
      return win;
    }
    win = this.app.wm.createWindow({ title: t('Stage'), type: 'stage-placeholder' });
    this._placeholderId = win.id;
    win._desktopId = STAGE_ID;
    win._isStagePlaceholder = true;
    win.element.classList.add('stage-placeholder');
    const hint = document.createElement('div');
    hint.className = 'stage-placeholder-hint';
    hint.textContent = t('Click any session (sidebar, taskbar, Ctrl+K) — it materializes here with its workspace.');
    win.content.appendChild(hint);
    win.gridBounds = this.slotBounds();
    this.app.wm._applyGridBounds(win);
    return win;
  }

  // ── Materialization (hero switching) ──

  /** Find the desktop record (any desktop, usually written by another client)
   *  that already holds a window for this session; converge onto it — rekey
   *  to its winId, adopt its home desktop + geometry. New sessions with no
   *  record anywhere stay stage-owned (correct: the stage created them). */
  _adoptDesktopIdentity(win) {
    const sid = win._openSpec?.backendSessionId;
    if (!sid) return; // id not known yet — a brand-new session, nothing to converge on
    const dm = this.app.desktopManager;
    for (const desk of dm.desktops) {
      const st = dm._savedStates.get(desk.id);
      for (const rw of st?.windows || []) {
        if (rw.openSpec?.backendSessionId !== sid) continue;
        const recId = rw.winId || rw.id;
        if (recId && recId !== win.id) {
          // another live local window already owns that id → divergence we
          // can't safely resolve here; leave the window stage-owned
          if (this.app.wm.windows.has(recId)) return;
          this.app.wm.rekeyWindow(win.id, recId);
          if (win.id === this._heroWinId) this._heroWinId = recId;
        }
        win._desktopId = desk.id;
        if (rw.gridBounds) win._stageHomeBounds = { ...rw.gridBounds };
        win._stageHomeMax = !!rw.isMaximized;
        return;
      }
    }
  }

  /** Stage↔desktop window drags are blocked BOTH directions (user directive
   *  2.112.4): stage-view windows (placeholder/hero/aux/stage-created) never
   *  move to a normal desktop, and normal windows never drop onto the stage
   *  preview. Real report: a dragged placeholder escaped onto a desktop. */
  dragToDesktopBlocked(win) {
    if (!win) return false;
    return win.type === 'stage-placeholder' || !!win._isStagePlaceholder
      || !!win._onStage || win._desktopId === STAGE_ID || this._boundAux.has(win.id);
  }

  /** Re-capture a placeholder that leaked onto a normal desktop (pre-guard
   *  versions let drag-to-preview retag it — real report). */
  healStray() {
    for (const [, win] of this.app.wm.windows) {
      if ((win.type === 'stage-placeholder' || win._isStagePlaceholder) && win._desktopId !== STAGE_ID) {
        win._desktopId = STAGE_ID;
        win._hiddenByDesktop = false;
        if (!this._active) this._hideStage(win);
      }
    }
  }

  /** Called from wm.focusWindow — true when the focus is being handled as a
   *  stage materialization (caller should stop its default behavior). */
  shouldIntercept(win) {
    if (!this._active || !this.enabled) return false;
    if (!win || win._isStagePlaceholder) return false;
    if (win.id === this._heroWinId) return false;              // already the hero
    if (win.type !== 'chat' && win.type !== 'terminal') return false; // sessions only
    return true;
  }

  /** Bounds ≈ the shared slot (tolerance covers layout-sync quantization). */
  _nearSlot(b) {
    const slot = this.slotBounds();
    return !!b && !!slot && ['left', 'top', 'width', 'height'].every((k) => Math.abs((b[k] ?? 0) - (slot[k] ?? 0)) < 0.005);
  }

  /** Synthesized cascade home for a window with no real home geometry. */
  _cascadeHome() {
    const k = (this._homeSeq = ((this._homeSeq || 0) + 1) % 6);
    return { left: 0.06 + 0.04 * k, top: 0.08 + 0.04 * k, width: 0.55, height: 0.65 };
  }

  /** Serialized (walter lesson #1): latest queued target wins. */
  materialize(win) {
    if (this._switchInFlight) { this._queued = win.id; return; }
    this._switchInFlight = true;
    Promise.resolve(this._materializeInner(win))
      .catch((e) => console.error('[Stage] materialize failed:', e))
      .finally(() => {
        this._switchInFlight = false;
        if (this._queued !== undefined) {
          const nextId = this._queued;
          this._queued = undefined;
          const next = this.app.wm.windows.get(nextId);
          if (next) this.materialize(next);
        }
      });
  }

  async _materializeInner(win) {
    // A materialize queued just before a leave() must not fire on the normal
    // desktop (it would deactivate the freshly handed-back hero and show the
    // target at slot bounds off-stage, corrupting _heroWinId for the next
    // round trip).
    if (!this._active) return;
    const wm = this.app.wm;
    // 1. Record + deactivate the previous hero workspace.
    if (this._heroWinId && this._heroWinId !== win.id) {
      this._recordActiveWorkspace();
      this._deactivateHero();
    }
    this._sweepTransient();
    // 2. Hide the placeholder.
    const ph = this._placeholderId && wm.windows.get(this._placeholderId);
    if (ph) this._hideStage(ph);
    // 3. Identity adoption (multi-client data-loss fix): a session window
    //    CREATED while staged is tagged _desktopId=STAGE_ID — but if some
    //    desktop's record (often written by ANOTHER client) already holds a
    //    window for this session, we must become THAT window (same winId,
    //    home desktop + geometry). Without this, leaving to that desktop
    //    captured a state missing the recorded winId and the broadcast CLOSED
    //    the window on every other client (real report: 窗口A两个客户端都消失).
    // (at creation-tail time _desktopId is still UNSET — the app.js wrapper
    // assigns it after createWindow returns, and skips windows we adopt here)
    if (!win._desktopId || win._desktopId === STAGE_ID) this._adoptDesktopIdentity(win);
    // 4. Borrow the window onto the slot (home geometry remembered; restored
    //    at hand-back so the normal-desktop layout is untouched — view model).
    this._borrowHero(win);
    this._heroWinId = win.id;
    this._heroKey = this._sessionKeyFor(win);
    // Raise without re-entering the interception path.
    wm.focusWindow(win.id, { _stageBypass: true });
    // Restore this session's recorded workspace (aux windows).
    this._restoreWorkspace(this._heroKey || this._sessionKeyFor(win));
    this._publishHero(win); // shared-view sync: other staged clients follow
    this._enforceLru();
    this.app.desktopManager?._renderSwitcher();
    this.app.updateTaskbar();
  }

  /** LRU keep-alive (design §5, v1 CONSERVATIVE): beyond the newest N
   *  workspaces, hidden AUX windows are closed (their records replay them on
   *  the next visit). Session windows are NEVER closed by the stage — strictly
   *  safer than walter's idle-close incident class (killed sessions, messages
   *  swallowed); hiding a chat/terminal is cheap. */
  _enforceLru() {
    const keep = Math.max(0, Number(this.app.settings?.get('desktop.stageKeepAlive') ?? 3));
    let lru = [];
    try { lru = JSON.parse(this._sync()?.get('stage', 'lru') || '[]'); } catch {}
    const evict = new Set(lru.slice(keep));
    if (!evict.size) return;
    for (const [winId, owner] of [...this._boundAux]) {
      if (!evict.has(owner)) continue;
      const win = this.app.wm.windows.get(winId);
      if (!win || !win._hiddenByStage) continue; // only hidden, deactivated sets
      // VOLATILE exemption (design §4b): a window backed by a temp file with
      // no re-derivation recipe (or a blob URL) cannot be replayed — closing
      // it loses it forever. Keep those hidden-alive regardless of LRU.
      const spec = win._openSpec || {};
      const volatileNoRecipe =
        (spec.action === 'openFile' && /^\/tmp\//.test(spec.path || '') && spec.via?.kind !== 'archive-entry')
        || (spec.action === 'openBrowser' && /^(blob|data):/.test(spec.url || ''))
        // an editor with UNSAVED CHANGES: closing = silent data loss
        || (typeof win._editorDirty === 'function' && win._editorDirty());
      if (volatileNoRecipe) continue;
      this._boundAux.delete(winId); // record already serialized at deactivation
      try { this.app.wm.closeWindow(winId); } catch {}
    }
  }

  /** Hide the current hero + its aux set (Phase C serializes the set). */
  /** Borrow a window onto the slot: snapshot its home state (geometry +
   *  maximize — a maximized hero must un-maximize for the slot, else the
   *  fullscreen styles override the slot bounds), then apply the shared slot.
   *  Fresh snapshot on every borrow so home edits made off-stage are kept. */
  _borrowHero(win) {
    // The home snapshot MUST exist before the slot is applied. A window born
    // while staged has NO gridBounds at borrow time (createWindow writes only
    // the pixel cascade; its creation-tail focus materializes synchronously)
    // — the old `&& win.gridBounds` guard skipped the snapshot, hand-back
    // then kept the SLOT as the window's only geometry, and the NEXT borrow
    // snapshotted the slot AS home (permanent degeneration; the pile-at-slot
    // + slot-leaks-into-desktop-records class). Capture from current pixels
    // first (stage flags not yet set, so _captureGridBounds has no slot side
    // effect); slot-degenerated bounds (pre-fix residue) get a cascade home.
    if (!win._stageHomeBounds) {
      if (!win.gridBounds) { try { this.app.wm._captureGridBounds(win); } catch {} }
      if (win.gridBounds && !this._nearSlot(win.gridBounds)) win._stageHomeBounds = { ...win.gridBounds };
      else win._stageHomeBounds = this._cascadeHome();
    }
    if (win.isMaximized) { win._stageHomeMax = true; try { this.app.wm.toggleMaximize(win.id); } catch {} }
    win._onStage = true;
    win._isStageHero = true;
    win.gridBounds = this.slotBounds();
    this.app.wm._applyGridBounds(win);
    win._hiddenByDesktop = false; // stage owns it now — a stale desktop-hidden
    this._showWin(win);           // flag would exclude it from _isStageVisible
  }

  /** Return a borrowed window to the desktop system at its HOME state.
   *  Element geometry is applied BEFORE re-maximizing so toggleMaximize
   *  records the HOME pixels as prevBounds (else a later un-maximize would
   *  land the window at the slot size). Off-stage moves then edit HOME
   *  bounds, never the slot. */
  _handBackHero(hero) {
    if (hero._stageHomeBounds) { hero.gridBounds = { ...hero._stageHomeBounds }; delete hero._stageHomeBounds; }
    // Belt: NEVER leave a hand-back at slot geometry (pre-fix borrows had no
    // snapshot, so field state can still carry slot-degenerated bounds).
    else if (this._nearSlot(hero.gridBounds)) hero.gridBounds = this._cascadeHome();
    hero._isStageHero = false;
    hero._onStage = false;
    if (hero.gridBounds && !hero.isMaximized) this.app.wm._applyGridBounds(hero);
    if (hero._stageHomeMax && !hero.isMaximized) { try { this.app.wm.toggleMaximize(hero.id); } catch {} }
    delete hero._stageHomeMax;
  }

  _deactivateHero() {
    const wm = this.app.wm;
    const hero = wm.windows.get(this._heroWinId);
    if (hero) {
      if (hero._desktopId === STAGE_ID) this._adoptDesktopIdentity(hero); // late-id retry
      this._handBackHero(hero);
      if (hero._desktopId !== STAGE_ID) {
        // It also lives on a home desktop — hand it back to the desktop
        // system (hidden: its desktop isn't active while we're staged) so a
        // later switchTo/leave to that desktop shows it at HOME geometry.
        // A plain _hideStage left it invisible there (_hiddenByStage isn't a
        // flag the desktop show loops clear).
        hero._hiddenByStage = false;
        this.app.desktopManager._hideWin(hero);
      } else {
        this._hideStage(hero);
      }
    }
    for (const [winId] of this._boundAux) {
      const aux = wm.windows.get(winId);
      if (aux) this._hideStage(aux);
    }
    this._heroWinId = null;
    this._heroKey = null;
  }

  /** Hero window closed → placeholder returns. */
  onWindowClosed(winId) {
    if (winId === this._placeholderId) { this._placeholderId = null; return; }
    if (winId === this._heroWinId) {
      // Aux set stays recorded (it was serialized on every switch/leave); hide
      // the on-stage aux windows and bring the placeholder back.
      for (const [auxId, owner] of this._boundAux) {
        if (owner !== this._heroKey && owner !== '__pending__') continue;
        const aux = this.app.wm.windows.get(auxId);
        if (aux) this._hideStage(aux);
      }
      this._heroWinId = null;
      this._heroKey = null;
      this._publishNoHero(); // mirrored intent: placeholder everywhere
      if (this._active) this._ensurePlaceholder();
      return;
    }
    if (this._boundAux.has(winId)) {
      // closing a bound aux while its hero is active = unbind from the record
      const owner = this._boundAux.get(winId);
      this._boundAux.delete(winId);
      if (owner && owner === this._heroKey) setTimeout(() => this._recordActiveWorkspace(), 0);
    }
  }

  /** Slot geometry edits: called from wm._captureGridBounds for the
   *  placeholder OR the hero (user decision ③: hero resize edits the slot). */
  onGeometryCaptured(win) {
    if (!this.enabled) return;
    if (win._isStagePlaceholder || win._isStageHero) this.saveSlot(win.gridBounds);
    else if (this._active && this._boundAux.has(win.id)) this._scheduleRecord(); // aux move → live-mirror
  }

  // ── Phase C: workspace binding ──

  /** Called from wm.createWindow. Windows created while a hero is active bind
   *  to its workspace; session-type windows never bind (they are
   *  materialization candidates — focusWindow swaps them in as hero).
   *  Windows created on an EMPTY stage are transient (user decision ⑤). */
  onWindowCreated(win) {
    if (!this._active || !this.enabled || !win) return;
    // NOTE: check the TYPE — the hook runs inside createWindow's tail, before
    // _ensurePlaceholder sets the _isStagePlaceholder flag (smoke-caught bug:
    // the placeholder got tagged transient and swept on materialization).
    if (win.type === 'stage-placeholder' || win._isStagePlaceholder || win.type === 'chat' || win.type === 'terminal') return;
    if (this._heroWinId) {
      this._boundAux.set(win.id, this._heroKey || '__pending__');
      this._scheduleRecord(); // live-mirror the new aux to other staged clients
    } else {
      win._stageTransient = true;
    }
  }

  /** Serialize the CURRENT hero's aux set into its SyncStore record.
   *  heroKey is (re)derived NOW — backendSessionId often arrives after
   *  materialization, so record-time derivation is the reliable moment. */
  /** Capture per-window view state beyond the openSpec (user requirement:
   *  restore "everything" — scroll positions, explorer path, wrap toggles…).
   *  LRU-hidden windows keep FULL state for free (visibility:hidden); this
   *  covers the REPLAY tier: a generic walker records every scrollable
   *  descendant's offsets by DOM order (index-matched on restore — brittle
   *  across renders but right for viewers/editors/settings). The live
   *  explorer path rides the openSpec itself (refreshed at record time). */
  _captureExtras(win) {
    const scrolls = [];
    try {
      const els = win.content.querySelectorAll('*');
      let idx = 0;
      for (const el of els) {
        if (el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4) {
          if (el.scrollTop || el.scrollLeft) scrolls.push({ i: idx, top: el.scrollTop, left: el.scrollLeft });
          idx++;
          if (idx > 40) break; // bound the walk
        }
      }
    } catch {}
    return scrolls.length ? { scrolls } : null;
  }

  _applyExtras(win, extras) {
    if (!extras?.scrolls?.length) return;
    const apply = () => {
      try {
        const els = win.content.querySelectorAll('*');
        const scrollables = [];
        for (const el of els) {
          if (el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4) {
            scrollables.push(el);
            if (scrollables.length > 40) break;
          }
        }
        for (const s2 of extras.scrolls) {
          const el = scrollables[s2.i];
          if (el) { el.scrollTop = s2.top; el.scrollLeft = s2.left; }
        }
      } catch {}
    };
    // content renders async (viewer fetch, editor init) — apply twice.
    setTimeout(apply, 700);
    setTimeout(apply, 2000);
  }

  /** openSpec is written at CREATION — refresh the live fields that change
   *  afterwards so the replay lands where the user left off. */
  _freshOpenSpec(win) {
    const spec = { ...(win._openSpec || {}) };
    if (win._explorerPath && spec.explorerPath !== undefined) spec.explorerPath = win._explorerPath;
    if (win._explorerPath && spec.path !== undefined) spec.path = win._explorerPath;
    return spec;
  }

  _recordActiveWorkspace() {
    const hero = this._heroWinId && this.app.wm.windows.get(this._heroWinId);
    if (!hero) return;
    const key = this._sessionKeyFor(hero);
    if (!key) return; // id not known yet — nothing durable to record under
    this._heroKey = key;
    const records = [];
    for (const [winId, owner] of this._boundAux) {
      if (owner !== key && owner !== '__pending__' && owner !== null) continue;
      const aux = this.app.wm.windows.get(winId);
      if (!aux || !aux._openSpec) continue;
      this._boundAux.set(winId, key); // settle pending owners
      records.push({ openSpec: this._freshOpenSpec(aux), stageBounds: aux.gridBounds || null, extras: this._captureExtras(aux) });
    }
    this._sync()?.set('stage', 'ws:' + key, JSON.stringify(records));
    this._touchLru(key);
  }

  _workspaceRecords(key) {
    try {
      const raw = this._sync()?.get('stage', 'ws:' + key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  _touchLru(key) {
    const sync = this._sync();
    let lru = [];
    try { lru = JSON.parse(sync?.get('stage', 'lru') || '[]'); } catch {}
    lru = [key, ...lru.filter((k) => k !== key)].slice(0, 20);
    sync?.set('stage', 'lru', JSON.stringify(lru));
  }

  /** Close transient (empty-stage) windows — user decision ⑤. */
  _sweepTransient() {
    for (const [id, win] of [...this.app.wm.windows]) {
      if (win._stageTransient) { try { this.app.wm.closeWindow(id); } catch {} }
    }
  }

  /** Restore a hero's recorded workspace: show live hidden members, replay
   *  missing ones (walter lesson #2: dedup by key, reconcile never spawns). */
  async _restoreWorkspace(key) {
    if (!key) return;
    const wm = this.app.wm;
    const live = new Set();
    for (const [winId, owner] of this._boundAux) {
      if (owner !== key) continue;
      const aux = wm.windows.get(winId);
      if (!aux) { this._boundAux.delete(winId); continue; }
      this._showWin(aux);
      if (aux.gridBounds) wm._applyGridBounds(aux);
      if (aux._openSpec) live.add(JSON.stringify(aux._openSpec));
      wm.focusWindow(winId, { _stageBypass: true });
    }
    let skipped = 0;
    for (const rec of this._workspaceRecords(key)) {
      if (!rec?.openSpec) continue;
      const specKey = JSON.stringify(rec.openSpec);
      if (live.has(specKey) || this._replayingKeys.has(specKey)) continue;
      this._replayingKeys.set(specKey, setTimeout(() => this._replayingKeys.delete(specKey), 15000));
      const winId = 'stage-' + Math.random().toString(36).slice(2, 9);
      // Restoration conditions (design §4b): validate what the spec points at
      // BEFORE replaying — a stale temp file / dead blob must not open a
      // broken viewer. Derived temps (archive entries) re-derive from their
      // recorded recipe; unrecoverable ones are skipped with one toast.
      const spec = { ...rec.openSpec };
      if (spec.action === 'openBrowser' && /^(blob|data):/.test(spec.url || '')) { skipped++; continue; }
      // Deleted task groups: the detail/log window would open and immediately
      // self-close (tasks-updated) — skip cleanly instead.
      if ((spec.action === 'openTaskDetail' || spec.action === 'openTaskLog') && spec.taskId) {
        const tasks = this.app.sidebar?._tasks;
        // unknown store shape → default to attempting the replay
        const exists = Array.isArray(tasks) && tasks.length ? tasks.some((x) => x.id === spec.taskId) : true;
        if (!exists) { skipped++; continue; }
      }
      // Workflow snapshots/journals can be gone (project dir cleaned) — probe.
      if (spec.action === 'openWorkflowDetail' && spec.runId) {
        try {
          const r = await fetch(`/api/workflow?runId=${encodeURIComponent(spec.runId)}&claudeSessionId=${encodeURIComponent(spec.claudeSessionId || '')}&cwd=${encodeURIComponent(spec.cwd || '')}${spec.host ? `&host=${encodeURIComponent(spec.host)}` : ''}`);
          if (r.status === 404) { skipped++; continue; }
        } catch {}
      }
      if ((spec.action === 'openFile' || spec.action === 'openEditor') && spec.path) {
        try {
          const info = await (await fetch(`/api/file/info?path=${encodeURIComponent(spec.path)}${spec.host ? '&host=' + encodeURIComponent(spec.host) : ''}`)).json();
          if (info?.error || info?.missing) {
            if (spec.via?.kind === 'archive-entry') {
              const r = await fetch('/api/archive/extract-entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: spec.via.archive, entry: spec.via.entry }) });
              const d = await r.json().catch(() => ({}));
              if (r.ok && d.path) spec.path = d.path; // re-derived fresh temp
              else { skipped++; continue; }
            } else { skipped++; continue; }
          }
        } catch { /* info probe failed (offline host?) — try the replay anyway */ }
      }
      try { this.app.replayOpenSpec(spec, winId); } catch { continue; }
      setTimeout(() => {
        const w = wm.windows.get(winId);
        if (!w) return;
        w._desktopId = STAGE_ID;
        this._boundAux.set(winId, key);
        if (rec.stageBounds) { w.gridBounds = rec.stageBounds; wm._applyGridBounds(w); }
        if (rec.extras) this._applyExtras(w, rec.extras);
        if (!this._active || this._heroKey !== key) this._hideStage(w); // stale replay landed late
      }, 600);
    }
    if (skipped) showToast(t('{n} workspace window(s) could not be restored (temp/blob source is gone)', { n: skipped }));
    // User decision (2026-07-12 addendum): the incoming hero sits at the
    // BOTTOM of the stage stack — a slot that was moved/resized since this
    // workspace was recorded must not cover its aux windows; the user
    // rearranges from there. Focus (input) stays on the hero; only z changes.
    const hero = this._heroWinId && wm.windows.get(this._heroWinId);
    if (hero) {
      let minZ = Infinity;
      for (const [winId, owner] of this._boundAux) {
        if (owner !== key) continue;
        const aux = wm.windows.get(winId);
        const z = aux && parseInt(aux.element.style.zIndex);
        if (Number.isFinite(z)) minZ = Math.min(minZ, z);
      }
      if (Number.isFinite(minZ)) hero.element.style.zIndex = String(minZ - 1);
    }
  }

  _sessionKeyFor(win) {
    const spec = win._openSpec;
    if (spec?.backendSessionId) return `${spec.backend || 'claude'}:${spec.backendSessionId}`;
    return null; // fills in later via syncSessionIdentity; workspace records need it (Phase C)
  }
}
