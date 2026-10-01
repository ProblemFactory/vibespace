import { track } from './telemetry-client.js';
import { cssVarDefault, showToast } from './utils.js';
import { t } from './i18n.js';
import { isTransientWindowType } from './window-types.js';
import { wordlessTitleOf } from '../record-clear.js'; // PURE: the title a layout RECORD keeps for a window drawn from a record's words (lane-redact verify r7)
import { chainSyncKey, ratioDiffers, heldRatio, releaseRatio, withoutMembers } from './chain-layout.js'; // agent browser P7 (§4.6): the sync key carries the layout; the ratio applies in place (unless a local divider drag holds it — v2 verify r1 ①)

// The MEMBERS of a chain (host first) — NOT a sync key (chainSyncKey is): two
// records with the same members differ only in layout and are applied in place.
const membersOf = (c) => ((c && Array.isArray(c.tabs)) ? c.tabs : []).map(String).join(',');
// THE HELD CLOSE (inc-mukeyzpt-lpou): how long a LOCAL close outranks a remote record that still lists the window
// when no save carrying the close has left this client yet — §6b's dirty expiry, the held ratio's RATIO_HOLD_MS.
const CLOSE_HOLD_MS = 60000;
// THE UNSAVED ACT's hold (verify r4 ①): a move / drag / resize witness (`_movedAt` / `_boundsAt`) holds against a record only this
// long after the act (§6b guard 2's expiry: an idle page holds nothing over the server) — the close hold's and the divider's bound
const ACT_HOLD_MS = 60000;
// THE ACK (verify r5 ⑤): a save CARRIES an act only once the server says it READ it (`layout-sync-ack {desktopId, sentAt}`),
// never at the send — a socket that looks open but the server never reads (a restart under it, a wifi drop the browser
// sees late) used to count the save as sent, the reconnect's re-read reversed the act and nothing re-sent it. A server that
// answers no ack at all (an older one) is given this long after the send on an OPEN socket, then today's rule applies
// (stamped at the send) — a skewed pair never hangs; once ONE ack has been seen from this server the fallback is off for good
const ACK_WAIT_MS = 2000;
// THE CLOCK WATCH (verify r5 ①): every hold above is a wall-clock age, and a machine that SLEEPS wakes with the wall clock 20
// minutes ahead while the page ran for none of it — every held witness expired at once, guard 2 dropped the save that was
// pending at the lid-close, the reconnect's re-read reversed the act, nothing said. A tick every CLOCK_TICK_MS; one that
// arrives CLOCK_JUMP_MS late (past its interval) is a sleep: what was held when the page stopped running is re-armed by the
// gap. A minute the page RAN through still expires (an idle page holds nothing over the server).
const CLOCK_TICK_MS = 5000;
const CLOCK_JUMP_MS = 20000;

// Window types that legitimately carry no openSpec (never persisted/synced):
// chat/terminal restore by session identity + get their openSpec async after
// 'created'; the stage placeholder is a stage-only pseudo-window. Each such
// kind declares `persist:false` in the window-type registry (Plugin Ph1) and
// is read here through isTransientWindowType() — the former
// TRANSIENT_WINDOW_TYPES set, now owned by the modules that own the kinds.


// Boot-time scan of NON-ACTIVE desktops' SAVED window states for dead session
// windows (2.331.0, real report "只会批量resume当前desktop里的窗口"): the
// resume-all collector only sees restoreState, and at boot restoreState runs
// for the ACTIVE desktop only — every other desktop's windows are LAZY
// (_savedStates) and replay on first visit, so their interrupted sessions
// never reached the offer. PURE (data in, list out) so the matrix is
// testable: mirrors restoreState's aliveness logic exactly (backendSessionId
// beats serverSessionId; remote windows can never stoppedMatch against LOCAL
// discovery and are collected from their openSpec identity instead).
export function scanStoppedInDesktopStates(data, activeId, live, all, getCustomName) {
  const out = [];
  for (const meta of data?.desktopMeta || []) {
    if (!meta?.id || meta.id === activeId) continue;
    for (const ws of data.desktops?.[meta.id]?.autoSave?.windows || []) {
      if (ws.type !== 'terminal' && ws.type !== 'chat') continue;
      const backend = ws.backend || ws.openSpec?.backend || 'claude';
      const bsid0 = ws.backendSessionId || ws.claudeSessionId || ws.openSpec?.backendSessionId;
      const backendSessionId = bsid0 && bsid0 !== ws.serverSessionId ? bsid0 : null;
      if (!backendSessionId) continue;
      const alive = live.find((s) => (s.backend || 'claude') === backend && (s.backendSessionId || s.claudeSessionId) === backendSessionId)
        || (ws.serverSessionId && live.find((s) => s.id === ws.serverSessionId));
      if (alive) continue;
      const customName = getCustomName?.(backendSessionId);
      // land the resumed window back on ITS desktop at its saved spot
      // …taking the place of its old record entry there (never opened by this page: nothing else removes it —
      // userW inc-mun7qjmw-iksh)
      const winBounds = { gridBounds: ws.gridBounds || null, desktopId: meta.id, winId: ws.winId || ws.id || null };
      const stoppedMatch = all.find((s) => (s.backendSessionId || s.sessionId) === backendSessionId && (s.backend || 'claude') === backend);
      if (stoppedMatch) {
        out.push({ sessionId: stoppedMatch.sessionId, cwd: stoppedMatch.cwd,
          name: customName || stoppedMatch.name || ws.title || 'Session',
          opts: { backend, backendSessionId, hostId: ws.openSpec?.hostId || undefined, winBounds } });
      } else if (ws.openSpec?.hostId) {
        out.push({ sessionId: backendSessionId, cwd: ws.cwd || '',
          name: customName || ws.title || 'Session',
          opts: { backend, backendSessionId, hostId: ws.openSpec.hostId, winBounds } });
      }
    }
  }
  return out;
}

/** The reconnect's re-read of /api/layouts, when it fails (5xx, a cut socket): retried this many times, this far apart
 *  (× the attempt) — a failed read leaves the page on the stale base the read exists to end (verify r2 ⑥). */
const RESYNC_RETRIES = 3;
const RESYNC_RETRY_MS = 1500;

class LayoutManager {
  constructor(app) {
    this.app = app;
    this._autoSaveTimer = null;
    this._savedPresets = {};
    this._currentName = null;

    // ── Multi-client sync stability ──
    // _lastRemoteSeq: drop stale/out-of-order broadcasts (server stamps seq).
    // _userDirty: true only after a REAL local input since the last remote
    //   apply — broadcasts are gated on it, so the local timers that fire
    //   while/after applying remote state (captureGridBounds chains, onResize)
    //   can never echo a slightly-different state back (the ping-pong where an
    //   op on one client got undone and replayed).
    // _pointerDown: while the user is mid-drag/resize, inbound remote state is
    //   deferred (the latest PER DESKTOP) and applied on pointerup — remote state
    //   can no longer yank a window out from under an in-progress drag.
    // _pendingRemote: desktopId ('' = the legacy single record) → the latest record
    //   deferred under a gate (the pointer down, or `_restoring` — the apply's 1 s
    //   cooldown and the boot's 5 s). NEVER dropped (lane desktop-move verify r1,
    //   D4): a record dropped here left this client's base of that desktop stale,
    //   and its next save then dropped the window another client had just moved
    //   there — one slot for every desktop lost the HR record of a burst HR, Fin,
    //   Fin, and a record under `_restoring` was dropped outright.
    this._lastRemoteSeq = 0;
    this._userDirty = false;
    this._pendingRemote = new Map();
    this._drainTimer = null;
    this._pointerDown = false;
    // _applying: the SYNCHRONOUS span of a remote apply (and the cached sweep's closes) — a close made inside it is
    //   the record's; one made in the 1 s cooldown after it (`_restoring`) is the USER's (verify r3 ③: noteClosed and
    //   the dirty desks refused every close under `_restoring`, and scheduleAutoSave dropped every user act under it —
    //   a drop, a close, a drag in the second after another client's record landed waited for the next act; a reload
    //   in between undid it). _booting: the boot restore (its 5 s).
    this._applying = false;
    this._booting = false;
    this._lastSentJson = null;
    // THE ACK's ledger (verify r5 ⑤): the saves answered by nothing yet ({sentAt, desks, pending, refused, at: when it left on
    // an open socket}); `_carried` desktop → the sentAt of the last save the server READ for it (actHeld's release);
    // `_serverAcks` once this server has acked anything (the no-ack fallback is then never taken)
    this._unacked = []; this._carried = new Map(); this._serverAcks = false; this._ackTimer = null;
    this._clockLast = Date.now(); this._clockTimer = setInterval(() => this._clockTick(), CLOCK_TICK_MS); this._clockTimer.unref?.(); // THE CLOCK WATCH (verify r5 ①)
    document.addEventListener('pointerdown', () => { this._userDirty = true; this._lastUserInputAt = Date.now(); this._pointerDown = true; }, { capture: true, passive: true });
    document.addEventListener('keydown', () => { this._userDirty = true; this._lastUserInputAt = Date.now(); }, { capture: true, passive: true });
    const flushPending = () => this._flushPending();
    document.addEventListener('pointerup', flushPending, { capture: true, passive: true });
    document.addEventListener('pointercancel', flushPending, { capture: true, passive: true });
    // Server restart resets its seq counter — reset ours on every reconnect; and a RECONNECT re-reads the layout
    // (§6b guard 9, lane desktop-move verify r1 D2): what other clients wrote during the outage never arrives
    // by broadcast. 250 ms after the open — the sends queued during the outage have left first.
    this._connects = 0;
    // a socket that DIED answers nothing more: the saves it carried are owed by nobody (their acts stay held — `_carried` is
    // untouched — and the re-send after the re-read carries them again); one queued while down (`at` null) has not left
    app.ws.onStateChange((connected) => { if (!connected) { this._lastSentJson = null; this._unacked = this._unacked.filter((s) => s.at == null); } if (connected) { this._clockTick(); this._lastRemoteSeq = 0; for (const s of this._unacked) if (s.at == null) s.at = Date.now(); if (this._connects++ > 0) setTimeout(() => this._resyncFromServer(), 250); } }); // a save queued while down LEAVES now (ws.js flushes right after the handlers): its no-ack clock starts here (verify r5 ⑤)

    // Listen for state sync from other clients
    app.ws.onGlobal((msg) => {
      if (msg.type === 'layout-sync-ack') { this._onLayoutAnswer(msg.desktopId, msg.sentAt, { refused: false }); return; } // the server READ a save (verify r5 ⑤)
      if (msg.type === 'layout-sync-refused') { this._onLayoutAnswer(msg.desktopId, msg.sentAt, { refused: true }); return; } // …or refused one: that desktop's acts stay held (the desktop manager reconciles + re-sends)
      if (msg.type !== 'layout-sync') return;
      if (msg.seq) {
        if (msg.seq <= this._lastRemoteSeq) return; // stale echo — never re-apply older state
        this._lastRemoteSeq = msg.seq;
      }
      msg.receivedAt = Date.now(); // a record knows nothing this page did after this instant (the held move, verify r2)
      // under a gate: DEFERRED per desktop, applied once the gate opens — never dropped (§6b guard 3)
      if (this._restoring || this._pointerDown) { this._deferRemote(msg); return; }
      this._handleRemoteSync(msg);
    });
  }

  /** The pointer came up: the records deferred under it are applied after the drop's own snap/capture timers
   *  (250 ms) have settled. */
  _flushPending() {
    this._pointerDown = false;
    if (this._pendingRemote.size) this._drainDeferred(300);
  }

  /** A record that landed under a gate waits under its DESKTOP's key (the latest per desktop wins; a burst for
   *  several desktops keeps one each). Under the apply / boot gate the drain polls until the gate opens; under
   *  the pointer, the pointerup drains. */
  _deferRemote(msg) {
    this._pendingRemote.set(msg.desktopId || '', msg);
    if (!this._pointerDown) this._drainDeferred(200);
  }

  /** Apply the deferred records ONE per tick, lowest seq first, each only when neither gate is up (an apply of
   *  the desktop on show raises `_restoring` for 1 s — the next record waits for it). */
  _drainDeferred(delayMs) {
    if (this._drainTimer) clearTimeout(this._drainTimer);
    this._drainTimer = setTimeout(() => {
      this._drainTimer = null;
      if (!this._pendingRemote.size || this._pointerDown) return; // the pointerup drains
      if (this._restoring) { this._drainDeferred(200); return; }
      const [key, msg] = [...this._pendingRemote.entries()].sort((a, b) => (a[1].seq || 0) - (b[1].seq || 0))[0];
      this._pendingRemote.delete(key);
      this._handleRemoteSync(msg);
      if (this._pendingRemote.size) this._drainDeferred(200);
    }, delayMs);
  }

