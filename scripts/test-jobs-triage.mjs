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
import { scratch, freePorts, anchored } from './scratch.mjs';
import { spawn } from 'node:child_process';
import { makeFixture, SESSIONS, writeAliveStamp } from './jobs-triage-fixture.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs'; // r6 D-F5: the pre-fix panel identity as a negative control
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { JobManager, ARCHIVE_CAP, ARCHIVE_SWEEP_MS } = require(path.join(ROOT, 'src/jobs.js'));
const M = require(path.join(ROOT, 'src/job-model.js'));
const wiring = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const H = 3600e3, D = 86400e3;
const T0 = Date.now(); // the ONE clock; everything below is relative to it
const dirs = [];
const mkDir = (name) => { const d = scratch(name); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(path.join(d, 'bin'), { recursive: true }); dirs.push(d); return d; };
const cleanup = () => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
// lane lg-store-writes (B-0248 U4): jobs.json is the STORE WRITER's — a read of the FILE first lands what the process's writer owes
const SWu4 = require(path.join(ROOT, 'src/store-writer.js'));
const landedU4 = () => { const r = SWu4.storeWriter().flushSync(); if (r.deferred || (r.left && r.left.length)) throw new Error(`the store writer left owed writes (a disk check after it would prove nothing): ${JSON.stringify(r.deferred ? 'deferred' : r.left).slice(0, 300)}`); };   // lane lg-store-writes U4 (the move's read): LOUD — a landing that did not happen never leaves a disk check vacuous in silence
// B-0248 step 3 (lane bl-loop-b): the archive rides the store writer — a sweep's records leave the store at its LANDING; the suite
// lands it at once (the process's writer, twice: the archive, then jobs.json's save its landing made) and reads the landing's answer
const flushU4 = () => { try { SWu4.storeWriter().flushSync(); } catch { /* a held store's own refusal */ } };
const sweepNow = (eng, o = {}) => { let out = null; const h = eng.archiveSweep({ ...o, answer: (x) => { out = x; } }); flushU4(); flushU4(); return out || h; };
const readStore = (d) => { landedU4(); return JSON.parse(fs.readFileSync(path.join(d, 'jobs.json'), 'utf-8')); };
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
ok(gateOf(jm.ready) && !jm.readOnly, 'the engine takes the lock over the fixture store');
ok(jm.jobs.size === fx.jobs.length, `every fixture record is live at boot (${jm.jobs.size} = ${fx.jobs.length}; the boot sweep archived nothing at the real clock)`);
ok(jm.jobs.get(fx.ids.running).state === 'up' && jm.jobs.get(fx.ids.awaiting).state === 'awaiting-user', 'the running and awaiting-user rows were ADOPTED (live stamp), not finalized');
const failedIds = fx.failedRows.map((r) => r.id);
const ackBy = (id) => M.ackState(jm.jobs.get(id) || jm.archivedById(id)).by;
const byKind = (k) => fx.failedRows.filter((r) => r.kind === k).map((r) => r.id);
ok(verdictOf(byKind('notified').every((id) => ackBy(id) === 'notified')), 'failed rows whose journal carries an ok:true message delivery are acknowledged (notified)');
ok(verdictOf(byKind('stash').every((id) => ackBy(id) === null)), 'failed rows whose ONLY journal entry is a stash are UNACKNOWLEDGED');
ok(gateOf(byKind('agent-read').every((id) => ackBy(id) === 'agent-read')) && verdictOf(byKind('user-opened').every((id) => ackBy(id) === 'user-opened')), 'the agent-read / user-opened stamps acknowledge');
ok(gateOf(byKind('stranger').every((id) => ackBy(id) === null)) && verdictOf(byKind('self').every((id) => ackBy(id) === null)), "a stranger session's read and a jbt_ self-read left no stamp ⇒ unacknowledged");
const unackedAtBoot = failedIds.filter((id) => ackBy(id) === null);
const ackedAtBoot = failedIds.filter((id) => ackBy(id) !== null);
ok(unackedAtBoot.length === byKind('stash').length + byKind('stranger').length + byKind('self').length, `the unacknowledged set is exactly stash+stranger+self (${unackedAtBoot.length} of ${failedIds.length})`);
const list0 = await call('GET', '/api/jobs');
ok(list0.status === 200 && list0.body.jobs.length === fx.jobs.length && list0.body.archivedCount === 0 && gateOf(list0.body.held) && list0.body.held.total === Object.values(fx.notifs).flat().length, `GET /api/jobs carries the live list + archivedCount 0 + the held digest (${list0.body.held && list0.body.held.total} held)`);
const snapFailed = list0.body.jobs.find((j) => j.id === byKind('stash')[0]);
ok(gateOf(snapFailed) && gateOf(snapFailed.ack) && snapFailed.ack.acked === false && gateOf(snapFailed.run) && gateOf(/failed to render/.test(snapFailed.run.lastLine)) && gateOf(snapFailed.ownerSession) && verdictOf(snapFailed.ownerSession.conversationId), 'a snapshot carries ack + run.lastLine + ownerSession (the fold key)');
const attention = list0.body.jobs.filter((j) => M.attentionOf(j) === 'unacked-failure' || M.attentionOf(j) === 'awaiting').length;
ok(attention === unackedAtBoot.length + 1, `attention = unacknowledged failures + awaiting-user = ${attention} (the badge no longer says 36!)`);

// ── §2 /seen stamps user-opened; markAck first wins; the drain stamps notified ──
console.log('§2 acknowledgement stamps');
const target = byKind('stranger')[0];
const seen = await call('POST', '/api/jobs/:id/:act', { params: { id: target, act: 'seen' } });
ok(seen.status === 200 && seen.body.changed === true && seen.body.ack.by === 'user-opened', 'POST /api/jobs/:id/seen stamps user-opened on an unacknowledged failure');
ok(verdictOf(bc1.some((m) => m.type === 'jobs-updated' && m.id === target)), '…and broadcasts jobs-updated for the record');
const seenAt = jm.jobs.get(target).ack.at;
const seen2 = await call('POST', '/api/jobs/:id/:act', { params: { id: target, act: 'seen' } });
ok(seen2.body.changed === false && jm.jobs.get(target).ack.at === seenAt, 'a second /seen changes nothing — the FIRST acknowledgement wins');
ok(!jm.markAck(jm.jobs.get(fx.ids.running), 'user-opened') && !jm.markAck(jm.jobs.get(fx.ids.service), 'user-opened'), 'a running task and a service refuse the stamp (not terminal one-shots)');
const seenRun = await call('POST', '/api/jobs/:id/:act', { params: { id: fx.ids.running, act: 'seen' } });
ok(seenRun.status === 200 && seenRun.body.changed === false, '/seen on a running job is a harmless no-op');
const stashCid = jm.jobs.get(byKind('stash')[0]).owner.conversation.id;
const drained = jm.drainNotifs(stashCid);
ok(drained.length >= 1 && verdictOf(byKind('stash').filter((id) => jm.jobs.get(id).owner.conversation.id === stashCid).every((id) => ackBy(id) === 'notified')), 'draining the stash into a resume stamps notified on the jobs it named');
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
  ok(gateOf(M.agentReadAcks(j, owner)) && !M.agentReadAcks(j, stranger) && !M.agentReadAcks(j, owner, { selfJob: true }), 'agentReadAcks: owner lineage yes, stranger no, jbt_ self no');
  const src = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf-8');
  ok(verdictOf(/jobModel\.agentReadAcks\(job, a\.caller, \{ selfJob: !!a\.selfJob \}\)\) a\.jm\.markAck\(job, 'agent-read'\)/.test(src)), "WIRING PIN: GET /api/agent/jobs/:ref stamps 'agent-read' through agentReadAcks (never a second predicate)");
}

{ // a codex-owned failure notified on the ladder's 'rpc-queue' lane is acknowledged in the SERVED snapshot (verifier 2026-09-16: ACK_LANES lacked the codex lane ⇒ every codex-owned failure stayed red for ever and never archived)
  const j = strip(jm.jobs.get(byKind('stash')[0])); delete j.ack; // §2's drain stamped this row; the leg is about the JOURNAL rule
  j.id = 'jb-codexowned'; j.name = 'codex render'; j.notifyLog = [{ ts: M.terminalAt(j) + 500, lane: 'rpc-queue', ok: true, to: 'peer' }];
  jm.jobs.set(j.id, j);
  const l = await call('GET', '/api/jobs');
  const snap = l.body.jobs.find((x) => x.id === j.id);
  ok(gateOf(snap) && gateOf(snap.ack) && snap.ack.acked === true && snap.ack.by === 'notified' && M.attentionOf(snap) === 'acked-failure', "a failure delivered LIVE on the codex lane (rpc-queue, ok:true) is served acknowledged — never a red badge");
  jm.jobs.delete(j.id);
}

// ── §3 the sweep with an injected clock ──
console.log('§3 archival: who archives, who stays, one broadcast per sweep');
policy.doneAfterHours = 24; policy.failedAfterDays = 7;
bc1.length = 0;
const r25 = sweepNow(jm, { now: T0 + 25 * H });
const doneIds = fx.jobs.filter((j) => j.kind === 'task' && j.state === 'done' && !j.cronParent).map((j) => j.id);
ok(r25.archived.length === doneIds.length && verdictOf(doneIds.every((id) => r25.archived.includes(id))), `+25 h: exactly the ${doneIds.length} done one-shots archive`);
ok(verdictOf(failedIds.every((id) => jm.jobs.has(id))), 'no failed row archives at +25 h (the failed clock is 7 d after the ACK)');
ok(verdictOf([fx.ids.running, fx.ids.awaiting, fx.ids.service, fx.ids.cron, fx.ids.cronChild].every((id) => jm.jobs.has(id))), 'running / awaiting-user / service / cron parent / active cron child all stay');
ok(bc1.filter((m) => m.type === 'jobs-updated' && Array.isArray(m.archived)).length === 1, 'the sweep broadcasts jobs-updated ONCE, not per record');
const store25 = readStore(dir1), arch25 = readArchive(dir1);
ok(!store25.some((j) => doneIds.includes(j.id)) && verdictOf(doneIds.every((id) => arch25.some((r) => r.id === id))), 'EXIT: the done rows are gone from jobs.json and present in jobs-archive.json');
ok(verdictOf(arch25.every((r) => r.archivedAt === T0 + 25 * H && r.archivedWhy === 'done' && r.runs && r.notifyLog)), 'an archived record keeps runs/notifyLog and gains archivedAt + archivedWhy');
ok(sweepNow(jm, { now: T0 + 25 * H + 1 }).archived.length === 0, 'a second sweep at the same clock moves nothing (idempotent)');
// acked failures: 7 d after the ACK; unacked: never
const r8d = sweepNow(jm, { now: T0 + 8 * D + H });
ok(verdictOf(ackedAtBoot.concat([target]).every((id) => r8d.archived.includes(id))), '+8 d: every ACKNOWLEDGED failure (notified / agent-read / user-opened, incl. the /seen one) archives with why=failed-acknowledged');
ok(verdictOf(r8d.archived.every((id) => jm.archivedById(id).archivedWhy === 'failed-acknowledged')), '…each carrying why=failed-acknowledged');
const stillUnacked = failedIds.filter((id) => jm.jobs.has(id));
ok(gateOf(stillUnacked.length) && verdictOf(stillUnacked.every((id) => ackBy(id) === null)), `the ${stillUnacked.length} unacknowledged failures stay`);
ok(sweepNow(jm, { now: T0 + 400 * D }).archived.filter((id) => stillUnacked.includes(id)).length === 0 && verdictOf(stillUnacked.every((id) => jm.jobs.has(id))), 'an UNACKNOWLEDGED failure never archives — not at +400 d either');
// the cron child follows its schedule
ok(verdictOf(jm.jobs.has(fx.ids.cronChild)), 'the cron child stayed while its parent schedules fires (it IS the run ring)');
jm.jobs.get(fx.ids.cron).desiredUp = false;
ok(verdictOf(sweepNow(jm, { now: T0 + 400 * D }).archived.includes(fx.ids.cronChild)), '…and archives once the schedule is stopped');
// 0 = never
policy.doneAfterHours = 0;
{
  const j = { ...strip(fx.jobs[0]), id: 'jb-zero0', name: 'export-zero' };
  jm.jobs.set(j.id, j);
  ok(sweepNow(jm, { now: T0 + 400 * D }).archived.length === 0 && verdictOf(jm.jobs.has(j.id)), 'jobs.archiveDoneAfterHours = 0 archives no done record');
  policy.doneAfterHours = 24;
  ok(verdictOf(sweepNow(jm, { now: T0 + 400 * D }).archived.includes(j.id)), '…and the default policy archives it');
}
// live pid / open interaction never archive (the pure verdict, pinned through the engine)
ok(gateOf(jm.jobs.has(fx.ids.awaiting)) && sweepNow(jm, { now: T0 + 400 * D }).archived.length === 0, 'an awaiting-user job with an open panel is never archived');

// ── §4 read-through: a held id never 404s; the same shape ──
console.log('§4 read-through + routes');
const oldId = doneIds[0];
const g = await call('GET', '/api/jobs/:id', { params: { id: oldId }, query: { tail: 5 } });
ok(g.status === 200 && g.body.job.archived === true && g.body.job.id === oldId && g.body.job.archivedWhy === 'done' && 'run' in g.body.job && 'ack' in g.body.job, 'GET /api/jobs/:id of an ARCHIVED id answers 200 with archived:true and the live snapshot shape');
const live = list0.body.jobs.find((j) => j.id === oldId);
const shapeKeys = (o) => Object.keys(o).filter((k) => !['archived', 'archivedAt', 'archivedWhy', 'envKeys', 'envFrom', 'ownerSession', 'access', 'runs', 'interaction', 'logTail'].includes(k)).sort().join(',');
ok(shapeKeys(g.body.job) === shapeKeys(live), 'the archived snapshot carries every key the live snapshot carries (plus the archive marks)');
const la = await call('GET', '/api/jobs', { query: { archived: '1' } });
ok(la.status === 200 && la.body.archived === true && la.body.jobs.length === jm.archivedCount() && verdictOf(la.body.jobs.every((j) => j.archived === true && j.archivedAt)), 'GET /api/jobs?archived=1 lists the archive (same shape + archivedAt)');
const l2 = await call('GET', '/api/jobs');
ok(l2.body.archivedCount === jm.archivedCount() && !l2.body.jobs.some((j) => j.id === oldId), 'the live list carries archivedCount and no archived row');
const bad = await call('POST', '/api/jobs/:id/:act', { params: { id: oldId, act: 'start' } });
ok(bad.status === 400 && verdictOf(/archived/.test(bad.body.error)), 'an action other than rm on an archived id is refused BY NAME (400, never a 404)');
const seenArc = await call('POST', '/api/jobs/:id/:act', { params: { id: oldId, act: 'seen' } });
ok(seenArc.status === 200 && seenArc.body.archived === true && seenArc.body.changed === false, '/seen on an archived id is a no-op that says so');
fs.mkdirSync(path.join(dir1, 'job-logs', oldId), { recursive: true }); fs.writeFileSync(path.join(dir1, 'job-logs', oldId, 'x'), '1');
const rm = await call('POST', '/api/jobs/:id/:act', { params: { id: oldId, act: 'rm' } });
ok(rm.status === 200 && !jm.archivedById(oldId) && !readArchive(dir1).some((r) => r.id === oldId) && !fs.existsSync(path.join(dir1, 'job-logs', oldId)), '✕ on an archived row deletes it for good (record + log dir) and persists');
ok(verdictOf(bc1.some((m) => m.type === 'jobs-updated' && m.id === oldId && m.removed === true && m.archived === true)), '…and broadcasts the removal');
ok((await call('GET', '/api/jobs/:id', { params: { id: oldId } })).status === 404, 'a deleted archived id is a real 404');

