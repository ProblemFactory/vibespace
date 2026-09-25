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
    // r4: an account-bound row has no card any more — its keyless pick is the
    // cluster's (`prefer` > the only one), so the pick is driven by the preset
    // LIST: org1 alone at the upgrade boot, both (⇒ prefer `channels`) after
    const presets9 = { list: [PRESETS[0]] };
    const integrations = STORE.create({ dataDir: d9, env: {}, broadcast: () => {}, drivePresets: () => presets9.list, log: quiet });
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
    presets9.list = PRESETS.slice();   // the pick flips (prefer channels) before the next boot
    ok(integrations.resolveIntegration('gmail').credentialKey === 'cluster:channels', 'FIXTURE: the row\'s pick is now channels');
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
    // the row's pick is `channels` (both presets, prefer) — flipped BEFORE the upgrade, the pre-fix symptom
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
    // the retired card's own values, as a pre-r4 instance left them in
    // integrations.json (the card that wrote them is gone — r4 — so they are
    // written here the way the store sealed them: under `.integrations-key`)
    fs.writeFileSync(path.join(d14, 'integrations.json'), JSON.stringify({ version: 1, integrations: { gmail: { values: { clientId: 'own.apps.googleusercontent.com', clientSecret: SB.secretBox(path.join(d14, STORE.KEY_FILE)).enc('own-sec-01') }, clusterKey: null } } }));
    const s14 = STORE.create({ dataDir: d14, env: {}, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
    const e14 = ENG.create({ dataDir: d14, env: {}, integrations: s14, log: quiet });
    const rep14 = e14.stampCredentialKeys(); await rep14.write;
    const by14 = Object.fromEntries(rep14.stamped.map((r) => [r.id, r]));
    ok(by14.gmail && by14.gmail.key === 'own' && by14.gmail.evidence === 'token' && by14.gmail.tokenKey === 'own', `a token minted under the user's own values is stamped \`own\` with evidence 'token' while those values are complete (r4: \`own\` is no longer OFFERED, but a token minted under it stays bound to it — the own → custom copy below moves the values onto the record) (${JSON.stringify(by14.gmail)})`);
    ok(by14['gmail:00000005'] && by14['gmail:00000005'].key === 'cluster:org1' && by14['gmail:00000005'].evidence === 'token', 'an org1-minted token is stamped org1 with evidence \'token\'');
    ok(by14['gmail:00000006'] && by14['gmail:00000006'].key === 'cluster:channels' && by14['gmail:00000006'].evidence === 'row-pick' && by14['gmail:00000006'].tokenKey === 'cluster:gone', 'a withdrawn key falls to the row\'s pick (r4: the cluster\'s — the saved own values are never a pick) with evidence \'row-pick\' and the token\'s own key NAMED beside it', JSON.stringify(by14['gmail:00000006']));
    try { eng.stop(); e12.stop(); e13.stop(); e14.stop(); } catch { }
  }

  // ── 2026-09-channel-custom-client-inline (r4, docs/design-integrations-per-account.zh.md §2.6) ──
  // A channel account still naming `own` gets the retired card's values
  // (`.integrations-key`) RE-SEALED under `.channels-key` onto its OWN record,
  // stamped `custom` only after that write landed — reader-side (the engine
  // runs it when the record is read) AND at boot through this migration (the
  // same function). Idempotent twice; a missing integration key fails BY NAME
  // and mints no key; the PRE-FIX engine (348aa226) as the control: under the
  // r4 store its `own` account resolves to NOTHING (own-retired) — the account
  // would be dead without the copy.
  {
    const ENG = require('../src/server/channels-engine.js');
    const STORE = require('../src/server/integration-store.js');
    const SB = require('../src/secret-box.js');
    const quiet = { log() {}, warn() {}, error() {} };
    const ID = '2026-09-channel-custom-client-inline';
    const OWN_SECRET = 'own-client-SECRET-9q8w7e';
    const PRESETS = [{ key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' }];
    const legacyOwn = (d, extra = {}) => {
      fs.mkdirSync(path.join(d, 'channels'), { recursive: true });
      const ch = SB.secretBox(path.join(d, ENG.KEY_FILE));
      const rec = { id: 'gmail', kind: 'gmail', label: 'Gmail', enabled: true, credentialKey: 'own', auth: { tokenEnc: ch.enc(JSON.stringify({ access_token: 'at', expiresAt: 1, refresh_token: 'rt', scopes: ['s'], clusterKey: null })), expiresAt: null, scopes: ['s'], user: 'member.o@example.com' }, options: { query: 'label:INBOX' }, state: {}, lastPass: null, consecutiveFailures: 0, failureItem: null, lastAuthError: null, lastAuthAt: null, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null, ...extra };
      fs.writeFileSync(path.join(d, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [rec, { ...rec, id: 'gmail:0000cafe', credentialKey: 'cluster:channels', auth: { tokenEnc: null, expiresAt: null, scopes: [], user: null } }] }));
      const ib = SB.secretBox(path.join(d, STORE.KEY_FILE));
      fs.writeFileSync(path.join(d, 'integrations.json'), JSON.stringify({ version: 1, integrations: { gmail: { values: { clientId: 'own.apps.googleusercontent.com', clientSecret: ib.enc(OWN_SECRET) }, clusterKey: null } } }));
      return { ch, ib };
    };
    const disk = (d) => JSON.parse(fs.readFileSync(path.join(d, 'channels', 'adapters.json'), 'utf-8')).adapters;
    // ① the migration: copy + stamp, in that order, idempotent twice
    const root15 = path.join(tmp, 'inst15'); const d15 = path.join(root15, 'data');
    const { ch: ch15, ib: ib15 } = legacyOwn(d15);
    const s15 = STORE.create({ dataDir: d15, env: {}, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
    const e15 = ENG.create({ dataDir: d15, env: {}, integrations: s15, log: quiet });
    const writes15 = [];
    const upd = e15.store.adapters.update;
    e15.store.adapters.update = (fn) => upd(fn).then((r) => { const g = disk(d15).find((x) => x.id === 'gmail'); writes15.push({ key: g.credentialKey, copied: !!(g.credential && g.credential.appSecretEnc) }); return r; });
    const m15 = create({ rootDir: root15, homeDir: scratchHomeDir, serverNotice: () => { }, channels: e15 });
    const res15 = m15.runLocalMigrations().find((r) => r.id === ID);
    await e15.inlineLegacyClient(e15.adapterRecords().adapters.find((x) => x.id === 'gmail'));   // the in-flight copy (single-flight: THIS call returns it)
    const g15 = disk(d15).find((x) => x.id === 'gmail');
    ok(res15?.status === 'ran' && g15.credentialKey === 'custom' && g15.credential.appId === 'own.apps.googleusercontent.com', 'the legacy `own` account now names `custom` with the saved client id ON its record', JSON.stringify({ res15, key: g15.credentialKey, cred: g15.credential && g15.credential.appId }));
    ok(ch15.dec(g15.credential.appSecretEnc) === OWN_SECRET, 'the secret is RE-SEALED under `.channels-key` (it opens with the channels key)…');
    let openedByIntegrationsKey = true; try { ib15.dec(g15.credential.appSecretEnc); } catch { openedByIntegrationsKey = false; }
    ok(!openedByIntegrationsKey && !fs.readFileSync(path.join(d15, 'channels', 'adapters.json'), 'utf-8').includes(OWN_SECRET), '…and NOT under `.integrations-key` (a new seal, not a copied blob); no plaintext on disk');
    ok(writes15.length >= 2 && writes15[0].key === 'own' && writes15[0].copied === true && writes15.slice(-1)[0].key === 'custom', `the client landed FIRST (own + credential) and the \`custom\` stamp AFTER it (${JSON.stringify(writes15)})`);
    ok(disk(d15).find((x) => x.id === 'gmail:0000cafe').credentialKey === 'cluster:channels' && !disk(d15).find((x) => x.id === 'gmail:0000cafe').credential, 'a preset account is untouched');
    ok(JSON.parse(fs.readFileSync(path.join(d15, 'integrations.json'), 'utf-8')).integrations.gmail.values.clientId === 'own.apps.googleusercontent.com', 'integrations.json\'s values stay in place (no reader, never deleted)');
    const again15 = e15.inlineLegacyClients(); await again15.write;
    const res15b = m15.runLocalMigrations().find((r) => r.id === ID);
    ok(again15.copied.length === 0 && again15.failed.length === 0 && res15b?.status === 'already' && disk(d15).find((x) => x.id === 'gmail').credentialKey === 'custom', 'idempotent twice: the function finds nothing to copy and the ledger skips the row');
    ok(e15.clientFor(e15.adapterRecords().adapters.find((x) => x.id === 'gmail')).values.clientSecret === OWN_SECRET, 'the account resolves its OWN client from the record now');
    // ② reader-side: no migration at all, the record is merely READ
    const root16 = path.join(tmp, 'inst16'); const d16 = path.join(root16, 'data');
    legacyOwn(d16);
    const s16 = STORE.create({ dataDir: d16, env: {}, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
    const e16 = ENG.create({ dataDir: d16, env: {}, integrations: s16, log: quiet });
    const live16 = e16.adapterRecords().adapters.find((x) => x.id === 'gmail');
    const served = e16.clientFor(live16);
    ok(served.source === 'user' && served.values.clientId === 'own.apps.googleusercontent.com' && served.credentialKey === 'own', 'reader-side: a read of the `own` record is SERVED from the legacy values…');
    await e16.inlineLegacyClient(live16);
    ok(disk(d16).find((x) => x.id === 'gmail').credentialKey === 'custom', '…and the read itself scheduled the copy: the record is `custom` without any migration having run');
    // ③ a missing integration key fails BY NAME and mints no key
    const root17 = path.join(tmp, 'inst17'); const d17 = path.join(root17, 'data');
    legacyOwn(d17);
    fs.unlinkSync(path.join(d17, STORE.KEY_FILE));
    const s17 = STORE.create({ dataDir: d17, env: {}, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
    const e17 = ENG.create({ dataDir: d17, env: {}, integrations: s17, log: quiet });
    const res17 = create({ rootDir: root17, homeDir: scratchHomeDir, serverNotice: () => { }, channels: e17 }).runLocalMigrations().find((r) => r.id === ID);
    const led17 = JSON.parse(fs.readFileSync(path.join(d17, 'migrations.json'), 'utf-8'));
    ok(res17?.status === 'failed' && /gmail \(integration-key-missing/.test(res17.error) && /\.integrations-key is missing/.test(res17.error) && !led17.applied[ID], 'a missing `.integrations-key` FAILS the run BY NAME (the account, the code, the file) — never recorded, retried next boot', JSON.stringify(res17));
    ok(!fs.existsSync(path.join(d17, STORE.KEY_FILE)) && disk(d17).find((x) => x.id === 'gmail').credentialKey === 'own', 'no key was minted over the missing one, and the account keeps `own`');
    // no engine: an `own` record fails the run by name; none is a success
    const root18 = path.join(tmp, 'inst18'); const d18 = path.join(root18, 'data'); legacyOwn(d18);
    const res18 = create({ rootDir: root18, homeDir: scratchHomeDir, serverNotice: () => { } }).runLocalMigrations().find((r) => r.id === ID);
    ok(res18?.status === 'failed' && /no channels engine/.test(res18.error) && /gmail/.test(res18.error), 'without an engine an `own` record FAILS the run by name');
    const root19 = path.join(tmp, 'inst19'); fs.mkdirSync(path.join(root19, 'data'), { recursive: true });
    ok(create({ rootDir: root19, homeDir: scratchHomeDir, serverNotice: () => { } }).runLocalMigrations().find((r) => r.id === ID)?.status === 'ran', 'CONTROL: a fresh instance (no adapters.json) is a dry run — a success (this instance: zero `own` accounts)');
    // ④ THE PRE-FIX CONTROL: the base engine under the r4 store — its `own` account resolves to nothing
    const __dirname_ = path.dirname(new URL(import.meta.url).pathname);
    const { gitEnvFrom } = await import('./git-env.mjs');   // a pre-push hook exports GIT_DIR — the one sanitized git env
    let preSrc = null;
    try { preSrc = require('node:child_process').execFileSync('git', ['show', '348aa226:src/server/channels-engine.js'], { cwd: path.join(__dirname_, '..'), env: gitEnvFrom(process.env), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { preSrc = null; }
    if (!preSrc) console.log('  … SKIP the pre-fix engine control (git history for 348aa226 not present — a shallow clone)');
    else {
      // the copy lives OUTSIDE the tree (scripts/mutant-copy.mjs, B-0220 — `require`
      // re-bound to the real engine's path, so its relative requires resolve as a
      // sibling's); the scratch dir goes at exit
      const { mutantCopies } = await import('./mutant-copy.mjs');
      const MUTM = mutantCopies('migrations', path.join(__dirname_, '..'));
      const copy = MUTM.write(path.join(__dirname_, '..', 'src', 'server', 'channels-engine.js'), preSrc, 'pre-r4');
      ok(!path.relative(path.join(__dirname_, '..'), copy).startsWith('src'), 'the pre-fix engine copy is written outside the tree');
      try {
        const PRE = require(copy);
        const root20 = path.join(tmp, 'inst20'); const d20 = path.join(root20, 'data'); legacyOwn(d20);
        const s20 = STORE.create({ dataDir: d20, env: {}, broadcast: () => {}, drivePresets: () => PRESETS, log: quiet });
        const e20 = PRE.create({ dataDir: d20, env: {}, integrations: s20, log: quiet });
        const res20 = create({ rootDir: root20, homeDir: scratchHomeDir, serverNotice: () => { }, channels: e20 }).runLocalMigrations().find((r) => r.id === ID);
        const f20 = e20.adapterView(e20.adapterRecords().adapters.find((x) => x.id === 'gmail')).credential;
        ok(res20?.status === 'failed' && disk(d20).find((x) => x.id === 'gmail').credentialKey === 'own' && f20.source === 'none' && f20.whyCode === 'own-retired', `PRE-FIX CONTROL: the pre-r4 engine has no copy (the run fails "no channels engine" — it lacks the function) and its \`own\` account resolves to NOTHING under the r4 store (${f20.whyCode}) — the account the copy keeps alive`);
        e20.stop();
      } finally { try { fs.rmSync(MUTM.dir, { recursive: true, force: true }); } catch { } }
    }
    try { e15.stop(); e16.stop(); e17.stop(); } catch { }
  }

  // ── 2026-09-spend-notices-expire (2.369.152, "SPEND NOTICES LIVED FOREVER AS ACTIONS") ──
  // The fixture is shaped like the owner's store (measured 2026-09-22, every
  // text redacted to a template): 13 Spending items filed before the notice
  // lane existed (no kind ⇒ action) and 137–288 h old, 2 fresh Spending
  // notices, one real action from a session, one resolved Spending item.
  {
    const { UserTodoManager } = require('../src/user-todos.js');
    const { badgeCounts } = await import('../src/lib/user-todos-layout.js');
    const ID = '2026-09-spend-notices-expire';
    const H = 3600e3;
    const fixture = (now) => {
      const items = [];
      const ages = [288, 285, 283, 268, 268, 247, 192, 188, 187, 174, 147, 147, 137];
      ages.forEach((h, i) => items.push({ id: 'ut-old' + i, sessionKey: 'accounts', text: i % 3 === 2 ? `VibeSpace refused the Stop bookkeeping mini-turn in "conv ${i}"` : `Account ${i} has used 10 of its 12 unattended turns ${i % 2 ? 'today' : 'this hour'} (83%).`, detail: 'd', urgency: 'normal', status: 'open', by: 'agent', sessionName: 'Spending', jobId: null, createdAt: now - h * H, resolvedAt: null, resolvedBy: null }));
      for (const i of [0, 1]) items.push({ id: 'ut-fresh' + i, sessionKey: 'accounts', text: `Account F${i} has used 24 of its 30 unattended turns this hour (80%).`, detail: 'd', urgency: 'normal', kind: 'notice', status: 'open', by: 'agent', sessionName: 'Spending', jobId: null, i18n: null, createdAt: now - 10 * 60e3, resolvedAt: null, resolvedBy: null });
      items.push({ id: 'ut-act', sessionKey: 'claude:00000000-0000-4000-8000-000000000001', text: 'Pick the schema for the export', detail: null, urgency: 'high', kind: 'action', status: 'open', by: 'agent', sessionName: 'some conversation', jobId: null, createdAt: now - 200 * H, resolvedAt: null, resolvedBy: null });
      items.push({ id: 'ut-res', sessionKey: 'accounts', text: 'Account R has used 10 of its 12 unattended turns this hour (83%).', detail: 'd', urgency: 'normal', status: 'done', by: 'agent', sessionName: 'Spending', jobId: null, createdAt: now - 300 * H, resolvedAt: now - 290 * H, resolvedBy: 'user' });
      return { items };
    };
    const setup = (name) => {
      const root = path.join(tmp, name); const d = path.join(root, 'data'); fs.mkdirSync(d, { recursive: true });
      const now = Date.now();
      fs.writeFileSync(path.join(d, 'user-todos.json'), JSON.stringify(fixture(now)));
      return { root, d, now };
    };
    const byId = (items) => Object.fromEntries(items.map((i) => [i.id, i]));
    const judge = (items, t0, t1) => {
      const b = byId(items);
      const old = Array.from({ length: 13 }, (_, i) => b['ut-old' + i]);
      return {
        // resolvedAt = when it SHOULD have expired (filing + 24 h: the fixture's
        // details name no scope), never the upgrade boot — the LOW-2 finding
        oldAll: old.every((x) => x.kind === 'notice' && x.status === 'done' && x.resolvedBy === 'expired' && x.resolvedAt === x.createdAt + 24 * H),
        fresh: [b['ut-fresh0'], b['ut-fresh1']].every((x) => x.kind === 'notice' && x.status === 'open' && x.expiresAt === x.createdAt + 24 * H),
        action: b['ut-act'].status === 'open' && b['ut-act'].kind === 'action' && b['ut-act'].expiresAt == null,
        badge: badgeCounts(items.filter((x) => x.status === 'open')),
      };
    };

    // (a) THROUGH THE LIVE STORE (the production wiring: server.js hands the manager in)
    {
      const { root, d, now } = setup('inst-spend-live');
      let broadcasts = 0;
      const live = new UserTodoManager({ dataDir: d, expirySweepMs: 0, onChange: () => { broadcasts++; } });
      const b0 = broadcasts;
      const t0 = Date.now();
      const res = create({ rootDir: root, homeDir: scratchHomeDir, serverNotice: () => { }, userTodos: () => live }).runLocalMigrations().find((r) => r.id === ID);
      const t1 = Date.now();
      // LOW-1: read the FILE before anything else touches the store — the
      // migration flushed the live store's 500 ms debounce itself, so the
      // reshaping is on disk before the runner wrote applied[id]
      const disk0 = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf-8')).items;
      ok(judge(disk0, t0, t1).oldAll && judge(disk0, t0, t1).fresh && live._writeTimer === null, 'the live path FLUSHES too: when run() returns the file already carries the reshaping and no debounced write is pending (the ledger row never lands before the data)', { pending: !!live._writeTimer });
      const j = judge(live._state.items, t0, t1);
      ok(res?.status === 'ran' && j.oldAll, 'the 13 stale Spending items become notices AND are resolved done/expired at the end of the window they were about (kept in the store, never deleted)', res);
      const newestRetired = Math.max(...live._state.items.filter((x) => /^ut-old/.test(x.id)).map((x) => x.resolvedAt));
      ok(newestRetired <= t0 - (137 - 24) * H, 'the retirements sort as OLD history: the newest is 113 h in the past, not the upgrade boot', { hoursAgo: (t0 - newestRetired) / H });
      ok(j.fresh, 'the 2 fresh Spending notices stay open and gain expiresAt = filing + 24 h (they can no longer live forever either)', live._state.items.filter((x) => /^ut-fresh/.test(x.id)).map((x) => [x.status, x.expiresAt - x.createdAt]));
      ok(j.action, 'the session\'s own action is untouched (no kind change, no expiry)', byId(live._state.items)['ut-act']);
      const r = byId(live._state.items)['ut-res'];
      ok(r.status === 'done' && r.resolvedBy === 'user' && r.resolvedAt === now - 290 * H && r.kind === 'notice', 'the already-resolved Spending item keeps its status/resolvedBy/resolvedAt (it is only re-kinded, so a later ↺ reopens it as a notice)', r);
      ok(j.badge.action.length === 1 && j.badge.notices === 2, 'the badge: 1 action (the real one), 2 notices — was 14 actions', { action: j.badge.action.length, notices: j.badge.notices });
      ok(broadcasts - b0 === 1, 'ONE broadcast for the whole reshaping (every client sees it live)', broadcasts - b0);
      live.setStatus('ut-act', 'done');
      ok(live.snapshot().resolved[0]?.id === 'ut-act', 'a resolution made after the upgrade tops Recently resolved (the 13 retirements do not crowd it out)', live.snapshot().resolved.slice(0, 3).map((x) => x.id));
      live.setStatus('ut-act', 'open');
      live.flush();
      const disk = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf-8')).items;
      ok(judge(disk, t0, t1).oldAll, 'the live store persisted it through its own atomic writer');
      const led = JSON.parse(fs.readFileSync(path.join(d, 'migrations.json'), 'utf-8'));
      const rep = led.reports && led.reports[ID];
      ok(!!led.applied[ID] && rep && rep.matched === 16 && rep.rekinded === 14 && rep.expired === 13 && rep.stamped === 2 && rep.store === 'live' && rep.at === led.applied[ID], 'the ledger row carries the counts (matched 16, rekinded 14, expired 13, stamped 2) beside its timestamp', rep);
      // run-at-most-once: a stale Spending action added after the upgrade is NOT swept by a second boot
      live._state.items.push({ ...fixture(Date.now()).items[0], id: 'ut-late' });
      const res2 = create({ rootDir: root, homeDir: scratchHomeDir, serverNotice: () => { }, userTodos: live }).runLocalMigrations().find((r) => r.id === ID);
      ok(res2?.status === 'already' && byId(live._state.items)['ut-late'].status === 'open', 'run-at-most-once: the next boot skips it by ledger (a later item is untouched)', res2);
    }

    // (b) NO LIVE STORE (a suite, a boot without the inbox): a PRIVATE manager on the file, flushed, no timer left behind
    {
      const { root, d } = setup('inst-spend-private');
      const t0 = Date.now();
      const res = create({ rootDir: root, homeDir: scratchHomeDir, serverNotice: () => { } }).runLocalMigrations().find((r) => r.id === ID);
      const t1 = Date.now();
      const disk = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf-8')).items;
      const j = judge(disk, t0, t1);
      ok(res?.status === 'ran' && res.report?.store === 'private' && j.oldAll && j.fresh && j.action, 'without a live store the migration writes through a private manager and flushes before it returns', res);
      const root2 = path.join(tmp, 'inst-spend-absent'); fs.mkdirSync(path.join(root2, 'data'), { recursive: true });
      const res3 = create({ rootDir: root2, homeDir: scratchHomeDir, serverNotice: () => { } }).runLocalMigrations().find((r) => r.id === ID);
      ok(res3?.status === 'ran' && res3.report?.store === 'absent' && !fs.existsSync(path.join(root2, 'data', 'user-todos.json')), 'CONTROL: no store on disk is nothing to do — no file is created', res3);
    }

    // (c) NEGATIVE CONTROL — the pre-fix registry (this row absent): the same
    // fixture keeps 13 stale open ACTIONS colouring the badge, so the legs above
    // fail on the code without the migration
    {
      const { root, d } = setup('inst-spend-control');
      const m = create({ rootDir: root, homeDir: scratchHomeDir, serverNotice: () => { } });
      runMigrations({ ledgerPath: path.join(d, 'migrations.json'), migrations: m.MIGRATIONS.filter((x) => x.id !== ID), log: () => { }, warn: () => { } });
      const disk = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf-8')).items;
      const j = judge(disk, 0, Date.now());
      ok(!j.oldAll && j.badge.action.length === 14, 'CONTROL: without the row the 13 stale items stay open actions (badge 14 actions) — the leg fails on it', { action: j.badge.action.length });
      // a store-age sweep alone would not do it either: expireDue never touches an item without expiresAt
      const live = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
      ok(live.expireDue(Date.now() + 1000 * H) === 0, 'CONTROL: the store\'s own sweep leaves them (expiry is declared by a producer, never inferred) — the migration is what moves them');
    }

    // (d) NEGATIVE CONTROL for the live-path flush (LOW-1): a patched copy of
    // the registry whose flush is back behind `if (priv)` — the pre-fix run —
    // leaves the FILE unchanged when run() returns (the runner has already
    // written applied[id]) until the store's 500 ms debounce fires
    {
      const { root, d } = setup('inst-spend-noflush');
      const srcDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
      const orig = fs.readFileSync(path.join(srcDir, 'server', 'migrations.js'), 'utf-8');
      const FIXED = '          store.flush();\n        } finally { if (priv) store.stop(); }';
      const patched = orig.split(FIXED).join('          if (priv) store.flush();\n        } finally { if (priv) store.stop(); }')
        .replace(/require\('\.\.\//g, `require('${srcDir}/`).replace(/require\('\.\//g, `require('${srcDir}/server/`);
      ok(orig.split(FIXED).length === 2 && patched !== orig, 'CONTROL setup: the patched copy differs from the registry in exactly the live-path flush');
      const pdir = path.join(tmp, 'patched-registry'); fs.mkdirSync(pdir, { recursive: true });
      fs.writeFileSync(path.join(pdir, 'migrations.js'), patched);
      const pre = require(path.join(pdir, 'migrations.js'));
      const before = fs.readFileSync(path.join(d, 'user-todos.json'), 'utf-8');
      const live = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
      const res = pre.create({ rootDir: root, homeDir: scratchHomeDir, serverNotice: () => { }, userTodos: live }).runLocalMigrations().find((r) => r.id === ID);
      const led = JSON.parse(fs.readFileSync(path.join(d, 'migrations.json'), 'utf-8'));
      ok(res?.status === 'ran' && !!led.applied[ID] && fs.readFileSync(path.join(d, 'user-todos.json'), 'utf-8') === before && live._writeTimer !== null,
        'CONTROL: the pre-fix run left the file UNCHANGED with the ledger row already written (a crash now would lose the reshaping for good) — the flush leg above fails on it');
      await new Promise((r) => setTimeout(r, 700));
      const disk = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf-8')).items;
      ok(disk.filter((x) => /^ut-old/.test(x.id)).every((x) => x.status === 'done'), 'CONTROL: …and the change reached the file only when the debounce fired');
      live.stop();
    }

    // (e) THE WINDOW A NOTICE WAS ABOUT (the verifier's INFO): an open Spending
    // item with no expiresAt dies at the end of the window its own detail names
    // — spend-guard writes `Scope: hour|day|instance` on a warning and a
    // `Refusal:` line on a refusal — through the same noticeExpiry(); no such
    // line ⇒ 24 h. Past ⇒ retired at that end; ahead ⇒ stamped with it.
    {
      const root = path.join(tmp, 'inst-spend-scope'); const d = path.join(root, 'data'); fs.mkdirSync(d, { recursive: true });
      const now = Date.now();
      const warn = (scope) => `Reason of the latest turn: auto-resume\nScope: ${scope}\nUsed: 10 of 12`;
      const refusal = 'Reason: stop-nudge\nIdentity: Account A\nRefusal: identity-hour\nUnattended turns used: 12/12 this hour';
      const mk = (id, detail, ageMin) => ({ id, sessionKey: 'accounts', text: 'Account A has used 10 of its 12 unattended turns this hour (83%).', detail, urgency: 'normal', kind: 'notice', status: 'open', by: 'agent', sessionName: 'Spending', jobId: null, createdAt: now - ageMin * 60e3, resolvedAt: null, resolvedBy: null });
      fs.writeFileSync(path.join(d, 'user-todos.json'), JSON.stringify({ items: [
        mk('h-fresh', warn('hour'), 10), mk('h-old', warn('hour'), 180),
        mk('r-fresh', refusal, 120), mk('r-old', refusal, 480),
        mk('i-mid', warn('instance'), 180), mk('none-mid', null, 180),
      ] }));
      const live = new UserTodoManager({ dataDir: d, expirySweepMs: 0 });
      const res = create({ rootDir: root, homeDir: scratchHomeDir, serverNotice: () => { }, userTodos: live }).runLocalMigrations().find((r) => r.id === ID);
      const b = byId(live._state.items);
      const stamped = (x, ms) => x.status === 'open' && x.expiresAt === x.createdAt + ms;
      const retired = (x, ms) => x.status === 'done' && x.resolvedBy === 'expired' && x.resolvedAt === x.createdAt + ms;
      ok(stamped(b['h-fresh'], H) && retired(b['h-old'], H), '`Scope: hour` ⇒ filing + 1 h: a 10-min-old warning is stamped, a 3 h-old one is retired at the hour\'s end', [b['h-fresh'], b['h-old']].map((x) => [x.status, (x.expiresAt || x.resolvedAt) - x.createdAt]));
      ok(stamped(b['r-fresh'], 6 * H) && retired(b['r-old'], 6 * H), 'a refusal ⇒ filing + 6 h (its re-file cadence): 2 h old stamped, 8 h old retired', [b['r-fresh'], b['r-old']].map((x) => [x.status, (x.expiresAt || x.resolvedAt) - x.createdAt]));
      ok(stamped(b['i-mid'], 24 * H) && stamped(b['none-mid'], 24 * H), '`Scope: instance` (the instance DAY) and a detail naming nothing ⇒ filing + 24 h', [b['i-mid'], b['none-mid']].map((x) => x.expiresAt - x.createdAt));
      ok(res?.report?.matched === 6 && res.report.expired === 2 && res.report.stamped === 4, 'the report counts it (matched 6, expired 2, stamped 4)', res?.report);
      live.stop();
    }
  }
  // ── B-f69c ②: the ledger-by-slot backfill (2026-09-23) ────────────────────
  // A synthetic instance in shape only: fixture-family conversation ids, a
  // scratch data dir, no transcript tree. The other migrations are marked as
  // already applied so ONLY the backfill runs (the fixture purge would, rightly,
  // archive every synthetic row first).
  {
    const ID = '2026-09-backfill-ledger-by-slot';
    const root = path.join(tmp, 'inst-ledger-slot'); const d = path.join(root, 'data');
    const hd = path.join(d, 'usage-history'), ad = path.join(d, 'usage-anchors');
    for (const x of [hd, ad, path.join(d, 'session-meta')]) fs.mkdirSync(x, { recursive: true });
    const MIN = 60e3, T0 = Date.UTC(2026, 7, 25, 12), P = 'pool-0123456789ab';
    const S1 = 'e2e00000-0000-4000-8000-0000000f6901', S2 = 'e2e00000-0000-4000-8000-0000000f6902', S3 = 'e2e00000-0000-4000-8000-0000000f6903', S4 = 'e2e00000-0000-4000-8000-0000000f6904';
    const K1 = `sess-11-${T0 - 1000}`, K2 = `sess-12-${T0 - 1000}`;
    fs.writeFileSync(path.join(d, 'session-meta', `cw-11-${T0 - 1000}.json`), JSON.stringify({ claudeSessionId: S1, accountId: P }));
    fs.writeFileSync(path.join(d, 'session-meta', `cw-12-${T0 - 1000}.json`), JSON.stringify({ claudeSessionId: S2, accountId: P }));
    fs.writeFileSync(path.join(d, 'accounts.json'), JSON.stringify({ accounts: [
      { id: 'sub-a', type: 'subscription', name: 'Member A' }, { id: 'sub-b', type: 'subscription', name: 'Member B' },
      { id: 'sub-c', type: 'subscription', name: 'Member C' }, { id: P, type: 'pooled', name: 'Pool' },
    ] }));
    const creds = (exp) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok', refreshToken: 'r', expiresAt: exp, refreshTokenExpiresAt: exp } });
    for (const [m, exp] of [['sub-a', Date.now() + 36e5], ['sub-b', Date.now() + 36e5], ['sub-c', T0 + 5 * MIN]]) {
      fs.mkdirSync(path.join(d, 'subs', m), { recursive: true });
      fs.writeFileSync(path.join(d, 'subs', m, '.credentials.json'), creds(exp));
    }
    // the OTel stash: known orgs, one per request the override baked (+ the two
    // observations that wrote corrective entries)
    const obs = (rid, sid, acct, ts) => ({ rid, sid, orgUuid: 'org-' + acct, acct, acctKnown: true, ts });
    fs.writeFileSync(path.join(hd, 'otel-truth.ndjson'), [
      obs('req_1', S1, 'sub-a', T0 + 10 * MIN), obs('req_2', S1, 'sub-a', T0 + 90 * MIN), obs('req_3', S1, 'sub-a', T0 + 63 * MIN),
      obs('req_c1', S1, 'sub-a', T0 + 60 * MIN - 5000), obs('req_c2', S1, 'sub-a', T0 + 95 * MIN),
      obs('req_6', S2, 'sub-a', T0 + 50 * MIN), obs('req_7', S3, 'sub-a', T0 + 20 * MIN), obs('req_8', S4, 'sub-a', T0 + 20 * MIN),
      obs('req_10', S3, 'sub-a', T0 + 25 * MIN), obs('req_11', S1, 'sub-b', T0 + 62 * MIN),
    ].map((r) => JSON.stringify(r)).join('\n') + '\n');
    // attribution: S1 spawned on A, re-pointed to B at +60 min; two CORRECTIVE
    // entries (A) in the two spellings the OTel writer used — lastTs + 1 ms (a
    // late observation) and the observation's own ts; S2's own entry says A
    // (the walk) while the slot ledger says B; S4 on the dead member C.
    const att = (sid, acct, ts) => ({ sid, acct, pool: P, ts });
    const attLines = [att(S1, 'sub-a', T0), att(S1, 'sub-b', T0 + 60 * MIN), att(S1, 'sub-a', T0 + 60 * MIN + 1), att(S1, 'sub-a', T0 + 95 * MIN), att(S2, 'sub-a', T0), att(S4, 'sub-c', T0)];
    fs.writeFileSync(path.join(hd, 'attribution.ndjson'), attLines.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(d, 'slot-transitions.jsonl'), [
      { sessionId: K2, poolId: P, from: null, to: 'sub-a', at: T0, why: 'spawn' },
      { sessionId: K2, poolId: P, from: 'sub-a', to: 'sub-b', at: T0 + 30 * MIN, why: 'per-session-switch' },
    ].map((r) => JSON.stringify(r)).join('\n') + '\n');
    const row = (rid, sid, acct, ts, extra = {}) => ({ rid, mid: 'msg_' + rid, ts, sid, be: 'claude', model: 'claude-fable-5-1', acct, pool: P, atype: 'subscription', aname: acct, mode: 'chat', host: null, cwd: '/tmp/vs-ledger-fixture', origin: 'main', i: 10, cw5: 0, cw1: 0, cr: 1000, o: 100, ...extra });
    const rows = [
      row('req_1', S1, 'sub-a', T0 + 10 * MIN),   // OTel = walk (A) → confirmed, untouched
      row('req_2', S1, 'sub-a', T0 + 90 * MIN),   // OTel A, walk (correctives set aside) B, 30 min after the re-point → re-keyed B
      row('req_3', S1, 'sub-a', T0 + 63 * MIN),   // OTel A, walk B 3 min after the re-point → lag shadow → archived
      row('req_4', S1, 'sub-a', T0 + 100 * MIN),  // NOT in the stash, inherited the corrective entry at +95 → re-keyed B
      row('req_5', S1, 'sub-b', T0 + 120 * MIN),  // not written by OTel at all → untouched
      row('req_6', S2, 'sub-a', T0 + 50 * MIN),   // OTel A; the SLOT LEDGER says B (its walk says A) → re-keyed B, rung slot-ledger
      row('req_7', S3, 'sub-a', T0 + 20 * MIN),   // OTel A; no record of any slot → archived
      row('req_8', S4, 'sub-a', T0 + 20 * MIN),   // OTel A; the walk names C, dead since +5 min → archived
      row('req_9', S1, 'sub-a', T0 + 30 * MIN, { be: 'codex' }),                     // codex: out of scope
      row('h:host-1:req_x', S1, 'host-1', T0 + 30 * MIN, { atype: 'host' }),         // remote host: out of scope
      row('req_10', S3, 'sub-a', T0 + 25 * MIN, { pool: undefined }),                 // NO pool: one credential dir for life — observed org = slot by construction, out of scope
      row('req_11', S1, 'sub-b', T0 + 62 * MIN),  // OTel B = walk B, 2 min after the re-point — CONFIRMED: the shadow is not this migration's question when nothing disagrees
    ];
    const shard = path.join(hd, 'events-2026-08.ndjson');
    fs.writeFileSync(shard, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    // anchors for the relearn: A and B each have a stream; rates.json holds a stale entry for A and one for an untouched identity
    const anchor = (key, acct, fetchedAt, u, prev) => ({ ts: fetchedAt, fetchedAt, source: 'on-demand', accountId: acct, identityKey: key, buckets: { fiveHour: null, sevenDay: { u, resetsAt: Math.floor((T0 + 5 * 86400e3) / 1000) }, scopedWeekly: [] }, prevFetchedAt: prev, elapsedSec: null, costSince: prev ? { total: 1, byFamily: { fable: 1 } } : null });
    fs.writeFileSync(path.join(ad, 'anchors-acct_sub-a.ndjson'), [anchor('acct:sub-a', 'sub-a', T0, 0.1, null), anchor('acct:sub-a', 'sub-a', T0 + 200 * MIN, 0.2, T0)].map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(ad, 'anchors-acct_sub-b.ndjson'), [anchor('acct:sub-b', 'sub-b', T0, 0.1, null), anchor('acct:sub-b', 'sub-b', T0 + 200 * MIN, 0.3, T0)].map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(ad, 'rates.json'), JSON.stringify({ 'acct:sub-a': { stale: true }, 'acct:untouched': { keep: true } }));
    fs.cpSync(root, path.join(tmp, 'inst-ledger-slot-pristine'), { recursive: true }); // quota r2: the crash legs below replay THIS fixture
    const mm = create({ rootDir: root, homeDir: scratchHomeDir, serverNotice: (k, t) => notices2.push([k, t]) });
    const notices2 = [];
    ok(mm.MIGRATIONS.some((m) => m.id === ID), 'the backfill is registered as a ledger-keyed one-shot');
    fs.writeFileSync(path.join(d, 'migrations.json'), JSON.stringify({ applied: Object.fromEntries(mm.MIGRATIONS.filter((m) => m.id !== ID).map((m) => [m.id, 1])) }));
    const logs = [];
    const oLog = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
    let res; try { res = mm.runLocalMigrations(); } finally { console.log = oLog; }
    const me = res.find((r) => r.id === ID);
    ok(me && me.status === 'ran', 'the backfill ran (and only it)', res.filter((r) => r.status !== 'already'));
    const after = fs.readFileSync(shard, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const by = Object.fromEntries(after.map((r) => [r.rid, r]));
    ok(by.req_1 && by.req_1.acct === 'sub-a' && !by.req_1.slotRekeyedBy, 'a row whose OTel account IS its slot is confirmed and left byte-for-byte alone', by.req_1);
    ok(by.req_2 && by.req_2.acct === 'sub-b' && by.req_2.slotRekeyedBy === ID && by.req_2.slotRekeyedFrom === 'sub-a' && by.req_2.aname === 'Member B' && by.req_2.atype === 'subscription' && by.req_2.cr === 1000, 'PROVABLE: 30 min after the re-point the walk (corrective entries set aside) names B — re-keyed, tokens kept, relabelled', by.req_2);
    ok(by.req_4 && by.req_4.acct === 'sub-b' && by.req_4.slotRekeyedBy === ID, 'a row that INHERITED a corrective entry (no stash row of its own) is a candidate too — re-keyed to B', by.req_4);
    ok(by.req_6 && by.req_6.acct === 'sub-b', 'the SLOT LEDGER outranks the conversation\'s own walk (the walk said A, the transition ledger says B)', by.req_6);
    ok(!by.req_3 && !by.req_7 && !by.req_8, 'UNPROVABLE rows leave the live ledger (lag shadow, no slot record, a dead slot)', Object.keys(by));
    ok(by.req_5 && by.req_5.acct === 'sub-b' && !by.req_5.slotRekeyedBy, 'a row the OTel path did not write is untouched', by.req_5);
    ok(by.req_9 && by.req_9.acct === 'sub-a' && by['h:host-1:req_x'] && by['h:host-1:req_x'].acct === 'host-1', 'codex rows and remote-host rows are out of scope', [by.req_9, by['h:host-1:req_x']]);
    ok(by.req_10 && by.req_10.acct === 'sub-a' && !by.req_10.slotRekeyedBy, 'a row billed through NO pool is out of scope even with no slot record (its observed org IS its one credential)', by.req_10);
    ok(by.req_11 && by.req_11.acct === 'sub-b' && !by.req_11.slotRekeyedBy, 'a row whose OTel account AGREES with its slot is confirmed even inside a re-point\'s shadow (nothing was mis-attributed)', by.req_11);
    const archFile = fs.readdirSync(path.join(d, 'archive')).find((f) => /^ledger-by-slot-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f));
    const arch = archFile ? fs.readFileSync(path.join(d, 'archive', archFile), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const archOf = (rid) => arch.find((a) => a.store === 'usage-history' && a.entry && a.entry.rid === rid);
    ok(archOf('req_3') && /lag shadow/.test(archOf('req_3').reason) && /cannot be proven/.test(archOf('req_3').reason), 'the lag-shadow row is archived VERBATIM with its reason', archOf('req_3')?.reason);
    ok(archOf('req_7') && /no slot transition and no attribution entry/.test(archOf('req_7').reason), 'the no-record row is archived with its reason', archOf('req_7')?.reason);
    ok(archOf('req_8') && /sub-c, whose login was expired/.test(archOf('req_8').reason), 'the dead-slot row is archived with its reason (the walk named a member whose login had died)', archOf('req_8')?.reason);
    ok(archOf('req_2') && archOf('req_2').entry.acct === 'sub-a' && /re-keyed to sub-b/.test(archOf('req_2').reason), 'every RE-KEYED row\'s original is archived too (reversible) with the rung that proved it', archOf('req_2')?.reason);
    const attAfter = fs.readFileSync(path.join(hd, 'attribution.ndjson'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    ok(attAfter.length === 4 && !attAfter.some((e) => e.sid === S1 && e.acct === 'sub-a' && e.ts > T0), 'both CORRECTIVE entries (either spelling) are set aside; the real entries stay', attAfter);
    ok(arch.filter((a) => a.store === 'attribution').length === 2, '…and archived with their reason', arch.filter((a) => a.store === 'attribution').map((a) => a.reason.slice(0, 60)));
    const rep = me.report || {};
    ok(rep.rows === 12 && rep.candidates === 8 && rep.rekeyed === 3 && rep.archived === 3 && rep.untouched === 6 && rep.confirmed === 2 && rep.corrective === 2, 'the ledger report row counts re-keyed / archived / untouched (rows 12, candidates 8, re-keyed 3, archived 3, untouched 6, confirmed 2, corrective 2)', rep);
    const led2 = JSON.parse(fs.readFileSync(path.join(d, 'migrations.json'), 'utf-8'));
    ok(led2.reports && led2.reports[ID] && led2.reports[ID].rekeyed === 3 && led2.reports[ID].archived === 3 && led2.reports[ID].untouched === 6, 'the counts ride data/migrations.json', led2.reports?.[ID]);
    const line = logs.filter((l) => l.startsWith('[migrate] ledger-by-slot:'));
    ok(line.length === 1 && /"rekeyed":3/.test(line[0]) && /"archived":3/.test(line[0]) && /"untouched":6/.test(line[0]), 'ONE log line says what happened', line);
    ok(notices2.length === 1 && notices2[0][0] === 'ledger-by-slot' && /3 ledger row\(s\)/.test(notices2[0][1]), 'the user is told once (an info notice naming both counts)', notices2);
    const rates = JSON.parse(fs.readFileSync(path.join(ad, 'rates.json'), 'utf-8'));
    ok(rates['acct:sub-a'] && !rates['acct:sub-a'].stale && rates['acct:sub-a'].buckets && rates['acct:sub-b'] && rates['acct:sub-b'].buckets && rates['acct:untouched']?.keep === true, 'the estimator RE-LEARNED the touched identities (A lost rows, B gained them) and left an untouched one alone', Object.keys(rates));
    ok(rep.relearned === 2 && arch.some((a) => a.store === 'usage-anchors/rates.json' && a.entry['acct:sub-a']?.stale === true), '…the stale learned entry archived first (relearned 2)', rep.relearned);
    // the re-bake: a row the slot LEDGER proved must survive a later re-bake of the walk
    {
      const { UsageHistory } = require('../src/usage-history.js');
      try { fs.unlinkSync(path.join(hd, '.attrib-rebake-v1')); } catch { }
      const uh = new UsageHistory({ dataDir: d, homeDir: scratchHomeDir });
      uh._maybeRebakeAttribution();
      const rb = Object.fromEntries(fs.readFileSync(shard, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.rid, r]));
      ok(rb.req_6 && rb.req_6.acct === 'sub-b', 'a later re-bake of the walk (which says A for S2) leaves the slot-ledger-proven row on B', rb.req_6);
    }
    // idempotent: a second run finds nothing to do and rewrites nothing
    {
      const { backfillLedgerBySlot } = require('../src/ledger-slot-backfill.js');
      const before = fs.readFileSync(shard, 'utf-8'), attBefore = fs.readFileSync(path.join(hd, 'attribution.ndjson'), 'utf-8');
      const r2 = backfillLedgerBySlot({ dataDir: d, id: ID });
      ok(r2.rekeyed === 0 && r2.archived === 0 && r2.corrective === 0 && fs.readFileSync(shard, 'utf-8') === before && fs.readFileSync(path.join(hd, 'attribution.ndjson'), 'utf-8') === attBefore, 'SECOND RUN is a no-op (nothing re-keyed, archived or rewritten)', r2);
      const r3 = backfillLedgerBySlot({ dataDir: path.join(tmp, 'inst-no-stash-data'), id: ID });
      ok(r3.stash === 0 && r3.rows === 0 && r3.rekeyed === 0, 'an instance that never ran the OTel path has nothing to do', r3);
    }
  }
  // ── quota r2 (the r2 verifier's crash probe): a pass killed between an
  // archive append and the rewrite it guards ─────────────────────────────────
  // The runner retries a migration that never recorded itself, and the retry
  // re-archived every row it found again (32 837 duplicate lines on the
  // production-shaped copy), counted only the remainder in its report and
  // notice, and — killed after the shards — never re-learned the estimator at
  // all (nothing left to touch). A REAL SIGKILL in a child process at three
  // kill points, each retried through the runner; the reference is the same
  // fixture run uninterrupted. Negative control: a scratch-dir patched copy of
  // the backfill with no memory of an earlier pass (the quota r1 behaviour).
  {
    const { spawnSync } = await import('node:child_process');
    const ID = '2026-09-backfill-ledger-by-slot';
    const PRISTINE = path.join(tmp, 'inst-ledger-slot-pristine');
    const MIG = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/server/migrations.js');
    const BACKFILL = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/ledger-slot-backfill.js');
    const child = path.join(tmp, 'ledger-slot-crash-child.cjs');
    fs.writeFileSync(child, `
const fs = require('fs'); const path = require('path');
const point = process.env.KILL_POINT, BF = process.env.BACKFILL_MOD;
if (BF) { const Module = require('module'); const orig = Module._resolveFilename; Module._resolveFilename = function (req, parent, ...r) { if (/ledger-slot-backfill\\.js$/.test(req)) return BF; return orig.call(this, req, parent, ...r); }; }
const origRename = fs.renameSync;
fs.renameSync = function (a, b) {
  const base = path.basename(String(b));
  if ((point === 'shard' && /^events-\\d{4}-\\d{2}\\.ndjson$/.test(base)) || (point === 'attribution' && base === 'attribution.ndjson') || (point === 'rates' && base === 'rates.json') || (point === 'ledger' && base === 'migrations.json')) process.kill(process.pid, 'SIGKILL');
  return origRename.apply(this, arguments);
};
const { create } = require(${JSON.stringify(MIG)});
const root = process.argv[2], d = path.join(root, 'data'), ID = ${JSON.stringify(ID)}, notices = [];
const mm = create({ rootDir: root, homeDir: path.join(root, 'home'), serverNotice: (k, t) => notices.push([k, t]) });
let led = { applied: {} }; try { led = JSON.parse(fs.readFileSync(path.join(d, 'migrations.json'), 'utf-8')); } catch { }
led.applied = led.applied || {}; for (const m of mm.MIGRATIONS) if (m.id !== ID) led.applied[m.id] = led.applied[m.id] || 1;
fs.writeFileSync(path.join(d, 'migrations.json'), JSON.stringify(led));
const res = mm.runLocalMigrations(); const me = res.find((r) => r.id === ID);
console.log('RESULT ' + JSON.stringify({ status: me && me.status, report: me && me.report, notices }));
`);
    fs.mkdirSync(path.join(tmp, 'home-empty', '.claude'), { recursive: true });
    const inst = (name) => { const r = path.join(tmp, name); fs.rmSync(r, { recursive: true, force: true }); fs.cpSync(PRISTINE, r, { recursive: true }); fs.mkdirSync(path.join(r, 'home', '.claude', 'projects'), { recursive: true }); return r; };
    const runChild = (root, point, extraEnv = {}) => { const r = spawnSync(process.execPath, [child, root], { env: { ...process.env, KILL_POINT: point, VIBESPACE_SKIP_AGENT_HOOKS: '1', ...extraEnv }, encoding: 'utf-8' }); const m = /RESULT (.*)/.exec(r.stdout || ''); return { signal: r.signal, res: m ? JSON.parse(m[1]) : null, err: (r.stderr || '').slice(-400) }; };
    const archLines = (root) => { const ad = path.join(root, 'data', 'archive'); let fl = []; try { fl = fs.readdirSync(ad).filter((f) => /^ledger-by-slot-/.test(f)); } catch { } return fl.flatMap((f) => fs.readFileSync(path.join(ad, f), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((a) => a.store !== 'pass'); };
    const dupCount = (lines) => { const seen = new Map(); for (const a of lines) { const e = a.entry || {}; const k = [a.store, a.file, e.rid, e.mid, e.ts, e.sid, e.acct, a.store === 'usage-anchors/rates.json' ? JSON.stringify(e) : ''].join('|'); seen.set(k, (seen.get(k) || 0) + 1); } let n = 0; for (const v of seen.values()) n += v - 1; return n; };
    const liveOf = (root) => ['events-2026-08.ndjson', 'attribution.ndjson'].map((f) => fs.readFileSync(path.join(root, 'data', 'usage-history', f), 'utf-8')).join('\n--\n');
    const ref = inst('inst-ls-ref'); const rr = runChild(ref, 'none');
    const refArch = archLines(ref);
    ok(rr.res && rr.res.status === 'ran' && rr.res.report.rekeyed === 3 && rr.res.report.archived === 3 && refArch.length === 9 && dupCount(refArch) === 0, 'reference: the fixture uninterrupted (re-keyed 3, archived 3, corrective 2, one rates line = 9 archive lines, no duplicate)', { rep: rr.res?.report, lines: refArch.length, err: rr.err });
    const refRates = JSON.parse(fs.readFileSync(path.join(ref, 'data', 'usage-anchors', 'rates.json'), 'utf-8'));
    // (A) killed after the shard's archive append, before its rename
    {
      const r = inst('inst-ls-kill-shard');
      const k = runChild(r, 'shard');
      const afterCrash = archLines(r).length;
      const led = JSON.parse(fs.readFileSync(path.join(r, 'data', 'migrations.json'), 'utf-8'));
      ok(k.signal === 'SIGKILL' && afterCrash === 6 && !led.applied[ID] && fs.existsSync(path.join(r, 'data', 'usage-history', 'events-2026-08.ndjson.tmp')), '(A) the kill lands between the shard\'s archive append (6 lines) and its rename; the id is not recorded', { signal: k.signal, afterCrash, applied: led.applied[ID] });
      const re = runChild(r, 'none'); const lines = archLines(r);
      ok(re.res && re.res.status === 'ran' && lines.length === refArch.length && dupCount(lines) === 0, `(A) the retry archives nothing twice: ${lines.length} archive lines = the uninterrupted run's ${refArch.length} (red on quota r1: 15, 6 duplicates)`, { lines: lines.length, dups: dupCount(lines) });
      ok(liveOf(r) === liveOf(ref), '(A) …and the live ledger is byte-identical to the uninterrupted run');
      ok(re.res.report.rekeyed === 3 && re.res.report.archived === 3 && re.res.report.resumed === true && re.res.notices.length === 1 && /: 3 ledger row\(s\)/.test(re.res.notices[0][1]), '(A) the retry\'s report + notice state the WHOLE repair (3 / 3), and say it resumed', re.res.report);
    }
    // (B) killed after every shard, before the attribution rename — the retry has nothing left to re-key
    {
      const r = inst('inst-ls-kill-attr');
      runChild(r, 'attribution');
      const re = runChild(r, 'none'); const lines = archLines(r);
      const rep = re.res && re.res.report;
      ok(rep && dupCount(lines) === 0 && lines.length === refArch.length, `(B) the corrective entries are archived once (${lines.length} lines; red on quota r1: 10, 2 duplicates — and no rates line, the relearn never ran)`, { lines: lines.length, dups: dupCount(lines) });
      ok(rep && rep.rekeyed === 3 && rep.archived === 3 && rep.corrective === 2 && rep.thisPass && rep.thisPass.rekeyed === 0 && re.res.notices.length === 1 && /: 3 ledger row\(s\)/.test(re.res.notices[0][1]) && /, and 3 row\(s\)/.test(re.res.notices[0][1]), '(B) the ledger report and the notice carry the crashed pass\'s counts (3 re-keyed, 3 archived — this pass found 0) (red on quota r1: 0 / 0 and NO notice at all)', { rep, notices: re.res?.notices });
      ok(rep && rep.relearned === 2, '(B) …and the estimator is re-learned for the accounts the crashed pass moved (red on quota r1: relearned 0 — the rates stayed learned from the OTel-attributed ledger)', rep);
    }
    // (C) killed inside the relearn (the first rates.json rename)
    {
      const r = inst('inst-ls-kill-rates');
      runChild(r, 'rates');
      const re = runChild(r, 'none'); const rep = re.res && re.res.report;
      const rates = JSON.parse(fs.readFileSync(path.join(r, 'data', 'usage-anchors', 'rates.json'), 'utf-8'));
      ok(rep && rep.relearned === 2 && rates['acct:sub-a'] && !rates['acct:sub-a'].stale && JSON.stringify(rates['acct:sub-a'].buckets) === JSON.stringify(refRates['acct:sub-a'].buckets), '(C) a pass killed inside the relearn is re-learned by the retry (red on quota r1: relearned 0, the stale rate kept)', { rep, rates: Object.keys(rates) });
      ok(dupCount(archLines(r)) === 0, '(C) …nothing archived twice');
    }
    // (D) quota r3: killed AFTER the pass marker, before the runner's migrations.json rename — the retry found every row
    //     already re-keyed and nothing open, and recorded the 37,399-row repair as 0 / 0 with no notice
    const markersOf = (root) => { const ad = path.join(root, 'data', 'archive'); let fl = []; try { fl = fs.readdirSync(ad).filter((f) => /^ledger-by-slot-/.test(f)); } catch { } return fl.flatMap((f) => fs.readFileSync(path.join(ad, f), 'utf-8').split('\n').filter(Boolean)).filter((l) => /"store":"pass"/.test(l)).length; };
    {
      const r = inst('inst-ls-kill-ledger');
      const k = runChild(r, 'ledger');
      const led = JSON.parse(fs.readFileSync(path.join(r, 'data', 'migrations.json'), 'utf-8'));
      ok(k.signal === 'SIGKILL' && !led.applied[ID] && markersOf(r) === 1, '(D) the kill lands after the pass marker, before the runner records the id', { signal: k.signal, markers: markersOf(r) });
      const re = runChild(r, 'none'); const rep = re.res && re.res.report;
      ok(re.res && re.res.status === 'ran' && rep && rep.rekeyed === 3 && rep.archived === 3 && rep.corrective === 2 && rep.relearned === 2 && re.res.notices.length === 1 && /: 3 ledger row\(s\)/.test(re.res.notices[0][1]), '(D) the retry states the FINISHED pass\'s repair (3 / 3 / 2, relearned 2) and files its notice (red on quota r2: 0 / 0, no notice)', { rep, notices: re.res?.notices });
      ok(markersOf(r) === 1 && dupCount(archLines(r)) === 0 && liveOf(r) === liveOf(ref), '(D) …writing no second marker and nothing twice; the live ledger equals the uninterrupted run');
      let txt = fs.readFileSync(BACKFILL, 'utf-8').replace(/require\('\.\/([\w.-]+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(path.dirname(BACKFILL), f))})`);
      const a = 'if (nothingNow && lc && lc.total';
      ok(txt.includes(a), 'control anchor present (D)');
      const pc = path.join(tmp, 'ledger-slot-backfill-norecover.js'); fs.writeFileSync(pc, txt.replace(a, 'if (false && nothingNow && lc && lc.total'));
      const rc = inst('inst-ls-ctl-ledger'); runChild(rc, 'ledger', { BACKFILL_MOD: pc }); const rec = runChild(rc, 'none', { BACKFILL_MOD: pc });
      ok(rec.res && rec.res.report.rekeyed === 0 && rec.res.notices.length === 0, 'NEGATIVE CONTROL (no recovery from the marker): the same kill leaves the repair recorded as 0 re-keyed and nobody told', rec.res?.report);
    }
    // (E) quota r3: a TORN archive tail (ENOSPC / a short write: a fragment with no newline) swallowed the first line of
    //     the next append — one archived original left the ledger with no readable archive record
    {
      const { backfillLedgerBySlot } = require('../src/ledger-slot-backfill.js');
      const tornRun = (mod) => {
        const r = inst('inst-ls-torn-' + path.basename(mod, '.js'));
        const ad = path.join(r, 'data', 'archive'); fs.mkdirSync(ad, { recursive: true });
        const now = Date.UTC(2026, 8, 24, 12);
        fs.writeFileSync(path.join(ad, 'ledger-by-slot-2026-09-24.ndjson'), '{"migration":"' + ID + '","at":17902334'); // no newline
        const rep = require(mod).backfillLedgerBySlot({ dataDir: path.join(r, 'data'), id: ID, relearn: false, now });
        const lines = fs.readFileSync(path.join(ad, 'ledger-by-slot-2026-09-24.ndjson'), 'utf-8').split('\n').filter(Boolean);
        let bad = 0; const good = []; for (const l of lines) { try { good.push(JSON.parse(l)); } catch { bad++; } }
        return { rep, bad, uh: good.filter((a) => a.store === 'usage-history').length };
      };
      const t = tornRun(BACKFILL);
      ok(t.bad === 1 && t.uh === 6 && t.rep.archiveUnparseable === 1, `(E) after a torn tail every archived original still has its readable line (${t.uh} of 6); the fragment stays alone on its line and is counted (report.archiveUnparseable) (red on quota r2: 5 — the first line of the append was swallowed)`, { bad: t.bad, uh: t.uh, unparseable: t.rep.archiveUnparseable });
      let txt = fs.readFileSync(BACKFILL, 'utf-8').replace(/require\('\.\/([\w.-]+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(path.dirname(BACKFILL), f))})`);
      const a = 'torn = b[0] !== 0x0a;';
      ok(txt.includes(a), 'control anchor present (E)');
      const pc = path.join(tmp, 'ledger-slot-backfill-notorn.js'); fs.writeFileSync(pc, txt.replace(a, 'torn = false;'));
      const tc = tornRun(pc);
      ok(tc.uh === 5, '(E) NEGATIVE CONTROL (patched copy that appends straight after the fragment): one archived original has no readable line', tc);
    }
    // NEGATIVE CONTROL: the backfill with no memory of an earlier pass (patched copy in the scratch dir)
    {
      let txt = fs.readFileSync(BACKFILL, 'utf-8').replace(/require\('\.\/([\w.-]+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(path.dirname(BACKFILL), f))})`);
      const a = 'const prior = readPriorArchive(archiveDir, id);';
      ok(txt.includes(a), 'control anchor present');
      txt = txt.replace(a, 'const prior = { keys: new Set(), open: [] };');
      const pc = path.join(tmp, 'ledger-slot-backfill-nomemory.js'); fs.writeFileSync(pc, txt);
      const rA = inst('inst-ls-ctl-shard'); runChild(rA, 'shard', { BACKFILL_MOD: pc }); runChild(rA, 'none', { BACKFILL_MOD: pc });
      const rB = inst('inst-ls-ctl-attr'); runChild(rB, 'attribution', { BACKFILL_MOD: pc }); const reB = runChild(rB, 'none', { BACKFILL_MOD: pc });
      ok(dupCount(archLines(rA)) === 6 && reB.res && reB.res.report.rekeyed === 0 && reB.res.report.relearned === 0 && reB.res.notices.length === 0, 'NEGATIVE CONTROL (no memory of the crashed pass): (A) 6 duplicate archive lines, (B) the retry reports 0 re-keyed, re-learns nothing and tells nobody', { dupA: dupCount(archLines(rA)), repB: reB.res?.report });
    }
    // a row the ledger GENUINELY holds twice is two rows leaving it: the retry
    // dedupe is against EARLIER passes only, never inside a pass
    {
      const { backfillLedgerBySlot } = require('../src/ledger-slot-backfill.js');
      const r = inst('inst-ls-dup-row'); const sh = path.join(r, 'data', 'usage-history', 'events-2026-08.ndjson');
      const l7 = fs.readFileSync(sh, 'utf-8').split('\n').find((l) => l.includes('"req_7"'));
      fs.appendFileSync(sh, l7 + '\n');
      const rep = backfillLedgerBySlot({ dataDir: path.join(r, 'data'), id: ID, relearn: false });
      const a7 = archLines(r).filter((a) => a.store === 'usage-history' && a.entry && a.entry.rid === 'req_7');
      ok(rep.archived === 4 && rep.total.archived === 4 && a7.length === 2 && !fs.readFileSync(sh, 'utf-8').includes('"req_7"'), 'a row the ledger holds TWICE leaves it with TWO archive lines (the dedupe never drops an unarchived row)', { archived: rep.archived, total: rep.total, lines: a7.length });
    }
    // ── the relearn keys ONE spelling per anchors file (quota r2, low) ───────
    {
      const { backfillLedgerBySlot } = require('../src/ledger-slot-backfill.js');
      const r = inst('inst-ls-spellings'); const ad = path.join(r, 'data', 'usage-anchors');
      const fa = path.join(ad, 'anchors-acct_sub-a.ndjson');
      const drift = fs.readFileSync(fa, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((a) => ({ ...a, identityKey: 'acct_sub-a', ts: a.ts + 1 }));
      fs.appendFileSync(fa, drift.map((a) => JSON.stringify(a)).join('\n') + '\n'); // the production shape: a second, file-name spelling of the same identity inside the same file
      const rep = backfillLedgerBySlot({ dataDir: path.join(r, 'data'), id: ID });
      const rates = JSON.parse(fs.readFileSync(path.join(ad, 'rates.json'), 'utf-8'));
      ok(rep.identities.join(',') === 'acct:sub-a,acct:sub-b' && rep.relearned === 2 && !('acct_sub-a' in rates) && rates['acct:sub-a'] && rates['acct:sub-a'].buckets, 'one identity per anchors file: the \':\' spelling is relearned and reported ONCE, no phantom \'acct_sub-a\' rates entry (red on quota r1: identities 3, relearned 3, a phantom entry)', { ids: rep.identities, relearned: rep.relearned, rates: Object.keys(rates) });
      ok(rep.anchorKeySpellings.join(',') === 'acct_sub-a', '…and the drifted spelling is named in the report for a separate cleanup', rep.anchorKeySpellings);
    }
  }
  // ── quota r1 (B-f69c ② verifier): a `from:null` re-point is a RE-POINT ─────
  // The slot ledger spells "no earlier slot" (a spawn) and "the machine login /
  // a previous member whose record is gone" the same way — `from: null`. The
  // rung must tell them apart by the row's `why`, as the walk rung does by the
  // entry's position: a re-point off the machine login has a lag shadow (the
  // walk's prevSlot null → '__global__'), a spawn has none (a brand-new process
  // has no in-flight request on any earlier token), whatever `from` it names
  // (spawn records `from` = the pool DEFAULT poolCurrentFor read before the link).
  {
    const { backfillLedgerBySlot } = require('../src/ledger-slot-backfill.js');
    const root = path.join(tmp, 'inst-ledger-slot-null-from'); const d = path.join(root, 'data');
    const hd = path.join(d, 'usage-history');
    for (const x of [hd, path.join(d, 'session-meta')]) fs.mkdirSync(x, { recursive: true });
    const MIN = 60e3, T0 = Date.UTC(2026, 7, 25, 12), P = 'pool-0123456789ab';
    const S5 = 'e2e00000-0000-4000-8000-0000000f6905', S6 = 'e2e00000-0000-4000-8000-0000000f6906';
    const K5 = `sess-15-${T0 - 1000}`, K6 = `sess-16-${T0 - 1000}`;
    fs.writeFileSync(path.join(d, 'session-meta', `cw-15-${T0 - 1000}.json`), JSON.stringify({ claudeSessionId: S5, accountId: P }));
    fs.writeFileSync(path.join(d, 'session-meta', `cw-16-${T0 - 1000}.json`), JSON.stringify({ claudeSessionId: S6, accountId: P }));
    fs.writeFileSync(path.join(d, 'accounts.json'), JSON.stringify({ accounts: [{ id: 'sub-a', type: 'subscription', name: 'Member A' }, { id: 'sub-b', type: 'subscription', name: 'Member B' }, { id: P, type: 'pooled', name: 'Pool' }] }));
    const creds = JSON.stringify({ claudeAiOauth: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 36e5 } });
    for (const m of ['sub-a', 'sub-b']) { fs.mkdirSync(path.join(d, 'subs', m), { recursive: true }); fs.writeFileSync(path.join(d, 'subs', m, '.credentials.json'), creds); }
    const obs = (rid, sid, acct, ts) => ({ rid, sid, orgUuid: 'org-' + (acct || 'machine'), acct, acctKnown: true, ts });
    fs.writeFileSync(path.join(hd, 'otel-truth.ndjson'), [obs('rq_n1', S5, null, T0 + 60 * MIN + 3000), obs('rq_n2', S5, null, T0 + 80 * MIN), obs('rq_s1', S6, 'sub-a', T0 + 3000)].map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(hd, 'attribution.ndjson'), [{ sid: S5, acct: null, pool: P, ts: T0 }, { sid: S6, acct: 'sub-a', pool: P, ts: T0 }].map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(d, 'slot-transitions.jsonl'), [
      { sessionId: K5, poolId: P, from: null, to: 'sub-b', at: T0 + 60 * MIN, why: 'per-session-switch' }, // off the machine login (or a member whose record is gone)
      { sessionId: K6, poolId: P, from: 'sub-a', to: 'sub-b', at: T0, why: 'spawn' },                       // a SPAWN: `from` = the pool default read before the link existed
    ].map((r) => JSON.stringify(r)).join('\n') + '\n');
    const row = (rid, sid, acct, ts) => ({ rid, mid: 'msg_' + rid, ts, sid, be: 'claude', model: 'claude-fable-5-1', acct, pool: P, atype: acct ? 'subscription' : 'global', aname: acct, mode: 'chat', host: null, cwd: '/tmp/vs-ledger-fixture', origin: 'main', i: 10, cw5: 0, cw1: 0, cr: 1000, o: 100 });
    const shard = path.join(hd, 'events-2026-08.ndjson');
    fs.writeFileSync(shard, [row('rq_n1', S5, null, T0 + 60 * MIN + 3000), row('rq_n2', S5, null, T0 + 80 * MIN), row('rq_s1', S6, 'sub-a', T0 + 3000)].map((r) => JSON.stringify(r)).join('\n') + '\n');
    const rep = backfillLedgerBySlot({ dataDir: d, id: '2026-09-backfill-ledger-by-slot', relearn: false });
    const by = Object.fromEntries(fs.readFileSync(shard, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.rid, r]));
    const archFile = fs.readdirSync(path.join(d, 'archive')).find((f) => /^ledger-by-slot-/.test(f));
    const arch = archFile ? fs.readFileSync(path.join(d, 'archive', archFile), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const archOf = (rid) => arch.find((a) => a.store === 'usage-history' && a.entry && a.entry.rid === rid);
    ok(!by.rq_n1 && archOf('rq_n1') && /lag shadow/.test(archOf('rq_n1').reason) && /machine login → sub-b/.test(archOf('rq_n1').reason) && rep.archivedWhy['lag-shadow'] === 1,
      'a row 3 s after a `from:null` per-session re-point is inside the LAG SHADOW (machine login → sub-b) — archived, never re-keyed (red on 2.369.163 quota 3: re-keyed to sub-b by the slot ledger)', { live: by.rq_n1, arch: archOf('rq_n1')?.reason, why: rep.archivedWhy });
    ok(by.rq_n2 && by.rq_n2.acct === 'sub-b' && by.rq_n2.slotRekeyedBy, '…20 min after the same re-point the slot ledger proves sub-b — re-keyed', by.rq_n2);
    ok(by.rq_s1 && by.rq_s1.acct === 'sub-b' && by.rq_s1.slotRekeyedFrom === 'sub-a', 'a row 3 s after a SPAWN is not in any shadow (a new process has no in-flight request on the pool default `from` names) — re-keyed to the spawn\'s slot', { live: by.rq_s1, arch: archOf('rq_s1')?.reason });
  }
  // ── 2026-09-runaway-parks-void (2026-09-25, the owner's ruling: a resource guard never stops an app a person uses) ──
  {
    console.log('2026-09-runaway-parks-void');
    const ID = '2026-09-runaway-parks-void';
    const { OLD_RUNAWAY_PREFIX, RUNAWAY_VOID_TEXT } = require('../src/server/migrations.js');
    const OLD = 'stopped as a runaway: RSS 2.0 GB (limit 2.0 GB)';
    const CPU = 'stopped as a runaway: 280% CPU sustained for 5 min (limit 150%)';
    const mkInst = (name) => { const r = path.join(tmp, name); fs.mkdirSync(path.join(r, 'data'), { recursive: true }); return r; };
    const runOnly = (mm, r) => runMigrations({ ledgerPath: path.join(r, 'data', 'migrations.json'), migrations: mm.MIGRATIONS.filter((x) => x.id === ID), log: () => { }, warn: () => { } });
    // (a) the FILE path (no live keeper — a suite, a boot without the feature)
    const r1 = mkInst('rpv-file');
    const daFile = path.join(r1, 'data', 'desktop-apps.json'), bpFile = path.join(r1, 'data', 'browser-profiles.json');
    fs.writeFileSync(daFile, JSON.stringify({ apps: { 'da-1': { id: 'da-1', label: 'Google Chrome', state: 'failed', stoppedBy: 'runaway', lastError: OLD }, 'da-2': { id: 'da-2', label: 'xterm', state: 'exited', lastError: 'application exited (code 0)' }, 'da-3': { id: 'da-3', label: 'burner', state: 'failed', lastError: CPU } }, runawayParkedUntil: { chromium: Date.now() + 3600e3 } }), { mode: 0o644 });
    fs.writeFileSync(bpFile, JSON.stringify({ version: 1, profiles: [], leases: [], browsers: { 'bp-00000001': { profileId: 'bp-00000001', state: 'failed', lastError: OLD } }, pins: {}, runawayParkedUntil: { 'bp-00000001': Date.now() + 3600e3 } }), { mode: 0o600 });
    const mm1 = create({ rootDir: r1, homeDir: scratchHomeDir, serverNotice: () => { } });
    ok(mm1.MIGRATIONS.some((x) => x.id === ID), 'registered as a ledger-keyed one-shot');
    const res1 = runOnly(mm1, r1).find((x) => x.id === ID);
    const da = JSON.parse(fs.readFileSync(daFile, 'utf-8')), bp = JSON.parse(fs.readFileSync(bpFile, 'utf-8'));
    ok(res1 && res1.status === 'ran' && !('runawayParkedUntil' in da) && !('runawayParkedUntil' in bp), 'both park maps are REMOVED from disk (a park no longer exists)', { res1, da, bp });
    ok(da.apps['da-1'].lastError === RUNAWAY_VOID_TEXT && bp.browsers['bp-00000001'].lastError === RUNAWAY_VOID_TEXT && RUNAWAY_VOID_TEXT.startsWith('stopped by the old resource guard (a per-process RSS sum'), 'an RSS-sum runaway lastError is rewritten to name the retired guard and its metric', { da: da.apps['da-1'].lastError });
    ok(da.apps['da-2'].lastError === 'application exited (code 0)' && da.apps['da-3'].lastError === CPU && OLD.startsWith(OLD_RUNAWAY_PREFIX) && !CPU.startsWith(OLD_RUNAWAY_PREFIX), 'every other lastError is untouched (an app exit, the CPU-rule sentence — only the RSS sum was a lie)');
    ok((fs.statSync(daFile).mode & 0o777) === 0o644 && (fs.statSync(bpFile).mode & 0o777) === 0o600 && !fs.readdirSync(path.join(r1, 'data')).some((f) => /\.tmp$/.test(f)), 'atomic tmp+rename, each file keeps its own mode (browser-profiles.json stays 0600), no temp left');
    ok(res1.report && res1.report.desktop.parks === 1 && res1.report.desktop.rewritten === 1 && res1.report.browser.parks === 1 && res1.report.browser.rewritten === 1, 'the report counts what it voided', res1.report);
    ok(runOnly(mm1, r1).find((x) => x.id === ID).status === 'already', 'run-at-most-once (the ledger)');
    // (b) missing files are not a failure, and nothing is CREATED
    const r2 = mkInst('rpv-none');
    const res2 = runOnly(create({ rootDir: r2, homeDir: scratchHomeDir, serverNotice: () => { } }), r2).find((x) => x.id === ID);
    ok(res2 && res2.status === 'ran' && !fs.existsSync(path.join(r2, 'data', 'desktop-apps.json')) && !fs.existsSync(path.join(r2, 'data', 'browser-profiles.json')), 'no store on disk ⇒ ran, nothing created (a missing file is not a failure)', res2);
    // (c) THROUGH THE LIVE KEEPER — the real desktop-app keeper loaded its store at construction and its next save
    //     would overwrite a file edit; the reshape goes through reshapeStore and the keeper's own atomic save
    const r3 = mkInst('rpv-keeper');
    const da3 = path.join(r3, 'data', 'desktop-apps.json');
    fs.writeFileSync(da3, JSON.stringify({ apps: { 'da-9': { id: 'da-9', label: 'Google Chrome', state: 'failed', stoppedBy: 'runaway', lastError: OLD, pids: {}, starts: {} } }, runawayParkedUntil: { chromium: Date.now() + 3600e3 } }));
    const K = require('../src/server/desktop-app-keeper.js').create({ dataDir: path.join(r3, 'data'), env: () => ({ PATH: process.env.PATH, HOME: scratchHomeDir }), broadcast: () => { }, log: { log() { }, warn() { }, error() { } } });
    const res3 = runOnly(create({ rootDir: r3, homeDir: scratchHomeDir, serverNotice: () => { }, desktopKeeper: K }), r3).find((x) => x.id === ID);
    const disk3 = JSON.parse(fs.readFileSync(da3, 'utf-8'));
    ok(res3.status === 'ran' && res3.report.desktop.via === 'keeper' && K.get('da-9').lastError === RUNAWAY_VOID_TEXT, 'with a live keeper the IN-MEMORY record is rewritten (what it saves next)', res3.report);
    ok(disk3.apps['da-9'].lastError === RUNAWAY_VOID_TEXT && !('runawayParkedUntil' in disk3), '…and the keeper\'s own save put it on disk, park map gone', disk3);
    K.shutdown();
    // (d) CONTROL: the file path beside a loaded keeper IS overwritten by the keeper's next save — why (c) exists
    const r4 = mkInst('rpv-ctl');
    const da4 = path.join(r4, 'data', 'desktop-apps.json');
    fs.writeFileSync(da4, JSON.stringify({ apps: { 'da-8': { id: 'da-8', label: 'x', state: 'failed', lastError: OLD, pids: {}, starts: {} } } }));
    const K4 = require('../src/server/desktop-app-keeper.js').create({ dataDir: path.join(r4, 'data'), env: () => ({ PATH: process.env.PATH, HOME: scratchHomeDir }), broadcast: () => { }, log: { log() { }, warn() { }, error() { } } });
    runOnly(create({ rootDir: r4, homeDir: scratchHomeDir, serverNotice: () => { } }), r4);
    K4.reshapeStore(() => 0); // any commit of the loaded keeper
    ok(JSON.parse(fs.readFileSync(da4, 'utf-8')).apps['da-8'].lastError === OLD, 'CONTROL: a file-only edit beside a loaded keeper is lost at its next save (the store it holds in memory wins)');
    K4.shutdown();
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
