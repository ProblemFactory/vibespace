'use strict';
// PURE: THE CUT A REWIND MAKES (B-437e, design-harness-features §3.2 tier one) — the only part of the rewind the
// normalizer needs, kept apart from the door (src/rewind-door.js: the verdict, the plan, the answer table) so the
// device agent, which bundles the normalizer, carries these few lines and not the door (test-architecture §107).
// Imports nothing, touches no I/O.

/** OUR rewind requests carry this request_id prefix: the CLI's answer is known as ours by it. */
const REWIND_REQUEST_PREFIX = 'vsr-';
/** The one number the rewind's three clocks read: the `expires_at` we state, the hub's «one at a time» mark, the page's
 *  watchdog. A LOCAL 2.1.322 never expires a request (⇒ kb-file-structure «rewind-door.js»). */
const REWIND_LIFE_MS = 60000;

/** Is this one of the person's OWN turn-starting messages? Not: a notice, an agent card, a message taken back, one still
 *  afloat (held — it reached no turn), a mid-turn steer, a companion / synthetic line, a record somebody else wrote
 *  (originKind: a task notification, a peer's message, the auto-resume continue), an EARLIER member of a batch the CLI
 *  ran as ONE record (batchOf: only the batch's last uuid is a record the CLI can cut to). */
function isPersonPrompt(msg) {
  return !!msg && msg.role === 'user' && !msg.noticeKind && !msg.rewound && !msg.originKind && !msg.synthetic
    && !msg.afloat && !msg.midTurn && !msg.batchOf && msg.startsTurn !== false && typeof msg.id === 'string';
}

/** A record that STARTS A TURN — the person's or one somebody else opened (the plan counts these; a twin has none left). */
function startsATurn(m) {
  return !!m && m.role === 'user' && !m.noticeKind && !m.afloat && !m.midTurn && !m.batchOf && m.startsTurn !== false;
}

/** The ids a record's cut takes back, over the messages as they stand when it is read (record order). `targetUuid` =
 *  the person's message the rewind went back to — it, the earlier members of its batch, and everything after go;
 *  else `leafUuid` = the last message KEPT (everything after it; null = nothing kept). `placed: false` = an anchor this
 *  view does not hold (mark nothing, say it); `already: true` = this rewind is cut already (its twin record). */
function cutOf(messages, { targetUuid = null, leafUuid = undefined, untilId = null } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const notice = (m) => !!m && m.noticeKind === 'rewound';     // a rewind's own notice: never taken back, never an anchor
  let from = -1;
  if (typeof targetUuid === 'string' && targetUuid) {
    from = list.findIndex((m) => m && !m.rewound && m.uuid === targetUuid);
    if (from < 0 && list.some((m) => m && m.rewound && m.uuid === targetUuid)) return { ids: [], placed: true, already: true };
    while (from > 0 && list[from - 1] && list[from - 1].batchOf === targetUuid && !list[from - 1].rewound) from--;
  } else if (leafUuid === null) from = 0;
  else if (typeof leafUuid === 'string' && leafUuid) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].uuid === leafUuid) { from = i + 1; break; }
  }
  if (from < 0) return { ids: [], placed: false, already: false };
  // what stood when the request went out (untilId) bounds the cut: a message sent after it ran AFTER the rewind
  const u = untilId ? list.findIndex((m) => m && m.id === untilId) : -1, end = u >= 0 ? u + 1 : list.length;
  const take = [];
  for (let i = from; i < end; i++) if (list[i] && !list[i].rewound && !notice(list[i])) take.push(list[i]);
  // the leaf road's twin: no TURN left after the leaf; a card left there went with the cut (no second notice) ⇒ kb
  if (targetUuid == null && from < end && !take.some(startsATurn)) return { ids: take.map((m) => m.id), placed: true, already: true };
  return { ids: take.map((m) => m.id), placed: true, already: false };
}

module.exports = { REWIND_REQUEST_PREFIX, REWIND_LIFE_MS, isPersonPrompt, startsATurn, cutOf };
