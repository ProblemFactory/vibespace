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
const { rewindPlanOf, REWIND_REFUSALS, REWIND_LIFE_MS } = require('../rewind-door.js');
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

/** ONE REWIND AT A TIME — the request out, WHILE IT LIVES: the wrapper says it as it reaches the CLI (`rewind_out`, in its
 *  buffer, so a hub restart reads it back) and it holds until the CLI's answer; a new process is a new wrapper whose buffer
 *  starts empty. A press whose record is not read yet (or a wrapper older than the record) holds REWIND_LIFE_MS. The
 *  person's send waits on it too (src/server/user-input.js). ⇒ docs/kb-file-structure.md «rewind-door.js» */
function conversationOut(session, now = Date.now()) {
  const n = session && session._normalizer, o = session && session._rewindOut;
  const said = n && n.rewindAskedOut?.();          // the wrapper's record: it lives until its answer, across a hub restart
  if (said) return said;
  if (!o || (n && n.rewindAnswered?.(o.id))) return null;
  return now - o.at < REWIND_LIFE_MS ? o : null;   // pressed, its record not read yet (or a wrapper that says none): one life
}
// THE FILES PRESS OUT (row B-437e, the files tier — src/server/rewind-files-door.js): a `rewind_files` press is a rewind too —
// while one runs (its re-check, its press, a late answer it still waits for) this door, the confirm and the person's send
// fence see it exactly as a conversation rewind out. Held in the hub's memory only: a hub restart forgets it (said in the kb).
const FILES_OUT = new WeakMap();   // conversation → {id, at, files: true}
function setFilesOut(session, mark) { if (!session) return; if (mark) FILES_OUT.set(session, mark); else FILES_OUT.delete(session); }
// tied to the CLI process it waits on (its reader): a new process (a respawn, a CLI that died) leaves no mark behind
function filesOutOf(session) {
  const m = session ? FILES_OUT.get(session) : null;
  if (m && m.pty && session.pty !== m.pty) { FILES_OUT.delete(session); return null; }
  return m || null;
}
function rewindOut(session, now = Date.now()) { return filesOutOf(session) || conversationOut(session, now); }

/** WHEN THE REQUEST WENT OUT, by the hub's clock: the press's own mark when it is this request; else the wrapper's stamp,
 *  never later than when the hub read it (`seenAt`). */
function outAt(session, o) {
  const own = session && session._rewindOut;
  if (own && o && own.id === o.id) return Number(own.at) || 0;
  return Math.min(Number(o && o.at) || 0, Number(o && o.seenAt) || Infinity);
}

/** THE PERSON'S FENCE (主开发 20:05Z): while a rewind is out the person's send waits — never past the stated expiry
 *  (REWIND_LIFE_MS from the press): the ms left, 0 = the send goes through. Only this fence is bounded; the hub's own mark
 *  (rewindOut) lives as long as the request. */
function rewindFenceLeft(session, now = Date.now()) {
  const o = rewindOut(session, now);
  return o ? Math.min(REWIND_LIFE_MS, Math.max(0, outAt(session, o) + REWIND_LIFE_MS - now)) : 0;
}
/** THE PERSON'S GOAL PRESS behind the same fence (主开发 r2682): a set, a clear or a resume of the conversation's goal is a frame on
 *  the CLI's input like a typed message, so while a rewind is out it is refused BY NAME (`rewind_out`, the seconds left) and
 *  nothing is written; reading the goal (`status`) is never stopped. It stops the PERSON's own press only — the agent's own goal
 *  state read from its records is not a press → null (go on) | the refusal */
function goalFenceOf(session, action, now = Date.now()) {
  if (action === 'status') return null;
  const fence = rewindFenceLeft(session, now);
  if (!(fence > 0)) return null;
  const left = Math.ceil(fence / 1000);
  return { ok: false, code: 'rewind_out', left, error: `A rewind is on its way — the goal was not changed. Change it after the rewind answers (in ${left} s at the latest), or stop the conversation.` };
}

/** One press — or its DRY RUN (`dryRun`: the plan's words for the confirm, nothing written). Returns the frame for the
 *  page that pressed: `{ ok: true, requestId?, dryRun?, taken, turns, files }`, or `{ ok: false, reason, cls }`. Writes
 *  nothing on a refusal or a dry run. `by` = who asks (only the person: {kind:'human'}). */
function requestRewind({ session, msgId, lastSeenUuid, by, dryRun = false, expectTaken = null, roadOf = rewindRoad, now = Date.now(), reqId = null }) {
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
  const out0 = rewindOut(session, now);                 // one rewind at a time — past the minute the words name the Stop door
  if (out0) return no(now - outAt(session, out0) >= REWIND_LIFE_MS ? 'pending-long' : 'pending');
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
  try { out = road.request(plan, { id: typeof reqId === 'string' ? reqId : null }); } catch { return no('no-target-id'); } // the page's own id: it binds it before it sends
  try { session.pty.write(out.line + '\n'); } catch { return no('stopped'); }
  session._rewindOut = { id: out.requestId, at: now }; // one rewind at a time (rewindOut)
  try { session._normalizer.noteRewindPressed?.({ id: out.requestId, lastId: (messages[messages.length - 1] || {}).id || null }); } catch { } // the late answer's bound
  return { ok: true, requestId: out.requestId, ...said };
}

module.exports = { rewindStateOf, requestRewind, personOfUpgrade, rewindOut, conversationOut, setFilesOut, filesOutOf, rewindFenceLeft, goalFenceOf };
