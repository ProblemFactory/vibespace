#!/usr/bin/env node
// A WINDOW'S OWN MINIMUM SIZE (2.369.158, docs/design-desktop-apps.zh.md §7.6; the owner, 2026-09-23,
// GNOME Calculator on the xpra rung with its keypad cut off: "if the inner window has a minimum height,
// the OUTER window's resize must be limited to that height"). Fast, no browser:
//   §1 the PURE rule (src/lib/window-min-size.js): the floor, the drag clamp that keeps the opposite
//      edge fixed, raise-to-min, the window minimum from a content minimum + chrome under the UI scale;
//   §2 the REAL WindowManager methods over a fake DOM (the test-hidden-view-suspend pattern):
//      setMinSize raises an open window and pins the inline min (the terminal's rule: a CSS min that
//      every sizing path honours), the resize DRAG stops at the minimum from every edge — with a
//      PATCHED COPY of window.js carrying the pre-fix drag (`Math.max(320, …)`) as the failing control;
//   §3 wiring pins: the drag and setMinSize use the PURE rule, the phone layout forces min 0
//      !important (the window IS the screen there — the picture scales instead), desktop-app-window
//      turns the view's onMinSize into setMinSize through windowMinForPane.
// Prerequisite: `npm run build`. Run: node scripts/test-window-minsize.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }

// a fake DOM just wide enough for window.js's import graph and its resize handles
const docListeners = {};
globalThis.document = {
  createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, append() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {}, classList: { add() {}, remove() {}, contains: () => false } }, documentElement: { style: {}, classList: { add() {}, remove() {} } },
  addEventListener: (k, fn) => { (docListeners[k] ||= []).push(fn); }, removeEventListener: (k, fn) => { docListeners[k] = (docListeners[k] || []).filter((f) => f !== fn); },
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const fireDoc = (k, ev) => { for (const fn of [...(docListeners[k] || [])]) fn(ev); };

const MS = await import('../src/lib/window-min-size.js');

console.log('§1 the PURE rule (src/lib/window-min-size.js)');
{
  ok(same(MS.WINDOW_FLOOR, { w: 320, h: 180 }) && /\.window \{[^}]*min-width: 320px; min-height: 180px;/.test(read('public/style.css')), 'the floor IS the .window CSS minimum (320×180 — the rule the terminal lives by)');
  ok(same(MS.minOf({}), { w: 320, h: 180 }) && same(MS.minOf({ minWidth: 100, minHeight: 90 }), { w: 320, h: 180 }) && same(MS.minOf({ minWidth: 402.2, minHeight: 700 }), { w: 403, h: 700 }), 'minOf: a window\'s own minimum, never below the floor, whole px up');
  const min = { w: 400, h: 700 };
  ok(same(MS.clampToMin({ left: 100, top: 50, width: 300, height: 500 }, 'se', min), { left: 100, top: 50, width: 400, height: 700 }), 'an se drag past the minimum stops there (the top-left stays)');
  ok(same(MS.clampToMin({ left: 250, top: 250, width: 250, height: 500 }, 'nw', min), { left: 100, top: 50, width: 400, height: 700 }), 'an nw drag past the minimum: the RIGHT and BOTTOM edges stay where they were (right 500, bottom 750) — the window never slides');
  ok(same(MS.clampToMin({ left: 10, top: 10, width: 800, height: 900 }, 'se', min), { left: 10, top: 10, width: 800, height: 900 }), 'a size above the minimum is untouched');
  ok(same(MS.raiseToMin({ width: 380, height: 600 }, min), { width: 400, height: 700, raised: true }) && MS.raiseToMin({ width: 900, height: 800 }, min).raised === false, 'raiseToMin: a restored / open size below the minimum is raised to it');
  ok(same(MS.windowMinForPane({ w: 360, h: 616 }, { w: 2, h: 60 }, 1), { w: 362, h: 676 }), 'windowMinForPane: the app\'s 360×616 pane + the window\'s own chrome (title bar + status strip + borders, 2×60) = 362×676');
  ok(same(MS.windowMinForPane({ w: 360, h: 616 }, { w: 2, h: 60 }, 1.25), { w: 290, h: 541 }), 'under UI scale 1.25 the chrome + pane are VIEWPORT px ⇒ ÷ 1.25 = layout px (290×541; minOf then applies the floor)');
  ok(MS.windowMinForPane(null, { w: 2, h: 60 }, 1) === null && MS.windowMinForPane({ w: 0, h: 10 }, {}, 1) === null, 'no content minimum ⇒ no window minimum of its own');
  // r2 (the verifier: a DPR-1 takeover of a 2x calculator asked for a 742x1299 window on an 815 px workspace)
  ok(same(MS.minOf({ minWidth: 742, minHeight: 1299 }, { w: 1356, h: 815 }), { w: 742, h: 815 }) && same(MS.minOf({ minWidth: 742, minHeight: 1299 }, { w: 1356.6, h: 815.4 }), { w: 742, h: 815 }), 'minOf(win, workspace): a minimum TALLER than the workspace is capped at the workspace (whole px down) — the content then scales');
  ok(same(MS.minOf({ minWidth: 742, minHeight: 1299 }, { w: 200, h: 100 }), { w: 320, h: 180 }) && same(MS.minOf({ minWidth: 742, minHeight: 1299 }), { w: 742, h: 1299 }) && same(MS.minOf({ minWidth: 742, minHeight: 1299 }, { w: 0, h: 0 }), { w: 742, h: 1299 }), '…never below the .window floor (a tiny workspace), and no cap without a laid-out workspace');
  ok(same(MS.keepInside({ left: 70, top: 70, width: 742, height: 815 }, { w: 1356, h: 815 }), { left: 70, top: 0, width: 742, height: 815, moved: true }) && MS.keepInside({ left: 10, top: 10, width: 400, height: 300 }, { w: 1356, h: 815 }).moved === false, 'keepInside: a window raised past the workspace edge slides up/left just enough (never resized); one inside is untouched');
}