  /** A RECONNECT RE-READS THE LAYOUT (lane desktop-move verify r1, D2 — §6b guard 9): layout records are a
   *  broadcast-only mirror, and every other such mirror (settings, user state, tasks, statuses) is re-fetched on
   *  reconnect (app.js). Without this a client's held records stayed at what it last saw before the outage, and
   *  its next save wrote that base over whatever arrived meanwhile — one window another client had opened was
   *  wiped (two are the belt's). Each desktop's record is taken exactly as a broadcast would be (the gates defer
   *  it): the desktop on show is applied — positions, creates, a remote move, and a close ONLY of a window the
   *  wire base listed (one the wire never listed is this client's own unsent change and stays) — the others
   *  cached; the meta follows. */
  async _resyncFromServer(attempt = 0) {
    if (attempt === 0) { this._clockTick(); if (this._resyncing) return; this._resyncing = true; } // ONE read in flight (verify r3 ④: a held save re-asks it); a wake is noticed first (verify r5 ①)
    const startedAt = Date.now(); // the read covers every broadcast that landed BEFORE it was asked (verify r2 ⑤)
    let data = null;
    try {
      const res = await fetch('/api/layouts');
      if (res.ok === false) throw new Error('HTTP ' + res.status);
      data = await res.json();
      if (!data || typeof data !== 'object') throw new Error('not a layout document');
    } catch (err) {
      // a failed read leaves the page on the stale base the read exists to end — its next save would write that base
      // over what arrived during the outage (one window is below the belt): retry, bounded; then say so (verify r2 ⑥)
      if (attempt < RESYNC_RETRIES) { setTimeout(() => this._resyncFromServer(attempt + 1), RESYNC_RETRY_MS * (attempt + 1)); return; }
      console.warn('[layout-sync] the reconnect re-read of /api/layouts failed; this page keeps its last records', err);
      try { window.__vsOp?.('layout-resync-failed', { attempts: attempt + 1 }); } catch { }
      // THE STALE BASE (verify r3 ④): until a read succeeds this page's records are older than the server's — a save
      // from them would write that base over what arrived during the outage (the D2 class; below the belt after a
      // restart). Saves are HELD (_doAutoSave re-asks the read); the user is told once per episode.
      this._resyncing = false;
      this._resyncStale = true;
      if (!this._staleTold) { this._staleTold = true; showToast(t('The layout could not be re-read after reconnecting — window changes on this page are held until it can be'), { type: 'warn', duration: 10000 }); }
      return;
    }
    this._resyncing = false;
    const wasStale = this._resyncStale;
    this._resyncStale = false; this._staleTold = false;
    const expired = wasStale ? this._expiredHeldActs() : 0; // counted BEFORE the applies prune the expired witnesses (verify r4 ④)
    const dm = this.app.desktopManager;
    const active = dm?.activeDesktopId;
    const meta = Array.isArray(data.desktopMeta) && data.desktopMeta.length ? data.desktopMeta : undefined;
    // THE RE-READ'S HORIZON (verify r3 ②): the answer knows nothing this page did after it was ASKED, and nothing whose
    // save has not left on an open socket — a drop made while the read was in flight, or while disconnected with its
    // save queued, is held over the answer and re-sent (stamped at the answer, the read reversed the move and the
    // apply's dirty clear swallowed its save — r2 ① one layer up)
    const receivedAt = Math.min(startedAt, this._movesSentAt ?? 0);
    // A record still DEFERRED for the same desktop (verify r2 ⑤): one received before the read was asked is older
    // than the read — dropped, never applied after it (it used to drain a stale record over the fresh one); one
    // received while the read was in flight may be newer than what the read saw — it stays and supersedes the
    // read's record for that desktop (a per-desktop record is whole).
    const take = (msg) => {
      const key = msg.desktopId || '';
      const pend = this._pendingRemote.get(key);
      if (pend && (pend.receivedAt || 0) >= startedAt) return;
      if (this._restoring || this._pointerDown) this._deferRemote(msg); // replaces the older deferred record
      else { this._pendingRemote.delete(key); this._handleRemoteSync(msg); }
    };
    let n = 0;
    const desktops = dm && data.desktops && typeof data.desktops === 'object' ? data.desktops : {};
    // the desktop on show LAST: a window that left it for another desktop during the outage is then found in that
    // desktop's freshly cached record and MOVED there (adoptRemoteMove), not closed
    const order = Object.entries(desktops).sort(([a], [b]) => (a === active) - (b === active));
    for (const [id, d] of order) {
      if (id === '__stage__' || !d?.autoSave || !Array.isArray(d.autoSave.windows)) continue;
      take({ type: 'layout-sync', desktopId: id, state: d.autoSave, resync: true, receivedAt, desktopMeta: id === active ? meta : undefined }); n++;
    }
    if (!dm && Array.isArray(data.autoSave?.windows)) { take({ type: 'layout-sync', state: data.autoSave, resync: true, receivedAt }); n++; }
    try { window.__vsOp?.('layout-resync', { desktops: n }); } catch { }
    if (wasStale && this._userDirty) this.scheduleAutoSave(); // the save held on the stale base goes out on the fresh one (verify r3 ④)
    // THE STALE RELEASE (verify r4 ④): an act held past ACT_HOLD_MS / CLOSE_HOLD_MS is not kept — the fresh records are not
    // held off by an expired witness and no save carries it (§6b guard 2's expiry) — the page followed the server above;
    // the stale toast promised "held until it can be", so the ones that were not are counted and SAID, once
    if (expired) showToast(t('The layout was re-read — window changes made on this page more than a minute ago were not kept ({n})', { n: expired }), { type: 'warn', duration: 10000 });
  }

  /** THE STALE RELEASE's count (verify r4 ④): the acts this page held on its stale base that are past their hold — a
   *  move / drag / resize / group witness no save the server read has carried older than ACT_HOLD_MS, a held close older
   *  than CLOSE_HOLD_MS. Asked before the re-read's records apply. What it counts it RETIRES (verify r5 ④): an expired
   *  witness holds nothing, but left on the window it was counted — and toasted — again at the NEXT stale release. */
  _expiredHeldActs() {
    const now = Date.now();
    let n = 0;
    for (const [, w] of this.app.wm.windows) {
      const t = Math.max(w._movedAt || 0, w._boundsAt || 0, w._chainAt || 0);
      if (!(t > this._carriedAt(w._desktopId) && now - t > ACT_HOLD_MS)) continue;
      n++; w._movedAt = 0; w._boundsAt = 0; w._chainAt = 0; // counted once: said, then gone
    }
    for (const [id, h] of this._heldCloses || []) if (now - h.at > CLOSE_HOLD_MS) { n++; this._heldCloses.delete(id); }
    return n;
  }

  _handleRemoteSync(msg) {
    this._clockTick(); // a record after a sleep: the held acts are re-armed BEFORE it is judged against them (verify r5 ①)
    const dm = this.app.desktopManager;
    // Bar heights are GLOBAL chrome riding PER-DESKTOP states — apply them
    // BEFORE the desktop gate (2.252.2, adversarial-review catch): a client
    // viewing another desktop used to only CACHE the broadcast, so its bars
    // kept the old size; its next desktop switch then captured that stale
    // size and broadcast it back, erasing the first client's resize (and its
    // localStorage) fleet-wide — a residual snap-back route after 2.252.1.
    if (msg.state) {
      if (msg.state.taskbarHeight) this._applyTaskbarHeight(msg.state.taskbarHeight);
      this._applyToolbarState(msg.state);
    }
    const receivedAt = msg.receivedAt ?? Date.now(); // THE HELD MOVE (verify r2): a record cannot know a move this page made after it arrived (a re-read's horizon may be 0: a page that never saved — verify r3 ②)
    if (dm && msg.desktopId) {
      // Desktop-aware: only apply if it's for our active desktop
      if (msg.desktopId !== dm.activeDesktopId) {
        // Cache state for non-active desktop — through the desktop manager: a window this client still holds
        // (hidden) that the record's sender REMOVED is closed here now, never shown again by the next switch
        // (inc-mukeyzpt-lpou, the parked second client)
        dm.cacheRemoteState(msg.desktopId, msg.state, { receivedAt });
        dm._renderSwitcher(); // update window counts
        return;
      }
    }
    this._applyRemoteState(msg.state, { closeOnlyWired: !!msg.resync, receivedAt });
    if (dm && msg.desktopId) {
      dm.noteWire(msg.desktopId, msg.state); // the record this desktop was last seen as on the wire
      // …and the held record of the desktop on show follows it (the view's base: the next save merges the page's
      // windows onto it; a window a held close removed never comes back through it)
      dm.cacheShownState?.(msg.desktopId, msg.state);
    }
    if (msg.desktopMeta && dm) dm.updateFromMeta(msg.desktopMeta);
  }

