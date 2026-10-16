// XPRA PROTOCOL, THE PURE HALF (P8-2 chunk x2, 2026-09-22; imports nothing,
// bundled into the browser AND imported by the node suite). Everything the
// xpra client SAYS and everything it DECIDES without a DOM: the hello
// capabilities, every packet the html5 side sends (the forms are the ones
// xpra-html5 v21 sends to xpra 6.5.3, read from its Client.js on this box —
// `key-action`, `button-action`, `pointer-position`,
// `map-window`, `configure-window`, `damage-sequence`, `clipboard-token`, the wheel as
// button 4-7 clicks (`wheel-motion` needs a precise-wheel device xtest is not),
// `clipboard-contents`, `display-configure` (6.5.3's name; `configure-display`
// is its legacy alias) and `keyboard-config`), the browser-key → X-keysym
// rule, the pane FIT arithmetic (the app window IS the picture — owner
// acceptance 1), and which clipboard chords the BROWSER keeps
// (`clipboardShortcut`; the DELIVERY rule — API / the user's gesture window /
// the chip — is the shared shell's, picture-shell.js `clipboardDelivery`: the
// dead twin that sat here was removed in round 3, A1).
//
// PROVENANCE, MEASURED 2026-09-22 on xpra v6.5.3 + xpra-html5 21: the server
// names its packets in `xpra/server/subsystem/{display,keyboard,pointer,
// clipboard}.py` (`display-configure` with `configure-display` an
// add_legacy_alias; `desktop_size` only under BACKWARDS_COMPATIBLE), and its
// x11 keyboard NEVER invents a keycode for a keysym the keymap lacks: a
// client that sends only `keycodes` (xpra-html5's shape) gets a TRANSLATION
// onto the server's own `us` keymap (`set_keycode_translation`) — so `é`,
// let alone `中`, could never be typed — while a client that sends
// `x11_keycodes` + `query_struct` (a native xpra client's shape) has the X
// keymap PROGRAMMED from its own map (`set_all_keycodes` → xmodmap). This
// client speaks the native shape: `X11_KEYMAP` (every keycode with its
// shifted level, the modifiers on their own keycodes) plus, for text an IME
// composes or a key outside the US layout produces, a published row per
// character (`ImeKeymap`: `U<hex>` / Latin-1 names on rolling keycodes,
// `keyboard-config` re-sent BEFORE the press — the server reprograms the
// keymap, ~tens of ms, once per new character).
//
// WHY THE npm `xpra-html5-client` IS NOT USED (the chunk's vet, recorded):
// 2.3.0 is the last release (2022-05-25, xpra 4.x era — 6.5.3 renamed the
// resize and keymap packets since); its README says "Mozilla Public License
// Version 2.0 … based on the official Xpra HTML5 client sources" while its
// package.json says Apache-2.0 (the licence advantage the design assumed is
// not what the code carries); 10.7 MB unpacked / 2.37 MB ESM with node-forge,
// lodash-es, pako, brotli, lz4js; and it is a WHOLE client with its own
// window model, not a protocol layer — the window would not be ours (§4.4).
// The transport is therefore the upstream html5 v21 Protocol.js worker
// (MPL-2.0; rencodeplus + lz4 + brotli, 12 KB + its libs), served UNMODIFIED
// from the installed package behind our auth (x1's /xpra-ui/ route — the
// package manager keeps it matched to the xpra on that machine); everything
// above the packets is this file, xpra-client.js and xpra-view.js.

/** The window metadata keys this client understands (xpra-html5 v21's list + `size-constraints`).
 *  `size-constraints` IS THE 6.x NAME of the X size hints (2.369.158, MEASURED on 6.5.3): the server
 *  only sends the keys a client lists, and v21's list says `size-hints` (the pre-4 name) — so until
 *  this entry no window ever carried its minimum / increment, the fit belt ran blind and GNOME
 *  Calculator (minimum 360x616) was asked for a shorter pane, clamped by X and cropped (the owner's
 *  2026-09-23 report). With it: calculator `{increment:[2,2], minimum-size:[720,1232]}` at GDK_SCALE=2,
 *  xterm `{base-size:[4,4], increment:[6,13], minimum-size:[10,17]}`. */
export const METADATA_SUPPORTED = Object.freeze(['fullscreen', 'maximized', 'iconic', 'above', 'below', 'title', 'size-hints', 'size-constraints', 'class-instance', 'transient-for', 'window-type', 'has-alpha', 'decorations', 'override-redirect', 'tray', 'modal', 'opacity', 'desktop', 'shadow']);

/** Picture encodings this client can paint. NO rgb32/rgb24 on purpose: raw
 *  pixel data may arrive lz4-compressed inside the packet and the decoder for
 *  that lives in the protocol worker, not on the main thread — png/jpeg/webp
 *  decode natively (createImageBitmap), `void` is an ack with nothing to paint.
 *  NO `scroll` (lane xpra-ime-mac — an UPSTREAM bug, MEASURED on xpra 6.5.4): its
 *  encode_scrolling calls queue_damage_packet() without `options`, so every frame
 *  it picks scrolling for is LOST ("failed to create data packet": 104× in one
 *  Google Docs window's log, 30 788× in another) and the picture stops following
 *  until something else repaints. XPRA_SCROLL_ALL=0 is NOT enough — the video
 *  encoder reaches the same call. A client without `scroll` is never scroll-encoded
 *  (supports_scrolling); the view still paints a `scroll` draw (the moves) if one
 *  comes. test-desktop-display keeps the installed version's row. */
export const ENCODINGS = Object.freeze(['png', 'png/P', 'png/L', 'jpeg', 'webp', 'void']);

/** The keymap this client publishes, on the X KEYCODES A pc105 `evdev` KEYBOARD HAS (keycode = evdev code + 8 — what
 *  `xmodmap -pke` lists on a stock `us` display; lane xpra-ime-mac, inc-mvaddc4m-6m0t): level 0 per keycode. Until
 *  2.369.286 the table was keyed by the BROWSER's keyCodes (xpra-html5's CHARCODE_TO_NAME: w = 87, s = 83, x = 88,
 *  a = 65, 2 = 50, Enter = 13) and xpra PROGRAMS the X keymap from it, so `w` reached the app on X keycode 87 — the
 *  evdev KP_1 slot. MEASURED with xpra 6.5.4's own KeyboardConfig.set_keymap on a private Xvfb and a real Chrome in it:
 *  the keysym was `w` but Chrome named the key `code: Numpad1` (s Numpad4, x Numpad2, d F2, a Space, 2 ShiftLeft, Enter
 *  Digit4), and Google Docs acts on a numpad code with NumLock off — the owner's w = End, s = Left, x = Down. On the
 *  evdev keycodes the keysym AND the physical code agree, and the map equals the server's own `us` map for every key
 *  (so a pane whose keymap never reached xpra types the same). The IME rows ride the free keycodes above (226–255). */
