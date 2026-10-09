'use strict';
/**
 * THE BROWSER BACKENDS — the registration list (lane dc-browser-backends, decoupling wave 2b; the owner's standard,
 * 2026-10-04: a member of a family is its OWN file + ONE registration line; the core gates on a DECLARED capability
 * row, never on an id). PURE: one require line per backend, in the order the rows are listed everywhere (the first
 * row is the default provider). Each backend file declares `{id, row, words}` and, when it has them, `keyRow` (its
 * integration key), `tiers`, `egressProof` (a §7.2.1 measurement) and `install` (a pinned install spec). Derived from
 * this list: src/browser-profiles.js PROVIDERS, src/browser-switch.js KEY_ROWS (+ the /providers words the client
 * reads), src/server/browser-backend.js's resolve.
 */
const BROWSER_BACKENDS = Object.freeze([
  require('./chromium.js'),
  require('./cloak.js'),
  require('./cdp.js'),
  require('./desktop-app.js'), // lane e2a (§E2): the agent's own desktop-app browser — the lowest rung that STARTS a process
  require('./local-window.js'),
]);

module.exports = { BROWSER_BACKENDS };
