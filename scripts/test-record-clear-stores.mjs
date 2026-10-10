#!/usr/bin/env node
// test-record-clear-stores — "CLEAR CONTENT…" over the FIVE REAL STORES (2026-09-28, the
// owner's ask). A scratch data dir, the real TaskGroupManager / UserTodoManager /
// SessionStatusManager / JobManager (through the real jobs wiring) / channel store + groups
// engine, the real ORCH entry point (src/server/record-clear.js), the owner's routes and the
// agent's verbs (src/agent-routes.js) over a fake express, and the REAL data/bin CLIs against
// a tiny stub server. Every leg plants ONE marker string — the "unrelated mailbox" content —
// and proves it is gone from the record AND from every place the text was derived into:
//   §1 ACTIVITY  ids minted + backfilled; the owner's batch clear through the door (one save,
//      one broadcast); id/time/author/position kept; TASK.md in the context folder, the
//      injected context (single + multi group), the diff snapshot (`_groupSnap`) and a diff
//      from a pre-clear snapshot carry no marker (and no "New activity"); the real
//      task-context route; the agent's `progress-redact` (own ✓ · another's 403 · a pending
//      fork 409 · a job token 403 · unknown 404 · the owner routes refuse an agent token);
//      the REAL `vibespace-task` CLI (progress echoes the id, show prints it, progress-redact)
//   §2 FOR-YOU   open + resolved items (the snapshot's 300-char preview), the file on disk,
//      restoreDetails forgets the old whole text, a re-file never reopens a cleared item, the
//      agent's `{clear}` (own ✓ · a helper's ask under its key 403 · another's 403), the REAL
//      `vibespace-ask clear`
//   §3 STATUS    the history entry by (key, at), the CURRENT record, the queued override notice
//      (rendered into the agent's next turn), the history route names its key
//   §4 JOBS      a cron family in the registry + a run in the ARCHIVE, the event ring, the held
//      stash, the spill file, the job's For-you items (the cascade), the snapshot's log tail,
//      the digest + updates injected to viewers, both files on disk; the ARCHIVE-FIRST order
//      (a failed archive write changes nothing)
//   §5 GROUP MESSAGES  the replacement record appended (the ORIGINAL line stays on disk — no
//      roll exists), the index, read + paging (a page that does not reach the replacement),
//      unread unchanged, the next-turn report, lastText, the broadcast's `cleared`, the audit
//      row without words; an agent's own vs another's; a page of 50 stays 50 under 60 clears
//   §6 THE JOURNAL  every [clear] line carries ids and counts, never a word of the marker
//   §7 wiring pins (the five surfaces, the routes, the doors)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs'; // the verify-r1 controls: a store's door with its pre-fix rule, outside the checkout

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RC = require(path.join(ROOT, 'src/record-clear.js'));
const { TaskGroupManager } = require(path.join(ROOT, 'src/task-groups.js'));
const { UserTodoManager } = require(path.join(ROOT, 'src/user-todos.js'));
const { SessionStatusManager } = require(path.join(ROOT, 'src/session-status.js'));
const jobsWiring = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
const { createChannelStore } = require(path.join(ROOT, 'src/channel-store.js'));
const GE = require(path.join(ROOT, 'src/server/groups-engine.js'));
const G = require(path.join(ROOT, 'src/channel-groups.js'));
const ORCH = require(path.join(ROOT, 'src/server/record-clear.js'));
const jobModel = require(path.join(ROOT, 'src/job-model.js'));
const MUT = mutantCopies('record-clear-stores', ROOT);
const { registerRecordClearRoutes } = require(path.join(ROOT, 'src/routes/records-clear.js'));
const { setupAgentRoutes } = require(path.join(ROOT, 'src/agent-routes.js'));
const L = await import(pathToFileURL(path.join(ROOT, 'src/lib/user-todos-layout.js')).href);

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const J = JSON.stringify;
const MARK = 'FINANCE-MAILBOX-7f3a'; // the planted "unrelated mailbox" words — must vanish everywhere
const has = (x) => (typeof x === 'string' ? x : J(x) || '').includes(MARK);
const CT = RC.CLEARED_TEXT;

const DIR = scratch('record-clear-stores');
fs.rmSync(DIR, { recursive: true, force: true });
const DATA = path.join(DIR, 'data'); const CTX = path.join(DIR, 'ctx'); const CTX2 = path.join(DIR, 'ctx2');
for (const d of [DATA, CTX, CTX2, path.join(DATA, 'bin')]) fs.mkdirSync(d, { recursive: true });
const cleanup = () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const ME_CID = 'a11ce000-0000-4000-8000-00000000a001', OTHER_CID = 'b0b00000-0000-4000-8000-00000000b002';
const ME = 'claude:' + ME_CID, OTHER = 'claude:' + OTHER_CID;
const journal = [];
const log = (...a) => journal.push(a.map(String).join(' '));

/** a route registry standing in for express */
function fakeApp() {
  const routes = new Map();
  const reg = (m) => (p, h) => routes.set(m + ' ' + p, h);
  const app = { get: reg('GET'), post: reg('POST'), patch: reg('PATCH'), delete: reg('DELETE'), use() { } };
  const call = (m, p, { params = {}, query = {}, body = {}, headers = {} } = {}) => new Promise((resolve) => {
    const h = routes.get(m + ' ' + p);
    if (!h) return resolve({ status: 404, body: { error: 'no route ' + m + ' ' + p } });
    const res = { _status: 200, status(c) { this._status = c; return this; }, json(o) { resolve({ status: this._status, body: o }); return this; } };
    Promise.resolve().then(() => h({ params, query, body, headers }, res)).catch((e) => resolve({ status: 500, body: { error: e.message } }));
  });
  return { app, call, routes };
}

// ── the five stores ──
// a LEGACY task-groups.json (entries with no ids) — the constructor backfills them once
const T0 = Date.now() - 3600e3;
fs.writeFileSync(path.join(DATA, 'task-groups.json'), J({ version: 1, tasks: {
  'T-260928-work': { id: 'T-260928-work', title: '工作', kind: 'task', archived: false, attention: null, objective: 'ship the release', backlog: [], sessions: [ME, OTHER], folders: [], contextDir: CTX, color: null, createdAt: T0, updatedAt: T0, contentUpdatedAt: T0, injectContext: true,
    progress: [
      { at: T0 + 1000, note: 'legacy entry one', session: OTHER },
      { at: T0 + 2000, note: 'legacy entry two', session: null },
    ] },
  'T-260928-side': { id: 'T-260928-side', title: 'side', kind: 'task', archived: false, attention: null, objective: '', backlog: [], sessions: [ME], folders: [], contextDir: CTX2, color: null, createdAt: T0 + 1, updatedAt: T0, contentUpdatedAt: T0, injectContext: true, progress: [] },
} }, null, 2));
let tasksBroadcasts = 0;
const tasks = new TaskGroupManager({ dataDir: DATA, onChange: () => { tasksBroadcasts++; } });
let todosBroadcasts = 0, lastTodos = null;
const userTodos = new UserTodoManager({ dataDir: DATA, onChange: (s) => { todosBroadcasts++; lastTodos = s; }, expirySweepMs: 0 });
let statusBroadcasts = 0, lastStatusExtra = null;
const sessionStatus = new SessionStatusManager({ dataDir: DATA, onChange: (st, extra) => { statusBroadcasts++; lastStatusExtra = extra || null; } });
const jobsBroadcasts = [];

// Background Work: a cron family (parent + one run in the registry, one run archived), a held stash, a spill file, a run log
const JT = Date.now() - 60e3;
const jobOwner = { conversation: { id: ME_CID }, sessionId: 'cw-me', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: ['T-260928-work'] };
const PARENT = 'jb-0000aa01', CHILD = 'jb-0000aa02', ARCHIVED = 'jb-0000aa03', FOREIGN = 'jb-0000bb01';
const jobRec = (id, x) => ({ id, kind: 'task', name: 'job', note: '', cmd: { argv: ['sh', '-c', 'true'], cwd: DIR }, envFrom: [], restart: 'on-failure', health: null, ports: [], publish: false, singleInstance: true, timeoutMs: null, untilOutput: null, stdinOpen: false, notifyUser: false, notifyOk: false, schedule: null, catchUp: 'once', action: null, context: null, interaction: { pending: null, answers: [] }, owner: jobOwner, access: { view: 'group', control: 'session' }, stopWithOwner: false, desiredUp: false, state: 'done', proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, runs: [], createdAt: JT, ...x });
const run = (startedAt, lastLine) => ({ startedAt, trigger: 'cron', log: path.join(DATA, 'job-logs', 'x', String(startedAt), 'current.log'), endedAt: startedAt + 1000, exit: 0, cause: 'exit', lastLine });
fs.writeFileSync(path.join(DATA, 'jobs.json'), J([
  jobRec(PARENT, { kind: 'cron', name: `mail digest ${MARK}`, note: `reads ${MARK}`, context: { payload: `watch ${MARK} for invoices` }, schedule: { cron: '0 9 * * *' }, action: { type: 'notify', text: `new mail in ${MARK}` }, state: 'down', desiredUp: false, progress: `read 3 mails of ${MARK}`, lastNotify: { ts: JT, lane: 'stash', ok: true, reason: `unreachable ${MARK}` }, notifyLog: [{ ts: JT, lane: 'stash', ok: false, reason: `not reachable ${MARK}`, to: 'a11ce000' }] }),
  jobRec(CHILD, { name: `mail digest ${MARK} run`, cronParent: PARENT, runs: [run(JT, `Subject: ${MARK} invoices`)], ack: { by: 'user-opened', at: JT } }),
  jobRec(FOREIGN, { name: 'someone else\'s job', owner: { ...jobOwner, conversation: { id: OTHER_CID } }, runs: [run(JT, 'fine')], ack: { by: 'user-opened', at: JT } }),
]));
fs.writeFileSync(path.join(DATA, 'jobs-archive.json'), J([jobRec(ARCHIVED, { name: `mail digest ${MARK} run`, cronParent: PARENT, runs: [run(JT - 86400e3, `Subject: ${MARK} old`)], archivedAt: JT, archivedWhy: 'done' })]));
fs.writeFileSync(path.join(DATA, 'job-notifications.json'), J({ [ME_CID]: [
  { jobId: PARENT, jobName: `mail digest ${MARK}`, text: `announced: ${MARK} arrived`, ts: JT, urgency: 'low', held: { kind: 'rate-floor' } },
  // verify r1: a `--notify` cron's held notification carries the action's OWN text as `text` (jobs.js _notifyOwner(job, {what: a.text || job.name}))
  { jobId: PARENT, jobName: `mail digest ${MARK}`, text: `new mail in ${MARK}`, ts: JT + 1, urgency: 'low', held: { kind: 'not-reachable' } },
] }));
fs.mkdirSync(path.join(DATA, 'job-notifications-read'), { recursive: true });
const SPILL = path.join(DATA, 'job-notifications-read', ME_CID + '.md');
fs.writeFileSync(SPILL, `\n## drained 2026-09-28T00:00:00.000Z\n- 2026-09-28T00:00:00.000Z ${PARENT} mail digest ${MARK}: announced: ${MARK}\n- 2026-09-28T00:00:01.000Z ${FOREIGN} someone else's job: done\n`);
const childLog = path.join(DATA, 'job-logs', CHILD, String(JT));
fs.mkdirSync(childLog, { recursive: true });
fs.writeFileSync(path.join(childLog, 'current.log'), `line one\nSubject: ${MARK} invoices\n`);
const J_W = jobsWiring.create({
  app: fakeApp().app, dataDir: DATA, broadcastAll: (m) => jobsBroadcasts.push(m), userTodos, log,
  serverSetting: () => undefined, taskGroups: tasks, activeSessions: new Map(),
  deliver: { peerReachable: () => false, deliverToConversation: async () => ({ ok: false, reason: 'no lane' }) },
});
J_W.initAfterListen();
const jm = J_W.jm;

