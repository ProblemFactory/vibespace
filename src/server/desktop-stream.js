'use strict';
/**
 * DESKTOP STREAM — the ONE WebSocket bridge to every picture server
 * (docs/design-desktop-apps.zh.md §2 row 4; P8-1, 2026-09-13). ORCH tier; it
 * starts NO process and knows NO application: a caller hands it an id, it asks
 * `resolveTarget(id)` where the picture lives and relays bytes.
 *
 *   GET /api/desktop/<id>/stream   — a desktop-app session (the keeper's id)
 *   GET /api/vnc                    — the pre-existing in-container desktop,
 *                                     which is id `desktop-singleton` on this
 *                                     same bridge (src/vnc.js). The old
 *                                     `bridgeVncSocket` in server.js moved here
 *                                     VERBATIM (websockify semantics, the 8 MiB
 *                                     / 1 MiB backpressure numbers, close on
 *                                     either side) so the two windows share ONE
 *                                     relay instead of a twin.
 *
 * DISCIPLINE (the /api/vnc rules, unchanged): cookie auth at the upgrade —
 * `auth.requestAuthed(req)` is asked INSIDE handleUpgrade, so a future caller
 * cannot mount the bridge unauthenticated by forgetting a check; the raw port
 * is loopback-only and never reaches a browser; backpressure pauses the TCP
 * side when the ws buffer balloons; a disconnect on either side closes the
 * other.
 *
 * INPUT IS A CLIENT MESSAGE WHOSE TYPE IS INPUT, NOT A FRAME (r2, measured):
 * noVNC sends a FramebufferUpdateRequest on its own every time the picture
 * changes — a clock, a cursor blink, any animation — so "every browser→server
 * frame is input" advanced the keeper's idle clock at exactly the bridge's
 * 2 s throttle with nobody at the keyboard (`0 2466 4529 6652 …` ms on a
 * once-a-second repaint; a static xmessage read `0 0 0 0`), and the DA3 idle
 * stop never fired for any session a tab still showed. `rfbInputSieve` walks
 * the client→server RFB stream (the handshake, then typed messages with their
 * lengths — a frame may carry several) and reports INPUT only for KeyEvent
 * (4), PointerEvent (5), ClientCutText (6) and the QEMU extended key event
 * (255/0). A protocol it cannot follow (a bring-your-own server's security
 * type, an unknown message type) flips the sieve to `opaque` and every
 * later frame counts — today's rule, the direction that never reaps a live
 * user. `onInput(id)` is still throttled per socket.
 *
 * TARGET KINDS: `rfb` relays to 127.0.0.1:<port> as raw TCP (websockify
 * semantics). `xpra` (P8-2, 2026-09-21) relays to the xpra server's OWN
 * WebSocket on 127.0.0.1:<port> — `bridgeXpra`: ws↔ws, binary frames both
 * ways, the SAME backpressure numbers (the upstream `ws` client is paused
 * while the browser's buffer is above WS_HIGH_WATER and resumed below
 * WS_LOW_WATER), the same 20 s ping + two-silent-rounds rule, the same NAMED
 * close line, close on either side. One ws message = one xpra packet (the
 * html5 client sends header+payload in one buffer), so the framing is
 * preserved instead of re-chunked. An unknown kind is still 501 by name.
 *
 * XPRA INPUT (the idle clock's question, same rule as the RFB sieve): the
 * html5 client pings the server every few seconds and acks every frame it
 * draws (`damage-sequence`), so "every browser→server frame is input" would
 * keep an idle session alive for ever. `xpraInputSieve` walks the client's
 * packets — the 8-byte header `P, flags, compression, index, size` then the
 * rencode/bencode LIST whose first element NAMES the packet — and counts
 * INPUT only for the types a human produces (XPRA_INPUT_TYPES: key-action,
 * button-action, pointer*, wheel-motion, clipboard-token/-contents,
 * close-window, focus, start-command); a packet it cannot read (compressed,
 * an encoder it does not know, a raw chunk of unknown parent) COUNTS — the
 * direction that never reaps a live user. The policy verdict is applied PER
 * PACKET on this kind too (2026-09-22): `xpraInputSieve().strip` cuts a
 * refused viewer's INPUT packets out and relays the rest — the hello, ping
 * echoes, damage acks, map/configure-window — because a packet is framed by
 * its own 8-byte header and never needs the encoder to be cut (the r1 rule
 * dropped a refused CHUNK whole, the hello with it: a Watch viewer of an
 * agent-held window never got a picture).
 *
 * WHAT A REFUSED VIEWER MAY SAY (2026-09-22, round 2 of the P8-2 verify —
 * reproduced on the real rung: one `shutdown-server` from a Watch-mode viewer
 * ended the app session within ~1 s, `exit-server` likewise): the refusal is
 * an ALLOWLIST, not a denylist of input. A refused viewer's packet reaches
 * xpra only when its type is in XPRA_WATCH_TYPES — the packets a picture
 * needs and that change nothing but this viewer's own view (hello, ping /
 * ping_echo, damage-sequence, map-window, buffer-refresh,
 * clipboard-contents-none; keyboard-config / keymap-changed LEFT the list in
 * r7, the display-size packets (display-configure / configure-display /
 * desktop_size) in r8 and configure-window / unmap-window in x5 — the keymap,
 * the virtual root and the app window's geometry are the display's, SHARED:
 * see XPRA_KEYMAP_TYPES / XPRA_DISPLAY_TYPES / XPRA_GEOMETRY_TYPES, each held
 * for the viewer's takeover; unmap-window is cut). Everything else — input, and every
 * control packet xpra knows (control, command_request, info-request,
 * set-clipboard-enabled, sharing-toggle, logging, …) — is dropped, as
 * unreadable bytes already were. SERVER LIFECYCLE is the keeper's alone:
 * XPRA_LIFECYCLE_TYPES (shutdown-server, exit-server) are dropped from EVERY
 * viewer, allowed or not (xpra 6.5.3 honours them from any client —
 * `_process_shutdown_server` / `_process_exit_server` check nothing about
 * who sent them). The hello's own `request: stop|exit|detach|run|…` is the
 * same act in another spelling; it is refused where it is decided, by the
 * xpra socket itself (desktop-display XPRA_BIND_REFUSALS), since the bridge
 * never decodes a hello.
 *
 * NETEM (the D21 (c) validation slice's knob, DEV-ONLY): `create({netemEnabled})`
 * — server.js passes `VIBESPACE_DESKTOP_NETEM === '1'`, never on by default
 * — lets `?netem=rtt:200,kbps:1000` on the upgrade url (or `setNetem(id,
 * spec)` from the hosted-client route, whose page cannot add a query to the
 * client's `path`) delay every relayed message by rtt/2 per direction and
 * meter it to kbps; `netem:off` clears. Disabled ⇒ the parameter is ignored.
 *
 * THE INPUT POLICY (P9b, design-agent-browser-v2 §4.3 / §6.6 — the
 * `window-live` form of this bridge): a client names itself with
 * `?viewer=<id>` at the upgrade and `inputPolicy(id, viewerId)` is asked for
 * every client message that IS input — `{relay:true}` writes it through,
 * `{relay:false, code:'watch-mode'|'held'}` DROPS that message and only that
 * message (`rfbInputSieve().strip(chunk, allow)` cuts the KeyEvent /
 * PointerEvent / ClientCutText / QEMU key — and, since r8, a SetDesktopSize:
 * the display is shared — out of the chunk and relays the
 * rest — a FramebufferUpdateRequest riding the same frame still reaches the
 * server, so the picture never freezes on a refused click; the xpra kind
 * does the same per PACKET through `xpraInputSieve().strip`). The policy is the
 * window-targets engine's: no agent lease ⇒ relay (the user's own app, as
 * before); an agent holds it ⇒ watch-mode until the user takes over; taken
 * over ⇒ the holder viewer only. A stream the sieve cannot follow (`opaque`)
 * cannot be cut, so a refused chunk is dropped WHOLE there — the direction
 * that never injects behind a refusal. Dropped input is never reported to
 * `onInput` (a refused click is nobody at the keyboard). `onViewerLeft(id,
 * viewerId)` fires on close so a holder whose socket died hands back;
 * `viewerAlive(id, viewerId)` answers the engine's holderAlive question.
 */
