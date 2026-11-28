#!/usr/bin/env node
// test-tls-demux — src/server/tls.js in-process (lane https-tailscale, 2026-10-12): ONE port, two servers. A plain GET
// reaches the http server, a TLS GET the https one (rejectUnauthorized:false — a self-signed leaf minted by openssl in
// a scratch dir), a WebSocket upgrade works on BOTH (the listener attached BEFORE the https server was born too), a
// slow / split first byte, an immediate close and a reset before any byte leave the port serving; a renewal swaps the
// certificate with no restart; the pass with a stubbed `tailscale` acquires once (one cert run in flight) and files
// the owner's For-you item ONCE across two boots. CONTROL: a copy whose https server does not replay the listeners
// ⇒ the wss leg is RED. §5 TRANSPARENT (lane https-demux-witness): the Apps shape — an answer whose body follows its
// head (compression()) and a WebSocket push 15 ms after it finished — reaches the client answer-then-push, as plain
// listen does; keep-alive, half-open, an upgrade whose head buffer carries a frame. CONTROL: a copy without acceptAs
// (the bare front: Nagle on) ⇒ the answer waits ~40 ms for the delayed ACK and lands AFTER the push (RED).
import './scratch.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import http from 'http';
import https from 'https';
import tls from 'tls';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// B-f276 (lane hub-loop-stalls, r4719): tls.js reads its record through the store-read hold — a copy written outside the tree
// reaches the two helpers by their full path, as it reaches tls-plan.js
const holdAbs = (t) => anchored(anchored(t, "require('../store-read.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/store-read.js')) + ')', 'tls-store-read-path'), "require('../store-read-hold.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/store-read-hold.js')) + ')', 'tls-store-read-hold-path');
const { WebSocketServer, WebSocket } = require(path.join(REPO, 'node_modules/ws'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log: () => { }, warn: () => { } };

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tlsdemux-'));
function mint(name, cn) {
  const c = path.join(DIR, name + '.crt'), k = path.join(DIR, name + '.key');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', k, '-out', c, '-days', '30', '-subj', '/CN=' + cn, '-addext', `subjectAltName=DNS:${cn},IP:127.0.0.1`], { stdio: 'ignore' });
  return { c, k };
}
const A = mint('a', 'localhost'), B = mint('b', 'localhost');

function rig(TLS, opts = {}) {
  const app = (req, res) => {
    let n = 0;
    req.on('data', (d) => { n += d.length; });
    req.on('end', () => res.end(`${req.socket.encrypted ? 'https' : 'http'} ${req.method} ${req.url} ${n}`));
  };
  const httpServer = http.createServer(app);
  const hub = TLS.create({ app, httpServer, port: 0, log: quiet, ...opts });
  const wss = new WebSocketServer({ noServer: true });
  hub.attachToServers('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => ws.on('message', (m) => ws.send(`${req.socket.encrypted ? 'wss' : 'ws'}:${m}`))));
  return { hub, httpServer };
}
const listen = (hub) => new Promise((r) => hub.listen(0, '127.0.0.1', () => r(hub.address().port)));
function get(url, o = {}) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: o.method || 'GET', rejectUnauthorized: false, agent: false, timeout: 5000 }, (res) => {
      let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b, cert: res.socket.getPeerCertificate?.()?.fingerprint256 || null }));
    });
    req.on('error', (e) => resolve({ error: e.code || e.message })); req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    if (o.body) req.write(o.body);
    req.end();
  });
}
function wsEcho(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    const t = setTimeout(() => { ws.terminate(); resolve('timeout'); }, 5000);
    ws.on('open', () => ws.send('ping'));
    ws.on('message', (m) => { clearTimeout(t); ws.close(); resolve(String(m)); });
    ws.on('error', (e) => { clearTimeout(t); resolve('error:' + (e.code || e.message)); });
  });
}
function raw(port, pieces) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    let b = '';
    s.on('data', (d) => { b += d; });
    s.on('close', () => resolve(b)); s.on('error', () => resolve(b || 'error'));
    (async () => { for (const [ms, data] of pieces) { await sleep(ms); if (data === null) { s.end(); return; } s.write(data); } })();
  });
}
const fp = (file) => new (require('crypto').X509Certificate)(fs.readFileSync(file)).fingerprint256;