  // Apply remote state: diff against local windows, update only what changed
  _applyRemoteState(state, { closeOnlyWired = false, receivedAt = Date.now() } = {}) {
    if (!state) return;
    this._restoring = true;
    this._applying = true;
    let heldKept = false; // a local divider drag kept over the record (v2 verify r1 ①) — re-sent once below
    let heldClosed = false; // a window THIS client closed, still listed by the record (inc-mukeyzpt-lpou) — the close is re-sent once below
    let heldMoved = false; // a window THIS page moved AFTER the record arrived (verify r2) — kept where the user put it, the move re-sent once below
    const heldIds = (state.windows || []).map((rw) => rw.winId || rw.id).filter((id) => this._closeHeld(id));
    // THE HELD CHAIN ACT (stage-blank verify r5): a tab this user tore off / merged / moved in its strip here that no record
    // has AGREED with yet — the record's chains and that window's entry are older than the act (_heldChainIds)
    const heldChain = new Set(this._heldChainIds(state));
    const chainHeld = (tabs) => Array.isArray(tabs) && tabs.some((id) => heldChain.has(String(id)));
    try {
      // Grid
      if (state.grid) {
        const cur = this.app.wm.grid;
        if (!cur || cur.rows !== state.grid.rows || cur.cols !== state.grid.cols) {
          this.app.wm.setGrid(state.grid.rows, state.grid.cols);
        }
      }
      // Sidebar
      if (state.sidebarOpen !== undefined && state.sidebarOpen !== this.app.sidebar.isOpen) {
        this.app.sidebar.toggle(state.sidebarOpen);
      }
      // Taskbar height
      if (state.taskbarHeight) {
        this._applyTaskbarHeight(state.taskbarHeight);
      }
      this._applyToolbarState(state);
      // Windows: update existing, create missing, close removed
      if (state.windows) {
        const remoteIds = new Set();
        for (const rw of state.windows) {
          const winId = rw.winId || rw.id;
          remoteIds.add(winId);
          const win = this.app.wm.windows.get(winId);
          // a window whose chain act is held: the record's entry for it (its box = its OLD frame's) is older than the act —
          // skipped whole, the act re-sent below (stage-blank verify r5)
          if (win && heldChain.has(String(winId))) { heldClosed = true; continue; }

          if (!win) {
            // THE HELD CLOSE (inc-mukeyzpt-lpou): this client closed it and no save carrying that close has left
            // yet — the record is OLDER than the close; it never re-creates the window (the close goes out below)
            if (heldIds.includes(winId)) { heldClosed = true; continue; }
            // Window doesn't exist locally — create it
            this._createRemoteWindow(rw);
            continue;
          }
          // THE HELD MOVE (verify r2): this page moved the window AFTER the record arrived (a drop on a preview at
          // the very pointerup the record waited for) — the record cannot know it; nothing of its entry applies,
          // and the move goes out once more below. (r1's move-in below re-adopted the window onto the desktop the
          // user had just dragged it off, and the apply's dirty clear swallowed the move's own save.)
          if (this.actHeld(win._movedAt, receivedAt, win)) { heldMoved = true; continue; }
          // A REMOTE MOVE IN (lane desktop-move verify r1, D4): the record of the desktop on show lists a window
          // this client holds on ANOTHER desktop — another client moved it here. It is moved here, not left
          // where it was: the source desktop's record (sent right after the target's) would otherwise CLOSE it
          // below, and that close became evidence that lost the window on the server.
          this.app.desktopManager?.adoptRemoteMove?.(win, win._desktopId, { to: this.app.desktopManager.activeDesktopId, rec: rw });
          // THE HELD GEOMETRY (verify r2 ⑩; the held move's twin for a drag / a resize on the desktop on show): the
          // user's own drag or resize ended AFTER this record arrived (`_boundsAt`, stamped by window.js at the
          // pointerup) — the record's box, maximize and minimize are older than it; skipped, and re-sent below
          // (guard 3 applied the deferred record at the pointerup and snapped the window back where the other
          // client last saw it, and the apply's dirty clear swallowed the drag's own save)
          const heldGeom = this.actHeld(win._boundsAt, receivedAt, win);
          if (heldGeom) heldMoved = true;

          // Update gridBounds. Epsilon must exceed the px-rounding drift:
          // _captureGridBounds derives fractions from INTEGER offsetLeft/Width,
          // so apply→recapture can differ by up to ~0.5px/viewport (0.0004 at
          // 1280w) — the old 0.0001 epsilon saw that as a "change" and clients
          // with different viewport sizes re-broadcast forever (ping-pong).
          // 0.002 ≈ 2-4px: below any real move, above all rounding noise.
          if (rw.gridBounds && !heldGeom) {
            const EPS = 0.002;
            const changed = !win.gridBounds
              || Math.abs(win.gridBounds.left - rw.gridBounds.left) > EPS
              || Math.abs(win.gridBounds.top - rw.gridBounds.top) > EPS
              || Math.abs(win.gridBounds.width - rw.gridBounds.width) > EPS
              || Math.abs(win.gridBounds.height - rw.gridBounds.height) > EPS;
            if (changed) {
              win.gridBounds = rw.gridBounds;
              this.app.wm._applyGridBounds(win);
              setTimeout(() => { if (win.onResize) win.onResize(); this.app.wm._applyGridBounds(win); }, 150);
            }
          }
          // z-index: only apply if remote z is higher (local focus wins)
          const z = rw.z || rw.zIndex || 0;
          const localZ = parseInt(win.element.style.zIndex) || 0;
          if (z > localZ) {
            win.element.style.zIndex = z;
            if (z >= this.app.wm.zIndex) this.app.wm.zIndex = z + 1;
          }
          if (!heldGeom) {
            // maximize
            const isMax = rw.isMaximized ?? false;
            if (isMax && !win.isMaximized) this.app.wm.toggleMaximize(win.id);
            if (!isMax && win.isMaximized) this.app.wm.toggleMaximize(win.id);
            // minimize/restore
            const isMin = rw.min ?? rw.isMinimized ?? false;
            if (isMin && !win.isMinimized) this.app.wm.minimize(win.id);
            if (!isMin && win.isMinimized) this.app.wm.restore(win.id);
            // snap state
            win._isSnapped = rw.snap ?? rw.isSnapped ?? false;
            const snapB = rw.snapBounds || rw.preSnapBounds;
            if (snapB) win._preSnapBounds = snapB;
          }
          // file explorer navigation sync (host first — path is host-relative)
          const rwHost = rw.explorerHost || '';
          if (win._explorer && (win._explorerHost || '') !== rwHost) {
            win._explorer.setHost(rwHost, { navigate: false });
          }
          if (rw.explorerPath && win._explorerPath !== rw.explorerPath) {
            // Find the FileExplorer instance and navigate
            const explorer = win._explorer;
            if (explorer) explorer.navigate(rw.explorerPath);
          }
        }
        // Close windows that exist locally but not remotely
        // Only close windows belonging to the active desktop (other desktops' windows are hidden)
        const activeDesk = this.app.desktopManager?.activeDesktopId;
        for (const [id] of this.app.wm.windows) {
          if (!remoteIds.has(id)) {
            const win = this.app.wm.windows.get(id);
            if (activeDesk && win?._desktopId && win._desktopId !== activeDesk) continue;
            // Windows without an openSpec can't have been replayed remotely —
            // e.g. a createSession window still waiting for its 'created' reply.
            // Closing it here would KILL the just-created session.
            if (!win?._openSpec) continue;
            // THE HELD MOVE (verify r2): this page moved the window HERE after the record arrived — it stays
            if (this.actHeld(win._movedAt, receivedAt, win)) { heldMoved = true; continue; }
            // A WINDOW BORN AFTER THE RECORD ARRIVED (2.369.199 integration): a record deferred under a gate — the boot's 5 s
            // `_restoring` since lane desktop-move — drained over the windows this page opened meanwhile and closed them (a phone's
            // first Channels window vanished 12 ms after it opened). The record cannot know a window younger than itself.
            if (win._bornAt > receivedAt) continue;
            // A REMOTE MOVE OUT (lane desktop-move verify r1, D4): another desktop's held record — the target's,
            // which arrives first — lists it: it moved there. Moved, never closed (a close here made 'closed'
            // evidence and the next save of the target dropped it on the server).
            if (this.app.desktopManager?.adoptRemoteMove?.(win, activeDesk)) continue;
            // a reconnect's re-read closes only what the WIRE listed: a window the wire never listed for this
            // desktop is this client's own change, not sent yet (its save left the queue an instant ago)
            if (closeOnlyWired && !this.app.desktopManager?.wireListed?.(activeDesk, id)) continue;
            this.app.wm.closeWindow(id);
          }
        }

        // Sync tab chains from remote state. THE KEY CARRIES THE LAYOUT
        // (agent browser P7, §4.6's named trap): `tabs.join(',')` alone read a
        // remote tabs→split flip of the same tabs as "unchanged" — a silent
        // state fork. chainSyncKey = members + strip order + layout + the side
        // cut + pair (split tabs v2); the RATIO is applied in place on a
        // structural match (a rebuild for a divider drag would re-parent two
        // live views). A key that differs while the MEMBERS (and the host) are
        // the same — a reorder, a cross-side move, a per-side switch, a swap, a
        // split / unsplit — is applied IN PLACE too (applyChainRecord: no
        // re-parenting, `active` stays this client's); only a membership or
        // host change rebuilds the chain.
        const recorded = new Map(state.windows.map((rw) => [rw.winId || rw.id, rw])); // the record's row per window id (the broken chain's members go back to the record's boxes, verify r4)
        const remoteChains = new Map(); // key -> { tabs, active, layout, split, order }
        const remoteByMembers = new Map(); // tabs.join(',') -> key
        for (const rw of state.windows) {
          if (!rw.tabChain || rw.isTabGuest) continue;
          // a held close leaves the record's chain exactly as it left the local one (PURE removeTab, the same
          // arithmetic — same key): never a rebuild around a member that is gone, which flattened the split
          const tc = heldIds.length ? withoutMembers(rw.tabChain, heldIds) : rw.tabChain;
          if (!tc) continue;
          const key = chainSyncKey(tc);
          remoteChains.set(key, tc);
          remoteByMembers.set(membersOf(tc), key);
        }
        // Break local chains not in remote
        // A LOCAL divider drag this record could not have known (it was held
        // for that drag's pointerup — §6b guard 3) keeps its ratio on BOTH
        // in-place paths and re-arms one save below (v2 verify r1 ①).
        const localChainKeys = new Set();
        for (const [, w] of this.app.wm.windows) {
          if (w._tabChain && w._tabChain.tabs[0] === w.id) {
            // a chain on ANOTHER desktop (hidden there) is not this record's to judge (verify r2: every save of
            // the desktop on show by another client BROKE every tab group this page held on its other desktops —
            // the group gone on the page, then on the server with this page's next save of that desktop)
            if (activeDesk && w._desktopId && w._desktopId !== activeDesk) continue;
            const key = chainSyncKey(w._tabChain);
            localChainKeys.add(key);
            // THE HELD CHAIN (verify r5 ②): a group this page changed — a merge, a side-by-side, an unsplit, a swap, a reorder, a
            // tear-off — after the record landed, or whose change no save the server read has carried (tab-group witnessChain →
            // `_chainAt` on every member), is kept exactly as it is and re-sent once: the record cannot know it (it used to break
            // the group a merge had just made, or put the older layout back over the user's split, and the act's save was swallowed)
            if (this.actHeld(w._chainAt, receivedAt, w)) { heldKept = true; continue; }
            const rc = remoteChains.get(key);
            if (rc && ratioDiffers(rc, w._tabChain)) {
              if (heldRatio(w._tabChain, Date.now()) !== null) heldKept = true;
              else this.app.wm.setSplitRatio(w._tabChain, rc.split.ratio, { notify: false });
            }
            const sameMembers = !remoteChains.has(key) && remoteByMembers.get(membersOf(w._tabChain));
            if (sameMembers && !localChainKeys.has(sameMembers)) {
              // the user's own reorder / split / unsplit here, no record has agreed with yet: kept, re-sent (verify r5)
              if (chainHeld(w._tabChain.tabs)) { heldClosed = true; localChainKeys.add(sameMembers); continue; }
              const kept = this.app.wm.applyChainRecord(w._tabChain, remoteChains.get(sameMembers));
              if (kept) heldKept = true;
              localChainKeys.add(sameMembers);
              continue;
            }
            if (!remoteChains.has(key)) {
              // the user's own merge here, no record has agreed with yet: the group stays, re-sent (verify r5)
              if (chainHeld(w._tabChain.tabs)) { heldClosed = true; continue; }
              // Break this chain — and put every member back where the RECORD places it (verify r4 of inc-munl8jkl-gaih,
              // found under the mixed-version leg): the windows loop above applied the record's box, then the detach copied
              // the HOST's box onto each leaving guest (tab-group _detachFromChain: a tear-off drops the tab beside its frame),
              // so a tab torn off on ANOTHER device landed ON its old host here, and this page's next save wrote it back there
              // for every client — the other user's tear-off undone
              const members = [...w._tabChain.tabs];
              while (w._tabChain && w._tabChain.tabs.length > 1) {
                const lastId = w._tabChain.tabs[w._tabChain.tabs.length - 1];
                this.app.wm._detachFromChain(w._tabChain, lastId);
              }
              if (w._tabChain) this.app.wm._ungroupLast(w._tabChain);
              for (const id of members) {
                const rw = recorded.get(id), win = this.app.wm.windows.get(id);
                if (rw && rw.gridBounds && win && !win._onStage) { win.gridBounds = { ...rw.gridBounds }; this.app.wm._applyGridBounds(win); }
              }
            }
          }
        }
        // Create remote chains not present locally. A member whose window is
        // still being REPLAYED (an async openSpec — FileViewer.open awaits
        // /api/file/info before it creates its window) keeps the chain PENDING
        // until it appears (split tabs v2, F2's race): restoring without it left
        // a free viewer here, and this client's next user-caused save (no
        // chain) broke the other client's chain.
        this._pendingChains = [];
        const replaying = this._replaying || new Set();
        for (const [key, tc] of remoteChains) {
          if (localChainKeys.has(key)) continue;
          // a group this user tore a tab out of here (or took apart), no record has agreed with yet: never re-formed by a
          // record that predates the tear — deferred under the very drag, or captured before the tear's save reached its
          // sender (stage-blank verify r5: the torn tab snapped back onto its old host at the drop, fleet-wide)
          if (chainHeld(tc.tabs)) { heldClosed = true; continue; }
          // …nor is a record's group rebuilt around a member this page just moved out of (or into) a group (verify r5 ②: a
          // tear-off was undone by the older record's chain re-created around the window that left)
          if ((tc.tabs || []).some((id) => { const m = this.app.wm.windows.get(String(id)); return m && this.actHeld(m._chainAt, receivedAt, m); })) { heldKept = true; continue; }
          this._queueChain(key, tc, { inFlight: replaying, waitMs: 8000 });
        }
      }
    } catch (err) {
      // An exception mid-diff aborts the rest of the state application and
      // leaves clients silently diverged — surface it for debugging
      console.error('[layout-sync] _applyRemoteState failed:', err);
    }
    // Everything we just changed came from the remote — nothing local is worth
    // re-broadcasting until the user actually touches something. This is the
    // anti-echo gate: delayed capture/notify timers spawned by the apply fire
    // after the 1s cooldown, but _doAutoSave drops them while !_userDirty.
    this._applying = false;
    this._userDirty = false;
    setTimeout(() => { this._restoring = false; }, 1000);
    // …except a local divider drag the apply KEPT (the record could not know it): it is this user's act, not the
    // record's, and its own save was just dropped by the clear above — send it once, after the gate opens
    // (same delay, scheduled later ⇒ runs later).
    if (heldKept) setTimeout(() => this._resendHeldRatio(), 1000);
    if (heldClosed) setTimeout(() => this._resendHeldClose(), 1000); // …and a close the record could not know, the same way
    // …and a desktop this page OWES the server (a move's target / source no save the server read has carried — the dirty
    // desks): the clear above dropped its save, and a record that never names the moved window (a peer closed it meanwhile)
    // re-arms nothing through the loops — the owed desk is the witness (verify r5 ⑥: the move sat on the page until the
    // user's next act, and a reload in between lost it)
    const owed = this.app.desktopManager?._dirtyDesks;
    if (owed && [...owed].some((d) => !this._unacked.some((s) => s.desks.includes(d)))) heldMoved = true;
    if (heldMoved) setTimeout(() => this._resendHeldMove(), 1000); // …and a move the record could not know (verify r2)
  }

  /** THE CLOCK WATCH (verify r5 ①): called by the 5 s tick and at every wake path (a save, a record, the reconnect, the
   *  re-read). A call that comes CLOCK_JUMP_MS later than the tick's interval since the last call is a SLEEP (the page ran
   *  for none of it; `document.hidden` = a background tab's throttled timer, not a sleep — nothing is re-armed there, nothing
   *  can be held in a tab nobody drives). */
  _clockTick() {
    const now = Date.now(), before = this._clockLast; this._clockLast = now;
    const gap = now - before - CLOCK_TICK_MS;
    if (!(gap > CLOCK_JUMP_MS) || (typeof document !== 'undefined' && document.hidden)) return;
    this._rearmAfterSuspend(gap, before);
  }

  /** What was HELD when the page stopped running at `before` — a move / drag / resize witness no save the server read has
   *  carried, a held close, a held divider ratio, the dirty bit's input time while a save is pending, the owed answers'
   *  no-ack clocks — is moved forward by `gap`: the hold measures how long the page RAN past the act. A witness already
   *  past its hold at `before`, or one a save carried, is left alone (a run minute expires as ever). */
  _rearmAfterSuspend(gap, before) {
    const fresh = (t, hold = ACT_HOLD_MS) => t > 0 && before - t <= hold;
    let n = 0;
    for (const [, w] of this.app.wm.windows) {
      const carried = this._carriedAt(w._desktopId);
      if (fresh(w._movedAt) && w._movedAt > carried) { w._movedAt += gap; n++; }
      if (fresh(w._boundsAt) && w._boundsAt > carried) { w._boundsAt += gap; n++; }
      if (fresh(w._chainAt) && w._chainAt > carried) { w._chainAt += gap; n++; }
      const ch = w._tabChain;
      if (ch && ch.tabs[0] === w.id && ch._ratioHeld && fresh(ch._ratioHeld.at)) { ch._ratioHeld.at += gap; n++; }
    }
    for (const [, h] of this._heldCloses || []) if (fresh(h.at, CLOSE_HOLD_MS)) { h.at += gap; n++; }
    if ((this._userDirty || this._deferT || this._autoSaveTimer) && fresh(this._lastUserInputAt)) { this._lastUserInputAt += gap; n++; }
    for (const s of this._unacked) if (s.at != null) s.at += gap;
    try { window.__vsOp?.('layout-clock-jump', { gap, rearmed: n }); } catch { }
  }

