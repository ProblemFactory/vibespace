#!/usr/bin/env node
// test-job-start-starter — B-91aa's REMAINDER (lane bl-jobs, 主开发 r4525 / r4591): A JOB'S START NO LONGER FORKS THE HUB'S MAIN
// PROCESS. Every child the hub starts is a fork of a 4.5–5 GB process whose main thread waits until the child execs; the first unit
// moved the timer sites to THE STARTER (src/server/child-starter.js + child-starter-proc.js). A job's wrapper is now one of its
// DETACHED starts (its own session; no log — the wrapper writes its own; its env the wrapper's builder with the job's mark admitted
// by name). A VAULT job alone keeps the hub's own start (its values ride the hub's pipe on fd 3 — r4591 (A)), COUNTED.
//   ① THE COUNT: a task, a service and a lowered task each start 0 programs from the main process (the starter answers each; the
//      answered pid IS the wrapper's own stamp's); RED the release's road (the starter line cut) ⇒ one main-process start each
//   ② A JOB STARTED THROUGH THE STARTER SURVIVES THE STARTER'S END (its pipe closed: it ends by itself) AND A HUB RESTART (a second
//      engine over the same folder adopts it by its stamp); RED a starter that holds its detached child ⇒ the wrapper dies with it
//   ③ THE KILL LAW: a stop signals the job's own pid BY ITS STAMP — never the pid an answer named (placed: a decoy of ours under that
//      pid); RED a stop that signals the answered pid ⇒ the decoy dies
//   ④ A START THE STARTER CANNOT DO IS A FAILED START, SAID — never a guess, never a silent «starting»: a placed start error, a placed
//      silence («may have started», looked at late) and no starter at all («was not started», no wait) each fail the run in words true
//      to the case («spawn failed: …» to the presser), the spec file gone; RED the failure's road cut ⇒ the job stays «starting»
//   ⑤ A LATE WRAPPER (its stamp appears after its start was failed — placed) is STOPPED BY ITS OWN STAMP, said; RED the late look cut
//   ⑥ THE BOUNDED LOOK (r4591 (3)): a wrapper that wrote NO pid record within the look's bound (placed: a wrapper that exits at once)
//      is a FAILED START, said; RED the release's gap (the look cut) ⇒ the run stays «up» with no process
//   ⑦ ONLY A VAULT JOB takes the hub's own road: its start is ONE main-process start and the starter's `directJobs` counts it (the
//      hourly line's vault-direct-starts); a job without values counts nothing there
//   ⑧ THE MARK: the wrapper the starter started carries VIBESPACE_JOB_ID=<its id> in its own env, and no secret of the hub's env;
//      RED a starter without the job's mark ⇒ the mark gone (the hub's walks would never find the job's processes)
//   ⑨ A BOOT OVER A START NEVER ANSWERED (r4683 (d)): the next hub's boot removes that run's spec before it judges the run (off the
//      loop) and looks at it late; RED the boot's step cut ⇒ the spec stays readable, nothing looks
// FAST, in-process: the real engine, the real wrapper over scratch data folders, the real starter (small node children); every
// process is this suite's own child, ended at exit by identity.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(20); } return !!(await fn()); };
const D = scratch('job-start-starter'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
const mine = [];   // every identity this suite made (a wrapper: its group) — ended at exit, by identity
const endMine = () => { for (const m of mine) { try { PI.signalIdentity(m, 'SIGKILL', { group: !!m.group }); } catch { } } };
process.on('exit', () => { endMine(); try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { endMine(); process.exit(1); });
// a secret-shaped name in the hub's env, built at runtime (never a literal in the tree)
const SEC_NAME = ['VS', 'J91AA', 'TO' + 'KEN'].join('_'), SEC_VAL = ['s', 'ek', 'ret'].join('') + '-' + process.pid;
process.env[SEC_NAME] = SEC_VAL;
// THE COUNTER (test-hub-program-starts' own): every async child start of THIS process goes through ChildProcess.prototype.spawn; the
// synchronous forms too — patched BEFORE the engine is required (its bindings are taken at its load)
const CP = require('child_process');
let starts = 0;
const realSpawn = CP.ChildProcess.prototype.spawn;
CP.ChildProcess.prototype.spawn = function (...a) { starts++; return realSpawn.apply(this, a); };
for (const k of ['spawnSync', 'execFileSync', 'execSync']) { const real = CP[k]; CP[k] = function (...a) { starts++; return real.apply(this, a); }; }
const counting = async (fn) => { const s0 = starts; const r = await fn(); return { n: starts - s0, r }; };

const CS = require(path.join(ROOT, 'src/server/child-starter.js'));
const JM = require(path.join(ROOT, 'src/jobs.js'));
const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
const CSRC = fs.readFileSync(path.join(ROOT, 'src/server/child-starter.js'), 'utf8');
const PSRC = fs.readFileSync(path.join(ROOT, 'src/server/child-starter-proc.js'), 'utf8');
const WRAP = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8');
const MJ = mutantCopies('job-start-starter', ROOT);
const OWNER = { conversation: { backend: 'claude', id: 'conv-jss' }, sessionId: 'sess-jss', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const CALLER = { conversationId: 'conv-jss', sessionId: 'sess-jss', sessionCreatedAt: 1, groups: new Set() };
const LOGS = [];
const folder = (tag, wrapperText = WRAP) => { const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), wrapperText); return dd; };
const depsOf = (dd, extra = {}) => ({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => LOGS.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [], ...extra });
const engines = [];
const engine = (Mod, dd, extra) => { const jm = new Mod.JobManager(depsOf(dd, extra)); jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = []; engines.push(jm); return jm; };
const lastRun = (job) => job && job.runs && job.runs[job.runs.length - 1];
/** a job made and started, its press answered as a route answers it (startAnswer since the press) */
async function made(jm, spec) {
  const t0 = Date.now();
  const r = jm.create({ ...spec, owner: OWNER }, CALLER);
  const job = r && r.job ? jm.jobs.get(r.job.id) : null;
  const a = await jm.startAnswer(job, t0);
  return { r, job, a };
}
/** its wrapper's own stamp, alive — then the wrapper (its group) is this suite's to end */
async function stampOf(jm, job, ms = 8000) {
  let st = null;
  await until(() => { st = jm._readStamp(job); return !!st && jm._verifyAlive(st); }, ms);
  if (st && jm._verifyAlive(st)) mine.push({ ...PI.identityOf(Number(st.pid)), group: true });
  return st && jm._verifyAlive(st) ? st : null;
}
const NICE = String(spawnSync('sh', ['-c', 'command -v nice']).stdout || '').trim();

const S = CS.createChildStarter(); CS.setChildStarter(S);
await S.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start (one, made once) — before any window

// ════════ ① THE COUNT ════════
console.log('① a job\'s start starts no program from the main process — the starter does');
{
  let lower = false;
  const pri = { spawnPriority: () => ({ priority: lower && NICE ? { nice: NICE, by: 5 } : null }) };
  const scene = async (Mod, tag) => {
    const jm = engine(Mod, folder('count-' + tag), pri), out = [];
    for (const [kind, low] of [['task', false], ['service', false], ['task', true]]) {
      lower = low;
      const q0 = S.stats().requests;
      const { n, r } = await counting(() => made(jm, { kind, name: `cnt-${kind}${low ? '-low' : ''}`, cmd: { argv: ['sleep', '30'] } }));
      const st = r.job ? await stampOf(jm, r.job) : null, run = lastRun(r.job);
      out.push({ kind, low, n, asked: S.stats().requests - q0, answer: r.a, state: r.job && r.job.state, ask: run && run.ask, startPid: run && run.startPid, stampPid: st && Number(st.pid), same: !!(st && run && run.startPid === Number(st.pid) && (run.startStarttime === undefined || run.startStarttime === Number(st.starttime))) });
    }
    lower = false;
    return out;
  };
  const now = await scene(JM, 'now');
  ok(now.length === 3 && now.every((x) => x.n === 0 && x.asked === 1 && x.answer && x.answer.ok === true && x.state === 'up' && x.ask === 'started' && x.same),
    `① a task, a service and a lowered task (${NICE ? 'nice -n 5' : 'no nice on this machine: unlowered'}): ${now.map((x) => x.n).join(' / ')} programs started from the main process, ${now.map((x) => x.asked).join(' / ')} asked of the starter — each answered with its wrapper's pid, the SAME pid and birth as the wrapper's own stamp`, now);
  const ASK = "      if (!vj) { this._askStart(job, argv, specPath, trigger); return; }";
  const Rel = MJ.load('src/jobs.js', anchored(JSRC, ASK + "   // B-91aa's remainder: THE STARTER starts it (below) — a VAULT job alone keeps this road (its values ride fd 3: r4591 (A))\n", '', 'the starter road cut'), 'release-road');
  const red = await scene(Rel, 'red');
  ok(red.length === 3 && red.every((x) => x.n === 1 && x.asked === 0), `RED (the release's road: the starter line cut): ${red.map((x) => x.n).join(' / ')} main-process starts — one a job start`, red);
}

// ════════ ② IT SURVIVES THE STARTER'S END AND A HUB RESTART ════════
console.log('② a job started through the starter outlives the starter and a hub restart');
{
  const scene = async (starter, tag) => {
    CS.setChildStarter(starter);
    await starter.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });
    const dd = folder('survive-' + tag), jm = engine(JM, dd);
    const { job } = await made(jm, { kind: 'task', name: 'outlive-' + tag, cmd: { argv: ['sleep', '30'] } });   // a task: a boot never replays it (nothing restarted beside the leg)
    const st = await stampOf(jm, job);
    const sp = starter._proc(); starter.closePipe();
    const ended = await until(() => sp.exitCode !== null || sp.signalCode !== null, 5000);
    await sleep(100);
    const outlived = !!st && PI.aliveIdentity(st) === true;
    jm.shutdown(); await until(() => !fs.existsSync(jm.lockFile), 5000);
    const j2 = engine(JM, dd), job2 = j2.jobs.get(job.id), st2 = job2 && j2._readStamp(job2);
    const adopted = !!job2 && job2.state === 'up' && !!st2 && j2._verifyAlive(st2) && Number(st2.pid) === Number(st && st.pid);
    j2.shutdown();
    return { ended, endCode: sp.exitCode, endSignal: sp.signalCode, outlived, adopted };
  };
  const good = await scene(CS.createChildStarter(), 'now');
  ok(good.ended && good.endCode === 0 && !good.endSignal && good.outlived && good.adopted, '② the starter\'s pipe closed: it ends by itself (code 0, no signal) — the job\'s wrapper runs on, and a second engine over the same folder (a hub restart) adopts it by its own stamp', good);
  const HELD = "  c.on('error', (e) => { if (said) return; said = true; no(e); });\n";
  const heldScript = MJ.write('src/server/child-starter-proc.js', anchored(PSRC, HELD, "  held.set(id, c);   /* MUTANT: a detached child HELD */\n" + HELD, 'red-detach-held'), 'held');
  const red = await scene(CS.createChildStarter({ script: heldScript }), 'red');
  ok(red.ended && !red.outlived && !red.adopted, 'RED (a starter that holds its detached child): the starter\'s end kills the job\'s wrapper', red);
  CS.setChildStarter(S);
}

