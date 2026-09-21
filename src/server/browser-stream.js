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
 *     `confirm {id, decision}` is answered through upstream's own
 *     `confirm`/`deny` (keeper.answerConfirmation) and acked typed.
 *   · every refusal is TYPED and reaches the viewer as a message before the
 *     close — a socket that just closes is a silent failure of a user act.
 * The decisions are PURE (src/browser-stream.js); the port comes from the
 * keeper (`streamPortFor`, which starts a stopped profile browser — a view is
 * a start, like an attach — or asks the ephemeral browser under the very
 * pairs its session was spawned with). `hostId` is a parameter: a remote
 * session is refused BY NAME in P2 (the device op is a later phase).
 * Gate: scripts/test-browser-live.mjs (heavy).
 */
const { WebSocketServer, WebSocket } = require('ws');
const S = require('../browser-stream.js');
const T = require('../browser-takeover.js');

const MAX_PAYLOAD = 32 * 1024 * 1024;
const LIVE_CHECK_MS = 2000;
const RESUME_POLL_MS = 50;
/** The holder's inputs restart the keeper's idle clock at most this often. */
const INPUT_NOTE_MS = 1000;
/** P5: the fps a tapped relay asks for with no viewer (src/browser-trace.js owns the number). */
const TAP_FPS = require('../browser-trace.js').TRACE_TAP_FPS;

