import { cssVarDefault, showContextMenu, showInputDialog, showToast, uiScale } from './utils.js';
import { startPointerDrag } from './drag-feed.js'; // THE feed for every drag door (lane-drag-release verify r2 census)
import { t } from './i18n.js';
import { stageRefusalSentence } from './stage-rules.js'; // inc-muly2izg-cks3: the Stage's move refusal, in words (PURE)
import { mergeDesktopRecord, windowIds } from './desktop-record.js'; // userW inc-mun7qjmw-iksh: a held record is a VIEW — every write merges (PURE)

/** A window this page tried to build (a desktop's first visit, the boot restore) and that is still absent this long
 *  after is one it cannot build: the record drops it, and says so to the server's belt ('unbuilt'). Before that it is
 *  in flight and stays in the record (the 2.141.1 fast-switch protection, now bounded). */
const BUILD_GRACE_MS = 20000;
/** How long a window this page closed / moved / could not build stays in the evidence every layout-sync carries. */
const DEPARTED_TTL_MS = 10 * 60 * 1000;
const DEPARTED_CAP = 200;

/**
 * DesktopManager — virtual desktop system.
 * Each desktop has its own set of windows, grid mode, and layout state.
 * Multiple clients can view different desktops simultaneously.
 */
export class DesktopManager {
  constructor(app) {
    this.app = app;
    this._desktops = [];           // [{ id, name }]
    this._activeId = null;
    this._savedStates = new Map(); // desktopId → capturedState (cached layout for non-active desktops)
    this._wireIds = new Map();     // desktopId → Set of window ids its LAST record on the wire listed (sent, applied or loaded) — the base a newer remote record is diffed against (inc-mukeyzpt-lpou)
    this._restoring = false;
    // userW inc-mun7qjmw-iksh: the desktops this page CHANGED but does not show (a move's target and source) — the
    // next autosave sends their HELD record (never a list derived from the page); the build attempts (winId → {desk,
    // at}); the evidence ledger (winId → {why, at}) every layout-sync carries for the server's shrink belt
    this._dirtyDesks = new Set();
    this._buildAttempts = new Map();
    this._departed = new Map();

    // Listen for desktop metadata updates from other clients
    app.ws.onGlobal((msg) => {
      if (msg.type === 'desktop-updated') this._onRemoteDesktopUpdated(msg);
      else if (msg.type === 'layout-sync-refused') this.onSyncRefused(msg);
    });

    // Taskbar resize handle (drag top edge to resize)
    this._setupTaskbarResize();
    this._setupToolbarResize();

    // Re-adapt sizes when preview ratio changes
    app.settings?.on('taskbar.desktopPreviewRatio', () => {
      const taskbar = document.getElementById('taskbar');
      if (taskbar) this._adaptTaskbarSize(taskbar.offsetHeight);
    });
  }

  get activeDesktopId() { return this._activeId; }
  get desktops() { return this._desktops; }

  // ── Lifecycle ──

  /** Load desktops from server layout data. Called from LayoutManager.loadAutoSave(). */
  async loadFromServer(layoutData) {
    const meta = layoutData.desktopMeta || [];
    const desktopsData = layoutData.desktops || {};

    if (meta.length === 0) {
      // Migration: no desktops yet — create Desktop 1 from legacy autoSave
      const firstId = this._generateId();
      this._desktops = [{ id: firstId, name: 'Desktop 1' }];
      this._activeId = firstId;

      const legacyState = layoutData.autoSave;
      if (legacyState?.windows?.length) {
        this._setRecord(firstId, legacyState); // the server's record, as it is
        await this.app.layoutManager.restoreState(legacyState);
        for (const [, win] of this.app.wm.windows) win._desktopId = firstId;
        this._noteAttempts(firstId, windowIds(legacyState));
      }

      // Persist the new desktop structure to server
      this.app.ws.send({ type: 'desktop-create', name: 'Desktop 1', id: firstId });
    } else {
      this._desktops = meta;
      this._activeId = meta[0].id;

      // Cache all desktop states — except a poisoned '__stage__' record
      // (pre-2.209.0 raw switchTo while staged persisted the stage's window
      // set under that key; caching it would lazy-replay slot-bounds copies)
      for (const [id, dState] of Object.entries(desktopsData)) {
        if (id !== '__stage__' && dState.autoSave) { this._setRecord(id, dState.autoSave); this.noteWire(id, dState.autoSave); } // the server's record, as it is
      }

      // Restore the active (first) desktop
      const firstState = this._savedStates.get(this._activeId);
      if (firstState?.windows?.length) {
        await this.app.layoutManager.restoreState(firstState);
        for (const [, win] of this.app.wm.windows) {
          if (!win._desktopId) win._desktopId = this._activeId;
        }
        this._noteAttempts(this._activeId, windowIds(firstState)); // the boot desktop is BUILT: a window still absent after the grace is one this page cannot build
      }
    }

    this._renderSwitcher();
  }

  // ── Desktop CRUD ──

  createDesktop(name) {
    const id = this._generateId();
    const deskName = name || `Desktop ${this._desktops.length + 1}`;
    this._desktops.push({ id, name: deskName });
    this.app.ws.send({ type: 'desktop-create', name: deskName, id });
    this._renderSwitcher();
    return id;
  }

  async deleteDesktop(desktopId) {
    if (this._desktops.length <= 1) return; // can't delete last desktop
    let idx = this._desktops.findIndex(d => d.id === desktopId);
    if (idx < 0) return;

    // If deleting the active desktop, run the FULL switch pipeline to the
    // adjacent one. The old hand-rolled path only _showWin'ed windows already
    // in the DOM — a target desktop never visited since page load keeps its
    // windows ONLY in _savedStates (they lazy-replay on first switchTo), so it
    // presented EMPTY and the closing autosave then saved that emptiness over
    // the target's real layout (real report: create desktop → switch → delete
    // → the previously-last desktop's layout wiped). switchTo also restores
    // the target's grid, which this path never did.
    const wasActive = this._activeId === desktopId;
    if (wasActive) {
      const targetDeskId = this._desktops[idx > 0 ? idx - 1 : 1].id;
      // Wait out an in-flight switch — switchTo's re-entry guard would
      // silently bail and leave _activeId pointing at the deleted desktop.
      for (let i = 0; i < 12 && this._restoring; i++) await new Promise(r => setTimeout(r, 150));
      await this.switchTo(targetDeskId);
      if (this._activeId !== targetDeskId) {
        // Switch still bailed — minimal fallback (DOM-only show), never leave
        // the active pointer on a deleted desktop.
        this._activeId = targetDeskId;
        for (const [, win] of this.app.wm.windows) {
          if (win._desktopId === this._activeId && win._hiddenByDesktop) this._showWin(win);
        }
      }
      idx = this._desktops.findIndex(d => d.id === desktopId); // list may have shifted while awaiting
      if (idx < 0) return;
    }
    const targetId = this._activeId;

    // Reassign deleted desktop's windows to the active desktop and show them
    for (const [, win] of this.app.wm.windows) {
      if (win._desktopId === desktopId) {
        win._desktopId = targetId;
        if (win._hiddenByDesktop) this._showWin(win);
      }
    }

    // For windows not yet in DOM (never switched to after refresh),
    // restore them via the standard layout restore pipeline
    const cached = this._savedStates.get(desktopId);
    if (cached?.windows) {
      const unloaded = cached.windows.filter(ws => !this.app.wm.windows.has(ws.winId || ws.id));
      if (unloaded.length) {
        // Tag restored windows with active desktop
        const origCreate = this.app.wm.createWindow;
        this.app.wm.createWindow = (opts) => {
          const win = origCreate.call(this.app.wm, opts);
          win._desktopId = targetId;
          return win;
        };
        this.app.layoutManager.restoreState({ windows: unloaded });
        this.app.wm.createWindow = origCreate;
      }
    }

    // The deleted desktop's record ENTRIES move into the target's held record and go out NOW, before the server
    // forgets the desktop (lane desktop-move verify r1 D1: the target's record was left to the closing autosave,
    // which the switch's gate drops when the desktop deleted was the one on show — the server deleted HR and held
    // its 3 windows in NO record until the user's next input; a reload in between lost them). Built or not (an async
    // opener's window is not built yet), they are the target's from here — the ONE merge door.
    const moving = (cached?.windows || []).filter((ws) => ws && (ws.winId || ws.id));
    for (const ws of moving) this._buildAttempts.delete(String(ws.winId || ws.id));
    this._setRecord(targetId, mergeDesktopRecord({ record: this._savedStates.get(targetId) || { windows: [] }, add: moving }));
    this._desktops.splice(idx, 1);
    this._savedStates.delete(desktopId);
    this._wireIds.delete(desktopId);
    this._broadcastDesktopState(targetId, this.recordFor(targetId)); // the target holds them BEFORE the server forgets the desktop
    this.app.ws.send({ type: 'desktop-delete', desktopId });
    // Reflow positions for all now-visible windows
    this.app.wm._reflowWindows();
    this._renderSwitcher();
    this.app.updateTaskbar();
    this.app.layoutManager.scheduleAutoSave();
  }

