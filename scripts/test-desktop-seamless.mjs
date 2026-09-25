#!/usr/bin/env node
// SEAMLESS DESKTOP-APP WINDOWS (round 3 lane B, docs/design-desktop-apps-seamless.zh.md §3.3; D3 decided as
// recommended by the owner 2026-09-25). Fast, no browser, no display:
//   §1 the PURE verdict (src/lib/desktop-seamless.js seamlessVerdict) over its FULL matrix — csd × the global
//      setting × the per-app toggle × lease × chain × phone × connected (2·2·3·2·2·2·2 = 192 rows) against the
//      design's formula written out independently here; the `why` of every row (wanted first, then the pause);
//      user-toggle precedence (on beats setting off and an SSD app; off beats a CSD app), the setting off, the
//      pauses holding even a forced 'on';
//   §2 the reveal arithmetic (revealStep) as PURE transitions: 250 ms of hover reveals, a crossing does not, the
//      1.5 s linger after the pointer goes back into the app or Alt is released, leaving the window folds at once,
//      Alt reveals at once and holds, a reset folds, `wakeAt` names every pending instant;
//   §3 the other PURE words: moveResizeAction (8 move, 0–7 the edges, 9/10 keyboard, 11 cancel), windowStateAction
//      (SET semantics, only announced keys), isCsd, the frame key / choice / menu, the FRAME ↔ seamless crossing;
//   §4 the REAL WindowManager seams over a fake DOM: beginDragFromPointer enters the title bar's own drag (pointer
//      events, grid off ⇒ the window follows the pointer from the PRESS point; the drop's re-capture), a CANCEL puts
//      it back, beginResizeFromPointer is the handles' own resize (the window's minimum holds) and a CANCEL
//      restores; a tab guest drags its chain's host;
//   §5 wiring pins: the setting (Window category, auto|off, liveApply) is READ by the window; the view's
//      onMoveResize reaches the WindowManager seams; the CSS folds with a class (never display:none of the bars);
//      the taskbar menu rows; every t() key of desktop-seamless.js / the seamless block has zh + ja;
//   NEGATIVE CONTROL (scripts/mutant-copy.mjs): a copy of desktop-seamless.js whose verdict forgets the pauses
//      fails §1's matrix — the matrix is a judge, not an echo; a copy of window.js without the fix-r1 un-maximize
//      notifications (§4 (e)) drags a maximized window off SILENTLY (the app's header bar is never told).
// Prerequisite: `npm run build` (the window.js import graph). Run: node scripts/test-desktop-seamless.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUT = mutantCopies('desktop-seamless', repo);
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }

const S = await import('../src/lib/desktop-seamless.js');

// the design's formula, written out HERE (never imported): seamless ⇔ connected ∧ ¬lease ∧ ¬chain ∧ ¬phone ∧
// (userToggle==='on' ∨ (userToggle==='auto' ∧ setting==='auto' ∧ csd))
const formula = ({ csd, setting, userToggle, lease, chain, phone, connected }) => connected && !lease && !chain && !phone && (userToggle === 'on' || (userToggle === 'auto' && setting === 'auto' && csd));
const expectWhy = (r) => {
  const want = r.userToggle === 'on' || (r.userToggle === 'auto' && r.setting === 'auto' && r.csd);
  if (!want) return r.userToggle === 'off' ? 'user' : r.setting === 'off' ? 'setting-off' : 'ssd';
  if (r.phone) return 'phone';
  if (!r.connected) return 'disconnected';
  if (r.lease) return 'lease';
  if (r.chain) return 'chain';
  return r.userToggle === 'on' ? 'user' : 'csd';
};
const B = [false, true];
const rows = [];
for (const csd of B) for (const setting of ['auto', 'off']) for (const userToggle of ['auto', 'on', 'off']) for (const lease of B) for (const chain of B) for (const phone of B) for (const connected of B) rows.push({ csd, setting, userToggle, lease, chain, phone, connected });
const judge = (mod) => {
  const bad = [];
  for (const r of rows) { const v = mod.seamlessVerdict(r); if (v.seamless !== formula(r) || v.why !== expectWhy(r) || !S.SEAMLESS_WHY.includes(v.why)) bad.push({ r, v }); }
  return bad;
};

