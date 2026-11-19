// mount-door.js — THE BLOCKED-PATH DOOR (B-afc4, lane mount-readers-blocked). MountManager.pathBlocked(p) is the ONE
// answer to "is this path under a mount the liveness sweep blocked (slow / wedged / dead, src/mount-liveness.js)?";
// this file is how a server-side reader with no handle on the manager asks it. The manager registers itself where the
// server wires it (src/server/mounts-plugins-wiring.js); before that, in a worker and in a process with no mounts,
// nothing is blocked. Every reader of a path a user or agent can point at a mount asks blocked(p) BEFORE the read and
// answers in ms with the files route's sentence — never by a read that hangs inside a dead FUSE. The census of those
// readers is scripts/mount-reader-census.mjs (test-architecture §86). Imports nothing.
'use strict';

const SENTENCE = 'This storage is connecting or not responding — try again in a moment.';   // the one spelling: every door asks sentenceFor
// B-5ce7 cure (主开发's must): a PARKED mount is no «try again in a moment» — nothing reconnects it by itself; its refusal
// names it and its doors (the row's Connect, For you's Reconnect). The one spelling; src/routes/files.js reads it too.
const PARKED = '“{name}” is kept disconnected (its listing kept hanging) — press Connect on its row, or Reconnect in For you.';
const parkedSentence = (name) => PARKED.replace('{name}', () => String(name || 'This storage'));   // a function replacer: a «$&» in a name stays itself
let _mgr = null;

function register(mgr) { _mgr = mgr && typeof mgr.pathBlocked === 'function' ? mgr : null; }
/** The blocked mount root containing p, or false. A Map walk — no fs, nothing on the event loop. */
function blocked(p) {
  if (!_mgr || !p) return false;
  try { return _mgr.pathBlocked(String(p)) || false; } catch { return false; }
}
/** The parked mount whose folder holds p ({id, name, mp}) — the manager's answer, or null. No fs. */
function parked(p) {
  if (!_mgr || !p || typeof _mgr.parkedAt !== 'function') return null;
  try { return _mgr.parkedAt(String(p)) || null; } catch { return null; }
}
/** The refusal a reader throws / rejects with: a 503 by name — a PARKED mount's own words when it is one. */
function refusal(mp) {
  const pk = parked(mp);
  return Object.assign(new Error(pk ? parkedSentence(pk.name) : SENTENCE), { status: 503, code: 'storage-blocked', blockedRoot: mp || null, ...(pk ? { parked: pk.id } : {}) });
}

/** THE sentence a reader answers for a blocked p (round 2 of the cure: every door asks this, none spells SENTENCE itself) —
 *  a parked mount's own words, else the blocked path's. */
function sentenceFor(p) { const pk = parked(blocked(p) || p); return pk ? parkedSentence(pk.name) : SENTENCE; }

module.exports = { register, blocked, parked, refusal, sentenceFor, SENTENCE, PARKED, parkedSentence };