  renameDesktop(desktopId, name) {
    const desk = this._desktops.find(d => d.id === desktopId);
    if (desk) {
      desk.name = name;
      this.app.ws.send({ type: 'desktop-rename', desktopId, name });
      this._renderSwitcher();
    }
  }

  // ── Desktop Switching ──

  // Drop a CLOSED window from every cached desktop record. Called from
  // wm.closeWindow for every close path (detach and terminate alike): the
  // switchTo merge-preserve keeps openSpec-backed records that aren't in
  // wm.windows ("still lazy-replaying"), which is indistinguishable from
  // "user closed it" — without this purge, every desktop round-trip
  // resurrected every closed window as a lazy replay (real report 2.151.1).
  purgeClosedWindow(winId) {
    if (!winId) return;
    const lm = this.app.layoutManager;
    const byUser = !(lm?._applying || lm?._booting); // a close the apply / the boot itself made is not this page's change to send; one the user made in the cooldown after an apply is (verify r3 ③)
    for (const [desk, st] of this._savedStates) {
      if (!(st?.windows?.length && windowIds(st).includes(String(winId)))) continue;
      this._setRecord(desk, mergeDesktopRecord({ record: st, remove: [winId] }));
      if (byUser && desk !== this._activeId) this._dirtyDesks.add(desk); // a desktop not on show that listed it: its record goes out now, with the close as evidence
    }
    this._buildAttempts.delete(String(winId));
    this._noteDeparted(winId, 'closed'); // the evidence the server's shrink belt reads (userW inc-mun7qjmw-iksh)
  }

  // ── The held records (userW inc-mun7qjmw-iksh; PURE rule in src/lib/desktop-record.js) ──
  // A desktop's held record (`_savedStates`) is a VIEW of the server's record plus what this page has built. The ONE
  // writer is _setRecord, and every call hands it either a record straight off the wire (boot, a remote record) or a
  // mergeDesktopRecord result — never a list derived from the page alone (scripts/test-desktop-record.mjs census).

  /** THE ONE WRITER of a held desktop record. A desktop this page does not know (deleted meanwhile) has no held
   *  record (verify r2 ④: the switch off a remotely deleted desktop captured a record for it and broadcast it — an
   *  orphan record on the server, no meta naming it). */
  _setRecord(desktopId, record) {
    if (!desktopId || desktopId === '__stage__' || !record || typeof record !== 'object') return;
    if (!this._desktops.some((d) => d.id === desktopId)) return;
    this._savedStates.set(desktopId, record);
  }

  /** The record this page would WRITE for `desktopId`: the held record merged with the windows the page has built
   *  there; a window the page tried to build and could not is dropped (evidence 'unbuilt'); every other window the
   *  page has not built stays exactly as the record holds it. The global chrome is the page's current one; the grid
   *  is the page's only for the desktop it shows (another desktop keeps its own). Used for every record that leaves
   *  this page (the autosave, a switch's capture, the Stage's) — never the bare DOM capture. */
  recordFor(desktopId) {
    const lm = this.app.layoutManager;
    const held = this._savedStates.get(desktopId) || { windows: [] };
    // a window the page HAS built lives where the page says: one the record lists here that the page holds on another
    // desktop is not this desktop's any more (it left through a path that is not a move — evidence 'moved')
    const elsewhere = windowIds(held).filter((id) => {
      const w = this.app.wm.windows.get(id);
      if (!w || (w._desktopId || this._activeId) === desktopId) return false;
      this._noteDeparted(id, 'moved');
      return true;
    });
    const unbuilt = this._unbuilt(desktopId, held);
    lm.dropUnbuiltMembers?.(unbuilt); // a chain waiting for a window the page could not build is rebuilt without it
    const rec = mergeDesktopRecord({ record: held, built: lm.captureWindows(desktopId), remove: [...unbuilt, ...elsewhere] });
    const { grid, ...chrome } = lm.captureChrome();
    Object.assign(rec, chrome);
    if (desktopId === this._activeId) rec.grid = grid;
    delete rec.updatedAt; // the server's stamp on the record it holds — it stamps every write itself
    return rec;
  }

  /** A remote record for the desktop ON SHOW was applied (layout.js _handleRemoteSync): it is the view's base now —
   *  minus a window this page closed that no save carried yet; a window it lists that this page does not have is
   *  being created by that apply — an attempt like any other (still absent after the grace ⇒ dropped, with evidence). */
  cacheShownState(desktopId, state) {
    if (!desktopId || desktopId !== this._activeId || !state || typeof state !== 'object') return;
    const held = this.app.layoutManager?.heldCloseIds?.() || [];
    this._setRecord(desktopId, held.length ? mergeDesktopRecord({ record: state, remove: held }) : state);
    this._noteAttempts(desktopId, windowIds(state).filter((id) => !this._buildAttempts.has(id)));
  }

  /** A record of `desktopId` left this page (sent to the server): it is now the view's base, and the wire's. */
  noteSent(desktopId, state) {
    if (!desktopId || desktopId === '__stage__' || !state) return;
    this._setRecord(desktopId, state);
    this.noteWire(desktopId, state);
  }

  /** The desktops this page changed but does not show — sent by the next autosave from their HELD record. A desktop stays
   *  dirty until the server READ a record of it (`noteCarried`, the ack — verify r5 ⑤): a save that left on a socket the
   *  server never read used to take the desk out of the set, and the re-send after the reconnect then carried the desktop on
   *  show alone (the moved window reached no record). A desk sent twice before its ack is an idempotent duplicate write. */
  takeDirty() {
    return [...this._dirtyDesks].filter((d) => d && d !== this._activeId && d !== '__stage__' && this._desktops.some((x) => x.id === d));
  }

  /** The server read a record of `desktopId` (the layout manager's ack): no longer owed. */
  noteCarried(desktopId) { if (desktopId) this._dirtyDesks.delete(desktopId); }

  /** The evidence every layout-sync carries: the windows this page closed, moved, replaced or could not build lately. */
  evidence() {
    const now = Date.now(), out = [];
    for (const [id, e] of this._departed) {
      if (now - e.at > DEPARTED_TTL_MS) { this._departed.delete(id); continue; }
      out.push({ id, why: e.why });
    }
    return out;
  }

  _noteDeparted(winId, why) {
    if (winId == null) return;
    const id = String(winId);
    this._departed.delete(id);
    this._departed.set(id, { why, at: Date.now() });
    while (this._departed.size > DEPARTED_CAP) this._departed.delete(this._departed.keys().next().value);
  }

  /** The page is building these windows of `desktopId` now (a first visit's replay, the boot restore). */
  _noteAttempts(desktopId, ids, { at = Date.now() } = {}) {
    for (const id of ids || []) if (id != null && !this.app.wm.windows.has(String(id))) this._buildAttempts.set(String(id), { desk: desktopId, at });
  }

