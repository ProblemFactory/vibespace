'use strict';
// THE BULK MARK'S WHOLE LIFE (B-cd4b unit 2's follow; the law since 主开发 r1093) — the ONE place the mark is read and consumed. A paced
// «Resume all» marks the conversation it creates (src/ws-create.js sets `_bulkRead`): BULK IS THE FIRST HISTORY READ ONLY.
// THE MARK IS CONSUMED AT THE DOORS, NEVER INSIDE A ROAD: every public entry of src/transcript-service.js that replies a conversation's
// history or its facts (every export is a door unless its NOT_DOORS names it, with the reason) and the socket's replies of a history
// (src/ws-handler.js: a chat attach, a terminal's attach, View History) call `replied` WHEN THEY REPLY — whatever served the reply:
// the local read, the hub's own copy, the paired machine, a fallback. A reply that FAILS (a throw, a refusal, the pager's bound, the
// asker gone before it) consumes nothing: the retry is still the first read. A person's own act consumes it too (`personAct`:
// person=1), and the conversation's end (the session object goes with it). Every later read is a person's. A census holds every call
// site and every export (scripts/test-claude-warm-pages.mjs ⑩). PURE over the session object.
/** Is this read of the conversation a bulk resume's first? (true until a door replied or a person acted) */
function isBulk(session) { return !!(session && session._bulkRead === true); }
/** A DOOR replied the conversation's history (or its facts): the mark is consumed. Called at the doors only. */
function replied(session) { if (session && session._bulkRead) session._bulkRead = false; }
/** A person's own act on the conversation: the mark is consumed (its next read is a person's). */
function personAct(session) { replied(session); }
module.exports = { isBulk, replied, personAct };