const { WebSocketServer, WebSocket } = require('ws');
const { DESKTOP_SINGLETON_ID } = require('../desktop-apps');

const STREAM_RE = /^\/api\/desktop\/([A-Za-z0-9._-]{1,80})\/stream$/;
const INPUT_REPORT_MS = 2000;
const STREAM_RELAYS = require('./stream-relays.js'); // rv-desktop-apps F-B4: the relay of each stream kind (one line per kind)
const KA = require('../ws-keepalive.js'); // lane stream-ping: the ONE keepalive rule both bridges arm
const PING_MS = KA.PING_MS;        // ws keepalive cadence on a bridge (2.369.118); silent for 2 rounds = terminated + named
const WS_HIGH_WATER = 8 * 1024 * 1024;
const WS_LOW_WATER = 1024 * 1024;
/** THE LIVENESS RULE (lane desktop-keepalive, userW inc-muoshmqn-dect) lives in src/ws-keepalive.js since the 2.369.202
 *  integration — THE ONE keepalive both bridges arm (lane stream-ping): a pong, bytes from the browser, or the kernel's
 *  progress through a backlog keep a viewer alive; two silent rounds ⇒ terminated + named `… and nothing acknowledged`.
 *  Re-exported here for the desktop suites. */
const { livenessVerdict, SILENT_ROUNDS_TO_CUT } = KA;
/** THE CLOSE, AS A CODE THE PAGE CAN WORD (lane desktop-keepalive K3): the bridge's named close line → a closed set.
 *  noVNC never exposes a close frame's reason, and a terminate() sends none, so the page reads the bridge's own record
 *  (GET /api/vnc/last-close) and words the code itself. */
