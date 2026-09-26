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
//   §4 (inc-muhmqvzf-jodk, 2026-09-26 — the owner's Chrome snapped into the right third of a 1×3 grid,
//      its right side cut): a zone / cell / half / range / stored bounds / restored size SMALLER than the
//      window's minimum never hangs past the workspace (#workspace is overflow: clip) — the PURE zoneBox
//      table, the REAL WindowManager paths on the owner's 1450×878 workspace (the right cell, the bottom
//      half both ways, a grid range, stored bounds from a wider screen, the restore from maximize, the
//      default placement at UI 125 %), with a patched copy carrying the pre-fix placement as the control.
//   §4b (r2, the verifier's MAJOR + lows): a box the WINDOW MANAGER kept itself — the px through a minimize, the
//      prevBounds through a maximize — on a workspace that narrowed meanwhile (the sidebar opened): minimize →
//      narrow → restore and maximize → narrow → un-maximize land inside, the captured fractions never hang (the
//      cascade: widen again ⇒ still inside), a capture of a display:none window never writes zeros, stored bounds
//      land on whole px, a workspace-CAPPED raise stays local — a patched copy with the r2 levers pulled back as the
//      control.
// Prerequisite: `npm run build`. Run: node scripts/test-window-minsize.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The negative controls' patched copies of src/lib/window.js are written
// OUTSIDE the tree (scripts/mutant-copy.mjs: `.mjs`, every relative import
// rewritten to the real file's URL). They used to be un-ignored siblings
// (src/lib/vs-wm-{min,cap}-<pid>.js) — a dirty tree while the suite ran.
const MUTW = mutantCopies('wm-minsize', repo);

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
  const mutFile = MUTW.write('src/lib/window.js', mut, 'min');
  try {
    const M = await run((await import(mutFile)).WindowManager, 'pre-fix');
    ok(M.se.height < 700 && M.se.width < 402, `CONTROL: the pre-fix drag takes the calculator's window to ${M.se.width}×${M.se.height} — below its 402×700 minimum (CSS would hold the box; the drag itself never stopped)`, M.se);
  } finally { /* MUTW's scratch dir is removed at exit */ }
  // CONTROL (r2): the uncapped minimum — the shipped-then-refuted r1 spelling — puts the window past the workspace
  const capLine = '  _ownMinOf(win) { return minOf(win, this._workspaceBox()); }';
  ok(src.split(capLine).length === 2, 'the workspace cap is spelled once in window.js (the control patches exactly it)');
  const capFile = MUTW.write('src/lib/window.js', src.replace(capLine, '  _ownMinOf(win) { return minOf(win); } // pre-fix CONTROL'), 'cap');
  try {
    const WC = (await import(capFile)).WindowManager;
    const wmC = mkWm(WC); wmC.workspace = { offsetWidth: 1356, offsetHeight: 815 };
    const wc = { id: 'wc', element: mkEl(900, 600, 70, 70), onResize() {}, gridBounds: null, _tabChain: null, isMaximized: false };
    wmC.windows.set('wc', wc);
    wmC.setMinSize('wc', { w: 742, h: 1299 });
    ok(wc.element.style.minHeight === '1299px' && parseFloat(wc.element.style.top) + parseFloat(wc.element.style.height) > 815, `CONTROL: uncapped, the same minimum makes a ${wc.element.style.height} window at top ${wc.element.style.top} on an 815 px workspace — the keypad off-screen, and no size smaller possible (the verifier's p2-B)`, wc.element.style);
  } finally { /* MUTW's scratch dir is removed at exit */ }
}

