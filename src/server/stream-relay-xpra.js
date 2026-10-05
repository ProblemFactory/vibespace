'use strict';
/**
 * THE XPRA RELAY of the ONE desktop stream bridge (src/server/desktop-stream.js) — rv-desktop-apps F-B4, lane
 * dc-seams-desktop 2026-10-05. xpra over the xpra server's own WebSocket (P8-2), one message per packet; its XPRA_* packet tables and held kinds live here.
 * Moved VERBATIM out of desktop-stream.js: the bridge keeps what every kind shares (auth, the x5 seats and their
 * reconcile, the stats, the named closes, the keepalive arm, the oversize close, the netem knobs) and hands it to
 * `bridgeOf(ctx)`; this module owns the protocol — its client→server classifier and its byte pump. It is ONE line in
 * src/server/stream-relays.js; the bridge asks that registry by the target's `kind` and spells no kind.
 * A relay row: { STREAM_KIND, serverName, maxMessageBytes, netem, bridgeOf(ctx) → (a) => void }, where `a` =
 * { ws, id, port, viewerId, netem, req }.
 */

const XPRA_MAX_PACKET_BYTES = 16 * 1024 * 1024;

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

/** The bridge of this kind over the ONE bridge's shared state (`ctx` — see src/server/desktop-stream.js create()). */
function bridgeOf(ctx) {
  const { BLOCKED_CLOSE, BLOCKED_REASON, ENDED_CLOSE, INPUT_REPORT_MS, KA, WS_HIGH_WATER, WS_LOW_WATER, WebSocketClient, closeCodeOf, closeOversize, closed, inputPolicy, lastClose, leaveOnCut, log, netemQueue, now, onInput, onViewerLeft, open, opened, pingMs, refresh, resolveTargetSafe, seatState, stats, takeSeat, viewers, wsOversize } = ctx;
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
    // lane stream-ping: THE ONE keepalive rule (src/ws-keepalive.js) — the same 20 s / two silent rounds / named reason
    const keepalive = KA.armKeepalive(ws, { pingMs, now, onDrop: (d) => { closedBy = closedBy || d.reason; } });
    const conn = {};
    const seatRef = takeSeat(id, viewerId, req, conn);
    const finish = (why) => {
      if (logged) return;
      logged = true; closed(id);
      keepalive.stop();
      if (q) { q.down.stop(); q.up.stop(); }
      const dur = Math.round((now() - openedAt) / 1000);
      lastClose.set(id, { why: String(closedBy || why), code: closeCodeOf(closedBy || why), at: now(), afterS: dur }); // K3: the page words the last close
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
  return (a) => bridgeXpra(a.ws, a.id, a.port, a.viewerId, a.netem, a.req);
}

module.exports = { STREAM_KIND: 'xpra', serverName: 'xpra server', maxMessageBytes: XPRA_MAX_PACKET_BYTES, netem: true, bridgeOf, XPRA_MAX_PACKET_BYTES, XPRA_INPUT_TYPES, XPRA_WATCH_TYPES, XPRA_KEYMAP_TYPES, XPRA_KEYMAP_HOLD_BYTES, XPRA_DISPLAY_TYPES, XPRA_DISPLAY_HOLD_BYTES, XPRA_GEOMETRY_TYPES, XPRA_GEOMETRY_HOLD_BYTES, XPRA_HELLO_HOLD_BYTES, XPRA_HELD_KINDS, XPRA_LIFECYCLE_TYPES, XPRA_HEADER, XPRA_FLAGS_ENCODER, xpraPacketType, xpraStrings, xpraInputSieve };