// ════════ ③ THE KILL LAW ════════
console.log('③ a stop signals the job\'s own pid by its stamp — never the pid an answer named');
{
  const scene = async (Mod, tag) => {
    const jm = engine(Mod, folder('kill-' + tag));
    const { job } = await made(jm, { kind: 'service', name: 'kill-' + tag, cmd: { argv: ['sleep', '30'] } });
    const st = await stampOf(jm, job);
    const decoy = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' }); decoy.unref();
    await until(() => !!PI.identityOf(decoy.pid), 2000);
    const did = PI.identityOf(decoy.pid); mine.push({ ...did, group: true });
    job.proc = { pid: decoy.pid }; lastRun(job).startPid = decoy.pid;   // PLACED: an answer that named a pid the job did not start
    jm.stop(job);
    await until(() => !st || PI.aliveIdentity(st) !== true || PI.aliveIdentity(did) !== true, 5000);   // the FACT either way: the wrapper's end or the decoy's
    await sleep(100);
    const out = { wrapperEnded: !st || PI.aliveIdentity(st) !== true, decoyAlive: PI.aliveIdentity(did) === true };
    jm.shutdown();
    return out;
  };
  const good = await scene(JM, 'now');
  ok(good.wrapperEnded && good.decoyAlive, '③ the stop reached the wrapper BY ITS STAMP; the decoy under the answered pid lives', good);
  const KG = "    return PI.signalIdentity(stamp, sig, { group: !inGroup, what: `job ${job.id}` }).ok; // the group, else its leader\n";
  const Bad = MJ.load('src/jobs.js', anchored(JSRC, KG, "    return PI.signalIdentity(PI.identityOf(Number(job.proc && job.proc.pid)) || stamp, sig, { group: !inGroup, what: `job ${job.id}` }).ok;   /* MUTANT: the answered pid */\n", 'red-answered-pid'), 'answered-pid');
  const red = await scene(Bad, 'red');
  ok(!red.decoyAlive, 'RED (a stop that signals the pid the answer named): the decoy — a process the job did not start — is killed', red);
}

