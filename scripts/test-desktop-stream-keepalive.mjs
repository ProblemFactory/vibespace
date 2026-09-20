#!/usr/bin/env node
// The desktop stream bridge KEEPS ITS SOCKET ALIVE AND NAMES ITS CLOSE (2.369.118,
// userW's "Desktop disconnected" that left no evidence in any log): an RFB
// stream over a static screen carries no bytes for minutes and a proxy on the
// way drops a silent WebSocket; the bridge now pings every `pingMs`, terminates
// a peer silent for two rounds, and logs open + close (who, after how long,
// bytes each way). Real ws client + a real TCP "VNC server" that just holds the
// socket — no chrome, ~1s. Run: node scripts/test-desktop-stream-keepalive.mjs
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

for (const s of held) s.destroy();
vnc.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
