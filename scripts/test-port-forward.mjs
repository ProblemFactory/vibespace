#!/usr/bin/env node
// Unit test for PortForwardManager (B-0b60 tunnel path): detect() parsing +
// end-to-end piping through a MOCK device (tcpForward → a real loopback echo
// server standing in for the device's service). No daemon/ssh needed.
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PortForwardManager } = require('../src/port-forward.js');
import { mutantCopies } from './mutant-copy.mjs';

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
const hosts = {
  async device() { if (deviceThrows) throw new Error('device "x" is offline'); return mockDm; },
  // mirror the real HostManager interface (2.247.0): consumers call the
  // bounded variant for read-only/interactive paths
  deviceBounded(id, ms) { return this.device(id); },
  list: () => [{ id: 'h1', name: 'mock-mac', transport: 'dial' }],
};

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
  // CHURN regression (owner report: the reverse-tunnel port re-toasted as
  // "new" on every reappearance): a port that DISAPPEARS and comes back is
  // NOT news — the seen-set accumulates, it never resets to the snapshot
  const churnAdd = mockDm.runCmd;
  mockDm.runCmd = async () => ({ code: 0, stdout:
    'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=42,fd=20))\n'
    + 'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))\n', stderr: '' });
  await pf._watchSweep(); // 3000/8080 vanish
  mockDm.runCmd = churnAdd;
  events.length = 0;
  await pf._watchSweep(); // …and reappear
  check('reappearing port does NOT re-announce (seen-set accumulates)', !events.some((e) => e.type === 'machine-ports-new'), JSON.stringify(events));
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

  // ── LOCAL (This machine) forward to a LAN target must PROXY, not loopback-
  // short-circuit (real report: 本机→Tailscale-IP gave a blank browser). Here
  // the "LAN target" is another loopback echo the instance can reach. ──
  {
    const LAN_PORT = await new Promise((res) => { const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('LAN:'), d])))); s.listen(0, '0.0.0.0', () => res(s.address().port)); }); // all-ifaces so 127.0.0.2 reaches it
    const lf = await pf.forward('__local__', LAN_PORT, { targetHost: '127.0.0.2' }); // 127.0.0.2 = a non-loopback-127.0.0.1 target
    check('local LAN forward binds a REAL proxy port (not the remotePort short-circuit)', lf.localPort && lf.localPort !== LAN_PORT, JSON.stringify({ localPort: lf.localPort, remotePort: LAN_PORT }));
    // NOTE: 127.0.0.2 reaches the same loopback echo on Linux — proves the
    // proxy dials targetHost:port rather than assuming the service is local.
    const reply = await new Promise((resolve) => {
      const c = net.connect(lf.localPort, '127.0.0.1', () => c.write('hey'));
      let b = ''; c.on('data', (d) => { b += d; if (b.includes('LAN:hey')) { c.end(); resolve(b); } });
      c.on('error', () => resolve('')); setTimeout(() => { try { c.destroy(); } catch {} resolve(b); }, 3000);
    });
    check('local LAN forward proxies bytes to targetHost:port', reply.includes('LAN:hey'), JSON.stringify(reply));
    await pf.unforward(lf.id);
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
  // ── lane job-publish-stable: a published forward keeps its public NAME, and the protocol probe never races a
  //    service start (the 2026-10-04 incident: a boot-replayed service probed before it listened was republished TCP
  //    and lost its subdomain). A fake frp plugin decides like the real one (hint, else probe → unreachable = http).
  {
    const { probeProto } = require('../src/plugins.js');
    const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const P = await freePort();
    let srv = null;
    const up = (kind) => new Promise((res) => {
      srv = kind === 'http' ? http.createServer((q, s) => s.end('ok')) : net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('echo:'), d]))));
      srv.listen(P, '127.0.0.1', res);
    });
    const down = () => new Promise((res) => { if (!srv) return res(); srv.close(() => res()); srv.closeAllConnections?.(); srv = null; });
    let seq = 0;
    const calls = [];
    const fakePlugins = {
      async frpPublish(name, port, { preferPort = 0, preferSub = '', proto = '' } = {}) {
        const p = ['http', 'https', 'tcp'].includes(proto) ? proto : await probeProto(port).catch(() => 'http');
        calls.push({ name, port, preferSub, preferPort, proto: p });
        if (p === 'http') { const sub = /^[a-z0-9][a-z0-9-]{1,62}$/.test(preferSub) ? preferSub : 'vs' + (++seq).toString(16).padStart(10, 'a'); return { name, subdomain: sub, proto: p, url: `https://${sub}.relay.test/`, publicHost: sub + '.relay.test' }; }
        const remotePort = preferPort || 22000 + (++seq);
        return { name, remotePort, proto: p, url: p === 'tcp' ? `tcp://relay.test:${remotePort}` : `${p}://relay.test:${remotePort}/` };
      },
      async frpUnpublish() { return { ok: true }; },
    };
    const pdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pfpub-'));
    const logs = [];
    const mk = (PF = PortForwardManager) => new PF({ hosts, dataDir: pdir, plugins: fakePlugins, broadcast: () => {}, log: (l) => logs.push(l) });
    const disk = () => JSON.parse(fs.readFileSync(path.join(pdir, 'port-forwards.json'), 'utf-8'));
    const id = 'pf-__local__-' + P;

    // the probe: a port nobody listens on is UNDECIDED (throws), not 'tcp'
    let thrown = null; try { await probeProto(P, { timeoutMs: 800 }); } catch (e) { thrown = e; }
    check('probeProto: a refused port is undecided (throws EUNREACHABLE), never "tcp"', thrown && thrown.code === 'EUNREACHABLE', String(thrown));
    await up('tcp');
    check('probeProto: a raw-TCP listener still reads "tcp"', (await probeProto(P, { timeoutMs: 800 })) === 'tcp');
    await down();

    // 1. a web service published http gets subdomain S
    await up('http');
    const pa = mk();
    await pa.forward('__local__', P, { label: 'service: demo' });
    const r1 = await pa.publish(id);
    const S = pa.list().find((f) => f.id === id).publicSub;
    check('publish of a live web service → https://<sub>', /^https:\/\/vs[0-9a-f]+\.relay\.test\/$/.test(r1.publicUrl) && !r1.pending, JSON.stringify(r1));
    // 2. server restart (a new manager over the same data/) keeps the subdomain
    const pb = mk();
    await pb.restore();
    check('server restart: the restored forward republishes the SAME subdomain', pb.list().find((f) => f.id === id).publicUrl === r1.publicUrl && calls.at(-1).preferSub === S, JSON.stringify(calls.at(-1)));
    // 3. reboot: the service is not listening yet when the job publishes — the probe cannot decide → the LAST protocol
    await down();
    const r3 = await pb.publish(id);
    check('nothing answers yet: publish keeps the last protocol (http) and the same name — no TCP fallback', r3.publicUrl === r1.publicUrl && r3.proto === 'http' && r3.pending === true, JSON.stringify(r3));
    check('…the forward is marked protoPending (re-probed by the heal sweep / reprobe)', pb.list().find((f) => f.id === id) && disk().forwards.find((f) => f.id === id).protoPending === true);
    check('…one log line names the decision', logs.some((l) => l.includes(`publish ${id}: http (nothing answers yet, kept the last protocol)`)), logs.slice(-3).join(' | '));
    // 4. the late listener answers → reprobe confirms http, same URL, pending cleared
    await up('http');
    const r4 = await pb.reprobe(id);
    check('late listener: reprobe confirms http under the same URL, pending cleared', !r4.changed && r4.publicUrl === r1.publicUrl && !disk().forwards.find((f) => f.id === id).protoPending, JSON.stringify(r4));
    // 5. a protocol change never discards the name: a raw-TCP answer publishes TCP, the subdomain stays on the record…
    await down(); await up('tcp');
    const r5 = await pb.reprobe(id);
    const rec5 = disk().forwards.find((f) => f.id === id);
    check('a TCP decision publishes tcp:// and KEEPS publicSub on the record', r5.changed && /^tcp:\/\//.test(r5.publicUrl) && rec5.publicSub === S, JSON.stringify(rec5));
    // …and a web answer repairs the TCP publish to http with the SAME subdomain
    await down(); await up('http');
    const r6 = await pb.reprobe(id);
    check('repair: a wrong TCP publish goes back to http with the same subdomain', r6.changed && r6.publicUrl === r1.publicUrl, JSON.stringify(r6));
    // 6. a stopping service (unpublish + unforward keepName) gets its name back at its next start
    await pb.unpublish(id, { keepName: true }); await pb.unforward(id, { keepName: true });
    check('stop: the forward is gone, its public name waits in the store', !pb.list().some((f) => f.id === id) && disk().names[id].sub === S, JSON.stringify(disk().names));
    await pb.forward('__local__', P, { label: 'service: demo' });
    const r7 = await pb.publish(id);
    check('start: the recreated forward publishes the SAME URL', r7.publicUrl === r1.publicUrl && !disk().names[id], JSON.stringify(r7));
    // 7. an EXPLICIT unpublish forgets the name — the next publish gets a new one
    await pb.unpublish(id);
    const rec8 = disk().forwards.find((f) => f.id === id);
    check('explicit unpublish clears publicSub / publicPort', rec8.publicSub === null && rec8.publicPort === null && !rec8.publicUrl, JSON.stringify(rec8));
    const r8 = await pb.publish(id);
    check('…and the next publish has a NEW subdomain', /^https:\/\/vs/.test(r8.publicUrl) && r8.publicUrl !== r1.publicUrl, r8.publicUrl);
    await pb.unpublish(id);

    // PATCHED-COPY CONTROLS (outside the tree): each fix reverted on its own reproduces the incident
    const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const M = mutantCopies('port-forward-publish', ROOT);
    const PF_SRC = fs.readFileSync(path.join(ROOT, 'src/port-forward.js'), 'utf-8');
    const PL_SRC = fs.readFileSync(path.join(ROOT, 'src/plugins.js'), 'utf-8');
    // item 1 — the pre-fix adopt line: a TCP publish drops the subdomain, the repair gets a random one
    const STICKY = 'rec.publicSub = r.subdomain || rec.publicSub || null;';
    check('the sticky adopt line is present once', PF_SRC.split(STICKY).length === 2);
    const PF1 = M.load('src/port-forward.js', PF_SRC.replace(STICKY, 'rec.publicSub = r.subdomain || null;'), 'pre-sticky').PortForwardManager;
    const drive = async (PF) => {
      fs.rmSync(path.join(pdir, 'port-forwards.json'), { force: true });
      const pm = mk(PF);
      await down(); await up('http');
      await pm.forward('__local__', P, { label: 'service: demo' });
      const a = await pm.publish(id);
      await down(); await up('tcp'); await pm.reprobe(id);
      await down(); await up('http'); const c = await pm.reprobe(id);
      await pm.unpublish(id);
      return { a: a.publicUrl, c: c.publicUrl };
    };
    const real1 = await drive(PortForwardManager), mut1 = await drive(PF1);
    check('CONTROL item 1: with the fix, http → tcp → http comes back to the same URL', real1.a === real1.c, JSON.stringify(real1));
    check('NEGATIVE CONTROL item 1: the pre-fix adopt line loses the subdomain across the protocol change', mut1.a !== mut1.c, JSON.stringify(mut1));
    // item 2 — the pre-fix probe (a refused port reads "tcp") + the pre-fix decision (frpPublish probes, no last protocol)
    const THROW = "  if (!isHttp && !reached) throw Object.assign(new Error('nothing answers on that port'), { code: 'EUNREACHABLE' });\n";
    check('the undecided-probe throw is present once', PL_SRC.split(THROW).length === 2);
    const plugMut = M.write('src/plugins.js', PL_SRC.replace(THROW, ''), 'pre-throw');
    const PF2 = M.load('src/port-forward.js', PF_SRC.replace("require('./plugins')", `require(${JSON.stringify(plugMut)})`), 'pre-probe').PortForwardManager;
    const drive2 = async (PF) => {
      fs.rmSync(path.join(pdir, 'port-forwards.json'), { force: true });
      const pm = mk(PF);
      await down(); await up('http');
      await pm.forward('__local__', P, { label: 'service: demo' });
      const a = await pm.publish(id);
      await down();
      const b = await pm.publish(id); // the job publishes before the service listens
      await pm.unpublish(id);
      return { a: a.publicUrl, b: b.publicUrl, proto: b.proto };
    };
    const real2 = await drive2(PortForwardManager), mut2 = await drive2(PF2);
    check('CONTROL item 2: a publish before the service listens keeps http + the URL', real2.a === real2.b && real2.proto === 'http', JSON.stringify(real2));
    check('NEGATIVE CONTROL item 2: the pre-fix probe reads the refused port as TCP and publishes tcp://', mut2.proto === 'tcp' && /^tcp:\/\//.test(mut2.b), JSON.stringify(mut2));
    await down();
    fs.rmSync(pdir, { recursive: true, force: true });
  }
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.stack || e.message);
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nport-forward test passed');
process.exit(failed ? 1 : 0);