export const KEYCODE_TABLE = Object.freeze({
  9: 'Escape', 10: '1', 11: '2', 12: '3', 13: '4', 14: '5', 15: '6', 16: '7', 17: '8', 18: '9', 19: '0', 20: 'minus', 21: 'equal', 22: 'BackSpace', 23: 'Tab',
  24: 'q', 25: 'w', 26: 'e', 27: 'r', 28: 't', 29: 'y', 30: 'u', 31: 'i', 32: 'o', 33: 'p', 34: 'bracketleft', 35: 'bracketright', 36: 'Return', 37: 'Control_L',
  38: 'a', 39: 's', 40: 'd', 41: 'f', 42: 'g', 43: 'h', 44: 'j', 45: 'k', 46: 'l', 47: 'semicolon', 48: 'apostrophe', 49: 'grave', 50: 'Shift_L', 51: 'backslash',
  52: 'z', 53: 'x', 54: 'c', 55: 'v', 56: 'b', 57: 'n', 58: 'm', 59: 'comma', 60: 'period', 61: 'slash', 62: 'Shift_R', 63: 'KP_Multiply', 64: 'Alt_L', 65: 'space', 66: 'Caps_Lock',
  67: 'F1', 68: 'F2', 69: 'F3', 70: 'F4', 71: 'F5', 72: 'F6', 73: 'F7', 74: 'F8', 75: 'F9', 76: 'F10', 77: 'Num_Lock', 78: 'Scroll_Lock',
  79: 'KP_7', 80: 'KP_8', 81: 'KP_9', 82: 'KP_Subtract', 83: 'KP_4', 84: 'KP_5', 85: 'KP_6', 86: 'KP_Add', 87: 'KP_1', 88: 'KP_2', 89: 'KP_3', 90: 'KP_0', 91: 'KP_Decimal',
  92: 'ISO_Level3_Shift', 95: 'F11', 96: 'F12', 104: 'KP_Enter', 105: 'Control_R', 106: 'KP_Divide', 107: 'Print', 108: 'Alt_R',
  110: 'Home', 111: 'Up', 112: 'Prior', 113: 'Left', 114: 'Right', 115: 'End', 116: 'Down', 117: 'Next', 118: 'Insert', 119: 'Delete',
  127: 'Pause', 133: 'Super_L', 134: 'Super_R', 135: 'Menu',
});
/** The SHIFTED level of the US layout for the keycodes that have one (a
 *  letter's upper case is derived by X itself). */
export const SHIFTED_TABLE = Object.freeze({ 10: 'exclam', 11: 'at', 12: 'numbersign', 13: 'dollar', 14: 'percent', 15: 'asciicircum', 16: 'ampersand', 17: 'asterisk', 18: 'parenleft', 19: 'parenright', 20: 'underscore', 21: 'plus', 34: 'braceleft', 35: 'braceright', 47: 'colon', 48: 'quotedbl', 49: 'asciitilde', 51: 'bar', 59: 'less', 60: 'greater', 61: 'question' });
/** The NATIVE keymap this client publishes (`x11_keycodes`: keycode → [level0, level1]) — the X keymap is
 *  programmed from it, so every keysym this client can press is on it. Integer keys: sent as a Map (rencode_map). */
export const X11_KEYMAP = Object.freeze(Object.fromEntries(Object.entries(KEYCODE_TABLE).map(([kc, name]) => [Number(kc), SHIFTED_TABLE[kc] ? [name, SHIFTED_TABLE[kc]] : /^[a-z]$/.test(name) ? [name, name.toUpperCase()] : [name]])));
/** The modifier keysyms (a ⌘ chord's own modifier press is never tapped — lane xpra-ime-mac). */
export const MODIFIER_KEYNAMES = Object.freeze(new Set(['Shift_L', 'Shift_R', 'Control_L', 'Control_R', 'Alt_L', 'Alt_R', 'Super_L', 'Super_R', 'Meta_L', 'Meta_R', 'ISO_Level3_Shift', 'Caps_Lock', 'Num_Lock']));
/** keysym name → the X keycode carrying it on the published map (level 0 first, then the shifted level). */
export const NAME_TO_KEYCODE = Object.freeze((() => { const m = {}; for (const [kc, name] of Object.entries(KEYCODE_TABLE)) if (!(name in m)) m[name] = Number(kc); for (const [kc, name] of Object.entries(SHIFTED_TABLE)) if (!(name in m)) m[name] = Number(kc); return m; })());
/** What `setxkbmap -query` would say for the base layout the keymap is built on. */
export const QUERY_STRUCT = Object.freeze({ rules: 'evdev', model: 'pc105', layout: 'us', variant: '', options: '' });
/** The rolling slots ImeKeymap hands to composed characters (lane xpra-ime-mac): ONLY keycodes that are NoSymbol on the
 *  stock evdev `us` map (scripts/fixtures/evdev-us-pke.txt — what an app started before a viewer's keymap has seen) AND
 *  that a real Chrome on X names with no `code` and keyCode 0 (MEASURED on a private Xvfb with xpra's own set_keymap:
 *  each slot typed its character; 97 IntlRo, 103 keyCode 108, 132 IntlYen, 197 F19 and 202 F24 left out). The old
 *  226–255 run carried stock XF86 media keysyms. */
export const IME_KEYCODES = Object.freeze([8, 120, 149, 154, 168, 178, 183, 184, 217, 219, 222, 230, 248]);

/** KeyboardEvent.code → X keysym name (xpra-html5's KEY_TO_NAME + the arrows,
 *  keypad and function keys it resolves through other tables). */
export const CODE_TO_NAME = Object.freeze({
  Escape: 'Escape', Tab: 'Tab', CapsLock: 'Caps_Lock', ShiftLeft: 'Shift_L', ShiftRight: 'Shift_L', ControlLeft: 'Control_L', ControlRight: 'Control_L',
  MetaLeft: 'Super_L', MetaRight: 'Super_R', OSLeft: 'Super_L', OSRight: 'Super_R', AltLeft: 'Alt_L', AltRight: 'Alt_L', Space: 'space', ContextMenu: 'Menu',
  Enter: 'Return', Backspace: 'BackSpace', ScrollLock: 'Scroll_Lock', Pause: 'Pause', NumLock: 'Num_Lock', PrintScreen: 'Print',
  Insert: 'Insert', Home: 'Home', PageUp: 'Prior', Delete: 'Delete', End: 'End', PageDown: 'Next',
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  NumpadEnter: 'KP_Enter', NumpadDivide: 'KP_Divide', NumpadMultiply: 'KP_Multiply', NumpadSubtract: 'KP_Subtract', NumpadAdd: 'KP_Add', NumpadDecimal: 'KP_Decimal',
  Numpad0: 'KP_0', Numpad1: 'KP_1', Numpad2: 'KP_2', Numpad3: 'KP_3', Numpad4: 'KP_4', Numpad5: 'KP_5', Numpad6: 'KP_6', Numpad7: 'KP_7', Numpad8: 'KP_8', Numpad9: 'KP_9',
  ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`F${i + 1}`, `F${i + 1}`])),
});

