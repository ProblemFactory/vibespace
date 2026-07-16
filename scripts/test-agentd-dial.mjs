#!/usr/bin/env node
// Transport B e2e (dial-out, M4-lite): a daemon behind "NAT" dials OUT to the
// server over websocket (hand-rolled zero-dep client in the bundle); the
// server speaks the normal mux protocol over the incoming ws. Proves:
// upgrade-gate by dial token, hello/vsht_ auth inside the mux, a pipe session
// over the dialed transport, and AUTO-REDIAL after the ws drops (the NAT'd
// device keeps itself reachable). Throwaway roots; a minimal in-test server
// stands in for server.js's endpoint (same adapter logic).
// Run: node scripts/test-agentd-dial.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dial-'));
const AGENTD_ROOT = path.join(tmp, 'agentd');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// build + install the daemon into the throwaway root, provision device token
const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo });
const instDir = path.join(AGENTD_ROOT, version); fs.mkdirSync(instDir, { recursive: true });
fs.copyFileSync(bundle, path.join(instDir, 'agentd.js'));
fs.symlinkSync(instDir, path.join(AGENTD_ROOT, 'current'));
const stateDir = path.join(AGENTD_ROOT, 'state'); fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const HOST_TOKEN = 'vsht_dial' + crypto.randomBytes(6).toString('hex');
const DIAL_TOKEN = 'vsdt_' + crypto.randomBytes(8).toString('hex');
let expectedDialToken = DIAL_TOKEN; // rotated by the re-pair scenario
fs.writeFileSync(path.join(stateDir, 'token'), HOST_TOKEN, { mode: 0o600 });

// ── minimal dial-in server (the server.js endpoint logic, ws lib) ──
const { WebSocketServer } = require('ws');
const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');
const dialWss = new WebSocketServer({ noServer: true });
let incoming = [];      // resolved streams
let waiters = [];
const httpSrv = http.createServer((req, res) => { res.writeHead(404); res.end(); });
httpSrv.on('upgrade', (req, socket, head) => {
  const tok = String(req.headers['x-vibespace-dial-token'] || '');
  if (tok !== expectedDialToken) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  dialWss.handleUpgrade(req, socket, head, (ws) => {
    const listeners = { data: [], close: [], error: [] };
    ws.on('message', (d) => { if (process.env.DIAL_DEBUG) console.log('[srv] msg', (Buffer.isBuffer(d)?d:Buffer.from(d)).length); listeners.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))); });
    ws.on('close', () => listeners.close.forEach((f) => f()));
    const stream = {
      write: (d) => { try { ws.send(d); return true; } catch { return false; } },
      on: (ev, fn) => { listeners[ev]?.push(fn); },
      destroy: () => { try { ws.close(); } catch { } },
      _ws: ws,
      _tok: tok, // which dial token this connection presented (rotation assertions)
    };
    // hand to a waiter if any; queue ONLY otherwise (pushing to both made a
    // later nextDial() pop the already-consumed FIRST stream — its corpse —
    // instead of the fresh redial; test-harness bug, product was fine)
    const w = waiters.shift();
    if (w) w(stream); else incoming.push(stream);
  });
});
await new Promise((r) => httpSrv.listen(0, '127.0.0.1', r));
const PORT = httpSrv.address().port;
const nextDial = () => new Promise((r) => { if (incoming.length) r(incoming.shift()); else waiters.push(r); });

console.log('— daemon dials OUT to the server (hand-rolled ws client) —');
const daemon = spawn(process.execPath, [
  path.join(AGENTD_ROOT, 'current', 'agentd.js'),
  '--dial', `ws://127.0.0.1:${PORT}/api/agentd-dial?device=devA`,
  '--dial-token', DIAL_TOKEN,
], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: AGENTD_ROOT } });
daemon.unref();
const stream1 = await Promise.race([nextDial(), sleep(8000).then(() => null)]);
check('device dialed in through the ws endpoint', !!stream1, '');

console.log('— normal mux handshake + pipe session OVER the dialed transport —');
const sessions = new Map();
let CHAN = 2;
const conn = await new Promise((resolve, reject) => {
  const mux = new Mux(stream1, {
    onControl: (m) => {
      if (m.op === 'hello-ack') resolve({ mux });
      else if (m.op === 'auth-fail') reject(new Error('auth-fail'));
      else if (m.op === 'pipe-session-open') sessions.get(m.chan)?.onOpen?.(m);
      else if (m.op === 'session-error') sessions.get(m.chan)?.onError?.(m.error);
    },
    onData: (chan, buf) => { sessions.get(chan)?.onData?.(buf); conn?.mux?.credit?.(chan, buf.length) ?? mux.credit(chan, buf.length); },
    onDead: () => {},
  });
  mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: HOST_TOKEN });
  setTimeout(() => reject(new Error('handshake timeout')), 5000);
});
check('hello/vsht_ auth over the dialed ws', !!conn, '');

