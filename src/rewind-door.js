'use strict';
// PURE: THE REWIND DOOR (B-437e — docs/design-harness-features.md §3.2, TIER ONE: the conversation; the owner ruled
// «conversation 与 files 都做» on 2026-09-07 and the files tier is a later unit of its own). The person presses
// «Rewind to here» on one of THEIR OWN messages: that message and everything after it are taken back IN PLACE — the
// same conversation, the same harness session; the message's words go back into the composer. Not a fork: «Fork from
// here» starts a NEW conversation and leaves this one as it was.
//
// Three questions, one answer each, asked by every road (the server's ws verb, the page's button) so no surface carries
// its own copy of the rule:
//   rewindVerdict   may this press go out now? A refusal NAMES its reason (REWIND_REFUSALS), it is never a silent no-op.
//                   The press is refused while a turn runs — never a silent interrupt (§3.2 red line ②).
//   rewindPlanOf    what goes: the target (the uuid the harness knows it by, or its turn id), the messages taken back
//                   (THE ids the view marks — index-stable, src/rewind-ops.js applyRewound), and how many prompts.
//   rewindAnswerOf  what the harness said, in ONE shape: ok + the words for the composer, or a named reason + whether
//                   the same press may be sent again.
// The row that says a harness HAS the door is src/backend-caps.js `checkpoints` (granularity 'message' | 'turn');
// nothing here reads a backend id.
//
// THE CLAUDE ANSWER (read from the installed 2.1.322 binary — nothing run): the control request
// `rewind_conversation {target_message_uuid, last_seen_user_message_uuid}` answers
//   {rewound:true,  targetMessageUuid, prefillText, precedingAssistantUuid, resolution?}            — done
//   {rewound:false, prefillText:null, precedingAssistantUuid:null, error:<text>, reason, isolation_latch?} — refused
// with `reason` one of the 13 below; the binary's own table says which may be sent again (CLAUDE_REWIND_REASONS.retry).
// `last_seen_user_message_uuid` is the newest of the person's messages THIS page shows: the CLI refuses
// (`unseen_later_turn`) when it holds a later one the person has not seen, so a press never cuts what nobody read.
//
// PURE: imports only src/rewind-cut.js (PURE → PURE: the person rule, the cut and the request prefix — the part the
// normalizer, and so the device agent, carries); touches no I/O.

const { REWIND_REQUEST_PREFIX, REWIND_LIFE_MS, isPersonPrompt, startsATurn, cutOf } = require('./rewind-cut.js');

// Our refusal reasons, each with its CLASS — the page words a class (busy: after the turn; resume: start the
// conversation first; cannot: this point cannot be taken back; moved: the conversation changed under the press).
const REWIND_REFUSALS = Object.freeze({
  'not-offered': 'cannot',     // the harness row has no conversation rewind
  'not-a-point': 'cannot',     // not one of the person's own turn-starting messages (a notice, an agent card, a mid-turn steer)
  'already-rewound': 'cannot', // it was taken back already
  'no-target-id': 'cannot',    // the harness does not know this message by an id we hold (no uuid / no turn id yet)
  'target-not-found': 'moved', // the page's message is not in the conversation the server holds
  'stopped': 'resume',         // the conversation is not running — nothing to send the request to (never auto-started)
  'turn-running': 'busy',      // a turn runs — stop it first (never a silent interrupt)
  'queued': 'busy',            // messages wait in the queue — they would run against a conversation that is no longer there
  'compacting': 'busy',        // a compaction rewrites the history while it runs
  'pending': 'busy',           // a rewind of this conversation is out and not answered yet — one at a time
  'pending-long': 'busy',      // …for over a minute (a local CLI never expires it): wait, or stop the conversation to rewind again
  'rebuilding': 'busy',        // the server is rebuilding this conversation's history — its array is not whole yet
  'page-behind': 'moved',      // the page that pressed has not seen the conversation's newest message
  'not-the-person': 'cannot',  // only the person's own press (a conversation, a job or an automation key never rewinds)
  'changed-since': 'moved',    // the conversation changed between the confirm's words and the press
});
// The door's own reasons (the server's, the plan's) — never a verdict over one message
const DOOR_REASONS = Object.freeze(['target-not-found', 'pending', 'pending-long', 'rebuilding', 'page-behind', 'not-the-person', 'changed-since']);

