'use strict';
// channel-store-off-loop (commit 1): A STALL PLACED IN THE MAIN THREAD'S SYNCHRONOUS fs CALLS under one directory — the
// field's mount charges ~4 s to a create; scripts/fixtures/store-slow-preload.cjs only TIMES calls. `install({ under, ms,
// exempt })` wraps, on THIS thread only (a worker thread loads its own fs: the store writer's thread is never stalled),
//   WRITES (stalled `ms` each — Atomics.wait, never a busy loop): openSync for write / append, writeSync, writevSync,
//     closeSync (of a write descriptor), writeFileSync, appendFileSync, renameSync, copyFileSync, mkdirSync, rmSync,
//     unlinkSync, truncateSync, ftruncateSync, fsyncSync, fdatasyncSync, chmodSync;
//   READS (counted, never stalled — this unit moves writes): openSync for read, readSync, closeSync of a read descriptor,
//     readFileSync, statSync, lstatSync, fstatSync, existsSync, readdirSync, accessSync.
// A descriptor call is judged by the path its open named (one opened before the install: /proc/self/fd). `exempt(path, fn)` → a row's name: that call is COUNTED under
// the row and not stalled (a door this unit lists, not moves — named by the suite). → { calls, restore() }; each call
// {fn, path, kind: 'write' | 'read', stalled, row}.
const fs = require('fs');
const path = require('path');
const WRITES = ['openSync', 'writeSync', 'writevSync', 'closeSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'truncateSync', 'ftruncateSync', 'fsyncSync', 'fdatasyncSync', 'chmodSync'];
const READS = ['readFileSync', 'readSync', 'statSync', 'lstatSync', 'fstatSync', 'existsSync', 'readdirSync', 'accessSync'];
const FD_CALLS = new Set(['writeSync', 'writevSync', 'closeSync', 'ftruncateSync', 'fsyncSync', 'fdatasyncSync', 'readSync', 'fstatSync']);
function install({ under, ms, exempt = () => null }) {
  const root = path.resolve(under) + path.sep;
  const nap = new Int32Array(new SharedArrayBuffer(4));
  const orig = {}, calls = [], fds = new Map();   // fd → {path, write}
  const pathOf = (p) => { try { return typeof p === 'string' ? path.resolve(p) : Buffer.isBuffer(p) ? path.resolve(p.toString()) : p instanceof URL ? path.resolve(p.pathname) : null; } catch { return null; } };
  const inside = (p) => !!p && (p + path.sep).startsWith(root);
  const writeFlags = (fl) => fl != null && !(typeof fl === 'string' && !/[wa+]/.test(fl)) && !(typeof fl === 'number' && (fl & 3) === 0 && !(fl & fs.constants.O_CREAT));
  for (const fn of [...WRITES, ...READS]) {
    orig[fn] = fs[fn];
    fs[fn] = function (...a) {
      let p = null, kind = WRITES.includes(fn) ? 'write' : 'read';
      if (FD_CALLS.has(fn)) {
        // a descriptor opened before the install (a store's kept journal fd): its path from /proc (Linux), judged a write's
        let d = fds.get(a[0]);
        if (!d && Number.isInteger(a[0])) { try { const lp = fs.readlinkSync(`/proc/self/fd/${a[0]}`); if (inside(lp)) { d = { path: lp, write: true }; fds.set(a[0], d); } } catch { } }
        if (d) { p = d.path; if (fn === 'closeSync' || fn === 'fstatSync') kind = d.write ? 'write' : 'read'; }
      }
      else if (fn === 'renameSync' || fn === 'copyFileSync') { const x = pathOf(a[0]), y = pathOf(a[1]); p = inside(y) ? y : x; }
      else p = pathOf(a[0]);
      if (fn === 'openSync') kind = writeFlags(a[1]) ? 'write' : 'read';
      if (fn === 'fstatSync') kind = 'read';
      let rec = null;
      if (inside(p)) {
        const row = exempt(p, fn) || null;
        rec = { fn, path: p.slice(root.length), kind, stalled: kind === 'write' && !row, row };
        calls.push(rec);
        if (rec.stalled) Atomics.wait(nap, 0, 0, ms);   // THE PLACED STALL: the main thread is held `ms`, as the mount holds it
      }
      const r = orig[fn].apply(fs, a);
      if (fn === 'openSync' && inside(p)) fds.set(r, { path: p, write: kind === 'write' });
      if (fn === 'closeSync') fds.delete(a[0]);
      return r;
    };
  }
  return { calls, restore() { for (const fn of Object.keys(orig)) fs[fn] = orig[fn]; } };
}
module.exports = { install, WRITES, READS };
