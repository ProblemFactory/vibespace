'use strict';
// scripts/test-store-slow-storage.mjs's witness inside the scratch hub (a preload — `node -r` — never product code): on
// the MAIN thread only, every synchronous fs call a store write makes is timed and attributed to its SITE (the first frame
// of the hub's own code past the product's own fs wrappers); the loop's beat gaps ≥ 100 ms are kept with their wall time;
// the boot's first loop turn (performance.nodeTiming.loopStart) is said. The file STORE_SLOW_OUT/slow-<tag>-<pid>.json is
// rewritten every second (its own, unwrapped write — no rename, never delayed by the stand-in).
const fs = require('fs'), path = require('path');
const OUT = process.env.STORE_SLOW_OUT, TAG = process.env.STORE_SLOW_TAG, TREE = process.env.STORE_SLOW_TREE || '';
if (OUT && TAG && require('worker_threads').isMainThread) {
  const { performance } = require('perf_hooks');
  const loadedAt = Date.now();
  const orig = {}; for (const k of ['renameSync', 'writeFileSync', 'writeSync', 'openSync', 'fsyncSync', 'fdatasyncSync', 'closeSync']) orig[k] = fs[k];
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const sites = new Map(), calls = [], fdPath = new Map(), gaps = [];
  let lastBeat = now(), loopStartAt = null;
  const SKIP = /node:|store-slow-preload|loop-blame\.js|sync-fs-witness\.js|timed-sync\.js|store-timing\.js|safe-fs\.js|fs-canary\.js/;
  const siteOf = () => { const lim = Error.stackTraceLimit; Error.stackTraceLimit = 40; const st = new Error().stack.split('\n').slice(3); Error.stackTraceLimit = lim;
    for (const l of st) { if (SKIP.test(l)) continue; const m = /\((\/.*):(\d+):\d+\)$/.exec(l) || /at (\/.*):(\d+):\d+$/.exec(l); if (m) return m[1].replace(TREE + '/', '') + ':' + m[2]; } return '?'; };
  const rel = (p) => String(p).replace(TREE + '/', '');
  const note = (fn, t0, ms, file) => { const s = siteOf(); const k = `${s} ${fn}`; let r = sites.get(k); if (!r) { r = { site: s, fn, n: 0, total: 0, max: 0, files: {} }; sites.set(k, r); }
    r.n++; r.total += ms; r.max = Math.max(r.max, ms); if (file) r.files[file] = (r.files[file] || 0) + 1;
    if (ms >= 50) { calls.push({ at: Date.now() - ms, ms: +ms.toFixed(1), site: s, fn, file }); if (calls.length > 3000) calls.shift(); } };
  const timed = (fn, file, f) => { const t0 = now(); try { return f(); } finally { if (file !== null) note(fn, t0, now() - t0, file); } };
  fs.openSync = function (p, flags, ...a) { return timed('openSync', typeof flags === 'string' && /[wa]/.test(flags) ? rel(p) : null, () => { const fd = orig.openSync.call(fs, p, flags, ...a); if (typeof flags === 'string' && /[wa]/.test(flags)) fdPath.set(fd, rel(p)); return fd; }); };
  fs.writeSync = function (fd, ...a) { return timed('writeSync', fdPath.has(fd) ? fdPath.get(fd) : null, () => orig.writeSync.call(fs, fd, ...a)); };
  fs.closeSync = function (fd) { const p = fdPath.get(fd); fdPath.delete(fd); return timed('closeSync', p == null ? null : p, () => orig.closeSync.call(fs, fd)); };
  fs.writeFileSync = function (p, ...a) { return timed('writeFileSync', typeof p === 'string' ? rel(p) : null, () => orig.writeFileSync.call(fs, p, ...a)); };
  fs.fsyncSync = function (fd) { return timed('fsyncSync', fdPath.get(fd) || 'fd', () => orig.fsyncSync.call(fs, fd)); };
  fs.fdatasyncSync = function (fd) { return timed('fdatasyncSync', fdPath.get(fd) || 'fd', () => orig.fdatasyncSync.call(fs, fd)); };
  fs.renameSync = function (a, b) { return timed('renameSync', rel(b), () => orig.renameSync.call(fs, a, b)); };
  setInterval(() => { const t = now(); const g = t - lastBeat; lastBeat = t; if (loopStartAt === null && performance.nodeTiming.loopStart > 0) loopStartAt = performance.timeOrigin + performance.nodeTiming.loopStart; if (g >= 100) { gaps.push({ end: Date.now(), ms: Math.round(g) }); if (gaps.length > 3000) gaps.shift(); } }, 10);
  // round 2 (law C): the store writer's OWN per-file numbers (writes, bytes) — the hub's module when it has loaded one
  const writerStats = () => { try { const k = Object.keys(require.cache).find((x) => x.endsWith('/src/store-writer.js')); const m = k && require.cache[k].exports; if (!m || typeof m.storeWriter !== 'function') return null;
    return m.storeWriter().stats().map((r) => ({ name: r.name, file: rel(r.file), writes: r.writes, bytesWritten: r.bytesWritten, lastMs: r.lastMs, maxMs: r.maxMs, failures: r.failures,
      maxAgeMs: r.maxAgeMs, oldestAgeMs: r.oldestAgeMs, gapMs: r.gapMs, urgent: !!r.urgent, dirty: !!r.dirty })); } catch { return null; } };   // round 3: the MEASURED ages
  const dump = () => { try { orig.writeFileSync.call(fs, path.join(OUT, `slow-${TAG}-${process.pid}.json`), JSON.stringify({ at: Date.now(), timeOrigin: performance.timeOrigin, loadedAt, loopStartAt, writer: writerStats(), gaps, calls, sites: [...sites.values()].map((r) => ({ ...r, total: +r.total.toFixed(1), max: +r.max.toFixed(1) })) })); } catch { } };
  setInterval(dump, 1000).unref(); process.on('exit', dump);
  // round 3 (law 2): THE CRASH PATH on demand — the suite writes STORE_SLOW_CRASH_FILE; the hub throws out of a callback and
  // the server's own uncaughtException handler runs (its order, its bound)
  const CRASH = process.env.STORE_SLOW_CRASH_FILE;
  if (CRASH) setInterval(() => { try { if (fs.existsSync(CRASH)) { fs.unlinkSync(CRASH); calls.push({ at: Date.now(), ms: 0, site: 'crash-trigger', fn: 'throw', file: null }); dump(); setImmediate(() => { throw new Error('store-slow-storage: the crash path, on purpose'); }); } } catch { } }, 50).unref();
}
