#!/usr/bin/env node
// THE `remoteapp-facts` DEVICE OP (design q-024 r1 §1.4, lane remoteapp-r1b) against REAL daemons — the THREE-TOUCH rule:
// the handler in src/agentd/agentd.js (through THE shared runner src/remoteapp-facts.js), the capability in the hello-ack,
// the client's gated method (src/agentd/client.js remoteappFacts) — test-sysinfo-op's shape. Heavy: three daemons boot.
//   §1 the real bundle (data/bin/vibespace-agentd.js, built from this tree) on THIS Linux box: the hello-ack names the
//      capability; the op answers with `op` on the reply (the id-keyed routing set) — `remoteapp_not_windows` by name,
//      no process started (the facts are a Windows machine's)
//   §2 THE WIN32 SHAPE: a bundle copy whose platform is win32 (the handler's + the hello-ack's) and a stub `powershell.exe`
//      in the daemon's ~/.local/bin (agentd's spawnEnv puts it on PATH): the daemon runs THE read-only script
//      (`-EncodedCommand`, decoded here = REMOTEAPP_FACTS_SCRIPT verbatim), its JSON line parses through the real chain —
//      a ready Pro machine, a Home machine with Remote Desktop off, a machine printing nothing — and the hub's access layer
//      (src/server/desktop-access.js remoteappFacts) turns the answer into the card's rows
//   §3 THE CAPABILITY GATE: a daemon copy whose hello-ack lacks `remoteapp-facts` (an older agent) is NEVER asked —
//      host_needs_daemon in < 1 s carrying its version, and the access layer answers agent_too_old {have, need}
//   CONTROL: the same old daemon asked anyway (a raw request past the gate) answers NOTHING (it times out) — why the gate exists
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const RA = require(path.join(REPO, 'src/remoteapp.js'));
const MD = require(path.join(REPO, 'src/machine-desktop-model.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const homes = [scratchHome('rafacts-home', fs, ['.vibespace']), scratchHome('rafacts-win', fs, ['.vibespace', '.local/bin']), scratchHome('rafacts-old', fs, ['.vibespace'])];
const [home, homeWin, homeOld] = homes;
const copyDir = scratch('rafacts-bundle'); fs.mkdirSync(copyDir, { recursive: true });
const rootOf = (h) => path.join(h, 'agentd-root');
const devices = [];
const cleanup = () => { for (const d of devices) { try { d.stop(); } catch { } } for (const h of homes) endDaemonsOf(rootOf(h)); for (const d of [...homes, copyDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
function deviceOn(h, bundlePath = BUNDLE) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h);
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  devices.push(dm);
  return dm;
}
const hostsFor = (map) => ({ get: (h) => (map[h] ? { id: h, name: 'Lab PC' } : null), isLocal: (h) => !h || h === 'local', deviceBounded: async (h) => map[h] });
const bundleText = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';
const CAP_LIST = /capabilities: \[([^\]]*)\]/;
const capsOf = (txt) => { const m = CAP_LIST.exec(txt); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : null; };
ok(capsOf(bundleText) && capsOf(bundleText).includes(`"${RA.FACTS_CAPABILITY}"`) && /remoteapp-facts-result/.test(bundleText) && /function readRemoteappFacts\(/.test(bundleText), 'data/bin/vibespace-agentd.js names the capability, answers `remoteapp-facts-result` and bundles THE shared runner (run `npm run build:agentd` after a change)');
if (!bundleText) { console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }

console.log('§1 the real daemon on this Linux box');
{
  const dm = deviceOn(home);
  const conn = await dm.connect();
  ok(conn.info && conn.info.capabilities.includes('remoteapp-facts') && conn.info.platform === 'linux', 'the hello-ack names remoteapp-facts (the client asks only such a daemon)');
  const r = await dm.remoteappFacts();
  ok(r && r.ok === false && r.code === 'remoteapp_not_windows' && /Windows machine/.test(r.error), 'the op answers (the reply carries its op — an op-less reply would time out the request) remoteapp_not_windows by name on Linux', r);
  const agentdSrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(/if \(msg\.op === 'remoteapp-facts'\) \{[\s\S]{0,300}require\('\.\/\.\.\/remoteapp-facts\.js'\)\.readRemoteappFacts\(\{ platform: process\.platform[\s\S]{0,300}op: 'remoteapp-facts-result', id: msg\.id/.test(agentdSrc), 'the handler runs THE shared runner with this machine\'s platform and replies via mux.control with the op');
  dm.stop(); endDaemonsOf(rootOf(home));
}

console.log('§2 the win32 shape — the stub PowerShell, the real chain');
const winText = bundleText
  .replace(/(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/, '$1platform: "win32",')
  .replace(/readRemoteappFacts\(\{\s*platform: process\.platform,/, 'readRemoteappFacts({ platform: "win32",');
const winBundle = path.join(copyDir, 'win', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(winBundle), { recursive: true });
fs.writeFileSync(winBundle, winText);
ok(winText !== bundleText && (winText.match(/platform: "win32"/g) || []).length === 2, 'the copy says win32 twice: the hello-ack and the op\'s handler (found by content)');
const answerFile = path.join(homeWin, 'ps-answer.txt'), argsFile = path.join(homeWin, 'ps-args.txt');
fs.writeFileSync(path.join(homeWin, '.local/bin/powershell.exe'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\ncat '${answerFile}' 2>/dev/null\nexit 0\n`, { mode: 0o755 });
const line = (o) => JSON.stringify({ t: 'remoteapp-facts', edition: 'Professional', product: 'Windows 10 Pro', build: '26100', deny: '0', listening: 1, allowList: '1', gpu: null, ...o });
{
  const dm = deviceOn(homeWin, winBundle);
  const conn = await dm.connect();
  ok(conn.info.platform === 'win32' && conn.info.capabilities.includes('remoteapp-facts'), 'the copy\'s hello-ack: win32, with the capability');
  fs.writeFileSync(answerFile, 'WARNING: some noise first\r\n' + line({}) + '\r\n');
  const r = await dm.remoteappFacts();
  ok(r && r.ok === true && r.platform === 'win32' && r.edition.kind === 'pro' && r.rdpOn === true && r.listening === true && r.allowList === true && r.gpuPolicy === null, 'a ready Pro machine: the stub\'s line parsed through the daemon\'s real runner', r);
  const args = fs.readFileSync(argsFile, 'utf8').trim().split('\n');
  const enc = args[args.indexOf('-EncodedCommand') + 1];
  const decoded = Buffer.from(enc || '', 'base64').toString('utf16le');
  ok(JSON.stringify(args.slice(0, -1)) === JSON.stringify(MD.PS_ARGV.slice(1)) && decoded === RA.REMOTEAPP_FACTS_SCRIPT, 'it ran powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <THE read-only script, verbatim>', args.slice(0, -1));
  // the hub's access layer over this daemon
  const acc = ACC.create({ hosts: hostsFor({ 'dev-win': dm }), install: false, log: { log() { }, warn() { } } });
  const a = await acc.remoteappFacts('dev-win');
  ok(a.ok && a.ready === true && JSON.stringify(a.rows.map((x) => [x.key, x.met])) === '[["edition",true],["rdp",true],["allowlist",true],["gpu",false]]', 'the access layer: the card\'s rows (the GPU policy unmet but optional) and ready', a.rows);
  fs.writeFileSync(answerFile, line({ edition: 'Core', product: 'Windows 11 Home', deny: '1', listening: 0, allowList: null }) + '\n');
  const h = await acc.remoteappFacts('dev-win');
  ok(h.ok && h.ready === false && JSON.stringify(h.rows.map((x) => x.code)) === '["edition_home","rdp_off","allowlist_off","gpu_off"]', 'a Home machine with Remote Desktop off: every row unmet with its sentence code, NOT ready', h.rows);
  fs.writeFileSync(answerFile, 'nothing useful\n');
  const n = await dm.remoteappFacts();
  ok(n && n.ok === false && n.code === 'bad_output', 'a machine that printed no line of ours ⇒ bad_output by name', n);
  const acM = ACC.create({ hosts: hostsFor({ 'dev-mac': { status: () => ({ connected: true, info: { platform: 'darwin' } }), desktopServe: async () => ({}) } }), install: false, log: { log() { }, warn() { } } });
  const mac = await acM.remoteappFacts('dev-mac').then(() => null, (e) => e);
  ok(mac && mac.code === 'remoteapp_not_windows', 'a Mac is refused by the access layer before any op (remoteapp_not_windows)');
  dm.stop(); endDaemonsOf(rootOf(homeWin));
}

console.log('§3 the capability gate — an older agent is never asked');
{
  const oldText = bundleText.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && x !== '"remoteapp-facts"').join(', ')}]`);
  const caps = capsOf(oldText), capsNow = capsOf(bundleText);
  ok(caps && !caps.includes('"remoteapp-facts"') && caps.length === capsNow.length - 1, 'the old-daemon copy\'s list lacks remoteapp-facts and keeps every other capability (dropped by content, never by the list\'s tail)');
  const oldBundle = path.join(copyDir, 'old', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(oldBundle), { recursive: true });
  fs.writeFileSync(oldBundle, oldText.replace("if (msg.op === \"remoteapp-facts\") {", 'if (false) {'));
  const dm = deviceOn(homeOld, oldBundle);
  const conn = await dm.connect();
  ok(!conn.info.capabilities.includes('remoteapp-facts'), 'the old daemon\'s hello-ack lacks it');
  // NEVER ASKED, proven by what reaches the link (not by a stopwatch): a spy on the client's one request door
  const sent = [];
  const send0 = dm._request.bind(dm);
  dm._request = (msg) => { sent.push(msg && msg.op); return send0(msg); };
  const e = await dm.remoteappFacts().then(() => null, (x) => x);
  ok(e && e.code === 'host_needs_daemon' && e.daemonVersion === conn.info.daemonVersion && sent.length === 0, 'the client refuses it by the capability: host_needs_daemon carrying the agent\'s version, and NO request went to the agent (never asked — never a hang)', e && { code: e.code, v: e.daemonVersion, sent });
  const acc = ACC.create({ hosts: hostsFor({ 'dev-old': { ...dm, status: () => ({ connected: true, info: { platform: 'win32' } }), desktopServe: async () => ({}), remoteappFacts: (...x) => dm.remoteappFacts(...x) } }), install: false, log: { log() { }, warn() { } } });
  const a = await acc.remoteappFacts('dev-old');
  ok(a.ok === false && a.code === 'agent_too_old' && a.have === conn.info.daemonVersion && a.need === require(path.join(REPO, 'package.json')).version && /needs version/.test(a.error), 'the access layer answers agent_too_old naming the version it has and the one it needs (this hub\'s) — the card says it, never guesses', a);
  // CONTROL — why the gate exists: asked anyway, the old daemon answers nothing
  const raw = await send0({ op: 'remoteapp-facts', timeoutMs: 1500 }).then((r) => ({ answered: r }), (x) => ({ error: String(x && x.message) }));
  ok(!raw.answered && /time(?:d)? ?out/i.test(raw.error || ''), 'CONTROL: the same old daemon asked past the gate answers NOTHING — the request ends on its own timeout (an unknown op hangs: the 2.300.0 rule)', raw);
  dm.stop(); endDaemonsOf(rootOf(homeOld));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