console.log('§1 the verdict — the full matrix (192 rows) against the design\'s formula');
{
  const bad = judge(S);
  ok(rows.length === 192 && bad.length === 0, `seamlessVerdict == the design's formula on every one of ${rows.length} rows, and names the deciding fact (wanted first, then the pause) — ${bad.length} mismatches`, bad.slice(0, 3));
  const n = rows.filter(formula).length;
  ok(n === 5, `exactly 5 of 192 rows are seamless (${n}): connected with no lease / chain / phone, AND either the app's own frame choice hides ours (4 rows: any csd × any setting) or a CSD app under Auto + the setting auto (1)`, n);
  const V = (o) => S.seamlessVerdict({ csd: true, setting: 'auto', userToggle: 'auto', lease: false, chain: false, phone: false, connected: true, ...o });
  ok(same(V({}), { seamless: true, why: 'csd' }), 'GNOME Calculator (decorations 0), defaults, connected, nobody else ⇒ seamless because of its CSD');
  ok(same(V({ csd: false }), { seamless: false, why: 'ssd' }), 'xterm (no decorations key) ⇒ not seamless — it has no title bar of its own');
  ok(same(V({ setting: 'off' }), { seamless: false, why: 'setting-off' }), 'desktop.seamless = off ⇒ never, for any CSD app (today\'s look back in one switch)');
  ok(same(V({ csd: false, userToggle: 'on' }), { seamless: true, why: 'user' }) && same(V({ setting: 'off', userToggle: 'on' }), { seamless: true, why: 'user' }), 'PRECEDENCE: the per-app choice "frame Off" (userToggle on) beats an SSD app AND the global off');
  ok(same(V({ userToggle: 'off' }), { seamless: false, why: 'user' }), 'PRECEDENCE: "frame On" (userToggle off) beats a CSD app');
  for (const [k, why] of [['lease', 'lease'], ['chain', 'chain'], ['phone', 'phone']]) ok(same(V({ [k]: true }), { seamless: false, why }) && same(V({ [k]: true, userToggle: 'on' }), { seamless: false, why }), `PAUSE ${k}: a CSD app is held — and so is a forced 'on' (the design's honest list: ${k === 'lease' ? 'the user must SEE an agent is driving' : k === 'chain' ? 'the tab bar lives in the title bar' : 'the title bar is a phone\'s only way back'})`);
  ok(same(V({ connected: false }), { seamless: false, why: 'disconnected' }), 'PAUSE disconnected: the status and Reconnect must show while the picture is not up');
  ok(S.isPaused(V({ lease: true })) && !S.isPaused(V({ csd: false })) && !S.isPaused(V({})), 'isPaused: a wanted-but-held verdict (the menu says "paused"), not an unwanted one');
  ok(S.normToggle('weird') === 'auto' && S.normSetting('on') === 'auto' && S.normSetting(undefined) === 'auto' && same(S.seamlessVerdict({ csd: true, connected: true, setting: 'bogus', userToggle: 42 }), { seamless: true, why: 'csd' }), 'unknown words are the defaults (auto) — never a throw, never a silent off');
  ok(S.seamlessVerdict().seamless === false && S.seamlessVerdict().why === 'ssd', 'no facts ⇒ not seamless (a window before its first main window)');
  // NEGATIVE CONTROL — a verdict that forgets the pauses (the naive "CSD ⇒ hide our bar")
  const src = read('src/lib/desktop-seamless.js');
  const pauses = "  if (phone) return { seamless: false, why: 'phone' };\n  if (!connected) return { seamless: false, why: 'disconnected' };\n  if (lease) return { seamless: false, why: 'lease' };\n  if (chain) return { seamless: false, why: 'chain' };\n";
  ok(src.split(pauses).length === 2, 'the four pauses are spelled once, in order (the control removes exactly them)');
  const Mnaive = await import(pathToFileURL(MUT.write('src/lib/desktop-seamless.js', src.replace(pauses, ''), 'nopause')).href);
  const badN = judge(Mnaive);
  ok(badN.length > 0 && badN.some((b) => b.r.lease && b.v.seamless), `CONTROL: the pause-less verdict fails the matrix (${badN.length} rows — e.g. an agent lease left seamless)`);
}

