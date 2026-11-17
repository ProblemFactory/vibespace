'use strict';
// ORCH: THE REWIND DOOR'S SERVER HALF (B-437e — docs/design-harness-features.md §3.2, tier one: the conversation).
// The page sends `{ type: 'rewind', sessionId, msgId, reqId }` for one of the person's OWN messages. This asks the PURE
// verdict and plan (src/rewind-door.js) over the conversation AS THE SERVER HOLDS IT — never the page's copy — and only
// when both say yes writes the harness's own request through its adapter (`formatRewind`). The answer comes back on the
// conversation's stream: the normalizer makes the cut in record order and emits `rewind-answer` to every page
// (src/message-manager.js); the page that pressed knows it by the request id this returns. A refusal here is said to the
// page that pressed, by name, before anything is sent — a running turn is refused, never interrupted (§3.2 red line ②).
// Gated on the harness's `checkpoints` row (src/backend-caps.js), never on a backend id.

const { capsOf } = require('../backend-caps.js');
const { rewindPlanOf, REWIND_REFUSALS } = require('../rewind-door.js');
const { conversationInTurn } = require('../account-pool-auto.js'); // PURE: a turn paused on the person is still a turn
const { rewindRoad } = require('../harnesses/index.js');            // the descriptor's road (B-437e entry condition 3)

/** The state the verdict reads, from the facts the stdout consumers own (the same facts the pool's defer reads). */
function rewindStateOf(session) {
  const s = session || {};
  return {
    live: !!s.pty,
    turnRunning: conversationInTurn({ isStreaming: s._isStreaming, turnState: s._turnState }),
    compacting: s._streamingKind === 'compacting',
    queued: Array.isArray(s._normalizer && s._normalizer._queue) ? s._normalizer._queue.length : 0,
  };
}

/** Is the socket behind this upgrade a PERSON on this instance's own page? No bearer of any kind (an agent's vsst_, a job's
 *  jbt_, an automation key) AND the strict page verdict (src/write-origin.js — the rule `pressOf` uses): with sign-in off
 *  /ws lets any local process in, so «the owner's road» is proven here, at the handshake, never assumed. */
function personOfUpgrade(req) {
  const WO = require('../write-origin.js');
  const h = (req && req.headers) || {};
  return !WO.pressBearer(h) && WO.pageVerdict(h, WO.ownOriginOf(h, { encrypted: !!(req && req.socket && req.socket.encrypted) })).ok;
}

/** One press — or its DRY RUN (`dryRun`: the plan's words for the confirm, nothing written). Returns the frame for the
 *  page that pressed: `{ ok: true, requestId?, dryRun?, taken, turns, files }`, or `{ ok: false, reason, cls }`. Writes
 *  nothing on a refusal or a dry run. `by` = who asks (only the person: {kind:'human'}). */
function requestRewind({ session, msgId, lastSeenUuid, by, dryRun = false, expectTaken = null, roadOf = rewindRoad }) {
  const no = (reason) => ({ ok: false, reason, cls: REWIND_REFUSALS[reason] || 'cannot' });
  // WHO: the person's own press through the owner's road (/ws takes the owner's cookie only). A rewind destroys later
  // turns — no conversation, job or automation credential may ask it (refused by name; no other door names it)
  if (!by || by.kind !== 'human') return no('not-the-person');
  if (!session) return no('stopped');                  // an ended conversation leaves the live list: resume it first
  if (session.mode !== 'chat') return no('not-offered');
  const row = capsOf(session.backend).checkpoints;
  if (!row || row.conversation !== true) return no('not-offered');
  const messages = session._normalizer && Array.isArray(session._normalizer.messages) ? session._normalizer.messages : null;
  if (!messages) return no('stopped');
  if (session._rebuildPromise) return no('rebuilding');  // the history is being rebuilt: the array is not whole yet
  if (session._normalizer.rewindPending?.()) return no('pending'); // one rewind at a time
  // the page names the newest message IT shows: a conversation that moved past it is refused, never cut unseen
  const plan = rewindPlanOf(row, messages, String(msgId || ''), { ...rewindStateOf(session), pageLastSeenUuid: typeof lastSeenUuid === 'string' ? lastSeenUuid : null });
  if (!plan.ok) return no(plan.reason);
  // THE ROAD IS THE HARNESS'S OWN (its descriptor's rewind.request) — never chosen by the row's granularity word
  const road = roadOf(session.backend);
  if (!road) return no('not-offered');
  // what the page says BEFORE the press comes from THIS plan (the dry run writes nothing)
  const said = { taken: plan.count, turns: plan.turns, files: plan.files };
  if (dryRun) return { ok: true, dryRun: true, ...said };
  // the press carries the numbers its confirm said: a conversation that changed between the two is refused, never cut
  if (Number.isFinite(expectTaken) && expectTaken !== plan.count) return no('changed-since');
  let out;
  try { out = road.request(plan); } catch { return no('no-target-id'); }
  try { session.pty.write(out.line + '\n'); } catch { return no('stopped'); }
  try { session._normalizer.noteRewindAsked?.(out.requestId); } catch { } // one rewind at a time (rewindPending)
  return { ok: true, requestId: out.requestId, ...said };
}

module.exports = { rewindStateOf, requestRewind, personOfUpgrade };
