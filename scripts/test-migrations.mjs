#!/usr/bin/env node
// Migration framework (2.328.0, plan B): shared runner semantics + the first
// real local migration, against a THROWAWAY data dir (never production data/).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runMigrations } = require('../src/migration-runner.js');
const { create } = require('../src/server/migrations.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mig-'));
try {
  // ── runner semantics ──
  const ledger = path.join(tmp, 'ledger.json');
  let ran = 0, boom = 0;
  const mig = [
    { id: 'a', run: () => { ran++; } },
    { id: 'b', run: () => { boom++; throw new Error('disk full'); } },
  ];
  let r = runMigrations({ ledgerPath: ledger, migrations: mig, log: () => {}, warn: () => {} });
  ok(ran === 1 && r.find((x) => x.id === 'a').status === 'ran', 'migration runs once');
  ok(r.find((x) => x.id === 'b').status === 'failed', 'failure reported, not thrown');
  r = runMigrations({ ledgerPath: ledger, migrations: mig, log: () => {}, warn: () => {} });
  ok(ran === 1 && r.find((x) => x.id === 'a').status === 'already', 'second run: applied id skipped (ledger)');
  ok(boom === 2, 'FAILED migration re-attempts next run (never recorded)');
  const led = JSON.parse(fs.readFileSync(ledger, 'utf-8'));
  ok(led.applied.a && !led.applied.b, 'ledger records success only');

  // ── the dormant-plan archive migration ──
  const rootDir = path.join(tmp, 'inst');
  fs.mkdirSync(path.join(rootDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'data', 'task-groups.json'), JSON.stringify({
    tasks: {
      t1: { title: 'A', plan: [{ text: 'old item', done: false }] },
      t2: { title: 'B', plan: [] },
      t3: { title: 'C' },
    },
  }));
  const notices = [];
  const m = create({ rootDir, serverNotice: (k, txt) => notices.push(k) });
  m.runLocalMigrations();
  const doc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'task-groups.json'), 'utf-8'));
  ok(!('plan' in doc.tasks.t1) && !('plan' in doc.tasks.t2), 'plan keys stripped from the live store');
  ok(doc.tasks.t1.title === 'A' && doc.tasks.t3.title === 'C', 'everything else untouched');
  const arch = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'archive', 'task-plans-legacy.json'), 'utf-8'));
  ok(arch.t1?.[0]?.text === 'old item', 'non-empty plans ARCHIVED, never destroyed');
  ok(!('t2' in arch), 'empty plans stripped without archiving noise');
  // idempotent: second boot changes nothing and archives nothing twice
  fs.writeFileSync(path.join(rootDir, 'data', 'task-groups.json'), JSON.stringify({ tasks: { t9: { title: 'later', plan: [{ text: 'x' }] } } }));
  m.runLocalMigrations();
  const doc2 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'task-groups.json'), 'utf-8'));
  ok('plan' in doc2.tasks.t9, 'already-applied migration never re-runs (ledger, not content-sniffing)');
  ok(notices.length === 0, 'no failure notices on the happy path');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
