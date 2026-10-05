'use strict';
/**
 * THE descriptor STORE hooks a resume consults — read generically, never by
 * harness id (dc-harness-store, 2.369.213). ws-create calls these; the hooks
 * live on each harness's `store` (src/harnesses/<id>.js), and a harness that
 * declares none simply gets no sweep / no fork-chain env.
 *
 *  · writerSweepOpts → `store.writerSweep` (the pre-resume writer sweep's
 *    holder legs; src/writer-sweep.js sweepWriters runs it on any machine)
 *    + the protect list: webui ids of the LIVE sessions of the SAME harness on
 *    the TARGET machine (a codex app-server holds every rollout of its thread
 *    tree open, so a live session's holder is never swept — the 2.284.4
 *    class; a harness whose legs ignore the list loses nothing).
 *  · forkChainEnv → `store.forkChain(id)` (the persisted forked-from chain the
 *    wrapper merges on resume) handed to the wrapper under the env name the
 *    harness declares (`store.forkChainEnv`).
 */
// lazy: the descriptors require modules that may require this one
const storeOf = (backend) => { try { return require('./harnesses').get(backend).store || {}; } catch { return {}; } };

/** Does this harness declare a pre-resume writer sweep? (the local-sweep gate) */
function hasWriterSweep(backend) { return typeof storeOf(backend).writerSweep === 'function'; }

/** → { sweep, protectSids } spread into sweepWriters(); `activeSessions` = the server's Map. */
function writerSweepOpts(backend, activeSessions, hostId) {
  const sweep = storeOf(backend).writerSweep;
  const protectSids = [...(activeSessions || [])]
    .filter(([, es]) => (es.backend || 'claude') === backend && (es.host || null) === (hostId || null))
    .map(([eid]) => eid);
  return { sweep, protectSids };
}

/** → env entries for a resume of `resumeId` ({} when the harness declares no chain). */
function forkChainEnv(backend, resumeId) {
  const st = storeOf(backend);
  if (!resumeId || typeof st.forkChain !== 'function' || !st.forkChainEnv) return {};
  const chain = [...(st.forkChain(resumeId) || [])];
  if (!chain.includes(resumeId)) chain.push(resumeId);
  return { [st.forkChainEnv]: chain.join(',') };
}

module.exports = { hasWriterSweep, writerSweepOpts, forkChainEnv };
