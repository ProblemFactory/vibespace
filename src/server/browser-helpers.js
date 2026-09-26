'use strict';
/**
 * HELPER NAMES BY WITNESS — ORCH, the thin half (docs/design-browser-multiview.zh.md
 * §4 B-89d0). The PURE state machine is src/browser-stream.js `bindHelpers`;
 * this module only feeds it the three events it knows, from the two places
 * that see them, and keeps the state ON THE LIVE SESSION (`_browserHelpers`,
 * in memory: a name is a statement about a running conversation — after a
 * restart every helper reads "Helper N" until a new witness arrives):
 *   · the claude stdout consumer (src/server/stdout/claude-stream-json.js) —
 *     a parent-line Task tool_use (its description names the helper), a
 *     sidechain Bash tool_use running `vibespace-browser new-child` (a witness
 *     window OPENS) and that call's tool_result (it CLOSES and is judged —
 *     lane P verify: paired at the close, never by order)
 *     (`observe`, both the stream-json branch and the sub-agent JSONL watcher);
 *   · the `new-child` agent route (src/routes/browser.js) — the keeper minted
 *     a handle for this conversation (`noteChild`).
 * A codex session never produces a witness ⇒ its helpers are numbered. Never
 * by time: see bindHelpers.
 */
const S = require('../browser-stream.js');

/** Feed one stdout record (parent line or sidechain) into the session's witness state. Never throws. */
function observe(session, msg, parentToolUseId = null) {
  if (!session || !msg || typeof msg !== 'object') return;
  try {
    const events = [];
    for (const t of S.taskOpeningsOf(msg)) events.push({ kind: 'task', ...t });
    if (parentToolUseId || msg.parent_tool_use_id) {
      for (const w of S.newChildWitnessesOf(msg, parentToolUseId)) events.push({ kind: 'witness', ...w });
      // lane P verify (finding 4): the witness's tool_result CLOSES its window — only ids that ARE open witnesses
      // (every other sidechain tool_result is none of this module's business and never copies the state)
      const openIds = new Set(((session._browserHelpers && session._browserHelpers.witnesses) || []).filter((w) => w && w.open).map((w) => w.id));
      if (openIds.size) for (const c of S.witnessClosesOf(msg, parentToolUseId)) if (openIds.has(c.id)) events.push({ kind: 'witness-close', ...c });
    }
    if (!events.length) return;
    let st = session._browserHelpers || null;
    for (const ev of events) st = S.bindHelpers(st, ev);
    session._browserHelpers = st;
  } catch (e) { console.warn('[browser] helper witness not recorded — ' + (e && e.message)); }
}
/** The keeper minted `handle` for this session's conversation. */
function noteChild(session, handle) {
  if (!session) return;
  try { session._browserHelpers = S.bindHelpers(session._browserHelpers || null, { kind: 'child', handle }); }
  catch (e) { console.warn('[browser] helper child not recorded — ' + (e && e.message)); }
}
/** handle → the helper's witnessed name (only paired ones). */
function namesOf(session) { return S.helperNames(session && session._browserHelpers); }

module.exports = { observe, noteChild, namesOf };
