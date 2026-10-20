#!/usr/bin/env node
// THE ONE OUTSIDE-PRESS CLOSER (lane M, inc-muhms5kt-0ejl, 2026-09-26 — the owner:
// "vibespace中的悬浮菜单，不相应在app画面里的点击自动隐藏"). With a desktop app open
// (the xpra picture), no floating menu closed on a press INTO the picture: every
// closer listened for a document `mousedown`, and the picture cancels its
// `pointerdown` — a cancelled pointerdown suppresses the compatibility mousedown
// in every phase (measured in Chrome: pointerdown 1×, click 1×, mousedown 0×;
// noVNC also stops its canvas mousedown). The fix: src/lib/outside-press.js
// (PURE verdicts) + utils.js `onOutsidePress` (document pointerdown, CAPTURE
// phase, passive — never cancels or stops the press, so the app still gets it).
//   §1 the PURE tables: which target closes (inside the root, the anchor, the
//      picture, a nested popover, an ignore rule, a removed root) and when a
//      press counts (mouse at down; touch / pen only as a TAP — a scroll, drag,
//      long-press never closes);
//   §2 the REAL helper under a fake document + a browser dispatch MODEL (the
//      capture → target → bubble order, a cancelled pointerdown dropping the
//      compatibility mousedown, click still fired): arming, the xpra-like pane,
//      the noVNC-like canvas, anchor / nested / ignore / persistent / signal /
//      root-gone, touch taps vs scrolls, attachPopoverClose;
//   §3 CONTROLS: the pre-lane closer (verbatim) stays open on a press into the
//      pane in the same model (the incident reproduced) and closes elsewhere;
//      two patched copies of utils.js (scripts/mutant-copy.mjs — outside the
//      tree): the helper listening for `mousedown` again ⇒ stays open over the
//      pane; the helper in the BUBBLE phase ⇒ a pane that stops the press keeps
//      it open — each while the real helper closes.
// The real-rung proof (a live GNOME Calculator under xpra, a digit landing while
// the menu closes, a mutant-copy server as the control) is
// scripts/test-desktop-xpra-window.mjs §17. The census (no document mousedown /
// click closer anywhere in src/lib) is test-architecture §59.
//   LANE menu-close-residue (B-5bd5, 2026-10-20) — two residues of lane M:
//   §1 the PURE blur table (shouldCloseOnBlur: a frame outside the surface closes, the body / a row / no focus / the
//      page unfocused / a frame inside the surface or its anchor / the ignore rule / a removed root do not);
//   §2 (l) the REAL helper's `window` blur path under a recording fake window — the measured Chrome facts replayed
//      (document.activeElement = the frame, hasFocus() true ⇒ close; a blur to another window ⇒ not; the brief's
//      window.dispatchEvent(new Event('blur')) ⇒ not); (m) createPopover's ANCHOR TOGGLE under the fake DOM — the
//      same anchor again (a press or Enter) closes and hands back a DETACHED element, another anchor / a cursor-placed
//      popover / toggle:false rebuild as before, a closed popover opens again;
//   §3 two more patched copies: the helper WITHOUT its blur listener stays open on a press into a frame; createPopover
//      WITHOUT the toggle rebuilds the ⚙ popover on the second press (the residue itself) — each while the real one does not.
// Prerequisite: `npm run build` (build-version.js is generated). ~0.2 s.
// Run: node scripts/test-outside-press.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const tick = () => new Promise((r) => setTimeout(r, 5));
if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first (utils.js imports telemetry-client, which imports it)'); process.exit(1); }

const OP = await import('../src/lib/outside-press.js');

