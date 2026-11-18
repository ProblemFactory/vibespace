'use strict';
/**
 * ONE ASK PER FILE PER SYNCHRONOUS RUN (B-403e, lane bl-accounts; 主开发 2026-11-18 from the production hub's witness: about
 * forty percent of five hours' main-loop holds were ONE function — the pool pass — asking the SAME files on the data mount
 * again and again inside one synchronous run).
 *
 * THE LAW: within one synchronous run (one pool pass, one stdout record, one session-list broadcast) each file under the
 * watched folders (the usage readings, the subscription folders, the pool links, the estimator's anchors) is asked of the
 * mount AT MOST ONCE, and every reader in that run shares the answer — an error included (a missing file and the mount's
 * own error alike are the run's answer). A run reads ONE CONSISTENT PICTURE of those files — said exactly, so nobody
 * «fixes» it later:
 *   - WHAT ONE RUN IS: the memo is made at the run's first ask and dropped by a microtask queued then. What runs before that
 *     microtask shares the answers. For a run begun in a macrotask — a timer, an I/O callback: where the pool pass, a record
 *     and a broadcast run — that is also a process.nextTick callback the run queued (ticks drain before microtasks) and a
 *     promise continuation that was ALREADY queued when the run began (it is ahead in the queue); the whole synchronous boot
 *     is one run. No input or output event can be handled in between. (A run begun inside a microtask ends at that
 *     checkpoint: its ticks run after it, as new asks.) An ask in a later timer or I/O callback, or after an await that yields
 *     to the event loop, is a new ask of the mount. test-pool-pass-reads pins it;
 *   - ANOTHER PROCESS'S WRITE in the middle of a run (the CLI refreshing its token, the statusline, the device agent, a
 *     worker thread) is seen by NONE of the run's later readers — before, some saw it and some did not; the next run sees it;
 *   - A READ AFTER A WRITE OF THIS PROCESS IN THE SAME RUN SEES THE WRITE, BY CONSTRUCTION: the memo is dropped WHOLE at
 *     any synchronous fs write this process makes under the watched folders, whoever makes it. Every path-writing Sync
 *     function of `fs` (WRITES — test-pool-pass-reads classes every Sync function of the RUNNING runtime as a read, a path
 *     write or a descriptor call, and an unclassed one is red) is wrapped ONCE PER PROCESS: the wrapper is found by a
 *     process-wide key (never by a mark on a function — the loop witness copies a wrapped function's own properties onto
 *     its own wrapper), and it drops the memo of EVERY copy of this module loaded in the process. A wrapper another module
 *     puts around it later (the loop witness re-installing) keeps it inside. No module of the tree holds an fs write
 *     function from before the wrap (a census derived by search in the suite). A write through a DESCRIPTOR is seen too: a
 *     write-flagged open under a watched folder marks its descriptor until its closeSync, and every write through it drops
 *     the memo (FD_WRITES). This process writes nothing under the watched folders through a synchronous child (searched at
 *     the unit); its ASYNCHRONOUS writes (fs.promises, a callback) land on the thread pool — concurrent with the run, like
 *     another process's;
 *   - A LOOK-AGAIN READ — a check whose purpose is «look again before I write» (is the member still signed in before a
 *     billing link is written to it; is a row still not signed in before it is removed or handed to a sign-in) — calls
 *     forget(dir) first: it asks the mount itself, and its answer becomes the run's (src/accounts.js names each one);
 *   - A WRITE NO WRAPPER SEES that this thread waits on (a worker's write behind a synchronous flush — the store writer's,
 *     when the readings move there) calls dropRun() at its hand-off: every copy's memo goes;
 *   - NOT SEEN, and no writer does any of them today: a write to a PARENT of a watched folder (data/ itself renamed or
 *     removed); a second spelling of a folder watched before it existed (its realpath is taken only when it exists); a
 *     file: URL path, matched undecoded.
 *
 * NOTHING HAPPENS AT LOAD: requiring this module changes nothing — the FIRST watch() wraps the write functions. The harness
 * descriptor reaches this module, and the signed device agent's bundle and its worker threads load the descriptor: they
 * watch nothing, so their fs is byte-for-byte the runtime's (a leg in the suite). Class SHARED (fs/path only).
 *
 * Only paths under a watched folder are memoized; any other path is asked as it always was. `watch(dir)` is called by the
 * owners of those folders (accounts: subs + pool-links; the pool engine: the usage readings; the estimator: its anchors).
 * Gate: scripts/test-pool-pass-reads.mjs (the counting leg over a stand-in pool, today's asks as its RED control).
 */
