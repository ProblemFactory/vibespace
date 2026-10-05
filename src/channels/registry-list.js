'use strict';
// src/channels/registry-list.js — THE CHANNEL VENDOR LIST (lane dc-channels-manifest; the owner's rule: a new vendor =
// its vendor-specific files + ONE line here). PURE and bundle-safe: each line requires a vendor's MANIFEST
// (src/channels/<vendor>/manifest.js — never its adapter), so the browser bundle and the server read the SAME list:
//   · src/channel-settings.js       CHANNEL_SETTINGS = settingsTables()       (the budget / pace / option rows)
//   · src/integration-registry.js   ROWS spread integrationRows(kit)           (each vendor's row + validators)
//   · src/lib/settings-schema.js    the "Per vendor" rows + the option rows    (through CHANNEL_SETTINGS)
//   · src/server/channels-engine.js REAL_ADAPTERS = each manifest's `adapter` module, registered whole (the module IS
//                                   the registered thing; register() validates every field the engine reads)
// Adding a vendor: its folder (adapter + manifest + blocks) and one line below. Its zh / ja DICTIONARY entries are
// the one other edit — every string the product shows has one.
const MANIFESTS = Object.freeze([
  require('./lark/manifest.js'),
  require('./gmail/manifest.js'),
  require('./slack/manifest.js'),
]);

/** `{ <kind>: <its settings table> }` in list order — CHANNEL_SETTINGS. */
function settingsTables() { return Object.fromEntries(MANIFESTS.map((m) => [m.kind, m.settings])); }
/** Every vendor's integration row, built with the registry's generic validator kit `{ V, okV, bad }`. */
function integrationRows(kit) { return MANIFESTS.map((m) => m.integrationRow(kit)); }

/** THE DECLARED EGRESS (test-channels-egress): a PURE list — it constructs no request of its own (the adapters do). */
const EGRESS = Object.freeze([]);

module.exports = { EGRESS, MANIFESTS, settingsTables, integrationRows };