// agent groups
const gStore = createChannelStore({ dir: path.join(DATA, 'channels') });
const gBroadcasts = [];
let gt = Date.now() - 600e3;
const roster = [{ cid: ME_CID, name: 'me', groups: ['tg'], reachability: null }, { cid: OTHER_CID, name: 'other', groups: ['tg'], reachability: null }];
const groups = GE.create({ store: gStore, deliver: { deliverToConversation: async () => ({ ok: false, reason: 'test' }) }, broadcast: (m) => gBroadcasts.push(m), now: () => (gt += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });

// the ONE entry point + the owner's routes + the agent's verbs
const recordClear = ORCH.create({ tasks, userTodos, sessionStatus, getJobs: () => jm, getGroups: () => groups, log });
const OWNER_APP = fakeApp();
registerRecordClearRoutes(OWNER_APP.app, { recordClear });
const AG = fakeApp();
const sessMe = { agentToken: 'vsst_me', backend: 'claude', backendSessionId: ME_CID, claudeSessionId: ME_CID, cwd: DIR, name: 'me' };
const sessOther = { agentToken: 'vsst_other', backend: 'claude', backendSessionId: OTHER_CID, claudeSessionId: OTHER_CID, cwd: DIR, name: 'other' };
const sessFork = { agentToken: 'vsst_fork', backend: 'claude', backendSessionId: ME_CID, claudeSessionId: ME_CID, cwd: DIR, name: 'fork of me', _forkRequested: true };
const activeSessions = new Map([['cw-me', sessMe], ['cw-other', sessOther], ['cw-fork', sessFork]]);
const sessionStatusKey = (s, id) => { const b = s && (s.backendSessionId || s.claudeSessionId); return b ? `${s.backend || 'claude'}:${b}` : `webui:${id}`; };
setupAgentRoutes({
  app: AG.app, activeSessions, tasks, sessionStatus, SessionStatusManager, userTodos, sessionStatusKey,
  serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null, readUserState: () => ({}),
  getJobs: () => jm, getRecordClear: () => recordClear,
});
const asAgent = (tok) => ({ authorization: 'Bearer ' + tok });
const W = 'T-260928-work';

// ── §1 ACTIVITY ──
console.log('§1 the Task Group Activity log');
{
  const legacy = tasks.get(W).progress;
  ok(legacy.length === 2 && legacy.every((p) => /^P-[0-9a-f]{6}$/.test(p.id)) && legacy[0].id !== legacy[1].id, 'a legacy entry with no id gets its stable P- id once at load (the backlog-id precedent)', legacy);
  const again = new TaskGroupManager({ dataDir: DATA, onChange: () => {} });
  ok(J(again.get(W).progress.map((p) => p.id)) === J(legacy.map((p) => p.id)), '…persisted: a reload keeps the same ids');
  // the planted entries: three by THIS agent (one with the marker only in its detail), one by another, one from the UI
  tasks.addProgress(W, { note: `filed the ${MARK} thread`, detail: `From: cfo@example.com\n${MARK} body`, session: ME });
  tasks.addProgress(W, { note: 'routine work', detail: `mentions ${MARK} in passing`, session: ME });
  tasks.addProgress(W, { note: `summary of ${MARK}`, session: OTHER });
  tasks.addProgress(W, { note: `owner note about ${MARK}`, session: null });
  tasks.addProgress(W, { note: 'an unrelated entry', session: ME });
  tasks.addProgress('T-260928-side', { note: `side group ${MARK}`, session: ME });
  const prog = tasks.get(W).progress;
  ok(prog.every((p) => /^P-[0-9a-f]{6}$/.test(p.id)) && new Set(prog.map((p) => p.id)).size === prog.length, 'addProgress mints a unique P- id for every new entry');
  const md0 = fs.readFileSync(path.join(CTX, '.vibespace', 'TASK.md'), 'utf8');
  ok(has(md0), 'setup: TASK.md in the context folder carries the marker before the clear');
  // a session's injection snapshot taken BEFORE the clear (what `_groupSnap` holds)
  const snapBefore = tasks.snapshotForDiff(W);
  const tc0 = await AG.call('GET', '/api/agent/task-context', { headers: asAgent('vsst_me') });
  ok(tc0.status === 200 && has(tc0.body.context), 'setup: the real task-context route injects the marker before the clear', tc0.status);
  ok(!has(sessMe._groupSnap || {}), 'the injection\'s cached snapshot (`_groupSnap`) never holds activity words at all (lastProgressAt only)', sessMe._groupSnap);

  // THE OWNER clears every entry the Find box matches (the window's batch)
  const hits = prog.filter((p) => has(p.note) || has(p.detail));
  const before = { broadcasts: tasksBroadcasts, order: prog.map((p) => p.id), meta: prog.map((p) => [p.id, p.at, p.session]) };
  const r = await OWNER_APP.call('POST', '/api/records/clear-many', { body: { items: hits.map((p) => ({ kind: 'activity', groupId: W, id: p.id })) } });
  ok(r.status === 200 && r.body.ok && r.body.cleared === hits.length && !r.body.refused.length && !r.body.unknown.length, `the owner's batch clears all ${hits.length} entries Find matches (one request)`, r.body);
  ok(tasksBroadcasts === before.broadcasts + 1, 'ONE tasks-updated broadcast for the whole batch (one atomic save)', tasksBroadcasts - before.broadcasts);
  const after = tasks.get(W).progress;
  ok(J(after.map((p) => [p.id, p.at, p.session])) === J(before.meta), 'every entry keeps its id, its time, its author and its POSITION');
  ok(after.filter((p) => hits.some((h) => h.id === p.id)).every((p) => p.note === CT && !p.detail && p.clearedBy === 'owner' && Number.isFinite(p.clearedAt)), 'a cleared entry reads the ONE sentence, its detail is gone, clearedAt + clearedBy owner');
  ok(after.find((p) => p.note === 'an unrelated entry') && !after.find((p) => p.note === 'an unrelated entry').clearedAt, 'an entry nobody named is untouched');
  ok(!has(after), 'the Task Group\'s activity no longer carries the marker anywhere');
  const onDisk = fs.readFileSync(path.join(DATA, 'task-groups.json'), 'utf8');
  ok(!onDisk.includes(`filed the ${MARK}`) && !onDisk.includes(`summary of ${MARK}`) && onDisk.includes(`side group ${MARK}`), 'data/task-groups.json on disk: the cleared entries\' words are gone (the other group\'s own entry is not this group\'s)');
  const md1 = fs.readFileSync(path.join(CTX, '.vibespace', 'TASK.md'), 'utf8');
  ok(!has(md1) && md1.includes(CT), 'TASK.md (the context folder\'s mirror) is regenerated through the same save: the sentence, no marker');
  ok(!has(tasks.renderTaskMd(tasks.get(W))) && !has(tasks.renderContext(W, { sessionKey: ME })), 'renderTaskMd + renderContext (the injected single-group context) carry no marker');
  const multi = tasks.renderMultiContext([W, 'T-260928-side'], { sessionKey: ME });
  ok(!multi.includes(`summary of ${MARK}`) && !multi.includes(`filed the ${MARK}`) && multi.includes(CT), 'renderMultiContext (a session in two groups) shows the sentence, never the cleared words');
  const diff = tasks.diffChanges(W, snapBefore, { sessionKey: ME });
  ok(diff && !diff.lines.length && !has(diff), 'a diff from the PRE-clear snapshot has no lines: a clear is not news to a member agent (no "New activity"), and carries no marker', diff);
  ok(!has(tasks.snapshotForDiff(W)) && tasks.snapshotForDiff(W).lastProgressAt === snapBefore.lastProgressAt, 'the recomputed diff snapshot carries no marker and the same lastProgressAt');
  const tc1 = await AG.call('GET', '/api/agent/task-context', { headers: asAgent('vsst_me') });
  ok(tc1.status === 200 && !tc1.body.context.includes(`filed the ${MARK}`) && !tc1.body.context.includes(`summary of ${MARK}`) && tc1.body.context.includes(CT), 'the real task-context route after the clear: the sentence, never the cleared words');
  ok(!has(sessMe._groupSnap || {}), '…and the session\'s `_groupSnap` it recomputed carries none');
  const pc = await AG.call('GET', '/api/agent/prompt-context', { headers: asAgent('vsst_me'), query: {} });
  ok(pc.status === 200 && !J(pc.body).includes(`filed the ${MARK}`) && !J(pc.body).includes(`summary of ${MARK}`), 'the per-turn prompt-context injection after the clear carries none of the cleared words', pc.status);
  const show = await AG.call('GET', '/api/agent/task', { headers: asAgent('vsst_me'), query: { group: W } });
  ok(show.status === 200 && !show.body.task.progress.some((p) => has(p.note)) && show.body.task.progress.some((p) => p.note === CT), '`vibespace-task show` (GET /api/agent/task) reads the sentence');
  ok((await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'activity', groupId: W, id: hits[0].id } })).body.already === 1, 'a second clear of the same entry is an idempotent "already"');
  ok((await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'activity', groupId: W, id: 'P-ffffff' } })).status === 404, 'an unknown entry id is 404 not_found');
  ok((await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'activity', groupId: 'T-nope', id: hits[0].id } })).status === 404, 'an unknown Task Group is 404 not_found');
  for (const tok of ['vsst_me', 'jbt_x']) {
    const a = await OWNER_APP.call('POST', '/api/records/clear', { headers: asAgent(tok), body: { kind: 'activity', groupId: W, id: hits[0].id } });
    const b = await OWNER_APP.call('POST', '/api/records/clear-many', { headers: asAgent(tok), body: { items: [{ kind: 'activity', groupId: W, id: hits[0].id }] } });
    ok(a.status === 403 && a.body.code === 'agent_forbidden' && b.status === 403 && b.body.code === 'agent_forbidden', `the owner's routes refuse a ${tok.slice(0, 5)} token by name (403 agent_forbidden)`, [a.body, b.body]);
  }
  ok((await OWNER_APP.call('POST', '/api/records/clear-many', { body: { items: [] } })).body.code === 'bad_items' && (await OWNER_APP.call('POST', '/api/records/clear-many', { body: { items: Array.from({ length: 201 }, (_, k) => ({ kind: 'todo', id: 'ut-' + k })) } })).body.code === 'too_many', 'an empty batch is bad_items; 201 records is too_many');

  // THE AGENT'S OWN VERB
  const tick = () => new Promise((r) => setTimeout(r, 3)); // distinct milliseconds — an entry named by its time must be the only one of it
  tasks.addProgress(W, { note: `agent wrote ${MARK} again`, session: ME }); await tick();
  tasks.addProgress(W, { note: `agent wrote ${MARK} by time`, session: ME }); await tick();
  tasks.addProgress(W, { note: `the other agent wrote ${MARK}`, session: OTHER }); await tick();
  const p3 = tasks.get(W).progress.slice(-3);
  const mine = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_me'), body: { ref: p3[0].id, group: W } });
  ok(mine.status === 200 && mine.body.cleared === 1 && tasks.get(W).progress.find((p) => p.id === p3[0].id).clearedBy === ME, 'an agent clears ITS OWN entry by id; clearedBy = its session key', mine.body);
  const byAt = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_me'), body: { ref: String(p3[1].at), group: W } });
  ok(byAt.status === 200 && byAt.body.cleared === 1, '…and by the entry\'s time in ms', byAt.body);
  const foreign = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_me'), body: { ref: p3[2].id, group: W } });
  ok(foreign.status === 403 && foreign.body.code === 'not_yours' && has(tasks.get(W).progress.find((p) => p.id === p3[2].id).note), 'ANOTHER session\'s entry is refused by name (403 not_yours) and stays as it was', foreign.body);
  const fork = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_fork'), body: { ref: p3[2].id, group: W } });
  const fork2 = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_fork'), body: { ref: before.order[before.order.length - 1], group: W } });
  ok(fork.status === 409 && fork.body.code === 'pending_fork' && fork2.status === 409 && fork2.body.code === 'pending_fork', 'a FORK still borrowing its parent\'s id is refused by name (409 pending_fork) — even for an entry its parent wrote', [fork.body, fork2.body]);
  const job = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('jbt_abc'), body: { ref: p3[2].id, group: W } });
  ok(job.status === 403 && job.body.code === 'job_token', 'a job token is refused by name (403 job_token) before anything is read', job.body);
  // A CODEX FORK (verify r3 on the merged tree, reproduced): `_forkRequested` stays true for the life of a codex fork
  // (the wrapper_meta adoption never clears it), so the caller must read the fact off the live fields — master's ONE
  // predicate `liveForkPending` — or a fork that adopted its own thread long ago is refused `pending_fork` for ever
  {
    const { liveForkPending } = require(path.join(ROOT, 'src/claude-lock-capture.js'));
    const adopted = { agentToken: 'vsst_cxfork', backend: 'codex', backendSessionId: 'thr-own', claudeSessionId: null, cwd: DIR, name: 'codex fork (adopted)', _forkRequested: true, _forkSourceId: 'thr-parent', forkedFrom: ['thr-parent'] };
    const pending = { agentToken: 'vsst_cxpend', backend: 'codex', backendSessionId: 'thr-parent', claudeSessionId: null, cwd: DIR, name: 'codex fork (pending)', _forkRequested: true, _forkSourceId: 'thr-parent', forkedFrom: [] };
    ok(!liveForkPending(adopted) && liveForkPending(pending), 'setup: master\'s predicate says the adopted codex fork is its own, the pending one still borrows');
    activeSessions.set('cw-cxfork', adopted); activeSessions.set('cw-cxpend', pending);
    tasks.bind(W, 'codex:thr-own'); tasks.bind(W, 'codex:thr-parent');
    tasks.addProgress(W, { note: `codex fork wrote ${MARK}`, session: 'codex:thr-own' }); await tick();
    tasks.addProgress(W, { note: `codex parent wrote ${MARK}`, session: 'codex:thr-parent' }); await tick();
    const own = tasks.get(W).progress.slice(-2)[0], parents = tasks.get(W).progress.slice(-1)[0];
    const r1 = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_cxfork'), body: { ref: own.id, group: W } });
    ok(r1.status === 200 && r1.body.cleared === 1 && tasks.get(W).progress.find((p) => p.id === own.id).note === CT, 'a codex fork that adopted its own thread clears ITS OWN entry (200) — the raw flag would have said pending_fork for ever', r1.body);
    const r2 = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_cxpend'), body: { ref: parents.id, group: W } });
    ok(r2.status === 409 && r2.body.code === 'pending_fork' && has(parents.note), 'a codex fork still on its parent\'s thread is refused pending_fork (its key is its parent\'s) and the parent\'s entry stays', r2.body);
    const AR_REL = 'src/agent-routes.js', AR_SRC = fs.readFileSync(path.join(ROOT, AR_REL), 'utf8');
    const NEW_FORK = 'conversationId: addressableId(s), pendingFork: liveForkPending(s) };';
    ok(AR_SRC.split(NEW_FORK).length === 2, 'the caller reads the fork fact through the ONE predicate, once (the control swaps exactly it)');
    const PRE = MUT.load(AR_REL, AR_SRC.replace(NEW_FORK, 'conversationId: s.claudeSessionId || s.backendSessionId || null, pendingFork: !!s._forkRequested };'), 'raw-fork-flag');
    const AG2 = fakeApp();
    PRE.setupAgentRoutes({ app: AG2.app, activeSessions, tasks, sessionStatus, SessionStatusManager, userTodos, sessionStatusKey, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => jm, getRecordClear: () => recordClear });
    tasks.addProgress(W, { note: `codex fork wrote ${MARK} again`, session: 'codex:thr-own' }); await tick();
    const own2 = tasks.get(W).progress.slice(-1)[0];
    const c = await AG2.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_cxfork'), body: { ref: own2.id, group: W } });
    ok(c.status === 409 && c.body.code === 'pending_fork' && has(own2.note), 'NEGATIVE CONTROL: the raw `_forkRequested` caller refuses the adopted codex fork\'s own entry as pending_fork', c.body);
    await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_cxfork'), body: { ref: own2.id, group: W } });
  }
  // two entries in ONE millisecond: a time names neither — refused by name, the id works
  const twin = tasks.get(W);
  const at0 = Date.now();
  tasks.addProgress(W, { note: `twin one ${MARK}`, session: ME }); tasks.addProgress(W, { note: `twin two ${MARK}`, session: ME });
  const twins = twin.progress.slice(-2); twins[0].at = at0; twins[1].at = at0;
  const amb = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_me'), body: { ref: String(at0), group: W } });
  ok(amb.status === 409 && amb.body.code === 'ambiguous' && twins.every((p) => has(p.note)), 'two entries of ONE millisecond: the time is refused by name (409 ambiguous), nothing cleared', amb.body);
  for (const p of twins) await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_me'), body: { ref: p.id, group: W } });
  ok(twins.every((p) => p.note === CT), '…their ids clear each one');
  const unknown = await AG.call('POST', '/api/agent/task/progress-redact', { headers: asAgent('vsst_me'), body: { ref: 'P-000000', group: W } });
  ok(unknown.status === 404 && unknown.body.code === 'not_found', 'an unknown id is 404 not_found', unknown.body);
  const added = await AG.call('POST', '/api/agent/task-progress', { headers: asAgent('vsst_me'), body: { note: 'echo me', group: W } });
  ok(added.status === 200 && added.body.entry && /^P-[0-9a-f]{6}$/.test(added.body.entry.id) && added.body.entry.note === 'echo me', 'task-progress answers with the entry it wrote (its id is what progress-redact names)', added.body);
}

// ── the REAL CLIs against a stub server that forwards to the same route handlers ──
async function stubServer(appObj) {
  const port = await freePort();
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', async () => {
      const u = new URL(req.url, 'http://x');
      const query = Object.fromEntries(u.searchParams);
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { }
      const r = await appObj.call(req.method, u.pathname, { query, body, headers: { authorization: req.headers.authorization || '' } });
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(J(r.body));
    });
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => srv.close(r)) };
}
const runCli = (bin, args, api, tok) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(ROOT, 'data/bin', bin), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: api, VIBESPACE_SESSION_TOKEN: tok }, timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: String(stdout), err: String(stderr) }));
});
{
  console.log('§1b the REAL vibespace-task CLI');
  const S = await stubServer(AG);
  try {
    const p = await runCli('vibespace-task', ['--group', W, 'progress', `cli wrote ${MARK}`], S.url, 'vsst_me');
    const id = (/\[(P-[0-9a-f]{6})\]/.exec(p.out) || [])[1];
    ok(p.code === 0 && !!id, '`progress` echoes the new entry\'s id ("progress recorded as [P-…]")', p.out + p.err);
    const sh = await runCli('vibespace-task', ['--group', W, 'show'], S.url, 'vsst_me');
    ok(sh.code === 0 && sh.out.includes(`[${id}]`) && !sh.out.includes(`[${tasks.get(W).progress.find((x) => x.session === OTHER && !x.clearedAt).id}]`), '`show` prints the id of the caller\'s OWN entries only', sh.out.slice(-600));
    const rd = await runCli('vibespace-task', ['--group', W, 'progress-redact', id], S.url, 'vsst_me');
    ok(rd.code === 0 && /cleared/.test(rd.out) && tasks.get(W).progress.find((x) => x.id === id).note === CT, '`progress-redact <id>` clears it and says so', rd.out + rd.err);
    const other = tasks.get(W).progress.find((x) => x.session === OTHER && !x.clearedAt);
    const rf = await runCli('vibespace-task', ['--group', W, 'progress-redact', other.id], S.url, 'vsst_me');
    ok(rf.code === 1 && /only what its own session wrote/.test(rf.err), 'another session\'s entry: exit 1 with the refusal\'s sentence', rf.err);
    const help = await runCli('vibespace-task', ['--help'], S.url, 'vsst_me');
    ok(/progress-redact <P-id>/.test(help.out) && /\[cleared at the user's request\]/.test(help.out), 'the usage names progress-redact and the sentence', help.out.slice(0, 200));
    const man = fs.readFileSync(path.join(ROOT, 'docs/agent/task-manual.md'), 'utf8');
    ok(/progress-redact/.test(man), 'docs/agent/task-manual.md documents progress-redact');
  } finally { await S.close(); }
}

// ── §2 FOR-YOU ──
console.log('§2 For-you items');
{
  const LONG = `${MARK} ` + 'x'.repeat(900);
  const mineItem = userTodos.add(ME, { text: `Forward the ${MARK} thread?`, detail: LONG, origin: 'agent', options: ['Yes', 'No'] });
  const resolved = userTodos.add(ME, { text: `Old question about ${MARK}`, detail: LONG, origin: 'agent' });
  userTodos.setStatus(resolved.id, 'done');
  userTodos.resolveByReply(mineItem.id, `no — and ${MARK} is not ours`);
  const helper = userTodos.add(ME, { text: 'A helper needs permission', origin: 'agent', action: { type: 'helper-ask', requestId: 'r-1' } });
  const othersItem = userTodos.add(OTHER, { text: `the other agent asks about ${MARK}`, origin: 'agent' });
  const snap0 = userTodos.snapshot();
  const prevRes = snap0.resolved.find((i) => i.id === resolved.id);
  ok(prevRes && prevRes.detailTruncated && has(prevRes.detail), 'setup: the snapshot previews the resolved item\'s detail (300 chars, with the marker)');
  const fullById = new Map([[resolved.id, LONG], [mineItem.id, LONG]]); // what a client kept whole
  const n0 = todosBroadcasts;
  const r = await OWNER_APP.call('POST', '/api/records/clear-many', { body: { items: [{ kind: 'todo', id: mineItem.id }, { kind: 'todo', id: resolved.id }] } });
  ok(r.status === 200 && r.body.cleared === 2 && todosBroadcasts === n0 + 1, 'the owner clears an open and a resolved item: one save, ONE user-todos-updated broadcast', r.body);
  const s1 = lastTodos;
  const o = [...s1.open, ...s1.resolved].find((i) => i.id === mineItem.id), rr = s1.resolved.find((i) => i.id === resolved.id);
  ok(o.text === CT && o.detail === null && o.options === null && o.reply === null && o.status === 'done' && o.resolvedBy === 'reply' && o.createdAt === mineItem.createdAt, 'the item: the sentence, no detail, no chips, no reply — its status, time and resolver kept', o);
  ok(rr && rr.text === CT && !rr.detailTruncated && rr.detail === null, 'the RESOLVED item\'s 300-char preview is gone with its detail', rr);
  ok(!has(s1.open.concat(s1.resolved).filter((i) => i.id !== othersItem.id)), '…every copy the broadcast carries of the cleared items is clean');
  const rd = L.restoreDetails(s1, fullById);
  ok(!has([...rd.todos.open, ...rd.todos.resolved].filter((i) => i.id !== othersItem.id)) && !rd.fullById.has(resolved.id) && !rd.fullById.has(mineItem.id), 'restoreDetails: a whole detail a client kept is NOT put back into a cleared item, and the client\'s map forgets it');
  userTodos.flush();
  const disk = fs.readFileSync(path.join(DATA, 'user-todos.json'), 'utf8');
  ok(!disk.includes(`Forward the ${MARK}`) && !disk.includes(LONG.slice(0, 40) + 'x'.repeat(10)) || !J(JSON.parse(disk).items.filter((i) => i.id === mineItem.id || i.id === resolved.id)).includes(MARK), 'data/user-todos.json on disk: the cleared items hold no marker');
  const refile = userTodos.add(ME, { text: CT, origin: 'agent' });
  ok(refile.id !== mineItem.id && !refile.existing, 'filing a text equal to the sentence never re-opens a cleared item (a cleared item is not a re-file\'s match)');
  const mine2 = userTodos.add(ME, { text: `agent item ${MARK}`, origin: 'agent' });
  const own = await AG.call('POST', '/api/agent/user-todo', { headers: asAgent('vsst_me'), body: { clear: mine2.id } });
  ok(own.status === 200 && own.body.cleared === 1 && userTodos.get(mine2.id).clearedBy === ME, 'an agent clears an item it filed itself (`{clear:id}` — vibespace-ask clear); clearedBy = its session key', own.body);
  const hlp = await AG.call('POST', '/api/agent/user-todo', { headers: asAgent('vsst_me'), body: { clear: helper.id } });
  ok(hlp.status === 403 && hlp.body.code === 'not_yours' && !userTodos.get(helper.id).clearedAt, 'a HELPER\'S PERMISSION ASK filed under its key by the server is not its own (403 not_yours)', hlp.body);
  const oth = await AG.call('POST', '/api/agent/user-todo', { headers: asAgent('vsst_me'), body: { clear: othersItem.id } });
  ok(oth.status === 403 && oth.body.code === 'not_yours', 'another session\'s item is refused by name', oth.body);
  const S = await stubServer(AG);
  try {
    const x = userTodos.add(ME, { text: `cli item ${MARK}`, origin: 'agent' });
    const c = await runCli('vibespace-ask', ['clear', x.id], S.url, 'vsst_me');
    ok(c.code === 0 && /cleared/.test(c.out) && userTodos.get(x.id).text === CT, 'the REAL `vibespace-ask clear <id>`', c.out + c.err);
    const h = await runCli('vibespace-ask', ['--help'], S.url, 'vsst_me');
    ok(/vibespace-ask clear <id>/.test(h.out), 'its usage names the verb');
  } finally { await S.close(); }
}

// ── §3 STATUS ──
console.log('§3 session-status history');
{
  const tick = () => new Promise((r) => setTimeout(r, 3));
  sessionStatus.setByAgent(ME, { state: 'blocked', reason: `waiting on ${MARK}`, detail: `the ${MARK} mail says …` }); await tick();
  sessionStatus.setByUser(ME, { state: 'working', urgency: 'normal' }); await tick(); // an override: the notice quotes the agent's reason
  sessionStatus.setByAgent(ME, { state: 'blocked', reason: `still ${MARK}`, detail: `the ${MARK} mail again` }); await tick();
  const hist = sessionStatus.history(ME);
  const targets = hist.filter((h) => has(h.reason));
  ok(targets.length === 2 && has(sessionStatus.get(ME)) && sessionStatus.pendingNotices(ME).some((n) => has(n.agent && n.agent.reason)), 'setup: two history entries, the current record and a queued override notice carry the marker');
  const hr = await AG.call('GET', '/api/session-status/history', { query: { sessionKey: `${ME},webui:cw-me` } });
  ok(hr.body.key === ME && hr.body.history.length === hist.length, 'the history route names the key its entries sit under (a clear addresses an entry by key + time)', hr.body.key);
  const n0 = statusBroadcasts;
  const r = await OWNER_APP.call('POST', '/api/records/clear-many', { body: { items: targets.map((h) => ({ kind: 'status', sessionKey: ME, id: String(h.at) })) } });
  ok(r.status === 200 && r.body.cleared === 2 && statusBroadcasts === n0 + 1, 'the owner clears both entries by (key, at): one save, ONE session-status-updated broadcast', r.body);
  // verify r5 (reproduced in chrome): the broadcast NAMES what the clear touched — ids only — because its statuses map can be
  // exactly what every client already holds (a cleared entry that is not the current status), which a client's change guard drops
  ok(lastStatusExtra && J(lastStatusExtra) === J({ cleared: [{ key: ME, ats: targets.map((h) => h.at) }] }) && !has(lastStatusExtra), 'the broadcast carries `cleared: [{key, ats}]` (ids only — no word): the entries it touched, whatever the current record did', lastStatusExtra);
  const h2 = sessionStatus.history(ME);
  ok(!has(h2) && h2.filter((h) => h.clearedAt).length === 2 && h2.length === hist.length && J(h2.map((h) => [h.state, h.at, h.setBy])) === J(hist.map((h) => [h.state, h.at, h.setBy])), 'the history keeps every entry, its state, time and setter; the words are the sentence');
  ok(!has(sessionStatus.get(ME)) && sessionStatus.get(ME).reason === CT && sessionStatus.get(ME).clearedAt, 'the CURRENT record (the card chips, "Now", vibespace-msg list) no longer says it');
  const rendered = SessionStatusManager.renderNotices(sessionStatus.pendingNotices(ME));
  ok(!has(rendered) && rendered.includes(CT), 'the queued override notice — injected into the agent\'s next turn — quotes the sentence, never the words', rendered.slice(0, 200));
  sessionStatus.flush();
  ok(!fs.readFileSync(path.join(DATA, 'session-status.json'), 'utf8').includes(MARK), 'data/session-status.json on disk holds no marker');
  ok((await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'status', sessionKey: ME, id: '123' } })).status === 404, 'an entry at an unknown time is 404');
  // verify r1: an entry set with `--detail` and NO reason (`vibespace-status blocked --detail "…"`) — the
  // history entry was cleared, the CURRENT record kept its detail (the "Now" row's expander, GET /api/session-status)
  sessionStatus.setByAgent(ME, { state: 'blocked', detail: `only a detail: ${MARK}` }); await tick();
  const dOnly = sessionStatus.history(ME).find((h) => !h.reason && has(h.detail));
  ok(dOnly && has(sessionStatus.get(ME).detail) && !sessionStatus.get(ME).reason, 'setup: a detail-only entry; the current record repeats its detail and has no reason');
  const rd = await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'status', sessionKey: ME, id: String(dOnly.at) } });
  const cur = sessionStatus.get(ME);
  ok(rd.status === 200 && rd.body.cleared === 1 && !has(cur) && cur.detail === null && cur.clearedAt && cur.state === 'blocked', 'a detail-only entry: the CURRENT record\'s detail goes with it (its reason OR its detail repeats the entry — verify r1)', cur);
  // NEGATIVE CONTROL: the door with the reason-only match (the pre-fix rule) leaves the current detail
  const SS_REL = 'src/session-status.js', SS_SRC = fs.readFileSync(path.join(ROOT, SS_REL), 'utf8');
  const NEW_RULE = "if (rec && ((oldReason && rec.reason === oldReason) || (oldDetail && rec.detail === oldDetail))) applyClear(rec, { kind: 'status', by, at });";
  const OLD_RULE = "if (rec && oldReason && rec.reason === oldReason && (!oldDetail || !rec.detail || rec.detail === oldDetail)) applyClear(rec, { kind: 'status', by, at });";
  ok(SS_SRC.split(NEW_RULE).length === 2, 'the current-record match is present once (the control swaps exactly it)');
  const PRE = MUT.load(SS_REL, SS_SRC.replace(NEW_RULE, OLD_RULE), 'reason-only-match');
  const preDir = path.join(DIR, 'status-pre'); fs.mkdirSync(preDir, { recursive: true });
  const pre = new PRE.SessionStatusManager({ dataDir: preDir, onChange: () => {} });
  pre.setByAgent(ME, { state: 'blocked', detail: `only a detail: ${MARK}` });
  const preAt = pre.history(ME)[0].at;
  const preOut = pre.clearHistory(ME, [preAt], { by: 'owner', at: Date.now() });
  ok(preOut.cleared.length === 1 && !has(pre.history(ME)) && has(pre.get(ME).detail), 'NEGATIVE CONTROL: with the reason-only match the history entry is cleared but the CURRENT record keeps the marker — the leg above would go red', pre.get(ME));
}

