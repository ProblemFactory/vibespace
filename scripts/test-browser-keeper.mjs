#!/usr/bin/env node
// lane one-browser-b1 (design q-026 r1 §2.1 / §2.4 / §3 row B1, 2026-10-16): THE ATTACH ROAD — on a machine with xpra the
// keeper spawns Google Chrome ITSELF on a display-only session and agent-browser attaches with `--cdp <port>`. FAST: a fake
// Chrome (node), a fake driver and a fake display keeper — no X, no real browser (the real one is test-browser-live ⑱).
//   ① the argv table + the census over the argv builder (--disable-sync FORBIDDEN, the two flags required) + RED controls
//   ② the port file's three states (PURE table + the real spawn/poll over the fake Chrome: new / stale / missing / exit) + RED
//   ③ the socket dir per config (the rule, the owned-dir check, the call shape) + RED: a shared dir lets close --all cross
//   ④ the keeper: start on the attach road, every driver call `--cdp` in the config's own root, stop, Chrome's own exit, the
//     driver road without xpra (said), a display that never came up, cdp_port_missing at the keeper, the boot, the reconcile
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, deadPort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AT = require('../src/browser-attach.js');
const ATL = require('../src/server/browser-attach-launch.js');
const B = require('../src/browser-profiles.js');
const BE = require('../src/browser-stderr.js');
const F = require('../src/browser-facts.js');
const DA = require('../src/desktop-apps.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
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

// ═══ ① THE ARGV ═══
console.log('— ① the argv table + the census');
const quiet = BE.QUIET_LOG_ARGS;
const av = AT.attachArgv({ profileDir: '/home/u/.agent-browser/vs-bp-0000000a', mark: B.keeperMarkArg('bp-0000000a'), quiet });
const WANT = ['--remote-debugging-port=0', '--user-data-dir=/home/u/.agent-browser/vs-bp-0000000a', '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11', '--disable-blink-features=AutomationControlled', '--disable-background-networking', '--password-store=basic', '--use-mock-keychain', '--disable-logging', '--log-level=3', '--vibespace-keeper=bp-0000000a', 'about:blank'];
ok(av.ok && JSON.stringify(av.argv) === JSON.stringify(WANT), 'the argv AS COMMITTED (design §2.1 + the profile store + the quiet switches + the launch mark + about:blank)', av);
ok(AT.argvVerdict(av.argv).ok && !av.argv.includes('--disable-sync'), 'its census: every required flag present, --disable-sync absent, one --user-data-dir');
ok(av.argv.includes('--disable-blink-features=AutomationControlled') && av.argv.includes('--disable-background-networking'), 'the two flags the brief names are on it (webdriver hidden; no Google traffic of Chrome\'s own)');
ok(!AT.attachArgv({ profileDir: 'relative/dir' }).ok && AT.attachArgv({ profileDir: 'relative/dir' }).code === 'bad_profile_dir', 'a relative profile dir is refused by name');
// THE CENSUS OVER THE ARGV BUILDER: no file of the attach road spells --disable-sync outside the FORBIDDEN declaration
const codeOf = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n');
// an ARGV literal: a quoted token with no space whose comma / newline parts include the flag (a sentence that NAMES the
// flag — the hidden-window words — is prose, not an argv); the one FORBIDDEN declaration is the rule itself
const syncCensus = (text) => { const code = codeOf(text); const decl = /ATTACH_FORBIDDEN = Object\.freeze\(\['--disable-sync'\]\)/.test(code); return (code.match(/(['"`])((?:(?!\1)[^\n\s])*)\1/g) || []).filter((m) => m.slice(1, -1).split(/,|\\n/).some((x) => x === '--disable-sync' || x.startsWith('--disable-sync='))).filter((m, i, all) => !(decl && m === "'--disable-sync'" && all.indexOf(m) === i)); };
const ATTACH_FILES = ['src/browser-attach.js', 'src/server/browser-attach-launch.js'];
const hits = ATTACH_FILES.flatMap((f) => syncCensus(fs.readFileSync(path.join(REPO, f), 'utf8')).map((m) => `${f}: ${m}`));
const ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
const attachFn = ks.slice(ks.indexOf('  async function attachStart('), ks.indexOf('  async function stop(profileId'));
ok(hits.length === 0 && attachFn.length > 2000 && syncCensus(attachFn).length === 0, `no literal --disable-sync on the attach road (${ATTACH_FILES.length} files + the keeper's attachStart, ${attachFn.length} chars) beyond the FORBIDDEN list`, hits);
ok(/AT\.attachArgv\(\{ profileDir: p\.dir, mark: B\.keeperMarkArg\(p\.id\), quiet: BE\.QUIET_LOG_ARGS \}\)/.test(attachFn) && /ATL\.spawnChrome\(\{ exe, argv: av\.argv,/.test(attachFn), 'the keeper spawns EXACTLY the builder\'s argv (no flag added beside it)');
ok(syncCensus("const ARGV = ['--remote-debugging-port=0', '--disable-sync'];").length === 1, 'CONTROL: a planted argv literal with --disable-sync is RED');
const noAC = mutant('src/browser-attach.js', "\n    '--disable-blink-features=AutomationControlled', '--disable-background-networking', ...PROFILE_STORE", "\n    '--disable-background-networking', ...PROFILE_STORE");
ok(!noAC.attachArgv({ profileDir: '/p' }).ok && AT.argvVerdict(['--remote-debugging-port=0', '--user-data-dir=/p', '--no-first-run', '--no-default-browser-check', '--ozone-platform=x11', '--disable-background-networking']).missing.join() === '--disable-blink-features=AutomationControlled', 'CONTROL: a builder that drops AutomationControlled is RED (its census names the missing flag)');
const withSync = mutant('src/browser-attach.js', "'--disable-background-networking', ...PROFILE_STORE", "'--disable-background-networking', '--disable-sync', ...PROFILE_STORE");
ok(!withSync.attachArgv({ profileDir: '/p' }).ok && syncCensus(fs.readFileSync(path.join(REPO, 'src/browser-attach.js'), 'utf8').replace("'--disable-background-networking', ...PROFILE_STORE", "'--disable-background-networking', '--disable-sync', ...PROFILE_STORE")).length === 1, 'CONTROL: a builder that adds --disable-sync is RED twice (its own census + the source census)');

// ═══ ② THE PORT FILE ═══
console.log('— ② the port file\'s three states');
const T0 = 1_792_000_000_000;
const pf = (text, mtimeMs) => AT.portFileVerdict({ text, mtimeMs, spawnedAt: T0 });
ok(pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0 + 160).state === 'new' && pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0 + 160).port === DP, 'new: written after the spawn, both lines ⇒ its port');
ok(pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0 - 60000).state === 'stale' && pf(`${DP}\n/devtools/browser/0b1f-aa\n`, T0).state === 'stale', 'stale: written before (or at) the spawn — a killed Chrome\'s dead port, never connected to');
ok(pf(null, null).state === 'missing' && pf(`${DP}\n`, T0 + 10).state === 'missing' && pf('x\ny', T0 + 10).state === 'missing', 'missing: absent, or a new file still half-written (keep polling)');
ok(AT.cdpUrlOf(DP, '/devtools/browser/0b1f-aa') === `ws://127.0.0.1:${DP}/devtools/browser/0b1f-aa` && B.isLoopbackCdpUrl(AT.cdpUrlOf(1, '/devtools/browser/x')), 'the cdpUrl is the loopback ws url a lease is handed');
ok(AT.portMissing({}).code === 'cdp_port_missing' && /never connects to a port this launch did not write/.test(AT.portMissing({}).error), 'the refusal is named cdp_port_missing');
const lax = mutant('src/browser-attach.js', 'if (!(Number(mtimeMs) > Number(spawnedAt))) return', 'if (false) return');
ok(lax.portFileVerdict({ text: `${DP}\n/devtools/browser/0b1f-aa\n`, mtimeMs: T0 - 60000, spawnedAt: T0 }).state === 'new', 'CONTROL: a verdict that ignores the mtime ACCEPTS the stale file (the table goes red on that row)');
// the real spawn + poll, over a fake Chrome (node): the modes ok / stale / never / exit
const FAKE_BIN = path.join(S, 'bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const STATE = path.join(S, 'state'); fs.mkdirSync(STATE, { recursive: true });
fs.writeFileSync(path.join(FAKE_BIN, 'google-chrome'), `#!${process.execPath}
const http = require('http'), fs = require('fs'), path = require('path');
const ST = process.env.FAKE_STATE; const args = process.argv.slice(2);
const udd = (args.find((a) => a.startsWith('--user-data-dir=')) || '').slice(16);
let mode = 'ok'; try { mode = fs.readFileSync(path.join(ST, 'chrome-mode'), 'utf8').trim(); } catch {}
try { mode = fs.readFileSync(path.join(ST, 'chrome-mode-' + udd.replace(/[^A-Za-z0-9]/g, '_')), 'utf8').trim(); } catch {} // one profile's own mode (the cdp_port_missing keeper leg)
fs.appendFileSync(path.join(ST, 'chrome.log'), JSON.stringify({ pid: process.pid, args, mode, DISPLAY: process.env.DISPLAY || null, XAUTHORITY: process.env.XAUTHORITY || null, TMPDIR: process.env.TMPDIR || null, ab: Object.keys(process.env).filter((k) => k.startsWith('AGENT_BROWSER_')) }) + '\\n');
process.on('SIGTERM', () => process.exit(0));
if (mode === 'exit') { console.error('ERROR: the profile appears to be in use by another Google Chrome process'); process.exit(21); }
const pfile = path.join(udd, 'DevToolsActivePort');
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ Browser: 'Chrome/154.0.8037.57', webSocketDebuggerUrl: 'ws://127.0.0.1:' + srv.address().port + '/devtools/browser/fake-0001' })); });
srv.listen(0, '127.0.0.1', () => setTimeout(() => {
  if (mode === 'ok') fs.writeFileSync(pfile, srv.address().port + '\\n/devtools/browser/fake-0001\\n');
  if (mode === 'stale') { fs.writeFileSync(pfile, '9\\n/devtools/browser/dead-0001\\n'); const t = new Date(Date.now() - 3600e3); fs.utimesSync(pfile, t, t); }
}, 120));
`, { mode: 0o755 });
const chromeLog = () => { try { return fs.readFileSync(path.join(STATE, 'chrome.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const setMode = (m) => fs.writeFileSync(path.join(STATE, 'chrome-mode'), m);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const baseEnv = { PATH: `${FAKE_BIN}:/usr/bin:/bin`, HOME: S, FAKE_STATE: STATE };
ok(ATL.chromeExecutable(baseEnv) === path.join(FAKE_BIN, 'google-chrome') && ATL.chromeExecutable({ PATH: path.join(S, 'nobin') }) === null, 'the executable: google-chrome first on the keeper\'s PATH (never process.env\'s); none ⇒ null');
const PD = path.join(S, 'profile-io'); fs.mkdirSync(PD, { recursive: true });
setMode('ok');
fs.writeFileSync(path.join(PD, 'DevToolsActivePort'), '9\n/devtools/browser/dead-0000\n'); // a killed Chrome's file — deleted BEFORE the spawn
let r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: ['--remote-debugging-port=0', `--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log') });
ok(r.ok && r.port > 9 && r.wsPath === '/devtools/browser/fake-0001' && alive(r.pid) && r.ms >= 100, 'new: the spawn deletes the stale file, waits for the NEW one and answers its port (never the dead 9)', { ...r, child: undefined });
try { process.kill(r.pid, 'SIGTERM'); } catch { }
setMode('stale');
let t = Date.now();
r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: [`--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log'), waitMs: 900 });
const stalePid = chromeLog().pop().pid; await until(() => !alive(stalePid));
ok(!r.ok && r.code === 'cdp_port_missing' && /stale one/.test(r.error) && Date.now() - t >= 900 && !alive(stalePid), 'stale: a port file older than the spawn is never taken — cdp_port_missing at the deadline, the Chrome it spawned ended', r);
setMode('never');
r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: [`--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log'), waitMs: 600 });
const neverPid = chromeLog().pop().pid; await until(() => !alive(neverPid));
ok(!r.ok && r.code === 'cdp_port_missing' && !/stale one/.test(r.error) && !alive(neverPid), 'missing: no file at all ⇒ cdp_port_missing, the Chrome ended', r);
setMode('exit');
r = await ATL.spawnChrome({ exe: path.join(FAKE_BIN, 'google-chrome'), argv: [`--user-data-dir=${PD}`], env: baseEnv, profileDir: PD, logFile: path.join(S, 'io.log'), waitMs: 3000 });
ok(!r.ok && r.code === 'launch_failed' && /exit code 21/.test(r.error) && /in use by another Google Chrome/.test(r.error), 'an early exit is said with its code and its last words (the log FILE, never a pipe) — launch_failed, never the deadline\'s cdp_port_missing: it was seen before the deadline', r);

// ═══ ③ THE SOCKET DIR PER CONFIG ═══
console.log('— ③ the socket dir per config');
const sa = AT.attachSocketDir({ base: '/tmp', uid: 1000, profileId: 'bp-0000000a' });
const sb = AT.attachSocketDir({ base: '/tmp', uid: 1000, profileId: 'bp-0000000b' });
ok(sa.dir === '/tmp/vs-ab-1000/bp-0000000a' && sb.dir === '/tmp/vs-ab-1000/bp-0000000b' && sa.parent === sb.parent && sa.dir !== sb.dir, 'one dir per config under the short per-uid root (browser-profiles\' vs-ab-<uid>)', { sa, sb });
ok(sa.fits && sa.bytes === sa.dir.length + 50 && sa.bytes <= 103 && !AT.attachSocketDir({ base: '/tmp/' + 'x'.repeat(40), uid: 1000, profileId: 'bp-0000000a' }).fits, 'the socket path stays within 103 bytes (a long base is refused, never emitted)');
ok(AT.attachSocketDir({ profileId: '../etc' }).dir === null && AT.attachSocketDir({ base: '/tmp;rm', uid: 1, profileId: 'bp-1' }).dir === '/tmp/vs-ab-1/bp-1', 'a profile id that is not one names no dir; a base with shell syntax falls back to /tmp');
const call = AT.attachCall(['tab', 'list', '--json'], { AGENT_BROWSER_SESSION: 'vs-bk-1', AGENT_BROWSER_PROFILE: '/x', AGENT_BROWSER_CDP: 'ws://127.0.0.1:9/x', AGENT_BROWSER_HEADED: '1', AGENT_BROWSER_EXECUTABLE_PATH: '/e', AGENT_BROWSER_SOCKET_DIR: '/run/user/1/agent-browser', AGENT_BROWSER_CONFIG: '/c/machine.json' }, { cdp: `ws://127.0.0.1:${DP}/devtools/browser/0b1f`, socketDir: sa.dir });
ok(JSON.stringify(call.args) === JSON.stringify(['--cdp', `ws://127.0.0.1:${DP}/devtools/browser/0b1f`, 'tab', 'list', '--json']) && call.env.AGENT_BROWSER_SOCKET_DIR === sa.dir && !('AGENT_BROWSER_PROFILE' in call.env) && !('AGENT_BROWSER_CDP' in call.env) && !('AGENT_BROWSER_HEADED' in call.env) && !('AGENT_BROWSER_EXECUTABLE_PATH' in call.env) && call.env.AGENT_BROWSER_SESSION === 'vs-bk-1', 'a call: --cdp <the ws url> FIRST, no launch key in its env, the config\'s own socket root', call);
const SOCKBASE = path.join(S, 's'); fs.mkdirSync(SOCKBASE, { recursive: true }); // production's base is /tmp (it exists)
const own = ATL.ensureSocketDir(AT.attachSocketDir({ base: SOCKBASE, uid: process.getuid(), profileId: 'bp-0000000a' }));
ok(own.ok && (fs.statSync(own.dir).mode & 0o777) === 0o700 && (fs.statSync(path.dirname(own.dir)).mode & 0o777) === 0o700, 'made 0700, the per-uid root too', own);
fs.symlinkSync('/tmp', path.join(path.dirname(own.dir), 'bp-0000000c'));
const planted = ATL.ensureSocketDir(AT.attachSocketDir({ base: SOCKBASE, uid: process.getuid(), profileId: 'bp-0000000c' }));
ok(!planted.ok && planted.code === 'socket_dir_unavailable' && /SYMLINK/.test(planted.error), 'a planted symlink at a config\'s name is refused by name (a socket never lands in somebody else\'s directory)', planted);
ok(B.attachedEnvFor({ browserKey: 'bk-00000001', profileId: 'bp-0000000a', cdpUrl: `ws://127.0.0.1:${DP}/devtools/browser/x`, socketDir: sa.dir }).includes(`AGENT_BROWSER_SOCKET_DIR=${sa.dir}`) && !B.attachedEnvFor({ browserKey: 'bk-00000001', profileId: 'bp-0000000a', cdpUrl: `ws://127.0.0.1:${DP}/devtools/browser/x` }).some((kv) => kv.startsWith('AGENT_BROWSER_SOCKET_DIR=')), 'the agent\'s pairs name the config\'s root on the attach road only (the CLI sets it last — the same daemon as the keeper\'s calls)');

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
ok(vA.state === 'ready' && recA.launch === 'attach' && /own display \(xpra\)/.test(recA.launchWhy) && recA.displaySession && recA.displaySession.id === 'da-fake-1' && recA.displaySession.display === ':91', 'start: the ATTACH road on a machine with xpra — the record says which road and why, and names its display session', { launch: recA.launch, why: recA.launchWhy, ds: recA.displaySession });
ok(dcalls[0][0] === 'launch' && dcalls[0][1] === pA.id && dcalls[0][2] === 'Work' && recA.pid === cl.pid && alive(recA.pid) && Number.isInteger(recA.starttime), 'the display-only session asked for THIS profile; the record\'s process IS the spawned Chrome (pid + starttime)', { dcalls, pid: recA.pid, cl: cl.pid });
ok(JSON.stringify(cl.args) === JSON.stringify(AT.attachArgv({ profileDir: pA.dir, mark: B.keeperMarkArg(pA.id), quiet }).argv), 'Chrome ran with the argv table\'s argv for its profile (mark + quiet switches; no --disable-sync)', cl.args);
ok(cl.DISPLAY === ':91' && cl.XAUTHORITY === path.join(S, 'xauth-da-fake-1') && cl.ab.length === 0 && cl.TMPDIR && cl.TMPDIR.startsWith(DATA), 'its env: the display session\'s DISPLAY + XAUTHORITY, the keeper\'s short TMPDIR, NO AGENT_BROWSER_* key (a leaked server one dropped)', cl);
ok(B.isLoopbackCdpUrl(recA.cdpUrl) && recA.cdpUrl.endsWith('/devtools/browser/fake-0001') && recA.cdpPort === Number(new URL(recA.cdpUrl).port) && recA.browser.pid === recA.pid && recA.cdpBrowser === 'Chrome/154.0.8037.57', 'the cdpUrl = the NEW port file\'s ws url (the endpoint asked: its build recorded)', { cdpUrl: recA.cdpUrl, port: recA.cdpPort, b: recA.cdpBrowser });
ok(recA.socketDir === path.join(SOCKBASE, `vs-ab-${process.getuid()}`, pA.id) && fs.statSync(recA.socketDir).isDirectory(), 'its socket dir is the config\'s own', recA.socketDir);
ok(launches().length === 0 && abLog().every((c) => c.argv[0] !== 'open'), 'the driver never launched a browser for it');
// every driver call on the attach record: --cdp first, the config's root, never a directory or the LAUNCH file
const o = await k.leaseCliOpts(pA.id, 'bk-00000001');
ok(o && o.extraEnv.AGENT_BROWSER_CDP === recA.cdpUrl, 'a lease\'s options carry the record\'s url (leaseCdpUrl unchanged)', o);
const rt0 = abLog().length;
// the keeper's own (configured) runtime under the LEASE's session — the shape of every agentTabAct / tab / stream call
await k._runtime.exec(k.nsOf(pA.id), ['tab', 'list', '--json'], o);
await k._runtime.streamPort(k.nsOf(pA.id), { session: o.session, extraEnv: o.extraEnv });
const viaRuntime = abLog().slice(rt0);
ok(viaRuntime.length >= 2 && viaRuntime.every((c) => c.cdp === recA.cdpUrl && c.cdp === o.extraEnv.AGENT_BROWSER_CDP && c.root === recA.socketDir && c.profile === null && c.envCdp === null && c.headed === null && c.ns === 'vs-' + pA.id && c.sess === o.session && path.basename(c.config || '') === 'machine.json'), 'a lease-session call (tab list, the stream\'s status) runs `--cdp <the SAME ws url the agent\'s pairs carry>` FIRST in the config\'s own root — no profile dir, no env CDP, no launch key, the lease file', viaRuntime);
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
ok(closeAll && closeAll.cdp === recA.cdpUrl && closeAll.root === recA.socketDir && closeAll.profile === null && closeAll.envCdp === null && closeAll.headed === null && closeAll.ns === 'vs-' + pA.id, 'stop: the driver\'s close --all ran `--cdp <its ws url>` in the config\'s own root, no profile dir, no launch key', closeAll);
ok(closeAll && closeAll.config && path.basename(closeAll.config) === 'machine.json', '…naming the LEASE file (the one the agent\'s own commands name), never the launch file machine-<id>.json', closeAll && closeAll.config);
await until(() => !alive(chromeA) && dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fake-1'));
ok(vA.state === 'stopped' && !alive(chromeA) && dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fake-1') && !dlive.has('da-fake-1'), 'the Chrome was ended by its identity and its display session went with it', { state: vA.state, dcalls });
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
ok(recB2.state === 'stopped' && /the browser exited/.test(recB2.lastError) && dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fake-2'), 'its Chrome died ⇒ the tick records "the browser exited" and stops its display session', { state: recB2.state, err: recB2.lastError });
// THE HEAL: an attach Chrome that dies under a HOLDER is started again by the tick — bounded by the driver road's budget
{
  const liveH = new Set(['bk-0000000e']);
  const kh = mk({ dataDir: path.join(S, 'data-heal'), liveKeys: () => liveH });
  const pH = kh.createProfile({ label: 'Held' }, { owner: { kind: 'instance', id: null } });
  setMode('ok');
  let held = null; try { held = await kh.attach({ profileId: pH.id, browserKey: 'bk-0000000e', by: 'agent' }); } catch (e) { held = { error: e && e.message }; }
  const holders = () => kh.leasesOn(pH.id).length;
  ok(kh._reg().browsers[pH.id] && kh._reg().browsers[pH.id].launch === 'attach' && holders() === 1, 'a conversation holds an attach browser (a lease)', held && held.error);
  const pids = [kh._reg().browsers[pH.id].pid];
  for (let i = 1; i <= 3; i++) {
    process.kill(pids[pids.length - 1], 'SIGKILL'); await sleep(250);
    await kh.tick();
    const back = await (async () => { for (let j = 0; j < 80; j++) { const r0 = kh._reg().browsers[pH.id]; if (r0 && r0.state === 'ready' && r0.pid !== pids[pids.length - 1] && alive(r0.pid)) return r0; await sleep(100); } return null; })();
    ok(back && back.launch === 'attach', `heal ${i}: its Chrome killed under the lease ⇒ the tick starts it again on the attach road (a new Chrome pid ${back && back.pid}, a new display session ${back && back.displaySession && back.displaySession.id})`);
    if (!back) break;
    pids.push(back.pid);
  }
  process.kill(pids[pids.length - 1], 'SIGKILL'); await sleep(250);
  await kh.tick(); await sleep(400);
  const last = kh._reg().browsers[pH.id];
  ok(last.state === 'stopped' && /closed 3 times in 10 min, so it is not started again by itself; the next command starts it/.test(last.lastError || ''), 'the 4th closure inside the window: NOT started again (the budget), said on the record', last.lastError);
  const pU = kh.createProfile({ label: 'Unheld' }, { owner: { kind: 'instance', id: null } });
  await kh.start(pU.id, { why: 'test' });
  const pidU = kh._reg().browsers[pU.id].pid;
  process.kill(pidU, 'SIGKILL'); await sleep(250); await kh.tick(); await sleep(400);
  ok(kh._reg().browsers[pU.id].state === 'stopped' && !kh._reg().browsers[pU.id].displaySession === false && !dlive.has(kh._reg().browsers[pU.id].displaySession.id), 'nobody holds it ⇒ no heal (stopped, its display gone; the next command starts it)');
  await kh.stop(pH.id, { why: 'user' }).catch(() => { });
}
// THE DRIVER ROAD: no xpra on the machine ⇒ today's launch, said on the record
fakeXpra = false;
const pC = k.createProfile({ label: 'Plain' }, { owner: { kind: 'instance', id: null } });
const nD = dcalls.length;
const vC = await k.start(pC.id, { why: 'test' });
const recC = k._reg().browsers[pC.id];
ok(vC.state === 'ready' && recC.launch === 'driver' && recC.launchWhy === AT.HIDDEN_WINDOW_WHY && /cannot sign in to Google/.test(recC.launchWhy) && launches().some((l) => l.ns === 'vs-' + pC.id) && dcalls.length === nD && !recC.displaySession, 'no xpra ⇒ the DRIVER road (the hidden window): its launch ran, no display session, the record says it cannot sign in', { launch: recC.launch, why: recC.launchWhy });
await k.stop(pC.id, { why: 'user' });
fakeXpra = true;
// the display session never came up ⇒ the driver road, said
fakeDisplayFail = true;
const pD = k.createProfile({ label: 'NoDisplay' }, { owner: { kind: 'instance', id: null } });
const vD = await k.start(pD.id, { why: 'test' });
const recD = k._reg().browsers[pD.id];
ok(vD.state === 'ready' && recD.launch === 'driver' && /its display session did not come up \(xpra exited \(code 1\)\)/.test(recD.launchWhy) && dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-fail'), 'a display session that failed ⇒ stopped, the driver road runs, the record says why', recD.launchWhy);
await k.stop(pD.id, { why: 'user' });
fakeDisplayFail = false;
// cdp_port_missing AT THE KEEPER (started before Chrome's own exit, on its own keeper): a Chrome that never writes its port
// ⇒ refused by name, nothing left running
const err = await muteRun;
const muteChrome = chromeLog().find((l) => l.mode === 'never' && l.args.includes(`--user-data-dir=${pE.dir}`)) || {}; await until(() => !alive(muteChrome.pid));
const recE = kM._reg().browsers[pE.id];
ok(err && err.code === 'cdp_port_missing' && recE.state === 'failed' && Number.isInteger(muteChrome.pid) && !alive(muteChrome.pid) && Date.now() - tE >= AT.PORT_WAIT_MS && !DM.live.has(recE.displaySession && recE.displaySession.id), 'a Chrome that writes no port in 5 s ⇒ cdp_port_missing by name, the record failed, the Chrome ended, its display stopped', { code: err && err.code, state: recE.state });
// THE BOOT: a new keeper on the same data adopts a live attach record by Chrome's identity + its CDP answer
setMode('ok');
vA = await k.start(pA.id, { why: 'test' });
const pidA = k._reg().browsers[pA.id].pid;
k.shutdown?.();
const k2 = mk();
await k2.adoptAll();
const recA2 = k2._reg().browsers[pA.id];
ok(recA2.state === 'ready' && recA2.adoptedAt && recA2.pid === pidA && recA2.launch === 'attach', 'boot: the attach record is ADOPTED (Chrome is ours by pid + starttime, its endpoint answers)', { state: recA2.state, pid: recA2.pid });
// THE RECONCILE: a display-only session no live record names is stopped by the next tick
dlive.set('da-orphan', { id: 'da-orphan', kind: DA.DISPLAY_FOR_BROWSER, forBrowser: pB.id, state: 'ready', display: ':99' });
await k2.tick();
await sleep(50);
ok(!dlive.has('da-orphan') && dcalls.some((c) => c[0] === 'stop' && c[1] === 'da-orphan') && dlive.has(recA2.displaySession.id), 'the tick stops a display session whose browser record is not live (and keeps the one a live record names)');
await k2.stop(pA.id, { why: 'user' });
// the wiring pins: the road decided in start() before the display fact; the api seam
ok(/const road = AT\.launchRoad\(\{ local: true, starts: !!prow\.starts, ownLaunch: argvPrefix\.length > 0 \|\| prow\.executable === 'installed', headed: headed0, wired: !!displayKeeper, driverVersion: displayKeeper \? \(\(await cliNow\(\)\) \|\| \{\}\)\.version \|\| null : null, xpra: await displayHasXpra\(\), exe: attachExe \}\);/.test(ks) && /setDisplaySessions: \(dk\) =>/.test(ks), 'the keeper decides the road before the driver\'s display fact; server.js wires the desktop keeper through setDisplaySessions');
ok(/browserKeeper\?\.setDisplaySessions\?\.\(desktopKeeper\)/.test(fs.readFileSync(path.join(REPO, 'server.js'), 'utf8')), 'server.js hands the desktop keeper over');
// the road table (PURE)
const R = (o) => AT.launchRoad({ local: true, starts: true, ownLaunch: false, headed: null, wired: true, driverVersion: '0.38.2', xpra: true, exe: '/usr/bin/google-chrome', ...o });
ok(R({}).launch === 'attach' && R({ headed: true }).launch === 'attach' && R({ driverVersion: '0.39.0' }).launch === 'attach', 'the road: xpra + a Chrome + the display keeper + the measured driver (0.38.2, or newer) ⇒ attach');
ok([R({ xpra: false }), R({ exe: null }), R({ wired: false }), R({ headed: false }), R({ ownLaunch: true }), R({ local: false }), R({ starts: false }), R({ driverVersion: '0.38.1' }), R({ driverVersion: null })].every((x) => x.launch === 'driver' && x.why), 'everything else ⇒ the driver road, each with its why (an older or unknown driver too: the attach facts are 0.38.2\'s)');
ok(/older than 0\.38\.2, the version the attach road was measured on/.test(R({ driverVersion: '0.38.1' }).why) && AT.driverAtLeast('agent-browser 0.38.2') && !AT.driverAtLeast('0.38.1') && AT.driverAtLeast('1.0.0') && !AT.driverAtLeast(''), 'the driver gate says the version it saw and the one it needs');
// ═══ ⑥ LANE BROWSER-X-IN-WINDOW (design q-026 r1 §2.1 / §3 row B2): THE PICTURE SWITCH's verdict wiring ═══
// The keeper's three doors over a FAKE CDP (the window calls the keeper makes — Browser.getWindowBounds / getWindowForTarget /
// setWindowBounds, answered from a window map) and a FAKE display keeper whose `windows(id)` rows ARE that map (MEASURED: CDP
// bounds = the X geometry): the source verdict from the record, the holder's X window by its OWN window's bounds, the
// two-twins ambiguity resolved by a one-pixel move, Chrome's own dialog window said to the holder it is over and to no other.
console.log('— ⑥ lane browser-x-in-window: the picture source, the holder\'s X window, Chrome\'s own dialog windows');
{
  const { WebSocketServer } = require('ws');
  const net = require('net');
  const freeP = () => new Promise((r) => { const s0 = net.createServer(); s0.listen(0, '127.0.0.1', () => { const pt = s0.address().port; s0.close(() => r(pt)); }); });
  const PDIR = path.join(S, 'pic-profile');
  const INSTX = `google-chrome (${PDIR})`;
  // windowId → { xid, bounds }; two holders' windows + the launch window
  const wins = new Map([[11, { xid: 0x400003, bounds: { left: 10, top: 10, width: 1050, height: 980, windowState: 'normal' } }], [12, { xid: 0x40000c, bounds: { left: 20, top: 20, width: 1050, height: 980, windowState: 'normal' } }], [13, { xid: 0x40000f, bounds: { left: 300, top: 120, width: 900, height: 700, windowState: 'normal' } }]]);
  const tabWin = { 'TAB-A': 12, 'TAB-B': 13 };
  const cdpCalls = [];
  const port = await freeP();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' }); await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (ws) => ws.on('message', (d) => {
    const m = JSON.parse(d); cdpCalls.push(m); const reply = (o) => ws.send(JSON.stringify({ id: m.id, ...o }));
    if (m.method === 'Browser.getWindowBounds') { const w = wins.get(m.params.windowId); return reply(w ? { result: { bounds: { ...w.bounds } } } : { error: { message: 'no window' } }); }
    if (m.method === 'Browser.getWindowForTarget') { const id = tabWin[m.params.targetId]; return reply(id ? { result: { windowId: id, bounds: { ...wins.get(id).bounds } } } : { error: { message: 'no target' } }); }
    if (m.method === 'Browser.setWindowBounds') { const w = wins.get(m.params.windowId); if (w) Object.assign(w.bounds, m.params.bounds); return reply({ result: {} }); }
    return reply({ result: {} });
  }));
  const CHOOSER_X = { id: 0x60000a, title: 'Open File', instance: 'chrome', cls: 'Chrome', x: 330, y: 160, w: 700, h: 500, depth: 2, frame: 0x20002a };
  let dialogs = [];
  const rowsNow = () => [...dialogs, ...[...wins.values()].reverse().map((w) => ({ id: w.xid, title: 'x - Google Chrome', instance: INSTX, cls: 'Google-chrome', x: w.bounds.left, y: w.bounds.top, w: w.bounds.width, h: w.bounds.height, depth: 2, frame: w.xid + 1 })), { id: 0x600001, title: 'chrome', instance: 'chrome', cls: 'Chrome', x: 10, y: 10, w: 10, h: 10, depth: 1 }];
  const winCalls = [];
  const DKP = { facts: async () => ({ bins: { xpra: '/usr/bin/xpra', xauth: '/usr/bin/xauth' } }), launchDisplay: async () => null, x11EnvFor: () => null, stop: async () => null, liveRecords: () => [], windows: async (id) => { winCalls.push(id); return { ok: true, windows: rowsNow() }; } };
  const kP = mk({ dataDir: path.join(S, 'data-pic'), displaySessions: DKP });
  const pP = kP.createProfile({ label: 'Pic' }, { owner: { kind: 'instance', id: null } });
  const prof = kP._reg().profiles.find((x) => x.id === pP.id); prof.dir = PDIR;
  const startedAt = Date.now();
  kP._reg().browsers[pP.id] = { profileId: pP.id, state: 'ready', launch: 'attach', launchWhy: 'Google Chrome on its own display (xpra)', displaySession: { id: 'da-pic', display: ':93' }, cdpUrl: `ws://127.0.0.1:${port}/devtools/browser/fake-pic`, startedAt, host: 'this-box' };
  kP._reg().leases.push({ profileId: pP.id, browserKey: 'bk-0000pa01', sessionId: 'sA', windowId: 12, windowIn: String(startedAt), targetId: 'TAB-A', since: startedAt });
  kP._reg().leases.push({ profileId: pP.id, browserKey: 'bk-0000pb02', sessionId: 'sB', targetId: 'TAB-B', since: startedAt });
  const v = kP.pictureSourceFor(pP.id);
  ok(v.source === 'x' && v.why === 'attach' && v.displaySession === 'da-pic', `the keeper's verdict: the attach record ⇒ 'x' on its display session (${JSON.stringify(v)})`);
  const xa = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pa01' });
  ok(xa.wid === 0x40000c && xa.why === 'bounds' && xa.windowId === 12 && cdpCalls.some((m) => m.method === 'Browser.getWindowBounds' && m.params.windowId === 12), `A's X window = its OWN window's bounds matched against the display's rows (${xa.wid && xa.wid.toString(16)})`, xa);
  const xb = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pb02' });
  ok(xb.wid === 0x40000f && xb.windowId === 13 && cdpCalls.some((m) => m.method === 'Browser.getWindowForTarget' && m.params.targetId === 'TAB-B'), "B (no window of its own stamped): the window of its tab (getWindowForTarget) ⇒ its X window", xb);
  ok(winCalls.length >= 1 && winCalls.every((id) => id === 'da-pic'), "the rows are the desktop keeper's own windows(id) of the record's display session (no spawn of the keeper's)", winCalls);
  // two windows with the very bounds ⇒ A's moved one pixel, asked again
  Object.assign(wins.get(13).bounds, { left: 20, top: 20, width: 1050, height: 980 });
  const set0 = cdpCalls.filter((m) => m.method === 'Browser.setWindowBounds').length;
  await new Promise((r) => setTimeout(r, 800)); // past the rows' 750 ms memo
  const xa2 = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pa01' });
  const nudge = cdpCalls.filter((m) => m.method === 'Browser.setWindowBounds').slice(set0);
  ok(xa2.wid === 0x40000c && nudge.length >= 1 && nudge.some((m) => m.params.windowId === 12 && m.params.bounds.left === 21) && wins.get(12).bounds.left === 21, 'TWINS (two windows, one geometry) ⇒ its window is moved ONE pixel and told apart', { xa2, nudge });
  // Chrome's own dialog window over B's window: said to B, never to A
  dialogs = [{ ...CHOOSER_X, x: 300 + 100, y: 20 + 100 }];
  Object.assign(wins.get(13).bounds, { left: 300, top: 120, width: 900, height: 700 });
  await new Promise((r) => setTimeout(r, 800));
  const dB = await kP.nativeDialogsFor(pP.id, { browserKey: 'bk-0000pb02' });
  const dA = await kP.nativeDialogsFor(pP.id, { browserKey: 'bk-0000pa01' });
  ok(dB.length === 1 && dB[0].title === 'Open File' && dA.length === 0, `Chrome's own "Open File" over B's window is B's (${dB.map((x) => x.title)}) — never A's (${dA.length})`, { dA, dB });
  kP._reg().browsers[pP.id] = { ...kP._reg().browsers[pP.id], launch: 'driver', launchWhy: AT.HIDDEN_WINDOW_WHY, displaySession: null };
  const xd = await kP.xWindowFor(pP.id, { browserKey: 'bk-0000pa01' });
  ok(kP.pictureSourceFor(pP.id).source === 'screencast' && xd.wid === null && xd.why === 'no-display' && (await kP.nativeDialogsFor(pP.id, { browserKey: 'bk-0000pa01' })).length === 0, "a driver-road record: the screencast, no X window, no dialog window asked", xd);
  kP._reg().browsers[pP.id] = { ...kP._reg().browsers[pP.id], launch: 'attach', displaySession: { id: 'da-pic', display: ':93' }, hostId: 'h-mac' };
  ok(kP.pictureSourceFor(pP.id).why === 'remote', 'a paired machine\'s record keeps the screencast (remote)');
  wss.close();
}

fs.rmSync(S, { recursive: true, force: true });
console.log(`\n${fail ? '✗' : '✓'} test-browser-keeper: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
