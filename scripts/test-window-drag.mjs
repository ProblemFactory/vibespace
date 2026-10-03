#!/usr/bin/env node
// A RELEASE OVER A PANE THE PAGE CANNOT HEAR — the fast gate (lane-drag-release; userW's inc-muq7uk0f-e59s +
// inc-muq7wwfq-rruz, 2026-10-01: a PDF viewer dropped onto the cell of the Desktop window stayed where it was with the
// highlight on; a resize released over that window kept resizing when the pointer came back; the viewer could grow
// but not shrink). The title-bar drag and the resize ended on a document `mouseup`; a release on another window's
// iframe never reaches this document, noVNC's canvas stops its mouse events, and the PDF viewer's own page is an
// iframe (an inward resize lost every move). THE FIX: pointer capture at every drag's door (the title bar / the handle
// captures the pointer and feeds the drag from itself), ONE end door (PURE src/lib/drag-end.js names what ends a
// drag), the drag shield (body.wm-dragging ⇒ every window's content pointer-events:none).
//   §1 the PURE table: pointerup / pointercancel / lostpointercapture / blur / hidden / a move with no button ⇒ end;
//      another pointer, a move with the button, the page visible, an idle drag (a second end) ⇒ never;
//   §2 the REAL WindowManager over a fake DOM that models POINTER CAPTURE, bubbling, a swallowing iframe and a
//      noVNC-like pane: the incident (a drop released over the swallowing pane ⇒ ended ONCE, .dragging gone, the
//      highlight gone, the shield lifted, the drop applied, a further move moves nothing); every end kind for the drag
//      and the resize; D3 the drop onto an OCCUPIED cell takes that cell's box, the occupant's box untouched;
//      D5 the shrink table — (type × zoom × dpr): an inward corner drag ends at the floor (or the window's own
//      minimum), the opposite edges unmoved, the pointer delta read in layout px (viewport ÷ zoom); the setMinSize
//      census (no viewer feeds a window minimum — the refuted hypothesis, pinned); (f) verify r1 THE ICON DRAG
//      (tab-group.js — it still ended on the document's mouseup: a release over another window's iframe left the
//      source window INVISIBLE with its ghost): every end kind ⇒ ended once, the window visible again, never armed;
//      (g) verify r2 #1 THE OWNER GONE: a window CLOSED mid-drag (closeWindow aborts its listener controller first — the
//      feed died with it and body.wm-dragging stayed up for good, measured in chrome) ⇒ the three doors it owns end ONCE as
//      owner-gone and CANCEL (nothing dropped); (h) THE REMOVAL RULE (T2⑤): the fake DOM releases a capture whose element
//      leaves the document, as Chrome does ⇒ capture-lost once; (i) verify r2 #2 TWO FEEDS: a mouse + a touch drag hold the
//      shield as two holders — the first end leaves it up for the second;
//   §3 CONTROLS (scripts/mutant-copy.mjs, outside the tree): a drag-end copy per rule (that end no longer ends ⇒ the
//      drag stays armed), and the PRE-CAPTURE FEED (document mouse listeners, no capture, no shield) ⇒ the release
//      over the iframe and over the pane never arrives — the incident in the model;
//   §4 pins: the CSS shield + touch-action rules, ONE feed (src/lib/drag-feed.js registers DRAG_FEED's four events; the
//      four doors — title bar, handle, tab tear-off, icon — attach it; no document mouse feed anywhere), the hand-over's
//      pointerId, the xpra hold ending as the WM's drag does (verify r1 finding #2);
//   §5 THE DOOR CENSUS (verify r2 T1): grep-derived over src/lib — every document / window move-or-end listener is the
//      feed's or named with its reason; every feed door counted per file (window.js 2, tab-group.js 3, the twelve
//      handle-style doors on startPointerDrag); native HTML5 dragstart doors counted; three planted controls (a door put
//      back on the document's mouseup, the pre-census Resizer and minimap) ⇒ red.
// Prerequisite: `npm run build` (src/lib/build-version.js). ~1 s. Run: node scripts/test-window-drag.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } return !!c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = () => new Promise((r) => setTimeout(r, 4));
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first'); process.exit(1); }
const MUT = mutantCopies('wdrag', repo);

// ── §1 THE PURE TABLE ───────────────────────────────────────────────────────
console.log('§1 the end door (src/lib/drag-end.js)');
const DE = await import('../src/lib/drag-end.js');
{
  const st = { active: true, pointerId: 7 }, open = { active: true, pointerId: null };
  const T = [
    // [event, state, end, why]
    [{ type: 'pointerup', pointerId: 7 }, st, true, 'release'],
    [{ type: 'pointerup', pointerId: 7, buttons: 0 }, st, true, 'release'],
    [{ type: 'pointercancel', pointerId: 7 }, st, true, 'cancel'],
    [{ type: 'lostpointercapture', pointerId: 7 }, st, true, 'capture-lost'],
    [{ type: 'blur' }, st, true, 'blur'],
    [{ type: 'visibilitychange', hidden: true }, st, true, 'hidden'],
    [{ type: 'pointermove', pointerId: 7, buttons: 0 }, st, true, 'released-unseen'], // a release this page never saw
    [{ type: 'mouseup' }, open, true, 'release'], // the feed of a page without capture
    [{ type: 'pointerup' }, st, true, 'release'], // an event carrying no pointerId (a fake DOM) is the drag's own
    [{ type: 'pointerup', pointerId: 8 }, st, false, 'other-pointer'], // a second finger
    [{ type: 'pointercancel', pointerId: 8 }, st, false, 'other-pointer'],
    [{ type: 'lostpointercapture', pointerId: 8 }, st, false, 'other-pointer'],
    [{ type: 'pointermove', pointerId: 8, buttons: 0 }, st, false, 'other-pointer'],
    [{ type: 'pointermove', pointerId: 7, buttons: 1 }, st, false, 'moving'],
    [{ type: 'pointermove', pointerId: 7 }, st, false, 'moving'], // no buttons field (a synthetic move)
    [{ type: 'visibilitychange', hidden: false }, st, false, 'visible'],
    [{ type: 'pointerup', pointerId: 7 }, { active: false, pointerId: 7 }, false, 'idle'], // the second end
    [{ type: 'pointerup', pointerId: 7 }, null, false, 'idle'],
    [{ type: 'keydown' }, st, false, 'ignored'],
    [null, st, false, 'ignored'],
    [{ type: 'pointerup', pointerId: 9 }, open, true, 'release'], // a document feed holds no pointer: any pointer's release ends it
    [{ type: 'owner-gone', pointerId: 7 }, st, true, 'owner-gone'], // the feed's owner (the window) closed mid-drag (verify r2 #1)
    [{ type: 'owner-gone' }, open, true, 'owner-gone'],
    [{ type: 'owner-gone', pointerId: 8 }, st, false, 'other-pointer'],
  ];
  const bad = T.filter(([ev, s, end, why]) => { const v = DE.dragEndVerdict(ev, s); return v.end !== end || v.why !== why; }).map(([ev, s]) => JSON.stringify([ev, s]));
  ok(bad.length === 0, `dragEndVerdict: ${T.length} rows — release / cancel / capture lost / blur / hidden / no button / owner gone ⇒ end; another pointer, a held move, visible, idle, unknown ⇒ never${bad.length ? ' — ' + bad.join(' ; ') : ''}`);
  ok(same(DE.DRAG_FEED, { move: 'pointermove', up: 'pointerup', cancel: 'pointercancel', lost: 'lostpointercapture' }) && DE.SHIELD_CLASS === 'wm-dragging' && DE.feedTarget(true) === 'element' && DE.feedTarget(false) === 'document', 'the feed is the pointer events, the shield class is body.wm-dragging, the feed listens on the capturing element else the document');
  ok(!/\bimport\b|\brequire\s*\(/.test(read('src/lib/drag-end.js').replace(/\/\/.*$/gm, '')), 'drag-end.js is PURE (imports nothing)');
}

// ── a fake DOM with POINTER CAPTURE, bubbling, a swallowing iframe, a stopping pane ──
const CAPTURE = new Map(); // pointerId → the capturing node
const setBacked = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, f) => { if (f === undefined ? !s.has(c) : f) s.add(c); else s.delete(c); return s.has(c); }, contains: (c) => s.has(c), _s: s }; };
class Node {
  constructor(name, { parent = null, swallow = false } = {}) { this.name = name; this.parent = parent; this.swallow = swallow; this.listeners = {}; this.style = {}; this.dataset = {}; this.classList = setBacked(); this.children = []; if (parent) parent.children.push(this); }
  addEventListener(type, fn, opts) { (this.listeners[type] ||= []).push({ fn, opts: opts || {} }); }
  removeEventListener(type, fn) { const l = this.listeners[type]; if (!l) return; const i = l.findIndex((x) => x.fn === fn); if (i >= 0) l.splice(i, 1); }
  setPointerCapture(id) { if (id == null) throw new Error('NotFoundError'); CAPTURE.set(id, this); }
  releasePointerCapture(id) { if (CAPTURE.get(id) === this) CAPTURE.delete(id); }
  hasPointerCapture(id) { return CAPTURE.get(id) === this; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  live(type) { return (this.listeners[type] || []).filter((l) => !(l.opts.signal && l.opts.signal.aborted)).length; }
  /** THE REMOVAL RULE (verify r2 T2⑤): Chrome releases a pointer capture whose element — or an ancestor of it — leaves the
   *  document, and says so (lostpointercapture at the capturer); the node leaves its parent's children. */
  remove() {
    if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; }
    this.removed = true;
    for (const [id, node] of [...CAPTURE]) { let under = node === this; for (let n = node.parent; n && !under; n = n.parent) if (n === this) under = true; if (under) { CAPTURE.delete(id); fire(node, 'lostpointercapture', { pointerId: id }); } }
  }
}
const DOC = new Node('document');
DOC.body = new Node('body'); DOC.hidden = false; DOC.documentElement = { style: { setProperty() {} } };
DOC.querySelector = () => null; DOC.querySelectorAll = () => []; DOC.elementFromPoint = () => null; DOC.getElementById = () => null;
DOC.createElement = (tag) => { const n = new Node(tag); n.setAttribute = () => {}; n.appendChild = () => {}; n.append = () => {}; n.remove = () => {}; n.innerHTML = ''; return n; };
const WIN = new Node('window');
const POINTER = new Set(['pointerdown', 'pointermove', 'pointerup', 'pointercancel']);
/** The browser's dispatch: a captured pointer event goes to its capturer (then bubbles to the document); an event on a
 *  swallowing node (an iframe) reaches nothing of ours; otherwise target → ancestors → document, a stopped event no
 *  further; pointerup / pointercancel release an implicit capture and say so (lostpointercapture). */