console.log('§3 wiring pins');
{
  const wj = read('src/lib/window.js'), css = read('public/style.css'), daw = read('src/lib/desktop-app-window.js'), xv = read('src/lib/xpra-view.js');
  ok(/import \{ minOf, clampToMin, raiseToMin, keepInside, zoneBox, wholePx, rescaleBox \} from '\.\/window-min-size\.js';/.test(wj) && /const min = this\._ownMinOf\(win\);/.test(wj) && /clampToMin\(\{ left: newL, top: newT, width: newW, height: newH \}, dir, min\)/.test(wj), 'window.js\'s resize drag reads the window\'s minimum through the PURE rule and clamps AFTER the grid snap');
  ok(!/Math\.max\(320, new[WH]\)|Math\.max\(180, new[WH]\)/.test(wj), 'no second spelling of the floor in the drag (the old `Math.max(320, newW)` is gone)');
  ok(/@media \(max-width: 768px\)[\s\S]*?\.window \{[^}]*min-width: 0 !important; min-height: 0 !important;/.test(css), 'the phone layout forces min 0 !important (an inline minimum would push the full-screen window off the phone)');
  ok(/app\.wm\.setMinSize\(winInfo\.id, min\)/.test(daw) && /windowMinForPane\(minPane, \{ w: er\.width - pr\.width, h: er\.height - pr\.height \}, uiScale\(\)\)/.test(daw) && /onMinSize: applyMinSize/.test(daw), 'desktop-app-window turns the view\'s onMinSize into setMinSize: pane + the window\'s own chrome (viewport rects) under the UI scale');
  ok(/if \(win\.minWidth \|\| win\.minHeight\) this\._applyOwnMin\(win\);/.test(wj), 'WIRING PIN (r2): the workspace-resize reflow re-applies every own minimum (the cap follows the workspace)');
  ok(/new ResizeObserver\(scheduleMin\)/.test(daw) && /minRo\?\.observe\(winInfo\.element\); minRo\?\.observe\(winInfo\.titleBar\);/.test(daw) && /for \(const el of \[view\.bar, view\.pane\]\) if \(el && minRo\) minRo\.observe\(el\);/.test(daw) && /window\.addEventListener\('vs:ui-scale', scheduleMin, \{ signal: winInfo\._listenerCtl\?\.signal \}\)/.test(daw) && !/minTries/.test(daw), 'WIRING PIN (r2): the window minimum is RE-MEASURED when the chrome resizes (title bar, status strip), when the window is laid out again (a hidden tab / desktop / minimize — the bounded 20 s retry `minTries` is gone) and when the UI scale changes');
  ok(/const changed = _uiScaleVal !== s;/.test(read('src/lib/utils.js')) && /if \(changed\) \{ try \{ window\.dispatchEvent\(new CustomEvent\('vs:ui-scale'/.test(read('src/lib/utils.js')), 'WIRING PIN (r2): applyUiPrefs announces a UI-scale CHANGE (`vs:ui-scale`) — the one place the scale is applied');
  ok(/onMinSize\?\.\(m \? \{ \.\.\.m \} : null\)/.test(xv) && /minPaneCss\(constraints, drawRatio\)/.test(xv), 'the xpra view computes the minimum pane from the main window\'s constraints and the ratio');
}

console.log('§4 a zone smaller than the minimum never hangs past the workspace (inc-muhmqvzf-jodk)');
{
  // ── the PURE rule ──
  const WS = { w: 1450, h: 878 }, CHROME_MIN = { w: 502, h: 154 };
  const zb = (z, m, ws, g) => { const r = MS.zoneBox(z, m, ws, g); return { left: r.left, top: r.top, width: r.width, height: r.height, moved: r.moved, raised: r.raised }; };
  ok(same(zb({ left: 968, top: 4, width: 478, height: 870 }, CHROME_MIN, WS, 4), { left: 944, top: 4, width: 502, height: 870, moved: true, raised: true }), 'zoneBox: the owner\'s right third of a 1×3 grid on a 1450 px workspace (478 px cell, 502 px minimum) — raised to 502 and slid left to end at the cell\'s edge (944 + 502 = 1446, the 4 px gutter kept), never 968 + 502 = 1470');
  ok(same(zb({ left: 4, top: 4, width: 478, height: 870 }, CHROME_MIN, WS, 4), { left: 4, top: 4, width: 502, height: 870, moved: false, raised: true }), '…the FIRST cell grows into its neighbour and stays where it is (the overlap the law always allowed)');
  ok(same(zb({ left: 4, top: 441, width: 1442, height: 433 }, { w: 362, h: 618 }, WS, 4), { left: 4, top: 256, width: 1442, height: 618, moved: true, raised: true }), 'zoneBox: the calculator\'s bottom half (433 px zone, 618 px minimum) slides UP to end at 874, never 441 + 618 = 1059');
  ok(same(zb({ left: 200, top: 100, width: 600, height: 400 }, CHROME_MIN, WS, 4), { left: 200, top: 100, width: 600, height: 400, moved: false, raised: false }), 'a zone above the minimum is untouched');
  ok(same(zb({ left: 1305, top: 88, width: 435, height: 263 }, { w: 320, h: 180 }, WS, 4), { left: 1305, top: 88, width: 435, height: 263, moved: false, raised: false }) && same(zb({ left: 1305, top: 88, width: 435, height: 263 }, CHROME_MIN, WS, 4), { left: 1238, top: 88, width: 502, height: 263, moved: true, raised: true }), 'a zone the PERSON left hanging off the edge: never moved without a raised minimum, and with one it keeps ITS right edge (1740) — the minimum never adds a crop');
  ok(same(zb({ left: 100, top: 0, width: 300, height: 100 }, { w: 1600, h: 100 }, WS, 4), { left: 0, top: 0, width: 1600, height: 100, moved: true, raised: true }) && same(zb({ left: -50, top: 0, width: 400, height: 100 }, { w: 600, h: 100 }, WS, 4), { left: -50, top: 0, width: 600, height: 100, moved: false, raised: true }), 'never slid past the workspace\'s own left edge (a box wider than the room stops at 0); a zone already left of it is not pushed further');
  ok(same(zb({ left: 968, top: 4, width: 478, height: 870 }, CHROME_MIN, null, 4), { left: 968, top: 4, width: 502, height: 870, moved: false, raised: true }), 'no laid-out workspace ⇒ the raised size, no slide');

  // ── the REAL WindowManager paths, the owner's workspace (1450×878 layout px: a 1920 px viewport, the sidebar at 470) ──
  const pathsOn = async (WM) => {
    const wm = mkWm(WM); wm.workspace = { offsetWidth: 1450, offsetHeight: 878 };
    // the element as CSS lays it out: never below its inline min NOR the .window floor (320×180 — every window's minimum)
    const mkElFloor = (w, h, l, t) => { const el = mkEl(w, h, l, t); Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => Math.max(parseFloat(el.style.width) || 0, parseFloat(el.style.minWidth) || 0, MS.WINDOW_FLOOR.w) }); Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => Math.max(parseFloat(el.style.height) || 0, parseFloat(el.style.minHeight) || 0, MS.WINDOW_FLOOR.h) }); return el; };
    const mk = (id, min, w = 900, h = 620) => { const win = { id, element: mkElFloor(w, h, 70, 70), onResize() {}, gridBounds: null, _tabChain: null, isMaximized: false }; wm.windows.set(id, win); if (min) wm.setMinSize(id, min); return win; };
    const box = (win) => { const e = win.element; return { l: e.offsetLeft, t: e.offsetTop, r: e.offsetLeft + e.offsetWidth, b: e.offsetTop + e.offsetHeight, w: e.offsetWidth, h: e.offsetHeight }; };
    const out = {};
    const chrome = mk('chrome', CHROME_MIN);
    wm.grid = { rows: 1, cols: 3 };
    wm._positionToCell(chrome, 2, false); out.cell = box(chrome);
    wm._positionToCell(chrome, 0, false); out.cell0 = box(chrome);
    const calc = mk('calc', { w: 362, h: 618 });
    wm._applySnap('calc', 'bottom'); out.snapBottom = box(calc);
    wm.snapToHalf('calc', 'bottom'); out.halfBottom = box(calc);
    wm.grid = { rows: 2, cols: 2 };
    wm._snapToGridRange('calc', 2, 3); out.range = box(calc);
    wm._positionToCell(calc, 3, false); out.cell22 = box(calc);
    // stored bounds of the right third captured on a 1876 px workspace (no sidebar), applied on the owner's 1450 px one
    chrome.gridBounds = { left: 0.6674, top: 0.0046, width: 0.3305, height: 0.9909 };
    wm._applyGridBounds(chrome); out.bounds = box(chrome);
    wm._reflowWindows(); out.reflow = box(chrome);
    // the restore from maximize of a bottom half the pre-fix code stored
    calc.isMaximized = true; calc.prevBounds = { left: '4px', top: '441px', width: '1442px', height: '433px' };
    wm.toggleMaximize('calc'); out.restore = box(calc); out.restoreMax = calc.isMaximized;
    // a terminal (the .window floor only) in the last column of a 1×6 grid: 237 px cells, the 320 px floor
    const term = mk('term', null, 600, 400);
    wm.grid = { rows: 1, cols: 6 };
    wm._positionToCell(term, 5, false); out.floor6 = box(term);
    // the default placement at UI 125 % (a 963 px viewport ⇒ a 685.6 layout px workspace, offsetHeight 686) for a 900×620 desktop app
    const wmU = mkWm(WM); wmU.workspace = { offsetWidth: 1536, offsetHeight: 686 }; wmU.windowCounter = 1;
    out.def = wmU._defaultPlacement(900, 620);
    wmU.windowCounter = 7; out.def7 = wmU._defaultPlacement(900, 620);
    const wmT = mkWm(WM); wmT.workspace = { offsetWidth: 600, offsetHeight: 400 }; wmT.windowCounter = 1;
    out.defTiny = wmT._defaultPlacement(700, 500);
    // the phone layout: the window IS the screen, the zone as given
    const wmP = mkWm(WM); wmP.workspace = { offsetWidth: 390, offsetHeight: 700 }; wmP._hideMq = { matches: true };
    const ph = { id: 'ph', element: mkEl(390, 700, 0, 0), onResize() {}, gridBounds: null, _tabChain: null, isMaximized: false }; wmP.windows.set('ph', ph); ph.minWidth = 502;
    out.phone = wmP._placeWindow(ph, { left: 0, top: 0, width: 390, height: 700 }, 4);
    return out;
  };
  const inside = (b) => b.l >= 0 && b.t >= 0 && b.r <= 1450 + 1e-6 && b.b <= 878 + 1e-6;
  const { WindowManager } = await import('../src/lib/window.js');
  const A = await pathsOn(WindowManager);
  await sleep(300); // the snap paths' own 220 ms timers
  ok(inside(A.cell) && A.cell.l === 944 && A.cell.w === 502 && A.cell.r === 1446, `THE OWNER'S CASE: Chrome (minimum 502) snapped into the right cell of a 1×3 grid on a 1450 px workspace ends at ${A.cell.r} ≤ 1450 (left ${A.cell.l}, the pre-fix 968 hung 20 px past the edge)`, A.cell);
  ok(A.cell0.l === 4 && A.cell0.w === 502, `the first cell: the window stays at 4 and overlaps its neighbour (${A.cell0.l} + ${A.cell0.w})`, A.cell0);
  ok(inside(A.snapBottom) && A.snapBottom.t === 256 && A.snapBottom.h === 618, `the calculator (minimum 618 high) dragged to the BOTTOM snap zone ends at ${A.snapBottom.b} ≤ 878 (top ${A.snapBottom.t}; pre-fix 441 + 618 = 1059)`, A.snapBottom);
  ok(inside(A.halfBottom) && A.halfBottom.t === 256, `…snapToHalf('bottom') (command mode) the same (${A.halfBottom.t}–${A.halfBottom.b})`, A.halfBottom);
  ok(inside(A.range) && inside(A.cell22), `…a shift-drag grid RANGE (the bottom row of 2×2, ${A.range.t}–${A.range.b}) and the bottom-right cell of 2×2 (${A.cell22.l},${A.cell22.t}–${A.cell22.r},${A.cell22.b}) the same`, { range: A.range, cell22: A.cell22 });
  ok(inside(A.bounds) && inside(A.reflow) && A.bounds.w === 502, `stored bounds of the right third from a 1876 px workspace applied on the 1450 px one (layout restore / sync / the sidebar opening — _applyGridBounds) end at ${A.bounds.r.toFixed(1)} ≤ 1450, and the workspace reflow keeps it there (${A.reflow.r.toFixed(1)})`, { bounds: A.bounds, reflow: A.reflow });
  ok(inside(A.restore) && A.restoreMax === false, `the restore from maximize of a stored bottom half (4,441 1442×433) lands inside (${A.restore.t}–${A.restore.b})`, A.restore);
  ok(inside(A.floor6) && A.floor6.w === 320, `a terminal (the .window floor 320) in the last cell of a 1×6 grid (237 px) ends at ${A.floor6.r.toFixed(1)} ≤ 1450 — the rule is every window's, not the desktop app's`, A.floor6);
  ok(same(A.def, { left: 70, top: 66, width: 900, height: 620 }) && same(A.def7, { left: 250, top: 66, width: 900, height: 620 }) && same(A.defTiny, { left: 0, top: 0, width: 600, height: 400 }), `the DEFAULT placement at UI 125 % (a 686 px workspace): the cascade's 70 + 620 slides up to ${A.def.top} (pre-fix 4 px hung past the bottom); a tiny workspace caps the size`, { def: A.def, def7: A.def7, tiny: A.defTiny });
  ok(same({ ...A.phone }, { left: 0, top: 0, width: 390, height: 700 }), 'the ≤768 px phone layout takes the zone as given (the window IS the screen; the picture scales)');

  // CONTROL: a patched copy of window.js with the pre-fix placement — the zone written as given, the cascade as it falls
  const src = read('src/lib/window.js');
  const levers = [
    ['    const box = ws && !this._mobileLayout() ? zoneBox(zone, this._ownMinOf(win), ws, gap) : { ...zone };', '    const box = { ...zone }; // pre-fix CONTROL: the zone as given'],
    ['    if (!ws) return box;', '    return box; // pre-fix CONTROL: the cascade as it falls'],
  ];
  const hits = levers.map(([from]) => src.split(from).length - 1);
  ok(hits.every((n) => n === 1), `CONTROL: each placement lever is spelled exactly once in window.js (${hits.join(', ')})`);
  let mut = src; for (const [from, to] of levers) mut = mut.replace(from, to);
  const f = MUTW.write('src/lib/window.js', mut, 'place');
  const C = await pathsOn((await import(f)).WindowManager);
  await sleep(300);
  ok(C.cell.r > 1450 && C.snapBottom.b > 878 && C.halfBottom.b > 878 && C.range.b > 878 && C.bounds.r > 1450 && C.restore.b > 878 && C.floor6.r > 1450 && C.def.top + C.def.height > 686, `CONTROL: with the pre-fix placement the same acts hang past the workspace — the right cell to ${C.cell.r} (the owner's 20 px), the bottom half to ${C.snapBottom.b}, the range to ${C.range.b}, stored bounds to ${C.bounds.r.toFixed(1)}, the restore to ${C.restore.b}, the 1×6 terminal to ${C.floor6.r.toFixed(1)}, the default to ${C.def.top + C.def.height}`, C);

  // WIRING: every path that puts a window into a zone goes through the ONE placement (a new path writing the zone itself is the bug again)
  const body = (name) => { const i = src.indexOf(`\n  ${name}(`); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j); };
  const through = ['_applyGridBounds', '_applySnap', 'snapToHalf', '_snapToGridRange', '_positionToCell'];
  const bad = through.filter((n) => !/this\._placeWindow\(win, /.test(body(n)) || /style\.(width|height|left|top)\s*=/.test(body(n)));
  ok(!bad.length, `WIRING: ${through.join(', ')} place through _placeWindow and write no left/top/width/height of their own${bad.length ? ` — not: ${bad.join(', ')}` : ''}`);
  ok(/this\._placeWindow\(win, box, 4\)/.test(body('toggleMaximize')) && /if \(x === undefined\) \(\{ left: x, top: y, width, height \} = this\._defaultPlacement\(width, height\)\);/.test(src), 'WIRING: the restore from maximize places through _placeWindow; createWindow takes the default placement from _defaultPlacement');
}

