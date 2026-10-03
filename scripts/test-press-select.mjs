#!/usr/bin/env node
// A LONG PRESS ON SELECTABLE TEXT IS A SELECTION, NEVER A MENU (lane mobile-select, 2026-10-02 — the owner, from a
// tester's phone: "手机模式下想要复制一段chatview里的内容会触发右键菜单导致选择了右键菜单的内容，无法正确选择要复制的内容").
// Measured in Chrome's own touch gesture path (390×844 DPR 3, Android UA): +501 ms our synthetic contextmenu opened
// the message menu at the finger; +680 ms the native long press selected the word, then a TRUSTED contextmenu
// (pointerType touch) opened the menu again — the selection sat under it. The fix: src/lib/press-select.js (PURE) +
// utils.js installLongPressContextMenu, THE ONE DOOR of a touch long press.
//   §1 the PURE tables: the press-target class, THE TABLE press target × device ⇒ menu | selection | native, the
//      effective user-select walk (Blink-inherited AND Gecko-auto spellings), the on-glyph test, the selection closer;
//   §2 the REAL door under a fake document + a browser dispatch model + a fake clock: text ⇒ no synthetic menu and a
//      trusted touch contextmenu stopped WITHOUT preventDefault; the gutter / a summary / a button / a user-select:none
//      label ⇒ the menu; text fields ⇒ native; a trusted contextmenu after our synthetic one is swallowed; a mouse
//      right-click never judged;
//   §3 M2 the selection closer (onOutsidePress): a touch selection that starts outside a transient surface closes it;
//      inside / a caret / a form-control anchor / the opening selection / a mouse device / a persistent popup keep it;
//   §4 THE USER-SELECT CENSUS, grep-derived: every opt-in (`user-select` ≠ none) in public/*.css and src/lib/*.js is a
//      row with a reason (an unlisted opt-in, a dead row, an opt-in naming a chrome surface = red); the chrome rule
//      names every surface; the page default stays none;
//   §5 wiring pins (the … button on every element path, the door's two judgements, the copy toast, zh/ja);
//   §6 CONTROLS — patched copies (scripts/mutant-copy.mjs, outside the tree): the pre-lane door (arms on any press) ⇒
//      a menu over the words in the model; a door that preventDefaults the trusted one ⇒ the native selection killed;
//      a class that ignores user-select ⇒ a none label read as text.
// The real-browser proof (a touch long press through Chrome's gesture provider, the … button, the header press, the
// desktop right-click, the computed user-select census on live surfaces) is scripts/test-mobile-select.mjs (heavy).
// Prerequisite: `npm run build` (build-version.js is generated). ~0.3 s.
// Run: node scripts/test-press-select.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first (utils.js imports telemetry-client, which imports it)'); process.exit(1); }
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

const PS = await import('../src/lib/press-select.js');