// ════════ ④ A START THE STARTER CANNOT DO ════════
console.log('④ a start error or a starter\'s silence is a FAILED START, said in today\'s words');
const fakeStarter = (answer) => ({ run: () => Promise.resolve(answer), stats: () => ({}), noteDirect() { } });
const failScene = async (Mod, tag, answer) => {
  CS.setChildStarter(fakeStarter(answer));
  const jm = engine(Mod, folder('fail-' + tag));
  const { job, a } = await made(jm, { kind: 'task', name: 'fail-' + tag, cmd: { argv: ['sleep', '30'] } });
  const run = lastRun(job), ctl = jm._ctlDir(job, run.startedAt);
  const specsNow = () => { try { return fs.readdirSync(ctl).filter((f) => /^spec\./.test(f)); } catch { return []; } };
  await until(() => !specsNow().length, 3000);   // its removal is OFF the loop: the wait is on the fact
  const specs = specsNow();
  CS.setChildStarter(S);
  return { jm, job, run, a, state: job.state, cause: run.cause, specs, said: LOGS.filter((l) => l.includes(job.id) && /not started \(manual\)/.test(l)) };
};
{
  const err = await failScene(JM, 'err', { started: false, error: 'ENOENT' });
  ok(err.a && err.a.error === 'spawn failed: its wrapper could not be started (ENOENT)' && err.state === 'failed' && err.cause === 'start_failed' && !err.specs.length && err.said.length === 1,
    '④ a placed start error: the presser answered «spawn failed: its wrapper could not be started (ENOENT)», the job failed, its run ended (start_failed), said once, its spec file gone', { a: err.a, state: err.state, cause: err.cause, specs: err.specs, said: err.said });
  err.jm.shutdown();
  const unk = await failScene(JM, 'unknown', { unknown: true });
  ok(unk.a && /^spawn failed: the starter gave no answer within 15 s — its wrapper may have started: if it shows up, it is stopped by its own stamp$/.test(unk.a.error || '') && unk.state === 'failed' && !unk.specs.length && unk.said.length === 1 && unk.jm._lateStarts && unk.jm._lateStarts.size === 1,
    '④ a placed silence (a reply lost after its bound): a failed start whose words say the TRUTH — its wrapper may have started, and if it shows up it is stopped by its own stamp (looked at late); the spec file gone (a wrapper that starts after finds none)', { a: unk.a, state: unk.state, specs: unk.specs });
  // r4683 (a): NO STARTER AT ALL (it could not be started — the request was never sent): no wait was had and nothing started — said so
  const nos = await failScene(JM, 'no-starter', { unknown: true, why: 'no starter' });
  ok(nos.a && nos.a.error === 'spawn failed: the starter could not be started — its wrapper was not started' && nos.state === 'failed' && !nos.specs.length && !(nos.jm._lateStarts && nos.jm._lateStarts.size),
    '④ no starter at all: «the starter could not be started — its wrapper was not started» (no 15 s wait was had; nothing to look at late)', { a: nos.a, state: nos.state });
  nos.jm.shutdown();
  // ⑤ A LATE WRAPPER of that failed start: its own stamp appears in its own run folder (placed: a process of ours, its identity written as
  // the wrapper writes it) — the next sweep stops it BY THAT STAMP, said; RED the late look cut
  console.log('⑤ a wrapper that shows up after its start was failed is stopped by its own stamp');
  const lateScene = async (jm, job, run, boundMs = 3000) => {
    const late = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' }); late.unref();
    await until(() => !!PI.identityOf(late.pid), 2000);
    const id = PI.identityOf(late.pid); mine.push({ ...id, group: true });
    fs.writeFileSync(path.join(jm._ctlDir(job, run.startedAt), 'pid.json'), JSON.stringify({ ...id, startedAt: Date.now() }));
    await jm._sweep();
    const stopped = await until(() => PI.aliveIdentity(id) !== true, boundMs);   // the sweep's signal is sent in its own pass: a short bound on the red copy
    return { stopped, said: LOGS.filter((l) => l.includes(job.id) && /its wrapper started after its start was failed/.test(l)).length };   // the late look's OWN sentence (a lost reply's failure words name the stamp too)
  };
  const lt = await lateScene(unk.jm, unk.job, unk.run);
  ok(lt.stopped && lt.said === 1, '⑤ the late wrapper is stopped by its own stamp, said once', lt);
  unk.jm.shutdown();
  const LATE = "    try { await this._lateSweep(); } catch (e) { this.d.log('[jobs] the late-start look failed:', e.message); }   // B-91aa's remainder\n";
  const NoLate = MJ.load('src/jobs.js', anchored(JSRC, LATE, '', 'red-no-late-look'), 'no-late');
  const unk2 = await failScene(NoLate, 'unknown-red', { unknown: true });
  const lt2 = await lateScene(unk2.jm, unk2.job, unk2.run, 400);
  ok(!lt2.stopped && lt2.said === 0, 'RED (the late look cut): the late wrapper runs on, a job no record holds', lt2);
  unk2.jm.shutdown();
  const FAILED = "    if (live && ['starting', 'up'].includes(job.state)) this._failedStart(job, run, trigger, why);\n";
  const Silent = MJ.load('src/jobs.js', anchored(JSRC, FAILED, '', 'red-silent-starting'), 'silent');
  const sil = await failScene(Silent, 'err-red', { started: false, error: 'ENOENT' });
  ok(sil.state === 'starting' && !sil.said.length, 'RED (the failure\'s road cut): the job stays «starting», nothing said — the silent start r4591 (2) forbids', { state: sil.state });
  sil.jm.shutdown();
}