// ── §1 THE PURE TABLES ──────────────────────────────────────────────────────
console.log('§1 the verdicts (src/lib/outside-press.js)');
{
  const T = [
    // [facts, close, why, retire]
    [{ inRoot: true }, false, 'inside'],
    [{ excluded: true }, false, 'excluded'], // the anchor / a toggle button
    [{}, true, 'outside'], // THE PICTURE: nothing of ours — closes
    [{ inNestedPopover: true }, false, 'nested'], // a menu spawned from this one (default: the chained-popover rule)
    [{ inNestedPopover: true, nested: true }, false, 'nested'],
    [{ inNestedPopover: true, nested: false }, true, 'outside'], // a surface that never honoured the rule
    [{ ignored: true }, false, 'ignored'], // the surface's own rule (an exact-anchor match, width-pick)
    [{ connected: false }, false, 'root-gone', true], // removed by Escape / its own click: retire, never close
    [{ connected: false, inRoot: true }, false, 'root-gone', true],
    [{ opening: true }, false, 'opening'], // the press that OPENED the surface (it began before the closer was armed)
    [{ opening: true, connected: false }, false, 'root-gone', true],
    [{ inRoot: true, excluded: true, ignored: true, inNestedPopover: true }, false, 'inside'], // precedence
    [{ excluded: true, ignored: true }, false, 'excluded'],
    [{ ignored: true, inNestedPopover: true }, false, 'ignored'],
    [{ connected: true, inRoot: false, excluded: false, ignored: false, inNestedPopover: false, nested: true }, true, 'outside'],
  ];
  const bad = T.filter(([f, c, why, retire = false]) => { const v = OP.pressCloses(f); return v.close !== c || v.why !== why || v.retire !== retire; });
  ok(bad.length === 0, `pressCloses: ${T.length} rows — inside / anchor / THE PICTURE / nested popover (both rules) / ignore / removed root / the opening press / precedence gone > opening > inside > excluded > ignored > nested > outside`, bad.map(([f]) => [f, OP.pressCloses(f)]));
  ok(OP.pressCloses().close === true && OP.pressCloses(null).close === true, 'pressCloses: no facts = a press outside (closes)');
  const P = [['mouse', 'down'], ['touch', 'tap'], ['pen', 'tap'], ['', 'down'], [undefined, 'down'], ['MOUSE', 'down']];
  ok(P.every(([t, w]) => OP.pressPhase(t) === w), `pressPhase: mouse / '' / undefined judged at pointerdown (as mousedown was); touch and pen only as a tap (${P.map(([t]) => OP.pressPhase(t)).join(' ')})`);
  const S = OP.TAP_SLOP_PX, L = OP.LONG_PRESS_MS;
  ok(S === 10 && L === 500, `the tap thresholds are the long-press synthesizer's own (slop ${S} px, long-press ${L} ms)`);
  const TAPS = [
    [{ dx: 0, dy: 0, heldMs: 80 }, true],
    [{ dx: 6, dy: 8, heldMs: 80 }, true], // exactly 10 px
    [{ dx: 7, dy: 8, heldMs: 80 }, false], // 10.6 px: a drag / a scroll start
    [{ dx: 0, dy: 40, heldMs: 120 }, false], // a flick
    [{ dx: 0, dy: 0, heldMs: L - 1 }, true],
    [{ dx: 0, dy: 0, heldMs: L }, false], // the long-press gesture
    [{ dx: 0, dy: 0, heldMs: 80, cancelled: true }, false], // the browser took it (a scroll)
    [{ dx: NaN, dy: 0, heldMs: 80 }, false],
    [{}, true],
  ];
  ok(TAPS.every(([a, w]) => OP.tapVerdict(a) === w), `tapVerdict: ${TAPS.length} rows — still + quick = tap; > ${S} px, ≥ ${L} ms, cancelled, non-finite = not a tap (a scroll, a drag, a long-press never close)`, TAPS.map(([a]) => OP.tapVerdict(a)));
  // THE BLUR TABLE (lane menu-close-residue): a press INTO a frame reaches the parent only as `window` blur
  {
    const F = { tagName: 'IFRAME' }, pop = { contains: () => false }, holds = (x) => ({ contains: (t) => t === x });
    const B = [
      // [facts, close, why, retire]
      [{ active: F, el: pop }, true, 'frame'], // the measured shape: activeElement = the frame, hasFocus() true (default)
      [{ active: F, el: [pop, { contains: () => false }] }, true, 'frame'], // roots as an array
      [{ active: { tagName: 'iframe' }, el: pop }, true, 'frame'], // the tag's case is the DOM's business
      [{ active: { tagName: 'FRAME' }, el: pop }, true, 'frame'],
      [{ active: { tagName: 'OBJECT' }, el: pop }, true, 'frame'],
      [{ active: { tagName: 'EMBED' }, el: pop }, true, 'frame'],
      [{ active: { tagName: 'BODY' }, el: pop }, false, 'not-a-frame'], // the brief's simulation: window.dispatchEvent(new Event('blur')) with the body active
      [{ active: { tagName: 'DIV' }, el: pop, pageFocused: false }, false, 'not-a-frame'], // a REAL blur to another window with a menu row focused (measured: activeElement unchanged, hasFocus() false)
      [{ active: { tagName: 'BODY' }, el: pop, pageFocused: false }, false, 'not-a-frame'],
      [{ active: null, el: pop }, false, 'no-active'],
      [{ active: F, el: pop, pageFocused: false }, false, 'page-unfocused'], // a frame focused but the page lost the focus (the belt: measured never to reach the parent)
      [{ active: F, el: holds(F) }, false, 'inside'], // a frame INSIDE the surface (a preview popover)
      [{ active: F, el: [pop, holds(F)] }, false, 'inside'],
      [{ active: F, el: pop, excludes: [holds(F)] }, false, 'excluded'], // a frame inside the anchor
      [{ active: F, el: pop, excludes: holds(F) }, false, 'excluded'],
      [{ active: F, el: pop, ignored: true }, false, 'ignored'],
      [{ active: F, el: pop, connected: false }, false, 'root-gone', true],
      [{ active: null, el: pop, connected: false }, false, 'root-gone', true],
      [{ active: F, el: holds(F), excludes: [holds(F)], ignored: true }, false, 'inside'], // precedence
      [{ active: F, el: pop, excludes: [holds(F)], ignored: true }, false, 'excluded'],
      [{ active: { tagName: 'BODY' }, el: holds({ tagName: 'BODY' }), ignored: true }, false, 'not-a-frame'],
    ];
    const bad = B.filter(([f, c, why, retire = false]) => { const v = OP.shouldCloseOnBlur(f); return v.close !== c || v.why !== why || v.retire !== retire; });
    ok(bad.length === 0, `shouldCloseOnBlur: ${B.length} rows — a frame outside closes; the body / a row / no focus / the page unfocused / a frame inside the surface or its anchor / ignore / a removed root do not; precedence gone > no-active > not-a-frame > page-unfocused > inside > excluded > ignored > frame`, bad.map(([f]) => [f, OP.shouldCloseOnBlur(f)]));
    ok(OP.shouldCloseOnBlur().why === 'no-active' && OP.shouldCloseOnBlur({ active: F }).close === true, 'shouldCloseOnBlur: no facts = nothing focused (never closes); a frame with no surface given = closes');
    const ky = fs.readFileSync(path.join(repo, 'src/lib/keyboard-yield.js'), 'utf8');
    ok(JSON.stringify([...OP.FRAME_TAGS]) === JSON.stringify(['IFRAME', 'FRAME', 'OBJECT', 'EMBED']) && ky.includes("['IFRAME', 'FRAME', 'OBJECT', 'EMBED'].includes(el.tagName)"), 'FRAME_TAGS is the family keyboard-yield.js isFrame calls a frame (spelled the same there)');
  }
  ok(!/\bimport\b|\brequire\s*\(/.test(fs.readFileSync(path.join(repo, 'src/lib/outside-press.js'), 'utf8').replace(/\/\/.*$/gm, '')), 'outside-press.js is PURE (imports nothing)');
}

// ── a fake DOM + a browser dispatch MODEL ───────────────────────────────────
class El {
  constructor(name, parent = null, { popover = false, cls = [], id = '' } = {}) { this.name = name; this.parent = parent; this.popover = popover; this.cls = new Set(cls); this.id = id; this.attached = true; this.removed = 0; this.l = []; this.children = []; this.dataset = {}; this.style = {}; if (parent) parent.children.push(this); this.classList = { add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c), toggle: (c) => (this.cls.has(c) ? this.cls.delete(c) : this.cls.add(c)) }; }
  get isConnected() { return this.attached && (this.parent ? this.parent.isConnected : this === doc.body); } // a parentless element is detached (createPopover's toggled return); the body is the root
  // the DOM surface createPopover touches (lane menu-close-residue §2 (m)): tag, class string, a child list, a rect
  get tagName() { return this.name.toUpperCase(); }
  get className() { return [...this.cls].join(' '); }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { c.parent = this; c.attached = true; this.children.push(c); return c; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  matches(sel) { return sel.split(',').map((x) => x.trim()).some((a) => (a === '[data-popover]' ? this.popover || !!this.dataset.popover : a[0] === '.' ? this.cls.has(a.slice(1)) : a[0] === '#' ? this.id === a.slice(1) : false)); }
  contains(t) { for (let n = t; n; n = n.parent) if (n === this) return true; return false; }
  closest(sel) {
    const alts = sel.split(',').map((s) => s.trim());
    for (let n = this; n; n = n.parent) if (alts.some((a) => (a === '[data-popover]' ? n.popover : a[0] === '.' ? n.cls.has(a.slice(1)) : a[0] === '#' ? n.id === a.slice(1) : false))) return n;
    return null;
  }
  remove() { this.removed++; this.attached = false; if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  addEventListener(type, fn, opts) { this.l.push({ type, fn, capture: typeof opts === 'object' ? !!opts?.capture : !!opts }); }
}
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
  createElement: (t) => new El(t), getElementById: () => null, querySelector: () => null, querySelectorAll: (sel) => (doc.body ? all(doc.body).filter((n) => n.matches(sel)) : []), body: null, documentElement: null, hidden: false,
  activeElement: null, hasFocus: () => true, // the blur legs set both (what Chrome reports at a `window` blur)
};
globalThis.document = doc;
globalThis.window = globalThis;
/** every connected descendant of `root` (the fake's querySelectorAll) */
const all = (root) => root.children.flatMap((c) => (c.attached ? [c, ...all(c)] : []));
// the fake WINDOW records its listeners (lane menu-close-residue: the helper's `window` blur listener rides the same signal)
const win = { l: [] };
globalThis.addEventListener = (type, fn, opts) => { const o = typeof opts === 'object' && opts ? opts : {}; if (o.signal && o.signal.aborted) return; const rec = { type, fn }; win.l.push(rec); if (o.signal) o.signal.addEventListener('abort', () => { win.l = win.l.filter((r) => r !== rec); }); };
globalThis.removeEventListener = (type, fn) => { win.l = win.l.filter((r) => !(r.type === type && r.fn === fn)); };
/** a `window` blur as the browser dispatches it (document.activeElement / hasFocus() already updated — measured) */
const blurAll = ({ active = null, hasFocus = true } = {}) => { doc.activeElement = active; doc.hasFocus = () => hasFocus; const ev = { type: 'blur', target: globalThis }; for (const r of [...win.l]) if (r.type === 'blur' && win.l.includes(r)) r.fn(ev); return ev; };
const winSince = (before) => win.l.filter((r) => !before.includes(r));
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { protocol: 'https:', host: 'vibe.example', origin: 'https://vibe.example', href: 'https://vibe.example/' };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

/** One event through the model: document CAPTURE listeners → every element on the path (root → target) runs its own
 *  listeners (a pane may cancel or stop it) → document BUBBLE listeners unless stopped. Records what anybody did to it. */
function mkEvent(type, target, init = {}) {
  const ev = { type, target, pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, timeStamp: 0, ...init, defaultPrevented: false, stopped: false, calls: { preventDefault: 0, stopPropagation: 0, stopImmediatePropagation: 0 } };
  ev.preventDefault = () => { ev.calls.preventDefault++; ev.defaultPrevented = true; };
  ev.stopPropagation = () => { ev.calls.stopPropagation++; ev.stopped = true; };
  ev.stopImmediatePropagation = () => { ev.calls.stopImmediatePropagation++; ev.stopped = true; };
  return ev;
}
function dispatch(type, target, init) {
  const ev = mkEvent(type, target, init);
  for (const r of [...doc.l]) if (r.type === type && r.capture && doc.l.includes(r)) r.fn(ev);
  const path = []; for (let n = target; n; n = n.parent) path.unshift(n);
  for (const n of path) { if (ev.stopped) break; for (const r of n.l) if (r.type === type) r.fn(ev); }
  if (!ev.stopped) for (const r of [...doc.l]) if (r.type === type && !r.capture && doc.l.includes(r)) r.fn(ev);
  return ev;
}
/** A mouse click as the browser runs it: pointerdown; the compatibility mousedown ONLY if pointerdown was not cancelled
 *  (the measured Chrome behaviour); pointerup / mouseup; click regardless. Event timeStamps share performance.now()'s
 *  origin, as in a browser. Returns the events. */
function mouseClick(target, at = performance.now()) {
  const pd = dispatch('pointerdown', target, { pointerType: 'mouse', timeStamp: at });
  const md = pd.defaultPrevented ? null : dispatch('mousedown', target, { timeStamp: at });
  const pu = dispatch('pointerup', target, { pointerType: 'mouse', timeStamp: at + 60 });
  const ck = dispatch('click', target, { timeStamp: at + 60 });
  return { pd, md, pu, ck };
}
/** A touch: pointerdown at (x,y); then either pointercancel (the browser took it for a scroll) or pointerup at
 *  (x+dx, y+dy) after heldMs; compatibility mousedown + click only for a tap whose pointerdown was not cancelled. */
function touch(target, { dx = 0, dy = 0, heldMs = 90, cancel = false, id = 7, upId = null, at = performance.now() } = {}) {
  const pd = dispatch('pointerdown', target, { pointerType: 'touch', pointerId: id, clientX: 100, clientY: 100, timeStamp: at });
  if (cancel) { dispatch('pointercancel', target, { pointerType: 'touch', pointerId: id, timeStamp: at + heldMs }); return { pd }; }
  const pu = dispatch('pointerup', target, { pointerType: 'touch', pointerId: upId ?? id, clientX: 100 + dx, clientY: 100 + dy, timeStamp: at + heldMs });
  const isTap = Math.hypot(dx, dy) <= 10 && heldMs < 500;
  const md = isTap && !pd.defaultPrevented ? dispatch('mousedown', target, { timeStamp: at + heldMs }) : null;
  const ck = isTap ? dispatch('click', target, { timeStamp: at + heldMs }) : null;
  return { pd, pu, md, ck };
}

// the page: body > [workspace > window > pane (xpra: cancels pointerdown, like xpra-view.js) , vnc canvas (stops +
// cancels its mousedown, like noVNC)] + the popover + its anchor + a nested flyout + an unrelated button
const body = new El('body');
doc.body = body;
const workspace = new El('workspace', body);
const win_ = new El('window', workspace);
const pane = new El('xpra-pane', win_);
const paneCanvas = new El('canvas', pane);
pane.addEventListener('pointerdown', (e) => e.preventDefault()); // xpra-view.js: ime.focus(); e.preventDefault(); setPointerCapture
const vncCanvas = new El('vnc-canvas', win_);
vncCanvas.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); }); // noVNC's stopEvent
const stopPane = new El('stopping-pane', win_);
stopPane.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); // a pane that stops the press too
const toolbar = new El('toolbar', body);
const other = new El('other-button', toolbar);
const fresh = () => { const anchor = new El('anchor', toolbar); const anchorIcon = new El('anchor-svg', anchor); const pop = new El('popover', body, { popover: true }); const row = new El('row', pop); const flyout = new El('flyout', row, { popover: true }); const flyRow = new El('fly-row', flyout); const sibling = new El('other-popover', body, { popover: true }); return { anchor, anchorIcon, pop, row, flyout, flyRow, sibling }; };
/** the listeners a leg armed = the document's listeners that were not there before it (each leg disposes its own) */
const since = (before) => doc.l.filter((r) => !before.includes(r));

