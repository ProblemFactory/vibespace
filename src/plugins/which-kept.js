'use strict';
/**
 * WHERE A COMMAND LIVES, KEPT (lane hub-sync-holds, rank 13 — the owner's hub held its loop 4.7–4.9 s in a plugin's status:
 * every snapshot ran `which` / `pgrep` / `sudo -n true` / `tailscale status --json` synchronously). A plugin's sync code reads
 * the KEPT answer (`whichKept`): it never runs a child — a missing or stale answer starts ONE async `which` with a timeout and
 * the caller gets the last answer (null before the first). An async road (`whichNow`) waits for a fresh answer, bounded.
 */
// B-323e (lane bl-keys-misc, 主开发 r1351 (5)): THE LOOKUP RIDES THE HUB'S STARTER (src/server/child-starter.js) — never a fork of
// the hub (the Tailscale Log-in dialog asks every 3 s; the display's lookup, src/vnc.js, on the belt's 60 s refresh). The starter
// ends a child at ITS bound (SIGKILL at TIMEOUT_MS): an aborted ask stops WAITING at once and records nothing — its child ends at
// that bound (the starter kills by its own timer, never by a pid of ours). `let`: a suite's stand-in swaps it (_seam).
let runWhich = (name) => require('../server/child-starter').childStarter().run('which', [name], { timeoutMs: TIMEOUT_MS, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '' } });

const TIMEOUT_MS = 5000;
const MAX_AGE_MS = 60000;
const GRACE_MS = 1000;
const kept = new Map(); // name → { path, at, pending }
const seam = { get: () => runWhich, set: (fn) => { runWhich = fn; } }; // a suite's stand-in for the run (round 3: a run that throws)
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
    let over = false;
    const end = () => { if (over) return; over = true; if (signal) signal.removeEventListener('abort', end); done(); };   // an aborted ask stops waiting: nothing recorded
    if (signal) signal.addEventListener('abort', end, { once: true });
    Promise.resolve().then(() => runWhich(name)).then((r) => {
      // only a `which` that RAN to its answer is kept: aborted, the starter's no answer, timed out or killed ⇒ the last answer
      // stands (never «not found»); no `which` program at all (ENOENT) is an answer: not found
      if (!over && r && ((r.started !== false && !r.unknown && !r.timedOut && !r.signal) || (r.started === false && r.error === 'ENOENT'))) { k.path = r.code === 0 ? (String(r.stdout || '').trim().split('\n')[0] || null) : null; k.at = Date.now(); }
      end();
    }, end);   // a `which` that could not be STARTED: still unknown — the next ask tries again; never a rejection
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
/** B-323e: the kept answer when it is fresh (a found or a missing one, ≤ maxAgeMs), else a fresh one — the display's lookup */
function whichFresh(name, { maxAgeMs = MAX_AGE_MS } = {}) { const k = kept.get(name); return k && k.at && Date.now() - k.at <= maxAgeMs ? Promise.resolve(k.path) : refresh(name); }
/** has a lookup of this name FINISHED once? Before it, a caller says «checking» — never «not found» (rank 13 round 2) */
function whichKnown(name) { const k = kept.get(name); return !!(k && k.at); }

module.exports = { whichKept, whichNow, whichFresh, whichKnown, graceKill, TIMEOUT_MS, MAX_AGE_MS, GRACE_MS, _seam: seam };