  /** The held windows of `desktopId` the page tried to build and could not (still absent past the grace). */
  _unbuilt(desktopId, held) {
    const now = Date.now(), out = [];
    for (const id of windowIds(held)) {
      const a = this._buildAttempts.get(id);
      if (!a) continue;
      if (this.app.wm.windows.has(id)) { this._buildAttempts.delete(id); continue; }
      if (a.desk === desktopId && now - a.at > BUILD_GRACE_MS) { out.push(id); this._noteDeparted(id, 'unbuilt'); }
    }
    return out;
  }

  /** The server REFUSED a record of `desktopId` (its shrink belt, ws-handler layout-sync): the server kept its own
   *  and sent it back. The view becomes that record plus what this page has built; on the desktop on show the
   *  windows it holds that this page never opened are opened now; the corrected record goes out with the next save
   *  (the dirty bit re-armed at the last REAL input — §6b guard 2's expiry keeps its meaning). */
  onSyncRefused(msg) {
    const d = msg?.desktopId;
    // the server no longer has this desktop (verify r2 ⑦): its meta rides the refusal — the page drops the desktop
    // as a `desktop-updated` would have made it (its windows follow the record that lists them, or the first desktop)
    if (msg?.reason === 'no-such-desktop') { if (Array.isArray(msg.desktops)) this._onRemoteDesktopUpdated({ desktops: msg.desktops }); return; }
    if (!d || d === '__stage__' || !this._desktops.some((x) => x.id === d)) return;
    const lm = this.app.layoutManager;
    const rec = msg.state && typeof msg.state === 'object' ? msg.state : { windows: [] };
    for (const id of msg.unexplained || []) { this._buildAttempts.delete(String(id)); this._departed.delete(String(id)); }
    this._setRecord(d, mergeDesktopRecord({ record: rec, built: lm.captureWindows(d), remove: lm.heldCloseIds?.() || [] }));
    this.noteWire(d, rec);
    let opened = 0;
    if (d === this._activeId && !this.app.stage?.isActive) opened = this._replayMissing(d, this._savedStates.get(d));
    if (d !== this._activeId) this._dirtyDesks.add(d);
    lm.rearmSave?.();
    this._renderSwitcher(); this.refreshSwitcher();
    const n = (msg.unexplained || []).length;
    const name = this._desktops.find((x) => x.id === d)?.name || d;
    try { window.__vsOp?.('layout-sync-refused', { desk: d, n, opened }); } catch { }
    if (n) showToast(t('{n} windows on “{desktop}” were kept — this page had not opened them yet', { n, desktop: name }), { type: 'warn', duration: 8000 });
  }

  /** Open the held windows of `desktopId` that the page does not have yet (openSpec-backed; one already being built
   *  is left to its attempt) — a first visit (switchTo step 6), and a refused record's reconcile. Returns the count. */
  _replayMissing(desktopId, state) {
    let n = 0;
    const now = Date.now();
    const noSpec = [], building = [];
    // a webui SESSION already open on this page under ANOTHER window id: attachSession's "already open in a live
    // window" shortcut (_focusExistingSession, keyed on the server session id) focuses that window and builds
    // nothing. The key is the session's `serverId`, never the conversation id (verify r2): a fork's window carries
    // its PARENT's backendSessionId in its openSpec, so the conversation id settled the parent's own never-opened
    // entry as a duplicate and dropped it from its desktop's record — attachSession would have built it.
    const liveServerIds = new Set([...this.app.wm.windows.values()].map((w) => w._openSpec?.action === 'attachSession' ? w._openSpec.serverId : null).filter(Boolean));
    for (const ws of state?.windows || []) {
      const winId = ws.winId || ws.id;
      if (!winId || this.app.wm.windows.has(winId)) continue;
      if (!ws.openSpec) { noSpec.push(winId); continue; } // nothing to build it from: settled at once (dropped as before, with evidence)
      // …nor can a second window of a session this page already shows live: settled at once too (verify r1: it
      // lingered as a build attempt for the whole 20 s grace — a record entry nobody could build, which the server
      // then held against every other client's write)
      if (ws.openSpec.action === 'attachSession' && ws.openSpec.serverId && liveServerIds.has(ws.openSpec.serverId)) { noSpec.push(winId); continue; }
      const a = this._buildAttempts.get(String(winId));
      if (a && a.desk === desktopId && now - a.at <= BUILD_GRACE_MS) continue; // already being built
      this.app.replayOpenSpec(ws.openSpec, winId);
      this._noteAttempts(desktopId, [winId], { at: now });
      building.push(String(winId));
      n++;
      // Tag and position after creation
      setTimeout(() => {
        const newWin = this.app.wm.windows.get(winId);
        if (newWin) {
          newWin._desktopId = desktopId;
          if (ws.gridBounds) {
            newWin.gridBounds = ws.gridBounds;
            this.app.wm._applyGridBounds(newWin);
          }
        }
      }, 500);
    }
    this._noteAttempts(desktopId, noSpec, { at: 0 });
    // the record's tab groups (lane split-restore-hidden, userW inc-muundq37-cjay): a first visit after a reload built
    // every member as a plain window and the next save wrote the split away — each chain waits for its last member.
    // Only a chain naming a window THIS replay builds (int214: this runs on every switch — a chain whose members all stand
    // here is the page's own truth, and re-queuing it re-formed a group the user had just split; test-stage-dragout-ui 6 T1)
    if (building.length) this.app.layoutManager?.queueRecordChains?.(desktopId, state, { naming: building });
    return n;
  }

  /** The record `desktopId` was last seen as ON THE WIRE (a save this client sent, a remote record it applied or
   *  cached, the disk record it booted from): the window ids it listed. */
  noteWire(desktopId, state) {
    if (!desktopId || desktopId === '__stage__' || !state || !Array.isArray(state.windows)) return;
    if (!this._desktops.some((d) => d.id === desktopId)) return; // a desktop this page does not know (verify r2 ④)
    this._wireIds.set(desktopId, new Set(state.windows.map((w) => String(w.winId || w.id))));
  }

  /** Did the last record of `desktopId` on the wire list `winId`? (A reconnect's re-read may close only these.) */
  wireListed(desktopId, winId) {
    const base = this._wireIds.get(desktopId);
    return !!base && base.has(String(winId));
  }

  /** A remote record for a desktop this client is NOT showing (inc-mukeyzpt-lpou, the parked second client). It
   *  replaces the cached record (as before) — and a window this client still HOLDS there, hidden, that the
   *  record's sender REMOVED (the last record on the wire listed it, this one does not: somebody closed it) is
   *  closed here now. Before, the stale window waited in this client's DOM: the next switch showed it again and
   *  this client's next save wrote it back to every other client. A window the wire never listed for that desktop
   *  (moved or opened here, not yet sent) is this client's own change and stays; a window on show (the stage) is
   *  never touched. The closes are not this user's (no held close, no save: `_restoring` around them). */
  cacheRemoteState(desktopId, state, { receivedAt = Date.now() } = {}) {
    const base = this._wireIds.get(desktopId);
    const now = new Set(((state && state.windows) || []).map((w) => String(w.winId || w.id)));
    // …unless another desktop's record lists it now: it MOVED there (a remote move — lane desktop-move verify r1);
    // a window this page moved here AFTER the record arrived, or whose move no save has carried yet, is the user's own
    // act the record cannot know (verify r2; THE UNSAVED ACT, verify r4 ①: layout.js actHeld)
    const gone = base ? [...this.app.wm.windows.values()].filter((w) => w._desktopId === desktopId && w._hiddenByDesktop && !w._onStage && w._openSpec && base.has(String(w.id)) && !now.has(String(w.id)) && !this.app.layoutManager?.actHeld?.(w._movedAt, receivedAt, w)).filter((w) => !this.adoptRemoteMove(w, desktopId)) : [];
    if (gone.length) {
      const lm = this.app.layoutManager, was = lm._restoring;
      lm._restoring = true; lm._applying = true; // these closes are the record's, not the user's (verify r3 ③)
      try { for (const w of gone) if (this.app.wm.windows.has(w.id)) this.app.wm.closeWindow(w.id); } finally { lm._restoring = was; lm._applying = false; }
    }
    // the server's record, as it is — minus a window THIS page closed that no save has carried yet (the held close:
    // the record is older than the close; the next switch would replay it, and a save of this desktop re-send it)
    const held = this.app.layoutManager?.heldCloseIds?.() || [];
    this._setRecord(desktopId, held.length ? mergeDesktopRecord({ record: state, remove: held }) : state);
    this.noteWire(desktopId, state);
  }

