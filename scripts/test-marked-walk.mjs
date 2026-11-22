#!/usr/bin/env node
// test-marked-walk — row B-d8f4 (9), 主开发 r1745 (lane bl-jobs): THE WALK FOR WHAT CARRIES A JOB'S MARK RUNS OFF THE HUB'S MAIN THREAD.
// It reads every process's environment (each read takes that process's memory lock: one in uninterruptible sleep would hold the hub),
// so src/jobs.js — the forced end (_killTree), the service clear's kept walk (_clearKeptOnce), the doubt's stop (_stopDoubt) — hands it
// to src/server/marked-walk.js: ONE child through the starter running proc-identity's membersOf ITSELF, ended at a deadline, handing back
// pids and start times only. Legs, each law with its RED where a copy can bite:
//   §1 no walk on the hub's thread, on all three roads (a counting stub of membersOf in THIS process: 0) — RED: the forced end's old call;
//   §2 the press answers at once: the forced end returns while its walk is still out; the mark's kill lands when the walk answers;
//   §3 an ENDED walk is said (its deadline), nothing from it signalled, the stop goes on — RED: the words cut;
//   §4 the REAL child on a placed /proc answers what membersOf answers on it (the same function), and its one line carries pids and start
//      times only — a planted environment value never in it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : '')); } };
const okP = (c, n, facts) => { ok(c, n, facts); if (c) console.log('    ' + JSON.stringify(facts)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mwalk-'));
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
const MW = require(path.join(ROOT, 'src/server/marked-walk.js'));
const CS = require(path.join(ROOT, 'src/server/child-starter.js'));
const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
const MC = mutantCopies('marked-walk', ROOT);
const realJM = require(path.join(ROOT, 'src/jobs.js'));
const WRAPPER = 4194305, STR = 4194307;
// THE STAND-IN for the starter's run of the walk: its calls recorded; its answer given by the leg (rows, a deadline, or held)
let answer = null; const runs = [];
MW.setRunImpl((cmd, args, o) => { runs.push({ cmd, args: [...args], o }); return typeof answer === 'function' ? answer(args) : Promise.resolve(answer); });
const rowsLine = (rows) => ({ started: true, code: 0, signal: null, stdout: JSON.stringify({ rows, scan: { scanned: 3, total: 3, unreadable: 0, others: 0, cut: false } }) + '\n', stderr: '' });
// the hub's own thread: a COUNTING membersOf (any call here is a walk on the hub's loop) and stubbed signals
let inProcess = 0; const sent = [];
const keep = {}; for (const k of ['treeOf', 'membersOf', 'signalIdentity', 'keptOut', 'pgidOf']) keep[k] = PI[k];
const stubPI = () => { PI.treeOf = () => []; PI.membersOf = () => { inProcess++; return Object.assign([{ pid: STR, starttime: 5, bootId: 'b' }], { scan: { scanned: 1, total: 1, cut: false } }); }; PI.signalIdentity = (id) => { sent.push(id.pid); return { ok: true }; }; PI.keptOut = () => []; PI.pgidOf = () => 0; };
const restorePI = () => Object.assign(PI, keep);
let seq = 0;
const engine = (Mod, tag) => {
  const dd = path.join(T, tag); fs.mkdirSync(dd, { recursive: true });
  const logs = [];
  const jm = new Mod.JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
  jm._hubTest = () => () => false;
  const job = { id: 'jb-9a1c' + String(++seq).padStart(4, '0'), kind: 'task', runs: [{ startedAt: 1700000000000 }] };
  return { jm, job, logs };
};
const forced = async (Mod, tag, ans) => {
  const { jm, job, logs } = engine(Mod, tag);
  answer = ans; sent.length = 0; inProcess = 0; runs.length = 0;
  stubPI();
  try { jm._killTree(job, { pid: WRAPPER, starttime: 1 }, { group: true }); if (typeof jm.markWalksSettled === 'function') await jm.markWalksSettled(); else await sleep(20); }
  finally { restorePI(); }
  try { jm.shutdown(); } catch { }
  return { sent: [...sent], inProcess, runs: runs.map((r) => ({ args: r.args.slice(1).map((a, i) => (i === 0 ? path.basename(String(a)) : a)), env: Object.keys((r.o && r.o.env) || {}), whole: !!(r.o && r.o.wholeEnv), timeoutMs: r.o && r.o.timeoutMs })), said: logs.join(' | ') };
};

try {
  console.log('§1 no walk on the hub\'s thread — the forced end, the doubt\'s stop and the service clear\'s kept walk each go through the starter');
  {
    const f = await forced(realJM, 'forced', rowsLine([[STR, 5]]));
    okP(f.inProcess === 0 && f.runs.length === 1 && f.sent.includes(STR) && /1 process carrying its run's mark outside its group/.test(f.said), 'the FORCED END walks nothing on the hub\'s thread (0 membersOf here): ONE run of the starter, and the stranger it found is ended when it answers', f);
    const r = f.runs[0] || { args: [] };
    okP(/marked-walk-child\.js$/.test(r.args[0] || '') && r.args[1] === 'VIBESPACE_JOB_RUN=jb-9a1c0001:1700000000000' && r.whole && JSON.stringify(r.env) === '["PATH"]' && r.timeoutMs === MW.DEADLINE_MS, 'its start: the walker, the run\'s mark, its numbers — a PATH-only whole env, ended at its deadline', r);
    const { jm, job } = engine(realJM, 'doubt');
    answer = rowsLine([]); runs.length = 0; inProcess = 0; stubPI();
    try { jm._runScope = () => null; jm._graceMs = () => 0; await jm._stopDoubt(job, job.runs[0]); } finally { restorePI(); }
    try { jm.shutdown(); } catch { }
    okP(inProcess === 0 && runs.length === 1 && runs[0].args[2] === 'VIBESPACE_JOB_ID=' + job.id, 'the DOUBT\'s stop walks through the starter too (0 here)', { inProcess, mark: runs[0] && runs[0].args[2] });
    const old = MC.load('src/jobs.js', anchored(JSRC, "this._walkMarked({ mark: `VIBESPACE_JOB_RUN=${job.id}:${run0.startedAt}`, since: Number(stamp.starttime) || 0 })", "Promise.resolve(PI.membersOf({ mark: `VIBESPACE_JOB_RUN=${job.id}:${run0.startedAt}`, since: Number(stamp.starttime) || 0 }))", 'red-walk-on-loop'), 'red-walk-on-loop');
    const fr = await forced(old, 'forced-red', rowsLine([[STR, 5]]));
    okP(fr.inProcess === 1 && fr.runs.length === 0, 'RED: the walk on the hub\'s thread (the road before) — membersOf runs HERE, the starter never asked', fr);
    ok(!/PI\.membersOf\(/.test(JSRC), 'src/jobs.js calls proc-identity\'s membersOf NOWHERE (all three roads walk through src/server/marked-walk.js)');
  }

  console.log('§2 the press answers at once: nothing but the stop waits on the walk');
  {
    const { jm, job, logs } = engine(realJM, 'held');
    let release = null; answer = () => new Promise((r) => { release = () => r(rowsLine([[STR, 5]])); });
    sent.length = 0; stubPI();
    let back = null, t0 = 0, dt = 0, before = null;
    try {
      t0 = performance.now(); back = jm._killTree(job, { pid: WRAPPER, starttime: 1 }, { group: true }); dt = performance.now() - t0;
      before = [...sent]; await sleep(30);
      const stillOut = sent.length === 0;
      if (release) release(); await jm.markWalksSettled();
      okP(typeof back === 'number' && before.length === 0 && stillOut && sent.includes(STR), `the forced end RETURNS while its walk is still out (nothing signalled before the walk's answer: the stand-in holds it until released); the mark's kill lands only when the walk answers`, { returned: back, ms: Number(dt.toFixed(1)), signalledBefore: before, signalledAfter: [...sent] });
    } finally { restorePI(); }
    try { jm.shutdown(); } catch { }
    void logs;
  }

  console.log('§3 an ENDED walk is said, nothing from it signalled, the stop goes on');
  {
    const e = await forced(realJM, 'ended', { started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' });
    okP(e.sent.length === 0 && /its walk for what carries its mark was ended at its 3 s bound: what left its group may be left/.test(e.said), 'a walk ended at its deadline is SAID in the job\'s log and the hub\'s; nothing from it is signalled', e);
    const cut = MC.load('src/jobs.js', anchored(JSRC, "      + (marked.ended ? ` — ${require('./server/marked-walk.js').endedWords(marked.ended)}: what left its group may be left` : '');", "      + '';", 'red-ended-unsaid'), 'red-ended-unsaid');
    const er = await forced(cut, 'ended-red', { started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' });
    okP(!/was ended at its/.test(er.said), 'RED: the words cut — an ended walk leaves «may be left» unsaid', er);
  }

  console.log('§4 the REAL child: what membersOf answers, as pids and start times only');
  {
    const root = path.join(T, 'proc'); fs.mkdirSync(path.join(root, 'sys/kernel/random'), { recursive: true }); fs.writeFileSync(path.join(root, 'sys/kernel/random/boot_id'), 'placed-boot\n');
    const MARK = 'VIBESPACE_JOB_RUN=jb-9a1cpl:1700000000000', SECRETISH = ['planted', 'environ', 'value', String(process.pid)].join('-');
    const put = (pid, { state = 'S', pgrp = pid, start = 2000, env = [] }) => { const d = path.join(root, String(pid)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'stat'), `${pid} (x) ${[state, '1', String(pgrp), ...Array(16).fill('0'), String(start), '0', '0'].join(' ')}`); fs.writeFileSync(path.join(d, 'environ'), ['PATH=/usr/bin', ...env].join('\0')); };
    put(7001, { env: [MARK, `HOLDS=${SECRETISH}`] }); put(7002, { env: [`HOLDS=${SECRETISH}`] }); put(7003, { state: 'D', env: [MARK] }); put(7004, { env: [MARK], start: 10 });
    const mine = PI.membersOf({ mark: MARK, since: 1000 }, { procRoot: root });
    const S0 = CS.createChildStarter(); let line = '';
    const w = await MW.walkMarked({ mark: MARK, since: 1000, procRoot: root, runImpl: (c, a, o) => S0.run(c, a, o).then((r) => { line = String(r.stdout || ''); return r; }) });
    try { S0.closePipe(); } catch { }
    const same = JSON.stringify(w.rows.map((r) => [r.pid, r.starttime])) === JSON.stringify(mine.map((r) => [Number(r.pid), Number(r.starttime)]));
    okP(!w.ended && same && w.rows.length === 1 && w.rows[0].pid === 7001, 'the child answers what membersOf answers on the same placed /proc (the same function: the D-state one never read, one started before the bound never its)', { child: w.rows, here: mine.map((r) => [Number(r.pid), Number(r.starttime)]), ended: w.ended });
    const parsed = (() => { try { return JSON.parse(line.trim()); } catch { return null; } })();
    okP(!!parsed && !line.includes(SECRETISH) && parsed.rows.every((x) => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite)), 'its one line carries pids and start times ONLY — the planted environment value is nowhere in it', { line: line.trim().slice(0, 200) });
  }
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + ((e && e.stack) || e));
} finally {
  MW.setRunImpl(null);
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
