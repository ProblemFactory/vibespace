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
 *   place (lane midturn-order — the owner, 2026-11-07: «你能不能确保chatview里的顺序就是事件的实际顺序»): WHERE the bubble is
 *   drawn — the chat's order is the order of events AS THE AGENT LIVED THEM, never the order the words were typed:
 *     'tail'      — the agent has not read it yet: it lives BELOW every card drawn since (the queue's own place) until its
 *                   fate is said;
 *     'next-turn' — the turn ended before the agent read it (kept) or it will never run (removed): it stays below that
 *                   turn's records — a Stop's interrupt rows included — until the next turn's first card;
 *     'here'      — read where it entered the turn (steered), or it started a turn of its own (stopped): it takes its place.
 *   No chip state at all (a fate that says it ran as a turn of its own) is 'here' (`placeOf`). src/message-window.js
 *   `_placeByChip` is the one reader.
 *
 * The channel binder's turn model (src/channel-touch.js `opensTurn`) derives its mid-turn set from THIS table — never a
 * hand list; test-channel-touch's census pins every state the renderer draws and every state a normalizer stamps to a
 * row here. PURE: imports nothing (CommonJS — the server, the bundle and the suites share it).
 */
const QUEUE_CHIPS = Object.freeze({
  queued: Object.freeze({ inTurn: true, place: 'tail' }),        // waiting behind the running turn (clickable to steer where the harness allows)
  steered: Object.freeze({ inTurn: true, place: 'here' }),       // injected into the running turn (codex turn/steer; claude: it rode a tool result)
  removed: Object.freeze({ inTurn: true, place: 'next-turn' }),  // taken off the queue — it never ran
  handed: Object.freeze({ inTurn: true, place: 'tail' }),        // claude (lane claude-steer-inject): written to the running turn, read at its next tool call
  kept: Object.freeze({ inTurn: true, place: 'next-turn' }),     // claude: Stop came before the agent read it — it rides the NEXT message (its turn opens at that delivery)
  stopped: Object.freeze({ inTurn: false, place: 'here' }),      // codex (lane codex-interrupted-putback): it had STARTED its own turn when Stop cut it off
});
/** Every chip state, in the table's order. */
const QUEUE_STATES = Object.freeze(Object.keys(QUEUE_CHIPS));
/** The states that mean «inside the running turn» — derived. */
const IN_TURN_STATES = Object.freeze(QUEUE_STATES.filter((s) => QUEUE_CHIPS[s].inTurn));
/** Where a bubble wearing `state` is drawn ('tail' | 'next-turn' | 'here' — the table's `place`); no state = 'here'. */
const placeOf = (state) => (state && QUEUE_CHIPS[state] ? QUEUE_CHIPS[state].place : 'here');
/** THE MOVE, SEEN FROM A WINDOW (lane midturn-order): a view holds the cards [start, end) of the list; ONE card moved from
 *  index `from` to index `to` (`to` counted after the move — src/message-window.js `_moveBefore`'s op, which carries the
 *  card itself). → `{kind, start, end, at}` — the window's bounds AFTER the move, and `at` = the card's place inside it:
 *    'in-place' — both inside: the view moves the element (`at` = to − start);
 *    'leave'    — it was inside and left: the view drops it, the window keeps the rest (r2 F4: never a re-read);
 *    'enter'    — it came in from outside: the view draws the card the op carries at `at`;
 *    'none'     — both on the same side outside: nothing the view holds changed place;
 *    'shift+1' / 'shift-1' — it crossed the whole window (later → earlier / earlier → later): the same cards, each one
 *                 index later / earlier.
 *  A move never moves the reader: no case re-reads the slab. */
function moveVerdict({ from, to, start, end }) {
  const inFrom = from >= start && from < end, inTo = to >= start && to < end;
  if (inFrom && inTo) return { kind: 'in-place', start, end, at: to - start };
  if (inFrom) return to >= end ? { kind: 'leave', start, end: end - 1 } : { kind: 'leave', start: start + 1, end };
  if (inTo) return from < start ? { kind: 'enter', start: start - 1, end, at: to - (start - 1) } : { kind: 'enter', start, end: end + 1, at: to - start };
  if (from >= end && to < start) return { kind: 'shift+1', start: start + 1, end: end + 1 };
  if (from < start && to >= end) return { kind: 'shift-1', start: start - 1, end: end - 1 };
  return { kind: 'none', start, end };
}
/** Where an index of the list lands after ONE card moved from → to (the minimap's markers follow their cards, r2 F3). */
const movedIndex = (i, from, to) => (i === from ? to : to < from ? (i >= to && i < from ? i + 1 : i) : (i > from && i <= to ? i - 1 : i));

module.exports = { QUEUE_CHIPS, QUEUE_STATES, IN_TURN_STATES, placeOf, moveVerdict, movedIndex };
