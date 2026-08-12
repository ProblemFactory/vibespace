'use strict';
// ONE-SHOT MIGRATION RUNNER (2.328.0, owner-decided plan B: local AND device).
// SHARED tier — the daemon bundles it, so an instance updating old→new AND a
// device daemon self-upgrading both converge their on-disk state through the
// same mechanism: an ordered registry of idempotent one-shots + a ledger that
// records what already ran. Rules:
//   · a migration runs AT MOST once per root (ledger keyed by id)
//   · a FAILED migration is logged loudly, NOT recorded, and re-attempted on
//     the next boot — it never blocks startup (availability first)
//   · migrations never DESTROY data: archive, then strip (the dormant-plan
//     pattern) — an operator can always recover from data/archive/
//   · pre-framework one-shots (home-rename, store migrations with their own
//     .migrated markers) STAY where they are with their own guards; this
//     registry is for NEW migrations only. Do not re-register them here.
const fs = require('fs');
const path = require('path');

function runMigrations({ ledgerPath, migrations, log = console.log, warn = console.warn }) {
  let ledger = { applied: {} };
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')); } catch { }
  if (!ledger.applied || typeof ledger.applied !== 'object') ledger.applied = {};
  const results = [];
  for (const m of migrations) {
    if (!m || !m.id || typeof m.run !== 'function') continue;
    if (ledger.applied[m.id]) { results.push({ id: m.id, status: 'already' }); continue; }
    try {
      m.run();
      ledger.applied[m.id] = Date.now();
      results.push({ id: m.id, status: 'ran' });
      log(`[migrate] ${m.id} ✓${m.note ? ' — ' + m.note : ''}`);
    } catch (e) {
      // VERBATIM message (the loud-catch rule): a silent migration failure
      // re-manifests as mystery state drift releases later.
      warn(`[migrate] ${m.id} FAILED (will retry next boot): ${e.message}`);
      results.push({ id: m.id, status: 'failed', error: e.message });
    }
  }
  try {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath + '.tmp', JSON.stringify(ledger, null, 2));
    fs.renameSync(ledgerPath + '.tmp', ledgerPath);
  } catch (e) { warn(`[migrate] ledger write failed: ${e.message}`); }
  return results;
}

module.exports = { runMigrations };
