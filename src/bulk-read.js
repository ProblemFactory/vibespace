'use strict';
// THE BULK MARK'S WHOLE LIFE (B-cd4b unit 2's follow, 主开发 r1062) — the ONE place every road that warms or reads a conversation's
// history passes. A paced «Resume all» marks the conversation it creates (src/ws-create.js sets `_bulkRead`): BULK IS THE FIRST
// HISTORY READ ONLY. The mark is CONSUMED here, by whichever comes first: that first read LANDING — on any road: the socket's
// attach (src/ws-handler.js), the history route's view, its status, the todos read (src/transcript-service.js) — a person's own act
// on the conversation (its window pressed or gone to, View History), or the conversation's end (the session object goes with it).
// Every later read of that conversation is a person's. No road reads the mark but through `isBulk` (a census holds it:
// scripts/test-claude-warm-pages.mjs ⑩). PURE over the session object.
/** Is this read of the conversation a bulk resume's first? (true until a landing or a person's act consumed it) */
function isBulk(session) { return !!(session && session._bulkRead === true); }
/** A read of the conversation's history LANDED (on any road): the mark is consumed. */
function landed(session) { if (session && session._bulkRead) session._bulkRead = false; }
/** A person's own act on the conversation: the mark is consumed (its next read is a person's). */
function personAct(session) { landed(session); }
module.exports = { isBulk, landed, personAct };
