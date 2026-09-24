#!/usr/bin/env node
// THE XPRA CLIENT HALF (docs/design-desktop-apps.zh.md §7 P8-2 chunk x2,
// 2026-09-22; D21 (c) (b) — the window is OURS): src/lib/xpra-proto.js (PURE:
// the hello, every packet form xpra-html5 v21 sends to xpra 6.5.3, the
// browser-key → X-keysym rule incl. the `U<hex>` IME path, the pane FIT under
// size hints, the wheel-as-button-clicks accumulator, the clipboard delivery
// rule), src/lib/xpra-client.js (the DOM-free session over the upstream
// Protocol.js worker — driven here by a FAKE worker), src/lib/xpra-view.js
// (the DOM half — driven here under the fake DOM test-vnc-view uses, with a
// fake clipboard and a fake execCommand) and the grep census that keeps the
// transport in ONE place, the bar in ONE file (picture-shell.js) and the
// pane a theme colour. No chrome, no network, no xpra: the REAL rung is
// scripts/test-desktop-xpra-window.mjs (heavy). Prerequisite: `npm run build`.
// Run: node scripts/test-xpra-client.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The negative controls' patched copies of src/lib/xpra-*.js are written
// OUTSIDE the tree (scripts/mutant-copy.mjs: `.mjs`, every relative import
// rewritten to the real file's URL; a trio's copies import each OTHER by URL).
// They used to be un-ignored siblings in src/lib/ (vs-xc-*, vs-xv-*, vs-xp-*) —
// a dirty tree while the suite ran, read as source by every src/ scanner.
const MUTXC = mutantCopies('xpra-client', repo);
const fileUrl = (p) => pathToFileURL(p).href;

const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000, step = 10) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }

