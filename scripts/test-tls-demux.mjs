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
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebSocketServer, WebSocket } = require(path.join(REPO, 'node_modules/ws'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
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
  ok(r1.hub.url() === `https://localhost:0` || /^https:\/\/localhost:/.test(r1.hub.url() || ''), `the certificate on disk is served from boot, before any pass: ${r1.hub.url()}`);
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
  ok(/^HTTP\/1\.1 200[\s\S]*http GET \/slow 0$/.test(slow), 'a slow first byte, then the rest split ⇒ still the http server');
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
  ok(r3.hub.url() === `https://${DNS}:0` && fs.existsSync(path.join(DIR, 'd3/tls', DNS + '.crt')), `acquired into data/tls/<domain>.crt: ${r3.hub.url()}`);
  ok(await wsEcho(`wss://127.0.0.1:${p3}/ws`) === 'wss:ping', 'the https server born AFTER attachToServers replays the upgrade listener');
  ok(T3.items.length === 0, 'a live certificate files no For-you item');

  const T4 = todos();
  const d4 = path.join(DIR, 'd4');
  for (const boot of [1, 2]) {
    const r4 = rig(TLS, { env: {}, dataDir: d4, run: mkRun({ listed: false }).run, getUserTodos: () => T4 });
    await r4.hub.pass();
    ok(r4.hub.status().why === 'https-not-enabled', `boot ${boot}: CertDomains null ⇒ https-not-enabled`);
  }
  ok(T4.items.length === 1 && T4.items[0].i18n.text.key.startsWith('Tailscale HTTPS certificates are off'), `the "not enabled" For-you item ONCE across two boots (${T4.items.length})`);
  const r4b = rig(TLS, { env: {}, dataDir: d4, run: mkRun({ listed: true, denied: true }).run, getUserTodos: () => T4 });
  await r4b.hub.pass(); await r4b.hub.pass();
  ok(r4b.hub.status().why === 'operator-needed' && T4.items.length === 2 && T4.items[1].text.includes('sudo tailscale set --operator=') && T4.items[0].status === 'done', 'the state moves (cert access denied) ⇒ ONE operator-needed item, the not-enabled one resolved');
  const r4c = rig(TLS, { env: {}, dataDir: d4, run: mkRun({ listed: true }).run, getUserTodos: () => T4 });
  await r4c.hub.pass();
  ok(r4c.hub.url() === `https://${DNS}:0` && T4.items[1].status === 'done' && T4.items.length === 2, 'the operator right granted ⇒ the next pass acquires and resolves the item, nothing new filed');

  console.log('§4 CONTROL');
  {
    const src = fs.readFileSync(path.join(REPO, 'src/server/tls.js'), 'utf8');
    const from = '      for (const [e, f] of listeners) httpsServer.on(e, f);\n';
    ok(src.includes(from), 'the control\'s anchor is in the module');
    const cp = path.join(DIR, 'tls-control.js');
    fs.writeFileSync(cp, src.replace(from, '').replace("require('../tls-plan.js')", JSON.stringify(path.join(REPO, 'src/tls-plan.js')).replace(/^/, 'require(') + ')'));
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
    ok(/^HTTP\/1\.1 101/.test(up) && up.includes('ws:hi') && lastHead === frame.length, `an upgrade whose first write carries a frame: the head buffer (${lastHead} B) reaches ws, the echo answers`);
    const src = fs.readFileSync(path.join(REPO, 'src/server/tls.js'), 'utf8');
    const from = 'function acceptAs(server, socket) {\n';
    ok(src.includes(from), 'the control\'s anchor is in the module');
    const cp = path.join(DIR, 'tls-control-bare.js');
    fs.writeFileSync(cp, src.replace(from, from + '  return; // CONTROL: the bare front\n').replace("require('../tls-plan.js')", JSON.stringify(path.join(REPO, 'src/tls-plan.js')).replace(/^/, 'require(') + ')'));
    const bare = await order(require(cp));
    ok(bare.seen !== plain.seen && bare.seen.startsWith('push,answer') && Math.min(...bare.ms) >= 30, `CONTROL the bare front (Nagle on): the body waits for the delayed ACK, the push overtakes the answer — RED (${bare.seen}; ${bare.ms.join('/')} ms)`);
  }
} catch (e) { fail++; console.log('  ✗ threw: ' + (e && e.stack)); }
finally {
  for (const s of closers) { try { s.close(); } catch { } }
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