// ════════ ⑥ THE BOUNDED LOOK ════════
console.log('⑥ a wrapper that wrote no pid record within the look\'s bound is a failed start (the release left it «up»)');
{
  const LOOK = 250;
  const scene = async (Mod, tag) => {
    const jm = engine(Mod, folder('look-' + tag, 'process.exit(0);\n'), { startLookMs: LOOK });   // PLACED: a wrapper that ends before its first act
    const { job, a } = await made(jm, { kind: 'task', name: 'look-' + tag, cmd: { argv: ['sleep', '30'] } });
    const upFirst = job.state === 'up' && !!(a && a.ok);
    await sleep(LOOK + 150);
    await jm._sweep();
    const out = { upFirst, state: job.state, cause: lastRun(job).cause, said: LOGS.filter((l) => l.includes(job.id) && /wrote no pid record within 250 ms/.test(l)).length };
    jm.shutdown();
    return out;
  };
  const good = await scene(JM, 'now');
  ok(good.upFirst && good.state === 'failed' && good.cause === 'start_failed' && good.said === 1, '⑥ started (the starter answered its pid), no pid record within the bound ⇒ a failed start, said once', good);
  const LOOKLINE = "      if (!stamp && run && !run.endedAt && !run._stamped && run.ask && run.ask !== 'asked'";
  const Gap = MJ.load('src/jobs.js', anchored(JSRC, LOOKLINE, "      if (false && !stamp && run && !run.endedAt && !run._stamped && run.ask && run.ask !== 'asked'", 'red-release-gap'), 'release-gap');
  const red = await scene(Gap, 'red');
  ok(red.upFirst && red.state === 'up' && !red.said, 'RED (the release\'s gap: the look cut): the run stays «up» with no process of it', red);
}

