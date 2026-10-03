// THE WORK METER — a complexity gate counts WORK, never the clock (lane-mirror-198, 2026-09-29).
// The Actions mirror of 2.369.198 read test-channel-reactions' linear pin red at ×2.50 on a shared 4-vCPU runner
// (a wall-clock ratio at its boundary is a coin flip there; the same leg had already flaked in the .197 run after
// being "rebuilt to compare best times"). A parser's complexity is a fact about its CODE, not about the machine:
// this meter counts the operations a call performs, exactly, so 2× the input reads as 2× the count on any box.
//   · BLOCK EXECUTIONS — V8's precise block coverage (the inspector's Profiler.startPreciseCoverage with
//     callCount + detailed): every basic block of the measured modules carries an execution counter, taken and RESET
//     around each measured call; a loop body counts once per iteration, a branch once per time it was taken. Exact,
//     unaffected by load, and V8 disables optimized code while precise coverage is on, so a hot function counts the
//     same as a cold one. The meter must START before the measured modules are loaded (a function compiled before
//     coverage began has no block counters — only its call count).
//   · NATIVE WORK — the built-ins a parser leans on do their loops inside V8, invisible to coverage: while a call is
//     measured, the array / string / collection / iterator prototypes are patched to add each call's element work
//     (includes/indexOf: the elements scanned; filter/map/some/find…: the callbacks run; shift/splice/unshift: the
//     elements moved; a string walker: the receiver's length; slice: the cut; JSON.stringify: the bytes; a
//     Set/Map op: 1; an iterator's next: 1 — `for…of`, spread and `new Set(list)` go through it once patched).
//     A quadratic `order.includes(key)` per delta reads ×4 through the scan count exactly as its clock would.
//   · `measure(fn)` → { blocks, native, total } for one call; `linear(mk, run, n)` → the verdict for a parser over
//     mk(n) vs mk(2n) with the constant part (mk(0)'s work) subtracted: ratio ≤ LINEAR_BOUND (2.2 — a linear parser
//     reads 2.0, a quadratic 4.0; an n·log n sort of already-ordered keys reads ~2.0 as V8's TimSort walks it once).
//   · `bounded(mk, run, n)` → "bounded before the work": the work over an oversize input mk(n) vs mk(2n) — a parser
//     that cuts its input before walking it does the same work for both (ratio ≤ BOUNDED_RATIO).
// Deterministic by construction: two measurements of the same call agree byte for byte (the suite asserts it).
import inspector from 'node:inspector';

export const LINEAR_BOUND = 2.2;
export const BOUNDED_RATIO = 1.25;

let session = null;
let started = false;
const post = (method, params) => { let out, err; session.post(method, params || {}, (e, r) => { err = e; out = r; }); if (err) throw err; return out; };

/** Start precise block coverage — BEFORE the measured modules are required. Idempotent. */
export function startWorkMeter() {
  if (started) return;
  session = new inspector.Session();
  session.connect();
  post('Profiler.enable');
  post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  post('Profiler.takePreciseCoverage'); // reset
  started = true;
}

/** Block executions of every function of the scripts whose url ends with one of `files` since the last take. */
function takeBlocks(files) {
  const res = post('Profiler.takePreciseCoverage');
  let n = 0;
  for (const s of res.result || []) {
    if (!files.some((f) => s.url.endsWith(f))) continue;
    for (const fn of s.functions || []) for (const r of fn.ranges || []) n += r.count;
  }
  return n;
}