const TLS = require(path.join(REPO, 'src/server/tls.js'));
const closers = [];
try {
  console.log('§1 one port, two servers (files)');
  const env = { VIBESPACE_TLS_CERT: A.c, VIBESPACE_TLS_KEY: A.k };
  const r1 = rig(TLS, { env, dataDir: path.join(DIR, 'd1') });
  const port = await listen(r1.hub); closers.push(r1.hub.front);
  ok(r1.hub.url() === `https://localhost:0` || verdictOf(/^https:\/\/localhost:/.test(r1.hub.url() || '')), `the certificate on disk is served from boot, before any pass: ${r1.hub.url()}`);
  const g1 = await get(`http://127.0.0.1:${port}/a?x=1`);
  ok(g1.body === 'http GET /a?x=1 0', `plain GET → the http server (${g1.body || g1.error})`);
  const g2 = await get(`https://127.0.0.1:${port}/b`);
  ok(g2.body === 'https GET /b 0' && g2.cert === fp(A.c), `TLS GET → the https server with the files certificate (${g2.body || g2.error})`);
  const big = 'x'.repeat(300 * 1024);
  const g3 = await get(`http://127.0.0.1:${port}/post`, { method: 'POST', body: big });
  const g4 = await get(`https://127.0.0.1:${port}/post`, { method: 'POST', body: big });
  ok(g3.body === `http POST /post ${big.length}` && g4.body === `https POST /post ${big.length}`, 'a 300 KB body arrives whole on both (the peeked byte is not lost)');
  ok(await wsEcho(`ws://127.0.0.1:${port}/ws`) === 'ws:ping', 'a WebSocket upgrade on the http server');
  ok(await wsEcho(`wss://127.0.0.1:${port}/ws`) === 'wss:ping', 'a WebSocket upgrade on the https server');
  const slow = await raw(port, [[400, 'G'], [300, 'ET /slow HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n']]);
  ok(verdictOf(/^HTTP\/1\.1 200[\s\S]*http GET \/slow 0$/.test(slow)), 'a slow first byte, then the rest split ⇒ still the http server');
  await raw(port, [[0, null]]);
  await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.resetAndDestroy ? s.resetAndDestroy() : s.destroy(); r(); }); s.on('error', r); });
  await sleep(100);
  ok((await get(`http://127.0.0.1:${port}/after`)).body === 'http GET /after 0' && (await get(`https://127.0.0.1:${port}/after`)).body === 'https GET /after 0', 'an immediate close and a reset before any byte ⇒ the port still serves both');
  fs.copyFileSync(B.c, A.c); fs.copyFileSync(B.k, A.k);
  await r1.hub.pass();
  const g5 = await get(`https://127.0.0.1:${port}/renewed`);
  ok(g5.cert === fp(B.c) && g5.body === 'https GET /renewed 0', 'a renewed certificate is served by the next connection — setSecureContext, no restart');
  ok(await wsEcho(`wss://127.0.0.1:${port}/ws`) === 'wss:ping', 'the upgrade listener survives the renewal');

  console.log('§2 off: a ClientHello is closed, http unchanged');
  const r2 = rig(TLS, { env: {}, dataDir: path.join(DIR, 'd2'), tailscaleBin: null, serverSetting: () => 'off' });
  const p2 = await listen(r2.hub); closers.push(r2.hub.front);
  await r2.hub.pass();
  const t2 = await get(`https://127.0.0.1:${p2}/x`);
  ok(!!t2.error && r2.hub.url() === null, `no certificate ⇒ TLS refused (${t2.error}), no https url`);
  ok((await get(`http://127.0.0.1:${p2}/x`)).body === 'http GET /x 0', 'http on the same port unchanged');
  ok(r2.hub.status().why === 'disabled', 'status says why (disabled)');

  console.log('§3 tailscale (a stubbed CLI): acquire, one cert run in flight, the For-you item once');
  const DNS = 'box.tail1234.ts.net';
  const mkRun = (o) => { const calls = []; const run = async (bin, args) => { calls.push(args[0]); await sleep(50);
    if (args[0] === 'status') return { code: 0, out: JSON.stringify({ BackendState: 'Running', Self: { DNSName: DNS + '.' }, CertDomains: o.listed ? [DNS] : null }), err: '' };
    if (o.denied) return { code: 1, out: '', err: "Access denied: cert access denied.\nUse 'sudo tailscale cert " + DNS + "'." };
    fs.copyFileSync(B.c, args[2]); fs.copyFileSync(B.k, args[4]); return { code: 0, out: '', err: '' }; }; return { run, calls }; };
  const todos = () => { const items = []; return { items, add: (k, it) => { const id = 't' + items.length; items.push({ id, k, ...it, status: 'open' }); return { id }; }, get: (id) => items.find((x) => x.id === id), setStatus: (id, s) => { items.find((x) => x.id === id).status = s; } }; };
  const T3 = todos();
  const s3 = mkRun({ listed: true });
  const r3 = rig(TLS, { env: {}, dataDir: path.join(DIR, 'd3'), run: s3.run, getUserTodos: () => T3 });
  const p3 = await listen(r3.hub); closers.push(r3.hub.front);
  ok(r3.hub._https() === null && r3.hub.url() === null, 'before the pass: no https server yet');
  await Promise.all([r3.hub.pass(), r3.hub.pass(), r3.hub.pass()]);
  ok(s3.calls.filter((c) => c === 'cert').length === 1, `three passes at once ⇒ ONE tailscale cert run (${s3.calls.join(',')})`);
  ok(r3.hub.url() === `https://${DNS}:0` && verdictOf(fs.existsSync(path.join(DIR, 'd3/tls', DNS + '.crt'))), `acquired into data/tls/<domain>.crt: ${r3.hub.url()}`);
  ok(await wsEcho(`wss://127.0.0.1:${p3}/ws`) === 'wss:ping', 'the https server born AFTER attachToServers replays the upgrade listener');
  ok(T3.items.length === 0, 'a live certificate files no For-you item');

  const T4 = todos();
  const d4 = path.join(DIR, 'd4');
  for (const boot of [1, 2]) {
    const r4 = rig(TLS, { env: {}, dataDir: d4, run: mkRun({ listed: false }).run, getUserTodos: () => T4 });
    await r4.hub.pass();
    ok(r4.hub.status().why === 'https-not-enabled', `boot ${boot}: CertDomains null ⇒ https-not-enabled`);
  }
  ok(T4.items.length === 1 && verdictOf(T4.items[0].i18n.text.key.startsWith('Tailscale HTTPS certificates are off')), `the "not enabled" For-you item ONCE across two boots (${T4.items.length})`);
  const r4b = rig(TLS, { env: {}, dataDir: d4, run: mkRun({ listed: true, denied: true }).run, getUserTodos: () => T4 });
  await r4b.hub.pass(); await r4b.hub.pass();
  ok(r4b.hub.status().why === 'operator-needed' && T4.items.length === 2 && gateOf(T4.items[1].text.includes('sudo tailscale set --operator=')) && T4.items[0].status === 'done', 'the state moves (cert access denied) ⇒ ONE operator-needed item, the not-enabled one resolved');
  const r4c = rig(TLS, { env: {}, dataDir: d4, run: mkRun({ listed: true }).run, getUserTodos: () => T4 });
  await r4c.hub.pass();
  ok(r4c.hub.url() === `https://${DNS}:0` && T4.items[1].status === 'done' && T4.items.length === 2, 'the operator right granted ⇒ the next pass acquires and resolves the item, nothing new filed');

  console.log('§4 CONTROL');
  {
    const src = holdAbs(fs.readFileSync(path.join(REPO, 'src/server/tls.js'), 'utf8'));
    const from = '      for (const [e, f] of listeners) httpsServer.on(e, f);\n';
    ok(verdictOf(src.includes(from)), 'the control\'s anchor is in the module');
    const cp = path.join(DIR, 'tls-control.js');
    fs.writeFileSync(cp, editAnchor(editAnchor(src, from, '', "src/server/tls.js"), "require('../tls-plan.js')", JSON.stringify(path.join(REPO, 'src/tls-plan.js')).replace(/^/, 'require(') + ')', "src/server/tls.js"));
    const M = require(cp);
    const r5 = rig(M, { env: {}, dataDir: path.join(DIR, 'd5'), run: mkRun({ listed: true }).run });
    const p5 = await listen(r5.hub); closers.push(r5.hub.front);
    await r5.hub.pass();
    const w = await wsEcho(`wss://127.0.0.1:${p5}/ws`);
    ok(w !== 'wss:ping', `CONTROL without the replay: the wss upgrade is RED (${w})`);
  }
  console.log('§5 TRANSPARENT (lane https-demux-witness): a handed-over socket behaves like plain listen');
  {
    let lastHead = -1;
    const shape = (M) => {
      const app = (req, res) => {
        if (req.url === '/half') return res.end(String(req.socket.allowHalfOpen));
        res.writeHead(200, { 'content-type': 'text/plain' }); res.write('head'); // the head now, the body later (compression())
        setTimeout(() => res.end('body'), 1);
        if (req.url === '/list') res.on('finish', () => setTimeout(() => { for (const c of wss.clients) c.send('push'); }, 15));
      };
      const httpServer = http.createServer(app);
      let conns = 0; httpServer.on('connection', () => { conns++; });
      const wss = new WebSocketServer({ noServer: true });
      const onUp = (req, socket, head) => { lastHead = head.length; wss.handleUpgrade(req, socket, head, (ws) => ws.on('message', (m) => ws.send('ws:' + m))); };
      if (!M) { httpServer.on('upgrade', onUp); closers.push(httpServer); return { conns: () => conns, listen: () => new Promise((r) => httpServer.listen(0, '127.0.0.1', () => r(httpServer.address().port))) }; }
      const hub = M.create({ app, httpServer, port: 0, log: quiet, env: {}, dataDir: path.join(DIR, 'd6'), tailscaleBin: null });
      hub.attachToServers('upgrade', onUp); closers.push(hub.front);
      return { conns: () => conns, listen: () => listen(hub) };
    };
    /** the page after Add: its WebSocket open, a keep-alive fetch of the list; the push follows the answer by 15 ms */
    async function order(M) {
      const s = shape(M), port = await s.listen(), seen = [], ms = [];
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((r) => ws.on('open', r));
      ws.on('message', (m) => seen.push(String(m)));
      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
      const fetch1 = (p) => new Promise((r) => { const t0 = Date.now(); http.get({ host: '127.0.0.1', port, path: p, agent }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => r({ b, ms: Date.now() - t0 })); }); });
      let body = '';
      for (let i = 0; i < 3; i++) { await fetch1('/warm'); const a = await fetch1('/list'); body = a.b; ms.push(a.ms); seen.push('answer'); await sleep(60); }
      const half = (await fetch1('/half')).b;
      ws.close(); agent.destroy();
      return { seen: seen.join(','), ms, body, half, conns: s.conns() };
    }
    const plain = await order(null), hub = await order(TLS);
    // the order is the evidence (lane oat-loop-gap-bound, .270 — a `< 20 ms` on each answer judged this run's clock): the
    // push leaves 15 ms after the answer's finish, a body held for the delayed ACK (~40 ms) lets it overtake the answer —
    // the bare-front CONTROL below reads exactly that (push first, ≥ 30 ms); the ms are printed, never judged
    ok(plain.seen === 'answer,push,answer,push,answer,push', `plain listen: the answer (its body after its head) arrives, THEN the push (${plain.seen}; ${plain.ms.join('/')} ms)`);
    ok(hub.seen === plain.seen && hub.body === 'headbody', `through the demux the same — no Nagle wait on the body, the push never overtakes the answer (${hub.seen}; ${hub.ms.join('/')} ms)`);
    ok(hub.half === plain.half && hub.half === 'true', `the handed socket is half-open like the http server's own accept (${hub.half})`);
    ok(hub.conns === plain.conns && hub.conns === 2, `keep-alive: seven requests ride ONE socket beside the WebSocket's (${hub.conns} connections, plain ${plain.conns})`);
    const s = shape(TLS), port = await s.listen();
    const mask = Buffer.from([1, 2, 3, 4]), pl = Buffer.from('hi');
    const frame = Buffer.concat([Buffer.from([0x81, 0x80 | pl.length]), mask, Buffer.from(pl.map((b, i) => b ^ mask[i % 4]))]);
    const up = await new Promise((resolve) => {
      const c = net.connect(port, '127.0.0.1', () => c.write(Buffer.concat([Buffer.from('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'), frame])));
      let b = ''; const t = setTimeout(() => { c.destroy(); resolve(b); }, 3000);
      c.on('data', (d) => { b += d.toString('latin1'); if (b.includes('ws:hi')) { clearTimeout(t); c.destroy(); resolve(b); } });
      c.on('error', () => resolve(b));
    });
    ok(gateOf(/^HTTP\/1\.1 101/.test(up)) && gateOf(up.includes('ws:hi')) && lastHead === frame.length, `an upgrade whose first write carries a frame: the head buffer (${lastHead} B) reaches ws, the echo answers`);
    const src = holdAbs(fs.readFileSync(path.join(REPO, 'src/server/tls.js'), 'utf8'));
    const from = 'function acceptAs(server, socket) {\n';
    ok(verdictOf(src.includes(from)), 'the control\'s anchor is in the module');
    const cp = path.join(DIR, 'tls-control-bare.js');
    fs.writeFileSync(cp, editAnchor(editAnchor(src, from, from + '  return; // CONTROL: the bare front\n', "src/server/tls.js"), "require('../tls-plan.js')", JSON.stringify(path.join(REPO, 'src/tls-plan.js')).replace(/^/, 'require(') + ')', "src/server/tls.js"));
    const bare = await order(require(cp));
    ok(bare.seen !== plain.seen && gateOf(bare.seen.startsWith('push,answer')) && Math.min(...bare.ms) >= 30, `CONTROL the bare front (Nagle on): the body waits for the delayed ACK, the push overtakes the answer — RED (${bare.seen}; ${bare.ms.join('/')} ms)`);
  }
  console.log('§6 THE BOOT\'S LISTEN STEP IN TURNS (B-cd4b, the round\'s follow): a connection while the step\'s turns run is handed over after its last turn');
  {
    // hub.turn(fn, name): fn in a loop turn of its own (src/server/loop-turns.js); the front reads a new connection's first bytes and
    // hands it to the servers only once the step's last turn has run — nothing asks the hub for a conversation before every survivor
    // is in the live set. The step here keeps itself open a turn at a time until the client's request is written and ten more turns
    // have passed (an accept and a read are two polled turns: the front has the bytes), then ends; each turn named through `step`.
    // RED: the hold taken away ⇒ the request answered while the step's turns still run. THE BOUND: a step that never ends lets go at
    // holdMaxMs and says so; its control (a bound past the step) answers only once the step ends.
    const scene = async (M, { tag, holdMaxMs, endAt = null } = {}) => {
      const names = [], warns = [], ev = [];
      const r = rig(M, { env: {}, dataDir: path.join(DIR, 'd7' + tag), tailscaleBin: null, step: (n, f) => { names.push(n); return f(); }, log: { log: () => { }, warn: (l) => warns.push(String(l)) }, ...(holdMaxMs ? { holdMaxMs } : {}) });
      const port = await listen(r.hub); closers.push(r.hub.front);
      let wrote = false, after = 0, ended = null, answered = null;
      const t0 = Date.now();
      r.httpServer.on('request', () => ev.push('handler'));
      const keep = () => { ev.push('turn'); if (endAt == null ? wrote && ++after >= 10 : Date.now() >= endAt(t0)) { ev.push('end'); setImmediate(() => ev.push('imm')); ended = Date.now() - t0; return; } r.hub.turn(keep, 'listen'); };
      r.hub.turn(keep, 'restore');
      const holding = r.hub.holding();
      const body = await new Promise((resolve) => {
        const c = net.connect(port, '127.0.0.1', () => c.write('GET /held HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', () => { wrote = true; }));
        let b = ''; const t = setTimeout(() => { c.destroy(); resolve(b); }, 8000);
        c.on('data', (d) => { if (answered === null) { answered = Date.now() - t0; ev.push('answer'); } b += d.toString('latin1'); });
        c.on('close', () => { clearTimeout(t); resolve(b); }); c.on('error', () => resolve(b));
      });
      const tEnd = Date.now() + 8000; while (ended === null && Date.now() < tEnd) await sleep(5);   // the step's own end (the bound's scenes outlive their answer)
      return { names, warns, ev: ev.filter((x, i) => x !== 'turn' || ev[i - 1] !== 'turn'), ended, answered, holding, after: r.hub.holding(), ok: /http GET \/held 0$/.test(body) };
    };
    const g6 = await scene(TLS, { tag: 'g' });
    const src = holdAbs(fs.readFileSync(path.join(REPO, 'src/server/tls.js'), 'utf8'));
    const from = '      if (held) held.then(() => setImmediate(hand));';
    ok(src.split(from).length === 2, 'the control\'s anchor is in the module');
    const cp = path.join(DIR, 'tls-control-nohold.js');
    fs.writeFileSync(cp, anchored(anchored(anchored(src, from, '      if (false) held.then(() => setImmediate(hand));', 'b-cd4b-tls-no-hold'), "require('../tls-plan.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/tls-plan.js')) + ')', 'b-cd4b-tls-plan-path'), "require('./loop-turns.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/server/loop-turns.js')) + ')', 'b-cd4b-tls-turns-path'));
    const r6 = await scene(require(cp), { tag: 'r' });
    const cp2 = path.join(DIR, 'tls-control-inturn.js');
    fs.writeFileSync(cp2, anchored(anchored(anchored(src, '      if (held) held.then(() => setImmediate(hand));', '      if (held) held.then(hand);', 'b-cd4b-tls-in-turn'), "require('../tls-plan.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/tls-plan.js')) + ')', 'b-cd4b-tls-plan-path2'), "require('./loop-turns.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/server/loop-turns.js')) + ')', 'b-cd4b-tls-turns-path2'));
    const i6 = await scene(require(cp2), { tag: 'i' });
    ok(gateOf(g6.ok) && gateOf(g6.holding) && !g6.after && g6.ev.indexOf('answer') > g6.ev.indexOf('end') && g6.ev.indexOf('end') > 0 && g6.names[0] === 'restore' && g6.names.length > 2 && verdictOf(g6.names.slice(1).every((n) => n === 'listen')),
      `held: a request written while the step's turns run is answered AFTER its last turn (${g6.ev.join(' → ')}; the step ${g6.ended} ms, the answer at ${g6.answered} ms), each turn named (${g6.names[0]}, then ${g6.names.length - 1} × ${g6.names[1]}); holding while it runs, not after`, g6);
    ok(gateOf(r6.ok) && r6.ev.indexOf('answer') >= 0 && r6.ev.indexOf('answer') < r6.ev.indexOf('end'), `RED the hold taken away: the request answered while the step's turns still run (${r6.ev.join(' → ')})`, r6);
    ok(g6.ev.indexOf('imm') >= 0 && g6.ev.indexOf('imm') < g6.ev.indexOf('handler') && gateOf(i6.ok) && i6.ev.indexOf('handler') < i6.ev.indexOf('imm'),
      `the hand-over is a turn after the step's last, never inside its hold: an immediate the last turn asks runs before the held request's handler (${g6.ev.join(' → ')}); RED handed in the last turn's own drain ⇒ the handler first (${i6.ev.join(' → ')})`, { g: g6.ev, i: i6.ev });
    const b6 = await scene(TLS, { tag: 'b', holdMaxMs: 120, endAt: (t) => t + 400 }), c6 = await scene(TLS, { tag: 'c', holdMaxMs: 60000, endAt: (t) => t + 400 });
    ok(gateOf(b6.ok) && b6.answered >= 110 && b6.answered < b6.ended && verdictOf(b6.warns.some((l) => /the boot's listen step held new connections 120 ms — handed over now/.test(l))),
      `THE BOUND: a step that does not end lets go at 120 ms, said (answered at ${b6.answered} ms, the step ended at ${b6.ended} ms: «${b6.warns[0] || 'nothing said'}»)`, b6);
    ok(gateOf(c6.ok) && c6.answered >= c6.ended, `its control: a bound past the step ⇒ answered only once the step ended (answered at ${c6.answered} ms, the step at ${c6.ended} ms)`, c6);
    // a THROW inside a step turn (planted; the process's uncaught handler hears it — the hub's ends the hub): the hold is lifted at once,
    // in the turn's finally. RED: the count moved out of the finally ⇒ the port stays held after the throw
    const withCopy = (text, tag) => { const f = path.join(DIR, `tls-control-${tag}.js`); fs.writeFileSync(f, anchored(anchored(text, "require('../tls-plan.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/tls-plan.js')) + ')', `${tag}-plan`), "require('./loop-turns.js')", 'require(' + JSON.stringify(path.join(REPO, 'src/server/loop-turns.js')) + ')', `${tag}-turns`)); return require(f); };
    const throwScene = async (Mod, tag) => {
      const heard = [];
      const onU = (e) => { if (e && e.message === 'planted: a throw in a step turn') heard.push(1); else throw e; };
      process.on('uncaughtException', onU);
      try {
        const r = rig(Mod, { env: {}, dataDir: path.join(DIR, 'd9' + tag), tailscaleBin: null, holdMaxMs: 60000 });
        await listen(r.hub); closers.push(r.hub.front);
        r.hub.turn(() => { throw new Error('planted: a throw in a step turn'); }, 'restore');
        const before = r.hub.holding(), tEnd = Date.now() + 2000;
        while (!heard.length && Date.now() < tEnd) await sleep(5);
        return { before, heard: heard.length, after: r.hub.holding() };
      } finally { process.removeListener('uncaughtException', onU); }
    };
    const t8 = await throwScene(TLS, 'g');
    const t8r = await throwScene(withCopy(anchored(src, "    require('./loop-turns.js').turn(() => { try { step(name, fn); } finally { if (!--stepTurns) letGo(); } });", "    require('./loop-turns.js').turn(() => { step(name, fn); if (!--stepTurns) letGo(); });", 'b-cd4b-tls-count-out'), 'b-cd4b-tls-count-out'), 'r');
    ok(gateOf(t8.before) && t8.heard === 1 && !t8.after, `a throw inside a step turn: it reaches the process and the hold is lifted at once (held before ${t8.before}, after ${t8.after})`, t8);
    ok(t8r.heard === 1 && t8r.after === true, 'RED: the count moved out of the finally ⇒ the port stays held after the throw', t8r);
    // a socket that ERRORS while held (the client resets after its first byte): dropped as before the first byte, no unhandled error.
    // RED: the drop listener removed at the first byte (as at the base) ⇒ the reset is an unhandled error
    const resetScene = async (Mod, tag) => {
      const unheard = [];
      const onU = (e) => { unheard.push(String((e && e.code) || (e && e.message) || e)); };
      process.on('uncaughtException', onU);
      let open = true;
      try {
        const r = rig(Mod, { env: {}, dataDir: path.join(DIR, 'd10' + tag), tailscaleBin: null, holdMaxMs: 60000 });
        const port = await listen(r.hub); closers.push(r.hub.front);
        let srv = null; r.hub.front.on('connection', (s) => { srv = s; });
        const keep = () => { if (open) r.hub.turn(keep, 'listen'); }; r.hub.turn(keep, 'restore');
        const c = net.connect(port, '127.0.0.1'); c.on('error', () => { });
        await new Promise((res) => c.on('connect', res));
        c.write('G');
        const t1 = Date.now() + 2000; while (!(srv && srv.bytesRead > 0) && Date.now() < t1) await sleep(5);   // the front has its first byte: held
        const heldThen = r.hub.holding();
        c.resetAndDestroy();
        let closed = false; if (srv) srv.once('close', () => { closed = true; });
        const t2 = Date.now() + 2000; while (!closed && !unheard.length && Date.now() < t2) await sleep(5);
        return { heldThen, read: !!srv && srv.bytesRead > 0, closed, unheard };
      } finally { open = false; process.removeListener('uncaughtException', onU); }
    };
    const e9 = await resetScene(TLS, 'g');
    const e9r = await resetScene(withCopy(anchored(src, "      socket.removeListener('timeout', drop); socket.setTimeout(0);\n", "      socket.removeListener('error', drop); socket.removeListener('timeout', drop); socket.setTimeout(0);\n", 'b-cd4b-tls-drop-gone'), 'b-cd4b-tls-drop-gone'), 'r');   // stale-pins: kept (the red plants the base's first-byte handler)
    ok(gateOf(e9.heldThen) && gateOf(e9.read) && gateOf(e9.closed) && e9.unheard.length === 0, `a held socket reset by its client: dropped (closed ${e9.closed}), no unhandled error (${JSON.stringify(e9.unheard)})`, e9);
    ok(gateOf(e9r.read) && verdictOf(e9r.unheard.some((x) => /ECONNRESET/.test(x))), `RED: the drop listener removed at the first byte ⇒ the reset is an unhandled error (${JSON.stringify(e9r.unheard)})`, e9r);
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + (e && e.stack)); }
finally {
  for (const s of closers) { try { s.close(); } catch { } }
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