  /** THE UNSAVED ACT (verify r4 ①): is a local act stamped at `t` (a move's `_movedAt`, a drag's / resize's / snap's
   *  `_boundsAt`) held over a record received at `receivedAt`? Yes when the record landed BEFORE the act — it cannot
   *  know it (the held move / geometry of r2) — and yes while NO SAVE HAS CARRIED THE ACT (`_movesSentAt`, stamped by
   *  every save that leaves on an open socket): a record received after the act but before its save left was
   *  captured by a page that could not know it either. It used to revert a drop or a drag made up to 500 ms before
   *  it landed (the autosave's debounce) and swallow the act's save, and under the apply's cooldown the deferred
   *  save (r3 ③) then wrote the peer's box back as the user's; a peer saving every 400 ms undid every act here.
   *  Bounded by ACT_HOLD_MS like every held witness (§6b guard 2: an idle page holds nothing over the server; the
   *  act's real time is never fabricated). */
  actHeld(t, receivedAt, win = null) {
    if (!(t > 0) || Date.now() - t > ACT_HOLD_MS) return false;
    return t >= receivedAt || t > (win ? this._carriedAt(win._desktopId) : (this._movesSentAt || 0));
  }

  // ── THE ACK (verify r5 ⑤): a save carries its acts only once the server READ it ──
  /** The sentAt of the last save the server read for `desk` (`''` = the legacy single record). */
  _carriedAt(desk) { return this._carried.get(desk || '') || 0; }

  /** A save LEFT (or queued, `at` null until the open): `desks` = the desktop records it sent, one answer owed each. */
  noteLayoutSent(desks, sentAt) {
    if (!desks?.length) return;
    this._unacked.push({ sentAt, desks: [...desks], pending: desks.length, refused: new Set(), at: this.app.ws?.connected !== false ? Date.now() : null });
    this._armAckWatch();
  }

  /** The server answered a record of `desk` sent at `sentAt` (an ack, or a refusal — the refused desktop's acts stay held:
   *  nothing carried them; the desktop manager reconciles and re-sends). An answer without `sentAt` (an older server's
   *  refusal, a switch's broadcast) is the oldest owed answer for that desktop. */
  _onLayoutAnswer(desk, sentAt, { refused = false } = {}) {
    if (!refused) this._serverAcks = true;
    const key = desk || '';
    const s = (sentAt && this._unacked.find((x) => x.sentAt === sentAt && x.desks.includes(key))) || this._unacked.find((x) => x.desks.includes(key) && !x.refused.has(key) && x.pending > 0);
    if (!s) return;
    if (refused) s.refused.add(key);
    s.pending--;
    if (s.pending <= 0) this._settleSave(s);
  }

  /** Every record of the save is answered (or the no-ack fallback fired): the desktops it sent and the server READ are
   *  carried as of `sentAt` — their held moves / geometry, closes and divider ratios older than it are released. */
  _settleSave(s) {
    const i = this._unacked.indexOf(s); if (i >= 0) this._unacked.splice(i, 1);
    for (const d of s.desks) if (!s.refused.has(d)) this._markCarried(d, s.sentAt);
    if (s.desks.some((d) => !s.refused.has(d))) this._movesSentAt = Math.max(this._movesSentAt || 0, s.at ?? s.sentAt); // the re-read's horizon: when the server READ it — a save queued while down left at the open, not when it was composed
  }

  _markCarried(desk, sentAt) {
    const key = desk || '';
    if (!(sentAt > this._carriedAt(key))) return;
    this._carried.set(key, sentAt);
    this._movesSentAt = Math.max(this._movesSentAt || 0, sentAt); // the re-read's horizon: the newest save the server read
    this.app.desktopManager?.noteCarried?.(key); // a dirty desk the server read is owed no more
    this._releaseHeldCloses(key || null, sentAt);
    for (const [, w] of this.app.wm.windows) if (w._tabChain && w._tabChain.tabs[0] === w.id && (w._desktopId || '') === key && (w._tabChain._ratioHeld?.at ?? Infinity) <= sentAt) releaseRatio(w._tabChain);
  }

  /** The owed answers are swept while any is owed: a save older than the hold is forgotten (its acts expired with it); a
   *  save an older server will never answer is settled ACK_WAIT_MS after it left on an open socket (today's rule). */
  _armAckWatch() {
    if (this._ackTimer || !this._unacked.length) return;
    this._ackTimer = setTimeout(() => { this._ackTimer = null; this._sweepUnacked(); this._armAckWatch(); }, 500);
    this._ackTimer.unref?.();
  }

  _sweepUnacked() {
    const now = Date.now();
    for (const s of [...this._unacked]) {
      if (now - s.sentAt > ACT_HOLD_MS) { const i = this._unacked.indexOf(s); if (i >= 0) this._unacked.splice(i, 1); continue; }
      if (!this._serverAcks && s.at != null && now - s.at > ACK_WAIT_MS) { try { window.__vsOp?.('layout-ack-fallback', { sentAt: s.sentAt, desks: s.desks.length }); } catch { } this._settleSave(s); }
    }
  }

  /** THE HELD MOVE (verify r2; the held close's twin). A remote apply skipped a window this page MOVED after the
   *  record arrived (`win._movedAt`, stamped by moveWindowToDesktop; the record's `receivedAt`, stamped when it
   *  landed — a drop on a preview happens at the very pointerup the deferred record waited for). The move is this
   *  user's act, and the apply's dirty clear dropped its own save: send it once, as the user's own act (dirty at
   *  the move's REAL time — §6b guard 2's expiry keeps its meaning), through the ordinary autosave — the target's
   *  held record is dirty, the source is the desktop on show. A move a save already carried (`_movesSentAt`) is
   *  not re-sent. */
  _resendHeldMove(tries = 0) {
    if (this._restoring) { if (tries < 25) setTimeout(() => this._resendHeldMove(tries + 1), 200); return; }
    let at = 0;
    for (const [, w] of this.app.wm.windows) { const t = Math.max(w._movedAt || 0, w._boundsAt || 0); if (t > this._carriedAt(w._desktopId) && Date.now() - t <= ACT_HOLD_MS) at = Math.max(at, t); } // a move, a drag or a resize no save the server READ has carried (an expired one holds nothing — verify r4 ①; the ack, verify r5 ⑤)
    if (!at) return; // a later save already carried it
    this._userDirty = true;
    this._lastUserInputAt = Math.max(this._lastUserInputAt || 0, at);
    this.scheduleAutoSave();
  }

  /** THE HELD CLOSE (inc-mukeyzpt-lpou; the held ratio's twin). A LOCAL close is a local change like a drag: until a
   *  save carrying it has left this client, a remote record that still lists the window was captured before the
   *  close reached anybody — it must not re-create it (and the apply's user-dirty clear must not drop the close).
   *  Recorded by the ONE retirement (wm._retireWindow) for a close made while this user is active (an idle
   *  client's programmatic close would never be sent — §6b's expiry — so it is not held); never for a close an
   *  apply or the boot restore made (`_restoring`). Released by the save that carries it (_releaseHeldCloses),
   *  expired after CLOSE_HOLD_MS, and void once a window with that id exists again (an explicit re-open). */
  noteClosed(id, desktopId) {
    if (!id || this._applying || this._booting) return; // a close the apply (or the boot) itself made — one made in the cooldown after an apply is the user's (verify r3 ③)
    const now = Date.now();
    if (!this._lastUserInputAt || now - this._lastUserInputAt > CLOSE_HOLD_MS) return;
    (this._heldCloses ||= new Map()).set(String(id), { at: now, desk: desktopId || null });
  }

  /** Is `id` a held close right now (fresh, not re-opened)? */
  _closeHeld(id) {
    const h = this._heldCloses && this._heldCloses.get(String(id));
    if (!h) return false;
    if (Date.now() - h.at > CLOSE_HOLD_MS || this.app.wm.windows.has(String(id))) { this._heldCloses.delete(String(id)); return false; }
    return true;
  }

  /** A save of `desktopId`'s state left this client (or was identical to the last one sent): it carries every
   *  close made on that desktop — release them (a missing desktop id = every held close). */
  _releaseHeldCloses(desktopId, upTo = Infinity) {
    if (!this._heldCloses) return;
    for (const [id, h] of this._heldCloses) if ((!desktopId || !h.desk || h.desk === desktopId) && h.at <= upTo) this._heldCloses.delete(id);
  }

  /** THE HELD CHAIN ACT (stage-blank verify r5 of inc-munl8jkl-gaih; the held close's twin for a tab TORN OFF, MERGED or
   *  MOVED IN ITS STRIP by this user). A record that still named the old group — deferred under the very drag (§6b
   *  guard 3), or captured by a page that had not received the tear's save yet — re-formed the group at the drop: the
   *  torn tab back on its old host, the drop point lost, and this page's next save carried the re-formed group to
   *  every client (measured in Chrome on two pages). The box's witness (`_boundsAt`, lane desktop-move) is the
   *  drag's, never the strip's. Recorded by the strip's USER doors (tab-group.js _noteChainAct: the tear-off, the
   *  merge drops, moveTabInChain / bindSplit / unbindSplit / swapSplit / undoSplit) for an act made while this user is
   *  active and not under an apply or the boot; released by AGREEMENT — the first record whose chain for the window
   *  (members, strip order, layout, sides: the PURE chainSyncKey, the key the in-place path judges by) matches this
   *  page's (one that carries the act, or a later one) — NEVER by the save: a record deferred
   *  under the drag is applied after the save left (measured: the tear's save at 675 ms, the deferred record applied
   *  at 1742 ms; a hold released at the save would have let it through). Expired after CLOSE_HOLD_MS (§6b guard 2: an
   *  idle page holds nothing over the server); void once the window is gone. While held, the record's entry for the
   *  window and every chain naming it are skipped and the act is re-sent once (the close's re-send; the no-op guard
   *  ends any echo between two pages each holding its own act). */
  noteChainAct(ids, desktopId) {
    if (!Array.isArray(ids) || !ids.length || (this._applying ?? this._restoring) || this._booting) return; // never a record's own mutation (an apply, the boot restore; lane desktop-move's `_applying` once merged)
    const now = Date.now();
    if (!this._lastUserInputAt || now - this._lastUserInputAt > CLOSE_HOLD_MS) return;
    for (const id of ids) if (id) (this._heldChainActs ||= new Map()).set(String(id), { at: now, desk: desktopId || null });
  }

  /** THE DROP of a torn-out tab (tab-group's drop handler, verify r5 ⑤): the detach armed the save while the window still
   *  carried its old host's box, and the drop's own capture runs 250 ms after the release — a release just BEFORE the
   *  debounce fired let the save out in that gap (measured: the tear's save at 689 ms, the release at ~540 ms, the capture
   *  at ~790 ms). _doAutoSave waits 400 ms past the last drop. */
  noteDrop() { this._dropAt = Date.now(); }

  /** The record's chain for `id` (the host row's tabChain); null = it stands alone there. */
  _recordChainOf(state, id) {
    for (const rw of (state && state.windows) || []) if (rw.tabChain && !rw.isTabGuest && Array.isArray(rw.tabChain.tabs) && rw.tabChain.tabs.map(String).includes(String(id))) return rw.tabChain;
    return null;
  }

  /** The ids whose chain act is held AGAINST `state`: fresh, the window alive, and the record DISAGREES with this page's
   *  chain for it (PURE chainSyncKey over both: members, order, layout, sides; alone = ''). An agreeing record releases
   *  the act (it carries it, or a later one does). */
  _heldChainIds(state) {
    const out = [];
    const keyOf = (c) => (c && Array.isArray(c.tabs) ? chainSyncKey(c) : '');
    for (const [id, h] of this._heldChainActs || []) {
      const w = this.app.wm.windows.get(id);
      if (Date.now() - h.at > CLOSE_HOLD_MS || !w) { this._heldChainActs.delete(id); continue; }
      if (keyOf(w._tabChain) === keyOf(this._recordChainOf(state, id))) { this._heldChainActs.delete(id); continue; }
      out.push(id);
    }
    return out;
  }

  /** A remote apply REFUSED to re-create a held close (or to undo a held chain act — verify r5, the same re-send) —
   *  send it ONCE, as the user's own act (the _resendHeldRatio shape): the dirty bit re-set with the act's REAL time,
   *  §6b's 60 s expiry keeping its meaning, through the ordinary autosave (the no-op guard included). */
  _resendHeldClose(tries = 0) {
    if (this._restoring) { if (tries < 25) setTimeout(() => this._resendHeldClose(tries + 1), 200); return; }
    let at = 0;
    for (const [id] of this._heldCloses || []) if (this._closeHeld(id)) at = Math.max(at, this._heldCloses.get(id).at);
    for (const [id, h] of this._heldChainActs || []) if (Date.now() - h.at <= CLOSE_HOLD_MS && this.app.wm.windows.has(id)) at = Math.max(at, h.at); // a held chain act rides the same re-send (verify r5)
    if (!at) return; // a later save (or the expiry) already carried it
    this._userDirty = true;
    this._lastUserInputAt = Math.max(this._lastUserInputAt || 0, at);
    this.scheduleAutoSave();
  }

