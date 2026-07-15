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
  async tcpForward(port) {
    const sock = net.connect(port, '127.0.0.1');
    const handle = { onData: null, onClose: null, write: (b) => sock.write(b), close: () => sock.destroy() };
    sock.on('data', (b) => handle.onData?.(b));
    sock.on('close', () => handle.onClose?.());
    sock.on('error', () => handle.onClose?.());
    return handle;
  },
};
let deviceThrows = false;
const hosts = { async device() { if (deviceThrows) throw new Error('device "x" is offline'); return mockDm; } };

const events = [];
const pf = new PortForwardManager({ hosts, dataDir, broadcast: (m) => events.push(m), log: () => {} });

try {
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
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.stack || e.message);
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nport-forward test passed');
process.exit(failed ? 1 : 0);
