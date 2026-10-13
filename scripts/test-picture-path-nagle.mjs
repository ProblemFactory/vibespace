#!/usr/bin/env node
// PICTURE PATH NAGLE — lane picture-path-nodelay (2026-10-12, owner "延迟更低"). A person's input on a paired
// machine's desktop crosses three `net` hops we own: the bridge's RFB relay connect (src/server/stream-relay-rfb.js),
// the hub's picture forward accept (src/server/desktop-access.js forwardPort) and the device's tcp-connect op
// (src/agentd/agentd.js). Node keeps Nagle ON for a net socket: a small write behind an un-ACKed one waits for the
// peer's delayed ACK (~40 ms on Linux) — the mechanism lane https-demux-witness proved on the demux front. Every leg
// runs the REAL path: a WebSocket viewer → the REAL bridge (desktop-stream) → the REAL hub forward → a REAL agentd
// booted from the BUILT bundle under a scratch HOME (its tcp-connect) → a stand-in VNC server on the device that
// answers each key RELEASE with a Bell — a real VNC server answers input with nothing at all (its next
// FramebufferUpdate comes when the screen changes), so the press's ACK has no reply to ride and waits for the
// peer's delayed-ACK timer (noDelay on the stand-in's own socket, as x11vnc / Xvnc / xpra set it):
//   BEFORE      the hub's own setNoDelay calls dropped (a call made from src/ is a no-op here; the ws library keeps
//               its own, as it always had) + a bundle COPY with the tcp-connect setNoDelay removed
//   AFTER       today's tree
//   OLD DAEMON  today's hub + that pre-change bundle: a daemon that predates the change still answers (no capability
//               moved), and the hub side alone already helps — printed
// Each leg: SAMPLES key presses (down + up, two messages back to back — a click's press/release, a pointer burst),
// GAP_MS apart; one sample = the time until the release's Bell is back. Median + p95 printed for every leg; the gate is
// derived from the BEFORE run of the same job (never a literal ms): AFTER's median under half of BEFORE's.
// The daemons' HOME / agentd root / XDG_RUNTIME_DIR are scratch dirs, reaped on exit with every daemon booted here.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, scratchHome } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const WebSocket = require('ws');
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const S = require(path.join(REPO, 'src/server/desktop-stream.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAMPLES = Number(process.env.PICTURE_NAGLE_SAMPLES) || 200;
const GAP_MS = 25;

// ── the BEFORE tree's hub: our own setNoDelay calls are no-ops (the first caller frame outside node: internals lies
// under src/); ws's own call (node_modules/ws) still runs — every WebSocket hop had noDelay before this lane too ──
const SRC = path.join(REPO, 'src') + path.sep;
const realNoDelay = net.Socket.prototype.setNoDelay;
let neuter = false, neutered = 0;
net.Socket.prototype.setNoDelay = function (on) {
  if (neuter) {
    const caller = (new Error().stack || '').split('\n').slice(2).find((l) => !/\(node:|at node:/.test(l)) || '';
    if (caller.includes(SRC)) { neutered++; return this; }
  }
  return realNoDelay.call(this, on);
};

const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const work = scratch('picnagle-work'); fs.mkdirSync(work, { recursive: true });
const XDG = path.join(work, 'xdg'); fs.mkdirSync(XDG, { recursive: true, mode: 0o700 }); process.env.XDG_RUNTIME_DIR = XDG;
const homeNow = scratchHome('picnagle-home', fs, ['.vibespace']);
const homeOld = scratchHome('picnagle-home-old', fs, ['.vibespace']);
const rootOf = (h) => path.join(h, 'agentd-root');
// every process this run's daemons left carries its scratch HOME (the pidfile alone missed them: ci's reaper found two per run)
const D = require(path.join(REPO, 'src/desktop-display.js'));
const homePids = (h) => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d) && Number(d) !== process.pid && D.environHas(Number(d), `HOME=${h}`)).map(Number);
const cleanup = () => {
  for (const h of [homeNow, homeOld]) for (const p of homePids(h)) { try { process.kill(p, 'SIGKILL'); } catch { } }
  for (const d of [homeNow, homeOld, work]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const realHome = process.env.HOME;
/** A DeviceManager over a daemon booted from `bundlePath` under `h` (the daemon inherits this process's env). */
async function deviceOn(h, bundlePath) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h);
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  try { await dm.connect(); } finally { process.env.HOME = realHome; }
  return dm;
}
const quiet = { log() { }, warn() { } };

console.log('§0 the built bundle and its pre-change copy');
const bundleText = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';
ok(!!bundleText, 'data/bin/vibespace-agentd.js exists (run `npm run build` first)');
if (!bundleText) { console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }
const TCP_NODELAY = /\btsock\.setNoDelay\(true\);/g;
const inBundle = (bundleText.match(TCP_NODELAY) || []).length;
ok(inBundle === 1, `the bundle's tcp-connect sets noDelay exactly once (the copy removes exactly it): ${inBundle}`);
const preBundle = path.join(work, 'vibespace-agentd-pre.js');
fs.writeFileSync(preBundle, bundleText.replace(TCP_NODELAY, ''));

// the device's VNC server stand-in: RFB 3.8, security None, then one Bell per key RELEASE (nothing for a press)
const vnc = net.createServer({ noDelay: true }, (s) => {
  s.on('error', () => { });
  let buf = Buffer.alloc(0), phase = 0;
  s.write('RFB 003.008\n');
  s.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (phase === 0) { if (buf.length < 12) return; buf = buf.subarray(12); phase = 1; s.write(Buffer.from([1, 1])); continue; }
      if (phase === 1) { if (buf.length < 1) return; buf = buf.subarray(1); phase = 2; s.write(Buffer.alloc(4)); continue; }
      if (phase === 2) {
        if (buf.length < 1) return;
        buf = buf.subarray(1); phase = 3;
        const si = Buffer.alloc(26); si.writeUInt16BE(800, 0); si.writeUInt16BE(600, 2); si[4] = 32; si[5] = 24; si[7] = 1;
        si.writeUInt16BE(255, 8); si.writeUInt16BE(255, 10); si.writeUInt16BE(255, 12); si[14] = 16; si[15] = 8; si.writeUInt32BE(2, 20); si.write('vs', 24);
        s.write(si); continue;
      }
      if (buf.length < 8) return;
      if (buf[0] !== 4) { s.destroy(); return; }
      const down = buf[1] === 1; buf = buf.subarray(8); if (!down) s.write(Buffer.from([2]));
    }
  });
});
await new Promise((r) => vnc.listen(0, '127.0.0.1', r));
const vncPort = vnc.address().port;
const HANDSHAKE_DOWN = 12 + 2 + 4 + 26;
const KEY = (down) => { const b = Buffer.alloc(8); b[0] = 4; b[1] = down ? 1 : 0; b.writeUInt32BE(0x61, 4); return b; };

