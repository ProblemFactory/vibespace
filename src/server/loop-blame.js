'use strict';
// THE BLOCKED LOOP NAMES ITS BLOCKER (lane vault-slow-load addendum — the owner's inc-mvk5ues0 «打开保险库用了差不多一分钟才
// 加载完»: the hub's journal said «the main loop held the probe's answer 5892ms — a blocked loop» and nothing about WHAT held
// it). Every SYNC fs call the main thread makes is timed; one slower than SLOW_CALL_MS joins a ring of the last KEPT: the
// call, the file, the bytes, the ms and the first src/ frame that made it (installed by src/server/boot-trace.js start()). The canary's «blocked loop» line (and anything
// else that saw a gap) asks blame(from, to) for the calls inside its window, worded by blameWords — the file, the bytes, the
// caller. A window with no slow sync call is CPU work and is said so. Main thread only; a worker's fs is its own.
const fs = require('fs');
const path = require('path');

const SLOW_CALL_MS = 20;
const KEPT = 60;
const SYNC_FNS = Object.freeze(['readFileSync', 'readSync', 'writeFileSync', 'writeSync', 'appendFileSync', 'copyFileSync', 'readdirSync',
  'statSync', 'lstatSync', 'fstatSync', 'existsSync', 'openSync', 'closeSync', 'renameSync', 'rmSync', 'mkdirSync', 'unlinkSync', 'realpathSync']);
const ring = [];
const WRAPPED = new WeakSet();   // the wrappers this module made (never a property on fs's functions)
let installed = false, rootDir = null;

/** PURE: the bytes a sync call moved (a read's result, a write's data), else null. */
function bytesOf(fn, args, result) {
  if (fn === 'readFileSync') return result != null && typeof result.length === 'number' ? (typeof result === 'string' ? Buffer.byteLength(result) : result.length) : null;
  if (fn === 'readSync' || fn === 'writeSync') return typeof result === 'number' ? result : null;
  if (fn === 'writeFileSync' || fn === 'appendFileSync') { const d = args[1]; return d == null ? null : typeof d === 'string' ? Buffer.byteLength(d) : typeof d.length === 'number' ? d.length : null; }
  return null;
}
/** PURE: the first frame of `stack` inside the hub's own code (src/ or server.js under `root`), never this module's. */
function callerOf(stack, root) {
  for (const l of String(stack || '').split('\n').slice(1)) {
    if (l.includes('loop-blame.js')) continue;
    const m = /\(?((?:\/|[A-Za-z]:\\)[^():]+):(\d+):\d+\)?\s*$/.exec(l);
    if (!m) continue;
    const rel = root ? path.relative(root, m[1]) : m[1];
    if (rel.startsWith('..') || !/^(src[\\/]|server\.js$)/.test(rel)) continue;
    const fnm = /^\s*at\s+(?:async\s+)?([^\s(]+)\s+\(/.exec(l);
    return `${rel.split(path.sep).join('/')}:${m[2]}${fnm ? ' ' + fnm[1] : ''}`;
  }
  return null;
}
const pathOf = (a) => (typeof a === 'string' ? a : Buffer.isBuffer(a) ? a.toString() : a instanceof URL ? a.pathname : typeof a === 'number' ? `fd ${a}` : '?');
/** One slow call into the ring (the wrapper's, and a suite's seam). */
function note(rec) { ring.push(rec); if (ring.length > KEPT) ring.splice(0, ring.length - KEPT); return rec; }

/** Wrap the sync fs calls of THIS process's main thread (server.js, at its top — before the modules that destructure fs). */
function install({ root = null, fsMod = fs, slowMs = SLOW_CALL_MS, now = () => Date.now(), hr = () => process.hrtime.bigint() } = {}) {
  let isMain = true;
  try { isMain = require('worker_threads').isMainThread; } catch { }
  if (!isMain || (installed && fsMod === fs)) return false;
  if (fsMod === fs) { installed = true; rootDir = root; }
  let depth = 0;   // a call another wrapped call makes (readFileSync's own openSync) is the outer one's, never a second row
  for (const fn of SYNC_FNS) {
    const orig = fsMod[fn];
    if (typeof orig !== 'function' || WRAPPED.has(orig)) continue;
    const wrapped = function (...args) {
      const t0 = hr(), at = now();
      let r;
      depth++;
      try { r = orig.apply(this, args); } finally { depth--; }
      const ms = Number(hr() - t0) / 1e6;
      if (ms >= slowMs && depth === 0) { try { note({ at, ms: Math.round(ms), fn, path: pathOf(args[0]), bytes: bytesOf(fn, args, r), caller: callerOf(new Error().stack, root) }); } catch { } }
      return r;
    };
    // int343: the wrapper carries EVERY own property of what it wraps — fs.realpathSync.native is one (the automation
    // keys' folder judge and browser-facts call it); a bare wrapper dropped it and every such call threw
    for (const k of Reflect.ownKeys(orig)) if (!Object.prototype.hasOwnProperty.call(wrapped, k)) Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(orig, k));
    WRAPPED.add(wrapped);
    fsMod[fn] = wrapped;
  }
  return true;
}

/** The slow sync calls inside [fromMs, toMs] (wall clock), the longest first. */
function blame(fromMs, toMs, { k = 3, entries = ring } = {}) {
  return entries.filter((e) => e.at + e.ms >= fromMs && e.at <= toMs).sort((a, b) => b.ms - a.ms).slice(0, k);
}
const sizeWord = (n) => (n == null ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(n >= 1073741824 ? 0 : 1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
/** PURE: the window's words — «readFileSync 1024 MB home/…/x.jsonl 15220 ms ← src/foo.js:12 readAll», or that no sync fs call
 *  was slow in it (CPU work: a parse, a stringify, a loop). Paths relative to `root` when under it. */
function blameWords(entries, root = rootDir) {
  if (!entries || !entries.length) return `no sync fs call over ${SLOW_CALL_MS} ms in that window — CPU work on the main thread`;
  return entries.map((e) => {
    const p = root && typeof e.path === 'string' && !e.path.startsWith('fd ') && !path.relative(root, e.path).startsWith('..') ? path.relative(root, e.path) : e.path;
    return [e.fn, sizeWord(e.bytes), p, `${e.ms} ms`].filter(Boolean).join(' ') + (e.caller ? ` ← ${e.caller}` : '');
  }).join('; ');
}

/** Is `fn` one of this module's wrappers. */
const isWrapped = (fn) => WRAPPED.has(fn);

module.exports = { install, blame, blameWords, note, bytesOf, callerOf, isWrapped, SLOW_CALL_MS, KEPT, SYNC_FNS };
