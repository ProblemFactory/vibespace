#!/usr/bin/env node
// THE HUB'S TIMER-FIRED STARTS RIDE ITS STARTER (B-323e's build, lane bl-keys-misc — 主开发 r1351: «THE BUILD AS YOU ORDER IT, one
// unit, worst first»). A start from the hub's main process forks the whole hub (45–54 ms per GB of its RSS: 0.2–0.25 s at the
// owner's 4.5–5 GB); the hub's starter (src/server/child-starter.js) starts them instead. Every leg runs the product code with a
// FAKE starter handed in (setChildStarter) and a SPY on child_process put in place BEFORE any product module loads (it answers
// «not run» and counts — nothing real starts); each leg's RED is a copy of the release's code, read the same way.
//   ① the Jobs list's two reads: through the starter, ONE answer for every page and render for 30 s, one read in flight shared
//      (RED: a copy with no cache starts two a render; a copy on the old road starts them directly)
//   ② the multiplexer's pane list: the main thread asks the starter; the sweep's WORKER is handed the map and starts nothing
//      (RED: the release's text in a copy, in a worker)
//   ③ the memory watch's `ps` (RED: the old road)
//   ④ the version asks the hub hands the starter (RED: a copy without the hand-off)
//   ⑤ the lookup (which-kept): through the starter, kept; an aborted ask stops waiting and records nothing (RED: the old road);
//      (r2802) one lookup program a name at a time — the next ask while the aborted one's child runs joins it (RED: the abort frees the slot)
//      + the proxy plugin's runner reads the starter (census; RED: the release's text)
//   ⑥ the certificate pass's runner (its answer table) and its default; the display's lookup asynchronous through the starter
//      (RED: the release's synchronous lookup); the keeper's version ask (census; RED: the release's text)
//      (r2480) the person's Start in THE SAME MILLISECOND as a kept answer (one frozen clock): a press never reads it, «answered» by count
//   ⑦ a FAILED copy of the rclone binary is remembered for its bound (15 min), then tried again (RED: the release; a copy kept for ever)
//   ⑪ (r4379, B-323e's part 3 remainder) the mount auto-reconnect's own six starts — the CephFS shim, mount and unmount, the rc
//      socket's ask (its whole rclone env), the cache's witness and the old cache's removal — through the starter; a no-reply worded
//      by each (the mount by the mount table, the witness fail-closed, the old dir kept); FENCE: stand-in records, no mount program
//      run or copied, the real mount table never read (RED: a mutant of the helper on the release's road — every one a start from the hub)
//   ⑪b (r4444) the end signal: a start past its bound with termFirst ends SIGTERM first, so a relaying parent (as sudo) ends its child,
//      on the starter and on its direct road (RED: SIGKILL at the bound leaves the child running); a stand-in parent, no sudo, no mount
//   ⑫ (B-323e's remainder, lane nl-starts) the mount-health canary's scan of who presses a wedged mount (an episode, a held-loop item —
//      the 10 s canary's timer): asked of the starter with its program, argv, bound and buffer, nothing started from the hub; a table it
//      could not read (no reply, its bound, an exit, words that do not parse) is SAID «not read — <why>», and its item says «Who has files
//      open there could not be read.», never «No process has a file open there.» (REDs: the release's road; a catch that keeps the empty table)
// r1381 (6): every moved reader is also read with a starter that gives NO REPLY (what it then says), and the env + the bound each
// site hands are pinned.
//   ⑧ (主开发 r2030) a host with NO `which` program finds tmux the release's way (RED: the reader without the fallback); a NO-REPLY
//      BACKS OFF — the lookup, the pane list and the Jobs list's read serve their last good answer and ask nothing inside a growing
//      wait (REDs: a copy without the wait; the build's empty map); the read never rejects; the process table past its bound is
//      «not read»; a thrown stat memo is retried; a Start's helper lookups with no reply are said; the page's words; kb-api
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 600)}`); } }
const WD = armWatchdog({ capMs: 30e3 });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-starts-via-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// THE SPY — before any product module loads (a module destructures child_process at its load): a watched program is never run
const STANDIN = path.join(TMP, 'vs-standin-claude');
const WATCH = new Set(['systemctl', 'crontab', 'tmux', 'ps', 'du', 'which', 'sh', path.basename(STANDIN)]);
const cp = require('child_process');
const direct = [];
for (const fn of ['execFile', 'spawn', 'exec', 'execFileSync', 'spawnSync', 'execSync']) {
  const orig = cp[fn];
  cp[fn] = function (cmd, ...rest) {
    const name = path.basename(String(cmd || '').split(' ')[0]);
    if (!WATCH.has(name)) return orig.apply(this, [cmd, ...rest]);
    direct.push({ fn, cmd: name });
    if (fn.endsWith('Sync')) throw Object.assign(new Error('spy: not run'), { code: 'ENOENT' });   // a synchronous start: as a missing program
    const cb = rest.find((a) => typeof a === 'function');
    const child = new EventEmitter(); Object.assign(child, { pid: 0, stdout: null, stderr: null, stdin: null, exitCode: 1, signalCode: null, kill: () => true, unref: () => { } });
    setImmediate(() => { const e = Object.assign(new Error('spy: not run'), { code: 'ENOENT' }); if (cb) cb(e, '', ''); else if (child.listenerCount('error')) child.emit('error', e); child.emit('close', 1, null); });
    return child;
  };
}
const directOf = (name) => direct.filter((d) => d.cmd === name).length;

// THE FAKE STARTER — its answers per program; every request recorded
const CS = require(path.join(ROOT, 'src/server/child-starter.js'));
const asked = [];
let answer = () => ({ started: true, code: 0, stdout: '' });
const fake = { run(cmd, args = [], o = {}) { asked.push({ cmd: path.basename(String(cmd)), args, o }); return new Promise((r) => setTimeout(() => r(answer(path.basename(String(cmd)), args, o)), Number(o.delayMs) || 0)); }, stats: () => ({}) };
CS.setChildStarter(fake);
const askedOf = (name) => asked.filter((a) => a.cmd === name);
const M = mutantCopies('starts-via-starter', ROOT);

say('① THE JOBS LIST\'S TWO READS — through the starter, ONE answer for every page and render for 30 s; a no-reply never kept; a Refresh reads fresh');
WD.section('①');
{
  const JW_SRC = read('src/server/jobs-wiring.js');
  const OK_ANSWER = (cmd) => (cmd === 'systemctl' ? { started: true, code: 0, stdout: 'backup.timer loaded active waiting x\nvibespace.service loaded active running y\n' } : { started: true, code: 0, stdout: '# mine\n0 3 * * * /usr/local/bin/nightly\n' });
  answer = OK_ANSWER;
  const drive = async (JWmod) => {
    let T = 1e6; const before = asked.length;
    const r = JWmod.escapesReader({ now: () => T });
    const burst = await Promise.all(Array.from({ length: 20 }, () => r()));   // twenty renders at once (a broadcast to twenty pages)
    T += 10e3; for (let i = 0; i < 20; i++) await r();                        // twenty more within the 30 s
    T += 31e3; const after = await r();                                       // past it: one fresh read
    return { first: burst[0], same: burst.every((x) => x === burst[0]), after, starts: asked.slice(before).length };
  };
  const JW = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
  const A0 = asked.length;
  const mine = await drive(JW);
  const reqs = asked.slice(A0, A0 + 2);
  ok(mine.starts === 4 && mine.same && JSON.stringify(mine.first) === JSON.stringify({ systemd: ['backup.timer'], crontab: ['0 3 * * * /usr/local/bin/nightly'] }) && directOf('systemctl') + directOf('crontab') === 0,
    `41 renders over 41 s (twenty at once, twenty within 30 s, one past it): ${mine.starts} starts asked of the starter (two reads twice), the same answer for every one, NONE from the hub's process`, mine);
  ok(reqs.length === 2 && reqs.every((q) => JSON.stringify(q.o.envAdd) === '{}' && q.o.maxBuffer === JW.ESCAPES_MAX && JW.ESCAPES_MAX === 256 * 1024 && q.o.timeoutMs === 5000), 'THE ENV AND THE BOUND it hands: the service env alone (no name added), 5 s, an answer of at most 256 KB for the loop to parse', reqs.map((q) => q.o));
  { let T = 5e6; const r = JW.escapesReader({ now: () => T });
    answer = (cmd) => (cmd === 'systemctl' ? { unknown: true } : OK_ANSWER(cmd));
    const A1 = asked.length; const one = await r(); const two = await r(); const n2 = asked.length - A1;
    answer = OK_ANSWER; T += JW.ESCAPES_NO_REPLY_MS + 1; const three = await r(); const n = asked.length - A1;
    ok(JSON.stringify(one.unread) === '["systemd"]' && one.crontab.length === 1 && two === one && n2 === 2 && n === 4 && !three.unread, `a NO-REPLY is never kept as a reply: the read says what it could not read (unread: systemd), stamps nothing — inside the wait (r2030) the next read is served that same answer, nothing asked; past it the read asks again (${n} starts for three reads)`, { one, three, n, n2 }); }
  { let T = 9e6; const r = JW.escapesReader({ now: () => T });
    const A1 = asked.length; await r(); T += 5e3; await r({ fresh: true }); T += 5e3; await r(); const n = asked.length - A1;
    ok(n === 4, `a PERSON'S REFRESH (fresh) reads past the 30 s once — then the answer stands again (${n} starts for read, Refresh, read)`, { n }); }
  const page = read('src/lib/jobs-panel.js');
  ok(page.split("btnRefresh.onclick = () => render(true);").length === 3 && page.split("fetchJson('/api/jobs-escapes' + (fresh === true ? '?fresh=1' : ''))").length === 3 && page.split("t('Outside the registry: not read just now — ⟳ reads it again')").length === 3 && read('src/server/jobs-wiring.js').includes("readEscapes({ fresh: !!(req.query && req.query.fresh === '1') })"),
    'the page: both Jobs lists\' Refresh asks ?fresh=1 (a broadcast\'s render never does), the route reads it, and a read that got no answer says so on the page');
  const NOCACHE = require(M.write('src/server/jobs-wiring.js', anchored(JW_SRC, '    if (!fresh && last && now() - last.at < freshMs) return last.p;\n', '', 'no-cache'), 'no-cache'));
  const red = await drive(NOCACHE);
  ok(red.starts === 44, `RED: a copy with no cache — ${red.starts} starts for the same 41 renders (two a render once the one in flight is done)`, red);
  const OLD = require(M.write('src/server/jobs-wiring.js', anchored(JW_SRC, "    const ask = (bin, args) => Promise.resolve().then(() => starter().run(bin, args, { timeoutMs: 5000, maxBuffer: ESCAPES_MAX, capture: true, envAdd: {} })).catch(() => null);\n",
    "    const ask = (bin, args) => new Promise((res) => require('child_process').execFile(bin, args, { timeout: 5000 }, (err, stdout) => res({ started: true, code: err ? 1 : 0, stdout: String(stdout || '') })));   // MUTANT: the old road\n", 'old-road'), 'old-road'));
  const d0 = direct.length; await OLD.escapesReader()();
  ok(direct.length - d0 === 2 && directOf('systemctl') === 1 && directOf('crontab') === 1, 'RED: a copy on the old road starts both from the hub\'s process (the spy counts them)', direct.slice(d0));
}