  /** A REMOTE MOVE (lane desktop-move verify r1, D4): a window this page holds on `from` that the wire now places
   *  on another desktop — `to` when the caller knows it (the record of the desktop on show lists it), else the
   *  desktop whose HELD record lists it (a move's target record is sent first, so it is there before the source's
   *  drops it). The window is retagged and shown / hidden as its new desktop is — never closed: a close here
   *  became 'closed' evidence and the next save of the target dropped the moved window on the server. Returns the
   *  desktop it moved to, or null (the window is nobody else's: a real close). Stage windows are never moved. */
  adoptRemoteMove(win, from, { to = null, rec = null } = {}) {
    if (!win || !win.id || win._onStage || win._desktopId === '__stage__' || win._isStagePlaceholder) return null;
    const id = String(win.id);
    let dest = null, entry = rec;
    if (to) {
      // the caller KNOWS where the record places the window (the record of the desktop on show lists it): the answer
      // is that desktop or nothing — never the held-record search below. `to === from` fell through to it and moved a
      // window OUT of the desktop on show, listed by its record, to a desktop whose STALE held record also listed it
      // (this page's own unsaved move, a racing double) — the window bounced Fin ⇄ HR on every record (verify r4 ②)
      if (to === from || to === '__stage__') return null;
      dest = to;
    } else {
      for (const [d, st] of this._savedStates) {
        if (d === from || d === '__stage__' || !this._desktops.some((x) => x.id === d)) continue;
        const e = (st?.windows || []).find((w) => String(w.winId || w.id) === id);
        if (e) { dest = d; entry = e; break; }
      }
    }
    if (!dest || dest === win._desktopId) return null;
    win._desktopId = dest;
    if (entry?.gridBounds) { win.gridBounds = { ...entry.gridBounds }; try { this.app.wm._applyGridBounds(win); } catch { } }
    if (dest === this._activeId) { if (win._hiddenByDesktop) this._showWin(win); }
    else if (!win._hiddenByDesktop) this._hideWin(win);
    try { window.__vsOp?.('desktop-move-remote', { win: id, from: from || null, to: dest }); } catch { }
    return dest;
  }

  async switchTo(desktopId) {
    // Stage state-machine guard (2.209.0): while staged, EVERY switch must
    // route through stage.leave() — a raw switchTo would captureState the
    // stage's window set under the '__stage__' key (poisoning
    // desktops['__stage__'] in layouts.json, lazily replayed later as real
    // windows at slot bounds) and leave stage._active desynced from
    // _activeId. Reachable while staged via the + add-desktop button,
    // command-mode d/D, moveSessionWindow, and _onRemoteDesktopUpdated.
    // Conversely '__stage__' is never a switchTo target — route to enter().
    if (desktopId === '__stage__') {
      if (this.app.stage && this.app.stage.enabled && !this.app.stage.isActive) this.app.stage.enter();
      return;
    }
    if (this.app.stage?.isActive) return this.app.stage.leave(desktopId);
    if (desktopId === this._activeId) { this._pendingSwitch = null; return; }
    // Rapid switching: a switch requested mid-flight is QUEUED (latest wins),
    // not dropped — dropping left the user's actual position out of sync with
    // _activeId, so a later capture/save could persist the WRONG desktop's
    // window set over another's (real report: windows vanish on fast switches).
    if (this._restoring) { this._pendingSwitch = desktopId; return; }
    this._restoring = true;

    try {
      // 1. Capture current desktop state and cache it. MERGE-PRESERVE: a window
      // that was in this desktop's PRIOR saved state (an openSpec-backed window
      // still lazy-replaying — chat re-attach, disk restore) may not be in the
      // DOM yet, so the fresh capture would drop it. Carry such windows forward
      // so a fast switch-away never persists a desktop MINUS its slow windows.
      // (userW inc-mun7qjmw-iksh: the ONE record door — the held record merged with the built windows; a window
      // the page tried to build and could not is the only one dropped, and it is named to the server.)
      const currentState = this.recordFor(this._activeId);
      this._setRecord(this._activeId, currentState);

      // 2. Hide all windows for current desktop
      for (const [, win] of this.app.wm.windows) {
        if (win._desktopId === this._activeId && !win._hiddenByDesktop) {
          this._hideWin(win);
        }
      }

      // 3. Switch active desktop
      const prevId = this._activeId;
      this._activeId = desktopId;

      // 4. Apply target desktop's grid
      const targetState = this._savedStates.get(desktopId);
      if (targetState?.grid) {
        this.app.wm.setGrid(targetState.grid.rows, targetState.grid.cols);
      } else {
        this.app.wm.setGrid(null);
      }

      // 5. Show windows for target desktop (visibility:hidden preserves all state)
      let hasWindows = false;
      for (const [, win] of this.app.wm.windows) {
        if (win._desktopId === desktopId && win._hiddenByDesktop) {
          this._showWin(win);
          hasWindows = true;
        }
      }
      // Single reflow: recalculate all visible windows' pixel positions from gridBounds
      this.app.wm._reflowWindows();

      // 6. Create windows that exist in saved state but not yet in DOM
      // (from other clients or disk restore) — each one an ATTEMPT: still absent after the grace, it is one this page
      // cannot build and the record drops it (with evidence); until then it stays in the record
      if (targetState?.windows) {
        if (this._replayMissing(desktopId, targetState)) hasWindows = true;
      }

      // 7. Update UI
      this._renderSwitcher();
      this.app.updateTaskbar();
      this.app._checkWelcome();
      // Lazy-replayed windows get their gridBounds AFTER this render (async
      // capture timers) and nothing re-renders the switcher on its own — the
      // newly active desktop's preview stayed white until the next unrelated
      // interaction (real report). Two delayed digest-invalidating refreshes
      // (the second covers slow replays, e.g. chat windows re-attaching).
      setTimeout(() => this.refreshSwitcher(), 400);
      setTimeout(() => this.refreshSwitcher(), 1300);

      // 8. Broadcast (save previous desktop's state, then save current desktop)
      // Use non-restoring doAutoSave for the previous desktop
      this._broadcastDesktopState(prevId, currentState);
      // Schedule save for new active desktop
      setTimeout(() => this.app.layoutManager.scheduleAutoSave(), 300);

    } finally {
      setTimeout(() => {
        this._restoring = false;
        // drain a queued switch (latest wins) so rapid clicks all land
        if (this._pendingSwitch != null && this._pendingSwitch !== this._activeId) {
          const next = this._pendingSwitch; this._pendingSwitch = null;
          this.switchTo(next);
        } else { this._pendingSwitch = null; }
      }, 1000);
    }
  }

