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
  console.log('§8 THE UNREAD MEMBER (主开发 r2215): a living process whose environment AND command line read empty is inside its exec — UNREAD, read once more, counted');
  {
    const PISRC = fs.readFileSync(path.join(ROOT, 'src/proc-identity.js'), 'utf8');
    const root2 = path.join(T, 'proc2'); fs.mkdirSync(path.join(root2, 'sys/kernel/random'), { recursive: true }); fs.writeFileSync(path.join(root2, 'sys/kernel/random/boot_id'), 'placed-boot\n');
    const MARK = 'VIBESPACE_JOB_RUN=jb-9a1cun:1700000000000';
    const put2 = (pid, { state = 'S', flags = 0, start = 2000, env = '', cmd = '' }) => { const d = path.join(root2, String(pid)); fs.mkdirSync(d, { recursive: true }); const f = [state, '1', String(pid), ...Array(16).fill('0'), String(start), '0', '0']; f[6] = String(flags); fs.writeFileSync(path.join(d, 'stat'), `${pid} (x) ${f.join(' ')}`); fs.writeFileSync(path.join(d, 'environ'), env); fs.writeFileSync(path.join(d, 'cmdline'), cmd); };
    put2(7201, {});                                                               // inside its exec: environ AND cmdline empty ⇒ unread
    put2(7202, { cmd: 'sleep\0' + '30\0' });                                      // started with no environment: carries no mark
    put2(7203, { flags: 0x00200000 });                                            // a kernel thread: carries none
    put2(7204, { env: ['PATH=/usr/bin', MARK].join('\0'), cmd: 'sleep\0' });     // a member
    put2(7205, { state: 'D', env: MARK, cmd: 'x\0' });                            // uninterruptible sleep: never read ⇒ unread
    const pids = (rows) => rows.map((r) => Number(r.pid)).sort((a, b) => a - b);
    const m = PI.membersOf({ mark: MARK, since: 1000 }, { procRoot: root2 });
    okP(JSON.stringify(pids(m)) === '[7204]' && m.scan.unreadable === 2 && m.scan.scanned === 5, 'the empty environ AND command line (inside its exec) is UNREAD and counted, as the stuck one is; an empty environ WITH a command line and a kernel thread carry no mark — never «unread»', { rows: pids(m), scan: m.scan });
    const oldRule = MC.load('src/proc-identity.js', anchored(PISRC, "return cmd.text.length ? { env: [] } : endingOf(root, pid, rest) || { unread: 'exec' };", "return { env: [] };   /* MUTANT: the release's «not carrying» */", 'red-empty-not-carrying'), 'red-empty-not-carrying');
    const mx = oldRule.membersOf({ mark: MARK, since: 1000 }, { procRoot: root2 });
    okP(mx.scan.unreadable === 1, 'RED: the release\'s rule — the empty environ read as «not carrying», UNCOUNTED (only the stuck one counted)', { scan: mx.scan });
    // THE WRAPPER's TWIN: the job wrapper's escapee scan — its OWN text, over the same placed table — answers what membersOf answers
    const WT = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8');
    const cutOut = (s, a, b) => { const i = s.indexOf(a), j = i < 0 ? -1 : s.indexOf(b, i); return i >= 0 && j > i ? s.slice(i, j) : null; };
    const escText = cutOut(WT, 'function escapedOf() {', '\nasync function drainGroup() {'), envText = cutOut(WT, 'function envOf(root, pid, rest) {', '\n// ── SHIPPED TWIN (B-c134) END ──');
    const pfs = { readdirSync: (p, ...a) => fs.readdirSync(String(p).replace(/^\/proc/, root2), ...a), readFileSync: (p, ...a) => fs.readFileSync(String(p).replace(/^\/proc/, root2), ...a) };
    const statOfP = (pid) => { try { const s = pfs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2).split(' '); } catch { return null; } };
    const wrapScan = (envSrc, { esc = escText, keptT = () => null } = {}) => new Function('fs', 'statOf', 'envOf', 'keptTest', 'keptAncestors', 'MARK', 'MARK_RUN', 'stamp', `return ${esc}`)(pfs, statOfP, new Function('fs', `return ${envSrc}`)(pfs), keptT, () => new Set(), MARK, '', { starttime: 1000 })();   // eslint-disable-line no-new-func
    if (!escText || !envText) ok(false, 'ANCHOR (data/bin/job-wrapper.js): escapedOf / envOf not found — the parity leg reads nothing');
    else {
      const w = wrapScan(envText);
      okP(JSON.stringify(w.map((x) => x[0]).sort((a, b) => a - b)) === JSON.stringify(pids(m)) && (w.unread || 0) === m.scan.unreadable, 'THE WRAPPER\'s TWIN: the job wrapper\'s escapee scan, ITS OWN TEXT over the same placed table, answers what membersOf answers — the same members, the same unread (one rule: the shipped twin, pinned byte for byte by test-stop-tree §3b)', { wrapper: w.map((x) => x[0]), unread: w.unread || 0 });
      const wx = wrapScan(envText.replace("return cmd.text.length ? { env: [] } : endingOf(root, pid, rest) || { unread: 'exec' };", 'return { env: [] };'));
      okP((wx.unread || 0) !== m.scan.unreadable, 'RED: a wrapper rule that drifted (the empty environ «not carrying») answers another count than membersOf — the parity leg sees it', { unread: wx.unread || 0, membersOf: m.scan.unreadable });
    }
    // THE SECOND READ decides: one read inside its exec at the first look, carrying the mark at the second (at the walk's end, inside its bound)
    put2(7206, {});
    const at6 = `${root2}/7206/environ`, rf = fs.readFileSync; let k6 = 0;
    const twice = (Mod) => { k6 = 0; fs.readFileSync = function (p, ...a) { if (p === at6) { k6++; return k6 === 1 ? '' : ['PATH=/usr/bin', MARK].join('\0'); } return rf.call(fs, p, ...a); }; try { return Mod.membersOf({ mark: MARK, since: 1000 }, { procRoot: root2 }); } finally { fs.readFileSync = rf; } };
    const m2 = twice(PI);
    okP(JSON.stringify(pids(m2)) === '[7204,7206]' && k6 === 2 && m2.scan.unreadable === 2, 'THE SECOND READ decides: read inside its exec at the first look, it carries the mark at the walk\'s end — a MEMBER (its start time read again), never counted unread; no third read', { rows: pids(m2), reads: k6, scan: m2.scan });
    const noSecond = MC.load('src/proc-identity.js', anchored(PISRC, '  for (const e of again) { if (Date.now() - t1 > maxMs) { if (endingSeen.has(e)) ending++; else unread(e); } else check(e, true); }\n', '  /* MUTANT: no second read */\n', 'red-no-second-read'), 'red-no-second-read');
    const m2x = twice(noSecond);
    okP(!pids(m2x).includes(7206) && k6 === 1, 'RED: no second read — the member read inside its exec is missed (and the unread go uncounted)', { rows: pids(m2x), reads: k6, scan: m2x.scan });
    // round whnhv7lcb (b): a pid REUSED between the two reads — the second stat shows a new start time; the row carries IT (the start time
    // comes from the same read as the mark), never the first read's
    put2(7207, {});
    const at7s = `${root2}/7207/stat`, at7e = `${root2}/7207/environ`; let k7s = 0, k7e = 0;
    const reused = (Mod) => { k7s = 0; k7e = 0; fs.readFileSync = function (p, ...a) { if (p === at7s) { k7s++; const f = ['S', '1', '7207', ...Array(16).fill('0'), k7s === 1 ? '2000' : '2500', '0', '0']; return `7207 (x) ${f.join(' ')}`; } if (p === at7e) { k7e++; return k7e === 1 ? '' : ['PATH=/usr/bin', MARK].join('\0'); } return rf.call(fs, p, ...a); }; try { return Mod.membersOf({ mark: MARK, since: 1000 }, { procRoot: root2 }); } finally { fs.readFileSync = rf; } };
    const mr = reused(PI), row7 = mr.find((r) => Number(r.pid) === 7207);
    okP(!!row7 && row7.starttime === 2500 && k7s === 2, 'round whnhv7lcb (b): a pid REUSED between the two reads (a new start time at the second) — the row carries the SECOND read\'s start time, the one its mark was read with; the signal\'s identity check then judges the process that is there', { row: row7, stats: k7s });
    const firstSt = MC.load('src/proc-identity.js', anchored(anchored(anchored(PISRC, '  const again = [];', '  const again = [], firstSt = new Map();', 'red-first-start-1'), 'else again.push(e); }', 'else { again.push(e); firstSt.set(e, Number(r[19])); } }', 'red-first-start-2'), '    if (hit) out.push({ pid: e, starttime: Number(r[19]), bootId });', '    if (hit) out.push({ pid: e, starttime: firstSt.has(e) ? firstSt.get(e) : Number(r[19]), bootId });   /* MUTANT: the first read\'s start time */', 'red-first-start-3'), 'red-first-start');
    const mrx = reused(firstSt), row7x = mrx.find((r) => Number(r.pid) === 7207);
    okP(!!row7x && row7x.starttime === 2000, 'RED: the first read\'s start time handed back — a row naming another process than the one whose mark was read', { row: row7x });
    if (escText && envText) {
      // round whnhv7lcb (c): the WRAPPER's second read FINDS a member (7206: inside its exec at the first look, carrying the mark at the second)
      const wTwice = (esc) => { k6 = 0; fs.readFileSync = function (p, ...a) { if (p === at6) { k6++; return k6 === 1 ? '' : ['PATH=/usr/bin', MARK].join('\0'); } return rf.call(fs, p, ...a); }; try { return wrapScan(envText, { esc }); } finally { fs.readFileSync = rf; } };
      const wf = wTwice(escText);
      okP(wf.some((x) => x[0] === 7206) && k6 === 2, 'round whnhv7lcb (c): the wrapper\'s second read FINDS the member read inside its exec at the first look — the same answer as membersOf\'s', { found: wf.map((x) => x[0]), reads: k6 });
      const pushCut = escText.replace('anc2.has(Number(e))) continue; look(e, r, true); }', 'anc2.has(Number(e))) continue; }');
      const wfx = pushCut !== escText ? wTwice(pushCut) : null;
      okP(!!wfx && !wfx.some((x) => x[0] === 7206), 'RED: the wrapper\'s second read cut — the member read inside its exec is missed', { found: wfx && wfx.map((x) => x[0]) });
      // round whnhv7lcb (a): a HUB caught inside its exec — its command line read empty at the first pass (its hub test said «not kept»),
      // a hub's at the second: the second pass's FRESH test keeps it — the stop never signals it
      put2(7208, {});
      const a8c = `${root2}/7208/cmdline`, a8e = `${root2}/7208/environ`; let k8c = 0, k8e = 0;
      const keptT = () => { const memo = new Map(); return (pid) => { if (!memo.has(Number(pid))) { let c = ''; try { c = pfs.readFileSync(`/proc/${pid}/cmdline`, 'latin1'); } catch { } memo.set(Number(pid), /server\.js/.test(c)); } return memo.get(Number(pid)); }; };
      const hubMid = (esc) => { k8c = 0; k8e = 0; fs.readFileSync = function (p, ...a) { if (p === a8c) { k8c++; return k8c <= 2 ? '' : 'node\0server.js\0'; } if (p === a8e) { k8e++; return k8e === 1 ? '' : ['PATH=/usr/bin', MARK].join('\0'); } return rf.call(fs, p, ...a); }; try { return wrapScan(envText, { esc, keptT }); } finally { fs.readFileSync = rf; } };
      const wh = hubMid(escText);
      okP(!wh.some((x) => x[0] === 7208), 'round whnhv7lcb (a): a hub inside its exec at the first pass is KEPT at the second by a fresh test (its group, its ancestors and the hub test asked again on the fresh stat) — never on the stop\'s list', { found: wh.map((x) => x[0]), cmdlineReads: k8c });
      const OLD_AGAIN = "  for (const e of again) { if (Date.now() - t0 > 250) { out.unread = (out.unread || 0) + 1; continue; } const r = statOf(e); if (r && r[0] !== 'Z' && Number(r[19]) >= stamp.starttime) look(e, r, true); }";   // stale-pins: kept — the red writes the round's loop back into a copy of the scan
      const NEW_AGAIN = escText.slice(escText.indexOf('  for (const e of again) {'), escText.indexOf('\n', escText.indexOf('  for (const e of again) {')));
      const oldLoop = NEW_AGAIN ? escText.replace(NEW_AGAIN, OLD_AGAIN) : escText;
      const whx = oldLoop !== escText ? hubMid(oldLoop) : null;
      okP(!!whx && whx.some((x) => x[0] === 7208), 'RED: the round\'s second read (no skips asked again) — the hub caught inside its exec is put on the stop\'s list', { found: whx && whx.map((x) => x[0]) });
    }
    // r4302 (主开发): A PROCESS THE KERNEL SAYS IS ENDING IS NEVER «could not be read», AND NEVER DROPPED SILENTLY. PLACED rows (the walk's
    // own reader, and the wrapper's twin, over a stand-in /proc): one of OURS EXITING (PF_EXITING: environ and command line empty — what the
    // kernel shows of a process in its end); one of ours HELD with a SIGTERM pending (stopped: it ends once it runs) whose environ cannot be
    // read; one of ours in uninterruptible sleep, nothing pending (it truly cannot be read); one of ours held with a SIGTERM it CATCHES (not
    // ending); ANOTHER user's exiting process (never ours to say); a member (a living read, unchanged)
    {
      const me = process.getuid(), root3 = path.join(T, 'proc3'); fs.mkdirSync(path.join(root3, 'sys/kernel/random'), { recursive: true }); fs.writeFileSync(path.join(root3, 'sys/kernel/random/boot_id'), 'placed-boot\n');
      const Z16 = '0000000000000000';
      const put3 = (pid, { state = 'S', flags = 0, env = '', cmd = '', uid = me, pnd = Z16, cgt = Z16, envDir = false } = {}) => {
        const d = path.join(root3, String(pid)); fs.mkdirSync(d, { recursive: true });
        const f = [state, '1', String(pid), ...Array(16).fill('0'), '2000', '0', '0']; f[6] = String(flags);
        fs.writeFileSync(path.join(d, 'stat'), `${pid} (x) ${f.join(' ')}`);
        fs.writeFileSync(path.join(d, 'status'), `Name:\tx\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\nSigPnd:\t${pnd}\nShdPnd:\t${Z16}\nSigBlk:\t${Z16}\nSigIgn:\t${Z16}\nSigCgt:\t${cgt}\n`);
        if (envDir) fs.mkdirSync(path.join(d, 'environ')); else fs.writeFileSync(path.join(d, 'environ'), env);
        fs.writeFileSync(path.join(d, 'cmdline'), cmd);
      };
      put3(7301, { state: 'R', flags: 0x4 });                                                  // ours, EXITING
      put3(7302, { state: 'T', envDir: true, pnd: '0000000000004000' });                     // ours, held, a SIGTERM pending, environ unreadable
      put3(7303, { state: 'D' });                                                            // ours, uninterruptible, nothing pending: truly unread
      put3(7304, { state: 'R', flags: 0x4, uid: me + 1 });                                   // ANOTHER user's, exiting
      put3(7305, { env: ['PATH=/usr/bin', MARK].join('\0'), cmd: 'sleep\0' });              // a member
      put3(7306, { state: 'T', envDir: true, pnd: '0000000000004000', cgt: '0000000000004000' });   // ours, a SIGTERM pending that it CATCHES
      const scan3 = (Mod) => { const m = Mod.membersOf({ mark: MARK, since: 1000 }, { procRoot: root3 }); return { rows: pids(m), ...m.scan }; };
      const e3 = scan3(PI);
      okP(JSON.stringify(e3.rows) === '[7305]' && e3.ending === 2 && e3.unreadable === 3 && e3.others === 1, 'r4302: the walk\'s own reader — an EXITING process of ours and one HELD with a SIGTERM pending (unreadable) are «still ending» (2), never «could not be read»; the one truly unread (D, nothing pending) and the one that CATCHES its SIGTERM still count unread; another user\'s exiting process is never ours (others); the member is read as always', e3);
      const noEnding = MC.load('src/proc-identity.js', anchored(PISRC, 'function endingOf(root, pid, rest) {\n', 'function endingOf() { return null; }   /* MUTANT: the release — no ending verdict */\nfunction endingOfCut(root, pid, rest) {\n', 'red-no-ending'), 'red-no-ending');
      const e3x = scan3(noEnding);
      okP(!e3x.ending && e3x.unreadable === 5 && e3x.unreadable - e3x.others === 4, 'RED: the release\'s rule (no ending verdict, in a copy) — the two ENDING processes of ours are counted «could not be read» (4 of ours where 2 truly are)', e3x);
      if (escText && envText) {
        const pfs3 = { readdirSync: (q, ...a) => fs.readdirSync(String(q).replace(/^\/proc/, root3), ...a), readFileSync: (q, ...a) => fs.readFileSync(String(q).replace(/^\/proc/, root3), ...a) };
        const statOf3 = (pid) => { try { const s = pfs3.readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2).split(' '); } catch { return null; } };
        const wrap3 = (envSrc, esc = escText) => { const w = new Function('fs', 'statOf', 'envOf', 'keptTest', 'keptAncestors', 'MARK', 'MARK_RUN', 'stamp', `return ${esc}`)(pfs3, statOf3, new Function('fs', `return ${envSrc}`)(pfs3), () => null, () => new Set(), MARK, '', { starttime: 1000 })(); return { found: w.map((x) => x[0]).sort((a, b) => a - b), ending: w.ending || 0, unread: w.unread || 0 }; };   // eslint-disable-line no-new-func
        const w3 = wrap3(envText);
        okP(JSON.stringify(w3.found) === '[7305]' && w3.ending === e3.ending && w3.unread === e3.unreadable, 'r4302: THE WRAPPER\'s TWIN, its own text over the same rows — the same members, «still ending» 2 and unread 3, as membersOf (the scan\'s words say the ending ones by their own sentence)', w3);
        const w3x = wrap3(envText, escText.replace(/\n    if \(v\.ending\) \{[^\n]*/, ''));
        okP(w3x.ending === 0 && w3x.unread === e3.unreadable, 'RED: the wrapper\'s scan without its ending count (in a copy) — the two ending processes are DROPPED SILENTLY (neither ending nor unread)', w3x);
      }
    }
  }

  console.log('§9 a still-unread member is SAID by the forced end too, in the clear\'s words');
  {
    const UNR = { started: true, code: 0, signal: null, stdout: JSON.stringify({ rows: [], scan: { scanned: 9, total: 9, unreadable: 2, others: 1, cut: false } }) + '\n', stderr: '' };
    const u = await forced(realJM, 'unread-said', UNR);
    okP(/its mark could not be read in 1 process of ours \(in uninterruptible sleep, inside an exec, or not dumpable\): what carries its mark there may be left/.test(u.said) && !/of other users/.test(u.said), 'the forced end says what its walk could not read of OURS, by its true causes (round whnhv7lcb (d)/(e): never «not dumpable» alone, never another user\'s refusals)', { said: u.said });
    const OTH = { started: true, code: 0, signal: null, stdout: JSON.stringify({ rows: [], scan: { scanned: 9, total: 9, unreadable: 2, others: 2, cut: false } }) + '\n', stderr: '' };
    const uo = await forced(realJM, 'unread-others', OTH);
    okP(!/could not be read|unreadable|of other users/.test(uo.said), 'round whnhv7lcb (e): unread rows that are all OTHER users\' (refused reads) — the forced end says nothing of them (on a shared machine every forced end would say it)', { said: uo.said });
    const mute = MC.load('src/jobs.js', anchored(JSRC, '      + ((mscan.unreadable || 0) - (mscan.others || 0) > 0 ? ', '      + (false && (mscan.unreadable || 0) - (mscan.others || 0) > 0 ? ', 'red-unread-unsaid'), 'red-unread-unsaid');
    const ux = await forced(mute, 'unread-said-red', UNR);
    okP(!/could not be read/.test(ux.said), 'RED: the words cut — the forced end silent about what it could not read (the release\'s)', { said: ux.said });
    // r4302: the forced end says an ENDING process by its true word, with its count — never «could not be read», never silently
    const ENDG = { started: true, code: 0, signal: null, stdout: JSON.stringify({ rows: [], scan: { scanned: 9, total: 9, unreadable: 0, others: 0, ending: 2, cut: false } }) + '\n', stderr: '' };
    const en = await forced(realJM, 'ending-said', ENDG);
    const MIX = { started: true, code: 0, signal: null, stdout: JSON.stringify({ rows: [], scan: { scanned: 9, total: 9, unreadable: 2, others: 1, ending: 1, cut: false } }) + '\n', stderr: '' };
    const em = await forced(realJM, 'ending-mixed', MIX);
    okP(/its forced end — 2 processes of ours still ending at its walk's last look \(the kernel is ending them\)/.test(en.said) && !/could not be read/.test(en.said) && /could not be read in 1 process of ours/.test(em.said) && /1 process of ours still ending at its walk's last look \(the kernel is ending it\)/.test(em.said), 'r4302: the forced end says the processes its walk met ENDING as «still ending» with their count — never «could not be read»; one truly unread beside them is still said', { ending: en.said, mixed: em.said });
    const endMute = MC.load('src/jobs.js', anchored(JSRC, "      + ((mscan.ending || 0) > 0 ? ", "      + (false && (mscan.ending || 0) > 0 ? ", 'red-ending-unsaid'), 'red-ending-unsaid');
    const enx = await forced(endMute, 'ending-said-red', ENDG);
    okP(!/still ending|could not be read/.test(enx.said), 'RED: the ending words cut (in a copy) — the forced end silent about the processes still ending', { said: enx.said });
  }
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + ((e && e.stack) || e));
} finally {
  MW.setRunImpl(null);
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
