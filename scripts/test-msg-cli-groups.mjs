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
    sessionStatus: { consumeNotices: () => [], pendingNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' },
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
    sessionStatus: { consumeNotices: () => [], pendingNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' },
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

  // ── channel-withdraw verify r4 (2026-09-27): A PENDING FORK IS NOT ITS PARENT — a fork still carrying its
  // parent's conversation id (`_forkRequested`, nothing adopted yet) sent as the parent: the pair group held the
  // PARENT's id, the target's reply woke the PARENT (a billed turn on the wrong conversation, the pair bound for
  // good). Refused by name before the groups engine; the control (a patched copy whose msgCaller answers the raw
  // id) makes the pair under the parent's id.
  {
    const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
    const M = mutantCopies('msg-cli-fork', REPO);
    const P = 'dddddddd-4444-4000-8000-000000000009', T = 'eeeeeeee-5555-4000-8000-000000000010';
    async function forkLeg(ARmod, name) {
      const dir = path.join(ROOT, name); fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
      const st = createChannelStore({ dir: path.join(dir, 'channels') });
      const ros = [{ cid: P, name: 'parent', groups: ['tg1'], reachability: null }, { cid: T, name: 'target', groups: ['tg1'], reachability: null }];
      const ss = new Map([
        ['w-P', { claudeSessionId: P, name: 'parent', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_P' }],
        ['w-F', { claudeSessionId: P, name: 'parent (fork)', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_F', _forkRequested: true }],   // the pending fork: the parent's id
        ['w-T', { claudeSessionId: T, name: 'target', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_T' }],
      ]);
      const posted = [], asked = [];
      const dl = DELIVER.create({ dataDir: dir, activeSessions: ss, serverSetting: () => undefined,
        peerMsg: { findPeer: (cid) => ({ name: cid, socketPath: '/dev/null' }), postToPeer: async (peer) => { posted.push(peer.name); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
        emitPeerCard: () => {}, authorizeSpend: (req) => { asked.push(req.cid); return { ok: true, identity: { key: 'slot-1' } }; }, noteSpend: () => {}, releaseSpend: () => {} });
      let tt = Date.UTC(2026, 8, 27, 10, 0, 0);
      const ge = GE.create({ store: st, deliver: dl, broadcast: () => {}, now: () => (tt += 1000), roster: () => ros, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
      const rts = {}; const ap = { get: (p, h) => { rts['GET ' + p] = h; }, post: (p, h) => { rts['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
      ARmod.setupAgentRoutes({ app: ap, activeSessions: ss, tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => null },
        sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' }, userTodos: {}, sessionStatusKey: (x) => 'claude:' + x.claudeSessionId, serverSetting: () => undefined,
        integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null, deliver: dl, getGroups: () => ge });
      const c = (p, token, body) => new Promise((resolve) => { let status = 200; rts[p]({ headers: { authorization: 'Bearer ' + token }, body, query: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } }); });
      const s1 = await c('POST /api/agent/msg/send', 'vsst_F', { to: 'target', text: 'hello from the fork', wake: true, yes: true });
      const groups = Object.values(st.groups.live().groups);
      const wokeBySend = posted.length, askedBySend = asked.length;
      const s2 = await c('POST /api/agent/msg/send', 'vsst_T', { to: P, text: 'reply', wake: true, yes: true });
      const lst = await c('GET /api/agent/msg/groups', 'vsst_F', {});
      try { dl.flush(); } catch {}
      st.close();
      return { send: `${s1.status}:${s1.body.code || 'ok'}`, sentence: s1.body.error || '', pairHoldsParent: groups.some((g) => g.pair && (g.members || []).some((m) => (m.member || m.cid) === P)), groups: groups.length, wokeBySend, askedBySend, reply: `${s2.status}:${s2.body.code || 'ok'}`, woke: posted.slice(), list: `${lst.status}:${lst.body.code || 'ok'}` };
    }
    const fk = await forkLeg(AR, 'fork');
    ok(fk.send === '409:bad-member' && /a fork that has not announced its own conversation id yet/.test(fk.sentence) && fk.groups === 0 && fk.wokeBySend === 0 && fk.askedBySend === 0 && fk.list === '409:bad-member',
      `a PENDING fork's \`send --wake\` ⇒ 409 bad-member by name; no pair, nobody woken, the authorizer never asked; its \`groups\` list is refused the same way (${fk.send}; the target's own later message to the parent by id is its own act: ${fk.reply})`, JSON.stringify(fk));
    const arsrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
    const LINE = "  const own = ownConversationIdOf(s);\n  return { job: null, cid: own.cid, cidWhy: own.why, s, id, myGroups: _myGroupIds(s, id) };";
    ok(arsrc.split(LINE).length === 2, 'the own-id line of msgCaller is present once (the control answers the raw, possibly borrowed, id)');
    const ARc = M.load('src/agent-routes.js', arsrc.replace(LINE, "  return { job: null, cid: s.claudeSessionId || s.backendSessionId || null, s, id, myGroups: _myGroupIds(s, id) };"), 'msgcaller-raw-id');
    const fkc = await forkLeg(ARc, 'fork-ctl');
    ok(fkc.send === '200:ok' && fkc.pairHoldsParent && fkc.reply === '200:ok' && fkc.woke.includes(P),
      `CONTROL: the routes whose msgCaller answers the raw id let the pending fork make the pair under the PARENT's id and the target's reply WAKES THE PARENT (${JSON.stringify(fkc.woke)}) — the leg would go red`, JSON.stringify(fkc));
    for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'r4 fork control: ' })) ok(c.pass, c.name, c.detail);
  }

  // ── channel-withdraw verify r5 (2026-09-27): THE OTHER SIDE OF THE FORK RULE — a pending fork as a TARGET, as a
  // JOB OWNER, as a WINDOW-SHARE target. r4 guarded the fork as a SENDER; the roster (server.js `liveSessions`,
  // agent-routes `_msgEndpoints`) still listed it under its PARENT's id with its own name: with the parent not
  // live, a third session's `send --wake "<fork>"` minted the pair under the PARENT's id and authorized a billed
  // turn on the parent (reproduced over the real engine); with the parent live, every message to the parent was
  // refused `ambiguous`. `jobsCaller` read the raw status key: a job the fork made was OWNED by the parent, every
  // notification a billed turn on the parent, for good. ONE predicate now — claude-lock-capture's `addressableId`.
  {
    const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
    const M5 = mutantCopies('msg-cli-fork-r5', REPO);
    const LC = require(path.join(REPO, 'src/claude-lock-capture.js'));
    const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
    const P = 'aaaaaaaa-1111-4000-8000-000000000021', T = 'bbbbbbbb-2222-4000-8000-000000000022';
    const rosterOf = (LCmod, ss) => () => { const out = []; for (const [id, s] of ss) { const cid = LCmod.addressableId(s); if (!cid) continue; out.push({ cid, name: s.name || null, groups: ['tg1'], webuiId: id, reachability: null }); } return out; };   // server.js's liveSessions shape, through the SAME predicate
    async function targetLeg(ARmod, LCmod, name, { parentLive }) {
      const dir = path.join(ROOT, name); fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
      const st = createChannelStore({ dir: path.join(dir, 'channels') });
      const ss = new Map([
        ...(parentLive ? [['w-P', { claudeSessionId: P, backend: 'claude', name: 'parent', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_P', _initialGroupId: 'tg1' }]] : []),
        ['w-F', { claudeSessionId: P, backend: 'claude', name: 'parent (fork)', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_F', _forkRequested: true, _initialGroupId: 'tg1' }],
        ['w-T', { claudeSessionId: T, backend: 'claude', name: 'target', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_T', _initialGroupId: 'tg1' }],
      ]);
      const asked = [];
      const dl = DELIVER.create({ dataDir: dir, activeSessions: ss, serverSetting: () => undefined,
        peerMsg: { findPeer: (cid) => (cid === P && !parentLive ? null : { name: cid, socketPath: '/dev/null' }), postToPeer: async () => ({ ok: true }), postChannelEvent: async () => ({ ok: false }) },
        emitPeerCard: () => {}, authorizeSpend: (req) => { asked.push(req.cid); return { ok: true, identity: { key: 'slot-1' } }; }, noteSpend: () => {}, releaseSpend: () => {} });
      let tt = Date.UTC(2026, 8, 27, 10, 0, 0);
      const ge = GE.create({ store: st, deliver: dl, broadcast: () => {}, now: () => (tt += 1000), roster: rosterOf(LCmod, ss), groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
      const tasks = { groupsForSession: ({ initialGroupId }) => (initialGroupId ? [{ id: initialGroupId }] : []), _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => ({ externalVisibility: 'none' }) };
      const rts = {}; const ap = { get: (p, h) => { rts['GET ' + p] = h; }, post: (p, h) => { rts['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
      ARmod.setupAgentRoutes({ app: ap, activeSessions: ss, tasks,
        sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' }, userTodos: {}, sessionStatusKey: (x, id) => (x.claudeSessionId ? 'claude:' + x.claudeSessionId : 'webui:' + id), serverSetting: () => undefined,
        integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null, deliver: dl, getGroups: () => ge });
      const c = (p, token, body) => new Promise((resolve) => { let status = 200; Promise.resolve(rts[p]({ headers: { authorization: 'Bearer ' + token }, body, query: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } })).catch((e) => resolve({ status: 500, body: { error: e.message } })); });
      const peers = await c('GET /api/agent/msg/peers', 'vsst_T', {});
      const forkListed = (peers.body.peers || []).some((x) => x.name === 'parent (fork)');
      const s1 = await c('POST /api/agent/msg/send', 'vsst_T', { to: 'parent (fork)', text: 'for the fork', wake: true, yes: true });
      const s2 = parentLive ? await c('POST /api/agent/msg/send', 'vsst_T', { to: P, text: 'for the parent by id', wake: true, yes: true }) : { status: 0, body: {} };
      const groups = Object.values(st.groups.live().groups);
      try { dl.flush(); } catch {}
      st.close();
      return { forkListed, toFork: `${s1.status}:${s1.body.code || 'ok'}`, toParent: `${s2.status}:${s2.body.code || 'ok'}`, pairHoldsParent: groups.some((g) => g.pair && (g.members || []).some((m) => m.member === P)), askedOnParent: asked.filter((x) => x === P).length };
    }
    const dead = await targetLeg(AR, LC, 'r5-target-dead', { parentLive: false });
    ok(!dead.forkListed && dead.toFork === '404:unreachable' && !dead.pairHoldsParent && dead.askedOnParent === 0,
      `the parent NOT live: a pending fork is not a peer, a wake to it by name is \`unreachable\`, no pair under the parent's id, the authorizer never asked for the parent (${JSON.stringify(dead)})`);
    const live = await targetLeg(AR, LC, 'r5-target-live', { parentLive: true });
    ok(!live.forkListed && live.toFork === '404:unreachable' && live.toParent === '200:ok' && live.askedOnParent === 1,
      `the parent live: the fork is not a peer and the PARENT is reachable by id (it was \`ambiguous\` beside its pending fork) — its own wake is its own (${JSON.stringify(live)})`);
    const lcsrc = fs.readFileSync(path.join(REPO, 'src/claude-lock-capture.js'), 'utf-8');
    const PRED = "  return cid && !liveForkPending(session) ? cid : null;";
    ok(lcsrc.split(PRED).length === 2, 'addressableId\'s own-id line is present once (the control answers the raw, possibly borrowed, id)');
    const LCc = M5.load('src/claude-lock-capture.js', lcsrc.replace(PRED, "  return cid;"), 'addressable-raw');
    const arsrc5 = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
    const EP = "    const cid = addressableId(t);\n    if (!cid) continue;";
    ok(arsrc5.split(EP).length === 2, '_msgEndpoints reads the endpoint id through addressableId, once');
    const ARc5 = M5.load('src/agent-routes.js', arsrc5.replace(EP, "    const cid = t.claudeSessionId || t.backendSessionId;\n    if (!cid) continue;"), 'endpoints-raw');
    const deadC = await targetLeg(ARc5, LCc, 'r5-target-dead-ctl', { parentLive: false });
    ok(deadC.forkListed && deadC.toFork === '200:ok' && deadC.pairHoldsParent && deadC.askedOnParent === 1,
      `CONTROL: the raw-id roster + endpoints list the fork under the parent's id, mint the pair under the PARENT and authorize a billed turn on it (${JSON.stringify(deadC)}) — the leg would go red`);
    const liveC = await targetLeg(ARc5, LCc, 'r5-target-live-ctl', { parentLive: true });
    ok(liveC.toParent === '400:ambiguous', `CONTROL: with the raw roster the parent itself is \`ambiguous\` beside its pending fork (${liveC.toParent})`);
    // server.js's roster reads the SAME predicate (the suite cannot boot server.js: the line is pinned by name)
    const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
    ok(/liveSessions: \(\) => \{ const out = \[\]; for \(const \[id, s\] of activeSessions\) \{ const cid = addressableId\(s\);/.test(srv) && /const \{ addressableId \} = require\('\.\/src\/claude-lock-capture'\)/.test(srv), 'PIN: server.js\'s liveSessions roster (the groups engine\'s + the channels engine\'s) reads each row\'s id through addressableId');

    // THE JOB OWNER: a pending fork's `vibespace-job run` — refused by name; the control records the parent as the owner
    async function jobLeg(ARmod, name) {
      const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
      const ss = new Map([
        ['w-P', { claudeSessionId: P, backend: 'claude', name: 'parent', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_P', _initialGroupId: 'tg1', createdAt: 1 }],
        ['w-F', { claudeSessionId: P, backend: 'claude', name: 'parent (fork)', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_F', _forkRequested: true, _initialGroupId: 'tg1', createdAt: 2 }],
      ]);
      const posted = [];
      const dl = DELIVER.create({ dataDir: dir, activeSessions: ss, serverSetting: () => undefined,
        peerMsg: { findPeer: (cid) => ({ name: cid, socketPath: '/dev/null' }), postToPeer: async (peer) => { posted.push(peer.name); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
        emitPeerCard: () => {}, authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1' } }), noteSpend: () => {}, releaseSpend: () => {} });
      const jm = new JobManager({ dataDir: dir, broadcast() {}, notifyUser() {}, log() {}, deliverToConversation: (cid, text, o) => dl.deliverToConversation(cid, text, o), groupNotifyFor: () => null, notifyGlobal: () => true });
      jm.init();
      const rts = {}; const ap = { get: (p, h) => { rts['GET ' + p] = h; }, post: (p, h) => { rts['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
      ARmod.setupAgentRoutes({ app: ap, activeSessions: ss, tasks: { groupsForSession: ({ initialGroupId }) => (initialGroupId ? [{ id: initialGroupId }] : []), _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => null },
        sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' }, userTodos: {}, sessionStatusKey: (x, id) => (x.claudeSessionId ? 'claude:' + x.claudeSessionId : 'webui:' + id), serverSetting: () => undefined,
        integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => jm, deliver: dl, getGroups: () => null });
      const c = (p, token, body) => new Promise((resolve) => { let status = 200; Promise.resolve(rts[p]({ headers: { authorization: 'Bearer ' + token }, body, query: {}, params: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } })).catch((e) => resolve({ status: 500, body: { error: e.message } })); });
      const r = await c('POST /api/agent/jobs', 'vsst_F', { kind: 'cron', name: 'fork-job', schedule: { everyMs: 3600000 }, action: { type: 'notify', text: 'tick' } });
      const job = r.body && r.body.job ? jm.jobs.get(r.body.job.id) : null;
      if (job) { jm._notifyOwner(job, { what: 'an event' }); await new Promise((z) => setTimeout(z, 30)); }
      const rP = await c('POST /api/agent/jobs', 'vsst_P', { kind: 'cron', name: 'parent-job', schedule: { everyMs: 3600000 }, action: { type: 'notify', text: 'tick' } });
      jm.shutdown(); for (const t of jm._timers) clearInterval(t);
      try { dl.flush(); } catch {}
      return { create: `${r.status}:${r.body.code || (r.body.success ? 'ok' : r.body.error)}`, sentence: r.body.error || '', ownerIsParent: !!(job && job.owner && job.owner.conversation && job.owner.conversation.id === P), postedOnParent: posted.filter((x) => x === P).length, parentCreates: `${rP.status}:${rP.body.success ? 'ok' : rP.body.error}`, parentOwner: rP.body && rP.body.job && rP.body.job.owner ? rP.body.job.owner.conversation : null };
    }
    const jb = await jobLeg(AR, 'r5-job');
    ok(jb.create === '409:bad-member' && /a fork that has not announced its own conversation id yet/.test(jb.sentence) && !jb.ownerIsParent && jb.postedOnParent === 0 && jb.parentCreates === '200:ok',
      `a PENDING fork's job creation ⇒ 409 bad-member by name — no job owned by the parent, no billed notification on the parent; the parent's own creation stands (${JSON.stringify(jb)})`);
    const JC = "  const own = ownConversationIdOf(s);\n  return {\n    conversationId: own.cid, borrowed: own.cid ? null : (own.why === FORK_PENDING ? own.why : null),";
    ok(arsrc5.split(JC).length === 2, 'jobsCaller reads the caller\'s conversation through ownConversationIdOf, once (the control reads the raw status key)');
    const ARj = M5.load('src/agent-routes.js', arsrc5.replace(JC, "  return {\n    conversationId: key.startsWith('webui:') ? null : key.slice(key.indexOf(':') + 1), borrowed: null,"), 'jobscaller-raw');
    const jbc = await jobLeg(ARj, 'r5-job-ctl');
    ok(jbc.create === '200:ok' && jbc.ownerIsParent && jbc.postedOnParent === 1, `CONTROL: the raw-key jobsCaller records the PARENT as the fork's job owner and its first notification is a billed post on the parent (${JSON.stringify(jbc)}) — the leg would go red`);

    // THE WINDOW-SHARE REQUEST (the owner's "ask <agent> to take control"): a pending fork is refused by name — the wake and the stash landed on the parent
    {
      const WR = require(path.join(REPO, 'src/server/window-request.js'));
      const ss = new Map([['w-F', { claudeSessionId: P, backend: 'claude', name: 'parent (fork)', _forkRequested: true }], ['w-P', { claudeSessionId: P, backend: 'claude', name: 'parent' }]]);
      const stashed = [];
      const engine = { reachOf: () => ({ handle: 'h1', label: 'Calc' }), grantReach: () => ({ granted: { changed: true }, modeInfo: {} }), endHold: () => false };
      const dlv = { stashFor: (cid) => { stashed.push(cid); return { stored: true }; }, deliverToConversation: async () => ({ ok: true }) };
      const wr = WR.create({ engine, deliver: dlv, activeSessions: ss, log: { log() {}, warn() {} } });
      let err = null; try { await wr.request({ handle: 'h1', sessionId: 'w-F', wake: true }); } catch (e) { err = e; }
      const rp = await wr.request({ handle: 'h1', sessionId: 'w-P', wake: false });
      ok(err && err.code === 'fork_pending' && /fork that has not announced/.test(err.message) && stashed.length === 1 && rp.ok && rp.delivered === 'next-turn', `a window-share request to a pending fork is refused by its OWN code (verify r6: the client worded no_conversation as "say something to it first"); the parent's own is served (${err && err.code}: ${err && err.message.slice(0, 60)})`);
      const wsrc = fs.readFileSync(path.join(REPO, 'src/server/window-request.js'), 'utf-8');
      const WL = "    if (liveForkPending(s)) throw namedError('fork_pending',";
      ok(wsrc.split(WL).length === 2, 'the window-request guard is present once');
      const WRc = M5.load('src/server/window-request.js', wsrc.replace(WL, "    if (false) throw namedError('fork_pending',"), 'winreq-raw');
      const stashed2 = [];
      const wr2 = WRc.create({ engine, deliver: { stashFor: (cid) => { stashed2.push(cid); return { stored: true }; }, deliverToConversation: async () => ({ ok: true }) }, activeSessions: ss, log: { log() {}, warn() {} } });
      const r2 = await wr2.request({ handle: 'h1', sessionId: 'w-F', wake: false });
      ok(r2.ok && stashed2[0] === P, 'CONTROL: without the guard the fork\'s request is stashed for the PARENT\'s conversation — the leg would go red');
    }
    // THE FOR-YOU ITEM (`vibespace-ask`): a pending fork's item was keyed under the PARENT's status key for good — the
    // owner's reply (typed by the item's key) went into the parent. Keyed under the fork's own placeholder now.
    {
      const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
      async function askLeg(ARmod, name) {
        const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
        const ut = new UserTodoManager({ dataDir: dir });
        const ss = new Map([
          ['w-P', { claudeSessionId: P, backend: 'claude', name: 'parent', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_P', pty: {} }],
          ['w-F', { claudeSessionId: P, backend: 'claude', name: 'parent (fork)', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_F', _forkRequested: true, pty: {} }],
        ]);
        const key = (x, id) => (x.claudeSessionId ? 'claude:' + x.claudeSessionId : 'webui:' + id);
        const rts = {}; const ap = { get: (p, h) => { rts['GET ' + p] = h; }, post: (p, h) => { rts['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
        ARmod.setupAgentRoutes({ app: ap, activeSessions: ss, tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => null },
          sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' }, userTodos: ut, sessionStatusKey: key, serverSetting: () => undefined,
          integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null, deliver: null, getGroups: () => null });
        const c = (token, body) => new Promise((resolve) => { let status = 200; Promise.resolve(rts['POST /api/agent/user-todo']({ headers: { authorization: 'Bearer ' + token }, body, query: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } })).catch((e) => resolve({ status: 500, body: { error: e.message } })); });
        const r = await c('vsst_F', { add: { text: 'which branch?', kind: 'action' } });
        const item = r.body && r.body.item;
        if (!item) return { status: r.status, error: r.body && r.body.error };
        // the reply route's own resolver (routes/user-todos-reply.js sessionForItem): which live session the item names
        const UTR = require(path.join(REPO, 'src/routes/user-todos-reply.js'));
        const hit = item ? UTR.sessionForItem(item, ss, key) : null;
        return { status: r.status, key: item && item.sessionKey, repliesTo: hit ? hit[0] : null };
      }
      const a = await askLeg(AR, 'r5-ask');
      ok(a.status === 200 && a.key === 'webui:w-F' && a.repliesTo === 'w-F', `a pending fork's For-you item is keyed under its own placeholder and the owner's reply reaches the FORK (${JSON.stringify(a)})`);
      const AL = "  const key = liveForkPending(s) ? `webui:${id}` : sessionStatusKey(s, id);";
      ok(arsrc5.split(AL).length === 2, 'the user-todo key line is present once (the control keys by the raw status key)');
      const ARa = M5.load('src/agent-routes.js', arsrc5.replace(AL, "  const key = sessionStatusKey(s, id);"), 'ask-raw-key');
      const ac = await askLeg(ARa, 'r5-ask-ctl');
      ok(ac.key === 'claude:' + P && ac.repliesTo === 'w-P', `CONTROL: keyed by the raw status key the item is the PARENT's and the reply is typed into the parent (${JSON.stringify(ac)}) — the leg would go red`);
    }
    for (const c of copiesCensus(M5.files, M5.dir, REPO, { minCopies: 1, label: 'r5 fork control: ' })) ok(c.pass, c.name, c.detail);
  }

  // ── channel-withdraw verify r6 (2026-09-27): THE LADDER'S OWN LOOKUPS and THE GROUP-REPORT DRAIN. r5 put the one
  // predicate behind the rosters and the caller resolvers; the delivery ladder still found "the live local session
  // carrying this conversation" by the RAW id at three sites (rung 0's channel socket, rung 1.5's codex wrapper, the
  // identity a turn is CHARGED to + the machine-turn stamp) — a frame addressed to the PARENT was written into the
  // PENDING FORK's wrapper (a billed turn on the fork; reproduced with the parent stopped, the sidecar written the
  // way codex-chat-wrapper writes it at boot, before thread/fork answers) and, with the fork restored first, the
  // parent's turn was charged to the fork's credential slot. And prompt-context's next-turn GROUP REPORTS read the
  // raw id: a pending fork's user turn rendered the PARENT's pending group messages into its own prompt and moved
  // the parent's markers — the parent never saw them.
  {
    const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
    const M6 = mutantCopies('msg-cli-fork-r6', REPO);
    const P = 'aaaaaaaa-1111-4000-8000-000000000031', T = 'bbbbbbbb-2222-4000-8000-000000000032', FOWN = 'cccccccc-3333-4000-8000-000000000033';
    const LC = require(path.join(REPO, 'src/claude-lock-capture.js'));
    const rosterOf = (LCmod, ss) => () => { const out = []; for (const [id, s] of ss) { const cid = LCmod.addressableId(s); if (!cid) continue; out.push({ cid, name: s.name || null, groups: ['tg1'], webuiId: id, reachability: null }); } return out; };
    const fakePty = () => { const writes = []; return { writes, write: (x) => writes.push(x) }; };
    const sidecar = (dir, wid) => { fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true }); fs.writeFileSync(path.join(dir, 'session-buffers', wid + '.json'), JSON.stringify({ pid: process.pid, startedAt: Date.now(), caps: { peerMessage: true, frameFile: true, threadScoped: true, inputQueue: true, queueVerbs: ['steer', 'queue-add'], responseStyle: true, permissionRules: true, queueResync: true } })); };
    // THE LADDER: (a) codex, the parent stopped, the fork pending — where does a frame for the parent go, who is charged
    async function ladderLeg(DLmod, name, { shape }) {
      const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
      const F = { backendSessionId: P, claudeSessionId: shape === 'codex' ? null : P, backend: shape, name: 'parent (fork)', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_F', _forkRequested: true, _forkSourceId: P, createdAt: 2, _acct: 'slot-FORK', _registry: FOWN, pty: fakePty(), socketPath: null };
      const Ps = { backendSessionId: P, claudeSessionId: shape === 'codex' ? null : P, backend: shape, name: 'parent', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_P', createdAt: 1, _acct: 'slot-PARENT', _registry: P, pty: fakePty(), socketPath: null };
      // codex: the parent STOPPED (only the fork carries P); claude: BOTH live, the FORK FIRST (a boot restore's listing order)
      const ss = shape === 'codex' ? new Map([['w-F', F]]) : new Map([['w-F', F], ['w-P', Ps]]);
      if (shape === 'codex') sidecar(dir, 'w-F');
      const auths = [], posts = [];
      const dl = DLmod.create({ dataDir: dir, activeSessions: ss, serverSetting: () => undefined,
        peerMsg: { findPeer: (cid) => { for (const [, x] of ss) if (x._registry === cid) return { name: cid, socketPath: '/dev/null' }; return null; }, postToPeer: async (peer) => { posts.push(peer.name); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },   // the CLI registry names the process's OWN id
        emitPeerCard: () => {}, authorizeSpend: (req) => { const x = ss.get('w-P'); const id = (() => { for (const [, y] of ss) if (y === req.session) return y._acct; return null; })(); auths.push({ cid: req.cid, identity: id }); void x; return { ok: true, identity: { key: id || 'none' } }; }, noteSpend: () => {}, releaseSpend: () => {} });
      const r = await dl.deliverToConversation(P, 'for the parent', { kind: 'notification', spendReason: 'job-notification', fromName: 'Background Work · j' });
      try { dl.flush(); } catch {}
      return { ok: !!r.ok, lane: r.lane || null, forkFrames: F.pty.writes.filter((w) => /"peer-message"/.test(w)).length, parentFrames: Ps.pty.writes.length, posts: posts.map((x) => x.slice(0, 8)), charged: auths.map((a) => a.identity), stashedForParent: dl.stashCount(P), forkStamped: !!F._machineInputAt, parentStamped: !!Ps._machineInputAt };
    }
    const lc = await ladderLeg(DELIVER, 'r6-ladder-codex', { shape: 'codex' });
    ok(!lc.ok && lc.forkFrames === 0 && !lc.charged.includes('slot-FORK'), `codex, the parent stopped: a frame for the PARENT is never written into the pending FORK's wrapper and never charged to the fork's slot — it falls to the stash (${JSON.stringify(lc)})`);
    const lk = await ladderLeg(DELIVER, 'r6-ladder-claude', { shape: 'claude' });
    ok(lk.ok && lk.posts.join() === P.slice(0, 8) && lk.charged.every((x) => x === 'slot-PARENT') && lk.parentStamped && !lk.forkStamped, `claude, both live, the fork first: the frame reaches the PARENT's inbox, is charged to the PARENT's slot and stamps the parent's machine turn (${JSON.stringify(lk)})`);
    const dlsrc = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
    const RPC = "        if (addressableId(s) !== cid) continue;   // verify r6: a pending fork (its parent's id) is never the wrapper this frame is written into";
    const LOC = "      for (const [, s] of activeSessions) if (addressableId(s) === cid) return s;";
    const CH0 = "            if (addressableId(s) !== cid) continue;   // verify r6: the same rule as every rung";
    ok(dlsrc.split(RPC).length === 2 && dlsrc.split(LOC).length === 2 && dlsrc.split(CH0).length === 2 && !/\(s\.backendSessionId \|\| s\.claudeSessionId\) (!==|===) cid/.test(dlsrc), 'the ladder reads every "which session carries this conversation" through addressableId (rung 0, rung 1.5, the charged identity) — no raw read remains');
    const DLc = M6.load('src/server/conversation-deliver.js', dlsrc.replace(RPC, "        if ((s.backendSessionId || s.claudeSessionId) !== cid) continue;").replace(LOC, "      for (const [, s] of activeSessions) if ((s.backendSessionId || s.claudeSessionId) === cid) return s;").replace(CH0, "            if ((s.backendSessionId || s.claudeSessionId) !== cid) continue;"), 'ladder-raw');
    const lcC = await ladderLeg(DLc, 'r6-ladder-codex-ctl', { shape: 'codex' });
    ok(lcC.ok && lcC.lane === 'rpc-queue' && lcC.forkFrames === 1 && lcC.charged.includes('slot-FORK'), `CONTROL: with the raw lookups the parent's frame is written into the FORK's wrapper and charged to the fork's slot (${JSON.stringify(lcC)}) — the leg would go red`);
    const lkC = await ladderLeg(DLc, 'r6-ladder-claude-ctl', { shape: 'claude' });
    ok(lkC.charged.includes('slot-FORK') && lkC.forkStamped, `CONTROL: with the raw lookups the parent's turn is charged to the FORK's slot and the fork is stamped (${JSON.stringify(lkC)})`);
    // server.js's peer-card site reads the same predicate (pinned by name — the suite cannot boot server.js)
    const srv6 = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
    ok(/if \(addressableId\(s\) !== cid \|\| !s\._normalizer\) continue;/.test(srv6), 'PIN: server.js\'s emitPeerCard draws the card in the window that OWNS the conversation (addressableId), never a pending fork\'s');

    // THE GROUP REPORTS on a pending fork's prompt: the parent's pending report stays the parent's
    async function reportLeg(ARmod, name) {
      const dir = path.join(ROOT, name); fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
      const st = createChannelStore({ dir: path.join(dir, 'channels') });
      const F = { claudeSessionId: P, backendSessionId: P, backend: 'claude', name: 'parent (fork)', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_F', _forkRequested: true, _forkSourceId: P, _initialGroupId: 'tg1', createdAt: 2, _toolsIntroSeen: true, _mgrIntroSeen: true };
      const ss = new Map([
        ['w-P', { claudeSessionId: P, backendSessionId: P, backend: 'claude', name: 'parent', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_P', _initialGroupId: 'tg1', createdAt: 1, _toolsIntroSeen: true, _mgrIntroSeen: true }],
        ['w-F', F],
        ['w-T', { claudeSessionId: T, backendSessionId: T, backend: 'claude', name: 'target', mode: 'chat', cwd: '/tmp', agentToken: 'vsst_T', _initialGroupId: 'tg1', createdAt: 3, _toolsIntroSeen: true, _mgrIntroSeen: true }],
      ]);
      const dl = DELIVER.create({ dataDir: dir, activeSessions: ss, serverSetting: () => undefined, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => {}, authorizeSpend: () => ({ ok: true, identity: { key: 'slot-1' } }), noteSpend: () => {}, releaseSpend: () => {} });
      let tt = Date.UTC(2026, 8, 27, 10, 0, 0);
      const ge = GE.create({ store: st, deliver: dl, broadcast: () => {}, now: () => (tt += 1000), roster: rosterOf(LC, ss), groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} } });
      const tasks = { groupsForSession: ({ initialGroupId }) => (initialGroupId ? [{ id: initialGroupId, injectContext: false }] : []), _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => ({ externalVisibility: 'none' }) };
      const rts = {}; const ap = { get: (p, h) => { rts['GET ' + p] = h; }, post: (p, h) => { rts['POST ' + p] = h; }, put() {}, delete() {}, use() {} };
      ARmod.setupAgentRoutes({ app: ap, activeSessions: ss, tasks,
        sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' }, userTodos: {}, sessionStatusKey: (x, id) => (x.claudeSessionId ? 'claude:' + x.claudeSessionId : 'webui:' + id), serverSetting: () => undefined,
        integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null, deliver: dl, getGroups: () => ge });
      const c = (p, token, body) => new Promise((resolve) => { let status = 200; Promise.resolve(rts[p]({ headers: { authorization: 'Bearer ' + token }, body, query: {} }, { status(x) { status = x; return this; }, json(o) { resolve({ status, body: o }); } })).catch((e) => resolve({ status: 500, body: { error: e.message } })); });
      const s1 = await c('POST /api/agent/msg/send', 'vsst_T', { to: 'parent', text: 'a message for the parent only' });
      const fc = await c('GET /api/agent/prompt-context', 'vsst_F', {});
      const pc = await c('GET /api/agent/prompt-context', 'vsst_P', {});
      const gid = s1.body.group && s1.body.group.id;
      const mP = gid && st.groups.live().groups[gid].members.find((m) => m.member === P);
      // after adoption: nothing of the parent's
      F.claudeSessionId = FOWN; F.backendSessionId = FOWN; F.forkedFrom = [P]; F._forkRequested = false;
      const s2 = await c('POST /api/agent/msg/send', 'vsst_T', { to: 'parent', text: 'a second message for the parent' });
      const fc2 = await c('GET /api/agent/prompt-context', 'vsst_F', {});
      try { dl.flush(); } catch {}
      st.close();
      return { posted: s1.status, forkGot: /Group messages since your last turn/.test(fc.body.context || ''), parentGot: /Group messages since your last turn/.test(pc.body.context || ''), markerMovedBeforeParent: !!(mP && mP.reportedUpTo), afterAdoption: s2.status === 200 && /second message/.test(fc2.body.context || '') };
    }
    const rp = await reportLeg(AR, 'r6-report');
    ok(rp.posted === 200 && !rp.forkGot && rp.parentGot && !rp.afterAdoption, `a pending fork's prompt never carries the PARENT's group report; the parent's own next prompt does; an adopted fork hears nothing of the parent's (${JSON.stringify(rp)})`);
    const arsrc6 = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
    const GR = "      const myCid = ownConversationIdOf(s).cid;\n      if (ge && myCid && turnIsUserInitiated(s)) {";
    ok(arsrc6.split(GR).length === 2, 'the next-turn group-report block reads the caller through ownConversationIdOf, once (the control reads the raw id)');
    const ARr = M6.load('src/agent-routes.js', arsrc6.replace(GR, "      const myCid = s.claudeSessionId || s.backendSessionId || null;\n      if (ge && myCid && turnIsUserInitiated(s)) {"), 'reports-raw');
    const rpC = await reportLeg(ARr, 'r6-report-ctl');
    ok(rpC.forkGot && !rpC.parentGot, `CONTROL: with the raw id the FORK's prompt carries the parent's report and the parent's own prompt is empty (${JSON.stringify(rpC)}) — the leg would go red`);
    for (const c of copiesCensus(M6.files, M6.dir, REPO, { minCopies: 1, label: 'r6 fork control: ' })) ok(c.pass, c.name, c.detail);
  }
}

// ── channel-withdraw verify r7 (2026-09-27): THE ADDRESSING-READ CENSUS AS A GATE. Six rounds each found ONE more
// reader that named / billed / granted / recorded a conversation by the RAW `(x.claudeSessionId||x.backendSessionId)`
// while a fork still carried its parent's id. r7 decides the class is CLOSED by census, not by another example: every
// occurrence of the "which live session carries this conversation id" IDIOM — `(x.claudeSessionId||x.backendSessionId)
// === <cid>` (either field order, === or !==) — across src/ + server.js + data/bin (never src/lib, never the generated
// agentd bundle) is classified in a CHECKED-IN table. An unlisted occurrence FAILS; a patched copy that adds a raw
// addressing read on a fresh site fails. The CORRECT sites (the ladder's three lookups, emitPeerCard) read
// `addressableId(s) === cid` — no `||`, so the idiom regex never matches them; reverting one to the raw form re-adds
// an unlisted idiom hit and the census goes red.
console.log('§2c the addressing-read census (r7): every raw "which session carries this cid" idiom is classified');
{
  // THE IDIOM: (x.claudeSessionId || x.backendSessionId) === <cid>   /   (x.backendSessionId || x.claudeSessionId) !== <cid>
  const IDIOM = /\(\s*\w+\.(?:claudeSessionId|backendSessionId)\s*\|\|\s*\w+\.(?:backendSessionId|claudeSessionId)\s*\)\s*(?:===|!==)/;
  const censusOf = (root) => {
    const files = [];
    const walk = (d) => {
      let ents; try { ents = fs.readdirSync(path.join(root, d), { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const p = d ? d + '/' + e.name : e.name;
        if (e.isDirectory()) { if (['node_modules', '.git', 'src/lib'].includes(p) || p.startsWith('src/lib/')) continue; walk(p); }
        else if (/\.(js|mjs|cjs)$/.test(e.name) && !/vibespace-agentd(-attach)?\.js$/.test(e.name)) files.push(p);
      }
    };
    walk('src'); walk('data/bin');
    if (fs.existsSync(path.join(root, 'server.js'))) files.push('server.js');
    const hits = [];
    for (const f of files) { let s; try { s = fs.readFileSync(path.join(root, f), 'utf-8'); } catch { continue; } s.split('\n').forEach((ln, i) => { if (IDIOM.test(ln)) hits.push({ file: f, line: i + 1, text: ln.trim() }); }); }
    return hits;
  };
  // THE CLASSIFICATION TABLE — {file, needle (a stable substring of the matched line), verdict, why}.
  // verdict 'predicate' = the addressing decision is fenced by the fork predicate on the SAME line/context;
  // 'harmless' = it does not name/bill/grant/record on the parent (display, a shared read, a user-explicit
  // stale-id fallback, or the real-usage odometer which keys the pool MEMBER by webuiId, not by the cid).
  const TABLE = [
    { file: 'src/agent-routes.js', needle: '=== cid && !liveForkPending(t)', verdict: 'predicate', why: '_msgEndpoints finder — a pending fork is excluded by !liveForkPending on the same line (r4)' },
    { file: 'src/server/jobs-wiring.js', needle: '=== ownerCid', verdict: 'harmless', why: 'display name only; ownerCid is the job\'s OWN owner conversation, recorded fork-aware at create via jobsCaller (r5)' },
    { file: 'src/transcript-service.js', needle: '=== r.sessionId) return s', verdict: 'harmless', why: 'serves the transcript; a pending fork SHARES the parent\'s file until adoption, so either session returns the same bytes (read)' },
    { file: 'src/ws-handler.js', needle: 'data.backendSessionId && (session.backendSessionId', verdict: 'harmless', why: 'rename-session fallback, reached only when the client\'s own webui id is stale (missing from activeSessions); user-explicit, renames a display name, self-heals at adoption' },
    { file: 'src/ws-handler.js', needle: 'data.sessionId = eid; break', verdict: 'harmless', why: 'kill fallback on a stale webui id; user-explicit, no bill/grant/record; a fork/parent id ambiguity here is the same transient class as any two sessions momentarily sharing an id' },
    { file: 'server.js', needle: '=== sid && s2._accountId === acct', verdict: 'harmless', why: 'recordUsageAttribution — the REAL inference odometer (reading-attribution campaign, slot-transitions/reading-repair), NOT the addressing lane; the pool MEMBER is chosen by poolMemberOfSession keyed on the found session\'s webuiId, and requests share the parent\'s transcript rid pre-adoption' },
  ];
  const hits = censusOf(REPO);
  ok(hits.length === 6, `the tree holds exactly the 6 known addressing-idiom sites (found ${hits.length}: ${hits.map((h) => h.file + ':' + h.line).join(', ')})`);
  let classified = 0, unlisted = [];
  for (const h of hits) {
    const row = TABLE.find((r) => r.file === h.file && h.text.includes(r.needle));
    if (row) classified++; else unlisted.push(`${h.file}:${h.line}: ${h.text.slice(0, 90)}`);
  }
  ok(unlisted.length === 0, `every addressing-idiom site is classified (unlisted: ${unlisted.join(' | ') || 'none'})`);
  ok(classified === hits.length && TABLE.every((r) => hits.some((h) => h.file === r.file && h.text.includes(r.needle))), 'the classification table has no dead rows (every needle matches a live site)');
  // the ONE guarded (addressing) site really carries the predicate; the rest are non-addressing
  const guarded = TABLE.filter((r) => r.verdict === 'predicate');
  ok(guarded.length === 1 && guarded[0].file === 'src/agent-routes.js', 'exactly one raw idiom is an ADDRESSING decision, and it is fenced by liveForkPending; every other is harmless with a stated reason');
  // the CORRECT ladder sites read the predicate, not the idiom (a revert to raw would re-add unlisted idiom hits)
  const dl = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
  ok(!IDIOM.test(dl) && (dl.match(/addressableId\(s\) (?:===|!==) cid/g) || []).length === 3, 'the delivery ladder\'s three cid→session lookups read addressableId(s), never the raw idiom (a revert re-reddens §2c)');
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
  ok(/if \(addressableId\(s\) !== cid \|\| !s\._normalizer\) continue;/.test(srv), 'emitPeerCard reads addressableId(s), never the raw idiom');
  // NEGATIVE CONTROL: a fresh raw addressing read on a NEW site is caught (a synthetic src file under a scratch root)
  const ctlRoot = scratch('msg-cli-census-ctl');
  fs.mkdirSync(path.join(ctlRoot, 'src', 'server'), { recursive: true });
  fs.writeFileSync(path.join(ctlRoot, 'src', 'server', 'new-feature.js'), 'function f(cid){ for (const [,s] of activeSessions) if ((s.claudeSessionId || s.backendSessionId) === cid) return s; }\n');
  const ctlHits = censusOf(ctlRoot);
  const ctlUnlisted = ctlHits.filter((h) => !TABLE.find((r) => r.file === h.file && h.text.includes(r.needle)));
  ok(ctlHits.length === 1 && ctlUnlisted.length === 1 && ctlUnlisted[0].file === 'src/server/new-feature.js', `NEGATIVE CONTROL: a new module's raw addressing read is an UNLISTED census hit (${ctlUnlisted.map((h) => h.file).join(',') || 'MISSED'}) — the gate would go red`);
  try { fs.rmSync(ctlRoot, { recursive: true }); } catch {}
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
