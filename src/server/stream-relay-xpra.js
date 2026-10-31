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
const zlib = require('zlib'); // r3: a brotli-compressed window announcement (xpra's second compressor) is read on its way down

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
/** lane desktop-x-seat-browser r2 (acceptance r1 MAJOR A — measured: the person's 'active' desktop socket replayed its display size
 *  and window geometry, then fitted, slotted and belted every Chrome window of the display, the agents' included): THE PERSON'S
 *  INPUT SEAT ('input') is NOT the whole client. What it may send beyond a watcher's packets: its keymap (his keys need it —
 *  held while he watched, replayed first), the clipboard (his paste), and the input packets the shipped client sends, each
 *  ADDRESSED to a window of its reach (r3: by the window's IDENTITY — his window, its transients, the popups his own acts open;
 *  see XPRA_POPUP_OPEN_MS) — the packet type → the index of its pointer position (root coordinates — xpra moves the X pointer
 *  THERE: a point outside his windows is refused too) or null. Never a display size, a window geometry, a close, an unmap, a
 *  command, any other input shape; a map-window only with the server's own geometry (r3 — xpra applies a map-window's geometry
 *  from its ui driver, and his key or click makes him that). */
const XPRA_CLIPBOARD_TYPES = Object.freeze(new Set(['clipboard-token', 'clipboard-contents']));
const XPRA_SCOPED_INPUT = Object.freeze({ 'key-action': null, focus: null, 'button-action': 4, 'pointer-position': 2 });
/** The packet the bridge TELLS a seated socket (never silent — acceptance r1 FAIL 3): its seat, why it watches, the last refusal's
 *  code and count, the windows an input seat reaches — `['vibespace-seat', {seat, why, code, refused, wids}]` (src/lib/xpra-client.js
 *  hands it to the view; an xpra server never sees it). */
const XPRA_SEAT_PACKET = 'vibespace-seat';
/** His window (the keeper's read of it) is asked for at most this often per socket — not told yet, or (r4, acceptance r3 MAJOR 2)
 *  maybe REPLACED: a new top-level announced, his window lost, his press on a window not his / outside his windows (a Chrome
 *  relaunch, a crash restored — his browsing goes on in a new window); an ask inside the pace goes when the pace allows. */
const XPRA_SCOPE_ASK_MS = 1000;
/** lane desktop-x-seat-browser r3 (acceptance r2 MAJOR 1 + 2 — MEASURED 2026-10-31, Google Chrome 154 on a scratch X display: a
 *  <select>'s popup and the page's context menu are OVERRIDE-REDIRECT windows of type MENU with NO WM_TRANSIENT_FOR, no WM_CLASS
 *  and an empty name — nothing in X names the window they belong to, and the display's tree carries neither the override-redirect
 *  flag nor a transient, so seamlessWindows rightly drops them as nameless; Chrome's passkey dialog is drawn INSIDE the browser
 *  window — no window of its own). THE INPUT SEAT'S REACH is read where it is ORDERED: xpra's own window announcements on this
 *  socket (new-window / new-override-redirect with their metadata's `override-redirect` and `transient-for`, the moves, the
 *  losses — every desktop socket receives them) beside his acts on this socket: HIS window (the keeper's: his CDP bounds told
 *  on the display), a managed window whose transient-for chain reaches it (a GTK file chooser — measured: transient-for its
 *  browser window), and an override-redirect window that OPENS within XPRA_POPUP_OPEN_MS after his own press or key on a window
 *  of his (or his pointer in a popup of his: a submenu) touching the window he acted on (within XPRA_POPUP_GAP_PX) — never a
 *  window because it lies inside his rect (an agent's popup over his window, his window cascaded over an agent's: not his).
 *  r4 (acceptance r3 MINOR): his pointer RESTING on a window of his opens popups too (a tooltip, a hover card) — one that opens
 *  within XPRA_POPUP_OPEN_MS of his pointer's last move there, touching that window AND within XPRA_HOVER_REACH_PX of the point. */
const XPRA_POPUP_OPEN_MS = 1500;
const XPRA_POPUP_GAP_PX = 8;
const XPRA_HOVER_REACH_PX = 48;
/** r3 (acceptance r2 MAJOR 2 — the law: never silent): a refusal that is no act of his (a pointer passing over another window,
 *  the client's own focus of a window it drew, a release of nothing he pressed) is TOLD too — coalesced to one word per
 *  XPRA_TELL_QUIET_MS; a refused ACT (a press, a key) is told at once and counted apart (`acts` — the window's one toast). */
const XPRA_TELL_QUIET_MS = 250;
const XPRA_QUIET_CODES = Object.freeze(new Set(['pointer-outside', 'focus-elsewhere', 'readdressed']));
/** r3: the strip's mark for a release the client addressed to another window — replaced by the press's own release, never a refusal. */
const XPRA_READDRESSED = 'readdressed';
/** xpra's window announcements the bridge READS on their way down (r3) — a compressed one is inflated (lz4 / brotli), bounded by
 *  XPRA_WINDOW_PACKET_MAX; raw chunks and larger packets pass unread. */
const XPRA_WINDOW_TYPES = Object.freeze(new Set(['new-window', 'new-override-redirect', 'window-create', 'lost-window', 'window-move-resize', 'configure-override-redirect', 'window-resized', 'window-metadata']));
const XPRA_WINDOW_PACKET_MAX = 64 * 1024;
const XPRA_HEADER = 8;
const XPRA_FLAGS_ENCODER = 0x1 | 0x4 | 0x10; // rencode | yaml | rencodeplus; 0 = bencode
/** The first element of a rencode/rencodeplus/bencode LIST — the packet type
 *  — or null when it cannot be read from these bytes. rencode(plus): list =
 *  192+n (n < 64) or CHR_LIST 59, a fixed string = 128+len then bytes, a long
 *  string = ascii length ':' bytes; bencode: 'l' then '<len>:<bytes>'. */
/** lane e2b r3 (the ruling: the desktop size of the per-window rung is XPRA's — apply a pin THROUGH it): a minimal
 *  rencodeplus WRITER for the one packet the bridge sends on the keeper's behalf (lists, strings, ints, dicts — the
 *  codes python-rencode / xpra-html5's rencode.js use: fixed int 0..43, INT1/2/4 = 62/63/64, fixed str 128+n, fixed
 *  list 192+n, fixed dict 102+n, else CHR_LIST 59 / CHR_DICT 60 … CHR_TERM 127) and the 8-byte header (P, flags 0x10). */