// ── §5 a restart re-reads the archive ──
console.log('§5 restart');
jm.shutdown();
fs.rmSync(path.join(dir1, 'jobs.lock'), { force: true });
const B = new JobManager({ dataDir: dir1, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
B.init();
ok(B.archivedCount() === readArchive(dir1).length && gateOf(B.archivedById(doneIds[1])) && B.archivedById(doneIds[1]).archivedWhy === 'done', 'a fresh engine over the same dir reads the archive back');
ok(!B.jobs.has(doneIds[1]) && verdictOf(stillUnacked.every((id) => B.jobs.has(id) && M.ackState(B.jobs.get(id)).acked === false)), 'the live store still holds only the unarchived records; the unacked failures survive the restart unacknowledged');
ok(B.jobs.get(target) === undefined && gateOf(B.archivedById(target)) && gateOf(B.archivedById(target).ack) && B.archivedById(target).ack.by === 'user-opened', 'the /seen stamp travelled into the archive with its record');
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
  flushU4(); flushU4();   // B-0248 step 3: the boot sweep's archive lands (the store writer), then jobs.json's save
  const arch = readArchive(dir2);
  ok(arch.length === ARCHIVE_CAP && C.jobs.size === 0, `${N} archived at once ⇒ the file holds exactly ARCHIVE_CAP=${ARCHIVE_CAP}`);
  const kept = new Set(arch.map((r) => r.id));
  ok(gateOf(rows.slice(0, ARCHIVE_CAP).every((r) => kept.has(r.id))) && verdictOf(rows.slice(ARCHIVE_CAP).every((r) => !kept.has(r.id))), 'the cap keeps the NEWEST records (by terminal instant) and drops the oldest');
  await C.logsSettled();   // lane job-logs-sweep: the cap's removal runs in the remover's worker (never on the main thread) — waited for here
  ok(gateOf(rows.slice(-5).every((r) => !fs.existsSync(path.join(dir2, 'job-logs', r.id)))) && verdictOf(fs.existsSync(path.join(dir2, 'job-logs', rows[0].id))), 'a cap-dropped record loses its log dir; a kept one keeps it');
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
  fs.mkdirSync(tmp); fs.mkdirSync(tmp + '-w'); // B-0248 step 3: both temp names (this thread's, the store writer thread's) are directories ⇒ the write fails EISDIR
  const logs = [], bcs = [];
  const E = new JobManager({ dataDir: dir3, broadcast: (t, p) => bcs.push({ t, p }), notifyUser: () => { }, log: (...a) => logs.push(a.join(' ')), archivePolicy: () => policy });
  E.init(); // the boot sweep hands the archive at the real clock — the storage refuses it: it must fail LOUDLY, releasing nothing
  flushU4(); flushU4();   // the writer tries it (refused) — B-0248 step 3: the records leave only at a LANDING
  const onDisk3 = () => JSON.parse(fs.readFileSync(path.join(dir3, 'jobs.json'), 'utf-8'));
  ok(E.jobs.size === N && onDisk3().length === N, `every record is still LIVE in memory and on disk (${E.jobs.size} / ${onDisk3().length} of ${N})`);
  ok(readArchive(dir3) === null, 'no archive file was written');
  ok(gateOf(logs.some((l) => /archive write FAILED/.test(l) && /EISDIR/.test(l))) && !logs.some((l) => /archived \d+ one-shot/.test(l)), 'the log says the write FAILED with the verbatim error and never claims "archived N"');
  ok(!bcs.some((b) => b.t === 'jobs-updated' && b.p && b.p.archived), 'no jobs-updated {archived} broadcast for a sweep that moved nothing');
  // CONTROL (the cheap wrong direction — a sweep that never moves anything):
  // with the obstruction gone the writer's write AGAIN lands and moves all N
  fs.rmdirSync(tmp); fs.rmdirSync(tmp + '-w');
  flushU4(); flushU4();
  ok(E.jobs.size === 0 && readStore(dir3).length === 0 && readArchive(dir3).length === N, `…and once the archive is writable, the store writer's write again lands and moves all ${N} (a retry, not a loss)`);
  E.shutdown();
  // a store flush that failed AFTER a successful archive write brings the record back at the next boot: the re-archive REPLACES its older copy, never duplicates it
  fs.writeFileSync(path.join(dir3, 'jobs.json'), JSON.stringify([rows[0]]));
  fs.rmSync(path.join(dir3, 'jobs.lock'), { force: true });
  const E2 = new JobManager({ dataDir: dir3, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
  E2.init(); // the boot sweep re-archives rows[0] at the real clock
  flushU4(); flushU4();   // B-0248 step 3: the boot sweep's archive lands (the store writer), then jobs.json's save
  const arch = readArchive(dir3);
  ok(E2.jobs.size === 0 && arch.length === N && arch.filter((a) => a.id === rows[0].id).length === 1, `a record re-archived after a failed store flush replaces its archive copy (${arch.length} = ${N}, one copy of ${rows[0].id})`);
  E2.shutdown();
}

// ── §7 the sweep cadence rides the existing tick ──
console.log('§7 cadence + pins');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  ok(gateOf(/now\(\) - this\._lastArchiveSweep >= ARCHIVE_SWEEP_MS/.test(src)) && !/setInterval\([^)]*archiveSweep/.test(src), 'the archive cadence is a clause of _sweep (5 s tick), never a second timer');
  ok(ARCHIVE_SWEEP_MS === 5 * 60 * 1000, 'ARCHIVE_SWEEP_MS = 5 min');
  ok(verdictOf(/archiveSweep\(\{ why: 'boot' \}\)/.test(src)), 'the boot sweep runs inside init()');
  const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf-8');
  ok(gateOf(/req\.query\.archived/.test(ar)) && verdictOf(/findVisibleIn\(a\.jm\.archivedList\(\), a\.caller, ref\)/.test(ar)), 'agent routes: ?archived=1 list + read-through of an archived ref (view-filtered by the SAME predicate)');
  const cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf-8');
  ok(gateOf(/flags\.archived \? '\?archived=1'/.test(cli)) && verdictOf(/--archived/.test(cli)), 'the CLI sends ?archived=1 for list --archived');
  const schema = fs.readFileSync(path.join(ROOT, 'src/lib/settings-schema.js'), 'utf-8');
  ok(gateOf(/'jobs\.archiveDoneAfterHours': \{[\s\S]*?default: 24/.test(schema)) && gateOf(/'jobs\.archiveFailedAfterDays': \{[\s\S]*?default: 7/.test(schema)) && verdictOf(/t\('Background Work'\),\n  t\('Spending'\)/.test(schema)), 'the two archive settings exist with the owner defaults and their category is in SETTINGS_CATEGORIES');
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
  ok(out1.status === 0 && gateOf(out1.stdout.includes(rec.id)) && verdictOf(/\(archived/.test(out1.stdout)), 'vibespace-job list --archived prints the archived rows marked (archived …)', out1.stdout + out1.stderr);
  const out2 = await run(['poll', rec.id]);
  ok(out2.status === 0 && gateOf(/\(archived .* — done/.test(out2.stdout)) && verdictOf(out2.stdout.includes(`${rec.id} ${rec.name}`)), 'vibespace-job poll <archived id> answers (state + the archived marker), never a not-found', out2.stdout + out2.stderr);
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
  ok(q.length === 1 && gateOf(q[0].held) && q[0].held.kind === 'spend-cap' && q[0].held.why === 'hour-cap' && q[0].held.identity === 'Member A' && q[0].held.cap === 12 && q[0].held.retryAfter === T0 + 3600e3, 'a spend-cap refusal stashes a TYPED entry: spend-cap / hour-cap / the slot / the ceiling', JSON.stringify(q[0] && q[0].held));
  const dg = J.heldDigest();
  ok(dg.total === 1 && gateOf(dg.byConversation[cid]) && dg.byConversation[cid].kinds['spend-cap'] === 1 && dg.byConversation[cid].reason.identity === 'Member A', 'heldDigest reports it per conversation with the typed reason');
  ok(verdictOf(bc.some((m) => m.type === 'jobs-updated' && m.held && m.held.byConversation && m.held.byConversation[cid])), 'the jobs-updated broadcast that followed CARRIES the held digest (one signal, one computation)');
  // the rate floor types rate-floor; an unreachable inbox types not-reachable
  J.d.deliverToConversation = async () => ({ ok: false, reason: 'no live inbox for this conversation on any reachable machine' });
  J._notifyOwner(job, { what: 'failed exit=1 error (2m)' }); // inside the 30 s floor ⇒ rate-floor
  await new Promise((r) => setTimeout(r, 20));
  ok(verdictOf((J.pendingNotifs.get(cid) || []).some((n) => n.held && n.held.kind === 'rate-floor')), 'a floored event is held as rate-floor');
  J._notifyRate.clear();
  J._notifyOwner(job, { what: 'failed exit=1 error (3m)' });
  await new Promise((r) => setTimeout(r, 50));
  ok(verdictOf((J.pendingNotifs.get(cid) || []).some((n) => n.held && n.held.kind === 'not-running')), 'a conversation with no live inbox is held as not-running (lane notify-retry: the old `not-reachable` printed "closed" for a running one)');
  const g3 = await callH('GET', '/api/jobs');
  ok(gateOf(g3.body.held) && g3.body.held.total === 3 && g3.body.held.byConversation[cid].count === 3, 'GET /api/jobs carries the same digest');
  // draining CLEARS the chip: the digest empties on the next broadcast
  bc.length = 0;
  J.drainNotifs(cid);
  ok(J.heldDigest().total === 0 && verdictOf(bc.some((m) => m.type === 'jobs-updated' && m.drained === cid && m.held && m.held.total === 0)), 'a drain empties the digest and broadcasts it empty (the chip clears)');
  // an OLD stash entry written by a build before typing reads as not-reachable
  ok(M.heldDigest({ c: [{ jobId: 'x', ts: 1 }] }).byConversation.c.reason.kind === 'not-reachable', 'a legacy stash entry with no `held` reads as not-reachable (never dropped)');
  // wiring pins: the chip + the ladder's typed refusal
  const csb = fs.readFileSync(path.join(ROOT, 'src/lib/chat-status-bar.js'), 'utf-8');
  const cv = fs.readFileSync(path.join(ROOT, 'src/lib/chat-view.js'), 'utf-8');
  const lad = fs.readFileSync(path.join(ROOT, 'src/server/conversation-deliver.js'), 'utf-8');
  ok(gateOf(/setJobsHeld\(text\)/.test(csb)) && gateOf(/chat-status-held/.test(csb)) && gateOf(/msg\.type === 'jobs-updated' && msg\.held/.test(cv)) && verdictOf(/heldText\(digest, \{ t, cid \}\)/.test(cv)), 'WIRING PIN: the status bar has the held chip and the live ChatView feeds it from jobs-updated.held for ITS conversation');
  ok(verdictOf(/refused: 'spend', why: v\.why, retryAfter: v\.retryAfter \|\| 0, identity: v\.identity \?/.test(lad)), "WIRING PIN: the ladder's spend refusal carries the identity + the ceiling the stash needs");
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
  ok(gateOf(r1.expired) && r1.a1 === 1 && r1.a2 === 2 && r1.stale.code === 'stale-panel' && gateOf(/panel #1/.test(r1.stale.error)) && gateOf(/panel #2/.test(r1.stale.error)) && r1.pendingTitle === 'Delete the production backup bucket?' && r1.recorded.length === 0, 'r6 D-F5: after panel #1 EXPIRED the next panel is #2 (never 1 again); a stale click on #1 is refused stale-panel BY NAME — nothing recorded, panel #2 still waits', JSON.stringify(r1));
  // the user route: named refusals with their codes
  const rNo = await callP('POST', '/api/jobs/:id/:act', { params: { id: job1.id, act: 'answer' }, body: { answers: { button: 'yes' } } });
  const rStale = await callP('POST', '/api/jobs/:id/:act', { params: { id: job1.id, act: 'answer' }, body: { answers: { button: 'yes', version: 1 } } });
  ok(rNo.status === 400 && rNo.body.code === 'version-required' && rStale.status === 409 && rStale.body.code === 'stale-panel' && rStale.body.version === 2 && verdictOf(job1.interaction.pending), 'r6 D-F5: POST …/answer with NO version ⇒ 400 version-required; with panel #1\'s ⇒ 409 stale-panel (+ the panel it waits on) — panel #2 still pending', JSON.stringify({ rNo: rNo.body, rStale: rStale.body }));
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
  ok(gateOf(j2) && j2.interaction.seq >= 3 && gateOf(a4) && a4.version === 4, 'r6 D-F5: after a RESTART the next panel is #4 — the count survived in the store', JSON.stringify({ seq: j2 && j2.interaction.seq, a4 }));
  J2.shutdown();
  // CONTROL (scripts/mutant-copy.mjs): the pre-fix engine — version = pending + 1 (1 again after an expiry) and an answer
  // with a matching (or missing) version accepted ⇒ the stale click on #1 is recorded as the answer to #2
  const MJ = mutantCopies('jobs-panel-r6', ROOT);
  const jsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  const seqLines = "    const version = M.nextInteractionSeq(job.interaction);\n    job.interaction.seq = version;\n";
  const gateLines = "    const vv = M.answerVersionVerdict(p, answers);\n    if (!vv.ok) return { error: vv.error, code: vv.code, ...(p ? { version: p.version } : {}) };\n";
  ok(jsrc.split(seqLines).length === 2 && jsrc.split(gateLines).length === 2, 'r6 D-F5 control setup: the seq and the answer\'s verdict are each wired once');
  const JMod = MJ.load('src/jobs.js', editAnchor(editAnchor(jsrc, seqLines, "    const version = ((job.interaction && job.interaction.pending && job.interaction.pending.version) || 0) + 1; // MUTANT: pre-fix\n", "src/jobs.js"), gateLines, "    if (!p) return { error: 'no pending panel' };\n    if (answers.version && answers.version !== p.version) return { error: 'stale panel version — reopen the panel' }; // MUTANT: pre-fix\n", "src/jobs.js"), 'pre-fix');
  const dir5 = mkDir('jobs-triage-panel-mut');
  const JX = new JMod.JobManager({ dataDir: dir5, broadcast: () => { }, notifyUser: () => { }, log: () => { }, archivePolicy: () => policy });
  JX.init();
  const rx = await staleLeg(JX, mkJob('jb-panel0002'));
  const noVer = (() => { const j = mkJob('jb-panel0003'); JX.jobs.set(j.id, j); JX.ask(j, panel('x')); return JX.answerPanel(j, { button: 'yes' }); })();
  ok(rx.a1 === 1 && rx.a2 === 1 && rx.stale.ok === true && rx.recorded.join() === 'yes@1' && noVer.ok === true, 'r6 D-F5 CONTROL (the pre-fix engine, in a copy): panel #2 is "version 1" again, the stale click on #1 is RECORDED as the answer to "Delete the production backup bucket?", and a version-less answer is accepted — the monotonic seq + the named refusal are the rule', JSON.stringify({ rx, noVer }));
  JX.shutdown();
  for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'r6 D-F5 ' })) ok(verdictOf(r.pass), r.name + (r.pass ? '' : ' — ' + r.detail));
  // WIRING PINS: the panel sends the version it rendered; the CLI prints the panel's number
  const jp = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf-8'), cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf-8');
  ok(gateOf(/const version = pending\.version;/.test(jp)) && gateOf(/answers: \{ \.\.\.values, button: o\.id, version \}/.test(jp)) && gateOf(/r2\.code === 'stale-panel'/.test(jp)) && verdictOf(/posted\.version/.test(cli)), 'WIRING PIN (r6 D-F5): the panel answers with the version it rendered (and re-reads on stale-panel); the CLI prints the panel\'s number');
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
  ok(it.length === 1 && it[0].kind === 'notice' && it[0].origin === 'jobs' && it[0].sessionKey === 'claude:conv-drop' && gateOf(/were dropped — 30 were already waiting/.test(it[0].text)) && gateOf(/^1 dropped, never delivered \(from: nightly\)/.test(it[0].detail || '')) && it[0].sessionName === 'house model · Background Work',
    'the first eviction files ONE For-you notice (origin jobs, kind notice) under the owner conversation: how many, from which jobs, that the 30 still wait', it.map((i) => ({ text: i.text, detail: i.detail, kind: i.kind, sessionName: i.sessionName })));
  ok(gateOf(it[0].i18n) && gateOf(/\{cap\} were already waiting/.test(it[0].i18n.text.key)) && it[0].i18n.text.params.cap === 30, '…worded per device (i18n key + params)', it[0].i18n);
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
    ok(n1.length === 1 && n2.length === 1 && n2[0].status === 'dismissed' && verdictOf(r2.lg.some((l) => /fell off the 30-entry cap/.test(l))),
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
  ok(skel(A) === 'jb-5ke1e701,jb-5ke1e703' && asideOf(d12).length === 1 && verdictOf(fs.readFileSync(path.join(d12, asideOf(d12)[0]), 'utf-8').startsWith('[{"id":"jb-5ke1e701"')), 'B-ef97: a torn store is set aside (its bytes kept) and rebuilt as skeletons from the log dirs — never one for an id the archive holds', skel(A));
  ok(at1 === 'jb-5ke1e701,jb-5ke1e703', 'B-ef97: the skeletons are ON DISK when init returns (was: memory only)', at1);
  A.shutdown();
  ok(fs.readFileSync(path.join(d12, 'job-notifications.json'), 'utf-8') === TORN_NOTIFS, 'B-ef97: the write-back writes jobs.json ALONE — a notifications file that did not load is not written over by it (nor by the exit)');
  const { jm: B } = boot(d12);
  ok(skel(B) === 'jb-5ke1e701,jb-5ke1e703' && B.jobs.get('jb-5ke1e701').note === LSm.RECOVERED_NOTE, 'B-ef97: AFTER A RESTART the recovered skeletons are still listed (was: the store loaded empty, the jobs vanished)', skel(B));
  // B-2204: a skeleton is the person's alone — owner-less, view 'session': no conversation lists it, the person does
  const sk = B.jobs.get('jb-5ke1e701'), agent = { conversationId: 'conv-any', sessionId: 'sess-any', sessionCreatedAt: 1, groups: new Set(['g-any']) };
  ok(sk.access.view === 'session' && sk.access.control === 'session' && Object.keys(sk.owner).length === 0 && !M.canView(sk, agent) && gateOf(M.canView(sk, { isUser: true })) && !M.visibleJobs([...B.jobs.values()], agent).some((j) => LSm.isSkeleton(j)), 'B-2204: a recovered skeleton is owner-less with view \'session\' — no conversation can view it (was \'all\': every one), the person can', sk.access);
  B.shutdown();
  // B-2204: a skeleton the RELEASE wrote (view 'all' — its _save wrote memory whenever anything dirtied the store) is read back the person's alone
  const d12m = mkDir('jobs-triage-skel-migrate');
  const oldSkel = (id) => ({ id, kind: 'task', name: id, state: 'unverified', note: LSm.RECOVERED_NOTE, owner: {}, access: { view: 'all', control: 'session' }, runs: [] });
  fs.writeFileSync(path.join(d12m, 'jobs.json'), JSON.stringify([oldSkel('jb-5ke1e7m1')]));
  fs.writeFileSync(path.join(d12m, 'jobs-archive.json'), JSON.stringify([{ ...oldSkel('jb-5ke1e7m2'), archivedAt: T0 - D, archivedWhy: 'unverified-acknowledged' }]));
  const { jm: Mg } = boot(d12m);
  const mArch = Mg._loadArchive().find((r) => r.id === 'jb-5ke1e7m2');
  ok(Mg.jobs.get('jb-5ke1e7m1').access.view === 'session' && gateOf(mArch) && mArch.access.view === 'session' && !M.canView(Mg.jobs.get('jb-5ke1e7m1'), agent) && !M.canView(mArch, agent), 'B-2204: a skeleton the release wrote with view \'all\' (store and archive) is read back owner-less, view \'session\'');
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
  const swr = sweepNow(Sw, { now: T0 });
  const realOne = Sw._loadArchive().find((r) => r.id === 'jb-5ke1e7s1');
  ok(!swr.archived.length && gateOf(realOne) && realOne.name === 'the real one' && !Sw.jobs.has('jb-5ke1e7s1'), 'B-ef97: an acknowledged skeleton whose id the archive holds leaves the store — it never replaces the archived record', { swr, name: realOne && realOne.name });
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
  ok(verdictOf([accLine, dropLine, guardLine].every((x) => jsrc.split(x).length === 2)), 'B-ef97 / B-2204 control setup: the read-back access, the archive\'s drop and the sweep\'s guard are each written once');
  const JMod = MJ.load('src/jobs.js', editAnchor(editAnchor(editAnchor(editAnchor(editAnchor(jsrc, owedLine, '    // MUTANT: the release — skeletons in memory only\n', "src/jobs.js"), viewLine, "access: { view: 'all', control: 'session' }, runs: [] }); // MUTANT: the release\n", "src/jobs.js"),
    accLine, 'const skeletonAccess = (j) => j; // MUTANT: no read-back\n', "src/jobs.js"), dropLine, '      // MUTANT: no drop\n', "src/jobs.js"), guardLine, '      if (!this.jobs.has(id)) moved.splice(i, 1); // MUTANT: no guard\n', "src/jobs.js"));
  const d12c = mkDir('jobs-triage-torn-mut');
  seedTorn(d12c);
  const mk = () => { const J = new JMod.JobManager({ dataDir: d12c, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy }); J.init(); return J; };
  const X1 = mk(); const x1 = skel(X1); const xv = X1.jobs.get('jb-5ke1e701'); const xSeen = !!xv && M.canView(xv, { conversationId: 'conv-any', sessionId: 'sess-any', sessionCreatedAt: 1, groups: new Set() }); X1.shutdown();
  const X2 = mk(); const x2 = skel(X2); X2.shutdown();
  ok(x1 === 'jb-5ke1e701,jb-5ke1e703' && x2 === '', 'B-ef97 CONTROL (the release, in a copy): the skeletons of boot 1 are GONE after a restart', { x1, x2 });
  ok(verdictOf(xSeen), 'B-2204 CONTROL (the release, in a copy): any conversation can view a recovered skeleton (view \'all\')');
  const dXm = mkDir('jobs-triage-skel-migrate-mut');
  fs.writeFileSync(path.join(dXm, 'jobs.json'), JSON.stringify([oldSkel('jb-5ke1e7m1')]));
  const XM = new JMod.JobManager({ dataDir: dXm, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy }); XM.init();
  ok(XM.jobs.get('jb-5ke1e7m1').access.view === 'all', 'B-2204 CONTROL (no read-back, in a copy): a skeleton the release wrote stays view \'all\'');
  XM.shutdown();
  const dXs = mkDir('jobs-triage-skel-sweep-mut');
  fs.writeFileSync(path.join(dXs, 'jobs-archive.json'), JSON.stringify([{ id: 'jb-5ke1e7s1', kind: 'task', name: 'the real one', state: 'done', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: T0 - 9 * D, endedAt: T0 - 9 * D + 1 }], archivedAt: T0 - 8 * D, archivedWhy: 'done' }]));
  const XS = new JMod.JobManager({ dataDir: dXs, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy }); XS.init();
  XS.jobs.set('jb-5ke1e7s1', { ...oldSkel('jb-5ke1e7s1'), ack: { by: 'user-opened', at: T0 - 10 * D } });
  sweepNow(XS, { now: T0 });
  const xReal = XS._loadArchive().find((r) => r.id === 'jb-5ke1e7s1');
  ok(gateOf(xReal) && xReal.name === 'jb-5ke1e7s1', 'B-ef97 CONTROL (no guard, in a copy): the acknowledged skeleton is archived OVER the real record (its name is gone)', xReal && xReal.name);
  XS.shutdown();
  const dXr = mkDir('jobs-triage-skel-archive-late-mut'), AFx = path.join(dXr, 'jobs-archive.json');
  seedTorn(dXr);
  fs.readFileSync = function (f, ...a) { if (String(f) === AFx) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf12.call(this, f, ...a); };
  let XR; try { XR = new JMod.JobManager({ dataDir: dXr, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, unreadRetry: { firstMs: 5, maxMs: 10 } }); XR.init(); } finally { fs.readFileSync = rf12; }
  const tx = Date.now(); while (XR._unread.archive && Date.now() - tx < 3000) await new Promise((r) => setTimeout(r, 10));
  ok(!XR._unread.archive && verdictOf(skel(XR).includes('jb-5ke1e7a2')), 'B-ef97 CONTROL (no drop, in a copy): the skeleton of the archived id stays after the archive answers', skel(XR));
  if (XR._logsNoteP) await XR._logsNoteP;
  XR.shutdown();
  for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'B-ef97 ' })) ok(verdictOf(r.pass), r.name + (r.pass ? '' : ' — ' + r.detail));
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
    ok(gateOf(atBoot) && gateOf(G.jobs.has('jb-c17d0c01')) && G.jobs.get('jb-c17d0c01').runs.length === 1, 'B-c17d: the gc KEEPS a monthly cron\'s child whose last run ended 20 days ago — its parent still schedules fires (was: deleted with its run list and journal)');
    ok(!G.jobs.has('jb-c17d0c02') && !G.jobs.has('jb-c17d0t03') && !G.jobs.has('jb-c17d0c04'), 'B-c17d: …and still collects a child whose cron is turned off, the child of a FIRED --at cron (it schedules nothing more) and a plain done task past 14 days');
    G.shutdown();
    // CONTROL (scripts/mutant-copy.mjs): the release's gc — leg (a) never asks the parent
    const MJ = mutantCopies('jobs-cron-gc-c17d', ROOT);
    const jsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
    const guard = '      if (this._cronParentActive(job)) return false;\n';   // B-360d: the pass asks it in its `collectable` predicate
    ok(jsrc.split(guard).length === 2, 'B-c17d control setup: the gc asks the parent on one line');
    const JMod = MJ.load('src/jobs.js', editAnchor(jsrc, guard, '      // MUTANT: the release — the gc never asks the parent\n', "src/jobs.js"));
    const d13c = mkDir('jobs-triage-cron-gc-mut'); seed(d13c);
    const X = new JMod.JobManager({ dataDir: d13c, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy });
    X.init(); await X._gc({ now: T0 });
    ok(!X.jobs.has('jb-c17d0c01'), 'B-c17d CONTROL (the release, in a copy): the gc deletes the live monthly cron\'s child between two fires');
    X.shutdown();
    const atLine = "    return !!p && p.desiredUp !== false && p.state !== 'missed' && p.state !== 'done';\n";
    ok(jsrc.split(atLine).length === 2, 'B-c17d control setup: a fired --at cron is not active, on one line');
    const JAt = MJ.load('src/jobs.js', editAnchor(jsrc, atLine, "    return !!p && p.desiredUp !== false && p.state !== 'missed'; // MUTANT: a fired --at counts as active\n", "src/jobs.js"), 'at');
    const d13a = mkDir('jobs-triage-cron-gc-at-mut'); seed(d13a);
    const XA = new JAt.JobManager({ dataDir: d13a, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy });
    XA.init(); await XA._gc({ now: T0 });
    ok(verdictOf(XA.jobs.has('jb-c17d0c04')), 'B-c17d CONTROL (a fired --at counted active, in a copy): its child is kept FOR EVER — neither archived nor collected');
    XA.shutdown();
    for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 2, label: 'B-c17d ' })) ok(verdictOf(r.pass), r.name + (r.pass ? '' : ' — ' + r.detail));
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
  A._dirty = true; A._save(); landedU4();   // U4: whatever the save handed the writer has landed — the mtime below sees a late write too
  ok(!readable && gateOf(A.ready) && gateOf(A._unread.store) && A._unread.store.code === codeA && A.jobs.size === 0 && asides(dA, 'jobs.json').length === 0 && fs.statSync(SF).mtimeMs === mt, 'B-f276: a store whose READ fails (EACCES, its stat answers) is kept as it is — NOT set aside (the release renamed the live file), and a save writes nothing over it', { unread: A._unread.store, asides: asides(dA, 'jobs.json') });
  ok(made.code === 'records-unread' && gateOf(new RegExp(`no job is created until they are read — jobs\\.json in VibeSpace's data folder could not be read \\(${codeA}\\).*For you says what to check`).test(made.error)) && !made.job, `B-f276: …and no job is created while the records are unread — the refusal NAMES ITS DOOR (the file, For you) [${codeA}]`, made);
  await until(() => A._unreadTries.store >= 3);   // three reads again, each failed
  if (A._logsNoteP) await A._logsNoteP;   // the clean-up's note, written by the remover's child
  const noteA = path.join(dA, 'jobs.json.corrupt-unread'), noteThere = fs.existsSync(noteA);
  ok(A._unreadTries.store >= 3 && A._logsUnread.store === codeA && lA.filter((l) => new RegExp(`jobs\\.json could not be read \\(${codeA}: the read failed\\) — kept as it is, never set aside`).test(l)).length === 1, 'B-f276: …the job-logs clean-up holds (its unread fact) and it is said ONCE — after three failed reads again too', { tries: A._unreadTries.store });
  unplant(SF, body, howA);   // the storage answers again
  const back = await until(() => !A._unread.store && A.jobs.has('jb-f2760a01') && A.jobs.has('jb-f2760a02'));
  const made2 = back ? A.create(spec, { isUser: true }) : null;
  ok(gateOf(back) && gateOf(made2) && gateOf(made2.job) && verdictOf(lA.some((l) => /jobs\.json read again after \d+ tr(y|ies): 2 record\(s\) — writes resume/.test(l))), 'B-f276: the store is READ AGAIN off the loop: its records are loaded, writes resume, a job can be created', { back, made2: made2 && (made2.error || 'ok') });
  // cure r1, the ruling: a read that ANSWERED and LOADED lifts what the failure filed — its note marked done, its item resolved
  const lifted = await until(() => !fs.existsSync(noteA) && fs.readdirSync(dA).some((n) => /^jobs\.json\.unread-done-\d+$/.test(n)));
  // r1679 (the load row — seen red at 717191cda-20261121224429-both, the box zone: both legs below, {"noteThere":true,"lifted":true,
  // "resolved":[]}): the note's RENAME is the lift's FIRST step (_unreadLift awaits _noteDone, then resolves the For-you items, files
  // the one true sentence and says its line) — on a loaded runner the legs read `told` and `resolved` between the rename and the rest.
  // They wait for the lift's OWN LAST WORD, its line, bounded (until's 3 s), and say so by name when it never came
  const liftEnded = await until(() => lA.some((l) => /jobs\.json was read again: its note jobs\.json\.corrupt-unread is marked done \(renamed\)/.test(l)));
  if (!liftEnded) console.log('    (the lift never said its line in 3 s — the two legs below read what stood then)');
  const told = filed.find((n) => n && n.fact === 'records-read-again');
  ok(!!told && told.urgency === 'low' && gateOf(/could not be read from \{when\} to \{until\} \(\{error\}\); VibeSpace read them again and nothing was lost/.test(told.words.key)) && gateOf(Number.isFinite(told.words.params.when.at)) && gateOf(Number.isFinite(told.words.params.until.at)) && told.words.params.until.at >= told.words.params.when.at && !/written over: keep the note/.test(told.words.key), 'B-f276 cure r2 (the ruling): the person who was told hears ONE TRUE SENTENCE — could not be read from … to …, read again, nothing lost (never «may already have been written over»)', told && told.words);
  ok(gateOf(noteThere) && gateOf(lifted) && A._logsUnread.store === null && resolved.length >= 1 && verdictOf(lA.some((l) => /jobs\.json was read again: its note jobs\.json\.corrupt-unread is marked done \(renamed\), 1 For-you item\(s\) resolved, the job-logs clean-up resumes/.test(l))), 'B-f276 cure (the ruling): the read again that loaded marks its note done (renamed — no hold reads it), resolves its For-you item, and the clean-up resumes', { noteThere, lifted, resolved });
  A.shutdown();
  ok(JSON.parse(fs.readFileSync(SF, 'utf-8')).map((j) => j.id).filter((id) => id.startsWith('jb-f2760a')).sort().join() === 'jb-f2760a01,jb-f2760a02', 'B-f276: …and the store on disk still holds every record it held (none written over)');
  }
  // A2. THE DOORS SAY WHY (cure r1): the panel's list, a job's page and a start answer «the records cannot be read», never nothing / «no such job»
  {
    const d = mkDir('jobs-triage-unread-routes'), F = path.join(d, 'jobs.json');
    plant(F, body, 'folder');
    const { jm: R, call: callR } = boot(d);
    const list = await callR('GET', '/api/jobs', {}), one = await callR('GET', '/api/jobs/:id', { params: { id: 'jb-f2760a01' } }), act = await callR('POST', '/api/jobs/:id/:act', { params: { id: 'jb-f2760a01', act: 'stop' } }), mk = await callR('POST', '/api/jobs', { body: spec });
    ok(list.status === 503 && list.body.code === 'records-unread' && list.body.why === 'EISDIR' && verdictOf(/For you says what to check/.test(list.body.error)), 'B-f276 cure: the panel\'s list answers WHY it is empty — the records cannot be read (its code), never an empty list', list);
    ok(one.status === 503 && act.status === 503 && one.body.code === 'records-unread' && !/no such job/.test(JSON.stringify([one.body, act.body])), 'B-f276 cure: a job\'s page and its stop answer «the records cannot be read», never «no such job» (that reads as a lost record)', { one, act });
    ok(mk.status === 400 && verdictOf(/no job is created until they are read/.test(mk.body.error)), 'B-f276 cure: the panel\'s ＋New is refused with its door', mk.body);
    R.shutdown();
    const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), jp = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8');
    ok(gateOf(/if \(!jm\.ready\) \{ res\.status\(503\)[^\n]*\n  if \(jm\._unread && jm\._unread\.store\) \{ res\.status\(503\)\.json\(\{ error: jm\.unreadWords\(\), code: 'records-unread' \}\); return null; \}/.test(ar)) && (jp.match(/listErrorText\(r\)/g) || []).length === 2, 'B-f276 cure WIRING: every agent job verb (jobAuth: list, show, poll, stop, run) answers the same words; the panel\'s two lists word the code in the person\'s language');
  }
  // A3. THE READER TABLE's older roads (r3230), while jobs.json is HELD: the wake-grant rows, a job's token, the logs remover's «a live
  // record names it» — each says the hold or keeps, never «none» / «unknown token» / gone
  {
    const d = mkDir('jobs-triage-unread-table'), F = path.join(d, 'jobs.json');
    plant(F, body, 'folder');
    const { jm: R, call: callR } = boot(d);
    const wg = await callR('GET', '/api/jobs-wake-grants', { query: { conversation: 'conv-made-x' } });
    ok(wg.status === 503 && wg.body.code === 'records-unread' && verdictOf(/a conversation's jobs cannot be listed while the job records cannot be read/.test(wg.body.error)), 'the reader table (r3230): a conversation\'s wake-grant rows (the Terminate confirm) while held answer the hold by name (503) — never «owns no job»', wg);
    const tk = R.tokenHeldAnswer('jbt_' + '0'.repeat(32));
    ok(!!tk && tk.status === 503 && tk.code === 'records-unread' && gateOf(/a job's token cannot be checked/.test(tk.error)) && R.tokenHeldAnswer('vsst_made') === null, 'the reader table: a job\'s token while held is answered by the hold\'s words (503) — never «unknown job token» to a job that may be running', tk);
    // the hourly clean-up's ARCHIVE leg (the clock's verdict, r3408): while held, «never a stale copy of a live record» cannot be judged —
    // an archived record past the 14 days keeps its folder; a person's ✕ still removes (the logs law, test-job-logs-sweep-heavy round 4)
    const DAY = 86400e3, old = Date.now() - 20 * DAY, arc = (id) => ({ id, kind: 'task', name: 'made-up', state: 'done', owner: {}, access: { view: 'all', control: 'session' }, runs: [{ startedAt: old, endedAt: old + 1000, exit: 0 }], archivedAt: old + 2000, archivedWhy: 'done' });
    R._writeArchive([arc('jb-f2760a0e')]);
    // B-0248 step 3's follow (line 383): an archive this process still OWES is held at its read (_archiveOwedHold, never flushed on
    // the loop), so the pass would see no archived record and the leg prove nothing — the record is ON DISK before the pass, as the
    // release's read made it by its flush
    await R._writer().durable(R.archiveFile);
    const LD = path.join(R.logsDir, 'jb-f2760a0e'); fs.mkdirSync(LD, { recursive: true }); fs.writeFileSync(path.join(LD, 'run-1.log'), 'made-up');
    await R._gc({ now: Date.now() });
    const keptAtGc = fs.existsSync(LD);
    // …and A PERSON's ✕ of an archived row still removes its logs WHILE HELD (r3408 / r3413: the hold is the clean-up pass's, never a
    // person's own removal) — RED CONTROL below: line 720's filter (every id kept while held), in a copy
    const rmWhileHeld = async (J, id) => { J._writeArchive([...(J._loadArchive() || []), arc(id)]); const dir = path.join(J.logsDir, id); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'run-1.log'), 'made-up');
      const r = J.rmArchived(id); const g = r && r.ok ? await Promise.race([J._logsGone.get(id) || Promise.resolve(null), new Promise((res) => setTimeout(() => res('no answer in 10 s'), 10e3))]) : null;
      return { r, g, gone: !fs.existsSync(dir) }; };
    const pr = await rmWhileHeld(R, 'jb-f2760a0d');
    R.shutdown();
    const MJP = mutantCopies('jobs-unread-person', ROOT), jsP = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
    const JP = MJP.load('src/jobs.js', editAnchor(jsP, 'filterWhole: (ids) => ids.filter((id) => !this.jobs.has(id))', 'filterWhole: (ids) => (this._unread && this._unread.store ? [] : ids.filter((id) => !this.jobs.has(id)))', 'src/jobs.js'), 'line-720-filter');
    const dP = mkDir('jobs-triage-unread-person-ctl'); plant(path.join(dP, 'jobs.json'), body, 'folder');
    const XP = engine(JP, dP, []); XP._unreadStopped = true;
    const px = XP._unread.store ? await rmWhileHeld(XP, 'jb-f2760a0d') : null;
    XP.shutdown();
    ok(!!pr.r && gateOf(pr.r.ok) && gateOf(pr.g) && pr.g.gone === true && gateOf(pr.gone) && !!px && gateOf(px.r.ok) && px.gone === false && gateOf(px.g) && px.g.kept === 'named', 'the reader table (r3413): while held a PERSON\'s ✕ of an archived row still removes its logs (the hold is the clean-up pass\'s) — RED CONTROL (in a copy, line 720\'s filter): the folder kept («named»)', { pr, px });
    for (const rr of copiesCensus(MJP.files, MJP.dir, ROOT, { minCopies: 1, label: 'reader-table person ' })) ok(verdictOf(rr.pass), rr.name + (rr.pass ? '' : ' — ' + rr.detail));
    // RED CONTROL: the archive leg's held guard cut (in a copy) — the same hourly pass takes the folder while held
    const MJT = mutantCopies('jobs-unread-table', ROOT), jsT = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
    const JT = MJT.load('src/jobs.js', editAnchor(jsT, '      if (!(this._unread && this._unread.store)) for (const rec of this.archivedList()) {', '      for (const rec of this.archivedList()) {', 'src/jobs.js'), 'gc-archive-unheld');
    const dT = mkDir('jobs-triage-unread-table-ctl'), FT = path.join(dT, 'jobs.json');
    plant(FT, body, 'folder');
    const XT = engine(JT, dT, []); XT._unreadStopped = true;
    XT._writeArchive([arc('jb-f2760a0e')]); await XT._writer().durable(XT.archiveFile);   // on disk before the pass (above)
    const LT = path.join(XT.logsDir, 'jb-f2760a0e'); fs.mkdirSync(LT, { recursive: true }); fs.writeFileSync(path.join(LT, 'run-1.log'), 'made-up');
    if (XT._unread.store) await XT._gc({ now: Date.now() });
    const goneCtl = !!XT._unread.store && await until(() => !fs.existsSync(LT), 3000);
    ok(gateOf(keptAtGc) && gateOf(fs.existsSync(LD)) && verdictOf(goneCtl), 'the reader table (r3408 placed): while held the hourly clean-up\'s ARCHIVE leg takes no archived record\'s folder — RED CONTROL (in a copy, the guard cut): the same pass takes it', { keptAtGc, kept: fs.existsSync(LD), goneCtl });
    XT.shutdown();
    for (const rr of copiesCensus(MJT.files, MJT.dir, ROOT, { minCopies: 1, label: 'reader-table ' })) ok(verdictOf(rr.pass), rr.name + (rr.pass ? '' : ' — ' + rr.detail));
    // THE TOKEN DOORS' CENSUS: every src file that looks a jbt_ token up is a row — its lookups and its held answers counted (a new
    // door, or a door without the hold's answer, is red until its row says it). jobAuth asks the hold before its lookup (A2's pin);
    // the vault's four lookups share ONE answer at its doors' gate. RED CONTROL: the census over a copy of the texts with one answer cut
    const TOKEN_DOORS = { 'src/agent-routes.js': [4, 3], 'src/routes/design.js': [1, 1], 'src/routes/feedback.js': [1, 1], 'src/routes/browser.js': [1, 1], 'src/routes/vault.js': [4, 1] };
    const walkSrc = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walkSrc(f, out); else if (/\.(c|m)?js$/.test(e.name)) out.push(f); } return out; };
    const texts = new Map(walkSrc(path.join(ROOT, 'src')).map((f) => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')]));
    const census = (T) => { const bad = []; for (const [rel, src] of T) { if (rel === 'src/jobs.js') continue; const n = src.split('jobByToken(').length - 1; if (!n) continue; const h = src.split('tokenHeldAnswer(').length - 1, row = TOKEN_DOORS[rel]; if (!row || row[0] !== n || row[1] !== h) bad.push(`${rel}: ${n} lookup(s), ${h} held answer(s)${row ? ` — its row says ${row[0]}, ${row[1]}` : ' — no row'}`); } for (const rel of Object.keys(TOKEN_DOORS)) if (!T.has(rel)) bad.push(`${rel}: a row with no file`); return bad; };
    const cb = census(texts);
    ok(cb.length === 0, 'THE TOKEN DOORS\' CENSUS (the reader table): every file that looks a job\'s token up answers the hold by name while jobs.json is held — its lookups and answers are its row', cb);
    const cut = new Map(texts); cut.set('src/routes/design.js', cut.get('src/routes/design.js').split('tokenHeldAnswer(').join('noAnswer('));
    ok(census(cut).length === 1, 'RED CONTROL — one door\'s held answer cut (in a copy of the texts): the census names it', census(cut));
    // the page's half (pins): the rows' loader keeps the hold (never «none owned»), the Terminate confirm and the proposal card SAY it,
    // in the person's three languages
    { const WG = fs.readFileSync(path.join(ROOT, 'src/lib/wake-grant-rows.js'), 'utf8'), UT = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-actions.js'), 'utf8');
      const W = 'This conversation’s jobs cannot be listed right now: Background Work cannot read its records. They keep the wake choices they have — change them in Background Work once its records read again.';
      const zh = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
      ok(gateOf(WG.includes("if (r && r.code === 'records-unread') return Object.assign([], { held: true });")) && gateOf(WG.includes("if (!rows.length) return rows.held ? { node: wakeGrantHeldNode(), save: async () => 0 } : null;")) && gateOf(UT.includes('if (!rows.length) { if (rows.held) place.replaceChildren(wakeGrantHeldNode()); return; }')) && gateOf(WG.includes(`t('${W}')`)) && gateOf(zh.includes(`"${W}":`)) && verdictOf(ja.includes(`"${W}":`)), 'the reader table (pins): the wake-grant rows\' loader keeps the hold; the Terminate confirm and the proposal card say it (zh, ja beside) — never an empty list read as «none owned»'); }
  }
  // B. THE ARCHIVE, EISDIR (a real mode): the boot's sweep would write over it — it keeps its records in the store instead
  const dB = mkDir('jobs-triage-unread-archive'), AF = path.join(dB, 'jobs-archive.json');
  fs.writeFileSync(path.join(dB, 'jobs.json'), JSON.stringify([rec('jb-f2760b01')]));
  fs.mkdirSync(AF);
  const lB = [];
  const Bj = engine({ JobManager }, dB, lB);
  ok(gateOf(Bj._unread.archive) && Bj._unread.archive.code === 'EISDIR' && gateOf(fs.statSync(AF).isDirectory()) && asides(dB, 'jobs-archive.json').length === 0 && gateOf(Bj.jobs.has('jb-f2760b01')) && verdictOf(lB.some((l) => /NOT archived — the store keeps them/.test(l))), 'B-f276: an archive whose read fails (EISDIR) is not set aside and not written over — the boot sweep\'s record stays in the store', { unread: Bj._unread.archive, asides: asides(dB, 'jobs-archive.json') });
  fs.rmdirSync(AF); fs.writeFileSync(AF, JSON.stringify([{ ...rec('jb-f2760b02'), archivedAt: T0 - D, archivedWhy: 'done' }]));
  const backB = await until(() => !Bj._unread.archive && Bj.archive && Bj.archive.some((r) => r.id === 'jb-f2760b02'));
  const sw = backB ? sweepNow(Bj, { now: T0 }) : null;
  const onDiskB = (() => { try { return JSON.parse(fs.readFileSync(AF, 'utf-8')).map((r) => r.id).sort().join(); } catch (e) { return e.code; } })();
  ok(gateOf(backB) && gateOf(sw) && gateOf(sw.archived.includes('jb-f2760b01')) && onDiskB === 'jb-f2760b01,jb-f2760b02', 'B-f276: the archive is read again; the next sweep archives beside what it held (nothing lost)', { backB, onDiskB });
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
    flushU4(); flushU4();   // B-0248 step 3: the boot sweep's archive write (if any) lands before the file is read
    return { J, kept: fs.readFileSync(F, 'utf-8') === before, inStore: J.jobs.has('jb-f2760g01') };
  };
  const g = guardScene({ JobManager }, 'jobs-triage-unread-archive-guard');
  ok(gateOf(g.kept) && gateOf(g.inStore) && gateOf(g.J._unread.archive) && g.J._unread.archive.code === 'EIO', 'B-f276: the boot sweep NEVER writes over an archive whose read failed (EIO) — its bytes are as they were, the due record stays in the store', g.J._unread.archive);
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
  C._dirty = true; C._save(); landedU4();   // lane lg-store-writes U4 (the move's meeting): the save is the store writer's — landed before the file is looked at, so «never writes over» is proved, not vacuous
  ok(gateOf(C._unread.store) && C._unread.store.code === 'not set aside' && fs.readFileSync(CF, 'utf-8') === torn && verdictOf(C.jobs.has('jb-f2760c01')), 'B-f276: torn bytes whose set-aside failed hold the store — a save never writes the skeletons over their only copy', C._unread.store);
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
  ok(gateOf(dr.before) && !dr.skel && gateOf(dr.real) && !dr.held, 'B-f276 cure: a read again that answers DROPS the skeletons of the earlier answer before it loads — the records stand alone', dr);
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
  ok(en.atBoot === 0 && en.state === 'done' && en.ended === 'jb-f2760f01' && verdictOf(en.told), 'B-f276 cure: a job that ENDED while the store was unread is finalized when the read answers (the boot\'s adoption, late) — its end is told', en);
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
  ok(hg.said === 1 && hg.triesAt >= 4 && gateOf(hg.armed) && hg.inFlight === 1 && verdictOf(hg.back), 'B-f276 cure: a read again that HANGS is said once, the next tries stay armed (never «held till a restart»), ONE read is in flight (never doubled), and once it ends the next try loads the store', hg);
  // CONTROLS (scripts/mutant-copy.mjs): the release's classification (a failed read of a file that is there = corrupt) and its
  // unguarded save, in a copy
  const MJ = mutantCopies('jobs-unread-f276', ROOT);
  const jsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
  const readLine = 'this._loadAnswer(SR.storeAnswer(read, { valid: STORE_SHAPE }));';
  const archLine = 'this._archiveAnswer(SR.storeAnswer(read, { valid: Array.isArray }));';
  const saveLine = "if (!this._unread.store) {";   // lane lg-store-writes U4: the store's write hold now guards its hand-off to the store writer
  ok(verdictOf([readLine, archLine, saveLine].every((x) => jsrc.split(x).length === 2)), 'B-f276 control setup: the two reads and the store\'s write hold are each one line');
  const release = (r, f) => `((r) => (r.state === 'unreadable' && fs.existsSync(${f}) ? { ...r, state: 'corrupt' } : r))(${r})`;   // MUTANT: the release
  // (the moved line's must 1: the release had no producer guard either — the bytes refused while held at the write, cut too)
  const JMod = MJ.load('src/jobs.js', anchored(editAnchor(editAnchor(editAnchor(jsrc,
    readLine, `this._loadAnswer(${release('SR.storeAnswer(read, { valid: STORE_SHAPE })', 'this.file')});`, "src/jobs.js"),
    archLine, `this._archiveAnswer(${release('SR.storeAnswer(read, { valid: Array.isArray })', 'this.archiveFile')});`, "src/jobs.js"),
    saveLine, "if (true) {", "src/jobs.js"), "  _recordsBytes() { if (this._unread && this._unread.store) throw", "  _recordsBytes() { if (false) throw", 'the release: no producer guard'));
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
  Z._unreadStopped = true; Z._dirty = true; Z._save(); landedU4();   // U4: the save's bytes are the writer's — landed before the file is read
  const zNow = fs.readFileSync(ZF, 'utf-8');
  if (Z._logsNoteP) await Z._logsNoteP;
  Z.shutdown();
  ok(zNow !== torn, 'B-f276 CONTROL (the release\'s unguarded save, in a copy): the skeletons are written over the torn bytes\' only copy');
  const guardW = "    if (this._unread.archive) return { ok: false, error: `${path.basename(this.archiveFile)} could not be read (${this._unread.archive.code}) — it is not written over until a read answers` };\n";
  ok(jsrc.split(guardW).length === 2, 'B-f276 control setup: the archive\'s write guard is one line');
  const JG = MJ.load('src/jobs.js', editAnchor(jsrc, guardW, '    // MUTANT: no write guard\n', "src/jobs.js"), 'guard');
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
  ok(ls.done === 'done' && ls.dataCalls.length === 0 && gateOf(ls.aside) && ls.tornCalls.length === 0, 'B-f276 cure r2: the late load makes NO synchronous file call on the data folder — a live record\'s control files and the torn bytes\' set-aside and listing are done off the loop, then loaded', ls);
  // cure r2: an UNREAD archive's refusal is said ONCE a hold (never every sweep), and a clear that cannot reach it SAYS so
  {
    const d = mkDir('jobs-triage-unread-archive-once'), AF2 = path.join(d, 'jobs-archive.json'), lo = [];
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify([rec('jb-f2760o01')]));
    fs.mkdirSync(AF2);
    const J = engine({ JobManager }, d, lo, { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    sweepNow(J, { now: T0 }); sweepNow(J, { now: T0 + 1 }); sweepNow(J, { now: T0 + 2 });
    const cl = J.clearJobs(['jb-f2760o01'], { allow: () => true });
    ok(lo.filter((l) => /released but NOT archived/.test(l)).length === 1 && verdictOf(J.jobs.has('jb-f2760o01')), 'B-f276 cure r2: while the archive cannot be read its sweep\'s refusal is said ONCE a hold, not every sweep — the record stays in the store', lo.filter((l) => /NOT archived/.test(l)));
    ok(gateOf(cl) && verdictOf(/archived records could not be reached, so their words were not cleared — clear them again once it reads — jobs-archive\.json in VibeSpace's data folder could not be read \(EISDIR\)/.test(cl.archiveUnread || '')), 'B-f276 cure r2: a clear that cannot reach a held archive SAYS so in its answer', cl);
    if (J._logsNoteP) await J._logsNoteP; J.shutdown();
  }
  const dropL = "        for (const [id, j] of this.jobs) if (LS.isSkeleton(j)) this.jobs.delete(id);   // the skeletons of an earlier answer: the new answer rebuilds its own, or has the records\n";
  const adoptL = "        if (!this._unread.store && !this.readOnly) { this._adoptAndReplay(); this._dirty = true; }   // the boot's adoption, late: the records are this process's now\n";
  const armL = "    this._unreadRetrySoon(which);   // the next try first: whatever this one does\n";
  const liftL = "      if (a.state === 'data') this._unreadLift(which, was).catch((e) => this.d.log(`[jobs] ${base}: its note could not be lifted:`, e && e.message));\n      else this._unreadEnded(which, was, a, pre).catch((e) => this.d.log(`[jobs] ${base}: its end could not be said:`, e && e.message));\n";   // cure 2: the lift ONLY on a whole read
  ok(verdictOf([dropL, adoptL, armL, liftL].every((x) => jsrc.split(x).length === 2)), 'B-f276 cure control setup: the drop, the late adoption, the armed next try and the lift are each one line');
  const JC = MJ.load('src/jobs.js', editAnchor(editAnchor(editAnchor(editAnchor(jsrc, dropL, '        // MUTANT: no drop\n', "src/jobs.js"), adoptL, '        // MUTANT: no late adoption\n', "src/jobs.js"), armL, '    // MUTANT: the next try only after an answer\n', "src/jobs.js"), liftL, '      // MUTANT: no lift\n', "src/jobs.js"), 'cure');
  const drx = await dropScene(JC, 'jobs-triage-reread-drop-mut');
  ok(gateOf(drx.skel) && verdictOf(drx.real), 'B-f276 cure CONTROL (no drop, in a copy): the skeleton of the earlier answer stays beside the records', drx);
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
  ok(gateOf(lf.wrote) && !lf.noteLeft && !lf.held && gateOf(lfx.wrote) && gateOf(lfx.noteLeft) && verdictOf(lfx.held), 'B-f276 cure (the ruling) + CONTROL (no lift, in a copy): a folder fault writes the note; the read again that loads lifts it — without the lift it holds the clean-up for good', { lf, lfx });
  const preL = "      return { a, pre: await this._unreadPrefetch(which, a, file) };   // cure r2: what the late load reads, off the loop\n";   // cure 2: inside the one in-flight slot
  ok(jsrc.split(preL).length === 2, 'B-f276 cure r2 control setup: the late load\'s prefetch is one line');
  const JP = MJ.load('src/jobs.js', editAnchor(jsrc, preL, '      return { a, pre: null };   // MUTANT: the late load reads on the loop\n', "src/jobs.js"), 'prefetch');
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
  const JL = MJ.load('src/jobs.js', editAnchor(jsrc, LIFT_ANY, "      if (true) this._unreadLift(which, was)", "src/jobs.js"), 'lift-any');   // MUTANT: r2 — the lift on ANY answer that clears the hold
  const gn = await notWhole({ JobManager }, 'jobs-triage-reread-gone', 'gone'), gnx = await notWhole(JL, 'jobs-triage-reread-gone-mut', 'gone');
  ok(gateOf(gn.wrote) && gateOf(gn.ended) && gateOf(gn.noteLeft) && !gn.done && gateOf(gn.held) && !gn.readAgain && gn.resolved >= 1 && gateOf(gn.gone) && gn.gone.urgency === 'high' && gateOf(/the file was gone — the jobs it listed are not in VibeSpace now/.test(gn.gone.words.key)) && gn.gone.words.params.note === 'jobs.json.corrupt-unread' && gateOf(Number.isFinite(gn.gone.words.params.when.at)) && gateOf(Number.isFinite(gn.gone.words.params.until.at)) && verdictOf(/the file is GONE/.test(gn.said)), 'cure 2: a read again that finds the file GONE ends the hold with ITS OWN sentence (what is gone, the note that keeps the logs) — the note STANDS, the clean-up stays held, never «nothing was lost»', gn);
  ok(gateOf(gnx.readAgain) && !gnx.noteLeft && !gnx.held, 'cure 2 CONTROL (r2: the lift on any answer, in a copy): «nothing was lost» is said of a GONE file, its note is marked done and the clean-up resumes over jobs whose records are not there', gnx);
  const tn = await notWhole({ JobManager }, 'jobs-triage-reread-torn', 'torn'), tnx = await notWhole(JL, 'jobs-triage-reread-torn-mut', 'torn');
  ok(gateOf(tn.ended) && tn.asides.length === 1 && gateOf(tn.skel) && gateOf(tn.corrupt) && tn.corrupt.words.params.file === tn.asides[0] && !tn.readAgain && gateOf(tn.held) && gateOf(tn.done) && tn.resolved >= 1 && verdictOf(/torn bytes, set aside as jobs\.json\.corrupt-\d+/.test(tn.said)), 'cure 2: a read again that finds TORN bytes ends the hold as a boot would — set aside (named in its item), rebuilt from the job logs; the set-aside holds the clean-up, the failure\'s note is done, never «nothing was lost»', tn);
  ok(gateOf(tnx.readAgain) && !tnx.held, 'cure 2 CONTROL (r2: the lift on any answer, in a copy): «nothing was lost» is said of TORN bytes and the clean-up resumes', tnx);
  // CURE 2: ONE IN FLIGHT A STORE covers the read AND its prefetch — a SLOW prefetch with a second try: one read, one file at a time, one load
  // r3760 (B-3dbd member, placed by a probe on the kit, run 7da095ac2-20261124185718-box): the counter took every read under ANY
  // job-logs folder of the process — the suite's other live engines' memory samplers (_sampleUse → _treeAnonMb → pid.json, on a
  // machine with a memory limit) landed in the window 2 runs in 25 (ctlReads 3); and the window closed at «5 tries», a count of timer
  // ticks: a store read slower than 4 ticks closed it before the prefetch's first read (ctlReads 0). Now the scene counts ITS OWN
  // folder's reads only (another engine's are said, never judged), and the window waits on its FACT: the prefetch's first control
  // read in flight, then three more tries that met the held slot, and the slow read said
  const prefScene = async (Mod, name, { storeHoldMs = 0, foreign = false } = {}) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), b = JSON.stringify([rec('jb-f2760p01', { state: 'up', runs: [{ startedAt: T0 - 1000 }] })]);
    const OWN = path.join(d, 'job-logs') + path.sep, OTHER = path.join(mkDir(name + '-other'), 'job-logs', 'jb-f2760p99', '1', 'pid.json');
    plant(F, b, 'folder');
    const lp = [];
    const J = engine(Mod, d, lp, { unreadRetry: { firstMs: 5, maxMs: 10, readMs: 30 } });
    unplant(F, b, 'folder');
    const prf = fs.promises.readFile; let storeReads = 0, ctlReads = 0, others = 0, triesAtRead = null, release = null;
    const gate = new Promise((r) => { release = r; });
    fs.promises.readFile = function (f, ...a) {
      const p = String(f);
      if (p === F) { storeReads++; if (storeHoldMs) return new Promise((r) => setTimeout(r, storeHoldMs)).then(() => prf.call(this, f, ...a)); }   // PLACED: a slow store read
      if (p.startsWith(OWN)) { if (!ctlReads++) { triesAtRead = J._unreadTries.store; if (foreign) fs.promises.readFile(OTHER).catch(() => { }); } return gate.then(() => prf.call(this, f, ...a)); }   // PLACED: another engine's read inside the window
      if (p.includes(`${path.sep}job-logs${path.sep}`)) others++;   // another engine's (its sampler): said, never judged
      return prf.call(this, f, ...a);
    };
    let during = null;
    try {
      const inFlight = await until(() => ctlReads >= 1, 3000);
      const waited = inFlight && await until(() => J._unreadTries.store >= triesAtRead + 3 && lp.some((l) => /did not answer in/.test(l)), 3000);
      during = { storeReads, ctlReads, tries: J._unreadTries.store, triesHeld: triesAtRead == null ? 0 : J._unreadTries.store - triesAtRead, triesAtRead, held: !!J._unread.store, others, inFlight, waited };
      release(); await until(() => !J._unread.store, 3000);
    } finally { release(); fs.promises.readFile = prf; }
    const out = { during, back: !J._unread.store && J.jobs.has('jb-f2760p01'), storeReads, said: lp.filter((l) => /did not answer in/.test(l)).length, loads: lp.filter((l) => /read again after/.test(l)).length };
    if (J._logsNoteP) await J._logsNoteP; J.shutdown(); return out;
  };
  const SLOT_A = "      const a = SR.storeAnswer(read, { valid: which === 'store' ? STORE_SHAPE : Array.isArray });\n";
  ok(jsrc.split(SLOT_A).length === 2, 'B-f276 cure 2 control setup: the read again\'s answer is one line inside its slot');
  const JS2 = MJ.load('src/jobs.js', editAnchor(jsrc, SLOT_A, SLOT_A + "      if (this._unreadP[which]) this._unreadP[which] = null;   // MUTANT: r2 — the slot covers the read only\n", "src/jobs.js"), 'slot-read-only');
  const pf = await prefScene({ JobManager }, 'jobs-triage-reread-prefetch'), pfx = await prefScene(JS2, 'jobs-triage-reread-prefetch-mut');
  const slotHeld = (x) => !!x.during && x.during.waited && x.during.triesHeld >= 3 && x.during.storeReads === 1 && x.during.ctlReads === 1 && x.during.held && x.back && x.said === 1 && x.loads === 1;
  ok(verdictOf(slotHeld(pf)), 'cure 2: a SLOW prefetch holds the one slot — the tries go on (three more met it), ONE read of the store, ONE control file of its own in flight at a time, said once, ONE load once it answers', pf);
  // r3760, THE PLACED FORM (every run, no load): the store's read held 60 ms (the tries pass the old «5» before the prefetch reads)
  // and another engine's control read started INSIDE the window — the leg judges this engine's prefetch alone, on its fact
  const pfP = await prefScene({ JobManager }, 'jobs-triage-reread-prefetch-placed', { storeHoldMs: 60, foreign: true });
  ok(gateOf(slotHeld(pfP)) && pfP.during.triesAtRead >= 5 && pfP.during.others >= 1, `cure 2 PLACED: a store read held 60 ms (${pfP.during && pfP.during.triesAtRead} tries before the prefetch's first read) and another engine's control read in the window (${pfP.during && pfP.during.others}) — the slot is judged on its own prefetch, after its own read began`, pfP);
  ok(gateOf(pfx.during) && (pfx.during.storeReads > 1 || pfx.during.ctlReads > 1), 'cure 2 CONTROL (r2: the slot covers the read only, in a copy): a second try reads the store and starts its prefetch over the slow one', pfx);
  // ── CURE 3 (主开发 11:10Z, as if a must): a store that answers «missing» RIGHT AFTER an unreadable answer is read once more before
  // anything is written at its path — the storage that says «no such file» for a moment about a file that is there
  const onceScene = async (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'), b = JSON.stringify([rec('jb-f2760m01')]), lm = [];
    plant(F, b, 'folder');
    const J = engine(Mod, d, lm, { unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    fs.rmdirSync(F);   // «no such file», for a moment
    await J._unreadRetry('store');
    const heldAfterOne = !!J._unread.store;
    J._dirty = true; J._save(); landedU4();   // the next save meanwhile — lane lg-store-writes U4 (the move's meeting): the save is the store writer's, landed before the path is looked at (else a write over it is invisible here: the control blind, the positive vacuous)
    const wroteOver = fs.existsSync(F);
    if (!wroteOver) fs.writeFileSync(F, b);   // the storage answers again: the file was there all along
    await J._unreadRetry('store');
    const out = { heldAfterOne, wroteOver, back: !J._unread.store && J.jobs.has('jb-f2760m01'), said: lm.some((l) => /a read again answered «no such file» — read once more before anything is written there/.test(l)) };
    if (J._logsNoteP) await J._logsNoteP; J.shutdown(); return out;
  };
  const ONCE_A = "    if (a.state === 'missing' && !this._unreadMissingAt[which]) {";
  ok(jsrc.split(ONCE_A).length === 2, 'B-f276 cure 3 control setup: «missing» read once more is one line');
  const JO = MJ.load('src/jobs.js', editAnchor(jsrc, ONCE_A, '    if (false /* MUTANT: cure 2 — «missing» believed at once */) {', "src/jobs.js"), 'missing-once');
  const on = await onceScene({ JobManager }, 'jobs-triage-reread-once'), onx = await onceScene(JO, 'jobs-triage-reread-once-mut');
  ok(gateOf(on.heldAfterOne) && !on.wroteOver && gateOf(on.back) && verdictOf(on.said), 'cure 3: a store that answers «missing» right after an unreadable answer is READ ONCE MORE — the hold stands, the next save writes nothing at its path, and the file that was there all along is read back whole', on);
  ok(!onx.heldAfterOne && gateOf(onx.wroteOver) && !onx.back, 'cure 3 CONTROL (cure 2: «missing» believed at once, in a copy): the hold ends and the next save WRITES OVER the path — the records that were there are lost', onx);
  // the U4 move's read (small 3): a LOAD that finds the last engine's write of jobs.json STILL OWED (the writer could not land it)
  // never reads past it — the store starts UNREAD (code EOWED: B-f276's hold, never written over, read again off the loop), so the
  // earlier engine's write cannot land later over a store this one read older. RED: a copy that reads anyway (its plant first)
  const owedScene = (Mod, name) => {
    const d = mkDir(name), F = path.join(d, 'jobs.json'); fs.writeFileSync(F, JSON.stringify([rec('jb-f2760w01')]));
    const stuck = { pending: (f) => f === F, dirty() { }, durable: () => Promise.resolve(false), whenDurable: () => Promise.resolve(false), exitStartedAt: () => null, stats: () => [],
      flushSync: (files) => ({ written: [], left: (files || [F]).filter((f) => f === F).map((f) => ({ file: f, name: 'jobs.write', why: 'held by the storage at the bound (a stand-in)' })), ms: 0 }) };
    const J = engine(Mod, d, [], { writer: stuck, unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    J._unreadStopped = true;
    const out = { held: !!J._unread.store, code: J._unread.store ? J._unread.store.code : null, read: J.jobs.has('jb-f2760w01') };
    try { J.shutdown(); } catch { }
    return out;
  };
  const OWED_A = "    if (owedStill) read = { error: Object.assign(new Error(`the last engine's write of jobs.json is still owed (${owedStill}) — read again once it lands`), { code: 'EOWED' }) };";
  const ow = owedScene({ JobManager }, 'jobs-triage-owed-load'), owx = owedScene(MJ.load('src/jobs.js', anchored(jsrc, OWED_A, '    if (false /* MUTANT: reads past a write still owed */) read = null;', 'still owed ⇒ never read past'), 'owed-read-anyway'), 'jobs-triage-owed-load-mut');
  ok(gateOf(ow.held) && ow.code === 'EOWED' && !ow.read, 'the U4 move (small 3): a load whose earlier write of jobs.json is still owed holds the store UNREAD (EOWED) — never a read past it', ow);
  ok(!owx.held && owx.code === null, 'CONTROL (a copy that reads past the owed write): the store is READ (not held) — the earlier engine\'s write could land over it later', owx);
  // ── THE MOVED2 CURE 2 (主开发's ruling): THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING — no roll back anywhere. The act changes
  // memory and marks the store; what cannot be undone (the job hears its answer, a For-you item resolved, a kept process ended) runs
  // when, and only when, jobs.json has LANDED. A writer stand-in whose landing is HELD once armed (its afterLanding keeps the steps;
  // `land()` = the storage answers; never landing = a kill first): nothing irreversible before, everything once at the landing
  const PANEL = { title: 't', blocks: [{ type: 'input', id: 'code', pattern: '\\d{6}' }, { type: 'buttons', options: [{ id: 'submit', label: 'OK' }] }] };
  const lawScene = (Mod, name) => {
    const d = mkDir(name), asked = [], st = { armed: false, steps: [] };
    const W = { pending: () => st.armed, dirty() { }, durable: () => Promise.resolve(!st.armed), whenDurable: () => Promise.resolve(!st.armed), exitStartedAt: () => null, stats: () => [],
      flushSync: (names) => ({ written: [], left: st.armed ? (names || []).map((f) => ({ file: f, name: 'a store', why: 'held by the storage at the bound (a stand-in)' })) : [], ms: 0 }),
      afterLanding: (file, step) => { if (!st.armed) { const value = step(); return Promise.resolve({ landed: true, value }); } st.steps.push({ file, step }); return new Promise(() => { }); } };
    const J = engine(Mod, d, [], { writer: W, resolveJobAsk: (id) => asked.push(id), unreadRetry: { firstMs: 3600e3, maxMs: 3600e3 } });
    J._unreadStopped = true;
    const job = rec('jb-f2760l01', { state: 'awaiting-user', interaction: { pending: { version: 1, panel: PANEL, at: Date.now() }, answers: [] } });
    J.jobs.set(job.id, job);
    J.pendingNotifs.set('cid-law', [{ jobId: job.id, ts: 1, text: 'its result' }]);
    st.armed = true;
    const land = () => { st.armed = false; const xs = st.steps; st.steps = []; for (const x of xs) x.step(); };
    return { J, job, asked, land, st };
  };
  const lawRun = (Mod, tag) => {
    const a = lawScene(Mod, 'jobs-triage-law-ans-' + tag); const ans = a.J.answerPanel(a.job, { version: 1, button: 'submit', code: '123456' });
    const outA = { ok: !!ans.ok, code: ans.code || null, pending: !!a.job.interaction.pending, state: a.job.state, askedBefore: a.asked.length };
    a.land(); outA.askedAfter = a.asked.length;
    const r = lawScene(Mod, 'jobs-triage-law-rm-' + tag); const rm = r.J.rm(r.job);
    const outR = { ok: !!rm.ok, code: rm.code || null, kept: r.J.jobs.has(r.job.id), askedBefore: r.asked.length };
    r.land(); outR.askedAfter = r.asked.length;
    const c = lawScene(Mod, 'jobs-triage-law-clear-' + tag); const cl = c.J.clearJobs([c.job.id], { allow: () => ({ ok: true }) });
    const outC = { cleared: (cl.cleared || []).length, notOnDisk: !!cl.notOnDisk, state: c.job.state, askedBefore: c.asked.length };
    const again = c.J.clearJobs([c.job.id], { allow: () => ({ ok: true }) });   // a second press before the landing changes nothing — the first one's step is the one owed
    c.land(); outC.askedAfter = c.asked.length; outC.again = (again.already || []).length;
    const n = lawScene(Mod, 'jobs-triage-law-drain-' + tag); const got = n.J.drainNotifs('cid-law');
    const outD = { got: got.length, back: (n.J.pendingNotifs.get('cid-law') || []).length };
    const k = lawScene(Mod, 'jobs-triage-law-kill-' + tag); k.J.answerPanel(k.job, { version: 1, button: 'submit', code: '123456' });   // never landed: a kill first
    const outK = { asked: k.asked.length, owed: k.st.steps.length };
    for (const x of [a, r, c, n, k]) { try { x.J.shutdown(); } catch { } }
    return { ans: outA, rm: outR, clear: outC, drain: outD, kill: outK };
  };
  const law = lawRun({ JobManager }, 'real');
  ok(gateOf(law.ans.ok) && !law.ans.pending && law.ans.state === 'up' && law.ans.askedBefore === 0 && law.ans.askedAfter === 1,
    'THE STEP RIDES THE LANDING: a panel\'s answer not landed yet is TAKEN (memory and its store, never rolled back) — the job hears it and its For-you item closes only AT the landing, once', law.ans);
  ok(gateOf(law.rm.ok) && !law.rm.kept && law.rm.askedBefore === 0 && law.rm.askedAfter === 1, '…a removal: the job is out of memory, its asks resolved only at the landing', law.rm);
  ok(law.clear.cleared === 1 && !law.clear.notOnDisk && law.clear.state === 'up' && law.clear.askedBefore === 0 && law.clear.askedAfter === 1,
    '…a clear (must 3): the asked job\'s For-you item is resolved AT the landing — by itself, never left open for good', law.clear);
  ok(law.drain.got === 1 && law.drain.back === 0, '…a drain (must 4): nothing is PUT BACK — the text went out, the removal stays and the writer retries', law.drain);
  ok(law.kill.asked === 0 && law.kill.owed === 1, '…and a landing that never comes (a kill first): the job never heard the answer — its step was still owed, never run', law.kill);
  const RIDE_A = "    this._ride(this.file, 'the panel\\'s answer', () => {";
  const JLAW = MJ.load('src/jobs.js', anchored(jsrc, RIDE_A, "    ((f, w, step) => step())(this.file, 'the panel\\'s answer', () => {   // MUTANT: the step runs at the act", 'the answer rides the landing'), 'law-ride-ignored');
  const lawx = lawRun(JLAW, 'mut');
  ok(lawx.ans.askedBefore === 1, 'CONTROL (a copy whose answer runs its step at the act): the job hears the answer and its For-you item closes while NOTHING is on disk — red', lawx.ans);
  // the moved2 cure 3: a red control for EACH leg — one copy per law (each plant asserted by anchored())
  const rideNow = (src, what) => anchored(src, `    this._ride(this.file, '${what}', () => {`, `    ((f, w, step) => step())(this.file, '${what}', () => {   // MUTANT: the step runs at the act`, `the ${what} rides the landing`);
  const lawRm = lawRun(MJ.load('src/jobs.js', rideNow(jsrc, 'the removal'), 'law-rm-now'), 'mut-rm');
  ok(lawRm.rm.askedBefore === 1, 'CONTROL (a copy whose removal runs its step at the act): its asks are resolved while NOTHING is on disk — red', lawRm.rm);
  const CLEAR_A = "    if (askGone.length) this._ride(this.file, 'the cleared asks', () => {";
  const lawCl = lawRun(MJ.load('src/jobs.js', anchored(jsrc, CLEAR_A, "    if (askGone.length) ((f, w, step) => step())(this.file, 'the cleared asks', () => { /* MUTANT: the step runs at the act */", 'the cleared asks ride the landing'), 'law-clear-now'), 'mut-clear');
  ok(lawCl.clear.askedBefore === 1, 'CONTROL (a copy whose clear runs its step at the act): the asked job\'s For-you item closes while NOTHING is on disk — red', lawCl.clear);
  const DRAIN_A = "    // stays, a write that does not land is the writer's to retry (_onDisk says it). The census cure (finding 11): the drained list\n    // CARRIES the drain's landing (`landed`, not enumerable — never in a record) — a hand-over holds what follows behind it\n    const drained = this._saveNotifs();\n";
  const lawDr = lawRun(MJ.load('src/jobs.js', anchored(jsrc, DRAIN_A, DRAIN_A + "    if (this._writer().pending(this.notifsFile)) this.pendingNotifs.set(cid, [...(this.pendingNotifs.get(cid) || []), ...q]);   // MUTANT: the first cure's put-back\n", 'the drain puts nothing back'), 'law-drain-back'), 'mut-drain');
  ok(lawDr.drain.back === 1, 'CONTROL (a copy that puts a drain not on disk back — the first cure): the text that went out is queued again — red', lawDr.drain);
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
  const JR = MJ.load('src/jobs.js', editAnchor(jsrc, AR_A, '      if (false /* MUTANT: cure 2 — the load reads the archive on the loop */) {', "src/jobs.js"), 'ro-archive');
  const ro = await roScene({ JobManager }, 'jobs-triage-reread-ro'), rox = await roScene(JR, 'jobs-triage-reread-ro-mut');
  ok(gateOf(ro.ro) && ro.sync === 0 && gateOf(ro.skel) && !ro.archivedSkel, 'cure 3: a READ-ONLY engine\'s torn read again makes no synchronous read on the loop — the archive\'s ids come with the prefetch (its skeletons skip the archived job)', ro);
  ok(gateOf(rox.ro) && rox.sync > 0, 'cure 3 CONTROL (cure 2, in a copy): the load reads jobs-archive.json synchronously on the loop', rox);
  for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 7, label: 'B-f276 ' })) ok(verdictOf(r.pass), r.name + (r.pass ? '' : ' — ' + r.detail));
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
  ok(gateOf(real.list) && real.list.status === 200 && gateOf(['jb-6c1a0001', 'jb-6c1a0002'].every((id) => Array.isArray(runsBy(real.list, id)) && runsBy(real.list, id).length === 0)) && runsBy(real.list, 'jb-6c1a0003').length === 1
    && gateOf(real.arch) && real.arch.status === 200 && gateOf(Array.isArray(runsBy(real.arch, 'jb-6c1a0004'))) && runsBy(real.arch, 'jb-6c1a0004').length === 0,
    'B-6c1a: records whose runs is an object, a number, a string, or a list holding a null are LISTED (live and archived) — their runs read as none, never a list that fails', { live: rowsOf(real.list).map((j) => [j.id, j.runs]), arch: rowsOf(real.arch).map((j) => [j.id, j.runs]) });
  const recordsOnly = (v) => Array.isArray(v) && v.every((r) => r && typeof r === 'object');
  ok(gateOf(recordsOnly(real.detail['jb-6c1a0001'])) && real.detail['jb-6c1a0001'].length === 0 && gateOf(recordsOnly(real.detail['jb-6c1a0002'])) && gateOf(recordsOnly(real.detail['jb-6c1a0003'])) && real.detail['jb-6c1a0003'].length === 1 && verdictOf(recordsOnly(real.detail['jb-6c1a0004'])),
    'B-6c1a: the row\'s DETAIL (live and archived) serves its runs as a list of whole records — the panel\'s detail never meets an object, a number, a string or a null', real.detail);
  const WSRC = fs.readFileSync(path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8'), NEW_RUNS = "(Array.isArray(j.runs) ? j.runs : []).filter((r) => r && typeof r === 'object').map((r) => ({";
  const DETAIL = ['runs: runsWhole(rec), vaultUses: vaultUsesOf(rec) } });', 'runs: runsWhole(job), vaultUses: vaultUsesOf(job) } });'];   // B-a08e (r1665): + every snapshot's vaultUses
  ok(verdictOf(DETAIL.every((a) => WSRC.split(a).length === 2)), 'B-6c1a control setup: the anchors of the detail\'s control (its two runs reads) are in the source');
  ok(WSRC.split(NEW_RUNS).length === 2, 'B-6c1a control setup: the guarded runs read is in jobs-wiring once (the plant the control swaps)');
  const MJ6 = mutantCopies('jobs-runs-shape-6c1a', ROOT);
  const old = await scene(MJ6.load('src/server/jobs-wiring.js', editAnchor(editAnchor(editAnchor(WSRC, NEW_RUNS, '(j.runs || []).map((r) => ({', "src/server/jobs-wiring.js"), DETAIL[0], 'runs: rec.runs, vaultUses: vaultUsesOf(rec) } });', "src/server/jobs-wiring.js"), DETAIL[1], 'runs: job.runs, vaultUses: vaultUsesOf(job) } });', "src/server/jobs-wiring.js"), 'release'), 'jobs-triage-runs-shape-mut');   // stale-pins: kept — the control writes the release's runs read back into a copy
  ok(!(old.list && old.list.status === 200) || !(old.arch && old.arch.status === 200), 'B-6c1a CONTROL (the release\'s runs read, in a copy): the list FAILS on such a record', { list: old.list && (old.list.status || old.list.threw), arch: old.arch && (old.arch.status || old.arch.threw) });
  ok(!recordsOnly(old.detail['jb-6c1a0001']) && !recordsOnly(old.detail['jb-6c1a0003']), 'B-6c1a CONTROL (the release\'s detail, in the same copy): the detail serves the object as it is and the list with its null', old.detail);
  for (const r of copiesCensus(MJ6.files, MJ6.dir, ROOT, { minCopies: 1, label: 'B-6c1a ' })) ok(verdictOf(r.pass), r.name + (r.pass ? '' : ' — ' + r.detail));
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
  ok(r.day1.length === 1 && verdictOf(/job-logs: 60 run dir\(s\) past the 14-day retention that no record lists removed \(120 entries\)/.test(r.day1[0])), 'B-c330: three small steady passes say NOTHING yet; a pass that removes fifty or more speaks at once', r.day1);
  ok(r.all.length === 2 && verdictOf(/job-logs: on 2026-11-17 \(UTC\) 9 run dir\(s\) past the 14-day retention that no record lists were removed over 3 steady pass\(es\) \(18 entries\)/.test(r.all[1])), 'B-c330: the day\'s first pass after it says the day\'s ONE folded line — the counts summed', r.all);
  ok(gateOf(r.keptDay) && r.keptDay.day === '2026-11-18' && r.keptDay.removed === 2 && r.keptDay.passes === 1, 'B-c330: the day\'s folded counts are in the clean-up\'s record — a restart loses none', r.keptDay);
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8'), FOLD = '    else if (ans.removed) { const d = st.day || (st.day = { day: today, removed: 0, entries: 0, passes: 0 }); d.removed += ans.removed; d.entries += ans.entries || 0; d.passes++; }';
  ok(JSRC.split(FOLD).length === 2, 'B-c330 control setup: the fold is one line in jobs.js (the plant the control swaps)');
  const MJ30 = mutantCopies('jobs-logs-fold-c330', ROOT);
  const rx = await scene(MJ30.load('src/jobs.js', editAnchor(JSRC, FOLD, '    else if (ans.removed) this.d.log(LS.words.pass(ans));   /* MUTANT: the release — a line every pass */', "src/jobs.js"), 'release'), 'jobs-triage-logs-fold-mut');
  ok(rx.day1.length === 4, 'B-c330 CONTROL (the release, in a copy): every steady pass says its own line (four in a morning)', rx.day1.length);
  for (const rr of copiesCensus(MJ30.files, MJ30.dir, ROOT, { minCopies: 1, label: 'B-c330 ' })) ok(verdictOf(rr.pass), rr.name + (rr.pass ? '' : ' — ' + rr.detail));
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
    // r3796 (B-7e49): the mirror's appends to this job's folder, counted in flight (each ended a turn after it settles) — what the
    // tail's wait ends on: a copy that never mirrors ends at once, not at a 500 ms clock
    const prA = fs.promises.appendFile, ap = { n: 0 }; fs.promises.appendFile = function (f, ...a) { const p = prA.call(this, f, ...a); if (String(f).startsWith(ctl)) { ap.n++; const done = () => setImmediate(() => { ap.n--; }); p.then(done, done); } return p; };
    const waiting = J.waitFor(J.ansWaiters, job.id, 60_000).then(() => 'woken');
    const asked = job.state;
    const w = J.withdrawAsk(job);
    landedU4();   // the deferred-save census: the withdraw's steps (the mirror, the wait, the For-you item) ride its landing — landed here
    const woke = await Promise.race([waiting, new Promise((r) => setImmediate(() => r('still waiting')))]);
    const again = J.withdrawAsk(job);
    let tail = ''; for (let k = 0; k < 50 && !tail; k++) { const none = !ap.n; try { tail = fs.readFileSync(path.join(ctl, 'answers.jsonl'), 'utf8'); } catch { } if (tail || none) break; await new Promise((r) => setTimeout(r, 10)); }   // the mirror appends OFF the loop (a read made with no append in flight is the last one)
    fs.promises.appendFile = prA;
    const out = { posted: posted.version, asked, w, state: job.state, pending: job.interaction && job.interaction.pending, resolved, woke, again, recorded: ((job.interaction && job.interaction.answers) || []).filter((x) => x && x.withdrawn === true).map((x) => x.version), stdin: tail.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.withdrawn === true).length };
    J.shutdown(); return out;
  };
  const r = await scene({ JobManager }, 'jobs-triage-withdraw');
  ok(r.asked === 'awaiting-user' && gateOf(r.w.ok) && r.w.version === r.posted && r.pending === null && r.state === 'up' && r.resolved.join() === 'jb-8bd50001' && r.woke === 'woken' && r.recorded.join() === String(r.posted), 'B-8bd5: a job WITHDRAWS its own panel — closed, its For-you item resolved, a waiting `answers --wait` woken (the answers record the withdraw, as an expiry), back to «up»', r);
  ok(gateOf(r.again.ok) && verdictOf(/no panel of this job is open/.test(r.again.already || '')), 'B-8bd5: withdrawn twice — answered, nothing changed');
  ok(r.stdin === 1, 'B-8bd5 (主开发 21:46Z): a stdin-open job reads the withdraw on its stdin (the wrapper\'s answers tail file), as it reads an answer', r.stdin);
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  // the deferred-save census: the withdraw's resolve RIDES its landing (inside the step); its stdin mirror is written FIRST, at the act's
  // time (the census cure, finding 8: a file another process reads, the release's order) — the controls cut each, plants asserted by anchored()
  const RES = "      this._resolveAns(job);\n      try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id); } catch { }\n    });";
  const MJ8 = mutantCopies('jobs-withdraw-8bd5', ROOT);
  const rx = await scene(MJ8.load('src/jobs.js', anchored(JSRC, RES, "      this._resolveAns(job);\n      /* MUTANT: no resolve — the item stays */\n    });", 'the withdraw\'s resolve'), 'no-resolve'), 'jobs-triage-withdraw-mut');
  ok(rx.resolved.length === 0, 'B-8bd5 CONTROL (the withdraw without its resolve, in a copy): the For-you item STAYS open — what the row reported', rx.resolved);
  const MIR = "    if (ctl) { try { fs.promises.appendFile(path.join(ctl, 'answers.jsonl'), JSON.stringify(wrec) + '\\n').catch(() => { }); } catch { } }";   // the census cure (finding 8): written FIRST, at the act's time (the release's order) — outside the riding step
  const rm = await scene(MJ8.load('src/jobs.js', anchored(JSRC, MIR, '      /* MUTANT: no stdin mirror */', 'the stdin mirror of a withdraw'), 'no-mirror'), 'jobs-triage-withdraw-mut2');
  ok(rm.stdin === 0, 'B-8bd5 CONTROL (no mirror, in a copy): the stdin-open job never sees the withdraw', rm.stdin);
  for (const rr of copiesCensus(MJ8.files, MJ8.dir, ROOT, { minCopies: 1, label: 'B-8bd5 ' })) ok(verdictOf(rr.pass), rr.name + (rr.pass ? '' : ' — ' + rr.detail));
  const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf8');
  ok(gateOf(/const JOB_SELF_ACTS = Object\.freeze\(\['progress', 'ask', 'withdraw', 'announce'\]\);/.test(fs.readFileSync(path.join(ROOT, 'src/job-model.js'), 'utf8'))) && gateOf(/if \(a\.selfJob\) \{ const v = jobModel\.jobTokenVerdict\(a\.selfJob, job, act, ref, \{ write: true \}\);/.test(ar)) && !/const needsControl = \[[^\]]*'withdraw'[^\]]*\];/.test(ar) && gateOf(/if \(!a\.selfJob && act === 'withdraw' && !jobModel\.canEdit\(job, a\.caller\)\) return jobModel\.canView\(job, a\.caller\) \? res\.status\(403\)/.test(ar)) && gateOf(/else if \(act === 'withdraw'\) r = a\.jm\.withdrawAsk\(job, \{ self: !!a\.selfJob \}\);/.test(ar)) && gateOf(/case 'withdraw': \{/.test(cli)) && verdictOf(/vibespace-job withdraw \(its cause is gone\)/.test(cli)), 'WIRING: a job token withdraws its OWN panel; a conversation only as its owner — a control grant never withdraws (its route leg: test-jobs-addressed §0); the CLI has `withdraw` (in its usage)');
}