// ── native work: the prototypes patched only while a call is measured (the wrappers lean on ORIGINALS captured
// here, never on a prototype that may be patched when they run) ──
let W = 0;
const saved = [];
const ORIG = { indexOf: Array.prototype.indexOf, keys: Object.keys };
const patch = (obj, name, mk) => { const orig = obj[name]; if (typeof orig !== 'function') return; saved.push([obj, name, orig]); obj[name] = mk(orig); };
const cbCounting = (orig) => function (cb, thisArg) { let k = 0; const r = orig.call(this, function (...a) { k++; return cb.apply(this, a); }, thisArg); W += k; return r; };
const lengthOfThis = (orig) => function (...a) { W += this.length; return orig.apply(this, a); };
const resultLength = (orig) => function (...a) { const r = orig.apply(this, a); W += r && r.length ? r.length : 1; return r; };
const one = (orig) => function (...a) { W++; return orig.apply(this, a); };
function patchAll() {
  const AP = Array.prototype, SP = String.prototype;
  for (const m of ['filter', 'map', 'forEach', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap']) patch(AP, m, cbCounting);
  patch(AP, 'reduce', (orig) => function (cb, ...rest) { let k = 0; const r = orig.call(this, function (...a) { k++; return cb.apply(this, a); }, ...rest); W += k; return r; });
  patch(AP, 'includes', (orig) => function (v, from) { const i = ORIG.indexOf.call(this, v, from); W += i >= 0 ? i + 1 : this.length; return orig.call(this, v, from); });
  patch(AP, 'indexOf', (orig) => function (v, from) { const i = orig.call(this, v, from); W += i >= 0 ? i + 1 : this.length; return i; });
  patch(AP, 'lastIndexOf', (orig) => function (v, ...rest) { const i = orig.call(this, v, ...rest); W += i >= 0 ? this.length - i : this.length; return i; });
  for (const m of ['join', 'reverse', 'fill', 'copyWithin', 'shift', 'unshift', 'splice', 'toString']) patch(AP, m, lengthOfThis);
  for (const m of ['slice', 'concat', 'flat']) patch(AP, m, resultLength);
  patch(AP, 'sort', (orig) => function (cmp) { W += this.length; return cmp ? orig.call(this, function (a, b) { W++; return cmp(a, b); }) : orig.call(this); });
  for (const m of ['push', 'pop', 'at']) patch(AP, m, one);
  patch(Array, 'from', resultLength);
  for (const [C, ms] of [[Set, ['has', 'add', 'delete']], [Map, ['has', 'get', 'set', 'delete']]]) for (const m of ms) patch(C.prototype, m, one);
  for (const it of [[][Symbol.iterator](), new Set()[Symbol.iterator](), new Map()[Symbol.iterator](), ''[Symbol.iterator]()]) patch(Object.getPrototypeOf(it), 'next', one);
  for (const m of ['replace', 'replaceAll', 'match', 'matchAll', 'split', 'search', 'includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toUpperCase', 'normalize', 'localeCompare']) patch(SP, m, lengthOfThis);
  for (const m of ['slice', 'substring', 'substr', 'repeat', 'padStart', 'padEnd', 'concat']) patch(SP, m, resultLength);
  for (const m of ['at', 'charAt', 'charCodeAt', 'codePointAt']) patch(SP, m, one);
  patch(RegExp.prototype, 'test', (orig) => function (s) { W += String(s).length; return orig.call(this, s); });
  patch(RegExp.prototype, 'exec', (orig) => function (s) { W += String(s).length; return orig.call(this, s); });
  patch(JSON, 'stringify', (orig) => function (...a) { const r = orig(...a); W += typeof r === 'string' ? r.length : 1; return r; });
  patch(JSON, 'parse', (orig) => function (s, ...rest) { W += String(s).length; return orig(s, ...rest); });
  for (const m of ['keys', 'values', 'entries']) patch(Object, m, resultLength);
  patch(Object, 'fromEntries', (orig) => function (it) { const r = orig(it); W += ORIG.keys(r).length; return r; });
  patch(Object, 'assign', (orig) => function (t, ...srcs) { for (let i = 0; i < srcs.length; i++) if (srcs[i]) W += ORIG.keys(srcs[i]).length; return orig(t, ...srcs); });
}
function unpatchAll() { while (saved.length) { const [obj, name, orig] = saved.pop(); obj[name] = orig; } }

/**
 * The work of ONE call: `files` = the measured modules (url suffixes). The block counters are taken (reset) before
 * the call and read after it; the natives are patched only around the call (a throw restores them).
 */
export function measure(fn, files) {
  if (!started) throw new Error('work-meter: startWorkMeter() must run before the measured modules are loaded');
  takeBlocks(files);
  patchAll(); W = 0; // reset AFTER the patching (its own pushes ride the patched push)
  let native = 0;
  try { fn(); } finally { native = W; unpatchAll(); } // read BEFORE the unpatching (its pops would count)
  const blocks = takeBlocks(files);
  return { blocks, native, total: blocks + native };
}

/**
 * The work of ONE ASYNC call (lane channel-index-copy, B-f32b — a server route awaits): the same take/patch as
 * `measure`, held across the awaited promise. EVERYTHING the process runs meanwhile is counted, so the caller keeps
 * timers and other I/O out of that window (an injected clock, no started loops).
 */
export async function measureAsync(fn, files) {
  if (!started) throw new Error('work-meter: startWorkMeter() must run before the measured modules are loaded');
  takeBlocks(files);
  patchAll(); W = 0;
  let native = 0;
  try { await fn(); } finally { native = W; unpatchAll(); }
  const blocks = takeBlocks(files);
  return { blocks, native, total: blocks + native };
}

/** The work of `run(x)` in the parser's STEADY STATE: the input is built OUTSIDE the measured call (its construction
 *  is not the parser's work), and the call is measured TWICE, the second reading returned — measured: the very first
 *  measured execution of a function reads a constant more (V8 folds the counts of its lazy compile's first run into
 *  the first take that sees it — 2 000 extra blocks on compactSide over 2 000 deltas, then exact for ever after, fresh
 *  inputs included); a module-level memo filling on its first sight of an input is not the parser's growth either. */
function steady(run, x, files) { measure(() => run(x), files); return measure(() => run(x), files).total; }

/** The work of ONE call in its steady state (measured twice, the second reading — see `steady`). */
export function work(fn, files) { measure(fn, files); return measure(fn, files).total; }

/** THE LINEAR VERDICT: ops(2n) ≤ LINEAR_BOUND · ops(n) after the constant part (mk(0)) is subtracted. */
export function linear(mk, run, n, files, { bound = LINEAR_BOUND } = {}) {
  const x0 = mk(0), x1 = mk(n), x2 = mk(2 * n);
  const c = steady(run, x0, files);
  const w1 = Math.max(1, steady(run, x1, files) - c);
  const w2 = Math.max(1, steady(run, x2, files) - c);
  const r = w2 / w1;
  return { n, c, w1, w2, r, ok: r <= bound, bound };
}

/** "BOUNDED BEFORE THE WORK": an oversize input twice as large costs no more (a cut precedes the walk). */
export function bounded(mk, run, n, files, { ratio = BOUNDED_RATIO, slack = 256 } = {}) {
  const x1 = mk(n), x2 = mk(2 * n);
  const w1 = steady(run, x1, files);
  const w2 = steady(run, x2, files);
  return { n, w1, w2, r: w2 / Math.max(1, w1), ok: w2 <= ratio * w1 + slack, ratio };
}

/** The meter's own proof: the same call measured twice agrees exactly (after the one measured warm call `steady` takes). */
export function deterministic(fn, files) {
  measure(fn, files);
  const a = measure(fn, files), b = measure(fn, files);
  return { ok: a.total === b.total && a.blocks === b.blocks && a.native === b.native, a, b };
}