function fire(target, type, init = {}) {
  const ev = { type, ...init, target, stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} };
  let node = target;
  if ((POINTER.has(type) || type === 'lostpointercapture') && ev.pointerId != null && CAPTURE.has(ev.pointerId)) node = CAPTURE.get(ev.pointerId);
  else if (target.swallow) return ev;
  for (let n = node; n; n = n.parent) {
    for (const { fn, opts } of [...(n.listeners[type] || [])]) { if (opts.signal && opts.signal.aborted) continue; fn(ev); }
    if (ev.stopped) break;
  }
  if (!ev.stopped) for (const { fn, opts } of [...(DOC.listeners[type] || [])]) { if (!(opts.signal && opts.signal.aborted)) fn(ev); }
  if ((type === 'pointerup' || type === 'pointercancel') && ev.pointerId != null && CAPTURE.has(ev.pointerId)) { const c = CAPTURE.get(ev.pointerId); CAPTURE.delete(ev.pointerId); fire(c, 'lostpointercapture', { pointerId: ev.pointerId }); }
  return ev;
}
const fireWin = (type, init = {}) => { for (const { fn, opts } of [...(WIN.listeners[type] || [])]) if (!(opts.signal && opts.signal.aborted)) fn({ type, ...init }); };

globalThis.document = DOC;
globalThis.window = globalThis;
globalThis.addEventListener = (t, fn, o) => WIN.addEventListener(t, fn, o); globalThis.removeEventListener = (t, fn) => WIN.removeEventListener(t, fn);
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const PREFS = {}; globalThis.localStorage = { getItem: (k) => (k in PREFS ? PREFS[k] : null), setItem: (k, v) => { PREFS[k] = String(v); }, removeItem: (k) => { delete PREFS[k]; } };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.devicePixelRatio = 1;

const { WindowManager } = await import('../src/lib/window.js');
const U = await import('../src/lib/utils.js');
const setZoom = (pct) => { PREFS['vibespace.uiScale'] = String(pct); U.applyUiPrefs(); return U.uiScale(); };

const mkEl = (w, h, l, t, { swallow = false } = {}) => {
  const el = new Node('window-el');
  Object.assign(el.style, { width: `${w}px`, height: `${h}px`, left: `${l}px`, top: `${t}px` });
  el.handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => { const hn = new Node('handle-' + dir, { parent: el }); hn.dataset.dir = dir; return hn; });
  el.querySelectorAll = (sel) => (sel === '.resize-handle' ? el.handles : []);
  el.querySelector = (sel) => { const m = /\.resize-handle\.resize-(\w+)/.exec(sel); return m ? el.handles.find((hn) => hn.dataset.dir === m[1]) || null : null; };
  el.content = new Node('window-content', { parent: el, swallow });
  for (const [k, v] of [['offsetWidth', 'width'], ['offsetHeight', 'height'], ['offsetLeft', 'left'], ['offsetTop', 'top']]) Object.defineProperty(el, k, { configurable: true, get: () => parseFloat(el.style[v]) || 0 });
  return el;
};
const mkWm = (WM = WindowManager, { grid = null } = {}) => {
  const wm = Object.create(WM.prototype);
  const cells = Array.from({ length: grid ? grid.rows * grid.cols : 0 }, () => ({ classList: setBacked() }));
  Object.assign(wm, {
    windows: new Map(), grid, workspace: { offsetWidth: 1600, offsetHeight: 1000, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }) }, _hideMq: { matches: false },
    _settings: { get: (k) => (k === 'layout.enableDragSnap' ? !!grid : k === 'layout.enableShiftDragSelection' ? false : undefined) },
    snapIndicator: { style: {} }, gridOverlay: { classList: setBacked(), cells, querySelectorAll: (sel) => (sel === '.grid-cell' ? cells : []) },
    _notify() { wm.notified = (wm.notified || 0) + 1; }, _scheduleOverlapUpdate() {}, _captureGridBounds() { wm.captured = (wm.captured || 0) + 1; }, _syncChainBounds() {}, _detectTabMergeTarget: () => null, focusWindow(id) { wm.focused = id; },
  });
  wm.lit = () => cells.map((c, i) => (c.classList.contains('highlight') ? i : -1)).filter((i) => i >= 0);
  return wm;
};
const mkWin = (wm, id, box, { minW = null, minH = null, swallow = false } = {}) => {
  const el = mkEl(box.w, box.h, box.l, box.t, { swallow });
  const titleBar = new Node('titlebar', { parent: el });
  const win = { id, element: el, titleBar, onResize() { win.resized = (win.resized || 0) + 1; }, gridBounds: null, _tabChain: null, isMaximized: false, isMinimized: false, prevBounds: null, _listenerCtl: new AbortController(), minWidth: minW, minHeight: minH };
  const ends = []; Object.defineProperty(win, '_lastDragEnd', { configurable: true, get: () => ends[ends.length - 1] || null, set: (v) => { ends.push(v); } }); win.dragEnds = ends;
  const rends = []; Object.defineProperty(win, '_lastResizeEnd', { configurable: true, get: () => rends[rends.length - 1] || null, set: (v) => { rends.push(v); } }); win.resizeEnds = rends;
  wm.windows.set(id, win); wm._setupDrag(win); wm._setupResize(win);
  return win;
};
const box = (win) => ({ left: parseFloat(win.element.style.left), top: parseFloat(win.element.style.top), width: parseFloat(win.element.style.width), height: parseFloat(win.element.style.height) });
const shieldOn = () => DOC.body.classList.contains('wm-dragging');
// the panes under the pointer: an iframe (nothing of ours hears it) and a noVNC-like canvas (stops its mouse events)
const IFRAME = new Node('iframe', { parent: DOC.body, swallow: true });
const PANE = new Node('canvas', { parent: DOC.body });
for (const t of ['mousedown', 'mousemove', 'mouseup']) PANE.addEventListener(t, (e) => { e.stopPropagation(); e.preventDefault(); });

/** A title-bar drag: press (pointerId), two moves (past the 5 px threshold), then the end given — at the node given. */
const dragThen = async (win, { end, at = IFRAME, pid = 7, to = { x: 700, y: 500 } }) => {
  fire(win.titleBar, 'pointerdown', { pointerId: pid, button: 0, isPrimary: true, clientX: 300, clientY: 120 });
  fire(at, 'pointermove', { pointerId: pid, buttons: 1, clientX: 400, clientY: 200 }); await tick();
  fire(at, 'pointermove', { pointerId: pid, buttons: 1, clientX: to.x, clientY: to.y }); await tick();
  const mid = { dragging: win.element.classList.contains('dragging'), shield: shieldOn(), box: box(win), captured: CAPTURE.get(pid) === win.titleBar, lit: typeof win._wm?.lit === 'function' ? win._wm.lit() : null };
  if (end === 'pointerup' || end === 'pointercancel' || end === 'lostpointercapture') fire(at, end, { pointerId: pid, buttons: 0, clientX: to.x, clientY: to.y });
  else if (end === 'blur') fireWin('blur');
  else if (end === 'hidden') { DOC.hidden = true; fire(DOC, 'visibilitychange', {}); DOC.hidden = false; }
  else if (end === 'buttons0') fire(at, 'pointermove', { pointerId: pid, buttons: 0, clientX: to.x, clientY: to.y });
  else if (end === 'mouseup') fire(at, 'mouseup', { clientX: to.x, clientY: to.y });
  await tick();
  const after = { dragging: win.element.classList.contains('dragging'), shield: shieldOn(), box: box(win), ends: [...win.dragEnds], feed: win.titleBar.live('pointermove') + DOC.live('pointermove') + DOC.live('mousemove') };
  // a further move with the button: a drag still armed would follow it
  fire(win.titleBar, 'pointermove', { pointerId: pid, buttons: 1, clientX: to.x + 150, clientY: to.y + 90 }); await tick();
  fire(DOC, 'mousemove', { clientX: to.x + 150, clientY: to.y + 90 }); await tick();
  const armed = box(win).left !== after.box.left || box(win).top !== after.box.top;
  // a second end is a no-op
  fire(at, 'pointerup', { pointerId: pid, buttons: 0, clientX: to.x + 1, clientY: to.y + 1 }); await tick();
  return { mid, after, armed, endsAfterSecond: [...win.dragEnds] };
};
/** A resize from the SE handle: press, a move, then the end given at the node given. */
const resizeThen = async (win, { end, at = IFRAME, pid = 9, dx = 200, dy = 150 }) => {
  const h = win.element.handles.find((x) => x.dataset.dir === 'se');
  const b0 = box(win);
  fire(h, 'pointerdown', { pointerId: pid, button: 0, isPrimary: true, clientX: 500, clientY: 500 });
  fire(at, 'pointermove', { pointerId: pid, buttons: 1, clientX: 500 + dx, clientY: 500 + dy }); await tick();
  const mid = { op: !!win._resizeOp, shield: shieldOn(), box: box(win), captured: CAPTURE.get(pid) === h };
  if (end === 'pointerup' || end === 'pointercancel' || end === 'lostpointercapture') fire(at, end, { pointerId: pid, buttons: 0, clientX: 500 + dx, clientY: 500 + dy });
  else if (end === 'blur') fireWin('blur');
  else if (end === 'hidden') { DOC.hidden = true; fire(DOC, 'visibilitychange', {}); DOC.hidden = false; }
  else if (end === 'buttons0') fire(at, 'pointermove', { pointerId: pid, buttons: 0, clientX: 500 + dx, clientY: 500 + dy });
  else if (end === 'mouseup') fire(at, 'mouseup', {});
  await tick();
  const after = { op: !!win._resizeOp, shield: shieldOn(), box: box(win), ends: [...win.resizeEnds], resized: win.resized || 0 };
  fire(h, 'pointermove', { pointerId: pid, buttons: 1, clientX: 500 + dx + 100, clientY: 500 + dy + 60 }); await tick();
  fire(DOC, 'mousemove', { clientX: 500 + dx + 100, clientY: 500 + dy + 60 }); await tick();
  const armed = box(win).width !== after.box.width || box(win).height !== after.box.height;
  fire(at, 'pointerup', { pointerId: pid, buttons: 0 }); await tick();
  return { b0, mid, after, armed, endsAfterSecond: [...win.resizeEnds] };
};

