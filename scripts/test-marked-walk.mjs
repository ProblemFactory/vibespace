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
import { spawn } from 'node:child_process';
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
let inProcess = 0; const sent = [], sentIds = [];
const keep = {}; for (const k of ['treeOf', 'membersOf', 'signalIdentity', 'keptOut', 'pgidOf']) keep[k] = PI[k];
const stubPI = () => { PI.treeOf = () => []; PI.membersOf = () => { inProcess++; return Object.assign([{ pid: STR, starttime: 5, bootId: 'b' }], { scan: { scanned: 1, total: 1, cut: false } }); }; PI.signalIdentity = (id) => { sent.push(id.pid); sentIds.push({ pid: id.pid, starttime: id.starttime, bootId: id.bootId }); return { ok: true }; }; PI.keptOut = () => []; PI.pgidOf = () => 0; };
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
  answer = ans; sent.length = 0; sentIds.length = 0; inProcess = 0; runs.length = 0;
  stubPI();
  try { jm._killTree(job, { pid: WRAPPER, starttime: 1 }, { group: true }); if (typeof jm.markWalksSettled === 'function') await jm.markWalksSettled(); else await sleep(20); }
  finally { restorePI(); }
  try { jm.shutdown(); } catch { }
  return { sent: [...sent], ids: sentIds.map((x) => ({ ...x })), inProcess, runs: runs.map((r) => ({ args: r.args.slice(1).map((a, i) => (i === 0 ? path.basename(String(a)) : a)), env: Object.keys((r.o && r.o.env) || {}), whole: !!(r.o && r.o.wholeEnv), timeoutMs: r.o && r.o.timeoutMs })), said: logs.join(' | ') };
};