const U = await import('../src/lib/utils.js');
// utils.js's own import-time listeners (the instant tooltip) are not the closer's: only listeners added AFTER this point
// are counted as "ours"
const importTime = [...doc.l];
ok(importTime.some((r) => r.type === 'pointerdown' && r.capture && r.passive) && !importTime.some((r) => r.type === 'mousedown'), 'the instant tooltip hides on a capture-phase passive pointerdown (no document mousedown left in utils.js)');

// ── §2 THE REAL HELPER ──────────────────────────────────────────────────────
console.log('§2 onOutsidePress under the dispatch model');
{
  // (a) arming: SYNCHRONOUS (a setTimeout(0) deferral was starved on the real rung — input runs ahead of timers), exactly
  // pointerdown / pointerup / pointercancel, capture + passive; the press that opened the surface (stamped BEFORE the
  // arming) never closes it
  const { pop } = fresh();
  let closed = 0;
  const before = [...doc.l];
  const openedAt = performance.now() - 5; // the opening press began before the surface existed
  const dispose = U.onOutsidePress(pop, () => { closed++; pop.remove(); });
  const mine = since(before);
  ok(mine.length === 3 && ['pointerdown', 'pointerup', 'pointercancel'].every((t) => mine.some((r) => r.type === t)) && mine.every((r) => r.capture && r.passive), `(a) armed at once: ${mine.map((r) => `${r.type}${r.capture ? ' capture' : ''}${r.passive ? ' passive' : ''}`).join(', ')}`);
  mouseClick(paneCanvas, openedAt);
  touch(paneCanvas, { at: openedAt });
  ok(closed === 0 && pop.removed === 0, '(a) the OPENING press (mouse or a touch tap stamped before the arming) never closes it');
  // (b) THE INCIDENT: a mouse press INTO the xpra pane — the pane cancels pointerdown, so no mousedown exists
  const e1 = mouseClick(paneCanvas);
  ok(e1.md === null && e1.ck !== null, '(b) the model reproduces the browser: a press into the pane fires no mousedown (cancelled pointerdown), click still fires');
  ok(closed === 1 && pop.removed === 1, `(b) …and the closer CLOSES on it (closed ${closed}×)`);
  ok(e1.pd.calls.preventDefault === 1 && e1.pd.calls.stopPropagation === 0 && e1.pd.calls.stopImmediatePropagation === 0, `(b) the press still reaches the app: the only preventDefault on it is the pane's own, nobody stopped it (${JSON.stringify(e1.pd.calls)})`);
  ok(since(before).length === 0, '(b) once: the closer retired after closing (no listener left)');
  dispose(); // idempotent
}
{
  // (c) noVNC's canvas: its mousedown is stopped AND cancelled — the capture pointerdown still sees the press
  const { pop } = fresh(); let closed = 0; const before = [...doc.l];
  U.onOutsidePress(pop, () => { closed++; });
  const e = mouseClick(vncCanvas);
  ok(closed === 1 && e.md && e.md.calls.stopPropagation === 1 && since(before).length === 0, '(c) a press on a noVNC-like canvas (mousedown stopped + cancelled) closes too');
}
{
  // (d) the rows that keep it open: inside, the anchor (and its icon), a nested flyout; an unrelated popover closes it
  // under the default rule? no — any [data-popover] is a child interaction (the chained-popover rule)
  const { pop, anchor, anchorIcon, row, flyRow, sibling } = fresh(); let closed = 0; const before = [...doc.l];
  U.onOutsidePress(pop, () => { closed++; }, { exclude: [anchor] });
  for (const t of [row, pop, anchor, anchorIcon, flyRow, sibling]) mouseClick(t);
  ok(closed === 0, `(d) a press inside the popover, on its anchor (and the anchor's icon), in a nested flyout, in another [data-popover] keeps it open (closed ${closed}×)`);
  mouseClick(other);
  ok(closed === 1 && since(before).length === 0, '(d) a press on an unrelated button closes it');
}
{
  // (e) nested:false — a surface that never honoured the chained-popover rule closes on a press in another popover
  const { pop, sibling } = fresh(); let closed = 0; const before = [...doc.l];
  U.onOutsidePress(pop, () => { closed++; }, { nested: false });
  mouseClick(sibling);
  ok(closed === 1, '(e) nested:false — a press in another [data-popover] closes it (the surface\'s own rule kept)');
}
{
  // (f) ignore(target): an exact-anchor rule (chat-status-bar / lang picker / mobile-nav) — the anchor element itself
  // keeps it open, a CHILD of the anchor does not (the rule is equality, kept verbatim)
  const { pop, anchor, anchorIcon } = fresh(); let closed = 0; const before = [...doc.l];
  const dispose = U.onOutsidePress(pop, () => { closed++; }, { ignore: (t) => t === anchor, once: false });
  mouseClick(anchor);
  ok(closed === 0, '(f) ignore: a press ON the anchor element is the toggle\'s (kept open)');
  mouseClick(anchorIcon);
  ok(closed === 1, '(f) …a press on its child is not the element (the surface\'s equality rule, kept)');
  dispose();
}
{
  // (g) persistent (once:false): the For-you / usage popups — armed for the app's life, close on every outside press
  const { pop, anchor } = fresh(); let closed = 0; const before = [...doc.l];
  const dispose = U.onOutsidePress(pop, () => { closed++; pop.classList.add('hidden'); }, { exclude: [anchor], once: false, nested: false });
  ok(since(before).length === 3, '(g) armed');
  mouseClick(paneCanvas); mouseClick(other); mouseClick(anchor); mouseClick(pop);
  ok(closed === 2 && since(before).length === 3, `(g) once:false stays armed and closes on each outside press (${closed}× for the pane + the button; the toggle and the popup itself exempt)`);
  dispose();
  ok(since(before).length === 0, '(g) the dispose function removes every listener');
}
{
  // (h) root gone: removed by Escape's [data-popover] sweep or its own item click — the closer retires on the next press
  // WITHOUT calling close
  const { pop } = fresh(); let closed = 0; const before = [...doc.l];
  U.onOutsidePress(pop, () => { closed++; });
  pop.remove();
  mouseClick(other);
  ok(closed === 0 && since(before).length === 0, '(h) a popover removed by other means: the next press retires the closer, close never runs on a detached surface');
}
{
  // (i) the signal (a window-scoped surface passes winInfo._listenerCtl.signal): abort removes it; an aborted one arms nothing
  const { pop } = fresh(); let closed = 0; const before = [...doc.l];
  const ctl = new AbortController();
  U.onOutsidePress(pop, () => { closed++; }, { signal: ctl.signal });
  ok(since(before).length === 3, '(i) armed with a signal');
  ctl.abort();
  mouseClick(other);
  ok(closed === 0 && since(before).length === 0, '(i) the signal aborted: every listener gone, no close');
  const dead = new AbortController(); dead.abort(); const b2 = [...doc.l];
  U.onOutsidePress(pop, () => { closed++; }, { signal: dead.signal });
  ok(since(b2).length === 0, '(i) an already-aborted signal arms nothing');
}
{
  // (j) TOUCH: a tap in the picture closes (at pointerup); a scroll (pointercancel), a drag, a long-press, a stray
  // pointerup of another pointer never do
  const { pop } = fresh(); let closed = 0; const before = [...doc.l];
  const dispose = U.onOutsidePress(pop, () => { closed++; }, { once: false });
  const s = touch(paneCanvas, { cancel: true });
  const d = touch(paneCanvas, { dy: 40 });
  const lp = touch(paneCanvas, { heldMs: 650 });
  const stray = touch(paneCanvas, { upId: 99 });
  ok(closed === 0, `(j) a scroll (pointercancel), a 40 px drag, a 650 ms long-press and a pointerup of another pointer do not close (closed ${closed}×)`);
  void s; void d; void lp; void stray;
  const tap = touch(paneCanvas, {});
  ok(closed === 1 && tap.md === null && tap.ck !== null, '(j) a TAP in the picture closes (judged at pointerup) — and there was no mousedown to close on');
  const tapIn = touch(pop, {});
  ok(closed === 1 && tapIn.md !== null, '(j) a tap inside the popover does not (judged where it went DOWN)');
  const pen = (() => { const t0 = performance.now(); const pd = dispatch('pointerdown', other, { pointerType: 'pen', pointerId: 3, clientX: 5, clientY: 5, timeStamp: t0 }); dispatch('pointerup', other, { pointerType: 'pen', pointerId: 3, clientX: 6, clientY: 5, timeStamp: t0 + 60 }); return pd; })();
  ok(closed === 2 && pen.calls.preventDefault === 0, '(j) a pen tap closes like a finger');
  dispose();
}
{
  // (k) attachPopoverClose = the helper with the anchor exempt (createPopover / showContextMenu / terminal / window /
  // file-explorer menus)
  const { pop, anchor, flyRow } = fresh(); const before = [...doc.l];
  const d = U.attachPopoverClose(pop, anchor);
  ok(typeof d === 'function', '(k) attachPopoverClose returns the dispose function');
  mouseClick(anchor); mouseClick(flyRow);
  ok(pop.removed === 0, '(k) attachPopoverClose: the anchor and a nested flyout keep it');
  mouseClick(paneCanvas);
  ok(pop.removed === 1 && since(before).length === 0, '(k) attachPopoverClose: a press into the picture removes it and retires');
}