function rencodePlus(v) {
  const out = [];
  const put = (x) => {
    if (Array.isArray(x)) { if (x.length < 64) out.push(Buffer.from([192 + x.length])); else out.push(Buffer.from([59])); for (const e of x) put(e); if (x.length >= 64) out.push(Buffer.from([127])); return; }
    if (typeof x === 'string') { const b = Buffer.from(x, 'utf8'); out.push(b.length < 64 ? Buffer.from([128 + b.length]) : Buffer.from(`${b.length}:`, 'latin1')); out.push(b); return; }
    if (typeof x === 'number' && Number.isInteger(x)) {
      if (x >= 0 && x < 44) { out.push(Buffer.from([x])); return; }
      if (x >= -128 && x < 128) { const b = Buffer.alloc(2); b[0] = 62; b.writeInt8(x, 1); out.push(b); return; }
      if (x >= -32768 && x < 32768) { const b = Buffer.alloc(3); b[0] = 63; b.writeInt16BE(x, 1); out.push(b); return; }
      const b = Buffer.alloc(5); b[0] = 64; b.writeInt32BE(x, 1); out.push(b); return;
    }
    if (typeof x === 'boolean') { out.push(Buffer.from([x ? 67 : 68])); return; } // r3: CHR_TRUE / CHR_FALSE
    if (x && typeof x === 'object') { const ks = Object.keys(x); out.push(Buffer.from([ks.length < 25 ? 102 + ks.length : 60])); for (const k of ks) { put(k); put(x[k]); } if (ks.length >= 25) out.push(Buffer.from([127])); return; }
    throw new Error(`rencodePlus: cannot write ${typeof x}`);
  };
  put(v);
  const payload = Buffer.concat(out), h = Buffer.alloc(XPRA_HEADER);
  h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(payload.length, 4);
  return Buffer.concat([h, payload]);
}
/** THE PIN's desktop size, as the packet an active viewer sends (src/lib/xpra-proto.js displayPacket's FULL legacy form —
 *  the root AND the work-area rows): every viewer connection of a pinned window carries it, so xpra's own
 *  configure_best_screen_size (the max of its clients' desktop sizes — MEASURED: that is what resized the root back to a
 *  viewer's 390×769 after an outside xrandr) lands on the pin. */
function pinDesktopPacket(pin, dpi = 96) {
  const w = Math.max(1, Math.floor(pin.w)), h = Math.max(1, Math.floor(pin.h)), d = Math.round(dpi);
  const wmm = Math.round(25.4 * w / d), hmm = Math.round(25.4 * h / d);
  return rencodePlus(['desktop_size', w, h, [['VibeSpace', w, h, wmm, hmm, [['Canvas', 0, 0, w, h, wmm, hmm]], 0, 0, w, h]], 0, [], w, h, d, d, 0, {}]);
}
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
/** lane desktop-x-seat-browser r2: the first `n` elements of a rencode / rencodeplus LIST (strings, ints, bools, None, nested
 *  lists and dicts — the shapes the input packets carry; r3: floats and long ints too — xpra's window metadata), or null when these
 *  bytes are not that (bencode, a truncated list, a byte string over the bound): an unreadable packet is never "his window".
 *  `spans` (r3) collects each top element's [start, end) — the bridge flips a press's own `pressed` byte into its release. Never a
 *  full decoder: it stops at element n; a byte string reads as null. */
function xpraFields(payload, n, maxBytes = 4096, spans = null) {
  if (!payload || payload.length < 2 || payload.length > maxBytes) return null;
  let i = 0;
  const str = (len) => { if (i + len > payload.length) throw new Error('short'); const s = payload.toString('utf8', i, i + len); i += len; return s; };
  const one = (depth) => {
    if (depth > 4 || i >= payload.length) throw new Error('deep');
    const b = payload[i++];
    if (b < 44) return b;
    if (b >= 70 && b < 102) return 69 - b;
    if (b >= 128 && b < 192) return str(b - 128);
    if (b >= 192) { const out = []; for (let k = 0; k < b - 192; k++) out.push(one(depth + 1)); return out; }
    if (b >= 102 && b < 127) { const o = {}; for (let k = 0; k < b - 102; k++) { const key = one(depth + 1); o[String(key)] = one(depth + 1); } return o; }
    switch (b) {
      case 62: { if (i + 1 > payload.length) throw new Error('short'); const v = payload.readInt8(i); i += 1; return v; }
      case 63: { if (i + 2 > payload.length) throw new Error('short'); const v = payload.readInt16BE(i); i += 2; return v; }
      case 64: { if (i + 4 > payload.length) throw new Error('short'); const v = payload.readInt32BE(i); i += 4; return v; }
      case 65: { if (i + 8 > payload.length) throw new Error('short'); const v = Number(payload.readBigInt64BE(i)); i += 8; return v; }
      case 66: { if (i + 4 > payload.length) throw new Error('short'); const v = payload.readFloatBE(i); i += 4; return v; } // CHR_FLOAT32
      case 44: { if (i + 8 > payload.length) throw new Error('short'); const v = payload.readDoubleBE(i); i += 8; return v; } // CHR_FLOAT64
      case 61: { const j = payload.indexOf(127, i); if (j < 0 || j - i > 40) throw new Error('short'); const v = Number(payload.toString('latin1', i, j)); i = j + 1; return v; } // CHR_INT: decimal digits … CHR_TERM
      case 67: return true;
      case 68: return false;
      case 69: return null;
      case 59: { const out = []; while (payload[i] !== 127) { if (i >= payload.length) throw new Error('short'); out.push(one(depth + 1)); } i++; return out; }
      case 60: { const o = {}; while (payload[i] !== 127) { if (i >= payload.length) throw new Error('short'); const key = one(depth + 1); o[String(key)] = one(depth + 1); } i++; return o; }
      default: {
        if (b >= 0x30 && b <= 0x39) { // '<len>:' a string, '<len>/' bytes
          let j = i - 1; while (j < payload.length && payload[j] >= 0x30 && payload[j] <= 0x39 && j - i < 8) j++;
          if (payload[j] !== 0x3a && payload[j] !== 0x2f) throw new Error('bad');
          const len = Number(payload.toString('latin1', i - 1, j)); i = j + 1;
          if (payload[j] === 0x2f) { if (i + len > payload.length) throw new Error('short'); i += len; return null; }
          return str(len);
        }
        throw new Error('unreadable');
      }
    }
  };
  try {
    const b0 = payload[i++];
    const fixed = b0 >= 192 ? b0 - 192 : b0 === 59 ? Infinity : -1;
    if (fixed < 0) return null;
    const out = [];
    while (out.length < n && out.length < fixed && i < payload.length && !(fixed === Infinity && payload[i] === 127)) { const at = i; out.push(one(1)); if (spans) spans.push([at, i]); }
    return out;
  } catch { return null; }
}
/** r3: xpra's lz4 packet body — a 4-byte LITTLE-endian decompressed size, then ONE lz4 block (xpra/net/lz4; measured: xpra's own
 *  compress of 600 bytes starts 58 02 00 00). → the bytes, or null (over `max`, a malformed block). */
