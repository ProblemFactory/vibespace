#!/usr/bin/env node
// The desktop stream bridge KEEPS ITS SOCKET ALIVE AND NAMES ITS CLOSE (2.369.118,
// userW's "Desktop disconnected" that left no evidence in any log): an RFB
// stream over a static screen carries no bytes for minutes and a proxy on the
// way drops a silent WebSocket; the bridge now pings every `pingMs`, terminates
// a peer silent for two rounds, and logs open + close (who, after how long,
// bytes each way). Real ws client + a real TCP "VNC server" that just holds the
// socket — no chrome, ~1s. §5 (2026-09-22): the held-bytes cap on both bridges —
// a viewer DECLARING a 2 GiB packet is closed 1009 packet-too-large in its first
// chunk with memory bounded, the other viewer and the upstream untouched; the
// bridge without the cap (a patched copy) is the control. ~3s.
// Run: node scripts/test-desktop-stream-keepalive.mjs
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules/ws'));
const DS = require(path.join(repo, 'src/server/desktop-stream.js'));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a "VNC server": accepts and holds every socket, sends one greeting byte-string
const held = [];
const vnc = net.createServer((s) => { held.push(s); s.write('RFB 003.008\n'); });
await new Promise((r) => vnc.listen(0, '127.0.0.1', r));
const vncPort = vnc.address().port;

const logs = [];
const log = { log: (m) => logs.push(m), warn: (m) => logs.push(m) };
const PING = 60;
const ds = DS.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'rfb', port: vncPort }), log, pingMs: PING });
ok('PING_MS is exported and the production default is a keepalive cadence a proxy idle timeout cannot beat (≤ 30 s)', DS.PING_MS === 20000);
const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
srv.on('upgrade', (req, socket, head) => ds.handleUpgrade(req, socket, head, ds.upgradeId(new URL(req.url, 'http://x').pathname)));
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

console.log('§1 a browser that answers pings stays connected; the bridge logs the open');
{
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/vnc`);
  let pings = 0, gotRfb = false;
  ws.on('ping', () => { pings++; });
  ws.on('message', (m) => { if (String(m).startsWith('RFB')) gotRfb = true; });
  await new Promise((r) => ws.on('open', r));
  await sleep(PING * 4 + 30);
  ok('the bridge relays the server greeting to the browser', gotRfb);
  ok(`the bridge pinged ≥ 3 times in 4 rounds (${pings})`, pings >= 3);
  ok('an answering client is still open after 4 rounds', ws.readyState === 1);
  ok('the open was logged with the target', logs.some((l) => /desktop-singleton: bridge opened → 127\.0\.0\.1:\d+/.test(l)), logs);
  ws.close(1000, 'bye');
  await sleep(80);
  const closeLine = logs.find((l) => /desktop-singleton: closed \(the browser closed, code 1000 bye\) after \d+s, \d+ B to the browser, \d+ B to the server/.test(l));
  ok('a browser-initiated close is logged with code, reason, duration and bytes', !!closeLine, logs);
}

console.log('§2 a browser that never answers a ping is terminated after two rounds, and NAMED');
{
  const before = logs.length;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/vnc`, { autoPong: false });
  let closed = null;
  ws.on('close', (code) => { closed = code; });
  await new Promise((r) => ws.on('open', r));
  await sleep(PING * 4 + 30);
  ok('the silent client was terminated (close code 1006 = abnormal, i.e. terminate())', closed === 1006, closed);
  const line = logs.slice(before).find((l) => /closed \(no pong for 120 ms\)/.test(l));
  ok('the close names the ping timeout', !!line, logs.slice(before));
}