{
  // (l) A PRESS INTO A FRAME (lane menu-close-residue, B-5bd5 ①): the frame's document takes the press, the parent sees
  // `window` blur with document.activeElement = the frame and hasFocus() true (measured in Chrome for a same-origin, a
  // cross-origin and a sandboxed srcdoc frame alike) — the closer closes on it, on the same signal and `once` rule
  const { pop, anchor } = fresh(); const frame = new El('iframe', win_); let closed = 0; const bd = [...doc.l], bw = [...win.l];
  const dispose = U.onOutsidePress(pop, () => { closed++; pop.remove(); }, { exclude: [anchor] });
  ok(winSince(bw).length === 1 && winSince(bw)[0].type === 'blur' && since(bd).length === 3, `(l) the helper arms ONE window listener beside its three document ones: ${winSince(bw).map((r) => r.type).join(', ')}`);
  blurAll({ active: body, hasFocus: true });
  ok(closed === 0, '(l) the brief\'s simulation — window.dispatchEvent(new Event(\'blur\')) with the body active — does NOT close it (a blur to another window / the devtools)');
  const row = new El('row-focused', toolbar);
  blurAll({ active: row, hasFocus: false });
  ok(closed === 0, '(l) a REAL blur to another top-level window (a menu row still the active element, hasFocus() false) does NOT close it');
  blurAll({ active: frame, hasFocus: false });
  ok(closed === 0, '(l) a frame as the active element with the page unfocused does NOT close it (the belt; measured never to reach the parent)');
  blurAll({ active: frame, hasFocus: true });
  ok(closed === 1 && pop.removed === 1, `(l) THE RESIDUE: a press into a frame — blur with activeElement = the frame, hasFocus() true — CLOSES it (closed ${closed}×)`);
  ok(since(bd).length === 0 && winSince(bw).length === 0, '(l) once: every listener gone after the close (the window one rides the same signal)');
  dispose();
}
{
  // (l′) the frame rows that keep it open: a frame INSIDE the surface, a frame inside its anchor, the ignore rule; a
  // surface removed by other means retires on the blur without close; once:false stays armed; the signal takes it down
  const { pop, anchor } = fresh(); const inPop = new El('iframe', pop), inAnchor = new El('iframe', anchor), frame = new El('iframe', win_);
  let closed = 0; const bw = [...win.l];
  const d1 = U.onOutsidePress(pop, () => { closed++; }, { exclude: [anchor], ignore: (t) => t.id === 'ignored-frame', once: false });
  const ignoredFrame = new El('iframe', win_, { id: 'ignored-frame' });
  blurAll({ active: inPop }); blurAll({ active: inAnchor }); blurAll({ active: ignoredFrame });
  ok(closed === 0 && winSince(bw).length === 1, `(l′) a frame inside the popover, inside its anchor, or named by the ignore rule keeps it open (closed ${closed}×)`);
  blurAll({ active: frame }); blurAll({ active: frame });
  ok(closed === 2 && winSince(bw).length === 1, `(l′) once:false — closes on each frame blur and stays armed (${closed}×)`);
  d1();
  ok(winSince(bw).length === 0, '(l′) dispose removes the window listener');
  const gone = fresh(); let closedG = 0; const bw2 = [...win.l];
  U.onOutsidePress(gone.pop, () => { closedG++; });
  gone.pop.remove(); blurAll({ active: frame });
  ok(closedG === 0 && winSince(bw2).length === 0, '(l′) a popover removed by other means (Escape): the blur retires the closer, close never runs');
  const ctl = new AbortController(); const bw3 = [...win.l]; const sig = fresh();
  U.onOutsidePress(sig.pop, () => {}, { signal: ctl.signal }); const armed = winSince(bw3).length; ctl.abort();
  ok(armed === 1 && winSince(bw3).length === 0, '(l′) a window-scoped surface\'s signal takes the window listener down with the rest');
}
{
  // (m) THE ANCHOR TOGGLES (lane menu-close-residue, B-5bd5 ②): createPopover's dedup knows the open popover of its
  // class — hanging off the SAME anchor, the call is the anchor pressed again (a press, or Enter on the focused
  // button: the toggle is keyed on the anchor, not on a press) and it CLOSES; the element handed back is DETACHED
  const gear = new El('button', toolbar, { id: 'btn-global-settings' }); const bd = [...doc.l], bw = [...win.l];
  const p1 = U.createPopover(gear, 'global-settings-popover');
  ok(p1.isConnected && p1.parent === body && p1.dataset.popover === '1' && p1._anchor === gear && doc.querySelectorAll('.global-settings-popover').length === 1, '(m) the first call opens the popover under the anchor (attached, [data-popover], its anchor stamped)');
  ok(since(bd).length === 3 && winSince(bw).length === 1, '(m) …with its closer armed (three document listeners + the window blur)');
  const p2 = U.createPopover(gear, 'global-settings-popover');
  ok(p1.removed === 1 && !p1.isConnected && doc.querySelectorAll('.global-settings-popover').length === 0, '(m) THE RESIDUE: the same anchor again CLOSES the open popover — nothing of that class in the document');
  ok(p2 !== p1 && !p2.isConnected && p2._closedByAnchor === true && p2.parent === null, '(m) …and hands back a DETACHED element the caller fills unseen (nothing per site)');
  mouseClick(other);
  ok(since(bd).length === 0 && winSince(bw).length === 0, '(m) the closed popover\'s closer retires on the next press (root-gone), as any dedup removal did');
  const p3 = U.createPopover(gear, 'global-settings-popover');
  ok(p3.isConnected && !p3._closedByAnchor, '(m) the anchor pressed once more OPENS again (a toggle, not a lock)');
  const other2 = new El('button', toolbar); const p4 = U.createPopover(other2, 'global-settings-popover');
  ok(p3.removed === 1 && p4.isConnected && p4._anchor === other2, '(m) ANOTHER anchor of the same class replaces it (the dedup as before — not a toggle)');
  p4.remove(); // Escape's sweep
  const p5 = U.createPopover(other2, 'global-settings-popover');
  ok(p5.isConnected && !p5._closedByAnchor, '(m) a popover closed by Escape: its anchor opens it again (a closed one never toggles)');
  p5.remove();
  const pane = new El('pane', win_); const c1 = U.createPopover(pane, 'doc-lbar', { position: 'cursor', x: 10, y: 10 }); const c2 = U.createPopover(pane, 'doc-lbar', { position: 'cursor', x: 40, y: 10 });
  ok(c1.removed === 1 && c2.isConnected && !c2._closedByAnchor, '(m) a CURSOR-placed popover (the doc link bar: its "anchor" is the whole pane) is rebuilt at the new place, never toggled');
  c2.remove();
  const r1 = U.createPopover(gear, 'file-view-menu'); const r2 = U.createPopover(gear, 'file-view-menu', { toggle: false });
  ok(r1.removed === 1 && r2.isConnected && !r2._closedByAnchor, '(m) toggle:false — a programmatic rebuild (the explorer view menu re-rendering itself) replaces as before');
  r2.remove();
  const s1 = U.createPopover(gear, 'session-config-popover'); const s2 = U.createPopover(gear, 'status-filter-menu');
  ok(s1.isConnected && s2.isConnected, '(m) two popovers of different classes off one anchor are two popovers (the key is the class + the anchor)');
  s1.remove(); s2.remove(); mouseClick(other);
}

