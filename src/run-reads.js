'use strict';
/**
 * ONE ASK PER FILE PER SYNCHRONOUS RUN (B-403e, lane bl-accounts; 主开发 2026-11-18 from the production hub's witness: about
 * forty percent of five hours' main-loop holds were ONE function — the pool pass — asking the SAME files on the data mount
 * again and again inside one synchronous run).
 *
 * THE LAW: within one synchronous run (one pool pass, one stdout record, one session-list broadcast) each file under the
 * watched folders (the usage readings, the subscription folders, the pool links, the estimator's anchors) is asked of the
 * mount AT MOST ONCE, and every reader in that run shares the answer — an error included (a missing file and the mount's
 * own error alike are the run's answer). Nothing is a moment staler than today:
 *   - the memo lives exactly as long as the synchronous run: it is dropped by a microtask queued at the run's FIRST ask.
 *     What runs before that microtask shares the answers. For a run begun in a macrotask — a timer, an I/O callback: where
 *     the pool pass, a record and a broadcast run — that is a process.nextTick callback the run queued (ticks drain before
 *     microtasks) and a promise continuation that was ALREADY queued when the run began (it is ahead in the queue); no
 *     input or output event can be handled in between, so nothing outside this process can have been heard. (A run begun
 *     inside a microtask ends at that checkpoint: its ticks run after it, as new asks.) An ask in a later timer or I/O
 *     callback, or after an await that yields to the event loop, is a new ask of the mount. test-pool-pass-reads pins it;
 *   - A READ AFTER A WRITE OF THIS PROCESS IN THE SAME RUN SEES THE WRITE, BY CONSTRUCTION: the memo is dropped WHOLE at
 *     any synchronous fs write this process makes under the watched folders, whoever makes it. Every path-writing Sync
 *     function of `fs` (WRITES — test-pool-pass-reads classes every Sync function of the RUNNING runtime as a read, a path
 *     write or a descriptor call, and an unclassed one is red) is wrapped ONCE PER PROCESS: the wrapper is found by a
 *     process-wide key (never by a mark on a function — the loop witness copies a wrapped function's own properties onto
 *     its own wrapper), and it drops the memo of EVERY copy of this module loaded in the process. A wrapper another module
 *     puts around it later (the loop witness re-installing) keeps it inside. No module of the tree holds an fs write
 *     function from before the wrap (a census derived by search in the suite). A write by another process or thread (the
 *     statusline, the device agent, the store writer's worker) is concurrent with the run exactly as it is today; this
 *     process writes nothing under the watched folders through a synchronous child or a descriptor kept open across runs
 *     (searched at the unit; a descriptor write is seen at its write-flagged open in the run).
 *
 * Only paths under a watched folder are memoized; any other path is asked as it always was. `watch(dir)` is called by the
 * owners of those folders (accounts: subs + pool-links; the pool engine: the usage readings).
 * Gate: scripts/test-pool-pass-reads.mjs (the counting leg over a stand-in pool, today's asks as its RED control).
 */
const fs = require('fs');
const path = require('path');

const roots = new Set();
let run = null;   // Map «kind\0path» → {val} | {err} — the current synchronous run's answers

function watch(dir) {
  if (!dir) return;
  try { roots.add(path.resolve(String(dir))); } catch { }
  try { roots.add(fs.realpathSync(String(dir))); } catch { }   // a data folder reached through a symlink is the same folder
}
function under(p) {
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
  if (!under(p)) return fn();
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
/** an entry exists at `p` — answered by the SAME ask as its readlink (an entry that is not a link answers EINVAL: it exists);
 *  any other failure is «no», as the lstat it replaces answered */
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
    // written at T» from «missing» (src/login-state.js) still can — the same answers as its own stat-then-read
    try { fd = fs.openSync(p, 'r'); } catch (e) { if (e && e.code !== 'ENOENT') { try { const st = fs.statSync(p); e.mtimeMs = st.mtimeMs; e.size = st.size; } catch { } } throw e; }
    try {
      const st = fs.fstatSync(fd);
      try { return { text: fs.readFileSync(fd, 'utf-8'), mtimeMs: st.mtimeMs, size: st.size }; } catch (e) { e.mtimeMs = st.mtimeMs; e.size = st.size; throw e; }
    } finally { try { fs.closeSync(fd); } catch { } }
  });
  return { ...f };
}

// ── BY CONSTRUCTION: any synchronous write under a watched folder drops the run's memo whole ──
// THE PATH WRITES of fs's Sync functions, with their path positions (an fd-based write names no path — its open, with write
// flags, is where it is seen). The suite's ratchet classes every Sync function of the running runtime against this table.
const WRITES = Object.freeze({
  writeFileSync: [0], appendFileSync: [0], renameSync: [0, 1], copyFileSync: [1], cpSync: [1], symlinkSync: [1], linkSync: [1],
  unlinkSync: [0], rmSync: [0], rmdirSync: [0], mkdirSync: [0], mkdtempSync: [0], mkdtempDisposableSync: [0], truncateSync: [0],
  utimesSync: [0], lutimesSync: [0], chmodSync: [0], chownSync: [0], lchownSync: [0], openSync: [0],
});
const C = fs.constants || {};
const WRITE_BITS = (C.O_WRONLY || 0) | (C.O_RDWR || 0) | (C.O_CREAT || 0) | (C.O_TRUNC || 0) | (C.O_APPEND || 0);
const openWrites = (flags) => (flags == null ? false : typeof flags === 'number' ? (flags & WRITE_BITS) !== 0 : /[wa+]/.test(String(flags)));
const pathOf = (p) => (typeof p === 'string' ? p : Buffer.isBuffer(p) ? p.toString() : p instanceof URL ? p.pathname : null);
/** THIS copy's drop: a write under one of ITS watched folders in its run */
function dropIfWritten(name, args) {
  if (!run) return;
  if (name === 'openSync' && !openWrites(args[1])) return;
  for (const i of WRITES[name] || []) { const p = pathOf(args[i]); if (p && under(p)) { run.clear(); return; } }
}
// ONE wrapper per write function per PROCESS, found by a process-wide key; it calls the drop of every copy of this module
const KEY = Symbol.for('vibespace.run-reads.writes');
const G = globalThis[KEY] || (globalThis[KEY] = { drops: new Set(), installed: new Map() });
G.drops.add(dropIfWritten);
for (const name of Object.keys(WRITES)) {
  if (G.installed.has(name)) continue;
  const orig = fs[name];
  if (typeof orig !== 'function') continue;
  const wrapped = function (...a) { for (const d of G.drops) { try { d(name, a); } catch { } } return orig.apply(this, a); };
  for (const k of Reflect.ownKeys(orig)) if (!Object.prototype.hasOwnProperty.call(wrapped, k)) { try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(orig, k)); } catch { } }
  fs[name] = wrapped;
  G.installed.set(name, wrapped);
}
try { require('module').syncBuiltinESMExports(); } catch { }   // an ESM `import { writeFileSync } from 'fs'` sees the wrapper too

module.exports = { watch, readText, readlink, entryExists, readdir, facts, stat, WRITES, _inRun: () => !!run, _roots: () => [...roots] };
