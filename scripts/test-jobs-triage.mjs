#!/usr/bin/env node
// test-jobs-triage — the Background Work TRIAGE layer over the REAL engine +
// the REAL user routes (docs/design-background-work.md §13, owner-approved
// 2026-09-14): a scratch dataDir seeded with the NEUTRALIZED fixture shaped
// after the measured instance (scripts/jobs-triage-fixture.mjs), the archive
// sweep driven with an INJECTED clock, the acknowledgement stamps, the archive
// read-through, the cap, a restart, the once-per-sweep broadcast, the user
// routes (/seen, ?archived=1, rm) and the CLI's `list --archived` against a
// tiny fake API. No spawns, no fixed ports/paths (scripts/scratch.mjs), every
// instant derived from one clock taken at start.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, freePorts } from './scratch.mjs';
import { spawn } from 'node:child_process';
import { makeFixture, SESSIONS, writeAliveStamp } from './jobs-triage-fixture.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs'; // r6 D-F5: the pre-fix panel identity as a negative control
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { JobManager, ARCHIVE_CAP, ARCHIVE_SWEEP_MS } = require(path.join(ROOT, 'src/jobs.js'));
const M = require(path.join(ROOT, 'src/job-model.js'));
const wiring = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const H = 3600e3, D = 86400e3;
const T0 = Date.now(); // the ONE clock; everything below is relative to it
const dirs = [];
const mkDir = (name) => { const d = scratch(name); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(path.join(d, 'bin'), { recursive: true }); dirs.push(d); return d; };
const cleanup = () => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
const readStore = (d) => JSON.parse(fs.readFileSync(path.join(d, 'jobs.json'), 'utf-8'));
const readArchive = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'jobs-archive.json'), 'utf-8')); } catch { return null; } };

/** a route registry standing in for express: handlers are called with fake req/res */
function fakeApp() {
  const routes = new Map();
  const reg = (m) => (p, h) => routes.set(m + ' ' + p, h);
  const app = { get: reg('GET'), post: reg('POST'), patch: reg('PATCH'), delete: reg('DELETE'), use() { } };
  const call = (m, p, { params = {}, query = {}, body = {} } = {}) => new Promise((resolve) => {
    const h = routes.get(m + ' ' + p);
    if (!h) return resolve({ status: 404, body: { error: 'no route ' + m + ' ' + p } });
    const res = { _status: 200, status(c) { this._status = c; return this; }, json(o) { resolve({ status: this._status, body: o }); } };
    Promise.resolve().then(() => h({ params, query, body, headers: {} }, res)).catch((e) => resolve({ status: 500, body: { error: e.message } }));
  });
  return { app, call };
}
const policy = { doneAfterHours: 24, failedAfterDays: 7 };
function boot(dir, { broadcasts = [], mod = wiring } = {}) {   // mod: a wiring module (a control's copy)
  const { app, call } = fakeApp();
  const W = mod.create({
    app, dataDir: dir, broadcastAll: (m) => broadcasts.push(m), userTodos: { add() { }, resolveByJob() { return 0; } }, log: () => { },
    serverSetting: (k) => (k === 'jobs.archiveDoneAfterHours' ? policy.doneAfterHours : k === 'jobs.archiveFailedAfterDays' ? policy.failedAfterDays : undefined),
    taskGroups: null, activeSessions: null, deliver: { peerReachable: () => false, deliverToConversation: async () => ({ ok: false, reason: 'no lane' }) },
  });
  W.initAfterListen();
  return { W, jm: W.jm, call, broadcasts };
}

// ── §1 the measured shape at boot: nothing archives, the counts are the incident's ──
console.log('§1 boot over the neutral fixture (200 done < 24h, 36 failed 1–5 d, mixed acknowledgement)');
const fx = makeFixture(T0);
const dir1 = mkDir('jobs-triage');
fs.writeFileSync(path.join(dir1, 'jobs.json'), JSON.stringify(fx.jobs.map(strip)));
fs.writeFileSync(path.join(dir1, 'job-notifications.json'), JSON.stringify(fx.notifs));
// the running / awaiting rows must be ADOPTED at boot (a task with no live
// stamp is finalized as env-restart ⇒ interrupted): stamp them with a real
// process this suite owns
const sleeper = spawn('sleep', ['3600'], { stdio: 'ignore' });
process.on('exit', () => { try { sleeper.kill('SIGKILL'); } catch { } });
for (const id of [fx.ids.running, fx.ids.awaiting]) writeAliveStamp(fs, path, dir1, fx.jobs.find((j) => j.id === id), sleeper.pid);
const bc1 = [];
const { jm, call } = boot(dir1, { broadcasts: bc1 });
ok(jm.ready && !jm.readOnly, 'the engine takes the lock over the fixture store');
ok(jm.jobs.size === fx.jobs.length, `every fixture record is live at boot (${jm.jobs.size} = ${fx.jobs.length}; the boot sweep archived nothing at the real clock)`);
ok(jm.jobs.get(fx.ids.running).state === 'up' && jm.jobs.get(fx.ids.awaiting).state === 'awaiting-user', 'the running and awaiting-user rows were ADOPTED (live stamp), not finalized');
const failedIds = fx.failedRows.map((r) => r.id);
const ackBy = (id) => M.ackState(jm.jobs.get(id) || jm.archivedById(id)).by;
const byKind = (k) => fx.failedRows.filter((r) => r.kind === k).map((r) => r.id);
ok(byKind('notified').every((id) => ackBy(id) === 'notified'), 'failed rows whose journal carries an ok:true message delivery are acknowledged (notified)');
ok(byKind('stash').every((id) => ackBy(id) === null), 'failed rows whose ONLY journal entry is a stash are UNACKNOWLEDGED');
ok(byKind('agent-read').every((id) => ackBy(id) === 'agent-read') && byKind('user-opened').every((id) => ackBy(id) === 'user-opened'), 'the agent-read / user-opened stamps acknowledge');
ok(byKind('stranger').every((id) => ackBy(id) === null) && byKind('self').every((id) => ackBy(id) === null), "a stranger session's read and a jbt_ self-read left no stamp ⇒ unacknowledged");
const unackedAtBoot = failedIds.filter((id) => ackBy(id) === null);
const ackedAtBoot = failedIds.filter((id) => ackBy(id) !== null);
ok(unackedAtBoot.length === byKind('stash').length + byKind('stranger').length + byKind('self').length, `the unacknowledged set is exactly stash+stranger+self (${unackedAtBoot.length} of ${failedIds.length})`);
const list0 = await call('GET', '/api/jobs');
ok(list0.status === 200 && list0.body.jobs.length === fx.jobs.length && list0.body.archivedCount === 0 && list0.body.held && list0.body.held.total === Object.values(fx.notifs).flat().length, `GET /api/jobs carries the live list + archivedCount 0 + the held digest (${list0.body.held && list0.body.held.total} held)`);
const snapFailed = list0.body.jobs.find((j) => j.id === byKind('stash')[0]);
ok(snapFailed && snapFailed.ack && snapFailed.ack.acked === false && snapFailed.run && /failed to render/.test(snapFailed.run.lastLine) && snapFailed.ownerSession && snapFailed.ownerSession.conversationId, 'a snapshot carries ack + run.lastLine + ownerSession (the fold key)');
const attention = list0.body.jobs.filter((j) => M.attentionOf(j) === 'unacked-failure' || M.attentionOf(j) === 'awaiting').length;
ok(attention === unackedAtBoot.length + 1, `attention = unacknowledged failures + awaiting-user = ${attention} (the badge no longer says 36!)`);

// ── §2 /seen stamps user-opened; markAck first wins; the drain stamps notified ──
console.log('§2 acknowledgement stamps');
const target = byKind('stranger')[0];
const seen = await call('POST', '/api/jobs/:id/:act', { params: { id: target, act: 'seen' } });
ok(seen.status === 200 && seen.body.changed === true && seen.body.ack.by === 'user-opened', 'POST /api/jobs/:id/seen stamps user-opened on an unacknowledged failure');
ok(bc1.some((m) => m.type === 'jobs-updated' && m.id === target), '…and broadcasts jobs-updated for the record');
const seenAt = jm.jobs.get(target).ack.at;
const seen2 = await call('POST', '/api/jobs/:id/:act', { params: { id: target, act: 'seen' } });
ok(seen2.body.changed === false && jm.jobs.get(target).ack.at === seenAt, 'a second /seen changes nothing — the FIRST acknowledgement wins');
ok(!jm.markAck(jm.jobs.get(fx.ids.running), 'user-opened') && !jm.markAck(jm.jobs.get(fx.ids.service), 'user-opened'), 'a running task and a service refuse the stamp (not terminal one-shots)');
const seenRun = await call('POST', '/api/jobs/:id/:act', { params: { id: fx.ids.running, act: 'seen' } });
ok(seenRun.status === 200 && seenRun.body.changed === false, '/seen on a running job is a harmless no-op');
const stashCid = jm.jobs.get(byKind('stash')[0]).owner.conversation.id;
const drained = jm.drainNotifs(stashCid);
ok(drained.length >= 1 && byKind('stash').filter((id) => jm.jobs.get(id).owner.conversation.id === stashCid).every((id) => ackBy(id) === 'notified'), 'draining the stash into a resume stamps notified on the jobs it named');
{ // an entry OLDER than the job's terminal instant (an earlier run) acks nothing
  const j = jm.jobs.get(byKind('self')[0]);
  jm.pendingNotifs.set(j.owner.conversation.id, [{ jobId: j.id, jobName: j.name, text: 'old', ts: M.terminalAt(j) - 1 }]);
  jm.drainNotifs(j.owner.conversation.id);
  ok(ackBy(j.id) === null, 'a drained entry dated before the terminal instant acknowledges nothing');
}
{ // agent-read: the PURE predicate the route asks + the wiring pin
  const j = jm.jobs.get(byKind('self')[0]);
  const owner = { conversationId: j.owner.conversation.id, sessionId: 'sess-NEW', sessionCreatedAt: 9, groups: new Set(['T-1']) };
  const stranger = { conversationId: 'e2e00000-0000-4000-8000-00000000ffff', sessionId: 'sZ', sessionCreatedAt: 3, groups: new Set(['T-1']) };
  ok(M.agentReadAcks(j, owner) && !M.agentReadAcks(j, stranger) && !M.agentReadAcks(j, owner, { selfJob: true }), 'agentReadAcks: owner lineage yes, stranger no, jbt_ self no');
  const src = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf-8');
  ok(/jobModel\.agentReadAcks\(job, a\.caller, \{ selfJob: !!a\.selfJob \}\)\) a\.jm\.markAck\(job, 'agent-read'\)/.test(src), "WIRING PIN: GET /api/agent/jobs/:ref stamps 'agent-read' through agentReadAcks (never a second predicate)");
}

{ // a codex-owned failure notified on the ladder's 'rpc-queue' lane is acknowledged in the SERVED snapshot (verifier 2026-09-16: ACK_LANES lacked the codex lane ⇒ every codex-owned failure stayed red for ever and never archived)
  const j = strip(jm.jobs.get(byKind('stash')[0])); delete j.ack; // §2's drain stamped this row; the leg is about the JOURNAL rule
  j.id = 'jb-codexowned'; j.name = 'codex render'; j.notifyLog = [{ ts: M.terminalAt(j) + 500, lane: 'rpc-queue', ok: true, to: 'peer' }];
  jm.jobs.set(j.id, j);
  const l = await call('GET', '/api/jobs');
  const snap = l.body.jobs.find((x) => x.id === j.id);
  ok(snap && snap.ack && snap.ack.acked === true && snap.ack.by === 'notified' && M.attentionOf(snap) === 'acked-failure', "a failure delivered LIVE on the codex lane (rpc-queue, ok:true) is served acknowledged — never a red badge");
  jm.jobs.delete(j.id);
}

// ── §3 the sweep with an injected clock ──
console.log('§3 archival: who archives, who stays, one broadcast per sweep');
policy.doneAfterHours = 24; policy.failedAfterDays = 7;
bc1.length = 0;
const r25 = jm.archiveSweep({ now: T0 + 25 * H });
const doneIds = fx.jobs.filter((j) => j.kind === 'task' && j.state === 'done' && !j.cronParent).map((j) => j.id);
ok(r25.archived.length === doneIds.length && doneIds.every((id) => r25.archived.includes(id)), `+25 h: exactly the ${doneIds.length} done one-shots archive`);
ok(failedIds.every((id) => jm.jobs.has(id)), 'no failed row archives at +25 h (the failed clock is 7 d after the ACK)');
ok([fx.ids.running, fx.ids.awaiting, fx.ids.service, fx.ids.cron, fx.ids.cronChild].every((id) => jm.jobs.has(id)), 'running / awaiting-user / service / cron parent / active cron child all stay');
ok(bc1.filter((m) => m.type === 'jobs-updated' && Array.isArray(m.archived)).length === 1, 'the sweep broadcasts jobs-updated ONCE, not per record');
const store25 = readStore(dir1), arch25 = readArchive(dir1);
ok(!store25.some((j) => doneIds.includes(j.id)) && doneIds.every((id) => arch25.some((r) => r.id === id)), 'EXIT: the done rows are gone from jobs.json and present in jobs-archive.json');
ok(arch25.every((r) => r.archivedAt === T0 + 25 * H && r.archivedWhy === 'done' && r.runs && r.notifyLog), 'an archived record keeps runs/notifyLog and gains archivedAt + archivedWhy');
ok(jm.archiveSweep({ now: T0 + 25 * H + 1 }).archived.length === 0, 'a second sweep at the same clock moves nothing (idempotent)');
// acked failures: 7 d after the ACK; unacked: never
const r8d = jm.archiveSweep({ now: T0 + 8 * D + H });
ok(ackedAtBoot.concat([target]).every((id) => r8d.archived.includes(id)), '+8 d: every ACKNOWLEDGED failure (notified / agent-read / user-opened, incl. the /seen one) archives with why=failed-acknowledged');
ok(r8d.archived.every((id) => jm.archivedById(id).archivedWhy === 'failed-acknowledged'), '…each carrying why=failed-acknowledged');
const stillUnacked = failedIds.filter((id) => jm.jobs.has(id));
ok(stillUnacked.length && stillUnacked.every((id) => ackBy(id) === null), `the ${stillUnacked.length} unacknowledged failures stay`);
ok(jm.archiveSweep({ now: T0 + 400 * D }).archived.filter((id) => stillUnacked.includes(id)).length === 0 && stillUnacked.every((id) => jm.jobs.has(id)), 'an UNACKNOWLEDGED failure never archives — not at +400 d either');
// the cron child follows its schedule
ok(jm.jobs.has(fx.ids.cronChild), 'the cron child stayed while its parent schedules fires (it IS the run ring)');
jm.jobs.get(fx.ids.cron).desiredUp = false;
ok(jm.archiveSweep({ now: T0 + 400 * D }).archived.includes(fx.ids.cronChild), '…and archives once the schedule is stopped');
// 0 = never
policy.doneAfterHours = 0;
{
  const j = { ...strip(fx.jobs[0]), id: 'jb-zero0', name: 'export-zero' };
  jm.jobs.set(j.id, j);
  ok(jm.archiveSweep({ now: T0 + 400 * D }).archived.length === 0 && jm.jobs.has(j.id), 'jobs.archiveDoneAfterHours = 0 archives no done record');
  policy.doneAfterHours = 24;
  ok(jm.archiveSweep({ now: T0 + 400 * D }).archived.includes(j.id), '…and the default policy archives it');
}
// live pid / open interaction never archive (the pure verdict, pinned through the engine)
ok(jm.jobs.has(fx.ids.awaiting) && jm.archiveSweep({ now: T0 + 400 * D }).archived.length === 0, 'an awaiting-user job with an open panel is never archived');

