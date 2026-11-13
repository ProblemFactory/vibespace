#!/usr/bin/env node
// test-connection-notice-slowlink-chrome — lane connection-notice-once, the slow-link pick (law 5): a slow client is not a dead one, on real sockets
// and a real page. Split out of test-connection-notice-chrome (the page's legs ①, ④, ⑤) because together they need more than one 10-minute claim.
//   ② THE BYTES-TAKEN MARK ON REAL SOCKETS (and the stream bridges' keepalive on it, behind the slow link): plain, TLS and the one-port demux's shape, on this
//     Node — a reader that reads moves it, a reader that stopped leaves it flat; a reader the producer outruns is cut within the stated bound, one that keeps up is not.
//   ③ THE LOOP (law 5): the owed `attached` frame is longer than the heartbeat's 30 s on this link, so its ping waits behind it.
//     Measured at 200 kbit/s before the fix: cut about once a minute, the frame never read, the chat stuck for good. Here ⇒ no cut, the
//     frame arrives, the transcript is complete.
// WHY NOT Network.emulateNetworkConditions: it does not throttle a websocket's reads (test-reconnect-storm's (j) measured the queue
// at 0 under it), so the slow link is a proxy in front of the hub: one token bucket for hub → browser, and a WAN-sized TCP window
// on its upstream socket (TCP_MAXSEG 1300, SO_RCVBUF 8 KB) so backpressure reaches the hub's own queue. Measured: at SO_RCVBUF 64 KB
// the hub's kernel still swallowed the whole 1.2 MB frame, the queue never filled and the leg judged loopback's buffers, not a link.
// RED: `REPO=<a git archive of the release (935960b7e) + node_modules + src/lib/build-version.js AT ITS OWN VERSION>`, or of the notice pick's tree (bdbc31fc2):
// ② and ③ red by name and by behaviour (no mark; cut, stuck).
// `VS_CNO_SHOTS=<dir>` saves the shots. SKIPs without chrome.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
const REPO = path.resolve(process.env.REPO || new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const WebSocket = require('ws');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = process.env.VS_CNO_SHOTS || null;
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const FLAPS = 10;
const SLOW_BYTES_PER_S = 12 * 1024;
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 200) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { } await sleep(step); } return false; };
const procs = new Set(), dirs = new Set();
let root = null;
const cleanup = () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  if (root) { try { endRootedProcesses(root); } catch { } } // dtach, the wrapper and the stub CLI outlive the hub
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

