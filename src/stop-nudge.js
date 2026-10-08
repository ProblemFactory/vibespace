'use strict';
// THE STOP NUDGE VERDICT (B-a8f0, owner YES 2026-10-02; lane stop-nudge-free).
// GET /api/agent/stop-check (src/agent-routes.js) answers the claude Stop hook
// and the codex wrapper's turn/completed; a `block` there is a REAL billed turn
// on the session's slot. Measured 2026-10-02: 250 of 329 unattended billed
// turns in 24 h were this nudge, most of them after a turn that HAD reported —
// the old rule read only the STATUS store's age, so a 40-minute turn that ran
// `vibespace-status working` at its start was asked again at its end, and
// `vibespace-task progress` / `vibespace-ask` counted for nothing.
// THE OWNER'S RULING: a turn that bookkept itself (status, task progress /
// backlog, ask — the routes stamp `s._bookkeptAt`) stops free, however long it
// ran. That rule is FIRST; the old time rule follows in its old order.
// The turn's start = the last person / machine input (`_userInputAt`,
// `_machineInputAt`). A session with neither (a restored session, a terminal
// turn the ws did not stamp) gets the old rule only — a missing fact is never a
// free pass, and its blocking verdict says so: `no-turn-start` (= `stale`, with
// the start unknown). PURE: imports nothing.

const MIN = 60 * 1000;
// the closed `why` set; BLOCKING = the two that answer block:true
const STOP_NUDGE_WHYS = Object.freeze(['bookkept-this-turn', 'cooldown', 'fresh-status', 'never-answered', 'stale', 'no-turn-start']);
const STOP_NUDGE_BLOCKING = Object.freeze(['stale', 'no-turn-start']);

const at = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

// The start of the turn that is stopping now: the later of the two input stamps, or null.
function turnStartOf(s) {
  const a = at(s && s._userInputAt), b = at(s && s._machineInputAt);
  return a == null && b == null ? null : Math.max(a || 0, b || 0);
}

// staleMin / cooldownMin / maxUnanswered arrive already clamped by the route (0 = that rule off).
function stopNudgeVerdict({ now, turnStartedAt, bookkeptAt, statusAt, lastNudgeAt, nudgesUnanswered, staleMin, cooldownMin, maxUnanswered } = {}) {
  const start = at(turnStartedAt), kept = at(bookkeptAt), status = at(statusAt), last = at(lastNudgeAt);
  if (start != null && kept != null && kept >= start) return { block: false, why: 'bookkept-this-turn' };
  if (cooldownMin > 0 && last != null && now - last < cooldownMin * MIN) return { block: false, why: 'cooldown' };
  if (staleMin > 0 && status != null && now - status < staleMin * MIN) return { block: false, why: 'fresh-status' };
  if (status == null && maxUnanswered > 0 && (Number(nudgesUnanswered) || 0) >= maxUnanswered) return { block: false, why: 'never-answered' };
  return { block: true, why: start == null ? 'no-turn-start' : 'stale' };
}

module.exports = { stopNudgeVerdict, turnStartOf, STOP_NUDGE_WHYS, STOP_NUDGE_BLOCKING };
