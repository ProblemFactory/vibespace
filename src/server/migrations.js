'use strict';
// LOCAL MIGRATION REGISTRY (2.328.0, plan B step 1): the instance's one-shot
// data migrations, run at boot BEFORE restoreSessions through the SHARED
// runner (src/migration-runner.js — the daemon runs its own registry through
// the same runner device-side). Ledger: data/migrations.json. Add new
// migrations APPEND-ONLY with a dated id; never edit a shipped one (instances
// that already ran it will not re-run — ship a follow-up instead). Pattern:
// archive, then strip — never destroy.
const fs = require('fs');
const path = require('path');
const { runMigrations } = require('../migration-runner.js');

function create({ rootDir, serverNotice }) {
  const dataDir = path.join(rootDir, 'data');
  const archiveDir = path.join(dataDir, 'archive');

  const MIGRATIONS = [
    {
      id: '2026-08-archive-dormant-task-plans',
      note: 'dormant checklist plan arrays (feature removed 2.121.0) → data/archive/',
      run() {
        const f = path.join(dataDir, 'task-groups.json');
        let doc; try { doc = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return; } // no store yet = nothing to do
        const tasks = doc.tasks || {};
        const archived = {};
        for (const [id, t] of Object.entries(tasks)) {
          if (t && Array.isArray(t.plan) && t.plan.length) { archived[id] = t.plan; delete t.plan; }
          else if (t && 'plan' in t) delete t.plan;
        }
        if (!Object.keys(archived).length) return;
        fs.mkdirSync(archiveDir, { recursive: true });
        const out = path.join(archiveDir, 'task-plans-legacy.json');
        let prev = {}; try { prev = JSON.parse(fs.readFileSync(out, 'utf-8')); } catch { }
        fs.writeFileSync(out + '.tmp', JSON.stringify({ ...prev, ...archived }, null, 2));
        fs.renameSync(out + '.tmp', out);
        fs.writeFileSync(f + '.tmp', JSON.stringify(doc, null, 2));
        fs.renameSync(f + '.tmp', f);
      },
    },
  ];

  function runLocalMigrations() {
    const results = runMigrations({ ledgerPath: path.join(dataDir, 'migrations.json'), migrations: MIGRATIONS });
    for (const r of results) {
      if (r.status === 'failed') {
        try { serverNotice?.('migration-failed:' + r.id, `Data migration ${r.id} failed (${r.error}) — will retry on next restart.`, { level: 'warn' }); } catch { }
      }
    }
    return results;
  }

  return { runLocalMigrations, MIGRATIONS };
}

module.exports = { create };
