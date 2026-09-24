'use strict';
// PURE (imports nothing; CJS so the bundle and the server share it) — WHO
// VibeSpace speaks as when it delivers a NOTIFICATION (kind:'notification' on
// the delivery ladder, src/server/conversation-deliver.js): Background Work
// events, the browser handback, channel wakes and receipts (B-d963).
//
// Why a list of SENDERS at all: a codex wrapper started before the verb table
// (2.369.63) records every peer frame it queues as `kind:'peer'` with only its
// `from` label — the frame's typed origin never reached its queue. The strip
// can still tell a queued Background Work notification from a person's message
// by that label, and it is the only carrier such a process has. A NEW producer
// of kind:'notification' must speak under a prefix listed here —
// scripts/test-peer-delivery.mjs derives the producer census from the tree and
// fails the one that does not.
const NOTIFICATION_SENDERS = Object.freeze([
  'Background Work · ',   // src/jobs.js (owner + subscriber notifications)
  'VibeSpace browser',    // src/server/browser-handback.js FROM_NAME
  'Channels · ',          // src/server/channels-engine.js (wakes + Outbox receipts)
]);

/** Is this queued row (the wrapper's queue_changed item: {kind, from, …}) a
 *  VibeSpace notification rather than somebody's message? A row a wrapper
 *  typed itself (`kind:'notification'`) is; a `peer` row is when its label is
 *  one of the senders above; a row the user typed never is. */
function isNotificationQueueItem(it) {
  if (!it || typeof it !== 'object') return false;
  if (it.kind === 'notification') return true;
  if (it.kind !== 'peer' || typeof it.from !== 'string') return false;
  return NOTIFICATION_SENDERS.some((p) => it.from.startsWith(p));
}

module.exports = { NOTIFICATION_SENDERS, isNotificationQueueItem };