console.log('§2 the reveal arithmetic (revealStep): hover 250 ms, Alt, the 1.5 s linger, leave = fold');
{
  const run = (events) => { let st = S.revealInitial(); const out = []; for (const [t, ev] of events) { const r = S.revealStep(st, ev, t); st = r.state; out.push([t, r.revealed, r.wakeAt]); } return { st, out }; };
  ok(S.REVEAL_HOVER_MS === 250 && S.REVEAL_LINGER_MS === 1500 && S.HOT_ZONE_PX === 6, 'the numbers: 250 ms hover, 1.5 s linger, a 6 px hot zone (design §3.3 / D3)');
  let r = run([[1000, { type: 'zone-enter' }], [1100, { type: 'tick' }], [1249, { type: 'tick' }], [1250, { type: 'tick' }]]);
  ok(same(r.out.map((x) => x[1]), [false, false, false, true]) && r.out[0][2] === 1250, 'a hover of the hot zone reveals at exactly 250 ms (the enter names wakeAt = +250; 249 ms is not enough)', r.out);
  r = run([[1000, { type: 'zone-enter' }], [1200, { type: 'zone-leave' }], [1300, { type: 'tick' }]]);
  ok(r.out.every((x) => !x[1]) && r.out[1][2] === null, 'a pointer CROSSING the edge on its way into the app (200 ms) reveals nothing and leaves nothing pending', r.out);
  r = run([[1000, { type: 'zone-enter' }], [1250, { type: 'tick' }], [2000, { type: 'zone-leave' }], [3499, { type: 'tick' }], [3500, { type: 'tick' }]]);
  ok(same(r.out.map((x) => x[1]), [false, true, true, true, false]) && r.out[2][2] === 3500, 'revealed, then the pointer goes back INTO THE APP ⇒ the bars linger 1.5 s (wakeAt +1500), then fold', r.out);
  r = run([[1000, { type: 'zone-enter' }], [1250, { type: 'tick' }], [2000, { type: 'zone-leave' }], [2500, { type: 'zone-enter' }], [5000, { type: 'tick' }]]);
  ok(same(r.out.map((x) => x[1]), [false, true, true, true, true]), 'back onto the bars inside the linger ⇒ they stay (the fold is cancelled)', r.out);
  r = run([[1000, { type: 'zone-enter' }], [1250, { type: 'tick' }], [2000, { type: 'window-leave' }]]);
  ok(same(r.out.map((x) => x[1]), [false, true, false]) && r.out[2][2] === null, 'leaving the WINDOW folds at once ("leave = fold")', r.out);
  r = run([[1000, { type: 'alt', down: true }], [1500, { type: 'window-leave' }], [9000, { type: 'tick' }], [9100, { type: 'alt', down: false }], [10599, { type: 'tick' }], [10600, { type: 'tick' }]]);
  ok(same(r.out.map((x) => x[1]), [true, true, true, true, true, false]), 'Alt held reveals AT ONCE and holds through anything (even the pointer leaving); released ⇒ the 1.5 s linger, then fold', r.out);
  r = run([[1000, { type: 'alt', down: true }], [1100, { type: 'reset' }]]);
  ok(!r.out[1][1] && same(r.st, S.revealInitial()), 'a reset (the window stopped being seamless) folds and forgets everything');
  r = run([[1000, { type: 'alt', down: false }]]);
  ok(!r.out[0][1] && r.out[0][2] === null, 'an Alt release nobody pressed changes nothing');
}

