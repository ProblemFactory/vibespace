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
const net = require('net');
const { WebSocketServer, WebSocket } = require('ws');
const { DESKTOP_SINGLETON_ID } = require('../desktop-apps');

const STREAM_RE = /^\/api\/desktop\/([A-Za-z0-9._-]{1,80})\/stream$/;
const INPUT_REPORT_MS = 2000;
const PING_MS = 20000;            // ws keepalive cadence on a bridge (2.369.118); silent for 2 rounds = terminated + named
const WS_HIGH_WATER = 8 * 1024 * 1024;
const WS_LOW_WATER = 1024 * 1024;
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
const XPRA_MAX_PACKET_BYTES = 16 * 1024 * 1024;
const RFB_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const WS_MAX_MESSAGE_BYTES = XPRA_MAX_PACKET_BYTES + 8;
const OVERSIZE_CLOSE = 1009; // RFC 6455 "Message Too Big"
const OVERSIZE_REASON = 'packet-too-large';

// ── the client→server RFB stream, classified ────────────────────────────────
/** Client message types that are a HUMAN acting (RFB 6.4 + the QEMU
 *  extension noVNC negotiates): KeyEvent, PointerEvent, ClientCutText, and
 *  QEMU Client Message sub-type 0 (extended key event). */
const RFB_INPUT_TYPES = Object.freeze([4, 5, 6, 255]);
/**
 * Fixed lengths of the client messages, DERIVED FROM THE CLIENT WE SHIP —
 * every `RFB.messages.*` encoder in node_modules/@novnc/novnc/core/rfb.js
 * whose body is nothing but fixed pushes (scripts/test-desktop-apps.mjs
 * re-derives this table from that file and drives each shape through the
 * sieve: a wrong entry does not flip the sieve to `opaque`, it MISALIGNS it
 * for the rest of the connection, and every later KeyEvent is then read as
 * the tail of something else — r3, 2026-09-14: EnableContinuousUpdates
 * (150) was listed as 4 bytes; noVNC sends 10 (type, enable, x, y, w, h)
 * the moment a server accepts the ContinuousUpdates pseudo-encoding
 * (TigerVNC's Xvnc — the fleet image's rung — does; x11vnc 0.9.17 does not),
 * after which no KeyEvent counted and the idle stop could reap a session the
 * user was typing in). The variable ones — SetEncodings (2), ClientCutText
 * (6), ClientFence (248), SetDesktopSize (251), the QEMU sub-messages (255)
 * — and PointerEvent (5), whose length depends on its own marker bit (7
 * bytes with ExtendedMouseButtons, else 6), are computed in `rfbInputSieve`
 * from their own bytes.
 */
const RFB_FIXED_LEN = Object.freeze({ 0: 20, 3: 10, 4: 8, 150: 10, 250: 4 });
/**
 * A stateful classifier over ONE client's bytes. `feed(buf)` returns how many
 * INPUT messages that chunk completed. Phases: version (12 bytes) →
 * security type (1 byte; RFB 3.3 clients send none and cannot be followed) →
 * the type's own bytes (None: 0, VNCAuth: 16; anything else: opaque) →
 * ClientInit (1) → typed messages. `state.opaque` = the stream could not be
 * followed; from then on EVERY chunk counts as input (the conservative rule
 * this sieve replaced). Exported for the suite; PURE over its own state.
 */