// ── a fake DOM wide enough for the view (test-vnc-view's, plus rects, canvases and pointer capture) ──
class El {
  constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.className = ''; this.textContent = ''; this.title = ''; this.value = ''; this.disabled = false; this._listeners = {}; this.classes = new Set(); this.classList = { add: (c) => this.classes.add(c), remove: (c) => this.classes.delete(c), toggle: (c, v) => { if (v === undefined) v = !this.classes.has(c); if (v) this.classes.add(c); else this.classes.delete(c); }, contains: (c) => this.classes.has(c) }; this.dataset = {}; this.attrs = {}; this.focused = 0; this.rect = { left: 0, top: 0 }; this.clientWidth = 0; this.clientHeight = 0; this.parent = null; this.width = 0; this.height = 0; }
  append(...els) { for (const e of els) this.appendChild(e); }
  appendChild(e) { this.children.push(e); e.parent = this; return e; }
  replaceChildren(...els) { this.children = []; this.append(...els); }
  insertBefore(e, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(e); else this.children.splice(i, 0, e); e.parent = this; return e; }
  addEventListener(k, fn) { (this._listeners[k] ||= []).push(fn); }
  removeEventListener() {}
  fire(k, ev = {}) { for (const fn of this._listeners[k] || []) fn({ preventDefault() { ev.prevented = true; }, ...ev }); return ev; }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getBoundingClientRect() { return { left: this.rect.left, top: this.rect.top, width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture() { this.captured = true; }
  releasePointerCapture() { this.captured = false; }
  select() {} setSelectionRange() {}
  getContext() { return this._ctx ||= { drawn: [], drawImage: (...a) => this._ctx.drawn.push(a) }; }
  get isConnected() { return true; }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
  focus() { this.focused++; }
}
const execCalls = [];
const doc = { createElement: (t) => new El(t), body: new El('body'), documentElement: new El('html'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, hidden: false, execCommand: (c) => { execCalls.push([c, doc.body.children.map((e) => e.value)]); return execOk; } };
let execOk = true;
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { protocol: 'http:', host: 'box.example:3456', origin: 'http://box.example:3456', href: 'http://box.example:3456/' };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const observers = [];
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe(el) { this.el = el; } disconnect() { this.off = true; } };
globalThis.isSecureContext = false;

// ── a fake Protocol.js worker: the host's message shape ({c:'r'} ready, {c:'o',u} open, {c:'s',p} send, {c:'p',p} packet) ──
class FakeWorker {
  constructor(url) { this.url = url; this.posted = []; this.terminated = false; FakeWorker.instances.push(this); setTimeout(() => this.onmessage?.({ data: { c: 'r' } }), 0); }
  postMessage(m) { this.posted.push(m); if (m.c === 'o') { this.opened = m.u; setTimeout(() => this.onmessage?.({ data: { c: 'p', p: ['open'] } }), 0); } }
  terminate() { this.terminated = true; }   // a real Worker may still deliver a message queued before terminate() — the fake keeps delivering on purpose, the client must ignore it (§late)
  feed(p) { this.onmessage?.({ data: { c: 'p', p } }); }
  sent(type) { return this.posted.filter((m) => m.c === 's' && m.p[0] === type).map((m) => m.p); }
  get all() { return this.posted.filter((m) => m.c === 's').map((m) => m.p); }
}
FakeWorker.instances = [];
const bytes = (s) => new TextEncoder().encode(s);
const str = (b) => new TextDecoder().decode(b);

const P = await import('../src/lib/xpra-proto.js');
const C = await import('../src/lib/xpra-client.js');
const V = await import('../src/lib/xpra-view.js');
const S = await import('../src/lib/picture-shell.js');
const utils = await import('../src/lib/utils.js');
const toasts = [];
const toastStack = new El('div'); toastStack.appendChild = (el) => { toasts.push(el); return el; };
doc.getElementById = (id) => (id === 'global-toasts' ? toastStack : null);
void utils;
const toastTexts = () => toasts.map((x) => (x.children || []).map((c) => String(c.textContent || '')).join(' ') + String(x.textContent || ''));

console.log('§1 the PURE words (xpra-proto.js)');
{
  const caps = P.helloCaps({ width: 900, height: 600 });
  ok(caps.rencodeplus === true && caps.lz4 === true && caps.brotli === true && caps.version === '21' && caps.client_type === 'HTML5', 'hello: rencodeplus + lz4 + brotli (the worker inflates both), version 21, client_type HTML5');
  ok(same(caps.display.desktop_size, [900, 600]) && caps.screen_sizes[0][1] === 900 && caps.dpi.x === 96, 'hello: the desktop size IS the pane (the pane is the X root)');
  ok(caps.clipboard.enabled && caps.clipboard.greedy && caps.clipboard.want_targets && same(caps.clipboard.selections, ['CLIPBOARD']), 'hello: clipboard greedy on CLIPBOARD only (PRIMARY would copy on every selection)');
  ok(caps.audio.receive === false && caps.file.enabled === false && caps.notifications.enabled === false && caps.system_tray === false && caps['xdg-menu'] === false, 'hello: no audio, file transfer, printing, notifications, tray, xdg menu — what this window does not do is not announced');
  ok(same(caps.encodings[''], [...P.ENCODINGS]) && !P.ENCODINGS.includes('rgb32') && P.ENCODINGS.includes('scroll') && P.ENCODINGS.includes('void'), 'hello: png/jpeg/webp + scroll + void, NO rgb (its lz4 lives in the worker, not on the main thread)');
  ok(caps.share === true && caps.steal === true && caps.windows === true && caps.keyboard === true && caps.cursors === true, 'hello: share (N viewers on one app — the recipe runs --sharing=yes), windows, keyboard, cursors');
  ok(caps.keymap.keycodes.some((r) => same(r, [65, 'a', 65, 0, 0])) && caps.keymap.keycodes.some((r) => same(r, [13, 'Return', 13, 0, 0])), 'hello: the keycode table rows are [keycode, keysym, keycode, 0, 0] (a key-action resolves by (keycode, keyname) first)');
  const K = (key, code, keyCode, mods = {}, location = 0) => P.keyActionFor({ key, code, keyCode, location, mods });
  const table = [
    [K('a', 'KeyA', 65), { keyname: 'a', keyval: 97, string: 'a', keycode: 65, modifiers: [] }],
    [K('A', 'KeyA', 65, { shift: true }), { keyname: 'a', keyval: 97, string: 'A', keycode: 65, modifiers: ['shift'] }],
    [K('!', 'Digit1', 49, { shift: true }), { keyname: 'exclam', keyval: 33, string: '!', keycode: 49, modifiers: ['shift'] }],
    [K(' ', 'Space', 32), { keyname: 'space', keyval: 0, string: ' ', keycode: 32, modifiers: [] }],
    [K('Enter', 'Enter', 13), { keyname: 'Return', keyval: 0, string: '', keycode: 13, modifiers: [] }],
    [K('Backspace', 'Backspace', 8), { keyname: 'BackSpace', keyval: 0, string: '', keycode: 8, modifiers: [] }],
    [K('ArrowLeft', 'ArrowLeft', 37), { keyname: 'Left', keyval: 0, string: '', keycode: 37, modifiers: [] }],
    [K('PageUp', 'PageUp', 33), { keyname: 'Prior', keyval: 0, string: '', keycode: 33, modifiers: [] }],
    [K('F5', 'F5', 116), { keyname: 'F5', keyval: 0, string: '', keycode: 116, modifiers: [] }],
    [K('Enter', 'NumpadEnter', 13, {}, 3), { keyname: 'KP_Enter', keyval: 0, string: '', keycode: 108, modifiers: [] }],
    [K('Shift', 'ShiftRight', 16, { shift: true }, 2), { keyname: 'Shift_L', keyval: 0, string: '', keycode: 16, modifiers: ['shift'] }],
    [K('AltGraph', 'AltRight', 225, { altGraph: true }), { keyname: 'ISO_Level3_Shift', keyval: 0, string: '', keycode: 225, modifiers: ['mod5'] }],
    [K('Meta', 'MetaLeft', 91, { meta: true }), { keyname: 'Super_L', keyval: 0, string: '', keycode: 91, modifiers: ['mod4'] }],
    [K('Control', 'ControlLeft', 17, { control: true }), { keyname: 'Control_L', keyval: 0, string: '', keycode: 17, modifiers: ['control'] }],
    [K('é', 'KeyE', 69, { altGraph: true }), { keyname: 'eacute', keyval: 233, string: 'é', keycode: 69, modifiers: ['mod5'] }],
    [K('中', '', 0), { keyname: 'U4E2D', keyval: 0x1004E2D, string: '中', keycode: 0, modifiers: [] }],
    [K('c', 'KeyC', 67, { control: true, capsLock: true, numLock: true }), { keyname: 'c', keyval: 99, string: 'c', keycode: 67, modifiers: ['control', 'lock', 'mod2'] }],
  ];
  ok(table.every(([got, want]) => same(got, want)), 'the browser-key → keysym rule: letters lower-case with shift on the modifier list, punctuation by X name on its base keycode, code first (KP_Enter on its own keycode 108, right-hand modifiers on the left name — one JS keyCode), Meta = Super (mod4), AltGraph = ISO_Level3_Shift (mod5), Latin-1 by name, anything else U<HEX> with the Unicode keysym value', table.filter(([g, w]) => !same(g, w)).map(([g, w]) => ({ got: g, want: w })));
  ok(P.nativeKey(K('a', 'KeyA', 65)) && P.nativeKey(K('!', 'Digit1', 49, { shift: true })) && P.nativeKey(K('Enter', 'Enter', 13)) && !P.nativeKey(K('é', 'KeyE', 69, { altGraph: true })) && !P.nativeKey(K('中', '', 0)), 'nativeKey: a / ! / Return are on the published keymap; é (US layout) and 中 are not — they go publish-then-press');
  ok(caps.keymap.x11_keycodes instanceof Map && same(caps.keymap.x11_keycodes.get(49), ['1', 'exclam']) && same(caps.keymap.x11_keycodes.get(65), ['a', 'A']) && same(caps.keymap.x11_keycodes.get(16), ['Shift_L']) && caps.keymap.query_struct.rules === 'evdev' && caps.keymap.query_struct.layout === 'us', 'hello: the NATIVE keymap shape — x11_keycodes as a Map of integer keycodes with the shifted level, the modifiers on their own keycodes, a query_struct naming the base layout (the server PROGRAMS the X keymap from it; the keycodes-only shape is only translated onto `us`)');
  ok(K('Process', 'KeyA', 229) === null && K('Dead', 'Quote', 222) === null && K('Unidentified', '', 0) === null && P.keyActionFor({ key: 'a', code: 'KeyA', keyCode: 65, mods: {}, composing: true }) === null, 'an IME in flight (229 / composing), a dead key and an unidentified key send NOTHING — composition delivers the text');
  ok(P.clipboardShortcut({ key: 'v', control: true }) === 'paste' && P.clipboardShortcut({ key: 'V', meta: true }) === 'paste' && P.clipboardShortcut({ key: 'c', control: true }) === 'copy' && P.clipboardShortcut({ key: 'x', control: true }) === 'copy' && P.clipboardShortcut({ key: 'v' }) === null && P.clipboardShortcut({ key: 'a', control: true }) === null, 'Ctrl/⌘+V is the browser\'s (the paste event carries the text on plain http); Ctrl+C/X go to the app AND the browser; everything else is the app\'s');
  ok(S.clipboardDelivery({ secure: true, canWrite: true }) === 'api' && S.clipboardDelivery({ secure: false, canWrite: true }) === 'chip' && S.clipboardDelivery({ secure: true, canWrite: false }) === 'chip', 'a copy in the app goes to the Clipboard API only on a secure context that has it — else the click-to-copy chip, never a silent no-op (the rule is the SHARED shell\'s: every rung, RFB too)');
  // round 3, A1 (docs/design-desktop-apps-seamless §3.1): the GESTURE WINDOW — a token that follows the user's own copy chord by
  // less than Chrome's 5 s transient activation (MEASURED M1: 4800 ms ok, 5200 ms refused) is written with no click
  const G = (gestureAge, o = {}) => S.clipboardDelivery({ secure: false, canWrite: false, gestureAge, ...o });
  const gTable = [[0, 'gesture'], [23, 'gesture'], [300, 'gesture'], [4800, 'gesture'], [4999, 'gesture'], [5000, 'chip'], [5200, 'chip'], [7000, 'chip'], [null, 'chip'], [undefined, 'chip'], [-1, 'chip'], [NaN, 'chip'], [Infinity, 'chip'], ['100', 'chip']];
  ok(S.GESTURE_WINDOW_MS === 5000 && gTable.every(([a, want]) => G(a) === want), 'A1 DOM-FREE: the gesture stamp\'s AGE decides execCommand vs the chip — 0/23/300/4800/4999 ms ⇒ gesture, 5000/5200/7000 ms ⇒ chip, no stamp / a negative / NaN / ∞ / a string ⇒ chip', gTable.filter(([a, want]) => G(a) !== want).map(([a, want]) => ({ age: a, want, got: G(a) })));
  ok(S.clipboardDelivery({ secure: true, canWrite: true, gestureAge: 10 }) === 'api' && S.clipboardDelivery({ secure: true, canWrite: false, gestureAge: 10 }) === 'gesture' && S.clipboardDelivery({ secure: false, canWrite: true, gestureAge: 10 }) === 'gesture', 'A1: a secure page with the API keeps the API (the gesture is not needed); a page without it uses the gesture however it is served');
  ok(!('clipboardDelivery' in P), 'A1: the delivery rule lives ONLY in the shell — the dead xpra-proto.js twin is gone (one rule, every rung)');
  const store = (v) => ({ getItem: (k) => (k === S.COPY_HINT_KEY ? v : null), setItem() {} });
  ok(S.COPY_HINT_KEY === 'vibespace.desktopCopyHintShown' && S.copyHintDue({ secure: false, storage: store(null) }) === true && S.copyHintDue({ secure: false, storage: store('1') }) === false && S.copyHintDue({ secure: true, storage: store(null) }) === false && S.copyHintDue({ secure: false, storage: null }) === false && S.copyHintDue({ secure: false, storage: { getItem() { throw new Error('denied'); } } }) === false, 'A1: the HTTPS hint is due only on a NON-secure page of a device that never showed it (a secure page, a shown one, no / an unreadable storage ⇒ not due)');
  ok(/^https:\/\/github\.com\/ProblemFactory\/vibespace\/blob\/master\/docs\/getting-started\.md#https-for-seamless-copy$/.test(S.HTTPS_DOCS_URL) && /^## HTTPS for seamless copy$/m.test(read('docs/getting-started.md')), 'A1: the hint links the docs section that EXISTS (docs/getting-started.md "## HTTPS for seamless copy" — its GitHub anchor)');
  const fit = (pane, c) => P.fitGeometry(pane, c);
  ok(same(fit({ paneW: 900, paneH: 600 }, null), { x: 0, y: 0, w: 900, h: 600 }), 'fit: no hints ⇒ the whole pane at 0,0');
  ok(same(fit({ paneW: 900, paneH: 600 }, { increment: [9, 17], 'base-size': [10, 20], 'minimum-size': [100, 50] }), { x: 0, y: 0, w: 892, h: 598 }), 'fit: xterm-like hints snap DOWN to the cell grid from the base (10+98×9, 20+34×17)');
  ok(same(fit({ paneW: 300, paneH: 200 }, { 'minimum-size': [400, 300] }), { x: 0, y: 0, w: 400, h: 300 }) && same(fit({ paneW: 3000, paneH: 2000 }, { 'maximum-size': [640, 480] }), { x: 0, y: 0, w: 640, h: 480 }), 'fit: never below the minimum, never above the maximum');
  ok(same(fit({ paneW: 0, paneH: -5 }, { increment: [0, 0] }), { x: 0, y: 0, w: 1, h: 1 }), 'fit: degenerate panes and zero increments never produce a zero size');
  ok(same(P.placeInside({ x: 850, y: 550, w: 200, h: 100 }, { paneW: 900, paneH: 600 }), { x: 700, y: 500, w: 200, h: 100, moved: true }) && same(P.placeInside({ x: -20, y: 10, w: 2000, h: 50 }, { paneW: 900, paneH: 600 }), { x: 0, y: 10, w: 2000, h: 50, moved: true }), 'a dialog is nudged INSIDE the pane; one bigger than the pane pins to the origin');
  ok(P.windowKind({}, true) === 'popup' && P.windowKind({ 'override-redirect': true }) === 'popup' && P.windowKind({ 'transient-for': 1 }) === 'dialog' && P.windowKind({ 'window-type': ['DIALOG'] }) === 'dialog' && P.windowKind({ 'window-type': ['NORMAL'] }) === 'main', 'window kinds: override-redirect ⇒ popup, transient / DIALOG ⇒ dialog, else main');
  const w = new P.WheelAccumulator();
  ok(same(w.feed(0, 100), []) && same(w.feed(0, 30), [[5, 1]]) && same(w.feed(0, -250), [[4, 2]]) && same(w.feed(130, 0), [[7, 1]]) && same(w.feed(0, 2, 1), []) && same(w.feed(0, 1, 2), [[5, 4]]), 'the wheel: deltas accumulate to 120-unit notches ⇒ button 4/5 (vertical) and 6/7 (horizontal) clicks; line and page modes scale (a trackpad\'s small deltas add up)');
  ok(same(P.displayPacket(['display-configure'], { width: 640, height: 480 }), ['display-configure', { 'desktop-size': [640, 480], dpi: { x: 96, y: 96 } }]) && P.displayPacket(['configure-display'], { width: 1, height: 1 })[0] === 'configure-display' && P.displayPacket([], { width: 640, height: 480 })[0] === 'desktop_size', 'the pane resize speaks 6.5.3\'s display-configure (its legacy alias when that is what the server names), else the pre-5 desktop_size');
  ok(P.keyboardConfigPacket(['keyboard-config'])[0] === 'keyboard-config' && P.keyboardConfigPacket([])[0] === 'keymap-changed', 'the keymap speaks keyboard-config on 6.5.3, keymap-changed before');
  const ime = new P.ImeKeymap();
  const p1 = ime.plan('a中文');
  ok(p1.changed && same(p1.rows, [['U4E2D', 226], ['U6587', 227]]) && p1.keys.length === 3 && p1.keys[0].keyname === 'a' && p1.keys[0].keycode === 65 && p1.keys[1].keycode === 226, 'IME: composed characters outside the keymap get PUBLISHED keycode rows (U<hex> from 226) before their presses; a keymap character presses its own keycode');
  const p0 = ime.plan('A!');
  ok(same(p0.keys.map((k) => [k.keyname, k.keycode, k.modifiers]), [['a', 65, ['shift']], ['exclam', 49, ['shift']]]) && !p0.changed, 'IME: an upper-case letter and a shifted symbol press their base keycode WITH shift (nothing to publish)');
  const kc = P.keyboardConfigPacket(['keyboard-config'], { extra: p1.rows });
  ok(kc[1].x11_keycodes instanceof Map && same(kc[1].x11_keycodes.get(226), ['U4E2D']) && kc[1].keycodes.some((r) => same(r, [226, 'U4E2D', 226, 0, 0])) && kc[1].force === true && kc[1].query_struct.layout === 'us', 'keyboard-config with IME rows: the x11 map AND the gtk rows carry them, force set, the query struct kept');
  const p2 = ime.plan('中');
  ok(!p2.changed && p2.keys[0].keycode === 226, 'IME: a character already published needs no new table');
  for (let i = 0; i < 40; i++) ime.plan(String.fromCodePoint(0x4e00 + i));
  ok(ime.slots.size <= 30 && [...ime.slots.values()].every((kc) => kc >= 226 && kc <= 255), 'IME: the table rolls over its 30 slots (X keycodes end at 255) — a slot\'s old name leaves when it is reused');
  ok(same(P.keyAction(3, { keyname: 'a', keyval: 97, string: 'a', keycode: 65, modifiers: ['shift'] }, true), ['key-action', 3, 'a', true, ['shift'], 97, 'a', 65, 0]) && same(P.buttonAction(3, 1, false, [5, 6, 1, 2], []), ['button-action', 3, 1, false, [5, 6, 1, 2], [], []]) && same(P.pointerPosition(3, [5, 6, 1, 2], ['control']), ['pointer-position', 3, [5, 6, 1, 2], ['control'], []]) && same(P.mapWindow(3, { x: 0, y: 0, w: 10, h: 20 }), ['map-window', 3, 0, 0, 10, 20, {}]) && same(P.configureWindow(3, { x: 0, y: 0, w: 10, h: 20 }), ['configure-window', 3, 0, 0, 10, 20, {}, 0, {}, false]) && same(P.damageAck(7, 3, 10, 20, 4, ''), ['damage-sequence', 7, 3, 10, 20, 4, '']) && same(P.focusPacket(3), ['focus', 3, []]) && same(P.pingEcho(12, 'sid'), ['ping_echo', 12, 0, 0, 0, 0, 'sid']), 'the packet forms are xpra-html5 v21\'s (read from its Client.js on this box)');
  const tok = P.clipboardToken('hi');
  ok(tok[0] === 'clipboard-token' && tok[1] === 'CLIPBOARD' && tok[3] === 'UTF8_STRING' && tok[5] === 8 && tok[6] === 'bytes' && str(tok[7]) === 'hi' && tok[8] === true && tok[9] === true && tok[10] === true && same(P.clipboardNone(4, 'CLIPBOARD'), ['clipboard-contents-none', 4, 'CLIPBOARD']) && str(P.clipboardContents(4, 'CLIPBOARD', 'x')[6]) === 'x', 'clipboard packets: a greedy token carrying UTF8_STRING bytes; contents / contents-none answer a request');
  ok(same(P.parseClipboardToken(['clipboard-token', 'CLIPBOARD', ['UTF8_STRING'], 'UTF8_STRING', 'UTF8_STRING', 8, 'bytes', bytes('yo'), true, true, true]), { selection: 'CLIPBOARD', text: 'yo' }) && P.parseClipboardToken(['clipboard-token', 'PRIMARY', [], 'UTF8_STRING', 'UTF8_STRING', 8, 'bytes', bytes('yo')]).text === null && P.parseClipboardToken(['clipboard-token', 'CLIPBOARD', [], 'image/png', 'image/png', 8, 'bytes', bytes('..')]).text === null && P.parseClipboardToken(['clipboard-token', 'CLIPBOARD', []]).text === null, 'a token yields text only for CLIPBOARD with a text-ish type and data');
  ok(same(P.pointerCoords(10.4, 20.6, { x: 3, y: 4 }), [10, 21, 7, 17]) && same(P.pointerCoords(1, 2, null), [1, 2]) && P.xButton(0) === 1 && P.xButton(1) === 2 && P.xButton(2) === 3, 'pointer coords are [root, root, window-relative] rounded; DOM buttons map to X buttons');
  ok(P.mimeFor('png/P') === 'image/png' && P.mimeFor('jpeg') === 'image/jpeg' && P.mimeFor('webp') === 'image/webp' && P.mimeFor('h264') === null, 'mime per coding; video codings are not painted');
}

console.log('§2 the session over a fake worker (xpra-client.js)');
{
  const events = { status: [], windows: [], paints: [], titles: [], icons: [], clips: [], cursors: [] };
  const delays = new Map(); // bytes text → decode delay ms (out-of-order decoding)
  const decode = async (b, mime) => { const s = str(b); await sleep(delays.get(s) || 0); return { bitmap: s, mime, close() { this.closed = true; } }; };
  const client = C.createXpraClient({
    url: 'ws://box.example:3456/api/desktop/app-1/stream?viewer=v1', workerUrl: '/api/desktop/app-1/xpra-ui/js/Protocol.js', screen: { width: 900, height: 600 },
    Worker: FakeWorker, decode, log: null, pasteKeyDelayMs: 5,
    on: { status: (s, d) => events.status.push([s, d]), window: (k, w) => events.windows.push([k, w.wid, w.kind, w.x, w.y, w.w, w.h]), paint: (w, op) => events.paints.push([w.wid, op.type, op.type === 'image' ? op.img.bitmap : op.moves]), title: (t) => events.titles.push(t), icon: (i) => events.icons.push(i), clipboard: (t) => events.clips.push(t), cursor: (c) => events.cursors.push(c) },
  });
  client.connect();
  const wk = await until(() => FakeWorker.instances[0]);
  await until(() => wk.opened);
  ok(wk.url === '/api/desktop/app-1/xpra-ui/js/Protocol.js' && wk.opened === 'ws://box.example:3456/api/desktop/app-1/stream?viewer=v1', 'the worker is the upstream Protocol.js served under our auth, opened on the ONE bridge url');
  const hello = await until(() => wk.sent('hello')[0]);
  ok(!!hello && hello[1].rencodeplus === true && same(hello[1].display.desktop_size, [900, 600]), 'the socket opening ⇒ ONE hello with the caps, the pane as the desktop size');
  wk.feed(['hello', { version: '6.5.3', 'packet-types': ['keyboard-config', 'display-configure', 'draw', 'ping'], rencodeplus: true }]);
  ok(client.state === 'connected' && same(events.status.map((e) => e[0]), ['connecting', 'connected']) && wk.sent('keyboard-config').length === 1 && wk.sent('keyboard-config')[0][1].keycodes.some((r) => r[1] === 'a'), 'the server hello ⇒ connected, and the keymap is published as keyboard-config (6.5.3 names it)');
  // (a) the FIRST top-level window is FIT to the pane and mapped at 0,0 — never small in a corner
  wk.feed(['new-window', 1, 100, 80, 300, 200, { title: 'Calc', 'size-constraints': { increment: [9, 17], 'base-size': [10, 20], 'minimum-size': [100, 50] }, 'window-type': ['NORMAL'] }]);
  ok(same(wk.sent('map-window')[0], ['map-window', 1, 0, 0, 892, 598, {}]) && same(wk.sent('focus')[0], ['focus', 1, []]), 'the first top-level window: map-window at 0,0 with the FITTED size (892×598 under xterm-like hints), then focus');
  ok(same(events.windows[0], ['new', 1, 'main', 0, 0, 892, 598]) && same(events.titles, ['Calc']) && client.mainWid === 1, 'the view learns a main window of the fitted geometry and the app\'s own title');
  // (b) a dialog keeps its size and is nudged inside; a popup is drawn where X put it and never mapped
  wk.feed(['new-window', 2, 850, 550, 200, 100, { title: 'Save as', 'transient-for': 1, 'window-type': ['DIALOG'] }]);
  const lastNew = () => events.windows.filter((e) => e[0] === 'new').slice(-1)[0];
  ok(same(wk.sent('map-window')[1], ['map-window', 2, 700, 500, 200, 100, {}]) && same(lastNew(), ['new', 2, 'dialog', 700, 500, 200, 100]) && same(events.titles, ['Calc']), 'a dialog: its own size, nudged INSIDE the pane (700,500), mapped there; the title bar keeps the main window\'s title');
  wk.feed(['new-override-redirect', 3, 20, 30, 100, 50, {}]);
  ok(wk.sent('map-window').length === 2 && same(lastNew(), ['new', 3, 'popup', 20, 30, 100, 50]) && client.focusedWid === 2, 'a popup (override-redirect) is not mapped, keeps X\'s geometry, does not take focus');
  // (c) draws are painted IN ORDER under an out-of-order decoder, and every draw is acked
  delays.set('first', 40); delays.set('second', 0);
  wk.feed(['draw', 1, 0, 0, 10, 10, 'png', bytes('first'), 1, 40, {}]);
  wk.feed(['draw', 1, 10, 10, 5, 5, 'webp', bytes('second'), 2, 20, {}]);
  wk.feed(['draw', 1, 0, 0, 1, 1, 'void', bytes(''), 3, 0, {}]);
  wk.feed(['draw', 1, 0, 0, 50, 50, 'scroll', [[0, 10, 50, 40, 0, -10]], 4, 0, {}]);
  wk.feed(['draw', 1, 0, 0, 5, 5, 'h264', bytes('video'), 5, 0, {}]);
  wk.feed(['draw', 9, 0, 0, 5, 5, 'png', bytes('x'), 6, 0, {}]);
  await until(() => wk.sent('damage-sequence').length >= 6, 2000);
  const acks = wk.sent('damage-sequence');
  ok(same(events.paints.filter((p) => p[0] === 1).map((p) => p[1] === 'image' ? p[2] : p[1]), ['first', 'second', 'scroll']), 'draws on one window are PAINTED IN ORDER although the first decode finished last (the promise chain)', events.paints);
  ok(acks.filter((a) => a[2] === 1).map((a) => a[1]).join() === '1,2,3,4,5' && acks.filter((a) => a[2] === 1 && a[1] <= 4).every((a) => a[5] >= 0 && a[6] === '') && acks.find((a) => a[1] === 5)[5] === -1 && /unsupported encoding h264/.test(acks.find((a) => a[1] === 5)[6]) && acks.find((a) => a[1] === 6)[5] === -1 && /no such window/.test(acks.find((a) => a[1] === 6)[6]), 'every draw is ACKED in sequence: decode time for the painted ones (void and scroll too), -1 + the reason for an unsupported coding and for an unknown window', acks);
  ok(events.paints.find((p) => p[1] === 'scroll')[2][0][5] === -10, 'a scroll draw hands the view its copy moves verbatim');
  // (d) metadata: title/icon only for the MAIN window; a new size hint refits it
  wk.feed(['window-metadata', 1, { title: 'Calc — 2+2' }]);
  wk.feed(['window-metadata', 2, { title: 'Save as (2)' }]);
  wk.feed(['window-icon', 2, 16, 16, 'png', bytes('PNG2')]);
  wk.feed(['window-icon', 1, 16, 16, 'png', bytes('PNG1')]);
  ok(same(events.titles, ['Calc', 'Calc — 2+2']) && events.icons.length === 1 && str(events.icons[0].data) === 'PNG1', 'window-metadata title and window-icon reach the caller for the main window only');
  wk.feed(['window-metadata', 1, { 'size-constraints': { increment: [10, 10], 'base-size': [0, 0] } }]);
  ok(same(wk.sent('configure-window').slice(-1)[0], ['configure-window', 1, 0, 0, 900, 600, {}, 0, {}, false]), 'a new size hint on the main window ⇒ a fresh fit sent as configure-window');
  wk.feed(['window-move-resize', 2, 650, 480, 220, 110, 3]);
  wk.feed(['window-resized', 1, 895, 595, 4]); // X's snap of our 900x600 fit — within one 10 px increment, so the belt leaves it
  const w1 = client.windows.get(1), w2 = client.windows.get(2);
  ok(w2.x === 650 && w2.w === 220 && w1.w === 895 && w1.h === 595 && w1.x === 0 && events.windows.filter((e) => e[0] === 'geometry').length >= 3, 'the server\'s own move/resize confirmations update the geometry the view draws with');
  // (e) ping / cursor
  wk.feed(['ping', 12345, 0, 'sid-9']); // [ping, echotime, server_time, sid] — the upstream reads the sid at index 3
  ok(same(wk.sent('ping_echo')[0], ['ping_echo', 12345, 0, 0, 0, 0, 'sid-9']), 'a server ping is echoed with its sid');
  wk.feed(['cursor', 'png', 0, 0, 12, 12, 3, 4, 0, bytes('CUR')]);
  wk.feed(['cursor']);
  ok(events.cursors.length === 2 && events.cursors[0].xhot === 3 && str(events.cursors[0].data) === 'CUR' && events.cursors[1] === null, 'a cursor packet and a cursor reset reach the view');
  // (f) the clipboard both ways, deduped
  wk.feed(['clipboard-request', 7, 'CLIPBOARD', 'UTF8_STRING']);
  ok(same(wk.sent('clipboard-contents-none')[0], ['clipboard-contents-none', 7, 'CLIPBOARD']), 'a request before any paste is answered contents-none');
  const tokenIn = (s) => ['clipboard-token', 'CLIPBOARD', ['UTF8_STRING', 'text/plain'], 'UTF8_STRING', 'UTF8_STRING', 8, 'bytes', bytes(s), true, true, true];
  wk.feed(tokenIn('copied in the app'));
  wk.feed(tokenIn('copied in the app'));
  wk.feed(['clipboard-token', 'PRIMARY', ['UTF8_STRING'], 'UTF8_STRING', 'UTF8_STRING', 8, 'bytes', bytes('a selection'), true, true, true]);
  wk.feed(['clipboard-token', 'CLIPBOARD', ['image/png'], 'image/png', 'image/png', 8, 'bytes', bytes('PNG'), true, true, true]);
  ok(same(events.clips, ['copied in the app']), 'a text token on CLIPBOARD surfaces ONCE; a repeat, a PRIMARY selection and an image do not');
  ok(client.pasteText('pasted from the browser') === true && str(wk.sent('clipboard-token')[0][7]) === 'pasted from the browser', 'a paste from the browser is a greedy token with the text');
  await sleep(30);
  const keysAfterPaste = wk.sent('key-action').slice(-4);
  ok(keysAfterPaste.length === 4 && keysAfterPaste[0][2] === 'Control_L' && keysAfterPaste[0][3] === true && keysAfterPaste[1][2] === 'v' && same(keysAfterPaste[1][4], ['control']) && keysAfterPaste[2][3] === false && keysAfterPaste[3][2] === 'Control_L' && keysAfterPaste[3][3] === false, '…followed, after the token has had time to land, by the app\'s own Ctrl+V (press v with control, release both)');
  wk.feed(['clipboard-request', 8, 'CLIPBOARD', 'UTF8_STRING']);
  ok(str(wk.sent('clipboard-contents')[0][6]) === 'pasted from the browser', 'a later request is answered with the last pasted text');
  wk.feed(tokenIn('pasted from the browser'));
  ok(same(events.clips, ['copied in the app']), 'an echo of our own token is not surfaced as a copy');
  // (g) the pane resizes ⇒ display-configure then the main window refits
  wk.posted.length = 0;
  client.resize(640, 480);
  const resizeSends = wk.all.map((p) => p[0]);
  ok(same(resizeSends, ['display-configure', 'configure-window', 'configure-window']) && same(wk.all[0][1]['desktop-size'], [640, 480]) && same(wk.all[1].slice(1, 6), [1, 0, 0, 640, 480]) && same(wk.all[2].slice(1, 6), [2, 420, 370, 220, 110]), 'resize ⇒ display-configure (the virtual screen follows the pane) THEN configure-window (the app follows the pane), in that order — and the dialog now overflowing the smaller pane is nudged back inside (650,480 ⇒ 420,370)', wk.all.map((p) => p.slice(0, 6)));
  client.resize(640, 480);
  ok(wk.all.length === 3, 'the same size again sends nothing');
  // (h) keys, pointer, wheel
  wk.posted.length = 0;
  ok(client.keyDown({ key: 'a', code: 'KeyA', keyCode: 65, mods: {} }) === 'sent' && same(wk.all[0], ['key-action', 2, 'a', true, [], 97, 'a', 65, 0]), 'a key goes to the FOCUSED window (the dialog took focus when it mapped)');
  ok(client.keyDown({ key: 'v', code: 'KeyV', keyCode: 86, mods: { control: true } }) === 'paste' && wk.all.length === 1, 'Ctrl+V sends NOTHING and answers paste (the browser must fire its paste event)');
  ok(client.keyDown({ key: 'c', code: 'KeyC', keyCode: 67, mods: { control: true } }) === 'copy' && wk.all.length === 2 && same(wk.all[1][4], ['control']), 'Ctrl+C goes to the app (it copies) and answers copy (the browser keeps its event too)');
  ok(client.keyUp({ key: 'a', code: 'KeyA', keyCode: 65, mods: {} }) === 'sent' && wk.all[2][3] === false, 'a key release is sent as pressed=false');
  wk.posted.length = 0;
  ok(client.typeText('中a') === 2 && wk.all[0][0] === 'keyboard-config' && wk.all[0][1].keycodes.some((r) => same(r, [226, 'U4E2D', 226, 0, 0])) && same(wk.all[0][1].x11_keycodes.get(226), ['U4E2D']) && wk.all.slice(1).length === 4 && wk.all[1][2] === 'U4E2D' && wk.all[1][7] === 226 && wk.all[3][2] === 'a' && wk.all[3][7] === 65, 'IME text: the keymap with the new U<hex> row is published FIRST (gtk rows + x11 map), then press/release per character');
  wk.posted.length = 0;
  client.typeText('中');
  ok(wk.all.length === 2 && wk.all[0][0] === 'key-action', 'a character already published needs no new table');
  wk.posted.length = 0;
  ok(client.keyDown({ key: 'é', code: 'KeyE', keyCode: 69, mods: { altGraph: true } }) === 'sent' && wk.all[0][0] === 'keyboard-config' && same(wk.all[0][1].x11_keycodes.get(227), ['eacute']) && wk.all[1][2] === 'eacute' && wk.all[1][7] === 227 && wk.all[2][3] === false && wk.all.length === 3, 'a key the US keymap lacks (é via AltGr) goes publish-then-press from keyDown (the html5 shape would drop it)');
  ok(client.keyUp({ key: 'é', code: 'KeyE', keyCode: 69, mods: {} }) === 'sent' && wk.all.length === 3, 'its keyUp sends nothing more (the press already released)');
  wk.posted.length = 0;
  client.pointerButton(50, 40, 0, true, {});
  ok(same(wk.all, [['button-action', 3, 1, true, [50, 40, 30, 10], [], []]]), 'a press on the popup: button-action to wid 3 with root + window coords, no focus change (popups never take focus)');
  wk.posted.length = 0;
  client.pointerButton(300, 300, 2, true, { shift: true });
  ok(same(wk.all[0], ['focus', 1, []]) && same(wk.all[1], ['button-action', 1, 3, true, [300, 300, 300, 300], ['shift'], []]) && client.focusedWid === 1, 'a press on the main window focuses it first (focus packet), then the right button with the modifiers');
  wk.posted.length = 0;
  client.pointerMove(430, 380, {});
  ok(same(wk.all, [['pointer-position', 2, [430, 380, 10, 10], [], []]]), 'a move over the dialog (topmost there — at 420,370 since the pane shrank) reports window-relative coords from the window\'s geometry');
  wk.posted.length = 0;
  client.wheel(300, 300, 0, 240, 0, {});
  ok(wk.all.length === 4 && wk.all.every((p) => p[0] === 'button-action' && p[2] === 5) && wk.all[0][3] === true && wk.all[1][3] === false, 'a 240 px wheel ⇒ two button-5 clicks (press+release each)');
  // (i) view-only drops every input at the source (the bridge would drop it anyway)
  client.viewOnly = true; wk.posted.length = 0;
  ok(client.keyDown({ key: 'a', code: 'KeyA', keyCode: 65, mods: {} }) === null && client.keyDown({ key: 'v', code: 'KeyV', keyCode: 86, mods: { control: true } }) === 'paste' && client.typeText('x') === 0 && client.pasteText('nope') === false && (client.pointerMove(1, 1), client.pointerButton(1, 1, 0, true), client.wheel(1, 1, 0, 120), wk.all.length === 0), 'view-only: keys, text, paste, pointer and wheel send nothing (Ctrl+V still answers paste so the browser keeps working)');
  client.viewOnly = false;
  // (j) losing the main window; the app closing everything
  wk.feed(['lost-window', 1]);
  ok(events.windows.slice(-1)[0][0] === 'lost' && client.mainWid === 0 && events.titles.slice(-1)[0] === '', 'losing the main window: the view is told, no other main-kind window ⇒ no main, the title is cleared');
  wk.feed(['lost-window', 2]); wk.feed(['lost-window', 3]);
  ok(client.windows.size === 0, 'every window can go');
  // (k) a disconnect names its reason; nothing is sent after
  wk.feed(['disconnect', 'server shutdown', 'bye']);
  ok(client.state === 'closed' && client.closedReason === 'server shutdown / bye' && same(events.status.slice(-1)[0], ['closed', 'server shutdown / bye']) && wk.terminated, 'a disconnect packet closes the session with ITS reason, and the worker is terminated');
  ok(client.send(['ping', 1]) === false, 'nothing is sent after the close');
  // (l) no hello ⇒ a named close; a worker that fails to load ⇒ a named close
  const ev2 = [];
  const c2 = C.createXpraClient({ url: 'ws://x/y', workerUrl: '/w', screen: { width: 10, height: 10 }, Worker: FakeWorker, decode, helloTimeoutMs: 60, on: { status: (s, d) => ev2.push([s, d]) } });
  c2.connect();
  await sleep(120);
  ok(c2.state === 'closed' && /no hello from the xpra server within 0 s/.test(c2.closedReason), 'no server hello within the deadline ⇒ closed with that reason');
  class BrokenWorker { constructor() { throw new Error('404 on the worker script'); } }
  const c3 = C.createXpraClient({ url: 'ws://x/y', workerUrl: '/w', screen: { width: 10, height: 10 }, Worker: BrokenWorker, decode });
  c3.connect();
  ok(c3.state === 'closed' && /could not start: 404 on the worker script/.test(c3.closedReason), 'a worker that cannot be constructed ⇒ closed with the reason (the html5 package missing on a host is a named failure)');
}

console.log('§2b THE BELT (2026-09-22): a second top-level placed inside, the app\'s own resize/move undone, bounded');
{
  // the verifier's repros as packets: GNOME Calculator resizing itself on a mode switch (898x616 ⇒ 370x616), xterm
  // `windowmove` to 900,500, `xterm -geometry 40x10+2000+1500` (xpra clamps it to 1078,633 — 20x20 px visible) and a
  // zenity moved to 950,600. Small gaps so the timed legs run in milliseconds; the shipped numbers are asserted below.
  ok(C.BELT_GAP_MS === 500 && C.BELT_FIGHT_MS === 2000 && C.BELT_MAX_FIGHTS === 3, 'the shipped belt: at most one correction per window per 500 ms, three rapid undos (each within 2 s) ⇒ the app wins');
  FakeWorker.instances.length = 0;
  const logs = [];
  const client = C.createXpraClient({ url: 'ws://x/belt', workerUrl: '/w', screen: { width: 1098, height: 653 }, Worker: FakeWorker, decode: async () => ({ close() {} }), beltGapMs: 40, beltFightMs: 400, log: { log: (m) => logs.push(m), warn: (m) => logs.push(m) } });
  client.connect();
  const wk = await until(() => FakeWorker.instances[0]);
  await until(() => wk.sent('hello')[0]);
  wk.feed(['hello', { version: '6.5.3', 'packet-types': ['display-configure'] }]);
  const cfg = (wid) => wk.sent('configure-window').filter((p) => p[1] === wid).map((p) => p.slice(2, 6));
  wk.feed(['new-window', 1, 0, 0, 898, 616, { title: 'Calculator', 'window-type': ['NORMAL'] }]);
  ok(same(wk.sent('map-window')[0].slice(1, 6), [1, 0, 0, 1098, 653]), 'the first top-level is fitted to the pane (1098x653 at 0,0)');
  // (a) a SECOND top-level (kind main, not transient) where xpra clamped it: mapped INSIDE the pane
  wk.feed(['new-window', 5, 1078, 633, 484, 316, { title: 'xterm', 'window-type': ['NORMAL'] }]);
  ok(client.windows.get(5).kind === 'main' && client.mainWid === 1 && same(wk.sent('map-window')[1].slice(1, 6), [5, 614, 337, 484, 316]), 'a second top-level at xpra\'s clamp 1078,633 (20x20 px visible) is mapped at 614,337 — its own size, wholly inside; the first stays the main');
  // (b) X moves it off the pane later (the zenity repro): nudged back inside at once
  wk.feed(['window-move-resize', 5, 950, 600, 484, 316, 0]);
  ok(same(cfg(5), [[614, 337, 484, 316]]) && client.windows.get(5).x === 614, 'a secondary window X moved to 950,600 ⇒ ONE configure-window back to 614,337 (it used to follow off the pane)');
  // (c) the app SHRINKS the main (Calculator's mode switch): configure-window back to the fit
  wk.feed(['window-move-resize', 1, 0, 0, 370, 616, 0]);
  ok(same(cfg(1), [[0, 0, 1098, 653]]) && client.windows.get(1).w === 1098, 'the main resized itself to 370x616 (40 % of the pane) ⇒ configure-window back to 1098x653 at 0,0');
  // (d) the app MOVES the main inside the gap after our correction: held until the gap ends, then corrected once
  wk.feed(['window-move-resize', 1, 900, 500, 1098, 653, 0]);
  ok(cfg(1).length === 1 && client.beltState(1).pending, 'a move inside the gap after our own configure is NOT answered at once (it may be the confirmation) — a re-check is pending');
  await until(() => (cfg(1).length === 2 ? true : null), 1000, 5);
  ok(same(cfg(1)[1], [0, 0, 1098, 653]), 'when the gap ends the main (moved to 900,500) is put back at 0,0 — one configure per gap, never a burst');
  // (e) CONTROL: X's snap within one size increment is the fit, not an undo
  wk.feed(['window-metadata', 1, { 'size-constraints': { increment: [9, 17], 'base-size': [10, 20] } }]);
  ok(same(cfg(1)[2], [0, 0, 1090, 649]), 'new size hints ⇒ a fresh fit under them (1090x649)');
  await sleep(60);
  wk.feed(['window-resized', 1, 1090, 645, 0]);
  await sleep(80);
  ok(cfg(1).length === 3, 'CONTROL: X reporting 1090x645 (4 px under the fit, inside one 17 px increment) sends NOTHING — a snap is not a fight');
  wk.feed(['window-resized', 1, 1090, 632, 0]);
  await until(() => (cfg(1).length === 4 ? true : null), 1000, 5);
  ok(cfg(1).length === 4, 'one full increment short (632 vs 649) IS off the fit ⇒ corrected');
  // (f) an app that keeps undoing the fit wins after three rapid corrections — bounded, never a ping-pong
  await sleep(450); // past the fight window: a fresh fight
  const before = cfg(1).length;
  for (let i = 0; i < 5; i++) { wk.feed(['window-move-resize', 1, 0, 0, 370, 616, 0]); await sleep(55); }
  ok(cfg(1).length - before === 3 && client.beltState(1).gaveUp && logs.some((l) => /undid the fit 3 times in a row/.test(l)), `five rapid undos ⇒ exactly THREE corrections, then the app wins and it is said once (${cfg(1).length - before} sent)`);
  client.resize(1000, 600);
  ok(same(cfg(1).slice(-1)[0], [0, 0, 1000, 598]) && !client.beltState(1).gaveUp, 'a pane resize is a new target: the main is fitted again under its hints (1000x598) and the belt re-armed', cfg(1).slice(-1)[0]);
  // (g) popups are never moved; a pane that SHRINKS keeps the secondary window inside
  wk.feed(['new-override-redirect', 7, 10, 10, 50, 50, {}]);
  wk.feed(['configure-override-redirect', 7, 3000, 3000, 50, 50]);
  ok(cfg(7).length === 0 && client.windows.get(7).x === 3000, 'a popup X put off the pane is drawn where X put it — never configured');
  ok(same(cfg(5).slice(-1)[0], [516, 284, 484, 316]), 'the 1000x600 pane already nudged the secondary window (614,337 overflowed it) to 516,284', cfg(5));
  client.resize(700, 500);
  await until(() => (same(cfg(5).slice(-1)[0], [216, 184, 484, 316]) ? true : null), 1000, 5);
  ok(same(cfg(5).slice(-1)[0], [216, 184, 484, 316]), 'the pane shrinking again to 700x500 (inside the gap: held, then sent once) puts it at 216,184', cfg(5));
  client.close();
}

console.log('§2c round 3 A2 (docs/design-desktop-apps-seamless §3.2): the outer ✕ asks the app — close-window to its MAIN window, never a dialog, never from Watch');
{
  FakeWorker.instances.length = 0;
  const c = C.createXpraClient({ url: 'ws://x/s', workerUrl: '/w.js', screen: { width: 900, height: 600 }, Worker: FakeWorker, decode: async () => ({ close() {} }), log: null });
  ok(typeof c.closeMain === 'function' && c.closeMain() === false, 'closeMain() before any session sends nothing (false)');
  c.connect();
  const w = await until(() => FakeWorker.instances[0]);
  await until(() => w.sent('hello').length);
  w.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
  ok(c.closeMain() === false && w.sent('close-window').length === 0, 'connected but no window yet: nothing to ask (false)');
  w.feed(['new-window', 4, 0, 0, 360, 616, { title: 'Calculator', 'window-type': ['NORMAL'] }]);
  w.feed(['new-window', 5, 40, 40, 200, 100, { title: 'Save?', 'transient-for': 4, 'window-type': ['DIALOG'] }]);
  c.focusWindow(5);
  ok(c.closeMain() === true && same(w.sent('close-window'), [['close-window', 4]]), 'the ✕ ⇒ ONE close-window naming the MAIN window (4) — not the focused dialog (5): WM_DELETE_WINDOW to the app, which may answer with its own save dialog', w.sent('close-window'));
  c.watch = true;
  ok(c.closeMain() === false && w.sent('close-window').length === 1, 'x5 Watch: the pane may not ask (false, nothing sent — the bridge would drop it anyway)');
  c.watch = false; c.viewOnly = true;
  ok(c.closeMain() === false && w.sent('close-window').length === 1, 'view-only: nothing sent');
  c.viewOnly = false;
  w.feed(['lost-window', 4]);
  ok(c.mainWid === 0 && c.closeMain() === false && w.sent('close-window').length === 1, 'the main window lost (a dialog left, no main): nothing to ask — the outer ✕ is the pane\'s own close then');
  c.close();
}

console.log('§3 the view under the fake DOM (xpra-view.js): both clipboard branches, the keyboard, the pointer, the ladder');
{
  const mk = (opts) => {
    const host = new El('div');
    const titles = [], icons = [], statuses = [];
    const view = V.createXpraView(host, { url: () => 'ws://x/stream', workerUrl: '/api/desktop/a/xpra-ui/js/Protocol.js', autoReconnect: true, Worker: FakeWorker, decode: async (b) => ({ bitmap: str(b), close() {} }), onStatus: (s) => statuses.push(s), onTitle: (t) => titles.push(t), onIcon: (u) => icons.push(u), ...opts });
    return { host, view, titles, icons, statuses };
  };
  // the chrome: the shared shell, the pane a theme colour, the IME textarea, the chip hidden
  const A = mk({ secure: false, clipboardApi: false });
  const container = A.host.children[0];
  const [bar, mount] = container.children;
  ok(container.style.zoom === 'calc(1 / var(--ui-scale, 1))' && bar.className === 'desktop-bar' && container.style.cssText.includes('background:var(--bg-primary)'), 'the view stands on the picture shell: counter-zoomed container, the ONE .desktop-bar, a theme-var background (no #000)');
  const pane = mount.children[0];
  ok(pane.className === 'xpra-pane' && pane.children[0].className === 'xpra-stage' && pane.children[1].className === 'xpra-ime' && pane.children[1].tagName === 'textarea', 'the pane holds the window STAGE (x5: identity while active, a fit-scale in Watch) and the IME textarea');
  ok(A.view.chip.style.display === 'none' && A.view.chip.textContent === 'Copied in the app — click to copy', 'the copy chip exists, hidden, with its words');
  pane.clientWidth = 800; pane.clientHeight = 500; pane.rect = { left: 10, top: 20 };
  await A.view.connect();
  const wk = await until(() => FakeWorker.instances[FakeWorker.instances.length - 1]);
  await until(() => wk.sent('hello').length);
  ok(same(wk.sent('hello')[0][1].display.desktop_size, [800, 500]) && A.view.status.textContent === 'Connecting…', 'connect ⇒ the hello carries the PANE size; the chip says Connecting…');
  wk.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
  ok(A.view.status.textContent === 'Waiting for the application window…' && A.statuses.includes('connected') && pane.children[1].focused >= 1, 'the server hello ⇒ "Waiting for the application window…", the IME textarea takes focus');
  wk.feed(['new-window', 1, 0, 0, 300, 200, { title: 'xterm', 'size-constraints': { increment: [8, 16], 'base-size': [0, 0] } }]);
  const winEl = A.view.stage.children[0];
  ok(winEl && winEl.className === 'xpra-win xpra-win-main' && winEl.style.left === '0px' && winEl.style.width === '800px' && winEl.style.height === '496px' && winEl.children[0].width === 800 && winEl.children[0].height === 496 && A.view.status.textContent === 'Connected', 'a window ⇒ one canvas element sized to the FITTED geometry (800×496 on 8×16 cells), the chip says Connected');
  ok(same(A.titles, ['xterm']), 'the app window\'s own title reaches the caller');
  wk.feed(['window-icon', 1, 8, 8, 'png', bytes('PNGBYTES')]);
  ok(A.icons.length === 1 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(A.icons[0]), 'the icon reaches the caller as a validated data: URL');
  wk.feed(['draw', 1, 5, 6, 10, 10, 'png', bytes('img'), 1, 40, {}]);
  await until(() => wk.sent('damage-sequence').length);
  const ctx = winEl.children[0].getContext('2d');
  ok(ctx.drawn.length === 1 && ctx.drawn[0][0].bitmap === 'img' && same(ctx.drawn[0].slice(1), [5, 6, 10, 10]), 'a draw is painted onto the window\'s canvas at its rect');
  wk.feed(['draw', 1, 0, 0, 50, 50, 'scroll', [[0, 16, 800, 480, 0, -16]], 2, 0, {}]);
  await until(() => wk.sent('damage-sequence').length >= 2);
  ok(ctx.drawn.length === 2 && ctx.drawn[1][0] === winEl.children[0] && same(ctx.drawn[1].slice(1), [0, 16, 800, 480, 0, 0, 800, 480]), 'a scroll draw copies the canvas onto itself by the move');
  // the pointer: coords from the pane\'s OWN rect (10,20 here)
  wk.posted.length = 0;
  pane.fire('pointerdown', { clientX: 110, clientY: 70, button: 0, pointerId: 1 });
  ok(pane.captured === true && pane.children[1].focused >= 2 && same(wk.all.slice(-1)[0], ['button-action', 1, 1, true, [100, 50, 100, 50], [], []]), 'pointerdown: the IME textarea is focused, the pointer captured, coords = client − the pane rect');
  pane.fire('pointerup', { clientX: 110, clientY: 70, button: 0, pointerId: 1 });
  ok(wk.all.slice(-1)[0][3] === false, 'pointerup releases');
  const wheelEv = pane.fire('wheel', { clientX: 110, clientY: 70, deltaX: 0, deltaY: 120, deltaMode: 0 });
  ok(wheelEv.prevented && wk.all.slice(-2).every((p) => p[0] === 'button-action' && p[2] === 5), 'wheel is prevented (no page scroll) and becomes button-5 clicks');
  // the keyboard: Ctrl+V is LEFT to the browser, a letter is sent + prevented, composition types text
  const ime = pane.children[1];
  wk.posted.length = 0;
  const kv = ime.fire('keydown', { key: 'v', code: 'KeyV', keyCode: 86, ctrlKey: true, getModifierState: () => false });
  ok(!kv.prevented && wk.all.length === 0, 'Ctrl+V on the textarea: not prevented, nothing sent — the paste event will carry the text');
  const ka = ime.fire('keydown', { key: 'a', code: 'KeyA', keyCode: 65, getModifierState: () => false });
  ok(ka.prevented && wk.all.length === 1 && wk.all[0][2] === 'a', 'a letter: sent as key-action and prevented (nothing lands in the textarea)');
  const kp = ime.fire('keydown', { key: 'Process', code: 'KeyA', keyCode: 229, isComposing: true, getModifierState: () => false });
  ok(!kp.prevented && wk.all.length === 1, 'an IME in flight (229 / isComposing) is left alone');
  ime.value = '中文';
  ime.fire('compositionend', { data: '中文' });
  ok(ime.value === '' && wk.all[1][0] === 'keyboard-config' && wk.all.slice(2).length === 4 && wk.all[2][2] === 'U4E2D', 'compositionend ⇒ the composed text is typed (table published first), the textarea emptied');
  // the paste EVENT (plain http): the text becomes a token + the app\'s Ctrl+V
  wk.posted.length = 0;
  const pe = ime.fire('paste', { clipboardData: { getData: (t) => (t === 'text/plain' ? 'from the paste event' : '') } });
  ok(pe.prevented && str(wk.sent('clipboard-token')[0][7]) === 'from the paste event' && toastTexts().some((x) => /Pasted into the application/.test(x)), 'a paste event: prevented, its text sent as a token, a toast');
  // the Paste chip on plain http cannot read the clipboard: the shell's PASTE BOX (a textarea whose native paste works on plain http and on a touch screen)
  const pasteBtnA = A.view.container.children[0].children[1]; // bar: [status, pasteBtn, reBtn, copy chip] — the shell's pasteBtn
  ok(pasteBtnA.textContent === 'Paste' && !A.view.pasteOpen, 'the bar\'s second child is the shell\'s Paste (the copy chip sits after Reconnect, so addControl keeps its slots)');
  await pasteBtnA.onclick();
  const boxA = A.view.container.children.find((c) => c.className === 'vnc-paste-box');
  ok(A.view.pasteOpen && boxA && /not served over HTTPS/.test(boxA.children[0].textContent) && boxA.children[1].tagName === 'textarea' && boxA.children[1].focused === 1 && A.view.container.children.indexOf(boxA) === 1, 'the Paste chip on plain http opens the paste box (under the bar, above the picture) naming HTTPS as the reason, its textarea focused — never a silent no-op', boxA && boxA.children[0].textContent);
  wk.posted.length = 0;
  boxA.children[2].children[0].onclick();
  ok(A.view.pasteOpen && wk.all.length === 0, 'Send with an empty box sends nothing and keeps the box');
  boxA.children[1].value = 'typed into the box';
  const f0 = ime.focused;
  boxA.children[2].children[0].onclick();
  ok(!A.view.pasteOpen && str(wk.sent('clipboard-token')[0][7]) === 'typed into the box' && ime.focused === f0 + 1 && !A.view.container.children.includes(boxA), 'Send: the box text goes in as a token, the box closes and the focus goes back to the app');
  await until(() => wk.sent('key-action').length >= 4, 500);
  await pasteBtnA.onclick();
  const boxA2 = A.view.container.children.find((c) => c.className === 'vnc-paste-box');
  const f1 = ime.focused;
  boxA2.children[1].fire('keydown', { key: 'Escape' });
  ok(!A.view.pasteOpen && ime.focused === f1 + 1, 'Escape in the box closes it and hands the focus back');
  // app → browser on plain http: the chip, then a click copies through execCommand
  const tokenIn = (s) => ['clipboard-token', 'CLIPBOARD', ['UTF8_STRING'], 'UTF8_STRING', 'UTF8_STRING', 8, 'bytes', bytes(s), true, true, true];
  wk.feed(tokenIn('copied inside the app'));
  ok(A.view.chip.style.display === '' && A.view.chipText === 'copied inside the app', 'a copy inside the app on plain http ⇒ the "Copied in the app — click to copy" chip appears, holding the text');
  execCalls.length = 0;
  A.view.chip.onclick();
  ok(execCalls.length === 1 && execCalls[0][0] === 'copy' && same(execCalls[0][1], ['copied inside the app']) && A.view.chip.style.display === 'none' && A.view.chipText === null && toastTexts().some((x) => /Copied to your clipboard/.test(x)), 'the click copies through execCommand on a hidden textarea holding the text, toasts, and the chip goes away');
  wk.feed(tokenIn('second copy'));
  execOk = false; A.view.chip.onclick(); execOk = true;
  ok(A.view.chip.style.display === '' && toastTexts().some((x) => /Could not copy/.test(x)), 'a refused execCommand keeps the chip and says so');
  // view-only + the window-closed sentence + the ladder
  A.view.setViewOnly(true);
  ok(A.view.client.viewOnly === true && pane.classes.has('xpra-view-only'), 'setViewOnly reaches the session and marks the pane');
  A.view.setViewOnly(false);
  wk.feed(['lost-window', 1]);
  ok(A.view.stage.children.length === 0 && A.view.status.textContent === 'The application closed its window', 'the last window going ⇒ its element removed, the chip says the application closed its window');
  const before = FakeWorker.instances.length;
  wk.feed(['disconnect', 'server shutdown']);
  ok(A.view.status.textContent === 'Connection lost: server shutdown' && A.view.status.style.color === 'var(--red, #e55)' && A.statuses.slice(-1)[0] === 'disconnected', 'a server disconnect: "Connection lost: <its reason>" in red');
  await sleep(1300);
  ok(FakeWorker.instances.length === before + 1, 'the shell\'s ladder reconnects on its first rung (~1 s) while the picture is wanted');
  A.view.dispose();
  const n = FakeWorker.instances.length;
  await sleep(1300);
  ok(FakeWorker.instances.length === n && FakeWorker.instances[n - 1].terminated, 'dispose terminates the worker and nothing reconnects');
  // the SECURE branch: the API takes the copy; a refused write falls to the chip; the Paste chip reads the API
  const written = [];
  let writeOk = true;
  const B = mk({ secure: true, clipboardApi: { writeText: async (t) => { if (!writeOk) throw new Error('denied'); written.push(t); }, readText: async () => 'read from the api' } });
  const paneB = B.host.children[0].children[1].children[0];
  paneB.clientWidth = 400; paneB.clientHeight = 300;
  await B.view.connect();
  const wkB = await until(() => FakeWorker.instances[FakeWorker.instances.length - 1]);
  await until(() => wkB.sent('hello').length);
  wkB.feed(['hello', { 'packet-types': ['keyboard-config'] }]);
  toasts.length = 0;
  wkB.feed(tokenIn('api copy'));
  await sleep(0);
  ok(same(written, ['api copy']) && B.view.chip.style.display === 'none' && toastTexts().some((x) => /Copied to your clipboard/.test(x)), 'secure context: the copy lands in navigator.clipboard, no chip, a toast');
  writeOk = false;
  wkB.feed(tokenIn('refused copy'));
  await sleep(0);
  ok(B.view.chip.style.display === '' && B.view.chipText === 'refused copy', 'a refused API write falls to the chip (honest, never silent)');
  wkB.posted.length = 0;
  const pasteBtnB = B.host.children[0].children[0].children[1];
  await pasteBtnB.onclick();
  ok(str(wkB.sent('clipboard-token')[0][7]) === 'read from the api' && !B.view.pasteOpen, 'the Paste chip on a secure context reads the API and sends the text (no box)');
  const clipB = { writeText: async () => {}, readText: async () => { const e = new Error('Read permission denied.'); e.name = 'NotAllowedError'; throw e; } };
  const Bd = mk({ secure: true, clipboardApi: clipB });
  toasts.length = 0;
  await Bd.host.children[0].children[0].children[1].onclick();
  ok(!Bd.view.pasteOpen && toastTexts().some((x) => /The application is not connected/.test(x)), 'Paste before the session is up: "The application is not connected", no box (never pressed into a dead view)');
  const paneBd = Bd.host.children[0].children[1].children[0];
  paneBd.clientWidth = 300; paneBd.clientHeight = 200;
  await Bd.view.connect();
  const wkBd = await until(() => FakeWorker.instances[FakeWorker.instances.length - 1]);
  await until(() => wkBd.sent('hello').length);
  wkBd.feed(['hello', { 'packet-types': [] }]);
  await Bd.host.children[0].children[0].children[1].onclick();
  const boxBd = Bd.view.container.children.find((c) => c.className === 'vnc-paste-box');
  ok(Bd.view.pasteOpen && boxBd && /refused clipboard access/.test(boxBd.children[0].textContent), 'a secure page whose browser refuses the read (permission) opens the box with the permission sentence', boxBd && boxBd.children[0].textContent);
  Bd.view.dispose();
  ok(!Bd.view.pasteOpen, 'dispose closes an open paste box');
  B.view.dispose();
}

console.log('§3c A1 (round 3): the plain-http GESTURE WINDOW — the user\'s own Ctrl+C in the pane ⇒ the app\'s token copied with NO click; any other token ⇒ the chip; the one-time HTTPS hint');
{
  let clock = 100000;
  const store = new Map();
  const realLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const mkC = (opts = {}) => {
    const host = new El('div');
    const view = V.createXpraView(host, { url: () => 'ws://x/stream', workerUrl: '/w.js', Worker: FakeWorker, decode: async (b) => ({ bitmap: str(b), close() {} }), secure: false, clipboardApi: false, now: () => clock, ...opts });
    return { host, view };
  };
  const up = async (C) => {
    const pane = C.host.children[0].children[1].children[0];
    pane.clientWidth = 400; pane.clientHeight = 300;
    await C.view.connect();
    const wk = await until(() => FakeWorker.instances[FakeWorker.instances.length - 1]);
    await until(() => wk.sent('hello').length);
    wk.feed(['hello', { 'packet-types': ['keyboard-config'] }]);
    wk.feed(['new-window', 1, 0, 0, 300, 200, { title: 'calc' }]);
    return { wk, ime: pane.children[1] };
  };
  const tokenIn = (s) => ['clipboard-token', 'CLIPBOARD', ['UTF8_STRING'], 'UTF8_STRING', 'UTF8_STRING', 8, 'bytes', bytes(s), true, true, true];
  const ctrlC = (ime, extra = {}) => ime.fire('keydown', { key: 'c', code: 'KeyC', keyCode: 67, ctrlKey: true, isTrusted: true, getModifierState: () => false, ...extra });
  const C = mkC();
  const { wk, ime } = await up(C);
  // (a) the hint is not shown before any chip; a Ctrl+C is forwarded to the app AND left to the browser (not prevented)
  ok(C.view.hintShown === false && C.view.copyHint && C.view.copyHint.className === 'desktop-copy-hint' && C.view.copyHint.style.display === 'none', 'the HTTPS hint exists in the bar, hidden, before any chip');
  wk.posted.length = 0;
  const kc = ctrlC(ime);
  ok(!kc.prevented && wk.sent('key-action').length === 1 && wk.sent('key-action')[0][2] === 'c', 'a trusted Ctrl+C: forwarded to the app (it copies) and NOT prevented');
  // (b) the token arrives 300 ms later: written by execCommand, NO chip, a toast
  execCalls.length = 0; toasts.length = 0; clock += 300;
  wk.feed(tokenIn('42'));
  ok(execCalls.length === 1 && execCalls[0][0] === 'copy' && same(execCalls[0][1], ['42']) && C.view.chip.style.display === 'none' && C.view.chipText === null && toastTexts().some((x) => /Copied to your clipboard/.test(x)), 'A1: the app\'s token 300 ms after the user\'s Ctrl+C is copied through execCommand on a hidden textarea — NO chip, NO click, a toast', { exec: execCalls, chip: C.view.chip.style.display });
  ok(C.view.hintShown === false && !store.has(S.COPY_HINT_KEY), '…and a seamless copy shows no HTTPS hint (the hint is for the chip)');
  // (c) the stamp is SPENT: a second token with no new chord ⇒ the chip (an agent / a timer / another client copying)
  execCalls.length = 0; clock += 200;
  wk.feed(tokenIn('an agent copied this'));
  ok(execCalls.length === 0 && C.view.chip.style.display === '' && C.view.chipText === 'an agent copied this', 'A1: ONE chord, at most ONE write — a later token with no new chord (an agent, a timer, another client) keeps the chip, execCommand never tried');
  // (d) the FIRST chip on this plain-http device shows the one-time hint and remembers it
  ok(C.view.hintShown === true && store.has(S.COPY_HINT_KEY) && C.view.copyHint.children[0].textContent === 'Enable HTTPS for seamless copy' && C.view.copyHint.children[1].tagName === 'a' && C.view.copyHint.children[1].href === S.HTTPS_DOCS_URL && C.view.copyHint.children[1].target === '_blank' && C.view.copyHint.children[1].rel === 'noopener' && C.view.copyHint.children[1].textContent === 'How to enable HTTPS', 'A1: the first chip on a plain-http device shows "Enable HTTPS for seamless copy" + the docs link (new tab, noopener), and the device remembers it', { shown: C.view.hintShown, stored: [...store.keys()] });
  ok(/<svg[^>]*>/.test(C.view.copyHint.children[2].innerHTML) && C.view.copyHint.children[2].attrs['aria-label'] === 'Dismiss', 'the hint\'s dismiss is an SVG icon with an accessible name (never a ✕ character)');
  C.view.copyHint.children[2].onclick();
  ok(C.view.hintShown === false, 'dismiss hides the hint');
  C.view.chip.onclick();
  // (e) a Ctrl+C whose token arrives AFTER the window (5.2 s) ⇒ the chip, execCommand never tried
  ctrlC(ime); execCalls.length = 0; clock += 5200;
  wk.feed(tokenIn('late token'));
  ok(execCalls.length === 0 && C.view.chip.style.display === '' && C.view.chipText === 'late token', 'A1: a token 5.2 s after the Ctrl+C (outside Chrome\'s activation window, measured 5200 ms refused) ⇒ the chip, execCommand never tried');
  C.view.chip.onclick();
  // (f) the window's edge: 4.8 s ⇒ written
  ctrlC(ime); execCalls.length = 0; clock += 4800;
  wk.feed(tokenIn('edge token'));
  ok(execCalls.length === 1 && C.view.chip.style.display === 'none', 'A1: a token 4.8 s after the Ctrl+C (inside the window, measured ok) is written with no click');
  // (g) the browser's own answer is the second gate: execCommand false inside the window ⇒ the chip, said
  ctrlC(ime); execOk = false; execCalls.length = 0; clock += 100;
  wk.feed(tokenIn('refused by the browser'));
  execOk = true;
  ok(execCalls.length === 1 && C.view.chip.style.display === '' && C.view.chipText === 'refused by the browser', 'A1: a refused execCommand inside the window falls to the chip (the browser\'s own answer is the second gate — never silent)');
  C.view.chip.onclick();
  // (h) an UNTRUSTED Ctrl+C (a script's synthetic event), a held key's auto-repeat and a plain letter never stamp
  execCalls.length = 0;
  ctrlC(ime, { isTrusted: false }); clock += 50; wk.feed(tokenIn('synthetic chord'));
  const synth = execCalls.length;
  C.view.chip.onclick(); execCalls.length = 0;
  ctrlC(ime, { repeat: true }); clock += 50; wk.feed(tokenIn('auto-repeat'));
  const rep = execCalls.length;
  C.view.chip.onclick(); execCalls.length = 0;
  ime.fire('keydown', { key: 'a', code: 'KeyA', keyCode: 65, isTrusted: true, getModifierState: () => false }); clock += 50; wk.feed(tokenIn('after a letter'));
  ok(synth === 0 && rep === 0 && execCalls.length === 0 && C.view.chipText === 'after a letter', 'A1: only the user\'s own trusted copy chord stamps — a synthetic Ctrl+C, an auto-repeat and a plain letter leave the chip', { synth, rep, letter: execCalls.length });
  C.view.chip.onclick();
  // (i) Ctrl+X and ⌘+C are copy chords too
  execCalls.length = 0;
  ime.fire('keydown', { key: 'x', code: 'KeyX', keyCode: 88, ctrlKey: true, isTrusted: true, getModifierState: () => false }); clock += 40; wk.feed(tokenIn('cut'));
  ime.fire('keydown', { key: 'c', code: 'KeyC', keyCode: 67, metaKey: true, isTrusted: true, getModifierState: () => false }); clock += 40; wk.feed(tokenIn('mac copy'));
  ok(execCalls.length === 2 && C.view.chip.style.display === 'none', 'A1: Ctrl+X and ⌘+C stamp like Ctrl+C (the chords clipboardShortcut names "copy")');
  // (j) a view-only / Watch pane forwards nothing, so its chord stamps nothing
  C.view.setViewOnly(true); execCalls.length = 0;
  ctrlC(ime); clock += 40; wk.feed(tokenIn('while view-only'));
  ok(execCalls.length === 0 && C.view.chipText === 'while view-only', 'A1: a view-only pane\'s Ctrl+C never reaches the app, so it never stamps (the chip)');
  C.view.setViewOnly(false); C.view.chip.onclick();
  // (k) the hint is ONE per device: a second view on the same device shows the chip without the hint
  const C2 = mkC();
  const s2 = await up(C2);
  s2.wk.feed(tokenIn('second view copy'));
  ok(C2.view.chip.style.display === '' && C2.view.hintShown === false, 'A1: the hint is one-time per DEVICE — a second view after it was shown gets the chip alone');
  // (l) a SECURE page whose API refuses: the chip, never the HTTPS hint (the page IS https)
  store.clear();
  const C3 = mkC({ secure: true, clipboardApi: { writeText: async () => { throw new Error('denied'); } } });
  const s3 = await up(C3);
  s3.wk.feed(tokenIn('secure but refused'));
  await sleep(0);
  ok(C3.view.chip.style.display === '' && C3.view.hintShown === false && !store.has(S.COPY_HINT_KEY), 'A1: a secure page\'s refused API write shows the chip but never the HTTPS hint (and leaves the device\'s hint unspent)');
  C.view.dispose(); C2.view.dispose(); C3.view.dispose();
  globalThis.localStorage = realLS;
}

console.log('§5 x5 — ONE active viewer (docs/design-desktop-apps §7 P8-2): Watch sends no geometry and is fit-scaled, a dormant (blocked) pane never times out, a held hello re-sizes');
{
  // the client, run twice: the shipped file, and a PATCHED COPY without the x5 Watch guards (the pre-x5 control)
  const src = read('src/lib/xpra-client.js');
  const guards = [
    ["    if (state !== 'connected' || watch) return; // x5 Watch", "    if (state !== 'connected') return; // pre-x5"],
    ["    if (!win || win.wid !== mainWid || win.kind !== 'main' || watch) return;", "    if (!win || win.wid !== mainWid || win.kind !== 'main') return;"],
  ];
  const guardHits = guards.map(([from]) => src.split(from).length - 1);
  ok(guardHits.every((n) => n === 1), `the Watch guards are spelled once each in xpra-client.js (the control patches exactly them: ${guardHits.join(', ')})`);
  let mut = src; for (const [from, to] of guards) mut = mut.replace(from, to);
  const mutFile = MUTXC.write('src/lib/xpra-client.js', mut, 'watch');
  const runWatch = async (mod) => {
    FakeWorker.instances.length = 0;
    const c = mod.createXpraClient({ url: 'ws://x/s', workerUrl: '/w.js', screen: { width: 900, height: 600 }, Worker: FakeWorker, decode: async () => ({ close() {} }), log: null });
    c.watch = true; c.viewOnly = true;
    c.connect();
    const w = await until(() => FakeWorker.instances[0]);
    await until(() => w.sent('hello').length);
    w.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
    w.feed(['new-window', 1, 0, 0, 1200, 700, { title: 'held', 'window-type': ['NORMAL'] }]);
    const n0 = w.all.length;
    c.resize(640, 480);
    w.feed(['window-move-resize', 1, 0, 0, 1100, 650, 0]);
    await sleep(30);
    const after = w.all.slice(n0).map((p) => p[0]);
    const map = w.sent('map-window')[0];
    return { c, w, after, map };
  };
  try {
    const A = await runWatch(C);
    ok(same(A.map, ['map-window', 1, 0, 0, 1200, 700, {}]), 'Watch: a window is drawn where the SERVER has it (1200x700 — the active viewer\'s geometry), never fitted to this pane', A.map);
    ok(A.after.length === 0 && A.c.windows.get(1).w === 1100, `Watch: resize() and the server's own geometry send NOTHING — no display-configure, no configure-window, no belt (${A.after.join(', ') || 'nothing sent'}) — the window just follows the server (1100x650)`, A.after);
    A.c.watch = false;
    const back = A.w.all.slice(-2).map((p) => [p[0], ...(p[0] === 'configure-window' ? p.slice(2, 6) : [])]);
    ok(same(back[0], ['display-configure']) && back[1][0] === 'configure-window' && back[1][1] === 0 && back[1][2] === 0 && back[1][3] === 640 && back[1][4] === 480, 'leaving Watch (the pane took over) re-fits to THIS pane: display-configure then the main\'s configure-window 640x480 at 0,0', back);
    A.c.close();
    const M = await runWatch(await import(mutFile));
    ok(M.after.includes('display-configure') || M.after.includes('configure-window'), `CONTROL: the pre-x5 client in the same Watch pane sends geometry (${M.after.join(', ')}) — the r3 open item, a Watch pane resizing the holder's app`, M.after);
    M.c.close();
  } finally { /* MUTXC's scratch dir is removed at exit */ }

  // DORMANT: a blocked pane's hello is held by the bridge — no hello timeout while dormant; a hello that arrives later with the pane changed re-sizes
  FakeWorker.instances.length = 0;
  const d = C.createXpraClient({ url: 'ws://x/s', workerUrl: '/w.js', screen: { width: 900, height: 600 }, Worker: FakeWorker, decode: async () => ({ close() {} }), log: null, helloTimeoutMs: 60 });
  d.dormant = true;
  d.connect();
  const dw = await until(() => FakeWorker.instances[0]);
  await until(() => dw.sent('hello').length);
  await sleep(150);
  ok(d.state !== 'closed' && d.dormant, `a DORMANT (blocked) client outlives its hello timeout (60 ms; ${d.state} after 150 ms) — it waits for its turn, not for a timeout`);
  d.resize(700, 500);
  d.dormant = false; // Resume here
  dw.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
  const firstTwo = dw.all.slice(1, 3).map((p) => p[0]);
  const disp = dw.sent('display-configure')[0];
  ok(d.state === 'connected' && same(firstTwo, ['keyboard-config', 'display-configure']) && disp && same(disp[1]['desktop-size'], [700, 500]), 'the held hello carried 900x600; the pane is 700x500 when the server answers ⇒ the keymap, then display-configure 700x500 (the display follows the pane of NOW)', { firstTwo, disp: disp && disp[1]['desktop-size'] });
  d.close();
  FakeWorker.instances.length = 0;
  const e = C.createXpraClient({ url: 'ws://x/s', workerUrl: '/w.js', screen: { width: 900, height: 600 }, Worker: FakeWorker, decode: async () => ({ close() {} }), log: null, helloTimeoutMs: 60 });
  e.connect();
  await until(() => FakeWorker.instances[0]);
  await sleep(150);
  ok(e.state === 'closed' && /no hello/.test(e.closedReason || ''), `CONTROL: the same client NOT dormant closes on its hello timeout (${e.closedReason})`);

  // THE VIEW: Watch scales the stage to fit (contain — never cropped); active is identity; a cut (close 4001) reconnects at once
  const host = new El('div');
  FakeWorker.instances.length = 0;
  const view = V.createXpraView(host, { url: () => 'ws://x/stream', workerUrl: '/w.js', autoReconnect: true, Worker: FakeWorker, decode: async () => ({ close() {} }) });
  const pane = view.pane; pane.clientWidth = 800; pane.clientHeight = 500;
  view.setMode('watch');
  await view.connect();
  const vw = await until(() => FakeWorker.instances[0]);
  await until(() => vw.sent('hello').length);
  vw.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
  vw.feed(['new-window', 1, 0, 0, 1600, 800, { title: 'big', 'window-type': ['NORMAL'] }]);
  ok(view.stage.style.transform === 'translate(0px, 50px) scale(0.5)' && view.stageScale === 0.5 && view.client.watch === true && view.client.viewOnly === true, `Watch: a 1600x800 window in an 800x500 pane ⇒ the stage is scaled by min(800/1600, 500/800) = 0.5 — the whole picture, never cropped — and CENTRED (the 100 px of slack split: +50 px) (${view.stage.style.transform})`);
  vw.feed(['window-move-resize', 1, 0, 0, 400, 1000, 0]);
  ok(view.stage.style.transform === 'translate(300px, 0px) scale(0.5)', 'the server moving the window re-fits the stage (400x1000 ⇒ 500/1000 = 0.5, centred: +300 px)', view.stage.style.transform);
  // THE CAP (2.369.156, the product's default): a pane LARGER than the app shows it 1:1, centred — never blown up
  vw.feed(['window-move-resize', 1, 0, 0, 500, 300, 0]);
  const upscale = Math.min(800 / 500, 500 / 300);
  ok(view.stageScale === 1 && view.stage.style.transform === 'translate(150px, 100px)' && view.stageOffset.x === 150 && view.stageOffset.y === 100, `Watch: a 500x300 window in an 800x500 pane stays at scale 1 (crisp 1:1), centred at +150,+100 (${view.stage.style.transform}) — CONTROL: the uncapped fit would blow it up ${upscale.toFixed(2)}x`, { t: view.stage.style.transform, s: view.stageScale });
  vw.feed(['window-move-resize', 1, 0, 0, 400, 1000, 0]);
  const before = vw.all.length;
  pane.clientWidth = 300; pane.clientHeight = 300; view.client.resize(300, 300);
  ok(vw.all.length === before, 'Watch: a pane resize sends nothing (resize() is a no-op for the geometry — the verifier\'s LOW)');
  view.setMode('active');
  ok(view.stage.style.transform === '' && view.client.watch === false && view.client.viewOnly === false && vw.sent('display-configure').length === 1, 'active: identity stage, input on, and the pane\'s own size goes out once (display-configure)');
  view.setMode('blocked');
  ok(view.client.dormant === true && view.client.viewOnly === true, 'blocked: the client is dormant and view-only (the window overlay covers the pane)');
  const n = FakeWorker.instances.length;
  vw.feed(['close', "4001: 'blocked: active on another client'"]); // the upstream Protocol.js's own words for an unmapped close code (close_event_str)
  await until(() => FakeWorker.instances.length > n, 500, 5);
  ok(FakeWorker.instances.length === n + 1 && view.client.dormant === true, 'a CUT (the bridge closed 4001 — another client resumed here) reconnects AT ONCE as a dormant viewer — never the ladder\'s 1 s, so the pane stays seated for re-election');
  view.dispose();
}

console.log('§6 HiDPI + THE APP\'S MINIMUM (2.369.158, docs/design-desktop-apps.zh.md §7.6): device px end to end, the min pane from size-constraints, the scaled-to-fit picture');
{
  // ── the PURE words ──
  ok(P.METADATA_SUPPORTED.includes('size-constraints'), 'the hello asks for `size-constraints` — xpra 6.x\'s NAME for the X size hints (the server only sends the keys a client lists)');
  // the root cause of the owner's cropped calculator: xpra filters window metadata by the client's list (measured on 6.5.3:
  // the calculator's new-window carried has-alpha,title,class-instance,window-type,decorations — no hints — under the v21 list)
  const serverMeta = { title: 'Calculator', 'size-constraints': { increment: [2, 2], 'minimum-size': [720, 1232] } };
  const filtered = (list) => Object.fromEntries(Object.entries(serverMeta).filter(([k]) => list.includes(k)));
  const OLD = P.METADATA_SUPPORTED.filter((k) => k !== 'size-constraints');
  const fitNew = P.fitGeometry({ paneW: 1400, paneH: 800 }, P.sizeHintsOf(filtered(P.METADATA_SUPPORTED)));
  const fitOld = P.fitGeometry({ paneW: 1400, paneH: 800 }, P.sizeHintsOf(filtered(OLD)));
  ok(fitNew.h === 1232 && fitNew.w === 1400, `the fit NEVER asks for less than the app's minimum: a 1400x800 pane ⇒ ${fitNew.w}x${fitNew.h} (the minimum height 1232; the view scales the picture)`, fitNew);
  ok(fitOld.h === 800, `CONTROL: under the pre-fix metadata list the hints never arrive and the same pane asks for ${fitOld.w}x${fitOld.h} — below the minimum, X clamps it and the pane crops the keypad (the owner's screenshot)`, fitOld);
  ok(same(P.devicePane({ width: 640, height: 400 }, 2), { width: 1280, height: 800 }) && same(P.devicePane({ width: 641.4, height: 400 }, 1.25), { width: 801, height: 500 }) && same(P.devicePane({ width: 733, height: 700 }, 1.15), { width: 842, height: 805 }) && same(P.devicePane({ width: 640, height: 400 }, 'x'), { width: 640, height: 400 }), 'devicePane: CSS px × the ratio, rounded DOWN (2 ⇒ 1280x800; 641.4 × 1.25 = 801.75 ⇒ 801, never 802 — whose 641.6 CSS box overflows the pane; 700 × 1.15 = 804.99…98 ⇒ 805, float noise absorbed; a junk ratio ⇒ 1)');
  ok(same(P.minPaneCss({ 'minimum-size': [720, 1232], increment: [2, 2] }, 2), { w: 360, h: 616 }), 'minPaneCss: the calculator at GDK_SCALE=2 (minimum 720x1232 device px) on a 2x screen needs a 360x616 CSS pane');
  ok(same(P.minPaneCss({ 'minimum-size': [721, 1233] }, 2), { w: 361, h: 617 }), 'minPaneCss rounds UP (721x1233 at 2 ⇒ 361x617 — never a pane half a pixel short)');
  ok(same(P.minPaneCss({ 'base-size': [4, 4], increment: [6, 13] }, 1), { w: 4, h: 4 }) && same(P.minPaneCss({ 'base-size': [4, 4], increment: [6, 13], 'minimum-size': [10, 17] }, 1), { w: 10, h: 17 }), 'minPaneCss: the minimum wins, an unset minimum falls back to the base (ICCCM) — xterm\'s 10x17');
  ok(P.minPaneCss(null, 2) === null && P.minPaneCss({}, 2) === null && P.minPaneCss({ increment: [6, 13] }, 2) === null && P.minPaneCss({ 'minimum-size': [0, 5] }, 1) === null, 'missing hints (or neither size, or a zero size) ⇒ NO minimum');
  let everyRatio = true; const bad = [];
  for (const r of [1, 1.1, 1.25, 1.333, 1.5, 1.75, 2, 2.5, 3]) for (const [mw, mh] of [[720, 1232], [721, 1233], [10, 17], [333, 555]]) {
    const m = P.minPaneCss({ 'minimum-size': [mw, mh] }, r); const d = P.devicePane({ width: m.w, height: m.h }, r);
    const g = P.fitGeometry({ paneW: d.width, paneH: d.height }, { 'minimum-size': [mw, mh], increment: [3, 7], 'base-size': [1, 1] });
    if (d.width < mw || d.height < mh || g.w > d.width || g.h > d.height) { everyRatio = false; bad.push({ r, mw, mh, d, g }); }
  }
  ok(everyRatio, 'for 9 ratios × 4 minimums: a pane of exactly minPaneCss holds the minimum in device px AND the increment-snapped fit never exceeds it (never cropped at the clamp)', bad.slice(0, 3));

  // ── the client: device px out, the display's dpi (never 96 × ratio), the main's constraints named ──
  const src = read('src/lib/xpra-client.js');
  const ratioLine = "  const ratioNow = () => P.pixelRatioOf(typeof ratio === 'function' ? ratio() : ratio);";
  ok(src.split(ratioLine).length === 2, 'the ratio is read in ONE place in xpra-client.js (the control patches exactly it)');
  const mutFile = MUTXC.write('src/lib/xpra-client.js', src.replace(ratioLine, '  const ratioNow = () => 1; // pre-fix: CSS px are X px'), 'dpr');
  const runDpr = async (mod) => {
    FakeWorker.instances.length = 0;
    const cons = [];
    const c = mod.createXpraClient({ url: 'ws://x/s', workerUrl: '/w.js', screen: { width: 700, height: 450 }, ratio: () => 2, dpi: 96, Worker: FakeWorker, decode: async () => ({ close() {} }), log: null, on: { constraints: (h) => cons.push(h) } });
    c.connect();
    const w = await until(() => FakeWorker.instances[0]);
    await until(() => w.sent('hello').length);
    w.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
    w.feed(['new-window', 1, 0, 0, 720, 1232, { title: 'Calculator', 'size-constraints': { increment: [2, 2], 'minimum-size': [720, 1232] }, 'window-type': ['NORMAL'] }]);
    c.resize(800, 700);
    return { c, w, cons, hello: w.sent('hello')[0][1], map: w.sent('map-window')[0], disp: w.sent('display-configure').slice(-1)[0], cfg: w.sent('configure-window').slice(-1)[0] };
  };
  try {
    const A = await runDpr(C);
    ok(same(A.hello.display.desktop_size, [1400, 900]) && A.hello.screen_sizes[0][1] === 1400 && A.hello.screen_sizes[0][2] === 900, `ratio 2: the hello's desktop size is the pane in DEVICE px (700x450 CSS ⇒ ${A.hello.display.desktop_size.join('x')})`);
    ok(A.hello.dpi.x === 96 && A.disp[1].dpi.x === 96, 'the hello and every display-configure carry the DISPLAY\'s font dpi (96 at GDK_SCALE=2) — never 96 × the ratio (xpra would rewrite Xft.dpi to 192: 4x text, measured)');
    ok(same(A.map.slice(2, 6), [0, 0, 1400, 1232]), `the main window is mapped at the device-px fit, the height held at its minimum 1232 (the 900 px pane is shorter — the view scales): ${A.map.slice(2, 6).join(',')}`);
    ok(same(A.disp[1]['desktop-size'], [1600, 1400]) && same(A.cfg.slice(2, 6), [0, 0, 1600, 1400]), `resize(800x700 CSS) ⇒ display-configure 1600x1400 and the main refitted 1600x1400 at 0,0 (device px, ≥ the minimum): ${A.disp[1]['desktop-size']} / ${A.cfg.slice(2, 6)}`);
    ok(A.cons.length === 1 && same(A.cons[0], { increment: [2, 2], 'minimum-size': [720, 1232] }) && same(A.c.mainConstraints, A.cons[0]), 'on.constraints names the MAIN window\'s size constraints once (and mainConstraints reads them)', A.cons);
    A.w.feed(['window-metadata', 1, { 'size-constraints': { increment: [2, 2], 'minimum-size': [800, 1300] } }]);
    ok(A.cons.length === 2 && A.cons[1]['minimum-size'][1] === 1300, 'a size-constraints change on the main window is announced again (the window re-clamps)');
    A.w.feed(['window-metadata', 1, { title: 'Calculator — sci' }]);
    ok(A.cons.length === 2, 'a metadata change that is not the constraints announces nothing');
    A.w.feed(['lost-window', 1]);
    ok(A.cons.length === 3 && A.cons[2] === null, 'the main window gone ⇒ constraints null (no minimum any more)');
    A.c.close();
    const M = await runDpr(await import(mutFile));
    ok(same(M.hello.display.desktop_size, [700, 450]) && M.disp[1]['desktop-size'][0] === 800, `CONTROL: the pre-fix client (CSS px are X px) says ${M.hello.display.desktop_size.join('x')} / ${M.disp[1]['desktop-size'].join('x')} — a 96-dpi bitmap the 2x screen blows up (the owner's "looks like VNC")`);
    M.c.close();
  } finally { /* MUTXC's scratch dir is removed at exit */ }

  // ── the view: device-px canvases in CSS boxes, the pointer ×ratio, the minimum out, scaled-to-fit (never cropped) ──
  const vsrc = read('src/lib/xpra-view.js');
  const vLine = "  const ratio = () => pixelRatioOf(typeof pixelRatio === 'function' ? pixelRatio() : pixelRatio);";
  ok(vsrc.split(vLine).length === 2, 'the view reads the ratio in ONE place (the control patches exactly it)');
  const runView = async (mod) => {
    FakeWorker.instances.length = 0;
    const host = new El('div'); const mins = [];
    const view = mod.createXpraView(host, { url: () => 'ws://x/stream', workerUrl: '/w.js', Worker: FakeWorker, decode: async () => ({ close() {} }), pixelRatio: () => 2, dpi: 96, onMinSize: (m) => mins.push(m) });
    const pane = view.pane; pane.clientWidth = 700; pane.clientHeight = 450; pane.rect = { left: 10, top: 20 };
    await view.connect();
    const w = await until(() => FakeWorker.instances[0]);
    await until(() => w.sent('hello').length);
    w.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
    w.feed(['new-window', 1, 0, 0, 720, 1232, { title: 'Calculator', 'size-constraints': { increment: [2, 2], 'minimum-size': [720, 1232] }, 'window-type': ['NORMAL'] }]);
    const winEl = view.stage.children[0];
    return { view, w, mins, winEl, pane };
  };
  const vMut = MUTXC.write('src/lib/xpra-view.js', vsrc.replace(vLine, '  const ratio = () => 1; // pre-fix'), 'dpr');
  try {
    const A = await runView(V);
    const cv = A.winEl.children[0];
    ok(cv.width === 1400 && cv.height === 1232 && A.winEl.style.width === '700px' && A.winEl.style.height === '616px' && cv.style.width === '700px' && cv.style.height === '616px', `the canvas backing store is DEVICE px (${cv.width}x${cv.height}) in a CSS box of device ÷ 2 (${A.winEl.style.width} × ${A.winEl.style.height}) — 1:1 on the 2x screen, crisp`);
    ok(same(A.mins, [{ w: 360, h: 616 }]) && same(A.view.minSize, { w: 360, h: 616 }), 'onMinSize hands the window the smallest pane in CSS px (360x616)', A.mins);
    const s = A.view.stageScale;
    ok(Math.abs(s - 450 / 616) < 1e-9 && A.view.fitBadge.style.display === '' && A.view.fitBadge.textContent === 'Scaled to fit — the app needs at least 360×616', `a 450 px tall pane under a 616 px minimum: the ACTIVE picture is scaled to fit (${s.toFixed(3)}), never cropped, and the badge says why ("${A.view.fitBadge.textContent}")`);
    A.w.posted.length = 0;
    const ox = A.view.stageOffset.x;
    A.pane.fire('pointerdown', { clientX: 10 + ox + 100 * s, clientY: 20 + 200 * s, button: 0, pointerId: 1 });
    const ba = A.w.all.slice(-1)[0];
    ok(ba[0] === 'button-action' && Math.abs(ba[4][0] - 200) <= 1 && Math.abs(ba[4][1] - 400) <= 1, `the pointer is mapped through the stage's fit AND the ratio: CSS (100,200) on the scaled stage ⇒ device (${ba[4][0]},${ba[4][1]}) ≈ (200,400)`, ba);
    A.pane.clientWidth = 800; A.pane.clientHeight = 700;
    observers.filter((o) => o.el === A.pane && !o.off).forEach((o) => o.cb());
    await until(() => (A.view.stageScale === 1 ? true : null), 1000, 10);
    ok(A.view.stageScale === 1 && A.view.fitBadge.style.display === 'none' && A.view.stage.style.transform === '', 'a pane that holds the minimum: identity stage, no badge, the app at 0,0 (its increment leftover right/bottom, as before)');
    A.view.dispose();
    const M = await runView(await import(vMut));
    const mcv = M.winEl.children[0];
    ok(!(mcv.width === 1400 && M.winEl.style.width === '700px'), `CONTROL: the pre-fix view (ratio 1) draws the canvas at CSS size = backing store (${mcv.width} px wide in a ${M.winEl.style.width} box, the hello ${M.w.sent('hello')[0][1].display.desktop_size.join('x')}) — the 96-dpi bitmap upscaled by the 2x screen`);
    M.view.dispose();
  } finally { /* MUTXC's scratch dir is removed at exit */ }
}

console.log('§6b HiDPI r2 — the verifier\'s findings: fractional ratios stay 1:1, the display CONTAINS the fitted app, an active scale only in the minimum case');
{
  // a PRE-FIX trio: copies of proto/client/view (imports rewired to each other) with named levers pulled back
  const mkTrio = async (tag, { proto = [], client = [], view = [] } = {}) => {
    const edit = (src, subs, file) => { for (const [from, to] of subs) { if (src.split(from).length !== 2) throw new Error(`${file}: lever not spelled exactly once: ${from.slice(0, 80)}`); src = src.replace(from, to); } return src; };
    const xp = MUTXC.write('src/lib/xpra-proto.js', edit(read('src/lib/xpra-proto.js'), proto, 'proto'), tag);
    const xc = MUTXC.write('src/lib/xpra-client.js', edit(read('src/lib/xpra-client.js'), client, 'client').replace("from './xpra-proto.js'", `from '${fileUrl(xp)}'`), tag);
    const xv = MUTXC.write('src/lib/xpra-view.js', edit(read('src/lib/xpra-view.js'), view, 'view').replace("from './xpra-client.js'", `from '${fileUrl(xc)}'`).replace("from './xpra-proto.js'", `from '${fileUrl(xp)}'`), tag);
    const cleanup = () => { /* MUTXC's scratch dir is removed at exit */ };
    return { P: await import(fileUrl(xp)), C: await import(fileUrl(xc)), V: await import(fileUrl(xv)), cleanup };
  };
  const ROUND = ['  return { width: Math.max(1, Math.floor((Number(width) || 1) * r + 1e-6)), height: Math.max(1, Math.floor((Number(height) || 1) * r + 1e-6)) };', '  return { width: Math.max(1, Math.round((Number(width) || 1) * r)), height: Math.max(1, Math.round((Number(height) || 1) * r)) };'];
  const NO_SLACK = ['  const FIT_SLACK_CSS = 1;', '  const FIT_SLACK_CSS = 0;'];
  const PANE_DISPLAY = ['    return { width: Math.max(pane.width, g ? g.x + g.w : 0), height: Math.max(pane.height, g ? g.y + g.h : 0) };', '    return { width: pane.width, height: pane.height };'];
  const ALL_WINDOWS = ["      if (mode === 'watch') {\n        for (const w of client.windows.values())", "      if (true) {\n        for (const w of client.windows.values())"];

  // ── F1 (major): a fractional ratio — the device pane never overflows the pane ⇒ the stage stays identity, the picture 1:1 ──
  let worst = null;
  for (const r of [1, 1.1, 1.25, 1.333, 1.5, 1.75, 2, 2.25, 2.5, 3]) for (let w = 200; w <= 1400; w += 1) { const d = P.devicePane({ width: w, height: w }, r); const over = d.width / r - w; if (over > 1e-9 || w - d.width / r >= 1 / r) { worst = { r, w, d: d.width, over }; break; } }
  ok(P.gridStep(2) === 2 && P.gridStep(1) === 1 && P.gridStep(1.5) === 3 && P.gridStep(1.25) === 5 && P.gridStep(1.75) === 7 && P.gridStep(1.1) === 11 && P.gridStep(1.3337) === 1, 'gridStep: the smallest device step whose CSS size is a WHOLE CSS px (2 ⇒ 2 — an odd width at DPR 2 is 697.5 CSS, measured resampled —, 1.5 ⇒ 3, 1.25 ⇒ 5, 1.75 ⇒ 7, 1.1 ⇒ 11; none ≤ 16 ⇒ 1)');
  let exact = true; const inexact = [];
  for (const r of [1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3]) for (let n = 1; n <= 2000; n += 1) { const b = P.backingSize(n, r); const u = b / r; if (b < n || b - n >= P.gridStep(r) || Math.abs(u - Math.round(u)) > 1e-6) { exact = false; inexact.push({ r, n, b }); break; } }
  ok(exact, 'backingSize: for 9 ratios × every size 1..2000 the backing is ≥ the window, less than one step larger, and its CSS box (backing ÷ ratio) is a whole CSS px', inexact.slice(0, 3));
  const cssOf = (n, r) => n / r;
  ok(!Number.isInteger(cssOf(1346, 1.5)) && !Number.isInteger(cssOf(1395, 2)) && P.backingSize(1395, 2) === 1396 && P.backingSize(1346, 1.5) === 1347, `CONTROL: the unpadded boxes are not whole CSS px — 1346 at 1.5 = ${cssOf(1346, 1.5).toFixed(3)} CSS, 1395 at 2 = ${cssOf(1395, 2)} CSS (measured: resampled, 1.5 % / 18.6 % of the pixels off); padded: 1347 ⇒ 898, 1396 ⇒ 698`);
  ok(worst === null, 'for 10 ratios × every pane width 200..1400: the device pane\'s CSS box (device ÷ ratio) is never larger than the pane and less than one device px short of it', worst);
  const preRound = (w, r) => Math.round(w * r) / r - w;
  ok(preRound(733, 1.5) > 0.3 && preRound(898, 1.25) > 0.3 && preRound(898, 1.75) > 0.2, `CONTROL: the pre-fix rounding (to the nearest) makes a CSS box LARGER than the pane — 733 × 1.5 ⇒ 1100 device ⇒ ${(1100 / 1.5).toFixed(2)} CSS, 898 × 1.25 ⇒ 1123 ⇒ ${(1123 / 1.25).toFixed(1)}, 898 × 1.75 ⇒ 1572 ⇒ ${(1572 / 1.75).toFixed(2)} (the verifier's probe3 §B)`);
  const runFrac = async (mod) => {
    FakeWorker.instances.length = 0;
    const host = new El('div');
    const view = mod.createXpraView(host, { url: () => 'ws://x/stream', workerUrl: '/w.js', Worker: FakeWorker, decode: async () => ({ close() {} }), pixelRatio: () => 1.5, dpi: 144 });
    view.pane.clientWidth = 898; view.pane.clientHeight = 733;
    await view.connect();
    const w = await until(() => FakeWorker.instances[0]);
    await until(() => w.sent('hello').length);
    w.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
    // GNOME Calculator at 1.5x (GDK_SCALE 1, 144 dpi): minimum 370x616 device px (measured), no increment
    w.feed(['new-window', 1, 0, 0, 370, 616, { title: 'Calculator', 'size-constraints': { 'minimum-size': [370, 616] }, 'window-type': ['NORMAL'] }]);
    await sleep(5);
    return { view, map: w.sent('map-window')[0] };
  };
  {
    const A = await runFrac(V);
    const fcv = A.view.stage.children[0].children[0];
    ok(fcv.width === 1347 && fcv.height === 1101 && fcv.style.width === '898px' && fcv.style.height === '734px', `…and its canvas backing is the window rounded UP to the ratio's grid step (1347x1099 ⇒ ${fcv.width}x${fcv.height}, multiples of 3 at 1.5) in a CSS box of ${fcv.style.width} × ${fcv.style.height} — whole CSS px, so the browser draws it 1:1 (1347 / 1.5 = 898 exactly; the bare 1346 / 1.5 = 897.33… CSS is snapped and RESAMPLED — measured 1.5 % of the pixels off)`, { w: fcv.width, h: fcv.height, cw: fcv.style.width, ch: fcv.style.height });
    ok(same(A.map.slice(4, 6), [1347, 1099]) && A.view.stageScale === 1 && A.view.stage.style.transform === '' && A.view.fitBadge.style.display === 'none', `DPR 1.5, an 898x733 pane holding the calculator: the app is fitted to ${A.map.slice(4, 6).join('x')} device px (CSS ${(A.map[4] / 1.5).toFixed(2)} × ${(A.map[5] / 1.5).toFixed(2)} ≤ the pane) and the stage stays IDENTITY — no transform, no badge (the picture is the canvas 1:1)`, { map: A.map, scale: A.view.stageScale, t: A.view.stage.style.transform });
    A.view.dispose();
    const T = await mkTrio('frac', { proto: [ROUND], view: [NO_SLACK] });
    try {
      const B = await runFrac(T.V);
      ok(same(B.map.slice(4, 6), [1347, 1100]) && B.view.stageScale < 1 && B.view.fitBadge.style.display === '', `CONTROL: the pre-fix rounding (and no slack) fits 1347x1100 and the stage takes scale(${B.view.stageScale.toFixed(6)}) with the "Scaled to fit" badge on a pane that HOLDS the app — the resampled, blurred picture the verifier measured (4.18 % of the pixels off)`, { map: B.map, scale: B.view.stageScale });
      B.view.dispose();
    } finally { T.cleanup(); }
  }

  // ── F2 (major): the X display CONTAINS the window it places — a phone pane smaller than the app's minimum ──
  const runPhone = async (mod) => {
    FakeWorker.instances.length = 0;
    const c = mod.createXpraClient({ url: 'ws://x/s', workerUrl: '/w.js', screen: { width: 320, height: 491 }, ratio: () => 2, dpi: 96, Worker: FakeWorker, decode: async () => ({ close() {} }), log: null });
    c.connect();
    const w = await until(() => FakeWorker.instances[0]);
    await until(() => w.sent('hello').length);
    w.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
    w.feed(['new-window', 1, 0, 0, 740, 1232, { title: 'Calculator', 'size-constraints': { increment: [2, 2], 'minimum-size': [740, 1232] }, 'window-type': ['NORMAL'] }]);
    const seq = w.all.map((p) => p[0]);
    const disp = () => w.sent('display-configure').map((p) => p[1]['desktop-size']);
    const out = { c, w, hello: w.sent('hello')[0][1].display.desktop_size, map: w.sent('map-window')[0].slice(2, 6), dispAtMap: disp().slice(-1)[0] || null, dispBeforeMap: seq.lastIndexOf('display-configure') >= 0 && seq.lastIndexOf('display-configure') < seq.indexOf('map-window') };
    c.resize(800, 700); out.big = disp().slice(-1)[0];
    c.resize(320, 491); out.back = disp().slice(-1)[0];
    w.feed(['lost-window', 1]); out.gone = disp().slice(-1)[0];
    return out;
  };
  {
    const A = await runPhone(C);
    ok(same(A.hello, [640, 982]) && same(A.map, [0, 0, 740, 1232]) && same(A.dispAtMap, [740, 1232]) && A.dispBeforeMap, `a 320x491 phone pane @2 (640x982 device) under a calculator whose minimum is 740x1232: the display is GROWN to ${A.dispAtMap && A.dispAtMap.join('x')} BEFORE the window is mapped at ${A.map.slice(2).join('x')} — X never clamps the pointer at the pane's last row (the verifier: '0' landed on row 981)`, A);
    ok(same(A.big, [1600, 1400]) && same(A.back, [740, 1232]) && same(A.gone, [640, 982]), `the display follows: a pane that holds the app ⇒ the pane (${A.big}); small again ⇒ the app's minimum (${A.back}); no main window ⇒ the pane (${A.gone})`, A);
    A.c.close();
    const T = await mkTrio('disp', { client: [PANE_DISPLAY] });
    try {
      const B = await runPhone(T.C);
      ok(!B.dispAtMap || B.dispAtMap[1] < 1232, `CONTROL: the pre-fix display is the pane (${B.dispAtMap ? B.dispAtMap.join('x') : 'the hello\'s 640x982'}) under a 740x1232 window — the app's lower rows and right column are outside X's screen, unclickable`, B.dispAtMap);
      B.c.close();
    } finally { T.cleanup(); }
  }

  // ── low: an ACTIVE pane scales ONLY in the minimum case — an oversized dialog never zooms the whole picture ──
  const runDialog = async (mod) => {
    FakeWorker.instances.length = 0;
    const host = new El('div');
    const view = mod.createXpraView(host, { url: () => 'ws://x/stream', workerUrl: '/w.js', Worker: FakeWorker, decode: async () => ({ close() {} }), pixelRatio: () => 1, dpi: 96 });
    view.pane.clientWidth = 800; view.pane.clientHeight = 500;
    await view.connect();
    const w = await until(() => FakeWorker.instances[0]);
    await until(() => w.sent('hello').length);
    w.feed(['hello', { 'packet-types': ['keyboard-config', 'display-configure'] }]);
    w.feed(['new-window', 1, 0, 0, 400, 300, { title: 'Editor', 'size-constraints': { 'minimum-size': [200, 150] }, 'window-type': ['NORMAL'] }]);
    await sleep(5);
    const before = view.stageScale;
    w.feed(['new-window', 2, 50, 40, 1000, 700, { title: 'Preferences', 'transient-for': 1, 'window-type': ['DIALOG'] }]);
    await sleep(5);
    return { view, before, after: view.stageScale, badge: view.fitBadge.style.display, t: view.stage.style.transform };
  };
  {
    const A = await runDialog(V);
    ok(A.before === 1 && A.after === 1 && A.badge === 'none' && A.t === '', `ACTIVE, the main window fits the pane: a 1000x700 dialog larger than the 800x500 pane leaves the stage at identity (${A.after}) — no mid-session zoom jump, no silent scale`, { before: A.before, after: A.after, badge: A.badge, t: A.t });
    A.view.setMode('watch'); await sleep(5);
    ok(A.view.stageScale < 1, `…while WATCH still contains every non-popup window (the dialog included: scale ${A.view.stageScale.toFixed(3)}) — its rule is unchanged`);
    A.view.dispose();
    const T = await mkTrio('dlg', { view: [ALL_WINDOWS] });
    try {
      const B = await runDialog(T.V);
      ok(B.after < 1, `CONTROL: the r1 rule (every non-popup window, active too) zooms the whole picture to ${B.after.toFixed(3)} when the dialog opens — a mid-session jump whose badge (${B.badge === 'none' ? 'none' : 'shown'}) could only name the MAIN window's minimum, which the pane holds (the verifier's low finding)`, { after: B.after, badge: B.badge, t: B.t });
      B.view.dispose();
    } finally { T.cleanup(); }
  }
}

{
  // the launch half: the launcher sends THIS client's devicePixelRatio as `dpr` (clamped to the route's 1..3)
  const L = await import('../src/lib/desktop-app-launcher.js');
  ok(L.launchDpr(2) === 2 && L.launchDpr(1.25) === 1.25 && L.launchDpr(0.9) === 1 && L.launchDpr(4) === 3 && L.launchDpr('x') === 1, 'launchDpr: the page\'s devicePixelRatio, clamped to 1..3 (a zoomed-out page launches at 1)');
  ok(/body: JSON\.stringify\(\{ \.\.\.payload, dpr: launchDpr\(\), uiScale: launchUiScale\(\) \}\)/.test(read('src/lib/desktop-app-launcher.js')), 'WIRING PIN: every launch POST carries `dpr: launchDpr()` and (round 3 A3) `uiScale: launchUiScale()`');
  // round 3 A3: the UI scale half — utils' uiScale() (the body zoom; 1 on a phone) clamped to the route's 0.6..2
  ok(L.launchUiScale(1.25) === 1.25 && L.launchUiScale(1) === 1 && L.launchUiScale(0.5) === 0.6 && L.launchUiScale(3) === 2 && L.launchUiScale('x') === 1 && L.launchUiScale(1.333) === 1.33, 'launchUiScale: the page\'s UI scale, clamped to 0.6..2, two decimals');
}

console.log('§4 the census (grep over src/lib + style.css)');
{
  const lib = path.join(repo, 'src/lib');
  const files = fs.readdirSync(lib).filter((f) => f.endsWith('.js'));
  const where = (re) => files.filter((f) => re.test(read(`src/lib/${f}`)));
  ok(same(where(/new WorkerCtor\(|new Worker\(/), ['xpra-client.js']), 'ONE worker construction site under src/lib: xpra-client.js', where(/new WorkerCtor\(|new Worker\(/));
  ok(same(where(/className = 'desktop-bar'/), ['picture-shell.js']), 'the .desktop-bar is built in ONE file (picture-shell.js) — vnc-view and xpra-view stand on it', where(/className = 'desktop-bar'/));
  const code = (f) => read(`src/lib/${f}`).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const whereCode = (re) => files.filter((f) => re.test(code(f)));
  ok(same(whereCode(/xpra-ui\/js\/Protocol\.js/), ['desktop-app-window.js']), 'the upstream worker asset is spelled ONCE in code (desktop-app-window.js hands the url to the view)', whereCode(/xpra-ui\/js\/Protocol\.js/));
  ok(/\.xpra-pane \{[^}]*background: var\(--/.test(read('public/style.css')) && !/#000/.test(read('src/lib/xpra-view.js')) && !/#000/.test(read('src/lib/xpra-client.js')), 'the pane is a THEME colour and no xpra file spells #000 (no root, no black — owner acceptance 1)');
  ok(/isSecureContext/.test(read('src/lib/xpra-view.js')) && /execCommand\('copy'\)/.test(read('src/lib/picture-shell.js')) && /addEventListener\('paste'/.test(read('src/lib/xpra-view.js')), 'the view consults isSecureContext and listens to the paste event; the shell copies through execCommand on plain http');
  ok(same(whereCode(/desktop-copied-chip/), ['picture-shell.js']) && same(whereCode(/vnc-paste-box/), ['picture-shell.js']) && same(whereCode(/execCommand\('copy'\)/).filter((f) => /^(picture|vnc|xpra|desktop)/.test(f)), ['picture-shell.js']), 'the copy chip, the paste box and the picture views\' execCommand copy are built in ONE file (picture-shell.js) — both views stand on them, never a twin (utils.copyText / terminal.js keep their own, result-less fallbacks)', { chip: whereCode(/desktop-copied-chip/), box: whereCode(/vnc-paste-box/), exec: whereCode(/execCommand\('copy'\)/) });
  ok(/shell\.deliverCopy\(text, \{ secure: pageIsSecure\(\), clipboard: navigator\.clipboard, toast: false \}\)/.test(read('src/lib/vnc-view.js')) && /shell\.deliverCopy\(text, \{ secure: isSecure\(\), clipboard: clip\(\), gestureAge \}\)/.test(read('src/lib/xpra-view.js')) && /else if \(r === 'copy' && e\.isTrusted === true && !e\.repeat\) copyGestureAt = clock\(\);/.test(read('src/lib/xpra-view.js')) && /shell\.pasteFromClipboard\(/.test(read('src/lib/vnc-view.js')) && /shell\.pasteFromClipboard\(/.test(read('src/lib/xpra-view.js')), 'WIRING PIN: both views deliver app copies and run Paste through the shell (the RFB rung too — the fleet image\'s rung); the xpra view hands the shell the age of its trusted copy-chord stamp (A1)');
  ok(/import \{ createPictureShell, RECONNECT_LADDER, streamUrl[^}]*\} from '\.\/picture-shell\.js'/.test(read('src/lib/vnc-view.js')) && /import \{ createPictureShell, streamUrl[^}]*\} from '\.\/picture-shell\.js'/.test(read('src/lib/xpra-view.js')), 'both views import the shell');
  ok(/createXpraView\(winInfo\.content/.test(read('src/lib/desktop-app-window.js')) && /r && r\.stream === 'xpra' \? 'xpra' : 'rfb'/.test(read('src/lib/desktop-app-window.js')) && !/iframe/.test(read('src/lib/desktop-app-window.js').replace(/\/\/.*$/gm, '')), 'the desktop-app window picks the view by the record\'s stream KIND and hosts no iframe any more');
  ok(/img\.src = dataUrl/.test(read('src/lib/desktop-app-window.js')) && /app\.wm\.setTitle\(winInfo\.id, /.test(read('src/lib/desktop-app-window.js')), 'the icon reaches the title bar through .src and the title through setTitle (textContent)');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const keys = [...(read('src/lib/xpra-view.js') + read('src/lib/picture-shell.js')).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const missing = keys.filter((k) => !(k in zh) || !(k in ja));
  ok(keys.length >= 20 && missing.length === 0, `every t() key of xpra-view.js + picture-shell.js has zh + ja entries (${keys.length} keys)`, missing);
  ok(!/Press Ctrl\+V to paste into the application/.test(read('src/lib/i18n-zh.js') + read('src/lib/i18n-ja.js') + read('src/lib/xpra-view.js')), 'the retired "Press Ctrl+V" hint is gone (the paste box replaced it) — from the view AND the dictionaries');
  ok(!/hosted xpra client/.test(read('src/lib/i18n-zh.js')) && !/hosted xpra client/.test(read('src/lib/i18n-ja.js')), 'the iframe interim\'s key is gone from the dictionaries');
}


// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
console.log('§late — a worker message delivered after close() is ignored (the 2.369.165 push-gate crash: finish() nulled `worker`, a ready message queued before terminate() then dereferenced null)');
{
  const run = async (mod) => {
    const posted = [];
    class LateWorker { constructor() { setTimeout(() => this.onmessage?.({ data: { c: 'r' } }), 0); } postMessage(m) { posted.push(m); } terminate() { /* a real Worker may still deliver what it queued before this */ } }
    let threw = null; const onUnc = (e) => { threw = e; };
    process.on('uncaughtException', onUnc);
    const c = mod.createXpraClient({ url: 'ws://x/late', workerUrl: '/w', screen: { width: 10, height: 10 }, Worker: LateWorker, decode: async () => ({ close() {} }) });
    c.connect(); c.close();                      // torn down BEFORE the 0 ms ready timer fires
    await new Promise((r) => setTimeout(r, 10));
    process.off('uncaughtException', onUnc);
    return { threw, opened: posted.some((m) => m && m.c === 'o') };
  };
  const shipped = await run(C);
  ok(!shipped.threw && !shipped.opened, `shipped: a ready message after close() neither throws nor opens the socket (${shipped.threw ? shipped.threw.message : 'no throw'}, opened=${shipped.opened})`);
  // NEGATIVE CONTROL: the pre-fix handler — the closure read the shared `worker` binding with no instance guard — in a patched copy
  const src = read('src/lib/xpra-client.js');
  const guard = "      if (worker !== w) return;\n";
  const post = "      if (m.c === 'r') { w.postMessage({ c: 'o', u: url }); return; }";
  ok(src.split(guard).length === 2 && src.split(post).length === 2, 'the instance guard and the bound postMessage are spelled once each (the control removes exactly them)');
  const pre = src.replace(guard, '').replace(post, "      if (m.c === 'r') { worker.postMessage({ c: 'o', u: url }); return; }");
  const Cpre = await import(pathToFileURL(MUTXC.write('src/lib/xpra-client.js', pre, 'late-prefix')).href);
  const control = await run(Cpre);
  ok(!!control.threw && /postMessage/.test(String(control.threw && control.threw.message)), `NEGATIVE CONTROL: the pre-fix handler throws on the late message (${control.threw ? control.threw.message : 'no throw'})`);
}

for (const r of copiesCensus(MUTXC.files, MUTXC.dir, repo, { minCopies: 10 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