// ════════ ⑦ ONLY A VAULT JOB TAKES THE HUB'S OWN ROAD ════════
console.log('⑦ only a vault job is started from the main process — counted');
{
  const door = { gate: () => ({ go: true, plan: [{ name: 'K', fd: 3, env: 'K_FD' }] }), payload: () => ({ ok: true, frame: Buffer.from('a stand-in frame') }), noteUses() { } };
  const jm = engine(JM, folder('vault'), { vaultJob: door });
  const d0 = S.stats().directJobs;
  const { job } = await made(jm, { kind: 'task', name: 'plain', cmd: { argv: ['sleep', '30'] } });
  await stampOf(jm, job);
  const plainDirect = S.stats().directJobs - d0;   // a job without values: nothing on the hub's road
  job.vault = [{ name: 'K', ref: 'vault://k' }];   // the same job, now with values (the gate's door answers them)
  const d1 = S.stats().directJobs;
  const { n } = await counting(async () => { jm._spawn(job, 'manual'); });
  const vaultDirect = S.stats().directJobs - d1;
  const id7 = job.proc && PI.identityOf(Number(job.proc.pid)); if (id7) mine.push({ ...id7, group: true });   // the direct child (its wrapper refuses a stand-in frame and ends): this suite's to end
  ok(plainDirect === 0 && n === 1 && vaultDirect === 1 && lastRun(job).ask === 'direct', `⑦ a job without values: ${plainDirect} on the hub's road; a VAULT job's start: ${n} main-process start, counted ${vaultDirect} in the starter's directJobs (the hourly line's vault-direct-starts)`, { n, plainDirect, vaultDirect, ask: lastRun(job).ask, child: !!id7 });
  jm.shutdown();
}