// ── §1 THE PURE TABLES ──────────────────────────────────────────────────────
console.log('§1 the verdicts (src/lib/press-select.js)');
{
  const CLS = [
    [{ native: true }, 'native'],
    [{ native: true, chrome: true, overText: true, userSelect: 'text' }, 'native'], // precedence: a field wins
    [{ chrome: true, overText: true, userSelect: 'text' }, 'chrome'], // a control's words are still a control
    [{ overText: true, userSelect: 'text' }, 'text'],
    [{ overText: true, userSelect: 'auto' }, 'text'],
    [{ overText: true, userSelect: 'all' }, 'text'],
    [{ overText: true, userSelect: 'contain' }, 'text'],
    [{ overText: true, userSelect: 'none' }, 'chrome'], // a user-select:none label
    [{ overText: true, userSelect: 'NONE' }, 'chrome'],
    [{ overText: false, userSelect: 'text' }, 'chrome'], // the gutter / padding beside a line
    [{}, 'chrome'],
  ];
  const badC = CLS.filter(([f, w]) => PS.pressTargetClass(f) !== w);
  ok(badC.length === 0, `pressTargetClass: ${CLS.length} rows — field > control > glyph-under-finger-and-selectable = text; else chrome (gutter, picture, none label)`, badC.map(([f]) => [f, PS.pressTargetClass(f)]));
  ok(PS.pressTargetClass() === 'chrome', 'pressTargetClass: no facts = chrome (the menu keeps working)');
  // THE TABLE the brief names: press target class × device ⇒ menu | selection
  const TABLE = [
    ['touch', 'text', 'selection'], ['touch', 'chrome', 'menu'], ['touch', 'native', 'native'],
    ['mouse', 'text', 'menu'], ['mouse', 'chrome', 'menu'], ['mouse', 'native', 'menu'], // a right-click is never judged
    ['pen', 'text', 'menu'], [undefined, 'text', 'selection'], ['touch', undefined, 'menu'], ['touch', 'bogus', 'menu'],
  ];
  const badT = TABLE.filter(([d, tg, w]) => PS.longPressVerdict({ device: d, target: tg }) !== w);
  ok(badT.length === 0, `longPressVerdict: ${TABLE.length} rows — touch × text = selection, touch × chrome = menu, touch × field = native, a mouse right-click = menu whatever it lands on`, badT.map(([d, tg]) => [d, tg, PS.longPressVerdict({ device: d, target: tg })]));
  const US = [
    [['text'], 'text'], [['auto', 'auto', 'text', 'none'], 'text'], [['auto', 'none', 'text'], 'none'],
    [['', null, undefined, 'auto'], 'auto'], [[], 'auto'], [null, 'auto'], [[' None '], 'none'], [['all'], 'all'],
  ];
  ok(US.every(([v, w]) => PS.effectiveUserSelect(v) === w), `effectiveUserSelect: ${US.length} rows — the first non-auto value from the element up decides (Blink/WebKit report it inherited, Gecko reports auto: the same answer)`, US.map(([v]) => PS.effectiveUserSelect(v)));
  const S = PS.TEXT_SLOP_PX;
  const line = { left: 10, right: 200, top: 100, bottom: 115 };
  const ON = [
    [[line], 50, 107, true], [[line], 10 - S, 107, true], [[line], 10 - S - 1, 107, false], [[line], 200 + S, 107, true],
    [[line], 201 + S, 107, false], [[line], 50, 115 + S, true], [[line], 50, 116 + S, false],
    [[line, { left: 10, right: 120, top: 121, bottom: 136 }], 150, 128, false], // right of a SHORT last line: the gutter
    [[{ left: 0, right: 0, top: 0, bottom: 0 }], 0, 0, false], [[], 50, 107, false], [[line], NaN, 107, false],
  ];
  ok(S === 6 && ON.every(([r, x, y, w]) => PS.pointOnText(r, x, y) === w), `pointOnText: ${ON.length} rows — within ${S} px of a line fragment (the ~6 px gap between lines counts), right of a short last line does not, empty rects never`, ON.map(([r, x, y]) => PS.pointOnText(r, x, y)));
  const SEL = [
    [{ connected: false, touch: true, collapsed: false, textAnchor: true }, false, true],
    [{ touch: true, collapsed: false, textAnchor: true }, true, false], // THE CASE: a selection starts outside
    [{ touch: false, collapsed: false, textAnchor: true }, false, false],
    [{ touch: true, collapsed: true, textAnchor: true }, false, false],
    [{ touch: true, collapsed: false, textAnchor: false }, false, false], // a form control / copyText's textarea
    [{ touch: true, collapsed: false, textAnchor: true, anchorInRoot: true }, false, false],
    [{ touch: true, collapsed: false, textAnchor: true, sameAsOpen: true }, false, false],
    [{}, false, false],
  ];
  ok(SEL.every(([f, c, r]) => { const v = PS.selectionCloses(f); return v.close === c && v.retire === r; }), `selectionCloses: ${SEL.length} rows — only a touch, non-collapsed, text-anchored selection that starts outside and is not the opening one closes; a removed surface retires`, SEL.map(([f]) => PS.selectionCloses(f)));
  const SS = [
    [{ touching: true, verdict: 'menu', handled: true }, false], // a menu is open: the platform's long press may not also select
    [{ touching: true, verdict: 'menu', handled: false }, true], // nobody took the menu (the file viewer): the platform selects as before
    [{ touching: true, verdict: 'selection', handled: true }, true], [{ touching: true, verdict: 'native', handled: true }, true], [{ touching: true, verdict: null, handled: true }, true],
    [{ touching: false, verdict: 'menu', handled: true }, true], [{}, true],
  ];
  ok(SS.every(([f, w]) => PS.selectStartAllowed(f) === w), `selectStartAllowed: ${SS.length} rows — only a touch DOWN whose verdict is menu AND whose menu an app handler took holds the platform's selection off (measured: Chrome's long press on the role strip selected "Answer" under our menu)`, SS.map(([f]) => PS.selectStartAllowed(f)));
  const TC = [
    [{ touch: false, verdict: 'selection' }, 'pass'], // a mouse right-click: never judged
    [{ touch: true, verdict: 'selection' }, 'stop'], // Android on the words: no handler, never cancelled
    [{ touch: true, verdict: 'menu' }, 'pass'], // a menu press our timer has not fired for: the handlers open it
    [{ touch: true, verdict: 'native' }, 'pass'], // a field / CodeMirror / the terminal: as before
    [{ touch: true, fired: true, handled: true, verdict: 'selection' }, 'swallow'], // ours is open: no second build
    [{ touch: true, fired: true, handled: false }, 'pass'], // nobody took ours: the platform's own menu (save image)
    [{}, 'pass'],
  ];
  ok(TC.every(([f, w]) => PS.trustedContextMenu(f) === w), `trustedContextMenu: ${TC.length} rows — mouse / menu / field pass, touch on text stops (never cancels), after ours was taken swallow, after ours nobody took pass`, TC.map(([f]) => PS.trustedContextMenu(f)));
  ok(PS.NATIVE_PRESS_SELECTOR === 'textarea, input, select, [contenteditable], .xterm', 'NATIVE_PRESS_SELECTOR = the pre-lane exclusion list, verbatim (text fields, the terminal)');
  ok(['button', 'summary', '[role="button"]', '[data-popover]', '.context-menu'].every((s) => PS.PRESS_CHROME_SELECTOR.split(',').map((x) => x.trim()).includes(s)), `PRESS_CHROME_SELECTOR names the controls: ${PS.PRESS_CHROME_SELECTOR}`);
  ok(!/\bimport\b|\brequire\s*\(/.test(read('src/lib/press-select.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'press-select.js is PURE (imports nothing)');
}

// ── a fake DOM + a dispatch model + a fake clock ────────────────────────────
// Elements: name (= tag), classes, attrs, a computed user-select (Gecko-like: own value or auto — the walk must resolve
// it), listeners. Text nodes: data + line rects. document.caretPositionFromPoint answers the leg's text node.
const MATCH = (n, sel) => {
  const s = sel.trim();
  if (s === '[data-popover]') return !!n.attrs['data-popover'];
  if (s === '[contenteditable]') return 'contenteditable' in n.attrs;
  const role = /^\[role="([^"]+)"\]$/.exec(s); if (role) return n.attrs.role === role[1];
  if (s[0] === '.') return n.cls.has(s.slice(1));
  if (s[0] === '#') return n.attrs.id === s.slice(1);
  return n.name === s;
};
class El {
  constructor(name, parent = null, { cls = [], attrs = {}, us = 'auto' } = {}) { this.name = name; this.parent = parent; this.cls = new Set(cls); this.attrs = attrs; this.us = us; this.l = []; this.nodeType = 1; this.attached = true; }
  get parentElement() { return this.parent; }
  get isConnected() { return this.attached && (!this.parent || this.parent.isConnected); }
  contains(t) { for (let n = t; n; n = n.parent || n.parentElement) if (n === this) return true; return false; }
  closest(sel) { const alts = sel.split(','); for (let n = this; n; n = n.parent) if (alts.some((a) => MATCH(n, a))) return n; return null; }
  addEventListener(type, fn) { this.l.push({ type, fn }); }
  dispatchEvent(ev) { synthetic.push(ev); return !dispatch(ev.type, this, { ...ev.init, isTrusted: false }).defaultPrevented; }
  remove() { this.attached = false; }
}
class Text { constructor(parent, data, rects) { this.nodeType = 3; this.data = data; this.parentElement = parent; this.parent = parent; this.rects = rects; } }
let caret = null; // the text node caretPositionFromPoint answers this leg
const synthetic = [];
let selection = null; // { anchorNode, anchorOffset, focusNode, focusOffset, isCollapsed, rangeCount }
const doc = {
  l: [],
  addEventListener(type, fn, opts) {
    const o = typeof opts === 'object' && opts ? opts : { capture: !!opts };
    if (o.signal && o.signal.aborted) return;
    const rec = { type, fn, capture: !!o.capture, passive: !!o.passive };
    this.l.push(rec);
    if (o.signal) o.signal.addEventListener('abort', () => { this.l = this.l.filter((r) => r !== rec); });
  },
  removeEventListener(type, fn, opts) { const cap = typeof opts === 'object' ? !!opts?.capture : !!opts; this.l = this.l.filter((r) => !(r.type === type && r.fn === fn && r.capture === cap)); },
  createElement: (t) => new El(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: null, documentElement: null, hidden: false,
  caretPositionFromPoint: () => (caret ? { offsetNode: caret, offset: 0 } : null),
  createRange: () => { let n = null; return { selectNodeContents(x) { n = x; }, getClientRects() { return n?.rects || []; } }; },
  getSelection: () => selection,
};
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
let touchDevice = true;
globalThis.matchMedia = (q) => ({ matches: /hover:\s*none/.test(q) ? touchDevice : false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = (el) => ({ userSelect: el.us });
globalThis.innerWidth = 390; globalThis.innerHeight = 844;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { protocol: 'https:', host: 'vibe.example', origin: 'https://vibe.example', href: 'https://vibe.example/' };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node', vibrate() {} }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.MouseEvent = class { constructor(type, init) { this.type = type; this.init = init; } };
// THE FAKE CLOCK the door's 500 ms timer runs on (installed only around the door legs)
const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
let now = 0, timers = [];
const fakeSet = (fn, ms = 0) => { const id = { fn, at: now + ms }; timers.push(id); return id; };
const fakeClear = (id) => { timers = timers.filter((x) => x !== id); };
const advance = (ms) => { now += ms; for (;;) { const due = timers.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers = timers.filter((x) => x !== due); due.fn(); } };

function mkEvent(type, target, init = {}) {
  const ev = { type, target, isTrusted: true, pointerType: undefined, clientX: 0, clientY: 0, touches: [], timeStamp: now, ...init, defaultPrevented: false, stopped: false, immediate: false, calls: { preventDefault: 0, stopPropagation: 0, stopImmediatePropagation: 0 }, ran: [] };
  ev.preventDefault = () => { ev.calls.preventDefault++; ev.defaultPrevented = true; };
  ev.stopPropagation = () => { ev.calls.stopPropagation++; ev.stopped = true; };
  ev.stopImmediatePropagation = () => { ev.calls.stopImmediatePropagation++; ev.stopped = true; ev.immediate = true; };
  return ev;
}
/** document CAPTURE listeners (in registration order — stopImmediatePropagation ends the rest) → the target path → document bubble. */
function dispatch(type, target, init) {
  const ev = mkEvent(type, target, init);
  for (const r of [...doc.l]) { if (ev.immediate) break; if (r.type === type && r.capture && doc.l.includes(r)) r.fn(ev); }
  const pth = []; for (let n = target; n; n = n.parent) pth.unshift(n);
  for (const n of pth) { if (ev.stopped) break; for (const r of n.l) if (r.type === type) { ev.ran.push(n.name); r.fn(ev); } }
  if (!ev.stopped) for (const r of [...doc.l]) if (r.type === type && !r.capture && doc.l.includes(r)) r.fn(ev);
  return ev;
}

// The page: body (none) > chat list (text) > message (auto) > content > p (auto) + a summary + a button + a none label;
// a textarea; the terminal. The list's menu handler stands for chat-view's (it opens the menu on any contextmenu).
const body = new El('body', null, { us: 'none' });
const list = new El('div', body, { cls: ['chat-message-list'], us: 'text' });
const msg = new El('div', list, { cls: ['chat-msg', 'chat-msg-assistant'] });
const content = new El('div', msg, { cls: ['chat-compact-content'] });
const para = new El('p', content);
const paraText = new Text(para, 'the quick brown fox', [{ left: 20, right: 370, top: 100, bottom: 115 }, { left: 20, right: 140, top: 121, bottom: 136 }]);
const summary = new El('summary', content);
const summaryText = new Text(summary, 'Output', [{ left: 20, right: 70, top: 200, bottom: 215 }]);
const btnEl = new El('button', content, { cls: ['chat-msg-more'] });
const noneLabel = new El('span', content, { us: 'none' });
const noneText = new Text(noneLabel, 'Sleeping', [{ left: 20, right: 90, top: 260, bottom: 275 }]);
const ta = new El('textarea', body);
const xterm = new El('div', body, { cls: ['xterm'] });
const xtermRow = new El('div', xterm);
const viewer = new El('div', body, { cls: ['file-viewer'], us: 'text' }); // a selectable surface with NO menu handler
const viewerP = new El('p', viewer);
const viewerText = new Text(viewerP, 'some file text', [{ left: 20, right: 120, top: 400, bottom: 415 }]);
let menus = 0;
list.addEventListener('contextmenu', (e) => { e.preventDefault(); menus++; });
const press = (target, x, y, { hold = 600 } = {}) => {
  const ts = dispatch('touchstart', target, { touches: [{ clientX: x, clientY: y }] });
  advance(hold);
  return ts;
};
const lift = (target) => dispatch('touchend', target, { touches: [] });
/** run `fn` with the door from `mod` installed on a clean document (its listeners removed after) */
const withDoor = (mod, fn) => {
  const before = [...doc.l];
  globalThis.setTimeout = fakeSet; globalThis.clearTimeout = fakeClear;
  try { mod.installLongPressContextMenu(); return fn(); } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; timers = []; doc.l = before; }
};
/** one long press as the door sees it: returns {menus opened, synthetic dispatched, touchend prevented} */
const longPress = (target, x, y, node) => { caret = node; menus = 0; synthetic.length = 0; press(target, x, y); const te = lift(target); return { menus, synth: synthetic.length, endPrevented: te.defaultPrevented }; };
/** Android: the platform's own long press — a TRUSTED contextmenu while the finger is down */
const trusted = (target, x, y, node, { ptype = 'touch', down = true, before = 0 } = {}) => {
  caret = node; menus = 0; synthetic.length = 0;
  if (down) dispatch('touchstart', target, { touches: [{ clientX: x, clientY: y }] });
  advance(before);
  const m0 = menus; // only what THIS event's handlers open (a synthetic one before it is counted apart)
  const ev = dispatch('contextmenu', target, { isTrusted: true, pointerType: ptype, clientX: x, clientY: y });
  if (down) lift(target);
  return { ev, menus: menus - m0, before: m0 };
};

const U = await import('../src/lib/utils.js');
const importTime = [...doc.l];

// ── §2 THE REAL DOOR ────────────────────────────────────────────────────────
console.log('§2 installLongPressContextMenu under the dispatch model (the real utils.js)');
const doorLegs = (mod) => withDoor(mod, () => ({
  text: longPress(para, 60, 107, paraText),
  gapBetweenLines: longPress(para, 60, 118, paraText),
  gutter: longPress(para, 300, 128, paraText), // right of the SHORT last line
  summary: longPress(summary, 40, 207, summaryText),
  button: longPress(btnEl, 380, 102, null),
  noneLabel: longPress(noneLabel, 40, 267, noneText),
  textarea: longPress(ta, 10, 10, null),
  terminal: longPress(xtermRow, 10, 10, null),
  trustedText: trusted(para, 60, 107, paraText),
  trustedGutter: trusted(para, 300, 128, paraText, { before: 300 }), // Android's own long press came first (< 500 ms)
  trustedAfterSynthetic: trusted(para, 300, 128, paraText, { before: 600 }), // ours already opened the menu
  mouseOnText: trusted(para, 60, 107, paraText, { ptype: 'mouse', down: false }),
  // the platform's long press FIRST (its selectstart at 300 ms, before our timer): our menu fires right then, the
  // selection is held off, our timer never fires again, the trusted contextmenu after it is swallowed
  platformFirst: (() => { caret = paraText; menus = 0; synthetic.length = 0; dispatch('touchstart', para, { touches: [{ clientX: 300, clientY: 128 }] }); advance(300); const ss = dispatch('selectstart', para, {}); const m1 = menus; advance(400); const cm = dispatch('contextmenu', para, { isTrusted: true, pointerType: 'touch', clientX: 300, clientY: 128 }); const te = lift(para); const lifted = dispatch('selectstart', para, {}); return { ssPrevented: ss.defaultPrevented, menusAtSelectstart: m1, menus, synth: synthetic.length, cm: cm.calls, endPrevented: te.defaultPrevented, lifted: lifted.defaultPrevented }; })(),
  // our timer FIRST (the measured order): the menu at 500 ms, the platform's selectstart after it held off
  timerFirst: (() => { caret = paraText; menus = 0; synthetic.length = 0; dispatch('touchstart', para, { touches: [{ clientX: 300, clientY: 128 }] }); advance(600); const ss = dispatch('selectstart', para, {}); lift(para); return { ssPrevented: ss.defaultPrevented, menus, synth: synthetic.length }; })(),
  // a selectable surface with NO menu (the file viewer), a press beside its words: nobody takes our contextmenu ⇒ the
  // platform's selection AND its own contextmenu go through as before
  noMenuSurface: (() => { caret = viewerText; menus = 0; synthetic.length = 0; dispatch('touchstart', viewerP, { touches: [{ clientX: 200, clientY: 407 }] }); advance(300); const ss = dispatch('selectstart', viewerP, {}); const cm = dispatch('contextmenu', viewerP, { isTrusted: true, pointerType: 'touch', clientX: 200, clientY: 407 }); lift(viewerP); return { ssPrevented: ss.defaultPrevented, synth: synthetic.length, cm: cm.calls }; })(),
  selectstartText: (() => { caret = paraText; dispatch('touchstart', para, { touches: [{ clientX: 60, clientY: 107 }] }); advance(700); const ev = dispatch('selectstart', para, {}); lift(para); return ev.defaultPrevented; })(),
  selectstartScroll: (() => { caret = paraText; dispatch('touchstart', para, { touches: [{ clientX: 300, clientY: 128 }] }); advance(100); dispatch('touchmove', para, { touches: [{ clientX: 300, clientY: 160 }] }); const ev = dispatch('selectstart', para, {}); lift(para); return ev.defaultPrevented; })(),
  trustedField: (() => { caret = null; dispatch('touchstart', ta, { touches: [{ clientX: 10, clientY: 10 }] }); advance(300); const ev = dispatch('contextmenu', ta, { isTrusted: true, pointerType: 'touch', clientX: 10, clientY: 10 }); lift(ta); return ev.calls; })(),
  selectstartMouse: dispatch('selectstart', para, {}).defaultPrevented,
  moved: (() => { caret = null; menus = 0; synthetic.length = 0; dispatch('touchstart', para, { touches: [{ clientX: 300, clientY: 128 }] }); advance(100); dispatch('touchmove', para, { touches: [{ clientX: 330, clientY: 128 }] }); advance(600); lift(para); return { menus, synth: synthetic.length }; })(),
}));
{
  const R = doorLegs(U);
  ok(R.text.synth === 0 && R.text.menus === 0 && !R.text.endPrevented, `a touch long press on the WORDS: no synthetic contextmenu, no menu, touchend not cancelled (the platform's selection stands) — ${JSON.stringify(R.text)}`);
  ok(R.gapBetweenLines.synth === 0 && R.gapBetweenLines.menus === 0, '…between two lines of the paragraph too (within the slop)');
  ok(R.gutter.synth === 1 && R.gutter.menus === 1 && R.gutter.endPrevented, `a long press in the GUTTER (right of a short last line): the synthetic contextmenu opens the menu, the emulated click is cancelled — ${JSON.stringify(R.gutter)}`);
  ok(R.summary.synth === 1 && R.summary.menus === 1, 'a long press on a <summary> toggle (a tool card\'s Output, Thinking): the menu — a control\'s words are a control');
  ok(R.button.synth === 1 && R.button.menus === 1, 'a long press on the … button: the menu');
  ok(R.noneLabel.synth === 1 && R.noneLabel.menus === 1, 'a long press on a user-select:none label (Gecko-style auto on the span, none set on it): the menu');
  ok(R.textarea.synth === 0 && R.terminal.synth === 0, 'a text field and the terminal: never a synthetic menu (native long press — the pre-lane exclusion kept)');
  const tt = R.trustedText;
  ok(tt.menus === 0 && tt.ev.calls.stopImmediatePropagation === 1 && tt.ev.calls.preventDefault === 0 && !tt.ev.defaultPrevented, `Android's TRUSTED touch contextmenu on the words: stopped at the door (no menu handler ran) and NOT cancelled — the selection handles stay (${JSON.stringify(tt.ev.calls)})`);
  const tg = R.trustedGutter;
  ok(tg.menus === 1 && tg.ev.calls.stopImmediatePropagation === 0, 'a trusted touch contextmenu in the gutter before our timer: it reaches the menu handler (the timer is cancelled — one menu)');
  const ta2 = R.trustedAfterSynthetic;
  ok(ta2.before === 1 && ta2.menus === 0 && ta2.ev.calls.preventDefault === 1 && ta2.ev.calls.stopImmediatePropagation === 1, 'a trusted contextmenu AFTER our synthetic one already opened the menu (1 menu): swallowed — no second build (measured: the menu was built twice, ~180 ms apart)');
  const mo = R.mouseOnText;
  ok(mo.menus === 1 && mo.ev.calls.stopImmediatePropagation === 0, 'a MOUSE right-click on the words (no touch down, pointerType mouse): never judged — the handlers run as before');
  ok(R.moved.synth === 0 && R.moved.menus === 0, 'a press that moves > 10 px before 500 ms (a scroll) never fires');
  const pf = R.platformFirst;
  ok(pf.ssPrevented && pf.menusAtSelectstart === 1 && pf.menus === 1 && pf.synth === 1 && pf.cm.preventDefault === 1 && pf.cm.stopImmediatePropagation === 1 && pf.endPrevented && !pf.lifted, `the platform's long press FIRST on a menu press (its selectstart before our 500 ms): our menu opens AT the selectstart, the selection is held off, no second synthetic, the trusted contextmenu swallowed; lifted, selection is free again — ${JSON.stringify(pf)}`);
  const tf = R.timerFirst;
  ok(tf.ssPrevented && tf.menus === 1 && tf.synth === 1, `our timer FIRST (the measured order): the menu at 500 ms, the platform's selectstart after it held off — ${JSON.stringify(tf)}`);
  const nm = R.noMenuSurface;
  ok(!nm.ssPrevented && nm.synth === 1 && nm.cm.preventDefault === 0 && nm.cm.stopImmediatePropagation === 0, `a selectable surface with NO menu (the file viewer), a press beside its words: nobody takes ours ⇒ the platform's selection and its own contextmenu go through (${JSON.stringify(nm)})`);
  ok(R.trustedField.stopImmediatePropagation === 0 && R.trustedField.preventDefault === 0, 'a trusted touch contextmenu on a text field (CodeMirror, a textarea): untouched, as before the lane');
  ok(R.selectstartText === false, 'a TEXT press never touches selectstart (the platform selects)');
  ok(R.selectstartScroll === false && R.selectstartMouse === false, 'a press that became a scroll, and a mouse selection (no touch down): selectstart untouched');
  ok(importTime.filter((r) => r.type === 'contextmenu').length === 0, 'importing utils.js arms nothing on contextmenu (the door is armed only by App on a touch device)');
}

// ── §3 M2: THE SELECTION CLOSER ─────────────────────────────────────────────
console.log('§3 onOutsidePress — a selection that starts outside a menu closes it (touch)');
{
  const pop = new El('div', body, { attrs: { 'data-popover': '1' }, cls: ['context-menu'] });
  const popRow = new El('div', pop); const popText = new Text(popRow, 'Copy text', []);
  const fire = () => { const ev = mkEvent('selectionchange', doc, {}); for (const r of [...doc.l]) if (r.type === 'selectionchange' && doc.l.includes(r)) r.fn(ev); };
  const sel = (anchorNode, { collapsed = false, offset = 2 } = {}) => ({ anchorNode, anchorOffset: 0, focusNode: anchorNode, focusOffset: offset, isCollapsed: collapsed, rangeCount: 1 });
  const leg = (setup, { once = true, selectionOpt, device = true, atOpen = null } = {}) => {
    touchDevice = device; selection = atOpen; pop.attached = true;
    const before = [...doc.l]; let closed = 0;
    const opts = { once }; if (selectionOpt !== undefined) opts.selection = selectionOpt;
    const dispose = U.onOutsidePress(pop, () => { closed++; }, opts);
    const armed = doc.l.filter((r) => !before.includes(r) && r.type === 'selectionchange').length;
    setup(); fire();
    const after = doc.l.filter((r) => !before.includes(r) && r.type === 'selectionchange').length;
    dispose(); doc.l = before; touchDevice = true; selection = null;
    return { closed, armed, after };
  };
  const out = leg(() => { selection = sel(paraText); });
  ok(out.armed === 1 && out.closed === 1 && out.after === 0, `a transient menu on a touch device: a selection that starts in the chat text closes it, and the one-shot listener retires (${JSON.stringify(out)})`);
  ok(leg(() => { selection = sel(popText); }).closed === 0, '…a selection inside the menu keeps it');
  ok(leg(() => { selection = sel(paraText, { collapsed: true, offset: 0 }); }).closed === 0, '…a caret (collapsed) keeps it');
  ok(leg(() => { selection = sel(ta); }).closed === 0, '…a selection anchored on an element (a form control; copyText\'s off-screen textarea) keeps it');
  const s0 = sel(paraText);
  ok(leg(() => { selection = s0; }, { atOpen: s0 }).closed === 0, '…the selection that existed when the menu opened (the word the opening press selected) keeps it');
  const mouse = leg(() => { selection = sel(paraText); }, { device: false });
  ok(mouse.armed === 0 && mouse.closed === 0, '…a MOUSE device arms no selection listener at all (desktop unchanged)');
  const persistent = leg(() => { selection = sel(paraText); }, { once: false });
  ok(persistent.armed === 0 && persistent.closed === 0, '…a PERSISTENT popup (once:false — armed for the app\'s life) is not judged by default');
  const optIn = leg(() => { selection = sel(paraText); }, { once: false, selectionOpt: true });
  ok(optIn.armed === 1 && optIn.closed === 1, '…unless it opts in (selection: true)');
  const gone = leg(() => { pop.attached = false; selection = sel(paraText); });
  ok(gone.closed === 0 && gone.after === 0, '…a menu already removed: the listener retires without calling close');
  // attachPopoverClose (createPopover / showContextMenu / hand-built menus) gets it by default
  touchDevice = true; const before = [...doc.l];
  U.attachPopoverClose(pop);
  ok(doc.l.some((r) => !before.includes(r) && r.type === 'selectionchange'), 'attachPopoverClose (every createPopover / showContextMenu / hand-built menu) arms the selection closer on touch');
  doc.l = before;
}

// ── §4 THE USER-SELECT CENSUS ───────────────────────────────────────────────
console.log('§4 the user-select census (grep-derived over public/*.css and src/lib/*.js)');
// Every place text is made selectable again under the page's `none`. CONTENT only — what a person reads and copies.
// A new opt-in without a row is red; so is a row nothing declares; so is a row that names a chrome surface.
const OPT_INS = {
  '.chat-message-list': 'the chat transcript — the surface this lane is about',
  '.chanmsg-body': 'a channel / agent-group message\'s words (lane group-chat-ui B-ff04: selectable and copyable; on a touch-first device too — a long press selects, the message\'s … button opens its menu: lane channel-touch-menu, 2.369.203, §7)',
  '.chat-permission-cmd, .chat-helper-ask-cmd': 'the command a permission card asks about (copied to check it)',
  '.ut-text, .ut-detail, .ut-hist-msg': 'For-you item text and history (agent-written words a person copies)',
  '.iw-title': 'the For-you window\'s item title',
  '.ut-app-dline': 'an app install card\'s Details lines — the plan\'s facts and commands a person copies to check (design 009, lane apps-one-card; classified at the 2.369.203 integration)',
  '.chanmsg-facts-details': 'a message\'s facts (To / Cc / Bcc, sender, list, subject…) — addresses a person copies (lane message-facts B-f066; classified at the 2.369.203 integration)',
  '.iw-detail': 'the For-you window\'s item body',
  '.iw-replied': 'the reply a person already sent, shown under the item',
  '.integ-cb-url': 'the OAuth callback URL a person pastes into a vendor console (all: one tap selects it whole)',
  '.prc-cmdline': 'a process command line in the System panel',
  '.ut-exit-cmd': 'the exit-run command above Allow (verify-r4 F4: the whole command, read before allowing)',
  '.iw-exit-cmd': 'the same command in the For-you window',
  '.chat-exit-out, .chat-exit-out-all': 'a command\'s output on its exit-run chat card (lane exit-run-output — read and copied; joined at the 2.369.200 integration)',
  '.exit-runs-pre': 'a command\'s output in the machine\'s Commands… list (lane exit-run-output; joined at the 2.369.200 integration)',
  '.chat-exit-cmd': 'the command itself on its exit-run chat card, folded at four lines (lane exit-see-whole — read and copied)',
  '.exit-runs-cmd-all': 'the whole command in a row of the machine\'s Commands… list, beside Copy (lane exit-see-whole)',
  '.ut-proposal-plan': 'what Approve runs, line for line (lane browser-propose)',
  '.file-viewer': 'a file\'s text in the viewer',
  '.file-viewer-table': 'a CSV / spreadsheet table in the viewer',
  '.pptx-viewer': 'slide text in the viewer',
  '.markdown-preview': 'rendered markdown in the viewer',
  '.archive-list': 'an archive\'s file list',
  '.docx-wrapper, .docx-wrapper *': 'a Word document\'s pages (docx-viewer.js shadow-root CSS)',
  'file-explorer-ops: properties value': 'a value in the file Properties dialog',
  'incident-recorder: report id': 'the incident id a person reads out (all)',
  'session-lifecycle: error panel': 'a failed window\'s error text',
  'sidebar-mounts: dav url': 'a WebDAV URL a person pastes elsewhere (all)',
};
const CHROME_TOKENS = ['context-menu', 'popover', 'toast', 'overlap-switcher', 'chooser', 'tab-item', 'msg-meta-pop', 'dropdown', 'menu'];
const files = execFileSync('git', ['ls-files', 'public/*.css', 'src/lib/*.js'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
const found = []; // { where, selector, value }
for (const f of files) {
  const src = read(f);
  if (f.endsWith('.css')) {
    const css = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /([^{}]+)\{([^{}]*)\}/g; let m;
    while ((m = re.exec(css))) {
      for (const d of m[2].matchAll(/(?:^|;)\s*(?:-webkit-)?user-select\s*:\s*([a-z-]+)/g)) {
        if (d[1] !== 'none') found.push({ where: f, selector: m[1].trim().replace(/\s+/g, ' '), value: d[1] });
      }
    }
  } else {
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      for (const d of ln.matchAll(/(?:-webkit-)?user-select\s*:\s*([a-z-]+)/g)) {
        if (d[1] === 'none') continue;
        const sel = /\.docx-wrapper/.test(ln) ? '.docx-wrapper, .docx-wrapper *'
          : f.endsWith('file-explorer-ops.js') ? 'file-explorer-ops: properties value'
            : f.endsWith('incident-recorder.js') ? 'incident-recorder: report id'
              : f.endsWith('session-lifecycle.js') ? 'session-lifecycle: error panel'
                : f.endsWith('sidebar-mounts.js') ? 'sidebar-mounts: dav url' : `${f}:${i + 1}`;
        found.push({ where: `${f}:${i + 1}`, selector: sel, value: d[1] });
      }
    });
  }
}
const keyOf = (s) => s;
const unlisted = found.filter((x) => !OPT_INS[keyOf(x.selector)]);
ok(found.length >= 15 && unlisted.length === 0, `every user-select opt-in is a census row with a reason (${found.length} declarations; unlisted: ${JSON.stringify(unlisted.map((x) => `${x.where} ${x.selector}: ${x.value}`))})`);
const used = new Set(found.map((x) => keyOf(x.selector)));
const dead = Object.keys(OPT_INS).filter((k) => !used.has(k));
ok(dead.length === 0, `no dead row (a row nothing declares any more): ${JSON.stringify(dead)}`);
const chromeOpt = found.filter((x) => CHROME_TOKENS.some((tk) => x.selector.toLowerCase().includes(tk)));
ok(chromeOpt.length === 0, `no opt-in names a chrome surface (${CHROME_TOKENS.join(' / ')}): ${JSON.stringify(chromeOpt)}`);
{
  const style = read('public/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /([^{}]*\[data-popover\][^{}]*)\{\s*user-select:\s*none;\s*\}/.exec(style);
  const sels = m ? m[1].split(',').map((s) => s.trim()) : [];
  const want = ['[data-popover]', '.context-menu', '#global-toasts', '.global-toast', '.overlap-switcher', '.tab-item', '.chat-msg-more', '.chanmsg-tmore'];
  ok(want.every((s) => sels.includes(s)), `the chrome rule says user-select:none ITSELF for every surface (menus, popovers, toasts, the taskbar chooser, tab chips, the … button): ${JSON.stringify(sels)}`);
  ok(/html, body \{[^}]*user-select: none;/.test(style), 'the page default stays none (content opts in)');
  ok(!/-webkit-user-select:\s*none/.test(m ? m[0] : ''), 'the chrome rule is unprefixed like the page rule (an inherited -webkit- none breaks typing in a field on older iOS)');
}

// ── §5 WIRING PINS ──────────────────────────────────────────────────────────
console.log('§5 wiring pins');
{
  const utils = read('src/lib/utils.js'), rend = read('src/lib/chat-renderers.js'), view = read('src/lib/chat-view.js'), seek = read('src/lib/chat-view-seek.js');
  const door = utils.slice(utils.indexOf('export function installLongPressContextMenu'), utils.indexOf('export function anchorFixedPopup'));
  ok(/if \(!selectStartAllowed\(\{ touching, verdict, handled \}\)\) e\.preventDefault\(\);/.test(door) && /document\.addEventListener\('selectstart'/.test(door), 'the door holds the platform\'s selection off for a TAKEN menu press (selectstart, through selectStartAllowed)');
  ok(/const act = trustedContextMenu\(\{ touch, fired, handled, verdict:/.test(door), 'the trusted contextmenu is decided by ONE table (trustedContextMenu)');
  ok(door.split('touchPressVerdict(').length === 3, 'the door judges twice through ONE verdict: touchstart (arm the timer only on a menu press) and the trusted contextmenu');
  ok(/verdict = touchPressVerdict\(target, sx, sy\);\n\s*if \(verdict !== 'menu'\) return;/.test(door) && /else if \(act === 'stop'\) e\.stopImmediatePropagation\(\);/.test(door), 'the timer arms only on a menu press; a trusted touch contextmenu on text is stopped (never cancelled)');
  ok(!/'textarea, input, select, \[contenteditable\], \.xterm'/.test(utils), 'the native exclusion list lives in press-select.js only (NATIVE_PRESS_SELECTOR), never re-spelled in utils.js');
  ok(/this\.addMsgMoreBtn\(el\);/.test(rend.slice(rend.indexOf('  addOpenInEditorBtn(el) {'), rend.indexOf('  addOpenInEditorBtn(el) {') + 900)), 'addOpenInEditorBtn adds the … button — every element path calls it');
  const paths = (view.match(/this\._renderers\.addOpenInEditorBtn\(/g) || []).length + (seek.match(/this\._renderers\.addOpenInEditorBtn\(/g) || []).length;
  ok(paths >= 3, `…and the element paths call it: create, swap, gap slab (${paths} sites)`);
  ok(/onMsgMenu: \(msg, x, y\) => this\._showMsgMenu\(msg, x, y\)/.test(view), 'the view hands the renderers its touch menu (onMsgMenu → _showMsgMenu)');
  ok(/if \(!this\._onMsgMenu \|\| !this\.app\?\.isTouch \|\| !el\?\._rawMsg\) return;/.test(rend), 'the … button exists on touch clients only, for a message the menu can name');
  ok(/insertBefore\(btn, host\.firstChild\)/.test(rend) && /\.chat-msg-more \{[^}]*float: right;/.test(read('public/chat.css')), 'the … button is FLOATED as the content\'s first child (the words wrap around it, never under it)');
  ok(/t\('Copied the whole message \(\{n\} lines\)', \{ n: lines \}\)/.test(view) && /t\('Copied the whole message \(1 line\)'\)/.test(view), 'M3: the touch menu\'s Copy text toast names what landed on the clipboard (the whole message, its lines)');
  // verify r1 (2026-10-02): three layouts the lane's one fixture (compact, paragraph-first) never met
  const chatCss = read('public/chat.css');
  ok(/\.chat-msg:has\(\.chat-msg-more\) :is\(\.chat-pre-wrap, \.chat-table-wrap\) \{ clear: right; \}/.test(chatCss), 'verify r1 F1: a code block / table in a message with the … button clears the float (a BFC beside it was narrowed to its last line and its toolbar painted over the button)');
  ok(/if \(first && first\.nodeType === 1 && \/\^\(P\|H\[1-6\]\)\$\/\.test\(first\.tagName\)\) host = first;/.test(rend) && /if \(el\.querySelector\('\.chat-msg-more'\)\) return;/.test(rend), 'verify r1 F2: in bubble mode the button goes into the first inline-content block (the shrink-to-fit bubble measured max(float, words), never their sum — short messages sat under it); one button per message');
  ok(/@media \(hover: none\) and \(pointer: coarse\) \{ \.chat-msg > \.chat-open-editor-btn, \.chat-msg > \.chat-fork-btn \{ display: none; \} \}/.test(chatCss), 'verify r1 F3: the hover buttons are hidden on EVERY touch client (app.isTouch\'s media query), not only ≤ 768 px — an invisible one covered the … on a touch tablet');
  for (const lang of ['zh', 'ja']) {
    const d = read(`src/lib/i18n-${lang}.js`);
    ok(['Message actions', 'Copied the whole message (1 line)', 'Copied the whole message ({n} lines)'].every((k) => d.includes(JSON.stringify(k) + ':')), `i18n-${lang} carries the three new strings`);
  }
}

// ── §6 CONTROLS ─────────────────────────────────────────────────────────────
console.log('§6 controls — patched copies (outside the tree)');
const M = mutantCopies('msel', repo);
{
  const src = read('src/lib/utils.js');
  const ARM = "    if (verdict !== 'menu') return;\n";
  const TRUST = "    else if (act === 'stop') e.stopImmediatePropagation();";
  ok(src.split(ARM).length === 2 && src.split(TRUST).length === 2, 'the two edits the door controls make are each spelled exactly once in utils.js');
  // (a) THE PRE-LANE DOOR: it arms on any press (only the native list excluded) — the incident in the model
  const preF = M.write('src/lib/utils.js', src.replace(ARM, "    if (target.closest?.(NATIVE_PRESS_SELECTOR)) return;\n"), 'pre-lane-arm');
  const UP = await import(pathToFileURL(preF).href);
  const Rp = withDoor(UP, () => longPress(para, 60, 107, paraText));
  const Rr = withDoor(U, () => longPress(para, 60, 107, paraText));
  ok(Rp.synth === 1 && Rp.menus === 1 && Rr.synth === 0 && Rr.menus === 0, `CONTROL (the pre-lane door, arming on every press): a long press on the WORDS opens the menu over them — the tester's report, in the model (${JSON.stringify(Rp)}); the real door opens none`);
  // (b) a door that CANCELS the trusted one (the chat handler's old preventDefault): the native selection is killed
  const pdF = M.write('src/lib/utils.js', src.replace(TRUST, "    else if (act === 'stop') { e.preventDefault(); e.stopImmediatePropagation(); }"), 'cancel-trusted');
  const UC = await import(pathToFileURL(pdF).href);
  const Tc = withDoor(UC, () => trusted(para, 60, 107, paraText));
  const Tr = withDoor(U, () => trusted(para, 60, 107, paraText));
  ok(Tc.ev.defaultPrevented && !Tr.ev.defaultPrevented, 'CONTROL (a door that cancels the trusted contextmenu): the event is cancelled — on Android no selection handles; the real door leaves it uncancelled');
  // (c) a class that ignores user-select: a none label's words read as text (no menu where there is nothing to select)
  const ps = read('src/lib/press-select.js');
  const CLS = "  if (overText && String(userSelect || 'auto').toLowerCase() !== 'none') return 'text';\n";
  ok(ps.split(CLS).length === 2, 'the class rule the third control edits is spelled exactly once');
  const clsF = M.write('src/lib/press-select.js', ps.replace(CLS, "  if (overText) return 'text';\n"), 'no-user-select');
  const PM = await import(pathToFileURL(clsF).href);
  ok(PM.pressTargetClass({ overText: true, userSelect: 'none' }) === 'text' && PS.pressTargetClass({ overText: true, userSelect: 'none' }) === 'chrome', 'CONTROL (a class that ignores user-select): a user-select:none label reads as text — its menu would be lost; the real class keeps it chrome');
  for (const row of copiesCensus(M.files, M.dir, repo, { label: 'mutant copies: ' })) ok(row.pass, row.name, row.detail);
}

// ── §7 THE CHANNEL MESSAGE ON A TOUCH-FIRST DEVICE (lane channel-touch-menu, 2.369.203). The .202 transition made a
//    channel body user-select:none under (hover: none) and (pointer: coarse) — the long-press menu was the phone's only
//    door to the message bar. The chat's shape now: the words selectable, a … button opens THE same menu.
console.log('§7 the channel message on a touch-first device (lane channel-touch-menu)');
{
  const MB = await import('../src/lib/msg-bar-model.js');
  const rows = [
    [['react', 'thread', 'quote'], 'hi', ['react', 'thread', 'quote', 'copy']],
    [['react'], '  ', ['react']],
    [[], 'words', ['copy']],
    [[], '', []],
    [['more'], 'x', ['more', 'copy']],
    [['react', 'bogus'], 'x', ['react', 'copy']],
  ];
  for (const [ids, text, want] of rows) ok(JSON.stringify(MB.msgMenuActions(ids, { text })) === JSON.stringify(want), `msgMenuActions(${JSON.stringify(ids)}, ${JSON.stringify(text)}) = ${JSON.stringify(want)}`, MB.msgMenuActions(ids, { text }));
  ok(!MB.MSG_ACTIONS.includes('copy'), 'the BAR\'s vocabulary has no copy (desktop hover unchanged) — Copy text is the menu\'s');
  ok(MB.TOUCH_QUERY === '(hover: none) and (pointer: coarse)', 'the touch-first query is the bar\'s own CSS query');
  // THE CSS CENSUS: no rule makes a channel body unselectable (the transition), the … is drawn only under the query
  const census = (css) => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const none = [...flat.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((m) => /\.chanmsg-body\b/.test(m[1]) && /user-select:\s*none/.test(m[2])).map((m) => m[1].trim());
    const media = [...flat.matchAll(/@media\s*\(hover: none\) and \(pointer: coarse\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((m) => m[1]).join('\n');
    const shown = /\.chanmsg-tmore \{[^}]*width: 44px; height: 44px;[^}]*display: flex;/.test(media) && /\.chanmsg:has\(> \.chanmsg-tmore\) \{ padding-right: 44px; \}/.test(media);
    const hidden = /(^|\n)\.chanmsg-tmore \{ display: none; \}/.test(flat);
    return { none, shown, hidden };
  };
  const style = read('public/style.css');
  const c = census(style);
  ok(c.none.length === 0, 'no rule makes a channel message body user-select:none (the .202 transition is gone: a long press on the words is a selection)', c.none);
  ok(c.shown && c.hidden, 'the … button: hidden by default, drawn (a 44 × 44 box in a 44 px right gutter) only under (hover: none) and (pointer: coarse)', c);
  // the wiring: created only on a touch-first device, the same menu as the long press / the right click
  const cw = read('src/lib/channel-window.js'), mb = read('src/lib/channel-msg-bar.js');
  ok(/row\._menu = \(\) => menuActs\(row\._acts\(\), rec\);/.test(cw) && /if \(isTouchFirst\(\) && row\._menu\(\)\.length\) row\.appendChild\(renderMsgMore\(/.test(cw), 'renderRecord: the row\'s menu = the bar\'s actions + Copy text; a … button opens it on a touch-first device');
  ok(/const acts = row\._menu \? row\._menu\(\) : row\._acts\(\);/.test(cw), 'the long press on the chrome / a right click opens the SAME menu (Copy text included)');
  ok(/if \(isTouchFirst\(\)\) row\.appendChild\(renderMsgMore\(null, 'chanmsg-more'\)\);/.test(cw), 'the agent-group row: the touch … is a `.chanmsg-more` (the list\'s delegated menu: Copy text · Clear content…)');
  ok(/export const isTouchFirst = \(\) => !!\(typeof matchMedia === 'function' && matchMedia\(TOUCH_QUERY\)\.matches\);/.test(mb) && /b\.appendChild\(icon\('more', 16\)\);/.test(mb) && /b\.setAttribute\('aria-label', t\('Message actions'\)\);/.test(mb), 'renderMsgMore: the library SVG, named, created only when the touch-first query matches');
  // CONTROL: the transition's rule back ⇒ the census is red
  const TRANSITION = '@media (hover: none) and (pointer: coarse) { .chanmsg-body { -webkit-user-select: none; user-select: none; cursor: default; } }';
  const anchor = '.chanmsg-body { font-size: 13px;';
  ok(style.includes(anchor), 'the control\'s anchor (the body rule) is in style.css');
  const back = census(style.replace(anchor, TRANSITION + '\n' + anchor));
  ok(back.none.length === 1, 'CONTROL (the .202 transition\'s rule back): the census names it — red', back.none);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
