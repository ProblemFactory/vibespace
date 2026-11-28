#!/usr/bin/env node
// test-browser-keeper-launch — THE HEAVY TWIN of test-browser-keeper (B-7e49, lane login-request-card, 主开发 r2535: a leg that starts a
// real child may go to a heavy twin with its table fast). Every leg that STARTS the keeper's node stand-ins — the fake Chrome, the fake
// driver, the fake display keeper — MOVED VERBATIM with its stubs: ② the real spawn + poll (new / stale / torn / missing / exit), ④ the
// keeper on the attach road (start, calls, stop, Chrome's own exit, the shared-root control, cdp_port_missing at the keeper beside the
// others, the heal, the engine block, ⑦ the display holders, the driver road, a display that never came up, the boot, the reconcile),
// B-8b87 the WebRTC policy beside a proxy, B-9584 U2b a profile's own language and zone. The fast suite keeps the TABLE and the TEXT
// pins, and a pin that this file holds these sections. It runs node and its own stand-ins only (no X, no real browser).
// The original description follows.
// lane one-browser-b1 (design q-026 r1 §2.1 / §2.4 / §3 row B1, 2026-10-16): THE ATTACH ROAD — on a machine with xpra the
// keeper spawns Google Chrome ITSELF on a display-only session and agent-browser attaches with `--cdp <port>`. FAST: a fake
// Chrome (node), a fake driver and a fake display keeper — no X, no real browser (the real one is test-browser-live ⑱).
//   ① the argv table + the census over the argv builder (--disable-sync FORBIDDEN, the two flags required) + RED controls
//   ② the port file's three states (PURE table + the real spawn/poll over the fake Chrome: new / stale / missing / exit) + RED
//   ③ the socket dir per config (the rule, the owned-dir check, the call shape) + RED: a shared dir lets close --all cross
//   ④ the keeper: start on the attach road, every driver call `--cdp` in the config's own root, stop, Chrome's own exit, the
//     driver road without xpra (said), a display that never came up, cdp_port_missing at the keeper, the boot, the reconcile
//   ①b lane hotfix-attach-engine-args (2.369.375): an ENGINE's forbidden switch is DROPPED and SAID (never the launch refused);
//     the hub's own forbidden switch is still RED; every launch the road does not start is journaled by name (④'s engine block)
//   ⑦ lane browser-display-holders: the display record reads the conversations attached (holders); a PERSON's stop of the
//     display stamps the record, tells each holder once, and is NEVER healed (RED control: the keeper without the gate heals
//     it on the next tick); the next command starts a new record with no stamp
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, deadPort, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AT = require('../src/browser-attach.js');
const ATL = require('../src/server/browser-attach-launch.js');
const B = require('../src/browser-profiles.js');
const BE = require('../src/browser-stderr.js');
const F = require('../src/browser-facts.js');
const DA = require('../src/desktop-apps.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** a wait that names its effect (lane fast-debt-clear): poll `f` until it holds, at most `ms` — the assert after it judges */
const until = async (f, ms = 3000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await sleep(10); return f(); };
const S = scratch('bkr'); fs.mkdirSync(S, { recursive: true });
const DP = await deadPort(); // the port the PURE rows name: one the kernel just released, never a fixed one (§81)
/** A mutant copy of a PURE module (one replace, asserted to apply) — the RED controls' instrument. */
function mutant(rel, from, to) {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  if (!src.includes(from)) throw new Error(`mutant anchor missing in ${rel}: ${from}`);
  const f = path.join(S, 'mut-' + Math.random().toString(36).slice(2) + '-' + path.basename(rel));
  fs.writeFileSync(f, src.replace(from, to));
  return require(f);
}
const quiet = BE.QUIET_LOG_ARGS;   // (①'s, read by ④'s argv leg)

// ═══ ② THE PORT FILE ═══
console.log('— ② the port file\'s three states (the real spawn over a fake Chrome)');
// the real spawn + poll, over a fake Chrome (node): the modes ok / stale / never / exit
const FAKE_BIN = path.join(S, 'bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const STATE = path.join(S, 'state'); fs.mkdirSync(STATE, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN, 'google-chrome'), `#!${process.execPath}
const http = require('http'), fs = require('fs'), path = require('path');
const ST = process.env.FAKE_STATE; const args = process.argv.slice(2);
const udd = (args.find((a) => a.startsWith('--user-data-dir=')) || '').slice(16);
let mode = 'ok'; try { mode = fs.readFileSync(path.join(ST, 'chrome-mode'), 'utf8').trim(); } catch {}
try { mode = fs.readFileSync(path.join(ST, 'chrome-mode-' + udd.replace(/[^A-Za-z0-9]/g, '_')), 'utf8').trim(); } catch {} // one profile's own mode (the cdp_port_missing keeper leg)
// B-7e49: its port is written 15 ms after it listens; a leg that reads the WAIT itself (② new: r.ms >= 100) sets chrome-delay (120 ms)
let delay = 15; try { delay = Number(fs.readFileSync(path.join(ST, 'chrome-delay'), 'utf8').trim()) || delay; } catch {}
fs.appendFileSync(path.join(ST, 'chrome.log'), JSON.stringify({ pid: process.pid, args, mode, DISPLAY: process.env.DISPLAY || null, XAUTHORITY: process.env.XAUTHORITY || null, TMPDIR: process.env.TMPDIR || null, TZ: process.env.TZ || null, ab: Object.keys(process.env).filter((k) => k.startsWith('AGENT_BROWSER_')) }) + '\\n');
process.on('SIGTERM', () => process.exit(0));
if (mode === 'exit') { console.error('ERROR: the profile appears to be in use by another Google Chrome process'); process.exit(21); }
const pfile = path.join(udd, 'DevToolsActivePort');
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ Browser: 'Chrome/154.0.8037.57', webSocketDebuggerUrl: 'ws://127.0.0.1:' + srv.address().port + '/devtools/browser/fake-0001' })); });
srv.listen(0, '127.0.0.1', () => setTimeout(() => {
  if (mode === 'ok') fs.writeFileSync(pfile, srv.address().port + '\\n/devtools/browser/fake-0001\\n');
  // the stale file WHOLE (lane bl-windows): written aside, backdated, renamed in — never a fresh file for a moment (the launcher reads
  // mtime and text apart: a poll between a write and its backdate took the dead port 9 — a box-zone red); a stall where the old
  // window was proves it shut. 'stale-torn' = the old order (write, then backdate) with a stall between: the control
  if (mode === 'stale') { const tmp = pfile + '.tmp'; fs.writeFileSync(tmp, '9\\n/devtools/browser/dead-0001\\n'); const t = new Date(Date.now() - 3600e3); fs.utimesSync(tmp, t, t); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); fs.renameSync(tmp, pfile); }
  if (mode === 'stale-torn') { fs.writeFileSync(pfile, '9\\n/devtools/browser/dead-0001\\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); const t = new Date(Date.now() - 3600e3); fs.utimesSync(pfile, t, t); }
}, delay));
`, { mode: 0o755 });
const chromeLog = () => { try { return fs.readFileSync(path.join(STATE, 'chrome.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const setMode = (m) => fs.writeFileSync(path.join(STATE, 'chrome-mode'), m);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const baseEnv = { PATH: `${FAKE_BIN}:/usr/bin:/bin`, HOME: S, FAKE_STATE: STATE };
ok(ATL.chromeExecutable(baseEnv) === path.join(FAKE_BIN, 'google-chrome') && ATL.chromeExecutable({ PATH: path.join(S, 'nobin') }) === null, 'the executable: google-chrome first on the keeper\'s PATH (never process.env\'s); none ⇒ null');
const PD = path.join(S, 'profile-io'); fs.mkdirSync(PD, { recursive: true });
setMode('ok');
fs.writeFileSync(path.join(PD, 'DevToolsActivePort'), '9\n/devtools/browser/dead-0000\n'); // a killed Chrome's file — deleted BEFORE the spawn
fs.writeFileSync(path.join(STATE, 'chrome-delay'), '120');   // this leg reads the spawn's WAIT (r.ms >= 100): the port comes 120 ms after the listen
let r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: ['--remote-debugging-port=0', `--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log') });
ok(gateOf(r.ok) && r.port > 9 && r.wsPath === '/devtools/browser/fake-0001' && gateOf(alive(r.pid)) && r.ms >= 100, 'new: the spawn deletes the stale file, waits for the NEW one and answers its port (never the dead 9)', { ...r, child: undefined });
fs.rmSync(path.join(STATE, 'chrome-delay'), { force: true });
try { process.kill(r.pid, 'SIGTERM'); } catch { }
setMode('stale');
let t = Date.now();
r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: [`--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log'), waitMs: 900 });
const stalePid = chromeLog().pop().pid; await until(() => !alive(stalePid));
ok(!r.ok && r.code === 'cdp_port_missing' && gateOf(/stale one/.test(r.error)) && Date.now() - t >= 900 && !alive(stalePid), 'stale: a port file older than the spawn is never taken — cdp_port_missing at the deadline, the Chrome it spawned ended', r);
// CONTROL (lane bl-windows — a race proven by a stall placed in its window, never by the clock): the fixture's OLD order, the
// file written fresh and backdated only after a stall ⇒ the launcher takes the dead port 9 — the box-zone red's own values
setMode('stale-torn');
r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: [`--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log'), waitMs: 900 });
const tornPid = chromeLog().pop().pid; try { process.kill(tornPid, 'SIGKILL'); } catch { } await until(() => !alive(tornPid), 5000);   // B-7e49: its 1500 ms stall holds a SIGTERM until it ends; the launcher's answer is already read
ok(r.ok === true && r.port === 9 && r.wsPath === '/devtools/browser/dead-0001' && !alive(tornPid), 'CONTROL — the stale file written fresh and backdated after a stall (the fixture\'s old order): the launcher takes the dead port 9 — the leg above writes it whole and runs WITH a stall in that window', { ...r, child: undefined });
setMode('never');
r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: [`--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log'), waitMs: 600 });
const neverPid = chromeLog().pop().pid; await until(() => !alive(neverPid));
ok(!r.ok && r.code === 'cdp_port_missing' && !/stale one/.test(r.error) && !alive(neverPid), 'missing: no file at all ⇒ cdp_port_missing, the Chrome ended', r);
setMode('exit');
r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: [`--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log'), waitMs: 3000 });
ok(!r.ok && r.code === 'launch_failed' && gateOf(/exit code 21/.test(r.error)) && verdictOf(/in use by another Google Chrome/.test(r.error)), 'an early exit is said with its code and its last words (the log FILE, never a pipe) — launch_failed, never the deadline\'s cdp_port_missing: it was seen before the deadline', r);

const SOCKBASE = path.join(S, 's'); fs.mkdirSync(SOCKBASE, { recursive: true }); // production's base is /tmp (it exists)   // (③'s, the keeper's socket base)

// ═══ ④ THE KEEPER ═══
console.log('— ④ the keeper on the attach road');
// the fake DRIVER: logs every call; `--cdp` is taken off and recorded; `close --all` closes EVERY session under its socket
// root (the M0 worst case — the real 0.38.2 scopes it to the namespace: tools/probe1.sh e1), so only a per-config root
// keeps another config's sessions; a call WITHOUT --cdp that opens is a LAUNCH (the driver road), logged
fs.writeFileSync(path.join(FAKE_BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ST = process.env.FAKE_STATE; let argv = process.argv.slice(2); let cdp = null;
if (argv[0] === '--cdp') { cdp = argv[1]; argv = argv.slice(2); }
const E = (k) => process.env[k] || null;
const root = E('AGENT_BROWSER_SOCKET_DIR') || path.join(ST, 'default-root'); const ns = E('AGENT_BROWSER_NAMESPACE') || 'default'; const sess = E('AGENT_BROWSER_SESSION') || 'default';
const out = (o) => { console.log(JSON.stringify(o)); };
if (argv[0] === '--version') { console.log('agent-browser 0.38.2'); process.exit(0); }
fs.appendFileSync(path.join(ST, 'ab.log'), JSON.stringify({ argv, cdp, ns, sess, root: E('AGENT_BROWSER_SOCKET_DIR'), profile: E('AGENT_BROWSER_PROFILE'), config: E('AGENT_BROWSER_CONFIG'), envCdp: E('AGENT_BROWSER_CDP'), headed: E('AGENT_BROWSER_HEADED') }) + '\\n');
const sdir = path.join(root, 'fake-sessions', ns); const sfile = path.join(sdir, sess);
const dstate = path.join(ST, 'driver-' + ns + '.json');
const readD = () => { try { return JSON.parse(fs.readFileSync(dstate, 'utf8')); } catch { return null; } };
const aliveP = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
if (argv[0] === 'close' && argv[1] === '--all') { fs.rmSync(path.join(root, 'fake-sessions'), { recursive: true, force: true }); const d = readD(); if (!cdp && d && aliveP(d.pid)) { try { process.kill(d.pid, 'SIGKILL'); } catch {} } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (argv[0] === 'session' && argv[1] === 'info') { const d = readD(); const act = !cdp && !!(d && aliveP(d.pid)); out({ success: true, data: { active: act, pid: act ? d.pid : null, socketDir: path.join(root, 'run'), version: '0.38.2' } }); process.exit(0); }
if (argv[0] === 'get' && argv[1] === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:9/devtools/browser/fake-driver' } }); process.exit(0); }
if (!cdp && !E('AGENT_BROWSER_CDP') && argv[0] === 'open') { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); fs.writeFileSync(dstate, JSON.stringify({ pid: c.pid })); fs.appendFileSync(path.join(ST, 'launches.log'), JSON.stringify({ ns, pid: c.pid }) + '\\n'); out({ success: true, data: { url: 'about:blank' } }); process.exit(0); }
fs.mkdirSync(sdir, { recursive: true }); fs.writeFileSync(sfile, String(cdp || E('AGENT_BROWSER_CDP')));
out({ success: true, data: { ok: true, tabs: [] } }); process.exit(0);
`, { mode: 0o755 });
const abLog = () => { try { return fs.readFileSync(path.join(STATE, 'ab.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const launches = () => { try { return fs.readFileSync(path.join(STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const sessionsUnder = (root) => { try { return fs.readdirSync(path.join(root, 'fake-sessions')).flatMap((n) => fs.readdirSync(path.join(root, 'fake-sessions', n)).map((x) => `${n}/${x}`)); } catch { return []; } };
// the fake DISPLAY KEEPER (the desktop keeper's five methods)
const dcalls = []; const dlive = new Map(); let dn = 0; let fakeXpra = true; let fakeDisplayFail = false;
const DK = {
  facts: async () => ({ bins: fakeXpra ? { xpra: '/usr/bin/xpra', xauth: '/usr/bin/xauth' } : { xpra: null, xauth: '/usr/bin/xauth' } }),
  launchDisplay: async (body) => { dcalls.push(['launch', body.forBrowser, body.label]); if (fakeDisplayFail) return { id: 'da-fail', state: 'failed', lastError: 'xpra exited (code 1)' }; const id = `da-fake-${++dn}`; const rec = { id, kind: DA.DISPLAY_FOR_BROWSER, forBrowser: body.forBrowser, state: 'ready', display: ':' + (90 + dn), label: DA.displayForBrowserLabel(body.label) }; dlive.set(id, rec); return { ...rec }; },
  x11EnvFor: (id) => (dlive.has(id) ? { DISPLAY: dlive.get(id).display, XAUTHORITY: path.join(S, 'xauth-' + id) } : null),
  stop: async (id, o) => { dcalls.push(['stop', id, o && o.why]); const r0 = dlive.get(id); dlive.delete(id); return r0 ? { ...r0, state: 'exited' } : null; },
  liveRecords: () => [...dlive.values()],
};
const K = require('../src/server/browser-keeper.js');
const DATA = path.join(S, 'data'); const HOME = path.join(S, 'home'); fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
const rtEnv = { PATH: `${FAKE_BIN}:/usr/bin:/bin`, HOME, FAKE_STATE: STATE, XDG_RUNTIME_DIR: path.join(S, 'xdg'), AGENT_BROWSER_SESSION: 'leaked-from-the-server' };
const settings = { 'browser.idleTimeoutMs': 600000 };
const journal = [];
const jlog = { log(m) { journal.push(String(m)); }, warn(m) { journal.push(String(m)); }, error() { } };
const mk = (extra = {}) => K.create({ dataDir: DATA, homeDir: HOME, env: () => rtEnv, serverSetting: (x) => settings[x], serverNotice: () => 1, liveKeys: () => new Set(), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: jlog, install: false, tickMs: 3600e3, displaySessions: DK, attachSocketBase: SOCKBASE, ...extra });
let k = mk();
const pA = k.createProfile({ label: 'Work' }, { owner: { kind: 'instance', id: null } });
const pB = k.createProfile({ label: 'Bank' }, { owner: { kind: 'instance', id: null } });
setMode('ok'); fs.writeFileSync(path.join(STATE, 'chrome.log'), '');
let vA = await k.start(pA.id, { why: 'test' });
const recA = k._reg().browsers[pA.id];
const cl = chromeLog().pop();
ok(vA.state === 'ready' && recA.launch === 'attach' && gateOf(/own display \(xpra\)/.test(recA.launchWhy)) && gateOf(recA.displaySession) && recA.displaySession.id === 'da-fake-1' && recA.displaySession.display === ':91', 'start: the ATTACH road on a machine with xpra — the record says which road and why, and names its display session', { launch: recA.launch, why: recA.launchWhy, ds: recA.displaySession });
ok(dcalls[0][0] === 'launch' && dcalls[0][1] === pA.id && dcalls[0][2] === 'Work' && recA.pid === cl.pid && gateOf(alive(recA.pid)) && verdictOf(Number.isInteger(recA.starttime)), 'the display-only session asked for THIS profile; the record\'s process IS the spawned Chrome (pid + starttime)', { dcalls, pid: recA.pid, cl: cl.pid });
ok(JSON.stringify(cl.args) === JSON.stringify(AT.attachArgv({ profileDir: pA.dir, mark: B.keeperMarkArg(pA.id), quiet }).argv), 'Chrome ran with the argv table\'s argv for its profile (mark + quiet switches; no --disable-sync)', cl.args);
ok(cl.DISPLAY === ':91' && cl.XAUTHORITY === path.join(S, 'xauth-da-fake-1') && cl.ab.length === 0 && gateOf(cl.TMPDIR) && verdictOf(cl.TMPDIR.startsWith(DATA)), 'its env: the display session\'s DISPLAY + XAUTHORITY, the keeper\'s short TMPDIR, NO AGENT_BROWSER_* key (a leaked server one dropped)', cl);
ok(gateOf(B.isLoopbackCdpUrl(recA.cdpUrl)) && gateOf(recA.cdpUrl.endsWith('/devtools/browser/fake-0001')) && recA.cdpPort === Number(new URL(recA.cdpUrl).port) && recA.browser.pid === recA.pid && recA.cdpBrowser === 'Chrome/154.0.8037.57', 'the cdpUrl = the NEW port file\'s ws url (the endpoint asked: its build recorded)', { cdpUrl: recA.cdpUrl, port: recA.cdpPort, b: recA.cdpBrowser });
ok(recA.socketDir === path.join(SOCKBASE, `vs-ab-${process.getuid()}`, pA.id) && verdictOf(fs.statSync(recA.socketDir).isDirectory()), 'its socket dir is the config\'s own', recA.socketDir);
ok(launches().length === 0 && verdictOf(abLog().every((c) => c.argv[0] !== 'open')), 'the driver never launched a browser for it');
// every driver call on the attach record: --cdp first, the config's root, never a directory or the LAUNCH file
const o = await k.leaseCliOpts(pA.id, 'bk-00000001');
ok(gateOf(o) && o.extraEnv.AGENT_BROWSER_CDP === recA.cdpUrl, 'a lease\'s options carry the record\'s url (leaseCdpUrl unchanged)', o);
const rt0 = abLog().length;
// the keeper's own (configured) runtime under the LEASE's session — the shape of every agentTabAct / tab / stream call
await k._runtime.exec(k.nsOf(pA.id), ['tab', 'list', '--json'], o);
await k._runtime.streamPort(k.nsOf(pA.id), { session: o.session, extraEnv: o.extraEnv });
const viaRuntime = abLog().slice(rt0);
ok(viaRuntime.length >= 2 && verdictOf(viaRuntime.every((c) => c.cdp === recA.cdpUrl && c.cdp === o.extraEnv.AGENT_BROWSER_CDP && c.root === recA.socketDir && c.profile === null && c.envCdp === null && c.headed === null && c.ns === 'vs-' + pA.id && c.sess === o.session && path.basename(c.config || '') === 'machine.json')), 'a lease-session call (tab list, the stream\'s status) runs `--cdp <the SAME ws url the agent\'s pairs carry>` FIRST in the config\'s own root — no profile dir, no env CDP, no launch key, the lease file', viaRuntime);
fs.mkdirSync(path.join(SOCKBASE, `vs-ab-${process.getuid()}`, pB.id), { recursive: true });
// B's session lives in ITS root (another config) — must survive A's stop
fs.mkdirSync(path.join(SOCKBASE, `vs-ab-${process.getuid()}`, pB.id, 'fake-sessions', 'vs-' + pB.id), { recursive: true });
fs.writeFileSync(path.join(SOCKBASE, `vs-ab-${process.getuid()}`, pB.id, 'fake-sessions', 'vs-' + pB.id, 'vs-bk-00000002'), 'x');
fs.mkdirSync(path.join(recA.socketDir, 'fake-sessions', 'vs-' + pA.id), { recursive: true });
fs.writeFileSync(path.join(recA.socketDir, 'fake-sessions', 'vs-' + pA.id, 'vs-bk-00000001'), 'x');
const chromeA = recA.pid;
const before = abLog().length;
vA = await k.stop(pA.id, { why: 'user' });
const stopCalls = abLog().slice(before);
const closeAll = stopCalls.find((c) => c.argv[0] === 'close' && c.argv[1] === '--all');
ok(gateOf(closeAll) && closeAll.cdp === recA.cdpUrl && closeAll.root === recA.socketDir && closeAll.profile === null && closeAll.envCdp === null && closeAll.headed === null && closeAll.ns === 'vs-' + pA.id, 'stop: the driver\'s close --all ran `--cdp <its ws url>` in the config\'s own root, no profile dir, no launch key', closeAll);
ok(gateOf(closeAll) && gateOf(closeAll.config) && path.basename(closeAll.config) === 'machine.json', '…naming the LEASE file (the one the agent\'s own commands name), never the launch file machine-<id>.json', closeAll && closeAll.config);
await until(() => !alive(chromeA) && dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fake-1'));
ok(vA.state === 'stopped' && !alive(chromeA) && gateOf(dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fake-1')) && !dlive.has('da-fake-1'), 'the Chrome was ended by its identity and its display session went with it', { state: vA.state, dcalls });
ok(sessionsUnder(recA.socketDir).length === 0 && sessionsUnder(path.join(SOCKBASE, `vs-ab-${process.getuid()}`, pB.id)).length === 1, 'close --all ended config A\'s sessions and NOT config B\'s (another root)', { a: sessionsUnder(recA.socketDir), b: sessionsUnder(path.join(SOCKBASE, `vs-ab-${process.getuid()}`, pB.id)) });
// RED control: one shared root for both configs ⇒ the same close --all ends B's session too
{
  const shared = path.join(S, 'shared-root');
  fs.mkdirSync(path.join(shared, 'fake-sessions', 'vs-' + pB.id), { recursive: true }); fs.writeFileSync(path.join(shared, 'fake-sessions', 'vs-' + pB.id, 'vs-bk-00000002'), 'x');
  const { execFileSync } = await import('node:child_process');
  const c = AT.attachCall(['close', '--all'], { AGENT_BROWSER_NAMESPACE: 'vs-' + pA.id, AGENT_BROWSER_SESSION: 'vs-' + pA.id, FAKE_STATE: STATE, PATH: rtEnv.PATH }, { cdp: 'ws://127.0.0.1:9/devtools/browser/x', socketDir: shared });
  execFileSync(path.join(FAKE_BIN, 'agent-browser'), c.args, { env: c.env });
  ok(sessionsUnder(shared).length === 0, 'CONTROL: configs sharing one socket root ⇒ A\'s close --all ended B\'s session (the crossing the per-config root prevents)');
}
// cdp_port_missing AT THE KEEPER (judged below, after the heal and the two driver-road legs): a Chrome that never writes
// its port waits out the product's real 5 s PORT_WAIT_MS. Lane fast-debt-clear: it runs on its OWN keeper (its own data
// dir, its own fake display keeper, its mode in its own profile's file), so the deadline elapses BESIDE the legs between
// — they share no keeper, record, display session, display count, mode or tick with it (the heal's reconcile walks DK's
// sessions, never this one's); the stale / missing legs above keep their own (shorter) deadlines
const isolatedDisplays = (tag) => { const calls = [], live = new Map(); let n = 0; return { calls, live, DK: {
  facts: async () => ({ bins: { xpra: '/usr/bin/xpra', xauth: '/usr/bin/xauth' } }),
  launchDisplay: async (body) => { calls.push(['launch', body.forBrowser, body.label]); const id = `da-${tag}-${++n}`; const rec = { id, kind: DA.DISPLAY_FOR_BROWSER, forBrowser: body.forBrowser, state: 'ready', display: ':' + (190 + n), label: DA.displayForBrowserLabel(body.label) }; live.set(id, rec); return { ...rec }; },
  x11EnvFor: (id) => (live.has(id) ? { DISPLAY: live.get(id).display, XAUTHORITY: path.join(S, 'xauth-' + id) } : null),
  stop: async (id, o) => { calls.push(['stop', id, o && o.why]); const r0 = live.get(id); live.delete(id); return r0 ? { ...r0, state: 'exited' } : null; },
  liveRecords: () => [...live.values()],
} }; };
const DM = isolatedDisplays('mute');
const kM = mk({ dataDir: path.join(S, 'data-mute'), displaySessions: DM.DK });
const pE = kM.createProfile({ label: 'Mute' }, { owner: { kind: 'instance', id: null } });
fs.writeFileSync(path.join(STATE, 'chrome-mode-' + pE.dir.replace(/[^A-Za-z0-9]/g, '_')), 'never');
const tE = Date.now();
const muteRun = kM.start(pE.id, { why: 'test' }).then(() => null, (e) => e);
// Chrome's OWN exit (the window closed / a crash) ⇒ the tick records it, its display goes with it
setMode('ok');
let vB = await k.start(pB.id, { why: 'test' });
const recB = k._reg().browsers[pB.id];
ok(vB.state === 'ready' && recB.launch === 'attach' && recB.displaySession.id === 'da-fake-2', 'a second config starts on its own display session', recB.displaySession);
process.kill(recB.pid, 'SIGKILL'); await until(() => !alive(recB.pid));
await k.tick();
await until(() => k._reg().browsers[pB.id].state === 'stopped' && dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fake-2'), 1000);
const recB2 = k._reg().browsers[pB.id];
ok(recB2.state === 'stopped' && gateOf(/the browser exited/.test(recB2.lastError)) && verdictOf(dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fake-2')), 'its Chrome died ⇒ the tick records "the browser exited" and stops its display session', { state: recB2.state, err: recB2.lastError });
// THE HEAL: an attach Chrome that dies under a HOLDER is started again by the tick — bounded by the driver road's budget
{
  const liveH = new Set(['bk-0000000e']);
  const kh = mk({ dataDir: path.join(S, 'data-heal'), liveKeys: () => liveH });
  const pH = kh.createProfile({ label: 'Held' }, { owner: { kind: 'instance', id: null } });
  setMode('ok');
  let held = null; try { held = await kh.attach({ profileId: pH.id, browserKey: 'bk-0000000e', by: 'agent' }); } catch (e) { held = { error: e && e.message }; }
  const holders = () => kh.leasesOn(pH.id).length;
  ok(gateOf(kh._reg().browsers[pH.id]) && kh._reg().browsers[pH.id].launch === 'attach' && holders() === 1, 'a conversation holds an attach browser (a lease)', held && held.error);
  const pids = [kh._reg().browsers[pH.id].pid];
  for (let i = 1; i <= 3; i++) {
    process.kill(pids[pids.length - 1], 'SIGKILL'); await until(() => !alive(pids[pids.length - 1]), 2000);   // B-7e49: the death landed (the tick reads it by its pid), not a fixed 250 ms
    await kh.tick();
    const back = await (async () => { for (let j = 0; j < 80; j++) { const r0 = kh._reg().browsers[pH.id]; if (r0 && r0.state === 'ready' && r0.pid !== pids[pids.length - 1] && alive(r0.pid)) return r0; await sleep(100); } return null; })();
    ok(gateOf(back) && back.launch === 'attach', `heal ${i}: its Chrome killed under the lease ⇒ the tick starts it again on the attach road (a new Chrome pid ${back && back.pid}, a new display session ${back && back.displaySession && back.displaySession.id})`);
    if (!back) break;
    pids.push(back.pid);
  }
  process.kill(pids[pids.length - 1], 'SIGKILL'); await until(() => !alive(pids[pids.length - 1]), 2000);
  await kh.tick(); await until(() => { const r0 = kh._reg().browsers[pH.id]; return r0 && r0.state === 'stopped' && /closed 3 times in 10 min/.test(r0.lastError || ''); }, 2000);   // B-7e49: the budget's own words, or the leg below is red
  const last = kh._reg().browsers[pH.id];
  ok(last.state === 'stopped' && verdictOf(/closed 3 times in 10 min, so it is not started again by itself; the next command starts it/.test(last.lastError || '')), 'the 4th closure inside the window: NOT started again (the budget), said on the record', last.lastError);
  const pU = kh.createProfile({ label: 'Unheld' }, { owner: { kind: 'instance', id: null } });
  await kh.start(pU.id, { why: 'test' });
  const pidU = kh._reg().browsers[pU.id].pid;
  process.kill(pidU, 'SIGKILL'); await until(() => !alive(pidU), 2000); await kh.tick(); await sleep(400);   // (the 400 ms stays: «no heal» is a window nothing may start in)
  ok(kh._reg().browsers[pU.id].state === 'stopped' && !kh._reg().browsers[pU.id].displaySession === false && !dlive.has(kh._reg().browsers[pU.id].displaySession.id), 'nobody holds it ⇒ no heal (stopped, its display gone; the next command starts it)');
  await kh.stop(pH.id, { why: 'user' }).catch(() => { });
}
// lane engine-plugin: a profile on a browser ENGINE takes the ATTACH road too — the engine's program is the one spawned, its own
// arguments go IN through the argv builder (the same census), the record says the engine + its version
{
  const KDIR = path.join(S, 'kernel'); fs.mkdirSync(KDIR, { recursive: true });
  const KERN = path.join(KDIR, 'chrome');
  fs.writeFileSync(KERN, `#!/bin/sh\necho "$0" >> "$FAKE_STATE/kernel-ran.log"\nexec ${path.join(FAKE_BIN, 'google-chrome')} "$@"\n`, { mode: 0o755 });
  const EID = 'vibespace.custom-browser';
  const fact = { installed: true, executable: true, binaryPath: KERN, version: 'Chromium 150.0.7871.186 fake', protocol: 1, kinds: [], features: ['surfaces'], label: 'Fake engine' };
  const asked = [];
  const REG = { rows: () => [{ id: EID, label: 'Fake engine', family: 'manifest', version: '0.0.1' }], probe: async (id) => { asked.push(['probe', id]); return { ok: true, fact: { ...fact } }; }, launchOptions: async (id, x) => { asked.push(['launchOptions', id, x.profileId, x.binaryPath, x.userDataDir]); return { ok: true, launch: { executablePath: KERN, args: ['--vibespace-engine=attach-leg'], env: {} } }; } };
  const ke = mk({ dataDir: path.join(S, 'data-engine'), engines: REG });
  const pE = ke.createProfile({ label: 'Engine', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
  setMode('ok');
  const n0 = chromeLog().length;
  const vE = await ke.start(pE.id, { why: 'test' });
  const recE = ke._reg().browsers[pE.id];
  const clE = chromeLog().slice(n0).pop();
  let ran = ''; try { ran = fs.readFileSync(path.join(STATE, 'kernel-ran.log'), 'utf8'); } catch { ran = ''; }
  ok(vE.state === 'ready' && recE.launch === 'attach' && recE.executable === KERN && verdictOf(ran.includes(KERN)), 'an engine profile on the attach road: the ENGINE\'s program is the one spawned (rec.executable = its path)', { launch: recE.launch, exe: recE.executable, ran });
  ok(gateOf(clE) && JSON.stringify(clE.args) === JSON.stringify(AT.attachArgv({ profileDir: pE.dir, mark: B.keeperMarkArg(pE.id), quiet, extra: ['--vibespace-engine=attach-leg'] }).argv) && clE.ab.length === 0, 'its own arguments went in through the argv builder (mark + quiet switches kept, the same census), no AGENT_BROWSER_* in its env', clE && clE.args);
  ok(gateOf(recE.browserChoice) && recE.browserChoice.kind === 'plugin' && recE.browserChoice.version === fact.version && verdictOf(asked.some((a) => a[0] === 'launchOptions' && a[2] === pE.id && a[3] === KERN && a[4] === pE.dir)), 'the record says {kind:\'plugin\', id, version}; the engine was asked for THIS profile with the kernel VibeSpace resolved and the profile\'s directory', { bc: recE.browserChoice, asked });
  const bad = AT.attachArgv({ profileDir: pE.dir, mark: B.keeperMarkArg(pE.id), quiet, extra: ['--user-data-dir=/elsewhere'] });
  ok(!bad.ok && bad.code === 'bad_argv', 'CONTROL: an engine argument naming another --user-data-dir fails the builder\'s census (bad_argv) — never spawned', bad);
  await ke.stop(pE.id, { why: 'user' });
  // THE EXIT CHECK's HAND-OVER (the owner 2026-11-17): a profile's KEPT exit rides resolve-launch as `egress` — the names settled
  // with the plugin's conversation {publicIp, country, timezone, checkedAt, source}; absent when none is kept; the launch makes NO
  // request for it (the check's one request module counted across both launches)
  {
    const EXC = require('../src/server/browser-exit-check.js'), realRT = EXC.requestThrough;
    let rtCalls = 0;
    EXC.requestThrough = async (...a) => { rtCalls++; return realRT(...a); };
    const seenX = [];
    const REGX = { ...REG, launchOptions: async (id, x) => { seenX.push(x); return { ok: true, launch: { executablePath: KERN, args: ['--vibespace-engine=attach-leg'], env: {} } }; } };
    const kx = mk({ dataDir: path.join(S, 'data-engine-exit'), engines: REGX });
    const pX = kx.createProfile({ label: 'Engine exit', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
    setMode('ok'); await kx.start(pX.id, { why: 'test' }); await kx.stop(pX.id, { why: 'user' });
    const kept = await kx.keepEgress(pX.id, { publicIp: '203.0.113.7', country: 'JP', timezone: 'Asia/Tokyo', source: 'measured' });
    setMode('ok'); await kx.start(pX.id, { why: 'test' }); await kx.stop(pX.id, { why: 'user' });
    EXC.requestThrough = realRT;
    const e = seenX[1] && seenX[1].egress;
    ok(seenX.length === 2 && !('egress' in seenX[0]) && gateOf(kept.ok) && gateOf(e) && JSON.stringify(Object.keys(e)) === '["publicIp","country","timezone","checkedAt","source"]' && e.publicIp === '203.0.113.7' && e.country === 'JP' && e.timezone === 'Asia/Tokyo' && e.source === 'measured' && e.checkedAt > 0 && rtCalls === 0,
      'the exit check\'s hand-over: resolve-launch carries `egress` {publicIp, country, timezone, checkedAt, source} when the profile keeps one, nothing when it keeps none — and the launch makes NO request for it', { first: seenX[0] && Object.keys(seenX[0]), egress: e, rtCalls });
  }
  // ①b lane hotfix-attach-engine-args: THE INCIDENT through the keeper — the engine's launch options carry --disable-sync ⇒ started on the
  // attach road WITHOUT it, ONE journal line names it, the record carries the fact the Agent browser panel's row words
  ok(!('engineDropped' in recE), 'an engine launch that dropped nothing carries no engineDropped fact', recE.engineDropped);
  {
    const REGS = { ...REG, launchOptions: async () => ({ ok: true, launch: { executablePath: KERN, args: ['--vibespace-engine=attach-leg', '--disable-sync'], env: {} } }) };
    const kS = mk({ dataDir: path.join(S, 'data-engine-sync'), engines: REGS });
    const pS = kS.createProfile({ label: 'Engine sync', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
    setMode('ok');
    const nS = chromeLog().length, jS = journal.length;
    const vS = await kS.start(pS.id, { why: 'test' }).then((v) => v, (e) => ({ error: e && e.message, code: e && e.code }));
    const recS = kS._reg().browsers[pS.id] || {};
    const clS = chromeLog().slice(nS).pop();
    ok(gateOf(vS) && vS.state === 'ready' && recS.launch === 'attach' && gateOf(clS) && JSON.stringify(clS.args) === JSON.stringify(AT.attachArgv({ profileDir: pS.dir, mark: B.keeperMarkArg(pS.id), quiet, extra: ['--vibespace-engine=attach-leg'] }).argv) && !clS.args.some((a) => a.startsWith('--disable-sync')), 'an engine passing --disable-sync STARTS on the attach road: its Chrome ran with the engine\'s other switch and without the forbidden one (never refused bad_argv)', { v: vS, args: clS && clS.args });
    const said = journal.slice(jS).filter((l) => l === `[browser] ${pS.id}: engine ${EID}'s launch switch --disable-sync dropped on the attach road (driver-only; the attach road needs Chrome's sign-in entry)`);
    ok(said.length === 1 && JSON.stringify(recS.engineDropped) === JSON.stringify({ engine: EID, switches: ['--disable-sync'] }), 'SAID, never silent: ONE journal line names the engine and the switch, and the record carries {engine, switches} (the panel\'s fact)', { said, journal: journal.slice(jS), fact: recS.engineDropped });
    const PM = await import('../src/lib/browser-panel-model.js');
    const R = require('../src/server/browser-trace.js');
    const fakeDu = (cmd, args, opts, cb) => { const dirs = args.slice(args.indexOf('--') + 1); setTimeout(() => cb(null, dirs.map((d) => `4096\t${d}`).join('\n'), ''), 1); };
    const tr = R.create({ dataDir: path.join(S, 'data-engine-sync'), homeDir: HOME, keeper: kS, bridge: null, serverSetting: (x) => settings[x], broadcast: () => { }, log: jlog, now: Date.now, execFileImpl: fakeDu, sweepEveryMs: 0 });
    const hk = await tr.housekeeping().catch((e) => ({ error: e && e.message }));
    const row = ((hk && hk.profiles) || []).find((r) => r.id === pS.id) || null;
    const tw = (s, q) => String(s).replace(/\{(\w+)\}/g, (m, k) => (q && k in q ? String(q[k]) : m)); // the view's t (English: the key, interpolated)
    const lines = row ? PM.stateLines(row, { w: { t: tw, why: () => 'its browser is running' } }) : [];
    const line = lines.find((s) => s.key === 'engine-dropped');
    ok(gateOf(row) && JSON.stringify(row.engineDropped) === JSON.stringify(recS.engineDropped) && gateOf(line) && line.text === 'Left out --disable-sync, which its engine asked for: it would stop this browser signing in to Google' && line.tone === 'info' && lines[0] !== line, 'the Agent browser panel: the profile\'s housekeeping row carries the fact and its state lines SAY it (after the state\'s own sentence — the row\'s second line keeps that)', { row: row && row.engineDropped, lines, hk: hk && hk.error });
    await kS.stop(pS.id, { why: 'user' }).catch(() => { });
  }
  // ①b: EVERY launch the road does not start is journaled BY NAME — the code and the argv item(s) — BEFORE its display session is stopped.
  // (1) PLANTED CONTROL at the keeper: the HUB's own argv carrying a forbidden switch (the builder's quiet part, planted) is still bad_argv
  {
    const orig = AT.attachArgv;
    let rP = null, jl = [], nP = 0, pP = null, kP = null;
    try {
      AT.attachArgv = (o) => orig({ ...o, quiet: [...(o.quiet || []), '--disable-sync'] }); // the keeper calls AT.attachArgv by property: the plant reaches it
      kP = mk({ dataDir: path.join(S, 'data-engine-planted'), engines: REG });
      pP = kP.createProfile({ label: 'Engine planted', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
      setMode('ok');
      nP = chromeLog().length; const jP = journal.length;
      rP = await kP.start(pP.id, { why: 'test' }).then((v) => ({ v }), (e) => ({ e }));
      jl = journal.slice(jP);
    } finally { AT.attachArgv = orig; }
    const iSaid = jl.findIndex((l) => l === `[browser] ${pP.id} "Engine planted": NOT started on the attach road [bad_argv] (--disable-sync) — the attach argv failed its census (missing -; forbidden --disable-sync)`);
    const iStop = jl.findIndex((l) => l.startsWith(`[browser] ${pP.id}: its display session `) && l.endsWith('stopped — its launch was refused'));
    // int378 seam 4 (B-52dd): the count reads ITS OWN profile's lines — the «Mute» start above (:269) is not awaited until the end and
    // fails by design at its 5 s port wait, so its refusal line can land inside this window (red on ci/int378 ×2 at load ≈ 4)
    const mine = (l) => l.startsWith(`[browser] ${pP.id} `) || l.startsWith(`[browser] ${pP.id}:`);
    const notStarted = (lines, own) => lines.filter((l) => (!own || mine(l)) && l.includes('NOT started on the attach road')).length;
    const planted = iSaid >= 0 ? [...jl.slice(0, iSaid), '[browser] bp-00000000 "Mute": NOT started on the attach road [cdp_port_missing] — planted', ...jl.slice(iSaid)] : jl;
    ok(notStarted(planted, false) === notStarted(jl, false) + 1 && notStarted(planted, true) === notStarted(jl, true), 'the planted control counts ITS OWN profile\'s refusals: another profile\'s line in its window (the unawaited «Mute» start\'s 5 s refusal) — the old every-profile count moves by one, the own-profile count does not', { all: notStarted(jl, false), own: notStarted(jl, true) });
    ok(gateOf(rP.e) && rP.e.code === 'bad_argv' && chromeLog().length === nP && iSaid >= 0 && iStop > iSaid && notStarted(jl, true) === 1, 'PLANTED CONTROL through the keeper: a forbidden switch in the HUB\'s own argv is still refused bad_argv — and the refusal is journaled ONCE, with its code and the item, BEFORE its display session is stopped; nothing spawned', { code: rP.e && rP.e.code, jl });
    await kP.stop(pP.id, { why: 'user' }).catch(() => { });
  }
  // (2) a sibling on the road (the switch-only wall — the wrapper's wall stubbed away, as L1b r5 below): journaled by name too
  {
    const ENGK0 = require('../src/browser-engines.js'), wrap0 = ENGK0.engineWrapperText;
    let rU = null, jl = [], nU = 0, pU2 = null, kU = null;
    try {
      ENGK0.engineWrapperText = (spec) => wrap0({ ...spec, args: [] });
      const REGU = { ...REG, launchOptions: async () => ({ ok: true, launch: { executablePath: KERN, args: ['--no-sandbox', '--'], env: {} } }) };
      kU = mk({ dataDir: path.join(S, 'data-engine-said'), engines: REGU });
      pU2 = kU.createProfile({ label: 'Engine said', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
      setMode('ok');
      nU = chromeLog().length; const jU = journal.length;
      rU = await kU.start(pU2.id, { why: 'test' }).then((v) => ({ v }), (e) => ({ e }));
      jl = journal.slice(jU);
    } finally { ENGK0.engineWrapperText = wrap0; }
    const iSaid = jl.findIndex((l) => l.startsWith(`[browser] ${pU2.id} "Engine said": NOT started on the attach road [browser_engine_protocol] (--) — `));
    const iStop = jl.findIndex((l) => l.startsWith(`[browser] ${pU2.id}: its display session `) && l.endsWith('stopped — its launch was refused'));
    ok(gateOf(rU.e) && rU.e.code === 'browser_engine_protocol' && chromeLog().length === nU && iSaid >= 0 && iStop > iSaid, 'a sibling refusal on the road (an engine\'s bare --) is journaled with its code and the item BEFORE its display session is stopped; nothing spawned', { code: rU.e && rU.e.code, jl });
    await kU.stop(pU2.id, { why: 'user' }).catch(() => { });
  }
  // (3) B-0528 (2): the road's FOUR other «started nothing» branches — a profile lock held elsewhere, an unusable socket directory,
  //     a spawn that failed, a pid gone before it was recorded — each journaled ONCE, by name. CONTROL per branch: a keeper copy that
  //     drops the branch's line refuses the start as before, SILENT on the hub (the four were unpinned: a mutant kept this suite green)
  {
    const deadPid = require('node:child_process').spawnSync('true').pid; // exited already: /proc has no start time for it
    const realEnsure = ATL.ensureSocketDir, realSpawn = ATL.spawnChrome;
    const BRANCHES = [
      { label: 'lock', code: 'profile_locked', words: /locked under another machine's name \(elsewhere, pid/, plant: (pr) => { fs.mkdirSync(pr.dir, { recursive: true }); fs.symlinkSync(`elsewhere-${deadPid}`, path.join(pr.dir, 'SingletonLock')); },
        drop: ["\n    if (!lk.ok) { const e = failed(lk.code, lk.error);", "\n    if (!lk.ok) { const e = failed(lk.code, lk.error, {}, { said: true });"] }, // the ATTACH road's (4 spaces — the driver road's has 6)
      { label: 'socket-dir', code: 'socket_dir_unavailable', words: /planted: the socket directory cannot be used/, plant: () => { ATL.ensureSocketDir = () => ({ ok: false, code: 'socket_dir_unavailable', error: 'planted: the socket directory cannot be used' }); },
        drop: ['if (!so.ok) throw failed(so.code, so.error);', 'if (!so.ok) throw failed(so.code, so.error, {}, { said: true });'] },
      { label: 'spawn', code: 'launch_failed', words: /planted: Chrome could not be started/, plant: () => { ATL.spawnChrome = async () => ({ ok: false, code: 'launch_failed', error: 'planted: Chrome could not be started' }); },
        drop: ['      sayNotStarted(lr ? lr.code : r.code, lr ? lr.error : r.error);\n', '\n'] },
      { label: 'unidentified', code: 'launch_failed', words: /was gone right after its launch/, plant: () => { ATL.spawnChrome = async () => ({ ok: true, pid: deadPid, port: 9, wsPath: '/devtools/browser/planted', child: { kill() { } } }); },
        drop: ["sayNotStarted('launch_failed', unrecordedLaunch(r.pid)); await endDisplay(rec, 'its browser could not be identified');", "await endDisplay(rec, 'its browser could not be identified');"] },
    ];
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const MUTK = mutantCopies('browser-keeper-b0528', REPO);
    const realCreate = K.create;
    const runBranch = async (b, Kc, tag) => {
      let r0 = null, jl = [], k4 = null, p4 = null;
      try {
        K.create = Kc; // mk() reads K.create at the call: a keeper COPY for a control, the real one otherwise
        k4 = mk({ dataDir: path.join(S, `data-b0528-${b.label}-${tag}`), engines: REG });
        p4 = k4.createProfile({ label: `B0528 ${b.label}`, browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
        b.plant(p4);
        setMode('ok');
        const j0 = journal.length;
        r0 = await k4.start(p4.id, { why: 'test' }).then((v) => ({ v }), (e) => ({ e }));
        jl = journal.slice(j0);
      } finally { K.create = realCreate; ATL.ensureSocketDir = realEnsure; ATL.spawnChrome = realSpawn; }
      const said = jl.filter((l) => l.startsWith(`[browser] ${p4.id} "B0528 ${b.label}": NOT started on the attach road [${b.code}]`) && b.words.test(l));
      try { await k4.stop(p4.id, { why: 'user' }); } catch { /* refused already */ }
      return { refused: !!(r0 && r0.e && r0.e.code === b.code), said: said.length, r: r0 && (r0.e ? { code: r0.e.code, error: String(r0.e.message).slice(0, 200) } : { v: r0.v && r0.v.state }), jl };
    };
    for (const b of BRANCHES) {
      const real = await runBranch(b, realCreate, 'real');
      ok(gateOf(real.refused) && real.said === 1, `B-0528 ${b.label}: the start is refused ${b.code} AND journaled ONCE by name`, real);
      ok(ksrc.split(b.drop[0]).length === 2, `B-0528 ${b.label} control setup: the branch's line is found once in src/server/browser-keeper.js`);
      const Km = MUTK.load('src/server/browser-keeper.js', editAnchor(ksrc, b.drop[0], b.drop[1], "src/server/browser-keeper.js"), `quiet-${b.label}`);
      const quiet = await runBranch(b, Km.create, 'quiet');
      ok(gateOf(quiet.refused) && quiet.said === 0, `CONTROL (B-0528 ${b.label}): a keeper copy without the line still refuses ${b.code} — and says NOTHING (so the pin above is what holds it)`, quiet);
    }
    for (const c of copiesCensus(MUTK.files, MUTK.dir, REPO, { label: 'B-0528 controls: ' })) ok(verdictOf(c.pass), c.name, c.detail);
  }
  // lane engine-spi-egress L1b r3: the ATTACH road's own census refuses a switch that starts ANOTHER program (the launch verdict refuses it
  // first; this registry hands it unjudged, as a stub can) — the start is refused by name and nothing is spawned
  const REGL = { ...REG, launchOptions: async () => ({ ok: true, launch: { executablePath: KERN, args: ['--browser-subprocess-path=/usr/bin/true'], env: {} } }) };
  const kl = mk({ dataDir: path.join(S, 'data-engine-launcher'), engines: REGL });
  const pL = kl.createProfile({ label: 'Engine launcher', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
  let ranL0 = ''; try { ranL0 = fs.readFileSync(path.join(STATE, 'kernel-ran.log'), 'utf8'); } catch { ranL0 = ''; }
  const nL = chromeLog().length;
  const rL = await kl.start(pL.id, { why: 'test' }).then((v) => ({ v }), (e) => ({ e }));
  let ranL = ''; try { ranL = fs.readFileSync(path.join(STATE, 'kernel-ran.log'), 'utf8'); } catch { ranL = ''; }
  const recL = kl._reg().browsers[pL.id] || {};
  const wordsL = /names? another program through --browser-subprocess-path; a plugin never names the program it runs/; // the wrapper's wall (written first, on both roads) or the attach road's own
  const refusedL = (rL.e && /^(?:browser_engine_protocol|launch_failed)$/.test(String(rL.e.code)) && wordsL.test(rL.e.message)) || (rL.v && rL.v.state === 'failed' && wordsL.test(JSON.stringify(rL.v)));
  ok(gateOf(refusedL) && chromeLog().length === nL && ranL === ranL0 && recL.state !== 'ready', 'lane engine-spi-egress L1b r3: the ATTACH road refuses an engine argument that starts another program (--browser-subprocess-path) before anything is spawned — by the wrapper\'s wall (written before the road is chosen) or its own, by name', { r: rL.e ? rL.e.message : rL.v, state: recL.state });
  await kl.stop(pL.id, { why: 'user' }).catch(() => { }); // a red run (a tree without the walls) started it: never left behind
  // L1b r4: the same switch with a TAB in front (Chromium trims it, then reads the switch) ⇒ the same refusal, nothing spawned
  const REGT = { ...REG, launchOptions: async () => ({ ok: true, launch: { executablePath: KERN, args: ['\t--gpu-launcher=/usr/bin/true'], env: {} } }) };
  const kt = mk({ dataDir: path.join(S, 'data-engine-launcher-tab'), engines: REGT });
  const pT = kt.createProfile({ label: 'Engine launcher tab', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
  const nT = chromeLog().length;
  const rT = await kt.start(pT.id, { why: 'test' }).then((v) => ({ v }), (e) => ({ e }));
  let ranT = ''; try { ranT = fs.readFileSync(path.join(STATE, 'kernel-ran.log'), 'utf8'); } catch { ranT = ''; }
  const wordsT = /names? another program through --gpu-launcher; a plugin never names the program it runs/;
  ok(((gateOf(rT.e) && gateOf(wordsT.test(rT.e.message))) || (gateOf(rT.v) && rT.v.state === 'failed' && gateOf(wordsT.test(JSON.stringify(rT.v))))) && chromeLog().length === nT && ranT === ranL && (kt._reg().browsers[pT.id] || {}).state !== 'ready', 'lane engine-spi-egress L1b r4: a TAB in front of the switch (Chromium trims it) ⇒ the same refusal by name on the attach road, nothing spawned', { r: rT.e ? rT.e.message : rT.v });
  await kt.stop(pT.id, { why: 'user' }).catch(() => { });
  try { kt.shutdown(); } catch { /* none */ }
  // L1b r5: the ATTACH road's OWN wall, pinned directly — the wrapper writer is stubbed to write the program bare (so its wall cannot
  // answer first), the engine answers a padded argument / a bare -- unjudged: attachStart refuses each by name, nothing spawned
  const ENGK = require('../src/browser-engines.js'), wrapOrig = ENGK.engineWrapperText;
  const atWall = [];
  try {
    ENGK.engineWrapperText = (spec) => wrapOrig({ ...spec, args: [] });
    for (const [tag, args, re] of [['padded', ['--no-sandbox', ' --x-padded=1'], /starts or ends with whitespace/], ['end-of-switches', ['--no-sandbox', '--'], /an engine launch takes switches only; «--» is not a switch/]]) {
      const REGW = { ...REG, launchOptions: async () => ({ ok: true, launch: { executablePath: KERN, args, env: {} } }) };
      const kw = mk({ dataDir: path.join(S, `data-engine-attach-wall-${tag}`), engines: REGW });
      const pW = kw.createProfile({ label: `Engine wall ${tag}`, browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: fact });
      const nW = chromeLog().length;
      const rW = await kw.start(pW.id, { why: 'test' }).then((v) => ({ v }), (e) => ({ e }));
      let ranW = ''; try { ranW = fs.readFileSync(path.join(STATE, 'kernel-ran.log'), 'utf8'); } catch { ranW = ''; }
      const said = rW.e ? String(rW.e.message) : JSON.stringify(rW.v || {});
      atWall.push({ tag, ok: re.test(said) && !/launch wrapper cannot be written/.test(said) && chromeLog().length === nW && ranW === ranL && (kw._reg().browsers[pW.id] || {}).state !== 'ready', said: said.slice(0, 200) });
      await kw.stop(pW.id, { why: 'user' }).catch(() => { });
      try { kw.shutdown(); } catch { /* none */ }
    }
  } finally { ENGK.engineWrapperText = wrapOrig; }
  ok(atWall.length === 2 && verdictOf(atWall.every((x) => x.ok)), 'lane engine-spi-egress L1b r5: the attach road\'s OWN wall (the wrapper\'s stubbed away) refuses a padded argument and a bare -- by name before its argv is built — nothing spawned', atWall);
  try { kl.shutdown(); } catch { /* none */ }
  // lane engine-distribution: the kernel side's plugin has no childProcess — its probe says version null + declaredVersion; the
  // KEEPER has the version measured ONCE before the first launch (the engine record's), the record + the card say «measured»
  const factN = { ...fact, version: null, declaredVersion: '150.0.7871.186-vs1' };
  const measured = { n: 0, v: null };
  const EDS = { kernelFact: () => ({ state: 'installed', measuredVersion: measured.v, measuredAt: measured.v ? 1 : null }), measure: async () => { measured.n++; measured.v = '150.0.7871.186-vs1'; return { ok: true, version: measured.v }; }, installKernel: async () => { throw new Error('not here'); } };
  const REGN = { ...REG, probe: async () => ({ ok: true, fact: { ...factN } }) };
  const kn = mk({ dataDir: path.join(S, 'data-engine-m'), engines: REGN, engineDistribution: () => EDS });
  const pN = kn.createProfile({ label: 'Measured', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: factN });
  await kn.start(pN.id, { why: 'test' }); await kn.stop(pN.id, { why: 'user' }); await kn.start(pN.id, { why: 'test' });
  const BMk = await import('../src/lib/browser-build-model.js');
  const rowN = (await kn.engineRowsView()).find((e) => e.id === EID);
  const tK = (x, q) => String(x).replace(/\{(\w+)\}/g, (m, k) => (q && k in q ? String(q[k]) : m));
  ok(measured.n === 1 && kn._reg().browsers[pN.id].browserChoice.version === '150.0.7871.186-vs1' && rowN.measuredVersion === '150.0.7871.186-vs1' && verdictOf(/· measured 150\.0\.7871\.186-vs1$/.test(BMk.engineNote(rowN, tK))),
    'lane engine-distribution: the kernel\'s --version measured ONCE before its first launch (a second launch asks nothing), the record says the measured version, the card «… · measured 150.0.7871.186-vs1»', { n: measured.n, rc: kn._reg().browsers[pN.id].browserChoice, note: BMk.engineNote(rowN, tK) });
  await kn.stop(pN.id, { why: 'user' });
  const EDF = { ...EDS, kernelFact: () => ({ state: 'installed', measuredVersion: null }), measure: async () => { measured.n++; return { ok: false, error: 'it printed no version' }; } };
  const kf = mk({ dataDir: path.join(S, 'data-engine-d'), engines: REGN, engineDistribution: () => EDF });
  const pF = kf.createProfile({ label: 'Declared', browser: { kind: 'plugin', id: EID } }, { owner: { kind: 'instance', id: null }, engine: factN });
  await kf.start(pF.id, { why: 'test' });
  const rowF = (await kf.engineRowsView()).find((e) => e.id === EID);
  ok(kf._reg().browsers[pF.id].browserChoice.version === '150.0.7871.186-vs1' && verdictOf(/declared 150\.0\.7871\.186-vs1 \(not measured\)/.test(BMk.engineNote(rowF, tK))), '…a kernel that says no version still starts: the record carries the DECLARED version, the card «declared 150.0.7871.186-vs1 (not measured)»', BMk.engineNote(rowF, tK));
  await kf.stop(pF.id, { why: 'user' });
}

// ═══ ⑦ LANE BROWSER-DISPLAY-HOLDERS (the owner 2026-10-25): ONE NOTION OF HELD — a person's stop is a fact, never a crash ═══
console.log('— ⑦ lane browser-display-holders: the display record carries its holders; a person\'s stop is never healed, its holders told once');
{
  const MK = mutantCopies('bkr-holders', REPO);
  /** the owner's journal, replayed: two conversations hold an attach browser; the PERSON stops its display window (the desktop
   *  keeper's hook), the display goes and Chrome dies with its X; two ticks. `Kmod` = the keeper module under test. The heal
   *  is DECIDED inside the tick (healAttach journals its verdict and calls start() before the tick returns — the control's
   *  new Chrome is up ~150 ms later), so a gated run waits only `settleMs` for a start that must not come. */
  const replay = async (Kmod, tag, { settleMs }) => {
    const DU = isolatedDisplays(tag);
    const hooks = { stop: [], holders: [], moved: 0 };
    const DKU = { ...DU.DK, onBrowserDisplayStop: (fn) => { hooks.stop.push(fn); return () => { hooks.stop = hooks.stop.filter((x) => x !== fn); }; }, setBrowserHolders: (fn) => { hooks.holders.push(fn); }, browserHoldersMoved: () => { hooks.moved++; return false; } };
    const liveU = new Set(['bk-00000021', 'bk-00000022']);
    const jr = [];
    const ku = Kmod.create({ dataDir: path.join(S, 'data-' + tag), homeDir: HOME, env: () => rtEnv, serverSetting: (x) => settings[x], serverNotice: () => 1, liveKeys: () => liveU, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log(m) { jr.push(String(m)); }, warn(m) { jr.push(String(m)); }, error() { } }, install: false, tickMs: 3600e3, displaySessions: DKU, attachSocketBase: SOCKBASE });
    const evs = []; ku.onLease((ev) => { if (ev && ev.kind === 'browser-user-stopped') evs.push(ev); });
    const pP = ku.createProfile({ label: 'personal-life' }, { owner: { kind: 'instance', id: null } });
    setMode('ok');
    await ku.attach({ profileId: pP.id, browserKey: 'bk-00000021', sessionId: 'sess-a', by: 'agent' });
    await ku.attach({ profileId: pP.id, browserKey: 'bk-00000022', sessionId: 'sess-b', by: 'agent' });
    const r0 = ku._reg().browsers[pP.id];
    const ds0 = r0 && r0.displaySession ? r0.displaySession.id : null;
    const before = { holders: ku.displayHoldersOf(pP.id, ds0), moved: hooks.moved };
    const sv = hooks.stop.length ? hooks.stop[0]({ profileId: pP.id, displayId: ds0, by: 'user' }) : null;
    const stamped = { rec: ku._reg().browsers[pP.id].userStopped || null, view: ku.displayHoldersOf(pP.id, ds0) };
    DU.live.delete(ds0); // the desktop keeper tears the display down…
    process.kill(r0.pid, 'SIGKILL'); await until(() => !alive(r0.pid)); // …and Chrome dies with its X
    const t0 = Date.now();
    await ku.tick(); await until(() => { const r = ku._reg().browsers[pP.id]; return r && r !== r0 && r.state === 'ready'; }, settleMs); await ku.tick();
    const after = ku._reg().browsers[pP.id];
    return { ku, pP, r0, ds0, DU, hooks, evs, jr, sv, before, stamped, after, launches: DU.calls.filter((c) => c[0] === 'launch').length, healMs: after !== r0 ? Date.now() - t0 : null };
  };
  const R = await replay(K, 'ustop', { settleMs: 300 });
  ok(R.hooks.stop.length === 1 && R.hooks.holders.length === 1 && R.hooks.holders[0] === R.ku.displayHoldersOf, 'a display keeper handed in at create is wired: its records read the holders (setBrowserHolders), its person\'s stop reaches the keeper (onBrowserDisplayStop)');
  ok(gateOf(R.r0) && R.r0.launch === 'attach' && R.before.holders.holders === 2 && !R.before.holders.userStopped && R.before.moved > 0, `two conversations attached ⇒ the display record reads holders 2 — the desktop keeper re-read them on every commit (${R.before.moved} calls)`, R.before);
  ok(gateOf(R.sv) && gateOf(R.stamped.rec) && R.stamped.rec.by === 'user' && R.stamped.rec.displayId === R.ds0 && gateOf(R.stamped.view.userStopped) && R.stamped.view.holders === 2 && R.ku.displayHoldersOf(R.pP.id, 'da-another').userStopped === undefined, 'the person\'s stop stamps the record userStopped {at, by: user, displayId} — that display reads it, another display of the profile does not', R.stamped);
  ok(R.evs.length === 1 && R.evs[0].holders.map((h) => h.sessionId).sort().join() === 'sess-a,sess-b' && R.evs[0].label === 'personal-life' && R.evs[0].profileId === R.pP.id, 'ONE browser-user-stopped event naming BOTH holding conversations (the wiring tells each once)', R.evs);
  ok(R.after === R.r0 && R.after.state === 'stopped' && R.after.stoppedBy === 'user' && R.after.lastError === null && gateOf(/you stopped its display window/.test(R.after.note || '')) && R.launches === 1, `the tick saw Chrome gone under two holders and did NOT start it again: the record says the person stopped it (launches ${R.launches})`, { state: R.after.state, stoppedBy: R.after.stoppedBy, note: R.after.note, err: R.after.lastError });
  ok(gateOf(R.jr.some((l) => /NOT started again \(user-stopped, never a heal\)/.test(l))) && !R.jr.some((l) => /started again on the attach road/.test(l)), 'the journal names the gate (user-stopped) — never "started again on the attach road", never a heal-budget line');
  // the next command of a holding conversation starts it — the conversation's own act: a NEW record, its verb named, no stamp
  await R.ku.attach({ profileId: R.pP.id, browserKey: 'bk-00000021', sessionId: 'sess-a', by: 'agent' });
  const r2 = R.ku._reg().browsers[R.pP.id];
  ok(r2 !== R.r0 && r2.state === 'ready' && gateOf(alive(r2.pid)) && !r2.userStopped && gateOf(/^attach bk-00000021/.test(r2.startedBy || '')) && r2.displaySession.id !== R.ds0 && R.ku.displayHoldersOf(R.pP.id, r2.displaySession.id).holders === 2 && !R.ku.displayHoldersOf(R.pP.id, R.ds0).userStopped, 'the next command starts it (startedBy "attach bk-00000021", a new display) and the stamp is gone with the old record', { startedBy: r2.startedBy, stamp: r2.userStopped });
  // a stop that is not the person's (no hook call) or of another display: no stamp
  ok(R.ku.userStoppedDisplay({ profileId: R.pP.id, displayId: R.ds0 }) === null && !R.ku._reg().browsers[R.pP.id].userStopped, 'a stop naming an old display (not the record\'s) stamps nothing');
  await R.ku.stop(R.pP.id, { why: 'user' }).catch(() => { });
  // THE NOTICE each holder hears (session-status layer ②: a browser-profile notice naming the event)
  const { SessionStatusManager } = require('../src/session-status.js');
  const nt = SessionStatusManager.renderNotice(B.userStoppedNotice({ label: 'personal-life', profileId: R.pP.id, at: 1 }));
  ok(B.userStoppedNotice({ label: 'x' }).kind === 'browser-profile' && gateOf(/^<system-reminder>\nthe person stopped the browser "personal-life" \(its display window's Stop\) — every tab of it is gone; your next `vibespace-browser` command starts it again/.test(nt)) && verdictOf(/browser profile changed/.test(SessionStatusManager.renderNotice(B.profileChangeNotice({ was: 'a', now: 'b' })))), 'the notice: «the person stopped the browser "personal-life" … your next vibespace-browser command starts it again» (a profile change renders as before)', nt);
  ok(JSON.stringify(B.attachedHolders([{ browserKey: 'bk-1', sessionId: 's1' }, { browserKey: 'bk-2', sessionId: 's1' }, { browserKey: 'hu-00000001', human: true }, { browserKey: 'bk-3', sessionId: null }, null])) === JSON.stringify([{ sessionId: 's1', browserKey: 'bk-1' }, { sessionId: null, browserKey: 'bk-3' }]), 'attachedHolders: one row per conversation (two keys of one session = one), never the person\'s own browsing row');
  // RED CONTROL — today's behaviour: the keeper without the gate heals the person's stop on the next tick (the owner's journal)
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const GATE = "    if (userStoppedRec(rec)) { log.log?.(`[browser] ${rec.profileId}: its Chrome exited after the person stopped its display window";
  ok(src.split(GATE).length === 2, 'CONTROL: the heal gate is spelled once in browser-keeper.js');
  const Kc = MK.load('src/server/browser-keeper.js', editAnchor(src, GATE, '    if (false) { log.log?.(`[browser] ${rec.profileId}: its Chrome exited after the person stopped its display window', "src/server/browser-keeper.js"), 'nogate');
  const C = await replay(Kc, 'ustop-ctl', { settleMs: 3000 });
  ok(C.after !== C.r0 && C.after.state === 'ready' && C.launches === 2 && verdictOf(C.jr.some((l) => /started again on the attach road \(1 in the window\)/.test(l))), `CONTROL: without the gate the person's stop is healed — a new Chrome on a new display ${C.healMs} ms after the tick (the owner's «started again on the attach road»)`, { state: C.after.state, launches: C.launches });
  await C.ku.stop(C.pP.id, { why: 'user' }).catch(() => { });
  // the wiring: the person's stop is told to each LIVE holder once (a second stop before it reads the first replaces it)
  const mpw = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(gateOf(/if \(!ev \|\| ev\.kind !== 'browser-user-stopped' \|\| !Array\.isArray\(ev\.holders\)\) return null;/.test(mpw)) && verdictOf(/st\.dropNotices\(key, \(x\) => x && x\.kind === 'browser-profile' && x\.event === 'user-stopped' && x\.profileId === ev\.profileId\); st\.pushNotice\(key, n\);/.test(mpw)), 'WIRING PIN: the browser-user-stopped event pushes ONE browser-profile notice per live holding conversation (the earlier one of the same profile withdrawn)');
}
// THE DRIVER ROAD: no xpra on the machine ⇒ today's launch, said on the record
fakeXpra = false;
const pC = k.createProfile({ label: 'Plain' }, { owner: { kind: 'instance', id: null } });
const nD = dcalls.length;
const vC = await k.start(pC.id, { why: 'test' });
const recC = k._reg().browsers[pC.id];
ok(vC.state === 'ready' && recC.launch === 'driver' && recC.launchWhy === AT.HIDDEN_WINDOW_WHY && gateOf(/cannot sign in to Google/.test(recC.launchWhy)) && gateOf(launches().some((l) => l.ns === 'vs-' + pC.id)) && dcalls.length === nD && !recC.displaySession, 'no xpra ⇒ the DRIVER road (the hidden window): its launch ran, no display session, the record says it cannot sign in', { launch: recC.launch, why: recC.launchWhy });
await k.stop(pC.id, { why: 'user' });
fakeXpra = true;
// the display session never came up ⇒ the driver road, said
fakeDisplayFail = true;
const pD = k.createProfile({ label: 'NoDisplay' }, { owner: { kind: 'instance', id: null } });
const vD = await k.start(pD.id, { why: 'test' });
const recD = k._reg().browsers[pD.id];
ok(vD.state === 'ready' && recD.launch === 'driver' && gateOf(/its display session did not come up \(xpra exited \(code 1\)\)/.test(recD.launchWhy)) && verdictOf(dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fail')), 'a display session that failed ⇒ stopped, the driver road runs, the record says why', recD.launchWhy);
await k.stop(pD.id, { why: 'user' });
fakeDisplayFail = false;
// cdp_port_missing AT THE KEEPER (started before Chrome's own exit, on its own keeper): a Chrome that never writes its port
// ⇒ refused by name, nothing left running
const err = await muteRun;
const muteChrome = chromeLog().find((l) => l.mode === 'never' && l.args.includes(`--user-data-dir=${pE.dir}`)) || {}; await until(() => !alive(muteChrome.pid));
const recE = kM._reg().browsers[pE.id];
ok(gateOf(err) && err.code === 'cdp_port_missing' && recE.state === 'failed' && gateOf(Number.isInteger(muteChrome.pid)) && !alive(muteChrome.pid) && Date.now() - tE >= AT.PORT_WAIT_MS && !DM.live.has(recE.displaySession && recE.displaySession.id), 'a Chrome that writes no port in 5 s ⇒ cdp_port_missing by name, the record failed, the Chrome ended, its display stopped', { code: err && err.code, state: recE.state });
// THE BOOT: a new keeper on the same data adopts a live attach record by Chrome's identity + its CDP answer
setMode('ok');
vA = await k.start(pA.id, { why: 'test' });
const pidA = k._reg().browsers[pA.id].pid;
k.shutdown?.();
const k2 = mk();
await k2.adoptAll();
const recA2 = k2._reg().browsers[pA.id];
ok(recA2.state === 'ready' && gateOf(recA2.adoptedAt) && recA2.pid === pidA && recA2.launch === 'attach', 'boot: the attach record is ADOPTED (Chrome is ours by pid + starttime, its endpoint answers)', { state: recA2.state, pid: recA2.pid });
// THE RECONCILE: a display-only session no live record names is stopped by the next tick
dlive.set('da-orphan', { id: 'da-orphan', kind: DA.DISPLAY_FOR_BROWSER, forBrowser: pB.id, state: 'ready', display: ':99' });
await k2.tick();
await sleep(50);
ok(!dlive.has('da-orphan') && gateOf(dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-orphan')) && verdictOf(dlive.has(recA2.displaySession.id)), 'the tick stops a display session whose browser record is not live (and keeps the one a live record names)');
await k2.stop(pA.id, { why: 'user' });

console.log('— B-8b87: the attach road carries the WebRTC policy beside a profile\'s proxy');
setMode('ok');
// B-8b87 (主开发 2026-11-17 14:25Z): a profile WITH a proxy — its ATTACH argv carries the forwarder's switch AND the WebRTC policy that
// lets UDP out only through a proxy (the forwarder carries none: a call goes over TCP through it, or does not connect); without: neither
{
  const UDP = require('../src/browser-engines.js').PROXY_UDP_ARG;
  const attachProxied = async (kk, label) => { const pp = kk.createProfile({ label, proxy: 'http://proxy.example.test:3128' }, { owner: { kind: 'instance', id: null } }); const n = chromeLog().length; await kk.start(pp.id, { why: 'test' }); const c = chromeLog().slice(n).pop() || { args: [] }; try { await kk.stop(pp.id, { why: 'user' }); } catch { } return { args: c.args || [], launch: (kk._reg().browsers[pp.id] || {}).launch }; };
  const DATA_P = path.join(S, 'data-udp'); fs.mkdirSync(DATA_P, { recursive: true });
  const kP2 = mk({ dataDir: DATA_P });
  const plain0 = await (async () => { const pp = kP2.createProfile({ label: 'No proxy attach' }, { owner: { kind: 'instance', id: null } }); const n = chromeLog().length; await kP2.start(pp.id, { why: 'test' }); const c = chromeLog().slice(n).pop() || { args: [] }; try { await kP2.stop(pp.id, { why: 'user' }); } catch { } return c.args || []; })();
  const aP = await attachProxied(kP2, 'Proxied attach');
  ok(aP.launch === 'attach' && gateOf(aP.args.some((a) => /^--proxy-server=http:\/\/127\.0\.0\.1:\d+$/.test(a))) && gateOf(aP.args.includes(UDP)) && aP.args.indexOf(UDP) === aP.args.findIndex((a) => /^--proxy-server=/.test(a)) + 1 && plain0.length > 0 && !plain0.some((a) => /^--proxy-server=/.test(a)) && !plain0.includes(UDP),
    'the attach road: a profile WITH a proxy runs Chrome with the forwarder\'s switch and, beside it, --force-webrtc-ip-handling-policy=disable_non_proxied_udp; the profile with none carries neither', aP.args.filter((a) => /proxy|webrtc/.test(a)));
  // compiled in memory under the keeper's own path (its relative requires resolve beside it; the suite's file mutant is for pure modules)
  const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8'), kFrom = 'engineArgs.push(rec.proxyRoad.arg, ENG.PROXY_UDP_ARG);';
  if (kSrc.split(kFrom).length !== 2) throw new Error('the UDP mutant\'s anchor must occur exactly once');
  const Mod = require('node:module'), kFile = path.join(REPO, 'src/server/browser-keeper.js'), kMod = new Mod(kFile, null);
  kMod.filename = kFile; kMod.paths = Mod._nodeModulePaths(path.dirname(kFile)); kMod._compile(editAnchor(kSrc, kFrom, 'engineArgs.push(rec.proxyRoad.arg);', "src/server/browser-keeper.js", 'join'), kFile);
  const KU = kMod.exports;
  const DATA_U = path.join(S, 'data-udp-red'); fs.mkdirSync(DATA_U, { recursive: true });
  const kU = KU.create({ dataDir: DATA_U, homeDir: HOME, env: () => rtEnv, serverSetting: (x) => settings[x], serverNotice: () => 1, liveKeys: () => new Set(), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: jlog, install: false, tickMs: 3600e3, displaySessions: DK, attachSocketBase: SOCKBASE });
  const aU = await attachProxied(kU, 'Proxied attach red');
  ok(gateOf(aU.args.some((a) => /^--proxy-server=/.test(a))) && !aU.args.includes(UDP), 'RED: an attach road that pushes the switch alone — the policy is missing (the leg above goes red on it)', aU.args.filter((a) => /proxy|webrtc/.test(a)));
  kU.shutdown?.(); kP2.shutdown?.();
}

// B-9584 U2b (round wyx4vuerd 5 / 6): THE ATTACH ROAD WITH A PROFILE'S OWN LANGUAGE AND ZONE — its two switches in Chrome's argv
// (before the keeper's mark), its TZ in the spawn env; a hostile stored value judged again at use reaches neither; an untouched
// profile is the release's. REDs: copies of the keeper without the push, without the zone (anchored)
console.log('— B-9584 U2b: the attach road with a profile\'s own language and zone');
{
  const ENVm = require('../src/browser-environment.js');
  const startAttach = async (kk, label, env) => {
    const pp = kk.createProfile({ label }, { owner: { kind: 'instance', id: null } });
    if (env) kk._reg().profiles.find((x) => x && x.id === pp.id).environment = env;   // a stand-in for the store writer (U3), or a value planted raw
    const n = chromeLog().length;
    await kk.start(pp.id, { why: 'test' });
    const c = chromeLog().slice(n).pop() || { args: [] };
    const rec = kk._reg().browsers[pp.id] || {};
    const out = { launch: rec.launch, args: c.args || [], TZ: c.TZ || null, env: rec.environment || null, mark: B.keeperMarkArg(pp.id), dir: pp.dir };
    try { await kk.stop(pp.id, { why: 'user' }); } catch { /* gone */ }
    return out;
  };
  setMode('ok');
  const DATA_E = path.join(S, 'data-env-attach'); fs.mkdirSync(DATA_E, { recursive: true });
  const kE2 = mk({ dataDir: DATA_E });
  const set = ENVm.environmentVerdict({ timezone: { mode: 'value', value: 'Asia/Tokyo' }, language: { mode: 'value', value: 'ja-JP' } }).value;
  const a1 = await startAttach(kE2, 'Env attach set', set);
  const iL = a1.args.indexOf('--lang=ja-JP'), iA = a1.args.indexOf('--accept-lang=ja-JP'), iM = a1.args.indexOf(a1.mark);
  ok(a1.launch === 'attach' && iL >= 0 && iA === iL + 1 && iM > iA && a1.TZ === 'Asia/Tokyo' && !!a1.env && a1.env.by === 'stock',
    'the attach road (round wyx4vuerd 5), a profile with a zone and a language: --lang / --accept-lang ja-JP in Chrome\'s argv before the keeper\'s mark, TZ=Asia/Tokyo in its spawn env, the record says it', { args: a1.args, TZ: a1.TZ });
  // (6) hostile stored values at use: the argv is the TABLE's own untouched argv for that profile (the leg above it: an untouched start), no TZ
  // (the leading dash rides the driver road's leg and the contract's: one start each here for the comma and the newline)
  const HOSTILE = [
    { language: { mode: 'value', value: 'ja-JP,--no-sandbox' }, timezone: { mode: 'value', value: ':/etc/localtime' } },
    { language: { mode: 'value', value: 'ja-JP\n--remote-debugging-port=1' }, timezone: { mode: 'value', value: '/etc/passwd' } },
  ];
  const hs = [];
  for (const [i, h] of HOSTILE.entries()) hs.push(await startAttach(kE2, `Env attach hostile ${i}`, h));
  ok(verdictOf(hs.every((h) => h.launch === 'attach' && JSON.stringify(h.args) === JSON.stringify(AT.attachArgv({ profileDir: h.dir, mark: h.mark, quiet }).argv) && h.TZ === null && !!h.env && h.env.unfollowed.length === 2)),
    'the attach road (round wyx4vuerd 6): a stored tag with a comma and a switch, or with a newline, and a zone that is a file path — judged again at USE: Chrome\'s argv is the table\'s untouched one, no TZ, both listed as not followed', hs.map((h) => ({ extra: h.args.filter((x) => !AT.attachArgv({ profileDir: h.dir, mark: h.mark, quiet }).argv.includes(x)), TZ: h.TZ })));
  // RED: ONE copy of the keeper without the push and without the zone (anchored) — each leg above goes red on it
  const ksrcE = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const MUTE = mutantCopies('browser-keeper-env-attach', REPO);
  const realCreateE = K.create;
  const noEnv = anchored(anchored(ksrcE, '    if (stockEnv) engineArgs.push(...stockEnv.args);', '    if (false) engineArgs.push(...stockEnv.args);', 'keeper RED attach push'), '    if (stockEnv && stockEnv.env.TZ) env.TZ = stockEnv.env.TZ;', '    if (false) env.TZ = stockEnv.env.TZ;', 'keeper RED attach zone');
  const Km = MUTE.load('src/server/browser-keeper.js', noEnv, 'no-push-no-zone');
  let rB = null;
  try { K.create = Km.create; const DATA_R = path.join(S, 'data-env-attach-red'); fs.mkdirSync(DATA_R, { recursive: true }); rB = await startAttach(mk({ dataDir: DATA_R }), 'Env attach red', set); }
  finally { K.create = realCreateE; }
  ok(rB.launch === 'attach' && !rB.args.some((x) => /^--(?:accept-)?lang=/.test(x)) && rB.TZ === null, 'RED — the attach road without the push and the zone: a profile with a language and a zone starts with neither, its browser in the machine\'s own zone (the leg above goes red on it)', { args: rB.args, TZ: rB.TZ });
  // B-9584 U2c, r1707 (8): THE ATTACH ROAD, FAIL CLOSED — a place writes the profile's OWN stored denial before its Chrome (a site the
  // person allowed before rewritten to «block») and arms the hold before the browser is anyone's (the record still «starting»).
  // RED: one copy of the keeper without the attach road's store and arm (anchored) — both legs go red on it
  const placeA = ENVm.environmentVerdict({ location: { mode: 'value', value: { latitude: 35.6762, longitude: 139.6503 } } }).value;
  const geoAttach = async (Kmod, tag) => {
    const D = path.join(S, `data-geo-attach-${tag}`); fs.mkdirSync(D, { recursive: true });
    const arms = []; let kA = null, r = null;
    const stubA = { arm: async (pid, o) => { arms.push({ pid, after: (o && o.after) || null, state: (kA._reg().browsers[pid] || {}).state || null }); return { ok: true }; }, disarm: () => true, heldOf: () => null, factOf: () => null, rearmNow: () => false, dispose() { } };
    const realC = K.create;
    try {
      K.create = Kmod.create; kA = mk({ dataDir: D, geoHold: () => stubA });
      const pp = kA.createProfile({ label: `Geo attach ${tag}` }, { owner: { kind: 'instance', id: null } });
      const pr = kA._reg().profiles.find((x) => x && x.id === pp.id); pr.environment = placeA;
      fs.mkdirSync(path.join(pr.dir, 'Default'), { recursive: true });
      fs.writeFileSync(path.join(pr.dir, 'Default', 'Preferences'), JSON.stringify({ profile: { content_settings: { exceptions: { geolocation: { 'https://maps.example:443,*': { setting: 1 } } } } } }));
      await kA.start(pp.id, { why: 'test' });
      const rec = kA._reg().browsers[pp.id] || {};
      let maps = null; try { const pf = JSON.parse(fs.readFileSync(path.join(pr.dir, 'Default', 'Preferences'), 'utf8')); maps = ((((pf.profile || {}).content_settings || {}).exceptions || {}).geolocation || {})['https://maps.example:443,*'].setting; } catch { maps = 'unread'; }
      r = { launch: rec.launch, maps, arms: arms.slice() };
      try { await kA.stop(pp.id, { why: 'user' }); } catch { /* gone */ }
    } finally { K.create = realC; }
    return r;
  };
  const gA = await geoAttach(K, 'real');
  ok(!!gA && gA.launch === 'attach' && gA.maps === 2 && gA.arms.length === 1 && gA.arms[0].state === 'starting',
    'the attach road (r1707 (8)), a place: the profile\'s own stored denial written before its Chrome (the site allowed before now «block») and the hold armed while the record is still «starting» — fail closed on this road too', gA);
  const noGeoA = anchored(anchored(ksrcE, "\n    { const gs = await geoStoreAt(p, stockEnv && stockEnv.geolocation);", "\n    { const gs = { ok: true }; void geoStoreAt;", 'keeper RED attach store'), "\n    if (stockEnv && stockEnv.geolocation && stockEnv.geolocation.kind === 'place') await armGeo(p, rec, stockEnv.geolocation);", "\n    if (false) await armGeo(p, rec, stockEnv.geolocation);", 'keeper RED attach arm');
  const gAR = await geoAttach(MUTE.load('src/server/browser-keeper.js', noGeoA, 'geo-attach-off'), 'red');
  ok(!!gAR && gAR.launch === 'attach' && gAR.maps === 1 && gAR.arms.length === 0, 'RED — the attach road without its store and its arm: the site allowed before keeps «allow» and no place is armed (both legs go red on it)', gAR);
  for (const c of copiesCensus(MUTE.files, MUTE.dir, REPO, { label: 'B-9584 attach controls: ' })) ok(verdictOf(c.pass), c.name, c.detail);
}

fs.rmSync(S, { recursive: true, force: true });
console.log(`\n${fail ? '✗' : '✓'} test-browser-keeper-launch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';