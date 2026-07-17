#!/usr/bin/env node
// ExitProxyManager (task #164): opt-in gating, machine resolution, and the
// SOCKS forward's byte pipe + lifecycle. The daemon SOCKS5 protocol itself is
// covered by test-agentd-socks.mjs; here the "device SOCKS" is a plain echo so
// we test the MANAGER (a dumb pipe + gate), not the protocol.
// Run: node scripts/test-exit-proxy.mjs
import net from 'node:net';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ExitProxyManager } = require('../src/exit-proxy.js');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a "device SOCKS": an echo server (the manager only pipes bytes through it)
const echoPort = await new Promise((r) => { const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('EX:'), d])))); s.listen(0, '127.0.0.1', () => r(s.address().port)); });

// mock host registry + device
const records = [
  { id: 'host-mac', name: 'Mac', transport: 'dial', online: true, allowExit: true },
  { id: 'host-box', name: 'Build Box', transport: 'ssh', allowExit: true },
  { id: 'host-off', name: 'Off Mac', transport: 'dial', online: false, allowExit: true },
  { id: 'host-no', name: 'NotAnExit', transport: 'ssh' }, // allowExit off
];
let served = 0, unserved = 0;
const mkDevice = () => ({
  async serveSocks() { served++; return { port: echoPort }; },
  async tcpForward(port) {
    const sock = net.connect(port, '127.0.0.1');
    const handle = { onData: null, onClose: null, write: (b) => sock.write(b), close: () => sock.destroy() };
    sock.on('data', (b) => handle.onData?.(b)); sock.on('close', () => handle.onClose?.()); sock.on('error', () => handle.onClose?.());
    return handle;
  },
  async unserveSocks() { unserved++; return { closed: true }; },
});
const hosts = {
  list: () => records.map((r) => ({ ...r })),
  get: (id) => { const h = records.find((x) => x.id === id); if (!h) throw new Error('host not found'); return h; },
  async device(id) { const h = records.find((x) => x.id === id); if (h.online === false) throw new Error(`device "${h.name}" is offline`); return mkDevice(); },
};
const ev = [];
const ex = new ExitProxyManager({ hosts, broadcast: (m) => ev.push(m), log: () => {} });

try {
  // ── list: only allowExit machines, with online + active ──
  const list = ex.list();
  check('list returns only allowExit machines', list.length === 3 && !list.some((m) => m.id === 'host-no'), JSON.stringify(list.map((m) => m.id)));
  check('list carries online flag (dial offline shows false)', list.find((m) => m.id === 'host-off').online === false);

  // ── resolve: id / exact name / unique substring / gating ──
  check('resolve by id', ex.resolve('host-mac').id === 'host-mac');
  check('resolve by exact name', ex.resolve('Mac').id === 'host-mac'); // "Mac" exact beats "Off Mac" substring
  check('exact name (case-insensitive) beats substring', ex.resolve('mac').id === 'host-mac'); // 'mac' === 'Mac'
  check('resolve by unique substring', ex.resolve('build').id === 'host-box');
  let amb = ''; try { ex.resolve('ma'); } catch (e) { amb = e.message; } // 'ma' ⊂ Mac AND Off Mac, exact of neither
  check('ambiguous substring is rejected with names', /more specific|matches/.test(amb), amb);
  let notExit = ''; try { ex.resolve('NotAnExit'); } catch (e) { notExit = e.message; }
  check('a real machine that is NOT an exit is rejected clearly', /not enabled as an exit/.test(notExit), notExit);
  let none = ''; try { ex.resolve('nope'); } catch (e) { none = e.message; }
  check('no match is rejected', /no exit machine matches/.test(none), none);

  // ── use: binds a local port, bytes round-trip through the (mock) device SOCKS ──
  const r = await ex.use('host-mac');
  check('use returns a socks5h url on the server loopback', /^socks5h:\/\/127\.0\.0\.1:\d+$/.test(r.url), r.url);
  check('serveSocks was called on the device', served === 1);
  const reply = await new Promise((resolve) => {
    const c = net.connect(r.localPort, '127.0.0.1', () => c.write('ping'));
    let b = ''; c.on('data', (d) => { b += d; if (b.includes('EX:ping')) { c.end(); resolve(b); } });
    c.on('error', () => resolve('')); setTimeout(() => { try { c.destroy(); } catch {} resolve(b); }, 3000);
  });
  check('bytes round-trip through the exit forward', reply.includes('EX:ping'), JSON.stringify(reply));

  // ── use is idempotent (reuses the live forward) ──
  const r2 = await ex.use('host-mac');
  check('use is idempotent (same local port, no second serveSocks)', r2.localPort === r.localPort && served === 1);
  check('list marks the machine active with its localPort', ex.list().find((m) => m.id === 'host-mac').active === true);

  // ── offline device fails loud ──
  let offErr = ''; try { await ex.use('host-off'); } catch (e) { offErr = e.message; }
  check('use on an offline device fails loud', /offline/i.test(offErr), offErr);

  // ── stop tears down + unserves the device SOCKS ──
  await ex.stop('host-mac');
  check('stop unserves the device SOCKS', unserved === 1);
  check('stop clears the live forward', !ex.list().find((m) => m.id === 'host-mac').active);
  const dead = await new Promise((resolve) => {
    const c = net.connect(r.localPort, '127.0.0.1'); c.on('connect', () => { c.end(); resolve(false); }); c.on('error', () => resolve(true)); setTimeout(() => resolve(true), 1500);
  });
  check('the local exit port is closed after stop', dead === true);

  // ── onMachineUnpaired drops a machine's forward ──
  await ex.use('host-box'); await sleep(100);
  ex.onMachineUnpaired('host-box'); await sleep(200);
  check('onMachineUnpaired stops the machine\'s exit', !ex.list().find((m) => m.id === 'host-box').active);
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  try { for (const m of ['host-mac', 'host-box']) await ex.stop(m); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nexit-proxy test passed');
process.exit(failed ? 1 : 0);