// ── §2 THE REAL WindowManager ───────────────────────────────────────────────
console.log('§2 the real WindowManager over the fake DOM: the incident, every end kind, the occupied cell, the shrink table');
{
  // (a) THE INCIDENT, fixed: a drop released over an iframe
  const wm = mkWm(); const win = mkWin(wm, 'v', { w: 500, h: 400, l: 100, t: 80 });
  const r = await dragThen(win, { end: 'pointerup', at: IFRAME });
  ok(r.mid.captured && r.mid.dragging && r.mid.shield && r.mid.box.left === 500 && r.mid.box.top === 460, `the title bar CAPTURED the pointer; mid-drag the window follows the pointer (${r.mid.box.left},${r.mid.box.top}), .dragging on, the shield on`, r.mid);
  ok(!r.after.dragging && !r.after.shield && r.after.ends.length === 1 && r.after.ends[0] === 'release' && r.after.feed === 0 && !r.armed && r.endsAfterSecond.length === 1 && (wm.captured || 0) >= 0,
    'a release OVER THE IFRAME ends the drag ONCE (release; .dragging gone, the shield lifted, the feed gone), a further move with the button moves nothing, a second release is a no-op', { after: r.after, armed: r.armed, ends2: r.endsAfterSecond });
  ok(r.after.box.left === 500 && r.after.box.top === 460, 'the drop is APPLIED where the pointer released (a free drop: the window stays where it followed the pointer)', r.after.box);
  // (a2) …and over the noVNC-like pane (it stops mouse events; the pointer event is the capturer's)
  const r2 = await dragThen(mkWin(wm, 'v2', { w: 500, h: 400, l: 100, t: 80 }), { end: 'pointerup', at: PANE, pid: 11 });
  ok(!r2.after.dragging && r2.after.ends.length === 1 && !r2.armed, 'a release over the noVNC-like pane ends it too (the pointer is captured — what the pane stops never mattered)', r2.after);

  // (b) EVERY END KIND, the drag
  const kinds = ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'hidden', 'buttons0'];
  const why = { pointerup: 'release', pointercancel: 'cancel', lostpointercapture: 'capture-lost', blur: 'blur', hidden: 'hidden', buttons0: 'released-unseen' };
  const rows = [];
  for (const k of kinds) {
    const w = mkWin(wm, 'd-' + k, { w: 500, h: 400, l: 100, t: 80 });
    const x = await dragThen(w, { end: k, at: IFRAME, pid: 20 + kinds.indexOf(k) });
    rows.push([k, x.after.ends.join(','), x.after.dragging, x.after.shield, x.armed, x.endsAfterSecond.length, x.after.box.left, x.after.box.top]);
  }
  const badRows = rows.filter(([k, ends, dragging, shield, armed, n, l, t]) => ends !== why[k] || dragging || shield || armed || n !== 1 || l !== 500 || t !== 460);
  ok(badRows.length === 0, `the drag: ${kinds.length} end kinds ⇒ ended ONCE with its own cause, .dragging gone, the shield lifted, the drop applied at the last point (500,460 — blur / hidden / capture lost carry no point), never armed again${badRows.length ? ' — ' + JSON.stringify(badRows) : ''}`);
  // the drag's window blur: the capture feed on a titleBar WITHOUT capture (a browser refusing it) still ends on every kind
  {
    const w = mkWin(wm, 'nocap', { w: 500, h: 400, l: 100, t: 80 }); w.titleBar.setPointerCapture = undefined;
    const x = await dragThen(w, { end: 'pointerup', at: DOC.body, pid: 31 });
    ok(!x.mid.captured && DOC.live('pointermove') === 0 && x.after.ends.join() === 'release' && !x.armed, 'no capture available ⇒ the feed falls to the document and still ends on the release (the feed gone after)', x.after);
  }

  // (c) EVERY END KIND, the resize
  const rrows = [];
  for (const k of kinds) {
    const w = mkWin(wm, 'r-' + k, { w: 500, h: 400, l: 100, t: 80 });
    const x = await resizeThen(w, { end: k, at: IFRAME, pid: 40 + kinds.indexOf(k) });
    rrows.push([k, x.mid.captured, x.mid.op, x.mid.shield, x.mid.box.width, x.after.ends.join(','), x.after.op, x.after.shield, x.armed, x.endsAfterSecond.length, x.after.resized, x.after.box.width, x.after.box.height]);
  }
  const badR = rrows.filter(([k, cap, op, sh, w, ends, opA, shA, armed, n, resized, W, H]) => !cap || !op || !sh || w !== 700 || ends !== why[k] || opA || shA || armed || n !== 1 || resized < 1 || W !== 700 || H !== 550);
  ok(badR.length === 0, `the resize: the handle captures the pointer, a move grows the window (700×550), ${kinds.length} end kinds ⇒ ended ONCE (_resizeOp null, the shield lifted, onResize told), never armed again${badR.length ? ' — ' + JSON.stringify(badR) : ''}`);
  // the explicit cancel (X's MOVERESIZE_CANCEL) still puts the window back and lifts the shield
  {
    const w = mkWin(wm, 'rc', { w: 500, h: 400, l: 100, t: 80 });
    const h = w.element.handles.find((x) => x.dataset.dir === 'e');
    fire(h, 'pointerdown', { pointerId: 50, button: 0, isPrimary: true, clientX: 600, clientY: 300 });
    fire(IFRAME, 'pointermove', { pointerId: 50, buttons: 1, clientX: 700, clientY: 300 }); await tick();
    const grown = box(w).width;
    ok(grown === 600 && wm.cancelPointerOp('rc') === true && box(w).width === 500 && !shieldOn() && !w._resizeOp && CAPTURE.get(50) !== h, `cancelPointerOp mid-resize: back to 500 (from ${grown}), the shield lifted, the capture released`);
  }

  // (d) D3 — the drop onto an OCCUPIED cell: a 2×3 grid, a Desktop-like window in cell 4, the viewer dropped there
  {
    const wg = mkWm(WindowManager, { grid: { rows: 2, cols: 3 } });
    const cellBox = (idx) => { const g = 4, cw = (1600 - g * 4) / 3, ch = (1000 - g * 3) / 2; return { left: g + (idx % 3) * (cw + g), top: g + Math.floor(idx / 3) * (ch + g), width: cw, height: ch }; };
    const occupant = mkWin(wg, 'desk', { w: 1, h: 1, l: 0, t: 0 }); wg._positionToCell(occupant, 4, false);
    const ob = box(occupant);
    const viewer = mkWin(wg, 'viewer', { w: 500, h: 400, l: 10, t: 10 }); viewer._wm = wg;
    const c4 = cellBox(4), centre = { x: c4.left + c4.width / 2, y: c4.top + c4.height / 2 };
    const x = await dragThen(viewer, { end: 'pointerup', at: IFRAME, pid: 60, to: centre });
    const near = (a, b) => Math.abs(a - b) <= 1;
    ok(same(x.mid.lit, [4]) && wg.lit().length === 0, `mid-drag the highlight is cell 4 (keyed by index); after the end door it is gone (${JSON.stringify(x.mid.lit)} → ${JSON.stringify(wg.lit())})`);
    ok(near(x.after.box.left, c4.left) && near(x.after.box.top, c4.top) && near(x.after.box.width, c4.width) && near(x.after.box.height, c4.height), `the viewer takes cell 4's box exactly as an empty cell's (${JSON.stringify(x.after.box)})`, { box: x.after.box, c4 });
    ok(same(box(occupant), ob) && near(ob.left, c4.left) && viewer._isSnapped === true && !x.armed, 'the occupant keeps its box (two windows share the cell — a cell is a position, never a slot); the viewer is snapped; the drag is not armed');
  }

  // (e) D5 — THE SHRINK TABLE (type × zoom × dpr): an inward corner drag ends at the floor / the window's own minimum
  {
    const TYPES = [['viewer', null], ['editor', null], ['browser', null], ['desktop-app', { w: 500, h: 400 }]];
    const rows5 = [];
    for (const [type, own] of TYPES) for (const zoom of [1, 0.9, 1.25]) for (const dpr of [1, 2, 2.2]) {
      globalThis.devicePixelRatio = dpr;
      const z = setZoom(Math.round(zoom * 100));
      const wm5 = mkWm();
      const w = mkWin(wm5, `s-${type}-${zoom}-${dpr}`, { w: 1000, h: 700, l: 40, t: 40 }, own ? { minW: own.w, minH: own.h } : {});
      w.element.content.swallow = true; // the viewer's own page (an iframe) under the inward pointer
      const expW = own ? own.w : 320, expH = own ? own.h : 180;
      const dx = -((1000 - expW) + 60) * z, dy = -((700 - expH) + 60) * z; // viewport px: past the floor by 60 layout px
      const x = await resizeThen(w, { end: 'pointerup', at: w.element.content, pid: 70, dx, dy });
      // the delta space: a −90 viewport px move at zoom 0.9 is −100 layout px
      const w2 = mkWin(wm5, `z-${type}-${zoom}-${dpr}`, { w: 1000, h: 700, l: 40, t: 40 });
      const y = await resizeThen(w2, { end: 'pointerup', at: w2.element.content, pid: 71, dx: -90, dy: -45 }); // a FIXED −90 viewport px: −90 ÷ zoom layout px
      rows5.push({ type, zoom, dpr, z, after: x.after.box, ended: !x.after.op && !x.armed && x.after.ends.join() === 'release', delta: y.after.box.width });
    }
    setZoom(100); globalThis.devicePixelRatio = 1;
    const bad5 = rows5.filter((r) => { const own = TYPES.find(([t]) => t === r.type)[1]; const eW = own ? own.w : 320, eH = own ? own.h : 180; return Math.abs(r.z - r.zoom) > 1e-9 || r.after.width !== eW || r.after.height !== eH || r.after.left !== 40 || r.after.top !== 40 || !r.ended || Math.abs(r.delta - (1000 - 90 / r.z)) > 0.5; });
    ok(bad5.length === 0, `D5: ${rows5.length} rows (viewer / editor / browser / desktop-app × zoom 1, 0.9, 1.25 × dpr 1, 2, 2.2) — an inward SE drag over the window's own page shrinks it to the floor 320×180 (a desktop app: its own 500×400), left/top unmoved, the resize ended; a −90 viewport px move reads as −90 ÷ zoom layout px (1000 → 910 / 900 / 928)${bad5.length ? ' — ' + JSON.stringify(bad5.slice(0, 3)) : ''}`);
    // the refuted hypothesis, pinned: no viewer / editor / browser window feeds a minimum of its own
    const writers = fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js') && /\bsetMinSize\(/.test(read('src/lib/' + f).replace(/\/\/.*$/gm, '')) && f !== 'window.js').sort();
    ok(same(writers, ['desktop-app-window.js']), `setMinSize's only caller is the desktop-app window (${writers.join(', ')}) — a viewer's minimum is the window floor, never its page's size`);
    ok(!/min-(width|height)/.test(read('public/viewers.css').match(/\.media-pdf \{[^}]*\}/)?.[0] || '') && !/min-(width|height)/.test(read('public/viewers.css').match(/\.media-content \{[^}]*\}/)?.[0] || ''), 'the PDF frame and the media content carry no CSS minimum');
  }

  // (f) THE ICON DRAG (tab-group.js _setupIconDrag; verify r1 finding #1 — it ended on the document's mouseup: a release
  //     over another window's iframe left the source window INVISIBLE with its ghost on screen): the icon captures the
  //     pointer; every end kind ⇒ ended once, the window visible again, the shield lifted, never armed
  {
    const { installTabGroupMixin } = await import('../src/lib/tab-group.js');
    const wmI = mkWm(); installTabGroupMixin(wmI);
    if (typeof DOC.body.appendChild !== 'function') DOC.body.appendChild = (n) => n; // the ghost is a body child
    const kinds = ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'hidden', 'buttons0'];
    const why = { pointerup: 'release', pointercancel: 'cancel', lostpointercapture: 'capture-lost', blur: 'blur', hidden: 'hidden', buttons0: 'released-unseen' };
    const irows = [];
    for (const k of kinds) {
      const w = mkWin(wmI, 'i-' + k, { w: 500, h: 400, l: 100, t: 80 });
      w.iconWrap = new Node('icon', { parent: w.titleBar }); w.title = 'win'; w._typeIcon = ''; w.backendIconSlot = null;
      const ends = []; Object.defineProperty(w, '_lastIconDragEnd', { configurable: true, get: () => ends[ends.length - 1] || null, set: (v) => { ends.push(v); } });
      wmI._setupIconDrag(w);
      const pid = 110 + kinds.indexOf(k);
      fire(w.iconWrap, 'pointerdown', { pointerId: pid, button: 0, isPrimary: true, clientX: 120, clientY: 90 });
      const titleDragToo = w.element.classList.contains('dragging') || CAPTURE.get(pid) === w.titleBar; // the icon's press is stopped before the title bar's door
      fire(IFRAME, 'pointermove', { pointerId: pid, buttons: 1, clientX: 200, clientY: 160 }); await tick();
      fire(IFRAME, 'pointermove', { pointerId: pid, buttons: 1, clientX: 700, clientY: 500 }); await tick();
      const mid = { captured: CAPTURE.get(pid) === w.iconWrap, hidden: w.element.style.visibility === 'hidden', shield: shieldOn() };
      if (k === 'pointerup' || k === 'pointercancel' || k === 'lostpointercapture') fire(IFRAME, k, { pointerId: pid, buttons: 0, clientX: 700, clientY: 500 });
      else if (k === 'blur') fireWin('blur');
      else if (k === 'hidden') { DOC.hidden = true; fire(DOC, 'visibilitychange', {}); DOC.hidden = false; }
      else if (k === 'buttons0') fire(IFRAME, 'pointermove', { pointerId: pid, buttons: 0, clientX: 700, clientY: 500 });
      await tick();
      const after = { ends: [...ends], visible: w.element.style.visibility !== 'hidden', shield: shieldOn(), feed: w.iconWrap.live('pointermove') + DOC.live('pointermove') + DOC.live('mousemove') }; // the fake node's style starts empty (a real element's is ''): judged as not hidden
      fire(w.iconWrap, 'pointermove', { pointerId: pid, buttons: 1, clientX: 800, clientY: 600 }); await tick(); // a drag still armed keeps the source window hidden
      fire(DOC, 'mousemove', { clientX: 800, clientY: 600 }); await tick();
      const armed = w.element.style.visibility === 'hidden';
      fire(IFRAME, 'pointerup', { pointerId: pid, buttons: 0, clientX: 800, clientY: 600 }); await tick(); // a second end is a no-op
      irows.push([k, !titleDragToo, mid.captured, mid.hidden, mid.shield, after.ends.join(','), after.visible, after.shield, after.feed, armed, ends.length]);
    }
    const badI = irows.filter(([k, own, cap, hid, sh, ends, vis, shA, feed, armed, n]) => !own || !cap || !hid || !sh || ends !== why[k] || !vis || shA || feed !== 0 || armed || n !== 1);
    ok(badI.length === 0, `the ICON drag: the icon captures the pointer (the title bar's door never sees the press), mid-drag the source window is hidden behind its ghost and the shield is on; ${kinds.length} end kinds ⇒ ended ONCE with its own cause, the window visible again, the shield lifted, the feed gone, never armed${badI.length ? ' — ' + JSON.stringify(badI) : ''}`);
  }

  // (g) THE OWNER GONE (verify r2 finding #1): the window CLOSED mid-drag — closeWindow aborts win._listenerCtl FIRST, which
  //     took the feed with it: no end door ran, body.wm-dragging stayed up (every window's content pointer-events:none until
  //     another drag ended — measured in chrome), the grid overlay + highlight stayed, the icon's ghost stayed. Now the feed
  //     ENDS the drag it fed (owner-gone) and the door CANCELS: nothing is dropped for a window that is leaving
  {
    const liveGhosts = new Set();
    DOC.body.appendChild = (n) => { liveGhosts.add(n); n.remove = () => { liveGhosts.delete(n); }; return n; };
    const rows = [];
    { // the title drag, on a grid (the highlight lit mid-drag)
      const wm = mkWm(WindowManager, { grid: { rows: 2, cols: 3 } }); const win = mkWin(wm, 'og-t', { w: 500, h: 400, l: 100, t: 80 });
      fire(win.titleBar, 'pointerdown', { pointerId: 130, button: 0, isPrimary: true, clientX: 300, clientY: 120 });
      fire(IFRAME, 'pointermove', { pointerId: 130, buttons: 1, clientX: 400, clientY: 200 }); await tick();
      fire(IFRAME, 'pointermove', { pointerId: 130, buttons: 1, clientX: 900, clientY: 300 }); await tick();
      const mid = shieldOn() && win.element.classList.contains('dragging') && wm.lit().length === 1 && win.titleBar.live('pointermove') === 1;
      wm.closeWindow('og-t'); await tick();
      fire(IFRAME, 'pointerup', { pointerId: 130, buttons: 0, clientX: 900, clientY: 300 }); await tick();
      await new Promise((r) => setTimeout(r, 300)); // past the drop's 250 ms bounds-capture timer: a cancel arms none
      rows.push(['title', mid, { ends: win.dragEnds.join(), shield: shieldOn(), lit: wm.lit().length, grid: wm.gridOverlay.classList.contains('dragging'), feed: win.titleBar.live('pointermove'), gone: !wm.windows.has('og-t') && !!win.element.removed, captured: wm.captured || 0, snapped: !!win._isSnapped }]);
    }
    { // the resize
      const wm = mkWm(); const win = mkWin(wm, 'og-r', { w: 500, h: 400, l: 100, t: 80 });
      const h = win.element.handles.find((x) => x.dataset.dir === 'se');
      fire(h, 'pointerdown', { pointerId: 131, button: 0, isPrimary: true, clientX: 600, clientY: 480 });
      fire(IFRAME, 'pointermove', { pointerId: 131, buttons: 1, clientX: 700, clientY: 560 }); await tick();
      const mid = shieldOn() && !!win._resizeOp && box(win).width === 600;
      wm.closeWindow('og-r'); await tick();
      fire(IFRAME, 'pointerup', { pointerId: 131, buttons: 0, clientX: 700, clientY: 560 }); await tick();
      rows.push(['resize', mid, { ends: win.resizeEnds.join(), shield: shieldOn(), op: !!win._resizeOp, box: box(win), gone: !wm.windows.has('og-r') }]);
    }
    { // the icon drag
      const { installTabGroupMixin } = await import('../src/lib/tab-group.js');
      const wm = mkWm(); installTabGroupMixin(wm);
      const w = mkWin(wm, 'og-i', { w: 500, h: 400, l: 100, t: 80 });
      w.iconWrap = new Node('icon', { parent: w.titleBar }); w.title = 'win'; w._typeIcon = ''; w.backendIconSlot = null;
      const ends = []; Object.defineProperty(w, '_lastIconDragEnd', { configurable: true, get: () => ends[ends.length - 1] || null, set: (v) => { ends.push(v); } });
      wm._setupIconDrag(w);
      fire(w.iconWrap, 'pointerdown', { pointerId: 132, button: 0, isPrimary: true, clientX: 120, clientY: 90 });
      fire(IFRAME, 'pointermove', { pointerId: 132, buttons: 1, clientX: 200, clientY: 160 }); await tick();
      fire(IFRAME, 'pointermove', { pointerId: 132, buttons: 1, clientX: 700, clientY: 500 }); await tick();
      const mid = shieldOn() && w.element.style.visibility === 'hidden' && liveGhosts.size === 1;
      wm.closeWindow('og-i'); await tick();
      fire(IFRAME, 'pointerup', { pointerId: 132, buttons: 0, clientX: 700, clientY: 500 }); await tick();
      rows.push(['icon', mid, { ends: ends.join(), shield: shieldOn(), ghosts: liveGhosts.size, gone: !wm.windows.has('og-i') }]);
    }
    const expect = { title: (a) => a.ends === 'owner-gone' && !a.shield && a.lit === 0 && !a.grid && a.feed === 0 && a.gone && a.captured === 0 && !a.snapped, resize: (a) => a.ends === 'owner-gone' && !a.shield && !a.op && a.box.width === 500 && a.box.height === 400 && a.gone, icon: (a) => a.ends === 'owner-gone' && !a.shield && a.ghosts === 0 && a.gone };
    const badG = rows.filter(([k, mid, a]) => !mid || !expect[k](a));
    ok(badG.length === 0, `THE OWNER GONE: a window closed mid-drag (closeWindow) — the title drag, the resize and the icon drag each end ONCE as owner-gone: the shield lifted, the highlight + grid overlay cleared, the feed gone, the ghost gone, the resize back at its size, NOTHING dropped (no snap, no bounds capture)${badG.length ? ' — ' + JSON.stringify(badG) : ''}`);
  }

  // (h) THE REMOVAL RULE (verify r2 T2⑤): the capturing ELEMENT leaves the document mid-drag (what a re-render that REPLACED
  //     the title bar / handle / icon would do — none does, §4 pins it) ⇒ Chrome's lostpointercapture ⇒ the drag ends ONCE
  //     as capture-lost (a drop where the pointer was last seen), the shield lifted
  {
    const rows = [];
    { const wm = mkWm(); const win = mkWin(wm, 'rm-t', { w: 500, h: 400, l: 100, t: 80 });
      fire(win.titleBar, 'pointerdown', { pointerId: 140, button: 0, isPrimary: true, clientX: 300, clientY: 120 });
      fire(IFRAME, 'pointermove', { pointerId: 140, buttons: 1, clientX: 700, clientY: 500 }); await tick();
      const capBefore = CAPTURE.get(140) === win.titleBar;
      win.titleBar.remove(); await tick();
      fire(IFRAME, 'pointerup', { pointerId: 140, buttons: 0, clientX: 700, clientY: 500 }); await tick();
      rows.push(['title', capBefore && !CAPTURE.has(140) && win.dragEnds.join() === 'capture-lost' && !shieldOn() && !win.element.classList.contains('dragging')]); }
    { const wm = mkWm(); const win = mkWin(wm, 'rm-r', { w: 500, h: 400, l: 100, t: 80 }); const h = win.element.handles.find((x) => x.dataset.dir === 'se');
      fire(h, 'pointerdown', { pointerId: 141, button: 0, isPrimary: true, clientX: 600, clientY: 480 });
      fire(IFRAME, 'pointermove', { pointerId: 141, buttons: 1, clientX: 700, clientY: 560 }); await tick();
      h.remove(); await tick(); fire(IFRAME, 'pointerup', { pointerId: 141, buttons: 0, clientX: 700, clientY: 560 }); await tick();
      rows.push(['resize', !CAPTURE.has(141) && win.resizeEnds.join() === 'capture-lost' && !win._resizeOp && !shieldOn()]); }
    { const { installTabGroupMixin } = await import('../src/lib/tab-group.js'); const wm = mkWm(); installTabGroupMixin(wm);
      const w = mkWin(wm, 'rm-i', { w: 500, h: 400, l: 100, t: 80 }); w.iconWrap = new Node('icon', { parent: w.titleBar }); w.title = 'win'; w._typeIcon = ''; w.backendIconSlot = null;
      const ends = []; Object.defineProperty(w, '_lastIconDragEnd', { configurable: true, get: () => ends[ends.length - 1] || null, set: (v) => { ends.push(v); } });
      wm._setupIconDrag(w);
      fire(w.iconWrap, 'pointerdown', { pointerId: 142, button: 0, isPrimary: true, clientX: 120, clientY: 90 });
      fire(IFRAME, 'pointermove', { pointerId: 142, buttons: 1, clientX: 700, clientY: 500 }); await tick();
      w.titleBar.remove(); await tick(); // the icon's ANCESTOR goes: the capture under it is lost too
      fire(IFRAME, 'pointerup', { pointerId: 142, buttons: 0, clientX: 700, clientY: 500 }); await tick();
      rows.push(['icon', !CAPTURE.has(142) && ends.join() === 'capture-lost' && w.element.style.visibility !== 'hidden' && !shieldOn()]); }
    ok(rows.every(([, p]) => p), `THE REMOVAL RULE: the capturing element (the title bar / the handle / the icon's title bar) removed mid-drag ⇒ the capture is lost and the drag ends ONCE as capture-lost, the shield lifted (${JSON.stringify(rows)})`);
  }

  // (i) TWO FEEDS AT ONCE (verify r2 finding #2): a mouse drag of A and a touch drag of B — the first end keeps the shield up for the second
  {
    const { dragShieldHolders } = await import('../src/lib/drag-feed.js');
    const wm = mkWm(); const A = mkWin(wm, 'tf-a', { w: 500, h: 400, l: 100, t: 80 }); const B = mkWin(wm, 'tf-b', { w: 400, h: 300, l: 900, t: 500 });
    fire(A.titleBar, 'pointerdown', { pointerId: 150, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 300, clientY: 120 });
    fire(IFRAME, 'pointermove', { pointerId: 150, buttons: 1, clientX: 400, clientY: 200 }); await tick();
    fire(B.titleBar, 'pointerdown', { pointerId: 151, pointerType: 'touch', button: 0, isPrimary: true, clientX: 1000, clientY: 520 });
    fire(IFRAME, 'pointermove', { pointerId: 151, buttons: 1, clientX: 1100, clientY: 600 }); await tick();
    const both = { a: A.element.classList.contains('dragging'), b: B.element.classList.contains('dragging'), shield: shieldOn(), holders: dragShieldHolders() };
    fire(IFRAME, 'pointerup', { pointerId: 150, buttons: 0, clientX: 400, clientY: 200 }); await tick();
    const afterA = { a: A.element.classList.contains('dragging'), b: B.element.classList.contains('dragging'), shield: shieldOn(), holders: dragShieldHolders() };
    fire(IFRAME, 'pointerup', { pointerId: 151, buttons: 0, clientX: 1100, clientY: 600 }); await tick();
    const afterB = { b: B.element.classList.contains('dragging'), shield: shieldOn(), holders: dragShieldHolders(), ends: B.dragEnds.join() };
    ok(both.a && both.b && both.shield && both.holders === 2 && !afterA.a && afterA.b && afterA.shield && afterA.holders === 1 && !afterB.b && !afterB.shield && afterB.holders === 0 && afterB.ends === 'release', `TWO FEEDS: a mouse drag + a touch drag hold the shield as two holders; the first end leaves it UP for the second (${JSON.stringify({ both, afterA, afterB })})`);
  }
}