  /** Move a window to another desktop → `{ok:true}` | `{ok:true, moved:false}` (nothing to move) | a Stage refusal
   *  `{ok:false, code:'stage-window'|'onto-stage', kind}` (PURE stage-rules.js). `speak` = a USER's act (a drop on a
   *  preview, the menu, the keyboard): a refusal is said in a toast — never silent (inc-muly2izg-cks3). Programmatic
   *  callers (resume placement) pass nothing and read the result. `replaces` = the id of the record entry this window
   *  takes the place of on the target (a resumed conversation landing where its old, never-opened window was). */
  moveWindowToDesktop(winId, desktopId, { speak = false, replaces = null } = {}) {
    let win = this.app.wm.windows.get(winId);
    if (!win) return { ok: false, code: 'no-window' };

    // Stage↔desktop moves are blocked in BOTH directions (user directive
    // 2.112.4, superseding the earlier unbind+move design): stage-view
    // windows stay on the stage, and nothing moves ONTO the stage — and the
    // refusal SPEAKS (inc-muly2izg-cks3: it used to return in silence).
    const v = this.app.stage?.moveVerdict ? this.app.stage.moveVerdict(win, desktopId)
      : (desktopId === '__stage__' ? { ok: false, code: 'onto-stage', kind: null } : { ok: true });
    if (!v.ok) { if (speak) this.sayStageRefusal(v); return v; }
    if (v.same) return { ok: true, moved: false };
    // Tab chains live on ONE desktop (invariant enforced at creation):
    // move the whole group together, anchored at the host. Moving a single
    // guest used to split the chain across desktops, which captureState /
    // restoreTabChain can't represent.
    const members = win._tabChain ? win._tabChain.tabs.map(id => this.app.wm.windows.get(id)).filter(Boolean) : [win];
    if (win._tabChain) win = members[0]; // host owns the visible element
    if (!win || win._desktopId === desktopId) return { ok: true, moved: false };

    // breadcrumb AFTER the guards — the ONE op that relocates a window between
    // desktops, and an incident bundle must be able to answer "what moved my
    // windows". Logging above the guards recorded moves that never happened.
    try { window.__vsOp?.('desktop-move', { win: win.id, from: win._desktopId, to: desktopId, chain: members.length }); } catch {}
    const from = win._desktopId || null;
    const movedAt = Date.now();
    for (const m of members) { m._desktopId = desktopId; m._movedAt = movedAt; } // THE HELD MOVE's witness (verify r2): a record received before this instant cannot know it

    // If moving to a non-active desktop, hide (host element carries the group)
    if (desktopId !== this._activeId) {
      this._hideWin(win);
    }

    // The two held records: the target ADDS the moved windows (so its preview shows them), the source drops them —
    // nothing else in either is touched (userW inc-mun7qjmw-iksh: this rebuilt the target from the page's built
    // windows, which for a desktop never opened since the page loaded is nothing but the moved one)
    this._updateCachedDesktop(desktopId, { from, ids: members.map((m) => m.id), replaces: replaces ? [replaces] : [] });

    this._renderSwitcher();
    this.app.updateTaskbar();
    this.app.layoutManager.scheduleAutoSave();
    this.app._checkWelcome();
    return { ok: true, moved: true };
  }

  /** Say a Stage move refusal (the ONE toast every user door shows — the drop on a preview, the menu, the keyboard). */
  sayStageRefusal(v) {
    const text = stageRefusalSentence(v, { t });
    if (text) showToast(text, { type: 'warn', duration: 6000 });
    return text;
  }

  /** A move's two held records (userW inc-mun7qjmw-iksh). The TARGET: the moved windows (`ids`, captured whole)
   *  are ADDED and what they `replaces` is dropped — every other window of its record stays exactly as it is, built
   *  here or not. The SOURCE: the moved windows leave it. A desktop not on show is marked dirty: the next autosave
   *  sends its HELD record (never a list derived from the page). The moves are evidence for the server's belt. */
  _updateCachedDesktop(desktopId, { from = null, ids = [], replaces = [] } = {}) {
    const lm = this.app.layoutManager;
    const moved = ids.map((id) => this.app.wm.windows.get(id)).filter(Boolean).map((w) => lm.captureWin(w, w.id)).filter(Boolean);
    this._setRecord(desktopId, mergeDesktopRecord({ record: this._savedStates.get(desktopId) || { windows: [] }, add: moved, remove: replaces }));
    if (from && from !== desktopId && this._savedStates.has(from)) this._setRecord(from, mergeDesktopRecord({ record: this._savedStates.get(from), remove: ids }));
    for (const d of [desktopId, from]) if (d && d !== this._activeId && d !== '__stage__') this._dirtyDesks.add(d);
    for (const id of ids) { this._buildAttempts.delete(String(id)); this._noteDeparted(id, 'moved'); }
    for (const id of replaces) { this._buildAttempts.delete(String(id)); this._noteDeparted(id, 'replaced'); }
  }

  // ── Remote sync ──

  _onRemoteDesktopUpdated(msg) {
    if (msg.desktops) {
      const oldIds = new Set(this._desktops.map(d => d.id));
      const newIds = new Set(msg.desktops.map(d => d.id));
      this._desktops = msg.desktops;

      // Reassign windows from deleted desktops — to the desktop the DELETER's record put them on (verify r2 ④):
      // deleteDesktop merges them into its target's record and broadcasts it BEFORE `desktop-delete` (b21c2d40),
      // so the target's held record (or its record still deferred under a gate) lists them; the first remaining
      // desktop only when nothing does. (The old rule sent them to desktop #1 on every OTHER page: a second record
      // of the same windows on the server, and on the deleter's page they then jumped from its target to #1.)
      // STAGE-owned windows are EXEMPT ('__stage__' is never in the meta, so
      // every remote desktop create/rename/delete used to retag the whole
      // stage — placeholder included — onto a normal desktop, turning parked
      // slot-geometry ex-heroes into desktop windows at slot bounds).
      const gone = [...oldIds].filter((id) => !newIds.has(id));
      const homeOf = (winId) => {
        const id = String(winId);
        for (const [d, st] of this._savedStates) if (newIds.has(d) && (st?.windows || []).some((w) => String(w.winId || w.id) === id)) return d;
        for (const [, m] of this.app.layoutManager?._pendingRemote || []) if (m?.desktopId && newIds.has(m.desktopId) && (m.state?.windows || []).some((w) => String(w.winId || w.id) === id)) return m.desktopId;
        return null;
      };
      const fallbackId = this._desktops[0]?.id;
      let activeHome = null; // where the desktop on show's windows went — the switch follows them
      if (fallbackId) {
        for (const [, win] of this.app.wm.windows) {
          if (win._desktopId && win._desktopId !== '__stage__' && !newIds.has(win._desktopId)) {
            const dest = homeOf(win.id) || fallbackId;
            if (win._desktopId === this._activeId && !activeHome) activeHome = dest;
            win._desktopId = dest;
            if (dest === this._activeId) { if (win._hiddenByDesktop) this._showWin(win); }
            else if (!win._hiddenByDesktop) this._hideWin(win);
          }
        }
      }
      // the deleted desktops' held records, wire bases and deferred records go with them — never a ghost record a
      // late broadcast or the drain fills (verify r2 R1(b))
      for (const id of gone) { this._savedStates.delete(id); this._wireIds.delete(id); this.app.layoutManager?._pendingRemote?.delete(id); }

      // If our active desktop was deleted, switch to where its windows went (else the first). While staged,
      // _activeId is '__stage__' (never in the meta) — the old check
      // force-yanked a staged client off the stage on ANY remote desktop
      // meta change.
      if (!newIds.has(this._activeId) && this._activeId !== '__stage__' && this._desktops.length > 0) {
        this.switchTo(activeHome || this._desktops[0].id);
      }
      this._renderSwitcher();
    }
  }

  /** Update desktop metadata from layout-sync message */
  updateFromMeta(desktopMeta) {
    if (!desktopMeta?.length) return;
    this._desktops = desktopMeta;
    this._renderSwitcher();
  }

  /** Broadcast a specific desktop's state (used during switch) */
  _broadcastDesktopState(desktopId, state) {
    if (desktopId === '__stage__') return; // stage state never enters desktop records
    if (!this._desktops.some((d) => d.id === desktopId)) return; // a desktop deleted meanwhile: its record is nobody's to write (verify r2 ④ — the switch off it wrote an orphan record on the server)
    const sentAt = Date.now();
    this.app.ws.send({ type: 'layout-sync', state, desktopId, evidence: this.evidence(), sentAt });
    this.app.layoutManager?.noteLayoutSent?.([desktopId], sentAt); // this record carries every close made on that desktop (inc-mukeyzpt-lpou) — released once the server READ it (verify r5 ⑤)
    this.noteSent(desktopId, state);
  }

