#!/usr/bin/env node
// PURE model gate for Background Work (docs/design-background-work.md M1).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const M = require('../src/job-model.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const B = (s) => Buffer.byteLength(s, 'utf-8');

// ── permissions: no-oracle trio ──
const mk = (i, over = {}) => ({ id: 'jb-' + i, kind: 'task', state: 'done', name: 'job-' + i,
  owner: { conversation: { id: 'conv-A' }, sessionId: 'sess-A', sessionCreatedAt: 1, groupsSnapshot: ['T-p'] },
  access: { view: 'group' }, ...over });
const jobs = [
  mk(1, { name: 'own-private', access: { view: 'session' } }),
  mk(2, { name: 'group-vis' }),
  mk(3, { name: 'foreign-secret', access: { view: 'session' }, owner: { conversation: { id: 'conv-X' }, sessionId: 'sX', sessionCreatedAt: 5, groupsSnapshot: ['T-w'] } }),
  mk(4, { name: 'world', access: { view: 'all' }, owner: { conversation: { id: 'conv-X' }, sessionId: 'sX', sessionCreatedAt: 5, groupsSnapshot: ['T-w'] } }),
];
const resumedOwner = { conversationId: 'conv-A', sessionId: 'sess-NEW', sessionCreatedAt: 9, groups: new Set(['T-p']) };
const stranger = { conversationId: 'conv-B', sessionId: 'sB', sessionCreatedAt: 2, groups: new Set(['T-z']) };
const groupmate = { conversationId: 'conv-C', sessionId: 'sC', sessionCreatedAt: 3, groups: new Set(['T-p']) };
ok(M.visibleJobs(jobs, resumedOwner).map((j) => j.name).join() === 'own-private,group-vis,world', 'owner via conversation lineage (resumed session) sees own+group+all');
ok(M.visibleJobs(jobs, stranger).map((j) => j.name).join() === 'world', 'stranger sees only view:all');
ok(M.visibleJobs(jobs, groupmate).map((j) => j.name).join() === 'group-vis,world', 'groupmate sees group+all, never foreign session-scoped');
ok(!M.canEdit(jobs[1], groupmate) && M.canControl(mk(9, { access: { control: 'group' } }), groupmate), 'edit is owner-only even where control=group');
ok(M.canEdit(jobs[0], { isUser: true }), 'the user always passes');
ok(M.isOwner(mk(9), { conversationId: 'zzz', sessionId: 'sess-A', sessionCreatedAt: 1, groups: new Set() }), 'sessionId+createdAt tuple is the secondary owner path');
ok(!M.isOwner(mk(9), { conversationId: 'zzz', sessionId: 'sess-A', sessionCreatedAt: 2, groups: new Set() }), 'collided sessionId with different createdAt is NOT owner');

// ── vendor vet (negative controls) ──
ok(!M.vetSpec({ cmd: { argv: ['curl', 'https://api.anthropic.com/api/oauth/usage'] } }).ok, 'vendor host in argv refused');
ok(!M.vetSpec({ cmd: { argv: ['bash', '-c', 'jq .t ~/.claude/.credentials.json'] } }).ok, 'credential path refused');
ok(!M.vetSpec({ health: { type: 'cmd', value: 'cat data/subs/current' } }).ok, 'health probe reaching credential material refused');
ok(M.vetSpec({ cmd: { argv: ['npm', 'run', 'dev'] } }).ok, 'ordinary spec passes');

// ── schedules ──
ok(M.parseCron('41 9 * * *') && M.parseCron('*/15 * * * *') && !M.parseCron('99 * * * *') && !M.parseCron('* * * *'), 'cron parse accepts/rejects correctly');
const base = Date.UTC(2026, 7, 17, 12, 0, 0); // Mon Aug 17 2026 12:00 UTC — but nextFire uses local time; use a relative check instead
const nf = M.nextFire({ cron: '0 3 * * *' }, Date.now());
ok(nf > Date.now() && nf - Date.now() <= 24 * 3600e3 + 60e3, 'daily cron next-fire lands within 24h');
const d = new Date(nf); ok(d.getHours() === 3 && d.getMinutes() === 0, 'daily cron fires at 03:00 local');
ok(M.nextFire({ at: Date.now() - 1000 }, Date.now()) === null, 'passed {at} never fires (missed handling is the engine)');
const e1 = M.nextFire({ everyMs: 30 * 60e3, jitterPct: 20 }, 1000, 0.5);
ok(e1 === 1000 + Math.round(30 * 60e3 * 1.1), 'everyMs jitter is deterministic under injected rand');
ok(!M.validateSchedule({ everyMs: 60e3 }).ok, '15min floor for agent-created recurring');
ok(M.validateSchedule({ everyMs: 60e3 }, { agentCreated: false }).ok, 'user-created bypasses the floor');
ok(!M.validateSchedule({ cron: '* * * * *' }).ok, 'every-minute cron refused for agents');

