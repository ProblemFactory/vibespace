'use strict';
// THE EXIT HOOK — one door for a process whose worker thread cannot be joined (lane usage-fold-worker-exit-hook,
// 2026-10-15). usage-index (usage-index-shadow) and search-index (global-search) carried their own copy of the
// re-raise; they say it here now, and the usage ledger's fold workers (src/usage-history.js) are judged here at the join.
// Facts it is built on (measured 2026-10-15 on Node 22.22.1 and 24.12.0, the lane's probe/exit-mech.mjs):
//  · process.exit() emits 'exit', then process.reallyExit() JOINS every worker thread. A thread asleep in a syscall
//    (a read on storage that does not answer; a fifo's open in the suites, wchan wait_for_partner) is never joined —
//    terminate() cannot end it — so the main thread waits in a futex until somebody SIGKILLs the process.
//  · SIGTERM's default action ends the process without that join (signal 15, ~0.1 s).
//  · `new Worker()` starts its thread inside the constructor: a /proc/self/task diff around it names that thread. A
//    terminated worker that was merely busy leaves /proc/self/task within milliseconds while the main thread stays
//    blocked (no loop turn needed); one asleep in the kernel is still listed after any bound.
//  · a terminated worker asleep in a read keeps the event loop alive (no natural exit): process.exit() is how such a
//    process ends, and the join after its 'exit' listeners is where it hangs.
const fs = require('fs');
const { isMainThread } = require('worker_threads');

/** What a worker gets to leave at exit before the process ends without it — the class of the index owners'
 *  closeBoundMs (2 s: usage-index, search-index). */
const EXIT_BOUND_MS = 2000;
const NAP = new Int32Array(new SharedArrayBuffer(4)); // Atomics.wait's cell: a blocking sleep (no loop turn comes at exit)

/** THE re-raise: say why, then end the process WITHOUT joining its threads — SIGTERM with its default action (every
 *  SIGTERM listener removed first: the server's own shutdown must not run again), SIGKILL only if SIGTERM was ignored. */
function exitWithout(line, log = console) {
  try { log.error?.(line); } catch { }
  process.removeAllListeners('SIGTERM');
  process.kill(process.pid, 'SIGTERM');
  process.kill(process.pid, 'SIGKILL'); // only if SIGTERM was ignored
}

// The judges asked at the join: name → () => null (every thread it owns can be joined) | the line naming what cannot.
const JUDGES = new Map();
let realExit = null;
/** Ask `judge` when the process exits — AFTER every 'exit' listener (the stores' flushes run first, in their own order),
 *  right before process.exit() joins the worker threads; a judge that answers a line ends the process without them
 *  (exitWithout). Idempotent per name. → the unregister. The main thread only (a worker's process is its own). */
function atJoin(name, judge) {
  JUDGES.set(name, judge);
  if (!realExit && isMainThread) {
    realExit = process.reallyExit;
    // Node's process.exit() calls process.reallyExit() after 'exit' and says user land wraps it (signal-exit does the same)
    process.reallyExit = function reallyExit(code) {
      for (const judge of JUDGES.values()) { let line = null; try { line = judge(); } catch { } if (line) exitWithout(line); }
      return realExit.call(process, code);
    };
  }
  return () => { if (JUDGES.get(name) === judge) JUDGES.delete(name); };
}

/** This process's threads now (Linux /proc/self/task) — null where /proc does not list them. */
function threadsNow() {
  try { return new Set(fs.readdirSync('/proc/self/task')); } catch { return null; }
}
/** The ONE thread added since `before` (read right before a `new Worker()`) — null when /proc named none or more than one
 *  (another thread started at the same instant: unknown, never a guess). */
function threadAdded(before, after = threadsNow()) {
  if (!before || !after) return null;
  const fresh = [...after].filter((t) => !before.has(t));
  return fresh.length === 1 ? fresh[0] : null;
}
/** Wait at most `boundMs` — blocking: this runs at the join, where no loop turn comes — until none of `tids` is listed
 *  under /proc/self/task. → the tids still listed. */
function threadsLeft(tids, boundMs = EXIT_BOUND_MS) {
  const listed = () => tids.filter((t) => fs.existsSync(`/proc/self/task/${t}`));
  const end = performance.now() + boundMs;
  let left = listed();
  while (left.length && performance.now() < end) { Atomics.wait(NAP, 0, 0, Math.max(1, Math.min(20, end - performance.now()))); left = listed(); }
  return left;
}
/** PURE — the live workers that cannot be joined: one whose thread is still listed after the bound (`left`) or — where
 *  /proc named no thread — one its owner already declared stuck (its own terminate deadline passed). A worker /proc
 *  never named and nobody declared stuck is presumed joinable (what process.exit() assumed before this hook). */
function unjoinable(live, left) {
  const still = new Set(left);
  return live.filter((x) => (x.tid ? still.has(x.tid) : !!x.stuck));
}

module.exports = { EXIT_BOUND_MS, exitWithout, atJoin, threadsNow, threadAdded, threadsLeft, unjoinable };
