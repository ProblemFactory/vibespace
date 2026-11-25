#!/usr/bin/env node
// test-job-hub-main — B-2c5c's remainder (lane bl-proposals; the coordinator's r1192): A BACKGROUND WORK JOB WHOSE MAIN IS THE HUB.
// The main door of 2.369.413 (test-stop-tree §10) refuses every stop of a job whose main IS the hub while that hub runs. What is left,
// one unit each, every scene on STAND-INS (no real hub restart, nothing of production):
//   §1 (the row's (1)) the job's main WAS the hub and it ENDS BY ITSELF (a restart, an update): the wrapper REMEMBERS «my main was the
//      hub» while it runs — its end's drain stops nothing the hub started (its conversations, its helpers, re-parented into the job's
//      group or scope), a stop after it stops nothing, and the end's record says so (exit.json `hubMain`): the engine then never reaps
//      that run's scope and never counts what it left as «kept». THE SCENE: the real engine and the real wrapper over a scratch data
//      folder; the main is a stand-in hub (node — its own pid in the folder's server.pid, as a hub writes it; a child in the job's
//      process group, as a hub's helper) that ends by itself once the wrapper has said it latched. RED: a copy of the wrapper with the
//      latch cut — the drain SIGTERMs the hub's child
//   §2 (the row's (2)) such a run whose WRAPPER IS KILLED: the hub's boot proves it is that run's main (its parent chain reaches the
//      run's wrapper) and keeps it on the run; the sweep then never judges the run ended (its main is this hub, which runs), and ANY
//      end of a hub-main service is never restarted by itself (its policy, a boot's replay): never a second hub beside the one that
//      runs. RED: the sweep's guard cut; the no-restart rule cut
//   §3 (the row's (5)) a hub started inside a job KEEPS NONE OF THAT JOB'S NAMES: its jobs engine drops every VIBESPACE_JOB_* at its
//      construction (where B-7ca1 drops the run mark), so no child the hub starts on its own env takes the job's id (a vibespace-job
//      with no id there speaks as the job) or its bearer. THE SCENE: the real engine starts a task through the real wrapper; its
//      main is a stand-in hub that constructs the jobs engine, as a hub's boot does, and writes down — before and after — the job's
//      names in its own env, in a child started on its own env (a probe's road) and in a conversation's env (agentEnv). RED: a copy
//      of the engine with the drop cut — the child after it still takes the job's id and bearer
//   §4 (r1263) ONE FACT, ONE ACCESSOR: «this run's main is the hub, or leads to it» is read through _hubMainOf wherever a run is ended,
//      reaped, judged or replayed — the exit record's fact OR the run's kept one (a census: a reader of either alone is red by name);
//      the next hub's boot over a killed wrapper's run reaps nothing and replays nothing. ONE RECOGNISER (hubChain, the shipped twin):
//      the hub's own parent chain — a launcher main is latched, a launcher beside the main is kept by the drain; both callers over one
//      table of process shapes answer the same. Each leg with its RED
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
const M = require(path.join(ROOT, 'src/job-model.js'));
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(20); } return !!(await fn()); };
const D = scratch('job-hub-main'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
const mine = [];   // every identity this suite made — ended at its exit, by identity
process.on('exit', () => { for (const m of mine) { try { PI.signalIdentity(m, 'SIGKILL'); } catch { } } try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
const WRAP = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8');
const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
const MJ = mutantCopies('job-hub-main', ROOT);
const LATCH_LINE = 'its main process is the VibeSpace hub';

// ════════ §1 THE MAIN WAS THE HUB, AND IT ENDED BY ITSELF ════════
console.log('§1 the job\'s main WAS the hub and it ended by itself — its end stops nothing the hub started');
/** the scene: the real engine + `wrapperText` as the job's wrapper; the main a stand-in hub that ends once the wrapper said it latched
 *  (or at `capMs`, the mechanism's own bound handed to it) */
async function hubEndScene(wrapperText, tag, capMs, { launcher = false } = {}) {
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), wrapperText);
  const kidFile = path.join(dd, 'kid.pid');
  const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
  const logs = [];
  const jm = new JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
  jm.init();
  const caller = { conversationId: 'conv-hm', sessionId: 'sess-hm', sessionCreatedAt: 1, groups: new Set() };
  const owner = { conversation: { backend: 'claude', id: 'conv-hm' }, sessionId: 'sess-hm', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
  // THE STAND-IN HUB: its pid into the data folder's server.pid (as a hub writes it at its boot), a child of its own in the job's group
  // (a hub's helper: never setsid), then it waits until its job's log says the wrapper latched — or its cap — and ends by itself
  const hub = [
    "const fs = require('fs'), path = require('path');",
    `fs.writeFileSync(${JSON.stringify(path.join(dd, 'server.pid'))}, String(process.pid));`,
    "const k = require('child_process').spawn('sleep', ['300'], { stdio: 'ignore' }); k.unref();",
    `fs.writeFileSync(${JSON.stringify(kidFile)}, String(k.pid));`,
    `const logs = path.join(${JSON.stringify(path.join(dd, 'job-logs'))}, process.env.VIBESPACE_JOB_ID || '');`,
    `const latched = () => { try { return fs.readdirSync(logs).some((d) => { try { return fs.readFileSync(path.join(logs, d, 'current.log'), 'utf8').includes(${JSON.stringify(LATCH_LINE)}); } catch { return false; } }); } catch { return false; } };`,
    `const t0 = Date.now(); const tick = setInterval(() => { if (latched() || Date.now() - t0 > ${Number(capMs)}) { clearInterval(tick); process.exit(0); } }, 50);`,
  ].join('\n');
  // r1263 MUST 2: a LAUNCHER main (a start script, the package's start) that starts the hub as its CHILD and ends when the hub ends
  const launch = `const k = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(hub)}], { stdio: 'inherit' }); k.on('exit', (c) => process.exit(c || 0));`;
  const r = jm.create({ kind: 'task', name: 'hub-as-job', cmd: { argv: [process.execPath, '-e', launcher ? launch : hub] }, owner }, caller);
  const job = jm.jobs.get(r.job.id);
  await until(async () => { await jm._sweep(); return ['interrupted', 'failed', 'done'].includes(job.state); }, 20000);
  let kid = 0; try { kid = Number(fs.readFileSync(kidFile, 'utf8')); } catch { }
  const kidId = kid > 1 ? PI.identityOf(kid) : null;
  if (kidId) mine.push(kidId);
  // the drain has run (the run's end is judged after the wrapper's exit.json): is the hub's child alive? (a SIGTERM'd sleep is gone at once)
  await sleep(200);
  const alive = !!kidId && PI.aliveIdentity(kidId) === true;
  const run = job.runs[job.runs.length - 1];
  const ctl = path.join(dd, 'job-logs', job.id, String(run.startedAt));
  let exit = null; try { exit = JSON.parse(fs.readFileSync(path.join(ctl, 'exit.json'), 'utf8')); } catch { }
  let log = ''; try { log = fs.readFileSync(path.join(ctl, 'current.log'), 'utf8'); } catch { }
  const pending = jm._pending(job, run);
  try { jm.shutdown(); } catch { }
  return { state: job.state, kid, alive, exit, left: run.left || null, log, pending, said: logs.filter((l) => l.includes(job.id)).join(' | ') };
}
{
  const LATCH = '  if (yes && !mainWasHub) { mainWasHub = true;';
  const [real, red] = await Promise.all([
    hubEndScene(WRAP, 'hub-end', 15000),
    hubEndScene(anchored(WRAP, LATCH, '  if (false) {   /* MUTANT: the latch cut */', 'b2c5c-u1-latch-cut'), 'hub-end-mut', 1500),
  ]);
  ok(real.kid > 1 && real.log.includes(LATCH_LINE), 'the scene: the wrapper RECOGNISED its main as the hub (its server.pid) and said so in the job\'s log; the stand-in hub started a child in the job\'s group, then ended by itself', { kid: real.kid, latched: real.log.includes(LATCH_LINE), state: real.state });
  ok(real.alive === true, 'THE MAIN WAS THE HUB: its end\'s drain stops NOTHING the hub started — the hub\'s child (re-parented into the job\'s group) lives on', { alive: real.alive, state: real.state });
  ok(!!real.exit && real.exit.hubMain === true && !!real.left && real.left.hubMain === true && real.left.n >= 1 && !real.left.kept,
    'the end\'s record says it: exit.json `hubMain`, the run\'s left record `hubMain` (never «kept»: the engine stops nothing of it at a next start)', { exit: real.exit && { hubMain: real.exit.hubMain, left: real.exit.left }, left: real.left });
  ok(/its main process was the VibeSpace hub — the \d+ process(es)? it left (is|are) the hub's \(its conversations and helpers\): left running, never stopped by this job/.test(real.log),
    'the job\'s log says what was left and whose it is — never «the job left 1 process running — it was stopped»', real.log.split('\n').filter((l) => /exit code/.test(l)));
  ok(real.pending === false, 'the engine waits for nothing of it (no reap pending: what a hub-main run left is the hub\'s)', real.pending);
  ok(red.kid > 1 && red.alive === false && !(red.exit && red.exit.hubMain), 'CONTROL (the latch cut, in a copy of the wrapper): the drain at the end SIGTERMs the hub\'s child — the leg above would be red', { alive: red.alive, left: red.left });
}
{
  // THE ENGINE: never a reap of what a hub-main run left — its three roads (the boot's adopt, the sweep's judged end, the reap itself),
  // compiled from its own source over a stand-in run (nothing signalled)
  const JM = require(path.join(ROOT, 'src/jobs.js')).JobManager;
  const self = (exit) => ({ _runDoubt: () => '', _runScope: () => ({ dir: '/nonexistent/scope', unit: 'vs-job-x.scope' }), _reapLater: new Map(), _readExit: () => exit, _hubMainOf: JM.prototype._hubMainOf });
  const run = { endedAt: 1 };
  ok(JM.prototype._pending.call(self({ code: 0, hubMain: true }), {}, run) === false && JM.prototype._pending.call(self({ code: 0 }), {}, run) === true,
    'the engine\'s wait before a next start: a hub-main run\'s scope is nothing to wait for (an ordinary run\'s unmeasured scope is)');
  const logs = [];
  const reapSelf = { ...self({ code: 0, hubMain: true }), d: { log: (l) => logs.push(l) }, _wrapperUnproven: () => { throw new Error('reached the kill road'); } };
  const reaped = await JM.prototype._reapOnce.call(reapSelf, { id: 'jb-hm' }, { endedAt: 1 });
  ok(reaped === true && logs.some((l) => /its main process was the VibeSpace hub — what is left in its scope is the hub's: not reaped/.test(l)), 'the reap itself refuses a hub-main run\'s scope (said in the journal), whatever road asked', { reaped, logs });
  const BOOT = "        if (!((exit && (exit.scopeEmpty === true || (exit.left && exit.left.kept))) || this._hubMainOf(run, exit))) this._reapScope(job, run).catch(() => { });";
  const SWEEP = "        if (!(exit.scopeEmpty === true || (exit.left && exit.left.kept) || this._hubMainOf(run, exit))) this._reapScope(job, run).catch(() => { });";
  ok(JSRC.includes(BOOT) && JSRC.includes(SWEEP), 'WIRING: the boot\'s adopt and the sweep\'s judged end never start a reap of a hub-main run\'s scope');
  const PEND = "    return !((exit && exit.scopeEmpty === true) || this._hubMainOf(run, exit));";
  const JX = MJ.load('src/jobs.js', anchored(JSRC, PEND, '    return !(exit && exit.scopeEmpty === true);   /* MUTANT: the release */', 'b2c5c-u1-pending'), 'b2c5c-u1-pending');
  ok(JX.JobManager.prototype._pending.call(self({ code: 0, hubMain: true }), {}, run) === true, 'CONTROL (the release\'s wait, in a copy): a next start waits on — and reaps — the hub\'s processes in that scope — RED');
  // a STOP after the hub (the main) ended: refused — the wrapper's own onStop, compiled from its source (its free names stubbed)
  const fnOf = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('not found: ' + head); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } throw new Error('unbalanced: ' + head); };
  const onStopOf = (src, wasHub) => {
    const seen = [];
    const env = { seen, mainKept: () => false, sayMainKept: (sig) => seen.push('said ' + sig), mainWasHub: wasHub, sayHubLeft: (sig) => seen.push('hub-left ' + sig), markStopping: () => { throw new Error('MARKED'); } };
    const f = new Function(...Object.keys(env), `let stopping = null, stopAt = 0, stopBy = '', refusedAt = 0; ${fnOf(src, 'function onStop(sig, at, by) {')}\nreturn (s, a, b) => { try { onStop(s, a, b); } catch (e) { seen.push(e.message); } return { seen: seen.join(), stopping, refusedAt }; };`)(...Object.values(env));   // eslint-disable-line no-new-func
    return f('SIGTERM', 4321, 'engine');
  };
  const sWas = onStopOf(WRAP, true), sNot = onStopOf(WRAP, false);
  const sX = onStopOf(anchored(WRAP, '  if (mainWasHub) { sayHubLeft(sig); refusedAt = Math.max(refusedAt, at); return; }\n', '', 'b2c5c-u1-stop-cut'), true);
  ok(sWas.seen === 'hub-left SIGTERM' && sWas.stopping === null && sWas.refusedAt === 4321 && sNot.seen === 'MARKED' && sX.seen === 'MARKED',
    'a STOP after the hub (the main) ended is refused — said («what is left is the hub\'s»), never marked stopping, its moment kept; a job whose main never was the hub stops as before; CONTROL (the refusal cut, in a copy): marked stopping — RED', { sWas, sNot, sX });
  // the words: the model's and the wrapper's twin, line for line
  const words = M.leftWords({ n: 2, hubMain: true }), rec = M.leftRecord({ n: 2, hubMain: true, kept: false });
  ok(words === 'its main process was the VibeSpace hub — the 2 processes it left are the hub\'s (its conversations and helpers): left running, never stopped by this job' && rec && rec.hubMain === true && !rec.kept,
    'the model\'s words and record for it (the wrapper\'s twin says the same — the job\'s log above)', { words, rec });
}

// ════════ §2 THE WRAPPER OF A HUB-MAIN RUN KILLED ════════
console.log('§2 a run whose main IS this hub, its wrapper killed — never judged ended, never restarted beside itself');
const OWNER = { conversation: { backend: 'claude', id: 'conv-hm' }, sessionId: 'sess-hm', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const CALLER = { conversationId: 'conv-hm', sessionId: 'sess-hm', sessionCreatedAt: 1, groups: new Set() };
/** the scene: engine 1 starts a SERVICE through the real wrapper and shuts down (its wrapper and main run on); engine 2 boots over the
 *  same folder as that run's own hub (the `hubParentPid` seam: its parent is that wrapper) — then the wrapper is killed */
async function wrapperKilledScene(JM2, tag) {
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), WRAP);
  const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
  const deps = { dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] };
  const j1 = new JobManager(deps); j1.init();
  const r = j1.create({ kind: 'service', name: 'hub-svc', cmd: { argv: ['sleep', '300'] }, owner: OWNER }, CALLER);
  const id = r.job && r.job.id;
  let st = null; await until(() => { const j = j1.jobs.get(id); st = j && j1._readStamp(j); return !!st && j1._verifyAlive(st); }, 8000);
  const wrapperId = st ? { ...PI.identityOf(Number(st.pid)) } : null;
  let mainId = null; try { const kid = Number(String(fs.readFileSync(`/proc/${st.pid}/task/${st.pid}/children`, 'utf8')).trim().split(/\s+/)[0]); if (kid > 1) mainId = PI.identityOf(kid); } catch { }
  if (wrapperId) mine.push(wrapperId); if (mainId) mine.push(mainId);
  const lock = j1.lockFile; j1.shutdown(); await until(() => !fs.existsSync(lock), 5000);
  const logs = [];
  const j2 = new JM2({ ...deps, log: (...a) => logs.push(a.join(' ')), hubParentPid: st ? Number(st.pid) : 0 }); j2.init();
  for (const t of j2._timers || []) clearInterval(t); j2._timers = [];
  const job = j2.jobs.get(id), run = job && job.runs[job.runs.length - 1];
  const latched = !!run && run.hubMain === true;
  if (wrapperId) PI.signalIdentity(wrapperId, 'SIGKILL');   // the wrapper killed — its main (this hub's stand-in) runs on
  await until(() => !!wrapperId && PI.aliveIdentity(wrapperId) !== true, 3000);
  await j2._sweep(); await j2._sweep();
  const out = { readOnly: !!j2.readOnly, latched, state: job && job.state, ended: !!(run && run.endedAt), desiredUp: job && job.desiredUp, runs: job && job.runs.length, said: logs.filter((l) => l.includes(id)).join(' | ') };
  try { j2.shutdown(); } catch { }
  return out;
}
{
  const SWEEP = "      if (stamp && !this._verifyAlive(stamp) && !this._readExit(job, run) && this._hubIsMain(job, run)) {";
  const JX = MJ.load('src/jobs.js', anchored(JSRC, SWEEP, '      if (false) {   /* MUTANT: the sweep judges it as any run */', 'b2c5c-u2-sweep-cut'), 'b2c5c-u2-sweep-cut');
  const [real, red] = await Promise.all([wrapperKilledScene(require(path.join(ROOT, 'src/jobs.js')).JobManager, 'wk'), wrapperKilledScene(JX.JobManager, 'wk-mut')]);
  ok(!real.readOnly && real.latched === true && /its main process is this VibeSpace hub \(started as this job\)/.test(real.said),
    'the hub\'s boot asks, for each run it adopts, whether IT is that run\'s main (its parent is the run\'s wrapper) — proven, kept on the run (run.hubMain) and said', real);
  ok(real.state === 'up' && real.ended === false && real.runs === 1 && /its wrapper is gone, but its main process is this VibeSpace hub, which runs — the run is not ended/.test(real.said),
    'ITS WRAPPER KILLED: the sweep never judges the run ended (its main is this hub, which runs) — no second run, nothing restarted beside it; said', real);
  ok(red.latched === true && red.ended === true, 'CONTROL (the sweep\'s guard cut, in a copy): the sweep judges the run ended — the road to a restart beside the running hub — RED', red);
}
{
  // a hub-main SERVICE's end is never restarted by itself: its policy and a boot's replay start no second hub (driven through the engine's
  // own judgment over a stand-in wrapper's open run — nothing spawned again)
  const STANDIN = "const fs = require('fs'); const [ctl, spec] = process.argv.slice(2); try { fs.unlinkSync(spec); } catch { }\n";
  const endScene = (JM2, tag, exitExtra, runExtra = {}) => {
    const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), STANDIN);
    const jm = new JM2({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, deliverToConversation: async () => ({ ok: true, lane: 'message' }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
    jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
    const r = jm.create({ kind: 'service', name: 'hub-svc', cmd: { argv: ['sh', '-c', 'sleep 1'], cwd: dd }, owner: OWNER }, CALLER);
    const job = jm.jobs.get(r.job.id), run = job.runs[job.runs.length - 1];
    Object.assign(run, runExtra);
    jm._finalizeRun(job, run, { code: 0, endedAt: Date.now(), ...exitExtra }, 'sweep');
    const out = { state: job.state, desiredUp: job.desiredUp, said: jm.events.filter((e) => e.jobId === job.id).map((e) => e.what).join(' | ') };
    try { jm.shutdown(); } catch { }
    return out;
  };
  const JMr = require(path.join(ROOT, 'src/jobs.js')).JobManager;
  const byExit = endScene(JMr, 'end-exit', { hubMain: true }), byRun = endScene(JMr, 'end-run', {}, { hubMain: true }), plain = endScene(JMr, 'end-plain', {});
  ok(byExit.state === 'down' && byExit.desiredUp === false && /its main process was the VibeSpace hub — not restarted by itself: a restart would start a second hub beside the one that runs/.test(byExit.said)
    && byRun.desiredUp === false && plain.desiredUp === true,
    'a hub-main SERVICE\'s end (the wrapper\'s record says it, or the run was proven at its boot) is NOT restarted by itself — not wanted up any more, said by name; an ordinary service stays wanted up (its restart policy)', { byExit, byRun, plain });
  const RULE = "    const hubMainEnd = job.kind === 'service' && this._hubMainOf(run, exit);";
  const JY = MJ.load('src/jobs.js', anchored(JSRC, RULE, "    const hubMainEnd = false;   /* MUTANT: restarted as any service */", 'b2c5c-u2-restart-cut'), 'b2c5c-u2-restart-cut');
  const redEnd = endScene(JY.JobManager, 'end-mut', { hubMain: true });
  ok(redEnd.desiredUp === true, 'CONTROL (the rule cut, in a copy): the hub-main service stays wanted up — its policy (and a boot\'s replay) would start a second hub — RED', redEnd);
}

// ════════ §3 A HUB STARTED INSIDE A JOB KEEPS NONE OF THE JOB'S NAMES ════════
console.log('§3 a hub started inside a job hands none of that job\'s names (its id, its bearer) to what it starts');
const JOB_NAMES = ['VIBESPACE_JOB_CWD', 'VIBESPACE_JOB_ID', 'VIBESPACE_JOB_RUN', 'VIBESPACE_JOB_TOKEN'];
/** the scene: the real engine starts a TASK through the real wrapper; its main is a stand-in hub (node) that constructs the jobs
 *  engine of `jobsPath` over a folder of its own (as a hub's boot does) and writes down, before and after: the job's names in its own
 *  env, in a child it starts on its OWN env (no env handed: a probe's road) and in the env a conversation is built with (agentEnv) */
async function insideScene(actPath, tag) {   // r2271: the drop is the hub's BOOT act (src/server/throwaway-root.js dropHandedAtBoot) — the stand-in runs it first, as a real hub does
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.mkdirSync(path.join(dd, 'inner'), { recursive: true });
  fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), WRAP);
  const rec = path.join(dd, 'rec.json');
  const hub = [
    "const cp = require('child_process'), fs = require('fs');",
    `const A = require(${JSON.stringify(path.join(ROOT, 'src/agent-env.js'))});`,
    "const jobNames = (keys) => keys.filter((k) => k.startsWith('VIBESPACE_JOB_')).sort();",
    "const childNames = () => jobNames(JSON.parse(String(cp.execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env)))'], { encoding: 'utf8', timeout: 8000 }))));",
    "const look = () => ({ own: jobNames(Object.keys(process.env)), child: childNames(), conv: jobNames(Object.keys(A.agentEnv(process.env))), id: process.env.VIBESPACE_JOB_ID || null });",
    'const before = look();',
    `require(${JSON.stringify(actPath)}).dropHandedAtBoot();`,
    `const { JobManager } = require(${JSON.stringify(path.join(ROOT, 'src/jobs.js'))});`,
    `new JobManager({ dataDir: ${JSON.stringify(path.join(dd, 'inner'))}, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, memoryRungs: [] });`,
    'const after = look();',
    // a DAEMON it double-forks on its own env (sh puts it in the background and ends: re-parented, never the hub's child) — does the
    // job's mark find it? (a service's stop of that job ends what its mark finds: src/jobs.js, the kept clear) — then ended at once
    "const sh = cp.spawnSync('/bin/sh', ['-c', 'sleep 300 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8', timeout: 8000 }), dpid = Number(String(sh.stdout || '').trim()) || 0;",
    `const PI = require(${JSON.stringify(path.join(ROOT, 'src/proc-identity.js'))});`,
    "const marked = dpid > 1 && before.id ? PI.membersOf({ mark: 'VIBESPACE_JOB_ID=' + before.id }) : [];",
    'const daemon = { pid: dpid, byMark: marked.some((x) => Number(x.pid) === dpid) };',
    "if (dpid > 1) { try { process.kill(dpid, 'SIGKILL'); } catch { } }",
    `fs.writeFileSync(${JSON.stringify(rec)}, JSON.stringify({ before, after, daemon }));`,
  ].join('\n');
  const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
  const jm = new JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
  jm.init();
  const r = jm.create({ kind: 'task', name: 'hub-inside', cmd: { argv: [process.execPath, '-e', hub], cwd: dd }, owner: OWNER }, CALLER);
  const job = jm.jobs.get(r.job.id);
  await until(async () => { await jm._sweep(); return ['interrupted', 'failed', 'done'].includes(job.state); }, 20000);
  let out = null; try { out = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch { }
  const run = job.runs[job.runs.length - 1];
  let log = ''; try { log = fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'current.log'), 'utf8'); } catch { }
  try { jm.shutdown(); } catch { }
  return { jobId: job.id, state: job.state, ...(out || { log: log.slice(-600) }) };
}
{
  // r2271: the drop moved from the jobs engine's construction to the hub's boot act — pinned there, its call right after the re-home
  const TRSRC = fs.readFileSync(path.join(ROOT, 'src/server/throwaway-root.js'), 'utf8'), RBSRC = fs.readFileSync(path.join(ROOT, 'src/server/runtime-boot.js'), 'utf8');
  const DROP = "    const job = k.startsWith('VIBESPACE_JOB_');\n";
  ok(TRSRC.split(DROP).length === 2 && RBSRC.includes("  TR.rehomeAtBoot({ root: rootDir, env });\n  TR.dropHandedAtBoot({ env });") && !JSRC.includes("if (k.startsWith('VIBESPACE_JOB_')) delete process.env[k]"), 'WIRING: the hub drops every VIBESPACE_JOB_* once, at its BOOT (src/server/throwaway-root.js dropHandedAtBoot, called by runtime-boot right after the re-home, before the jobs engine or any child) — the jobs engine no longer does it');   // stale-pins: kept (a deliberate absence check)
  // the release had NEITHER drop: the run mark alone, and no handed mark read (a job's run env lists its own names in the mark)
  const HAS = '  const has = Object.prototype.hasOwnProperty.call(env, CE.HANDED_MARK);\n';
  const cut = MJ.write('src/server/throwaway-root.js', anchored(anchored(TRSRC, DROP, "    const job = k === 'VIBESPACE_JOB_RUN';   /* MUTANT: the release — the run mark alone */\n", 'b2c5c-u5-drop-cut'), HAS, '  const has = false;   /* MUTANT: no handed mark read */\n', 'b2c5c-u5-mark-cut'), 'b2c5c-u5-drop-cut');
  const [real, red] = await Promise.all([insideScene(path.join(ROOT, 'src/server/throwaway-root.js'), 'inside'), insideScene(cut, 'inside-mut')]);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(!!real.before && real.before.id === real.jobId && same(real.before.own, JOB_NAMES) && same(real.before.child, JOB_NAMES),
    'the scene: the job\'s spawn handed the stand-in hub (its main) the job\'s names — its id, run mark, bearer, directory — and a child it started on its own env took them all', real);
  ok(!!real.after && same(real.after.own, []) && same(real.after.child, []),
    'A HUB STARTED INSIDE A JOB: after its boot act (and its jobs engine), its env holds none of the job\'s names and a child it starts on its own env takes none (no id a vibespace-job there would speak as, no bearer)', real.after);
  ok(!!real.before && same(real.before.conv, []) && same(real.after.conv, []),
    'what the row feared for a CONVERSATION was never the road: the env a conversation is built with (agentEnv) dropped the job\'s names before and after (every VIBESPACE_* outside its keep set)', { before: real.before && real.before.conv, after: real.after && real.after.conv });
  ok(!!real.daemon && real.daemon.pid > 1 && real.daemon.byMark === false,
    'and a DAEMON it double-forks on its own env carries no job\'s mark: the job\'s mark scan (a service\'s stop ends what it finds) never finds it', real.daemon);
  ok(!!red.after && same(red.after.child, ['VIBESPACE_JOB_CWD', 'VIBESPACE_JOB_ID', 'VIBESPACE_JOB_TOKEN']) && !!red.daemon && red.daemon.byMark === true,
    'CONTROL (the release\'s drop — the run mark alone — in a copy of the engine): the hub\'s child still takes the job\'s id, its bearer and its directory, and the job\'s mark finds the hub\'s daemon — RED', { after: red.after, daemon: red.daemon });
}

