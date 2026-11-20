'use strict';
// src/server/channels-verdict.js — B-1ca5 part B (2026-11-20, the coordinator's round w5y5digbw): THE ONE VERDICT for «may this
// chain deliver this record now». PURE: no state, no clock, no I/O — a function of the record's marks only.
//
// Every billed site of src/server/channels-engine.js asks it at EVERY read, through the engine's one reader (`judgeHits`):
// wakeNow, flushScopeNow's first read and its read after the wait (where the scope digest also takes), and the next-turn
// stash. No site reads a mark by hand: scripts/test-channel-take-race.mjs's census is red, by the site's name, on one that does.
// Three finds of this family came from a cure that read the marks by hand at one more place; the table of this function is
// the fast leg that holds every combination (the three finds are its named rows).
//
// A MARK (the engine's hand-over map: one per channel conversation and NAME — the watcher's `pk`, or the receiver's `→cid`):
//   null                — never handed here, nothing in flight
//   { handed: true }    — handed: a start that took wrote it over its take, or a stash wrote it
//   { flying: ticket }  — taken by a start still in flight (inside its ladder await): neither handed nor given back yet
// THE ANSWER:
//   'spent'   — the WATCHER already handed it (to any member: one message, one billed turn for one watcher), or THIS
//               RECEIVER already has it (through any watcher or road): it rides nothing, and its row goes with what was handed
//   'wait'    — another start holds it in flight under either name: wait (bounded) for that start to end, then ask again
//   'kept'    — still in flight past the wait (its bound ran out, or a stop): left out of this block, its row KEPT for the
//               start that holds it (never cleared as spent, never billed twice)
//   'deliver' — none of the above: this chain may start it, and takes it in the same step
const VERDICTS = Object.freeze(['deliver', 'wait', 'kept', 'spent']);

/** THE MARK of one record under one name, from the hand-over map's raw value: undefined (never marked) → null; a time → handed;
 *  a take `{ ticket }` → in flight while its ticket is open, HANDED once it took (`ticket.handed`), nothing once given back. */
function markFrom(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object' && v.ticket) return v.ticket.done ? (v.ticket.handed ? { handed: true } : null) : { flying: v.ticket };
  return { handed: true };
}

/** `watcher` / `receiver`: the record's mark under each name (null with no receiver known yet); `own`: this chain's own ticket
 *  (its own take never makes it wait); `ranOut`: this read comes after the chain's wait ended (it will not wait again). */
function deliveryVerdict({ watcher = null, receiver = null, own = null, ranOut = false } = {}) {
  if ((watcher && watcher.handed) || (receiver && receiver.handed)) return 'spent';
  const another = (m) => !!(m && m.flying && m.flying !== own);
  if (another(watcher) || another(receiver)) return ranOut ? 'kept' : 'wait';
  return 'deliver';
}

module.exports = { deliveryVerdict, markFrom, VERDICTS };
