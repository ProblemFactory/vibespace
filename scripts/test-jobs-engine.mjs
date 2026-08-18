#!/usr/bin/env node
// Background Work ENGINE gate (real spawns in an isolated tmp dataDir — never
// the repo's production data/). Pins: spawn→adopt-by-stamp across engine
// generations, single-engine lock refusal, verified handle-kill, until-output
// completion, rm-refuses-live, GC-never-on-live, cron notify fire.
process.env.VIBESPACE_JOBS_GRACE_MS = '1000';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JobManager } = require('../src/jobs.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(400); } return false; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jobs-'));
fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
fs.copyFileSync(new URL('../data/bin/job-wrapper.js', import.meta.url), path.join(dir, 'bin', 'job-wrapper.js'));
const notifications = [];
const deps = { dataDir: dir, broadcast: () => { }, notifyUser: (n) => notifications.push(n), log: () => { } };
const caller = { conversationId: 'conv-T', sessionId: 'sess-T', sessionCreatedAt: 1, groups: new Set(['T-g']) };
const owner = { conversation: { backend: 'claude', id: 'conv-T' }, sessionId: 'sess-T', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: ['T-g'] };

try {
  // 1. spawn + stamp
  const A = new JobManager(deps); A.init();
  ok(A.ready && !A.readOnly, 'engine A takes the lock and initializes');
  const r1 = A.create({ kind: 'task', name: 'sleeper', cmd: { argv: ['sh', '-c', 'sleep 30'] }, owner }, caller);
  ok(r1.job && !r1.error, 'task created', r1.error);
  const j1 = A.jobs.get(r1.job.id);
  ok(await until(() => A._verifyAlive(A._readStamp(j1))), 'wrapper wrote a verifiable pid+starttime+bootId stamp');

  // 2. single-engine lock: fake a FOREIGN live engine
  const decoy = spawn('sleep', ['20']);
  await sleep(200);
  const stRaw = fs.readFileSync(`/proc/${decoy.pid}/stat`, 'utf-8');
  const starttime = Number(stRaw.slice(stRaw.lastIndexOf(')') + 2).split(' ')[19]);
  fs.writeFileSync(path.join(dir, 'jobs.lock'), JSON.stringify({ pid: decoy.pid, starttime }));
  const B = new JobManager(deps); B.init();
  ok(B.readOnly === true, 'second engine against a live foreign lock goes READ-ONLY');
  ok(B.create({ kind: 'task', name: 'x', cmd: { argv: ['true'] }, owner }, caller).error, 'read-only engine refuses creates');
  decoy.kill('SIGKILL');

  // 3. adopt across an engine generation (simulated restart)
  A._save();
  fs.rmSync(path.join(dir, 'jobs.lock'), { force: true });
  const C = new JobManager(deps); C.init();
  const j1c = C.jobs.get(r1.job.id);
  ok(j1c && j1c.state === 'up' && C._verifyAlive(C._readStamp(j1c)), 'new engine ADOPTS the live task by stamp (no respawn, no kill)');

  // 4. rm refuses live; GC never touches live
  ok(C.rm(j1c).error && C.jobs.has(j1c.id), 'rm on a running job refuses with guidance');
  await C._gc();
  ok(C.jobs.has(j1c.id), 'GC never collects a record whose stamp verifies alive');

  // 5. verified stop
  C.stop(j1c);
  ok(await until(() => ['interrupted', 'failed'].includes(j1c.state)), 'stop kills the group and finalizes the run', j1c.state);
  ok((j1c.runs[j1c.runs.length - 1].cause || '') === 'interrupted', 'stop records cause=interrupted');

  // 6. until-output completion (grace shrunk via env)
  const r2 = C.create({ kind: 'task', name: 'marker', cmd: { argv: ['sh', '-c', 'echo START; echo THE_MARKER; sleep 60'] }, untilOutput: 'THE_MARKER', owner }, caller);
  const j2 = C.jobs.get(r2.job.id);
  ok(await until(() => j2.state === 'done', 30000), 'until-output marker completes the task', j2.state);
  ok(j2.runs[j2.runs.length - 1].cause === 'ok(until-output)', 'cause=ok(until-output)', j2.runs[j2.runs.length - 1].cause);

  // 7. cron notify fire (forced past nextFireAt)
  const r3 = C.create({ kind: 'cron', name: 'noti', schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: 'ping from cron' }, owner }, caller);
  const j3 = C.jobs.get(r3.job.id);
  j3.nextFireAt = Date.now() - 1000;
  await C._cronTick();
  ok(notifications.some((n) => n.text === 'ping from cron'), 'cron notify action reaches the user channel');
  ok(j3.state === 'done', 'one-shot {at} cron goes done after firing');

  // 7b. cron spawn-task: ONE reused child across fires; routine success silent
  const r4 = C.create({ kind: 'cron', name: 'tick', schedule: { at: Date.now() + 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['sh', '-c', 'exit 0'] } } }, owner }, caller);
  const j4 = C.jobs.get(r4.job.id);
  j4.nextFireAt = Date.now() - 1000; j4.schedule = { everyMs: 3600e3 }; // recurring so it can fire twice
  await C._cronTick();
  ok(await until(() => [...C.jobs.values()].some((x) => x.cronParent === j4.id && x.state === 'done'), 15000), 'first cron fire spawns and completes a child');
  const evCount = C.events.length;
  j4.nextFireAt = Date.now() - 1000;
  await C._cronTick();
  await until(() => { const k = [...C.jobs.values()].find((x) => x.cronParent === j4.id); return k && k.state === 'done' && (k.runs || []).length >= 2; }, 15000);
  const kids = [...C.jobs.values()].filter((x) => x.cronParent === j4.id);
  ok(kids.length === 1 && (kids[0].runs || []).length >= 2, 'second fire REUSES the same child (one record, two runs)', `kids=${kids.length} runs=${kids[0] && kids[0].runs.length}`);
  ok(!C.events.slice(evCount).some((e) => e.jobId === kids[0].id && /done exit=0/.test(e.what || '')), 'routine cron success emits NO event (quiet-success)');

  // 7c. owner auto-notify (2.344.0): deliver lane, stash lane, drain, toggles
  const delivered = [];
  C.d.notifyGlobal = () => true;
  C._notifyRate.clear(); // earlier phases posted for conv-T — reset the floor
  C.pendingNotifs.clear();
  C.d.deliverToConversation = async (cid, text) => { delivered.push({ cid, text }); return { ok: true, lane: 'message', peerName: 'peer-X' }; };
  const rn1 = C.create({ kind: 'task', name: 'notif-ok', cmd: { argv: ['sh', '-c', 'exit 1'] }, owner }, caller);
  const jn1 = C.jobs.get(rn1.job.id);
  ok(await until(() => jn1.state === 'failed' && jn1.lastNotify && jn1.lastNotify.lane === 'message' && jn1.lastNotify.ok, 15000), 'failed task messages the owner conversation (lastNotify lane=message)', JSON.stringify(jn1.lastNotify));
  ok(delivered.length === 1 && delivered[0].cid === 'conv-T' && delivered[0].text.includes(jn1.id), 'delivery targeted the owner conversation lineage id and named the job');
  // stash lane: delivery fails → durable per-conversation queue, drained at injection
  C.d.deliverToConversation = async () => ({ ok: false, reason: 'no live inbox' });
  C._notifyRate.clear();
  const rn2 = C.create({ kind: 'task', name: 'notif-stash', cmd: { argv: ['sh', '-c', 'exit 1'] }, owner }, caller);
  const jn2 = C.jobs.get(rn2.job.id);
  ok(await until(() => jn2.lastNotify && jn2.lastNotify.lane === 'stash', 15000), 'unreachable owner → notification stashed (lastNotify lane=stash)', JSON.stringify(jn2.lastNotify));
  C._save();
  const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'job-notifications.json'), 'utf-8'));
  ok(Array.isArray(persisted['conv-T']) && persisted['conv-T'].some((n) => n.jobId === jn2.id), 'stash persists to job-notifications.json keyed by conversation');
  const drained = C.drainNotifs('conv-T');
  ok(drained.length >= 1 && C.drainNotifs('conv-T').length === 0, 'drainNotifs returns the queue once and clears it');
  // toggle: job-level off → no delivery, no stash
  C.d.deliverToConversation = async () => { throw new Error('must not be called'); };
  C._notifyRate.clear();
  const rn3 = C.create({ kind: 'task', name: 'notif-off', notify: 'off', cmd: { argv: ['sh', '-c', 'exit 1'] }, owner }, caller);
  const jn3 = C.jobs.get(rn3.job.id);
  ok(await until(() => jn3.state === 'failed', 15000) && (await sleep(300), !jn3.lastNotify || jn3.lastNotify.lane === 'off'), 'notify:off job never posts (lastNotify lane=off)', JSON.stringify(jn3.lastNotify));
  // preview honesty
  C.d.peerReachable = () => false;
  const pv = C.notifyPreview(jn1);
  ok(pv && pv.enabled === true && pv.mode === 'resume-inject', 'notifyPreview: enabled but unreachable → resume-inject mode');
  ok(C.notifyPreview(jn3).enabled === false, 'notifyPreview: job-level off reported disabled');

  // 7d. 2.344.1 review fixes: missed-{at} is terminal-once; rate floor stashes distinct events
  const rm1 = C.create({ kind: 'cron', name: 'missed-once', schedule: { at: Date.now() + 3600e3 }, catchUp: 'none', action: { type: 'notify', text: 'x' }, owner }, caller);
  const jm1 = C.jobs.get(rm1.job.id);
  jm1.nextFireAt = Date.now() - 300_000; // pretend the server slept past it (>120s catch-up window)
  await C._cronTick();
  ok(jm1.state === 'missed' && jm1.desiredUp === false && jm1.nextFireAt === null, 'missed {at} cron parks terminally (no re-notify loop)', `${jm1.state}/${jm1.desiredUp}/${jm1.nextFireAt}`);
  const evBefore = C.events.length;
  await C._cronTick();
  ok(C.events.length === evBefore, 'second tick after missed emits NOTHING');
  C._notifyRate.set('conv-T', { ts: Date.now(), text: 'other' });
  C.pendingNotifs.clear();
  C.d.deliverToConversation = async () => { throw new Error('floored events must not hit the socket'); };
  C._notifyOwner({ id: 'jb-floor', name: 'floor-test', state: 'failed', kind: 'task', owner: { conversation: { id: 'conv-T' } } }, { what: 'failed exit=1' });
  ok((C.pendingNotifs.get('conv-T') || []).some((n) => n.jobId === 'jb-floor'), 'rate-floored DISTINCT event is stashed, not dropped');

  // 8. store hygiene: raw token never persisted
  C._save();
  ok(!fs.readFileSync(path.join(dir, 'jobs.json'), 'utf-8').includes('jbt_'), 'raw job tokens are never written to the store');

  // 9. rm --stop on terminal + cleanup
  ok(C.rm(j2, {}).ok, 'rm on a terminal task succeeds');
  C.shutdown();
} finally {
  try { const all = JSON.parse(fs.readFileSync(path.join(dir, 'jobs.json'), 'utf-8')); } catch { }
  try { for (const d of fs.readdirSync(path.join(dir, 'job-logs'))) { } } catch { }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