  /** v2 verify r1 ① (+ the held chain, verify r5 ②): a remote apply KEPT a local divider drag (PURE heldRatio) or a group change — send it ONCE, as the user's own
   *  act: the dirty bit is re-set with the drag's REAL release time (so §6b's 60 s expiry keeps its meaning — a
   *  stamp past it holds nothing) and the ordinary autosave sends it (the no-op guard included). The other client
   *  applies it in place (ratioDiffers) and its own apply clears its dirty bit — one send, no echo. */
  _resendHeldRatio(tries = 0) {
    if (this._restoring) { if (tries < 25) setTimeout(() => this._resendHeldRatio(tries + 1), 200); return; }
    const now = Date.now();
    let at = 0;
    for (const [, w] of this.app.wm.windows) {
      const ch = w._tabChain;
      if (ch && ch.tabs[0] === w.id && heldRatio(ch, now) !== null) at = Math.max(at, ch._ratioHeld.at);
      if (w._chainAt > this._carriedAt(w._desktopId) && now - w._chainAt <= ACT_HOLD_MS) at = Math.max(at, w._chainAt); // a group change no save the server read has carried (verify r5 ②)
    }
    if (!at) return; // a later save (or the expiry) already took it
    this._userDirty = true;
    this._lastUserInputAt = Math.max(this._lastUserInputAt || 0, at);
    this.scheduleAutoSave();
  }

  /** Rebuild ONE chain record (remote or persisted) now, or keep it PENDING
   *  while a member it names is still being created (`inFlight` — a replayed
   *  openSpec whose window lands asynchronously), bounded by `waitMs`; past the
   *  deadline whatever members exist are grouped (never a hang). The retry
   *  runs on a 200 ms timer while anything is pending. Never notifies (the
   *  apply's user-dirty gate stays the only way a save leaves this client). */
  _queueChain(key, tc, { inFlight = new Set(), waitMs = 8000 } = {}) {
    const entry = { key, tc, inFlight, deadline: Date.now() + waitMs };
    if (this._reconcileChain(entry)) return;
    (this._pendingChains ||= []).push(entry);
    this._armPendingChains();
  }

  /** true = done (restored, superseded or gave up); false = still waiting. */
  _reconcileChain({ key, tc, inFlight, deadline }) {
    const wm = this.app.wm;
    for (const [, w] of wm.windows) if (w._tabChain && w._tabChain.tabs[0] === w.id && chainSyncKey(w._tabChain) === key) return true; // already here
    const present = tc.tabs.filter((id) => wm.windows.has(id));
    const waiting = tc.tabs.some((id) => !wm.windows.has(id) && inFlight.has(id));
    if (waiting && Date.now() < deadline) return false;
    if (present.length < 2) return true;
    // a member still grouped locally (a chain the record does not name) leaves it first — never two chains claiming one window
    for (const id of present) { const w = wm.windows.get(id); if (w && w._tabChain) wm._detachFromChain(w._tabChain, id); }
    wm.restoreTabChain(present, tc.active, { layout: tc.layout, split: tc.split, order: tc.order });
    return true;
  }

  _armPendingChains() {
    if (this._pendingTimer) return;
    const tick = () => {
      this._pendingTimer = null;
      this._pendingChains = (this._pendingChains || []).filter((e) => !this._reconcileChain(e));
      if (this._pendingChains.length) this._pendingTimer = setTimeout(tick, 200);
    };
    this._pendingTimer = setTimeout(tick, 200);
  }

  // Create a window from remote layout state using its saved openSpec
  _createRemoteWindow(rw) {
    const winId = rw.winId || rw.id;
    const spec = rw.openSpec;
    if (!spec) return; // no spec = can't recreate

    try {
      this.app.replayOpenSpec(spec, winId);
      // an async opener (FileViewer.open) has not created the window yet — a chain naming it waits (_queueChain)
      if (!this.app.wm.windows.has(winId)) { (this._replaying ||= new Set()).add(winId); setTimeout(() => this._replaying?.delete(winId), 10000); }
      // Apply position after creation (may be async)
      setTimeout(() => {
        const winInfo = this.app.wm.windows.get(winId);
        if (!winInfo) return;
        if (rw.gridBounds) { winInfo.gridBounds = rw.gridBounds; this.app.wm._applyGridBounds(winInfo); }
        if (rw.isSnapped) { winInfo._isSnapped = true; winInfo._preSnapBounds = rw.preSnapBounds; }
        if (rw.isMaximized) this.app.wm.toggleMaximize(winInfo.id);
        if (rw.isMinimized) this.app.wm.minimize(winInfo.id);
      }, 500);
    } catch {}
  }

  // Capture current workspace state (complete)
  // Only captures windows belonging to the active desktop (if desktops are enabled)
  captureState() {
    return { windows: this.captureWindows(this.app.desktopManager?.activeDesktopId), ...this.captureChrome() };
  }

  /** The page's captures of the windows it has BUILT on `desktopId` (the active desktop also owns an untagged
   *  window, as captureState always did). What a desktop record is merged with — never the record itself: a desktop
   *  the page has not built holds windows this list cannot know (userW inc-mun7qjmw-iksh, src/lib/desktop-record.js). */
  captureWindows(desktopId) {
    const activeDesk = this.app.desktopManager?.activeDesktopId;
    const windows = [];
    for (const [id, win] of this.app.wm.windows) {
      if (desktopId) {
        if (win._desktopId ? win._desktopId !== desktopId : desktopId !== activeDesk) continue;
      } else if (activeDesk && win._desktopId && win._desktopId !== activeDesk) continue; // Skip windows on other desktops
      const winState = this.captureWin(win, id);
      if (winState) windows.push(winState);
    }
    return windows;
  }

  /** ONE window's capture (null for the stage placeholder). */
  captureWin(win, id = win?.id) {
    { // (a bare block: the body kept at the indentation it had inside captureState's loop)
      if (!win) return null;
      // The stage placeholder is a stage-only pseudo-window — it must never
      // enter a desktop record (a pre-guard drag once retagged one onto a
      // normal desktop and autosave captured it).
      if (win.type === 'stage-placeholder' || win._isStagePlaceholder) return null;
      const el = win.element;
      const termSession = this.app.sessions.get(id);
      // Ensure gridBounds is up to date
      if (!win.gridBounds) this.app.wm._captureGridBounds(win);
      // THE ONE CLIENT CAPTURE keeps no record's words (lane-redact verify r7): every copy this page keeps of its own layout
      // — the autosave it last sent, a named preset, the record of a desktop it switched away from, the stage's — is made
      // here, and a window titled by a record's words (the Job input window names its job) is recorded under its generic
      // title, as the server's choke point keeps it; the live window re-titles itself from the store when it replays
      const winState = {
        winId: id,
        title: wordlessTitleOf(win._openSpec, win.title), type: win.type,
        isMinimized: win.isMinimized, isMaximized: win.isMaximized,
        gridBounds: win.gridBounds,
        zIndex: parseInt(el.style.zIndex) || 0,
      };
      if (win._isSnapped) { winState.isSnapped = true; winState.preSnapBounds = win._preSnapBounds; }
      // openSpec: serializable recipe to recreate this window on another client
      if (win._openSpec) winState.openSpec = win._openSpec;
      // Architectural safeguard: a NON-transient window persisted without an
      // openSpec can't sync or restore cross-client (it silently vanishes on
      // the other clients / after refresh — the exact class of bug that hit
      // desktop/usage/browser). Breadcrumb it once per type so a future window
      // type added without an openSpec surfaces in Diagnostics instead of
      // failing quietly. chat/terminal are exempt: they restore by session
      // identity (backendSessionId) and get their openSpec asynchronously
      // after the 'created' reply. stage-placeholder is exempt by design.
      else if (!isTransientWindowType(win.type)) {
        this._noSpecWarned ||= new Set();
        if (!this._noSpecWarned.has(win.type)) {
          this._noSpecWarned.add(win.type);
          try { track('event', 'window-no-openspec:' + win.type); } catch {}
        }
      }
      // For terminals, save both webui session id and claude session id + overrides
      if (win.type === 'terminal' && termSession) {
        winState.serverSessionId = termSession.sessionId;
        const allSess = this.app.sidebar?._allSessions || [];
        const match = allSess.find(s => s.webuiId === termSession.sessionId);
        if (match) {
          winState.backend = match.backend || 'claude';
          // never the webui id (match.sessionId === match.webuiId before the
          // CLI reports a real id — long window on remote spawns); a bogus
          // backendSessionId makes every other client's rematch miss
          winState.backendSessionId = match.backendSessionId
            || (match.sessionId && match.sessionId !== match.webuiId ? match.sessionId : null);
          winState.claudeSessionId = winState.backend === 'claude' ? winState.backendSessionId : null;
          winState.cwd = match.cwd || '';
        }
        // Save per-terminal overrides
        if (termSession.overrides) winState.terminalOverrides = termSession.overrides;
        // Save editor split-pane state (Ctrl+G)
        if (win._editorState) winState.editorState = win._editorState;
      }
      // For chat windows, save session id and claude session id + cwd
      if (win.type === 'chat' && termSession) {
        winState.serverSessionId = termSession.sessionId;
        const allSess = this.app.sidebar?._allSessions || [];
        const match = allSess.find(s => s.webuiId === termSession.sessionId);
        if (match) {
          winState.backend = match.backend || 'claude';
          winState.backendSessionId = match.backendSessionId
            || (match.sessionId && match.sessionId !== match.webuiId ? match.sessionId : null); // see terminal branch
          winState.claudeSessionId = winState.backend === 'claude' ? winState.backendSessionId : null;
          winState.cwd = match.cwd || '';
        }
      }
      // Identity fallback from openSpec: a window whose server session died
      // (stale serverId, not in _allSessions) would otherwise persist with NO
      // backendSessionId — restoreState then can't rematch it after refresh
      if ((win.type === 'chat' || win.type === 'terminal') && !winState.backendSessionId && win._openSpec?.backendSessionId) {
        winState.backend = win._openSpec.backend || 'claude';
        winState.backendSessionId = win._openSpec.backendSessionId;
        winState.claudeSessionId = winState.backend === 'claude' ? winState.backendSessionId : null;
        if (!winState.cwd) winState.cwd = win._openSpec.cwd || '';
      }
      // For file explorers, save current path (+ which host it browses)
      if (win.type === 'files' && win._explorerPath) {
        winState.explorerPath = win._explorerPath;
        if (win._explorerHost) winState.explorerHost = win._explorerHost;
      }
      // For file viewers and editors, save file path and name
      if ((win.type === 'viewer' || win.type === 'hex-viewer' || win.type === 'editor') && win._filePath) {
        winState.filePath = win._filePath;
        winState.fileName = win._fileName;
      }
      // For browser windows, save URL
      if (win.type === 'browser' && win._browserUrl) {
        winState.browserUrl = win._browserUrl;
      }
      // Tab chain persistence (+ §4.6's layout / split — a missing layout reads
      // as 'tabs', so old records need no migration; a PHONE carries the split
      // it cannot display and never writes its own flattening back)
      if (win._tabChain) {
        const c = win._tabChain;
        winState.tabChain = { tabs: [...c.tabs], active: c.active, layout: c.layout === 'split' ? 'split' : 'tabs', order: [...(c.order || c.tabs)] };
        if (c.layout === 'split' && c.split) winState.tabChain.split = { pair: [...c.split.pair], ratio: c.split.ratio, dir: 'row', left: [...(c.split.left || [])], right: [...(c.split.right || [])] }; // split tabs v2: the strip order + the SIDES (a missing field reads as the pre-v2 default — repaired by rule)
        winState.isTabGuest = c.tabs[0] !== id;
      }
      return winState;
    }
  }

  /** The non-window fields of a capture: the active desktop's grid + the global chrome every record carries. */
  captureChrome() {
    const grid = this.app.wm.grid;
    const theme = this.app.themeManager.current;
    const globalFontSize = this.app._fontSize;
    const globalFontFamily = this.app._fontFamily;
    const sidebarOpen = this.app.sidebar.isOpen;
    const taskbarHeight = document.getElementById('taskbar')?.offsetHeight || null;
    const tbScaleRaw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-scale'));
    const toolbarScale = (tbScaleRaw && Math.abs(tbScaleRaw - 1) > 0.02) ? tbScaleRaw : null;
    // Companion LEGACY field: pre-2.254.0 bundles read only toolbarHeight —
    // emitting the equivalent px keeps a mixed-version fleet stable (the old
    // client applies+re-echoes 48, which migrates back to 1.2 — round-trip;
    // without it old clients re-echo their fixed 40 forever)
    const toolbarHeight = Math.round(40 * (toolbarScale || 1));
    return { grid, theme, globalFontSize, globalFontFamily, sidebarOpen, taskbarHeight, toolbarScale, toolbarHeight };
  }

  // Restore workspace from state (used for autosave restore on startup)
  async restoreState(state) {
    if (!state || !state.windows) return;

    // Resume-all offer (2.250.0): collect the stopped sessions restored as
    // read-only windows so we can offer ONE bulk-resume popup after boot
    // instead of making a user with dozens of sessions click Resume N times.
    // Only meaningful during the initial boot restore — `_bootStoppedSessions`
    // is armed by loadAutoSave and null afterwards, so desktop-switch replays
    // don't collect.
    const collectStopped = (sessionId, cwd, name, opts) => {
      if (!this._bootStoppedSessions) return;
      const key = (opts?.backend || 'claude') + ':' + (opts?.backendSessionId || sessionId) + ':' + (opts?.hostId || '');
      if (this._bootStoppedSessions.some((d) => d.key === key)) return;
      this._bootStoppedSessions.push({ key, sessionId, cwd, name, opts });
    };

    // Restore theme
    if (state.theme) {
      this.app.themeManager.apply(state.theme);
    }

    // Restore grid
    if (state.grid) {
      this.app.wm.setGrid(state.grid.rows, state.grid.cols);
    }

    // Restore taskbar height
    if (state.taskbarHeight) {
      this._applyTaskbarHeight(state.taskbarHeight);
    }
    this._applyToolbarState(state); // incl. explicit-null reset — a stale localStorage must not resurrect an erased scale at boot

    // Restore sidebar
    if (state.sidebarOpen !== undefined) {
      this.app.sidebar.toggle(state.sidebarOpen);
    }

    // Wait for active sessions list from server
    let activeSessions = [];
    let allSessions = [];
    try {
      const res = await fetch('/api/active');
      const data = await res.json();
      activeSessions = data.sessions || [];
    } catch {}
    // Also fetch all sessions (including stopped) for view-only fallback
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      allSessions = data.sessions || data || [];
    } catch {}

