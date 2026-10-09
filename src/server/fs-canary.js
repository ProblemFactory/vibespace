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
const path = require('path');
const { SafeFs } = require('../safe-fs.js');

const DEADLINE_MS = 5000;
const SLOW_MS = 1000;
const STRIKES = 3;

function createFsCanary({ file, record = () => {}, log = (...a) => console.error(...a), onWedged = () => {}, onProbe = () => {},
  deadlineMs = DEADLINE_MS, slowMs = SLOW_MS, probe = null, now = () => Date.now() } = {}) {
  const pool = probe || new SafeFs({
    workerPath: path.join(__dirname, 'fs-canary-worker.js'), name: 'fs-canary',
    inlineRun: require('./fs-canary-worker.js').runOp,
    poolSize: 1,
    timeouts: { probe: deadlineMs * 3 },
  });
  let strikes = 0, busy = false;
  const counts = { probes: 0, slowFs: 0, slowLoop: 0, timedOut: 0, lost: 0, wedged: 0 };

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
      log(`[canary] the main loop held the probe's answer ${loopMs}ms (the stat itself took ${fsMs}ms ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'}) — a blocked loop, not a slow mount`);
      record({ kind: 'metric', name: 'srv-loop-canary-ms', value: loopMs });
    }
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

  return { tick, counts, close: () => { if (!probe) pool.close(); } };
}

module.exports = { createFsCanary, DEADLINE_MS, SLOW_MS, STRIKES };
