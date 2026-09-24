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
 *  decode natively (createImageBitmap), `scroll` is a list of copy moves,
 *  `void` is an ack with nothing to paint. */
export const ENCODINGS = Object.freeze(['png', 'png/P', 'png/L', 'jpeg', 'webp', 'scroll', 'void']);

/** The X keysym names for JS keyCodes (xpra-html5's CHARCODE_TO_NAME, the
 *  rows this client can produce). Published to the server as its keycode
 *  table so a `key-action` resolves by (keycode, keyname) first. */
export const KEYCODE_TABLE = Object.freeze({
  8: 'BackSpace', 9: 'Tab', 13: 'Return', 16: 'Shift_L', 17: 'Control_L', 18: 'Alt_L', 19: 'Pause', 20: 'Caps_Lock', 27: 'Escape', 32: 'space',
  33: 'Prior', 34: 'Next', 35: 'End', 36: 'Home', 37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down', 42: 'Print', 45: 'Insert', 46: 'Delete',
  48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9',
  65: 'a', 66: 'b', 67: 'c', 68: 'd', 69: 'e', 70: 'f', 71: 'g', 72: 'h', 73: 'i', 74: 'j', 75: 'k', 76: 'l', 77: 'm', 78: 'n', 79: 'o', 80: 'p', 81: 'q', 82: 'r', 83: 's', 84: 't', 85: 'u', 86: 'v', 87: 'w', 88: 'x', 89: 'y', 90: 'z',
  91: 'Super_L', 92: 'Super_R', 93: 'Menu',
  96: 'KP_0', 97: 'KP_1', 98: 'KP_2', 99: 'KP_3', 100: 'KP_4', 101: 'KP_5', 102: 'KP_6', 103: 'KP_7', 104: 'KP_8', 105: 'KP_9', 106: 'KP_Multiply', 107: 'KP_Add', 108: 'KP_Enter', 109: 'KP_Subtract', 110: 'KP_Decimal', 111: 'KP_Divide',
  112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4', 116: 'F5', 117: 'F6', 118: 'F7', 119: 'F8', 120: 'F9', 121: 'F10', 122: 'F11', 123: 'F12',
  144: 'Num_Lock', 145: 'Scroll_Lock', 186: 'semicolon', 187: 'equal', 188: 'comma', 189: 'minus', 190: 'period', 191: 'slash', 192: 'grave', 219: 'bracketleft', 220: 'backslash', 221: 'bracketright', 222: 'apostrophe', 225: 'ISO_Level3_Shift',
});
/** The SHIFTED level of the US layout for the keycodes that have one (a
 *  letter's upper case is derived by X itself). */
export const SHIFTED_TABLE = Object.freeze({ 48: 'parenright', 49: 'exclam', 50: 'at', 51: 'numbersign', 52: 'dollar', 53: 'percent', 54: 'asciicircum', 55: 'ampersand', 56: 'asterisk', 57: 'parenleft', 186: 'colon', 187: 'plus', 188: 'less', 189: 'underscore', 190: 'greater', 191: 'question', 192: 'asciitilde', 219: 'braceleft', 220: 'bar', 221: 'braceright', 222: 'quotedbl' });
/** The NATIVE keymap this client publishes (`x11_keycodes`: keycode → [level0, level1]) — the X keymap is
 *  programmed from it, so every keysym this client can press is on it. Integer keys: sent as a Map (rencode_map). */
export const X11_KEYMAP = Object.freeze(Object.fromEntries(Object.entries(KEYCODE_TABLE).map(([kc, name]) => [Number(kc), SHIFTED_TABLE[kc] ? [name, SHIFTED_TABLE[kc]] : /^[a-z]$/.test(name) ? [name, name.toUpperCase()] : [name]])));
/** keysym name → the client keycode carrying it (level 0 first, then the shifted level). */
export const NAME_TO_KEYCODE = Object.freeze((() => { const m = {}; for (const [kc, name] of Object.entries(KEYCODE_TABLE)) if (!(name in m)) m[name] = Number(kc); for (const [kc, name] of Object.entries(SHIFTED_TABLE)) if (!(name in m)) m[name] = Number(kc); return m; })());
/** What `setxkbmap -query` would say for the base layout the keymap is built on. */
export const QUERY_STRUCT = Object.freeze({ rules: 'evdev', model: 'pc105', layout: 'us', variant: '', options: '' });
/** Client keycodes above every JS keyCode: the rolling slots ImeKeymap hands
 *  to composed characters (X keycodes end at 255). */
export const IME_KEYCODE_FIRST = 226;
export const IME_KEYCODE_LAST = 255;

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
  // the keycode is the one carrying this keysym on OUR keymap (KP_Enter shares
  // the browser's 13 with Return; a shifted name sits on its base key), else the browser's
  const own = NAME_TO_KEYCODE[keyname];
  const keycode = own != null ? own : (Number(ev.keyCode) || 0);
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
 */