// ── supervision ──
let r = M.onServiceExit({ kind: 'service', restart: 'on-failure', desiredUp: true, supervise: { consecutiveFails: 5 } }, { uptimeMs: 3000, now: 1 });
ok(r.park === true, '6th fast crash parks the service');
r = M.onServiceExit({ kind: 'service', restart: 'on-failure', desiredUp: true, supervise: { consecutiveFails: 5 } }, { uptimeMs: 120e3, now: 1 });
ok(r.restartInMs && r.supervise.consecutiveFails === 0, 'uptime ≥60s resets the consecutive counter');
r = M.onServiceExit({ kind: 'service', restart: 'never', desiredUp: true, supervise: {} }, { uptimeMs: 1, now: 1 });
ok(r.stay === true, 'restart:never stays down');

// ── names ──
ok(M.resolveName('dev server!', new Set()).name === 'dev-server', 'name sanitization');
ok(M.resolveName('x', new Set(['x'])).name === 'x-2', 'collision auto-suffixes within visible scope');

// ── renderers (budget + no-wrap laws) ──
const many = Array.from({ length: 200 }, (_, i) => mk(i, { name: '超长中文名'.repeat(12) + i, state: ['awaiting-user', 'failed', 'up', 'scheduled', 'done'][i % 5] }));
const dig = M.renderJobsDigest(many);
ok(B(dig) <= 600 && dig.includes('✋') && dig.includes('more — vibespace-job list'), '200-job adversarial digest ≤600B, awaiting-user first');
ok(M.renderJobsDigest([]) === '' && M.renderJobsUpdate([]) === '', 'zero jobs/events ⇒ zero bytes');
const upd = M.renderJobsUpdate(Array.from({ length: 30 }, (_, i) => ({ id: 'jb-' + i, name: 'n' + i, what: 'done exit=0' })));
ok(B(upd) <= 600 && upd.startsWith('<vibespace-jobs-update>') && upd.endsWith('</vibespace-jobs-update>'), '30-event update block ≤600B, well-formed');
ok(M.fitDigest(9580, dig, { count: 200 }) === '' && M.fitDigest(9520, dig, { count: 200 }).startsWith('## Background jobs: 200'), 'digest yields (floor→nothing) near the 9600B cap');
ok(9520 + 2 + B(M.fitDigest(9520, dig, { count: 200 })) <= 9600, 'merged payload never trips the 10240 wrap');

// ── panel schema ──
const panel = { title: 't', blocks: [ { type: 'md', text: 'x' }, { type: 'input', id: 'code', pattern: '\\d{6}' }, { type: 'buttons', options: [{ id: 'submit', label: 'OK' }] } ] };
ok(M.validatePanel(panel).ok, 'valid minimal panel accepted');
ok(!M.validatePanel({ title: 't', blocks: [{ type: 'html', text: 'x' }] }).ok, 'unknown block type refused (no agent HTML)');
ok(!M.validatePanel({ title: 't', blocks: [{ type: 'md', text: 'x' }] }).ok, 'panel without buttons refused');
ok(!M.validatePanel({ title: 't', blocks: [{ type: 'image', path: 'rel.png' }, { type: 'buttons', options: [{ id: 's', label: 'k' }] }] }).ok, 'relative image path refused');
ok(M.validateAnswers(panel, { code: '123456', button: 'submit' }).ok, 'answers matching pattern accepted');
ok(!M.validateAnswers(panel, { code: 'abc', button: 'submit' }).ok, 'pattern-violating answer refused');
ok(!M.validateAnswers(panel, { code: '123456' }).ok, 'missing button refused');

