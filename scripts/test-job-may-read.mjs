#!/usr/bin/env node
// test-job-may-read — B-3992: A JOB READS ITS SIBLING JOBS ONLY BY OPT-IN AT CREATE (the owner's ruling of 2026-11-01, option C;
// fb-be61906274 + fb-1253de8d82 on userW's instance). A job's jbt_ token acted on ITSELF only, and inside a job a poll of another
// job answered «no job … visible to this session», which misled. `vibespace-job run … --may-read JOB,JOB` (or `siblings`) writes
// a grant on the new job's record: READ ONLY (poll / list / logs), NEVER another conversation's jobs; without it nothing changes.
// Fast, in-process:
//   §1 THE JOB'S OWN VERDICT (PURE src/job-model.js): jobMayRead / jobTokenVerdict per verb / mayReadVerdict at create, with
//      the refusal's words — and a RED copy without the owner check (another conversation's job becomes readable)
//   §2 THE CREATE (the real JobManager, spawn stubbed): the grant on the record, refusals by name (nothing created), a notify
//      cron, a scheduled job's run — and a RED copy that resolves against EVERY job (the read-time verdict still refuses)
//   §3 THE ROUTES PER VERB (the real agent routes, a real jbt_ token): list / poll / show / logs answer itself and its grant;
//      stop / start / restart / rm / progress / announce / subscribe on a granted job refused READ ONLY; any other ref refused
//      with the recipe — the same words for another conversation's job and for none; the agent's own path unchanged — and
//      RED copies of the routes (the POST verdict cut: a granted job is STOPPED; the GET refusal cut: the misleading words)
//   §4 THE CLI (the real vibespace-job over a loopback bridge): --may-read rides the body; a notify cron refuses it before
//      anything is sent; inside a job: the refusal with the recipe, the grant's mark in list / show, the grant line, a stop
//   §5 the manual (vibespace-docs jobs §9) and the usage say it
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch, anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require('../src/job-model.js');
const { JobManager } = require('../src/jobs.js');
const AR = require('../src/agent-routes.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const CLI = path.join(REPO, 'data/bin/vibespace-job');
const { ok, report } = checker();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const TMP = scratch('job-may-read');
fs.mkdirSync(TMP, { recursive: true });
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const hush = (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// two conversations in one Task Group: A owns the jobs that read, B owns a job whose view AND control are open to all
const G = 'T-may-read-g';
const CID = { A: 'c0ffee00-0000-4000-8000-000000003a01', B: 'c0ffee00-0000-4000-8000-000000003b02' };
const caller = (k) => ({ conversationId: CID[k], sessionId: 's-' + k, sessionCreatedAt: 1, groups: new Set([G]) });
const ownerOf = (k) => ({ conversation: { id: CID[k] }, sessionId: 's-' + k, sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [G] });
const RECIPE = 'vibespace-job run "CMD" --name NAME --may-read <job>,<job> (or --may-read siblings: every job of the conversation that creates it)';
const SELF_WORDS = 'a job token may only report progress, ask (or withdraw its ask), or announce';   // the words of before (B-8bd5), now answered by src/job-model.js JOB_SELF_ACTS_WORDS — compared on the answers (stale-pins: kept)
const noRef = (s, ref) => String(s).split(JSON.stringify(ref)).join('"REF"');   // a refusal with its ref taken out (a test-side string, no product text)

// ════════ §1 THE JOB'S OWN VERDICT ════════
console.log('§1 the job\'s own verdict (PURE src/job-model.js)');
const rec = (id, k, extra = {}) => ({ id, name: 'n-' + id, kind: 'task', state: 'up', owner: k ? ownerOf(k) : {}, access: { view: 'all', control: 'all' }, ...extra });
function world() {
  const A1 = rec('jb-a1', 'A'), A2 = rec('jb-a2', 'A'), B1 = rec('jb-b1', 'B');
  const none = rec('jb-r0', 'A'), ids = rec('jb-r1', 'A', { mayRead: { ids: ['jb-a1', 'jb-b1'] } }), sib = rec('jb-r2', 'A', { mayRead: { siblings: true } });
  const tuple = rec('jb-t0', null, { owner: { conversation: null, sessionId: 's-L', sessionCreatedAt: 7 }, mayRead: { siblings: true } });
  const tupleMate = rec('jb-t1', null, { owner: { conversation: null, sessionId: 's-L', sessionCreatedAt: 7 } });
  const tupleReused = rec('jb-t2', null, { owner: { conversation: null, sessionId: 's-L', sessionCreatedAt: 8 } });
  const nobody = rec('jb-x0', null, { owner: {}, mayRead: { siblings: true } });
  return { A1, A2, B1, none, ids, sib, tuple, tupleMate, tupleReused, nobody, all: [A1, A2, B1, none, ids, sib] };
}
function verdictRows(X) {
  const w = world();
  const sibList = X.jobsReadableBy(w.all, w.sib).map((j) => j.id);
  return [
    ['itself, without a grant', X.jobMayRead(w.none, w.none) === true],
    ['no grant: a job of its own conversation is NOT read (no default changes)', X.jobMayRead(w.none, w.A1) === false],
    ['an ids grant: a job it was given', X.jobMayRead(w.ids, w.A1) === true],
    ['an ids grant: a job of its conversation it was not given', X.jobMayRead(w.ids, w.A2) === false],
    ['an ids grant naming ANOTHER conversation\'s job (a record written by hand) — never read', X.jobMayRead(w.ids, w.B1) === false],
    ['siblings: every job of its own conversation', X.jobMayRead(w.sib, w.A1) === true && X.jobMayRead(w.sib, w.A2) === true && X.jobMayRead(w.sib, w.ids) === true],
    ['siblings: ANOTHER conversation\'s job (its view and control open to all) — never read', X.jobMayRead(w.sib, w.B1) === false],
    ['a lineage-less job (the session tuple): its own session\'s job', X.jobMayRead(w.tuple, w.tupleMate) === true],
    ['a lineage-less job: a REUSED session id (another creation time) is no sibling', X.jobMayRead(w.tuple, w.tupleReused) === false],
    ['a job with no owner at all is nobody\'s sibling', X.jobMayRead(w.nobody, w.A1) === false],
    ['jobsReadableBy (ids): itself first, then its grant — never another conversation\'s job it names', same(X.jobsReadableBy(w.all, w.ids).map((j) => j.id), ['jb-r1', 'jb-a1']), X.jobsReadableBy(w.all, w.ids).map((j) => j.id)],
    ['jobsReadableBy (siblings): itself and its conversation\'s four, none of another', same(sibList, ['jb-r2', 'jb-a1', 'jb-a2', 'jb-r0', 'jb-r1']), sibList],
    ['jobReadableRef: a granted job by its NAME', X.jobReadableRef(w.all, w.ids, 'n-jb-a1') === w.A1],
    ['jobReadableRef: another conversation\'s id answers null (the route then says the words it says for no job)', X.jobReadableRef(w.all, w.sib, 'jb-b1') === null],
  ];
}
// the rows the owner check alone holds — a copy without it turns exactly these red (§1d)
const NOT_OWNER_ROWS = ['an ids grant naming ANOTHER conversation\'s job (a record written by hand) — never read', 'siblings: ANOTHER conversation\'s job (its view and control open to all) — never read',
  'a lineage-less job: a REUSED session id (another creation time) is no sibling', 'a job with no owner at all is nobody\'s sibling',
  'jobsReadableBy (ids): itself first, then its grant — never another conversation\'s job it names', 'jobsReadableBy (siblings): itself and its conversation\'s four, none of another',
  'jobReadableRef: another conversation\'s id answers null (the route then says the words it says for no job)'];
for (const [n, c, facts] of verdictRows(M)) ok(c, n, facts);

console.log('§1b per verb, for a job token (jobTokenVerdict) — the refusal\'s words');
{
  const w = world();
  for (const v of M.JOB_READ_VERBS) { const r = M.jobTokenVerdict(w.ids, w.A1, v, 'n-jb-a1'); ok(r.ok === true && r.granted === true, `${v} of a granted job answers (granted)`, r); }
  for (const v of ['stop', 'start', 'restart', 'rm', 'progress', 'announce', 'subscribe', 'ask', 'withdraw']) {
    const r = M.jobTokenVerdict(w.ids, w.A1, v, 'jb-a1');
    ok(r.ok === false && r.status === 403 && r.code === 'job-read-only' && r.error === `"jb-a1" is READ ONLY for this job (given at create with --may-read): it may poll, list and read the logs of it — ${v} on another job stays its owner conversation's (stop, start, restart and rm are never a job's on another job)`,
      `${v} of a granted job: refused READ ONLY, by name (403 job-read-only)`, r);
  }
  for (const v of M.JOB_SELF_ACTS) { const r = M.jobTokenVerdict(w.ids, w.ids, v, 'jb-r1'); ok(r.ok === true && r.self === true, `${v} on itself answers (as before)`, r); }
  for (const v of ['stop', 'start', 'restart', 'rm', 'subscribe']) { const r = M.jobTokenVerdict(w.ids, w.ids, v, 'jb-r1'); ok(r.ok === false && r.status === 403 && r.code === 'job-token-self' && r.error === SELF_WORDS, `${v} on itself: refused in the words of before («${SELF_WORDS}»)`, r); }
  const r0 = M.jobTokenVerdict(w.none, null, 'poll', 'jb-a1');
  ok(r0.ok === false && r0.status === 404 && r0.code === 'job-reads-itself' && r0.error === `"jb-a1": this job may read only itself — give it the other jobs at create: ${RECIPE}. Read only: poll, list and logs; stop, start and rm stay its conversation's`,
    'no grant: a poll of another job is refused BY NAME with the recipe (404 job-reads-itself) — «this job may read only itself — give it the other jobs at create»', r0);
  const rIds = M.jobTokenVerdict(w.ids, null, 'poll', 'jb-a2');
  ok(rIds.code === 'job-reads-itself' && rIds.error === `"jb-a2": this job may read only itself and the jobs it was given at create (jb-a1, jb-b1) — "jb-a2" is none of them; to read another, give it at create: ${RECIPE}`, 'an ids grant: the refusal names what it was given', rIds);
  const rB = M.jobTokenVerdict(w.sib, M.jobReadableRef(w.all, w.sib, 'jb-b1'), 'poll', 'jb-b1'), rN = M.jobTokenVerdict(w.sib, M.jobReadableRef(w.all, w.sib, 'jb-zz'), 'poll', 'jb-zz');
  ok(rB.status === 404 && rN.status === 404 && noRef(rB.error, 'jb-b1') === noRef(rN.error, 'jb-zz') && /another conversation's jobs are never readable$/.test(rB.error), 'siblings: another conversation\'s job and no job at all get the SAME words (no existence oracle)', { rB, rN });
  const sB = M.jobTokenVerdict(w.sib, M.jobReadableRef(w.all, w.sib, 'jb-b1'), 'stop', 'jb-b1');
  ok(sB.status === 404 && sB.code === 'job-reads-itself' && noRef(sB.error, 'jb-b1') === noRef(rN.error, 'jb-zz'), 'a STOP of another conversation\'s job: the same words as a poll of none — never «read only» (that would say it exists)', sB);
}

console.log('§1c at create (mayReadVerdict) — resolved against the creating conversation\'s OWN jobs');
{
  const w = world(), own = [w.A1, w.A2];
  const cases = [
    ['no word: no grant (reads only itself, as before)', undefined, (r) => r.ok === true && r.grant === null],
    ['siblings', 'siblings', (r) => r.ok === true && same(r.grant, { siblings: true })],
    ['a name and an id, spaces around', ' n-jb-a1 , jb-a2 ', (r) => r.ok === true && same(r.grant, { ids: ['jb-a1', 'jb-a2'] })],
    ['the same job twice (a name and its id) is one', ['jb-a1', 'n-jb-a1'], (r) => r.ok === true && same(r.grant, { ids: ['jb-a1'] })],
    ['another conversation\'s job is refused by name, nothing created', 'jb-b1', (r) => r.ok === false && r.error === '--may-read: "jb-b1" is no job of this conversation (vibespace-job list --mine names them) — a job may be given only its own conversation\'s jobs, never another\'s; nothing was created'],
    ['siblings beside a name', 'siblings,jb-a1', (r) => r.ok === false && /give it alone; nothing was created$/.test(r.error)],
    ['an empty value', ' , ', (r) => r.ok === false && r.error === `--may-read needs the jobs this job may read: ${RECIPE} — nothing was created`],
    [`more than ${M.MAY_READ_MAX} jobs`, Array.from({ length: 33 }, (_, i) => 'j' + i).join(','), (r) => r.ok === false && /names 33 jobs — at most 32/.test(r.error)],
    ['a value of another type', 5, (r) => r.ok === false && /takes job ids or names, comma-separated/.test(r.error)],
  ];
  for (const [n, raw, want] of cases) { const r = M.mayReadVerdict(raw, own); ok(want(r) === true, n, r); }
  const foreign = M.mayReadVerdict('jb-b1', own), none = M.mayReadVerdict('jb-zz', own);
  ok(noRef(foreign.error, 'jb-b1') === noRef(none.error, 'jb-zz'), 'another conversation\'s job and no job at all: the same words at create (no existence oracle)', { foreign, none });
  const nc = M.mayReadVerdict('siblings', own, { runsCommand: false });
  ok(nc.ok === false && nc.error === '--may-read is for a job that runs a command — a notify cron runs none; nothing was created', 'a notify cron: refused (it runs no command that could read)', nc);
}

console.log('§1d RED: a copy of src/job-model.js whose jobMayRead skips the owner check');
const MJ = mutantCopies('job-may-read', REPO);
{
  const MSRC = read('src/job-model.js');
  const X = MJ.load('src/job-model.js', anchored(MSRC, '  if (!g || !sameOwner(self, target)) return false;\n', '  if (!g) return false;   /* MUTANT: no owner check */\n', 'jobMayRead\'s owner check'), 'no-owner-check');
  const red = verdictRows(X).filter(([, c]) => !c).map(([n]) => n);
  ok(same(red.sort(), [...NOT_OWNER_ROWS].sort()), `CONTROL (no owner check, in a copy): exactly the ${NOT_OWNER_ROWS.length} rows the owner check holds go red (${red.length})`, red);
}

// ════════ the engine and the routes (§2–§4 share them) ════════
const CWD = path.join(TMP, 'work'); fs.mkdirSync(CWD, { recursive: true });
function engine(name, JM = JobManager) {
  const dir = path.join(TMP, name); fs.mkdirSync(dir, { recursive: true });
  const jm = new JM({ dataDir: dir, broadcast() { }, log() { }, notifyUser() { return { ok: true }; }, deliverToConversation: async () => ({ ok: true, lane: 'message', peerName: 'x' }),
    groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
  hush(() => jm.init()); for (const t of jm._timers || []) clearInterval(t);
  jm._spawn = (job, trigger) => { job.runs = job.runs || []; job.runs.push({ startedAt: Date.now(), trigger }); job.state = 'up'; };
  return jm;
}
const mkIn = (jm, k, spec) => jm.create({ kind: 'task', cmd: { argv: ['sh', '-c', 'true'], cwd: CWD }, owner: ownerOf(k), access: { view: 'all', control: 'all' }, ...spec }, caller(k));
const must = (r) => { if (!r || !r.job) throw new Error('setup create: ' + JSON.stringify(r)); return r.job; };

console.log('§2 the create (the real JobManager) — the grant on the record');
const jm = engine('jobs');
const a1 = must(mkIn(jm, 'A', { name: 'api-server' })), a2 = must(mkIn(jm, 'A', { name: 'nightly-build' })), b1 = must(mkIn(jm, 'B', { name: 'b-private' }));
const watcher = must(mkIn(jm, 'A', { name: 'watcher', mayRead: 'api-server,' + a2.id }));
const loner = must(mkIn(jm, 'A', { name: 'loner' }));
const reporter = must(mkIn(jm, 'A', { name: 'report', mayRead: 'siblings' }));
{
  ok(same(jm.jobs.get(watcher.id).mayRead, { ids: [a1.id, a2.id] }) && same(watcher.mayRead, { ids: [a1.id, a2.id] }), `the grant is on the record and in the create's answer (ids: a name and an id → ${a1.id}, ${a2.id})`, jm.jobs.get(watcher.id).mayRead);
  ok(same(jm.jobs.get(reporter.id).mayRead, { siblings: true }), 'siblings is stored as itself (judged at every read)', jm.jobs.get(reporter.id).mayRead);
  ok(!('mayRead' in jm.jobs.get(loner.id)) && loner.mayRead === null, 'no word: the record carries no grant, the snapshot says null (reads only itself)', loner);
  const n0 = jm.jobs.size;
  const rB = mkIn(jm, 'A', { name: 'peek', mayRead: b1.id }), rN = mkIn(jm, 'A', { name: 'peek2', mayRead: 'jb-00000000' });
  ok(!rB.job && rB.code === 'may-read' && rB.error === `--may-read: "${b1.id}" is no job of this conversation (vibespace-job list --mine names them) — a job may be given only its own conversation's jobs, never another's; nothing was created` && jm.jobs.size === n0,
    'another conversation\'s job (view and control open to all) is refused at create, by name — nothing was created', rB);
  ok(!rN.job && noRef(rN.error, 'jb-00000000') === noRef(rB.error, b1.id), '…in the same words as an id of no job (no existence oracle)', rN);
  const rX = mkIn(jm, 'B', { name: 'peek3', mayRead: 'api-server' });
  ok(!rX.job && /^--may-read: "api-server" is no job of this conversation/.test(rX.error || ''), 'B naming A\'s job by its NAME: refused (resolved against B\'s own jobs only)', rX);
  const nc = jm.create({ kind: 'cron', name: 'nc', schedule: { everyMs: 3600e3 }, action: { type: 'notify', text: 'hi' }, owner: ownerOf('A'), access: { view: 'all', control: 'all' }, mayRead: 'siblings' }, caller('A'));
  ok(!nc.job && nc.error === '--may-read is for a job that runs a command — a notify cron runs none; nothing was created', 'a notify cron with --may-read: refused by the engine too', nc);
  const cron = must(jm.create({ kind: 'cron', name: 'hourly', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['sh', '-c', 'true'], cwd: CWD } } }, owner: ownerOf('A'), access: { view: 'all', control: 'all' }, mayRead: 'siblings' }, caller('A')));
  hush(() => jm._fireCron(jm.jobs.get(cron.id), 'cron'));
  const child = [...jm.jobs.values()].find((j) => j.cronParent === cron.id);
  ok(!!child && same(child.mayRead, { siblings: true }) && M.jobMayRead(child, jm.jobs.get(a1.id)) === true && M.jobMayRead(child, jm.jobs.get(b1.id)) === false, 'a scheduled job: each fire hands its run the cron\'s grant — the run reads A\'s jobs, never B\'s', child && child.mayRead);
}
console.log('§2b RED: a copy of src/jobs.js whose create resolves the names against EVERY job');
{
  const JSRC = read('src/jobs.js');
  const JX = MJ.load('src/jobs.js', anchored(JSRC, '[...this.jobs.values()].filter((j) => M.isOwner(j, M.ownerAsCaller({ owner: spec.owner })))', '[...this.jobs.values()] /* MUTANT: every job */', 'the create\'s own-jobs filter'), 'every-job');
  const jx = engine('jobs-mut', JX.JobManager);
  const xb = must(mkIn(jx, 'B', { name: 'b-private' })), xr = mkIn(jx, 'A', { name: 'peek', mayRead: xb.id });
  ok(!!xr.job && same(jx.jobs.get(xr.job.id).mayRead, { ids: [xb.id] }), 'CONTROL (every job, in a copy): another conversation\'s job IS written into the grant — the filter is what refuses it at create', xr);
  ok(M.jobMayRead(jx.jobs.get(xr.job.id), jx.jobs.get(xb.id)) === false, '…and the job still cannot read it: the read-time verdict judges the owner again (two doors, one predicate)');
}

// the routes over the engine — the real setupAgentRoutes (its deps as test-jobs-addressed's), answered in-process
const tasks = new TaskGroupManager({ dataDir: path.join(TMP, 'tg'), onChange: () => { } });
hush(() => tasks.create({ title: 'May-read lanes', objective: 'two conversations, one group', folders: [CWD] }));
const activeSessions = new Map();
for (const k of ['A', 'B']) activeSessions.set(k, { claudeSessionId: CID[k], backend: 'claude', name: k, mode: 'chat', cwd: CWD, agentToken: `vsst_${k}`, sockName: `sock-${k}`, clients: new Map(), createdAt: 1 });
const metaM = new Map();
const DEPS = {
  activeSessions, tasks,
  sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], dropNotices: () => { }, rekey: () => { }, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
  SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
  userTodos: { rekey: () => { }, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
  sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, integrationEnabled: () => true,
  scheduleCtxSync: () => { }, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => jm, getGroups: () => null,
  getSessionMetaStore: () => ({ readSessionMeta: (k) => metaM.get(k) || null, writeSessionMeta: (k, v) => metaM.set(k, v) }),
};
function mount(ARmod) {
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; }, put() { }, patch() { }, delete() { }, use() { } };
  hush(() => ARmod.setupAgentRoutes({ app, ...DEPS }));
  return (key, { token, params = {}, query = {}, body = {} }) => new Promise((resolve) => {
    let code = 200, done = false;
    const res = { status(c) { code = c; return res; }, json(o) { if (!done) { done = true; resolve({ code, body: o }); } return res; }, setHeader() { }, headersSent: false };
    Promise.resolve(hush(() => routes[key]({ headers: { authorization: 'Bearer ' + token }, params, query, body }, res))).catch((e) => { if (!done) { done = true; resolve({ code: 500, body: { error: e.message } }); } });
  });
}
const call = mount(AR);
const tok = (j) => jm._jobToken(jm.jobs.get(j.id));
const T = { watcher: tok(watcher), loner: tok(loner), reporter: tok(reporter) };
// the control verbs a job token must never reach on another job: counted, never run (the self acts stay the engine's own)
const CTL = ['stop', 'start', 'restart', 'rm', 'announce', 'subscribe', 'unsubscribe', 'ask', 'withdrawAsk'];
const reached = [];
for (const f of CTL) { const real = jm[f].bind(jm); jm[f] = (job, ...rest) => { reached.push(`${f}:${job.id}`); return job.id === watcher.id ? real(job, ...rest) : { ok: true }; }; }

