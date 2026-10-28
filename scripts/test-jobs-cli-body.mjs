#!/usr/bin/env node
// test-jobs-cli-body — A FLAG THE USAGE PRINTS REACHES THE WIRE, for every verb that prints it (lane job-notify-user,
// 2026-10-28). userW's agent (relayed feedback): `vibespace-job notify-cron … --notify-user` never sent `notifyUser`, so a
// fire woke only the agent, the user's For you tray got nothing, and `show` said nothing about it. test-jobs-engine was
// green: it handed the engine a top-level field the CLI never wrote. No test drove the REAL CLI's body. This suite does:
//   (1) WIRE — the real data/bin/vibespace-job against a loopback server that records every POST body: notify-cron, a
//       plain run and a scheduled run (--at / --every) carry ONE top-level `notifyUser: true` with --notify-user, false
//       without it (the controls); a scheduled run ALSO carries the compatibility copy inside its task (r2: an engine ≤
//       2.369.360 builds the run from `{...a.task}`), and the store keeps one field. Refused AT THE PROMPT, nothing
//       sent: --notify-user on a service (nothing tells at a service's end) and an --urgency outside the For you store's
//       own set (r3: THE set the store exports — 'urgent' is created and filed; the check reads it only with --notify-user).
//   (2) THE BODY CENSUS — every flag the usage's create block prints, and every flag the run / notify-cron branch reads,
//       has a PIN (the invocation, the field it lands in, the value — checked in the POST body AND in the spec the real
//       route hands the engine). A flag without one is red BY NAME — there is no «not on the wire» row to declare (r2:
//       the dead --env read is gone). Controls: a flag planted in a copy of the usage, a planted branch read (and the
//       old --env read put back), a CLI copy that drops the field.
//   (3) FIRE — the CLI's own POSTs go through the REAL POST /api/agent/jobs (setupAgentRoutes in-process behind the
//       loopback server) into a real JobManager (no spawn: `_spawn` stubbed, a run ended by hand): a notify-cron fire
//       with the flag calls deps.notifyUser with the text AND messages the owner conversation (both lanes journaled);
//       without it, the conversation only. A scheduled run's child and a plain task tell the user at their end only
//       with the flag. Controls: a jobs.js copy without the parent→child hand-over leaves the scheduled child silent; an
//       engine with 2.369.360's two lines (no hand-over, the nested copy stored) still tells the user — through the
//       compatibility copy, and a CLI without it leaves that child silent.
//   (4) THE ROAD TO A PERSON (r2 → r3) — the REAL src/server/jobs-wiring.js over a REAL For-you store (UserTodoManager):
//       the agent's --text reaches the tray MASKED as a FIELD (a secret-named KV and a token shape — fakes built at
//       runtime) and a SUBSCRIBER's message masked, while the owner conversation that WROTE it gets it whole (r3: a text
//       returns to its author); a job NAMED with a secret word keeps the product's sentences whole (the end, the ask, the
//       park, the missed time — r2's whole-sentence belt ate their words), done and failed are two items, the answered
//       ask closes (the resolver keys on a fact). EVERY copy the store REFUSES (an urgency outside its set; the
//       conversation at its open cap: a notify fire, a task's end, an ask, a park, a missed time) is journaled
//       `user-inbox ✗ — why`, never ✓, and `poll` / `show` say which copy. Control: a jobs.js copy whose fire skips the
//       subscriber's belt carries the raw secret to the subscriber.
//   (5) SHOW — `vibespace-job show` prints notifyUser=true|false on its params line, beside notifyOk; a service prints
//       notifyUser=n/a; the create echo names the user's copy beside auto-notify; a notify cron's show / poll print its
//       reminder (whole for the author). The panel's words have zh + ja, and the always-line says, per kind, only what
//       the engine does for that kind (r3: the panel's own expression over real snapshots, beside the engine's acts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'data/bin/vibespace-job');
const { JobManager } = require('../src/jobs.js');
const AR = require('../src/agent-routes.js');
const JW = require('../src/server/jobs-wiring.js');
const { UserTodoManager, URGENCIES } = require('../src/user-todos.js');
const M = require('../src/job-model.js');

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? `\n      ${String(extra).slice(0, 700)}` : ''}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jobs-cli-body-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });   // a crash leaves no scratch
const CWD = path.join(tmp, 'work'); fs.mkdirSync(CWD);
const T0 = Date.now();
// the secret sentinels (agent-output-sinks' shapes, never a literal): a secret-named KV and a GitHub-PAT shape
const KVMAT = crypto.randomBytes(16).toString('hex');
const SHAPEMAT = crypto.randomBytes(20).toString('hex');
const SECRET_TEXT = `rotate the deploy key: token=${KVMAT} then push with ${['gh', 'p', '_'].join('') + SHAPEMAT}`;
const leaks = (s) => String(s).includes(KVMAT) || String(s).includes(SHAPEMAT);
// a For-you copy as the store fills it (lane job-notify-user r3: the engine hands a template + fields, never a sentence)
const said = (n) => (n && n.text != null ? n.text : n && n.words ? String(n.words.key).replace(/\{(\w+)\}/g, (m, k) => (n.words.params && n.words.params[k] !== undefined ? String(n.words.params[k]) : m)) : '');

// a PATCHED COPY of a src module in the scratch dir, its relative requires pointed back at the real tree (the controls)
let patchN = 0;
const loadPatched = (rel, cuts) => {
  let out = fs.readFileSync(path.join(REPO, rel), 'utf8');
  for (const [a, b] of cuts) { if (out.split(a).length !== 2) throw new Error(`patch anchor not found once in ${rel}: ${a.slice(0, 70)}`); out = out.replace(a, b); }
  out = out.replace(/require\('\.\/([^']+)'\)/g, (_, m) => `require(${JSON.stringify(path.join(REPO, path.dirname(rel), m))})`);
  const f = path.join(tmp, `patched-${patchN++}-${path.basename(rel)}`);
  fs.writeFileSync(f, out);
  return require(f);
};
const once = (rel, s) => fs.readFileSync(path.join(REPO, rel), 'utf8').split(s).length === 2;