// ── owner auto-notify (2.344.0) ──
ok(M.notifyEffective({ notify: 'off' }, true, true).on === false && M.notifyEffective({ notify: 'off' }, true, true).source === 'job', 'job override beats group+global');
ok(M.notifyEffective({}, false, true).on === false && M.notifyEffective({}, false, true).source === 'group', 'group OFF beats global ON');
ok(M.notifyEffective({}, true, false).on === true, 'group ON beats global OFF');
ok(M.notifyEffective({}, null, undefined).on === true && M.notifyEffective({}, null, false).on === false, 'inherit falls to global; default ON');
const nj = { id: 'jb-abc', kind: 'task', name: '数据迁移-' + 'x'.repeat(80), state: 'done', context: { payload: '这是很长的context payload。'.repeat(100) } };
const ntext = M.renderOwnerNotify(nj, { what: 'done exit=0 ok (12m)' });
ok([...ntext].length <= 1000 && ntext.includes('jb-abc') && ntext.includes('vibespace-job poll jb-abc') && ntext.includes('not a user instruction'), 'owner notify ≤1000cp, carries id + poll pointer + non-instruction marker');
// PRODUCTION context shape is {payload} — the 2.345.0 live E2E caught the
// echo silently dead behind a typeof-string check (fixture-shape class)
ok(ntext.includes('Context you attached at creation') && ntext.includes('这是很长的context'), 'context ECHO fires for the production {payload} shape');
ok(M.renderOwnerNotify({ ...nj, context: 'legacy-string' }, null).includes('legacy-string'), 'legacy string context still echoes');
ok(!M.renderOwnerNotify({ ...nj, context: null }, null).includes('Context you attached'), 'NEGATIVE CONTROL: no context = no context line');
ok(M.renderOwnerNotify({ id: 'j', kind: 'task', name: 'n', state: 'awaiting-user' }, null).includes('vibespace-job answers j'), 'awaiting-user notify points at answers');
// stash renderer: budget honored, first + NEWEST survive, floor line, empty=empty
const stash = Array.from({ length: 40 }, (_, i) => ({ jobId: 'jb-' + i, jobName: '任务名字很长很长' + i, text: 'failed exit=1 error (3m)', ts: 1700000000000 + i * 1000 }));
const st = M.renderNotifStash(stash);
ok(B(st) <= 900 && st.includes('jb-0') && st.includes('jb-39') && st.includes('elided'), 'stash render ≤900B, endpoints survive, elision marked');
ok(M.renderNotifStash([]) === '' && M.renderNotifStash(null) === '', 'empty stash ⇒ zero bytes');
ok(M.renderNotifStash(stash, { budget: 120 }).includes('40 job notification') || M.renderNotifStash(stash, { budget: 120 }) === '', 'tiny budget falls to floor (or nothing)');
// per-job announce coalescing: a flood from ONE job takes one line; lifecycle lines survive
const flood = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: 'jb-noisy', name: 'news-watch', what: `announced: 新闻条目 ${i}`, verb: 'poll' })),
  { id: 'jb-other', name: 'builder', what: 'failed exit=1 error (2m)' },
  { id: 'jb-quiet', name: 'q', what: 'announced: 单条', verb: 'poll' },
];
const cu = M.renderJobsUpdate(flood);
ok(cu.includes('announced ×20') && cu.includes('新闻条目 19') && cu.includes('jb-other') && cu.includes('failed'), 'announce flood coalesces to ×N+latest; lifecycle event survives the budget');
ok(cu.split('\n').filter((l) => l.includes('jb-noisy')).length === 1, 'the noisy job occupies exactly ONE line');
ok(cu.includes('单条') && !cu.includes('×1'), 'single announce renders plainly (no ×1 noise)');
const spilled = M.renderNotifStash(stash, { spillPath: '/data/job-notifications-read/conv.md' });
ok(spilled.includes('/data/job-notifications-read/conv.md'), 'truncated stash points at the untruncated spill file');
ok(M.renderNotifStash(stash, { budget: 250, spillPath: '/data/job-notifications-read/conv.md' }).includes('full history: /data'), 'floor form carries the spill path too');

