#!/usr/bin/env node
// THE MOUNT DAEMON'S OWN START (B-323e, lane bl-machines-b, 主开发 r1299): «a mount daemon is started without the hub's main process
// starting a program, and it lives exactly as today» — THE STARTER's one new kind of ask, a DETACHED child it never signals, holds or
// counts. Fast, in-process: the real MountManager in temp data dirs and the real starter; the «daemon» a stand-in that LIVES and that
// the adoption's own walk knows — a link named rclone to a SHELL that waits in a builtin read on this suite's own FIFO, so its comm
// and argv say rclone, mount and its mount point, and it starts no child. WHY A SHELL (主开发 r1977): a tool that checks its own name
// refuses to run as «rclone» (uutils' multicall tail ends at once there) — dash or bash read no name of their own. Each stand-in is
// ended by the pid and start this suite holds for it, at EVERY exit (its end, a throw, a signal); the FIFO lives in its scratch folder
// — no mount, no real mount table (the manager's seams), every program on this suite's own search path; each daemon ended by this suite
//  ① its start makes NO program start from the hub's main process; its log: the hub's marker first, then the daemon's own lines
//  ② LAW 1: it OUTLIVES its starter — the starter's pipe closed (it ends by itself) and a starter killed (a fault): the daemon lives —
//     RED a starter that holds it (its end kills it)
//  ③ adopted by a FRESH manager (a restart): its own look finds it by the argv walk
//  ④ LAW 2: a reply LOST (the starter started it, no answer reached the hub): the next turn's look finds it — ONE daemon a mount point,
//     never two — RED the look cut ⇒ a second daemon on the same mount point
//  ④b LAW 2 with NO /proc: a lost reply holds the next start on that mount point as «can't tell» (bounded) — RED the lost start unmarked;
//     its row says what it waits for and how long (start_lost_wait); ④c WITH /proc that hold is never taken (its follow, r1782 (2))
//  ⑤ LAW 3: the env is the child's alone — the record's secret in the daemon's env; never in its argv, the starter's own env, a LATER
//     child of the starter, nor this process's journal — RED a starter that keeps the request's env for later children
//  ⑥ LAW 4: the log path is the hub's own — an id that would leave the mount logs folder is refused before any ask — RED the judge cut
//  ⑦ LAW 5: a start that could not be made (no such program) or that got no answer reads «could not be started» — the person's words
//     today's («rclone exited before mounting»), never «died», nothing watched; a starter that never ran asked nothing (its words)
//  ⑧ (its follow, r1782) a person's Disconnect while the start waits on its starter's answer: nothing wanted again, the daemon ended by
//     the identity its starter answered — RED the generation not read again; ⑧b its answer lost; ⑧s it mounted meanwhile; ⑧c a Connect
//     after that Disconnect; ⑧d a pid given away; ⑧e the last word a Disconnect; ⑧n no /proc; ⑧n2 a stranger in the window (answered once its ps row reads its true age; PLACED: its row read within a tick of its birth, the etime wrapped — both copies hold, r5094) — each RED; ⑨ the old road's detached start after two starter faults (its own
//     session, its log, alive after the starter is let go) — RED its branch cut
// Run: node scripts/test-mount-daemon-start.mjs
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // every red control's edit through the one door that fails by name

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lateOf = (pr, ms) => { let t = null; return Promise.race([pr.then(() => false, () => false), new Promise((r) => { t = setTimeout(() => r(true), ms); })]).finally(() => clearTimeout(t)); };   // true when the fact did not come inside ms
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-daemon-start-'));
const CP = require('child_process');
const mainStarts = [];   // THE COUNTER (B-91aa's): every start of THIS process, its program noted
const realSpawn = CP.ChildProcess.prototype.spawn;
CP.ChildProcess.prototype.spawn = function (o) { mainStarts.push(path.basename(String((o && o.file) || '?'))); return realSpawn.apply(this, arguments); };

// the stand-in secret, built at runtime (never a literal in the tree)
const SEC = ['s', 'ek', 'ret'].join('') + '-' + process.pid + '-daemon';
const LOG = path.join(T, 'starts.log');
const fbin = path.join(T, 'bin'), ddir = path.join(T, 'daemon'); fs.mkdirSync(fbin, { recursive: true }); fs.mkdirSync(ddir);
const SHELL = ['/usr/bin/dash', '/bin/dash', '/usr/bin/bash', '/bin/bash'].find((p) => fs.existsSync(p));   // never a multicall binary (r1977: uutils' tail ends at once under another name)
fs.symlinkSync(SHELL, path.join(ddir, 'rclone'));   // THE DAEMON: its comm and argv[0] say rclone; it waits on HOLD until ended here
const HOLD = path.join(T, 'hold.fifo'); CP.execFileSync('mkfifo', [HOLD], { stdio: 'ignore' });   // a FIFO no one writes: its open waits (an interruptible sleep), no child, no busy loop
const SYS = 'PATH=/usr/bin:/bin';
const standin = (name, body) => fs.writeFileSync(path.join(fbin, name), `#!/bin/sh\necho "$PPID ${name} $1 $2" >> '${LOG}'\n${body}\n`, { mode: 0o755 });
standin('rclone', `case "$1" in
  help) echo '--use-accept-encoding-gzip --rc-addr --s3-use-accept-encoding-gzip' ;;
  version) echo 'rclone v1.70.0' ;;
  lsf) echo f.txt ;;
  mount) [ "$2" = --help ] && { echo '--vfs-cache-mode --rc-addr'; exit 0; }; echo 'standin daemon up'; exec '${path.join(ddir, 'rclone')}' -c 'read x < "$1"' standin '${HOLD}' "$@" ;;
esac
exit 0`);
for (const [n, b] of [['fusermount3', 'exit 0'], ['fusermount', 'exit 0'], ['umount', 'exit 0'], ['sudo', 'exit 1'], ['find', 'exit 0'],
  ['mkdir', `${SYS} exec mkdir "$@"`], ['test', `${SYS} exec test "$@"`], ['ls', `${SYS} exec ls "$@"`]]) standin(n, b);
process.env.PATH = `${fbin}:${process.env.PATH}`;   // before the starter is born
process.env.VIBESPACE_MOUNT_BASE = path.join(T, 'mnt');

