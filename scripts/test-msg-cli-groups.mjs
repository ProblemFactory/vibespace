#!/usr/bin/env node
// THE AGENT GROUPS CLI (docs/design-communication-panel.zh.md §22.5, chunk
// g2; gate row `test-msg-cli-groups`, fast). The model + engine are gated by
// test-channel-groups; THIS suite gates what an agent types and reads:
//
//   §1 data/bin/vibespace-msg against a STUB server (a free port, owned by
//      this process): every verb's request (method, path, body/query, the
//      bearer), THE WAKE ECHO ("woke N agents = N billed turns" — said even
//      when N is 0), a typed refusal printed with its code + candidates +
//      remedy and exit 1, 2 outside a session, 3 when the server is gone,
//      and the JOB fence: under VIBESPACE_JOB_TOKEN a membership verb is
//      refused LOCALLY and no request leaves (control: the same command with
//      a session token DOES reach the stub).
//   §2 the ROUTES over the REAL groups engine + REAL channel store + REAL
//      delivery ladder with a recording authorizer (setupAgentRoutes on a
//      fake app): a member name two reachable sessions share is refused
//      `ambiguous` WITH both conversation ids and writes nothing (control: a
//      unique name creates + wakes once, reason peer-message); an ambiguous
//      GROUP name never falls through to a session lookup; a jbt_ token may
//      list / read / post into an EXISTING group or pair but `group create`
//      and a first `send <agent>` answer `job-token` and create nothing
//      (control: the owner conversation's own session token makes the pair).
//   §3 the words: the manual's Groups section, the docs index line, and the
//      ONE groups pointer line in the Reporting-back teaching — present,
//      ≤ 300 B, and a patched copy without it is caught by the same judge.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const CLI = path.join(REPO, 'data/bin/vibespace-msg');
const ROOT = scratch('msg-cli-groups');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