// ── CLI --at wiring pins (2.361.3, the 7h-off notify-test incident): the
//    relative "+2m" form and the resolved-time echo must stay in the CLI —
//    agents think in UTC, bare datetimes parse server-local.
{
  const fs2 = require('fs');
  const path2 = require('path');
  const cli = fs2.readFileSync(path2.join(path2.dirname(new URL(import.meta.url).pathname), '..', 'data/bin/vibespace-job'), 'utf-8');
  ok(cli.includes('const parseAt') && cli.includes("(\\d+)\\s*m"), 'vibespace-job --at supports relative "+2m" forms');
  ok(cli.includes('next fire:'), 'vibespace-job echoes the resolved fire time on creation');
  ok(cli.includes('SERVER-LOCAL'), 'usage/help teaches the bare-datetime = server-local trap');
  // 2.361.4: reminder-instinct support — a scheduled bare echo/printf gets
  // per-fire notify by default, and every scheduled task creation states the
  // quiet-success semantics (the "auto-notify: ON" line alone misled agents).
  ok(cli.includes('echoReminder') && cli.includes('(echo|printf)'), 'scheduled bare echo/printf defaults notifyOk (reminder instinct)');
  ok(cli.includes('SUCCESSFUL fires are SILENT'), 'scheduled-task creation states per-fire semantics');
}
// ── TRIAGE (2026-09-14, design §13): acknowledgement truth table ──────────
// Every instant is DERIVED from one injected clock — a fixture may never pin
// a calendar date or depend on the time of day.
{
  const T0 = 1_700_000_000_000; // an arbitrary epoch origin; only differences matter
  const H = 3600e3, D = 86400e3;
  const failed = (over = {}) => ({ id: 'jb-f', kind: 'task', name: 'render-r3', state: 'failed', owner: { conversation: { id: 'conv-A' }, sessionId: 'sess-A', sessionCreatedAt: 1 }, runs: [{ startedAt: T0, endedAt: T0 + 60e3, exit: 1, cause: 'error' }], ...over });
  const A = (j) => M.ackState(j, T0 + D);
  ok(!A(failed()).acked && A(failed()).by === null, 'a terminal failure with no journal and no stamp is UNACKNOWLEDGED');
  ok(A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'message', ok: true }] })).by === 'notified', 'an ok:true message delivery at/after the terminal instant acknowledges (notified)');
  ok(A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'channel', ok: true }] })).by === 'notified' && A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'user-inbox', ok: true }] })).by === 'notified', 'channel and user-inbox lanes reached somebody too');
  ok(!A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'stash', ok: false, reason: 'not reachable' }] })).acked, 'a STASHED entry is NOT an acknowledgement — nobody has read it yet');
  ok(!A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'off', ok: false }, { ts: T0 + 62e3, lane: 'suppressed', ok: false }] })).acked, "'off' / 'suppressed' delivered nothing ⇒ unacknowledged");
  ok(!A(failed({ notifyLog: [{ ts: T0 - 5e3, lane: 'message', ok: true }] })).acked, 'a delivery BEFORE the terminal instant (an earlier run) acknowledges nothing');
  ok(A(failed({ ack: { by: 'notified', at: T0 + 90e3 } })).by === 'notified' && A(failed({ ack: { by: 'notified', at: T0 + 90e3 } })).at === T0 + 90e3, 'the engine stamp from a DRAINED stash acknowledges (notified, at the drain instant)');
  ok(A(failed({ ack: { by: 'agent-read', at: T0 + 2 * H } })).by === 'agent-read' && A(failed({ ack: { by: 'user-opened', at: T0 + 2 * H } })).by === 'user-opened', 'agent-read and user-opened stamps acknowledge');
  ok(!A(failed({ ack: { by: 'user-opened', at: T0 - 1 } })).acked, 'a stamp OLDER than the terminal instant (a re-run cleared it in memory but not here) acknowledges nothing');
  ok(!A(failed({ ack: { by: 'somebody', at: T0 + H } })).acked, 'an unknown ack.by is refused (closed vocabulary)');
  ok(!A(failed({ state: 'up', runs: [{ startedAt: T0 }] })).acked && !A({ ...failed(), kind: 'service' }).acked && !A({ ...failed(), kind: 'cron', state: 'missed' }).acked, 'a running task, a parked service and a cron parent are never "acknowledged" — not one-shots / not terminal');
  ok(A({ ...failed(), cronParent: 'jb-parent', notifyLog: [{ ts: T0 + 61e3, lane: 'message', ok: true }] }).acked, 'a cron per-fire CHILD is a one-shot and can be acknowledged');
  ok(A(failed({ state: 'unverified', runs: [], createdAt: T0, ack: { by: 'user-opened', at: T0 + 1 } })).acked, 'an unverified skeleton (no run) uses createdAt as its terminal instant');
  // the journal entry's own ts is what dates a notified ack
  ok(A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'message', ok: true }] })).at === T0 + 61e3, 'notified ack is dated by the delivery');
  // attention: the badge counts
  ok(M.attentionOf(failed(), T0 + D) === 'unacked-failure' && M.attentionOf(failed({ ack: { by: 'user-opened', at: T0 + H } }), T0 + D) === 'acked-failure', 'attentionOf: unacked vs acked failure');
  ok(M.attentionOf({ kind: 'task', state: 'awaiting-user' }) === 'awaiting' && M.attentionOf({ kind: 'task', state: 'done' }) === null && M.attentionOf({ kind: 'task', state: 'interrupted' }) === null, 'awaiting counts; done/interrupted are not attention');
  ok(M.attentionOf({ kind: 'service', state: 'failed' }) === 'unacked-failure', 'a PARKED service stays red — it cannot be acknowledged, it needs a start');
  // agent-read: owner lineage only, never a self-read
  const owner = { conversationId: 'conv-A', sessionId: 'sess-NEW', sessionCreatedAt: 9, groups: new Set(['T-1']) };
  const strangerC = { conversationId: 'conv-Z', sessionId: 'sZ', sessionCreatedAt: 3, groups: new Set(['T-1']) };
  ok(M.agentReadAcks(failed(), owner) === true, 'an owner-lineage agent read acknowledges');
  ok(M.agentReadAcks(failed(), strangerC) === false, "a stranger session's read (even a viewer) does NOT acknowledge");
  ok(M.agentReadAcks(failed(), owner, { selfJob: true }) === false, "a jbt_ job-token read of ITSELF does NOT acknowledge");
  ok(M.agentReadAcks({ ...failed(), state: 'up' }, owner) === false, 'a read of a RUNNING job acknowledges nothing');
  // archive verdict
  const V = (j, o) => M.archiveVerdict(j, { now: T0 + 25 * H, ...o });
  ok(V({ ...failed(), state: 'done' }).archive === true && V({ ...failed(), state: 'done' }).why === 'done', 'done + 25h ⇒ archive');
  ok(V({ ...failed(), state: 'done' }, { now: T0 + 23 * H }).why === 'done-too-young', 'done + 23h ⇒ stays');
  ok(V({ ...failed(), state: 'done' }, { doneAfterMs: 0 }).why === 'archive-done-off', '0 = never archive done');
  ok(V(failed(), { now: T0 + 30 * D }).why === 'unacknowledged', 'an UNACKNOWLEDGED failure never archives, at ANY age');
  ok(V(failed({ ack: { by: 'user-opened', at: T0 + H } }), { now: T0 + H + 7 * D }).archive === true, 'an acknowledged failure archives 7d after the ACK (not the failure)');
  ok(V(failed({ ack: { by: 'user-opened', at: T0 + H } }), { now: T0 + H + 7 * D - 1 }).why === 'acknowledged-too-young', '…and not one ms earlier');
  ok(V(failed({ ack: { by: 'user-opened', at: T0 + H } }), { now: T0 + 30 * D, failedAfterMs: 0 }).why === 'archive-failed-off', '0 = never archive failures');
  ok(V({ ...failed(), state: 'done' }, { alive: true }).why === 'live-process', 'a live pid never archives');
  ok(V({ ...failed(), state: 'done', interaction: { pending: { version: 1 } } }).why === 'open-interaction', 'an open interaction never archives');
  ok(V({ ...failed(), kind: 'service', state: 'failed' }).why === 'not-a-one-shot' && V({ ...failed(), kind: 'cron', state: 'done' }).why === 'not-a-one-shot', 'services and cron parents never archive');
  ok(V({ ...failed(), state: 'done', cronParent: 'jb-p' }, { cronParentActive: true }).why === 'cron-schedule-active' && V({ ...failed(), state: 'done', cronParent: 'jb-p' }, { cronParentActive: false }).archive === true, "a cron child archives only once its schedule is no longer active (the child IS the cron's run ring)");
  ok(V(failed({ state: 'interrupted' }), { now: T0 + 30 * D }).why === 'unacknowledged' && V(failed({ state: 'missed' }), { now: T0 + 30 * D }).why === 'unacknowledged', 'interrupted/missed follow the failure rule (ack required)');
  // last line
  ok(M.lastLineOf('a\nb\n\n   \n') === 'b' && M.lastLineOf('') === '' && M.lastLineOf('only\r\n') === 'only', 'lastLineOf = last NON-EMPTY line, CR stripped');
  ok([...M.lastLineOf('x\n' + 'y'.repeat(500), 200)].length === 200, 'lastLineOf clips at 200 code points');
  // held-kind typing
  ok(M.heldKind({ ok: false, refused: 'spend', reason: 'spend budget: …' }) === 'spend-cap', 'a spend refusal types spend-cap');
  ok(M.heldKind(null, 'rate floor — queued for injection instead') === 'rate-floor', 'the rate floor types rate-floor');
  ok(M.heldKind({ ok: false, reason: 'no live inbox' }) === 'not-reachable' && M.heldKind(null, 'unreachable') === 'not-reachable', 'anything else is not-reachable');
  const dg = M.heldDigest(new Map([['conv-A', [{ jobId: 'jb-1', ts: 1, held: { kind: 'spend-cap', identity: 'Member A', cap: 12 } }, { jobId: 'jb-2', ts: 2, held: { kind: 'rate-floor' } }]], ['conv-B', []]]));
  ok(dg.total === 2 && dg.byConversation['conv-A'].count === 2 && dg.byConversation['conv-A'].kinds['spend-cap'] === 1 && dg.byConversation['conv-A'].reason.kind === 'rate-floor' && !dg.byConversation['conv-B'], 'heldDigest: per-conversation counts by kind, the NEWEST reason, empty queues omitted');
}

