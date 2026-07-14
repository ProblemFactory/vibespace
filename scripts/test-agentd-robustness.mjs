#!/usr/bin/env node
// M2 ROBUSTNESS e2e (docs/design-remote-cs.md M2): adversarial verification of
// the ssh-bridge + persistent pipe-session model under real-world stress —
//   1. BIDIRECTIONAL round-trip: child asks, server answers, child continues
//      (the codex-approval shape) — bytes flow both ways under the mux.
//   2. BINARY + MULTIBYTE integrity: large binary/UTF-8 both ways, byte-exact.
//   3. NETWORK JITTER: drop the bridge N times mid-stream, reattach by offset
//      each time — ZERO loss, ZERO duplication (the byte-offset contract).
//   4. IO LATENCY: inject per-chunk transport delay — credit flow control must
//      not deadlock, offsets stay exact, large transfers complete.
//   5. CONCURRENCY: two pipe sessions on one daemon; a fat transfer on one
//      must not starve the other (per-channel credit fairness).
// Uses a controllable in-process bridge (a duplex pair with a togglable
// "cut" + latency) so drops/latency are precise. Throwaway root only.
// Run: node scripts/test-agentd-robustness.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentd-rob-'));
const AGENTD_ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_AGENTD_ROOT = AGENTD_ROOT;
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo });
const instDir = path.join(AGENTD_ROOT, version); fs.mkdirSync(instDir, { recursive: true });
fs.copyFileSync(bundle, path.join(instDir, 'agentd.js'));
fs.symlinkSync(instDir, path.join(AGENTD_ROOT, 'current'));
const stateDir = path.join(AGENTD_ROOT, 'state'); fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const TOKEN = 'vsht_rob' + crypto.randomBytes(6).toString('hex');
fs.writeFileSync(path.join(stateDir, 'token'), TOKEN, { mode: 0o600 });

const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');

// spawn the standing daemon directly (the transport reaches it via a bridge)
const { spawn } = await import('node:child_process');
const daemon = spawn(process.execPath, [path.join(AGENTD_ROOT, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: process.env });
daemon.unref();
await sleep(800);

// ── a CONTROLLABLE bridge: connects to the daemon socket; can `cut()` (drop
// like an ssh disconnect) and add per-chunk latency. Presents a duplex to Mux.
function makeBridge({ latency = 0 } = {}) {
  const sock = net.connect(path.join(stateDir, 'agentd.sock'));
  let cut = false;
  const listeners = { data: [], close: [], error: [] };
  sock.on('data', (d) => { if (cut) return; const emit = () => listeners.data.forEach((f) => f(d)); latency ? setTimeout(emit, latency) : emit(); });
  sock.on('close', () => listeners.close.forEach((f) => f()));
  sock.on('error', () => listeners.error.forEach((f) => f()));
  return {
    stream: {
      write: (d) => { if (cut) return false; if (latency) { setTimeout(() => { try { sock.write(d); } catch {} }, latency); return true; } return sock.write(d); },
      on: (ev, fn) => { listeners[ev]?.push(fn); },
      destroy: () => { try { sock.destroy(); } catch {} },
    },
    cut: () => { cut = true; try { sock.destroy(); } catch {} },
  };
}

// a Mux client over a bridge, with session routing (mirrors DeviceManager)
async function connectVia(bridge) {
  return new Promise((resolve, reject) => {
    const sessions = new Map();
    let done = false;
    const mux = new Mux(bridge.stream, {
      heartbeat: false,
      onControl: (m) => {
        if (m.op === 'hello-ack') { done = true; resolve({ mux, sessions }); return; }
        if (m.op === 'auth-fail') { reject(new Error('auth-fail')); return; }
        if (m.op === 'pipe-session-open' || m.op === 'session-open') { sessions.get(m.chan)?.onOpen?.(m); return; }
        if (m.op === 'session-error') { sessions.get(m.chan)?.onError?.(m.error); return; }
      },
      onData: (chan, buf) => { sessions.get(chan)?.onData?.(buf); mux.credit(chan, buf.length); },
      onDead: () => { if (!done) reject(new Error('bridge died in handshake')); },
    });
    mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: TOKEN });
    setTimeout(() => { if (!done) reject(new Error('handshake timeout')); }, 5000);
  });
}
let CHAN = 2;
function openPipe(conn, { sid, cmd, args, offset = 0 }) {
  const chan = CHAN++;
  const h = { chan, sid, buf: Buffer.alloc(0) };
  let ready, rej; h.ready = new Promise((a, b) => { ready = a; rej = b; });
  conn.sessions.set(chan, { onOpen: (m) => { h.pid = m.pid; ready(m); }, onError: (e) => rej(new Error(e)), onData: (b) => { h.buf = Buffer.concat([h.buf, b]); h.onData?.(b); } });
  h.write = (s) => conn.mux.data(chan, Buffer.isBuffer(s) ? s : Buffer.from(s, 'utf-8'));
  conn.mux.control(cmd ? { op: 'open-pipe-session', chan, sid, cmd, args, offset } : { op: 'attach-pipe-session', chan, sid, offset });
  return h;
}