// ── the engines: real JobManagers, timers off, no process ever spawned ──
const stubSpawn = (jm) => { jm.init(); for (const t of jm._timers) clearInterval(t); jm._spawn = (job, trigger) => { job.runs = job.runs || []; job.runs.push({ startedAt: Date.now(), trigger }); job.state = 'up'; }; };
function engine(JM, name) {
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const E = { inbox: [], told: [], specs: [] };
  E.jm = new JM({
    dataDir: dir, broadcast() { }, log() { }, notifyUser: (n) => E.inbox.push(n),
    deliverToConversation: async (cid, text) => { E.told.push({ cid, text }); return { ok: true, lane: 'message', peerName: 'owner' }; },
    groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true,
  });
  stubSpawn(E.jm);
  // the spec the REAL route hands the engine (census leg 2's second hop)
  const create = E.jm.create.bind(E.jm);
  E.jm.create = (spec, caller) => { E.specs.push(spec); return name === 'census' ? { error: 'census: recorded, not created' } : create(spec, caller); };
  return E;
}
const CENSUS = engine(JobManager, 'census');
const REAL = engine(JobManager, 'real');
// CONTROL engine: the parent→child hand-over cut (the line this lane added) — a scheduled child no longer hears its parent
const HAND = '      child.notifyUser = M.notifyUserOf(job);\n';
const STORE = 'action: M.storedAction(spec.action),';
const SAID = '      this._notifyOwner(job, { what: a.text || job.name, agentWhat: true });\n';   // r3: the author gets its own words whole
const SUBBELT = '      const subEv = ev && ev.agentWhat ? { ...ev, what: this._agentWords(ev.what) } : ev;\n';   // …a subscriber, belted
const HANDS = once('src/jobs.js', HAND), STORES = once('src/jobs.js', STORE), SAIDS = once('src/jobs.js', SAID) && once('src/jobs.js', SUBBELT);
const NOHAND = engine(HANDS ? loadPatched('src/jobs.js', [[HAND, '']]).JobManager : JobManager, 'no-handover');
// 2.369.360's engine in the two lines that matter here: no hand-over, the action stored as sent (its run = `{...a.task}`)
const OLD = engine(HANDS && STORES ? loadPatched('src/jobs.js', [[HAND, ''], [STORE, 'action: spec.action || null,']]).JobManager : JobManager, 'old-engine');
// CONTROL engine: the subscriber's belt skipped — a subscriber's copy carries the agent's words as typed
const NOBELT = engine(SAIDS ? loadPatched('src/jobs.js', [[SUBBELT, '      const subEv = ev;\n']]).JobManager : JobManager, 'no-belt');
// THE ROAD TO A PERSON: the real wiring (its notifyUser dep files For you) over a real store
const WDIR = path.join(tmp, 'wired'); fs.mkdirSync(WDIR);
const todos = new UserTodoManager({ dataDir: WDIR, expirySweepMs: 0 });
const WTOLD = [];

// ── the sessions (one conversation per leg: the engine's 30 s per-conversation floor never joins two legs) ──
const LEGS = ['census', 'nc1', 'nc0', 'at1', 'at0', 'ev1', 'tk1', 'tk0', 'ctl', 'old1', 'oldm', 'mask', 'nobelt', 'urg', 'full', 'svc0', 'svc1', 'sub', 'urgu', 'urgn', 'named'];
const cidOf = (leg) => `c0ffee00-0000-4000-8000-${String(LEGS.indexOf(leg)).padStart(12, '0')}`;
const SESS = new Map(LEGS.map((leg) => [`w-${leg}`, { claudeSessionId: cidOf(leg), backend: 'claude', name: leg, mode: 'chat', cwd: CWD, agentToken: `vsst_${leg}`, createdAt: 1 }]));
const wiring = JW.create({
  app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { } }, dataDir: WDIR, broadcastAll() { }, userTodos: todos, log() { },
  serverSetting: () => undefined, taskGroups: null, activeSessions: SESS,
  deliver: { peerReachable: () => true, deliverToConversation: async (cid, text) => { WTOLD.push({ cid, text }); return { ok: true, lane: 'message', peerName: 'owner' }; }, onRetry() { }, registerStashJudge() { } },
});
const WIRED = { jm: wiring.jm, told: WTOLD };
stubSpawn(WIRED.jm);
const ENGINE_OF = { census: CENSUS, ctl: NOHAND, old1: OLD, oldm: OLD, mask: WIRED, urg: WIRED, full: WIRED, nobelt: NOBELT, urgu: WIRED, named: WIRED };
for (let i = 0; i < 20; i++) todos.add(`claude:${cidOf('full')}`, { text: `an earlier ask ${i}`, origin: 'agent' });   // the conversation at its open cap
const rts = {};
const ap = { get: (p, h) => { rts[`GET ${p}`] = h; }, post: (p, h) => { rts[`POST ${p}`] = h; }, put() { }, delete() { }, use() { } };
let current = null;
AR.setupAgentRoutes({
  app: ap, activeSessions: SESS,
  tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '', get: () => null },
  sessionStatus: { consumeNotices: () => [], get: () => null, rekey() { } }, SessionStatusManager: { renderNotices: () => '' }, userTodos: {},
  sessionStatusKey: (x) => `claude:${x.claudeSessionId}`, serverSetting: () => undefined, integrationEnabled: () => true,
  scheduleCtxSync() { }, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => current && current.jm, getGroups: () => null,
});

// ── the loopback server: records every POST body, then answers through the REAL route ──
const wire = [];
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://loopback');
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { }
    if (req.method === 'POST' && u.pathname === '/api/agent/jobs') wire.push({ token, body: JSON.parse(raw || '{}') });
    const m = /^\/api\/agent\/jobs\/([^/]+)$/.exec(u.pathname);
    const key = u.pathname === '/api/agent/jobs' ? `${req.method} /api/agent/jobs` : m && req.method === 'GET' ? 'GET /api/agent/jobs/:ref' : null;
    let code = 200, sent = false;
    const R = { status(c) { code = c; return R; }, json(o) { if (!sent) { sent = true; res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); } return R; } };
    if (!key || !rts[key]) return R.status(404).json({ error: `no route ${req.method} ${u.pathname}` });
    // jobAuth reads getJobs() synchronously, before the handler's first await — the engine is the caller's leg's
    current = ENGINE_OF[token.replace(/^vsst_/, '')] || REAL;
    Promise.resolve(rts[key]({ headers: req.headers, body, query: Object.fromEntries(u.searchParams), params: m ? { ref: decodeURIComponent(m[1]) } : {} }, R))
      .catch((e) => R.status(500).json({ error: `route threw: ${e.message}` }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${server.address().port}`;
const cli = (argv, { leg = 'census', bin = CLI } = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [bin, ...argv], { cwd: CWD, env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: tmp, LANG: 'C.UTF-8', VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: `vsst_${leg}` } });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => resolve({ code, out, err }));
});
// the agent calling the route ITSELF (no CLI in between: what the route accepts, the engine must journal honestly)
const post = async (leg, body) => { const r = await fetch(`${API}/api/agent/jobs`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer vsst_${leg}` }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() }; };
const bodyOf = (name) => (wire.find((w) => w.body && w.body.name === name) || {}).body;
const get = (o, p) => p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const all = async (o) => Object.fromEntries(await Promise.all(Object.entries(o).map(async ([k, v]) => [k, await v])));