  // ── UI: Ubuntu-style desktop previews in taskbar ──

  // Digest-invalidating re-render, debounced. Needed when the preview DOM is
  // stale in a way the digest can't detect (the drag path live-mutates rects
  // directly) or when gridBounds arrive after the last render (async capture
  // timers after switch/snap). Called from wm._captureGridBounds + switchTo.
  refreshSwitcher() {
    if (this._refreshT) return;
    this._refreshT = setTimeout(() => {
      this._refreshT = null;
      this._switcherDigest = null;
      this._renderSwitcher();
    }, 60);
  }

  _renderSwitcher() {
    const container = document.getElementById('desktop-previews');
    if (!container) return;
    // Digest guard (audit round-2, high): updateTaskbar funnels EVERY window
    // mousedown/focus/blink here and this rebuilt all previews + listeners
    // each time. Rebuild only when the rendered content would differ.
    // The digest must cover EVERY field the render below filters on —
    // _hiddenByDesktop/_hiddenByStage/_onStage were missing, so stage.leave()'s
    // intermediate render (setGrid fires while the target desktop's windows are
    // still hidden) cached a BLANK preview and the post-show final render
    // early-returned on an identical digest (real report: preview stayed white
    // after leaving the stage until switching desktops).
    // _flashingWinId included (2.247.4, userW's report — THIRD strike of the
    // 2.151.0 class): flashWindow's cross-desktop preview flash sets it and
    // calls _renderSwitcher, but a mere card click changes nothing else, so
    // the digest matched and the flash never painted.
    const digest = JSON.stringify([this._activeId, this._flashingWinId || 0, !!this.app.stage?.enabled, !!this.app.stage?.isActive, this.app.stage?.enabled ? this.app.stage.slotBounds() : 0, this._desktops.map(d => [d.id, d.name]),
      [...this.app.wm.windows.values()].map(w => [w._desktopId, w.isMinimized,
        !!w._hiddenByDesktop, !!w._hiddenByStage, !!w._onStage,
        !!w.element?.classList.contains('window-waiting'),
        w.gridBounds ? [w.gridBounds.left, w.gridBounds.top, w.gridBounds.width, w.gridBounds.height] : w.element?.style.left]),
      // the held records draw the windows a desktop holds that the page has not built (userW inc-mun7qjmw-iksh)
      [...this._savedStates].map(([k, st]) => [k, (st?.windows || []).map((w) => [w.winId || w.id, w.isMinimized ? 1 : 0, w.gridBounds ? [w.gridBounds.left, w.gridBounds.top, w.gridBounds.width, w.gridBounds.height] : 0])])]);
    if (digest === this._switcherDigest) return;
    this._switcherDigest = digest;
    container.innerHTML = '';

    // Dynamic desktop (Stage): leftmost, visually separated. Clicking enters
    // the stage view; clicking a normal desktop while staged leaves it.
    const stage = this.app.stage;
    if (stage?.enabled) {
      const wrap = document.createElement('div');
      wrap.className = 'desktop-preview-wrapper stage-preview-wrapper';
      const pv = document.createElement('div');
      pv.className = 'desktop-preview stage-preview' + (stage.isActive ? ' active' : '');
      pv.title = t('Stage — sessions materialize here with their workspace');
      // slot outline (always) + stage-visible windows when active
      const slot = stage.slotBounds();
      const slotRect = document.createElement('div');
      slotRect.className = 'desktop-preview-win stage-preview-slot';
      slotRect.style.left = (slot.left * 100) + '%';
      slotRect.style.top = (slot.top * 100) + '%';
      slotRect.style.width = (slot.width * 100) + '%';
      slotRect.style.height = (slot.height * 100) + '%';
      pv.appendChild(slotRect);
      let stageHasWaiting = false;
      if (stage.isActive) {
        for (const [id, win] of this.app.wm.windows) {
          if (stage._isStageVisible(win) && win.gridBounds && !win._isStagePlaceholder) {
            const r = document.createElement('div');
            // waiting-blink + find-flash reach the Stage preview too (2.250.0,
            // real report: neither showed here — the desktop loop drew them,
            // this block didn't)
            const waiting = win.element?.classList.contains('window-waiting');
            const flash = this._flashingWinId === id;
            r.className = 'desktop-preview-win' + (waiting ? ' desktop-preview-win-waiting' : '') + (flash ? ' desktop-preview-find-flash' : '');
            if (waiting) stageHasWaiting = true;
            r.dataset.winId = id;
            r.style.left = (win.gridBounds.left * 100) + '%';
            r.style.top = (win.gridBounds.top * 100) + '%';
            r.style.width = (win.gridBounds.width * 100) + '%';
            r.style.height = (win.gridBounds.height * 100) + '%';
            pv.appendChild(r);
          }
        }
      }
      if (stageHasWaiting) pv.classList.add('desktop-preview-waiting');
      const label = document.createElement('div');
      label.className = 'desktop-preview-label';
      label.textContent = t('Stage');
      wrap.append(pv, label);
      wrap.addEventListener('click', () => { if (!stage.isActive) stage.enter(); });
      container.appendChild(wrap);
      const divider = document.createElement('div');
      divider.className = 'stage-preview-divider';
      container.appendChild(divider);
    }

    for (const desk of this._desktops) {
      const preview = document.createElement('div');
      preview.className = 'desktop-preview' + (desk.id === this._activeId ? ' active' : '');
      // the drop target resolves the desktop by THIS id, never by DOM index —
      // the Stage preview also carries `.desktop-preview` (+ `stage-preview`)
      // and sits BEFORE these, so an index map lands the window one desktop to
      // the right when the Stage is active (real report)
      preview.dataset.desktopId = desk.id;
      preview.title = desk.name;

      // Collect windows for this desktop and draw miniature rectangles
      // All windows exist in DOM (visibility:hidden for non-active), so check live state
      const winEntries = []; // { id, gridBounds, waiting }
      let deskHasWaiting = false;
      if (desk.id === this._activeId) {
        for (const [id, win] of this.app.wm.windows) {
          if (win._desktopId === desk.id && win.gridBounds && !win._hiddenByDesktop && !win.isMinimized) {
            const waiting = win.element.classList.contains('window-waiting');
            winEntries.push({ id, gridBounds: win.gridBounds, waiting });
            if (waiting) deskHasWaiting = true;
          }
        }
      } else {
        // Non-active: try live DOM windows first (they exist after first switch)
        for (const [id, win] of this.app.wm.windows) {
          if (win._desktopId === desk.id && win.gridBounds && !win.isMinimized) {
            const waiting = win.element.classList.contains('window-waiting');
            // A window currently BORROWED by the stage carries the stage
            // SLOT's geometry in its live gridBounds — its home desktop's
            // preview must draw where it actually lives when it returns
            // (real report: hero activation painted a phantom window at the
            // slot position on the home desktop's preview).
            // _stageHomeBounds IS the flat {left,top,width,height} object
            // (stage-manager _borrowHero: `= { ...win.gridBounds }`) — the
            // first fix read `._stageHomeBounds?.gridBounds` and was a NO-OP
            // (always undefined → slot geometry leaked; second real report).
            const gb = (win._onStage && win._stageHomeBounds) ? win._stageHomeBounds : win.gridBounds;
            winEntries.push({ id, gridBounds: gb, waiting });
            if (waiting) deskHasWaiting = true;
          }
        }
        // …and the windows its held record holds that the page has NOT built (a desktop not opened since the page
        // loaded holds nothing else) — every one of them, beside the live ones: the preview draws the desktop's
        // record, never just the page's part of it (userW inc-mun7qjmw-iksh: a drop onto such a desktop drew 1
        // rect of 4 — the fallback ran only when no live window was there)
        const cached = this._savedStates.get(desk.id);
        if (cached?.windows) {
          for (const ws of cached.windows) {
            const wid = ws.winId || ws.id;
            if (wid && this.app.wm.windows.has(wid)) continue; // built: drawn above where it lives now
            if (ws.gridBounds && !ws.isMinimized) {
              winEntries.push({ id: wid, gridBounds: ws.gridBounds, waiting: false });
            }
          }
        }
      }
      if (deskHasWaiting) preview.classList.add('desktop-preview-waiting');
      for (const entry of winEntries) {
        const b = entry.gridBounds;
        if (!b) continue;
        const rect = document.createElement('div');
        const flash = this._flashingWinId === entry.id;
        rect.className = 'desktop-preview-win' + (entry.waiting ? ' desktop-preview-win-waiting' : '') + (flash ? ' desktop-preview-find-flash' : '');
        if (entry.id) rect.dataset.winId = entry.id;
        rect.style.left = (b.left * 100) + '%';
        rect.style.top = (b.top * 100) + '%';
        rect.style.width = (b.width * 100) + '%';
        rect.style.height = (b.height * 100) + '%';
        preview.appendChild(rect);
      }

      // Wrapper: preview + label below
      const wrapper = document.createElement('div');
      wrapper.className = 'desktop-preview-wrapper';
      const label = document.createElement('div');
      label.className = 'desktop-preview-label';
      label.textContent = desk.name;
      wrapper.append(preview, label);

      // Click to switch (leaving the stage view first when active)
      wrapper.addEventListener('click', () => {
        if (this.app.stage?.isActive) return this.app.stage.leave(desk.id);
        this.switchTo(desk.id);
      });

      // Right-click context menu
      wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // STOP THE BUBBLE (2.250.1, real report): chrome elements are
        // drag-movable between bars, and the TOOLBAR's background handler
        // only exempts `button, select, input` — so once the previews were
        // dragged into the toolbar, its "Customize UI…" menu fired too and,
        // because showContextMenu removes any existing menu, REPLACED this
        // one. The element owning the menu must stop the event rather than
        // rely on each container's exemption list staying in sync.
        e.stopPropagation();
        const items = [
          { label: 'Rename', action: () => this._startRename(desk) },
        ];
        if (this._desktops.length > 1) {
          items.push({ label: 'Delete', action: () => this.deleteDesktop(desk.id), style: 'color:var(--red, #e55)' });
        }
        const menu = showContextMenu(e.clientX, e.clientY, items);
        // Open in the direction there's room (2.250.0, real report: a
        // top-docked taskbar puts the previews near the viewport TOP, where an
        // unconditional bottom-anchor grew the menu straight off the top edge).
        // Anchor bottom (grow up) only when the click is in the lower half.
        if (e.clientY > window.innerHeight / 2) {
          menu.style.top = ''; menu.style.bottom = (window.innerHeight - e.clientY + 4) + 'px';
        } else {
          menu.style.bottom = ''; menu.style.top = (e.clientY + 4) + 'px';
        }
      });

