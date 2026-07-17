#!/usr/bin/env node
// On-demand EGRESS through a device (task #164): the daemon serves a SOCKS5
// proxy on its loopback, the server reaches it via tcpForward, and a real
// SOCKS5 client (curl-equivalent handshake) tunnels a TCP connection to an
// arbitrary "internet" host THROUGH the device. Proves the exit path end to
// end against a REAL daemon. Run: node scripts/test-agentd-socks.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-socks-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_NODE_MODULES = path.join(repo, 'node_modules');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
await dm.connect();

// an "internet" origin the device will reach through its own network (here:
// loopback, but the daemon connects to it as an arbitrary CONNECT target)
let origin, ORIGIN_PORT;
try {
  origin = http.createServer((q, s) => { s.writeHead(200, { 'X-Seen-Host': q.headers.host || '' }); s.end('EGRESS_OK:' + q.url); });
  ORIGIN_PORT = await new Promise((r) => origin.listen(0, '127.0.0.1', function () { r(this.address().port); }));

  // 1) device serves a SOCKS5 proxy on ITS loopback
  const { port: devSocksPort } = await dm.serveSocks();
  check('daemon serve-socks returns a device port', devSocksPort > 0, String(devSocksPort));

  // 2) bring it to the "server" loopback the port-forward way: a local server
  //    piping each conn into dm.tcpForward(devSocksPort)
  const sockets = new Set();
  const relay = net.createServer({ allowHalfOpen: true }, async (sock) => {
    sockets.add(sock); sock.on('close', () => sockets.delete(sock)); sock.on('error', () => { try { sock.destroy(); } catch {} });
    let h; try { h = await dm.tcpForward(devSocksPort); } catch { try { sock.destroy(); } catch {} return; }
    if (sock.destroyed) { try { h.close(); } catch {} return; }
    h.onData = (b) => { try { sock.write(b); } catch {} };
    h.onClose = () => { try { sock.end(); } catch {} };
    sock.on('data', (b) => { try { h.write(b); } catch {} });
    sock.on('close', () => { try { h.close(); } catch {} });
  });
  const localSocks = await new Promise((r) => relay.listen(0, '127.0.0.1', function () { r(this.address().port); }));
  check('SOCKS reachable on the server loopback via tcpForward', localSocks > 0);

  // 3) a minimal SOCKS5 client: CONNECT to 127.0.0.1:ORIGIN_PORT THROUGH the
  //    tunnel, then speak HTTP — the request egresses via the DEVICE.
  const socksHttpGet = (targetHost, targetPort, pathUrl, useDomain) => new Promise((resolve, reject) => {
    const c = net.connect(localSocks, '127.0.0.1');
    let stage = 0, acc = Buffer.alloc(0);
    const to = setTimeout(() => { try { c.destroy(); } catch {} reject(new Error('timeout')); }, 8000);
    c.on('connect', () => c.write(Buffer.from([0x05, 0x01, 0x00]))); // greeting: 1 method, no-auth
    c.on('data', (d) => {
      acc = Buffer.concat([acc, d]);
      if (stage === 0) {
        if (acc.length < 2) return;
        if (!(acc[0] === 0x05 && acc[1] === 0x00)) { clearTimeout(to); return reject(new Error('no-auth rejected: ' + acc.toString('hex'))); }
        acc = acc.subarray(2); stage = 1;
        // CONNECT request
        let req;
        if (useDomain) {
          const hb = Buffer.from(targetHost, 'utf8');
          req = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hb.length]), hb, Buffer.from([targetPort >> 8, targetPort & 0xff])]);
        } else {
          const ip = targetHost.split('.').map(Number);
          req = Buffer.from([0x05, 0x01, 0x00, 0x01, ...ip, targetPort >> 8, targetPort & 0xff]);
        }
        c.write(req);
      }
      if (stage === 1) {
        if (acc.length < 10) return; // reply header (ipv4 bind = 10 bytes)
        if (acc[1] !== 0x00) { clearTimeout(to); return reject(new Error('SOCKS reply code ' + acc[1])); }
        acc = acc.subarray(10); stage = 2;
        c.write(`GET ${pathUrl} HTTP/1.0\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`);
      }
      if (stage === 2) { /* accumulate HTTP response in acc after header strip */ }
    });
    c.on('close', () => { clearTimeout(to); resolve(acc.toString('utf8')); });
    c.on('error', (e) => { clearTimeout(to); reject(e); });
  });

  const respIp = await socksHttpGet('127.0.0.1', ORIGIN_PORT, '/hi', false);
  check('IPv4 CONNECT egresses to the origin through the device', respIp.includes('EGRESS_OK:/hi'), JSON.stringify(respIp.slice(0, 80)));

  const respDom = await socksHttpGet('localhost', ORIGIN_PORT, '/dom', true);
  check('domain CONNECT (socks5h — DNS resolves on the device) works', respDom.includes('EGRESS_OK:/dom'), JSON.stringify(respDom.slice(0, 80)));

  // 4) a CONNECT to a dead port must get a SOCKS failure reply, not a hang
  const deadPort = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', function () { const p = this.address().port; s.close(() => r(p)); }); });
  let refused = '';
  try { await socksHttpGet('127.0.0.1', deadPort, '/x', false); } catch (e) { refused = e.message; }
  check('CONNECT to a dead port returns a SOCKS failure (no hang)', /reply code/.test(refused), refused);

  // 5) unserve-socks stops the device server
  const un = await dm.unserveSocks(devSocksPort);
  check('unserve-socks closes the device SOCKS server', un && un.closed === true, JSON.stringify(un));

  for (const s of sockets) { try { s.destroy(); } catch {} }
  relay.close();
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  try { origin?.close(); } catch {}
  dm.stop();
  try { const pid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(pid, 'SIGTERM'); } catch {}
  await sleep(200);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nagentd SOCKS egress test passed');
process.exit(failed ? 1 : 0);
