#!/usr/bin/env node
// test-job-logs-remover-bounds — B-323e's follow (主开发 r1283, round wh2k8sbvj; lane bl-jobs): the job-logs remover's BOUNDS and
// WORDS, each law with its RED (an anchored mutant copy). §1 no /proc is no evidence (a wedged child stays HELD); §2 a request file
// over its bound, a FIFO in its place, a name that does not match, a cut-short keep set — each removes NOTHING; §3 the sweep removes
// only its own remover's request files or ones older than a batch's bound; §4 a cut that removed nothing says zero; §5 the parent
// check's refusal names its door; §6 a count file's name rides the SAME save as its count (the catch-up's opening one); §7 the words
// of the next start for each kind of count file left. In-process + the REAL starter process and the REAL worker (scripts/
// test-job-logs-remover-start.mjs holds the transport's own laws and THE MEASURE).
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
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jlrb-'));
const CS = require(path.join(ROOT, 'src/server/child-starter.js'));
const LS = require(path.join(ROOT, 'src/job-logs-sweep.js'));
const WORKER = path.join(ROOT, 'src/job-logs-sweep-worker.js');
const S0 = CS.createChildStarter();
CS.setChildStarter(S0);
const MC = mutantCopies('job-logs-remover-bounds', ROOT);
const LSsrc = fs.readFileSync(path.join(ROOT, 'src/job-logs-sweep.js'), 'utf8'), WKsrc = fs.readFileSync(WORKER, 'utf8'), JSsrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
const PATH_ONLY = { PATH: process.env.PATH || '/usr/bin:/bin' };
const deadStamp = () => ({ pid: 4194301, starttime: 1, bootId: 'another-boot-of-this-machine', startedAt: 1 });
const seedRun = (logs, id, ts, ageMs = 30 * DAY) => {
  const d = path.join(logs, id, String(ts)); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'pid.json'), JSON.stringify(deadStamp())); fs.writeFileSync(path.join(d, 'current.log'), 'line\n');
  const t = (Date.now() - ageMs) / 1000; for (const f of fs.readdirSync(d)) fs.utimesSync(path.join(d, f), t, t);
  return d;
};
const runsOf = (logs, id) => { try { return fs.readdirSync(path.join(logs, id)).filter((n) => /^\d+$/.test(n)); } catch { return []; } };
const has = (...p) => fs.existsSync(path.join(...p));
const B = Date.now() - 50 * DAY, KEEP0 = { named: [], listed: [], skeleton: [], held: [] };
const cap = (p) => Promise.race([p, sleep(800).then(() => ({ hung: true }))]);
const dropReq = (a) => { const i = a.indexOf('--request'); if (i > 0) { try { fs.unlinkSync(path.join(a[2], a[i + 1])); } catch { } } };
// the REAL worker (or a mutant copy) started by the starter with a batch written by hand
const runW = (wp, logsDir, tail, { hub = process.pid, timeoutMs = 10000 } = {}) => S0.run(process.execPath, ['--max-old-space-size=96', wp, logsDir, String(hub), '--once', ...tail], { timeoutMs, capture: true, maxBuffer: 8 * 1048576, wholeEnv: true, env: PATH_ONLY });
const ansOf = (r) => { const ls = String((r && r.stdout) || '').split('\n').filter(Boolean); try { return JSON.parse(ls[ls.length - 1]); } catch { return null; } };
const engines = [];
const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
const engineAt = (JM, dir, logs, sweep = {}, onLog = null) => {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), path.join(dir, 'bin', 'job-wrapper.js'));
  const jm = new JM({ dataDir: dir, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => { const l = a.join(' '); logs.push(l); if (onLog) onLog(l); }, memoryRungs: [], logsSweep: { bootDelayMs: 3600e3, restFactor: 1, gapMs: 3600e3, ...sweep } });
  jm.init(); engines.push(jm); return jm;
};

