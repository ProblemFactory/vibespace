#!/usr/bin/env node
// LANE REMOTE-PROFILE-START (design 014 lane 3b, part 1) — a browser profile that lives on a PAIRED machine: the owner
// starts it from cold (the restart route's ONE door), browses it himself (the live view's own tab over the hub forward),
// deletes it WITH its folder there (the machine's own `remove` op, bounded to ~/.agent-browser/vs-bp-<id>), and a machine
// with no browser to run is said BY NAME with the one command for ITS platform. Never a real machine: FAKE DAEMONS with
// platform win32 / darwin / linux run the REAL browser-serve op table (src/browser-serve.js) behind the REAL agent client's
// capability gate (DeviceManager.prototype.browserServe) and the REAL access layer, keeper and routes. Each fix has a
// patched-copy CONTROL that turns its leg red (the copy's relative requires re-pointed at this tree).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const S = require('../src/browser-serve.js');
const A = require('../src/server/browser-access.js');
const K = require('../src/server/browser-keeper.js');
const B = require('../src/browser-profiles.js');
const HM = require('../src/browser-human.js');
const LIMITS = require('../src/keeper-limits.js');
const { DeviceManager } = require('../src/agentd/client.js');
const M = await import('../src/lib/browser-new-profile-model.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const ROOT = scratch('rps');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const CLI_LOG = path.join(ROOT, 'hub-cli.log');
const servers = new Set();
process.on('exit', () => { for (const s of servers) { try { s.close(); } catch { /* gone */ } } fs.rmSync(ROOT, { recursive: true, force: true }); });
// a patched COPY of a src module: its relative requires re-pointed at this tree's src/ (the control's only difference = the patch)
function mutant(rel, from, to) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  if (!src.includes(from)) throw new Error(`mutant ${rel}: anchor missing ${from.slice(0, 80)}`);
  const dir = path.dirname(path.join(REPO, rel));
  const body = src.replace(from, to).replace(/require\('(\.{1,2}\/[^']+)'\)/g, (m, f) => `require(${JSON.stringify(path.resolve(dir, f))})`)
    .replace(/require\('([^.'][^']*)'\)/g, (m, f) => { try { const r = require.resolve(f, { paths: [dir] }); return r.startsWith('/') ? `require(${JSON.stringify(r)})` : m; } catch { return m; } }); // a bare package (express) from this tree's node_modules
  const out = path.join(ROOT, 'mut-' + path.basename(rel, '.js') + '-' + Math.random().toString(16).slice(2, 8) + '.js');
  fs.writeFileSync(out, body);
  return require(out);
}