console.log('§U4 lane lg-store-writes (B-0248): THE STORE\'S SAVE GOES THROUGH THE STORE WRITER — jobs.json and job-notifications.json are never written on the main thread at a change');
{
  const ACC = { view: 'all', control: 'all' };
  const seedRec = (id) => ({ id, kind: 'task', name: 'u4 ' + id.slice(-2), state: 'done', owner: {}, access: ACC, runs: [{ startedAt: T0 - H - 1000, endedAt: T0 - H, exit: 0 }], createdAt: T0 - H - 1000 });   // ended an hour ago: never archived by the boot sweep's 24 h policy, however slow the box
  /** a store writer stand-in: it lands NOTHING until told (land / flushSync), records every hand-off */
  const standIn = () => {
    const r = { dirties: [], durables: [], flushes: [], owed: new Map(), exitAt: null };
    r.dirty = (f, o) => { r.dirties.push({ f: path.basename(f), name: o.name, rank: o.rank, urgent: !!o.urgent }); r.owed.set(f, o); };
    r.durable = (f) => { r.durables.push(path.basename(f)); return Promise.resolve(true); };
    // the writer's synchronous answer road (the U4/U5 cure): records what it was asked, answers `r.answer` IN PLACE
    r.answer = true; r.waits = [];
    r.whenDurable = (files, o, ans) => { r.waits.push({ files: files.map((f) => path.basename(f)), timeoutMs: o && o.timeoutMs }); const v = r.answer; if (ans) ans(v); return Promise.resolve(v); };
    r.pending = (f) => r.owed.has(f);
    r.flushSync = (files) => { r.flushes.push(files.map((f) => path.basename(f)).join('+')); for (const f of files) { const o = r.owed.get(f); if (!o) continue; fs.writeFileSync(f, o.produce()); r.owed.delete(f); if (o.onWritten) o.onWritten(true, null); } return { written: files, left: [] }; };
    r.land = () => r.flushSync([...r.owed.keys()]);
    r.exitStartedAt = () => r.exitAt;
    return r;
  };
  const scene = (JMod, tag) => {
    const d = mkDir('jobs-triage-u4-' + tag), F = path.join(d, 'jobs.json');
    fs.writeFileSync(F, JSON.stringify([seedRec('jb-0248a401')]));
    const rec = standIn();
    const J = new JMod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: rec });
    J.init();
    const before = fs.readFileSync(F, 'utf-8');
    const job = J.jobs.get('jb-0248a401');
    job.name = 'u4 renamed'; J._touch(job); J._save();   // a direct save (an act)
    return { d, F, rec, J, job, unchanged: fs.readFileSync(F, 'utf-8') === before };
  };
  const a = scene({ JobManager }, 'moved');
  const acts = a.rec.dirties.slice();
  ok(gateOf(a.unchanged) && gateOf(acts.some((x) => x.f === 'jobs.json' && x.name === 'jobs.write' && x.rank === 0)) && gateOf(acts.some((x) => x.f === 'job-notifications.json' && x.name === 'jobs-notifs.write' && x.rank === 0))
    && gateOf(acts.every((x) => x.urgent)) && a.rec.durables.length === 0,
    'U4: a direct save (an act) hands jobs.json and job-notifications.json to the writer by name, rank 0 + URGENT (the writer\'s own flag — the U4/U5 cure: no durable() timer asked at a save) — the file is NOT written on the main thread at the change', { unchanged: a.unchanged, acts, durables: a.rec.durables });
  a.rec.dirties.length = 0; a.rec.durables.length = 0;
  a.J._dirty = true; a.J._save({ paced: true });   // the 2 s tick
  ok(a.rec.dirties.length === 2 && gateOf(a.rec.dirties.every((x) => x.rank === undefined && !x.urgent)) && a.rec.durables.length === 0, 'U4: the 2 s tick hands both files PACED — no rank, not urgent, no durable()', a.rec.dirties);
  // THE CENSUS CURE (主开发 19:44Z, the last hunt's findings 1 and 2): A NOTICE STASHED ANYWHERE MARKS ITS STORE URGENT AT THE STASH —
  // a stashed notice (here: the 2 s tick's paced hand-off already owed) makes job-notifications.json the writer's NEXT write (rank 0,
  // urgent): never left to the paced tick (a kill before it lost the only copy). RED (anchored): the stash without its mark
  const stashMark = (JMod, tag) => {
    const sc = scene(JMod, 'stash-' + tag);
    sc.rec.dirties.length = 0;
    sc.J._stashNotif('cid-stash01', sc.job, { what: 'its end', at: Date.now() }, 'a stand-in rate floor');
    const marks = sc.rec.dirties.filter((x) => x.f === 'job-notifications.json');
    try { sc.J.shutdown(); } catch { }
    return { marks, urgent: marks.some((x) => x.rank === 0 && x.urgent && x.name === 'jobs-notifs.write') };
  };
  const sm = stashMark({ JobManager }, 'real');
  ok(verdictOf(sm.urgent), 'THE CENSUS CURE (findings 1, 2): a notice STASHED marks job-notifications.json urgent AT THE STASH (rank 0) — the writer\'s next write, never the paced tick\'s', sm.marks);
  const MJS = mutantCopies('jobs-stash-urgent', ROOT);
  const smx = stashMark(MJS.load('src/jobs.js', anchored(fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8'), '    this._notifsUrgent();   // THE STASH MARKS ITS STORE URGENT', '    // MUTANT: no urgent mark   // THE STASH MARKS ITS STORE URGENT', 'the stash marks its store'), 'stash-unmarked'), 'mut');
  ok(!smx.urgent, 'CONTROL (a stash without its urgent mark, in a copy): nothing hands the notices to the writer at the stash — red', smx.marks);
  for (const rr of copiesCensus(MJS.files, MJS.dir, ROOT, { minCopies: 1, label: 'stash-urgent ' })) ok(verdictOf(rr.pass), rr.name + (rr.pass ? '' : ' — ' + rr.detail));
  const bytes = JSON.parse(a.rec.owed.get(a.F).produce());
  ok(bytes.length === 1 && bytes[0].name === 'u4 renamed' && !JSON.stringify(bytes).includes('"_'), 'U4: the bytes are the records when the write is due — a later change rides the same write, runtime-only `_` keys never persisted', bytes);
  // a new engine in the same process while the writes are owed: its load lands them first
  const flushes0 = a.rec.flushes.length;
  // (the first engine stays up — a suite's restart in the same process)
  const B = new JobManager({ dataDir: a.d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: a.rec });
  B._load();
  ok(a.rec.flushes.length === flushes0 + 1 && a.rec.flushes[flushes0] === 'jobs.json+job-notifications.json' && gateOf(B.jobs.get('jb-0248a401')) && B.jobs.get('jb-0248a401').name === 'u4 renamed', 'U4: an engine made AGAIN while the store is owed lands exactly those two files first, then reads them', { flushes: a.rec.flushes });
  // the hub's exit: the store lands at the writer's exit flush — the lock goes only once jobs.json holds it
  a.J._touch(a.job); a.J._save({ paced: true });
  a.rec.exitAt = 1;
  a.J.shutdown();
  const lockAtExit = fs.existsSync(a.J.lockFile);
  a.rec.land();
  const lockAfter = fs.existsSync(a.J.lockFile);
  ok(gateOf(lockAtExit) && !lockAfter, 'U4: at the hub\'s exit the lock stays until jobs.json has landed (the writer\'s exit flush), then it goes', { lockAtExit, lockAfter });
  // a shutdown OUTSIDE the hub's exit (a suite's engine): the store lands now, then the lock goes
  const c = scene({ JobManager }, 'down');
  c.J.shutdown();
  ok(!c.rec.pending(c.F) && JSON.parse(fs.readFileSync(c.F, 'utf-8'))[0].name === 'u4 renamed' && !fs.existsSync(c.J.lockFile), 'U4: a shutdown outside the hub\'s exit lands the store at once (the next engine reads it), then removes the lock', { lock: fs.existsSync(c.J.lockFile) });
  let done = false; const p = c.J.persisted().then((v) => { done = v; }); await p;
  ok(done === true, 'U4: persisted() — what an act\'s route waits on — resolves with the writer\'s answer for both files (the real writer\'s whenDurable: test-store-writer-r4 ⑨ (c))');
  c.rec.answer = false;
  const notSaved = await c.J.persisted();
  ok(notSaved === false, 'U4: persisted() answers FALSE when a write did not land (the route says notOnDisk — the act stays applied in memory)');
  // the U4/U5 cure: the route's answer rides the writer's SYNCHRONOUS road (called in place, never a microtask later — the
  // hub's exit leaves in its flush's own run), for BOTH files, bounded UNDER the CLI's write budget (a stalled mount answers
  // «notOnDisk» before the command gives up — never a reset that makes an agent repeat a create)
  const BUDGET_W = require(path.join(ROOT, 'src/cli-call.js')).BUDGETS.write;
  let inPlace = null; c.J.persisted((v) => { inPlace = v; });
  ok(inPlace === false && c.rec.waits.length >= 3 && verdictOf(c.rec.waits.every((w) => w.files.join('+') === 'jobs.json+job-notifications.json' && w.timeoutMs > 0 && w.timeoutMs < BUDGET_W)),
    `U4 cure: persisted(answer) answers IN PLACE through the writer's whenDurable — both files, bounded under the CLI's ${BUDGET_W / 1000} s write budget (src/cli-call.js)`, c.rec.waits);
  // a CLAIM (a hand-over's stamp) is ON DISK when claimNotifs returns — the exactly-once law (verify r2), through the writer
  const k = scene({ JobManager }, 'claim');
  k.J.pendingNotifs.set('conv-u4', [{ jobId: 'jb-0248a401', what: 'done', at: T0 }]);
  const flushesK = k.rec.flushes.length;
  k.J.claimNotifs('conv-u4', k.J.pendingNotifs.get('conv-u4'), 'ho-u4');
  const claimedOnDisk = (() => { try { return (JSON.parse(fs.readFileSync(path.join(k.d, 'job-notifications.json'), 'utf-8'))['conv-u4'] || [])[0].ho === 'ho-u4'; } catch { return false; } })();
  ok(gateOf(claimedOnDisk) && verdictOf(k.rec.flushes.slice(flushesK).includes('job-notifications.json')), 'U4: a notifications CLAIM is on disk when claimNotifs returns (its one file waited for through the writer) — a kill after it never delivers twice', { claimedOnDisk, flushes: k.rec.flushes.slice(flushesK) });
  k.J.shutdown();
  // THE U4/U5 CURE (1) — A CHILD THE DISK DOES NOT HOLD IS NEVER STARTED: the run's intent not on disk inside the writer's
  // bound (a stalled mount), or deferred to the exit's flush ⇒ NO child; the start refused by name, the record failed
  const stalled = (how) => {
    const r = standIn(), landing = r.flushSync;
    r.unstall = () => { r.flushSync = landing; };   // the storage answers again: the next flush lands (and calls each store's onWritten)
    // the writer's word on what it has IN FLIGHT: jobs.json's write, held (no write of it landed) — the cure 2's «same write» test
    r.stats = () => [...r.owed.keys()].map((f) => ({ file: f, name: r.owed.get(f).name, inflight: path.basename(f) === 'jobs.json', writes: 0 }));
    r.flushSync = (files) => { r.flushes.push(files.map((f) => path.basename(f)).join('+')); return how === 'deferred' ? { written: [], left: [], deferred: true } : { written: [], left: files.map((f) => ({ file: f, name: 'jobs.write', why: 'its write was still held by the storage at the bound (30.0 s)' })) }; };
    return r;
  };
  const spawnScene = (JMod, tag, rec) => {
    const d = mkDir('jobs-triage-u4-spawn-' + tag), F = path.join(d, 'jobs.json');
    fs.writeFileSync(F, JSON.stringify([{ ...seedRec('jb-0248a402'), cmd: { argv: ['/bin/true'], cwd: d }, ack: 1234 }]));
    const said = [];
    const J = new JMod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: (...x) => said.push(x.join(' ')), archivePolicy: () => policy, writer: rec });
    J.init();
    const job = J.jobs.get('jb-0248a402'), runs0 = (job.runs || []).length;
    let threw = null; try { J._spawn(job, 'manual'); } catch (e) { threw = e.message; }
    const last = (job.runs || [])[job.runs.length - 1];
    return { J, threw, state: job.state, proc: job.proc || null, asked: !!job.proc || !!(last && last.ask), runs: (job.runs || []).length - runs0, said: said.filter((l) => /the run's intent/.test(l)), ack: job.ack };   // B-91aa's remainder: a start is ASKED of the starter (its pid answered a turn later) — `asked` reads either road
  };
  for (const how of ['held', 'deferred']) {
    const s1 = spawnScene({ JobManager }, how, stalled(how));
    ok(gateOf(/^not started \(manual\): its run could not be recorded on disk first/.test(s1.threw || '')) && gateOf(/start it again once the storage answers$/.test(s1.threw || '')) && s1.state === 'failed' && !s1.proc && s1.runs === 0 && s1.said.length === 1 && s1.ack === 1234,
      `U4 cure (1): the run's intent NOT on disk (${how === 'held' ? 'held past the writer\'s bound' : 'deferred to the exit\'s flush'}) ⇒ NO child — the start refused by name and its door («start it again»), the record failed, its run entry taken back, its ack untouched (cure 2), said once`, { threw: s1.threw, state: s1.state, proc: s1.proc, runs: s1.runs, said: s1.said, ack: s1.ack });
    s1.J.shutdown();
  }
  const jsrcSp = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const aSp = '    if (!intent.ok) {';
  const NoCheck = mutantCopies('jobs-triage-u4-spawn', ROOT).load('src/jobs.js', anchored(jsrcSp, aSp, '    if (false) {', 'the run\'s intent check (_spawn)'), 'no-intent-check');   // ALSO CURED (the moved2 cure 2): through anchored()
  const s2 = spawnScene(NoCheck, 'red', stalled('held'));
  ok(!s2.threw && verdictOf(s2.asked), 'U4 cure (1) CONTROL: the check removed (a mutant copy) ⇒ a child IS started (asked of the starter) while its run is not on disk — the check above would be red', { threw: s2.threw, proc: s2.proc, state: s2.state });
  try { if (s2.proc && s2.proc.pid) process.kill(s2.proc.pid, 'SIGKILL'); } catch { }
  s2.J.shutdown();
  // the cure's own adversarial read: (a) a REFUSED cron fire moves the schedule to its NEXT slot — never a re-fire at every
  // 30 s tick (each would wait the writer's bound again); (b) a refused restart / replay keeps what the record was (a service
  // stays 'down'), a person's start is 'failed'; (c) while the refused intent's store is still held, the next start is refused
  // AT ONCE — no second wait on the main thread. RED: the cron's catch removed ⇒ its next fire stays in the past
  const cronScene = (JMod, tag) => {
    const d = mkDir('jobs-triage-u4-cron-' + tag), F = path.join(d, 'jobs.json'), rec = stalled('held');
    const due = Date.now() - 1000;
    fs.writeFileSync(F, JSON.stringify([{ id: 'jb-0248a403', kind: 'cron', name: 'u4 cron', state: 'scheduled', desiredUp: true, owner: {}, access: ACC, schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['/bin/true'], cwd: d } } }, nextFireAt: due, runs: [], createdAt: T0 - H }]));
    const J = new JMod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: rec });
    J.init();   // its first cron tick runs inside init: the fire, refused
    const cron = J.jobs.get('jb-0248a403'), child = [...J.jobs.values()].find((x) => x.cronParent === 'jb-0248a403') || null;
    return { J, rec, cron, child, due, next: cron.nextFireAt };
  };
  const c1 = cronScene({ JobManager }, 'cure');
  const flushesAfterFire = c1.rec.flushes.length;
  await c1.J._cronTick();
  ok(gateOf(c1.child) && c1.child.state === 'failed' && !c1.child.proc && c1.next > Date.now() && c1.rec.flushes.length === flushesAfterFire,
    'U4 cure (1): a cron fire whose run is not on disk ⇒ no child, said; the schedule moves to its NEXT slot — the next tick fires nothing again', { child: c1.child && c1.child.state, next: c1.next, due: c1.due, flushes: c1.rec.flushes.length - flushesAfterFire });
  c1.J.shutdown();
  const jsrcCr = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const cA = "        try { this._fireCron(job, isCatchUp ? 'boot' : 'cron'); }\n        catch (e) {\n", cB = "        job.nextFireAt = job.schedule.at ? null : M.nextFire(job.schedule, now(), undefined, job.nextFireAt); // lane int361";
  ok(jsrcCr.split(cA).length === 2 && jsrcCr.indexOf(cB) > jsrcCr.indexOf(cA), 'U4 cure ANCHOR: the cron tick\'s refused-fire catch');
  const NoCatch = mutantCopies('jobs-triage-u4-cron', ROOT).load('src/jobs.js', jsrcCr.slice(0, jsrcCr.indexOf(cA)) + "        this._fireCron(job, isCatchUp ? 'boot' : 'cron');\n" + jsrcCr.slice(jsrcCr.indexOf(cB)), 'no-cron-catch');   // stale-pins: kept — the negative control rebuilds the cron tick as it was before the cure
  const c2 = cronScene(NoCatch, 'red');
  ok(c2.next === c2.due, 'U4 cure (1) CONTROL: the catch removed (a mutant copy) ⇒ the refused fire leaves the schedule in the past — it fires again at every 30 s tick', { next: c2.next, due: c2.due });
  c2.J.shutdown();
  {
    const d = mkDir('jobs-triage-u4-svc'), F = path.join(d, 'jobs.json'), rec = stalled('held'), said = [];
    fs.writeFileSync(F, JSON.stringify([{ id: 'jb-0248a404', kind: 'service', name: 'u4 svc', state: 'down', desiredUp: true, owner: {}, access: ACC, cmd: { argv: ['/bin/true'], cwd: d }, runs: [], supervise: { consecutiveFails: 0, parkedAt: null }, createdAt: T0 - H }]));
    const J = new JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: (...x) => said.push(x.join(' ')), archivePolicy: () => policy, writer: rec });
    J.init();   // the boot's replay of a 'down' service: refused
    const svc = J.jobs.get('jb-0248a404'), st1 = svc.state, f1 = rec.flushes.length;
    let threw = null; try { J._spawn(svc, 'manual'); } catch (e) { threw = e.message; }
    ok(st1 === 'down' && !svc.proc && gateOf(/the storage still holds jobs\.json's write/.test(threw || '')) && rec.flushes.length === f1 && svc.state === 'failed',
      'U4 cure (1): a refused boot replay keeps the service DOWN (said); while the store is still held the next start is refused AT ONCE — no second wait — and a person\'s start is failed', { st1, threw, flushes: rec.flushes.length - f1, state: svc.state });
    J.shutdown();
  }
  // THE U4/U5 CURE 2 (主开发 12:19Z): A REFUSED START COMES BACK BY ITSELF where the release's would have — a supervised
  // service whose boot replay was refused (its run not on disk) is started again once the store LANDS; its words name the
  // door. RED: a mutant copy without the retry in _storeWritten ⇒ it stays down
  const backScene = async (JMod, tag) => {
    const d = mkDir('jobs-triage-u4-back-' + tag), F = path.join(d, 'jobs.json'), rec = stalled('held'), said = [];
    fs.writeFileSync(F, JSON.stringify([{ id: 'jb-0248a405', kind: 'service', name: 'u4 back', state: 'down', desiredUp: true, owner: {}, access: ACC, cmd: { argv: ['/bin/true'], cwd: d }, runs: [], supervise: { consecutiveFails: 0, parkedAt: null }, createdAt: T0 - H }]));
    const J = new JMod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: (...x) => said.push(x.join(' ')), archivePolicy: () => policy, writer: rec });
    J.init();   // the boot's replay: refused (the store held)
    const svc = J.jobs.get('jb-0248a405'), st1 = svc.state, words = (J.events.filter((e) => e.jobId === svc.id).pop() || {}).what || '';
    rec.unstall(); rec.land();   // the storage answers: the store lands (its onWritten)
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    await J.startAnswer(svc, 0);   // B-91aa's remainder: the start is ASKED of the starter — its answer (a pipe turn later) is the fact
    return { J, st1, words, state: svc.state, proc: svc.proc || null };
  };
  const b1 = await backScene({ JobManager }, 'cure');
  ok(b1.st1 === 'down' && gateOf(/it starts again by itself once the store is on disk$/.test(b1.words)) && b1.state === 'up' && !!b1.proc,
    'U4/U5 cure 2: a service whose boot replay was refused (its run not on disk) says it comes back by itself — and IS started again once the store lands', { st1: b1.st1, words: b1.words, state: b1.state, proc: b1.proc });
  try { if (b1.proc && b1.proc.pid) process.kill(b1.proc.pid, 'SIGKILL'); } catch { }
  b1.J.shutdown();
  const jsrcBk = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const aBk = "    if (this._refusedForDisk && this._refusedForDisk.size && !this._retryArmed) {";
  const NoBack = mutantCopies('jobs-triage-u4-back', ROOT).load('src/jobs.js', anchored(jsrcBk, aBk, '    if (false) {', 'the retry armed when the store lands (_storeWritten)'), 'no-retry');
  const b2 = await backScene(NoBack, 'red');
  ok(b2.state === 'down' && !b2.proc, 'U4/U5 cure 2 CONTROL: without the retry (a mutant copy) the refused service stays DOWN after the store lands', { state: b2.state, proc: b2.proc });
  b2.J.shutdown();
  // a refused ONE-SHOT's words name its door (a one-time schedule does not come back by itself — schedule it again)
  {
    const d = mkDir('jobs-triage-u4-at'), F = path.join(d, 'jobs.json'), rec = stalled('held');
    fs.writeFileSync(F, JSON.stringify([{ id: 'jb-0248a406', kind: 'cron', name: 'u4 at', state: 'scheduled', desiredUp: true, owner: {}, access: ACC, schedule: { at: Date.now() - 1000 }, action: { type: 'spawn-task', task: { cmd: { argv: ['/bin/true'], cwd: d } } }, nextFireAt: Date.now() - 1000, runs: [], createdAt: T0 - H }]));
    const J = new JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: rec });
    J.init();
    const cron = J.jobs.get('jb-0248a406'), words = (J.events.filter((e) => e.jobId === cron.id).pop() || {}).what || '';
    ok(cron.state === 'failed' && cron.desiredUp === false && verdictOf(/a one-time schedule does not come back by itself: schedule it again \(vibespace-job run … --at "\+5m", or a new time\) if it still matters$/.test(words)),
      'U4/U5 cure 2: a refused ONE-SHOT is parked and its words name the door — schedule it again (vibespace-job run … --at)', { state: cron.state, desiredUp: cron.desiredUp, words });
    J.shutdown();
  }
  // RED CONTROL: the change removed — the old synchronous save (the writer bypassed)
  const jsrcU4 = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const aU4 = "  _writer() { return this.d.writer || require('./store-writer.js').storeWriter(); }";
  const SyncJ = mutantCopies('jobs-triage-u4', ROOT).load('src/jobs.js', anchored(jsrcU4, aU4, "  _writer() { return { dirty: (f, o) => fs.writeFileSync(f, o.produce()), durable: async () => true, pending: () => false, flushSync: () => ({ written: [], left: [] }), exitStartedAt: () => null }; }"), 'sync-save');
  const r = scene(SyncJ, 'red');
  ok(!r.unchanged, 'U4 CONTROL: the old synchronous save (the writer bypassed, a mutant copy) ⇒ jobs.json is written on the main thread at the change — the first check above would be red');
  r.J.shutdown();
}

