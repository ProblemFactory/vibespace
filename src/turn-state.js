'use strict';
// PURE authoritative-turn-state rules (docs/design-harness-features.md §2.5 +
// §3.5, caps row `turnState`).
//
// "Is a turn running right now" backs the Stop button, auto-resume's
// "it is already working" skip, the attach payload's isStreaming and the card
// chips — and until now every one of them read a flag we INFERRED from record
// shapes (a `result` ends the turn; a `user` record starts one). Claude Code
// 2.1.257 publishes the fact itself:
//
//   {type:'system', subtype:'session_state_changed',
//    state:'idle'|'running'|'requires_action', uuid, session_id}
//
// whose own describe reads: "'idle' fires after heldBackResult flushes and the
// bg-agent do-while exits — authoritative turn-over signal". It is emitted ONLY
// when CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS is in the CLI's environment
// (src/adapters/claude-code.js sets it on every chat spawn), so every session
// that predates that — and every older CLI — silently keeps the derived path.
//
// THAT IT REACHES US IS ALSO DUMPED, not assumed: the emit is
// `mu({type:"system",subtype:"session_state_changed",state:e})`, and
// `function mu(e){jr().enqueue(e)}` is the SAME helper that emits
// `system/task_notification` — a record this product has consumed on stdout
// for releases. So it rides the stdout SDK queue, not some TUI-only sink.
//
// The decisions live here, PURE, because they are made in TWO places that must
// never disagree: the live consumer (src/server/stdout/claude-stream-json.js)
// and the attach reconciliation (src/ws-handler.js). A twin between those two
// is exactly the class of bug 2.339.2 and 2.369.16 came out of.

const TURN_STATES = ['idle', 'running', 'requires_action'];

/** Is this a state the protocol defines? Anything else is NOT coerced — an
 *  unknown state must leave our belief untouched rather than be read as idle. */
function isTurnState(v) { return TURN_STATES.includes(v); }

/** What an observed state MEANS for the session.
 *  `streaming` — a turn is in flight. 'requires_action' counts: the turn is
 *      PAUSED on the user, not over, and treating it as over would let
 *      auto-resume inject into a session that is waiting for a human.
 *  `label` — the spinner text, or null for "leave the derived label alone"
 *      (a 'running' state says nothing about WHICH tool is running; the
 *      assistant records still own that). '' clears it.
 *  Unknown state ⇒ null: the caller must ignore the record entirely.
 *
 *  THE RULE THIS FUNCTION OBEYS (round 8, after a reproduced defect): a turn
 *  state may only write a spinner line that stays TRUE for the rest of the
 *  turn. Look at what the wire gives us — `{state:'running'}` and nothing
 *  else; it does not name the tool that is now executing, so there is no
 *  record that can RETRACT a line whose truth ended when the state changed.
 *  'requires_action' therefore writes NO line at all (the round-7 shape wrote
 *  'waiting for you', and the very next `running` record — whose whole job is
 *  "leave the derived label alone" — then preserved it for the entire tool
 *  run, contradicting the chip that had already flipped back). Its voice is
 *  the status-bar chip, per kb-features §Turn truth: "`idle` and `running`
 *  draw nothing … one fact must not have two voices" — and the same sentence
 *  cuts the other way here, because the chip already says this one.
 *  What is left is exactly the two writes that cannot go stale: '' on idle
 *  (a retirement) and 'thinking...' onto an EMPTY line, which stays true until
 *  a record that names something better replaces it. */
function turnStateEffect(state, { hasLabel = false } = {}) {
  if (!isTurnState(state)) return null;
  if (state === 'idle') return { streaming: false, label: '' };
  if (state === 'requires_action') return { streaming: true, label: null };
  return { streaming: true, label: hasLabel ? null : 'thinking...' };
}

// How long the wrapper sidecar must have disagreed before it is allowed to
// override the harness's own word. The derived path uses 3s (2.339.2: enough to
// rule out a mid-pipeline race). Under authority it is 30s — long enough that
// no heldBackResult flush or background-agent tail can be mistaken for a stall,
// because the whole point of the new signal is that 'idle' comes LATER than the
// result record we used to end turns on.
const SIDECAR_SETTLE_MS = 3000;
const AUTHORITATIVE_SETTLE_MS = 30000;