// ── §3 CONTROLS ─────────────────────────────────────────────────────────────
console.log('§3 controls — the pre-lane closer, and the helper patched back');
{
  // (a) THE PRE-LANE CLOSER, verbatim (utils.js attachPopoverClose at 2.369.177), in the same model: the incident
  function preLaneAttach(popover, ...excludeEls) {
    setTimeout(() => {
      const close = (e) => {
        if (popover.contains(e.target)) return;
        for (const el of excludeEls) { if (el?.contains(e.target)) return; }
        if (e.target.closest?.('[data-popover]')) return;
        popover.remove();
        document.removeEventListener('mousedown', close);
      };
      document.addEventListener('mousedown', close);
    }, 0);
  }
  const A = fresh();
  preLaneAttach(A.pop, A.anchor); await tick();
  mouseClick(paneCanvas); mouseClick(vncCanvas);
  ok(A.pop.removed === 0, 'CONTROL (pre-lane closer): a press into the xpra pane AND onto the noVNC canvas leave the menu OPEN — the owner\'s report, reproduced in the model');
  mouseClick(other);
  ok(A.pop.removed === 1, 'CONTROL (pre-lane closer): …while a press anywhere else closes it (the model is not simply inert)');
  doc.l = doc.l.filter((r) => r.type !== 'mousedown' || importTime.includes(r));
}
const M = mutantCopies('outside-press', repo);
{
  const src = fs.readFileSync(path.join(repo, 'src/lib/utils.js'), 'utf8');
  const ARM = "document.addEventListener('pointerdown', (e) => {\n    const opening = began(e) === 'before';";
  const OPTS = 'const o = { capture: true, passive: true, signal: ctl.signal };';
  ok(src.split(ARM).length === 2 && src.split(OPTS).length === 2, 'the two edits the controls make are each spelled exactly once in utils.js');
  // (b) the helper listening for mousedown again (the pre-lane event): the pane's cancelled pointerdown has no mousedown
  const mdF = M.write('src/lib/utils.js', src.replace(ARM, ARM.replace("'pointerdown'", "'mousedown'")), 'mousedown');
  const UM = await import(pathToFileURL(mdF).href);
  const B = fresh(); let closedB = 0; const bb = [...doc.l];
  const dB = UM.onOutsidePress(B.pop, () => { closedB++; }, { once: false });
  mouseClick(paneCanvas);
  const openOverPane = closedB === 0;
  mouseClick(other);
  ok(openOverPane && closedB === 1, `CONTROL (the helper on 'mousedown'): a press into the pane leaves it OPEN, a press elsewhere closes it (${closedB}×) — the event the helper listens for is the fix`);
  dB();
  // (c) the helper in the BUBBLE phase: a pane that stops the press (stopPropagation on pointerdown) hides it
  const bubF = M.write('src/lib/utils.js', src.replace(OPTS, 'const o = { capture: false, passive: true, signal: ctl.signal };'), 'bubble');
  const UB = await import(pathToFileURL(bubF).href);
  const C = fresh(); let closedC = 0; const bc = [...doc.l];
  const dC = UB.onOutsidePress(C.pop, () => { closedC++; }, { once: false });
  mouseClick(stopPane);
  const bubbleBlind = closedC === 0;
  dC();
  const D = fresh(); let closedD = 0; const bd = [...doc.l];
  const dD = U.onOutsidePress(D.pop, () => { closedD++; }, { once: false });
  mouseClick(stopPane);
  dD();
  ok(bubbleBlind && closedD === 1, `CONTROL (the helper in the bubble phase): a pane that stops its press keeps the menu OPEN; the real capture-phase helper closes it (${closedD}×) — the phase is the fix`);
  // (d) lane menu-close-residue: the helper WITHOUT its window blur listener — a press into a frame (the parent sees
  // only the blur) leaves the menu OPEN; the real helper closes
  const BLUR_GATE = "if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {\n    window.addEventListener('blur', (e) => {";
  const TOGGLE = "if (reopened && opts.position !== 'cursor' && opts.toggle !== false) {";
  ok(src.split(BLUR_GATE).length === 2 && src.split(TOGGLE).length === 2, 'the two edits the lane\'s controls make are each spelled exactly once in utils.js');
  const nbF = M.write('src/lib/utils.js', src.replace(BLUR_GATE, "if (false) {\n    window.addEventListener('blur', (e) => {"), 'no-blur');
  const UN = await import(pathToFileURL(nbF).href);
  const E = fresh(); const frameE = new El('iframe', win_); let closedE = 0;
  const dE = UN.onOutsidePress(E.pop, () => { closedE++; }, { once: false });
  blurAll({ active: frameE, hasFocus: true });
  const blindToFrame = closedE === 0;
  mouseClick(other);
  dE();
  const F = fresh(); let closedF = 0; const dF = U.onOutsidePress(F.pop, () => { closedF++; }, { once: false });
  blurAll({ active: frameE, hasFocus: true }); dF();
  ok(blindToFrame && closedE === 1 && closedF === 1, `CONTROL (the helper without its blur listener): a press into a frame leaves the menu OPEN (a press elsewhere still closes, ${closedE}×); the real helper closes on the frame (${closedF}×) — the blur listener is the fix`);
  // (e) createPopover WITHOUT the toggle — the residue itself: the second press on ⚙ REBUILDS the popover
  const ntF = M.write('src/lib/utils.js', src.replace(TOGGLE, 'if (false) {'), 'no-toggle');
  const UT = await import(pathToFileURL(ntF).href);
  const gearT = new El('button', toolbar);
  const q1 = UT.createPopover(gearT, 'global-settings-popover'); const q2 = UT.createPopover(gearT, 'global-settings-popover');
  const rebuilt = q1.removed === 1 && q2.isConnected && q2 !== q1 && doc.querySelectorAll('.global-settings-popover').length === 1;
  q2.remove(); mouseClick(other);
  const g1 = U.createPopover(gearT, 'global-settings-popover'); const g2 = U.createPopover(gearT, 'global-settings-popover');
  ok(rebuilt && g1.removed === 1 && !g2.isConnected && doc.querySelectorAll('.global-settings-popover').length === 0, 'CONTROL (createPopover without the toggle — the pre-lane shape): ⚙ pressed while its menu is open REBUILDS the menu (a new attached popover); the real one closes it — the toggle in the dedup is the fix');
  mouseClick(other);
  for (const row of copiesCensus(M.files, M.dir, repo, { label: 'mutant copies: ' })) ok(row.pass, row.name, row.detail);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
