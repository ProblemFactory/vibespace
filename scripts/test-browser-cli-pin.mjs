#!/usr/bin/env node
// LANE BROWSER-ADMIN 2b — THE BROWSER CLI VERSION VIBESPACE DRIVES (the owner, 2026-09-30: "不能pin指定版本" — the CLI half).
// Fast, in-process: a fake `npm` and a fake agent-browser on a scratch PATH, port 0, scratch only, no download.
//
//   ① PURE (src/browser-verbs.js): the setting's three modes, the install verdict's order, the native-binary naming the
//      package's own launcher uses, the pin file's rule (a path INSIDE data/browser-tools only), and THE RESOLVE RUNG
//      ORDER — the pinned install FIRST, then PATH; a pin that is missing or a shim is skipped (PATH answers);
//   ② the REAL keeper: `browser.cli` = path / pinned / x.y.z read live; the install = ONE `npm install --prefix
//      <data>/browser-tools/agent-browser-<v> --no-save --ignore-scripts agent-browser@<v>` (the registry only) in THE
//      install slot cloak's install uses (never two at once — either way), verified off the folder AND the program's own
//      --version; the pin file follows the setting; the keeper's runtime then RUNS the pinned binary; a restart mid-install
//      RE-ATTACHES (no second install) and a dead install's result is verified;
//   ③ the agent's CLI reads the pin beside itself (data/bin/vibespace-browser) and browser-env judges the floor on it;
//   ④ the routes: GET /api/browser/cli, POST /api/browser/cli/install — an agent's token refused by name (and the cloak
//      install's POST too: a download is the user's act);
//   ⑤ the client words (en / zh / ja) + the panel wiring;
//   ⑥ patched copies as controls.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fn(); } catch { v = false; } if (v) return true; if (Date.now() - t0 > ms) return false; await sleep(40); } };