/** THE attach-time reconciliation, one decision for both paths.
 *  @param turnStateSeen  has THIS session ever published a turn state?
 *  @param turnState      the last one it published
 *  @param isStreaming    what the server currently believes
 *  @param sidecar        {streaming, ageMs} from the wrapper's own file, or
 *                        null when it could not be read (remote sessions, a
 *                        missing sidecar) — null NEVER heals anything.
 *  @returns {{isStreaming:boolean, clearLabel:boolean, action:string, staleAuthority:boolean}}
 *    action: 'none' | 'authoritative' | 'sidecar-heal'
 *    staleAuthority: the harness said running, the wrapper has said otherwise
 *      for longer than the settle window ⇒ an `idle` record was lost. The
 *      caller heals AND says so (telemetry) — a silent override would hide the
 *      one failure mode this signal introduces. */
function reconcileAttachStreaming({ turnStateSeen = false, turnState = null, isStreaming = false, sidecar = null } = {}) {
  const out = { isStreaming: !!isStreaming, clearLabel: false, action: 'none', staleAuthority: false };
  if (turnStateSeen && isTurnState(turnState)) {
    const live = turnState !== 'idle';
    if (out.isStreaming !== live) {
      out.isStreaming = live;
      out.clearLabel = !live;
      out.action = 'authoritative';
    }
  }
  // The sidecar backstop runs AFTER, and only in one direction (running →
  // ended). It can never start a turn: the wrapper writing streaming:true is
  // not evidence that the CURRENT turn is still alive.
  if (out.isStreaming && sidecar && sidecar.streaming === false) {
    const settle = turnStateSeen ? AUTHORITATIVE_SETTLE_MS : SIDECAR_SETTLE_MS;
    if (Number(sidecar.ageMs) > settle) {
      out.isStreaming = false;
      out.clearLabel = true;
      out.action = 'sidecar-heal';
      out.staleAuthority = !!turnStateSeen;
    }
  }
  return out;
}

// ── THE PARKED TURN (lane parked-ask-stall, 2.369.229 — D-docusign, inc-muxrol54-uv2d) ──
// MEASURED on a fleet pod: a claude turn parked on a `can_use_tool` ask (a Bash
// call bypassPermissions did not cover) for 22 h. After the server restarted,
// the restored session knew `streaming:true` from the wrapper sidecar and
// NOTHING else — `_turnStateSeen` starts false on a restore — so the attach
// said "thinking", and the client's delivery-stall watchdog, reading
// `_isStreaming` alone, forced a re-attach every 5 min for 8 hours (74 slab
// re-sends on a starved pod). Zero inbound is EXPECTED from a turn that waits
// on the user; and a watchdog that acts must be bounded and say so.

/** The harness's last turn state ON RECORD in the wrapper's record ring (the
 *  .buf text, or its parsed records) — null when the ring holds none (an old
 *  CLI, a ring rotated past it). The sidecar's `streaming` is NOT the truth of
 *  a parked turn; the ring is: the CLI wrote `requires_action` and nothing
 *  since moved it (a later `control_response` of ANOTHER id — our own
 *  apply_flag_settings push after the restart — is not an answer). */
function turnStateInRing(ring) {
  const rows = Array.isArray(ring) ? ring : String(ring || '').split('\n');
  for (let i = rows.length - 1; i >= 0; i--) {
    let r = rows[i];
    if (typeof r === 'string') {
      if (!r.includes('session_state_changed')) continue;
      try { r = JSON.parse(r); } catch { continue; }
    }
    if (r && r.type === 'system' && r.subtype === 'session_state_changed' && isTurnState(r.state)) return r.state;
  }
  return null;
}

/** A RESTORED session's turn-state fields (boot-restore): the ring's last word
 *  latches the authority exactly as the live record would have — so the attach
 *  reconciliation, the session list's turn fact ('waiting') and the client's
 *  chip all read `requires_action` instead of a bare sidecar `streaming`. */
function restoredTurnState(ring) {
  const st = turnStateInRing(ring);
  return st ? { _turnStateSeen: true, _turnState: st } : {};
}
/** B-ba09 — A RESTORED SESSION'S STREAMING FLAG IS THE CLI'S LAST WORD: when the ring holds a state word, the flag is ITS effect
 *  (turnStateEffect — the one function the live parse and the attach reconcile read); the wrapper sidecar's `streaming` only for a CLI
 *  that never says one. The sidecar is DERIVED: true at any user record that is no `<local-command-` echo, false only at a result or a
 *  compact boundary — after the last result a `/compact` command echo or the compaction summary leaves it TRUE while the CLI says idle;
 *  seeded beside the ring's idle (the release), the restored conversation looked streaming until an attach reconciled it, and its stop
 *  (and a pool move deferred to it) waited for someone to open the window. → {_isStreaming, _turnStateSeen?, _turnState?} */