/** One leg: viewer → bridge → forward → `dm` → the VNC stand-in; SAMPLES presses; the ms list. */
async function leg(label, dm, { hubBefore }) {
  neuter = hubBefore; neutered = 0;
  const hostId = 'dev-' + label;
  const hosts = { get: (h) => (h === hostId ? { id: h } : null), isLocal: () => false, deviceBounded: async (h) => { if (h !== hostId) throw new Error('unknown'); return dm; } };
  const acc = ACC.create({ hosts, install: false, log: quiet });
  const bridge = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'rfb', port: vncPort, hostId }), forwardPort: (h, p) => acc.forwardPort(h, p), log: quiet });
  const srv = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  srv.on('upgrade', (req, sock, head) => { const id = S.upgradeId(new URL(req.url, 'http://x').pathname); if (!id) { sock.destroy(); return; } bridge.handleUpgrade(req, sock, head, id); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}${S.streamPath('pn-' + label)}`, ['binary']);
  let got = 0, waiter = null;
  ws.on('message', (m) => { got += m.length; if (waiter && got >= waiter.n) { const w = waiter; waiter = null; w.resolve(true); } });
  const bytes = (n, ms = 5000) => (got >= n ? Promise.resolve(true) : new Promise((resolve) => { const t = setTimeout(() => { waiter = null; resolve(false); }, ms); waiter = { n, resolve: (v) => { clearTimeout(t); resolve(v); } }; }));
  const opened = await new Promise((r) => { ws.once('open', () => r(true)); ws.once('error', () => r(false)); ws.once('unexpected-response', () => r(false)); });
  const rtts = []; let lost = 0;
  if (opened) {
    const hs = (await bytes(12)) && (ws.send(Buffer.from('RFB 003.008\n')), await bytes(14)) && (ws.send(Buffer.from([1])), await bytes(18)) && (ws.send(Buffer.from([1])), await bytes(HANDSHAKE_DOWN));
    if (hs) {
      for (let i = 0; i < SAMPLES; i++) {
        const t0 = process.hrtime.bigint();
        ws.send(KEY(true)); ws.send(KEY(false));
        if (!(await bytes(HANDSHAKE_DOWN + i + 1))) { lost++; break; }
        rtts.push(Number(process.hrtime.bigint() - t0) / 1e6);
        await sleep(GAP_MS);
      }
    } else lost = -1;
  }
  const dropped = neutered;
  try { ws.close(); } catch { }
  await sleep(100);
  acc.shutdown(); srv.close(); neuter = false;
  return { opened, rtts, lost, dropped };
}
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); const at = (q) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]; return { n: s.length, median: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) }; };

console.log('§1 a real daemon of each kind on the device side');
const dmNow = await deviceOn(homeNow, BUNDLE);
const dmOld = await deviceOn(homeOld, preBundle);
ok(dmNow.status().connected && dmOld.status().connected, 'today\'s daemon and the pre-change copy both connect (the copy\'s hello-ack is unchanged: no capability moved)');
const capsOf = (dm) => JSON.stringify((dm.status().info || {}).capabilities || []);
ok(capsOf(dmNow) === capsOf(dmOld), 'both name the same capabilities');

console.log(`§2 ${SAMPLES} key presses through the whole picture path, three ways`);
const legs = {};
for (const [name, dm, hubBefore] of [['before', dmOld, true], ['after', dmNow, false], ['old-daemon', dmOld, false]]) {
  const r = await leg(name, dm, { hubBefore });
  legs[name] = r;
  const st = r.rtts.length ? stats(r.rtts) : null;
  console.log(`    ${name.padEnd(11)} ${st ? `median ${st.median} ms · p95 ${st.p95} ms · max ${st.max} ms (n=${st.n})` : '—'}${hubBefore ? ` · hub noDelay calls dropped: ${r.dropped}` : ''}`);
  ok(r.opened && r.lost === 0 && r.rtts.length === SAMPLES, `${name}: the viewer's every press came back through the bridge, the forward and the daemon`, { opened: r.opened, lost: r.lost, n: r.rtts.length });
  r.st = st;
}
const B = legs.before.st, A = legs.after.st, O = legs['old-daemon'].st;
ok(legs.before.dropped >= 2, `BEFORE really ran without the hub's calls (the relay's connect + the forward's accept: ${legs.before.dropped} dropped)`);
if (B && A && O) {
  ok(A.median < B.median / 2, `AFTER's median ${A.median} ms is under half of BEFORE's ${B.median} ms (p95 ${B.p95} → ${A.p95} ms)`);
  ok(O.median < B.median, `a daemon that predates the change, behind today's hub: median ${O.median} ms (BEFORE ${B.median}, AFTER ${A.median}) — the hub side alone helps`);
}
console.log(`PICTURE-NAGLE before median ${B && B.median} p95 ${B && B.p95} · after median ${A && A.median} p95 ${A && A.p95} · old-daemon median ${O && O.median} p95 ${O && O.p95}`);
try { dmNow.stop?.(); dmOld.stop?.(); } catch { }
vnc.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