// ════════ §4 ONE FACT, ONE ACCESSOR · ONE RECOGNISER (r1263) ════════
console.log('§4 the hub-main fact read through ONE accessor everywhere; ONE recogniser of «the main is the hub or leads to it», the wrapper\'s and the engine\'s');
const fnOf4 = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('not found: ' + head); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } throw new Error('unbalanced: ' + head); };
{
  // (a) THE CENSUS: every reader of the hub-main fact in the engine goes through _hubMainOf — a road that reads the exit record's (or the
  // run's) `hubMain` alone is red by name; the latch's own (_hubIsMain: this boot's proof) is the one other reader
  const readersOf = (src) => {
    const lines = src.split('\n'), out = [];
    lines.forEach((raw, i) => {
      const t = raw.replace(/\/\/.*$/, '');
      if (/^\s*(\*|\/\*\*)/.test(raw) || !/\.hubMain\b/.test(t)) return;
      let m = null; for (let k = i; k >= 0 && !m; k--) m = /^ {2}(?:async )?(_?[A-Za-z]\w*)\(/.exec(lines[k]);
      const fn = m ? m[1] : '?';
      if (fn !== '_hubMainOf' && fn !== '_hubIsMain') out.push(fn);
    });
    return out;
  };
  const READ = "{ const ex = this._readExit(job, run); if (this._hubMainOf(run, ex)) {";
  const strays = readersOf(JSRC), strayX = readersOf(anchored(JSRC, READ, '{ const ex = this._readExit(job, run); if (ex && ex.hubMain === true) {   /* MUTANT: the exit record alone */', 'b2c5c-r1263-reader'));
  const uses = (JSRC.match(/this\._hubMainOf\(/g) || []).length;
  ok(strays.length === 0 && uses === 7, `THE CENSUS: every road that ends, reaps, judges or replays a run reads «its main is the hub» through _hubMainOf (${uses} callers: the reap, the wait before a start, the boot's gate, the boot's no-exit judge, the finalize, the sweep's gate, the card's fact) — no reader of the exit record's fact alone`, { strays, uses });
  ok(strayX.length === 1 && strayX[0] === '_reapOnce', 'CONTROL (a reader of the exit record alone, in a copy): the census names it — RED', strayX);
  // r1610: src/job-model.js reads a LEFT record's `hubMain` for its words and its record's shape only — exempt BY NAME (a gate added
  // there, in any other function, is red here)
  const MODEL = fs.readFileSync(path.join(ROOT, 'src/job-model.js'), 'utf8').split('\n');
  const modelReaders = MODEL.map((l, i) => [l.replace(/\/\/.*$/, ''), i]).filter(([l]) => /\.hubMain\b/.test(l)).map(([, i]) => { for (let k = i; k >= 0; k--) { const m = /^function (\w+)\(/.exec(MODEL[k]); if (m) return m[1]; } return '?'; });
  ok(modelReaders.length >= 1 && modelReaders.every((f) => f === 'leftWords' || f === 'leftRecord'), 'THE CENSUS, src/job-model.js: the left record\'s `hubMain` is read only by leftWords and leftRecord (words and the record\'s shape — EXEMPT, never a gate)', modelReaders);
}
/** THE NEXT HUB'S BOOT (r1263 MUST 1): a service run whose main WAS the hub, its wrapper killed (no exit record, a dead stamp), the
 *  fact KEPT on the run by the hub that proved it (an older boot) — then a NEW engine boots over the folder (a hub after that one) */
const STANDIN4 = "const fs = require('fs'); const [ctl, spec] = process.argv.slice(2); try { fs.unlinkSync(spec); } catch { }\n";
async function nextBootScene(JMx, tag, kind = 'service') {
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), STANDIN4);
  const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
  const deps = { dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] };
  const j1 = new JobManager(deps); j1.init(); for (const t of j1._timers || []) clearInterval(t); j1._timers = [];
  const r = j1.create({ kind, name: 'hub-' + kind, cmd: { argv: ['sleep', '300'] }, owner: OWNER }, CALLER);
  const id = r.job && r.job.id, job = j1.jobs.get(id), run = job.runs[job.runs.length - 1];
  const dead = require('node:child_process').spawnSync(process.execPath, ['-e', '0']).pid;   // a pid that has ended: the killed wrapper's
  job.state = 'up'; if (kind === 'service') job.desiredUp = true; delete run.endedAt; run.hubMain = true; run.hubMainAt = 1;   // proven and kept by an older boot
  const ctl = j1._ctlDir(job, run.startedAt); fs.mkdirSync(ctl, { recursive: true });
  fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: dead, starttime: 1, bootId: PI.bootIdOf() })); try { fs.unlinkSync(path.join(ctl, 'exit.json')); } catch { }
  j1._dirty = true; const lock = j1.lockFile; j1.shutdown(); await until(() => !fs.existsSync(lock), 5000);
  const logs = [], seen = { reaped: 0, replayed: 0, spawned: 0 }, told = [];
  const j2 = new JMx({ ...deps, log: (...a) => logs.push(a.join(' ')) });
  j2._notifyOwner = (j, o) => { told.push((o && o.what) || ''); };   // what the owner is told (r1610: a hub-main task)
  j2._reapScope = async () => { seen.reaped++; return true; }; j2._startAfter = () => { seen.replayed++; }; j2._spawn = () => { seen.spawned++; };
  j2.init(); for (const t of j2._timers || []) clearInterval(t); j2._timers = [];
  const k = j2.jobs.get(id), snap = k ? j2.snapshot(k) : null;
  const out = { ...seen, state: k && k.state, desiredUp: k && k.desiredUp, cardDown: !!(snap && snap.hubMainDown), said: j2.events.filter((e) => e.jobId === id).map((e) => e.what).join(' | '), told: told.join(' | ') };
  try { j2.shutdown(); } catch { }
  return out;
}
/** (6) A LAUNCHER BESIDE THE MAIN (`nohup ./run.sh &` as a task): the main starts a launcher in the background (the job's group), the
 *  launcher starts the hub (its pid in <data>/server.pid, a helper of its own) and lives on; the main ends once the hub has written its
 *  file — the task's end drains its group */