export function fitGeometry({ paneW, paneH }, constraints = null) {
  const c = constraints || {};
  const min = sizePair(c['minimum-size']), max = sizePair(c['maximum-size']), inc = sizePair(c['increment']), base = sizePair(c['base-size']) || min;
  let w = Math.max(1, Math.floor(paneW || 1)), h = Math.max(1, Math.floor(paneH || 1));
  if (max) { w = Math.min(w, max[0]); h = Math.min(h, max[1]); }
  if (inc) {
    const bw = base ? base[0] : 0, bh = base ? base[1] : 0;
    if (inc[0] > 1 && w > bw) w = bw + Math.floor((w - bw) / inc[0]) * inc[0];
    if (inc[1] > 1 && h > bh) h = bh + Math.floor((h - bh) / inc[1]) * inc[1];
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
export function devicePane({ width, height }, ratio = 1) {
  const r = pixelRatioOf(ratio);
  return { width: Math.max(1, Math.floor((Number(width) || 1) * r + 1e-6)), height: Math.max(1, Math.floor((Number(height) || 1) * r + 1e-6)) };
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

/** The kind of a window from its metadata: 'popup' (override-redirect —
 *  menus, tooltips, combos), 'dialog' (transient for another window, or a
 *  DIALOG/UTILITY type), else 'main'. */
export function windowKind(meta = {}, overrideRedirect = false) {
  if (overrideRedirect || meta['override-redirect']) return 'popup';
  const t = Array.isArray(meta['window-type']) ? meta['window-type'].map((x) => String(x).toUpperCase()) : [];
  if (meta['transient-for'] || t.includes('DIALOG') || t.includes('UTILITY') || t.includes('TOOLBAR') || t.includes('SPLASH')) return 'dialog';
  return 'main';
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
  const wmm = Math.round(25.4 * w / dpi), hmm = Math.round(25.4 * h / dpi);
  const screen = ['VibeSpace', w, h, wmm, hmm, [['Canvas', 0, 0, w, h, wmm, hmm]], 0, 0, w, h];
  return {
    version: '21', client_type: 'HTML5', 'session-type': 'VibeSpace', 'session-type.full': 'VibeSpace desktop-app window', username: '', uuid, argv: [],
    share, steal: true, 'mouse.show': true, 'setting-change': true, 'xdg-menu': false, 'xdg-menu-update': false, 'file-chunks': 0,
    display: { desktop_size: [w, h], desktop_mode_size: [w, h], screen_sizes: [screen] },
    rencodeplus: true, lz4: true, brotli: true, compression_level: 1, network: { pings: 5 }, 'connection-data': {},
    'metadata.supported': [...METADATA_SUPPORTED],
    encodings: { '': [...ENCODINGS], core: [...ENCODINGS], rgb_formats: ['RGBX', 'RGBA', 'RGB'], 'window-icon': ['png'], cursor: ['png'], packet: true },
    encoding: { icons: { max_size: [32, 32] } },
    clipboard: { enabled: true, want_targets: true, greedy: true, selections: ['CLIPBOARD'], 'preferred-targets': ['UTF8_STRING', 'text/plain', 'TEXT', 'STRING'] },
    pointer: { double_click: {} }, keyboard: true, windows: true, 'window.pre-map': false,
    screen_sizes: [screen], dpi: { x: dpi, y: dpi },
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
/** The pane became w×h: 6.5.3's `display-configure` (or its alias) when the
 *  server names it, else the legacy `desktop_size`. */
export function displayPacket(serverPacketTypes, { width, height, dpi = 96 }) {
  const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height));
  const types = Array.isArray(serverPacketTypes) ? serverPacketTypes : [];
  const name = types.includes('display-configure') ? 'display-configure' : types.includes('configure-display') ? 'configure-display' : null;
  if (name) return [name, { 'desktop-size': [w, h], dpi: { x: dpi, y: dpi } }];
  const wmm = Math.round(25.4 * w / dpi), hmm = Math.round(25.4 * h / dpi);
  return ['desktop_size', w, h, [['VibeSpace', w, h, wmm, hmm, [['Canvas', 0, 0, w, h, wmm, hmm]], 0, 0, w, h]]];
}

// ── packets the client sends ───────────────────────────────────────────────
export const mapWindow = (wid, { x, y, w, h }) => ['map-window', wid, x, y, w, h, {}];
export const unmapWindow = (wid) => ['unmap-window', wid, true];
export const configureWindow = (wid, { x, y, w, h }, state = {}, skipGeometry = false) => ['configure-window', wid, x, y, w, h, {}, 0, state, skipGeometry];
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
/** A `cursor` packet → { url data, w, h, xhot, yhot } or null (reset). */
export function parseCursor(p) {
  if (!p || p.length < 10 || bytesToString(p[1]) !== 'png') return null;
  return { w: p[4], h: p[5], xhot: p[6], yhot: p[7], data: p[9] };
}

/**
 * The IME keymap: composed characters get a published keycode row before
 * their press. Rolling over IME_KEYCODE_FIRST..IME_KEYCODE_LAST (32 slots);
 * `rowsFor(text)` answers the rows to (re)publish and whether the table
 * changed — the caller sends `keyboard-config` when it did, then the keys.
 */
export class ImeKeymap {
  constructor() { this.slots = new Map(); this.next = IME_KEYCODE_FIRST; }
  /** The presses for `text`: a character on the published keymap is its
   *  keycode (+ shift for an upper-case letter or a shifted symbol); every
   *  other character gets a rolling slot. `rows` = [[keysym, keycode], …]
   *  to publish, `changed` = a keyboard-config is due before the presses. */
  plan(text) {
    let changed = false;
    const keys = [];
    for (const ch of [...String(text || '')]) {
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
        kc = this.next;
        this.next = this.next >= IME_KEYCODE_LAST ? IME_KEYCODE_FIRST : this.next + 1;
        for (const [n, c] of this.slots) if (c === kc) this.slots.delete(n); // the slot rolls over: its old name leaves the table
        this.slots.set(k.keyname, kc);
        changed = true;
      }
      keys.push({ ...k, string: ch, keycode: kc, modifiers: [] });
    }
    return { keys, changed, rows: [...this.slots.entries()] };
  }
}
