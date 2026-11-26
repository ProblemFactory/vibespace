#!/usr/bin/env node
// test-job-logs-remover-start — B-323e, the job-log part (lane bl-jobs): THE JOB-LOGS REMOVER STARTS NO PROGRAM FROM THE HUB'S MAIN
// PROCESS. One child a batch, started by THE STARTER (src/server/child-starter.js — called, never changed): the batch in its
// arguments is job folder NAMES only, within a byte bound (src/job-logs-sweep.js ARGV_MAX; else the remover's own request file in
// the logs folder, removed by the child that reads it); a sweep's count rides a COUNT FILE (temp + rename after every removal, read
// with a size bound — a missing or torn one is «unknown», never «nothing removed»), counted ONCE (its name in the record beside its
// count, forgotten by the next pass). In-process + the REAL starter process and the REAL worker (small node children of the
// starter); each law with its RED (an anchored mutant copy); §8 the fresh read's seven finds, each cured with its RED. Prints THE MEASURE: the main loop's hold across one start — a fork from
// this process (the road before) and a start through the starter.
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
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 5) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(step); } return !!(await fn()); };
const DAY = 864e5;
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jlrs-'));
// THE COUNTER: every async child start of THIS process goes through ChildProcess.prototype.spawn (spawn / execFile / fork)
const CP = require('child_process');
let starts = 0;
const realSpawn = CP.ChildProcess.prototype.spawn;
CP.ChildProcess.prototype.spawn = function (...a) { starts++; return realSpawn.apply(this, a); };
for (const k of ['spawnSync', 'execFileSync', 'execSync']) { const real = CP[k]; CP[k] = function (...a) { starts++; return real.apply(this, a); }; }

const CS = require(path.join(ROOT, 'src/server/child-starter.js'));
const LS = require(path.join(ROOT, 'src/job-logs-sweep.js'));
const WORKER = path.join(ROOT, 'src/job-logs-sweep-worker.js');
const S0 = CS.createChildStarter();
const calls = [];   // every run the remover asks of THE starter
CS.setChildStarter({ ...S0, run: (c, a, o) => { calls.push({ c, a: [...a], o }); return S0.run(c, a, o); } });
const MC = mutantCopies('job-logs-remover-start', ROOT);
const LSsrc = fs.readFileSync(path.join(ROOT, 'src/job-logs-sweep.js'), 'utf8'), WKsrc = fs.readFileSync(WORKER, 'utf8');
const PATH_ONLY = { PATH: process.env.PATH || '/usr/bin:/bin' };
const deadStamp = () => ({ pid: 4194301, starttime: 1, bootId: 'another-boot-of-this-machine', startedAt: 1 });   // no process: another boot
const seedRun = (logs, id, ts, ageMs = 30 * DAY) => {
  const d = path.join(logs, id, String(ts)); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'pid.json'), JSON.stringify(deadStamp())); fs.writeFileSync(path.join(d, 'current.log'), 'line\n');
  const t = (Date.now() - ageMs) / 1000; for (const f of fs.readdirSync(d)) fs.utimesSync(path.join(d, f), t, t);
  return d;
};
const runsOf = (logs, id) => { try { return fs.readdirSync(path.join(logs, id)).filter((n) => /^\d+$/.test(n)); } catch { return []; } };
const has = (...p) => fs.existsSync(path.join(...p));
const inWindow = async (fn) => { const s0 = starts, c0 = calls.length; const v = await fn(); return { v, starts: starts - s0, calls: calls.slice(c0) }; };
const KEEP0 = { named: [], listed: [], skeleton: [], held: [] };
const B = Date.now() - 50 * DAY;
const slowOf = (worker, ms) => { const f = path.join(T, `slow-${path.basename(worker)}-${ms}.cjs`); fs.writeFileSync(f, `const fs = require('fs'); const rm = fs.rmSync; const sab = new Int32Array(new SharedArrayBuffer(4)); fs.rmSync = function (...a) { Atomics.wait(sab, 0, 0, ${ms}); return rm.apply(this, a); };\nrequire(${JSON.stringify(worker)});\n`); return f; };   // a slow storage: each removal waits (no CPU spent)
const engines = [];
const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
const engineAt = (dir, logs, sweep = {}) => {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), path.join(dir, 'bin', 'job-wrapper.js'));
  const jm = new JobManager({ dataDir: dir, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), memoryRungs: [], logsSweep: { bootDelayMs: 3600e3, restFactor: 1, gapMs: 3600e3, ...sweep } });
  jm.init(); engines.push(jm); return jm;
};

