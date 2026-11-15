'use strict';
// The NULL QuotaSignalSource: a harness that has no quota concept at all
// (shell terminals) — and the engine's LOUD-FAILURE fallback for a backend
// id nobody registered. Every member is the honest "nothing": no reading, no
// signal, no probe rung, no auth verdict. Frozen so a consumer can never
// mutate the shared instance into a fake source.
//
// `toLimitSet` returns an EMPTY typed set (src/quota-model.js), never null:
// "this harness has no limits" is a statement, and every reader of a LimitSet
// must be able to ask it the same questions and get "no claim" back. A null
// would make each caller invent its own empty case.
const { EMPTY_SET, makeLimitSet } = require('../quota-model.js');
// THE TURN STATEMENT (lane usage-every-change, law 1 — the owner 2026-11-14: «每次发生变动…都必须能跟踪新的用量是多少»): how a
// harness's usage is STATED at a turn's end. `cadence` — every-response / on-change / wall-only / not-visible / none; `stamp` —
// the time a stored reading carries (the record's own, or its arrival when the record has none; null when nothing is stated);
// `reason` — in words; `cannot` — a road ('hub' / 'device') on which it can state nothing, with the reason. NULL's is a
// TERMINAL's «none». A harness that spreads NULL_QUOTA inherits it — src/harnesses/index.js refuses that BY IDENTITY (the way
// hasLimitSignal reads a classifier), so no harness says «none» by forgetting to say anything.
const NULL_STATEMENT = Object.freeze({ cadence: 'none', stamp: null, reason: 'a terminal: no vendor and no subscription — nothing to state', cannot: Object.freeze({}) });
const NULL_QUOTA = Object.freeze({
  turnStatement: NULL_STATEMENT,
  normalize: () => null,
  signalFromStream: () => null,
  probe: null,
  classifyAuthFailure: () => false,
  classifyServeFailure: () => null,
  toLimitSet: ({ identity = null, source = null, fetchedAt = null } = {}) =>
    makeLimitSet({ identity, source, fetchedAt, limits: [] }),
  limitSetFromSnapshot: (_snap, { identity = null, source = null } = {}) =>
    makeLimitSet({ identity, source, limits: [] }),
});

/** A chat agent whose usage VibeSpace cannot see — its own login (VibeSpace holds no credential) and a stream that states no
 *  quota: NULL's honest nothing with its OWN statement «not visible to VibeSpace», never NULL's «none». */
function notVisibleQuota(reason) {
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('notVisibleQuota: say why VibeSpace cannot see this usage');
  return Object.freeze({ ...NULL_QUOTA, turnStatement: Object.freeze({ cadence: 'not-visible', stamp: null, reason, cannot: Object.freeze({}) }) });
}
module.exports = { NULL_QUOTA, NULL_STATEMENT, notVisibleQuota, EMPTY_SET };