// ── §3b verify r4 (time and order): a clear is ON DISK before the owner is told ──
// The For-you and status stores persist through a 500 ms debounce flushed on SIGTERM only; the door answered from memory
// and a SIGKILL / OOM inside the window brought the words back at the next boot (the route had said "cleared", the
// dialog "cannot be undone"). The door now writes synchronously BEFORE its broadcast: the leg reads the file at the
// broadcast instant and again from a fresh manager (= the next boot) with no flush in between.
console.log('§3b a clear is on disk before the broadcast (For-you + status, verify r4)');
{
  const UT_REL = 'src/user-todos.js', UT_SRC = fs.readFileSync(path.join(ROOT, UT_REL), 'utf8');
  const SS_REL = 'src/session-status.js', SS_SRC = fs.readFileSync(path.join(ROOT, SS_REL), 'utf8');
  // the status door's broadcast names what it cleared since verify r5 (`_notify({ cleared })`) — the write rule is the same
  const NEW_WRITE = 'if (out.cleared.length) { this._save(); this.flush(); this._notify(); }';
  const OLD_WRITE = 'if (out.cleared.length) { this._save(); this._notify(); }';
  const NEW_WRITE_SS = 'if (out.cleared.length) { this._save(); this.flush(); this._notify({ cleared: [{ key, ats: out.cleared.slice() }] }); }';
  const OLD_WRITE_SS = 'if (out.cleared.length) { this._save(); this._notify({ cleared: [{ key, ats: out.cleared.slice() }] }); }';
  const drive = (UTM, SSM, tag) => {
    const dir = path.join(DATA, 'durable-' + tag); fs.mkdirSync(dir, { recursive: true });
    const r = {};
    let armed = false;
    const ut = new UTM.UserTodoManager({ dataDir: dir, expirySweepMs: 0, onChange: () => { if (armed) r.todoDiskAtBroadcast = fs.readFileSync(path.join(dir, 'user-todos.json'), 'utf8'); } });
    const it = ut.add(ME, { text: `the ${MARK} thread`, detail: `${MARK} detail`, origin: 'agent' });
    ut.flush();   // the item is on disk, as the add's own debounce would have left it
    armed = true;
    r.todo = ut.clearItems([it.id], { by: 'owner' });
    r.todoDisk = fs.readFileSync(path.join(dir, 'user-todos.json'), 'utf8');
    const ss = new SSM.SessionStatusManager({ dataDir: dir, onChange: () => { if (armed) r.statusDiskAtBroadcast = fs.readFileSync(path.join(dir, 'session-status.json'), 'utf8'); } });
    armed = false;
    ss.setByAgent(ME, { state: 'blocked', reason: `waiting on ${MARK}` });
    ss.flush();
    armed = true;
    const at = ss.history(ME)[0].at;
    r.status = ss.clearHistory(ME, [at], { by: 'owner' });
    r.statusDisk = fs.readFileSync(path.join(dir, 'session-status.json'), 'utf8');
    // the next boot after a SIGKILL right now: fresh managers over the same files, no flush in between
    const ut2 = new UTM.UserTodoManager({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 });
    const ss2 = new SSM.SessionStatusManager({ dataDir: dir, onChange: () => {} });
    r.todoAfterKill = ut2.get(it.id);
    r.statusAfterKill = ss2.history(ME)[0];
    // the in-memory managers' pending debounce timers must not fire into a removed dir: cancel them, never flush
    for (const m of [ut, ss]) { if (m._writeTimer) { clearTimeout(m._writeTimer); m._writeTimer = null; } }
    try { ut2.stop(); } catch { }
    return r;
  };
  const real = drive({ UserTodoManager }, { SessionStatusManager }, 'real');
  ok(real.todo.cleared.length === 1 && !has(real.todoDisk) && real.todoDiskAtBroadcast !== undefined && !has(real.todoDiskAtBroadcast),
    'For-you: when clearItems answers, data/user-todos.json already holds no marker — and it held none at the broadcast instant', real.todoDisk.slice(0, 200));
  ok(real.todoAfterKill && real.todoAfterKill.text === CT && real.todoAfterKill.detail === null && real.todoAfterKill.clearedAt, 'For-you: a SIGKILL right after the answer — the next boot reads the sentence, never the words', real.todoAfterKill);
  ok(real.status.cleared.length === 1 && !has(real.statusDisk) && real.statusDiskAtBroadcast !== undefined && !has(real.statusDiskAtBroadcast),
    'status: when clearHistory answers, data/session-status.json already holds no marker — and it held none at the broadcast instant', real.statusDisk.slice(0, 200));
  ok(real.statusAfterKill && real.statusAfterKill.reason === CT && real.statusAfterKill.clearedAt, 'status: a SIGKILL right after the answer — the next boot reads the sentence', real.statusAfterKill);
  ok(UT_SRC.split(NEW_WRITE).length === 2 && SS_SRC.split(NEW_WRITE_SS).length === 2, 'each door writes synchronously once (the control swaps exactly it)');
  // NEGATIVE CONTROL: the door with the debounced write only (the pre-r4 rule) — the words are on disk at the answer and come back
  const PRE_UT = MUT.load(UT_REL, UT_SRC.replace(NEW_WRITE, OLD_WRITE), 'todo-clear-debounced');
  const PRE_SS = MUT.load(SS_REL, SS_SRC.replace(NEW_WRITE_SS, OLD_WRITE_SS), 'status-clear-debounced');
  const pre = drive(PRE_UT, PRE_SS, 'pre');
  ok(has(pre.todoDisk) && has(pre.todoAfterKill) && has(pre.statusDisk) && has(pre.statusAfterKill),
    'NEGATIVE CONTROL: with the debounced write only, both files still hold the marker when the door answers and a kill brings the words back — the legs above would go red', { todo: pre.todoAfterKill && pre.todoAfterKill.text, status: pre.statusAfterKill && pre.statusAfterKill.reason });
}

// ── §4 JOBS ──
console.log('§4 Background Work');
{
  ok(jm.ready && jm.jobs.has(PARENT) && jm.jobs.has(CHILD) && jm.archivedById(ARCHIVED), 'setup: the engine loaded a cron family (parent + run) and an ARCHIVED run');
  jm.announce(jm.jobs.get(PARENT), `the ${MARK} digest found 3 mails`);
  ok(jm.events.some((e) => has(e)), 'setup: the viewers\' event ring holds the marker (an announce)');
  // verify r1: the `--notify` cron's own path — _notifyOwner(job, {what: a.text || job.name}) — holds the
  // action's OWN words as the notification's text (no `announced:` prefix); the §1 task-context call
  // drained the seeded stash, so this entry is planted here, through the engine
  jm._notifyOwner(jm.jobs.get(PARENT), { what: jm.jobs.get(PARENT).action.text }); await new Promise((r) => setTimeout(r, 30));
  ok([...(jm.pendingNotifs.get(ME_CID) || [])].some((n) => n.jobId === PARENT && !String(n.text).startsWith('announced:') && has(n.text)), 'setup: a held notification whose text is the notify action\'s own words', jm.pendingNotifs.get(ME_CID));
  // a For-you item the jobs producer filed (the job's name in its words and its label)
  jm.d.notifyUser({ text: `mail digest ${MARK} needs your input`, urgency: 'normal', jobId: CHILD, jobName: `mail digest ${MARK}`, ownerCid: ME_CID });
  const jobItem = [...userTodos.snapshot().open].find((i) => i.jobId === CHILD);
  ok(jobItem && has(jobItem.sessionName) && jobItem.origin === 'jobs', 'setup: a Background Work For-you item names the job (text + label)');
  const viewer = { isUser: false, conversationId: ME_CID, sessionId: 'cw-me', groups: new Set(['T-260928-work']) };
  ok(has(jm.digestFor(viewer, 0)) || has(jm.updatesFor(viewer, 0)), 'setup: the digest / updates injected to a viewer carry the marker');
  // ARCHIVE FIRST: a failed archive write changes nothing anywhere
  const real = jm._writeArchive.bind(jm);
  jm._writeArchive = () => ({ ok: false, error: 'EROFS (planted)' });
  const failed = await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'job', id: PARENT } });
  ok(failed.status === 500 && failed.body.code === 'failed' && has(jm.jobs.get(PARENT).name) && has(jm.archivedById(ARCHIVED)), 'ARCHIVE FIRST: when the archive write fails the clear is refused (500 failed) and NOTHING changed — registry, archive, ring', failed.body);
  jm._writeArchive = real;
  const n0 = jobsBroadcasts.length;
  const r = await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'job', id: PARENT } });
  ok(r.status === 200 && r.body.cleared >= 3, `the owner clears the cron job: the parent, its run in the registry, its run in the ARCHIVE and the job's For-you item (${r.body.cleared})`, r.body);
  const bc = jobsBroadcasts.slice(n0).filter((m) => m.type === 'jobs-updated' && Array.isArray(m.cleared));
  ok(bc.length === 1 && J(bc[0].cleared.slice().sort()) === J([PARENT, CHILD, ARCHIVED].sort()), 'ONE jobs-updated broadcast naming every cleared record', bc.map((m) => m.cleared));
  const P = jm.jobs.get(PARENT), C = jm.jobs.get(CHILD), A = jm.archivedById(ARCHIVED);
  ok(P.name === CT && P.context === null && P.note === null && P.progress === null && P.action.text === CT && P.lastNotify.reason === null && P.notifyLog[0].reason === null && J(P.cmd) === J({ argv: ['sh', '-c', 'true'], cwd: DIR }) && P.clearedBy === 'owner', 'the parent: name/note/context/progress/notify text/delivery reasons cleared; the COMMAND kept');
  ok(C.name === CT && C.runs[0].lastLine === null && C.cronParent === PARENT && A.name === CT && A.runs[0].lastLine === null && A.archivedWhy === 'done', 'its runs — live and archived — lose their names and last log lines, keep the rest');
  ok(!jm.events.some((e) => e.jobId === PARENT && has(e)) && !has(jm.updatesFor(viewer, 0)) && !has(jm.digestFor(viewer, 0)), 'the viewers\' event ring, the updates block and the digest injected to agents carry no marker');
  ok(!has([...jm.pendingNotifs.values()]), 'the conversation\'s held notification stash (drained into its next turn) carries no marker');
  const held = [...jm.pendingNotifs.values()].flat().filter((n) => n.jobId === PARENT);
  ok(held.length === 2 && held.every((n) => n.text === CT && n.jobName === CT), 'EVERY held notification of the cleared job reads the sentence — the announce AND the notify action\'s own words (verify r1: only the announced prefix was rewritten before)', held);
  const stashText = jobModel.renderNotifStash([...jm.pendingNotifs.get(ME_CID)]);
  ok(!has(stashText) && stashText.includes(CT), 'the block the owner conversation is injected with on its next turn (renderNotifStash) carries no marker', stashText);
  const spill = fs.readFileSync(SPILL, 'utf8');
  ok(!has(spill) && spill.includes(`${PARENT} ${CT}`) && spill.includes(`${FOREIGN} someone else's job: done`), 'the drained-notification spill file: the job\'s lines keep time + id and lose their words; another job\'s line untouched', spill);
  const snap = await (async () => { const g = fakeApp(); jobsWiring.create; return jm.snapshot(C, { tail: 5 }); })();
  ok(snap.logTail === '' && snap.name === CT && snap.clearedAt && !has(snap), 'a cleared job\'s snapshot serves NO log tail (the run\'s log file keeps the process\'s own output, like a transcript)', snap.logTail);
  ok(snap.logWithheld === true, 'verify r2: …and SAYS it withheld it (`logWithheld`) — an empty tail read as "(no log)", as if the run printed nothing', snap);
  {
    // the REAL `vibespace-job` CLI prints the withheld log as withheld (a stub server answering with the engine's own snapshot)
    const port = await freePort();
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const m = /^\/api\/agent\/jobs\/([^/]+)$/.exec(u.pathname);
      const j = m && (jm.jobs.get(decodeURIComponent(m[1])) || jm.archivedById(decodeURIComponent(m[1])));
      res.writeHead(j ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(J(j ? { job: jm.snapshot(j, { tail: Number(u.searchParams.get('tail')) || 0 }) } : { error: 'no such job' }));
    });
    await new Promise((r) => srv.listen(port, '127.0.0.1', r));
    const url = `http://127.0.0.1:${port}`;
    const logs = await runCli('vibespace-job', ['logs', CHILD], url, 'vsst_me');
    ok(logs.code === 0 && /log withheld — this job's content was cleared/.test(logs.out) && !/\(no log\)/.test(logs.out) && !has(logs.out), '`vibespace-job logs` on a cleared job: "(log withheld — this job\'s content was cleared …)", never "(no log)", no marker', logs.out + logs.err);
    const poll = await runCli('vibespace-job', ['poll', CHILD], url, 'vsst_me');
    ok(poll.code === 0 && /log tail: \(withheld/.test(poll.out) && !has(poll.out), '`vibespace-job poll` says the tail is withheld too', poll.out + poll.err);
    // a run that STARTED after the clear is new output: served (a cron cleared once keeps its later logs)
    const C2 = jm.jobs.get(CHILD);
    const later = C2.clearedAt + 5;
    const dir2 = path.join(DATA, 'job-logs', CHILD, String(later));
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir2, 'current.log'), 'a later run: fresh output\n');
    C2.runs.push({ startedAt: later, trigger: 'cron', log: path.join(dir2, 'current.log'), endedAt: later + 10, exit: 0, cause: 'exit', lastLine: 'fresh output' });
    const snap2 = jm.snapshot(C2, { tail: 5 });
    ok(/fresh output/.test(snap2.logTail) && !snap2.logWithheld && !has(snap2), 'a run that started AFTER the clear serves its own log (new words, not the cleared ones)', snap2);
    const logs2 = await runCli('vibespace-job', ['logs', CHILD], url, 'vsst_me');
    ok(logs2.code === 0 && /fresh output/.test(logs2.out) && !/withheld/.test(logs2.out), '…and `vibespace-job logs` prints it', logs2.out + logs2.err);
    // NEGATIVE CONTROL: the pre-fix snapshot rule (any clearedAt ⇒ an empty tail, no flag) — driven on a
    // bare instance of the patched class over the same records: withheld unsaid, and the later run's log hidden
    const JB_REL2 = 'src/jobs.js', JB_SRC2 = fs.readFileSync(path.join(ROOT, JB_REL2), 'utf8');
    const NEW_SNAP = "if (tail && run && job.clearedAt && !((run.startedAt || 0) > job.clearedAt)) { out.logTail = ''; out.logWithheld = true; }";
    ok(JB_SRC2.split(NEW_SNAP).length === 2, 'the snapshot\'s withheld rule is present once (the control swaps exactly it)');
    const PRE2 = MUT.load(JB_REL2, JB_SRC2.replace(NEW_SNAP, "if (tail && run && job.clearedAt) out.logTail = '';"), 'withheld-unsaid-and-forever');
    const bare2 = Object.assign(Object.create(PRE2.JobManager.prototype), { d: { dataDir: DATA, broadcast() {}, log() {} }, logsDir: path.join(DATA, 'job-logs') });
    const preNew = bare2.snapshot(C2, { tail: 5 }); // the later run is the job's last run here
    const laterRun = C2.runs.pop();
    const preOld = bare2.snapshot(C2, { tail: 5 }); // …and here the run the clear covered is
    C2.runs.push(laterRun);
    ok(preOld.logTail === '' && !preOld.logWithheld && preNew.logTail === '' && !preNew.logWithheld, 'NEGATIVE CONTROL: the pre-fix rule serves an unexplained empty tail and hides the later run\'s log too — the two legs above would go red', { preOld: preOld.logWithheld, preNew: preNew.logTail });
    C2.runs.pop();
    await new Promise((r) => srv.close(r));
  }
  const arc = jm.snapshotArchived(A);
  const liveKeys = Object.keys(jm.snapshot(C)).sort().join(','), arcKeys = Object.keys(arc).filter((k) => !['archived', 'archivedAt', 'archivedWhy'].includes(k)).sort().join(',');
  ok(liveKeys === arcKeys && 'clearedAt' in arc && 'clearedBy' in arc, 'the live and archived snapshots carry the same keys (clearedAt/clearedBy included — test-jobs-triage parity)');
  const cleaned = userTodos.get(jobItem.id);
  ok(cleaned.text === CT && cleaned.sessionName === null && cleaned.jobId === CHILD && cleaned.clearedBy === 'owner', 'THE CASCADE: the job\'s For-you item is cleared too — its words and the job name in its label', cleaned);
  jm._save();
  ok(!fs.readFileSync(path.join(DATA, 'jobs.json'), 'utf8').includes(MARK) && !fs.readFileSync(path.join(DATA, 'jobs-archive.json'), 'utf8').includes(MARK) && !fs.readFileSync(path.join(DATA, 'job-notifications.json'), 'utf8').includes(MARK), 'data/jobs.json, data/jobs-archive.json and data/job-notifications.json on disk hold no marker');
  const agentJob = await recordClear.clear({ kind: 'job', id: FOREIGN }, { caller: { role: 'agent', keys: [ME], conversationId: ME_CID, by: ME } });
  ok(!agentJob.ok && agentJob.code === 'not_yours', 'through the ONE entry point an agent may not clear another conversation\'s job', agentJob);
  // NEGATIVE CONTROL (verify r1): the door that rewrites only an `announced:` stash text (the pre-fix rule)
  // leaves a `--notify` reminder's words in the stash — driven on a bare instance of the patched class
  const JB_REL = 'src/jobs.js', JB_SRC = fs.readFileSync(path.join(ROOT, JB_REL), 'utf8');
  const NEW_STASH = "        n.jobName = CLEARED_TEXT;\n        n.text = CLEARED_TEXT;\n";
  const OLD_STASH = "        n.jobName = CLEARED_TEXT;\n        if (typeof n.text === 'string' && n.text.startsWith('announced:')) n.text = 'announced: ' + CLEARED_TEXT;\n";
  ok(JB_SRC.split(NEW_STASH).length === 2, 'the stash rewrite is present once (the control swaps exactly it)');
  const PRE = MUT.load(JB_REL, JB_SRC.replace(NEW_STASH, OLD_STASH), 'announced-only-stash');
  const bare = (Mod) => {
    const jmx = Object.create(Mod.JobManager.prototype);
    Object.assign(jmx, { d: { broadcast() {}, log() {} }, readOnly: false, jobs: new Map(), events: [], pendingNotifs: new Map(), archive: [], _dirty: false });
    jmx._loadArchive = () => []; jmx._writeArchive = () => ({ ok: true }); jmx._rewriteSpills = () => {}; jmx._save = () => {};
    jmx.jobs.set('jb-0000dd01', jobRec('jb-0000dd01', { name: `reminder ${MARK}`, action: { type: 'notify', text: `check the ${MARK} thread` } }));
    jmx.pendingNotifs.set(ME_CID, [{ jobId: 'jb-0000dd01', jobName: `reminder ${MARK}`, text: `check the ${MARK} thread`, ts: JT, urgency: 'low', held: { kind: 'not-reachable' } }]);
    const out = jmx.clearJobs(['jb-0000dd01'], { by: 'owner', at: Date.now() });
    return { out, stash: jmx.pendingNotifs.get(ME_CID) };
  };
  const realBare = bare(require(path.join(ROOT, JB_REL)));
  ok(realBare.out.cleared.length === 1 && realBare.stash[0].text === CT, 'the same bare drive on the REAL module: the notify reminder\'s held text is the sentence (the control\'s baseline)', realBare.stash);
  const preBare = bare(PRE);
  ok(preBare.out.cleared.length === 1 && has(preBare.stash[0].text) && preBare.stash[0].jobName === CT, 'NEGATIVE CONTROL: with the announced-only rewrite the held notification keeps the marker (the name went, the words stayed) — the stash leg above would go red', preBare.stash);
}