function rfbInputSieve({ onDesktopSize = null } = {}) {
  // `parts`/`held` = the incomplete message's bytes, kept as a LIST while `need` says the next chunk cannot complete it
  // (never re-concatenated per chunk); `oversize` = a ClientCutText declared over RFB_MAX_MESSAGE_BYTES — the walk stops,
  // nothing is held from then on, and the bridge closes this viewer
  const st = { phase: 'version', opaque: false, parts: [], held: 0, need: 0, inputs: 0, messages: 0, why: null, oversize: null, refusing: false };
  const release = () => { st.parts = []; st.held = 0; st.need = 0; };
  const opaque = (why) => { st.opaque = true; st.why = why; release(); };
  /**
   * The ONE parser. Walks `chunk` (+ whatever was pending) and calls
   * `emit(bytes, isInput)` for every COMPLETE unit — a handshake piece or a
   * typed message — in order; a partial message stays pending. On the
   * transition to `opaque` the rest of the chunk (and everything after) is
   * emitted as ONE unit marked input. Returns how many input units it saw.
   */
  function walk(chunk, emit) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (st.oversize) return 0;
    if (st.opaque) { st.inputs++; emit(buf, true); return 1; }
    if (st.need && st.held + buf.length < st.need) { st.parts.push(Buffer.from(buf)); st.held += buf.length; return 0; }
    let b = st.held ? Buffer.concat([...st.parts, buf]) : buf;
    release();
    let got = 0;
    const cut = (n, input, type) => { const u = b.subarray(0, n); b = b.subarray(n); emit(u, input, type); };
    const giveUp = (why) => { opaque(why); st.inputs++; got++; emit(b, true); b = Buffer.alloc(0); };
    for (;;) {
      if (st.phase === 'version') {
        if (b.length < 12) break;
        const v = b.subarray(0, 12).toString('latin1');
        const m = /^RFB (\d{3})\.(\d{3})\n$/.exec(v);
        if (!m) { giveUp(`not an RFB version string: ${JSON.stringify(v)}`); break; }
        if (Number(m[1]) === 3 && Number(m[2]) < 7) { giveUp(`RFB 3.${Number(m[2])}: the server picks the security type, the client sends none — cannot be followed`); break; }
        cut(12, false);
        st.phase = 'security';
      } else if (st.phase === 'security') {
        if (b.length < 1) break;
        const t = b[0];
        if (t === 1) { cut(1, false); st.phase = 'clientinit'; }
        else if (t === 2) { cut(1, false); st.phase = 'vncauth'; }
        else { giveUp(`security type ${t} is not None/VNCAuth`); break; }
      } else if (st.phase === 'vncauth') {
        if (b.length < 16) break;
        cut(16, false); st.phase = 'clientinit';
      } else if (st.phase === 'clientinit') {
        if (b.length < 1) break;
        cut(1, false); st.phase = 'messages';
      } else {
        if (b.length < 1) break;
        const t = b[0];
        let len;
        if (RFB_FIXED_LEN[t] !== undefined) len = RFB_FIXED_LEN[t];
        else if (t === 2) { if (b.length < 4) break; len = 4 + 4 * b.readUInt16BE(2); }                 // SetEncodings
        else if (t === 5) { if (b.length < 2) break; len = (b[1] & 0x80) ? 7 : 6; }                     // PointerEvent; marker bit = ExtendedMouseButtons (one more byte)
        else if (t === 6) {                                                                             // ClientCutText (extended: negative length)
          if (b.length < 8) break;
          const declared = Math.abs(b.readInt32BE(4));
          if (declared > RFB_MAX_MESSAGE_BYTES) { st.oversize = { declared, cap: RFB_MAX_MESSAGE_BYTES, what: 'ClientCutText' }; b = Buffer.alloc(0); break; }
          len = 8 + declared;
        }
        else if (t === 248) { if (b.length < 9) break; len = 9 + b[8]; }                               // ClientFence: 3 pad + u32 flags + u8 length + payload
        else if (t === 251) { if (b.length < 8) break; len = 8 + 16 * b[6]; }                          // SetDesktopSize
        else if (t === 255) { if (b.length < 2) break; if (b[1] === 0) len = 12; else { giveUp(`QEMU client sub-message ${b[1]}`); break; } } // QEMU: 0 = extended key event
        else { giveUp(`unknown client message type ${t}`); break; }
        if (b.length < len) { st.need = len; break; }
        st.messages++;
        // P8-2 x4: a SetDesktopSize is the client asking the DISPLAY to follow its pane — reported
        // (never an input: nobody typed) so the keeper can fit the app to the size the server takes. A REFUSED viewer's
        // is cut by strip() (r8, the xpra display-size fence's twin) and so never reported: the display did not move.
        if (t === 251 && onDesktopSize && !st.refusing) { try { onDesktopSize(b.readUInt16BE(2), b.readUInt16BE(4)); } catch { /* the keeper is optional here */ } }
        const input = RFB_INPUT_TYPES.includes(t);
        if (input) { st.inputs++; got++; }
        cut(len, input, t);
      }
    }
    if (!st.opaque && !st.oversize && b.length) { st.parts = [Buffer.from(b)]; st.held = b.length; } else if (!b.length) st.need = 0;
    return got;
  }
  /** How many INPUT messages this chunk completed (the idle clock's question). */
  function feed(chunk) { return walk(chunk, () => { }); }
  /**
   * The relay's question (P9b): the chunk with its input messages REMOVED
   * when `allowInput` is false — `{inputs, relay: Buffer|null, dropped}`.
   * Complete units only (a partial message waits for its next chunk — the
   * server could not act on it anyway); an opaque stream is all-or-nothing.
   */
  function strip(chunk, allowInput = true) {
    const keep = []; let inputs = 0, dropped = 0;
    // THE DISPLAY-SIZE FENCE on this kind (r8, 2026-09-22 — the twin of XPRA_DISPLAY_TYPES): a refused viewer's
    // SetDesktopSize is cut like input — Xvnc -AcceptSetDesktopSize resizes the SHARED display for whoever asks. Nothing
    // is held for a takeover: the shipped noVNC never asks while viewOnly (rfb.js _requestRemoteResize returns on
    // _viewOnly), so only a client that ignores its own Watch mode ever sends one here.
    st.refusing = !allowInput;
    try { walk(chunk, (u, input, type) => { if (input) inputs++; if ((input || type === 251) && !allowInput) dropped++; else if (u.length) keep.push(u); }); } finally { st.refusing = false; }
    return { inputs, dropped, oversize: st.oversize, relay: keep.length ? (keep.length === 1 ? keep[0] : Buffer.concat(keep)) : null };
  }
  const state = () => { const { parts, held, ...rest } = st; return { ...rest, pending: held }; };
  return { feed, strip, state };
}

// ── the client→server XPRA packet stream, classified ────────────────────────
/** Packet types a HUMAN produces at the html5 client (xpra's server-side
 *  keyboard/pointer/clipboard/window handlers, v6.5.3, read from
 *  xpra/server/subsystem/{keyboard,pointer,clipboard}.py's add_packets and the
 *  client's PACKET_TYPES). Everything else the client sends — ping/ping_echo,
 *  damage-sequence, buffer-refresh, hello, connection-data, desktop_size,
 *  configure-window, map/unmap-window, info-request, logging, layout/keymap
 *  changes, set-clipboard-enabled, sound-control, suspend/resume — is the
 *  client talking, not the user. */
const XPRA_INPUT_TYPES = Object.freeze(new Set(['key-action', 'keyboard-event', 'key-repeat', 'button-action', 'pointer-button', 'pointer', 'pointer-motion', 'pointer-position', 'pointer-wheel', 'wheel-motion', 'clipboard-token', 'clipboard-contents', 'close-window', 'focus', 'start-command']));
/** The packets a REFUSED viewer (Watch mode / held) may still send: what the
 *  picture needs, nothing that acts on the session. Exported for the suite.
 *  x5 (2026-09-22, the round-3 verify's one open item): `configure-window`
 *  and `unmap-window` LEFT this list — xpra 6.5.3 applies a configure-window's
 *  geometry from ANY client that is not read-only (x11/server/seamless.py
 *  do_process_window_configure: `if geometry and not window.is_OR() and not
 *  self.readonly`) and an unmap-window unmaps the window for EVERY client
 *  (_process_window_unmap: `window.unmap()`), so a Watch pane smaller than the
 *  holder's resized the holder's app. The geometry is the ACTIVE viewer's:
 *  a refused configure-window is cut and HELD (XPRA_GEOMETRY_TYPES, replayed
 *  at a takeover), an unmap-window is cut (the shipped client never sends one). */