/** X keysym names for the printable ASCII + Latin-1 characters (keysym value
 *  == code point in these ranges; xpra-html5's KEYSYM_TO_UNICODE inverted). */
const CHAR_NAMES = ' space!exclam"quotedbl#numbersign$dollar%percent&ampersand\'apostrophe(parenleft)parenright*asterisk+plus,comma-minus.period/slash:colon;semicolon<less=equal>greater?question@at[bracketleft\\backslash]bracketright^asciicircum_underscore`grave{braceleft|bar}braceright~asciitilde';
const CHAR_TO_NAME = (() => {
  const m = {};
  const re = /(.)([a-z]+)/g;
  let x;
  while ((x = re.exec(CHAR_NAMES))) m[x[1]] = x[2];
  const latin1 = { 160: 'nobreakspace', 161: 'exclamdown', 162: 'cent', 163: 'sterling', 164: 'currency', 165: 'yen', 166: 'brokenbar', 167: 'section', 168: 'diaeresis', 169: 'copyright', 170: 'ordfeminine', 171: 'guillemotleft', 172: 'notsign', 173: 'hyphen', 174: 'registered', 175: 'macron', 176: 'degree', 177: 'plusminus', 178: 'twosuperior', 179: 'threesuperior', 180: 'acute', 181: 'mu', 182: 'paragraph', 183: 'periodcentered', 184: 'cedilla', 185: 'onesuperior', 186: 'masculine', 187: 'guillemotright', 188: 'onequarter', 189: 'onehalf', 190: 'threequarters', 191: 'questiondown', 192: 'Agrave', 193: 'Aacute', 194: 'Acircumflex', 195: 'Atilde', 196: 'Adiaeresis', 197: 'Aring', 198: 'AE', 199: 'Ccedilla', 200: 'Egrave', 201: 'Eacute', 202: 'Ecircumflex', 203: 'Ediaeresis', 204: 'Igrave', 205: 'Iacute', 206: 'Icircumflex', 207: 'Idiaeresis', 208: 'ETH', 209: 'Ntilde', 210: 'Ograve', 211: 'Oacute', 212: 'Ocircumflex', 213: 'Otilde', 214: 'Odiaeresis', 215: 'multiply', 216: 'Ooblique', 217: 'Ugrave', 218: 'Uacute', 219: 'Ucircumflex', 220: 'Udiaeresis', 221: 'Yacute', 222: 'THORN', 223: 'ssharp', 224: 'agrave', 225: 'aacute', 226: 'acircumflex', 227: 'atilde', 228: 'adiaeresis', 229: 'aring', 230: 'ae', 231: 'ccedilla', 232: 'egrave', 233: 'eacute', 234: 'ecircumflex', 235: 'ediaeresis', 236: 'igrave', 237: 'iacute', 238: 'icircumflex', 239: 'idiaeresis', 240: 'eth', 241: 'ntilde', 242: 'ograve', 243: 'oacute', 244: 'ocircumflex', 245: 'otilde', 246: 'odiaeresis', 247: 'division', 248: 'oslash', 249: 'ugrave', 250: 'uacute', 251: 'ucircumflex', 252: 'udiaeresis', 253: 'yacute', 254: 'thorn', 255: 'ydiaeresis' };
  for (const [cp, name] of Object.entries(latin1)) m[String.fromCodePoint(Number(cp))] = name;
  return Object.freeze(m);
})();

/** The keysym NAME and VALUE for one character: ASCII letters/digits are
 *  their own name (lower-case letters — shift rides the modifier list),
 *  punctuation and Latin-1 have X names, everything else is the Unicode
 *  keysym `U<HEX>` (value 0x1000000 | code point — what XStringToKeysym
 *  understands). */
export function charKeysym(ch) {
  const cp = ch.codePointAt(0);
  if (cp == null) return null;
  if ((cp >= 0x30 && cp <= 0x39) || (cp >= 0x61 && cp <= 0x7a)) return { keyname: ch, keyval: cp };
  if (cp >= 0x41 && cp <= 0x5a) return { keyname: ch.toLowerCase(), keyval: cp + 32 };
  const named = CHAR_TO_NAME[ch];
  if (named) return { keyname: named, keyval: cp };
  return { keyname: `U${cp.toString(16).toUpperCase().padStart(4, '0')}`, keyval: 0x1000000 | cp };
}

/** JS modifier state → xpra's modifier names (xpra-html5's MODIFIERS_NAMES). */
export function modifiersOf(m = {}) {
  const out = [];
  if (m.shift) out.push('shift');
  if (m.control) out.push('control');
  if (m.alt) out.push('mod1');
  if (m.meta) out.push('mod4');
  if (m.altGraph) out.push('mod5');
  if (m.capsLock) out.push('lock');
  if (m.numLock) out.push('mod2');
  return out;
}

/**
 * A key event → the `key-action` fields, or null when nothing should be sent
 * (an IME in flight, an unidentified key, a dead key — composition delivers
 * those). `ev` is the PLAIN shape the view extracts from a KeyboardEvent:
 * { key, code, keyCode, location, mods: {shift, control, alt, meta, altGraph,
 * capsLock, numLock}, composing }.
 */
export function keyActionFor(ev) {
  if (!ev || ev.composing || ev.keyCode === 229) return null;
  const key = String(ev.key ?? '');
  const code = String(ev.code ?? '');
  const modifiers = modifiersOf(ev.mods);
  let keyname = null, keyval = 0;
  if (key === 'AltGraph') keyname = 'ISO_Level3_Shift';
  else if (CODE_TO_NAME[code]) keyname = CODE_TO_NAME[code];
  else if (CODE_TO_NAME[key]) keyname = CODE_TO_NAME[key];
  else if ([...key].length === 1) { const k = charKeysym(key); keyname = k.keyname; keyval = k.keyval; }
  else if (/^Key[A-Z]$/.test(code)) { keyname = code.slice(3).toLowerCase(); keyval = keyname.charCodeAt(0); }
  else if (/^Digit[0-9]$/.test(code)) { keyname = code.slice(5); keyval = keyname.charCodeAt(0); }
  else return null; // Dead, Unidentified, Process, Compose … — composition carries the text
  // the keycode is the X keycode carrying this keysym on OUR (evdev) keymap — a shifted name sits on its base key; a
  // keysym the map lacks has none (0: never sent as a key — `typeText` publishes a row for its character). NEVER the
  // browser's keyCode: X keycode 87 is KP_1 (the lane's measurement above).
  const own = NAME_TO_KEYCODE[keyname];
  const keycode = own != null ? own : 0;
  return { keyname, keyval, string: [...key].length === 1 ? key : '', keycode, modifiers };
}
/** Is this key on the keymap this client published (so the press resolves)?
 *  A character outside it (é on a US layout, anything an IME composes) goes
 *  through `ImeKeymap` instead — publish, then press. */