console.log('§3 the other PURE words');
{
  const ops = [];
  for (let d = -1; d <= 12; d++) ops.push([d, S.moveResizeAction(d)]);
  ok(same(ops.map(([, a]) => a && (a.op + (a.dir ? ':' + a.dir : ''))), [null, 'resize:nw', 'resize:n', 'resize:ne', 'resize:e', 'resize:se', 'resize:s', 'resize:sw', 'resize:w', 'move', 'resize:se', 'move', 'cancel', null]), 'moveResizeAction over −1…12: X\'s SIZE_TOPLEFT…SIZE_LEFT ⇒ the handle names nw n ne e se s sw w, 8/10 ⇒ move, 9 ⇒ resize from se (keyboard: the mouse takes over), 11 ⇒ cancel, anything else null', ops);
  ok(S.moveResizeAction('8') !== null && S.moveResizeAction(8.5) === null && S.moveResizeAction(null) === null, 'an integer string counts, a fraction / null never');
  const W = S.windowStateAction;
  ok(W({ maximized: true }, {}) === 'maximize' && W({ maximized: true }, { maximized: true }) === null && W({ maximized: false }, { maximized: true }) === 'restore' && W({ maximized: false }, {}) === null, 'windowStateAction maximized: SET semantics — maximize only an unmaximized window, restore only a maximized one (an echo never flips it back)');
  ok(W({ iconic: true }, {}) === 'minimize' && W({ iconic: true }, { minimized: true }) === null && W({ iconic: false }, { minimized: true }) === null, 'iconic: minimize ours; an app becoming un-iconic never restores ours by itself (the user restores the window)');
  ok(W({ title: 'x' }, {}) === null && W(null) === null && W({}, { maximized: true }) === null, 'only ANNOUNCED keys act (a window born maximized, a title change: nothing)');
  ok(S.isCsd({ decorations: 0 }) && !S.isCsd({}) && !S.isCsd({ decorations: 1 }) && !S.isCsd({ decorations: false }) && !S.isCsd(null), 'isCsd ⇔ decorations === 0 exactly (§2.3 M3a: Calculator 0, xterm has no key)');
  ok(S.frameKeyOf({ appId: 'gnome-calculator', exec: '/usr/bin/gnome-calculator' }) === 'gnome-calculator' && S.frameKeyOf({ exec: '/usr/bin/xterm' }) === 'exec:xterm' && S.frameKeyOf({ exec: '/bin/we ird$' }) === 'exec:weird' && S.frameKeyOf({}) === null && S.frameKeyOf(null) === null, 'frameKeyOf: the registry app id, else exec:<basename> (cleaned), else null — every window of one app shares its choice');
  ok(S.frameChoiceOf({ 'gnome-calculator': 'on' }, 'gnome-calculator') === 'on' && S.frameChoiceOf({ x: 'junk' }, 'x') === 'auto' && S.frameChoiceOf(null, 'x') === 'auto' && S.frameChoiceOf({ toString: 'on' }, 'toString') === 'on' && S.frameChoiceOf({}, 'toString') === 'auto', 'frameChoiceOf: the stored word, own keys only, junk ⇒ auto');
  ok(same(S.setFrameChoice({ a: 'on' }, 'b', 'off'), { a: 'on', b: 'off' }) && same(S.setFrameChoice({ a: 'on' }, 'a', 'auto'), {}) && same(S.setFrameChoice(null, null, 'on'), {}), 'setFrameChoice: auto REMOVES the key (the map never grows by choices that change nothing); no key, no write');
  ok(same(S.frameMenuModel('off'), [{ choice: 'auto', current: false, disabled: false }, { choice: 'on', current: false, disabled: false }, { choice: 'off', current: true, disabled: true }]), 'frameMenuModel: Auto / On / Off, the current one checked and not offered again');
  ok(S.userToggleOfFrame('on') === 'off' && S.userToggleOfFrame('off') === 'on' && S.userToggleOfFrame('auto') === 'auto' && S.userToggleOfFrame('x') === 'auto', 'the ONE crossing: frame On ⇒ never seamless (userToggle off), frame Off ⇒ always seamless (on), Auto ⇒ auto');
}

