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
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); check(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
    try { require('../src/store-writer.js').storeWriter().flushSync([path.join(dataDir, 'port-forwards.json')]); } catch { }   // B-574d (r4827): a suite's direct call names no side — its save rides the writer; landed before the file is read
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
    console.log('  · SKIP orphan e2e: /proc is linux-only');
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
    const disk = () => { try { require('../src/store-writer.js').storeWriter().flushSync([path.join(pdir, 'port-forwards.json')]); } catch { } return JSON.parse(fs.readFileSync(path.join(pdir, 'port-forwards.json'), 'utf-8')); };   // B-574d (r4796): port-forwards.json is the store writer's — a save no person pressed (a reprobe) lands before the file is read
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
    const PF1 = M.load('src/port-forward.js', editAnchor(PF_SRC, STICKY, 'rec.publicSub = r.subdomain || null;', "src/port-forward.js"), 'pre-sticky').PortForwardManager;
    const drive = async (PF) => {
      try { require('../src/store-writer.js').storeWriter().flushSync([path.join(pdir, 'port-forwards.json')]); } catch { }   // B-574d (r4827): the last life's owed write lands BEFORE the file is removed (never after, over the fresh start)
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
    const plugMut = M.write('src/plugins.js', editAnchor(PL_SRC, THROW, '', "src/plugins.js"), 'pre-throw');
    const PF2 = M.load('src/port-forward.js', editAnchor(PF_SRC, "require('./plugins')", `require(${JSON.stringify(plugMut)})`, "src/port-forward.js"), 'pre-probe').PortForwardManager;
    const drive2 = async (PF) => {
      try { require('../src/store-writer.js').storeWriter().flushSync([path.join(pdir, 'port-forwards.json')]); } catch { }   // B-574d (r4827): the last life's owed write lands BEFORE the file is removed (never after, over the fresh start)
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
  // ── r3009 (B-f276 family, lane bl-machines-a): THE STORE-READ LAW for port-forwards.json. A read that FAILS (a PLACED refusal of
  // the read call: EIO, made-up records) is never «no forwards»: the person's next Forward and the boot's replay write NOTHING over the
  // file, the new Forward is refused BY NAME, and the list says why (the Ports panel reads it) ──
  {
    const sdir = fs.mkdtempSync(path.join(path.dirname(dataDir), 'pf-hold-')), sfile = path.join(sdir, 'port-forwards.json');
    const KEPT = { forwards: [{ id: 'pf-kept-1', hostId: '__local__', remotePort: 5501, label: 'kept forward', publicUrl: 'https://kept-sub.relay.example.test', publicName: 'kept-sub', publicSub: 'kept-sub', proto: 'http' }] };
    fs.writeFileSync(sfile, JSON.stringify(KEPT, null, 2)); const before = fs.readFileSync(sfile, 'utf8');
    const realRead = fs.readFileSync;
    fs.readFileSync = function (q, ...a) { if (String(q) === sfile) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return realRead.call(this, q, ...a); };
    let ph = null; try { ph = new PortForwardManager({ hosts, dataDir: sdir, broadcast: () => {}, log: () => {} }); } finally { fs.readFileSync = realRead; }
    if (ph._hold && ph._hold.stop) ph._hold.stop();   // the hold's own re-read ladder stays out of this scene (its law is the helper's)
    let fwdErr = null; try { await ph.forward('__local__', 5502, { label: 'a new forward' }); } catch (e) { fwdErr = e; }
    await ph.restore().catch(() => {});
    // r5029: «write NOTHING» is read after the product could have written — the store writer asked to land what it owes for the file first
    const owedAfter = !!ph._writer().pending(sfile); ph._writer().flushSync([sfile]);
    const after = fs.readFileSync(sfile, 'utf8');
    const listed = typeof ph.heldWords === 'function' ? ph.heldWords() : null;
    check('r3009: port-forwards.json read FAILED (a placed EIO) — the person\'s next Forward and the boot replay write NOTHING over it: the file\'s content survives', after === before && !owedAfter, after.slice(0, 240));
    check('r3009: …the new Forward is refused BY NAME (503 ports_unread), and the store says why (the Ports panel\'s words), never an empty list', !!fwdErr && fwdErr.status === 503 && fwdErr.code === 'ports_unread' && /could not be read/.test(String(listed || '')), JSON.stringify({ err: fwdErr && fwdErr.message, code: fwdErr && fwdErr.code, listed }));
    // r3104 (a): a SECOND ROAD that looks a forward up through the list — /svc/<name> (src/server/path-mounts.js) — answers the hold's
    // words while held (503 ports_unread), never «no service mounted»
    const PM = require('../src/server/path-mounts.js').create({ getPortForwards: () => ph, requestAuthed: () => true });
    const svc = await new Promise((resolve) => { const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c, b }); }, redirect(c, u) { resolve({ c, u }); } }; PM.handler({ originalUrl: '/svc/kept-sub/', url: '/svc/kept-sub/', headers: {} }, res); });
    check('r3104 (a): while held, /svc/<name> answers the hold\'s words (503 ports_unread), never «no service mounted»', svc.c === 503 && svc.b && svc.b.code === 'ports_unread' && /could not be read/.test(String(svc.b.error)), JSON.stringify(svc));
    clearInterval(ph._watch);
    fs.rmSync(sdir, { recursive: true, force: true });
  }
  // r3174 smalls: a machine UNPAIRED while held loses its forwards at the LIFT (never before: the list is unread), and /svc answers a
  // caller who is not signed in with a plain 503 (the hold's words are a signed-in page's). r3228 (round whu7689zw): each with its RED
  // CONTROL in a copy — the unpair's held line cut (its forwards come back at the lift), the plain 503 cut (the hold's words reach a
  // caller who is not signed in)
  {
    const ROOTu = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const { anchored: anchU } = await import('./scratch.mjs');
    const MU = mutantCopies('port-forward-smalls', ROOTu);
    const unpairScene = async (PFM, PMmod, tag) => {
      const udir = fs.mkdtempSync(path.join(path.dirname(dataDir), 'pf-unpair-')), ufile = path.join(udir, 'port-forwards.json');
      fs.writeFileSync(ufile, JSON.stringify({ forwards: [{ id: 'pf-h1-7001', hostId: 'h1', remotePort: 7001, label: 'on h1' }, { id: 'pf-__local__-7002', hostId: '__local__', remotePort: 7002, label: 'local' }] }, null, 2));
      const before = fs.readFileSync(ufile, 'utf8'), realRead = fs.readFileSync;
      fs.readFileSync = function (q, ...a) { if (String(q) === ufile) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return realRead.call(this, q, ...a); };
      let pu = null; try { pu = new PFM({ hosts, dataDir: udir, broadcast: () => {}, log: () => {} }); } finally { fs.readFileSync = realRead; }
      pu.onMachineUnpaired('h1');
      // r5029 (B-574d: this store's writes ride the STORE WRITER since slice «mounts-and-forwards»): «nothing written then» is read AFTER
      // the product could have written — the writer asked to land every write it owes for the file (none is owed while held), then the read
      const PW = pu._writer(), owedHeld = !!PW.pending(ufile); PW.flushSync([ufile]);
      const heldFile = fs.readFileSync(ufile, 'utf8');
      const PMu = PMmod.create({ getPortForwards: () => pu, requestAuthed: () => false });
      const anon = await new Promise((resolve) => { const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c, b }); }, redirect(c, u) { resolve({ c, u }); } }; PMu.handler({ originalUrl: '/svc/x/', url: '/svc/x/', headers: {} }, res); });
      if (pu._hold && pu._hold.again) await pu._hold.again().catch(() => false);
      // r5029: the lift's own write is the writer's: the file is read when the WRITER says it landed (its own fact, durable() — never a
      // sleep; nothing owed answers at once, so a write never asked reads the old file)
      const landed = await PW.durable(ufile, { timeoutMs: 15000 });
      const afterIds = pu.list().map((r) => r.id).sort().join(','), onDisk = JSON.parse(fs.readFileSync(ufile, 'utf8')).forwards.map((r) => r.id).sort().join(',');
      clearInterval(pu._watch);
      fs.rmSync(udir, { recursive: true, force: true });
      return { tag, heldFile: heldFile === before, owedHeld, landed, afterIds, onDisk, anon };
    };
    const PM0 = require('../src/server/path-mounts.js');
    const u0 = await unpairScene(PortForwardManager, PM0, 'now');
    check('r3174: a machine unpaired WHILE HELD writes nothing then (the file as it was) and loses its forwards at the LIFT (listed and on disk: only the other machine\'s)', u0.heldFile && !u0.owedHeld && u0.landed === true && u0.afterIds === 'pf-__local__-7002' && u0.onDisk === 'pf-__local__-7002', JSON.stringify(u0));
    check('r3174: /svc to a caller NOT signed in while held — a plain 503 (no hold words, no file name)', u0.anon.c === 503 && u0.anon.b && !/port-forwards|could not be read/.test(JSON.stringify(u0.anon.b)), JSON.stringify(u0.anon));
    const PFS = fs.readFileSync(path.join(ROOTu, 'src/port-forward.js'), 'utf8'), PMS = fs.readFileSync(path.join(ROOTu, 'src/server/path-mounts.js'), 'utf8');
    const UNPAIR_HELD = "    if (this._hold.held()) { (this._unpairedHeld = this._unpairedHeld || new Set()).add(hostId); return; }   // r3174: held — its forwards go at the lift\n";
    const PLAIN = "res.status(503).json(requestAuthed(req) ? { error: heldW, code: 'ports_unread' } : { error: 'unavailable' })";
    const u1 = await unpairScene(MU.load('src/port-forward.js', anchU(PFS, UNPAIR_HELD, '', 'unpair-held-cut'), 'unpair-held-cut').PortForwardManager, PM0, 'unpair-held-cut');
    check('RED CONTROL r3228: the unpair\'s held line cut (in a copy) — the unpaired machine\'s forward comes back at the lift', u1.afterIds.includes('pf-h1-7001'), JSON.stringify(u1));
    // r5029: RED CONTROL — the lift's write never asked (the unpair road's _persist cut, in a copy): the list drops the machine, the landing
    // answers at once (nothing owed) and the file still names its forward — the on-disk clause, read after the landing, can see a lost write
    const UNPAIR_WRITE = "    this._persist();   // B-574d (r4827): an unpair's own road (no Ports press) rides the writer\n";
    const u3 = await unpairScene(MU.load('src/port-forward.js', anchU(PFS, UNPAIR_WRITE, '', 'unpair-write-cut'), 'unpair-write-cut').PortForwardManager, PM0, 'unpair-write-cut');
    check('RED CONTROL r5029: the unpair\'s write cut (in a copy) — listed without the machine, but read after the landing the file still holds its forward', u3.landed === true && u3.afterIds === 'pf-__local__-7002' && u3.onDisk.includes('pf-h1-7001'), JSON.stringify(u3));
    const u2 = await unpairScene(PortForwardManager, MU.load('src/server/path-mounts.js', anchU(PMS, PLAIN, "res.status(503).json({ error: heldW, code: 'ports_unread' })", 'plain-503-cut'), 'plain-503-cut'), 'plain-503-cut');
    check('RED CONTROL r3228: the plain 503 cut (in a copy) — the hold\'s words (the file\'s name) reach a caller who is not signed in', u2.anon.c === 503 && /port-forwards|could not be read/.test(JSON.stringify(u2.anon.b || {})), JSON.stringify(u2.anon));
  }
  // r3104: TORN BYTES — kept aside once (the helper), the list then starts EMPTY, and the store NAMES the copy for the Ports panel
  // («the list was damaged; its damaged bytes are kept beside it as <name>» — never «restore it»: they are the damaged bytes)
  {
    const tdir = fs.mkdtempSync(path.join(path.dirname(dataDir), 'pf-torn-')), tfile = path.join(tdir, 'port-forwards.json');
    fs.writeFileSync(tfile, '{"forwards": [{"id": "pf-torn-1", "hostId": "__local__", "remotePo');
    const pt = new PortForwardManager({ hosts, dataDir: tdir, broadcast: () => {}, log: () => {} });
    const t0 = Date.now(); while (!(typeof pt.tornCopy === 'function' && pt.tornCopy()) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 25));
    const copy = typeof pt.tornCopy === 'function' ? pt.tornCopy() : null;
    const copyOk = !!copy && fs.existsSync(path.join(tdir, copy)) && fs.readFileSync(path.join(tdir, copy), 'utf8') === '{"forwards": [{"id": "pf-torn-1", "hostId": "__local__", "remotePo';
    const zh = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/lib/i18n-zh.js'), 'utf8');
    check('r3104: torn port-forwards.json — its bytes kept aside once, the list starts empty, and the store names the copy for the Ports panel (its sentence in zh too)', copyOk && /^port-forwards\.json\.corrupt-/.test(copy) && pt.list().length === 0 && zh.includes('"The list of port forwards was damaged; its damaged bytes are kept beside it as {name}.'), JSON.stringify({ copy, n: pt.list().length }));
    if (pt._hold && pt._hold.stop) pt._hold.stop(); clearInterval(pt._watch);
    fs.rmSync(tdir, { recursive: true, force: true });
  }
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.stack || e.message);
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nport-forward test passed');
process.exit(failed ? 1 : 0);
