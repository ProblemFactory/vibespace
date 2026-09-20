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
 * TARGET KINDS: `rfb` relays to 127.0.0.1:<port>. `xpra` is REFUSED BY NAME
 * (HTTP 501 at the upgrade + one log line) until P8-2 wires the HTML5 client
 * — a rung the ladder can choose must fail loudly at the bridge, never
 * silently relay the wrong protocol.
 */
const net = require('net');
const { WebSocketServer } = require('ws');
const { DESKTOP_SINGLETON_ID } = require('../desktop-apps');

const STREAM_RE = /^\/api\/desktop\/([A-Za-z0-9._-]{1,80})\/stream$/;
const INPUT_REPORT_MS = 2000;
const PING_MS = 20000;            // ws keepalive cadence on a bridge (2.369.118); silent for 2 rounds = terminated + named
const WS_HIGH_WATER = 8 * 1024 * 1024;
const WS_LOW_WATER = 1024 * 1024;

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
function rfbInputSieve() {
  const st = { phase: 'version', opaque: false, pending: Buffer.alloc(0), inputs: 0, messages: 0, why: null };
  const opaque = (why) => { st.opaque = true; st.why = why; st.pending = Buffer.alloc(0); };
  function feed(chunk) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (st.opaque) { st.inputs++; return 1; }
    let b = st.pending.length ? Buffer.concat([st.pending, buf]) : buf;
    let got = 0;
    for (;;) {
      if (st.phase === 'version') {
        if (b.length < 12) break;
        const v = b.subarray(0, 12).toString('latin1');
        const m = /^RFB (\d{3})\.(\d{3})\n$/.exec(v);
        if (!m) { opaque(`not an RFB version string: ${JSON.stringify(v)}`); return got; }
        b = b.subarray(12);
        if (Number(m[1]) === 3 && Number(m[2]) < 7) { opaque(`RFB 3.${Number(m[2])}: the server picks the security type, the client sends none — cannot be followed`); return got; }
        st.phase = 'security';
      } else if (st.phase === 'security') {
        if (b.length < 1) break;
        const t = b[0]; b = b.subarray(1);
        if (t === 1) st.phase = 'clientinit';
        else if (t === 2) st.phase = 'vncauth';
        else { opaque(`security type ${t} is not None/VNCAuth`); return got; }
      } else if (st.phase === 'vncauth') {
        if (b.length < 16) break;
        b = b.subarray(16); st.phase = 'clientinit';
      } else if (st.phase === 'clientinit') {
        if (b.length < 1) break;
        b = b.subarray(1); st.phase = 'messages';
      } else {
        if (b.length < 1) break;
        const t = b[0];
        let len;
        if (RFB_FIXED_LEN[t] !== undefined) len = RFB_FIXED_LEN[t];
        else if (t === 2) { if (b.length < 4) break; len = 4 + 4 * b.readUInt16BE(2); }                 // SetEncodings
        else if (t === 5) { if (b.length < 2) break; len = (b[1] & 0x80) ? 7 : 6; }                     // PointerEvent; marker bit = ExtendedMouseButtons (one more byte)
        else if (t === 6) { if (b.length < 8) break; len = 8 + Math.abs(b.readInt32BE(4)); }           // ClientCutText (extended: negative length)
        else if (t === 248) { if (b.length < 9) break; len = 9 + b[8]; }                               // ClientFence: 3 pad + u32 flags + u8 length + payload
        else if (t === 251) { if (b.length < 8) break; len = 8 + 16 * b[6]; }                          // SetDesktopSize
        else if (t === 255) { if (b.length < 2) break; if (b[1] === 0) len = 12; else { opaque(`QEMU client sub-message ${b[1]}`); return got; } } // QEMU: 0 = extended key event
        else { opaque(`unknown client message type ${t}`); return got; }
        if (b.length < len) break;
        b = b.subarray(len);
        st.messages++;
        if (RFB_INPUT_TYPES.includes(t)) { st.inputs++; got++; }
      }
    }
    st.pending = b.length ? Buffer.from(b) : Buffer.alloc(0);
    return got;
  }
  return { feed, state: () => ({ ...st, pending: st.pending.length }) };
}

/** Which stream id a ws upgrade path names, or null. `/api/vnc` = the singleton. */
function upgradeId(pathname) {
  if (pathname === '/api/vnc') return DESKTOP_SINGLETON_ID;
  const m = STREAM_RE.exec(pathname || '');
  return m ? m[1] : null;
}
/** The client-side url for an id (the singleton keeps its historic path). */
function streamPath(id) { return id === DESKTOP_SINGLETON_ID ? '/api/vnc' : `/api/desktop/${id}/stream`; }

