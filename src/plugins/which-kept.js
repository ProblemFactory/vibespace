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
// B-323e follow (主开发 r2030 (3b)): A NO-REPLY BACKS OFF — a lookup the starter did not answer (its bound, its fault, a `which`
// walking a hung mount ahead on PATH; never a start that failed: no child runs then) starts no new lookup of that name for NO_REPLY_WAIT_MS, doubled at each no-reply in a row up
// to NO_REPLY_WAIT_MAX_MS; meanwhile every ask is served the LAST GOOD answer, said as not fresh (whichFreshAnswer: known false +
// keptAt). An answer ends the wait. A person's press (maxAgeMs 0) looks again at once — one lookup in flight per name still.
const NO_REPLY_WAIT_MS = 5000;
const NO_REPLY_WAIT_MAX_MS = 5 * 60 * 1000;
const kept = new Map(); // name → { path, at, n (answers recorded: «answered since» is a count, never a time — r2480), pending, noLookup, noReplyAt, waitMs }
const seam = { get: () => runWhich, set: (fn) => { runWhich = fn; } }; // a suite's stand-in for the run (round 3: a run that throws)
const backingOff = (k, now = Date.now()) => !!(k && k.noReplyAt && now - k.noReplyAt < k.waitMs);

function refresh(name, signal, { press = false } = {}) {
  const k = kept.get(name) || { path: null, at: 0, n: 0, pending: null, noLookup: false, noReplyAt: 0, waitMs: 0 };
  kept.set(name, k);
  if (signal && signal.aborted) return Promise.resolve(k.at ? k.path : null);   // its read: an ask ABORTED before it asks starts nothing (as before)
  if (!k.pending) {
    if (!press && backingOff(k)) return Promise.resolve(k.at ? k.path : null);   // r2030 (3b): waiting after a no-reply — the last good answer, no new child
    // r2802 (主开发, from an independent verification): ONE LOOKUP PROGRAM A NAME AT A TIME. The slot (`k.pending`) is the child's OWN
    // life — taken until its answer, or the starter's bound (TIMEOUT_MS) — never an ask's: an aborted ask ends only ITS waiting, and an
    // ask that comes meanwhile joins the one that runs (before, the abort freed the slot while the child ran, and the next ask started a
    // second `which` beside it — the Log-in dialog's 3 s asks could stack them). `waiting` counts the asks still waiting on it. The
    // starter's bound is TIMEOUT_MS on its timer, about 9 s at its fault (5 s plus its guards); a joiner never waits past it
    const look = { waiting: 0, p: null };
    look.p = Promise.resolve().then(() => runWhich(name)).then((r) => r, () => null).then((r) => {
      // only a `which` that RAN to its answer is kept: the starter's no answer, timed out or killed ⇒ the last answer stands (never «not
      // found») and the next lookup waits (r2030 (3b)); no `which` program at all (ENOENT) is kept as THAT fact (`noLookup`, r2030 (3a)):
      // a caller that had its own look before (the tmux road) looks its own way. An answer NO ask waits for any more (every one aborted)
      // records nothing — an aborted ask records nothing (r1351); one ask still waiting is enough to keep it
      const keep = look.waiting > 0;
      const ran = !!(r && r.started !== false && !r.unknown && !r.timedOut && !r.signal), noWhich = !!(r && r.started === false && r.error === 'ENOENT');
      if (keep && (ran || noWhich)) { k.noLookup = noWhich; k.noReplyAt = 0; k.waitMs = 0; }
      else if (r && (r.unknown || r.timedOut || r.signal)) { k.noReplyAt = Date.now(); k.waitMs = Math.min(k.waitMs ? k.waitMs * 2 : NO_REPLY_WAIT_MS, NO_REPLY_WAIT_MAX_MS); }   // a NO-REPLY (a child may still run — one on a hung mount outlives the starter's kill): wait, EVEN WHEN NO ASK WAITS any more (its read: the wait guards the host, it records no answer)
      if (keep && (ran || noWhich)) { k.path = r.code === 0 ? (String(r.stdout || '').trim().split('\n')[0] || null) : null; k.at = Date.now(); k.n += 1; }
    }).finally(() => { if (k.pending === look) k.pending = null; });   // the slot freed at the CHILD's end (a `which` that could not be started ends at once: no child runs — round 3, it never stays «pending»)
    k.pending = look;
  }
  const look = k.pending;
  // THIS ASK's waiting: it ends at the lookup's answer, or at this ask's own abort (which ends nothing else — the child runs on)
  return new Promise((resolve) => {
    const done = () => resolve(k.at ? k.path : null);
    if (signal && signal.aborted) return done();
    look.waiting += 1;
    let over = false;
    const end = () => { if (over) return; over = true; look.waiting -= 1; if (signal) signal.removeEventListener('abort', end); done(); };
    if (signal) signal.addEventListener('abort', end, { once: true });
    look.p.then(end, end);
  });
}
/** the kept answer — never a SYNCHRONOUS child: a stale or missing one starts ONE async `which` (spawned from this call, it runs off the loop) */
function whichKept(name, { maxAgeMs = MAX_AGE_MS } = {}) {
  const k = kept.get(name);
  if (!k || Date.now() - k.at > maxAgeMs) refresh(name);
  return k ? k.path : null;
}
/** a fresh answer (async, bounded by the child's timeout; `signal` — the asker's abort — stops the WAITING). The lookup is SHARED
 *  by name and its `which` is the hub's STARTER's child (B-323e): an aborted ask stops waiting at once and records nothing (unless
 *  another ask still waits on that lookup); the child runs to its answer or the starter's bound (TIMEOUT_MS on its timer, SIGKILL
 *  there), and nothing is started beside it — ONE LOOKUP PROGRAM A NAME AT A TIME (r2802). */
