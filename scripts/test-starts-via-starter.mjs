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
//   ⑤ the lookup (which-kept): through the starter, kept; an aborted ask stops waiting and records nothing (RED: the old road)
//      + the proxy plugin's runner reads the starter (census; RED: the release's text)
//   ⑥ the certificate pass's runner (its answer table) and its default; the display's lookup asynchronous through the starter
//      (RED: the release's synchronous lookup); the keeper's version ask (census; RED: the release's text)
//   ⑦ a FAILED copy of the rclone binary is remembered — never redone at every rcloneBin() (RED: a copy without the line)
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

say('① THE JOBS LIST\'S TWO READS — through the starter, ONE answer for every page and render for 30 s');
WD.section('①');
{
  const JW_SRC = read('src/server/jobs-wiring.js');
  answer = (cmd) => (cmd === 'systemctl' ? { started: true, code: 0, stdout: 'backup.timer loaded active waiting x\nvibespace.service loaded active running y\n' } : { started: true, code: 0, stdout: '# mine\n0 3 * * * /usr/local/bin/nightly\n' });
  const drive = async (JWmod) => {
    let T = 1e6; const before = asked.length;
    const r = JWmod.escapesReader({ now: () => T });
    const burst = await Promise.all(Array.from({ length: 20 }, () => r()));   // twenty renders at once (a broadcast to twenty pages)
    T += 10e3; for (let i = 0; i < 20; i++) await r();                        // twenty more within the 30 s
    T += 31e3; const after = await r();                                       // past it: one fresh read
    return { first: burst[0], same: burst.every((x) => x === burst[0]), after, starts: asked.slice(before).length };
  };
  const JW = require(path.join(ROOT, 'src/server/jobs-wiring.js'));
  const mine = await drive(JW);
  ok(mine.starts === 4 && mine.same && JSON.stringify(mine.first) === JSON.stringify({ systemd: ['backup.timer'], crontab: ['0 3 * * * /usr/local/bin/nightly'] }) && directOf('systemctl') + directOf('crontab') === 0,
    `41 renders over 41 s (twenty at once, twenty within 30 s, one past it): ${mine.starts} starts asked of the starter (two reads twice), the same answer for every one, NONE from the hub's process`, mine);
  const NOCACHE = require(M.write('src/server/jobs-wiring.js', anchored(JW_SRC, '    if (last && (last.at === 0 || now() - last.at < freshMs)) return last.p;\n', '', 'no-cache'), 'no-cache'));
  const red = await drive(NOCACHE);
  ok(red.starts === 82, `RED: a copy with no cache — ${red.starts} starts for the same 41 renders (two a render)`, red);
  const OLD = require(M.write('src/server/jobs-wiring.js', anchored(JW_SRC, "    const run = via || require('./child-starter').execFileVia(require('./child-starter').childStarter());\n",
    "    const run = via || ((bin, args, o) => new Promise((res) => require('child_process').execFile(bin, args, { timeout: o.timeout }, (err, stdout) => res({ err, stdout: String(stdout || '') }))));   // MUTANT: the old road\n", 'old-road'), 'old-road'));
  const d0 = direct.length; await OLD.escapesReader()();
  ok(direct.length - d0 === 2 && directOf('systemctl') === 1 && directOf('crontab') === 1, 'RED: a copy on the old road starts both from the hub\'s process (the spy counts them)', direct.slice(d0));
}

