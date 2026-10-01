'use strict';
/**
 * THE LIVE VIEW'S WS BRIDGE — ORCH (docs/design-agent-browser-v2.md §4.2, P2).
 *
 * `GET /api/browser/stream?session=<webuiId>[&profile=<handle|id>]` upgrades a
 * COOKIE-AUTHED WebSocket and bridges it to that session's agent-browser
 * stream server, in the shape of server.js's `bridgeVncSocket()`:
 *   · the stream port stays on loopback and NEVER reaches a browser — the
 *     upstream connection is made HERE (its origin check refuses a real
 *     browser origin anyway: measured 403 for a foreign Origin, loopback and
 *     absent accepted — scripts/fixtures/browser-stream/session-0.32.0.json);
 *   · ONE upstream connection per (session, target), FANNED OUT to N viewers
 *     (§4.2 "multi-viewer"): `frame` is latest-wins and gated PER VIEWER by its
 *     own `config maxFps` and its own high-water mark; every other record is
 *     ordered and reaches every viewer; the `maxFps` sent upstream is the MAX
 *     across viewers; a late viewer is replayed the last status/tabs/url and
 *     the last frame at once;
 *   · BACKPRESSURE, the VNC bridge's discipline verbatim: pause the upstream
 *     socket when any viewer has more than 8 MiB buffered, resume (a 50 ms
 *     poll, like the original) once every viewer is under 1 MiB — a fast
 *     framebuffer and a slow client is a memory bomb otherwise;
 *   · INPUT is forwarded only from the viewer holding the user side of the
 *     lease (P3, §4.3): a viewer's `takeover` asks the KEEPER (the one owner
 *     of the input side — `keeper.takeover`/`handback`), the relay mirrors
 *     the answer as `relay.mode`/`relay.holder`, every other viewer's input
 *     is refused with the typed `watch-mode`/`held` codes; a `handback` (the
 *     click), the HOLDER'S SOCKET CLOSING (`viewer-left`) and the keeper's
 *     idle sweep all flip it back, and every relay on that browser learns it
 *     through `keeper.onInput` (one `mode` record per viewer, `mine` set for
 *     the holder). A keeper without the P3 surface (the heavy suite's stub)
 *     degrades to relay-local mode bookkeeping.
 *   · `--confirm-actions` (§4.3): a `result` mirror carrying
 *     `confirmation_required` becomes a typed `confirmation` record to every
 *     viewer (+ the keeper's registry, replayed to late viewers); a viewer's
 *     `confirm {id, decision, shown}` is answered through upstream's own
 *     `confirm`/`deny` (keeper.answerConfirmation) and acked typed. r6 A-F8:
 *     the relay remembers `command` records by id so a confirmation names its
 *     TARGET; only the keeper's first-written view is broadcast (a conflict is
 *     its own `confirmation-conflict` record); `shown` = the card's digest.
 *     r6 A-F9: the `mode` record (and `handback-wakes` when a sibling joins)
 *     carries how many turns a Hand back from this view wakes; `handback
 *     {expectWakes}` is checked by the keeper.
 *   · every refusal is TYPED and reaches the viewer as a message before the
 *     close — a socket that just closes is a silent failure of a user act.
 * The decisions are PURE (src/browser-stream.js); the port comes from the
 * keeper (`streamPortFor`, which starts a stopped profile browser — a view is
 * a start, like an attach — or asks the ephemeral browser under the very
 * pairs its session was spawned with). `hostId` is a parameter: a remote
 * session is refused BY NAME in P2 (the device op is a later phase).
 * Gate: scripts/test-browser-live.mjs (heavy).
 *
 * lane S4 (naive-user study 2, 2026-09-26 — "实况画面只占窗格上面一截", the phone's
 * desktop-width strip, and a picture that stayed blank white under a URL that
 * said loaded):
 *   · THE PAGE IS THE PANE'S SIZE: every viewer reports its pane (`fit`); the
 *     ruling pane (PURE src/browser-fit.js `fitTarget` — the holder's while
 *     somebody drives, else the largest visible one) becomes the page's viewport
 *     through `keeper.setViewportFor` (the daemon's own `set viewport`, debounced,
 *     single flight — builder r2: a MODE change fits at once, and no set starts
 *     while the driver holds a button: FIT.buttonStep / fitHoldVerdict; a shared
 *     browser somebody drives answers `held_while_driving`, a state the handback
 *     re-fits, never a failure); every viewer is told (`{type:'fit'}`, replayed to
 *     a late one). The mirror of OUR set is dropped before the taps and the fan-out
 *     (`ownViewportRecord`); an AGENT's `set viewport` / `set device` is a flag
 *     on the target (`fitStates`, it outlives the relay) — never overridden, the
 *     view letterboxes and says so, and only a viewer's `fit {force}` (the user's
 *     "Fit to this window") takes it back. A headed window that cannot be that
 *     narrow is read off the picture (`fitHonored` 'scaled') and re-fitted at its
 *     floor. Nobody visible for RESTORE_AFTER_MS ⇒ the page goes back to the size
 *     it had before the first fit.
 *   · VERIFY r1 (2026-09-26): two viewport sets in flight at once are judged by the
 *     daemon's ORDER (`relay.ordSeq` on every ordered record; `ownSetOutcome`):
 *     the agent's mirrored after ours ⇒ the agent's stands (never "fitted" over
 *     its page); ours after the agent's ⇒ ours overrode an explicit choice and
 *     `reapplyAgent` puts it back. The restore waits for a KNOWN running turn to
 *     end (`restoreDeferred`, the keeper's own turn facts). The agent's choice,
 *     the applied size, the baseline and the headed floor are a NOTE on the
 *     keeper's browser record (`persistFit` / `viewportNoteFor`) so a server
 *     restart forgets none of them; a new relay's first picture forgets an
 *     agent choice that is no longer on the page (a relaunched browser).
 *   · THE TRAILING FRAME: a frame the per-viewer gate refused is followed, when
 *     the gate opens, by the relay's LATEST frame (`S.frameGateWait`) — a static
 *     page's final paint is never dropped for good (the blank-white picture).
 *   · A FRESH FRAME: a navigation no upstream frame followed within
 *     FRESH_FRAME_MS (a hash change measured 0 frames on 0.38.1) — or a viewer's
 *     `refresh` — is answered with a picture asked of the page itself
 *     (`keeper.freshFrameFor`, CDP Page.captureScreenshot server-side).
 * Gate: scripts/test-browser-fit.mjs (fast) + scripts/test-browser-live-fit.mjs (heavy).
 *
 * lane live-input (2026-09-27, the owner: a paste and an IME commit of four characters never reached the page while the
 * bar said "sent"): ONE ORDERED INPUT PIPELINE per relay (`relay.inq`): a viewer's `input_text` is cut into the ≤ 3-unit
 * `char` records Chromium accepts (S.textRecords — a longer key text is refused -32602, measured) and its chunks keep
 * their place among the keys and clicks around them; ONE receipt per act (`landed`, `dropped`); a MEDIATED lease keeps
 * at most INPUT_WINDOW records waiting on their credits. COPY OUT: a takeover arms a copy watch on the tab on show
 * (keeper.watchCopiesFor) — the page's own copies reach the HOLDER as `clipboard` records, ONLY on the holder's own
 * gesture the bridge forwarded (`relay.copyArm`, PURE T.copyDeliverVerdict: single-use, COPY_GESTURE_MS — verify
 * 2026-09-27: a page's synthetic copy wrote the user's clipboard with nothing pressed). A `fit {claim}` makes the
 * page follow that viewer's window; every `fitted` record names the ruling window's `place`. `hello.platform`.
 * Gate: scripts/test-live-input.mjs (fast) + scripts/test-browser-live-input.mjs (heavy).
 */
const { WebSocketServer, WebSocket } = require('ws');
const S = require('../browser-stream.js');
const T = require('../browser-takeover.js');
const FIT = require('../browser-fit.js'); // lane S4: the pane → page viewport rules, the agent-set flag, the fresh-frame clocks
/** lane S4: a page size the keeper could not set is not asked for again for this long (a new pane size is). */
const FIT_RETRY_MS = 30000;
/** builder r2 (the reality verifier's B): the page is never resized under the driver's HELD button — a resize landing
 *  mid-drag re-laid the page out under the pointer (the drag's moves jumped from y=232 to y=361, the selection empty).
 *  A fit that comes due while a button is down waits for its release; a button held longer than this (a release that
 *  never arrived) stops holding it. */
const FIT_HOLD_MAX_MS = 15000;

const MAX_PAYLOAD = 32 * 1024 * 1024;
const LIVE_CHECK_MS = 2000;
/** r6 A-F8: how many `command` records a relay remembers by id (a confirmation's result pairs with its command). */
const CMD_MEMORY = 64;
const RESUME_POLL_MS = 50;
/** The holder's inputs restart the keeper's idle clock at most this often. */
const INPUT_NOTE_MS = 1000;
/** lane live-input: on a MEDIATED lease at most this many forwarded inputs wait on their credit at once (the rest queue
 *  here, in order). The mediator keeps ≤ 256 credits for 1.2 s each (browser-mediation INPUT_CREDIT_MS): a 3-unit-chunked
 *  paste of thousands of records sent at once evicted its own first credits (refused browser_paused); 16 in flight keep
 *  the daemon's serial dispatch fed and each credit well inside its life. A direct lease has no credit: no window. */
const INPUT_WINDOW = 16;
/** lane live-input: the same copy reported twice inside this span (two worlds of one re-armed page) is one copy. */
const COPY_DEDUP_MS = 150;
/** P5: the fps a tapped relay asks for with no viewer (src/browser-trace.js owns the number). */
const TAP_FPS = require('../browser-trace.js').TRACE_TAP_FPS;
const TF = require('./turn-facts.js'); // verify r1: the restore waits for a KNOWN running turn (the keeper's own rule for releases)
const HM = require('../browser-human.js'); // BROWSE YOURSELF (B-6ae8): the user's own browsing window — its controls, its acts