console.log('§4b r2 — a box the window manager kept ITSELF, on a workspace that changed meanwhile (inc-muhmqvzf-jodk r2)');
{
  // ── the PURE rules ──
  ok(same(MS.wholePx({ left: 727.03, top: 4.0388, width: 778.94, height: 870.01 }), { left: 727, top: 4, width: 779, height: 870 }) && same(MS.wholePx({ left: 967.73, top: 4.04, width: 479.2, height: 870.0 }), { left: 968, top: 4, width: 479, height: 870 }), 'wholePx: the EDGES on whole layout px (727.03 + 778.94 = 1505.97 ⇒ 727 … 1506, width 779) — the sizes follow the edges, never rounded apart');
  ok(same(MS.rescaleBox({ left: 1252, top: 4, width: 620, height: 870 }, { w: 1876, h: 878 }, { w: 1450, h: 878 }), { left: 968, top: 4, width: 479, height: 870 }), 'rescaleBox: the right third of a 1876 px workspace carried to a 1450 px one = the same fractions (968 … 1447), where the reflow puts a visible twin');
  const B0 = { left: 1252, top: 4, width: 620, height: 870 };
  ok(MS.rescaleBox(B0, { w: 1876, h: 878 }, { w: 1876, h: 878 }) === B0 && MS.rescaleBox(B0, undefined, { w: 1450, h: 878 }) === B0 && MS.rescaleBox(B0, { w: 1876, h: 878 }, null) === B0 && MS.rescaleBox(B0, { w: 0, h: 0 }, { w: 1450, h: 878 }) === B0, 'rescaleBox: the same workspace, an older record without one, or none laid out ⇒ the box exactly as stored');

  // ── the REAL WindowManager flows (the verifier's recipe): the sidebar closed ⇒ a 1876 px workspace, the sidebar at
  //    470 open ⇒ 1450; Chrome's minimum 502; the element as CSS lays it out (display:none measures 0 — a real
  //    minimized window — a % size is of the workspace, integer offsets, never below its min / the .window floor) ──
  const WIDE = { w: 1876, h: 878 }, NARROW = { w: 1450, h: 878 };
  const flowsOn = async (WM) => {
    const fresh = () => {
      const wm = mkWm(WM); delete wm._captureGridBounds; // the REAL capture — what it persists IS the cascade
      wm.focusWindow = () => {};
      wm.workspace = { offsetWidth: WIDE.w, offsetHeight: WIDE.h };
      return wm;
    };
    const setWs = (wm, b) => { wm.workspace.offsetWidth = b.w; wm.workspace.offsetHeight = b.h; };
    const mkLaid = (wm, w, h, l, t) => {
      const el = mkEl(w, h, l, t), shown = () => el.style.display !== 'none';
      const len = (v, of) => (/%$/.test(String(v)) ? (parseFloat(v) / 100) * of : parseFloat(v) || 0);
      const def = (k, fn) => Object.defineProperty(el, k, { configurable: true, get: () => (shown() ? Math.round(fn()) : 0) });
      def('offsetLeft', () => len(el.style.left, wm.workspace.offsetWidth)); def('offsetTop', () => len(el.style.top, wm.workspace.offsetHeight));
      def('offsetWidth', () => Math.max(len(el.style.width, wm.workspace.offsetWidth), parseFloat(el.style.minWidth) || 0, MS.WINDOW_FLOOR.w));
      def('offsetHeight', () => Math.max(len(el.style.height, wm.workspace.offsetHeight), parseFloat(el.style.minHeight) || 0, MS.WINDOW_FLOOR.h));
      return el;
    };
    const mkWin = (wm, id) => { const win = { id, element: mkLaid(wm, 900, 620, 70, 70), onResize() { win.resized = (win.resized || 0) + 1; }, gridBounds: null, _tabChain: null, isMaximized: false, isMinimized: false }; wm.windows.set(id, win); wm.setMinSize(id, { w: 502, h: 154 }); return win; };
    const box = (win) => { const e = win.element; return { l: e.offsetLeft, t: e.offsetTop, r: e.offsetLeft + e.offsetWidth, b: e.offsetTop + e.offsetHeight, w: e.offsetWidth }; };
    const intoRightThird = (wm, win) => { wm.grid = { rows: 1, cols: 3 }; wm._positionToCell(win, 2, false); wm._captureGridBounds(win); }; // the drop + its capture
    const out = {};
    { // (a) minimize → the sidebar opens → restore
      const wm = fresh(), a = mkWin(wm, 'a');
      intoRightThird(wm, a); out.aWide = box(a);
      wm.minimize('a');
      const r0 = a.resized || 0;
      setWs(wm, NARROW); wm._reflowWindows();
      out.aHiddenResized = (a.resized || 0) - r0; out.aHiddenStyle = [a.element.style.left, a.element.style.width];
      wm._captureGridBounds(a); out.aHiddenBounds = { ...a.gridBounds }; // a capture while display:none (the autosave's, a snap timer's)
      wm.restore('a'); await sleep(80); // + restore's own capture
      out.aRestored = box(a); out.aBounds = { ...a.gridBounds };
      setWs(wm, WIDE); wm._reflowWindows(); out.aWiden = box(a);
      setWs(wm, NARROW); wm._reflowWindows(); out.aNarrow = box(a);
    }
    { // (b) maximize → the sidebar opens → un-maximize
      const wm = fresh(), b = mkWin(wm, 'b');
      intoRightThird(wm, b);
      wm.toggleMaximize('b'); await sleep(80);
      setWs(wm, NARROW); wm._reflowWindows();
      out.bMax = box(b);
      wm.toggleMaximize('b'); await sleep(80);
      out.bRestored = box(b); out.bBounds = { ...b.gridBounds };
      setWs(wm, WIDE); wm._reflowWindows(); out.bWiden = box(b);
      setWs(wm, NARROW); wm._reflowWindows(); out.bNarrow = box(b);
      // …and a maximize with NO workspace change restores the stored px exactly (the rescale is only for a change)
      const c = mkWin(wm, 'c'); intoRightThird(wm, c); out.cBefore = box(c);
      wm.toggleMaximize('c'); await sleep(80); wm.toggleMaximize('c'); await sleep(80); out.cAfter = box(c);
    }
    { // low: stored bounds land on whole layout px (the verifier's phone → desktop round trip wrote 727.03 / 778.94)
      const wm = fresh(), d = mkWin(wm, 'd'); setWs(wm, NARROW);
      d.gridBounds = { left: 0.5014, top: 0.0046, width: 0.5372, height: 0.9909 }; wm._applyGridBounds(d);
      out.whole = [d.element.style.left, d.element.style.top, d.element.style.width, d.element.style.height];
    }
    { // low: a raise by a workspace-CAPPED minimum (a 1280×800 client taking the seat of a 2× calculator: minimum
      //      722×1234 on an 810×715 workspace) stays this client's — the shared grid bounds untouched, nothing announced
      const wm = fresh(); wm.workspace = { offsetWidth: 810, offsetHeight: 715 };
      const e = { id: 'e', element: mkLaid(wm, 805, 503, 4, 100), onResize() {}, gridBounds: { left: 0.0049, top: 0.1399, width: 0.9938, height: 0.7035 }, _tabChain: null, isMaximized: false, isMinimized: false };
      wm.windows.set('e', e); const g0 = { ...e.gridBounds }, n0 = wm.notified || 0;
      wm.setMinSize('e', { w: 722, h: 1234 });
      out.capped = { h: e.element.style.height, top: e.element.style.top, boundsKept: same(e.gridBounds, g0), notified: (wm.notified || 0) - n0 };
      const wm2 = fresh(); wm2.workspace = { offsetWidth: 1600, offsetHeight: 1400 };
      const f = { id: 'f', element: mkLaid(wm2, 805, 503, 4, 100), onResize() {}, gridBounds: { left: 0.0025, top: 0.0714, width: 0.5031, height: 0.3593 }, _tabChain: null, isMaximized: false, isMinimized: false };
      wm2.windows.set('f', f); const f0 = { ...f.gridBounds };
      wm2.setMinSize('f', { w: 722, h: 1234 });
      out.uncapped = { h: f.element.style.height, recaptured: !same(f.gridBounds, f0), notified: wm2.notified || 0 };
    }
    return out;
  };
  const inside = (b, ws) => b.l >= 0 && b.t >= 0 && b.r <= ws.w && b.b <= ws.h;
  const past = (b, ws) => Math.max(0, b.r - ws.w);
  const fracOk = (g) => g && g.left + g.width <= 1 + 1e-9 && g.top + g.height <= 1 + 1e-9 && g.width > 0;
  const { WindowManager } = await import('../src/lib/window.js');
  const A = await flowsOn(WindowManager);
  console.log(`    (a) right third on 1876: ${JSON.stringify(A.aWide)} → minimized, 1450 → restored ${JSON.stringify(A.aRestored)} bounds ${JSON.stringify(A.aBounds)} → 1876 ${JSON.stringify(A.aWiden)} → 1450 ${JSON.stringify(A.aNarrow)}`);
  console.log(`    (b) right third on 1876 → maximized, 1450 → un-maximized ${JSON.stringify(A.bRestored)} bounds ${JSON.stringify(A.bBounds)} → 1876 ${JSON.stringify(A.bWiden)} → 1450 ${JSON.stringify(A.bNarrow)}`);
  ok(inside(A.aWide, WIDE) && A.aWide.l === 1252 && A.aWide.w === 620, `(a) the drop: Chrome in the right third of 1×3 with the sidebar CLOSED (1876 px) — ${A.aWide.l} + ${A.aWide.w}`, A.aWide);
  ok(inside(A.aRestored, NARROW), `(a) THE VERIFIER'S FLOW: minimize → the sidebar opens (1450 px) → restore lands INSIDE (${A.aRestored.l}–${A.aRestored.r}, ${past(A.aRestored, NARROW)} CSS px past; pre-fix 1252–1872 = 422 past ⇒ 844 device px at DPR 2)`, A.aRestored);
  ok(fracOk(A.aBounds), `(a) …and restore's capture persists fractions INSIDE the workspace (left ${A.aBounds.left} + width ${A.aBounds.width} ≤ 1; pre-fix 0.8634 + 0.4276)`, A.aBounds);
  ok(inside(A.aWiden, WIDE) && inside(A.aNarrow, NARROW), `(a) THE CASCADE: the sidebar closed again (1876) ⇒ ${A.aWiden.l}–${A.aWiden.r}, opened again (1450) ⇒ ${A.aNarrow.l}–${A.aNarrow.r} — inside both times`, { widen: A.aWiden, narrow: A.aNarrow });
  ok(A.aHiddenResized === 0 && A.aHiddenStyle[0] === '945px' && A.aHiddenStyle[1] === '502px', `(a) the reflow PLACES the minimized window (its inline box ${A.aHiddenStyle.join(' / ')} while display:none) and tells its view nothing until the restore (onResize ×${A.aHiddenResized} while hidden)`, { hiddenResized: A.aHiddenResized, style: A.aHiddenStyle });
  ok(fracOk(A.aHiddenBounds) && A.aHiddenBounds.width > 0.3 && A.aHiddenBounds.left > 0.6, `(a) a capture of the display:none window reads its inline px, never zeros (${JSON.stringify(A.aHiddenBounds)}; pre-fix {0,0,0,0} — the autosave's first capture of a minimized window, a snap's 220 ms capture after a quick minimize)`, A.aHiddenBounds);
  ok(inside(A.bRestored, NARROW), `(b) THE VERIFIER'S FLOW: maximize → the sidebar opens (1450 px) → un-maximize lands INSIDE (${A.bRestored.l}–${A.bRestored.r}, ${past(A.bRestored, NARROW)} CSS px past; pre-fix the stale prevBounds 1252–1872 = 422 past)`, A.bRestored);
  ok(A.bRestored.l === A.aRestored.l && A.bRestored.w === A.aRestored.w, `(b) …exactly where the minimized twin and a visible window's reflow land (${A.bRestored.l} + ${A.bRestored.w}) — the box carried as fractions, then the ONE placement`, { a: A.aRestored, b: A.bRestored });
  ok(fracOk(A.bBounds) && inside(A.bWiden, WIDE) && inside(A.bNarrow, NARROW), `(b) THE CASCADE: the captured fractions stay inside (${A.bBounds.left} + ${A.bBounds.width}; pre-fix 0.8634 + 0.4276) and the sidebar closing / opening again keeps the window inside (${A.bWiden.l}–${A.bWiden.r} on 1876, ${A.bNarrow.l}–${A.bNarrow.r} on 1450)`, { bounds: A.bBounds, widen: A.bWiden, narrow: A.bNarrow });
  ok(same(A.cBefore, A.cAfter), `(b) a maximize with NO workspace change restores the stored px exactly (${JSON.stringify(A.cAfter)})`, { before: A.cBefore, after: A.cAfter });
  ok(A.whole.every((v) => /^\d+px$/.test(v)), `low: stored bounds on a 1450 px workspace land on WHOLE layout px (${A.whole.join(' ')}; pre-fix 727.03px-class fractions)`, A.whole);
  ok(A.capped.h === '715px' && A.capped.top === '0px' && A.capped.boundsKept && A.capped.notified === 0, `low: a raise by a workspace-CAPPED minimum stays this client's — raised to ${A.capped.h} at top ${A.capped.top}, the shared grid bounds untouched (${A.capped.boundsKept}), nothing announced (${A.capped.notified} notify) — the sync no longer moves the other client's window`, A.capped);
  ok(A.uncapped.h === '1234px' && A.uncapped.recaptured && A.uncapped.notified === 1, `low: …an UNCAPPED raise is still re-captured and announced (${A.uncapped.h}, notify ×${A.uncapped.notified}) — the 2.369.158 rule unchanged`, A.uncapped);

  // CONTROL: a patched copy with the r2 levers pulled back (minimized windows skipped by the reflow, the stale prevBounds
  // px, the offsets read of a display:none window, the fractional stored box, the capped raise shared)
  const src = read('src/lib/window.js');
  const levers = [
    ['      if (win.gridBounds && !win.isMaximized) this._applyGridBounds(win);', '      if (win.gridBounds && !win.isMinimized && !win.isMaximized) this._applyGridBounds(win); // pre-fix CONTROL'],
    ['        box = rescaleBox(box, p.ws, this._workspaceBox());', '        // pre-fix CONTROL: the stale px'],
    ['    const b = this._layoutBoxOf(win.element);', '    const b = { left: win.element.offsetLeft, top: win.element.offsetTop, width: win.element.offsetWidth, height: win.element.offsetHeight }; // pre-fix CONTROL'],
    ['    this._placeWindow(win, wholePx({ left: b.left * r.width, top: b.top * r.height, width: b.width * r.width, height: b.height * r.height }), 4);', '    this._placeWindow(win, { left: b.left * r.width, top: b.top * r.height, width: b.width * r.width, height: b.height * r.height }, 4); // pre-fix CONTROL'],
    ['    const full = minOf(win), local = full.w > min.w || full.h > min.h;', '    const local = false; // pre-fix CONTROL'],
  ];
  const hits = levers.map(([from]) => src.split(from).length - 1);
  ok(hits.every((n) => n === 1), `CONTROL: each r2 lever is spelled exactly once in window.js (${hits.join(', ')})`);
  let mut = src; for (const [from, to] of levers) mut = mut.replace(from, to);
  const f = MUTW.write('src/lib/window.js', mut, 'r2');
  const C = await flowsOn((await import(f)).WindowManager);
  console.log(`    CONTROL (a) restored ${JSON.stringify(C.aRestored)} bounds ${JSON.stringify(C.aBounds)} → 1876 ${JSON.stringify(C.aWiden)}; (b) un-maximized ${JSON.stringify(C.bRestored)} bounds ${JSON.stringify(C.bBounds)} → 1876 ${JSON.stringify(C.bWiden)}`);
  ok(!inside(C.aRestored, NARROW) && past(C.aRestored, NARROW) === 422 && !fracOk(C.aBounds) && !inside(C.aWiden, WIDE), `CONTROL (a): pre-r2, minimize → sidebar → restore hangs ${past(C.aRestored, NARROW)} CSS px past the 1450 px workspace (the verifier's 422 ⇒ 844 device px at DPR 2), captures ${C.aBounds.left} + ${C.aBounds.width}, and the widening cascades to ${past(C.aWiden, WIDE)} past 1876`, C);
  ok(!inside(C.bRestored, NARROW) && past(C.bRestored, NARROW) === 422 && !fracOk(C.bBounds) && !inside(C.bWiden, WIDE), `CONTROL (b): pre-r2, maximize → sidebar → un-maximize hangs ${past(C.bRestored, NARROW)} CSS px past, captures ${C.bBounds.left} + ${C.bBounds.width}, cascades to ${past(C.bWiden, WIDE)} past 1876`, C);
  ok(same(C.aHiddenBounds, { left: 0, top: 0, width: 0, height: 0 }), `CONTROL: pre-r2, a capture of the display:none window writes ${JSON.stringify(C.aHiddenBounds)}`, C.aHiddenBounds);
  ok(!C.whole.every((v) => /^\d+px$/.test(v)), `CONTROL: pre-r2, stored bounds land on fractional px (${C.whole.join(' ')})`, C.whole);
  ok(!C.capped.boundsKept && C.capped.notified === 1, `CONTROL: pre-r2, the capped raise re-captures the shared bounds and announces them (kept ${C.capped.boundsKept}, notify ×${C.capped.notified})`, C.capped);
}

// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTW.files, MUTW.dir, repo, { minCopies: 4 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