const V = require('../src/browser-verbs.js');
const ROOT = scratch('badm');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
const kids = new Set();
process.on('exit', () => { fake.reap(); for (const c of kids) { try { process.kill(c, 'SIGKILL'); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const NATIVE = V.cliNativeName({ platform: process.platform, arch: process.arch, musl: false });
// THE FAKE npm: records its argv, then (after FAKE_NPM_DELAY_MS) writes the package the way the registry's tarball lays it
// out — package.json + the platform's native binary — whose `--version` says the version and every other call logs itself
// (PINNED_LOG) and runs the shared fake agent-browser
const NPM_LOG = path.join(ROOT, 'npm.log'), PINNED_LOG = path.join(ROOT, 'pinned.log');
fs.writeFileSync(path.join(ROOT, 'bin', 'npm'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(NPM_LOG)}, JSON.stringify({ argv, pid: process.pid }) + '\\n');
if (process.env.FAKE_NPM_FAIL) process.exit(1);
if (process.env.FAKE_NPM_HANG) { setInterval(() => {}, 1e9); return; } // verify r1 (F8): a registry that stalls — npm never ends by itself
const prefix = argv[argv.indexOf('--prefix') + 1]; const spec = argv.find((a) => /^agent-browser@/.test(a));
// verify r1 (F3): any other package (the CloakBrowser install's npm step) — sleeps the delay, writes nothing, exits 0
if (!spec) { setTimeout(() => process.exit(0), Number(process.env.FAKE_NPM_DELAY_MS || 0)); } else {
const v = spec.split('@')[1];
// verify r1 (F2): what a REAL npm leaves on disk seconds before it ends — package.json + the 0755 launcher first, the native
// binaries filling in (measured: the 0.38.1 tarball extracts in place, ~114 MB) — so a pin read mid-install sees a program
if (process.env.FAKE_NPM_EARLY) { const pkg = path.join(prefix, 'node_modules', 'agent-browser'); fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true }); fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'agent-browser', version: v, bin: { 'agent-browser': './bin/agent-browser.js' } })); fs.writeFileSync(path.join(pkg, 'bin', 'agent-browser.js'), '#!' + process.execPath + '\\nconsole.log("agent-browser ' + v + '");\\n', { mode: 0o755 }); fs.writeFileSync(path.join(pkg, 'bin', ${JSON.stringify(NATIVE)}), '', { mode: 0o644 }); }
setTimeout(() => {
  const pkg = path.join(prefix, 'node_modules', 'agent-browser'); fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'agent-browser', version: process.env.FAKE_NPM_WRONG || v, bin: { 'agent-browser': './bin/agent-browser.js' } }));
  const say = process.env.FAKE_NPM_SAYS || v;
  fs.writeFileSync(path.join(pkg, 'bin', ${JSON.stringify(NATIVE)}), '#!' + process.execPath + '\\nconst a = process.argv.slice(2); if (a[0] === "--version") { console.log("agent-browser " + ' + JSON.stringify(say) + '); process.exit(0); }\\nrequire("fs").appendFileSync(' + JSON.stringify(${JSON.stringify(PINNED_LOG)}) + ', JSON.stringify(a) + "\\\\n");\\nconst r = require("child_process").spawnSync(' + JSON.stringify(${JSON.stringify(fake.bin)}) + ', a, { stdio: "inherit", env: Object.assign({}, process.env, { FAKE_AB_VERSION: ' + JSON.stringify(say) + ' }) }); process.exit(r.status ?? 1);\\n', { mode: 0o644 }); // the registry tarball ships it 0644 (measured) — the keeper makes it executable at verify
  process.exit(0);
}, Number(process.env.FAKE_NPM_DELAY_MS || 0));
}
`, { mode: 0o755 });
const npmCalls = () => { try { return fs.readFileSync(NPM_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const pinnedCalls = () => { try { return fs.readFileSync(PINNED_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

// ═══ ① PURE ═══════════════════════════════════════════════════════════════════
console.log('— ① PURE: the setting, the install verdict, the native name, the pin file, THE resolve rung order');
function judgeRungs(VV) {
  const bad = [];
  const exists = (p) => ['/pin/agent-browser-linux-x64', '/nvm/bin/agent-browser', '/shim/agent-browser', '/pinshim'].includes(p);
  const isShim = (p) => p === '/shim/agent-browser' || p === '/pinshim';
  const R = (o) => VV.resolveRealBinary({ PATH: '/shim:/nvm/bin', shimDirs: ['/shim'], exists, isShim, ...o });
  const a = R({ pinned: '/pin/agent-browser-linux-x64' });
  if (!(a.ok && a.path === '/pin/agent-browser-linux-x64' && a.pinned === true)) bad.push('the pinned install is the FIRST rung: ' + JSON.stringify(a));
  const b = R({ pinned: '/pin/missing' });
  if (!(b.ok && b.path === '/nvm/bin/agent-browser' && !b.pinned)) bad.push('a missing pin falls to PATH: ' + JSON.stringify(b));
  const c = R({ pinned: '/pinshim' });
  if (!(c.ok && c.path === '/nvm/bin/agent-browser')) bad.push('a pin that is a SHIM is never run: ' + JSON.stringify(c));
  const d = R({ pinned: 'relative/agent-browser' });
  if (!(d.ok && d.path === '/nvm/bin/agent-browser')) bad.push('a relative pin is no pin: ' + JSON.stringify(d));
  const e = R({});
  if (!(e.ok && e.path === '/nvm/bin/agent-browser' && !e.pinned)) bad.push('no pin = PATH as before: ' + JSON.stringify(e));
  return bad;
}
{
  const C = V.cliChoiceOf;
  ok(C('').mode === 'path' && C('path').mode === 'path' && C('pinned').mode === 'pinned' && C('pinned').version === V.TABLE_VERSION && C(V.TABLE_VERSION).mode === 'pinned' && C('0.39.2').mode === 'version' && C('0.39.2').version === '0.39.2' && C('latest').mode === 'path' && C('latest').invalid === 'latest' && C('1.2').mode === 'path',
    'the setting: path (as before) · pinned (= the measured version) · a version you name · anything else ⇒ path, said (`invalid`)');
  ok(V.CLI_PIN_RECORD.version === V.TABLE_VERSION && V.CLI_PIN_RECORD.registryHost === 'registry.npmjs.org' && V.CLI_PIN_RECORD.tarballBytes > 1e7 && V.CLI_PIN_RECORD.unpackedBytes > V.CLI_PIN_RECORD.tarballBytes && /^\d{4}-\d{2}-\d{2}$/.test(V.CLI_PIN_RECORD.measured),
    'the measured package record names THE version the flag table was measured on, the ONE host, its sizes, its date');
  ok(V.cliNativeName({ platform: 'linux', arch: 'x64' }) === 'agent-browser-linux-x64' && V.cliNativeName({ platform: 'linux', arch: 'arm64', musl: true }) === 'agent-browser-linux-musl-arm64' && V.cliNativeName({ platform: 'darwin', arch: 'arm64' }) === 'agent-browser-darwin-arm64'
    && V.cliNativeName({ platform: 'win32', arch: 'arm64' }) === 'agent-browser-win32-x64.exe' && V.cliNativeName({ platform: 'aix', arch: 'x64' }) === null, 'the native binary is named as the package\'s own launcher names it (0.38.1 bin/agent-browser.js, mirrored)');
  const IV = (o) => V.cliInstallVerdict(o);
  ok(IV({ version: 'x' }).code === 'bad-request' && IV({ host: 'mac' }).code === 'install_local_only' && IV({ running: true }).code === 'install_running' && IV({ installed: { ok: true, version: V.TABLE_VERSION, path: '/x' } }).code === 'already_installed' && IV({ npm: false }).code === 'install_unavailable'
    && IV({}).ok && IV({}).spec === 'agent-browser@' + V.TABLE_VERSION && IV({}).record === V.CLI_PIN_RECORD && IV({ version: '0.39.2' }).record === null, 'the install verdict, in its order (version · this machine · the slot · already there · npm); the measured numbers ride only the measured version');
  ok(V.cliPinVerdict({ path: '/d/browser-tools/agent-browser-0.38.1/node_modules/agent-browser/bin/x' }, { toolsDir: '/d/browser-tools' }) !== null && V.cliPinVerdict({ path: '/usr/bin/agent-browser' }, { toolsDir: '/d/browser-tools' }) === null
    && V.cliPinVerdict({ path: '/d/browser-tools/../evil' }, { toolsDir: '/d/browser-tools' }) === null && V.cliPinVerdict(null, { toolsDir: '/d/browser-tools' }) === null && V.cliPinVerdict({ path: '/d/browser-tools/x' }, {}) === null,
  'the pin file names a program INSIDE the tools directory only (anything else — another program, `..` — is no pin)');
  ok(judgeRungs(V).length === 0, 'THE RESOLVE RUNG ORDER: the pinned install FIRST; a missing / shim / relative pin skipped (PATH answers); no pin = PATH as before', judgeRungs(V));
  ok(V.LAUNCH_FLAGS.includes('--executable-path') && V.REFUSED_VERBS.install && V.REFUSED_VERBS.install.code === 'verb_not_offered' && V.REFUSED_VERBS.upgrade, 'the agent side is unchanged: --executable-path a refused launch flag, `install` / `upgrade` not offered');
}

// ═══ ② the REAL keeper ════════════════════════════════════════════════════════
console.log('— ② the keeper: the setting live, ONE install in THE slot, the pin followed by the runtime, a restart re-attaches');
const K = require('../src/server/browser-keeper.js');
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const settings = {};
const mkKeeper = (dataDir, extraEnv = {}) => { fs.mkdirSync(dataDir, { recursive: true }); return K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), ...extraEnv }), serverSetting: (k) => settings[k], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false }); };
const DATA = path.join(ROOT, 'data-2');
const TOOLS = path.join(DATA, 'browser-tools');
const pinFile = path.join(TOOLS, 'cli-pin.json');
let k = mkKeeper(DATA, { FAKE_NPM_DELAY_MS: '600' });
{
  let f = await k.cliFacts();
  ok(f.table === V.TABLE_VERSION && f.choice.mode === 'path' && f.pinned === null && f.onPath.version === '0.38.1' && f.inUse.pinned === false && !fs.existsSync(pinFile), 'the default (no setting): PATH — the fake on PATH says 0.38.1; no pin file', f);
  settings['browser.cli'] = 'pinned';
  f = await k.cliFacts();
  ok(f.choice.mode === 'pinned' && f.pinned && f.pinned.installed === false && f.inUse.pinned === false && !fs.existsSync(pinFile), '"pinned" before any install: chosen, NOT installed — the one on PATH is used (said, never silent), no pin file', f.pinned);
  const nNpm = npmCalls().length;
  const r = k.installCli({ version: V.TABLE_VERSION });
  await waitFor(() => npmCalls().length > nNpm, 5000); // the fake npm logs from its own process
  const call = npmCalls().at(-1);
  ok(r.ok && r.started && call && JSON.stringify(call.argv) === JSON.stringify(['install', '--prefix', path.join(TOOLS, 'agent-browser-' + V.TABLE_VERSION), '--no-audit', '--no-fund', '--no-save', 'agent-browser@' + V.TABLE_VERSION, '--ignore-scripts']),
    'ONE npm install into its own prefix under data/browser-tools, pinned to the version, --no-save, --ignore-scripts (the registry only: no package script runs)', call);
  const e2 = (() => { try { k.installCli({ version: '0.39.2' }); return null; } catch (e) { return e; } })();
  const iv = k.installVerdict();
  ok(e2 && e2.code === 'install_running' && iv.ok === false && iv.code === 'install_running' && iv.otherInstall === 'cli' && iv.state.running === false, 'THE slot is ONE: a second CLI install and a CloakBrowser install are both refused install_running while it runs (the cloak row does not claim the CLI\'s install as its own)', { e2: e2 && e2.code, iv: { code: iv.code, other: iv.otherInstall, running: iv.state.running } });
  ok(fs.existsSync(path.join(TOOLS, 'install-running.json')), 'the running install is named in its marker (a restart re-attaches)');
  ok(await waitFor(async () => !(await k.cliFacts()).install.running, 10000), 'the install finishes');
  f = await k.cliFacts();
  const pin = JSON.parse(fs.readFileSync(pinFile, 'utf8'));
  ok(f.pinned.installed && f.inUse.pinned && f.inUse.path === pin.path && pin.path.endsWith(path.join('node_modules', 'agent-browser', 'bin', NATIVE)) && !fs.existsSync(path.join(TOOLS, 'install-running.json')),
    'verified (its package.json + its own --version) ⇒ the pin file names the NATIVE binary, the one in use is the pinned one, the marker is gone', { inUse: f.inUse, pin });
  const p = k.createProfile({ label: 'Pinned CLI' });
  const n0 = pinnedCalls().length;
  await k.start(p.id, { why: 'test' });
  ok(pinnedCalls().length > n0 && pinnedCalls().slice(n0).some((a) => a[0] === 'open'), 'the keeper\'s runtime RUNS the pinned binary (its open went through it)', pinnedCalls().slice(n0));
  await k.stop(p.id, { why: 'user' });
  settings['browser.cli'] = 'path';
  f = await k.cliFacts();
  ok(f.choice.mode === 'path' && !fs.existsSync(pinFile) && f.inUse.pinned === false && f.installedTable === true, 'back to "path": the pin file is removed, PATH answers at once (no restart); the measured copy stays installed (its one act is now "Use it")');
  ok(JSON.parse(fs.readFileSync(path.join(TOOLS, 'agent-browser-' + V.TABLE_VERSION, 'verified.json'), 'utf8')).version === V.TABLE_VERSION, 'verify r1 (F2): the verified install carries its WITNESS (verified.json: the version the program said, the program)');
  const n1 = pinnedCalls().length;
  await k.start(p.id, { why: 'test' });
  ok(pinnedCalls().length === n1, '…and the next launch runs the PATH binary, not the pinned one');
  await k.stop(p.id, { why: 'user' });
  settings['browser.cli'] = 'pinned';
  const e3 = (() => { try { k.installCli({ version: V.TABLE_VERSION }); return null; } catch (e) { return e; } })();
  ok(e3 && e3.code === 'already_installed', 'installing the same version again ⇒ already_installed (no second download)');
}
// verify r1 (F2): a HALF-WRITTEN install is never resolved — the panel sets `browser.cli` right after the POST, while npm
// still extracts; the pin must not name the launcher of a package whose binaries are still landing
{
  const D2e = path.join(ROOT, 'data-2e'); const T2e = path.join(D2e, 'browser-tools');
  const ke = mkKeeper(D2e, { FAKE_NPM_EARLY: '1', FAKE_NPM_DELAY_MS: '1500' });
  settings['browser.cli'] = 'path';
  ke.installCli({ version: '0.40.0' });
  ok(await waitFor(() => fs.existsSync(path.join(T2e, 'agent-browser-0.40.0', 'node_modules', 'agent-browser', 'bin', 'agent-browser.js')), 4000), 'the fake npm left package.json + the launcher early (the install still running)');
  settings['browser.cli'] = '0.40.0'; // what the panel does right after the POST (src/lib/browser-trace-view.js)
  let fe = await ke.cliFacts();
  ok(fe.install.running && fe.pinned && fe.pinned.installed === false && /not verified/.test(fe.pinned.why) && fe.inUse.pinned === false && !fs.existsSync(path.join(T2e, 'cli-pin.json')),
    'mid-install the pin says NOT installed (no witness yet): the one on PATH stays in use, no pin file — a half-written package is never run', { install: fe.install, pinned: fe.pinned, inUse: fe.inUse });
  ok(await waitFor(async () => !(await ke.cliFacts()).install.running, 8000), 'the install finishes');
  fe = await ke.cliFacts();
  ok(!fe.install.failed && fe.pinned.installed === true && fe.pinned.path.endsWith(NATIVE) && fe.inUse.pinned === true && fs.existsSync(path.join(T2e, 'cli-pin.json')), '…verified (the program said 0.40.0) ⇒ the witness written, the NATIVE binary pinned, the pin file written only now', { install: fe.install, pinned: fe.pinned });
  // verify r1 (F4): the pinned install VANISHES (data/browser-tools wiped) ⇒ said at once, PATH answers — never "installed" off the memo
  fs.rmSync(path.join(T2e, 'agent-browser-0.40.0'), { recursive: true, force: true });
  fe = await ke.cliFacts();
  ok(fe.pinned.installed === false && /not installed/.test(fe.pinned.why) && fe.inUse.pinned === false && fe.inUse.version === '0.38.1' && !fs.existsSync(path.join(T2e, 'cli-pin.json')), 'the pinned install gone ⇒ the facts say NOT installed at once, the pin file removed, the one on PATH in use (said, not silent)', { pinned: fe.pinned, inUse: fe.inUse });
  settings['browser.cli'] = 'pinned';
}
// a failing / lying install
{
  const D2 = path.join(ROOT, 'data-2f');
  const kf = mkKeeper(D2, { FAKE_NPM_SAYS: '0.37.0' });
  settings['browser.cli'] = '0.39.2';
  kf.installCli({ version: '0.39.2' });
  ok(await waitFor(async () => !(await kf.cliFacts()).install.running, 10000), 'a second keeper\'s install of 0.39.2 finishes');
  const f = await kf.cliFacts();
  ok(f.install.failed && /says 0\.37\.0, not 0\.39\.2/.test(f.install.error) && f.pinned.installed === false && /not verified/.test(f.pinned.why) && !fs.existsSync(path.join(D2, 'browser-tools', 'cli-pin.json')) && !fs.existsSync(path.join(D2, 'browser-tools', 'agent-browser-0.39.2', 'verified.json')),
    'a program that does not SAY the version it was installed as ⇒ the install is reported failed by name AND its folder is not an install (verify r1 F2: no witness ⇒ not pinned, no pin file — the folder alone is not the proof)', { install: f.install, pinned: f.pinned });
  settings['browser.cli'] = 'pinned';
}
// a restart mid-install RE-ATTACHES; a dead install's result is verified
{
  const D3 = path.join(ROOT, 'data-3');
  const T3 = path.join(D3, 'browser-tools'); fs.mkdirSync(T3, { recursive: true });
  const slow = spawn('sleep', ['1.5'], { stdio: 'ignore', detached: true }); kids.add(slow.pid);
  const F = require('../src/browser-facts.js');
  await sleep(50);
  fs.writeFileSync(path.join(T3, 'install-running.json'), JSON.stringify({ kind: 'cli', spec: 'agent-browser@' + V.TABLE_VERSION, version: V.TABLE_VERSION, pid: slow.pid, starttime: F.procStart(slow.pid), startedAt: Date.now(), prefix: path.join(T3, 'agent-browser-' + V.TABLE_VERSION) }));
  const n0 = npmCalls().length;
  const k3 = mkKeeper(D3);
  ok(k3._reattached() === 'running' && k3.installVerdict().code === 'install_running', 'a restart mid-install RE-ATTACHES to the running npm (the slot stays busy)');
  const e = (() => { try { k3.installCli({}); return null; } catch (x) { return x; } })();
  ok(e && e.code === 'install_running' && npmCalls().length === n0, '…so no second install starts (zero npm calls)');
  // the "npm" ends without having installed anything ⇒ verified: failed, said
  ok(await waitFor(async () => !(await k3.cliFacts()).install.running, 6000), 'when the re-attached pid ends, the result is verified');
  const f3 = await k3.cliFacts();
  ok(f3.install.failed && /not usable after the install/.test(f3.install.error) && !fs.existsSync(path.join(T3, 'install-running.json')), 'an install that left nothing ⇒ failed by name; the marker is gone', f3.install);
  // a marker naming a pid that is gone, with the package in place (npm finished while the server was down) ⇒ verified OK
  const D4 = path.join(ROOT, 'data-4');
  const T4 = path.join(D4, 'browser-tools');
  fs.mkdirSync(T4, { recursive: true });
  fs.cpSync(path.join(TOOLS, 'agent-browser-' + V.TABLE_VERSION), path.join(T4, 'agent-browser-' + V.TABLE_VERSION), { recursive: true });
  fs.writeFileSync(path.join(T4, 'install-running.json'), JSON.stringify({ kind: 'cli', spec: 'agent-browser@' + V.TABLE_VERSION, version: V.TABLE_VERSION, pid: 2147483000, starttime: 1, startedAt: Date.now() }));
  const k4 = mkKeeper(D4);
  ok(k4._reattached() === 'ended', 'a marker naming a pid that is gone ⇒ its result is checked now');
  ok(await waitFor(async () => { const x = await k4.cliFacts(); return !x.install.running && x.pinned && x.pinned.installed; }, 6000) && fs.existsSync(path.join(T4, 'cli-pin.json')), '…the package npm left (it finished while VibeSpace was down) is verified and pinned');
  // verify r1 (F3): the CLOAKBROWSER install is re-attached the same way — its running step's pid rides THE marker; before,
  // a restart mid-install freed the slot at once and a second npm + download started beside the first (the build's HELD item)
  const Dc = path.join(ROOT, 'data-5c');
  const kc = mkKeeper(Dc, { FAKE_NPM_DELAY_MS: '2500' });
  const ivc = kc.installVerdict();
  const sc = await kc.installCloak().catch((e) => e);
  await waitFor(() => fs.existsSync(path.join(Dc, 'browser-tools', 'install-running.json')), 3000);
  let mc = null; try { mc = JSON.parse(fs.readFileSync(path.join(Dc, 'browser-tools', 'install-running.json'), 'utf8')); } catch { mc = null; }
  ok(ivc.ok && sc && sc.started && mc && mc.kind === 'cloak' && Number.isInteger(mc.pid) && mc.step === 'package' && F.pidAlive(mc.pid), 'a CloakBrowser install names its running step\'s pid in THE marker (kind cloak, step package)', { ivc: ivc.code, sc: sc && (sc.code || sc.started), mc });
  const kc2 = mkKeeper(Dc); // = the restarted server, the npm step still running
  const ec = await kc2.installCloak().then(() => null, (x) => x); // async: the refusal is a rejection
  const ivc1 = kc2.installVerdict();
  ok(kc2._reattached() === 'running' && ivc1.code === 'install_running' && ivc1.state.running === true && ec && ec.code === 'install_running', 'a restart mid-CloakBrowser-install RE-ATTACHES: the slot stays busy, a second install is refused by name', { re: kc2._reattached(), code: ivc1.code, ec: ec && ec.code });
  ok(await waitFor(() => !kc2.installVerdict().state.running && !kc.installVerdict().state.running, 8000), 'the re-attached step ends');
  const ivc2 = kc2.installVerdict();
  ok(/restarted during the install/.test(ivc2.state.error || '') && ivc2.state.exitCode === 1 && !fs.existsSync(path.join(Dc, 'browser-tools', 'install-running.json')), '…and what it left is judged now: no verified browser ⇒ failed BY NAME (install again — a finished download is reused), the marker gone', ivc2.state);
  // verify r1 (F8): THE SLOT IS BOUNDED — a step that never ends (a stalled registry) is stopped at the wall clock, in-process
  // AND after a restart (the re-attach waited on the pid for ever: both installs refused for as long as npm lived)
  const f8 = await slotBoundLeg(K);
  ok(f8.inProcess.ended && /npm ran past/.test(f8.inProcess.error || '') && !f8.inProcess.npmAlive && f8.inProcess.slotFree, 'a CLI install whose npm never ends is STOPPED at the step\'s wall clock (the npm group), failed by name, the slot free again', f8.inProcess);
  ok(f8.reattach.re === 'running' && f8.reattach.ended && !f8.reattach.stepAlive && /ran past/.test(f8.reattach.error || '') && f8.reattach.slotFree, 'a step RE-ATTACHED after a restart keeps its deadline (the marker\'s stepAt): stopped when it is provably the marker\'s, said, the slot free', f8.reattach);
  ok(f8.stranger.ended && f8.stranger.stepAlive && /could not be proven/.test(f8.stranger.error || '') && f8.stranger.slotFree, 'a re-attached pid that cannot be proven the marker\'s (no starttime) is LET GO at the deadline — the slot released and said, the process never signalled', f8.stranger);
}
/** verify r1 (F8): the slot's bound, over a keeper module (`KK` = the real one or a patched copy). → what each leg saw. */
async function slotBoundLeg(KK) {
  const Fb = require('../src/browser-facts.js');
  const mk8 = (dataDir, extra = {}) => { fs.mkdirSync(dataDir, { recursive: true }); return KK.create({ dataDir, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, ...extra }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, installTimeoutMs: 1200 }); };
  const out = {};
  { // in-process: npm hangs
    const k8 = mk8(path.join(ROOT, 'data-8a-' + Math.random().toString(36).slice(2, 7)), { FAKE_NPM_HANG: '1' });
    const r8 = k8.installCli({ version: '0.41.0' }); kids.add(r8.pid);
    const ended = await waitFor(async () => !(await k8.cliFacts()).install.running, 5000);
    const f = await k8.cliFacts();
    out.inProcess = { ended, error: f.install.error, npmAlive: Fb.pidAlive(r8.pid), slotFree: k8.installVerdict().code !== 'install_running' };
    try { process.kill(-r8.pid, 'SIGKILL'); } catch { try { process.kill(r8.pid, 'SIGKILL'); } catch { } }
  }
  for (const [name, proven] of [['reattach', true], ['stranger', false]]) { // a restart with the step still running, its deadline already due
    const D8 = path.join(ROOT, 'data-8' + name + '-' + Math.random().toString(36).slice(2, 7)); const T8 = path.join(D8, 'browser-tools'); fs.mkdirSync(T8, { recursive: true });
    const step = spawn('sleep', ['30'], { stdio: 'ignore', detached: true }); kids.add(step.pid);
    await sleep(50);
    fs.writeFileSync(path.join(T8, 'install-running.json'), JSON.stringify({ kind: 'cli', spec: 'agent-browser@0.41.0', version: '0.41.0', pid: step.pid, starttime: proven ? Fb.procStart(step.pid) : null, startedAt: Date.now() - 5000, stepAt: Date.now() - 5000, prefix: path.join(T8, 'agent-browser-0.41.0') }));
    const k8 = mk8(D8);
    const re = k8._reattached();
    const ended = await waitFor(async () => !(await k8.cliFacts()).install.running, 5000);
    await sleep(150);
    const f = await k8.cliFacts();
    out[name] = { re, ended, error: f.install.error, stepAlive: Fb.pidAlive(step.pid), slotFree: k8.installVerdict().code !== 'install_running' };
    try { process.kill(-step.pid, 'SIGKILL'); } catch { try { process.kill(step.pid, 'SIGKILL'); } catch { } }
  }
  return out;
}

// ═══ ③ the agent's CLI + browser-env read the pin ══════════════════════════════
console.log('— ③ the agent\'s CLI reads the pin beside itself; browser-env\'s floor follows it');
{
  const cli = read('data/bin/vibespace-browser');
  ok(/return V\.resolveRealBinary\(\{[^\n]*pinned: pinned \? pinnedCli\(\) : null \}\);/.test(cli) && /\n  let bin = realBinary\(\);\n/.test(cli) && /const toolsDir = path\.join\(__dirname, '\.\.', 'browser-tools'\);/.test(cli) && /V\.cliPinVerdict\(JSON\.parse\(fs\.readFileSync\(path\.join\(toolsDir, 'cli-pin\.json'\)/.test(cli),
    'data/bin/vibespace-browser resolves the real binary with the pin read BESIDE itself (data/browser-tools/cli-pin.json; a remote machine has none ⇒ PATH)');
  const m = /\nfunction pinnedCli\(\) \{[\s\S]*?\n\}\n/.exec(cli);
  const fakeDir = path.join(ROOT, 'clihome', 'data', 'bin'); fs.mkdirSync(fakeDir, { recursive: true });
  const tools = path.join(ROOT, 'clihome', 'data', 'browser-tools'); fs.mkdirSync(tools, { recursive: true });
  const pinnedCliFn = m ? new Function('V', 'path', 'fs', '__dirname', m[0] + '\nreturn pinnedCli;')(V, path, fs, fakeDir) : () => 'missing';
  ok(pinnedCliFn() === null, 'no pin file ⇒ no pin');
  fs.writeFileSync(path.join(tools, 'cli-pin.json'), JSON.stringify({ version: '0.38.1', path: path.join(tools, 'agent-browser-0.38.1', 'x') }));
  ok(pinnedCliFn() === path.join(tools, 'agent-browser-0.38.1', 'x'), 'a pin file naming a program inside the tools directory ⇒ that program');
  fs.writeFileSync(path.join(tools, 'cli-pin.json'), JSON.stringify({ path: '/usr/bin/evil' }));
  ok(pinnedCliFn() === null, 'a pin file naming anything else ⇒ no pin (PATH answers)');
  const be = read('src/server/browser-env.js');
  ok(/createBrowserFacts\(\{ pinned: require\('\.\.\/browser-facts\.js'\)\.cliPinReader\(dataDir\) \}\)/.test(be), 'browser-env\'s floor probe asks the pinned CLI (the keeper\'s pin file — two modules, one file)');
  const F = require('../src/browser-facts.js');
  await k.cliFacts(); // the keeper re-reads the setting ("pinned") and writes its pin file
  const rd = F.cliPinReader(DATA, { everyMs: 0 });
  ok(rd() === JSON.parse(fs.readFileSync(pinFile, 'utf8')).path, 'cliPinReader reads the keeper\'s file (the one the keeper wrote above)');
}

// ═══ ④ the routes ═══════════════════════════════════════════════════════════════
console.log('— ④ the routes: GET /api/browser/cli · POST /api/browser/cli/install — the user\'s act');
{
  const express = require('express');
  const R = require('../src/routes/browser.js');
  const kR = mkKeeper(path.join(ROOT, 'data-r'));
  const TOKEN = 'vsst_' + 'c'.repeat(24);
  const app = express(); app.use(express.json());
  R.setup({ keeper: kR, activeSessions: new Map([['s1', { agentToken: TOKEN, _browserKey: 'bk-0000c111' }]]), browserEnv: () => null });
  app.use(R.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  let r = await j('GET', '/api/browser/cli');
  ok(r.status === 200 && r.json.table === V.TABLE_VERSION && r.json.record && r.json.record.registryHost === 'registry.npmjs.org' && 'onPath' in r.json && 'inUse' in r.json, 'GET /api/browser/cli: the facts the row says (measured version + its numbers, PATH, in use)');
  const n0 = npmCalls().length;
  for (const tok of [TOKEN, 'jbt_' + 'd'.repeat(24)]) {
    r = await j('POST', '/api/browser/cli/install', { version: V.TABLE_VERSION }, { Authorization: 'Bearer ' + tok });
    ok(r.status === 403 && r.json.code === 'agent_forbidden', `an agent's ${tok.slice(0, 5)} token on the CLI install ⇒ 403 agent_forbidden`);
    r = await j('POST', '/api/browser/install', {}, { Authorization: 'Bearer ' + tok });
    ok(r.status === 403 && r.json.code === 'agent_forbidden', `…and on the CloakBrowser install (a download is the user's act) ⇒ 403`);
  }
  ok(npmCalls().length === n0, '…zero npm calls');
  r = await j('POST', '/api/browser/cli/install', { version: 'latest' });
  ok(r.status === 400 && r.json.code === 'bad-request' && npmCalls().length === n0, 'a version that is not three numbers ⇒ refused, nothing run');
  await new Promise((res) => srv.close(res));
}

