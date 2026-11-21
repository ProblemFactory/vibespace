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
async function hubEndScene(wrapperText, tag, capMs) {
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
  const r = jm.create({ kind: 'task', name: 'hub-as-job', cmd: { argv: [process.execPath, '-e', hub] }, owner }, caller);
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
  const self = (exit) => ({ _runDoubt: () => '', _runScope: () => ({ dir: '/nonexistent/scope', unit: 'vs-job-x.scope' }), _reapLater: new Map(), _readExit: () => exit });
  const run = { endedAt: 1 };
  ok(JM.prototype._pending.call(self({ code: 0, hubMain: true }), {}, run) === false && JM.prototype._pending.call(self({ code: 0 }), {}, run) === true,
    'the engine\'s wait before a next start: a hub-main run\'s scope is nothing to wait for (an ordinary run\'s unmeasured scope is)');
  const logs = [];
  const reapSelf = { ...self({ code: 0, hubMain: true }), d: { log: (l) => logs.push(l) }, _wrapperUnproven: () => { throw new Error('reached the kill road'); } };
  const reaped = await JM.prototype._reapOnce.call(reapSelf, { id: 'jb-hm' }, { endedAt: 1 });
  ok(reaped === true && logs.some((l) => /its main process was the VibeSpace hub — what is left in its scope is the hub's: not reaped/.test(l)), 'the reap itself refuses a hub-main run\'s scope (said in the journal), whatever road asked', { reaped, logs });
  const BOOT = "        if (!(exit && (exit.scopeEmpty === true || exit.hubMain === true || (exit.left && exit.left.kept)))) this._reapScope(job, run).catch(() => { });";
  const SWEEP = "        if (!(exit.scopeEmpty === true || exit.hubMain === true || (exit.left && exit.left.kept))) this._reapScope(job, run).catch(() => { });";
  ok(JSRC.includes(BOOT) && JSRC.includes(SWEEP), 'WIRING: the boot\'s adopt and the sweep\'s judged end never start a reap of a hub-main run\'s scope');
  const PEND = "    return !(exit && (exit.scopeEmpty === true || exit.hubMain === true));";
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

for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'B-2c5c ' })) ok(r.pass === true, r.name + (r.pass ? '' : ' — ' + r.detail));
report();