      // Drag-to-reorder desktops (2.250.0). HTML5 drag on the wrapper; the
      // preview stays a DROP target for BOTH a window-move (text/window-id) and
      // a desktop-reorder (text/desktop-id) — resolved by which data is set.
      wrapper.draggable = true;
      wrapper.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/desktop-id', desk.id);
        e.dataTransfer.effectAllowed = 'move';
        wrapper.classList.add('desktop-preview-dragging');
      });
      wrapper.addEventListener('dragend', () => wrapper.classList.remove('desktop-preview-dragging'));

      // Drop target: a window (move it here) OR another desktop (reorder)
      preview.addEventListener('dragover', (e) => { e.preventDefault(); preview.classList.add('desktop-preview-drop'); });
      preview.addEventListener('dragleave', () => preview.classList.remove('desktop-preview-drop'));
      preview.addEventListener('drop', (e) => {
        e.preventDefault();
        preview.classList.remove('desktop-preview-drop');
        const dragDesk = e.dataTransfer.getData('text/desktop-id');
        if (dragDesk && dragDesk !== desk.id) { this.reorderDesktop(dragDesk, desk.id); return; }
        const winId = e.dataTransfer.getData('text/window-id');
        if (winId) this.moveWindowToDesktop(winId, desk.id, { speak: true }); // a taskbar item dropped here: a refusal is said
      });

      container.appendChild(wrapper);
    }

    // "+" add button
    const addBtn = document.createElement('button');
    addBtn.className = 'desktop-preview-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add desktop';
    addBtn.addEventListener('click', () => {
      const id = this.createDesktop();
      this.switchTo(id);
    });
    container.appendChild(addBtn);
  }

  async _startRename(desk) {
    const name = await showInputDialog({ title: 'Rename Desktop', label: 'Desktop name', value: desk.name, confirmText: 'Rename' });
    if (name && name.trim()) this.renameDesktop(desk.id, name.trim());
  }

  // Move dragId to sit just BEFORE targetId in the desktop order (2.250.0).
  reorderDesktop(dragId, targetId) {
    const from = this._desktops.findIndex(d => d.id === dragId);
    const to = this._desktops.findIndex(d => d.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = this._desktops.splice(from, 1);
    // after removing `from`, the target index shifts left if it was after `from`
    const insertAt = this._desktops.findIndex(d => d.id === targetId);
    this._desktops.splice(insertAt, 0, moved);
    this.app.ws.send({ type: 'desktop-reorder', order: this._desktops.map(d => d.id) });
    this._renderSwitcher();
  }

  /** Build "Move to Desktop" submenu items for window context menu. A Stage window gets ONE row that SAYS why it
   *  stays (inc-muly2izg-cks3 — the desktop rows used to be listed and do nothing; never greyed names with a hidden
   *  hint: the reason is the row). */
  getDesktopMenuItems(winId) {
    const win = this.app.wm.windows.get(winId);
    if (!win || this._desktops.length < 1) return [];
    const target = this._desktops.find((d) => d.id !== win._desktopId);
    const v = target && this.app.stage?.moveVerdict ? this.app.stage.moveVerdict(win, target.id) : { ok: true };
    if (!v.ok) return [{ label: stageRefusalSentence(v, { t }), stageRefusal: v.code }];
    if (this._desktops.length < 2) return [];
    return this._desktops
      .filter(d => d.id !== win._desktopId)
      .map(d => ({
        label: d.name,
        action: () => this.moveWindowToDesktop(winId, d.id, { speak: true }),
      }));
  }

  // ── Toolbar resize (2.250.1) ──
  // The layout is a flex COLUMN (toolbar · workspace flex:1 · taskbar), so the
  // absorbs the delta automatically and windows re-derive their pixels from
  // proportional gridBounds via _reflowWindows(). 2.254.0: the resize is a
  // CONTENT SCALE (--toolbar-scale zoom on #toolbar + #toolbar-row2), not a
  // fixed height — the toolbar auto-fits its content so there's never a dead
  // empty band (userW's report), and dragging changes compactness.
  _setupToolbarResize() {
    const handle = document.getElementById('toolbar-resize-handle');
    const toolbar = document.getElementById('toolbar');
    if (!handle || !toolbar) return;
    // 2.254.0 rework (userW's dead-band bug): the toolbar height AUTO-FITS its
    // content rows now; the drag drives --toolbar-scale (a zoom on #toolbar +
    // #toolbar-row2), so it changes content COMPACTNESS — smaller = more
    // desktop, larger = bigger chrome — never a dead empty band. ~230px of drag
    // spans the whole range so it feels like a size adjustment, not a nudge.
    const MIN_S = 0.7, MAX_S = 1.25, PXPER = 230; // upper bound modest: large scales overflow the center zone in narrow windows — the feature's value is COMPACT (more desktop)
    const root = document.documentElement;
    const clampS = (s) => Math.max(MIN_S, Math.min(MAX_S, s));
    const curScale = () => parseFloat(getComputedStyle(root).getPropertyValue('--toolbar-scale')) || 1;
    const setS = (s) => root.style.setProperty('--toolbar-scale', clampS(s).toFixed(3));

    // MIGRATE the old fixed-height override (pre-2.254.0) to a scale so a user
    // who had resized doesn't jump back to default: scale ≈ oldHeight / 40.
    const oldH = parseInt(localStorage.getItem('toolbarHeight'));
    if (oldH && !localStorage.getItem('toolbarScale')) {
      localStorage.setItem('toolbarScale', clampS(oldH / 40).toFixed(3));
      localStorage.removeItem('toolbarHeight');
    }
    const saved = parseFloat(localStorage.getItem('toolbarScale'));
    if (saved && saved >= MIN_S && saved <= MAX_S && Math.abs(saved - 1) > 0.02) setS(saved);

    handle.title = t('Drag to resize the top bar · double-click to reset');
    handle.addEventListener('dblclick', () => {
      root.style.removeProperty('--toolbar-scale'); // back to the CSS default (1)
      localStorage.removeItem('toolbarScale');
      this.app.wm._reflowWindows?.();
      this.app.layoutManager.scheduleAutoSave();
    });
    handle.addEventListener('pointerdown', (e) => { // THE DOOR (verify r2 census): captured on the handle, fed by the one feed
      if (e.button !== 0 || e.isPrimary === false) return;
      const startY = e.clientY;
      const startS = curScale();
      handle.classList.add('active');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      this.app.wm._suppressReflow = true; // ResizeObserver storm during drag
      const onMove = (ev) => setS(startS + (ev.clientY - startY) / uiScale() / PXPER); // drag DOWN = bigger (viewport→layout px under the DPI zoom)
      const onUp = () => {
        handle.classList.remove('active');
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        const s = curScale();
        if (Math.abs(s - 1) < 0.03) { root.style.removeProperty('--toolbar-scale'); localStorage.removeItem('toolbarScale'); }
        else localStorage.setItem('toolbarScale', s.toFixed(3));
        this.app.wm._suppressReflow = false;
        this.app.wm._reflowWindows?.();
        this.app.layoutManager.scheduleAutoSave();
      };
      startPointerDrag(handle, e, { onMove, onEnd: onUp, shield: 'toolbar-scale' });
    });
    handle.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); }); // the compat press: no selection
  }

  // ── Taskbar resize ──

  _setupTaskbarResize() {
    const handle = document.getElementById('taskbar-resize-handle');
    const taskbar = document.getElementById('taskbar');
    if (!handle || !taskbar) return;

    const MIN_H = 36, MAX_H = 120;
    // Restore saved height
    const saved = parseInt(localStorage.getItem('taskbarHeight'));
    if (saved && saved >= MIN_H && saved <= MAX_H) {
      taskbar.style.height = saved + 'px';
      this._adaptTaskbarSize(saved);
    }

    // Double-click = reset to the CSS default: clears the inline height, the
    // persisted override AND the adaptive size vars. The first drag used to
    // permanently inflate item sizing — the JS-derived vars don't equal the
    // CSS defaults even at the same 44px height — with no way back (real
    // report: "margin一resize就变大再也回不去").
    handle.addEventListener('dblclick', () => {
      taskbar.style.height = '';
      localStorage.removeItem('taskbarHeight');
      this._clearTaskbarSizeVars();
      this.app.wm._reflowWindows?.();
      this.app.layoutManager.scheduleAutoSave();
    });
    handle.title = t('Drag to resize · double-click to reset');

    handle.addEventListener('pointerdown', (e) => { // THE DOOR (verify r2 census)
      if (e.button !== 0 || e.isPrimary === false) return;
      const startY = e.clientY;
      const startH = taskbar.offsetHeight;
      handle.classList.add('active');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      // Suppress ResizeObserver-triggered reflow during drag
      this.app.wm._suppressReflow = true;

      const top = document.body.classList.contains('taskbar-top');
      const onMove = (e) => {
        // bottom taskbar: drag UP grows; top taskbar: drag DOWN grows
        const delta = (top ? (e.clientY - startY) : (startY - e.clientY)) / uiScale();
        const h = Math.max(MIN_H, Math.min(MAX_H, startH + delta));
        taskbar.style.height = h + 'px';
        this._adaptTaskbarSize(h);
      };
      const onUp = () => {
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('taskbarHeight', taskbar.offsetHeight);
        // Re-enable reflow and do one final reflow
        this.app.wm._suppressReflow = false;
        this.app.wm._reflowWindows?.();
        // Broadcast height to other clients via layout sync
        this.app.layoutManager.scheduleAutoSave();
      };
      startPointerDrag(handle, e, { onMove, onEnd: onUp, shield: 'taskbar-height' });
    });
    handle.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); });
  }

  /** Adapt desktop preview and taskbar element sizes to current height */
  _clearTaskbarSizeVars() {
    const root = document.documentElement;
    for (const v of ['--desktop-preview-h', '--desktop-preview-w', '--desktop-label-size',
      '--taskbar-icon-size', '--taskbar-icon-scale', '--taskbar-title-size',
      '--taskbar-sub-size', '--usage-pie-size', '--taskbar-item-pad']) {
      root.style.removeProperty(v);
    }
  }

  _adaptTaskbarSize(h) {
    const root = document.documentElement;
    // Preview: ratio of taskbar height, rest for label. Default 70%.
    const ratio = (this.app.settings?.get('taskbar.desktopPreviewRatio') ?? 70) / 100;
    const previewH = Math.max(12, Math.round(h * ratio) - 6); // 6px for padding
    const labelSize = Math.max(6, Math.round((h - previewH) * 0.6));
    root.style.setProperty('--desktop-preview-h', previewH + 'px');
    root.style.setProperty('--desktop-preview-w', Math.round(previewH * 1.5) + 'px');
    root.style.setProperty('--desktop-label-size', labelSize + 'px');
    // Toolbar-hosted previews (customize-mode arrangement) obey the SAME ratio
    // derived from the fixed 40px toolbar — they were clamped to hardcoded
    // 34×20 and ignored taskbar.desktopPreviewRatio entirely (real report).
    const tbH = 40;
    const tpH = Math.max(12, Math.min(28, Math.round((tbH - 6) * ratio)));
    root.style.setProperty('--toolbar-preview-h', tpH + 'px');
    root.style.setProperty('--toolbar-preview-w', Math.round(tpH * 1.6) + 'px');
    root.style.setProperty('--toolbar-preview-label', Math.max(6, Math.round((tbH - tpH - 8) * 0.55)) + 'px');
    // All elements proportional to taskbar height — no upper caps
    const iconSize = Math.max(14, Math.round(h * 0.4));
    root.style.setProperty('--taskbar-icon-size', iconSize + 'px');
    root.style.setProperty('--taskbar-icon-scale', (iconSize / 14).toFixed(2));
    root.style.setProperty('--taskbar-title-size', Math.max(8, Math.round(h * 0.18)) + 'px');
    root.style.setProperty('--taskbar-sub-size', Math.max(7, Math.round(h * 0.14)) + 'px');
    root.style.setProperty('--usage-pie-size', Math.max(10, Math.round(h * 0.25)) + 'px');
    root.style.setProperty('--taskbar-item-pad', Math.max(2, Math.round(h * 0.06)) + 'px');
  }

  // ── Helpers ──

  /** Hide a window without collapsing layout (preserves scroll, DOM state): the DESKTOP REASON is added through the ONE
   *  door (WindowManager.setWindowHidden) and every mark is derived there — visibility:hidden + pointer-events (the box
   *  stays), aria-hidden (2.369.144), a chat's content-visibility:hidden (inc-mtd54h45: the switch repaints from the
   *  cached rendering instead of re-measuring), the suspended ChatView (inc-mtd1d0ft). This method writes none of them
   *  (inc-munl8jkl-gaih: the Stage's show forgot one this method wrote — a blank, unclickable window). */
  _hideWin(win) {
    this.app.wm.setWindowHidden(win, { desktop: true });
  }

  /** Show a previously hidden window: the desktop reason goes; the marks follow from whatever reason is left. */
  _showWin(win) {
    this.app.wm.setWindowHidden(win, { desktop: false });
  }

  _generateId() {
    return 'desk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
  }
}