// ═══ ⑤ words + wiring ═════════════════════════════════════════════════════════════
console.log('— ⑤ the client words (en / zh / ja) + the panel wiring');
{
  const W = await import('../src/lib/browser-cli-model.js');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const t = (k2, p) => { let s = k2; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
  const base = { table: '0.38.1', record: V.CLI_PIN_RECORD, npm: true, install: {} };
  const drift = W.cliRowWords({ ...base, choice: { mode: 'path' }, onPath: { version: '0.39.2' } }, t);
  ok(drift.text === 'agent-browser: 0.38.1 (measured) · on PATH: 0.39.2 — drifts' && drift.warn && drift.offer === 'install' && W.cliOfferLabel('install', t) === 'Install the measured version…', 'the row: "agent-browser: 0.38.1 (measured) · on PATH: 0.39.2 — drifts" + Install the measured version…', drift);
  ok(W.cliRowWords({ ...base, choice: { mode: 'path' }, onPath: { version: '0.38.1' } }, t).offer === null && W.cliRowWords({ ...base, choice: { mode: 'path' }, onPath: { version: '0.39.2' }, installedTable: true }, t).offer === 'use-pinned'
    && W.cliRowWords({ ...base, choice: { mode: 'pinned', version: '0.38.1' }, pinned: { version: '0.38.1', installed: true }, onPath: { version: '0.39.2' } }, t).offer === 'use-path'
    && W.cliRowWords({ ...base, choice: { mode: 'pinned' }, pinned: { version: '0.38.1', installed: false }, onPath: { version: '0.39.2' } }, t).warn
    && W.cliRowWords({ ...base, choice: { mode: 'path' }, onPath: { version: '0.39.2' }, install: { running: true } }, t).offer === null
    && W.cliRowWords({ ...base, choice: { mode: 'path' }, onPath: { version: '0.39.2' }, npm: false }, t).offer === null
    && W.cliRowWords({ ...base, choice: { mode: 'path' }, onPath: { version: '0.39.2' }, install: { other: 'cloak' } }, t).offer === null,
  'ONE act per state: none when PATH is the measured one · Use it when installed · Use PATH when pinned · nothing while installing / without npm / while the slot is busy');
  // verify r1 (F10): a version the user NAMED (browser.cli = 0.39.2) — the button installs it by its number (never "the measured
  // version"), and once in use the row says it drifts exactly as PATH's does (the agent's providers line says the same)
  const named0 = W.cliRowWords({ ...base, choice: { mode: 'version', version: '0.39.2' }, pinned: { version: '0.39.2', installed: false }, onPath: { version: '0.38.1' } }, t);
  const named1 = W.cliRowWords({ ...base, choice: { mode: 'version', version: '0.39.2' }, pinned: { version: '0.39.2', installed: true }, onPath: { version: '0.38.1' } }, t);
  ok(named0.offer === 'install' && named0.version === '0.39.2' && W.cliOfferLabel(named0.offer, t, { version: named0.version, table: base.table }) === 'Install agent-browser 0.39.2…' && W.cliOfferLabel('install', t, { version: '0.38.1', table: '0.38.1' }) === 'Install the measured version…'
    && /0\.39\.2 \(your choice\) — drifts/.test(named1.text) && named1.warn, 'a version the user named: Install… says its number ("the measured version" only for the measured one) and, in use, the row says it drifts and warns', { named0, named1 });
  ok(/cliOfferLabel\(w\.offer, t, \{ version: w\.version, table: st\.cli && st\.cli\.table \}\)/.test(read('src/lib/browser-trace-view.js')), 'the panel labels the button with the version the install installs');
  const cw = W.cliConfirmWords({ ...base }, t);
  ok(/53 MB/.test(cw.message) && /registry\.npmjs\.org/.test(cw.message) && /119 MB/.test(cw.message) && /no script of the package runs/.test(cw.message) && cw.title === 'Install agent-browser 0.38.1?', 'the download confirm names the package, the host, the measured sizes and that no package script runs', cw);
  const said = new Set(); const rec = (k2) => { said.add(k2); return k2; };
  for (const x of [{ choice: { mode: 'path' }, onPath: { version: '0.39.2' } }, { choice: { mode: 'path' }, onPath: null }, { choice: { mode: 'pinned' }, pinned: { version: '0.38.1', installed: true }, onPath: { version: '0.39.2' } }, { choice: { mode: 'version' }, pinned: { version: '0.39.2', installed: true } }, { choice: { mode: 'pinned' }, pinned: { version: '0.38.1', installed: false }, onPath: { version: '0.39.2' } }, { choice: { mode: 'path' }, onPath: { version: '0.39.2' }, install: { running: true } }, { choice: { mode: 'path' }, onPath: { version: '0.39.2' }, install: { failed: true } }, { choice: { mode: 'path' }, onPath: { version: '0.39.2' }, npm: false }]) W.cliRowWords({ ...base, ...x }, rec);
  for (const o of ['install', 'install-again', 'use-pinned', 'use-path']) W.cliOfferLabel(o, rec);
  W.cliOfferLabel('install', rec, { version: '0.39.2', table: '0.38.1' }); // verify r1 (F10): the named version's label
  W.cliConfirmWords(base, rec); W.cliConfirmWords({ ...base, record: null }, rec);
  for (const c of ['install_running', 'already_installed', 'install_unavailable', 'agent_forbidden', 'x']) W.cliOutcomeWords({ code: c }, rec); W.cliOutcomeWords({ ok: true, version: '1' }, rec); W.cliOutcomeWords(null, rec);
  const noZh = [...said].filter((k2) => !(k2 in zh)), noJa = [...said].filter((k2) => !(k2 in ja));
  ok(said.size > 15 && !noZh.length && !noJa.length, `every sentence the CLI model says (${said.size}) has a zh and a ja entry`, { noZh, noJa });
  const tv = read('src/lib/browser-trace-view.js');
  ok(/root\.append\(bar, cliRow, hint, body\)/.test(tv) && /fetchJson\('\/api\/browser\/cli'\)/.test(tv) && /fetchJson\('\/api\/browser\/cli\/install', jsonInit\('POST', \{ version \}\)\)/.test(tv) && /showConfirmDialog\(\{ \.\.\.cliConfirmWords\(f, t, \{ version \}\) \}\)/.test(tv) && /app\.settings\?\.set\?\.\('browser\.cli', 'path'\)/.test(tv),
    'the Agent browser panel: the Browser CLI row (its own fetch), the install behind the download confirm, the setting written by the row\'s act');
  ok(/'browser\.cli': \{\s*type: 'string', default: 'path',/.test(read('src/lib/settings-schema.js')) && /serverSetting\('browser\.cli'\)/.test(read('src/server/browser-keeper.js')), 'the setting is declared (Agent browser) and read by the keeper');
}

// ═══ ⑤b verify r2 (H1): a running browser keeps the CLI it was launched with ════════
console.log('— ⑤b verify r2 (H1): a `browser.cli` switch never restarts a running browser — each keeps its CLI until it stops');
// The fake says the version it IS (the pinned install's wrapper passes its own) and — like the real 0.38.x (measured
// 2026-10-01, 0.38.0 ↔ 0.38.1) — a client of ANOTHER version restarts the daemon (a new pid, restarts.log), except
// `--version` / `session info`. The chain is the shipped one: the REAL keeper behind the REAL routes, and the shipped
// vibespace-browser (a copy beside its own data/browser-tools — the layout of a checkout) over them.
const H1_KEY = 'bk-0000a1a1', H1_KEY2 = 'bk-0000a1a2';
const h1Pairs = (k2) => [`AGENT_BROWSER_SESSION=vs-${k2}`, `AGENT_BROWSER_NAMESPACE=vs-${k2}`, 'AGENT_BROWSER_IDLE_TIMEOUT_MS=0'];
const H1_PRELOAD = path.join(ROOT, 'h1-passwd-home.cjs');
fs.writeFileSync(H1_PRELOAD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
async function h1Leg(KK, tag, { cliSrc = null } = {}) {
  const out = {};
  const D = path.join(ROOT, 'data-h1-' + tag), T = path.join(D, 'browser-tools'), AB = path.join(ROOT, 'ab-h1-' + tag);
  fs.mkdirSync(D, { recursive: true }); fs.mkdirSync(AB, { recursive: true });
  const log1 = (name) => { try { return fs.readFileSync(path.join(AB, name), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const st = { 'browser.cli': 'path' };
  const kh = KK.create({ dataDir: D, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_NPM_DELAY_MS: '0' }), serverSetting: (x) => st[x], liveKeys: () => new Set([H1_KEY, H1_KEY2]), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  kh.installCli({ version: '0.38.0' });
  out.installed = await waitFor(async () => { const x = await kh.cliFacts(); return !x.install.running && x.pinned === null && fs.existsSync(path.join(T, 'agent-browser-0.38.0', 'verified.json')); }, 8000);
  st['browser.cli'] = '0.38.0';
  const r1 = await kh.ensureEphemeral({ browserKey: H1_KEY, sessionId: 'sess-h1', envPairs: h1Pairs(H1_KEY), sessionName: 'H1' });
  out.launch = { cli: r1.browser.cli && r1.browser.cli.version, pid: r1.browser.pid, v: (log1('launches.log').at(-1) || {}).version };
  // THE SWITCH (the panel's "Use the one on PATH")
  st['browser.cli'] = 'path';
  out.facts = (await kh.cliFacts()).running;
  // the keeper's own call on that browser (a live view's stream port)
  const nc = log1('calls.log').length;
  out.stream = await kh.streamPortFor({ ok: true, kind: 'ephemeral', ns: 'vs-' + H1_KEY, envPairs: h1Pairs(H1_KEY) });
  out.streamCalls = log1('calls.log').slice(nc).filter((c) => c.verb.startsWith('stream')).map((c) => c.v);
  // the conversation's next command through the shipped CLI over the real routes
  const express = require('express'); const R = require('../src/routes/browser.js');
  const TOKEN = 'vsst_' + 'h'.repeat(24);
  const app = express(); app.use(express.json());
  R.setup({ keeper: kh, activeSessions: new Map([['sess-h1', { agentToken: TOKEN, _browserKey: H1_KEY, _browserEnv: h1Pairs(H1_KEY), _browserVariant: 'N', name: 'H1' }]]), browserEnv: () => null });
  app.use(R.router);
  const srv = await new Promise((r) => { const s2 = app.listen(0, '127.0.0.1', () => r(s2)); });
  const BIN = path.join(D, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(path.join(BIN, 'vibespace-browser'), cliSrc || read('data/bin/vibespace-browser'), { mode: 0o755 });
  fs.copyFileSync(path.join(REPO, 'src', 'browser-verbs.js'), path.join(BIN, 'vibespace-browser-verbs.js'));
  fs.copyFileSync(path.join(REPO, 'src', 'browser-stuck.js'), path.join(BIN, 'vibespace-browser-stuck.js'));
  const agent = (argv) => new Promise((resolve) => { const c = spawn(process.execPath, ['--require', H1_PRELOAD, path.join(BIN, 'vibespace-browser'), ...argv], { env: { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] }); kids.add(c.pid); let so = '', se = ''; c.stdout.on('data', (d) => { so += d; }); c.stderr.on('data', (d) => { se += d; }); c.on('exit', (code) => { kids.delete(c.pid); resolve({ code, so, se }); }); });
  try {
    const nc2 = log1('calls.log').length;
    out.next = await agent(['get', 'title']);
    out.nextCalls = log1('calls.log').slice(nc2).map((c) => ({ verb: c.verb, v: c.v }));
    out.restarts = log1('restarts.log');
    out.pidAfter = (kh.browserOf(kh.ephemeralFor(H1_KEY).profileId) || {}).pid;
    // a NEW launch (another conversation) runs the current CLI
    const r3 = await kh.ensureEphemeral({ browserKey: H1_KEY2, sessionId: 'sess-h1b', envPairs: h1Pairs(H1_KEY2), sessionName: 'H1b' });
    out.newLaunch = { cli: r3.browser.cli && r3.browser.cli.version, v: (log1('launches.log').at(-1) || {}).version };
    // the pinned 0.38.0 REMOVED while the first browser runs on it
    fs.rmSync(path.join(T, 'agent-browser-0.38.0'), { recursive: true, force: true });
    out.facts2 = (await kh.cliFacts()).running;
    const nc3 = log1('calls.log').length;
    out.stream2 = await kh.streamPortFor({ ok: true, kind: 'ephemeral', ns: 'vs-' + H1_KEY, envPairs: h1Pairs(H1_KEY) });
    out.gone = await agent(['get', 'title']);
    out.goneCalls = log1('calls.log').slice(nc3).filter((c) => c.verb !== '--version' && c.verb !== 'session info').map((c) => ({ verb: c.verb, v: c.v }));
    out.restarts2 = log1('restarts.log');
    out.daemonAlive = F0.pidAlive(out.launch.pid);
  } finally {
    await new Promise((res) => srv.close(res));
    for (const kk of [H1_KEY, H1_KEY2]) { const e = kh.ephemeralFor(kk); if (e) { try { await kh.stop(e.profileId, { why: 'user' }); } catch { } } }
    for (const l of log1('launches.log')) if (l.pid) { try { process.kill(l.pid, 'SIGKILL'); } catch { } }
  }
  return out;
}
/** verify r3 (Y1): the SAME version re-installed at the same path (a new file identity: an `npm i -g` of the version already
 *  there, a copied-over binary) while a browser runs on it — the keeper's door (a live view's stream port), the agent's
 *  door (its next command over the real /resolve) and the row; `KK` / `RR` = the keeper / routes module, or a patched copy
 *  for the control. Reproduced before: the next call refused "browser_cli_gone — no longer installed here" ONCE, with a
 *  remedy that loses the browser's tabs, because the binary's new identity had never been asked its version. */
const SV_KEY = 'bk-0000a5a5';
async function sameVersionLeg(KK, RR, tag) {
  const out = {};
  const D = path.join(ROOT, 'data-sv-' + tag), AB = path.join(ROOT, 'ab-sv-' + tag), PB = path.join(ROOT, 'pb-sv-' + tag);
  for (const d of [D, AB, PB]) fs.mkdirSync(d, { recursive: true });
  const log1 = (name) => { try { return fs.readFileSync(path.join(AB, name), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const wrap = path.join(PB, 'agent-browser');
  const reinstall = (n) => { fs.writeFileSync(wrap, `#!/bin/sh\nFAKE_AB_VERSION=0.38.1 exec ${fake.bin} "$@"\n`, { mode: 0o755 }); const t = new Date(Date.now() + n * 5000); fs.utimesSync(wrap, t, t); };
  reinstall(0);
  const journal = [];
  const kh = KK.create({ dataDir: D, homeDir: HOME, env: () => ({ PATH: `${PB}:${PATH_ENV}`, HOME, FAKE_AB_STATE: AB }), serverSetting: (x) => (x === 'browser.cli' ? 'path' : undefined), liveKeys: () => new Set([SV_KEY]), install: false, tickMs: 3600e3, log: { log: (...a2) => journal.push(a2.join(' ')), warn: (...a2) => journal.push(a2.join(' ')), error() { } }, hostKnown: () => false });
  const r1 = await kh.ensureEphemeral({ browserKey: SV_KEY, sessionId: 'sess-sv', envPairs: h1Pairs(SV_KEY), sessionName: 'SV' });
  out.launch = { cli: r1.browser.cli && r1.browser.cli.version, journal: journal.filter((l) => /started/.test(l)).map((l) => l.slice(0, 240)) };
  // the re-install: the same version, a new identity
  reinstall(1);
  const nc = log1('calls.log').length;
  out.stream = await kh.streamPortFor({ ok: true, kind: 'ephemeral', ns: 'vs-' + SV_KEY, envPairs: h1Pairs(SV_KEY) });
  out.streamCalls = log1('calls.log').slice(nc).filter((c) => c.verb.startsWith('stream')).map((c) => c.v);
  out.row = (await kh.cliFacts()).running;
  // the agent's door: re-installed again, then its next command through the shipped CLI over the real routes
  reinstall(2);
  const express = require('express');
  const TOKEN = 'vsst_' + 's'.repeat(24);
  const app = express(); app.use(express.json());
  RR.setup({ keeper: kh, activeSessions: new Map([['sess-sv', { agentToken: TOKEN, _browserKey: SV_KEY, _browserEnv: h1Pairs(SV_KEY), _browserVariant: 'N', name: 'SV' }]]), browserEnv: () => null });
  app.use(RR.router);
  const srv = await new Promise((r) => { const s2 = app.listen(0, '127.0.0.1', () => r(s2)); });
  const BIN = path.join(D, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(path.join(BIN, 'vibespace-browser'), read('data/bin/vibespace-browser'), { mode: 0o755 });
  fs.copyFileSync(path.join(REPO, 'src', 'browser-verbs.js'), path.join(BIN, 'vibespace-browser-verbs.js'));
  fs.copyFileSync(path.join(REPO, 'src', 'browser-stuck.js'), path.join(BIN, 'vibespace-browser-stuck.js'));
  const agent = (argv) => new Promise((resolve) => { const c = spawn(process.execPath, ['--require', H1_PRELOAD, path.join(BIN, 'vibespace-browser'), ...argv], { env: { PATH: `${PB}:${PATH_ENV}`, HOME, FAKE_AB_STATE: AB, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] }); kids.add(c.pid); let so = '', se = ''; c.stdout.on('data', (d) => { so += d; }); c.stderr.on('data', (d) => { se += d; }); c.on('exit', (code) => { kids.delete(c.pid); resolve({ code, so, se }); }); });
  try {
    const nc2 = log1('calls.log').length;
    out.next = await agent(['get', 'title']);
    out.nextCalls = log1('calls.log').slice(nc2).map((c) => ({ verb: c.verb, v: c.v }));
    out.restarts = log1('restarts.log');
  } finally {
    await new Promise((res) => srv.close(res));
    const e = kh.ephemeralFor(SV_KEY); if (e) { try { await kh.stop(e.profileId, { why: 'user' }); } catch { } }
    for (const l of log1('launches.log')) if (l.pid) { try { process.kill(l.pid, 'SIGKILL'); } catch { } }
  }
  return out;
}
const F0 = require('../src/browser-facts.js');
const h1 = await h1Leg(K, 'real');
{
  ok(h1.installed && h1.launch.cli === '0.38.0' && h1.launch.v === '0.38.0', 'the conversation\'s browser launched under the pinned 0.38.0 (the record names the CLI it runs)', h1.launch);
  ok(h1.facts.previous === 1 && h1.facts.gone === 0 && h1.facts.versions.join() === '0.38.0', 'after the switch to PATH (0.38.1) the panel row counts it: 1 browser still on the previous CLI (0.38.0)', h1.facts);
  ok(h1.streamCalls.length > 0 && h1.streamCalls.every((v) => v === '0.38.0'), 'the keeper\'s own call on it (a live view\'s stream port) runs 0.38.0 — the version its daemon runs', h1.streamCalls);
  ok(h1.nextCalls.some((c) => c.verb === 'get title' && c.v === '0.38.0') && !h1.nextCalls.some((c) => c.verb === 'get title' && c.v !== '0.38.0'), 'the conversation\'s NEXT command (the shipped CLI over the real /resolve) runs 0.38.0 — VibeSpace\'s verified install of the version its browser runs', { next: h1.nextCalls, se: h1.next.se.slice(-300) });
  ok(h1.restarts.length === 0 && h1.pidAfter === h1.launch.pid && !/version mismatch/i.test(h1.next.se), 'no "Daemon version mismatch, restarting…": the daemon (and the Chrome it owns) is the one it launched', { restarts: h1.restarts, pid: [h1.launch.pid, h1.pidAfter] });
  ok(h1.newLaunch.cli === '0.38.1' && h1.newLaunch.v === '0.38.1', 'a NEW launch after the switch runs the current CLI (0.38.1)', h1.newLaunch);
  ok(h1.facts2.gone === 1 && h1.facts2.previous === 0, 'the pinned 0.38.0 removed while its browser runs: the row counts it as on a CLI no longer installed', h1.facts2);
  ok(h1.stream2 && h1.stream2.ok === false && /browser_cli_gone/.test(String(h1.stream2.error)) && /restart it to use the current CLI/.test(String(h1.stream2.error)), '…the keeper\'s calls on it are refused BY NAME (browser_cli_gone, "restart it to use the current CLI")', h1.stream2);
  ok(h1.gone.code === 1 && /\[browser_cli_gone\]/.test(h1.gone.se) && /restart it to use the current CLI/.test(h1.gone.se) && /remedy: ask the user to restart this browser/.test(h1.gone.se), '…the agent\'s command too: [browser_cli_gone] with its way out', h1.gone.se.slice(-400));
  ok(h1.goneCalls.length === 0 && h1.restarts2.length === 0 && h1.daemonAlive, '…and NOTHING ran (no silent fall to PATH): its daemon untouched', { goneCalls: h1.goneCalls, restarts: h1.restarts2 });
  // verify r3 (Y1): the same version put back at the same path (a new identity) — asked before any refusal, never "gone"
  const sv = await sameVersionLeg(K, require('../src/routes/browser.js'), 'real');
  ok(sv.launch.cli === '0.38.1' && sv.stream && sv.stream.code !== 'browser_cli_gone' && sv.streamCalls.length > 0 && sv.streamCalls.every((v) => v === '0.38.1') && sv.row.gone === 0 && sv.row.previous === 0,
    'the same 0.38.1 re-installed at the same path while its browser runs: the keeper\'s next call ASKS the new file its version and runs it — never browser_cli_gone, the row counts nobody gone', { stream: sv.stream && sv.stream.code, calls: sv.streamCalls, row: sv.row });
  // verify r3 (Y1): the launch's journal line names the CLI it runs (the record's version changes at a relaunch after a
  // daemon's death — the trace said "started … daemon pid N" and nothing of the CLI)
  ok(sv.launch.journal.some((l) => /started \(.*\): daemon pid \d+.*, agent-browser 0\.38\.1$/.test(l)) && (read('src/server/browser-keeper.js').match(/\$\{rec\.cli && rec\.cli\.version \? ', ' \+ VERBS\.CLI_PACKAGE \+ ' ' \+ rec\.cli\.version : ''\}`\);/g) || []).length === 2,
    'the launch journal line names the CLI the daemon runs ("…daemon pid N, agent-browser 0.38.1") — the ephemeral line and the profile line both', sv.launch.journal);
  ok(!/\[browser_cli_gone\]/.test(sv.next.se) && sv.nextCalls.some((c) => c.verb === 'get title' && c.v === '0.38.1') && sv.restarts.length === 0,
    '…and the conversation\'s next command (the shipped CLI over the real /resolve, the binary re-installed again) runs 0.38.1 — no refusal, no restart', { se: sv.next.se.slice(-300), calls: sv.nextCalls, restarts: sv.restarts });
  const W = await import('../src/lib/browser-cli-model.js');
  const t = (k2, p) => String(k2).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const base = { table: '0.38.1', record: V.CLI_PIN_RECORD, npm: true, install: {}, choice: { mode: 'path' }, onPath: { version: '0.38.1' } };
  const w1 = W.cliRowWords({ ...base, running: { previous: 1, gone: 0 } }, t), w2 = W.cliRowWords({ ...base, running: { previous: 3, gone: 0 } }, t), w3 = W.cliRowWords({ ...base, running: { previous: 0, gone: 2 } }, t);
  ok(/1 browser still on the previous CLI — it switches when it stops/.test(w1.text) && !w1.warn && /3 browsers still on the previous CLI — they switch when they stop/.test(w2.text) && /2 browsers run on a CLI that is no longer installed — restart them to use the current one/.test(w3.text) && w3.warn, 'the row\'s words: "N browsers still on the previous CLI — they switch when they stop" (a fact, no warning) · "… no longer installed — restart …" (a warning)', [w1.text, w2.text, w3.text]);
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const keys = ['1 browser still on the previous CLI — it switches when it stops', '{n} browsers still on the previous CLI — they switch when they stop', '1 browser runs on a CLI that is no longer installed — restart it to use the current one', '{n} browsers run on a CLI that is no longer installed — restart them to use the current one'];
  ok(keys.every((k2) => zh[k2] && ja[k2]), 'the four sentences have zh + ja entries');
  const rs = read('src/routes/browser.js');
  ok(/const cli = b\.cli && typeof b\.cli === 'object' && b\.cli\.version \? \{ version: String\(b\.cli\.version\)/.test(rs) && (rs.match(/\{ const g = await cliGoneVerdict\(k, (e|r)\.browser\); if \(g\) return failVerdict\(res, g\); \}/g) || []).length === 3, 'the agent\'s answers carry the CLI by VERSION only (never the program\'s path) and all three /resolve forms refuse a gone CLI before the agent runs anything (verify r3: the keeper\'s doors\' fact, awaited)');
}

// ═══ ⑥ controls ═══════════════════════════════════════════════════════════════
console.log('— ⑥ controls');
{
  const MUT = mutantCopies('badm-clipin', REPO);
  const src = read('src/browser-verbs.js');
  const late = src.replace("  if (typeof pinned === 'string' && pinned.startsWith('/')) {", "  if (false) {");
  ok(late !== src, 'control (a): the patch (a resolver with no pinned rung) applies');
  const Vl = MUT.load('src/browser-verbs.js', late, 'no-pin');
  ok(judgeRungs(Vl).length > 0, 'control (a): …and ①\'s rung order goes red on it', judgeRungs(Vl));
  const ks = read('src/server/browser-keeper.js');
  const twice = ks.replace("    const v0 = VERBS.cliInstallVerdict({ version: String(version || ''), running: installState.running,", "    const v0 = VERBS.cliInstallVerdict({ version: String(version || ''), running: false,");
  ok(twice !== ks, 'control (b): the patch (a CLI install that ignores THE slot) applies');
  const Kt = MUT.load('src/server/browser-keeper.js', twice, 'two');
  const Dt = path.join(ROOT, 'data-ct'); fs.mkdirSync(Dt, { recursive: true });
  const kt = Kt.create({ dataDir: Dt, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_NPM_DELAY_MS: '400' }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  const n0 = npmCalls().length;
  kt.installCli({ version: '0.38.1' });
  let second = null; try { kt.installCli({ version: '0.39.2' }); } catch (e) { second = e; }
  await waitFor(() => npmCalls().length >= n0 + 2, 4000);
  ok(!second && npmCalls().length === n0 + 2, 'control (b): …two npm installs ran at once — exactly what ②\'s "THE slot is ONE" catches');
  await waitFor(async () => !(await kt.cliFacts()).install.running, 6000);
  // verify r1 (F2): a keeper that reads the folder WITHOUT its witness ⇒ the half-written package is pinned mid-install
  const noWitness = ks.replace("    const w = cliWitnessRead(f.prefix);\n    if (!w || w.version !== String(version) || w.path !== f.path) return", "    const w = null;\n    if (false) return");
  ok(noWitness !== ks, 'control (c): the patch (an install read off the folder alone, no witness) applies');
  const Kw = MUT.load('src/server/browser-keeper.js', noWitness, 'no-witness');
  const Dw = path.join(ROOT, 'data-cw'); fs.mkdirSync(Dw, { recursive: true });
  const sw = {};
  const kw = Kw.create({ dataDir: Dw, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_NPM_EARLY: '1', FAKE_NPM_DELAY_MS: '1500' }), serverSetting: (k2) => sw[k2], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  sw['browser.cli'] = 'path';
  kw.installCli({ version: '0.40.0' });
  await waitFor(() => fs.existsSync(path.join(Dw, 'browser-tools', 'agent-browser-0.40.0', 'node_modules', 'agent-browser', 'bin', 'agent-browser.js')), 4000);
  sw['browser.cli'] = '0.40.0';
  const fw = await kw.cliFacts();
  ok(fw.install.running && fw.pinned.installed === true && fw.pinned.path.endsWith('agent-browser.js') && fs.existsSync(path.join(Dw, 'browser-tools', 'cli-pin.json')), 'control (c): …the half-written package\'s LAUNCHER was pinned while npm still ran (the pin file written) — exactly what ②\'s mid-install leg catches', { install: fw.install, pinned: fw.pinned });
  await waitFor(async () => !(await kw.cliFacts()).install.running, 6000);
  // verify r1 (F3): a keeper whose re-attach knows the CLI install only ⇒ a restart mid-CloakBrowser-install frees the slot
  const cliOnly = ks.replace("    if (!m || !['cli', 'cloak'].includes(m.kind) || !Number.isInteger(m.pid))", "    if (!m || m.kind !== 'cli' || !Number.isInteger(m.pid))");
  ok(cliOnly !== ks, 'control (d): the patch (a re-attach that drops a CloakBrowser marker) applies');
  const Kr = MUT.load('src/server/browser-keeper.js', cliOnly, 'cli-only');
  const Dr = path.join(ROOT, 'data-cr'); const Tr = path.join(Dr, 'browser-tools'); fs.mkdirSync(Tr, { recursive: true });
  const slow2 = spawn('sleep', ['2'], { stdio: 'ignore', detached: true }); kids.add(slow2.pid);
  const Fr = require('../src/browser-facts.js');
  await sleep(50);
  fs.writeFileSync(path.join(Tr, 'install-running.json'), JSON.stringify({ kind: 'cloak', spec: 'cloakbrowser@0.5.10', step: 'binary', pid: slow2.pid, starttime: Fr.procStart(slow2.pid), startedAt: Date.now(), prefix: Tr }));
  const kr = Kr.create({ dataDir: Dr, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME }), serverSetting: () => undefined, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  ok(kr._reattached() === null && kr.installVerdict().ok === true && !fs.existsSync(path.join(Tr, 'install-running.json')), 'control (d): …the running CloakBrowser install was forgotten and a second one admitted at once — exactly what ②\'s re-attach leg catches', { re: kr._reattached(), ok: kr.installVerdict().ok });
  // verify r1 (F4): a pin served off the memo alone ⇒ a wiped install still reads "installed"
  const memoOnly = ks.replace("      if (!cliMemo.pin.path || usableExe(cliMemo.pin.path)) return cliMemo.pin;\n      cliGen++;", "      return cliMemo.pin;");
  ok(memoOnly !== ks, 'control (e): the patch (a pin that never re-checks its program) applies');
  const Km = MUT.load('src/server/browser-keeper.js', memoOnly, 'memo-only');
  const Dm = path.join(ROOT, 'data-cm'); fs.mkdirSync(Dm, { recursive: true });
  const sm = { 'browser.cli': '0.40.0' };
  const km = Km.create({ dataDir: Dm, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_NPM_DELAY_MS: '200' }), serverSetting: (k2) => sm[k2], liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false });
  km.installCli({ version: '0.40.0' });
  await waitFor(async () => { const x = await km.cliFacts(); return !x.install.running && x.pinned.installed; }, 6000);
  fs.rmSync(path.join(Dm, 'browser-tools', 'agent-browser-0.40.0'), { recursive: true, force: true });
  const fm = await km.cliFacts();
  ok(fm.pinned.installed === true && fs.existsSync(path.join(Dm, 'browser-tools', 'cli-pin.json')), 'control (e): …the wiped install still read "installed", the pin file still named it — exactly what ②\'s vanished-pin leg catches', fm.pinned);
  // verify r1 (F10): the words of the pre-fix model — every install button "the measured version", a named version in use never drifts
  const ms = read('src/lib/browser-cli-model.js');
  const oldWords = ms.replace("    case 'install': return named ? t(i18nKey('Install agent-browser {version}…'), { version: String(version) }) : t(i18nKey('Install the measured version…'));", "    case 'install': return t(i18nKey('Install the measured version…'));")
    .replace("    else { parts.push(t(i18nKey(\"in use: VibeSpace's own {version} (your choice) — drifts\"), { version: pinned.version })); warn = true; }", "    else parts.push(t(i18nKey(\"in use: VibeSpace's own {version} (your choice)\"), { version: pinned.version }));");
  ok(oldWords !== ms && !oldWords.includes('(your choice) — drifts'), 'control (g): the patch (the pre-fix words for a named version) applies');
  const Wo = await import(MUT.write('src/lib/browser-cli-model.js', oldWords, 'old-words'));
  const base = { table: '0.38.1', record: V.CLI_PIN_RECORD, npm: true, install: {} }; const t = (k2, p) => String(k2).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const o0 = Wo.cliRowWords({ ...base, choice: { mode: 'version', version: '0.39.2' }, pinned: { version: '0.39.2', installed: false }, onPath: { version: '0.38.1' } }, t), o1 = Wo.cliRowWords({ ...base, choice: { mode: 'version', version: '0.39.2' }, pinned: { version: '0.39.2', installed: true }, onPath: { version: '0.38.1' } }, t);
  ok(Wo.cliOfferLabel(o0.offer, t, { version: o0.version, table: base.table }) === 'Install the measured version…' && !o1.warn, 'control (g): …the button said "the measured version" for 0.39.2 and the row in use never drifted — exactly what ⑤\'s named-version leg catches');
  // verify r1 (F8): a keeper whose steps have no wall clock (the CLI's npm, the re-attach) ⇒ the slot is held while npm lives
  const unbounded = ks.replace("      if (child.exitCode != null || child.signalCode != null) return;\n", "      return;\n")
    .replace("      if (stalled || now() < deadlineAt) return;\n", "      return;\n");
  ok(unbounded !== ks && !unbounded.includes('if (child.exitCode != null || child.signalCode != null) return;') && !unbounded.includes('if (stalled || now() < deadlineAt) return;'), 'control (f): the patch (no wall clock on the CLI install nor on a re-attached step) applies');
  const fu = await slotBoundLeg(MUT.load('src/server/browser-keeper.js', unbounded, 'unbounded'));
  ok(!fu.inProcess.ended && !fu.inProcess.slotFree && fu.reattach.re === 'running' && !fu.reattach.ended && !fu.reattach.slotFree, 'control (f): …a hung npm held THE slot past its deadline, before and after a restart — exactly what ②\'s slot-bound legs catch', fu);
  // verify r2 (H1): a keeper that runs the CURRENT `browser.cli` on every call (the pre-ruling wiring) ⇒ its own call on a
  // browser launched under 0.38.0 runs 0.38.1 and the fake daemon restarts; a removed install falls silently to PATH
  const noKeep = ks.replace("      const c = await cliOptReady(browserRecordForCall(ns, opts.extraEnv && typeof opts.extraEnv === 'object' ? opts.extraEnv : {}));", "      const c = null;");
  ok(noKeep !== ks, 'control (h): the patch (every keeper call on the current CLI) applies');
  const hk = await h1Leg(MUT.load('src/server/browser-keeper.js', noKeep, 'no-keep'), 'no-keep');
  ok(hk.streamCalls.some((v) => v === '0.38.1') && hk.restarts.length > 0 && !(hk.stream2 && /browser_cli_gone/.test(String(hk.stream2.error))), 'control (h): …the keeper\'s stream call ran 0.38.1 and the daemon RESTARTED; the removed install was not refused — exactly what ⑤b\'s keeper legs catch', { streamCalls: hk.streamCalls, restarts: hk.restarts.length, stream2: hk.stream2 });
  // …and the agent's CLI without the rule (the pre-ruling copy: the current pin / PATH, whatever the browser runs)
  const cs = read('data/bin/vibespace-browser');
  const noPick = cs.replace("  if (wantCli && wantCli !== binVersion && typeof V.cliForBrowser === 'function') {", "  if (false) {");
  ok(noPick !== cs, 'control (i): the patch (the CLI ignores the version its browser runs) applies');
  const hc = await h1Leg(K, 'no-pick', { cliSrc: noPick });
  ok(hc.nextCalls.some((c) => c.verb === 'get title' && c.v === '0.38.1') && hc.restarts.length > 0 && /version mismatch/i.test(hc.next.se), 'control (i): …the conversation\'s next command ran 0.38.1 and printed "Daemon version mismatch detected, restarting..." — exactly what ⑤b\'s next-command leg catches', { next: hc.nextCalls, restarts: hc.restarts.length });
  // verify r3 (Y1): a keeper whose doors judge off the sync reading (a never-asked binary = "gone") ⇒ the same version put
  // back at the same path is refused once
  const noAsk = ks.replace("    if (!(j && j.unknown)) return j;\n    await Promise.all(", "    return cliOptOf(rec);\n    await Promise.all(");
  ok(noAsk !== ks, 'control (j): the patch (the doors refuse an unasked binary instead of asking it) applies');
  const hj = await sameVersionLeg(MUT.load('src/server/browser-keeper.js', noAsk, 'no-ask'), require('../src/routes/browser.js'), 'no-ask');
  ok(hj.stream && hj.stream.code === 'browser_cli_gone' && hj.streamCalls.length === 0, 'control (j): …the keeper\'s call on a browser whose binary was re-installed (the same version) was refused browser_cli_gone — exactly what the r3 (Y1) leg catches', { stream: hj.stream && hj.stream.code, calls: hj.streamCalls });
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
