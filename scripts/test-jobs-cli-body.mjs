#!/usr/bin/env node
// test-jobs-cli-body — A FLAG THE USAGE PRINTS REACHES THE WIRE, for every verb that prints it (lane job-notify-user,
// 2026-10-28). userW's agent (relayed feedback): `vibespace-job notify-cron … --notify-user` never sent `notifyUser`, so a
// fire woke only the agent, the user's For you tray got nothing, and `show` said nothing about it. test-jobs-engine was
// green: it handed the engine a top-level field the CLI never wrote. No test drove the REAL CLI's body. This suite does:
//   (1) WIRE — the real data/bin/vibespace-job against a loopback server that records every POST body: notify-cron, a
//       plain run and a scheduled run (--at / --every) carry ONE top-level `notifyUser: true` with --notify-user, false
//       without it (the controls).
//   (2) THE BODY CENSUS — every flag the usage's create block prints, and every flag the run / notify-cron branch reads,
//       has a PIN (the invocation, the field it lands in, the value — checked in the POST body AND in the spec the real
//       route hands the engine) or a NOT-ON-WIRE row with its reason. A flag with neither is red BY NAME. Controls: a
//       flag planted in a copy of the usage, a planted branch read, a CLI copy that drops the field.
//   (3) FIRE — the CLI's own POSTs go through the REAL POST /api/agent/jobs (setupAgentRoutes in-process behind the
//       loopback server) into a real JobManager (no spawn: `_spawn` stubbed, a run ended by hand): a notify-cron fire
//       with the flag calls deps.notifyUser with the text AND messages the owner conversation (both lanes journaled);
//       without it, the conversation only. A scheduled run's child and a plain task tell the user at their end only
//       with the flag. Control: a jobs.js copy without the parent→child hand-over leaves the scheduled child silent.
//   (4) SHOW — `vibespace-job show` prints notifyUser=true|false on its params line, beside notifyOk.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'data/bin/vibespace-job');
const { JobManager } = require('../src/jobs.js');
const AR = require('../src/agent-routes.js');

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? `\n      ${String(extra).slice(0, 700)}` : ''}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jobs-cli-body-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });   // a crash leaves no scratch
const CWD = path.join(tmp, 'work'); fs.mkdirSync(CWD);
const T0 = Date.now();

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

// ── the engines: real JobManagers, timers off, no process ever spawned ──
function engine(JM, name) {
  const dir = path.join(tmp, name); fs.mkdirSync(dir);
  const E = { inbox: [], told: [], specs: [] };
  E.jm = new JM({
    dataDir: dir, broadcast() { }, log() { }, notifyUser: (n) => E.inbox.push(n),
    deliverToConversation: async (cid, text) => { E.told.push({ cid, text }); return { ok: true, lane: 'message', peerName: 'owner' }; },
    groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true,
  });
  E.jm.init();
  for (const t of E.jm._timers) clearInterval(t);
  E.jm._spawn = (job, trigger) => { job.runs = job.runs || []; job.runs.push({ startedAt: Date.now(), trigger }); job.state = 'up'; };
  // the spec the REAL route hands the engine (census leg 2's second hop)
  const create = E.jm.create.bind(E.jm);
  E.jm.create = (spec, caller) => { E.specs.push(spec); return name === 'census' ? { error: 'census: recorded, not created' } : create(spec, caller); };
  return E;
}
const CENSUS = engine(JobManager, 'census');
const REAL = engine(JobManager, 'real');
// CONTROL engine: the parent→child hand-over cut (the line this lane added) — a scheduled child no longer hears its parent
const HAND = '      child.notifyUser = M.notifyUserOf(job);\n';
const HANDS = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8').split(HAND).length === 2;
const NOHAND = engine(HANDS ? loadPatched('src/jobs.js', [[HAND, '']]).JobManager : JobManager, 'no-handover');