const STUB = 'let n=0;const t=setInterval(()=>{console.log("D"+n);n++;if(n>=10){clearInterval(t);setTimeout(()=>process.exit(0),150)}},60);';
let out = Buffer.alloc(0);
const chan = CHAN++;
const ready = new Promise((res, rej) => sessions.set(chan, { onOpen: res, onError: (e) => rej(new Error(e)), onData: (b) => { out = Buffer.concat([out, b]); } }));
conn.mux.control({ op: 'open-pipe-session', chan, sid: 'dial-1', cmd: process.execPath, args: ['-e', STUB], offset: 0 });
await ready;
await sleep(1500);
const nums = [...out.toString().matchAll(/D(\d+)/g)].map((m) => +m[1]);
check('pipe session output flows over the dialed transport', nums.length === 10 && nums.every((v, i) => v === i), JSON.stringify(nums));
check('exit sentinel over the dialed transport', out.toString().includes('"_remote_exit"'), '');

console.log('— drop the ws: the device AUTO-REDIALS (NAT keepalive model) —');
stream1.destroy();
const stream2 = await Promise.race([nextDial(), sleep(10000).then(() => null)]);
check('device re-dialed after the drop (backoff loop)', !!stream2, '');
if (stream2) {
  const conn2 = await new Promise((resolve, reject) => {
    const mux = new Mux(stream2, {
      onControl: (m) => { if (m.op === 'hello-ack') resolve({ mux }); else if (m.op === 'auth-fail') reject(new Error('auth-fail')); },
      onDead: () => {},
    });
    mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: HOST_TOKEN });
    setTimeout(() => reject(new Error('timeout')), 5000);
  }).catch(() => null);
  check('fresh handshake on the re-dialed transport', !!conn2, '');
  if (!conn2 && process.env.DIAL_DEBUG) { try { console.log('[dbg] daemon log:\n' + fs.readFileSync(path.join(stateDir, 'agentd.log'), 'utf8')); } catch {} }
  conn2?.mux?.destroy();
}

console.log('— wrong dial token is refused at the upgrade gate —');
{
  const wsMin = require('../src/agentd/ws-min.js');
  const refused = await new Promise((r) => {
    const ws = wsMin.connect(`ws://127.0.0.1:${PORT}/api/agentd-dial?device=devA`, { headers: { 'x-vibespace-dial-token': 'vsdt_WRONG' } });
    ws.on('close', () => r(true));
    ws.on('open', () => r(false));
    setTimeout(() => r('timeout'), 4000);
  });
  check('bad dial token rejected before any protocol runs', refused === true, String(refused));
}

console.log('— re-pair identity rotation: daemon adopts rewritten dial.json + token LIVE (walter case) —');
{
  const DIAL_TOKEN2 = 'vsdt_' + crypto.randomBytes(8).toString('hex');
  const HOST_TOKEN2 = 'vsht_rot' + crypto.randomBytes(6).toString('hex');
  // device side: exactly what a re-pair installer writes (no daemon restart!)
  fs.writeFileSync(path.join(stateDir, 'dial.json'), JSON.stringify({ url: `ws://127.0.0.1:${PORT}/api/agentd-dial?device=devA`, token: DIAL_TOKEN2 }), { mode: 0o600 });
  fs.writeFileSync(path.join(stateDir, 'token'), HOST_TOKEN2, { mode: 0o600 });
  // server side: only the new pairing is accepted from now on
  expectedDialToken = DIAL_TOKEN2;
  // drop every existing link — the daemon must come back with the NEW identity
  incoming.splice(0).forEach((st) => { try { st.destroy(); } catch {} });
  await sleep(400);
  incoming.splice(0).forEach((st) => { try { st.destroy(); } catch {} });
  let stream3 = null;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const st = await Promise.race([nextDial(), sleep(Math.max(500, deadline - Date.now())).then(() => null)]);
    if (!st) break;
    if (st._tok === DIAL_TOKEN2) { stream3 = st; break; }
    try { st.destroy(); } catch {} // stale in-flight old-token dial — reject and keep waiting
  }
  check('daemon adopted the ROTATED dial token from disk (re-pair heals a running daemon)', !!stream3, '');
  if (stream3) {
    const conn3 = await new Promise((resolve, reject) => {
      const mux = new Mux(stream3, {
        onControl: (m) => { if (m.op === 'hello-ack') resolve({ mux }); else if (m.op === 'auth-fail') reject(new Error('auth-fail')); },
        onDead: () => {},
      });
      mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: HOST_TOKEN2 });
      setTimeout(() => reject(new Error('timeout')), 5000);
    }).catch(() => null);
    check('hello with the ROTATED host token (per-hello fresh read, no restart)', !!conn3, '');
    conn3?.mux?.destroy();
  }
}

// cleanup
try { const dpid = Number(fs.readFileSync(path.join(stateDir, 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
httpSrv.close();
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
if (process.env.KEEP_TMP) console.log('tmp:', tmp); else fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd DIAL-OUT tests passed');
process.exit(0);
