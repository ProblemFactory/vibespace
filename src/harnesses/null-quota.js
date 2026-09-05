'use strict';
// The NULL QuotaSignalSource: a harness that has no quota concept at all
// (shell terminals) — and the engine's LOUD-FAILURE fallback for a backend
// id nobody registered. Every member is the honest "nothing": no reading, no
// signal, no probe rung, no auth verdict. Frozen so a consumer can never
// mutate the shared instance into a fake source.
const NULL_QUOTA = Object.freeze({
  normalize: () => null,
  signalFromStream: () => null,
  probe: null,
  classifyAuthFailure: () => false,
});

module.exports = { NULL_QUOTA };
