#!/usr/bin/env node
// B-6c46 — THE INSTALL LAUNCHER ENDS ON ITS OWN PROOF, NEVER ON A FOLLOWER'S RETURN. src/install-slot.js's launcher followed
// the log with a tail in follow mode and took that tool's RETURN as «the runner ended». On the integration box (Ubuntu
// 26.04, its tail uutils coreutils — the likely trigger, not proven) test-desktop-serve's five-start leg was red 12 of 12:
// every launcher answered 199
// «the install ended without recording its exit» within ~100 ms, the install's lock still held — the install still ran.
// A STALL PLACED: a PATH `tail` stand-in that, asked to FOLLOW (-f), returns at once — the box's measured behaviour (the
// diagnosis of that run) — and otherwise runs this machine's own tail. Over it:
//   ① a start answers the install's OWN exit (3) and streams every line of its log exactly once, while the install runs
//      well past the stand-in's return;
//   ② a second start beside it follows the running install and answers 3 too;
//   ③ the runner's own end HELD (its exit recorded, then a go-file before it removes its pidfile and exits): the launcher
//      answers only once the runner is gone and its lock free — a start right after it never follows a finished install;
//      RED CONTROL ③: the launcher without that wait answers while the held runner still holds the lock;
//   ④ the exit is READ when it appears, before that wait: the launcher held IN its wait (a `sleep` stand-in, armed by a
//      file, holds its 0.05 s wait until the test releases it and marks that one began), the runner released, a chained start takes the lock and
//      replaces the exit file — the first launcher still answers ITS install's 3; RED CONTROL ④: the read moved below
//      the wait — the plant first (the chained start answered while the first was still waiting), then not 3;
//   RED CONTROL — the release's follow line (the launcher otherwise unchanged): it first PROVES its plant (the stand-in was
//   asked to follow and returned while the install's runner still lived, no exit recorded), then answers 199.
// Linux only (the launcher needs /proc, setsid and flock): a SKIP elsewhere.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const M = require(path.join(REPO, 'src/install-slot.js'));
const { ok, report } = checker();
const has = (b) => spawnSync('sh', ['-c', `command -v ${b}`], { encoding: 'utf8' }).status === 0;
if (process.platform !== 'linux' || !fs.existsSync('/proc/self/stat') || !has('setsid') || !has('flock')) { console.log('  SKIP test-install-follow: needs Linux /proc, setsid and flock'); report(); }
const realTail = spawnSync('sh', ['-c', 'command -v tail'], { encoding: 'utf8' }).stdout.trim();
const root = fs.realpathSync((() => { const d = scratch('install-follow'); fs.mkdirSync(d, { recursive: true }); return d; })());
const shim = path.join(root, 'bin'); fs.mkdirSync(shim, { recursive: true });
const MARK = path.join(root, 'follow-asked');
fs.writeFileSync(path.join(shim, 'tail'), `#!/bin/sh\nfor a in "$@"; do case "$a" in -f|-F|--follow*) echo "$$" >> "${MARK}"; exit 0;; esac; done\nexec '${realTail}' "$@"\n`, { mode: 0o755 });
const env = { ...process.env, PATH: shim + ':' + process.env.PATH, LC_ALL: 'C' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(10); } return !!f(); };
const lockOf = (stateDir) => {   // the launcher's own naming (src/install-slot.js): removed at the end, only this one
  const uid = process.getuid(), run = `/run/user/${uid}`;
  let T = `/tmp/vibespace-${uid}`; try { const st = fs.statSync(run); if (st.isDirectory() && st.uid === uid) { fs.accessSync(run, fs.constants.W_OK); T = run; } } catch { }
  return path.join(T, M.INSTALL_LOCK_PREFIX + crypto.createHash('sha1').update(fs.realpathSync(stateDir)).digest('hex').slice(0, 12) + '.lock');
};
const NEW = "  'o=0; fo() {";
const OLD = "  'tail -s 0.2 --pid=\"$pid\" -n +1 -f \"$L\"',\n";   // stale-pins: kept — the control's copy of the release's follow line
const src = fs.readFileSync(path.join(REPO, 'src/install-slot.js'), 'utf8');
const i0 = src.indexOf("  'o=0; fo() {"), i1 = src.indexOf('  `if [ -n "$c" ]; then exit "$c"; fi`,', i0);
ok(i0 > 0 && i1 > i0 && src.split(NEW).length === 2, 'CONTROL setup: the launcher\'s own follow is spelled once (the lines the control puts back as the release had them)');
const releaseLauncher = (() => {   // the release's two lines (the follow, then the exit file read) in place of this unit's follow, read and wait
  const L = M.INSTALL_LAUNCHER.split('\n'), a = L.findIndex((l) => l.startsWith('o=0; fo() {')), b = L.findIndex((l) => l === 'if [ -n "$c" ]; then exit "$c"; fi');
  return a > 0 && b > a ? [...L.slice(0, a), OLD.trim().slice(1, -2), 'if [ -r "$X" ]; then read c at k < "$X"; exit "$c"; fi', ...L.slice(b + 1)].join('\n') : null;
})();
const launch = (stateDir, installArgv, launcher = M.INSTALL_LAUNCHER, runner = M.INSTALL_RUNNER, extra = {}) => {
  const c = spawn('sh', ['-c', launcher, 'vs-install', runner, stateDir, 'start', ...installArgv], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', ended = false; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  const p = new Promise((resolve) => c.on('close', (code) => { ended = true; resolve({ code, out }); }));
  p.outNow = () => out; p.ended = () => ended; return p;
};
const install = (go) => ['sh', '-c', `echo line-1; echo line-2; i=0; while [ ! -e '${go}' ] && [ $i -lt 250 ]; do sleep 0.04; i=$((i+1)); done; echo line-3; exit 3`];   // capped: never left running
const runnerLive = (stateDir) => { try { const [pid, st] = fs.readFileSync(path.join(stateDir, M.INSTALL_FILES.pid), 'utf8').trim().split(/\s+/); const now = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[19]; return now === st; } catch { return false; } };
const exitRecorded = (stateDir) => { try { return fs.statSync(path.join(stateDir, M.INSTALL_FILES.exit)).size > 0; } catch { return false; } };
const count = (s, w) => s.split(w).length - 1;
const locks = [];
try {
  console.log('① ② the launcher ends on its own proof (the follower returns at once)');
  const stA = path.join(root, 'st-a'), goA = path.join(root, 'go-a'); fs.mkdirSync(stA); locks.push(lockOf(stA));
  const a = launch(stA, install(goA)); let aEnded = false; a.then(() => { aEnded = true; });
  const started = await until(() => runnerLive(stA) && /line-1/.test(a.outNow()), 5000);
  const b = started ? launch(stA, install(goA + '-never')) : Promise.resolve({ code: 'not started', out: '' });   // a second start: it finds the live recorded install and follows it
  const followed = started && await until(() => /already running on this machine/.test(b.outNow()), 5000);
  const streamed = await until(() => /line-2/.test(a.outNow()), 5000);   // an EFFECT: the start copied the log past where a follow would have returned
  const stillRuns = runnerLive(stA) && !exitRecorded(stA) && !aEnded;   // …and has not ended while the install runs
  fs.writeFileSync(goA, '');
  const [ra, rb] = await Promise.all([a, b]);
  const noFollow = !fs.existsSync(MARK);   // the launcher never asked its tail to follow
  ok(started && streamed && stillRuns && noFollow && ra.code === 3 && count(ra.out, 'line-1') === 1 && count(ra.out, 'line-2') === 1 && count(ra.out, 'line-3') === 1 && !/without recording its exit/.test(ra.out),
    '① a start answers the install\'s OWN exit (3) and streams each log line exactly once — it follows by offset, never asking a tail to follow', { started, streamed, stillRuns, noFollow, code: ra.code, out: ra.out.slice(-300) });
  ok(followed && rb.code === 3 && /line-3/.test(rb.out) && !/without recording its exit/.test(rb.out), '② a second start follows the running install and answers 3 too', { followed, code: rb.code, out: rb.out.slice(-300) });
  console.log('③ ④ the answer comes once the runner is gone, with the exit read before that wait');
  const holdRunner = M.INSTALL_RUNNER.replace('mv -f "$X.tmp" "$X";', 'mv -f "$X.tmp" "$X"; h=0; while [ ! -e "$VS_HOLD" ] && [ $h -lt 250 ]; do sleep 0.04; h=$((h+1)); done;');
  const LL = M.INSTALL_LAUNCHER.split('\n');
  const waitLine = LL.filter((l) => l.startsWith('n=0; while ! gone "$pid" "$s"'));
  const noWait = waitLine.length === 1 ? LL.filter((l) => l !== waitLine[0]).join('\n') : null;
  const loopLine = LL.findIndex((l) => l.startsWith('c=; while :; do if [ -s "$X" ]; then read c at k < "$X"; break; fi; fo;')), drainLine = LL.findIndex((l) => l === 'fo; [ -n "$c" ] || { [ -s "$X" ] && read c at k < "$X"; }'), waitAt = LL.findIndex((l) => l === waitLine[0]);
  const readLate = loopLine > 0 && drainLine === loopLine + 1 && waitAt === drainLine + 1 ? [...LL.slice(0, loopLine), 'c=; while :; do fo; [ -s "$X" ] && break; gone "$pid" "$s" && break; sleep 0.2; done', 'fo', LL[waitAt], '[ -s "$X" ] && read c at k < "$X"', ...LL.slice(waitAt + 1)].join('\n') : null;
  ok(holdRunner !== M.INSTALL_RUNNER && holdRunner.split('VS_HOLD').length === 2 && noWait !== null && readLate !== null, 'CONTROL ③ ④ setup: the hold is placed in the runner\'s end once; the launcher\'s wait and its in-loop read are spelled once each');
  const ident = (st) => { try { const [pid, start] = fs.readFileSync(path.join(st, M.INSTALL_FILES.pid), 'utf8').trim().split(/\s+/); return { pid, start }; } catch { return null; } };
  const alive = (id) => { try { return fs.readFileSync(`/proc/${id.pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[19] === id.start; } catch { return false; } };   // the runner itself (pid + starttime), not its pidfile
  const lockFree = (k) => spawnSync('flock', ['-n', k, 'true'], { encoding: 'utf8' }).status === 0;
  const endRun = async (launcher, tag) => {   // ③: the runner's end held; did the launcher answer while it was held?
    const st = path.join(root, 'st-' + tag), go = path.join(root, 'go-' + tag), hold = path.join(root, 'hold-' + tag); fs.mkdirSync(st); const k = lockOf(st); locks.push(k);
    const c = launch(st, install(go), launcher, holdRunner, { VS_HOLD: hold });
    const up = await until(() => runnerLive(st), 5000); const id = ident(st); fs.writeFileSync(go, '');
    const recorded = await until(() => exitRecorded(st), 5000);
    const early = await until(() => c.ended(), 1000);   // a bounded wait for an answer that must NOT come while the runner is held
    const atEarly = { early, runnerLive: !!id && alive(id), lockFree: lockFree(k) };
    fs.writeFileSync(hold, '');
    const r = await c; const at = { code: r.code, recorded, runnerLive: !!id && alive(id), lockFree: lockFree(k), up: !!(up && id), atEarly };
    await until(() => !id || !alive(id), 5000); return at;
  };
  const e3 = await endRun(M.INSTALL_LAUNCHER, 'end');
  ok(!!(e3.up && e3.recorded && !e3.atEarly.early && e3.code === 3 && e3.runnerLive === false && e3.lockFree), '③ the launcher answers 3 only once the runner itself is gone (pid + starttime) and its lock is free — not while its end is held', e3);
  const e3c = noWait ? await endRun(noWait, 'endctl') : { up: false };
  ok(!!(e3c.up && e3c.recorded && e3c.atEarly && e3c.atEarly.early && e3c.atEarly.runnerLive === true && e3c.atEarly.lockFree === false), 'CONTROL ③ (no wait for the runner): the plant held — the exit recorded, the runner held with its lock — and the launcher answered then (red)', e3c);
  const realSleep = spawnSync('sh', ['-c', 'command -v sleep'], { encoding: 'utf8' }).stdout.trim();
  const slowBin = path.join(root, 'bin-slow'); fs.mkdirSync(slowBin, { recursive: true });
  fs.writeFileSync(path.join(slowBin, 'sleep'), `#!/bin/sh\nif [ "$1" = 0.05 ] && [ -e "$VS_SLOW" ]; then : > "$VS_SLOW.in"; i=0; while [ ! -e "$VS_SLOW.go" ] && [ $i -lt 200 ]; do '${realSleep}' 0.05; i=$((i+1)); done; exit 0; fi\nexec '${realSleep}' "$@"\n`, { mode: 0o755 });   // a wait HELD until the test releases it (capped 10 s) — no fixed stretch
  const chained = async (launcher, tag) => {   // ④
    const st = path.join(root, 'st-' + tag), go = path.join(root, 'go-' + tag), hold = path.join(root, 'hold-' + tag), slow = path.join(root, 'slow-' + tag); fs.mkdirSync(st); const k = lockOf(st); locks.push(k);
    const a = launch(st, install(go), launcher, holdRunner, { VS_HOLD: hold, VS_SLOW: slow, PATH: slowBin + ':' + env.PATH });
    const up = await until(() => runnerLive(st), 5000); const id = ident(st); fs.writeFileSync(go, '');
    const recorded = await until(() => exitRecorded(st), 5000); fs.writeFileSync(slow, '');
    const inWait = await until(() => fs.existsSync(slow + '.in'), 5000);   // the first launcher is IN its wait now (held)
    fs.writeFileSync(hold, '');   // the runner ends
    const gone = await until(() => !id || !alive(id), 5000);
    const b = launch(st, ['sh', '-c', 'echo second; exit 7']);   // a chained start: takes the lock, replaces the exit file
    const rb = await b; const aEndedFirst = a.ended(); fs.writeFileSync(slow + '.go', '');   // the chained start answered: the first launcher's wait is released only now
    const ra = await a;
    return { up, recorded, inWait, gone, codeA: ra.code, codeB: rb.code, aEndedFirst };
  };
  const c4 = await chained(M.INSTALL_LAUNCHER, 'chain');
  ok(!!(c4.up && c4.recorded && c4.inWait && c4.gone && c4.codeB === 7 && !c4.aEndedFirst && c4.codeA === 3), '④ the exit is read when it appears, before the wait: a chained start replaced the exit file while the first launcher waited — it still answers ITS install\'s 3', c4);
  const c4c = readLate ? await chained(readLate, 'chainctl') : { up: false };
  ok(!!(c4c.up && c4c.inWait && c4c.codeB === 7 && !c4c.aEndedFirst), 'CONTROL ④ proves its plant first: the chained start answered 7 while the first launcher was still in its wait', c4c);
  ok(readLate !== null && c4c.codeA === 7, 'CONTROL ④ (the read moved below the wait): the first launcher answers the CHAINED install\'s 7, not its own 3 (red)', { codeA: c4c.codeA });
  console.log('RED CONTROL: the release\'s follow line');
  const stC = path.join(root, 'st-c'), goC = path.join(root, 'go-c'); fs.mkdirSync(stC); locks.push(lockOf(stC));
  try { fs.rmSync(MARK, { force: true }); } catch { }
  const c = releaseLauncher ? launch(stC, install(goC), releaseLauncher) : null;
  const rc = c ? await Promise.race([c, sleep(8000).then(() => ({ code: 'timeout', out: c.outNow() }))]) : { code: 'no copy' };
  const plant = { asked: fs.existsSync(MARK), runnerLived: runnerLive(stC), recorded: exitRecorded(stC) };   // read at the moment the control answered
  ok(plant.asked && plant.runnerLived && !plant.recorded, 'CONTROL proves its plant first: the stand-in was asked to FOLLOW and returned while the install\'s runner still lived, no exit recorded', plant);
  fs.writeFileSync(goC, '');
  ok(rc.code === 199 && /without recording its exit/.test(rc.out || ''), 'CONTROL (the release\'s follow line): the launcher answers 199 «ended without recording its exit» while the install still ran (red)', { code: rc.code });
  await until(() => exitRecorded(stC) && !runnerLive(stC), 10000);   // the control's install ends (nothing left running)
} finally {
  for (const k of locks) { try { fs.rmSync(k, { force: true }); } catch { } }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { }
}
report();