function create({ keeper = null, activeSessions, requestAuthed, log = console, now = Date.now, limits = S.BACKPRESSURE,
  WebSocketImpl = WebSocket, connectTimeoutMs = 20000, getTelemetry = () => null, platform = process.platform, inputWindow = INPUT_WINDOW,
  dialogs = null } = {}) { // lane browser-stuck: the page-dialog watch (src/server/browser-dialogs.js) — its records reach the viewers
  if (!activeSessions) throw new Error('browser-stream: activeSessions is required');
  if (typeof requestAuthed !== 'function') throw new Error('browser-stream: requestAuthed is required');
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  const relays = new Map();   // key → relay
  let nextViewerId = 1;
  // lane S4: per (session, target) — OUTLIVES a relay (a relay ends when its last viewer leaves; the page keeps the size we
  // set and the agent's own choice stays the agent's): { target, applied, baseline, agent, floorW, pending, restoreTimer }
  const fitStates = new Map();
  const fitStateOf = (relay) => {
    let fs = fitStates.get(relay.key);
    if (!fs) {
      // verify r1: seeded from the NOTE on the keeper's browser record (a server restart forgets neither the agent's choice nor the baseline)
      let seed = null; if (keeper && typeof keeper.viewportNoteFor === 'function') { try { seed = FIT.fitStateFromNote(keeper.viewportNoteFor(relay.target)); } catch { seed = null; } }
      fs = { target: relay.target, sessionId: relay.sessionId, applied: seed && seed.applied ? { ...seed.applied, viewerId: null, rule: null, at: 0 } : null, baseline: (seed && seed.baseline) || null, agent: (seed && seed.agent) || null, floorW: (seed && seed.floorW) || FIT.FIT_MIN_W, pending: null, prevOwn: null, ownDone: null, restoreTimer: null, failed: null, restoreDeferredSaid: false };
      fitStates.set(relay.key, fs);
    }
    fs.target = relay.target; fs.sessionId = relay.sessionId; return fs;
  };
  /** verify r1: the note follows every change of the agent's choice / the size we set / the baseline / the floor. */
  function persistFit(fs) { if (!keeper || typeof keeper.noteViewport !== 'function') return; try { keeper.noteViewport(fs.target, FIT.fitNoteOf(fs)); } catch (e) { log.warn?.(`[browser-live] the page-size note could not be written — ${e && e.message}`); } }
  const turnOfSession = (sessionId) => { const s = activeSessions.get?.(sessionId); return s && TF.turnKnown(s) ? TF.turnOf(s) : null; };
  const canFit = () => !!(keeper && typeof keeper.setViewportFor === 'function');
  // P3: the keeper is the one owner of the input side; every relay on that
  // (conversation, browser) mirrors what it says (idle sweep, HTTP handback,
  // another window's click all arrive here).
  const unsubInput = keeper && typeof keeper.onInput === 'function' ? keeper.onInput((ev) => {
    for (const r of relays.values()) {
      if (r.browserKey !== ev.browserKey || (r.target.profileId || null) !== (ev.profileId || null)) continue;
      // the owner's ruling (2026-09-27): the mode record says what the takeover interrupted and what the handback asks to re-run
      applyInputState(r, ev.state, ev.cause || (ev.kind === 'takeover' ? 'takeover' : 'handback'), { interrupted: ev.kind === 'takeover' && ev.interruption && ev.interruption.fresh !== false ? { n: ev.interruption.n || 0, verbs: ev.interruption.verbs || [], terminated: ev.interruption.terminated || 0 } : null, rerun: ev.kind === 'handback' && Array.isArray(ev.rerun) ? ev.rerun : null });
    }
    // r6 A-F9: a SIBLING conversation taken with (or handed back from) this browser changes how many turns a Hand back
    // from another view of it starts — every driven view of the same profile is told the count again
    if (ev.profileId) for (const r of relays.values()) {
      if (r.browserKey === ev.browserKey || (r.target.profileId || null) !== ev.profileId || r.mode !== 'takeover') continue;
      broadcast(r, { type: 'handback-wakes', wakes: wakesOf(r) });
    }
  }) : null;
  // VERIFY S5 (2026-09-26): a NAMED profile's lease that goes (the user's "Only <other chat>" narrowing, a Delete…, an
  // agent's detach, the carrier grace) ends every live view this conversation had on that browser — typed `ended`, so
  // the window says why instead of showing a picture of a browser the conversation no longer holds (and cannot take over)
  const unsubLease = keeper && typeof keeper.onLease === 'function' ? keeper.onLease((ev) => {
    // BROWSE YOURSELF (B-6ae8): his browsing ended (Close, the keep ran out, the browser stopped / quit, the profile deleted)
    // ⇒ every window of it is told WHY, typed, and let go (a Close closes it; the others say "Browse again")
    if (ev && ev.kind === 'human-end' && ev.key) {
      for (const r of [...relays.values()]) if (isHuman(r) && r.target.key === ev.key) { broadcast(r, { type: 'status', state: 'human-ended', reason: ev.reason || 'released', deleted: !!ev.deleted }); endRelay(r, 1000, null); }
      return;
    }
    if (!ev || (ev.kind !== 'detach' && ev.kind !== 'lease-dropped') || !ev.profileId || ev.ephemeral) return;
    for (const r of [...relays.values()]) {
      if (r.browserKey !== ev.browserKey || (r.target.profileId || null) !== ev.profileId) continue;
      endRelay(r, 1000, ev.kind === 'detach' ? 'this conversation no longer holds that browser profile' : 'the lease on that browser profile was dropped');
    }
  }) : null;
  const unsubConfirm = keeper && typeof keeper.onConfirmation === 'function' ? keeper.onConfirmation((ev) => {
    for (const r of relays.values()) {
      if (r.browserKey !== ev.browserKey || (r.target.profileId || null) !== (ev.profileId || null)) continue;
      if (ev.kind === 'pending') broadcast(r, T.confirmationView(ev.confirmation, now()));
      // r6 A-F8: a second record that tried to change a pending card is SAID (the card stays what it was) — never a resolve
      else if (ev.kind === 'conflict') broadcast(r, { type: 'confirmation-conflict', id: ev.id, attempted: ev.attempted || null });
      else broadcast(r, { type: 'confirmation-resolved', id: ev.id, decision: ev.decision || null });
    }
  }) : null;

  const send = (ws, obj) => { try { if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* closing */ } };
  /** BROWSE YOURSELF (B-6ae8): a relay of the USER's own browsing window (`?browse=hu-<hex>`) — his own tab, his own
   *  session; its controls are the keeper's `human*` verbs (never a takeover: nothing of any agent is paused), no tab
   *  anchor (every tab change on it is his), and his forwarded input becomes ACTS on its taps (the recorder's). */
  const isHuman = (relay) => !!(relay && relay.target && relay.target.kind === 'human');
  const broadcast = (relay, obj) => { const text = typeof obj === 'string' ? obj : JSON.stringify(obj); for (const v of relay.viewers.values()) send(v.ws, text); };

  // ── lane browser-stuck (2026-09-28): A PAGE DIALOG IS SHOWN WHERE THE USER LOOKS. The stream server says nothing of a
  // dialog (measured on 0.38.1: status / tabs / command / result / url only) — the dialog watch does. A relay shows the
  // dialog on the tab it shows (its `activeTarget`; before the first `tabs` record, any of its browser's); a viewer's
  // `dialog-answer` is the USER's answer (Page.handleJavaScriptDialog through the watch — the one client that saw it).
  const relayProfileId = (relay) => {
    if (relay.target.kind === 'attachment') return relay.target.profileId || null;
    try { const e = keeper && keeper.ephemeralFor ? keeper.ephemeralFor(relay.target.kind === 'child' ? relay.target.handle : relay.browserKey) : null; return e ? e.profileId : null; } catch { return null; }
  };
  const dialogShownOn = (relay, targetId) => !relay.activeTarget || !targetId || relay.activeTarget === targetId;
  function dialogRecordFor(relay) {
    if (!dialogs) return null;
    const pid = relayProfileId(relay);
    const d = pid ? dialogs.openOn(pid, relay.activeTarget ? [relay.activeTarget] : null) : null;
    return d ? { type: 'dialog', state: 'open', dialog: d } : null;
  }
  const unsubDialogs = dialogs && typeof dialogs.onChange === 'function' ? dialogs.onChange((ev) => {
    if (!ev || !ev.profileId) return;
    for (const r of relays.values()) {
      if (relayProfileId(r) !== ev.profileId) continue;
      if (ev.kind === 'open' && dialogShownOn(r, ev.targetId)) broadcast(r, { type: 'dialog', state: 'open', dialog: require('../browser-stuck.js').dialogBlock(ev.dialog, { now: now() }) });
      else if (ev.kind === 'closed' && ev.answered && dialogShownOn(r, ev.targetId)) broadcast(r, { type: 'dialog', state: 'closed', id: ev.answered.id, answered: { how: ev.answered.how, by: ev.answered.by, at: ev.answered.at } });
      else if (ev.kind === 'down' && ev.closed && ev.closed.length) broadcast(r, { type: 'dialog', state: 'closed', ids: ev.closed, answered: null });
    }
  }) : null;
  function armDialogs(relay) {
    if (!dialogs) return;
    const pid = relayProfileId(relay);
    if (!pid) return;
    dialogs.arm(pid).then(() => { const rec = dialogRecordFor(relay); if (rec) broadcast(relay, rec); }).catch(() => { /* the watch says why in its own journal line */ });
  }
  function answerDialog(relay, viewer, msg) {
    const pid = relayProfileId(relay);
    const ack = (o) => send(viewer.ws, { type: 'dialog-ack', id: String(msg.id || ''), ...o });
    if (!dialogs || !pid) return ack({ ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' });
    dialogs.answer({ profileId: pid, browserKey: relay.browserKey, sessionId: relay.sessionId, ephemeral: relay.target.kind !== 'attachment', dialogId: msg.id ? String(msg.id).slice(0, 80) : null }, { accept: !!msg.accept, text: msg.accept && typeof msg.text === 'string' ? msg.text.slice(0, 2000) : null, by: 'user' })
      .then((r) => ack(r.ok ? { ok: true } : { ok: false, code: r.code || 'refused', error: r.error || 'refused' }))
      .catch((e) => ack({ ok: false, code: 'internal', error: String(e && e.message) }));
  }
  /** The tab each of a conversation's relays shows (the watch's scope for a dialog — whose tab it is). */
  function activeTargetsFor({ sessionId = null, browserKey = null, profileId = null } = {}) {
    // verify r2 #3: ONE conversation's relays — by its browser key (a helper's view is keyed on its own), else its session;
    // neither ⇒ none. It read EVERY relay when no session was named (the chip's fact asks by key only): on a shared profile
    // conversation A's chip carried conversation B's dialog — its page text — as A's own
    if (!browserKey && !sessionId) return [];
    const out = [];
    for (const r of relays.values()) if ((browserKey ? r.browserKey === browserKey : r.sessionId === sessionId) && r.activeTarget && relayProfileId(r) === profileId) out.push(r.activeTarget);
    return out;
  }
  /** The agent's own dialog answer is a page act on the trace: the stream mirror's command/result shape, to the TAPS
   *  only (the recorder), never to a viewer. */
  let dialogActSeq = 0;
  function tapDialogAct({ sessionId, profileId = null, action, dialog = null } = {}) {
    const id = `r-vs-dialog-${++dialogActSeq}`; const t = now();
    const cmd = { type: 'command', action: 'dialog', id, params: { action: 'dialog', id, response: String(action || '') }, timestamp: t };
    const res = { type: 'result', action: 'dialog', id, success: true, data: dialog ? { type: dialog.type, message: dialog.message } : null, duration_ms: 0, timestamp: t };
    let n = 0;
    for (const r of relays.values()) {
      if (r.sessionId !== sessionId || (r.target.profileId || null) !== (profileId || null) || r.target.child || r.target.kind === 'child') continue;
      for (const fn of [...r.taps]) { try { fn(cmd, JSON.stringify(cmd), r); fn(res, JSON.stringify(res), r); n++; } catch { /* a tap's own failure */ } }
    }
    return n;
  }

  /** The live session behind a webui id, and the facts the target needs. */
  function sessionFacts(id) {
    const s = activeSessions.get?.(id) || null;
    if (!s) return null;
    return { session: s, browserKey: s._browserKey || null, envPairs: Array.isArray(s._browserEnv) ? s._browserEnv : null, host: s.host || s.hostId || null, name: s.name || s.webuiName || id };
  }
  function refuse(ws, code, error, extra = {}) {
    send(ws, { type: 'status', state: 'error', code, error, ...extra });
    try { ws.close(1008, String(code).slice(0, 100)); } catch { /* closing */ }
  }

  function handleUpgrade(req, socket, head) {
    if (!requestAuthed(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    let sessionId = '', profileRef = '', browse = '', fresh = '';
    try { const q = new URL(req.url || '/', 'http://x').searchParams; sessionId = String(q.get('session') || '').slice(0, 80); profileRef = String(q.get('profile') || '').slice(0, 80); browse = String(q.get('browse') || '').slice(0, 40); fresh = String(q.get('fresh') || '').slice(0, 40); } catch { /* bad url → refused below */ }
    // verify r1 (H1): the user's own browsing window is HIS — an agent's session / job token never opens one (an auth-off
    // instance lets every upgrade through requestAuthed). verify r2: judged on the PARSED query — the one the handler reads
    // (a raw-url regex let `?%62rowse=` / `?brows%65=` through: the parser decodes a name)
    if (browse && /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''))) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // BROWSE YOURSELF (B-6ae8): a third query shape — the user's own browsing window (cookie auth as above)
      const go = browse ? attachHumanViewer(ws, { key: browse, fresh }) : attachViewer(ws, { sessionId, profileRef });
      go.catch((e) => { log.warn?.(`[browser-live] viewer attach failed: ${e && e.message}`); refuse(ws, 'internal', String(e && e.message)); });
    });
  }

  async function attachViewer(ws, { sessionId, profileRef }) {
    const f = sessionFacts(sessionId);
    if (!f) return refuse(ws, 'not-found', `no such live session ${JSON.stringify(sessionId)}`);
    if (f.host) return refuse(ws, 'unsupported-host', `the live view is local-only in this release — session ${sessionId} runs on host ${JSON.stringify(f.host)}`);
    let set = null, profiles = [];
    if (keeper) { try { set = keeper.setFor(f.browserKey); profiles = keeper.list().profiles; } catch (e) { log.warn?.(`[browser-live] keeper unreadable: ${e && e.message}`); } }
    const target = S.streamTargetFor({ browserKey: f.browserKey, set, profileRef, envPairs: f.envPairs, profiles });
    if (!target.ok) return refuse(ws, target.code, target.error, { handles: target.handles || [] });
    const key = relayKeyFor(sessionId, target);
    let relay = relays.get(key);
    if (!relay) { relay = createRelay(key, sessionId, target); relays.set(key, relay); }
    const viewer = { id: nextViewerId++, ws, maxFps: S.MAX_FPS_DEFAULT, lastFrameAt: 0, sent: 0, dropped: 0, since: now(), sentSeq: 0, trailTimer: null };
    relay.viewers.set(viewer.id, viewer);
    noteViewers(relay);
    send(ws, { ...S.hello({ viewers: relay.viewers.size, target, mode: relay.mode, holder: relay.holder, platform }), you: viewer.id, mine: relay.holder === viewer.id, since: relay.modeSince || 0 });
    for (const t of S.REPLAYED_TYPES) if (relay.last[t]) send(ws, relay.last[t]);
    if (relay.lastFrame) { send(ws, relay.lastFrame); viewer.lastFrameAt = now(); viewer.sent++; viewer.sentSeq = relay.frameSeq; }
    if (relay.viewport) send(ws, relay.viewport); // lane J: the page's viewport reading, replayed like the last frame
    if (relay.lastFit) send(ws, relay.lastFit); // lane S4: what the page's size is and whose pane it follows (the chip's words)
    if (relay.lastOwners) send(ws, relay.lastOwners); // lane browser-resume C: whose each tab is (the tab row's controls), replayed like the tabs record
    // 2.369.180 (lanes H + J on one tree): a viewer that joins a relay whose upstream is ALREADY open is told so — the
    // 'upstream-open' broadcast went out before it came, and lane H's recorder taps a holder's relay before anybody
    // watches, so EVERY live view of an ephemeral browser is such a joiner. Without it the view never read itself
    // connected, and lane J's keyboard ownership (`connected` is one of its facts) never let a takeover own the keyboard.
    if (relay.upstream && relay.upstream.readyState === 1) send(ws, { type: 'status', state: 'upstream-open' });
    { const dr = dialogRecordFor(relay); if (dr) send(ws, dr); } // lane browser-stuck: a late viewer sees the dialog that holds the page
    // P3: a late viewer is told what is still waiting on a confirmation
    if (keeper && typeof keeper.pendingFor === 'function') { try { for (const c of keeper.pendingFor(relay.browserKey, relay.target.profileId || null)) send(ws, c); } catch { /* optional */ } }
    broadcastViewers(relay);
    ws.on('message', (d) => onViewerMessage(relay, viewer, d));
    ws.on('close', () => dropViewer(relay, viewer));
    ws.on('error', () => dropViewer(relay, viewer));
    await relay.ensureUpstream();
  }

  /**
   * BROWSE YOURSELF (B-6ae8): a viewer of the user's OWN browsing window. The keeper names the target (the holder must
   * exist on a live browser — a view never starts one: `browser_stopped` / `not_browsing`, and the window offers Browse
   * again), ONE relay per holder (`human:<key>`), the same hello / replays / fit / receipts as any live view; then the
   * keeper decides whether THIS window takes his tab's controls (PURE humanAttachVerdict: the window his last press opened
   * — its `fresh` token — claims them; another live window of his keeps them; else this one takes them).
   */
  async function attachHumanViewer(ws, { key, fresh = '' }) {
    if (!keeper || typeof keeper.humanTargetFor !== 'function') return refuse(ws, 'unavailable', 'browsing a profile yourself is not available on this server');
    const target = keeper.humanTargetFor(key);
    if (!target || !target.ok) return refuse(ws, (target && target.code) || 'not-found', (target && target.error) || 'not a browsing window of yours', target && target.state ? { browserState: String(target.state) } : {});
    const rk = 'human:' + target.key;
    let relay = relays.get(rk);
    if (!relay) { relay = createRelay(rk, null, target); relays.set(rk, relay); }
    const viewer = { id: nextViewerId++, ws, maxFps: S.MAX_FPS_DEFAULT, lastFrameAt: 0, sent: 0, dropped: 0, since: now(), sentSeq: 0, trailTimer: null };
    relay.viewers.set(viewer.id, viewer);
    noteViewers(relay);
    send(ws, { ...S.hello({ viewers: relay.viewers.size, target, mode: relay.mode, holder: relay.holder, platform }), you: viewer.id, mine: relay.holder === viewer.id, since: relay.modeSince || 0, human: true });
    for (const t of S.REPLAYED_TYPES) if (relay.last[t]) send(ws, relay.last[t]);
    if (relay.lastFrame) { send(ws, relay.lastFrame); viewer.lastFrameAt = now(); viewer.sent++; viewer.sentSeq = relay.frameSeq; }
    if (relay.viewport) send(ws, relay.viewport);
    if (relay.lastFit) send(ws, relay.lastFit);
    if (relay.lastOwners) send(ws, relay.lastOwners); // lane browser-resume C: his window's tab row
    if (relay.upstream && relay.upstream.readyState === 1) send(ws, { type: 'status', state: 'upstream-open' });
    broadcastViewers(relay);
    ws.on('message', (d) => onViewerMessage(relay, viewer, d));
    ws.on('close', () => dropViewer(relay, viewer));
    ws.on('error', () => dropViewer(relay, viewer));
    let a = null;
    try { a = keeper.humanAttach({ key: target.key, viewerId: viewer.id, token: fresh || null }); } catch (e) { a = { ok: false, error: String(e && e.message) }; }
    if (a && a.ok && !a.take) send(ws, { type: 'mode', mode: relay.mode, holder: relay.holder, mine: false, since: relay.modeSince || 0, cause: 'elsewhere', url: null, human: true }); // "You're browsing this in another window" + Continue here
    await relay.ensureUpstream();
  }

  /** ONE upstream per (session, target): an attachment by its profile, a HELPER by its child key — the live view's
   *  `child` target (lane P, by handle) and the recorder's `~child:` tap (lane H naive study 2 finding 4, `child: true` +
   *  its browserKey) name the SAME browser and share ONE relay — the session's own browser otherwise. */
  function relayKeyFor(sessionId, target) { if (target.kind === 'human') return 'human:' + target.key; return `${sessionId}|${target.kind === 'attachment' ? target.profileId : target.kind === 'child' ? 'child:' + target.handle : target.child ? 'child:' + target.browserKey : 'ephemeral'}`; }
  /** MULTIVIEW B-325a: the keeper releases no browser somebody is watching — tell it how many watch this pair. */
  function noteViewers(relay) { try { keeper?.noteViewers?.(relay.browserKey, relay.target.profileId || null, relay.viewers.size); } catch { /* optional */ } }
  function createRelay(key, sessionId, target) {
    const f = sessionFacts(sessionId) || {};
    // MULTIVIEW §4: a HELPER's relay is keyed on ITS handle (its takeover pauses
    // the helper, never the parent) and answers under ITS OWN pairs
    const child = target.kind === 'child';
    let childPairs = null;
    if (child && keeper && typeof keeper.pairsForKey === 'function') { try { childPairs = keeper.pairsForKey(target.handle); } catch { childPairs = null; } }
    const relay = {
      // a HELPER's relay is keyed and answered under ITS key and pairs (the session's are its parent's): lane P's view
      // target by handle (pairs from the keeper), lane H's tap target (its own browserKey + pairs on the target)
      key, sessionId, target, browserKey: child ? target.handle : target.kind === 'human' ? target.key : (target.browserKey || f.browserKey || null), envPairs: child ? childPairs : target.kind === 'human' ? null : (target.envPairs || f.envPairs || null), viewers: new Map(), upstream: null, connecting: null, last: {}, lastFrame: null,
      // P5 (§4.5): server-side TAPS — the action-trace recorder listens to the
      // same upstream (every record, frames included) and keeps the relay
      // alive with no viewer at a low fps; a tap never drives, never counts
      // as a viewer, and is told `tap-end` when the relay ends.
      taps: new Set(),
      paused: false, resumePoll: null, mode: 'watch', holder: null, modeSince: 0, lastInputNoteAt: 0, upstreamMaxFps: null, port: null,
      // lane J (inc-muhgv0fb-9i4u): the picture's own size (off each frame's JPEG) and the page's own viewport reading
      picture: null, viewport: null, activeTab: '', activeUrl: '', activeTarget: null, vp: { busy: false, again: null, warned: false }, // verify r2: activeTarget = the active tab's CDP targetId off the `tabs` record (0.38.1 names it) — what a takeover credit is bound to
      anchor: null, // verify r3: the tab the takeover BEGAN on (PURE S.takeoverAnchorStep) — a switch while the user drives is refused here, never followed
      // lane S4: frame sequence (the trailing gate), the panes (fit), the navigation clock (the fresh frame)
      frameSeq: 0, firstFrameAt: 0, fits: new Map(), fitTimer: null, fitBusy: false, fitAgain: null, fitForce: false, fitCheck: null, lastFit: null, fitWarned: false,
      navAt: 0, lastUpFrameAt: 0, freshTimer: null, freshBusy: false, lastRefreshAt: 0, lastUrl: '', ordSeq: 0, // ordSeq: the position of every ordered upstream record (verify r1: two viewport sets in flight are judged by the daemon's ORDER)
      stats: { frames: 0, dropped: 0, ordered: 0, trailed: 0, fresh: 0, own: 0, textActs: 0, textChunks: 0, copies: 0, copiesDropped: 0 }, lastLiveCheck: now(), since: now(),
      // lane live-input: the holder's input pipeline (ONE order: every record and every chunk of a text act, a window of
      // credits on a mediated lease), the claimed pane, and the copy watch armed while somebody drives
      btnDown: new Set(), btnDownAt: 0, fitHeld: null, fitHoldTimer: null, fitHeldSaid: false, // builder r2: the driver's buttons held down (a fit waits for their release)
      inq: [], inflight: 0, fitClaim: null, copyWatch: null, lastCopy: null, copyArm: null, // copyArm: the holder's last copy GESTURE the bridge forwarded (verify: a copy leaves the server only on it — single-use)
      cmds: new Map(), // r6 A-F8: the last CMD_MEMORY `command` records by id (a confirmation's target = its paired command's params)
      acts: null, actSeq: 0, actTimer: null, // BROWSE YOURSELF: the user's input → ACTS on the taps (humanActStep's state, the synthetic ids, the burst flush)
      lastOwners: null, ownersTimer: null, ownersBusy: false, ownersAgain: false, // lane browser-resume C: the tab row's `tab-owners` (judged by the keeper after a `tabs` record, debounced)
    };
    // P3: the keeper may already say somebody drives (an HTTP takeover, a
    // sibling relay that ended) — mirror it rather than assume Watch.
    if (target.kind === 'human') { try { const st = keeper && typeof keeper.humanInputState === 'function' ? keeper.humanInputState(target.key) : null; if (st && st.input === 'user') { relay.mode = 'takeover'; relay.holder = st.takenBy ? st.takenBy.viewerId : null; relay.modeSince = st.takenAt || 0; } } catch { /* optional */ } } // BROWSE YOURSELF: his tab — never an anchor
    else if (keeper && typeof keeper.inputStateFor === 'function') { try { const st = keeper.inputStateFor(relay.browserKey, target.profileId || null); if (st && st.input === 'user') { relay.mode = 'takeover'; relay.holder = st.takenBy ? st.takenBy.viewerId : null; relay.modeSince = st.takenAt || 0; relay.anchor = S.takeoverAnchor(null, now()); } } catch { /* optional */ } } // verify r3: a takeover already on when the relay is born anchors to the first tab the stream names
    relay.ensureUpstream = () => {
      if (relay.upstream) return Promise.resolve();
      if (relay.connecting) return relay.connecting;
      relay.connecting = connectUpstream(relay).catch((e) => { log.warn?.(`[browser-live] ${key}: upstream connect failed — ${e && e.message}`); broadcast(relay, { type: 'status', state: 'error', code: 'internal', error: String(e && e.message) }); }).finally(() => { relay.connecting = null; });
      return relay.connecting;
    };
    return relay;
  }

  async function connectUpstream(relay) {
    broadcast(relay, { type: 'status', state: 'connecting', target: relay.target.kind, profileId: relay.target.profileId || null });
    if (!keeper) { broadcast(relay, { type: 'status', state: 'error', code: 'unavailable', error: 'browser profiles are not available on this server' }); return endRelay(relay, 1011); }
    const r = await keeper.streamPortFor(relay.target);
    if (!relay.viewers.size && !relay.taps.size) return endRelay(relay);           // everyone left while the port was asked for
    if (!r.ok) { broadcast(relay, { type: 'status', state: 'error', code: r.code || 'stream_unavailable', error: r.error, ...(r.unstable ? { unstable: r.unstable } : {}), ...(r.state ? { browserState: String(r.state) } : {}) }); return endRelay(relay, 1011); } // lane H verify r6: an unstable verdict's kind rides (the view's words); lane P verify: `browserState` = the keeper's record state (not-started / stopped) — the view draws it hollow
    relay.port = r.port;
    const up = new WebSocketImpl(`ws://127.0.0.1:${r.port}`, { headers: { Origin: S.originHeaderFor(r.port) }, maxPayload: MAX_PAYLOAD, handshakeTimeout: connectTimeoutMs });
    relay.upstream = up;
    up.on('open', () => { broadcast(relay, { type: 'status', state: 'upstream-open' }); pushMaxFps(relay, true); armDialogs(relay); }); // lane browser-stuck: the dialog watch is on this browser before the user looks
    up.on('message', (d, isBinary) => onUpstream(relay, d, isBinary));
    up.on('unexpected-response', (_req, res) => { broadcast(relay, { type: 'status', state: 'error', code: 'upstream-refused', error: `the stream server answered ${res && res.statusCode}` }); try { up.terminate(); } catch { /* */ } });
    up.on('error', (e) => { log.warn?.(`[browser-live] ${relay.key}: upstream error — ${e && e.message}`); if (up.readyState !== 1) broadcast(relay, { type: 'status', state: 'error', code: 'upstream-error', error: String(e && e.message) }); });
    up.on('close', (code) => {
      if (relay.upstream !== up) return;
      relay.upstream = null;
      stopResumePoll(relay);
      // VERIFY r1 H2: an EPHEMERAL browser's stream server closing is usually its daemon dying — the keeper judges the
      // process NOW, so its holder row leaves at once (and the viewer's 1 s reconnect is refused browser_stopped, never a CLI ask)
      if (relay.target.kind === 'ephemeral' && keeper && typeof keeper.noteStreamClosed === 'function') { try { keeper.noteStreamClosed(relay.target); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: keeper.noteStreamClosed failed — ${e && e.message}`); } }
      broadcast(relay, { type: 'status', state: 'upstream-closed', code: Number(code) || 0 });
      endRelay(relay, 1001);
    });
  }

  function onUpstream(relay, d, isBinary) {
    const t = now();
    if (t - relay.lastLiveCheck > LIVE_CHECK_MS) {
      relay.lastLiveCheck = t;
      if (!isHuman(relay) && !activeSessions.has?.(relay.sessionId)) { closeForSession(relay.sessionId, 'the session ended'); return; } // BROWSE YOURSELF: his window has no session
    }
    if (isBinary) { for (const v of relay.viewers.values()) send(v.ws, d); applyBackpressure(relay); return; }
    const text = typeof d === 'string' ? d : d.toString();
    let msg = null; try { msg = JSON.parse(text); } catch { return; }
    const cls = S.classifyUpstream(msg);
    if (cls === 'invalid') return;
    if (S.privateUpstream(msg)) return; // lane J: the daemon's own cdp_url pair (the viewport read asks it) — the raw CDP endpoint never reaches a viewer or a tap
    if (cls !== 'frame') relay.ordSeq++;
    if (cls !== 'frame' && noteViewportCommand(relay, msg, t)) return; // lane S4: the mirror of OUR `set viewport` (+ its launch pair) — never a viewer's "running", never a tap's
    notePicture(relay, msg, cls);
    if (cls === 'frame') { relay.frameSeq++; relay.lastUpFrameAt = t; if (!relay.firstFrameAt) relay.firstFrameAt = t; }
    else if (msg.type === 'url') noteNavigation(relay, typeof msg.url === 'string' ? msg.url : '');
    // P5: every tap sees every record (a tap that throws never breaks the fan-out)
    for (const fn of relay.taps) { try { fn(msg, text, relay); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: tap failed — ${e && e.message}`); } }
    if (cls !== 'frame') onOrderedForKeeper(relay, msg);
    if (cls === 'frame') {
      relay.lastFrame = text; relay.stats.frames++;
      fanOutFrame(relay, text, t);
    } else {
      relay.stats.ordered++;
      if (S.REPLAYED_TYPES.includes(msg.type)) relay.last[msg.type] = text;
      for (const v of relay.viewers.values()) send(v.ws, text);
    }
    applyBackpressure(relay);
  }

  /** P3: the ordered mirror carries the facts the keeper's input side and
   *  confirmation registry need — the page the user is on, a pending
   *  `confirmation_required`, and the `confirm`/`deny` that resolves one. */
  function onOrderedForKeeper(relay, msg) {
    if (!keeper) return;
    const pid = relay.target.profileId || null;
    try {
      if (msg.type === 'url' && typeof msg.url === 'string' && typeof keeper.noteUserUrl === 'function') keeper.noteUserUrl(relay.browserKey, pid, msg.url);
      if (msg.type === 'tabs' && Array.isArray(msg.tabs) && typeof keeper.noteUserUrl === 'function') { const act = msg.tabs.find((x) => x && x.active && typeof x.url === 'string'); if (act) keeper.noteUserUrl(relay.browserKey, pid, act.url); }
      // lane browser-resume (§3.9): a conversation's OWN browser's live tab list (never a helper's — D6) — what its kept
      // entry gives back after the browser stops (the recorder's tap rides this relay too, so a traced browser has it with no viewer)
      if (msg.type === 'tabs' && Array.isArray(msg.tabs) && relay.target && relay.target.kind === 'ephemeral' && !relay.target.child && typeof keeper.noteTabs === 'function') keeper.noteTabs({ ...relay.target, browserKey: relay.browserKey }, msg.tabs);
      // lane browser-resume C (§3.9, ruling 3): whose each tab is — the tab row draws its controls from the keeper's answer
      if (msg.type === 'tabs' && Array.isArray(msg.tabs)) scheduleOwners(relay);
      // r6 A-F8: the `command` records are remembered by id (bounded) — a confirmation's TARGET is its paired command's params
      if (msg.type === 'command' && msg.id != null) { relay.cmds.set(String(msg.id), msg); if (relay.cmds.size > CMD_MEMORY) relay.cmds.delete(relay.cmds.keys().next().value); }
      const conf = T.confirmationFromUpstream(msg, now(), { command: msg.id != null ? relay.cmds.get(String(msg.id)) || null : null });
      if (conf) {
        const view = typeof keeper.notePending === 'function' ? keeper.notePending({ browserKey: relay.browserKey, profileId: pid, sessionId: relay.sessionId, confirmation: conf }) : T.confirmationView(conf, now());
        if (!unsubConfirm && view && !view.conflict) broadcast(relay, view); // first write wins here too: a conflict never repaints a card
        return;
      }
      const done = T.confirmationResolvedFromUpstream(msg);
      if (done) {
        if (typeof keeper.resolvePending === 'function') keeper.resolvePending({ browserKey: relay.browserKey, profileId: pid, id: done.id, decision: done.decision });
        if (!unsubConfirm) broadcast(relay, { type: 'confirmation-resolved', id: done.id, decision: done.decision });
      }
    } catch (e) { log.warn?.(`[browser-live] ${relay.key}: keeper note failed — ${e && e.message}`); }
  }
  /** P3: the keeper's (or the relay-local) answer becomes the relay's mode —
   *  ONE `mode` record per viewer (`mine` differs), the badge's words. */
  function applyInputState(relay, state, cause, extra = {}) {
    const user = !!(state && state.input === 'user');
    // verify r3: a takeover is ANCHORED to the tab it begins on (a pass keeps it — the same takeover goes on); a handback drops it
    // BROWSE YOURSELF (B-6ae8): never on the user's own browsing window — every tab change there is his (a login popup, a
    // link opened in a new tab; measured on 0.38.1: his pinned session lists a popup at once and `tab <id>` follows it)
    if (user && relay.mode !== 'takeover' && !isHuman(relay)) relay.anchor = S.takeoverAnchor(relay.activeTarget, now());
    else if (!user || isHuman(relay)) relay.anchor = null;
    relay.mode = user ? 'takeover' : 'watch';
    relay.holder = user && state.takenBy ? state.takenBy.viewerId : null;
    if (user && relay.viewers.has(relay.holder)) armCopyWatch(relay); else disarmCopyWatch(relay); // lane live-input: copy out while a viewer of THIS relay drives (a sibling conversation's mirror has nobody to hand a copy to)
    relay.modeSince = user ? (state.takenAt || now()) : (state && state.handedBackAt) || now();
    const more = { ...(extra && extra.interrupted ? { interrupted: extra.interrupted } : {}), ...(extra && Array.isArray(extra.rerun) ? { rerun: extra.rerun.slice(0, 20) } : {}) };
    const wakes = relay.mode === 'takeover' ? wakesOf(relay) : 0; // r6 A-F9: what the Hand back button says it will wake
    for (const v of relay.viewers.values()) send(v.ws, { type: 'mode', mode: relay.mode, holder: relay.holder, mine: relay.holder === v.id, since: relay.modeSince, cause: cause || null, url: (state && state.url) || null, wakes, ...more });
    if (!user) { releaseButtons(relay); relay.fitHeldSaid = false; } // builder r2: nobody drives ⇒ no button is held for the page (and the next takeover says its held size once again)
    // lane S4: the holder's pane rules while somebody drives. builder r2: AT ONCE (no 250 ms debounce) — a mode change is one
    // discrete act, and the resize then lands while the hand is still on the Take over button, not under its first press
    if (relay.fits.size) scheduleFit(relay, 'mode', { delay: 0 });
  }
  function lastUrlOf(relay) {
    try { const u = relay.last.url ? JSON.parse(relay.last.url) : null; if (u && typeof u.url === 'string') return u.url; } catch { /* */ }
    try { const t = relay.last.tabs ? JSON.parse(relay.last.tabs) : null; const act = t && Array.isArray(t.tabs) ? t.tabs.find((x) => x && x.active) : null; if (act && typeof act.url === 'string') return act.url; } catch { /* */ }
    return '';
  }
  /** Take over / hand back — through the keeper when it has the P3 surface,
   *  else relay-local (a stub keeper in the heavy suite). Never throws. */
  /** verify r7 (S2): is a viewer's socket live on ANY relay. A sibling conversation's holder (a browser taken WITH a
   *  primary takeover, or driven from its own view) sits on ANOTHER relay by construction, so a per-relay `viewers.has`
   *  read every such holder as gone and a second view RE-SEIZED a lease of a browser somebody was driving — two holders,
   *  both inputs forwarded to one Chrome, the handback from one view leaving the other's lease paused. Viewer ids are
   *  minted from one counter, so the answer is exact. */
  function viewerAlive(id) { if (id === null || id === undefined) return false; for (const r of relays.values()) if (r.viewers.has(id)) return true; return false; }
  function takeoverFor(relay, viewer) {
    const holderAlive = relay.holder !== null && viewerAlive(relay.holder);
    // BROWSE YOURSELF (B-6ae8): his own tab — the keeper's human verbs (one of HIS windows holds it; no agent is paused)
    if (isHuman(relay)) {
      if (!keeper || typeof keeper.humanTake !== 'function') return { ok: false, code: 'unavailable', error: 'not available' };
      const r = keeper.humanTake({ key: relay.target.key, viewerId: viewer.id, holderAlive });
      if (r.ok && r.already) send(viewer.ws, { type: 'mode', mode: relay.mode, holder: relay.holder, mine: true, since: relay.modeSince, cause: 'takeover', url: null, human: true });
      return r;
    }
    if (keeper && typeof keeper.takeover === 'function') {
      const r = keeper.takeover({ browserKey: relay.browserKey, profileId: relay.target.profileId || null, viewerId: viewer.id, sessionId: relay.sessionId, holderAlive, viewerAlive });
      if (r.ok && !unsubInput) applyInputState(relay, r.state, 'takeover');
      if (r.ok && r.already) send(viewer.ws, { type: 'mode', mode: relay.mode, holder: relay.holder, mine: true, since: relay.modeSince, cause: 'takeover', url: null });
      return r;
    }
    const d = T.decideTakeover({ state: relay.mode === 'takeover' ? { input: 'user', takenAt: relay.modeSince, takenBy: { viewerId: relay.holder, at: relay.modeSince } } : null, viewerId: viewer.id, now: now(), holderAlive });
    if (d.ok) applyInputState(relay, d.state, 'takeover');
    return d;
  }
  /** r6 A-F9: the billed turns an explicit Hand back from this relay would start (the keeper's count; 1 without one). */
  function wakesOf(relay) {
    if (keeper && typeof keeper.handbackWakesFor === 'function') { try { return Number(keeper.handbackWakesFor(relay.browserKey, relay.target.profileId || null)) || 0; } catch { return 1; } }
    return 1;
  }
  function handbackFor(relay, viewerId, cause, expectWakes) {
    const url = lastUrlOf(relay);
    if (isHuman(relay)) { flushActs(relay, true); return keeper && typeof keeper.humanRelease === 'function' ? keeper.humanRelease({ key: relay.target.key, viewerId, cause, url }) : { ok: false, code: 'unavailable', error: 'not available' }; } // BROWSE YOURSELF: his window lets go — he goes away (his tab kept)
    if (keeper && typeof keeper.handback === 'function') {
      const r = keeper.handback({ browserKey: relay.browserKey, profileId: relay.target.profileId || null, viewerId, cause, url, sessionId: relay.sessionId, expectWakes });
      if (r.ok && !unsubInput) applyInputState(relay, r.state, cause);
      return r;
    }
    const d = T.decideHandback({ state: relay.mode === 'takeover' ? { input: 'user', takenAt: relay.modeSince, takenBy: { viewerId: relay.holder, at: relay.modeSince } } : null, viewerId, cause, now: now(), url });
    if (d.ok) applyInputState(relay, d.state, cause);
    return d;
  }

  // ── lane J (inc-muhgv0fb-9i4u): the two sizes a pointer maps through ──
  /** The picture's size off every frame's JPEG and the active tab off every
   *  `tabs` record: a change of either re-reads the page's viewport. */
  function notePicture(relay, msg, cls) {
    if (cls === 'frame') {
      const sz = typeof msg.data === 'string' ? S.jpegSize(msg.data) : null;
      if (sz && (!relay.picture || relay.picture.width !== sz.width || relay.picture.height !== sz.height)) {
        const first = !relay.picture; relay.picture = sz; scheduleViewport(relay, relay.viewport ? 'picture' : 'first-frame');
        if (first) {
          // lane S4: a NEW relay's first picture says whether the size we set still holds — a browser started again (an
          // idle release, a crash) is back at its own default size, and a size we believe applied would never be set again
          const f = fitStateOf(relay); // verify r1: seeded from the keeper's note here, so a stale note is judged by this first picture too
          if (f && f.applied && FIT.fitHonored({ fit: f.applied, picture: sz }) !== 'exact') { f.applied = null; f.failed = null; persistFit(f); }
          // verify r1: the agent's choice (in memory or from the note) that is no longer ON the page — a relaunched browser at its own size — is forgotten, else the view would letterbox forever under "Agent's size"
          if (f && f.agent && f.agent.width && f.agent.height && FIT.fitHonored({ fit: f.agent, picture: sz }) === 'other') { log.log?.(`[browser-live] ${relay.key}: the agent's ${f.agent.width}×${f.agent.height} is no longer on the page (a ${sz.width}×${sz.height} picture) — forgotten`); f.agent = null; persistFit(f); }
          if (relay.fits.size) scheduleFit(relay, 'first-frame', { delay: 1600 }); // a pane reported before the first picture is fitted once the page can be read (or the picture stands in)
        }
      }
      if (relay.fitCheck) checkFit(relay);
      return;
    }
    if (msg.type === 'tabs' && Array.isArray(msg.tabs)) {
      const act = msg.tabs.find((x) => x && x.active);
      const u = act && typeof act.url === 'string' ? act.url : '';
      relay.activeTarget = act && act.targetId ? String(act.targetId) : null; // verify r2: every `tabs` record re-says which tab the user is looking at
      if (relay.mode === 'takeover' && relay.viewers.has(relay.holder) && relay.activeTarget && (!relay.copyWatch || relay.copyWatch.targetId !== relay.activeTarget)) armCopyWatch(relay); // lane live-input: the copy watch follows the tab on show
      if (relay.anchor) { // verify r3: …and the takeover's anchor judges it (an agent's switch while the user drives ⇒ `switched`, inputs refused tab_switched)
        const next = S.takeoverAnchorStep(relay.anchor, { activeTarget: relay.activeTarget, now: now() });
        if (next && next.switched && !relay.anchor.switched) log.log?.(`[browser-live] ${relay.key}: the browser moved to tab ${next.switched.to.slice(0, 8)} while the user drives tab ${String(next.switched.from).slice(0, 8)} — the user's input is refused (tab_switched) until they hand back and take over again`);
        relay.anchor = next;
      }
      if (act && (String(act.tabId || '') + '|' + u) !== relay.activeTab) { const first = !relay.activeTab; relay.activeTab = String(act.tabId || '') + '|' + u; relay.activeUrl = u; if (!first && relay.picture) scheduleViewport(relay, 'tab'); if (!first) noteNavigation(relay, u); }
    }
  }
  /** Ask the keeper for the page's own viewport (CDP layout metrics) — single
   *  flight, a request during a read re-runs once after it — and tell every
   *  viewer (`{type:'viewport'}`; the last good one is replayed to a late
   *  viewer). A failure is said once in the journal and to the viewers; the
   *  view then maps by the picture (frameGeometry's last rung). */
  function scheduleViewport(relay, why) {
    if (!keeper || typeof keeper.viewportFor !== 'function') return;
    if (relay.vp.busy) { relay.vp.again = why; return; }
    relay.vp.busy = true;
    const activeUrl = relay.activeUrl || lastUrlOf(relay); // the ACTIVE TAB's url (the screencast's page), else the last url mirrored
    Promise.resolve().then(() => keeper.viewportFor(relay.target, { activeUrl })).catch((e) => ({ ok: false, error: String(e && e.message) })).then((r) => {
      relay.vp.busy = false;
      if (relays.get(relay.key) !== relay) return;                                  // the relay ended meanwhile
      const rec = r && r.ok
        ? { type: 'viewport', ok: true, clientWidth: Number(r.clientWidth), clientHeight: Number(r.clientHeight), picture: relay.picture, why, at: now() }
        : { type: 'viewport', ok: false, error: String((r && r.error) || 'unreadable'), picture: relay.picture, why, at: now() };
      if (rec.ok) { const firstRead = !relay.viewport; relay.viewport = rec; if (firstRead && relay.fits.size) scheduleFit(relay, 'first-reading', { delay: 0 }); }
      else if (!relay.vp.warned) { relay.vp.warned = true; log.warn?.(`[browser-live] ${relay.key}: the page's viewport could not be read (${rec.error}) — the view maps by the picture`); }
      broadcast(relay, rec);
      if (relay.vp.again) { const w = relay.vp.again; relay.vp.again = null; scheduleViewport(relay, w); }
    });
  }

  // ── lane S4: THE TRAILING FRAME — the gate's refusal is never a viewer's last picture ──
  function fanOutFrame(relay, text, t) {
    for (const v of relay.viewers.values()) {
      if (S.frameGate({ maxFps: v.maxFps, lastFrameAt: v.lastFrameAt, bufferedAmount: v.ws.bufferedAmount }, t, limits)) { send(v.ws, text); v.lastFrameAt = t; v.sent++; v.sentSeq = relay.frameSeq; }
      else { v.dropped++; relay.stats.dropped++; armTrail(relay, v); }
    }
  }
  /** Hand `v` the relay's LATEST frame once its gate opens (its fps gap, or its buffer draining) — unless a newer
   *  frame reached it meanwhile. One timer per viewer; a viewer that closed / a relay that ended is never written. */
  function armTrail(relay, v) {
    if (v.trailTimer || v.sentSeq >= relay.frameSeq) return;
    const wait = S.frameGateWait({ maxFps: v.maxFps, lastFrameAt: v.lastFrameAt, bufferedAmount: v.ws.bufferedAmount }, now(), limits);
    v.trailTimer = setTimeout(() => {
      v.trailTimer = null;
      if (relays.get(relay.key) !== relay || !relay.viewers.has(v.id) || !relay.lastFrame || v.sentSeq >= relay.frameSeq) return;
      const t = now();
      if (S.frameGate({ maxFps: v.maxFps, lastFrameAt: v.lastFrameAt, bufferedAmount: v.ws.bufferedAmount }, t, limits)) { send(v.ws, relay.lastFrame); v.lastFrameAt = t; v.sent++; v.sentSeq = relay.frameSeq; relay.stats.trailed++; }
      else armTrail(relay, v);
    }, wait === null ? RESUME_POLL_MS : Math.max(1, wait));
    if (v.trailTimer.unref) v.trailTimer.unref();
  }

  // ── lane S4: A FRESH FRAME after a navigation the stream sent no picture for ──
  function noteNavigation(relay, url) {
    if (!url || url === relay.lastUrl) { if (url) relay.lastUrl = url; return; }
    const first = !relay.lastUrl;
    relay.lastUrl = url;
    if (first) return; // the page the stream opened on is not a navigation
    relay.navAt = now();
    armFresh(relay);
  }
  function armFresh(relay) {
    if (!keeper || typeof keeper.freshFrameFor !== 'function') return;
    if (relay.freshTimer) clearTimeout(relay.freshTimer);
    relay.freshTimer = setTimeout(() => { relay.freshTimer = null; if (relay.lastUpFrameAt < relay.navAt) captureFresh(relay, 'navigation'); }, FIT.FRESH_FRAME_MS);
    if (relay.freshTimer.unref) relay.freshTimer.unref();
  }
  /** Ask the PAGE for its picture (server-side CDP) and fan it out like an upstream frame (lastFrame, the per-viewer
   *  gate + trail, the taps) — unless the stream's own frame arrived meanwhile. Never throws; one at a time. */
  function captureFresh(relay, why) {
    if (!keeper || typeof keeper.freshFrameFor !== 'function' || relay.freshBusy || !relay.upstream || relay.upstream.readyState !== 1) return;
    relay.freshBusy = true;
    const askedAt = now();
    Promise.resolve().then(() => keeper.freshFrameFor(relay.target, { activeUrl: relay.activeUrl || lastUrlOf(relay) })).catch((e) => ({ ok: false, error: String(e && e.message) })).then((r) => {
      relay.freshBusy = false;
      if (relays.get(relay.key) !== relay) return;
      if (!r || !r.ok) { log.warn?.(`[browser-live] ${relay.key}: a fresh frame could not be taken (${r && r.error}) — the view says it is waiting`); return; }
      if (why === 'navigation' && relay.lastUpFrameAt > askedAt) return; // the stream's own picture came meanwhile
      const sz = S.jpegSize(r.data);
      const rec = { type: 'frame', data: r.data, metadata: { deviceWidth: Number(r.clientWidth) || (sz && sz.width) || 0, deviceHeight: Number(r.clientHeight) || (sz && sz.height) || 0, pageScaleFactor: 1, offsetTop: 0, scrollOffsetX: 0, scrollOffsetY: 0, timestamp: now(), fresh: why } };
      const text = JSON.stringify(rec);
      const t = now();
      notePicture(relay, rec, 'frame');
      relay.frameSeq++; relay.lastUpFrameAt = t; relay.stats.fresh++;
      for (const fn of relay.taps) { try { fn(rec, text, relay); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: tap failed — ${e && e.message}`); } }
      relay.lastFrame = text; relay.stats.frames++;
      fanOutFrame(relay, text, t);
    });
  }

  // ── lane S4: THE PAGE IS THE PANE'S SIZE ──
  function broadcastFit(relay, rec) {
    const text = JSON.stringify({ type: 'fit', at: now(), ...rec });
    relay.lastFit = text;
    broadcast(relay, text);
  }
  /** The page's size before our first fit: its own layout reading restored to the full viewport by the picture's
   *  aspect (lane J's pageViewportFor), else the picture itself. */
  function pageSizeOf(relay) {
    const pic = relay.picture;
    const v = relay.viewport && relay.viewport.ok ? S.pageViewportFor({ clientWidth: relay.viewport.clientWidth, clientHeight: relay.viewport.clientHeight }, pic ? pic.width : 0, pic ? pic.height : 0) : null;
    if (v) return { width: Math.round(v.width), height: Math.round(v.height) };
    return pic ? { width: pic.width, height: pic.height } : null;
  }
  /** The upstream `command`/`result` mirrors: OUR set (dropped, returns true) vs the AGENT's (the flag). */
  function noteViewportCommand(relay, msg, t) {
    if (msg.type !== 'command' && msg.type !== 'result') return false;
    const fs = fitStates.get(relay.key);
    // verify r1 (continuation): `prevOwn` = an earlier set of ours whose mirror had not landed when a newer one began (or
    // when its outcome set it aside for a put-back) — its late mirror is still OURS, never read as the agent's choice
    for (const slot of ['pending', 'prevOwn']) {
      const p = fs && fs[slot];
      if (!p) continue;
      const own = FIT.ownViewportRecord(msg, p, t);
      if (!own.own) continue;
      if (own.learnId) { p.id = own.learnId; p.seq = relay.ordSeq; }
      if (msg.type === 'result' && p.id && msg.id === p.id) {
        p.doneSeq = relay.ordSeq; // 2.369.198: where the daemon's echo of OUR set landed — every frame read before it shows the page BEFORE the set (checkFit)
        fs[slot] = null;
        tapOwnSet(relay, p, msg); // F6: the resize is in the action trace (never a viewer's "Running a command")
        // ownDone: where OUR command sat in the daemon's order (judged after our CLI call returns); a mirror that lands AFTER
        // the return was not in that judgement — it is judged now (never for a put-back: it IS the agent's size)
        if (slot === 'pending') { fs.ownDone = { seq: p.seq, doneSeq: p.doneSeq }; if (!p.inFlight && !p.putBack) lateJudge(relay, fs); }
      }
      relay.stats.own++;
      return true;
    }
    const a = FIT.agentViewportOf(msg);
    if (a) {
      const f = fitStateOf(relay);
      f.agent = { ...a, at: t, seq: relay.ordSeq }; // seq: judged against our own in-flight set's mirror (ownSetOutcome)
      f.applied = null; // the agent owns the size now — nothing of ours to restore
      if (f.restoreTimer) { clearTimeout(f.restoreTimer); f.restoreTimer = null; }
      persistFit(f);
      log.log?.(`[browser-live] ${relay.key}: the agent set the page's ${a.kind === 'device' ? 'device (' + (a.device || '?') + ')' : `viewport (${a.width}×${a.height})`} — the view letterboxes; only a viewer's "Fit to this window" takes it back`);
      broadcastFit(relay, { state: 'agent', width: a.width, height: a.height, device: a.device, viewerId: null, rule: null });
      return false;
    }
    const ds = FIT.deviceSizeOf(msg);
    if (ds) { const f = fitStates.get(relay.key); if (f && f.agent && f.agent.kind === 'device') { Object.assign(f.agent, { width: ds.width, height: ds.height, scale: ds.scale }); persistFit(f); broadcastFit(relay, { state: 'agent', width: ds.width, height: ds.height, device: f.agent.device, viewerId: null, rule: null }); } }
    return false;
  }
  /** builder r2: the driver's buttons, off the records the bridge FORWARDS (a watcher's never reach here) — a press holds
   *  any resize until its release (PURE FIT.buttonStep); the last release lets a held fit run at once. */
  function noteButtons(relay, msg) {
    const was = relay.btnDown.size;
    const next = FIT.buttonStep(relay.btnDown, msg);
    if (!next) return;
    relay.btnDown = next;
    if (!was && next.size) relay.btnDownAt = now();
    if (was && !next.size) releaseButtons(relay);
  }
  function releaseButtons(relay) {
    relay.btnDown = new Set(); relay.btnDownAt = 0;
    if (relay.fitHoldTimer) { clearTimeout(relay.fitHoldTimer); relay.fitHoldTimer = null; }
    if (relay.fitHeld) { const w = relay.fitHeld; relay.fitHeld = null; scheduleFit(relay, w, { delay: 0 }); }
  }
  function scheduleFit(relay, why, { force = false, delay = FIT.FIT_DEBOUNCE_MS } = {}) {
    if (!canFit()) return;
    if (force) relay.fitForce = true;
    if (relay.fitTimer) clearTimeout(relay.fitTimer);
    relay.fitTimer = setTimeout(() => { relay.fitTimer = null; runFit(relay, why); }, delay);
    if (relay.fitTimer.unref) relay.fitTimer.unref();
  }
  async function runFit(relay, why) {
    if (relays.get(relay.key) !== relay || !canFit()) return;
    if (relay.fitBusy) { relay.fitAgain = why; return; }
    const fs = fitStateOf(relay);
    const open = !!(relay.upstream && relay.upstream.readyState === 1);
    if (!fs.baseline && open && relay.picture && (relay.viewport || now() - relay.firstFrameAt >= 1500)) fs.baseline = pageSizeOf(relay);
    const force = relay.fitForce;
    if (force && fs.agent) { log.log?.(`[browser-live] ${relay.key}: a viewer asked to fit the page to its window — the agent's ${fs.agent.width}×${fs.agent.height} is set aside`); fs.agent = null; persistFit(fs); }
    const v = FIT.fitVerdict({ fits: [...relay.fits.values()], holder: relay.holder, mode: relay.mode, agent: fs.agent, applied: fs.applied, baseline: fs.baseline, force, floorW: fs.floorW, ready: open && !!fs.baseline, claim: relay.fitClaim });
    const placeOf = (id) => { const f = relay.fits.get(id); return f && f.place ? { ...f.place } : null; }; // lane live-input: WHERE the ruling window is (the chip's words)
    relay.fitForce = false;
    if (v.act === 'wait') { if (open && relay.picture && !fs.baseline) scheduleFit(relay, why, { delay: 500 }); return; }
    if (v.act === 'letterbox') {
      const last = relay.lastFit ? JSON.parse(relay.lastFit) : null;
      if (!last || last.state !== 'agent') broadcastFit(relay, { state: 'agent', width: v.agent.width, height: v.agent.height, device: v.agent.device || null, viewerId: null, rule: null });
      return;
    }
    if (v.act === 'restore') { armRestore(relay.key); return; }
    if (fs.restoreTimer) { clearTimeout(fs.restoreTimer); fs.restoreTimer = null; }
    if (v.act === 'keep') {
      if (v.why === 'fitted') { const last = relay.lastFit ? JSON.parse(relay.lastFit) : null; if (!last || last.state !== 'fitted' || last.viewerId !== v.viewerId || last.rule !== v.rule) broadcastFit(relay, { state: 'fitted', width: fs.applied.width, height: fs.applied.height, viewerId: v.viewerId, rule: v.rule, drawScale: v.drawScale, floor: fs.floorW > FIT.FIT_MIN_W ? fs.floorW : null, place: placeOf(v.viewerId) }); }
      return;
    }
    // act 'set' — a size that just failed is not asked again for FIT_RETRY_MS (each ask is a CLI spawn: the fork tax)
    if (fs.failed && fs.failed.width === v.width && fs.failed.height === v.height && now() - fs.failed.at < FIT_RETRY_MS) return;
    // builder r2: never under the driver's held button — the resize waits for the release (bounded by FIT_HOLD_MAX_MS)
    if (FIT.fitHoldVerdict({ down: relay.btnDown.size, downAt: relay.btnDownAt, now: now(), maxMs: FIT_HOLD_MAX_MS }) === 'hold') {
      relay.fitHeld = why;
      if (!relay.fitHoldTimer) { relay.fitHoldTimer = setTimeout(() => { relay.fitHoldTimer = null; if (relay.fitHeld) { const w = relay.fitHeld; relay.fitHeld = null; scheduleFit(relay, w, { delay: 0 }); } }, Math.max(0, FIT_HOLD_MAX_MS - (now() - relay.btnDownAt)) + 10); if (relay.fitHoldTimer.unref) relay.fitHoldTimer.unref(); }
      return;
    }
    relay.fitBusy = true;
    beginOwn(fs, { width: v.width, height: v.height });
    let r;
    try { r = await keeper.setViewportFor(relay.target, { width: v.width, height: v.height }); } catch (e) { r = { ok: false, code: 'internal', error: String(e && e.message) }; }
    if (fs.pending) fs.pending.inFlight = false;
    relay.fitBusy = false;
    // verify r1: an AGENT viewport flagged while ours was in flight is judged by the daemon's ORDER — never "fitted" over the agent's page
    const outcome = FIT.ownSetOutcome({ ok: !!(r && r.ok), pending: fs.pending || fs.ownDone, agent: fs.agent });
    if (outcome === 'agent-stands' || outcome === 'agent-overridden') {
      setAsideOwn(fs); fs.failed = null; fs.applied = null; relay.fitCheck = null;
      if (outcome === 'agent-overridden') await reapplyAgent(fs, relay.key, 'the agent set the page\'s size while our fit was in flight and ours landed after it');
      else log.log?.(`[browser-live] ${relay.key}: the agent set the page's size while our fit was in flight — the agent's stands`);
      persistFit(fs);
      if (relays.get(relay.key) === relay && fs.agent) broadcastFit(relay, { state: 'agent', width: fs.agent.width, height: fs.agent.height, device: fs.agent.device || null, viewerId: null, rule: null });
    } else if (outcome === 'fitted') {
      fs.failed = null;
      fs.applied = { width: v.width, height: v.height, viewerId: v.viewerId, rule: v.rule, at: now() };
      relay.fitCheck = { width: v.width, height: v.height, at: now(), frames: 0, own: fs.pending || fs.ownDone || null }; // own: this set's own record — its `doneSeq` says when the daemon echoed it (2.369.198)
      relay.fitWarned = false;
      persistFit(fs);
      if (relays.get(relay.key) === relay) broadcastFit(relay, { state: 'fitted', width: v.width, height: v.height, viewerId: v.viewerId, rule: v.rule, drawScale: v.drawScale, floor: fs.floorW > FIT.FIT_MIN_W ? fs.floorW : null, why, place: placeOf(v.viewerId) });
    } else {
      // builder r2 (the reality verifier's A): a failed set's command mirror may land AFTER the CLI returned (a busy stream) —
      // it is still OURS (`prevOwn`), never the agent's choice (the chip said "Agent's size 1398×835" = our own refused set)
      setAsideOwn(fs);
      // …and a SHARED browser held while somebody drives (the keeper's typed `held_while_driving`) is not a failure to
      // remember: the handback re-fits at once (FIT_RETRY_MS kept the page "could not resize" after the handback)
      const held = !!(r && r.code === 'held_while_driving');
      if (!held) fs.failed = { width: v.width, height: v.height, at: now() };
      if (held) { if (!relay.fitHeldSaid) { relay.fitHeldSaid = true; log.log?.(`[browser-live] ${relay.key}: a shared browser keeps its size while the user drives it — the page is re-fitted at the handback`); } }
      else if (!relay.fitWarned) { relay.fitWarned = true; log.warn?.(`[browser-live] ${relay.key}: the page could not be sized to the pane (${r && (r.code || '')} ${r && r.error}) — the view scales the picture`); }
      const cur = pageSizeOf(relay) || {};
      // the raw error stays in the journal (above); the record carries it for the diagnostics, the view words it by its code
      if (relays.get(relay.key) === relay) broadcastFit(relay, { state: 'unavailable', width: cur.width || 0, height: cur.height || 0, viewerId: null, rule: null, error: String((r && r.error) || 'the size could not be set').slice(0, 200), code: (r && r.code) || null });
    }
    if (relay.fitAgain) { const w = relay.fitAgain; relay.fitAgain = null; scheduleFit(relay, w, { delay: 0 }); }
  }
  /** verify r1 (continuation): a NEW set of ours begins. An earlier one whose result mirror has not landed yet moves to
   *  `prevOwn` (still recognised as ours when it lands); `setAsideOwn` does the same when an outcome ends our set. */
  function beginOwn(fs, p) {
    if (fs.pending) fs.prevOwn = fs.pending;
    fs.pending = { ...p, at: now(), inFlight: true, id: null, seq: null };
    fs.ownDone = null;
    // 2.369.198: the sizes we asked for lately — a later frame AT one of them is that ask's answer arriving late, never a newer fit's (frameJudgeVerdict)
    if (p && p.width && p.height) { fs.asked = [...(fs.asked || []).slice(-7), { width: p.width, height: p.height, at: now() }]; }
  }
  function setAsideOwn(fs) { if (fs.pending) fs.prevOwn = fs.pending; fs.pending = null; }
  /** verify r1 F6: OUR resize landed (its result mirror) — the recorder's taps get ONE `viewer-fit` pair (src/browser-trace.js
   *  traces it as kind 'viewport'), so the trace shows the page reflowing between two agent actions. The viewers never
   *  see it (our mirror is dropped before the fan-out: no "Running a command"). */
  function tapOwnSet(relay, p, res) {
    if (!relay.taps.size) return;
    const id = 'vf-' + String(res.id || relay.ordSeq);
    const params = p.device ? { device: String(p.device) } : { width: Math.round(p.width), height: Math.round(p.height) };
    params.why = p.putBack ? 'put-back' : (p.why || 'fit');
    for (const m of [{ type: 'command', action: 'viewer-fit', id, params, timestamp: 0 }, { type: 'result', action: 'viewer-fit', id, success: true, data: { ...params }, timestamp: 0 }]) {
      for (const fn of relay.taps) { try { fn(m, null, relay); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: tap failed — ${e && e.message}`); } }
    }
  }
  /** verify r1 (continuation): our set's result mirror landed AFTER its CLI call returned — the return saw no agent choice
   *  and said "fitted" / "restored". The order is judged now: an agent choice mirrored BEFORE ours was overridden by ours
   *  ⇒ it is put back (the same rule as at the return; a put-back itself is never judged — it is the agent's size). */
  function lateJudge(relay, fs) {
    if (FIT.ownSetOutcome({ ok: true, pending: fs.ownDone, agent: fs.agent }) !== 'agent-overridden') return;
    fs.applied = null; relay.fitCheck = null;
    reapplyAgent(fs, relay.key, 'the agent set the page\'s size before ours in the daemon\'s order (both mirrors landed after our call returned)').then(() => {
      persistFit(fs);
      if (relays.get(relay.key) === relay && fs.agent) broadcastFit(relay, { state: 'agent', width: fs.agent.width, height: fs.agent.height, device: fs.agent.device || null, viewerId: null, rule: null });
    }).catch((e) => log.warn?.(`[browser-live] ${relay.key}: the late order judgement failed — ${e && e.message}`));
  }
  /** verify r1: OUR set landed after the agent's own (the daemon's order says so) — put the agent's choice back (its
   *  factor, or its device by name); the mirror of this set is ours (`pending` names it, `putBack`), the agent flag stays. */
  async function reapplyAgent(fs, key, why) {
    const args = FIT.agentSetArgs(fs.agent);
    if (!args || !canFit()) return;
    log.log?.(`[browser-live] ${key}: ${why} — putting the agent's ${args.device ? 'device "' + args.device + '"' : args.width + '×' + args.height + (args.scale > 1 ? ' @' + args.scale : '')} back`);
    beginOwn(fs, { ...args, putBack: true });
    let r; try { r = await keeper.setViewportFor(fs.target, args); } catch (e) { r = { ok: false, error: String(e && e.message) }; }
    if (fs.pending) fs.pending.inFlight = false;
    if (!(r && r.ok)) { setAsideOwn(fs); log.warn?.(`[browser-live] ${key}: the agent's own size could not be put back (${r && (r.code || '')} ${r && r.error})`); } // builder r2: its late mirror is still ours
  }
  /** Nobody visible: after RESTORE_AFTER_MS (a reload, a tab switch, a desktop flip come back first) the page goes
   *  back to the size it had before our first fit — never over the agent's own choice, never a browser started. */
  function armRestore(key) {
    const fs = fitStates.get(key);
    if (!fs || !fs.applied || fs.agent || !fs.baseline || fs.restoreTimer || !canFit()) return;
    fs.restoreTimer = setTimeout(async () => {
      fs.restoreTimer = null;
      const relay = relays.get(key);
      if (relay && FIT.fitTarget({ fits: [...relay.fits.values()], holder: relay.holder, mode: relay.mode, claim: relay.fitClaim })) return; // somebody is back
      if (!fs.applied || fs.agent || !fs.baseline) return;
      // verify r1: never under the agent's feet — a KNOWN running turn keeps the size until the turn ends (re-asked every grace; a
      // terminal-mode session publishes no turn and restores on the clock as before)
      const turn = turnOfSession(fs.sessionId);
      if (FIT.restoreDeferred(turn)) { if (!fs.restoreDeferredSaid) { fs.restoreDeferredSaid = true; log.log?.(`[browser-live] ${key}: nobody watches, but the conversation is mid-turn (${turn}) — the page keeps its ${fs.applied.width}×${fs.applied.height} until the turn ends`); } armRestore(key); return; }
      fs.restoreDeferredSaid = false;
      const b = fs.baseline;
      beginOwn(fs, { width: b.width, height: b.height, why: 'restore' });
      let r; try { r = await keeper.setViewportFor(fs.target, { width: b.width, height: b.height }); } catch (e) { r = { ok: false, error: String(e && e.message) }; }
      if (fs.pending) fs.pending.inFlight = false;
      const outcome = FIT.ownSetOutcome({ ok: !!(r && r.ok), pending: fs.pending || fs.ownDone, agent: fs.agent });
      fs.applied = null;
      if (outcome === 'agent-overridden') { setAsideOwn(fs); await reapplyAgent(fs, key, 'the agent set the page\'s size while the restore was in flight and the restore landed after it'); }
      else if (outcome === 'agent-stands') setAsideOwn(fs);
      persistFit(fs);
      if (outcome === 'fitted') { log.log?.(`[browser-live] ${key}: nobody watches — the page is back to its own ${b.width}×${b.height}`); const rl = relays.get(key); if (rl) broadcastFit(rl, { state: 'restored', width: b.width, height: b.height, viewerId: null, rule: null }); }
    }, FIT.RESTORE_AFTER_MS);
    if (fs.restoreTimer.unref) fs.restoreTimer.unref();
  }
  /** A picture after our fit: the width held but the height came back smaller = a HEADED window narrower than it can
   *  be (measured on 0.38.1) ⇒ re-fit at its floor, the pane's aspect kept. */
  function checkFit(relay) {
    const c = relay.fitCheck;
    if (!c || !relay.picture) return;
    // 2.369.198 (the .197 heavy red): is this picture THIS fit's answer? An earlier fit's frame arriving late (its size one
    // we asked for) or a frame read before the daemon echoed this set shows the page BEFORE the set — on the loaded gate
    // machine it read as "a headed window that cannot be 390 px wide" and re-fitted a phone's HEADLESS page at 500 px.
    const jv = FIT.frameJudgeVerdict({ fit: c, picture: relay.picture, asked: fitStateOf(relay).asked || [], mirrored: !!(c.own && c.own.doneSeq != null), ageMs: now() - c.at, now: now() });
    if (jv === 'stale-own') {
      if (!c.staleSaid) { c.staleSaid = true; log.log?.(`[browser-live] ${relay.key}: a ${relay.picture.width}×${relay.picture.height} picture after the ${c.width}×${c.height} fit is an earlier fit's frame arriving late — not this fit's answer`); }
      return;
    }
    if (jv === 'unmirrored') return;
    const h = FIT.fitHonored({ fit: c, picture: relay.picture });
    c.frames++;
    if (h === 'exact') { relay.fitCheck = null; return; }
    if (h === 'scaled') {
      relay.fitCheck = null;
      const fs = fitStateOf(relay);
      if (fs.floorW < FIT.HEADED_MIN_W) { fs.floorW = FIT.HEADED_MIN_W; fs.applied = null; persistFit(fs); log.log?.(`[browser-live] ${relay.key}: the browser cannot be ${c.width} px wide (a ${relay.picture.width}×${relay.picture.height} picture came back) — re-fitting at ${FIT.HEADED_MIN_W} px`); scheduleFit(relay, 'headed-floor', { delay: 0 }); }
      return;
    }
    // verify r1 LOW 8: a picture that is neither our size nor its headed-floor scaling once the page has had its time (6 frames
    // AND 1.5 s — a busy stream's first frames may predate the set — or 5 s) ⇒ the bridge stops believing a size the page does
    // not have: said once as `unavailable`, not re-asked for FIT_RETRY_MS (never over the agent's own choice)
    if ((c.frames >= 6 && now() - c.at >= 1500) || now() - c.at > 5000) {
      relay.fitCheck = null;
      const fs = fitStates.get(relay.key);
      if (h === 'other' && fs && fs.applied && !fs.agent && fs.applied.width === c.width && fs.applied.height === c.height) {
        const pic = relay.picture;
        fs.applied = null; fs.failed = { width: c.width, height: c.height, at: now() }; persistFit(fs);
        log.warn?.(`[browser-live] ${relay.key}: the page did not take ${c.width}×${c.height} (a ${pic.width}×${pic.height} picture came back) — the view scales the picture`);
        broadcastFit(relay, { state: 'unavailable', width: pic.width, height: pic.height, viewerId: null, rule: null, error: `the page did not take the size (a ${pic.width}×${pic.height} picture came back)`, code: 'viewport_not_taken' });
      }
    }
  }

  function applyBackpressure(relay) {
    if (relay.paused || !relay.upstream) return;
    const v = S.backpressureVerdict([...relay.viewers.values()].map((x) => x.ws.bufferedAmount), false, limits);
    if (!v.pause) return;
    try { relay.upstream.pause(); } catch { return; }
    relay.paused = true;
    relay.resumePoll = setInterval(() => {
      if (!relay.upstream) { stopResumePoll(relay); return; }
      const w = S.backpressureVerdict([...relay.viewers.values()].map((x) => x.ws.bufferedAmount), true, limits);
      if (w.resume) { stopResumePoll(relay); try { relay.upstream.resume(); } catch { /* closing */ } }
    }, RESUME_POLL_MS);
    if (relay.resumePoll.unref) relay.resumePoll.unref();
  }
  function stopResumePoll(relay) { if (relay.resumePoll) clearInterval(relay.resumePoll); relay.resumePoll = null; relay.paused = false; }

  // ── lane browser-resume C (§3.9, the owner's ruling 3): THE TAB ROW — whose each tab is, and the user's switch / ✕ ──
  const OWNERS_DEBOUNCE_MS = 250;
  /** After a `tabs` record (debounced): the keeper judges whose each tab is (ONE CDP read for a shared profile) → ONE
   *  `tab-owners` record to every viewer, kept for a late one. Single flight; a record meanwhile re-asks once. */
  function scheduleOwners(relay, delay = OWNERS_DEBOUNCE_MS) {
    if (!keeper || typeof keeper.tabOwnersFor !== 'function') return;
    if (relay.ownersBusy) { relay.ownersAgain = true; return; }
    if (relay.ownersTimer) clearTimeout(relay.ownersTimer);
    relay.ownersTimer = setTimeout(() => { relay.ownersTimer = null; judgeOwners(relay).catch((e) => log.warn?.(`[browser-live] ${relay.key}: the tab owners could not be judged — ${e && e.message}`)); }, delay);
  }
  async function judgeOwners(relay) {
    if (relays.get(relay.key) !== relay) return;
    relay.ownersBusy = true;
    try {
      let tabs = [];
      try { const t = relay.last.tabs ? JSON.parse(relay.last.tabs) : null; tabs = t && Array.isArray(t.tabs) ? t.tabs : []; } catch { tabs = []; }
      const r = await keeper.tabOwnersFor(relay.target, { activeTarget: relay.activeTarget });
      if (relays.get(relay.key) !== relay || !r || !r.ok) return;
      const owners = {};
      if (r.all) { for (const x of tabs) if (x && /^[0-9A-Fa-f]{32}$/.test(String(x.targetId || ''))) owners[String(x.targetId).toUpperCase()] = r.all; }
      else Object.assign(owners, r.owners || {});
      const text = JSON.stringify({ type: 'tab-owners', owners, mediated: !!r.mediated, adoptable: !!r.adoptable });
      if (text === relay.lastOwners) return;
      relay.lastOwners = text;
      for (const v of relay.viewers.values()) send(v.ws, text);
    } finally {
      relay.ownersBusy = false;
      if (relay.ownersAgain) { relay.ownersAgain = false; scheduleOwners(relay); }
    }
  }
  /** The user's switch / ✕ on a tab row → the keeper (it re-reads every fact: the tab's owner, whether THIS viewer holds the
   *  takeover, the counts) → ONE typed `tab-ack`. A switch the user made moves the takeover's ANCHOR with it (his own act,
   *  never the `tab_switched` refusal an agent's switch earns). */
  function tabActFor(relay, viewer, v) {
    const ack = (o) => send(viewer.ws, { type: 'tab-ack', rid: v.rid, act: v.act, targetId: v.targetId, ...o });
    if (!keeper || typeof keeper.userTabAct !== 'function') { ack({ ok: false, code: 'unavailable', error: 'tab acts are not available on this server' }); return; }
    Promise.resolve().then(() => keeper.userTabAct({ target: relay.target, viewerId: viewer.id, act: v.act, targetId: v.targetId }))
      .then((r) => {
        if (r && r.switchedTo && relay.anchor && relays.get(relay.key) === relay) relay.anchor = S.takeoverAnchor(r.switchedTo, now());
        ack({ ok: true, switchedTo: (r && r.switchedTo) || null, ...(r && r.noop ? { noop: true } : {}) });
        scheduleOwners(relay, 0);
      })
      .catch((e) => ack({ ok: false, code: (e && e.code) || 'internal', error: String((e && e.message) || e) }));
  }
  function onViewerMessage(relay, viewer, d) {
    let msg = null; try { msg = JSON.parse(typeof d === 'string' ? d : d.toString()); } catch { send(viewer.ws, { type: 'refused', code: 'bad-message', error: 'not JSON' }); return; }
    if (msg && msg.type === 'dialog-answer') { answerDialog(relay, viewer, msg); return; } // lane browser-stuck: the user's Accept / Dismiss on a page dialog (any viewer — the user's own chrome, not a forwarded page input)
    const v = S.viewerMessageVerdict(msg, { holder: relay.holder, viewerId: viewer.id, mode: relay.mode });
    if (v.kind === 'config') { if (v.maxFps !== undefined) { viewer.maxFps = v.maxFps; pushMaxFps(relay); armTrail(relay, viewer); } send(viewer.ws, { type: 'config-ack', maxFps: viewer.maxFps, upstreamMaxFps: relay.upstreamMaxFps }); return; } // lane S4: a viewer back from 2 fps (a hidden tab) catches up on the latest frame
    // lane S4: the view verbs — a pane report (the page follows the ruling pane) and "send me a fresh picture"
    if (v.kind === 'fit') {
      const rep = FIT.fitReport(msg);
      if (!rep) { send(viewer.ws, { type: 'refused', code: 'bad-message', error: 'a fit report carries a positive width and height' }); return; }
      relay.fits.set(viewer.id, { viewerId: viewer.id, width: rep.width, height: rep.height, dpr: rep.dpr, visible: rep.visible, place: rep.place || null, at: now() });
      // lane live-input: "Fit here" = this view CLAIMS the page's size (the latest claim wins; hiding or leaving ends it)
      if (rep.claim && rep.visible) relay.fitClaim = viewer.id;
      else if (!rep.visible && relay.fitClaim === viewer.id) relay.fitClaim = null;
      scheduleFit(relay, rep.force ? 'force' : rep.claim ? 'claim' : 'report', { force: rep.force });
      return;
    }
    if (v.kind === 'refresh') {
      if (viewer.sentSeq < relay.frameSeq && relay.lastFrame) { send(viewer.ws, relay.lastFrame); viewer.lastFrameAt = now(); viewer.sent++; viewer.sentSeq = relay.frameSeq; }
      if (now() - relay.lastRefreshAt >= FIT.REFRESH_EVERY_MS) { relay.lastRefreshAt = now(); captureFresh(relay, 'refresh'); }
      return;
    }
    if (v.kind === 'ack') return;
    if (v.kind === 'ping') { send(viewer.ws, { type: 'pong', at: now() }); return; }
    if (v.kind === 'tab-act') { if (v.refusal) send(viewer.ws, v.refusal); else tabActFor(relay, viewer, v); return; } // lane browser-resume C: the tab row's switch / ✕
    if (v.kind === 'input') {
      // lane S2 (naive study 2 T4): a record carrying `rid` is ANSWERED — an input-receipt from the browser's own
      // reply (a mediated lease: the credit minted here BEFORE the forward is what lets the user's own input past the
      // mediator's paused fence), or from the stream server's write (a direct lease), or the refusal. Never silence.
      const rid = Number.isInteger(msg.rid) ? msg.rid : null;
      const receipt = (r) => { if (rid !== null) send(viewer.ws, { type: 'input-receipt', rid, ok: !!r.ok, via: r.via || null, code: r.code || null, error: r.error || null, ...(Number.isFinite(r.landed) ? { landed: r.landed } : {}), ...(r.dropped ? { dropped: r.dropped } : {}) }); }; // lane live-input: a text act says how much landed (and a line break it could not type)
      if (v.forward && relay.anchor && relay.anchor.switched) { receipt(S.tabSwitchedReceipt(relay.anchor)); return; } // verify r3: the takeover is on another tab than the one on show — nothing forwarded, said by name
      if (v.forward && relay.upstream && relay.upstream.readyState === 1) {
        // lane live-input: every input of the holder goes through ONE ordered pipeline — a text act is cut into the
        // `char` records the browser accepts (S.textRecords, ≤ 3 UTF-16 units each) and its chunks keep their place
        // among the keys and clicks around them; ONE receipt answers the whole act
        if (v.text) enqueueText(relay, msg.text, receipt);
        else { noteButtons(relay, msg); relay.inq.push({ kind: 'rec', record: S.withoutRid(msg), receipt }); pumpInput(relay); } // what goes upstream — and what the credit is bound to (lane S2 verify)
        if (isHuman(relay)) noteActs(relay, S.withoutRid(msg)); // BROWSE YOURSELF: his input becomes ACTS on the recorder's taps (never the text)
        const t = now();
        if (t - relay.lastInputNoteAt >= INPUT_NOTE_MS) { relay.lastInputNoteAt = t; try { if (isHuman(relay)) keeper?.noteHumanInput?.(relay.target.key, t); else keeper?.noteUserInput?.(relay.browserKey, relay.target.profileId || null, t); } catch { /* optional */ } }
      } else {
        const r = v.refusal || { type: 'refused', code: 'watch-mode', error: 'no upstream' }; // (the pre-S2 shape: the view does not toast a per-key refusal — the receipt below says it once in the bar)
        send(viewer.ws, r);
        receipt({ ok: false, code: v.forward ? 'no-upstream' : (r.code || 'watch-mode'), error: v.forward ? 'the browser stream is not connected' : r.error });
      }
      return;
    }
    // P3 (§4.3): the control verbs
    if (v.kind === 'takeover') {
      const r = takeoverFor(relay, viewer);
      if (r.ok) scheduleViewport(relay, 'takeover'); // lane J: the page is re-read the moment input starts to matter (a window resized in the same proportions keeps its picture size)
      if (!r.ok) send(viewer.ws, { type: 'refused', code: r.code || 'held', error: r.error || 'refused', holder: r.holder ? r.holder.viewerId : relay.holder, mode: relay.mode });
      else send(viewer.ws, { type: 'mode-ack', ok: true, mode: relay.mode, mine: relay.holder === viewer.id, already: !!r.already });
      return;
    }
    if (v.kind === 'handback') {
      const r = handbackFor(relay, viewer.id, 'explicit', v.expectWakes);
      if (!r.ok) send(viewer.ws, { type: 'refused', code: r.code || 'not_taken', error: r.error || 'refused', mode: relay.mode, ...(Number.isInteger(r.wakes) ? { wakes: r.wakes } : {}) }); // r6 A-F9: wake_count_changed carries the count now
      else send(viewer.ws, { type: 'mode-ack', ok: true, mode: relay.mode, mine: false, heldMs: r.heldMs || 0 });
      return;
    }
    // lane P verify (finding 3): a FOLD-BACK of the window the user drives — the holder hands its controls to
    // another view of THIS relay (same session, same browser); the closing view then hands nothing back
    // BROWSE YOURSELF (B-6ae8, the owner 6): "Continue here" — THIS window of his takes his tab's controls from his other
    // live window (the receiver-initiated pass: one holder always); nobody holding them ⇒ a plain take. His windows only.
    if (v.kind === 'claim') {
      if (!isHuman(relay) || !keeper || typeof keeper.humanPass !== 'function') { send(viewer.ws, { type: 'refused', code: 'not_yours', error: 'only a browsing window of yours can take its controls here', mode: relay.mode }); return; }
      const r = relay.holder !== null && relay.holder !== viewer.id && relay.viewers.has(relay.holder) ? keeper.humanPass({ key: relay.target.key, from: relay.holder, to: viewer.id }) : keeper.humanTake({ key: relay.target.key, viewerId: viewer.id, holderAlive: false });
      if (!r.ok) send(viewer.ws, { type: 'refused', code: r.code || 'refused', error: r.error || 'refused', mode: relay.mode });
      else send(viewer.ws, { type: 'mode-ack', ok: true, mode: relay.mode, mine: relay.holder === viewer.id });
      return;
    }
    if (v.kind === 'pass') {
      if (relay.holder !== viewer.id) { send(viewer.ws, { type: 'refused', code: 'not_holder', error: 'only the view that is driving can pass the controls on', mode: relay.mode }); return; }
      if (v.to === null || v.to === viewer.id || !relay.viewers.has(v.to)) { send(viewer.ws, { type: 'refused', code: 'no_such_viewer', error: 'the controls pass only to another view of this same browser', mode: relay.mode }); return; }
      let r = null;
      if (isHuman(relay) && keeper && typeof keeper.humanPass === 'function') { r = keeper.humanPass({ key: relay.target.key, from: viewer.id, to: v.to }); }
      else if (keeper && typeof keeper.passControl === 'function') { r = keeper.passControl({ browserKey: relay.browserKey, profileId: relay.target.profileId || null, from: viewer.id, to: v.to, sessionId: relay.sessionId }); if (r.ok && !unsubInput) applyInputState(relay, r.state, 'pass'); }
      else { r = T.decidePass({ state: relay.mode === 'takeover' ? { input: 'user', takenAt: relay.modeSince, takenBy: { viewerId: relay.holder, at: relay.modeSince } } : null, from: viewer.id, to: v.to, now: now() }); if (r.ok) applyInputState(relay, r.state, 'pass'); }
      if (!r.ok) send(viewer.ws, { type: 'refused', code: r.code || 'refused', error: r.error || 'refused', mode: relay.mode });
      else send(viewer.ws, { type: 'mode-ack', ok: true, mode: relay.mode, mine: false, passedTo: v.to });
      return;
    }
    if (v.kind === 'confirm') {
      if (!keeper || typeof keeper.answerConfirmation !== 'function') { send(viewer.ws, { type: 'confirmation-ack', ok: false, id: v.id, decision: v.decision, code: 'unavailable', error: 'confirmations are not available on this server' }); return; }
      keeper.answerConfirmation({ browserKey: relay.browserKey, profileId: relay.target.profileId || null, id: v.id, decision: v.decision, envPairs: relay.envPairs, shown: v.shown })
        .then((r) => { send(viewer.ws, { type: 'confirmation-ack', ok: !!r.ok, id: v.id, decision: v.decision, code: r.ok ? null : (r.code || 'refused'), error: r.ok ? null : (r.error || 'refused') }); if (r.ok && !unsubConfirm) broadcast(relay, { type: 'confirmation-resolved', id: v.id, decision: v.decision }); })
        .catch((e) => send(viewer.ws, { type: 'confirmation-ack', ok: false, id: v.id, decision: v.decision, code: 'internal', error: String(e && e.message) }));
      return;
    }
    send(viewer.ws, v.refusal);
  }
  // ── lane live-input: THE HOLDER'S INPUT PIPELINE ──
  /** One text act (a paste, an IME commit): its chunks queue as ONE item; its receipt says how much landed. */
  function enqueueText(relay, text, receipt) {
    const r = S.textRecords(text);
    if (!r.ok) { receipt({ ok: false, code: r.code, error: r.error }); return; }
    relay.stats.textActs++;
    relay.inq.push({ kind: 'text', records: r.records, idx: 0, receipt, settled: 0, failed: false, landed: 0, dropped: r.dropped || 0, via: null });
    pumpInput(relay);
  }
  /** Forward what the window allows, in order: a direct lease forwards everything at once (the daemon keeps the order);
   *  a mediated one keeps ≤ `inputWindow` records waiting on their credit (the mediator's queue and credit life). */
  function pumpInput(relay) {
    while (relay.inq.length) {
      const it = relay.inq[0];
      if (!relay.upstream || relay.upstream.readyState !== 1) { failQueued(relay, 'upstream_gone', 'the browser stream closed'); return; }
      if (relay.inflight >= inputWindow) return; // a settling credit pumps again
      if (it.kind === 'rec') { relay.inq.shift(); forwardInput(relay, it.record, it.receipt); continue; }
      if (it.failed) { relay.inq.shift(); continue; }
      const rec = it.records[it.idx++];
      if (it.idx >= it.records.length) relay.inq.shift();
      relay.stats.textChunks++;
      forwardInput(relay, rec, (res) => settleTextChunk(it, rec, res));
    }
  }
  function settleTextChunk(it, rec, res) {
    if (it.failed) return;
    if (res && res.ok) {
      it.settled++; it.landed += Array.from(rec.text || '').length; it.via = res.via || it.via;
      if (it.settled === it.records.length) it.receipt({ ok: true, via: it.via, landed: it.landed, dropped: it.dropped });
      return;
    }
    it.failed = true; // the rest of this act is not typed after a hole (a half paste is said, never finished around a gap)
    it.receipt({ ...(res || {}), ok: false, code: (res && res.code) || 'refused', landed: it.landed });
  }
  function failQueued(relay, code, error) {
    for (const it of relay.inq.splice(0)) { if (it.kind === 'rec') it.receipt({ ok: false, code, error }); else if (!it.failed) { it.failed = true; it.receipt({ ok: false, code, error, landed: it.landed }); } }
  }
  /** One record upstream: its credit first (a mediated lease — the user's own input passes the paused fence on it), then
   *  the write; `done(receipt)` = the browser's own reply (mediated) or the stream write (direct). */
  function forwardInput(relay, record, done) {
    relay.copyArm = T.armCopyGesture(relay.copyArm, record, now()); // verify: the holder's copy / cut chord (or a press) is the ONE door a page's copy may leave by
    let credit = null;
    try { credit = keeper && typeof keeper.creditUserInput === 'function' ? keeper.creditUserInput(relay.target, record, { targetId: relay.activeTarget || null }) : null; } catch (e) { credit = null; log.warn?.(`[browser-live] ${relay.key}: input credit failed — ${e && e.message}`); } // verify r2: the credit names the tab the user is looking at
    const mediated = !!(credit && typeof credit.then === 'function');
    if (mediated) relay.inflight++;
    const settle = (r) => { if (mediated) { relay.inflight = Math.max(0, relay.inflight - 1); } try { done(r); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: input receipt failed — ${e && e.message}`); } if (mediated && relays.get(relay.key) === relay) pumpInput(relay); };
    const up = relay.upstream;
    try {
      up.send(JSON.stringify(record), (err) => {
        if (err) { settle({ ok: false, code: 'upstream_gone', error: String(err && err.message || err) }); return; }
        if (mediated) credit.then((r) => settle({ ...r, via: 'browser' }), (e) => settle({ ok: false, code: 'no_reply', error: String(e && e.message) }));
        else settle({ ok: true, via: 'stream' });
      });
    } catch (e) { settle({ ok: false, code: 'upstream_gone', error: String(e && e.message) }); }
  }
  // ── BROWSE YOURSELF (B-6ae8, the owner 3): the user's own acts, recorded like an agent's ──
  /** His forwarded input → ACTS (PURE humanActStep: a click, a drag, a key chord, a typing burst as a LENGTH, a scroll) →
   *  a synthetic `command` + `result` pair on the relay's TAPS only (the recorder; never a viewer, never an agent's card).
   *  Nothing is built while no tap listens (the profile's "Also record my own actions" off, or the trace off). */
  function noteActs(relay, record) {
    if (!relay.taps.size) { relay.acts = null; return; }
    const st = HM.humanActStep(relay.acts, record, now());
    relay.acts = st.state;
    for (const a of st.acts) emitAct(relay, a);
    armActFlush(relay);
  }
  function flushActs(relay, force = false) {
    if (!relay.acts) return;
    const st = HM.humanActFlush(relay.acts, now(), { force });
    relay.acts = st.state;
    if (relay.taps.size) for (const a of st.acts) emitAct(relay, a);
    armActFlush(relay);
  }
  function armActFlush(relay) {
    if (relay.actTimer) { clearTimeout(relay.actTimer); relay.actTimer = null; }
    const due = relay.acts ? HM.humanActDueIn(relay.acts, now()) : null;
    if (due === null) return;
    relay.actTimer = setTimeout(() => { relay.actTimer = null; if (relays.get(relay.key) === relay) flushActs(relay); }, Math.max(5, due + 5));
    if (relay.actTimer.unref) relay.actTimer.unref();
  }
  function emitAct(relay, a) {
    const id = 'hu-act-' + (++relay.actSeq);
    const t = now();
    const cmd = { type: 'command', action: a.action, id, params: { ...a.params }, timestamp: t, holder: 'user' };
    const res = { type: 'result', action: a.action, id, success: true, data: {}, timestamp: t, holder: 'user' };
    for (const m of [cmd, res]) for (const fn of relay.taps) { try { fn(m, null, relay); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: tap failed — ${e && e.message}`); } }
  }
  // ── lane live-input: COPY OUT — the page's own copies, while somebody drives, to the holder ──
  function armCopyWatch(relay) {
    if (!keeper || typeof keeper.watchCopiesFor !== 'function' || relay.mode !== 'takeover') return;
    const want = relay.activeTarget || null;
    if (relay.copyWatch && relay.copyWatch.targetId === want) return;
    disarmCopyWatch(relay);
    const w = { targetId: want, close: null, armed: false, error: null };
    relay.copyWatch = w;
    // an ARMED watch that ends (its tab closed, the browser restarted) is armed again once, on the tab then on show; a watch
    // that could not arm is said once below and left (never a retry storm) — a tab change arms again
    const onEnd = () => { if (relay.copyWatch !== w || !w.armed) return; relay.copyWatch = null; if (relay.mode === 'takeover' && relays.get(relay.key) === relay) setTimeout(() => { if (relay.mode === 'takeover' && !relay.copyWatch && relays.get(relay.key) === relay) armCopyWatch(relay); }, 500); };
    Promise.resolve().then(() => keeper.watchCopiesFor(relay.target, { targetId: want, activeUrl: relay.activeUrl || lastUrlOf(relay), onCopy: (c) => deliverCopy(relay, w, c), onEnd }))
      .catch((e) => ({ ok: false, error: String(e && e.message) }))
      .then((r) => {
        if (relay.copyWatch !== w || relay.mode !== 'takeover' || relays.get(relay.key) !== relay) { if (r && r.ok && r.close) r.close(); return; }
        if (r && r.ok) { w.close = r.close; w.armed = true; w.targetId = r.targetId || want; }
        else { w.error = (r && r.error) || 'unavailable'; log.warn?.(`[browser-live] ${relay.key}: copying out of the page is not available (${w.error}) — a copy in the page stays in the page`); }
      });
  }
  function disarmCopyWatch(relay) { const w = relay.copyWatch; relay.copyWatch = null; relay.copyArm = null; if (w && w.close) { try { w.close(); } catch { /* closing */ } } }
  /** The page copied: the TEXT goes to the viewer who drives — nobody else, never a log line — and ONLY on the holder's own
   *  gesture the bridge forwarded (verify, 2026-09-27: a page's synthetic copy on a timer, or one the agent planted, wrote
   *  the driving user's clipboard with nothing pressed): PURE T.copyDeliverVerdict — a chord / a press arms ONE delivery
   *  for COPY_GESTURE_MS; no arm ⇒ dropped here, counted, nothing leaves the server. The record names its `gesture`. */
  function deliverCopy(relay, w, c) {
    if (relay.copyWatch !== w || relay.mode !== 'takeover' || relay.holder === null) return;
    const t = now();
    if (relay.lastCopy && relay.lastCopy.text === c.text && relay.lastCopy.kind === c.kind && t - relay.lastCopy.at < COPY_DEDUP_MS) return;
    relay.lastCopy = { text: c.text, kind: c.kind, at: t };
    const g = T.copyDeliverVerdict(relay.copyArm, t);
    relay.copyArm = g.arm;
    if (!g.deliver) { relay.stats.copiesDropped++; return; }
    relay.stats.copies++;
    const v = relay.viewers.get(relay.holder);
    if (v) send(v.ws, { type: 'clipboard', kind: c.kind, gesture: g.gesture, text: c.text, length: c.length, truncated: c.length > c.text.length, at: t });
  }
  function pushMaxFps(relay, force = false) {
    // P5: with no viewer the recorder's taps hold the relay at TAP_FPS
    const m = relay.viewers.size ? S.maxFpsAcross([...relay.viewers.values()]) : (relay.taps.size ? TAP_FPS : S.maxFpsAcross([]));
    if (!force && m === relay.upstreamMaxFps) return;
    relay.upstreamMaxFps = m;
    if (relay.upstream && relay.upstream.readyState === 1) { try { relay.upstream.send(JSON.stringify({ type: 'config', maxFps: m })); } catch { /* closing */ } }
  }
  function broadcastViewers(relay) { broadcast(relay, { type: 'viewers', n: relay.viewers.size }); }
  function dropViewer(relay, viewer) {
    if (!relay.viewers.delete(viewer.id)) return;
    if (viewer.trailTimer) { clearTimeout(viewer.trailTimer); viewer.trailTimer = null; }
    if (relay.fitClaim === viewer.id) relay.fitClaim = null; // lane live-input: a claim leaves with its view
    if (relay.fits.delete(viewer.id)) scheduleFit(relay, 'viewer-left'); // lane S4: the next pane rules (or nobody: the restore clock)
    noteViewers(relay);
    // P3: the holder's window closed ⇒ the controls go back to the agent
    // (`viewer-left`: zero-spend unless browser.announceIdleHandback says so).
    if (relay.holder === viewer.id) { try { handbackFor(relay, viewer.id, 'viewer-left'); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: handback on viewer-left failed — ${e && e.message}`); } }
    if (!relay.viewers.size && !relay.taps.size) { endRelay(relay); return; }
    broadcastViewers(relay);
    pushMaxFps(relay);
  }
  // ── P5 (§4.5): server-side taps ──
  /**
   * Subscribe a server-side listener to the upstream of ONE (session, target):
   * `fn(msg, text, relay)` for every record (frames too), `fn({type:'tap-end'})`
   * when the relay ends. Creates the relay (and its upstream) when none exists;
   * a target that cannot be resolved is a typed `{ok:false, code, error}`.
   * Returns `{ok:true, key, untap}`. The recorder is the only caller.
   */
  async function tap(sessionId, profileRef, fn) {
    const f = sessionFacts(sessionId);
    if (!f) return { ok: false, code: 'not-found', error: `no such live session ${JSON.stringify(sessionId)}` };
    if (f.host) return { ok: false, code: 'unsupported-host', error: `session ${sessionId} runs on host ${JSON.stringify(f.host)} — its stream is not bridged` };
    let set = null, profiles = [];
    if (keeper) { try { set = keeper.setFor(f.browserKey); profiles = keeper.list().profiles; } catch (e) { return { ok: false, code: 'unavailable', error: `keeper unreadable: ${e && e.message}` }; } }
    // naive study 2 (finding 4): a sub-agent's browser is tapped under ITS OWN pairs, which only the keeper holds
    const ck = S.childKeyOfRef(profileRef, f.browserKey);
    const childPairs = ck && keeper && typeof keeper.ephemeralPairsFor === 'function' ? keeper.ephemeralPairsFor(ck) : null;
    const target = S.streamTargetFor({ browserKey: f.browserKey, set, profileRef: profileRef || '', envPairs: f.envPairs, profiles, childPairs });
    if (!target.ok) return { ok: false, code: target.code, error: target.error };
    const key = relayKeyFor(sessionId, target);
    let relay = relays.get(key);
    if (!relay) { relay = createRelay(key, sessionId, target); relays.set(key, relay); }
    relay.taps.add(fn);
    if (!relay.viewers.size) pushMaxFps(relay);
    const untap = () => {
      if (!relay.taps.delete(fn)) return;
      if (relays.get(key) !== relay) return;
      if (!relay.viewers.size && !relay.taps.size) endRelay(relay);
      else pushMaxFps(relay);
    };
    await relay.ensureUpstream();
    if (relays.get(key) !== relay) return { ok: false, code: 'ended', error: 'the relay ended while its upstream was connected', untap };
    return { ok: true, key, untap, target: { kind: target.kind, profileId: target.profileId || null, child: !!target.child, browserKey: target.browserKey || null } };
  }
  /** BROWSE YOURSELF (B-6ae8): the recorder's tap on the USER's own browsing (his relay `human:<key>`, created when none —
   *  a tap never starts a browser: the keeper names the target only while his holder is on a live browser). */
  async function tapHuman(key, fn) {
    if (!keeper || typeof keeper.humanTargetFor !== 'function') return { ok: false, code: 'unavailable', error: 'not available' };
    const target = keeper.humanTargetFor(key);
    if (!target || !target.ok) return { ok: false, code: (target && target.code) || 'not-found', error: (target && target.error) || 'not browsing' };
    const rk = 'human:' + target.key;
    let relay = relays.get(rk);
    if (!relay) { relay = createRelay(rk, null, target); relays.set(rk, relay); }
    relay.taps.add(fn);
    if (!relay.viewers.size) pushMaxFps(relay);
    const untap = () => {
      if (!relay.taps.delete(fn)) return;
      if (relays.get(rk) !== relay) return;
      if (!relay.taps.size) relay.acts = null;
      if (!relay.viewers.size && !relay.taps.size) endRelay(relay);
      else pushMaxFps(relay);
    };
    await relay.ensureUpstream();
    if (relays.get(rk) !== relay) return { ok: false, code: 'ended', error: 'the relay ended while its upstream was connected', untap };
    return { ok: true, key: rk, untap, target: { kind: 'human', profileId: target.profileId, key: target.key, browserKey: target.key } };
  }
  /** Send one JSON record to every viewer of the relays on (session, profileId|null). */
  function broadcastTo(sessionId, profileId, obj) {
    let n = 0;
    for (const r of relays.values()) { if (r.sessionId !== sessionId || (r.target.profileId || null) !== (profileId || null) || r.target.child || r.target.kind === 'child') continue; broadcast(r, obj); n += r.viewers.size; } // a helper's relay (either shape) is never the session's own
    return n;
  }
  /** Close every viewer (typed status first, when a reason is given) and the
   *  upstream; forget the relay. Idempotent. */
  function endRelay(relay, code = 1000, why = null) {
    if (relays.get(relay.key) === relay) relays.delete(relay.key);
    stopResumePoll(relay);
    disarmCopyWatch(relay); failQueued(relay, 'upstream_gone', why || 'the live view ended'); // lane live-input
    // lane S4: the relay's clocks end with it; the page's size we set is put back after the grace (unless somebody returns)
    if (isHuman(relay)) flushActs(relay, true); // BROWSE YOURSELF: the last burst of his acts reaches the recorder before its tap ends
    for (const tm of ['fitTimer', 'freshTimer', 'fitHoldTimer', 'actTimer', 'ownersTimer']) if (relay[tm]) { clearTimeout(relay[tm]); relay[tm] = null; } // lane browser-resume C: + the owners debounce
    for (const v of relay.viewers.values()) if (v.trailTimer) { clearTimeout(v.trailTimer); v.trailTimer = null; }
    relay.fits.clear();
    armRestore(relay.key); // the keeper refuses a browser that is not running (a view never starts one); shutdown() clears the clocks
    // P3: a relay that ends while somebody drives hands back (the viewers are gone with it)
    if (relay.mode === 'takeover') { try { handbackFor(relay, relay.holder, 'viewer-left'); } catch { /* optional */ } }
    if (why) broadcast(relay, { type: 'status', state: 'ended', error: why });
    for (const v of [...relay.viewers.values()]) { try { v.ws.close(code); } catch { /* closing */ } }
    relay.viewers.clear();
    noteViewers(relay);
    // P5: the taps are told, then forgotten (a tap re-arms itself on the keeper's next lease event)
    for (const fn of [...relay.taps]) { try { fn({ type: 'tap-end', code, why }, null, relay); } catch { /* optional */ } }
    relay.taps.clear();
    const up = relay.upstream; relay.upstream = null;
    if (up) { try { up.close(1000); } catch { /* closing */ } }
  }
  function closeForSession(sessionId, why = 'the session ended') {
    for (const r of [...relays.values()]) if (r.sessionId === sessionId) endRelay(r, 1001, why);
    // lane S4: a conversation that ended has no page size to keep or put back
    for (const [k, f] of [...fitStates]) if (k.startsWith(sessionId + '|')) { if (f.restoreTimer) clearTimeout(f.restoreTimer); fitStates.delete(k); }
  }
  function viewerCount(sessionId) { let n = 0; for (const r of relays.values()) if (r.sessionId === sessionId) n += r.viewers.size; return n; }
  function stats() {
    return [...relays.values()].map((r) => ({
      key: r.key, sessionId: r.sessionId, target: { kind: r.target.kind, profileId: r.target.profileId || null, alias: r.target.alias || null, handle: r.target.handle || null }, port: r.port, browserKey: r.browserKey,
      upstream: r.upstream ? r.upstream.readyState : null, paused: r.paused, upstreamMaxFps: r.upstreamMaxFps, mode: r.mode, holder: r.holder,
      picture: r.picture, viewport: r.viewport ? { clientWidth: r.viewport.clientWidth, clientHeight: r.viewport.clientHeight, why: r.viewport.why } : null, // lane J
      fit: (() => { const f = fitStates.get(r.key); return { fits: [...r.fits.values()].map((x) => ({ ...x })), applied: f && f.applied ? { ...f.applied } : null, baseline: f && f.baseline ? { ...f.baseline } : null, agent: f && f.agent ? { ...f.agent } : null, floorW: f ? f.floorW : FIT.FIT_MIN_W, last: r.lastFit ? JSON.parse(r.lastFit) : null, pending: f && f.pending ? { ...f.pending } : null }; })(), frameSeq: r.frameSeq, ordSeq: r.ordSeq, // lane S4 (+ verify r1: the in-flight set and the record order)
      viewers: [...r.viewers.values()].map((v) => ({ id: v.id, maxFps: v.maxFps, sent: v.sent, dropped: v.dropped, bufferedAmount: v.ws.bufferedAmount })),
      input: { queued: r.inq.length, inflight: r.inflight, claim: r.fitClaim, copyWatch: r.copyWatch ? { armed: !!r.copyWatch.armed, targetId: r.copyWatch.targetId || null, error: r.copyWatch.error || null } : null }, // lane live-input
      ...r.stats,
    }));
  }
  function shutdown() { for (const r of [...relays.values()]) endRelay(r, 1001, 'the server is restarting'); for (const f of fitStates.values()) if (f.restoreTimer) { clearTimeout(f.restoreTimer); f.restoreTimer = null; } try { unsubInput?.(); unsubConfirm?.(); unsubLease?.(); unsubDialogs?.(); } catch { /* */ } }

  // BROWSE YOURSELF (B-6ae8): the keeper asks the cross-relay viewer fact too (is a window of the user's still live)
  try { keeper?.setViewerAlive?.(viewerAlive); } catch { /* optional */ }
  return { handleUpgrade, closeForSession, viewerCount, stats, shutdown, STREAM_PATH: S.STREAM_PATH, _relays: relays, _fitStates: fitStates,
    tap, tapHuman, broadcastTo, TAP_FPS, viewerAlive, // P5: the recorder's seam (+ BROWSE YOURSELF: the user's own relay)
    activeTargetsFor, tapDialogAct }; // lane browser-stuck: the watch's scope (the tab each relay shows) + the agent's dialog act on the trace
}

module.exports = { create, MAX_PAYLOAD, LIVE_CHECK_MS, RESUME_POLL_MS, TAP_FPS, INPUT_WINDOW, COPY_DEDUP_MS };