console.log('§3 the routes per verb, with the job\'s own token');
const listIds = (r) => ((r.body && r.body.jobs) || []).map((j) => j.id);
{
  const lw = await call('GET /api/agent/jobs', { token: T.watcher });
  const rows = lw.body.jobs || [], self = rows.find((j) => j.id === watcher.id), g = rows.filter((j) => j.id !== watcher.id);
  ok(lw.code === 200 && same(listIds(lw), [watcher.id, a1.id, a2.id]), `list: itself and the two jobs it was given — nothing else (${listIds(lw).length})`, listIds(lw));
  ok(!!self && self.mine === true && !self.readByGrant && g.every((j) => j.mine === null && j.readByGrant === true), 'list: itself «mine» as before; a granted job neither «mine» nor «another conversation\'s» — readByGrant', rows.map((j) => ({ id: j.id, mine: j.mine, readByGrant: j.readByGrant })));
  const ll = await call('GET /api/agent/jobs', { token: T.loner });
  ok(same(listIds(ll), [loner.id]), 'list without a grant: itself alone (no default changes)', listIds(ll));
  const lr = await call('GET /api/agent/jobs', { token: T.reporter });
  const aIds = [...jm.jobs.values()].filter((j) => j.owner && j.owner.conversation && j.owner.conversation.id === CID.A).map((j) => j.id);
  ok(same([...listIds(lr)].sort(), [...aIds].sort()) && !listIds(lr).includes(b1.id), `list with siblings: every job of A (${aIds.length}), never B's`, listIds(lr));
  jm._loadArchive = () => [rec('jb-0ld0a001', 'A', { name: 'old-build', state: 'done', archivedAt: 1 }), rec('jb-0ld0b001', 'B', { name: 'b-old', state: 'done', archivedAt: 1 })];
  const la = await call('GET /api/agent/jobs', { token: T.reporter, query: { archived: '1' } }), lla = await call('GET /api/agent/jobs', { token: T.loner, query: { archived: '1' } });
  ok(same(listIds(la), ['jb-0ld0a001']) && same(listIds(lla), []), 'list --archived: siblings read A\'s archived job, never B\'s; without a grant none (as before)', { reporter: listIds(la), loner: listIds(lla) });
  const pa = await call('GET /api/agent/jobs/:ref', { token: T.reporter, params: { ref: 'old-build' } }), pb = await call('GET /api/agent/jobs/:ref', { token: T.reporter, params: { ref: 'jb-0ld0b001' } });
  ok(pa.code === 200 && pa.body.job?.id === 'jb-0ld0a001' && pa.body.job?.readByGrant === true && pb.code === 404 && pb.body.code === 'job-reads-itself', 'poll of an archived job: a granted one answers (read through), another conversation\'s is refused with the recipe', { pa: pa.code, pb: pb.body });
  jm._loadArchive = () => [];
}
{
  const p1 = await call('GET /api/agent/jobs/:ref', { token: T.watcher, params: { ref: 'api-server' }, query: { tail: '20' } });
  ok(p1.code === 200 && p1.body.job?.id === a1.id && p1.body.job?.mine === null && p1.body.job?.readByGrant === true, 'poll / show of a granted job by its NAME answers it (readByGrant, never «mine»)', p1.body);
  const p2 = await call('GET /api/agent/jobs/:ref', { token: T.watcher, params: { ref: a2.id }, query: { tail: '200' } });
  ok(p2.code === 200 && p2.body.job?.id === a2.id && 'logTail' in (p2.body.job || {}), 'logs of a granted job (the poll with --tail 200) answers, its log tail field present', p2.body.job && Object.keys(p2.body.job).filter((k) => /log/i.test(k)));
  const pB = await call('GET /api/agent/jobs/:ref', { token: T.watcher, params: { ref: b1.id } }), pN = await call('GET /api/agent/jobs/:ref', { token: T.watcher, params: { ref: 'jb-00000000' } });
  ok(pB.code === 404 && pB.body.code === 'job-reads-itself' && pB.body.error === `"${b1.id}": this job may read only itself and the jobs it was given at create (${a1.id}, ${a2.id}) — "${b1.id}" is none of them; to read another, give it at create: ${RECIPE}`,
    'poll of another conversation\'s job (view open to all): refused by name, naming the grant and the recipe', pB.body);
  ok(pN.code === 404 && noRef(pN.body.error, 'jb-00000000') === noRef(pB.body.error, b1.id), '…the same words as a poll of no job (no existence oracle)', pN.body);
  const p0 = await call('GET /api/agent/jobs/:ref', { token: T.loner, params: { ref: 'api-server' } });
  ok(p0.code === 404 && p0.body.error === `"api-server": this job may read only itself — give it the other jobs at create: ${RECIPE}. Read only: poll, list and logs; stop, start and rm stay its conversation's` && !/visible to this session/.test(p0.body.error),
    'INSIDE A JOB WITHOUT A GRANT: a poll of its sibling answers «this job may read only itself — give it the other jobs at create» + the recipe — never «no job … visible to this session» (the words that misled)', p0.body);
  const ps = await call('GET /api/agent/jobs/:ref', { token: T.loner, params: { ref: loner.id } });
  ok(ps.code === 200 && ps.body.job?.id === loner.id && ps.body.job?.mine === true, 'a poll of ITSELF answers as before (mine)', ps.body.job && ps.body.job.mine);
  const ag = await call('GET /api/agent/jobs/:ref', { token: 'vsst_A', params: { ref: a1.id } }), agB = await call('GET /api/agent/jobs/:ref', { token: 'vsst_A', params: { ref: b1.id } });
  ok(ag.code === 200 && ag.body.job?.mine === true && !('readByGrant' in (ag.body.job || {})) && agB.code === 200 && agB.body.job?.mine === false, 'the agent\'s own path is unchanged: its job «mine», B\'s (view all) «another conversation\'s», no grant mark', { a1: ag.body.job && ag.body.job.mine, b1: agB.body.job && agB.body.job.mine });
}
{
  const before = reached.length, a1Rec = jm.jobs.get(a1.id), a1State = a1Rec.state, a1Progress = a1Rec.progress || null;
  for (const act of ['stop', 'start', 'restart', 'rm', 'progress', 'announce', 'subscribe', 'ask', 'withdraw']) {
    const r = await call('POST /api/agent/jobs/:ref/:act', { token: T.watcher, params: { ref: 'api-server', act }, body: { text: 'x', force: true } });
    ok(r.code === 403 && r.body.code === 'job-read-only' && String(r.body.error).startsWith('"api-server" is READ ONLY for this job (given at create with --may-read)') && String(r.body.error).includes(`${act} on another job stays its owner conversation's`), `${act} of a granted job: 403 READ ONLY, by name`, r.body);
  }
  ok(reached.length === before && jm.jobs.has(a1.id) && a1Rec.state === a1State && (a1Rec.progress || null) === a1Progress, 'the granted job was not touched: no control verb reached the engine, it is still there, its state and progress unchanged', reached.slice(before));
  const sB = await call('POST /api/agent/jobs/:ref/:act', { token: T.watcher, params: { ref: b1.id, act: 'stop' } });
  ok(sB.code === 404 && sB.body.code === 'job-reads-itself' && noRef(sB.body.error, b1.id) === noRef((await call('POST /api/agent/jobs/:ref/:act', { token: T.watcher, params: { ref: 'jb-00000000', act: 'stop' } })).body.error, 'jb-00000000'), 'a stop of another conversation\'s job: the recipe words — the same as for no job', sB.body);
  const self1 = await call('POST /api/agent/jobs/:ref/:act', { token: T.watcher, params: { ref: watcher.id, act: 'stop' } });
  ok(self1.code === 403 && self1.body.error === SELF_WORDS, 'a stop of ITSELF: refused in the words of before', self1.body);
  const self2 = await call('POST /api/agent/jobs/:ref/:act', { token: T.watcher, params: { ref: watcher.id, act: 'progress' }, body: { text: 'half way' } });
  ok(self2.code === 200 && jm.jobs.get(watcher.id).progress === 'half way', 'progress on ITSELF answers as before', self2.body);
}
console.log('§3b RED: copies of src/agent-routes.js');
{
  const ASRC = read('src/agent-routes.js');
  const noPost = mount(MJ.load('src/agent-routes.js', anchored(ASRC, '  if (a.selfJob) { const v = jobModel.jobTokenVerdict(a.selfJob, job, act, ref); if (!v.ok) return res.status(v.status).json({ error: v.error, code: v.code }); }\n', '  /* MUTANT: no per-verb verdict */\n', 'the POST route\'s per-verb verdict'), 'no-post-verdict'));
  const before = reached.length;
  const r = await noPost('POST /api/agent/jobs/:ref/:act', { token: T.watcher, params: { ref: 'api-server', act: 'stop' } });
  ok(r.code === 200 && reached.slice(before).includes('stop:' + a1.id), 'CONTROL (the POST verdict cut, in a copy): the job STOPS its sibling through a read grant — the verdict line is what keeps it read only', { code: r.code, reached: reached.slice(before) });
  const noGet = mount(MJ.load('src/agent-routes.js', anchored(ASRC, "    if (a.selfJob) { const v = jobModel.jobTokenVerdict(a.selfJob, null, req.query.answers ? 'answers' : 'poll', ref); return res.status(v.status).json({ error: v.error, code: v.code }); }", '    /* MUTANT: no refusal by name */', 'the GET route\'s refusal by name'), 'no-get-refusal'));
  const g = await noGet('GET /api/agent/jobs/:ref', { token: T.loner, params: { ref: 'api-server' } });
  ok(g.code === 404 && g.body.error === 'no job "api-server" visible to this session — vibespace-job list', 'CONTROL (the GET refusal cut, in a copy): the incident\'s words come back — «no job … visible to this session»', g.body);
}

