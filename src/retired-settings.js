'use strict';
// RETIRED SETTING KEYS (B-df40 part 1, docs/settings.md "Removed 2026-10") — PURE, no I/O, imports nothing.
// The ONE list of settings keys that once had a row (or a reader) and never will again. Two readers by identity:
// src/lib/settings-schema.js re-exports it (scripts/test-architecture.mjs 44d refuses a schema row, or a
// serverSetting('<key>') read anywhere under src/, for any key here), and the boot migration
// 2026-10-settings-rows-retired (src/server/migrations.js) strips the stored values from data/settings.json,
// archiving them in its ledger report. APPEND-ONLY: a key once listed stays listed (a later retirement ships a
// follow-up migration with its own id — the shipped one never re-runs).
const RETIRED_SETTING_KEYS = Object.freeze([
  'agents.vibespaceChannel',      // the Claude Code channels research-preview bridge (2.344.0) — superseded, removed with its socket path
  'window.enableBounceOnFocus',   // no caller ever passed focusWindow({bounce:true})
  'terminal.preserveCustomTitle', // guarded on winInfo._hasCustomTitle, which nothing set
  'sessionCard.detailTruncation', // read and listened to, never applied to any element
  'agentd.dataPlane',             // graduated in 2.175.0 — stored without a row, no reader
  'agentd.remoteSessions',
  'agentd.sessions',
  // lane engine-spi-egress L3: the anti-bot backend left the core — 2026-11-cloak-to-plugin carries both values into its
  // plugin's reserved rows (plugin.<id>.executablePath / .egressAllowlist) and strips them; nothing reads them any more
  'browser.cloak.executablePath',
  'browser.cloak.egressAllowlist',
]);
/** The keys 2026-10-settings-rows-retired shipped with — that migration strips exactly these, ever (a ledger lost on an
 *  instance re-runs it, and it must not strip a key a LATER retirement's own migration still has to carry). */
const RETIRED_2026_10 = Object.freeze(RETIRED_SETTING_KEYS.slice(0, 7));

/** Strip `keys` from a parsed settings document. Returns `{ doc, stripped }`: `doc` is a NEW object holding every other
 *  key in its original order (the input is never mutated), `stripped` maps each removed key to its stored value (the
 *  archive the migration's ledger report carries). A non-object document comes back as-is with nothing stripped. */
function stripRetiredSettings(doc, keys = RETIRED_SETTING_KEYS) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { doc, stripped: {} };
  const drop = new Set(keys);
  const entries = Object.entries(doc);
  // fromEntries DEFINES each key (an own "__proto__" a JSON.parse produced stays an own key, never a prototype set)
  return { doc: Object.fromEntries(entries.filter(([k]) => !drop.has(k))), stripped: Object.fromEntries(entries.filter(([k]) => drop.has(k))) };
}

module.exports = { RETIRED_SETTING_KEYS, RETIRED_2026_10, stripRetiredSettings };
