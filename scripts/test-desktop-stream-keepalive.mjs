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
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The no-cap control's patched bridge is written OUTSIDE the tree
// (scripts/mutant-copy.mjs, `require` re-bound to the real path); the tree
// census at the end measures that while it exists (it used to be
// src/server/vs-dak-mut-<pid>-kacap.js).
const MUTK = mutantCopies('dka', repo);

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

async function slowReaderLeg(DSmod, PING6 = 300) {
  // THE MEASUREMENT (K1): the bridge's keepalive is a WebSocket PROTOCOL ping (ws.ping(); the browser's network
  // stack answers it, a hidden tab's timers never touch it). What delays the pong is the QUEUE: the RFB side pushes
  // into ws (up to WS_HIGH_WATER = 8 MiB before it pauses), a ping frame is queued BEHIND those bytes, and on a slow
  // link (8 MiB at ~150 KB/s ≈ 55 s) the pong cannot come back inside two rounds — a live, reading browser was cut.
  // Here: a "VNC server" that floods, a TCP relay that hands the bridge's bytes to the browser at a THROTTLED rate,
  // a real ws client that answers pings (autoPong) and reads everything it receives.
  const flood = net.createServer((s) => { s.write('RFB 003.008\n'); const chunk = Buffer.alloc(64 * 1024, 7); let n = 0; const pump = () => { while (n < 160 && s.write(chunk)) n++; if (n < 160) s.once('drain', pump); }; pump(); });
  await new Promise((r) => flood.listen(0, '127.0.0.1', r));
  const fport = flood.address().port;
  const logs6 = [];
  // a round long against the relay's pacing (one 64 KiB chunk at RATE = 125 ms) — production rounds are 20 s
  const SILENT = DS.SILENT_ROUNDS_TO_CUT;
  const ds6 = DSmod.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'rfb', port: fport }), log: { log: (m) => logs6.push(m), warn: (m) => logs6.push(m) }, pingMs: PING6 });
  const srv6 = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  srv6.on('upgrade', (req, socket, head) => ds6.handleUpgrade(req, socket, head, ds6.upgradeId(new URL(req.url, 'http://x').pathname)));
  await new Promise((r) => srv6.listen(0, '127.0.0.1', r));
  // the slow link: client → relay → bridge; bridge → relay is read at RATE bytes/s (pause/resume), so TCP backpressure
  // reaches the bridge's socket exactly as a slow WAN would
  const RATE = 512 * 1024; // 512 KiB/s — slower than the 10 MiB the flood offers
  const relays = []; let pathDead = false;
  const relay = net.createServer((c) => {
    const b = net.connect(srv6.address().port, '127.0.0.1');
    relays.push(c, b);
    c.pipe(b);
    b.on('data', (d) => { if (pathDead) return; c.write(d); b.pause(); setTimeout(() => { if (!pathDead) b.resume(); }, Math.ceil((d.length / RATE) * 1000)); });
    c.on('data', () => { }); // (the client's pongs ride c.pipe(b) until the path dies)
    b.on('close', () => c.destroy()); c.on('close', () => b.destroy()); b.on('error', () => { }); c.on('error', () => { });
  });
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${relay.address().port}/api/vnc`);
  let got = 0, closed = null, pings = 0;
  // like noVNC: after every update it draws it asks for the next one (FramebufferUpdateRequest, 10 bytes)
  let sinceAsk = 0; const FBU_REQ = Buffer.from([3, 1, 0, 0, 0, 0, 7, 128, 4, 56]);
  ws.on('message', (m) => { got += m.length; sinceAsk += m.length; if (sinceAsk >= 64 * 1024) { sinceAsk = 0; try { ws.send(FBU_REQ); } catch { } } });
  ws.on('ping', () => { pings++; });
  ws.on('close', (code) => { closed = code; });
  await new Promise((r) => ws.on('open', r));
  await sleep(PING6 * 12);
  const cutLine = logs6.find((l) => /closed \(no pong/.test(l));
  const live = { cut: !(closed === null && ws.readyState === 1 && !cutLine && got > 0), got, pings, cutLine };
  // …and the same socket, once the browser stops acknowledging anything (the relay stops reading AND stops relaying
  // pongs — a dead path), IS cut and named
  pathDead = true; for (const r of relays) { try { r.unpipe(); r.pause(); } catch { } }
  const cutAt = Date.now();
  for (let i = 0; i < 40 && !logs6.some((l) => /closed \(no pong/.test(l)); i++) await sleep(PING6);
  const dead = logs6.find((l) => /closed \(no pong/.test(l));
  const deadR = { named: !!dead && /nothing acknowledged/.test(dead), inTime: Date.now() - cutAt <= (SILENT + 2) * PING6, dead, waitedMs: Date.now() - cutAt };
  try { ws.terminate(); } catch { }
  for (const r of relays) { try { r.destroy(); } catch { } }
  relay.close(); srv6.close(); flood.close();
  return { live, dead: deadR };
}

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
  const line = logs.slice(before).find((l) => /closed \(no pong for 120 ms and nothing acknowledged\)/.test(l));
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

console.log('§6 lane desktop-keepalive (userW inc-muoshmqn-dect, "no pong for 40000 ms" ×6 in 12 h): a SLOW but LIVE browser behind a full send queue is never cut — its pong waits behind the bytes it is still reading; a socket that acknowledges NOTHING still is');
{
  const RATE = 512 * 1024;
  const r = await slowReaderLeg(DS);
  ok(`a live browser reading at ${RATE / 1024} KiB/s behind a full queue (it asks for the next update as noVNC does) is NOT cut after 12 rounds (read ${Math.round(r.live.got / 1024)} KiB, ${r.live.pings} pings seen — they wait in the queue)`, !r.live.cut, r.live);
  ok(`a path that acknowledges nothing (no pong, no bytes from the browser, no progress) is cut and NAMED within ${DS.SILENT_ROUNDS_TO_CUT} + 1 rounds`, r.dead.named && r.dead.inTime, r.dead);
  // CONTROL: the pre-lane rule (a pong or nothing) on the same path cuts the live reader — the bug, reproduced
  // the rule lives in src/ws-keepalive.js since the 2.369.202 integration (THE ONE keepalive both bridges arm, lane
  // stream-ping): the control patches IT and loads a bridge copy that requires the patched copy
  const fsm = await import('node:fs');
  const kaSrc = fsm.readFileSync(path.join(repo, 'src/ws-keepalive.js'), 'utf8');
  const src = fsm.readFileSync(path.join(repo, 'src/server/desktop-stream.js'), 'utf8');
  const needle = "  if (pong || Number(inbound) > 0) return 'alive';\n  if (Number(queuedBefore) > 0 && Number(wroteNow) > Number(wroteBefore)) return 'draining';";
  const kaReq = "require('../ws-keepalive.js')";
  ok('control: the liveness rule\'s needle is in the shipped source (src/ws-keepalive.js), and the bridge requires it once', kaSrc.includes(needle) && src.split(kaReq).length === 2);
  const kaOld = MUTK.write('src/ws-keepalive.js', kaSrc.replace(needle, "  if (pong) return 'alive';"), 'pong-only-ka');
  const OLD = MUTK.load('src/server/desktop-stream.js', src.replace(kaReq, `require(${JSON.stringify(kaOld)})`), 'pong-only');
  const rc = await slowReaderLeg(OLD);
  ok('CONTROL: the pong-only rule (2.369.118\'s) CUTS the same live reader — the 40 s cuts of the incident, reproduced', rc.live.cut, rc.live);
  // the rule as a table
  const V = DS.livenessVerdict;
  ok('livenessVerdict: a pong ⇒ alive; bytes from the browser ⇒ alive; kernel progress through a backlog ⇒ draining; progress with NO backlog (our own small write) ⇒ silent; nothing ⇒ silent',
    V({ pong: true }) === 'alive' && V({ inbound: 3 }) === 'alive' && V({ queuedBefore: 5e6, wroteBefore: 10, wroteNow: 20 }) === 'draining' && V({ queuedBefore: 0, wroteBefore: 10, wroteNow: 12 }) === 'silent' && V({ queuedBefore: 5e6, wroteBefore: 10, wroteNow: 10 }) === 'silent' && V({}) === 'silent');
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
  const mfile = MUTK.write('src/server/desktop-stream.js', src.replace(from1, 'const XPRA_MAX_PACKET_BYTES = Infinity; // pre-fix').replace(from2, 'const RFB_MAX_MESSAGE_BYTES = Infinity; // pre-fix'), 'kacap');
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
  } finally { /* MUTK's scratch dir is removed at exit */ }
  for (const s of tcpHeld) s.destroy();
  rfbSrv.close(); up.close();
}

for (const s of held) s.destroy();
vnc.close(); srv.close();

// ── design 014 D1 (lane desktop-vnc-native): a Windows / macOS machine's WHOLE DESKTOP through the REAL access layer
// (src/server/desktop-access.js) and the REAL bridge — the machine is a fake device whose tcpForward pipes into a FAKE
// RFB server on this host (VNC auth, ARD auth); nothing contacts a real machine ──
console.log('\n§D014 a machine\'s whole desktop: fake VNC-auth and ARD-auth servers behind a fake tcpForward');
{
  const ACC = require(path.join(repo, 'src/server/desktop-access.js'));
  const A = require(path.join(repo, 'src/desktop-apps.js'));
  const crypto = require('crypto');
  const fs = require('fs');
  const PASSWORD = 'Sekr3t!x';
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };
  const SERVER_INIT = Buffer.concat([Buffer.from([0x05, 0x00, 0x03, 0x20]), Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0]), u32(7), Buffer.from('Mac-one')]);
  /** The server half of the handshake: version → types → the auth exchange (any answer accepted) → OK → ServerInit. */
  function fakeRfb(kind) {
    const seen = { conns: 0, closed: 0, fromClient: [], sockets: [] };
    const server = net.createServer((s) => {
      seen.conns++; seen.sockets.push(s);
      let stage = 0, buf = Buffer.alloc(0);
      s.on('error', () => { });
      s.on('close', () => { seen.closed++; });
      s.write(kind === 'ard' ? 'RFB 003.889\n' : 'RFB 003.008\n');
      s.on('data', (d) => {
        seen.fromClient.push(Buffer.from(d)); buf = Buffer.concat([buf, d]);
        if (stage === 0 && buf.length >= 12) { buf = buf.subarray(12); stage = 1; s.write(Buffer.from(kind === 'ard' ? [1, 30] : [1, 2])); }
        if (stage === 1 && buf.length >= 1) { buf = buf.subarray(1); stage = 2; s.write(kind === 'ard' ? Buffer.concat([Buffer.from([0, 2, 0, 16]), Buffer.alloc(16, 7), Buffer.alloc(16, 9)]) : Buffer.alloc(16, 5)); }
        const need = kind === 'ard' ? 128 + 16 : 16;
        if (stage === 2 && buf.length >= need) { buf = buf.subarray(need); stage = 3; s.write(u32(0)); }
        if (stage === 3 && buf.length >= 1) { buf = buf.subarray(1); stage = 4; s.write(SERVER_INIT); }
      });
    });
    return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen })));
  }
  /** A fake paired device: `platform`, a link that can drop, tcp-connect to 127.0.0.1:<port> of this host. */
  function fakeDevice(platform) {
    const chans = new Set();
    const dm = {
      up: true, opened: 0,
      status: () => ({ connected: dm.up, info: dm.up ? { platform, capabilities: ['desktop-serve'] } : null }),
      desktopServe: async () => ({ ok: true }),
      tcpForward: async (port) => {
        if (!dm.up) throw new Error('link down');
        const sock = net.connect({ host: '127.0.0.1', port });
        await new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); });
        dm.opened++;
        const h = { onData: null, onClose: null, write: (b) => sock.write(b), close: () => { chans.delete(h); sock.destroy(); } };
        sock.on('data', (b) => h.onData?.(b)); sock.on('close', () => { chans.delete(h); h.onClose?.(); }); sock.on('error', () => { });
        chans.add(h); return h;
      },
      /** the link drops the way src/agentd/client.js drops it: every channel's onClose, THEN disconnected */
      drop: () => { for (const h of [...chans]) { chans.delete(h); try { h.onClose?.(); } catch { } } dm.up = false; },
    };
    return dm;
  }
  const vncSrv = await fakeRfb('vnc'), ardSrv = await fakeRfb('ard');
  const win = fakeDevice('win32'), mac = fakeDevice('darwin'), lin = fakeDevice('linux');
  const hosts = (map) => ({ get: (h) => (map[h] ? { id: h } : null), isLocal: (h) => !h || h === 'local', deviceBounded: async (h) => { if (!map[h]) throw new Error('unknown'); return map[h]; }, list: () => Object.keys(map).map((id) => ({ id, name: id, transport: 'dial', online: true })), linkState: () => 'online', connectedDevice: (h) => (map[h] && map[h].up ? map[h] : null) });
  const accLogs = [];
  const aLog = { log: (m) => accLogs.push(String(m)), warn: (m) => accLogs.push(String(m)) };
  // ONE port for the fake 5900 per layer: the Windows box answers VNC auth, the Mac ARD (two layers, two fake ports)
  const accW = ACC.create({ hosts: hosts({ 'win-a': win, 'lin-a': lin }), install: false, log: aLog, vncPort: vncSrv.port, probeMs: 1500 });
  const accM = ACC.create({ hosts: hosts({ 'mac-a': mac }), install: false, log: aLog, vncPort: ardSrv.port, probeMs: 1500 });
  const accOf = (id) => (A.machineDesktopHost(id) === 'mac-a' ? accM : accW);
  const bLogs = [];
  const bLog = { log: (m) => bLogs.push(String(m)), warn: (m) => bLogs.push(String(m)) };
  const mkBridge = (DSmod, opts = {}) => DSmod.create({ auth: { requestAuthed: () => true }, log: bLog, pingMs: 5000,
    resolveTarget: (id) => accOf(id).machineDesktopTarget(id), forwardPort: (h, p) => (h === 'mac-a' ? accM : accW).forwardPort(h, p), ...opts });
  const bridge = mkBridge(DS, { upstreamWhy: (id) => accOf(id).machineDesktopGone(id) });
  const hsrv = http.createServer((q, s) => { s.statusCode = 404; s.end(); });
  let cur = bridge;
  hsrv.on('upgrade', (req, socket, head) => cur.handleUpgrade(req, socket, head, cur.upgradeId(new URL(req.url, 'http://x').pathname)));
  await new Promise((r) => hsrv.listen(0, '127.0.0.1', r));
  const hport = hsrv.address().port;
  /** A browser-side RFB client over the bridge: version, the type, the auth answer, ClientInit — then waits for ServerInit. */
  function client(id, { headers = {}, kind = 'vnc' } = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${hport}/api/desktop/${id}/stream`, { headers });
    const got = []; let status = null, stage = 0;
    ws.on('unexpected-response', (q, r) => { status = `${r.statusCode} ${r.statusMessage}`; try { q.destroy(); } catch { } ws.terminate(); });
    ws.on('error', () => { });
    ws.on('message', (m) => {
      got.push(Buffer.from(m)); const all = Buffer.concat(got);
      if (stage === 0 && all.length >= 12) { stage = 1; ws.send(Buffer.from('RFB 003.008\n')); }
      if (stage === 1 && all.length >= 14) { stage = 2; ws.send(Buffer.from([kind === 'ard' ? 30 : 2])); }
      if (stage === 2 && all.length >= (kind === 'ard' ? 50 : 30)) { stage = 3; ws.send(kind === 'ard' ? Buffer.concat([crypto.createHash('sha512').update(PASSWORD).digest(), Buffer.alloc(64, 1), Buffer.alloc(16, 2)]) : crypto.createHash('sha256').update(PASSWORD).digest().subarray(0, 16)); } // stands in for the DES / ARD answer
      if (stage === 3 && all.length >= (kind === 'ard' ? 54 : 34)) { stage = 4; ws.send(Buffer.from([1])); }
    });
    return { ws, got: () => Buffer.concat(got), status: () => status, closed: new Promise((r) => ws.on('close', (code, reason) => r({ code, reason: String(reason) }))) };
  }
  const until = async (fn, ms = 3000) => { const t = Date.now() + ms; while (Date.now() < t) { if (fn()) return true; await sleep(20); } return false; };

  // the PROBE (the launcher's question) — through tcpForward, never a new op
  const rows = await accW.machines();
  const winRow = rows.find((r) => r.hostId === 'win-a'), linRow = rows.find((r) => r.hostId === 'lin-a');
  ok('the launcher\'s rows: the Windows box probed ⇒ desktop_ready (VNC password); the Linux row carries no probe and keeps its verdict', winRow && winRow.code === 'desktop_ready' && winRow.auth === 'password' && winRow.vnc && winRow.vnc.server === '003.008' && linRow && !('vnc' in linRow) && linRow.code === 'ready', { winRow, linRow });
  const macOpen = await accM.openMachineDesktop('mac-a');
  ok('a Mac whose Screen Sharing offers ARD only ⇒ open answers auth ard (the Mac user\'s name + password)', macOpen.ok && macOpen.auth === 'ard' && macOpen.type === 30 && macOpen.id === 'machine-desktop.mac-a', macOpen);
  let linErr = null; try { await accW.openMachineDesktop('lin-a'); } catch (e) { linErr = e; }
  ok('a Linux machine is refused not_desktop_machine (its apps keep their own windows)', linErr && linErr.code === 'not_desktop_machine', linErr && linErr.message);
  const deadVnc = ACC.create({ hosts: hosts({ 'win-b': fakeDevice('win32') }), install: false, log: aLog, vncPort: 1, probeMs: 800 });
  let noVnc = null; try { await deadVnc.openMachineDesktop('win-b'); } catch (e) { noVnc = e; }
  ok('nothing listening on the machine\'s 5900 ⇒ no_vnc by name with the probe (no_listener)', noVnc && noVnc.code === 'no_vnc' && noVnc.vnc && noVnc.vnc.code === 'no_listener', noVnc && { code: noVnc.code, vnc: noVnc.vnc });

  // RELAYED: the VNC-auth handshake end to end, through the bridge and the forward
  await accW.openMachineDesktop('win-a');
  const c1 = client('machine-desktop.win-a');
  ok('VNC auth: the whole handshake is relayed — the greeting, the types [2], the challenge, OK, ServerInit with the desktop\'s name', await until(() => c1.got().length >= 34 + SERVER_INIT.length) && c1.got().subarray(34).equals(SERVER_INIT));
  // TWO WINDOWS, ONE FORWARD
  const c2 = client('machine-desktop.win-a');
  await until(() => c2.got().length >= 34 + SERVER_INIT.length);
  const fw = accW.forwards().filter((f) => f.hostId === 'win-a');
  ok('two windows on one machine share ONE hub forward (refs 2, two connections through it)', fw.length === 1 && fw[0].refs === 2 && fw[0].remotePort === vncSrv.port && fw[0].connections === 2, fw);
  // the sieve: a sign-in type it cannot follow ⇒ opaque, every later frame counted (never reaps a live person)
  const sv = DS.rfbInputSieve();
  sv.feed(Buffer.from('RFB 003.008\n')); sv.feed(Buffer.from([30]));
  const after = sv.feed(Buffer.alloc(144, 3));
  const svVnc = DS.rfbInputSieve(); svVnc.feed(Buffer.from('RFB 003.008\n')); svVnc.feed(Buffer.from([2])); const vncAfter = svVnc.feed(Buffer.alloc(16, 3));
  ok('the input sieve turns OPAQUE on ARD (type 30: every later frame counts as input) and still follows VNC auth (type 2: the 16-byte answer is not input)', after >= 1 && vncAfter === 0, { after, vncAfter });
  // ARD relayed
  await accM.openMachineDesktop('mac-a');
  const c3 = client('machine-desktop.mac-a', { kind: 'ard' });
  ok('ARD auth (Apple 3.889, type 30): the DH parameters and the 144-byte answer are relayed, then OK and ServerInit', await until(() => c3.got().length >= 54 + SERVER_INIT.length) && c3.got().subarray(54).equals(SERVER_INIT) && ardSrv.seen.fromClient.reduce((a, b) => a + b.length, 0) >= 12 + 1 + 144 + 1);
  // THE PASSWORD NEVER IN A LOG, A RECORD OR AN AUDIT LINE: the sign-in happens in the page; the hub relays bytes
  const answerHex = crypto.createHash('sha256').update(PASSWORD).digest().subarray(0, 16).toString('hex');
  const everything = JSON.stringify({ accLogs, bLogs, fw: accW.forwards(), close: bridge.lastCloseOf('machine-desktop.win-a'), stats: bridge.stats() });
  ok('the password (and the answer derived from it) appear in no hub log line, forward record or close record', !everything.includes(PASSWORD) && !everything.toLowerCase().includes(answerHex) && accLogs.length + bLogs.length > 0, { lines: accLogs.length + bLogs.length });

  // AN AGENT TOKEN IS REFUSED BY NAME — a cookie-only request (the control) passes
  const bearer = client('machine-desktop.win-a', { headers: { Authorization: 'Bearer vsst_abc123' } });
  const bc = await bearer.closed;
  ok('an agent token on the upgrade ⇒ 403 human_only, nothing relayed, the refusal named in the log', /^403 .*human_only/.test(bearer.status() || '') && bearer.got().length === 0 && bLogs.some((l) => /machine-desktop\.win-a: an agent token asked for a machine's whole desktop — refused \(human_only\)/.test(l)), { status: bearer.status(), bc });
  const tokUrl = new WebSocket(`ws://127.0.0.1:${hport}/api/desktop/machine-desktop.win-a/stream?token=vsst_x`); let tokStatus = null;
  tokUrl.on('unexpected-response', (q, r) => { tokStatus = r.statusCode; try { q.destroy(); } catch { } tokUrl.terminate(); }); tokUrl.on('error', () => { });
  await new Promise((r) => tokUrl.on('close', r));
  ok('a token in the url is refused the same way', tokStatus === 403, tokStatus);
  ok('CONTROL: the same upgrade with the cookie only is relayed (the first two windows above)', c1.ws.readyState === 1 && c2.ws.readyState === 1);
  const dsSrc = fs.readFileSync(path.join(repo, 'src/server/desktop-stream.js'), 'utf8');
  const humanLine = dsSrc.split('\n').find((l) => l.includes('if (target.humanOnly && bearerOf(req))'));
  const noHuman = MUTK.load('src/server/desktop-stream.js', dsSrc.replace(humanLine, '    // (pre-fix: no human_only rule)'), 'nohuman');
  cur = mkBridge(noHuman);
  const leak = client('machine-desktop.win-a', { headers: { Authorization: 'Bearer vsst_abc123' } });
  ok('CONTROL: a bridge copy without the human_only line relays the agent\'s socket (the rule above is what refuses it)', !!humanLine && await until(() => leak.got().length >= 12));
  leak.ws.close(); cur = bridge;
  await sleep(300); // the control's own connection on the machine closes first (counted below otherwise)

  // CLOSES, EITHER SIDE: the browser leaves ⇒ the server side closes; the server closes ⇒ the browser is told
  const closedBefore = vncSrv.seen.closed;
  c2.ws.close(1000, 'bye');
  ok('the browser closing one window closes its own connection on the machine (the other window stays)', await until(() => vncSrv.seen.closed === closedBefore + 1) && c1.ws.readyState === 1, { closedBefore, now: vncSrv.seen.closed });
  await until(() => (accW.forwards().find((f) => f.hostId === 'win-a') || {}).refs === 1);
  {
    // CONTROL: an access-layer copy without the `end` line keeps the machine-side connection of a closed window open
    const accSrc = fs.readFileSync(path.join(repo, 'src/server/desktop-access.js'), 'utf8');
    const endLine = accSrc.split('\n').find((l) => l.includes("sock.on('end', () => { try { h.close(); }"));
    const ACC0 = MUTK.load('src/server/desktop-access.js', accSrc.replace(endLine, '        // (pre-fix: half-open until the last viewer)'), 'noend');
    const w0 = fakeDevice('win32');
    const acc0 = ACC0.create({ hosts: hosts({ 'win-c': w0 }), install: false, log: aLog, vncPort: vncSrv.port, probeMs: 1500 });
    await acc0.openMachineDesktop('win-c');
    const b0 = DS.create({ auth: { requestAuthed: () => true }, log: bLog, pingMs: 5000, resolveTarget: (id) => acc0.machineDesktopTarget(id), forwardPort: (h, p2) => acc0.forwardPort(h, p2) });
    cur = b0;
    const x1 = client('machine-desktop.win-c'), x2 = client('machine-desktop.win-c');
    await until(() => x1.got().length >= 34 + SERVER_INIT.length && x2.got().length >= 34 + SERVER_INIT.length);
    const cb = vncSrv.seen.closed;
    x2.ws.close(1000, 'bye');
    await sleep(400);
    ok('CONTROL: without the `end` line the closed window\'s connection on the machine stays open until the last viewer leaves', !!endLine && vncSrv.seen.closed === cb, { cb, now: vncSrv.seen.closed });
    x1.ws.close(); await sleep(50); acc0.shutdown(); cur = bridge;
  }
  ok('…and releases its forward reference (refs 2 → 1)', (accW.forwards().find((f) => f.hostId === 'win-a') || {}).refs === 1, accW.forwards());
  const c4 = client('machine-desktop.win-a');
  await until(() => c4.got().length >= 34 + SERVER_INIT.length);
  vncSrv.seen.sockets[vncSrv.seen.sockets.length - 1].destroy();
  const c4c = await c4.closed;
  await sleep(30);
  ok('the machine\'s server closing ⇒ the browser side closes, named "the VNC server closed its socket" (server-closed)', c4c && (bridge.lastCloseOf('machine-desktop.win-a') || {}).code === 'server-closed', bridge.lastCloseOf('machine-desktop.win-a'));

  // OFFLINE MID-VIEW: the machine's link drops ⇒ the window closes NAMING it
  const c1c = c1.closed;
  win.drop();
  await c1c; await sleep(30);
  const lc = bridge.lastCloseOf('machine-desktop.win-a');
  ok('the machine going offline mid-view closes the window BY NAME: "win-a went offline" (machine-offline)', lc && lc.why === 'win-a went offline' && lc.code === 'machine-offline' && bLogs.some((l) => /machine-desktop\.win-a: closed \(win-a went offline\)/.test(l)), lc);
  ok('…and the target is gone while it is offline (a reconnect is refused 404, never a stale socket)', accW.machineDesktopTarget('machine-desktop.win-a') === null);
  // CONTROL: the same drop through a bridge without `upstreamWhy` says only "server closed"
  win.up = true;
  await accW.openMachineDesktop('win-a');
  const plain = mkBridge(DS); cur = plain;
  const c5 = client('machine-desktop.win-a');
  await until(() => c5.got().length >= 34 + SERVER_INIT.length);
  const c5c = c5.closed; win.drop(); await c5c; await sleep(30);
  ok('CONTROL: without upstreamWhy the same drop is only "server-closed" (the naming above is the new rule)', (plain.lastCloseOf('machine-desktop.win-a') || {}).code === 'server-closed', plain.lastCloseOf('machine-desktop.win-a'));
  cur = bridge;
  for (const c of [c3]) c.ws.close();
  await sleep(50);
  accW.shutdown(); accM.shutdown(); deadVnc.shutdown();
  hsrv.close(); vncSrv.server.close(); ardSrv.server.close();
  for (const s of [...vncSrv.seen.sockets, ...ardSrv.seen.sockets]) s.destroy();
}

// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTK.files, MUTK.dir, repo, { minCopies: 1 })) ok('tree: ' + r.name, r.pass, r.detail);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
