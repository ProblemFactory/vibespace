'use strict';
/**
 * THE RFB RELAY of the ONE desktop stream bridge (src/server/desktop-stream.js) — rv-desktop-apps F-B4, lane
 * dc-seams-desktop 2026-10-05. RFB over a raw TCP socket (websockify semantics: binary frames ↔ raw TCP) — Xvnc, x11vnc, a paired machine's VNC server.
 * Moved VERBATIM out of desktop-stream.js: the bridge keeps what every kind shares (auth, the x5 seats and their
 * reconcile, the stats, the named closes, the keepalive arm, the oversize close, the netem knobs) and hands it to
 * `bridgeOf(ctx)`; this module owns the protocol — its client→server classifier and its byte pump. It is ONE line in
 * src/server/stream-relays.js; the bridge asks that registry by the target's `kind` and spells no kind.
 * A relay row: { STREAM_KIND, serverName, maxMessageBytes, netem, bridgeOf(ctx) → (a) => void }, where `a` =
 * { ws, id, port, viewerId, netem, req }.
 */
const net = require('net');

const RFB_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

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

/** The bridge of this kind over the ONE bridge's shared state (`ctx` — see src/server/desktop-stream.js create()). */
function bridgeOf(ctx) {
  const { BLOCKED_CLOSE, BLOCKED_REASON, ENDED_CLOSE, INPUT_REPORT_MS, KA, WS_HIGH_WATER, WS_LOW_WATER, closeCodeOf, closeOversize, closed, inputPolicy, lastClose, leaveOnCut, log, now, onDesktopSize, onInput, onViewerLeft, opened, pingMs, resolveTargetSafe, seatState, stats, takeSeat, upstreamWhy, viewers, wsOversize } = ctx;
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
    // lane stream-ping: THE ONE keepalive rule (src/ws-keepalive.js) — the same 20 s / two silent rounds / named reason
    const keepalive = KA.armKeepalive(ws, { pingMs, now, onDrop: (d) => { closedBy = closedBy || d.reason; } });
    const conn = {};
    const seatRef = takeSeat(id, viewerId, req, conn);
    const finish = (why) => {
      if (logged) return;
      logged = true; closed(id);
      keepalive.stop();
      const dur = Math.round((now() - openedAt) / 1000);
      lastClose.set(id, { why: String(closedBy || why), code: closeCodeOf(closedBy || why), at: now(), afterS: dur }); // K3: the page words the last close
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
      // design 014 D1: `upstreamWhy(id)` names WHY the upstream went (a machine desktop's machine went offline), asked a
      // turn later — the agent link's own teardown closes its channels before it marks itself disconnected
      const upstreamClosed = () => { closedBy = closedBy || 'the VNC server closed its socket'; try { ws.close(); } catch { /* already closed */ } finish('server side'); };
      sock.on('close', () => { if (cutDone) return; if (typeof upstreamWhy !== 'function') return upstreamClosed(); setImmediate(() => { try { const w = upstreamWhy(id); if (w) closedBy = closedBy || w; } catch { /* the plain words */ } upstreamClosed(); }); });
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
  return (a) => bridgeRfb(a.ws, a.id, a.port, a.viewerId, a.req);
}

module.exports = { STREAM_KIND: 'rfb', serverName: 'VNC server', maxMessageBytes: RFB_MAX_MESSAGE_BYTES, netem: false, bridgeOf, RFB_MAX_MESSAGE_BYTES, RFB_INPUT_TYPES, RFB_FIXED_LEN, rfbInputSieve };