// ════════ ⑧ THE MARK ════════
console.log('⑧ the wrapper the starter started carries the job\'s mark, and no secret of the hub\'s env');
{
  const scene = async (starter, tag) => {
    CS.setChildStarter(starter);
    const jm = engine(JM, folder('mark-' + tag));
    const { job } = await made(jm, { kind: 'service', name: 'mark-' + tag, cmd: { argv: ['sleep', '30'] } });
    const st = await stampOf(jm, job);
    let env = ''; try { env = fs.readFileSync(`/proc/${st.pid}/environ`, 'utf8'); } catch { }
    const names = env.split('\0').filter(Boolean);
    const out = { mark: names.includes(`VIBESPACE_JOB_ID=${job.id}`), secret: names.some((l) => l.startsWith(SEC_NAME + '=') || l.includes(SEC_VAL)), stamped: !!st };
    jm.shutdown(); CS.setChildStarter(S);
    return out;
  };
  const good = await scene(S, 'now');
  ok(good.stamped && good.mark && !good.secret, '⑧ the wrapper\'s own env carries VIBESPACE_JOB_ID=<its id> (admitted by name on the job road) and no secret of the hub\'s env', good);
  const MARK = "wholeOf(o.env, o.detach && o.detach.job ? JOB_MARKS : !!o.session)";
  const NoMark = MJ.load('src/server/child-starter.js', anchored(CSRC, MARK, 'wholeOf(o.env, !!o.session)', 'red-no-job-mark'), 'no-mark');
  const S8 = NoMark.createChildStarter();
  const red = await scene(S8, 'red');
  try { S8.closePipe(); } catch { }
  ok(red.stamped && !red.mark, 'RED (a starter without the job\'s mark): the wrapper\'s env lacks VIBESPACE_JOB_ID — the hub\'s walks would never find the job\'s processes', red);
}

// ════════ ⑨ A BOOT OVER A START NEVER ANSWERED (r4683 (d)) ════════
console.log('⑨ a hub that ended between a start\'s ask and its answer: the next boot removes its spec before it judges the run, and looks late');
{
  const scene = async (Mod, tag) => {
    CS.setChildStarter({ run: () => new Promise(() => { }), stats: () => ({}), noteDirect() { } });   // PLACED: an ask the hub never hears answered
    const dd = folder('boot-ask-' + tag), j1 = engine(JM, dd);
    const { r } = await (async () => { const r0 = j1.create({ kind: 'task', name: 'boot-ask-' + tag, cmd: { argv: ['sleep', '30'] }, owner: OWNER }, CALLER); return { r: r0 }; })();
    const job = j1.jobs.get(r.job.id), run = lastRun(job), ctl = j1._ctlDir(job, run.startedAt), spec = path.join(ctl, `spec.${run.startedAt}.json`);
    const asked = run.ask === 'asked' && fs.existsSync(spec);
    j1.shutdown(); await until(() => !fs.existsSync(j1.lockFile), 5000);
    CS.setChildStarter(S);
    const j2 = engine(Mod, dd);
    const gone = await until(() => !fs.existsSync(spec), tag === 'red' ? 500 : 3000);
    const looked = !!(j2._lateStarts && j2._lateStarts.has(ctl));
    j2.shutdown();
    return { asked, gone, looked };
  };
  const good = await scene(JM, 'now');
  ok(good.asked && good.gone && good.looked, '⑨ the next boot removes the spec of a start asked and never stamped BEFORE it judges the run (off the loop), and looks at that run late — no wrapper starts from it after the boot\'s read', good);
  const BOOT = "        if (run && run.ask === 'asked' && !stamp && !this.readOnly) {";
  const NoBoot = MJ.load('src/jobs.js', anchored(JSRC, BOOT, "        if (false) {", 'red-boot-keeps-spec'), 'boot-keeps-spec');
  const red = await scene(NoBoot, 'red');
  ok(red.asked && !red.gone && !red.looked, 'RED (the boot\'s step cut): the spec stays readable after the boot and nothing looks late at that run', red);
}

for (const jm of engines) { try { jm.shutdown(); } catch { } }
try { S.closePipe(); } catch { }
report();