console.log('§4 the REAL WindowManager seams over a fake DOM (the title bar\'s own drag, the handles\' own resize)');
{
  const docL = [];
  globalThis.document = {
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, append() {}, remove() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], elementFromPoint: () => null, body: { appendChild() {}, classList: { add() {}, remove() {}, contains: () => false } }, documentElement: { style: {}, classList: { add() {}, remove() {} } },
    addEventListener: (k, fn, o) => docL.push({ k, fn, o }), removeEventListener: (k, fn) => { const i = docL.findIndex((l) => l.k === k && l.fn === fn); if (i >= 0) docL.splice(i, 1); },
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
  const fireDoc = (k, ev) => { for (const l of [...docL]) if (l.k === k && !(l.o && l.o.signal && l.o.signal.aborted)) l.fn(ev); };
  const live = (k) => docL.filter((l) => l.k === k && !(l.o && l.o.signal && l.o.signal.aborted)).length;
  const { WindowManager } = await import('../src/lib/window.js');
  const mkEl = (w, h, l, t) => {
    const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => ({ dataset: { dir }, _l: {}, addEventListener(k, fn) { this._l[k] = fn; } }));
    const cls = new Set();
    const el = { style: { width: `${w}px`, height: `${h}px`, left: `${l}px`, top: `${t}px` }, handles, querySelectorAll: (sel) => (sel === '.resize-handle' ? handles : []), classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle() {}, contains: (c) => cls.has(c) }, cls };
    for (const [k, v] of [['offsetWidth', 'width'], ['offsetHeight', 'height'], ['offsetLeft', 'left'], ['offsetTop', 'top']]) Object.defineProperty(el, k, { configurable: true, get: () => parseFloat(el.style[v]) || 0 });
    return el;
  };
  const mkWm = () => {
    const wm = Object.create(WindowManager.prototype);
    Object.assign(wm, { windows: new Map(), grid: null, workspace: { offsetWidth: 1600, offsetHeight: 1000, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }) }, _hideMq: { matches: false },
      _settings: { get: (k) => (k === 'layout.enableDragSnap' ? false : undefined) }, snapIndicator: { style: {} }, gridOverlay: { classList: { add() {}, remove() {} } },
      _notify() { wm.notified = (wm.notified || 0) + 1; }, _scheduleOverlapUpdate() {}, _captureGridBounds() { wm.captured = (wm.captured || 0) + 1; }, _syncChainBounds() {}, _clearGridHighlight() {}, _detectTabMergeTarget: () => null, focusWindow(id) { wm.focused = id; } });
    return wm;
  };
  const wm = mkWm();
  const titleBar = { addEventListener(k, fn) { this[k] = fn; } };
  const win = { id: 'w1', element: mkEl(900, 620, 100, 80), titleBar, onResize() { win.resized = (win.resized || 0) + 1; }, gridBounds: null, _tabChain: null, isMaximized: false, isMinimized: false, _listenerCtl: new AbortController() };
  wm.windows.set('w1', win);
  wm._setupDrag(win); wm._setupResize(win);
  // (a) the MOVE: the press was at (300,120), GTK asked after the pointer had moved to (310,125); then it goes to (420,184)
  const started = wm.beginDragFromPointer('w1', { press: { clientX: 300, clientY: 120 }, at: { clientX: 310, clientY: 125 } });
  await sleep(20);
  ok(started === true && wm.focused === 'w1' && live('pointermove') === 1 && live('pointerup') === 1, 'beginDragFromPointer enters the title bar\'s drag (focused, fed by POINTER events — the pane cancelled its pointerdown, so no mouse events come)');
  ok(win.element.style.left === '110px' && win.element.style.top === '85px' && win.element.cls.has('dragging'), `the window already follows from the PRESS point (the gesture\'s first 10×5 px applied at once: ${win.element.style.left}, ${win.element.style.top})`);
  fireDoc('pointermove', { clientX: 420, clientY: 184, altKey: false, shiftKey: false, timeStamp: 10 });
  await sleep(20);
  ok(win.element.style.left === '220px' && win.element.style.top === '144px', `…and tracks the pointer (press → 420,184 = +120 / +64 ⇒ ${win.element.style.left}, ${win.element.style.top})`);
  fireDoc('pointerup', { clientX: 420, clientY: 184, altKey: false, shiftKey: false });
  await sleep(300);
  ok(!win.element.cls.has('dragging') && live('pointermove') === 0 && live('pointerup') === 0 && wm.captured >= 1 && win._isSnapped === false, 'the drop is the title bar\'s drop (bounds re-captured, free drop) and the per-drag pointer listeners are GONE with it');
  ok(wm.beginDragFromPointer('w1', {}) === false && wm.beginDragFromPointer('nope', { at: { clientX: 1, clientY: 1 } }) === false, 'no point / no window ⇒ no drag (false)');
  // (b) CANCEL mid-drag puts the window back
  wm.beginDragFromPointer('w1', { press: { clientX: 500, clientY: 300 } });
  fireDoc('pointermove', { clientX: 700, clientY: 500, altKey: false, shiftKey: false, timeStamp: 20 });
  await sleep(20);
  const moved = win.element.style.left;
  ok(wm.cancelPointerOp('w1') === true && win.element.style.left === '220px' && win.element.style.top === '144px' && !win.element.cls.has('dragging') && live('pointermove') === 0, `MOVERESIZE_CANCEL mid-drag: the window goes back (${moved} → ${win.element.style.left}) with no drop`);
  ok(wm.cancelPointerOp('w1') === false, 'a cancel with nothing in flight changes nothing (the CANCEL GTK sends on release arrives AFTER the drop)');
  // (c) the RESIZE: the handles' own path, the window's minimum holding
  wm.setMinSize('w1', { w: 500, h: 400 });
  ok(wm.beginResizeFromPointer('w1', 'se', { press: { clientX: 1000, clientY: 700 } }) === true && live('pointermove') === 1, 'beginResizeFromPointer (se) enters the handles\' resize, fed by pointer events');
  fireDoc('pointermove', { clientX: 400, clientY: 200, altKey: false });
  await sleep(20);
  ok(win.element.style.width === '500px' && win.element.style.height === '400px', `…the window\'s own minimum holds (a 600×500 shrink stops at ${win.element.style.width}×${win.element.style.height})`);
  fireDoc('pointerup', {});
  ok(live('pointermove') === 0 && win.resized >= 1, 'the release ends it (listeners gone, onResize — the pane refits)');
  const w0 = win.element.style.width;
  wm.beginResizeFromPointer('w1', 'e', { press: { clientX: 800, clientY: 300 } });
  fireDoc('pointermove', { clientX: 900, clientY: 300, altKey: false });
  await sleep(20);
  const grown = win.element.style.width;
  ok(wm.cancelPointerOp('w1') === true && win.element.style.width === w0 && grown === '600px', `CANCEL mid-resize: back to ${w0} (it had grown to ${grown})`);
  ok(wm.beginResizeFromPointer('w1', 'x', { press: { clientX: 1, clientY: 1 } }) === false, 'an unknown edge ⇒ no resize');
  win.isMaximized = true;
  ok(wm.beginResizeFromPointer('w1', 'se', { press: { clientX: 1, clientY: 1 } }) === false, 'a maximized window is never resized from an edge (its frame is the workspace)');
  win.isMaximized = false;
  // (d) a tab GUEST drags its chain's host (the title bar that carries the chain)
  const host = { id: 'h1', element: mkEl(700, 500, 10, 10), titleBar: { addEventListener() {} }, onResize() {}, gridBounds: null, isMaximized: false, isMinimized: false, _listenerCtl: new AbortController() };
  const chain = { tabs: ['h1', 'w1'], active: 1 };
  host._tabChain = chain; win._tabChain = chain;
  wm.windows.set('h1', host); wm._setupDrag(host);
  wm.beginDragFromPointer('w1', { press: { clientX: 100, clientY: 20 } });
  fireDoc('pointermove', { clientX: 150, clientY: 60, altKey: false, shiftKey: false, timeStamp: 30 });
  await sleep(20);
  ok(host.element.style.left === '60px' && host.element.style.top === '50px' && wm.focused === 'h1', `a guest in a chain drags the HOST (${host.element.style.left}, ${host.element.style.top})`);
  wm.cancelPointerOp('w1');
  ok(host.element.style.left === '10px', 'and a cancel names the guest, restores the host');
  // (e) FIX r1 — a drag off a MAXIMIZED window says the un-maximize (onResize), like every other un-maximize: the seamless
  // window's onResize is what tells the app's header bar (setAppState maximized:false). Without it the app kept its restore
  // glyph and its next click was dead (the verifier's repro on the real rung). A cancel that re-maximizes says so too.
  const maxLeg = (WM) => {
    const wm2 = mkWm(); Object.setPrototypeOf(wm2, WM.prototype);
    const w = { id: 'm1', element: mkEl(1600, 1000, 0, 0), titleBar: { addEventListener() {} }, gridBounds: null, _tabChain: null, isMaximized: true, isMinimized: false, prevBounds: { left: '100px', top: '80px', width: '900px', height: '620px' }, _listenerCtl: new AbortController(), calls: [] };
    w.onResize = () => w.calls.push(w.isMaximized);
    wm2.windows.set('m1', w); wm2._setupDrag(w);
    wm2.beginDragFromPointer('m1', { press: { clientX: 500, clientY: 15 } });
    fireDoc('pointermove', { clientX: 620, clientY: 79, altKey: false, shiftKey: false, timeStamp: 40 });
    return new Promise((res) => setTimeout(() => {
      const atUnmax = { max: w.isMaximized, width: w.element.style.width, calls: [...w.calls] };
      const cancelled = wm2.cancelPointerOp('m1');
      res({ atUnmax, cancelled, after: { max: w.isMaximized, width: w.element.style.width, calls: [...w.calls] } });
      w._listenerCtl.abort();
    }, 20));
  };
  const mx = await maxLeg(WindowManager);
  ok(!mx.atUnmax.max && mx.atUnmax.width === '900px' && same(mx.atUnmax.calls, [false]), `a drag off a MAXIMIZED window un-maximizes it (prevBounds ${mx.atUnmax.width}) and SAYS so — onResize once, seeing isMaximized false (${JSON.stringify(mx.atUnmax.calls)})`, mx);
  ok(mx.cancelled && mx.after.max && same(mx.after.calls, [false, true]), `…and a CANCEL mid-drag re-maximizes and says that too (${JSON.stringify(mx.after.calls)})`, mx);
  // NEGATIVE CONTROL: window.js without the two notifications (the pre-fix lane) — the same drag un-maximizes SILENTLY
  const wsrc = read('src/lib/window.js');
  const fixA = "          if (win.onResize) { try { win.onResize(); } catch {} }\n        }\n        // Restore pre-snap size when dragging out of a snap";
  const fixB = "        if (wasMax !== win.isMaximized && win.onResize) { try { win.onResize(); } catch {} } // a cancel that RE-maximizes says so too\n";
  ok(wsrc.split(fixA).length === 2 && wsrc.split(fixB).length === 2, 'CONTROL: each un-maximize notification is spelled exactly once in window.js (the control pulls exactly those)');
  const Wpre = await import(pathToFileURL(MUT.write('src/lib/window.js', wsrc.replace(fixA, "        }\n        // Restore pre-snap size when dragging out of a snap").replace(fixB, ''), 'premax')).href);
  const mxc = await maxLeg(Wpre.WindowManager);
  ok(!mxc.atUnmax.max && mxc.atUnmax.calls.length === 0 && mxc.after.max && mxc.after.calls.length === 0, `CONTROL: the pre-fix window.js un-maximizes on the drag and re-maximizes on the cancel with NO onResize (${JSON.stringify(mxc.after.calls)}) — the app is never told`, mxc);
}