try {
  await S0.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start (made once), outside every window

  // ── §1 THE LAW ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('§1 the law: no program from the hub\'s process — every batch through the starter, one child a batch');
  {
    const D1 = path.join(T, 'd1'), L1 = path.join(D1, 'job-logs');
    seedRun(L1, 'jb-0e1a0001', B); for (let i = 0; i < 5; i++) seedRun(L1, 'jb-0e1a0002', B + i * 1000);
    const R1 = LS.createRemover({ logsDir: L1, workerPath: WORKER });
    const w1 = await inWindow(() => R1.whole(['jb-0e1a0001']));
    const c = w1.calls[0] || { a: [], o: {} };
    ok(w1.v && w1.v.gone && w1.v.gone.includes('jb-0e1a0001') && !has(L1, 'jb-0e1a0001') && w1.starts === 0 && w1.calls.length === 1, `a whole-dir batch removes its job dir through ONE run of the starter — this process started ${w1.starts} program(s)`, w1.v);
    ok(c.c === process.execPath && c.a[0] === '--max-old-space-size=96' && c.a[1] === WORKER && c.a[2] === L1 && c.a[3] === String(process.pid) && c.a[4] === '--once' && JSON.stringify(c.a.slice(5)) === JSON.stringify(['whole', '--names', 'jb-0e1a0001']), 'its start: node, a bounded heap, the worker, the logs folder, the hub\'s pid HANDED (round 3 §4), --once, the op and the names', c.a);
    ok(c.o.wholeEnv === true && JSON.stringify(Object.keys(c.o.env || {})) === '["PATH"]' && c.o.capture === true && c.o.timeoutMs > 0 && typeof c.o.onLateExit === 'function', 'its env is BUILT whole — PATH alone, as the fork\'s was (never the service env, never a secret); its answer captured; a bound; the late exit heard', { env: Object.keys(c.o.env || {}), whole: c.o.wholeEnv });
    const s1 = await inWindow(() => R1.sweep({ keep: KEEP0, cutoff: Date.now() - 14 * DAY, max: 3, orphanDir: D1 }));
    const sa = (s1.calls[0] || { a: [] }).a, req = sa[7];
    ok(s1.v && s1.v.removed === 3 && runsOf(L1, 'jb-0e1a0002').length === 2 && s1.starts === 0 && sa[5] === 'sweep' && sa[6] === '--request' && LS.REQUEST_NAME.test(req || '') && !has(L1, req), `a sweep rides its request file (its keep set is no argument) — the child read it and REMOVED it; 3 removed, this process started ${s1.starts}`, { removed: s1.v && s1.v.removed, a: sa.slice(5) });
    let cnt = null; try { cnt = JSON.parse(fs.readFileSync(path.join(D1, s1.v.countFile), 'utf8')); } catch { }
    ok(LS.COUNT_NAME.test((s1.v && s1.v.countFile) || '') && cnt && cnt.removed === 3 && cnt.entries === s1.v.entries, 'its COUNT FILE stands after its answer (counted once by the hub — its name kept in the record — then forgotten)', { countFile: s1.v && s1.v.countFile, cnt });
    const st = await inWindow(() => R1.state(path.join(D1, 'jobs-logs-sweep.json'), D1));
    const nt = await inWindow(() => R1.note(D1, [{ name: 'jobs.json.corrupt-unread', body: { store: 'jobs.json', error: 'EACCES', at: Date.now() } }]));
    const fg = await inWindow(() => R1.forget(D1, [s1.v.countFile]));
    ok(st.v && st.v.state === null && (st.v.orphans || []).some((o) => o.name === s1.v.countFile && o.removed === 3) && nt.v && nt.v.notes && nt.v.notes['jobs.json.corrupt-unread'] === 'written' && fg.v && (fg.v.done || []).includes(s1.v.countFile) && !has(D1, s1.v.countFile), 'the record\'s read (it sees a count file left), a store\'s note and a forget — each one child, each through its request file', { st: st.v, nt: nt.v, fg: fg.v });
    ok([st, nt, fg].every((w) => w.starts === 0 && w.calls.length === 1 && w.calls[0].a[6] === '--request') && !fs.readdirSync(L1).some((n) => n.startsWith(LS.REQUEST_PREFIX)), 'no path, no person\'s text and no record rides an argument: every such batch rides its request file, and none is left');
    await R1.settled();
    ok(S0.stats().pending === 0, 'NO WARM CHILD: once its batches are answered the starter holds no child of the remover (one child a batch, gone with its answer)', S0.stats());
    // RED: the remover's start made from THIS process (the road before the starter)
    const RUN = "  const run = (cmd, args, o) => (runImpl ? runImpl(cmd, args, o) : require('./server/child-starter.js').childStarter().run(cmd, args, o));";
    const OLD_ROAD = "  const run = (cmd, args, o) => new Promise((resolve) => { const c = require('child_process').spawn(cmd, args, { env: o.env, stdio: ['ignore', 'pipe', 'ignore'] }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', (code, signal) => resolve({ started: true, code, signal, stdout: out })); });";
    const LSr = MC.load('src/job-logs-sweep.js', anchored(LSsrc, RUN, OLD_ROAD, 'red-hub-start'), 'red-hub-start');
    seedRun(L1, 'jb-0e1a0003', B);
    const r1 = await inWindow(() => LSr.createRemover({ logsDir: L1, workerPath: WORKER }).whole(['jb-0e1a0003']));
    ok(r1.starts >= 1 && r1.calls.length === 0 && !has(L1, 'jb-0e1a0003'), `RED: the same batch started from this process (the road before) is counted — ${r1.starts} start(s) here, none through the starter`);
  }

  // ── §2 THE BYTE BOUND (主开发 r1174 (1)) ──────────────────────────────────────────────────────────────────────────────
  console.log('§2 the batch in the arguments: names only, judged, within ARGV_MAX — else the request file');
  {
    const D2 = path.join(T, 'd2'), L2 = path.join(D2, 'job-logs'); fs.mkdirSync(L2, { recursive: true });
    const WHOLE_ANS = { removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: {} }, SWEEP_ANS = { removed: 0, entries: 0, jobDirs: 0, more: false };
    const standIn = (seen) => (c, a, o) => {
      const i = a.indexOf('--request'); let body = null;
      if (i > 0) { const f = path.join(a[2], a[i + 1]); try { body = JSON.parse(fs.readFileSync(f, 'utf8')); fs.unlinkSync(f); } catch { } }
      seen.push({ a: [...a], body });
      return Promise.resolve({ started: true, code: 0, signal: null, stdout: JSON.stringify(a[5] === 'sweep' ? SWEEP_ANS : WHOLE_ANS) + '\n', stderr: '' });
    };
    const ids = (n) => Array.from({ length: n }, (_, i) => 'jb-' + i.toString(36).padStart(40, '0'));   // 43 bytes a name
    const bytes = (a) => a.reduce((n, s) => n + Buffer.byteLength(s) + 1, 0);
    const drive = async (L) => {
      const seen = [], R = L.createRemover({ logsDir: L2, workerPath: WORKER, runImpl: standIn(seen) });
      await R.whole(ids(744)); await R.whole(ids(745));
      await R.whole(['jb-ok01', '../jb-0e1a', '/etc/x', 'jb-A', 'jb-ok02 rm', 'jb-ok03']);
      await R.sweep({ keep: { named: ['jb-a'], listed: ['jb-a/1'], skeleton: [], held: [] }, cutoff: 1, max: 1, stateFile: path.join(D2, 'jobs-logs-sweep.json'), orphanDir: D2 });
      return seen;
    };
    const seen = await drive(LS);
    const [a744, a745, aOdd, aSw] = seen;
    ok(LS.ARGV_MAX === 32768 && a744 && a744.a[6] === '--names' && a744.a.length - 7 === 744 && bytes(a744.a.slice(7)) <= LS.ARGV_MAX, `a whole-dir batch within ${LS.ARGV_MAX} bytes rides its arguments: 744 names, ${a744 && bytes(a744.a.slice(7))} bytes`);
    ok(a745 && a745.a[6] === '--request' && a745.a.length === 8 && a745.body && a745.body.ids.length === 745, 'one name over the bound: the batch rides its request file — the arguments carry its NAME only', a745 && a745.a.slice(5));
    ok(aOdd && JSON.stringify(aOdd.a.slice(7)) === '["jb-ok01","jb-ok03"]', 'every name is JUDGED before it is handed: a path, a name of another shape, a name with a space — never an argument', aOdd && aOdd.a.slice(7));
    ok(aSw && aSw.a[5] === 'sweep' && aSw.a[6] === '--request' && aSw.body && aSw.body.stateFile === path.join(D2, 'jobs-logs-sweep.json') && aSw.body.keep.listed[0] === 'jb-a/1', 'a sweep\'s keep set and its record\'s path ride the request file');
    ok(seen.every((s) => s.a.slice(5).every((x) => !x.includes('/') && (LS.OPS.includes(x) || x === '--names' || x === '--request' || LS.JOB_NAME.test(x) || LS.REQUEST_NAME.test(x)))) && !fs.readdirSync(L2).some((n) => n.startsWith(LS.REQUEST_PREFIX)), 'after the logs folder, no argument is a path: an op, a flag, a job folder name or the request file\'s name');
    const LSb = MC.load('src/job-logs-sweep.js', anchored(LSsrc, 'const ARGV_MAX = 32 * 1024;', 'const ARGV_MAX = Infinity;', 'red-no-bound'), 'red-no-bound');
    const sb = await drive(LSb);
    ok(sb[1] && sb[1].a[6] === '--names' && bytes(sb[1].a.slice(7)) > 32768, `RED: with no bound the 745-name batch rides its arguments (${sb[1] && bytes(sb[1].a.slice(7))} bytes)`);
    const WH = ".filter((id) => typeof id === 'string' && JOB_NAME.test(id))";
    const LSj = MC.load('src/job-logs-sweep.js', anchored(LSsrc, WH, '.filter((id) => typeof id === \'string\')', 'red-unjudged', { count: 2 }), 'red-unjudged');
    const sj = await drive(LSj);
    ok(sj[2] && sj[2].a.slice(7).includes('/etc/x'), 'RED: names handed unjudged — a path becomes an argument', sj[2] && sj[2].a.slice(7));
  }

  // ── §3 THE COUNT FILE (主开发 r1174 (2)) ──────────────────────────────────────────────────────────────────────────────
  console.log('§3 the count file: temp + rename after every removal, read with its bound; missing or torn = «unknown»');
  {
    const D3 = path.join(T, 'd3'), L3 = path.join(D3, 'job-logs');
    for (let i = 0; i < 400; i++) seedRun(L3, 'jb-0ld0000c', B + i * 1000);
    const cutOf = async (workerPath) => {
      const R = LS.createRemover({ logsDir: L3, timeoutMs: 400, wedgedMs: 3000, workerPath });
      const before = runsOf(L3, 'jb-0ld0000c').length;
      const a = await R.sweep({ keep: { named: ['jb-0ld0000c'], listed: [], skeleton: [], held: [] }, cutoff: Date.now() - 14 * DAY, max: 1000, orphanDir: D3 });
      return { a, gone: before - runsOf(L3, 'jb-0ld0000c').length };
    };
    const { a: cut, gone } = await cutOf(slowOf(WORKER, 3));
    ok(cut.error && /no answer in/.test(cut.error) && cut.partial && cut.partial.removed >= 1 && cut.partial.removed <= gone && gone - cut.partial.removed <= 1, `the REAL remover cut at its bound answers what it removed, read from its count file once its child ended — ${cut.partial && cut.partial.removed} said, ${gone} gone (a kill between a removal and its write may lag one)`, cut);
    // r3301 (B-3dbd unit 2): a .tmp beside the count file after the cut answer is the CUT CHILD's own write, killed between its
    // writeFileSync(.tmp) and its renameSync (a loaded machine makes that likelier) — the count read itself is read only (countOf:
    // it reads and says «cut while it was written»), and a later batch's forget removes the file and its .tmp. So the law is judged
    // on the read (its code writes nothing) and on the file that stays; the child's cut write is said, never a red of the read
    const WKsrc0 = fs.readFileSync(WORKER, 'utf8'), cofA = WKsrc0.indexOf('function countOf('), cofB = cofA < 0 ? -1 : WKsrc0.indexOf('\n}\n', cofA);
    const cofBody = cofA >= 0 && cofB > cofA ? WKsrc0.slice(cofA, cofB) : '';
    const readWrites = cofBody ? (cofBody.match(/\bfs\.(?:write|rename|unlink|rm|mkdir|copy|append|open|truncate)\w*\(/g) || []) : ['(countOf not found)'];
    if (has(D3, cut.countFile + '.tmp')) console.log(`    · the cut child left ${cut.countFile}.tmp — its count write cut by the kill (between its write and its rename); a later batch's forget removes it`);
    ok(!!cut.countFile && has(D3, cut.countFile) && readWrites.length === 0, `the count read is READ ONLY: the file stays until the record that counts it is on disk and a later batch forgets it — the read's own code writes nothing (${readWrites.join(', ') || 'no write, rename or unlink in countOf'})`, { countFile: cut.countFile, readWrites });
    // THE PLACED FORM (主开发 r3301 / r3343): the cut lands INSIDE the child's count write — its SECOND count file's rename held 5 s,
    // past the 400 ms bound — so its .tmp is left every run, without load. The law holds there too: the first count file stays, the
    // read writes nothing, and the .tmp beside it is the cut child's
    const cutWriteOf = (worker) => { const f = path.join(T, `cutwrite-${path.basename(worker)}.cjs`); fs.writeFileSync(f, `const fs = require('fs'); const rm = fs.rmSync, ren = fs.renameSync; const sab = new Int32Array(new SharedArrayBuffer(4)); let n = 0; fs.rmSync = function (...a) { Atomics.wait(sab, 0, 0, 3); return rm.apply(this, a); }; fs.renameSync = function (...a) { if (String(a[0]).endsWith('.tmp') && ++n === 2) Atomics.wait(sab, 0, 0, 5000); return ren.apply(this, a); };\nrequire(${JSON.stringify(worker)});\n`); return f; };
    for (const x of fs.readdirSync(D3)) if (x !== 'job-logs') fs.rmSync(path.join(D3, x), { recursive: true, force: true });   // the first cut's count files gone: this scene's own
    for (let i = 0; i < 400; i++) seedRun(L3, 'jb-0ld0000c', B + i * 1000);
    const { a: cutP } = await cutOf(cutWriteOf(WORKER));
    const tmpP = !!cutP.countFile && has(D3, cutP.countFile + '.tmp');
    let fileRemoved = null; try { fileRemoved = JSON.parse(fs.readFileSync(path.join(D3, cutP.countFile), 'utf8')).removed; } catch { }
    ok(!!cutP.countFile && tmpP && has(D3, cutP.countFile) && readWrites.length === 0 && !!cutP.partial && Number.isInteger(fileRemoved) && cutP.partial.removed === fileRemoved,
      `PLACED: the cut inside the child's second count write leaves its .tmp (${tmpP}) — the first count file stays and IS what the answer read (${cutP.partial && cutP.partial.removed} removed, the file says ${fileRemoved}), the read wrote nothing: the .tmp is the cut child's, never the read's`, { cutP, fileRemoved });
    const WRITE = '  if (!countFile) return false;\n  try { fs.writeFileSync(countFile + \'.tmp\'';
    const noCount = MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, WRITE, '  return false;\n  try { fs.writeFileSync(countFile + \'.tmp\'', 'red-no-count'), 'red-no-count');
    const { a: cutR } = await cutOf(slowOf(noCount, 3));
    ok(cutR.error && !cutR.partial && /missing/.test(cutR.partialUnknown || ''), 'RED: a child that keeps no count — the cut pass\'s count is «unknown» (and never «nothing removed»)', cutR);
    // every way a count file can be missing or torn, the REAL count read (a stand-in only for the cut child)
    const D4 = path.join(T, 'd4'), L4 = path.join(D4, 'job-logs'); fs.mkdirSync(L4, { recursive: true });
    let kind = 'good';
    // r3357 (主开发's should, beside countOf's text pin): the count file as the read will find it — its bytes, inode and mtime, and
    // the same of a cut write's .tmp; a FIFO is never opened (lstat only)
    const snapOf = (f) => { try { const st = fs.lstatSync(f); return st.isFile() ? { b: fs.readFileSync(f).toString('base64'), ino: st.ino, m: st.mtimeMs } : { other: true, ino: st.ino }; } catch { return null; } };
    const snapIn = {}, asLeft = (k) => (snapIn[k] ? { at: snapOf(snapIn[k].f), tmp: snapOf(snapIn[k].f + '.tmp') } : null);
    const changedBy = (k, l) => !snapIn[k] || !l || JSON.stringify({ at: snapIn[k].at, tmp: snapIn[k].tmp }) !== JSON.stringify(l);
    const hybrid = async (c, a, o) => {
      if (a[5] !== 'sweep') return S0.run(c, a, o);
      const req = path.join(a[2], a[7]), body = JSON.parse(fs.readFileSync(req, 'utf8')); fs.unlinkSync(req);
      const f = path.join(body.orphanDir, body.countName);
      if (kind === 'good') fs.writeFileSync(f, JSON.stringify({ removed: 7, entries: 21, jobDirs: 1, at: Date.now() }));
      if (kind === 'cut') fs.writeFileSync(f + '.tmp', '{"removed": 8');
      if (kind === 'big') fs.writeFileSync(f, JSON.stringify({ removed: 7, entries: 21, jobDirs: 0, pad: 'x'.repeat(5000) }));
      if (kind === 'odd') fs.writeFileSync(f, JSON.stringify({ removed: -1, entries: 'many' }));
      if (kind === 'torn') fs.writeFileSync(f, '{"removed": 9, "entr');   // B-574d ruling (c): the count's name over a half record — a power loss with no sync
      if (kind === 'empty') fs.writeFileSync(f, '');   // …or over an empty file
      if (kind === 'fifo') await S0.run('mkfifo', [f], { timeoutMs: 5000 });
      snapIn[kind] = { f, at: snapOf(f), tmp: snapOf(f + '.tmp') };   // r3357: what the read finds (the stand-in's last act before its exit)
      setTimeout(() => o.onLateExit(), 30);
      return { started: true, timedOut: true, overflow: false, code: null, signal: 'SIGKILL', stdout: '', stderr: '' };
    };
    const countRead = async (k, workerPath = WORKER) => { kind = k; const R = LS.createRemover({ logsDir: L4, timeoutMs: 2000, wedgedMs: 3000, workerPath, runImpl: hybrid }); return Promise.race([R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D4 }), sleep(6000).then(() => ({ hung: true }))]); };
    const got = {}, left = {}; for (const k of ['good', 'missing', 'cut', 'big', 'odd', 'fifo', 'torn', 'empty']) { got[k] = await countRead(k); left[k] = asLeft(k); }
    ok(got.good.partial && got.good.partial.removed === 7 && got.good.partial.entries === 21 && got.good.partial.jobDirs === 1 && LS.COUNT_NAME.test(got.good.countFile || ''), 'a whole count file: its count answers the cut pass', got.good);
    const unk = (a, re) => !!a && !a.hung && !a.partial && re.test(a.partialUnknown || '');
    ok(unk(got.missing, /^missing$/) && unk(got.cut, /cut while it was written/) && unk(got.big, /over its bound \(4096 bytes\)/) && unk(got.odd, /not a count/) && unk(got.fifo, /not a file/), 'a count file missing, cut while written, over its bound, not a count, or a FIFO (never waited on) — each answers «unknown», never «nothing removed»', got);
    // r3357: THE READ'S BEHAVIOUR — every kind's file stands after the read as the read found it (the same bytes, inode, mtime), a
    // cut write's .tmp too, and a missing file stays missing: the read writes, renames, removes and makes nothing
    ok(unk(got.torn, /^not a count$/) && unk(got.empty, /^not a count$/), 'B-574d ruling (c) — THE COUNT ASKS NO SYNC (written in the remover child, never on the hub\'s loop): its name over a HALF record or an EMPTY file (a power loss after an unsynced rename) answers «unknown» (not a count), never «nothing removed»; the run folders it counted are gone either way', { torn: got.torn, empty: got.empty });
    const changed = Object.keys(got).filter((k) => changedBy(k, left[k]));
    ok(changed.length === 0 && !!(snapIn.good && snapIn.good.at && snapIn.good.at.b) && !!(snapIn.cut && snapIn.cut.tmp && !snapIn.cut.at) && !!(snapIn.missing && !snapIn.missing.at && !snapIn.missing.tmp), `the count read LEAVES THE FILE AS IT FOUND IT: the count file's bytes, inode and mtime equal before and after the read, a cut write's .tmp too, a missing file still missing (${Object.keys(got).length} kinds; changed: ${changed.join(', ') || 'none'})`, { changed, snapIn, left });
    const COF = '  let o = null; try { o = JSON.parse(rd.text); } catch { }';
    const rewrites = MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, COF, "  try { fs.writeFileSync(f, rd.text + ' '); } catch { }\n" + COF, 'red-read-rewrites'), 'red-read-rewrites');
    const renames = MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, COF, "  try { fs.writeFileSync(f + '.r', rd.text); fs.renameSync(f + '.r', f); } catch { }\n" + COF, 'red-read-renames'), 'red-read-renames');
    const ctl = {}; for (const [n, w] of [['rewrites', rewrites], ['renames', renames]]) { const a = await countRead('good', w); ctl[n] = { a, changed: changedBy('good', asLeft('good')) }; }
    ok(ctl.rewrites.changed && !!(ctl.rewrites.a.partial && ctl.rewrites.a.partial.removed === 7), 'RED: a count read that writes its file back (one byte more) still answers its count — the check sees the file changed', ctl.rewrites);
    ok(ctl.renames.changed && !!(ctl.renames.a.partial && ctl.renames.a.partial.removed === 7), 'RED: a count read that puts the SAME bytes back by a temp and a rename — the bytes alone would not see it; the inode does', ctl.renames);
    const zeroCount = MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, "  if (rd.why) return { count: null, why: rd.why === 'missing' && lst(f + '.tmp') ? 'cut while it was written' : rd.why };", '  if (rd.why) return { count: { removed: 0, entries: 0, jobDirs: 0 } };', 'red-missing-is-zero'), 'red-missing-is-zero');
    const zr = await countRead('missing', zeroCount);
    ok(zr.partial && zr.partial.removed === 0, 'RED: a missing count read as zero says «nothing removed» of a pass that may have removed hundreds', zr);
    // the boot's read of the count files left (round 3's orphans) has the same bound
    fs.writeFileSync(path.join(D4, LS.ORPHAN_PREFIX + 'big-1.json'), JSON.stringify({ removed: 3, entries: 3, jobDirs: 0, pad: 'x'.repeat(5000) }));
    fs.writeFileSync(path.join(D4, LS.ORPHAN_PREFIX + 'fine-1.json'), JSON.stringify({ removed: 2, entries: 4, jobDirs: 0 }));
    const st4 = await LS.createRemover({ logsDir: L4, workerPath: WORKER }).state(path.join(D4, 'jobs-logs-sweep.json'), D4);
    ok((st4.badCounts || []).includes(LS.ORPHAN_PREFIX + 'big-1.json') && (st4.orphans || []).some((o) => o.name === LS.ORPHAN_PREFIX + 'fine-1.json' && o.removed === 2), 'the record\'s read of the count files left reads each with its bound: one over it is not a count (not counted, forgotten)', st4);
  }

  // ── §4 WEDGED → HELD → GOES ON ──────────────────────────────────────────────────────────────────────────────────────
  console.log('§4 a child killed past its bound that has not ended: no second child, HELD, then on at its late exit');
  {
    const D5 = path.join(T, 'd5'), L5 = path.join(D5, 'job-logs'); fs.mkdirSync(L5, { recursive: true });
    const scene = async (L) => {
      let mode = 'timeout', n = 0; const late = [], said = [], at = [];
      const run = (c, a, o) => {
        n++; at.push(Date.now()); const i = a.indexOf('--request'); if (i > 0) { try { fs.unlinkSync(path.join(a[2], a[i + 1])); } catch { } }
        if (mode === 'timeout') { late.push(o.onLateExit); return Promise.resolve({ started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' }); }
        if (mode === 'unknown') { mode = 'answer'; return Promise.resolve({ unknown: true, why: 'the starter ended' }); }
        return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify({ removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: {}, more: false }) + '\n' });
      };
      const R = L.createRemover({ logsDir: L5, log: (l) => said.push(l), timeoutMs: 100, wedgedMs: 150, runImpl: run });
      const cap = (p) => Promise.race([p, sleep(500).then(() => ({ hung: true }))]);
      const a1 = await cap(R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D5 })), a2 = await cap(R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D5 }));
      const heldAt = { n, held: R.held(), heldSaid: said.filter((l) => /HELD/.test(l)).length };
      mode = 'answer'; if (late[0]) late[0]();
      const a3 = await cap(R.whole(['jb-0e1a0005']));
      const after = { n, held: R.held(), ended: said.some((l) => /its last child has ended — removals go on/.test(l)) };
      mode = 'unknown'; const t0 = n; const a4 = await cap(R.whole(['jb-0e1a0006']));
      return { a1, a2, a3, a4, heldAt, after, unknownStarts: n - t0, gapMs: at.length >= 2 ? at[at.length - 1] - at[at.length - 2] : 0 };
    };
    const s = await scene(LS);
    ok(s.a1.error && /no answer in/.test(s.a1.error) && /has not ended/.test(s.a1.partialUnknown || '') && s.a2.held && s.heldAt.n === 1 && s.heldAt.held && s.heldAt.heldSaid === 1, 'a sweep past its bound answers its timeout (its count «unknown» while its child has not ended); NO second child — the next batch answers HELD at once, said ONCE', s);
    ok(!s.after.held && !s.a3.error && s.after.n === 2 && s.after.ended, 'at the starter\'s late exit the remover goes on (a new child answers), and says so', s.after);
    ok(!s.a4.error && s.unknownStarts === 2 && s.gapMs >= 140, `a run the starter cannot answer (its process failed) hears no end: a whole batch is queued again ONCE, after ${s.gapMs} ms (≥ the wedged wait — that child stops itself between two run dirs)`, s);
    const WG = '    if (timedOut && !it.ended) wedge(it, false); else if (unknown) wedge(it, true);';
    const r1 = await scene(MC.load('src/job-logs-sweep.js', anchored(LSsrc, WG, '    if (unknown) wedge(it, true);', 'red-no-wedge'), 'red-no-wedge'));
    ok(!(r1.a2 && r1.a2.held) || r1.heldAt.n !== 1, 'RED: a timeout that does not hold the remover starts a second child beside the killed one', r1.heldAt);
    const LSm = MC.load('src/job-logs-sweep.js', anchored(LSsrc, WG, '    if (timedOut && !it.ended) wedge(it, false);', 'red-no-grace'), 'red-no-grace');
    // the flake census round 2 (主开发 r4456, its find at this leg): the RED control read a CLOCK — the mutant's restart «< 140 ms» after an
    // unknown run — and a loop held 140 ms on a loaded box (GC, a busy test machine) made it read the mutant as waiting, with nothing
    // wrong. It is restated on a COUNT: the wedged wait PLANTED long (60 s: no box is that late), the fixed remover starts the batch ONCE
    // and holds; the mutant starts it again at once: TWICE. The same scene under a PLACED hold (the unknown start holds the loop 160 ms)
    // reads the count the same, and shows the old clock reading wrong (the find, placed). Each scene waits on its fact, never a span.
    let uScenes = 0;
    const unknownScene = async (L, { wedgedMs = 60000, hold = 0 } = {}) => {
      let mode = 'unknown', n = 0; const at = [];
      const run = (c, a) => {
        n++; at.push(Date.now()); const i = a.indexOf('--request'); if (i > 0) { try { fs.unlinkSync(path.join(a[2], a[i + 1])); } catch { } }
        if (mode === 'unknown') { mode = 'answer'; if (hold) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hold); return Promise.resolve({ unknown: true, why: 'the starter ended' }); }
        return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify({ removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: {}, more: false }) + '\n' });
      };
      const Du = path.join(T, 'd5u-' + (++uScenes)), Lu = path.join(Du, 'job-logs'); fs.mkdirSync(Lu, { recursive: true });
      const R = L.createRemover({ logsDir: Lu, log: () => { }, timeoutMs: 100, wedgedMs, runImpl: run });
      // the wait is ON THE FACT the leg judges (主开发 r4340 law 1): the batch answered (it was started again), or the remover HELD after
      // its one start — whichever comes first; a generous bound whose expiry is said by name (never a silent read of whatever is there)
      const fact = (async () => { for (let i = 0; i < 1000; i++) { if (n >= 1 && R.held()) return { hung: true }; await sleep(5); } return { expired: true }; })();
      const a = await Promise.race([R.whole(['jb-0e1a0007']).then(() => ({ answered: true })), fact]);
      if (a && a.expired) console.log('  HARNESS: the unknown-run scene\'s bound (5 s) expired with neither fact — the remover neither held nor answered');
      return { starts: n, hung: !!(a && a.hung), expired: !!(a && a.expired), held: R.held(), gapMs: at.length >= 2 ? at[1] - at[0] : null };
    };
    const u1 = await unknownScene(LS), u0 = await unknownScene(LSm);
    ok(u1.starts === 1 && u1.hung && u0.starts === 2 && !u0.hung, 'RED (by a COUNT): after an unknown run the remover waits its wedged wait (the batch started ONCE, held); with no wait the batch is started again at once (TWICE) — the wait planted at 60 s, no clock read', { fixed: u1, mutant: u0 });
    const u1h = await unknownScene(LS, { hold: 160 }), u0h = await unknownScene(LSm, { hold: 160 });
    ok(u1h.starts === 1 && u1h.hung && u0h.starts === 2 && !u0h.hung, 'PLACED: the loop held 160 ms at the unknown start — the count reads the same (once held; twice at once)', { fixed: u1h, mutant: u0h });
    const p0 = await unknownScene(LSm, { wedgedMs: 150, hold: 160 });
    ok(p0.starts === 2 && p0.gapMs !== null && p0.gapMs >= 140, `PLACED (the find): with the release's 150 ms wedged wait and the same 160 ms hold, the mutant's restart gap reads ${p0.gapMs} ms — the old clock reading («< 140 ms») called it waiting: a clock, so the leg is a count now`, p0);
  }

  // ── §5 THE MEASURE ──────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('§5 the measure: the main loop\'s hold across ONE start');
  {
    const trivial = path.join(T, 'trivial.cjs'); fs.writeFileSync(trivial, 'process.exit(0);\n');
    const holdOf = (f) => { const t = performance.now(); f(); return performance.now() - t; };
    const forkHold = [], starterHold = [];
    for (let i = 0; i < 7; i++) {
      let c; forkHold.push(holdOf(() => { c = CP.fork(trivial, [], { execArgv: ['--max-old-space-size=96'], env: PATH_ONLY, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); }));
      await new Promise((r) => c.once('exit', r));
      let p; starterHold.push(holdOf(() => { p = S0.run(process.execPath, ['--max-old-space-size=96', trivial], { timeoutMs: 10000, capture: true, wholeEnv: true, env: PATH_ONLY }); }));
      await p;
    }
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`  MEASURE (B-323e; this process ${Math.round(process.memoryUsage().rss / 1048576)} MB RSS, 7 starts each): the loop's hold across one start — a fork from this process (the road before) median ${med(forkHold).toFixed(3)} ms (max ${Math.max(...forkHold).toFixed(3)}); through the starter median ${med(starterHold).toFixed(3)} ms (max ${Math.max(...starterHold).toFixed(3)})`);
    ok(med(starterHold) < med(forkHold), 'THE MEASURE: a start through the starter holds this process\'s loop less than a fork from it (the fork waits for its child\'s exec; the starter\'s is one line on a pipe)');
  }

  // ── §6 ITS HUB, BY WHAT THE HUB HANDED ─────────────────────────────────────────────────────────────────────────────
  console.log('§6 born of the hub or of a process the hub started — else the batch is refused');
  {
    const D6 = path.join(T, 'd6'), L6 = path.join(D6, 'job-logs');
    for (const id of ['jb-0e1a0006', 'jb-0e1a0007', 'jb-0e1a0008', 'jb-0e1a0009']) seedRun(L6, id, B);
    const direct = (hub, id, wp = WORKER, once = true) => S0.run(process.execPath, [wp, L6, String(hub), ...(once ? ['--once', 'whole', '--names', id] : [])], { timeoutMs: 10000, capture: true, wholeEnv: true, env: PATH_ONLY });
    const wrong = await direct(process.ppid, 'jb-0e1a0006'), right = await direct(process.pid, 'jb-0e1a0007'), bare = await direct(process.pid, 'jb-0e1a0009', WORKER, false);
    ok(wrong.code === 0 && /refused by its parent check/.test(String(wrong.stdout)) && has(L6, 'jb-0e1a0006'), 'a child handed a pid that is neither its parent nor its parent\'s parent refuses its batch (nothing read, nothing removed; its one line names the door — r1283 (4))', wrong);
    ok(right.code === 0 && /"gone":\["jb-0e1a0007"\]/.test(right.stdout) && !has(L6, 'jb-0e1a0007'), 'the same batch, handed the hub\'s own pid (the starter\'s parent), runs', right);
    ok(bare.code !== 0 && /runs only as the one-batch child/.test(bare.stderr) && has(L6, 'jb-0e1a0009'), 'the worker THROWS without --once (never in the hub\'s own process)', { code: bare.code });
    const BORN = 'const bornOfHub = HUB > 1 && BORN > 1 && (BORN === HUB || parentOf(BORN) === HUB);';
    const noCheck = MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, BORN, 'const bornOfHub = true;', 'red-no-born'), 'red-no-born');
    const wr = await direct(process.ppid, 'jb-0e1a0008', noCheck);
    ok(!has(L6, 'jb-0e1a0008') && /"gone"/.test(wr.stdout), 'RED: with no check of what the hub handed, a child of another process runs its batch');
  }

  // ── §7 COUNTED ONCE ────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('§7 counted once: the count file\'s name in the record beside its count, forgotten by the next pass; a stop\'s count counted by the next engine');
  {
    const D7 = path.join(T, 'd7'), L7 = path.join(D7, 'job-logs'), logs7 = [];
    for (let i = 0; i < 30; i++) seedRun(L7, 'jb-0ld00007', B + i * 1000);
    const J7 = engineAt(D7, logs7, { max: 10 });
    const p1 = await J7.sweepLogs({ why: 'boot' }); await J7.logsSettled();
    const cf1 = p1 && p1.countFile, st1 = J7._logsState || {};
    ok(p1 && p1.removed === 10 && cf1 && (st1.orphansCounted || []).includes(cf1) && has(D7, cf1) && st1.catchUp && st1.catchUp.removed === 10, 'a pass\'s count file is named in the record BESIDE its count (the catch-up\'s 10)', { p1, oc: st1.orphansCounted });
    const p2 = await J7.sweepLogs({ why: 'catch-up' }); await J7.logsSettled();
    const st2 = J7._logsState || {};
    ok(p2 && p2.removed === 10 && !has(D7, cf1) && !(st2.orphansCounted || []).includes(cf1) && (st2.orphansCounted || []).includes(p2.countFile) && st2.catchUp && st2.catchUp.removed === 20, 'the next pass\'s child forgets it first (once the record naming it is on disk) — its name leaves the record', { oc: st2.orphansCounted, cu: st2.catchUp });
    J7.shutdown(); await sleep(30);
    const logs8 = [], J8 = engineAt(D7, logs8, { max: 10 });
    await J8.sweepLogs({ why: 'boot' }); await J8.logsSettled();
    ok(logs8.some((l) => /catch-up done: 30 run dir\(s\) removed/.test(l)) && !logs8.some((l) => /a remover whose hub ended/.test(l)) && !has(D7, p2.countFile), 'a restart between its count and its forget never counts it twice: done says 30 of 30', logs8.filter((l) => /job-logs/.test(l)));
    J8.shutdown();
    // a STOP mid-batch: the starter holds that child (it ends at the hub's exit); whatever it removed is counted ONCE by the next engine
    const stopScene = async (workerPath, tag) => {
      const D9 = path.join(T, 'd9-' + tag), L9 = path.join(D9, 'job-logs'), logs9 = [];
      for (let i = 0; i < 40; i++) seedRun(L9, 'jb-0ld00009', B + i * 1000);
      const J9 = engineAt(D9, logs9, { max: 20, workerPath });
      J9.sweepLogs({ why: 'boot' });
      const mid = await until(() => runsOf(L9, 'jb-0ld00009').length <= 37, 8000, 2);
      J9.shutdown();
      await until(() => S0.stats().pending === 0, 8000, 5);   // that child's own end (its batch: 20 at most)
      const gone = 40 - runsOf(L9, 'jb-0ld00009').length;
      const logs10 = [], J10 = engineAt(D9, logs10, { max: 20 });
      const p10 = await J10.sweepLogs({ why: 'boot' }); await J10.logsSettled(); J10.shutdown();
      const m = logs10.map((l) => /(?:a remover whose hub ended|a clean-up pass that finished before its record was written) removed (\d+) run dir\(s\)/.exec(l)).find(Boolean);   // r1283 (5): a batch that finished after the stop says so
      return { mid, gone, said: m ? Number(m[1]) : null, left: fs.readdirSync(D9).filter((n) => n.startsWith(LS.ORPHAN_PREFIX) && n !== (p10 && p10.countFile)) };   // the next engine's own pass keeps ITS count file until its next pass
    };
    const sc = await stopScene(slowOf(WORKER, 5), 'real');
    ok(sc.mid && sc.gone >= 3 && sc.said === sc.gone && !sc.left.length, `a stop mid-batch keeps its count: ${sc.gone} removed by that batch, the next engine counts ${sc.said} — once, and forgets the file`, sc);
    const OUT = "  try { process.stdout.write(JSON.stringify(out) + '\\n'); } catch { }";
    const drops = MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, OUT, "  if (countFile) for (const f of [countFile, countFile + '.tmp']) { try { fs.unlinkSync(f); } catch { } }\n" + OUT, 'red-drops-count'), 'red-drops-count');
    const sr = await stopScene(slowOf(drops, 5), 'red');
    ok(sr.said !== sr.gone, `RED: a child that drops its count file at its own end — a batch that ends after the stop is counted by nobody (${sr.gone} removed, ${sr.said} said)`, sr);
  }

  // ── §8 THE FRESH READ'S FINDS, CURED ───────────────────────────────────────────────────────────────────────────────
  console.log('§8 the fresh read\'s finds: an end heard with its timeout, an end never said, an end with no answer, a stuck write, the record on disk');
  {
    const D8 = path.join(T, 'd8'), L8 = path.join(D8, 'job-logs'); fs.mkdirSync(L8, { recursive: true });
    const ANS = { removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: {}, more: false };
    const dropReq = (a) => { const i = a.indexOf('--request'); if (i > 0) { try { fs.unlinkSync(path.join(a[2], a[i + 1])); } catch { } } };
    const cap = (p) => Promise.race([p, sleep(800).then(() => ({ hung: true }))]);
    // find 1: the starter's timeout and exit lines in ONE read — onTimeout and onLateExit both run before the timedOut answer
    const oneRead = async (L) => {
      let n = 0;
      const run = (c, a, o) => { n++; dropReq(a);
        if (a[5] === 'count') return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify({ count: { removed: 2, entries: 4, jobDirs: 0 } }) + '\n' });
        if (n === 1) { o.onTimeout(0); o.onLateExit(); return Promise.resolve({ started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' }); }
        return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify(ANS) + '\n' }); };
      const R = L.createRemover({ logsDir: L8, timeoutMs: 100, wedgedMs: 300, runImpl: run });
      const a1 = await cap(R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D8 })), a2 = await cap(R.whole(['jb-0e1a0081']));
      return { a1, a2, held: R.held(), n };
    };
    const o1 = await oneRead(LS);
    ok(o1.a1.partial && o1.a1.partial.removed === 2 && !o1.a2.error && !o1.held && o1.n === 3, 'find 1: an end heard WITH its timeout (one read of the starter\'s pipe) is kept — the cut sweep\'s count is read at once and the remover is never held', o1);
    const o1r = await oneRead(MC.load('src/job-logs-sweep.js', anchored(LSsrc, '    if (wedged !== it) { it.ended = true; return; }', '    if (wedged !== it) return;', 'red-end-lost'), 'red-end-lost'));
    ok(!o1r.a1.partial || o1r.held || !!o1r.a2.held, 'RED: an end heard before the wedge dropped — the remover HELD for good', o1r);
    // find 2: a starter that fails while a killed child is awaited never says its end — judged by the identity read at its timeout
    const unsaid = async (L, pid) => {
      let n = 0; const said = [];
      const run = (c, a, o) => { n++; dropReq(a); if (n === 1) { o.onTimeout(pid); return Promise.resolve({ started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' }); } return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify(ANS) + '\n' }); };
      const R = L.createRemover({ logsDir: L8, log: (l) => said.push(l), timeoutMs: 100, wedgedMs: 150, runImpl: run });
      const a1 = await cap(R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D8 })), a2 = await cap(R.whole(['jb-0e1a0082']));
      return { a1, a2, n, ended: said.some((l) => /has ended — removals go on/.test(l)) };
    };
    const gone2 = await unsaid(LS, 4194301), live2 = await unsaid(LS, process.pid);
    ok(/has not ended/.test(gone2.a1.partialUnknown || '') && !gone2.a2.error && !gone2.a2.held && gone2.n === 2, 'find 2: a killed child whose end was never said and whose pid is gone — at the next ask the remover goes on (a new child answers)', gone2);
    ok(!!live2.a2.held && live2.n === 1, 'CONTROL: the same while that pid still runs as the same process — HELD (no second child beside it)', live2);
    const g2r = await unsaid(MC.load('src/job-logs-sweep.js', anchored(LSsrc, '      if (endedUnheard(wedged)) { lateExit(wedged); return; }   // find 2: its end was never said (a starter that failed meanwhile)\n', '', 'red-never-judged'), 'red-never-judged'), 4194301);
    ok(!!g2r.a2.held, 'RED: no judge of an end never said — HELD for the hub\'s life', g2r);
    // find 4: a sweep child that ENDS with no answer (a crash, its heap) — its count read at once, never «nothing removed»
    const D4b = path.join(T, 'd8b'), L4b = path.join(D4b, 'job-logs');
    for (let i = 0; i < 30; i++) seedRun(L4b, 'jb-0ld0008b', B + i * 1000);
    const crashW = path.join(T, 'crash-worker.cjs');
    fs.writeFileSync(crashW, `const fs = require('fs'); const rm = fs.rmSync; let n = 0; fs.rmSync = function (...a) { const r = rm.apply(this, a); if (++n === 5) process.exit(3); return r; };\nrequire(${JSON.stringify(WORKER)});\n`);
    const crash = async (L) => { const before = runsOf(L4b, 'jb-0ld0008b').length; const a = await L.createRemover({ logsDir: L4b, workerPath: crashW }).sweep({ keep: { named: ['jb-0ld0008b'], listed: [], skeleton: [], held: [] }, cutoff: Date.now() - 14 * DAY, max: 1000, orphanDir: D4b }); return { a, gone: before - runsOf(L4b, 'jb-0ld0008b').length }; };
    const c4 = await crash(LS);
    ok(/exited \(3\) with no answer/.test(c4.a.error || '') && c4.a.partial && c4.a.partial.removed >= c4.gone - 1 && c4.a.partial.removed <= c4.gone, `find 4: a sweep child that ends with no answer — what it removed is read from its count file at once (${c4.a.partial && c4.a.partial.removed} said, ${c4.gone} gone)`, c4);
    const c4r = await crash(MC.load('src/job-logs-sweep.js', anchored(LSsrc, 'with no answer`, { ended: true });', 'with no answer`);', 'red-no-count-read'), 'red-no-count-read'));
    ok(!c4r.a.partial && !c4r.a.partialUnknown, 'RED: the same answered with neither a count nor «not known» — the pass would say «nothing removed»', c4r.a);
    // find 6: a request file write the logs folder never answers — none is started beside it
    const stuck = async (L) => {
      const realWF = fs.promises.writeFile, realRN = fs.promises.rename; let calls = 0, release = null, released = null, renamedR = null;
      const renamed = new Promise((r) => { renamedR = r; });   // the released write's request file renamed into place: its write's last step
      fs.promises.rename = function (...a) { const pr = realRN.apply(fs.promises, a); if (released && String(a[0]).endsWith('.tmp')) pr.then(() => renamedR(), () => renamedR()); return pr; };
      fs.promises.writeFile = function (...a) { calls++; if (calls === 1) return new Promise((r, j) => { release = () => { released = realWF.apply(fs.promises, a).then(r, j); }; }); return realWF.apply(fs.promises, a); };
      try {
        const R = L.createRemover({ logsDir: L8, timeoutMs: 150, runImpl: (c, a) => { dropReq(a); return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify(ANS) + '\n' }); } });
        const s1 = await R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D8 }), s2 = await R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D8 });
        // r3301 (B-3dbd unit 2): «once it returns» is a FACT — the released write's own promise settled, then one turn for the remover's
        // own handler — never 50 ms (on the pod the released write took longer and the third batch was rightly refused)
        const atS2 = calls; if (release) release(); if (released) { await released.catch(() => { }); await Promise.race([renamed, sleep(5000)]); } await new Promise((r) => setImmediate(r));   // the request write is mkdir + writeFile + rename: it RETURNED once its rename settled
        const s3 = await R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D8 });
        return { s1, s2, s3, atS2, calls };
      } finally { fs.promises.writeFile = realWF; fs.promises.rename = realRN; }
    };
    const w6 = await stuck(LS);
    ok(/was not written in/.test(w6.s1.error || '') && /has not answered its last request file write/.test(w6.s2.error || '') && w6.atS2 === 1 && !w6.s3.error && w6.calls === 2, 'find 6: a request file write past its bound that has not returned — the next batch starts no second write beside it; once it returns, the batches go on', w6);
    const w6r = await stuck(MC.load('src/job-logs-sweep.js', anchored(LSsrc, "      if (writing) return { notStarted: true, error: 'the logs folder has not answered its last request file write — nothing is started until it does' };\n", '', 'red-second-write'), 'red-second-write'));
    ok(w6r.atS2 === 2, `RED: no guard — a second write is parked beside the stuck one (${w6r.atS2} writes asked)`);
    // find 5: the record NOT on disk forgets nothing · find 7: a pass said at once is said only once its record is on disk
    const JSsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
    const SW = require(path.join(ROOT, 'src/store-writer.js')).storeWriter();
    const notOnDisk = async (JM, tag) => {
      const D = path.join(T, 'd8e-' + tag), L = path.join(D, 'job-logs'), logs = [];
      for (let i = 0; i < 30; i++) seedRun(L, 'jb-0ld0008e', B + i * 1000);
      fs.mkdirSync(path.join(D, 'bin'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), path.join(D, 'bin', 'job-wrapper.js'));
      const J = new JM({ dataDir: D, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), memoryRungs: [], logsSweep: { bootDelayMs: 3600e3, restFactor: 1, gapMs: 3600e3, max: 10 } }); J.init(); engines.push(J);
      const p1 = await J.sweepLogs({ why: 'boot' }); await J.logsSettled();
      const realD = SW.durable; SW.durable = function (f, ...a) { return String(f).endsWith('jobs-logs-sweep.json') ? Promise.resolve(false) : realD.call(this, f, ...a); };
      let p2; try { p2 = await J.sweepLogs({ why: 'catch-up' }); await J.logsSettled(); } finally { SW.durable = realD; }
      const kept = has(D, p1.countFile) && (J._logsState.orphansCounted || []).includes(p1.countFile);
      J.shutdown(); return { kept, p1: p1 && p1.countFile, p2: p2 && p2.removed };
    };
    const f5 = await notOnDisk(JobManager, 'real');
    ok(f5.kept && f5.p2 === 10, 'find 5: a pass whose record could not be made durable hands no forget — the count file and its name stay until a record holding it is on disk', f5);
    const JMr = MC.load('src/jobs.js', anchored(JSsrc, 'forget: onDisk === false ? [] : counted,', 'forget: counted,', 'red-forget-blind'), 'red-forget-blind').JobManager;
    const f5r = await notOnDisk(JMr, 'red');
    ok(!f5r.kept, 'RED: the forget handed whatever durable() answered — a count file gone while no record on disk holds its count', f5r);
    const sayScene = async (JM, tag) => {
      const D = path.join(T, 'd8f-' + tag), L = path.join(D, 'job-logs'); let atSay = null;
      for (let i = 0; i < 60; i++) seedRun(L, 'jb-0ld0008f', B + i * 1000);
      fs.mkdirSync(path.join(D, 'bin'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), path.join(D, 'bin', 'job-wrapper.js'));
      const J = new JM({ dataDir: D, broadcast() { }, notifyUser() { return { ok: true }; }, memoryRungs: [], logsSweep: { bootDelayMs: 3600e3, restFactor: 1, gapMs: 3600e3 },
        log: (...a) => { const l = a.join(' '); if (/job-logs: 60 run dir\(s\) past the 14-day retention/.test(l)) { try { atSay = JSON.parse(fs.readFileSync(path.join(D, 'jobs-logs-sweep.json'), 'utf8')); } catch { atSay = false; } } } });
      J.init(); engines.push(J);
      const p = await J.sweepLogs({ why: 'boot' }); await J.logsSettled(); J.shutdown();
      return { said: atSay !== null, onDisk: !!(atSay && (atSay.orphansCounted || []).includes(p && p.countFile)), removed: p && p.removed };
    };
    const f7 = await sayScene(JobManager, 'real');
    ok(f7.said && f7.onDisk && f7.removed === 60, 'find 7: a pass said at once (60 removed) is said only once the record holding its count file is ON DISK — a kill between never says it twice', f7);
    const f7r = await sayScene(MC.load('src/jobs.js', anchored(JSsrc, 'sayNow.push(LS.words.pass(ans));', 'this.d.log(LS.words.pass(ans));', 'red-said-first'), 'red-said-first').JobManager, 'red');
    ok(f7r.said && !f7r.onDisk, 'RED: said before the save — the record on disk at the line does not hold it', f7r);
  }
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + ((e && e.stack) || e));
} finally {
  for (const jm of engines) { try { jm.shutdown(); } catch { } }
  try { S0.closePipe(); } catch { }
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