export function nativeKey(k) {
  const levels = k && X11_KEYMAP[k.keycode];
  return !!(levels && levels.includes(k.keyname));
}

/**
 * The clipboard shortcuts the BROWSER must see: Ctrl/⌘+V (and Shift+V)
 * is 'paste' — never forwarded as a key, never prevented, so the `paste`
 * event fires with the text (the ONE path that works on plain http); Ctrl/⌘+C
 * and +X are 'copy' — forwarded to the app (it copies; the token comes back)
 * AND left to the browser. Everything else is null (forward + prevent).
 */
export function clipboardShortcut({ key = '', control = false, meta = false } = {}) {
  if (!(control || meta)) return null;
  const k = String(key).toLowerCase();
  if (k === 'v') return 'paste';
  if (k === 'c' || k === 'x') return 'copy';
  return null;
}

/**
 * The app window's geometry for a pane of paneW×paneH under its X size
 * hints (`size-constraints`: minimum-size / maximum-size / increment /
 * base-size): as large as the pane allows, snapped DOWN to the increment
 * grid from the base (xterm grows by character cells), never below the
 * minimum, never above the maximum, never < 1.
 * LANE D (a) — A PANE SMALLER THAN THE MINIMUM KEEPS ITS ASPECT: the view shows
 * such a window scaled to fit (the badge), so the window takes the PANE's
 * shape at that scale (k = the smaller of pane ÷ minimum per axis; the pane
 * ÷ k) — the scaled picture fills the pane instead of leaving bands of the
 * pane's background beside it (measured, DPR 1 at 2×: a 720×1232 minimum in
 * an 898×913 pane was 25.8 % background, 116 CSS px either side).
 */
export function fitGeometry({ paneW, paneH }, constraints = null) {
  const c = constraints || {};
  const min = sizePair(c['minimum-size']), max = sizePair(c['maximum-size']), inc = sizePair(c['increment']), base = sizePair(c['base-size']) || min;
  let w = Math.max(1, Math.floor(paneW || 1)), h = Math.max(1, Math.floor(paneH || 1));
  let k = 1;
  if (min) { k = Math.min(1, w / min[0], h / min[1]); if (k < 1) { w = Math.max(w, Math.ceil(w / k - 1e-6)); h = Math.max(h, Math.ceil(h / k - 1e-6)); } }
  if (max) { w = Math.min(w, max[0]); h = Math.min(h, max[1]); }
  if (inc) {
    const bw = base ? base[0] : 0, bh = base ? base[1] : 0;
    // scaled to fit (k < 1): the free axis snaps UP one cell — a picture short of the pane by a cell would leave a band
    const snap = (v, b, i) => { let n = b + Math.floor((v - b) / i) * i; if (k < 1 && n < v) n += i; return n; };
    if (inc[0] > 1 && w > bw) w = snap(w, bw, inc[0]);
    if (inc[1] > 1 && h > bh) h = snap(h, bh, inc[1]);
  }
  if (min) { w = Math.max(w, min[0]); h = Math.max(h, min[1]); }
  return { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) };
}
function sizePair(v) { return Array.isArray(v) && v.length >= 2 && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1])) && Number(v[0]) > 0 && Number(v[1]) > 0 ? [Number(v[0]), Number(v[1])] : null; }

/** A secondary window (dialog, popup) nudged INSIDE the pane — never lost
 *  off-screen; a window bigger than the pane is pinned to the origin. */
export function placeInside({ x, y, w, h }, { paneW, paneH }) {
  let nx = x, ny = y;
  if (nx + w > paneW) nx = paneW - w;
  if (ny + h > paneH) ny = paneH - h;
  if (nx < 0) nx = 0;
  if (ny < 0) ny = 0;
  return { x: nx, y: ny, w, h, moved: nx !== x || ny !== y };
}

/**
 * HiDPI (2.369.158): the pane in DEVICE px — what the X display and every geometry packet speak
 * (the view hands the client CSS px × devicePixelRatio, so a 2× screen gets an app rendered with 2×
 * pixels drawn 1:1; the canvas's CSS size is device / ratio). A ratio that is not a finite positive
 * number is 1.
 * ROUNDED DOWN, never to the nearest (the verifier, DPR 1.5: 733 CSS × 1.5 = 1099.5 → 1100 device
 * px, whose CSS box 733.33 overflowed the 733 pane ⇒ the stage took a 0.9995 transform, the picture
 * was RESAMPLED — blurred, 4 % of its pixels off — and the "Scaled to fit" badge showed on a pane
 * that holds the app): the device pane's CSS box (device ÷ ratio) is never larger than the pane.
 * `minPaneCss` rounds UP, so a pane of exactly the minimum still holds it (floor(ceil(m/r)·r) ≥ m).
 * The 1e-6 absorbs float noise (700 × 1.15 = 804.9999…) so an exact product is never a pixel short.
 */
export function pixelRatioOf(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(4, n) : 1; }
export function devicePane({ width, height }, ratio = 1, { cover = false } = {}) {
  const r = pixelRatioOf(ratio);
  // lane D (a): a RESAMPLED picture (a fractional scale shown at s ÷ GDK_SCALE) has no 1:1 grid to keep — rounded UP it
  // COVERS the pane (the < 1 CSS px overhang is clipped by the pane), where rounding down left a sliver of background
  const round = cover ? (v) => Math.ceil(v - 1e-6) : (v) => Math.floor(v + 1e-6);
  return { width: Math.max(1, round((Number(width) || 1) * r)), height: Math.max(1, round((Number(height) || 1) * r)) };
}
/**
 * THE WHOLE-CSS-PX BACKING (r2, MEASURED): Chrome paints a canvas into its box snapped to WHOLE CSS
 * px — a box of 1346 / 1.5 = 897.33… CSS (DPR 1.5, a calculator: 1.5 % of the pixels off a 1:1 copy)
 * or even 1395 / 2 = 697.5 CSS (DPR 2, an xterm 1395 device px wide: 18.6 % off, every glyph edge
 * softened) is RESAMPLED; the same canvases with a whole-CSS-px box are the screen pixel for pixel.
 * `gridStep(r)` is the smallest device-px step k (≤ 16) whose CSS size k / r is a WHOLE CSS px
 * (DPR 2 ⇒ 2, 1.5 ⇒ 3, 1.25 ⇒ 5, 1.75 ⇒ 7, 1.1 ⇒ 11, 1 ⇒ 1); a ratio with none is 1 (no padding —
 * it cannot be exact). `backingSize(n, r)` = n rounded UP to
 * that step: the view sizes each window's canvas backing to it (the window's pixels at 0,0, the
 * < k-px transparent margin clipped by the window's own box), so the canvas box is exact.
 */
