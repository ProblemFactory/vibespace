'use strict';
/**
 * WHERE A COMMAND LIVES, KEPT (lane hub-sync-holds, rank 13 — the owner's hub held its loop 4.7–4.9 s in a plugin's status:
 * every snapshot ran `which` / `pgrep` / `sudo -n true` / `tailscale status --json` synchronously). A plugin's sync code reads
 * the KEPT answer (`whichKept`): it never runs a child — a missing or stale answer starts ONE async `which` with a timeout and
 * the caller gets the last answer (null before the first). An async road (`whichNow`) waits for a fresh answer, bounded.
 */
let { execFile } = require('child_process'); // `let`: a suite's stand-in swaps it (_seam) — the call stays the literal execFile('which', …) the spawn-env census rows

const TIMEOUT_MS = 5000;
const MAX_AGE_MS = 60000;
const GRACE_MS = 1000;
const kept = new Map(); // name → { path, at, pending }
const seam = { get: () => execFile, set: (fn) => { execFile = fn; } }; // a suite's stand-in for the spawn (round 3: a spawn that throws)
/** round 3: a child still alive `after` ms on — past its timeout, or after its ask was aborted — ignores SIGTERM: SIGKILL it.
 *  Only OUR child, by its own handle. */
function graceKill(c, after) {
  const t = setTimeout(() => { if (c && c.exitCode === null && c.signalCode === null) { try { c.kill('SIGKILL'); } catch { } } }, after);
  if (t.unref) t.unref();
  return t;
}

function refresh(name, signal) {
  const k = kept.get(name) || { path: null, at: 0, pending: null };
  kept.set(name, k);
  if (k.pending) return k.pending;
  const p = new Promise((resolve) => {
    const done = () => resolve(k.at ? k.path : null);
    if (signal && signal.aborted) return done();
    let c = null;
    // an aborted ask kills its `which` too: registered BEFORE the spawn, so it runs before execFile's own abort handling
    const onAbort = () => graceKill(c, GRACE_MS);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    try {
      c = execFile('which', [name], { encoding: 'utf8', timeout: TIMEOUT_MS, ...(signal ? { signal } : {}) }, (err, out) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        // only a `which` that RAN to its answer is kept: aborted, timed out or killed ⇒ the last answer stands (never «not found»)
        if (!(err && (err.name === 'AbortError' || err.killed || err.signal))) { k.path = err ? null : (String(out || '').trim().split('\n')[0] || null); k.at = Date.now(); }
        done();
      });
    } catch { if (signal) signal.removeEventListener('abort', onAbort); return done(); } // a `which` that could not be SPAWNED: still unknown — the next ask tries again; never a rejection
    graceKill(c, TIMEOUT_MS + GRACE_MS); // past its own timeout (SIGTERM), a child still alive is SIGKILLed — it checks liveness itself
  });
  // the memo is set BEFORE it can be cleared: a lookup that ends at once (a spawn that threw) must never stay «pending» for the
  // process's life (round 3 — it poisoned that name)
  k.pending = p;
  p.then(() => { if (k.pending === p) k.pending = null; });
  return p;
}
/** the kept answer — never a SYNCHRONOUS child: a stale or missing one starts ONE async `which` (spawned from this call, it runs off the loop) */
function whichKept(name, { maxAgeMs = MAX_AGE_MS } = {}) {
  const k = kept.get(name);
  if (!k || Date.now() - k.at > maxAgeMs) refresh(name);
  return k ? k.path : null;
}
/** a fresh answer (async, bounded by the child's timeout; `signal` — the asker's abort — kills its child). NAMED: the lookup is
 *  SHARED by name, so an ask that joins a `which` the kept read (whichKept) started first does not hand that child its signal —
 *  aborted, the ask stops waiting on it, but the child runs on to its own 5 s timeout (+ the 1 s grace): one orphan for up to
 *  6 s, nothing started beside it. */
function whichNow(name, { signal } = {}) { return refresh(name, signal); }
/** has a lookup of this name FINISHED once? Before it, a caller says «checking» — never «not found» (rank 13 round 2) */
function whichKnown(name) { const k = kept.get(name); return !!(k && k.at); }

module.exports = { whichKept, whichNow, whichKnown, graceKill, TIMEOUT_MS, MAX_AGE_MS, GRACE_MS, _seam: seam };