// ── THE CENSUS (2): the flags the usage prints for run / notify-cron + the flags that branch reads ──
const SRC = fs.readFileSync(CLI, 'utf8');
const usageCreate = (src) => { const u = /const USAGE = `([\s\S]*?)`;/.exec(src); const b = u && /\ncreate:([\s\S]*?)\ndocs:/.exec(u[1]); return b ? b[1] : null; };
const branchOf = (src) => { const i = src.indexOf("case 'run': case 'notify-cron': {"); const j = i < 0 ? -1 : src.indexOf("case 'docs':", i); return j > i ? src.slice(i, j) : null; };
const printedFlags = (src) => new Set(usageCreate(src).match(/--[a-z][a-z-]*/g) || []);
const readFlags = (src) => new Set([...branchOf(src).matchAll(/flags\.([a-z][a-zA-Z]*)|flags\['([a-z][a-z-]*)'\]/g)].map((x) => `--${x[1] || x[2]}`));
// the census invocations: every flag below rides one of them (mutually exclusive shapes get their own)
const INV = {
  svc: ['run', 'sleep 60', '--name', 'census-svc', '--note', 'a note', '--context', 'ctx words', '--cwd', CWD, '--until', 'READY', '--timeout', '6h', '--stdin-open', '--notify', 'on',
    '--view', 'all', '--control', 'group', '--stop-with-owner', '--keep-up', '--restart', 'always', '--port', '8123', '--publish'],
  task: ['run', 'true', '--name', 'census-task', '--notify-user'],
  every: ['run', 'echo hi', '--name', 'census-every', '--every', '30m', '--jitter', '5', '--notify-ok', '--notify-user'],
  cron: ['run', 'true', '--name', 'census-cron', '--cron', '41 9 * * *'],
  nc: ['notify-cron', '--name', 'census-nc', '--at', '+5m', '--text', 'census reminder', '--urgency', 'high', '--notify-user'],
};
const atOk = (v) => typeof v === 'number' && Math.abs(v - (T0 + 300_000)) < 120_000;
// flag → [invocation, field (the same path in the POST body and in the route's engine spec), the value it must carry]
const PINS = {
  '--name': [['nc', 'name', 'census-nc']], '--note': [['svc', 'note', 'a note']], '--context': [['svc', 'context.payload', 'ctx words']],
  '--cwd': [['svc', 'cmd.cwd', CWD]], '--until': [['svc', 'untilOutput', 'READY']], '--timeout': [['svc', 'timeoutMs', 6 * 3600e3]],
  '--stdin-open': [['svc', 'stdinOpen', true]],
  // every shape that tells the user (a plain task, a scheduled run, notify-cron) — top-level; a scheduled run ALSO carries
  // the compatibility copy in its task (an engine ≤ 2.369.360 reads only that); a service refuses the flag (leg (1))
  '--notify-user': [['task', 'notifyUser', true], ['every', 'notifyUser', true], ['every', 'action.task.notifyUser', true], ['nc', 'notifyUser', true]],
  '--notify': [['svc', 'notify', 'on']], '--notify-ok': [['every', 'action.task.notifyOk', true]],
  '--every': [['every', 'schedule.everyMs', 30 * 60e3]], '--jitter': [['every', 'schedule.jitterPct', 5]], '--cron': [['cron', 'schedule.cron', '41 9 * * *']], '--at': [['nc', 'schedule.at', atOk]],
  '--keep-up': [['svc', 'kind', 'service']], '--restart': [['svc', 'restart', 'always']], '--port': [['svc', 'ports', [8123]]], '--publish': [['svc', 'publish', true]],
  '--view': [['svc', 'access.view', 'all']], '--control': [['svc', 'access.control', 'group']], '--stop-with-owner': [['svc', 'stopWithOwner', true]],
  '--text': [['nc', 'action.text', 'census reminder']], '--urgency': [['nc', 'action.urgency', 'high']],
};
const censusFindings = (src) => {
  const named = new Set([...printedFlags(src), ...readFlags(src)]);
  return { unpinned: [...named].filter((f) => !PINS[f]).sort(), stale: Object.keys(PINS).filter((f) => !named.has(f)).sort() };
};
const landing = (flag, bodies, specs) => {
  const bad = [];
  for (const [inv, field, want] of PINS[flag] || []) {
    for (const [hop, rec] of [['POST body', bodies[inv]], ['route spec', specs && specs[inv]]]) {
      if (hop === 'route spec' && !specs) continue;
      const v = get(rec, field);
      if (!(typeof want === 'function' ? want(v) : same(v, want))) bad.push(`${flag} → ${hop} ${field} = ${JSON.stringify(v)} (${inv})`);
    }
  }
  return bad;
};