function lz4Inflate(src, max = XPRA_WINDOW_PACKET_MAX) {
  if (!src || src.length < 5) return null;
  const size = src.readUInt32LE(0);
  if (size > max) return null;
  const out = Buffer.alloc(size);
  let i = 4, o = 0;
  const more = () => { let n = 0, b; do { if (i >= src.length) throw new Error('short'); b = src[i++]; n += b; } while (b === 255); return n; };
  try {
    while (i < src.length) {
      const token = src[i++];
      let lit = token >> 4;
      if (lit === 15) lit += more();
      if (i + lit > src.length || o + lit > size) return null;
      src.copy(out, o, i, i + lit); i += lit; o += lit;
      if (i >= src.length) break; // the last sequence carries literals only
      if (i + 2 > src.length) return null;
      const off = src[i] | (src[i + 1] << 8); i += 2;
      if (!off || off > o) return null;
      let len = (token & 15) + 4;
      if ((token & 15) === 15) len += more();
      if (o + len > size) return null;
      for (let k = 0; k < len; k++, o++) out[o] = out[o - off]; // an overlapping match copies byte by byte
    }
  } catch { return null; }
  return o === size ? out : null;
}
/** r3: one main packet's body as rencode bytes — as sent, or inflated by its header's level byte (lz4 0x10 / brotli 0x40), bounded. */
function xpraBody(level, payload, max = XPRA_WINDOW_PACKET_MAX) {
  if (!level) return payload;
  if (level & 0x10) return lz4Inflate(payload, max);
  if (level & 0x40) { try { return zlib.brotliDecompressSync(payload, { maxOutputLength: max }); } catch { return null; } }
  return null;
}
/** r3: THE WAY DOWN, READ — a stateful framer over xpra's own bytes to ONE socket: every complete main packet that is a window
 *  announcement (XPRA_WINDOW_TYPES) goes to `onWindow(fields)` (xpraFields, 8 elements); raw chunks and packets over
 *  XPRA_WINDOW_PACKET_MAX are skipped unread (never copied); bytes that are not xpra's framing (a bare `disconnect` line) end the
 *  reading for good. Nothing is changed: the bytes go down as they came. */
function xpraWindowWatch(onWindow) {
  let head = null, hdr = null, skip = 0, body = null, got = 0, dead = false;
  const read = (h, p) => {
    const enc = h.flags & XPRA_FLAGS_ENCODER;
    if (enc !== 0x1 && enc !== 0x10) return;
    const b = xpraBody(h.level, p);
    const type = b ? xpraPacketType(b) : null;
    if (!type || !XPRA_WINDOW_TYPES.has(type)) return;
    const f = xpraFields(b, 8, XPRA_WINDOW_PACKET_MAX);
    if (f) onWindow(f);
  };
  return (chunk) => {
    if (dead || !chunk) return;
    let i = 0;
    while (i < chunk.length) {
      if (skip) { const n = Math.min(skip, chunk.length - i); skip -= n; i += n; continue; }
      if (body) { const n = Math.min(body.length - got, chunk.length - i); chunk.copy(body, got, i, i + n); got += n; i += n; if (got === body.length) { const b = body; body = null; read(hdr, b); } continue; }
      const part = chunk.subarray(i, i + XPRA_HEADER - (head ? head.length : 0)); i += part.length;
      head = head ? Buffer.concat([head, part]) : Buffer.from(part);
      if (head.length < XPRA_HEADER) break;
      if (head[0] !== 0x50) { dead = true; return; }
      hdr = { flags: head[1], level: head[2], index: head[3], size: head.readUInt32BE(4) }; head = null;
      if (hdr.index !== 0 || hdr.size > XPRA_WINDOW_PACKET_MAX) skip = hdr.size;
      else if (hdr.size) { body = Buffer.alloc(hdr.size); got = 0; }
    }
  };
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
        visit(u, true, null, null);
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
      visit(u, input, type, payload);
    }
    if (b.length && !st.oversize) { st.parts = [Buffer.from(b)]; st.held = b.length; } else st.need = 0;
  }
  function feed(chunk) { let got = 0; walk(chunk, (u, input) => { if (input) got++; }); return got; }
  /** `hold` (x5): a BLOCKED viewer — nothing is relayed at all; its hello and the held kinds are kept for `release()`.
   *  `geometry` (lane browser-x-in-window): a SIZING viewer — its input is refused, its window geometry and display size PASS
   *  (an agent browser's ruling pane sizes Chrome's window while nobody drives — xpra's own configure, never a CDP resize). */
  function strip(chunk, allowInput = true, { hold = false, pinned = false, geometry = false, scope = null } = {}) {
    let inputs = 0, dropped = 0, lifecycle = 0, pinCut = 0, kept = 0, acts = 0; // acts: the input units that are not a pointer passing by; kept: the input units an INPUT seat relayed
    const keep = [], codes = {};
    if (hold) allowInput = false;
    // lane desktop-x-seat-browser r2: an INPUT seat (`scope` = (type, payload) → null | the refusal's code) holds nothing for a
    // later replay — its keymap passes (the one it sent while it watched goes first), a display size / geometry never will
    if (scope) { allowInput = false; st.heldDisplay = null; st.heldGeometry = null; if (st.heldKeymap && !st.oversize) { keep.push(st.heldKeymap); st.heldKeymap = null; codes.replayedKeymap = 1; } }
    // lane e2b r2 (THE PIN FENCE): while the window is PINNED its geometry is the KEEPER's — every viewer's display-size and
    // configure-window packets are dropped (Watch AND active) and nothing held replays; unpinned = the x5 one-owner rule
    if (pinned) { st.heldDisplay = null; st.heldGeometry = null; }
    walk(chunk, (u, input, type, payload) => {
      if (input) inputs++;
      if (input && type !== 'pointer-position' && type !== 'pointer-motion') acts++;
      const life = type !== null && XPRA_LIFECYCLE_TYPES.has(type);
      if (life) lifecycle++;
      const pin = pinned && type !== null && (XPRA_DISPLAY_TYPES.has(type) || XPRA_GEOMETRY_TYPES.has(type));
      if (pin) pinCut++;
      const sizing = geometry && type !== null && (XPRA_GEOMETRY_TYPES.has(type) || XPRA_DISPLAY_TYPES.has(type));
      if (scope && !life && !pin) { // r2: the input seat — a watcher's packets, its keymap, and what its scope admits
        const why = type !== null && type !== 'map-window' && (XPRA_WATCH_TYPES.has(type) || XPRA_KEYMAP_TYPES.has(type)) ? null : scope(type, payload, u); // r3: a map-window is judged (its geometry the server's own)
        if (why) { dropped++; codes[why] = (codes[why] || 0) + 1; } else { keep.push(u); if (input) kept++; }
        return;
      }
      if (life || pin || (!allowInput && !sizing && !(type !== null && XPRA_WATCH_TYPES.has(type)))) dropped++; else keep.push(u);
      // x5: a BLOCKED viewer relays NOTHING — what the allowlist kept comes back out; its hello is held for the moment it becomes active
      if (hold && keep[keep.length - 1] === u) { keep.pop(); if (type === 'hello' && u.length <= XPRA_HELLO_HOLD_BYTES) st.heldHello = Buffer.from(u); else dropped++; }
      // THE KEYMAP + DISPLAY-SIZE FENCES' other half: a refused viewer's keymap / display size is cut above and HELD
      // here (the last one of each) for its takeover
      if (!allowInput && type !== null && !pin && !sizing) for (const h of XPRA_HELD_KINDS) if (h.types.has(type)) st[h.key] = u.length <= h.cap ? Buffer.from(u) : null;
    });
    const replayedKinds = [];
    if (hold) return { inputs, acts, dropped, lifecycle, pinCut, kept, codes, replayed: 0, replayedKinds, oversize: st.oversize, relay: null };
    if (scope && codes.replayedKeymap) { delete codes.replayedKeymap; replayedKinds.push('keymap'); }
    if (allowInput && !st.oversize) {
      const held = [];
      for (const h of XPRA_HELD_KINDS) if (st[h.key]) { held.push(st[h.key]); replayedKinds.push(h.words); st[h.key] = null; }
      keep.unshift(...held);
    }
    return { inputs, acts, dropped, lifecycle, pinCut, kept, codes, replayed: replayedKinds.length, replayedKinds, oversize: st.oversize, relay: keep.length ? (keep.length === 1 ? keep[0] : Buffer.concat(keep)) : null };
  }
  /** x5: what a blocked viewer said, in replay order — its hello, then the held kinds — as ONE buffer (null = nothing), cleared. */
  function release() {
    if (st.oversize) return { relay: null, kinds: [] };
    const out = [], kinds = [];
    if (st.heldHello) { out.push(st.heldHello); kinds.push('hello'); st.heldHello = null; }
    for (const h of XPRA_HELD_KINDS) if (st[h.key]) { out.push(st[h.key]); kinds.push(h.words); st[h.key] = null; }
    return { relay: out.length ? Buffer.concat(out) : null, kinds };
  }
  /** lane browser-x-in-window: watch → SIZE — the geometry and display size held while refused, as ONE buffer (null = none), cleared. */
  function releaseGeometry() {
    if (st.oversize) return { relay: null, kinds: [] };
    const out = [], kinds = [];
    for (const h of XPRA_HELD_KINDS) if (h.key !== 'heldKeymap' && st[h.key]) { out.push(st[h.key]); kinds.push(h.words); st[h.key] = null; }
    return { relay: out.length ? Buffer.concat(out) : null, kinds };
  }
  const state = () => { const { parts, held, group, heldKeymap, heldDisplay, heldGeometry, heldHello, ...rest } = st; return { ...rest, pending: held, group: group.length, heldKeymap: heldKeymap ? heldKeymap.length : 0, heldDisplay: heldDisplay ? heldDisplay.length : 0, heldGeometry: heldGeometry ? heldGeometry.length : 0, heldHello: heldHello ? heldHello.length : 0 }; };
  return { feed, strip, release, releaseGeometry, state };
}