// ─────────────────────────────────────────────────────────────────────
console.log('— 1. BIDIRECTIONAL round-trip (child asks, server answers) —');
{
  // child prints "ASK:<n>", waits for "ANS:<n>" on stdin, then prints "GOT:<n>"
  const STUB = 'let n=0;process.stdin.setEncoding("utf8");let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))!==-1){const l=b.slice(0,i);b=b.slice(i+1);const m=l.match(/^ANS:(\\d+)/);if(m)console.log("GOT:"+m[1])}});const t=setInterval(()=>{if(n<3){console.log("ASK:"+n);n++}else{clearInterval(t);setTimeout(()=>process.exit(0),300)}},200);';
  const conn = await connectVia(makeBridge());
  const h = openPipe(conn, { sid: 'bidi-1', cmd: process.execPath, args: ['-e', STUB] });
  await h.ready;
  const answered = new Set();
  h.onData = () => {
    const s = h.buf.toString();
    for (const m of s.matchAll(/ASK:(\d+)/g)) { if (!answered.has(m[1])) { answered.add(m[1]); h.write(`ANS:${m[1]}\n`); } }
  };
  await sleep(2000);
  const got = [...h.buf.toString().matchAll(/GOT:(\d+)/g)].map((m) => m[1]);
  check('server answered every child request (round-trip both ways)', got.length === 3 && got.join(',') === '0,1,2', JSON.stringify({ got, answered: [...answered] }));
  conn.mux.destroy();
}

console.log('— 2. BINARY + MULTIBYTE integrity both directions —');
{
  // child echoes stdin to stdout VERBATIM (base64 framing to survive newline)
  const STUB = 'let b="";process.stdin.on("data",d=>{b+=d.toString("latin1");let i;while((i=b.indexOf("\\n"))!==-1){const l=b.slice(0,i);b=b.slice(i+1);process.stdout.write(l+"\\n")}});setInterval(()=>{},1e3);';
  const conn = await connectVia(makeBridge());
  const h = openPipe(conn, { sid: 'bin-1', cmd: process.execPath, args: ['-e', STUB] });
  await h.ready;
  await sleep(300);
  const payload = crypto.randomBytes(40000).toString('base64') + '——多字节✓🎯é中文——' ;
  const b64 = Buffer.from(payload, 'utf-8').toString('base64');
  h.write(b64 + '\n');
  await sleep(1200);
  const echoed = h.buf.toString('latin1').split('\n').filter(Boolean)[0];
  const decoded = Buffer.from(echoed || '', 'base64').toString('utf-8');
  check('40KB binary+multibyte round-tripped byte-exact', decoded === payload, `len ${decoded.length} vs ${payload.length}`);
  conn.mux.destroy();
}

