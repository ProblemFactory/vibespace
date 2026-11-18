'use strict';
/**
 * THE SESSIONS SWEEP OFF THE LOOP (B-891e's named cause — B-360d ranks 12c + 9, lane bl-loop-a, 2026-11-18).
 * Measured on a scratch hub with 12 543 transcripts: every /api/sessions that missed its 4.5 s cache held the main loop
 * 1 348–1 385 ms, cold or warm — Step 2 of discoverClaudeSessions makes two witnessed statSyncs per transcript and builds
 * every row on the loop; every page polls at 5 s. THE LAW (主开发 2026-11-18): no pass over every row on the main loop.
 * So the claude walk (src/session-store.js discoverClaudeSessions, verbatim), the merge of every harness's entries, the
 * kept metas, the sort and the answer's bytes run HERE, in the «sessions-sweep» worker (src/sessions-sweep-worker.js on
 * a pool of its own); the loop hands in what only it knows — the live sessions' claude id + child pid, the webui and
 * sign-in pids, the other harnesses' entries (they discover on the loop, as before), the kept metas, the witness's
 * storage roots and the mount door's blocked roots — and swaps in the bytes. The same code builds the same rows in the
 * same order. Run on the main thread (the pool down: SafeFs's inline fallback) it is the old road, and the main
 * thread's own facts stand (setFacts only in a worker).
 *   sweepInThread(payload) → { buf, etag, count, held, heldDisc, onLoop, ms } — onLoop: it ran on the main thread; ms: its own cost
 *   lookupInThread({ sessionKey }) / rowsInThread({ fields }) — the last sweep's rows, from where they were built
 */
const { isMainThread } = require('worker_threads');
const A = require('./sessions-assemble.js');

// the last sweep's rows, kept where they were built: one row by its key (a For-you reply's reopen) or the compact list
// (the search backfill) is answered from here — a reader on the loop never gets every row unless it asked for them
let last = null;   // { rows, byKey: Map, at, ms }

async function sweepInThread({ active = [], webuiPids = [], devSnap = null, order = [], offLoop = null, others = {}, signInPids = [], kept = [], facts = null, bound = [] } = {}) {
  const t0 = Date.now();
  if (facts && !isMainThread) A.setFacts(facts);
  const liveIds = new Map(active);   // the live sessions' two facts the walk reads (claudeSessionId, _childPid)
  const perHarness = [];
  for (const id of order) {
    if (id === offLoop) perHarness.push({ id, entries: await require('./session-store').discoverClaudeSessions({ activeSessions: liveIds, webuiPids: new Set(webuiPids), devSnap }) });   // `offLoop`: the harness whose descriptor says discoverInSweep (claude's)
    else perHarness.push({ id, entries: others[id] || [] });
  }
  const discovered = new Map();   // B-a5a4 follow-up met: the stopped rows AS DISCOVERED (before the kept merge), keyed
  const sessions = A.assembleSweep({ perHarness, signInPids, kept, discovered });
  const { buf, etag, count } = A.answerBytes(sessions);
  const ms = Date.now() - t0;
  last = { rows: sessions, byKey: new Map(sessions.map((r) => [r.sessionKey, r])), at: Date.now(), ms };
  const held = A.heldRowsOf(sessions, bound);
  // the held keys' rows as discovered: the resume seam merges the kept copies as they stand NOW into them (B-a5a4 follow-up r2/r3)
  const heldDisc = held.flatMap((h) => discovered.get(`${h.backend || 'claude'}:${h.backendSessionId || h.sessionId}`) || []);
  return { buf, etag, count, held, heldDisc, onLoop: isMainThread, ms };
}
/** One row of the last sweep by its sessionKey → the row | null; `{ none: true }` when this thread holds no sweep yet. */
function lookupInThread({ sessionKey } = {}) {
  if (!last) return { none: true };
  return { row: last.byKey.get(String(sessionKey || '')) || null };
}
/** The last sweep's rows, each cut to `fields` → { rows } | `{ none: true }`. */
function rowsInThread({ fields = [] } = {}) {
  if (!last) return { none: true };
  const f = Array.isArray(fields) && fields.length ? fields : null;
  return { rows: f ? last.rows.map((r) => { const o = {}; for (const k of f) if (r[k] !== undefined) o[k] = r[k]; return o; }) : last.rows };
}

module.exports = { sweepInThread, lookupInThread, rowsInThread };