console.log('§1 the CLI against a stub server');
ok(fs.existsSync(CLI) && (fs.statSync(CLI).mode & 0o111) !== 0, 'data/bin/vibespace-msg exists and is executable');
ok(require(path.join(REPO, 'src/hosts.js')).HostManager.AGENT_TOOLS.includes('vibespace-msg'), 'it is in HostManager.AGENT_TOOLS (ships to remote hosts)');
{
  const src = fs.readFileSync(CLI, 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  const reqs = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  ok(reqs.length === 0, 'it is dependency-free (a host has no checkout)', reqs.join(','));
}

const seen = [];
let override = null;   // (method, path) => {status, body} | null
const REPLIES = {
  'POST /api/agent/msg/group': (b) => ({
    ok: true, op: b.op,
    group: { id: 'g-0000abcd', name: b.op === 'rename' ? b.name : 'api', archived: b.op === 'archive', members: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }] },
    added: b.op === 'invite' ? ['delta'] : null, already: b.op === 'invite' ? ['beta'] : null,
    woke: b.quiet ? [] : (b.op === 'create' ? ['beta', 'gamma'] : b.op === 'invite' ? ['delta'] : []),
    refused: [], quiet: !!b.quiet, archived: false, noop: null, notify: b.notify || null,
  }),
  'POST /api/agent/msg/send': (b) => (b.wake
    ? { posted: true, group: { id: 'g-0000abcd', name: 'api', pair: false }, pairCreated: false, woke: ['beta', 'gamma'], refused: [], nextTurn: [] }
    : { posted: true, group: { id: 'g-0000ffff', name: 'alpha & beta', pair: true }, pairCreated: true, woke: [], refused: [], nextTurn: ['beta'] }),
  'GET /api/agent/msg/read': () => ({ ok: true, group: { id: 'g-0000abcd', name: 'api' }, records: [{ at: 7, from: 'alpha', kind: 'message', text: 'hello' }] }),
  'GET /api/agent/msg/groups': () => ({ groups: [{ id: 'g-0000abcd', name: 'api', pair: false, archived: false, unread: 3, notify: 'mention', members: [{ name: 'alpha', notify: 'next-turn', live: true }] }] }),
  'GET /api/agent/msg/peers': () => ({ peers: [{ name: 'beta', conversationId: 'cid-b', level: 'messageable', state: 'working' }] }),
};
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const b = body ? JSON.parse(body) : null;
    seen.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: b, auth: req.headers.authorization || null });
    const key = req.method + ' ' + u.pathname;
    const o = override ? override(key, b) : null;
    const status = o ? o.status : REPLIES[key] ? 200 : 404;
    const out = o ? o.body : REPLIES[key] ? REPLIES[key](b || {}) : { error: 'no stub' };
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
// ASYNC: the stub lives in THIS process — a spawnSync would block the loop that answers it
const run = (args, env = { VIBESPACE_SESSION_TOKEN: 'vsst_cli' }, api = API) => new Promise((resolve) => {
  execFile(process.execPath, [CLI, ...args], { encoding: 'utf-8', env: { PATH: process.env.PATH, VIBESPACE_API: api, ...env }, timeout: 15000 },
    (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: stdout || '', err: stderr || '' }));
});
const last = () => seen[seen.length - 1];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
{
  const noEnv = spawnSync(process.execPath, [CLI, 'group', 'list'], { encoding: 'utf-8', env: { PATH: process.env.PATH }, timeout: 15000 });
  ok(noEnv.status === 2 && /not inside a VibeSpace session/.test(noEnv.stderr), 'outside a session: exit 2, said');

  let r = await run(['group', 'create', 'api', 'beta', 'gamma', '--context', 'we split the API work here']);
  ok(r.code === 0 && last().method === 'POST' && last().path === '/api/agent/msg/group' && same(last().body, { op: 'create', name: 'api', members: ['beta', 'gamma'], context: 'we split the API work here' }) && last().auth === 'Bearer vsst_cli',
    'group create <name> <member…> --context ⇒ POST /group {op, name, members, context} with the session bearer (never argv)', JSON.stringify(last()));
  ok(/woke 2 invitees = 2 billed turns: beta, gamma/.test(r.out), 'THE WAKE ECHO: create says "woke 2 invitees = 2 billed turns" and names them', r.out);

  r = await run(['group', 'invite', 'g-0000abcd', 'delta', 'beta', '--context', 'you own the schema', '--quiet']);
  ok(same(last().body, { op: 'invite', group: 'g-0000abcd', members: ['delta', 'beta'], context: 'you own the schema', quiet: true }), 'group invite <group> <member…> --context --quiet ⇒ {op, group, members, context, quiet:true}', JSON.stringify(last().body));
  ok(/woke 0 invitees = 0 billed turns/.test(r.out) && /added to "api": delta/.test(r.out) && /already members \(nothing done\): beta/.test(r.out), '--quiet says the ZERO count; a duplicate invitee is named as a no-op', r.out);
  r = await run(['group', 'invite', 'g-0000abcd', 'delta']);
  ok(!('quiet' in last().body) && /woke 1 invitee = 1 billed turn: delta/.test(r.out), 'an invite without --quiet wakes: "woke 1 invitee = 1 billed turn" (singular spelled right)', r.out);

  r = await run(['group', 'leave', 'g-0000abcd']);
  ok(r.code === 0 && same(last().body, { op: 'leave', group: 'g-0000abcd' }), 'group leave <group> ⇒ {op, group}', JSON.stringify(last().body));
  r = await run(['group', 'kick', 'api', 'delta']);
  ok(same(last().body, { op: 'kick', group: 'api', member: 'delta' }), 'group kick <group> <member> ⇒ {op, group, member}', JSON.stringify(last().body));
  r = await run(['group', 'rename', 'g-0000abcd', 'api', 'v2', 'lane']);
  ok(same(last().body, { op: 'rename', group: 'g-0000abcd', name: 'api v2 lane' }) && /renamed to "api v2 lane"/.test(r.out), 'group rename <group> <name…> ⇒ the words joined into ONE name', JSON.stringify(last().body));
  r = await run(['group', 'notify', 'g-0000abcd', 'always']);
  ok(same(last().body, { op: 'notify', group: 'g-0000abcd', notify: 'always' }) && /now always/.test(r.out), 'group notify <group> <mode> ⇒ ONLY the caller\'s own mode (no member field)', JSON.stringify(last().body));
  r = await run(['group', 'archive', 'g-0000abcd']);
  ok(same(last().body, { op: 'archive', group: 'g-0000abcd' }), 'group archive <group> ⇒ {op, group}');

  const before = seen.length;
  r = await run(['group', 'list']);
  const r2 = await run(['groups']);
  ok(seen.length === before + 2 && seen.slice(-2).every((x) => x.method === 'GET' && x.path === '/api/agent/msg/groups') && r.out === r2.out, '`group list` and `groups` are the same GET /groups', JSON.stringify(seen.slice(-2)));
  ok(/g-0000abcd  "api" — 3 unread · your notify: mention/.test(r.out), 'group list prints id · name · unread · the caller\'s mode', r.out);

  r = await run(['read', 'api', '--before', '1700000000000', '--limit', '20']);
  ok(last().path === '/api/agent/msg/read' && same(last().query, { group: 'api', before: '1700000000000', limit: '20' }), 'read <group> --before <ts> --limit n ⇒ the query', JSON.stringify(last().query));
  ok(/older: vibespace-msg read g-0000abcd --before 7/.test(r.out), 'read prints the next --before pointer');

  r = await run(['send', 'beta', 'the schema is in /tmp/s.sql']);
  ok(same(last().body, { to: 'beta', text: 'the schema is in /tmp/s.sql', wake: false }), 'send <agent> "…" ⇒ {to, text, wake:false}', JSON.stringify(last().body));
  ok(/your direct group "alpha & beta"/.test(r.out) && /created just now/.test(r.out) && /woke 0 agents = 0 billed turns/.test(r.out) && /on their next turn \(free\): beta/.test(r.out), 'a plain send SAYS the zero count and who gets it on their next turn, free', r.out);
  r = await run(['send', 'api', 'ship it', '--wake']);
  ok(last().body.wake === true && /woke 2 agents = 2 billed turns: beta, gamma/.test(r.out), 'send <group> --wake ⇒ wake:true, echoed "woke 2 agents = 2 billed turns"', r.out);

  // ── r2 finding 1: a wide wake is confirmed BEFORE the act ──
  override = (key) => (key === 'POST /api/agent/msg/send' ? { status: 409, body: { error: 'this would wake 25 agents now = 25 billed turns — confirm with --yes', code: 'confirm-wakes', wakes: 25 } } : null);
  r = await run(['send', 'api', 'everyone up', '--wake']);
  ok(r.code === 1 && /refused \[confirm-wakes\]/.test(r.err) && /25 billed turns/.test(r.err) && /→ .*--yes/.test(r.err) && !r.out.includes('posted'), 'a send that would wake many is refused [confirm-wakes] with the COUNT and the --yes remedy — nothing claimed posted', r.err);
  override = null;
  r = await run(['send', 'api', 'everyone up', '--wake', '--yes']);
  ok(last().body.yes === true && last().body.wake === true, 'send … --wake --yes ⇒ {wake:true, yes:true}', JSON.stringify(last().body));
  r = await run(['group', 'create', 'big', 'beta', 'gamma', '--yes']);
  ok(last().body.yes === true && last().body.op === 'create', 'group create … --yes ⇒ yes:true', JSON.stringify(last().body));
  r = await run(['group', 'invite', 'g-0000abcd', 'delta']);
  ok(!('yes' in last().body), 'CONTROL: without --yes no yes field is sent', JSON.stringify(last().body));
  // ── typed refusals ──
  override = (key) => (key === 'POST /api/agent/msg/send' ? { status: 400, body: { error: 'ambiguous name "beta" — 2 sessions you can message are called that: cid-b1, cid-b2; name one by its conversation id', code: 'ambiguous', candidates: [{ name: 'beta', conversationId: 'cid-b1' }, { name: 'beta', conversationId: 'cid-b2' }] } } : null);
  r = await run(['send', 'beta', 'hi']);
  ok(r.code === 1 && /refused \[ambiguous\]/.test(r.err) && /\n\s+cid-b1\s+"beta"/.test(r.err) && /\n\s+cid-b2\s+"beta"/.test(r.err) && /→ repeat the command with one of the ids above/.test(r.err) && !r.out.includes('posted'),
    'AMBIGUITY: exit 1, the code, EVERY candidate id on its own line, and the remedy — nothing claimed posted', r.err);
  override = (key) => (key === 'POST /api/agent/msg/group' ? { status: 404, body: { error: 'no agent session "zed" you can message (not found, not live, or outside your reach — vibespace-msg list shows it)', code: 'unreachable' } } : null);
  r = await run(['group', 'invite', 'api', 'zed']);
  ok(r.code === 1 && /refused \[unreachable\]/.test(r.err) && /→ vibespace-msg list shows every session you can message/.test(r.err), 'unreachable: exit 1 + the remedy line', r.err);
  override = (key) => (key === 'POST /api/agent/msg/send' ? { status: 429, body: { error: 'rate floor: one --wake per target per 30s' } } : null);
  r = await run(['send', 'api', 'again', '--wake']);
  ok(r.code === 1 && /refused \[rate-floor\] — rate floor/.test(r.err), 'a code-less 429 is still a typed refusal ([rate-floor]), exit 1', r.err);
  override = (key) => (key === 'GET /api/agent/msg/groups' ? { status: 500, body: {} } : null);
  r = await run(['group', 'list']);
  ok(r.code === 1 && /refused \[error\]/.test(r.err) && /HTTP 500/.test(r.err), 'a non-2xx with no body is a refusal (exit 1), never silently "no groups"', r.err);
  override = null;
  r = await run(['group', 'list'], { VIBESPACE_SESSION_TOKEN: 'vsst_cli' }, 'http://127.0.0.1:1');
  ok(r.code === 3 && /server unreachable/.test(r.err), 'server gone: exit 3, said');

  // ── the job fence ──
  const n0 = seen.length;
  r = await run(['group', 'create', 'x', 'beta'], { VIBESPACE_JOB_TOKEN: 'jbt_job1' });
  ok(r.code === 1 && /refused \[job-token\]/.test(r.err) && /never creates a group or changes membership/.test(r.err) && seen.length === n0, 'JOB FENCE: under VIBESPACE_JOB_TOKEN `group create` is refused LOCALLY (exit 1, job-token) and NO request leaves', r.err);
  for (const op of [['invite', 'api', 'beta'], ['leave', 'api'], ['kick', 'api', 'beta'], ['rename', 'api', 'y'], ['archive', 'api'], ['notify', 'api', 'mute']]) {
    const rr = await run(['group', ...op], { VIBESPACE_JOB_TOKEN: 'jbt_job1' });
    ok(rr.code === 1 && /job-token/.test(rr.err) && seen.length === n0, `…and so is \`group ${op[0]}\``, rr.err);
  }
  r = await run(['group', 'create', 'x', 'beta'], { VIBESPACE_SESSION_TOKEN: 'vsst_cli', VIBESPACE_JOB_TOKEN: 'jbt_job1' });
  ok(r.code === 0 && seen.length === n0 + 1 && last().auth === 'Bearer vsst_cli', 'CONTROL: a session token (even beside a job token) DOES reach the stub — the fence is the token, not the verb');
  r = await run(['send', 'api', 'batch done'], { VIBESPACE_JOB_TOKEN: 'jbt_job1' });
  ok(r.code === 0 && last().path === '/api/agent/msg/send' && last().auth === 'Bearer jbt_job1', 'a job may SEND (the jbt_ bearer)', JSON.stringify(last()));
  r = await run(['read', 'api'], { VIBESPACE_JOB_TOKEN: 'jbt_job1' });
  ok(r.code === 0 && last().path === '/api/agent/msg/read' && last().auth === 'Bearer jbt_job1', '…and READ');
  r = await run(['group', 'list'], { VIBESPACE_JOB_TOKEN: 'jbt_job1' });
  ok(r.code === 0 && last().path === '/api/agent/msg/groups', '…and LIST its owner\'s groups');

  r = await run(['help-me']);
  ok(/group list/.test(r.out) && /ambiguous name is refused with the candidates/.test(r.out) && /Inside a Background Work job: list \/ group list \/ read \/ send only/.test(r.out), 'the usage names group list, the ambiguity rule and the job fence', r.out);
}
srv.close();

