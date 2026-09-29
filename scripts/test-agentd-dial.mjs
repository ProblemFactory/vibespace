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

console.log('— re-pair identity rotation: daemon adopts rewritten dial.json + token LIVE (userW case) —');
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

// ── lane-pairing ③ (B-7007): a REAL daemon dialing the REAL gate (src/server/dial-pairing.js gateDialUpgrade +
// a real HostManager in a scratch data dir — the server.js upgrade branch calls exactly these) with a WRONG HOST,
// then a WRONG TOKEN, then the right one: the device records WHY (state/dial-status.json + one named log line),
// the server records the refusal with the daemon's streak, THE row state reads refused → connected-after-failures,
// and the `dial-status` op answers over the live link (a daemon without the capability is refused, never asked). ──
const lockPidOf = (st) => { try { return Number(String(fs.readFileSync(path.join(st, 'agentd.lock'), 'utf8')).trim()); } catch { return 0; } };
// NEVER process.kill(0): a gone lock file reads 0 and kill(0) signals the suite's own process group (the B9 leg found
// it: the suite ended itself with 143 after its first daemon had exited and unlinked its lock)
const killDaemon = (st) => { const p = lockPidOf(st); if (p > 0) { try { process.kill(p, 'SIGTERM'); } catch { } } };
const daemonsToKill = [];
const waitFor = async (fn, ms = 20000, step = 150) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { } await sleep(step); } return null; };
console.log('— lane-pairing ③: a real daemon vs the REAL dial gate — wrong host, wrong token, then right —');
{
  const DF = require('../src/dial-facts.js');
  const { HostManager } = require('../src/hosts.js');
  const dataB = path.join(tmp, 'server-b', 'data'); fs.mkdirSync(dataB, { recursive: true });
  const H = new HostManager({ dataDir: dataB });
  const casts = [];
  const HOST_B = 'vsht_b' + crypto.randomBytes(6).toString('hex');
  const DP = require('../src/server/dial-pairing.js').create({ rootDir: repo, AGENTD_DIR: path.join(dataB, 'agentd'), agentdHostToken: () => HOST_B,
    getHosts: () => H, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: (m) => casts.push(m) });
  H.dialOnline = (d) => DP.agentdDials.has(d);
  const wssB = new WebSocketServer({ noServer: true });
  const srvB = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  srvB.on('upgrade', (req, socket, head) => {
    const gate = DP.gateDialUpgrade(req, socket);
    if (!gate) return;
    DP.admitDial(gate.deviceId, gate.facts, socket).then((admit) => { if (!admit) return; // B9: the second gate, as server.js
    wssB.handleUpgrade(req, socket, head, (ws) => {
      const L = { data: [], close: [], error: [] };
      ws.on('message', (d) => L.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))));
      ws.on('close', () => L.close.forEach((f) => f()));
      ws.on('error', () => L.error.forEach((f) => f()));
      const stream = { write: (d) => { try { ws.send(d); return true; } catch { return false; } }, on: (ev, fn) => { L[ev]?.push(fn); }, destroy: () => { try { ws.close(); } catch { } } };
      DP.agentdDials.set(gate.deviceId, stream);
      DP.noteDialEvent(gate.deviceId, 'accepted', gate.facts);
      ws.on('close', () => { if (DP.agentdDials.get(gate.deviceId) === stream) { DP.agentdDials.delete(gate.deviceId); DP.noteDialEvent(gate.deviceId, 'disconnected', {}); } });
    });
    });
  });
  await new Promise((r) => srvB.listen(0, '127.0.0.1', r));
  const PB = srvB.address().port;
  const pair = DP.agentdMintDialPair('devB', { host: `127.0.0.1:${PB}` });
  const rowB = () => H.list().find((h) => h.deviceId === 'devB');
  check('the mint stamps the dial facts (generation 1, tokenMintedAt, the minted host)', rowB().dial.generation === 1 && rowB().dial.tokenMintedAt > 0 && rowB().dial.mintedHost === `127.0.0.1:${PB}` && pair.generation === 1, JSON.stringify(rowB().dial));
  check('a fresh pairing reads `never`', DF.dialRowState(rowB()).state === 'never', DF.dialRowState(rowB()).state);
  // the device: its own root, the host token, a WRONG HOST first
  const rootB = path.join(tmp, 'agentd-b'); const stB = path.join(rootB, 'state');
  fs.mkdirSync(stB, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stB, 'token'), HOST_B, { mode: 0o600 });
  const urlB = `ws://127.0.0.1:${PB}/api/device-dial?device=devB`;
  const dB = spawn(process.execPath, [bundle, '--dial', 'ws://nonexistent.invalid:3456/api/device-dial?device=devB', '--dial-token', pair.dialToken], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: rootB, VIBESPACE_DEVICE_ROOT: rootB } });
  dB.unref(); daemonsToKill.push(stB);
  const st1 = await waitFor(() => { const j = JSON.parse(fs.readFileSync(path.join(stB, 'dial-status.json'), 'utf8')); return j.last && j.last.code === 'dns' ? j : null; });
  check('WRONG HOST: the device records `dns` in state/dial-status.json', !!st1, JSON.stringify(st1));
  const log1 = fs.readFileSync(path.join(stB, 'agentd.log'), 'utf8');
  check('…and ONE log line names the class: "dial-out failed — dns: … ENOTFOUND nonexistent.invalid"', /dial-out failed — dns: [^\n]*ENOTFOUND nonexistent\.invalid[^\n]*\(attempt \d+, retry in \d+ms\)/.test(log1), log1.split('\n').filter((l) => /dial-out/.test(l)).slice(-2).join(' | '));
  check('…and the server heard nothing (a dial that never arrived is not a refusal)', !rowB().dial.lastRefusal && DF.dialRowState(rowB()).state === 'never');
  // WRONG TOKEN (the command generated before the current one): the server refuses BY NAME
  fs.writeFileSync(path.join(stB, 'dial.json'), JSON.stringify({ url: urlB, token: 'vsdt_' + 'f'.repeat(36) }), { mode: 0o600 });
  const st2 = await waitFor(() => { const j = JSON.parse(fs.readFileSync(path.join(stB, 'dial-status.json'), 'utf8')); return j.last && j.last.code === 'refused-token-mismatch' ? j : null; });
  check('WRONG TOKEN: the device records `refused-token-mismatch` (the server\'s 401 + X-VibeSpace-Dial-Refusal)', !!st2 && st2.last.status === 401, JSON.stringify(st2 && st2.last));
  check('…with the server\'s own sentence as the detail', !!st2 && /does not match the pairing on record for "devB"/.test(st2.last.detail), st2 && st2.last.detail);
  const log2 = fs.readFileSync(path.join(stB, 'agentd.log'), 'utf8');
  check('…and the log says "dial-out refused — token-mismatch: …"', /dial-out refused — token-mismatch: the dial token does not match/.test(log2));
  const ref = await waitFor(() => (rowB().dial.lastRefusal ? rowB().dial.lastRefusal : null), 5000);
  check('the server keeps the refusal: hosts.json dial.lastRefusal.code token-mismatch, the daemon\'s streak as `attempt`, its previous failure', !!ref && ref.code === 'token-mismatch' && ref.attempt >= 1 && ref.last && ref.last.code && ref.daemon, JSON.stringify(ref));
  check('THE ROW reads `refused (token mismatch)` — never a bare "offline" (attack 17)', DF.dialRowState(rowB()).state === 'refused' && DF.dialRowState(rowB()).reason === 'token-mismatch');
  check('the refusal broadcast hosts-updated (the row repaints)', casts.some((m) => m.type === 'hosts-updated'));
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataB, 'hosts.json'), 'utf8')).hosts.find((h) => h.deviceId === 'devB');
  check('…and it is on disk at once (a NEW refusal code is an urgent write)', onDisk && onDisk.dial && onDisk.dial.lastRefusal && onDisk.dial.lastRefusal.code === 'token-mismatch');
  // the RIGHT token: connected, after failures
  fs.writeFileSync(path.join(stB, 'dial.json'), JSON.stringify({ url: urlB, token: pair.dialToken }), { mode: 0o600 });
  const up = await waitFor(() => DP.agentdDials.has('devB'), 30000);
  check('RIGHT TOKEN: the device dials in', !!up);
  const acc = rowB().dial.lastAccept;
  check('the accept carries the streak: lastAccept.attempt ≥ 2 with the previous failure refused-token-mismatch', acc && acc.attempt >= 2 && acc.last && acc.last.code === 'refused-token-mismatch', JSON.stringify(acc));
  const rsC = DF.dialRowState(rowB());
  check('THE ROW reads `connected` — before that N attempts failed (token mismatch)', rsC.state === 'connected' && rsC.n >= 2 && rsC.reason === 'token-mismatch', JSON.stringify(rsC));
  const st3 = await waitFor(() => { const j = JSON.parse(fs.readFileSync(path.join(stB, 'dial-status.json'), 'utf8')); return j.last && j.last.outcome === 'connected' ? j : null; }, 5000);
  check('the device\'s file: connected, streak 0, history keeps dns + refused-token-mismatch', !!st3 && st3.streak === 0 && st3.history.some((e) => e.code === 'dns') && st3.history.some((e) => e.code === 'refused-token-mismatch'), JSON.stringify(st3 && st3.history));
  check('the file never carries a token', !fs.readFileSync(path.join(stB, 'dial-status.json'), 'utf8').includes('vsdt_'));
  check('…and the log says "dial-out connected: … (after N failed attempts)"', /dial-out connected: ws:\/\/127\.0\.0\.1:\d+\/api\/device-dial\?device=devB \(after \d+ failed attempts?\)/.test(fs.readFileSync(path.join(stB, 'agentd.log'), 'utf8')));
  // the `dial-status` op (THREE-TOUCH: the capability in the hello-ack, the reply routed by id)
  const dm = await DP.deviceForDial('devB');
  check('the hello-ack lists the dial-status capability', (dm.status().info?.capabilities || []).includes('dial-status'));
  const ds = await dm.dialStatus();
  check('the dial-status op answers the device\'s file over the live link', ds && ds.last && ds.last.outcome === 'connected' && Array.isArray(ds.history) && ds.history.length >= 3, JSON.stringify(ds && ds.last));
  // verify-r1 A5: the real daemon's run-cmd — the exit's call shape: a cut output is NAMED, the code is a number
  {
    const r1 = await dm.runCmd('sh', ['-lc', 'head -c 1500000 /dev/zero | tr "\\0" a; echo; echo TAIL'], { timeoutMs: 30000, waitMs: 40000 });
    check('a 1.5 MB stdout comes back cut to 1 MiB WITH `truncated: true` (the tail is missing and the reply says so)', r1.code === 0 && r1.truncated === true && String(r1.stdout).length === 1048576 && !String(r1.stdout).includes('TAIL'), JSON.stringify({ code: r1.code, truncated: r1.truncated, len: String(r1.stdout).length }));
    const r2 = await dm.runCmd('sh', ['-lc', 'head -c 3000000 /dev/zero | tr "\\0" b'], { timeoutMs: 30000, waitMs: 40000 });
    check('a 3 MB stdout (over the daemon\'s 2 MiB maxBuffer) answers a NUMERIC code (was the string ERR_CHILD_PROCESS_STDIO_MAXBUFFER) + truncated, not timedOut', Number.isInteger(r2.code) && r2.truncated === true && r2.timedOut === false, JSON.stringify({ code: r2.code, truncated: r2.truncated, timedOut: r2.timedOut }));
    const r3 = await dm.runCmd('sh', ['-lc', 'echo small'], { timeoutMs: 30000 });
    check('a small output: code 0, truncated false', r3.code === 0 && r3.truncated === false && r3.stdout === 'small\n', JSON.stringify(r3));
  }
  // attack 18: the device holds ANOTHER command's host token (state/token) — dialed in, every op refused ⇒ `auth-fail`
  fs.writeFileSync(path.join(stB, 'token'), 'vsht_not_this_servers_' + crypto.randomBytes(4).toString('hex'), { mode: 0o600 });
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
  DP.agentdDialDevices.clear();
  const liveStream = DP.agentdDials.get('devB');
  try { liveStream.destroy(); } catch { }
  const back = await waitFor(() => DP.agentdDials.has('devB') && DP.agentdDials.get('devB') !== liveStream, 20000);
  let authErr = null;
  if (back) { try { await DP.deviceForDial('devB'); } catch (e) { authErr = e; } }
  check('WRONG HOST KEY on the device: the hello is refused ("agentd auth failed")', !!back && authErr && /auth failed/.test(authErr.message), authErr && authErr.message);
  check('THE ROW reads `auth-fail` — dialed in, but the device refuses this server\'s key; never a plain "connected" (attack 18)', DF.dialRowState(rowB()).state === 'auth-fail', JSON.stringify(rowB().dial.lastAuthFail));
  // verify-r1 C2: the refused device KEEPS its link — no re-dial loop, the row steady at auth-fail, one line per device
  {
    const streamAF = DP.agentdDials.get('devB');
    const dialsBefore = (fs.readFileSync(path.join(stB, 'agentd.log'), 'utf8').match(/dial-out connected/g) || []).length;
    const states = {};
    for (let i = 0; i < 8; i++) { const st = DF.dialRowState(rowB()).state; states[st] = (states[st] || 0) + 1; await sleep(500); }
    const dialsAfter = (fs.readFileSync(path.join(stB, 'agentd.log'), 'utf8').match(/dial-out connected/g) || []).length;
    check('…and 4 s later the device is STILL on the same link (no re-dial loop: zero new "dial-out connected" lines)', DP.agentdDials.get('devB') === streamAF && dialsAfter === dialsBefore, `dials ${dialsBefore}→${dialsAfter}`);
    check('…the row read auth-fail the whole time — never "offline / silent" for a device that is dialed in', states['auth-fail'] === 8, JSON.stringify(states));
    const t0 = Date.now(); let e2 = null; try { await DP.deviceForDial('devB'); } catch (e) { e2 = e; }
    check('…a second op is refused at once (auth_failed, the refused stream remembered) with no second hello', e2 && e2.code === 'auth_failed' && Date.now() - t0 < 300 && (fs.readFileSync(path.join(stB, 'agentd.log'), 'utf8').match(/auth-fail from a connection/g) || []).length === 1, e2 && `${e2.code} ${Date.now() - t0}ms`);
  }
  fs.writeFileSync(path.join(stB, 'token'), HOST_B, { mode: 0o600 });
  try { DP.agentdDials.get('devB').destroy(); } catch { }
  await waitFor(async () => { if (!DP.agentdDials.has('devB')) return false; try { await DP.deviceForDial('devB'); return true; } catch { return false; } }, 20000);
  check('…the right key again: connected (a newer connect retires the auth failure)', DF.dialRowState(rowB()).state === 'connected', DF.dialRowState(rowB()).state);
  // a PROBE (the installer's --dial-check) against the live server: 200, not registered, no broadcast
  const castsBefore = casts.length;
  const probe = await new Promise((resolve) => { const out = []; const c = spawn(process.execPath, [bundle, '--dial-check', urlB, '--dial-token', pair.dialToken], { env: { ...process.env, VIBESPACE_AGENTD_ROOT: path.join(tmp, 'probe-root'), VIBESPACE_DEVICE_ROOT: path.join(tmp, 'probe-root') } }); c.stdout.on('data', (d) => out.push(d)); c.on('exit', (code) => resolve({ code, out: Buffer.concat(out).toString() })); });
  check('--dial-check against the live server: exit 0, "is a VibeSpace … and accepts device devB"', probe.code === 0 && /dial-check ok — 127\.0\.0\.1:\d+ is a VibeSpace [\d.]+ and accepts device "devB"/.test(probe.out), JSON.stringify(probe));
  check('…the probe registered nothing (no hosts-updated, the live link unchanged) and stamped lastProbeAt (attack 22)', casts.length === castsBefore && DP.agentdDials.has('devB') && rowB().dial.lastProbeAt > 0);
  // a daemon WITHOUT the capability (a patched bundle — an older agent) is never asked: host_needs_daemon, fast
  killDaemon(stB);
  await waitFor(() => !DP.agentdDials.has('devB'), 10000);
  const oldBundle = path.join(tmp, 'agentd-nocap.js');
  const bsrc = fs.readFileSync(bundle, 'utf8');
  const patched = bsrc.replace(/, "dial-status"\]/, ']');
  fs.writeFileSync(oldBundle, patched);
  check('(the patched bundle drops the capability)', patched !== bsrc);
  const dOld = spawn(process.execPath, [oldBundle], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: rootB, VIBESPACE_DEVICE_ROOT: rootB } });
  dOld.unref();
  const upOld = await waitFor(() => DP.agentdDials.has('devB'), 30000);
  let err = null; const t0 = Date.now();
  if (upOld) { try { const dm2 = await DP.deviceForDial('devB'); await dm2.dialStatus(); } catch (e) { err = e; } }
  check('CONTROL: a daemon without the capability ⇒ host_needs_daemon at once (an old daemon is never asked — it would hang)', !!upOld && err && err.code === 'host_needs_daemon' && Date.now() - t0 < 3000, err ? `${err.code} ${Date.now() - t0}ms` : 'no error');
  killDaemon(stB);
  for (const d of DP.agentdDialDevices.values()) { try { d.stop(); } catch { } }
  srvB.close();
}