const CLOSE_CODES = Object.freeze(['unanswered', 'server-closed', 'browser-closed', 'session-ended', 'blocked', 'machine-offline', 'other']);
function closeCodeOf(why) {
  const w = String(why || '');
  if (/^no pong/.test(w)) return 'unanswered';
  if (/^the (VNC|xpra) server closed its socket|^(VNC|xpra) (server )?socket error/.test(w)) return 'server-closed';
  if (/^the browser closed/.test(w)) return 'browser-closed';
  if (/app session ended/.test(w)) return 'session-ended';
  if (/blocked|another viewer|Resume here/i.test(w)) return 'blocked';
  if (/ went offline$/.test(w)) return 'machine-offline'; // design 014 D1: a machine desktop whose machine's link dropped
  return 'other';
}
/**
 * THE HELD-BYTES CAP (2026-09-22, the r6 verify's open hole A — reproduced: an
 * authenticated viewer whose xpra header DECLARED a 2 GiB packet and then
 * streamed it grew the server by ~1 GB, 966 MB measured, released only on
 * close; the sieve held every incomplete packet's bytes with no limit, and
 * re-concatenated them on every chunk). A client→server xpra packet may
 * DECLARE at most XPRA_MAX_PACKET_BYTES = 16 MiB: that is xpra's own
 * MAX_PACKET_SIZE (net/constants.py, `XPRA_MAX_PACKET_SIZE`, default 16 MiB),
 * which xpra 6.5.3's server/core.py `accept_protocol` sets as the limit of
 * every client connection — a bigger packet is refused by xpra itself, so the
 * bridge never cuts one xpra would have taken. The direction matters: this is
 * what a VIEWER sends (hello, acks, pointer, a clipboard paste); the draws — a
 * 4K RGBA frame is 33 MB raw — flow the OTHER way, from xpra to the browser,
 * bounded by the upstream client's own maxPayload (64 MiB) and untouched here.
 * A header declaring more, or an incomplete packet + its raw chunks holding
 * more than one largest packet, closes THAT viewer (1009 `packet-too-large`),
 * releases what the sieve held and counts `stats().oversize` — the xpra
 * server and every other viewer never see it.
 *
 * RFB has no packet framing — a message's length is its type's — but ONE
 * client message DECLARES its own: ClientCutText (a u32, or a negative one for
 * the extended clipboard), held the same way while it streams. Same cap,
 * RFB_MAX_MESSAGE_BYTES = 16 MiB: the servers refuse far below it (Xvnc's
 * MaxCutText defaults to 262144 bytes; libvncserver — x11vnc — closes a client
 * whose cut text is over 1 MB), so nothing a server would take is cut. Every
 * other client message is bounded by its type (SetEncodings at most 262 148
 * bytes). And the browser→bridge WebSocket itself takes at most
 * WS_MAX_MESSAGE_BYTES per message (the ws library's default is 100 MiB, all
 * buffered before a sieve sees the header): one message over it is the same
 * named close.
 */
// each relay declares its protocol's cap (`maxMessageBytes` — xpra's XPRA_MAX_PACKET_BYTES, RFB's RFB_MAX_MESSAGE_BYTES,
// 16 MiB each); the WebSocket's own per-message cap is the largest + a frame header
const WS_MAX_MESSAGE_BYTES = Math.max(...Object.values(STREAM_RELAYS).map((r) => r.maxMessageBytes)) + 8;
const OVERSIZE_CLOSE = 1009; // RFC 6455 "Message Too Big"
const OVERSIZE_REASON = 'packet-too-large';