// ── run every CLI at once (the fast tier's clock): the census, the fire legs, the controls ──
const mutCli = (dir, src) => { const d = path.join(tmp, dir, 'data', 'bin'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'vibespace-job'), src); fs.copyFileSync(path.join(REPO, 'src/cli-call.js'), path.join(d, 'cli-call.js')); return path.join(d, 'vibespace-job'); };   // a host's layout: the helper beside the CLI
const NU = "        notifyUser: !!flags['notify-user'],\n";
const COPY = "        if (schedule) body.action = { type: 'spawn-task', task: { ...task, notifyUser: body.notifyUser } };\n";
ok(SRC.split(NU).length === 2, 'the CLI writes notifyUser ONCE at the top, in the body every shape shares');
ok(SRC.split(COPY).length === 2, 'the CLI adds the compatibility copy ONCE, to a scheduled run\'s task (the control below cuts it)');
ok(HANDS && STORES && SAIDS, 'src/jobs.js hands a cron child its parent\'s setting at every fire, stores the action without the nested copy, gives the fire\'s words to their author whole and belts a subscriber\'s copy — ONCE each (the controls cut them)');
const DROPPED = mutCli('mut', SRC.replace(NU, ''));
const NOCOPY = mutCli('mut-nocopy', SRC.replace(COPY, "        if (schedule) body.action = { type: 'spawn-task', task };\n"));
const [urgRaw, svcRaw] = await Promise.all([
  post('urg', { kind: 'cron', name: 'urg', schedule: { at: T0 + 300_000 }, action: { type: 'notify', text: 'please renew the cert', urgency: 'critical' }, notifyUser: true }),
  post('svc1', { kind: 'service', name: 'svc1', cmd: { argv: ['sh', '-c', 'sleep 60'] }, notifyUser: true }),
]);
const R = await all({
  ...Object.fromEntries(Object.entries(INV).map(([k, argv]) => [`inv:${k}`, cli(argv)])),
  dropped: cli(['notify-cron', '--name', 'census-nc-dropped', '--at', '+5m', '--text', 'x', '--notify-user'], { bin: DROPPED }),
  urgc: cli(['notify-cron', '--name', 'urgc', '--at', '+5m', '--text', 'x', '--urgency', 'critical', '--notify-user']),
  svcn: cli(['run', 'sleep 60', '--name', 'svcn', '--keep-up', '--notify-user']),
  urgu: cli(['notify-cron', '--name', 'urgu', '--at', '+5m', '--text', 'deploy window', '--urgency', 'urgent', '--notify-user'], { leg: 'urgu' }),
  urgn: cli(['notify-cron', '--name', 'urgn', '--at', '+5m', '--text', 'a note to self', '--urgency', 'critical'], { leg: 'urgn' }),
  nc1: cli(['notify-cron', '--name', 'nc1', '--at', '+5m', '--text', 'reminder for the user NC1', '--notify-user'], { leg: 'nc1' }),
  nc0: cli(['notify-cron', '--name', 'nc0', '--at', '+5m', '--text', 'reminder for me NC0'], { leg: 'nc0' }),
  at1: cli(['run', 'true', '--name', 'at1', '--at', '+5m', '--notify-user'], { leg: 'at1' }),
  at0: cli(['run', 'true', '--name', 'at0', '--at', '+5m'], { leg: 'at0' }),
  ev1: cli(['run', 'true', '--name', 'ev1', '--every', '30m', '--notify-user'], { leg: 'ev1' }),
  tk1: cli(['run', 'true', '--name', 'tk1', '--notify-user'], { leg: 'tk1' }),
  tk0: cli(['run', 'true', '--name', 'tk0'], { leg: 'tk0' }),
  ctl: cli(['run', 'true', '--name', 'ctl', '--at', '+5m', '--notify-user'], { leg: 'ctl' }),
  old1: cli(['run', 'true', '--name', 'old1', '--at', '+5m', '--notify-user'], { leg: 'old1' }),
  oldm: cli(['run', 'true', '--name', 'oldm', '--at', '+5m', '--notify-user'], { leg: 'oldm', bin: NOCOPY }),
  mask: cli(['notify-cron', '--name', 'mask', '--at', '+5m', '--text', SECRET_TEXT, '--notify-user'], { leg: 'mask' }),
  nobelt: cli(['notify-cron', '--name', 'nobelt', '--at', '+5m', '--text', SECRET_TEXT], { leg: 'nobelt' }),
  full: cli(['notify-cron', '--name', 'full', '--at', '+5m', '--text', 'please renew the cert', '--notify-user'], { leg: 'full' }),
  svc0: cli(['run', 'sleep 60', '--name', 'svc0', '--keep-up'], { leg: 'svc0' }),
});
const CENSUS_RUNS = [...Object.keys(INV).map((k) => `inv:${k}`), 'dropped'], REFUSED = ['urgc', 'svcn'];
const cliBad = Object.entries(R).filter(([k, r]) => (CENSUS_RUNS.includes(k) ? !/census: recorded, not created/.test(r.err) : REFUSED.includes(k) ? r.code !== 1 : r.code !== 0));
ok(!cliBad.length && urgRaw.status === 200 && svcRaw.status === 200, `every CLI call reached the route (${Object.keys(R).length} calls: the census ones refused after recording, two refused at the prompt, the fire legs created) + the agent's own two POSTs`, cliBad.map(([k, r]) => `${k}: ${r.code} ${r.err}`).join(' | ') + ` ${urgRaw.status} ${svcRaw.status}`);

console.log('(1) WIRE — the real CLI\'s POST body, three shapes; two refusals said at the prompt');
const jobOf = (E, name) => [...E.jm.jobs.values()].find((j) => j.name === name && !j.cronParent);
const childOf = (E, job) => [...E.jm.jobs.values()].find((j) => j.cronParent === job.id);
ok(bodyOf('nc1') && bodyOf('nc1').notifyUser === true && bodyOf('nc1').action.type === 'notify', 'notify-cron --notify-user ⇒ body.notifyUser: true (it was never sent)', JSON.stringify(bodyOf('nc1')));
ok(bodyOf('nc0') && bodyOf('nc0').notifyUser === false, 'CONTROL: notify-cron without the flag ⇒ body.notifyUser: false', JSON.stringify(bodyOf('nc0')));
ok(bodyOf('at1') && bodyOf('at1').notifyUser === true && bodyOf('at1').action.type === 'spawn-task' && bodyOf('at1').action.task.notifyUser === true,
  'a scheduled run --at … --notify-user ⇒ body.notifyUser: true at the TOP, and the compatibility copy in its task', JSON.stringify(bodyOf('at1')));
ok(bodyOf('ev1') && bodyOf('ev1').notifyUser === true && bodyOf('ev1').action.task.notifyUser === true, 'a scheduled run --every … --notify-user ⇒ the same two', JSON.stringify(bodyOf('ev1')));
ok(bodyOf('at0') && bodyOf('at0').notifyUser === false && bodyOf('at0').action.task.notifyUser === false, 'CONTROL: a scheduled run without the flag ⇒ false, both', JSON.stringify(bodyOf('at0')));
ok(bodyOf('tk1') && bodyOf('tk1').notifyUser === true && bodyOf('tk0') && bodyOf('tk0').notifyUser === false, 'a plain run: true with the flag, false without', `${JSON.stringify(bodyOf('tk1'))} / ${JSON.stringify(bodyOf('tk0'))}`);
{
  const s1 = jobOf(REAL, 'at1');
  ok(s1 && s1.notifyUser === true && s1.action && s1.action.task && !('notifyUser' in s1.action.task), 'the STORE keeps one field: the cron record holds notifyUser at the top, its task none (create drops the copy)', JSON.stringify(s1 && { top: s1.notifyUser, task: s1.action && s1.action.task }));
  ok(/^--urgency must be one of low\/normal\/high\/urgent — the For you tray's own set; nothing was created$/m.test(R.urgc.err) && !bodyOf('urgc'), 'notify-cron --urgency critical --notify-user is refused AT THE PROMPT by name, nothing sent — in the store\'s own set', R.urgc.err);
  ok(R.urgu.code === 0 && bodyOf('urgu') && bodyOf('urgu').action.urgency === 'urgent', 'notify-cron --urgency urgent --notify-user is CREATED (r2 refused the store\'s own \'urgent\' with a false reason)', R.urgu.err || JSON.stringify(bodyOf('urgu')));
  ok(R.urgn.code === 0 && bodyOf('urgn'), '…and without --notify-user the urgency is never read, so it is never checked (created)', R.urgn.err);
  const CT = require('../src/agent-cli-text.js');
  ok(CT.FOR_YOU_URGENCIES === URGENCIES && /require\('\.\.\/\.\.\/src\/agent-cli-text\.js'\)/.test(SRC) && /require\('\.\/agent-cli-text\.js'\)/.test(SRC) && !/\['low', 'normal', 'high'\]/.test(SRC), 'the CLI\'s set IS the store\'s set — ONE constant (src/agent-cli-text.js FOR_YOU_URGENCIES, the store\'s URGENCIES), read in both layouts, no literal of its own', URGENCIES.join('/'));
  ok(/^--notify-user is refused with --keep-up/.test(R.svcn.err) && !bodyOf('svcn'), 'run --keep-up --notify-user is refused by name, nothing sent: a service never tells the user at its end', R.svcn.err);
  const dead = wire.filter((w) => 'env' in w.body || 'cwd' in w.body).map((w) => w.body.name);
  ok(!dead.length && !/flags\.env\b/.test(SRC), 'no body carries the dead `env` / top-level `cwd` (the route maps neither) and the CLI reads no --env', dead.join(','));
}