say('② THE MULTIPLEXER\'S PANE LIST — the hub\'s reader (handed in): the kept lookup + the starter, no PATH walk on the loop; the worker is handed the map');
WD.section('②');
{
  let tmuxAns = { unknown: true };
  answer = (cmd, args) => (cmd === 'which' && args[0] === 'tmux' ? { started: true, code: 0, stdout: '/opt/vs/bin/tmux\n' } : cmd === 'tmux' ? tmuxAns : { started: true, code: 0, stdout: '' });
  const RS = require(path.join(ROOT, 'src/routes/sessions.js'));   // its load hands the hub's reader to session-store
  const SS = require(path.join(ROOT, 'src/session-store.js'));
  const statWas = fs.statSync; let tmuxStats = 0;
  fs.statSync = function (p, ...r) { if (String(p).endsWith(path.sep + 'tmux')) tmuxStats++; return statWas.call(this, p, ...r); };
  const a0 = askedOf('tmux').length;
  const m1 = await SS.getTmuxPaneMapAsync();   // the starter gives NO REPLY to the pane list
  tmuxAns = { started: true, code: 0, stdout: '4242||work:1.0\n' };
  const mWait = await SS.getTmuxPaneMapAsync();   // r2030 (3b): inside the wait after a no-reply — nothing asked, the last good map (none yet)
  const clockWas = Date.now; Date.now = () => clockWas() + SS.TMUX_NO_REPLY_MS + 1;   // past the wait (read, never slept)
  const map = await SS.getTmuxPaneMapAsync(); const again = await SS.getTmuxPaneMapAsync();
  Date.now = clockWas;
  fs.statSync = statWas;
  const req = askedOf('tmux')[a0 + 1];
  ok(m1.size === 0 && mWait.size === 0 && askedOf('tmux').length - a0 === 2, 'a NO-REPLY is never kept as a reply: an empty map for that sweep (no good read yet), nothing memoised — the next sweep inside the wait asks nothing, after it asks again', { m1: m1.size, mWait: mWait.size, asked: askedOf('tmux').length - a0 });
  ok(typeof RS.tmuxReaderVia === 'function' && map.get(4242) === 'work:1.0' && again === map && directOf('tmux') === 0 && tmuxStats === 0 && !!req && req.o.envAdd && req.o.envAdd.PATH === process.env.PATH && req.o.maxBuffer === 1024 * 1024,
    'the main thread: tmux found by the KEPT lookup (no stat of a PATH folder on the loop), `tmux list-panes` asked of the starter (the PATH it had, 1 MB), its answer memoised, none from the hub\'s process', { direct: directOf('tmux'), tmuxStats, env: req && req.o.envAdd });
  {
    const none = await RS.tmuxReaderVia(() => fake, async () => ({ path: null, known: true }))(SS.TMUX_PANE_ARGS), silent = await RS.tmuxReaderVia(() => fake, async () => ({ path: null, known: false }))(SS.TMUX_PANE_ARGS);
    ok(none === '' && silent === undefined, 'the reader\'s answer: no tmux on PATH = no panes (\'\'); a lookup that got no reply = no reply (undefined) — never «no tmux»', { none, silent }); }
  const SS_SRC = read('src/session-store.js');
  const rel = anchored(SS_SRC, "  if (!require('worker_threads').isMainThread) return _handedPanes || new Map();   // B-323e: a worker never starts it\n", '', 'worker-starts');
  const RELP = M.write('src/session-store.js', rel, 'worker-starts');
  const BIN = path.join(TMP, 'bin'); fs.mkdirSync(BIN, { recursive: true }); fs.writeFileSync(path.join(BIN, 'tmux'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const inWorker = (file) => new Promise((resolve) => {
    const code = `const { parentPort, workerData } = require('worker_threads'); const cp = require('child_process'); const path = require('path'); let n = 0;
      for (const fn of ['execFile', 'spawn']) { const o = cp[fn]; cp[fn] = function (c, ...r) { if (path.basename(String(c)) === 'tmux') { n++; const cb = r.find((x) => typeof x === 'function'); setImmediate(() => cb && cb(new Error('spy'), '', '')); return { on() { }, stdin: null, kill() { } }; } return o.apply(this, [c, ...r]); }; }
      const SS = require(workerData.file); if (SS.setTmuxPanes) SS.setTmuxPanes([[7, 'handed:0.0']]);
      SS.getTmuxPaneMapAsync().then((m) => parentPort.postMessage({ n, v: m.get(7) || null }), (e) => parentPort.postMessage({ n, error: e.message }));`;
    const w = new Worker(code, { eval: true, workerData: { file }, env: { ...process.env, PATH: BIN + path.delimiter + process.env.PATH } });
    w.once('message', (m) => { resolve(m); w.terminate(); }); w.once('error', (e) => resolve({ error: e.message }));
  });
  const wMine = await inWorker(path.join(ROOT, 'src/session-store.js'));
  ok(wMine.n === 0 && wMine.v === 'handed:0.0', 'the sweep\'s WORKER: the map the main thread handed (setTmuxPanes), NO start of its own', wMine);
  const wRel = await inWorker(RELP);
  ok(wRel.n >= 1, 'RED: a copy without the worker\'s guard — it starts `tmux` from the worker (a fork of the hub)', wRel);
  const route = read('src/routes/sessions.js'), sweep = read('src/sessions-sweep.js');
  ok(route.includes("tmux: [...(await require('../session-store').getTmuxPaneMapAsync())] }") && route.includes("require('../session-store').useTmuxReader(tmuxReaderVia());") && sweep.includes("require('./session-store').setTmuxPanes(facts.tmux);") && !SS_SRC.includes("require('./server/child-starter')"),
    'the hand-in: the hub hands its reader (src/routes/sessions.js) and the sweep\'s facts carry the map; src/session-store.js (a device bundle input) names no starter');
}

say('③ THE MEMORY WATCH\'S `ps` — the 5-min scan asks the starter');
WD.section('③');
{
  answer = (cmd) => (cmd === 'ps' ? { started: true, code: 0, stdout: '  1     0  4096 systemd /sbin/init\n 77     1  8192 vs-standin vs-standin --serve\n' } : { started: true, code: 0, stdout: '' });
  const make = (mod) => mod.create({ activeSessions: new Map(), BUFFERS_DIR: TMP, getUserTodos: () => null, getSessionStatus: () => null, sessionStatusKey: () => 'k', log: { warn() { }, log() { } } });
  const W0 = askedOf('ps').length, D0 = directOf('ps');
  const w = make(require(path.join(ROOT, 'src/server/memory-pressure-watch.js'))); await w.scanOwnChrome().catch(() => 0); w.stop();
  const req = askedOf('ps')[W0];
  ok(askedOf('ps').length - W0 === 1 && directOf('ps') === D0 && !!req && req.args[0] === 'axo' && req.o.maxBuffer === 8 * 1024 * 1024 && JSON.stringify(req.o.envAdd) === '{}', 'the scan\'s `ps axo pid,ppid,rss,comm,args` asked of the starter — the service env alone, an answer of at most 8 MB for the loop to parse — none from the hub\'s process', req && req.o);
  answer = () => ({ unknown: true });
  const w2 = make(require(path.join(ROOT, 'src/server/memory-pressure-watch.js'))); let threw = null, n = null; try { n = await w2.scanOwnChrome(); } catch (e) { threw = e.message; } w2.stop();
  ok(threw === null && n === 0, 'a NO-REPLY: the scan reads no process table, tells no one anything (0), never throws', { n, threw });
  const SRC = read('src/server/memory-pressure-watch.js');
  answer = (cmd) => (cmd === 'ps' ? { started: true, code: 0, stdout: '' } : { started: true, code: 0, stdout: '' });
  const OLD = make(require(M.write('src/server/memory-pressure-watch.js', anchored(SRC, "const via = (cmd, args, o) => require('./child-starter').execFileVia(require('./child-starter').childStarter())(cmd, args, o);\n",
    "const via = (cmd, args, o) => new Promise((res) => require('child_process').execFile(cmd, args, { timeout: o.timeout, maxBuffer: o.maxBuffer }, (err, stdout) => res({ err, stdout: String(stdout || '') })));   // MUTANT: the old road\n", 'old-road'), 'old-road')));
  await OLD.scanOwnChrome().catch(() => 0); OLD.stop();
  ok(directOf('ps') - D0 === 1, 'RED: a copy on the old road starts `ps` from the hub\'s process', { direct: directOf('ps') - D0 });
}

say('④ THE VERSION ASKS — the hub hands its starter to the SHARED module (the agent keeps its own exec)');
WD.section('④');
{
  fs.writeFileSync(STANDIN, '#!/bin/sh\necho "2.1.999 (Claude Code)"\n', { mode: 0o755 });
  process.env.CLAUDE_CMD = STANDIN;   // the named stand-in (B-ec25): the only claude a probe may start under VS_NO_REAL_CLI
  const SB = path.basename(STANDIN);
  answer = (cmd, args) => (cmd === SB && args[0] === '--version' ? { started: true, code: 0, stdout: '2.1.999 (Claude Code)\n' } : { started: true, code: 0, stdout: '' });
  const MP = require(path.join(ROOT, 'src/machine-probes.js'));
  MP.useStarter(CS.execFileVia(CS.childStarter()));
  const A0 = askedOf(SB).length, D0 = directOf(SB);
  const v = await MP.cliVersion(STANDIN);
  const req = askedOf(SB)[A0];
  ok(v === '2.1.999 (Claude Code)' && askedOf(SB).length - A0 === 1 && directOf(SB) === D0 && !!req && JSON.stringify(req.o.envAdd) === '{}' && req.o.maxBuffer === 64 * 1024 && req.o.timeoutMs === 5000, `cliVersion (the 15-min tick's, backend-status' read): «${v}» from ONE --version asked of the starter (the service env alone, 5 s, 64 KB), none from the hub's process`, { v, o: req && req.o });
  answer = () => ({ unknown: true });
  const nr = await MP.cliVersion(STANDIN);
  ok(nr === null && directOf(SB) === D0, 'a NO-REPLY: the version is unknown (null — the tick keeps the last known one), nothing started from the hub\'s process', { nr });
  const SRC = read('src/machine-probes.js');
  const REL = require(M.write('src/machine-probes.js', anchored(SRC, "const execVersion = (p) => (versionVia ? versionVia(p, ['--version'], { timeout: 5000, maxBuffer: 64 * 1024 }).then((r) => (r && !r.err ? String(r.stdout || '') : null), () => null) : exec(p, ['--version']));\n",
    "const execVersion = (p) => exec(p, ['--version']);   // MUTANT: the release\n", 'release'), 'release'));
  REL.useStarter(CS.execFileVia(CS.childStarter())); await REL.cliVersion(STANDIN);
  ok(directOf(SB) - D0 === 1, 'RED: a copy that ignores the hand-off starts the --version from the hub\'s process', { direct: directOf(SB) - D0 });
  ok(read('server.js').includes("const machineProbes = require('./src/machine-probes'); machineProbes.useStarter(require('./src/server/child-starter').execFileVia(require('./src/server/child-starter').childStarter()));"), 'the hub hands it at the module\'s require (server.js) — the device agent never does');
}

say('⑤ THE LOOKUP — through the starter, kept; an aborted ask stops waiting and records nothing; one program a name at a time; a no-reply is said as one');
WD.section('⑤');
{
  let slowLanded = false;   // the stand-in's own (late) answer has landed — the abort's proof, never a wall-clock bound
  answer = (cmd, args) => (cmd === 'which' && args[0] === 'vs-slow-cmd' ? new Promise((r) => setTimeout(() => { slowLanded = true; r({ started: true, code: 0, stdout: '/x/vs-slow-cmd\n' }); }, 400)) : cmd === 'which' && args[0] === 'vs-silent-cmd' ? { unknown: true } : cmd === 'which' ? { started: true, code: 0, stdout: `/usr/bin/${args[0]}\n` } : { started: true, code: 0, stdout: '' });
  const WK = require(path.join(ROOT, 'src/plugins/which-kept.js'));
  const D0 = directOf('which'), A0 = askedOf('which').length;
  const got = await WK.whichNow('vs-cmd-a');
  const req = askedOf('which')[A0];
  ok(got === '/usr/bin/vs-cmd-a' && WK.whichKnown('vs-cmd-a') === true && directOf('which') === D0 && req.o.envAdd.PATH === process.env.PATH && req.o.timeoutMs === WK.TIMEOUT_MS && req.o.maxBuffer === 64 * 1024, 'a lookup asked of the starter (the PATH the site had, its 5 s, 64 KB), its answer kept; none from the hub\'s process', { got, o: req && req.o });
  const ac = new AbortController(); const t0 = Date.now(); const p = WK.whichNow('vs-slow-cmd', { signal: ac.signal }); setTimeout(() => ac.abort(new Error('abandoned')), 30);
  const slow = await p; const ms = Date.now() - t0, landedFirst = slowLanded;
  await new Promise((r) => setTimeout(r, 500));   // r1381 (6): the stand-in's own answer lands (at 400 ms) BEFORE the assert
  ok(slow === null && landedFirst === false && slowLanded === true && !WK.whichKnown('vs-slow-cmd'), `an aborted ask stops waiting at once (${ms} ms: BEFORE the stand-in's own answer landed) and records nothing — not even once the late answer has landed; its child ends at the starter's own bound`, { slow, ms, landedFirst });
  // r2802 (主开发, from an independent verification): ONE LOOKUP PROGRAM A NAME AT A TIME — an aborted ask ends only ITS waiting; the next
  // ask of that name while the child still runs JOINS it (no second `which`) and gets — and keeps — the child's own answer
  const WK_SRC = read('src/plugins/which-kept.js');
  const joinScene = async (WKm) => {
    let landed = false; const prev = answer;
    answer = (cmd, args) => (cmd === 'which' && args[0] === 'vs-join-cmd' ? new Promise((r) => setTimeout(() => { landed = true; r({ started: true, code: 0, stdout: '/x/vs-join-cmd\n' }); }, 300)) : prev(cmd, args));
    const nOf = () => askedOf('which').filter((x) => x.args[0] === 'vs-join-cmd').length, a0 = nOf();
    try {
      const ac2 = new AbortController(); const first = WKm.whichNow('vs-join-cmd', { signal: ac2.signal }); ac2.abort(new Error('the dialog closed'));
      const firstGot = await first;   // ended at its own abort — the last answer (none)
      const second = await WKm.whichNow('vs-join-cmd');   // asked while the first child still runs
      return { firstGot, second, programs: nOf() - a0, landed, known: WKm.whichKnown('vs-join-cmd') };
    } finally { answer = prev; }
  };
  const one = await joinScene(WK);
  const twoR = await joinScene(require(M.write('src/plugins/which-kept.js', anchored(WK_SRC, '    const end = () => { if (over) return; over = true; look.waiting -= 1;', '    const end = () => { if (over) return; over = true; look.waiting -= 1; if (k.pending === look) k.pending = null;', 'B-323e the abort frees the slot'), 'abort-frees')));   // stale-pins: kept (today's road planted back — the leg's RED)
  ok(one.firstGot === null && one.second === '/x/vs-join-cmd' && one.programs === 1 && one.landed && one.known && twoR.programs === 2,
    `ONE LOOKUP PROGRAM A NAME AT A TIME (r2802): an aborted ask ends only its waiting (${one.firstGot}); the next ask of that name while the child runs JOINS it — ${one.programs} program — and gets and keeps its answer (${one.second}) — RED the abort frees the slot (today's road): ${twoR.programs} programs for one name`, { one, twoR });
  const silent = await WK.whichFreshAnswer('vs-silent-cmd');
  ok(silent.known === false && silent.path === null && !WK.whichKnown('vs-silent-cmd'), 'a NO-REPLY is said as one ({known: false}) — never «not found», nothing kept', silent);
  const SRC = read('src/plugins/which-kept.js');
  const OLD = require(M.write('src/plugins/which-kept.js', anchored(SRC, "let runWhich = (name) => require('../server/child-starter').childStarter().run('which', [name], { timeoutMs: TIMEOUT_MS, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '' } });\n",
    "let runWhich = (name) => new Promise((res) => require('child_process').execFile('which', [name], { timeout: TIMEOUT_MS }, (err, out) => res({ started: true, code: err ? 1 : 0, stdout: String(out || '') })));   // MUTANT: the old road\n", 'old-road'), 'old-road'));
  await OLD.whichNow('vs-cmd-b');
  ok(directOf('which') - D0 === 1, 'RED: a copy on the old road starts `which` from the hub\'s process', { direct: directOf('which') - D0 });
  const TS = read('src/plugins/tailscale.js');
  const tsRuns = (src) => src.includes("Promise.resolve().then(() => require('../server/child-starter').childStarter().run(prog, args, { timeoutMs: ms, capture: true, maxBuffer: 4 << 20,") && !src.includes('c = execFile(prog, args,');   // stale-pins: kept (the release's text — the leg's RED)
  ok(tsRuns(TS) && !tsRuns(TS.replace("Promise.resolve().then(() => require('../server/child-starter').childStarter().run(prog, args, { timeoutMs: ms,", "c = execFile(prog, args, { timeout: ms,")), 'the proxy plugin\'s runner (pgrep, sudo -n true, its status) asks the starter, 4 MB at most — RED: the release\'s execFile in its text is named');
}

say('⑥ THE CERTIFICATE PASS, THE DISPLAY\'S LOOKUP, THE KEEPER\'S VERSION ASK');
WD.section('⑥');
{
  const TLS = require(path.join(ROOT, 'src/server/tls.js'));
  const table = []; let tq = null;
  for (const [a, want] of [[{ started: true, code: 0, stdout: '{"Self":1}' }, 0], [{ started: true, code: 2, stdout: '' }, 2], [{ started: true, timedOut: true, code: null }, 'TIMEOUT'], [{ unknown: true }, 'TIMEOUT'], [{ started: false, error: 'ENOENT' }, 'ENOENT']]) {
    answer = () => a; const q0 = asked.length; const r = await TLS.runViaStarter('tailscale', ['status', '--json'], 5000); tq = asked[q0]; table.push([r.code, want]);
  }
  ok(table.every(([g, w]) => g === w) && tq.o.maxBuffer === 1024 * 1024 && tq.o.timeoutMs === 5000 && !tq.o.envAdd, 'runViaStarter answers runChild\'s table — an exit code, TIMEOUT (its bound or the starter\'s NO-REPLY), ENOENT — asking at most 1 MB, the service env alone', table);
  const TLS_SRC = read('src/server/tls.js');
  const dflt = (src) => src.includes('tailscaleBin: binArg, run = runViaStarter, now = () => Date.now(),');
  ok(dflt(TLS_SRC) && !dflt(TLS_SRC.replace('run = runViaStarter, now', 'run = runChild, now')), 'the pass\'s default runner is the starter\'s (its hourly status, its cert) — RED: the release\'s runChild default is named');   // stale-pins: kept (the release's text — the leg's RED)
  answer = (cmd) => (cmd === 'which' ? { started: true, code: 1, stdout: '' } : { started: true, code: 0, stdout: '' });
  const V = require(path.join(ROOT, 'src/vnc.js'));
  const D0 = direct.length, A0 = askedOf('which').length;
  const st = await new V.VncManager({ dataDir: TMP, port: 1, display: ':97' }).status();
  const names = askedOf('which').slice(A0).map((x) => x.args[0]);
  ok(st.available === false && !st.lookup && names.includes('Xtigervnc') && names.includes('Xvnc') && direct.length === D0, 'the Desktop\'s status on a box with no Xvnc: two lookups asked of the starter, NO synchronous child', { st, names });
  const A1 = askedOf('which').length; let why = null;
  try { await new V.VncManager({ dataDir: TMP, port: 1, display: ':97' }).ensureRunning(); } catch (e) { why = e.message; }
  ok(askedOf('which').length - A1 === 2 && /no VNC server installed/.test(String(why)), 'a person\'s START looks again past the kept «not found» (an Xvnc installed a moment ago is found) — and names the true cause when none is there', { asked: askedOf('which').length - A1, why });
  answer = (cmd) => (cmd === 'which' ? { unknown: true } : { started: true, code: 0, stdout: '' });
  let why2 = null; try { await new V.VncManager({ dataDir: TMP, port: 1, display: ':96' }).ensureRunning(); } catch (e) { why2 = e.message; }
  ok(/could not check whether a VNC server is installed/.test(String(why2)) && !/no VNC server installed/.test(String(why2)), 'a NO-REPLY: the Start names its own cause («could not check … try again»), never «no VNC server installed»', { why2 });
  // r2473 / r2480: THE SAME MILLISECOND — the two Starts again under ONE frozen clock (the window placed, never a stall nor load):
  // a person's press never reads the kept answer, even one recorded in its own millisecond; whether an answer CAME is a count of
  // the answers recorded for the name, never a time compared with the last. Each scene runs a fresh copy of the lookup's module
  // (its own kept answers) under a copy of the display's module that asks THAT copy.
  const VSRC6 = read('src/vnc.js'), WSRC6 = read('src/plugins/which-kept.js');
  const sameMs = async (wkSrc, tag) => {
    const wk = M.write('src/plugins/which-kept.js', wkSrc, 'wk-' + tag, { same: wkSrc === WSRC6 });   // the cured scene's copy is deliberate (a fresh module: its own kept answers)
    const VM = require(M.write('src/vnc.js', anchored(VSRC6, "const lookup = (cmd, o) => require('./plugins/which-kept.js').whichFreshAnswer(cmd, o);", `const lookup = (cmd, o) => require(${JSON.stringify(wk)}).whichFreshAnswer(cmd, o);`, 'B-323e the scene\'s own lookup'), 'vnc-' + tag));
    const start = async () => { const a0 = askedOf('which').length; let w = null; try { await new VM.VncManager({ dataDir: TMP, port: 1, display: ':91' }).ensureRunning(); } catch (e) { w = e.message; } return { asked: askedOf('which').length - a0, why: String(w) }; };
    const clock = Date.now, F = clock(); Date.now = () => F;   // ONE millisecond for the whole scene
    try {
      answer = (cmd) => (cmd === 'which' ? { started: true, code: 1, stdout: '' } : { started: true, code: 0, stdout: '' });
      const s1 = await start(), s2 = await start();   // a «not found» recorded in this very millisecond, then a press in it again
      answer = (cmd) => (cmd === 'which' ? { unknown: true } : { started: true, code: 0, stdout: '' });
      const s3 = await start();   // the lookup silent: a press in the millisecond of the kept «not found»
      return { s1, s2, s3 };
    } finally { Date.now = clock; }
  };
  const ms = await sameMs(WSRC6, 'cured');
  const msK = await sameMs(anchored(WSRC6, '  if (maxAgeMs > 0 && k && k.at && Date.now() - k.at <= maxAgeMs) return Promise.resolve(said(k));\n', '  if (k && k.at && Date.now() - k.at <= maxAgeMs) return Promise.resolve(said(k));\n', 'B-323e a press reads the kept answer'), 'kept-read');   // stale-pins: kept (the release's road planted back — the leg's RED)
  const msT = await sameMs(anchored(anchored(WSRC6, '  const n0 = k ? k.n : 0;\n', '  const at0 = k ? k.at : 0;\n', 'B-323e answered by time 1'), '    if (k2 && k2.n !== n0) return said(k2);\n', '    if (k2 && k2.at && k2.at !== at0) return said(k2);\n', 'B-323e answered by time 2'), 'by-time');   // stale-pins: kept (the release's road planted back — the leg's RED)
  ok(ms.s1.asked === 2 && /no VNC server installed/.test(ms.s1.why) && ms.s2.asked === 2 && /no VNC server installed/.test(ms.s2.why) && ms.s3.asked === 2 && /could not check whether a VNC server is installed/.test(ms.s3.why) && !/no VNC server installed/.test(ms.s3.why)
    && /no VNC server installed/.test(msK.s3.why) && /could not check whether a VNC server is installed/.test(msT.s2.why),
    `THE SAME MILLISECOND (one frozen clock): a press looks again past a «not found» kept in its own millisecond (${ms.s2.asked} lookups) and says the true cause; with the lookup silent it says it could not check (${ms.s3.asked} lookups) — RED a press reads the kept answer: the no-reply said as «not installed» (${msK.s3.why}); RED «answered» by a time unequal to the last: a real «not found» said as «could not check» (${msT.s2.why})`, { ms, msK, msT });
  answer = (cmd) => (cmd === 'which' ? { started: true, code: 1, stdout: '' } : { started: true, code: 0, stdout: '' });
  const VSRC = read('src/vnc.js');
  const REL = require(M.write('src/vnc.js', anchored(VSRC, "const lookup = (cmd, o) => require('./plugins/which-kept.js').whichFreshAnswer(cmd, o);   // {path, known} — known false: no reply",
    "const lookup = async (cmd) => { try { return { path: require('child_process').execFileSync('which', [cmd], { timeout: 2000 }).toString().trim() || null, known: true }; } catch { return { path: null, known: true }; } };   // MUTANT: the release's synchronous lookup", 'release'), 'release'));
  const D1 = direct.length;
  await new REL.VncManager({ dataDir: TMP, port: 1, display: ':98' }).status();
  ok(direct.slice(D1).filter((d) => d.fn === 'execFileSync' && d.cmd === 'which').length === 2, 'RED: the release\'s lookup — two SYNCHRONOUS `which` from the hub\'s process', direct.slice(D1));
  const BK = read('src/server/browser-keeper.js');
  const kv = (src) => src.includes(".childStarter().run(p, ['--version'], { timeoutMs: 8000, capture: true, maxBuffer: 64 * 1024,") && !src.includes("execFile(p, ['--version'],");   // stale-pins: kept (the release's text — the leg's RED)
  ok(kv(BK) && !kv(BK.replace(".childStarter().run(p, ['--version'], { timeoutMs: 8000,", "x; execFile(p, ['--version'], { timeout: 8000,")), 'the keeper\'s version ask rides the starter (64 KB at most; a no-reply reads as a silent probe, asked again after CLI_FRESH_MS) — RED: the release\'s execFile in its text is named');
}

say('⑦ A FAILED COPY OF THE RCLONE BINARY IS REMEMBERED FOR ITS BOUND, THEN TRIED AGAIN');
WD.section('⑦');
{
  const homeWas = process.env.HOME; process.env.HOME = TMP;
  const bin = path.join(TMP, 'data', 'bin', 'rclone'); fs.mkdirSync(path.dirname(bin), { recursive: true }); fs.writeFileSync(bin, 'x');
  const fresh = (mod) => { const m = Object.create(mod.MountManager.prototype); m.dataDir = path.join(TMP, 'data'); m._onNetworkFs = () => true; return m; };
  const turn = () => new Promise((r) => setImmediate(r));
  const run3 = async (m) => { for (let i = 0; i < 3; i++) { m._fastBin(bin); await turn(); await turn(); } };   // each ask after the last one's answer (the copying flag cleared)
  const MM = require(path.join(ROOT, 'src/mounts.js'));
  const SRC = read('src/mounts.js');
  const D0 = directOf('sh');
  const m = fresh(MM); await run3(m);
  const mine = directOf('sh') - D0;
  m._fastBinMemo.failedAt -= 16 * 60e3; m._fastBin(bin); await turn(); await turn();   // past FASTBIN_RETRY_MS (15 min)
  const later = directOf('sh') - D0 - mine;
  const D1 = directOf('sh');
  const REL = require(M.write('src/mounts.js', anchored(anchored(SRC, "          if (err) this._fastBinMemo = { src: binPath, use: binPath, failedAt: Date.now() };   // B-323e: a FAILED copy is remembered FASTBIN_RETRY_MS (the network path stands meanwhile) — never redone at every rcloneBin()\n", '', 'release'), "        // B-323e follow (r2030 (3c)): the copy's own retry stamp — while it runs (≤ 180 s) every rcloneBin() answers the network\n        // path from this memo (no realpath + /proc/mounts + stat on the loop at each call); its end replaces it\n        this._fastBinMemo = { src: binPath, use: binPath, failedAt: Date.now() };\n", '', 'release'), 'release'));   // the release: no memo of a failed copy, no stamp at its start
  await run3(fresh(REL));
  const rel = directOf('sh') - D1, D2 = directOf('sh');
  const EVER = require(M.write('src/mounts.js', anchored(SRC, "    if (this._fastBinMemo?.src === binPath && !(this._fastBinMemo.failedAt && Date.now() - this._fastBinMemo.failedAt > FASTBIN_RETRY_MS)) return this._fastBinMemo.use;",
    '    if (this._fastBinMemo?.src === binPath) return this._fastBinMemo.use;   // MUTANT: kept for the process\'s life', 'for-ever'), 'for-ever'));
  const e = fresh(EVER); await run3(e); e._fastBinMemo.failedAt -= 16 * 60e3; e._fastBin(bin); await turn(); await turn();
  const ever = directOf('sh') - D2;
  process.env.HOME = homeWas;
  ok(mine === 1 && later === 1 && rel === 3 && ever === 1, `three asks after a failed copy: ${mine} copy started (the failure remembered); past its 15 min bound: ${later} more (tried again) — RED: the release starts ${rel}; a copy kept for the process's life never tries again (${ever})`, { mine, later, rel, ever });
}
say('⑧ (主开发 r2030) A HOST WITH NO `which`; A NO-REPLY BACKS OFF; THE SMALLS');
WD.section('⑧');
{
  const RS = require(path.join(ROOT, 'src/routes/sessions.js'));
  const SS = require(path.join(ROOT, 'src/session-store.js'));
  const WK = require(path.join(ROOT, 'src/plugins/which-kept.js'));
  const nowWas = Date.now; let skew = 0; Date.now = () => nowWas() + skew;   // the legs' clock: every wait is READ, never slept
  const pathWas = process.env.PATH;
  try {
    // (a) THE LOOKUP PROGRAM ITSELF ABSENT: the release's own look along PATH finds tmux — never «no tmux» for that reason
    answer = (cmd) => (cmd === 'which' ? { started: false, error: 'ENOENT' } : cmd === 'tmux' ? { started: true, code: 0, stdout: '5151||nowhich:0.0\n' } : { started: true, code: 0, stdout: '' });
    const BIN = path.join(TMP, 'bin');   // leg ②'s tmux: an executable file on PATH
    process.env.PATH = BIN + path.delimiter + pathWas;
    skew += 61e3;   // the kept answer of `tmux` is old: the reader looks again
    const a0 = askedOf('tmux').length;
    const out = await RS.tmuxReaderVia()(SS.TMUX_PANE_ARGS);
    const fa = await WK.whichFreshAnswer('tmux');
    const req = askedOf('tmux')[a0], looked = await SS.tmuxPathAsync();
    ok(out === '5151||nowhich:0.0\n' && fa.noLookup === true && fa.known === true && !!req && req.cmd === 'tmux' && looked === path.join(BIN, 'tmux') && askedOf('tmux').length - a0 === 1,
      'a host with NO `which` program (its own ENOENT, kept as `noLookup`): tmux found the release\'s way (session-store\'s guarded look along PATH) and its pane list asked of the starter', { out, fa, looked, req: req && req.cmd });
    const RSRC = read('src/routes/sessions.js');
    const RELR = require(M.write('src/routes/sessions.js', anchored(RSRC, "    if (found && found.noLookup) { bin = await releaseLook(); if (bin === undefined) return undefined; }   // r2262: the walk got no answer = no reply\n    else if (!found || (!found.known && !bin)) return undefined;\n", "    if (!found || !found.known) return undefined;   // MUTANT: no fallback (the build's reader)\n", 'no-fallback'), 'no-fallback'));
    const relOut = await RELR.tmuxReaderVia(() => fake, (n) => WK.whichFreshAnswer(n))(SS.TMUX_PANE_ARGS);
    SS.useTmuxReader(RS.tmuxReaderVia());   // the mutant's load handed ITS reader: the hub's again
    ok(relOut === '', 'RED: the reader without the fallback — «no tmux» on a host with no `which` (tmux conversations lose their targets)', { relOut });
    process.env.PATH = pathWas;

    // (b) A NO-REPLY BACKS OFF — the lookup: the last good path served (not fresh), no new lookup until the wait (5 s, doubled) ends
    let hang = false, runs = 0;
    answer = (cmd, args) => { if (cmd === 'which' && args[0] === 'vs-hang-cmd') { runs++; return hang ? { unknown: true } : { started: true, code: 0, stdout: '/x/vs-hang-cmd\n' }; } return cmd === 'which' && args[0] === 'tmux' ? { started: true, code: 0, stdout: '/opt/vs/bin/tmux\n' } : { started: true, code: 0, stdout: '' }; };
    const g1 = await WK.whichFreshAnswer('vs-hang-cmd');
    hang = true; skew += 61e3;
    const n1 = await WK.whichFreshAnswer('vs-hang-cmd'), n2 = await WK.whichFreshAnswer('vs-hang-cmd'); const r2 = runs;
    skew += WK.NO_REPLY_WAIT_MS + 1; await WK.whichFreshAnswer('vs-hang-cmd'); const r3 = runs;
    skew += WK.NO_REPLY_WAIT_MS + 1; await WK.whichFreshAnswer('vs-hang-cmd'); const r4 = runs;   // inside the DOUBLED wait
    skew += WK.NO_REPLY_WAIT_MS; await WK.whichFreshAnswer('vs-hang-cmd'); const r5 = runs;
    const press = await WK.whichFreshAnswer('vs-hang-cmd', { maxAgeMs: 0 }); const r6 = runs;
    ok(g1.path === '/x/vs-hang-cmd' && g1.known === true && n1.path === '/x/vs-hang-cmd' && n1.known === false && n1.keptAt > 0 && n2.path === '/x/vs-hang-cmd' && n2.known === false && r2 === 2 && r3 === 3 && r4 === 3 && r5 === 4 && r6 === 5 && press.known === false && WK.NO_REPLY_WAIT_MAX_MS >= WK.NO_REPLY_WAIT_MS,
      `a lookup with NO REPLY: the last good path served said not fresh (known false, keptAt); no new lookup inside the wait (${WK.NO_REPLY_WAIT_MS} ms, doubled at the next no-reply, up to ${WK.NO_REPLY_WAIT_MAX_MS} ms); a person's press looks at once`, { runs: [r2, r3, r4, r5, r6], n1, n2 });
    const WSRC = read('src/plugins/which-kept.js');
    const WK2 = require(M.write('src/plugins/which-kept.js', anchored(WSRC, "  if (!press && backingOff(k)) return Promise.resolve(k.at ? k.path : null);   // r2030 (3b): waiting after a no-reply — the last good answer, no new child\n", '', 'no-backoff'), 'no-backoff'));
    hang = false; runs = 0; await WK2.whichFreshAnswer('vs-hang-cmd'); hang = true; skew += 61e3;
    for (let i = 0; i < 3; i++) await WK2.whichFreshAnswer('vs-hang-cmd');
    ok(runs === 4, 'RED: a copy without the wait — a new lookup at every ask while the lookup gets no reply (a `which` stuck on a hung mount each time)', { runs });

    // the pane map: after a good read, a no-reply serves the LAST GOOD map for its sweep and the next ask waits
    let paneAns = { started: true, code: 0, stdout: '6161||good:0.0\n' };
    const prevAnswer = answer;
    answer = (cmd, args) => (cmd === 'tmux' ? paneAns : prevAnswer(cmd, args));
    const paneDrive = async (S) => {
      S.useTmuxReader(RS.tmuxReaderVia()); paneAns = { started: true, code: 0, stdout: '6161||good:0.0\n' }; skew += 61e3;
      const t0 = askedOf('tmux').length;
      const good = await S.getTmuxPaneMapAsync();
      paneAns = { unknown: true }; skew += 5e3;   // past the memo's 4 s
      const k1 = await S.getTmuxPaneMapAsync(), k2 = await S.getTmuxPaneMapAsync();
      return { good, k1, k2, asks: askedOf('tmux').length - t0 };
    };
    const pm = await paneDrive(SS);
    SS.useTmuxReader(RS.tmuxReaderVia());
    ok(pm.good.get(6161) === 'good:0.0' && pm.k1.get(6161) === 'good:0.0' && pm.k2.get(6161) === 'good:0.0' && pm.asks === 2 && SS.TMUX_NO_REPLY_MS > 0 && SS.TMUX_NO_REPLY_MAX_MS >= SS.TMUX_NO_REPLY_MS,
      'the pane list with NO REPLY after a good read: the last good map serves that sweep (tmux conversations keep their targets) and the next sweep asks nothing inside the wait', { asks: pm.asks, k1: pm.k1.size });
    const SSRC = read('src/session-store.js');
    const relSS = anchored(anchored(SSRC, "    if (_paneNoReply && now - _paneNoReply.at < _paneNoReply.waitMs) return _paneMapMemo ? _paneMapMemo.map : map;   // waiting after a no-reply: the last good map\n", '', 'pane-release'),
      "      const was = _paneNoReply ? _paneNoReply.waitMs : 0;\n", '      return map;   // MUTANT: the build\'s no-reply (an empty map, asked again at once)\n', 'pane-release');
    const SS2 = require(M.write('src/session-store.js', relSS, 'pane-release'));
    const pr = await paneDrive(SS2);
    ok(pr.k1.size === 0 && pr.asks === 3, 'RED: the build\'s no-reply — an EMPTY map for that sweep and a new ask at every sweep', { asks: pr.asks, k1: pr.k1.size });
    answer = prevAnswer;

    // (c) THE SMALLS — the Jobs list's reader backs off the same way, serves its last good list, and never rejects
    const JW = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
    let T = 5e6, sysAns = { started: true, code: 0, stdout: 'backup.timer loaded active waiting x\n' };
    answer = (cmd) => (cmd === 'systemctl' ? sysAns : cmd === 'crontab' ? { started: true, code: 0, stdout: '0 3 * * * /usr/local/bin/nightly\n' } : { started: true, code: 0, stdout: '' });
    const er = JW.escapesReader({ now: () => T });
    const j1 = await er();
    sysAns = { unknown: true }; T += 31e3;
    const s0 = askedOf('systemctl').length;
    const j2 = await er(), j3 = await er(); const s1 = askedOf('systemctl').length - s0;
    T += JW.ESCAPES_NO_REPLY_MS + 1; await er(); const s2 = askedOf('systemctl').length - s0;
    await er({ fresh: true }); const s3 = askedOf('systemctl').length - s0;
    ok(j1.systemd[0] === 'backup.timer' && Array.isArray(j2.unread) && j2.unread.includes('systemd') && j2.systemd[0] === 'backup.timer' && j2.keptAt > 0 && j2.crontab.length === 1 && j3 === j2 && s1 === 1 && s2 === 2 && s3 === 3 && JW.ESCAPES_NO_REPLY_MAX_MS >= JW.ESCAPES_NO_REPLY_MS,
      'the Jobs list\'s read with NO REPLY: the last list that answered served (said unread, keptAt), no new read inside the wait, a person\'s Refresh reads at once', { s: [s1, s2, s3], j2 });
    answer = () => ({ get unknown() { throw new Error('planted'); } });
    let rej = null; const jc = await JW.escapesReader({ now: () => T })().catch((e) => { rej = e.message; return null; });
    const JSRC = read('src/server/jobs-wiring.js');
    const JW2 = require(M.write('src/server/jobs-wiring.js', anchored(JSRC, "    })().catch(() => keptOf({ systemd: [], crontab: [], unread: ['systemd', 'crontab'] }));   // r2030 (3c): the read never rejects\n", '    })();   // MUTANT: no catch\n', 'no-catch'), 'no-catch'));
    let rej2 = null; await JW2.escapesReader({ now: () => T })().catch((e) => { rej2 = e.message; });
    ok(rej === null && !!jc && jc.unread.length === 2 && rej2 === 'planted', 'the read NEVER rejects: a throw inside it is a read with both parts unread — RED: a copy without the catch rejects', { rej, jc, rej2 });

    // the process table read past its bound says «not read» — never an empty report
    const MPW_SRC = read('src/server/memory-pressure-watch.js');
    const pressureOf = async (mod) => {
      answer = (cmd) => (cmd === 'ps' ? { started: true, overflow: true, code: null, stdout: '' } : { started: true, code: 0, stdout: '' });
      let item = null;
      const w = mod.create({ activeSessions: new Map(), BUFFERS_DIR: TMP, getUserTodos: () => ({ add: (k, it) => { item = it; return { id: 'x' }; } }), getSessionStatus: () => null, sessionStatusKey: () => 'k', log: { warn() { }, log() { } } });
      w.onSample({ used: 99, limit: 100 });
      for (let i = 0; i < 400 && !item; i++) await new Promise((r) => setTimeout(r, 5));
      w.stop();
      return item;
    };
    const it = await pressureOf(require(path.join(ROOT, 'src/server/memory-pressure-watch.js')));
    const itRel = await pressureOf(require(M.write('src/server/memory-pressure-watch.js', anchored(MPW_SRC, "      if (err) return resolve({ rows: [], notRead: String((err && err.message) || err || 'not read').slice(0, NOT_READ_MAX) });", "      if (err) return resolve({ rows: [], notRead: null });   // MUTANT: the build's empty table", 'empty-table'), 'empty-table')));
    ok(!!it && /The process table was not read \(ps: its output passed \d+ bytes\)/.test(it.detail) && !/The largest process groups/.test(it.detail) && !!itRel && !/not read/.test(itRel.detail) && /The largest process groups/.test(itRel.detail),
      'the memory item when the process table ran past its bound: «The process table was not read (…)» — RED: the build\'s empty table reads as no group at all', { detail: it && it.detail.split('\n')[0] });

    // the mount program's THROWN stat memo gets its retry stamp
    const rbin = path.join(TMP, 'data', 'bin', 'rclone'); fs.mkdirSync(path.dirname(rbin), { recursive: true }); fs.writeFileSync(rbin, 'x');
    const mk = (mod) => { const m = Object.create(mod.MountManager.prototype); m.dataDir = path.join(TMP, 'data'); m._onNetworkFs = () => true; return m; };
    const statWas2 = fs.statSync; let binStats = 0;
    fs.statSync = function (p, ...r) { if (String(p) === rbin) { binStats++; throw Object.assign(new Error('planted'), { code: 'EIO' }); } return statWas2.call(this, p, ...r); };
    const thrown = (mod) => { const m = mk(mod); const b0 = binStats; for (let i = 0; i < 3; i++) m._fastBin(rbin); const first = binStats - b0; skew += 16 * 60e3; m._fastBin(rbin); return { first, later: binStats - b0 - first }; };
    const MSRC = read('src/mounts.js');
    const th = thrown(require(path.join(ROOT, 'src/mounts.js')));
    const thRel = thrown(require(M.write('src/mounts.js', anchored(MSRC, "      this._fastBinMemo = { src: binPath, use: binPath, failedAt: Date.now() };   // B-323e follow (r2030 (3c)): a thrown stat / mkdir is retried after FASTBIN_RETRY_MS too", "      this._fastBinMemo = { src: binPath, use: binPath };   // MUTANT: the build's thrown memo (kept for ever)", 'thrown-for-ever'), 'thrown-for-ever')));
    fs.statSync = statWas2;
    ok(th.first === 1 && th.later === 1 && thRel.first === 1 && thRel.later === 0, `a THROWN stat of the rclone binary: remembered (${th.first} stat for three asks), tried again past its 15 min (${th.later}) — RED: the build's memo keeps the network path for the process's life (${thRel.later})`, { th, thRel });

    // the Desktop's Start: helper lookups with no reply are SAID — never a silent bare screen
    answer = (cmd) => (cmd === 'which' ? { unknown: true } : { started: true, code: 0, stdout: '' });
    const V = require(path.join(ROOT, 'src/vnc.js'));
    const VSRC = read('src/vnc.js');
    const VREL = require(M.write('src/vnc.js', anchored(VSRC, "    const helper = async (cmd) => { const f = await lookup(cmd, { maxAgeMs: 0 }); if (!f.known && !f.path) noReply.push(cmd); return f.path; };\n", "    const helper = async (cmd) => (await lookup(cmd)).path;   // MUTANT: the build's silent kept lookup\n", 'silent-start'), 'silent-start'));
    const warnWas = console.warn; const warned = []; console.warn = (...a) => { warned.push(a.join(' ')); };
    let sess, rsess;
    try { sess = await new V.VncManager({ dataDir: TMP, port: 1, display: ':95' })._startSession(); rsess = await new VREL.VncManager({ dataDir: TMP, port: 1, display: ':94' })._startSession(); } finally { console.warn = warnWas; }
    ok(!!sess && Array.isArray(sess.noReply) && sess.noReply.includes('dbus-launch') && sess.noReply.includes('xterm') && warned.filter((w) => /no desktop session was started: the lookup of .+ got no answer in time/.test(w)).length === 1 && rsess === null,
      'a Start whose helper lookups get NO REPLY: said in the journal and answered (session «no-reply», by name) — RED: the build\'s lookup leaves a bare screen without a word', { sess, rsess, warned: warned.length });
    // (d) 主开发 r2262 MUST 1 + r2489 (1)(2) — the reopen the toast names runs the session's lookups again on OUR display (still the
    // same X server: this hub's own, or the record's after a restart), and starts it there once; anything else is adopted as before
    WATCH.add('xterm');   // the session's last resort: the spy answers it (nothing real starts)
    const srv = require('net').createServer().listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r)); const vport = srv.address().port;
    const startOf = (pid) => { try { const t = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); return t.slice(t.lastIndexOf(')') + 2).split(' ')[19] || null; } catch { return null; } };
    const NO_PID = 4194000 + (process.pid % 300);   // above every pid_max a box sets: no such process (its start reads null)
    const noReplyAll = (cmd) => (cmd === 'which' ? { unknown: true } : { started: true, code: 0, stdout: '' });
    const xtermOnly = (cmd, args) => (cmd === 'which' ? (args[0] === 'xterm' ? { started: true, code: 0, stdout: '/usr/bin/xterm\n' } : { started: true, code: 1, stdout: '' }) : { started: true, code: 0, stdout: '' });
    let vdirs = 0; const vdir = () => { const d = path.join(TMP, 'vnc-' + (++vdirs)); fs.mkdirSync(d, { recursive: true }); return d; };
    const firstStart = async (mod, dir, xpid, { real = false } = {}) => {   // a Start whose X server we spawned (recorded as _ensureRunning does) and whose helpers got no reply
      const m = new mod.VncManager({ dataDir: dir, port: vport, display: ':93' });
      m._own = { pid: xpid, start: startOf(xpid) }; m._record(xpid);
      answer = noReplyAll;
      // real: the lookups themselves get no reply (only while no helper has a kept path: a no-reply serves the last good one, r2030);
      // else the answer _startSession gives for it, handed to the same _sessionOn
      const first = await m._sessionOn(real ? await m._startSession() : { noReply: ['dbus-launch', 'xfce4-session', 'startxfce4', 'openbox-session', 'xterm'] });
      return { m, first: first.session };
    };
    const reopen = async (mod) => {
      const { m, first } = await firstStart(mod, vdir(), process.pid, { real: true });   // this process stands for our X server: alive, its start known
      const again = await m.ensureRunning();
      answer = xtermOnly; const x0 = directOf('xterm');
      const third = await m.ensureRunning(); const started = directOf('xterm') - x0;
      const fourth = await m.ensureRunning();
      return { first, again: again.session, third: third.session || null, started, after: directOf('xterm') - x0, mark: m._sessionNoReply, fourth: fourth.session || null };
    };
    const VSRC2 = read('src/vnc.js');
    const ro = await reopen(V);
    const roRel = await reopen(require(M.write('src/vnc.js', anchored(VSRC2, "      if (this._noReplyMark() && this._ourX()) return this._sessionOn(await this._startSession());\n", '', 'adopt-bare'), 'adopt-bare')));
    const part = await new V.VncManager({ dataDir: vdir(), port: 1, display: ':92' })._sessionOn({ cmd: 'xterm', noReply: ['dbus-launch'] });
    ok(ro.first === 'no-reply' && ro.again === 'no-reply' && ro.third === null && ro.started === 1 && ro.after === 1 && ro.mark === null && ro.fourth === null && roRel.again === undefined && roRel.started === 0 && part.session === 'partial' && JSON.stringify(part.sessionNoReply) === '["dbus-launch"]',
      'a Desktop REOPENED on our display whose session got no reply runs the lookups again: a second no-reply is said again, a reply starts the session there (once: the next open adopts it); the bus helper alone is said (`partial`) — RED: today\'s adoption returns the bare display silently, nothing started', { ro, roRel: { again: roRel.again, started: roRel.started }, part: part.session });
    // (1) our X server DIED (another took the display): adopted as before, no session started on a display not ours
    const deadRun = async (mod) => { const { m } = await firstStart(mod, vdir(), NO_PID); answer = xtermOnly; const x0 = directOf('xterm'); const r = await m.ensureRunning(); return { session: r.session || null, started: directOf('xterm') - x0 }; };
    const dead = await deadRun(V);
    const deadRel = await deadRun(require(M.write('src/vnc.js', anchored(VSRC2, "      if (this._noReplyMark() && this._ourX()) return this._sessionOn(await this._startSession());\n", "      if (this._sessionNoReply && this._own) return this._sessionOn(await this._startSession());   // MUTANT: r2262's check (set once, never alive)\n", 'own-set'), 'own-set')));
    // (2) A HUB RESTART between the toast and the reopen: the mark is kept beside the display's record, honoured while its X server is still that one
    const restartRun = async (mod) => {
      const dir = vdir(); await firstStart(V, dir, process.pid);   // the hub before the restart (the real module) marked the display
      const after = new mod.VncManager({ dataDir: dir, port: vport, display: ':91' });   // the restarted hub: nothing in memory, its display read from the record
      answer = xtermOnly; const x0 = directOf('xterm');
      const r = await after.ensureRunning();
      const rec = JSON.parse(fs.readFileSync(path.join(dir, 'vnc.json'), 'utf8'));
      return { display: after.display, started: directOf('xterm') - x0, session: r.session || null, markLeft: !!rec.sessionNoReply };
    };
    const rs = await restartRun(V);
    const rsRel = await restartRun(require(M.write('src/vnc.js', anchored(VSRC2, "    const r = recordedDisplay(this._stateFile, this.port, { whole: true });\n    return r && Array.isArray(r.sessionNoReply) && r.sessionNoReply.length ? r.sessionNoReply : null;\n", '    return null;   // MUTANT: the mark in memory only\n', 'mark-in-memory'), 'mark-in-memory')));
    srv.close();
    ok(dead.started === 0 && dead.session === null && deadRel.started === 1 && rs.display === ':93' && rs.started === 1 && rs.markLeft === false && rsRel.started === 0,
      'the retry asks that our X server is STILL the same process: dead or replaced, the display is adopted as before (nothing started there) — RED: r2262\'s check starts a session on a display not ours; and a HUB RESTART between the toast and the reopen keeps the mark beside the display\'s record: the reopen starts the session, the mark cleared — RED: a mark in memory only adopts the bare display', { dead, deadRel, rs, rsRel });

    // (e) 主开发 r2262 MUST 2 + r2489 (3) — the fallback's walk along PATH never stats a folder on the hub's loop, and keeps PATH order:
    // a stall placed in one folder
    const STALL = path.join(TMP, 'stall-bin'); fs.mkdirSync(STALL, { recursive: true });
    const SPm = require(path.join(ROOT, 'src/storage-path.js')), rootOfWas = SPm.rootOf;
    SPm.rootOf = () => null;   // the scene the round names: no root known for the folder (a boot's first moments, or a mount the witness does not know)
    const statSyncWas = fs.statSync, pstatWas = fs.promises.stat;
    fs.statSync = function (p, ...r) { if (String(p).startsWith(STALL + path.sep)) { const t = nowWas(); while (nowWas() - t < 300) { } throw Object.assign(new Error('planted stall'), { code: 'ENOENT' }); } return statSyncWas.call(this, p, ...r); };
    fs.promises.stat = function (p, ...r) { if (String(p).startsWith(STALL + path.sep)) return new Promise(() => { }); return pstatWas.call(this, p, ...r); };
    const { monitorEventLoopDelay } = require('perf_hooks');
    const loopMax = async (fn) => { const keep = setInterval(() => { }, 20); const h = monitorEventLoopDelay({ resolution: 10 }); h.enable(); try { await new Promise((r) => setTimeout(r, 40)); const v = await fn(); await new Promise((r) => setTimeout(r, 30)); return { v, maxMs: Math.round(h.max / 1e6) }; } finally { h.disable(); clearInterval(keep); } };   // a ref'd keep-alive (the walk's bound timer is unref'd, the placed stat never answers); the monitor's first samples before the walk (a block before them is never recorded)
    let walk, walkAfter, oldWalk, orderRel;
    try {
      skew += 61e3;
      process.env.PATH = STALL + path.delimiter + BIN + path.delimiter + pathWas;   // the stalled folder AHEAD of tmux
      walk = await loopMax(() => SS.tmuxPathAsync({ statMs: 150 }));
      const SSRC2 = read('src/session-store.js');
      const LATER = require(M.write('src/session-store.js', anchored(SSRC2, "    if (a === undefined) return undefined;   // r2489 (3): an earlier folder past its bound — no answer, never a later folder's tmux\n", '', 'later-folder'), 'later-folder'));
      orderRel = (await loopMax(() => LATER.tmuxPathAsync({ statMs: 150 }))).v;   // inside the keep-alive too: its bound timer is unref'd
      const OLDW = require(M.write('src/session-store.js', anchored(SSRC2, "async function tmuxPathAsync({ statMs = TMUX_WALK_STAT_MS } = {}) {\n", "async function tmuxPathAsync() { await landTmuxMounts(); return tmuxOnPath(); }   // MUTANT: the build's walk, on the loop\nasync function tmuxPathAsyncOff({ statMs = TMUX_WALK_STAT_MS } = {}) {\n", 'walk-on-loop'), 'walk-on-loop'));
      oldWalk = await loopMax(() => OLDW.tmuxPathAsync());
      process.env.PATH = BIN + path.delimiter + STALL + path.delimiter + pathWas;   // the stalled folder BEHIND tmux
      walkAfter = await loopMax(() => SS.tmuxPathAsync({ statMs: 150 }));
    } finally { fs.statSync = statSyncWas; fs.promises.stat = pstatWas; process.env.PATH = pathWas; SPm.rootOf = rootOfWas; }
    ok(walk.v === undefined && walk.maxMs < 100 && walkAfter.v === path.join(BIN, 'tmux') && walkAfter.maxMs < 100 && orderRel === path.join(BIN, 'tmux') && oldWalk.v === path.join(BIN, 'tmux') && oldWalk.maxMs >= 250,
      `the no-\`which\` fallback walks PATH OFF THE LOOP and in PATH ORDER: a folder that never answers AHEAD of tmux makes the walk a no-reply at its bound (loop's longest step ${walk.maxMs} ms), BEHIND it tmux is found (${walkAfter.maxMs} ms) — REDs: a copy that takes a later folder's tmux past an earlier silent one; the build's walk stats each folder on the loop (${oldWalk.maxMs} ms held by one stalled folder)`, { walk, walkAfter, orderRel, oldWalk });

    // r2489 (4): the memory item's reason is cut at 200 characters (it goes into a For-you item whole)
    {
      answer = (cmd) => (cmd === 'ps' ? { started: true, code: 1, error: 'x'.repeat(500), stdout: '' } : { started: true, code: 0, stdout: '' });
      let item = null;
      const w = require(path.join(ROOT, 'src/server/memory-pressure-watch.js')).create({ activeSessions: new Map(), BUFFERS_DIR: TMP, getUserTodos: () => ({ add: (k, it) => { item = it; return { id: 'x' }; } }), getSessionStatus: () => null, sessionStatusKey: () => 'k', log: { warn() { }, log() { } } });
      w.onSample({ used: 99, limit: 100 });
      for (let i = 0; i < 400 && !item; i++) await new Promise((r) => setTimeout(r, 5));
      w.stop();
      const why = item ? (/The process table was not read \((.*)\): which processes hold the memory/.exec(item.detail) || [])[1] : null;
      ok(typeof why === 'string' && why.length === 200 && why.startsWith('ps: xxx'), 'the memory item\'s reason is CUT at 200 characters (a 500-character error)', { len: why && why.length });
    }

    // the smalls of r2262: a no-reply keeps the «no lookup program» fact; the pane map served old is SAID (first no-reply, the cap)
    answer = (cmd, args) => (cmd === 'which' && args[0] === 'vs-nowhich-cmd' ? { started: false, error: 'ENOENT' } : { started: true, code: 0, stdout: '' });
    const nw1 = await WK.whichFreshAnswer('vs-nowhich-cmd');
    answer = (cmd, args) => (cmd === 'which' && args[0] === 'vs-nowhich-cmd' ? { unknown: true } : { started: true, code: 0, stdout: '' });
    skew += 61e3; const nw2 = await WK.whichFreshAnswer('vs-nowhich-cmd');
    ok(nw1.noLookup === true && nw1.known === true && nw2.known === false && nw2.noLookup === true, 'a no-reply after «no lookup program» KEEPS that fact (the tmux road still takes its own walk)', { nw1, nw2 });
    const warnWas2 = console.warn; const said = []; console.warn = (...a) => { said.push(a.join(' ')); };
    try {
      answer = (cmd, args) => (cmd === 'tmux' ? { started: true, code: 0, stdout: '7171||said:0.0\n' } : prevAnswer(cmd, args));
      SS.useTmuxReader(RS.tmuxReaderVia()); skew += 61e3; await SS.getTmuxPaneMapAsync();
      answer = (cmd, args) => (cmd === 'tmux' ? { unknown: true } : prevAnswer(cmd, args));
      for (let i = 0; i < 9; i++) { skew += SS.TMUX_NO_REPLY_MAX_MS + 1; await SS.getTmuxPaneMapAsync(); }
    } finally { console.warn = warnWas2; SS.useTmuxReader(RS.tmuxReaderVia()); }
    const firstSaid = said.filter((w) => w.includes("tmux's pane list got no reply")).length, capSaid = said.filter((w) => w.includes("tmux's pane list still gets no reply")).length;
    ok(firstSaid === 1 && capSaid === 1, `the pane map served old is SAID: one line at the first no-reply (${firstSaid}), one when the wait reaches its cap (${capSaid}), then silent`, said.slice(0, 3));
    const DS = require(path.join(ROOT, 'src/desktop-screens.js'));
    const loc = DS.pickerRows({ local: { available: true, lookup: 'no-reply' } }).find((r) => r.kind === 'local');
    const APP = read('src/lib/app.js'), PICK = read('src/lib/desktop-picker.js'), DW = read('src/lib/desktop-window.js'), ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js');
    const KEYS = ['Could not check this host for a VNC server just now: the lookup got no answer in time. Opening it looks again.', 'The desktop is up without its session: looking up {names} got no answer in time. Close the Desktop and open it again to retry.', 'The process table was not read ({why}): which processes hold the memory is not known this time.', 'The desktop started, but looking up {names} got no answer in time: it runs without them.'];
    ok(!!loc && loc.lookup === 'no-reply' && loc.enabled === true && APP.includes("this._vncAvailable = !!d.available || this._vncLookup === 'no-reply';") && PICK.includes("if (r.kind === 'local' && r.lookup === 'no-reply')") && PICK.includes('lookup: app._vncLookup || null') && DW.includes("if (st.session === 'no-reply') showToast(") && DW.includes("else if (st.session === 'partial') showToast(") && VSRC.includes("if (noReply && !sess.cmd) { this._sessionNoReply = noReply; this._markRecord(noReply); return { ...st, session: 'no-reply', sessionNoReply: noReply }; }") && KEYS.every((k) => ZH.includes(JSON.stringify(k) + ':') && JA.includes(JSON.stringify(k) + ':')),
      'the status\'s NO REPLY reaches the page\'s words: the Desktop entry stays, the picker\'s local row says it (live, never greyed), a bare Start says why; every new word in zh and ja', { loc });
    const KB = read('docs/kb-api.md'), TS = read('src/plugins/tailscale.js'), WKS = read('src/plugins/which-kept.js');
    const kbLine = (KB.split('\n').find((l) => l.includes('GET /api/jobs-escapes (read-only systemd/crontab listing: ')) || '');
    ok(kbLine.includes('`?fresh=1`') && kbLine.includes('`unread`') && kbLine.includes('`keptAt`') && !/graceKill|GRACE_MS/.test(TS) && !/graceKill|GRACE_MS/.test(WKS), 'kb-api names the fresh read, `unread` and `keptAt`; the proxy plugin\'s dead import (graceKill, GRACE_MS) and the lookup\'s unused kill are gone');
  } finally { Date.now = nowWas; process.env.PATH = pathWas; }
}
say('⑨ B-323e\'S REMAINDER (lane bl-chat-b, 主开发 r2681) — the copy\'s du, the CLI which, the agy poll and the tailnet lookup ride the starter; each no-reply says what it said before');
WD.section('⑨');
{
  const prev9 = answer;
  // (a) THE COPY'S du (src/routes/files.js localDuBytes: two a tick, every 1.2 s, while a person's local folder copy runs) — read out of
  //     the file with DU_SH, run over the suite's starter (its free names handed: fs, require, process, and execFile for the RED)
  const FILES = read('src/routes/files.js');
  const duOf = (src) => { const d = src.indexOf('const DU_SH = '), de = src.indexOf('\n', d), a = src.indexOf('function localDuBytes(p) {'), e = src.indexOf('\n}\n', a);
    return new Function('fs', 'require', 'process', 'execFile', `${src.slice(d, de)}\n${src.slice(a, e + 2)}\nreturn localDuBytes;`)(fs, (m) => (m === '../server/child-starter' ? CS : require(m)), process, cp.execFile); };
  const DIR9 = path.join(TMP, 'du-dest'); fs.mkdirSync(DIR9, { recursive: true }); fs.writeFileSync(path.join(TMP, 'du-file'), 'x'.repeat(7));
  answer = (cmd, args) => (cmd === 'sh' ? { started: true, code: 0, stdout: '8192\n' } : prev9(cmd, args));
  const du = duOf(FILES), D0 = directOf('sh'), A0 = asked.length;
  const got = await du(DIR9), q = asked.slice(A0).find((x) => x.cmd === 'sh');
  const file = await du(path.join(TMP, 'du-file')), nFile = asked.length;
  answer = (cmd, args) => (cmd === 'sh' ? { unknown: true } : prev9(cmd, args));
  const none = await du(DIR9);
  ok(got === 8192 && file === 7 && none === 0 && !!q && q.args[0] === '-c' && q.args[1].startsWith(`du -sb '${DIR9}'`) && q.o.timeoutMs === 30000 && q.o.capture === true && typeof q.o.envAdd.PATH === 'string' && nFile - A0 === 1 && directOf('sh') === D0,
    `(a) the copy's du asks the starter (sh -c du …, 30 s): ${got} bytes for a folder, a file's size with no start, and a NO-REPLY reads 0 as a failed du did (the bar keeps its last value) — none from the hub's process`, { got, file, none, q: q && { args: q.args, o: q.o } });
  const OLDDU = anchored(FILES, "    : Promise.resolve().then(() => require('../server/child-starter').childStarter().run('sh', ['-c', DU_SH(p)], { timeoutMs: 30000, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '' } }))\n      .then((r) => parseInt(String((r && r.stdout) || ''), 10) || 0, () => 0)), () => 0);\n",
    "    : new Promise((resolve) => execFile('sh', ['-c', DU_SH(p)], { timeout: 30000 }, (e, out) => resolve(parseInt(out, 10) || 0)))), () => 0);\n", 'the release\'s du');   // stale-pins: kept (the release's text — the leg's RED)
  const D1 = directOf('sh'); await duOf(OLDDU)(DIR9);
  ok(directOf('sh') - D1 === 1, '(a) RED: the release\'s du starts `sh` from the hub\'s process (the spy counts it)', { direct: directOf('sh') - D1 });

  // (b) THE CLI which (src/server/cli-cmd.js resolveCmdAsync: a MISSING CLI looked up again every RECHECK_MS while its status is polled)
  const CLI = require(path.join(ROOT, 'src/server/cli-cmd.js'));
  answer = (cmd, args) => (cmd === 'which' ? (args[0] === 'vs-cli-found' ? { started: true, code: 0, stdout: '/opt/vs/bin/vs-cli-found\n' } : { unknown: true }) : prev9(cmd, args));
  const W0 = directOf('which'), A1 = asked.length;
  const found = await CLI.resolveCmdAsync('vs-cli-found'), wq = asked.slice(A1).find((x) => x.cmd === 'which');
  const unanswered = await CLI.resolveCmdAsync('vs-cli-none');   // no reply: the hub's own dir walk, then the bare name
  ok(found === '/opt/vs/bin/vs-cli-found' && unanswered === 'vs-cli-none' && !!wq && JSON.stringify(wq.args) === '["vs-cli-found"]' && wq.o.timeoutMs === 2000 && typeof wq.o.envAdd.PATH === 'string' && directOf('which') === W0,
    `(b) the CLI which asks the starter (2 s): ${found}; a NO-REPLY is no answer — the hub's own dir walk, then the bare name (${unanswered}) — none from the hub's process`, { found, unanswered, wq: wq && { args: wq.args, o: wq.o } });
  const CC = read('src/server/cli-cmd.js');
  const OLDCLI = anchored(anchored(CC, "const { execFileSync } = require('child_process');", "const { execFileSync, execFile, spawn } = require('child_process');", 'the release\'s import'),   // stale-pins: kept (the release's import — the leg's RED)
    "    Promise.resolve().then(() => require('./child-starter').childStarter().run('/usr/bin/which', [name], { timeoutMs: 2000, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '' } }))\n      .then((x) => ({ err: !(x && x.started !== false && !x.unknown && !x.timedOut && !x.overflow && x.code === 0), out: String((x && x.stdout) || '') }), () => ({ err: true, out: '' }))\n      .then(async ({ err, out }) => {\n",
    "    execFile('/usr/bin/which', [name], { encoding: 'utf-8', timeout: 2000 }, async (err, out) => {\n", 'the release\'s which');   // stale-pins: kept (the release's text — the leg's RED)
  const OLDC = require(M.write('src/server/cli-cmd.js', OLDCLI, 'release-which'));
  const W1 = directOf('which'); await OLDC.resolveCmdAsync('vs-cli-found');
  ok(directOf('which') - W1 === 1, '(b) RED: the release\'s which starts from the hub\'s process (the spy counts it)', { direct: directOf('which') - W1 });

  // (c) THE AGY POLL (src/agy-discover.js: the index child, ≤ 1 per 15 s per account root, only when its index changed) — the hub
  //     hands its starter (src/routes/sessions.js, at its load); the file is in the device agent's bundle, so it names no starter
  const AGY = require(path.join(ROOT, 'src/agy-discover.js')), AS = require(path.join(ROOT, 'src/agy-store.js'));
  const nodeName = path.basename(process.execPath); WATCH.add(nodeName);   // for this section: an index child started DIRECTLY is counted, never run
  try {
    const dataDir = path.join(TMP, 'agy-data'), home = path.join(dataDir, 'agy-subs', 'agy-0a1b2c3d'), idx = path.join(home, '.gemini', 'antigravity-cli');
    fs.mkdirSync(idx, { recursive: true }); fs.writeFileSync(path.join(idx, AS.SUMMARIES), 'one');
    const ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
    answer = (cmd, args) => (cmd === nodeName ? { started: true, code: 0, stdout: JSON.stringify({ [home]: [{ id: ID, title: 'Atlas', cwd: '/w', at: 5 }] }) } : prev9(cmd, args));
    AGY.useStarter(fake); AGY._cache.clear();
    const N0 = directOf(nodeName), A2 = asked.length;
    const rows1 = await AGY.discover({ activeSessions: new Map(), harnessId: 'antigravity', dataDir, now: 1e9 });
    const iq = asked.slice(A2).find((x) => x.cmd === nodeName);
    fs.writeFileSync(path.join(idx, AS.SUMMARIES), 'two, changed');   // the index changed: asked again past CHECK_MS
    answer = (cmd, args) => (cmd === nodeName ? { unknown: true } : prev9(cmd, args));
    const A3 = asked.length;
    const rows2 = await AGY.discover({ activeSessions: new Map(), harnessId: 'antigravity', dataDir, now: 1e9 + AGY.CHECK_MS + 1 });
    const again = asked.slice(A3).filter((x) => x.cmd === nodeName).length;
    ok(rows1.length === 1 && rows1[0].backendSessionId === ID && rows2.length === 1 && rows2[0].backendSessionId === ID && again === 1 && !!iq && iq.args.includes(home) && iq.o.wholeEnv === true
      && JSON.stringify(Object.keys(iq.o.env || {}).sort()) === '["LANG","PATH"]' && iq.o.timeoutMs === 10000 && iq.o.maxBuffer === 4 * 1024 * 1024 && directOf(nodeName) === N0,
      `(c) the agy poll's index child asks the handed starter with its WHOLE env {PATH, LANG}, 10 s, 4 MB; a NO-REPLY keeps the last rows (${rows2.length}) and is asked again next time — none from the hub's process`, { rows1: rows1.length, rows2: rows2.length, again, iq: iq && { args: iq.args.length, o: iq.o } });
    const AGYS = read('src/agy-discover.js'), SESS = read('src/routes/sessions.js');
    ok(SESS.includes("require('../agy-discover').useStarter(require('../server/child-starter').childStarter());") && !AGYS.includes('child-starter') && AGYS.includes('const runIndexChild = (bin, args, ms) => new Promise((resolve) => {'),
      '(c) the hub hands it at the sessions route\'s load; the device bundle\'s copy names no starter and keeps its own child (runIndexChild, the census\'s not-hub row)');
    const OLDAGY = anchored(AGYS, "runChild = null } = {}) {\n  if (!inflight) inflight = refresh(dataDir, now, runChild || (starterRun ? runViaStarter : runIndexChild))", "runChild = runIndexChild } = {}) {\n  if (!inflight) inflight = refresh(dataDir, now, runChild)", 'the release\'s discover');   // stale-pins: kept (the release's text — the leg's RED)
    const REL = require(M.write('src/agy-discover.js', OLDAGY, 'release-discover'));
    REL.useStarter(fake);
    const N1 = directOf(nodeName); await REL.discover({ activeSessions: new Map(), harnessId: 'antigravity', dataDir, now: 2e9 });
    ok(directOf(nodeName) - N1 === 1, '(c) RED: the release\'s discover starts the index child from the hub\'s process, a starter handed or not (the spy counts it)', { direct: directOf(nodeName) - N1 });
  } finally { WATCH.delete(nodeName); AGY.useStarter(null); }

  // (d) THE TAILNET LOOKUP (src/plugins/tailscale.js refreshNames: ≤ 1 per 60 s while our daemon runs, fired by a dial by name, a
  //     browser's PAC / launch, reachFresh) — its body read: the starter, the same bound and buffer, a no-reply a failed read
  const TSs = read('src/plugins/tailscale.js');
  const look = (src) => { const i = src.indexOf('    const refreshNames = () => {'), j = src.indexOf('    const namesStale = ', i), b = i < 0 || j < 0 ? '' : src.slice(i, j);
    return b.includes("require('../server/child-starter').childStarter().run(cli, [`--socket=${tsSock()}`, 'status', '--json'], { timeoutMs: 5000, capture: true, maxBuffer: 16 << 20,") && !b.includes('execFile(') && b.includes('if (!took) names.failAt = Date.now();'); };
  const TSOLD = anchored(TSs, "names.pending = Promise.resolve().then(() => require('../server/child-starter').childStarter().run(cli, [`--socket=${tsSock()}`, 'status', '--json'], { timeoutMs: 5000, capture: true, maxBuffer: 16 << 20,",
    "names.pending = new Promise((resolve) => execFile(cli, [`--socket=${tsSock()}`, 'status', '--json'], { timeout: 5000, maxBuffer: 16 << 20,", 'the release\'s lookup');   // stale-pins: kept (the release's text — the leg's RED)
  ok(look(TSs) && !look(TSOLD), '(d) the tailnet lookup asks the starter (5 s, 16 MB); a no-reply is a failed read (failAt: the last table serves, its time said) — RED: the release\'s text, `status --json` from the hub\'s process');
  answer = prev9;
}
say('⑩ B-323e\'S REMAINDER, the login-shell look (lane bl-chat-b, 主开发 r2689 (a)) — the starter\'s SESSION option: its own session and folder, the session\'s group ended at the child\'s exit and at the bound; the shell asked through it');
WD.section('⑩');
{
  const prev10 = answer;
  // a scratch process's life read from /proc (gone, or a zombie: no longer running) — never a signal
  const gone10 = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return st.slice(st.lastIndexOf(')') + 2).split(' ')[0] === 'Z'; } catch { return true; } };
  const waitGone = async (pid) => { for (let i = 0; i < 300 && !gone10(pid); i++) await new Promise((r) => setTimeout(r, 10)); return gone10(pid); };
  // r2917: the leftover a RED leaves (the shell's job, the holder outside the group) waits on ITS OWN fifo, which the shell made and
  // named; this suite ends it BY THAT HANDLE — the fifo opened for writing and closed ends the wait — never by a number signalled
  const endByFifo = (f) => { if (!f) return; let fd = null; try { fd = fs.openSync(f, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.writeSync(fd, '\n'); } catch { /* no reader left: it has ended */ } finally { if (fd !== null) try { fs.closeSync(fd); } catch { } } };
  // each wait's fifo is named HERE and handed in by the run's env (known even when a RED's run never answers); each wait opens it
  // read-write (no open blocks) and reads ONE line with a 20 s bound of its own, so nothing is left even if this suite stops first
  let fifos = 0;
  const fifoName = (tag) => path.join(CWD10 || TMP, `${tag}-fifo.${process.pid}.${++fifos}`);
  const CWD10 = fs.realpathSync(fs.mkdtempSync(path.join(TMP, 'session-')));
  // bash (the spy watches `sh`): the shell prints its folder and its job's pid, then exits — the job (a wait on its own fifo) still holds the pipe
  const LINE = 'mkfifo "$VS_WAIT_FIFO"; bash -c \'exec 3<>"$1"; read -t 20 -u 3 x\' bash "$VS_WAIT_FIFO" & echo "job=$!"; echo "cwd=$(pwd)"; echo answered';
  const read10 = (r) => ({ job: Number((/job=(\d+)/.exec(String((r && r.stdout) || '')) || [])[1]) || 0, cwd: (/cwd=(.*)/.exec(String((r && r.stdout) || '')) || [])[1] || '', answered: /answered/.test(String((r && r.stdout) || '')) });
  const sessionLegs = async (S, road) => {
    const fa = fifoName('job');
    const r = await S.run('/bin/bash', ['-c', LINE], { timeoutMs: 8000, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '', VS_WAIT_FIFO: fa }, session: { cwd: CWD10 } });
    const f = read10(r), jobGone = f.job > 1 ? await waitGone(f.job) : false;
    ok(!!r && r.timedOut !== true && r.code === 0 && f.answered && f.cwd === CWD10 && f.job > 1 && jobGone,
      `(${road}) a SESSION child answers when the shell ends — its job left holding the pipe, the session's group ended by the starter (the job gone: ${jobGone}), in its own folder (${f.cwd === CWD10})`, { r: r && { timedOut: r.timedOut, code: r.code, unknown: r.unknown }, f, jobGone });
    const fr = fifoName('job');
    const red = await S.run('/bin/bash', ['-c', LINE], { timeoutMs: 500, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '', VS_WAIT_FIFO: fr } });
    endByFifo(fr);   // the job left holding the pipe — ended by its fifo (r2917: the handle, never its number)
    ok(!!red && red.timedOut === true, `(${road}) RED: the same child with NO session option — its job holds the pipe and nobody ends it: the run reaches its bound (timedOut ${red && red.timedOut})`, red && { timedOut: red.timedOut, code: red.code });
  };
  // (a) THE STARTER's road: a REAL starter process (its own children are real; this process's spy never sees them)
  const S1 = CS.createChildStarter();
  try { await sessionLegs(S1, 'a, the starter'); } finally { S1.closePipe(); }
  // (a2) a WHOLE env through the REAL starter keeps the login-shell look's MARK (VIBESPACE_SHELL_PROBE, a word a person's rc reads)
  //      and still drops the hub's own names (a planted token) — the gate's own red found the mark dropped (the fake starter skips
  //      the belt); RED: a copy of the starter whose belt keeps no mark
  const markLegs = async (CSmod, { session = true } = {}) => { const S = CSmod.createChildStarter(); try {
    const r = await S.run('/bin/bash', ['-c', 'env'], { timeoutMs: 8000, capture: true, maxBuffer: 256 * 1024, wholeEnv: true, ...(session ? { session: { cwd: CWD10 } } : {}), env: { PATH: process.env.PATH || '', VIBESPACE_SHELL_PROBE: '1', VIBESPACE_SESSION_TOKEN: ['vs', 'planted', 'x'].join('-') } });
    const names = String((r && r.stdout) || '').split('\n').map((l) => l.split('=')[0]);
    return { mark: names.includes('VIBESPACE_SHELL_PROBE'), token: names.includes('VIBESPACE_SESSION_TOKEN'), n: names.length };
  } finally { S.closePipe(); } };
  const mk1 = await markLegs(CS);
  ok(mk1.mark && !mk1.token && mk1.n > 1, `(a2) a whole env through the REAL starter keeps the login-shell look's mark (${mk1.mark}) and drops the hub's own token (${!mk1.token})`, mk1);
  // r2917: the mark is kept ONLY for a request that carries the session option (the login-shell look) — a whole env without it drops it
  const mk0 = await markLegs(CS, { session: false });
  ok(!mk0.mark && !mk0.token && mk0.n > 1, `(a2) a whole env WITHOUT the session option drops the login-shell look's mark (${!mk0.mark}) as it drops the hub's token (${!mk0.token})`, mk0);
  const NOMARK = M.load('src/server/child-starter.js', anchored(read('src/server/child-starter.js'), 'if (HUB_OWN.test(k) && !(marks && (marks instanceof Set ? marks : WHOLE_MARKS).has(k))) { n++; continue; }', 'if (HUB_OWN.test(k)) { n++; continue; }', 'no mark kept'), 'no-mark');   // stale-pins: kept (the release's belt — the leg's RED)
  const mk2 = await markLegs(NOMARK);
  ok(!mk2.mark && !mk2.token, `(a2) RED: the starter's belt with no mark kept — the login-shell look's mark is dropped (${mk2.mark})`, mk2);
  // (b) THE OLD ROAD: a starter whose script ends at once — two faults, then the direct start from this process
  const DIES = path.join(TMP, 'starter-dies.js'); fs.writeFileSync(DIES, 'process.exit(0)\n');
  const S2 = CS.createChildStarter({ script: DIES, log: { warn() { } } });
  for (let i = 0; i < 6 && !S2.stats().direct; i++) await S2.run('/bin/bash', ['-c', 'true'], { timeoutMs: 500 });
  ok(S2.stats().direct === true, '(b) the starter that ends at once falls to the old road (the direct start) after its two faults', S2.stats());
  await sessionLegs(S2, 'b, the old road');
  // (d) r2862 — A HOLDER OUTSIDE THE GROUP (the person's rc starts `setsid <tool> &` with no redirect: it keeps the shell's output open
  //     and sits in a session of its own, which the group end cannot reach). THE LAW: the run is answered at the shell's exit, the
  //     entry leaves the held list, and the group is signalled ONCE — nothing to that number after the leader's exit, at the bound or
  //     at the starter's end. The starter's own process is driven by its protocol with a preload that COUNTS every group signal
  //     (a negative pid); RED: today's text (the group end at every call, the run ended only at the pipes' close)
  const PRE = path.join(TMP, 'count-group-kills.cjs');
  fs.writeFileSync(PRE, "const fs = require('fs'), k = process.kill; process.kill = function (pid, sig) { if (Number(pid) < 0) fs.appendFileSync(process.env.VS_KILL_LOG, String(pid) + ' ' + String(sig) + '\\n'); return k.apply(this, arguments); };\n");
  // the holder writes its pid from INSIDE its new session, and the shell waits for that file before it ends (by state, bounded): a shell
  // that ended first had its group signal take the holder with it before it left the group (the first gate's REDs read green)
  const HOLDER = 'F="$PWD/holder-ready.$$"; mkfifo "$VS_WAIT_FIFO"; setsid bash -c \'echo "$$" > "$1"; exec 3<>"$2"; read -t 20 -u 3 x\' bash "$F" "$VS_WAIT_FIFO" & for i in $(seq 1 200); do [ -s "$F" ] && break; sleep 0.02; done; echo "job=$(cat "$F" 2>/dev/null)"; echo answered';
  const tick10 = (ms) => new Promise((r) => setTimeout(r, ms));
  // r2917: the bound is SECONDS (a loaded machine must not turn the green red); the scenes run side by side, each in its own process
  const BOUND10 = 3000;
  const holderRun = async (script) => {
    const log = path.join(TMP, `group-kills-${path.basename(script)}.log`); fs.writeFileSync(log, '');
    const p = cp.spawn(process.execPath, ['-r', PRE, script], { env: { PATH: process.env.PATH || '', VS_KILL_LOG: log }, stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = ''; const evs = [];
    p.stdout.setEncoding('utf8'); p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { evs.push(JSON.parse(l)); } catch { } } });
    const t0 = Date.now(), fh = fifoName('holder');
    p.stdin.write(JSON.stringify({ op: 'run', id: 1, cmd: '/bin/bash', args: ['-c', HOLDER], env: { PATH: process.env.PATH || '', VS_WAIT_FIFO: fh }, whole: true, timeoutMs: BOUND10, maxBuffer: 65536, capture: true, session: { cwd: CWD10 } }) + '\n');
    const exitEv = () => evs.find((e) => e.id === 1 && e.ev === 'exit'), boundEv = () => evs.find((e) => e.id === 1 && e.ev === 'timeout');
    while (Date.now() - t0 < BOUND10 + 3000 && !exitEv() && !boundEv()) await tick10(10);   // the answer, or the bound — whichever comes first
    const answeredFirst = !!exitEv() && !boundEv();
    while (Date.now() - t0 < BOUND10 + 400) await tick10(10);                            // past the bound: what it would send, it has sent
    p.stdin.end();                                                                // the starter's end: every entry still held
    await new Promise((r) => { const t = setTimeout(r, 3000); p.once('exit', () => { clearTimeout(t); r(); }); });
    const kills = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
    const out = String((exitEv() || {}).stdout || ''), job = Number((/job=(\d+)/.exec(out) || [])[1]) || 0;
    endByFifo(fh);   // the holder outside the group — ended by its fifo (r2917: the handle, never its number)
    return { answeredFirst, timedOut: !!boundEv(), answered: /answered/.test(out), kills, job, stderr: String((exitEv() || {}).stderr || '').slice(0, 300) };
  };
  const STARTER_PROC = path.join(ROOT, 'src/server/child-starter-proc.js');
  const PSRC10 = read('src/server/child-starter-proc.js');
  const TODAY = anchored(anchored(PSRC10, "{ c.vsSession = false; try { process.kill(-c.pid, 'SIGKILL'); } catch { } } }", "{ try { process.kill(-c.pid, 'SIGKILL'); } catch { } } }", 'the group end at every call'),
    "  if (session) { c.vsSession = true; c.on('exit', (code, signal) => { endOwnGroup(c); if (timer) { clearTimeout(timer); timer = null; } drainT = setTimeout(() => { drainT = null; setImmediate(() => { if (done) return; try { c.stdout?.destroy(); c.stderr?.destroy(); } catch { } end({ code, signal }); }); }, SESSION_DRAIN_MS); }); }",
    "  if (session) { c.vsSession = true; c.on('exit', () => endOwnGroup(c)); }", 'the run ended only at the close');   // stale-pins: kept (35213bad6's text — the leg's RED)
  // (e) THE OLD ROAD (the direct start after two faults, the hub's own file): the same law, run in a process of its own (the same
  //     preload counts its group signals) so its two scenes run beside (d)'s
  const OLD_RUN = path.join(TMP, 'old-road-run.cjs');
  fs.writeFileSync(OLD_RUN, [
    "const [csPath, dies, cwd, bound] = process.argv.slice(2);",
    "const S = require(csPath).createChildStarter({ script: dies, log: { warn() { } } });",
    "(async () => {",
    "  for (let i = 0; i < 6 && !S.stats().direct; i++) await S.run('/bin/bash', ['-c', 'true'], { timeoutMs: 500 });",
    "  const t0 = Date.now();",
    "  const r = await S.run('/bin/bash', ['-c', process.env.VS_HOLDER], { timeoutMs: Number(bound), capture: true, maxBuffer: 65536, envAdd: { PATH: process.env.PATH || '', VS_WAIT_FIFO: process.env.VS_WAIT_FIFO }, session: { cwd } });",
    "  while (Date.now() - t0 < Number(bound) + 400) await new Promise((res) => setTimeout(res, 10));",
    "  process.stdout.write(JSON.stringify({ direct: S.stats().direct, timedOut: !!(r && r.timedOut), stdout: String((r && r.stdout) || '') }) + '\\n');",
    "  process.exit(0);",
    "})();", ''].join('\n'));
  const oldRoadRun = async (csPath) => {
    const log = path.join(TMP, `group-kills-old-${path.basename(csPath)}.log`); fs.writeFileSync(log, '');
    const fo = fifoName('holder');
    const p = cp.spawn(process.execPath, ['-r', PRE, OLD_RUN, csPath, DIES, CWD10, String(BOUND10)], { env: { PATH: process.env.PATH || '', VS_KILL_LOG: log, VS_HOLDER: HOLDER, VS_WAIT_FIFO: fo }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; p.stdout.setEncoding('utf8'); p.stdout.on('data', (d) => { out += d; });
    await new Promise((r) => { const t = setTimeout(r, BOUND10 + 8000); p.once('exit', () => { clearTimeout(t); r(); }); });
    let a = null; try { a = JSON.parse(out.trim().split('\n').pop()); } catch { a = null; }
    const kills = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
    endByFifo(fo);   // the holder outside the group — ended by its fifo
    return { direct: !!(a && a.direct), timedOut: !!(a && a.timedOut), answered: /answered/.test(String((a && a.stdout) || '')), kills };
  };
  const CSRC10 = read('src/server/child-starter.js');
  const TODAY_CS = anchored(anchored(CSRC10, "{ c.vsSession = false; try { process.kill(-c.pid, 'SIGKILL'); } catch { } } }", "{ try { process.kill(-c.pid, 'SIGKILL'); } catch { } } }", 'the group end at every call'),
    "c.on('exit', (code, signal) => { endOwnGroup(c); if (t) { clearTimeout(t); t = null; } setTimeout(() => setImmediate(() => { if (done) return; done = true; try { c.stdout?.destroy(); c.stderr?.destroy(); } catch { } resolve({ started: true, timedOut, overflow, code, signal, stdout: out, stderr: err }); }), SESSION_DRAIN_MS); }); }",
    "c.on('exit', () => endOwnGroup(c)); }", 'the run ended only at the close');   // stale-pins: kept (35213bad6's text — the leg's RED)
  const [hd, hdR, hx, hxR] = await Promise.all([holderRun(STARTER_PROC), holderRun(M.write('src/server/child-starter-proc.js', TODAY, 'today-session')),
    oldRoadRun(path.join(ROOT, 'src/server/child-starter.js')), oldRoadRun(M.write('src/server/child-starter.js', TODAY_CS, 'today-old-road'))]);
  ok(hd.answeredFirst && !hd.timedOut && hd.answered && hd.kills === 1,
    `(d) a holder outside the group (setsid, no redirect): the run is answered at the shell's exit, before its bound (${hd.answeredFirst}); the group signalled ONCE (${hd.kills}) — none at the bound, none at the starter's end (the entry left the held list)`, hd);
  ok(!hdR.answeredFirst && hdR.timedOut && hdR.kills >= 2,
    `(d) RED: 35213bad6's starter — the look reaches its bound (${hdR.timedOut}), and the group of a leader already reaped is signalled again (${hdR.kills} group signals: at the exit, at the bound, at the starter's end)`, hdR);
  ok(hx.direct && !hx.timedOut && hx.answered && hx.kills === 1, `(e) the old road: the same holder — answered at the exit (${!hx.timedOut}), the group signalled ONCE (${hx.kills})`, hx);
  ok(hxR.direct && hxR.timedOut && hxR.kills >= 2, `(e) RED: 35213bad6's old road — the bound reached (${hxR.timedOut}), the reaped leader's group signalled again (${hxR.kills})`, hxR);
  const CSS = read('src/server/child-starter.js'), PROC = read('src/server/child-starter-proc.js');
  const own = (src) => src.includes("function endOwnGroup(c) { if (c && c.vsSession && Number.isInteger(c.pid) && c.pid > 1) { c.vsSession = false; try { process.kill(-c.pid, 'SIGKILL'); } catch { } } }");
  ok(own(CSS) && own(PROC) && (PROC.match(/process\.kill\(/g) || []).length === 1 && (CSS.match(/process\.kill\(/g) || []).length === 1,
    'THE KILL LAW: each road ends only the group of a child it started itself (`vsSession`, detached: its pid is the group\'s id) by that child\'s own handle — one group kill a file, never a name or a pattern');

  // (c) THE LOGIN-SHELL LOOK (src/server/cli-cmd.js runShell / askShell) asks the starter with the session option
  const CLI2 = require(path.join(ROOT, 'src/server/cli-cmd.js'));
  const SHN = 'vs-standin-loginsh', SH10 = path.join(TMP, SHN); WATCH.add(SHN);
  try {
    const HOME10 = path.join(TMP, 'home10'); fs.mkdirSync(HOME10, { recursive: true });
    const env10 = { PATH: process.env.PATH || '', HOME: HOME10, USER: 'userL', GITHUB_TOKEN: ['gh', 'planted', 'x'].join('-'), VIBESPACE_SESSION_TOKEN: ['vs', 'planted'].join('-') };
    const ans = [{ unknown: true }, { started: true, timedOut: true }, { started: false, code: null, error: 'ENOENT' }, { started: true, overflow: true, code: null, stdout: '' }];   // r2917: + the overflow word
    const got = [], reqs = [];
    for (const a of ans) {
      answer = (cmd, args) => (cmd === SHN ? a : prev10(cmd, args));
      const A4 = asked.length; got.push(await CLI2.askShell('vs-cli-x', { shell: SH10, env: env10, timeoutMs: 3000 })); reqs.push(asked.slice(A4).find((x) => x.cmd === SHN));
    }
    const q = reqs[0] || { args: [], o: {} }, e = q.o.env || {};
    ok(reqs.every(Boolean) && JSON.stringify(q.args.slice(0, 3)) === '["-l","-i","-c"]' && q.o.session && q.o.session.cwd === HOME10 && q.o.wholeEnv === true && q.o.timeoutMs === 3000
      && e.TERM === 'dumb' && e.VIBESPACE_SHELL_PROBE === '1' && e.SHELL === SH10 && e.USER === 'userL' && !('GITHUB_TOKEN' in e) && !('VIBESPACE_SESSION_TOKEN' in e) && directOf(SHN) === 0,
      '(c) the login-shell look asks the starter: `-l -i -c <line>`, its own session in the person\'s HOME, its whole env the allowlist (TERM=dumb, the probe mark, SHELL itself, USER kept; no token), its bound — none from the hub\'s process', { args: q.args.slice(0, 3), o: { session: q.o.session, wholeEnv: q.o.wholeEnv, timeoutMs: q.o.timeoutMs }, envNames: Object.keys(e) });
    ok(got[0].kind === 'unanswered' && got[0].why === 'no-reply' && got[1].kind === 'unanswered' && got[1].why === 'timeout' && got[2].kind === 'unanswered' && got[2].why === 'spawn:ENOENT' && got[3].kind === 'unanswered' && got[3].why === 'overflow' && got.every((x) => x.shell === SH10),
      '(c) each no-reply says what it is: the starter gave no answer (no-reply), the bound (timeout), a start that failed (spawn:ENOENT), a printout past the cap (overflow) — the provisional path stays, as before (unanswered is never «none»)', got.map((x) => `${x.kind}:${x.why}`));
    const CCX = read('src/server/cli-cmd.js');
    const OLDSH = anchored(CCX, "require('./child-starter').childStarter().run(shell, ['-l', '-i', '-c', line], req)",
      "new Promise((res) => { const c = require('child_process').spawn(shell, ['-l', '-i', '-c', line], { env: req.env, detached: true }); c.on('error', (e) => res({ started: false, code: null, error: String((e && e.code) || e) })); c.on('close', (code) => res({ started: true, code, stdout: '' })); })", 'the old road');   // stale-pins: kept (the release's road — the leg's RED)
    const OLDS = require(M.write('src/server/cli-cmd.js', OLDSH, 'old-shell-road'));
    const S0 = directOf(SHN); await OLDS.askShell('vs-cli-x', { shell: SH10, env: env10, timeoutMs: 3000 });
    ok(directOf(SHN) - S0 === 1, '(c) RED: a copy on the old road starts the person\'s login shell from the hub\'s process (the spy counts it)', { direct: directOf(SHN) - S0 });
  } finally { WATCH.delete(SHN); answer = prev10; }
}
say('⑪ THE MOUNT AUTO-RECONNECT\'s OWN STARTS (B-323e\'s part 3 remainder, 主开发 r4379): the CephFS shim, mount and unmount, the rc socket\'s ask, the cache\'s witness and its old dir\'s removal ride the starter; a no-reply is worded by each');
WD.section('⑪');
{
  // FENCE (r4379): stand-in records only — no mount program run or copied, the real mount table never read (isMounted is the
  // record's own stub). The six programs join the spy's watch for this leg only: the red copy's direct starts are counted, never run.
  const prev11 = answer, NODE = path.basename(process.execPath), SIX = ['sh', 'sudo', 'rclone', NODE, 'rm'];
  const added11 = SIX.filter((n) => !WATCH.has(n)); for (const n of added11) WATCH.add(n);
  const net = require('node:net');
  const SOCK = path.join(TMP, 'rc11.sock'), srv = net.createServer(); await new Promise((r) => srv.listen(SOCK, r));   // a socket FILE for the rc ask's stat (a stand-in daemon's; nothing answers on it)
  const MP = path.join(TMP, 'mnt11', 'ceph'), CACHE = path.join(TMP, 'cache11');
  const turn = () => new Promise((r) => setTimeout(r, 0));
  const rec = { id: 'ceph11', cephMonHosts: 'mon1:6789', cephPath: '/vol', cephUser: 'u11', cephSecretEnc: 'x', cephFsName: 'fs11', mode: 'rw' };
  const mk = (mod, mounted) => {
    const m = Object.create(mod.MountManager.prototype);
    Object.assign(m, { dataDir: path.join(TMP, 'data'), _errors: new Map(), _notify: () => { }, _save: () => { }, _sayW: (id, code, o) => ({ code, ...(o || {}) }),
      _get: () => rec, pathOf: () => MP, isMounted: () => mounted.v, _ensureMountpointDir: async () => null, _noteStranded: () => { }, _dec: () => 'standin-secret',
      rcloneBin: () => path.join(TMP, 'bin11', 'rclone'), _rcSocketPick: () => ({ path: SOCK }), _cacheDirOf: () => path.join(CACHE, 'live') });
    return m;
  };
  const six = async (m, mounted) => {
    const out = {};
    await m._ensureModprobeShim();
    mounted.v = false; out.umount = await m._kernelUnmount(rec, MP, (gone) => gone);
    mounted.v = true; out.mount = await m._mountCephfs(rec.id); out.mountErr = m._errors.get(rec.id) || null;
    out.rc = await m._rcStats(rec);
    out.meta = await m._readCacheMeta(path.join(CACHE, 'meta'));
    const old = path.join(CACHE, 'old', rec.id); rec.cacheOld = old; m._dropCacheDir(rec, old);
    for (let i = 0; i < 5; i++) await turn();
    out.cacheOldKept = rec.cacheOld === old;
    return out;
  };
  const MM = require(path.join(ROOT, 'src/mounts.js'));
  // A — every one answered: the starter is asked each start, with the site's own argv, bound, buffer and env; nothing starts from here
  answer = (cmd, args) => (cmd === 'rclone' ? { started: true, code: 0, stdout: '{"ok":11}' } : cmd === NODE ? { started: true, code: 0, stdout: '{"exists":false}' } : { started: true, code: 0, stdout: '' });
  const A0 = asked.length, D0 = SIX.map(directOf);
  const stA = { v: false }, a = await six(mk(MM, stA), stA).catch((e) => ({ threw: String(e && e.message || e) }));
  const askedA = asked.slice(A0), directA = SIX.map(directOf).reduce((n, v, i) => n + v - D0[i], 0);
  const one = (cmd, pred) => askedA.filter((x) => x.cmd === cmd && pred(x));
  const shim = one('sh', (x) => x.args[0] === '-c' && /\/sbin\/modprobe/.test(x.args[1]) && x.o.timeoutMs === 10000);
  const um = one('sudo', (x) => x.args.join(' ') === `-n umount -l ${MP}` && x.o.timeoutMs === 10000 && x.o.termFirst === 2000);
  const mt = one('sudo', (x) => x.args.slice(0, 4).join(' ') === '-n mount -t ceph' && x.o.timeoutMs === 30000 && x.o.termFirst === 2000 && x.o.capture === true && x.o.maxBuffer === 1024 * 1024);
  const rcs = one('rclone', (x) => x.args[0] === 'rc' && x.args[2] === SOCK && !x.o.wholeEnv && !x.o.env && x.o.timeoutMs === 2000 && x.o.capture === true);
  const wit = one(NODE, (x) => x.args[0] === '-e' && x.o.timeoutMs === MM.MountManager.CACHE_WITNESS_MS && x.o.maxBuffer === 64 * 1024 && x.o.capture === true);
  const rmv = one('rm', (x) => x.args.join(' ') === `-rf --one-file-system -- ${path.join(CACHE, 'old', rec.id)}` && x.o.timeoutMs === MM.MountManager.CACHE_RM_MS);
  const pathAdd = [...shim, ...um, ...mt, ...rcs, ...rmv].every((x) => x.o.envAdd && typeof x.o.envAdd.PATH === 'string' && !x.o.wholeEnv);
  const termOnly = askedA.filter((x) => x.o.termFirst).every((x) => x.cmd === 'sudo');   // r4444: termFirst is the two sudo starts' alone
  ok(!a.threw && shim.length === 2 && um.length === 1 && mt.length === 1 && rcs.length === 2 && wit.length === 1 && rmv.length === 1 && pathAdd && termOnly && directA === 0,
    `the six starts asked of THE STARTER — the shim (by itself and at the mount), the umount and the ceph mount (each with termFirst 2000: SIGTERM first; the mount's buffer execFile's 1 MiB default), the rc ask ×2 (core/stats, vfs/queue: the service env and PATH, never the provider's sign-in values), the cache's witness, the old cache's removal — each with its bound; none from the hub's process (${directA} direct)`,
    { threw: a.threw, asked: askedA.map((x) => [x.cmd, x.args.slice(0, 3).join(' '), x.o.timeoutMs]), directA });
  ok(a.umount === true && a.mount === true && !a.mountErr && !!a.rc.stats && a.rc.stats.ok === 11 && !!a.meta && a.meta.exists === false && a.cacheOldKept === false,
    'each answer read as before: the unmount judged by the mount table, the mount done, the rc stats parsed, the witness read, the old cache dir forgotten once removed', a);
  // B — NO REPLY from the starter (unknown; and a bound passed for the rc ask): never «done», never a crash; each site words it
  answer = () => ({ unknown: true, why: 'no answer' });
  const stB = { v: false }, b = await six(mk(MM, stB), stB).catch((e) => ({ threw: String(e && e.message || e) }));
  const bm = mk(MM, { v: false }); const mountedNo = { v: false };
  bm.isMounted = () => mountedNo.v; const bNotMounted = await bm._mountCephfs(rec.id), bErr = bm._errors.get(rec.id) || null;
  answer = (cmd) => (cmd === 'rclone' ? { started: true, timedOut: true } : { started: true, code: 0, stdout: '' });
  const c = await mk(MM, { v: true })._rcStats(rec);
  ok(!b.threw && b.mount === true && bNotMounted === false && !!bErr && bErr.code === 'cephfs_failed' && /no answer from the starter/.test(bErr.detail)
    && /^core\/stats: no answer from the starter$/.test(String(b.rc.error)) && !!b.meta && b.meta.timedOut === true && b.cacheOldKept === true && /^core\/stats: no answer in 2000 ms$/.test(String(c.error)),
    `a NO-REPLY is no verdict: the ceph mount judged by the mount table alone (mounted ⇒ ${b.mount}; not mounted ⇒ cephfs_failed «${bErr && bErr.detail}»), the rc ask «${b.rc.error}» (past its bound «${c.error}»), the witness unread as past its bound (fail closed), the old cache dir kept and named (retried after the next mount)`, { b, bErr, c });
  // r4444 (a)–(d): what held only by reading, each a scene
  const scene = async (ans, mountedNow, fn) => { answer = ans; const st = { v: mountedNow }, m = mk(MM, st); return fn(m, st); };
  const tMount = await scene((c) => (c === 'sudo' ? { started: true, timedOut: true } : { started: true, code: 0, stdout: '' }), false, async (m) => ({ v: await m._mountCephfs(rec.id), e: m._errors.get(rec.id) || null }));
  const tMounted = await scene((c) => (c === 'sudo' ? { started: true, timedOut: true } : { started: true, code: 0, stdout: '' }), true, async (m) => ({ v: await m._mountCephfs(rec.id), e: m._errors.get(rec.id) || null }));
  const eMounted = await scene((c) => (c === 'sudo' ? { started: true, code: 1, stderr: 'mount error 5 = Input/output error' } : { started: true, code: 0, stdout: '' }), true, async (m) => ({ v: await m._mountCephfs(rec.id), e: m._errors.get(rec.id) || null }));
  const uStill = await scene(() => ({ unknown: true }), true, async (m) => m._kernelUnmount(rec, MP, (gone) => gone));
  const A2 = asked.length;
  const live = await scene(() => ({ started: true, code: 0 }), false, async (m) => { m._cacheDirOf = () => path.join(CACHE, 'live', rec.id); const d = m._cacheDirOf(rec); rec.cacheOld = d;   // the LIVE cache's own folder (its name the record's)
    m._dropCacheDir(rec, d); for (let i = 0; i < 3; i++) await turn(); return { kept: rec.cacheOld === d, asked: asked.slice(A2).filter((x) => x.cmd === 'rm').length }; });
  const wOver = await scene((c) => (c === NODE ? { started: true, overflow: true, code: null, stdout: '' } : { started: true, code: 0, stdout: '' }), false, async (m) => m._readCacheMeta(path.join(CACHE, 'meta')));
  ok(tMount.v === false && !!tMount.e && /^no answer in 30000 ms$/.test(String(tMount.e.detail)) && tMounted.v === true && eMounted.v === false && !!eMounted.e && /Input\/output error/.test(String(eMounted.e.detail)),
    `the ceph mount past its bound: not mounted ⇒ cephfs_failed «${tMount.e && tMount.e.detail}» (the starter DID answer); the table mounted ⇒ mounted; an ENDED failure with the table mounted ⇒ cephfs_failed, as the release`, { tMount, tMounted, eMounted });
  ok(uStill === false && live.asked === 0 && live.kept === true && !!wOver && wOver.timedOut === true,
    `the unmount's no-reply with the mount still in the table reads «still mounted» (${uStill}); the removal is never ASKED for the live cache's own folder (${live.asked} asked); a witness past its buffer reads as past its bound (the retry memo armed, as the release)`, { uStill, live, wOver });
  // RED — a MUTANT of the helper (the road the release took: each program started from the hub's own process by execFile)
  const SRC = read('src/mounts.js');
  const REL = require(M.write('src/mounts.js', anchored(SRC, "const viaStarter = (cmd, args, o) => Promise.resolve().then(() => require('./server/child-starter').childStarter().run(cmd, args, o)).catch((e) => ({ started: false, error: (e && e.message) || String(e) }));",
    "const viaStarter = (cmd, args, o) => new Promise((resolve) => execFile(cmd, args, { timeout: o.timeoutMs, maxBuffer: o.maxBuffer || 1024 * 1024, ...(o.wholeEnv ? { env: o.env } : {}) }, (err, stdout, stderr) => resolve(err ? { started: true, code: 1, stdout, stderr, error: err.message } : { started: true, code: 0, stdout, stderr })));   // MUTANT: the release's road, a direct start", 'mount-starts-direct'), 'mount-starts-direct'));
  answer = () => ({ started: true, code: 0, stdout: '' });
  const A1 = asked.length, D1 = SIX.map(directOf);
  const stR = { v: false }, r = await six(mk(REL, stR), stR).catch((e) => ({ threw: String(e && e.message || e) }));
  const askedR = asked.slice(A1).filter((x) => SIX.includes(x.cmd)).length, directR = SIX.map(directOf).reduce((n, v, i) => n + v - D1[i], 0);
  ok(directR === 8 && askedR === 0, `RED CONTROL (a mutant of the helper on the release's road): ${directR} starts from the hub's own process (the shim ×2, the umount, the mount, the rc ask ×2, the witness, the removal), ${askedR} asked of the starter`, { directR, askedR, threw: r && r.threw });
  answer = prev11; for (const n of added11) WATCH.delete(n);
  await new Promise((res) => srv.close(res));
}

say('⑪b THE END SIGNAL (line 1004\'s follow, 主开发 r4444): a start past its bound asked with termFirst is ended SIGTERM first, so a parent that relays it (as sudo does to a mount program) ends its child; RED: today\'s ending (SIGKILL) leaves that child running — on BOTH roads of the starter');
WD.section('⑪b');
{
  // FENCE (r4379): no real sudo, no mount — a stand-in PARENT (sh) that relays SIGTERM to its child (a sleep), as sudo relays it
  const PARENT = path.join(TMP, 'vs-standin-relay');
  fs.writeFileSync(PARENT, '#!/bin/sh\nsleep 30 &\nkid=$!\necho "$$ $kid" > "$1"\ntrap \'kill -TERM "$kid" 2>/dev/null; exit 143\' TERM\nwait "$kid"\n', { mode: 0o755 });
  const alive = (pid) => { if (!(pid > 1)) return false; try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; } try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return st.slice(st.lastIndexOf(')') + 2).split(' ')[0] !== 'Z'; } catch { return false; } };
  const waitFor = async (what, pred, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await new Promise((r) => setTimeout(r, 15)); } throw new Error(`⑪b HARNESS: ${what} — not seen in ${ms} ms`); };   // r4340 law 1: on the fact, a named expiry
  const pidsOf = (f) => { try { const [p, k] = fs.readFileSync(f, 'utf8').trim().split(/\s+/).map(Number); return { parent: p || 0, kid: k || 0 }; } catch { return { parent: 0, kid: 0 }; } };
  const realStarter = CS.createChildStarter({ log: { warn: () => { } } });
  const SILENT11 = path.join(TMP, 'silent-starter11.js'); fs.writeFileSync(SILENT11, 'process.stdin.resume();\n');
  const directStarter = CS.createChildStarter({ script: SILENT11, guardMs: 30, log: { warn: () => { } } });
  await directStarter.run('true', [], { timeoutMs: 20 }); await directStarter.run('true', [], { timeoutMs: 20 });   // two faults: the old road (the starter's own law)
  const onDirect = !!directStarter.stats().direct;
  const roads = [], strays = [];
  for (const [road, S] of [['the starter', realStarter], ['the direct road', directStarter]]) {
    for (const term of [150, 0]) {
      const pf = path.join(TMP, `relay-${roads.length}.pids`);
      const r = await S.run(PARENT, [pf], { timeoutMs: 150, ...(term ? { termFirst: term } : {}) });
      let p = { parent: 0, kid: 0 }, ended = null, stillRuns = null, harness = null;
      try {
        await waitFor(`${road}: the stand-in's pids`, () => (p = pidsOf(pf)).kid > 0, 5000);
        if (term) ended = await waitFor(`${road}: the child ended after the relayed SIGTERM`, () => !alive(p.kid), 10000);
        else { await waitFor(`${road}: the parent gone (SIGKILL)`, () => !alive(p.parent), 10000); stillRuns = alive(p.kid); }
      } catch (e) { harness = String(e && e.message || e); }
      if (alive(p.kid)) strays.push(p.kid);
      roads.push({ road, term, timedOut: !!(r && r.timedOut), signal: r && r.signal, ended, stillRuns, harness });
    }
  }
  for (const k of strays) { try { process.kill(k, 'SIGKILL'); } catch { } }   // the red's orphans, ended by this suite
  try { realStarter.closePipe(); } catch { } try { directStarter.closePipe(); } catch { }
  const withT = roads.filter((x) => x.term), without = roads.filter((x) => !x.term);
  ok(onDirect && withT.length === 2 && withT.every((x) => x.timedOut && x.signal === 'SIGTERM' && x.ended === true && !x.harness),
    `with termFirst, on the starter AND on the direct road: «timed out» at the bound, signal SIGTERM, and the relaying parent's CHILD is ended (${JSON.stringify(withT)})`, { onDirect, roads });
  ok(without.length === 2 && without.every((x) => x.timedOut && x.stillRuns === true && !x.harness),
    `RED CONTROL (today's ending, SIGKILL at the bound, on both roads): the parent is gone and its child STILL RUNS — a root mount left behind (${JSON.stringify(without)})`, { roads });
}