// ── the hub's own CLI (the user's tab over the forward): a fake agent-browser that answers and logs ──
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs');
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
fs.appendFileSync(${JSON.stringify(CLI_LOG)}, JSON.stringify({ argv, cdp: process.env.AGENT_BROWSER_CDP || null, session: process.env.AGENT_BROWSER_SESSION || null }) + '\\n');
if (argv[0] === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (argv[0] === 'session' && argv[1] === 'info') { console.log(JSON.stringify({ success: true, data: { active: false, pid: null } })); process.exit(0); }
if (argv[0] === 'tab' && argv[1] === 'new') { console.log(JSON.stringify({ success: true, data: { tabId: 't2', targetId: 'ABCDEF0123456789ABCDEF0123456789' } })); process.exit(0); }
console.log(JSON.stringify({ success: true, data: {} })); process.exit(0);
`, { mode: 0o755 });
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
process.env.PATH = PATH_ENV; process.env.HOME = HOME;
const hubCli = () => { try { return fs.readFileSync(CLI_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

// ── a CDP endpoint the machines' browsers "serve" on their loopback (the hub reaches it only through the forward) ──
const cdp = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/141.0.7390.54', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/x' })); });
servers.add(cdp);
const CDP_PORT = await new Promise((r) => cdp.listen(0, '127.0.0.1', () => r(cdp.address().port)));

// ── the FAKE MACHINES: the real op table over a runtime that launches nothing, a platform, an env and file facts ──
function machine(name, { platform = 'linux', env = {}, files = [], dirs = {}, cli = '/usr/local/bin/agent-browser', noChrome = false } = {}) {
  const home = path.join(ROOT, 'm-' + name); fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true });
  const st = { running: new Map(), launches: [], noChrome };
  // the name the fake machine REPORTS for its CLI — never run: `runtime` is injected (test-ci-gate's tier rule reads a quoted `cmd:` as a real program)
  const FAKE_CLI_NAME = 'agent-browser';
  const fset = new Set(files);
  const runtime = {
    launch: async (ns) => { st.launches.push(ns); if (st.noChrome) return { ok: false, stderr: '✗ No Chrome binary found. Run `agent-browser install` to download Chrome from Chrome for Testing.' }; st.running.set(ns, true); return { ok: true }; },
    info: async (ns) => ({ active: !!st.running.get(ns), pid: st.running.get(ns) ? 4194301 : null, socketDir: null, version: '0.38.1' }),
    cdpUrl: async (ns) => (st.running.get(ns) ? { ok: true, url: `ws://127.0.0.1:${CDP_PORT}/devtools/browser/x` } : { ok: false, raw: { error: 'not running' } }),
    closeAll: async (ns) => { st.running.delete(ns); return { ok: true }; },
  };
  const fsx = { exists: (p) => fset.has(p) || (() => { try { return fs.statSync(p).isFile(); } catch { return false; } })(), list: (d) => (dirs[d] ? dirs[d] : (() => { try { return fs.readdirSync(d); } catch { return null; } })()) };
  const bs = { facts: { probeVersion: async () => (cli ? '0.38.1' : null), binPath: () => cli }, runtime, homeDir: home, cmd: FAKE_CLI_NAME, displayProbe: async () => { throw new Error('the fake machine probes no display'); }, platform, env, fsx };
  return { name, home, st, bs };
}
const WIN_ENV = { Path: 'C:\\Windows\\system32;C:\\Users\\u\\AppData\\Roaming\\npm', PATHEXT: '.COM;.EXE;.BAT;.CMD', APPDATA: 'C:\\Users\\u\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
const op = (m, action, params = {}) => S.runBrowserServeOp(m.bs, action, params);

// ═══ ① THE OP TABLE, per platform: can a browser run here, the one step, a start refused by name, remove bounded ═══
console.log('— ① the machine\'s own facts + ops (win32 / darwin / linux)');
{
  const winNoCli = machine('win-nocli', { platform: 'win32', env: WIN_ENV, cli: null });
  const r1 = (await op(winNoCli, 'builds')).ready;
  ok(gateOf(r1) && r1.platform === 'win32' && !r1.cli.found && gateOf(r1.step) && r1.step.code === 'browser_cli_missing' && r1.step.command === 'npm install -g agent-browser; agent-browser install' && r1.step.shell === 'powershell', 'win32, no agent-browser on Path × PATHEXT (+ npm\'s global bin): browser_cli_missing, the PowerShell command', r1);
  const winCli = machine('win-cli', { platform: 'win32', env: WIN_ENV, files: ['C:\\Users\\u\\AppData\\Roaming\\npm\\agent-browser.CMD'] });
  const r2 = (await op(winCli, 'builds')).ready;
  ok(gateOf(r2.cli.found) && r2.cli.path === 'C:\\Users\\u\\AppData\\Roaming\\npm\\agent-browser.CMD' && !r2.browser.found && gateOf(r2.step) && r2.step.code === 'browser_missing' && r2.step.command === 'agent-browser install', 'win32, the npm .CMD shim found (case-blind `Path`), no Chrome anywhere: browser_missing → agent-browser install', r2);
  const winReady = machine('win-ready', { platform: 'win32', env: WIN_ENV, files: ['C:\\Users\\u\\AppData\\Roaming\\npm\\agent-browser.CMD', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'] });
  const r3 = (await op(winReady, 'builds')).ready;
  ok(r3.step === null && r3.browser.kind === 'system' && r3.browser.path === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'win32 with Chrome in Program Files: ready (no step)', r3);
  const macNoCli = machine('mac-nocli', { platform: 'darwin', cli: null, files: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] });
  const r4 = (await op(macNoCli, 'builds')).ready;
  ok(gateOf(r4.step) && r4.step.code === 'browser_cli_missing' && r4.step.command === 'npm install -g agent-browser && agent-browser install' && r4.step.shell === 'sh' && verdictOf(r4.browser.found), 'darwin, Chrome.app present but no CLI: browser_cli_missing, the sh command', r4);
  const macPw = machine('mac-pw', { platform: 'darwin' });
  fs.mkdirSync(path.join(macPw.home, 'Library', 'Caches', 'ms-playwright', 'chromium-1187'), { recursive: true });
  ok((await op(macPw, 'builds')).ready.browser.kind === 'playwright', 'darwin: Playwright\'s cache counts (agent-browser reads it)');
  const linDl = machine('lin-dl', { platform: 'linux', env: { PATH: '/usr/bin:/bin' } });
  fs.mkdirSync(path.join(linDl.home, '.agent-browser', 'browsers', 'chrome-141.0.7390.54'), { recursive: true });
  ok((await op(linDl, 'builds')).ready.browser.kind === 'downloaded', 'linux: its own downloaded build counts');
  const linSys = machine('lin-sys', { platform: 'linux', env: { PATH: '/opt/x/bin:/usr/bin' }, files: ['/opt/x/bin/google-chrome-stable'] });
  ok((await op(linSys, 'builds')).ready.browser.path === '/opt/x/bin/google-chrome-stable', 'linux: a Chrome on PATH counts');
  const linNone = machine('lin-none', { platform: 'linux', env: { PATH: path.join(ROOT, 'empty') } });
  ok((await op(linNone, 'builds')).ready.step.code === 'browser_missing', 'linux with nothing: browser_missing');
  // a START on a machine with no CLI: refused BY NAME with the step, NOTHING created there
  const id = 'bp-0a0b0c0d';
  const s1 = await op(winNoCli, 'start', { profileId: id });
  ok(s1.ok === false && s1.code === 'browser_cli_missing' && gateOf(s1.step) && gateOf(s1.step.command.includes('npm install -g agent-browser')) && !/agent-browser/.test(s1.error) && gateOf(/Agent browser panel/.test(s1.error)) && !fs.existsSync(path.join(winNoCli.home, '.agent-browser', 'vs-' + id)) && winNoCli.st.launches.length === 0, 'start with no CLI: browser_cli_missing + the step (the sentence never names the CLI — an agent reads it), the profile folder NOT created, nothing launched', s1);
  const Sm = mutant('src/browser-serve.js', '{ const cli = cliFact(bs); if (!cli.found)', '{ const cli = cliFact(bs); if (false)');
  const s1c = await Sm.runBrowserServeOp(winNoCli.bs, 'start', { profileId: id });
  ok(s1c.code !== 'browser_cli_missing' && verdictOf(fs.existsSync(path.join(winNoCli.home, '.agent-browser', 'vs-' + id))), 'CONTROL (the check removed): the start creates the folder and is not refused by name', s1c);
  // the CLI's OWN "no Chrome" verdict at a launch ⇒ browser_missing + the step (never a generic launch_failed)
  const noChrome = machine('lin-nochrome', { platform: 'linux', noChrome: true });
  const s2 = await op(noChrome, 'start', { profileId: id });
  ok(s2.ok === false && s2.code === 'browser_missing' && gateOf(s2.step) && s2.step.command === 'agent-browser install', 'a launch the CLI answers "No Chrome binary found": browser_missing + agent-browser install', s2);
  const Sm2 = mutant('src/browser-serve.js', "if (!r.ok && /No Chrome binary found/i.test(", "if (false && /No Chrome binary found/i.test(");
  ok((await Sm2.runBrowserServeOp(noChrome.bs, 'start', { profileId: id })).code === 'launch_failed', 'CONTROL (no translation): the same launch is a generic launch_failed');
  // REMOVE: the profile's OWN folder + its two launch views; a sibling, a running browser, a link — each kept and said
  const m = machine('lin-rm', { platform: 'linux' });
  const ab = path.join(m.home, '.agent-browser');
  const own = path.join(ab, 'vs-' + id), sib = path.join(ab, 'vs-bp-0e0e0e0e');
  fs.mkdirSync(path.join(own, 'Default'), { recursive: true }); fs.writeFileSync(path.join(own, 'Default', 'Cookies'), 'x');
  fs.mkdirSync(sib, { recursive: true }); fs.writeFileSync(path.join(sib, 'Cookies'), 'keep');
  fs.mkdirSync(path.join(m.home, '.vibespace', 'browser-serve'), { recursive: true });
  fs.writeFileSync(S.planFileOf(m.bs, 'vs-' + id) , '{}'); fs.writeFileSync(S.buildFileOf(m.bs, 'vs-' + id), '{}');
  m.st.running.set('vs-' + id, true);
  const rr = await op(m, 'remove', { profileId: id });
  ok(rr.ok === false && rr.code === 'running' && verdictOf(fs.existsSync(own)), 'remove while its browser runs there: refused `running`, the folder kept', rr);
  m.st.running.delete('vs-' + id);
  const rm = await op(m, 'remove', { profileId: id });
  ok(gateOf(rm.ok) && rm.removed === true && rm.views === 2 && !fs.existsSync(own) && fs.readFileSync(path.join(sib, 'Cookies'), 'utf8') === 'keep' && !fs.existsSync(S.planFileOf(m.bs, 'vs-' + id)), 'remove: the profile\'s own folder + its two launch views gone; a sibling profile untouched', rm);
  ok((await op(m, 'remove', { profileId: id })).removed === false, 'remove again: ok, nothing there (removed:false)');
  const bad = await op(m, 'remove', { profileId: '../../etc' });
  ok(bad.ok === false && bad.code === 'bad-request', 'remove of a non-id ("../../etc"): bad-request — the machine composes the path from an id only', bad);
  const outside = path.join(ROOT, 'outside'); fs.mkdirSync(outside, { recursive: true }); fs.writeFileSync(path.join(outside, 'keep.txt'), 'k');
  fs.symlinkSync(outside, own);
  const rl = await op(m, 'remove', { profileId: id });
  ok(rl.ok === false && rl.code === 'not_a_folder' && verdictOf(fs.existsSync(path.join(outside, 'keep.txt'))), 'a LINK where the folder should be: left as it is, its target untouched (never followed)', rl);
  fs.unlinkSync(own);
}

// ═══ ② THE AGENT CLIENT'S CAPABILITY GATE (the real DeviceManager method) + the daemon's hello ═══
console.log('— ② the capability gate');
{
  const ask = async (caps, action) => { const self = { connect: async () => ({ info: { capabilities: caps } }), _request: async () => ({ result: { ok: true, asked: action } }) }; try { return await DeviceManager.prototype.browserServe.call(self, action, { profileId: 'bp-0a0b0c0d' }); } catch (e) { return { thrown: e.code, message: e.message }; } };
  const old = await ask(['browser-serve', 'browser-builds'], 'remove');
  ok(old.thrown === 'remove_unsupported' && verdictOf(/upgrade the agent/.test(old.message)), 'an agent without `browser-remove` is never asked to remove: remove_unsupported by name', old);
  ok((await ask(['browser-serve', 'browser-builds', 'browser-remove'], 'remove')).asked === 'remove' && (await ask(['browser-serve'], 'status')).asked === 'status', 'with the capability it is asked; other ops are unchanged');
  const daemon = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(gateOf(/capabilities: \[[^\]]*'browser-remove'[^\]]*\]/.test(daemon)) && verdictOf(S.BROWSER_SERVE_OPS.includes('remove')), 'the daemon announces `browser-remove`; `remove` is in the shared op table');
}

// ═══ ②b B-e799: THE STRUCTURED STOP — the machine's `stop` answers its OUTCOME in fields (capability `browser-stop-facts`) ═══
// The hub's keeper reads these fields, never the op's words. A pid that outlives the grace is REPORTED, never signalled by the op.
console.log('— ②b the structured stop: the outcome in fields, the gate, the announcement');
{
  // the gate (the REAL DeviceManager method): a stop asked WITH facts of an agent that does not announce them is refused BY NAME,
  // before any request — its words true to how an agent is updated (the hub pushes its signed agent at the machine's next connection)
  const askP = async (caps, action, params) => { let asked = 0; const self = { connect: async () => ({ info: { capabilities: caps, daemonVersion: '2.369.414' } }), _request: async () => { asked++; return { result: { ok: true, asked: action } }; } }; try { const r = await DeviceManager.prototype.browserServe.call(self, action, params); return { ...r, asked }; } catch (e) { return { thrown: e.code, message: e.message, asked }; } };
  const OLD = ['browser-serve', 'browser-builds', 'browser-remove'], NEW = [...OLD, 'browser-stop-facts'];
  const g0 = await askP(OLD, 'stop', { profileId: 'bp-0a0b0c0d', facts: true });
  ok(g0.thrown === 'stop_facts_unsupported' && g0.asked === 0 && gateOf(/\(2\.369\.414\) predates the structured stop answer/.test(g0.message)) && gateOf(/updates it by itself when the machine next connects/.test(g0.message)) && verdictOf(/do not try to update it yourself/.test(g0.message)),
    'B-e799: an agent without `browser-stop-facts` is NEVER asked a stop with facts — refused by name, its words true to the update road (the hub updates it at its next connection; never by the asker)', g0);
  const g1 = await askP(NEW, 'stop', { profileId: 'bp-0a0b0c0d', facts: true }), g2 = await askP(OLD, 'stop', { profileId: 'bp-0a0b0c0d' });
  ok(g1.asked === 1 && g1.ok === true && g2.asked === 1 && g2.ok === true, 'B-e799: with the capability it is asked; a stop WITHOUT facts (a person\'s own stop) is asked of an older agent as before', { g1, g2 });
  const daemon = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(verdictOf(/capabilities: \[[^\]]*'browser-stop-facts'[^\]]*\]/.test(daemon)), 'B-e799: the daemon announces `browser-stop-facts`');

  // the op's five outcomes over a stand-in machine (its runtime injected per case; the grace shortened to 50 ms)
  const m = machine('stop-facts', { files: ['/usr/bin/google-chrome'] });
  const SF = 'bp-5f5f0e79', place = S.placeOf(m.bs, SF);
  fs.mkdirSync(place.dir, { recursive: true });
  const stopWith = (rt) => S.runBrowserServeOp({ ...m.bs, runtime: { ...m.bs.runtime, ...rt }, stopGraceMs: 50 }, 'stop', { profileId: SF, facts: true });
  const DEAD = 4194301;   // a pid no process holds (the stand-in daemon is gone the moment its close runs)
  const sStopped = await stopWith({ info: async () => ({ active: true, pid: DEAD }), closeAll: async () => ({ ok: true }) });
  const sSurvived = await stopWith({ info: async () => ({ active: true, pid: process.pid }), closeAll: async () => ({ ok: true }) });   // a pid that lives on (this suite's own: the op never signals)
  const sFailed = await stopWith({ info: async () => ({ active: true, pid: process.pid }), closeAll: async () => ({ ok: false, stderr: 'close --all: the daemon did not answer' }) });
  const sNone = await stopWith({ info: async () => ({ active: false, pid: null }), closeAll: async () => ({ ok: true }) });
  // round wvdrkjdvx (1): a lock whose pid is ALIVE but names no folder of ours (a recycled pid — here this suite's own node) is FREE
  // by the owner rule (browser-profiles profileLockVerdict) ⇒ «not_running», never «not ours»
  const lockAt = path.join(place.dir, 'SingletonLock');
  fs.symlinkSync(`${os.hostname()}-${process.pid}`, lockAt);   // written on THIS machine (a lock of another hostname is the verdict's other rule)
  const sRecycled = await stopWith({ info: async () => ({ active: false, pid: null }), closeAll: async () => ({ ok: true }) });
  fs.unlinkSync(lockAt);
  // (4) the fields ONLY when asked: a stop without facts (a person's own stop) answers today's shape
  const sPlain = await S.runBrowserServeOp({ ...m.bs, runtime: { ...m.bs.runtime, info: async () => ({ active: true, pid: DEAD }), closeAll: async () => ({ ok: true }) }, stopGraceMs: 50 }, 'stop', { profileId: SF });
  ok(gateOf(sStopped.ok) && sStopped.outcome === 'stopped' && gateOf(sStopped.daemon) && sStopped.daemon.pid === DEAD && sStopped.survivors.length === 0, 'B-e799: our daemon gone after the grace ⇒ outcome «stopped», its pid named', sStopped);
  ok(gateOf(sSurvived.ok) && sSurvived.outcome === 'survived' && sSurvived.survivors.length === 1 && sSurvived.survivors[0].pid === process.pid && gateOf(Number.isInteger(sSurvived.survivors[0].starttime)) && verdictOf(/still alive/.test(sSurvived.left || '')),
    'B-e799: a daemon alive after the grace ⇒ «survived» with its pid and start time (the words `left` kept for an older hub; the process NOT signalled)', sSurvived);
  ok(sFailed.ok === false && sFailed.code === 'stop_failed' && sFailed.outcome === 'failed', 'B-e799: a close that failed with the daemon still alive ⇒ «failed» (ok:false, its own code)', sFailed);
  ok(gateOf(sNone.ok) && sNone.outcome === 'not_running' && sNone.daemon === null, 'B-e799: nothing of ours ran and nothing holds its folder ⇒ «not_running»', sNone);
  ok(gateOf(sRecycled.ok) && sRecycled.outcome === 'not_running' && !sRecycled.holder, 'B-e799 (round wvdrkjdvx 1): a stale lock whose pid is alive but names no folder of ours (a recycled pid) ⇒ «not_running» — the owner rule says free, never «not ours»', sRecycled);
  ok(gateOf(sPlain.ok) && sPlain.closed === 1 && !('outcome' in sPlain) && !('survivors' in sPlain), 'B-e799 (round wvdrkjdvx 4): a stop asked WITHOUT facts (a person\'s own stop) answers today\'s shape — no outcome fields: its road is kept', sPlain);
  // the PURE outcome over the LOCK VERDICT's facts (a fast suite starts no real program): who holds the folder is judged by
  // browser-profiles profileLockVerdict — the keeper's launch mark, or the browser CLI's own --remote-debugging-port=0 on a folder
  // VibeSpace minted; the real driver scrubs every AGENT_BROWSER_* from its Chrome, so the environment is no witness
  const HOST = 'stand-in-machine', D0 = place.dir;
  const holderOf = (argv, extra = {}) => ({ lock: { host: HOST, pid: 4321 }, holder: { pid: 4321, alive: true, starttime: 777, cmdline: ['chrome', `--user-data-dir=${D0}`, ...argv].join('\0'), dirs: [D0], parentIsDaemon: false, ...extra } });
  const pure = (S2, o) => S2.stopFactsOf({ daemon: null, closed: { ok: true }, daemonAlive: false, dir: D0, mark: SF, hostname: HOST, ...o });
  const OWN_PRE = holderOf(['--remote-debugging-port=0']), OWN_MARK = holderOf([B.keeperMarkArg(SF)]), PERSON = holderOf([]);
  const pOwnPre = pure(S, { before: { active: false }, lockFacts: OWN_PRE }), pOwnMark = pure(S, { before: { active: false }, lockFacts: OWN_MARK }), pPerson = pure(S, { before: { active: false }, lockFacts: PERSON });
  const pLinger = pure(S, { before: { active: true }, daemon: { pid: DEAD, starttime: null }, lockFacts: OWN_PRE });   // (2) the daemon ended in the grace, its Chrome still holds the folder
  const pIdle = pure(S, { before: { active: false }, daemon: { pid: DEAD, starttime: null }, lockFacts: { lock: null, holder: null } });   // (3) an idle daemon, no browser, ended
  ok(pOwnPre.outcome === 'survived' && pOwnPre.survivors[0].pid === 4321 && pOwnMark.outcome === 'survived' && pPerson.outcome === 'not_ours' && pPerson.holder.user === true && pPerson.holder.pid === 4321,
    'B-e799 (round wvdrkjdvx 1): OUR OWN orphan (the CLI\'s --remote-debugging-port=0, or the keeper\'s launch mark) ⇒ «survived», named; a browser with no mark of ours ⇒ «not_ours», user', { pOwnPre, pOwnMark, pPerson });
  ok(pLinger.outcome === 'survived' && verdictOf(pLinger.survivors.some((x) => x.pid === 4321)), 'B-e799 (round wvdrkjdvx 2): the daemon ended inside the grace while OUR Chrome still holds the folder ⇒ «survived» (never «stopped» with its memory still there)', pLinger);
  ok(pIdle.outcome === 'not_running' && pIdle.daemonEnded === true, 'B-e799 (round wvdrkjdvx 3): an idle daemon with no browser, then ended ⇒ «not_running» with daemonEnded (the words say what happened)', pIdle);
  // RED (two copies): (1) today's environment rule — the holder judged by its namespace — calls OUR OWN orphan «not ours» (the false
  // cause a person would read); (2) the lock read only when the daemon was not active — a lingering Chrome after the grace is «stopped»
  const SSRC = fs.readFileSync(path.join(REPO, 'src/browser-serve.js'), 'utf8');
  const MS = mutantCopies('rps-stop-holder', REPO);
  const S_ENV = MS.load('src/browser-serve.js', anchored(anchored(SSRC, "  const ownHolder = v.kind === 'own-orphan' && hh ? hh : null;", "  const ownHolder = lf.holder && lf.holder.namespace === 'vs-' + String(mark) && hh ? hh : null;", 'e799-env-rule'), "  if (!ran && v.kind === 'foreign' && hh) return", "  if (!ran && hh) return", 'e799-env-foreign'), 'e799-env-rule');
  const S_LATE = MS.load('src/browser-serve.js', anchored(SSRC, "  if (ownHolder) return { outcome: 'survived'", "  if (!ran && ownHolder) return { outcome: 'survived'", 'e799-lock-not-active-only'), 'e799-lock-not-active-only');
  const rEnv = pure(S_ENV, { before: { active: false }, lockFacts: OWN_PRE }), rLate = pure(S_LATE, { before: { active: true }, daemon: { pid: DEAD, starttime: null }, lockFacts: OWN_PRE });
  ok(rEnv.outcome === 'not_ours' && rLate.outcome === 'stopped', 'B-e799 RED (two copies): the environment rule calls our own orphan «not ours» (a false cause); the lock read only when the daemon was not active calls a lingering Chrome «stopped» (FREED with its memory there)', { rEnv: rEnv.outcome, rLate: rLate.outcome });
}