export function gridStep(ratio = 1) {
  const r = pixelRatioOf(ratio);
  for (let k = 1; k <= 16; k++) { const u = k / r; if (Math.abs(u - Math.round(u)) < 1e-6) return k; }
  return 1;
}
export function backingSize(n, ratio = 1) {
  const k = gridStep(ratio), v = Math.max(1, Math.ceil(Number(n) || 1));
  return Math.ceil(v / k) * k;
}

/**
 * The SMALLEST pane (CSS px) the app window fits in without scaling, from its size constraints
 * (device px): `minimum-size`, else `base-size` (ICCCM: an unset minimum defaults to the base),
 * divided by the ratio and rounded UP — so `devicePane(minPaneCss(h, r), r)` is never below the
 * minimum. A pane at least this big gets a fit that is never larger than the pane (fitGeometry snaps
 * DOWN to the increment grid and only then raises to the minimum). No hints (or neither size) ⇒ null.
 */
export function minPaneCss(constraints, ratio = 1) {
  const c = constraints || {};
  const m = sizePair(c['minimum-size']) || sizePair(c['base-size']);
  if (!m) return null;
  const r = pixelRatioOf(ratio);
  return { w: Math.ceil(m[0] / r - 1e-9), h: Math.ceil(m[1] / r - 1e-9) };
}

/** The size hints of a window's metadata under either name xpra has used. */
export function sizeHintsOf(meta = {}) { return meta['size-constraints'] || meta['size-hints'] || null; }

/**
 * THE APP FIXED ITS SIZE (lane app-fit-fixed, 2026-10-03 — the owner: 「对于自己定死尺寸的窗口我们应该遵循他们的尺寸并且禁止
 * 缩放」): the window's size constraints state a minimum EQUAL to its maximum (X's WM_NORMAL_HINTS min = max — what GTK's
 * set_resizable(False) and Qt's setFixedSize write; MEASURED on xpra 6.5.4 at 2×: WeChat 4.1's login 560×760, Inkscape
 * 1.4.3's welcome 1420×1356). Returns that size {w, h} (device px), else null (no hints, a range, an unusable pair).
 */
export function fixedSizeOf(constraints) {
  const c = constraints || {};
  const min = sizePair(c['minimum-size']), max = sizePair(c['maximum-size']);
  return min && max && min[0] === max[0] && min[1] === max[1] ? { w: min[0], h: min[1] } : null;
}

/** The kind of a window from its metadata: 'popup' (override-redirect —
 *  menus, tooltips, combos), 'dialog' (transient for another window, or a
 *  DIALOG/UTILITY type), else 'main'. */
export function windowKind(meta = {}, overrideRedirect = false) {
  if (overrideRedirect || meta['override-redirect']) return 'popup';
  const t = Array.isArray(meta['window-type']) ? meta['window-type'].map((x) => String(x).toUpperCase()) : [];
  if (meta['transient-for'] || t.includes('DIALOG') || t.includes('UTILITY') || t.includes('TOOLBAR') || t.includes('SPLASH')) return 'dialog';
  return 'main';
}

// ── AN APP'S SECOND WINDOW (design 016 S1, lane app-guest-window, 2026-10-03 — the owner: 「对于这种app又打开一个窗口的情况你似乎
// 没有处理好」: WeChat's Moments drawn over the main window, cut at the bottom). MEASURED on the owner's :4 (xprop): Weixin
// NORMAL 1574×974 (min 840×816, max 1574×974); Moments NORMAL, no transient-for, 880×974 at 324,0, min 880×1120; a 138×44
// override-redirect tooltip. The pane HOLDS every mapped window that is not a popup (menus and tooltips stay where X put them).
const heldWindow = (win) => !!win && win.kind !== 'popup' && win.mapped !== false;
/** The pane's minimum (device px): the UNION of every held window's minimum (`minimum-size`, else `base-size` — the
 *  rule of minPaneCss), {w, h} — or null when none states one. Weixin + Moments ⇒ 880×1120: the window grows to hold
 *  Moments instead of cutting it. */
export function unionMin(windows) {
  let w = 0, h = 0;
  for (const win of windows || []) {
    if (!heldWindow(win)) continue;
    const c = sizeHintsOf(win.meta || {}) || {};
    const m = sizePair(c['minimum-size']) || sizePair(c['base-size']);
    if (m) { w = Math.max(w, m[0]); h = Math.max(h, m[1]); }
  }
  return w && h ? { w, h } : null;
}
/** A SECOND top-level (a NORMAL window that is not the app's main) is placed CENTRED over `over` (the main's rectangle,
 *  else the pane), then kept inside the pane (`placeInside`: one larger than the pane is pinned to the origin). */
export function placeGuest({ x, y, w, h }, { paneW, paneH }, over = null) {
  const o = over && over.w > 0 && over.h > 0 ? over : { x: 0, y: 0, w: paneW, h: paneH };
  const placed = placeInside({ x: Math.floor(o.x + (o.w - w) / 2), y: Math.floor(o.y + (o.h - h) / 2), w, h }, { paneW, paneH });
  return { ...placed, moved: placed.x !== x || placed.y !== y };
}
/** The FRONT window: the topmost held window by `z` (a dialog counts — what a desktop's title and ✕ name), or null. */
export function frontOf(windows) {
  let best = null;
  for (const win of windows || []) if (heldWindow(win) && (!best || win.z > best.z)) best = win;
  return best;
}

