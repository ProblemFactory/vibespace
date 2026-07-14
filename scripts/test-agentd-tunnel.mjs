#!/usr/bin/env node
// REVERSE-FORWARD (tunnel) acceptance (2.148.0, "互挂云盘去公网化"): the daemon
// binds 127.0.0.1:<port> ON THE DEVICE and pushes every accepted connection
// back over the mux to a local target we choose — the NAT-traversal primitive
// that makes reverse-mount ride the device link instead of a public/Tailscale
// address. Verifies against a REAL daemon (localhost device #0):
//   T1  reverseForward binds a device-side port; a client connecting to it
//       round-trips bytes to our local target (an HTTP-ish echo)
//   T2  BIDIRECTIONAL + multibyte byte-exact over several frames
//   T3  a real HTTP request through the tunnel (the /dav shape) returns the
//       body our local server produced — proving WebDAV can ride it
//   T4  link drop → the device KEEPS the port bound; reconnect re-owns it with
//       the SAME port and a NEW connection still works (mount-heals-in-place)
//   T5  concurrency: a 2MB flood on one tunnel conn doesn't starve a second
//   T6  reverseUnforward frees the device port (connect refused after)
// Run: node scripts/test-agentd-tunnel.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tun-'));
const AGENTD_ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_AGENTD_ROOT = AGENTD_ROOT;
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
dm._ensureLocalToken();
const daemon = spawn(process.execPath, [path.join(AGENTD_ROOT, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: { ...process.env } });
daemon.unref();
await sleep(700);
await dm.connect();

// our LOCAL target: an echo TCP server (stands in for VibeSpace's /dav port)
const localEcho = net.createServer((s) => { s.on('data', (d) => { try { s.write(Buffer.concat([Buffer.from('R:'), d])); } catch {} }); });
await new Promise((r) => localEcho.listen(0, '127.0.0.1', r));
const localPort = localEcho.address().port;

console.log('— T1 reverseForward: device-side listen → local target round-trip —');
let devPort;
{
  const { port } = await dm.reverseForward({ port: 0, connectLocal: () => net.connect(localPort, '127.0.0.1') });
  devPort = port;
  check('daemon bound a 127.0.0.1 port on the device', port > 0, String(port));
  const c = net.connect(devPort, '127.0.0.1');
  let got = '';
  c.on('data', (d) => { got += d; });
  await new Promise((r) => c.on('connect', r));
  c.write('ping-through-tunnel');
  await sleep(400);
  check('bytes reach our local target and return', got === 'R:ping-through-tunnel', JSON.stringify(got));
  console.log('— T2 bidirectional + multibyte byte-exact across frames —');
  got = '';
  c.write('多字节🎯一'); await sleep(120);
  c.write('多字节🎯二'); await sleep(120);
  c.write(Buffer.from([0x00, 0xff, 0x10, 0x80])); await sleep(300);
  check('multibyte + raw bytes splice byte-exact', got === 'R:多字节🎯一R:多字节🎯二R:' + Buffer.from([0x00, 0xff, 0x10, 0x80]).toString(), JSON.stringify(got.slice(0, 60)));
  c.destroy();
}

console.log('— T3 a real HTTP request through the tunnel (the /dav shape) —');
{
  const httpSrv = http.createServer((req, res) => { res.writeHead(207, { 'Content-Type': 'application/xml' }); res.end('<multistatus>' + req.method + ' ' + req.url + '</multistatus>'); });
  await new Promise((r) => httpSrv.listen(0, '127.0.0.1', r));
  const httpPort = httpSrv.address().port;
  const { port } = await dm.reverseForward({ port: 0, connectLocal: () => net.connect(httpPort, '127.0.0.1') });
  const body = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'PROPFIND', path: '/dav/x' }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ status: res.statusCode, b }));
    });
    req.on('error', reject); req.end();
  });
  check('WebDAV PROPFIND rode the tunnel (207 + body)', body.status === 207 && body.b.includes('PROPFIND /dav/x'), JSON.stringify(body));
  await dm.reverseUnforward(port);
  httpSrv.close();
}

console.log('— T4 link drop: port stays bound, reconnect re-owns it in place —');
{
  // kill the daemon connection at the mux level (simulates the ssh/wss link
  // dying) — the DEVICE listener must survive and the reconnect re-own it
  dm._conn.mux.destroy();
  await sleep(200);
  check('connection dropped', !dm._conn, '');
  await dm.connect(); // reconnect + auto re-register (self-heal loop)
  await sleep(500);
  const c = net.connect(devPort, '127.0.0.1');
  let got = '';
  c.on('data', (d) => { got += d; });
  const ok = await new Promise((r) => { c.on('connect', () => r(true)); c.on('error', () => r(false)); });
  check('device port SURVIVED the drop (still accepts)', ok, '');
  c.write('after-reconnect');
  await sleep(500);
  check('re-owned tunnel round-trips to the local target', got === 'R:after-reconnect', JSON.stringify(got));
  c.destroy();
}

console.log('— T5 concurrency: a 2MB flood does not starve a small conn —');
{
  const big = net.connect(devPort, '127.0.0.1');
  await new Promise((r) => big.on('connect', r));
  let bigBack = 0;
  big.on('data', (d) => { bigBack += d.length; });
  const payload = Buffer.alloc(2 * 1024 * 1024, 0x41);
  big.write(payload);
  // meanwhile a small conn must complete promptly
  const t0 = Date.now();
  const small = net.connect(devPort, '127.0.0.1');
  let smallGot = '';
  small.on('data', (d) => { smallGot += d; });
  await new Promise((r) => small.on('connect', r));
  small.write('small-while-flooded');
  for (let i = 0; i < 40 && !smallGot; i++) await sleep(50);
  const smallMs = Date.now() - t0;
  check('small conn completes during the flood', smallGot === 'R:small-while-flooded', JSON.stringify(smallGot));
  check('small conn was not starved (<3s)', smallMs < 3000, smallMs + 'ms');
  // let the flood finish (echo prefixes "R:" per data event, so the exact
  // byte count is chunk-dependent — assert all payload bytes came back)
  for (let i = 0; i < 80 && bigBack < payload.length; i++) await sleep(100);
  check('2MB flood echoed back in full', bigBack >= payload.length, '' + bigBack);
  big.destroy(); small.destroy();
}

console.log('— T6 reverseUnforward frees the device port —');
{
  await dm.reverseUnforward(devPort);
  await sleep(300);
  const refused = await new Promise((r) => { const c = net.connect(devPort, '127.0.0.1'); c.on('connect', () => { c.destroy(); r(false); }); c.on('error', () => r(true)); });
  check('device port refused after unforward', refused, '');
}

try { const dpid = Number(fs.readFileSync(path.join(AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
dm.stop();
localEcho.close();
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall tunnel (reverse-forward) tests passed');
process.exit(0);