// ═══ ③ THE HUB: keeper + access layer + routes over the fake machines ═══
console.log('— ③ the owner\'s doors: start from cold, browse it himself, delete with its folder, no browser by name');
const mac = machine('dev-mac', { platform: 'darwin', files: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] });
const win = machine('dev-win', { platform: 'win32', env: WIN_ENV, cli: null });
const lin = machine('dev-lin', { platform: 'linux', env: { PATH: '/usr/bin' }, files: ['/usr/bin/google-chrome'] });
const CAPS = { 'dev-mac': ['browser-serve', 'browser-builds', 'browser-remove'], 'dev-win': ['browser-serve', 'browser-builds', 'browser-remove'], 'dev-lin': ['browser-serve', 'browser-builds'] };
const MACH = { 'dev-mac': mac, 'dev-win': win, 'dev-lin': lin };
const devices = {};
const GATE = { remove: null }; // verify r1: hold a machine's `remove` answer (the op has run there) — a start racing a delete
for (const [id, mm] of Object.entries(MACH)) {
  const self = { connect: async () => ({ info: { capabilities: CAPS[id] } }), _request: async ({ action, params }) => { const r = await S.runBrowserServeOp(mm.bs, action, params); if (action === 'remove' && GATE.remove) await GATE.remove; return { result: r }; } };
  devices[id] = {
    browserServe: (action, params) => DeviceManager.prototype.browserServe.call(self, action, params),
    tcpForward: async (port) => {
      const up = net.connect({ host: '127.0.0.1', port });
      const h = { onData: null, onClose: null, write: (b) => { try { up.write(b); } catch { /* gone */ } }, close: () => { try { up.destroy(); } catch { /* gone */ } } };
      await new Promise((resolve, reject) => { up.once('connect', resolve); up.once('error', reject); });
      up.on('data', (b) => h.onData?.(b)); up.on('close', () => h.onClose?.()); up.on('error', () => h.onClose?.());
      return h;
    },
  };
}
const hosts = {
  isLocal: (id) => !id || id === 'local',
  get: (id) => { if (MACH[id] || id === 'dev-down') return { id }; throw new Error('host not found'); },
  deviceBounded: async (id) => { if (devices[id]) return devices[id]; throw new Error('device link not responding'); },
};
const log = { log: () => { }, warn: () => { }, error: () => { } };
const access = A.create({ hosts, env: () => ({ PATH: PATH_ENV, HOME }), homeDir: HOME, install: false, log });
const k = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: () => { },
  getTelemetry: () => null, liveKeys: () => new Set(), limits: { ...LIMITS, CONCURRENT_CAP: 4 }, log, tickMs: 3600e3, install: false, access, hostKnown: (h) => access.hostKnown(h) });