try {
  console.log('§1 no walk on the hub\'s thread — the forced end, the doubt\'s stop and the service clear\'s kept walk each go through the starter');
  {
    const f = await forced(realJM, 'forced', rowsLine([[STR, 5]]));
    okP(f.inProcess === 0 && f.runs.length === 1 && f.sent.includes(STR) && /1 process carrying its run's mark outside its group/.test(f.said), 'the FORCED END walks nothing on the hub\'s thread (0 membersOf here): ONE run of the starter, and the stranger it found is ended when it answers', f);
    okP(f.ids.length === 1 && f.ids[0].pid === STR && f.ids[0].starttime === 5 && f.ids[0].bootId === PI.bootIdOf(), 'r2228 (3): the identity SIGNALLED is the walked row\'s own — its pid, ITS start time (the child read it), this machine\'s boot — never a start time read again on the hub', f.ids);
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
  console.log('§5 the kill law across the hand-over: the REAL identity signal refuses a pid reused while the walk ran');
  {
    const kid = spawn('sleep', ['30'], { stdio: 'ignore' });   // this suite's own child: the only process these legs may signal
    const exited = () => kid.exitCode !== null || kid.signalCode !== null;
    try {
      let real = null; for (let k = 0; k < 100 && !real; k++) { real = PI.identityOf(kid.pid); if (!real) await sleep(10); }
      // judged by STATE: the real signal's own verdict for this pid (a spy around it, the call unchanged) and the child's own exit
      const lawLeg = async (Mod, tag) => {
        const { jm, job } = engine(Mod, tag);
        answer = rowsLine([[kid.pid, Number(real.starttime) + 1]]); runs.length = 0;   // the walked row: THIS pid with ANOTHER start time — a pid reused during the walk
        const t0 = PI.treeOf, s0 = PI.signalIdentity, verdicts = [];
        PI.treeOf = () => [];   // the tree of a stand-in wrapper: none (the real identity signal is the point)
        PI.signalIdentity = (id, sig, o) => { const r = s0(id, sig, o); if (id && Number(id.pid) === kid.pid) verdicts.push(r && r.ok ? 'ok' : String((r && r.why) || 'refused')); return r; };
        try { jm._killTree(job, { pid: WRAPPER, starttime: 1 }, { group: true }); if (typeof jm.markWalksSettled === 'function') await jm.markWalksSettled(); } finally { PI.treeOf = t0; PI.signalIdentity = s0; }
        try { jm.shutdown(); } catch { }
        return verdicts;
      };
      const v = await lawLeg(realJM, 'law-reused');
      okP(!!real && JSON.stringify(v) === '["pid-recycled"]' && !exited() && PI.aliveIdentity(real) === true, 'r2228 (3): a walked row whose start time is not the live pid\'s is NEVER signalled — the real identity signal re-judges pid, start time and boot in the same call and answers «pid-recycled» (a pid reused while the walk ran)', { pid: kid.pid, verdicts: v });
      const reread = MC.load('src/jobs.js', anchored(JSRC, 'const rows = w.rows.map((r) => ({ pid: r.pid, starttime: r.starttime, bootId: boot }));', 'const rows = w.rows.map((r) => ({ pid: r.pid, starttime: PI.starttimeOf(r.pid), bootId: boot }));   /* MUTANT: the start time read again on the hub */', 'red-starttime-reread'), 'red-starttime-reread');
      const vx = await lawLeg(reread, 'law-reused-red');
      for (let k = 0; k < 100 && !exited(); k++) await sleep(20);   // the SIGKILL it sent lands when the child exits (a wait on its exit; the guard only ends a wait that never comes)
      okP(JSON.stringify(vx) === '["ok"]' && exited(), 'RED: the start time read again on the hub (not the walked row\'s) — the reused pid is SIGNALLED (the real signal answers ok; the child ends)', { verdicts: vx, exitSignal: kid.signalCode });
    } finally { try { kid.kill('SIGKILL'); } catch { } }
  }

  // a kept service run — what the service clear walks for: its pid.json on this boot, one recorded pid, its scope none
  const KEPT = 4194311;
  const keptSvc = (Mod, tag, { alive = () => false } = {}) => {
    const { jm, job, logs } = engine(Mod, tag);
    const run = job.runs[0], ctl = jm._ctlDir(job, run.startedAt); fs.mkdirSync(ctl, { recursive: true });
    fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: WRAPPER, starttime: 1, bootId: PI.bootIdOf(), startedAt: run.startedAt }));
    Object.assign(job, { kind: 'service', name: job.id, state: 'down', desiredUp: true, cmd: { argv: ['true'] }, owner: { conversation: { backend: 'claude', id: 'conv-mw-own' }, sessionId: 's-own', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] }, access: { view: 'session', control: 'session' } });
    Object.assign(run, { endedAt: run.startedAt + 1000, cause: 'ok', left: { n: 1, kept: true, pids: [[KEPT, 9]], boot: PI.bootIdOf() } });
    jm.jobs.set(job.id, job); jm._runScope = () => null; jm._graceMs = () => 60;
    const keep2 = {}; for (const k of ['aliveIdentity', 'signalIdentity', 'keptOut', 'pgidOf', 'treeOf']) keep2[k] = PI[k];
    const stub = () => { PI.aliveIdentity = (id) => (id && id.pid === KEPT ? alive() : false); PI.signalIdentity = (id, sig) => { sent.push(`${id.pid}:${sig}`); return { ok: true }; }; PI.keptOut = () => []; PI.pgidOf = () => 0; PI.treeOf = () => []; };
    return { jm, job, run, logs, stub, unstub: () => Object.assign(PI, keep2) };
  };
  const ENDED = { started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' };

  console.log('§6 an ENDED walk in the service clear: it proves nothing — the next start refused in the ended walk\'s own words');
  {
    const clearEnded = async (Mod, tag) => {
      const s = keptSvc(Mod, tag); answer = ENDED; runs.length = 0; sent.length = 0; s.stub();
      let goes = null; try { goes = await s.jm._clearBefore(s.job, s.run, 'manual'); } finally { s.unstub(); }
      const l = s.run.left, reply = s.jm._cutOf(s.run) ? s.jm._doorWords(s.job, s.run, s.jm._cutOf(s.run)) : '';
      try { s.jm.shutdown(); } catch { }
      return { goes, cut: l.cut || null, gone: !!l.gone, reply, said: s.jm.events.filter((e) => e.jobId === s.job.id).map((e) => e.what).join(' | ') };
    };
    const c = await clearEnded(realJM, 'clear-ended');
    okP(c.goes === false && !c.gone && !!c.cut && c.cut.why === MW.endedWords('deadline') && /^cannot prove the previous run is gone \(its walk for what carries its mark was ended at its 3 s bound\) — not restarted/.test(c.reply) && c.said.includes(c.reply), 'r2228 (3): the clear\'s kept walk ENDED at its bound proves nothing — the start refused, stamped and said in the ended walk\'s own words; the next press\'s reply is those words', c);
    const cutX = MC.load('src/jobs.js', anchored(JSRC, '        if (found.ended) seen = { scanned: 0, total: 0, ...(seen || {}), cut: true, ended: found.ended };', '        /* MUTANT: an ended walk read as «nothing left» */', 'red-clear-ended-cut'), 'red-clear-ended-cut');
    const cx = await clearEnded(cutX, 'clear-ended-red');
    okP(cx.goes === true && cx.gone && !cx.cut, 'RED: the ended check cut — an ended walk reads as «nothing left»: `gone`, and the start goes', cx);
    // r2228 (1): the FIRST walk finishes, something lives through the grace, the LATE walk is ended: its own words, never «could not check 0 of N»
    const lateEnded = async (Mod, tag) => {
      let k = 0; const s = keptSvc(Mod, tag, { alive: () => true }); answer = () => Promise.resolve(++k === 1 ? rowsLine([]) : ENDED); runs.length = 0; sent.length = 0; s.stub();
      try { await s.jm._clearKept(s.job, s.run); } finally { s.unstub(); }
      try { s.jm.shutdown(); } catch { }
      return { walks: k, why: (s.run.left.cut && s.run.left.cut.why) || '', sent: [...sent] };
    };
    const le = await lateEnded(realJM, 'late-ended');
    okP(le.walks === 2 && le.why === `${MW.endedWords('deadline')}; 1 found and stopped` && !/could not check 0 of/.test(le.why) && le.sent.includes(`${KEPT}:SIGKILL`), 'r2228 (1): a LATE walk ended at its bound (the first one finished; something outlived the grace) is stamped in its OWN words — never «could not check 0 of N»', le);
    const oldWords = MC.load('src/jobs.js', anchored(JSRC, "${seen.ended ? require('./server/marked-walk.js').endedWords(seen.ended) : `could not check", "${false ? '' : `could not check", 'red-late-words'), 'red-late-words');
    const lx = await lateEnded(oldWords, 'late-ended-red');
    okP(/^could not check 0 of 3 processes/.test(lx.why), 'RED: the late walk\'s ended words cut — «could not check 0 of 3 processes»: zero unchecked, yet refused', lx);
  }

  console.log('§7 the refusal told to its presser: only a presser that can still VIEW the job');
  {
    const tellTo = (Mod, tag) => {
      const s = keptSvc(Mod, tag); s.run.left.cut = { at: Date.now(), why: 'could not check 100 of 3100 processes for what it left running' };
      const to = []; s.jm._deliverTo = (cid) => { to.push(cid); };
      const viewer = { conversationId: 'conv-mw-own', sessionId: 's-own', sessionCreatedAt: 1, groups: new Set() }, stranger = { conversationId: 'conv-mw-other', sessionId: 's-other', sessionCreatedAt: 1, groups: new Set() };
      const n = s.jm._tellNotStarted(s.job, s.run, [viewer, stranger]);
      try { s.jm.shutdown(); } catch { }
      return { n, to };
    };
    const tv = tellTo(realJM, 'tell-view');
    okP(tv.n === 1 && JSON.stringify(tv.to) === '["conv-mw-own"]', 'r2228 (3): the refusal reaches the presser that can still VIEW the job — a presser that cannot is never told (its name is the job\'s)', tv);
    const noView = MC.load('src/jobs.js', anchored(JSRC, "if (!cid || told.has(cid) || !M.canView(job, c)) continue;   // the presser must still VIEW the job\n", "if (!cid || told.has(cid)) continue;   /* MUTANT: no view check */\n", 'red-tell-no-view'), 'red-tell-no-view');
    const tx = tellTo(noView, 'tell-view-red');
    okP(tx.n === 2 && tx.to.includes('conv-mw-other'), 'CONTROL (the view check cut, in a copy): the presser that cannot view the job IS told — RED', tx);
  }
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + ((e && e.stack) || e));
} finally {
  MW.setRunImpl(null);
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