// ── TRIAGE (design §13 rules 2+3): the PURE client layout src/lib/jobs-layout.js ──
{
  const L = await import(new URL('../src/lib/jobs-layout.js', import.meta.url));
  // familyOf: the NAME FAMILY rule as a table
  const fam = [['render-r3', 'render'], ['build run', 'build'], ['export-2', 'export'], ['deploy-v1.2.3', 'deploy'], ['nightly run-2', 'nightly'], ['render-r99', 'render'], ['x-1-2', 'x'], ['job-a', 'job-a'], ['-3', '-3'], ['compile-v2', 'compile'], ['data-2026', 'data'], ['  spaced run  ', 'spaced'], ['', '']];
  for (const [inp, want] of fam) ok(L.familyOf(inp) === want, `familyOf(${JSON.stringify(inp)}) = ${JSON.stringify(want)}`, L.familyOf(inp));
  // badgeCounts / badgeText: the ONE counter
  const snap = (over) => ({ kind: 'task', state: 'failed', ack: { acked: false, by: null, at: null }, ...over });
  const jobs = [
    snap({ id: 'a' }), snap({ id: 'b', ack: { acked: true, by: 'notified', at: 1 } }), snap({ id: 'c', state: 'awaiting-user' }),
    snap({ id: 'd', state: 'up' }), snap({ id: 'e', state: 'done' }), snap({ id: 'f', kind: 'service', state: 'failed' }), snap({ id: 'g', state: 'interrupted' }), snap({ id: 'h', state: 'missed' }),
  ];
  const c = L.badgeCounts(jobs);
  ok(c.unackedFailed === 3 && c.ackedFailed === 1 && c.awaiting === 1 && c.running === 1 && c.attention === 4 && c.failed === 4 && c.total === 8, 'badgeCounts: unacked (incl. a parked service + a missed cron child) / acked / awaiting / running / attention', c);
  ok(L.badgeText(c).text === '4!' && L.badgeText(c).tone === 'danger', 'badgeText: unacked ⇒ red N!');
  ok(L.badgeText(L.badgeCounts([snap({ id: 'b', ack: { acked: true, by: 'notified', at: 1 } }), snap({ id: 'c', state: 'awaiting-user' })])).text === '1?', 'badgeText: only acked failures + awaiting ⇒ amber 1? (acknowledged failures are never red)');
  ok(L.badgeText(L.badgeCounts([snap({ id: 'b', ack: { acked: true, by: 'user-opened', at: 1 } }), snap({ id: 'd', state: 'up' })])).text === '1' && L.badgeText(L.badgeCounts([])).text === '', 'badgeText: nothing red/amber ⇒ the running count, else empty');
  // foldTasks: owner session → family; defaults; persisted folds applied AFTER
  const os = (cid, sid) => ({ ownerSession: { conversationId: cid, sessionId: sid } });
  const tasks = [
    snap({ id: '1', name: 'render-r1', ...os('conv-A', 'sess-1'), run: { endedAt: 100 } }),
    snap({ id: '2', name: 'render-r2', ...os('conv-A', 'sess-1'), run: { endedAt: 200 }, ack: { acked: true, by: 'notified', at: 1 } }),
    snap({ id: '3', name: 'export-1', state: 'done', ...os('conv-A', 'sess-1'), run: { endedAt: 300 } }),
    snap({ id: '4', name: 'export-2', state: 'done', ...os('conv-B', 'sess-2'), run: { endedAt: 50 } }),
    snap({ id: '5', name: 'build run', state: 'up', ...os('conv-B', 'sess-2'), run: { startedAt: 400 } }),
    snap({ id: '6', name: 'manual-1', state: 'done', ownerSession: { conversationId: null, sessionId: null }, run: { endedAt: 10 } }),
    snap({ id: '7', name: 'qr', state: 'awaiting-user', ...os(null, 'sess-9'), run: { startedAt: 500 } }),
  ];
  const lay = L.foldTasks(tasks, { sessionNames: { 'conv-A': 'render session A' } });
  ok(lay.sessions.map((s) => s.key).join() === 'w:sess-9,s:conv-B,s:conv-A,manual', 'sessions ordered by latest activity; conversation id > webui id > manual as the key', lay.sessions.map((s) => s.key));
  ok(lay.sessions.find((s) => s.key === 's:conv-A').label.text === 'render session A' && lay.sessions.find((s) => s.key === 's:conv-A').label.kind === 'name', 'a known session gets its display name');
  ok(lay.sessions.find((s) => s.key === 's:conv-B').label.kind === 'short' && lay.sessions.find((s) => s.key === 's:conv-B').label.text === 'conv-B' && lay.sessions.find((s) => s.key === 'manual').label.kind === 'manual', 'an unknown session gets a short id; no session ⇒ manual');
  const gA = lay.sessions.find((s) => s.key === 's:conv-A').groups;
  ok(gA.map((g) => g.family).join() === 'export,render' && gA[1].count === 2 && gA[1].failedUnacked === 1 && gA[1].failedAcked === 1, 'families inside a session: render (2: 1 unacked + 1 acked), export (1); newest first');
  ok(gA[1].defaultExpanded === true && gA[1].expanded === true, 'a group with an unacknowledged failure is EXPANDED by default');
  ok(gA[0].defaultExpanded === false && gA[0].expanded === false, 'a group of done rows is COLLAPSED by default');
  const gB = lay.sessions.find((s) => s.key === 's:conv-B').groups;
  ok(gB.find((g) => g.family === 'build').expanded === true && gB.find((g) => g.family === 'build').running === 1, 'a group holding a RUNNING job is expanded by default');
  ok(lay.sessions.find((s) => s.key === 'w:sess-9').groups[0].expanded === true, 'a group holding an awaiting-user job is expanded by default');
  ok(lay.groups.length === 6, `groups: 248 rows would become a handful — here 7 rows ⇒ ${lay.groups.length} groups`);
  const lay2 = L.foldTasks(tasks, { expanded: { 's:conv-A|render': false, 's:conv-A|export': true, 'stale|key': true }, sessionNames: {} });
  const gA2 = lay2.sessions.find((s) => s.key === 's:conv-A').groups;
  ok(gA2.find((g) => g.family === 'render').expanded === false && gA2.find((g) => g.family === 'export').expanded === true, "the user's persisted folds OVERRIDE the defaults in both directions");
  ok(gA2.find((g) => g.family === 'render').defaultExpanded === true, '…while defaultExpanded still states what the rule alone would do');
  const pruned = L.pruneFolds({ 's:conv-A|render': false, 'stale|key': true, 's:conv-A|export': true }, lay2);
  ok(Object.keys(pruned).sort().join() === 's:conv-A|export,s:conv-A|render', 'pruneFolds drops a key no current group holds (user state stays bounded)');
  // heldText: structure in, the device's words out
  const dg = { total: 3, byConversation: { 'conv-A': { count: 3, kinds: { 'spend-cap': 3 }, reason: { kind: 'spend-cap', why: 'hour-cap', identity: 'Member A', cap: 12 } } } };
  const txt = L.heldText(dg, { t: (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p[k]) });
  ok(txt === '3 notifications held — Member A’s hourly ceiling (12) reached; delivered with the conversation’s next prompt · Settings → Spending', 'heldText (spend-cap): names the account, the ceiling and where to change it', txt);
  ok(/1 notification held — the 30 s per-conversation floor/.test(L.heldText({ total: 1, byConversation: { x: { count: 1, kinds: { 'rate-floor': 1 }, reason: { kind: 'rate-floor' } } } })), 'heldText (rate-floor) with the built-in fallback t');
  ok(L.heldText(dg, { cid: 'conv-Z' }) === '' && L.heldText({ total: 0, byConversation: {} }) === '' && L.heldText(null) === '', 'nothing held for that conversation / nothing at all ⇒ empty');
  ok(/^3 notifications held/.test(L.heldText(dg, { cid: 'conv-A' })), 'the per-conversation form (the chat status-bar chip) narrows to one conversation');
  // attentionOf mirrors the server's rule on snapshots
  ok(L.attentionOf(snap({ ack: { acked: true, by: 'notified', at: 1 } })) === 'acked-failure' && L.attentionOf(snap({})) === 'unacked-failure' && L.attentionOf(snap({ state: 'done' })) === null && L.attentionOf(snap({ kind: 'service', state: 'failed', ack: { acked: true } })) === 'unacked-failure', 'attentionOf reads job.ack; a parked service is always unacked');
  // WIRING PINS: both counters and the fold live in the layout module, never inline
  const panel = require('fs').readFileSync(new URL('../src/lib/jobs-panel.js', import.meta.url), 'utf-8');
  const rail = require('fs').readFileSync(new URL('../src/lib/sidebar-rail.js', import.meta.url), 'utf-8');
  ok(/from '\.\/jobs-layout\.js'/.test(panel) && /from '\.\/jobs-layout\.js'/.test(rail), 'jobs-panel and sidebar-rail import the PURE layout');
  ok((panel.match(/badgeCounts\(jobs\)/g) || []).length === 2 && !/\['failed', 'missed', 'unverified'\]\.includes\(j\.state\)\)\.length/.test(panel) && !/\['failed', 'missed', 'unverified'\]\.includes\(j\.state\)\)\.length/.test(rail), 'the two summary sites and the rail badge use badgeCounts — the inline `bad` computation is gone from both files');
  ok(/foldTasks\(list, \{ expanded: FOLDS \|\| \{\}, sessionNames: sessionNameMap\(app\) \}\)/.test(panel) && /aria-expanded/.test(panel) && /jobsPanelFolds/.test(panel) && /pruneFolds\(/.test(panel), 'the Tasks section folds through foldTasks, group rows carry aria-expanded, folds persist as jobsPanelFolds and are pruned on write');
  ok(/\/api\/jobs\/\$\{j\.id\}\/seen/.test(panel), 'expanding a row POSTs /seen');
  ok(/fetchJson\('\/api\/jobs\?archived=1'\)/.test(panel) && /if \(!ARCHIVE_OPEN\) return;/.test(panel), 'the Archived row fetches the archive only once opened');
  ok(/jobs-lastline/.test(panel) && /j\.run\.lastLine/.test(panel), 'a failed row renders run.lastLine');
}