const express = require('express');
function serve(R) {
  const app = express(); app.use(express.json());
  R.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, forwards: () => access.forwards() });
  app.use(R.router);
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => { servers.add(s); r(`http://127.0.0.1:${s.address().port}`); }); });
}
const R = require('../src/routes/browser.js');
const API = await serve(R);
const call = async (base, method, url, body) => { const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await res.json(); } catch { j = null; } return { status: res.status, json: j }; };
const owner = { owner: { kind: 'instance', id: null } };
{
  // 1 · START FROM COLD through the restart route (never started ⇒ no record)
  const p = k.createProfile({ label: 'Bank on the Mac', host: 'dev-mac' }, owner);
  const Rc = mutant('src/routes/browser.js', "    try { await k.stop(req.params.id, { why: 'user' }); } catch (e) { if (!(remote && e && e.code === 'not-found')) throw e; cold = true; }", "    await k.stop(req.params.id, { why: 'user' });");
  const APIc = await serve(Rc);
  const c0 = await call(APIc, 'POST', `/api/browser/profiles/${p.id}/restart`);
  ok(c0.status === 404 && verdictOf(/no browser record/.test(c0.json && c0.json.error)), 'CONTROL (the base\'s stop-first restart): a never-started paired machine\'s profile answers 404 "no browser record"', c0);
  R.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, forwards: () => access.forwards() });
  const c1 = await call(API, 'POST', `/api/browser/profiles/${p.id}/restart`);
  ok(c1.status === 200 && c1.json.cold === true && gateOf(c1.json.browser) && c1.json.browser.state === 'ready' && mac.st.launches.length === 1 && verdictOf(access.forwards().some((f) => f.hostId === 'dev-mac')), 'the owner STARTS it from cold: 200, started on dev-mac (one launch there), the hub forward up', c1);
  const c2 = await call(API, 'POST', `/api/browser/profiles/${p.id}/restart`);
  ok(c2.status === 200 && c2.json.cold === false && mac.st.launches.length === 2, 'a live one is RESTARTED (stop + start, cold:false) — the one door');
  // 2 · BROWSE IT YOURSELF: his own tab over the HUB FORWARD (never the machine's port), the live view's target
  const before = hubCli().length;
  const b1 = await call(API, 'POST', `/api/browser/profiles/${p.id}/browse`);
  const fwd = access.forwards().find((f) => f.hostId === 'dev-mac');
  const tabCalls = hubCli().slice(before).filter((c) => c.argv[0] === 'tab' && c.argv[1] === 'new');
  ok(b1.status === 200 && b1.json.key === HM.humanKeyFor(p.id) && tabCalls.length === 1 && gateOf(fwd) && gateOf(tabCalls[0].cdp) && gateOf(tabCalls[0].cdp.includes('127.0.0.1:' + fwd.localPort)) && !tabCalls[0].cdp.includes(':' + CDP_PORT + '/'), 'Browse yourself on a paired machine\'s profile: his own tab, opened over the hub forward 127.0.0.1:' + (fwd && fwd.localPort) + ' (not the machine\'s port)', { b1, tabCalls });
  const tg = k.humanTargetFor(b1.json.key);
  ok(gateOf(tg) && tg.ok !== false && tg.profileId === p.id, 'the live view\'s target for his browsing window exists (the view opens on it)', tg);
  const HMc = mutant('src/browser-human.js', "  if (p.host && hostKnown === false) return no('remote_profile'", "  if (p.host) return no('remote_profile'");
  ok(HMc.browseYourselfVerdict({ profile: { id: p.id, label: 'x', host: 'dev-mac' }, hostKnown: true }).code === 'remote_profile' && HM.browseYourselfVerdict({ profile: { id: p.id, label: 'x', host: 'dev-mac' }, hostKnown: true }).ok === true, 'CONTROL (the v1 line): the same verdict refuses remote_profile; this tree answers ok');
  const gone = HM.browseYourselfVerdict({ profile: { id: p.id, label: 'Bank', host: 'dev-gone' }, hostKnown: false });
  ok(gone.code === 'remote_profile' && verdictOf(/not paired with this VibeSpace any more/.test(gone.error)), 'a machine this VibeSpace no longer knows: remote_profile, said by name', gone);
  await k.quitHuman(b1.json.key);
  ok(!B.isLiveBrowser(k._reg().browsers[p.id]) && !mac.st.running.size, 'Quit the whole browser: stopped on the machine');
  // 3 · NO BROWSER THERE — said by name, with the one step for THAT platform (start + browse + the dialog's builds)
  const w = k.createProfile({ label: 'On the PC', host: 'dev-win' }, owner);
  const s1 = await call(API, 'POST', `/api/browser/profiles/${w.id}/restart`);
  ok(s1.status === 409 && s1.json.code === 'browser_cli_missing' && gateOf(s1.json.step) && s1.json.step.command === 'npm install -g agent-browser; agent-browser install' && s1.json.step.machine === 'dev-win' && gateOf(/dev-win: no browser can start on this machine/.test(s1.json.error)) && !fs.existsSync(path.join(win.home, '.agent-browser', 'vs-' + w.id)), 'start on a Windows machine with no agent-browser: 409 browser_cli_missing, the PowerShell step + the machine, nothing created there', s1);
  const s2 = await call(API, 'POST', `/api/browser/profiles/${w.id}/browse`);
  ok(s2.status === 409 && s2.json.code === 'browser_cli_missing' && gateOf(s2.json.step) && s2.json.step.shell === 'powershell', 'Browse yourself there: the same refusal by name + its step', s2);
  const bw = await call(API, 'GET', '/api/browser/builds?host=dev-win'), bm = await call(API, 'GET', '/api/browser/builds?host=dev-mac'), bl = await call(API, 'GET', '/api/browser/builds');
  ok(gateOf(bw.json.ready) && bw.json.ready.step.code === 'browser_cli_missing' && gateOf(bm.json.ready) && bm.json.ready.step === null && bl.json.ready === null, 'GET /api/browser/builds?host=: the machine\'s `ready` (dev-win: the step; dev-mac: none); this computer: null', { bw: bw.json.ready, bm: bm.json.ready, bl: bl.json.ready });
  // 4 · DELETE WITH ITS FOLDER THERE (the DELETE route and the panel's Delete… / forget)
  fs.mkdirSync(path.join(mac.home, '.agent-browser', 'vs-' + p.id, 'Default'), { recursive: true });
  const Rd = mutant('src/routes/browser.js', "    const r = k.removeProfile(req.params.id, { unpin, machine: snap, replyMs: REPLY_LAND_MS });", "    const r = k.removeProfile(req.params.id, { unpin, replyMs: REPLY_LAND_MS });");   // the moved2 cure 2: the machine is asked by the keeper's own step (the snapshot handed to it) — the control hands none   // lane lg-store-writes (the move's hunt, C): the machine's call is the ternary's second road (the first: a removal not on disk asks nothing)
  const APId = await serve(Rd);
  const p2 = k.createProfile({ label: 'Control twin', host: 'dev-mac' }, owner);
  fs.mkdirSync(path.join(mac.home, '.agent-browser', 'vs-' + p2.id), { recursive: true });
  const dc = await call(APId, 'DELETE', `/api/browser/profiles/${p2.id}`);
  ok(dc.status === 200 && gateOf(fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + p2.id))) && !dc.json.machine, 'CONTROL (no machine removal): the record goes, its folder on the machine STAYS and nothing says so');
  R.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, forwards: () => access.forwards() });
  const d1 = await call(API, 'DELETE', `/api/browser/profiles/${p.id}`);
  ok(d1.status === 200 && d1.json.removed === p.id && gateOf(d1.json.machine) && d1.json.machine.removed === true && d1.json.machine.host === 'dev-mac' && !fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + p.id)) && verdictOf(fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + p2.id))), 'DELETE: the record AND its folder on dev-mac gone (the machine\'s own op); another profile\'s folder there untouched', d1.json);
  const l = k.createProfile({ label: 'Old agent box', host: 'dev-lin' }, owner);
  const d2 = await call(API, 'DELETE', `/api/browser/profiles/${l.id}`);
  ok(d2.status === 200 && !k.profile(l.id) && gateOf(d2.json.machine) && d2.json.machine.removed === false && d2.json.machine.code === 'remove_unsupported' && gateOf(/vs-bp-[0-9a-f]{8} on dev-lin was left there/.test(d2.json.machine.left)) && verdictOf(/upgrade the agent/.test(d2.json.machine.left)), 'an agent that predates removal: the record goes, the answer says plainly which folder was LEFT on dev-lin and why', d2.json);
  const dn = k.createProfile({ label: 'Offline box', host: 'dev-down' }, owner);
  const d3 = await call(API, 'DELETE', `/api/browser/profiles/${dn.id}`);
  ok(d3.status === 200 && gateOf(d3.json.machine) && d3.json.machine.code === 'host_unavailable' && verdictOf(/was left there/.test(d3.json.machine.left)), 'an offline machine: removed here, its folder there named as left', d3.json);
  // the panel's Delete… (the forget route's service): a paired machine's profile — its folder there, said in the ledger
  const T = require('../src/server/browser-trace.js');
  const tr = T.create({ dataDir: DATA, homeDir: HOME, keeper: k, log, sweepEveryMs: 3600e3 });
  const f = k.createProfile({ label: 'Forget me', host: 'dev-mac' }, owner);
  fs.mkdirSync(path.join(mac.home, '.agent-browser', 'vs-' + f.id), { recursive: true });
  const fr = await tr.forgetProfile(f.id, {});
  ok(gateOf(fr.ok) && gateOf(fr.machine) && fr.machine.removed === true && !fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + f.id)) && gateOf(/on dev-mac deleted there/.test(fr.ledger.why)) && !/already gone/.test(fr.ledger.why), 'the panel\'s Delete… of a paired machine\'s profile: its folder on dev-mac deleted, the ledger says so (never "already gone")', fr);
  try { tr.stop?.(); } catch { /* none */ }
}

