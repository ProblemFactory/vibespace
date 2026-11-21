'use strict';
// PURE — THE ONE TEST «this account id names a third-party provider's record» (lane lg-providers, B-d578 P1-b): the
// `pv-<id>` shape model-providers.js gives a provider record, and not one of its built-in records (its own presetOf).
// Kept apart and small on purpose: the usage ledger (src/usage-history.js — the fold worker loads it) and the usage
// index's model (src/usage-index-model.js — the shadow check's second spelling) ask it on every row, so both count a
// provider's request the same way; model-providers.js is required only the first time a `pv-` id is met, so a worker
// that never meets one keeps its baseline heap (test-cache-bounds §30).
const PV = /^pv-[a-z0-9][a-z0-9-]{0,63}$/;   // a provider record's id — the same test accounts.js resolveForSpawn and accountProviderId make
const SEEN_MAX = 1024;
let presetOf = null;
const seen = new Map();   // id → verdict (bounded: a process meets a handful of provider ids)

function isThirdPartyAccount(id) {
  if (typeof id !== 'string' || !id.startsWith('pv-')) return false;
  let v = seen.get(id);
  if (v === undefined) {
    if (!presetOf) presetOf = require('./model-providers.js').presetOf;
    v = PV.test(id) && !presetOf(id);
    if (seen.size < SEEN_MAX) seen.set(id, v);
  }
  return v;
}

// SAID (adversarial read, MINOR 15): the shape is trusted for any `pv-` id that is not a built-in. accounts.js
// firstPartyProviderOf mints `pv-<harness>-subscription` for a roster row (no record) — no ledger row carries it (an
// account's id is acct-/sub-/cxs-/pool-…); and an account RECORD that names a provider (`providerId`, accountProviderId's
// second leg) has no writer today. A writer of either must come here first.
module.exports = { isThirdPartyAccount };
