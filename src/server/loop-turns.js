'use strict';
// ONE JOB A LOOP TURN (B-cd4b, the round's follow — the listen turn at 80 survivors sat AT the 250 ms boot law on the first
// test machine: one turn held the listen step's work, the restore's registration pass and its first attach batch).
// `turn(fn)` runs fn in a loop turn of its own, after every job asked before it: each job waits for a timers phase
// (setTimeout 0, then setImmediate), so the loop's timers and its polled I/O run between two jobs, and one job runs a turn.
// WHY NOT a plain setImmediate: two of them asked in one turn run back to back in the same check phase — one hold, the loop
// never turned between them (the restore's next batch and the listen step's rest would share a turn again). Users: the
// boot's listen step (src/server/tls.js `turn`, from server.js's listen callback) and the restore's attach batches
// (src/server/boot-restore.js drainSurvivorAttaches) — ONE queue, so a batch and a step of the listen never share a turn.
// A job that throws: the jobs after it still run (their turn is armed first); the throw goes on to the process as it did.
// The hub's `turn` (tls.js) is the BOOT's alone: a later caller would hold the port again; any other job asks this queue directly.
const queue = [];
let armed = false;

function hop() { armed = true; setTimeout(() => setImmediate(next), 0); }
function next() {
  const fn = queue.shift();
  try { if (fn) fn(); } finally { if (queue.length) hop(); else armed = false; }
}

/** Run `fn` in a loop turn of its own, after every job asked before it — or, `first`, AHEAD of them (B-cd4b unit 3: the restore's
 *  registration batches, each asked by the one before, all run before the listen step's rest that was asked after the first). Jobs
 *  asked `first` run LAST-asked first (each goes to the head of the line). */
function turn(fn, { first = false } = {}) {
  if (typeof fn !== 'function') throw new TypeError('loop-turns: turn(fn) takes a function');
  if (first) queue.unshift(fn); else queue.push(fn);
  if (!armed) hop();
}

module.exports = { turn };