// ── TRIAGE: the ACK LANE CENSUS (verifier 2026-09-16) ────────────────────
// ACK_LANES omitted 'rpc-queue' — the codex lane — so a notification that WAS
// delivered live to a codex-owned conversation (a billed turn/start when idle,
// a steer / queue/add when busy) never acknowledged: every codex-owned failure
// stayed red on the badge for ever and was never archived (the failed clock
// starts at the ack). The set is now held by a CENSUS over the two producers
// of ok:true journal entries — every `lane: '<x>'` the delivery ladder returns
// with ok:true and every literal lane jobs.js journals with ok:true. A lane
// either of them grows must acknowledge, or this leg goes red and names it.
{
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const blank = (s) => s.replace(/^\s*\/\/.*$/gm, ''); // a census reads CODE — whole-line comments blanked first
  const ladder = blank(fs.readFileSync(path.join(ROOT, 'src/server/conversation-deliver.js'), 'utf-8'));
  const engine = blank(fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8'));
  const okLanes = new Set(), notOkLanes = new Set();
  for (const m of ladder.matchAll(/return \{ ok: true,[^}]*?lane: '([^']+)'/g)) okLanes.add(m[1]);
  for (const m of engine.matchAll(/_notifyLogPush\(job, \{ lane: '([^']+)', ok: true/g)) okLanes.add(m[1]);
  for (const m of ladder.matchAll(/return \{ ok: false,[^}]*?lane: '([^']+)'/g)) notOkLanes.add(m[1]);
  for (const m of engine.matchAll(/_notifyLogPush\(job, \{ lane: '([^']+)', ok: false/g)) notOkLanes.add(m[1]);
  const onlyNotOk = [...notOkLanes].filter((l) => !okLanes.has(l)).sort();
  console.log('  census: ok:true lanes = ' + [...okLanes].sort().join(', ') + ' | ok:false-only lanes = ' + onlyNotOk.join(', '));
  ok(okLanes.size >= 4 && okLanes.has('rpc-queue') && okLanes.has('message') && okLanes.has('user-inbox'), `the census sees both producers (${okLanes.size} ok:true lanes incl. rpc-queue — the incident's own)`);
  const T0 = 1_700_000_000_000, D = 86400e3;
  const failed = (lane, okv = true) => ({ id: 'jb-c', kind: 'task', state: 'failed', owner: { conversation: { id: 'conv-A' } }, runs: [{ startedAt: T0, endedAt: T0 + 60e3, exit: 1 }], notifyLog: [{ ts: T0 + 61e3, lane, ok: okv }] });
  const stranded = [...okLanes].filter((lane) => M.ackState(failed(lane), T0 + D).by !== 'notified');
  ok(stranded.length === 0, 'every lane the ladder / engine journals ok:true on ACKNOWLEDGES' + (stranded.length ? ' — stranded: ' + stranded.join(', ') : ''));
  ok(M.ACK_LANES && [...M.ACK_LANES].every((l) => okLanes.has(l)), 'ACK_LANES names no lane nobody produces (a dead entry fails too): ' + (M.ACK_LANES ? [...M.ACK_LANES].join(', ') : 'NOT EXPORTED'));
  ok(M.ackState(failed('rpc-queue'), T0 + D).by === 'notified', "a codex delivery (lane 'rpc-queue', ok:true) acknowledges");
  // control: the lanes that deliver NOTHING never acknowledge — not even on an entry whose ok is flipped
  ok(onlyNotOk.length >= 3 && ['stash', 'off', 'suppressed'].every((l) => onlyNotOk.includes(l)), 'the ok:false-only lanes are exactly the non-delivering ones (stash / off / suppressed present)');
  for (const lane of ['stash', 'off', 'suppressed']) ok(M.ACK_LANES && !M.ACK_LANES.has(lane) && !M.ackState(failed(lane, true), T0 + D).acked, `'${lane}' never acknowledges, even on an ok:true entry`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
