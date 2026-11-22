'use strict';
// B-360d (A) (主开发 r1358) — THE MEMORY CENSUS'S TICK ENFORCES EVERY CEILING IT STATES. The two caches whose idle floor was
// enforced only at their NEXT put (the transcript tails, the estimator's anchor lines — the census said «128 MB · OVER» for a
// set held over its floor as long as nothing new arrived) are trimmed here too, once a minute: a cache drop — nothing read,
// nothing asked, a walk of two small maps. THE HELD CONVERSATIONS are named here, once a tick, and handed to the tails' cache:
// a conversation with a client attached (a window open on the live session) or a turn running (session._isStreaming) keeps its
// tail whatever its last read; a history window still open is held by session-store itself (noteJsonlView at its view-only
// attach, dropJsonlView at the page's `view-close`, dropJsonlViews at its socket's close — r1374).
// Called by src/server/memory-sampler.js's `enforce` hook (server.js hands it in, beside the census's owners).
const ss = require('../session-store.js');

/** the conversation ids held by the live sessions: a client attached, or a turn running */
function heldOf(activeSessions) {
  const out = new Set();
  try {
    for (const s of activeSessions.values()) {
      if (!s) continue;
      if (!(s._isStreaming === true || (s.clients && typeof s.clients.size === 'number' && s.clients.size > 0))) continue;
      for (const id of [s.claudeSessionId, s.backendSessionId]) if (id) out.add(String(id));   // r1374: under the cache's own key whichever id it is
    }
  } catch { /* a map being changed: the next tick */ }
  return out;
}

let wiredFor = null;
/** ONE TICK: wire the held set once (the live sessions' map is the hub's, for its whole run), then the two idle trims.
 *  → { tails: {evicted, freedBytes, ms, entries, handoffsExpired}, lines: … | null } (B-80cb r2195: the handed tails past their time go here) */
function tick({ activeSessions = null, usageEstimator = null, now = Date.now() } = {}) {
  if (activeSessions && wiredFor !== activeSessions) { wiredFor = activeSessions; ss.setJsonlHeld(() => heldOf(activeSessions)); }
  const tails = ss.jsonlCacheTrim(now);
  let lines = null;
  try { lines = usageEstimator && typeof usageEstimator.lineCacheTrim === 'function' ? usageEstimator.lineCacheTrim(now) : null; } catch { lines = null; }
  return { tails, lines };
}

module.exports = { tick, heldOf };