// ── §3 CONTROLS ─────────────────────────────────────────────────────────────
console.log('§3 controls — patched copies outside the tree (scripts/mutant-copy.mjs)');
{
  const deSrc = read('src/lib/drag-end.js'), winSrc = read('src/lib/window.js');
  const copies = [];
  const tgSrc0 = read('src/lib/tab-group.js');
  /** The control copy of window.js on a patched drag-end — and, for the icon drag's sake, on a tab-group copy that
   *  imports the same patched verdict (verify r1: the mixin's doors ask dragEndVerdict too). */
  const loadWith = async (dePath, tag, winText = winSrc) => {
    const deUrl = pathToFileURL(dePath).href;
    // a text whose tab-group import is already a copy's URL (the pre-capture control) keeps it; else a tab-group copy on the patched verdict
    const tgP = winText.includes("from './tab-group.js'") ? MUT.write('src/lib/tab-group.js', tgSrc0.replace("from './drag-end.js'", `from ${JSON.stringify(deUrl)}`), tag, { esm: true }) : null;
    if (tgP) copies.push(tgP);
    const text = winText.replace("from './drag-end.js'", `from ${JSON.stringify(deUrl)}`).replace("from './tab-group.js'", tgP ? `from ${JSON.stringify(pathToFileURL(tgP).href)}` : "from './tab-group.js'");
    if (!text.includes(deUrl) || (tgP && !text.includes(pathToFileURL(tgP).href))) throw new Error('the control copy of window.js did not take the patched drag-end / tab-group');
    const p = MUT.write('src/lib/window.js', text, tag, { esm: true }); copies.push(p);
    const mod = await import(pathToFileURL(p).href);
    return Object.assign(mod.WindowManager, { _tgInstall: tgP ? (await import(pathToFileURL(tgP).href)).installTabGroupMixin : null });
  };
  /** A control copy of the FEED (verify r2): window.js + tab-group.js copies importing a patched drag-feed. */
  const loadFeedCtl = async (dfText, tag) => {
    const dfPath = MUT.write('src/lib/drag-feed.js', dfText, tag, { esm: true }); copies.push(dfPath);
    const dfUrl = pathToFileURL(dfPath).href;
    const tgPath = MUT.write('src/lib/tab-group.js', tgSrc0.replace("from './drag-feed.js'", `from ${JSON.stringify(dfUrl)}`), tag, { esm: true }); copies.push(tgPath);
    const tgUrl = pathToFileURL(tgPath).href;
    const text = winSrc.replace("from './drag-feed.js'", `from ${JSON.stringify(dfUrl)}`).replace("from './tab-group.js'", `from ${JSON.stringify(tgUrl)}`);
    if (!text.includes(dfUrl) || !text.includes(tgUrl)) throw new Error('the feed control copy of window.js did not take the patched feed / tab-group');
    const p = MUT.write('src/lib/window.js', text, tag, { esm: true }); copies.push(p);
    return (await import(pathToFileURL(p).href)).WindowManager;
  };
  // (a) one copy per rule: that end no longer ends ⇒ the drag stays ARMED under the real feed
  const RULES = [
    ['pointerup', "if (t === 'pointerup') return own ? { end: true, why: 'release' }", "if (t === 'pointerup') return own ? { end: false, why: 'release' }"],
    ['pointercancel', "if (t === 'pointercancel') return own ? { end: true, why: 'cancel' }", "if (t === 'pointercancel') return own ? { end: false, why: 'cancel' }"],
    ['lostpointercapture', "if (t === 'lostpointercapture') return own ? { end: true, why: 'capture-lost' }", "if (t === 'lostpointercapture') return own ? { end: false, why: 'capture-lost' }"],
    ['blur', "if (t === 'blur') return { end: true, why: 'blur' };", "if (t === 'blur') return { end: false, why: 'blur' };"],
    ['hidden', "if (t === 'visibilitychange') return ev.hidden === true ? { end: true, why: 'hidden' }", "if (t === 'visibilitychange') return ev.hidden === true ? { end: false, why: 'hidden' }"],
    ['buttons0', "if (t === 'pointermove') return own && ev.buttons === 0 ? { end: true, why: 'released-unseen' }", "if (t === 'pointermove') return own && ev.buttons === 0 ? { end: false, why: 'released-unseen' }"],
  ];
  const res = [];
  for (const [kind, from, to] of RULES) {
    if (!deSrc.includes(from)) { res.push([kind, 'patch-missed']); continue; }
    const dePath = MUT.write('src/lib/drag-end.js', deSrc.replace(from, to), 'no-' + kind, { esm: true }); copies.push(dePath);
    const WM = await loadWith(dePath, 'no-' + kind);
    const wm = mkWm(WM);
    // a release / cancel of a CAPTURED pointer is followed by the browser's lostpointercapture — a belt that ends the drag
    // anyway, so those two rules are judged on the capture-less feed (the document's), where only they can end it
    const noCap = kind === 'pointerup' || kind === 'pointercancel';
    const w = mkWin(wm, 'c-' + kind, { w: 500, h: 400, l: 100, t: 80 }); if (noCap) w.titleBar.setPointerCapture = undefined;
    const kindOf = kind === 'buttons0' ? 'buttons0' : kind === 'hidden' ? 'hidden' : kind;
    const x = await dragThen(w, { end: kindOf, at: noCap ? DOC.body : IFRAME, pid: 80 + RULES.findIndex((r) => r[0] === kind) });
    // under this copy the kind ends nothing: the drag stays armed (the window follows the next move with the button)
    const wr = mkWin(wm, 'cr-' + kind, { w: 500, h: 400, l: 100, t: 80 }); if (noCap) for (const hn of wr.element.handles) hn.setPointerCapture = undefined;
    const y = await resizeThen(wr, { end: kindOf, at: noCap ? DOC.body : IFRAME, pid: 90 + RULES.findIndex((r) => r[0] === kind) });
    // …and the ICON drag (the mixin's door asks the same patched verdict): the source window stays hidden = armed
    WM._tgInstall(wm); if (typeof DOC.body.appendChild !== 'function') DOC.body.appendChild = (n) => n;
    const wi = mkWin(wm, 'ci-' + kind, { w: 500, h: 400, l: 100, t: 80 }); wi.iconWrap = new Node('icon', { parent: wi.titleBar }); wi.title = 'w'; wi.backendIconSlot = null;
    if (noCap) wi.iconWrap.setPointerCapture = undefined;
    wm._setupIconDrag(wi);
    const ipid = 120 + RULES.findIndex((r) => r[0] === kind), iat = noCap ? DOC.body : IFRAME;
    fire(wi.iconWrap, 'pointerdown', { pointerId: ipid, button: 0, isPrimary: true, clientX: 120, clientY: 90 });
    fire(iat, 'pointermove', { pointerId: ipid, buttons: 1, clientX: 200, clientY: 160 }); await tick(); fire(iat, 'pointermove', { pointerId: ipid, buttons: 1, clientX: 700, clientY: 500 }); await tick();
    if (kindOf === 'pointerup' || kindOf === 'pointercancel' || kindOf === 'lostpointercapture') fire(iat, kindOf, { pointerId: ipid, buttons: 0, clientX: 700, clientY: 500 });
    else if (kindOf === 'blur') fireWin('blur');
    else if (kindOf === 'hidden') { DOC.hidden = true; fire(DOC, 'visibilitychange', {}); DOC.hidden = false; }
    else fire(iat, 'pointermove', { pointerId: ipid, buttons: 0, clientX: 700, clientY: 500 });
    await tick();
    const iconArmed = wi.element.style.visibility === 'hidden';
    fire(DOC.body, 'pointerup', { pointerId: ipid, buttons: 0, clientX: 700, clientY: 500 }); fire(DOC.body, 'mouseup', { clientX: 700, clientY: 500 }); await tick();
    res.push([kind, x.after.ends.length === 0 && x.armed && x.after.dragging, y.after.op && y.armed, iconArmed]);
  }
  ok(res.length === RULES.length && res.every(([, d, r, i]) => d === true && r === true && i === true), `${RULES.length} patched drag-end copies (one end rule each pulled back) ⇒ that end leaves the drag, the resize AND the icon drag armed (${JSON.stringify(res)})`);
  // (b) THE PRE-CAPTURE FEED: no capture, the document's mouse listeners, no shield — the incident in the model, for the
  //     title bar, the resize AND the icon drag (verify r1: the feed is ONE module, src/lib/drag-feed.js — one patched copy
  //     reverts every door; the window copy imports the patched feed + a tab-group copy that imports it too)
  {
    const dfSrc = read('src/lib/drag-feed.js'), tgSrc = read('src/lib/tab-group.js');
    const PATCH_DF = [
      [/const id = e && e\.pointerId;\n  if \(id == null \|\| !el/, 'const id = null;\n  if (id == null || !el'],
      [/import \{ DRAG_FEED, SHIELD_CLASS, dragEndVerdict \} from '\.\/drag-end\.js';/, "import { SHIELD_CLASS, dragEndVerdict } from './drag-end.js';\nconst DRAG_FEED = { move: 'mousemove', up: 'mouseup', cancel: 'pointercancel', lost: 'lostpointercapture' };"],
      [/if \(on\) cl\.add\(SHIELD_CLASS\); else cl\.remove\(SHIELD_CLASS\);/, '/* control: no shield */ cl.remove(SHIELD_CLASS);'],
    ];
    const PATCH_WIN = [[/buttons: e\.buttons, pointerId: e\.pointerId \}, feedState\)\.end\) \{ end/g, 'buttons: 1, pointerId: e.pointerId }, feedState).end) { end']];
    const PATCH_TG = [[/buttons: e\.buttons, pointerId: e\.pointerId \}, feedState\)\.end\) \{ onUp/g, 'buttons: 1, pointerId: e.pointerId }, feedState).end) { onUp']];
    const missed = [];
    const apply = (text, patches) => { for (const [re, rp] of patches) { if (!new RegExp(re.source).test(text)) missed.push(String(re)); text = text.replace(re, rp); } return text; };
    const dfPath = MUT.write('src/lib/drag-feed.js', apply(dfSrc, PATCH_DF), 'prefix-feed', { esm: true }); copies.push(dfPath);
    const dfUrl = pathToFileURL(dfPath).href;
    const tgPath = MUT.write('src/lib/tab-group.js', apply(tgSrc, PATCH_TG).replace("from './drag-feed.js'", `from ${JSON.stringify(dfUrl)}`), 'prefix-feed', { esm: true }); copies.push(tgPath);
    const tgUrl = pathToFileURL(tgPath).href;
    const text = apply(winSrc, PATCH_WIN).replace("from './drag-feed.js'", `from ${JSON.stringify(dfUrl)}`).replace("from './tab-group.js'", `from ${JSON.stringify(tgUrl)}`);
    ok(missed.length === 0 && text.includes(dfUrl) && text.includes(tgUrl), 'the pre-capture control found every line it reverts (the capture, the feed names, the shield, both no-button rules) and the window copy imports the patched feed and tab-group copies', missed);
    const dePath = MUT.write('src/lib/drag-end.js', deSrc, 'real-for-prefix', { esm: true }); copies.push(dePath);
    const WM = await loadWith(dePath, 'prefix-feed', text);
    const wm = mkWm(WM);
    // the drag released over the iframe: the mouseup reaches nobody of ours
    const w = mkWin(wm, 'pre-iframe', { w: 500, h: 400, l: 100, t: 80 });
    fire(w.titleBar, 'pointerdown', { pointerId: 100, button: 0, isPrimary: true, clientX: 300, clientY: 120 });
    const docFeed = DOC.live('mousemove') >= 1 && DOC.live('mouseup') >= 1 && !CAPTURE.has(100);
    fire(DOC.body, 'mousemove', { clientX: 400, clientY: 200 }); await tick(); fire(DOC.body, 'mousemove', { clientX: 700, clientY: 500 }); await tick();
    const shieldPre = shieldOn();
    fire(IFRAME, 'mouseup', { clientX: 700, clientY: 500 }); await tick();
    const stillDragging = w.element.classList.contains('dragging');
    fire(DOC.body, 'mousemove', { clientX: 850, clientY: 590 }); await tick();
    const followed = box(w).left === 650 && box(w).top === 550;
    ok(docFeed && !shieldPre && stillDragging && followed, 'PRE-CAPTURE CONTROL: the feed is the document\'s mousemove/mouseup, no capture, no shield; a release over the iframe never arrives — .dragging stays, the next move drags on (the incident)', { docFeed, shieldPre, stillDragging, box: box(w) });
    fire(DOC.body, 'mouseup', { clientX: 850, clientY: 590 }); await tick();
    // …and over the noVNC-like pane (its mouseup stopped)
    const w2 = mkWin(wm, 'pre-pane', { w: 500, h: 400, l: 100, t: 80 });
    fire(w2.titleBar, 'pointerdown', { pointerId: 101, button: 0, isPrimary: true, clientX: 300, clientY: 120 });
    fire(DOC.body, 'mousemove', { clientX: 400, clientY: 200 }); await tick(); fire(DOC.body, 'mousemove', { clientX: 700, clientY: 500 }); await tick();
    fire(PANE, 'mouseup', { clientX: 700, clientY: 500 }); await tick();
    ok(w2.element.classList.contains('dragging'), 'PRE-CAPTURE CONTROL: a release over the pane that stops its mouseup never arrives either — the drag stays armed');
    fire(DOC.body, 'mouseup', { clientX: 700, clientY: 500 }); await tick();
    // the resize: the moves over the window's own iframe are lost (it can grow, not shrink — D5's half)
    const w3 = mkWin(wm, 'pre-resize', { w: 1000, h: 700, l: 40, t: 40 });
    const h = w3.element.handles.find((x) => x.dataset.dir === 'se');
    fire(h, 'pointerdown', { pointerId: 102, button: 0, isPrimary: true, clientX: 1040, clientY: 740 });
    fire(w3.element.content, 'mousemove', { clientX: 300, clientY: 200 }); await tick(); // over its own content — swallowed by nothing here, so model the iframe:
    w3.element.content.swallow = true; fire(w3.element.content, 'mousemove', { clientX: 200, clientY: 150 }); await tick();
    const shrunk = box(w3).width;
    fire(w3.element.content, 'mouseup', { clientX: 200, clientY: 150 }); await tick();
    ok(shrunk === 320 ? true : shrunk < 1000, `(model) a move the document heard shrank it (${shrunk}); the move over the window's own frame and the release there reached nobody — the resize stays armed (${!!w3._resizeOp})`);
    ok(!!w3._resizeOp, 'PRE-CAPTURE CONTROL: the resize released over the window\'s own iframe stays armed');
    w3._resizeOp.cancel();
    // the ICON DRAG under the pre-capture feed (verify r1): a release over the iframe never arrives — the source window stays hidden
    {
      const { installTabGroupMixin: installCtl } = await import(tgUrl);
      installCtl(wm);
      if (typeof DOC.body.appendChild !== 'function') DOC.body.appendChild = (n) => n;
      const w4 = mkWin(wm, 'pre-icon', { w: 500, h: 400, l: 100, t: 80 }); w4.iconWrap = new Node('icon', { parent: w4.titleBar }); w4.title = 'w'; w4.backendIconSlot = null;
      wm._setupIconDrag(w4);
      fire(w4.iconWrap, 'pointerdown', { pointerId: 103, button: 0, isPrimary: true, clientX: 120, clientY: 90 });
      const noCap = !CAPTURE.has(103) && DOC.live('mousemove') >= 1;
      fire(DOC.body, 'mousemove', { clientX: 200, clientY: 160 }); await tick(); fire(DOC.body, 'mousemove', { clientX: 700, clientY: 500 }); await tick();
      const hiddenMid = w4.element.style.visibility === 'hidden';
      fire(IFRAME, 'mouseup', { clientX: 700, clientY: 500 }); await tick();
      ok(noCap && hiddenMid && w4.element.style.visibility === 'hidden' && !shieldOn(), 'PRE-CAPTURE CONTROL: the icon drag feeds from the document, no capture, no shield; a release over the iframe never arrives — the source window stays INVISIBLE (the incident, verify r1)', { noCap, hiddenMid, vis: w4.element.style.visibility });
      fire(DOC.body, 'mouseup', { clientX: 700, clientY: 500 }); await tick();
    }
  }
  // (c) verify r2 #1 CONTROL: a drag-feed copy WITHOUT the owner's abort ⇒ a window closed mid-drag leaves the shield up
  {
    const dfSrc = read('src/lib/drag-feed.js');
    const OWNER_LINE = "if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', () => { if (stopped) return; stop(); onEnd({ type: 'owner-gone', pointerId }); }, { signal: ctl.signal });";
    ok(dfSrc.includes(OWNER_LINE), 'the owner-gone control found the feed line it reverts');
    const WM = await loadFeedCtl(dfSrc.replace(OWNER_LINE, '/* control: no owner-gone */'), 'no-owner-gone');
    const wm = mkWm(WM); const win = mkWin(wm, 'c-og', { w: 500, h: 400, l: 100, t: 80 });
    fire(win.titleBar, 'pointerdown', { pointerId: 160, button: 0, isPrimary: true, clientX: 300, clientY: 120 });
    fire(IFRAME, 'pointermove', { pointerId: 160, buttons: 1, clientX: 700, clientY: 500 }); await tick();
    wm.closeWindow('c-og'); await tick(); fire(IFRAME, 'pointerup', { pointerId: 160, buttons: 0, clientX: 700, clientY: 500 }); await tick();
    ok(shieldOn() && win.dragEnds.length === 0, "OWNER-GONE CONTROL: without the owner's abort ending the drag, a window closed mid-drag leaves body.wm-dragging up and no end door ran (the incident in the model)");
    DOC.body.classList.remove('wm-dragging'); // the copy's stuck shield, cleared by hand
  }
  // (d) verify r2 #2 CONTROL: a BOOLEAN shield ⇒ the first of two drags to end lowers it for the other
  {
    const dfSrc = read('src/lib/drag-feed.js');
    const SET_LINE = 'on = HOLDERS.size > 0; // the shield stands while ANY drag runs';
    ok(dfSrc.includes(SET_LINE), 'the boolean-shield control found the holders line it reverts');
    const WM = await loadFeedCtl(dfSrc.replace(SET_LINE, '/* control: a boolean shield */'), 'boolean-shield');
    const wm = mkWm(WM); const A = mkWin(wm, 'c-bs-a', { w: 500, h: 400, l: 100, t: 80 }); const B = mkWin(wm, 'c-bs-b', { w: 400, h: 300, l: 900, t: 500 });
    fire(A.titleBar, 'pointerdown', { pointerId: 161, button: 0, isPrimary: true, clientX: 300, clientY: 120 }); fire(IFRAME, 'pointermove', { pointerId: 161, buttons: 1, clientX: 400, clientY: 200 }); await tick();
    fire(B.titleBar, 'pointerdown', { pointerId: 162, button: 0, isPrimary: true, clientX: 1000, clientY: 520 }); fire(IFRAME, 'pointermove', { pointerId: 162, buttons: 1, clientX: 1100, clientY: 600 }); await tick();
    fire(IFRAME, 'pointerup', { pointerId: 161, buttons: 0, clientX: 400, clientY: 200 }); await tick();
    ok(B.element.classList.contains('dragging') && !shieldOn(), "BOOLEAN-SHIELD CONTROL: the first drag's end lowered the shield while the second still ran");
    fire(IFRAME, 'pointerup', { pointerId: 162, buttons: 0, clientX: 1100, clientY: 600 }); await tick();
    DOC.body.classList.remove('wm-dragging');
  }
  for (const c of copiesCensus(copies, MUT.dir, repo, { minCopies: RULES.length * 3 + 4 + 6, label: 'controls: ' })) ok(c.pass, c.name, c.detail);
}

