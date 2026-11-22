#!/usr/bin/env node
// THE MOUNT DAEMON'S OWN START (B-323e, lane bl-machines-b, 主开发 r1299): «a mount daemon is started without the hub's main process
// starting a program, and it lives exactly as today» — THE STARTER's one new kind of ask, a DETACHED child it never signals, holds or
// counts. Fast, in-process: the real MountManager in temp data dirs and the real starter; the «daemon» a stand-in that LIVES and that
// the adoption's own walk knows — a link named rclone to `tail -f /dev/null`, so its comm and argv say rclone, mount and its mount point
// — no mount, no real mount table (the manager's seams), every program on this suite's own search path; each daemon ended by this suite
//  ① its start makes NO program start from the hub's main process; its log: the hub's marker first, then the daemon's own lines
//  ② LAW 1: it OUTLIVES its starter — the starter's pipe closed (it ends by itself) and a starter killed (a fault): the daemon lives —
//     RED a starter that holds it (its end kills it)
//  ③ adopted by a FRESH manager (a restart): its own look finds it by the argv walk
//  ④ LAW 2: a reply LOST (the starter started it, no answer reached the hub): the next turn's look finds it — ONE daemon a mount point,
//     never two — RED the look cut ⇒ a second daemon on the same mount point
//  ④b LAW 2 with NO /proc: a lost reply holds the next start on that mount point as «can't tell» (bounded) — RED the lost start unmarked
//  ⑤ LAW 3: the env is the child's alone — the record's secret in the daemon's env; never in its argv, the starter's own env, a LATER
//     child of the starter, nor this process's journal — RED a starter that keeps the request's env for later children
//  ⑥ LAW 4: the log path is the hub's own — an id that would leave the mount logs folder is refused before any ask — RED the judge cut
//  ⑦ LAW 5: a start that could not be made (no such program) or that got no answer reads «could not be started» — the person's words
//     today's («rclone exited before mounting»), never «died», nothing watched
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
const TAIL = ['/usr/bin/tail', '/bin/tail'].find((p) => fs.existsSync(p));
fs.symlinkSync(TAIL, path.join(ddir, 'rclone'));   // THE DAEMON: its comm and argv[0] say rclone; it idles on /dev/null until ended here
const SYS = 'PATH=/usr/bin:/bin';
const standin = (name, body) => fs.writeFileSync(path.join(fbin, name), `#!/bin/sh\necho "$PPID ${name} $1 $2" >> '${LOG}'\n${body}\n`, { mode: 0o755 });
standin('rclone', `case "$1" in
  help) echo '--use-accept-encoding-gzip --rc-addr --s3-use-accept-encoding-gzip' ;;
  version) echo 'rclone v1.70.0' ;;
  lsf) echo f.txt ;;
  mount) [ "$2" = --help ] && { echo '--vfs-cache-mode --rc-addr'; exit 0; }; echo 'standin daemon up'; exec '${path.join(ddir, 'rclone')}' -f /dev/null -- "$@" ;;
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
const daemons = new Set();   // every daemon this suite started: ended in finally
const recEnv = () => ({ ...serviceEnv(process.env), RCLONE_CONFIG_VS_TYPE: 's3', RCLONE_CONFIG_VS_SECRET_ACCESS_KEY: SEC });
const held = [], con = { log: console.log, warn: console.warn };   // this process's journal while the legs run
console.warn = (...a) => { held.push(a.map(String).join(' ')); con.warn(...a); };
let S = CS.createChildStarter({ log: { warn: () => { } } }); CS.setChildStarter(S);
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
  const s0 = mainStarts.length;
  await mm1.mount(R1.id);
  const d1 = (mm1._daemonIds && mm1._daemonIds.get(mp1) || {}).pid || (mm1._starting && (mm1._starting.get(R1.id) || {}).pid) || 0;
  if (d1) daemons.add(d1);
  const fromMain = mainStarts.slice(s0);
  await until(() => fs.existsSync(path.join(T, 'data-a', 'mount-logs', 'mds-a.log')) && /standin daemon up/.test(fs.readFileSync(path.join(T, 'data-a', 'mount-logs', 'mds-a.log'), 'utf8')));
  const log1 = fs.readFileSync(path.join(T, 'data-a', 'mount-logs', 'mds-a.log'), 'utf8');
  ok(d1 > 0 && alive(d1) && fromMain.length === 0 && log1.indexOf(MOUNTS.MountManager.LOG_MARK) >= 0 && log1.indexOf(MOUNTS.MountManager.LOG_MARK) < log1.indexOf('standin daemon up'),
    `① the daemon (pid ${d1}) started with NO program from the hub's main process (${fromMain.length}: ${fromMain.join(', ')}); its log holds the hub's marker, then the daemon's own lines`, { d1, fromMain, log: log1.slice(0, 200) });

  console.log('② law 1: it outlives its starter');
  const startVia = async (st, tag) => { const mp = path.join(T, 'mp-' + tag); const logP = path.join(T, 'log-' + tag + '.log'); const r = await st.run('rclone', ['mount', 'VS:', mp, '--vfs-cache-mode', 'full'], { detach: { log: logP }, wholeEnv: true, env: recEnv(), timeoutMs: 10000 }); if (r && r.pid) daemons.add(r.pid); return r; };
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
    const W = { stats: () => S.stats(), run: (cmd, args, o) => { if (o && o.detach) asks++; const p = S.run(cmd, args, o); if (o && o.detach && lost) { lost = false; return p.then((r) => { if (r && r.pid) daemons.add(r.pid); return { unknown: true, why: 'its reply lost' }; }); } return p.then((r) => { if (r && r.pid) daemons.add(r.pid); return r; }); } };
    CS.setChildStarter(W);
    try { const first = await mm.mount(R.id); const second = await mm.mount(R.id); await sleep(150); return { first, second, asks, live: await walkCount(mm, mp) }; } finally { CS.setChildStarter(S); }
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
    const W = { stats: () => S.stats(), run: (cmd, args, o) => { if (o && o.detach) asks++; const p = S.run(cmd, args, o); if (o && o.detach && lost) { lost = false; return p.then((r) => { if (r && r.pid) daemons.add(r.pid); return { unknown: true, why: 'its reply lost' }; }); } return p.then((r) => { if (r && r.pid) daemons.add(r.pid); return r; }); } };
    CS.setChildStarter(W);
    try { const first = await mm.mount(R.id); const second = await mm.mount(R.id); await sleep(150); const third = await mm.mount(R.id); await sleep(150); return { first, second, third, asks, waiting: !!(mm._cantTell && mm._cantTell.has(mm.pathOf(R))) }; } finally { CS.setChildStarter(S); }   // the third connect: past «can't tell»'s own bound (its clock starts at the second)
  };
  const ln = await lostNoProc(MOUNTS, 'lost-np');
  const NOMARK = MC.load('src/mounts.js', anchored(MSRC, "      if (st && st.unknown && st.why !== 'no starter') (this._lostStart = this._lostStart || new Map()).set(mp, Date.now());", '      if (false) (this._lostStart = new Map());', 'B-323e the lost start unmarked'), 'no-mark');
  const lnR = await lostNoProc(NOMARK, 'lost-np-red');
  const NOCEIL = MC.load('src/mounts.js', anchored(MSRC, '    if (lost != null && now - lost < (this._startingT || MountManager.STARTING).ceilingMs) return null;\n', '', 'B-323e the lost start held by «can\'t tell»\'s bound'), 'no-ceil');
  const lnC = await lostNoProc(NOCEIL, 'lost-np-ceil');
  ok(ln.first === false && ln.second === false && ln.third === false && ln.asks === 1 && ln.waiting && lnR.asks === 2 && lnC.asks === 2,
    `④b LAW 2 with NO /proc: the start's reply LOST, no walk to look — the next connect WAITS on it as on «can't tell» (${ln.asks} start; waiting: ${ln.waiting}), held for as long as a START may take (its ceiling), past «can't tell»'s own bound — RED the lost start unmarked: ${lnR.asks} starts on one mount point at once; RED held by «can't tell»'s bound: ${lnC.asks} starts once it passed (the lost daemon may still be scanning)`, { ln, lnR, lnC });

  console.log('⑤ law 3: the env is the child\'s alone');
  const environ = (pid) => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { return null; } };
  const cmdline = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { return null; } };
  const laterOf = async (st) => { const r = await st.run('env', [], { timeoutMs: 10000, capture: true }); return String((r && r.stdout) || ''); };
  const s5 = S._proc() && S._proc().pid;
  const later = await laterOf(S);
  const env5 = { daemon: (environ(d1) || '').includes(SEC), argv: (cmdline(d1) || '').includes(SEC), starter: (environ(s5) || '').includes(SEC), later: later.includes(SEC), journal: held.some((l) => l.includes(SEC)) };
  const KEEP = MC.write('src/server/child-starter-proc.js', anchored(PSRC, "  m.env = null;   // the request keeps no sign-in material once its child's env is built\n", "  m.env = null; Object.assign(process.env, env);\n", 'B-323e a starter that keeps the request env'), 'keep-env');
  const SK = CS.createChildStarter({ script: KEEP, log: { warn: () => { } } });
  await startVia(SK, 'keep'); const laterR = await laterOf(SK); SK.closePipe();
  ok(environ(d1) !== null && env5.daemon && !env5.argv && !env5.starter && !env5.later && !env5.journal && laterR.includes(SEC),
    `⑤ LAW 3: the record's sign-in material is in the daemon's env (${env5.daemon}) and nowhere else — not its argv, not the starter's own env, not a LATER child of the starter, not this process's journal — RED a starter that keeps the request's env: its later child has it (${laterR.includes(SEC)})`, env5);

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
  const nb = await noStart('nobin', null, MOUNTS, { nobin: true }), na = await noStart('noanswer', NOANS);
  const UNANS = require(path.join(REPO, 'src/mount-error-words.js')).wordsFor('start_unanswered');
  // RED the no answer read as «exited» (this unit's first form); RED the failure branch cut (the release's road: a watch over no pid)
  const EXITED = MC.load('src/mounts.js', anchored(MSRC, "this._sayW(id, st && st.unknown ? 'start_unanswered' : 'start_exited')", "this._sayW(id, 'start_exited')", 'B-323e no answer read as exited'), 'no-answer-exited');
  const NOBRANCH = MC.load('src/mounts.js', anchored(MSRC, '    if (!st || !st.started || !st.pid) {\n', '    if (false) {\n', 'B-323e the no-start branch cut'), 'no-branch');
  const naR = await noStart('noanswer-red', NOANS, EXITED), nbR = await noStart('nobin-red', null, NOBRANCH, { nobin: true });
  const quiet = (x) => x.r === false && !x.watched && x.couldNot && !x.died;
  ok(quiet(nb) && quiet(na) && nb.words === 'rclone exited before mounting' && na.words === UNANS && naR.words === 'rclone exited before mounting' && !quiet(nbR),
    `⑦ LAW 5: a start that could not be made (no such program) and one with NO ANSWER read «could not be started» in the journal, never «died», nothing watched; the person's words: no such program «${nb.words}» (the release's), no answer «${na.words}» (no verdict) — RED the no answer read as «exited» («${naR.words}»); RED the no-start branch cut: the release's road, a watch over no pid (${JSON.stringify({ r: nbR.r, watched: nbR.watched, died: nbR.died })})`, { nb, na, naR, nbR });
} finally {
  for (const pid of daemons) { if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } }   // this suite's own daemons, by the pids their starts answered
  // …and by their program: any process running THIS suite's own stand-in (its temp folder's rclone link) — a start no leg recorded
  // never outlives the suite (a red control's road may start one it never answers)
  const ownDaemons = () => { const out = []; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { if (fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').startsWith(path.join(ddir, 'rclone') + '\0')) out.push(Number(d)); } catch { } } return out; };
  for (const pid of ownDaemons()) { daemons.add(pid); try { process.kill(pid, 'SIGKILL'); } catch { } }
  await until(() => [...daemons].every((pid) => !alive(pid)), 3000);
  ok([...daemons].every((pid) => !alive(pid)), `the suite ends its own daemons (${daemons.size}; none left)`, [...daemons].filter(alive));
  try { CS.setChildStarter(S); S.closePipe(); } catch { }
  console.warn = con.warn;
  fs.rmSync(T, { recursive: true, force: true });
}
report();