say('⑫ B-323e\'S REMAINDER (lane nl-starts) — the mount-health canary\'s scan of who presses a wedged mount rides the starter; a table it could not read is said, in the journal and in the item');
WD.section('⑫');
{
  const nodeName = path.basename(process.execPath); WATCH.add(nodeName);   // for this section: a scan child started DIRECTLY is counted, never run
  const prev11 = answer;
  try {
    const MHW_FILE = path.join(ROOT, 'src/server/mount-health-watch.js'), MHW_SRC = read('src/server/mount-health-watch.js');
    const MHW = require(MHW_FILE);
    const mp = '/srv/vs-wedged-11', UNREAD = 'Who has files open there could not be read.', NONE = 'No process has a file open there.';
    const table = [{ pid: 4242, ppid: 1, comm: 'rsync', argv: ['rsync', '-a', mp + '/a', '/backup'], cwd: mp + '/a', fdHits: 3 }];
    // a held-loop item (onHeld) — the For-you item recorded, the journal's lines kept
    const hold = async (mod) => { const lines = [], items = []; const todos = { add: (key, o) => { items.push(o); return { id: 'i' + items.length }; }, get: () => null, setStatus: () => { } };
      await mod.create({ file: mp + '/package.json', mountpoint: mp, getUserTodos: () => todos, ownerIds: async () => ({}), log: { warn: (l) => lines.push(String(l)) }, mountinfo: () => '' })
        .onHeld({ fn: 'statSync', path: mp + '/a', ms: 6000, caller: 'x.js:1', stack: '', mount: { root: mp, kind: 'fuse' } });
      return { lines, detail: items.length ? String(items[0].detail) : '', rows: items.length ? JSON.stringify(items[0].i18n) : '' }; };
    answer = (cmd, args, o) => (cmd === nodeName ? { started: true, code: 0, stdout: JSON.stringify(table) } : prev11(cmd, args, o));
    const A0 = asked.length, D0 = directOf(nodeName);
    const got = await hold(MHW);
    const q = asked.slice(A0).filter((a) => a.cmd === nodeName);
    ok(q.length === 1 && directOf(nodeName) === D0, `a held-loop item's scan of who presses the mount is ASKED of the starter (${q.length}) — nothing started from the hub's process (${directOf(nodeName) - D0})`, q.map((x) => x.args));
    ok(q.length === 1 && q[0].args.join(' ') === `${MHW_FILE} --suspects ${mp}` && q[0].o.timeoutMs === MHW.SCAN_TIMEOUT_MS && MHW.SCAN_TIMEOUT_MS === 15000 && q[0].o.maxBuffer === 64 * 1024 * 1024 && q[0].o.capture === true && JSON.stringify(q[0].o.envAdd) === '{}' && !q[0].o.wholeEnv,
      'THE PROGRAM, ARGV, BOUND AND BUFFER it hands: node <its own file> --suspects <mount>, 15 s, 64 MiB (as its execFile), the service env alone', q[0] && q[0].o);
    ok(got.lines.some((l) => l.includes(`${mp} held the main loop 6 s (statSync ← x.js:1)`) && l.includes('1 process groups press it')) && !got.lines.some((l) => l.includes('not read')) && got.detail.includes('rsync') && !got.detail.includes(NONE) && !got.detail.includes(UNREAD),
      'its answer is the table: one process group presses the mount, the item names it', got);
    for (const [a, word] of [[{ unknown: true }, 'the starter gave no answer'], [{ started: true, timedOut: true, code: null }, 'no answer in 15000 ms'], [{ started: true, code: 1, stdout: '' }, 'exit 1'], [{ started: true, code: null, signal: 'SIGSEGV', stdout: '' }, 'ended by SIGSEGV'], [{ started: true, code: null, signal: null, error: 'EPERM', stdout: '' }, 'ended with no exit code (EPERM)'],
      [{ started: false, code: null, error: 'ENOENT' }, 'not started (ENOENT)'], [{ started: true, overflow: true, code: null }, `the table passed ${64 * 1024 * 1024} bytes`], [{ started: true, code: 0, stdout: 'not a table' }, 'Unexpected token']]) {
      answer = (cmd, args, o) => (cmd === nodeName ? a : prev11(cmd, args, o));
      const g2 = await hold(MHW);
      ok(g2.lines.some((l) => l.startsWith(`[mount-health] who presses ${mp}: not read — `) && l.includes(word)) && g2.lines.some((l) => l.includes('who presses it not read'))
        && g2.detail.includes(UNREAD) && !g2.detail.includes(NONE) && g2.rows.includes(JSON.stringify(UNREAD)),
        `a table not read is SAID — the journal «not read — ${word}», the item «${UNREAD}» (its words a key of the dictionaries), never «${NONE}»`, g2);
    }
    const MH = require(path.join(ROOT, 'src/mount-health.js'));
    ok(MH.canaryItem({ mountpoint: mp, strikes: 2, latencyMs: 5000, suspects: null }).detail.includes(UNREAD) && MH.canaryItem({ mountpoint: mp, strikes: 2, latencyMs: 5000, suspects: [] }).detail.includes(NONE)
      && read('src/lib/i18n-zh.js').includes(`  ${JSON.stringify(UNREAD)}: `) && read('src/lib/i18n-ja.js').includes(`  ${JSON.stringify(UNREAD)}: `),
      'the episode\'s item says the same (not read ≠ nobody), and both dictionaries carry the words');
    const KEEPS = require(M.write('src/server/mount-health-watch.js', anchored(MHW_SRC, "catch (x) { suspects = null; log.warn?.(", "catch (x) { log.warn?.(", 'mh-unread-as-none'), 'mh-unread-as-none'));
    answer = (cmd, args, o) => (cmd === nodeName ? { unknown: true } : prev11(cmd, args, o));
    const r11 = await hold(KEEPS);
    ok(r11.detail.includes(NONE) && !r11.detail.includes(UNREAD), `RED: a copy whose catch keeps the empty table — the item tells the person «${NONE}» for a table nobody read`, r11.detail);
    // the EPISODE's road (the canary's second strike opens it — open()): its item says the same; RED a copy whose open() keeps the empty table
    const episode = async (mod) => { const items = []; const todos = { add: (key, o) => { items.push(o); return { id: 'e' + items.length }; }, get: () => null, setStatus: () => { } };
      const w = mod.create({ file: mp + '/package.json', mountpoint: mp, getUserTodos: () => todos, ownerIds: async () => ({}), log: { warn: () => { } }, mountinfo: () => '' });
      w.onProbe({ strike: true, at: 1000, ms: 5000 }); w.onProbe({ strike: true, at: 2000, ms: 5000 }); await w.settled(); return items.length ? String(items[0].detail) : ''; };
    const e11 = await episode(MHW);
    const KEEPS_E = require(M.write('src/server/mount-health-watch.js', anchored(MHW_SRC, "catch (e) { suspects = null; log.warn?.(", "catch (e) { log.warn?.(", 'mh-episode-unread-as-none'), 'mh-episode-unread-as-none'));
    const e11r = await episode(KEEPS_E);
    ok(e11.includes(UNREAD) && !e11.includes(NONE) && e11r.includes(NONE) && !e11r.includes(UNREAD), `the EPISODE's item (two strikes open it) says «${UNREAD}» for a table not read — RED a copy whose open() keeps the empty table says «${NONE}»`, { e11, e11r });
    answer = (cmd, args, o) => (cmd === nodeName ? { started: true, code: 0, stdout: JSON.stringify(table) } : prev11(cmd, args, o));
    const OLD11 = require(M.write('src/server/mount-health-watch.js', anchored(MHW_SRC,
      "  return Promise.resolve().then(() => require('./child-starter').childStarter().run(process.execPath, [__filename, '--suspects', mountpoint], { timeoutMs: SCAN_TIMEOUT_MS, maxBuffer: SCAN_MAX_BUFFER, capture: true, envAdd: {} })).then((r) => {",
      "  return new Promise((res) => require('child_process').execFile(process.execPath, [__filename, '--suspects', mountpoint], { timeout: SCAN_TIMEOUT_MS, maxBuffer: SCAN_MAX_BUFFER }, (err, out) => res(err ? { started: true, code: 1 } : { started: true, code: 0, stdout: String(out) }))).then((r) => {",
      'mh-scan-old-road'), 'mh-scan-old-road'));
    const A1 = asked.length, D1 = directOf(nodeName);
    await hold(OLD11);
    ok(directOf(nodeName) - D1 === 1 && !asked.slice(A1).some((x) => x.cmd === nodeName), `RED: a copy on the release's road (execFile from the hub's process) — ${directOf(nodeName) - D1} direct start, nothing asked of the starter`);
  } finally { WATCH.delete(nodeName); answer = prev11; }
}
for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 16, label: 'B-323e starts ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
