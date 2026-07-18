#!/usr/bin/env node
// Unit test for PortForwardManager (B-0b60 tunnel path): detect() parsing +
// end-to-end piping through a MOCK device (tcpForward → a real loopback echo
// server standing in for the device's service). No daemon/ssh needed.
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PortForwardManager } = require('../src/port-forward.js');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n      ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pf-'));

// ── a "device service": an echo server on some loopback port ──
const SERVICE_PORT = await new Promise((res) => {
  const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('echo:'), d]))));
  s.listen(0, '127.0.0.1', () => res(s.address().port));
});

// ── a mock DeviceManager: tcpForward(port) connects to the loopback service;
//    runCmd returns canned ss/lsof output for detect() ──
let ssMode = 'ss';
const mockDm = {
  async runCmd(cmd, args) {
    const out = ssMode === 'ss'
      ? 'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=42,fd=20))\n'
        + 'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))\n'
        + 'LISTEN 0 4096 [::1]:8080 [::]:* users:(("python3",pid=99,fd=5))\n'
      : 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n'
        + 'node   42 me  20u IPv4 123 0t0 TCP 127.0.0.1:5173 (LISTEN)\n'
        + 'Python 99 me  5u  IPv6 456 0t0 TCP [::1]:8080 (LISTEN)\n';
    return { code: 0, stdout: out, stderr: '' };
  },
  async tcpForward(port, host) {
    (mockDm._calls = mockDm._calls || []).push({ port, host: host || null }); // all calls (background probes clobber a single-slot capture)
    const sock = net.connect(port, '127.0.0.1');
    const handle = { onData: null, onClose: null, write: (b) => sock.write(b), close: () => sock.destroy() };
    sock.on('data', (b) => handle.onData?.(b));
    sock.on('close', () => handle.onClose?.());
    sock.on('error', () => handle.onClose?.());
    return handle;
  },
};
let deviceThrows = false;
const hosts = { async device() { if (deviceThrows) throw new Error('device "x" is offline'); return mockDm; }, list: () => [{ id: 'h1', name: 'mock-mac', transport: 'dial' }] };

const events = [];
const pf = new PortForwardManager({ hosts, dataDir, broadcast: (m) => events.push(m), log: () => {} });