// ════════ §4 THE CLI over a loopback bridge ════════
console.log('§4 the real vibespace-job CLI');
{
  let posts = 0;
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://loopback');
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { }
      if (req.method === 'POST') posts++;
      const m = /^\/api\/agent\/jobs\/([^/]+)$/.exec(u.pathname), ma = /^\/api\/agent\/jobs\/([^/]+)\/([a-z-]+)$/.exec(u.pathname);
      const key = u.pathname === '/api/agent/jobs' ? `${req.method} /api/agent/jobs` : m && req.method === 'GET' ? 'GET /api/agent/jobs/:ref' : ma && req.method === 'POST' ? 'POST /api/agent/jobs/:ref/:act' : null;
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (!key) return send(404, { error: 'no route' });
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      call(key, { token, body, query: Object.fromEntries(u.searchParams), params: m ? { ref: decodeURIComponent(m[1]) } : ma ? { ref: decodeURIComponent(ma[1]), act: ma[2] } : {} }).then((r) => send(r.code, r.body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${server.address().port}`;
  const cli = (env, argv) => new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...argv], { cwd: CWD, env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: TMP, LANG: 'C.UTF-8', VIBESPACE_API: API, ...env } });
    let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, out, err }));
  });
  const asA = { VIBESPACE_SESSION_TOKEN: 'vsst_A' }, inJob = (j, t) => ({ VIBESPACE_JOB_TOKEN: t, VIBESPACE_JOB_ID: j.id });
  const nc = await cli(asA, ['notify-cron', '--name', 'nc-cli', '--every', '1h', '--text', 'hi', '--may-read', 'siblings']);
  ok(nc.code === 2 && nc.err.trim() === 'vibespace-job notify-cron: --may-read is for a job that runs a command — a notify cron runs none; nothing was created' && posts === 0, 'notify-cron --may-read: refused at the prompt, exit 2, nothing sent', { code: nc.code, err: nc.err, posts });
  const [mk, poll0, showG, showS, stopG, listG] = await Promise.all([
    cli(asA, ['run', 'sleep 1', '--name', 'cli-watcher', '--may-read', 'api-server,nightly-build']),
    cli(inJob(loner, T.loner), ['poll', 'api-server']),
    cli(inJob(watcher, T.watcher), ['show', 'api-server']),
    cli(inJob(watcher, T.watcher), ['show', watcher.id]),
    cli(inJob(watcher, T.watcher), ['stop', 'api-server']),
    cli(inJob(watcher, T.watcher), ['list']),
  ]);
  const made = [...jm.jobs.values()].find((j) => j.name === 'cli-watcher');
  ok(mk.code === 0 && !!made && same(made.mayRead, { ids: [a1.id, a2.id] }), 'run --may-read NAME,NAME through the real CLI and the real create route: the grant is on the record', { code: mk.code, err: mk.err.slice(0, 300), mayRead: made && made.mayRead });
  ok(poll0.code === 1 && poll0.err.trim() === `"api-server": this job may read only itself — give it the other jobs at create: ${RECIPE}. Read only: poll, list and logs; stop, start and rm stay its conversation's`, 'INSIDE A JOB, the CLI prints the refusal by name with the recipe (exit 1)', poll0);
  ok(showG.code === 0 && showG.out.split('\n')[0] === `${a1.id} [task] up — api-server — read by this job's --may-read grant (read only)`, 'inside a job, show of a granted job: its header says it is read by the grant (never «another conversation\'s»)', showG.out.split('\n')[0]);
  ok(showS.code === 0 && showS.out.split('\n').includes(`may read: ${a1.id}, ${a2.id} — read only (poll / list / logs)`), 'show of the job itself prints its grant', showS.out.split('\n').filter((l) => /may read/.test(l)));
  ok(stopG.code === 1 && stopG.err.startsWith('"api-server" is READ ONLY for this job'), 'inside a job, stop of a granted job: refused READ ONLY (exit 1)', stopG);
  const lines = listG.out.trim().split('\n');
  ok(listG.code === 0 && lines.length === 3 && lines[0].startsWith(watcher.id) && lines.slice(1).every((l) => l.includes(' · read by grant')) && !lines[0].includes('read by grant'), 'inside a job, list: itself and its two granted jobs, each granted one marked «read by grant»', lines);
  await new Promise((r) => server.close(r));
}

// ════════ §5 THE MANUAL AND THE USAGE ════════
console.log('§5 the manual and the usage say it');
{
  const man = read('docs/agent/background-work-manual.md');
  const s9 = (man.match(/\n## 9\. [^\n]*\n([\s\S]*?)(?=\n## (?!9\. ))/) || [])[1] || '';
  const sub = (s9.split('### A job that reads its sibling jobs — `--may-read JOB,JOB` / `--may-read siblings`')[1] || '').split('\n### ')[0];
  ok(sub.length > 400 && sub.includes('**Read only.**') && sub.includes("never another conversation's") && sub.includes('«this job may read only itself — give it the other jobs at create»') && sub.includes('--may-read siblings') && sub.includes('A scheduled job\'s runs read what the schedule was given'),
    `vibespace-docs jobs §9 says it: read only, this conversation's jobs only, the refusal's words, siblings, a schedule's runs (${sub.length} chars)`);
  ok(M.mayReadRefusal({ id: 'jb-x' }, 'y').includes('this job may read only itself — give it the other jobs at create'), 'the words the manual quotes are the product\'s');
  const src = read('data/bin/vibespace-job');
  ok(/const RUN_FLAGS = Object\.freeze\(\[[^\]]*'may-read'[^\]]*\]\)/.test(src) && src.includes('[--may-read JOB,JOB | --may-read siblings]') && src.includes("mayRead: flags['may-read'] === true ? '' : String(flags['may-read'])"), 'the CLI accepts --may-read (RUN_FLAGS), the usage prints it, the body carries it as mayRead');
}
for (const r of copiesCensus(MJ.files, MJ.dir, REPO, { minCopies: 4, label: 'B-3992 ' })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
