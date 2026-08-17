#!/usr/bin/env node
// PURE model gate for Background Work (docs/design-background-work.md M1).
import { createRequire } from 'node:module';
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
