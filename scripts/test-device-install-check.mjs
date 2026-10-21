#!/usr/bin/env node
// test-device-install-check — lane-pairing ⑤ (B-7007; the owner's MacBook 2026-09-27: a hand-edited address the
// Mac could not reach — a typo host over wss — was installed anyway, the daemon dialed it forever, the row said
// "offline"). The installer now checks the dial address BEFORE it writes anything, with the daemon's OWN dial:
//   · `vibespace-device.js --dial-check` (the REAL bundle built from this tree) exits by class: 0 ok (a live
//     server), 10 dns (nonexistent.invalid), 11 tls (wss:// to the plain port), 12 unreachable (a closed port),
//     13 not a VibeSpace dial endpoint (a plain http server), 14 refused (a wrong token; an unknown device)
//   · the probe against the live server registers NOTHING (no dial entry, no hosts-updated, the row stays offline)
//     and stamps lastProbeAt — the scratch server is the REAL gate (src/server/dial-pairing.js gateDialUpgrade + a
//     real HostManager in a scratch data dir: exactly what server.js's upgrade branch calls)
//   · scripts/vibespace-agentd-install.sh with a wrong token exits 14 and NOTHING of the install is written — no
//     state/dial.json, no state/token, no systemd unit, systemctl never called (a stub records every call);
//     a bad scheme exits 2 before anything is fetched; with --no-check it writes them (and the daemon starts);
//     with the right token it prints "dial-check ok" and installs, and the device dials in
//   · lane mac-repair-retires-stale (B-06e9): the probe names the hub (`hub id: vh-…`), the installer keeps it in dial.json,
//     and once the new daemon dialed in it RETIRES the older installs of the SAME hub (launch items set aside, the detached
//     agents stopped by their lock pid — only when its argv names vibespace-device), keeps another hub's, LISTS an unknown
//     one with its stop command; a daemon learns its hub at its next accepted dial; RED CONTROL (q) = the base installer
// Everything in a scratch HOME under /tmp/vs-…; a stub systemctl / loginctl; node-pty satisfied by a symlink to
// this checkout's node_modules (no npm); zero vendor calls.
// Run: node scripts/test-device-install-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const T0 = Date.now();

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000, step = 150) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { } await sleep(step); } return null; };

