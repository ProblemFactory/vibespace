// THE EXIT'S WAIT FOR WHAT IS IN FLIGHT (server.js shutdown; notify-retry verify r1, 2026-10-01). A stash hand-over (verify r2:
// its frame may be in the CLI's inbox while its drain is not on disk) or a retry post of the delivery ladder's park (a post
// cut by the exit left its `inflight` stamp and the next boot re-posted a frame that had landed — two billed turns) settles
// BEFORE the process exits, ≤ maxMs each. Never throws; a deadline passed is said per store (the next boot owns the rest).
// THE DEADLINE COVERS THE POST'S OWN BOUND (verify r2, reproduced: a post started a second before SIGTERM takes up to
// POST_BOUND_MS — the 5 s deadline passed first, the `inflight` stamp stayed on disk, and the next boot handed a frame
// that HAD landed to the stash as may-have-landed: a repeat at the next prompt on a graceful stop). Still far under
// systemd's 90 s stop timeout (TimeoutStopSec is not set in scripts/install-service.sh).
const { POST_BOUND_MS } = require('../peer-messaging.js');
const SETTLE_MS = POST_BOUND_MS + 1000;
function settleInFlight({ stashView, deliver, n, m, maxMs = SETTLE_MS, log = console }) {
  log.log?.(`  Shutting down: waiting for ${n} stash hand-over(s) and ${m} retry post(s) in flight…`);
  const waits = [stashView && typeof stashView.settle === 'function' ? stashView.settle(maxMs) : Promise.resolve(0), deliver && typeof deliver.settleRetries === 'function' ? deliver.settleRetries(maxMs) : Promise.resolve(0)];
  return Promise.allSettled(waits).then(([a, b]) => {
    if (a.status === 'fulfilled' && a.value < 0) log.warn?.(`[stash] ${-a.value} hand-over(s) did not settle before the deadline — stamped, released at the next boot`);
    if (b.status === 'fulfilled' && b.value < 0) log.warn?.(`[deliver] ${-b.value} retry post(s) did not settle before the deadline — stamped, handed to the stash at the next boot`);
  }).catch(() => { });
}
module.exports = { settleInFlight, SETTLE_MS };