// ── A WINDOW PER TOP-LEVEL (design 016 S2, lane app-satellite-windows, 2026-10-03 — the owner's YES to 「应用再打开的顶层窗口
// （比如微信的朋友圈）要不要变成 VibeSpace 里一个独立的窗口」): ONE xpra connection still holds every X window of the session;
// the X ROOT grows to hold each top-level side by side — the main at 0,0 (the main pane's display), every secondary NORMAL
// window in its own SLOT to the right — so windows never overlap in root space and a satellite pane is a viewport onto
// its slot. Bounded: the root never passes SLOT_ROOT_MAX (xpra's max screen size); a window that would is a guest (S1).
export const SLOT_GAP = 32;          // device px between two slots (and after the main's display)
export const SLOT_ROOT_MAX = 8192;   // the root's widest (device px)
/** The ROOT SLOTS: `main` = the main pane's display {w, h} at 0,0; `secondaries` = [{wid, w, h}] in the order they
 *  mapped, each placed to the right (x = the main's width + Σ the earlier slots' widths + gaps, y 0). A slot whose right
 *  edge would pass `max` is not given (that window stays a guest of the main pane). → { slots: Map wid→{x,y,w,h}, root }. */
export function slotFor(main, secondaries, { gap = SLOT_GAP, max = SLOT_ROOT_MAX } = {}) {
  const mw = Math.max(1, Math.floor(Number(main && main.w) || 1)), mh = Math.max(1, Math.floor(Number(main && main.h) || 1));
  const slots = new Map();
  let x = mw + gap, width = mw, height = mh;
  for (const s of secondaries || []) {
    const w = Math.max(1, Math.ceil(Number(s && s.w) || 1)), h = Math.max(1, Math.ceil(Number(s && s.h) || 1));
    if (x + w > max) continue;
    slots.set(s.wid, { x, y: 0, w, h });
    width = x + w; height = Math.max(height, h);
    x += w + gap;
  }
  return { slots, root: { width, height } };
}
/** The belt's rule for a slotted window: its origin IS the slot's origin (its size is the fit's). */
export function inSlot({ x, y, w, h }, slot) {
  return { x: slot.x, y: slot.y, w, h, moved: x !== slot.x || y !== slot.y };
}
/** `placeInside` within a rectangle of the root (a slot): {x,y,w,h,moved} in root coordinates. */
export function placeInRect(g, rect) {
  const p = placeInside({ x: g.x - rect.x, y: g.y - rect.y, w: g.w, h: g.h }, { paneW: rect.w, paneH: rect.h });
  return { x: p.x + rect.x, y: p.y + rect.y, w: g.w, h: g.h, moved: p.moved };
}
/** WHICH PANE DRAWS A WINDOW: the wid of the slot it belongs to (a satellite's), or 0 (the main pane). A slotted window
 *  is its own; a dialog belongs to the pane of the window it is transient for (followed up its chain); a popup to the
 *  slot that contains its origin (a menu opened from a satellite's window); everything else to the main pane. */
export function paneOf(win, slots, windows) {
  if (!win || !slots || !slots.size) return 0;
  if (slots.has(win.wid)) return win.wid;
  if (win.kind === 'popup') { for (const [wid, s] of slots) if (win.x >= s.x && win.y >= s.y && win.x < s.x + s.w && win.y < s.y + s.h) return wid; return 0; }
  let cur = win;
  for (let i = 0; i < 8 && cur && cur.meta; i++) {
    const tf = Number(cur.meta['transient-for']) || 0;
    if (!tf) return 0;
    if (slots.has(tf)) return tf;
    cur = windows && typeof windows.get === 'function' ? windows.get(tf) : null;
  }
  return 0;
}

// ── bytes ↔ strings (rencodeplus hands text as strings, bytes as Uint8Array) ──
export function bytesToString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array || ArrayBuffer.isView(v)) { try { return new TextDecoder().decode(v); } catch { return ''; } }
  return String(v);
}
export function stringToBytes(s) { return new TextEncoder().encode(String(s ?? '')); }

// ── the hello ──────────────────────────────────────────────────────────────
/**
 * The capabilities this client announces (the html5 v21 hello trimmed to
 * what this window does: windows + keyboard + pointer + clipboard + cursors;
 * no audio, file transfer, printing, notifications, tray, xdg menu).
 */
export function helloCaps({ width, height, dpi = 96, uuid = 'vibespace', layout = 'us', share = true } = {}) {
  const w = Math.max(1, Math.floor(width || 1)), h = Math.max(1, Math.floor(height || 1));
  return {
    version: '21', client_type: 'HTML5', 'session-type': 'VibeSpace', 'session-type.full': 'VibeSpace desktop-app window', username: '', uuid, argv: [],
    share, steal: true, 'mouse.show': true, 'setting-change': true, 'xdg-menu': false, 'xdg-menu-update': false, 'file-chunks': 0,
    display: { desktop_size: [w, h], desktop_mode_size: [w, h], screen_sizes: screenSizes(w, h, dpi) },
    rencodeplus: true, lz4: true, brotli: true, compression_level: 1, network: { pings: 5 }, 'connection-data': {},
    'metadata.supported': [...METADATA_SUPPORTED],
    encodings: { '': [...ENCODINGS], core: [...ENCODINGS], rgb_formats: ['RGBX', 'RGBA', 'RGB'], 'window-icon': ['png'], cursor: ['png'], packet: true },
    encoding: { icons: { max_size: [32, 32] } },
    clipboard: { enabled: true, want_targets: true, greedy: true, selections: ['CLIPBOARD'], 'preferred-targets': ['UTF8_STRING', 'text/plain', 'TEXT', 'STRING'] },
    pointer: { double_click: {} }, keyboard: true, windows: true, 'window.pre-map': false,
    screen_sizes: screenSizes(w, h, dpi), dpi: { x: dpi, y: dpi },
    notifications: { enabled: false }, cursors: true, bell: false, system_tray: false, named_cursors: false,
    audio: { receive: false, send: false }, file: { enabled: false, printing: false, 'open-url': false }, wants: ['packet-types'],
    keymap: keymapCaps({ layout }),
  };
}
/** The NATIVE keymap capabilities (hello's `keymap`, keyboard-config's top level): the gtk-style rows the
 *  server derives modifiers from, the x11 map it PROGRAMS the X keymap from (a Map: integer keycodes), and
 *  the query struct that names the base layout. `extra` = ImeKeymap rows [[keysym, keycode], …]. */
export function keymapCaps({ layout = 'us', extra = null } = {}) {
  return { layout, keycodes: keycodeRows(extra), x11_keycodes: x11Keycodes(extra), query_struct: { ...QUERY_STRUCT, layout }, variant: '', options: '' };
}
/** keycode → [keysyms] as a Map (rencode_map keeps the keys integers — a plain object would stringify them). */
export function x11Keycodes(extra = null) {
  const m = new Map();
  for (const [kc, levels] of Object.entries(X11_KEYMAP)) m.set(Number(kc), [...levels]);
  if (extra) for (const [name, kc] of extra) m.set(Number(kc), [name]);
  return m;
}
/** The keycode table rows `[keycode, keysym, keycode, group, level]` — the
 *  static JS table plus whatever ImeKeymap has published. */