/** The bridge of this kind over the ONE bridge's shared state (`ctx` — see src/server/desktop-stream.js create()). */
function bridgeOf(ctx) {
  const { pinned = null, onDesktopSize = null } = ctx; // lane e2b: (id) => the record's pin (the keeper owns its geometry); r3: a pinned root's move re-fits
  const { BLOCKED_CLOSE, BLOCKED_REASON, ENDED_CLOSE, INPUT_REPORT_MS, KA, WS_HIGH_WATER, WS_LOW_WATER, WebSocketClient, closeCodeOf, closeOversize, closed, inputPolicy, lastClose, leaveOnCut, log, netemQueue, now, onInput, onViewerLeft, open, opened, pingMs, refresh, resolveTargetSafe, seatState, stats, takeSeat, viewers, wsOversize } = ctx;
  const { seatWhy = () => undefined, seatScope = () => null, askSeatScope = () => {} } = ctx; // lane desktop-x-seat-browser r2: a seated source's word + the input seat's reach
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
      clearTimeout(quietTimer); quietTimer = null; // r3
      clearTimeout(askTimer); askTimer = null; // r5: a read deferred for this socket goes with it
      seatRef.forget();
      leave();
    };
    const sendDown = (d) => { if (ws.readyState !== 1) return; ws.send(d); if (upstream && ws.bufferedAmount > WS_HIGH_WATER && !upstream.isPaused) { upstream.pause(); const t = setInterval(() => { if (ws.readyState !== 1) { clearInterval(t); return; } if (ws.bufferedAmount < WS_LOW_WATER) { clearInterval(t); try { upstream.resume(); } catch { /* closed */ } } }, 50); } };
    const sieve = xpraInputSieve();
    // lane e2b r2: is this window PINNED now (the keeper's record) — then no viewer carries display size / window geometry
    const pinOfNow = () => { try { const p = pinned && pinned(id); return p && p.w > 0 && p.h > 0 ? p : null; } catch { return null; } };
    const pinnedNow = () => !!pinOfNow();
    // r3: the bridge ASKS xpra for the pin on the keeper's behalf — after this viewer's hello, again when the pin changes,
    // after a reconnect (a new socket = a new bridge) and whenever xpra answers another desktop_size; never a viewer's packet
    let pinSent = null;
    const assertPin = (why) => {
      const p = pinOfNow(); const key = p ? `${p.w}x${p.h}` : null;
      if (!p || !upstream || (key === pinSent && why !== 'xpra answered')) return;
      pinSent = key; relayUp(pinDesktopPacket(p));
      log.log?.(`[desktop-stream] ${id}: pinned ${key} — asked xpra for it on this viewer's connection (${why})${viewerId ? `, viewer ${viewerId}` : ''}`);
    };
    // lane e2-canvas (int243 2026-10-09, THE SECOND E2 CHROME PATH): xpra 6.5.4 answers a hello on a thread (verify_auth →
    // GLib.idle_add(hello_oked) — the connection's source exists only then), and ANY other packet it reads before that comes from
    // a connection with no source ⇒ handle_invalid_packet ⇒ proto.close(), no disconnect packet (the viewer: 1005, and every
    // reconnect raced the same way). So until xpra says its FIRST word on this connection it hears the hello and nothing else:
    // the rest — the bridge's own pin ask first — waits in `owed`, in order, and goes up on that first word.
    let helloUp = false, answered = false;
    const owed = [];
    const pendingUp = [];
    const flushUp = () => { while (pendingUp.length && upstream && upstream.readyState === 1) { try { upstream.send(pendingUp.shift()); } catch { /* closing */ } } };
    const sendUp = (m) => { if (!upstream) return; if (upstream.readyState === 1) { try { upstream.send(m); } catch { /* closing */ } } else if (upstream.readyState === 0) pendingUp.push(m); };
    const relayUp = (out) => { if (!answered) { if (helloUp) { owed.push(out); return; } helloUp = true; } stats.relayed++; if (q) q.up.send(out.length, () => sendUp(out)); else sendUp(out); };
    const openUpstream = (why) => {
      if (upstream || cutDone || ws.readyState !== 1) return;
      upstream = new WebSocketClient(`ws://127.0.0.1:${port}/`, ['binary'], { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
      log.log?.(`[desktop-stream] ${id}: bridge opened → ws://127.0.0.1:${port}/ (xpra)${viewerId ? ` (viewer ${viewerId})` : ''}${netem ? ` [netem rtt ${netem.rttMs} ms, ${netem.kbps || '∞'} kbps]` : ''}${why ? ` — ${why}` : ''}`);
      upstream.on('message', (d, isBinary) => {
        const buf = isBinary ? d : Buffer.from(String(d));
        down += buf.length;
        const first = !answered;
        if (!answered) { answered = true; for (const m of owed.splice(0)) relayUp(m); } // e2-canvas: xpra answered the hello — what waited goes up now
        // the xpra side SAYS why it hangs up (a `disconnect` packet precedes its close) — the close line carries it.
        // Two shapes, both measured on 6.5.3: a proper packet (header + list) once the client's encoding is known, and a
        // BARE TEXT line `disconnect <reason>` (no header at all) for a client whose hello it could not decode.
        if (buf.length >= XPRA_HEADER + 2 && buf[0] === 0x50 && buf[2] === 0 && buf[3] === 0) { const words = xpraStrings(buf.subarray(XPRA_HEADER)); if (words[0] === 'disconnect') closedBy = closedBy || `the xpra server disconnected: ${words.slice(1).join(' / ') || 'no reason given'}`; }
        else if (buf.length >= 11 && buf.length <= 512 && buf.subarray(0, 11).toString('latin1') === 'disconnect ') closedBy = closedBy || `the xpra server disconnected: ${buf.toString('utf8', 11).replace(/[\r\n\0]+/g, ' ').trim().slice(0, 200)}`;
        if (pinSent && buf.length >= XPRA_HEADER + 2 && buf.length < 4096 && buf[2] === 0 && xpraPacketType(buf.subarray(XPRA_HEADER)) === 'desktop_size') { assertPin('xpra answered'); const p = pinOfNow(); if (p) { try { onDesktopSize?.(id, p.w, p.h, viewerId); } catch { /* the keeper's belt still runs */ } } } // r3: xpra moved the root — ask again; the keeper re-fits the main window (an app may re-grow itself)
        if (readsWindows) watchDown(buf); // lane desktop-x-seat-browser r3: xpra's window announcements, read on their way (his reach is told BEFORE the window reaches the client)
        if (q) q.down.send(buf.length, () => sendDown(buf)); else sendDown(buf);
        if (first) { if (q) q.down.send(0, tellSeat); else tellSeat(); } // r2: after xpra's own first word (its hello), the socket hears its seat
      });
      upstream.on('open', flushUp);
      upstream.on('close', (code) => { if (cutDone) return; closedBy = closedBy || `the xpra server closed its socket (${code})`; try { ws.close(); } catch { /* already closed */ } finish('server side'); });
      upstream.on('error', (e) => { if (cutDone) return; closedBy = closedBy || `xpra socket error ${(e && e.code) || (e && e.message) || ''}`.trim(); try { ws.close(); } catch { /* already closed */ } });
      // x5: what this socket said while it was blocked — its hello first — reaches xpra before anything newer
      const held = sieve.release();
      if (held.relay) { relayUp(held.relay); assertPin('after the held hello'); log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} is active now — the ${held.kinds.join(' and the ')} it sent while blocked ${held.kinds.length > 1 ? 'reach' : 'reaches'} xpra first`); }
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
    // ── lane desktop-x-seat-browser r2: THE INPUT SEAT (MAJOR A) and THE WORD TO THIS SOCKET (FAIL 3 — never silent) ──
    // r3 (acceptance r2 MAJOR 1 + 2 + 3): its reach is by WINDOW IDENTITY — HIS window (the keeper's), its transients and the popups
    // his own acts open (xpra's announcements on this socket, `book`; see XPRA_POPUP_OPEN_MS); a point only tells his windows apart
    let lastAsk = -Infinity, askTimer = null, askWhy = '', told = null, refusedN = 0, actsN = 0, refusedCode = null, lastTellAt = -Infinity, quietTimer = null;
    /** Read his window again (see XPRA_SCOPE_ASK_MS): at once when the pace allows, else once when it does (the latest why). */
    const ask = (why) => {
      askWhy = why;
      const wait = lastAsk + XPRA_SCOPE_ASK_MS - now();
      if (wait <= 0) { clearTimeout(askTimer); askTimer = null; lastAsk = now(); askSeatScope(id, why); return; }
      if (!askTimer) askTimer = setTimeout(() => { askTimer = null; if (ws.readyState === 1 && !cutDone) ask(askWhy); }, wait);
    };
    const book = new Map(); // wid → { x, y, w, h, or, tf, owner, at } — every window xpra announced to THIS socket, kept current
    let act = null; // his last act that may open a popup: { at, wid }
    let hover = null; // r4: his pointer's last move on a window of his: { at, wid, x, y } (a tooltip, a hover card may follow)
    const downs = new Map(); // 'k:<keyname>' / 'b:<button>' → { wid, release } — what his seat pressed: its release ALWAYS reaches xpra
    const synth = []; // releases re-addressed to the window that got the press (a release the client sent elsewhere)
    const readsWindows = seatWhy(id, seatRef.seat) !== undefined; // a seated source (a browser's display) reads its windows
    const num = (v) => (Number.isFinite(v) ? v : 0);
    const topOf = () => { const sc = seatScope(id); if (!sc) return null; if (Number.isInteger(sc.wid)) return sc.wid; const w = sc.wids && [...sc.wids][0]; return Number.isInteger(w) ? w : null; };
    /** Is `wid` his: his window, or a window whose transient-for (managed) / opening act (a popup) leads to it. */
    const mineWid = (wid, top = topOf(), d = 0) => {
      if (!Number.isInteger(wid) || top == null || d > 6) return false;
      if (wid === top) return true;
      const e = book.get(wid);
      const up = e ? (e.or ? e.owner : e.tf) : 0;
      return !!up && up !== wid && mineWid(up, top, d + 1);
    };
    const mineAll = (top = topOf()) => { if (top == null) return []; const out = [top]; for (const w of book.keys()) if (w !== top && mineWid(w, top)) out.push(w); return out; };
    const rectOf = (wid) => { const e = book.get(wid); if (e) return e; const sc = seatScope(id); return (sc && Array.isArray(sc.rects) && sc.rects.find((r) => r.wid === wid)) || null; };
    const inRect = (r, x, y) => !!r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    const touches = (a, b, gap) => !!a && !!b && b.x < a.x + a.w + gap && b.x + b.w > a.x - gap && b.y < a.y + a.h + gap && b.y + b.h > a.y - gap;
    /** A popup opening now is HIS when it follows his act on a window of his closely enough, touching that window — or (r4) his
     *  pointer resting on it, near the point; → the act it follows, or null. */
    const popupAct = (e, t) => {
      if (seatState(id, seatRef.seat) !== 'input') return null;
      if (act && t - act.at <= XPRA_POPUP_OPEN_MS && mineWid(act.wid) && touches(rectOf(act.wid), e, XPRA_POPUP_GAP_PX)) return act;
      if (hover && t - hover.at <= XPRA_POPUP_OPEN_MS && mineWid(hover.wid) && touches(rectOf(hover.wid), e, XPRA_POPUP_GAP_PX) && touches({ x: hover.x, y: hover.y, w: 1, h: 1 }, e, XPRA_HOVER_REACH_PX)) return hover;
      return null;
    };
    const watchDown = xpraWindowWatch((f) => {
      const type = f[0], wid = f[1];
      if (!Number.isInteger(wid)) return;
      const t = now();
      if (type === 'new-window' || type === 'new-override-redirect' || type === 'window-create') {
        const meta = f[6] && typeof f[6] === 'object' && !Array.isArray(f[6]) ? f[6] : {};
        const e = { x: num(f[2]), y: num(f[3]), w: num(f[4]), h: num(f[5]), or: type === 'new-override-redirect' || meta['override-redirect'] === true, tf: Number.isInteger(meta['transient-for']) ? meta['transient-for'] : 0, owner: 0, at: t };
        const a = e.or ? popupAct(e, t) : null;
        if (a) e.owner = a.wid;
        book.set(wid, e);
        if (a) log.log?.(`[desktop-stream] ${id}: popup ${wid} opened ${t - a.at} ms after his ${a === hover ? 'pointer rested on' : 'act on'} window ${a.wid} — it is his${viewerId ? ` (viewer ${viewerId})` : ''}`);
        else if (!e.or && !e.tf && seatState(id, seatRef.seat) === 'input' && !mineWid(wid)) ask(`window ${wid} opened`); // r4: a new top-level may be HIS (his Chrome relaunched, restored)
      } else if (type === 'lost-window') { if (!book.delete(wid)) return; if (wid === topOf() && seatState(id, seatRef.seat) === 'input') ask(`his window ${wid} closed`); } // r4: his browsing may go on in a new one
      else {
        const e = book.get(wid);
        if (!e) return;
        if (type === 'window-move-resize' || type === 'configure-override-redirect') Object.assign(e, { x: num(f[2]), y: num(f[3]), w: num(f[4]), h: num(f[5]) });
        else if (type === 'window-resized') Object.assign(e, { w: num(f[2]), h: num(f[3]) });
        else if (type === 'window-metadata' && f[2] && typeof f[2] === 'object' && Object.hasOwn(f[2], 'transient-for')) e.tf = Number.isInteger(f[2]['transient-for']) ? f[2]['transient-for'] : 0;
        else return;
      }
      tellSeat(); // his reach changed? (the word is said only when it did) — before this window reaches the client
    });
    /** The input seat's verdict on one packet: null = it reaches xpra, else the refusal's code (counted, told). `judge.loud` = the
     *  refused ACTS (a press, a key down) of this pass — the window's toast; every other refusal is told quietly. */
    const scopeVerdict = () => {
      const top = topOf();
      const judge = (type, payload, unit) => {
        if (type === null) return 'input-only'; // unreadable bytes never act
        if (XPRA_CLIPBOARD_TYPES.has(type)) return null; // his paste (the X clipboard; the key that pastes is scoped below)
        if (type === 'map-window') { const f = xpraFields(payload, 6), e = f && book.get(f[1]); return e && !e.or && (f[2] !== e.x || f[3] !== e.y || f[4] !== e.w || f[5] !== e.h) ? 'input-only' : null; } // r3: the server's own geometry only
        if (!Object.hasOwn(XPRA_SCOPED_INPUT, type)) return 'input-only'; // a display size, a geometry, a close, an unmap, a command…
        const at = XPRA_SCOPED_INPUT[type];
        const spans = [];
        const f = xpraFields(payload, at == null ? 4 : at + 1, 4096, spans);
        const wid = f && Number.isInteger(f[1]) ? f[1] : null;
        const pressed = (type === 'key-action' || type === 'button-action') && f && typeof f[3] === 'boolean' ? f[3] : null;
        const key = pressed === null ? null : `${type === 'key-action' ? 'k' : 'b'}:${f[2]}`;
        // MINOR (r2's) + MAJOR 3: a RELEASE of what his seat pressed always reaches xpra — at the window that got the press
        if (pressed === false && downs.has(key)) {
          const d = downs.get(key); downs.delete(key);
          if (wid === d.wid || mineWid(wid, top)) return null; // r4: at a window of his (the focused one — xpra raises nothing) as sent
          synth.push(d.release); return XPRA_READDRESSED;
        }
        if (type === 'focus' && wid === 0) return null; // r5: `focus 0` — xpra's reset_focus (no window, nothing in X): the first half of the client's raise of HIS window in X
        if (!mineWid(wid, top)) { // identity first: a window not his is refused whatever the point
          if (top == null) ask('not read yet');
          else if (pressed === true) ask(`a press on window ${wid}, not his`); // r4: his window may have been replaced
          if (pressed === true) { judge.loud++; return 'not-your-window'; }
          return type === 'focus' ? 'focus-elsewhere' : type === 'key-action' ? 'not-your-window' : 'pointer-outside';
        }
        if (at != null) {
          const c = f[at];
          if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return 'input-only';
          if (!mineAll(top).some((w) => inRect(rectOf(w), c[0], c[1]))) { if (pressed === true) { judge.loud++; ask('a press outside his windows'); return 'not-your-window'; } return 'pointer-outside'; } // xpra moves the pointer to these root coordinates
        }
        if (pressed === true && key) { // its release, ready: the press's own bytes with `pressed` flipped (CHR_TRUE 67 → CHR_FALSE 68)
          const off = unit && spans[3] ? unit.length - payload.length + spans[3][0] : -1;
          if (off >= 0 && unit[off] === 67) { const r = Buffer.from(unit); r[off] = 68; downs.set(key, { wid, release: r }); }
        }
        if (pressed !== null || (type === 'pointer-position' && book.get(wid) && book.get(wid).or)) act = { at: now(), wid }; // a popup may follow (a submenu: his pointer in a popup of his)
        else if (type === 'pointer-position') hover = { at: now(), wid, x: f[at][0], y: f[at][1] }; // r4: his pointer on his window — a tooltip may follow
        return null;
      };
      judge.loud = 0;
      return judge;
    };
    /** Tell this socket its seat — at every change (the seat, why, the windows it reaches) and at every refusal (r3: never silent —
     *  its code and counts: `refused` every refused packet, `acts` the refused presses / keys). Only a SEATED source's sockets hear it,
     *  after xpra's own first word. */
    const tellSeat = () => {
      clearTimeout(quietTimer); quietTimer = null;
      if (!answered || ws.readyState !== 1 || cutDone) return;
      const s = seatState(id, seatRef.seat);
      const why = seatWhy(id, seatRef.seat);
      if (why === undefined || s === 'blocked' || s === 'free') return;
      const wids = s === 'input' ? mineAll() : [];
      const sig = `${s}|${why || ''}|${wids.join(',')}`;
      if (told && told.sig === sig && told.refused === refusedN) return;
      told = { sig, refused: refusedN }; lastTellAt = now();
      sendDown(rencodePlus([XPRA_SEAT_PACKET, { seat: s, why: why || '', code: refusedCode || '', refused: refusedN, acts: actsN, wids }]));
    };
    /** A refusal that is no act of his: told too, at most once per XPRA_TELL_QUIET_MS (the latest counts). */
    const tellQuiet = () => { if (quietTimer) return; const wait = lastTellAt + XPRA_TELL_QUIET_MS - now(); if (wait <= 0) tellSeat(); else quietTimer = setTimeout(tellSeat, wait); };
    const noteRefused = (codes) => { let loudCode = null; for (const [c, n] of Object.entries(codes || {})) { if (c === XPRA_READDRESSED) continue; lastRefusal = c; refusedN += n; refusedCode = c; if (c === 'not-your-window') loudCode = c; } if (loudCode) refusedCode = loudCode; };
    /** r3 (MAJOR 3): his seat ended (watch, another pane, his browsing over) or the socket went with a key or a button down — each is
     *  released in X at the window that got it (the press's own bytes, flipped): a key is never left down. */
    const releaseDowns = (why) => {
      if (!downs.size || !upstream) return;
      const out = [...downs.values()].map((d) => d.release); downs.clear();
      relayUp(Buffer.concat(out));
      log.log?.(`[desktop-stream] ${id}: ${out.length} key(s) / button(s) his seat held released at their window (${why})${viewerId ? `, viewer ${viewerId}` : ''}`);
    };
    /** watch → INPUT with the upstream open: the keymap held while it watched reaches xpra NOW; its display size / geometry never. */
    const replayInput = () => { const r = sieve.strip(Buffer.alloc(0), false, { pinned: pinnedNow(), scope: () => 'input-only' }); if (r.relay) { relayUp(r.relay); log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} holds his INPUT seat — the keymap it sent while watching reaches xpra now (its display size and window geometry never: only the live view's ruling pane sizes a Chrome window)`); } };
    /** watch → active with the upstream open: the keymap / display size / geometry held while refused go out NOW (the app re-fits to this pane). */
    const replayHeld = () => { const r = sieve.strip(Buffer.alloc(0), true, { pinned: pinnedNow() }); if (r.relay) { relayUp(r.relay); log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} is active — the ${r.replayedKinds.join(' and the ')} it sent while refused ${r.replayed > 1 ? 'reach' : 'reaches'} xpra now`); } };
    conn.reconcile = (why) => {
      if (ws.readyState !== 1 || cutDone) return;
      if (resolveTargetSafe(id) === null) { closedBy = closedBy || 'the app session ended'; try { ws.close(ENDED_CLOSE, 'the app session ended'); } catch { /* closing */ } return; }
      const s = seatState(id, seatRef.seat);
      if (s !== 'input') releaseDowns(`its seat is ${s} now`); // r3: before anything else this socket's seat now means
      if (s === 'blocked') { if (upstream) cut(why); return; }
      if (!upstream) openUpstream(why === 'refresh' ? 'this viewer is active now' : why);
      else if (s === 'active') replayHeld();
      else if (s === 'input') replayInput(); // lane desktop-x-seat-browser r2: never the held geometry
      else if (s === 'size') { const g = sieve.releaseGeometry(); if (g.relay) { relayUp(g.relay); log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} sizes the window now — the ${g.kinds.join(' and the ')} it sent while refused ${g.kinds.length > 1 ? 'reach' : 'reaches'} xpra`); } } // lane browser-x-in-window
      tellSeat(); // r2: the socket hears its (new) seat
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
        const r = sieve.strip(buf, false, { hold: true, pinned: pinnedNow() });
        if (r.dropped) { dropped += r.dropped; stats.dropped += r.dropped; stats.blocked += r.dropped; lastRefusal = 'blocked'; }
        if (r.lifecycle) stats.lifecycle += r.lifecycle;
        if (r.oversize && !oversized) { oversized = true; closedBy = closedBy || closeOversize(ws, id, viewerId, r.oversize, 'xpra'); }
        if (s !== 'blocked') conn.reconcile('message');
        return;
      }
      let allow = true, sizes = false;
      if (s === 'input') { // lane desktop-x-seat-browser r2: the person's INPUT seat — scoped to his window, never the client's geometry
        const judge = scopeVerdict();
        const r = sieve.strip(buf, false, { pinned: pinnedNow(), scope: judge });
        if (r.dropped) { dropped += r.dropped; stats.dropped += r.dropped; const coded = Object.values(r.codes).reduce((n, k) => n + k, 0); if (r.dropped > coded) r.codes[r.lifecycle ? 'server-lifecycle' : 'input-only'] = r.dropped - coded; noteRefused(r.codes); actsN += judge.loud; } // r3: a cut the scope never saw (a lifecycle packet, a pinned size) is told too
        if (r.oversize && !oversized) { oversized = true; closedBy = closedBy || closeOversize(ws, id, viewerId, r.oversize, 'xpra'); }
        if (r.replayed) log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} may type now — the keymap it sent while watching reaches xpra first`);
        if (r.lifecycle) { stats.lifecycle += r.lifecycle; log.warn?.(`[desktop-stream] ${id}: ${r.lifecycle} server-lifecycle packet(s) (shutdown-server / exit-server) from ${viewerId ? `viewer ${viewerId}` : 'a viewer'} dropped — the keeper owns the xpra server's lifecycle`); }
        if (r.relay) relayUp(r.relay);
        if (synth.length) relayUp(Buffer.concat(synth.splice(0))); // r3: a release the client addressed elsewhere — at the press's window
        if (r.relay || pinSent) assertPin(pinSent ? 'the pin changed' : 'after the hello');
        if (r.dropped > (r.codes[XPRA_READDRESSED] || 0)) { if (Object.keys(r.codes).some((c) => !XPRA_QUIET_CODES.has(c))) tellSeat(); else tellQuiet(); } // r3: every refusal is told — a pointer passing by quietly
        if (!r.kept) return;
        const t = now();
        if (t - lastInputReport >= INPUT_REPORT_MS) { lastInputReport = t; try { onInput(id, viewerId); } catch { /* keeper is optional here */ } }
        return;
      }
      if (s === 'watch') { allow = false; lastRefusal = seatWhy(id, seatRef.seat) || 'watch-mode'; }
      else if (s === 'size') { allow = false; sizes = true; lastRefusal = 'size-only'; } // lane browser-x-in-window: the ruling pane sizes the window, never types
      else if (s === 'free' && inputPolicy) { try { const p = inputPolicy(id, viewerId); if (p && p.relay === false) { allow = false; lastRefusal = p.code || 'refused'; } } catch (e) { log.warn?.(`[desktop-stream] ${id}: inputPolicy threw — relaying: ${e && e.message}`); } }
      // THE POLICY PER PACKET (2026-09-22): a refused viewer's packets reach xpra only when XPRA_WATCH_TYPES names
      // them — its hello, ping echoes, damage acks, map-window, so the picture never
      // stalls on a Watch viewer (all-or-nothing per chunk dropped the hello itself) — and NOTHING else: input and
      // every control packet are cut out (round 2: a relayed `shutdown-server` from a Watch viewer ended the session).
      // Its keymap, display-size and (x5) configure-window packets are cut and the last of each HELD for its takeover
      // (r7 / r8 / x5: shared state). shutdown-server / exit-server are cut from EVERY viewer: the server's lifecycle is the keeper's.
      const r = sieve.strip(buf, allow, { pinned: pinnedNow(), geometry: sizes });
      if (r.dropped) { dropped += r.dropped; stats.dropped += r.dropped; if (!allow) { refusedN += r.dropped; actsN += r.acts; refusedCode = lastRefusal; if (r.acts) tellSeat(); else tellQuiet(); } } // r3: a pointer passing by is told too (quietly)
      if (r.oversize && !oversized) { oversized = true; closedBy = closedBy || closeOversize(ws, id, viewerId, r.oversize, 'xpra'); }
      if (r.replayed) log.log?.(`[desktop-stream] ${id}: ${viewerId ? `viewer ${viewerId}` : 'a viewer'} may type now — the ${r.replayedKinds.join(' and the ')} it sent while refused ${r.replayed > 1 ? 'reach' : 'reaches'} xpra first`);
      if (r.lifecycle) { stats.lifecycle += r.lifecycle; if (allow) lastRefusal = 'server lifecycle'; log.warn?.(`[desktop-stream] ${id}: ${r.lifecycle} server-lifecycle packet(s) (shutdown-server / exit-server) from ${viewerId ? `viewer ${viewerId}` : 'a viewer'} dropped — the keeper owns the xpra server's lifecycle`); }
      if (r.relay) relayUp(r.relay);
      if (r.relay || pinSent) assertPin(pinSent ? 'the pin changed' : 'after the hello');
      if (!r.inputs || !allow) return; // a refused input is nobody at the keyboard
      const t = now();
      if (t - lastInputReport >= INPUT_REPORT_MS) { lastInputReport = t; try { onInput(id, viewerId); } catch { /* keeper is optional here */ } }
    });
    ws.on('close', (code, reason) => { releaseDowns('the socket closed'); finish(`the browser closed, code ${code}${reason && reason.length ? ' ' + String(reason).slice(0, 60) : ''}`); try { upstream?.close(); } catch { /* gone */ } try { upstream?.terminate(); } catch { /* gone */ } });
    ws.on('error', (e) => { closedBy = closedBy || wsOversize(e, id, viewerId, 'xpra') || `browser socket error ${(e && e.code) || ''}`.trim(); try { upstream?.terminate(); } catch { /* gone */ } });
  }
  return (a) => bridgeXpra(a.ws, a.id, a.port, a.viewerId, a.netem, a.req);
}