function restoredStreaming(ring, sidecarStreaming) {
  const st = turnStateInRing(ring);
  if (!st) return { _isStreaming: !!sidecarStreaming };
  const eff = turnStateEffect(st);
  return { _turnStateSeen: true, _turnState: st, _isStreaming: !!(eff && eff.streaming) };
}

/** Is the turn WAITING ON THE USER? The harness said `requires_action`, or an
 *  ask the user can answer is open here (a permission card, AskUserQuestion, a
 *  helper's ask — each one an unanswered control_request on record). */
function waitingOnUser({ turnState = null, pendingAsks = 0 } = {}) {
  const n = Array.isArray(pendingAsks) ? pendingAsks.length : (Number(pendingAsks) || 0);
  return turnState === 'requires_action' || n > 0;
}

const STALL_SILENCE_MS = 120000;   // true silence this long mid-turn is abnormal (tool runs emit tool_progress)
const STALL_COOLDOWN_MS = 300000;  // at most one forced re-attach per 5 min per view
const STALL_MAX_REATTACH = 3;      // then it stops, says so ONCE, and waits for a record to re-arm it

/** THE DELIVERY-STALL VERDICT (src/lib/chat-view.js's watchdog, 2.322.0) — one
 *  tick's decision:
 *    'none'          nothing to do (no turn, not silent long enough, cooling down)
 *    'hold'          zero inbound is EXPECTED (the turn waits on the user), or
 *                    the watchdog already gave up — no re-attach, nothing said
 *    'reattach'      force a re-attach (counts toward the bound)
 *    'give-up-once'  N forced re-attaches brought nothing: stop, and say so in
 *                    the chat — once; a record arriving re-arms (forcedCount 0)
 *  @param inboundAgoMs    since the last inbound for this session (or the turn's start)
 *  @param sinceReattachMs since this view last forced one
 *  @param forcedCount     forced re-attaches since the last record arrived
 *  @param gaveUp          the give-up note is already in the chat */
function stallVerdict({ streaming = false, turnState = null, pendingAsks = 0, inboundAgoMs = 0, sinceReattachMs = Infinity, forcedCount = 0, gaveUp = false } = {}) {
  if (!streaming) return 'none';
  if (waitingOnUser({ turnState, pendingAsks })) return 'hold';
  if (!(Number(inboundAgoMs) >= STALL_SILENCE_MS)) return 'none';
  if (Number(sinceReattachMs) < STALL_COOLDOWN_MS) return 'none';
  if ((Number(forcedCount) || 0) >= STALL_MAX_REATTACH) return gaveUp ? 'hold' : 'give-up-once';
  return 'reattach';
}

/** IS A REQUEST IN FLIGHT (lane cache-warmth-tiles round 3) — the turn is RUNNING: the harness said 'running', or
 *  `_isStreaming` while the harness has not said the turn is PAUSED on the user. A turn in 'requires_action' (a
 *  permission, a question waiting on the owner) is still a turn, but no request is out: its prompt cache ages like an
 *  idle one's. The prompt-cache facts read it (usage-pool-engine cacheFactsOf); "is a turn running" for every other
 *  reader stays turnStateEffect's `streaming`. */
function requestInFlight({ isStreaming, turnState } = {}) {
  return turnState === 'running' || (isStreaming === true && turnState !== 'requires_action');
}
/** THE INSTANT A REQUEST WENT OUT — `session._turnStartedAt`, written ONLY by the two writers below (round 3; round 4:
 *  the flight instant is EVERY request's send, never only the turn's first — a follow-up request after a 70-min tool is a
 *  fresh send). A restore never carries it: a restored conversation is not in flight until the stream says so.
 *  · noteTurnFlight — the FLAG-CHANGE writer, called right after a write of the turn flags that sends nothing by itself
 *    (the claude parse's result / turn state, the attach reconciliation, the exit road, a send made while a request is
 *    already out): entering flight stamps `now`
 *    when unset (a 'running' after a pause: the pause cleared it); leaving flight (a pause on the owner, the turn's end)
 *    clears it.
 *  · noteRequestSent — the REQUEST-OUT writer, called at each moment a request goes out (the send that STARTS one —
 *    user-input's when none was in flight before it (round 5: a steer or a dispatch mid-turn sends nothing, the wrapper
 *    holds it and a steer rides the next tool result), auto-resume's continue —, a 'running' that is new, a main-thread user record: the prompt's echo or a TOOL RESULT,
 *    at BOTH feeds — the parse and the device stream's claudeSideEffects — unless the record is a backlog's): in flight ⇒
 *    `now`, whatever was there; otherwise cleared, as the flag writer would. */
