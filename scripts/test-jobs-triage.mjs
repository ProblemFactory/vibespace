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
function boot(dir, { broadcasts = [] } = {}) {
  const { app, call } = fakeApp();
  const W = wiring.create({
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
  ok((J.pendingNotifs.get(cid) || []).some((n) => n.held && n.held.kind === 'not-reachable'), 'an unreachable inbox is held as not-reachable');
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