say('② THE MULTIPLEXER\'S PANE LIST — the main thread asks the starter; the sweep\'s worker is handed it and starts nothing');
WD.section('②');
{
  const BIN = path.join(TMP, 'bin'); fs.mkdirSync(BIN); fs.writeFileSync(path.join(BIN, 'tmux'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  process.env.PATH = BIN + path.delimiter + process.env.PATH;   // a tmux on PATH (the owner's hub has one): never run — the starter is fake
  answer = (cmd) => (cmd === 'tmux' ? { started: true, code: 0, stdout: '4242||work:1.0\n' } : { started: true, code: 0, stdout: '' });
  const SS = require(path.join(ROOT, 'src/session-store.js'));
  const a0 = askedOf('tmux').length;
  const map = await SS.getTmuxPaneMapAsync(); const again = await SS.getTmuxPaneMapAsync();
  const req = askedOf('tmux')[a0];
  ok(map.get(4242) === 'work:1.0' && again === map && askedOf('tmux').length - a0 === 1 && directOf('tmux') === 0 && !!req && req.o.envAdd && req.o.envAdd.PATH === process.env.PATH,
    'the main thread: ONE `tmux list-panes` asked of the starter (with the PATH the site had), memoised, none from the hub\'s process', { asked: askedOf('tmux').length - a0, direct: directOf('tmux') });
  const SS_SRC = read('src/session-store.js');
  const NEW_A = SS_SRC.indexOf("  const r = await Promise.resolve().then(() => require('./server/child-starter').childStarter().run('tmux', ");
  const NEW_B = SS_SRC.indexOf('\n', SS_SRC.indexOf('  const out = r && !r.unknown && !r.timedOut && !r.overflow && r.code === 0', NEW_A)) + 1;
  const RELEASE = "  const out = await execFileP('tmux', ['list-panes', '-a', '-F', '#{pane_pid}||#{session_name}:#{window_index}.#{pane_index}'], { timeout: 3000 });\n";   // stale-pins: kept (the release's text — the leg's RED)
  let rel = NEW_A > 0 && NEW_B > NEW_A ? SS_SRC.slice(0, NEW_A) + RELEASE + SS_SRC.slice(NEW_B) : null;
  rel = rel && anchored(rel, "  if (!require('worker_threads').isMainThread) return _handedPanes || new Map();   // B-323e: a worker never starts it\n", '', 'release-worker');
  const RELP = rel ? M.write('src/session-store.js', rel, 'release-tmux') : null;
  const inWorker = (file) => new Promise((resolve) => {
    const code = `const { parentPort, workerData } = require('worker_threads'); const cp = require('child_process'); const path = require('path'); let n = 0;
      for (const fn of ['execFile', 'spawn']) { const o = cp[fn]; cp[fn] = function (c, ...r) { if (path.basename(String(c)) === 'tmux') { n++; const cb = r.find((x) => typeof x === 'function'); setImmediate(() => cb && cb(new Error('spy'), '', '')); return { on() { }, stdin: null, kill() { } }; } return o.apply(this, [c, ...r]); }; }
      const SS = require(workerData.file); if (SS.setTmuxPanes) SS.setTmuxPanes([[7, 'handed:0.0']]);
      SS.getTmuxPaneMapAsync().then((m) => parentPort.postMessage({ n, v: m.get(7) || null }), (e) => parentPort.postMessage({ n, error: e.message }));`;
    const w = new Worker(code, { eval: true, workerData: { file } });
    w.once('message', (m) => { resolve(m); w.terminate(); }); w.once('error', (e) => resolve({ error: e.message }));
  });
  const wMine = await inWorker(path.join(ROOT, 'src/session-store.js'));
  ok(wMine.n === 0 && wMine.v === 'handed:0.0', 'the sweep\'s WORKER: the map the main thread handed (setTmuxPanes), NO start of its own', wMine);
  const wRel = RELP ? await inWorker(RELP) : { error: 'the release text did not anchor' };
  ok(wRel.n >= 1, 'RED: the release\'s text in a copy, in a worker — it starts `tmux` from the worker (a fork of the hub)', wRel);
  const route = read('src/routes/sessions.js'), sweep = read('src/sessions-sweep.js');
  ok(route.includes("tmux: [...(await require('../session-store').getTmuxPaneMapAsync())] }") && sweep.includes("require('./session-store').setTmuxPanes(facts.tmux);"), 'the hand-in: the sweep\'s facts carry the main thread\'s map (src/routes/sessions.js), the worker sets it (src/sessions-sweep.js)');
}

say('③ THE MEMORY WATCH\'S `ps` — the 5-min scan asks the starter');
WD.section('③');
{
  answer = (cmd) => (cmd === 'ps' ? { started: true, code: 0, stdout: '  1     0  4096 systemd /sbin/init\n 77     1  8192 chrome chrome --remote-debugging-port=9333\n' } : { started: true, code: 0, stdout: '' });
  const make = (mod) => mod.create({ activeSessions: new Map(), BUFFERS_DIR: TMP, getUserTodos: () => null, getSessionStatus: () => null, sessionStatusKey: () => 'k', log: { warn() { }, log() { } } });
  const W0 = askedOf('ps').length, D0 = directOf('ps');
  const w = make(require(path.join(ROOT, 'src/server/memory-pressure-watch.js'))); await w.scanOwnChrome().catch(() => 0); w.stop();
  const req = askedOf('ps')[W0];
  ok(askedOf('ps').length - W0 === 1 && directOf('ps') === D0 && !!req && req.args[0] === 'axo' && req.o.maxBuffer === 64 * 1024 * 1024, 'the scan\'s `ps axo pid,ppid,rss,comm,args` asked of the starter (its 64 MB bound kept), none from the hub\'s process', req);
  const SRC = read('src/server/memory-pressure-watch.js');
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
  answer = (cmd, args) => (cmd === path.basename(STANDIN) && args[0] === '--version' ? { started: true, code: 0, stdout: '2.1.999 (Claude Code)\n' } : { started: true, code: 0, stdout: '' });
  const MP = require(path.join(ROOT, 'src/machine-probes.js'));
  MP.useStarter(CS.execFileVia(CS.childStarter()));
  const A0 = askedOf(path.basename(STANDIN)).length, D0 = directOf(path.basename(STANDIN));
  const v = await MP.cliVersion(STANDIN);
  ok(v === '2.1.999 (Claude Code)' && askedOf(path.basename(STANDIN)).length - A0 === 1 && directOf(path.basename(STANDIN)) === D0, `cliVersion (the 15-min tick's, backend-status' read): «${v}» from ONE --version asked of the starter, none from the hub's process`, { v });
  const SRC = read('src/machine-probes.js');
  const REL = require(M.write('src/machine-probes.js', anchored(SRC, "const execVersion = (p) => (versionVia ? versionVia(p, ['--version'], { timeout: 5000 }).then((r) => (r && !r.err ? String(r.stdout || '') : null), () => null) : exec(p, ['--version']));\n",
    "const execVersion = (p) => exec(p, ['--version']);   // MUTANT: the release\n", 'release'), 'release'));
  REL.useStarter(CS.execFileVia(CS.childStarter())); await REL.cliVersion(STANDIN);
  ok(directOf(path.basename(STANDIN)) - D0 === 1, 'RED: a copy that ignores the hand-off starts the --version from the hub\'s process', { direct: directOf(path.basename(STANDIN)) - D0 });
  ok(read('server.js').includes("const machineProbes = require('./src/machine-probes'); machineProbes.useStarter(require('./src/server/child-starter').execFileVia(require('./src/server/child-starter').childStarter()));"), 'the hub hands it at the module\'s require (server.js) — the device agent never does');
}

say('⑤ THE LOOKUP — through the starter, kept; an aborted ask stops waiting and records nothing');
WD.section('⑤');
{
  answer = (cmd, args) => (cmd === 'which' && args[0] === 'vs-slow-cmd' ? Object.assign(new Promise((r) => setTimeout(() => r({ started: true, code: 0, stdout: '/x/vs-slow-cmd\n' }), 400)), {}) : cmd === 'which' ? { started: true, code: 0, stdout: `/usr/bin/${args[0]}\n` } : { started: true, code: 0, stdout: '' });
  const WK = require(path.join(ROOT, 'src/plugins/which-kept.js'));
  const D0 = directOf('which'), A0 = askedOf('which').length;
  const got = await WK.whichNow('vs-cmd-a');
  const req = askedOf('which')[A0];
  ok(got === '/usr/bin/vs-cmd-a' && WK.whichKnown('vs-cmd-a') === true && directOf('which') === D0 && req.o.envAdd.PATH === process.env.PATH, 'a lookup asked of the starter (the PATH the site had), its answer kept; none from the hub\'s process', { got, req: req && req.o });
  const ac = new AbortController(); const t0 = Date.now(); const p = WK.whichNow('vs-slow-cmd', { signal: ac.signal }); setTimeout(() => ac.abort(new Error('abandoned')), 30);
  const slow = await p; const ms = Date.now() - t0;
  ok(slow === null && ms < 300 && !WK.whichKnown('vs-slow-cmd'), `an aborted ask stops waiting at once (${ms} ms) and records nothing — its child ends at the starter's own bound`, { slow, ms });
  const SRC = read('src/plugins/which-kept.js');
  const OLD = require(M.write('src/plugins/which-kept.js', anchored(SRC, "let runWhich = (name) => require('../server/child-starter').childStarter().run('which', [name], { timeoutMs: TIMEOUT_MS, capture: true, maxBuffer: 64 * 1024, envAdd: { PATH: process.env.PATH || '' } });\n",
    "let runWhich = (name) => new Promise((res) => require('child_process').execFile('which', [name], { timeout: TIMEOUT_MS }, (err, out) => res({ started: true, code: err ? 1 : 0, stdout: String(out || '') })));   // MUTANT: the old road\n", 'old-road'), 'old-road'));
  await OLD.whichNow('vs-cmd-b');
  ok(directOf('which') - D0 === 1, 'RED: a copy on the old road starts `which` from the hub\'s process', { direct: directOf('which') - D0 });
  const TS = read('src/plugins/tailscale.js');
  const tsRuns = (src) => src.includes("Promise.resolve().then(() => require('../server/child-starter').childStarter().run(prog, args, { timeoutMs: ms,") && !src.includes('c = execFile(prog, args,');   // stale-pins: kept (the release's text — the leg's RED)
  ok(tsRuns(TS) && !tsRuns(TS.replace("Promise.resolve().then(() => require('../server/child-starter').childStarter().run(prog, args, { timeoutMs: ms,", "c = execFile(prog, args, { timeout: ms,")), 'the proxy plugin\'s runner (pgrep, sudo -n true, its status) asks the starter — RED: the release\'s execFile in its text is named');
}

say('⑥ THE CERTIFICATE PASS, THE DISPLAY\'S LOOKUP, THE KEEPER\'S VERSION ASK');
WD.section('⑥');
{
  const TLS = require(path.join(ROOT, 'src/server/tls.js'));
  const table = [];
  for (const [a, want] of [[{ started: true, code: 0, stdout: '{"Self":1}' }, 0], [{ started: true, code: 2, stdout: '' }, 2], [{ started: true, timedOut: true, code: null }, 'TIMEOUT'], [{ unknown: true }, 'TIMEOUT'], [{ started: false, error: 'ENOENT' }, 'ENOENT']]) {
    answer = () => a; const r = await TLS.runViaStarter('tailscale', ['status', '--json'], 5000); table.push([r.code, want]);
  }
  ok(table.every(([g, w]) => g === w), 'runViaStarter answers runChild\'s table: an exit code, TIMEOUT (its bound or the starter\'s «no answer»), ENOENT', table);
  const TLS_SRC = read('src/server/tls.js');
  const dflt = (src) => src.includes('tailscaleBin: binArg, run = runViaStarter, now = () => Date.now(),');
  ok(dflt(TLS_SRC) && !dflt(TLS_SRC.replace('run = runViaStarter, now', 'run = runChild, now')), 'the pass\'s default runner is the starter\'s (its hourly status, its cert) — RED: the release\'s runChild default is named');   // stale-pins: kept (the release's text — the leg's RED)
  answer = (cmd) => (cmd === 'which' ? { started: true, code: 1, stdout: '' } : { started: true, code: 0, stdout: '' });
  const V = require(path.join(ROOT, 'src/vnc.js'));
  const D0 = direct.length, A0 = askedOf('which').length;
  const st = await new V.VncManager({ dataDir: TMP, port: 1, display: ':97' }).status();
  const names = askedOf('which').slice(A0).map((x) => x.args[0]);
  ok(st.available === false && names.includes('Xtigervnc') && names.includes('Xvnc') && direct.length === D0, 'the Desktop\'s status on a box with no Xvnc: two lookups asked of the starter, NO synchronous child', { st, names });
  const VSRC = read('src/vnc.js');
  const REL = require(M.write('src/vnc.js', anchored(VSRC, "const which = (cmd) => require('./plugins/which-kept.js').whichFresh(cmd);",
    "const which = (cmd) => { try { return require('child_process').execFileSync('which', [cmd], { timeout: 2000 }).toString().trim() || null; } catch { return null; } };   // MUTANT: the release's synchronous lookup", 'release'), 'release'));
  await new REL.VncManager({ dataDir: TMP, port: 1, display: ':98' }).status();
  ok(direct.slice(D0).filter((d) => d.fn === 'execFileSync' && d.cmd === 'which').length === 2, 'RED: the release\'s lookup — two SYNCHRONOUS `which` from the hub\'s process', direct.slice(D0));
  const BK = read('src/server/browser-keeper.js');
  const kv = (src) => src.includes(".childStarter().run(p, ['--version'], { timeoutMs: 8000,") && !src.includes("execFile(p, ['--version'],");   // stale-pins: kept (the release's text — the leg's RED)
  ok(kv(BK) && !kv(BK.replace(".childStarter().run(p, ['--version'], { timeoutMs: 8000,", "x; execFile(p, ['--version'], { timeout: 8000,")), 'the keeper\'s version ask rides the starter — RED: the release\'s execFile in its text is named');
}

say('⑦ A FAILED COPY OF THE RCLONE BINARY IS REMEMBERED');
WD.section('⑦');
{
  const homeWas = process.env.HOME; process.env.HOME = TMP;
  const bin = path.join(TMP, 'data', 'bin', 'rclone'); fs.mkdirSync(path.dirname(bin), { recursive: true }); fs.writeFileSync(bin, 'x');
  const fresh = (mod) => { const m = Object.create(mod.MountManager.prototype); m.dataDir = path.join(TMP, 'data'); m._onNetworkFs = () => true; return m; };
  const turn = () => new Promise((r) => setImmediate(r));
  const MM = require(path.join(ROOT, 'src/mounts.js'));
  const D0 = directOf('sh');
  const m = fresh(MM); m._fastBin(bin); await turn(); await turn(); m._fastBin(bin); m._fastBin(bin); await turn();
  const mine = directOf('sh') - D0;
  const SRC = read('src/mounts.js');
  const REL = require(M.write('src/mounts.js', anchored(SRC, "          if (err) this._fastBinMemo = { src: binPath, use: binPath };   // B-323e: a FAILED copy is remembered (the network path stands) — never redone at every rcloneBin() (each list of the mounts)\n", '', 'release'), 'release'));
  const r = fresh(REL); r._fastBin(bin); await turn(); await turn(); r._fastBin(bin); r._fastBin(bin); await turn();
  const rel = directOf('sh') - D0 - mine;
  process.env.HOME = homeWas;
  ok(mine === 1 && rel === 3, `three asks after a failed copy: ${mine} copy started (the failure remembered, the network path stands) — RED: the release starts ${rel}`, { mine, rel });
}
for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 8, label: 'B-323e starts ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
