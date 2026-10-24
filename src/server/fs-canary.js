'use strict';
// THE FS CANARY (2.108.6; off the main thread since design 011 lane 1, store-timing, 2026-10-03). The wedge class that
// took the instance down twice (hung FUSE IO) fills the libuv threadpool while the event loop stays healthy, so every
// 10 s a stat() of the checkout's package.json must round-trip through the pool; three answers past the deadline in a
// row = the pool is wedged by something → a loud line, telemetry, a mount health sweep.
// Until this lane the stat's callback AND its 5 s deadline ran on the MAIN thread, so a blocked event loop read as a
// slow mount (the survey: 142 of 164 slow canaries came just before a > 1 s stall). Now the stat runs and is timed in
// its own one-worker SafeFs (src/server/fs-canary-worker.js) by that thread's clock, and the main side measures only
// how long the answer waited for the loop. Two facts, two names, each logged and counted past `slowMs`:
//   srv-fs-canary-ms    the stat itself (worker clock): the pool / the mount — the only fact that strikes
//   srv-loop-canary-ms  the answer sat this long before the main loop took it: a blocked loop, never a mount
// A probe whose worker never answers (the SafeFs backstop: the loop was blocked past it, or the worker died) is
// `srv-fs-canary-lost` — said, counted, never a strike.
// `onProbe({strike, at, ms})` (lane fuse-canary-notice, B-b327): every answered probe, a strike or a clean one, drives the
// mount-health EPISODE (src/mount-health.js canaryStep → ONE For-you item + the server's own scans paused); a lost probe
// drives nothing.
// lane hub-fuse-sync-guard (the 6.5-min hold of 2026-10-23, named by nothing): the sync fs witness
// (src/server/sync-fs-witness.js) keeps every main-thread sync call over 50 ms. A held loop is said ONCE, by held(): the
// witness hands a call ≥ 1 s over at its return (no probe need be in flight — the 6.5-min hold had none), and a late
// probe asks the witness for the call in its window — «the main loop was held N ms — the sync fs call that returned as
// it resumed: fn(path) ms, under storage mount «…» / not under a mount ← caller». A hold ≥ EPISODE_MS on a mount path
// goes to mount-health (`onHeld`): its For-you item names the call beside the processes pressing that mount.
const path = require('path');
const { SafeFs } = require('../safe-fs.js');

const DEADLINE_MS = 5000;
const SLOW_MS = 1000;
const STRIKES = 3;

