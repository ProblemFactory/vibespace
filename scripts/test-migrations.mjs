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

  // ── the weekly-lanes unfold (inc-mubu23bd-5vxi, 2026-09-21) ─────────────
  // Since 2.361.2 a `seven_day_overage_included` rate_limit_event (the 2.1.274
  // binary's own "per-model bucket", about twice the plan week on every capped
  // account) was written into the PLAN weekly lane. The fixture is the
  // incident's cache VERBATIM (plan 7d 86 %, source rate-limit-event, the
  // Fable cap right), the account's api-phase-verified window sidecar, a pool
  // whose per-session link names the account, and the owner's session buffer
  // whose tail holds an OLDER windowed event, the owner's record verbatim, and
  // non-event lines after it. Beside it: a PANEL-sourced key with the same
  // wrong number (never touched), an event-sourced key with no linked buffer
  // (left), an event-sourced key whose linked event states ANOTHER account's
  // weekly reset (left, by the readings-by-window rule), and a codex session
  // linked to the fixture account that must not count as evidence.
  {
    const root6 = path.join(tmp, 'inst6');
    const d6 = path.join(root6, 'data');
    const cache6 = path.join(d6, 'usage-cache');
    for (const sub of ['usage-cache', 'session-meta', 'session-buffers', 'subs/sub-fixture-max', 'subs/sub-orphan', 'subs/sub-foreign', 'subs/sub-panel', 'pool-links/pool-p1']) fs.mkdirSync(path.join(d6, sub), { recursive: true });
    const OWNER_RECORD = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1790535600, rateLimitType: 'seven_day_overage_included', utilization: 0.87, isUsingOverage: false, surpassedThreshold: 0.75, unifiedWindows: { five_hour: { utilization: 0.09, resetsAt: 1790048400 }, seven_day: { utilization: 0.43, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: 0.87, resetsAt: 1790535600 } } }, uuid: 'e2e00000-0000-4000-8000-000000000001', session_id: 'e2e00000-0000-4000-8000-000000000002' };
    const OLDER = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1790048400, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 0.05, resetsAt: 1790048400 }, seven_day: { utilization: 0.40, resetsAt: 1790535600 }, seven_day_overage_included: { utilization: 0.80, resetsAt: 1790535600 } } }, uuid: 'e2e00000-0000-4000-8000-000000000003', session_id: 'e2e00000-0000-4000-8000-000000000002' };
    const incident = { fiveHour: { utilization: 0.09, resetsAt: 1790048400 }, sevenDay: { utilization: 0.86, resetsAt: 1790535600, status: 'allowed_warning' }, scopedWeekly: [{ name: 'Fable', utilization: 0.87, resetsAt: 1790535600, severity: 'normal' }], fetchedAt: 1790031730410, source: 'rate-limit-event', scopedFetchedAt: 1790030899274, overage: { inUse: false, asOf: 1790031730410, status: 'rejected', disabledReason: 'org_level_disabled' }, overallStatus: 'allowed' };
    // the sidecar is the PANEL's minute-precise instant, 60 s before the API's (the production shape on every account here)
    const sidecar = { sevenDay: 1790535540, fiveHour: 1790048340, scoped: { fable: 1790535540 }, at: 1790030899275, source: 'on-demand', verifiedAt: 1790030899275, verifiedBy: 'api-phase' };
    fs.writeFileSync(path.join(cache6, 'sub-fixture-max.json'), JSON.stringify(incident));
    fs.writeFileSync(path.join(cache6, '.window-sub-fixture-max'), JSON.stringify(sidecar));
    // the PANEL wrote this one (the same wrong number, but a producer that states the week): never touched
    const panelBytes = JSON.stringify({ ...incident, source: 'on-demand' });
    fs.writeFileSync(path.join(cache6, 'sub-panel.json'), panelBytes);
    fs.writeFileSync(path.join(cache6, '.window-sub-panel'), JSON.stringify(sidecar));
    // event-sourced, no buffer anywhere names it
    const orphanBytes = JSON.stringify({ ...incident, sevenDay: { utilization: 0.7, resetsAt: 1790535600 } });
    fs.writeFileSync(path.join(cache6, 'sub-orphan.json'), orphanBytes);
    fs.writeFileSync(path.join(cache6, '.window-sub-orphan'), JSON.stringify(sidecar));
    // event-sourced, its linked session's event states a DIFFERENT weekly reset (2 days off)
    const foreignBytes = JSON.stringify({ ...incident, sevenDay: { utilization: 0.9, resetsAt: 1790708400 } });
    fs.writeFileSync(path.join(cache6, 'sub-foreign.json'), foreignBytes);
    fs.writeFileSync(path.join(cache6, '.window-sub-foreign'), JSON.stringify({ ...sidecar, sevenDay: 1790708400, scoped: {} }));
    // the pool: default link → the fixture account; the owner's session carries its own per-session link
    fs.symlinkSync(path.join(d6, 'subs', 'sub-fixture-max'), path.join(d6, 'subs', 'pool-p1'));
    fs.symlinkSync(path.join(d6, 'subs', 'sub-fixture-max'), path.join(d6, 'pool-links', 'pool-p1', 'sess-1-100'));
    fs.writeFileSync(path.join(d6, 'session-meta', 'cw-1-100.json'), JSON.stringify({ accountId: 'pool-p1', backend: 'claude', host: null, mode: 'chat' }));
    fs.writeFileSync(path.join(d6, 'session-buffers', 'sess-1-100.buf'), [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
      JSON.stringify(OLDER),
      JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 1, resetsAt: 1790048400 }, seven_day: { utilization: 0.99, resetsAt: 1790535600 } } } }), // a REJECTION is never the evidence
      JSON.stringify(OWNER_RECORD),
      JSON.stringify({ type: 'result', subtype: 'success' }),
      'not json at all',
    ].join('\n') + '\n');
    // a codex session linked to the same account: not claude ⇒ not evidence (its buffer would say 0.99)
    fs.writeFileSync(path.join(d6, 'session-meta', 'cw-2-101.json'), JSON.stringify({ accountId: 'sub-fixture-max', backend: 'codex', mode: 'chat' }));
    fs.writeFileSync(path.join(d6, 'session-buffers', 'sess-2-101.buf'), JSON.stringify({ ...OWNER_RECORD, rate_limit_info: { ...OWNER_RECORD.rate_limit_info, unifiedWindows: { ...OWNER_RECORD.rate_limit_info.unifiedWindows, seven_day: { utilization: 0.99, resetsAt: 1790535600 } } } }) + '\n');
    // the foreign account's own session, stating the fixture account's window (a lag shadow's shape)
    fs.writeFileSync(path.join(d6, 'session-meta', 'cw-1-102.json'), JSON.stringify({ accountId: 'sub-foreign', backend: 'claude', mode: 'chat' }));
    fs.writeFileSync(path.join(d6, 'session-buffers', 'sess-1-102.buf'), JSON.stringify(OWNER_RECORD) + '\n');
    const notices6 = [];
    const m6 = create({ rootDir: root6, homeDir: scratchHomeDir, serverNotice: (k) => notices6.push(k) });
    const res6 = m6.runLocalMigrations();
    ok(res6.find((r) => r.id === '2026-09-weekly-lanes-unfold')?.status === 'ran', 'the weekly-lanes unfold is registered and ran');
    const rd6 = (k) => JSON.parse(fs.readFileSync(path.join(cache6, k + '.json'), 'utf-8'));
    const fx = rd6('sub-fixture-max');
    ok(Math.abs(fx.sevenDay.utilization - 0.43) < 1e-9 && fx.sevenDay.resetsAt === 1790535600 && fx.sevenDay.status === 'allowed',
      'the plan week reads 0.43 — the NEWEST windowed event\'s unifiedWindows.seven_day, not the older 0.40, not the rejection\'s 0.99, not the bucket\'s 0.86', JSON.stringify(fx.sevenDay));
    const fable = (fx.scopedWeekly || []).find((s) => s.name === 'Fable');
    ok(fable && Math.abs(fable.utilization - 0.87) < 1e-9 && fable.status === 'allowed_warning' && !(fx.scopedWeekly || []).some((s) => s.name === 'Model cap'),
      'Fable reads 0.87 with the representative\'s warning — named through the sidecar, no placeholder', JSON.stringify(fx.scopedWeekly));
    ok(Math.abs(fx.fiveHour.utilization - 0.09) < 1e-9 && fx.fiveHour.resetsAt === 1790048400, 'the 5-hour lane is exactly what it was (a tail line has no clock; the 5h was never the bucket\'s victim)', JSON.stringify(fx.fiveHour));
    const plan = (fx.limits || []).find((l) => l.limitId === 'plan'), fl = (fx.limits || []).find((l) => l.limitId === 'model:fable');
    ok(plan && plan.windows.find((w) => w.kind === '7d').usedPct === 43 && plan.source === 'rate-limit-event' && fl && fl.windows[0].usedPct === 87,
      'the typed limits agree (plan 7d 43, model:fable 87) and the plan\'s provenance stays the event\'s — the number came from the session\'s own record', JSON.stringify((fx.limits || []).map((l) => [l.limitId, l.source, l.windows.map((w) => [w.kind, w.usedPct])])));
    ok(fx.fetchedAt > incident.fetchedAt && plan.windows.find((w) => w.kind === '7d').measuredAt > incident.fetchedAt,
      'the reading\'s clock never regresses the file\'s freshness stamp (the anchors sweep and both newest-wins merges rank on it)', JSON.stringify({ was: incident.fetchedAt, now: fx.fetchedAt }));
    // (the registry's earlier quota-limits backfill stamps `limits` onto every
    // pre-model file first — its job — so "untouched" is judged on the numbers,
    // the producer and the freshness stamp, never on bytes)
    const same = (k, u) => { const o = rd6(k); return Math.abs(o.sevenDay.utilization - u) < 1e-9 && o.fetchedAt === incident.fetchedAt && (o.limits || []).find((l) => l.limitId === 'plan')?.windows.find((w) => w.kind === '7d').usedPct === Math.round(u * 100); };
    ok(same('sub-panel', 0.86) && rd6('sub-panel').source === 'on-demand', 'a PANEL-sourced plan week is never touched — its number, its producer and its freshness stamp are what the panel left');
    ok(same('sub-orphan', 0.7), 'a candidate with no linked windowed event is left as it was (the next panel or event corrects it)');
    ok(same('sub-foreign', 0.9), 'a candidate whose linked event states ANOTHER account\'s weekly reset is left as it was (the readings-by-window rule)');
    ok(fs.existsSync(path.join(cache6, '.window-sub-fixture-max')) && fs.readFileSync(path.join(cache6, '.window-sub-fixture-max'), 'utf-8') === JSON.stringify(sidecar), 'the established-window sidecar is read, never written');
    const { unfoldWeeklyLanes } = require('../src/weekly-lanes-unfold.js');
    // the archive: the pre-repair object verbatim + a manifest naming the migration
    const adirs6 = fs.readdirSync(path.join(d6, 'archive')).filter((f) => f.startsWith('weekly-lanes-unfold-'));
    const arch6 = adirs6.length === 1 ? JSON.parse(fs.readFileSync(path.join(d6, 'archive', adirs6[0], 'sub-fixture-max.json'), 'utf-8')) : null;
    ok(arch6 && Math.abs(arch6.sevenDay.utilization - 0.86) < 1e-9 && arch6.fetchedAt === incident.fetchedAt && arch6.source === 'rate-limit-event',
      `the pre-repair object (plan 7d 0.86, the incident's stamp) is archived in a dated directory before the rewrite (${adirs6.join(',')})`);
    const man6 = JSON.parse(fs.readFileSync(path.join(d6, 'archive', adirs6[0], '_migration.json'), 'utf-8'));
    ok(man6.migration === '2026-09-weekly-lanes-unfold' && man6.keys.length === 1 && man6.keys[0] === 'sub-fixture-max' && !fs.existsSync(path.join(d6, 'archive', adirs6[0], 'sub-panel.json')),
      'the manifest names the migration and exactly the key it rewrote', JSON.stringify(man6));
    ok(notices6.filter((k) => k === 'weekly-lanes-unfolded').length === 1, 'ONE server notice says what was repaired (a repair nobody can see ran is a repair nobody can verify ran)', JSON.stringify(notices6));
    // the report, per key
    const rep6 = unfoldWeeklyLanes({ dataDir: d6, id: 'again' });
    const verb = (k) => rep6.keys.find((r) => r.key === k)?.action;
    ok(rep6.candidates === 3 && verb('sub-fixture-max') === 'already' && verb('sub-orphan') === 'left' && verb('sub-foreign') === 'left' && verb('sub-panel') === 'kept',
      'IDEMPOTENT + a verb per key: the rewritten key is now `already`, the two candidates without evidence stay `left`, the panel-sourced key is `kept`', JSON.stringify(rep6));
    ok(/is not this account's/.test(rep6.keys.find((r) => r.key === 'sub-foreign').why) && /no live buffer/.test(rep6.keys.find((r) => r.key === 'sub-orphan').why),
      'each `left` names its reason (foreign window vs no linked buffer)');
    ok(fs.readdirSync(path.join(d6, 'archive')).filter((f) => f.startsWith('weekly-lanes-unfold-')).length === 1 && fs.readdirSync(path.join(d6, 'archive', adirs6[0])).length === 2,
      'a second run archives nothing twice');
    // the second run's ledger belt: the registry does not re-run it
    ok(m6.runLocalMigrations().find((r) => r.id === '2026-09-weekly-lanes-unfold')?.status === 'already', 'the ledger records the run (never re-run by content sniffing)');
    // WHAT THE TASKBAR READS: /api/usage's per-account payload over the repaired directory
    // (usage-routes' ingestPassiveUsage re-reads the cache dir on every call)
    {
      const routes = {};
      const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; }, locals: {} };
      const roster = [{ id: 'sub-fixture-max', name: 'Member Max', type: 'subscription', email: null }, { id: 'sub-panel', name: 'Member P', type: 'subscription', email: null }];
      const accounts = { list: () => ({ accounts: roster }), subscriptionStatus: () => ({ loggedIn: false, email: null }), codexGlobalStatus: () => ({ loggedIn: false, email: null }), subCredsPath: (id) => path.join(d6, 'subs', id, '.credentials.json') };
      const { setupUsage } = require('../src/usage-routes.js');
      setupUsage({ app, accounts, activeSessions: new Map(), serverSetting: () => null, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(d6, 'usage-cache.json'), USAGE_CACHE_DIR: cache6, CODEX_SESSIONS_DIR: path.join(d6, 'codex-sessions'), META_DIR: path.join(d6, 'session-meta'), AVAILABLE_MODELS: { claude: [] }, BUFFERS_DIR: path.join(d6, 'session-buffers') });
      const payload = await new Promise((resolve) => routes['GET /api/usage']({}, { json: resolve }));
      const a = payload?.accounts?.['sub-fixture-max'];
      ok(a && Math.abs(a.sevenDay.utilization - 0.43) < 1e-9 && Math.abs(a.fiveHour.utilization - 0.09) < 1e-9 && (a.scopedWeekly || []).find((s) => s.name === 'Fable')?.utilization === 0.87,
        '/api/usage for the repaired key says sevenDay 0.43 · fiveHour 0.09 · Fable 0.87 — what the taskbar donut draws', JSON.stringify(a && { f: a.fiveHour, s: a.sevenDay, sc: a.scopedWeekly }));
      ok(Math.abs(payload?.accounts?.['sub-panel']?.sevenDay?.utilization - 0.86) < 1e-9, '…and the panel-sourced neighbour still says what its panel said (0.86)');
    }
    // ── r2: a REFUSED repair is a FAILED run — retried next boot, never recorded ──
    // (the runner's contract; a report that swallowed an unwritable archive was recorded as applied
    // and the plan week kept the bucket's number for good)
    {
      const root7 = path.join(tmp, 'inst7'); const d7 = path.join(root7, 'data'); const cache7 = path.join(d7, 'usage-cache');
      for (const sub of ['usage-cache', 'session-meta', 'session-buffers', 'subs/sub-r']) fs.mkdirSync(path.join(d7, sub), { recursive: true });
      fs.writeFileSync(path.join(cache7, 'sub-r.json'), JSON.stringify(incident));
      fs.writeFileSync(path.join(cache7, '.window-sub-r'), JSON.stringify(sidecar));
      fs.writeFileSync(path.join(d7, 'session-meta', 'cw-7-100.json'), JSON.stringify({ accountId: 'sub-r', backend: 'claude', mode: 'chat' }));
      fs.writeFileSync(path.join(d7, 'session-buffers', 'sess-7-100.buf'), JSON.stringify(OWNER_RECORD) + '\n');
      fs.writeFileSync(path.join(d7, 'archive'), 'a file where the archive dir must go'); // mkdirSync(archiveDir) fails
      const m7 = create({ rootDir: root7, homeDir: scratchHomeDir, serverNotice: () => { } });
      const res7 = m7.runLocalMigrations().find((r) => r.id === '2026-09-weekly-lanes-unfold');
      const led7 = () => { try { return JSON.parse(fs.readFileSync(path.join(d7, 'migrations.json'), 'utf-8')); } catch { return { applied: {} }; } };
      const plan7 = () => JSON.parse(fs.readFileSync(path.join(cache7, 'sub-r.json'), 'utf-8')).sevenDay.utilization;
      ok(res7?.status === 'failed' && /refused/.test(res7.error || '') && /sub-r \(archive failed/.test(res7.error || ''), 'r2: an unwritable archive makes the run FAIL, naming the key and why', JSON.stringify(res7));
      ok(!led7().applied['2026-09-weekly-lanes-unfold'] && Math.abs(plan7() - 0.86) < 1e-9, 'r2: …no ledger row, and the plan week untouched (archive-before-rewrite held)', JSON.stringify({ ledger: led7().applied, plan: plan7() }));
      const rep7 = unfoldWeeklyLanes({ dataDir: d7, id: 'probe' });
      ok(rep7.refused === 1 && rep7.left === 0 && rep7.keys.find((k) => k.key === 'sub-r')?.action === 'refused', 'r2: the report says `refused`, not `left` (a refusal is the repair\'s own failure, not missing evidence)', JSON.stringify(rep7.keys));
      fs.rmSync(path.join(d7, 'archive'));
      const res7b = m7.runLocalMigrations().find((r) => r.id === '2026-09-weekly-lanes-unfold');
      ok(res7b?.status === 'ran' && !!led7().applied['2026-09-weekly-lanes-unfold'] && Math.abs(plan7() - 0.43) < 1e-9, 'r2: …the next boot retries, repairs (plan 7d 0.43) and records the run', JSON.stringify({ res7b, plan: plan7() }));
      const root8 = path.join(tmp, 'inst8'); fs.mkdirSync(path.join(root8, 'data'), { recursive: true });
      const rep8 = unfoldWeeklyLanes({ dataDir: path.join(root8, 'data'), id: 'probe' });
      ok(rep8.unreadable === null && rep8.refused === 0 && rep8.scanned === 0, 'r2 CONTROL: no usage-cache dir at all (a fresh instance) is nothing to repair — a success, never a retry loop', JSON.stringify(rep8));
    }
  }

  // ── the channel credential-key stamp (2026-09-22: the account model) ──
  // A record from before the model is stamped ONCE with the integration's
  // CURRENT key through the ENGINE (adapters.json's one writer); a record
  // with no integration row is left alone; an already-stamped account keeps
  // its own key; a second boot with the row's pick flipped changes nothing.
  {
    const ENG = require('../src/server/channels-engine.js');
    const STORE = require('../src/server/integration-store.js');
    const quiet = { log() {}, warn() {}, error() {} };
    const PRESETS = [
      { key: 'org1', label: 'Org 1', clientId: 'org1.apps.googleusercontent.com', clientSecret: 'org1-secret-000000' },
      { key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' },
    ];
    const legacyRec = (id, kind, extra = {}) => ({ id, kind, label: kind, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [], user: null }, options: {}, state: {}, lastPass: null, consecutiveFailures: 0, failureItem: null, lastAuthError: null, lastAuthAt: null, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null, ...extra });
    const root9 = path.join(tmp, 'inst9'); const d9 = path.join(root9, 'data'); fs.mkdirSync(path.join(d9, 'channels'), { recursive: true });
    const adaptersFile = path.join(d9, 'channels', 'adapters.json');
    fs.writeFileSync(adaptersFile, JSON.stringify({ v: 1, adapters: [legacyRec('gmail', 'gmail'), legacyRec('fake-poll', 'fake-poll'), legacyRec('gmail:0badcafe', 'gmail', { credentialKey: 'cluster:channels' })] }));
    const integrations = STORE.create({ dataDir: d9, env: {}, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
    integrations.setClusterKey('gmail', 'org1');   // the row's pick at the upgrade boot
    const eng = ENG.create({ dataDir: d9, env: {}, integrations, log: quiet });   // never started: no scheduler, no flows
    const m9 = create({ rootDir: root9, homeDir: scratchHomeDir, serverNotice: () => { }, channels: eng });
    const disk = () => JSON.parse(fs.readFileSync(adaptersFile, 'utf-8')).adapters;
    const drain = () => eng.store.adapters.update(() => { });   // the serialized door — the stamp's write is queued behind it
    const res9 = m9.runLocalMigrations().find((r) => r.id === '2026-09-channel-credential-key');
    await drain();
    ok(res9?.status === 'ran' && disk().find((r) => r.id === 'gmail').credentialKey === 'cluster:org1', 'a legacy gmail record is stamped with the integration\'s CURRENT key (cluster:org1) through the engine\'s door', JSON.stringify({ res9, disk: disk().map((r) => [r.id, r.credentialKey]) }));
    ok(!('credentialKey' in disk().find((r) => r.id === 'fake-poll')), 'a record with no integration row is left alone');
    ok(disk().find((r) => r.id === 'gmail:0badcafe').credentialKey === 'cluster:channels', 'an already-stamped further account keeps ITS key');
    ok(eng.adapterRecords().adapters.find((r) => r.id === 'gmail').credentialKey === 'cluster:org1', 'the LIVE record carries the stamp (an adapter built from now on reads it)');
    integrations.setClusterKey('gmail', 'channels');   // the pick flips before the next boot
    const res9b = m9.runLocalMigrations().find((r) => r.id === '2026-09-channel-credential-key');
    await drain();
    ok(res9b?.status === 'already' && disk().find((r) => r.id === 'gmail').credentialKey === 'cluster:org1', 'idempotent: the next boot skips it by ledger and the stamp stays org1 whatever the pick says now');
    const again = eng.stampCredentialKeys(); await again.write;
    ok(again.stamped.length === 0 && again.skipped.map((s) => `${s.id}:${s.why}`).sort().join() === 'fake-poll:no-integration,gmail:0badcafe:already,gmail:already', 'the stamp itself is idempotent: every record `already` or `no-integration`', JSON.stringify(again.skipped));
    // no engine on this boot: a legacy REAL record makes the run FAIL by name (retried next boot); no records at all is a success
    const root10 = path.join(tmp, 'inst10'); const d10 = path.join(root10, 'data'); fs.mkdirSync(path.join(d10, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(d10, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [legacyRec('gmail', 'gmail')] }));
    const res10 = create({ rootDir: root10, homeDir: scratchHomeDir, serverNotice: () => { } }).runLocalMigrations().find((r) => r.id === '2026-09-channel-credential-key');
    const led10 = JSON.parse(fs.readFileSync(path.join(d10, 'migrations.json'), 'utf-8'));
    ok(res10?.status === 'failed' && /no channels engine/.test(res10.error) && /gmail/.test(res10.error) && !led10.applied['2026-09-channel-credential-key'], 'without an engine a legacy real record FAILS the run by name — never recorded as a no-op', JSON.stringify(res10));
    const root11 = path.join(tmp, 'inst11'); fs.mkdirSync(path.join(root11, 'data'), { recursive: true });
    const res11 = create({ rootDir: root11, homeDir: scratchHomeDir, serverNotice: () => { } }).runLocalMigrations().find((r) => r.id === '2026-09-channel-credential-key');
    ok(res11?.status === 'ran', 'CONTROL: a fresh instance (no adapters.json) is nothing to stamp — a success');
    // the resolver names nothing (no presets, no own values): the record is left unstamped and the run still succeeds
    const root12 = path.join(tmp, 'inst12'); const d12 = path.join(root12, 'data'); fs.mkdirSync(path.join(d12, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(d12, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [legacyRec('gmail', 'gmail')] }));
    const s12 = STORE.create({ dataDir: d12, env: {}, broadcast: () => {}, drivePresets: () => [], log: quiet });
    const e12 = ENG.create({ dataDir: d12, env: {}, integrations: s12, log: quiet });
    const res12 = create({ rootDir: root12, homeDir: scratchHomeDir, serverNotice: () => { }, channels: e12 }).runLocalMigrations().find((r) => r.id === '2026-09-channel-credential-key');
    await e12.store.adapters.update(() => { });
    ok(res12?.status === 'ran' && !('credentialKey' in JSON.parse(fs.readFileSync(path.join(d12, 'channels', 'adapters.json'), 'utf-8')).adapters[0]), 'a record whose integration resolves to nothing is left unstamped (it keeps following the row\'s pick) and the run succeeds');
    // ── verifier r1: THE TOKEN'S OWN EVIDENCE WINS ──
    // A Gmail token records the preset key it was exchanged under
    // (`clusterKey`; null = the user's own values); the stamp names THAT
    // client when this instance still offers it, whatever the row's pick says
    // now — the pre-fix migration stamped the pick, so an org1-minted token
    // was re-bound to the channels client the moment the pick had flipped
    // before the upgrade (Google: invalid_client), the exact case the model
    // exists for. A key the token names but the env withdrew, a token that
    // names nothing (Lark), no token, an undecryptable token ⇒ the row's pick.
    const SB = require('../src/secret-box.js');
    const root13 = path.join(tmp, 'inst13'); const d13 = path.join(root13, 'data'); fs.mkdirSync(path.join(d13, 'channels'), { recursive: true });
    const box13 = SB.secretBox(path.join(d13, ENG.KEY_FILE));   // the engine's own box — the key file is minted here, the engine reads the same one
    const held = (id, kind, tok, extra = {}) => legacyRec(id, kind, { auth: { tokenEnc: box13.enc(JSON.stringify({ access_token: 'at-x', expiresAt: 1, refresh_token: 'rt-x', scopes: ['s'], ...tok })), expiresAt: null, scopes: ['s'], user: 'member.x@example.com' }, ...extra });
    fs.writeFileSync(path.join(d13, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [
      held('gmail', 'gmail', { clusterKey: 'org1' }),                   // minted under org1 — the row's pick is channels
      held('gmail:00000001', 'gmail', { clusterKey: null }),            // minted under the user's OWN values (gmail writes null for source user) — none saved now
      held('gmail:00000002', 'gmail', { clusterKey: 'gone' }),          // minted under a preset the env no longer offers
      held('lark', 'lark', {}),                                         // a Lark token names nothing
      legacyRec('gmail:00000003', 'gmail'),                             // never authenticated
      legacyRec('gmail:00000004', 'gmail', { auth: { tokenEnc: 'not-a-blob', expiresAt: null, scopes: [], user: null } }),   // undecryptable
    ] }));
    const s13 = STORE.create({ dataDir: d13, env: { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'lark', key: 'tA', label: 'Tenant A', values: { appId: 'cli_a', appSecret: 'fs-a' } }]) }, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
    s13.setClusterKey('gmail', 'channels');   // the pick flipped BEFORE the upgrade — the pre-fix symptom
    const larkPick = s13.resolveIntegration('lark').credentialKey;
    ok(s13.resolveIntegration('gmail').credentialKey === 'cluster:channels' && larkPick === 'cluster:tA', `FIXTURE: the gmail row's pick is channels, the lark row's is its one tenant (${larkPick})`);
    const e13 = ENG.create({ dataDir: d13, env: {}, integrations: s13, log: quiet });
    const res13 = create({ rootDir: root13, homeDir: scratchHomeDir, serverNotice: () => { }, channels: e13 }).runLocalMigrations().find((r) => r.id === '2026-09-channel-credential-key');
    await e13.store.adapters.update(() => { });
    const k13 = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(d13, 'channels', 'adapters.json'), 'utf-8')).adapters.map((r) => [r.id, r.credentialKey || null]));
    ok(res13?.status === 'ran' && k13.gmail === 'cluster:org1', `the token's OWN client wins: an org1-minted token is stamped cluster:org1 although the row's pick is channels (${JSON.stringify(k13)})`);
    ok(k13['gmail:00000001'] === 'cluster:channels' && k13['gmail:00000002'] === 'cluster:channels' && k13['gmail:00000003'] === 'cluster:channels' && k13['gmail:00000004'] === 'cluster:channels', 'a token naming `own` with no values saved, a withdrawn preset, no token, an undecryptable token ⇒ the row\'s pick (what refreshed them until now)');
    ok(k13.lark === 'cluster:tA', 'a Lark token names nothing ⇒ the row\'s pick');
    // the report names the evidence per record (the [migrate] line prints it)
    const root14 = path.join(tmp, 'inst14'); const d14 = path.join(root14, 'data'); fs.mkdirSync(path.join(d14, 'channels'), { recursive: true });
    const box14 = SB.secretBox(path.join(d14, ENG.KEY_FILE));
    const held14 = (id, tok) => legacyRec(id, 'gmail', { auth: { tokenEnc: box14.enc(JSON.stringify({ access_token: 'at-y', expiresAt: 1, refresh_token: 'rt-y', scopes: ['s'], ...tok })), expiresAt: null, scopes: ['s'], user: null } });
    fs.writeFileSync(path.join(d14, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [held14('gmail', { clusterKey: null }), held14('gmail:00000005', { clusterKey: 'org1' }), held14('gmail:00000006', { clusterKey: 'gone' })] }));
    const s14 = STORE.create({ dataDir: d14, env: {}, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
    s14.setIntegration('gmail', { clientId: 'own.apps.googleusercontent.com', clientSecret: 'own-sec-01' });   // the user's own values: the row's pick is `own`, and `own` is OFFERED
    const e14 = ENG.create({ dataDir: d14, env: {}, integrations: s14, log: quiet });
    const rep14 = e14.stampCredentialKeys(); await rep14.write;
    const by14 = Object.fromEntries(rep14.stamped.map((r) => [r.id, r]));
    ok(by14.gmail && by14.gmail.key === 'own' && by14.gmail.evidence === 'token' && by14.gmail.tokenKey === 'own', `a token minted under the user's own values is stamped \`own\` with evidence 'token' once the values are complete (${JSON.stringify(by14.gmail)})`);
    ok(by14['gmail:00000005'] && by14['gmail:00000005'].key === 'cluster:org1' && by14['gmail:00000005'].evidence === 'token', 'an org1-minted token is stamped org1 with evidence \'token\' even while the row\'s pick is own');
    ok(by14['gmail:00000006'] && by14['gmail:00000006'].key === 'own' && by14['gmail:00000006'].evidence === 'row-pick' && by14['gmail:00000006'].tokenKey === 'cluster:gone', 'a withdrawn key falls to the row\'s pick with evidence \'row-pick\' and the token\'s own key NAMED beside it', JSON.stringify(by14['gmail:00000006']));
    try { eng.stop(); e12.stop(); e13.stop(); e14.stop(); } catch { }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
