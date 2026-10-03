#!/usr/bin/env node
// LANE REMOTE-PROFILE-START (design 014 lane 3b, part 1) — a browser profile that lives on a PAIRED machine: the owner
// starts it from cold (the restart route's ONE door), browses it himself (the live view's own tab over the hub forward),
// deletes it WITH its folder there (the machine's own `remove` op, bounded to ~/.agent-browser/vs-bp-<id>), and a machine
// with no browser to run is said BY NAME with the one command for ITS platform. Never a real machine: FAKE DAEMONS with
// platform win32 / darwin / linux run the REAL browser-serve op table (src/browser-serve.js) behind the REAL agent client's
// capability gate (DeviceManager.prototype.browserServe) and the REAL access layer, keeper and routes. Each fix has a
// patched-copy CONTROL that turns its leg red (the copy's relative requires re-pointed at this tree).
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
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
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
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
  ok(r1 && r1.platform === 'win32' && !r1.cli.found && r1.step && r1.step.code === 'browser_cli_missing' && r1.step.command === 'npm install -g agent-browser; agent-browser install' && r1.step.shell === 'powershell', 'win32, no agent-browser on Path × PATHEXT (+ npm\'s global bin): browser_cli_missing, the PowerShell command', r1);
  const winCli = machine('win-cli', { platform: 'win32', env: WIN_ENV, files: ['C:\\Users\\u\\AppData\\Roaming\\npm\\agent-browser.CMD'] });
  const r2 = (await op(winCli, 'builds')).ready;
  ok(r2.cli.found && r2.cli.path === 'C:\\Users\\u\\AppData\\Roaming\\npm\\agent-browser.CMD' && !r2.browser.found && r2.step && r2.step.code === 'browser_missing' && r2.step.command === 'agent-browser install', 'win32, the npm .CMD shim found (case-blind `Path`), no Chrome anywhere: browser_missing → agent-browser install', r2);
  const winReady = machine('win-ready', { platform: 'win32', env: WIN_ENV, files: ['C:\\Users\\u\\AppData\\Roaming\\npm\\agent-browser.CMD', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'] });
  const r3 = (await op(winReady, 'builds')).ready;
  ok(r3.step === null && r3.browser.kind === 'system' && r3.browser.path === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'win32 with Chrome in Program Files: ready (no step)', r3);
  const macNoCli = machine('mac-nocli', { platform: 'darwin', cli: null, files: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] });
  const r4 = (await op(macNoCli, 'builds')).ready;
  ok(r4.step && r4.step.code === 'browser_cli_missing' && r4.step.command === 'npm install -g agent-browser && agent-browser install' && r4.step.shell === 'sh' && r4.browser.found, 'darwin, Chrome.app present but no CLI: browser_cli_missing, the sh command', r4);
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
  ok(s1.ok === false && s1.code === 'browser_cli_missing' && s1.step && s1.step.command.includes('npm install -g agent-browser') && !/agent-browser/.test(s1.error) && /Agent browser panel/.test(s1.error) && !fs.existsSync(path.join(winNoCli.home, '.agent-browser', 'vs-' + id)) && winNoCli.st.launches.length === 0, 'start with no CLI: browser_cli_missing + the step (the sentence never names the CLI — an agent reads it), the profile folder NOT created, nothing launched', s1);
  const Sm = mutant('src/browser-serve.js', '{ const cli = cliFact(bs); if (!cli.found)', '{ const cli = cliFact(bs); if (false)');
  const s1c = await Sm.runBrowserServeOp(winNoCli.bs, 'start', { profileId: id });
  ok(s1c.code !== 'browser_cli_missing' && fs.existsSync(path.join(winNoCli.home, '.agent-browser', 'vs-' + id)), 'CONTROL (the check removed): the start creates the folder and is not refused by name', s1c);
  // the CLI's OWN "no Chrome" verdict at a launch ⇒ browser_missing + the step (never a generic launch_failed)
  const noChrome = machine('lin-nochrome', { platform: 'linux', noChrome: true });
  const s2 = await op(noChrome, 'start', { profileId: id });
  ok(s2.ok === false && s2.code === 'browser_missing' && s2.step && s2.step.command === 'agent-browser install', 'a launch the CLI answers "No Chrome binary found": browser_missing + agent-browser install', s2);
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
  ok(rr.ok === false && rr.code === 'running' && fs.existsSync(own), 'remove while its browser runs there: refused `running`, the folder kept', rr);
  m.st.running.delete('vs-' + id);
  const rm = await op(m, 'remove', { profileId: id });
  ok(rm.ok && rm.removed === true && rm.views === 2 && !fs.existsSync(own) && fs.readFileSync(path.join(sib, 'Cookies'), 'utf8') === 'keep' && !fs.existsSync(S.planFileOf(m.bs, 'vs-' + id)), 'remove: the profile\'s own folder + its two launch views gone; a sibling profile untouched', rm);
  ok((await op(m, 'remove', { profileId: id })).removed === false, 'remove again: ok, nothing there (removed:false)');
  const bad = await op(m, 'remove', { profileId: '../../etc' });
  ok(bad.ok === false && bad.code === 'bad-request', 'remove of a non-id ("../../etc"): bad-request — the machine composes the path from an id only', bad);
  const outside = path.join(ROOT, 'outside'); fs.mkdirSync(outside, { recursive: true }); fs.writeFileSync(path.join(outside, 'keep.txt'), 'k');
  fs.symlinkSync(outside, own);
  const rl = await op(m, 'remove', { profileId: id });
  ok(rl.ok === false && rl.code === 'not_a_folder' && fs.existsSync(path.join(outside, 'keep.txt')), 'a LINK where the folder should be: left as it is, its target untouched (never followed)', rl);
  fs.unlinkSync(own);
}

// ═══ ② THE AGENT CLIENT'S CAPABILITY GATE (the real DeviceManager method) + the daemon's hello ═══
console.log('— ② the capability gate');
{
  const ask = async (caps, action) => { const self = { connect: async () => ({ info: { capabilities: caps } }), _request: async () => ({ result: { ok: true, asked: action } }) }; try { return await DeviceManager.prototype.browserServe.call(self, action, { profileId: 'bp-0a0b0c0d' }); } catch (e) { return { thrown: e.code, message: e.message }; } };
  const old = await ask(['browser-serve', 'browser-builds'], 'remove');
  ok(old.thrown === 'remove_unsupported' && /upgrade the agent/.test(old.message), 'an agent without `browser-remove` is never asked to remove: remove_unsupported by name', old);
  ok((await ask(['browser-serve', 'browser-builds', 'browser-remove'], 'remove')).asked === 'remove' && (await ask(['browser-serve'], 'status')).asked === 'status', 'with the capability it is asked; other ops are unchanged');
  const daemon = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(/capabilities: \[[^\]]*'browser-remove'[^\]]*\]/.test(daemon) && S.BROWSER_SERVE_OPS.includes('remove'), 'the daemon announces `browser-remove`; `remove` is in the shared op table');
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
  R.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => access.forwards() });
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
  ok(c0.status === 404 && /no browser record/.test(c0.json && c0.json.error), 'CONTROL (the base\'s stop-first restart): a never-started paired machine\'s profile answers 404 "no browser record"', c0);
  R.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => access.forwards() });
  const c1 = await call(API, 'POST', `/api/browser/profiles/${p.id}/restart`);
  ok(c1.status === 200 && c1.json.cold === true && c1.json.browser && c1.json.browser.state === 'ready' && mac.st.launches.length === 1 && access.forwards().some((f) => f.hostId === 'dev-mac'), 'the owner STARTS it from cold: 200, started on dev-mac (one launch there), the hub forward up', c1);
  const c2 = await call(API, 'POST', `/api/browser/profiles/${p.id}/restart`);
  ok(c2.status === 200 && c2.json.cold === false && mac.st.launches.length === 2, 'a live one is RESTARTED (stop + start, cold:false) — the one door');
  // 2 · BROWSE IT YOURSELF: his own tab over the HUB FORWARD (never the machine's port), the live view's target
  const before = hubCli().length;
  const b1 = await call(API, 'POST', `/api/browser/profiles/${p.id}/browse`);
  const fwd = access.forwards().find((f) => f.hostId === 'dev-mac');
  const tabCalls = hubCli().slice(before).filter((c) => c.argv[0] === 'tab' && c.argv[1] === 'new');
  ok(b1.status === 200 && b1.json.key === HM.humanKeyFor(p.id) && tabCalls.length === 1 && fwd && tabCalls[0].cdp && tabCalls[0].cdp.includes('127.0.0.1:' + fwd.localPort) && !tabCalls[0].cdp.includes(':' + CDP_PORT + '/'), 'Browse yourself on a paired machine\'s profile: his own tab, opened over the hub forward 127.0.0.1:' + (fwd && fwd.localPort) + ' (not the machine\'s port)', { b1, tabCalls });
  const tg = k.humanTargetFor(b1.json.key);
  ok(tg && tg.ok !== false && tg.profileId === p.id, 'the live view\'s target for his browsing window exists (the view opens on it)', tg);
  const HMc = mutant('src/browser-human.js', "  if (p.host && hostKnown === false) return no('remote_profile'", "  if (p.host) return no('remote_profile'");
  ok(HMc.browseYourselfVerdict({ profile: { id: p.id, label: 'x', host: 'dev-mac' }, hostKnown: true }).code === 'remote_profile' && HM.browseYourselfVerdict({ profile: { id: p.id, label: 'x', host: 'dev-mac' }, hostKnown: true }).ok === true, 'CONTROL (the v1 line): the same verdict refuses remote_profile; this tree answers ok');
  const gone = HM.browseYourselfVerdict({ profile: { id: p.id, label: 'Bank', host: 'dev-gone' }, hostKnown: false });
  ok(gone.code === 'remote_profile' && /not paired with this VibeSpace any more/.test(gone.error), 'a machine this VibeSpace no longer knows: remote_profile, said by name', gone);
  await k.quitHuman(b1.json.key);
  ok(!B.isLiveBrowser(k._reg().browsers[p.id]) && !mac.st.running.size, 'Quit the whole browser: stopped on the machine');
  // 3 · NO BROWSER THERE — said by name, with the one step for THAT platform (start + browse + the dialog's builds)
  const w = k.createProfile({ label: 'On the PC', host: 'dev-win' }, owner);
  const s1 = await call(API, 'POST', `/api/browser/profiles/${w.id}/restart`);
  ok(s1.status === 409 && s1.json.code === 'browser_cli_missing' && s1.json.step && s1.json.step.command === 'npm install -g agent-browser; agent-browser install' && s1.json.step.machine === 'dev-win' && /dev-win: no browser can start on this machine/.test(s1.json.error) && !fs.existsSync(path.join(win.home, '.agent-browser', 'vs-' + w.id)), 'start on a Windows machine with no agent-browser: 409 browser_cli_missing, the PowerShell step + the machine, nothing created there', s1);
  const s2 = await call(API, 'POST', `/api/browser/profiles/${w.id}/browse`);
  ok(s2.status === 409 && s2.json.code === 'browser_cli_missing' && s2.json.step && s2.json.step.shell === 'powershell', 'Browse yourself there: the same refusal by name + its step', s2);
  const bw = await call(API, 'GET', '/api/browser/builds?host=dev-win'), bm = await call(API, 'GET', '/api/browser/builds?host=dev-mac'), bl = await call(API, 'GET', '/api/browser/builds');
  ok(bw.json.ready && bw.json.ready.step.code === 'browser_cli_missing' && bm.json.ready && bm.json.ready.step === null && bl.json.ready === null, 'GET /api/browser/builds?host=: the machine\'s `ready` (dev-win: the step; dev-mac: none); this computer: null', { bw: bw.json.ready, bm: bm.json.ready, bl: bl.json.ready });
  // 4 · DELETE WITH ITS FOLDER THERE (the DELETE route and the panel's Delete… / forget)
  fs.mkdirSync(path.join(mac.home, '.agent-browser', 'vs-' + p.id, 'Default'), { recursive: true });
  const Rd = mutant('src/routes/browser.js', "    const m = typeof k.removeOnMachine === 'function' ? await k.removeOnMachine(req.params.id, { profile: snap }) : null;", '    const m = null;');
  const APId = await serve(Rd);
  const p2 = k.createProfile({ label: 'Control twin', host: 'dev-mac' }, owner);
  fs.mkdirSync(path.join(mac.home, '.agent-browser', 'vs-' + p2.id), { recursive: true });
  const dc = await call(APId, 'DELETE', `/api/browser/profiles/${p2.id}`);
  ok(dc.status === 200 && fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + p2.id)) && !dc.json.machine, 'CONTROL (no machine removal): the record goes, its folder on the machine STAYS and nothing says so');
  R.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => access.forwards() });
  const d1 = await call(API, 'DELETE', `/api/browser/profiles/${p.id}`);
  ok(d1.status === 200 && d1.json.removed === p.id && d1.json.machine && d1.json.machine.removed === true && d1.json.machine.host === 'dev-mac' && !fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + p.id)) && fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + p2.id)), 'DELETE: the record AND its folder on dev-mac gone (the machine\'s own op); another profile\'s folder there untouched', d1.json);
  const l = k.createProfile({ label: 'Old agent box', host: 'dev-lin' }, owner);
  const d2 = await call(API, 'DELETE', `/api/browser/profiles/${l.id}`);
  ok(d2.status === 200 && !k.profile(l.id) && d2.json.machine && d2.json.machine.removed === false && d2.json.machine.code === 'remove_unsupported' && /vs-bp-[0-9a-f]{8} on dev-lin was left there/.test(d2.json.machine.left) && /upgrade the agent/.test(d2.json.machine.left), 'an agent that predates removal: the record goes, the answer says plainly which folder was LEFT on dev-lin and why', d2.json);
  const dn = k.createProfile({ label: 'Offline box', host: 'dev-down' }, owner);
  const d3 = await call(API, 'DELETE', `/api/browser/profiles/${dn.id}`);
  ok(d3.status === 200 && d3.json.machine && d3.json.machine.code === 'host_unavailable' && /was left there/.test(d3.json.machine.left), 'an offline machine: removed here, its folder there named as left', d3.json);
  // the panel's Delete… (the forget route's service): a paired machine's profile — its folder there, said in the ledger
  const T = require('../src/server/browser-trace.js');
  const tr = T.create({ dataDir: DATA, homeDir: HOME, keeper: k, log, sweepEveryMs: 3600e3 });
  const f = k.createProfile({ label: 'Forget me', host: 'dev-mac' }, owner);
  fs.mkdirSync(path.join(mac.home, '.agent-browser', 'vs-' + f.id), { recursive: true });
  const fr = await tr.forgetProfile(f.id, {});
  ok(fr.ok && fr.machine && fr.machine.removed === true && !fs.existsSync(path.join(mac.home, '.agent-browser', 'vs-' + f.id)) && /on dev-mac deleted there/.test(fr.ledger.why) && !/already gone/.test(fr.ledger.why), 'the panel\'s Delete… of a paired machine\'s profile: its folder on dev-mac deleted, the ledger says so (never "already gone")', fr);
  try { tr.stop?.(); } catch { /* none */ }
}

