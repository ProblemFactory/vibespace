// StageManager — the dynamic desktop ("Stage") view. Blueprint:
// docs/design-dynamic-desktop.md. Key model decisions (user-approved
// 2026-07-12): the stage is a VIEW, not an owner — one window object, two
// geometries (home gridBounds vs stage slot bounds); a single shared SLOT
// whose geometry is edited by dragging/resizing whatever occupies it
// (placeholder or hero); materialization intercepts wm.focusWindow (the one
// choke point every switch-to-session path funnels through, including
// createWindow's trailing focus).
//
// Ported field lessons from userW's feat/task-centric (task-manager.js):
//  - hero switches are SERIALIZED (lock + latest-wins queue) — two concurrent
//    async switch pipelines corrupt shared state ("white screen").
//  - reconcile/replay passes never spawn; spawn keys are tracked with a hard
//    timeout (duplicate-window race: a chat window exists long before its
//    backendSessionId fills in).
//  - hidden-state flags are SEPARATE booleans (_hiddenByStage here vs
//    _hiddenByDesktop) — never overload _desktopId. Both are REASONS written
//    only through wm.setWindowHidden; the element's marks are derived from
//    them there (inc-munl8jkl-gaih — never write a mark here).
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
import { registerWindowType } from './window-types.js';
import { stageWindowKind, stageMoveVerdict, carriedGeometry, tornOffBox, tornOffStep, givenHomeOf } from './stage-rules.js'; // inc-muly2izg-cks3: the move rule + its words (PURE); carriedGeometry = the box a half of a split BORROWED frame keeps (verify r2)

export const STAGE_ID = '__stage__';

export class StageManager {
  constructor(app) {
    this.app = app;
    this._active = false;          // this tab is currently viewing the stage
    this._heroWinId = null;        // winId of the materialized session window
    this._heroKey = null;          // backend:backendSessionId of the hero
    this._placeholderId = null;    // winId of the placeholder pseudo-window
    this._prevDesktopId = null;    // desktop to return to on leave
    this._switchInFlight = false;  // userW lesson #1: serialize switches
    this._queued = undefined;      // latest queued materialize target
    this._replayingKeys = new Map(); // userW lesson #2: spawn/replay dedup (key → timeout)
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
    // only the follow's OWN materialize echoes nothing (verify r3 of inc-munl8jkl-gaih: the 800 ms blackout was a time box
    // over EVERY publish — the user's next click within it went unpublished, the shared record stayed stale, and every
    // later enter() / remote op yanked this device back to the stale hero; found by the walk's slow-timer phase)
    if (this._applyingRemoteHero === true || (this._applyingRemoteHero && this._applyingRemoteHero === win.id)) return;
    if (!this._heroKey) return; // brand-new session, id not landed — publish next time
    const payload = JSON.stringify({ key: this._heroKey, openSpec: this._freshOpenSpec(win) || null });
    const sync = this._sync();
    if (sync && (sync.get('stage', 'hero') || '') !== payload) sync.set('stage', 'hero', payload);
  }