function noteTurnFlight(session, now) {
  if (!session) return;
  if (!requestInFlight({ isStreaming: session._isStreaming, turnState: session._turnState })) session._turnStartedAt = null;
  else if (!(Number(session._turnStartedAt) > 0)) session._turnStartedAt = Number(now) || null;
}
function noteRequestSent(session, now) {
  if (!session) return;
  const inFlight = requestInFlight({ isStreaming: session._isStreaming, turnState: session._turnState });
  session._turnStartedAt = inFlight ? (Number(now) || null) : null;
  // THE REQUEST'S INSTANT, KEPT (lane readings-attribution-2 P1): `_turnStartedAt` dies with the flight, this does not — a
  // reading that trails its request (after the result, after the stop) still names the request it answers, and the engine
  // reads the account that request went out on off the conversation's own re-point ledger (usage-pool-engine requestSlotFor)
  if (inFlight && Number(now) > 0) session._lastRequestOutAt = Number(now);
}
/** A SUB-AGENT'S REQUEST-OUT (lane readings-attribution-2, the closure look M1): a sub-agent's tool result sends ITS next request
 *  on the credential the CLI reads at that moment, as the main thread's does (P0) — so the request's instant is kept, and only
 *  that: `_turnStartedAt` is the conversation's own prompt cache, which a sub-agent's prefix is not. */
function noteSubRequestSent(session, now) {
  if (!session) return;
  if (requestInFlight({ isStreaming: session._isStreaming, turnState: session._turnState }) && Number(now) > 0) session._lastRequestOutAt = Number(now);
}
/** A SUB-AGENT's user record that sends a request (its prompt or a tool result): sendsRequest's sidechain twin */
function sendsSubRequest(msg) {
  if (!msg || msg.type !== 'user' || !(msg.parent_tool_use_id || msg.isSidechain)) return false;
  return sendsRequest({ ...msg, parent_tool_use_id: null, isSidechain: false });
}
/** A RECORD THAT SENDS A REQUEST — a main-thread user record that is no local-command echo («<local-command-stdout>Set
 *  model to …» has no turn behind it): the prompt's echo or a tool result, which the CLI sends to the model at once. The
 *  ONE predicate the parse's turn-start branch and the device feed both read. */
function sendsRequest(msg) {
  if (!msg || msg.type !== 'user' || msg.parent_tool_use_id || msg.isSidechain) return false;
  const c = msg.message && msg.message.content;
  const text = typeof c === 'string' ? c : (Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('') : '');
  return !/^<local-command-/.test(text.trim());
}
// the CLI's reply to a LOCAL command, by its envelope: its KIND only (a send it ends, a record's kind) — never its words (the /model echo's one reader is src/model-echo.js)
const LOCAL_REPLY = /^<local-command-stdout>/;
/** The CLI's ANSWER THAT IS NO TURN, by what was measured (2.1.321 on stdout, scripts/fixtures/claude-cli/2.1.321-typed-model.jsonl):
 *  a main-thread `result` with num_turns 0 (a TYPED local command — /model, /cost … — is answered by an init, a `<synthetic>`
 *  assistant record and that result: no request), or a main-thread `<local-command-stdout>` user record (the answer to a set_model
 *  the hub writes; the recorded /compact reply). */
function noTurnReply(msg) {
  if (!msg || msg.parent_tool_use_id || msg.isSidechain) return false;
  if (msg.type === 'result') return msg.num_turns === 0;
  return msg.type === 'user' && LOCAL_REPLY.test(userTextOf(msg));
}
/** A SEND OF THE PERSON'S THAT IS ITSELF A LOCAL COMMAND («/cost», «/model x», «/compact») — src/server/user-input.js stamps it at
 *  every send (`session._lastSendLocal`); the parse clears it at every state word and at every no-turn answer. */
function localCommandText(text) { return typeof text === 'string' && /^\/[A-Za-z][\w:.-]*(?:\s|$)/.test(text.trim()); }
/** r1282 (2): THE STOP AT A NO-TURN ANSWER, narrow. A pool move deferred while a send held the flag up (a compaction that says no
 *  running word holds it one to two minutes) is decided AT the answer — only when the person's LAST send was itself a local command:
 *  no prompt waits behind the answer. THE TWIN'S BLINK forces nothing: a locked conversation whose served model drifted is re-pinned
 *  at the turn's result (set_model), and that answer can land after the person's next prompt — the flag blinks down until the
 *  prompt's running word (harmless), and the last send was the prompt, so no stop; the same for «/cost» then a prompt. */