// ── NETEM (dev-only): a delay + a bit-rate meter per direction ──────────────
const NETEM_RE = /^(rtt:(\d{1,5}))?,?(kbps:(\d{1,7}))?$/;
/** `rtt:200,kbps:1000` / `rtt:200` / `kbps:1000` / `off` → { rttMs, kbps } | null (off / unparsable). */
function parseNetem(spec) {
  const s = String(spec == null ? '' : spec).trim().toLowerCase();
  if (!s || s === 'off' || s === 'none' || s === '0') return null;
  const parts = Object.fromEntries(s.split(',').map((kv) => kv.split(':')).filter((kv) => kv.length === 2).map(([k, v]) => [k.trim(), Number(v)]));
  const rttMs = Number.isFinite(parts.rtt) && parts.rtt > 0 ? Math.min(parts.rtt, 60000) : 0;
  const kbps = Number.isFinite(parts.kbps) && parts.kbps > 0 ? Math.min(parts.kbps, 10000000) : 0;
  return rttMs || kbps ? { rttMs, kbps } : null;
}
/** ONE direction's queue: every `send(bytes, fn)` fires `fn` no earlier than
 *  rtt/2 after it was queued AND no earlier than the previous one's finish +
 *  the bytes' airtime at kbps (a leaky bucket), in order. `stop()` drops what
 *  is still queued. */
function netemQueue({ rttMs = 0, kbps = 0 } = {}, now = Date.now) {
  let lastAt = 0, stopped = false;
  const timers = new Set();
  function send(bytes, fn) {
    if (stopped) return;
    const t = now();
    const air = kbps ? Math.ceil((bytes * 8) / kbps) : 0;
    const at = Math.max(t + rttMs / 2, lastAt + air);
    lastAt = at;
    const h = setTimeout(() => { timers.delete(h); if (!stopped) { try { fn(); } catch { /* peer gone */ } } }, Math.max(0, at - t));
    timers.add(h);
  }
  function stop() { stopped = true; for (const h of timers) clearTimeout(h); timers.clear(); }
  return { send, stop };
}
/** The `?netem=` value on an upgrade url, or null. */
function netemOfUrl(url) {
  try { return new URL(String(url || ''), 'http://x').searchParams.get('netem'); } catch { return null; }
}

/** Which stream id a ws upgrade path names, or null. `/api/vnc` = the singleton. */
/** design 014 D1: does an upgrade carry an agent's token (a Bearer header, or a token in the url)? */
function bearerOf(req) {
  if (/^Bearer\s+\S/i.test(String((req && req.headers && req.headers.authorization) || ''))) return true;
  try { const q = new URL(String((req && req.url) || ''), 'http://x').searchParams; return q.has('token') || q.has('vsst'); } catch { return false; }
}
function upgradeId(pathname) {
  if (pathname === '/api/vnc') return DESKTOP_SINGLETON_ID;
  const m = STREAM_RE.exec(pathname || '');
  return m ? m[1] : null;
}
/** The client-side url for an id (the singleton keeps its historic path). */
function streamPath(id) { return id === DESKTOP_SINGLETON_ID ? '/api/vnc' : `/api/desktop/${id}/stream`; }

const VIEWER_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** The viewer id a ws upgrade url names (`?viewer=<id>`), or null. */
function viewerOf(url) {
  try { const v = new URL(String(url || ''), 'http://x').searchParams.get('viewer'); return v && VIEWER_RE.test(v) ? v : null; } catch { return null; }
}
/** x5: the pane key a ws upgrade url names (`?pane=<key>` — the window's stable PUBLIC name across its reconnects), or null. */
function paneOf(url) {
  try { const v = new URL(String(url || ''), 'http://x').searchParams.get('pane'); return v && VIEWER_RE.test(v) ? v : null; } catch { return null; }
}
/** 2.369.156: the pane a window SUCCEEDS (`?prev=<key>` — the pane key the same tab's previous window of this app had,
 *  e.g. before a page reload), or null. Only a hint for the keeper's grace: it never names an identity. */
function prevOf(url) {
  try { const v = new URL(String(url || ''), 'http://x').searchParams.get('prev'); return v && VIEWER_RE.test(v) ? v : null; } catch { return null; }
}