const CS = require(path.join(REPO, 'src/server/child-starter.js'));
const { serviceEnv } = require(path.join(REPO, 'src/agent-env.js'));
const PI = require(path.join(REPO, 'src/proc-identity.js'));
const MOUNTS = require(path.join(REPO, 'src/mounts.js'));
const MC = mutantCopies('mount-daemon-start', REPO);
const alive = (pid) => { const st = pid ? PI.statOf(pid) : null; return !!st && st[0] !== 'Z'; };
const daemons = new Set(), daemonStarts = new Map();   // every daemon this suite started, with the start it had: ended at every exit
const ownDaemon = (pid, start) => { if (!pid) return; const s0 = start != null ? start : PI.starttimeOf(pid); if (s0 == null) return; daemons.add(pid); daemonStarts.set(pid, s0); };   // ours only with its start: the answered one, else read now (none: gone already)
const sameStart = (pid) => daemonStarts.has(pid) && PI.starttimeOf(pid) === daemonStarts.get(pid);   // the pid this suite holds, still that process
const endOwn = () => { for (const pid of daemons) { if (sameStart(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } } };
process.on('exit', endOwn);   // its end, a throw that ends it
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.once(sig, () => { endOwn(); try { fs.rmSync(T, { recursive: true, force: true }); } catch { } process.kill(process.pid, sig); });   // a signal: its own stand-ins and folder, then the signal's own end
const recEnv = () => ({ ...serviceEnv(process.env), RCLONE_CONFIG_VS_TYPE: 's3', RCLONE_CONFIG_VS_SECRET_ACCESS_KEY: SEC });
const held = [], con = { log: console.log, warn: console.warn };   // this process's journal while the legs run
console.warn = (...a) => { held.push(a.map(String).join(' ')); con.warn(...a); };
const slog = [], capLog = { warn: (...a) => { slog.push(a.map(String).join(' ')); } };   // the starters' own journal (its follow: read too)
let S = CS.createChildStarter({ log: capLog }); CS.setChildStarter(S);
const mmOf = (M, tag, rec) => {
  const D = path.join(T, 'data-' + tag); fs.mkdirSync(D, { recursive: true });
  const mm = new M.MountManager({ dataDir: D });
  mm.isMounted = () => false; mm._daemonAlive = async () => false;   // the mount table and the stale-daemon belt: seams (law 2 is the look's own)
  mm._rcloneFor = () => ({ env: recEnv(), remote: 'VS:' });
  mm._startingT = { ...M.MountManager.STARTING, quickMs: 300, pollMs: 50, hungMs: 10 * 60e3, ceilingMs: 20 * 60e3 };
  if (rec && !mm._state.mounts.some((x) => x.id === rec.id)) mm._state.mounts.push({ ...rec });
  return mm;
};
const walkCount = async (mm, mp) => { try { return (await mm._walk({ mp })).ids.length; } catch { return -1; } };
try {
  await S.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start (made once), outside every window

  console.log('① the daemon\'s start: no program from the hub\'s main process; its log');
  const R1 = { id: 'mds-a', name: 'mds a', type: 'sftp', desired: 'mounted' };
  const mm1 = mmOf(MOUNTS, 'a', R1), mp1 = mm1.pathOf(R1);
  const s0 = mainStarts.length; let ans1 = null;
  CS.setChildStarter({ stats: () => S.stats(), run: (c, a, o) => S.run(c, a, o).then((r) => { if (o && o.detach) ans1 = r; return r; }) });   // its read (NIT 1): the answer itself
  try { await mm1.mount(R1.id); } finally { CS.setChildStarter(S); }
  const d1 = (mm1._daemonIds && mm1._daemonIds.get(mp1) || {}).pid || (mm1._starting && (mm1._starting.get(R1.id) || {}).pid) || 0;
  if (d1) ownDaemon(d1, PI.starttimeOf(d1));
  const seeded1 = (mm1._daemonIds && mm1._daemonIds.get(mp1)) || {};
  const fromMain = mainStarts.slice(s0);
  await until(() => fs.existsSync(path.join(T, 'data-a', 'mount-logs', 'mds-a.log')) && /standin daemon up/.test(fs.readFileSync(path.join(T, 'data-a', 'mount-logs', 'mds-a.log'), 'utf8')));
  const log1 = fs.readFileSync(path.join(T, 'data-a', 'mount-logs', 'mds-a.log'), 'utf8');
  ok(d1 > 0 && alive(d1) && fromMain.length === 0 && log1.indexOf(MOUNTS.MountManager.LOG_MARK) >= 0 && log1.indexOf(MOUNTS.MountManager.LOG_MARK) < log1.indexOf('standin daemon up') && seeded1.starttime != null && seeded1.starttime === PI.starttimeOf(d1) && !!ans1 && ans1.starttime === PI.starttimeOf(d1),
    `① the daemon (pid ${d1}) started with NO program from the hub's main process (${fromMain.length}: ${fromMain.join(', ')}); its log holds the hub's marker, then the daemon's own lines; the start time its starter handed back is the process table's (${ans1 && ans1.starttime} = ${PI.starttimeOf(d1)}, recorded ${seeded1.starttime})`, { d1, fromMain, log: log1.slice(0, 200) });

  console.log('② law 1: it outlives its starter');
  const startVia = async (st, tag) => { const mp = path.join(T, 'mp-' + tag); const logP = path.join(T, 'log-' + tag + '.log'); const r = await st.run('rclone', ['mount', 'VS:', mp, '--vfs-cache-mode', 'full'], { detach: { log: logP }, wholeEnv: true, env: recEnv(), timeoutMs: 10000 }); if (r && r.pid) ownDaemon(r.pid, r.starttime); return r; };
  const outlive = async (script, tag, how) => {
    const st = CS.createChildStarter({ ...(script ? { script } : {}), log: { warn: () => { } } });
    const r = await startVia(st, tag); const sp = st._proc(); const spid = sp && sp.pid;
    if (how === 'close') st.closePipe(); else { try { sp.kill('SIGKILL'); } catch { } }
    await until(() => !alive(spid));
    await sleep(100);
    return { pid: r && r.pid, started: !!(r && r.started), starterGone: !alive(spid), daemon: alive(r && r.pid) };
  };
  const oc = await outlive(null, 'close', 'close'), ok2 = await outlive(null, 'kill', 'kill');
  const PSRC = read('src/server/child-starter-proc.js');
  const HELD = MC.write('src/server/child-starter-proc.js', anchored(PSRC, "  c.on('error', (e) => { if (said) return; said = true; no(e); });\n", "  held.set(id, c);\n  c.on('error', (e) => { if (said) return; said = true; no(e); });\n", 'B-323e the detached child held'), 'held-daemon');
  const ocR = await outlive(HELD, 'close-red', 'close');
  ok(oc.started && oc.starterGone && oc.daemon && ok2.started && ok2.starterGone && ok2.daemon && ocR.started && ocR.starterGone && !ocR.daemon,
    `② LAW 1: the detached daemon OUTLIVES its starter — the starter's pipe closed (it ended by itself: ${oc.starterGone}) and a starter killed (a fault): the daemon lives (${oc.daemon}, ${ok2.daemon}) — RED a starter that holds it: its end kills it (${ocR.daemon})`, { oc, ok2, ocR });

  console.log('③ adopted by a fresh manager (a restart)');
  const mm1b = mmOf(MOUNTS, 'a', R1);   // the same data dir, a new manager: nothing recorded in memory
  const adopted = await mm1b._adoptable(mp1, R1.id);
  ok(!!d1 && adopted === d1, `③ a fresh manager (a restart) ADOPTS it by its own look (the argv walk): ${adopted} = the daemon ${d1}`, { adopted, d1 });

  console.log('④ law 2: a reply lost — one daemon a mount point');
  const lostReply = async (M, tag) => {
    const R = { id: 'mds-' + tag, name: 'mds ' + tag, type: 'sftp', desired: 'mounted' };
    const mm = mmOf(M, tag, R), mp = mm.pathOf(R); let asks = 0, lost = true;
    const W = { stats: () => S.stats(), run: (cmd, args, o) => { if (o && o.detach) asks++; const p = S.run(cmd, args, o); if (o && o.detach && lost) { lost = false; return p.then((r) => { if (r && r.pid) ownDaemon(r.pid, r.starttime); return { unknown: true, why: 'its reply lost' }; }); } return p.then((r) => { if (r && r.pid) ownDaemon(r.pid, r.starttime); return r; }); } };
    CS.setChildStarter(W);
    try { const first = await mm.mount(R.id); const second = await mm.mount(R.id); let live = 0; for (let k = 0; k < 80; k++) { live = await walkCount(mm, mp); if (live >= asks) break; await sleep(50); } return { first, second, asks, live }; } finally { CS.setChildStarter(S); }   // its follow: a wait on the count (a loaded box)
  };
  const lr = await lostReply(MOUNTS, 'lost');
  const MSRC = read('src/mounts.js');
  const NOLOOK = MC.load('src/mounts.js', anchored(MSRC, '    const pid0 = await this._adoptable(this.pathOf(m), id);\n', '    const pid0 = 0;\n', 'B-323e the adoption look cut'), 'no-look');
  const lrR = await lostReply(NOLOOK, 'lost-red');
  ok(lr.first === false && lr.asks === 1 && lr.live === 1 && lrR.asks === 2 && lrR.live === 2,
    `④ LAW 2: the start ran but its reply was LOST (the first connect says «could not be started»); the next turn's own look finds it — ${lr.asks} start, ${lr.live} daemon on the mount point — RED the look cut: ${lrR.asks} starts, ${lrR.live} daemons on one mount point`, { lr, lrR });

  // ④b LAW 2 WITH NO /proc (a hub on macOS): no walk can find a daemon whose start's reply was LOST — the next connect waits on it as on
  // «can't tell» (bounded; the mount table would show it mounted meanwhile), never a second daemon at once — RED the lost start unmarked
  const lostNoProc = async (M, tag) => {
    const R = { id: 'mds-' + tag, name: 'mds ' + tag, type: 'sftp', desired: 'mounted' };
    const mm = mmOf(M, tag, R); mm._procOpts = { procRoot: path.join(T, 'no-proc-' + tag) }; mm._cantTellMs = 50;   // a /proc root that is not there; «can't tell»'s own bound tiny
    let asks = 0, lost = true;
    const W = { stats: () => S.stats(), run: (cmd, args, o) => { if (o && o.detach) asks++; const p = S.run(cmd, args, o); if (o && o.detach && lost) { lost = false; return p.then((r) => { if (r && r.pid) ownDaemon(r.pid, r.starttime); return { unknown: true, why: 'its reply lost' }; }); } return p.then((r) => { if (r && r.pid) ownDaemon(r.pid, r.starttime); return r; }); } };
    CS.setChildStarter(W);
    try { const first = await mm.mount(R.id); const second = await mm.mount(R.id); await sleep(150); const third = await mm.mount(R.id); await sleep(150); return { first, second, third, asks, waiting: !!(mm._cantTell && mm._cantTell.has(mm.pathOf(R))), words: String(mm._errors.get(R.id) || '') }; } finally { CS.setChildStarter(S); }   // the third connect: past «can't tell»'s own bound (its clock starts at the second)
  };
  const ln = await lostNoProc(MOUNTS, 'lost-np');
  const NOMARK = MC.load('src/mounts.js', anchored(MSRC, "      if (st && st.unknown && !unasked(st) && !hasProc(this._procOpts)) (this._lostStart = this._lostStart || new Map()).set(mp, Date.now());", '      if (false) (this._lostStart = new Map());', 'B-323e the lost start unmarked'), 'no-mark');
  const lnR = await lostNoProc(NOMARK, 'lost-np-red');
  const NOCEIL = MC.load('src/mounts.js', anchored(MSRC, '    if (noProc && lost != null && now - lost < (this._startingT || MountManager.STARTING).ceilingMs) return null;', '', 'B-323e the lost start held by «can\'t tell»\'s bound'), 'no-ceil');
  const lnC = await lostNoProc(NOCEIL, 'lost-np-ceil');
  const LOSTW = require(path.join(REPO, 'src/mount-error-words.js')).wordsFor('start_lost_wait', { min: '20' });
  ok(ln.first === false && ln.second === false && ln.third === false && ln.asks === 1 && ln.waiting && ln.words === LOSTW && lnR.asks === 2 && lnC.asks === 2,
    `④b LAW 2 with NO /proc: the start's reply LOST, no walk to look — the next connect WAITS on it as on «can't tell» (${ln.asks} start; waiting: ${ln.waiting}), held for as long as a START may take (its ceiling), past «can't tell»'s own bound — RED the lost start unmarked: ${lnR.asks} starts on one mount point at once; RED held by «can't tell»'s bound: ${lnC.asks} starts once it passed (the lost daemon may still be scanning)`, { ln, lnR, lnC });

  // ④c its follow (主开发 r1782 (2)): THE HOLD ONLY WHERE NO WALK CAN LOOK — on a hub WITH /proc a lost start then a «can't tell»
  // episode on that mount point waits «can't tell»'s own bound, never the start's ceiling — RED the hold on every road (the unit's form)
  const lostWithProc = async (M, tag) => {
    const R = { id: 'mds-' + tag, name: 'mds ' + tag, type: 'sftp', desired: 'mounted' };
    const mm = mmOf(M, tag, R), mp = mm.pathOf(R); mm._cantTellMs = 50;   // «can't tell»'s own bound tiny
    (mm._lostStart = new Map()).set(mp, Date.now());   // a start whose reply was lost, just now
    mm._daemonPids = async () => { throw Object.assign(new Error('a process could not be read'), { code: 'walk_unknown', partial: [], unreadPids: [process.pid] }); };   // the walk can look, and cannot tell
    const first = await mm._adoptable(mp, R.id); await sleep(80); const later = await mm._adoptable(mp, R.id);   // past «can't tell»'s bound
    return { first, later };
  };
  const lw = await lostWithProc(MOUNTS, 'lost-wp');
  const EVERYROAD = MC.load('src/mounts.js', anchored(MSRC, '    if (noProc && lost != null && now - lost <', '    if (lost != null && now - lost <', 'B-323e the lost start held where a walk can look'), 'every-road');   // stale-pins: kept (a red control plants the old road back)
  const lwR = await lostWithProc(EVERYROAD, 'lost-wp-red');
  ok(lw.first === null && lw.later === 0 && lwR.first === null && lwR.later === null,
    `④c the lost start's hold only where no walk can look: on a hub WITH /proc a «can't tell» after a lost start waits its own bound, then connects (${lw.first} → ${lw.later}) — RED the hold on every road: still held past it (${lwR.later})`, { lw, lwR });

  console.log('⑤ law 3: the env is the child\'s alone');
  const environ = (pid) => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { return null; } };
  const cmdline = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { return null; } };
  const laterOf = async (st) => { const r = await st.run('env', [], { timeoutMs: 10000, capture: true }); return String((r && r.stdout) || ''); };
  const s5 = S._proc() && S._proc().pid;
  const later = await laterOf(S);
  const env5 = { daemon: (environ(d1) || '').includes(SEC), argv: (cmdline(d1) || '').includes(SEC), starter: (environ(s5) || '').includes(SEC), later: later.includes(SEC), journal: held.some((l) => l.includes(SEC)) || slog.some((l) => l.includes(SEC)) };
  const KEEP = MC.write('src/server/child-starter-proc.js', anchored(PSRC, "  m.env = null;   // the request keeps no sign-in material once its child's env is built\n", "  m.env = null; Object.assign(process.env, env);\n", 'B-323e a starter that keeps the request env'), 'keep-env');
  const SK = CS.createChildStarter({ script: KEEP, log: capLog });
  await startVia(SK, 'keep'); const laterR = await laterOf(SK); SK.closePipe();
  ok(environ(d1) !== null && env5.daemon && !env5.argv && !env5.starter && !env5.later && !env5.journal && laterR.includes(SEC),
    `⑤ LAW 3: the record's sign-in material is in the daemon's env (${env5.daemon}) and nowhere else — not its argv, not the starter's exec-time env (its /proc environ — what it was started with; its env in memory is the LATER child's check and its red), not a LATER child of the starter, not this process's journal nor the starters' own — RED a starter that keeps the request's env: its later child has it (${laterR.includes(SEC)})`, env5);

  console.log('⑥ law 4: the log path is the hub\'s own');
  const judged = (mm, id) => { try { return mm._mountLogFile(id); } catch (e) { return (e && e.code) || String(e); } };
  const j1 = judged(mm1, '../outside'), j2 = judged(mm1, 'mds-a');
  const NOJUDGE = MC.load('src/mounts.js', anchored(MSRC, "    if (String(id).includes('\\0') || path.dirname(f) !== dir || path.basename(f) !== `${id}.log`) throw Object.assign(new Error('a mount log path outside its folder'), { code: 'log_path' });\n", '', 'B-323e the log path judge cut'), 'no-judge');
  const j3 = judged(mmOf(NOJUDGE, 'judge', null), '../outside');
  ok(j1 === 'log_path' && j2 === path.join(T, 'data-a', 'mount-logs', 'mds-a.log') && typeof j3 === 'string' && j3.endsWith(path.join('data-judge', 'outside.log')),
    `⑥ LAW 4: the daemon's log is the record's own file under the mount logs folder, judged before any ask — an id that leaves it is refused (${j1}) — RED the judge cut: ${j3}`, { j1, j2, j3 });

  console.log('⑦ law 5: no start is no verdict');
  const noStart = async (tag, starter, M = MOUNTS, { nobin = false } = {}) => {
    const R = { id: 'mds-' + tag, name: 'mds ' + tag, type: 'sftp', desired: 'mounted' };
    const mm = mmOf(M, tag, R); const h0 = held.length;
    if (nobin) mm.rcloneBin = () => path.join(T, 'no-such-rclone');
    if (starter) CS.setChildStarter(starter);
    let r; try { r = await mm.mount(R.id); } finally { CS.setChildStarter(S); }
    const said = held.slice(h0).join(' | ');
    return { r, words: mm._errors.get(R.id) || '', watched: !!(mm._starting && mm._starting.has(R.id)), couldNot: /could not be started/.test(said), died: /\bdied\b/.test(said) };
  };
  const NOANS = { stats: () => S.stats(), run: (cmd, args, o) => (o && o.detach ? Promise.resolve({ unknown: true, why: 'no answer' }) : S.run(cmd, args, o)) };
  const NOSTARTER = { stats: () => S.stats(), run: (cmd, args, o) => (o && o.detach ? Promise.resolve({ unknown: true, why: 'no starter' }) : S.run(cmd, args, o)) };
  const NOSPAWN = { stats: () => S.stats(), run: (cmd, args, o) => (o && o.detach ? Promise.resolve({ unknown: true, why: 'the starter could not be started' }) : S.run(cmd, args, o)) };   // its read (NIT 3): its own start failed
  const nb = await noStart('nobin', null, MOUNTS, { nobin: true }), na = await noStart('noanswer', NOANS);
  const UNANS = require(path.join(REPO, 'src/mount-error-words.js')).wordsFor('start_unanswered'), NOTASKED = require(path.join(REPO, 'src/mount-error-words.js')).wordsFor('start_not_asked');   // line 385's small follow: a starter that never ran — nothing was started, said so
  // RED the no answer read as «exited» (this unit's first form); RED the failure branch cut (the release's road: a watch over no pid)
  const EXITED = MC.load('src/mounts.js', anchored(MSRC, "this._sayW(id, unasked(st) ? 'start_not_asked' : st && st.unknown ? 'start_unanswered' : 'start_exited')", "this._sayW(id, 'start_exited')", 'B-323e no answer read as exited'), 'no-answer-exited');
  const NOBRANCH = MC.load('src/mounts.js', anchored(MSRC, '    if (!st || !st.started || !st.pid) {\n', '    if (false) {\n', 'B-323e the no-start branch cut'), 'no-branch');
  const naR = await noStart('noanswer-red', NOANS, EXITED), nbR = await noStart('nobin-red', null, NOBRANCH, { nobin: true });
  const nst = await noStart('nostarter', NOSTARTER), nsp = await noStart('nospawn', NOSPAWN);
  const NSW = MC.load('src/mounts.js', anchored(MSRC, "unasked(st) ? 'start_not_asked' : st && st.unknown ? 'start_unanswered' : 'start_exited'", "st && st.unknown && !unasked(st) ? 'start_unanswered' : 'start_exited'", 'B-323e a never-ran starter read as «exited»'), 'no-starter-words');   // stale-pins: kept (a red control plants the old road back)
  const nstR = await noStart('nostarter-red', NOSTARTER, NSW);
  const quiet = (x) => x.r === false && !x.watched && x.couldNot && !x.died;
  ok(quiet(nb) && quiet(na) && nb.words === 'rclone exited before mounting' && na.words === UNANS && naR.words === 'rclone exited before mounting' && !quiet(nbR) && quiet(nst) && nst.words === NOTASKED && quiet(nsp) && nsp.words === NOTASKED && nstR.words === 'rclone exited before mounting',
    `⑦ LAW 5: a start that could not be made (no such program) and one with NO ANSWER read «could not be started» in the journal, never «died», nothing watched; the person's words: no such program «${nb.words}» (the release's), no answer «${na.words}» (no verdict) — a starter that never ran its own words («${nst.words}») — RED them read as «exited» («${nstR.words}»); RED the no answer read as «exited» («${naR.words}»); RED the no-start branch cut: the release's road, a watch over no pid (${JSON.stringify({ r: nbR.r, watched: nbR.watched, died: nbR.died })})`, { nb, na, naR, nbR });
  console.log('⑧ a person\'s Disconnect during the start (its follow, 主开发 r1782 (1), with its read\'s cures)');
  // the starter's answer HELD (a placed stall) while the daemon already runs; the person's Disconnect comes meanwhile: nothing is set
  // wanted again and that daemon is ended by the identity its starter answered — RED the generation not read again (wanted again,
  // alive). ⑧b its answer LOST (it started; no answer reached the hub): with /proc its walk ends it, with none the next start on that
  // mount point waits for it — RED the lost answer not read there. ⑧s it MOUNTED before it was ended: the dead endpoint is released
  // (an internal unmount, the person's word unchanged) — RED that release cut. ⑧c a Connect AFTER that Disconnect (it joins the
  // connect in flight) is the person's last word: a connect anew — RED the join read as before
  // r5094 (the r3209 retally's unit A): ps's elapsed time of a process born within a clock tick of the read WRAPS (the probe read it
  // «441077234-00:18:40» — its start a tick past ps's clock); the product's age gate then rightly holds a row it cannot place
  const WRAPPED_ETIME = '441077234-00:18:40';
  const etimeOf = (pid) => { try { return CP.execFileSync('ps', ['-o', 'etime=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).trim(); } catch { return null; } };
  const discDuring = async (M, tag, { lost = false, mounted = false, again = false, twice = false, noProc = false, stranger = false, wrapPs = false } = {}) => {
    const R = { id: 'mds-' + tag, name: 'mds ' + tag, type: 'sftp', desired: 'mounted' };
    const mm = mmOf(M, tag, R), mp = mm.pathOf(R); let release; const gate = new Promise((r) => { release = r; });
    const started = [], after = []; let released = false, mountedNow = false, strangerKid = null, noReading = null;
    // THE SCENE's FACTS (B-3dbd, 主开发 r5363): the starter's first answer awaited as itself; every ps row the PRODUCT reads through its
    // starter (the pid it asked, what came back) and every /proc walk it made (finished, or cut by its own bound) — the legs read them
    let firstAnswered = null; const firstStart = new Promise((x) => { firstAnswered = x; });
    const psReads = [], walks = [];
    if (noProc) mm._procOpts = { procRoot: path.join(T, 'no-proc-' + tag) };
    if (mounted) mm.isMounted = () => mountedNow;
    mm._adoptable = async () => 0;   // ⑧ reads the re-check after the answer, never the adoption look (each look walks /proc: seconds on a loaded box)
    mm._ensureMountpointDir = async () => null; mm._rcloneFlagsHelp = '--vfs-cache-mode --rc-addr'; mm._countCacheFiles = async () => ({ n: 0, capped: false });   // …nor the connect's side children (the mount point's helper, the help probes, the cache count: each a start on a loaded box)
    mm._startingT = { ...mm._startingT, quickMs: 50 };   // a fresh connect's quick look (⑧c), short
    if (typeof mm._walk === 'function') { const walk0 = mm._walk.bind(mm); mm._walk = async (o) => { const w = { at: Date.now() }; walks.push(w); try { const x = await walk0(o); w.done = true; w.ids = ((x && x.ids) || []).map((i) => i.pid); return x; } catch (e) { w.done = false; w.partial = ((e && e.partial) || []).map((i) => i.pid); throw e; } finally { w.ms = Date.now() - w.at; } }; }
    const W = { stats: () => S.stats(), run: (cmd, args, o) => {
      if (released) after.push(path.basename(String(cmd)));
      const p = S.run(cmd, args, o);
      const isPs = !(o && o.detach) && path.basename(String(cmd)) === 'ps', psPid = isPs ? Number((args || [])[(args || []).indexOf('-p') + 1]) : 0;
      const seen = (q) => (isPs ? q.then((x) => { psReads.push({ pid: psPid, code: x ? x.code : null, unknown: !!(x && x.unknown), out: String((x && x.stdout) || '').trim() }); return x; }) : q);   // what the PRODUCT got back
      if (wrapPs && strangerKid && isPs && (args || []).includes(String(strangerKid.pid))) return seen(p.then((x) => (x && x.code === 0 ? { ...x, stdout: String(x.stdout || '').replace(/^(\s*\S+\s+)\S+/, '$1' + WRAPPED_ETIME) } : x)));   // PLACED (unit A): the stranger's row as the box gives it within a tick of its birth
      if (!(o && o.detach)) return seen(p);
      return p.then(async (r) => { if (r && r.pid) ownDaemon(r.pid, r.starttime); started.push(r); if (started.length === 1) { firstAnswered(); await gate; if (lost) return { unknown: true, why: 'its reply lost' };
        if (stranger) { strangerKid = CP.spawn('sleep', ['30'], { stdio: 'ignore' }); await new Promise((x) => strangerKid.once('spawn', x));
          // r5094 (unit A — 6 reds at the current file, every one at a lower load than the median): the stranger is ANSWERED only once
          // its own ps row reads its TRUE age — answered at its birth, ps's etime wrapped and the product's age gate held it on BOTH
          // copies, so the control could not tell the program check's work from the age gate's. Waited on as its fact; its expiry said
          const trueAge = await until(() => { const e = etimeOf(strangerKid.pid); return !!e && !/^\d+-/.test(e); }, 10000);
          if (!trueAge) noReading = `the stranger's ps row never read its true age within 10 s (its last etime ${etimeOf(strangerKid.pid)}): the scene did not form`;
          return { ...r, pid: strangerKid.pid, starttime: null }; } }   // the answered pid a STRANGER's, started inside the window
        return r; });
    } };
    CS.setChildStarter(W);
    try {
      const conn = mm.mount(R.id);
      // B-3dbd (主开发 r3297): each wait of this scene ends ON ITS FACT, bounded at 30 s (the release gave the start 5 s and the end 2 s,
      // and read what had come: with no /proc the end reads the daemon's identity through a ps child, slower than 2 s on the loaded pod)
      // the daemon runs, its starter's answer not yet heard: the starter's own first answer, awaited AS ITSELF (30 s, the ceiling's end NO READING)
      if (await lateOf(firstStart, 30000)) noReading = noReading || 'the starter never answered the stand-in daemon\'s start within 30 s: the scene did not form';
      if (mounted) mountedNow = true;                 // …and it mounted meanwhile
      await mm.unmount(R.id);                         // the person's Disconnect, meanwhile
      const conn2 = again ? mm.mount(R.id) : null;    // …then the person's Connect again: it joins the connect in flight
      if (twice) await mm.unmount(R.id);              // …and a Disconnect again: the last word
      released = true; release(); const r = await conn; const r2 = conn2 ? await conn2 : null;
      const d0 = started[0] && started[0].pid;
      // its end waited on, as the fact it is — OR the product's other road, the next start held for it (a lost answer with no /proc:
      // the daemon is left to the next start, its mark set) — whichever the product chose; a red's daemon lives (nothing ends it): read at once
      if (M === MOUNTS && !stranger) await until(() => !(d0 && alive(d0)) || !!(mm._lostStart && mm._lostStart.has(mp)), 30000);
      const rec = mm._state.mounts.find((x) => x.id === R.id) || {};
      return { r, r2, desired: rec.desired, alive: !!(d0 && alive(d0)), starts: started.length, second: !!(started[1] && started[1].pid && alive(started[1].pid)),
        lostMark: !!(mm._lostStart && mm._lostStart.has(mp)), unmountAsked: after.filter((c) => c === 'fusermount3').length, strangerAlive: strangerKid ? (M === MOUNTS ? alive(strangerKid.pid) : !(await until(() => !alive(strangerKid.pid), 1000))) : null,   // a red's kill waited on (its read: never read in the signal's own instant)
        noReading, psD: psReads.filter((x) => d0 && x.pid === Number(d0)), psS: psReads.filter((x) => strangerKid && x.pid === strangerKid.pid), walks };
    } finally { release(); CS.setChildStarter(S); if (strangerKid) { try { strangerKid.kill('SIGKILL'); } catch { } } }
  };
  // A LEG THE PRODUCT's OWN «CAN'T TELL» DECIDED IS NO READING (主开发 r5363): the scene did not form (a fact of its own never came
  // within its ceiling), or the product READ the row it judges and got nothing it could place — ps's etime wrapped (a row read within
  // a tick of its birth) or no answer within its own bound — or its own /proc walk was cut by its bound before it named the daemon.
  // A road the product never read at all stays JUDGED (a red names it). A counted line, never a red and never a pass.
  const etimeIn = (x) => (x && x.code === 0 ? (x.out.split(/\s+/)[1] || '') : '');
  const readTrue = (reads) => { const x = reads[reads.length - 1]; return !x ? null : x.code === 0 && /^(?:\d+:)?\d+:\d+$/.test(etimeIn(x)); };   // null: never read
  const readWhy = (reads, what) => { const x = reads[reads.length - 1]; return x.code === 0 ? `the product's own ps row of ${what} read etime ${etimeIn(x)} (wrapped: a row read within a tick of its birth)` : `the product's own ps read of ${what} did not answer (${x.unknown ? 'no answer from its starter' : 'code ' + x.code})`; };
  const cut = (x) => x.walks.some((w) => w.done === false) && !x.walks.some((w) => w.done);
  const judgeOr = (name, runs, judge, extra = []) => { const nr = [...runs.map((x) => x.noReading), ...extra].filter(Boolean); if (!nr.length) return judge(); console.log(`  ⊘ SKIP ${name} — NO READING under load: ${nr.join('; ')} — the leg is PARTIAL in this run`); };
  const dd = await discDuring(MOUNTS, 'disc-during');
  const NORECHECK = MC.load('src/mounts.js', anchored(MSRC, "    if (this._mountGen?.get(id) !== myGen || !this._state.mounts.some((x) => x.id === id)) {\n      if (st && st.started && st.pid) await this._endStartedDaemon(mp, st, askAt);\n", "    if (false) {\n      if (st && st.started && st.pid) await this._endStartedDaemon(mp, st, askAt);\n", 'B-323e the generation not read again after the start'), 'no-recheck');
  const ddR = await discDuring(NORECHECK, 'disc-during-red');
  judgeOr('⑧', [dd, ddR], () => ok(dd.r === false && dd.desired === 'unmounted' && !dd.alive && ddR.desired === 'mounted' && ddR.alive,
    `⑧ a person's Disconnect while the start waits on its starter's answer: the connect ends with nothing wanted again (${dd.desired}) and the daemon that started meanwhile is ended (${!dd.alive}) — RED the generation not read again: wanted again (${ddR.desired}), the daemon left running (${ddR.alive})`, { dd, ddR }));
  const dl = await discDuring(MOUNTS, 'disc-lost', { lost: true }), dlN = await discDuring(MOUNTS, 'disc-lost-np', { lost: true, noProc: true });
  const NOLOSTEND = MC.load('src/mounts.js', anchored(MSRC, '      else if (st && st.unknown && !unasked(st)) {', '      else if (false) {', 'B-323e a lost answer not read after a Disconnect'), 'no-lost-end');
  const dlR = await discDuring(NOLOSTEND, 'disc-lost-red', { lost: true }), dlNR = await discDuring(NOLOSTEND, 'disc-lost-np-red', { lost: true, noProc: true });
  judgeOr('⑧b', [dl, dlN, dlR, dlNR], () => ok(dl.r === false && dl.desired === 'unmounted' && !dl.alive && dlN.desired === 'unmounted' && dlN.lostMark && dlR.alive && !dlNR.lostMark,
    `⑧b its answer LOST, the person's Disconnect meanwhile: with /proc its walk ends the daemon (${!dl.alive}); with none the next start on that mount point waits for it (${dlN.lostMark}) — RED the lost answer not read there: the daemon left running (${dlR.alive}), nothing held (${!dlNR.lostMark})`, { dl, dlN, dlR, dlNR }), [dl.alive && cut(dl) ? `the product's own /proc walk (its answer lost) was cut by its bound before it named the daemon (${JSON.stringify(dl.walks)})` : null]);
  const dm = await discDuring(MOUNTS, 'disc-mounted', { mounted: true });
  const NORELEASE = MC.load('src/mounts.js', anchored(MSRC, '      if (this._state.mounts.some((x) => x.id === id) && this.isMounted(m)) await Promise.resolve(this.unmount(id, { internal: true })).catch(() => { });', '', 'B-323e the dead endpoint left'), 'no-release');
  const dmR = await discDuring(NORELEASE, 'disc-mounted-red', { mounted: true });
  judgeOr('⑧s', [dm, dmR], () => ok(dm.r === false && !dm.alive && dm.desired === 'unmounted' && dm.unmountAsked >= 1 && dmR.unmountAsked === 0,
    `⑧s it MOUNTED before it was ended: its dead endpoint released by an internal unmount (${dm.unmountAsked} asked), the person's word unchanged (${dm.desired}) — RED that release cut: ${dmR.unmountAsked}`, { dm, dmR }));
  const dc = await discDuring(MOUNTS, 'disc-again', { again: true });
  const NOAGAIN = MC.load('src/mounts.js', anchored(MSRC, "      if (j && (this._connWord?.get(id) || 0) !== w) return j.catch(() => { }).then(() => ((this._word?.get(id) || 0) !== w || !this._state.mounts.some((x) => x.id === id) ? false : this.mount(id)));", '      if (false) return j;', 'B-323e a Connect after the Disconnect read as a join'), 'no-again');   // stale-pins: kept (a red control plants the old road back)
  const dcR = await discDuring(NOAGAIN, 'disc-again-red', { again: true });
  judgeOr('⑧c', [dc, dcR], () => ok(dc.r === false && dc.desired === 'mounted' && dc.starts === 2 && !dc.alive && dc.second && dcR.r2 === false && dcR.desired === 'unmounted' && dcR.starts === 1,
    `⑧c Connect → Disconnect → Connect during one start: the last word stands — the first start ended (${!dc.alive}), a connect anew (${dc.starts} starts, the second alive: ${dc.second}, wanted: ${dc.desired}) — RED the join read as before: ${dcR.r2}, ${dcR.desired}, ${dcR.starts} start`, { dc, dcR }));
  // ⑧e its second read (MUST): Connect → Disconnect → Connect → Disconnect during one start — the LAST word stands: no connect anew —
  // RED the person's word not read again before the connect anew (a Disconnect overridden)
  const de = await discDuring(MOUNTS, 'disc-twice', { again: true, twice: true });
  const NOWORD = MC.load('src/mounts.js', anchored(MSRC, "((this._word?.get(id) || 0) !== w || !this._state.mounts.some((x) => x.id === id) ? false : this.mount(id))", '(this.mount(id))', 'B-323e the later Disconnect not read'), 'no-word');
  const deR = await discDuring(NOWORD, 'disc-twice-red', { again: true, twice: true });
  judgeOr('⑧e', [de, deR], () => ok(de.r2 === false && de.desired === 'unmounted' && de.starts === 1 && !de.alive && deR.desired === 'mounted' && deR.starts === 2,
    `⑧e Connect → Disconnect → Connect → Disconnect during one start: the last word stands — no connect anew (${de.starts} start, ${de.desired}) — RED the later Disconnect not read: ${deR.starts} starts, ${deR.desired}`, { de, deR }));
  // ⑧n its second read (SHOULD): with NO /proc the answered daemon is ended by its ps identity, proven ours by a start no earlier than
  // the ask — RED that proof cut (never ended; the next start held for it)
  const dn = await discDuring(MOUNTS, 'disc-np', { noProc: true });
  const NOPS = MC.load('src/mounts.js', anchored(MSRC, "target = ours ? { pid: ident.pid, starttime: null, lstart: row.lstart, bootId: '' } : null;", 'target = null;', 'B-323e no /proc: no end by ps'), 'no-ps');
  const dnR = await discDuring(NOPS, 'disc-np-red', { noProc: true });
  judgeOr('⑧n', [dn, dnR], () => ok(dn.r === false && dn.desired === 'unmounted' && !dn.alive && !dn.lostMark && dnR.alive && dnR.lostMark,
    `⑧n with NO /proc the daemon started for a mount disconnected meanwhile is ended by its ps identity (${!dn.alive}), nothing held (${!dn.lostMark}) — RED that proof cut: left running (${dnR.alive}), the next start held for it (${dnR.lostMark})`, { dn, dnR }), [readTrue(dn.psD) === false ? readWhy(dn.psD, 'the daemon') : null]);
  // ⑧n2 line 385's small follow (主开发 r2259 (1)): the answered pid freed and taken by a STRANGER inside the window (a fresh start, another
  // program): never signalled — the next start held for it, said — RED the program not read (the stranger killed)
  const dnS = await discDuring(MOUNTS, 'disc-np-stranger', { noProc: true, stranger: true });
  const NOPROG = MC.load('src/mounts.js', anchored(MSRC, "const ours = !!row && path.basename(row.comm || '').slice(0, 15) === prog && Number.isFinite(age)", 'const ours = !!row && Number.isFinite(age)', 'B-323e no /proc: the program not read'), 'no-prog');
  const dnSR = await discDuring(NOPROG, 'disc-np-stranger-red', { noProc: true, stranger: true });
  judgeOr('⑧n2', [dnS, dnSR], () => ok(dnS.r === false && dnS.strangerAlive === true && dnS.lostMark && dnSR.strangerAlive === false,
    `⑧n2 with NO /proc a pid freed and taken by a STRANGER inside the window (a fresh start, another program) is never signalled (it lives: ${dnS.strangerAlive}); the next start waits (${dnS.lostMark}) — RED the program not read: the stranger killed (${!dnSR.strangerAlive})`, { dnS, dnSR }), [readTrue(dnSR.psS) === false ? `its RED copy: ${readWhy(dnSR.psS, 'the stranger')}` : null]);
  // PLACED ⑧n2 (r5094, unit A — the find made red at will): the stranger's ps row served as the box gives it within a tick of its birth
  // (its etime WRAPPED): the age gate holds it on BOTH copies — the mutant that reads no program too — so the old control could not tell
  // them apart (the reds' road); the scene above answers the stranger only once its row reads its true age
  const dnSw = await discDuring(MOUNTS, 'disc-np-stranger-wrap', { noProc: true, stranger: true, wrapPs: true });
  const dnSRw = await discDuring(NOPROG, 'disc-np-stranger-wrap-red', { noProc: true, stranger: true, wrapPs: true });
  judgeOr('PLACED ⑧n2', [dnSw, dnSRw], () => ok(dnSw.strangerAlive === true && dnSRw.strangerAlive === true && dnSRw.lostMark,
    `PLACED ⑧n2: a stranger read within a tick of its birth (ps's etime wrapped to ${WRAPPED_ETIME}) — the age gate holds it on both copies (the mutant too: alive ${dnSRw.strangerAlive}, held ${dnSRw.lostMark}): the old control could not tell them apart — RED with nothing wrong in the product`, { dnSw, dnSRw }));
  // ⑧d its read (MUST 2): ended by the ANSWERED identity alone — the person's Unmount ended it first (its walk's mark) and the kernel gave
  // its pid away (a stranger, this suite's own sleeper): never signalled — RED the record, else the identity read NOW (the stranger killed)
  const stranger = CP.spawn('sleep', ['30'], { stdio: 'ignore' }); await new Promise((r) => stranger.once('spawn', r));
  const wasStart = PI.starttimeOf(stranger.pid) - 1;   // the ended daemon's start: not the stranger's
  const endOver = (M, tag) => { const mmS = mmOf(M, tag, null); (mmS._killed = new Map()).set(stranger.pid + ':' + wasStart, Date.now()); return mmS._endStartedDaemon(path.join(T, 'mp-' + tag), { started: true, pid: stranger.pid, starttime: wasStart }); };
  const e1 = await endOver(MOUNTS, 'stranger'), eLives = alive(stranger.pid);
  const OLDEND = MC.load('src/mounts.js', anchored(MSRC, "    const ident = { pid: Number(st.pid), starttime: st.starttime == null ? null : st.starttime }, key = ident.pid + ':' + ident.starttime;\n    if (this._killed && this._killed.has(key)) return true;\n",
    "    this._seedDaemonId(mp, st.pid, st.starttime);\n    const ident = (this._daemonIds && this._daemonIds.get(mp)) || PI.identityOf(st.pid, popts), key = ident ? ident.pid + ':' + ident.starttime : '';\n", 'B-323e the identity read now'), 'old-end');   // stale-pins: kept (a red control plants the old road back)
  await endOver(OLDEND, 'stranger-red'); await until(() => !alive(stranger.pid), 1000); const eLivesR = alive(stranger.pid);
  try { stranger.kill('SIGKILL'); } catch { }
  ok(e1 === true && eLives && !eLivesR, `⑧d the daemon the person's Unmount already ended, its pid now another process's: never signalled (that process lives: ${eLives}) — RED the identity read now: it is killed (${!eLivesR})`, { e1, eLives, eLivesR });

  console.log('⑨ the old road\'s detached start (after two starter faults)');
  // the starter faulted twice (a starter that cannot run): the old road starts the daemon the same way — its own session, its log,
  // answered at its spawn, alive after the starter is let go — RED the old road's detached branch cut (a child of this process, held)
  const sidOf = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[3]); } catch { return null; } };
  const oldRoad = async (CSM, tag) => {
    const k0 = slog.length; const FS = path.join(T, 'fault-starter-' + tag + '.js'); fs.writeFileSync(FS, 'process.exit(3);\n');   // a starter that ends at once: each ask is its fault
    const SO = CSM.createChildStarter({ script: FS, log: capLog });
    for (let k = 0; k < 2; k++) await SO.run(process.execPath, ['-e', '0'], { timeoutMs: 3000 }).catch(() => null);   // two faults: the old road
    const mpO = path.join(T, 'mp-old-' + tag), logO = path.join(T, 'log-old-' + tag + '.log'); fs.mkdirSync(mpO, { recursive: true }); fs.writeFileSync(logO, '');
    const r = await SO.run('rclone', ['mount', 'VS:', mpO, '--vfs-cache-mode', 'off'], { detach: { log: logO }, wholeEnv: true, env: recEnv(), timeoutMs: 300 }).catch(() => null);
    if (r && r.pid) ownDaemon(r.pid, r.starttime);
    try { SO.closePipe(); } catch { }
    await sleep(50);
    return { started: !!(r && r.started), detached: !!(r && r.detached), own: !!(r && r.pid) && sidOf(r.pid) !== null && sidOf(r.pid) !== sidOf(process.pid), lives: !!(r && r.pid && alive(r.pid)), direct: SO.stats().direct === true, said: slog.slice(k0).some((l) => /the starter failed twice/.test(l)) };
  };
  const od = await oldRoad(CS, 'old');
  const CSRC = read('src/server/child-starter.js');
  const NODETACH = MC.load('src/server/child-starter.js', anchored(CSRC, '    if (o.detach) return new Promise((resolve) => {   // B-323e: the detached start, as the starter makes it (its own session, the log, the answer at its spawn)\n', '    if (false) return new Promise((resolve) => {\n', 'B-323e the old road\'s detached branch cut'), 'no-detach-old');
  const odR = await oldRoad(NODETACH, 'old-red');
  ok(od.direct && od.said && od.started && od.detached && od.own && od.lives && !(odR.detached && odR.own && odR.lives),
    `⑨ after two starter faults the OLD ROAD starts the daemon detached: answered at its spawn (${od.started}), its own session (${od.own}), alive once the starter is let go (${od.lives}) — RED the old road's detached branch cut: ${JSON.stringify(odR)}`, { od, odR });

} finally {
  endOwn();   // this suite's own daemons, by the pid and start it holds
  // …and by their program: any process running THIS suite's own stand-in (its temp folder's rclone link) — a start no leg recorded
  // never outlives the suite (a red control's road may start one it never answers)
  const ownDaemons = () => { const out = []; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { if (fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').startsWith(path.join(ddir, 'rclone') + '\0')) out.push(Number(d)); } catch { } } return out; };
  for (const pid of ownDaemons()) { ownDaemon(pid); if (sameStart(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } }   // found by its own program's path, its start read at that look
  const ownLeft = () => [...daemons].filter((pid) => alive(pid) && sameStart(pid));
  await until(() => ownLeft().length === 0, 3000);
  ok(ownLeft().length === 0, `the suite ends its own daemons (${daemons.size}; none left)`, ownLeft());
  try { CS.setChildStarter(S); S.closePipe(); } catch { }
  console.warn = con.warn;
  fs.rmSync(T, { recursive: true, force: true });
}
report();
