'use strict';
// PURE: THE CUT A REWIND MAKES (B-437e, design-harness-features §3.2 tier one) — the only part of the rewind the
// normalizer needs, kept apart from the door (src/rewind-door.js: the verdict, the plan, the answer table) so the
// device agent, which bundles the normalizer, carries these few lines and not the door (test-architecture §107).
// Imports nothing, touches no I/O.

/** OUR rewind requests carry this request_id prefix: the CLI's answer is known as ours by it. */
const REWIND_REQUEST_PREFIX = 'vsr-';

/** Is this one of the person's OWN turn-starting messages? Not: a notice, an agent card, a message taken back, one still
 *  afloat (held — it reached no turn), a mid-turn steer, a companion / synthetic line, a record somebody else wrote
 *  (originKind: a task notification, a peer's message, the auto-resume continue), an EARLIER member of a batch the CLI
 *  ran as ONE record (batchOf: only the batch's last uuid is a record the CLI can cut to). */
function isPersonPrompt(msg) {
  return !!msg && msg.role === 'user' && !msg.noticeKind && !msg.rewound && !msg.originKind && !msg.synthetic
    && !msg.afloat && !msg.midTurn && !msg.batchOf && msg.startsTurn !== false && typeof msg.id === 'string';
}

/** The ids a record's cut takes back, over the messages as they stand when it is read (record order). `targetUuid` =
 *  the person's message the rewind went back to — it, the earlier members of its batch, and everything after go;
 *  else `leafUuid` = the last message KEPT (everything after it; null = nothing kept). `placed: false` = an anchor this
 *  view does not hold (mark nothing, say it); `already: true` = this rewind is cut already (its twin record). */
function cutOf(messages, { targetUuid = null, leafUuid = undefined } = {}) {
  const list = Array.isArray(messages) ? messages : [];
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
  if (targetUuid == null && list.slice(from).some((m) => m && m.rewound)) return { ids: [], placed: true, already: true };
  const ids = [];
  for (let i = from; i < list.length; i++) if (list[i] && !list[i].rewound) ids.push(list[i].id);
  return { ids, placed: true, already: false };
}

module.exports = { REWIND_REQUEST_PREFIX, isPersonPrompt, cutOf };