// ── §4 PINS ──────────────────────────────────────────────────────────────────
console.log('§4 pins — the shield CSS, touch-action, ONE feed for the four doors, the hand-over, the xpra hold');
{
  const css = read('public/style.css'), win = read('src/lib/window.js'), xv = read('src/lib/xpra-view.js'), df = read('src/lib/drag-feed.js'), tg = read('src/lib/tab-group.js');
  ok(/body\.wm-dragging \.window \.window-content \{ pointer-events: none !important; \}/.test(css) && /body\.wm-dragging \.window iframe, body\.wm-dragging \.window canvas, body\.wm-dragging \.window img/.test(css), 'style.css: the drag shield — every window\'s content, and iframe / canvas / img by name, pointer-events:none while body.wm-dragging');
  ok(/\.window-titlebar \{[^}]*touch-action: none;/.test(css) && /\.resize-handle \{[^}]*touch-action: none;/.test(css), 'style.css: the title bar and the resize handles are touch-action: none (a touch drag is pointermove, never the page\'s pan)');
  ok(/titleBar\.addEventListener\('pointerdown', \(e\) => \{/.test(win) && /startFeed\(titleBar, captureOn\(titleBar, e\)\);/.test(win) && /startFeed\(titleBar, captureOn\(titleBar, p0\)\);/.test(win), 'window.js: the title bar\'s door is a pointerdown that captures the pointer; the hand-over captures it too');
  ok(/handle\.addEventListener\('pointerdown', \(e\) => \{/.test(win) && /startResize\(handle\.dataset\.dir, e\.clientX, e\.clientY, \{ pointerId: e\.pointerId, el: handle \}\);/.test(win) && /const capId = el \? captureOn\(el, \{ pointerId \}\) : null;/.test(win), 'window.js: the handle\'s door is a pointerdown that captures the pointer on the handle');
  const dfUses = ['move', 'up', 'cancel', 'lost'].filter((k) => new RegExp(`addEventListener\\(DRAG_FEED\\.${k}, on(Move|End), fs\\)`).test(df)).length;
  const noMouseFeed = (t) => !/document\.addEventListener\('mouseup'/.test(t); // a drag's END on the document's mouseup is the pre-fix feed (the overlap switcher's hover mousemove is not a drag)
  ok(dfUses === 4 && /window\.addEventListener\('blur', onEnd, fs\)/.test(df) && /document\.addEventListener\('visibilitychange', onEnd, fs\)/.test(df) && noMouseFeed(win) && noMouseFeed(tg) && (win.match(/attachDragFeed\(\{/g) || []).length === 2 && (tg.match(/attachDragFeed\(\{/g) || []).length === 2 && !/addEventListener\(DRAG_FEED\./.test(win) && !/addEventListener\(DRAG_FEED\./.test(tg) && !/function captureOn|function setDragShield/.test(win), `ONE feed: drag-feed.js registers DRAG_FEED's four events + blur + visibilitychange; window.js's two doors and tab-group.js's two doors attach it (${(win.match(/attachDragFeed\(\{/g) || []).length}+${(tg.match(/attachDragFeed\(\{/g) || []).length}); no document mouseup / mousemove feeds any drag`);
  ok(/icon\.addEventListener\('pointerdown', \(e\) => \{/.test(tg) && /const pid = captureOn\(icon, e\);/.test(tg) && /tabEl\.addEventListener\('pointerdown', \(e\) => \{/.test(tg) && /tabEl\.closest\('\.window-titlebar'\)\) \|\| tabEl;/.test(tg) && /const pid = captureOn\(capEl, e\);/.test(tg), 'tab-group.js: the icon drag and the tab drag are pointerdown doors that capture the pointer — the tab drag on the strip\'s TITLE BAR (the element the tear-off\'s re-render keeps; a capture on the tab itself would be lost under the finger)');
  ok((win.match(/setDragShield\(true, shieldKey\);/g) || []).length === 2 && (win.match(/setDragShield\(false, shieldKey\);/g) || []).length >= 3 && (tg.match(/setDragShield\(true, shieldKey\);/g) || []).length === 2 && (tg.match(/setDragShield\(false, shieldKey\);/g) || []).length >= 4 && !/setDragShield\((true|false)\);/.test(win + tg) && /const HOLDERS = new Set\(\);/.test(df) && /on = HOLDERS\.size > 0;/.test(df) && /if \(dragEndVerdict\(\{ type: 'pointermove', buttons: e\.buttons, pointerId: e\.pointerId \}, feedState\)\.end\) \{ endDrag\(e, 'released-unseen'\); return; \}/.test(win) && (tg.match(/feedState\)\.end\) \{ onUp\(e, 'released-unseen'\); return; \}/g) || []).length === 2, 'the four doors raise + lower the shield under their OWN key — a set of holders, never a boolean (verify r2 #2) — and every door ends on a move with no button held');
  ok(/client: \{ clientX: e\.clientX, clientY: e\.clientY, pointerId: e\.pointerId \}/.test(xv) && /import \{ dragEndVerdict \} from '\.\/drag-end\.js';/.test(xv) && /for \(const k of \['pointerup', 'pointercancel', 'pointermove', 'visibilitychange'\]\) document\.addEventListener\(k, endHold/.test(xv) && /window\.addEventListener\('blur', endHold/.test(xv), 'xpra-view.js: the handed-over press carries its pointerId, and the hold ends as the WM\'s drag does (the same verdict: release / cancel / no-button move / blur / hidden — verify r1 finding #2)');
  ok((win.match(/const processMove = \(e\) => \{/g) || []).length === 2 && /const beginAt = \(x, y\) => \{/.test(win), 'window.js keeps ONE drag implementation and ONE resize implementation (two processMove; the shared beginAt)');
  // verify r2 #1: the owner's abort ends the drag — once, at the feed — and every door CANCELS (no drop of a window that is leaving)
  ok(/signal\.addEventListener\('abort', \(\) => \{ if \(stopped\) return; stop\(\); onEnd\(\{ type: 'owner-gone', pointerId \}\); \}, \{ signal: ctl\.signal \}\);/.test(df), "drag-feed.js: the owner's abort ENDS the drag it fed (owner-gone), once, with the capture released — never a silent teardown (verify r2 #1)");
  ok(/if \(v\.why === 'owner-gone'\) \{ win\._lastDragEnd = 'owner-gone'; win\._cancelPointerDrag\(\); return; \}/.test(win) && /if \(v\.why === 'owner-gone'\) \{ win\._lastResizeEnd = 'owner-gone'; if \(win\._resizeOp\) win\._resizeOp\.cancel\(\); return; \}/.test(win) && /if \(why === 'owner-gone'\) \{ targetWin = null; return; \}/.test(tg) && /if \(why === 'owner-gone'\) \{ \/\/ the torn window closed mid-drag/.test(tg) && /AbortSignal\.any\(\[dragCtl\.signal, own\]\)/.test(tg), "every door CANCELS on owner-gone: the title drag's cancel path, the resize op's cancel, the icon drag's no-merge, the tab drag's chrome-only cleanup (its feed joins the dragged window's controller)");
  ok(/if \(!win\) \{ mouseDown = false; setDragShield\(false, shieldKey\); endDrag\(\); return; \}/.test(tg), "tab-group.js: the tear-off's early return (the window gone at the detach) lifts the shield and tears the feed down (verify r2 ⑥: the binding-model pin admits any statements on that line — this one names them)");
  ok(!/titleBar\.(replaceWith|remove)\(/.test(win + tg) && !/\.titleBar = /.test(tg) && /const existing = titleBar\.querySelector\('\.tab-bar-tabs'\);\n\s+if \(existing\) existing\.remove\(\);/.test(tg), 'no re-render replaces the title bar ELEMENT (the tear-off rebuilds the tab bar as its children): the capture a drag holds on it survives — §2 (h) shows what a replacement would do');
}

// ── §5 THE DOOR CENSUS (verify r2 T1) ──────────────────────────────────────
console.log('§5 the door census — every pointer drag in the client is on the feed, or named with its reason');
{
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n]*$/gm, '$1');
  const LIB = path.join(repo, 'src/lib');
  const FILES = fs.readdirSync(LIB).filter((f) => f.endsWith('.js')).sort();
  /** THE CENSUS, PURE over file texts: every document / window-level move-or-end listener a drag could ride (a drag's end
   *  on the document is the pre-fix feed), every feed door (an attachDragFeed / startPointerDrag call), every native DnD. */
  const census = (texts) => {
    const rows = [];
    for (const [file, raw] of Object.entries(texts)) {
      const text = stripComments(raw);
      text.split('\n').forEach((l, i) => {
        const m = /\b(document|window|globalThis)\.addEventListener\(\s*['"](mouseup|mousemove|pointerup|pointermove|pointercancel|touchend|touchmove|touchcancel)['"]/.exec(l);
        if (m) rows.push({ file, line: i + 1, kind: 'listener', event: m[2] });
        const p = /\b(document|window)\.on(mouseup|mousemove|pointerup|pointermove)\s*=/.exec(l);
        if (p) rows.push({ file, line: i + 1, kind: 'listener', event: p[2] });
      });
      if (file !== 'drag-feed.js') { const doors = (text.match(/\b(attachDragFeed|startPointerDrag)\(/g) || []).length; if (doors) rows.push({ file, kind: 'door', count: doors }); }
      const dnd = (text.match(/addEventListener\(\s*['"]dragstart['"]/g) || []).length;
      if (dnd) rows.push({ file, kind: 'native-dnd', count: dnd });
    }
    return rows;
  };
  // the document / window listeners that MAY stay, each with its reason (a dead row is red)
  const ALLOWED = [
    ['utils.js', /^(pointerup|pointercancel)$/, 'onOutsidePress (lane M): a press witness, not a drag'],
    ['utils.js', /^(touchmove|touchend|touchcancel)$/, 'the long-press context menu: a touch gesture on the document, nothing follows the finger'],
    ['layout.js', /^(pointerup|pointercancel)$/, 'the user-dirty witness (capture, passive): a press witness, not a drag'],
    ['chat-view.js', /^(pointerup|pointercancel)$/, "the chat's press witness, not a drag"],
    ['channel-window.js', /^(pointerup|pointercancel)$/, 'the gutter-press FLAG (paging input): no element follows the pointer, judged at the next release anywhere'],
    ['mobile-nav.js', /^touchend$/, "the phone's edge swipe: a touch gesture on the document"],
    ['taskbar.js', /^pointermove$/, "the grouped button's hover chooser (lane K): no button held"],
    ['window.js', /^mousemove$/, "the overlap switcher's hover: no button held"],
    ['customize-mode.js', /^mousemove$/, "the width PICKER's hover (capture): no button held, ended by its own click / Esc"],
    ['browser-live-window.js', /^pointerup$/, "lane J's keyboard-yield witness (capture, passive): a press witness, not a drag"],
  ];
  // THE FEED DOORS per file (a new door registers here — or it is red)
  const DOORS = { 'window.js': 2, 'tab-group.js': 3, 'resizer.js': 1, 'theme-editor.js': 2, 'chat-minimap.js': 1, 'desktop-manager.js': 2, 'file-explorer.js': 1, 'file-viewer.js': 2, 'customize-mode.js': 1, 'chat-input.js': 1 };
  const judge = (rows) => {
    const bad = [];
    for (const r of rows) {
      if (r.kind === 'listener' && !ALLOWED.some(([f, re]) => f === r.file && re.test(r.event))) bad.push(`${r.file}:${r.line} ${r.event} — a document/window move-or-end listener outside the feed and the allowlist`);
      if (r.kind === 'door' && DOORS[r.file] !== r.count) bad.push(`${r.file} has ${r.count} feed doors, the table says ${DOORS[r.file] ?? 0}`);
    }
    for (const [f, n] of Object.entries(DOORS)) if (!rows.some((r) => r.kind === 'door' && r.file === f && r.count === n)) bad.push(`${f}: ${n} feed doors expected`);
    return bad;
  };
  const texts = Object.fromEntries(FILES.map((f) => [f, read('src/lib/' + f)]));
  const rows = census(texts);
  const bad = judge(rows);
  const nDoors = Object.values(DOORS).reduce((a, b) => a + b, 0), nListeners = rows.filter((r) => r.kind === 'listener').length, nDnd = rows.filter((r) => r.kind === 'native-dnd').reduce((a, r) => a + r.count, 0);
  ok(bad.length === 0, `THE CENSUS: ${nDoors} feed doors in ${Object.keys(DOORS).length} files (window.js title + handle; tab-group.js icon + tab + divider; the sidebar / editor Resizer; the theme editor's move + size; the minimap scrub; the top-bar scale + taskbar height handles; the explorer column; the viewer's pan + pptx sidebar; customize-mode's move; the queue reorder) — ${nListeners} document/window move-or-end listeners, every one named with its reason — ${nDnd} native HTML5 dragstart doors (their own dragend)${bad.length ? ' — ' + bad.join(' ; ') : ''}`);
  const dead = ALLOWED.filter(([f, re]) => !rows.some((r) => r.kind === 'listener' && r.file === f && re.test(r.event)));
  ok(dead.length === 0, `every allowlisted reason names a listener that exists${dead.length ? ' — dead: ' + dead.map(([f, re]) => f + ' ' + re).join(', ') : ''}`);
  // the two bridges that forward a pointer they CAPTURED (their own end semantics: the remote page / X owns the gesture)
  ok(/pane\.setPointerCapture\(e\.pointerId\)/.test(texts['xpra-view.js']) && /img\.setPointerCapture\(e\.pointerId\)/.test(texts['browser-live-window.js']), "the xpra pane and the live view's picture capture the pointer they forward (the hand-over's hold ends as the WM's drag does — §4)");
  // THE PLANTED CONTROLS (scripts/mutant-copy.mjs, outside the tree): a door put back on the document ⇒ the census names the file
  {
    const ctlCopies = [];
    const plant = (file, text, tag) => { const p = MUT.write('src/lib/' + file, text, tag, { esm: true }); ctlCopies.push(p); return fs.readFileSync(p, 'utf8'); };
    const revert = (file, from, to) => { const src = texts[file]; if (!src.includes(from)) throw new Error('control: ' + file + ' lacks ' + from.slice(0, 60)); return src.replace(from, to); };
    const controls = [
      ['window.js: the title door ending on the document\'s mouseup too', 'window.js', revert('window.js', "startFeed(titleBar, captureOn(titleBar, e));\n    });", "startFeed(titleBar, captureOn(titleBar, e));\n      document.addEventListener('mouseup', onEnd);\n    });")],
      ['resizer.js: the pre-census door (document mousemove / mouseup, no capture)', 'resizer.js', revert('resizer.js', "startPointerDrag(this.handle, e, { onMove, onEnd: onUp, shield: 'resizer:' + dir });", "document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);")],
      ['chat-minimap.js: the pre-census door', 'chat-minimap.js', revert('chat-minimap.js', "startPointerDrag(this._minimap, e, { onMove, onEnd: () => {", "document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', () => {")],
    ];
    const res = [];
    for (const [name, file, text] of controls) {
      const planted = plant(file, text, 'census-' + file.replace('.js', ''));
      const b = judge(census({ ...texts, [file]: planted }));
      res.push([name, b.some((x) => x.startsWith(file)) ? 'red' : 'green?']);
    }
    ok(res.length === 3 && res.every(([, r]) => r === 'red'), `3 PLANTED CONTROLS ⇒ the census names the file: ${JSON.stringify(res)}`);
    for (const c of copiesCensus(ctlCopies, MUT.dir, repo, { minCopies: 3, label: 'census controls: ' })) ok(c.pass, c.name, c.detail);
  }
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