console.log('§5 wiring pins');
{
  const schema = read('src/lib/settings-schema.js');
  ok(/'desktop\.seamless': \{\s*type: 'enum', default: 'auto', options: \[\s*\{ value: 'auto'[^\]]*\{ value: 'off'[^\]]*\],[\s\S]*?category: t\('Window'\), liveApply: true,/.test(schema), 'the setting: desktop.seamless, enum auto | off, default auto, category Window, liveApply');
  const daw = read('src/lib/desktop-app-window.js');
  ok(/app\.settings\.get\('desktop\.seamless'\)/.test(daw) && /app\.settings\.on\('desktop\.seamless', applySeamless\)/.test(daw), 'the setting is READ by the window and re-applied live (a setting with working code — §10)');
  ok(/entry\.started = a\.op === 'move' \? app\.wm\.beginDragFromPointer\(winInfo\.id, opts\) : app\.wm\.beginResizeFromPointer\(winInfo\.id, a\.dir, opts\);/.test(daw) && /app\.wm\.cancelPointerOp\(winInfo\.id\)/.test(daw) && /onMoveResize: onAppMoveResize/.test(daw), 'WIRING PIN: the view\'s onMoveResize → PURE moveResizeAction → WindowManager.beginDragFromPointer / beginResizeFromPointer / cancelPointerOp');
  ok(/const v = seamlessVerdict\(\{/.test(daw) && /lease: !!lease, chain: !!winInfo\._tabChain, phone: !!phoneMq\?\.matches, connected: viewConnected,/.test(daw) && /winInfo\.element\.classList\.toggle\('seamless', v\.seamless\)/.test(daw), 'WIRING PIN: the ONE verdict over the lease, the chain, the phone, the connection — and it is the only writer of .seamless');
  ok(/winInfo\.onChainChanged = applySeamless;/.test(daw) && /_notifyChainChange\(\[\.\.\.chain\.tabs\]\)/.test(read('src/lib/tab-group.js')) && /win\._tabChain = null;\n    this\._notifyChainChange\(\[win\.id\]\);/.test(read('src/lib/tab-group.js')), 'WIRING PIN: entering / leaving a tab chain re-decides (tab-group.js _notifyChainChange → winInfo.onChainChanged)');
  ok(/windowStateAction\(changed, \{ maximized: !!winInfo\.isMaximized, minimized: !!winInfo\.isMinimized \}\)/.test(daw) && /view\.setAppState\(\{ iconified: false \}\)/.test(daw), 'WIRING PIN: the app\'s own maximize / minimize → ours (SET semantics); our restore tells the display (iconified false)');
  const win = read('src/lib/window.js');
  ok(/const beginAt = \(x, y\) => \{/.test(win) && /beginAt\(e\.clientX, e\.clientY\);/.test(win) && /beginAt\(p0\.clientX, p0\.clientY\);/.test(win) && (win.match(/const processMove = \(e\) => \{/g) || []).length === 2, 'ONE drag implementation: the title bar\'s mousedown and beginDragFromPointer share beginAt → the same processMove (window.js still has exactly two processMove — the drag\'s and the resize\'s)');
  ok(/startResize\(handle\.dataset\.dir, e\.clientX, e\.clientY\);/.test(win) && /return startResize\(dir, p0\.clientX, p0\.clientY, \{ pointer: true, at \}\);/.test(win), 'ONE resize implementation: a handle\'s mousedown and beginResizeFromPointer share startResize');
  const css = read('public/style.css');
  ok(/\.window\.seamless > \.window-titlebar \{[^}]*height: 0;/.test(css) && /\.window\.seamless\.seamless-revealed > \.window-titlebar \{[^}]*height: var\(--title-height\)/.test(css) && !/\.window\.seamless[^{]*\{[^}]*display: none/.test(css), 'CSS: the bars FOLD to 0 height with a class (never display:none) and come back with .seamless-revealed');
  ok(/\.window\.seamless\.seamless-revealed \.picture-shell > \.desktop-bar \{[^}]*top: calc\(var\(--title-height\) \* var\(--ui-scale, 1\)\)/.test(css), 'CSS: the revealed strip sits under the revealed title bar at its VIEWPORT height (inside the counter-zoomed shell)');
  ok(/picture-shell-floating-chip > \.desktop-bar > \.desktop-copied-chip/.test(css) && /FLOATING_CHIP_MS = 10000/.test(read('src/lib/picture-shell.js')), 'the honest list: the plain-http copy chip FLOATS over a folded strip and hides itself after 10 s');
  ok(!/\.resize-handle[^{]*\.seamless|\.seamless[^{]*\.resize-handle/.test(css) && /\.window\.window-active \{ border-color: var\(--border-active\)/.test(css), 'the resize handles and the active window\'s 1 px border are untouched by seamless');
  // FIX r1 — the revealed bars sit UNDER the resize handles: the top edge's handle band stays a resize while they show
  const zOf = (re) => { const m = re.exec(css); return m ? Number(m[1]) : NaN; };
  const zHandle = zOf(/\n\.resize-handle \{[^}]*z-index: (\d+)/), zTb = zOf(/\.window\.seamless > \.window-titlebar \{[^}]*z-index: (\d+)/), zBar = zOf(/\.window\.seamless \.picture-shell > \.desktop-bar \{[^}]*z-index: (\d+)/);
  ok(zHandle === 10 && zTb < zHandle && zBar < zHandle && zBar < zTb && !/\.window\.seamless[^{]*\{[^}]*z-index: (\d{2,})/.test(css.replace(/\n\.resize-handle \{[^}]*\}/, '')), `CSS: the revealed title bar (z ${zTb}) and strip (z ${zBar}) stay below .resize-handle (z ${zHandle}) — a press on the top edge after the reveal is a RESIZE, not a drag`);
  // FIX r1 — the floating chip lives at the pane's BOTTOM-right (a CSD header bar draws ─ □ ✕ at the top-right)
  // every rule that places the floating chip / hint (the shared one + its own), joined — a `top:` in any of them is a finding
  const rulesOf = (sel) => [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].filter((m) => m[1].includes(`.picture-shell-floating-chip > .desktop-bar > ${sel}`)).map((m) => m[2]).join(';');
  const chipRule = rulesOf('.desktop-copied-chip'), hintRule = rulesOf('.desktop-copy-hint');
  ok(/bottom: 8px/.test(chipRule) && !/[\s;{]top:/.test(chipRule) && /bottom: 36px/.test(hintRule) && !/[\s;{]top:/.test(hintRule) && /\.picture-shell-floating-chip > \.desktop-bar \{ top: auto; bottom: 0; pointer-events: none; \}/.test(css), 'CSS: the floating copy chip sits at the pane\'s BOTTOM-right, the hint above it; the folded bar (still 0 high) moves to the pane\'s bottom edge and takes no pointer (never over a header bar\'s own buttons)');
  ok(/id: 'window\/desktop-app-frame'/.test(daw) && /id: 'window\/desktop-app-keep'/.test(daw) && /id: 'window\/desktop-app-stop'/.test(daw) && /id: 'window\/desktop-app-scale'/.test(daw), 'the escape hatch: the taskbar / window menu carries Show window frame ▸, Scale ▸, Keep running, Stop app');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const block = daw.slice(daw.indexOf('// ── SEAMLESS: the per-app'), daw.indexOf('export function openDesktopApp')) + daw.slice(daw.indexOf('// ── SEAMLESS: the verdict'), daw.indexOf('function onAppMain')) + daw.slice(daw.indexOf('const isXpraApp'));
  const keys = [...block.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")).concat([...schema.slice(schema.indexOf("'desktop.seamless'"), schema.indexOf("'desktop.backendPrefs'")).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")));
  const missing = [...new Set(keys)].filter((k) => !(k in zh) || !(k in ja));
  ok(keys.length >= 15 && missing.length === 0, `every t() key of the seamless words (the window's block, the menu rows, the setting) has zh + ja entries (${new Set(keys).size} keys)`, missing);
}

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
