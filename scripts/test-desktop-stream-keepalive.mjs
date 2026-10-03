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