const fs = require('fs');
const path = require('path');

const roots = new Set();
let run = null;   // Map «kind\0path» → {val} | {err} — the current synchronous run's answers

function watch(dir) {
  if (!dir) return;
  arm();
  try { roots.add(path.resolve(String(dir))); } catch { }
  try { roots.add(fs.realpathSync(String(dir))); } catch { }   // a data folder reached through a symlink is the same folder
}
/** `p` is under a folder this copy watches (the same test every ask makes — the suite derives the routed folders with it) */
function watched(p) {
  if (typeof p !== 'string' || !p || !roots.size) return false;
  const r = path.resolve(p);
  for (const root of roots) if (r === root || r.startsWith(root + path.sep)) return true;
  return false;
}
function scope() {
  if (!run) { run = new Map(); queueMicrotask(() => { run = null; }); }
  return run;
}
function ask(kind, p, fn) {
  if (!watched(p)) return fn();
  const m = scope(), k = kind + '\0' + path.resolve(p);
  const hit = m.get(k);
  if (hit) { if (hit.err) throw hit.err; return hit.val; }
  let val;
  try { val = fn(); } catch (err) { m.set(k, { err }); throw err; }
  m.set(k, { val });
  return val;
}

/** a file's text (utf-8) */
const readText = (p) => ask('text', p, () => fs.readFileSync(p, 'utf-8'));
/** a link's target */
const readlink = (p) => ask('link', p, () => fs.readlinkSync(p));
/** an entry exists at `p` — answered by the SAME ask as its readlink (an entry that is not a link answers EINVAL: it exists —
 *  readlink(2) on Linux and macOS, the only platforms pools run on: poolSupported); any other failure is «no», as the lstat
 *  it replaces answered */
function entryExists(p) {
  try { readlink(p); return true; } catch (e) { return !!(e && e.code === 'EINVAL'); }
}
/** a file's stat (the shared Stats object: its readers read fields, never change it) — for a reader that wants only the
 *  signature (the estimator's anchor files: a read follows only when the signature moved) */
const stat = (p) => ask('stat', p, () => fs.statSync(p));
/** a folder's names (a copy: a caller may sort it) */
const readdir = (p) => ask('dir', p, () => fs.readdirSync(p)).slice();
/** a file's text AND its stat in ONE ask (one open; the stat and the read through its descriptor) — the credential file's
 *  readers want both (its facts, its mtime:size signature, its write time) */
function facts(p) {
  const f = ask('facts', p, () => {
    let fd;
    // a failure that is not «no such file» carries the file's stat when there is one, so a reader that told «unreadable,
    // written at T» from «missing» (src/login-state.js) — or kept a signature while the stat answered (the engine's
    // memberLoginState) — still can: the same answers as its own stat-then-read
    try { fd = fs.openSync(p, 'r'); } catch (e) { if (e && e.code !== 'ENOENT') { try { const st = fs.statSync(p); e.mtimeMs = st.mtimeMs; e.size = st.size; } catch { } } throw e; }
    try {
      let st;
      try { st = fs.fstatSync(fd); } catch (e) { try { const s2 = fs.statSync(p); e.mtimeMs = s2.mtimeMs; e.size = s2.size; } catch { } throw e; }
      try { return { text: fs.readFileSync(fd, 'utf-8'), mtimeMs: st.mtimeMs, size: st.size }; } catch (e) { e.mtimeMs = st.mtimeMs; e.size = st.size; throw e; }
    } finally { try { fs.closeSync(fd); } catch { } }
  });
  return { ...f };
}
/** A LOOK-AGAIN READ: forget what this run knows of `p` and of everything under it — the next ask of it asks the mount, and
 *  that answer is the run's from then on */
function forget(p) {
  if (!run || typeof p !== 'string' || !p) return;
  const r = path.resolve(p);
  for (const k of [...run.keys()]) { const kp = k.slice(k.indexOf('\0') + 1); if (kp === r || kp.startsWith(r + path.sep)) run.delete(k); }
}