function createFsCanary({ file, record = () => {}, log = (...a) => console.error(...a), onWedged = () => {}, onProbe = () => {},
  deadlineMs = DEADLINE_MS, slowMs = SLOW_MS, probe = null, now = () => Date.now(), blame = null, witness = null, onHeld = () => {}, episodeMs = null } = {}) {
  const SW = require('./sync-fs-witness.js');
  const EPISODE = Number.isFinite(episodeMs) ? episodeMs : SW.EPISODE_MS;
  // lane vault-slow-load addendum: a blocked loop names WHAT held it — the main thread's slow sync fs calls in that window
  const LB = require('./loop-blame.js');
  const blameOf = typeof blame === 'function' ? blame : (from, to) => LB.blameWords(LB.blame(from, to));
  const pool = probe || new SafeFs({
    workerPath: path.join(__dirname, 'fs-canary-worker.js'), name: 'fs-canary',
    inlineRun: require('./fs-canary-worker.js').runOp,
    poolSize: 1,
    timeouts: { probe: deadlineMs * 3 },
  });
  let strikes = 0, busy = false;
  const counts = { probes: 0, slowFs: 0, slowLoop: 0, timedOut: 0, lost: 0, wedged: 0, held: 0, heldOnMount: 0 };

  /** A held loop the witness explains: said ONCE per call (the witness's entry carries `said`), counted, and — a hold
   *  ≥ EPISODE_MS on a mount path — handed to mount-health with its call site. */
  function held(e, loopMs = e && e.ms) {
    if (!e) return null;
    e.said = true;
    counts.held++;
    const line = SW.heldLine(loopMs, e);
    log(line);
    record({ kind: 'metric', name: 'srv-sync-fs-held-ms', value: Math.round(e.ms), detail: `fn=${e.fn} class=${e.class}` });
    if (e.mount && e.ms >= EPISODE) { counts.heldOnMount++; try { onHeld(e); } catch { } }
    return line;
  }
  if (witness && typeof witness.setOnHeld === 'function') witness.setOnHeld((e) => held(e));

  /** One probe. Resolves with its facts ({fsMs, loopMs, queueMs, timedOut, where, strike}) or null when the
   *  previous one is still in flight. Never rejects. */
  async function tick() {
    if (busy) return null; // previous probe still in flight
    busy = true;
    const sentAt = now();
    let r;
    try { r = await pool.call('probe', { path: file, deadlineMs }); }
    catch (e) {
      busy = false;
      counts.lost++;
      const waited = now() - sentAt;
      log(`[canary] the probe got no answer in ${waited}ms (${(e && e.message) || e}) — its worker or the main loop, not counted as a slow mount`);
      record({ kind: 'event', name: 'srv-fs-canary-lost', value: waited });
      return { lost: true, waitedMs: waited };
    }
    busy = false;
    counts.probes++;
    const gotAt = now();
    const fsMs = Math.max(0, r.fsMs);
    const loopMs = Math.max(0, gotAt - r.doneAt);
    const queueMs = Math.max(0, r.startAt - sentAt);
    const facts = { fsMs, loopMs, queueMs, timedOut: !!r.timedOut, where: r.where, strike: 0 };
    if (loopMs > slowMs) {
      counts.slowLoop++;
      const call = witness && typeof witness.heldIn === 'function' ? witness.heldIn(r.doneAt, gotAt) : null;
      if (call) { // the witness names the call (said once: the witness's own hand-over may have said it already)
        facts.blockedBy = SW.callWords(call);
        if (!call.said) held(call, loopMs);
        record({ kind: 'metric', name: 'srv-loop-canary-ms', value: loopMs });
        return finish(facts, r, gotAt);
      }
      let by = '';
      try { by = blameOf(r.doneAt, gotAt) || ''; } catch { by = ''; }
      facts.blockedBy = by;
      log(`[canary] the main loop held the probe's answer ${loopMs}ms (the stat itself took ${fsMs}ms ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'}) — a blocked loop, not a slow mount${by ? `; in that window: ${by}` : ''}`);
      record({ kind: 'metric', name: 'srv-loop-canary-ms', value: loopMs });
    }
    return finish(facts, r, gotAt);
  }

  function finish(facts, r, gotAt) {
    const { fsMs } = facts;
    if (r.timedOut) {
      counts.timedOut++;
      facts.strike = ++strikes;
      log(`[canary] threadpool stat() exceeded ${deadlineMs / 1000}s (strike ${strikes}, timed ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'}) — pool likely wedged`);
      record({ kind: 'metric', name: 'srv-fs-canary-ms', value: deadlineMs });
      if (strikes >= STRIKES) {
        strikes = 0;
        counts.wedged++;
        record({ kind: 'event', name: 'srv-threadpool-wedged' });
        try { onWedged(); } catch { }
      }
      try { onProbe({ strike: true, at: gotAt, ms: deadlineMs }); } catch { }
      return facts;
    }
    strikes = 0;
    try { onProbe({ strike: false, at: gotAt, ms: fsMs }); } catch { }
    if (fsMs > slowMs) {
      counts.slowFs++;
      log(`[canary] threadpool stat() took ${fsMs}ms ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'} — the pool or the mount is slow`);
      record({ kind: 'metric', name: 'srv-fs-canary-ms', value: fsMs });
    }
    return facts;
  }

  return { tick, held, counts, close: () => { if (!probe) pool.close(); } };
}

module.exports = { createFsCanary, DEADLINE_MS, SLOW_MS, STRIKES };
