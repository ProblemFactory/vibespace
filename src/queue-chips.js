'use strict';
/**
 * THE QUEUE CHIP TABLE (lane touch-chip-cause r3) — one row per state a user bubble's queue chip can say. The harness
 * contract: a wrapper / normalizer stamps `queueState` (claude's wrapper queue, codex's and acp's queue strip, the
 * hand-over witness), chat-renderers `applyQueueChip` draws it — and every row says what the state MEANS for the
 * conversation's TURN:
 *
 *   inTurn: true  — the message waits inside the RUNNING turn, was handed or steered into it, or never ran: it is never
 *                   a turn's start where it was typed. A message that later opens a turn of its own opens it at its
 *                   DELIVERY (the next turn's first record), never at the bubble (the owner's ruling, acceptance r3:
 *                   «a message waiting in ANY chip state is inside the running turn»).
 *   inTurn: false — the message started a turn of its own.
 *
 * The channel binder's turn model (src/channel-touch.js `opensTurn`) derives its mid-turn set from THIS table — never a
 * hand list; test-channel-touch's census pins every state the renderer draws and every state a normalizer stamps to a
 * row here. PURE: imports nothing (CommonJS — the server, the bundle and the suites share it).
 */
const QUEUE_CHIPS = Object.freeze({
  queued: Object.freeze({ inTurn: true }),    // waiting behind the running turn (clickable to steer where the harness allows)
  steered: Object.freeze({ inTurn: true }),   // injected into the running turn (codex turn/steer; claude: it rode a tool result)
  removed: Object.freeze({ inTurn: true }),   // taken off the queue — it never ran
  handed: Object.freeze({ inTurn: true }),    // claude (lane claude-steer-inject): written to the running turn, read at its next tool call
  kept: Object.freeze({ inTurn: true }),      // claude: Stop came before the agent read it — it rides the NEXT message (its turn opens at that delivery)
  stopped: Object.freeze({ inTurn: false }),  // codex (lane codex-interrupted-putback): it had STARTED its own turn when Stop cut it off
});
/** Every chip state, in the table's order. */
const QUEUE_STATES = Object.freeze(Object.keys(QUEUE_CHIPS));
/** The states that mean «inside the running turn» — derived. */
const IN_TURN_STATES = Object.freeze(QUEUE_STATES.filter((s) => QUEUE_CHIPS[s].inTurn));

module.exports = { QUEUE_CHIPS, QUEUE_STATES, IN_TURN_STATES };