// the REAL home's project list before anything runs — the census at the end proves no fixture landed there
const REAL_PROJECTS = path.join(process.env.HOME || '', '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require(path.join(REPO, 'src/fixture-guard.js'));

// ── the slow link ──
const THROTTLE = String.raw`
import select, socket, sys, threading, time
listen_port, up_port, ctl, log = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
lock = threading.Lock(); tokens = 0.0; last = time.time(); rate = 0.0
def read_rate():
    global rate
    while True:
        try: rate = float(open(ctl).read().strip() or 0)
        except Exception: pass
        time.sleep(0.1)
threading.Thread(target=read_rate, daemon=True).start()
logf = open(log, 'a', buffering=1)
def take(n):
    global tokens, last
    while True:
        r = rate
        if r < 0:
            time.sleep(0.05); continue # a path gone silent: nothing reaches the page, so no ping does and no pong comes back
        if r == 0: return n
        with lock:
            now = time.time(); tokens = min(r / 4, tokens + (now - last) * r); last = now
            if tokens >= min(n, 1300): # a segment at a time, as a link delivers: a grant of whatever trickled in fed a same-process ws reader ~a million tiny chunks and its O(n²) consume held this suite's loop for minutes
                g = int(min(n, tokens)); tokens -= g
                return g
        time.sleep(0.02)
def end(*socks):
    for s in socks:
        try: s.shutdown(socket.SHUT_RDWR)
        except OSError: pass
def down(u, c):
    try:
        while True:
            if not select.select([u], [], [], 0.1)[0]: continue # never parked inside a recv: a path gone silent stops the very next frame, the ping included
            d = u.recv(take(4096))
            if not d: break
            c.sendall(d)
    except OSError: pass
    end(u, c)
def up(c, u, n):
    try:
        first = True
        while True:
            d = c.recv(65536)
            if not d: break
            if first:
                first = False
                if d.startswith(b'GET /ws'): logf.write(f"{time.time():.3f} wsopen {n} port {u.getsockname()[1]}\n")
            u.sendall(d)
    except OSError: pass
    end(u, c)
srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); srv.bind(('127.0.0.1', listen_port)); backlog = 128; srv.listen(backlog)
n = 0
while True:
    c, _ = srv.accept(); n += 1
    c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    u = socket.socket()
    u.setsockopt(socket.IPPROTO_TCP, socket.TCP_MAXSEG, 1300)
    u.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 8192)
    u.connect(('127.0.0.1', up_port)); u.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    threading.Thread(target=down, args=(u, c), daemon=True).start()
    threading.Thread(target=up, args=(c, u, n), daemon=True).start()
`;

// ── ② first: no chrome, no hub ──
console.log('② the drain mark on real sockets (' + process.version + ')');
{
  const HB = require(path.join(REPO, 'src/server/ws-heartbeat.js'));
  const drainMark = HB.drainMark;
  ok('the heartbeat has the mark', typeof drainMark === 'function');
  if (typeof drainMark === 'function') {
    const dir = scratch('cno-tls'); dirs.add(dir); fs.mkdirSync(dir, { recursive: true });
    execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 2 -subj /CN=localhost`, { stdio: 'ignore' });
    const key = fs.readFileSync(`${dir}/k.pem`), cert = fs.readFileSync(`${dir}/c.pem`);
    const BIG = Buffer.alloc(32 * 1048576, 98);
    const runOne = (kind, mode) => new Promise((resolve) => {
      let server, peer;
      const onSock = (s) => {
        s.on('error', () => { });
        s.write(BIG);
        const client = { _socket: s }; const seen = [];
        const iv = setInterval(() => { seen.push(drainMark(client)); if (seen.length < 5) return; clearInterval(iv); s.destroy(); peer.destroy(); server.close(); resolve(seen); }, 400);
      };
      if (kind === 'plain') server = net.createServer(onSock);
      else if (kind === 'tls') server = tls.createServer({ key, cert }, onSock);
      else { const inner = tls.createServer({ key, cert }, onSock); server = net.createServer((raw) => { raw.on('error', () => { }); raw.once('readable', () => inner.emit('connection', raw)); }); } // src/server/tls.js's demux: emit('connection') with the accepted socket
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        peer = kind === 'plain' ? net.connect({ port, host: '127.0.0.1' }) : tls.connect({ port, host: '127.0.0.1', rejectUnauthorized: false });
        peer.on('error', () => { });
        if (mode === 'stopped') peer.once('data', () => peer.pause()); // read one chunk, then never again
        else peer.on('data', (d) => { peer.pause(); setTimeout(() => peer.resume(), d.length / 4096); }); // ≈ 4 MB/s
      });
    });
    for (const kind of ['plain', 'tls', 'demux']) {
      const [slow, stopped] = await Promise.all([runOne(kind, 'slow'), runOne(kind, 'stopped')]);
      const taken = (a) => a.map((m) => m && m.taken);
      ok(`${kind}: a reader that reads moves it, the queue behind it non-empty (the proof's two halves)`, slow.every((m) => m != null) && taken(slow).at(-1) > taken(slow)[1] && slow.slice(1, -1).every((m) => m.queued > 0), slow); // 400 ms samples of a chunky reader on a busy box can read one flat step (seen on Node 22); a heartbeat round is 30 s
      ok(`${kind}: a reader that stopped leaves it flat, the queue full`, stopped.every((m) => m != null) && taken(stopped).at(-1) === taken(stopped).at(-2) && taken(stopped).at(-2) === taken(stopped).at(-3) && stopped.at(-1).queued > 0, stopped);
    }
    // the stream bridges' keepalive reads the same mark. Measured before it did (bytesWritten − writableLength holds a frame whole): one frame longer than two rounds ⇒ cut at round 2, never landed.
    console.log('② the keepalive on the same mark: one frame longer than its rounds, behind a slow link');
    const KA = require(path.join(REPO, 'src/ws-keepalive.js'));
    const PING_MS = 2000, FRAME_BYTES = 4 * 1048576, KA_RATE = 400 * 1024;
    const slowFrame = async (kind) => {
      let dropped = null, landed = false, closed = false;
      const server = kind === 'tls' ? https.createServer({ key, cert }) : http.createServer();
      const wss = new WebSocket.Server({ server });
      wss.on('connection', (ws) => { KA.armKeepalive(ws, { pingMs: PING_MS, onDrop: (d) => { dropped = d.reason; } }); ws.send(Buffer.alloc(FRAME_BYTES, 97)); });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const [viaPort] = await freePorts(1);
      const rate = scratch('cno-ka-rate'), logf = scratch('cno-ka-log'), src = scratch('cno-ka-proxy') + '.py'; dirs.add(rate); dirs.add(logf); dirs.add(src);
      fs.writeFileSync(rate, String(KA_RATE) + '\n'); fs.writeFileSync(logf, ''); fs.writeFileSync(src, THROTTLE);
      const px = spawn('python3', [src, String(viaPort), String(server.address().port), rate, logf], { stdio: 'ignore' }); procs.add(px);
      await sleep(500);
      const c = new WebSocket(`${kind === 'tls' ? 'wss' : 'ws'}://127.0.0.1:${viaPort}/`, { rejectUnauthorized: false, maxPayload: 1 << 30 });
      c.on('error', () => { }); c.on('message', () => { landed = true; }); c.on('close', () => { closed = true; });
      const t0 = Date.now(); await until(() => landed || closed, 45000, 100); const took = Date.now() - t0;
      c.terminate(); for (const x of wss.clients) x.terminate(); server.close(); px.kill('SIGKILL'); procs.delete(px);
      return { landed, dropped, rounds: took / PING_MS };
    };
    // the heartbeat on the same real sockets, 2 s rounds. A reader at ≈1 MB/s under ≈3.2 MB/s of `output` frames (no seq: `lagged` never stops them) moves bytes every round: without
    // the keeping-up law it was never cut, 73 MiB queued in 30 s. And a reader that keeps up, behind the slow link, one frame of many rounds + small live frames: never cut.
    const BEAT_MS = 2000, ALLOW = HB.DRAIN_BACKLOG_ALLOWANCE ?? 4194304, FLOOD_FRAME = 64 * 1024, FLOOD_EVERY_MS = 20, FLOOD_RATE = FLOOD_FRAME / FLOOD_EVERY_MS * 1000;
    const quiet = { warn() { } };
    const beatServer = async (kind) => {
      const server = kind === 'tls' ? https.createServer({ key, cert }) : http.createServer();
      const wss = new WebSocket.Server({ server });
      const hb = HB.createWsHeartbeat(wss, { intervalMs: BEAT_MS, stallGraceMs: BEAT_MS / 2, pulseMs: 200, log: quiet, metric() { } });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      return { server, wss, hb, stop() { clearInterval(wss._heartbeatTimer); clearInterval(wss._heartbeatPulse); for (const x of wss.clients) x.terminate(); server.close(); } };
    };
    const flood = async (kind) => {
      const b = await beatServer(kind); let cutAfter = null, maxBacklog = 0, srv = null, producer = null, sampler = null;
      const t0 = Date.now();
      b.wss.on('connection', (c) => {
        srv = c; c._isAlive = true; c.on('pong', () => { c._isAlive = true; });
        c.on('close', () => { if (cutAfter == null) cutAfter = (Date.now() - t0) / BEAT_MS; clearInterval(producer); });
        producer = setInterval(() => { if (c.readyState === 1) c.send(JSON.stringify({ type: 'output', data: 'x'.repeat(FLOOD_FRAME) })); }, FLOOD_EVERY_MS);
      });
      sampler = setInterval(() => { if (srv && srv.readyState === 1) maxBacklog = Math.max(maxBacklog, srv.bufferedAmount); }, 100);
      const c = new WebSocket(`${kind === 'tls' ? 'wss' : 'ws'}://127.0.0.1:${b.server.address().port}/`, { rejectUnauthorized: false, maxPayload: 1 << 30 });
      c.on('error', () => { });
      c.on('open', () => { const so = c._socket; so.on('data', (d) => { so.pause(); setTimeout(() => so.resume(), d.length / 1000); }); });
      b.hb.start();
      await until(() => cutAfter != null, 9 * BEAT_MS, 100);
      clearInterval(sampler); clearInterval(producer); c.terminate(); b.stop();
      return { cutAfter, maxMiB: +(maxBacklog / 1048576).toFixed(1) };
    };
    const keepsUp = async (kind) => {
      const b = await beatServer(kind); let cut = false, landed = false, closed = false, live = null;
      b.wss.on('connection', (c) => {
        c._isAlive = true; c.on('pong', () => { c._isAlive = true; }); c.on('close', () => { cut = true; clearInterval(live); });
        c.send(Buffer.alloc(8 * 1048576, 97)); // a resume frame of ≈10 rounds on this link, twice the allowance
        live = setInterval(() => { if (c.readyState === 1) c.send(JSON.stringify({ type: 'output', data: 'x'.repeat(512) })); }, 100); // 5 KB/s: far under what it reads
      });
      const [viaPort] = await freePorts(1);
      const rate = scratch('cno-hb-rate'), logf = scratch('cno-hb-log'), src = scratch('cno-hb-proxy') + '.py'; dirs.add(rate); dirs.add(logf); dirs.add(src);
      fs.writeFileSync(rate, String(KA_RATE) + '\n'); fs.writeFileSync(logf, ''); fs.writeFileSync(src, THROTTLE);
      const px = spawn('python3', [src, String(viaPort), String(b.server.address().port), rate, logf], { stdio: 'ignore' }); procs.add(px);
      await sleep(500);
      const c = new WebSocket(`${kind === 'tls' ? 'wss' : 'ws'}://127.0.0.1:${viaPort}/`, { rejectUnauthorized: false, maxPayload: 1 << 30 });
      c.on('error', () => { }); c.on('message', (d) => { if (d.length > 1048576) landed = true; }); c.on('close', () => { closed = true; });
      b.hb.start();
      const t0 = Date.now(); await until(() => landed || closed, 40000, 100); const rounds = (Date.now() - t0) / BEAT_MS;
      await sleep(2 * BEAT_MS); // the socket lives on after the frame: pongs flow again
      const alive = !cut && !closed;
      clearInterval(live); c.terminate(); b.stop(); px.kill('SIGKILL'); procs.delete(px);
      return { landed, alive, rounds: +rounds.toFixed(1) };
    };
    const [kaPlain, kaTls, floodPlain, floodTls, keptPlain, keptTls] = await Promise.all([slowFrame('plain'), slowFrame('tls'), flood('plain'), flood('tls'), keepsUp('plain'), keepsUp('tls')]);
    for (const [kind, r] of [['plain', kaPlain], ['tls', kaTls]]) {
      ok(`${kind}: the frame landed whole, never cut`, r.landed && !r.dropped, r);
      ok(`${kind}: …and it really was longer than the two rounds that used to cut it`, r.rounds > 2, r);
    }
    console.log('② the heartbeat on the same mark: a reader the producer outruns, and one that keeps up');
    const Pr = FLOOD_RATE * BEAT_MS / 1000, floodBound = (2 * ALLOW + 3 * Pr) / 1048576; // the stated bound, owed nothing: 2 × the allowance + 3 rounds of production at the round that cuts
    for (const [kind, r] of [['plain', floodPlain], ['tls', floodTls]]) {
      ok(`${kind}: a reader the producer outruns is cut within 6 rounds (never, without the law)`, r.cutAfter != null && r.cutAfter <= 6.5, r);
      ok(`${kind}: …its queue within the stated bound (${floodBound.toFixed(1)} MiB; 73 MiB and rising without the law)`, r.maxMiB <= floodBound, r);
    }
    for (const [kind, r] of [['plain', keptPlain], ['tls', keptTls]]) {
      ok(`${kind}: a reader that keeps up lands its frame and is never cut, ≥ 10 rounds, twice the allowance`, r.landed && r.alive && r.rounds >= 10, r);
    }
  }
}

// ── the hub ──
const wt = scratch('cno-hub'); root = wt; dirs.add(wt); fs.mkdirSync(wt, { recursive: true });
execSync(`tar -C ${REPO} --exclude=./node_modules --exclude=./.git --exclude=./docs --exclude=./release --exclude=./data/ci-heavy -cf - . | tar -C ${wt} -xf -`);
fs.symlinkSync(fs.realpathSync(path.join(REPO, 'node_modules')), path.join(wt, 'node_modules'), 'dir');
if (!fs.existsSync(path.join(wt, 'src/lib/build-version.js'))) throw new Error('src/lib/build-version.js is missing — run `npm run build` first');
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' }); // what is about to ship
const fakeHome = scratchHome('cno-hub-home', fs); dirs.add(fakeHome);
const cwd = scratch('cno-hub-cwd'); dirs.add(cwd); fs.mkdirSync(cwd, { recursive: true });
const proj = path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-')); fs.mkdirSync(proj, { recursive: true });
const sid = fixtureSid('5c01');
await writeHugeTranscript({ file: path.join(proj, `${sid}.jsonl`), sid, cwd, targetBytes: 3 * 1048576 });
const stub = scratch('cno-hub-claude'); dirs.add(stub);
// the stub CLI: its init for the resumed id, then idles on stdin. VS_BIG n=<n> answers with n tool results of 400 KB; VS_ONE with one line of text.
fs.writeFileSync(stub, `#!/bin/sh
SID=""; prev=""
for a in "$@"; do case "$a" in --version) echo "2.1.274 (Claude Code) stub"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac; [ "$prev" = "--resume" ] && SID="$a"; prev="$a"; done
printf '%s\\n' "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"session_id\\":\\"$SID\\",\\"model\\":\\"claude-fable-5\\",\\"cwd\\":\\"$PWD\\",\\"tools\\":[],\\"permissionMode\\":\\"default\\"}"
R=0
while IFS= read -r line; do
  R=$((R+1))
  case "$line" in
    *VS_ONE*) printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_one_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"text","text":"one line"}]}}\\n' "$SID" "$R" ;;
    *VS_BIG*) N=$(printf '%s' "$line" | sed -n 's/.*VS_BIG n=\\([0-9][0-9]*\\).*/\\1/p'); i=0
      while [ $i -lt $N ]; do i=$((i+1))
        printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_big_%s_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"tool_use","id":"toolu_big_%s_%s","name":"Read","input":{"file_path":"notes.txt"}}]}}\\n' "$SID" "$R" "$i" "$R" "$i"
        printf '{"type":"user","parent_tool_use_id":null,"session_id":"%s","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_big_%s_%s","content":"' "$SID" "$R" "$i"
        head -c 400000 /dev/zero | tr '\\0' b
        printf '"}]}}\\n'
      done ;;
    *) continue ;;
  esac
  printf '{"type":"result","subtype":"success","session_id":"%s","duration_ms":1,"total_cost_usd":0,"is_error":false}\\n' "$SID"
done
`, { mode: 0o755 });
const [PORT, PROXY, CDP] = await freePorts(3);
const rateFile = scratch('cno-rate'), proxyLog = scratch('cno-proxy-log'), proxySrc = scratch('cno-proxy') + '.py'; dirs.add(rateFile); dirs.add(proxyLog); dirs.add(proxySrc);
fs.writeFileSync(rateFile, '0\n'); fs.writeFileSync(proxyLog, ''); fs.writeFileSync(proxySrc, THROTTLE);
const VNC_ENV = await vncEnv();
let journal = '';
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' } });
procs.add(srv);
const onOut = (d) => { journal = (journal + d).slice(-200000); };
srv.stdout.on('data', onOut); srv.stderr.on('data', onOut);
const proxy = spawn('python3', [proxySrc, String(PROXY), String(PORT), rateFile, proxyLog], { stdio: 'ignore' }); procs.add(proxy);
const chromeDir = scratch('cno-chrome'); dirs.add(chromeDir);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=500,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
procs.add(chrome);
if (!await until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000)) { console.error(journal.slice(-1500)); throw new Error('the scratch hub never answered'); }