function stopsAtLocalReply(session) { return !!session && session._lastSendLocal === true; }
const userTextOf = (msg) => { const c = msg && msg.message && msg.message.content; return (typeof c === 'string' ? c : (Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('') : '')).trim(); };
/** B-ba09 (B) — A SEND THE CLI ANSWERED WITHOUT A TURN ENDS AT ITS ANSWER. A send raises the flag at once (src/server/user-input.js:
 *  the request goes out now); under authority only the CLI's state word lowers it — but a LOCAL command is answered by the CLI itself
 *  (noTurnReply) with NO state word seen (it never left idle), so the flag stood up until an attach reconciled it, and a pool move
 *  deferred to the conversation's stop waited for that attach. Fires ONLY on what was observed: authority, the CLI's last word idle,
 *  the flag up, a no-turn answer — and the parse asks the late rule first (a backlog's answer, a dead bridge's heal draining after a
 *  new send, ends nothing). A CLI that says `running` for such a command is not idle when the answer comes: this never fires. */
function sendEndsAtLocalReply(session, msg) {
  if (!session || session._turnStateSeen !== true || session._turnState !== 'idle' || session._isStreaming !== true) return false;
  return noTurnReply(msg);
}
/** B-ba09 (C) — THE RECORDER: a record's KIND, never its content (no text, no name, no id). Its words are of a CLOSED SHAPE, not a
 *  closed set: a new type or subtype of the CLI's own envelope prints by its name (lowercase and `_`, forty characters at most), so
 *  the attach reconcile's journal line can say which three records stood before a flag it had to correct: the next such hub
 *  journal is proof, not a digest. */
const KIND_WORD = /^[a-z_]{1,40}$/;
const kindWord = (v) => (typeof v === 'string' && KIND_WORD.test(v) ? v : 'other');
function recordKind(msg) {
  if (!msg || typeof msg !== 'object') return 'other';
  const sub = msg.parent_tool_use_id || msg.isSidechain ? 'sub:' : '', type = kindWord(msg.type);
  if (type === 'system') return `${sub}system/${kindWord(msg.subtype)}${msg.subtype === 'session_state_changed' && isTurnState(msg.state) ? ':' + msg.state : ''}`;
  if (type === 'result') return `${sub}result${msg.subtype ? '/' + kindWord(msg.subtype) : ''}${msg.num_turns === 0 ? ':no_turn' : ''}`;
  if (type !== 'user') return sub + type;
  const c = msg.message && msg.message.content, text = userTextOf(msg);
  if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) return sub + 'user/tool-result';
  if (LOCAL_REPLY.test(text)) return sub + 'user/local-reply';
  if (/^<local-command-/.test(text)) return sub + 'user/local-note';
  if (/^<command-name>/.test(text)) return sub + 'user/command';
  if (msg.isCompactSummary) return sub + 'user/compact-summary';
  return sub + (msg.isMeta ? 'user/meta' : 'user/prompt');
}
const KINDS_KEPT = 3;
/** the parse's ONE writer of `session._lastKinds` (every parsed record, in order; the last KINDS_KEPT kept) */
function noteRecordKind(session, msg) {
  if (!session) return;
  const k = Array.isArray(session._lastKinds) ? session._lastKinds : (session._lastKinds = []);
  k.push(recordKind(msg));
  if (k.length > KINDS_KEPT) k.splice(0, k.length - KINDS_KEPT);
}
/** the attach reconcile's ONE journal line (src/ws-handler.js): what it corrected, and the kinds of the records before it */
function reconciledSay(sessionId, rec, turnState, kinds) {
  const last = Array.isArray(kinds) && kinds.length ? kinds.map(kindWordOrKind).join(', ') : 'none seen by this process';
  return `[session] ${sessionId}: streaming reconciled (${rec.action}${rec.staleAuthority ? `, the harness last said ${turnState}` : ''}) \u2192 ${rec.isStreaming} \u00b7 the last records: ${last}`;
}
const kindWordOrKind = (k) => (typeof k === 'string' && /^(?:sub:)?[a-z_]{1,40}(?:\/[a-z_-]{1,40})?(?::[a-z_]{1,20})?$/.test(k) ? k : 'other');

module.exports = { TURN_STATES, isTurnState, turnStateEffect, reconcileAttachStreaming, SIDECAR_SETTLE_MS, AUTHORITATIVE_SETTLE_MS,
  turnStateInRing, restoredTurnState, restoredStreaming, waitingOnUser, stallVerdict, STALL_SILENCE_MS, STALL_COOLDOWN_MS, STALL_MAX_REATTACH,
  requestInFlight, noteTurnFlight, noteRequestSent, sendsRequest, noteSubRequestSent, sendsSubRequest,
  sendEndsAtLocalReply, noTurnReply, localCommandText, stopsAtLocalReply, recordKind, noteRecordKind, reconciledSay, KINDS_KEPT };