// The 13 refusal reasons of 2.1.322's rewind_conversation (its `jv` table), with the binary's own «may be sent again»
// (its `Kv` table) and our class. A reason missing here is answered as 'cli-other' with the CLI's own text — never
// dropped.
const CLAUDE_REWIND_REASONS = Object.freeze({
  commands_queued: { cls: 'busy', retry: true },
  prompt_pending: { cls: 'busy', retry: false },
  turn_running: { cls: 'busy', retry: true },
  target_not_found: { cls: 'moved', retry: true },
  stale_target: { cls: 'moved', retry: false },
  unseen_later_turn: { cls: 'moved', retry: false },
  poll_tool_result_target: { cls: 'cannot', retry: false },
  target_splits_tool_call: { cls: 'cannot', retry: false },
  delivered_poll_events_in_range: { cls: 'cannot', retry: false },
  persist_failed: { cls: 'failed', retry: true },
  state_changed: { cls: 'moved', retry: true },
  usage_limited: { cls: 'limit', retry: false },
  expired: { cls: 'failed', retry: true },
});
const ANSWER_CLASSES = Object.freeze(['busy', 'resume', 'cannot', 'moved', 'failed', 'limit', 'other']);

const GRANULARITIES = Object.freeze(['message', 'turn']);
const hasDoor = (cp) => !!(cp && cp.conversation === true && GRANULARITIES.includes(cp.granularity));

/** The harness's own id for the target: the CLI's record uuid ('message') or the harness turn the message starts
 *  ('turn'). null ⇒ the harness cannot be asked about this message. */
function targetIdOf(checkpoints, msg) {
  if (!msg || !checkpoints) return null;
  if (checkpoints.granularity === 'message') return typeof msg.uuid === 'string' && msg.uuid ? msg.uuid : null;
  if (checkpoints.granularity === 'turn') return typeof msg.turnId === 'string' && msg.turnId ? msg.turnId : null;
  return null;
}

/** THE VERDICT — the first reason that holds, in this order (what the person can do nothing about first, then what
 *  they can: resume, wait). `state` = { live, turnRunning, queued, compacting } as the server (or the page's mirror)
 *  knows them. */
function rewindVerdict(checkpoints, msg, state = {}) {
  const no = (reason) => ({ ok: false, reason, cls: REWIND_REFUSALS[reason] });
  if (!hasDoor(checkpoints)) return no('not-offered');
  if (msg && msg.rewound) return no('already-rewound');
  if (!isPersonPrompt(msg)) return no('not-a-point');
  if (!targetIdOf(checkpoints, msg)) return no('no-target-id');
  if (!state.live) return no('stopped');
  if (state.turnRunning) return no('turn-running');
  if (state.compacting) return no('compacting');
  if (state.queued) return no('queued');
  return { ok: true, reason: null, cls: null };
}

/** The message fields a rewind POINT is judged on (isPersonPrompt + targetIdOf): an edit to any of them re-asks the
 *  page's button (test-checkpoints holds the list to the two readers). */
const POINT_FIELDS = Object.freeze(['role', 'id', 'uuid', 'turnId', 'batchOf', 'noticeKind', 'rewound', 'originKind', 'synthetic', 'afloat', 'midTurn', 'startsTurn']);

/** Does the page draw the door on this message? The verdict's STATIC half: the harness has the door and the message is
 *  a point the harness knows — a button that is drawn may still be refused (stopped / busy), and says why. */
function rewindPointOf(checkpoints, msg) {
  return hasDoor(checkpoints) && isPersonPrompt(msg) && !!targetIdOf(checkpoints, msg);
}

/** THE PLAN — what the press takes back, over the conversation's message array as the server holds it.
 *  ids = every live (not yet rewound) message from the target on: the target itself and all after it (the cut is
 *  BEFORE the target — its words go back to the composer). prompts = how many of the person's messages go (the
 *  confirm says it). lastSeenUuid = the newest person's message's uuid ('message' granularity; see the header).
 *  `state` goes to the verdict UNCHANGED — a caller that states no `live` is refused `stopped` (fail closed: the plan
 *  never says yes where the verdict says no). */