console.log('§2 the routes over the REAL engine + store + ladder');
{
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
  const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
  const AR = require(path.join(REPO, 'src/agent-routes.js'));
  const A = 'aaaaaaaa-1111-4000-8000-000000000001';
  const B1 = 'bbbbbbbb-2222-4000-8000-000000000002';
  const B2 = 'bbbbbbbb-2222-4000-8000-000000000003';
  const C = 'cccccccc-3333-4000-8000-000000000004';
  const dataDir = path.join(ROOT, 'routes');
  fs.mkdirSync(dataDir, { recursive: true });
  const store = createChannelStore({ dir: path.join(dataDir, 'channels') });
  const roster = [
    { cid: A, name: 'alpha', groups: ['tg1'], reachability: null },
    { cid: B1, name: 'beta', groups: ['tg1'], reachability: null },
    { cid: B2, name: 'beta', groups: ['tg1'], reachability: null },
    { cid: C, name: 'gamma', groups: ['tg1'], reachability: null },
  ];
  const sessions = new Map();
  for (const r of roster) sessions.set('w-' + r.cid.slice(-4), { claudeSessionId: r.cid, name: r.name, mode: 'chat', cwd: '/tmp', agentToken: 'vsst_' + r.cid.slice(-4) });
  const auths = [], posts = [];
  const deliver = DELIVER.create({
    dataDir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (cid) => ({ name: cid, socketPath: '/dev/null' }), postToPeer: async (peer, text) => { posts.push({ cid: peer.name, text }); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
    emitPeerCard: () => {},
    authorizeSpend: (req) => { auths.push({ reason: req.reason, cid: req.cid }); return refuseSpend ? { ok: false, why: 'hour-cap', detail: 'hour cap reached', limits: { perIdentityHour: 1 } } : { ok: true, identity: { key: 'slot-1' } }; },
    noteSpend: () => {}, releaseSpend: () => {},
  });
  let refuseSpend = false;
  let t = Date.UTC(2026, 8, 22, 10, 0, 0);
  const eng = GE.create({ store, deliver, broadcast: () => {}, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
  const jobs = { j1: { id: 'j1', owner: { conversation: { id: A } } } };
  const jm = { ready: true, jobByToken: (tok) => (tok === 'jbt_owned' ? jobs.j1 : null), jobs: new Map() };
  const routes = {};
  const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
  AR.setupAgentRoutes({
    app, activeSessions: sessions,
    tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => null },
    sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' },
    userTodos: {}, sessionStatusKey: (s) => 'claude:' + s.claudeSessionId, serverSetting: () => undefined,
    integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => jm, deliver,
    getGroups: () => eng,
  });
  const call = (method, p, { token, body, query } = {}) => new Promise((resolve) => {
    let status = 200;
    const res = { status(s) { status = s; return this; }, json(o) { resolve({ status, body: o }); } };
    const h = routes[method + ' ' + p];
    if (!h) return resolve({ status: 0, body: { error: 'no route ' + p } });
    h({ headers: { authorization: 'Bearer ' + token }, body: body || {}, query: query || {} }, res);
  });
  const groupCount = () => Object.keys(store.groups.live().groups).length;
  const TA = 'vsst_' + A.slice(-4);

  let r = await call('POST', '/api/agent/msg/group', { token: TA, body: { op: 'create', name: 'lane', members: ['beta'] } });
  ok(r.status === 400 && r.body.code === 'ambiguous' && Array.isArray(r.body.candidates) && r.body.candidates.map((c) => c.conversationId).sort().join(',') === [B1, B2].sort().join(',') && r.body.error.includes(B1) && r.body.error.includes(B2),
    'AMBIGUITY: a member name two reachable sessions share ⇒ 400 `ambiguous` WITH both conversation ids (in `candidates` and in the words)', JSON.stringify(r));
  ok(groupCount() === 0 && auths.length === 0, '…and nothing is created, nobody is woken');
  r = await call('POST', '/api/agent/msg/group', { token: TA, body: { op: 'create', name: 'lane', members: ['gamma', B1], context: 'we split it' } });
  ok(r.status === 200 && r.body.ok && r.body.woke.length === 2 && auths.length === 2 && auths.every((x) => x.reason === 'peer-message'),
    'CONTROL: a unique name + a conversation id resolve — the create wakes 2, the ladder\'s authorizer asked twice with reason peer-message', JSON.stringify(r.body));
  const laneId = r.body.group ? r.body.group.id : null;

  // an ambiguous GROUP name never falls through to a session lookup
  await call('POST', '/api/agent/msg/group', { token: TA, body: { op: 'create', name: 'dup', members: [C], quiet: true } });
  await call('POST', '/api/agent/msg/group', { token: TA, body: { op: 'create', name: 'dup', members: [B1], quiet: true } });
  const n1 = groupCount();
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'dup', text: 'which one?' } });
  ok(r.status === 400 && r.body.code === 'ambiguous' && r.body.candidates.length === 2 && r.body.candidates.every((c) => /^g-[0-9a-f]{8}$/.test(c.groupId)) && groupCount() === n1,
    'an ambiguous GROUP name ⇒ `ambiguous` with the group ids — no post, no session lookup, no pair created', JSON.stringify(r.body));

  // ── the job fence at the route ──
  const n2 = groupCount();
  r = await call('POST', '/api/agent/msg/group', { token: 'jbt_owned', body: { op: 'create', name: 'jobgroup', members: ['gamma'] } });
  ok(r.status === 403 && r.body.code === 'job-token' && /never creates a group or changes membership/.test(r.body.error) && groupCount() === n2, 'jbt_ `group create` ⇒ 403 job-token, the refusal SAYS what a job may do, nothing created', JSON.stringify(r.body));
  r = await call('POST', '/api/agent/msg/group', { token: 'jbt_owned', body: { op: 'notify', group: laneId, notify: 'mute' } });
  ok(r.status === 403 && r.body.code === 'job-token', 'jbt_ `group notify` ⇒ job-token too (membership is the conversation\'s own act)');
  const aBefore = auths.length;
  r = await call('POST', '/api/agent/msg/send', { token: 'jbt_owned', body: { to: 'gamma', text: 'batch finished' } });
  ok(r.status === 403 && r.body.code === 'job-token' && groupCount() === n2, 'jbt_ `send <agent>` with NO existing pair ⇒ job-token, no pair created', JSON.stringify(r.body));
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'gamma', text: 'hello gamma' } });
  ok(r.status === 200 && r.body.posted && r.body.pairCreated === true && groupCount() === n2 + 1, 'CONTROL: the owner conversation\'s OWN session token makes the pair', JSON.stringify(r.body));
  const pairId = r.body.group.id;
  r = await call('POST', '/api/agent/msg/send', { token: 'jbt_owned', body: { to: 'gamma', text: 'batch finished' } });
  ok(r.status === 200 && r.body.posted && r.body.group.id === pairId && r.body.pairCreated === false && auths.length === aBefore, 'jbt_ `send <agent>` into the EXISTING pair posts as the owner (next-turn default: zero authorizations)', JSON.stringify(r.body));
  r = await call('POST', '/api/agent/msg/send', { token: 'jbt_owned', body: { to: laneId, text: 'into the lane' } });
  ok(r.status === 200 && r.body.posted && r.body.group.id === laneId, 'jbt_ `send <group>` into a group the owner belongs to posts');
  r = await call('GET', '/api/agent/msg/groups', { token: 'jbt_owned' });
  ok(r.status === 200 && r.body.groups.some((g) => g.id === pairId) && r.body.groups.some((g) => g.id === laneId), 'jbt_ `group list` = the owner conversation\'s groups');
  r = await call('GET', '/api/agent/msg/read', { token: 'jbt_owned', query: { group: pairId } });
  ok(r.status === 200 && r.body.records.some((x) => x.text === 'batch finished' && x.from === 'alpha'), 'jbt_ `read` returns the log; the job\'s post is signed by its OWNER', JSON.stringify(r.body.records));
  r = await call('GET', '/api/agent/msg/peers', { token: 'jbt_owned' });
  ok(r.status === 200 && Array.isArray(r.body.peers) && !r.body.peers.some((p) => p.conversationId === A), 'jbt_ `list` answers (the owner itself not listed as a peer)', JSON.stringify(r.body));
  r = await call('POST', '/api/agent/msg/send', { token: 'jbt_nobody', body: { to: 'gamma', text: 'x' } });
  ok(r.status === 401 && r.body.code === 'auth', 'an unknown job token ⇒ 401 `auth`');
  jm.ready = false;
  r = await call('GET', '/api/agent/msg/groups', { token: 'jbt_owned' });
  jm.ready = true;
  ok(r.status === 503 && r.body.code === 'unavailable', 'a jobs engine that is not ready ⇒ 503 `unavailable` (never a misleading "unknown token")', JSON.stringify(r));
  r = await call('POST', '/api/agent/msg/group', { token: TA, body: { op: 'invite', group: pairId, members: [B1] } });
  ok(r.status === 409 && r.body.code === 'pair-group', 'a typed refusal keeps its code + status through the route (pair-group 409)', JSON.stringify(r.body));

  // ── PACING: every wake the post would cause is floored per (sender, RESOLVED target) ──
  const D = 'dddddddd-4444-4000-8000-000000000005';
  roster.push({ cid: D, name: 'delta', groups: ['tg1'], reachability: null });
  sessions.set('w-' + D.slice(-4), { claudeSessionId: D, name: 'delta', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_' + D.slice(-4) });
  const E = 'eeeeeeee-5555-4000-8000-000000000006';
  roster.push({ cid: E, name: 'eps', groups: ['tg1'], reachability: null });
  sessions.set('w-' + E.slice(-4), { claudeSessionId: E, name: 'eps', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_' + E.slice(-4) });
  r = await call('POST', '/api/agent/msg/group', { token: TA, body: { op: 'create', name: 'pace', members: ['eps'], quiet: true } });   // quiet: no wake yet, so no floor
  const paceId = r.body.group.id;
  const aPace = auths.length;
  const pace = [];
  for (let i = 0; i < 5; i++) pace.push(call('POST', '/api/agent/msg/send', { token: TA, body: { to: paceId, text: `@eps ping ${i}` } }));
  const paced = await Promise.all(pace);
  const wokeN = paced.reduce((n, x) => n + ((x.body.woke || []).length), 0);
  const flooredN = paced.reduce((n, x) => n + ((x.body.refused || []).filter((w) => /rate floor/.test(w.reason)).length), 0);
  ok(paced.every((x) => x.status === 200 && x.body.posted) && wokeN === 1 && flooredN === 4 && auths.length === aPace + 1,
    'five `@eps` messages in a second ⇒ ONE wake + four floored (every message posted; the authorizer asked once)', JSON.stringify({ wokeN, flooredN, auths: auths.length - aPace, answers: paced.map((x) => x.status + ':' + JSON.stringify(x.body.refused)) }));
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'delta', text: 'urgent one', wake: true } });
  ok(r.status === 200 && r.body.woke.length === 1, 'CONTROL: the first --wake to delta (by NAME) wakes', JSON.stringify(r.body));
  const aId = auths.length;
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: D, text: 'urgent two', wake: true } });
  ok(r.status === 200 && r.body.posted && r.body.woke.length === 0 && r.body.refused.length === 1 && /rate floor/.test(r.body.refused[0].reason) && auths.length === aId,
    'the same target by its conversation ID right after ⇒ FLOORED (the key is the resolved target, never the `to` spelling); the message still posts', JSON.stringify(r.body));

  // ── a group NAMED like a session is never a silent shadow ──
  r = await call('POST', '/api/agent/msg/group', { token: TA, body: { op: 'create', name: 'delta', members: ['gamma'], quiet: true } });
  const shadowId = r.body.group.id;
  const beforeShadow = store.readTail('groups', shadowId, { limit: 50 }).length;
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'delta', text: 'who gets this?' } });
  ok(r.status === 400 && r.body.code === 'ambiguous' && r.body.candidates.some((c) => c.groupId === shadowId) && r.body.candidates.some((c) => c.conversationId === D) && store.readTail('groups', shadowId, { limit: 50 }).length === beforeShadow,
    'a bare name that is BOTH one of my groups and a messageable session ⇒ `ambiguous` with both candidates (group id + conversation id), nothing posted', JSON.stringify(r.body));
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: shadowId, text: 'to the group by id' } });
  ok(r.status === 200 && r.body.group.id === shadowId, 'CONTROL: `send g-<id>` routes to the group');
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: D, text: 'to delta by id' } });
  ok(r.status === 200 && r.body.group.pair === true && r.body.group.id !== shadowId, 'CONTROL: `send <conversation id>` routes to the session (its direct group)', JSON.stringify(r.body));

  // ── a caller with no conversation id never takes the pre-groups direct lane ──
  sessions.set('w-nocid', { claudeSessionId: null, backendSessionId: null, name: 'fresh', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_nocid' });
  const g1 = [...sessions.values()].find((x) => x.claudeSessionId === C);
  g1._msgReachability = 'messageable';   // the legacy lane would reach gamma
  const nPosts = posts.length, nAuth = auths.length, nGroups = groupCount();
  r = await call('POST', '/api/agent/msg/send', { token: 'vsst_nocid', body: { to: 'gamma', text: 'before my first turn' } });
  ok(r.status === 409 && r.body.code === 'bad-member' && posts.length === nPosts && auths.length === nAuth && groupCount() === nGroups,
    'with the groups engine present, a session WITHOUT a conversation id ⇒ 409 bad-member — no delivery, no authorization, no group (D2 is never bypassed)', JSON.stringify(r));
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'gamma', text: 'before my first turn' } });
  ok(r.status === 200 && r.body.posted && r.body.group.pair === true && posts.length === nPosts, 'CONTROL: the same body from a session WITH a conversation id is posted into the pair (next-turn: nobody woken)', JSON.stringify(r.body));

  // ── r2 finding 8: a wake the authorizer REFUSES (not billed) does not spend the floor ──
  const F = 'ffffffff-6666-4000-8000-000000000007';
  roster.push({ cid: F, name: 'phi', groups: ['tg1'], reachability: null });
  sessions.set('w-' + F.slice(-4), { claudeSessionId: F, name: 'phi', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_' + F.slice(-4) });
  refuseSpend = true;
  const aPhi = auths.length;
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'phi', text: 'first, refused', wake: true } });
  ok(r.status === 200 && r.body.woke.length === 0 && r.body.refused.length === 1 && !/rate floor/.test(r.body.refused[0].reason), 'FIXTURE: the authorizer refuses the first --wake to phi (not billed)', JSON.stringify(r.body));
  refuseSpend = false;
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'phi', text: 'second, allowed', wake: true } });
  ok(r.status === 200 && r.body.woke.length === 1 && auths.length === aPhi + 2, 'a refused wake does NOT consume the 30 s floor: the next --wake a second later WAKES (the authorizer asked twice)', JSON.stringify({ body: r.body, asked: auths.length - aPhi }));

  // ── r2 finding 1: one command never spends a slot's hour ──
  const BOSS = '0b055000-7777-4000-8000-000000000008';
  roster.push({ cid: BOSS, name: 'boss', groups: ['tg1'], reachability: null });
  sessions.set('w-boss', { claudeSessionId: BOSS, name: 'boss', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_boss' });
  const many = [];
  for (let i = 0; i < 25; i++) {
    const cid = `0c0c0c${String(i).padStart(2, '0')}-8888-4000-8000-0000000000${String(i).padStart(2, '0')}`;
    roster.push({ cid, name: 'm' + String(i).padStart(2, '0'), groups: ['tg1'], reachability: null });
    sessions.set('w-m' + i, { claudeSessionId: cid, name: 'm' + String(i).padStart(2, '0'), mode: 'chat', cwd: '/tmp', agentToken: 'vsst_m' + i });
    many.push(cid);
  }
  const nWide = groupCount(), aWide = auths.length;
  r = await call('POST', '/api/agent/msg/group', { token: 'vsst_boss', body: { op: 'create', name: 'wide', members: many } });
  ok(r.status === 409 && r.body.code === 'confirm-wakes' && r.body.wakes === 25 && /25 billed turns/.test(r.body.error) && /--yes/.test(r.body.error) && groupCount() === nWide && auths.length === aWide,
    'a create that would wake 25 is refused BEFORE the act — `confirm-wakes`, the count (25 billed turns) and the --yes remedy; nothing created, nobody asked', JSON.stringify(r.body));
  r = await call('POST', '/api/agent/msg/group', { token: 'vsst_boss', body: { op: 'create', name: 'wide', members: many, yes: true } });
  const wideId = r.body.group ? r.body.group.id : null;
  const floorRefused = (r.body.refused || []).filter((w) => /rate floor/.test(w.reason));
  ok(r.status === 200 && r.body.woke.length === 8 && floorRefused.length === 17 && auths.length === aWide + 8,
    'with --yes: ONE sender wakes at most 8 per minute — 8 woken, 17 floored (posted, not billed; they read it next turn); the authorizer asked 8 times, not 25', JSON.stringify({ woke: (r.body.woke || []).length, floored: floorRefused.length, asked: auths.length - aWide }));
  const auditFloor = store.auditTail({ limit: 5000 }).filter((a) => a.kind === 'group-wake' && a.groupId === wideId && a.refused === 'rate-floor');
  ok(auditFloor.length === 17 && auditFloor.every((a) => /per sender|a minute|per minute/.test(a.reason)), 'every floored wake is AUDITED with the sender-budget reason', JSON.stringify(auditFloor.slice(0, 2)));
  for (const cid of many) await eng.setNotify({ by: 'user', group: wideId, member: cid, notify: 'always' });
  const aAlways = auths.length;
  r = await call('POST', '/api/agent/msg/send', { token: 'vsst_boss', body: { to: wideId, text: 'plain post into 25 always-members' } });
  ok(r.status === 409 && r.body.code === 'confirm-wakes' && r.body.wakes === 25 && auths.length === aAlways, 'a PLAIN post that would wake 25 `always` members is refused before the act too (the count said first)', JSON.stringify(r.body));
  r = await call('POST', '/api/agent/msg/send', { token: 'vsst_boss', body: { to: wideId, text: 'plain post into 25 always-members', yes: true } });
  ok(r.status === 200 && r.body.posted && r.body.woke.length === 0 && r.body.refused.length === 25 && auths.length === aAlways, '…confirmed, inside the same minute: 0 woken, 25 floored (the sender\'s minute is spent) — posted, never billed', JSON.stringify({ woke: r.body.woke, refused: (r.body.refused || []).length }));
  r = await call('POST', '/api/agent/msg/send', { token: TA, body: { to: 'gamma', text: 'a small one', wake: true } });
  ok(r.status === 200 && r.body.posted, 'CONTROL: a ≤ 5-wake send needs no --yes', JSON.stringify(r.body));

  // ── r2 finding 6: the floor survives a restart (a fresh routes module + engine over the SAME store dir) ──
  try { deliver.flush(); } catch {}
  store.close();
  const store2 = createChannelStore({ dir: path.join(dataDir, 'channels') });
  const eng2 = GE.create({ store: store2, deliver, broadcast: () => {}, now: () => (t += 1000), roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
  const arPath = require.resolve(path.join(REPO, 'src/agent-routes.js'));
  delete require.cache[arPath];
  const AR2 = require(arPath);
  const routes2 = {};
  const app2 = { get: (p, h) => { routes2['GET ' + p] = h; }, post: (p, h) => { routes2['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
  AR2.setupAgentRoutes({
    app: app2, activeSessions: sessions,
    tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => null },
    sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' },
    userTodos: {}, sessionStatusKey: (s) => 'claude:' + s.claudeSessionId, serverSetting: () => undefined,
    integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => jm, deliver,
    getGroups: () => eng2,
  });
  const aRestart = auths.length;
  r = await new Promise((resolve) => { let status = 200; routes2['POST /api/agent/msg/send']({ headers: { authorization: 'Bearer ' + TA }, body: { to: 'phi', text: 'after the restart', wake: true }, query: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } }); });
  ok(r.status === 200 && r.body.posted && r.body.woke.length === 0 && r.body.refused.length === 1 && /rate floor/.test(r.body.refused[0].reason) && auths.length === aRestart,
    'after a RESTART (fresh routes module + engine over the same store) the same sender → phi --wake is STILL floored — the floor is persisted, not an in-memory Map', JSON.stringify(r.body));
  try { deliver.flush(); } catch {}
  store2.close();
}

console.log('§3 the words');
{
  const man = fs.readFileSync(path.join(REPO, 'docs/agent/msg-manual.md'), 'utf-8');
  const sec = (man.split(/^## Groups$/m)[1] || '').split(/^## /m)[0];
  ok(sec.length > 0, 'docs/agent/msg-manual.md has a "## Groups" section');
  const musts = [
    [/exist only because somebody made one/, 'explicit groups'],
    [/NO automatic group per Task\s+Group/, 'no automatic group per Task Group'],
    [/direct message is a two-member group/, 'DM = pair'],
    [/`next-turn`[\s\S]*costs nothing/, 'next-turn costs nothing'],
    [/Waking is a billed turn/, 'a wake is billed'],
    [/--context/, 'invite context'],
    [/`--quiet`/, '--quiet'],
    [/read <group> --before <ts>/, 'read --before for history'],
    [/woke 2 agents = 2 billed turns/, 'the wake echo'],
  ];
  for (const [re, what] of musts) ok(re.test(sec), `…Groups section says: ${what}`);
  ok(/job-token/.test(man) && /candidates/.test(man), 'the manual names the job fence and the ambiguity candidates');
  const idx = fs.readFileSync(path.join(REPO, 'docs/agent/index-manual.md'), 'utf-8');
  ok(/\*\*vibespace-msg\*\*[^\n]*GROUPS[^\n]*vibespace-docs msg/.test(idx), 'the vibespace-docs index line names groups and points at `vibespace-docs msg`');
  ok(/msg: 'msg-manual\.md'/.test(fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8')), 'the docs route serves the msg topic');

  // the ONE pointer line in the budgeted Reporting-back teaching
  const TG = require(path.join(REPO, 'src/task-groups.js'));
  const proto = (TG.TaskGroupManager || TG).prototype;
  const judge = (parts) => parts.filter((l) => /vibespace-msg/.test(l) && /group create/.test(l) && /vibespace-docs msg/.test(l));
  const one = proto._toolsSectionParts.call({}, '', false);
  const multi = proto._toolsSectionParts.call({}, '--group <id> ', true);
  const hits = judge(one);
  ok(hits.length === 1 && judge(multi).length === 1, 'the Reporting-back block carries exactly ONE groups pointer line (single- and multi-group)', hits.join(' | '));
  ok(hits.length === 1 && Buffer.byteLength(hits[0], 'utf-8') <= 300, `…within its budget (≤ 300 B; measured ${hits.length ? Buffer.byteLength(hits[0], 'utf-8') : '—'} B)`);
  ok(hits.length === 1 && /no cost/.test(hits[0]) && /billed/.test(hits[0]), '…and it says the default is free and a wake is billed');
  const allOff = proto._toolsSectionParts.call({}, '', false, { status: false, ask: false, task: false, jobs: false });
  ok(allOff.length === 0, 'every tool toggled off ⇒ no block at all (the pointer rides the block, never alone)');
  // NEGATIVE CONTROL: a patched copy of the teaching without the line
  const src = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf-8');
  const patched = src.replace(/\n\s*'Other agents: `vibespace-msg send[^\n]*\n\s*'',/, '');
  ok(patched !== src, 'CONTROL setup: the patch removed the line from a copy');
  const tmp = path.join(ROOT, 'task-groups.patched.cjs');
  fs.writeFileSync(tmp, patched.replace(/require\((['"])\.\//g, `require($1${path.join(REPO, 'src')}/`));
  const P = require(tmp);
  ok(judge((P.TaskGroupManager || P).prototype._toolsSectionParts.call({}, '', false)).length === 0, 'NEGATIVE CONTROL: the same judge finds NO pointer in the patched copy');
  // the whole baseline intro (no-task sessions) still under the inline cap
  const intro = AR_intro();
  ok(intro && Buffer.byteLength(intro, 'utf-8') < 9600, `the no-task tools intro stays under the 9600 B inline cap (${Buffer.byteLength(intro || '', 'utf-8')} B)`);
}
function AR_intro() {
  try { return require(path.join(REPO, 'src/agent-routes.js')).sessionToolsIntro({ status: true, ask: true, task: true, jobs: true }, {}); } catch (e) { return ''; }
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