  _publishNoHero() {
    if (this._applyingRemoteHero === true) return; // the follow's synchronous clear branch only
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
    const replayId = 'stage-' + Math.random().toString(36).slice(2, 9);
    this._applyingRemoteHero = target ? target.id : replayId; // scoped to the window the follow materializes (verify r3)
    try {
      if (target) this.materialize(target);
      else if (rec.openSpec) this.app.replayOpenSpec(rec.openSpec, replayId);
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
    if (!dm || dm._restoring) return;
    this._active = true;
    try {
      // Capture + hide the current desktop (same primitives as dm.switchTo).
      this._prevDesktopId = dm.activeDesktopId;
      // the desktop's held record merged with what the page built there (the ONE record door — userW
      // inc-mun7qjmw-iksh; a window still being built stays in it, as switchTo's capture keeps it)
      dm._setRecord(this._prevDesktopId, dm.recordFor(this._prevDesktopId));
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
      // trip (userW's 超级重叠). Parked windows stay hidden; clicking their
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
      let hero = this._heroWinId && this.app.wm.windows.get(this._heroWinId);
      // THE FRAME IS THE HERO (verify r2): grouped off the Stage under another session's host since the leave, the
      // remembered hero comes back as its FRAME — the host is borrowed (its box the slot), the hero's tab shown
      if (hero && this._sessionHostOf(hero) !== hero.id) {
        const host = this.app.wm.windows.get(this._sessionHostOf(hero));
        if (host) { this._showTabOf(hero); hero = host; this._heroWinId = host.id; this._heroKey = this._sessionKeyFor(host); }
      }
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
      this._returnFrame(hero); // desktop-owned again (its whole group); the target loop below re-shows it if home === target
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
        // each one an ATTEMPT (userW inc-mun7qjmw-iksh, the switch's rule): one this page cannot build — no
        // openSpec, or its session already open here under another id — leaves the record at once, with evidence
        if (!this.app.wm.windows.has(winId) && (!ws.openSpec || (ws.openSpec.backendSessionId && liveSids.has(ws.openSpec.backendSessionId)))) { dm._noteAttempts(target, [winId], { at: 0 }); continue; }
        if (!this.app.wm.windows.has(winId) && ws.openSpec) {
          this.app.replayOpenSpec(ws.openSpec, winId);
          dm._noteAttempts(target, [winId]);
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

  /** Park a window by the Stage: the STAGE REASON goes on through the ONE door (WindowManager.setWindowHidden) and the
   *  marks are derived there (inc-munl8jkl-gaih — this method used to write visibility + pointer-events itself, and its
   *  show twin cleared only those two while the desktop's content-visibility stayed: an undrawn window). */
  _hideStage(win) {
    this.app.wm.setWindowHidden(win, { stage: true });
  }

  /** Un-park a window the Stage parked: its reason goes; whatever reason is left decides the marks. */
  _showWin(win) {
    this.app.wm.setWindowHidden(win, { stage: false });
  }

  /** A window's FRAME (inc-muly2izg-cks3): the window and every member of the tab chain it shows in. */
  _frameOf(win) {
    const out = [win];
    for (const id of (win && win._tabChain && Array.isArray(win._tabChain.tabs) ? win._tabChain.tabs : [])) {
      const m = id !== win.id ? this.app.wm.windows.get(id) : null;
      if (m && !out.includes(m)) out.push(m);
    }
    return out;
  }

  /** Hand a hero's FRAME back (leave, a hero switch): a window with a home desktop is the DESKTOP's again — hidden, its
   *  desktop is not on screen (a later switchTo / leave to it shows it at HOME geometry; `_hiddenByStage` is not a flag
   *  the desktop's show loops clear) — and a Stage-born one is parked by the Stage. The symmetric half of `_borrowHero`,
   *  through the same door. */
  _returnFrame(hero) {
    for (const w of this._frameOf(hero)) this.app.wm.setWindowHidden(w, w._desktopId !== STAGE_ID ? { stage: false, desktop: true } : { stage: true });
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
    return !!this.windowKind(win);
  }

  /** Which kind of Stage window `win` is ('placeholder' | 'session' | 'window'), or null — the facts read here, the
   *  rule in PURE stage-rules.js (inc-muly2izg-cks3: the same membership dragToDesktopBlocked always tested). */
  windowKind(win) {
    if (!win) return null;
    return stageWindowKind({ type: win.type, isPlaceholder: !!win._isStagePlaceholder, onStage: !!win._onStage, desktopId: win._desktopId, bound: this._boundAux.has(win.id) }, STAGE_ID);
  }

  /** May `win` move to `targetId` (a desktop id, or STAGE_ID)? The ONE verdict every door asks — the title-bar drag
   *  over a preview, a taskbar item dropped on one, "Move to Desktop", the keyboard (PURE stage-rules.js). */
  moveVerdict(win, targetId) {
    return stageMoveVerdict({ kind: this.windowKind(win), targetId, stageId: STAGE_ID });
  }

  /** Re-capture a placeholder that leaked onto a normal desktop (pre-guard
   *  versions let drag-to-preview retag it — real report). */
  healStray() {
    for (const [, win] of this.app.wm.windows) {
      if ((win.type === 'stage-placeholder' || win._isStagePlaceholder) && win._desktopId !== STAGE_ID) {
        win._desktopId = STAGE_ID;
        // the Stage's again: no desktop reason; parked while the Stage is off screen (the one door derives the marks)
        this.app.wm.setWindowHidden(win, this._active ? { desktop: false } : { desktop: false, stage: true });
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
    // THE FRAME IS THE HERO (verify r2 of inc-munl8jkl-gaih): a grouped guest is drawn by its host's element, so a
    // guest of the hero's own group is already on the Stage — its focus is the plain one (its tab shown, the host
    // raised). Materializing it put the slot on a display:none element and handed the FRAME back home: the first press
    // into a shown guest tab of the hero group (the chat's content, the title bar, a tab's ✕ — every press that
    // reaches the host element's _focusFromPointer) jumped the whole group off the slot to its home box, and the ✕
    // never closed (the strip re-drew under the pointer).
    if (this._sessionHostOf(win) === this._heroWinId) return false;
    return true;
  }

  /** The id of the SESSION host that draws `win` when it is a grouped guest of a session's frame, else `win`'s own id
   *  (a guest of an aux frame — a file viewer the user grouped a chat into — is the user's own arrangement: it
   *  materializes as itself, its frame where the user put it). */
  _sessionHostOf(win) {
    const ch = win && win._tabChain;
    const host = ch && Array.isArray(ch.tabs) && ch.tabs[0] !== win.id ? this.app.wm.windows.get(ch.tabs[0]) : null;
    return host && (host.type === 'chat' || host.type === 'terminal') ? host.id : (win ? win.id : null);
  }

  /** Show a guest's own tab on its frame (the strip re-marked in place, never rebuilt — switchTab's rule). */
  _showTabOf(win) {
    const ch = win && win._tabChain;
    const i = ch && Array.isArray(ch.tabs) ? ch.tabs.indexOf(win.id) : -1;
    if (i >= 0 && i !== ch.active) { try { this.app.wm.switchTab(ch, i); } catch {} }
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

  /** Serialized (userW lesson #1): latest queued target wins.
   *  THE FRAME IS THE HERO (verify r2): a grouped guest of a SESSION host materializes its HOST with the guest's tab
   *  shown — the host's element is what the slot is applied to and what the hand-back returns home; the hero is never a
   *  display:none element. A guest of the hero's own group is not a switch at all: its plain focus (shouldIntercept says
   *  no; direct callers land here) shows its tab and raises the host. */
  materialize(win) {
    const hostId = this._sessionHostOf(win);
    if (hostId !== win.id) {
      const host = this.app.wm.windows.get(hostId);
      if (host && hostId === this._heroWinId) { this.app.wm.focusWindow(win.id); return; } // its tab on the hero's frame — the plain (raise-only) focus: shouldIntercept says no, so it never re-enters here (test-architecture §62)
      if (host) { this._showTabOf(win); win = host; }
    }
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
   *  safer than userW's idle-close incident class (killed sessions, messages
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
    // effect). NO SLOT-SHAPED BELT HERE (verify r3 of inc-munl8jkl-gaih): the
    // box a window stands at IS its home, slot-shaped or not — a conversation
    // snapped to the same zone as the slot (a quadrant, a half: the snap
    // fractions sit inside _nearSlot's tolerance on a tall workspace) lost its
    // place to a cascade box on its first Stage visit. Every path that could
    // turn the slot into a home is closed (r1: the resume carrier, r2: the
    // split halves, r3: the maximize) and gated; a slot-sized box a pre-fix
    // version left on a desktop record is that window's status quo, kept.
    // A WINDOW MAXIMIZED AT HOME UN-MAXIMIZES FOR THE SLOT FIRST (verify r3 of inc-munl8jkl-gaih): toggleMaximize puts its
    // pre-max box back on the element and the fractions are re-read from it NOW — the box captured while it was maximized is
    // the whole workspace (window.js toggleMaximize → _captureGridBounds), and a home snapshotted from that came back
    // full-size at the next un-maximize: the pre-max box lost (measured on the real toggleMaximize). The slot hook stays
    // quiet: the hero flag is not set yet.
    if (win.isMaximized) { win._stageHomeMax = true; try { this.app.wm.toggleMaximize(win.id); } catch {} if (!win._stageHomeBounds) { try { this.app.wm._captureGridBounds(win); } catch {} } }
    if (!win._stageHomeBounds) {
      if (!win.gridBounds) { try { this.app.wm._captureGridBounds(win); } catch {} }
      win._stageHomeBounds = win.gridBounds ? { ...win.gridBounds } : this._cascadeHome();
    }
    delete win._stageGivenHome; // a borrowed window's home is its own (the stamp below served a re-formed frame)
    win._onStage = true;
    win._isStageHero = true;
    win.gridBounds = this.slotBounds();
    this.app.wm._applyGridBounds(win);
    if (win._tabChain) { try { this.app.wm._syncChainBounds(win._tabChain); } catch {} } // a guest's box mirrors its frame's (verify r2)
    // THE STAGE'S HERO IS VISIBLE BY DEFINITION (inc-munl8jkl-gaih): the Stage owns its whole FRAME now, so neither a
    // desktop nor the Stage holds a reason on the hero or on any member of its group (inc-muly2izg-cks3: a guest the
    // last leave() hid comes back WITH the hero — enter() re-shows only the hero + ITS bound aux) — the ONE derivation
    // then marks nothing: drawn, clickable, its ChatView resumed. Before, the borrow cleared the desktop FLAG and ran
    // the Stage's own show (visibility + pointer-events only): the desktop's content-visibility:hidden stayed on the
    // element and the hero was a blank box whose clicks landed on the bare div.window (a stale desktop reason would
    // also exclude it from _isStageVisible).
    for (const m of this._frameOf(win)) this.app.wm.setWindowHidden(m, { desktop: false, stage: false });
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
    // A MAXIMIZE DONE ON THE STAGE IS A SLOT EDIT (decision ③), never the home's state (verify r3 of inc-munl8jkl-gaih):
    // handed back still maximized, the hero kept the SLOT px as its prevBounds and the next un-maximize on its desktop
    // landed it there — the slot-leaks-into-desktop-records class (measured on the real toggleMaximize). Un-maximized
    // FIRST, so the home px placed below are what a re-maximize (a home that WAS maximized) records as the box to return to.
    if (hero.isMaximized) { try { this.app.wm.toggleMaximize(hero.id); } catch {} }
    if (hero.gridBounds && !hero.isMaximized) this.app.wm._applyGridBounds(hero);
    // a guest's box mirrors its frame's (verify r2 of inc-munl8jkl-gaih): the capture of a hero resized on the Stage
    // synced its guests to the SLOT (window.js _captureGridBounds → _syncChainBounds) and nothing synced them back —
    // a guest tab resumed / billing-switched off the Stage later carried the slot as its box onto the desktop
    if (hero._tabChain) { try { this.app.wm._syncChainBounds(hero._tabChain); } catch {} }
    if (hero._stageHomeMax && !hero.isMaximized) { try { this.app.wm.toggleMaximize(hero.id); } catch {} }
    delete hero._stageHomeMax;
  }

  _deactivateHero() {
    const wm = this.app.wm;
    const hero = wm.windows.get(this._heroWinId);
    if (hero) {
      if (hero._desktopId === STAGE_ID) this._adoptDesktopIdentity(hero); // late-id retry
      this._handBackHero(hero);
      // It also lives on a home desktop — hand it (its whole group) back to the
      // desktop system (hidden: its desktop isn't active while we're staged)
      // so a later switchTo/leave to that desktop shows it at HOME geometry; a
      // Stage-born hero is parked by the Stage (_returnFrame).
      this._returnFrame(hero);
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

  /** A tab TORN out of a group on the Stage (inc-muly2izg-cks3, called by tab-group.js's tab drag): the window belongs
   *  to the workspace of the FRAME it left — the hero's, or the owner of the aux group — so a leave / re-enter shows it
   *  again with that hero. A window the stage never bound (the agent's live view is auto-opened into the chat's group
   *  even while the Stage is not on screen) was hidden by the next leave and never re-shown by the enter; a window bound
   *  to ANOTHER hero leaves that hero's record (else that hero's next restore would replay a second copy). Sessions
   *  are never aux (they swap in as hero). */
  onTornOff(win, frame) {
    if (!this._active || !this.enabled || !win || !frame) return false;
    if (win.type === 'chat' || win.type === 'terminal' || win.type === 'stage-placeholder' || win._isStagePlaceholder) return false;
    const owner = frame.id === this._heroWinId ? (this._heroKey || '__pending__') : this._boundAux.get(frame.id);
    if (owner === undefined) return false; // the frame is not part of this stage's workspace
    const was = this._boundAux.get(win.id);
    if (was === owner) return false;
    this._boundAux.set(win.id, owner);
    win._stageTransient = false;
    if (was && was !== '__pending__' && was !== owner) this._dropFromRecord(was, win);
    this._scheduleRecord();
    return true;
  }

  /** A chain SPLIT while the Stage is on (tab-group _detachFromChain — a tab drag, a close, a remote regroup): `left`
   *  = the window that left, `frame` = the host of what stays. A SESSION is never a free window on the Stage: it is
   *  the hero, or it is hidden its way (its desktop's / parked). A DRAG can leave one standing on either side — the
   *  hero tore its own tab off (the promoted survivor), a guest hero was torn off (the old host) — and it stayed drawn
   *  with no reason, `leave()` did not know it, and it rode with the user onto the next desktop (verify r1 of
   *  inc-munl8jkl-gaih; before the derivation it was invisible instead, the .197 vanish). Each such session is handed
   *  back like a deactivated hero's frame; the DRAGGED one is materialized right after by the drag's own focus
   *  (tab-group.js focusWindow(winId)), so nothing the user holds disappears. A CLOSE of the hero focuses the next tab
   *  itself (removeFromTabChain), which materializes the survivor as the hero — the hand-back here is then undone by
   *  the borrow. A bound aux stays (the hero's workspace); a guest is judged through its host.
   *  THE BOX (verify r2 of inc-munl8jkl-gaih): tab-group's detach copies the HOST's box onto whoever leaves and onto a
   *  promoted survivor — and a borrowed host's box is the SLOT. The half that is not the hero carried the slot as its
   *  own box: the survivor of the hero's own tear-off / of the hero's ✕ was drawn AT THE SLOT on its desktop after the
   *  leave (and the desktop's next capture recorded it — the slot-leaks-into-desktop-records class), a torn-off guest
   *  had its slot box refused by the belt and got a CASCADE home instead of the group's. The frame's home is the
   *  borrowed member's (`_stageHomeBounds` / `_stageHomeMax`, PURE carriedGeometry): the FRAME keeps that box on the
   *  desktop — where the group stood — and the half that LEFT lands beside it (PURE tornOffBox: an off-Stage tear-off
   *  drops the torn window beside its frame; exactly on top, the survivor was hidden behind the hero after the leave). */
  onChainSplit(left, frame) {
    if (!this._active || !this.enabled) return;
    const borrowed = [left, frame].find((w) => w && w._onStage && w._stageHomeBounds) || null;
    // the frame's home, read ONCE before anything moves (PURE carriedGeometry over the borrowed member's facts)
    const home = borrowed ? carriedGeometry({ onStage: true, stageHomeBounds: borrowed._stageHomeBounds, stageHomeMax: borrowed._stageHomeMax }) : null;
    const k = home && home.gridBounds ? this._besideStep(home.gridBounds, borrowed, [left, frame]) : 0; // the step beside this home nothing occupies (verify r3: two tears stacked; verify r4: an occupancy, never a count)
    for (const w of [left, frame]) {
      if (!w || w.id === this._heroWinId || this._boundAux.has(w.id)) continue;
      if (w.type !== 'chat' && w.type !== 'terminal') continue;
      if (w._tabChain && Array.isArray(w._tabChain.tabs) && w._tabChain.tabs[0] !== w.id) continue;
      if (home && borrowed !== w) this._giveHome(w, home, { beside: w === left, k });
      this._returnFrame(w);
    }
    // the hero itself torn out of its frame: its own hand-back lands it beside where the group stood
    if (home && left === borrowed && frame && left.id === this._heroWinId) { const b = tornOffBox(home.gridBounds, undefined, k); if (b) left._stageHomeBounds = b; }
  }

  /** The cascade step the next half torn off `borrowed`'s frame takes — PURE tornOffStep over what STANDS on the frame's home
   *  desktop, never a count in memory (verify r3: two tears from one frame sat on each other; verify r4: r3's per-home count
   *  was reset by a reload — the self-update reloads the page — and the next half sat exactly on the first again, a guest's
   *  close consumed a step nothing was placed at, the seventh cycled onto the first). Left out: the two halves and every
   *  member of their chains (a borrowed frame's boxes are the slot's), the Stage's own windows. */
  _besideStep(gb, borrowed, halves = []) {
    const desk = borrowed && borrowed._desktopId;
    const skip = new Set();
    for (const h of halves) for (const m of this._frameOf(h)) if (m) skip.add(m.id);
    const occupied = [];
    for (const [, w] of this.app.wm.windows) {
      if (skip.has(w.id) || w._isStagePlaceholder || w.type === 'stage-placeholder' || w._onStage || !w.gridBounds) continue;
      if (desk && w._desktopId !== desk) continue;
      occupied.push(w.gridBounds);
    }
    return tornOffStep(gb, occupied); // (verify r4: the occupancy; the r3 counter is gone)
  }

  /** A half of a split borrowed frame takes the frame's HOME (`home` = carriedGeometry's box + maximize state) as its
   *  own box — the frame the home itself, the half that left (`beside`) one cascade step off it (the element placed, a
   *  maximized home re-maximized over the home px exactly as _handBackHero does) — never the slot it inherited from the
   *  host's element. */
  _giveHome(w, home, { beside = false, k = 0 } = {}) {
    if (!home || !home.gridBounds) return;
    w.gridBounds = (beside && tornOffBox(home.gridBounds, undefined, k)) || { ...home.gridBounds };
    w._stageGivenHome = { gridBounds: { ...home.gridBounds }, isMaximized: !!home.isMaximized, at: { ...w.gridBounds } }; // the FRAME's home this half came from + the box it was placed at (verify r3: a record that re-forms the frame around it hands the home back; verify r4: only while the half still stands there — PURE givenHomeOf)
    try { this.app.wm._applyGridBounds(w); } catch {}
    if (w._tabChain) { try { this.app.wm._syncChainBounds(w._tabChain); } catch {} } // its remaining guests mirror it (a 3-tab group: the third tab kept the slot — the r2 walk, seed 23)
    if (home.isMaximized && !w.isMaximized) { try { this.app.wm.toggleMaximize(w.id); } catch {} }
  }

  /** A chain GAINED a member while the Stage is on (tab-group createTabChain / addToTabChain / restoreTabChain — the
   *  icon drag, a merge drop, a remote record applied in place). THE FRAME IS THE HERO (verify r2): if the hero is now
   *  a GUEST of another session's frame — a remote regroup that names that session as the host — the hero is drawn by
   *  a host the Stage never borrowed: a hidden host on its desktop (the hero vanished, the .197 class) or one at its
   *  home box (the group off the slot). The frame's host materializes (the hero's hand-back, the host's borrow, the
   *  hero's tab shown — materialize's own resolution). A hero grouped INTO an aux frame (a chat dropped onto a file
   *  viewer) is the user's arrangement and stays as it is. */
  onChainJoined(chain, { restored = false } = {}) {
    if (!this._active || !this.enabled || !this._heroWinId) return;
    if (!chain || !Array.isArray(chain.tabs) || chain.tabs[0] === this._heroWinId || !chain.tabs.includes(this._heroWinId)) return;
    const hero = this.app.wm.windows.get(this._heroWinId);
    if (!hero || this._sessionHostOf(hero) === hero.id) return;
    // A RECORD THAT RE-FORMS THE HERO'S OWN FRAME (verify r3 of inc-munl8jkl-gaih): layout.js _reconcileChain detaches every
    // member and restores the record — the detach handed the leaving half a box BESIDE the frame's home (onChainSplit cannot
    // know a re-join follows), and the borrow of the re-formed frame's host snapshotted that box as the group's home: the
    // group crept one cascade step per regroup (measured in Chrome). A host that was a half of the hero's frame (`_stageGivenHome`,
    // _giveHome's stamp) takes the FRAME's home back; a user's own merge (createTabChain / addToTabChain) is where he put it.
    const host = restored ? this.app.wm.windows.get(this._sessionHostOf(hero)) : null;
    // …and only while that half still STANDS where the Stage put it (verify r4): the user moved it by hand off the Stage
    // since (or a record placed it elsewhere) ⇒ his box is the home, the stale stamp is dropped (PURE givenHomeOf)
    const given = host && !host._stageHomeBounds ? givenHomeOf(host._stageGivenHome, { gridBounds: host.gridBounds, isMaximized: host.isMaximized }) : null;
    if (given) { host._stageHomeBounds = given.gridBounds; host._stageHomeMax = given.isMaximized; }
    this.materialize(hero);
  }

  /** Take ONE window's entry out of another hero's workspace record (the torn-off re-own's other half) — that record's
   *  other entries stay as written (some may be LRU-closed windows that exist only there). */
  _dropFromRecord(key, win) {
    if (!key || key === '__pending__' || !win?._openSpec) return;
    const recs = this._workspaceRecords(key);
    const want = [JSON.stringify(win._openSpec), JSON.stringify(this._freshOpenSpec(win))];
    const i = recs.findIndex((r) => want.includes(JSON.stringify(r?.openSpec || null)));
    if (i < 0) return;
    recs.splice(i, 1);
    this._sync()?.set('stage', 'ws:' + key, JSON.stringify(recs));
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
   *  missing ones (userW lesson #2: dedup by key, reconcile never spawns). */
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

  /** B-8194 (H4 null-key race): a hero staged before its backend id landed
   *  published NOTHING (_publishHero early-returns on null _heroKey) and
   *  nothing re-published when the id arrived — other clients' walk-over
   *  followed a stale hero record. app.syncSessionIdentity calls this on
   *  every merge; once the id exists we adopt the real key, re-own aux bound
   *  under '__pending__', and publish. No-op guard keeps the per-poll cost nil. */
  onIdentitySync() {
    if (!this._active || !this.enabled || this._heroKey || !this._heroWinId) return;
    const win = this.app.wm.windows.get(this._heroWinId);
    if (!win) return;
    const key = this._sessionKeyFor(win);
    if (!key) return;
    this._heroKey = key;
    for (const [winId, owner] of [...this._boundAux]) {
      if (owner === '__pending__') this._boundAux.set(winId, key);
    }
    this._publishHero(win);
    this._scheduleRecord?.();
  }

  _sessionKeyFor(win) {
    const spec = win._openSpec;
    if (spec?.backendSessionId) return `${spec.backend || 'claude'}:${spec.backendSessionId}`;
    return null; // fills in later via syncSessionIdentity; workspace records need it (Phase C)
  }
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── stage-only pseudo-window: never
// enters a desktop record (persist:false), no openSpec action.
registerWindowType({
  type: 'stage-placeholder', label: 'Stage', persist: false,
  icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/></svg>',
});