// ── verify-r1 C1 (2026-09-28): a REAL daemon whose upgrade never moves its reported version, against the REAL gate
// with the handshake on every dial-in (server.js's accept path) — the 2.330.0 breaker must hold ACROSS the dial
// path's rebuilt DeviceManagers (measured before the per-device ledger: 180 upgrades in 45 s, 4 pushes a second). ──
console.log('— verify-r1 C1: a never-converging device under the handshake-on-every-dial-in path is BOUNDED —');
// One run = a real pinned daemon + a real gate; `bundleSrc` is what the server SHIPS and what the daemon runs.
async function neverConverging({ tag, bundleSrc, ms }) {
  const { HostManager } = require('../src/hosts.js');
  const dataC = path.join(tmp, `server-${tag}`, 'data'); fs.mkdirSync(path.join(dataC, 'bin'), { recursive: true });
  const stuckBundle = path.join(dataC, 'bin', 'vibespace-agentd.js'); // what deviceForDial SHIPS: reports 2.300.0 forever
  const pinned = bundleSrc.replace('VERSION = process.env.VIBESPACE_AGENTD_VERSION || require_version().VERSION;', 'VERSION = "2.300.0";');
  check(`(${tag}: the shipped copy is pinned to report 2.300.0 whatever lands)`, pinned !== bundleSrc);
  fs.writeFileSync(stuckBundle, pinned);
  const HC = new HostManager({ dataDir: dataC });
  const HOST_C = 'vsht_c' + crypto.randomBytes(6).toString('hex');
  const DPC = require('../src/server/dial-pairing.js').create({ rootDir: path.join(tmp, `server-${tag}`), AGENTD_DIR: path.join(dataC, 'agentd'), agentdHostToken: () => HOST_C,
    getHosts: () => HC, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => {} });
  HC.dialOnline = (d) => DPC.agentdDials.has(d);
  const wssC = new WebSocketServer({ noServer: true });
  const srvC = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  let hellos = 0, accepts = 0;
  srvC.on('upgrade', (req, socket, head) => {
    const gate = DPC.gateDialUpgrade(req, socket);
    if (!gate) return;
    DPC.admitDial(gate.deviceId, gate.facts, socket).then((admit) => { if (!admit) return;
    wssC.handleUpgrade(req, socket, head, (ws) => {
      const L = { data: [], close: [], error: [] };
      ws.on('message', (d) => L.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))));
      ws.on('close', () => L.close.forEach((f) => f()));
      ws.on('error', () => L.error.forEach((f) => f()));
      const stream = { write: (d) => { try { ws.send(d); return true; } catch { return false; } }, on: (ev, fn) => { L[ev]?.push(fn); }, destroy: () => { try { ws.close(); } catch { } } };
      DPC.agentdDials.set(gate.deviceId, stream); accepts++;
      DPC.noteDialEvent(gate.deviceId, 'accepted', gate.facts);
      DPC.deviceForDial(gate.deviceId).then(() => { hellos++; }).catch(() => { }); // server.js: the hello NOW
      ws.on('close', () => { if (DPC.agentdDials.get(gate.deviceId) === stream) { DPC.agentdDials.delete(gate.deviceId); DPC.noteDialEvent(gate.deviceId, 'disconnected', {}); } });
    });
    });
  });
  await new Promise((r) => srvC.listen(0, '127.0.0.1', r));
  const PC = srvC.address().port;
  const pairC = DPC.agentdMintDialPair('devC', { host: `127.0.0.1:${PC}` });
  const rootC = path.join(tmp, `agentd-${tag}`); const stC = path.join(rootC, 'state');
  fs.mkdirSync(stC, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stC, 'token'), HOST_C, { mode: 0o600 });
  fs.writeFileSync(path.join(stC, 'dial.json'), JSON.stringify({ url: `ws://127.0.0.1:${PC}/api/device-dial?device=devC`, token: pairC.dialToken }), { mode: 0o600 });
  const instC = path.join(rootC, '2.300.0'); fs.mkdirSync(instC, { recursive: true });
  fs.writeFileSync(path.join(instC, 'vibespace-device.js'), pinned);
  fs.symlinkSync(instC, path.join(rootC, 'current'));
  const dC = spawn(process.execPath, [path.join(rootC, 'current', 'vibespace-device.js')], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: rootC, VIBESPACE_DEVICE_ROOT: rootC } });
  dC.unref(); daemonsToKill.push(stC);
  await sleep(ms);
  const log = fs.readFileSync(path.join(stC, 'agentd.log'), 'utf8');
  const upgrades = (log.match(/upgrade to [\d.]+ \(\d+ bytes\) begins/g) || []).length;
  const out = { upgrades, accepts, hellos, log, linked: DPC.agentdDials.has('devC'),
    acc: HC.list().find((h) => h.deviceId === 'devC')?.dial?.lastAccept,
    status: JSON.parse(fs.readFileSync(path.join(stC, 'dial-status.json'), 'utf8')) };
  for (const d of DPC.agentdDialDevices.values()) { try { d.stop(); } catch { } }
  killDaemon(stC);
  srvC.close();
  return out;
}
{
  const bsrc = fs.readFileSync(bundle, 'utf8');
  const r = await neverConverging({ tag: 'c', bundleSrc: bsrc, ms: 12000 });
  check(`a never-converging device is upgraded at most 3 times in 12 s under the handshake-on-every-dial-in path (got ${r.upgrades}, ${r.accepts} dial-ins) — the per-device ledger`, r.upgrades >= 1 && r.upgrades <= 3, `upgrades=${r.upgrades} accepts=${r.accepts}`);
  check('…and the link is then KEPT and usable (a hello completed on it, capability-gated)', r.hellos >= 1 && r.linked, `hellos=${r.hellos}`);
  // verify-r1 C3: the upgrade's re-exec ends the link ON PURPOSE — it is not a failed dial. Before the fix the old
  // process's `close` fired inside the 200 ms exit grace, upMs < 2 s ⇒ `closed-before-hello`, streak 1 written to
  // dial-status.json, and the NEW daemon's first dial-in carried attempt=1 + last=closed-before-hello ⇒ the row read
  // "connected — before that 1 attempt failed (other)" after every healthy self-upgrade.
  const dialLines = (log) => log.split('\n').filter((l) => /dial-out/.test(l)).slice(0, 4).join(' | ');
  check('C3: the re-exec\'d daemon\'s dial-in carries NO failure streak (lastAccept.attempt 0, no `last`) — a self-upgrade is not a failed attempt', !!r.acc && r.acc.attempt === 0 && !r.acc.last, JSON.stringify(r.acc));
  check('C3: the device\'s dial-status.json never records closed-before-hello for the upgrade (streak 0, history without it)', r.status.streak === 0 && !r.status.history.some((e) => e.code === 'closed-before-hello'), JSON.stringify({ streak: r.status.streak, history: r.status.history }));
  check('C3: the log says "dial-out ended — self-upgrade re-exec" (never "dial-out failed — closed-before-hello")', /dial-out ended — self-upgrade re-exec/.test(r.log) && !/dial-out failed — closed-before-hello/.test(r.log), dialLines(r.log));
  // CONTROL: the same run over a bundle whose upgrade never raises the flag — the pre-fix shape must come back
  // (closed-before-hello recorded, the next dial-in carrying attempt ≥ 1), else the three pins above prove nothing.
  const mutant = bsrc.replace('upgradeLanded = true;\n', '');
  check('(C3 control: the mutant bundle drops the flag set)', mutant !== bsrc);
  const m = await neverConverging({ tag: 'c-ctl', bundleSrc: mutant, ms: 5000 });
  check(`C3 CONTROL: without the flag the old process records closed-before-hello and the re-exec'd daemon dials in with attempt ≥ 1 (${m.upgrades} upgrades)`, m.upgrades >= 1 && m.status.history.some((e) => e.code === 'closed-before-hello') && /dial-out failed — closed-before-hello/.test(m.log) && !!m.acc && m.acc.attempt >= 1, JSON.stringify({ upgrades: m.upgrades, acc: m.acc, lines: dialLines(m.log) }));
}