module.exports = { rencodePlus, xpraFields, lz4Inflate, xpraBody, xpraWindowWatch, XPRA_WINDOW_TYPES, XPRA_POPUP_OPEN_MS, XPRA_POPUP_GAP_PX, XPRA_HOVER_REACH_PX, XPRA_SCOPE_ASK_MS, XPRA_TELL_QUIET_MS, XPRA_SCOPED_INPUT, XPRA_CLIPBOARD_TYPES, XPRA_SEAT_PACKET, pinDesktopPacket, STREAM_KIND: 'xpra', serverName: 'xpra server', maxMessageBytes: XPRA_MAX_PACKET_BYTES, netem: true, bridgeOf, XPRA_MAX_PACKET_BYTES, XPRA_INPUT_TYPES, XPRA_WATCH_TYPES, XPRA_KEYMAP_TYPES, XPRA_KEYMAP_HOLD_BYTES, XPRA_DISPLAY_TYPES, XPRA_DISPLAY_HOLD_BYTES, XPRA_GEOMETRY_TYPES, XPRA_GEOMETRY_HOLD_BYTES, XPRA_HELLO_HOLD_BYTES, XPRA_HELD_KINDS, XPRA_LIFECYCLE_TYPES, XPRA_HEADER, XPRA_FLAGS_ENCODER, xpraPacketType, xpraStrings, xpraInputSieve };