// ── the sessions (one conversation per leg: the engine's 30 s per-conversation floor never joins two legs) ──
const LEGS = ['census', 'nc1', 'nc0', 'at1', 'at0', 'ev1', 'tk1', 'tk0', 'ctl'];
const ENGINE_OF = { census: CENSUS, ctl: NOHAND };
const cidOf = (leg) => `c0ffee00-0000-4000-8000-${String(LEGS.indexOf(leg)).padStart(12, '0')}`;
const SESS = new Map(LEGS.map((leg) => [`w-${leg}`, { claudeSessionId: cidOf(leg), backend: 'claude', name: leg, mode: 'chat', cwd: CWD, agentToken: `vsst_${leg}`, createdAt: 1 }]));
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
const bodyOf = (name) => (wire.find((w) => w.body && w.body.name === name) || {}).body;
const get = (o, p) => p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── THE CENSUS (2): the flags the usage prints for run / notify-cron + the flags that branch reads ──
const SRC = fs.readFileSync(CLI, 'utf8');
const usageCreate = (src) => { const u = /const USAGE = `([\s\S]*?)`;/.exec(src); const b = u && /\ncreate:([\s\S]*?)\ndocs:/.exec(u[1]); return b ? b[1] : null; };
const branchOf = (src) => { const i = src.indexOf("case 'run': case 'notify-cron': {"); const j = i < 0 ? -1 : src.indexOf("case 'docs':", i); return j > i ? src.slice(i, j) : null; };
const printedFlags = (src) => new Set(usageCreate(src).match(/--[a-z][a-z-]*/g) || []);
const readFlags = (src) => new Set([...branchOf(src).matchAll(/flags\.([a-z][a-zA-Z]*)|flags\['([a-z][a-z-]*)'\]/g)].map((x) => `--${x[1] || x[2]}`));
// the census invocations: every flag below rides one of them (mutually exclusive shapes get their own)
const INV = {
  svc: ['run', 'sleep 60', '--name', 'census-svc', '--note', 'a note', '--context', 'ctx words', '--cwd', CWD, '--until', 'READY', '--timeout', '6h', '--stdin-open', '--notify-user', '--notify', 'on',
    '--view', 'all', '--control', 'group', '--stop-with-owner', '--keep-up', '--restart', 'always', '--port', '8123', '--publish'],
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
  '--notify-user': [['svc', 'notifyUser', true], ['every', 'notifyUser', true], ['nc', 'notifyUser', true]],   // every shape: task/service, scheduled run, notify-cron
  '--notify': [['svc', 'notify', 'on']], '--notify-ok': [['every', 'action.task.notifyOk', true]],
  '--every': [['every', 'schedule.everyMs', 30 * 60e3]], '--jitter': [['every', 'schedule.jitterPct', 5]], '--cron': [['cron', 'schedule.cron', '41 9 * * *']], '--at': [['nc', 'schedule.at', atOk]],
  '--keep-up': [['svc', 'kind', 'service']], '--restart': [['svc', 'restart', 'always']], '--port': [['svc', 'ports', [8123]]], '--publish': [['svc', 'publish', true]],
  '--view': [['svc', 'access.view', 'all']], '--control': [['svc', 'access.control', 'group']], '--stop-with-owner': [['svc', 'stopWithOwner', true]],
  '--text': [['nc', 'action.text', 'census reminder']], '--urgency': [['nc', 'action.urgency', 'high']],
};
const NOT_ON_WIRE = {
  '--env': 'read and never sent since 2.342.0 (`env: … ? undefined : undefined`): no env VALUE rides the wire from a command line, and the usage prints no --env',
};
const censusFindings = (src) => {
  const named = new Set([...printedFlags(src), ...readFlags(src)]);
  return {
    unpinned: [...named].filter((f) => !PINS[f] && !NOT_ON_WIRE[f]).sort(),
    stale: [...Object.keys(PINS), ...Object.keys(NOT_ON_WIRE)].filter((f) => !named.has(f)).sort(),
  };
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
const MUT = path.join(tmp, 'mut', 'data', 'bin'); fs.mkdirSync(MUT, { recursive: true });
const NU = "        notifyUser: !!flags['notify-user'],\n";
ok(SRC.split(NU).length === 2, 'the CLI writes notifyUser ONCE, in the body every shape shares');
ok(HANDS, 'src/jobs.js hands a cron child its parent\'s For-you setting ONCE, at every fire (the control below cuts that line)');
fs.writeFileSync(path.join(MUT, 'vibespace-job'), SRC.replace(NU, ''));
fs.copyFileSync(path.join(REPO, 'src/cli-call.js'), path.join(MUT, 'cli-call.js'));   // a host's layout: the helper beside the CLI
const runs = await Promise.all([
  ...Object.values(INV).map((argv) => cli(argv)),
  cli(['notify-cron', '--name', 'census-nc-dropped', '--at', '+5m', '--text', 'x', '--notify-user'], { bin: path.join(MUT, 'vibespace-job') }),
  cli(['notify-cron', '--name', 'nc1', '--at', '+5m', '--text', 'reminder for the user NC1', '--notify-user'], { leg: 'nc1' }),
  cli(['notify-cron', '--name', 'nc0', '--at', '+5m', '--text', 'reminder for me NC0'], { leg: 'nc0' }),
  cli(['run', 'true', '--name', 'at1', '--at', '+5m', '--notify-user'], { leg: 'at1' }),
  cli(['run', 'true', '--name', 'at0', '--at', '+5m'], { leg: 'at0' }),
  cli(['run', 'true', '--name', 'ev1', '--every', '30m', '--notify-user'], { leg: 'ev1' }),
  cli(['run', 'true', '--name', 'tk1', '--notify-user'], { leg: 'tk1' }),
  cli(['run', 'true', '--name', 'tk0'], { leg: 'tk0' }),
  cli(['run', 'true', '--name', 'ctl', '--at', '+5m', '--notify-user'], { leg: 'ctl' }),
]);
const cliBad = runs.filter((r, i) => (i < Object.keys(INV).length + 1 ? !/census: recorded, not created/.test(r.err) : r.code !== 0));
ok(!cliBad.length, `every CLI call reached the route (${runs.length} calls: the census ones refused after recording, the fire legs created)`, cliBad.map((r) => `${r.code} ${r.err}`).join(' | '));

console.log('(1) WIRE — the real CLI\'s POST body, three shapes');
ok(bodyOf('nc1') && bodyOf('nc1').notifyUser === true && bodyOf('nc1').action.type === 'notify', 'notify-cron --notify-user ⇒ body.notifyUser: true (it was never sent)', JSON.stringify(bodyOf('nc1')));
ok(bodyOf('nc0') && bodyOf('nc0').notifyUser === false, 'CONTROL: notify-cron without the flag ⇒ body.notifyUser: false', JSON.stringify(bodyOf('nc0')));
ok(bodyOf('at1') && bodyOf('at1').notifyUser === true && bodyOf('at1').action.type === 'spawn-task' && !('notifyUser' in bodyOf('at1').action.task),
  'a scheduled run --at … --notify-user ⇒ body.notifyUser: true at the TOP — one field, the embedded task carries none', JSON.stringify(bodyOf('at1')));
ok(bodyOf('ev1') && bodyOf('ev1').notifyUser === true && !('notifyUser' in bodyOf('ev1').action.task), 'a scheduled run --every … --notify-user ⇒ the same top-level field', JSON.stringify(bodyOf('ev1')));
ok(bodyOf('at0') && bodyOf('at0').notifyUser === false, 'CONTROL: a scheduled run without the flag ⇒ false', JSON.stringify(bodyOf('at0')));
ok(bodyOf('tk1') && bodyOf('tk1').notifyUser === true && bodyOf('tk0') && bodyOf('tk0').notifyUser === false, 'a plain run: true with the flag, false without', `${JSON.stringify(bodyOf('tk1'))} / ${JSON.stringify(bodyOf('tk0'))}`);

console.log('(2) THE BODY CENSUS — a flag the usage prints (or the branch reads) lands in the body and in the engine spec');
const fz = censusFindings(SRC);
ok(!fz.unpinned.length, `every create flag has a pin or a not-on-wire reason (${printedFlags(SRC).size} printed, ${readFlags(SRC).size} read)`, `NO PIN: ${fz.unpinned.join(', ')}`);
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
  const dropped = landing('--notify-user', { ...bodies, nc: bodyOf('census-nc-dropped') }, null);
  ok(dropped.length === 1 && /^--notify-user → POST body notifyUser = undefined \(nc\)$/.test(dropped[0]), 'CONTROL: a CLI copy that drops the field (the 2.369.360 notify-cron) is red by flag, field and shape', JSON.stringify(dropped));
}