// ── lane-pairing ④: a daemon under a 120-byte root on Linux listens on a SHORT rung, writes the witness, and the
// hub's local DeviceManager (the witness reader) connects and completes hello ──
// ── verify-r1 B9 (2026-09-28): TWO daemons holding ONE pairing (the same install command run on two machines; a
// home folder migrated to a new Mac carries ~/.vibespace/device@… and the launchd plist). Measured before the fix:
// every accept stopped the other's DeviceManager, whose stop() closed its stream ⇒ 31 accepts + 30 closes in 30 s,
// 63 broadcasts, both daemons logging "connected / closed-before-hello", the row flipping, nobody told. ──
console.log('— verify-r1 B9: a second daemon holding a copy of the pairing is refused BY NAME while the first answers —');
const DF9 = require('../src/dial-facts.js');
async function twoDaemons({ tag, bundleA, bundleB, run, DPmod = require('../src/server/dial-pairing.js') }) {
  const { HostManager } = require('../src/hosts.js');
  const dataD = path.join(tmp, `server-${tag}`, 'data'); fs.mkdirSync(path.join(dataD, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dataD, 'bin', 'vibespace-agentd.js'), bundleA);
  const HD = new HostManager({ dataDir: dataD });
  const HOST_D = 'vsht_d' + crypto.randomBytes(6).toString('hex');
  let casts = 0;
  const DPD = DPmod.create({ rootDir: path.join(tmp, `server-${tag}`), AGENTD_DIR: path.join(dataD, 'agentd'), agentdHostToken: () => HOST_D,
    getHosts: () => HD, getMounts: () => null, getMachineMounts: () => ({ onMachineUnpaired() {} }), getPortForwards: () => ({ onMachineUnpaired() {} }), getExitProxy: () => ({ onMachineUnpaired() {} }), bcastAll: () => { casts++; } });
  HD.dialOnline = (d) => DPD.agentdDials.has(d);
  const wssD = new WebSocketServer({ noServer: true });
  const srvD = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  let accepts = 0, closes = 0;
  srvD.on('upgrade', (req, socket, head) => {
    const gate = DPD.gateDialUpgrade(req, socket);
    if (!gate) return;
    DPD.admitDial(gate.deviceId, gate.facts, socket).then((admit) => { if (!admit) return; // exactly server.js's accept path
    wssD.handleUpgrade(req, socket, head, (ws) => {
      const L = { data: [], close: [], error: [] };
      ws.on('message', (d) => L.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))));
      ws.on('close', () => L.close.forEach((f) => f()));
      ws.on('error', () => L.error.forEach((f) => f()));
      const stream = { write: (d) => { try { ws.send(d); return true; } catch { return false; } }, on: (ev, fn) => { L[ev]?.push(fn); }, destroy: () => { try { ws.close(); } catch { } } };
      DPD.agentdDials.set(gate.deviceId, stream); accepts++;
      DPD.noteDialEvent(gate.deviceId, 'accepted', gate.facts);
      DPD.deviceForDial(gate.deviceId).catch(() => { });
      try { const old = DPD.agentdDialDevices.get(gate.deviceId); if (old && old._dialStream !== stream) { old.stop?.(); DPD.agentdDialDevices.delete(gate.deviceId); } } catch { }
      casts++;
      ws.on('close', () => { closes++; if (DPD.agentdDials.get(gate.deviceId) === stream) { DPD.agentdDials.delete(gate.deviceId); DPD.noteDialEvent(gate.deviceId, 'disconnected', {}); } casts++; });
    });
    });
  });
  await new Promise((r) => srvD.listen(0, '127.0.0.1', r));
  const PD = srvD.address().port;
  const pairD = DPD.agentdMintDialPair('mac', { host: `127.0.0.1:${PD}` });
  const roots = {};
  const spawnOne = (name, bundleSrc, token = pairD.dialToken) => {
    const root = path.join(tmp, `dev-${tag}-${name}`); const st = path.join(root, 'state'); fs.mkdirSync(st, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(st, 'token'), HOST_D, { mode: 0o600 });
    fs.writeFileSync(path.join(st, 'dial.json'), JSON.stringify({ url: `ws://127.0.0.1:${PD}/api/device-dial?device=mac`, token }), { mode: 0o600 });
    const inst = path.join(root, '1.0.0'); fs.mkdirSync(inst); fs.writeFileSync(path.join(inst, 'vibespace-device.js'), bundleSrc); fs.symlinkSync(inst, path.join(root, 'current'));
    const d = spawn(process.execPath, [path.join(root, 'current', 'vibespace-device.js')], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: root, VIBESPACE_DEVICE_ROOT: root } });
    d.unref(); daemonsToKill.push(st); roots[name] = st;
    return st;
  };
  const facts = () => ({ accepts, closes, casts, row: HD.list().find((h) => h.deviceId === 'mac'), rs: DF9.dialRowState(HD.list().find((h) => h.deviceId === 'mac')), linked: DPD.agentdDials.has('mac') });
  const logOf = (name) => { try { return fs.readFileSync(path.join(roots[name], 'agentd.log'), 'utf8'); } catch { return ''; } };
  const statusOf = (name) => { try { return JSON.parse(fs.readFileSync(path.join(roots[name], 'dial-status.json'), 'utf8')); } catch { return null; } };
  const kill = (name) => killDaemon(roots[name]);
  try { await run({ spawnOne, facts, logOf, statusOf, kill, bundleA, bundleB, DPD, PD }); }
  finally { for (const d of DPD.agentdDialDevices.values()) { try { d.stop(); } catch { } } for (const n of Object.keys(roots)) kill(n); srvD.close(); }
}
{
  const bsrc = fs.readFileSync(bundle, 'utf8');
  await twoDaemons({ tag: 'dup', bundleA: bsrc, bundleB: bsrc, run: async ({ spawnOne, facts, logOf, statusOf, kill }) => {
    spawnOne('a', bsrc);
    await sleep(3000);
    check('B9: daemon A dialed in (1 accept, the link held)', facts().accepts === 1 && facts().linked, JSON.stringify({ accepts: facts().accepts }));
    spawnOne('b', bsrc); // the copy
    await sleep(9000);
    const f = facts();
    check(`B9: 9 s later the copy has NOT replaced A — still 1 accept, 0 closes, ≤ 4 broadcasts (before: one accept + one close per second, a broadcast each)`, f.accepts === 1 && f.closes === 0 && f.casts <= 4 && f.linked, JSON.stringify({ accepts: f.accepts, closes: f.closes, casts: f.casts }));
    check('B9: the row stays `connected` with NO failure streak (lastAccept.attempt 0) and carries the duplicate note (dup.from)', f.rs.state === 'connected' && f.rs.n === 0 && !!f.rs.dup && f.rs.dup.from === '127.0.0.1', JSON.stringify({ rs: f.rs, lastAccept: f.row.dial.lastAccept }));
    check('B9: hosts.json holds dial.lastDuplicate {at, from, boot, daemon}', !!f.row.dial.lastDuplicate && /^[0-9a-f]{16}$/.test(String(f.row.dial.lastDuplicate.boot)) && !!f.row.dial.lastDuplicate.daemon, JSON.stringify(f.row.dial.lastDuplicate));
    const sb = statusOf('b');
    check('B9: the copy\'s dial-status.json says refused-duplicate-device with the server\'s sentence (401), streak climbing', !!sb && sb.last.code === 'refused-duplicate-device' && sb.last.status === 401 && /pair this machine under its own name/.test(sb.last.detail) && sb.streak >= 2, JSON.stringify(sb && sb.last));
    check('B9: …and its log says "dial-out refused — duplicate-device: pair this machine under its own name …" (never a "connected")', /dial-out refused — duplicate-device: pair this machine under its own name/.test(logOf('b')) && !/dial-out connected/.test(logOf('b')), logOf('b').split('\n').filter((l) => /dial-out/.test(l)).slice(-2).join(' | '));
    check('B9: daemon A never lost its link (no "lost" / "closed-before-hello" line)', !/dial-out (lost|failed)/.test(logOf('a')), logOf('a').split('\n').filter((l) => /dial-out/.test(l)).join(' | '));
    // A goes away ⇒ the copy is the only device left and gets in on its next attempt (its ladder is at ≤ 15 s here)
    kill('a');
    const t0 = Date.now();
    while (Date.now() - t0 < 40000 && !/dial-out connected/.test(logOf('b'))) await sleep(500);
    const g = facts();
    check(`B9: once A is gone the copy is admitted on its next attempt (${Math.round((Date.now() - t0) / 1000)} s; ≤ 35 s = its 30 s ladder + a hello)`, /dial-out connected/.test(logOf('b')) && g.accepts === 2 && g.linked, JSON.stringify({ accepts: g.accepts, waited: Date.now() - t0 }));
    check('B9: …and the row now reads connected — before that N attempts failed (another device dials in as this one), the note still on', g.rs.state === 'connected' && g.rs.n >= 2 && g.rs.reason === 'duplicate-device' && !!g.rs.dup, JSON.stringify(g.rs));
  } });
  // verify-r2 B9-r2a: the copy runs a bundle WITHOUT the boot header (an old bundle — or a stolen pairing whose
  // holder simply strips the header). r1 judged it "as before: replaced" ⇒ 9 accepts / 8 closes in 8 s, i.e. any
  // header-less client evicted the live device at will. Now it is judged by LIVENESS like any other newcomer.
  // (verify-r4 F1 / F7: the call now also states dialUrl + platform — the patch strips ONLY the boot id from it)
  const noBoot = bsrc.replace(/(dialHeadersOf\(\{[^}]*?version: VERSION), boot: BOOT_ID/, '$1');
  check('(B9-r2a: the mutant bundle sends no boot id)', noBoot !== bsrc);
  await twoDaemons({ tag: 'dupnoboot', bundleA: bsrc, bundleB: noBoot, run: async ({ spawnOne, facts, logOf }) => {
    spawnOne('a', bsrc);
    await sleep(3000);
    spawnOne('b', noBoot);
    await sleep(8000);
    const f = facts();
    check(`B9-r2a: a copy WITHOUT the boot header is refused like any duplicate while A answers — still 1 accept, 0 closes in 8 s (r1: ${'9 accepts / 8 closes'})`, f.accepts === 1 && f.closes === 0 && f.linked, JSON.stringify({ accepts: f.accepts, closes: f.closes, casts: f.casts }));
    check('B9-r2a: …its log says refused — duplicate-device, never "connected"; A never lost its link', /dial-out refused — duplicate-device/.test(logOf('b')) && !/dial-out connected/.test(logOf('b')) && !/dial-out (lost|failed)/.test(logOf('a')), logOf('b').split('\n').filter((l) => /dial-out/.test(l)).slice(-1).join(''));
  } });
  // CONTROL: the SERVER under r1's verdict ("no boot id ⇒ replace") — a closed world of patched copies (mutant-copy:
  // dial-pairing.js bound to a dial-facts.js with the old rule) — the same header-less copy brings the flap back.
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const M = mutantCopies('dialctl', repo);
    const dfSrc = fs.readFileSync(path.join(repo, 'src/dial-facts.js'), 'utf8');
    const dfMut = dfSrc.replace("if (cb && ib && cb === ib) return { action: 'replace', why: 'same-daemon' };", "if (!cb || !ib) return { action: 'replace', why: 'unknown-boot' };\n  if (cb === ib) return { action: 'replace', why: 'same-daemon' };");
    check('(B9 control: the verdict patch applies)', dfMut !== dfSrc);
    const dfPath = M.write('src/dial-facts.js', dfMut, 'r1rule', { name: 'dial-facts-r1' });
    const dpSrc = fs.readFileSync(path.join(repo, 'src/server/dial-pairing.js'), 'utf8');
    const dpMut = dpSrc.replace("const DF = require('../dial-facts.js');", `const DF = require(${JSON.stringify(dfPath)});`);
    check('(B9 control: the gate is bound to the patched verdict)', dpMut !== dpSrc);
    const DPm = M.load('src/server/dial-pairing.js', dpMut, 'r1gate');
    await twoDaemons({ tag: 'dupctl', bundleA: bsrc, bundleB: noBoot, DPmod: DPm, run: async ({ spawnOne, facts }) => {
      spawnOne('a', bsrc);
      await sleep(3000);
      spawnOne('b', noBoot);
      await sleep(8000);
      const f = facts();
      check(`B9 CONTROL: under r1's "no boot id ⇒ replace" the header-less copy evicts the first daemon and the two flap (${f.accepts} accepts, ${f.closes} closes in 8 s) — the gate can go red`, f.accepts >= 4 && f.closes >= 3, JSON.stringify({ accepts: f.accepts, closes: f.closes, casts: f.casts }));
    } });
  }
}