console.log('§3 the VNC server dropping its socket closes the browser side and is NAMED');
{
  const before = logs.length;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/vnc`);
  let closed = null;
  ws.on('close', (code) => { closed = code; });
  await new Promise((r) => ws.on('open', r));
  await sleep(30);
  held[held.length - 1].destroy();
  await sleep(120);
  ok('the browser socket closed', closed != null, closed);
  ok('…and the log names the VNC server side', logs.slice(before).some((l) => /closed \(the VNC server closed its socket\)/.test(l)), logs.slice(before));
}

console.log('§4 the client opts in: the singleton Desktop window walks the reconnect ladder too');
{
  const fs = await import('node:fs');
  const dw = fs.readFileSync(path.join(repo, 'src/lib/desktop-window.js'), 'utf8');
  ok('desktop-window.js passes autoReconnect: true (2.369.118 — the Desktop no longer sits on "Disconnected" until a click)', /autoReconnect: true/.test(dw));
}

console.log('§5 the HELD-BYTES CAP (2026-09-22, hole A of the r6 verify): a viewer DECLARING a 2 GiB packet is closed in its first chunk — memory bounded, the upstream and the other viewer untouched');
{
  const fs = await import('node:fs');
  const v8 = await import('node:v8'); const vm = await import('node:vm');
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
  const MiB = 1024 * 1024;
  const mem = async () => { await sleep(50); gc(); gc(); await sleep(20); const m = process.memoryUsage(); return { rss: m.rss, ab: m.arrayBuffers }; };
  // a fake xpra server: its own ws, records what each connection sent, can send to each
  const upConns = [];
  const up = new WebSocket.Server({ port: 0, host: '127.0.0.1', maxPayload: 1024 * MiB });
  up.on('connection', (c) => { const rec = { c, got: [], closed: false }; upConns.push(rec); c.on('message', (m) => rec.got.push(Buffer.from(m))); c.on('close', () => { rec.closed = true; }); });
  await new Promise((r) => up.on('listening', r));
  const upPort = up.address().port;
  const tcpHeld = [];
  const rfbSrv = net.createServer((s) => { tcpHeld.push(s); s.on('error', () => {}); s.on('data', () => {}); s.write('RFB 003.008\n'); });
  await new Promise((r) => rfbSrv.listen(0, '127.0.0.1', r));
  const pkt = (type) => { const t = Buffer.from(type); const payload = Buffer.concat([Buffer.from([192 + 2, 128 + t.length]), t, Buffer.from([0])]); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(payload.length, 4); return Buffer.concat([h, payload]); };
  const hdr2g = () => { const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(2 ** 31, 4); return h; };
  const rig = async (mod) => {
    const blog = [];
    const br = mod.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => (id === 'xp' ? { kind: 'xpra', port: upPort } : { kind: 'rfb', port: rfbSrv.address().port }), log: { log: (l) => blog.push(String(l)), warn: (l) => blog.push('W ' + l) }, pingMs: 60000 });
    const s = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
    s.on('upgrade', (req, socket, head) => br.handleUpgrade(req, socket, head, mod.upgradeId(new URL(req.url, 'http://x').pathname)));
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    return { br, blog, port: s.address().port, close: () => new Promise((r) => s.close(r)) };
  };
  const viewer = async (port, pathName, v) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${pathName}?viewer=${v}`, ['binary'], { maxPayload: 1024 * MiB });
    const st = { back: [], code: null, reason: null };
    ws.on('message', (m) => st.back.push(Buffer.from(m)));
    ws.on('close', (code, reason) => { st.code = code; st.reason = String(reason); });
    ws.on('error', () => {});
    await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
    return { ws, st };
  };
  /** stream `n` chunks of 1 MiB after `first`, one at a time, stopping when the bridge closes us */
  const stream = async (ws, first, n) => { const chunk = Buffer.alloc(MiB, 0x41); let sent = 0; await new Promise((r) => ws.send(first, r)); sent++; for (let i = 0; i < n && ws.readyState === 1; i++) { await new Promise((r) => ws.send(chunk, r)); sent++; } return sent; };
  const upOf = (i) => upConns[i];

  const R = await rig(DS);
  const B = await viewer(R.port, '/api/desktop/xp/stream', 'v-b');
  await sleep(100);
  const upB = upOf(upConns.length - 1);
  const A = await viewer(R.port, '/api/desktop/xp/stream', 'v-a');
  await sleep(100);
  const upA = upOf(upConns.length - 1);
  const m0 = await mem();
  const sent = await stream(A.ws, Buffer.concat([hdr2g(), Buffer.alloc(MiB, 0x42)]), 96);
  await sleep(300);
  const m1 = await mem();
  const dAb = (m1.ab - m0.ab) / MiB, dRss = (m1.rss - m0.rss) / MiB;
  ok(`the viewer declaring 2 GiB is closed ${DS.OVERSIZE_CLOSE} ${DS.OVERSIZE_REASON} (it got ${sent} chunk(s) out before the close reached it)`, A.st.code === 1009 && A.st.reason === 'packet-too-large' && sent < 96, A.st);
  ok('judged in its FIRST chunk: the warn line names the 2 GiB declared and only that chunk held (1 MiB + the header)', R.blog.some((l) => /^W \[desktop-stream\] xp: viewer v-a sent an oversized xpra message \(packet header declared 2147483648 B, 1048584 B held, the cap is 16777216 B\) — closed 1009 packet-too-large; the xpra server and the other viewers are untouched/.test(l)), R.blog.filter((l) => /^W /.test(l)));
  ok(`memory stays bounded while it streams: arrayBuffers ${dAb >= 0 ? '+' : ''}${dAb.toFixed(1)} MiB, rss ${dRss >= 0 ? '+' : ''}${dRss.toFixed(1)} MiB (< 64 MB each)`, dAb < 64 && dRss < 64, { m0, m1 });
  ok('stats().oversize counts it; nothing of it reached the xpra server', R.br.stats().oversize === 1 && upA.got.length === 0, { stats: R.br.stats(), upA: upA.got.length });
  await sleep(100);
  ok('the close line names it', R.blog.some((l) => /xp: closed \(packet-too-large: packet header declared 2147483648 B/.test(l)), R.blog.filter((l) => /closed/.test(l)));
  ok('its OWN upstream connection closed with it (as any viewer\'s close does); the other viewer\'s is open', upA.closed && !upB.closed);
  B.ws.send(pkt('ping_echo'));
  upB.c.send(pkt('draw'));
  await sleep(150);
  ok('the other viewer keeps its picture: its ping_echo reaches xpra and xpra\'s draw reaches it', upB.got.some((g) => g.equals(pkt('ping_echo'))) && B.st.back.some((g) => g.equals(pkt('draw'))) && B.ws.readyState === 1);
  // one WebSocket MESSAGE over the cap: the ws library's own limit (the default 100 MiB would all be buffered first)
  const C = await viewer(R.port, '/api/desktop/xp/stream', 'v-c');
  await sleep(50);
  const cBig = Buffer.alloc(DS.WS_MAX_MESSAGE_BYTES + 1);
  C.ws.send(cBig);
  const tC = Date.now(); while (C.st.code === null && Date.now() - tC < 5000) await sleep(20);
  ok(`one WebSocket message of ${cBig.length} B (over ${DS.WS_MAX_MESSAGE_BYTES}) is closed 1009 by the ws layer, named and counted`, C.st.code === 1009 && R.br.stats().oversize === 2 && R.blog.some((l) => /^W .*xp: viewer v-c sent one WebSocket message over 16777224 B \(xpra\) — closed 1009 packet-too-large/.test(l)), { code: C.st.code, stats: R.br.stats() });
  // the rfb bridge: ClientCutText is the one message whose length the client declares
  const D2 = await viewer(R.port, '/api/vnc', 'v-d');
  const cut = Buffer.alloc(8); cut[0] = 6; cut.writeInt32BE(2 ** 31 - 1, 4);
  const sentD = await stream(D2.ws, Buffer.concat([Buffer.from('RFB 003.008\n'), Buffer.from([1, 1]), cut, Buffer.alloc(MiB, 0x61)]), 32);
  const tD = Date.now(); while (D2.st.code === null && Date.now() - tD < 5000) await sleep(20);
  ok(`rfb: a ClientCutText DECLARING 2 GiB closes that viewer 1009 packet-too-large (${sentD} chunk(s) out), named`, D2.st.code === 1009 && D2.st.reason === 'packet-too-large' && R.br.stats().oversize === 3 && R.blog.some((l) => /desktop-singleton: viewer v-d sent an oversized rfb message \(ClientCutText declared 2147483647 B, the cap is 16777216 B\)/.test(l)), { code: D2.st.code, stats: R.br.stats(), w: R.blog.filter((l) => /^W /.test(l)) });
  ok('…and the xpra viewer beside it is still open', B.ws.readyState === 1);
  B.ws.close(); await sleep(50); await R.close();

  // CONTROL: the same bridge WITHOUT the cap (the two constants patched to Infinity — the r6 sieve held every byte)
  const src = fs.readFileSync(path.join(repo, 'src/server/desktop-stream.js'), 'utf8');
  const from1 = 'const XPRA_MAX_PACKET_BYTES = 16 * 1024 * 1024;', from2 = 'const RFB_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;';
  ok('each cap is spelled once (the control patches exactly them)', src.split(from1).length === 2 && src.split(from2).length === 2);
  const mfile = path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-kacap.js`);
  fs.writeFileSync(mfile, src.replace(from1, 'const XPRA_MAX_PACKET_BYTES = Infinity; // pre-fix').replace(from2, 'const RFB_MAX_MESSAGE_BYTES = Infinity; // pre-fix'));
  process.on('exit', () => { try { fs.unlinkSync(mfile); } catch {} });
  try {
    const Rc = await rig(require(mfile));
    const Ac = await viewer(Rc.port, '/api/desktop/xp/stream', 'v-a');
    await sleep(100);
    const c0 = await mem();
    const sentC = await stream(Ac.ws, Buffer.concat([hdr2g(), Buffer.alloc(MiB, 0x42)]), 96);
    await sleep(300);
    const c1 = await mem();
    const cAb = (c1.ab - c0.ab) / MiB;
    ok(`CONTROL: without the cap the same viewer streams all ${sentC} chunks, stays OPEN and the bridge holds +${cAb.toFixed(1)} MiB (arrayBuffers) — the reproduced growth`, sentC === 97 && Ac.ws.readyState === 1 && cAb > 80 && Rc.br.stats().oversize === 0, { sentC, cAb, state: Ac.ws.readyState });
    Ac.ws.close(); await sleep(100); await Rc.close();
  } finally { try { fs.unlinkSync(mfile); } catch {} }
  for (const s of tcpHeld) s.destroy();
  rfbSrv.close(); up.close();
}

for (const s of held) s.destroy();
vnc.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
