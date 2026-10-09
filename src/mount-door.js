// mount-door.js — THE BLOCKED-PATH DOOR (B-afc4, lane mount-readers-blocked). MountManager.pathBlocked(p) is the ONE
// answer to "is this path under a mount the liveness sweep blocked (slow / wedged / dead, src/mount-liveness.js)?";
// this file is how a server-side reader with no handle on the manager asks it. The manager registers itself where the
// server wires it (src/server/mounts-plugins-wiring.js); before that, in a worker and in a process with no mounts,
// nothing is blocked. Every reader of a path a user or agent can point at a mount asks blocked(p) BEFORE the read and
// answers in ms with the files route's sentence — never by a read that hangs inside a dead FUSE. The census of those
// readers is scripts/mount-reader-census.mjs (test-architecture §86). Imports nothing.
'use strict';

const SENTENCE = 'This storage is connecting or not responding — try again in a moment.';   // = src/routes/files.js's 503
let _mgr = null;

function register(mgr) { _mgr = mgr && typeof mgr.pathBlocked === 'function' ? mgr : null; }
/** The blocked mount root containing p, or false. A Map walk — no fs, nothing on the event loop. */
function blocked(p) {
  if (!_mgr || !p) return false;
  try { return _mgr.pathBlocked(String(p)) || false; } catch { return false; }
}
/** The refusal a reader throws / rejects with: a 503 by name. */
function refusal(mp) { return Object.assign(new Error(SENTENCE), { status: 503, code: 'storage-blocked', blockedRoot: mp || null }); }

module.exports = { register, blocked, refusal, SENTENCE };