// ═══ ④ THE NEW PROFILE DIALOG'S MACHINE ROW (PURE model) ═══
console.log('— ④ the New profile dialog: a machine with no browser, by name, with its command');
{
  const tEn = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const rows = M.machineChoices({ machines: [{ hostId: 'local' }, { hostId: 'dev-win', label: 'WIN-DESK1', connected: true, capabilities: ['browser-serve'] }, { hostId: 'dev-mac', label: 'Mac', connected: true, capabilities: ['browser-serve'] }, { hostId: 'dev-old', label: 'Old', connected: true, capabilities: ['probe'] }],
    ready: { 'dev-win': { step: { code: 'browser_cli_missing', command: 'npm install -g agent-browser; agent-browser install', shell: 'powershell' } }, 'dev-mac': { step: null } }, t: tEn });
  const rw = rows.find((r) => r.hostId === 'dev-win'), rm = rows.find((r) => r.hostId === 'dev-mac'), ro = rows.find((r) => r.hostId === 'dev-old');
  ok(rw.state === 'needs-browser' && gateOf(rw.pickable) && gateOf(/agent-browser is not installed on WIN-DESK1/.test(rw.note)) && gateOf(/PowerShell/.test(rw.note)) && rw.step.command === 'npm install -g agent-browser; agent-browser install', 'WIN-DESK1 with no CLI: needs-browser, BY NAME, its PowerShell command (copyable), still pickable', rw);
  ok(rm.state === 'ready' && !rm.step && ro.state === 'no-browser', 'a ready machine stays ready; an agent too old keeps its own words');
  const w2 = M.machineStepWords({ code: 'browser_missing', command: 'agent-browser install', shell: 'sh', machine: 'dev-lin' }, { t: tEn });
  ok(gateOf(w2) && gateOf(/dev-lin has no Chrome for agent-browser to run/.test(w2.note)) && gateOf(/terminal/.test(w2.note)) && w2.command === 'agent-browser install' && verdictOf(/No browser on dev-lin yet/.test(w2.title)), 'a refused start\'s step in words: the machine, the missing Chrome, where to type, the command');
  ok(M.machineStepWords(null) === null && verdictOf(M.MACHINE_STATES.includes('needs-browser')), 'no step ⇒ no words; the state is in the closed set');
  // the Agent browser panel's row: a paired machine's profile is the user's to browse and delete (never this machine's sweep's)
  const TR = require('../src/browser-trace.js');
  const rp = { id: 'bp-0a0b0c0e', label: 'Remote', provider: 'chromium', host: 'dev-mac', dir: null };
  const row = TR.housekeepingVerdict({ profiles: [rp], now: Date.now() })[0];
  const TRc = mutant('src/browser-trace.js', '    if (!q.ok && !remoteOwned(p, rowOf)) return', '    if (!q.ok) return');
  const rowC = TRc.housekeepingVerdict({ profiles: [rp], now: Date.now() })[0];
  ok(row.state === 'kept' && gateOf(row.canBrowse) && gateOf(row.canForget) && gateOf(TR.forgetVerdict({ profile: rp }).ok) && rowC.state === 'not-ours' && !rowC.canForget, 'the panel row of a paired machine\'s profile: kept, Browse yourself + Delete… offered (CONTROL: the base row is not-ours — no Browse, Delete greyed)', { row, rowC });
  ok(TR.queueVerdict(rp).code === 'not_ours' && TR.forgetVerdict({ profile: rp, browsers: { [rp.id]: { state: 'ready' } } }).code === 'running', 'this machine\'s sweep still never judges it (queueVerdict not_ours); a running one is refused first');
}