// ── verify-r2 B8-r2 (2026-09-28): "Generate a new command" ENDS the connected holder's link. r1 left it connected
// "until its next dial" — so a retired command's holder (an impostor, a lost laptop) stayed fully authorized until
// it chose to drop, and B9 then refused the OWNER's own device running the NEW command as the holder's duplicate
// (reproduced: 4 refusals in 9 s, the row naming the owner's device the intruder). ──
console.log('— verify-r2 B8-r2: a rotation disconnects the holder NOW; the device on the new command gets in —');
{
  const bsrc = fs.readFileSync(bundle, 'utf8');
  await twoDaemons({ tag: 'rotate', bundleA: bsrc, bundleB: bsrc, run: async ({ spawnOne, facts, logOf, statusOf, DPD, PD }) => {
    spawnOne('a', bsrc); // the holder of command #1
    await sleep(3000);
    check('B8-r2: the holder dialed in on command #1', facts().accepts === 1 && facts().linked);
    const t0 = Date.now();
    const pair2 = DPD.agentdMintDialPair('mac', { host: `127.0.0.1:${PD}` }); // "Generate a new command", no in-place push
    check('B8-r2: the mint reports the holder locked out and its link is gone AT ONCE', pair2.lockedOut === true && !facts().linked && Date.now() - t0 < 200, JSON.stringify({ lockedOut: pair2.lockedOut, linked: facts().linked }));
    await sleep(4000);
    const sa = statusOf('a');
    check('B8-r2: the holder re-dialed and was refused token-mismatch (its command is retired) — never "connected" again', facts().accepts === 1 && !!sa && sa.last.code === 'refused-token-mismatch' && (logOf('a').match(/dial-out connected/g) || []).length === 1, JSON.stringify({ accepts: facts().accepts, last: sa && sa.last.code }));
    check('B8-r2: the row reads refused (token mismatch), not connected', facts().rs.state === 'refused' && facts().rs.reason === 'token-mismatch', JSON.stringify(facts().rs));
    spawnOne('b', bsrc, pair2.dialToken); // the OWNER's device on the NEW command
    const t1 = Date.now();
    while (Date.now() - t1 < 15000 && !/dial-out connected/.test(logOf('b'))) await sleep(250);
    check(`B8-r2: the device on the NEW command is admitted (${Math.round((Date.now() - t1) / 1000)} s; r1 refused it as the holder's duplicate 4× in 9 s)`, /dial-out connected/.test(logOf('b')) && facts().accepts === 2 && facts().linked && !facts().rs.dup, JSON.stringify({ accepts: facts().accepts, rs: facts().rs }));
  } });
  // CONTROL: a dial-pairing.js copy whose mint never ends the link (r1's minter) — the holder keeps its link, the
  // device on the new command is refused as its duplicate
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const M = mutantCopies('dialrot', repo);
    const dpSrc = fs.readFileSync(path.join(repo, 'src/server/dial-pairing.js'), 'utf8');
    const dpMut = dpSrc.replace('const lockedOut = keepLink === true ? false : lockOutDialHolder(deviceId);', 'const lockedOut = false;');
    check('(B8-r2 control: the no-lockout patch applies)', dpMut !== dpSrc);
    const DPm = M.load('src/server/dial-pairing.js', dpMut, 'nolockout');
    await twoDaemons({ tag: 'rotatectl', bundleA: bsrc, bundleB: bsrc, DPmod: DPm, run: async ({ spawnOne, facts, logOf, DPD, PD }) => {
      spawnOne('a', bsrc);
      await sleep(3000);
      const pair2 = DPD.agentdMintDialPair('mac', { host: `127.0.0.1:${PD}` });
      spawnOne('b', bsrc, pair2.dialToken);
      await sleep(8000);
      check(`B8-r2 CONTROL: without the lock-out the holder keeps its link and the device on the NEW command is refused as its duplicate (${facts().accepts} accept, dup note ${!!facts().rs.dup}) — the leg above goes red`, facts().accepts === 1 && facts().linked && /refused — duplicate-device/.test(logOf('b')) && !/dial-out connected/.test(logOf('b')), JSON.stringify({ accepts: facts().accepts, linked: facts().linked }));
    } });
  }
}

