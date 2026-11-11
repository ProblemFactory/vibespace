'use strict';
/**
 * WHERE A COMMAND LIVES, KEPT (lane hub-sync-holds, rank 13 — the owner's hub held its loop 4.7–4.9 s in a plugin's status:
 * every snapshot ran `which` / `pgrep` / `sudo -n true` / `tailscale status --json` synchronously). A plugin's sync code reads
 * the KEPT answer (`whichKept`): it never runs a child — a missing or stale answer starts ONE async `which` with a timeout and
 * the caller gets the last answer (null before the first). An async road (`whichNow`) waits for a fresh answer, bounded.
 */
const { execFile } = require('child_process');

const TIMEOUT_MS = 5000;
const MAX_AGE_MS = 60000;
const kept = new Map(); // name → { path, at, pending }

function refresh(name) {
  const k = kept.get(name) || { path: null, at: 0, pending: null };
  kept.set(name, k);
  if (k.pending) return k.pending;
  k.pending = new Promise((resolve) => {
    execFile('which', [name], { encoding: 'utf8', timeout: TIMEOUT_MS }, (err, out) => {
      k.path = err ? null : (String(out || '').trim().split('\n')[0] || null);
      k.at = Date.now();
      k.pending = null;
      resolve(k.path);
    });
  });
  return k.pending;
}
/** the kept answer — never a child on the caller's turn; a stale or missing one is refreshed in the background */
function whichKept(name, { maxAgeMs = MAX_AGE_MS } = {}) {
  const k = kept.get(name);
  if (!k || Date.now() - k.at > maxAgeMs) refresh(name);
  return k ? k.path : null;
}
/** a fresh answer (async, bounded by the child's timeout) */
function whichNow(name) { return refresh(name); }
/** has a lookup of this name FINISHED once? Before it, a caller says «checking» — never «not found» (rank 13 round 2) */
function whichKnown(name) { const k = kept.get(name); return !!(k && k.at); }

module.exports = { whichKept, whichNow, whichKnown, TIMEOUT_MS, MAX_AGE_MS };
