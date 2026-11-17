'use strict';
// THE BLOCKED LOOP NAMES ITS BLOCKER (lane vault-slow-load addendum — the owner's inc-mvk5ues0 «打开保险库用了差不多一分钟才
// 加载完»: the hub's journal said «the main loop held the probe's answer 5892ms — a blocked loop» and nothing about WHAT held
// it). Every SYNC fs call the main thread makes is timed; one slower than SLOW_CALL_MS joins a ring of the last KEPT: the
// call, the file, the bytes, the ms and the first src/ frame that made it (installed by src/server/boot-trace.js start()). The canary's «blocked loop» line (and anything
// else that saw a gap) asks blame(from, to) for the calls inside its window, worded by blameWords — the file, the bytes, the
// caller. A window with no slow sync call is CPU work and is said so. Main thread only; a worker's fs is its own.
// lane hub-fuse-sync-guard (the 6.5-min hold of 2026-10-23, NAMED BY NOTHING: the call that held the loop was outside the
// 18 calls wrapped here): the wrapper now covers EVERY synchronous call of the fs module (`*Sync`, fs.watch — its
// inotify_add_watch walks the path on the main thread — Dir#readSync and realpathSync.native), times a call that THROWS
// too (a mount answering ENOTCONN after minutes is a hold), and carries ONE hook (setHook) the sync fs witness owns
// (src/server/sync-fs-witness.js): before(fn, args, self, t0) may refuse the call before any syscall; after(…) sees its time.
// B-9169 (THE WRAPPER'S OWN COST, measured on Node 22 + 24: ~0.25 µs here + ~0.85 µs in the hook per wrapped call): an
// OUTER call reads the clock twice — performance.now at its start and its end (the start handed to the hook: the
// witness's live slot needs no clock of its own) — and the wall clock only for a call of AT_MS or longer (its start =
// its end less its length; no reader keeps a shorter call). A call another wrapped call makes reads no clock at all.
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const SLOW_CALL_MS = 20;
const AT_MS = 1;   // a call this long or longer is dated on the wall clock (SLOW_CALL_MS and the witness's RING_MS are above it)
const KEPT = 60;
// every synchronous call the fs module has (Node 24: ~50) + fs.watch, never a hand list (the hand list of 18 missed the hold)
const SYNC_FNS = Object.freeze([...Object.keys(fs).filter((k) => /^[a-z][A-Za-z]*Sync$/.test(k) && typeof fs[k] === 'function'), 'watch']);
const ring = [];
const WRAPPED = new WeakSet();   // the wrappers this module made (never a property on fs's functions)
let installed = false, rootDir = null, hook = null;

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
    if (l.includes('loop-blame.js') || l.includes('sync-fs-witness.js') || l.includes('run-reads.js')) continue; // the wrapper and its hook are never the caller — nor the run's one asker (B-403e: the pass, a record or a broadcast is)
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
/** THE hook (one, the sync fs witness's): { before(fn, args, self, t0) — may throw to refuse; after(fn, args, ms, at, result, failed, self) }.
 *  `t0` = the call's start on the performance clock (performance.now) when the wrapper reads that clock, else undefined;
 *  `at` = the call's wall-clock start for a call of AT_MS or longer, else NaN. */
function setHook(h) { hook = h && typeof h.before === 'function' && typeof h.after === 'function' ? h : null; return !!hook; }
/** One slow call into the ring (the wrapper's, and a suite's seam). */
function note(rec) { ring.push(rec); if (ring.length > KEPT) ring.splice(0, ring.length - KEPT); return rec; }

/** Wrap the sync fs calls of THIS process's main thread (server.js, at its top — before the modules that destructure fs).
 *  `hr` = a MILLISECOND clock (B-9169: performance.now — never process.hrtime.bigint's nanoseconds); the hook is handed
 *  the call's start only from that default. The start is read before the hook's `before`: a call's ms holds the hook's
 *  own work too (sub-microsecond on the hot path). */
const perfNow = () => performance.now();
function install({ root = null, fsMod = fs, slowMs = SLOW_CALL_MS, now = () => Date.now(), hr = perfNow } = {}) {
  let isMain = true;
  try { isMain = require('worker_threads').isMainThread; } catch { }
  if (!isMain || (installed && fsMod === fs)) return false;
  if (fsMod === fs) { installed = true; rootDir = root; }
  let depth = 0;   // a call another wrapped call makes (readFileSync's own openSync) is the outer one's, never a second row
  const perfT0 = hr === perfNow;   // the start the hook is handed is on the performance clock only when this clock is it
  const datedFrom = Math.min(AT_MS, slowMs);   // the shortest call that is dated (a ring kept below AT_MS dates its own)
  const wrap = (orig, fn) => {
    const wrapped = function (...args) {
      if (depth !== 0) { depth++; try { return orig.apply(this, args); } finally { depth--; } }   // an inner call: no clock, no hook
      const t0 = hr();
      if (hook) hook.before(fn, args, this, perfT0 ? t0 : undefined);   // the mount guard: a refusal throws HERE, before any syscall
      let r, failed = false, err;
      depth++;
      try { r = orig.apply(this, args); } catch (e) { failed = true; err = e; } finally { depth--; }
      const ms = hr() - t0;
      const at = ms >= datedFrom ? Math.round(now() - ms) : NaN;
      if (ms >= slowMs) { try { note({ at, ms: Math.round(ms), fn, path: fn.startsWith('Dir.') ? String(this && this.path) : pathOf(args[0]), bytes: failed ? null : bytesOf(fn, args, r), caller: callerOf(new Error().stack, root) }); } catch { } }
      if (hook) { try { hook.after(fn, args, ms, at, r, failed, this); } catch { } }
      if (failed) throw err;
      return r;
    };
    // int343: the wrapper carries EVERY own property of what it wraps — fs.realpathSync.native is one (the automation
    // keys' folder judge and browser-facts call it); a bare wrapper dropped it and every such call threw
    for (const k of Reflect.ownKeys(orig)) if (!Object.prototype.hasOwnProperty.call(wrapped, k)) Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(orig, k));
    WRAPPED.add(wrapped);
    return wrapped;
  };
  for (const fn of SYNC_FNS) {
    const orig = fsMod[fn];
    if (typeof orig !== 'function' || WRAPPED.has(orig)) continue;
    fsMod[fn] = wrap(orig, fn);
  }
  // the two synchronous calls that are not fs.<x>Sync: realpathSync.native (its own syscall) and a Dir's readSync
  const rp = fsMod.realpathSync;
  if (rp && typeof rp.native === 'function' && !WRAPPED.has(rp.native)) Object.defineProperty(rp, 'native', { ...Object.getOwnPropertyDescriptor(rp, 'native'), value: wrap(rp.native, 'realpathSync.native') });
  const DirP = fsMod.Dir && fsMod.Dir.prototype;
  if (DirP && typeof DirP.readSync === 'function' && !WRAPPED.has(DirP.readSync)) DirP.readSync = wrap(DirP.readSync, 'Dir.readSync');
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

module.exports = { install, setHook, blame, blameWords, note, bytesOf, callerOf, pathOf, isWrapped, SLOW_CALL_MS, KEPT, SYNC_FNS, AT_MS };
