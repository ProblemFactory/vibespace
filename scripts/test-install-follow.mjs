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
//      answers only once the runner is gone (the script waits on the runner, never on the lock — the kernel drops the lock
//      with its last holder, so it is free by then here);
//      RED CONTROL ③: the launcher without that wait answers while the held runner still holds the lock;
//   ④ the exit is READ when it appears, before that wait: the launcher held IN its wait (a `sleep` stand-in, armed by a
//      file, holds its 0.05 s wait until the test releases it and marks that one began), the runner released, a chained start takes the lock and
//      replaces the exit file — the first launcher still answers ITS install's 3; RED CONTROL ④: the read moved below
//      the wait — the plant first (the chained start answered while the first was still waiting), then not 3;
//   RED CONTROL — the release's follow line (the launcher otherwise unchanged): it first PROVES its plant (the stand-in was
//   asked to follow and returned while the install's runner still lived, no exit recorded), then answers 199.
// The cure (主开发's 21:59Z «taken»), run BESIDE the legs above (each its own state dir):
//   ⑤ THE 199 ROAD: the runner killed mid-install (its whole group, as a stop ends it) with nothing recorded ⇒ 199, its line
//      once, the log once — and no reply before the kill;
//   ⑥ A ZOMBIE RUNNER IS GONE: a follower re-attached to a runner that ended unreaped (a stand-in whose parent never reaps:
//      its proc entry and starttime stand, state Z) answers 199 while the zombie still stands; RED CONTROL ⑥ — the release's
//      st / live / gone: the plant first (the zombie stands, its starttime unchanged), then no answer within the bound;
//      ⑥b while it stands: the hub's install facts (installState) say NO running install (the plant: the release's predicate
//      says running), and a START runs its own install; RED CONTROL ⑥b — live() without its zombie case: it follows, 199;
//   ⑦ THE READER GONE: the card's pipe closed ⇒ the launcher ends (SIGPIPE, 141) at its next copy, the install untouched;
//      RED CONTROL ⑦ — a failed copy only retried: the plant first (the log grew after the reader left), then it lives on;
//   ⑧ a sleep that refuses a fraction (the plant first: it refuses 0.01, takes 0) ⇒ 125 by name at the launcher's top,
//      nothing created or run, sleep's own error off the card (no control: without the check the loop would spin — no load).
// Linux only (the launcher needs /proc, setsid and flock): elsewhere «SKIPPED (… — a skip is never green)», exit 2, as the
// browser suites end (test-browser-mediation-chrome) — a count and a name, never read as green (on the fast tier it is a
// RED: ci retries it once, then counts it; tb reads the rc — every ci host has Linux and util-linux).
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
const lacks = [process.platform !== 'linux' && 'Linux', !fs.existsSync('/proc/self/stat') && '/proc', !has('setsid') && 'setsid', !has('flock') && 'flock'].filter(Boolean);
if (lacks.length) { console.log(`SKIPPED (1 skipped, 0 passed — a skip is never green): test-install-follow needs Linux /proc, setsid and flock; this machine lacks ${lacks.join(', ')}`); process.exit(2); }
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
const launch = (stateDir, installArgv, launcher = M.INSTALL_LAUNCHER, runner = M.INSTALL_RUNNER, extra = {}, mode = 'start') => {
  const c = spawn('sh', ['-c', launcher, 'vs-install', runner, stateDir, mode, ...installArgv], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', ended = false; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  const p = new Promise((resolve) => c.on('close', (code) => { ended = true; resolve({ code, out }); }));
  p.outNow = () => out; p.ended = () => ended; p.child = c; return p;
};
const install = (go) => ['sh', '-c', `echo line-1; echo line-2; i=0; while [ ! -e '${go}' ] && [ $i -lt 250 ]; do sleep 0.04; i=$((i+1)); done; echo line-3; exit 3`];   // capped: never left running
const runnerLive = (stateDir) => { try { const [pid, st] = fs.readFileSync(path.join(stateDir, M.INSTALL_FILES.pid), 'utf8').trim().split(/\s+/); const now = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[19]; return now === st; } catch { return false; } };
const exitRecorded = (stateDir) => { try { return fs.statSync(path.join(stateDir, M.INSTALL_FILES.exit)).size > 0; } catch { return false; } };
const count = (s, w) => s.split(w).length - 1;
const locks = [];
const realSleep = spawnSync('sh', ['-c', 'command -v sleep'], { encoding: 'utf8' }).stdout.trim();
const statOf = (pid) => { try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' '); return { state: f[0], pgrp: f[2], start: f[19] }; } catch { return null; } };
const recordedOf = (st) => { try { const [pid, start] = fs.readFileSync(path.join(st, M.INSTALL_FILES.pid), 'utf8').trim().split(/\s+/); return { pid, start }; } catch { return null; } };
const holders = [];   // ⑥'s stand-in parents: ended by their handles at the end
// ⑤ THE 199 ROAD — the runner killed mid-install, nothing recorded
const killedLeg = async () => {
  const st = path.join(root, 'st-kill'), go = path.join(root, 'go-kill'); fs.mkdirSync(st); locks.push(lockOf(st));
  const c = launch(st, install(go));
  const up = await until(() => runnerLive(st) && /line-1/.test(c.outNow()), 5000), id = recordedOf(st);
  const before = await until(() => c.ended(), 500);   // a bounded wait for an answer that must NOT come before the kill
  const f = id && statOf(id.pid), ours = !!(f && f.start === id.start && f.pgrp === id.pid);   // the runner by pid + starttime from THIS suite's scratch pidfile, leading its own group (setsid)
  if (ours) { try { process.kill(-Number(id.pid), 'SIGKILL'); } catch { } }   // the runner and the install it runs, as a stop ends them
  const r = await Promise.race([c, sleep(8000).then(() => ({ code: 'timeout', out: c.outNow() }))]);
  if (r.code === 'timeout') { try { c.child.kill('SIGKILL'); } catch { } }
  return { up: !!(up && id), before, ours, code: r.code, said: count(r.out, 'without recording its exit'), lines: count(r.out, 'line-1'), recorded: exitRecorded(st) };
};
// ⑥ A ZOMBIE RUNNER — the control's copy: the release's three probe lines (a zombie read as alive)
const OLD_PROBES = [
  "st() { sed 's/^.*) //' \"/proc/$1/stat\" 2>/dev/null | cut -d' ' -f20; }",   // stale-pins: kept — the release's probe, the zombie control's copy
  "live() { [ -n \"$1\" ] && [ -n \"$2\" ] && [ \"$(st \"$1\")\" = \"$2\" ]; }",   // stale-pins: kept — the release's probe, the zombie control's copy
  "gone() { [ -z \"$1\" ] || [ ! -e \"/proc/$1\" ] || { t=$(st \"$1\"); [ -n \"$t\" ] && [ \"$t\" != \"$2\" ]; }; }",   // stale-pins: kept — the release's probe, the zombie control's copy
];
const zombieLauncher = (() => {
  const L = M.INSTALL_LAUNCHER.split('\n'), at = ['st() {', 'live() {', 'gone() {'].map((h) => L.findIndex((l) => l.startsWith(h)));
  return at[0] > 0 && at[1] === at[0] + 1 && at[2] === at[1] + 1 ? [...L.slice(0, at[0]), ...OLD_PROBES, ...L.slice(at[2] + 1)].join('\n') : null;
})();
const D = require(path.join(REPO, 'src/desktop-display.js'));   // the hub's install facts (installState)
const bounded = async (p, ms) => { const r = await Promise.race([p, sleep(ms).then(() => null)]); if (r) return r; try { p.child.kill('SIGKILL'); } catch { } return { code: 'timeout', out: p.outNow() }; };
const LIVE_ZOMBIE = "case $t in [ZXx]' '*) return 1 ;; esac; ";   // ⑥b's control cuts it from live(): a zombie read as a live install
const liveCtl = M.INSTALL_LAUNCHER.split(LIVE_ZOMBIE).length === 2 ? M.INSTALL_LAUNCHER.replace(LIVE_ZOMBIE, '') : null;
const zombieLeg = async (launcher, tag, boundMs, starts = false) => {
  const st = path.join(root, 'st-' + tag), go = path.join(root, 'go-' + tag), zp = path.join(root, 'zp-' + tag); fs.mkdirSync(st);
  // the stand-in runner: a subshell whose parent then execs `sleep`, which never reaps — released, it stays a ZOMBIE, as a
  // runner under a pid 1 that never reaps (its proc entry and its starttime stand)
  const h = spawn('sh', ['-c', '( i=0; while [ ! -e "$1" ] && [ $i -lt 500 ]; do sleep 0.02; i=$((i+1)); done ) & echo $! > "$2"; exec sleep 15', 'vs-zombie', go, zp], { stdio: 'ignore' }); holders.push(h);   // capped: never left running
  const zpid = (await until(() => { try { return /^\d+\s*$/.test(fs.readFileSync(zp, 'utf8')); } catch { return false; } }, 5000)) ? fs.readFileSync(zp, 'utf8').trim() : null;
  const z0 = zpid && statOf(zpid);
  if (!z0) return { planted: false };
  fs.writeFileSync(path.join(st, M.INSTALL_FILES.log), 'z-line\n'); fs.writeFileSync(path.join(st, M.INSTALL_FILES.pid), `${zpid} ${z0.start} vs-zombie\n`);   // its record, as a runner writes one
  const c = launch(st, [], launcher, M.INSTALL_RUNNER, {}, 'follow');
  const follows = await until(() => /already running on this machine/.test(c.outNow()), 5000);
  const early = await until(() => c.ended(), 300);   // while it lives: no answer
  fs.writeFileSync(go, '');
  const zombie = await until(() => statOf(zpid)?.state === 'Z', 5000);   // THE PLANT: it ended and stands as a zombie…
  const sameStart = statOf(zpid)?.start === z0.start;   // …its starttime unchanged
  const r = await Promise.race([c, sleep(boundMs).then(() => null)]);
  const stood = statOf(zpid)?.state === 'Z';   // still a zombie when it answered (or at the bound)
  if (!r) { try { c.child.kill('SIGKILL'); } catch { } }
  const out = { planted: true, follows, early, zombie, sameStart, stood, code: r ? r.code : `no answer in ${boundMs} ms`, said: r ? count(r.out, 'without recording its exit') : 0, line: r ? count(r.out, 'z-line') : 0 };
  if (starts && r && stood) {   // ⑥b while the zombie still stands: the hub's facts, then a START (the control first — it leaves the slot's files as they are)
    const facts = await D.installState(st);
    out.facts = { installing: facts.installing, releaseReads: D.procStart(Number(zpid)) === Number(z0.start) };   // the release's predicate (procStart(pid) === starttime) over the same record
    locks.push(lockOf(st));
    const own = ['sh', '-c', 'echo own-run; exit 5'];
    const ctl = liveCtl ? await bounded(launch(st, own, liveCtl), 5000) : { code: 'no copy', out: '' };
    const fix = await bounded(launch(st, own), 5000);
    out.start = { stillZ: statOf(zpid)?.state === 'Z', ctl: { code: ctl.code, followed: /already running/.test(ctl.out), ran: /own-run/.test(ctl.out) }, fix: { code: fix.code, followed: /already running/.test(fix.out), ran: count(fix.out, 'own-run') } };
  }
  return out;
};
// ⑦ THE READER GONE — the control: a failed copy only retried
const RETRY_ONLY = '|| { [ $? -eq 141 ] && exit 141; }';
const goneLauncher = M.INSTALL_LAUNCHER.split(RETRY_ONLY).length === 2 ? M.INSTALL_LAUNCHER.replace(RETRY_ONLY, '|| :') : null;
const readerLeg = async (launcher, tag, boundMs) => {
  const st = path.join(root, 'st-' + tag), go = path.join(root, 'go-' + tag); fs.mkdirSync(st); locks.push(lockOf(st));
  const ticks = ['sh', '-c', `i=0; while [ ! -e '${go}' ] && [ $i -lt 250 ]; do echo tick-$i; sleep 0.04; i=$((i+1)); done; exit 3`];   // a line every 40 ms, capped
  const c = spawn('sh', ['-c', launcher, 'vs-install', M.INSTALL_RUNNER, st, 'start', ...ticks], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '', exited = null; c.stdout.on('data', (d) => { out += d; }); c.on('exit', (code, signal) => { exited = { code, signal }; });
  const up = await until(() => /tick-1\n/.test(out) && runnerLive(st), 5000);
  const ticksNow = () => { try { return count(fs.readFileSync(path.join(st, M.INSTALL_FILES.log), 'utf8'), 'tick-'); } catch { return 0; } };
  c.stdout.destroy(); const n0 = ticksNow();   // the reader goes: its end of the pipe closed
  const ended = await until(() => exited !== null, boundMs);
  const installRuns = runnerLive(st) && !exitRecorded(st);   // the install untouched when the launcher ended (or at the bound)
  const at = { up, ended, exited, installRuns, grew: await until(() => ticksNow() > n0, 1000) };   // the plant: the log grew after the reader left
  if (!ended) { try { c.kill('SIGKILL'); } catch { } }
  fs.writeFileSync(go, ''); await until(() => exitRecorded(st) && !runnerLive(st), 10000);
  return at;
};
// ⑧ a sleep that refuses a fraction
const fracLeg = async () => {
  const dir = path.join(root, 'bin-nofrac'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sleep'), `#!/bin/sh\ncase "$1" in *.*) echo "sleep: invalid time interval '$1'" >&2; exit 1 ;; esac\nexec '${realSleep}' "$@"\n`, { mode: 0o755 });
  const PATHnf = dir + ':' + env.PATH, sh1 = (c) => spawnSync('sh', ['-c', c], { env: { ...env, PATH: PATHnf } }).status;
  const planted = sh1('sleep 0.01') !== 0 && sh1('sleep 0') === 0;   // THE PLANT: this PATH's sleep refuses a fraction, takes a whole number
  const st = path.join(root, 'st-nofrac');   // never created: nothing may create it
  const c = launch(st, ['sh', '-c', 'echo never'], M.INSTALL_LAUNCHER, M.INSTALL_RUNNER, { PATH: PATHnf });
  const r = await Promise.race([c, sleep(5000).then(() => ({ code: 'timeout', out: c.outNow() }))]);
  if (r.code === 'timeout') { try { c.child.kill('SIGKILL'); } catch { } }
  return { planted, code: r.code, named: /sleep is missing or cannot wait a fraction of a second/.test(r.out), ran: /never/.test(r.out), noise: /invalid time interval/.test(r.out), created: fs.existsSync(st) };
};
try {
  // ⑤–⑧ start first and run BESIDE ①–④ (their own state dirs); judged at the end
  const beside = Promise.all([killedLeg(), zombieLeg(M.INSTALL_LAUNCHER, 'zomb', 5000, true), zombieLauncher ? zombieLeg(zombieLauncher, 'zombctl', 1200) : Promise.resolve({ planted: false }),
    readerLeg(M.INSTALL_LAUNCHER, 'reader', 3000), goneLauncher ? readerLeg(goneLauncher, 'readerctl', 1200) : Promise.resolve({ up: false }), fracLeg()]);
  beside.catch(() => { });   // handled where it is awaited (below)
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
  ok(!!(e3.up && e3.recorded && !e3.atEarly.early && e3.code === 3 && e3.runnerLive === false && e3.lockFree), '③ the launcher answers 3 only once the runner itself is gone (pid + starttime) — not while its end is held; the lock is free by then (the kernel drops it with the runner: the script waits on the runner, never on the lock)', e3);
  const e3c = noWait ? await endRun(noWait, 'endctl') : { up: false };
  ok(!!(e3c.up && e3c.recorded && e3c.atEarly && e3c.atEarly.early && e3c.atEarly.runnerLive === true && e3c.atEarly.lockFree === false), 'CONTROL ③ (no wait for the runner): the plant held — the exit recorded, the runner held with its lock — and the launcher answered then (red)', e3c);
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
  const [k5, z6, z6c, r7, r7c, f8] = await beside;
  console.log('⑤ – ⑧ the 199 road, a zombie runner, the reader gone, a sleep without fractions');
  ok(!!(k5.up && k5.before === false && k5.ours && k5.code === 199 && k5.said === 1 && k5.lines === 1 && !k5.recorded), '⑤ THE 199 ROAD: the runner killed mid-install with nothing recorded ⇒ 199, its line once, the log once — and no reply before the kill', k5);
  ok(!!(z6.planted && z6.follows && !z6.early && z6.zombie && z6.sameStart && z6.stood && z6.code === 199 && z6.said === 1 && z6.line === 1), '⑥ A ZOMBIE RUNNER IS GONE: a follower re-attached to a runner that ended unreaped, nothing recorded, answers 199 while the zombie still stands', z6);
  const s6 = z6.start || {}, f6 = z6.facts || {};
  ok(!!(z6.facts && f6.releaseReads === true && f6.installing === null), '⑥ the hub\'s install facts over the zombie\'s record: NO running install (installState) — the plant first: the release\'s predicate (procStart(pid) === starttime) reads it as running', f6);
  ok(!!(s6.stillZ && s6.fix && s6.fix.code === 5 && s6.fix.ran === 1 && !s6.fix.followed), '⑥b while the zombie still stands, a START runs its own install (its own exit 5) — never «already running» behind a zombie', s6);
  ok(!!(liveCtl && s6.stillZ && s6.ctl && s6.ctl.followed && !s6.ctl.ran && s6.ctl.code === 199), 'CONTROL ⑥b (live() without its zombie case): the start follows the zombie and answers 199, its own install never run (red)', s6.ctl);
  ok(!!(z6c.planted && z6c.follows && z6c.zombie && z6c.sameStart && z6c.stood), 'CONTROL ⑥ proves its plant first: the followed runner stands as a zombie, its starttime unchanged, through the bound', z6c);
  ok(zombieLauncher !== null && /^no answer/.test(String(z6c.code)), 'CONTROL ⑥ (the release\'s st / live / gone): the follower reads the zombie as alive and never answers (red)', { code: z6c.code });
  ok(!!(r7.up && r7.ended && r7.exited && (r7.exited.code === 141 || r7.exited.signal === 'SIGPIPE') && r7.grew && r7.installRuns), '⑦ THE READER GONE: the launcher ends (SIGPIPE, 141) at its next copy while the install runs on untouched', r7);
  ok(!!(goneLauncher && r7c.up && r7c.grew && r7c.installRuns), 'CONTROL ⑦ proves its plant first: the log grew after the reader left, the install still running', r7c);
  ok(!!(goneLauncher && r7c.up && r7c.ended === false), 'CONTROL ⑦ (a failed copy only retried): the launcher outlives its reader (red)', r7c);
  ok(!!(f8.planted && f8.code === 125 && f8.named && !f8.ran && !f8.noise && !f8.created), '⑧ a sleep that refuses a fraction (the plant first: it refuses 0.01, takes 0) ⇒ 125 by name at the launcher\'s top, nothing created or run, sleep\'s own error off the card', f8);
} finally {
  for (const h of holders) { try { h.kill('SIGKILL'); } catch { } }   // ⑥'s stand-in parents, by their handles (the zombies go to the reaper with them)
  for (const k of locks) { try { fs.rmSync(k, { force: true }); } catch { } }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { }
}
report();