export function keycodeRows(extra = null) {
  const rows = Object.entries(KEYCODE_TABLE).map(([kc, name]) => [Number(kc), name, Number(kc), 0, 0]);
  if (extra) for (const [name, kc] of extra) rows.push([kc, name, kc, 0, 0]);
  return rows;
}
/** `keyboard-config` (6.5.3) or the legacy `keymap-changed` — whichever the server's packet-types name. */
export function keyboardConfigPacket(serverPacketTypes, { layout = 'us', extra = null } = {}) {
  const caps = { ...keymapCaps({ layout, extra }), force: true };
  if (Array.isArray(serverPacketTypes) && serverPacketTypes.includes('keyboard-config')) return ['keyboard-config', caps];
  return ['keymap-changed', caps, true];
}
/** The screen as xpra's `screen_sizes` rows: ONE monitor filling the w×h desktop, its WORK AREA (the last four) that
 *  whole desktop. The hello and every pane change (`displayPacket`) carry the same rows. */
export function screenSizes(w, h, dpi = 96) {
  const wmm = Math.round(25.4 * w / dpi), hmm = Math.round(25.4 * h / dpi);
  return [['VibeSpace', w, h, wmm, hmm, [['Canvas', 0, 0, w, h, wmm, hmm]], 0, 0, w, h]];
}
/** The pane became w×h. THE WORK AREA (lane desktop-workarea, 2.369.205): xpra 6.5.4 sets the root's `_NET_WORKAREA`
 *  from the client's `screen_sizes` rows ALONE (server/subsystem/display.py `calculate_workarea`: the new size ∩ every
 *  row's work area), and `display-configure` takes desktop-size / monitors / dpi but never new rows — so a pane that
 *  grew after the hello got a bigger root under the HELLO's work area (measured on the owner's WeChat, which caps
 *  itself at the work area: root 1660×1296, `_NET_WORKAREA` 0,0,1573,973 ⇒ a blank strip under it). New rows ride only
 *  in the legacy `desktop_size` (registered under 6.5.4's default BACKWARDS_COMPATIBLE), whose FULL form re-dispatches
 *  the same desktop size and dpi as a display-configure: that ONE packet (the keeper holds one display packet per
 *  viewer) whenever the server names it, or names neither modern spelling; `display-configure` (or its alias) only
 *  when it is all the server takes — the root follows, the work area cannot. */
export function displayPacket(serverPacketTypes, { width, height, dpi = 96 }) {
  const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height));
  const types = Array.isArray(serverPacketTypes) ? serverPacketTypes : [];
  const name = types.includes('display-configure') ? 'display-configure' : types.includes('configure-display') ? 'configure-display' : null;
  const rowsTaken = types.includes('desktop_size') || !name;
  if (!rowsTaken) return [name, { 'desktop-size': [w, h], dpi: { x: dpi, y: dpi } }];
  const d = Math.round(dpi); // u16 on the server; the worker's rencode writes every number as an int
  // w, h, screen_sizes, desktops (0 = keep), desktop names, unscaled w, h, dpi x, y, refresh rate (0 = keep), monitors ({} = keep)
  return ['desktop_size', w, h, screenSizes(w, h, d), 0, [], w, h, d, d, 0, {}];
}

// ── packets the client sends ───────────────────────────────────────────────
export const mapWindow = (wid, { x, y, w, h }) => ['map-window', wid, x, y, w, h, {}];
export const unmapWindow = (wid) => ['unmap-window', wid, true];
export const configureWindow = (wid, { x, y, w, h }, state = {}, skipGeometry = false) => ['configure-window', wid, x, y, w, h, {}, 0, state, skipGeometry];
/** Ask the server to repaint a whole window — xpra-html5's own `request_refresh` (it asks at +200 / +500 ms after a resize
 *  stops). MEASURED on xpra 6.5.4 (the .197 integration): a window configured to a new size while iconified and then
 *  un-iconified keeps its new region UNPAINTED until asked (the Calculator: 0 % of its bottom edge drawn, for good); one
 *  of these repaints it at once. */
export const bufferRefresh = (wid) => ['buffer-refresh', wid, 0, 100, { 'refresh-now': true, batch: { reset: true } }, {}];
export const closeWindow = (wid) => ['close-window', wid];
export const focusPacket = (wid) => ['focus', wid, []];
export const keyAction = (wid, k, pressed) => ['key-action', wid, k.keyname, !!pressed, k.modifiers, k.keyval, k.string, k.keycode, 0];
export const buttonAction = (wid, button, pressed, coords, modifiers) => ['button-action', wid, button, !!pressed, coords, modifiers, []];
export const pointerPosition = (wid, coords, modifiers) => ['pointer-position', wid, coords, modifiers, []];
export const damageAck = (seq, wid, w, h, decodeMs, message = '') => ['damage-sequence', seq, wid, w, h, decodeMs, message];
export const pingPacket = (now) => ['ping', Math.ceil(now)];
export const pingEcho = (echotime, sid = '') => ['ping_echo', echotime, 0, 0, 0, 0, sid];
export const clipboardToken = (text) => ['clipboard-token', 'CLIPBOARD', ['UTF8_STRING', 'text/plain'], 'UTF8_STRING', 'UTF8_STRING', 8, 'bytes', stringToBytes(text), true, true, true];
export const clipboardContents = (requestId, selection, text) => ['clipboard-contents', requestId, selection, 'UTF8_STRING', 8, 'bytes', stringToBytes(text)];
export const clipboardNone = (requestId, selection) => ['clipboard-contents-none', requestId, selection];

/** Pointer coordinates for a packet: [rootX, rootY, winX, winY] — the pane
 *  IS the X root (its size is the virtual screen), a window's own origin is
 *  what the SERVER believes it to be. */
export function pointerCoords(x, y, win = null) {
  const rx = Math.round(x), ry = Math.round(y);
  return win ? [rx, ry, rx - Math.round(win.x), ry - Math.round(win.y)] : [rx, ry];
}
/**
 * The wheel: X has no wheel axis — buttons 4/5 (vertical) and 6/7
 * (horizontal) click once per notch, and xpra's default xtest pointer device
 * has NO precise wheel (`has_precise_wheel()` is False on 6.5.3, so a
 * `wheel-motion` packet trips its assert) — so like xpra-html5 this client
 * accumulates the deltas and emits `button-action` press+release pairs, one
 * per 120 units (a trackpad's small deltas add up instead of vanishing).
 * `feed(deltaX, deltaY, deltaMode)` → [[button, clicks], …].
 */