async function besideScene(wrapperText, tag) {
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), wrapperText);
  const spf = path.join(dd, 'server.pid'), pids = path.join(dd, 'pids.json'), go = path.join(dd, 'go');
  const hubJs = path.join(dd, 'hub.js'), launchJs = path.join(dd, 'launch.js'), mainJs = path.join(dd, 'main.js');
  fs.writeFileSync(hubJs, `const fs = require('fs'); const k = require('child_process').spawn('sleep', ['300'], { stdio: 'ignore' }); fs.writeFileSync(${JSON.stringify(pids)}, JSON.stringify({ hub: process.pid, helper: k.pid, launcher: process.ppid })); fs.writeFileSync(${JSON.stringify(spf)}, String(process.pid)); setInterval(() => { }, 1e9);\n`);
  fs.writeFileSync(launchJs, `require('child_process').spawn(process.execPath, [${JSON.stringify(hubJs)}], { stdio: 'ignore' }); setInterval(() => { }, 1e9);\n`);
  fs.writeFileSync(mainJs, `const fs = require('fs'); require('child_process').spawn(process.execPath, [${JSON.stringify(launchJs)}], { stdio: 'ignore' }).unref(); const t = setInterval(() => { if (fs.existsSync(${JSON.stringify(go)})) { clearInterval(t); process.exit(0); } }, 50);\n`);
  const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
  const jm = new JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
  jm.init();
  const r = jm.create({ kind: 'task', name: 'hub-beside', cmd: { argv: [process.execPath, mainJs], cwd: dd }, owner: OWNER }, CALLER);
  const job = jm.jobs.get(r.job.id);
  // the identities FIRST (the hub wrote its file, its launcher and helper run), then the main may end
  await until(() => { try { return Number(JSON.parse(fs.readFileSync(pids, 'utf8')).hub) > 1 && fs.readFileSync(spf, 'utf8').trim() !== ''; } catch { return false; } }, 10000);
  let ids = {}; try { const p = JSON.parse(fs.readFileSync(pids, 'utf8')); ids = { hub: PI.identityOf(p.hub), helper: PI.identityOf(p.helper), launcher: PI.identityOf(p.launcher) }; } catch { }
  for (const v of Object.values(ids)) if (v) mine.push(v);
  fs.writeFileSync(go, '1');
  await until(async () => { await jm._sweep(); return ['interrupted', 'failed', 'done'].includes(job.state); }, 20000);
  try { jm.shutdown(); } catch { }
  return { state: job.state, ids };
}
{
  const ACC = '  _hubMainOf(run, exit) { return !!((exit && exit.hubMain === true) || (run && run.hubMain === true)); }';
  const JE = MJ.load('src/jobs.js', anchored(JSRC, ACC, '  _hubMainOf(run, exit) { return !!(exit && exit.hubMain === true); }   /* MUTANT: the exit record alone */', 'b2c5c-r1263-accessor'), 'b2c5c-r1263-accessor');
  const ABOVE = '  const hub = Number(all.hub) || 0, above = hub > 1 && keep.has(hub) ? hubChain(hub, { stop: process.pid }).pids : new Set();\n';
  const WX = anchored(WRAP, ABOVE, '  const hub = 0, above = new Set();   /* MUTANT: the release — the main itself only */\n', 'b2c5c-r1263-chain-cut');
  const [boot, bootX, lau, lauX, bes, besX] = await Promise.all([
    nextBootScene(require(path.join(ROOT, 'src/jobs.js')).JobManager, 'next-boot'), nextBootScene(JE.JobManager, 'next-boot-mut'),
    hubEndScene(WRAP, 'launch-end', 15000, { launcher: true }), hubEndScene(WX, 'launch-end-mut', 1500, { launcher: true }),
    besideScene(WRAP, 'beside'), besideScene(WX, 'beside-mut'),
  ]);
  ok(boot.reaped === 0 && boot.replayed === 0 && boot.spawned === 0 && boot.state === 'down' && boot.desiredUp === false && boot.cardDown === true
    && /its main process was the VibeSpace hub — not restarted by itself: a restart would start a second hub beside the one that runs/.test(boot.said),
    'MUST 1 — THE NEXT HUB\'S BOOT reads the KEPT fact: a service run whose main was the hub (its wrapper killed: no exit record, a dead stamp) is NOT reaped (the dead hub\'s conversations live) and NOT replayed (no second hub); not wanted up, said — on its journal AND its card', boot);
  ok(bootX.reaped >= 1 && bootX.replayed >= 1, 'CONTROL (the accessor reading the exit record alone, in a copy): the boot reaps the scope and replays the service — a second hub — RED', bootX);
  // r1610 should 1: a TASK whose main was the hub, met at the next boot, is said to have ended WITH the hub — never «the machine
  // restarted», never invited to start again (a start would run a second hub); r1610: a hub-main service that ended on MEMORY keeps the
  // memory words, on both roads
  const TASKROAD = "    if (this._hubMainOf(run, null)) { if (job.kind === 'service') this._hubMainDown(job, v.cause === 'oom' && ends ? M.memoryEndWhat(run) : null); else this._hubMainTaskEnd(job); return; }";
  const JT = MJ.load('src/jobs.js', anchored(JSRC, TASKROAD, "    if (job.kind === 'service' && this._hubMainOf(run, null)) { this._hubMainDown(job); return; }   /* MUTANT: the service alone, as before */", 'b2c5c-r1610-task'), 'b2c5c-r1610-task');
  const [tk, tkX] = await Promise.all([nextBootScene(require(path.join(ROOT, 'src/jobs.js')).JobManager, 'next-boot-task', 'task'), nextBootScene(JT.JobManager, 'next-boot-task-mut', 'task')]);
  const HUBTASK = /interrupted: it ended with the VibeSpace hub that was its main process — not to be started again: a start would run a second VibeSpace/;
  ok(tk.state === 'interrupted' && tk.replayed === 0 && tk.spawned === 0 && tk.reaped === 0 && HUBTASK.test(tk.said) && HUBTASK.test(tk.told) && !/start it again if it still matters|the machine restarted/.test(tk.said + tk.told),
    'r1610 — A TASK WHOSE MAIN WAS THE HUB, met at the next hub\'s boot: interrupted WITH the hub, said so on its journal and to its owner, never «the machine restarted — start it again» (a start would run a second hub); nothing reaped, nothing run', tk);
  ok(/start it again if it still matters/.test(tkX.told), 'CONTROL (the service alone, as before, in a copy): the task is said ended by the machine and its owner invited to start it again — RED', tkX);
  const memScene = (JMx, tag, road) => {
    const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), STANDIN4);
    const jm = new JMx({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
    jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
    const r = jm.create({ kind: 'service', name: 'hub-mem', cmd: { argv: ['sleep', '300'] }, owner: OWNER }, CALLER);
    const job = jm.jobs.get(r.job.id), run = job.runs[job.runs.length - 1]; run.hubMain = true;
    if (road === 'boot') jm._bootNoExit(job, run, { cause: 'oom', at: Date.now(), jobAnonMb: 100, anonMb: 200, limitMb: 300 });
    else jm._finalizeRun(job, run, { code: 137, endedAt: Date.now(), memory: { cause: 'oom-bound', by: 'cgroup', mb: 512 } }, 'exit');
    const what = jm.events.filter((e) => e.jobId === job.id).map((e) => e.what).filter(Boolean).pop() || '';
    const out = { state: job.state, desiredUp: job.desiredUp, mem: M.memoryEndWhat(run), what };
    try { jm.shutdown(); } catch { }
    return out;
  };
  const MEMW = "    this._touch(job, { what: `${memWhat ? memWhat + ' — ' : ''}its main process was the VibeSpace hub";
  const JMm = MJ.load('src/jobs.js', anchored(JSRC, MEMW, "    this._touch(job, { what: `its main process was the VibeSpace hub", 'b2c5c-r1610-mem'), 'b2c5c-r1610-mem');
  const JR = require(path.join(ROOT, 'src/jobs.js')).JobManager;
  const mb = memScene(JR, 'mem-boot', 'boot'), mf = memScene(JR, 'mem-end', 'end'), mx = memScene(JMm.JobManager, 'mem-mut', 'boot');
  ok([mb, mf].every((m) => m.desiredUp === false && !!m.mem && m.what.startsWith(m.mem + ' — its main process was the VibeSpace hub — not restarted by itself')),
    'r1610 — a hub-main SERVICE that ended on MEMORY keeps the memory words, on both roads (the next boot\'s judge, the end\'s finalize), and is not restarted by itself', { mb, mf });
  ok(!!mx.mem && !mx.what.includes(mx.mem), 'CONTROL (the memory words dropped, in a copy): the memory end is said only as «its main process was the VibeSpace hub» — RED', mx);
  ok(lau.kid > 1 && lau.log.includes(LATCH_LINE) && lau.alive === true && !!lau.exit && lau.exit.hubMain === true,
    'MUST 2 — A LAUNCHER MAIN (it started the hub as its child, and ends when the hub ends): the wrapper latches it (the hub\'s own chain reaches the job through it — the engine\'s test), so its end stops nothing the hub started; exit.json says `hubMain`', { kid: lau.kid, alive: lau.alive, exit: lau.exit && lau.exit.hubMain, state: lau.state });
  ok(lauX.kid > 1 && lauX.alive === false && !(lauX.exit && lauX.exit.hubMain), 'CONTROL (the release\'s recogniser — the main itself only — in a copy of the wrapper): the launcher is never latched and its end SIGTERMs the hub\'s child — RED', { alive: lauX.alive });
  // (6): read the RED first — its launcher's death proves the drain's signal had landed; the real run's drain ran the same way before it
  await until(() => !!besX.ids.launcher && PI.aliveIdentity(besX.ids.launcher) !== true, 5000);
  const live = (id) => !!id && PI.aliveIdentity(id) === true;
  ok(bes.state === 'done' && !!bes.ids.launcher && live(bes.ids.launcher) && live(bes.ids.hub) && live(bes.ids.helper),
    '(6) — A LAUNCHER BESIDE THE MAIN (`nohup ./run.sh &` as a task): its end drains its group, and the hub\'s own supervisor (on the hub\'s chain), the hub and its helper live on — the same recogniser at the group walk', { state: bes.state, launcher: live(bes.ids.launcher), hub: live(bes.ids.hub), helper: live(bes.ids.helper) });
  ok(besX.state === 'done' && !!besX.ids.launcher && !live(besX.ids.launcher) && live(besX.ids.hub), 'CONTROL (the chain cut, in a copy of the wrapper): the group drain ends the hub\'s launcher (the hub left with no supervisor) — RED', { launcher: live(besX.ids.launcher), hub: live(besX.ids.hub) });
}
{
  // (b) THE ONE RECOGNISER, over ONE table of process shapes (a stand-in /proc): the ENGINE's main door and hub test (compiled from its
  // source, the hub = `process`) and the WRAPPER's keep test (compiled from its source, the wrapper = `process`) answer the same for
  // every process under the run's wrapper — «is the main the hub's?» and «is it kept?»
  const FAKE = path.join(D, 'fake-proc'); fs.mkdirSync(FAKE, { recursive: true });
  const stat = (pid, comm, ppid, start) => { fs.mkdirSync(path.join(FAKE, String(pid)), { recursive: true }); fs.writeFileSync(path.join(FAKE, String(pid), 'stat'), `${pid} (${comm}) S ${ppid} ${pid} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 ${start}`); };
  const PIF = { hubChain: (h, o = {}) => PI.hubChain(h, { ...o, procRoot: FAKE }), keptByChain: (p, k, o = {}) => PI.keptByChain(p, k, { ...o, procRoot: FAKE }) };
  const engineOf = (src, hub, wrapper) => {
    const methods = ['  _hubIsMain(job, run) {', '  _hubsOwn(pid, wrapper = 0) {', '  _hubTest(wrapper = 0) {', '  _hubAncestors() {'].map((h) => fnOf4(src, h)).join(',\n');
    const self = new Function('PI', 'process', 'bootId', `return {\n${methods}\n};`)(PIF, { pid: hub.pid, ppid: hub.ppid }, () => 'b');   // eslint-disable-line no-new-func
    Object.assign(self, { d: {}, _bootAt: 7, _readStamp: () => ({ pid: wrapper.pid, starttime: wrapper.start, bootId: 'b' }), _verifyAlive: () => true, _wrappersHeld: () => [] });
    return { main: () => self._hubIsMain({}, { startedAt: 1 }), kept: (p) => self._hubTest(wrapper.pid)(p) };
  };
  const wrapperOf = (src, hub, wrapper) => {
    const kt = new Function('keptOutHere', 'hubShaped', 'nodeOrUnknown', 'keptByChain', 'hubChain', 'process', `${fnOf4(src, 'function keptTest() {')}\nreturn keptTest;`)(() => Object.assign([[hub.pid, 0]], { hub: hub.pid }), () => false, () => true, PIF.keptByChain, PIF.hubChain, { pid: wrapper.pid });   // eslint-disable-line no-new-func
    return { main: (m) => kt()(m), kept: (p) => kt()(p) };
  };
  stat(10, 'node', 1, 100);   // the hub outside every job (an ordinary job's)
  const SHAPES = [
    { name: 'the main IS the hub', w: [200, 10, 2000], procs: [[201, 'node', 200, 2001], [202, 'sleep', 201, 2002]], hub: 201, main: 201, want: { main: true, kept: { 201: true, 202: true } } },
    { name: 'a launcher main (a start script)', w: [300, 10, 3000], procs: [[301, 'sh', 300, 3001], [302, 'node', 301, 3002], [303, 'sleep', 302, 3003], [304, 'tee', 301, 3004]], hub: 302, main: 301, want: { main: true, kept: { 301: true, 302: true, 303: true, 304: false } } },
    { name: 'two launchers (the package\'s start: npm → sh → node)', w: [400, 10, 4000], procs: [[401, 'npm', 400, 4001], [402, 'sh', 401, 4002], [403, 'node', 402, 4003], [404, 'sleep', 403, 4004]], hub: 403, main: 401, want: { main: true, kept: { 401: true, 402: true, 403: true, 404: true } } },
    { name: 'an ordinary job (the hub outside it)', w: [500, 10, 5000], procs: [[501, 'sh', 500, 5001], [502, 'make', 501, 5002]], hub: 10, main: 501, want: { main: false, kept: { 501: false, 502: false } } },
    { name: 'a launcher beside the main, re-parented (nohup ./run.sh &)', w: [600, 10, 6000], procs: [[602, 'sh', 1, 6002], [603, 'node', 602, 6003], [604, 'sleep', 603, 6004]], hub: 603, main: 601, want: { main: false, kept: { 602: true, 603: true, 604: true } } },
    { name: 'a link that cannot be read', w: [700, 10, 7000], procs: [[702, 'node', 701, 7002]], hub: 702, main: 701, want: { main: false, kept: { 702: true } } },
  ];
  for (const sh of SHAPES) { stat(sh.w[0], 'node', sh.w[1], sh.w[2]); for (const [p, c, pp, st] of sh.procs) stat(p, c, pp, st); }
  const judge = (wsrc) => SHAPES.map((sh) => {
    const hub = { pid: sh.hub, ppid: (sh.procs.find((x) => x[0] === sh.hub) || [0, '', 1])[2] }, wrapper = { pid: sh.w[0], start: sh.w[2] };
    const e = engineOf(JSRC, hub, wrapper), w = wrapperOf(wsrc, hub, wrapper);
    const kept = Object.keys(sh.want.kept).map(Number);
    return { name: sh.name, engine: { main: e.main(), kept: Object.fromEntries(kept.map((p) => [p, e.kept(p)])) }, wrapper: { main: w.main(sh.main), kept: Object.fromEntries(kept.map((p) => [p, w.kept(p)])) }, want: sh.want };
  });
  const rows = judge(WRAP), rowsX = judge(anchored(WRAP, '  const hub = Number(all.hub) || 0, above = hub > 1 && keep.has(hub) ? hubChain(hub, { stop: process.pid }).pids : new Set();\n', '  const hub = 0, above = new Set();   /* MUTANT: the release */\n', 'b2c5c-r1263-table-cut'));
  const same = (r) => JSON.stringify(r.engine) === JSON.stringify(r.wrapper) && JSON.stringify(r.engine) === JSON.stringify(r.want);
  ok(rows.every(same), `THE ONE RECOGNISER: over ${SHAPES.length} process shapes the engine's main door and hub test and the wrapper's keep test answer the same, and as the law says (the hub, or a launcher on the hub's own chain)`, rows.filter((r) => !same(r)));
  ok(rowsX.filter((r) => !same(r)).map((r) => r.name).join(' · ') === 'a launcher main (a start script) · two launchers (the package\'s start: npm → sh → node) · a launcher beside the main, re-parented (nohup ./run.sh &)',
    'CONTROL (the wrapper\'s release recogniser — the main itself only — in a copy): it disagrees with the engine on every launcher shape — RED', rowsX.filter((r) => !same(r)).map((r) => r.name));
  ok(/^function hubChain\(hub, \{ procRoot = '\/proc', maxHops = 64, stop = 0, stopStart = 0 \} = \{\}\) \{$/m.test(WRAP) && /PI\.hubChain\(process\.pid, \{ stop: Number\(st\.pid\), stopStart: Number\(st\.starttime\) \|\| -1 \}\)\.reached/.test(JSRC)
    && /_hubAncestors\(\) \{ const out = PI\.hubChain\(process\.pid\)\.pids;/.test(JSRC) && /for \(const q of hubChain\(Number\(root\)\)\.pids\)/.test(WRAP),
    'WIRING: ONE function (hubChain, the shipped twin test-stop-tree pins byte for byte), its callers — the engine\'s main door and hub ancestors (the escapee scan), the wrapper\'s keep test (its group, scope and tree walks, and the latch) and its escapee scan');
}
{
  // SMALLS: the refused stop's words are TRUE (a main that still runs is never said «ended»); the card's two sentences, zh and ja
  const sayOf = (src, live) => { const out = []; const f = new Function('mainLive', 'fs', 'logOpen', 'sayOwn', `let hubLeftSaid = 0; ${fnOf4(src, 'const sayHubLeft = (sig) => {')}\nreturn sayHubLeft;`)(() => live, { writeSync: (fd, b) => out.push(String(b)) }, () => 9, (t) => out.push(String(t)));   /* r3732: + sayOwn */ f('SIGTERM'); return out.join(''); };   // eslint-disable-line no-new-func
  const runs = sayOf(WRAP, true), ended = sayOf(WRAP, false), runsX = sayOf(anchored(WRAP, '  const what = mainLive() ? ', '  const what = false ? ', 'b2c5c-r1263-words-cut'), true);
  ok(/refused — its main process was the VibeSpace hub \(or what started it\) and still runs, though it is no longer recognised as the hub:/.test(runs) && !/server\.pid changed/.test(runs) && !/has ended/.test(runs) && /and has ended: what is left is the hub's/.test(ended),   // stale-pins: kept — a NEGATIVE pin: the words must never name that cause again
    'the words of a stop refused after the latch: a main that still runs (no longer recognised) is said to run, never «ended»; an ended one is said ended', { runs, ended });
  ok(/has ended/.test(runsX), 'CONTROL (one sentence, in a copy): a main that still runs is said «ended» — RED', runsX);
  const PANEL = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8'), LAYOUT = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-layout.js'), 'utf8') /* r4564: the card's (4c) note is jobs-layout hubBoundNote, by rung */, ZH = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
  const K1 = 'Not restarted by itself: its main process was VibeSpace itself, and a restart would start a second one. Start it again if you mean to.';
  const K2 = 'This job runs VibeSpace itself: when VibeSpace and its conversations pass this memory bound, they all end together.';
  const K1s = 'Not restarted: it ran VibeSpace itself.', K2s = 'Runs VibeSpace: its memory bound ends it whole.';   // r1610: the compact rail's short forms
  ok(PANEL.includes(`j.hubMainDown && j.state === 'down' && !j.desiredUp ? (compact ? t('${K1s}') : t('${K1}'))`) && PANEL.includes(`j.runsHub && /^\\d/.test(memoryChip(j, t) || '') ? hubBoundNote(j, t, compact)`) && LAYOUT.includes(`t('${K2s}')`) && LAYOUT.includes(`t('${K2}')`)
    && [K1, K2, K1s, K2s].every((k) => ZH.includes(JSON.stringify(k) + ':') && JA.includes(JSON.stringify(k) + ':'))
    && /hubMainDown: !!job\.hubMainDown, runsHub: !!\(run && !run\.endedAt && this\._hubMainOf\(run, null\)\)/.test(JSRC) && JSRC.includes('    delete job.hubMainDown;   // B-2c5c r1263: the person\'s Start') && JSRC.includes('    if (p.was.hubMainDown) job.hubMainDown = p.was.hubMainDown;') && JSRC.includes('...(job.hubMainDown ? { hubMainDown: job.hubMainDown } : {}) };'),
    'WIRING: the card says it — a service not restarted by itself (until the person\'s Start), and (4c) VibeSpace running under this job\'s memory bound ends WITH its conversations — the snapshot\'s two facts, both sentences in zh and ja; the Start clears the card\'s fact and a REFUSED start puts it back (B-b14a\'s law: a refused start leaves the record as it was)');
}

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'B-2c5c ' })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