console.log('— 3. NETWORK JITTER: 5 mid-stream drops, offset reattach, zero loss/dup —');
{
  // child emits a strictly increasing counter fast; we drop the bridge 5x and
  // reattach by offset each time — the reassembled stream must be a perfect
  // contiguous 0..N with no gaps and no repeats.
  const N = 200;
  const STUB = `let n=0;const t=setInterval(()=>{process.stdout.write("L"+n+"\\n");n++;if(n>=${N}){clearInterval(t);setTimeout(()=>process.exit(0),150)}},8);`;
  let full = Buffer.alloc(0);
  let offset = 0;
  let conn = await connectVia(makeBridge());
  let h = openPipe(conn, { sid: 'jit-1', cmd: process.execPath, args: ['-e', STUB] });
  await h.ready;
  h.onData = () => {};
  // drop+reattach 5 times mid-stream, THEN keep reattaching until the child's
  // exit sentinel is seen (deterministic completion — no timing guesswork)
  let sawSentinel = false;
  for (let round = 0; round < 40 && !sawSentinel; round++) {
    await sleep(120);
    full = Buffer.concat([full, h.buf]);
    offset += h.buf.length;
    if (full.toString().includes('"_remote_exit"')) { sawSentinel = true; break; }
    if (round < 5) { // the 5 real jitter drops; after that just poll to completion
      conn.mux.destroy(); await sleep(80);
      conn = await connectVia(makeBridge());
    } else {
      conn.mux.destroy();
      conn = await connectVia(makeBridge());
    }
    h = openPipe(conn, { sid: 'jit-1', offset });
    await h.ready;
    h.onData = () => {};
  }
  conn.mux.destroy();
  const lines = full.toString().split('\n').filter((l) => /^L\d+$/.test(l));
  const nums = lines.map((l) => Number(l.slice(1)));
  let contiguous = true, firstBad = -1;
  for (let i = 0; i < nums.length; i++) if (nums[i] !== i) { contiguous = false; firstBad = i; break; }
  check(`stream reassembled contiguous 0..${N - 1} across ≥5 drops (no loss, no dup)`, contiguous && nums.length === N && sawSentinel, `got ${nums.length}/${N} lines, contiguous=${contiguous}, firstBad=${firstBad}, sentinel=${sawSentinel}`);
}

console.log('— 4. IO LATENCY: 120ms/chunk transport delay, offsets exact, no deadlock —');
{
  const STUB = 'let n=0;const t=setInterval(()=>{process.stdout.write("X".repeat(500)+n+"\\n");n++;if(n>=50){clearInterval(t);setTimeout(()=>process.exit(0),200)}},10);';
  const conn = await connectVia(makeBridge({ latency: 120 }));
  const h = openPipe(conn, { sid: 'lat-1', cmd: process.execPath, args: ['-e', STUB] });
  await h.ready;
  h.onData = () => {};
  await sleep(6000); // generous — latency stretches delivery
  const lines = h.buf.toString().split('\n').filter((l) => /X{500}\d+$/.test(l));
  const nums = lines.map((l) => Number(l.replace(/^X+/, '')));
  const contiguous = nums.every((v, i) => v === i);
  check('all 50 latency-delayed chunks delivered in order (flow control alive)', nums.length === 50 && contiguous, `${nums.length} lines contiguous=${contiguous}`);
  conn.mux.destroy();
}

console.log('— 5. CONCURRENCY: fat transfer on one session must not starve another —');
{
  // session A dumps a big payload; session B does small pings. B must keep
  // responding while A floods (per-channel credit fairness).
  const FAT = 'process.stdout.write("F".repeat(2000000));setInterval(()=>{},1e3);';
  const PING = 'let n=0;const t=setInterval(()=>{process.stdout.write("P"+n+"\\n");n++;if(n>=10){clearInterval(t);setTimeout(()=>process.exit(0),200)}},50);';
  const conn = await connectVia(makeBridge());
  const a = openPipe(conn, { sid: 'conc-a', cmd: process.execPath, args: ['-e', FAT] });
  const b = openPipe(conn, { sid: 'conc-b', cmd: process.execPath, args: ['-e', PING] });
  await Promise.all([a.ready, b.ready]);
  a.onData = () => {}; b.onData = () => {};
  await sleep(1500);
  const bPings = [...b.buf.toString().matchAll(/P(\d+)/g)].map((m) => Number(m[1]));
  const bContig = bPings.every((v, i) => v === i);
  check('session B kept flowing while A flooded 2MB (no starvation)', bPings.length === 10 && bContig, `B got ${bPings.length} pings, A got ${a.buf.length} bytes`);
  check('session A also delivered its fat payload', a.buf.length > 1000000, `${a.buf.length} bytes`);
  conn.mux.destroy();
}

try { const dpid = Number(fs.readFileSync(path.join(stateDir, 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd M2 robustness tests passed');
process.exit(0);