console.log('§12 B-2566: a failure of a job whose owner conversation is not running reaches a PERSON by name — one item a job, renewed with its count');
{
  const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
  const JM_MODEL = require(path.join(ROOT, 'src/job-model.js'));
  // a leg that judges prints every fact it judges (the .414 gates' rule) — on a pass too
  const okP = (c, n, facts) => { ok(verdictOf(c), n, facts); if (c) console.log('    ' + (typeof facts === 'string' ? facts : JSON.stringify(facts))); };
  const settle = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 5)); } return !!fn(); };
  const AWAY = { ok: false, reason: 'no live inbox for this conversation on any reachable machine', notRunning: true };
  // the ladder's own verdicts, as conversation-deliver answers them on the train (B-95fc): `live` = a peer lane (reachable, takes messages);
  // `local` = a LOCAL conversation that runs but takes no message mid-turn (opencode / ACP / Codex in a terminal): no peer lane, its delivery
  // parks; `ended` = a reachable PAIRED owner whose machine said it ended there (the remote rung's notRunning + remoteEnded). The park's own
  // «live» (liveForWake) = a session here, or a reachable machine that has not said it ended — any other conversation is NOT RUNNING
  const rig = (name, wiringMod = wiring, dir0 = null) => {   // dir0: an earlier rig's folder (r1861: A RESTART — a new engine and a new For-you store on it)
    const clock = { skew: 0 };   // the For-you store's own clock, placed (r1277: the next-outage leg steps it, never the store's internals)
    const dir = dir0 || mkDir(name), todos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0, now: () => Date.now() + clock.skew }), logs = [], live = new Set(), local = new Set(), ended = new Set(), metas = [];
    // B-2566's remainder: `down` = a conversation on a paired machine (cid → its host id); `hostsDown` = a machine that cannot be reached
    // (host id → since when it is silent) — the ladder's verdict as conversation-deliver answers it (its connect missed, the list says offline)
    const down = new Map(), hostsDown = new Map();
    const away = (cid) => { const h = down.get(cid); return h && hostsDown.has(h) ? { hostId: h, since: hostsDown.get(h) } : null; };
    const W = wiringMod.create({ app: fakeApp().app, dataDir: dir, broadcastAll: () => { }, userTodos: todos, log: (...a) => logs.push(a.join(' ')), serverSetting: () => undefined, taskGroups: null, activeSessions: new Map(),
      deliver: {
        peerReachable: (cid) => live.has(cid),
        liveForWake: (cid) => !away(cid) && (local.has(cid) || (live.has(cid) && !ended.has(cid))),
        unreachableOf: (cid) => away(cid),
        machineAwayOf: (hid) => (hostsDown.has(hid) ? { since: hostsDown.get(hid), held: 1 } : null),   // the ladder's: away, or a held wake still owed its word
        machineNameOf: (hid) => (hid === 'h-b' ? 'laptop-b' : String(hid)),
        deliverToConversation: async (cid, text, opts) => { if (opts && opts.retry) metas.push({ cid, meta: opts.retry.meta }); const u = away(cid); if (u) return { ok: false, lane: 'remote-message', hostId: u.hostId, reason: 'the machine did not answer within 6000 ms', notRunning: true, unreachable: true, since: u.since }; if (down.has(cid)) return { ok: true, lane: 'remote-message', hostId: down.get(cid) }; return ended.has(cid) ? { ok: false, lane: 'remote-message', hostId: 'h-paired', reason: 'no live inbox for this conversation on that machine', notRunning: true, remoteEnded: true } : live.has(cid) ? { ok: true, lane: 'message' } : local.has(cid) ? { ok: false, parked: true, reason: 'busy', phase: 'mid-turn', busy: true } : AWAY; },
      } });
    W.initAfterListen();
    return { dir, W, jm: W.jm, todos, logs, live, local, ended, metas, down, hostsDown, clock, stop: () => { W.shutdown?.(); todos.stop(); } };
  };
  const owner = (cid) => ({ conversation: { backend: 'claude', id: cid }, sessionId: 's-' + cid, sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] });
  const task = (R, id, name, cid, extra = {}) => { const j = { id, kind: 'task', name, note: '', state: 'failed', desiredUp: false, owner: owner(cid), access: { view: 'group', control: 'session' }, runs: [{ startedAt: Date.now() - 60e3, endedAt: Date.now(), exit: 1, cause: 'error', lastLine: 'Error: frame 7 failed to render' }], notifyLog: [], ...extra }; R.jm.jobs.set(id, j); return j; };
  const schedule = (R, id, name, cid) => { const c = { id, kind: 'cron', name, state: 'scheduled', owner: owner(cid), access: { view: 'group', control: 'session' }, runs: [], notifyLog: [] }; R.jm.jobs.set(id, c); return c; };
  const failOf = (R, j, what = 'failed exit=1 error (1m)', extra = {}) => R.jm._notifyOwner(j, { what, wake: 'result', ...extra });
  const awayItems = (R, cid) => { const s = R.todos.snapshot(); return [...s.open, ...s.resolved].filter((i) => i.sessionKey === `claude:${cid}` && i.jobFact === 'away-failed'); };
  const waitItems = (R, cid) => { const s = R.todos.snapshot(); return [...s.open, ...s.resolved].filter((i) => i.itemKey === `jobs-wake-waiting:${cid}`); };
  const inboxLines = (j) => (j.notifyLog || []).filter((l) => l.lane === 'user-inbox' && l.copy === 'away-failed').length;
  const cidOf = (n) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  // ── THE MEASURE FIRST (主开发 r327; the round's MUST 3: on the shape production has) — jobs-triage-fixture.mjs, the owner's measured instance
  //    (248 task records, 36 failed one-shots over five days): the failures it journals as STASHED for an owner that was not running
  {
    const R = rig('away-measure'), NOW = Date.now(), D = 86400e3, fx = makeFixture(NOW);
    const away = fx.failedRows.filter((r) => r.kind === 'stash').map((r) => fx.jobs.find((x) => x.id === r.id));
    for (const j of away) { R.jm.jobs.set(j.id, { ...j, notifyLog: [] }); failOf(R, R.jm.jobs.get(j.id)); }
    await settle(() => SESSIONS.reduce((n, s) => n + awayItems(R, s.conversationId).length, 0) >= away.length);
    const all = SESSIONS.flatMap((s) => awayItems(R, s.conversationId));
    const perDay = {}; for (const j of away) { const d = Math.floor((NOW - j.runs[0].endedAt) / D); perDay[d] = (perDay[d] || 0) + 1; }
    const busiest = Math.max(...Object.values(perDay));
    okP(away.length === 6 && all.length === 6 && new Set(all.map((i) => i.jobId)).size === 6 && busiest === 2,
      'MEASURED: on the fixture\'s five days (36 failed, 6 of them stashed for an owner that was not running) it files 6 items — one a job, at most 2 a day',
      { failed: fx.failedRows.length, stashedForAnAwayOwner: away.length, itemsFiled: all.length, perDayByAge: perDay, busiestDay: busiest });
    // A SCHEDULE THAT FAILS EVERY MINUTE FOR A DAY, as the engine runs one: ONE persistent child a schedule (src/jobs.js, the cron fire
    // reuses `cronParent`'s child), the same words every time ⇒ after the first, every failure goes through the 10-minute duplicate branch
    const C = cidOf(0xc001), cron = schedule(R, 'jb-cron-min', 'sync-every-minute', C), child = task(R, 'jb-cron-min-run', 'sync-every-minute run', C, { cronParent: cron.id });
    failOf(R, child);
    await settle(() => !!cron.awayFail && awayItems(R, C).length === 1);   // the first failure's answer is back (a minute apart in life)
    for (let k = 1; k < 1440; k++) failOf(R, child);
    await settle(() => (cron.awayFail && cron.awayFail.count) === 1440);
    const ci = awayItems(R, C), dup = (child.notifyLog || []).filter((l) => l.lane === 'suppressed').length;
    okP(ci.length === 1 && ci[0].jobId === cron.id && cron.awayFail.count === 1440 && ci[0].i18n.text.params.count === '1440' && child.lastNotify && child.lastNotify.lane === 'suppressed',
      'MEASURED: ONE child failing every minute for a day (1440 failures, the same words — the duplicate window\'s branch after the first) ⇒ ONE item under the schedule, its count 1440 — never once a failure',
      { failures: 1440, items: ci.length, jobId: ci[0] && ci[0].jobId, count: cron.awayFail && cron.awayFail.count, itemCount: ci[0] && ci[0].i18n.text.params.count, lastLane: child.lastNotify && child.lastNotify.lane, journalKeepsLast: dup });
    R.stop();
  }

  // ── THE LEGS ──
  const A = cidOf(0xd001), B = cidOf(0xd002);
  const R = rig('away-legs');
  const j1 = task(R, 'jb-away-1', 'render-7', A);
  failOf(R, j1);
  await settle(() => awayItems(R, A).length === 1);
  let it = awayItems(R, A)[0];
  okP(!!it && it.origin === 'jobs' && it.jobId === j1.id && it.sessionKey === `claude:${A}` && it.status === 'open' && it.urgency === 'normal'
      && /^Background job render-7 failed while its conversation was not running — exit 1 \(error\); failures since .+: 1$/.test(it.text) && it.i18n.text.key === JM_MODEL.FOR_YOU_WORDS['away-failed']
      && JM_MODEL.RUN_CAUSES.includes(it.i18n.text.params.cause) && it.i18n.text.params.since && it.i18n.text.params.since.at === j1.awayFail.since && inboxLines(j1) === 1,
    'ONE failure while the owner is away ⇒ ONE For-you item BY NAME under the owner conversation: the job, what failed (its exit and a cause of the CLOSED set — never the run\'s output), since when, the count; its jobId is For you\'s door to the job\'s row and log',
    { text: it && it.text, jobId: it && it.jobId, sessionKey: it && it.sessionKey, cause: it && it.i18n.text.params.cause, causeSet: JM_MODEL.RUN_CAUSES, since: it && it.i18n.text.params.since, journal: inboxLines(j1) });
  // MUST 2 (ruled): one away failure ⇒ ONE item — the conversation's «notices are waiting» leaves out a notice said by name; other notices still file it
  const one = R.jm.sayWakeWaiting(A);
  okP(one === null && waitItems(R, A).length === 0 && awayItems(R, A).length === 1,
    'MUST 2: ONE away failure ⇒ exactly ONE item under the owner (the named one) — the per-conversation «Background Work notices are waiting» is not filed for it',
    { conversationItem: one, waitItems: waitItems(R, A).length, named: awayItems(R, A).length });
  R.jm._stashNotif(A, task(R, 'jb-away-ok', 'export', A, { state: 'done' }), { what: 'done exit=0 ok (1m)' }, 'no live inbox', { held: { kind: 'not-running' } });
  const other = R.jm.sayWakeWaiting(A);
  okP(!!other && waitItems(R, A).length === 1, '…while ANOTHER notice (a success) waiting for the same away conversation still files it, as today', { conversationItem: other, waitItems: waitItems(R, A).length });
  failOf(R, j1);   // the SAME words within ten minutes: the duplicate the floor suppresses — still a failure, COUNTED
  failOf(R, j1, 'failed exit=2 error (1m)');   // other words inside the 30 s floor: stashed, counted
  await settle(() => j1.awayFail.count === 3 && /: 3$/.test((awayItems(R, A)[0] || {}).text || ''));
  it = awayItems(R, A)[0];
  okP(awayItems(R, A).length === 1 && j1.awayFail.count === 3 && /: 3$/.test(it.text) && it.status === 'open',
    'two more failures (one the window suppresses as a duplicate, one inside the 30 s floor) RENEW the one item — its count 3, never three items',
    { items: awayItems(R, A).length, count: j1.awayFail.count, text: it.text });
  // MUST 1: a conversation that RUNS but takes no message mid-turn (no peer lane) is LIVE — never «was not running», on any road
  {
    const L = cidOf(0xe001); R.local.add(L);
    const ja = task(R, 'jb-local-a', 'build-a', L), jb = task(R, 'jb-local-b', 'build-b', L);
    failOf(R, ja);   // the ladder parks it for retry (a live pid): the 30 s floor is stamped
    await settle(() => R.metas.some((m) => m.meta && m.meta.jobId === ja.id));
    failOf(R, jb);   // inside the floor: the floor's road
    const am = (R.metas.find((m) => m.meta && m.meta.jobId === ja.id) || {}).meta;
    okP(awayItems(R, L).length === 0 && !ja.awayFail && !jb.awayFail && (jb.notifyLog || []).some((l) => l.lane === 'stash'),
      'MUST 1: a LIVE local conversation with no peer lane — two failures within 30 s (the ladder parks the first, the floor stashes the second) ⇒ NO item: «not running» is the park\'s own verdict (liveForWake) on every road',
      { items: awayItems(R, L).length, firstParked: (ja.notifyLog || []).map((l) => l.lane), secondFloored: (jb.notifyLog || []).map((l) => l.lane) });
    // round item 10: the retry park carries the failure's OWN facts (its fall files THOSE)
    okP(!!am && am.ev && am.ev.away && am.ev.away.exit === 1 && am.ev.away.cause === 'error', 'the retry park\'s record carries the failure\'s own facts (exit 1, cause error) for its fall', am && am.ev);
    const E = cidOf(0xe002), je = task(R, 'jb-away-e', 'render-e', E);
    failOf(R, je);
    await settle(() => awayItems(R, E).length === 1);
    R.local.add(E);   // the owner runs again (resumed in a terminal: no peer lane)
    failOf(R, je); failOf(R, je, 'failed exit=4 error (1m)');   // the duplicate window's count, the floor's road
    okP(je.awayFail.count === 1 && /: 1$/.test(awayItems(R, E)[0].text),
      'MUST 1: once the owner RUNS again, a failure renews nothing — neither the duplicate window\'s count nor the floor (count stays 1)', { count: je.awayFail.count, text: awayItems(R, E)[0].text });
    R.local.delete(E);
    // the seam with B-95fc (主开发 r537): a PAIRED owner whose machine said it ended there is not live — for the park AND the named item
    const X = cidOf(0xe003), jx = task(R, 'jb-away-x', 'render-x', X);
    R.live.add(X); R.ended.add(X);
    failOf(R, jx);
    await settle(() => awayItems(R, X).length === 1);
    okP(awayItems(R, X).length === 1 && jx.awayFail && jx.awayFail.count === 1,
      'the seam (r537): a reachable PAIRED owner whose machine said the conversation ended there (remoteEnded) counts as NOT running — the named item is filed, as the park parks its wake', { items: awayItems(R, X).map((i) => i.text) });
    R.live.delete(X); R.ended.delete(X);
  }
  // a SCHEDULE's identity is the schedule: three runs of one cron ⇒ ONE item under the cron's id
  const cr = schedule(R, 'jb-away-cron', 'nightly-export', B);
  for (const k of [1, 2, 3]) failOf(R, task(R, 'jb-away-run-' + k, 'nightly-export run', B, { cronParent: cr.id }), `failed exit=${k} error (1m)`);
  await settle(() => (cr.awayFail && cr.awayFail.count) === 3);
  const bi = awayItems(R, B);
  okP(bi.length === 1 && bi[0].jobId === cr.id && cr.awayFail.count === 3 && /^Background job nightly-export failed/.test(bi[0].text),
    'three failed runs of ONE schedule ⇒ ONE item under the SCHEDULE, count 3', { items: bi.map((i) => ({ jobId: i.jobId, text: i.text })), count: cr.awayFail && cr.awayFail.count });
  // a PERSON closes it: the episode's later failures are counted, never reopen it, and journal nothing
  R.todos.setStatus(it.id, 'dismissed');
  const linesBefore = inboxLines(j1);
  failOf(R, j1, 'failed exit=3 error (1m)');
  await settle(() => j1.awayFail.count === 4);
  okP(j1.awayFail.count === 4 && R.todos.get(it.id).status === 'dismissed' && inboxLines(j1) === linesBefore && awayItems(R, A).length === 1,
    'a person CLOSED it: the next failure is counted (4) and the item STAYS closed — the dismissal stands for the episode, no journal line a failure',
    { count: j1.awayFail.count, status: R.todos.get(it.id).status, journalBefore: linesBefore, journalAfter: inboxLines(j1) });
  // the owner RECEIVES its notices (the drain) ⇒ the episode ends; the item closes because ITS notice was handed over
  const bItem = bi[0];
  R.jm.drainNotifs(B);
  okP(R.todos.get(bItem.id).status === 'done' && !cr.awayFail,
    'the owner conversation RECEIVED its notices (drained) ⇒ the episode ends: the item done (by the agent), the record\'s count gone', { status: R.todos.get(bItem.id).status, awayFail: cr.awayFail || null });
  failOf(R, task(R, 'jb-away-run-4', 'nightly-export run', B, { cronParent: cr.id }), 'failed exit=4 error (1m)');
  await settle(() => R.todos.get(bItem.id).status === 'open');
  okP(R.todos.get(bItem.id).status === 'open' && cr.awayFail.count === 1 && /: 1$/.test(R.todos.get(bItem.id).text),
    '…and away again, the next failure files it anew (open, count 1)', { status: R.todos.get(bItem.id).status, count: cr.awayFail.count });
  // round 6: a notice pushed out of the 30-entry stash was never handed to the agent — the drain ends the episode, the ITEM stays for the person
  {
    const K = cidOf(0xf001), jk = task(R, 'jb-away-k', 'render-k', K);
    failOf(R, jk);
    await settle(() => awayItems(R, K).length === 1);
    for (let k = 0; k < 30; k++) R.jm._stashNotif(K, task(R, 'jb-k-other-' + k, 'other-' + k, K, { state: 'done' }), { what: 'done ' + k }, 'no live inbox', { held: { kind: 'not-running' } });
    const stillThere = (R.jm.pendingNotifs.get(K) || []).some((n) => n.jobId === jk.id);
    R.jm.drainNotifs(K);
    okP(!stillThere && !jk.awayFail && awayItems(R, K)[0].status === 'open',
      'round 6: its notice FELL OFF the 30-entry stash (never handed to the agent) — the owner\'s drain ends the episode, the item STAYS open for the person', { inStashAtDrain: stillThere, awayFail: jk.awayFail || null, status: awayItems(R, K)[0].status });
  }
  // round 13: a stale closed item of an earlier episode + a first filing the store REFUSED (full) never silence the episode
  {
    const M2 = cidOf(0xf002), jm2 = task(R, 'jb-away-m', 'render-m', M2);
    failOf(R, jm2);
    await settle(() => awayItems(R, M2).length === 1);
    R.jm.drainNotifs(M2);   // the earlier episode's item: closed (done)
    const asks = []; for (let k = 0; k < 20; k++) asks.push(R.todos.add(`claude:${M2}`, { text: 'an ask ' + k, origin: 'agent' }).id);   // the owner's 20-open cap
    failOf(R, jm2, 'failed exit=5 error (1m)');
    await settle(() => !!jm2.awayFail);
    const refused = jm2.awayFail.filed === false && awayItems(R, M2)[0].status === 'done';
    for (const id of asks) R.todos.setStatus(id, 'done');
    failOf(R, jm2, 'failed exit=6 error (1m)');
    await settle(() => awayItems(R, M2)[0].status === 'open');
    okP(refused && awayItems(R, M2)[0].status === 'open' && jm2.awayFail.filed === true,
      'round 13: the episode\'s FIRST filing refused (For you full) beside a stale closed item — the next failure files it (open), never a renewal the stale item keeps closed', { refusedFirst: refused, status: awayItems(R, M2)[0].status, count: jm2.awayFail.count });
  }
  // what the person was ALREADY told by name is not said twice; a live owner, a success: nothing
  const jp = task(R, 'jb-away-park', 'db-sync', A), jl = task(R, 'jb-away-live', 'live-one', B), jd = task(R, 'jb-away-done', 'ok-one', A, { state: 'done' });
  failOf(R, jp, 'parked after 5 crashes (exit 1) — start it again once fixed', { personTold: true });
  R.live.add(B); failOf(R, jl); failOf(R, jd, 'done exit=0 ok (1m)');
  await settle(() => (jl.notifyLog || []).length > 0 && (jp.notifyLog || []).length > 0 && (jd.notifyLog || []).length > 0);
  okP(!jp.awayFail && !jl.awayFail && !jd.awayFail && !awayItems(R, A).some((i) => i.jobId === jp.id || i.jobId === jd.id) && !awayItems(R, B).some((i) => i.jobId === jl.id),
    'not said: a failure the person was already told by name (personTold), a failure its LIVE owner received, a success', { park: !!jp.awayFail, live: !!jl.awayFail, done: !!jd.awayFail });
  R.live.delete(B);
  // round 9: the three ends that already said it by name carry the stamp (a stamp removed would say it twice)
  {
    const SRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
    const stamps = {
      memoryPark: SRC.includes("then vibespace-job start ${parent ? parent.id : job.id})`, wake: 'result', personTold: true });"),
      crashPark: SRC.includes("— start it again once fixed`, wake: 'result', personTold: true });"),
      notifyUserEnd: SRC.includes("this._notifyOwner(job, { what: evText, wake: 'result', ...(forYouEnd ? { personTold: true } : {}) });"),
    };
    okP(Object.values(stamps).every(Boolean), 'round 9: the memory park, the crash-loop park and a --notify-user end each stamp «the person was told» on the owner\'s notice', stamps);
  }
  // round 12: a failure parked for a LIVE owner that ENDED before it landed (the park's fall, not-running) is said with ITS OWN run's facts
  const jf = task(R, 'jb-away-fell', 'late-one', B, { state: 'done' });   // the schedule fired again since: its current run is a success
  R.jm._onRetryEvent('fell', B, { id: 'rt-fell-1', producer: 'jobs', firstAt: Date.now(), attempts: [{ reason: 'timeout' }], meta: { jobId: jf.id, jobName: 'late-one', ev: { what: 'failed exit=7 timeout (9m)', at: Date.now(), away: { exit: 7, cause: 'timeout' } }, subscriber: false } }, { kind: 'not-running' });
  await settle(() => awayItems(R, B).some((i) => i.jobId === jf.id));
  const fi = awayItems(R, B).find((i) => i.jobId === jf.id);
  okP(!!fi && fi.status === 'open' && fi.i18n.text.params.exit === '7' && fi.i18n.text.params.cause === 'timeout',
    'round 12: a failure parked for a live owner that ENDED before it landed is said — with the PARK\'S facts (exit 7, timeout), never the run a later fire left', { text: fi && fi.text });
  // follow-up (4): a carried fall uses ONLY what it carried — a carried cause of none is «unknown», never the job's CURRENT run's cause
  const jf2 = task(R, 'jb-away-fell2', 'late-two', B, { state: 'done', runs: [{ startedAt: Date.now() - 60e3, endedAt: Date.now(), exit: 0, cause: 'ok' }] });
  R.jm._onRetryEvent('fell', B, { id: 'rt-fell-2', producer: 'jobs', firstAt: Date.now(), attempts: [{ reason: 'timeout' }], meta: { jobId: jf2.id, jobName: 'late-two', ev: { what: 'failed exit=7 (9m)', at: Date.now(), away: { exit: 7, cause: null } }, subscriber: false } }, { kind: 'not-running' });
  await settle(() => awayItems(R, B).some((i) => i.jobId === jf2.id));
  const fi2 = awayItems(R, B).find((i) => i.jobId === jf2.id);
  okP(!!fi2 && fi2.i18n.text.params.exit === '7' && fi2.i18n.text.params.cause === 'unknown',
    'follow-up (4): a park\'s fall that carried NO cause says «unknown» — never the next fire\'s «ok» beside the carried exit 7', { exit: fi2 && fi2.i18n.text.params.exit, cause: fi2 && fi2.i18n.text.params.cause, currentRun: jf2.runs[0].cause });
  // follow-up (1): after a person CLOSED the named item, the next away failure (the ladder's road, kept closed) is still the named one —
  // the conversation's «notices are waiting» is not filed for the failure the person just dismissed
  {
    const P = cidOf(0xf101), jq = task(R, 'jb-away-p', 'render-p', P);
    failOf(R, jq);
    await settle(() => awayItems(R, P).length === 1);
    R.todos.setStatus(awayItems(R, P)[0].id, 'dismissed');
    R.jm._notifyRate.delete(P);   // more than 30 s and 10 min after the post: the next failure takes the LADDER's road again
    failOf(R, jq, 'failed exit=8 error (1m)');
    await settle(() => jq.awayFail.count === 2 && (R.jm.pendingNotifs.get(P) || []).length === 2);
    const said = R.jm.sayWakeWaiting(P);
    okP(said === null && waitItems(R, P).length === 0 && awayItems(R, P)[0].status === 'dismissed' && jq.awayFail.count === 2,
      'follow-up (1): the person CLOSED the named item; the next away failure (kept closed) files NO «notices are waiting» for it — the dismissal stands for both items',
      { conversationItem: said, waitItems: waitItems(R, P).length, named: awayItems(R, P)[0].status, count: jq.awayFail.count });
  }
  R.stop();
  // round 5: For you HELD UNREAD — the first filing WAITS for the read, never lost
  {
    const H = rig('away-held'), C5 = cidOf(0xf005), jh = task(H, 'jb-away-held', 'render-h', C5);
    H.todos._holdUnread({ code: 'EIO', why: 'a test hold' });
    const waiters0 = H.todos._readWaiters.length;
    failOf(H, jh);
    await settle(() => (jh.notifyLog || []).some((l) => l.lane === 'user-inbox'));
    failOf(H, jh); failOf(H, jh, 'failed exit=3 error (1m)');   // the duplicate's count and a floored one, still held
    await settle(() => jh.awayFail.count === 3);
    const waitersAdded = H.todos._readWaiters.length - waiters0, heldLines = (jh.notifyLog || []).filter((l) => l.lane === 'user-inbox' && l.copy === 'away-failed');
    okP(waitersAdded === 1 && heldLines.length === 3 && heldLines.every((l) => l.ok === null && l.held === true) && jh.forYouLast['away-failed'].ok === null,
      'follow-up (2)(3): three away failures while For you is held ⇒ ONE waiter (a job and a copy, the latest words win), and each journalled as WAITING (never a refusal)',
      { waitersAdded, heldLines: heldLines.map((l) => ({ ok: l.ok, held: l.held })), forYouLast: jh.forYouLast['away-failed'] });
    const whileHeld = awayItems(H, C5).length;
    for (let k = 0; k < 4 && H.todos.isHeldUnread(); k++) await H.todos.readAgain();
    await settle(() => awayItems(H, C5).length === 1);
    const landed = (jh.notifyLog || []).filter((l) => l.lane === 'user-inbox' && l.copy === 'away-failed').pop();
    okP(whileHeld === 0 && !H.todos.isHeldUnread() && awayItems(H, C5).length === 1 && awayItems(H, C5)[0].status === 'open' && /: 3$/.test(awayItems(H, C5)[0].text) && landed && landed.ok === true,
      'round 5 + follow-up (3): nothing filed while held; ONE item filed AT THE READ with the latest count (3), and the Delivery log says it landed', { whileHeld, lifted: !H.todos.isHeldUnread(), after: awayItems(H, C5).map((i) => i.text), lastLine: landed && { ok: landed.ok, copy: landed.copy } });
    H.stop();
  }

  // ── RED CONTROLS: anchored copies of the ENGINE, loaded by the REAL wiring file (a fresh instance of it reading the copy's JobManager —
  //    the For-you store hands its filer key only to src/server/jobs-wiring.js itself, so a copy of the wiring could file nothing) ──
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const MC = mutantCopies('jobs-triage-2566', ROOT);
  const WIRING_PATH = path.join(ROOT, 'src/server/jobs-wiring.js'), JOBS_PATH = path.join(ROOT, 'src/jobs.js');
  const wiringWith = (jobsSrc, tag) => {
    const mut = MC.load('src/jobs.js', jobsSrc, tag), keepW = require.cache[WIRING_PATH], keepJ = require.cache[JOBS_PATH];
    try { delete require.cache[WIRING_PATH]; require.cache[JOBS_PATH] = { id: JOBS_PATH, filename: JOBS_PATH, loaded: true, exports: mut, children: [], paths: [] }; return require(WIRING_PATH); }
    finally { if (keepW) require.cache[WIRING_PATH] = keepW; else delete require.cache[WIRING_PATH]; if (keepJ) require.cache[JOBS_PATH] = keepJ; else delete require.cache[JOBS_PATH]; }
  };
  {
    const R1 = rig('away-red-hook', wiringWith(anchored(JSRC, "        if (r && r.notRunning === true && r.unreachable !== true && !subscriber) this._awayFailure(cid, job, ev, this._lastStashed(cid, job));   // B-2566: …and a FAILURE reaches a person by name\n", '', 'b2566-no-hook'), 'b2566-no-hook'));
    const x = task(R1, 'jb-red-1', 'render-7', A);
    failOf(R1, x);
    await settle(() => (x.notifyLog || []).some((l) => l.lane === 'stash'));
    const silent = awayItems(R1, A).length === 0;
    failOf(R1, x, 'failed exit=2 error (1m)');   // the floor's own hook is still in the copy: it CAN file (the control is not vacuous)
    await settle(() => awayItems(R1, A).length === 1);
    okP(silent && awayItems(R1, A).length === 1,
      'RED CONTROL: the ladder\'s hook removed (a copy of the engine) ⇒ the first failure is only STASHED, no person hears it (the first leg would be red); the floor\'s hook in the same copy files the second (the rig files)',
      { firstSilent: silent, afterSecond: awayItems(R1, A).length });
    R1.stop();
  }
  {
    const R2 = rig('away-red-verdict', wiringWith(anchored(JSRC, "    if (this._ownerLive(cid)) return null;   // round wem0s6k1d MUST 1 + 主开发 r537: THE ONE VERDICT, the park's own «live» (_ownerLive), at every road that files or renews\n", '', 'b2566-no-verdict'), 'b2566-no-verdict'));
    const L = cidOf(0xe101); R2.local.add(L);
    const ya = task(R2, 'jb-red-la', 'build-a', L), yb = task(R2, 'jb-red-lb', 'build-b', L);
    failOf(R2, ya);
    await settle(() => (ya.notifyLog || []).length > 0);
    failOf(R2, yb);
    await settle(() => awayItems(R2, L).length === 1);
    okP(awayItems(R2, L).length === 1, 'RED CONTROL: the one verdict removed (a copy of the engine) ⇒ the floor files «was not running» for a LIVE local conversation — the MUST 1 leg would be red', { items: awayItems(R2, L).map((i) => i.jobId) });
    const E2 = cidOf(0xe102), ye = task(R2, 'jb-red-e', 'render-e', E2);
    failOf(R2, ye);
    await settle(() => awayItems(R2, E2).length === 1);
    R2.local.add(E2); failOf(R2, ye);   // the owner runs again; the duplicate window's count
    okP(ye.awayFail.count === 2, '…and the same copy RENEWS through the duplicate window for an owner that runs again (count 2) — the «count stays 1» leg would be red', { count: ye.awayFail.count });
    R2.stop();
  }
  {
    const R3 = rig('away-red-cron', wiringWith(anchored(JSRC, '    const rec = (job.cronParent && this.jobs.get(job.cronParent)) || job;\n    const run = (job.runs', '    const rec = job;\n    const run = (job.runs', 'b2566-run-identity'), 'b2566-run-identity'));
    const c2 = schedule(R3, 'jb-red-cron', 'nightly-export', B);
    for (const k of [1, 2, 3]) failOf(R3, task(R3, 'jb-red-run-' + k, 'nightly-export run', B, { cronParent: c2.id }), `failed exit=${k} error (1m)`);
    await settle(() => awayItems(R3, B).length === 3);
    okP(awayItems(R3, B).length === 3, 'RED CONTROL: a run\'s own id as the identity (a copy of the engine) ⇒ THREE items for one schedule — the schedule leg would be red', { items: awayItems(R3, B).map((i) => i.jobId) });
    R3.stop();
  }
  {
    const R4 = rig('away-red-reopen', wiringWith(anchored(JSRC, 'renew: !!ep && ep.filed !== false }));', 'renew: false }));', 'b2566-reopens'), 'b2566-reopens'));
    const y = task(R4, 'jb-red-2', 'render-7', A);
    failOf(R4, y);
    await settle(() => awayItems(R4, A).length === 1);
    const yi = awayItems(R4, A)[0];
    if (yi) R4.todos.setStatus(yi.id, 'dismissed');
    failOf(R4, y, 'failed exit=3 error (1m)');
    await settle(() => !!yi && R4.todos.get(yi.id).status === 'open');
    okP(!!yi && R4.todos.get(yi.id).status === 'open', 'RED CONTROL: the renewal sent as a new filing (a copy of the engine) ⇒ the item a person CLOSED reopens at the next failure — the dismissal leg would be red', { filed: !!yi, status: yi && R4.todos.get(yi.id).status });
    R4.stop();
  }
  {
    const R5 = rig('away-red-twice', wiringWith(anchored(JSRC, ' && !(this._namedAway && this._namedAway.has(n))', '', 'b2566-said-twice'), 'b2566-said-twice'));
    const G = cidOf(0xe201), z = task(R5, 'jb-red-g', 'render-g', G);
    failOf(R5, z);
    await settle(() => awayItems(R5, G).length === 1);
    const cz = R5.jm.sayWakeWaiting(G);
    okP(!!cz && waitItems(R5, G).length === 1 && awayItems(R5, G).length === 1, 'RED CONTROL: the named notice counted for the conversation\'s item too (a copy of the engine) ⇒ TWO items for one away failure — the MUST 2 leg would be red', { conversationItem: !!cz, named: awayItems(R5, G).length });
    R5.stop();
  }
  {
    // a SECOND spelling of «is the owner live» (the reach alone, as the first shape had it) misses the paired owner its machine said ended
    const R8 = rig('away-red-reach', wiringWith(anchored(JSRC, '    if (this._ownerLive(cid)) return null;', '    if (this.d.peerReachable && this.d.peerReachable(cid)) return null;', 'b2566-reach-only'), 'b2566-reach-only'));
    const X2 = cidOf(0xe501), jx2 = task(R8, 'jb-red-x', 'render-x', X2);
    R8.live.add(X2); R8.ended.add(X2);
    failOf(R8, jx2);
    await settle(() => (jx2.notifyLog || []).some((l) => l.lane === 'stash'));
    okP(awayItems(R8, X2).length === 0 && (jx2.notifyLog || []).some((l) => l.lane === 'stash'),
      'RED CONTROL: the verdict spelt as the reach alone (a copy of the engine) ⇒ the paired owner its machine said ended is NOT said — the seam leg would be red', { items: awayItems(R8, X2).length, journal: (jx2.notifyLog || []).map((l) => l.lane) });
    R8.stop();
  }
  {
    const R7 = rig('away-red-kept', wiringWith(anchored(JSRC, '    if ((filed || (v && v.kept === true)) && entry) (this._namedAway', '    if (filed && entry) (this._namedAway', 'b2566-kept-unmarked'), 'b2566-kept-unmarked'));   // stale-pins: kept (the control writes the pre-follow-up line back)
    const P2 = cidOf(0xe401), w = task(R7, 'jb-red-p', 'render-p', P2);
    failOf(R7, w);
    await settle(() => awayItems(R7, P2).length === 1);
    R7.todos.setStatus(awayItems(R7, P2)[0].id, 'dismissed');
    R7.jm._notifyRate.delete(P2);
    failOf(R7, w, 'failed exit=8 error (1m)');
    await settle(() => (R7.jm.pendingNotifs.get(P2) || []).length === 2);
    const cw = R7.jm.sayWakeWaiting(P2);
    okP(!!cw && waitItems(R7, P2).length === 1, 'RED CONTROL: a kept renewal left unmarked (a copy of the engine) ⇒ «notices are waiting» is filed for the failure the person dismissed — the follow-up (1) leg would be red', { conversationItem: !!cw });
    R7.stop();
  }
  {
    const R6 = rig('away-red-drain', wiringWith(anchored(JSRC, "      try { this.d.resolveAwayFailed?.(rec.id, cid); } catch (e) { this.d.log(`[jobs] ${rec.id}: the away-failure For-you item was not closed — ${e && e.message}`); }\n", '', 'b2566-drain-keeps'), 'b2566-drain-keeps'));
    const Q = cidOf(0xe301), q = task(R6, 'jb-red-q', 'render-q', Q);
    failOf(R6, q);
    await settle(() => awayItems(R6, Q).length === 1);
    R6.jm.drainNotifs(Q);
    okP(awayItems(R6, Q)[0].status === 'open' && !q.awayFail, 'RED CONTROL: the drain\'s close removed (a copy of the engine) ⇒ the item stays OPEN after the owner received its notice — the drain leg would be red', { status: awayItems(R6, Q)[0].status });
    R6.stop();
  }

  // ── B-2566's REMAINDER (主开发 r1147 / r1149): A PAIRED MACHINE THAT CANNOT BE REACHED. ONE For-you item a MACHINE an outage — never one
  //    a conversation, a job or a retry; only once it has been silent an hour (JM_MODEL.MACHINE_AWAY_GRACE_MS) AND something owed failed
  //    to go out after that; its count grows in place; a person's close stands for the outage; it goes by itself when the machine replies
  //    or nothing waits for it any more. The park's own «live» reads the same verdict (the rig's liveForWake) ──
  const machineItems = (R, hid = 'h-b') => { const s = R.todos.snapshot(); return [...s.open, ...s.resolved].filter((i) => i.itemKey === `jobs-machine-away:${hid}`); };
  const HOUR = 3600e3, owedAway = (R, c) => (R.jm.pendingNotifs.get(c) || []).filter((n) => n.held && n.held.kind === 'machine-away').length;
  const nudge = (R, c) => R.jm._notifyRate.delete(c);   // a minute apart in life: never the 30 s floor
  {
    // THE NUMBER (r1149 bound 2), a night replayed: laptop B silent for two hours; three of its conversations own jobs — an hourly schedule
    // failing every fire (its words differ by the hour: never the duplicate window), a nightly --notify-ok report, a build started at 21:30
    const R = rig('machine-night'), C1 = cidOf(0xf001), C2 = cidOf(0xf002), C3 = cidOf(0xf003), since = Date.now() - 2 * HOUR;
    for (const c of [C1, C2, C3]) R.down.set(c, 'h-b');
    R.hostsDown.set('h-b', since);
    R.clock.skew = -90 * 60e3;   // the store's clock: the item is filed 90 minutes ago — inside this outage (silent since two hours)
    const cron = schedule(R, 'jb-n-cron', 'sync-hourly', C1), child = task(R, 'jb-n-cron-run', 'sync-hourly run', C1, { cronParent: cron.id });
    const report = task(R, 'jb-n-report', 'nightly-report', C2, { state: 'done' }), build = task(R, 'jb-n-build', 'build', C3, { state: 'done' });
    for (let h = 0; h < 10; h++) { nudge(R, C1); failOf(R, child, `failed exit=1 error (1m) — fire ${h}`); }
    nudge(R, C2); failOf(R, report, 'done exit=0 (4m)');
    nudge(R, C3); failOf(R, build, 'done exit=0 (38m)');
    await settle(() => { const x = machineItems(R)[0]; return !!x && x.i18n.text.params.n === '12'; });
    const m = machineItems(R), perJob = [C1, C2, C3].flatMap((c) => awayItems(R, c)), waits = [C1, C2, C3].map((c) => R.jm.sayWakeWaiting(c)), owed = [C1, C2, C3].map((c) => owedAway(R, c));
    const p = m[0] && m[0].i18n.text.params;
    okP(m.length === 1 && m[0].status === 'open' && m[0].sessionKey === 'jobs' && m[0].hostId === 'h-b' && p.n === '12' && p.convs === '3' && p.machine === 'laptop-b' && p.since && p.since.at === since
        && perJob.length === 0 && waits.every((x) => x === null) && owed.join() === '10,1,1' && JM_MODEL.MACHINE_AWAY_GRACE_MS === HOUR,
      'THE NUMBER, a night replayed: laptop B silent two hours, 12 results for its 3 conversations (10 hourly failures, a report, a build) ⇒ ONE item for the machine — no item a job, none a conversation («notices wait» says nothing)',
      { items: m.length, text: m[0] && m[0].text, params: p, perJobItems: perJob.length, noticesWait: waits, owedByConversation: owed, graceMs: JM_MODEL.MACHINE_AWAY_GRACE_MS });
    const detail = m[0] && m[0].i18n.detail && m[0].i18n.detail[0];
    okP(!!detail && /open \{machine\}/.test(detail.key) && /nothing is lost or billed/.test(detail.key) && detail.params.machine === 'laptop-b' && !m[0].action,
      'its words say what waits, why, and what a person can do — open the machine; nothing to press (no action: a button cannot open a laptop)', { detail, action: m[0] && m[0].action || null });
    // the count grows IN PLACE
    const id0 = m[0].id;
    nudge(R, C3); failOf(R, build, 'done exit=0 (39m) — rebuilt');
    await settle(() => machineItems(R)[0].i18n.text.params.n === '13');
    const grown = machineItems(R);
    okP(grown.length === 1 && grown[0].id === id0 && grown[0].status === 'open' && grown[0].i18n.text.params.n === '13',
      'one more result ⇒ the SAME item, its count 13 (in place — never a second item)', { items: grown.length, sameId: grown[0].id === id0, n: grown[0].i18n.text.params.n });
    // a person's close stands for the outage
    R.todos.setStatus(id0, 'dismissed');
    nudge(R, C2); failOf(R, report, 'done exit=0 (5m) — again');
    await settle(() => owedAway(R, C2) === 2);
    const kept = machineItems(R);
    okP(kept.length === 1 && kept[0].status === 'dismissed',
      'a person\'s close stands for the outage: a later result does not reopen it', { status: kept[0].status, owedC2: owedAway(R, C2) });
    // a NEW outage (silent again after a reply, 70 minutes ago) files again — the item was filed in the outage before (90 minutes ago
    // by the store's placed clock), the new silence began after it
    R.clock.skew = 0;
    R.hostsDown.set('h-b', Date.now() - 70 * 60e3);
    nudge(R, C2); failOf(R, report, 'done exit=0 (6m) — the next night');
    await settle(() => machineItems(R)[0].status === 'open');
    okP(machineItems(R).length === 1 && machineItems(R)[0].status === 'open', '…and the NEXT outage (silent since a later instant) files it again — one item a machine an outage', { status: machineItems(R)[0].status });
    R.stop();
  }
  {
    // the grace: a laptop shut for ten minutes says nothing — RED CONTROL: the grace removed (a copy of the engine) ⇒ it files at once
    const R = rig('machine-grace'), G = cidOf(0xf101);
    R.down.set(G, 'h-b'); R.hostsDown.set('h-b', Date.now() - 10 * 60e3);
    const g = task(R, 'jb-g', 'render-g', G);
    failOf(R, g);
    await settle(() => owedAway(R, G) === 1);
    const quiet = machineItems(R).length;
    const RG = rig('machine-grace-red', wiringWith(anchored(JSRC, '    if (!a || !w.n || now() - a.since < M.MACHINE_AWAY_GRACE_MS) return null;', '    if (!a || !w.n) return null;', 'b2566r-no-grace'), 'b2566r-no-grace'));
    RG.down.set(G, 'h-b'); RG.hostsDown.set('h-b', Date.now() - 10 * 60e3);
    const gr = task(RG, 'jb-g', 'render-g', G);
    failOf(RG, gr);
    await settle(() => machineItems(RG).length === 1);
    okP(quiet === 0 && owedAway(R, G) === 1 && machineItems(RG).length === 1,
      'THE GRACE: silent ten minutes ⇒ the result is kept (owed, machine-away) and NO item; RED CONTROL: the grace removed ⇒ an item at once', { itemsInGrace: quiet, owed: owedAway(R, G), redCopyItems: machineItems(RG).length });
    R.stop(); RG.stop();
  }
  {
    // bound 1: no item a JOB for an unreachable owner — RED CONTROL: both guards removed (a copy of the engine) ⇒ the per-job item comes back
    const R = rig('machine-perjob-red', wiringWith(anchored(anchored(JSRC,
      "        if (r && r.notRunning === true && r.unreachable !== true && !subscriber) this._awayFailure(", "        if (r && r.notRunning === true && !subscriber) this._awayFailure(", 'b2566r-hook'),   // stale-pins: kept (the red copy's text: the hook as it read before the guard)
      "    if (typeof this.d.ownerUnreachable === 'function' && this.d.ownerUnreachable(cid)) return null;", '', 'b2566r-verdict'), 'b2566r-perjob'));
    const U = cidOf(0xf201); R.down.set(U, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
    const u = task(R, 'jb-u', 'render-u', U);
    failOf(R, u);
    await settle(() => awayItems(R, U).length === 1);
    okP(awayItems(R, U).length === 1, 'RED CONTROL: the two guards removed (a copy of the engine) ⇒ an unreachable owner gets an item a JOB again — the number leg would be red', { perJob: awayItems(R, U).map((i) => i.jobId) });
    R.stop();
  }
  {
    // it goes BY ITSELF — when nothing waits for the machine any more (the results went out), and when the machine replies
    const R = rig('machine-settle'), S1 = cidOf(0xf301), S2 = cidOf(0xf302), since = Date.now() - 2 * HOUR;
    R.down.set(S1, 'h-b'); R.down.set(S2, 'h-b'); R.hostsDown.set('h-b', since);
    const a = task(R, 'jb-s1', 'render-s1', S1);
    failOf(R, a);
    await settle(() => machineItems(R).length === 1);
    R.jm.drainNotifs(S1);
    const gone = machineItems(R)[0];
    okP(gone.status === 'done' && gone.resolvedBy === 'agent' && owedAway(R, S1) === 0, 'nothing waits for the machine any more (its results went out) ⇒ the item goes by itself (done, by the agent)', { status: gone.status, by: gone.resolvedBy });
    R.hostsDown.set('h-b', since + 60e3);
    const b = task(R, 'jb-s2', 'render-s2', S2);
    nudge(R, S2); failOf(R, b);
    await settle(() => machineItems(R)[0].status === 'open');
    R.hostsDown.delete('h-b');   // the machine replies — a delivery lands there (S1's next result)
    nudge(R, S1); failOf(R, a, 'failed exit=3 error (1m)');
    await settle(() => machineItems(R)[0].status === 'done');
    okP(machineItems(R)[0].status === 'done' && owedAway(R, S2) === 1,
      '…and when the machine REPLIES (a delivery lands on it) the item goes, even while one result still waits for a conversation there (its own road carries it)', { status: machineItems(R)[0].status, stillOwedS2: owedAway(R, S2) });
    R.stop();
  }
  {
    // r1277 (3): THIS outage's start — results left from an EARLIER outage never make a 20-minute close file at once
    const R = rig('machine-old-entries'), O = cidOf(0xf401);
    R.down.set(O, 'h-b'); R.hostsDown.set('h-b', Date.now() - 3 * HOUR);
    const o = task(R, 'jb-o', 'render-o', O);
    failOf(R, o);
    await settle(() => machineItems(R).length === 1);
    R.todos.setStatus(machineItems(R)[0].id, 'done', 'agent');   // that outage is over (the machine replied; this result still waits there)
    R.hostsDown.set('h-b', Date.now() - 20 * 60e3);   // a new close, twenty minutes ago
    nudge(R, O); failOf(R, o, 'failed exit=4 error (1m)');
    await settle(() => owedAway(R, O) === 2);
    okP(owedAway(R, O) === 2 && machineItems(R)[0].status === 'done',
      'r1277 (3): an earlier outage\'s result still waiting + a NEW 20-minute close ⇒ nothing filed (the grace is THIS outage\'s, the ladder\'s own start)', { owed: owedAway(R, O), item: machineItems(R)[0].status });
    R.stop();
  }
  {
    // r1277 (2): results owed to a machine away are NOT counted again in the conversation's «notices wait» item — RED: the filter removed
    const twice = async (wmod, tag) => {
      const R = rig('machine-twice-' + tag, wmod), D = cidOf(0xf501);
      R.down.set(D, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
      failOf(R, task(R, 'jb-d', 'render-d', D));
      await settle(() => owedAway(R, D) === 1);
      (R.jm._stoppedThisRun || (R.jm._stoppedThisRun = new Set())).add(D);   // an earlier «not running» stash of this run
      const said = R.jm.sayWakeWaiting(D), n = waitItems(R, D).length;
      R.stop();
      return { said: !!said, waitItems: n };
    };
    const g = await twice(wiring, 'g');
    const r = await twice(wiringWith(anchored(JSRC, "n.held.kind !== 'rate-floor' && n.held.kind !== 'machine-away' && ", "n.held.kind !== 'rate-floor' && ", 'b2566r-twice'), 'b2566r-twice'), 'r');
    okP(g.said === false && g.waitItems === 0 && r.waitItems === 1, 'r1277 (2): a conversation\'s «notices wait» does not count the results its MACHINE\'s item counts — RED: the filter removed ⇒ said twice', { green: g, red: r });
  }
  {
    // r1277 (7): a person's close stands for the outage — the guard is the ENGINE's (its one filing, _fileMachineAway): RED: it removed (a
    // copy of the engine) ⇒ a later result REOPENS the item the person closed (a copy of the wiring cannot file at all: For you hands
    // origin 'jobs''s key to its one filer, src/server/jobs-wiring.js, by its own frame)
    const R = rig('machine-close-red', wiringWith(anchored(JSRC, "    if (closed && Number(since) > 0 && Number(closed) >= Number(since)) return null;   // a person closed it this outage: kept closed — an UNKNOWN start (0, after a restart) never closes it (r1730 (4))\n", '', 'b2566r-close-guard'), 'b2566r-close-guard')), P = cidOf(0xf601);
    R.down.set(P, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
    const pj = task(R, 'jb-p', 'render-p', P);
    failOf(R, pj);
    await settle(() => machineItems(R).length === 1);
    R.todos.setStatus(machineItems(R)[0].id, 'dismissed');
    nudge(R, P); failOf(R, pj, 'failed exit=5 error (1m)');
    await settle(() => machineItems(R)[0].status === 'open');
    okP(machineItems(R)[0].status === 'open', 'r1277 (7) RED CONTROL: the person-close guard removed (a copy of the engine) ⇒ a later result REOPENS the item the person closed — the close leg would be red', { status: machineItems(R)[0].status });
    R.stop();
  }
  {
    // r1397 (3): the machine gave its word (it ended there) and the resume line then REFUSED: its notices wait for the CONVERSATION now
    // (not-running — never «delivered when it replies» after it replied), «notices wait» counts them again, and the machine's item goes NOW
    const R = rig('machine-refused-resume'), E = cidOf(0xf901);
    R.down.set(E, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
    const ej = task(R, 'jb-e', 'render-e', E);
    failOf(R, ej);
    await settle(() => machineItems(R).length === 1);
    R.hostsDown.delete('h-b');   // the machine replied: the conversation ended there; the resume line refused (archived)
    R.jm._onRetryEvent('wake', E, { producer: 'jobs', meta: { jobId: 'jb-e' } }, { outcome: 'refused', code: 'archived', why: 'it is archived' });
    const kinds = (R.jm.pendingNotifs.get(E) || []).map((n) => n.held && n.held.kind);
    okP(kinds.join() === 'not-running' && machineItems(R)[0].status === 'done' && waitItems(R, E).length === 1,
      'r1397 (3): a refused resume after the machine\'s word ⇒ its notices are «not running» (the conversation\'s words, true), the machine\'s item goes AT ONCE, «notices wait» says them', { kinds, machineItem: machineItems(R)[0].status, noticesWait: waitItems(R, E).length });
    R.stop();
  }
  {
    // r1397 (1): a machine that CANNOT give its word (an older agent): the release's road ended the hold — the machine's item says WHY in
    // place, and goes only once its results went out (never on the link's return alone)
    const R = rig('machine-wordless'), K = cidOf(0xfa01), K2 = cidOf(0xfa02);
    R.down.set(K, 'h-b'); R.down.set(K2, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
    const kj = task(R, 'jb-k', 'render-k', K);
    failOf(R, kj);
    await settle(() => machineItems(R).length === 1);
    R.hostsDown.delete('h-b');   // its link is back; its agent is older — the ladder released the hold (agent_older)
    R.jm._onRetryEvent('wake', K, { producer: 'jobs', meta: { jobId: 'jb-k' } }, { outcome: 'running', code: 'agent_older', why: 'its device agent is older: update it — the words wait for its next turn' });
    // COPIES of what the item says NOW (the store hands its own objects: read later, they are what the drain made them)
    const said0 = machineItems(R)[0], said = { status: said0.status, text: said0.i18n.text.key, detail: said0.i18n.detail[0].key, items: machineItems(R).length };
    nudge(R, K2); failOf(R, task(R, 'jb-k2', 'render-k2', K2));   // a delivery lands on the machine: the link's word alone
    await settle(() => (R.jm.jobs.get('jb-k2').notifyLog || []).length > 0);
    const afterLanding = machineItems(R)[0].status;
    R.jm.drainNotifs(K);
    okP(/its agent is older and cannot say whether they run/.test(said.text) && said.status === 'open' && said.items === 1 && /Update VibeSpace’s device agent/.test(said.detail) && afterLanding === 'open' && machineItems(R)[0].status === 'done',
      'r1397 (1): a machine that cannot give its word — its item says WHY in place (its agent is older; update it), stays while its results wait (a landing on the machine is the link\'s word alone), and goes when they went out', { said, afterLanding, final: machineItems(R)[0].status });
    R.stop();
  }
  {
    // r1730 (3): the wordless MARK belongs to a FILED item — a machine whose item was never filed (inside its grace) keeps none, so a
    // LATER ordinary outage of it files the plain «silent since» words. RED: the mark set for an unfiled machine (a copy of the engine)
    // — the mark alone, never a filing: the engine before r1730 (3)
    const later = async (wmod, tag) => {
      const R = rig('machine-wordless-unfiled-' + tag, wmod), V = cidOf(0xfb01);
      R.down.set(V, 'h-b'); R.hostsDown.set('h-b', Date.now() - 10 * 60e3);   // inside the grace: nothing filed
      failOf(R, task(R, 'jb-w1', 'render-w1', V));
      await settle(() => owedAway(R, V) === 1);
      const before = machineItems(R).length;
      R.hostsDown.delete('h-b');
      R.jm._onRetryEvent('wake', V, { producer: 'jobs', meta: { jobId: 'jb-w1' } }, { outcome: 'running', code: 'agent_older', why: 'its device agent is older: update it — the words wait for its next turn' });
      R.jm.drainNotifs(V);   // its results went out
      R.hostsDown.set('h-b', Date.now() - 2 * HOUR);   // a LATER, ordinary outage (its agent updated since)
      nudge(R, V); failOf(R, task(R, 'jb-w2', 'render-w2', V));
      await settle(() => machineItems(R).length === 1);
      const it = machineItems(R)[0];
      const out = { before, text: it && it.i18n.text.key, marked: !!(R.jm._machineWordlessOf && R.jm._machineWordlessOf.has('h-b')) };
      R.stop(); return out;
    };
    const g = await later(wiring, 'g');
    const r = await later(wiringWith(anchored(JSRC, "      if (!filed.has(hid)) continue;   // r1730 (3): the mark belongs to a FILED item — an unfiled one would give a LATER ordinary outage the wordless words\n", '      if (!filed.has(hid)) { (this._machineWordlessOf || (this._machineWordlessOf = new Map())).set(hid, code); continue; }\n', 'b2566r-mark-unfiled'), 'b2566r-mark-unfiled'), 'r');
    okP(g.before === 0 && /it has been silent since/.test(g.text || '') && r.marked === true && /go out without its word/.test(r.text || ''),
      'r1730 (3): a wordless release of a machine with NO item filed leaves no mark — a later ordinary outage files the «silent since» words; RED: the mark set anyway (a copy) ⇒ the later outage says «without its word»', { green: g, red: r });
  }
  {
    // r1730 (4): after a RESTART an older agent's machine (its link online: the ladder names no outage start) still gets its wordless
    // words filed — an UNKNOWN start (0) never closes the item. RED: the zero let close it (a copy of the engine)
    const restart = (wmod, tag) => {
      const R = rig('machine-wordless-restart-' + tag, wmod);
      R.jm.d.machineAwayClosedAt = () => Date.now() - 3 * HOUR;   // the store answers: a person closed an older outage's item
      const v = R.jm._fileMachineAway('h-b', { n: 2, convs: 1 }, 0, 'agent_older');
      const it = machineItems(R)[0];
      const out = { filed: !!v, text: it && it.i18n.text.key };
      R.stop(); return out;
    };
    const g = restart(wiring, 'g');
    const r = restart(wiringWith(anchored(JSRC, "    if (closed && Number(since) > 0 && Number(closed) >= Number(since)) return null;", "    if (closed && Number(closed) >= Number(since)) return null;", 'b2566r-zero-closes'), 'b2566r-zero-closes'), 'r');   // stale-pins: kept (the red copy's text: the guard before r1730 (4))
    okP(g.filed && /go out without its word/.test(g.text || '') && r.filed === false && !r.text,
      'r1730 (4): an UNKNOWN outage start (0, after a restart) never closes the item — the wordless words are filed; RED: the zero closes it (a copy)', { green: g, red: r });
  }
  // r1861: THE RESTART SHAPE — the first engine files the machine's item and stops (its stores landed); a NEW engine and a new For-you
  // store open the SAME folder, nothing said in memory; the machine's held wakes still owe their word (the ladder's park is durable:
  // machineAwayOf answers from it) until the older agent's release ends them
  const rebooted = async (wmod, tag, cids) => {
    let R = rig('machine-reboot-' + tag);
    R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
    for (const c of cids) { R.down.set(c, 'h-b'); failOf(R, task(R, 'jb-rb-' + c.slice(-4), 'render-' + c.slice(-4), c)); }
    await settle(() => machineItems(R).length === 1 && cids.every((c) => owedAway(R, c) === 1));
    const first = machineItems(R)[0].i18n.text.key;
    R.jm._save(); R.stop(); landedU4();
    R = rig('machine-reboot-' + tag, wmod, R.dir);   // THE RESTART
    R.hostsDown.set('h-b', Date.now() - 2 * HOUR); for (const c of cids) R.down.set(c, 'h-b');
    return { R, first, boot: { owed: cids.map((c) => owedAway(R, c)), said: (R.jm._machineAwaySaid && R.jm._machineAwaySaid.size) || 0, looked: !!R.jm._machineAwayLooked, items: machineItems(R).length } };
  };
  const releaseOlder = (R, c) => { R.hostsDown.delete('h-b'); R.jm._onRetryEvent('wake', c, { producer: 'jobs', meta: { jobId: 'jb-rb-' + c.slice(-4) } }, { outcome: 'running', code: 'agent_older', why: 'its device agent is older: update it — the words wait for its next turn' }); };
  const itemNow = (R) => { const it = machineItems(R)[0]; return it ? { status: it.status, text: it.i18n.text.key } : null; };   // a COPY: the store hands its own objects
  const otherDrain = async (R, O) => { failOf(R, task(R, 'jb-o-' + O.slice(-4), 'render-o', O)); await settle(() => (R.jm.pendingNotifs.get(O) || []).length >= 1); return R.jm.drainNotifs(O).length; };   // an UNRELATED conversation's notices go out: the hub's settle runs
  const LOOK = "    const filed = this._machineAwayFiled();   // r1861: an item an EARLIER run of the hub filed counts as filed — looked at BEFORE the road decides\n";
  // r2022: the look READS BACK a release's decision written on the machine's waiting notices (the line below); STAMP writes it there
  const REBUILD = "        if (code && !(typeof this.d.machineAwayOf === 'function' && this.d.machineAwayOf(hid))) this._machineWordlessAt(hid, code);\n";
  const STAMP = "    for (const e of q) if (e.held.wordless !== code) { e.held = { ...e.held, wordless: code }; stamped++; }\n";
  const restartOf = (R, wmod) => { R.jm._save(); R.stop(); landedU4(); return rig('machine-reboot-again', wmod, R.dir); };   // a restart of a rig: its stores landed, a new engine and store on its folder
  {
    // r1861 THE MUST: after a RESTART the item an EARLIER run filed counts as FILED — the look at the stored open items comes BEFORE the
    // wordless road decides (one helper, the settle's too): the older agent's release ⇒ the item says its TRUE reason at once, STAYS
    // OPEN through an unrelated drain while its result waits, and goes once it went out. RED 1: the look removed (a copy) ⇒ «silent
    // since» stays at the release. RED 2: the look and the read-back removed (the follow as a8f736156 had it) ⇒ the drain CLOSES it
    const scene = async (wmod, tag) => {
      const K = cidOf(0xfc01), O = cidOf(0xfc02);
      const { R, first, boot } = await rebooted(wmod, 'must-' + tag, [K]);
      releaseOlder(R, K);
      const atRelease = itemNow(R), drained = await otherDrain(R, O), afterDrain = itemNow(R), owedThen = owedAway(R, K);
      R.jm.drainNotifs(K);
      const out = { first, boot, atRelease, drained, afterDrain, owedThen, final: itemNow(R) };
      R.stop(); return out;
    };
    const g = await scene(wiring, 'g');
    const r1 = await scene(wiringWith(anchored(JSRC, LOOK, "    const filed = this._machineAwaySaid || new Set();\n", 'b2566r-no-look'), 'b2566r-no-look'), 'r1');
    const r2 = await scene(wiringWith(anchored(anchored(JSRC, LOOK, "    const filed = this._machineAwaySaid || new Set();\n", 'b2566r-no-look-2'), REBUILD, '', 'b2566r-no-look-2'), 'b2566r-no-look-2'), 'r2');
    const WL = /go out without its word/, SIL = /it has been silent since/;
    okP(SIL.test(g.first) && g.boot.owed.join() === '1' && g.boot.said === 0 && !g.boot.looked && g.boot.items === 1
        && g.atRelease.status === 'open' && WL.test(g.atRelease.text) && g.drained >= 1 && g.afterDrain.status === 'open' && g.owedThen === 1 && g.final.status === 'done'
        && r1.atRelease.status === 'open' && SIL.test(r1.atRelease.text)
        && r2.drained >= 1 && r2.owedThen === 1 && r2.afterDrain.status === 'done' && SIL.test(r2.afterDrain.text),
      'r1861: AFTER A RESTART (a new engine and a new For-you store on the first one\'s folder, nothing said in memory) the older agent\'s release finds the item the first run filed: it says its TRUE reason at once, stays open through an unrelated drain while its result waits, and goes when it went out; RED 1: the look removed ⇒ «silent since» at the release; RED 2: the look and the read-back removed ⇒ the drain CLOSES it while its result waits',
      { green: g, red1: r1, red2: r2 });
  }
  {
    // r1861 + r2022: a release that came while For you could not be READ (a held tray: no look) writes its decision on the notices; the
    // first settle after the read reads it back, files the true reason and keeps the item while its result waits. RED: the read-back
    // removed (a copy) ⇒ that settle CLOSES it
    const scene = async (wmod, tag) => {
      const K = cidOf(0xfe01), O = cidOf(0xfe02);
      const { R } = await rebooted(wmod, 'held-' + tag, [K]);
      R.todos._holdUnread({ code: 'EIO', why: 'a test hold' });
      releaseOlder(R, K);
      const whileHeld = { looked: !!R.jm._machineAwayLooked, written: (R.jm.pendingNotifs.get(K) || []).map((n) => n.held && n.held.wordless).join() };
      for (let k = 0; k < 4 && R.todos.isHeldUnread(); k++) await R.todos.readAgain();
      const lifted = !R.todos.isHeldUnread(), drained = await otherDrain(R, O), afterDrain = itemNow(R), owedThen = owedAway(R, K);
      R.jm.drainNotifs(K);
      const out = { whileHeld, lifted, drained, afterDrain, owedThen, final: itemNow(R) };
      R.stop(); return out;
    };
    const g = await scene(wiring, 'g');
    const r = await scene(wiringWith(anchored(JSRC, REBUILD, '', 'b2566r-no-readback'), 'b2566r-no-readback'), 'r');
    okP(!g.whileHeld.looked && g.whileHeld.written === 'agent_older' && g.lifted && g.drained >= 1 && g.afterDrain.status === 'open' && /go out without its word/.test(g.afterDrain.text) && g.owedThen === 1 && g.final.status === 'done'
        && r.lifted && r.owedThen === 1 && r.afterDrain.status === 'done',
      'r1861 + r2022: an older agent\'s release while For you is HELD (no look possible) writes its decision on the notices — after the read the first settle reads it back, files the true reason and keeps the item while its result waits; RED: the read-back removed ⇒ that settle closes it while its result waits',
      { green: g, red: r });
  }
  {
    // r2022: the restart comes AFTER the release — the mark is read back from the notices it is about: the next run's first settle
    // (an unrelated drain) keeps the «update the agent» item while its result waits; it goes when it went out. RED: the read-back
    // removed (a copy) ⇒ that settle closes it while its result waits
    const scene = async (wmod, tag) => {
      const K = cidOf(0xfe11), O = cidOf(0xfe12);
      let R = rig('machine-after-release-' + tag, wmod);
      R.down.set(K, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
      failOf(R, task(R, 'jb-rb-' + K.slice(-4), 'render-k', K));
      await settle(() => machineItems(R).length === 1 && owedAway(R, K) === 1);
      releaseOlder(R, K);   // run 1: the older agent's release — the mark and its words
      const run1 = itemNow(R);
      R = restartOf(R, wmod);   // THE RESTART after the release: no release comes again (its wakes ended)
      R.down.set(K, 'h-b');   // the link is online; no wake is held for it
      const boot = { owed: owedAway(R, K), written: (R.jm.pendingNotifs.get(K) || []).map((n) => n.held && n.held.wordless).join(), marked: !!(R.jm._machineWordlessOf && R.jm._machineWordlessOf.size) };
      const drained = await otherDrain(R, O), afterDrain = itemNow(R), owedThen = owedAway(R, K);
      R.jm.drainNotifs(K);
      const out = { run1, boot, drained, afterDrain, owedThen, final: itemNow(R) };
      R.stop(); return out;
    };
    const g = await scene(wiring, 'g');
    const r = await scene(wiringWith(anchored(JSRC, REBUILD, '', 'b2566r-after-release'), 'b2566r-after-release'), 'r');
    const WL = /go out without its word/;
    okP(WL.test(g.run1.text) && g.boot.owed === 1 && g.boot.written === 'agent_older' && !g.boot.marked && g.drained >= 1 && g.afterDrain.status === 'open' && WL.test(g.afterDrain.text) && g.owedThen === 1 && g.final.status === 'done'
        && r.boot.written === 'agent_older' && r.owedThen === 1 && r.afterDrain.status === 'done',
      'r2022: a restart AFTER the older agent\'s release — the decision is on the notices it is about, so the next run\'s first settle keeps the «update the agent» item while its result waits, and it goes when it went out; RED: the read-back removed ⇒ that settle closes it while its result waits',
      { green: g, red: r });
  }
  {
    // r2022: a release while For you is HELD, then a SECOND restart before the tray reads — the decision survives on the notices; the
    // third run's first settle files the true reason and keeps the item. RED: the decision never written (a copy) ⇒ that settle closes it
    const scene = async (wmod, tag) => {
      const K = cidOf(0xfe21), O = cidOf(0xfe22);
      let { R } = await rebooted(wmod, 'held-twice-' + tag, [K]);
      R.todos._holdUnread({ code: 'EIO', why: 'a test hold' });
      releaseOlder(R, K);   // run 2: the release while the tray cannot be read — no look possible
      const run2 = { looked: !!R.jm._machineAwayLooked, text: itemNow(R) && itemNow(R).text };
      R = restartOf(R, wmod);   // THE SECOND RESTART, the tray still unread when it came
      R.down.set(K, 'h-b');
      const drained = await otherDrain(R, O), afterDrain = itemNow(R), owedThen = owedAway(R, K);
      R.jm.drainNotifs(K);
      const out = { run2, drained, afterDrain, owedThen, final: itemNow(R) };
      R.stop(); return out;
    };
    const g = await scene(wiring, 'g');
    const r = await scene(wiringWith(anchored(JSRC, STAMP, '', 'b2566r-not-written'), 'b2566r-not-written'), 'r');
    okP(!g.run2.looked && /it has been silent since/.test(g.run2.text || '') && g.drained >= 1 && g.afterDrain.status === 'open' && /go out without its word/.test(g.afterDrain.text) && g.owedThen === 1 && g.final.status === 'done'
        && r.owedThen === 1 && r.afterDrain.status === 'done',
      'r2022: a release under a HELD tray, then a second restart — the decision survives on the notices: the third run\'s first settle files the true reason and keeps the item while its result waits; RED: the decision never written ⇒ that settle closes it while its result waits',
      { green: g, red: r });
  }
  {
    // r1861 (a): after a restart the outage's start is not known, so a person's close of the item an earlier run filed is filed again
    // ONCE with the machine's reason (kb-features says so) — never once a conversation: the refile's own instant is kept, a close after
    // it stands for the next release. RED: the unknown start kept as 0 (a copy) ⇒ the next conversation's release files it AGAIN
    const scene = async (wmod, tag) => {
      const K = cidOf(0xfd01), K2 = cidOf(0xfd02), O = cidOf(0xfd03);
      const { R } = await rebooted(wmod, 'close-' + tag, [K, K2]);
      await otherDrain(R, O);   // a settle while the held wakes still owe their word: the item an earlier run filed is found open, kept
      const found = itemNow(R);
      R.todos.setStatus(machineItems(R)[0].id, 'dismissed');   // a PERSON closes it
      releaseOlder(R, K);
      const once = itemNow(R);
      R.todos.setStatus(machineItems(R)[0].id, 'dismissed');   // …and closes the refiled one
      releaseOlder(R, K2);
      const out = { found, once, again: itemNow(R), items: machineItems(R).length };
      R.stop(); return out;
    };
    const g = await scene(wiring, 'g');
    const r = await scene(wiringWith(anchored(JSRC, ".set(hid, Number(since) > 0 ? Number(since) : now());", '.set(hid, Number(since));', 'b2566r-start-zero'), 'b2566r-start-zero'), 'r');   // stale-pins: kept (the red copy's text: the start before r1861 (a))
    okP(g.found.status === 'open' && g.once.status === 'open' && /go out without its word/.test(g.once.text) && g.again.status === 'dismissed' && g.items === 1
        && r.once.status === 'open' && r.again.status === 'open',
      'r1861 (a): after a restart a person\'s close of the item found open is filed again ONCE (the start unknown; the machine\'s reason is new), and the close after that stands for the next conversation\'s release; RED: the unknown start kept as 0 ⇒ that release reopens it again',
      { green: g, red: r });
  }
  {
    // r1277 (7): the item goes BY ITSELF — RED: the drain's settle removed (a copy of the engine) ⇒ it stays open after the results went out
    const R = rig('machine-settle-red', wiringWith(anchored(JSRC, "    this._machineAwaySettle();   // B-2566's remainder: nothing waits for a machine any more — its item goes by itself\n", '', 'b2566r-no-settle'), 'b2566r-no-settle')), Q = cidOf(0xf701);
    R.down.set(Q, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
    failOf(R, task(R, 'jb-q', 'render-q', Q));
    await settle(() => machineItems(R).length === 1);
    R.jm.drainNotifs(Q);
    okP(machineItems(R)[0].status === 'open' && owedAway(R, Q) === 0, 'r1277 (7) RED CONTROL: the drain\'s settle removed (a copy of the engine) ⇒ the item stays OPEN after its results went out — the «goes by itself» leg would be red', { status: machineItems(R)[0].status });
    R.stop();
  }
  {
    // r1277 (6): A PAIRING REMOVED — the park refuses the held wake by name (code unpaired): the notices waiting for that machine say
    // the truth now (machine-unpaired: never «delivered when it replies»; open the conversation to read them) and the machine's item goes
    const R = rig('machine-unpaired'), V = cidOf(0xf801);
    R.down.set(V, 'h-b'); R.hostsDown.set('h-b', Date.now() - 2 * HOUR);
    failOf(R, task(R, 'jb-v', 'render-v', V));
    await settle(() => machineItems(R).length === 1);
    R.hostsDown.delete('h-b');   // the list no longer has it: nothing says «away» any more
    R.jm._onRetryEvent('wake', V, { producer: 'jobs', meta: { jobId: 'jb-v' } }, { outcome: 'refused', code: 'unpaired', why: 'its machine is no longer paired — open the conversation to read what waits for it' });
    const kinds = (R.jm.pendingNotifs.get(V) || []).map((n) => n.held && n.held.kind), digest = JM_MODEL.heldDigest(R.jm.pendingNotifs);
    okP(kinds.join() === 'machine-unpaired' && machineItems(R)[0].status === 'done' && JM_MODEL.HELD_KINDS.includes('machine-unpaired') && !!JM_MODEL.NOTIF_TAIL['machine-unpaired'],
      'r1277 (6): a pairing removed ⇒ its waiting results are «machine-unpaired» (their words: no longer paired — open the conversation to read them; never «when it replies») and the machine\'s item goes', { kinds, item: machineItems(R)[0].status, digest: digest.byConversation && digest.byConversation[V] });
    R.stop();
  }
}

// ── §B-0248 step 3 (lane bl-loop-b, 主开发 r1478/r1506): THE ARCHIVE THROUGH THE STORE WRITER — its bytes frozen at the hand-off, the
// records released at its LANDING; a reader sees the landed archive and the store as it was (a record listed ONCE, never twice, never
// in neither); a person's ✕ answered at the landing; a refusal keeps every record; an owed write never read past; the loop's measure ──
console.log('§B-0248 step 3: the archive through the store writer (bytes at the hand-off, records released at its landing)');
{
  // a stand-in writer the legs land by hand (one entry a file, the version a waiter wants, a refusal by EIO)
  const gatedJobsWriter = ({ fifo = false } = {}) => {   // fifo: the real writer's order — a write's bytes made when IT starts, a later hand-off queued behind it (never merged into it)
    const S = new Map(), armed = new Map();
    const st = (f) => { if (!S.has(f)) S.set(f, { v: 0, wv: 0, o: null, waiters: [], rides: [], dirty: false, flight: null }); return S.get(f); };
    const startF = (s) => { if (s.flight || !s.dirty) return; s.dirty = false; const b = s.o.produce(); s.flight = { v: s.v, bytes: Array.isArray(b) ? b.join('') : String(b) }; };
    function land(f, ok = true) {
      const s = S.get(f); if (!s) return;
      if (fifo) {
        if (!s.flight) startF(s); const fl = s.flight; if (!fl) return;
        if (!ok) { s.dirty = true; s.flight = null; const ws = s.waiters; s.waiters = []; for (const w of ws) w.cb(false); try { s.o.onWritten && s.o.onWritten(false, Object.assign(new Error('EIO: a stand-in'), { code: 'EIO' })); } catch { } return; }
        fs.writeFileSync(f, fl.bytes); s.flight = null; s.wv = fl.v;
        const keepR = []; for (const r of s.rides) { if (r.version <= s.wv) r.go(); else keepR.push(r); } s.rides = keepR;
        const keep = []; for (const w of s.waiters) { if (w.want <= s.wv) w.cb(true); else keep.push(w); } s.waiters = keep;
        try { s.o.onWritten && s.o.onWritten(true, null); } catch { }
        startF(s); return;
      }
      if (!s.dirty) return;
      if (ok) {
        const b = s.o.produce(); fs.writeFileSync(f, Array.isArray(b) ? b.join('') : String(b)); s.dirty = false; s.wv = s.v;
        const keep = []; for (const w of s.waiters) { if (w.want <= s.wv) w.cb(true); else keep.push(w); } s.waiters = keep;
        try { s.o.onWritten && s.o.onWritten(true, null); } catch { }
        const keepR = []; for (const r of s.rides) { if (r.version <= s.wv) { r.go(); } else keepR.push(r); } s.rides = keepR;
      } else { const ws = s.waiters; s.waiters = []; for (const w of ws) w.cb(false); try { s.o.onWritten && s.o.onWritten(false, Object.assign(new Error('EIO: a stand-in'), { code: 'EIO' })); } catch { } }
    }
    const W = {
      dirty(f, o) { const s = st(f); s.o = o; s.v++; s.dirty = true; if (fifo) startF(s); },
      pending: (f) => { const s = S.get(f); return !!s && (s.dirty || !!s.flight); },
      durable(f, { answer = null } = {}) { const s = S.get(f); const done = (ok) => { if (answer) answer(ok); return ok; }; if (!s || (!s.dirty && !s.flight)) return Promise.resolve(done(true)); const want = s.v; return new Promise((res) => s.waiters.push({ want, cb: (ok) => res(done(ok)) })); },
      whenDurable(files, o, answer) { let left = files.length, all = true; const one = (ok) => { all = all && ok; if (--left === 0 && answer) answer(all); }; for (const f of files) W.durable(f, { answer: one }); return Promise.resolve(true); },
      whyNotDurable: () => ({ why: 'failed', code: 'EIO' }),
      // r4362 (the flake census): two facts a leg waits on instead of a count of turns — the durability waits asked of a file, and the
      // reply bounds armed on it (an answer AT a bound can only come where one is armed)
      waitersOf: (f) => { const s = S.get(f); return s ? s.waiters.length : 0; },
      boundsOf: (f) => armed.get(f) || 0,
      // the writer's afterLanding: `step` at the REAL landing (never at a bound), `answer` once — at the landing, or false at `timeoutMs`
      afterLanding(f, step, { timeoutMs = null, answer = null } = {}) {
        const s = S.get(f); let replied = false; const reply = (ok) => { if (replied) return; replied = true; if (answer) answer(ok); };
        const go = () => { step(); reply(true); };
        if (!s || (!s.dirty && !s.flight)) { go(); return Promise.resolve({ landed: true }); }
        s.rides.push({ version: s.v, go });
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) { armed.set(f, (armed.get(f) || 0) + 1); const t = setTimeout(() => reply(false), timeoutMs); if (t.unref) t.unref(); }
        return Promise.resolve({ landed: null });
      },
      flushSync(files) { for (const f of files || [...S.keys()]) land(f, true); return { written: [], left: [] }; },
      forget: (f) => { S.delete(f); },
    };
    return { W, land, landAll: () => { for (const f of [...S.keys()]) land(f, true); }, ridesOf: (f) => { const s = S.get(f); return s ? s.rides.length : 0; }, waitersOf: W.waitersOf, boundsOf: W.boundsOf };   // r3796: what still rides a file's landing
  };
  // r3796 (B-7e49): a scene's own count of the reads of ONE file in flight — each ended a turn after it settles, so the reader's own
  // .then chain has run: what a wait on «the read again has answered» ends on
  const readsOf = (file) => { const prf = fs.promises.readFile, c = { n: 0, started: 0, stop: () => { fs.promises.readFile = prf; } }; fs.promises.readFile = function (f, ...a) { const p = prf.call(this, f, ...a); if (String(f) === file) { c.n++; c.started++; const done = () => setImmediate(() => { c.n--; }); p.then(done, done); } return p; }; return c; };
  const seedDone = () => fx.jobs.filter((j) => j.state === 'done' && !j.cron && !j.cronParent).map(strip);
  const scene = (Mod, tag, g = gatedJobsWriter()) => {
    const d = mkDir('jobs-archive-writer-' + tag);
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify(seedDone())); fs.writeFileSync(path.join(d, 'job-notifications.json'), '{}');
    const logs = [], bcs = [];
    const J = new Mod.JobManager({ dataDir: d, broadcast: (t, p) => bcs.push({ t, p }), notifyUser: () => ({ ok: true }), log: (...a) => logs.push(a.join(' ')), archivePolicy: () => policy, writer: g.W, logsSweep: { bootDelayMs: 3600e3 } });
    J.init(); g.landAll();
    return { d, g, J, AF: path.join(d, 'jobs-archive.json'), logs, bcs };
  };
  const MJb = mutantCopies('jobs-archive-b0248', ROOT);
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  // (1) THE RECORDS LEAVE AT THE LANDING; the readers see what landed: in flight, every record listed ONCE (live), none archived
  const releaseScene = (Mod, tag, { refuse = false } = {}) => {
    const { g, J, AF } = scene(Mod, tag); const n0 = J.jobs.size; let ans = null;
    const h = J.archiveSweep({ now: T0 + 25 * H, answer: (x) => { ans = x; } });
    const inFlight = { handed: (h.handed || []).length, live: J.jobs.size, archived: J.archivedCount(), answered: !!ans };
    g.land(AF, !refuse);
    const after = { live: J.jobs.size, archived: J.archivedCount(), released: ans ? (ans.archived || []).length : null, failed: ans && ans.failed };
    try { J.shutdown(); } catch { }
    return { n0, inFlight, after };
  };
  const RL = releaseScene({ JobManager }, 'real');
  ok(RL.inFlight.handed > 0 && RL.inFlight.live === RL.n0 && RL.inFlight.archived === 0 && RL.inFlight.answered === false
    && RL.after.released === RL.inFlight.handed && RL.after.live === RL.n0 - RL.inFlight.handed && RL.after.archived === RL.inFlight.handed,
    `the sweep HANDS the archive (${RL.inFlight.handed} records): in flight every one is still listed once, as a live job (none archived yet); at its LANDING they leave the store and the archive lists them`, RL);
  const NOW_A = "    this._ride(this.archiveFile, 'the archive', step, { timeoutMs: replyMs, answer: reply });\n";
  ok(JSRC.split(NOW_A).length === 2, 'control setup: the archive\'s step and reply at its landing are found once');
  const atOnce = MJb.load('src/jobs.js', anchored(JSRC, NOW_A, "    step(); reply(true);   // MUTANT: landed at the hand-off\n", 'archive-at-once'), 'archive-at-once');
  const RLX = releaseScene(atOnce, 'atonce');
  ok(RLX.inFlight.live < RLX.n0 && RLX.inFlight.archived === 0, 'CONTROL (answered at the hand-off, in a copy): the records leave the store before the archive holding them landed — listed in NEITHER (red)', RLX.inFlight);
  // (2) A REFUSED ARCHIVE KEEPS EVERY RECORD (the 2026-09-16 law), said FAILED once; the writer's write AGAIN lands them (never at a bound)
  const refusedScene = (Mod, tag) => {
    const { g, J, AF, logs } = scene(Mod, tag); const n0 = J.jobs.size;
    const h = J.archiveSweep({ now: T0 + 25 * H });
    g.land(AF, false);                                            // the storage refuses it
    const refused = { live: J.jobs.size, archived: J.archivedCount(), said: logs.filter((l) => /archive write FAILED/.test(l)).length };
    g.land(AF, true);                                             // the writer's write again lands
    const after = { live: J.jobs.size, archived: J.archivedCount() };
    try { J.shutdown(); } catch { }
    return { n0, handed: (h.handed || []).length, refused, after };
  };
  const RF = refusedScene({ JobManager }, 'refused');
  ok(RF.handed > 0 && RF.refused.live === RF.n0 && RF.refused.archived === 0 && RF.refused.said === 1 && RF.after.live === RF.n0 - RF.handed && RF.after.archived === RF.handed,
    'an archive the storage refuses keeps every record in the store and is said FAILED once; the store writer\'s write again lands it — only then do the records leave (a retry, never a loss, never at a bound)', RF);
  const RFX = refusedScene(atOnce, 'refusedx');
  ok(RFX.refused.live < RFX.n0, 'CONTROL (released at the hand-off, in a copy): the records leave the store under an archive the storage refused — gone for good (red)', RFX.refused);
  // (3) A PERSON's ✕ IS ANSWERED AT THE LANDING: in flight no answer, the row still listed; landed, answered and gone
  const rmScene = (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag);
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll();
    const id = J.archivedList()[0].id; let ans = null;
    const r = J.rmArchived(id, (x) => { ans = x; });
    const inFlight = { sync: !!(r && r.pending), answered: !!ans, listed: !!J.archivedById(id) };
    g.land(AF);
    const out = { inFlight, answered: ans, listed: !!J.archivedById(id) };
    try { J.shutdown(); } catch { }
    return out;
  };
  const RM = rmScene({ JobManager }, 'real');
  ok(gateOf(RM.inFlight.sync) && !RM.inFlight.answered && gateOf(RM.inFlight.listed) && gateOf(RM.answered) && RM.answered.ok === true && !RM.listed, 'a person\'s ✕ on an archived row: no answer while its removal is in flight (the row still listed); at the landing it is answered and the row is gone', RM);
  const RMX = rmScene(atOnce, 'atonce');
  ok(RMX.inFlight.answered === true && RMX.inFlight.listed === true, 'CONTROL (answered at the hand-off, in a copy): the ✕ is answered «gone» while the row is still on disk and listed (red)', RMX.inFlight);
  // (4) AN ARCHIVE WRITE THIS PROCESS STILL OWES IS NEVER READ PAST — AND NEVER FLUSHED ON THE LOOP (r1908 (5)): a second engine on the
  // same folder (and writer) holds the archive UNREAD (EOWED) while the write is owed, then its read again (off the loop) reads what landed
  const owedScene = async (Mod2, tag) => {
    const g = gatedJobsWriter(); const { d, J, AF } = scene({ JobManager }, tag, g);
    J.archiveSweep({ now: T0 + 25 * H });   // handed, not landed
    let flushes = 0; const fs0 = g.W.flushSync; g.W.flushSync = (files) => { if (!files || files.includes(AF)) flushes++; return fs0(files); };
    const logs2 = [];   // the unread backoff set past the leg (60 s): the read again must come from the LANDING itself
    const J2 = new Mod2.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: (...a) => logs2.push(a.join(' ')), archivePolicy: () => policy, writer: g.W, logsSweep: { bootDelayMs: 3600e3 }, unreadRetry: { firstMs: 60e3, maxMs: 60e3 } });
    const n0 = J2.archivedCount(), held = (J2._unread.archive && J2._unread.archive.code) || null, flushed = flushes;
    const clearWords = ((J2.clearJobs(['jb-0000c1e0'], { by: 'owner' }) || {}).archiveUnread) || '';   // r2255 (2): a clear met while it holds
    g.W.flushSync = fs0;
    const rd = readsOf(AF);
    try {
      g.land(AF);                                                 // the first engine's write lands (its riders run inside the landing)
      // r3796 (B-7e49): the wait ends on its FACT — the hold lifted, or nothing left that could lift it (no ride on the archive, no read
      // of it in flight, no write of it owed): a copy that never reads again ends here at once, not at the 2 s bound
      for (let i = 0; i < 200 && J2._unread.archive && (g.ridesOf(AF) || rd.n || g.W.pending(AF)); i++) await new Promise((r) => setTimeout(r, 10));
    } finally { rd.stop(); }
    const n = J2.archivedCount(), noted = !!(J2._logsNoteOwed && J2._logsNoteOwed.archive), saidFailed = logs2.some((l) => /could not be read/.test(l));
    try { J.shutdown(); } catch { } try { J2.shutdown(); } catch { }
    return { n0, held, flushed, n, readAgain: !J2._unread.archive, noted, saidFailed, clearWords };
  };
  const OW = await owedScene({ JobManager }, 'owed');
  ok(OW.n0 === 0 && OW.held === 'EOWED' && OW.flushed === 0 && gateOf(OW.readAgain) && OW.n > 0 && !OW.noted && !OW.saidFailed && gateOf(/has not landed yet/.test(OW.clearWords)) && !/For you/.test(OW.clearWords), 'an archive write this process still owes is never read past and never flushed on the loop: a second engine holds the archive unread (EOWED) — none of a failed read\'s notes, a clear meanwhile says the write has not landed — and reads it again off the loop at THAT write\'s landing', OW);
  const OWC_A = "this._unread.archive.owed ? `Background Work: archived records could not be reached";
  ok(JSRC.split(OWC_A).length === 2, 'control setup: the owed hold\'s own clear words are found once');
  const OWC = await owedScene(MJb.load('src/jobs.js', anchored(JSRC, OWC_A, "false /* MUTANT: the failed read's words */ ? `Background Work: archived records could not be reached", 'archive-owed-clear-words'), 'archive-owed-clear-words'), 'owedc');
  ok(verdictOf(/For you/.test(OWC.clearWords)), 'CONTROL (the owed hold\'s own words cut, in a copy): a clear meanwhile says «could not be read … For you says what to check» — no such item exists (red)', OWC.clearWords);
  const OWED_A = "if (typeof W.pending === 'function' && W.pending(this.archiveFile)) owedStill = 'its write has not landed yet';";
  ok(JSRC.split(OWED_A).length === 2, 'control setup: the archive load\'s owed check is found once');
  const OWX = await owedScene(MJb.load('src/jobs.js', anchored(JSRC, OWED_A, "if (false) owedStill = 'x';   /* MUTANT: the owed write read past */", 'archive-read-past'), 'archive-read-past'), 'owedx');
  ok(OWX.held === null && OWX.n === 0, 'CONTROL (the owed check cut, in a copy): the second engine reads the older file past the write still owed, and never again (red)', OWX);
  const OWF = await owedScene(MJb.load('src/jobs.js', anchored(JSRC, OWED_A, "if (typeof W.pending === 'function' && W.pending(this.archiveFile)) { const r = W.flushSync([this.archiveFile]); if (r.deferred) owedStill = 'x'; }   /* MUTANT: the owed write flushed on the loop (eed25565e) */", 'archive-owed-flushed'), 'archive-owed-flushed'), 'owedf');
  ok(OWF.flushed === 1, 'CONTROL (the owed write flushed at the read, in a copy — the unit as it was): a synchronous flush on the loop (red)', OWF);
  const OWH_A = "    if (owedStill) return this._archiveOwedHold(owedStill);\n";
  ok(JSRC.split(OWH_A).length === 2, 'control setup: the owed write\'s light hold is found once');
  const OWM = await owedScene(MJb.load('src/jobs.js', anchored(JSRC, OWH_A, "    if (owedStill) { this._archiveAnswer(SR.storeAnswer({ error: Object.assign(new Error('owed'), { code: 'EOWED' }) }, { valid: Array.isArray })); return this.archive; }   /* MUTANT: a failed read's machinery */\n", 'archive-owed-as-failed'), 'archive-owed-as-failed'), 'owedm');
  ok(OWM.noted === true || OWM.saidFailed === true, 'CONTROL (the owed write held as a FAILED read, in a copy — the follow as first built): «could not be read» (and its notes) for a write that only had not landed (red)', OWM);
  const OWR_A = "    this._ride(this.archiveFile, 'the owed archive read again', again);\n    return [];";
  ok(JSRC.split(OWR_A).length === 2, 'control setup: the owed archive\'s read again at the landing is found once');
  const OWR = await owedScene(MJb.load('src/jobs.js', anchored(JSRC, OWR_A, "    /* MUTANT: not read again at the landing */\n    return [];", 'archive-owed-never-read'), 'archive-owed-never-read'), 'owedr');
  ok(OWR.readAgain === false && OWR.n === 0, 'CONTROL (not read again at the landing, in a copy): the second engine stays held past the write\'s landing — its archive empty until the backoff (red)', OWR);
  // (4b) r2255 (2): the read again looks at the writer ONCE MORE before it loads — a write this process handed while it read (the first
  // engine's next archive) is waited for at ITS landing; the older file is never loaded. RED: the second look cut
  const owedRace = async (Mod2, tag) => {
    const g = gatedJobsWriter(); const { d, J, AF } = scene({ JobManager }, tag, g);
    J.archiveSweep({ now: T0 + 25 * H });   // write 1, handed
    const J2 = new Mod2.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: g.W, logsSweep: { bootDelayMs: 3600e3 }, unreadRetry: { firstMs: 60e3, maxMs: 60e3 } });
    J2.archivedCount();                      // held (EOWED)
    const rd = readsOf(AF);
    try {
    g.land(AF);                              // write 1 lands: the second engine's read again starts (off the loop)
    const n1 = JSON.parse(fs.readFileSync(AF, 'utf8')).length;
    J._writeArchive(J._archiveNext().slice(1));   // write 2 (one record fewer), handed WHILE that read runs
    // r3796 (B-7e49): ends on its FACT — the read again begun at write 1's landing has ANSWERED (a copy that loads it lifts the hold;
    // the engine rides write 2's landing): never a 500 ms clock
    for (let i = 0; i < 50 && J2._unread.archive && !(rd.started && !rd.n); i++) await new Promise((r) => setTimeout(r, 10));
    const midway = { held: !!J2._unread.archive, n: J2.archivedCount() };
    g.land(AF);                              // write 2 lands
    for (let i = 0; i < 200 && J2._unread.archive; i++) await new Promise((r) => setTimeout(r, 10));
    const after = { held: !!J2._unread.archive, n: J2.archivedCount() };
    try { J.shutdown(); } catch { } try { J2.shutdown(); } catch { }
    return { n1, midway, after };
    } finally { rd.stop(); }
  };
  const OR = await owedRace({ JobManager }, 'owed-race');
  ok(OR.n1 > 1 && gateOf(OR.midway.held) && OR.midway.n === 0 && !OR.after.held && OR.after.n === OR.n1 - 1, 'a write handed while the owed read again reads is waited for at ITS landing — the second engine never loads the older file, and reads the newer once it lands', OR);
  const ORA_A = "        if (owedNow()) { this._ride(this.archiveFile, 'the owed archive read again', again); return; }   // handed while it read";
  ok(JSRC.split(ORA_A).length === 2, 'control setup: the read again\'s second look is found once');
  const ORX = await owedRace(MJb.load('src/jobs.js', anchored(JSRC, ORA_A, "        /* MUTANT: no second look */   // handed while it read", 'archive-owed-no-second-look'), 'archive-owed-no-second-look'), 'owedracex');
  ok(ORX.midway.held === false && ORX.midway.n === ORX.n1, 'CONTROL (the second look cut, in a copy): the second engine loads the older file while a newer write is owed (red)', ORX);
  // (6) A RECORD CHANGED IN THE WINDOW STAYS THE STORE's (the read's MUST): ran again, removed or edited between the hand-off and the
  // landing — kept live, its handed copy taken out of the archive again by a follow-up write; never listed twice. RED: the as-handed check cut
  const changedScene = (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag);
    const h = J.archiveSweep({ now: T0 + 25 * H }); const id = (h.handed || [])[0];
    J.jobs.get(id).note = 'edited while its archive was in flight';
    g.land(AF);                                                   // the archive lands: the changed record is not released
    const atLanding = { live: J.jobs.has(id), listedArchived: !!J.archivedById(id), inList: J.archivedList().some((r) => r.id === id) };
    g.land(AF);                                                   // the follow-up lands: its copy is out of the file
    let inFile = null; try { inFile = JSON.parse(fs.readFileSync(AF, 'utf8')).some((r) => r.id === id); } catch { }
    try { J.shutdown(); } catch { }
    return { atLanding, inFile, note: J.jobs.get(id) && J.jobs.get(id).note };
  };
  const CH = changedScene({ JobManager }, 'real');
  ok(gateOf(CH.atLanding.live) && !CH.atLanding.listedArchived && !CH.atLanding.inList && CH.inFile === false && verdictOf(/edited/.test(CH.note || '')), 'a record changed while its archive was in flight stays the store\'s (its change kept), is listed once — live — and its handed copy is taken out of the archive by a follow-up write', CH);
  const ASH_A = "if (j && storeBytes(j) === handedSigs.get(m.id)) out.push(m); else back.push(m.id);";
  ok(JSRC.split(ASH_A).length === 2, 'control setup: the as-handed check is found once');
  const CHX = changedScene(MJb.load('src/jobs.js', anchored(JSRC, ASH_A, "if (j) out.push(m); else back.push(m.id);   /* MUTANT: the as-handed check cut */", 'archive-as-handed-cut'), 'archive-as-handed-cut'), 'ashandedx');
  ok(CHX.atLanding.live === false, 'CONTROL (the as-handed check cut, in a copy): the record edited in the window is released — the person\'s change is lost under the older copy (red)', CHX.atLanding);
  // (7) A ✕ REPEATED WHILE ITS REMOVAL IS IN FLIGHT says «being removed» (409), never «no such archived job» for a row still listed
  const rmTwice = (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag);
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll();
    const id = J.archivedList()[0].id;
    J.rmArchived(id, () => { }); const again = J.rmArchived(id, () => { });
    g.land(AF); try { J.shutdown(); } catch { }
    return { code: again && again.code, error: again && again.error };
  };
  const RT = rmTwice({ JobManager }, 'real');
  ok(RT.code === 'being-removed', 'a ✕ repeated while its removal is in flight says «being removed» (409) — the row is still listed, never «no such archived job»', RT);
  const BR_A = "? { error: 'its removal is not on disk yet — it finishes by itself', code: 'being-removed' } : ";
  ok(JSRC.split(BR_A).length === 2, 'control setup: the «being removed» answer is found once');
  const RTX = rmTwice(MJb.load('src/jobs.js', anchored(JSRC, BR_A, "? { error: 'no such archived job' } : /* MUTANT: «being removed» cut */ ", 'archive-being-removed-cut'), 'archive-being-removed-cut'), 'beingx');
  ok(RTX.code !== 'being-removed' && verdictOf(/no such archived job/.test(RTX.error || '')), 'CONTROL («being removed» cut, in a copy): the repeat says «no such archived job» for a row still listed (red)', RTX);
  // (8) A CREATE's OR A STOP's ANSWER NEVER WAITS ON THE ARCHIVE (the read's should): persisted() waits for it only while a clear owes it
  const persScene = (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag);
    J.archiveSweep({ now: T0 + 25 * H });                         // an archive in flight (a sweep's — no person waits on it)
    let p1 = null; J.persisted((ok) => { p1 = ok; });
    const out = { p1 }; g.land(AF); try { J.shutdown(); } catch { }
    return out;
  };
  const PS = persScene({ JobManager }, 'real');
  ok(PS.p1 === true, 'a door\'s persisted() answers once jobs.json and the notices are on disk — a sweep\'s archive in flight is not its to wait for', PS);
  const PER_A = "...(archiveSeq > this._archiveLandedSeq ? [this.archiveFile] : [])";
  ok(JSRC.split(PER_A).length === 2, 'control setup: the archive in persisted() only for a clear is found once');
  const PSX = persScene(MJb.load('src/jobs.js', anchored(JSRC, PER_A, "this.archiveFile /* MUTANT: always */", 'archive-persisted-always'), 'archive-persisted-always'), 'persx');
  ok(PSX.p1 === null, 'CONTROL (the archive always waited for, in a copy): a create\'s or a stop\'s answer waits on a sweep\'s archive (red)', PSX);
  // (9) TWO SWEEPS IN FLIGHT NEVER HAND ONE RECORD TWICE (its second read's MUST): a record live AND in the landed archive (a crash
  // between an archive's landing and jobs.json's release) handed by sweep A; sweep B while A's write is in flight skips it — whatever the
  // landed archive holds. The real writer's order (each write made when it starts). RED: the handed set cut — A releases it, B's landing
  // finds it gone and its follow-up takes the archived copy out: the record in NEITHER file
  const twoSweeps = (Mod, tag) => {
    const g = gatedJobsWriter({ fifo: true });
    const d = mkDir('jobs-archive-twice-' + tag); const recs = seedDone();
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify(recs)); fs.writeFileSync(path.join(d, 'job-notifications.json'), '{}');
    fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify(recs.map((r) => ({ ...r, archivedAt: 1, archivedWhy: 'done' }))));   // the crash's state: in both files
    const J = new Mod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: g.W, logsSweep: { bootDelayMs: 3600e3 } });
    J.init(); g.landAll();
    const AF = path.join(d, 'jobs-archive.json'), id = recs[0].id;
    const A = J.archiveSweep({ now: T0 + 25 * H }), B = J.archiveSweep({ now: T0 + 25 * H + 1 });
    for (let i = 0; i < 6; i++) g.land(AF);
    let inFile = false; try { inFile = JSON.parse(fs.readFileSync(AF, 'utf8')).some((r) => r.id === id); } catch { }
    try { J.shutdown(); } catch { }
    return { aHanded: (A.handed || []).length, bHanded: (B.handed || []).length, live: J.jobs.has(id), inFile };
  };
  const TW = twoSweeps({ JobManager }, 'real');
  ok(TW.aHanded > 0 && TW.bHanded === 0 && TW.live === false && TW.inFile === true, 'two sweeps in flight never hand one record twice: the second skips what the first handed (whatever the landed archive holds) — released once, archived once', TW);
  const HS_A = "      else if (this._archiveHandedIds.has(id)) moved.splice(i, 1);";
  ok(JSRC.split(HS_A).length === 2, 'control setup: the handed set\'s skip is found once');
  const TWX = twoSweeps(MJb.load('src/jobs.js', anchored(JSRC, HS_A, "      /* MUTANT: the handed set's skip cut */", 'archive-handed-twice'), 'archive-handed-twice'), 'twicex');
  ok(TWX.live === false && TWX.inFile === false, 'CONTROL (the handed set cut, in a copy): the record is handed twice — released by the first landing, its copy taken out by the second\'s follow-up: in NEITHER file (red)', TWX);
  // (10) A RECORD REMOVED IN THE WINDOW: its landed copy is hidden from every reader until the follow-up takes it out, and the pages are
  // told at that landing (its second read's should). RED: the hiding cut — the removed job shows as an archived row meanwhile
  const removedScene = (Mod, tag) => {
    const { g, J, AF, bcs } = scene(Mod, tag);
    const h = J.archiveSweep({ now: T0 + 25 * H }); const id = (h.handed || [])[0];
    J.rm(J.jobs.get(id));                                         // the person removes it while its archive is in flight
    g.land(AF);                                                   // the archive lands (holding it)
    const atLanding = { listed: !!J.archivedById(id), inList: J.archivedList().some((r) => r.id === id) };
    const told0 = bcs.filter((b) => b.t === 'jobs-updated').length;
    g.land(AF);                                                   // the follow-up lands
    let inFile = null; try { inFile = JSON.parse(fs.readFileSync(AF, 'utf8')).some((r) => r.id === id); } catch { }
    const told = bcs.filter((b) => b.t === 'jobs-updated').length - told0;
    try { J.shutdown(); } catch { }
    return { atLanding, inFile, told };
  };
  const RV = removedScene({ JobManager }, 'real');
  ok(!RV.atLanding.listed && !RV.atLanding.inList && RV.inFile === false && RV.told >= 1, 'a record removed while its archive was in flight is never listed as archived: hidden until the follow-up takes its copy out, the pages told at that landing', RV);
  const TO_A = "  archivedById(id) { if (this.jobs.has(id) || this._archiveTakingOut.has(id)) return null;";
  ok(JSRC.split(TO_A).length === 2, 'control setup: the hiding of a copy being taken out is found once');
  const RVX = removedScene(MJb.load('src/jobs.js', anchored(JSRC, TO_A, "  archivedById(id) { if (this.jobs.has(id)) return null;   /* MUTANT: the hiding cut */", 'archive-hiding-cut'), 'archive-hiding-cut'), 'hidingx');
  ok(RVX.atLanding.listed === true, 'CONTROL (the hiding cut, in a copy): the job the person removed shows as an archived row until the follow-up lands (red)', RVX.atLanding);
  // (11) r1917: logsGone() ASKED BETWEEN A ✕'s HAND-OFF AND ITS LANDING WAITS FOR THE LANDING — never «gone» for a folder the remover
  // was not handed yet (the heavy suite's eight asked it right after the ✕; the routes wait for the landing's answer). RED: not armed at
  // the hand-off — «gone» at once while the row is still on disk
  const goneScene = async (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag);
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll(); g.landAll();
    const id = J.archivedList()[0].id;
    J._logsWhole = (ids) => Promise.resolve({ gone: [], keptWhy: Object.fromEntries(ids.map((x) => [x, 'running'])) });   // the remover's answer: a run still running
    J.rmArchived(id, () => { });
    let v = null; J.logsGone(id, 3000).then((x) => { v = x; });
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const inFlight = v;
    g.land(AF);
    for (let i = 0; i < 100 && v === null; i++) await new Promise((r) => setTimeout(r, 5));
    try { J.shutdown(); } catch { }
    return { inFlight, atLanding: v };
  };
  const GN = await goneScene({ JobManager }, 'gone');
  ok(GN.inFlight === null && gateOf(GN.atLanding) && GN.atLanding.kept === 'running', 'logsGone() asked between a ✕\'s hand-off and its landing waits for the landing, then says what stays and why (here «running») — never «gone» for a folder the remover was not handed yet', GN);
  const GN_A = "    this._logsGone.set(id, handed); handed.then(";
  ok(JSRC.split(GN_A).length === 2, 'control setup: the ✕\'s hand-off arming logsGone is found once');
  const GNX = await goneScene(MJb.load('src/jobs.js', anchored(JSRC, GN_A, "    /* MUTANT: not armed at the hand-off */ handed.then(", 'archive-gone-unarmed'), 'archive-gone-unarmed'), 'gonex');
  ok(gateOf(GNX.inFlight) && GNX.inFlight.gone === true, 'CONTROL (not armed at the hand-off, in a copy): logsGone() says «gone» while the ✕ is in flight and its folder was never handed to the remover (red)', GNX);
  // r4362 (row B-3dbd's family, the flake census at 2.369.419): the waits below end on the FACT each leg reads, never on a count of
  // turns standing in for it. factOf polls the fact (every 5 ms) under a generous bound whose expiry is a NAMED failed line. drained()
  // is used only where the answer is IN MEMORY (an already-settled promise and its thens): one macrotask runs after EVERY pending
  // microtask — the event loop's own order, which no load reorders (never «a few turns» for work on a disk).
  const FACT_MS = 20000;
  const factOf = async (fact, what) => { const t0 = Date.now(); while (!fact() && Date.now() - t0 < FACT_MS) await new Promise((r) => setTimeout(r, 5)); const there = !!fact(); if (!there) ok(false, `the leg's fact never came: ${what} — waited ${FACT_MS} ms`); return there; };
  const drained = () => new Promise((r) => setImmediate(r));
  // (11b) r2001: a ✕ whose removal the STORAGE HELD is OWED — logsGone() says «still being deleted» whenever it is asked, never the map's
  // default «gone» once the held answer settled (the heavy suite's three held legs asked late). RED: the owed answer cut
  const heldScene = async (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag);
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll(); g.landAll();
    const id = J.archivedList()[0].id;
    J._logsRm = { whole: async () => ({ error: 'held', held: true, gone: [] }), sweep: async () => ({}), settled: () => Promise.resolve(), busy: () => false, held: () => true, state: async () => ({}), forget: () => { }, stop() { } };   // the storage holds the removal
    J._logsKeepOwed = () => { };   // the owed RECORD's write is the heavy suite's leg; this one reads the answer
    J.rmArchived(id, () => { }); g.land(AF);
    await factOf(() => J._logsOwed.has(id) && !J._logsGone.has(id), `${tag}: the held answer settled (the ✕ owed, its hand-off ended)`);   // r4362: the held answer settles — waited on it
    const late = await J.logsGone(id, 1000), owed = J._logsOwed.has(id);
    try { J.shutdown(); } catch { }
    return { late, owed };
  };
  const HL = await heldScene({ JobManager }, 'held');
  // r4362 (主开发 r4340 law 3): THE RACE MADE RED AT WILL — the storage's held answer comes 40 turns after the ask (a placed hold in the
  // remover's stand-in): the OLD wait (20 turns) reads the ✕ NOT owed yet — a leg judged then read the map's default; the wait on the
  // fact reads it owed
  {
    const { g, J, AF } = scene({ JobManager }, 'held-placed');
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll(); g.landAll();
    const id = J.archivedList()[0].id;
    J._logsRm = { whole: async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); return { error: 'held', held: true, gone: [] }; }, sweep: async () => ({}), settled: () => Promise.resolve(), busy: () => false, held: () => true, state: async () => ({}), forget: () => { }, stop() { } };
    J._logsKeepOwed = () => { };
    J.rmArchived(id, () => { }); g.land(AF);
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));   // the OLD wait, as it stood
    const owedAtTurns = J._logsOwed.has(id);
    const owedAtFact = await factOf(() => J._logsOwed.has(id) && !J._logsGone.has(id), 'held-placed: the held answer settled');
    try { J.shutdown(); } catch { }
    ok(owedAtTurns === false && owedAtFact === true, 'PLACED (r4340 law 3): the storage\'s held answer 40 turns after the ask — the old wait (20 turns) read the ✕ NOT owed yet (red at will for a leg judged then); the wait on the fact read it owed', { owedAtTurns, owedAtFact });
  }
  ok(gateOf(HL.owed) && gateOf(HL.late) && HL.late.pending === true, 'a ✕ the storage held is OWED, and logsGone() asked after its answer settled still says «still being deleted» — never «gone»', HL);
  const HL_A = "if (!p) return Promise.resolve(this._logsOwed && this._logsOwed.has(id) ? { pending: true } : { gone: true });";
  ok(JSRC.split(HL_A).length === 2, 'control setup: logsGone\'s owed answer is found once');
  const HLX = await heldScene(MJb.load('src/jobs.js', anchored(JSRC, HL_A, "if (!p) return Promise.resolve({ gone: true });   /* MUTANT: the owed answer cut */", 'archive-held-gone'), 'archive-held-gone'), 'heldx');
  ok(gateOf(HLX.owed) && gateOf(HLX.late) && HLX.late.gone === true, 'CONTROL (the owed answer cut, in a copy): a removal the storage held reads «gone» once its answer settled (red)', HLX);
  // (5) THE LOOP NO LONGER WAITS FOR THE ARCHIVE: the REAL store writer (its own thread), 300 ms placed in each main-thread rename /
  // fsync of the scene's folder; judged against the red's own figure (the release's write at the call, in a copy)
  const SWr = require(path.join(ROOT, 'src/store-writer.js'));
  const SAB = new Int32Array(new SharedArrayBuffer(4)), STALL = 300;
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  const archLoop = async (Mod, tag) => {
    const d = mkDir('jobs-archive-loop-' + tag);
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify(seedDone())); fs.writeFileSync(path.join(d, 'job-notifications.json'), '{}');
    const w = SWr.create({ log: { warn() { }, log() { }, error() { } }, graceMs: 5000 });
    const J = new Mod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: w, logsSweep: { bootDelayMs: 3600e3 } });
    J.init();
    const AF = path.join(d, 'jobs-archive.json');
    const oRen = fs.renameSync, oFsync = fs.fsyncSync;
    fs.renameSync = function (a, ...r) { if (String(a).startsWith(d)) Atomics.wait(SAB, 0, 0, STALL); return oRen.call(this, a, ...r); };
    fs.fsyncSync = function (...r) { Atomics.wait(SAB, 0, 0, STALL); return oFsync.apply(this, r); };
    let last = performance.now(), gap = 0, on = true;
    const tick = () => { const t = performance.now(); if (t - last > gap) gap = t - last; last = t; if (on) setTimeout(tick, 1); };
    setTimeout(tick, 1);
    let onDisk = 0;
    try {
      J.archiveSweep({ now: T0 + 25 * H });
      for (let i = 0; i < 300; i++) { await sleepMs(10); try { onDisk = JSON.parse(fs.readFileSync(AF, 'utf8')).length; } catch { onDisk = 0; } if (onDisk > 0) break; }   // a wait for WHAT HAPPENED: the archive on disk
    } finally { fs.renameSync = oRen; fs.fsyncSync = oFsync; on = false; }
    await sleepMs(5);
    try { J.shutdown(); } catch { } try { w.stop(); } catch { }
    return { gap: Math.round(gap), onDisk };
  };
  const AL = await archLoop({ JobManager }, 'real');
  console.log(`  ⊙ the loop's longest turn with ${STALL} ms placed in each main-thread rename / fsync, a sweep that moves ${AL.onDisk} records: ${AL.gap} ms`);
  const CALL_A = "    let bytes, W;\n    try { bytes = storeBytes(arr); W = this._writer(); } catch (e) { return { ok: false, error: e.message }; }\n";
  ok(JSRC.split(CALL_A).length === 2, 'control setup: the archive\'s hand-off is found once');
  const atCall = MJb.load('src/jobs.js', anchored(JSRC, CALL_A, "    try { writeJsonAtomic(this.archiveFile, arr); this.archive = arr; if (onLanded) onLanded(); if (answer) answer({ ok: true }); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }   // MUTANT: the release's write at the call\n    let bytes, W;\n", 'archive-at-call'), 'archive-at-call');
  const ALX = await archLoop(atCall, 'atcall');
  console.log(`  ⊙ the red's own figure: the release's write at the call ${ALX.gap} ms; the tree ${AL.gap} ms`);
  ok(AL.onDisk > 0 && AL.gap * 2 < ALX.gap, `the loop no longer waits for the archive: the longest turn ${AL.gap} ms — under half of the red's own ${ALX.gap} ms; the archive on disk`, { tree: AL, atCall: ALX });
  ok(ALX.gap >= STALL && ALX.onDisk > 0, `CONTROL (the release's write at the call, in a copy): the loop is held ${ALX.gap} ms (≥ ${STALL}) by the archive's rename (red)`, ALX);
  // ── r1908's FOLLOW (round wwe6mu63f): every client sees the landing; a stale copy hidden while it is taken out; the panel's own words;
  // the sweep's answer on every return; the two holds, the clear door and the ✕'s bound; an ended engine's landing said ──
  // (12) EVERY CLIENT SEES THE LANDING: a clear of an ARCHIVED record is told when the archive holding it lands — never at the hand-off
  // (a page that refetched then read the landed archive, the old words, and nothing told it again). RED: told at the hand-off
  const clearScene = (Mod, tag) => {
    const { g, J, bcs } = scene(Mod, tag);
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll(); g.landAll();
    const id = J.archivedList()[0].id, b0 = bcs.length;
    const told = () => bcs.slice(b0).filter((b) => b.t === 'jobs-updated' && b.p && (b.p.cleared || []).includes(id)).length;
    const out = J.clearJobs([id], { by: 'owner' });
    const atHandOff = { told: told(), clearedOnDisk: !!(J.archivedById(id) || {}).clearedAt };
    g.landAll();
    const atLanding = { told: told(), clearedOnDisk: !!(J.archivedById(id) || {}).clearedAt };
    try { J.shutdown(); } catch { }
    return { cleared: (out.cleared || []).includes(id), atHandOff, atLanding };
  };
  const CL = clearScene({ JobManager }, 'clear-told');
  ok(gateOf(CL.cleared) && CL.atHandOff.told === 0 && !CL.atHandOff.clearedOnDisk && CL.atLanding.told === 1 && verdictOf(CL.atLanding.clearedOnDisk), 'a clear of an ARCHIVED record is told to every page when the archive holding it lands (once) — never at the hand-off, while the landed archive still reads the old words', CL);
  const CLT_A = "    clearMade = true; if (!archChanged || clearLanded) tellCleared();";
  ok(JSRC.split(CLT_A).length === 2, 'control setup: the clear\'s one broadcast, at the archive\'s landing, is found once');
  const CLX = clearScene(MJb.load('src/jobs.js', anchored(JSRC, CLT_A, "    clearMade = true; tellCleared();   /* MUTANT: told at the hand-off */", 'archive-clear-told-early'), 'archive-clear-told-early'), 'cleartoldx');
  ok(CLX.atHandOff.told >= 1 && !CLX.atHandOff.clearedOnDisk, 'CONTROL (told at the hand-off, in a copy): the pages are told «cleared» while the archive on disk still holds the old words (red)', CLX.atHandOff);
  // (13) A LIVE JOB REMOVED WHOSE STALE ARCHIVED COPY A CRASH LEFT: the copy is hidden while it is taken out — never an archived row for
  // the job just removed. RED: not hidden
  const staleScene = (Mod, tag) => {
    const g = gatedJobsWriter();
    const d = mkDir('jobs-archive-stale-' + tag); const recs = seedDone();
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify(recs)); fs.writeFileSync(path.join(d, 'job-notifications.json'), '{}');
    fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify([{ ...recs[0], archivedAt: 1, archivedWhy: 'done' }]));   // the crash's state: one record in both files
    const J = new Mod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: g.W, logsSweep: { bootDelayMs: 3600e3 } });
    J.init(); g.landAll();
    const AF = path.join(d, 'jobs-archive.json'), id = recs[0].id;
    const r = J.rm(J.jobs.get(id));
    const inFlight = { removed: !!(r && r.ok) && !J.jobs.has(id), byId: !!J.archivedById(id), inList: J.archivedList().some((x) => x.id === id) };
    g.landAll();
    let inFile = null; try { inFile = JSON.parse(fs.readFileSync(AF, 'utf8')).some((x) => x.id === id); } catch { }
    const after = !!J.archivedById(id);
    try { J.shutdown(); } catch { }
    return { inFlight, inFile, after };
  };
  const ST = staleScene({ JobManager }, 'stale');
  ok(gateOf(ST.inFlight.removed) && !ST.inFlight.byId && !ST.inFlight.inList && ST.inFile === false && !ST.after, 'a live job removed whose stale archived copy a crash left: that copy is hidden while it is taken out (never an archived row for the job just removed), and out of the file at its landing', ST);
  const STK_A = "      this._archiveTakingOut.add(job.id);\n      const w = this._writeArchive(";
  ok(JSRC.split(STK_A).length === 2, 'control setup: the removal\'s hiding of its stale copy is found once');
  const STX = staleScene(MJb.load('src/jobs.js', anchored(JSRC, STK_A, "      /* MUTANT: the stale copy not hidden */\n      const w = this._writeArchive(", 'archive-stale-shown'), 'archive-stale-shown'), 'stalex');
  ok(STX.inFlight.byId === true, 'CONTROL (not hidden, in a copy): the job just removed shows as an archived row until the take-out lands (red)', STX.inFlight);
  // (14) THE ✕'s THREE NEW REFUSALS REACH THE PANEL AS ITS OWN WORDS: being removed (409), live (409), not durable (503) — each by its
  // code to t() words with zh and ja, never the server's English (jobAction EVALUATED). RED: a mapping cut
  const PANEL = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8');
  const I18N = { zh: fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), ja: fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8') };
  const jobActionOf = (src) => { const at = src.indexOf('\nasync function jobAction('); return at < 0 ? '' : src.slice(at + 1, src.indexOf('\n}\n', at + 1) + 2); };
  const toastsFor = async (src) => {
    const body = jobActionOf(src); if (!body) return null;
    const out = {};
    for (const [code, status] of [['being-removed', 409], ['live', 409], ['not-durable', 503]]) {
      const toasts = [];
      const f = new Function('t', 'fetchJson', 'showToast', 'showConfirmDialog', 'openInteractWindow', 'isCleared', 'clearedText', 'budgetRefusalPersonWords', `${body}; return jobAction;`)(
        (k) => k, async () => ({ error: `the server's own English (${code})`, code, status }), (m) => toasts.push(m), async () => true, () => { }, () => false, () => '', () => '');
      await f({}, { id: 'jb-0000aaaa', name: 'x' }, 'rm', () => { });
      out[code] = toasts[0] || null;
    }
    return out;
  };
  const inLang = (lang, k) => { const at = I18N[lang].indexOf(JSON.stringify(k) + ': "'); if (at < 0) return false; const v = I18N[lang].slice(at + JSON.stringify(k).length + 3, I18N[lang].indexOf('"', at + JSON.stringify(k).length + 3)); return /[぀-ヿ一-鿿]/.test(v); };
  const PW = await toastsFor(PANEL);
  ok(gateOf(PW) && verdictOf(Object.values(PW).every((w) => w && !/the server's own English/.test(w) && inLang('zh', w) && inLang('ja', w))), 'the ✕\'s three new refusals (being removed, live, not durable) reach the panel as its own words, each with zh and ja — never the server\'s English', PW);
  for (const code of ['being-removed', 'live', 'not-durable']) {
    const MAP = `  if (act === 'rm' && r?.error && r.code === '${code}') r.error = t(`;
    ok(PANEL.split(MAP).length === 2, `control setup: the panel's «${code}» words are found once`);
    const PWX = await toastsFor(PANEL.replace(MAP, "  if (false) r.error = t("));
    ok(gateOf(PWX) && verdictOf(/the server's own English/.test(PWX[code] || '')), `CONTROL (the «${code}» mapping cut, in a copy): the panel shows the server's English (red)`, PWX);
  }
  // (15) THE SWEEP's ANSWER ON ITS EARLY RETURNS TOO: nothing due, every due record already handed — answered at once, never left to a
  // caller's bound. RED: the early answer cut
  const earlyScene = (Mod, tag) => {
    const { g, J } = scene(Mod, tag);
    let a1 = null; J.archiveSweep({ now: T0, answer: (x) => { a1 = x; } });                     // nothing due yet
    J._unread.archive = { code: 'EIO', why: 'a stand-in', at: Date.now() };
    let a3 = null; J.archiveSweep({ now: T0 + 25 * H, answer: (x) => { a3 = x; } });             // a refusal: the archive unread
    J._unread.archive = null;
    J.archiveSweep({ now: T0 + 25 * H });                                                        // hands every due record
    let a2 = null; J.archiveSweep({ now: T0 + 25 * H + 1, answer: (x) => { a2 = x; } });          // every due record handed already
    g.landAll(); try { J.shutdown(); } catch { }
    return { a1, a2, a3 };
  };
  const EA = earlyScene({ JobManager }, 'early');
  ok(gateOf(EA.a1) && gateOf(Array.isArray(EA.a1.archived)) && EA.a1.archived.length === 0 && gateOf(EA.a2) && gateOf(Array.isArray(EA.a2.archived)) && EA.a2.archived.length === 0 && gateOf(EA.a3) && EA.a3.failed === 'archive-unread', 'the sweep answers its early returns at once (nothing due; every due record already handed; a refusal) — never left to a caller\'s bound', EA);
  const EA_A = "    const early = (x) => { if (answer) {";
  ok(JSRC.split(EA_A).length === 2, 'control setup: the sweep\'s early answer is found once');
  const EAX = earlyScene(MJb.load('src/jobs.js', anchored(JSRC, EA_A, "    const early = (x) => { if (false) {   /* MUTANT: the early answer cut */", 'archive-early-unanswered'), 'archive-early-unanswered'), 'earlyx');
  ok(EAX.a1 === null && EAX.a2 === null && EAX.a3 === null, 'CONTROL (the early answer cut, in a copy): a sweep that moves nothing never answers — its caller waits out its own bound (red)', EAX);
  // (15b) …and at the stop: a sweep whose archive lands after the engine ended answers «ended» (its records stay the store's). RED: cut
  const sweepEnded = (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag);
    let a = null; J.archiveSweep({ now: T0 + 25 * H, answer: (x) => { a = x; } });
    J.shutdown(); g.land(AF);
    return { a };
  };
  const SE = sweepEnded({ JobManager }, 'sweep-ended');
  ok(gateOf(SE.a) && SE.a.ended === true && SE.a.archived.length === 0, 'a sweep whose archive lands after the engine ended still answers — «ended», nothing released', SE);
  const SE_A = "ended: () => early({ archived: [], ended: true }), ";
  ok(JSRC.split(SE_A).length === 2, 'control setup: the sweep\'s ended answer is found once');
  const SEX = sweepEnded(MJb.load('src/jobs.js', anchored(JSRC, SE_A, "/* MUTANT: the ended answer cut */ ", 'archive-sweep-ended-unanswered'), 'archive-sweep-ended-unanswered'), 'sweependedx');
  ok(SEX.a === null, 'CONTROL (the ended answer cut, in a copy): the sweep\'s caller is never answered (red)', SEX);
  // (16) HOLD ONE, ITS ORDER: the cap's dropped records' log folders go only once the archive that no longer names them landed AND
  // jobs.json's save after it — the remover is asked at THAT landing, never at the archive's. RED: asked at the archive's landing
  const CAP = Number((JSRC.match(/const ARCHIVE_CAP = (\d+)/) || [])[1]) || 2000;
  const capScene = (Mod, tag) => {
    const g = gatedJobsWriter();
    const d = mkDir('jobs-archive-cap-' + tag);
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify(seedDone())); fs.writeFileSync(path.join(d, 'job-notifications.json'), '{}');
    const own = fx.jobs[0];
    fs.writeFileSync(path.join(d, 'jobs-archive.json'), JSON.stringify(Array.from({ length: CAP }, (_, i) => ({ id: 'jb-c' + String(i).padStart(7, '0'), kind: 'task', name: 'old-' + i, state: 'done', owner: own.owner, access: own.access, runs: [{ startedAt: 1000 + i, endedAt: 2000 + i }], archivedAt: 3000 + i, archivedWhy: 'done' }))));   // full: the next sweep's records push the oldest out
    const J = new Mod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: g.W, logsSweep: { bootDelayMs: 3600e3 } });
    J.init(); g.landAll();
    const asked = []; J._logsWhole = (ids) => { asked.push(ids.slice()); return Promise.resolve({ gone: ids }); };   // the remover, asked
    const AF = path.join(d, 'jobs-archive.json'), JF = path.join(d, 'jobs.json');
    let ans = null; J.archiveSweep({ now: T0 + 25 * H, answer: (x) => { ans = x; } });
    g.land(AF);                                                   // the archive lands — jobs.json's save not yet
    const atArchive = { asked: asked.length, dropped: ans ? ans.dropped : null };
    g.land(JF);                                                   // jobs.json's save lands
    const atStore = { asked: asked.flat().length };
    try { J.shutdown(); } catch { }
    return { atArchive, atStore };
  };
  const CP = capScene({ JobManager }, 'cap');
  ok(CP.atArchive.dropped > 0 && CP.atArchive.asked === 0 && CP.atStore.asked === CP.atArchive.dropped, `the cap's ${CP.atArchive.dropped} dropped records' log folders are handed to the remover only once jobs.json's save landed after the archive — none at the archive's landing`, CP);
  const CAP_A = "this._ride(this.file, 'the archive cap\\'s dropped records', () => this._logsWhole(ids));";
  ok(JSRC.split(CAP_A).length === 2, 'control setup: the dropped folders riding jobs.json\'s landing are found once');
  const CPX = capScene(MJb.load('src/jobs.js', anchored(JSRC, CAP_A, "this._logsWhole(ids);   /* MUTANT: at the archive's landing */", 'archive-cap-early'), 'archive-cap-early'), 'capx');
  ok(CPX.atArchive.asked === 1, 'CONTROL (asked at the archive\'s landing, in a copy): the folders go while jobs.json still lists their records — a crash then leaves records without their logs (red)', CPX.atArchive);
  // (17) HOLD TWO: the hub's stop with an archive HANDED and not landed (the REAL store writer, the stop's own order) — the exit's rank-0
  // pass lands it whole with its step inside (the records' release), jobs.json's save goes in the last pass: after the stop each record is
  // in ONE file. RED: the release on a later turn — after the stop the records are in both
  const stopScene = (Mod, tag) => {
    const d = mkDir('jobs-archive-stop-' + tag);
    fs.writeFileSync(path.join(d, 'jobs.json'), JSON.stringify(seedDone())); fs.writeFileSync(path.join(d, 'job-notifications.json'), '{}');
    const w = SWr.create({ log: { warn() { }, log() { }, error() { } }, graceMs: 5000 });
    const J = new Mod.JobManager({ dataDir: d, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: () => { }, archivePolicy: () => policy, writer: w, logsSweep: { bootDelayMs: 3600e3 } });
    J.init(); w.flushSync();
    const h = J.archiveSweep({ now: T0 + 25 * H }); const ids = h.handed || [];
    // server.js's stop, in one synchronous run: beginExit, the rank-0 flush, the engines' shutdown, the last exit flush
    w.beginExit(); w.exitFlush({ only: 'rank0' }); try { J.shutdown(); } catch { } w.exitFlush();
    const list = (f) => { try { const v = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); return Array.isArray(v) ? v : (v && v.jobs) || []; } catch { return null; } };
    const A = list('jobs-archive.json'), S = list('jobs.json');
    try { w.stop(); } catch { }
    return { handed: ids.length, inArch: A ? ids.filter((id) => A.some((r) => r.id === id)).length : null, inStore: S ? ids.filter((id) => S.some((r) => r.id === id)).length : null };
  };
  const SP = stopScene({ JobManager }, 'stop');
  ok(SP.handed > 0 && SP.inArch === SP.handed && SP.inStore === 0, `the hub's stop with an archive handed and not landed: the exit lands it whole, its records released inside it and jobs.json saved after — each of the ${SP.handed} in ONE file`, SP);
  const SPX = stopScene(MJb.load('src/jobs.js', anchored(JSRC, NOW_A, "    this._ride(this.archiveFile, 'the archive', () => { setImmediate(step); }, { timeoutMs: replyMs, answer: reply });   // MUTANT: the release on a later turn\n", 'archive-release-later'), 'archive-release-later'), 'stopx');
  ok(SPX.inArch === SPX.handed && SPX.inStore === SPX.handed, 'CONTROL (the release on a later turn, in a copy): the stop lands the archive but its records are never released — in BOTH files after it (red)', SPX);
  // (18) THE CLEAR DOOR WAITS FOR ITS OWN ARCHIVE WRITE: «Clear content…» of an archived job through record-clear — no answer while the
  // archive holding the clear is not on disk (jobs.json and the notices landed), answered at its landing. RED: the archive's sequence not
  // passed (record-clear, in a copy) — answered «cleared» before the words left the disk
  const RCSRC = fs.readFileSync(path.join(ROOT, 'src/server/record-clear.js'), 'utf8');
  const doorScene = async (RCmod, tag) => {
    const { g, J, d, AF } = scene({ JobManager }, tag);
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll(); g.landAll();
    const id = J.archivedList()[0].id;
    const RCs = RCmod.create({ getJobs: () => J, log: () => { } });
    let ans = null; RCs.clearMany([{ kind: 'job', id }], { caller: { role: 'owner' }, answer: (r) => { ans = r; } });
    const JF = path.join(d, 'jobs.json'), NF = path.join(d, 'job-notifications.json');
    // r4362: the clear's own awaits end when it ASKS its writes' durability (a wait on jobs.json and the notices: the fact), never 20 turns
    await factOf(() => g.waitersOf(JF) >= 1 && g.waitersOf(NF) >= 1, `${tag}: the clear asked its writes' durability`);
    g.land(JF); g.land(NF);
    // then: the two durability answers ran INSIDE land() and the clear's answer to them is in memory — drained, never 5 turns; a clear
    // that waits for its archive has asked the archive's durability too (said beside the verdict: waitsOnArchive)
    await drained();
    const beforeArchive = ans, waitsOnArchive = g.waitersOf(AF);
    g.land(AF);
    if (beforeArchive === null) await factOf(() => ans !== null, `${tag}: the clear answered at the archive's landing`);
    try { J.shutdown(); } catch { }
    return { beforeArchive, waitsOnArchive, atLanding: ans && { ok: ans.ok, cleared: ans.cleared, notOnDisk: !!ans.notOnDisk } };
  };
  const DR = await doorScene(require(path.join(ROOT, 'src/server/record-clear.js')), 'door');
  ok(DR.beforeArchive === null && gateOf(DR.atLanding) && gateOf(DR.atLanding.ok) && DR.atLanding.cleared === 1 && !DR.atLanding.notOnDisk, 'a person\'s «Clear content…» of an ARCHIVED job is answered only once the archive holding the clear landed — not when jobs.json and the notices did', DR);
  const DOOR_A = "name === 'jobs' && touched.archiveSeq ? { archiveSeq: touched.archiveSeq } : undefined";
  ok(RCSRC.split(DOOR_A).length === 2, 'control setup: record-clear passing the archive\'s sequence is found once');
  const DRX = await doorScene(MJb.load('src/server/record-clear.js', anchored(RCSRC, DOOR_A, "undefined /* MUTANT: the archive's sequence not passed */", 'record-clear-no-archive-seq'), 'record-clear-no-archive-seq'), 'doorx');
  ok(DRX.beforeArchive !== null, 'CONTROL (the archive\'s sequence not passed, in a copy of record-clear): «cleared» is answered while the archive on disk still holds the words (red)', DRX);
  // (19) THE ✕ PAST THE LANDING's BOUND: through the route, 503 «not-durable» at its bound while the archive is not on disk; a repeat
  // meanwhile 409 «being-removed»; and the removal still lands by itself (the row gone, the pages told). RED: the bound cut (in a copy)
  const routeScene = async (mod, tag) => {
    const bd = mkDir('jobs-archive-bound-' + tag), own = fx.jobs[0];
    const arc = { id: 'jb-b0d0e001', kind: 'task', name: 'bound-one', state: 'done', owner: own.owner, access: own.access, runs: [{ startedAt: T0 - 3 * H, endedAt: T0 - 2 * H }], archivedAt: T0 - H, archivedWhy: 'done' };
    fs.writeFileSync(path.join(bd, 'jobs.json'), '[]'); fs.writeFileSync(path.join(bd, 'job-notifications.json'), '{}'); fs.writeFileSync(path.join(bd, 'jobs-archive.json'), JSON.stringify([arc]));
    const broadcasts = []; const B = boot(bd, { broadcasts, mod });
    const g = gatedJobsWriter(); B.jm.d.writer = g.W; B.jm.d.rmReplyMs = 60;
    const r1 = await B.call('POST', '/api/jobs/:id/:act', { params: { id: arc.id, act: 'rm' } });
    const r2 = await B.call('POST', '/api/jobs/:id/:act', { params: { id: arc.id, act: 'rm' } });
    const listedMeanwhile = !!B.jm.archivedById(arc.id);
    g.land(path.join(bd, 'jobs-archive.json'));
    const gone = !B.jm.archivedById(arc.id), told = broadcasts.some((m) => JSON.stringify(m).includes(arc.id) && /removed/.test(JSON.stringify(m)));
    try { B.jm.shutdown(); } catch { }
    return { r1: { status: r1.status, code: r1.body && r1.body.code }, r2: { status: r2.status, code: r2.body && r2.body.code }, listedMeanwhile, gone, told };
  };
  const RO = await routeScene(wiring, 'route');
  ok(RO.r1.status === 503 && RO.r1.code === 'not-durable' && RO.r2.status === 409 && RO.r2.code === 'being-removed' && gateOf(RO.listedMeanwhile) && gateOf(RO.gone) && verdictOf(RO.told), 'the ✕ past its landing\'s bound, through the route: 503 «not-durable» while the archive is not on disk, a repeat 409 «being-removed», and the removal still lands by itself — the row gone, the pages told', RO);
  const WSRC19 = fs.readFileSync(path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8');
  const RO_A = "const r = jm.rmArchived(rec.id, (x) => { if (x.error) return res.status(x.notDurable ? 503 : 400).json({ error: x.error, ...(x.notDurable ? { code: 'not-durable' } : {}) });";
  ok(WSRC19.split(RO_A).length === 2, 'control setup: the route\'s «not durable» answer is found once');
  const ROX = await routeScene(MJb.load('src/server/jobs-wiring.js', anchored(WSRC19, RO_A, "const r = jm.rmArchived(rec.id, (x) => { if (x.error) return res.status(400).json({ error: x.error });   /* MUTANT: the route's not-durable cut */", 'wiring-not-durable-cut'), 'wiring-not-durable-cut'), 'routex');
  ok(ROX.r1.status === 400 && !ROX.r1.code, 'CONTROL (the route\'s «not durable» cut, in a copy of the wiring): the person reads a plain failure for a removal that still lands (red)', ROX.r1);
  const boundScene = async (Mod, tag) => {
    const { g, J, AF } = scene(Mod, tag); J.d.rmReplyMs = 60;
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll(); g.landAll();
    const id = J.archivedList()[0].id; let ans = null;
    const bounds0 = g.boundsOf(AF);   // r4362: the reply bounds armed before this ✕ (the scene's own sweeps)
    J.rmArchived(id, (x) => { ans = x; });
    // r3796 (B-7e49): the bound's OWN TURN is the fact — a timer of the bound's length set after the ✕ fires after the bound's timer (Node
    // runs timers of one length in the order they were set), then the answer's own turns: the answer is there (r2255 (4)), or a copy
    // with no bound has given none — read at the bound, never at a 1 s clock
    await new Promise((r) => setTimeout(r, J.d.rmReplyMs));
    await factOf(() => ans !== null || g.boundsOf(AF) === bounds0, `${tag}: the ✕'s answer at its bound (its bound armed answers; none armed for it, none can)`);   // r4362: the fact, never 10 turns
    const atBound = ans;
    let later = null; J.logsGone(id, 60e3).then((x) => { later = x; });   // r1963: a later ask, the write still not landed
    await drained();   // answered AT ONCE from memory (logsGone's map), or it waits with the write — r4362: every microtask run, never «10 turns»
    const laterAtOnce = later;
    g.land(AF); try { J.shutdown(); } catch { }
    return { atBound, later: laterAtOnce };
  };
  const BD_A = "{ onLanded: () => atLanding(this._rmLanded(id)), replyMs, ended,";
  ok(JSRC.split(BD_A).length === 2, 'control setup: the ✕\'s reply bound is found once');
  const BD = await boundScene({ JobManager }, 'bound');
  ok(gateOf(BD.atBound) && BD.atBound.notDurable === true && gateOf(BD.later) && BD.later.pending === true, 'the ✕\'s reply comes at its bound while the archive is not on disk — «not durable», never a wait for ever; and a later logsGone() for it says «pending» at once (r1963)', BD);
  const BDP_A = "if (!r.ok && this._logsGone.get(id) === handed) this._logsGone.set(id, Promise.resolve({ pending: true })); ";
  ok(JSRC.split(BDP_A).length === 2, 'control setup: the ✕\'s bound turning logsGone «pending» is found once');
  const BDP = await boundScene(MJb.load('src/jobs.js', anchored(JSRC, BDP_A, "/* MUTANT: logsGone waits with the write */ ", 'archive-gone-waits'), 'archive-gone-waits'), 'gonewaitsx');
  ok(BDP.later === null, 'CONTROL (the bound\'s «pending» cut, in a copy): a later logsGone() waits with a write that has not landed — no answer (red)', BDP);
  const BDX = await boundScene(MJb.load('src/jobs.js', anchored(JSRC, BD_A, "{ onLanded: () => atLanding(this._rmLanded(id)), replyMs: null /* MUTANT: no bound */, ended,", 'archive-rm-unbounded'), 'archive-rm-unbounded'), 'boundx');
  ok(BDX.atBound === null, 'CONTROL (the bound cut, in a copy): the person\'s ✕ is not answered while the storage holds the write (red)', BDX);
  // (20) A ✕ WHOSE REMOVAL LANDS AFTER THE ENGINE ENDED (the round's lens 1): its log folder is left to the clean-up's own pass — SAID,
  // and logsGone answers «still being deleted». RED: unsaid
  const endedScene = async (Mod, tag) => {
    const { g, J, AF, logs } = scene(Mod, tag);
    J.archiveSweep({ now: T0 + 25 * H }); g.landAll(); g.landAll();
    const id = J.archivedList()[0].id;
    J.rmArchived(id, () => { }); J.shutdown(); g.land(AF);
    await drained();   // r2001: asked LATE, after every promise of the landing settled (the landing's steps ran in land(); r4362: drained, never «20 turns»)
    let lg = null; J.logsGone(id, 60e3).then((x) => { lg = x; });
    await drained();   // answered at once from memory, never a wait (r4362: drained, never «10 turns»)
    return { said: logs.filter((l) => l.includes(id) && /its removal landed after the jobs engine ended/.test(l)).length, logsGone: lg };
  };
  const EN = await endedScene({ JobManager }, 'ended');
  ok(EN.said === 1 && gateOf(EN.logsGone) && EN.logsGone.pending === true, 'a ✕ whose removal lands after the engine ended is SAID once — its log folder left to the clean-up\'s own pass — and logsGone answers «still being deleted» at once', EN);
  const END_A = "replyMs, ended, answer:";
  ok(JSRC.split(END_A).length === 2, 'control setup: the ✕\'s ended words are found once');
  const ENX = await endedScene(MJb.load('src/jobs.js', anchored(JSRC, END_A, "replyMs, /* MUTANT: unsaid */ answer:", 'archive-ended-unsaid'), 'archive-ended-unsaid'), 'endedx');
  ok(ENX.said === 0, 'CONTROL (unsaid, in a copy): the folder is left with no word (red)', ENX);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