console.log('(2) THE BODY CENSUS — a flag the usage prints (or the branch reads) lands in the body and in the engine spec');
const fz = censusFindings(SRC);
ok(!fz.unpinned.length, `every create flag has a pin (${printedFlags(SRC).size} printed, ${readFlags(SRC).size} read — no flag is declared off the wire)`, `NO PIN: ${fz.unpinned.join(', ')}`);
ok(!fz.stale.length, 'no pin names a flag the usage no longer prints and the branch no longer reads', `STALE: ${fz.stale.join(', ')}`);
const inv = Object.keys(INV);
const bodies = Object.fromEntries(inv.map((k) => [k, bodyOf(INV[k][INV[k].indexOf('--name') + 1])]));
const specs = Object.fromEntries(inv.map((k) => [k, CENSUS.specs.find((s) => s.name === INV[k][INV[k].indexOf('--name') + 1])]));
const lost = Object.keys(PINS).flatMap((f) => landing(f, bodies, specs));
ok(!lost.length, `every pin lands: ${Object.keys(PINS).length} flags in the POST body and in the spec the real route hands the engine`, lost.join(' | '));
{
  const planted = censusFindings(SRC.replace('[--stdin-open]', '[--stdin-open] [--frobnicate]'));
  ok(same(planted.unpinned, ['--frobnicate']), 'CONTROL: a flag planted in a copy of the usage is red BY NAME', JSON.stringify(planted));
  const read = censusFindings(SRC.replace("stdinOpen: !!flags['stdin-open'],", "stdinOpen: !!flags['stdin-open'], shadow: flags['shadow-flag'],"));
  ok(same(read.unpinned, ['--shadow-flag']), 'CONTROL: a flag the branch starts reading (and the usage never prints) is red by name too', JSON.stringify(read));
  const envBack = censusFindings(SRC.replace('        schedule,\n', '        env: [].concat(flags.env || []).length ? undefined : undefined,\n        schedule,\n'));
  ok(same(envBack.unpinned, ['--env']), 'CONTROL: the dead --env read put back is red by name (no row can declare it off the wire)', JSON.stringify(envBack));
  const dropped = landing('--notify-user', { ...bodies, nc: bodyOf('census-nc-dropped') }, null);
  ok(dropped.length === 1 && /^--notify-user → POST body notifyUser = undefined \(nc\)$/.test(dropped[0]), 'CONTROL: a CLI copy that drops the field (the 2.369.360 notify-cron) is red by flag, field and shape', JSON.stringify(dropped));
}

console.log('(3) FIRE — through the real route into the engine: the user\'s For you copy and the owner conversation');
const snapOf = (E, n) => { const j = jobOf(E, n); return j ? E.jm.snapshot(j) : { kind: null }; };
const endRun = (E, job) => { const run = job.runs[job.runs.length - 1]; E.jm._finalizeRun(job, run, { code: 0, endedAt: Date.now() }, 'sweep'); };
const FIRES = [[REAL, ['nc1', 'nc0', 'at1', 'at0', 'ev1']], [NOHAND, ['ctl']], [OLD, ['old1', 'oldm']], [WIRED, ['mask', 'urg', 'full', 'urgu']], [NOBELT, ['nobelt']]];
for (const [E, names] of FIRES) for (const n of names) { const j = jobOf(E, n); if (j) j.nextFireAt = Date.now() - 1000; }
for (const [E, n] of [[WIRED, 'mask'], [NOBELT, 'nobelt']]) { const j = jobOf(E, n); if (j) j.subscribers = [{ conversationId: cidOf('sub') }]; }   // ANOTHER conversation subscribed (r3)
for (const [E] of FIRES) await E.jm._cronTick();
await new Promise((r) => setTimeout(r, 30));   // the owner lane's delivery settles on its promise
const lanes = (j) => (j && j.notifyLog || []).filter((e) => e.ok).map((e) => e.lane).sort().join(',');
{
  const j1 = jobOf(REAL, 'nc1'), j0 = jobOf(REAL, 'nc0');
  ok(j1 && REAL.inbox.some((n) => n.jobId === j1.id && said(n) === 'reminder for the user NC1' && n.fact === 'fire' && n.words.key === '{text}'), 'notify-cron --notify-user fires ⇒ deps.notifyUser gets the text as a FIELD (the For you copy: {text}, fact fire)', JSON.stringify(REAL.inbox));
  ok(j1 && REAL.told.some((t) => t.cid === cidOf('nc1') && t.text.includes('reminder for the user NC1')), '…AND the owner conversation is messaged', JSON.stringify(REAL.told.map((t) => t.cid)));
  ok(lanes(j1) === 'message,user-inbox', '…both lanes journaled', JSON.stringify(j1 && j1.notifyLog));
  ok(j0 && !REAL.inbox.some((n) => n.jobId === j0.id) && REAL.told.some((t) => t.cid === cidOf('nc0')) && lanes(j0) === 'message', 'CONTROL: without the flag the fire messages the conversation ONLY (option A, 2.363.1)', JSON.stringify(j0 && j0.notifyLog));
  const a1 = jobOf(REAL, 'at1'), a0 = jobOf(REAL, 'at0'), e1 = jobOf(REAL, 'ev1');
  const c1 = a1 && childOf(REAL, a1), c0 = a0 && childOf(REAL, a0), ce = e1 && childOf(REAL, e1);
  ok(c1 && c0 && ce, 'each scheduled run\'s fire made its child (spawn stubbed)', `${!!c1} ${!!c0} ${!!ce}`);
  for (const c of [c1, c0, ce]) if (c) endRun(REAL, c);
  ok(c1 && REAL.inbox.some((n) => n.jobId === c1.id && /^Task at1 run: done \(ok\)$/.test(said(n)) && n.fact === 'end:done:ok'), 'a scheduled run --at … --notify-user: its child\'s end tells the user', JSON.stringify(REAL.inbox.map(said)));
  ok(ce && REAL.inbox.some((n) => n.jobId === ce.id), '…and --every … --notify-user the same', JSON.stringify(REAL.inbox.map(said)));
  ok(c0 && !REAL.inbox.some((n) => n.jobId === c0.id), 'CONTROL: a scheduled run without the flag: the child ends silently for the user');
  const t1 = jobOf(REAL, 'tk1'), t0 = jobOf(REAL, 'tk0');
  for (const t of [t1, t0]) if (t) endRun(REAL, t);
  ok(t1 && t0 && REAL.inbox.some((n) => n.jobId === t1.id && /^Task tk1: done \(ok\)$/.test(said(n))) && !REAL.inbox.some((n) => n.jobId === t0.id), 'a plain run: told at its end with the flag, not without', JSON.stringify(REAL.inbox.map(said)));
  const k = jobOf(NOHAND, 'ctl'), kc = k && childOf(NOHAND, k);
  if (kc) endRun(NOHAND, kc);
  ok(k && k.notifyUser === true && kc && !NOHAND.inbox.some((n) => n.jobId === kc.id), 'CONTROL: a jobs.js copy without the parent→child hand-over leaves the scheduled child silent (the leg above would go red)', JSON.stringify(NOHAND.inbox));
  const o1 = jobOf(OLD, 'old1'), om = jobOf(OLD, 'oldm'), oc1 = o1 && childOf(OLD, o1), ocm = om && childOf(OLD, om);
  for (const c of [oc1, ocm]) if (c) endRun(OLD, c);
  ok(oc1 && OLD.inbox.some((n) => n.jobId === oc1.id && /^Task old1 run: done \(ok\)$/.test(said(n))), 'an engine with 2.369.360\'s two lines (no hand-over, the action stored as sent): the scheduled child STILL tells the user — the compatibility copy', JSON.stringify(OLD.inbox.map(said)));
  ok(ocm && !OLD.inbox.some((n) => n.jobId === ocm.id), 'CONTROL: a CLI without the copy (514a962c) on that engine: the child ends silently for the user', JSON.stringify(OLD.inbox.map(said)));
}