try {
  // ── machine #0 (this instance): detect + record-only forward ──
  {
    const lp = await pf.detect('__local__');
    check('detectLocal sees the real test listener', lp.some((p) => p.port === SERVICE_PORT), JSON.stringify(lp.slice(0, 6)));
    const lf = await pf.forward('__local__', SERVICE_PORT, { label: 'local test' });
    check('local forward is active with a direct URL (no tunnel)', lf.active && lf.localPort === SERVICE_PORT && lf.url === `http://127.0.0.1:${SERVICE_PORT}/`, JSON.stringify(lf));
    await pf.unforward(lf.id);
    check('local forward removed', !pf.list().some((r) => r.hostId === '__local__'), '');
  }

  // ── vscode-style NEW-port watch: baseline silent, diff notifies ──
  const runCmd0 = mockDm.runCmd; // restore after the watch scenario (detect tests below flip ssMode)
  ssMode = 'ss';
  events.length = 0;
  await pf._watchSweep();
  check('watch baseline sweep is silent', !events.some((e) => e.type === 'machine-ports-new'), JSON.stringify(events));
  ssMode = 'ss2'; // adds a port
  mockDm.runCmd = async () => ({ code: 0, stdout:
    'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=42,fd=20))\n'
    + 'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))\n'
    + 'LISTEN 0 4096 [::1]:8080 [::]:* users:(("python3",pid=99,fd=5))\n'
    + 'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=77,fd=21))\n'
    + 'LISTEN 0 511 127.0.0.1:49999 0.0.0.0:* users:(("chrome",pid=88,fd=9))\n', stderr: '' });
  await pf._watchSweep();
  const evNew = events.find((e) => e.type === 'machine-ports-new');
  check('watch notifies the NEW port with host name + proc', !!evNew && evNew.hostName === 'mock-mac' && evNew.ports.some((p) => p.port === 3000 && p.proc === 'node'), JSON.stringify(evNew));
  check('watch ignores ephemeral ports (>32767)', !evNew.ports.some((p) => p.port === 49999), JSON.stringify(evNew));
  check('watch does not re-announce baseline ports', !evNew.ports.some((p) => p.port === 5173 || p.port === 22 || p.port === 8080), JSON.stringify(evNew));
  events.length = 0;
  await pf._watchSweep();
  check('unchanged sweep stays silent', !events.some((e) => e.type === 'machine-ports-new'), JSON.stringify(events));
  mockDm.runCmd = runCmd0; // the detect tests below drive ssMode themselves
  ssMode = 'ss';

  // ── detect() parses both ss and lsof ──
  ssMode = 'ss';
  let ports = await pf.detect('h1');
  check('detect (ss) finds all listening ports', ports.some((p) => p.port === 5173 && p.proc === 'node') && ports.some((p) => p.port === 22) && ports.some((p) => p.port === 8080), JSON.stringify(ports));
  ssMode = 'lsof';
  ports = await pf.detect('h1');
  check('detect (lsof) parses BSD/macOS output', ports.some((p) => p.port === 5173 && p.proc === 'node') && ports.some((p) => p.port === 8080), JSON.stringify(ports));

  // ── forward() binds a local port that reaches the device service ──
  const f = await pf.forward('h1', SERVICE_PORT, { label: 'dev server' });
  check('forward returns an active record with a local URL', f.active && f.localPort > 0 && f.url.includes(String(f.localPort)), JSON.stringify(f));
  check('forward broadcasts port-forwards-updated', events.some((e) => e.type === 'port-forwards-updated'), JSON.stringify(events.slice(-1)));

  // pipe a request through the forwarded port → device echo service
  const reply = await new Promise((res, rej) => {
    const c = net.connect(f.localPort, '127.0.0.1', () => c.write('ping'));
    let buf = '';
    c.on('data', (d) => { buf += d; if (buf.includes('echo:ping')) { c.end(); res(buf); } });
    c.on('error', rej); setTimeout(() => rej(new Error('timeout, got: ' + buf)), 3000);
  }).catch((e) => e.message);
  check('bytes round-trip through the forward to the device service', reply === 'echo:ping', String(reply));

  // ── idempotent: same host+port returns the same record ──
  const f2 = await pf.forward('h1', SERVICE_PORT);
  check('forward is idempotent by host+remotePort', f2.id === f.id && f2.localPort === f.localPort);

  // ── persistence: a fresh manager restores the forward ──
  const pf2 = new PortForwardManager({ hosts, dataDir, broadcast: () => {}, log: () => {} });
  check('persisted forward reloads from disk (inactive until restore)', pf2.list().some((r) => r.id === f.id && !r.active));
  await pf2.restore();
  check('restore() re-establishes the forward on a fresh port', pf2.list().find((r) => r.id === f.id)?.active === true);
  // both managers now bind — tear the second down so ports free
  await pf2.unforward(f.id);

  // ── offline device: forward fails loud, record kept for retry ──
  deviceThrows = true;
  let offErr = null;
  try { await pf.forward('h2', 9999); } catch (e) { offErr = e.message; }
  check('forward to an offline device fails loud', /offline/i.test(offErr || ''), offErr);
  check('the offline forward is still recorded (retries on relink)', pf._state.forwards.some((r) => r.hostId === 'h2'));
  deviceThrows = false;
  await pf.onMachineLinked('h2'); // still offline service (port 9999) → error recorded, no throw
  check('onMachineLinked retries without throwing', true);

  // ── unpair drops a machine's forwards ──
  pf.onMachineUnpaired('h1');
  check('onMachineUnpaired removes the machine forwards', !pf._state.forwards.some((r) => r.hostId === 'h1') && !pf.list().some((r) => r.hostId === 'h1'));

  // ── unforward removes + frees ──
  await pf.unforward('pf-h2-9999');
  check('unforward removes the record', !pf._state.forwards.some((r) => r.id === 'pf-h2-9999'));

  // ── manual LAN-target forward (jump host into the device's network) ──
  {
    const lf = await pf.forward('h1', 8080, { targetHost: '10.0.0.5' });
    check('LAN forward records targetHost', lf.targetHost === '10.0.0.5' && lf.active, JSON.stringify(lf));
    check('LAN forward id encodes host:port', /10\.0\.0\.5.*8080/.test(lf.id), lf.id);
    // tcpForward is per-connection — open one to trigger it, then assert one
    // call reached the device with the LAN target (background probes also call
    // tcpForward, so check the full list, not a single-slot capture)
    mockDm._calls = [];
    await new Promise((res) => { const c = net.connect(lf.localPort, '127.0.0.1', () => { setTimeout(() => { c.destroy(); res(); }, 200); }); c.on('error', res); });
    check('_start pipes to the LAN target host:port on the device', mockDm._calls.some((c) => c.port === 8080 && c.host === '10.0.0.5'), JSON.stringify(mockDm._calls));
    // a plain port forward and a LAN forward for the SAME remotePort coexist
    const plain = await pf.forward('h1', 8080);
    check('bare-port and LAN forward to the same port are DISTINCT records', plain.id !== lf.id && !plain.targetHost, JSON.stringify(plain));
    let bad = ''; try { await pf.forward('h1', 22, { targetHost: 'bad host!' }); } catch (e) { bad = e.message; }
    check('invalid target host rejected', /invalid target host/.test(bad), bad);
    await pf.unforward(lf.id); await pf.unforward(plain.id);
  }

  // ── protocol detection + user override (2.185.0) ──
  {
    const httpSrv = (await import('node:http')).createServer((q, s) => s.end('ok'));
    const HTTP_PORT = await new Promise((r) => httpSrv.listen(0, '127.0.0.1', function () { r(this.address().port); }));
    check('probeHostPort: local plaintext HTTP → http', (await pf.probeHostPort('__local__', HTTP_PORT)) === 'http');
    check('probeHostPort: local raw echo → tcp', (await pf.probeHostPort('__local__', SERVICE_PORT)) === 'tcp');
    // remote probing rides the device tunnel (mock tcpForward → the echo)
    check('probeHostPort: remote via device tunnel → tcp', (await pf.probeHostPort('h1', SERVICE_PORT)) === 'tcp');
    const lp = await pf.detect('__local__', { probe: true });
    const hit = lp.find((p) => p.port === HTTP_PORT);
    check('detect({probe}) tags listeners with proto', hit?.proto === 'http', JSON.stringify(hit));
    const f = await pf.forward('__local__', HTTP_PORT);
    await sleep(700); // _probeForward is fire-and-forget
    let rec = pf.list().find((r) => r.id === f.id);
    check('forward record carries the detected proto', rec?.protoDetected === 'http' && rec?.proto === 'http', JSON.stringify(rec));
    await pf.setProtoOverride(f.id, 'tcp');
    rec = pf.list().find((r) => r.id === f.id);
    check('override wins over detection (effective proto)', rec.proto === 'tcp' && rec.protoOverride === 'tcp' && rec.protoDetected === 'http', JSON.stringify(rec));
    const disk = JSON.parse(fs.readFileSync(path.join(dataDir, 'port-forwards.json'), 'utf-8'));
    check('override persists to disk', disk.forwards.find((r) => r.id === f.id)?.protoOverride === 'tcp');
    await pf.setProtoOverride(f.id, null);
    rec = pf.list().find((r) => r.id === f.id);
    check('Auto clears the override (back to detected)', rec.protoOverride === null && rec.proto === 'http', JSON.stringify(rec));
    let bad = ''; try { await pf.setProtoOverride(f.id, 'ftp'); } catch (e) { bad = e.message; }
    check('invalid proto rejected with guidance', /http, https, tcp/.test(bad), bad);
    await pf.unforward(f.id);
    httpSrv.close();
  }

  // ── orphan detection (B-16d9): REAL listener in a DELETED cwd ──
  if (process.platform === 'linux') {
    const { spawn } = await import('node:child_process');
    const os = await import('node:os');
    const tmp = fs.mkdtempSync(os.tmpdir() + '/pf-orphan-');
    // child prints its port, keeps listening; its cwd is the temp dir
    const proc = spawn('node', ['-e', `require('http').createServer(() => {}).listen(0, '127.0.0.1', function () { console.log(this.address().port); });`], { cwd: tmp, stdio: ['ignore', 'pipe', 'ignore'] });
    const port = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('listener never reported')), 8000);
      proc.stdout.on('data', (d) => { clearTimeout(to); resolve(Number(String(d).trim())); });
    });
    fs.rmSync(tmp, { recursive: true, force: true }); // the worktree "cleanup" that forgets the process
    await new Promise((r) => setTimeout(r, 300));
    const ports = await pf.detectLocal();
    const mine = ports.find((p) => p.port === port);
    check('deleted-cwd listener detected', !!mine, JSON.stringify(ports.slice(0, 5)));
    check('flagged orphan with its pid', !!(mine?.orphan && mine?.pid === proc.pid), JSON.stringify(mine));
    // guard: killOrphan refuses a HEALTHY process (our own test runner)
    let refused = '';
    try { pf.killOrphan(process.pid); } catch (e) { refused = e.message; }
    check('killOrphan refuses a healthy process', /refusing/.test(refused), refused);
    // and kills the real orphan
    const kr = pf.killOrphan(proc.pid);
    const gone = await new Promise((r) => { proc.on('exit', () => r(true)); setTimeout(() => r(false), 5000); });
    check('killOrphan terminates the orphan', !!kr.ok && gone);
  } else {
    console.log('  (skipping orphan e2e — /proc is linux-only)');
  }
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.stack || e.message);
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nport-forward test passed');
process.exit(failed ? 1 : 0);