/**
 * @param {object} deps
 *   auth          — { requestAuthed(req) }
 *   resolveTarget — (id) => { kind:'rfb'|'xpra', port, hostId? } | null   (sync; `hostId` = a PAIRED machine's app — lane C2)
 *   forwardPort   — (hostId, port) => Promise<{ localPort, close }>  (lane C2: src/server/desktop-access.js forwardPort —
 *                   a paired machine's loopback picture port as a hub loopback port; absent ⇒ a remote target is refused 502)
 *   onInput       — (id) => void  (throttled here; RELAYED input only)
 *   onDesktopSize — (id, w, h, viewerId) => void  (P8-2 x4: every SetDesktopSize a client sends, unthrottled — the keeper debounces)
 *   inputPolicy   — (id, viewerId) => { relay, code, why }  (P9b; absent = relay everything)
 *   pinned        — (id) => the record's pin {w,h} | null (lane e2b: the keeper owns a pinned window's geometry — the xpra relay drops every
 *                   viewer's and, r3, asks xpra for the pin's desktop size itself on each viewer connection)
 *   onViewerLeft  — (id, viewerId) => void  (P9b; the holder's socket closed)
 *   viewerSeats   — P8-2 x5 (absent ⇒ every socket relayed as before, the policy above alone):
 *                   { join(id, {viewerId, pane, prev, ua}), leave(id, viewerId), state(id, viewerId) → 'active'|'blocked'|'watch'|'free' }
 *                   — the keeper's ONE-ACTIVE-VIEWER election composed with the engine's lease (window-live-wiring);
 *                   only a NAMED socket (`?viewer=`) is seated (2.369.156, LOW-3): an ANONYMOUS one — the hosted
 *                   upstream page, a script — is a read-only WATCH seat on a governed stream (`state(id, null)`
 *                   answering anything but 'free'), never elected, never blocked. `refresh(id)` re-applies it.
 *   log
 */