export class WheelAccumulator {
  constructor() { this.x = 0; this.y = 0; }
  feed(deltaX, deltaY, deltaMode = 0) {
    const scale = deltaMode === 1 ? 40 : deltaMode === 2 ? 400 : 1;
    this.x += (Number(deltaX) || 0) * scale;
    this.y += (Number(deltaY) || 0) * scale;
    const out = [];
    const drain = (axis, up, down) => {
      let n = 0;
      const sign = this[axis] > 0 ? 1 : -1;
      while (Math.abs(this[axis]) >= 120) { this[axis] -= 120 * sign; n++; }
      if (n) out.push([sign > 0 ? down : up, n]);
    };
    drain('y', 4, 5);
    drain('x', 6, 7);
    return out;
  }
}
/** DOM button (0/1/2) → X button (1/2/3). */
export const xButton = (b) => (b === 1 ? 2 : b === 2 ? 3 : b === 3 ? 8 : b === 4 ? 9 : 1);

// ── packets the client receives ────────────────────────────────────────────
export function parseDraw(p) {
  return { wid: p[1], x: p[2], y: p[3], w: p[4], h: p[5], coding: bytesToString(p[6]), data: p[7], seq: p[8], rowstride: p[9], options: p[10] || {} };
}
export function mimeFor(coding) {
  if (coding === 'png' || coding === 'png/P' || coding === 'png/L') return 'image/png';
  if (coding === 'jpeg') return 'image/jpeg';
  if (coding === 'webp') return 'image/webp';
  return null;
}
/** A server `clipboard-token`: the text it carries for CLIPBOARD, or null
 *  (another selection, a non-text target, no data). */
export function parseClipboardToken(p) {
  const selection = bytesToString(p[1]);
  if (selection !== 'CLIPBOARD' || p.length < 8) return { selection, text: null };
  const dtype = bytesToString(p[4]).toLowerCase();
  if (!(dtype.includes('text') || dtype.includes('string'))) return { selection, text: null };
  return { selection, text: bytesToString(p[7]) };
}
/** The server asks the CLIENT to move / resize a window (round 3 lane B, docs/design-desktop-apps-seamless §3.3): a
 *  client-side-decorated app (GTK's header bar) sent _NET_WM_MOVERESIZE and xpra — the window manager of its display —
 *  hands the gesture to the client (xpra x11/server/seamless.py `_initiate_moveresize` → server/source/window.py:
 *  `[type, wid, x_root, y_root, direction, button, source_indication]`; the type is `initiate-moveresize` under
 *  BACKWARDS_COMPATIBLE — what 6.5.3 sends, MEASURED §2.3 M3b — else `window-initiate-moveresize`). `direction` is
 *  X's MoveResize: 0–7 the eight edges (SIZE_TOPLEFT … SIZE_LEFT), 8 MOVE, 9 SIZE_KEYBOARD, 10 MOVE_KEYBOARD,
 *  11 CANCEL. Returns null for a packet that is not one. */
export const MOVERESIZE_PACKETS = Object.freeze(['initiate-moveresize', 'window-initiate-moveresize']);
export function parseMoveResize(p) {
  if (!Array.isArray(p) || p.length < 5 || !MOVERESIZE_PACKETS.includes(bytesToString(p[0]))) return null;
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const direction = Number(p[4]);
  if (!Number.isInteger(direction)) return null;
  return { wid: p[1], xRoot: num(p[2]), yRoot: num(p[3]), direction, button: num(p[5]), source: num(p[6]) };
}
/** A `cursor` packet → { url data, w, h, xhot, yhot } or null (reset). */
export function parseCursor(p) {
  if (!p || p.length < 10 || bytesToString(p[1]) !== 'png') return null;
  return { w: p[4], h: p[5], xhot: p[6], yhot: p[7], data: p[9] };
}

/**
 * The IME keymap: composed characters get a published keycode row before
 * their press, rolling over IME_KEYCODES; `plan(text)` answers ONE batch —
 * the rows to (re)publish, whether the table changed (the caller sends
 * `keyboard-config` when it did, then the keys) and the `rest` a later batch
 * carries.
 * A BATCH NEVER REUSES A SLOT IT PRESSES, and reuses (evicts) one at all only
 * with `mayEvict` (lane xpra-ime-mac, MEASURED with a real Chrome: two tables
 * back to back that move a slot to another character make Chrome read the
 * EARLIER batch's press with the later table — 一丁 typed as 一万; 50 ms apart
 * every character lands). The caller says when the last table is old enough.
 */
export class ImeKeymap {
  constructor(pool = IME_KEYCODES) { this.pool = [...pool]; this.slots = new Map(); this.next = 0; }
  /** The presses for the longest head of `text` that fits: a character on the published keymap is its keycode
   *  (+ shift for an upper-case letter or a shifted symbol); every other character gets a slot — a free one, else (with
   *  `mayEvict`) the next one this batch does not press. `rows` = [[keysym, keycode], …] to publish, `changed` = a
   *  keyboard-config is due before the presses, `rest` = the text left for a later batch ('' when all fit). */
  plan(text, { mayEvict = true } = {}) {
    let changed = false;
    const keys = [], used = new Set();
    const chars = [...String(text || '')];
    let i = 0;
    for (; i < chars.length; i++) {
      const ch = chars[i];
      const k = charKeysym(ch);
      if (!k) continue;
      const own = NAME_TO_KEYCODE[k.keyname];
      if (own != null) {
        const shifted = SHIFTED_TABLE[own] === k.keyname || (/^[A-Z]$/.test(ch) && k.keyname === ch.toLowerCase());
        keys.push({ ...k, string: ch, keycode: own, modifiers: shifted ? ['shift'] : [] });
        continue;
      }
      let kc = this.slots.get(k.keyname);
      if (kc == null) {
        const taken = new Set(this.slots.values());
        kc = this.pool.find((c) => !taken.has(c));
        if (kc == null && mayEvict) {
          for (let n = 0; n < this.pool.length && kc == null; n++) { const c = this.pool[(this.next + n) % this.pool.length]; if (!used.has(c)) { kc = c; this.next = (this.next + n + 1) % this.pool.length; } }
          if (kc != null) for (const [n, c] of this.slots) if (c === kc) this.slots.delete(n); // the slot rolls over: its old name leaves the table
        }
        if (kc == null) break; // no slot this batch may take: the rest rides a later batch
        this.slots.set(k.keyname, kc);
        changed = true;
      }
      used.add(kc);
      keys.push({ ...k, string: ch, keycode: kc, modifiers: [] });
    }
    return { keys, changed, rows: [...this.slots.entries()], rest: chars.slice(i).join('') };
  }
}