function whichNow(name, { signal } = {}) { return refresh(name, signal); }
/** B-323e (r1381): the kept answer when fresh, else a fresh one, SAID WITH whether it is known: {path, known} — known false = the
 *  lookup got no reply (the starter's no answer, its bound): never «not found». maxAgeMs 0 = a person's press: always looks again —
 *  NEVER the kept answer, even one recorded in the press's own millisecond (only the one lookup already in flight is joined) —
 *  (r2473 / r2480: the age test «at most 0» was true then,
 *  and a no-reply reached the person as «not installed»). Whether an answer CAME is a count of answers recorded for the name,
 *  never a time compared with the last (two answers in one millisecond: a real «not found» read as no reply, «could not check»).
 *  r2030: a no-reply serves the LAST GOOD path with known false and `keptAt` (when it was read), and the next lookup waits
 *  (NO_REPLY_WAIT_MS, growing); `noLookup` true = this host has no `which` program (its path then says nothing). */
function whichFreshAnswer(name, { maxAgeMs = MAX_AGE_MS } = {}) {
  const k = kept.get(name);
  const said = (x) => ({ path: x.path, known: true, ...(x.noLookup ? { noLookup: true } : {}) });
  if (maxAgeMs > 0 && k && k.at && Date.now() - k.at <= maxAgeMs) return Promise.resolve(said(k));
  const n0 = k ? k.n : 0;
  return refresh(name, null, { press: maxAgeMs === 0 }).then(() => {
    const k2 = kept.get(name);
    if (k2 && k2.n !== n0) return said(k2);
    return { path: k2 && k2.at ? k2.path : null, known: false, ...(k2 && k2.at ? { keptAt: k2.at } : {}), ...(k2 && k2.noLookup ? { noLookup: true } : {}) };   // r2262: a no-reply keeps the «no lookup program» fact
  });
}
/** has a lookup of this name FINISHED once? Before it, a caller says «checking» — never «not found» (rank 13 round 2) */
function whichKnown(name) { const k = kept.get(name); return !!(k && k.at); }

module.exports = { whichKept, whichNow, whichFreshAnswer, whichKnown, TIMEOUT_MS, MAX_AGE_MS, NO_REPLY_WAIT_MS, NO_REPLY_WAIT_MAX_MS, _seam: seam };
