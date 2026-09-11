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
// EVERY create() here NAMES the home it gets. One of these migrations (the
// origin backfill) reads the transcript tree, and inheriting a home would make
// this suite read — and take its runtime from — whatever ~/.claude the
// developer happens to have (measured on this box: 3.9 GB, 27 s, in the FAST
// tier). The default stays os.homedir() for production.
const scratchHomeDir = path.join(tmp, 'home-empty');
fs.mkdirSync(path.join(scratchHomeDir, '.claude', 'projects'), { recursive: true });
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
  // a pre-2.368.19 collapse-kinds save (no 'agent' — the option didn't exist)
  fs.writeFileSync(path.join(rootDir, 'data', 'settings.json'), JSON.stringify({
    'chat.collapseKinds': ['thinking', 'bash', 'read'], 'window.closeBehavior': 'detach',
  }));
  const notices = [];
  const m = create({ rootDir, homeDir: scratchHomeDir, serverNotice: (k, txt) => notices.push(k) });
  m.runLocalMigrations();
  {
    const st = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'settings.json'), 'utf-8'));
    ok(st['chat.collapseKinds'].includes('agent'), "pre-'agent' collapse saves gain the new default-on kind once (a saved multiSelect can't tell 'unchecked' from 'predates the option')");
    ok(st['window.closeBehavior'] === 'detach' && st['chat.collapseKinds'][0] === 'thinking', 'everything else in settings.json untouched');
    // after the one-shot, an explicit un-tick sticks (ledger, not content-sniffing)
    st['chat.collapseKinds'] = st['chat.collapseKinds'].filter((k) => k !== 'agent');
    fs.writeFileSync(path.join(rootDir, 'data', 'settings.json'), JSON.stringify(st));
    m.runLocalMigrations();
    const st2 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'settings.json'), 'utf-8'));
    ok(!st2['chat.collapseKinds'].includes('agent'), 'a post-migration explicit un-tick is never re-added');
  }
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

  // ── the test-fixture ledger purge (2026-09-09) ────────────────────────────
  // Two suites wrote SYNTHETIC transcripts into the developer's real
  // ~/.claude/projects and the production usage walk ingested them: 79,533
  // fabricated rows on this instance claiming tokens nobody spent, attributed
  // to the machine login and counted into the costSince of its anchor pairs.
  // The fixture below is built in the SHAPE OF DISK (an ndjson shard, a cursor
  // map keyed by absolute path, anchor records with prevFetchedAt/costSince) —
  // a self-consistent invented shape is how the readings-repair r3 defect
  // stayed green.
  {
    const root2 = path.join(tmp, 'inst2');
    const hist = path.join(root2, 'data', 'usage-history');
    const anch = path.join(root2, 'data', 'usage-anchors');
    fs.mkdirSync(hist, { recursive: true });
    fs.mkdirSync(anch, { recursive: true });
    const FX = 'e2e00000-0000-4000-8000-000000000001';
    const REAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const row = (o) => JSON.stringify({ rid: o.rid, ts: o.ts, sid: o.sid, be: 'claude', model: 'claude-fable-5', acct: o.acct ?? null, atype: 'global', cwd: o.cwd ?? null, i: o.i ?? 10, cw5: 0, cw1: 0, cr: 0, o: o.o ?? 50, tier: null });
    fs.writeFileSync(path.join(hist, 'events-2026-08.ndjson'), [
      row({ rid: 'real_1', ts: 1000, sid: REAL, cwd: '/home/u/work', i: 7, o: 3 }),      // keep
      row({ rid: 'fx_sid_1', ts: 2000, sid: FX, i: 10, o: 50 }),                          // FABRICATED (no cwd — the real shape)
      row({ rid: 'fx_cwd_1', ts: 3000, sid: REAL, cwd: '/tmp/vs-chat-e2e-cwd-Q9oyO8', i: 1, o: 2 }), // real turn, fixture cwd
      row({ rid: 'real_2', ts: 9000, sid: REAL, cwd: '/home/u/work', i: 5, o: 5 }),      // keep
      'not json at all',                                                                  // unparseable stays
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(hist, '_cursors.json'), JSON.stringify({
      '/home/u/.claude/projects/-home-u-work/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl': { offset: 12, lastRid: 'real_2' },
      '/home/u/.claude/projects/-tmp-vs-chatpage-test-620924/e2e00000-0000-4000-8000-000000000001.jsonl': { offset: 4, lastRid: 'fx_sid_1' },
      '/home/u/.claude/projects/-home-u-work/e2e00000-0000-4000-8000-000000000002.jsonl': { offset: 4, lastRid: 'x' },
    }));
    fs.writeFileSync(path.join(hist, 'attribution.ndjson'),
      [JSON.stringify({ sid: REAL, acct: 'sub-a', ts: 1000 }), JSON.stringify({ sid: FX, acct: 'sub-a', ts: 2000 })].join('\n') + '\n');
    fs.writeFileSync(path.join(anch, 'anchors-org_x.ndjson'), [
      JSON.stringify({ accountId: 'sub-a', fetchedAt: 2500, prevFetchedAt: 1500, costSince: { total: 9 } }),  // interval holds fx_sid_1 (ts 2000) ⇒ VOID
      JSON.stringify({ accountId: 'sub-a', fetchedAt: 8000, prevFetchedAt: 4000, costSince: { total: 4 } }),  // holds nothing removed ⇒ KEEP
      JSON.stringify({ accountId: 'sub-a', fetchedAt: 3500, prevFetchedAt: 2900, costSince: { total: 2 } }),  // holds fx_cwd_1 (ts 3000) ⇒ VOID
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(anch, 'rates.json'), JSON.stringify({ 'sub-a': { rate: 1.5 } }));

    const notices2 = [];
    const m2 = create({ rootDir: root2, homeDir: scratchHomeDir, serverNotice: (k) => notices2.push(k) });
    const res2 = m2.runLocalMigrations();
    ok(res2.find((r) => r.id === '2026-09-purge-test-fixture-ledger')?.status === 'ran', 'the fixture purge is registered and ran');

    const left = fs.readFileSync(path.join(hist, 'events-2026-08.ndjson'), 'utf-8').split('\n').filter(Boolean);
    const rids = left.map((l) => { try { return JSON.parse(l).rid; } catch { return '<unparseable>'; } });
    ok(rids.join(',') === 'real_1,real_2,<unparseable>',
      `only the real rows survive, and an unparseable line is NEVER removed (we only drop what we can NAME): ${rids.join(',')}`);

    const arch = fs.readdirSync(path.join(root2, 'data', 'archive')).filter((f) => f.startsWith('fixture-ledger-rows-'));
    ok(arch.length === 1, `the archive shard is DATED (append-only; two rotations in one millisecond must not overwrite): ${arch.join(',')}`);
    const archLines = fs.readFileSync(path.join(root2, 'data', 'archive', arch[0]), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const rowLines = archLines.filter((l) => l.store === 'usage-history');
    ok(rowLines.length === 2 && rowLines.every((l) => l.entry && l.reason && l.migration === '2026-09-purge-test-fixture-ledger'),
      'every archived row keeps the WHOLE record plus a reason and the migration id');
    ok(/no API request ever happened/.test(rowLines.find((l) => l.entry.rid === 'fx_sid_1').reason)
      && /throwaway cwd/.test(rowLines.find((l) => l.entry.rid === 'fx_cwd_1').reason),
      'the two classes carry DIFFERENT reasons (fabricated vs a real turn in a fixture cwd) — the whole subject of this repair');

    const cur2 = JSON.parse(fs.readFileSync(path.join(hist, '_cursors.json'), 'utf-8'));
    const curKeys = Object.keys(cur2);
    ok(curKeys.length === 1 && /-home-u-work\/aaaaaaaa/.test(curKeys[0]),
      `dead cursors dropped by project dir AND by synthetic sid, the real one kept (${curKeys.length} left)`);

    const attr2 = fs.readFileSync(path.join(hist, 'attribution.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    ok(attr2.length === 1 && attr2[0].sid === REAL, 'attribution entries naming a synthetic conversation are archived');

    const anchors2 = fs.readFileSync(path.join(anch, 'anchors-org_x.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const voided = anchors2.filter((a) => a.costSince === null);
    ok(voided.length === 2 && voided.every((a) => a.repairedBy === '2026-09-purge-test-fixture-ledger'),
      `only the anchors whose interval CONTAINED a removed row are voided (${voided.length}/3), and they say who did it`);
    ok(anchors2.find((a) => a.fetchedAt === 8000).costSince.total === 4,
      'NEGATIVE CONTROL: an anchor whose interval held nothing removed keeps its costSince (this is not a blanket wipe)');
    ok(anchors2.length === 3, 'no anchor RECORD is removed — the readings are real, only the cost measured beside them is not');
    ok(!fs.existsSync(path.join(anch, 'rates.json')) && archLines.some((l) => l.store === 'usage-anchors/rates.json'),
      'the learned rates are archived and dropped so the estimator re-learns from the cleaned pairs');
    ok(notices2.includes('fixture-ledger-purged'), 'the user is TOLD (a repair nobody can see ran is a repair nobody can verify ran)');

    // IDEMPOTENT — and, because the ledger is keyed by id, a second boot does
    // not even re-enter it.
    const beforeBytes = fs.readFileSync(path.join(hist, 'events-2026-08.ndjson'), 'utf-8');
    const beforeArch = fs.readFileSync(path.join(root2, 'data', 'archive', arch[0]), 'utf-8');
    m2.runLocalMigrations();
    ok(fs.readFileSync(path.join(hist, 'events-2026-08.ndjson'), 'utf-8') === beforeBytes
      && fs.readFileSync(path.join(root2, 'data', 'archive', arch[0]), 'utf-8') === beforeArch,
      'second boot: the ledger row keeps it from re-running, and nothing is archived twice');
    // …and running the FUNCTION again on the cleaned stores is also a no-op
    // (the ledger is a belt; the repair itself must be idempotent).
    const { purgeFixtureLedger } = require('../src/fixture-ledger-purge.js');
    const again = purgeFixtureLedger({ dataDir: path.join(root2, 'data'), id: 'again' });
    ok(again.rowsRemoved === 0 && again.cursors === 0 && again.anchorsVoided === 0,
      'the repair itself is idempotent on already-clean stores', JSON.stringify(again));

    // A CLEAN instance is untouched and says so.
    const root3 = path.join(tmp, 'inst3');
    fs.mkdirSync(path.join(root3, 'data', 'usage-history'), { recursive: true });
    fs.writeFileSync(path.join(root3, 'data', 'usage-history', 'events-2026-08.ndjson'), row({ rid: 'r', ts: 1, sid: REAL, cwd: '/home/u/work' }) + '\n');
    const notices3 = [];
    create({ rootDir: root3, homeDir: scratchHomeDir, serverNotice: (k) => notices3.push(k) }).runLocalMigrations();
    ok(fs.readFileSync(path.join(root3, 'data', 'usage-history', 'events-2026-08.ndjson'), 'utf-8').includes('"rid":"r"')
      && !notices3.includes('fixture-ledger-purged'),
      'a clean instance keeps every row and is not told about a repair that did nothing');
  }

  // ── the usage-origin backfill (2026-09-10) ───────────────────────────────
  // Rows written before the walk stamped `origin` say nothing about WHICH kind
  // of transcript produced them, and an agent row carries the agent's own cwd —
  // so a git-worktree agent is its own row in "By project". The fixture is
  // built in the SHAPE OF DISK: a real transcript tree (main + subagent +
  // workflow, the workflow agent running in a worktree) beside an ndjson shard.
  {
    const root4 = path.join(tmp, 'inst4');
    const home4 = path.join(tmp, 'home4');
    const hist4 = path.join(root4, 'data', 'usage-history');
    fs.mkdirSync(hist4, { recursive: true });
    const SID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
    const PROJ = path.join(home4, '.claude', 'projects', '-home-u-work');
    const REPO = '/home/u/work';
    const TREE = '/home/u/work/.claude/worktrees/agent-bbb';
    const rec = (rid, cwd) => JSON.stringify({
      type: 'assistant', requestId: rid, timestamp: '2026-08-09T08:00:00.000Z', cwd,
      message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 100, output_tokens: 50 } },
    }) + '\n';
    const w = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
    w(path.join(PROJ, SID + '.jsonl'), rec('req_main', REPO));
    w(path.join(PROJ, SID, 'subagents', 'agent-aaa.jsonl'), rec('req_sub', REPO));
    w(path.join(PROJ, SID, 'subagents', 'workflows', 'wf_run7', 'agent-bbb.jsonl'), rec('req_wf', TREE));

    const ev = (o) => JSON.stringify({ rid: o.rid, ts: o.ts, sid: SID, be: o.be || 'claude', model: 'claude-fable-5', acct: null, atype: 'global', cwd: o.cwd ?? null, ...(o.origin ? { origin: o.origin, agent: o.agent } : {}), i: 10, cw5: 0, cw1: 0, cr: 0, o: 50, tier: null });
    const shard4 = path.join(hist4, 'events-2026-08.ndjson');
    fs.writeFileSync(shard4, [
      ev({ rid: 'req_main', ts: 1000, cwd: REPO }),
      ev({ rid: 'req_sub', ts: 2000, cwd: REPO }),
      ev({ rid: 'req_wf', ts: 3000, cwd: TREE }),                                  // the worktree row — the whole point
      ev({ rid: 'cx:tid:1050', ts: 4000, cwd: '/tmp/cx', be: 'codex' }),
      ev({ rid: 'req_gone', ts: 5000, cwd: REPO }),                                // transcript rotated away
      ev({ rid: 'req_walked', ts: 6000, cwd: REPO, origin: 'workflow', agent: 'agent-zzz' }), // already stamped by the walk
      'not json at all',
    ].join('\n') + '\n');
    const preRows = fs.readFileSync(shard4, 'utf-8').split('\n').filter(Boolean);
    ok(preRows.filter((l) => /"origin"/.test(l)).length === 1,
      'NEGATIVE CONTROL: before the migration only the one walk-stamped row carries an origin (the assertions below are not vacuous)');

    create({ rootDir: root4, homeDir: home4, serverNotice: () => {} }).runLocalMigrations();
    const rows = fs.readFileSync(shard4, 'utf-8').split('\n').filter(Boolean);
    const by = {}; for (const l of rows) { let r; try { r = JSON.parse(l); } catch { continue; } by[r.rid] = r; }
    ok(by.req_main?.origin === 'main' && by.req_main.cwd === REPO && !by.req_main.wcwd && !by.req_main.agent,
      'a row from the conversation\'s own transcript is "main" and gains nothing else');
    ok(by.req_sub?.origin === 'subagent' && by.req_sub.agent === 'agent-aaa' && by.req_sub.cwd === REPO && by.req_sub.wcwd === undefined,
      'a subagent row names its agent file; its cwd already WAS the project\'s, so no wcwd is invented');
    ok(by.req_wf?.origin === 'workflow' && by.req_wf.wf === 'wf_run7' && by.req_wf.agent === 'agent-bbb'
      && by.req_wf.cwd === REPO && by.req_wf.wcwd === TREE,
      `a workflow row is attributed to the PARENT project and keeps its worktree as wcwd (${by.req_wf?.cwd} / ${by.req_wf?.wcwd})`);
    ok(by['cx:tid:1050']?.origin === 'main' && by['cx:tid:1050'].cwd === '/tmp/cx',
      'a codex row is "main" by RULE (sub-agent rollouts are merged into the parent thread) — no transcript lookup, no cwd change');
    ok(by.req_gone?.origin === 'unknown',
      'a row whose transcript is gone is HONESTLY "unknown" — never guessed into "main"');
    ok(by.req_walked?.origin === 'workflow' && by.req_walked.agent === 'agent-zzz',
      'a row the WALK already stamped is left exactly as it is');
    ok(rows[rows.length - 1] === 'not json at all', 'an unparseable line is kept verbatim (we only rewrite what we can name)');

    const adirs = fs.readdirSync(path.join(root4, 'data', 'archive')).filter((f) => f.startsWith('usage-origin-backfill-'));
    ok(adirs.length === 1, `the shard copies are archived in a DATED directory: ${adirs.join(',')}`);
    const acopy = fs.readFileSync(path.join(root4, 'data', 'archive', adirs[0], 'events-2026-08.ndjson'), 'utf-8');
    ok(acopy.split('\n').filter(Boolean).length === preRows.length && acopy.split('\n').filter(Boolean).filter((l) => /"origin"/.test(l)).length === 1,
      'the archive is a VERBATIM copy of the pre-migration shard (archive, then rewrite — never destroy)');
    const man = JSON.parse(fs.readFileSync(path.join(root4, 'data', 'archive', adirs[0], '_migration.json'), 'utf-8'));
    ok(man.migration === '2026-09-usage-origin-backfill' && man.shards.includes('events-2026-08.ndjson'),
      'the archive says WHICH migration copied it (a directory of unlabelled ndjson is not a recovery path)');

    // IDEMPOTENT — the function itself, not just the ledger belt.
    const { backfillUsageOrigin } = require('../src/usage-origin-backfill.js');
    const again = backfillUsageOrigin({ dataDir: path.join(root4, 'data'), projectsDir: path.join(home4, '.claude', 'projects'), id: 'again' });
    ok(again.changed === 0 && again.shardsRewritten === 0 && again.already === 6,
      'the repair itself is idempotent on an already-stamped ledger', JSON.stringify(again));

    // A clean instance with no ledger at all must not walk anything.
    const root5 = path.join(tmp, 'inst5');
    fs.mkdirSync(path.join(root5, 'data'), { recursive: true });
    const rep5 = backfillUsageOrigin({ dataDir: path.join(root5, 'data'), projectsDir: path.join(home4, '.claude', 'projects'), id: 'none' });
    ok(rep5.shards === 0 && rep5.transcripts === 0 && rep5.rowsIn === 0,
      'no ledger ⇒ no transcript walk at all (the expensive half is never paid for nothing)', JSON.stringify(rep5));
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