    // Restore windows — use gridBounds if available, otherwise absolute position
    const applyPosition = (winInfo, winState) => {
      if (!winInfo) return;
      // Remap window ID to saved ID for cross-client sync
      if (winState.winId && winInfo.id !== winState.winId) {
        const wm = this.app.wm;
        const oldId = winInfo.id;
        wm.windows.delete(oldId);
        const session = this.app.sessions.get(oldId);
        if (session) { this.app.sessions.delete(oldId); this.app.sessions.set(winState.winId, session); }
        winInfo.id = winState.winId;
        wm.windows.set(winState.winId, winInfo);
        if (wm.activeWindowId === oldId) wm.activeWindowId = winState.winId; // the focus follows the re-key (it named a window that no longer existed — v2 verify r1 ⑦)
      }
      if (winState.gridBounds) {
        winInfo.gridBounds = winState.gridBounds;
        this.app.wm._applyGridBounds(winInfo);
      }
      if (winState.zIndex) { winInfo.element.style.zIndex = winState.zIndex; if (winState.zIndex >= this.app.wm.zIndex) this.app.wm.zIndex = winState.zIndex + 1; }
      if (winState.isSnapped) { winInfo._isSnapped = true; winInfo._preSnapBounds = winState.preSnapBounds; }
      if (winState.isMinimized) this.app.wm.minimize(winInfo.id);
      setTimeout(() => { if (winInfo.onResize) winInfo.onResize(); }, 200);
      // Force terminal redraw after attach completes (triggers SIGWINCH via size toggle)
      setTimeout(() => {
        const term = this.app.sessions.get(winInfo.id);
        if (term?.forceRedraw) term.forceRedraw();
      }, 2000);
    };

    this.app.wm._restoring = true; // batch mode: suppress per-window O(all-windows) bookkeeping (see window.js _notify)
    try {
    for (const ws of state.windows) {
      if (ws.type === 'terminal') {
        const backend = ws.backend || ws.openSpec?.backend || 'claude';
        const backendSessionId = ws.backendSessionId || ws.claudeSessionId || ws.openSpec?.backendSessionId;
        let alive = null;
        if (backendSessionId) {
          alive = activeSessions.find(s => (s.backend || 'claude') === backend && (s.backendSessionId || s.claudeSessionId) === backendSessionId);
        }
        if (!alive && ws.serverSessionId) {
          alive = activeSessions.find(s => s.id === ws.serverSessionId);
        }
        if (alive) {
          const customName = this.app.sidebar?.getCustomName(backendSessionId || alive.backendSessionId || alive.claudeSessionId);
          const winInfo = this.app.attachSession(alive.id, customName || alive.name, alive.cwd, { backend: alive.backend || backend, mode: alive.mode || 'terminal', machine: true });
          applyPosition(winInfo, ws);
          // Restore split-pane editor if it was active (Ctrl+G)
          if (ws.editorState && winInfo) {
            setTimeout(() => {
              this.app.wm.focusWindow(winInfo.id);
              this.app._openExternalEditor(ws.editorState.filePath, ws.editorState.signalPath);
            }, 500);
          }
        } else if (backendSessionId) {
          // Terminal session not alive — open as view-only chat history
          const cwd = ws.cwd || '';
          const customName = this.app.sidebar?.getCustomName(backendSessionId);
          const stoppedMatch = allSessions.find(s =>
            (s.backendSessionId || s.sessionId) === backendSessionId && (s.backend || 'claude') === backend
          );
          if (stoppedMatch) {
            const rOpts = { backend, backendSessionId, hostId: ws.openSpec?.hostId || undefined };
            const viewWin = this.app.viewSession(stoppedMatch.sessionId, stoppedMatch.cwd, customName || stoppedMatch.name || ws.title || 'Session', rOpts);
            if (viewWin) applyPosition(viewWin, ws);
            collectStopped(stoppedMatch.sessionId, stoppedMatch.cwd, customName || stoppedMatch.name || ws.title || 'Session', rOpts);
          } else if (ws.openSpec?.hostId) {
            // REMOTE session: /api/sessions is LOCAL discovery only, so a
            // remote session can never stoppedMatch — restore it view-only
            // from the openSpec identity (viewSession is host-capable and
            // prefetches the transcript); dropping it silently lost the
            // window on every restore (audit 2.192.0)
            const rOpts = { backend, backendSessionId, hostId: ws.openSpec.hostId };
            const viewWin = this.app.viewSession(backendSessionId, cwd, customName || ws.title || 'Session', rOpts);
            if (viewWin) applyPosition(viewWin, ws);
            collectStopped(backendSessionId, cwd, customName || ws.title || 'Session', rOpts);
          }
        }
      } else if (ws.type === 'chat') {
        const backend = ws.backend || ws.openSpec?.backend || 'claude';
        const bsid0 = ws.backendSessionId || ws.claudeSessionId || ws.openSpec?.backendSessionId; // see terminal branch
        const backendSessionId = bsid0 && bsid0 !== ws.serverSessionId ? bsid0 : null;
        let alive = null;
        if (backendSessionId) {
          alive = activeSessions.find(s => (s.backend || 'claude') === backend && (s.backendSessionId || s.claudeSessionId) === backendSessionId);
        }
        if (!alive && ws.serverSessionId) {
          alive = activeSessions.find(s => s.id === ws.serverSessionId);
        }
        if (alive) {
          const customName = this.app.sidebar?.getCustomName(backendSessionId || alive.backendSessionId || alive.claudeSessionId);
          const winInfo = this.app.attachSession(alive.id, customName || alive.name, alive.cwd, { mode: 'chat', backend: alive.backend || backend, machine: true });
          applyPosition(winInfo, ws);
        } else if (backendSessionId) {
          // Session not alive (server/machine restarted) — open as view-only
          // so user sees history and can click Resume
          const cwd = ws.cwd || '';
          const customName = this.app.sidebar?.getCustomName(backendSessionId);
          const stoppedMatch = allSessions.find(s =>
            (s.backendSessionId || s.sessionId) === backendSessionId && (s.backend || 'claude') === backend
          );
          if (stoppedMatch) {
            const rOpts = { backend, backendSessionId, hostId: ws.openSpec?.hostId || undefined };
            const viewWin = this.app.viewSession(stoppedMatch.sessionId, stoppedMatch.cwd, customName || stoppedMatch.name || ws.title || 'Session', rOpts);
            if (viewWin) applyPosition(viewWin, ws);
            collectStopped(stoppedMatch.sessionId, stoppedMatch.cwd, customName || stoppedMatch.name || ws.title || 'Session', rOpts);
          } else if (ws.openSpec?.hostId) {
            // REMOTE session: /api/sessions is LOCAL discovery only, so a
            // remote session can never stoppedMatch — restore it view-only
            // from the openSpec identity (viewSession is host-capable and
            // prefetches the transcript); dropping it silently lost the
            // window on every restore (audit 2.192.0)
            const rOpts = { backend, backendSessionId, hostId: ws.openSpec.hostId };
            const viewWin = this.app.viewSession(backendSessionId, cwd, customName || ws.title || 'Session', rOpts);
            if (viewWin) applyPosition(viewWin, ws);
            collectStopped(backendSessionId, cwd, customName || ws.title || 'Session', rOpts);
          }
        }
      } else if (ws.type === 'files') {
        const winInfo = this.app.openFileExplorer(ws.explorerPath, { host: ws.explorerHost });
        applyPosition(winInfo, ws);
      } else if (ws.type === 'editor' && ws.filePath) {
        const edWin = this.app.openEditor(ws.filePath, ws.fileName || ws.filePath.split('/').pop(), { host: ws.openSpec?.host });
        if (edWin) applyPosition(edWin, ws);
      } else if ((ws.type === 'viewer' || ws.type === 'hex-viewer') && ws.filePath) {
        // openFile is async (FileViewer.open), so we need to wait for the window to appear
        const beforeIds = new Set(this.app.wm.windows.keys());
        const opts = { hex: ws.type === 'hex-viewer', host: ws.openSpec?.host };
        this.app.openFile(ws.filePath, ws.fileName || ws.filePath.split('/').pop(), opts);
        // Poll briefly for the new window to appear (FileViewer.open is async)
        const applyPos = ws;
        let checkAttempts = 0;
        const checkWin = () => {
          for (const [id, win] of this.app.wm.windows) {
            if (!beforeIds.has(id) && (win.type === 'viewer' || win.type === 'hex-viewer')) {
              applyPosition(win, applyPos);
              return;
            }
          }
          // Cap: if FileViewer.open failed (file deleted since save), the
          // timer chain would otherwise poll forever
          if (++checkAttempts < 50) setTimeout(checkWin, 100);
        };
        setTimeout(checkWin, 100);
      } else if (ws.type === 'browser' && ws.browserUrl) {
        const winInfo = this.app.openBrowser(ws.browserUrl, { proxy: ws.openSpec?.proxy });
        applyPosition(winInfo, ws);
      } else if (ws.openSpec?.action) {
        // Generic fallback: any window that records an openSpec (settings,
        // desktop, usage, task detail/log, session props, workflow…) restores
        // by replaying it. The typed branches above only cover the legacy
        // window kinds — newer types silently VANISHED on refresh (real
        // report: "设置/桌面窗口没能持久化").
        const before = new Set(this.app.wm.windows.keys());
        try { this.app.replayOpenSpec(ws.openSpec, ws.winId || undefined); } catch {}
        for (const [id, win] of this.app.wm.windows) {
          if (!before.has(id)) { applyPosition(win, ws); break; }
        }
      }
    }
    } finally {
      this.app.wm._restoring = false;
      this.app.wm._notify(); // the ONE bookkeeping pass for the whole batch
      this.app.wm._scheduleOverlapUpdate?.();
    }


