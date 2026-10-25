'use strict';
// THE ONE WRITER OF A STOP PUT-BACK (lane stop-refills-composer — the law and its PURE rules live in src/queue-putback.js).
// A wrapper's `queue_dropped` record (ONE per Stop: the person's rows Stop removed from the queue) becomes ONE write of
// the session's draft — the texts, oldest first, in front of what the drafts store holds — broadcast to EVERY client
// (senderWs null: the one that pressed Stop too, no ack) with the op's `prepended` stamp, so each client lands it as a
// prefix over its live box. Hooked at the ONE live gate every stdout consumer feeds (session-stdout's per-attach
// `helpersFor(id).feedLive`, BEFORE the normalizer: the draft op precedes that record's meta op), never inside a parse
// block or a protocol module; a history rebuild never passes the gate, so a restart never re-puts a past Stop.
//   · idempotent per dropId (session._putbackSeen, bounded): the same bytes fed twice write once;
//   · the server BELT's memory (session._putbackBelt, bounded): {version, prefix} per put-back — ws-handler's
//     `state-set` keeps the prefix in front of a client set whose basedOn proves it never saw the put-back;
//   · a machine write: no `_draftEditAt` stamp (that is the PERSON's door, ws-handler) and never a turn — nothing is sent
//     to the agent, the words only come back into the box;
//   · never throws into the gate (a malformed record is a journal line at most).
const { queueDroppedOf, mergeDraft, noteBelt } = require('../queue-putback.js');

const SEEN_MAX = 32;

function create({ getSyncStore = () => null, log = (...a) => console.log(...a) } = {}) {
  function onLiveRecord(session, id, msg) {
    if (!session || !msg || typeof msg !== 'object') return;
    let d;
    try { d = queueDroppedOf(msg); } catch { return; }
    if (!d) return;
    try {
      const seen = Array.isArray(session._putbackSeen) ? session._putbackSeen : (session._putbackSeen = []);
      if (seen.includes(d.dropId)) return;
      seen.push(d.dropId);
      if (seen.length > SEEN_MAX) seen.shift();
      if (!d.items.length && !d.omitted) return;
      let store = null;
      try { store = getSyncStore('drafts') || null; } catch { store = null; }
      if (!store) { log(`[queue-putback] ${id}: drafts store not up — ${d.items.length} message(s) NOT put back (dropId ${d.dropId})`); return; }
      const key = 'chat:' + id;
      const { text, count, prepended } = mergeDraft(store.get(key), d.items);
      if (count) {
        store.set(key, text, null, undefined, { prepended });
        session._putbackBelt = noteBelt(session._putbackBelt, { version: store.version, prefix: text.slice(0, prepended) });
      }
      log(`[queue-putback] ${id}: Stop put ${count} queued message(s) back into the draft (+${prepended} chars, ${d.omitted} omitted, dropId ${d.dropId})`);
    } catch (e) { log(`[queue-putback] ${id}: put-back failed (dropId ${d.dropId}): ${e && e.message ? e.message : e}`); }
  }
  return { onLiveRecord };
}

module.exports = { create, SEEN_MAX };