console.log('§2 the REAL WindowManager methods over a fake DOM');
const mkEl = (w, h, l = 100, t = 100) => {
  const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => ({ dataset: { dir }, _l: {}, addEventListener(k, fn) { this._l[k] = fn; } }));
  const el = { style: { width: `${w}px`, height: `${h}px`, left: `${l}px`, top: `${t}px` }, handles, querySelectorAll: (sel) => (sel === '.resize-handle' ? handles : []), classList: { add() {}, remove() {}, contains: () => false } };
  for (const [k, v] of [['offsetWidth', 'width'], ['offsetHeight', 'height'], ['offsetLeft', 'left'], ['offsetTop', 'top']]) Object.defineProperty(el, k, { configurable: true, get: () => Math.max(parseFloat(el.style[v]) || 0, k === 'offsetWidth' ? parseFloat(el.style.minWidth) || 0 : k === 'offsetHeight' ? parseFloat(el.style.minHeight) || 0 : -1e9) });
  return el;
};
const mkWm = (WM) => {
  const wm = Object.create(WM.prototype);
  Object.assign(wm, { windows: new Map(), grid: null, workspace: { offsetWidth: 1600, offsetHeight: 1000 }, _hideMq: { matches: false }, _notify() { wm.notified = (wm.notified || 0) + 1; }, _scheduleOverlapUpdate() {}, _captureGridBounds() {}, _syncChainBounds() {} });
  return wm;
};
const drag = async (wm, win, dir, dx, dy) => {
  const h = win.element.handles.find((x) => x.dataset.dir === dir);
  h._l.mousedown({ clientX: 500, clientY: 500, stopPropagation() {}, preventDefault() {} });
  fireDoc('mousemove', { clientX: 500 + dx, clientY: 500 + dy, altKey: false });
  await sleep(5);
  fireDoc('mouseup', {});
  const s = win.element.style;
  return { left: parseFloat(s.left), top: parseFloat(s.top), width: parseFloat(s.width), height: parseFloat(s.height) };
};
const run = async (WM, label) => {
  const wm = mkWm(WM);
  const win = { id: 'w1', element: mkEl(900, 800, 100, 100), onResize() { win.resized = (win.resized || 0) + 1; }, gridBounds: null, _tabChain: null, isMaximized: false };
  wm.windows.set('w1', win);
  wm._setupResize(win);
  if (typeof wm.setMinSize === 'function') wm.setMinSize('w1', { w: 402, h: 700 }); else { win.minWidth = 402; win.minHeight = 700; }
  const se = await drag(wm, win, 'se', -800, -700);
  win.element.style.width = '900px'; win.element.style.height = '800px'; win.element.style.left = '100px'; win.element.style.top = '100px';
  const nw = await drag(wm, win, 'nw', 800, 700);
  return { wm, win, se, nw, label };
};
{
  const { WindowManager } = await import('../src/lib/window.js');
  const A = await run(WindowManager, 'shipped');
  ok(A.win.element.style.minWidth === '402px' && A.win.element.style.minHeight === '700px' && A.win.minWidth === 402 && A.win.minHeight === 700, 'setMinSize pins the minimum on the window (winInfo.minWidth/minHeight) AND as the inline min-width/min-height — the one rule every sizing path honours (snap, grid cells, presets, maximize, layout restore)');
  ok(same(A.se, { left: 100, top: 100, width: 402, height: 700 }), `a resize drag from the SE corner 800 px past it STOPS at the minimum — the cursor overshoots, the window does not (${JSON.stringify(A.se)})`);
  ok(same(A.nw, { left: 598, top: 200, width: 402, height: 700 }), `from the NW corner the right/bottom edges stay put (right 1000, bottom 900) and the size stops at 402×700 (${JSON.stringify(A.nw)})`);
  // an OPEN window below a new minimum is raised now
  const wm = mkWm(WindowManager);
  const w2 = { id: 'w2', element: mkEl(500, 400, 20, 30), onResize() { w2.r = (w2.r || 0) + 1; }, gridBounds: { left: 0, top: 0, width: 0.3, height: 0.4 }, _tabChain: null, isMaximized: false };
  wm.windows.set('w2', w2);
  let captured = 0; wm._captureGridBounds = () => { captured++; };
  wm.setMinSize('w2', { w: 640, h: 700 });
  ok(w2.element.style.width === '640px' && w2.element.style.height === '700px' && w2.element.style.left === '20px' && w2.r === 1 && captured === 1 && wm.notified === 1, 'a new minimum above an OPEN window raises it now (its top-left kept), re-captures its grid bounds and saves the layout');
  wm.setMinSize('w2', { w: 640, h: 700 });
  ok(w2.r === 1 && wm.notified === 1, 'the same minimum again is a no-op (no resize storm from a re-announced constraint)');
  wm.setMinSize('w2', null);
  ok(w2.element.style.minWidth === '' && w2.minWidth === null && same(MS.minOf(w2), MS.WINDOW_FLOOR), 'null clears the minimum (back to the .window floor)');
  // a MINIMIZED window (display:none ⇒ offset 0) is judged by its inline size, never shrunk to the minimum from a zero reading
  const w4 = { id: 'w4', element: mkEl(900, 800, 0, 0), onResize() { w4.r = 1; }, gridBounds: null, _tabChain: null, isMaximized: false, isMinimized: true };
  Object.defineProperty(w4.element, 'offsetWidth', { get: () => 0 }); Object.defineProperty(w4.element, 'offsetHeight', { get: () => 0 });
  wm.windows.set('w4', w4);
  wm.setMinSize('w4', { w: 402, h: 700 });
  ok(w4.element.style.width === '900px' && w4.element.style.height === '800px' && !w4.r, 'a minimized window (offset 0) keeps its 900×800 — a zero measurement never "raises" (shrinks) it');
  // r2: a minimum the WORKSPACE cannot hold is capped at it — the window fills the workspace height, slid up, and the drag stops there
  const wmW = mkWm(WindowManager); wmW.workspace = { offsetWidth: 1356, offsetHeight: 815 };
  const w5 = { id: 'w5', element: mkEl(900, 600, 70, 70), onResize() {}, gridBounds: null, _tabChain: null, isMaximized: false };
  wmW.windows.set('w5', w5); wmW._setupResize(w5);
  wmW.setMinSize('w5', { w: 742, h: 1299 });
  const s5 = w5.element.style;
  ok(w5.minHeight === 1299 && s5.minHeight === '815px' && s5.minWidth === '742px' && s5.height === '815px' && s5.top === '0px' && s5.width === '900px', `a DPR-1 takeover of a 2x app (minimum 742×1299 on an 815 px workspace): the window's minimum is CAPPED at the workspace (${s5.minWidth} × ${s5.minHeight}) and the window raised to ${s5.width} × ${s5.height} at top ${s5.top} — on screen, never hanging past it (the app's own minimum stays on the record: ${w5.minWidth}×${w5.minHeight})`);
  const d5 = await drag(wmW, w5, 'se', -900, -900);
  ok(d5.width === 742 && d5.height === 815, `…the drag stops at the capped minimum (${d5.width}×${d5.height})`, d5);
  wmW.workspace = { offsetWidth: 1600, offsetHeight: 1400 };
  wmW._reflowWindows();
  ok(s5.minHeight === '1299px' && s5.height === '1299px', `a workspace that grows (the browser window, a monitor) gives the full minimum back on the reflow (${s5.minHeight}, height ${s5.height})`);
  const wmP = mkWm(WindowManager); wmP._hideMq = { matches: true };
  const w3 = { id: 'w3', element: mkEl(390, 700, 0, 0), onResize() { w3.r = 1; }, gridBounds: null, _tabChain: null, isMaximized: false };
  wmP.windows.set('w3', w3);
  wmP.setMinSize('w3', { w: 402, h: 900 });
  ok(w3.element.style.width === '390px' && !w3.r, 'on the ≤768 px phone layout nothing is raised (the window IS the screen; the view scales the picture instead)');

  // CONTROL: a patched copy of window.js with the pre-fix drag (the .window floor only)
  const src = read('src/lib/window.js');
  const lines = [
    ["          if (dir.includes('e')) newW = Math.max(min.w, sW + dx);", "          if (dir.includes('e')) newW = Math.max(320, sW + dx);"],
    ["          if (dir.includes('w')) { newW = Math.max(min.w, sW - dx); newL = sL + sW - newW; }", "          if (dir.includes('w')) { newW = Math.max(320, sW - dx); newL = sL + sW - newW; }"],
    ["          if (dir.includes('s')) newH = Math.max(min.h, sH + dy);", "          if (dir.includes('s')) newH = Math.max(180, sH + dy);"],
    ["          if (dir.includes('n')) { newH = Math.max(min.h, sH - dy); newT = sT + sH - newH; }", "          if (dir.includes('n')) { newH = Math.max(180, sH - dy); newT = sT + sH - newH; }"],
    ["          ({ left: newL, top: newT, width: newW, height: newH } = clampToMin({ left: newL, top: newT, width: newW, height: newH }, dir, min)); // a grid snap never takes it below", ''],
  ];
  const hits = lines.map(([from]) => src.split(from).length - 1);
  ok(hits.every((n) => n === 1), `the drag's minimum is spelled once per edge in window.js (the control patches exactly those lines: ${hits.join(', ')})`);
  let mut = src; for (const [from, to] of lines) mut = mut.replace(from, to);
  const mutFile = path.join(repo, 'src/lib', `vs-wm-min-${process.pid}.js`);
  fs.writeFileSync(mutFile, mut);
  try {
    const M = await run((await import(mutFile)).WindowManager, 'pre-fix');
    ok(M.se.height < 700 && M.se.width < 402, `CONTROL: the pre-fix drag takes the calculator's window to ${M.se.width}×${M.se.height} — below its 402×700 minimum (CSS would hold the box; the drag itself never stopped)`, M.se);
  } finally { try { fs.unlinkSync(mutFile); } catch {} }
  // CONTROL (r2): the uncapped minimum — the shipped-then-refuted r1 spelling — puts the window past the workspace
  const capLine = '  _ownMinOf(win) { return minOf(win, this._workspaceBox()); }';
  ok(src.split(capLine).length === 2, 'the workspace cap is spelled once in window.js (the control patches exactly it)');
  const capFile = path.join(repo, 'src/lib', `vs-wm-cap-${process.pid}.js`);
  fs.writeFileSync(capFile, src.replace(capLine, '  _ownMinOf(win) { return minOf(win); } // pre-fix CONTROL'));
  try {
    const WC = (await import(capFile)).WindowManager;
    const wmC = mkWm(WC); wmC.workspace = { offsetWidth: 1356, offsetHeight: 815 };
    const wc = { id: 'wc', element: mkEl(900, 600, 70, 70), onResize() {}, gridBounds: null, _tabChain: null, isMaximized: false };
    wmC.windows.set('wc', wc);
    wmC.setMinSize('wc', { w: 742, h: 1299 });
    ok(wc.element.style.minHeight === '1299px' && parseFloat(wc.element.style.top) + parseFloat(wc.element.style.height) > 815, `CONTROL: uncapped, the same minimum makes a ${wc.element.style.height} window at top ${wc.element.style.top} on an 815 px workspace — the keypad off-screen, and no size smaller possible (the verifier's p2-B)`, wc.element.style);
  } finally { try { fs.unlinkSync(capFile); } catch {} }
}