    // Restore tab chains after all windows are created
    // Collect unique chains from saved state, deduplicate by tab list
    const restoredChains = new Set();
    setTimeout(() => {
      for (const ws of state.windows) {
        if (!ws.tabChain || ws.isTabGuest) continue; // only process from host's perspective
        const key = chainSyncKey(ws.tabChain);
        if (restoredChains.has(key)) continue;
        restoredChains.add(key);
        // a member still opening (an async openFile replay) is waited for — the
        // ONE chain reconcile the remote apply uses (split tabs v2)
        const inFlight = new Set(state.windows.filter((x) => x.openSpec && !this.app.wm.windows.has(x.winId || x.id)).map((x) => x.winId || x.id));
        this._queueChain(key, ws.tabChain, { inFlight, waitMs: 5000 });
      }
    }, 1000);
  }

  // Auto-save (debounced, triggered on every window change)
  // Won't fire until initial restore is complete
  scheduleAutoSave() {
    this._clockTick(); // a save after a sleep: its act's time is re-armed before guard 2 reads it (verify r5 ①)
    // Dynamic desktop: while staged, the ONLY thing to persist is the stage's
    // own grid config (through the stage store — desktop autosave stays
    // suppressed). Intercept BEFORE the restore gates: they exist to protect
    // desktop records, and letting them drop this call silently lost the grid
    // (smoke-caught: _restoring was still true when the user set a grid).
    if (this.app.stage?.isActive) { this.app.stage.onStageLayoutChanged(); return; }
    // Under a gate (the apply's 1 s cooldown, the boot's 5 s, a switch's 1 s) a save the USER caused is DEFERRED past it,
    // never dropped (verify r3 ③); the apply's own churn (inside `_applying`, or with no input since the apply cleared
    // the dirty bit) still schedules nothing — guard 1 (anti-echo) holds
    if (this._restoring || this.app.desktopManager?._restoring) { this._deferSave(); return; }
    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => this._doAutoSave(), 500);
  }

  /** A user-caused save under a gate waits for the gate (verify r3 ③): re-asked once it is expected open. An apply
   *  meanwhile clears the dirty bit — the deferred act is still this user's and unsaved (unless a save left since,
   *  `_savedAt`): the bit is re-armed at the act's REAL time (§6b guard 2's expiry keeps its meaning), the held
   *  move's / close's / ratio's rule. */
  _deferSave() {
    if (!this._userDirty || this._applying || this._deferT) return;
    const at = this._lastUserInputAt || Date.now();
    this._deferT = setTimeout(() => {
      this._deferT = null;
      if (!this._userDirty && !(this._savedAt > at)) { this._userDirty = true; this._lastUserInputAt = Math.max(this._lastUserInputAt || 0, at); }
      this.scheduleAutoSave();
    }, 1100);
  }

  _isMobile() {
    return window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth < 1024);
  }

  async _doAutoSave() {
    this._clockTick(); // the timer that was pending at the lid-close fires at the wake: the act it carries is re-armed first (verify r5 ①)
    // Dynamic desktop: while the STAGE view is active the desktop-layout
    // autosave/broadcast is suppressed — the stage persists through its own
    // SyncStore, and capturing here would write stage-visible windows into a
    // normal desktop's record (cross-client chaos). Stage-level layout state
    // (its grid config) persists through the stage's own store instead.
    if (this.app.stage?.isActive) { this.app.stage.onStageLayoutChanged(); return; }
    if (this._restoring || this.app.desktopManager?._restoring) { this._deferSave(); return; } // a gate raised since the schedule: deferred, never dropped (verify r3 ③)
    // Anti-echo: only broadcast state the USER caused. After applying a remote
    // state, our own follow-up timers (captureGridBounds, onResize chains)
    // schedule autosaves with a state that differs only by rounding — sending
    // those bounced every operation between clients several times.
    if (!this._userDirty) return;
    // A SAVE WHILE THE POINTER IS DOWN IS A SNAPSHOT OF AN UNFINISHED ACT (stage-blank verify r5): a tab torn off and held
    // for longer than the debounce went out standing on its old HOST's box (the detach copies the host's box onto the
    // torn window; the drop's own capture comes 250 ms after the release) — every other page showed it on its old host
    // for a moment, and a page that saved in that moment handed the box back as an agreeing record (measured). Wait for
    // the release, then once more for the drop's own capture; the dirty bit and its time stay the act's (§6b guard 2).
    if (this._pointerDown) { this._saveWaitsForDrop = true; this._autoSaveTimer = setTimeout(() => this._doAutoSave(), 300); return; }
    if (this._saveWaitsForDrop || (this._dropAt && Date.now() - this._dropAt < 400)) { this._saveWaitsForDrop = false; this._autoSaveTimer = setTimeout(() => this._doAutoSave(), 400); return; } // …and a drop released BEFORE the debounce fired, whose capture is still 250 ms away (noteDrop)
    // Dirty EXPIRES: a client whose last real input was minutes ago must not
    // broadcast — an idle tab (phone left open, a stray automation client)
    // with a stuck dirty bit would echo STALE positions after every remote
    // apply, reverting other clients' fresh drags and replaying old layouts
    // (real incident: leftover test tabs fought the user's two clients).
    if (!this._lastUserInputAt || Date.now() - this._lastUserInputAt > 60000) { this._userDirty = false; return; }
    // THE STALE BASE (verify r3 ④): the reconnect's re-read failed for good — this page's records are older than the
    // server's; nothing is saved from them (the dirty desks stay dirty). The read is asked again; a success releases it.
    if (this._resyncStale) { if (!this._resyncing) this._resyncFromServer(); return; }
    const dm = this.app.desktopManager;
    // The desktops this page CHANGED but does not show (a move's target and source) go first: their HELD record —
    // the server's record plus this page's change — never a list derived from the page, which for a desktop not
    // opened since the page loaded holds none of its windows (userW inc-mun7qjmw-iksh: HR 3 → 1)
    // every record of this save carries `sentAt`; the server's ack of each names it back, and only then are the acts it
    // carries released (verify r5 ⑤: a save that left on a socket the server never read used to count as sent — the
    // reconnect's re-read reversed the act and nothing re-sent it). A refused record releases nothing.
    const sentAt = Date.now(), sentDesks = [];
    for (const d of dm?.takeDirty?.() || []) {
      const st = dm.recordFor(d);
      this.app.ws.send({ type: 'layout-sync', state: st, desktopId: d, evidence: dm.evidence(), sentAt });
      sentDesks.push(d);
      dm.noteSent(d, st);
    }
    this._savedAt = Date.now(); // a deferred save's witness (verify r3 ③): an act older than this left with this save
    const desktopId = dm?.activeDesktopId;
    // THE RECORD, never the bare DOM capture (userW inc-mun7qjmw-iksh): the desktop's held record merged with the
    // windows the page built there — a window still being built stays; only one the page could not build leaves
    const state = dm?.recordFor && desktopId ? dm.recordFor(desktopId) : this.captureState();
    // No-op guard: focus clicks and timers frequently schedule saves with an
    // unchanged state — skip the send (and the server disk write + rebroadcast
    // + every other client's full diff pass) when nothing actually changed.
    const json = JSON.stringify({ state, desktopId });
    // identical to the last record sent AND that send was READ (nothing owed for this desktop): a no-op — the state is carried
    // as of now (an act that changed nothing — a drag back to its place — is not held for a minute). While the last send is
    // still owed it is NOT a no-op: the held act's re-send after a reconnect IS that very text, and the server never read it
    // (verify r5 ⑤ on the real page: the drag on the desktop on show was kept but never reached the server)
    if (json === this._lastSentJson && !this._unacked.some((s) => s.desks.includes(desktopId || ''))) {
      this._markCarried(desktopId || '', sentAt);
      this.noteLayoutSent(sentDesks, sentAt);
      return;
    }
    this._lastSentJson = json;
    // Full state to server for disk persistence (+ the evidence the server's shrink belt reads)
    this.app.ws.send({ type: 'layout-sync', state, desktopId, evidence: dm?.evidence?.() || [], sentAt });
    sentDesks.push(desktopId || '');
    this.noteLayoutSent(sentDesks, sentAt);
    if (desktopId) { if (dm?.noteSent) dm.noteSent(desktopId, state); else dm?.noteWire?.(desktopId, state); }
  }

  /** The ids of the closes this page holds (made here, not carried by a save yet) — a record read off the wire
   *  never brings them back (inc-mukeyzpt-lpou; the desktop manager's held records drop them too). */
  heldCloseIds() {
    return [...(this._heldCloses || new Map()).keys()].filter((id) => this._closeHeld(id));
  }

  /** A record the server REFUSED was reconciled (desktop-manager onSyncRefused): send the corrected one through the
   *  ordinary autosave — the dirty bit re-armed, never the input time (§6b guard 2's 60 s expiry keeps its meaning:
   *  an idle page sends nothing). */
  rearmSave() {
    if (!this._lastUserInputAt || Date.now() - this._lastUserInputAt > 60000) return;
    this._userDirty = true;
    this._lastSentJson = null;
    this.scheduleAutoSave();
  }

  // Load auto-saved state on startup
  async loadAutoSave() {
    this._restoring = true;
    this._booting = true;
    this._bootStoppedSessions = []; // arm the resume-all collector (see restoreState)
    try {
      const res = await fetch('/api/layouts');
      const data = await res.json();
      this._savedPresets = data.saved || {};
      this._currentName = data.current || null;

      // Bar-scale boot heal BEFORE the delegate: restoreState only runs when
      // the active desktop has windows, so an explicit-null reset in the
      // persisted state must be honored HERE too — else a stale localStorage
      // (applied by _setupToolbarResize moments ago) resurrects an erased
      // scale and the first autosave re-broadcasts it fleet-wide.
      const bootState = this._isMobile() ? (data.autoSaveMobile || data.autoSave)
        : (data.desktopMeta?.length ? data.desktops?.[data.desktopMeta[0].id]?.autoSave : data.autoSave);
      this._applyToolbarState(bootState || data.autoSave);
      // Desktop-aware restore: delegate to DesktopManager
      if (this.app.desktopManager) {
        await this.app.desktopManager.loadFromServer(data);
        // Fold NON-ACTIVE desktops' lazy saved states into the resume-all
        // collector. THE 2.331.0 WIRING: that commit shipped the pure
        // scanStoppedInDesktopStates + its unit test but this call site was
        // never staged — the fix sat dead for 24 releases and the same
        // report came back (userW, inc-msy27q2e). The scan mirrors
        // restoreState's aliveness logic; restoreState covers the active
        // desktop, this covers everything else.
        try {
          if (this._bootStoppedSessions) {
            const [act, all] = await Promise.all([
              fetch('/api/active').then((r) => r.json()).catch(() => ({})),
              fetch('/api/sessions').then((r) => r.json()).catch(() => ({})),
            ]);
            const activeId = this.app.desktopManager.activeDesktopId;
            const found = scanStoppedInDesktopStates(data, activeId, act.sessions || [],
              all.sessions || all || [], (bsid) => this.app.sidebar?.getCustomName?.(bsid));
            for (const d of found) {
              const key = (d.opts?.backend || 'claude') + ':' + (d.opts?.backendSessionId || d.sessionId) + ':' + (d.opts?.hostId || '');
              if (!this._bootStoppedSessions.some((x) => x.key === key)) this._bootStoppedSessions.push({ key, ...d });
            }
          }
        } catch { }
      } else {
        // Fallback: original single-desktop restore
        const toRestore = this._isMobile() ? (data.autoSaveMobile || data.autoSave) : data.autoSave;
        if (toRestore && toRestore.windows && toRestore.windows.length > 0) {
          await this.restoreState(toRestore);
        }
      }
    } catch {}
    // Offer a bulk resume for the sessions that came back stopped, then disarm
    // the collector so later desktop-switch replays don't re-prompt.
    const stopped = this._bootStoppedSessions || [];
    this._bootStoppedSessions = null;
    if (stopped.length >= 2) setTimeout(() => this._offerResumeAll(stopped), 1200);
    // Allow autosave after restore is complete (with extra delay for windows to attach)
    setTimeout(() => { this._restoring = false; this._booting = false; }, 5000);
  }

  // Bulk-resume the sessions that restored stopped (2.250.0). resumeSession
  // already replaces the matching read-only window, so we just fire them
  // staggered to avoid a create storm on a fleet server.
  async _offerResumeAll(stopped) {
    const { showConfirmDialog } = await import('./utils.js');
    const ok = await showConfirmDialog({
      title: 'Resume interrupted sessions?',
      message: `<b>${stopped.length}</b> sessions were interrupted (the server or a machine restarted) and reopened as read-only history. Resume all of them now?`,
      confirmText: `Resume all ${stopped.length}`,
    }).catch(() => false);
    if (!ok) return;
    for (let i = 0; i < stopped.length; i++) {
      const d = stopped[i];
      try { this.app.resumeSession(d.sessionId, d.cwd, d.name, d.opts); } catch {}
      if (i < stopped.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Save a named preset
  async savePreset(name) {
    const state = this.captureState();
    try {
      await fetch(`/api/layouts/${encodeURIComponent(name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      await fetch('/api/layouts-active', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      this._savedPresets[name] = state;
      this._currentName = name;
    } catch {}
  }

  // Load a named preset — rearranges workspace without killing sessions
  async loadPreset(name) {
    const preset = this._savedPresets[name];
    if (!preset) return;

    // Get current active sessions (dtach-managed)
    let activeSessions = [];
    try {
      const res = await fetch('/api/active');
      const data = await res.json();
      activeSessions = data.sessions || [];
    } catch {}

    // Get all sessions (including stopped for resume)
    let allSessions = [];
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      allSessions = data.sessions || [];
    } catch {}

    // Track which current window IDs are matched to a preset window
    const matchedWinIds = new Set();

    // Helper: apply position to a window from preset state
    const applyPosition = (winInfo, winState) => {
      if (!winInfo) return;
      if (winState.gridBounds) {
        winInfo.gridBounds = winState.gridBounds;
        this.app.wm._applyGridBounds(winInfo);
      }
      if (winState.zIndex) {
        winInfo.element.style.zIndex = winState.zIndex;
        if (winState.zIndex >= this.app.wm.zIndex) this.app.wm.zIndex = winState.zIndex + 1;
      }
      this.app.wm.witnessGeometry?.(winInfo.id); // a named preset is the user's act on every window it places (verify r5 ③) — the ONE witness stamp in this file
      // Restore from minimized if preset says it should be visible
      if (!winState.isMinimized && winInfo.isMinimized) {
        this.app.wm.restore(winInfo.id);
      } else if (winState.isMinimized && !winInfo.isMinimized) {
        this.app.wm.minimize(winInfo.id);
      }
      setTimeout(() => { if (winInfo.onResize) winInfo.onResize(); }, 200);
      setTimeout(() => {
        const term = this.app.sessions.get(winInfo.id);
        if (term?.forceRedraw) term.forceRedraw();
      }, 2000);
    };

    // Restore global settings
    if (preset.theme) {
      this.app.themeManager.apply(preset.theme);
      for (const [, term] of this.app.sessions) { if (term.updateTheme) term.updateTheme(this.app.themeManager.getTerminalTheme()); }
    }
    if (preset.globalFontSize && preset.globalFontSize !== this.app._fontSize) {
      this.app._fontSize = preset.globalFontSize;
      localStorage.setItem('termFontSize', this.app._fontSize);
      for (const [, term] of this.app.sessions) {
        if (!term.overrides || !term.terminal) continue;
        if (!term.overrides.fontSize) {
          term.terminal.options.fontSize = this.app._fontSize;
          try { term.terminal.clearTextureAtlas(); } catch {}
          term.fit();
        }
      }
    }
    if (preset.globalFontFamily && preset.globalFontFamily !== this.app._fontFamily) {
      this.app._fontFamily = preset.globalFontFamily;
      localStorage.setItem('termFontFamily', this.app._fontFamily);
      for (const [, term] of this.app.sessions) {
        if (!term.overrides || !term.terminal) continue;
        if (!term.overrides.fontFamily) {
          term.terminal.options.fontFamily = this.app._fontFamily;
          try { term.terminal.clearTextureAtlas(); } catch {}
          term.fit();
        }
      }
    }

    // Restore grid
    if (preset.grid) {
      this.app.wm.setGrid(preset.grid.rows, preset.grid.cols);
    } else {
      this.app.wm.setGrid(null);
    }

    // Restore sidebar
    if (preset.sidebarOpen !== undefined) {
      this.app.sidebar.toggle(preset.sidebarOpen);
    }

    // Build maps of currently open terminal windows by backend session ID and server session ID
    const openTermByBackendSessionId = new Map(); // backend:sessionId -> { winId, win, term }
    const openTermByServerId = new Map(); // serverSessionId -> { winId, win, term }
    for (const [winId, win] of this.app.wm.windows) {
      if (win.type === 'terminal') {
        const term = this.app.sessions.get(winId);
        if (term) {
          const sidebarSess = (this.app.sidebar._allSessions || []).find(s => s.webuiId === term.sessionId);
          if (sidebarSess) {
            const backend = sidebarSess.backend || 'claude';
            const backendSessionId = sidebarSess.backendSessionId || sidebarSess.sessionId;
            openTermByBackendSessionId.set(`${backend}:${backendSessionId}`, { winId, win, term });
          }
          openTermByServerId.set(term.sessionId, { winId, win, term });
        }
      }
    }

    // Build a map of currently open non-terminal windows for matching
    const openNonTermWindows = new Map(); // type:key -> { winId, win }
    for (const [winId, win] of this.app.wm.windows) {
      if (win.type === 'files' && win._explorerPath) {
        openNonTermWindows.set(`files:${win._explorerHost || ''}:${win._explorerPath}`, { winId, win });
      } else if (win.type === 'browser' && win._browserUrl) {
        openNonTermWindows.set(`browser:${win._browserUrl}`, { winId, win });
      } else if ((win.type === 'editor' || win.type === 'viewer' || win.type === 'hex-viewer') && win._filePath) {
        openNonTermWindows.set(`${win.type}:${win._filePath}`, { winId, win });
      }
    }

    // Track which backend session IDs have already been processed (prevent duplicates)
    const processedBackendSessionIds = new Set();

    // Process each preset window
    for (const ws of preset.windows) {
      if (ws.type === 'terminal') {
        const backend = ws.backend || ws.openSpec?.backend || 'claude';
        const backendSessionId = ws.backendSessionId || ws.claudeSessionId || ws.openSpec?.backendSessionId;
        // Skip if we already processed this session (prevents duplicate resume)
        if (backendSessionId && processedBackendSessionIds.has(`${backend}:${backendSessionId}`)) continue;
        if (backendSessionId) processedBackendSessionIds.add(`${backend}:${backendSessionId}`);

        // Try to find an already-open window matching this terminal
        let existing = null;
        if (backendSessionId) {
          existing = openTermByBackendSessionId.get(`${backend}:${backendSessionId}`);
        }
        if (!existing && ws.serverSessionId) {
          existing = openTermByServerId.get(ws.serverSessionId);
        }

        if (existing) {
          // Already open — just reposition
          matchedWinIds.add(existing.winId);
          applyPosition(existing.win, ws);
          this.app.wm.focusWindow(existing.winId);
        } else {
          // Not open — check if session exists as active (attach) or stopped (resume)
          let activeMatch = null;
          if (backendSessionId) {
            activeMatch = activeSessions.find(s => (s.backend || 'claude') === backend && (s.backendSessionId || s.claudeSessionId) === backendSessionId);
          }
          if (!activeMatch && ws.serverSessionId) {
            activeMatch = activeSessions.find(s => s.id === ws.serverSessionId);
          }

          if (activeMatch) {
            // Active but no window — attach (use custom name if available)
            const customName = this.app.sidebar?.getCustomName(backendSessionId);
            const winInfo = this.app.attachSession(activeMatch.id, customName || activeMatch.name, activeMatch.cwd, { backend: activeMatch.backend || backend, mode: activeMatch.mode || ws.type, machine: true });
            if (winInfo) {
              matchedWinIds.add(winInfo.id);
              applyPosition(winInfo, ws);
              // Restore split-pane editor if saved
              if (ws.editorState && winInfo) {
                setTimeout(() => {
                  this.app.wm.focusWindow(winInfo.id);
                  this.app._openExternalEditor(ws.editorState.filePath, ws.editorState.signalPath);
                }, 500);
              }
            }
          } else if (backendSessionId) {
            // Check stopped sessions for resume
            const stoppedMatch = allSessions.find(s => (s.backend || 'claude') === backend && (s.backendSessionId || s.sessionId) === backendSessionId && s.status === 'stopped');
            if (stoppedMatch) {
              const customName = this.app.sidebar?.getCustomName(backendSessionId);
              this.app.resumeSession(stoppedMatch.sessionId, stoppedMatch.cwd, customName || stoppedMatch.name, {
                backend,
                backendSessionId,
                hostId: ws.openSpec?.hostId || undefined, // remote sessions resume ON their host
              });
              // resumeSession creates window asynchronously; find it after a delay
              const capturedWs = ws;
              setTimeout(() => {
                // Find the new window for this session
                for (const [winId, win] of this.app.wm.windows) {
                  if (!matchedWinIds.has(winId) && win.type === 'terminal') {
                    const term = this.app.sessions.get(winId);
                    if (term) {
                      matchedWinIds.add(winId);
                      applyPosition(win, capturedWs);
                      break;
                    }
                  }
                }
              }, 1500);
            }
            // If session doesn't exist at all — skip
          }
        }
      } else if (ws.type === 'chat') {
        const backend = ws.backend || ws.openSpec?.backend || 'claude';
        const backendSessionId = ws.backendSessionId || ws.claudeSessionId || ws.openSpec?.backendSessionId;
        if (backendSessionId && processedBackendSessionIds.has(`${backend}:${backendSessionId}`)) continue;
        if (backendSessionId) processedBackendSessionIds.add(`${backend}:${backendSessionId}`);

        let existing = null;
        if (backendSessionId) existing = openTermByBackendSessionId.get(`${backend}:${backendSessionId}`);
        if (!existing && ws.serverSessionId) existing = openTermByServerId.get(ws.serverSessionId);

        if (existing) {
          matchedWinIds.add(existing.winId);
          applyPosition(existing.win, ws);
          this.app.wm.focusWindow(existing.winId);
        } else {
          let activeMatch = null;
          if (backendSessionId) activeMatch = activeSessions.find(s => (s.backend || 'claude') === backend && (s.backendSessionId || s.claudeSessionId) === backendSessionId);
          if (!activeMatch && ws.serverSessionId) activeMatch = activeSessions.find(s => s.id === ws.serverSessionId);
          if (activeMatch) {
            const customName = this.app.sidebar?.getCustomName(backendSessionId);
            const winInfo = this.app.attachSession(activeMatch.id, customName || activeMatch.name, activeMatch.cwd, { mode: 'chat', backend: activeMatch.backend || backend, machine: true });
            if (winInfo) { matchedWinIds.add(winInfo.id); applyPosition(winInfo, ws); }
          }
        }
      } else if (ws.type === 'files') {
        const key = `files:${ws.explorerHost || ''}:${ws.explorerPath || ''}`;
        const existing = ws.explorerPath ? openNonTermWindows.get(key) : null;
        if (existing) {
          matchedWinIds.add(existing.winId);
          applyPosition(existing.win, ws);
        } else {
          const winInfo = this.app.openFileExplorer(ws.explorerPath, { host: ws.explorerHost });
          if (winInfo) {
            matchedWinIds.add(winInfo.id);
            applyPosition(winInfo, ws);
          }
        }
      } else if (ws.type === 'editor' && ws.filePath) {
        const key = `editor:${ws.filePath}`;
        const existing = openNonTermWindows.get(key);
        if (existing) {
          matchedWinIds.add(existing.winId);
          applyPosition(existing.win, ws);
        } else {
          const edWin = this.app.openEditor(ws.filePath, ws.fileName || ws.filePath.split('/').pop(), { host: ws.openSpec?.host });
          if (edWin) {
            matchedWinIds.add(edWin.id);
            applyPosition(edWin, ws);
          }
        }
      } else if ((ws.type === 'viewer' || ws.type === 'hex-viewer') && ws.filePath) {
        const key = `${ws.type}:${ws.filePath}`;
        const existing = openNonTermWindows.get(key);
        if (existing) {
          matchedWinIds.add(existing.winId);
          applyPosition(existing.win, ws);
        } else {
          const beforeIds = new Set(this.app.wm.windows.keys());
          const opts = { hex: ws.type === 'hex-viewer', host: ws.openSpec?.host };
          this.app.openFile(ws.filePath, ws.fileName || ws.filePath.split('/').pop(), opts);
          const applyPos = ws;
          let checkAttempts = 0;
          const checkWin = () => {
            for (const [id, win] of this.app.wm.windows) {
              if (!beforeIds.has(id) && (win.type === 'viewer' || win.type === 'hex-viewer')) {
                matchedWinIds.add(id);
                applyPosition(win, applyPos);
                return;
              }
            }
            if (++checkAttempts < 50) setTimeout(checkWin, 100); // cap: file may no longer open
          };
          setTimeout(checkWin, 100);
        }
      } else if (ws.type === 'browser' && ws.browserUrl) {
        const key = `browser:${ws.browserUrl}`;
        const existing = openNonTermWindows.get(key);
        if (existing) {
          matchedWinIds.add(existing.winId);
          applyPosition(existing.win, ws);
        } else {
          const winInfo = this.app.openBrowser(ws.browserUrl, { proxy: ws.openSpec?.proxy });
          if (winInfo) {
            matchedWinIds.add(winInfo.id);
            applyPosition(winInfo, ws);
          }
        }
      }
    }

    // Minimize windows not in the preset
    for (const [id, win] of this.app.wm.windows) {
      if (!matchedWinIds.has(id) && !win.isMinimized) {
        this.app.wm.witnessGeometry?.(id); // the preset's act too (verify r5 ③)
        this.app.wm.minimize(id);
      }
    }

    // Update active preset name
    await fetch('/api/layouts-active', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    this._currentName = name;
  }

  // Delete a named preset
  async deletePreset(name) {
    try {
      await fetch(`/api/layouts/${encodeURIComponent(name)}`, { method: 'DELETE' });
      delete this._savedPresets[name];
      if (this._currentName === name) this._currentName = null;
    } catch {}
  }

  // Refresh saved presets list from server
  async refresh() {
    try {
      const res = await fetch('/api/layouts');
      const data = await res.json();
      this._savedPresets = data.saved || {};
      this._currentName = data.current || null;
    } catch {}
  }

  // Toolbar height rides layout-sync like the taskbar's; a value at the CSS
  // default means RESET (clear the override) rather than pinning the default.
  // ONE decoder for a state's toolbar fields (2.254.0 review-hardened) —
  // every intake (sync, remote apply, restore, boot) must use THIS, never
  // inline branches:
  //  · toolbarScale number → apply
  //  · legacy toolbarHeight → migrate via h/40, BUT a value in the reset
  //    dead-zone (≈40) is NO INFORMATION, never a reset — an old-bundle
  //    client echoes its fixed 40 on every autosave (2.240.3 stale tabs are
  //    a real recurring class) and treating that as a reset erased the whole
  //    fleet's scale + localStorage (adversarial-review catch)
  //  · explicit toolbarScale:null (key present) → the sender RESET; propagate
  _applyToolbarState(state) {
    if (!state) return;
    if ('toolbarScale' in state) {
      // NEW-format state: decode by the new key EXCLUSIVELY — the companion
      // legacy toolbarHeight (emitted for old readers) must never shadow an
      // explicit-null reset (branch-ordering bug caught by the boot smoke:
      // null + companion 40 decoded as "legacy no-info" and the reset died)
      if (state.toolbarScale != null) this._applyToolbarScale(state.toolbarScale);
      else this._applyToolbarScale(1); // explicit null = the sender RESET
    } else if (state.toolbarHeight) {
      // LEGACY-only state (old bundle): migrate via h/40; the reset dead-zone
      // (≈40, the old fixed default) is NO information — an old client echoes
      // it on every autosave and must not erase the fleet's scale
      const sc = Number(state.toolbarHeight) / 40;
      if (Number.isFinite(sc) && Math.abs(sc - 1) >= 0.03) this._applyToolbarScale(sc);
    }
  }

  // 2.254.0: the toolbar resize is a CONTENT SCALE (--toolbar-scale zoom), not
  // a fixed height. Accepts a scale, OR migrates a legacy fixed-height value
  // (from a pre-2.254.0 client / persisted state) via scale ≈ height/40.
  _applyToolbarScale(s) {
    const root = document.documentElement;
    s = Number(s);
    if (!Number.isFinite(s)) return;
    if (s > 4) s = s / 40; // a legacy fixed-height value (px) → scale
    s = Math.max(0.7, Math.min(1.25, s)); // clamp to the drag range
    // default is a constant 1 (no theme/CSS override of --toolbar-scale), so a
    // plain constant is the correct reset reference — no cssVarDefault needed
    if (Math.abs(s - 1) < 0.03) {
      if (!root.style.getPropertyValue('--toolbar-scale')) return; // already default — no churn
      root.style.removeProperty('--toolbar-scale'); localStorage.removeItem('toolbarScale');
    } else {
      const v = s.toFixed(3);
      if (root.style.getPropertyValue('--toolbar-scale') === v) return; // unchanged — skip reflow + write
      root.style.setProperty('--toolbar-scale', v); localStorage.setItem('toolbarScale', v);
    }
    this.app.wm._reflowWindows?.();
  }

  _applyTaskbarHeight(h) {
    const taskbar = document.getElementById('taskbar');
    if (!taskbar) return;
    // A height at the CSS default means "no override" — apply it as a RESET
    // (clear inline height + adaptive vars) instead of pinning the default as
    // an inline override, which permanently inflated item sizing (the
    // JS-derived vars ≠ the CSS defaults even at the same height).
    const def = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 44;
    if (Math.abs(h - def) < 2) {
      if (taskbar.style.height) {
        taskbar.style.height = '';
        localStorage.removeItem('taskbarHeight');
        this.app.desktopManager?._clearTaskbarSizeVars?.();
      }
      return;
    }
    if (Math.abs(taskbar.offsetHeight - h) < 2) return;
    taskbar.style.height = h + 'px';
    localStorage.setItem('taskbarHeight', h);
    this.app.desktopManager?._adaptTaskbarSize(h);
  }
}

export { LayoutManager };