function create({ auth, resolveTarget, forwardPort = null, onInput = () => { }, onDesktopSize = null, inputPolicy = null, pinned = null, onViewerLeft = null, viewerSeats = null, upstreamWhy = null, log = console, now = Date.now, pingMs = PING_MS, netemEnabled = false, WebSocketClient = WebSocket } = {}) {
  if (!auth || typeof auth.requestAuthed !== 'function') throw new Error('desktop-stream: auth.requestAuthed is required');
  if (typeof resolveTarget !== 'function') throw new Error('desktop-stream: resolveTarget is required');
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_MESSAGE_BYTES });
  const stats = { opened: 0, refused: 0, relayed: 0, dropped: 0, held: 0, netem: 0, lifecycle: 0, oversize: 0, blocked: 0, cut: 0 };
  const lastClose = new Map(); // lane desktop-keepalive K3: id → {why, code, at, afterS} of its LAST close (one row per stream id)
  if (viewerSeats && (typeof viewerSeats.join !== 'function' || typeof viewerSeats.leave !== 'function' || typeof viewerSeats.state !== 'function')) throw new Error('desktop-stream: viewerSeats needs join / leave / state');
  const resolveTargetSafe = (id) => { try { const t = resolveTarget(id); return t && t.port ? t : null; } catch { return null; } };
  const netems = new Map(); // id → { rttMs, kbps } (dev-only, see the header)
  /** Remember a netem spec for an id (the hosted-client route). Ignored unless enabled. */
  function setNetem(id, spec) { if (!netemEnabled) return null; const n = parseNetem(spec); if (n) netems.set(id, n); else netems.delete(id); return n; }
  function netemOf(id) { return netemEnabled ? netems.get(id) || null : null; }
  const viewers = new Map(); // id → Map viewerId → ws (P9b: who is watching which stream)
  const open = new Map(); // id → how many bridge sockets are open now (named viewer or not) — the keeper's "somebody watches" fact
  const opened = (id) => open.set(id, (open.get(id) || 0) + 1);
  const closed = (id) => { const n = (open.get(id) || 0) - 1; if (n > 0) open.set(id, n); else open.delete(id); };
  function connections(id) { return open.get(id) || 0; }
  function viewersOf(id) { const m = viewers.get(id); return m ? [...m.keys()] : []; }
  function viewerAlive(id, viewerId) { const m = viewers.get(id); return !!(m && m.has(String(viewerId)) && m.get(String(viewerId)).readyState === 1); }

  /**
   * THE HELD-BYTES CAP's close (see XPRA_MAX_PACKET_BYTES): THIS viewer's socket
   * closes 1009 `packet-too-large`, one warn line names what it declared, the
   * sieve has already released what it held, `stats().oversize` counts it. The
   * close handler then ends this viewer's OWN upstream connection like any
   * close — the picture server and the other viewers are never touched. A peer
   * that ignores the close frame is cut 2 s later (its bytes are no longer
   * read into anything: the sieve is stopped).
   */
  function closeOversize(ws, id, viewerId, o, kind) {
    stats.oversize++;
    const what = `${o.what || 'message'} declared ${o.declared} B${o.held != null ? `, ${o.held} B held` : ''}, the cap is ${o.cap} B`;
    log.warn?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} sent an oversized ${kind} message (${what}) — closed ${OVERSIZE_CLOSE} ${OVERSIZE_REASON}; the ${(Object.hasOwn(STREAM_RELAYS, kind) && STREAM_RELAYS[kind].serverName) || 'picture server'} and the other viewers are untouched`);
    try { ws.close(OVERSIZE_CLOSE, OVERSIZE_REASON); } catch { /* closing */ }
    const cut = setTimeout(() => { try { ws.terminate(); } catch { /* gone */ } }, 2000);
    cut.unref?.();
    return `${OVERSIZE_REASON}: ${what}`;
  }
  /** The ws library's own per-message cap (WS_MAX_MESSAGE_BYTES) fires as an `error` — named and counted the same way. */
  function wsOversize(e, id, viewerId, kind) {
    if (!e || e.code !== 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') return null;
    stats.oversize++;
    log.warn?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} sent one WebSocket message over ${WS_MAX_MESSAGE_BYTES} B (${kind}) — closed ${OVERSIZE_CLOSE} ${OVERSIZE_REASON}; the other viewers are untouched`);
    return `${OVERSIZE_REASON}: one WebSocket message over ${WS_MAX_MESSAGE_BYTES} B`;
  }

  function refuse(socket, status, text) {
    try { socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* peer gone */ }
    try { socket.destroy(); } catch { /* peer gone */ }
    stats.refused++;
  }

  // ── P8-2 x5: ONE ACTIVE VIEWER (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer") ──
  // `seats` (the wiring's composition of the keeper's election with the engine's lease; absent ⇒ every socket is
  // relayed as before) answers each socket's state: 'active' (everything relayed — its pane drives the app),
  // 'watch' (an agent drives: the picture, and only what the picture needs), 'blocked' (another client is active:
  // NO upstream connection at all — the socket stays open for keepalive, what it says is dropped except the hello and
  // the held kinds, kept for the moment it becomes active), 'free' (not governed: the singleton desktop / no seats).
  // A change of state is applied by `refresh(id)` — the keeper's viewer set moved or the engine's lease did — and at
  // every message. active/watch → blocked CUTS the socket: its upstream closes and the socket closes 4001 `blocked`
  // (the client's protocol session was bound to that upstream; the pane reconnects as a blocked viewer and shows the
  // overlay). blocked → active/watch OPENS the upstream and replays what it held (xpra: its hello first).
  const conns = new Map(); // id -> Set of conn { seat (a viewer id, or ANON for a socket that names none), reconcile, cut }
  const ANON = Symbol('anonymous');
  const seatState = (id, seat) => {
    if (!viewerSeats || !seat) return 'free';
    // LOW-3 (2.369.156): an anonymous socket is never elected — on a governed stream it WATCHES (the picture, nothing else)
    if (seat === ANON) { try { return viewerSeats.state(id, null) === 'free' ? 'free' : 'watch'; } catch { return 'watch'; } }
    try { const s = viewerSeats.state(id, seat); return s === 'active' || s === 'blocked' || s === 'watch' ? s : 'free'; } catch (e) { log.warn?.(`[desktop-stream] ${id}: seats.state threw — relaying as before: ${e && e.message}`); return 'free'; }
  };
  /** Re-applies every socket's state for `id` (the keeper / the lease moved). A socket whose bridge has not wired
   *  its reconcile yet is skipped (LOW-1, 2.369.156: the join's own broadcast refreshes while the joining socket is
   *  still being set up — it applies its state itself right after, and the skip is not a failure to warn about). */
  function refresh(id) { const set = conns.get(id); if (!set) return 0; let n = 0; for (const c of [...set]) { if (typeof c.reconcile !== 'function') continue; try { c.reconcile('refresh'); n++; } catch (e) { log.warn?.(`[desktop-stream] ${id}: reconcile failed — ${e && e.message}`); } } return n; }
  function refreshAll() { let n = 0; for (const id of [...conns.keys()]) n += refresh(id); return n; }
  /** The seat of one socket: registers it with the election (a NAMED socket only — LOW-3) and with `conns`; returns { seat, forget }. */
  function takeSeat(id, viewerId, req, conn) {
    const seat = viewerSeats ? (viewerId || ANON) : null;
    if (!conns.has(id)) conns.set(id, new Set());
    conns.get(id).add(conn);
    conn.seat = seat;
    if (seat === ANON) { if (seatState(id, seat) === 'watch') log.log?.(`[desktop-stream] ${id}: an ANONYMOUS socket (no ?viewer=) is a read-only WATCH seat — only a named pane is ever elected`); }
    else if (seat) { try { viewerSeats.join(id, { viewerId: seat, pane: paneOf(req.url) || seat, prev: prevOf(req.url), ua: (req.headers && req.headers['user-agent']) || '' }); } catch (e) { log.warn?.(`[desktop-stream] ${id}: seats.join threw — ${e && e.message}`); } }
    let gone = false;
    const forget = () => {
      if (gone) return; gone = true;
      const set = conns.get(id); if (set) { set.delete(conn); if (!set.size) conns.delete(id); }
      if (seat && seat !== ANON) { try { viewerSeats.leave(id, seat); } catch (e) { log.warn?.(`[desktop-stream] ${id}: seats.leave threw — ${e && e.message}`); } }
    };
    return { seat, forget };
  }
  /** A CUT socket leaves the election at once (2.369.156): it never reconnects upstream, so it must not stay eligible
   *  for a re-election (the grace's end, LOW-4's older socket) while its close handshake runs — up to the ws library's
   *  30 s against a silently dropped peer. Deferred one turn: the cut runs inside the keeper's own broadcast. */
  const leaveOnCut = (seatRef) => { setImmediate(() => seatRef.forget()); };
  const BLOCKED_CLOSE = 4001;
  const BLOCKED_REASON = 'blocked: active on another client';
  const ENDED_CLOSE = 1001;

  // rv-desktop-apps F-B4 (lane dc-seams-desktop, 2026-10-05): the RELAY of each stream kind is its own module, ONE
  // line in src/server/stream-relays.js. It gets what this ONE bridge owns (the seats, the stats, the named closes, the
  // keepalive, the oversize close, the input policy) and pumps its protocol's bytes; the bridge spells no kind.
  const BRIDGE = { BLOCKED_CLOSE, BLOCKED_REASON, ENDED_CLOSE, INPUT_REPORT_MS, KA, WS_HIGH_WATER, WS_LOW_WATER, WebSocketClient, closeCodeOf, closeOversize, closed, inputPolicy, pinned, lastClose, leaveOnCut, log, netemQueue, now, onDesktopSize, onInput, onViewerLeft, open, opened, pingMs, refresh, resolveTargetSafe, seatState, stats, takeSeat, upstreamWhy, viewers, wsOversize };
  const bridges = Object.fromEntries(Object.entries(STREAM_RELAYS).map(([kind, r]) => [kind, r.bridgeOf(BRIDGE)]));

  /**
   * THE UPSTREAM ENDPOINT of a target (lane C2, docs/design-desktop-apps-seamless §3.5 — the ONLY change lane C
   * made to this bridge): an app on THIS machine is reached at 127.0.0.1:<its port>, exactly as before; an app on a
   * PAIRED machine at 127.0.0.1:<the hub-side forward port> (desktop-access.forwardPort: a hub loopback listener
   * piped over the agentd data plane, reference-counted — this bridge holds one reference per socket and releases
   * it when the socket closes). The protocol is end to end, so the x5 seats, the backpressure, the heartbeat, the
   * named closes and the clipboard / input policy below are untouched: they never learn which machine it is.
   * → `{ port, release }` (sync for this machine) or a Promise of it (a paired machine).
   */
  function streamEndpointFor(target) {
    if (!target.hostId || target.hostId === 'local') return { port: target.port, release: () => { }, local: true };
    if (typeof forwardPort !== 'function') return Promise.reject(Object.assign(new Error('this bridge cannot reach another machine (no picture forward wired)'), { code: 'host_unavailable' }));
    return Promise.resolve(forwardPort(target.hostId, target.port)).then((f) => {
      let released = false;
      return { port: f.localPort, release: () => { if (released) return; released = true; try { f.close?.(); } catch { /* gone */ } }, local: false };
    });
  }

  /** The upgrade handler for BOTH paths. `id` = upgradeId(pathname). */
  function handleUpgrade(req, socket, head, id) {
    if (!auth.requestAuthed(req)) { refuse(socket, 401, 'Unauthorized'); return; }
    let target = null;
    try { target = resolveTarget(id); } catch (e) { log.warn?.(`[desktop-stream] resolveTarget(${id}) threw: ${e.message}`); }
    if (!target || !target.port) { refuse(socket, 404, 'No such display'); return; }
    if (!Object.hasOwn(STREAM_RELAYS, target.kind)) { refuse(socket, 501, `unknown stream kind ${String(target.kind)}`); return; }
    const relay = STREAM_RELAYS[target.kind];
    // design 014 D1: a machine's WHOLE DESKTOP is for people only — an agent's token is refused by name (a page never
    // sends one; on an instance without sign-in the cookie check above lets everything through)
    if (target.humanOnly && bearerOf(req)) { log.warn?.(`[desktop-stream] ${id}: an agent token asked for a machine's whole desktop — refused (human_only)`); refuse(socket, 403, 'Forbidden human_only'); return; }
    const viewerId = viewerOf(req.url);
    // A VIEWER ID IS BOUND TO ITS SOCKET (2026-09-21, the verifier's finding): the id
    // is what inputPolicy and the takeover/handback routes trust, so a second
    // socket claiming a LIVE id would drive the window during the holder's
    // takeover (the old map `.set` REPLACED the holder). Refused 409 by name; a
    // pane reconnecting after a silent drop mints a fresh id (desktop-app-window).
    if (viewerId && viewerAlive(id, viewerId)) { stats.held++; log.warn?.(`[desktop-stream] ${id}: a second socket claimed live viewer ${viewerId} — refused (409 viewer id held)`); refuse(socket, 409, 'viewer id held'); return; }
    const upgrade = (port, release) => {
      // dev-only netem (a relay that declares `netem`): the upgrade url's own `?netem=` wins, else what the hosted-client route remembered for this id
      let netem = null;
      if (relay.netem && netemEnabled) { const q = netemOfUrl(req.url); netem = q != null ? parseNetem(q) : netemOf(id); }
      wss.handleUpgrade(req, socket, head, (ws) => { ws.once('close', release); bridges[target.kind]({ ws, id, port, viewerId, netem, req }); });
    };
    const ep = streamEndpointFor(target);
    if (ep.local) { upgrade(ep.port, ep.release); return; }
    // A SOCKET PARKED ON A PROMISE HAS NO ERROR LISTENER (verify r2 F1, 2026-09-25): node's http server removed its own
    // at 'upgrade' and ws attaches one only inside wss.handleUpgrade — which this path reaches AFTER the forward (4–600
    // ms). A viewer whose connection RESETS meanwhile (a phone switching networks, a killed browser, ETIMEDOUT) emitted
    // an unhandled 'error' ⇒ server.js's uncaughtException ⇒ process.exit(1): the whole hub. Attached BEFORE the park;
    // an error destroys the socket (its 'close' — or the destroyed check below — releases the forward, once), and it
    // is handed to ws's own listener at the upgrade so the live socket carries exactly what a local one does.
    const parkedError = (err) => { log.warn?.(`[desktop-stream] ${id}: the viewer's connection failed while the forward to ${target.hostId} opened — ${(err && (err.code || err.message)) || 'error'}`); try { socket.destroy(); } catch { /* gone */ } };
    socket.on('error', parkedError);
    ep.then((e) => {
      // The reference rides the SOCKET's own close too (release is idempotent): a viewer that half-closed while the
      // forward resolved is not destroyed yet, and ws then drops the handshake WITHOUT its callback (`!socket.readable
      // || !socket.writable` ⇒ destroy) — `ws.once('close')` would never be registered and the forward leaked a ref.
      socket.once('close', e.release);
      if (socket.destroyed || !socket.readable || !socket.writable) { e.release(); try { socket.destroy(); } catch { /* gone */ } return; }
      log.log?.(`[desktop-stream] ${id}: upstream on ${target.hostId}:${target.port} through the hub forward 127.0.0.1:${e.port}`);
      socket.removeListener('error', parkedError); // ws attaches its own, synchronously, at the top of handleUpgrade
      upgrade(e.port, e.release);
    }, (e) => { log.warn?.(`[desktop-stream] ${id}: ${target.hostId} unreachable — ${e && e.message}`); refuse(socket, 502, 'Machine unreachable'); });
  }

  return { lastCloseOf: (id) => { const c = lastClose.get(String(id)); return c ? { ...c } : null; }, handleUpgrade, streamEndpointFor, upgradeId, streamPath, stats: () => ({ ...stats }), wss, viewersOf, viewerAlive, connections, setNetem, netemOf, netemEnabled: !!netemEnabled, refresh, refreshAll };
}

module.exports = { livenessVerdict, SILENT_ROUNDS_TO_CUT, CLOSE_CODES, closeCodeOf, create, bearerOf, upgradeId, streamPath, viewerOf, paneOf, prevOf, WS_MAX_MESSAGE_BYTES, OVERSIZE_CLOSE, OVERSIZE_REASON, parseNetem, netemQueue, netemOfUrl, STREAM_RE, INPUT_REPORT_MS, WS_HIGH_WATER, WS_LOW_WATER, PING_MS, VIEWER_RE, STREAM_RELAYS };