// ── BY CONSTRUCTION: any synchronous write under a watched folder drops the run's memo whole ──
// THE PATH WRITES of fs's Sync functions, with their path positions (a write through a descriptor names no path: its
// write-flagged open marks the descriptor — FD_WRITES below). The suite's ratchet classes every Sync function of the
// running runtime against these tables.
const WRITES = Object.freeze({
  writeFileSync: [0], appendFileSync: [0], renameSync: [0, 1], copyFileSync: [1], cpSync: [1], symlinkSync: [1], linkSync: [1],
  unlinkSync: [0], rmSync: [0], rmdirSync: [0], mkdirSync: [0], mkdtempSync: [0], mkdtempDisposableSync: [0], truncateSync: [0],
  utimesSync: [0], lutimesSync: [0], chmodSync: [0], chownSync: [0], lchownSync: [0], openSync: [0],
});
const C = fs.constants || {};
const WRITE_BITS = (C.O_WRONLY || 0) | (C.O_RDWR || 0) | (C.O_CREAT || 0) | (C.O_TRUNC || 0) | (C.O_APPEND || 0);
const openWrites = (flags) => (flags == null ? false : typeof flags === 'number' ? (flags & WRITE_BITS) !== 0 : /[wa+]/.test(String(flags)));
const pathOf = (p) => (typeof p === 'string' ? p : Buffer.isBuffer(p) ? p.toString() : p instanceof URL ? p.pathname : null);
// THE DESCRIPTOR WRITES: a write-flagged open under a watched folder keeps its descriptor (process-wide) until its closeSync;
// a write through it — these, and a writeFileSync / appendFileSync handed it — drops the memo as a path write does
const FD_WRITES = Object.freeze(['writeSync', 'writevSync', 'ftruncateSync', 'futimesSync', 'fchmodSync', 'fchownSync']);
/** THIS copy, as the process-wide wrappers see it */
const self = { touches: (p) => watched(p), clear: () => { if (run) run.clear(); } };
// ONE wrapper per write function per PROCESS, found by a process-wide key; a write any copy watches drops EVERY copy's memo.
// Installed by the first watch() of any copy — never by a require.
const KEY = Symbol.for('vibespace.run-reads.writes');
let armed = false;
function arm() {
  if (armed) return;
  armed = true;
  const G = globalThis[KEY] || (globalThis[KEY] = { copies: new Set(), installed: new Map(), fds: new Set() });
  G.copies.add(self);
  const clearAll = () => { for (const c of G.copies) { try { c.clear(); } catch { } } };
  const touched = (p) => { for (const c of G.copies) { try { if (c.touches(p)) return true; } catch { } } return false; };
  const install = (name, make) => {
    if (G.installed.has(name)) return 0;
    const orig = fs[name];
    if (typeof orig !== 'function') return 0;
    const w = make(orig);
    for (const k of Reflect.ownKeys(orig)) if (!Object.prototype.hasOwnProperty.call(w, k)) { try { Object.defineProperty(w, k, Object.getOwnPropertyDescriptor(orig, k)); } catch { } }
    fs[name] = w;
    G.installed.set(name, w);
    return 1;
  };
  let n = 0;
  for (const name of Object.keys(WRITES)) {
    n += install(name, (orig) => function (...a) {
      let hit = false;
      if (name !== 'openSync' || openWrites(a[1])) {
        if ((name === 'writeFileSync' || name === 'appendFileSync') && typeof a[0] === 'number') hit = G.fds.has(a[0]);
        else for (const i of WRITES[name]) { const p = pathOf(a[i]); if (p && touched(p)) { hit = true; break; } }
      }
      if (hit) clearAll();
      const out = orig.apply(this, a);
      if (hit && name === 'openSync' && typeof out === 'number') G.fds.add(out);
      return out;
    });
  }
  for (const name of FD_WRITES) n += install(name, (orig) => function (...a) { if (G.fds.has(a[0])) clearAll(); return orig.apply(this, a); });
  n += install('closeSync', (orig) => function (...a) { G.fds.delete(a[0]); return orig.apply(this, a); });
  if (n) { try { require('module').syncBuiltinESMExports(); } catch { } }   // an ESM `import { writeFileSync } from 'fs'` sees the wrapper too
}
/** A WRITE NO WRAPPER SEES, handed off by this thread (a worker's write behind a synchronous flush): every copy's memo goes */
function dropRun() {
  const G = globalThis[KEY];
  if (G) for (const c of G.copies) { try { c.clear(); } catch { } }
  self.clear();
}

module.exports = { watch, watched, readText, readlink, entryExists, readdir, facts, stat, forget, dropRun, WRITES, FD_WRITES };
