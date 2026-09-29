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
srv.on('upgrade', (req, socket, head) => {
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
      .replace('token:process.env.VIBESPACE_DIAL_TOKEN||""}),{mode:0o600});fs.renameSync(t,f)\' \\\n    "$ROOT/state/dial.json" "$DIAL_URL"', 'token:process.argv[3]}),{mode:0o600});fs.renameSync(t,f)\' \\\n    "$ROOT/state/dial.json" "$DIAL_URL" "$DIAL_TOKEN"');
    ok(r2 !== isrc && r2.split('--dial-token "$DIAL_TOKEN"').length === 2 && r2.includes('"$DIAL_URL" "$DIAL_TOKEN"'), '(n) the patch applies (both children back to r2)');
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

srv.close(); plain.close();
for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