// ═══ ④ THE NEW PROFILE DIALOG'S MACHINE ROW (PURE model) ═══
console.log('— ④ the New profile dialog: a machine with no browser, by name, with its command');
{
  const tEn = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const rows = M.machineChoices({ machines: [{ hostId: 'local' }, { hostId: 'dev-win', label: 'WIN-DESK1', connected: true, capabilities: ['browser-serve'] }, { hostId: 'dev-mac', label: 'Mac', connected: true, capabilities: ['browser-serve'] }, { hostId: 'dev-old', label: 'Old', connected: true, capabilities: ['probe'] }],
    ready: { 'dev-win': { step: { code: 'browser_cli_missing', command: 'npm install -g agent-browser; agent-browser install', shell: 'powershell' } }, 'dev-mac': { step: null } }, t: tEn });
  const rw = rows.find((r) => r.hostId === 'dev-win'), rm = rows.find((r) => r.hostId === 'dev-mac'), ro = rows.find((r) => r.hostId === 'dev-old');
  ok(rw.state === 'needs-browser' && rw.pickable && /agent-browser is not installed on WIN-DESK1/.test(rw.note) && /PowerShell/.test(rw.note) && rw.step.command === 'npm install -g agent-browser; agent-browser install', 'WIN-DESK1 with no CLI: needs-browser, BY NAME, its PowerShell command (copyable), still pickable', rw);
  ok(rm.state === 'ready' && !rm.step && ro.state === 'no-browser', 'a ready machine stays ready; an agent too old keeps its own words');
  const w2 = M.machineStepWords({ code: 'browser_missing', command: 'agent-browser install', shell: 'sh', machine: 'dev-lin' }, { t: tEn });
  ok(w2 && /dev-lin has no Chrome for agent-browser to run/.test(w2.note) && /terminal/.test(w2.note) && w2.command === 'agent-browser install' && /No browser on dev-lin yet/.test(w2.title), 'a refused start\'s step in words: the machine, the missing Chrome, where to type, the command');
  ok(M.machineStepWords(null) === null && M.MACHINE_STATES.includes('needs-browser'), 'no step ⇒ no words; the state is in the closed set');
  // the Agent browser panel's row: a paired machine's profile is the user's to browse and delete (never this machine's sweep's)
  const TR = require('../src/browser-trace.js');
  const rp = { id: 'bp-0a0b0c0e', label: 'Remote', provider: 'chromium', host: 'dev-mac', dir: null };
  const row = TR.housekeepingVerdict({ profiles: [rp], now: Date.now() })[0];
  const TRc = mutant('src/browser-trace.js', '    if (!q.ok && !remoteOwned(p, rowOf)) return', '    if (!q.ok) return');
  const rowC = TRc.housekeepingVerdict({ profiles: [rp], now: Date.now() })[0];
  ok(row.state === 'kept' && row.canBrowse && row.canForget && TR.forgetVerdict({ profile: rp }).ok && rowC.state === 'not-ours' && !rowC.canForget, 'the panel row of a paired machine\'s profile: kept, Browse yourself + Delete… offered (CONTROL: the base row is not-ours — no Browse, Delete greyed)', { row, rowC });
  ok(TR.queueVerdict(rp).code === 'not_ours' && TR.forgetVerdict({ profile: rp, browsers: { [rp.id]: { state: 'ready' } } }).code === 'running', 'this machine\'s sweep still never judges it (queueVerdict not_ours); a running one is refused first');
}

