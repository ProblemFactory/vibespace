'use strict';
/**
 * THE ONE OBSERVER OF "THIS SESSION'S COMPACTION ENDED" (lane worker-dispatch,
 * 2026-10-02). A dispatch (src/server/worker-dispatch.js) sends a worker
 * `/compact` and must hand it the brief only after the compaction is over.
 * The claude stdout consumer already funnels EVERY exit of the 'compacting'
 * claim through ONE writer — `endCompaction` in
 * src/server/stdout/claude-stream-json.js (the CLI's own outcome record
 * `system/status {status:null, compact_result|compact_error}`, a `result` /
 * `compact_boundary`, the CLI's idle turn state, and the teardown of a dead
 * wrapper) — so that writer notifies HERE, and a waiter hears the end exactly
 * once, with the CLI's outcome when there is one. Never a poll of the buffer
 * file, never a second inference of "the compaction ended".
 *
 *   notifyCompactionEnd(sessionId, {result, error}) → how many waiters heard it
 *   awaitCompactionEnd(sessionId, {timeoutMs}) → Promise<
 *       {ended:true, result, error, waitedMs} | {ended:false, timedOut:true, waitedMs}>
 *
 * Keyed by the WEBUI session id (the activeSessions key — what the consumer's
 * `sid` is). In memory: a server restart mid-wait ends the request that held
 * the wait, so there is nothing to persist.
 */
const waiters = new Map();   // sessionId → Set<(outcome) => void>

function notifyCompactionEnd(sessionId, { result = null, error = null } = {}) {
  const set = waiters.get(sessionId);
  if (!set || !set.size) return 0;
  waiters.delete(sessionId);
  for (const fn of set) { try { fn({ result: result || null, error: error || null }); } catch { } }
  return set.size;
}

function awaitCompactionEnd(sessionId, { timeoutMs = 180 * 1000, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const t0 = now();
  return new Promise((resolve) => {
    let done = false, timer = null;
    const fn = (outcome) => {
      if (done) return;
      done = true;
      if (timer) clearTimer(timer);
      resolve({ ended: true, result: outcome.result, error: outcome.error, waitedMs: now() - t0 });
    };
    let set = waiters.get(sessionId);
    if (!set) { set = new Set(); waiters.set(sessionId, set); }
    set.add(fn);
    timer = setTimer(() => {
      if (done) return;
      done = true;
      const s = waiters.get(sessionId);
      if (s) { s.delete(fn); if (!s.size) waiters.delete(sessionId); }
      resolve({ ended: false, timedOut: true, waitedMs: now() - t0 });
    }, timeoutMs);
  });
}

/** Waiters still open (a suite's leak check). */
function pendingWaiters() { let n = 0; for (const s of waiters.values()) n += s.size; return n; }

module.exports = { notifyCompactionEnd, awaitCompactionEnd, pendingWaiters };