function rewindPlanOf(checkpoints, messages, targetId, state = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const at = list.findIndex((m) => m && m.id === targetId);
  const target = at >= 0 ? list[at] : null;
  if (!target) return { ok: false, reason: 'target-not-found', cls: REWIND_REFUSALS['target-not-found'] };
  const v = rewindVerdict(checkpoints, target, state);
  if (!v.ok) return v;
  const ids = [];
  let prompts = 0, turns = 0;
  for (let i = at; i < list.length; i++) {
    const m = list[i];
    if (!m || m.rewound || m.noticeKind === 'rewound') continue;
    ids.push(m.id);
    if (isPersonPrompt(m)) prompts++;
    // EVERY turn that goes — the person's, and the ones somebody else opened (a task notification, a peer's message,
    // the auto-resume continue): the confirm says how many turns the agent forgets
    if (startsATurn(m)) turns++;
  }
  let lastSeenUuid = null;
  if (checkpoints.granularity === 'message') {
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m && m.role === 'user' && !m.rewound && !m.afloat && m.queueState !== 'removed' && m.queueState !== 'stopped'
        && typeof m.uuid === 'string' && m.uuid) { lastSeenUuid = m.uuid; break; }
    }
    // the PAGE names the newest message IT shows; the server's newer one means the press would cut what it never drew
    if (state.pageLastSeenUuid !== undefined && state.pageLastSeenUuid !== lastSeenUuid) return { ok: false, reason: 'page-behind', cls: REWIND_REFUSALS['page-behind'] };
  }
  return {
    ok: true, reason: null, cls: null,
    granularity: checkpoints.granularity,
    targetMsgId: target.id,
    targetId: targetIdOf(checkpoints, target),
    lastSeenUuid,
    ids, count: ids.length, prompts,
    turns,                                // what the confirm says goes: every turn from the target on (any opener)
    files: checkpoints.files === true,    // the row's files fact: tier one never rolls files back, and the confirm says so
    prefillText: textOf(target),
  };
}

/** The words of the person's message (what goes back to the composer when the harness gives none). */
function textOf(msg) {
  const c = msg && Array.isArray(msg.content) ? msg.content : [];
  return c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n\n');
}

/** THE HARNESS'S ANSWER in one shape. `granularity` names the road ('message' = the claude control response body,
 *  'turn' = a JSON-RPC reply {result} | {error}). An error the road itself returned (a control_response of subtype
 *  'error', an unknown request on an older CLI, a JSON-RPC error) is `cli-error` with its text — said, never dropped. */
function rewindAnswerOf(granularity, reply) {
  // no answer is never «send it again»: the CLI's one silent road (its process ending) releases the press as not resendable
  if (reply == null || typeof reply !== 'object') return { ok: false, reason: 'no-answer', cls: 'failed', retry: false, text: null, prefillText: null };
  if (granularity === 'message') {
    if (typeof reply.error === 'string' && reply.rewound === undefined) return { ok: false, reason: 'cli-error', cls: 'other', retry: false, text: reply.error, prefillText: null };
    if (reply.rewound === true) {
      return { ok: true, reason: null, cls: null, retry: false, text: null,
        prefillText: typeof reply.prefillText === 'string' ? reply.prefillText : null,
        // the CLI names the cut's own echo of the target (2.1.322: `targetMessageUuid: cut.echoUuid`) — the normalizer cuts
        // by it; one it does not hold is left to the transcript row (src/message-manager.js)
        targetUuid: typeof reply.targetMessageUuid === 'string' ? reply.targetMessageUuid : null };
    }
    const why = typeof reply.reason === 'string' ? reply.reason : null;
    const row = why && Object.prototype.hasOwnProperty.call(CLAUDE_REWIND_REASONS, why) ? CLAUDE_REWIND_REASONS[why] : null;
    // usage_limited may say the target is gone as well (2.1.322 `NL`: target_not_found:true) — kept, never dropped
    return { ok: false, reason: row ? why : 'cli-other', cliReason: why, cls: row ? row.cls : 'other', retry: row ? row.retry : false,
      text: typeof reply.error === 'string' ? reply.error : null, prefillText: null, ...(reply.target_not_found === true ? { targetNotFound: true } : {}) };
  }
  if (granularity === 'turn') {
    if (reply.error) {
      const text = typeof reply.error === 'string' ? reply.error : (typeof reply.error.message === 'string' ? reply.error.message : null);
      return { ok: false, reason: 'cli-error', cls: 'other', retry: false, text, prefillText: null };
    }
    if (reply.result !== undefined) return { ok: true, reason: null, cls: null, retry: false, text: null, prefillText: null };
    return { ok: false, reason: 'no-answer', cls: 'failed', retry: false, text: null, prefillText: null };
  }
  return { ok: false, reason: 'not-offered', cls: 'cannot', retry: false, text: null, prefillText: null };
}

module.exports = { REWIND_REFUSALS, DOOR_REASONS, CLAUDE_REWIND_REASONS, ANSWER_CLASSES, GRANULARITIES, REWIND_REQUEST_PREFIX, REWIND_LIFE_MS, POINT_FIELDS, targetIdOf, isPersonPrompt, rewindVerdict, rewindPointOf, rewindPlanOf, rewindAnswerOf, cutOf, textOf };