const S = scratch('installcheck');
fs.mkdirSync(S, { recursive: true });
const pids = [];
const cleanup = () => {
  for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { } }
  try { fs.rmSync(S, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

// ── the REAL bundle, built from this tree into the scratch dir ──
const bundle = path.join(S, 'vibespace-device.js');
const version = require(path.join(REPO, 'package.json')).version;
fs.writeFileSync(path.join(REPO, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`, '--log-level=warning'], { cwd: REPO });

// ── the scratch server: the REAL dial gate + a real HostManager, serving the bundle ──
const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
const DF = require(path.join(REPO, 'src/dial-facts.js'));
const { WebSocketServer } = require(path.join(REPO, 'node_modules/ws'));
const dataDir = path.join(S, 'server', 'data'); fs.mkdirSync(dataDir, { recursive: true });
const H = new HostManager({ dataDir });
const casts = [];
const HOST_TOKEN = 'vsht_ic' + crypto.randomBytes(8).toString('hex');
const DP = require(path.join(REPO, 'src/server/dial-pairing.js')).create({ rootDir: REPO, AGENTD_DIR: path.join(dataDir, 'agentd'), agentdHostToken: () => HOST_TOKEN,
  getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: (m) => casts.push(m) });
H.dialOnline = (d) => DP.agentdDials.has(d);
const wss = new WebSocketServer({ noServer: true });
const srv = http.createServer((req, res) => {
  if (req.url === '/vibespace-device.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); fs.createReadStream(bundle).pipe(res); return; }
  res.writeHead(404); res.end();
});
let refuseLinks = false; // lane mac-repair-retires-stale ④: the hub answers the probe but drops the daemon's LINK (a new install that never dials in)
srv.on('upgrade', (req, socket, head) => {
  if (refuseLinks && !req.headers['x-vibespace-dial-probe']) { socket.destroy(); return; }
  const gate = DP.gateDialUpgrade(req, socket);
  if (!gate) return;
  wss.handleUpgrade(req, socket, head, (ws) => {
    const L = { data: [], close: [], error: [] };
    ws.on('message', (d) => L.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))));
    ws.on('close', () => L.close.forEach((f) => f()));
    const stream = { write: (d) => { try { ws.send(d); return true; } catch { return false; } }, on: (ev, fn) => { L[ev]?.push(fn); }, destroy: () => { try { ws.close(); } catch { } } };
    DP.agentdDials.set(gate.deviceId, stream);
    DP.noteDialEvent(gate.deviceId, 'accepted', gate.facts);
    ws.on('close', () => { if (DP.agentdDials.get(gate.deviceId) === stream) DP.agentdDials.delete(gate.deviceId); });
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;
const BASE = `http://127.0.0.1:${PORT}`;
const pair = DP.agentdMintDialPair('icdev', { host: `127.0.0.1:${PORT}` });
const DIAL = `ws://127.0.0.1:${PORT}/api/device-dial?device=icdev`;
// a plain http server that is NOT VibeSpace (answers every request 404), and a closed port
const plain = http.createServer((req, res) => { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); });
await new Promise((r) => plain.listen(0, '127.0.0.1', r));
const closedPort = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const run = (args, { env = {}, cwd = S } = {}) => new Promise((resolve) => {
  const out = [];
  const c = spawn(args[0], args.slice(1), { cwd, env: { ...process.env, ...env } });
  c.stdout.on('data', (d) => out.push(d)); c.stderr.on('data', (d) => out.push(d));
  const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 90000);
  c.on('exit', (code) => { clearTimeout(kill); resolve({ code, out: Buffer.concat(out).toString() }); });
});
const checkRoot = path.join(S, 'check-root');
const dialCheck = (url, token, extra = []) => run([process.execPath, bundle, '--dial-check', url, '--dial-token', token, '--timeout-ms', '5000', ...extra], { env: { VIBESPACE_DEVICE_ROOT: checkRoot, VIBESPACE_AGENTD_ROOT: checkRoot } });

console.log('--dial-check: the exit code by class (the REAL bundle)');
{
  const castsBefore = casts.length;
  const r0 = await dialCheck(DIAL, pair.dialToken);
  ok(r0.code === 0 && /^dial-check ok — 127\.0\.0\.1:\d+ is a VibeSpace [\d.]+ and accepts device "icdev"/.test(r0.out), 'exit 0 — the live server accepts the device', r0);
  ok(!DP.agentdDials.has('icdev') && casts.length === castsBefore && !H.list().find((h) => h.deviceId === 'icdev').online && H.list().find((h) => h.deviceId === 'icdev').dial.lastProbeAt > 0, 'the probe registered NOTHING — no dial entry, no hosts-updated, the row offline — and stamped lastProbeAt (attack 22)');
  const r10 = await dialCheck('ws://nonexistent.invalid:3456/api/device-dial?device=icdev', pair.dialToken);
  ok(r10.code === 10 && /dial-check failed — dns: .*ENOTFOUND nonexistent\.invalid/.test(r10.out) && /this device cannot resolve nonexistent\.invalid\. In the pairing dialog pick another address/.test(r10.out), 'exit 10 — dns, with the remedy', r10);
  const r11 = await dialCheck(`wss://127.0.0.1:${PORT}/api/device-dial?device=icdev`, pair.dialToken);
  ok(r11.code === 11 && /dial-check failed — tls:/.test(r11.out) && /does not speak TLS/.test(r11.out), 'exit 11 — wss:// to the plain port (the owner\'s typo class)', r11);
  const r12 = await dialCheck(`ws://127.0.0.1:${closedPort}/api/device-dial?device=icdev`, pair.dialToken);
  ok(r12.code === 12 && /dial-check failed — refused-connect:/.test(r12.out) && /nothing answers at 127\.0\.0\.1:\d+ from this network/.test(r12.out), 'exit 12 — a closed port', r12);
  const r13 = await dialCheck(`ws://127.0.0.1:${plain.address().port}/api/device-dial?device=icdev`, pair.dialToken);
  ok(r13.code === 13 && /dial-check failed — http-404:/.test(r13.out) && /not as a VibeSpace dial endpoint \(status 404\)/.test(r13.out), 'exit 13 — an http server that is not VibeSpace', r13);
  const r14 = await dialCheck(DIAL, 'vsdt_' + 'e'.repeat(36));
  ok(r14.code === 14 && /dial-check failed — refused-token-mismatch: the dial token does not match the pairing on record for "icdev"/.test(r14.out) && /generate a new command in the pairing dialog/.test(r14.out), 'exit 14 — a wrong token (the server\'s sentence)', r14);
  const r14b = await dialCheck(`ws://127.0.0.1:${PORT}/api/device-dial?device=nosuch`, pair.dialToken);
  // verify-r2 (the dial endpoint): an unknown name hears the SAME answer as a wrong token — `no-pairing` on the wire told
  // anyone reaching the port which device names are paired here; the sentence covers both roads (a new command, or pair again)
  ok(r14b.code === 14 && /refused-token-mismatch: the dial token does not match the pairing on record for "nosuch"/.test(r14b.out) && /or pair again if it is no longer listed/.test(r14b.out) && !/no-pairing/.test(r14b.out), 'exit 14 — no pairing on record, answered exactly as a wrong token (no enumeration)', r14b);
  ok(!fs.existsSync(path.join(checkRoot, 'state', 'agentd.lock')) && !fs.existsSync(path.join(checkRoot, 'state', 'dial.json')) && !fs.existsSync(path.join(checkRoot, 'state', 'dial-status.json')), '--dial-check wrote nothing under state/ (no lock, no dial.json, no status)');
}

// ── the installer ──
const home = path.join(S, 'home'); fs.mkdirSync(home, { recursive: true });
const stub = path.join(S, 'stub'); fs.mkdirSync(stub, { recursive: true });
const calls = path.join(S, 'systemctl-calls.log');
const writeStub = (mode) => {
  // 'ok' = systemd present (records every call, succeeds); 'absent' = `systemctl --user show-environment` fails ⇒ the detached fallback
  fs.writeFileSync(path.join(stub, 'systemctl'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(calls)}\n${mode === 'absent' ? 'exit 1' : 'exit 0'}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(stub, 'loginctl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
};
const ROOT = path.join(home, '.vibespace', 'device@127.0.0.1');
const preparePty = () => { fs.mkdirSync(ROOT, { recursive: true }); try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ROOT, 'node_modules')); } catch { } }; // pty_ok passes — no npm
const install = (extra = []) => run(['bash', path.join(REPO, 'scripts/vibespace-agentd-install.sh'), '--bundle-url', `${BASE}/vibespace-device.js`, '--node', process.execPath, ...extra],
  { env: { HOME: home, PATH: `${stub}:${process.env.PATH}`, XDG_RUNTIME_DIR: '', DBUS_SESSION_BUS_ADDRESS: '', VIBESPACE_DEVICE_ROOT: '', VIBESPACE_AGENTD_ROOT: '' } });
// verify-r3 B-inst: a NODE SHIM that records the argv of every node the installer starts (the dial check, the dial.json
// writer, the daemon) and a /proc sampler — no token may appear in any process's argv (every local user reads them)
const shimDir = path.join(S, 'nodeshim'); fs.mkdirSync(shimDir, { recursive: true });
const argvLog = path.join(S, 'node-argv.log');
fs.writeFileSync(path.join(shimDir, 'node'), `#!/bin/sh\n{ for a in "$@"; do printf '%s ' "$a"; done; printf '\\n'; } >> ${JSON.stringify(argvLog)}\nexec ${JSON.stringify(process.execPath)} "$@"\n`, { mode: 0o755 });
const SHIM = path.join(shimDir, 'node');
const argvSeen = new Set(); let sampling = false;
const sampleArgv = () => { let ps = []; try { ps = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)); } catch { return; } for (const p of ps) { let c = ''; try { c = fs.readFileSync(`/proc/${p}/cmdline`, 'latin1'); } catch { continue; } if (c.includes('vs')) for (const m of c.match(/vs[dh]t_[0-9a-f]{16,}/g) || []) argvSeen.add(m); } };
const sampler = async () => { while (sampling) { sampleArgv(); await sleep(40); } };
/** the pasted command's NEW shape (verify-r3 B-inst): the tokens in the environment of the installer's shell, the flags without them */
const installEnv = (tokens, extra = [], script = path.join(REPO, 'scripts/vibespace-agentd-install.sh')) => run(['bash', script, '--bundle-url', `${BASE}/vibespace-device.js`, '--node', SHIM, ...extra],
  { env: { HOME: home, PATH: `${stub}:${process.env.PATH}`, XDG_RUNTIME_DIR: '', DBUS_SESSION_BUS_ADDRESS: '', VIBESPACE_DEVICE_ROOT: '', VIBESPACE_AGENTD_ROOT: '', VIBESPACE_DIAL_TOKEN: tokens.dial, VIBESPACE_HOST_TOKEN: tokens.host } });