// ── §4b verify r3 (the reader-census round): six derived copies the walk found still holding words ──
console.log('§4b Background Work — verify r3: the ask panel, a covered run\'s finalize, the spill\'s continuation lines, a second clear, an in-flight stash, the ladder\'s stash');
{
  const JB_REL = 'src/jobs.js', JB_SRC = fs.readFileSync(path.join(ROOT, JB_REL), 'utf8');
  const RCM_REL = 'src/record-clear.js', RCM_SRC = fs.readFileSync(path.join(ROOT, RCM_REL), 'utf8');
  const UT_REL = 'src/user-todos.js', UT_SRC = fs.readFileSync(path.join(ROOT, UT_REL), 'utf8');
  const bareJm = (Mod, extra = {}) => {
    const jmx = Object.create(Mod.JobManager.prototype);
    Object.assign(jmx, { d: { dataDir: DATA, broadcast() {}, log() {}, ...extra }, readOnly: false, jobs: new Map(), events: [], pendingNotifs: new Map(), archive: [], _dirty: false, logsDir: path.join(DATA, 'job-logs'), waiters: new Map(), ansWaiters: new Map() });
    jmx._loadArchive = () => []; jmx._writeArchive = () => ({ ok: true }); jmx._save = () => {};
    return jmx;
  };
  // (a) THE ASK PANEL: a job awaiting the owner's answer to a panel whose words are the mailbox — the panel rode
  // GET /api/jobs/:id (`interaction`) and the answer dialog after a clear (the walk's finding)
  const ASK = 'jb-0000ee01';
  jm.jobs.set(ASK, jobRec(ASK, { name: 'asker', state: 'awaiting-user', interaction: { pending: { panel: { title: `About ${MARK}`, blocks: [{ type: 'markdown', text: `the ${MARK} thread asks: which quarter?` }, { type: 'buttons', options: ['ok'] }] }, version: 1, postedAt: JT, timeoutS: 1800 }, answers: [] } }));
  jm.d.notifyUser({ text: `asker needs your input`, urgency: 'normal', jobId: ASK, jobName: 'asker', ownerCid: ME_CID });
  const askItem = [...userTodos.snapshot().open].find((i) => i.jobId === ASK);
  ok(!!askItem && has(J(jm.jobs.get(ASK).interaction.pending)), 'setup: a job parked awaiting-user on a panel that carries the marker, and its open For-you ask');
  const ra = await OWNER_APP.call('POST', '/api/records/clear', { body: { kind: 'job', id: ASK } });
  const askJob = jm.jobs.get(ASK), askAfter = userTodos.get(askItem.id);
  ok(ra.status === 200 && askJob.interaction.pending === null && askJob.state === 'up' && !has(J(askJob)), 'the clear withdraws the ASK: `interaction.pending` gone, the job back to `up` (it may ask again), no marker anywhere in the record', { pending: askJob.interaction.pending, state: askJob.state });
  ok(askAfter.status !== 'open' && askAfter.text === CT, 'the ask\'s For-you item is resolved (the question was withdrawn) AND cleared by the cascade', askAfter);
  {
    const NEW_SHAPE = "['interaction.answers', 'empty'], ['interaction.pending', 'drop']]";
    ok(RCM_SRC.split(NEW_SHAPE).length === 2, 'the job shape names the pending panel once (the control swaps exactly it)');
    const PRE = MUT.load(RCM_REL, RCM_SRC.replace(NEW_SHAPE, "['interaction.answers', 'empty']]"), 'panel-kept');
    const rec = jobRec('jb-0000ee02', { name: 'asker2', state: 'awaiting-user', interaction: { pending: { panel: { title: `About ${MARK}`, blocks: [] }, version: 1 }, answers: [] } });
    const r = PRE.applyClear(rec, { kind: 'job', by: 'owner', at: Date.now() });
    ok(r.changed && has(J(rec.interaction.pending)), 'NEGATIVE CONTROL: the pre-r3 shape clears the name and keeps the panel\'s words — the leg above would go red', rec.interaction.pending);
  }
  // (b) a run the clear COVERED that ends after it: its finalize must not re-stamp the withheld log's last line
  const FIN = 'jb-0000ee03';
  const finAt = JT - 5000;
  const finDir = path.join(DATA, 'job-logs', FIN, String(finAt));
  fs.mkdirSync(finDir, { recursive: true });
  fs.writeFileSync(path.join(finDir, 'current.log'), `working\nSubject: ${MARK} salaries\n`);
  const drive = (Mod) => {
    const jmx = bareJm(Mod, { notifyUser() {} });
    const job = jobRec(FIN, { name: `sync ${MARK}`, state: 'up', runs: [{ startedAt: finAt, trigger: 'manual', log: path.join(finDir, 'current.log') }] });
    jmx.jobs.set(FIN, job);
    jmx._notifyOwner = () => {}; jmx._touch = () => {};
    const out = jmx.clearJobs([FIN], { by: 'owner', at: finAt + 1000 });
    jmx._finalizeRun(job, job.runs[0], { code: null, signal: 'SIGKILL', endedAt: finAt + 2000 }, 'stop');
    return { out, run: job.runs[0], snap: jmx.snapshot(job, { tail: 5 }) };
  };
  const finReal = drive(require(path.join(ROOT, JB_REL)));
  ok(finReal.out.cleared.length === 1 && finReal.run.endedAt && finReal.run.lastLine === null && finReal.snap.logWithheld === true && !has(finReal.snap), 'a run started before the clear and ended after it (a forced stop: the process\'s own last line) keeps NO last line — the withheld log stays withheld in every snapshot', { run: finReal.run, snap: finReal.snap.run });
  {
    const NEW_FIN = "run.lastLine = job.clearedAt && !((run.startedAt || 0) > job.clearedAt) ? null : this._lastLogLine(job, run);";
    ok(JB_SRC.split(NEW_FIN).length === 2, 'the finalize rule is present once (the control swaps exactly it)');
    const PRE = MUT.load(JB_REL, JB_SRC.replace(NEW_FIN, 'run.lastLine = this._lastLogLine(job, run);'), 'finalize-restamps');
    const pre = drive(PRE);
    ok(pre.out.cleared.length === 1 && has(pre.run.lastLine) && has(pre.snap), 'NEGATIVE CONTROL: the pre-r3 finalize re-publishes the withheld log\'s last line into the snapshot — the leg above would go red', pre.run.lastLine);
  }
  // (c) THE SPILL: a multi-line notification (an announce with newlines) — written on ONE line now; a legacy file's
  // continuation lines go with the entry they belong to
  const SP = 'jb-0000ee04';
  const legacy = path.join(DATA, 'job-notifications-read', 'legacy-cid.md');
  fs.writeFileSync(legacy, `\n## drained 2026-09-28T00:00:00.000Z\n- 2026-09-28T00:00:00.000Z ${SP} digest: announced: first line\nsecond line quotes ${MARK}\nthird line too ${MARK}\n- 2026-09-28T00:00:01.000Z ${FOREIGN} someone else's job: done\n`);
  jm._rewriteSpills(new Set([SP]));
  const legacyAfter = fs.readFileSync(legacy, 'utf8');
  ok(!has(legacyAfter) && legacyAfter.includes(`${SP} ${CT}`) && legacyAfter.includes(`${FOREIGN} someone else's job: done`), 'a legacy spill entry whose text ran over several lines loses every line of it; the next entry is untouched', legacyAfter);
  const spilled = jm.spillNotifs('one-line-cid', [{ ts: JT, jobId: SP, jobName: 'digest', text: `announced: line one\nline two ${MARK}\nline three` }]);
  const spillLines = fs.readFileSync(spilled, 'utf8').split('\n').filter((l) => l.includes(SP));
  ok(spillLines.length === 1 && spillLines[0].includes('⏎') && has(spillLines[0]), 'the spill writes a multi-line notification on ONE line (⏎ marks the breaks), so a later clear\'s line rewrite takes all of it');
  jm._rewriteSpills(new Set([SP]));
  ok(!has(fs.readFileSync(spilled, 'utf8')), '…and that clear does take it');
  {
    const NEW_SPILL = "if (!m) { if (dropping && l.trim() && !l.startsWith('## ')) { changed = true; return null; } dropping = false; return l; }";
    ok(JB_SRC.split(NEW_SPILL).length === 2, 'the continuation rule is present once (the control swaps exactly it)');
    const PRE = MUT.load(JB_REL, JB_SRC.replace(NEW_SPILL, 'if (!m) return l;'), 'spill-keeps-continuation');
    fs.writeFileSync(legacy, `- 2026-09-28T00:00:00.000Z ${SP} digest: announced: first line\nsecond line quotes ${MARK}\n`);
    const jmx = bareJm(PRE);
    jmx._rewriteSpills(new Set([SP]));
    ok(has(fs.readFileSync(legacy, 'utf8')), 'NEGATIVE CONTROL: the pre-r3 line rewrite keeps the continuation line\'s words — the leg above would go red');
  }
  // (d) A SECOND CLEAR of a job whose record was already cleared (it announced afterwards: the words live in the
  // ring / the stash / the spill, never in the record) still takes those words
  {
    const drive2 = (Mod) => {
      const jmx = bareJm(Mod);
      jmx._rewriteSpills = () => {};
      const job = jobRec('jb-0000ee05', { name: 'watcher' });
      jmx.jobs.set(job.id, job);
      jmx.clearJobs([job.id], { by: 'owner', at: JT });
      jmx.events.push({ ts: JT + 1, jobId: job.id, name: job.name, what: `announced: ${MARK} spotted`, verb: 'poll' });
      jmx.pendingNotifs.set(ME_CID, [{ jobId: job.id, jobName: job.name, text: `announced: ${MARK} spotted`, ts: JT + 1, urgency: 'low', held: { kind: 'not-reachable' } }]);
      const out = jmx.clearJobs([job.id], { by: 'owner', at: JT + 2 });
      return { out, ring: jmx.events, stash: jmx.pendingNotifs.get(ME_CID) };
    };
    const real2 = drive2(require(path.join(ROOT, JB_REL)));
    ok(real2.out.already.length === 1 && !real2.out.cleared.length && !has(real2.ring) && !has(real2.stash), 'a second clear answers `already` for the record and still rewrites the ring + the held stash', { out: real2.out, ring: real2.ring, stash: real2.stash });
    const NEW_EARLY = 'if (!out.cleared.length && !out.already.length) return out;';
    ok(JB_SRC.split(NEW_EARLY).length === 2, 'the early return is present once (the control swaps exactly it)');
    const PRE = MUT.load(JB_REL, JB_SRC.replace(NEW_EARLY, 'if (!out.cleared.length) return out;'), 'second-clear-skips-copies');
    const pre2 = drive2(PRE);
    ok(pre2.out.already.length === 1 && has(pre2.ring) && has(pre2.stash), 'NEGATIVE CONTROL: the pre-r3 door returns before the derived copies on `already` — the ring and the stash keep the words', { ring: pre2.ring });
  }
  // (e) a delivery IN FLIGHT when the owner cleared the job stashes afterwards with the words it captured
  {
    const drive3 = (Mod) => {
      const jmx = bareJm(Mod);
      const job = jobRec('jb-0000ee06', { name: 'flight', clearedAt: JT, clearedBy: 'owner' });
      jmx.jobs.set(job.id, job);
      jmx._stashNotif(ME_CID, job, { what: `announced: ${MARK} before`, at: JT - 1 }, 'not reachable');
      jmx._stashNotif(ME_CID, job, { what: `announced: fresh output`, at: JT + 1 }, 'not reachable');
      return jmx.pendingNotifs.get(ME_CID);
    };
    const st = drive3(require(path.join(ROOT, JB_REL)));
    ok(st.length === 2 && st[0].text === CT && st[0].jobName === CT && st[1].text === 'announced: fresh output', 'an event born BEFORE the clear is held as the sentence; one born after keeps its (new) words', st);
    const NEW_STALE = "const stale = job.clearedAt && !((ev && ev.at) > Math.max(job.clearedAt, job.reclearedAt || 0));";
    ok(JB_SRC.split(NEW_STALE).length === 2, 'the stale rule is present once (the control swaps exactly it)');
    const PRE = MUT.load(JB_REL, JB_SRC.replace(NEW_STALE, 'const stale = false;'), 'in-flight-stash-raw');
    const pre = drive3(PRE);
    ok(has(pre[0].text), 'NEGATIVE CONTROL: without the rule the in-flight delivery stashes the pre-clear words', pre[0]);
  }
  // (f) THE LADDER'S OWN STASH (data/msg-stash.json): a codex owner conversation's wrapper hands a notification / a
  // group wake it could not queue back to the ladder WHOLE; a clear of the job / the message reaches that file
  {
    const DELIVER = require(path.join(ROOT, 'src/server/conversation-deliver.js'));
    const ldir = path.join(DATA, 'ladder'); fs.mkdirSync(ldir, { recursive: true });
    const ladder = DELIVER.create({ dataDir: ldir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
    ladder.stashFor('codex-owner', { source: 'agent', kind: 'notification', fromName: `Background Work · ledger ${MARK}`, text: `[Background Work] ledger ${MARK} (jb-0000ee07): announced: ${MARK} found` });
    ladder.stashFor('codex-owner', { source: 'agent', kind: 'notification', fromName: 'Background Work · other job', text: 'other job: done' });
    const drive4 = (Mod) => {
      const jmx = bareJm(Mod, { redactStash: (match) => ladder.redactStash(match) });
      jmx._rewriteSpills = () => {};
      const job = jobRec('jb-0000ee07', { name: `ledger ${MARK}` });
      jmx.jobs.set(job.id, job);
      return jmx.clearJobs([job.id], { by: 'owner', at: JT });
    };
    const r4 = drive4(require(path.join(ROOT, JB_REL)));
    ladder.flush();
    const onDisk = fs.readFileSync(path.join(ldir, 'msg-stash.json'), 'utf8');
    const q2 = ladder.drainStash('codex-owner');
    ok(r4.cleared.length === 1 && !has(onDisk) && q2.length === 2 && q2[0].text === CT && q2[0].fromName === 'Background Work · ' + CT && q2[1].text === 'other job: done', 'the ladder\'s held entry filed under the cleared job\'s name loses its words (on disk too); another job\'s entry is untouched', q2);
    const NEW_LADDER = 'try { if (this.d.redactStash) this.d.redactStash(';
    ok(JB_SRC.split(NEW_LADDER).length === 2, 'the ladder rewrite is present once (the control removes exactly it)');
    const PRE = MUT.load(JB_REL, JB_SRC.replace(NEW_LADDER, 'try { if (false) this.d.redactStash('), 'ladder-stash-kept');
    ladder.stashFor('codex-owner', { source: 'agent', kind: 'notification', fromName: `Background Work · ledger ${MARK}`, text: `announced: ${MARK} again` });
    drive4(PRE);
    ok(has(ladder.drainStash('codex-owner')), 'NEGATIVE CONTROL: without the rewrite the ladder\'s stash keeps the job\'s words');
    // …and a GROUP WAKE handed back: every line of the held report that repeats a cleared record's words
    const gStore2 = createChannelStore({ dir: path.join(DATA, 'channels2') });
    let gt2 = Date.now() - 300e3;
    const mkGroups = (Mod) => Mod.create({ store: gStore2, deliver: ladder, broadcast: () => {}, now: () => (gt2 += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
    const g2 = mkGroups(GE);
    const made = await g2.create({ by: G.OWNER, name: 'wake', members: [ME_CID, OTHER_CID], quiet: true, consent: () => ({ ok: true }) });
    const p1 = await g2.post({ group: made.group.id, from: ME_CID, text: `the ${MARK} sheet:   totals   attached` });
    await g2.post({ group: made.group.id, from: ME_CID, text: 'and a plain line' });
    const report = G.reportFor(gStore2.groups.live().groups[made.group.id], gStore2.readTail('groups', made.group.id, { limit: 50 }), OTHER_CID, { budget: 4096, lead: 'You were @mentioned' });
    ok(report && has(report.text) && report.text.includes('and a plain line'), 'setup: a wake report (the text a codex wrapper would hand back) carries the marker');
    ladder.stashFor(OTHER_CID, { source: 'agent', kind: 'peer', fromName: `me · wake`, text: report.text });
    const rc = await g2.clearMessages({ group: made.group.id, ids: [p1.message.vendorId], by: G.OWNER });
    const held = ladder.drainStash(OTHER_CID);
    ok(rc.ok && rc.cleared.length === 1 && held.length === 1 && !has(held[0].text) && held[0].text.includes(CT) && held[0].text.includes('and a plain line') && held[0].text.includes(`(${made.group.id})`), 'the held report: the cleared record\'s line reads the sentence, the other record\'s line and the head stay', held[0] && held[0].text);
    const GE_REL = 'src/server/groups-engine.js', GE_SRC = fs.readFileSync(path.join(ROOT, GE_REL), 'utf8');
    const NEW_GL = "try { if (deliver && typeof deliver.redactStash === 'function') deliver.redactStash(";
    ok(GE_SRC.split(NEW_GL).length === 2, 'the groups door\'s ladder rewrite is present once (the control removes exactly it)');
    const PRE_G = MUT.load(GE_REL, GE_SRC.replace(NEW_GL, "try { if (false) deliver.redactStash("), 'group-ladder-stash-kept');
    const g3 = mkGroups(PRE_G);
    // the held report is written BEFORE its record is cleared (verify r4: every write is judged against the clears so
    // far — a report written after p1's clear reads the sentence on p1's line at once; this control isolates the DOOR's
    // rewrite of what is already held, so the report carries p3's words and is stashed while p3 is still whole)
    const p3 = await g3.post({ group: made.group.id, from: ME_CID, text: `still ${MARK} here` });
    const report3 = G.reportFor(gStore2.groups.live().groups[made.group.id], gStore2.readTail('groups', made.group.id, { limit: 50 }), OTHER_CID, { budget: 4096, lead: 'You were @mentioned' });
    ladder.stashFor(OTHER_CID, { source: 'agent', kind: 'peer', fromName: `me · wake`, text: report3.text });
    ok(has(ladder.stashEntries(OTHER_CID)), 'setup: a report stashed while its record is whole carries the words');
    await g3.clearMessages({ group: made.group.id, ids: [p3.message.vendorId], by: G.OWNER });
    ok(has(ladder.drainStash(OTHER_CID)), 'NEGATIVE CONTROL: without the rewrite a held report keeps the cleared record\'s words');
    gStore2.close();
  }
  // (f3) THE STASH HAND-OVER'S MEMORY (the lane-redact merge onto 2.369.196; data/stash-handover.json): a delivered
  // hand-over keeps its ORIGINAL entries (the ladder's + the jobs store's) and its frame for 24 h, so a frame the wrapper
  // hands back is restored as itself — a copy of the same words. The ladder's door asks the memory with the SAME match +
  // the jobs door's ids: every original of a cleared job / message reads the sentence, a touched record keeps only its
  // frame's DIGEST (the echo is still recognised and restores the CLEARED originals), a spent record is judged by its frame.
  {
    const DELIVER = require(path.join(ROOT, 'src/server/conversation-deliver.js'));
    const SH_REL = 'src/server/stash-handover.js';
    const SH = require(path.join(ROOT, SH_REL));
    const CD_REL = 'src/server/conversation-deliver.js', CD_SRC = fs.readFileSync(path.join(ROOT, CD_REL), 'utf8');
    const JB_REL3 = 'src/jobs.js', JB_SRC3 = fs.readFileSync(path.join(ROOT, JB_REL3), 'utf8');
    const JOB3 = 'jb-0000ee11';
    const note = (id, words) => ({ jobId: id, jobName: `ledger ${words}`, text: `announced: ${words} totals`, ts: JT - 5e3, urgency: 'low' });
    const frameOf = (id, lines) => `VibeSpace (this workspace, not another agent) reports:\nThe user handed over the ${lines.length} notice(s) that were waiting for your next turn (hand-over ${id}):\n\n${lines.join('\n')}`;
    const seed = (dir) => {
      fs.mkdirSync(dir, { recursive: true });
      const live = frameOf('ho-aaaa-0001', [`- 09-28 10:00 ${JOB3} ledger ${MARK}: announced: ${MARK} totals`, '- 09-28 10:01 jb-0000ee12 other: done']);
      const spent = frameOf('ho-aaaa-0002', [`- 09-28 09:00 ${JOB3} ledger ${MARK}: announced: ${MARK} earlier`]);
      const other = frameOf('ho-aaaa-0003', ['- 09-28 09:30 jb-0000ee12 other: done']);
      fs.writeFileSync(path.join(dir, SH.DELIVERED_FILE), JSON.stringify({
        'ho-aaaa-0001': { cid: ME_CID, at: Date.now() - 1000, text: live, msg: [], jobs: [note(JOB3, MARK), note('jb-0000ee12', 'other')] },
        'ho-aaaa-0002': { cid: ME_CID, at: Date.now() - 2000, text: spent, msg: [], jobs: [], restored: 1 },
        'ho-aaaa-0003': { cid: ME_CID, at: Date.now() - 3000, text: other, msg: [], jobs: [] },
      }));
      return { live, spent, other };
    };
    const drive = (tag, { cdMod = DELIVER, jbMod = require(path.join(ROOT, JB_REL3)) } = {}) => {
      const dir = path.join(DATA, 'handover-' + tag);
      const frames = seed(dir);
      const ladder = cdMod.create({ dataDir: dir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
      const restored = [];
      const jmx = bareJm(jbMod, { redactStash: (match, scope) => ladder.redactStash(match, scope) });
      jmx._rewriteSpills = () => {};
      jmx.restoreNotifs = (cid, items) => { restored.push(...items); return items.length; };
      const view = SH.create({ activeSessions: new Map(), getDeliver: () => ladder, getJobs: () => jmx, renderMsgStash: () => ({ text: '', shown: [], rest: [] }), renderNotifStash: () => '', log: { log() {}, warn() {} }, dataDir: dir });
      if (typeof ladder.registerRedactor === 'function') ladder.registerRedactor((match, scope) => view.redactDelivered(match, scope));
      const job = jobRec(JOB3, { name: `ledger ${MARK}` });
      jmx.jobs.set(job.id, job);
      const out = jmx.clearJobs([job.id], { by: 'owner', at: JT });
      const disk = fs.readFileSync(path.join(dir, SH.DELIVERED_FILE), 'utf8');
      const echo = view.restoreHandedOver(ME_CID, frames.live, {});
      return { out, disk, mem: JSON.parse(disk), echo, restored, frames };
    };
    const r = drive('real');
    ok(r.out.cleared.length === 1 && !has(r.disk), 'a job clear reaches the hand-over memory on disk: no record, original or frame there still carries the cleared job\'s words', r.disk.slice(0, 400));
    ok(!('text' in r.mem['ho-aaaa-0001']) && /^[0-9a-f]{64}$/.test(r.mem['ho-aaaa-0001'].textSha) && r.mem['ho-aaaa-0001'].jobs[0].text === CT && r.mem['ho-aaaa-0001'].jobs[0].jobName === CT && r.mem['ho-aaaa-0001'].jobs[1].text === 'announced: other totals',
      'the live record: its cleared job\'s original reads the sentence, another job\'s original keeps its words, the frame is kept as its DIGEST only', r.mem['ho-aaaa-0001']);
    ok(!('text' in r.mem['ho-aaaa-0002']) && typeof r.mem['ho-aaaa-0002'].textSha === 'string' && typeof r.mem['ho-aaaa-0003'].text === 'string' && r.mem['ho-aaaa-0003'].text === r.frames.other,
      'a SPENT record (originals already restored) is judged by its frame: it names the cleared job, so only its digest stays; an untouched record keeps its exact frame (master\'s rule)');
    ok(r.echo === 2 && r.restored.length === 2 && r.restored[0].text === CT && !has(J(r.restored)),
      'the wrapper handing the frame back still restores it by its digest — as the CLEARED originals, never the words it carried', { echo: r.echo, restored: r.restored });
    // CONTROL ①: the ladder without the holders' pass (the merge as it first built) — the memory keeps the words on disk
    const NEW_PASS = "for (const fn of redactors) { try { fn(match, scope || {}); }";
    ok(CD_SRC.split(NEW_PASS).length === 2, 'the ladder asks its registered holders once (the control removes exactly it)');
    const PRE_CD = MUT.load(CD_REL, CD_SRC.replace(NEW_PASS, "for (const fn of []) { try { fn(match, scope || {}); }"), 'handover-memory-unasked');
    const c1 = drive('ctl-unasked', { cdMod: PRE_CD });
    ok(has(c1.disk) && c1.restored.some((x) => has(x.text)), 'NEGATIVE CONTROL: without the holders\' pass the hand-over memory keeps the cleared job\'s words on disk and a returned frame restores them', c1.disk.slice(0, 200));
    // CONTROL ②: the jobs door without its ids — a ladder match never sees a jobs-store original
    const NEW_SCOPE = ", { jobIds: [...gone] }); } catch (e) { this.d.log('[jobs] ladder stash rewrite failed:'";
    ok(JB_SRC3.split(NEW_SCOPE).length === 2, 'the jobs door names its ids to the ladder once (the control removes exactly it)');
    const PRE_JB = MUT.load(JB_REL3, JB_SRC3.replace(NEW_SCOPE, "); } catch (e) { this.d.log('[jobs] ladder stash rewrite failed:'"), 'handover-no-job-ids');
    const c2 = drive('ctl-no-ids', { jbMod: PRE_JB });
    ok(has(c2.disk), 'NEGATIVE CONTROL: without the job ids the memory\'s jobs originals keep the words', c2.disk.slice(0, 200));
    // (f3b) A CLEAR RACING A HAND-OVER IN FLIGHT (verify r3 of lane-redact, reproduced): the owner clears while the post
    // is on its way — both doors rewrite the claimed entries in their stores, `redactDelivered` finds no record yet, and
    // the record written after the delivery carried the PRE-CLEAR frame (the words, on disk, for 24 h). Now an entry that
    // reads the sentence when the delivery lands marks the record: its frame is kept as its digest only, the echo still
    // restores the (cleared) originals, and the log says so.
    const SH_SRC = fs.readFileSync(path.join(ROOT, SH_REL), 'utf8');
    const { renderMsgStash } = require(path.join(ROOT, 'src/agent-routes.js'));
    const { renderNotifStash } = require(path.join(ROOT, 'src/job-model.js'));
    const race = async (tag, { shMod = SH } = {}) => {
      const dir = path.join(DATA, 'handover-race-' + tag); fs.mkdirSync(dir, { recursive: true });
      const ladder = DELIVER.create({ dataDir: dir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
      let release; const gate = new Promise((r) => { release = r; });
      let sent = null;   // the frame as the ladder was handed it (the wrapper echoes the HEADED text)
      ladder.deliverToConversation = async (cid, text) => { sent = String(text); await gate; return { ok: true, lane: 'rpc-queue' }; };
      const jmx = bareJm(require(path.join(ROOT, JB_REL3)), { redactStash: (m, sc) => ladder.redactStash(m, sc) });
      jmx._rewriteSpills = () => {};
      jmx.notifsFile = path.join(dir, 'job-notifications.json');   // the REAL claim / drain / restore write it (a bare manager names none: the write would land in the cwd)
      const said = [];
      const s = { backend: 'claude', backendSessionId: ME_CID, _isStreaming: false };
      const view = shMod.create({ activeSessions: new Map([['cw-me', s]]), getDeliver: () => ladder, getJobs: () => jmx, renderMsgStash, renderNotifStash, log: { log: (l) => said.push(String(l)), warn() {} }, dataDir: dir });
      ladder.registerRedactor((m, sc) => view.redactDelivered(m, sc));
      ladder.registerFrameRestorer((cid, text, meta) => view.restoreHandedOver(cid, text, meta));
      const JOBR = 'jb-0000ee13';
      jmx.jobs.set(JOBR, jobRec(JOBR, { name: `ledger ${MARK}` }));
      jmx.pendingNotifs.set(ME_CID, [{ jobId: JOBR, jobName: `ledger ${MARK}`, text: `announced: ${MARK} totals`, ts: JT - 5e3, urgency: 'low' }]);
      ladder.stashFor(ME_CID, { source: 'agent', kind: 'notification', fromName: `Background Work · ledger ${MARK}`, text: `[VibeSpace Background Work] task "ledger ${MARK}" (${JOBR}): announced: ${MARK} again.` });
      const p = view.handOver('cw-me');
      await new Promise((r) => setTimeout(r, 15));   // the post is in flight
      const out = jmx.clearJobs([JOBR], { by: 'owner', at: JT });
      release(); const r = await p;
      const disk = fs.readFileSync(path.join(dir, SH.DELIVERED_FILE), 'utf8');
      const rec = JSON.parse(disk)[r.id];
      // the wrapper hands the frame back (its `ok:false` echo of the headed text): what comes back?
      const { vibespaceNoticeText } = require(path.join(ROOT, 'src/notification-senders.js'));
      const k = ladder.restoreFrame(ME_CID, vibespaceNoticeText(sent), { kind: 'notification' });
      return { out, r, disk, rec, said, sent, k, back: ladder.stashEntries(ME_CID), jobsBack: jmx.pendingNotifs.get(ME_CID) || [] };
    };
    const rr = await race('real');
    ok(rr.out.cleared.length === 1 && rr.r.ok && rr.r.delivered === 2 && has(rr.sent), 'setup: the clear landed while the hand-over awaited its post (the frame on its way carried the words); the post then delivered both entries', { out: rr.out, r: rr.r });
    ok(!has(rr.disk) && !('text' in rr.rec) && /^[0-9a-f]{64}$/.test(rr.rec.textSha) && rr.rec.msg[0].text === CT && rr.rec.jobs[0].text === CT,
      'the record written after the delivery holds NO word: the frame is its digest only, the originals read the sentence', { rec: rr.rec, words: rr.disk.slice(0, 200) });
    ok(rr.said.some((l) => /on its way when a clear reached its entries/.test(l)), 'the log says the hand-over was cleared mid-flight and why the frame is a digest', rr.said);
    ok(rr.k === 2 && rr.back.length === 1 && rr.back[0].text === CT && rr.jobsBack.length === 1 && rr.jobsBack[0].text === CT && !has(rr.back) && !has(rr.jobsBack),
      'the wrapper handing that frame back is still recognised by the digest and restores both originals AS THE SENTENCE', { k: rr.k, back: rr.back, jobsBack: rr.jobsBack });
    {
      const NEW_RACE = 'if (readsCleared(tookMsg, tookJobs)) {';
      ok(SH_SRC.split(NEW_RACE).length === 2, 'the mid-flight judge is present once (the control swaps exactly it)');
      const PRE_SH = MUT.load(SH_REL, SH_SRC.replace(NEW_RACE, 'if (false) {'), 'handover-race-unjudged');
      const c3 = await race('ctl', { shMod: PRE_SH });
      ok(c3.out.cleared.length === 1 && has(c3.disk) && typeof c3.rec.text === 'string' && has(c3.rec.text), 'NEGATIVE CONTROL: without the judge the record keeps the pre-clear frame with the words on disk', c3.disk.slice(0, 200));
    }
    // (f3c) A SPENT RECORD WHOSE FRAME CARRIED THE LADDER FORM (verify r3 on the merged tree, reproduced): the frame judge
    // looked for ` <jobId> ` — the jobs-store line form (renderNotifStash) — but a job notification a codex wrapper handed
    // back rides the LADDER as `[VibeSpace Background Work] task "name" (jb-…): …` under `from` 'Background Work · <name>'
    // (renderOwnerNotify + renderMsgStash), where the id stands as `(jb-…):` and `poll jb-….` — never between two spaces.
    // A spent record of such a hand-over kept the job's name AND words on disk after the clear. Now the id is judged as a
    // whole token whatever stands around it.
    {
      const { vibespaceNoticeText } = require(path.join(ROOT, 'src/notification-senders.js'));
      const { renderOwnerNotify } = require(path.join(ROOT, 'src/job-model.js'));
      const JOBL = 'jb-0000ee14';
      const spentLadder = (tag, { shMod = SH } = {}) => {
        const dir = path.join(DATA, 'handover-spent-' + tag); fs.mkdirSync(dir, { recursive: true });
        const job = jobRec(JOBL, { name: `ledger ${MARK}` });
        const entry = { source: 'agent', kind: 'notification', fromName: `Background Work · ledger ${MARK}`, text: renderOwnerNotify(job, { what: `announced: ${MARK} totals` }), ts: JT - 5e3 };
        const pm = renderMsgStash([entry], { maxEntries: 30, maxBytes: 12 * 1024 });
        const frame = vibespaceNoticeText(`The user handed over the 1 notice(s) that were waiting for your next turn (hand-over ho-spent-${tag}):\n\n${pm.text}`);
        fs.writeFileSync(path.join(dir, SH.DELIVERED_FILE), J({ [`ho-spent-${tag}`]: { cid: ME_CID, at: Date.now() - 1000, text: frame, msg: [], jobs: [], restored: 1 } }));
        const ladder = DELIVER.create({ dataDir: dir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
        const jmx = bareJm(require(path.join(ROOT, JB_REL3)), { redactStash: (m, sc) => ladder.redactStash(m, sc) });
        jmx._rewriteSpills = () => {}; jmx.notifsFile = path.join(dir, 'job-notifications.json');
        const view = shMod.create({ activeSessions: new Map(), getDeliver: () => ladder, getJobs: () => jmx, renderMsgStash, renderNotifStash, log: { log() {}, warn() {} }, dataDir: dir });
        ladder.registerRedactor((m, sc) => view.redactDelivered(m, sc));
        jmx.jobs.set(JOBL, job);
        const out = jmx.clearJobs([JOBL], { by: 'owner', at: JT });
        const disk = fs.readFileSync(path.join(dir, SH.DELIVERED_FILE), 'utf8');
        return { out, frame, disk, rec: JSON.parse(disk)[`ho-spent-${tag}`], echo: view.restoreHandedOver(ME_CID, frame, {}) };
      };
      const sp = spentLadder('real');
      ok(has(sp.frame) && /\(jb-0000ee14\):/.test(sp.frame) && !/ jb-0000ee14 /.test(sp.frame), 'setup: the spent record\'s frame carries the LADDER form of the job\'s notification — the id in parentheses, never between spaces');
      ok(sp.out.cleared.length === 1 && !has(sp.disk) && !('text' in sp.rec) && /^[0-9a-f]{64}$/.test(sp.rec.textSha), 'the clear reaches a spent record whose frame carried the ladder form: the frame is its digest only, no word on disk', sp.disk.slice(0, 300));
      ok(sp.echo === 1 || sp.echo === -1, 'the echo of that frame is still recognised by the digest (a spent record answers its restored count)', sp.echo);
      const NEW_NAMES = 'else for (const id of ids) if (namesJob(rec.text, id)) { hit = true; break; }';
      ok(SH_SRC.split(NEW_NAMES).length === 2, 'the whole-token judge is present once (the control swaps exactly it)');
      const PRE_SPENT = MUT.load(SH_REL, SH_SRC.replace(NEW_NAMES, "else for (const id of ids) if (rec.text.includes(' ' + id + ' ')) { hit = true; break; }"), 'handover-spent-space-judge');
      const c4 = spentLadder('ctl', { shMod: PRE_SPENT });
      ok(c4.out.cleared.length === 1 && has(c4.disk) && typeof c4.rec.text === 'string', 'NEGATIVE CONTROL: the ` <id> ` judge misses the ladder form — the spent record keeps the job\'s name and words on disk', c4.disk.slice(0, 200));
    }
    // (f3d) THE GROUP-MESSAGE PATH OF THE HAND-OVER MEMORY (the forward-port's own open note): a wake a codex wrapper handed
    // back (the report, one line per record) waits in the ladder's stash, the user hands it over (delivered ⇒ the memory
    // keeps the report as an original + the frame), the owner clears ONE message of it, the wrapper hands the frame back
    // (`ok:false`) — what comes back reads the SENTENCE on that record's line, the other record's line and the head kept.
    // …and (f3e) THE PREVIEW RULE of branch lane-stash-detail (0e324b5f, not on master yet: `previewHead` = the entry's
    // first non-empty line after the ladder's head, cut at 140; a job row's label = `jobName`) over every entry the doors
    // touched here: proven on this tree, so the strip's Details list inherits it when that branch lands.
    {
      const { vibespaceNoticeText } = require(path.join(ROOT, 'src/notification-senders.js'));
      const previewHead = (text) => { const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean); let i = 0; if (lines.length > 1 && /^VibeSpace \(this workspace, not another agent\) reports:$/.test(lines[0])) i = 1; const first = lines[i] || ''; return first.length > 140 ? first.slice(0, 139) + '…' : first; };
      const GE_REL = 'src/server/groups-engine.js', GE_SRC = fs.readFileSync(path.join(ROOT, GE_REL), 'utf8');
      const groupMemory = async (tag, { geMod = GE } = {}) => {
        const dir = path.join(DATA, 'handover-group-' + tag); fs.mkdirSync(dir, { recursive: true });
        const ladder = DELIVER.create({ dataDir: dir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
        const gs = createChannelStore({ dir: path.join(dir, 'channels') });
        let t = Date.now() - 300e3;
        const g = geMod.create({ store: gs, deliver: ladder, broadcast: () => {}, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
        const made = await g.create({ by: G.OWNER, name: 'wake', members: [ME_CID, OTHER_CID], quiet: true, consent: () => ({ ok: true }) });
        const p1 = await g.post({ group: made.group.id, from: ME_CID, text: `the ${MARK} sheet: totals attached` });
        await g.post({ group: made.group.id, from: ME_CID, text: 'and a plain line' });
        const report = G.reportFor(gs.groups.live().groups[made.group.id], gs.readTail('groups', made.group.id, { limit: 50 }), OTHER_CID, { budget: 4096, lead: 'You were @mentioned' });
        ladder.stashFor(OTHER_CID, { source: 'agent', kind: 'peer', fromName: 'me · wake', text: report.text });   // the wrapper's hand-back of the wake
        // …and a job notification of the same conversation, so both doors' words ride ONE hand-over
        const JOBG = 'jb-0000ee15';
        const jmx = bareJm(require(path.join(ROOT, JB_REL3)), { redactStash: (m, sc) => ladder.redactStash(m, sc) });
        jmx._rewriteSpills = () => {}; jmx.notifsFile = path.join(dir, 'job-notifications.json');
        jmx.jobs.set(JOBG, jobRec(JOBG, { name: `ledger ${MARK}` }));
        jmx.pendingNotifs.set(OTHER_CID, [{ jobId: JOBG, jobName: `ledger ${MARK}`, text: `announced: ${MARK} totals`, ts: JT - 5e3, urgency: 'low' }]);
        let sent = null;
        ladder.deliverToConversation = async (cid, text) => { sent = String(text); return { ok: true, lane: 'rpc-queue' }; };
        const s = { backend: 'codex', backendSessionId: OTHER_CID, _isStreaming: false };
        const view = SH.create({ activeSessions: new Map([['cw-o', s]]), getDeliver: () => ladder, getJobs: () => jmx, renderMsgStash, renderNotifStash, log: { log() {}, warn() {} }, dataDir: dir });
        ladder.registerRedactor((m, sc) => view.redactDelivered(m, sc));
        ladder.registerFrameRestorer((cid, text, meta) => view.restoreHandedOver(cid, text, meta));
        const ho = await view.handOver('cw-o');
        const before = fs.readFileSync(path.join(dir, SH.DELIVERED_FILE), 'utf8');
        const rc = await g.clearMessages({ group: made.group.id, ids: [p1.message.vendorId], by: G.OWNER });
        const rj = jmx.clearJobs([JOBG], { by: 'owner', at: JT });
        const disk = fs.readFileSync(path.join(dir, SH.DELIVERED_FILE), 'utf8');
        const k = ladder.restoreFrame(OTHER_CID, vibespaceNoticeText(sent), { kind: 'notification' });
        const back = ladder.stashEntries(OTHER_CID), jobsBack = jmx.pendingNotifs.get(OTHER_CID) || [];
        gs.close();
        return { gid: made.group.id, ho, before, rc, rj, disk, k, back, jobsBack };
      };
      const gm = await groupMemory('real');
      ok(gm.ho.ok && gm.ho.delivered === 2 && has(gm.before), 'setup: the hand-over delivered the wake report and the job notification; the memory held both with their words');
      ok(gm.rc.ok && gm.rc.cleared.length === 1 && gm.rj.cleared.length === 1 && !has(gm.disk), 'the owner clears the message and the job: no word remains in the memory on disk (the report\'s original line, the job\'s original, both frames)', gm.disk.slice(0, 300));
      const rep = gm.back.find((e) => e.kind === 'peer');
      ok(gm.k === 2 && !!rep && !has(rep.text) && rep.text.includes(`- ${CT}`) && rep.text.includes('and a plain line') && rep.text.includes(`(${gm.gid})`),
        'the frame handed back restores the report AS THE SENTENCE on the cleared record\'s line — the head and the other record\'s line kept', rep && rep.text);
      ok(gm.jobsBack.length === 1 && gm.jobsBack[0].text === CT && gm.jobsBack[0].jobName === CT, '…and the job notification as the sentence (name and text)', gm.jobsBack);
      // (f3e) the preview rule over every entry the doors touched: no first line carries a word; a job row's label is the sentence
      const previews = [...gm.back.map((e) => ({ kind: 'msg', head: previewHead(e.text), label: e.fromName })), ...gm.jobsBack.map((n) => ({ kind: 'job', head: previewHead(n.text), label: n.jobName }))];
      ok(previews.length === 2 && previews.every((p) => !has(p.head) && !has(p.label)) && previews.find((p) => p.kind === 'job').label === CT && previews.find((p) => p.kind === 'job').head === CT && /^You were @mentioned/.test(previews.find((p) => p.kind === 'msg').head),
        'lane-stash-detail\'s preview rule over the restored entries: a job row reads the sentence (label + head), the report row\'s head is its lead line — no preview carries a word', previews);
      const NEW_GL2 = "try { if (deliver && typeof deliver.redactStash === 'function') deliver.redactStash(";
      ok(GE_SRC.split(NEW_GL2).length === 2, 'the groups door\'s ladder rewrite is present once (the control removes exactly it)');
      const PRE_G2 = MUT.load(GE_REL, GE_SRC.replace(NEW_GL2, "try { if (false) deliver.redactStash("), 'group-memory-unreached');
      const c5 = await groupMemory('ctl', { geMod: PRE_G2 });
      ok(c5.rc.cleared.length === 1 && has(c5.disk), 'NEGATIVE CONTROL: without the groups door\'s ladder rewrite the memory keeps the report\'s words on disk', c5.disk.slice(0, 200));
      // …and the returned frame restores them only when the SECOND wall is down too (verify r4: a restore is a write, judged
      // by the groups engine's held-entry judge against the group's `cleared` index — stripped from this control's copy)
      const NEW_GJ2 = "if (deliver && typeof deliver.registerStashJudge === 'function') deliver.registerStashJudge(judgeHeldEntry);";
      ok(GE_SRC.split(NEW_GJ2).length === 2, 'the groups engine registers its held-entry judge once (the control removes exactly it)');
      const PRE_G3 = MUT.load(GE_REL, GE_SRC.replace(NEW_GL2, "try { if (false) deliver.redactStash(").replace(NEW_GJ2, 'if (false) deliver.registerStashJudge(judgeHeldEntry);'), 'group-memory-unreached-unjudged');
      const c6 = await groupMemory('ctl2', { geMod: PRE_G3 });
      const repC = c6.back.find((e) => e.kind === 'peer');
      ok(c6.rc.cleared.length === 1 && has(c6.disk) && !!repC && has(repC.text), 'NEGATIVE CONTROL: without the door\'s rewrite AND the judge, the returned frame restores the report\'s words', repC && repC.text.slice(0, 200));
      const c5rep = c5.back.find((e) => e.kind === 'peer');
      ok(!!c5rep && !has(c5rep.text), 'the judge alone (the door\'s rewrite off) still restores the returned frame as the sentence — the two walls are independent', c5rep && c5rep.text.slice(0, 200));
    }
  }
  // (f4) A FRAME HANDED BACK AFTER THE CLEAR (lane-redact verify r4, reproduced): the clear's `redactStash` rewrites what
  // is QUEUED at that instant — an empty queue when the notification / wake is sitting in the codex wrapper's queue
  // (rpc-queue lane, ok:true). Stop / a queue removal hands the frame back WHOLE (`peer_message_result ok:false`, an
  // unbounded window, past a restart) and the stdout consumers stash it as itself (restoreFrame → 0 → stashFor): the
  // words were back in data/msg-stash.json and in the next turn's injection. Now EVERY entry is judged at its write by
  // the stores that own its words (registerStashJudge): the jobs engine by the job id the frame names + clearedAt, the
  // groups engine by the group the report names + its `cleared` index — store-backed, so a fresh process judges the same.
  {
    const DELIVER = require(path.join(ROOT, 'src/server/conversation-deliver.js'));
    const CD_REL = 'src/server/conversation-deliver.js', CD_SRC = fs.readFileSync(path.join(ROOT, CD_REL), 'utf8');
    const GE_REL = 'src/server/groups-engine.js', GE_SRC = fs.readFileSync(path.join(ROOT, GE_REL), 'utf8');
    const { renderOwnerNotify } = require(path.join(ROOT, 'src/job-model.js'));
    const JOBH = 'jb-0000ee31';
    const handBack = async (tag, { cdMod = DELIVER, jbMod = require(path.join(ROOT, JB_REL)), geMod = GE, restart = false } = {}) => {
      const dir = path.join(DATA, 'handback-' + tag); fs.mkdirSync(dir, { recursive: true });
      const mkLadder = () => cdMod.create({ dataDir: dir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
      let ladder = mkLadder();
      let sent = null, sentOpts = null;
      ladder.deliverToConversation = async (cid, text, opts) => { sent = String(text); sentOpts = opts; return { ok: true, lane: 'rpc-queue' }; };   // queued in the wrapper
      const jmx = bareJm(jbMod, { redactStash: (m, sc) => ladder.redactStash(m, sc), deliverToConversation: (c, t, o) => ladder.deliverToConversation(c, t, o) });
      jmx._rewriteSpills = () => {};
      const wire = (ld) => { if (typeof ld.registerStashJudge === 'function' && typeof jmx.judgeHeldEntry === 'function') ld.registerStashJudge((e) => jmx.judgeHeldEntry(e)); };   // as jobs-wiring does
      wire(ladder);
      const job = jobRec(JOBH, { name: `ledger ${MARK}` });
      jmx.jobs.set(job.id, job);
      // T0: the notification is delivered (queued); T1: the owner clears; the ladder's queue was empty
      await ladder.deliverToConversation(ME_CID, renderOwnerNotify(job, { what: `announced: ${MARK} totals` }), { fromName: `Background Work · ${job.name}`, kind: 'notification' });
      const jobFrame = sent, jobFrom = sentOpts.fromName;
      const out = jmx.clearJobs([JOBH], { by: 'owner', at: JT });
      // …and the group twin: a wake report queued in a codex member's wrapper, the record cleared
      const gs = createChannelStore({ dir: path.join(dir, 'channels') });
      let gt = Date.now() - 300e3;
      const mk = (ld) => geMod.create({ store: gs, deliver: ld, broadcast: () => {}, now: () => (gt += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
      let ge = mk(ladder);
      const made = await ge.create({ by: G.OWNER, name: 'wake', members: [ME_CID, OTHER_CID], quiet: true, consent: () => ({ ok: true }) });
      const p1 = await ge.post({ group: made.group.id, from: ME_CID, text: `the ${MARK} sheet: totals attached` });
      await ge.post({ group: made.group.id, from: ME_CID, text: 'and a plain line' });
      const report = G.reportFor(gs.groups.live().groups[made.group.id], gs.readTail('groups', made.group.id, { limit: 50 }), OTHER_CID, { budget: 4096, lead: 'You were @mentioned' });
      sent = null; await ladder.deliverToConversation(OTHER_CID, report.text, { fromName: 'me · wake', kind: 'peer' });
      const wakeFrame = sent;
      const rc = await ge.clearMessages({ group: made.group.id, ids: [p1.message.vendorId], by: G.OWNER });
      const queued = ladder.stashEntries(ME_CID).length + ladder.stashEntries(OTHER_CID).length;
      if (restart) { ladder.flush(); ladder = mkLadder(); wire(ladder); ge = mk(ladder); }   // the codex queue outlives the process: the hand-back lands on a fresh ladder + engine
      // T2 (minutes / hours later): Stop / a queue removal — the consumers' verbatim two steps
      const back = (cid, text, kind, fromName) => { const n = ladder.restoreFrame(cid, text, { kind }) || 0; if (!n) ladder.stashFor(cid, { source: 'agent', kind, fromName, text }); return n; };
      const k1 = back(ME_CID, jobFrame, 'notification', jobFrom);
      const k2 = back(OTHER_CID, wakeFrame, 'peer', 'me · wake');
      // a notification rendered AFTER the clear (the job's name is the sentence now; new output) is handed back too: kept
      sent = null; await ladder.deliverToConversation(ME_CID, renderOwnerNotify(jmx.jobs.get(JOBH), { what: 'announced: fresh output' }), { fromName: `Background Work · ${jmx.jobs.get(JOBH).name}`, kind: 'notification' });
      back(ME_CID, sent, 'notification', `Background Work · ${jmx.jobs.get(JOBH).name}`);
      ladder.flush();
      const disk = fs.readFileSync(path.join(dir, 'msg-stash.json'), 'utf8');
      const r = { out, rc, queued, k1, k2, disk, mine: ladder.stashEntries(ME_CID), theirs: ladder.stashEntries(OTHER_CID), gid: made.group.id, jobFrame, wakeFrame };
      gs.close();
      return r;
    };
    const hb = await handBack('real');
    ok(hb.out.cleared.length === 1 && hb.rc.cleared.length === 1 && hb.queued === 0 && has(hb.jobFrame) && has(hb.wakeFrame), 'setup: both delivered (queued in the wrapper) with the words, both cleared while the ladder\'s queue was EMPTY');
    ok(hb.k1 === 0 && hb.k2 === 0 && hb.mine.length === 2 && hb.mine[0].text === CT && hb.mine[0].fromName === 'Background Work · ' + CT,
      'the job notification handed back after the clear is held AS THE SENTENCE (text and label) — it named a cleared job and did not read the sentence', hb.mine[0]);
    ok(hb.mine[1].text.includes('announced: fresh output') && hb.mine[1].text.includes(CT), 'a notification rendered AFTER the clear (its name the sentence, new output) is held as itself', hb.mine[1] && hb.mine[1].text);
    ok(hb.theirs.length === 1 && !has(hb.theirs[0].text) && hb.theirs[0].text.includes(`- ${CT}`) && hb.theirs[0].text.includes('and a plain line') && hb.theirs[0].text.includes(`(${hb.gid})`),
      'the wake report handed back after the clear: the cleared record\'s line reads the sentence, the other line and the head stay', hb.theirs[0] && hb.theirs[0].text);
    ok(!has(hb.disk), 'no word reached data/msg-stash.json', hb.disk.slice(0, 300));
    const hb2 = await handBack('restart', { restart: true });
    ok(hb2.mine[0].text === CT && !has(hb2.theirs[0].text) && !has(hb2.disk), 'a hand-back that lands on a FRESH process (the wrapper\'s queue outlives a restart) is judged the same — the judges are store-backed', { mine: hb2.mine[0], theirs: hb2.theirs[0] && hb2.theirs[0].text.slice(0, 200) });
    // CONTROL ①: the ladder without the judge at its write — the words come back through the hand-back
    const NEW_JUDGE = 'if (judgeEntry(entry)) log(';
    ok(CD_SRC.split(NEW_JUDGE).length === 2, 'the ladder judges an entry at its write once (the control removes exactly it)');
    const c1 = await handBack('ctl-unjudged', { cdMod: MUT.load(CD_REL, CD_SRC.replace(NEW_JUDGE, 'if (false) log('), 'handback-unjudged') });
    ok(has(c1.mine[0]) && has(c1.theirs[0].text) && has(c1.disk), 'NEGATIVE CONTROL: without the judge at the write, both hand-backs put the cleared words back in the queue and on disk', c1.disk.slice(0, 200));
    // CONTROL ②: the jobs judge blind to `clearedAt` — the job frame comes back with its words, the wake is still judged
    const NEW_JJ = 'if (j && j.clearedAt && (!reads || j.reclearedAt)) { cleared = true; break; }';
    ok(JB_SRC.split(NEW_JJ).length === 2, 'the jobs judge reads clearedAt once (the control blinds exactly it)');
    const c2 = await handBack('ctl-jobs-blind', { jbMod: MUT.load(JB_REL, JB_SRC.replace(NEW_JJ, 'if (false) { cleared = true; break; }'), 'handback-jobs-blind') });
    ok(has(c2.mine[0].text) && !has(c2.theirs[0].text), 'NEGATIVE CONTROL: a jobs judge blind to the clear keeps the job\'s words; the groups judge still takes the wake\'s', c2.mine[0].text.slice(0, 120));
    // CONTROL ③: the groups engine that never registers its judge — the wake comes back with its words
    const NEW_GJ = "if (deliver && typeof deliver.registerStashJudge === 'function') deliver.registerStashJudge(judgeHeldEntry);";
    ok(GE_SRC.split(NEW_GJ).length === 2, 'the groups engine registers its judge once (the control removes exactly it)');
    const c3 = await handBack('ctl-groups-unreg', { geMod: MUT.load(GE_REL, GE_SRC.replace(NEW_GJ, 'if (false) deliver.registerStashJudge(judgeHeldEntry);'), 'handback-groups-unregistered') });
    ok(has(c3.theirs[0].text) && !has(c3.mine[0].text), 'NEGATIVE CONTROL: a groups engine without its judge lets the wake\'s words back; the jobs judge still takes the notification\'s', c3.theirs[0].text.slice(0, 120));
  }
  // (f4b) A JOB CLEARED TWICE (lane-redact verify r4, reproduced): a recurring job keeps announcing after its first clear —
  // what it says BETWEEN the clears reads the sentence as its name yet carries words the second clear takes. f4's judge kept
  // every sentence-reading frame as "new output", and the in-flight rule compared with the FIRST clearedAt (a second clear
  // of an `already` record keeps it): a between-the-clears frame handed back after the second clear, and a delivery of a
  // between-the-clears event in flight during it, came back whole. The door now stamps `reclearedAt` on a record cleared
  // again; the judge fails closed for such a job (the frame carries no time), `stale` compares with the latest clear.
  {
    const DELIVER = require(path.join(ROOT, 'src/server/conversation-deliver.js'));
    const { renderOwnerNotify } = require(path.join(ROOT, 'src/job-model.js'));
    const M2 = 'SECOND-ROUND-9c1d';
    const has2 = (x) => (typeof x === 'string' ? x : J(x) || '').includes(M2);   // the second round's own marker
    const twice = (jbMod) => {
      const dir = path.join(DATA, 'reclear-' + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(dir, { recursive: true });
      const ladder = DELIVER.create({ dataDir: dir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
      let sent = null, sentOpts = null;
      ladder.deliverToConversation = async (cid, text, opts) => { sent = String(text); sentOpts = opts; return { ok: true, lane: 'rpc-queue' }; };
      const jmx = bareJm(jbMod, { redactStash: (m, sc) => ladder.redactStash(m, sc) });
      jmx._rewriteSpills = () => {};
      ladder.registerStashJudge((e) => jmx.judgeHeldEntry(e));
      const job = jobRec('jb-0000ee41', { kind: 'cron', name: `mail digest ${MARK}`, state: 'up' });
      const once = jobRec('jb-0000ee42', { name: `digest ${MARK} once`, state: 'up' });
      jmx.jobs.set(job.id, job); jmx.jobs.set(once.id, once);
      const c1 = jmx.clearJobs([job.id, once.id], { by: 'owner', at: JT });
      // between the clears: the cron announces the mailbox again (queued in the codex wrapper); an event of it is in flight
      return (async () => {
        await ladder.deliverToConversation(ME_CID, renderOwnerNotify(job, { what: `announced: ${M2} — 3 new mails` }), { fromName: `Background Work · ${job.name}`, kind: 'notification' });
        const between = { text: sent, from: sentOpts.fromName };
        await ladder.deliverToConversation(ME_CID, renderOwnerNotify(once, { what: 'announced: fresh output' }), { fromName: `Background Work · ${once.name}`, kind: 'notification' });
        const onceFrame = { text: sent, from: sentOpts.fromName };
        const c2 = jmx.clearJobs([job.id], { by: 'owner', at: JT + 10 });   // the owner clears the cron AGAIN
        jmx._stashNotif(ME_CID, job, { what: `announced: ${M2} in flight`, at: JT + 5 }, 'not reachable');   // born between the clears, stashed after
        jmx._stashNotif(ME_CID, job, { what: 'announced: after both clears', at: JT + 20 }, 'not reachable');
        for (const f of [between, onceFrame]) { const n = ladder.restoreFrame(ME_CID, f.text, { kind: 'notification' }) || 0; if (!n) ladder.stashFor(ME_CID, { source: 'agent', kind: 'notification', fromName: f.from, text: f.text }); }
        ladder.flush();
        return { c1, c2, rec: jmx.jobs.get(job.id), between: between.text, q: ladder.stashEntries(ME_CID), held: jmx.pendingNotifs.get(ME_CID), disk: fs.readFileSync(path.join(dir, 'msg-stash.json'), 'utf8') };
      })();
    };
    const tw = await twice(require(path.join(ROOT, JB_REL)));
    ok(tw.c1.cleared.length === 2 && tw.c2.already.length === 1 && tw.rec.reclearedAt === JT + 10 && tw.rec.clearedAt === JT && has2(tw.between) && tw.between.includes(CT),
      'setup: the cron cleared, a between-the-clears frame (its name the sentence, new words) queued, the cron cleared AGAIN (`already`, reclearedAt stamped, clearedAt the first)', { c2: tw.c2, reclearedAt: tw.rec.reclearedAt });
    ok(tw.q.length === 2 && tw.q[0].text === CT && tw.q[0].fromName === 'Background Work · ' + CT && !has2(tw.disk),
      'the between-the-clears frame handed back after the second clear is held as the sentence — nothing of the second round on disk', tw.q[0]);
    ok(tw.q[1].text.includes('announced: fresh output'), 'a job cleared ONCE keeps f4\'s rule: its sentence-reading frame (new output) is held as itself', tw.q[1] && tw.q[1].text);
    ok(tw.held.length === 2 && tw.held[0].text === CT && tw.held[1].text === 'announced: after both clears', 'the in-flight rule compares with the LATEST clear: an event born between the clears is held as the sentence, one born after both keeps its words', tw.held);
    // CONTROLS: the pre-r4 judge (a sentence-reading frame always kept), the door without the stamp (both judges blind)
    const NEW_JJ2 = 'if (j && j.clearedAt && (!reads || j.reclearedAt)) { cleared = true; break; }';
    const NEW_STAMP = 'if (j.clearedAt) { j.reclearedAt = at; liveChanged = true; }';
    ok(JB_SRC.split(NEW_JJ2).length === 2 && JB_SRC.split(NEW_STAMP).length === 2, 'the judge\'s re-clear clause and the stamp are present once (the controls swap exactly them)');
    const k1 = await twice(MUT.load(JB_REL, JB_SRC.replace(NEW_JJ2, 'if (j && j.clearedAt && !reads) { cleared = true; break; }'), 'reclear-judge-keeps-sentence-frames'));
    ok(has2(k1.q[0].text) && has2(k1.disk) && k1.held[0].text === CT, 'NEGATIVE CONTROL: a judge that keeps every sentence-reading frame puts the second round back in the queue and on disk', k1.q[0] && k1.q[0].text.slice(0, 120));
    const k2 = await twice(MUT.load(JB_REL, JB_SRC.replace(NEW_STAMP, 'if (false) { j.reclearedAt = at; liveChanged = true; }'), 'reclear-unstamped'));
    ok(has2(k2.q[0].text) && has2(k2.held[0].text), 'NEGATIVE CONTROL: without the stamp both late copies of the second round come back whole (the judge and the in-flight rule)', { q: k2.q[0] && k2.q[0].text.slice(0, 80), held: k2.held[0] });
  }
  // (f2) a PUBLISHED service's port forward is labelled with its name — relabelled through the ports door it came from
  {
    // verify r8: `pfId` absent = the forward persisted and restored at boot before the job's next publish set the runtime-only
    // `_pfId` again (an adopted service's +8 s re-publish, a respawn, the await inside _ensurePublish) — found by its LABEL
    const drive5 = (Mod, { pfId = true } = {}) => {
      const labels = [];
      const pf = { list: () => [{ id: 'pf-__local__-8080', hostId: '__local__', remotePort: 8080, label: `service: ledger ${MARK}` }, { id: 'pf-__local__-9090', hostId: '__local__', remotePort: 9090, label: 'service: another job' }], forward: async (h, p, { label }) => { labels.push(`${h}:${p} ${label}`); } };
      const jmx = bareJm(Mod, { getPorts: () => pf });
      jmx._rewriteSpills = () => {};
      const job = jobRec('jb-0000ee10', { kind: 'service', name: `ledger ${MARK}`, state: 'up', publish: true, ports: [8080], ...(pfId ? { _pfId: 'pf-__local__-8080' } : {}) });
      jmx.jobs.set(job.id, job);
      const out = jmx.clearJobs([job.id], { by: 'owner', at: JT });
      return { out, labels };
    };
    const r5 = drive5(require(path.join(ROOT, JB_REL)));
    ok(r5.out.cleared.length === 1 && r5.labels.length === 1 && r5.labels[0] === `__local__:8080 service: ${CT}`, 'a published service\'s forward is relabelled with the sentence through pf.forward (the door that labelled it) — and ONLY its forward (another job\'s stays)', r5.labels);
    const r5b = drive5(require(path.join(ROOT, JB_REL)), { pfId: false });
    ok(r5b.labels.length === 1 && r5b.labels[0] === `__local__:8080 service: ${CT}`, 'verify r8: …found by its LABEL — a forward restored at boot before the job\'s next publish set `_pfId` is relabelled too', r5b.labels);
    const NEW_PF = "if (!svcLabels.has(rec.label)) continue;";
    ok(JB_SRC.split(NEW_PF).length === 2, 'the relabel rule is present once (the control swaps exactly it)');
    const PRE = MUT.load(JB_REL, JB_SRC.replace(NEW_PF, 'continue;'), 'forward-label-kept');
    ok(drive5(PRE).labels.length === 0, 'NEGATIVE CONTROL: without the relabel the forward keeps `service: <the cleared name>`');
    const PRE_PFID = "      for (const rec of (pf && pf.list && pf.list()) || []) {\n          if (!svcLabels.has(rec.label)) continue;";
    ok(JB_SRC.split(PRE_PFID).length === 2, 'the label walk is present once (the r8 control swaps it for the pre-r8 `_pfId` lookup)');
    const PRE8 = MUT.load(JB_REL, JB_SRC.replace(PRE_PFID, "      for (const rec of ((pf && pf.list && pf.list()) || []).filter((f) => liveHits.some((j) => gone.has(j.id) && j._pfId === f.id))) {\n          if (!svcLabels.has(rec.label)) continue;"), 'forward-by-runtime-id');
    ok(drive5(PRE8).labels.length === 1 && drive5(PRE8, { pfId: false }).labels.length === 0, 'NEGATIVE CONTROL (verify r8): the pre-r8 lookup by the runtime-only `_pfId` relabels a live one and misses the forward restored at boot (it keeps `service: <the cleared name>`)');
  }
  // (f2b) THE LABEL DOOR'S PRECISION (lane-redact verify r9, the revert table's second look at r8 ②): job names are not
  // unique — a second, NOT cleared service with the SAME name publishes its own forward (another port, the same label). The
  // label walk relabelled it too: that job's Ports row read the cleared sentence though nobody cleared it (until its next
  // publish). A forward whose port a live job of that name still publishes is that job's — kept; an orphan forward with the
  // cleared name (no live owner) still goes (fail closed).
  {
    const driveSame = (Mod) => {
      const labels = [];
      const pf = { list: () => [
        { id: 'pf-__local__-8080', hostId: '__local__', remotePort: 8080, label: `service: ledger ${MARK}` },
        { id: 'pf-__local__-8181', hostId: '__local__', remotePort: 8181, label: `service: ledger ${MARK}` },
        { id: 'pf-__local__-8282', hostId: '__local__', remotePort: 8282, label: `service: ledger ${MARK}` },
      ], forward: async (h, p, { label }) => { labels.push(`${h}:${p} ${label}`); } };
      const jmx = bareJm(Mod, { getPorts: () => pf });
      jmx._rewriteSpills = () => {};
      const a = jobRec('jb-0000ee11', { kind: 'service', name: `ledger ${MARK}`, state: 'up', publish: true, ports: [8080] });
      const b = jobRec('jb-0000ee12', { kind: 'service', name: `ledger ${MARK}`, state: 'up', publish: true, ports: [8181] });
      jmx.jobs.set(a.id, a); jmx.jobs.set(b.id, b);
      const out = jmx.clearJobs([a.id], { by: 'owner', at: JT });
      return { out, labels: labels.sort(), bName: jmx.jobs.get(b.id).name };
    };
    const rs = driveSame(require(path.join(ROOT, JB_REL)));
    ok(rs.out.cleared.length === 1 && has(rs.bName) && J(rs.labels) === J([`__local__:8080 service: ${CT}`, `__local__:8282 service: ${CT}`]), 'verify r9: the cleared service\'s forward goes, an ORPHAN forward with its name goes (fail closed) — and a second, NOT cleared service of the SAME name keeps its own forward\'s label (its port is its)', rs.labels);
    const NEW_KEEP = 'if (sameNameLive(rec)) continue;';
    ok(JB_SRC.split(NEW_KEEP).length === 2, 'the same-name keep rule is present once (the control drops exactly it)');
    const PREK = MUT.load(JB_REL, JB_SRC.replace(NEW_KEEP, ''), 'forward-label-same-name');
    ok(driveSame(PREK).labels.length === 3, 'NEGATIVE CONTROL (verify r9): the label-only walk relabels the uncleared same-name service\'s forward too');
  }
  // (f2c) THE LADDER STASH DOOR'S PRECISION (lane-redact verify r9, the sibling of (f2b)): the clear rewrites every ladder
  // stash entry FILED UNDER the cleared job's name — a second, NOT cleared job of the same name notifying the same codex
  // conversation had its undelivered notification replaced by the sentence (the agent never received it). An entry names its
  // job by id (`… (jb-…): …`): one naming only jobs that were NOT cleared is theirs — kept; one naming a cleared job, or no
  // job at all, still goes (fail closed).
  {
    const DELIVER = require(path.join(ROOT, 'src/server/conversation-deliver.js'));
    const driveLadder = (Mod) => {
      const ldir = fs.mkdtempSync(path.join(DATA, 'ladder-same-'));
      const ladder = DELIVER.create({ dataDir: ldir, peerMsg: null, getHosts: () => null, getConvIndex: () => null, serverSetting: () => undefined, activeSessions: new Map(), emitPeerCard: () => {}, log: () => {} });
      const FROM = `Background Work · ledger ${MARK}`;
      ladder.stashFor('codex-owner', { source: 'agent', kind: 'notification', fromName: FROM, text: `[VibeSpace Background Work] task "ledger ${MARK}" (jb-0000ee31): announced: ${MARK} cleared one` });
      ladder.stashFor('codex-owner', { source: 'agent', kind: 'notification', fromName: FROM, text: `[VibeSpace Background Work] task "ledger ${MARK}" (jb-0000ee32): announced: the other one` });
      ladder.stashFor('codex-owner', { source: 'agent', kind: 'notification', fromName: FROM, text: `announced: ${MARK} with no id` });
      const jmx = bareJm(Mod, { redactStash: (m, sc) => ladder.redactStash(m, sc) });
      jmx._rewriteSpills = () => {};
      jmx.jobs.set('jb-0000ee31', jobRec('jb-0000ee31', { name: `ledger ${MARK}` }));
      jmx.jobs.set('jb-0000ee32', jobRec('jb-0000ee32', { name: `ledger ${MARK}` }));
      jmx.clearJobs(['jb-0000ee31'], { by: 'owner', at: JT });
      return ladder.drainStash('codex-owner').map((e) => e.text);
    };
    const q = driveLadder(require(path.join(ROOT, JB_REL)));
    ok(q.length === 3 && q[0] === CT && /\(jb-0000ee32\): announced: the other one$/.test(q[1]) && q[2] === CT, 'verify r9: the cleared job\'s held entry goes, an entry naming no job goes (fail closed) — and a NOT cleared job of the SAME name keeps its undelivered notification', q);
    const NEW_OTHER = ' && !otherJobsOnly(e) ?';
    ok(JB_SRC.split(NEW_OTHER).length === 2, 'the other-jobs keep rule is present once (the control drops exactly it)');
    const PREL = MUT.load(JB_REL, JB_SRC.replace(NEW_OTHER, ' ?'), 'ladder-stash-same-name');
    ok(driveLadder(PREL).every((t) => t === CT), 'NEGATIVE CONTROL (verify r9): the name-only rule replaces the uncleared same-name job\'s notification with the sentence too');
  }
  // (f5) A JOB'S NAME IN A CHANNEL WITHDRAWAL (lane-redact verify r9, the alias pass): a Background Work job (jbt_) may withdraw
  // its owner conversation's draft; with that conversation NOT running the route built the withdrawing principal as
  // `{kind: 'agent', id: <the conversation>, name: <the JOB's name>}` and the engine stores `withdrawal.by.name` on the
  // outbox proposal (data/channels/outbox — every client's outbox broadcast, GET /api/channels/outbox) — a derived copy of
  // the job's words no door of the job's clear reaches. The job speaks FOR its conversation: the principal carries its id
  // and no name (the engine falls back to the draft's own drafter name).
  {
    const TOK = 'jbt_r9withdraw', WD = 'jb-0000ee20';
    const wj = jobRec(WD, { name: `withdrawer ${MARK}`, tokenHash: require('node:crypto').createHash('sha256').update(TOK).digest('hex') });
    jm.jobs.set(WD, wj);
    const seen = [];
    const stubCh = { listFor: () => [], withdrawProposal: async (a) => { seen.push(a); return { ok: true, proposal: { id: a.proposalId, state: 'withdrawn' } }; } };
    const drive = async (Mod) => {
      const A = fakeApp();
      Mod.setupAgentRoutes({ app: A.app, activeSessions: new Map(), tasks, sessionStatus, SessionStatusManager, userTodos, sessionStatusKey, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => jm, getRecordClear: () => recordClear, getChannels: () => stubCh });
      seen.length = 0;
      const r = await A.call('POST', '/api/agent/channels/proposals/:id/withdraw', { params: { id: 'p-r9' }, headers: asAgent(TOK), body: { why: 'wrong thread' } });
      return { r, by: seen[0] && seen[0].by };
    };
    const w = await drive(require(path.join(ROOT, 'src/agent-routes.js')));
    ok(w.r.status === 200 && w.by && w.by.kind === 'agent' && w.by.id === ME_CID && !has(J(w.by)), 'verify r9: a job withdrawing its (not running) owner conversation\'s draft speaks as that conversation — its id, never the job\'s NAME (the engine stores the principal on the outbox proposal: a copy of the job\'s words no clear reaches)', { status: w.r.status, by: w.by && { kind: w.by.kind, id: w.by.id, name: w.by.name } });
    const AR_REL = 'src/agent-routes.js', AR_SRC = fs.readFileSync(path.join(ROOT, AR_REL), 'utf8');
    const NEW_BY = "{ kind: 'agent', id: who.cid, name: null, groups: who.myGroups || [] }";
    ok(AR_SRC.split(NEW_BY).length === 2, 'the job caller\'s principal is built once, nameless (the control swaps exactly it)');
    const PRE = MUT.load(AR_REL, AR_SRC.replace(NEW_BY, "{ kind: 'agent', id: who.cid, name: (who.job && who.job.name) || null, groups: who.myGroups || [] }"), 'withdraw-names-job');
    const c = await drive(PRE);
    ok(c.r.status === 200 && c.by && has(String(c.by.name || '')), 'NEGATIVE CONTROL (verify r9): the pre-fix route hands the engine the job\'s name as the withdrawing principal\'s', c.by && c.by.name);
    jm.jobs.delete(WD);
  }
  // (g) the job's ask lifecycle closes a CLEARED ask item too (resolveByJob told the ask apart by its words)
  {
    const it = userTodos.add(ME, { text: 'asker3 needs your input', jobId: 'jb-0000ee08', origin: 'jobs', by: 'agent' });
    userTodos.clearItems([it.id], { by: 'owner' });
    const n = userTodos.resolveByJob('jb-0000ee08');
    ok(n === 1 && userTodos.get(it.id).status === 'done', 'an answered / expired / withdrawn panel resolves the job\'s ask item even after the owner cleared its words', userTodos.get(it.id));
    const NEW_ASK = "if (onlyAsk && !it.clearedAt && !/needs your input/.test(it.text)) continue;";
    ok(UT_SRC.split(NEW_ASK).length === 2, 'the ask rule is present once (the control swaps exactly it)');
    const PRE = MUT.load(UT_REL, UT_SRC.replace(NEW_ASK, "if (onlyAsk && !/needs your input/.test(it.text)) continue;"), 'ask-by-words-only');
    const dir = path.join(DATA, 'ut-pre'); fs.mkdirSync(dir, { recursive: true });
    const ut = new PRE.UserTodoManager({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 });
    const it2 = ut.add(ME, { text: 'asker4 needs your input', jobId: 'jb-0000ee09', origin: 'jobs', by: 'agent' });
    ut.clearItems([it2.id], { by: 'owner' });
    ok(ut.resolveByJob('jb-0000ee09') === 0 && ut.get(it2.id).status === 'open', 'NEGATIVE CONTROL: the pre-r3 rule leaves the cleared ask open forever after the answer');
    try { ut.stop(); } catch { }
  }
}

// ── §5 GROUP MESSAGES ──
console.log('§5 agent-group messages');
{
  const made = await groups.create({ by: G.OWNER, name: 'finance', members: [ME_CID, OTHER_CID], quiet: true, consent: () => ({ ok: true }) });
  ok(made.ok, 'setup: a group of two agents + the owner', made);
  const gid = made.group.id;
  const m1 = await groups.post({ group: gid, from: ME_CID, text: `pasting ${MARK}: the CFO wrote …` });
  const m2 = await groups.post({ group: gid, from: OTHER_CID, text: 'thanks, noted' });
  const m3 = await groups.post({ group: gid, from: ME_CID, text: `and the attachment of ${MARK}` });
  ok(m1.ok && m2.ok && m3.ok, 'setup: three messages (two carry the marker; the newest is one of them)');
  const unreadBefore = groups.list().find((g) => g.id === gid).unread;
  const logPath = gStore.logPath('groups', gid);
  const lines0 = fs.readFileSync(logPath, 'utf8').trim().split('\n').length;
  const nB = gBroadcasts.length;
  const vids = [m1.message.vendorId, m3.message.vendorId];
  const r = await OWNER_APP.call('POST', '/api/records/clear-many', { body: { items: vids.map((v) => ({ kind: 'group-message', groupId: gid, id: v })) } });
  ok(r.status === 200 && r.body.cleared === 2, 'the owner clears both messages', r.body);
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const repl = lines.slice(lines0);
  ok(repl.length === 2 && repl.every((x) => x.raw.kind === 'cleared' && vids.includes(x.raw.of) && x.raw.by === 'owner' && x.text === '' && /^gx-/.test(x.vendorId)), 'the APPEND-ONLY log gains one REPLACEMENT record per clear ({kind:"cleared", of, by}) — nothing rewritten', repl);
  ok(lines.slice(0, lines0).some((x) => has(x.text)), 'THE ORIGINAL LINE STAYS ON DISK: a group log is never rolled or trimmed, so no compaction runs — every reader applies the replacement (documented, not hidden)');
  const gr = gStore.groups.live().groups[gid];
  ok(gr.cleared && gr.cleared[m1.message.vendorId] && gr.cleared[m3.message.vendorId] && gr.lastText === CT && gr.lastCleared === true && gr.lastAt === m3.message.at, 'groups.json: the cleared INDEX, lastText = the sentence (the newest was cleared), lastAt unmoved (a clear is not activity)');
  const read = groups.read({ by: G.OWNER, group: gid, limit: 50 });
  ok(read.ok && !has(read.records) && read.records.filter((x) => x.clearedAt).length === 2 && !read.records.some((x) => x.raw && x.raw.kind === 'cleared') && J(read.records.map((x) => x.vendorId)) === J(lines.slice(0, lines0).map((x) => x.vendorId)), 'read (the owner\'s window, `vibespace-msg read`): the records cleared in place, the replacements never shown, the order kept');
  const page = groups.read({ by: G.OWNER, group: gid, limit: 50, before: m3.message.at });
  ok(page.ok && !has(page.records) && page.records.find((x) => x.vendorId === m1.message.vendorId).clearedAt, 'a PAGE that does not reach the replacement records still shows the clear (the index)');
  const via = await AG.call('GET', '/api/agent/msg/read', { headers: asAgent('vsst_other'), query: { group: gid } });
  ok(via.status === 200 ? !has(via.body) : true, 'the agents\' read route carries no marker', via.status);
  ok(groups.list().find((g) => g.id === gid).unread === unreadBefore, 'the owner\'s unread count is unchanged (a replacement record is not a message)');
  const rep = groups.reportsForTurn(OTHER_CID, { budget: 4096 });
  ok(!has(rep.text) && (rep.text === '' || rep.text.includes(CT)), 'the next-turn report to the other member carries no marker', rep.text.slice(0, 300));
  const bc = gBroadcasts.slice(nB).filter((m) => m.type === 'channel-groups-updated' && Array.isArray(m.cleared));
  ok(bc.length === 1 && bc[0].cleared.length === 2 && bc[0].cleared.every((c) => c.groupId === gid && c.record.clearedAt && !has(c.record)) && !has(bc[0].groups), 'ONE broadcast carrying the cleared records (a window patches its rows in place) and the group list without the marker', bc.map((m) => m.cleared));
  const audit = gStore.auditTail({ limit: 20 }).filter((a) => a.kind === 'clear');
  ok(audit.length === 1 && J(audit[0].recordIds.slice().sort()) === J(vids.slice().sort()) && !has(audit[0]), 'the channels audit log gains ONE clear row — ids and who, no words', audit);
  const m4 = await groups.post({ group: gid, from: OTHER_CID, text: `other agent quoting ${MARK}` });
  const own = await recordClear.clear({ kind: 'group-message', groupId: gid, id: m2.message.vendorId }, { caller: { role: 'agent', keys: [OTHER], conversationId: OTHER_CID, by: OTHER } });
  const notOwn = await recordClear.clear({ kind: 'group-message', groupId: gid, id: m4.message.vendorId }, { caller: { role: 'agent', keys: [ME], conversationId: ME_CID, by: ME } });
  ok(own.ok && own.cleared === 1 && !notOwn.ok && notOwn.code === 'not_yours', 'through the ONE entry point an agent clears its own message and is refused another member\'s', [own, notOwn]);
  ok(!(await recordClear.clear({ kind: 'group-message', groupId: gid, id: 'gm-nope' }, { caller: { role: 'owner' } })).ok, 'an unknown vendorId is not_found');
  const lastRec = await groups.post({ group: gid, from: ME_CID, text: 'a new line' });
  ok(lastRec.ok && !gStore.groups.live().groups[gid].lastCleared && gStore.groups.live().groups[gid].lastText === 'a new line', 'a new message takes the last line back (lastCleared goes)');
  // A PAGE OF 50 STAYS 50 under 60 clears (the replacement records never eat a page)
  const big = await groups.create({ by: G.OWNER, name: 'busy', members: [ME_CID, OTHER_CID], quiet: true, consent: () => ({ ok: true }) });
  const bvids = [];
  for (let k = 0; k < 70; k++) { const p = await groups.post({ group: big.group.id, from: ME_CID, text: `m${k} ${MARK}` }); bvids.push(p.message.vendorId); }
  const r60 = await OWNER_APP.call('POST', '/api/records/clear-many', { body: { items: bvids.slice(10).map((v) => ({ kind: 'group-message', groupId: big.group.id, id: v })) } });
  const p50 = groups.read({ by: G.OWNER, group: big.group.id, limit: 50 });
  ok(r60.body.cleared === 60 && p50.records.length === 50 && p50.records.every((x) => x.clearedAt) && p50.records.every((x) => !x.raw || x.raw.kind !== 'cleared'), 'a batch of 60 in one request (the log read once), and the newest page is still FIFTY records, all cleared — no replacement ate a slot', { cleared: r60.body.cleared, n: p50.records.length });
}

// ── §5b A LAYOUT RECORD KEEPS NO RECORD'S WORDS (verify r5, reproduced in chrome by test-record-clear-client) ──
// The Job input window's title names its job; the layout record carried it to data/layouts.json, every rollback point,
// every other client (the relayed layout-sync frame) and GET /api/layouts — a desktop record nobody re-saved after a clear
// kept a cleared job's name on disk and served it. The ONE write choke point (writeLayouts) and the first read keep such a
// window's title as its generic one. The REAL persistence module over its own data dir; a pre-r5 copy is the control.
console.log('§5b a layout record keeps no record\'s words (the Job input window\'s title; verify r5)');
{
  const P_REL = 'src/routes/persistence.js', P_SRC = fs.readFileSync(path.join(ROOT, P_REL), 'utf8');
  const tick = () => new Promise((r) => setImmediate(() => setImmediate(r)));
  const JOBWIN = (winId, title) => ({ winId, type: 'job-interact', title, openSpec: { action: 'openJobInteract', jobId: 'jb-5b000001' } });
  const LOGWIN = (winId) => ({ winId, type: 'task', title: 'census — Log', openSpec: { action: 'openTaskLog', taskId: 'T-x', tab: 'activity' } });
  const drive = async (mod, tag) => {
    const dir = path.join(DATA, 'layouts-' + tag); fs.mkdirSync(dir, { recursive: true });
    // what an older build wrote: a Job input window naming its job on the active desktop AND on another desktop AND in a named preset
    fs.writeFileSync(path.join(dir, 'layouts.json'), J({ current: null, customGrids: [], desktopMeta: [{ id: 'd1', name: 'D1' }, { id: 'd2', name: 'D2' }],
      desktops: { d1: { autoSave: { windows: [JOBWIN('w1', `digest ${MARK} — needs your input`), LOGWIN('w2')] } }, d2: { autoSave: { windows: [JOBWIN('w3', `digest ${MARK} — needs your input`)] } } },
      saved: { mine: { windows: [JOBWIN('w4', `digest ${MARK} — needs your input`)] } } }, null, 2));
    const { router, setup } = mod;
    setup({ dataDir: dir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null });
    const r = {};
    const first = router.readLayouts();
    r.read = J(first);
    // THE WS layout-sync PATTERN (ws-handler.js): the record is a SHALLOW copy of the client's state, then written, then the
    // client's state is relayed to every other client — the relayed windows are the objects the choke point saw
    const state = { windows: [JOBWIN('w5', `digest ${MARK} — needs your input`), LOGWIN('w6')] };
    first.desktops.d1.autoSave = { ...state, updatedAt: Date.now() };
    router.writeLayouts(first);
    r.relayed = J({ type: 'layout-sync', desktopId: 'd1', state });
    await tick(); await tick();
    router.flushLayouts();
    r.disk = fs.readFileSync(path.join(dir, 'layouts.json'), 'utf8');
    r.history = (router.listLayoutHistory() || []).map((h) => fs.readFileSync(path.join(dir, 'layout-history', h.id), 'utf8')).join('\n');
    r.historyCount = (router.listLayoutHistory() || []).length;
    r.titles = [...r.disk.matchAll(/"title": "([^"]*)"/g)].map((m) => m[1]);
    return r;
  };
  const PM = require(path.join(ROOT, P_REL));
  const real = await drive(PM, 'real');
  ok(!has(real.read), 'the FIRST READ of a file an older build wrote serves no word — GET /api/layouts reads this (the active desktop, another desktop, a named preset)', real.read.slice(0, 300));
  ok(!has(real.relayed), 'the relayed layout-sync frame (what every other client receives and caches per desktop) carries the generic title', real.relayed);
  ok(!has(real.disk) && real.titles.filter((x) => x === 'Job input').length === 3 && real.titles.includes('census — Log'), 'data/layouts.json on disk: every Job input window keeps the generic title "Job input"; another window\'s title untouched', real.titles);
  ok(real.historyCount >= 1 && !has(real.history), `a rollback point (${real.historyCount}) — here written from the older file on disk, the choke point's disk belt — holds no word`, real.history.slice(0, 200));
  ok(J(PM.WORDLESS_TITLES) === J({ openJobInteract: 'Job input' }) && PM.wordlessTitles({ a: [{ title: 'x', openSpec: { action: 'constructor' } }] }) === 0 && PM.wordlessTitles(null) === 0, 'WORDLESS_TITLES names the one window whose title carries a record\'s words; a prototype key or a non-tree is never touched');
  // NEGATIVE CONTROL: the choke point as it was before r5 (no strip) — the words go to disk, to the relayed frame and to the first read
  const PRE_SRC = P_SRC.replace('    wordlessTitles(data);\n    try {', '    try {').replace("    if (wordlessTitles(_layoutsCache)) { if (_layoutsSaveTimer) clearTimeout(_layoutsSaveTimer); _layoutsSaveTimer = setTimeout(flushLayouts, 500); }\n", '').replace('      wordlessTitles(snap); // a rollback point is a layout record too (the disk belt above may read what an older build wrote)\n', '');
  ok(PRE_SRC !== P_SRC && (PRE_SRC.match(/wordlessTitles\(/g) || []).length === 3, 'the control removes exactly the three calls (the helper stays defined)');
  const pre = await drive(MUT.load(P_REL, PRE_SRC, 'layout-titles-keep-words'), 'pre');
  ok(has(pre.read) && has(pre.relayed) && has(pre.disk) && has(pre.history), 'NEGATIVE CONTROL: the pre-r5 choke point serves the words on the first read, relays them, writes them to disk and into a rollback point — the legs above would go red', { read: has(pre.read), relayed: has(pre.relayed), disk: has(pre.disk), history: has(pre.history) });
}

// ── §6 THE JOURNAL ──
console.log('§6 the journal');
{
  const lines = journal.filter((l) => l.startsWith('[clear]'));
  const receipts = lines.filter((l) => !/ — FAILED/.test(l));
  ok(receipts.length >= 8 && receipts.every((l) => / — \d+ cleared by (owner|claude:|codex:)/.test(l)) && lines.some((l) => / — FAILED/.test(l)), `every clear wrote its journal line (${receipts.length}): the kind, the container, the count, who (the owner, or the agent's session key — claude: / codex:) — and the planted archive failure its FAILED line`, lines.filter((l) => !/ — \d+ cleared by (owner|claude:|codex:)/.test(l)));
  ok(!lines.some(has) && !journal.some((l) => l.startsWith('[clear]') && l.includes(CT)), 'NO journal line carries a word of what was cleared (ids and counts only)', lines.filter(has));
}

// ── §7 WIRING PINS ──
console.log('§7 wiring pins');
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  // each line cut at its first `//` OUTSIDE a string (a pin must be satisfied by CODE, never by a
  // trailing note — the 2.369.134 lesson); a scan per line, quotes and escapes tracked
  const cut = (l) => { let q = null; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === '`') q = c; else if (c === '/' && l[i + 1] === '/') return l.slice(0, i); } return l; };
  const strip = (s) => s.split('\n').map(cut).join('\n');
  const server = strip(read('server.js'));
  ok(/require\('\.\/src\/server\/record-clear\.js'\)\.create\(\{ tasks, userTodos, sessionStatus, getJobs: jobsWiring\.getJobs, getGroups: \(\) => channelsWiring\.groups, getChannels: \(\) => channelsWiring\.channels \}\)/.test(server) && /registerRecordClearRoutes\(app, \{ recordClear \}\)/.test(server) && /getRecordClear: \(\) => recordClear[, ][^\n]*\}\)/.test(server), 'server.js builds the ONE entry point over the five stores, registers the owner routes and hands it to the agent routes');
  const routes = strip(read('src/routes/records-clear.js'));
  ok((routes.match(/if \(isAgentBearer\(req\)\) return fail\(res, RC\.refuse\('agent_forbidden'\)\);/g) || []).length === 2, 'both owner routes refuse an agent token FIRST');
  for (const [f, re] of [
    ['src/task-groups.js', /applyClear\(p, \{ kind: 'activity', by, at \}\)/], ['src/user-todos.js', /applyClear\(item, \{ kind: 'todo', by, at \}\)/],
    ['src/session-status.js', /applyClear\(h, \{ kind: 'status', by, at \}\)/], ['src/jobs.js', /applyClear\(j, \{ kind: 'job', by, at \}\)/],
    ['src/server/groups-engine.js', /RC\.foldClears\(store\.readTail\(A, gid/],
  ]) ok(re.test(strip(read(f))), `${f}: its door goes through the PURE module`);
  for (const [f, re] of [
    ['src/lib/task-log.js', /clearRecords\(rows\)/], ['src/lib/user-todos-panel.js', /model\.menuFor\(row\.dataset\.id\)/], ['src/lib/inbox-window.js', /model\.menuFor\(id\)/],
    ['src/lib/session-props.js', /kind: 'status', sessionKey: histKey/], ['src/lib/jobs-panel.js', /kind: 'job', id: j\.id/], ['src/lib/channel-window.js', /kind: 'group-message', groupId, id: rec\.vendorId/],
  ]) ok(re.test(strip(read(f))), `${f}: offers "Clear content…" through the ONE client path`);
  const ui = strip(read('src/lib/record-clear-ui.js'));
  ok(/createModalShell\(/.test(ui) && !/\bconfirm\(/.test(ui.replace(/confirmClear|confirm-/g, '')) && /textContent = w \?/.test(ui), 'the ONE confirm dialog: createModalShell, no native confirm, the record\'s words as TEXT');
}

console.log('tree: the patched copies never touch the tree');
for (const r of copiesCensus(MUT.files, MUT.dir, ROOT, { minCopies: 2 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);

try { J_W.shutdown(); } catch { }
try { gStore.close(); } catch { }
userTodos.stop();
sessionStatus.flush();
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