function create({ keeper = null, activeSessions, requestAuthed, log = console, now = Date.now, limits = S.BACKPRESSURE,
  WebSocketImpl = WebSocket, connectTimeoutMs = 20000, getTelemetry = () => null } = {}) {
  if (!activeSessions) throw new Error('browser-stream: activeSessions is required');
  if (typeof requestAuthed !== 'function') throw new Error('browser-stream: requestAuthed is required');
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  const relays = new Map();   // key → relay
  let nextViewerId = 1;
  // P3: the keeper is the one owner of the input side; every relay on that
  // (conversation, browser) mirrors what it says (idle sweep, HTTP handback,
  // another window's click all arrive here).
  const unsubInput = keeper && typeof keeper.onInput === 'function' ? keeper.onInput((ev) => {
    for (const r of relays.values()) {
      if (r.browserKey !== ev.browserKey || (r.target.profileId || null) !== (ev.profileId || null)) continue;
      applyInputState(r, ev.state, ev.cause || (ev.kind === 'takeover' ? 'takeover' : 'handback'));
    }
  }) : null;
  const unsubConfirm = keeper && typeof keeper.onConfirmation === 'function' ? keeper.onConfirmation((ev) => {
    for (const r of relays.values()) {
      if (r.browserKey !== ev.browserKey || (r.target.profileId || null) !== (ev.profileId || null)) continue;
      if (ev.kind === 'pending') broadcast(r, T.confirmationView(ev.confirmation, now()));
      else broadcast(r, { type: 'confirmation-resolved', id: ev.id, decision: ev.decision || null });
    }
  }) : null;

  const send = (ws, obj) => { try { if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* closing */ } };
  const broadcast = (relay, obj) => { const text = typeof obj === 'string' ? obj : JSON.stringify(obj); for (const v of relay.viewers.values()) send(v.ws, text); };

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
    let sessionId = '', profileRef = '';
    try { const q = new URL(req.url || '/', 'http://x').searchParams; sessionId = String(q.get('session') || '').slice(0, 80); profileRef = String(q.get('profile') || '').slice(0, 80); } catch { /* bad url → refused below */ }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachViewer(ws, { sessionId, profileRef }).catch((e) => { log.warn?.(`[browser-live] viewer attach failed: ${e && e.message}`); refuse(ws, 'internal', String(e && e.message)); });
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
    const key = `${sessionId}|${target.kind === 'attachment' ? target.profileId : 'ephemeral'}`;
    let relay = relays.get(key);
    if (!relay) { relay = createRelay(key, sessionId, target); relays.set(key, relay); }
    const viewer = { id: nextViewerId++, ws, maxFps: S.MAX_FPS_DEFAULT, lastFrameAt: 0, sent: 0, dropped: 0, since: now() };
    relay.viewers.set(viewer.id, viewer);
    send(ws, { ...S.hello({ viewers: relay.viewers.size, target, mode: relay.mode, holder: relay.holder }), you: viewer.id, mine: relay.holder === viewer.id, since: relay.modeSince || 0 });
    for (const t of S.REPLAYED_TYPES) if (relay.last[t]) send(ws, relay.last[t]);
    if (relay.lastFrame) { send(ws, relay.lastFrame); viewer.lastFrameAt = now(); viewer.sent++; }
    // P3: a late viewer is told what is still waiting on a confirmation
    if (keeper && typeof keeper.pendingFor === 'function') { try { for (const c of keeper.pendingFor(relay.browserKey, relay.target.profileId || null)) send(ws, c); } catch { /* optional */ } }
    broadcastViewers(relay);
    ws.on('message', (d) => onViewerMessage(relay, viewer, d));
    ws.on('close', () => dropViewer(relay, viewer));
    ws.on('error', () => dropViewer(relay, viewer));
    await relay.ensureUpstream();
  }

  function createRelay(key, sessionId, target) {
    const f = sessionFacts(sessionId) || {};
    const relay = {
      key, sessionId, target, browserKey: f.browserKey || null, envPairs: f.envPairs || null, viewers: new Map(), upstream: null, connecting: null, last: {}, lastFrame: null,
      // P5 (§4.5): server-side TAPS — the action-trace recorder listens to the
      // same upstream (every record, frames included) and keeps the relay
      // alive with no viewer at a low fps; a tap never drives, never counts
      // as a viewer, and is told `tap-end` when the relay ends.
      taps: new Set(),
      paused: false, resumePoll: null, mode: 'watch', holder: null, modeSince: 0, lastInputNoteAt: 0, upstreamMaxFps: null, port: null,
      stats: { frames: 0, dropped: 0, ordered: 0 }, lastLiveCheck: now(), since: now(),
    };
    // P3: the keeper may already say somebody drives (an HTTP takeover, a
    // sibling relay that ended) — mirror it rather than assume Watch.
    if (keeper && typeof keeper.inputStateFor === 'function') { try { const st = keeper.inputStateFor(relay.browserKey, target.profileId || null); if (st && st.input === 'user') { relay.mode = 'takeover'; relay.holder = st.takenBy ? st.takenBy.viewerId : null; relay.modeSince = st.takenAt || 0; } } catch { /* optional */ } }
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
    if (!r.ok) { broadcast(relay, { type: 'status', state: 'error', code: r.code || 'stream_unavailable', error: r.error }); return endRelay(relay, 1011); }
    relay.port = r.port;
    const up = new WebSocketImpl(`ws://127.0.0.1:${r.port}`, { headers: { Origin: S.originHeaderFor(r.port) }, maxPayload: MAX_PAYLOAD, handshakeTimeout: connectTimeoutMs });
    relay.upstream = up;
    up.on('open', () => { broadcast(relay, { type: 'status', state: 'upstream-open' }); pushMaxFps(relay, true); });
    up.on('message', (d, isBinary) => onUpstream(relay, d, isBinary));
    up.on('unexpected-response', (_req, res) => { broadcast(relay, { type: 'status', state: 'error', code: 'upstream-refused', error: `the stream server answered ${res && res.statusCode}` }); try { up.terminate(); } catch { /* */ } });
    up.on('error', (e) => { log.warn?.(`[browser-live] ${relay.key}: upstream error — ${e && e.message}`); if (up.readyState !== 1) broadcast(relay, { type: 'status', state: 'error', code: 'upstream-error', error: String(e && e.message) }); });
    up.on('close', (code) => {
      if (relay.upstream !== up) return;
      relay.upstream = null;
      stopResumePoll(relay);
      broadcast(relay, { type: 'status', state: 'upstream-closed', code: Number(code) || 0 });
      endRelay(relay, 1001);
    });
  }

  function onUpstream(relay, d, isBinary) {
    const t = now();
    if (t - relay.lastLiveCheck > LIVE_CHECK_MS) {
      relay.lastLiveCheck = t;
      if (!activeSessions.has?.(relay.sessionId)) { closeForSession(relay.sessionId, 'the session ended'); return; }
    }
    if (isBinary) { for (const v of relay.viewers.values()) send(v.ws, d); applyBackpressure(relay); return; }
    const text = typeof d === 'string' ? d : d.toString();
    let msg = null; try { msg = JSON.parse(text); } catch { return; }
    const cls = S.classifyUpstream(msg);
    if (cls === 'invalid') return;
    // P5: every tap sees every record (a tap that throws never breaks the fan-out)
    for (const fn of relay.taps) { try { fn(msg, text, relay); } catch (e) { log.warn?.(`[browser-live] ${relay.key}: tap failed — ${e && e.message}`); } }
    if (cls !== 'frame') onOrderedForKeeper(relay, msg);
    if (cls === 'frame') {
      relay.lastFrame = text; relay.stats.frames++;
      for (const v of relay.viewers.values()) {
        if (S.frameGate({ maxFps: v.maxFps, lastFrameAt: v.lastFrameAt, bufferedAmount: v.ws.bufferedAmount }, t, limits)) { send(v.ws, text); v.lastFrameAt = t; v.sent++; }
        else { v.dropped++; relay.stats.dropped++; }
      }
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
      const conf = T.confirmationFromUpstream(msg, now());
      if (conf) {
        if (typeof keeper.notePending === 'function') keeper.notePending({ browserKey: relay.browserKey, profileId: pid, sessionId: relay.sessionId, confirmation: conf });
        if (!unsubConfirm) broadcast(relay, T.confirmationView(conf, now()));
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
  function applyInputState(relay, state, cause) {
    const user = !!(state && state.input === 'user');
    relay.mode = user ? 'takeover' : 'watch';
    relay.holder = user && state.takenBy ? state.takenBy.viewerId : null;
    relay.modeSince = user ? (state.takenAt || now()) : (state && state.handedBackAt) || now();
    for (const v of relay.viewers.values()) send(v.ws, { type: 'mode', mode: relay.mode, holder: relay.holder, mine: relay.holder === v.id, since: relay.modeSince, cause: cause || null, url: (state && state.url) || null });
  }
  function lastUrlOf(relay) {
    try { const u = relay.last.url ? JSON.parse(relay.last.url) : null; if (u && typeof u.url === 'string') return u.url; } catch { /* */ }
    try { const t = relay.last.tabs ? JSON.parse(relay.last.tabs) : null; const act = t && Array.isArray(t.tabs) ? t.tabs.find((x) => x && x.active) : null; if (act && typeof act.url === 'string') return act.url; } catch { /* */ }
    return '';
  }
  /** Take over / hand back — through the keeper when it has the P3 surface,
   *  else relay-local (a stub keeper in the heavy suite). Never throws. */
  function takeoverFor(relay, viewer) {
    const holderAlive = relay.holder !== null && relay.viewers.has(relay.holder);
    if (keeper && typeof keeper.takeover === 'function') {
      const r = keeper.takeover({ browserKey: relay.browserKey, profileId: relay.target.profileId || null, viewerId: viewer.id, sessionId: relay.sessionId, holderAlive });
      if (r.ok && !unsubInput) applyInputState(relay, r.state, 'takeover');
      if (r.ok && r.already) send(viewer.ws, { type: 'mode', mode: relay.mode, holder: relay.holder, mine: true, since: relay.modeSince, cause: 'takeover', url: null });
      return r;
    }
    const d = T.decideTakeover({ state: relay.mode === 'takeover' ? { input: 'user', takenAt: relay.modeSince, takenBy: { viewerId: relay.holder, at: relay.modeSince } } : null, viewerId: viewer.id, now: now(), holderAlive });
    if (d.ok) applyInputState(relay, d.state, 'takeover');
    return d;
  }
  function handbackFor(relay, viewerId, cause) {
    const url = lastUrlOf(relay);
    if (keeper && typeof keeper.handback === 'function') {
      const r = keeper.handback({ browserKey: relay.browserKey, profileId: relay.target.profileId || null, viewerId, cause, url, sessionId: relay.sessionId });
      if (r.ok && !unsubInput) applyInputState(relay, r.state, cause);
      return r;
    }
    const d = T.decideHandback({ state: relay.mode === 'takeover' ? { input: 'user', takenAt: relay.modeSince, takenBy: { viewerId: relay.holder, at: relay.modeSince } } : null, viewerId, cause, now: now(), url });
    if (d.ok) applyInputState(relay, d.state, cause);
    return d;
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

  function onViewerMessage(relay, viewer, d) {
    let msg = null; try { msg = JSON.parse(typeof d === 'string' ? d : d.toString()); } catch { send(viewer.ws, { type: 'refused', code: 'bad-message', error: 'not JSON' }); return; }
    const v = S.viewerMessageVerdict(msg, { holder: relay.holder, viewerId: viewer.id, mode: relay.mode });
    if (v.kind === 'config') { if (v.maxFps !== undefined) { viewer.maxFps = v.maxFps; pushMaxFps(relay); } send(viewer.ws, { type: 'config-ack', maxFps: viewer.maxFps, upstreamMaxFps: relay.upstreamMaxFps }); return; }
    if (v.kind === 'ack') return;
    if (v.kind === 'ping') { send(viewer.ws, { type: 'pong', at: now() }); return; }
    if (v.kind === 'input') {
      if (v.forward && relay.upstream && relay.upstream.readyState === 1) {
        try { relay.upstream.send(JSON.stringify(msg)); } catch { /* closing */ }
        const t = now();
        if (t - relay.lastInputNoteAt >= INPUT_NOTE_MS) { relay.lastInputNoteAt = t; try { keeper?.noteUserInput?.(relay.browserKey, relay.target.profileId || null, t); } catch { /* optional */ } }
      } else send(viewer.ws, v.refusal || { type: 'refused', code: 'watch-mode', error: 'no upstream' });
      return;
    }
    // P3 (§4.3): the control verbs
    if (v.kind === 'takeover') {
      const r = takeoverFor(relay, viewer);
      if (!r.ok) send(viewer.ws, { type: 'refused', code: r.code || 'held', error: r.error || 'refused', holder: r.holder ? r.holder.viewerId : relay.holder, mode: relay.mode });
      else send(viewer.ws, { type: 'mode-ack', ok: true, mode: relay.mode, mine: relay.holder === viewer.id, already: !!r.already });
      return;
    }
    if (v.kind === 'handback') {
      const r = handbackFor(relay, viewer.id, 'explicit');
      if (!r.ok) send(viewer.ws, { type: 'refused', code: r.code || 'not_taken', error: r.error || 'refused', mode: relay.mode });
      else send(viewer.ws, { type: 'mode-ack', ok: true, mode: relay.mode, mine: false, heldMs: r.heldMs || 0 });
      return;
    }
    if (v.kind === 'confirm') {
      if (!keeper || typeof keeper.answerConfirmation !== 'function') { send(viewer.ws, { type: 'confirmation-ack', ok: false, id: v.id, decision: v.decision, code: 'unavailable', error: 'confirmations are not available on this server' }); return; }
      keeper.answerConfirmation({ browserKey: relay.browserKey, profileId: relay.target.profileId || null, id: v.id, decision: v.decision, envPairs: relay.envPairs })
        .then((r) => { send(viewer.ws, { type: 'confirmation-ack', ok: !!r.ok, id: v.id, decision: v.decision, code: r.ok ? null : (r.code || 'refused'), error: r.ok ? null : (r.error || 'refused') }); if (r.ok && !unsubConfirm) broadcast(relay, { type: 'confirmation-resolved', id: v.id, decision: v.decision }); })
        .catch((e) => send(viewer.ws, { type: 'confirmation-ack', ok: false, id: v.id, decision: v.decision, code: 'internal', error: String(e && e.message) }));
      return;
    }
    send(viewer.ws, v.refusal);
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
    const target = S.streamTargetFor({ browserKey: f.browserKey, set, profileRef: profileRef || '', envPairs: f.envPairs, profiles });
    if (!target.ok) return { ok: false, code: target.code, error: target.error };
    const key = `${sessionId}|${target.kind === 'attachment' ? target.profileId : 'ephemeral'}`;
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
    return { ok: true, key, untap, target: { kind: target.kind, profileId: target.profileId || null } };
  }
  /** Send one JSON record to every viewer of the relays on (session, profileId|null). */
  function broadcastTo(sessionId, profileId, obj) {
    let n = 0;
    for (const r of relays.values()) { if (r.sessionId !== sessionId || (r.target.profileId || null) !== (profileId || null)) continue; broadcast(r, obj); n += r.viewers.size; }
    return n;
  }
  /** Close every viewer (typed status first, when a reason is given) and the
   *  upstream; forget the relay. Idempotent. */
  function endRelay(relay, code = 1000, why = null) {
    if (relays.get(relay.key) === relay) relays.delete(relay.key);
    stopResumePoll(relay);
    // P3: a relay that ends while somebody drives hands back (the viewers are gone with it)
    if (relay.mode === 'takeover') { try { handbackFor(relay, relay.holder, 'viewer-left'); } catch { /* optional */ } }
    if (why) broadcast(relay, { type: 'status', state: 'ended', error: why });
    for (const v of [...relay.viewers.values()]) { try { v.ws.close(code); } catch { /* closing */ } }
    relay.viewers.clear();
    // P5: the taps are told, then forgotten (a tap re-arms itself on the keeper's next lease event)
    for (const fn of [...relay.taps]) { try { fn({ type: 'tap-end', code, why }, null, relay); } catch { /* optional */ } }
    relay.taps.clear();
    const up = relay.upstream; relay.upstream = null;
    if (up) { try { up.close(1000); } catch { /* closing */ } }
  }
  function closeForSession(sessionId, why = 'the session ended') {
    for (const r of [...relays.values()]) if (r.sessionId === sessionId) endRelay(r, 1001, why);
  }
  function viewerCount(sessionId) { let n = 0; for (const r of relays.values()) if (r.sessionId === sessionId) n += r.viewers.size; return n; }
  function stats() {
    return [...relays.values()].map((r) => ({
      key: r.key, sessionId: r.sessionId, target: { kind: r.target.kind, profileId: r.target.profileId || null, alias: r.target.alias || null }, port: r.port,
      upstream: r.upstream ? r.upstream.readyState : null, paused: r.paused, upstreamMaxFps: r.upstreamMaxFps, mode: r.mode, holder: r.holder,
      viewers: [...r.viewers.values()].map((v) => ({ id: v.id, maxFps: v.maxFps, sent: v.sent, dropped: v.dropped, bufferedAmount: v.ws.bufferedAmount })),
      ...r.stats,
    }));
  }
  function shutdown() { for (const r of [...relays.values()]) endRelay(r, 1001, 'the server is restarting'); try { unsubInput?.(); unsubConfirm?.(); } catch { /* */ } }

  return { handleUpgrade, closeForSession, viewerCount, stats, shutdown, STREAM_PATH: S.STREAM_PATH, _relays: relays,
    tap, broadcastTo, TAP_FPS }; // P5: the recorder's seam
}

module.exports = { create, MAX_PAYLOAD, LIVE_CHECK_MS, RESUME_POLL_MS, TAP_FPS };