console.log('(4) THE ROAD TO A PERSON — the real jobs wiring over a real For-you store: the agent\'s words as FIELDS, the author\'s own whole, an honest journal for every copy');
{
  todos.flush();
  const items = () => { const s = todos.snapshot(); return [...s.open, ...s.resolved]; };
  const jm = jobOf(WIRED, 'mask'), ju = jobOf(WIRED, 'urg'), jf = jobOf(WIRED, 'full'), jg = jobOf(WIRED, 'urgu');
  const itm = items().filter((i) => jm && i.jobId === jm.id);
  ok(itm.length === 1 && !leaks(itm[0].text) && /«redacted»/.test(itm[0].text) && itm[0].text.startsWith('rotate the deploy key:') && itm[0].jobFact === 'fire', 'the agent\'s --text lands in For you MASKED as a field (a secret-named KV, a token shape — the words around them kept; fact fire)', JSON.stringify(itm.map((i) => [i.text, i.jobFact])));
  const wm = WTOLD.filter((t) => t.cid === cidOf('mask')), ws = WTOLD.filter((t) => t.cid === cidOf('sub'));
  ok(wm.length === 1 && wm[0].text.includes(SECRET_TEXT), 'the AUTHOR — the owner conversation that wrote the --text — gets it WHOLE (r2 belted its own reminder: «Renew the auth token: «redacted»»)', JSON.stringify(wm.map((t) => t.text.slice(0, 200))));
  ok(ws.length === 1 && !leaks(ws[0].text) && /«redacted»/.test(ws[0].text) && ws[0].text.includes('rotate the deploy key:'), '…while a SUBSCRIBER (another conversation) gets it belted', JSON.stringify(ws.map((t) => t.text.slice(0, 200))));
  ok(!leaks(fs.readFileSync(path.join(WDIR, 'user-todos.json'), 'utf8')) && !leaks(JSON.stringify(jm.notifyLog)) && !leaks(JSON.stringify(WIRED.jm.snapshot(jm))) && leaks(WIRED.jm.snapshot(jm, { author: true }).actionText), '…no raw secret in the For you store on disk, the journal, or the snapshot the panel and another lineage read — its AUTHOR\'s snapshot keeps the reminder whole');
  ok(lanes(jm) === 'message,message,user-inbox' && (jm.notifyLog || []).filter((e) => e.lane === 'message' && e.ok && e.sub).length === 1, '…and the journal says all three landed — For you, the owner, the subscriber (✓ is each lane\'s own answer)', JSON.stringify(jm && jm.notifyLog));
  const ctl = todos.add(`claude:${cidOf('mask')}`, { text: SECRET_TEXT, origin: 'agent' });
  ok(ctl && !leaks(ctl.text) && /«redacted»/.test(ctl.text), 'CONTROL (unchanged): the same words as a vibespace-ask come out masked', ctl && ctl.text);
  const nb = NOBELT.told.filter((t) => t.cid === cidOf('sub'));
  ok(nb.length === 1 && leaks(nb[0].text), 'CONTROL: a jobs.js copy whose fire skips the subscriber\'s belt carries the raw secret to the subscriber (the belt is load-bearing)', JSON.stringify(nb.map((t) => leaks(t.text))));
  const gi = items().find((i) => jg && i.jobId === jg.id);
  ok(gi && gi.urgency === 'urgent' && gi.text === 'deploy window', 'notify-cron --urgency urgent --notify-user: the fire files it at «urgent» (the store\'s own set)', JSON.stringify(gi && { u: gi.urgency, t: gi.text }));
  const fyOf = (j) => [...(j && j.notifyLog || [])].reverse().find((e) => e.lane === 'user-inbox');
  const fu = fyOf(ju), ff = fyOf(jf);
  ok(fu && fu.ok === false && fu.copy === 'fire' && /^urgency must be one of /.test(fu.reason) && !items().some((i) => i.jobId === ju.id), 'a copy the store refuses (the agent\'s own POST, urgency «critical») is journaled user-inbox ✗ with the store\'s why — never ✓', JSON.stringify(ju && ju.notifyLog));
  ok(ff && ff.ok === false && ff.reason === 'For you is full (20 open)' && !items().some((i) => i.jobId === jf.id), '…and so is one refused at the conversation\'s open cap: «For you is full (20 open)»', JSON.stringify(jf && jf.notifyLog));
  ok(lanes(ju).includes('message') && lanes(jf).includes('message'), '…while the owner conversation is still messaged (the refusal is the For you lane\'s alone)', `${lanes(ju)} / ${lanes(jf)}`);
  // EVERY copy the engine files is journaled the same way (r3 — r2 journaled the notify fire only): at the same open cap, a
  // task's end, an ask, a park, a missed time — each through the ONE door (src/jobs.js _forYou)
  const mk = async (body) => { const r = await post('full', body); return r.j && r.j.job ? WIRED.jm.jobs.get(r.j.job.id) : null; };
  const [te, ta, ts, tm] = await Promise.all([
    mk({ kind: 'task', name: 'cap-end', cmd: { argv: ['true'], cwd: CWD }, notifyUser: true }),
    mk({ kind: 'task', name: 'cap-ask', cmd: { argv: ['true'], cwd: CWD } }),
    mk({ kind: 'service', name: 'cap-park', cmd: { argv: ['sh', '-c', 'sleep 60'], cwd: CWD } }),
    mk({ kind: 'cron', name: 'cap-missed', schedule: { at: T0 + 3600e3 }, catchUp: 'none', action: { type: 'notify', text: 'standup' } }),
  ]);
  const park = (j) => { j.supervise = { consecutiveFails: M.SUPERVISE.failCap - 1 }; const run = j.runs[j.runs.length - 1]; run.startedAt = Date.now() - 1000; WIRED.jm._finalizeRun(j, run, { code: 1, endedAt: Date.now() }, 'sweep'); };
  if (te) endRun(WIRED, te);
  if (ta) WIRED.jm.ask(ta, { title: 'pick', blocks: [{ type: 'buttons', options: ['ok'] }] });
  if (ts) park(ts);
  if (tm) { tm.nextFireAt = Date.now() - 600e3; await WIRED.jm._cronTick(); }
  const capped = [[te, 'end'], [ta, 'ask'], [ts, 'parked'], [tm, 'missed']].map(([j, c]) => { const e = fyOf(j); return { c, ok: !!(j && e && e.ok === false && e.copy === c && e.reason === 'For you is full (20 open)' && !items().some((i) => i.jobId === j.id)), e }; });
  ok(capped.every((x) => x.ok), 'EVERY copy refused at the cap is journaled user-inbox ✗ with the store\'s why, naming the copy — a task\'s end, an ask, a park, a missed time (r2: silent, no line)', JSON.stringify(capped));
  const [pu, pf, pm, su, pe, pa] = await Promise.all([cli(['poll', ju.id], { leg: 'urg' }), cli(['poll', jf.id], { leg: 'full' }), cli(['poll', jm.id], { leg: 'mask' }), cli(['show', ju.id], { leg: 'urg' }), cli(['poll', te && te.id], { leg: 'full' }), cli(['show', ta && ta.id], { leg: 'full' })]);
  ok(/^for you: the fire copy was NOT filed — urgency must be one of /m.test(pu.out) && /^for you: the fire copy was NOT filed — For you is full \(20 open\)$/m.test(pf.out), 'the agent\'s poll says the copy was NOT filed, in the store\'s words', `${pu.out} | ${pf.out}`);
  ok(/^for you: the fire copy was NOT filed — urgency must be one of /m.test(su.out), '…and so does show', su.out);
  ok(/^for you: the end copy was NOT filed — For you is full \(20 open\)$/m.test(pe.out) && /^for you: the ask was NOT filed — For you is full \(20 open\)$/m.test(pa.out), '…for every copy, by name (the end copy\'s poll, the ask\'s show)', `${pe.out} | ${pa.out}`);
  ok(!/^for you:/m.test(pm.out) && pm.out.includes('text: ' + SECRET_TEXT), 'CONTROL: a copy that landed adds no such line to the poll — and the AUTHOR\'s poll prints its reminder whole (the snapshot keeps it)', pm.out);
  // A JOB NAMED WITH A SECRET WORD (r3, accept-r2 confirmed 0–2): the mask covers the agent's words as FIELDS, never the
  // product's sentence — r2's whole-sentence belt read «Task refresh-token: done (ok)» as `token: …`, merged the failure into
  // the success, and ate «needs» from «rotate-db-password needs your input» (the answered ask stayed open for good)
  const mkn = async (body) => { const r = await post('named', body); return r.j && r.j.job ? WIRED.jm.jobs.get(r.j.job.id) : null; };
  const [nr, np, ns, nm] = await Promise.all([
    mkn({ kind: 'task', name: 'refresh-token', cmd: { argv: ['true'], cwd: CWD }, notifyUser: true }),
    mkn({ kind: 'task', name: 'rotate-db-password', cmd: { argv: ['true'], cwd: CWD } }),
    mkn({ kind: 'service', name: 'db-password', cmd: { argv: ['sh', '-c', 'sleep 60'], cwd: CWD } }),
    mkn({ kind: 'cron', name: 'api-password', schedule: { at: T0 + 3600e3 }, catchUp: 'none', action: { type: 'notify', text: 'standup' } }),
  ]);
  if (nr) { endRun(WIRED, nr); WIRED.jm._spawn(nr, 'manual'); const run = nr.runs[nr.runs.length - 1]; WIRED.jm._finalizeRun(nr, run, { code: 1, endedAt: Date.now() }, 'sweep'); }
  if (np) WIRED.jm.ask(np, { title: 'pick', blocks: [{ type: 'buttons', options: ['ok'] }] });
  if (ns) park(ns);
  if (nm) { nm.nextFireAt = Date.now() - 600e3; await WIRED.jm._cronTick(); }
  const of = (j) => items().filter((i) => j && i.jobId === j.id).map((i) => i.text).sort();
  const four = { end: of(nr), ask: of(np), park: of(ns), missed: of(nm) };
  ok(same(four.end, ['Task refresh-token: done (ok)', 'Task refresh-token: failed (error)']), 'a job NAMED refresh-token: «Task refresh-token: done (ok)» and «…: failed (error)» — the outcome whole, TWO items (the dedupe key is the job + its outcome, never the words)', JSON.stringify(four.end));
  ok(same(four.ask, ['rotate-db-password needs your input']) && same(four.park, [`Service db-password crash-looped and was parked — vibespace-job start ${ns && ns.id} to retry`]) && same(four.missed, ['Scheduled job api-password MISSED its time (server was down)']), 'the ask, the park and the missed time of jobs named …-password keep the product\'s sentence whole', JSON.stringify(four));
  const ans = np && WIRED.jm.answerPanel(np, { button: 'ok', version: np.interaction.pending.version });
  const askItem = items().find((i) => np && i.jobId === np.id);
  ok(ans && ans.ok && askItem && askItem.status === 'done' && askItem.jobFact === 'ask', 'the answered ask CLOSES — the resolver keys on the item\'s fact (jobFact ask), never on its words', JSON.stringify(askItem && { s: askItem.status, f: askItem.jobFact }));
  const refused = (o) => { try { todos.add(`claude:${cidOf('named')}`, { origin: 'jobs', i18n: { text: { key: '{name} x', params: { name: 'n' } } }, ...o }); return null; } catch (e) { return e.message; } };
  ok(/^jobFact must be a short kebab word/.test(refused({ jobId: 'jb-0000beef', jobFact: 'Bad Fact!' }) || '') && /only a Background Work item with its jobId/.test(refused({ jobFact: 'ask' }) || '') && refused({ jobId: 'jb-0000beef', jobFact: 'parked-memory' }) === null, 'the store\'s fact is a short kebab word (a new copy names its own) or end:<state>:<cause>, only with its jobId — anything else is refused by name');
}

