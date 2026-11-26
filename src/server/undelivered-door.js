'use strict';
/**
 * B-5a4d ROOT UNIT 3 — THE PERSON'S TWO ACTS ON A MESSAGE PROVEN NOT DELIVERED (the coordinator's r4655 / r4664): «Send again» and
 * «Dismiss», on the bubble where the message stands (src/lib/chat-renderers.js beside its chip; nothing global). THIS file only ASKS:
 *  - THE PERSON ONLY: `by` is handed only for a socket whose handshake proved a person on this page (ws-handler `_personPage`,
 *    src/server/rewind-requests.js personOfUpgrade: no press bearer + the page verdict) — anything else is refused by name
 *    (`human_only`): an agent's, a job's or an automation's sign-in never reaches either act; no CLI of ours offers them.
 *  - THE WRAPPER IS THE ONE WRITER of the conversation's records (data/bin/chat-wrapper.js resendGate / dismissUndelivered): the old
 *    record ends in its file before anything is handed on or said. Drawn only where the running wrapper advertises
 *    `caps.undeliveredActs` (never a harness's name), as the page's attach was told (session._undeliveredActs).
 *  - ONCE: a second press of either act on the same message while the first one's word is out is refused here by name (`pending`: the
 *    hub's one loop marks the press before it writes); a message whose chip no longer says «not delivered» is refused by its chip; a
 *    press that reaches the wrapper after its record ended is refused there again. A pending press clears on the WORD that answers it
 *    (the normalizer's act count for that message moved: the end state, or the wrapper's refusal) — never on a clock.
 *  - SEND AGAIN IS A TYPED SEND WITH THE OLD WORDS: the person's own send road (src/server/user-input.js, origin 'ws', the
 *    conversation's Enter door) — a turn in progress, a hold, a wall and the model lock meet it as they meet a message typed now; it
 *    is never a turn nobody typed (test-spend-paths' ALLOW row for this file). It sends the WORDS: a picture or a file the message
 *    carried does not ride (the record keeps pictures only up to its bound, and a typed send takes the page's own uploads) — the
 *    answer counts them and the page says so.
 */
const PENDING = new WeakMap();   // conversation → Map(old msgId → the act count when the press went out)
const pendingOf = (session) => PENDING.get(session) || PENDING.set(session, new Map()).get(session);
const newMsgId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const refused = (reason, more = {}) => ({ ok: false, reason, ...more });
const endedWhy = (state) => (state === 'resent' ? 'already-resent' : state === 'dismissed' || state === 'removed' ? 'dismissed' : 'not-undelivered');

/** The checks both acts share → { ok, bubble } | a refusal by name. */
function gate(session, sessionId, { by, msgId }) {
  if (!by) return refused('human_only');
  if (!session || !session.pty || session.mode !== 'chat') return refused('not-live');
  if (typeof msgId !== 'string' || !msgId || msgId.length > 200) return refused('malformed');
  // the advert the page was told at its attach (ws-handler: the running wrapper's own sidecar, read there) — the door reads no file on
  // the hub's loop, and a button the page drew is a button that acts
  if (session._undeliveredActs !== true) return refused('wrapper-old');
  const n = session._normalizer;
  const bubble = n && typeof n.undeliveredOf === 'function' ? n.undeliveredOf(msgId) : null;
  if (!bubble) return refused('gone');
  const pend = pendingOf(session);
  if (pend.has(msgId)) { if (pend.get(msgId) === bubble.acts) return refused('pending'); pend.delete(msgId); }   // its word came: judged by the chip below
  return { ok: true, bubble };
}

/** «Send again» → { ok, pictures } | a refusal (the send road's own refusal rides as `send-refused` with its code and words). */
function resend(session, sessionId, { by = null, msgId, sendUserInput }) {
  const g = gate(session, sessionId, { by, msgId });
  if (!g.ok) return g;
  if (g.bubble.state !== 'undelivered') return refused(endedWhy(g.bubble.state));
  if (!g.bubble.words.trim()) return refused('no-words');
  const frame = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: g.bubble.words }] }, webui_resend_of: msgId });
  const pend = pendingOf(session);
  pend.set(msgId, g.bubble.acts);   // before the write: a second press on this loop meets it
  const r = sendUserInput(sessionId, frame, { msgId: newMsgId(), origin: 'ws', door: 'enter' });   // THE typing path (test-spend-paths: its ALLOW row for this file)
  if (!r || !r.ok) { pend.delete(msgId); return refused('send-refused', { code: (r && r.code) || null, error: (r && r.error) || null, left: (r && r.left) || null }); }
  return { ok: true, pictures: g.bubble.pictures };
}

/** «Dismiss» → { ok } | a refusal by name. */
function dismiss(session, sessionId, { by = null, msgId }) {
  const g = gate(session, sessionId, { by, msgId });
  if (!g.ok) return g;
  if (g.bubble.state !== 'undelivered' && g.bubble.state !== 'unconfirmed') return refused(endedWhy(g.bubble.state));
  const pend = pendingOf(session);
  pend.set(msgId, g.bubble.acts);
  try { session.pty.write(JSON.stringify({ type: 'undelivered-dismiss', msg_id: msgId }) + '\n'); }
  catch (e) { pend.delete(msgId); return refused('write-failed', { error: (e && e.code) || 'write' }); }
  return { ok: true };
}

module.exports = { resend, dismiss, _pendingOf: pendingOf };