const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { maxPayload: 1 << 30 });
const frames = []; ctl.on('message', (d) => { if (d.length > 65536) return; try { frames.push(JSON.parse(String(d))); } catch { } });
await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
ctl.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd, resume: true, resumeId: sid, reqId: 'c0', name: 'notice', cols: 80, rows: 24 }));
await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c0'), 30000, 100);
const created = frames.find((m) => m.type === 'created' && m.reqId === 'c0');
if (!created) throw new Error('create failed: ' + JSON.stringify(frames.slice(-2)).slice(0, 400));
const id = created.sessionId;
const sayToStub = (text) => ctl.send(JSON.stringify({ type: 'chat-input', sessionId: id, text, msgId: 'm-' + Date.now() + Math.random() }));
const serverTotal = () => fetch(`http://127.0.0.1:${PORT}/api/session-messages?backend=claude&backendSessionId=${sid}&cwd=${encodeURIComponent(cwd)}&offset=0&limit=1`).then((r) => r.json()).then((j) => j.total);

// ── CDP ──
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) throw new Error('chrome never exposed a page target');
const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 1 << 28 });
await new Promise((r) => cdpWs.on('open', r));
let seq = 0; const pend = new Map();
cdpWs.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res) => { const i = ++seq; pend.set(i, res); cdpWs.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64')); };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Android' });
await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
const boot = async () => {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PROXY}/?cb=${Date.now()}` });
  if (!await until(() => ev('!!(window.app && window.app.ready)'), 60000)) throw new Error('the app never booted');
  await ev('window.app.ready.then(() => true)');
};
await boot();
const INSTALL = `(() => {
  const S = window.__cn = { flips: [], attached: [], toasts: 0 };
  const app = window.app, sid = ${JSON.stringify(id)};
  app.ws._stateListeners.unshift((c) => S.flips.push({ c, t: Date.now() }));
  S.life = []; for (const k of ['freeze', 'resume', 'visibilitychange']) document.addEventListener(k, () => S.life.push(k === 'visibilitychange' ? document.visibilityState : k));
  app.ws._stateListeners.unshift((c) => S.life.push(c ? 'up' : 'down'));
  S.toastWords = [];
  app.ws.globalHandlers.unshift((m) => { if (m.type === 'attached' && m.sessionId === sid) S.attached.push({ t: Date.now(), held: m.slab === 'held', replay: Array.isArray(m.replay) ? m.replay.length : 0 }); });
  new MutationObserver((recs) => { for (const r of recs) for (const n of r.addedNodes) if (n.classList?.contains('global-toast') || n.querySelector?.('.global-toast')) { S.toasts++; S.toastWords.push(String(n.textContent).slice(0, 120)); } }).observe(document.body, { childList: true, subtree: true });
  window.__view = () => [...app.sessions.values()].find((v) => v && v.sessionId === sid);
  window.__rows = () => [...document.querySelectorAll('.chat-msg-system .chat-system')].filter((e) => /Disconnected from server|Reconnected|Connection unstable|已与服务器断开|已重新连接|连接不稳定/.test(e.textContent)).map((e) => e.textContent);
  window.__facts = () => { const v = window.__view(); return { start: v._windowStart, end: v._windowEnd, total: v._total, cards: v._messageList.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)').length, rows: window.__rows(), attached: S.attached.length, toasts: S.toasts, flips: S.flips.length, n: v._connNotice?.state?.n ?? 0, lastHeld: S.attached.at(-1)?.held ?? null, toastWords: S.toastWords }; };
  return true;
})()`;
await ev(INSTALL);
await ev(`(async () => { const w = window.app.attachSession(${JSON.stringify(id)}, 'notice', ${JSON.stringify(cwd)}, { mode: 'chat', backend: 'claude' }); const t0 = Date.now(); while (Date.now() - t0 < 60000) { const v = window.__view(); if (v && v._total > 0 && v._messages?.length) return true; await new Promise((r) => setTimeout(r, 150)); } return false; })()`);
await sleep(1500);

// ── ③ the loop ──
console.log(`③ a client on a slow link (${SLOW_BYTES_PER_S / 1024} KB/s), owed one frame longer than the heartbeat's round`);
await sleep(31000); // a clean heartbeat round before the path degrades
const cutsBefore = (journal.match(/heartbeat terminating/g) || []).length;
// the page's socket is down first (the hub has let go of it, nothing is queued on it), THEN the agent speaks: ≈ 1.2 MB the ring holds,
// and the re-attach 2–3 s later is owed it as ONE frame.
const sent = await ev(`(async () => { const S = window.__cn; S.attached.length = 0; S.flips.length = 0; window.app.ws.ws.close(); const t0 = Date.now(); while (!S.flips.some((f) => !f.c) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 5)); return window.__view()._lastSeq; })()`);
sayToStub('VS_BIG n=3');
fs.writeFileSync(rateFile, String(SLOW_BYTES_PER_S) + '\n');
const tSlow = Date.now();
const owedTotal = await (async () => { let v = 0; await until(async () => { const t = await serverTotal(); if (t === v && t > 0) return true; v = t; return false; }, 15000, 1500); return v; })();
const landed = await until(() => ev(`window.__view()._total === ${owedTotal} && window.__view()._windowEnd === ${owedTotal} && window.__cn.attached.length > 0`), 210000, 1000);
const elapsed = Date.now() - tSlow;
await sleep(65000); // two heartbeat rounds on the same link: a cut at the end of the drain reaches the page only now
fs.writeFileSync(rateFile, '0\n');
const end = await ev(`(() => { const S = window.__cn, v = window.__view(); return { downs: S.flips.filter((f) => !f.c).length, attached: S.attached, total: v._total, seqBefore: ${sent}, seq: v._lastSeq, frames: (window.__vsAttachFrames || []).slice(-1).map((f) => ({ len: f.len, replay: f.replay, held: f.held })), rows: window.__rows() }; })()`);
const cuts = (journal.match(/heartbeat terminating/g) || []).length - cutsBefore;
console.log(`    the control socket's port ${ctl._socket?.localPort}; the proxy's websockets: ${fs.readFileSync(proxyLog, 'utf8').trim().split('\n').slice(-4).map((l) => l.split(' ').slice(1).join(' ')).join(' · ')}`);
console.log(`    elapsed ${Math.round(elapsed / 1000)} s; ${cuts} heartbeat cut(s); ${end.downs} socket drop(s) (1 is ours); frame ${JSON.stringify(end.frames)}; total ${end.total}/${owedTotal}`);
ok('the transcript is complete on the slow link', landed, { total: end.total, owedTotal, cuts, downs: end.downs });
ok('the heartbeat cut nothing', cuts === 0, cuts);
ok('one socket cycle: the one this leg made', end.downs === 1, end.downs);
ok('it came as the owed resume, one frame, once', end.attached.length === 1 && end.attached[0].held && end.attached[0].replay > 0, end.attached);
ok('the link really was slower than a heartbeat round for that frame', (end.frames[0]?.len || 0) / SLOW_BYTES_PER_S > 30 && elapsed >= 0.7 * (end.frames[0]?.len || 0) / SLOW_BYTES_PER_S * 1000, { elapsed, frames: end.frames });
await until(() => { const dir = path.join(wt, 'data', 'telemetry'); try { return fs.readdirSync(dir).some((f) => /^events-/.test(f) && fs.readFileSync(path.join(dir, f), 'utf8').includes('ws-heartbeat-slow-drain')); } catch { return false; } }, 20000, 1000).then((seen) => ok('the waived round left its mark in telemetry', seen));
await shot('slow-link-complete.png');

console.log('the real home');
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, lit.offenders.slice(0, 3));
}

console.log(fail ? `\nFAILED: ${fail} failed, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