console.log('(5) SHOW — the params line says what the flag does; the create echo names the user\'s copy; the panel\'s words have zh + ja');
{
  const ids = Object.fromEntries(['nc1', 'nc0', 'at1', 'at0'].map((n) => [n, (jobOf(REAL, n) || {}).id]));
  const s0 = jobOf(REAL, 'svc0'), s1 = jobOf(REAL, 'svc1');
  const shows = await Promise.all([...Object.entries(ids).map(([n, id]) => cli(['show', id], { leg: n })), cli(['show', s0 && s0.id], { leg: 'svc0' }), cli(['show', s1 && s1.id], { leg: 'svc1' })]);
  const line = (r) => (/^params: .*$/m.exec(r.out) || [''])[0];
  const want = ['true', 'false', 'true', 'false', 'n/a \\(a service never tells at its end\\)', 'n/a \\(a service never tells at its end\\)'];
  const names = [...Object.keys(ids), 'svc0', 'svc1'];
  const bad = shows.map((r, i) => (new RegExp(` notifyOk=(true|false) notifyUser=${want[i]}$`).test(line(r)) ? null : `${names[i]}: ${line(r) || r.err}`)).filter(Boolean);
  ok(!bad.length, 'show prints notifyUser=true|false beside notifyOk (notify-cron and a scheduled run, with and without the flag) — and n/a for a service', bad.join(' | '));
  if (s1) endRun(REAL, s1);
  ok(s1 && WIRED && REAL.jm.snapshot(s1).notifyUser === false && !REAL.inbox.some((n) => n.jobId === s1.id), 'a service the agent POSTed with notifyUser:true: the one reader says false (nothing tells at its end) — and its end files nothing', JSON.stringify(s1 && { snap: REAL.jm.snapshot(s1).notifyUser, inbox: REAL.inbox.filter((n) => n.jobId === s1.id) }));
  const fyEcho = (r) => (/^for you: .*$/m.exec(r.out) || [''])[0];
  ok(/at every fire \(--notify-user: set at creation — rm and recreate to change it\)$/.test(fyEcho(R.nc1)) && /when each fire's run ends /.test(fyEcho(R.at1)) && /when it ends /.test(fyEcho(R.tk1)) && !fyEcho(R.nc0) && !fyEcho(R.tk0),
    'the create echo names the USER\'s copy beside auto-notify (when it lands; set at creation) — and only with the flag', [R.nc1, R.at1, R.tk1, R.nc0].map(fyEcho).join(' | '));
  const aj = (n) => REAL.jm.snapshot(jobOf(REAL, n)).actionType;
  ok(aj('nc1') === 'notify' && aj('at1') === 'spawn-task' && aj('tk1') === null, 'the snapshot names a cron\'s action TYPE — the panel\'s «when it fires» (notify) vs «when each run ends» (a scheduled run) reads it', `${aj('nc1')} ${aj('at1')} ${aj('tk1')}`);
  const PANEL = fs.readFileSync(path.join(REPO, 'src/lib/jobs-panel.js'), 'utf8');
  const blk = PANEL.slice(PANEL.indexOf('lane job-notify-user: whether the job ALSO'), PANEL.indexOf('delivery journal (2.361.5'));
  const keys = [...blk.matchAll(/(?<![\w.])t\((['"])((?:(?!\1)[^\\])+)\1\)/g)].map((m) => m[2]);   // a key with an apostrophe is double-quoted
  const dict = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const ZH = dict('src/lib/i18n-zh.js'), JA = dict('src/lib/i18n-ja.js');
  const valueOf = (src, k) => { const m = new RegExp(`^  ${JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ("(?:[^"\\\\]|\\\\.)*"),$`, 'm').exec(src); return m ? JSON.parse(m[1]) : null; };
  const missing = keys.flatMap((k) => [['zh', ZH], ['ja', JA]].filter(([, src]) => { const v = valueOf(src, k); return !v || v === k; }).map(([l]) => `${l}: ${k}`));
  ok(/job\.actionType === 'notify'/.test(blk) && !/job\.action\b(?!Type)/.test(blk), 'the row reads the snapshot\'s actionType (a client job carries no `action` — r2\'s shot caught «each run» on a notify cron)');
  ok(keys.length === 11 && !missing.length, `the For-you row's ${keys.length} sentences each have a zh AND a ja entry (i18n-check counts parity, not these keys)`, missing.join(' | ') || keys.join(' | '));
  // THE ALWAYS-LINE SAYS ONLY WHAT THE ENGINE DOES FOR THAT KIND (r3, accept-r2 unverified 3/6: «Asks, missed times and parks
  // always reach you» was drawn on every kind — a park exists only for a service, a notify cron never asks, and a missed fire
  // files a notice only for an --at time with catch-up off): the panel's OWN expression run over real snapshots, beside
  // what the engine did for each kind above (the ask and the park filed, the missed --at notice) and here (a caught-up fire)
  const expr = blk.slice(blk.indexOf('    const missed = '), blk.indexOf("    const aw = document.createElement('div')"));
  const alwaysOf = new Function('job', 't', expr + '\n    return always;');
  const cu = await post('named', { kind: 'cron', name: 'caught-up', schedule: { at: T0 + 3600e3 }, action: { type: 'notify', text: 'a caught-up reminder' }, notifyUser: false });
  const jc = cu.j && cu.j.job && WIRED.jm.jobs.get(cu.j.job.id);
  if (jc) { jc.nextFireAt = Date.now() - 600e3; await WIRED.jm._cronTick(); await new Promise((r) => setTimeout(r, 20)); }
  const fy = (j) => { const s0 = todos.snapshot(); return [...s0.open, ...s0.resolved].filter((i) => j && i.jobId === j.id); };
  const KINDS = [
    ['a task', snapOf(REAL, 'tk1'), 'Its asks reach you in For you', fy(jobOf(WIRED, 'rotate-db-password')).some((i) => i.jobFact === 'ask')],
    ['a service', snapOf(REAL, 'svc0'), 'Its asks and a park reach you in For you', fy(jobOf(WIRED, 'db-password')).some((i) => i.jobFact === 'parked')],
    ['a scheduled run', snapOf(REAL, 'at1'), "Each run's asks reach you in For you · A missed time is caught up when the server is back — never a notice", true],
    ['a notify cron (the CLI\'s: catch-up on)', snapOf(WIRED, 'caught-up'), 'A missed time is caught up when the server is back — never a notice', !!jc && jc.state === 'done' && !fy(jc).length && (jc.notifyLog || []).some((e) => e.lane === 'message' || e.lane === 'stash')],   // fired late to the agent (the conversation's 30 s floor stashes it), nothing in For you
    ['an --at notify cron with catch-up off', snapOf(WIRED, 'api-password'), 'A missed time reaches you in For you', fy(jobOf(WIRED, 'api-password')).some((i) => i.jobFact === 'missed')],
  ];
  const wrong = KINDS.map(([k, snap, want, engineDid]) => (alwaysOf(snap, (x) => x) === want && engineDid ? null : `${k}: «${alwaysOf(snap, (x) => x)}» (engine: ${engineDid})`)).filter(Boolean);
  ok(!wrong.length, 'the always-line, per kind, says only what the engine does for THAT kind — a task\'s asks; a service\'s asks and park; a cron\'s caught-up missed fire (never a notice) unless an --at time has catch-up off', wrong.join(' | '));
}

// ── teardown: the engines' stores flush synchronously; nothing outlives the scratch dir ──
server.close();
for (const E of [CENSUS, REAL, NOHAND, OLD, NOBELT, WIRED]) E.jm.shutdown();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ntest-jobs-cli-body: ${pass} passed, ${fail} failed`);
console.log(fail ? 'FAILED' : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