console.log('(3) FIRE — through the real route into the engine: the user\'s For you copy and the owner conversation');
const jobOf = (E, name) => [...E.jm.jobs.values()].find((j) => j.name === name && !j.cronParent);
const childOf = (E, job) => [...E.jm.jobs.values()].find((j) => j.cronParent === job.id);
const endRun = (E, job) => { const run = job.runs[job.runs.length - 1]; E.jm._finalizeRun(job, run, { code: 0, endedAt: Date.now() }, 'sweep'); };
for (const [E, names] of [[REAL, ['nc1', 'nc0', 'at1', 'at0', 'ev1']], [NOHAND, ['ctl']]]) for (const n of names) { const j = jobOf(E, n); if (j) j.nextFireAt = Date.now() - 1000; }
await REAL.jm._cronTick(); await NOHAND.jm._cronTick();
await new Promise((r) => setTimeout(r, 30));   // the owner lane's delivery settles on its promise
{
  const j1 = jobOf(REAL, 'nc1'), j0 = jobOf(REAL, 'nc0');
  const lanes = (j) => (j && j.notifyLog || []).filter((e) => e.ok).map((e) => e.lane).sort().join(',');
  ok(j1 && REAL.inbox.some((n) => n.jobId === j1.id && n.text === 'reminder for the user NC1'), 'notify-cron --notify-user fires ⇒ deps.notifyUser gets the text (the For you copy)', JSON.stringify(REAL.inbox));
  ok(j1 && REAL.told.some((t) => t.cid === cidOf('nc1') && t.text.includes('reminder for the user NC1')), '…AND the owner conversation is messaged', JSON.stringify(REAL.told.map((t) => t.cid)));
  ok(lanes(j1) === 'message,user-inbox', '…both lanes journaled', JSON.stringify(j1 && j1.notifyLog));
  ok(j0 && !REAL.inbox.some((n) => n.jobId === j0.id) && REAL.told.some((t) => t.cid === cidOf('nc0')) && lanes(j0) === 'message', 'CONTROL: without the flag the fire messages the conversation ONLY (option A, 2.363.1)', JSON.stringify(j0 && j0.notifyLog));
  const a1 = jobOf(REAL, 'at1'), a0 = jobOf(REAL, 'at0'), e1 = jobOf(REAL, 'ev1');
  const c1 = a1 && childOf(REAL, a1), c0 = a0 && childOf(REAL, a0), ce = e1 && childOf(REAL, e1);
  ok(c1 && c0 && ce, 'each scheduled run\'s fire made its child (spawn stubbed)', `${!!c1} ${!!c0} ${!!ce}`);
  for (const c of [c1, c0, ce]) if (c) endRun(REAL, c);
  ok(c1 && REAL.inbox.some((n) => n.jobId === c1.id && /^Task at1 run: done \(ok\)$/.test(n.text)), 'a scheduled run --at … --notify-user: its child\'s end tells the user', JSON.stringify(REAL.inbox.map((n) => n.text)));
  ok(ce && REAL.inbox.some((n) => n.jobId === ce.id), '…and --every … --notify-user the same', JSON.stringify(REAL.inbox.map((n) => n.text)));
  ok(c0 && !REAL.inbox.some((n) => n.jobId === c0.id), 'CONTROL: a scheduled run without the flag: the child ends silently for the user');
  const t1 = jobOf(REAL, 'tk1'), t0 = jobOf(REAL, 'tk0');
  for (const t of [t1, t0]) if (t) endRun(REAL, t);
  ok(t1 && t0 && REAL.inbox.some((n) => n.jobId === t1.id && /^Task tk1: done \(ok\)$/.test(n.text)) && !REAL.inbox.some((n) => n.jobId === t0.id), 'a plain run: told at its end with the flag, not without', JSON.stringify(REAL.inbox.map((n) => n.text)));
  const k = jobOf(NOHAND, 'ctl'), kc = k && childOf(NOHAND, k);
  if (kc) endRun(NOHAND, kc);
  ok(k && k.notifyUser === true && kc && !NOHAND.inbox.some((n) => n.jobId === kc.id), 'CONTROL: a jobs.js copy without the parent→child hand-over leaves the scheduled child silent (the leg above would go red)', JSON.stringify(NOHAND.inbox));
}

console.log('(4) SHOW — the params line says it');
{
  const ids = Object.fromEntries(['nc1', 'nc0', 'at1', 'at0'].map((n) => [n, (jobOf(REAL, n) || {}).id]));
  const shows = await Promise.all(Object.entries(ids).map(([n, id]) => cli(['show', id], { leg: n })));
  const line = (r) => (/^params: .*$/m.exec(r.out) || [''])[0];
  const want = [true, false, true, false];
  const bad = shows.map((r, i) => (new RegExp(` notifyOk=(true|false) notifyUser=${want[i]}$`).test(line(r)) ? null : `${Object.keys(ids)[i]}: ${line(r) || r.err}`)).filter(Boolean);
  ok(!bad.length, 'show prints notifyUser=true|false beside notifyOk (notify-cron and a scheduled run, with and without the flag)', bad.join(' | '));
}

// ── teardown: the engines' stores flush synchronously; nothing outlives the scratch dir ──
server.close();
for (const E of [CENSUS, REAL, NOHAND]) E.jm.shutdown();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ntest-jobs-cli-body: ${pass} passed, ${fail} failed`);
console.log(fail ? 'FAILED' : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