const XPRA_WATCH_TYPES = Object.freeze(new Set(['hello', 'ping', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh', 'clipboard-contents-none']));
/** THE KEYMAP FENCE (2026-09-22, the r6 verify's open hole B — measured on the
 *  real rung: a Watch viewer's `keyboard-config` reprogrammed the display's X
 *  keymap, keycode 250 XF86Prev_VMode → ydiaeresis in 2 s, because xpra 6.5.3
 *  APPLIES a client's keymap (x11/subsystem/keyboard.py set_keymap →
 *  set_all_keycodes) whenever no other keyboard client is connected — and the
 *  X keymap is SHARED state: the holder, or an agent's xdotool, types through
 *  it). Not watch types: a refused viewer's keymap packets are cut like input.
 *  The picture does not need them — measured: hello → new-window → map-window
 *  → the first draw in ~100 ms with no keymap packet sent at all (xpra 6.5.3
 *  DELAYS the hello's own keymap, `XPRA_DELAY_KEYBOARD_DATA` default true, so
 *  the hello programs nothing). An input-allowed viewer's pass as before. */
const XPRA_KEYMAP_TYPES = Object.freeze(new Set(['keyboard-config', 'keymap-changed']));
/** …and a fenced keymap is HELD, not lost (measured: a pane that connected in Watch mode and then TOOK OVER typed
 *  " \x1bOP" for "abc" — the shipped client sends its keymap once, after the hello, so xpra read its JS keycodes as X
 *  keycodes): the LAST keymap packet a refused viewer sent is kept and relayed ahead of everything else the first time
 *  its input is allowed. One packet per viewer, at most XPRA_KEYMAP_HOLD_BYTES (the shipped client's is 2.4 KB, 3.4 KB
 *  with 30 IME rows); a bigger one is dropped and not held. */
const XPRA_KEYMAP_HOLD_BYTES = 64 * 1024;
/** THE DISPLAY-SIZE FENCE (2026-09-22, round 3 of the P8-2 verify — reproduced on the real rung: a holder's pane sized
 *  the display 900x600, a Watch viewer's `display-configure` 1x1 shrank the SHARED virtual display to 1x1 — the
 *  holder's app collapsed — and it stayed 1x1 after the watcher left: xpra 6.5.3 `_process_display_configure` calls
 *  set_screen_size for whichever client sent it). The r7 keymap rule verbatim: the virtual root is shared state the
 *  holder sees and an agent's xdotool acts in; a read-only pane draws the holder-sized picture and never needs to size
 *  it. Cut like input for a refused viewer, the LAST one HELD (<= XPRA_DISPLAY_HOLD_BYTES; the shipped client's is
 *  ~60 B) and replayed at its takeover beside the keymap, so the pane that took over gets its own fit. An allowed
 *  viewer's pass as before. A hello's desktop_size caps are not these packets (measured: a second client's hello
 *  leaves an existing holder's size alone). */
const XPRA_DISPLAY_TYPES = Object.freeze(new Set(['display-configure', 'configure-display', 'desktop_size']));
const XPRA_DISPLAY_HOLD_BYTES = 16 * 1024;
/** THE GEOMETRY FENCE (x5, see XPRA_WATCH_TYPES): a refused viewer's configure-window is cut and the LAST one held
 *  (the shipped client's is ~40 B) — replayed at its takeover after the keymap and the display size, so the app
 *  re-fits to the pane that took over. */
const XPRA_GEOMETRY_TYPES = Object.freeze(new Set(['configure-window']));
const XPRA_GEOMETRY_HOLD_BYTES = 16 * 1024;
/** A BLOCKED viewer (x5) has no upstream at all: its hello is HELD (the last one, at most XPRA_HELLO_HOLD_BYTES — the
 *  shipped client's is ~3 KB) and sent first when it becomes active, so the dormant client connects then. */
const XPRA_HELLO_HOLD_BYTES = 256 * 1024;
/** What a refused viewer's HELD packets are, in replay order: the kind's name (the log line's words), its types, its cap. */
const XPRA_HELD_KINDS = Object.freeze([
  Object.freeze({ key: 'heldKeymap', words: 'keymap', types: XPRA_KEYMAP_TYPES, cap: XPRA_KEYMAP_HOLD_BYTES }),
  Object.freeze({ key: 'heldDisplay', words: 'display size', types: XPRA_DISPLAY_TYPES, cap: XPRA_DISPLAY_HOLD_BYTES }),
  Object.freeze({ key: 'heldGeometry', words: 'window geometry', types: XPRA_GEOMETRY_TYPES, cap: XPRA_GEOMETRY_HOLD_BYTES }),
]);
/** Server lifecycle: the keeper's act, never a viewer's — dropped from EVERY viewer. */
const XPRA_LIFECYCLE_TYPES = Object.freeze(new Set(['shutdown-server', 'exit-server']));
const XPRA_HEADER = 8;
const XPRA_FLAGS_ENCODER = 0x1 | 0x4 | 0x10; // rencode | yaml | rencodeplus; 0 = bencode
/** The first element of a rencode/rencodeplus/bencode LIST — the packet type
 *  — or null when it cannot be read from these bytes. rencode(plus): list =
 *  192+n (n < 64) or CHR_LIST 59, a fixed string = 128+len then bytes, a long
 *  string = ascii length ':' bytes; bencode: 'l' then '<len>:<bytes>'. */
function xpraPacketType(payload) {
  if (!payload || payload.length < 2) return null;
  const b0 = payload[0];
  let i;
  if (b0 >= 192 && b0 < 256) i = 1;                  // fixed-length list
  else if (b0 === 59) i = 1;                          // CHR_LIST
  else if (b0 === 0x6c) i = 1;                        // bencode 'l'
  else return null;
  const s0 = payload[i];
  if (s0 >= 128 && s0 < 192) { const len = s0 - 128; return payload.length >= i + 1 + len ? payload.toString('utf8', i + 1, i + 1 + len) : null; }
  const m = /^(\d{1,3}):/.exec(payload.toString('latin1', i, Math.min(payload.length, i + 5)));
  if (!m) return null;
  const len = Number(m[1]); const start = i + m[0].length;
  return payload.length >= start + len ? payload.toString('utf8', start, start + len) : null;
}
/** The leading STRING elements of a rencode/bencode list (the packet type and,
 *  for `disconnect`, its reasons) — stops at the first non-string; at most
 *  `max`. Enough to NAME why the xpra side closed, never a full decoder. */
function xpraStrings(payload, max = 4) {
  const out = [];
  if (!payload || payload.length < 2) return out;
  let i = payload[0] === 0x6c || payload[0] === 59 || payload[0] >= 192 ? 1 : -1;
  if (i < 0) return out;
  while (out.length < max && i < payload.length) {
    const b = payload[i];
    if (b >= 128 && b < 192) { const len = b - 128; if (payload.length < i + 1 + len) break; out.push(payload.toString('utf8', i + 1, i + 1 + len)); i += 1 + len; continue; }
    const m = /^(\d{1,3}):/.exec(payload.toString('latin1', i, Math.min(payload.length, i + 5)));
    if (!m) break;
    const len = Number(m[1]); const start = i + m[0].length;
    if (payload.length < start + len) break;
    out.push(payload.toString('utf8', start, start + len)); i = start + len;
  }
  return out;
}
/**
 * A stateful classifier over ONE client's xpra bytes. `feed(buf)` returns how
 * many INPUT packets that chunk completed; a packet spanning chunks waits
 * for its tail. `strip(buf, allowInput)` (2026-09-22, the window-live policy
 * on this kind) walks the same units and returns `{inputs, dropped, relay}`:
 * every COMPLETE unit — a main packet (index 0) together with the raw chunks
 * (index > 0) that PRECEDE it (xpra's net/protocol.py sends a packet's large
 * byte items as raw chunks first and the main packet last; the upstream
 * html5 Protocol.js never splits, one uncompressed packet per ws message) —
 * is relayed, except (since round 2 of the verify) a unit whose type is not
 * in XPRA_WATCH_TYPES when `allowInput` is false and a XPRA_LIFECYCLE_TYPES
 * unit always — each cut out WHOLE. `lifecycle` counts the latter (the
 * bridge names them in a warn line: no shipped client sends one). Unreadable bytes count as input (see the header), so a refused
 * viewer's unreadable bytes are dropped: the direction that never injects
 * behind a refusal. An incomplete tail is HELD until it completes (the xpra
 * server needs the whole packet anyway). `state()` for the suite.
 */
function xpraInputSieve({ maxPacket = XPRA_MAX_PACKET_BYTES } = {}) {
  // `parts`/`held` = the incomplete packet's bytes, a LIST while `need` says the next chunk cannot complete it (never
  // re-concatenated per chunk); `groupBytes` = the raw chunks waiting for their main packet. Their sum is capped at one
  // largest packet (maxPacket + its header) and a header may declare at most maxPacket: past either, `oversize` is set,
  // everything held is released and the walk stops for good — the bridge closes this viewer (see XPRA_MAX_PACKET_BYTES)
  const st = { parts: [], held: 0, need: 0, group: [], groupBytes: 0, inputs: 0, packets: 0, unread: 0, lastType: null, oversize: null, heldKeymap: null, heldDisplay: null, heldGeometry: null, heldHello: null };
  const maxHeld = maxPacket + XPRA_HEADER;
  const tooLarge = (o) => { st.oversize = { cap: maxPacket, ...o }; st.parts = []; st.held = 0; st.need = 0; st.group = []; st.groupBytes = 0; st.heldKeymap = null; st.heldDisplay = null; st.heldGeometry = null; st.heldHello = null; };
  /** visit(unitBytes, isInput, type) for every complete unit the bytes so far close */
  function walk(chunk, visit) {
    if (st.oversize) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (st.need && st.held + buf.length < st.need) {
      if (st.groupBytes + st.held + buf.length > maxHeld) { tooLarge({ declared: st.need - XPRA_HEADER, held: st.groupBytes + st.held + buf.length, what: 'raw chunks + a partial packet' }); return; }
      st.parts.push(Buffer.from(buf)); st.held += buf.length; return;
    }
    let b = st.held ? Buffer.concat([...st.parts, buf]) : buf;
    st.parts = []; st.held = 0; st.need = 0;
    for (;;) {
      if (b.length < XPRA_HEADER) break;
      if (b[0] !== 0x50) { // not a header: unreadable ⇒ counts, resync on the next chunk
        st.unread++; st.inputs++;
        const u = st.group.length ? Buffer.concat([...st.group, b]) : Buffer.from(b);
        st.group = []; st.groupBytes = 0; b = Buffer.alloc(0);
        visit(u, true, null);
        break;
      }
      const flags = b[1], level = b[2], index = b[3], size = b.readUInt32BE(4);
      // the DECLARED size is judged the moment the header is readable — within the chunk that carries it, never after
      // the bytes arrived (xpra's own check: payload_size > max_packet_size, net/protocol/socket_handler.py)
      if (size > maxPacket) { tooLarge({ declared: size, held: st.groupBytes + b.length, what: 'packet header' }); b = Buffer.alloc(0); break; }
      if (b.length < XPRA_HEADER + size) {
        if (st.groupBytes + b.length > maxHeld) { tooLarge({ declared: size, held: st.groupBytes + b.length, what: 'raw chunks + a partial packet' }); b = Buffer.alloc(0); break; }
        st.need = XPRA_HEADER + size; break;
      }
      const whole = b.subarray(0, XPRA_HEADER + size);
      const payload = whole.subarray(XPRA_HEADER);
      b = b.subarray(XPRA_HEADER + size);
      st.packets++;
      if (index !== 0) { // a raw chunk travels with the main packet that FOLLOWS it
        st.group.push(Buffer.from(whole)); st.groupBytes += whole.length;
        if (st.groupBytes > maxHeld) { tooLarge({ declared: size, held: st.groupBytes, what: 'raw chunks' }); b = Buffer.alloc(0); break; }
        continue;
      }
      const enc = flags & XPRA_FLAGS_ENCODER;
      const type = level === 0 && (enc === 0 || enc === 0x1 || enc === 0x10) ? xpraPacketType(payload) : null;
      st.lastType = type;
      const input = type === null || XPRA_INPUT_TYPES.has(type); // compressed / yaml / undecodable ⇒ counts
      if (type === null) st.unread++;
      if (input) st.inputs++;
      const u = st.group.length ? Buffer.concat([...st.group, whole]) : whole;
      st.group = []; st.groupBytes = 0;
      visit(u, input, type);
    }
    if (b.length && !st.oversize) { st.parts = [Buffer.from(b)]; st.held = b.length; } else st.need = 0;
  }
  function feed(chunk) { let got = 0; walk(chunk, (u, input) => { if (input) got++; }); return got; }
  /** `hold` (x5): a BLOCKED viewer — nothing is relayed at all; its hello and the held kinds are kept for `release()`. */
  function strip(chunk, allowInput = true, { hold = false } = {}) {
    let inputs = 0, dropped = 0, lifecycle = 0;
    const keep = [];
    if (hold) allowInput = false;
    walk(chunk, (u, input, type) => {
      if (input) inputs++;
      const life = type !== null && XPRA_LIFECYCLE_TYPES.has(type);
      if (life) lifecycle++;
      if (life || (!allowInput && !(type !== null && XPRA_WATCH_TYPES.has(type)))) dropped++; else keep.push(u);
      // x5: a BLOCKED viewer relays NOTHING — what the allowlist kept comes back out; its hello is held for the moment it becomes active
      if (hold && keep[keep.length - 1] === u) { keep.pop(); if (type === 'hello' && u.length <= XPRA_HELLO_HOLD_BYTES) st.heldHello = Buffer.from(u); else dropped++; }
      // THE KEYMAP + DISPLAY-SIZE FENCES' other half: a refused viewer's keymap / display size is cut above and HELD
      // here (the last one of each) for its takeover
      if (!allowInput && type !== null) for (const h of XPRA_HELD_KINDS) if (h.types.has(type)) st[h.key] = u.length <= h.cap ? Buffer.from(u) : null;
    });
    const replayedKinds = [];
    if (hold) return { inputs, dropped, lifecycle, replayed: 0, replayedKinds, oversize: st.oversize, relay: null };
    if (allowInput && !st.oversize) {
      const held = [];
      for (const h of XPRA_HELD_KINDS) if (st[h.key]) { held.push(st[h.key]); replayedKinds.push(h.words); st[h.key] = null; }
      keep.unshift(...held);
    }
    return { inputs, dropped, lifecycle, replayed: replayedKinds.length, replayedKinds, oversize: st.oversize, relay: keep.length ? (keep.length === 1 ? keep[0] : Buffer.concat(keep)) : null };
  }
  /** x5: what a blocked viewer said, in replay order — its hello, then the held kinds — as ONE buffer (null = nothing), cleared. */
  function release() {
    if (st.oversize) return { relay: null, kinds: [] };
    const out = [], kinds = [];
    if (st.heldHello) { out.push(st.heldHello); kinds.push('hello'); st.heldHello = null; }
    for (const h of XPRA_HELD_KINDS) if (st[h.key]) { out.push(st[h.key]); kinds.push(h.words); st[h.key] = null; }
    return { relay: out.length ? Buffer.concat(out) : null, kinds };
  }
  const state = () => { const { parts, held, group, heldKeymap, heldDisplay, heldGeometry, heldHello, ...rest } = st; return { ...rest, pending: held, group: group.length, heldKeymap: heldKeymap ? heldKeymap.length : 0, heldDisplay: heldDisplay ? heldDisplay.length : 0, heldGeometry: heldGeometry ? heldGeometry.length : 0, heldHello: heldHello ? heldHello.length : 0 }; };
  return { feed, strip, release, state };
}

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
 *   onViewerLeft  — (id, viewerId) => void  (P9b; the holder's socket closed)
 *   viewerSeats   — P8-2 x5 (absent ⇒ every socket relayed as before, the policy above alone):
 *                   { join(id, {viewerId, pane, prev, ua}), leave(id, viewerId), state(id, viewerId) → 'active'|'blocked'|'watch'|'free' }
 *                   — the keeper's ONE-ACTIVE-VIEWER election composed with the engine's lease (window-live-wiring);
 *                   only a NAMED socket (`?viewer=`) is seated (2.369.156, LOW-3): an ANONYMOUS one — the hosted
 *                   upstream page, a script — is a read-only WATCH seat on a governed stream (`state(id, null)`
 *                   answering anything but 'free'), never elected, never blocked. `refresh(id)` re-applies it.
 *   log
 */
function create({ auth, resolveTarget, forwardPort = null, onInput = () => { }, onDesktopSize = null, inputPolicy = null, onViewerLeft = null, viewerSeats = null, log = console, now = Date.now, pingMs = PING_MS, netemEnabled = false, WebSocketClient = WebSocket } = {}) {
  if (!auth || typeof auth.requestAuthed !== 'function') throw new Error('desktop-stream: auth.requestAuthed is required');
  if (typeof resolveTarget !== 'function') throw new Error('desktop-stream: resolveTarget is required');
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_MESSAGE_BYTES });
  const stats = { opened: 0, refused: 0, relayed: 0, dropped: 0, held: 0, netem: 0, lifecycle: 0, oversize: 0, blocked: 0, cut: 0 };
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
    log.warn?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} sent an oversized ${kind} message (${what}) — closed ${OVERSIZE_CLOSE} ${OVERSIZE_REASON}; the ${kind === 'xpra' ? 'xpra server' : 'VNC server'} and the other viewers are untouched`);
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

  /** RFB over WebSocket (websockify semantics: binary frames ↔ raw TCP). */
  function bridgeRfb(ws, id, port, viewerId = null, req = {}) {
    stats.opened++; opened(id);
    let sock = null;      // the TCP side — opened at once, or (x5) only while this viewer is not blocked
    let cutDone = false;  // x5: this socket was cut (it became blocked while connected) — it never reconnects upstream
    const openedAt = now();
    let lastInputReport = 0, down = 0, up = 0, closedBy = null, logged = false, dropped = 0, lastRefusal = null, oversized = false;
    if (viewerId) { if (!viewers.has(id)) viewers.set(id, new Map()); viewers.get(id).set(viewerId, ws); }
    const leave = () => { if (!viewerId) return; const m = viewers.get(id); if (m && m.get(viewerId) === ws) { m.delete(viewerId); if (!m.size) viewers.delete(id); try { onViewerLeft?.(id, viewerId); } catch (e) { log.warn?.(`[desktop-stream] ${id}: onViewerLeft failed — ${e && e.message}`); } } };
    // KEEPALIVE + A NAMED CLOSE (2.369.118, userW's "Desktop disconnected" with
    // nothing in any log): an RFB stream over a static screen carries NO bytes
    // for minutes, and a proxy on the way drops a silent WebSocket without
    // telling either end — the old bridge had no ping and logged neither the
    // open nor the close, so the incident bundle held zero evidence. Ping every
    // pingMs (the browser answers on its own); a peer silent for two rounds is
    // terminated and NAMED; every close logs who closed, after how long, and
    // how many bytes went each way.
    let alive = true;
    const pinger = setInterval(() => {
      if (ws.readyState !== 1) { clearInterval(pinger); return; }
      if (!alive) { closedBy = closedBy || `no pong for ${2 * pingMs} ms`; clearInterval(pinger); try { ws.terminate(); } catch { /* gone */ } return; }
      alive = false;
      try { ws.ping(); } catch { /* closing */ }
    }, pingMs);
    ws.on('pong', () => { alive = true; });
    const conn = {};
    const seatRef = takeSeat(id, viewerId, req, conn);
    const finish = (why) => {
      if (logged) return;
      logged = true; closed(id);
      clearInterval(pinger);
      const dur = Math.round((now() - openedAt) / 1000);
      log.log?.(`[desktop-stream] ${id}: closed (${closedBy || why}) after ${dur}s, ${down} B to the browser, ${up} B to the server${viewerId ? `, viewer ${viewerId}` : ''}${dropped ? `, ${dropped} input message(s) refused (${lastRefusal || 'policy'})` : ''}`);
      seatRef.forget();
      leave();
    };
    // P8-2 x4: the client's SetDesktopSize (RFB 251) is REPORTED as it passes — `onDesktopSize(id, w, h, viewerId)` — so
    // the app follows the size the server takes. It is not input, but since r8 a REFUSED viewer's is cut (never relayed,
    // never reported): the display is the holder's, shared — the twin of the xpra display-size fence
    const sieve = rfbInputSieve({ onDesktopSize: onDesktopSize ? (w, h) => onDesktopSize(id, w, h, viewerId) : null });
    const openTcp = () => {
      if (sock || cutDone || ws.readyState !== 1) return;
      sock = net.connect(port, '127.0.0.1');
      log.log?.(`[desktop-stream] ${id}: bridge opened → 127.0.0.1:${port}${viewerId ? ` (viewer ${viewerId})` : ''}`);
      sock.on('data', (d) => {
        if (ws.readyState !== 1) return;
        down += d.length;
        ws.send(d);
        // Backpressure: a fast framebuffer + slow client would balloon the WS
        // buffer — pause the TCP side until the browser drains.
        if (ws.bufferedAmount > WS_HIGH_WATER) {
          sock.pause();
          const t = setInterval(() => {
            if (ws.readyState !== 1) { clearInterval(t); return; }
            if (ws.bufferedAmount < WS_LOW_WATER) { clearInterval(t); sock.resume(); }
          }, 50);
        }
      });
      sock.on('close', () => { if (cutDone) return; closedBy = closedBy || 'the VNC server closed its socket'; try { ws.close(); } catch { /* already closed */ } finish('server side'); });
      sock.on('error', (e) => { if (cutDone) return; closedBy = closedBy || `VNC server socket error ${(e && e.code) || ''}`.trim(); try { ws.close(); } catch { /* already closed */ } });
    };
    /** x5: this socket became blocked while connected — its TCP side closes and the socket closes 4001 (see the header). */
    const cut = (why) => {
      if (cutDone) return;
      cutDone = true; stats.cut++;
      closedBy = closedBy || `${BLOCKED_REASON} (${why})`;
      try { sock?.destroy(); } catch { /* gone */ }
      try { ws.close(BLOCKED_CLOSE, BLOCKED_REASON); } catch { /* closing */ }
      leaveOnCut(seatRef);
    };
    conn.reconcile = (why) => {
      if (ws.readyState !== 1 || cutDone) return;
      if (resolveTargetSafe(id) === null) { closedBy = closedBy || 'the app session ended'; try { ws.close(ENDED_CLOSE, 'the app session ended'); } catch { /* closing */ } return; }
      const s = seatState(id, seatRef.seat);
      if (s === 'blocked') { if (sock) cut(why); return; }
      if (!sock) openTcp();
    };
    conn.cut = cut;
    if (seatState(id, seatRef.seat) !== 'blocked') openTcp();
    else log.log?.(`[desktop-stream] ${id}: viewer ${viewerId || 'anonymous'} is BLOCKED (another client is active) — no upstream until it resumes here`);
    ws.on('message', (m) => {
      up += (m && m.length) || 0;
      const s = seatState(id, seatRef.seat);
      if (s === 'blocked' || !sock) { // x5: a blocked viewer reaches nothing (the shipped noVNC sends nothing before the server's banner)
        dropped++; stats.blocked++; lastRefusal = 'blocked';
        if (s !== 'blocked') conn.reconcile('message');
        return;
      }
      // THE POLICY (P9b): asked per chunk, applied per MESSAGE — a refused
      // KeyEvent is cut out, the FramebufferUpdateRequest beside it goes through
      let allow = true;
      if (s === 'watch') { allow = false; lastRefusal = 'watch-mode'; }
      else if (s === 'free' && inputPolicy) { try { const p = inputPolicy(id, viewerId); if (p && p.relay === false) { allow = false; lastRefusal = p.code || 'refused'; } } catch (e) { log.warn?.(`[desktop-stream] ${id}: inputPolicy threw — relaying: ${e && e.message}`); } }
      const r = sieve.strip(m, allow);
      if (r.relay) { stats.relayed++; try { sock.write(r.relay); } catch { /* socket closing */ } }
      if (r.dropped) { dropped += r.dropped; stats.dropped += r.dropped; }
      if (r.oversize) { if (!oversized) { oversized = true; closedBy = closedBy || closeOversize(ws, id, viewerId, r.oversize, 'rfb'); } return; }
      if (!r.inputs || !allow) return; // a FramebufferUpdateRequest / SetEncodings / the handshake is not a human; a refused input is nobody at the keyboard
      const t = now();
      if (t - lastInputReport >= INPUT_REPORT_MS) { lastInputReport = t; try { onInput(id, viewerId); } catch { /* keeper is optional here */ } }
    });
    ws.on('close', (code, reason) => { finish(`the browser closed, code ${code}${reason && reason.length ? ' ' + String(reason).slice(0, 60) : ''}`); try { sock?.destroy(); } catch { /* gone */ } });
    ws.on('error', (e) => { closedBy = closedBy || wsOversize(e, id, viewerId, 'rfb') || `browser socket error ${(e && e.code) || ''}`.trim(); try { sock?.destroy(); } catch { /* gone */ } });
  }

  /**
   * xpra over WebSocket ↔ the xpra server's own WebSocket (P8-2). Binary both
   * ways, one message per packet; the upstream `ws` client is PAUSED while
   * the browser's send buffer is above WS_HIGH_WATER (the rfb bridge pauses
   * its TCP side the same way); pings, the named close and the policy as in
   * bridgeRfb; `netem` = { rttMs, kbps } | null. x5: the upstream exists only
   * while this viewer is not blocked (see `seats` above).
   */
  function bridgeXpra(ws, id, port, viewerId = null, netem = null, req = {}) {
    stats.opened++; opened(id);
    const openedAt = now();
    let lastInputReport = 0, down = 0, up = 0, closedBy = null, logged = false, dropped = 0, lastRefusal = null, oversized = false;
    let upstream = null, cutDone = false;
    if (viewerId) { if (!viewers.has(id)) viewers.set(id, new Map()); viewers.get(id).set(viewerId, ws); }
    const leave = () => { if (!viewerId) return; const m = viewers.get(id); if (m && m.get(viewerId) === ws) { m.delete(viewerId); if (!m.size) viewers.delete(id); try { onViewerLeft?.(id, viewerId); } catch (e) { log.warn?.(`[desktop-stream] ${id}: onViewerLeft failed — ${e && e.message}`); } } };
    const q = netem ? { down: netemQueue(netem, now), up: netemQueue(netem, now) } : null;
    if (netem) stats.netem++;
    let alive = true;
    const pinger = setInterval(() => {
      if (ws.readyState !== 1) { clearInterval(pinger); return; }
      if (!alive) { closedBy = closedBy || `no pong for ${2 * pingMs} ms`; clearInterval(pinger); try { ws.terminate(); } catch { /* gone */ } return; }
      alive = false;
      try { ws.ping(); } catch { /* closing */ }
    }, pingMs);
    ws.on('pong', () => { alive = true; });
    const conn = {};
    const seatRef = takeSeat(id, viewerId, req, conn);
    const finish = (why) => {
      if (logged) return;
      logged = true; closed(id);
      clearInterval(pinger);
      if (q) { q.down.stop(); q.up.stop(); }
      const dur = Math.round((now() - openedAt) / 1000);
      log.log?.(`[desktop-stream] ${id}: closed (${closedBy || why}) after ${dur}s, ${down} B to the browser, ${up} B to the server (xpra)${viewerId ? `, viewer ${viewerId}` : ''}${dropped ? `, ${dropped} packet(s) refused (${lastRefusal || 'policy'})` : ''}${netem ? `, netem rtt ${netem.rttMs} ms / ${netem.kbps || '∞'} kbps` : ''}`);
      seatRef.forget();
      leave();
    };
    const sendDown = (d) => { if (ws.readyState !== 1) return; ws.send(d); if (upstream && ws.bufferedAmount > WS_HIGH_WATER && !upstream.isPaused) { upstream.pause(); const t = setInterval(() => { if (ws.readyState !== 1) { clearInterval(t); return; } if (ws.bufferedAmount < WS_LOW_WATER) { clearInterval(t); try { upstream.resume(); } catch { /* closed */ } } }, 50); } };
    const sieve = xpraInputSieve();
    const pendingUp = [];
    const flushUp = () => { while (pendingUp.length && upstream && upstream.readyState === 1) { try { upstream.send(pendingUp.shift()); } catch { /* closing */ } } };
    const sendUp = (m) => { if (!upstream) return; if (upstream.readyState === 1) { try { upstream.send(m); } catch { /* closing */ } } else if (upstream.readyState === 0) pendingUp.push(m); };
    const relayUp = (out) => { stats.relayed++; if (q) q.up.send(out.length, () => sendUp(out)); else sendUp(out); };
    const openUpstream = (why) => {
      if (upstream || cutDone || ws.readyState !== 1) return;
      upstream = new WebSocketClient(`ws://127.0.0.1:${port}/`, ['binary'], { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
      log.log?.(`[desktop-stream] ${id}: bridge opened → ws://127.0.0.1:${port}/ (xpra)${viewerId ? ` (viewer ${viewerId})` : ''}${netem ? ` [netem rtt ${netem.rttMs} ms, ${netem.kbps || '∞'} kbps]` : ''}${why ? ` — ${why}` : ''}`);
      upstream.on('message', (d, isBinary) => {
        const buf = isBinary ? d : Buffer.from(String(d));
        down += buf.length;
        // the xpra side SAYS why it hangs up (a `disconnect` packet precedes its close) — the close line carries it.
        // Two shapes, both measured on 6.5.3: a proper packet (header + list) once the client's encoding is known, and a
        // BARE TEXT line `disconnect <reason>` (no header at all) for a client whose hello it could not decode.
        if (buf.length >= XPRA_HEADER + 2 && buf[0] === 0x50 && buf[2] === 0 && buf[3] === 0) { const words = xpraStrings(buf.subarray(XPRA_HEADER)); if (words[0] === 'disconnect') closedBy = closedBy || `the xpra server disconnected: ${words.slice(1).join(' / ') || 'no reason given'}`; }
        else if (buf.length >= 11 && buf.length <= 512 && buf.subarray(0, 11).toString('latin1') === 'disconnect ') closedBy = closedBy || `the xpra server disconnected: ${buf.toString('utf8', 11).replace(/[\r\n\0]+/g, ' ').trim().slice(0, 200)}`;
        if (q) q.down.send(buf.length, () => sendDown(buf)); else sendDown(buf);
      });
      upstream.on('open', flushUp);
      upstream.on('close', (code) => { if (cutDone) return; closedBy = closedBy || `the xpra server closed its socket (${code})`; try { ws.close(); } catch { /* already closed */ } finish('server side'); });
      upstream.on('error', (e) => { if (cutDone) return; closedBy = closedBy || `xpra socket error ${(e && e.code) || (e && e.message) || ''}`.trim(); try { ws.close(); } catch { /* already closed */ } });
      // x5: what this socket said while it was blocked — its hello first — reaches xpra before anything newer
      const held = sieve.release();
      if (held.relay) { relayUp(held.relay); log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} is active now — the ${held.kinds.join(' and the ')} it sent while blocked ${held.kinds.length > 1 ? 'reach' : 'reaches'} xpra first`); }
    };
    /** x5: this socket became blocked while connected — its upstream closes and the socket closes 4001 (see `seats`). */
    const cut = (why) => {
      if (cutDone) return;
      cutDone = true; stats.cut++;
      closedBy = closedBy || `${BLOCKED_REASON} (${why})`;
      try { upstream?.close(); } catch { /* gone */ } try { upstream?.terminate(); } catch { /* gone */ }
      try { ws.close(BLOCKED_CLOSE, BLOCKED_REASON); } catch { /* closing */ }
      leaveOnCut(seatRef);
    };
    /** watch → active with the upstream open: the keymap / display size / geometry held while refused go out NOW (the app re-fits to this pane). */
    const replayHeld = () => { const r = sieve.strip(Buffer.alloc(0), true); if (r.relay) { relayUp(r.relay); log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} is active — the ${r.replayedKinds.join(' and the ')} it sent while refused ${r.replayed > 1 ? 'reach' : 'reaches'} xpra now`); } };
    conn.reconcile = (why) => {
      if (ws.readyState !== 1 || cutDone) return;
      if (resolveTargetSafe(id) === null) { closedBy = closedBy || 'the app session ended'; try { ws.close(ENDED_CLOSE, 'the app session ended'); } catch { /* closing */ } return; }
      const s = seatState(id, seatRef.seat);
      if (s === 'blocked') { if (upstream) cut(why); return; }
      if (!upstream) openUpstream(why === 'refresh' ? 'this viewer is active now' : why);
      else if (s === 'active') replayHeld();
    };
    conn.cut = cut;
    if (seatState(id, seatRef.seat) !== 'blocked') openUpstream();
    else log.log?.(`[desktop-stream] ${id}: viewer ${viewerId || 'anonymous'} is BLOCKED (another client is active) — no upstream until it resumes here (xpra)`);
    ws.on('message', (m) => {
      const buf = Buffer.isBuffer(m) ? m : Buffer.from(m);
      up += buf.length;
      const s = seatState(id, seatRef.seat);
      if (s === 'blocked' || !upstream) {
        // x5 — A BLOCKED VIEWER REACHES NOTHING: its hello and the held kinds are KEPT for the moment it becomes active,
        // everything else is dropped (counted); lifecycle packets are cut from everybody as always
        const r = sieve.strip(buf, false, { hold: true });
        if (r.dropped) { dropped += r.dropped; stats.dropped += r.dropped; stats.blocked += r.dropped; lastRefusal = 'blocked'; }
        if (r.lifecycle) stats.lifecycle += r.lifecycle;
        if (r.oversize && !oversized) { oversized = true; closedBy = closedBy || closeOversize(ws, id, viewerId, r.oversize, 'xpra'); }
        if (s !== 'blocked') conn.reconcile('message');
        return;
      }
      let allow = true;
      if (s === 'watch') { allow = false; lastRefusal = 'watch-mode'; }
      else if (s === 'free' && inputPolicy) { try { const p = inputPolicy(id, viewerId); if (p && p.relay === false) { allow = false; lastRefusal = p.code || 'refused'; } } catch (e) { log.warn?.(`[desktop-stream] ${id}: inputPolicy threw — relaying: ${e && e.message}`); } }
      // THE POLICY PER PACKET (2026-09-22): a refused viewer's packets reach xpra only when XPRA_WATCH_TYPES names
      // them — its hello, ping echoes, damage acks, map-window, so the picture never
      // stalls on a Watch viewer (all-or-nothing per chunk dropped the hello itself) — and NOTHING else: input and
      // every control packet are cut out (round 2: a relayed `shutdown-server` from a Watch viewer ended the session).
      // Its keymap, display-size and (x5) configure-window packets are cut and the last of each HELD for its takeover
      // (r7 / r8 / x5: shared state). shutdown-server / exit-server are cut from EVERY viewer: the server's lifecycle is the keeper's.
      const r = sieve.strip(buf, allow);
      if (r.dropped) { dropped += r.dropped; stats.dropped += r.dropped; }
      if (r.oversize && !oversized) { oversized = true; closedBy = closedBy || closeOversize(ws, id, viewerId, r.oversize, 'xpra'); }
      if (r.replayed) log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} may type now — the ${r.replayedKinds.join(' and the ')} it sent while refused ${r.replayed > 1 ? 'reach' : 'reaches'} xpra first`);
      if (r.lifecycle) { stats.lifecycle += r.lifecycle; if (allow) lastRefusal = 'server lifecycle'; log.warn?.(`[desktop-stream] ${id}: ${r.lifecycle} server-lifecycle packet(s) (shutdown-server / exit-server) from ${viewerId ? `viewer ${viewerId}` : 'a viewer'} dropped — the keeper owns the xpra server's lifecycle`); }
      if (r.relay) relayUp(r.relay);
      if (!r.inputs || !allow) return; // a refused input is nobody at the keyboard
      const t = now();
      if (t - lastInputReport >= INPUT_REPORT_MS) { lastInputReport = t; try { onInput(id, viewerId); } catch { /* keeper is optional here */ } }
    });
    ws.on('close', (code, reason) => { finish(`the browser closed, code ${code}${reason && reason.length ? ' ' + String(reason).slice(0, 60) : ''}`); try { upstream?.close(); } catch { /* gone */ } try { upstream?.terminate(); } catch { /* gone */ } });
    ws.on('error', (e) => { closedBy = closedBy || wsOversize(e, id, viewerId, 'xpra') || `browser socket error ${(e && e.code) || ''}`.trim(); try { upstream?.terminate(); } catch { /* gone */ } });
  }

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
    if (target.kind !== 'rfb' && target.kind !== 'xpra') { refuse(socket, 501, `unknown stream kind ${String(target.kind)}`); return; }
    const viewerId = viewerOf(req.url);
    // A VIEWER ID IS BOUND TO ITS SOCKET (2026-09-21, the verifier's finding): the id
    // is what inputPolicy and the takeover/handback routes trust, so a second
    // socket claiming a LIVE id would drive the window during the holder's
    // takeover (the old map `.set` REPLACED the holder). Refused 409 by name; a
    // pane reconnecting after a silent drop mints a fresh id (desktop-app-window).
    if (viewerId && viewerAlive(id, viewerId)) { stats.held++; log.warn?.(`[desktop-stream] ${id}: a second socket claimed live viewer ${viewerId} — refused (409 viewer id held)`); refuse(socket, 409, 'viewer id held'); return; }
    const upgrade = (port, release) => {
      if (target.kind === 'xpra') {
        // dev-only netem: the upgrade url's own `?netem=` wins, else what the hosted-client route remembered for this id
        let netem = null;
        if (netemEnabled) { const q = netemOfUrl(req.url); netem = q != null ? parseNetem(q) : netemOf(id); }
        wss.handleUpgrade(req, socket, head, (ws) => { ws.once('close', release); bridgeXpra(ws, id, port, viewerId, netem, req); });
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => { ws.once('close', release); bridgeRfb(ws, id, port, viewerId, req); });
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

  return { handleUpgrade, streamEndpointFor, upgradeId, streamPath, stats: () => ({ ...stats }), wss, viewersOf, viewerAlive, connections, setNetem, netemOf, netemEnabled: !!netemEnabled, refresh, refreshAll };
}

module.exports = { create, upgradeId, streamPath, viewerOf, paneOf, prevOf, rfbInputSieve, RFB_INPUT_TYPES, RFB_FIXED_LEN, xpraInputSieve, xpraPacketType, xpraStrings, XPRA_INPUT_TYPES, XPRA_WATCH_TYPES, XPRA_KEYMAP_TYPES, XPRA_KEYMAP_HOLD_BYTES, XPRA_DISPLAY_TYPES, XPRA_DISPLAY_HOLD_BYTES, XPRA_GEOMETRY_TYPES, XPRA_GEOMETRY_HOLD_BYTES, XPRA_HELLO_HOLD_BYTES, XPRA_HELD_KINDS, XPRA_LIFECYCLE_TYPES, XPRA_MAX_PACKET_BYTES, RFB_MAX_MESSAGE_BYTES, WS_MAX_MESSAGE_BYTES, OVERSIZE_CLOSE, OVERSIZE_REASON, parseNetem, netemQueue, netemOfUrl, STREAM_RE, INPUT_REPORT_MS, WS_HIGH_WATER, WS_LOW_WATER, PING_MS, VIEWER_RE };