const unitFiles = () => { try { return fs.readdirSync(path.join(home, '.config', 'systemd', 'user')).filter((f) => /^vibespace-device-.*\.service$/.test(f)); } catch { return []; } };
const lockPid = () => { try { return Number(String(fs.readFileSync(path.join(ROOT, 'state', 'agentd.lock'), 'utf8')).trim()); } catch { return 0; } };

console.log('the installer checks BEFORE it writes');
{
  writeStub('ok');
  try { fs.unlinkSync(calls); } catch { }
  preparePty();
  const bad = await install(['--dial', DIAL, '--dial-token', 'vsdt_' + 'e'.repeat(36), '--host-token', HOST_TOKEN]);
  ok(bad.code === 14, 'a wrong token ⇒ the installer exits 14', bad.out.slice(-800));
  ok(/✗ nothing was installed — the device cannot dial 127\.0\.0\.1:\d+: dial-check failed — refused-token-mismatch/.test(bad.out), '…printing "nothing was installed — the device cannot dial <host:port>: <the check\'s line>"', bad.out.slice(-600));
  ok(!fs.existsSync(path.join(ROOT, 'state', 'dial.json')) && !fs.existsSync(path.join(ROOT, 'state', 'token')), 'FILE CENSUS: no state/dial.json, no state/token');
  ok(unitFiles().length === 0 && !fs.existsSync(calls), 'FILE CENSUS: no systemd unit, systemctl never called (the stub would have recorded it)');
  ok(!lockPid(), 'no daemon started');
  const scheme = await install(['--dial', `http://127.0.0.1:${PORT}/api/device-dial?device=icdev`, '--dial-token', pair.dialToken, '--host-token', HOST_TOKEN]);
  ok(scheme.code === 2 && /✗ the dial address must start with ws:\/\/ or wss:\/\/ — got: http:/.test(scheme.out) && !/fetching agentd bundle/.test(scheme.out), 'a non-ws scheme ⇒ exit 2 before anything is fetched', scheme.out.slice(-400));
  const typo = await install(['--dial', 'ws://nonexistent.invalid:3456/api/device-dial?device=icdev', '--dial-token', pair.dialToken, '--host-token', HOST_TOKEN]);
  ok(typo.code === 10 && /cannot resolve nonexistent\.invalid/.test(typo.out) && !fs.existsSync(path.join(ROOT, 'state', 'dial.json')), 'a typo host ⇒ exit 10, nothing written (the owner\'s incident)', typo.out.slice(-400));
}
console.log('--no-check writes them; the right token installs and dials in');
{
  writeStub('absent'); // no systemd ⇒ the installer's detached fallback starts the daemon (nothing registered on this machine)
  try { fs.unlinkSync(calls); } catch { }
  try { fs.unlinkSync(argvLog); } catch { }
  const nc = await install(['--dial', DIAL, '--dial-token', 'vsdt_' + 'e'.repeat(36), '--host-token', HOST_TOKEN, '--no-check', '--node', SHIM]);
  const ncArgv = (() => { try { return fs.readFileSync(argvLog, 'utf8'); } catch { return ''; } })();
  ok(ncArgv.includes('-e') && !/vs[dh]t_/.test(ncArgv), 'verify-r3 B-inst: the flags shape still installs (commands users already hold) and no node the installer starts carries a token in its argv (the dial.json writer reads it from its environment)', ncArgv.split('\n').map((l) => l.replace(/-e \S.{0,60}/, '-e …').slice(0, 200)));
  if (lockPid()) pids.push(lockPid());
  ok(nc.code === 0 && fs.existsSync(path.join(ROOT, 'state', 'dial.json')) && fs.existsSync(path.join(ROOT, 'state', 'token')) && !/checking that this device can dial/.test(nc.out), 'with --no-check the installer skips the check and writes dial.json + the token (the daemon starts)', nc.out.slice(-600));
  const refused = await waitFor(() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'dial-status.json'), 'utf8')); return j.last && j.last.code === 'refused-token-mismatch' ? j : null; }, 20000);
  ok(!!refused, '…and the started daemon records WHY it is refused (state/dial-status.json: refused-token-mismatch)');
  try { process.kill(lockPid(), 'SIGTERM'); } catch { }
  await waitFor(() => { try { process.kill(lockPid(), 0); return false; } catch { return true; } }, 8000);
  try { fs.unlinkSync(argvLog); } catch { }
  sampling = true; sampler();
  const good = await installEnv({ dial: pair.dialToken, host: HOST_TOKEN }, ['--dial', DIAL]);
  if (lockPid()) pids.push(lockPid());
  await sleep(300); sampling = false; sampleArgv();
  const goodArgv = (() => { try { return fs.readFileSync(argvLog, 'utf8'); } catch { return ''; } })();
  ok(/--dial-check/.test(goodArgv) && !goodArgv.includes(pair.dialToken) && !goodArgv.includes(HOST_TOKEN), 'verify-r3 B-inst: the pasted command\'s NEW shape (tokens in the environment): the dial check, the dial.json writer and the daemon carry no token in their argv', goodArgv.split('\n').map((l) => l.slice(0, 160)));
  ok(!argvSeen.has(pair.dialToken) && !argvSeen.has(HOST_TOKEN), 'verify-r3 B-inst: no process on this machine showed either token in its argv during the whole install (sampled every 40 ms)', [...argvSeen].map((t) => t.slice(0, 9)));
  const dj = path.join(ROOT, 'state', 'dial.json');
  ok(JSON.parse(fs.readFileSync(dj, 'utf8')).token === pair.dialToken && (fs.statSync(dj).mode & 0o777) === 0o600 && (fs.statSync(path.join(ROOT, 'state', 'token')).mode & 0o777) === 0o600 && fs.readFileSync(path.join(ROOT, 'state', 'token'), 'utf8') === HOST_TOKEN, 'the tokens landed where they belong — state/dial.json + state/token, 0600');
  const denv = (() => { try { return fs.readFileSync(`/proc/${lockPid()}/environ`, 'latin1'); } catch { return null; } })();
  ok(denv !== null && !denv.includes(pair.dialToken) && !denv.includes(HOST_TOKEN) && !/VIBESPACE_(DIAL|HOST)_TOKEN=/.test(denv), 'verify-r3 B-inst: the started daemon\'s ENVIRONMENT holds no token (its sessions inherit it — the installer unsets what the pasted command handed it)', denv === null ? 'no daemon' : denv.split('\0').filter((kv) => /TOKEN/.test(kv)));
  ok(good.code === 0 && /dial-check ok — 127\.0\.0\.1:\d+ is a VibeSpace/.test(good.out) && /✓ vibespace device agent running/.test(good.out), 'the right token: "dial-check ok", then the install completes', good.out.slice(-600));
  const up = await waitFor(() => DP.agentdDials.has('icdev'), 30000);
  ok(!!up && DF.dialRowState(H.list().find((h) => h.deviceId === 'icdev')).state === 'connected', 'the device dials in; the row reads connected');
  // the manual daemon form the pair route's `command` field now names: `VIBESPACE_DIAL_TOKEN=… node vibespace-device.js --dial <url>`
  {
    try { process.kill(lockPid(), 'SIGTERM'); } catch { }
    await waitFor(() => { try { process.kill(lockPid(), 0); return false; } catch { return true; } }, 8000);
    const mroot = path.join(S, 'manual-root'); fs.mkdirSync(path.join(mroot, 'state'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(mroot, 'state', 'token'), HOST_TOKEN, { mode: 0o600 });
    const md = spawn(process.execPath, [bundle, '--dial', DIAL], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: home, VIBESPACE_DEVICE_ROOT: mroot, VIBESPACE_AGENTD_ROOT: mroot, VIBESPACE_DIAL_TOKEN: pair.dialToken } });
    md.unref(); pids.push(md.pid);
    const mj = await waitFor(() => { try { return JSON.parse(fs.readFileSync(path.join(mroot, 'state', 'dial.json'), 'utf8')); } catch { return null; } }, 8000);
    const mup = await waitFor(() => DP.agentdDials.has('icdev'), 20000);
    ok(mj && mj.token === pair.dialToken && (fs.statSync(path.join(mroot, 'state', 'dial.json')).mode & 0o777) === 0o600 && !!mup, 'verify-r3 B-inst: the manual form (the token in the daemon\'s environment, `--dial <url>` alone) persists the token at 0600 and dials in — r2 read argv[0] (the node binary\'s path) as the token when the flag was absent', mj);
    try { process.kill(md.pid, 'SIGTERM'); } catch { }
    await waitFor(() => !DP.agentdDials.has('icdev'), 8000);
    // B-inst r2: its SELF-UPGRADE RE-EXEC carries the flags (`--dial <url>`) and not the token (removed from the environment
    // on purpose) — the re-exec'd daemon must keep the pairing on disk, not write `token: ''` over it (reproduced before the fix)
    const reexecShape = (script) => { const d = spawn(process.execPath, [script, '--dial', DIAL], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: home, VIBESPACE_DEVICE_ROOT: mroot, VIBESPACE_AGENTD_ROOT: mroot, VIBESPACE_DIAL_TOKEN: '' } }); d.unref(); pids.push(d.pid); return d; };
    const rd = reexecShape(bundle);
    const rup = await waitFor(() => DP.agentdDials.has('icdev'), 20000);
    const rj = JSON.parse(fs.readFileSync(path.join(mroot, 'state', 'dial.json'), 'utf8'));
    ok(!!rup && rj.token === pair.dialToken, 'verify-r3 B-inst r2: the re-exec shape (`--dial <url>`, no token anywhere) keeps the pairing on disk and dials back in', rj);
    try { process.kill(rd.pid, 'SIGTERM'); } catch { }
    await waitFor(() => !DP.agentdDials.has('icdev'), 8000);
    // CONTROL (o): the daemon without the guard (run from a patched SOURCE copy) writes `token: ''` over it
    {
      const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
      const M = mutantCopies('installreexec', REPO);
      const asrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
      const unguarded = asrc.replace('    if (cfg.token) { try { const tmp = DIAL_FILE', '    if (true) { try { const tmp = DIAL_FILE');
      ok(unguarded !== asrc, '(o) the patch applies');
      const cp = M.write('src/agentd/agentd.js', unguarded, 'unguarded');
      const cd = reexecShape(cp);
      const clob = await waitFor(() => { try { return JSON.parse(fs.readFileSync(path.join(mroot, 'state', 'dial.json'), 'utf8')).token === '' ? true : null; } catch { return null; } }, 8000);
      ok(!!clob, 'CONTROL (o): the unguarded daemon writes `token: \'\'` over the pairing in the re-exec shape — the r2 leg above goes red');
      try { process.kill(cd.pid, 'SIGTERM'); } catch { }
      for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(x.pass, x.name, x.detail);
    }
  }
  // CONTROL (n): the installer with r2's children — the check's token as a FLAG and the dial.json writer's as an ARGUMENT —
  // run in the new shape: the recording shim sees the token in their argv (the argv legs above go red)
  {
    const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
    const M = mutantCopies('installcheck', REPO);
    const isrc = fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.sh'), 'utf8');
    const r2 = isrc.replace('CHECK_OUT=$(VIBESPACE_DIAL_TOKEN="$DIAL_TOKEN" VIBESPACE_DEVICE_ROOT="$ROOT" VIBESPACE_AGENTD_ROOT="$ROOT" "$NODE_BIN" "$ROOT/current/vibespace-device.js" --dial-check "$DIAL_URL" 2>&1)', 'CHECK_OUT=$(VIBESPACE_DEVICE_ROOT="$ROOT" VIBESPACE_AGENTD_ROOT="$ROOT" "$NODE_BIN" "$ROOT/current/vibespace-device.js" --dial-check "$DIAL_URL" --dial-token "$DIAL_TOKEN" 2>&1)')
      .replace('token:process.env.VIBESPACE_DIAL_TOKEN||"",', 'token:process.argv[4],').replace('    "$ROOT/state/dial.json" "$DIAL_URL" "$HUB_ID"\n', '    "$ROOT/state/dial.json" "$DIAL_URL" "$HUB_ID" "$DIAL_TOKEN"\n');
    ok(r2 !== isrc && r2.split('--dial-token "$DIAL_TOKEN"').length === 2 && r2.includes('"$HUB_ID" "$DIAL_TOKEN"') && r2.includes('token:process.argv[4],'), '(n) the patch applies (both children back to r2)');
    const copy = path.join(M.dir, 'vibespace-agentd-install-r2children.sh'); fs.writeFileSync(copy, r2, { mode: 0o755 }); M.files.push(copy);
    try { fs.unlinkSync(argvLog); } catch { }
    const cr = await installEnv({ dial: pair.dialToken, host: HOST_TOKEN }, ['--dial', DIAL], copy);
    if (lockPid()) pids.push(lockPid());
    const cArgv = (() => { try { return fs.readFileSync(argvLog, 'utf8'); } catch { return ''; } })();
    ok(cr.code === 0 && cArgv.split('\n').filter((l) => l.includes(pair.dialToken)).length === 2, 'CONTROL (n): with r2\'s children the dial check and the dial.json writer carry the dial token in their argv — the B-inst argv legs go red', cArgv.split('\n').map((l) => l.replace(/-e \S.{0,40}/, '-e …').slice(0, 160)));
    for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(x.pass, x.name, x.detail);
    try { process.kill(lockPid(), 'SIGTERM'); } catch { }
  }
}