console.log('— lane-pairing ④: a 120-byte root — the socket rung + the witness + the hub\'s transport —');
{
  const SP = require('../src/sock-path.js');
  const base = path.join(tmp, 'r');
  const longRoot = base + '/' + 'L'.repeat(Math.max(1, 120 - base.length - 1));
  fs.mkdirSync(path.join(longRoot, 'state'), { recursive: true, mode: 0o700 });
  const natural = path.join(longRoot, 'state', 'agentd.sock');
  check(`the natural path would be ${Buffer.byteLength(natural)} bytes (over Linux's 107)`, Buffer.byteLength(natural) > 107);
  const envL = { ...process.env, VIBESPACE_AGENTD_ROOT: longRoot, VIBESPACE_DEVICE_ROOT: longRoot };
  const want = SP.daemonSocketPath({ root: longRoot, platform: process.platform, tmpdir: os.tmpdir(), xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || '', uid: process.getuid() });
  const dL = spawn(process.execPath, [bundle], { detached: true, stdio: 'ignore', env: envL });
  dL.unref(); daemonsToKill.push(path.join(longRoot, 'state'));
  const wit = await waitFor(() => { const p = String(fs.readFileSync(SP.witnessPathOf(longRoot), 'utf8')).trim(); return p && fs.statSync(p).isSocket() ? p : null; }, 15000);
  check(`the daemon listens on the ${want.via} rung and writes the witness (${wit})`, !!wit && wit === want.path && want.via !== 'natural' && Buffer.byteLength(wit) <= 107, JSON.stringify({ wit, want }));
  check('…its log names the rung and the bytes', /listening on [^\n]+ \((runtime-dir|tmpdir|tmp), \d+\/107 bytes\)/.test(fs.readFileSync(path.join(longRoot, 'state', 'agentd.log'), 'utf8')));
  // the hub's transport: a DeviceManager over the same root reads the witness, provisions its token, completes hello
  const prevRoot = process.env.VIBESPACE_AGENTD_ROOT;
  process.env.VIBESPACE_AGENTD_ROOT = longRoot;
  let info = null;
  try {
    const { DeviceManager } = require('../src/agentd/client.js');
    const hub = new DeviceManager({ dataDir: path.join(tmp, 'hub-data'), bundlePath: bundle, version, log: () => {} });
    fs.mkdirSync(path.join(tmp, 'hub-data'), { recursive: true });
    check('the hub\'s transport resolves the SAME socket (the witness)', hub._sock === wit, hub._sock);
    // the running daemon holds the root's token file — the hub mints its own when absent, so provision it the way the local path does
    try { hub._ensureLocalToken?.(); } catch { }
    const conn = await Promise.race([hub.connect(), sleep(15000).then(() => null)]);
    info = conn && conn.info;
    hub.stop?.();
  } catch (e) { info = null; console.error('    hub connect:', e.message); }
  finally { if (prevRoot === undefined) delete process.env.VIBESPACE_AGENTD_ROOT; else process.env.VIBESPACE_AGENTD_ROOT = prevRoot; }
  check('the hub\'s local DeviceManager connects over the short socket and completes hello', !!info && (info.capabilities || []).includes('dial-status'), JSON.stringify(info && info.daemonVersion));
}
for (const st of daemonsToKill) {
  try { const p = lockPidOf(st); if (p) process.kill(p, 'SIGTERM'); } catch { }
  // a socket on a SHORT rung lives outside the scratch root (XDG_RUNTIME_DIR / /tmp/vs-dev-<uid>): remove the one this run made
  try { const w = String(fs.readFileSync(path.join(st, 'socket-path'), 'utf8')).trim(); if (w && !w.startsWith(tmp)) { await sleep(300); fs.unlinkSync(w); } } catch { }
}

// cleanup
try { const dpid = Number(fs.readFileSync(path.join(stateDir, 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
httpSrv.close();
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
if (process.env.KEEP_TMP) console.log('tmp:', tmp); else fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd DIAL-OUT tests passed');
process.exit(0);