// ═══ ⑤ VERIFY R1: a start racing a delete · this computer's restart unchanged · two lines an inline comment had eaten ═══
console.log('— ⑤ verify r1');
{
  const setupWith = (Rm, extra = {}) => Rm.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, cloakPlan: () => B.cloakservePlan({ enabled: false }), forwards: () => access.forwards(), ...extra });
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
    const r = k.removeProfile(req.params.id, { unpin });
    const m = typeof k.removeOnMachine === 'function' ? await k.removeOnMachine(req.params.id, { profile: snap }) : null;
    res.json({ ...r, unpinned: u.cleared, ...(m ? { machine: m } : {}) });`, `    const m = typeof k.removeOnMachine === 'function' ? await k.removeOnMachine(req.params.id) : null;
    res.json({ ...k.removeProfile(req.params.id, { unpin }), unpinned: u.cleared, ...(m ? { machine: m } : {}) });`);
  const APIr = await serve(Rr);
  const rc = await raceOnce(APIr);
  ok(rc.st.state === 'ready' && rc.d.status === 409 && rc.d.json.code === 'running' && rc.kept && rc.running, 'CONTROL (the machine asked BEFORE the record goes): the start lands in between — the folder\'s logins are gone there, yet the Delete answers 409 running and the profile stays listed', { st: rc.st, d: rc.d.json });
  setupWith(R);
  const r1 = await raceOnce(API);
  ok(r1.st.thrown === 'not-found' && r1.d.status === 200 && r1.d.json.machine && r1.d.json.machine.removed === true && !r1.kept && !r1.running, 'a Delete racing an agent\'s first command: the record went first (that start is not-found), the folder there deleted, nothing runs there', { st: r1.st, d: r1.d.json });
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
  ok(sf.thrown === 'not-found' && fr.ok && fr.machine && fr.machine.removed === true && !k.profile(pf.id) && !mac.st.running.has('vs-' + pf.id), 'the panel\'s Delete… racing a start: the same order (record first, then the machine)', { sf, fr: fr && fr.machine });
  try { tr2.stop?.(); } catch { /* none */ }
  // F3 · THIS computer's never-started profile: the restart route still answers 404 "no browser record" (no launch, no `cold`)
  const here = k.createProfile({ label: 'Here' }, owner);
  const n0 = hubCli().length;
  const h1 = await call(API, 'POST', `/api/browser/profiles/${here.id}/restart`);
  ok(h1.status === 404 && /no browser record/.test(h1.json.error) && Object.keys(h1.json).join() === 'error,code' && hubCli().length === n0, 'this computer\'s never-started profile: restart answers 404 "no browser record" byte-for-byte as before — nothing launched', h1);
  const Rh = mutant('src/routes/browser.js', "if (!(remote && e && e.code === 'not-found')) throw e;", "if (!(e && e.code === 'not-found')) throw e;");
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
  ok(a1.status === 404 && a1.json.minted && a1.json.minted.key === 'bk-1a2b3c4d' && a2.status === 404 && !a2.json.minted, 'a refused answer still carries the key this call minted (CONTROL: the comment-eaten line drops it)', { a1: a1.json, a2: a2.json });
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
  ok(e1 && e1.code === 'backend_unavailable' && /can't run on this computer right now/.test(e1.message) && e2 && !/can't run on this computer right now/.test(e2.message), 'Browse yourself, its backend unavailable: the verdict\'s own words (CONTROL: without `control` the start\'s raw sentence)', { e1: e1 && e1.message, e2: e2 && e2.message });
}

console.log(`\ntest-remote-profile-start: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