// ── lane mac-repair-retires-stale (B-06e9, the owner's Macbook 2026-10-18: FOUR installs, one per hub address ever paired,
// three re-dialing with old tokens every 30 s for ever): A RE-PAIR RETIRES THE OLDER INSTALLS OF THE SAME HUB — after the
// new one dialed in, never before. A scratch HOME with five sibling roots beside the one being installed:
//   A device@192.0.2.10     same hub (dial.json `hub`), a LaunchAgent plist, a running fake agent (argv names vibespace-device)
//   B device@198.51.100.7   same hub, a systemd user unit, a running fake agent
//   C device@192.0.2.20     same hub, a plist, its lock naming an INNOCENT process (a recycled pid: `sleep`)
//   D device@203.0.113.5    ANOTHER hub, a plist, a running fake agent
//   E device@old.invalid    hub UNKNOWN (a pre-change dial.json {url, token}), a plist, a running fake agent
// stub launchctl / systemctl record every call (ms-stamped) — nothing on this machine is registered or stopped for real ──
console.log('a re-pair retires the older installs of the SAME hub, after the new one dialed in (lane mac-repair-retires-stale)');
{
  await waitFor(() => !DP.agentdDials.has('icdev'), 10000);
  const HUB = DP.hubId();
  ok(/^vh-[0-9a-f]{16}$/.test(HUB) && fs.readFileSync(path.join(dataDir, 'agentd', 'hub-id'), 'utf8').trim() === HUB && (fs.statSync(path.join(dataDir, 'agentd', 'hub-id')).mode & 0o777) === 0o600, 'the hub mints its id ONCE (data/agentd/hub-id, 0600, `vh-` + 16 hex)', HUB);
  const r0 = await dialCheck(DIAL, pair.dialToken);
  ok(r0.code === 0 && r0.out.split('\n').includes(`hub id: ${HUB}`), 'the probe\'s answer names the hub: --dial-check prints `hub id: vh-…` under its ok line', r0.out);
  const OTHER_HUB = 'vh-' + (HUB.slice(3) === 'f'.repeat(16) ? 'e' : 'f').repeat(16);
  const stampStub = (dir, mode) => {
    fs.mkdirSync(dir, { recursive: true });
    const log = path.join(dir, 'calls.log');
    for (const name of ['launchctl', 'systemctl']) fs.writeFileSync(path.join(dir, name), `#!/bin/sh\necho "$(date +%s%3N) ${name} $*" >> ${JSON.stringify(log)}\n${name === 'systemctl' && mode === 'absent' ? 'case "$*" in *show-environment*) exit 1;; esac\n' : ''}exit 0\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'loginctl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    return { log, calls: () => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const i = l.indexOf(' '); return { at: Number(l.slice(0, i)), line: l.slice(i + 1) }; }); } catch { return []; } } };
  };
  const agentArgv = ['-e', 'setInterval(() => {}, 1e6)', 'vibespace-device'];
  const fakeAgent = () => { const c = spawn(process.execPath, agentArgv, { stdio: 'ignore', detached: true }); c.unref(); pids.push(c.pid); return c.pid; };
  const innocent = () => { const c = spawn('sleep', ['600'], { stdio: 'ignore', detached: true }); c.unref(); pids.push(c.pid); return c.pid; };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const SIB = { A: 'device@192.0.2.10', B: 'device@198.51.100.7', C: 'device@192.0.2.20', D: 'device@203.0.113.5', E: 'device@old.invalid' };
  const keyOf = (n) => n.replace(/[^A-Za-z0-9.-]/g, '-');
  const world = (tag) => {
    const h = path.join(S, `home-${tag}`), vs = path.join(h, '.vibespace');
    const sibs = {};
    for (const [k, n] of Object.entries(SIB)) {
      const st = path.join(vs, n, 'state'); fs.mkdirSync(st, { recursive: true, mode: 0o700 });
      const dial = { url: `ws://${n.slice(7)}:3456/api/device-dial?device=icdev`, token: 'vsdt_' + k.toLowerCase().repeat(43) };
      if (k === 'A' || k === 'B' || k === 'C') dial.hub = HUB; else if (k === 'D') dial.hub = OTHER_HUB;
      fs.writeFileSync(path.join(st, 'dial.json'), JSON.stringify(dial), { mode: 0o600 });
      const pid = k === 'C' ? innocent() : fakeAgent();
      fs.writeFileSync(path.join(st, 'agentd.lock'), String(pid));
      let item;
      if (k === 'B') { item = path.join(h, '.config', 'systemd', 'user', `vibespace-device-${keyOf(n)}.service`); }
      else item = path.join(h, 'Library', 'LaunchAgents', `cc.vibespace.device.${keyOf(n)}.plist`);
      fs.mkdirSync(path.dirname(item), { recursive: true }); fs.writeFileSync(item, `<!-- ${n} -->\n`);
      sibs[k] = { name: n, pid, item, dial };
    }
    const root = path.join(vs, 'device@127.0.0.1'); fs.mkdirSync(root, { recursive: true });
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules')); } catch { } // pty_ok passes — no npm
    return { h, vs, root, sibs, stub: stampStub(path.join(S, `stub-${tag}`), 'absent') };
  };
  const installIn = (w, script = path.join(REPO, 'scripts/vibespace-agentd-install.sh'), extra = []) => run(['bash', script, '--bundle-url', `${BASE}/vibespace-device.js`, '--node', process.execPath, '--dial', DIAL, ...extra],
    { env: { HOME: w.h, PATH: `${path.dirname(w.stub.log)}:${process.env.PATH}`, XDG_RUNTIME_DIR: '', DBUS_SESSION_BUS_ADDRESS: '', VIBESPACE_DEVICE_ROOT: '', VIBESPACE_AGENTD_ROOT: '', VIBESPACE_DIAL_TOKEN: pair.dialToken, VIBESPACE_HOST_TOKEN: HOST_TOKEN } });
  const rootLock = (w) => { try { return Number(fs.readFileSync(path.join(w.root, 'state', 'agentd.lock'), 'utf8').trim()); } catch { return 0; } };
  const stopRoot = async (w) => { const p = rootLock(w); if (p) { pids.push(p); try { process.kill(p, 'SIGTERM'); } catch { } } await waitFor(() => !DP.agentdDials.has('icdev'), 10000); };
  const dis = (w) => path.join(w.vs, 'disabled-launchagents');

  // ① the re-pair
  const w = world('retire');
  const r = await installIn(w);
  const calls = w.stub.calls();
  const st = (() => { try { return JSON.parse(fs.readFileSync(path.join(w.root, 'state', 'dial-status.json'), 'utf8')); } catch { return {}; } })();
  ok(r.code === 0 && /✓ vibespace device agent running/.test(r.out), 'R-1: the install completes (the dial check, the daemon up)', r.out.slice(-900));
  console.log('    · the install said:\n' + r.out.split('\n').filter((l) => /^(→ (retired|older installs|kept)|    device@)/.test(l)).map((l) => '      ' + l).join('\n'));
  ok(JSON.parse(fs.readFileSync(path.join(w.root, 'state', 'dial.json'), 'utf8')).hub === HUB, 'R-2: the new install\'s dial.json carries the hub id the check learned');
  const retiredLine = `→ retired 3 older installs of this hub: ${SIB.A}, ${SIB.C}, ${SIB.B} (kept under ~/.vibespace; their launch items moved to ~/.vibespace/disabled-launchagents/)`;
  ok(r.out.split('\n').includes(retiredLine) && r.out.indexOf(retiredLine) > r.out.indexOf('✓ vibespace device agent running'), 'R-3: the install SAYS it: «→ retired 3 older installs of this hub: <the dirs> (kept under ~/.vibespace; their launch items moved to …/disabled-launchagents/)» — after the daemon is up', r.out.slice(-900));
  ok(!fs.existsSync(w.sibs.A.item) && fs.readFileSync(path.join(dis(w), path.basename(w.sibs.A.item)), 'utf8').includes(SIB.A) && !fs.existsSync(w.sibs.C.item) && fs.existsSync(path.join(dis(w), path.basename(w.sibs.C.item))) && !fs.existsSync(w.sibs.B.item) && fs.readFileSync(path.join(dis(w), path.basename(w.sibs.B.item)), 'utf8').includes(SIB.B), 'R-4: the same-hub siblings\' launch items (two plists, one systemd unit) MOVED to ~/.vibespace/disabled-launchagents/ — not deleted', fs.existsSync(dis(w)) ? fs.readdirSync(dis(w)) : null);
  ok(['A', 'B', 'C'].every((k) => fs.existsSync(path.join(w.vs, SIB[k], 'state', 'dial.json'))), 'R-5: their roots and state stay on disk (nothing is lost)');
  const bootA = calls.find((c) => c.line === `launchctl bootout gui/${process.getuid()}/cc.vibespace.device.${keyOf(SIB.A)}`), bootC = calls.find((c) => c.line === `launchctl bootout gui/${process.getuid()}/cc.vibespace.device.${keyOf(SIB.C)}`);
  const disB = calls.find((c) => c.line === `systemctl --user disable --now vibespace-device-${keyOf(SIB.B)}.service`);
  ok(bootA && bootC && disB, 'R-6: the supervisors were stopped first — launchctl bootout gui/<uid>/cc.vibespace.device.<key> (A, C), systemctl --user disable --now vibespace-device-<key>.service (B), recorded by the stubs', calls.map((c) => c.line));
  ok(bootA && Number(st.connectedAt) > 0 && bootA.at >= Number(st.connectedAt), 'R-7: NEVER BEFORE the new install was live — the first retire call comes after the new daemon\'s own record says connected', { connectedAt: st.connectedAt, bootout: bootA && bootA.at });
  const gone = await waitFor(() => !alive(w.sibs.A.pid) && !alive(w.sibs.B.pid), 10000);
  ok(!!gone && alive(w.sibs.C.pid), 'R-8: the detached agents holding A\'s and B\'s locks (argv names vibespace-device) were stopped; C\'s lock named an innocent process (a recycled pid) — it is NOT killed', { A: alive(w.sibs.A.pid), B: alive(w.sibs.B.pid), C: alive(w.sibs.C.pid) });
  ok(fs.existsSync(w.sibs.D.item) && alive(w.sibs.D.pid) && !calls.some((c) => c.line.includes(keyOf(SIB.D))) && r.out.includes(`→ kept: ${SIB.D} (another VibeSpace's install on this machine)`), 'R-9: ANOTHER hub\'s install is untouched — its plist in place, its agent running, no call names it; the output says it is kept');
  const unknownLine = `    ${SIB.E} — stop it with: launchctl bootout gui/$(id -u)/cc.vibespace.device.${keyOf(SIB.E)}; kill $(cat ~/.vibespace/${SIB.E}/state/agentd.lock)`;
  ok(fs.existsSync(w.sibs.E.item) && alive(w.sibs.E.pid) && !calls.some((c) => c.line.includes(keyOf(SIB.E))) && r.out.includes('→ older installs I cannot attribute, not touched:\n' + unknownLine + '\n'), 'R-10: an install whose hub is UNKNOWN (pre-change) is not touched — LISTED with its exact stop command', r.out.slice(-700));
  ok(DP.agentdDials.has('icdev') && fs.existsSync(path.join(w.root, 'state', 'dial.json')), 'R-11: the new install stays dialed in');

  // ② the daemon learns its hub at its first ACCEPTED dial (an older install learns it when it next dials in): the new root's
  // dial.json without `hub`, the daemon restarted, the hub's own device client says hello (src/agentd/client.js, `hub`)
  const learn = async (script) => {
    await stopRoot(w);
    const dj = path.join(w.root, 'state', 'dial.json'); const cfg = JSON.parse(fs.readFileSync(dj, 'utf8')); delete cfg.hub;
    fs.writeFileSync(dj, JSON.stringify(cfg), { mode: 0o600 });
    const d = spawn(process.execPath, [script], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: w.h, VIBESPACE_DEVICE_ROOT: w.root, VIBESPACE_AGENTD_ROOT: w.root } }); d.unref(); pids.push(d.pid);
    const up = await waitFor(() => DP.agentdDials.has('icdev'), 20000);
    let dm = null; try { dm = await DP.deviceForDial('icdev'); } catch (e) { dm = { error: e.message }; }
    const hub = await waitFor(() => { try { return JSON.parse(fs.readFileSync(dj, 'utf8')).hub || null; } catch { return null; } }, 6000, 200);
    try { dm && dm.stop && dm.stop(); } catch { }
    try { process.kill(d.pid, 'SIGTERM'); } catch { }
    await waitFor(() => !DP.agentdDials.has('icdev'), 10000);
    return { up: !!up, hello: !!(dm && !dm.error), hub, cfg: JSON.parse(fs.readFileSync(dj, 'utf8')) };
  };
  const L1 = await learn(bundle);
  ok(L1.up && L1.hello && L1.hub === HUB && L1.cfg.url === DIAL && L1.cfg.token === pair.dialToken, 'R-12: an install that never learned its hub learns it at its next ACCEPTED dial — the hello (the host token proved the hub) names it, and dial.json keeps url + token beside it', L1);
  {
    const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
    const M = mutantCopies('installlearn', REPO);
    const asrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
    const deaf = asrc.replace("serveConnection(ws, { dialed: true, onAuthed: (m) => learnHub(m && m.hub, via) });", 'serveConnection(ws, { dialed: true });');
    ok(deaf !== asrc, '(p) the patch applies');
    const L2 = await learn(M.write('src/agentd/agentd.js', deaf, 'nolearn'));
    ok(L2.up && L2.hello && L2.hub === null, 'CONTROL (p): a daemon that does not keep the hello\'s hub never learns it — R-12 goes red', L2);
    for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(x.pass, x.name, x.detail);
  }

  // ③ RED CONTROL: the installer without the retire step (the base) — the same five siblings, nothing retired
  {
    const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
    const M = mutantCopies('installretire', REPO);
    const isrc = fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.sh'), 'utf8');
    const base = isrc.replace(/\nretire_siblings\n$/, '\n:\n');
    ok(base !== isrc, '(q) the patch applies');
    const copy = path.join(M.dir, 'vibespace-agentd-install-noretire.sh'); fs.writeFileSync(copy, base, { mode: 0o755 }); M.files.push(copy);
    const wq = world('noretire');
    const rq = await installIn(wq, copy);
    const qcalls = wq.stub.calls();
    ok(rq.code === 0 && !/retired/.test(rq.out) && Object.values(wq.sibs).every((x) => fs.existsSync(x.item) && alive(x.pid)) && !qcalls.some((c) => /bootout|disable --now/.test(c.line)), 'CONTROL (q): the installer without the retire step (the base) leaves all five siblings as they were — every launch item in place, every agent running: the older installs of this hub keep re-dialing (R-3…R-8 red)', { out: rq.out.slice(-300), calls: qcalls.map((c) => c.line) });
    await stopRoot(wq);
    for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(x.pass, x.name, x.detail);
  }

  // ④ never before the new install is live: the hub refuses the new daemon's LINK (the check still passes) ⇒ nothing retired
  {
    const wn = world('notlive');
    refuseLinks = true;
    const rn = await installIn(wn);
    refuseLinks = false;
    const ncalls = wn.stub.calls();
    ok(rn.code === 0 && rn.out.includes('→ older installs on this machine were NOT retired: this install has not dialed in yet — run this command again once its row reads connected') && Object.values(wn.sibs).every((x) => fs.existsSync(x.item)) && alive(wn.sibs.A.pid) && alive(wn.sibs.B.pid) && !ncalls.some((c) => /bootout|disable --now/.test(c.line)), 'R-13: a new install that has NOT dialed in retires nothing — it says so, every sibling stays', { out: rn.out.slice(-400), calls: ncalls.map((c) => c.line) });
    await stopRoot(wn);
  }

  // ⑤ the rule itself (the installer's own classifier, run by node over scratch roots): hub equal ⇒ retire, hub different ⇒
  // other, a hub on one side only ⇒ unknown; no hub on EITHER side ⇒ the same device id retires, another one is unknown
  {
    const isrc = fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.sh'), 'utf8');
    const m = /\nsiblings_of\(\) \{[^\n]*\n  "\$NODE_BIN" -e '([^']+)' \\\n/.exec(isrc);
    ok(!!m, 'the classifier is found in the installer');
    const T = [
      [{ hub: HUB, dev: 'icdev' }, { hub: HUB, dev: 'other' }, 'retire'], [{ hub: HUB, dev: 'icdev' }, { hub: OTHER_HUB, dev: 'icdev' }, 'other'],
      [{ hub: HUB, dev: 'icdev' }, { hub: '', dev: 'icdev' }, 'unknown'], [{ hub: '', dev: 'icdev' }, { hub: HUB, dev: 'icdev' }, 'unknown'],
      [{ hub: '', dev: 'icdev' }, { hub: '', dev: 'icdev' }, 'retire'], [{ hub: '', dev: 'icdev' }, { hub: '', dev: 'macbook' }, 'unknown'],
      [{ hub: HUB, dev: 'icdev' }, { hub: 'vh-not-an-id', dev: 'icdev' }, 'unknown'],
    ];
    const got = T.map(([me, them], i) => {
      const b = path.join(S, `rule-${i}`);
      for (const [n, x] of [['device@me.invalid', me], ['device@them.invalid', them]]) { fs.mkdirSync(path.join(b, n, 'state'), { recursive: true }); fs.writeFileSync(path.join(b, n, 'state', 'dial.json'), JSON.stringify({ url: `ws://${n.slice(7)}/api/device-dial?device=${x.dev}`, token: 't', ...(x.hub ? { hub: x.hub } : {}) })); }
      fs.mkdirSync(path.join(b, 'agentd')); fs.mkdirSync(path.join(b, 'disabled-launchagents'));
      return execFileSync(process.execPath, ['-e', m ? m[1] : '', b, 'device@me.invalid'], { encoding: 'utf8' }).trim();
    });
    ok(got.every((g, i) => g === `${T[i][2]}\tdevice@them.invalid`), 'R-14: the rule table — same hub ⇒ retire · another hub ⇒ other · a hub on one side only ⇒ unknown · no hub on either side: same device id ⇒ retire, another ⇒ unknown · a malformed hub ⇒ unknown (never agentd/ nor disabled-launchagents/)', got);
  }

  // ⑥ the Windows twin (no PowerShell on this box — the road is pinned, the real Windows leg is an owner-run recipe)
  {
    const ps = fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.ps1'), 'utf8');
    const iRet = ps.indexOf('# RETIRE THE OLDER INSTALLS OF THIS HUB'), iOk = ps.indexOf('Write-Host "OK vibespace device agent running');
    const verdict = "$verdict = if ($them.hub -and $me.hub) { if ($them.hub -eq $me.hub) { 'retire' } else { 'other' } } elseif (-not $them.hub -and -not $me.hub -and $them.dev -and $them.dev -eq $me.dev) { 'retire' } else { 'unknown' }";
    const iExp = ps.indexOf('Export-ScheduledTask -TaskName $tn'), iUnreg = ps.indexOf('Unregister-ScheduledTask -TaskName $tn -Confirm:$false'), iGuard = ps.indexOf("if ($cl -like '*vibespace-device*') { Stop-Process -Id $sp -Force");
    ok(iRet > iOk && ps.includes(verdict) && iExp > 0 && iUnreg > iExp && iGuard > iUnreg && ps.includes("if (-not $NoCheck) {\n  $vsDir") && ps.includes("while ($i -lt 20 -and -not (Test-VsDialedIn))") && /\$dialCfg = @\{ url = \$Dial; token = \$DialToken \}; if \(\$hubId\) \{ \$dialCfg\.hub = \$hubId \}/.test(ps) && ps.includes("if (\"$l\" -match '^hub id: (vh-[0-9a-f]{16})$') { $hubId = $Matches[1]; break }"), 'R-15: install.ps1 — the hub id from the check into dial.json, the SAME rule, after the daemon dialed in, the task exported to disabled-launchagents\\ BEFORE it is unregistered, the agent stopped only when its command line names vibespace-device');
    const bal = (() => { let d = { '{': 0, '(': 0 }, q = null; for (const line of ps.split('\n')) { if (/^\s*#/.test(line)) continue; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '`') { i++; continue; } if (ch === q) q = null; continue; } if (ch === '#') break; if (ch === "'" || ch === '"') { q = ch; continue; } if (ch === '`') { i++; continue; } if (ch === '{') d['{']++; if (ch === '}') d['{']--; if (ch === '(') d['(']++; if (ch === ')') d['(']--; if (d['{'] < 0 || d['('] < 0) return { line, d }; } if (q === "'") continue; } return d; })();
    ok(bal['{'] === 0 && bal['('] === 0, 'R-16: install.ps1 balances its braces and parentheses outside strings and comments (a structural check — no PowerShell parser here)', bal);
  }
  await stopRoot(w);
}

srv.close(); plain.close();
for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