// ═══ ⑤ VERIFY R1: a start racing a delete · this computer's restart unchanged · two lines an inline comment had eaten ═══
console.log('— ⑤ verify r1');
{
  const setupWith = (Rm, extra = {}) => Rm.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, forwards: () => access.forwards(), ...extra });
  // F4 · a DELETE racing an agent's first command: the record goes FIRST, the machine is asked after — no start lands between
  const raceOnce = async (base) => {
    const pr = k.createProfile({ label: 'Race ' + Math.random().toString(16).slice(2, 6), host: 'dev-mac' }, owner);
    const own = path.join(mac.home, '.agent-browser', 'vs-' + pr.id); fs.mkdirSync(path.join(own, 'Default'), { recursive: true }); fs.writeFileSync(path.join(own, 'Default', 'Cookies'), 'logins');
    let rel; GATE.remove = new Promise((r) => { rel = r; });
    const dP = call(base, 'DELETE', `/api/browser/profiles/${pr.id}`);
    for (let i = 0; i < 200 && fs.existsSync(path.join(own, 'Default', 'Cookies')); i++) await new Promise((r) => setTimeout(r, 10));
    let st; try { st = await k.start(pr.id, { why: 'attach' }); } catch (e) { st = { thrown: e.code }; }
    rel(); GATE.remove = null;
    const d = await dP;
    const res = { st, d, kept: !!k.profile(pr.id), running: mac.st.running.has('vs-' + pr.id) };
    if (res.kept) { try { await k.stop(pr.id, { why: 'user' }); } catch { /* none */ } try { k.removeProfile(pr.id); } catch { /* none */ } }
    return res;
  };
  const Rr = mutant('src/routes/browser.js', `    const snap = typeof k.profile === 'function' ? k.profile(req.params.id) : null;
    // lane lg-store-writes (the moved2 cure 2 — THE STEP RIDES THE LANDING): the machine deletes the folder — with the passkeys, the
    // grant row, the marked config — once the record's removal is ON DISK (the keeper's step); the answer waits a bounded time:
    // landed = done, not yet = said by its code (\`finishes-on-landing\`: saved here, it finishes by itself), never half taken
    const r = k.removeProfile(req.params.id, { unpin, machine: snap, replyMs: REPLY_LAND_MS });
    const L = r && r.landing ? await r.landing : null;
    const v = L && L.landed ? L.value || null : null;
    const m = L ? (L.landed ? (v && v.onMachine ? await v.onMachine : null) : (snap && snap.host ? { host: snap.host, left: 'asked by itself once the removal is on disk' } : null))
      : typeof k.removeOnMachine === 'function' ? await k.removeOnMachine(req.params.id, { profile: snap }) : null;   // a keeper without the law (a suite's stand-in)
    res.json({ ...r, ...(v ? { passkeys: v.passkeys } : {}), unpinned: u.cleared, ...(m ? { machine: m } : {}), ...(L && !L.landed ? FINISHES : {}) });`, `    const m = typeof k.removeOnMachine === 'function' ? await k.removeOnMachine(req.params.id) : null;
    res.json({ ...k.removeProfile(req.params.id, { unpin }), unpinned: u.cleared, ...(m ? { machine: m } : {}) });`);
  const APIr = await serve(Rr);
  const rc = await raceOnce(APIr);
  ok(rc.st.state === 'ready' && rc.d.status === 409 && rc.d.json.code === 'running' && gateOf(rc.kept) && verdictOf(rc.running), 'CONTROL (the machine asked BEFORE the record goes): the start lands in between — the folder\'s logins are gone there, yet the Delete answers 409 running and the profile stays listed', { st: rc.st, d: rc.d.json });
  setupWith(R);
  const r1 = await raceOnce(API);
  ok(r1.st.thrown === 'not-found' && r1.d.status === 200 && gateOf(r1.d.json.machine) && r1.d.json.machine.removed === true && !r1.kept && !r1.running, 'a Delete racing an agent\'s first command: the record went first (that start is not-found), the folder there deleted, nothing runs there', { st: r1.st, d: r1.d.json });
  // the panel's Delete… (forget) takes the same order
  const T2 = require('../src/server/browser-trace.js');
  const tr2 = T2.create({ dataDir: DATA, homeDir: HOME, keeper: k, log, sweepEveryMs: 3600e3 });
  const pf = k.createProfile({ label: 'Forget race', host: 'dev-mac' }, owner);
  fs.mkdirSync(path.join(mac.home, '.agent-browser', 'vs-' + pf.id), { recursive: true });
  let relf; GATE.remove = new Promise((r) => { relf = r; });
  const fP = tr2.forgetProfile(pf.id, {});
  for (let i = 0; i < 200 && fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + pf.id)); i++) await new Promise((r) => setTimeout(r, 10));
  let sf; try { sf = await k.start(pf.id, { why: 'attach' }); } catch (e) { sf = { thrown: e.code }; }
  relf(); GATE.remove = null;
  const fr = await fP;
  ok(sf.thrown === 'not-found' && gateOf(fr.ok) && gateOf(fr.machine) && fr.machine.removed === true && !k.profile(pf.id) && !mac.st.running.has('vs-' + pf.id), 'the panel\'s Delete… racing a start: the same order (record first, then the machine)', { sf, fr: fr && fr.machine });
  try { tr2.stop?.(); } catch { /* none */ }
  // F3 · THIS computer's never-started profile: the restart route still answers 404 "no browser record" (no launch, no `cold`)
  const here = k.createProfile({ label: 'Here' }, owner);
  const n0 = hubCli().length;
  const h1 = await call(API, 'POST', `/api/browser/profiles/${here.id}/restart`);
  ok(h1.status === 404 && gateOf(/no browser record/.test(h1.json.error)) && Object.keys(h1.json).join() === 'error,code' && hubCli().length === n0, 'this computer\'s never-started profile: restart answers 404 "no browser record" byte-for-byte as before — nothing launched', h1);
  // int220: this computer's restart goes through the keeper's restartProfile first (lane browser-unresponsive) — the cold-start mutant drops that door too
  const Rh = mutant('src/routes/browser.js', "    if (!remote && typeof k.restartProfile === 'function') return res.json({ browser: await k.restartProfile(req.params.id, { by: 'user' }) });\n    try { await k.stop(req.params.id, { why: 'user' }); } catch (e) { if (!(remote && e && e.code === 'not-found')) throw e; cold = true; }", "    try { await k.stop(req.params.id, { why: 'user' }); } catch (e) { if (!(e && e.code === 'not-found')) throw e; cold = true; }");
  const APIh = await serve(Rh);
  const h2 = await call(APIh, 'POST', `/api/browser/profiles/${here.id}/restart`);
  ok(h2.status !== 404 && hubCli().length > n0, 'CONTROL (any profile cold-starts): this computer\'s profile is launched by a restart', h2);
  setupWith(R);
  try { await k.stop(here.id, { why: 'user' }); } catch { /* none */ } try { k.removeProfile(here.id); } catch { /* none */ }
  // F2 · fail(): a key minted by THIS call rides a refused answer (B-f7ab verify r2) — an inline comment had eaten the spread
  const late = { activeSessions: new Map([['s-1', { name: 'conv' }]]), ensureBrowserKey: () => ({ ok: true, key: 'bk-1a2b3c4d', minted: true, origin: 'new' }) };
  setupWith(R, late);
  const a1 = await call(API, 'POST', '/api/browser/attach', { sessionId: 's-1', profile: 'bp-deadbeef' });
  const Rm = mutant('src/routes/browser.js', " ? { step: e.step } : {}), ...(res.locals && res.locals.minted", " ? { step: e.step } : {}), // eaten ...(res.locals && res.locals.minted");
  const APIm = await serve(Rm); setupWith(Rm, late);
  const a2 = await call(APIm, 'POST', '/api/browser/attach', { sessionId: 's-1', profile: 'bp-deadbeef' });
  ok(a1.status === 404 && gateOf(a1.json.minted) && a1.json.minted.key === 'bk-1a2b3c4d' && a2.status === 404 && !a2.json.minted, 'a refused answer still carries the key this call minted (CONTROL: the comment-eaten line drops it)', { a1: a1.json, a2: a2.json });
  setupWith(R);
  // F1 · Browse yourself on this computer's profile whose backend cannot run: the verdict's own words (rule 5), before start()
  const ctl = { off: false };
  const kOf = (KK, dir) => { fs.mkdirSync(dir, { recursive: true }); return KK.create({ dataDir: dir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: () => { },
    providers: { row: (x) => B.providerRow(x), control: (x, o) => (ctl.off ? { ok: false, code: 'provider_unavailable', error: 'cloakbrowser is not installed' } : B.providerControl(x, o)) },
    getTelemetry: () => null, liveKeys: () => new Set(), limits: { ...LIMITS, CONCURRENT_CAP: 4 }, log, tickMs: 3600e3, install: false, access, hostKnown: (h) => access.hostKnown(h) }); };
  const browseErr = async (kk) => { ctl.off = false; const pl = kk.createProfile({ label: 'Cloaked' }, owner); ctl.off = true; try { await kk.browse(pl.id); return null; } catch (e) { return e; } finally { ctl.off = false; } };
  const e1 = await browseErr(kOf(K, path.join(ROOT, 'data-f1')));
  const Kc = mutant('src/server/browser-keeper.js', 'hostKnown: p && p.host ? knownHost(p.host) : true, control: p && !isEph(p)', 'hostKnown: p && p.host ? knownHost(p.host) : true, eaten: p && !isEph(p)');
  const e2 = await browseErr(kOf(Kc, path.join(ROOT, 'data-f1c')));
  ok(gateOf(e1) && e1.code === 'backend_unavailable' && gateOf(/can't run on this computer right now/.test(e1.message)) && gateOf(e2) && !/can't run on this computer right now/.test(e2.message), 'Browse yourself, its backend unavailable: the verdict\'s own words (CONTROL: without `control` the start\'s raw sentence)', { e1: e1 && e1.message, e2: e2 && e2.message });
}