/**
 * @param {object} deps
 *   auth          — { requestAuthed(req) }
 *   resolveTarget — (id) => { kind:'rfb'|'xpra', port } | null   (sync)
 *   onInput       — (id) => void  (throttled here)
 *   log
 */
function create({ auth, resolveTarget, onInput = () => { }, log = console, now = Date.now, pingMs = PING_MS } = {}) {
  if (!auth || typeof auth.requestAuthed !== 'function') throw new Error('desktop-stream: auth.requestAuthed is required');
  if (typeof resolveTarget !== 'function') throw new Error('desktop-stream: resolveTarget is required');
  const wss = new WebSocketServer({ noServer: true });
  const refusedXpra = new Set();
  const stats = { opened: 0, refused: 0, relayed: 0 };

  function refuse(socket, status, text) {
    try { socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* peer gone */ }
    try { socket.destroy(); } catch { /* peer gone */ }
    stats.refused++;
  }

  /** RFB over WebSocket (websockify semantics: binary frames ↔ raw TCP). */
  function bridgeRfb(ws, id, port) {
    stats.opened++;
    const sock = net.connect(port, '127.0.0.1');
    const openedAt = now();
    let lastInputReport = 0, down = 0, up = 0, closedBy = null, logged = false;
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
    const finish = (why) => {
      if (logged) return;
      logged = true;
      clearInterval(pinger);
      const dur = Math.round((now() - openedAt) / 1000);
      log.log?.(`[desktop-stream] ${id}: closed (${closedBy || why}) after ${dur}s, ${down} B to the browser, ${up} B to the server`);
    };
    log.log?.(`[desktop-stream] ${id}: bridge opened → 127.0.0.1:${port}`);
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
    const sieve = rfbInputSieve();
    ws.on('message', (m) => {
      up += (m && m.length) || 0;
      try { sock.write(m); } catch { /* socket closing */ }
      if (!sieve.feed(m)) return; // a FramebufferUpdateRequest / SetEncodings / the handshake is not a human
      const t = now();
      if (t - lastInputReport >= INPUT_REPORT_MS) { lastInputReport = t; try { onInput(id); } catch { /* keeper is optional here */ } }
    });
    ws.on('close', (code, reason) => { finish(`the browser closed, code ${code}${reason && reason.length ? ' ' + String(reason).slice(0, 60) : ''}`); sock.destroy(); });
    ws.on('error', (e) => { closedBy = closedBy || `browser socket error ${(e && e.code) || ''}`.trim(); sock.destroy(); });
    sock.on('close', () => { closedBy = closedBy || 'the VNC server closed its socket'; try { ws.close(); } catch { /* already closed */ } finish('server side'); });
    sock.on('error', (e) => { closedBy = closedBy || `VNC server socket error ${(e && e.code) || ''}`.trim(); try { ws.close(); } catch { /* already closed */ } });
  }

  /** The upgrade handler for BOTH paths. `id` = upgradeId(pathname). */
  function handleUpgrade(req, socket, head, id) {
    if (!auth.requestAuthed(req)) { refuse(socket, 401, 'Unauthorized'); return; }
    let target = null;
    try { target = resolveTarget(id); } catch (e) { log.warn?.(`[desktop-stream] resolveTarget(${id}) threw: ${e.message}`); }
    if (!target || !target.port) { refuse(socket, 404, 'No such display'); return; }
    if (target.kind === 'xpra') {
      if (!refusedXpra.has(id)) { refusedXpra.add(id); log.warn?.(`[desktop-stream] ${id}: xpra streams are not wired until P8-2 — refusing the upgrade (501)`); }
      refuse(socket, 501, 'xpra stream not wired (P8-2)');
      return;
    }
    if (target.kind !== 'rfb') { refuse(socket, 501, `unknown stream kind ${String(target.kind)}`); return; }
    wss.handleUpgrade(req, socket, head, (ws) => bridgeRfb(ws, id, target.port));
  }

  return { handleUpgrade, upgradeId, streamPath, stats: () => ({ ...stats }), wss };
}

module.exports = { create, upgradeId, streamPath, rfbInputSieve, RFB_INPUT_TYPES, RFB_FIXED_LEN, STREAM_RE, INPUT_REPORT_MS, WS_HIGH_WATER, WS_LOW_WATER, PING_MS };