try {
  await S0.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start, made once

  // ── §1 NO /proc IS NO EVIDENCE (r1283 (1)) ──────────────────────────────────────────────────────────────────────────
  console.log('§1 no /proc is no evidence: a killed child whose end was never said stays awaited (HELD) on a machine with no /proc');
  {
    const D1 = path.join(T, 'd1'), L1 = path.join(D1, 'job-logs'), NOPROC = path.join(T, 'a-root-with-no-proc'); fs.mkdirSync(L1, { recursive: true }); fs.mkdirSync(NOPROC);
    const held = async (L, procRoot) => {
      let n = 0;
      const run = (c, a, o) => { n++; dropReq(a); if (n === 1) { o.onTimeout(4194301); return Promise.resolve({ started: true, timedOut: true, code: null, signal: 'SIGKILL', stdout: '', stderr: '' }); } return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify({ removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: {} }) + '\n' }); };
      const R = L.createRemover({ logsDir: L1, timeoutMs: 100, wedgedMs: 150, runImpl: run, ...(procRoot ? { procRoot } : {}) });
      await cap(R.sweep({ keep: KEEP0, cutoff: 1, max: 1, orphanDir: D1 }));
      const a2 = await cap(R.whole(['jb-0e1a00b1'])); R.stop();
      return { held: !!(a2 && a2.held), n };
    };
    const noProc = await held(LS, NOPROC), withProc = await held(LS, null);
    ok(noProc.held && noProc.n === 1, 'a root that holds no /proc: the killed child\'s end is never said and its pid reads nowhere — HELD, no second child beside it (the starter\'s late exit the only release)', noProc);
    ok(!withProc.held && withProc.n === 2, 'CONTROL: /proc readable and that pid gone — the remover goes on', withProc);
    const red = await held(MC.load('src/job-logs-sweep.js', anchored(LSsrc, 'if (!PI.hasProc(procOpts)) return false; ', '', 'red-noproc-gone'), 'red-noproc-gone'), NOPROC);
    ok(!red.held && red.n === 2, 'RED: no /proc read as «gone» — a second child starts beside the wedged one', red);
  }

  // ── §2 A REQUEST THAT CANNOT BE READ WHOLE REMOVES NOTHING (r1283 (7)) ───────────────────────────────────────────────
  console.log('§2 a request over its bound, a FIFO in its place, a name that does not match, a cut-short keep set — each removes NOTHING');
  {
    const ID = 'jb-0ld000b2';
    let k = 0;
    const scene = () => { const D = path.join(T, `d2-${++k}`), L = path.join(D, 'job-logs'); for (let i = 0; i < 3; i++) seedRun(L, ID, B + i * 1000); return { D, L }; };
    const req = (D, extra = {}) => ({ op: 'sweep', keep: { named: [ID], listed: [], skeleton: [], held: [] }, cutoff: Date.now() - 14 * DAY, max: 1000, orphanDir: D, countName: `${LS.ORPHAN_PREFIX}b2-${k}.json`, ...extra });
    const NAME = (n) => `.jobs-remover-request-aa1-${n}.json`;
    // a. over its bound: a request that WOULD remove, one byte-chunk past REQUEST_MAX
    const over = async (wp) => { const { D, L } = scene(); const body = JSON.stringify(req(D)); const pad = 'x'.repeat(LS.REQUEST_MAX - body.length + 4096); fs.writeFileSync(path.join(L, NAME(1)), JSON.stringify(req(D, { pad }))); const r = await runW(wp, L, ['sweep', '--request', NAME(1)]); return { a: ansOf(r), left: runsOf(L, ID).length, file: has(L, NAME(1)) }; };
    const oa = await over(WORKER);
    ok(oa.a && /its request file: over its bound/.test(oa.a.error || '') && oa.left === 3 && !oa.file, 'a request over its bound: refused, NOTHING removed, the file removed', oa);
    const oar = await over(MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, 'rd = bounded(f, S.REQUEST_MAX);', 'rd = bounded(f, Infinity);', 'red-request-unbounded'), 'red-request-unbounded'));
    ok(oar.left < 3, `RED: a request read past its bound is RUN (${3 - oar.left} removed)`, oar);
    // b. a FIFO in its place: never waited on
    const fifo = async (wp) => { const { D, L } = scene(); await S0.run('mkfifo', [path.join(L, NAME(2))], { timeoutMs: 5000 }); const r = await runW(wp, L, ['sweep', '--request', NAME(2)], { timeoutMs: 1500 }); return { a: ansOf(r), timedOut: !!r.timedOut, left: runsOf(L, ID).length }; };
    const fa = await fifo(WORKER);
    ok(fa.a && /its request file: not a file/.test(fa.a.error || '') && !fa.timedOut && fa.left === 3, 'a FIFO in the request\'s place: refused at once (never waited on), NOTHING removed', fa);
    const far = await fifo(MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, 'fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK', 'fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW', 'red-fifo-waits'), 'red-fifo-waits'));
    ok(far.timedOut, 'RED: opened without O_NONBLOCK — the child waits on the FIFO until its bound', far);
    // c. a name that does not match: a valid request one folder up, named by a path
    const nameOf = async (wp) => { const { D, L } = scene(); fs.writeFileSync(path.join(D, 'planted.json'), JSON.stringify(req(D))); const r = await runW(wp, L, ['sweep', '--request', '../planted.json']); return { a: ansOf(r), left: runsOf(L, ID).length }; };
    const na = await nameOf(WORKER);
    ok(na.a && /its batch could not be read/.test(na.a.error || '') && na.left === 3, 'a request named by anything but the remover\'s own name shape (a path up one folder): refused, NOTHING removed', na);
    const nar = await nameOf(MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, ' || !S.REQUEST_NAME.test(rest[0])', '', 'red-any-name'), 'red-any-name'));
    ok(nar.left < 3, `RED: a request opened by any name — a file outside the logs folder is RUN (${3 - nar.left} removed)`, nar);
    // d. a cut-short keep set: the request that keeps every run, cut mid-write
    const cutShort = async (wp) => { const { D, L } = scene(); const keep = { named: [ID], listed: runsOf(L, ID).map((r) => `${ID}/${r}`), skeleton: [], held: [] }; const text = JSON.stringify(req(D, { keep })); fs.writeFileSync(path.join(L, NAME(4)), text.slice(0, Math.floor(text.length * 0.6))); const r = await runW(wp, L, ['sweep', '--request', NAME(4)]); return { a: ansOf(r), left: runsOf(L, ID).length }; };
    const ca = await cutShort(WORKER);
    ok(ca.a && /its request file did not parse/.test(ca.a.error || '') && ca.left === 3, 'a cut-short keep set (the request that lists every run, cut mid-write): refused, NOTHING removed', ca);
    const car = await cutShort(MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, "let m = null; try { m = JSON.parse(rd.text); } catch { return { error: 'its request file did not parse' }; }", 'let m = null; try { m = JSON.parse(rd.text); } catch { m = { op, keep: {}, cutoff: Date.now(), max: 1000 }; }', 'red-cut-short-runs'), 'red-cut-short-runs'));
    ok(car.left < 3, `RED: a cut-short keep set read as «keeps nothing» — the runs it listed are removed (${3 - car.left})`, car);
  }

  // ── §3 ONLY ITS OWN REQUEST FILES, OR OLD ONES (r1283 (6)) ──────────────────────────────────────────────────────────
  console.log('§3 the sweep removes only its own remover\'s request files, or ones older than a batch\'s bound');
  {
    const own = async (wp) => {
      const D = path.join(T, 'd3-' + path.basename(wp).replace(/\W+/g, '')), L = path.join(D, 'job-logs'); seedRun(L, 'jb-0ld000b3', B);
      const mine = '.jobs-remover-request-aa1-5.json', ownLeft = '.jobs-remover-request-aa1-3.json', other = '.jobs-remover-request-bb2-1.json', otherOld = '.jobs-remover-request-cc3-1.json';
      fs.writeFileSync(path.join(L, mine), JSON.stringify({ op: 'sweep', keep: { named: ['jb-0ld000b3'], listed: [], skeleton: [], held: [] }, cutoff: Date.now() - 14 * DAY, max: 1000 }));
      for (const n of [ownLeft, other, otherOld]) fs.writeFileSync(path.join(L, n), '{}');
      const t = (Date.now() - 3 * 60e3) / 1000; fs.utimesSync(path.join(L, otherOld), t, t);
      const r = await runW(wp, L, ['sweep', '--request', mine]);
      return { a: ansOf(r), mine: has(L, mine), ownLeft: has(L, ownLeft), other: has(L, other), otherOld: has(L, otherOld) };
    };
    const o3 = await own(WORKER);
    ok(o3.a && !o3.a.error && !o3.mine && !o3.ownLeft && o3.other && !o3.otherOld, 'its own read request goes; its own remover\'s leftover goes; ANOTHER remover\'s fresh request stays (not yet read); another\'s older than a batch\'s bound goes', o3);
    const o3r = await own(MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, '        if (own || old) { try { fs.unlinkSync(rp); } catch { } }', '        { try { fs.unlinkSync(rp); } catch { } }', 'red-every-request'), 'red-every-request'));
    ok(!o3r.other, 'RED: every request file removed — another remover\'s batch loses its request before its child reads it', o3r);
  }

  // ── §4 A CUT THAT REMOVED NOTHING SAYS ZERO (r1283 (3)) ─────────────────────────────────────────────────────────────
  console.log('§4 the count file exists from the child\'s start: a cut that removed nothing says zero, not «not known»');
  {
    const D4 = path.join(T, 'd4'), L4 = path.join(D4, 'job-logs'); seedRun(L4, 'jb-0ld000b4', B);
    const stall = (wp) => { const f = path.join(T, `stall-${path.basename(wp)}.cjs`); fs.writeFileSync(f, `const fs = require('fs'); const rd = fs.readdirSync; const sab = new Int32Array(new SharedArrayBuffer(4)); fs.readdirSync = function (p, ...a) { if (String(p) === ${JSON.stringify(L4)}) Atomics.wait(sab, 0, 0, 3000); return rd.call(this, p, ...a); };\nrequire(${JSON.stringify(wp)});\n`); return f; };
    const cutZero = (wp) => LS.createRemover({ logsDir: L4, timeoutMs: 400, wedgedMs: 3000, workerPath: stall(wp) }).sweep({ keep: { named: ['jb-0ld000b4'], listed: [], skeleton: [], held: [] }, cutoff: Date.now() - 14 * DAY, max: 1000, orphanDir: D4 });
    const z = await cutZero(WORKER);
    ok(z.error && /no answer in/.test(z.error) && z.partial && z.partial.removed === 0 && runsOf(L4, 'jb-0ld000b4').length === 1, 'a sweep cut before its first removal answers ZERO removed (its count file written at its start)', z);
    const zr = await cutZero(MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, 'const countAtStart = countWrite({ removed: 0, entries: 0, jobDirs: 0 });', 'const countAtStart = false;', 'red-no-start-count'), 'red-no-start-count'));
    ok(!zr.partial && /missing/.test(zr.partialUnknown || ''), 'RED: no count at the start — the same cut says «not known (missing)»', zr);
  }

  // ── §5 THE REFUSAL NAMES ITS DOOR (r1283 (4)) ───────────────────────────────────────────────────────────────────────
  console.log('§5 the parent check\'s refusal writes its one line');
  {
    const L5 = path.join(T, 'd5', 'job-logs'); seedRun(L5, 'jb-0e1a00b5', B); seedRun(L5, 'jb-0e1a00b6', B);
    const r5 = await runW(WORKER, L5, ['whole', '--names', 'jb-0e1a00b5'], { hub: process.ppid }), a5 = ansOf(r5);
    ok(a5 && /refused by its parent check/.test(a5.error || '') && has(L5, 'jb-0e1a00b5'), 'a child its parent check refuses answers ONE line naming that door (never «exited with no answer»), and removes nothing', a5);
    const red = MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, "try { fs.writeSync(1, JSON.stringify({ error: 'refused by its parent check:", "try { if (false) fs.writeSync(1, JSON.stringify({ error: 'refused by its parent check:", 'red-silent-refusal'), 'red-silent-refusal');
    const r5r = await runW(red, L5, ['whole', '--names', 'jb-0e1a00b6'], { hub: process.ppid });
    ok(!String(r5r.stdout || '').trim(), 'RED: a silent refusal — no line at all');
  }

  // ── §6 ONE SAVE (r1283 (2)) ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('§6 a count file\'s name rides the SAME save as its count — the catch-up\'s opening one too');
  {
    const opening = async (JM, tag) => {
      const D = path.join(T, 'd6-' + tag), L = path.join(D, 'job-logs'), logs = []; let atStart = null;
      for (let i = 0; i < 30; i++) seedRun(L, 'jb-0ld000b6', B + i * 1000);
      const J = engineAt(JM, D, logs, { max: 10 }, (l) => { if (/job-logs catch-up: 30 run dir/.test(l)) { try { atStart = JSON.parse(fs.readFileSync(path.join(D, 'jobs-logs-sweep.json'), 'utf8')); } catch { atStart = false; } } });
      const p = await J.sweepLogs({ why: 'boot' }); await J.logsSettled(); J.shutdown();
      return { said: atStart !== null, named: !!(atStart && (atStart.orphansCounted || []).includes(p && p.countFile)), removed: atStart && atStart.catchUp && atStart.catchUp.removed };
    };
    const o6 = await opening(JobManager, 'real');
    ok(o6.said && o6.named && o6.removed === 10, 'the record ON DISK at the catch-up\'s start line holds the opening pass\'s count (10) AND its count file\'s name — a kill after it never counts that pass twice', o6);
    const o6r = await opening(MC.load('src/jobs.js', anchored(JSsrc, "    if (ans.countFile && !st.orphansCounted.includes(ans.countFile)) st.orphansCounted.push(ans.countFile);   // B-323e (r1283 (2))", '    // (the name pushed after the opening save)', 'red-two-saves'), 'red-two-saves').JobManager, 'red');
    ok(o6r.said && !o6r.named, 'RED: the name not in the opening save — the record on disk holds the count without it', o6r);
  }

  // ── §7 THE NEXT START'S WORDS (r1283 (5)) ───────────────────────────────────────────────────────────────────────────
  console.log('§7 each count file left is said in its own words at the next start; a zero by nobody; a cut temp beside a standing file «may be short by one»');
  {
    const words = async (JM, tag, workerPath) => {
      const D = path.join(T, 'd7-' + tag), logs = []; fs.mkdirSync(D, { recursive: true });
      const P = LS.ORPHAN_PREFIX, put = (n, o) => fs.writeFileSync(path.join(D, P + n), JSON.stringify(o));
      put('fin-1.json', { removed: 4, entries: 8, jobDirs: 0, done: true }); put('cut-1.json', { removed: 3, entries: 6, jobDirs: 0 }); put('dead-1.json', { removed: 2, entries: 4, jobDirs: 0 });
      put('zero-1.json', { removed: 0, entries: 0, jobDirs: 0, done: true }); put('short-1.json', { removed: 5, entries: 10, jobDirs: 0 }); fs.writeFileSync(path.join(D, P + 'short-1.json.tmp'), '{"removed": 6');
      fs.writeFileSync(path.join(D, 'jobs-logs-sweep.json'), JSON.stringify({ catchUp: { startedAt: Date.now() - 3600e3, counted: 100, removed: 10, entries: 20, jobDirs: 0, passes: 1 }, last: null, heldSaid: [], owed: [], heldNow: [], orphansCounted: [], cutLeft: [P + 'cut-1.json'] }));
      const J = engineAt(JM, D, logs, workerPath ? { workerPath } : {});
      await J.sweepLogs({ why: 'boot' }); await J.logsSettled(); J.shutdown();
      return logs.filter((l) => /job-logs/.test(l));
    };
    const w7 = await words(JobManager, 'real');
    const has7 = (re) => w7.some((l) => re.test(l));
    ok(has7(/a clean-up pass that finished before its record was written removed 4 run dir\(s\) — counted in the catch-up/) && has7(/a clean-up batch cut past its bound \(its child had not ended\) removed 3 run dir\(s\) before it stopped — counted in the catch-up/) && has7(/a remover whose hub ended removed 2 run dir\(s\) before it stopped/), 'a pass that finished unrecorded, a batch cut under the previous start, a remover whose hub ended — each in its own words', w7);
    ok(!has7(/removed 0 run dir/) && has7(/the last write of a remover's count file was cut \(jobs-remover-orphan-short-1\.json\.tmp\) — its count \(jobs-remover-orphan-short-1\.json\) stands and may be short by one/) && !has7(/short-1\.json\.tmp\) — its count is lost/) && has7(/catch-up done: 24 run dir\(s\) removed/), 'a zero said by nobody; a cut temp beside a standing file «may be short by one» (and that file counted: done says 10 + 4 + 3 + 2 + 5 = 24)', w7);
    const r7 = await words(MC.load('src/jobs.js', anchored(JSsrc, "const who = o.done ? 'a clean-up pass that finished before its record was written' : cutLeft.has(o.name) ? 'a clean-up batch cut past its bound (its child had not ended)' : 'a remover whose hub ended';", "const who = 'a remover whose hub ended';", 'red-one-word'), 'red-one-word').JobManager, 'red-words');
    ok(!r7.some((l) => /finished before its record was written|cut past its bound/.test(l)), 'RED: one word for all — «whose hub ended» for a pass that finished and a batch cut under the same hub', r7);
    const r7b = await words(JobManager, 'red-tmp', MC.write('src/job-logs-sweep-worker.js', anchored(WKsrc, '(all.includes(n.slice(0, -4)) ? cutBeside : cutCounts).push(n);', 'cutCounts.push(n);', 'red-tmp-lost'), 'red-tmp-lost'));
    ok(r7b.some((l) => /short-1\.json\.tmp\) — its count is lost/.test(l)), 'RED: a cut temp beside a standing file said «its count is lost»', r7b);
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