// ── §4 read-through: a held id never 404s; the same shape ──
console.log('§4 read-through + routes');
const oldId = doneIds[0];
const g = await call('GET', '/api/jobs/:id', { params: { id: oldId }, query: { tail: 5 } });
ok(g.status === 200 && g.body.job.archived === true && g.body.job.id === oldId && g.body.job.archivedWhy === 'done' && 'run' in g.body.job && 'ack' in g.body.job, 'GET /api/jobs/:id of an ARCHIVED id answers 200 with archived:true and the live snapshot shape');
const live = list0.body.jobs.find((j) => j.id === oldId);
const shapeKeys = (o) => Object.keys(o).filter((k) => !['archived', 'archivedAt', 'archivedWhy', 'envKeys', 'envFrom', 'ownerSession', 'access', 'runs', 'interaction', 'logTail'].includes(k)).sort().join(',');
ok(shapeKeys(g.body.job) === shapeKeys(live), 'the archived snapshot carries every key the live snapshot carries (plus the archive marks)');
const la = await call('GET', '/api/jobs', { query: { archived: '1' } });
ok(la.status === 200 && la.body.archived === true && la.body.jobs.length === jm.archivedCount() && la.body.jobs.every((j) => j.archived === true && j.archivedAt), 'GET /api/jobs?archived=1 lists the archive (same shape + archivedAt)');
const l2 = await call('GET', '/api/jobs');
ok(l2.body.archivedCount === jm.archivedCount() && !l2.body.jobs.some((j) => j.id === oldId), 'the live list carries archivedCount and no archived row');
const bad = await call('POST', '/api/jobs/:id/:act', { params: { id: oldId, act: 'start' } });
ok(bad.status === 400 && /archived/.test(bad.body.error), 'an action other than rm on an archived id is refused BY NAME (400, never a 404)');
const seenArc = await call('POST', '/api/jobs/:id/:act', { params: { id: oldId, act: 'seen' } });
ok(seenArc.status === 200 && seenArc.body.archived === true && seenArc.body.changed === false, '/seen on an archived id is a no-op that says so');
fs.mkdirSync(path.join(dir1, 'job-logs', oldId), { recursive: true }); fs.writeFileSync(path.join(dir1, 'job-logs', oldId, 'x'), '1');
const rm = await call('POST', '/api/jobs/:id/:act', { params: { id: oldId, act: 'rm' } });
ok(rm.status === 200 && !jm.archivedById(oldId) && !readArchive(dir1).some((r) => r.id === oldId) && !fs.existsSync(path.join(dir1, 'job-logs', oldId)), '✕ on an archived row deletes it for good (record + log dir) and persists');
ok(bc1.some((m) => m.type === 'jobs-updated' && m.id === oldId && m.removed === true && m.archived === true), '…and broadcasts the removal');
ok((await call('GET', '/api/jobs/:id', { params: { id: oldId } })).status === 404, 'a deleted archived id is a real 404');

