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

module.exports = { TURN_STATES, isTurnState, turnStateEffect, reconcileAttachStreaming, SIDECAR_SETTLE_MS, AUTHORITATIVE_SETTLE_MS,
  turnStateInRing, restoredTurnState, waitingOnUser, stallVerdict, STALL_SILENCE_MS, STALL_COOLDOWN_MS, STALL_MAX_REATTACH };