console.log('§3 wiring pins');
{
  const wj = read('src/lib/window.js'), css = read('public/style.css'), daw = read('src/lib/desktop-app-window.js'), xv = read('src/lib/xpra-view.js');
  ok(/import \{ minOf, clampToMin, raiseToMin, keepInside \} from '\.\/window-min-size\.js';/.test(wj) && /const min = this\._ownMinOf\(win\);/.test(wj) && /clampToMin\(\{ left: newL, top: newT, width: newW, height: newH \}, dir, min\)/.test(wj), 'window.js\'s resize drag reads the window\'s minimum through the PURE rule and clamps AFTER the grid snap');
  ok(!/Math\.max\(320, new[WH]\)|Math\.max\(180, new[WH]\)/.test(wj), 'no second spelling of the floor in the drag (the old `Math.max(320, newW)` is gone)');
  ok(/@media \(max-width: 768px\)[\s\S]*?\.window \{[^}]*min-width: 0 !important; min-height: 0 !important;/.test(css), 'the phone layout forces min 0 !important (an inline minimum would push the full-screen window off the phone)');
  ok(/app\.wm\.setMinSize\(winInfo\.id, min\)/.test(daw) && /windowMinForPane\(minPane, \{ w: er\.width - pr\.width, h: er\.height - pr\.height \}, uiScale\(\)\)/.test(daw) && /onMinSize: applyMinSize/.test(daw), 'desktop-app-window turns the view\'s onMinSize into setMinSize: pane + the window\'s own chrome (viewport rects) under the UI scale');
  ok(/if \(win\.minWidth \|\| win\.minHeight\) this\._applyOwnMin\(win\);/.test(wj), 'WIRING PIN (r2): the workspace-resize reflow re-applies every own minimum (the cap follows the workspace)');
  ok(/new ResizeObserver\(scheduleMin\)/.test(daw) && /minRo\?\.observe\(winInfo\.element\); minRo\?\.observe\(winInfo\.titleBar\);/.test(daw) && /for \(const el of \[view\.bar, view\.pane\]\) if \(el && minRo\) minRo\.observe\(el\);/.test(daw) && /window\.addEventListener\('vs:ui-scale', scheduleMin, \{ signal: winInfo\._listenerCtl\?\.signal \}\)/.test(daw) && !/minTries/.test(daw), 'WIRING PIN (r2): the window minimum is RE-MEASURED when the chrome resizes (title bar, status strip), when the window is laid out again (a hidden tab / desktop / minimize — the bounded 20 s retry `minTries` is gone) and when the UI scale changes');
  ok(/const changed = _uiScaleVal !== s;/.test(read('src/lib/utils.js')) && /if \(changed\) \{ try \{ window\.dispatchEvent\(new CustomEvent\('vs:ui-scale'/.test(read('src/lib/utils.js')), 'WIRING PIN (r2): applyUiPrefs announces a UI-scale CHANGE (`vs:ui-scale`) — the one place the scale is applied');
  ok(/onMinSize\?\.\(m \? \{ \.\.\.m \} : null\)/.test(xv) && /minPaneCss\(constraints, drawRatio\)/.test(xv), 'the xpra view computes the minimum pane from the main window\'s constraints and the ratio');
}

console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