// ── §5 a restart re-reads the archive ──
console.log('§5 restart');
jm.shutdown();
fs.rmSync(path.join(dir1, 'jobs.lock'), { force: true });
const B = new JobManager({ dataDir: dir1, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
B.init();
ok(B.archivedCount() === readArchive(dir1).length && B.archivedById(doneIds[1]) && B.archivedById(doneIds[1]).archivedWhy === 'done', 'a fresh engine over the same dir reads the archive back');
ok(!B.jobs.has(doneIds[1]) && stillUnacked.every((id) => B.jobs.has(id) && M.ackState(B.jobs.get(id)).acked === false), 'the live store still holds only the unarchived records; the unacked failures survive the restart unacknowledged');
ok(B.jobs.get(target) === undefined && B.archivedById(target) && B.archivedById(target).ack && B.archivedById(target).ack.by === 'user-opened', 'the /seen stamp travelled into the archive with its record');
B.shutdown();

// ── §6 the cap keeps the NEWEST 2000; dropped records lose their log dirs ──
console.log('§6 the archive cap');
{
  const dir2 = mkDir('jobs-triage-cap');
  const N = ARCHIVE_CAP + 100;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const endedAt = T0 - 30 * H - i * 60e3; // i=0 newest … i=N-1 oldest, all past the 24 h clock
    rows.push({ id: `jb-cap${i.toString(16).padStart(4, '0')}`, kind: 'task', name: `cap-${i}`, state: 'done', desiredUp: true, owner: {}, access: { view: 'all', control: 'session' }, interaction: { pending: null, answers: [] }, runs: [{ startedAt: endedAt - 1e3, endedAt, exit: 0, cause: 'ok', trigger: 'manual' }], createdAt: endedAt - 2e3 });
  }
  fs.writeFileSync(path.join(dir2, 'jobs.json'), JSON.stringify(rows));
  for (const r of rows.slice(-5)) { fs.mkdirSync(path.join(dir2, 'job-logs', r.id), { recursive: true }); fs.writeFileSync(path.join(dir2, 'job-logs', r.id, 'current.log'), 'x'); }
  fs.mkdirSync(path.join(dir2, 'job-logs', rows[0].id), { recursive: true }); fs.writeFileSync(path.join(dir2, 'job-logs', rows[0].id, 'current.log'), 'keep');
  const C = new JobManager({ dataDir: dir2, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
  C.init(); // the boot sweep runs at the real clock — every row is ≥ 30 h old
  const arch = readArchive(dir2);
  ok(arch.length === ARCHIVE_CAP && C.jobs.size === 0, `${N} archived at once ⇒ the file holds exactly ARCHIVE_CAP=${ARCHIVE_CAP}`);
  const kept = new Set(arch.map((r) => r.id));
  ok(rows.slice(0, ARCHIVE_CAP).every((r) => kept.has(r.id)) && rows.slice(ARCHIVE_CAP).every((r) => !kept.has(r.id)), 'the cap keeps the NEWEST records (by terminal instant) and drops the oldest');
  await C.logsSettled();   // lane job-logs-sweep: the cap's removal runs in the remover's worker (never on the main thread) — waited for here
  ok(rows.slice(-5).every((r) => !fs.existsSync(path.join(dir2, 'job-logs', r.id))) && fs.existsSync(path.join(dir2, 'job-logs', rows[0].id)), 'a cap-dropped record loses its log dir; a kept one keeps it');
  ok(arch[0].id === rows[0].id && arch[arch.length - 1].id === rows[ARCHIVE_CAP - 1].id, 'the archive is ordered newest first');
  C.shutdown();
}

// ── §6b the archive copy is DURABLE before a record leaves the store ──
// (verifier 2026-09-16: the sweep deleted every released record from
// this.jobs, THEN wrote the archive behind a catch that only logged, THEN
// flushed jobs.json — one swallowed ENOSPC/EACCES/EROFS deleted 200 records
// while the log said "archived 200". Here the atomic tmp path is obstructed
// by a DIRECTORY ⇒ EISDIR, the same throw class.)
console.log('§6b an archive write that fails releases nothing');
{
  const dir3 = mkDir('jobs-triage-archfail');
  const N = 200;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const endedAt = T0 - 30 * H - i * 60e3; // every row past the 24 h clock
    rows.push({ id: `jb-af${i.toString(16).padStart(4, '0')}`, kind: 'task', name: `af-${i}`, state: 'done', desiredUp: true, owner: {}, access: { view: 'all', control: 'session' }, interaction: { pending: null, answers: [] }, runs: [{ startedAt: endedAt - 1e3, endedAt, exit: 0, cause: 'ok', trigger: 'manual' }], createdAt: endedAt - 2e3 });
  }
  fs.writeFileSync(path.join(dir3, 'jobs.json'), JSON.stringify(rows));
  const tmp = path.join(dir3, 'jobs-archive.json.tmp-' + process.pid);
  fs.mkdirSync(tmp); // writeJsonAtomic's tmp path is a directory ⇒ writeFileSync throws EISDIR
  const logs = [], bcs = [];
  const E = new JobManager({ dataDir: dir3, broadcast: (t, p) => bcs.push({ t, p }), notifyUser: () => { }, log: (...a) => logs.push(a.join(' ')), archivePolicy: () => policy });
  E.init(); // the boot sweep tries at the real clock — and must fail LOUDLY, releasing nothing
  const r = E.archiveSweep({ now: T0 + 400 * D });
  ok(r.archived.length === 0 && r.failed === 'archive-write' && r.kept === N, `the sweep reports the failure (archived 0, failed:'archive-write', kept ${N}) — got ${JSON.stringify(r)}`);
  ok(E.jobs.size === N && readStore(dir3).length === N, `every record is still LIVE in memory and on disk (${E.jobs.size} / ${readStore(dir3).length} of ${N})`);
  ok(readArchive(dir3) === null, 'no archive file was written');
  ok(logs.some((l) => /archive write FAILED/.test(l) && /EISDIR/.test(l)) && !logs.some((l) => /archived \d+ one-shot/.test(l)), 'the log says the write FAILED with the verbatim error and never claims "archived N"');
  ok(!bcs.some((b) => b.t === 'jobs-updated' && b.p && b.p.archived), 'no jobs-updated {archived} broadcast for a sweep that moved nothing');
  // CONTROL (the cheap wrong direction — a sweep that never moves anything):
  // with the obstruction gone the SAME call archives all N on the next tick
  fs.rmdirSync(tmp);
  const r2 = E.archiveSweep({ now: T0 + 400 * D });
  ok(r2.archived.length === N && E.jobs.size === 0 && readStore(dir3).length === 0 && readArchive(dir3).length === N, `…and the next sweep, once the archive is writable, moves all ${N} (a retry, not a loss)`);
  E.shutdown();
  // a store flush that failed AFTER a successful archive write brings the record back at the next boot: the re-archive REPLACES its older copy, never duplicates it
  fs.writeFileSync(path.join(dir3, 'jobs.json'), JSON.stringify([rows[0]]));
  fs.rmSync(path.join(dir3, 'jobs.lock'), { force: true });
  const E2 = new JobManager({ dataDir: dir3, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
  E2.init(); // the boot sweep re-archives rows[0] at the real clock
  const arch = readArchive(dir3);
  ok(E2.jobs.size === 0 && arch.length === N && arch.filter((a) => a.id === rows[0].id).length === 1, `a record re-archived after a failed store flush replaces its archive copy (${arch.length} = ${N}, one copy of ${rows[0].id})`);
  E2.shutdown();
}

// ── §7 the sweep cadence rides the existing tick ──
console.log('§7 cadence + pins');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  ok(/now\(\) - this\._lastArchiveSweep >= ARCHIVE_SWEEP_MS/.test(src) && !/setInterval\([^)]*archiveSweep/.test(src), 'the archive cadence is a clause of _sweep (5 s tick), never a second timer');
  ok(ARCHIVE_SWEEP_MS === 5 * 60 * 1000, 'ARCHIVE_SWEEP_MS = 5 min');
  ok(/archiveSweep\(\{ why: 'boot' \}\)/.test(src), 'the boot sweep runs inside init()');
  const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf-8');
  ok(/req\.query\.archived/.test(ar) && /findVisibleIn\(a\.jm\.archivedList\(\), a\.caller, ref\)/.test(ar), 'agent routes: ?archived=1 list + read-through of an archived ref (view-filtered by the SAME predicate)');
  const cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf-8');
  ok(/flags\.archived \? '\?archived=1'/.test(cli) && /--archived/.test(cli), 'the CLI sends ?archived=1 for list --archived');
  const schema = fs.readFileSync(path.join(ROOT, 'src/lib/settings-schema.js'), 'utf-8');
  ok(/'jobs\.archiveDoneAfterHours': \{[\s\S]*?default: 24/.test(schema) && /'jobs\.archiveFailedAfterDays': \{[\s\S]*?default: 7/.test(schema) && /t\('Background Work'\),\n  t\('Spending'\)/.test(schema), 'the two archive settings exist with the owner defaults and their category is in SETTINGS_CATEGORIES');
}

// ── §8 the CLI's list --archived + poll of an archived id, against a fake API ──
console.log('§8 vibespace-job list --archived / poll <archived id>');
{
  const D2 = new JobManager({ dataDir: dir1, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
  fs.rmSync(path.join(dir1, 'jobs.lock'), { force: true });
  D2.init();
  const rec = D2.archivedList()[0];
  const [port] = await freePorts(1);
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    res.setHeader('Content-Type', 'application/json');
    if (u.pathname === '/api/agent/jobs' && u.searchParams.get('archived')) return res.end(JSON.stringify({ success: true, archived: true, jobs: D2.archivedList().slice(0, 3).map((r) => ({ ...D2.snapshotArchived(r), mine: true, mySubscription: null })) }));
    if (u.pathname === `/api/agent/jobs/${rec.id}`) return res.end(JSON.stringify({ success: true, job: { ...D2.snapshotArchived(rec, { tail: 5 }), mine: true, mySubscription: null } }));
    res.statusCode = 404; res.end(JSON.stringify({ error: 'no' }));
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const env = { ...process.env, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: 'vsst_fixture' };
  const cliPath = path.join(ROOT, 'data/bin/vibespace-job');
  // ASYNC on purpose: the fake API lives in THIS process — a spawnSync would
  // block the loop the child needs an answer from (a self-deadlock, measured)
  const run = (args) => new Promise((resolve) => execFile(process.execPath, [cliPath, ...args], { env, encoding: 'utf-8', timeout: 15000 }, (err, stdout, stderr) => resolve({ status: err ? (err.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
  const out1 = await run(['list', '--archived']);
  ok(out1.status === 0 && out1.stdout.includes(rec.id) && /\(archived/.test(out1.stdout), 'vibespace-job list --archived prints the archived rows marked (archived …)', out1.stdout + out1.stderr);
  const out2 = await run(['poll', rec.id]);
  ok(out2.status === 0 && /\(archived .* — done/.test(out2.stdout) && out2.stdout.includes(`${rec.id} ${rec.name}`), 'vibespace-job poll <archived id> answers (state + the archived marker), never a not-found', out2.stdout + out2.stderr);
  srv.close();
  D2.shutdown();
}

// ── §9 held notifications are TYPED and ride every broadcast (5b ①) ──
console.log('§9 typed held notifications + the held digest on the wire');
{
  const dir3 = mkDir('jobs-triage-held');
  const bc = [];
  const { jm: J, call: callH } = boot(dir3, { broadcasts: bc });
  const cid = 'e2e00000-0000-4000-8000-00000000b001';
  const job = { id: 'jb-held01', kind: 'task', name: 'watcher', state: 'failed', owner: { conversation: { backend: 'claude', id: cid } }, runs: [{ startedAt: T0 - 60e3, endedAt: T0, exit: 1, cause: 'error' }], notifyLog: [] };
  J.jobs.set(job.id, job);
  J.d.notifyGlobal = () => true;
  // the ladder REFUSES on the spend cap — the shape the incident produced
  J.d.deliverToConversation = async () => ({ ok: false, reason: 'spend budget: Member A has spent 12 unattended turns this hour (cap 12)', refused: 'spend', why: 'hour-cap', retryAfter: T0 + 3600e3, identity: { key: 'sub-A', name: 'Member A' }, cap: 12 });
  J._notifyOwner(job, { what: 'failed exit=1 error (1m)' });
  await new Promise((r) => setTimeout(r, 50));
  const q = J.pendingNotifs.get(cid) || [];
  ok(q.length === 1 && q[0].held && q[0].held.kind === 'spend-cap' && q[0].held.why === 'hour-cap' && q[0].held.identity === 'Member A' && q[0].held.cap === 12 && q[0].held.retryAfter === T0 + 3600e3, 'a spend-cap refusal stashes a TYPED entry: spend-cap / hour-cap / the slot / the ceiling', JSON.stringify(q[0] && q[0].held));
  const dg = J.heldDigest();
  ok(dg.total === 1 && dg.byConversation[cid] && dg.byConversation[cid].kinds['spend-cap'] === 1 && dg.byConversation[cid].reason.identity === 'Member A', 'heldDigest reports it per conversation with the typed reason');
  ok(bc.some((m) => m.type === 'jobs-updated' && m.held && m.held.byConversation && m.held.byConversation[cid]), 'the jobs-updated broadcast that followed CARRIES the held digest (one signal, one computation)');
  // the rate floor types rate-floor; an unreachable inbox types not-reachable
  J.d.deliverToConversation = async () => ({ ok: false, reason: 'no live inbox for this conversation on any reachable machine' });
  J._notifyOwner(job, { what: 'failed exit=1 error (2m)' }); // inside the 30 s floor ⇒ rate-floor
  await new Promise((r) => setTimeout(r, 20));
  ok((J.pendingNotifs.get(cid) || []).some((n) => n.held && n.held.kind === 'rate-floor'), 'a floored event is held as rate-floor');
  J._notifyRate.clear();
  J._notifyOwner(job, { what: 'failed exit=1 error (3m)' });
  await new Promise((r) => setTimeout(r, 50));
  ok((J.pendingNotifs.get(cid) || []).some((n) => n.held && n.held.kind === 'not-running'), 'a conversation with no live inbox is held as not-running (lane notify-retry: the old `not-reachable` printed "closed" for a running one)');
  const g3 = await callH('GET', '/api/jobs');
  ok(g3.body.held && g3.body.held.total === 3 && g3.body.held.byConversation[cid].count === 3, 'GET /api/jobs carries the same digest');
  // draining CLEARS the chip: the digest empties on the next broadcast
  bc.length = 0;
  J.drainNotifs(cid);
  ok(J.heldDigest().total === 0 && bc.some((m) => m.type === 'jobs-updated' && m.drained === cid && m.held && m.held.total === 0), 'a drain empties the digest and broadcasts it empty (the chip clears)');
  // an OLD stash entry written by a build before typing reads as not-reachable
  ok(M.heldDigest({ c: [{ jobId: 'x', ts: 1 }] }).byConversation.c.reason.kind === 'not-reachable', 'a legacy stash entry with no `held` reads as not-reachable (never dropped)');
  // wiring pins: the chip + the ladder's typed refusal
  const csb = fs.readFileSync(path.join(ROOT, 'src/lib/chat-status-bar.js'), 'utf-8');
  const cv = fs.readFileSync(path.join(ROOT, 'src/lib/chat-view.js'), 'utf-8');
  const lad = fs.readFileSync(path.join(ROOT, 'src/server/conversation-deliver.js'), 'utf-8');
  ok(/setJobsHeld\(text\)/.test(csb) && /chat-status-held/.test(csb) && /msg\.type === 'jobs-updated' && msg\.held/.test(cv) && /heldText\(digest, \{ t, cid \}\)/.test(cv), 'WIRING PIN: the status bar has the held chip and the live ChatView feeds it from jobs-updated.held for ITS conversation');
  ok(/refused: 'spend', why: v\.why, retryAfter: v\.retryAfter \|\| 0, identity: v\.identity \?/.test(lad), "WIRING PIN: the ladder's spend refusal carries the identity + the ceiling the stash needs");
  J.shutdown();
}

// ── §10 r6 D-F5 ("what you approve is what runs"): a job's panel identity only grows — a stale click never answers the next panel ──
console.log('§10 r6 D-F5: monotonic panel identity, the answer names its panel, a restart keeps the count');
{
  const dir4 = mkDir('jobs-triage-panel');
  const bc4 = [];
  const { jm: J, call: callP } = boot(dir4, { broadcasts: bc4 });
  const mkJob = (id) => ({ id, kind: 'task', name: 'deploy-' + id.slice(-2), note: '', state: 'up', desiredUp: true, owner: {}, access: { view: 'all', control: 'session' }, interaction: { pending: null, answers: [] }, runs: [{ startedAt: T0 - 60e3, trigger: 'manual' }], createdAt: T0 - 60e3 });
  const panel = (title) => ({ title, blocks: [{ type: 'buttons', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] }], timeoutS: 1 });
  // the probe's sequence on the REAL engine: ask #1, let it EXPIRE (the engine's own sweep), ask #2, a stale click on #1
  const staleLeg = async (JM, job) => {
    JM.jobs.set(job.id, job);
    const a1 = JM.ask(job, panel('Run the unit tests?'));
    job.interaction.pending.postedAt = Date.now() - 5000; // past its 1 s timeout
    await JM._sweep();
    const expired = !job.interaction.pending && job.interaction.answers.some((x) => x.expired);
    const a2 = JM.ask(job, panel('Delete the production backup bucket?'));
    const stale = JM.answerPanel(job, { button: 'yes', version: a1.version });
    return { a1: a1.version, a2: a2.version, expired, stale, pendingTitle: job.interaction.pending && job.interaction.pending.panel.title, recorded: job.interaction.answers.filter((x) => !x.expired).map((x) => x.button + '@' + x.version) };
  };
  const job1 = mkJob('jb-panel0001');
  const r1 = await staleLeg(J, job1);
  ok(r1.expired && r1.a1 === 1 && r1.a2 === 2 && r1.stale.code === 'stale-panel' && /panel #1/.test(r1.stale.error) && /panel #2/.test(r1.stale.error) && r1.pendingTitle === 'Delete the production backup bucket?' && r1.recorded.length === 0, 'r6 D-F5: after panel #1 EXPIRED the next panel is #2 (never 1 again); a stale click on #1 is refused stale-panel BY NAME — nothing recorded, panel #2 still waits', JSON.stringify(r1));
  // the user route: named refusals with their codes
  const rNo = await callP('POST', '/api/jobs/:id/:act', { params: { id: job1.id, act: 'answer' }, body: { answers: { button: 'yes' } } });
  const rStale = await callP('POST', '/api/jobs/:id/:act', { params: { id: job1.id, act: 'answer' }, body: { answers: { button: 'yes', version: 1 } } });
  ok(rNo.status === 400 && rNo.body.code === 'version-required' && rStale.status === 409 && rStale.body.code === 'stale-panel' && rStale.body.version === 2 && job1.interaction.pending, 'r6 D-F5: POST …/answer with NO version ⇒ 400 version-required; with panel #1\'s ⇒ 409 stale-panel (+ the panel it waits on) — panel #2 still pending', JSON.stringify({ rNo: rNo.body, rStale: rStale.body }));
  const rOk = await callP('POST', '/api/jobs/:id/:act', { params: { id: job1.id, act: 'answer' }, body: { answers: { button: 'no', version: 2 } } });
  ok(rOk.status === 200 && !job1.interaction.pending && job1.interaction.answers.at(-1).button === 'no' && job1.interaction.answers.at(-1).version === 2, 'r6 D-F5: the answer naming panel #2 is recorded as #2\'s', JSON.stringify(rOk.body));
  const a3 = J.ask(job1, panel('Rotate the keys?'));
  ok(a3.version === 3 && job1.interaction.seq === 3, 'r6 D-F5: after an ANSWER the next panel is #3 (the identity only grows)');
  ok(bc4.length > 0 && M.nextInteractionSeq({ pending: null, answers: [{ version: 7 }, { expired: true, version: 4 }] }) === 8 && M.nextInteractionSeq({ seq: 9, pending: { version: 3 }, answers: [] }) === 10 && M.nextInteractionSeq(null) === 1, 'r6 D-F5 PURE nextInteractionSeq: the persisted seq, else the highest version still remembered (a record from before the seq), + 1');
  // a RESTART keeps the count (the seq rides the store)
  J._dirty = true; J.shutdown();
  const { jm: J2 } = boot(dir4);
  const j2 = J2.jobs.get(job1.id);
  const a4 = j2 ? J2.ask(j2, panel('After the restart')) : null;
  ok(j2 && j2.interaction.seq >= 3 && a4 && a4.version === 4, 'r6 D-F5: after a RESTART the next panel is #4 — the count survived in the store', JSON.stringify({ seq: j2 && j2.interaction.seq, a4 }));
  J2.shutdown();
  // CONTROL (scripts/mutant-copy.mjs): the pre-fix engine — version = pending + 1 (1 again after an expiry) and an answer
  // with a matching (or missing) version accepted ⇒ the stale click on #1 is recorded as the answer to #2
  const MJ = mutantCopies('jobs-panel-r6', ROOT);
  const jsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  const seqLines = "    const version = M.nextInteractionSeq(job.interaction);\n    job.interaction.seq = version;\n";
  const gateLines = "    const vv = M.answerVersionVerdict(p, answers);\n    if (!vv.ok) return { error: vv.error, code: vv.code, ...(p ? { version: p.version } : {}) };\n";
  ok(jsrc.split(seqLines).length === 2 && jsrc.split(gateLines).length === 2, 'r6 D-F5 control setup: the seq and the answer\'s verdict are each wired once');
  const JMod = MJ.load('src/jobs.js', jsrc.replace(seqLines, "    const version = ((job.interaction && job.interaction.pending && job.interaction.pending.version) || 0) + 1; // MUTANT: pre-fix\n").replace(gateLines, "    if (!p) return { error: 'no pending panel' };\n    if (answers.version && answers.version !== p.version) return { error: 'stale panel version — reopen the panel' }; // MUTANT: pre-fix\n"), 'pre-fix');
  const dir5 = mkDir('jobs-triage-panel-mut');
  const JX = new JMod.JobManager({ dataDir: dir5, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
  JX.init();
  const rx = await staleLeg(JX, mkJob('jb-panel0002'));
  const noVer = (() => { const j = mkJob('jb-panel0003'); JX.jobs.set(j.id, j); JX.ask(j, panel('x')); return JX.answerPanel(j, { button: 'yes' }); })();
  ok(rx.a1 === 1 && rx.a2 === 1 && rx.stale.ok === true && rx.recorded.join() === 'yes@1' && noVer.ok === true, 'r6 D-F5 CONTROL (the pre-fix engine, in a copy): panel #2 is "version 1" again, the stale click on #1 is RECORDED as the answer to "Delete the production backup bucket?", and a version-less answer is accepted — the monotonic seq + the named refusal are the rule', JSON.stringify({ rx, noVer }));
  JX.shutdown();
  for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'r6 D-F5 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  // WIRING PINS: the panel sends the version it rendered; the CLI prints the panel's number
  const jp = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf-8'), cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf-8');
  ok(/const version = pending\.version;/.test(jp) && /answers: \{ \.\.\.values, button: o\.id, version \}/.test(jp) && /r2\.code === 'stale-panel'/.test(jp) && /posted\.version/.test(cli), 'WIRING PIN (r6 D-F5): the panel answers with the version it rendered (and re-reads on stale-panel); the CLI prints the panel\'s number');
}

console.log('§11 B-dfb4: notifications dropped at the 30-entry stash cap are SAID in For you (≤ 1 notice per conversation per hour)');
{
  const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
  const dir = mkDir('jobs-triage-drop');
  const todos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
  const logs = [];
  const { app } = fakeApp();
  const sessions = new Map([['w1', { claudeSessionId: 'conv-drop', name: 'house model', mode: 'chat' }]]);
  const W = wiring.create({
    app, dataDir: dir, broadcastAll: () => { }, userTodos: todos, log: (...a) => logs.push(a.join(' ')),
    serverSetting: () => undefined, taskGroups: null, activeSessions: sessions, deliver: { peerReachable: () => false, deliverToConversation: async () => ({ ok: false, reason: 'no lane' }) },
  });
  W.initAfterListen();
  const jm = W.jm;
  const job = (i) => ({ id: 'j-drop-' + (i % 3), name: ['nightly', 'scrape', 'build'][i % 3], state: 'done', notifyLog: [] });
  for (let i = 0; i < 30; i++) jm._stashNotif('conv-drop', job(i), { what: 'result ' + i }, 'not reachable');
  const items = () => todos.forSession(['claude:conv-drop']).filter((i) => i.origin === 'jobs');
  ok(items().length === 0, 'thirty waiting (the cap) ⇒ nothing dropped, nothing said');
  jm._stashNotif('conv-drop', job(30), { what: 'result 30' }, 'not reachable');
  jm._stashNotif('conv-drop', job(31), { what: 'result 31' }, 'not reachable');
  const it = items();
  ok(it.length === 1 && it[0].kind === 'notice' && it[0].origin === 'jobs' && it[0].sessionKey === 'claude:conv-drop' && /were dropped — 30 were already waiting/.test(it[0].text) && /^1 dropped, never delivered \(from: nightly\)/.test(it[0].detail || '') && it[0].sessionName === 'house model · Background Work',
    'the first eviction files ONE For-you notice (origin jobs, kind notice) under the owner conversation: how many, from which jobs, that the 30 still wait', it.map((i) => ({ text: i.text, detail: i.detail, kind: i.kind, sessionName: i.sessionName })));
  ok(it[0].i18n && /\{cap\} were already waiting/.test(it[0].i18n.text.key) && it[0].i18n.text.params.cap === 30, '…worded per device (i18n key + params)', it[0].i18n);
  ok(logs.filter((l) => /fell off the 30-entry cap/.test(l)).length === 2, 'every eviction is still journaled (two lines)', logs.filter((l) => /fell off/.test(l)));
  ok(items().length === 1 && todos.forSession(['claude:conv-drop']).length === 1, 'the second eviction inside the hour adds NO line (≤ 1 per conversation per hour)');
  jm._dropNoticeAt.set('conv-drop', Date.now() - 3600e3 - 1);   // an hour later
  todos.get(it[0].id).createdAt -= 3600e3 + 1;   // …for the store's filing time too (verify r1: the window survives a restart through it)
  todos.setStatus?.(it[0].id, 'done');
  jm._stashNotif('conv-drop', job(32), { what: 'result 32' }, 'not reachable');
  const after = todos.forSession(['claude:conv-drop']).filter((i) => i.origin === 'jobs' && i.status === 'open');
  ok(after.length === 1, 'an hour later the next eviction says it again (the notice is back in For you)', after);
  for (let i = 0; i < 31; i++) jm._stashNotif('conv-other', job(i), { what: 'x' + i }, 'not reachable');
  ok(todos.forSession(['claude:conv-other']).filter((i) => i.origin === 'jobs').length === 1, '…and the window is PER conversation (another conversation\'s first eviction is said at once)');
  W.shutdown?.();
  todos.stop();

  // verify r1 — THE HOUR SURVIVES A RESTART: the engine's window is in memory; a restart inside the hour reopened the
  // notice the user had dismissed (said twice in ten minutes). The store's own filing time is the memory now.
  {
    const dir2 = mkDir('jobs-triage-drop-restart');
    const boot = () => { const t = new UserTodoManager({ dataDir: dir2, expirySweepMs: 0 }); const lg = []; const w = wiring.create({ app: fakeApp().app, dataDir: dir2, broadcastAll: () => { }, userTodos: t, log: (...a) => lg.push(a.join(' ')), serverSetting: () => undefined, taskGroups: null, activeSessions: sessions, deliver: { peerReachable: () => false, deliverToConversation: async () => ({ ok: false, reason: 'no lane' }) } }); w.initAfterListen(); return { t, w, lg }; };
    const mine = (t, key) => { const s = t.snapshot(); return [...s.open, ...s.resolved].filter((i) => i.sessionKey === key && i.origin === 'jobs'); };
    const r1 = boot();
    for (let i = 0; i < 31; i++) r1.w.jm._stashNotif('conv-drop', job(i), { what: 'r' + i }, 'not reachable');
    const n1 = mine(r1.t, 'claude:conv-drop');
    r1.t.setStatus(n1[0].id, 'dismissed');
    r1.w.shutdown?.(); r1.t.stop();
    const r2 = boot();   // the restart, minutes later
    r2.w.jm._stashNotif('conv-drop', job(40), { what: 'r40' }, 'not reachable');
    const n2 = mine(r2.t, 'claude:conv-drop');
    ok(n1.length === 1 && n2.length === 1 && n2[0].status === 'dismissed' && r2.lg.some((l) => /fell off the 30-entry cap/.test(l)),
      'verify r1: a RESTART inside the hour does not say it again — the dismissed notice stays dismissed (was: reopened), the eviction is journaled', n2.map((i) => i.status));
    // a filing the store REFUSES (its 20-open cap) consumes no window: once the user clears their asks, the next eviction is said
    for (let i = 0; i < 20; i++) r2.t.add('claude:conv-cap', { text: 'ask ' + i, origin: 'agent' });
    for (let i = 0; i < 31; i++) r2.w.jm._stashNotif('conv-cap', job(i), { what: 'c' + i }, 'not reachable');
    const refused = r2.lg.filter((l) => /conv-cap: the dropped-notification notice was not filed/.test(l)).length;
    for (const x of r2.t.forSession(['claude:conv-cap'])) r2.t.setStatus(x.id, 'done');
    r2.w.jm._stashNotif('conv-cap', job(50), { what: 'c50' }, 'not reachable');
    ok(refused === 1 && r2.t.forSession(['claude:conv-cap']).filter((i) => i.origin === 'jobs').length === 1,
      'verify r1: a filing refused at the store\'s 20-open cap (journaled) leaves the hour unspent — the next eviction is said (was: unsaid for the rest of the hour)', { refused });
    r2.w.shutdown?.(); r2.t.stop();
  }
}

// ── §12 B-ef97: a torn jobs.json's recovered skeletons are WRITTEN BACK — they survive the next restart ──
console.log('§12 B-ef97: the torn store\'s skeletons are on disk, and a restart keeps them');
{
  const LSm = require(path.join(ROOT, 'src/job-logs-sweep.js'));
  const seedTorn = (d) => {
    fs.writeFileSync(path.join(d, 'jobs.json'), '[{"id":"jb-5ke1e701","kind":"task","state":"done","runs":[{"startedAt":1');   // torn mid-record
    fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify([{ id: 'jb-5ke1e7a2', kind: 'task', name: 'archived one', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: T0 - 3 * D, endedAt: T0 - 3 * D + 1 }], archivedAt: T0 - 2 * D, archivedWhy: 'done' }]));
    for (const id of ['jb-5ke1e701', 'jb-5ke1e703', 'jb-5ke1e7a2']) fs.mkdirSync(path.join(d, 'job-logs', id, String(T0 - D)), { recursive: true });
    fs.writeFileSync(path.join(d, 'job-notifications.json'), TORN_NOTIFS);   // a notifications file that does not load either
  };
  const TORN_NOTIFS = '{"conv-5ke1e7":[{"jobId":"jb-5ke1e701","text":"x"';
  const skel = (jm) => [...jm.jobs.values()].filter((j) => LSm.isSkeleton(j)).map((j) => j.id).sort().join();
  const onDisk = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'jobs.json'), 'utf-8')).filter((j) => LSm.isSkeleton(j)).map((j) => j.id).sort().join(); } catch (e) { return 'unreadable: ' + e.code; } };
  const asideOf = (d) => fs.readdirSync(d).filter((n) => /^jobs\.json\.corrupt-\d+$/.test(n));
  const d12 = mkDir('jobs-triage-torn');
  seedTorn(d12);
  const { jm: A } = boot(d12);
  const at1 = onDisk(d12);
  ok(skel(A) === 'jb-5ke1e701,jb-5ke1e703' && asideOf(d12).length === 1 && fs.readFileSync(path.join(d12, asideOf(d12)[0]), 'utf-8').startsWith('[{"id":"jb-5ke1e701"'), 'B-ef97: a torn store is set aside (its bytes kept) and rebuilt as skeletons from the log dirs — never one for an id the archive holds', skel(A));
  ok(at1 === 'jb-5ke1e701,jb-5ke1e703', 'B-ef97: the skeletons are ON DISK when init returns (was: memory only)', at1);
  A.shutdown();
  ok(fs.readFileSync(path.join(d12, 'job-notifications.json'), 'utf-8') === TORN_NOTIFS, 'B-ef97: the write-back writes jobs.json ALONE — a notifications file that did not load is not written over by it (nor by the exit)');
  const { jm: B } = boot(d12);
  ok(skel(B) === 'jb-5ke1e701,jb-5ke1e703' && B.jobs.get('jb-5ke1e701').note === LSm.RECOVERED_NOTE, 'B-ef97: AFTER A RESTART the recovered skeletons are still listed (was: the store loaded empty, the jobs vanished)', skel(B));
  // B-2204: a skeleton is the person's alone — owner-less, view 'session': no conversation lists it, the person does
  const sk = B.jobs.get('jb-5ke1e701'), agent = { conversationId: 'conv-any', sessionId: 'sess-any', sessionCreatedAt: 1, groups: new Set(['g-any']) };
  ok(sk.access.view === 'session' && sk.access.control === 'session' && Object.keys(sk.owner).length === 0 && !M.canView(sk, agent) && M.canView(sk, { isUser: true }) && !M.visibleJobs([...B.jobs.values()], agent).some((j) => LSm.isSkeleton(j)), 'B-2204: a recovered skeleton is owner-less with view \'session\' — no conversation can view it (was \'all\': every one), the person can', sk.access);
  B.shutdown();
  // B-2204: a skeleton the RELEASE wrote (view 'all' — its _save wrote memory whenever anything dirtied the store) is read back the person's alone
  const d12m = mkDir('jobs-triage-skel-migrate');
  const oldSkel = (id) => ({ id, kind: 'task', name: id, state: 'unverified', note: LSm.RECOVERED_NOTE, owner: {}, access: { view: 'all', control: 'session' }, runs: [] });
  fs.writeFileSync(path.join(d12m, 'jobs.json'), JSON.stringify([oldSkel('jb-5ke1e7m1')]));
  fs.writeFileSync(path.join(d12m, 'jobs-archive.json'), JSON.stringify([{ ...oldSkel('jb-5ke1e7m2'), archivedAt: T0 - D, archivedWhy: 'unverified-acknowledged' }]));
  const { jm: Mg } = boot(d12m);
  const mArch = Mg._loadArchive().find((r) => r.id === 'jb-5ke1e7m2');
  ok(Mg.jobs.get('jb-5ke1e7m1').access.view === 'session' && mArch && mArch.access.view === 'session' && !M.canView(Mg.jobs.get('jb-5ke1e7m1'), agent) && !M.canView(mArch, agent), 'B-2204: a skeleton the release wrote with view \'all\' (store and archive) is read back owner-less, view \'session\'');
  Mg.shutdown();
  // B-ef97: the ARCHIVE unread at the torn boot — a skeleton then stands for an archived id too; when the archive answers it goes
  const d12r = mkDir('jobs-triage-skel-archive-late'), AFr = path.join(d12r, 'jobs-archive.json');
  seedTorn(d12r);
  const archBytes = fs.readFileSync(AFr, 'utf-8');
  const rf12 = fs.readFileSync;
  fs.readFileSync = function (f, ...a) { if (String(f) === AFr) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf12.call(this, f, ...a); };
  let R12; try { R12 = new JobManager({ dataDir: d12r, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, unreadRetry: { firstMs: 5, maxMs: 10 } }); R12.init(); } finally { fs.readFileSync = rf12; }
  const atBootR = skel(R12);
  const t12 = Date.now(); while (R12._unread.archive && Date.now() - t12 < 3000) await new Promise((r) => setTimeout(r, 10));
  ok(atBootR === 'jb-5ke1e701,jb-5ke1e703,jb-5ke1e7a2' && !R12._unread.archive && skel(R12) === 'jb-5ke1e701,jb-5ke1e703' && fs.readFileSync(AFr, 'utf-8') === archBytes, 'B-ef97: a skeleton built while the archive could not answer (one for an archived id) is DROPPED when the archive answers — the archived record stays', { atBootR, now: skel(R12) });
  if (R12._logsNoteP) await R12._logsNoteP;
  R12.shutdown();
  // B-ef97: …and a skeleton never moves OVER the archived record of its id (the sweep's replace-by-id), however it got into the store
  const d12s = mkDir('jobs-triage-skel-sweep');
  fs.writeFileSync(path.join(d12s, 'jobs-archive.json'), JSON.stringify([{ id: 'jb-5ke1e7s1', kind: 'task', name: 'the real one', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: T0 - 9 * D, endedAt: T0 - 9 * D + 1 }], archivedAt: T0 - 8 * D, archivedWhy: 'done' }]));
  const { jm: Sw } = boot(d12s);
  Sw.jobs.set('jb-5ke1e7s1', { ...oldSkel('jb-5ke1e7s1'), access: { view: 'session', control: 'session' }, ack: { by: 'user-opened', at: T0 - 10 * D } });
  const swr = Sw.archiveSweep({ now: T0 });
  const realOne = Sw._loadArchive().find((r) => r.id === 'jb-5ke1e7s1');
  ok(!swr.archived.length && realOne && realOne.name === 'the real one' && !Sw.jobs.has('jb-5ke1e7s1'), 'B-ef97: an acknowledged skeleton whose id the archive holds leaves the store — it never replaces the archived record', { swr, name: realOne && realOne.name });
  Sw.shutdown();
  // CONTROL (scripts/mutant-copy.mjs): the release's engine — the skeletons never marked for a write ⇒ the restart loads an empty store
  const MJ = mutantCopies('jobs-torn-ef97', ROOT);
  const jsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  const owedLine = '    if (bad && this.jobs.size) this._skeletonsOwed = true;\n';
  ok(jsrc.split(owedLine).length === 2, 'B-ef97 control setup: the write-back is marked on one line');
  const viewLine = "access: { view: 'session', control: 'session' }, runs: [] });\n";
  ok(jsrc.split(viewLine).length === 2, 'B-2204 control setup: the skeleton\'s access is written on one line');
  const accLine = "const skeletonAccess = (j) => { if (LS.isSkeleton(j)) { j.owner = {}; j.access = { view: 'session', control: 'session' }; } return j; };\n";
  const dropLine = "      if (this.jobs.size) { const held = new Set(this.archive.map((r) => r.id)); for (const [id, j] of this.jobs) if (LS.isSkeleton(j) && held.has(id)) { this.jobs.delete(id); dropped++; } }\n";
  const guardLine = "      if (LS.isSkeleton(moved[i]) && archIds.has(id)) { this.jobs.delete(id); this._dirty = true; moved.splice(i, 1); }\n      else if (!this.jobs.has(id)) moved.splice(i, 1);\n";
  ok([accLine, dropLine, guardLine].every((x) => jsrc.split(x).length === 2), 'B-ef97 / B-2204 control setup: the read-back access, the archive\'s drop and the sweep\'s guard are each written once');
  const JMod = MJ.load('src/jobs.js', jsrc.replace(owedLine, '    // MUTANT: the release — skeletons in memory only\n').replace(viewLine, "access: { view: 'all', control: 'session' }, runs: [] }); // MUTANT: the release\n")
    .replace(accLine, 'const skeletonAccess = (j) => j; // MUTANT: no read-back\n').replace(dropLine, '      // MUTANT: no drop\n').replace(guardLine, '      if (!this.jobs.has(id)) moved.splice(i, 1); // MUTANT: no guard\n'));
  const d12c = mkDir('jobs-triage-torn-mut');
  seedTorn(d12c);
  const mk = () => { const J = new JMod.JobManager({ dataDir: d12c, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy }); J.init(); return J; };
  const X1 = mk(); const x1 = skel(X1); const xv = X1.jobs.get('jb-5ke1e701'); const xSeen = !!xv && M.canView(xv, { conversationId: 'conv-any', sessionId: 'sess-any', sessionCreatedAt: 1, groups: new Set() }); X1.shutdown();
  const X2 = mk(); const x2 = skel(X2); X2.shutdown();
  ok(x1 === 'jb-5ke1e701,jb-5ke1e703' && x2 === '', 'B-ef97 CONTROL (the release, in a copy): the skeletons of boot 1 are GONE after a restart', { x1, x2 });
  ok(xSeen, 'B-2204 CONTROL (the release, in a copy): any conversation can view a recovered skeleton (view \'all\')');
  const dXm = mkDir('jobs-triage-skel-migrate-mut');
  fs.writeFileSync(path.join(dXm, 'jobs.json'), JSON.stringify([oldSkel('jb-5ke1e7m1')]));
  const XM = new JMod.JobManager({ dataDir: dXm, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy }); XM.init();
  ok(XM.jobs.get('jb-5ke1e7m1').access.view === 'all', 'B-2204 CONTROL (no read-back, in a copy): a skeleton the release wrote stays view \'all\'');
  XM.shutdown();
  const dXs = mkDir('jobs-triage-skel-sweep-mut');
  fs.writeFileSync(path.join(dXs, 'jobs-archive.json'), JSON.stringify([{ id: 'jb-5ke1e7s1', kind: 'task', name: 'the real one', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: T0 - 9 * D, endedAt: T0 - 9 * D + 1 }], archivedAt: T0 - 8 * D, archivedWhy: 'done' }]));
  const XS = new JMod.JobManager({ dataDir: dXs, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy }); XS.init();
  XS.jobs.set('jb-5ke1e7s1', { ...oldSkel('jb-5ke1e7s1'), ack: { by: 'user-opened', at: T0 - 10 * D } });
  XS.archiveSweep({ now: T0 });
  const xReal = XS._loadArchive().find((r) => r.id === 'jb-5ke1e7s1');
  ok(xReal && xReal.name === 'jb-5ke1e7s1', 'B-ef97 CONTROL (no guard, in a copy): the acknowledged skeleton is archived OVER the real record (its name is gone)', xReal && xReal.name);
  XS.shutdown();
  const dXr = mkDir('jobs-triage-skel-archive-late-mut'), AFx = path.join(dXr, 'jobs-archive.json');
  seedTorn(dXr);
  fs.readFileSync = function (f, ...a) { if (String(f) === AFx) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf12.call(this, f, ...a); };
  let XR; try { XR = new JMod.JobManager({ dataDir: dXr, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, unreadRetry: { firstMs: 5, maxMs: 10 } }); XR.init(); } finally { fs.readFileSync = rf12; }
  const tx = Date.now(); while (XR._unread.archive && Date.now() - tx < 3000) await new Promise((r) => setTimeout(r, 10));
  ok(!XR._unread.archive && skel(XR).includes('jb-5ke1e7a2'), 'B-ef97 CONTROL (no drop, in a copy): the skeleton of the archived id stays after the archive answers', skel(XR));
  if (XR._logsNoteP) await XR._logsNoteP;
  XR.shutdown();
  for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'B-ef97 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

// ── §13 B-c17d: the 14-day gc never collects a cron's child while its parent still schedules fires ──
console.log('§13 B-c17d: a monthly cron keeps its child (its run ring) between two fires');
{
  const acc = { view: 'session', control: 'session' };
  const ended = T0 - 20 * D;   // past the gc's 14 days, before the next monthly fire
  const parent = (id, extra = {}) => ({ id, kind: 'cron', name: 'monthly ' + id.slice(-2), state: 'scheduled', desiredUp: true, schedule: { everyMs: 30 * D }, nextFireAt: T0 + 10 * D, owner: {}, access: acc, runs: [], createdAt: T0 - 50 * D, ...extra });
  const child = (id, cronParent) => ({ id, kind: 'task', name: 'monthly run', state: 'done', cronParent, owner: {}, access: acc, runs: [{ startedAt: ended, endedAt: ended + 1000, exit: 0 }], createdAt: T0 - 50 * D });
  const seed = (d) => fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify([
    parent('jb-c17d0p01'), child('jb-c17d0c01', 'jb-c17d0p01'),                          // a live monthly cron and its child
    parent('jb-c17d0p02', { desiredUp: false, state: 'down' }), child('jb-c17d0c02', 'jb-c17d0p02'),   // a cron turned off: its child ages as before
    { id: 'jb-c17d0t03', kind: 'task', name: 'one-shot', state: 'done', owner: {}, access: acc, runs: [{ startedAt: ended, endedAt: ended + 1000, exit: 0 }], createdAt: ended },   // a plain task: collected as before
    parent('jb-c17d0p04', { state: 'done', schedule: { at: T0 - 30 * D }, nextFireAt: null }), child('jb-c17d0c04', 'jb-c17d0p04'),   // an --at cron after its one fire (state 'done', desiredUp still true)
  ]));
  const keep = policy.doneAfterHours; policy.doneAfterHours = 0;   // «never archive»: the records reach the gc (an active cron's child always does — the archive keeps it)
  try {
    const d13 = mkDir('jobs-triage-cron-gc'); seed(d13);
    const { jm: G } = boot(d13);
    const atBoot = ['jb-c17d0c01', 'jb-c17d0c02', 'jb-c17d0t03'].every((id) => G.jobs.has(id));
    await G._gc({ now: T0 });
    ok(atBoot && G.jobs.has('jb-c17d0c01') && G.jobs.get('jb-c17d0c01').runs.length === 1, 'B-c17d: the gc KEEPS a monthly cron\'s child whose last run ended 20 days ago — its parent still schedules fires (was: deleted with its run list and journal)');
    ok(!G.jobs.has('jb-c17d0c02') && !G.jobs.has('jb-c17d0t03') && !G.jobs.has('jb-c17d0c04'), 'B-c17d: …and still collects a child whose cron is turned off, the child of a FIRED --at cron (it schedules nothing more) and a plain done task past 14 days');
    G.shutdown();
    // CONTROL (scripts/mutant-copy.mjs): the release's gc — leg (a) never asks the parent
    const MJ = mutantCopies('jobs-cron-gc-c17d', ROOT);
    const jsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
    const guard = '        if (this._cronParentActive(job)) continue;\n';
    ok(jsrc.split(guard).length === 2, 'B-c17d control setup: the gc asks the parent on one line');
    const JMod = MJ.load('src/jobs.js', jsrc.replace(guard, '        // MUTANT: the release — the gc never asks the parent\n'));
    const d13c = mkDir('jobs-triage-cron-gc-mut'); seed(d13c);
    const X = new JMod.JobManager({ dataDir: d13c, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy });
    X.init(); await X._gc({ now: T0 });
    ok(!X.jobs.has('jb-c17d0c01'), 'B-c17d CONTROL (the release, in a copy): the gc deletes the live monthly cron\'s child between two fires');
    X.shutdown();
    const atLine = "    return !!p && p.desiredUp !== false && p.state !== 'missed' && p.state !== 'done';\n";
    ok(jsrc.split(atLine).length === 2, 'B-c17d control setup: a fired --at cron is not active, on one line');
    const JAt = MJ.load('src/jobs.js', jsrc.replace(atLine, "    return !!p && p.desiredUp !== false && p.state !== 'missed'; // MUTANT: a fired --at counts as active\n"), 'at');
    const d13a = mkDir('jobs-triage-cron-gc-at-mut'); seed(d13a);
    const XA = new JAt.JobManager({ dataDir: d13a, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy });
    XA.init(); await XA._gc({ now: T0 });
    ok(XA.jobs.has('jb-c17d0c04'), 'B-c17d CONTROL (a fired --at counted active, in a copy): its child is kept FOR EVER — neither archived nor collected');
    XA.shutdown();
    for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 2, label: 'B-c17d ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  } finally { policy.doneAfterHours = keep; }
}

// ── §14 B-f276: a read that FAILED is no answer — never set aside, never written over, read again ──
console.log('§14 B-f276: an unreadable store is kept as it is, written by nothing, and read again');
{
  const acc = { view: 'session', control: 'session' };
  const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return !!fn(); };
  const asides = (d, base) => fs.readdirSync(d).filter((n) => n.startsWith(base + '.corrupt-') && n !== base + '.corrupt-unread');
  const rec = (id, extra = {}) => ({ id, kind: 'task', name: 'kept ' + id.slice(-2), state: 'done', owner: {}, access: acc, runs: [{ startedAt: T0 - 3 * D, endedAt: T0 - 3 * D + 1000, exit: 0 }], createdAt: T0 - 3 * D, ...extra });
  let itemSeq = 0; const resolved = [], filed = [];
  const engine = (Mod, d, logs, extra = {}) => { const J = new Mod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: (n) => { filed.push(n); return { ok: true, id: 'it-f276-' + (++itemSeq) }; }, resolveNotice: (id) => resolved.push(id), log: (...a) => logs.push(a.join(' ')), archivePolicy: () => policy, unreadRetry: { firstMs: 5, maxMs: 10 }, ...extra }); J.init(); return J; };
  // cure r1: a FAULT ROOT MEETS TOO — a folder where the file should be (EISDIR); mode 000 (EACCES) where it refuses (not root)
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const plant = (F, body, how) => { if (how === 'mode') { fs.writeFileSync(F, body); fs.chmodSync(F, 0o000); } else { fs.mkdirSync(F); } };
  const unplant = (F, body, how) => { if (how === 'mode') fs.chmodSync(F, 0o644); else { fs.rmdirSync(F); fs.writeFileSync(F, body); } };
  const spec = { kind: 'task', name: 'new one', cmd: { argv: ['true'] } };
  // A. THE STORE: EACCES (a real mode: its stat answers, its read does not); under root, where mode 000 refuses nothing, a folder (EISDIR)
  const howA = asRoot ? 'folder' : 'mode', codeA = asRoot ? 'EISDIR' : 'EACCES';
  const dA = mkDir('jobs-triage-unread-store'), SF = path.join(dA, 'jobs.json');
  const body = JSON.stringify([rec('jb-f2760a01'), rec('jb-f2760a02', { kind: 'cron', state: 'scheduled', desiredUp: true, schedule: { everyMs: 30 * D }, nextFireAt: T0 + 10 * D, runs: [] })]);
  {
  plant(SF, body, howA);
  let readable = true; try { fs.readFileSync(SF); } catch (e) { readable = e.code !== codeA; }
  const lA = [];
  const A = engine({ JobManager }, dA, lA);
  const mt = fs.statSync(SF).mtimeMs;
  const made = A.create(spec, { isUser: true });
  A._dirty = true; A._save();
  ok(!readable && A.ready && A._unread.store && A._unread.store.code === codeA && A.jobs.size === 0 && asides(dA, 'jobs.json').length === 0 && fs.statSync(SF).mtimeMs === mt, 'B-f276: a store whose READ fails (EACCES, its stat answers) is kept as it is — NOT set aside (the release renamed the live file), and a save writes nothing over it', { unread: A._unread.store, asides: asides(dA, 'jobs.json') });
  ok(made.code === 'records-unread' && new RegExp(`no job is created until they are read — jobs\\.json in VibeSpace's data folder could not be read \\(${codeA}\\).*For you says what to check`).test(made.error) && !made.job, `B-f276: …and no job is created while the records are unread — the refusal NAMES ITS DOOR (the file, For you) [${codeA}]`, made);
  await until(() => A._unreadTries.store >= 3);   // three reads again, each failed
  if (A._logsNoteP) await A._logsNoteP;   // the clean-up's note, written by the remover's child
  const noteA = path.join(dA, 'jobs.json.corrupt-unread'), noteThere = fs.existsSync(noteA);
  ok(A._unreadTries.store >= 3 && A._logsUnread.store === codeA && lA.filter((l) => new RegExp(`jobs\\.json could not be read \\(${codeA}: the read failed\\) — kept as it is, never set aside`).test(l)).length === 1, 'B-f276: …the job-logs clean-up holds (its unread fact) and it is said ONCE — after three failed reads again too', { tries: A._unreadTries.store });
  unplant(SF, body, howA);   // the storage answers again
  const back = await until(() => !A._unread.store && A.jobs.has('jb-f2760a01') && A.jobs.has('jb-f2760a02'));
  const made2 = back ? A.create(spec, { isUser: true }) : null;
  ok(back && made2 && made2.job && lA.some((l) => /jobs\.json read again after \d+ tr(y|ies): 2 record\(s\) — writes resume/.test(l)), 'B-f276: the store is READ AGAIN off the loop: its records are loaded, writes resume, a job can be created', { back, made2: made2 && (made2.error || 'ok') });
  // cure r1, the ruling: a read that ANSWERED and LOADED lifts what the failure filed — its note marked done, its item resolved
  const lifted = await until(() => !fs.existsSync(noteA) && fs.readdirSync(dA).some((n) => /^jobs\.json\.unread-done-\d+$/.test(n)));
  const told = filed.find((n) => n && n.fact === 'records-read-again');
  ok(!!told && told.urgency === 'low' && /could not be read from \{when\} to \{until\} \(\{error\}\); VibeSpace read them again and nothing was lost/.test(told.words.key) && Number.isFinite(told.words.params.when.at) && Number.isFinite(told.words.params.until.at) && told.words.params.until.at >= told.words.params.when.at && !/written over: keep the note/.test(told.words.key), 'B-f276 cure r2 (the ruling): the person who was told hears ONE TRUE SENTENCE — could not be read from … to …, read again, nothing lost (never «may already have been written over»)', told && told.words);
  ok(noteThere && lifted && A._logsUnread.store === null && resolved.length >= 1 && lA.some((l) => /jobs\.json was read again: its note jobs\.json\.corrupt-unread is marked done \(renamed\), 1 For-you item\(s\) resolved, the job-logs clean-up resumes/.test(l)), 'B-f276 cure (the ruling): the read again that loaded marks its note done (renamed — no hold reads it), resolves its For-you item, and the clean-up resumes', { noteThere, lifted, resolved });
  A.shutdown();
  ok(JSON.parse(fs.readFileSync(SF, 'utf-8')).map((j) => j.id).filter((id) => id.startsWith('jb-f2760a')).sort().join() === 'jb-f2760a01,jb-f2760a02', 'B-f276: …and the store on disk still holds every record it held (none written over)');
  }
  // A2. THE DOORS SAY WHY (cure r1): the panel's list, a job's page and a start answer «the records cannot be read», never nothing / «no such job»
  {
    const d = mkDir('jobs-triage-unread-routes'), F = path.join(d, 'jobs.json');
    plant(F, body, 'folder');
    const { jm: R, call: callR } = boot(d);
    const list = await callR('GET', '/api/jobs', {}), one = await callR('GET', '/api/jobs/:id', { params: { id: 'jb-f2760a01' } }), act = await callR('POST', '/api/jobs/:id/:act', { params: { id: 'jb-f2760a01', act: 'stop' } }), mk = await callR('POST', '/api/jobs', { body: spec });
    ok(list.status === 503 && list.body.code === 'records-unread' && list.body.why === 'EISDIR' && /For you says what to check/.test(list.body.error), 'B-f276 cure: the panel\'s list answers WHY it is empty — the records cannot be read (its code), never an empty list', list);
    ok(one.status === 503 && act.status === 503 && one.body.code === 'records-unread' && !/no such job/.test(JSON.stringify([one.body, act.body])), 'B-f276 cure: a job\'s page and its stop answer «the records cannot be read», never «no such job» (that reads as a lost record)', { one, act });
    ok(mk.status === 400 && /no job is created until they are read/.test(mk.body.error), 'B-f276 cure: the panel\'s ＋New is refused with its door', mk.body);
    R.shutdown();
    const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), jp = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8');
    ok(/if \(!jm\.ready\) \{ res\.status\(503\)[^\n]*\n  if \(jm\._unread && jm\._unread\.store\) \{ res\.status\(503\)\.json\(\{ error: jm\.unreadWords\(\), code: 'records-unread' \}\); return null; \}/.test(ar) && (jp.match(/listErrorText\(r\)/g) || []).length === 2, 'B-f276 cure WIRING: every agent job verb (jobAuth: list, show, poll, stop, run) answers the same words; the panel\'s two lists word the code in the person\'s language');
  }
  // B. THE ARCHIVE, EISDIR (a real mode): the boot's sweep would write over it — it keeps its records in the store instead
  const dB = mkDir('jobs-triage-unread-archive'), AF = path.join(dB, 'jobs-archive.json');
  fs.writeFileSync(path.join(dB, 'jobs.json'), JSON.stringify([rec('jb-f2760b01')]));
  fs.mkdirSync(AF);
  const lB = [];
  const Bj = engine({ JobManager }, dB, lB);
  ok(Bj._unread.archive && Bj._unread.archive.code === 'EISDIR' && fs.statSync(AF).isDirectory() && asides(dB, 'jobs-archive.json').length === 0 && Bj.jobs.has('jb-f2760b01') && lB.some((l) => /NOT archived — the store keeps them/.test(l)), 'B-f276: an archive whose read fails (EISDIR) is not set aside and not written over — the boot sweep\'s record stays in the store', { unread: Bj._unread.archive, asides: asides(dB, 'jobs-archive.json') });
  fs.rmdirSync(AF); fs.writeFileSync(AF, JSON.stringify([{ ...rec('jb-f2760b02'), archivedAt: T0 - D, archivedWhy: 'done' }]));
  const backB = await until(() => !Bj._unread.archive && Bj.archive && Bj.archive.some((r) => r.id === 'jb-f2760b02'));
  const sw = backB ? Bj.archiveSweep({ now: T0 }) : null;
  const onDiskB = (() => { try { return JSON.parse(fs.readFileSync(AF, 'utf-8')).map((r) => r.id).sort().join(); } catch (e) { return e.code; } })();
  ok(backB && sw && sw.archived.includes('jb-f2760b01') && onDiskB === 'jb-f2760b01,jb-f2760b02', 'B-f276: the archive is read again; the next sweep archives beside what it held (nothing lost)', { backB, onDiskB });
  if (Bj._logsNoteP) await Bj._logsNoteP;
  Bj.shutdown();
  // B2. THE ARCHIVE'S WRITE GUARD (an EIO stand-in on its read — a real file, so only the guard keeps the sweep's write off it)
  const guardScene = (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs-archive.json');
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify([rec('jb-f2760g01')]));
    fs.writeFileSync(F, JSON.stringify([{ ...rec('jb-f2760g02'), archivedAt: T0 - D, archivedWhy: 'done' }]));
    const before = fs.readFileSync(F, 'utf-8'), rfg = fs.readFileSync;
    fs.readFileSync = function (f, ...a) { if (String(f) === F) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rfg.call(this, f, ...a); };
    let J; try { J = engine(Mod, d, []); } finally { fs.readFileSync = rfg; }
    J._unreadStopped = true;
    return { J, kept: fs.readFileSync(F, 'utf-8') === before, inStore: J.jobs.has('jb-f2760g01') };
  };
  const g = guardScene({ JobManager }, 'jobs-triage-unread-archive-guard');
  ok(g.kept && g.inStore && g.J._unread.archive && g.J._unread.archive.code === 'EIO', 'B-f276: the boot sweep NEVER writes over an archive whose read failed (EIO) — its bytes are as they were, the due record stays in the store', g.J._unread.archive);
  if (g.J._logsNoteP) await g.J._logsNoteP;
  g.J.shutdown();
  // C. TORN BYTES THAT COULD NOT BE SET ASIDE (the rename AND the copy refused): the live file is their only copy — never written over
  const dC = mkDir('jobs-triage-torn-kept'), CF = path.join(dC, 'jobs.json'), torn = '[{"id":"jb-f2760c01","kind":"task","runs":[{"startedAt":1';
  fs.writeFileSync(CF, torn); fs.mkdirSync(path.join(dC, 'job-logs', 'jb-f2760c01'), { recursive: true });
  const rn = fs.renameSync, cp = fs.copyFileSync, lC = [];
  fs.renameSync = function (f, ...a) { if (String(f) === CF) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); return rn.call(this, f, ...a); };
  fs.copyFileSync = function (f, ...a) { if (String(f) === CF) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); return cp.call(this, f, ...a); };
  let C; try { C = engine({ JobManager }, dC, lC); } finally { fs.renameSync = rn; fs.copyFileSync = cp; }
  C._unreadStopped = true;   // the scene holds still (no read again while it is judged)
  C._dirty = true; C._save();
  ok(C._unread.store && C._unread.store.code === 'not set aside' && fs.readFileSync(CF, 'utf-8') === torn && C.jobs.has('jb-f2760c01'), 'B-f276: torn bytes whose set-aside failed hold the store — a save never writes the skeletons over their only copy', C._unread.store);
  if (C._logsNoteP) await C._logsNoteP;
  C.shutdown();
  ok(fs.readFileSync(CF, 'utf-8') === torn, 'B-f276: …nor does the exit');
  // C2. A READ AGAIN DROPS THE EARLIER ANSWER'S SKELETONS (cure r1 — the readers' miss): the torn file replaced by records, read again
  const dropScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'); fs.writeFileSync(F, torn); fs.mkdirSync(path.join(d, 'job-logs', 'jb-f2760c01'), { recursive: true });
    fs.renameSync = function (f, ...a) { if (String(f) === F) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); return rn.call(this, f, ...a); };
    fs.copyFileSync = function (f, ...a) { if (String(f) === F) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); return cp.call(this, f, ...a); };
    let J; try { J = engine(Mod, d, [], { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } }); } finally { fs.renameSync = rn; fs.copyFileSync = cp; }
    const before = J.jobs.has('jb-f2760c01');
    fs.writeFileSync(F, JSON.stringify([rec('jb-f2760c09')]));   // a person put the records back
    await J._unreadRetry('store');
    const out = { before, skel: J.jobs.has('jb-f2760c01'), real: J.jobs.has('jb-f2760c09'), held: !!J._unread.store };
    if (J._logsNoteP) await J._logsNoteP; J.shutdown(); return out;
  };
  const dr = await dropScene({ JobManager }, 'jobs-triage-reread-drop');
  ok(dr.before && !dr.skel && dr.real && !dr.held, 'B-f276 cure: a read again that answers DROPS the skeletons of the earlier answer before it loads — the records stand alone', dr);
  // F. A JOB OF THE PREVIOUS GENERATION THAT ENDED WHILE THE STORE WAS UNREAD is finalized, and its end told, when the read answers
  const endScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), RT = T0 - 3600e3;
    const fb = JSON.stringify([{ id: 'jb-f2760f01', kind: 'task', name: 'ended meanwhile', state: 'up', owner: { conversation: { id: 'conv-f2760' } }, access: acc, runs: [{ startedAt: RT, trigger: 'manual' }], createdAt: RT }]);
    const ctl = path.join(d, 'job-logs', 'jb-f2760f01', String(RT)); fs.mkdirSync(ctl, { recursive: true });
    fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: 4194301, starttime: 1, bootId: 'another-boot-of-this-machine', startedAt: RT }));
    fs.writeFileSync(path.join(ctl, 'exit.json'), JSON.stringify({ code: 0, endedAt: RT + 1000 }));
    plant(F, fb, 'folder');
    const ended = [];
    const J = engine(Mod, d, [], { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 }, onRunEnded: (j) => ended.push(j.id) });
    const atBoot = J.jobs.size;
    unplant(F, fb, 'folder');
    await J._unreadRetry('store');
    const j = J.jobs.get('jb-f2760f01');
    const out = { atBoot, state: j && j.state, ended: ended.join(), told: (J.events || []).some((e) => e.jobId === 'jb-f2760f01') };
    if (J._logsNoteP) await J._logsNoteP; J.shutdown(); return out;
  };
  const en = await endScene({ JobManager }, 'jobs-triage-reread-ended');
  ok(en.atBoot === 0 && en.state === 'done' && en.ended === 'jb-f2760f01' && en.told, 'B-f276 cure: a job that ENDED while the store was unread is finalized when the read answers (the boot\'s adoption, late) — its end is told', en);
  // H. A READ AGAIN THAT HANGS (cure r1, the brief's own law): said once, the tries go on, one read in flight; when it ends the next loads
  const hangScene = async (Mod, name, { waitBack = true } = {}) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), hb = JSON.stringify([rec('jb-f2760h01')]);
    plant(F, hb, 'folder');
    const lh = [];
    const J = engine(Mod, d, lh, { unreadRetry: { firstMs: 5, maxMs: 10, readMs: 30 } });
    unplant(F, hb, 'folder');
    const prf = fs.promises.readFile; let reads = 0, release = null;
    fs.promises.readFile = function (f, ...a) { if (String(f) === F) { reads++; return new Promise((res, rej) => { release = () => rej(Object.assign(new Error('EIO'), { code: 'EIO' })); }); } return prf.call(this, f, ...a); };
    let triesAt = 0;
    // B-f3e8: waited for by the DECISIVE fact, never a 3 s bound a control spends whole: the slow read is said AND either the tries
    // went on (four) or they STOPPED for good — the read in flight, said, and no next try armed: nothing can arm one until the hung
    // read answers (the engine re-arms inside its timer's own callback, so a live engine never shows that state between turns)
    const stoppedForGood = () => !J._unreadT.store && reads === 1;
    try { await until(() => lh.some((l) => /a read again did not answer in 0 s/.test(l)) && (J._unreadTries.store >= 4 || stoppedForGood()), 3000); triesAt = J._unreadTries.store; }
    finally { fs.promises.readFile = prf; }
    const armed = !!J._unreadT.store, inFlight = reads;
    if (release) release();   // the hung read ends (an error): the next try reads the file
    const back = waitBack ? await until(() => !J._unread.store && J.jobs.has('jb-f2760h01'), 3000) : null;   // (the control judges only the tries: never waited)
    const out = { said: lh.filter((l) => /did not answer in/.test(l)).length, triesAt, armed, inFlight, back };
    if (J._logsNoteP) await J._logsNoteP; J.shutdown(); return out;
  };
  const hg = await hangScene({ JobManager }, 'jobs-triage-reread-hang');
  ok(hg.said === 1 && hg.triesAt >= 4 && hg.armed && hg.inFlight === 1 && hg.back, 'B-f276 cure: a read again that HANGS is said once, the next tries stay armed (never «held till a restart»), ONE read is in flight (never doubled), and once it ends the next try loads the store', hg);
  // CONTROLS (scripts/mutant-copy.mjs): the release's classification (a failed read of a file that is there = corrupt) and its
  // unguarded save, in a copy
  const MJ = mutantCopies('jobs-unread-f276', ROOT);
  const jsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  const readLine = 'this._loadAnswer(SR.storeAnswer(read, { valid: STORE_SHAPE }));';
  const archLine = 'this._archiveAnswer(SR.storeAnswer(read, { valid: Array.isArray }));';
  const saveLine = "if (!this._unread.store) timedSync('jobs.write'";
  ok([readLine, archLine, saveLine].every((x) => jsrc.split(x).length === 2), 'B-f276 control setup: the two reads and the store\'s write hold are each one line');
  const release = (r, f) => `((r) => (r.state === 'unreadable' && fs.existsSync(${f}) ? { ...r, state: 'corrupt' } : r))(${r})`;   // MUTANT: the release
  const JMod = MJ.load('src/jobs.js', jsrc
    .replace(readLine, `this._loadAnswer(${release('SR.storeAnswer(read, { valid: STORE_SHAPE })', 'this.file')});`)
    .replace(archLine, `this._archiveAnswer(${release('SR.storeAnswer(read, { valid: Array.isArray })', 'this.archiveFile')});`)
    .replace(saveLine, "if (true) timedSync('jobs.write'"));
  if (!asRoot) {
  const dX = mkDir('jobs-triage-unread-mut'), XF = path.join(dX, 'jobs.json');
  fs.writeFileSync(XF, body); fs.chmodSync(XF, 0o000);
  const X = engine(JMod, dX, []); X._unreadStopped = true;
  const xAside = asides(dX, 'jobs.json');
  if (X._logsNoteP) await X._logsNoteP;
  X.shutdown();
  ok(xAside.length === 1 && !fs.existsSync(XF) || (xAside.length === 1 && JSON.parse(fs.readFileSync(XF, 'utf-8')).length === 0), 'B-f276 CONTROL (the release\'s classification, in a copy): the EACCES store is SET ASIDE — the healthy records leave the live file', xAside);
  try { for (const n of xAside) fs.chmodSync(path.join(dX, n), 0o644); } catch { }
  }
  const dY = mkDir('jobs-triage-unread-mut-arch'), YF = path.join(dY, 'jobs-archive.json');
  fs.writeFileSync(path.join(dY, 'jobs.json'), JSON.stringify([rec('jb-f2760y01')])); fs.mkdirSync(YF);
  const Y = engine(JMod, dY, []); Y._unreadStopped = true;
  const yAside = asides(dY, 'jobs-archive.json');
  if (Y._logsNoteP) await Y._logsNoteP;
  Y.shutdown();
  ok(yAside.length === 1, 'B-f276 CONTROL (the release, in a copy): the EISDIR archive is SET ASIDE by the boot sweep', yAside);
  const dZ = mkDir('jobs-triage-torn-mut'), ZF = path.join(dZ, 'jobs.json');
  fs.writeFileSync(ZF, torn); fs.mkdirSync(path.join(dZ, 'job-logs', 'jb-f2760c01'), { recursive: true });
  fs.renameSync = function (f, ...a) { if (String(f) === ZF) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); return rn.call(this, f, ...a); };
  fs.copyFileSync = function (f, ...a) { if (String(f) === ZF) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); return cp.call(this, f, ...a); };
  let Z; try { Z = engine(JMod, dZ, []); } finally { fs.renameSync = rn; fs.copyFileSync = cp; }
  Z._unreadStopped = true; Z._dirty = true; Z._save();
  const zNow = fs.readFileSync(ZF, 'utf-8');
  if (Z._logsNoteP) await Z._logsNoteP;
  Z.shutdown();
  ok(zNow !== torn, 'B-f276 CONTROL (the release\'s unguarded save, in a copy): the skeletons are written over the torn bytes\' only copy');
  const guardW = "    if (this._unread.archive) return { ok: false, error: `${path.basename(this.archiveFile)} could not be read (${this._unread.archive.code}) — it is not written over until a read answers` };\n";
  ok(jsrc.split(guardW).length === 2, 'B-f276 control setup: the archive\'s write guard is one line');
  const JG = MJ.load('src/jobs.js', jsrc.replace(guardW, '    // MUTANT: no write guard\n'), 'guard');
  const gx = guardScene(JG, 'jobs-triage-unread-archive-guard-mut');
  ok(!gx.kept && !gx.inStore, 'B-f276 CONTROL (no write guard, in a copy): the boot sweep WRITES OVER the unread archive — its record is gone from the file', { kept: gx.kept });
  if (gx.J._logsNoteP) await gx.J._logsNoteP;
  gx.J.shutdown();
  // cure r2 (主开发 02:23Z): THE LATE LOAD MAKES NO FILE CALL ON THE LOOP — every synchronous fs call on the data folder while the read
  // again loads its answer is counted (the async prefetch and set-aside are not): a data answer with a live record to adopt, and torn bytes
  const syncCalls = async (J, d, fn) => {
    const names = ['readFileSync', 'readdirSync', 'renameSync', 'copyFileSync', 'statSync', 'existsSync'], orig = {}, calls = [];
    // the LOAD's own calls: every read, listing and stat on the data folder, and a rename / copy OF a record store (its set-aside) —
    // never the store writer's tmp-then-rename of a file it writes (the notifications' save rides the 2 s write, not the load)
    const counted = (n, f) => String(f).startsWith(d) && (!/^(renameSync|copyFileSync)$/.test(n) || /^jobs(-archive)?\.json$/.test(path.basename(String(f))));
    for (const n of names) { orig[n] = fs[n]; fs[n] = function (f, ...a) { if (counted(n, f)) calls.push(n + ' ' + path.basename(String(f))); return orig[n].call(this, f, ...a); }; }
    try { await fn(); } finally { for (const n of names) fs[n] = orig[n]; }
    return calls;
  };
  const loopScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), RT = T0 - 3600e3;
    const lb = JSON.stringify([{ id: 'jb-f2760n01', kind: 'task', name: 'ended meanwhile', state: 'up', owner: { conversation: { id: 'conv-n' } }, access: acc, runs: [{ startedAt: RT, trigger: 'manual' }], createdAt: RT }]);
    const ctl = path.join(d, 'job-logs', 'jb-f2760n01', String(RT)); fs.mkdirSync(ctl, { recursive: true });
    fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: 4194301, starttime: 1, bootId: 'another-boot-of-this-machine', startedAt: RT }));
    fs.writeFileSync(path.join(ctl, 'exit.json'), JSON.stringify({ code: 0, endedAt: RT + 1000 }));
    plant(F, lb, 'folder');
    const J = engine(Mod, d, [], { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    unplant(F, lb, 'folder');
    const dataCalls = await syncCalls(J, d, () => J._unreadRetry('store'));
    const done = J.jobs.get('jb-f2760n01') && J.jobs.get('jb-f2760n01').state;
    if (J._logsNoteP) await J._logsNoteP; J.shutdown();
    // torn bytes whose set-aside failed at the boot, read again once the rename works: set aside OFF the loop, listed off it
    const d2 = mkDir(name + '-torn'), F2 = path.join(d2, 'jobs.json'); fs.writeFileSync(F2, torn); fs.mkdirSync(path.join(d2, 'job-logs', 'jb-f2760c01'), { recursive: true });
    fs.renameSync = function (f, ...a) { if (String(f) === F2) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); return rn.call(this, f, ...a); };
    fs.copyFileSync = function (f, ...a) { if (String(f) === F2) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); return cp.call(this, f, ...a); };
    let J2; try { J2 = engine(Mod, d2, [], { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } }); } finally { fs.renameSync = rn; fs.copyFileSync = cp; }
    const tornCalls = await syncCalls(J2, d2, () => J2._unreadRetry('store'));
    const aside = fs.readdirSync(d2).some((n) => /^jobs\.json\.corrupt-\d+$/.test(n));
    if (J2._logsNoteP) await J2._logsNoteP; J2.shutdown();
    return { dataCalls, done, tornCalls, aside };
  };
  const ls = await loopScene({ JobManager }, 'jobs-triage-reread-loop');
  ok(ls.done === 'done' && ls.dataCalls.length === 0 && ls.aside && ls.tornCalls.length === 0, 'B-f276 cure r2: the late load makes NO synchronous file call on the data folder — a live record\'s control files and the torn bytes\' set-aside and listing are done off the loop, then loaded', ls);
  // cure r2: an UNREAD archive's refusal is said ONCE a hold (never every sweep), and a clear that cannot reach it SAYS so
  {
    const d = mkDir('jobs-triage-unread-archive-once'), AF2 = path.join(d, 'jobs-archive.json'), lo = [];
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify([rec('jb-f2760o01')]));
    fs.mkdirSync(AF2);
    const J = engine({ JobManager }, d, lo, { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    J.archiveSweep({ now: T0 }); J.archiveSweep({ now: T0 + 1 }); J.archiveSweep({ now: T0 + 2 });
    const cl = J.clearJobs(['jb-f2760o01'], { allow: () => true });
    ok(lo.filter((l) => /released but NOT archived/.test(l)).length === 1 && J.jobs.has('jb-f2760o01'), 'B-f276 cure r2: while the archive cannot be read its sweep\'s refusal is said ONCE a hold, not every sweep — the record stays in the store', lo.filter((l) => /NOT archived/.test(l)));
    ok(cl && /archived records could not be reached, so their words were not cleared — clear them again once it reads — jobs-archive\.json in VibeSpace's data folder could not be read \(EISDIR\)/.test(cl.archiveUnread || ''), 'B-f276 cure r2: a clear that cannot reach a held archive SAYS so in its answer', cl);
    if (J._logsNoteP) await J._logsNoteP; J.shutdown();
  }
  const dropL = "        for (const [id, j] of this.jobs) if (LS.isSkeleton(j)) this.jobs.delete(id);   // the skeletons of an earlier answer: the new answer rebuilds its own, or has the records\n";
  const adoptL = "        if (!this._unread.store && !this.readOnly) { this._adoptAndReplay(); this._dirty = true; }   // the boot's adoption, late: the records are this process's now\n";
  const armL = "    this._unreadRetrySoon(which);   // the next try first: whatever this one does\n";
  const liftL = "      if (a.state === 'data') this._unreadLift(which, was).catch((e) => this.d.log(`[jobs] ${base}: its note could not be lifted:`, e && e.message));\n      else this._unreadEnded(which, was, a, pre).catch((e) => this.d.log(`[jobs] ${base}: its end could not be said:`, e && e.message));\n";   // cure 2: the lift ONLY on a whole read
  ok([dropL, adoptL, armL, liftL].every((x) => jsrc.split(x).length === 2), 'B-f276 cure control setup: the drop, the late adoption, the armed next try and the lift are each one line');
  const JC = MJ.load('src/jobs.js', jsrc.replace(dropL, '        // MUTANT: no drop\n').replace(adoptL, '        // MUTANT: no late adoption\n').replace(armL, '    // MUTANT: the next try only after an answer\n').replace(liftL, '      // MUTANT: no lift\n'), 'cure');
  const drx = await dropScene(JC, 'jobs-triage-reread-drop-mut');
  ok(drx.skel && drx.real, 'B-f276 cure CONTROL (no drop, in a copy): the skeleton of the earlier answer stays beside the records', drx);
  const enx = await endScene(JC, 'jobs-triage-reread-ended-mut');
  ok(enx.state === 'up' && !enx.ended, 'B-f276 cure CONTROL (no late adoption, in a copy): the job that ended meanwhile stays «up» — never finalized, never told', enx);
  const liftScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), lb = JSON.stringify([rec('jb-f2760l01')]), note = path.join(d, 'jobs.json.corrupt-unread');
    plant(F, lb, 'folder');
    const J = engine(Mod, d, [], { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    if (J._logsNoteP) await J._logsNoteP;
    const wrote = fs.existsSync(note);
    unplant(F, lb, 'folder');
    await J._unreadRetry('store'); await new Promise((r) => setTimeout(r, 50));
    const out = { wrote, noteLeft: fs.existsSync(note), held: J._logsUnread.store };
    J.shutdown(); return out;
  };
  const lf = await liftScene({ JobManager }, 'jobs-triage-reread-lift');
  const lfx = await liftScene(JC, 'jobs-triage-reread-lift-mut');
  ok(lf.wrote && !lf.noteLeft && !lf.held && lfx.wrote && lfx.noteLeft && lfx.held, 'B-f276 cure (the ruling) + CONTROL (no lift, in a copy): a folder fault writes the note; the read again that loads lifts it — without the lift it holds the clean-up for good', { lf, lfx });
  const preL = "      return { a, pre: await this._unreadPrefetch(which, a, file) };   // cure r2: what the late load reads, off the loop\n";   // cure 2: inside the one in-flight slot
  ok(jsrc.split(preL).length === 2, 'B-f276 cure r2 control setup: the late load\'s prefetch is one line');
  const JP = MJ.load('src/jobs.js', jsrc.replace(preL, '      return { a, pre: null };   // MUTANT: the late load reads on the loop\n'), 'prefetch');
  const lsx = await loopScene(JP, 'jobs-triage-reread-loop-mut');
  ok(lsx.dataCalls.length > 0 && lsx.tornCalls.length > 0, 'B-f276 cure r2 CONTROL (no prefetch, in a copy): the late load makes synchronous file calls on the data folder', { data: lsx.dataCalls.length, torn: lsx.tornCalls.length });
  const hgx = await hangScene(JC, 'jobs-triage-reread-hang-mut', { waitBack: false });
  ok(!hgx.armed || hgx.triesAt < 4, 'B-f276 cure CONTROL (the next try only after an answer, in a copy): a hung read STOPS the tries', hgx);
  // ── CURE 2 (主开发 09:20Z, THE LAW): the hold is LIFTED — «nothing was lost», the note marked done, the clean-up resumed — ONLY on a
  // WHOLE read. A file GONE, or torn bytes, end the hold with THEIR own true sentence, and the clean-up stays held
  const notWhole = async (Mod, name, after) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), note = path.join(d, 'jobs.json.corrupt-unread'), b = JSON.stringify([rec('jb-f2760g01')]);
    fs.mkdirSync(path.join(d, 'job-logs', 'jb-f2760g01'), { recursive: true });   // a job's logs: the clean-up's matter
    plant(F, b, 'folder');
    const lg = [], f0 = filed.length, r0 = resolved.length;
    const J = engine(Mod, d, lg, { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    if (J._logsNoteP) await J._logsNoteP;
    const wrote = fs.existsSync(note);
    fs.rmdirSync(F); if (after === 'torn') fs.writeFileSync(F, '[{"id":"jb-f2760g01",');   // gone: nothing there at all
    await J._unreadRetry('store'); if (after === 'gone') await J._unreadRetry('store');   // cure 3: «missing» is read once more
    await new Promise((r) => setTimeout(r, 80));
    const mine = filed.slice(f0), fact = (k) => mine.find((n) => n && n.fact === k) || null;
    const out = { wrote, ended: !J._unread.store, noteLeft: fs.existsSync(note), done: fs.readdirSync(d).some((n) => /^jobs\.json\.unread-done-\d+$/.test(n)), held: J._logsUnread.store, readAgain: !!fact('records-read-again'), gone: fact('records-gone'), corrupt: fact('store-corrupt'), resolved: resolved.length - r0, asides: asides(d, 'jobs.json'), skel: J.jobs.has('jb-f2760g01'), said: lg.filter((l) => /read again after/.test(l)).join(' | ') };
    J.shutdown(); return out;
  };
  const LIFT_ANY = "      if (a.state === 'data') this._unreadLift(which, was)";
  ok(jsrc.split(LIFT_ANY).length === 2, 'B-f276 cure 2 control setup: the lift asks the answer\'s state on one line');
  const JL = MJ.load('src/jobs.js', jsrc.replace(LIFT_ANY, "      if (true) this._unreadLift(which, was)"), 'lift-any');   // MUTANT: r2 — the lift on ANY answer that clears the hold
  const gn = await notWhole({ JobManager }, 'jobs-triage-reread-gone', 'gone'), gnx = await notWhole(JL, 'jobs-triage-reread-gone-mut', 'gone');
  ok(gn.wrote && gn.ended && gn.noteLeft && !gn.done && gn.held && !gn.readAgain && gn.resolved >= 1 && gn.gone && gn.gone.urgency === 'high' && /the file was gone — the jobs it listed are not in VibeSpace now/.test(gn.gone.words.key) && gn.gone.words.params.note === 'jobs.json.corrupt-unread' && Number.isFinite(gn.gone.words.params.when.at) && Number.isFinite(gn.gone.words.params.until.at) && /the file is GONE/.test(gn.said), 'cure 2: a read again that finds the file GONE ends the hold with ITS OWN sentence (what is gone, the note that keeps the logs) — the note STANDS, the clean-up stays held, never «nothing was lost»', gn);
  ok(gnx.readAgain && !gnx.noteLeft && !gnx.held, 'cure 2 CONTROL (r2: the lift on any answer, in a copy): «nothing was lost» is said of a GONE file, its note is marked done and the clean-up resumes over jobs whose records are not there', gnx);
  const tn = await notWhole({ JobManager }, 'jobs-triage-reread-torn', 'torn'), tnx = await notWhole(JL, 'jobs-triage-reread-torn-mut', 'torn');
  ok(tn.ended && tn.asides.length === 1 && tn.skel && tn.corrupt && tn.corrupt.words.params.file === tn.asides[0] && !tn.readAgain && tn.held && tn.done && tn.resolved >= 1 && /torn bytes, set aside as jobs\.json\.corrupt-\d+/.test(tn.said), 'cure 2: a read again that finds TORN bytes ends the hold as a boot would — set aside (named in its item), rebuilt from the job logs; the set-aside holds the clean-up, the failure\'s note is done, never «nothing was lost»', tn);
  ok(tnx.readAgain && !tnx.held, 'cure 2 CONTROL (r2: the lift on any answer, in a copy): «nothing was lost» is said of TORN bytes and the clean-up resumes', tnx);
  // CURE 2: ONE IN FLIGHT A STORE covers the read AND its prefetch — a SLOW prefetch with a second try: one read, one file at a time, one load
  const prefScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), b = JSON.stringify([rec('jb-f2760p01', { state: 'up', runs: [{ startedAt: T0 - 1000 }] })]);
    plant(F, b, 'folder');
    const lp = [];
    const J = engine(Mod, d, lp, { unreadRetry: { firstMs: 5, maxMs: 10, readMs: 30 } });
    unplant(F, b, 'folder');
    const prf = fs.promises.readFile; let storeReads = 0, ctlReads = 0, release = null;
    const gate = new Promise((r) => { release = r; });
    fs.promises.readFile = function (f, ...a) { const p = String(f); if (p === F) storeReads++; if (p.includes(`${path.sep}job-logs${path.sep}`)) { ctlReads++; return gate.then(() => prf.call(this, f, ...a)); } return prf.call(this, f, ...a); };
    let during = null;
    try { await until(() => J._unreadTries.store >= 5, 3000); during = { storeReads, ctlReads, tries: J._unreadTries.store, held: !!J._unread.store }; release(); await until(() => !J._unread.store, 3000); }
    finally { release(); fs.promises.readFile = prf; }
    const out = { during, back: !J._unread.store && J.jobs.has('jb-f2760p01'), storeReads, said: lp.filter((l) => /did not answer in/.test(l)).length, loads: lp.filter((l) => /read again after/.test(l)).length };
    if (J._logsNoteP) await J._logsNoteP; J.shutdown(); return out;
  };
  const SLOT_A = "      const a = SR.storeAnswer(read, { valid: which === 'store' ? STORE_SHAPE : Array.isArray });\n";
  ok(jsrc.split(SLOT_A).length === 2, 'B-f276 cure 2 control setup: the read again\'s answer is one line inside its slot');
  const JS2 = MJ.load('src/jobs.js', jsrc.replace(SLOT_A, SLOT_A + "      if (this._unreadP[which]) this._unreadP[which] = null;   // MUTANT: r2 — the slot covers the read only\n"), 'slot-read-only');
  const pf = await prefScene({ JobManager }, 'jobs-triage-reread-prefetch'), pfx = await prefScene(JS2, 'jobs-triage-reread-prefetch-mut');
  ok(pf.during && pf.during.tries >= 5 && pf.during.storeReads === 1 && pf.during.ctlReads === 1 && pf.during.held && pf.back && pf.said === 1 && pf.loads === 1, 'cure 2: a SLOW prefetch holds the one slot — the tries go on, ONE read of the store, ONE control file in flight at a time, said once, ONE load once it answers', pf);
  ok(pfx.during && (pfx.during.storeReads > 1 || pfx.during.ctlReads > 1), 'cure 2 CONTROL (r2: the slot covers the read only, in a copy): a second try reads the store and starts its prefetch over the slow one', pfx);
  // ── CURE 3 (主开发 11:10Z, as if a must): a store that answers «missing» RIGHT AFTER an unreadable answer is read once more before
  // anything is written at its path — the storage that says «no such file» for a moment about a file that is there
  const onceScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), b = JSON.stringify([rec('jb-f2760m01')]), lm = [];
    plant(F, b, 'folder');
    const J = engine(Mod, d, lm, { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    fs.rmdirSync(F);   // «no such file», for a moment
    await J._unreadRetry('store');
    const heldAfterOne = !!J._unread.store;
    J._dirty = true; J._save();   // the next save meanwhile
    const wroteOver = fs.existsSync(F);
    if (!wroteOver) fs.writeFileSync(F, b);   // the storage answers again: the file was there all along
    await J._unreadRetry('store');
    const out = { heldAfterOne, wroteOver, back: !J._unread.store && J.jobs.has('jb-f2760m01'), said: lm.some((l) => /a read again answered «no such file» — read once more before anything is written there/.test(l)) };
    if (J._logsNoteP) await J._logsNoteP; J.shutdown(); return out;
  };
  const ONCE_A = "    if (a.state === 'missing' && !this._unreadMissingAt[which]) {";
  ok(jsrc.split(ONCE_A).length === 2, 'B-f276 cure 3 control setup: «missing» read once more is one line');
  const JO = MJ.load('src/jobs.js', jsrc.replace(ONCE_A, '    if (false /* MUTANT: cure 2 — «missing» believed at once */) {'), 'missing-once');
  const on = await onceScene({ JobManager }, 'jobs-triage-reread-once'), onx = await onceScene(JO, 'jobs-triage-reread-once-mut');
  ok(on.heldAfterOne && !on.wroteOver && on.back && on.said, 'cure 3: a store that answers «missing» right after an unreadable answer is READ ONCE MORE — the hold stands, the next save writes nothing at its path, and the file that was there all along is read back whole', on);
  ok(!onx.heldAfterOne && onx.wroteOver && !onx.back, 'cure 3 CONTROL (cure 2: «missing» believed at once, in a copy): the hold ends and the next save WRITES OVER the path — the records that were there are lost', onx);
  // CURE 3: no «unread» item after «gone» was said for the same failure (its note, still being written, lands after)
  {
    const d = mkDir('jobs-triage-gone-owed'), F = path.join(d, 'jobs.json');
    plant(F, '[]', 'folder');
    const J = engine({ JobManager }, d, [], { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    if (J._logsNoteP) await J._logsNoteP;
    const f0 = filed.length;
    J._logsRemover = () => ({ note: async () => ({ notes: { 'jobs.json.corrupt-unread': 'written' } }) });
    const o1 = { error: 'EISDIR', at: T0 + 1 }; J._logsNoteOwed.store = o1; J._unreadGoneOwed.store = o1;
    await J._logsWriteNotes();
    const after1 = filed.slice(f0).filter((n) => n && n.fact === 'records-unread').length;
    const o2 = { error: 'EISDIR', at: T0 + 2 }; J._logsNoteOwed.store = o2; J._unreadGoneOwed.store = null;   // the release's state: nothing said «gone»
    await J._logsWriteNotes();
    const after2 = filed.slice(f0).filter((n) => n && n.fact === 'records-unread').length;
    ok(after1 === 0 && after2 === 1, 'cure 3: a note that lands after «gone» was said for the SAME failure files no «unread» item (it holds the clean-up, said in the journal); CONTROL: without the «gone» mark the note files its item', { after1, after2 });
    J.shutdown();
  }
  // CURE 3: a read-only engine's torn read again reads the archive's ids in the prefetch — no synchronous read on the loop
  const roScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json');
    fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify([{ ...rec('jb-f2760r02'), archivedAt: T0 - D, archivedWhy: 'done' }]));
    for (const id of ['jb-f2760r01', 'jb-f2760r02']) fs.mkdirSync(path.join(d, 'job-logs', id), { recursive: true });
    const holder = spawn('sleep', ['60'], { stdio: 'ignore' }), PIx = require(path.join(ROOT, 'src/proc-identity.js'));
    await until(() => !!PIx.identityOf(holder.pid));
    fs.writeFileSync(path.join(d, 'jobs.lock'), JSON.stringify({ pid: holder.pid, starttime: PIx.identityOf(holder.pid).starttime, at: T0 }));   // another engine holds the lock
    plant(F, '[]', 'folder');
    const J = engine(Mod, d, [], { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    const ro = J.readOnly;
    fs.rmdirSync(F); fs.writeFileSync(F, '[{"id":"jb-f2760r01",');   // torn bytes
    const rfs = fs.readFileSync; let sync = 0;
    fs.readFileSync = function (f, ...a) { if (String(f).startsWith(d)) sync++; return rfs.call(this, f, ...a); };
    try { await J._unreadRetry('store'); } finally { fs.readFileSync = rfs; }
    const out = { ro, sync, skel: J.jobs.has('jb-f2760r01'), archivedSkel: J.jobs.has('jb-f2760r02') };
    J.shutdown(); try { holder.kill('SIGKILL'); } catch { }
    return out;
  };
  const AR_A = "      if (which === 'store' && this.archive == null) {";
  ok(jsrc.split(AR_A).length === 2, 'B-f276 cure 3 control setup: the archive prefetch is one line');
  const JR = MJ.load('src/jobs.js', jsrc.replace(AR_A, '      if (false /* MUTANT: cure 2 — the load reads the archive on the loop */) {'), 'ro-archive');
  const ro = await roScene({ JobManager }, 'jobs-triage-reread-ro'), rox = await roScene(JR, 'jobs-triage-reread-ro-mut');
  ok(ro.ro && ro.sync === 0 && ro.skel && !ro.archivedSkel, 'cure 3: a READ-ONLY engine\'s torn read again makes no synchronous read on the loop — the archive\'s ids come with the prefetch (its skeletons skip the archived job)', ro);
  ok(rox.ro && rox.sync > 0, 'cure 3 CONTROL (cure 2, in a copy): the load reads jobs-archive.json synchronously on the loop', rox);
  for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 7, label: 'B-f276 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

console.log('§15 B-6c1a: a record whose runs is not a list never breaks the list');
{
  const recOf = (id, extra = {}) => ({ id, kind: 'task', name: 'odd ' + id.slice(-2), state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [], createdAt: T0 - D, ...extra });
  const scene = async (mod, name) => {
    const d = mkDir(name);
    const { W, jm, call: callR } = boot(d, { mod });
    jm.jobs.set('jb-6c1a0001', recOf('jb-6c1a0001', { runs: { a: 1 } }));
    jm.jobs.set('jb-6c1a0002', recOf('jb-6c1a0002', { runs: 5 }));
    jm.jobs.set('jb-6c1a0003', recOf('jb-6c1a0003', { runs: [null, { startedAt: T0 - D, endedAt: T0 - D + 1, exit: 0 }] }));
    jm.archive = [{ ...recOf('jb-6c1a0004', { runs: 'x' }), archivedAt: T0 - D, archivedWhy: 'done' }];
    let list = null, arch = null;
    try { list = await callR('GET', '/api/jobs', {}); } catch (e) { list = { threw: String(e && e.message) }; }
    try { arch = await callR('GET', '/api/jobs', { query: { archived: '1' } }); } catch (e) { arch = { threw: String(e && e.message) }; }
    const detail = {};   // the adversarial read r1: the row's DETAIL (GET /api/jobs/:id) — the panel reads its runs as a list of records
    for (const id of ['jb-6c1a0001', 'jb-6c1a0002', 'jb-6c1a0003', 'jb-6c1a0004']) { try { const r = await callR('GET', '/api/jobs/:id', { params: { id } }); detail[id] = r.status === 200 ? r.body.job.runs : { status: r.status }; } catch (e) { detail[id] = { threw: String(e && e.message) }; } }
    W.shutdown?.();
    return { list, arch, detail };
  };
  const real = await scene(wiring, 'jobs-triage-runs-shape');
  const rowsOf = (r) => (r && r.body && Array.isArray(r.body.jobs) ? r.body.jobs : []), runsBy = (r, id) => (rowsOf(r).find((j) => j.id === id) || {}).runs;
  ok(real.list && real.list.status === 200 && ['jb-6c1a0001', 'jb-6c1a0002'].every((id) => Array.isArray(runsBy(real.list, id)) && runsBy(real.list, id).length === 0) && runsBy(real.list, 'jb-6c1a0003').length === 1
    && real.arch && real.arch.status === 200 && Array.isArray(runsBy(real.arch, 'jb-6c1a0004')) && runsBy(real.arch, 'jb-6c1a0004').length === 0,
    'B-6c1a: records whose runs is an object, a number, a string, or a list holding a null are LISTED (live and archived) — their runs read as none, never a list that fails', { live: rowsOf(real.list).map((j) => [j.id, j.runs]), arch: rowsOf(real.arch).map((j) => [j.id, j.runs]) });
  const recordsOnly = (v) => Array.isArray(v) && v.every((r) => r && typeof r === 'object');
  ok(recordsOnly(real.detail['jb-6c1a0001']) && real.detail['jb-6c1a0001'].length === 0 && recordsOnly(real.detail['jb-6c1a0002']) && recordsOnly(real.detail['jb-6c1a0003']) && real.detail['jb-6c1a0003'].length === 1 && recordsOnly(real.detail['jb-6c1a0004']),
    'B-6c1a: the row\'s DETAIL (live and archived) serves its runs as a list of whole records — the panel\'s detail never meets an object, a number, a string or a null', real.detail);
  const WSRC = fs.readFileSync(path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8'), NEW_RUNS = "(Array.isArray(j.runs) ? j.runs : []).filter((r) => r && typeof r === 'object').map((r) => ({";
  const DETAIL = ['runs: runsWhole(rec) } });', 'runs: runsWhole(job) } });'];
  ok(DETAIL.every((a) => WSRC.split(a).length === 2), 'B-6c1a control setup: the anchors of the detail\'s control (its two runs reads) are in the source');
  ok(WSRC.split(NEW_RUNS).length === 2, 'B-6c1a control setup: the guarded runs read is in jobs-wiring once (the plant the control swaps)');
  const MJ6 = mutantCopies('jobs-runs-shape-6c1a', ROOT);
  const old = await scene(MJ6.load('src/server/jobs-wiring.js', WSRC.replace(NEW_RUNS, '(j.runs || []).map((r) => ({').replace(DETAIL[0], 'runs: rec.runs } });').replace(DETAIL[1], 'runs: job.runs } });'), 'release'), 'jobs-triage-runs-shape-mut');   // stale-pins: kept — the control writes the release's runs read back into a copy
  ok(!(old.list && old.list.status === 200) || !(old.arch && old.arch.status === 200), 'B-6c1a CONTROL (the release\'s runs read, in a copy): the list FAILS on such a record', { list: old.list && (old.list.status || old.list.threw), arch: old.arch && (old.arch.status || old.arch.threw) });
  ok(!recordsOnly(old.detail['jb-6c1a0001']) && !recordsOnly(old.detail['jb-6c1a0003']), 'B-6c1a CONTROL (the release\'s detail, in the same copy): the detail serves the object as it is and the list with its null', old.detail);
  for (const r of copiesCensus(MJ6.files, MJ6.dir, ROOT, { minCopies: 1, label: 'B-6c1a ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

console.log('§16 B-c330: the job-logs clean-up\'s steady passes fold into ONE journal line a day; a big pass speaks at once');
{
  const DAY1 = Date.UTC(2026, 10, 17, 10, 0, 0), DAY2 = Date.UTC(2026, 10, 18, 0, 5, 0);
  const scene = async (Mod, name) => {
    const d = mkDir(name), logs = [];
    const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), logsSweep: { bootDelayMs: 3600e3 } });
    J.init();
    J._logsAdopt({});
    const answers = [3, 3, 3, 60, 2].map((n) => ({ removed: n, entries: n * 2, more: false, ms: 1, state: {} }));
    let k = 0; J._logsRemover = () => ({ sweep: async () => answers[k++] });
    for (const at of [DAY1, DAY1 + 3600e3, DAY1 + 7200e3, DAY1 + 9000e3]) await J._logsPass(at, 'tick');
    const day1 = logs.filter((l) => /job-logs: /.test(l));
    await J._logsPass(DAY2, 'tick');
    const all = logs.filter((l) => /job-logs: /.test(l));
    const kept = JSON.parse(JSON.stringify(J._logsState)); J._logsAdopt(kept);   // the record across a restart
    const out = { day1, all, keptDay: J._logsState.day };
    J.shutdown(); return out;
  };
  const r = await scene({ JobManager }, 'jobs-triage-logs-fold');
  ok(r.day1.length === 1 && /job-logs: 60 run dir\(s\) past the 14-day retention that no record lists removed \(120 entries\)/.test(r.day1[0]), 'B-c330: three small steady passes say NOTHING yet; a pass that removes fifty or more speaks at once', r.day1);
  ok(r.all.length === 2 && /job-logs: on 2026-11-17 \(UTC\) 9 run dir\(s\) past the 14-day retention that no record lists were removed over 3 steady pass\(es\) \(18 entries\)/.test(r.all[1]), 'B-c330: the day\'s first pass after it says the day\'s ONE folded line — the counts summed', r.all);
  ok(r.keptDay && r.keptDay.day === '2026-11-18' && r.keptDay.removed === 2 && r.keptDay.passes === 1, 'B-c330: the day\'s folded counts are in the clean-up\'s record — a restart loses none', r.keptDay);
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8'), FOLD = '    else if (ans.removed) { const d = st.day || (st.day = { day: today, removed: 0, entries: 0, passes: 0 }); d.removed += ans.removed; d.entries += ans.entries || 0; d.passes++; }';
  ok(JSRC.split(FOLD).length === 2, 'B-c330 control setup: the fold is one line in jobs.js (the plant the control swaps)');
  const MJ30 = mutantCopies('jobs-logs-fold-c330', ROOT);
  const rx = await scene(MJ30.load('src/jobs.js', JSRC.replace(FOLD, '    else if (ans.removed) this.d.log(LS.words.pass(ans));   /* MUTANT: the release — a line every pass */'), 'release'), 'jobs-triage-logs-fold-mut');
  ok(rx.day1.length === 4, 'B-c330 CONTROL (the release, in a copy): every steady pass says its own line (four in a morning)', rx.day1.length);
  for (const rr of copiesCensus(MJ30.files, MJ30.dir, ROOT, { minCopies: 1, label: 'B-c330 ' })) ok(rr.pass, rr.name + (rr.pass ? '' : ' — ' + rr.detail));
}

console.log('§17 B-8bd5: the job that filed a panel withdraws it once its cause is gone — its For-you item resolved');
{
  const PANEL8 = { title: 'Mirror', blocks: [{ type: 'md', text: 'the mirror is stale' }, { type: 'buttons', options: [{ id: 'ok', label: 'OK' }] }] };
  const scene = async (Mod, name) => {
    const d = mkDir(name), resolved = [];
    const J = new Mod.JobManager({ dataDir: d, broadcast() { }, notifyUser() { return { ok: true, id: 'it-8bd5' }; }, log: () => { }, resolveJobAsk: (id) => resolved.push(id), logsSweep: { bootDelayMs: 3600e3 } });
    J.init();
    const job = { id: 'jb-8bd50001', kind: 'task', name: 'mirror teller', state: 'up', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: T0 }], createdAt: T0, stdinOpen: true };
    J.jobs.set(job.id, job);
    const ctl = J._ctlDir(job, T0); fs.mkdirSync(ctl, { recursive: true });   // 主开发 21:46Z: a stdin-open job reads what its panel got on its stdin
    const posted = J.ask(job, PANEL8);
    const waiting = J.waitFor(J.ansWaiters, job.id, 60_000).then(() => 'woken');
    const asked = job.state;
    const w = J.withdrawAsk(job);
    const woke = await Promise.race([waiting, new Promise((r) => setImmediate(() => r('still waiting')))]);
    const again = J.withdrawAsk(job);
    let tail = ''; for (let k = 0; k < 50 && !tail; k++) { try { tail = fs.readFileSync(path.join(ctl, 'answers.jsonl'), 'utf8'); } catch { } if (!tail) await new Promise((r) => setTimeout(r, 10)); }   // the mirror appends OFF the loop
    const out = { posted: posted.version, asked, w, state: job.state, pending: job.interaction && job.interaction.pending, resolved, woke, again, recorded: ((job.interaction && job.interaction.answers) || []).filter((x) => x && x.withdrawn === true).map((x) => x.version), stdin: tail.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.withdrawn === true).length };
    J.shutdown(); return out;
  };
  const r = await scene({ JobManager }, 'jobs-triage-withdraw');
  ok(r.asked === 'awaiting-user' && r.w.ok && r.w.version === r.posted && r.pending === null && r.state === 'up' && r.resolved.join() === 'jb-8bd50001' && r.woke === 'woken' && r.recorded.join() === String(r.posted), 'B-8bd5: a job WITHDRAWS its own panel — closed, its For-you item resolved, a waiting `answers --wait` woken (the answers record the withdraw, as an expiry), back to «up»', r);
  ok(r.again.ok && /no panel of this job is open/.test(r.again.already || ''), 'B-8bd5: withdrawn twice — answered, nothing changed');
  ok(r.stdin === 1, 'B-8bd5 (主开发 21:46Z): a stdin-open job reads the withdraw on its stdin (the wrapper\'s answers tail file), as it reads an answer', r.stdin);
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8'), RES = "    try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id); } catch { }\n    this._touch(job, { what: `withdrew its panel #${p.version} (its cause is gone)`, verb: 'answers' });\n";
  ok(JSRC.split(RES).length === 2, 'B-8bd5 control setup: the withdraw\'s resolve is one place in jobs.js (the plant the control cuts)');
  const MJ8 = mutantCopies('jobs-withdraw-8bd5', ROOT);
  const rx = await scene(MJ8.load('src/jobs.js', JSRC.replace(RES, "    this._touch(job, { what: `withdrew its panel #${p.version} (its cause is gone)`, verb: 'answers' });   /* MUTANT: no resolve — the item stays */\n"), 'no-resolve'), 'jobs-triage-withdraw-mut');
  ok(rx.resolved.length === 0, 'B-8bd5 CONTROL (the withdraw without its resolve, in a copy): the For-you item STAYS open — what the row reported', rx.resolved);
  const MIR = "      if (run) { try { fs.promises.appendFile(path.join(this._ctlDir(job, run.startedAt), 'answers.jsonl'), JSON.stringify(wrec) + '\\n').catch(() => { }); } catch { } }";
  ok(JSRC.split(MIR).length === 2, 'B-8bd5 control setup: the anchor of the control «the stdin mirror of a withdraw» is in jobs.js');
  const rm = await scene(MJ8.load('src/jobs.js', JSRC.replace(MIR, '      /* MUTANT: no stdin mirror */'), 'no-mirror'), 'jobs-triage-withdraw-mut2');
  ok(rm.stdin === 0, 'B-8bd5 CONTROL (no mirror, in a copy): the stdin-open job never sees the withdraw', rm.stdin);
  for (const rr of copiesCensus(MJ8.files, MJ8.dir, ROOT, { minCopies: 1, label: 'B-8bd5 ' })) ok(rr.pass, rr.name + (rr.pass ? '' : ' — ' + rr.detail));
  const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf8');
  ok(/const selfActs = \['progress', 'ask', 'withdraw', 'announce'\];/.test(ar) && !/const needsControl = \[[^\]]*'withdraw'[^\]]*\];/.test(ar) && /if \(!a\.selfJob && act === 'withdraw' && !jobModel\.canEdit\(job, a\.caller\)\) return jobModel\.canView\(job, a\.caller\) \? res\.status\(403\)/.test(ar) && /else if \(act === 'withdraw'\) r = a\.jm\.withdrawAsk\(job, \{ self: !!a\.selfJob \}\);/.test(ar) && /case 'withdraw': \{/.test(cli) && /vibespace-job withdraw \(its cause is gone\)/.test(cli), 'WIRING: a job token withdraws its OWN panel; a conversation only as its owner — a control grant never withdraws (its route leg: test-jobs-addressed §0); the CLI has `withdraw` (in its usage)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