// ═══ ④ B-e799: THE MANAGER'S STOP OF A PAIRED MACHINE'S BROWSER — the keeper asks for the outcome and reads its FIELDS ═══
// The real keeper + access layer + the machine's real op over the stand-in runtime. FREED only on «stopped»; every other outcome
// is its own why; an agent that predates the answer is refused by name and NOTHING moves. RED: a keeper copy that reads the op's
// words (the release's road) — a browser of another namespace holding the folder there reads as FREED.
console.log('— ④ the manager\'s stop of a paired machine\'s browser: the outcome in fields, an old agent refused by name');
{
  const q = k.createProfile({ label: 'Reports on the Mac', host: 'dev-mac' }, owner);
  const qns = S.placeOf(mac.bs, q.id).ns, qdir = S.placeOf(mac.bs, q.id).dir;
  const start = async (kk, id) => { try { await kk.start(id, { why: 'user' }); } catch (e) { return e; } return (kk.browserOf(id) || {}).state === 'ready'; };
  const live = (kk, id) => B.isLiveBrowser(kk.browserOf(id));
  const info0 = mac.bs.runtime.info;
  mac.bs.stopGraceMs = 50;
  try {
    ok(await start(k, q.id) === true, 'B-e799: the named profile runs on dev-mac (the keeper\'s own start)');
    const row = k.stopRows().find((r) => r.id === q.id);
    ok(gateOf(row) && row.kind === 'profile' && row.machine === 'dev-mac' && row.tabsKept === false, 'B-e799: its stop row is a NAMED PROFILE on its machine (kind profile, machine dev-mac; its tabs are not kept — as a named profile here)', row);
    // (a) the machine's agent predates the answer (dev-mac announces no `browser-stop-facts`): refused BY NAME, nothing moves
    const launches0 = mac.st.launches.length;
    let e1 = null; try { await k.managerStop(q.id); } catch (e) { e1 = e; }
    ok(gateOf(e1) && e1.code === 'stop_facts_unsupported' && gateOf(/updates it by itself when the machine next connects/.test(e1.message)) && gateOf(live(k, q.id)) && mac.st.running.get(qns) === true && verdictOf(access.forwards().some((f) => f.hostId === 'dev-mac')),
      'B-e799: an agent that predates the structured answer — refused stop_facts_unsupported by name; the record, the browser there and its forward are untouched', { code: e1 && e1.code, live: live(k, q.id) });
    CAPS['dev-mac'].push('browser-stop-facts');
    // (b) «stopped»: freed, the record stopped by the manager, nothing left in its error field
    const r1 = await k.managerStop(q.id);
    const rec1 = k.browserOf(q.id);
    ok(r1.freed === true && !live(k, q.id) && rec1.stoppedBy === 'manager' && !rec1.lastError && !mac.st.running.get(qns), 'B-e799: outcome «stopped» ⇒ FREED: the browser gone there, the record stopped by the manager, no residue', { r1, lastError: rec1 && rec1.lastError });
    // (c) «survived»: a daemon alive after the grace there ⇒ NOT freed, its pid named (the op never signals it)
    ok(await start(k, q.id) === true && mac.st.launches.length > launches0, 'B-e799: started again');
    mac.bs.runtime.info = async (ns) => ({ active: ns === qns, pid: ns === qns ? process.pid : null });
    const r2 = await k.managerStop(q.id);
    ok(r2.freed === false && verdictOf(new RegExp(`still running there after the stop \\(pid ${process.pid}\\)`).test(r2.why || '')), 'B-e799: outcome «survived» ⇒ NOT freed, the surviving pid named', r2);
    // (d) «not_ours»: nothing of ours ran there, and a browser VibeSpace did not start holds the profile's folder (its lock facts INJECTED
    // through the stand-in machine: a holder that NAMES the folder and carries no mark of ours — the lock verdict calls it the user's) ⇒ NOT freed
    const personLock = (dir) => ({ lock: { host: os.hostname(), pid: 4321 }, holder: { pid: 4321, alive: true, starttime: 777, cmdline: ['chrome', `--user-data-dir=${dir}`].join('\0'), dirs: [dir], parentIsDaemon: false } });
    mac.bs.runtime.info = info0;
    ok(await start(k, q.id) === true, 'B-e799: started again');
    mac.bs.runtime.info = async () => ({ active: false, pid: null });
    mac.bs.lockFactsOf = personLock;
    const r3 = await k.managerStop(q.id);
    delete mac.bs.lockFactsOf;
    ok(r3.freed === false && gateOf(/a browser VibeSpace did not start holds this profile's folder there/.test(r3.why || '')) && verdictOf(/pid 4321/.test(r3.why || '')), 'B-e799: outcome «not_ours» ⇒ NOT freed — a browser of another namespace holds its folder there, its pid named, left running', r3);
    // RED: the release's road — a keeper copy that reads only the op's words — reads the same machine answer as FREED
    const KSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const MK = mutantCopies('rps-stop-facts', REPO);
    const KT = MK.load('src/server/browser-keeper.js', anchored(anchored(KSRC, "          if (r && typeof r.outcome === 'string') {", "          if (false) {", 'b-e799-no-fields'), "    if (remote) {\n      const o = stopOutcomes.get(profileId) || null;", "    if (false) {\n      const o = stopOutcomes.get(profileId) || null;", 'b-e799-text-road'), 'b-e799-text-road');
    const kT = KT.create({ dataDir: path.join(ROOT, 'data-e799-red'), homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: () => { },
      getTelemetry: () => null, liveKeys: () => new Set(), limits: { ...LIMITS, CONCURRENT_CAP: 4 }, log, tickMs: 3600e3, install: false, access, hostKnown: (h) => access.hostKnown(h) });
    const qT = kT.createProfile({ label: 'Reports, read by words', host: 'dev-mac' }, owner);
    mac.bs.runtime.info = info0;
    const startedT = await start(kT, qT.id);
    mac.bs.runtime.info = async () => ({ active: false, pid: null });
    mac.bs.lockFactsOf = personLock;
    const rT = await kT.managerStop(qT.id);
    delete mac.bs.lockFactsOf;
    ok(startedT === true && rT.freed === true, 'B-e799 RED: a keeper that reads the op\'s words (the release\'s road) calls the same answer FREED while a browser of another namespace holds the folder there', rT);
    try { kT.shutdown(); } catch { /* none */ }
    // (e) round wvdrkjdvx (4): A PERSON'S OWN STOP KEEPS ITS ROAD on a new agent — no facts asked, so the machine answers today's
    // shape and the keeper reads its words as before (a surviving daemon said in the record's error field, the record stopped)
    mac.bs.runtime.info = info0;
    ok(await start(k, q.id) === true, 'B-e799: started again');
    mac.bs.runtime.info = async (ns) => ({ active: ns === qns, pid: ns === qns ? process.pid : null });
    let personAnswer = null; const call0 = access.call; access.call = async (...a) => { const r = await call0(...a); if (a[1] === 'stop') personAnswer = r; return r; };
    try { await k.stop(q.id, { why: 'user' }); } finally { access.call = call0; }
    const recP = k.browserOf(q.id);
    ok(gateOf(personAnswer) && !('outcome' in personAnswer) && !live(k, q.id) && recP.stoppedBy === 'user' && verdictOf(/daemon pid \d+ is still alive after close --all/.test(recP.lastError || '')), 'B-e799 (round wvdrkjdvx 4): a person\'s own stop asks no facts — the machine answers today\'s shape and the keeper reads its words as before (its road kept)', { answer: personAnswer, lastError: recP && recP.lastError });
  } finally { mac.bs.runtime.info = info0; delete mac.bs.stopGraceMs; }
}

console.log(`\ntest-remote-profile-start: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
