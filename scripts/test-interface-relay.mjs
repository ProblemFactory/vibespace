#!/usr/bin/env node
// THE INTERFACE'S LAWS AND ITS RELAY (the separation, M1 — lane B, piece B2's first half; design «The processes (revision)»
// — interface, «The link», M1's proof). src/interface/ is driven in-process: its one listener on a loopback port, a far
// party behind a REAL link (the tree's src/agentd/mux.js over a unix socket) that serves each channel as an HTTP connection
// (a test-only channel stream) or as a raw echo.
//   ① THE MODULE GRAPH: src/interface's requires reach only src/interface/*, the frame code and node built-ins — no engine,
//     vault, secret-box, store or normaliser module. RED CONTROL: a planted require is caught.
//   ② NO SYNCHRONOUS DISK CALL once it listens: plain and TLS exchanges and a 2 MB answer relayed — 0 fs *Sync calls.
//     RED CONTROL: the relay with one planted stat on its byte path is counted.
//   ③ THE LAW OF THE SOCKET'S OWNER (piece B1's bench): a page socket's options are set HERE — a keystroke's echo written as
//     two pieces by the party comes back at once. RED CONTROL: the default left on (Nagle): the same round trips wait.
//   ④ UNDER CREDIT: a page that stops reading an 8 MB answer — what waits in this process stays within one window, the
//     rest in the party's own queue. RED CONTROL: credit given back for every byte received holds megabytes here.
//   ⑤ TLS: no certificate live ⇒ a ClientHello is closed; a pushed certificate ⇒ decrypted here, the party gets the bytes
//     with stamp.secure; a renewal is taken without a restart.
//   ⑥ THE OPEN LINE: one per channel, written by this process only — {op, chan, to: the owner map's answer, trace, stamp}; a
//     page's own header claiming a stamp reaches the party as bytes, never as the stamp.
//   ⑦ CLOSES: a page's end closes its channel; the party's close ends the page; a dead link closes every page.
//   The cure round (主开发 2026-11-17 05:26Z, accept-B2a.json):
//   ⑧ THE LISTENER NEVER ENDS ON ITS OWN ERROR: a failed accept emitted on the listening server is counted and the server
//     keeps answering (judged in a child). RED CONTROL: without the permanent listener the child process ends.
//   ⑨ THE FIRST BYTE THAT NEVER COMES: a silent connection is dropped at the interface's own first-byte bound and opens no
//     channel. RED CONTROL: the bound not set — the silent socket stays.
//   ④ also: the stalled page RESUMES and gets every byte (RED CONTROL: the drain's credit removed — it stalls for good), and
//     the other direction: an owner that stops reading while a page uploads — the page socket is paused and at most one
//     window waits here (RED CONTROL: no pause).
//   On lane readings' cured frame code (78f27628f — the queued close OPT-IN, set by the interface's link):
//   ⑩ MUST 2 — EVERY PAGE CONNECTION LEAVES NOTHING IN THE LINK'S FRAME CODE: 1 000 page connections opened and closed ⇒
//     the link keeps no send window and no queue for any of them (every pair drop goes through closeChan, which forgets
//     once its CLOSE is out — the relay needs no forget of its own; 10 000 by hand, the same). RED CONTROL: the frame code's
//     forget neutered.
//   ⑪ MUST 4 — A CLOSE NEVER OVERTAKES ITS OWN BYTES: a page uploads one window + 1000 bytes and ends, to an owner that
//     holds its credit ⇒ the owner has every byte when the close arrives. RED CONTROL: the interface's link built without
//     closeAfterQueue (the frame code's released close) ⇒ the close arrives first.
// in-process; a scratch dir under os.tmpdir(); a throwaway self-signed pair made with openssl.
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { execFileSync } from 'node:child_process';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Mux, INITIAL_WINDOW } = require(path.join(REPO, 'src/agentd/mux.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await sleep(5); } return true; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });

/** a module of the tree compiled from `src` at its own path (a mutant keeps the real one's relative requires) */
/** `rel`'s source with ONE line cut or swapped — the needle must occur exactly once, or the control is void (it throws) */
function mutant(rel, needle, into) { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return compileAt(rel, src.replace(needle, into)); }
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
/** the interface with chosen modules swapped in (a mutant front or relay) — index.js's own wiring, compiled with them */
function interfaceWith({ front = null, relay = null, mux = null, index = null, admission = null } = {}) {
  const idx = (index || read('src/interface/index.js')).replace("require('./front.js')", 'globalThis.__vsFront').replace("require('./relay.js')", 'globalThis.__vsRelay').replace("require('../agentd/mux.js')", 'globalThis.__vsMux').replace("require('./admission.js')", 'globalThis.__vsAdmission');
  globalThis.__vsAdmission = admission || require(path.join(REPO, 'src/interface/admission.js'));
  globalThis.__vsMux = mux || require(path.join(REPO, 'src/agentd/mux.js'));
  globalThis.__vsFront = front || require(path.join(REPO, 'src/interface/front.js'));
  globalThis.__vsRelay = relay || require(path.join(REPO, 'src/interface/relay.js'));
  return compileAt('src/interface/index.js', idx);
}

// THE FAR PARTY: joins the interface's link (a unix socket pair through a listener here) and serves each opened channel
const far = { opens: [], mode: 'http', mux: null, chans: new Map() };
class ChanStream extends Duplex {
  constructor(mux, chan) { super({ allowHalfOpen: true }); this.mux = mux; this.chan = chan; this._owed = 0; this._wcb = null; this.remoteAddress = '127.0.0.1'; }
  _in(b) { if (this.push(b)) this.mux.credit(this.chan, b.length); else this._owed += b.length; }
  _read() { if (this._owed) { const n = this._owed; this._owed = 0; this.mux.credit(this.chan, n); } }
  _write(c, e, cb) { if (this.mux.data(this.chan, c)) cb(); else this._wcb = cb; }
  _writable() { const cb = this._wcb; this._wcb = null; if (cb) cb(); }
  _final(cb) { this.mux.closeChan(this.chan); cb(); }
  setTimeout() { return this; } setNoDelay() { return this; } setKeepAlive() { return this; }
}
const app = http.createServer((req, res) => {
  if (req.url.startsWith('/big')) { const n = Number(new URL(req.url, 'http://x').searchParams.get('n')) || 1; res.writeHead(200, { 'content-length': n }); res.end(Buffer.alloc(n, 7)); return; }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ path: req.url, stampHeader: req.headers['x-vs-stamp'] || null }));
});
/** the far party's start secret (piece B2b: a link is a party only once its hello is admitted) and its digest */
const HUB_SECRET = crypto.randomBytes(32).toString('hex');
const HUB_DIGEST = crypto.createHash('sha256').update(HUB_SECRET).digest('hex');
function farJoin(sockPath, secret = HUB_SECRET) {
  return new Promise((resolve) => {
    const s = net.connect(sockPath, () => { if (secret !== null) mux.control({ op: 'hello', protoVersion: 1, party: 'hub', secret }); resolve(); });
    const mux = new Mux(s, {
      heartbeat: false,
      onControl: (m) => {
        if (m && m.op === 'hello-ack') { far.acked = m; return; }
        if (m && m.op === 'auth-fail') { far.refused = true; return; }
        if (m && m.op === 'certificate-ack') { far.certAcks.push(m); return; }
        if (!m || m.op !== 'open') return;
        far.opens.push(m);
        if (far.mode === 'http') { const d = new ChanStream(mux, m.chan); far.chans.set(m.chan, { d }); d.on('error', () => { }); app.emit('connection', d); return; }
        far.chans.set(m.chan, { raw: true, acc: '' });
      },
      onData: (chan, buf) => {
        const c = far.chans.get(chan);
        if (!c) { mux.credit(chan, buf.length); return; }
        if (c.d) { c.d._in(buf); return; }
        if (c.sink) { c.sunk = (c.sunk || 0) + buf.length; return; }   // THE OWNER STOPS READING: no credit goes back
        if (c.slow) { c.got += buf.length; setTimeout(() => mux.credit(chan, buf.length), c.slow); return; }   // A SLOW OWNER: credit comes late
        mux.credit(chan, buf.length);
        c.acc += buf.toString();
        let i;
        while ((i = c.acc.indexOf('\n')) >= 0) {
          const line = c.acc.slice(0, i); c.acc = c.acc.slice(i + 1);
          if (line === 'PING') { mux.data(chan, Buffer.from('PO')); mux.data(chan, Buffer.from('NG\n')); }   // the echo in TWO writes, as a websocket frame's head and body go
          else if (line.startsWith('BIG ')) {
            let left = Number(line.slice(4)); const chunk = Buffer.alloc(65536, 1);
            const pump = () => { while (left > 0) { const n = Math.min(left, chunk.length); left -= n; if (!mux.data(chan, chunk.subarray(0, n))) { far.waiting = pump; return; } } };
            pump();
          } else if (line === 'BYE') mux.closeChan(chan);
          else if (line === 'SINK') { c.sink = true; c.acc = ''; break; }
          else if (line.startsWith('SLOW ')) { c.slow = Number(line.slice(5)) || 50; c.got = Buffer.byteLength(c.acc); c.acc = ''; break; }
        }
      },
      onClose: (chan) => { const c = far.chans.get(chan); far.closed = (far.closed || 0) + 1; if (c && c.slow) c.gotAtClose = c.got; if (c && c.d) c.d.push(null); },
      onWritable: (chan) => { const c = far.chans.get(chan); if (c && c.d) c.d._writable(); else if (far.waiting) { const w = far.waiting; far.waiting = null; w(); } },
    });
    far.mux = mux;
  });
}
/** an interface listening on a loopback port with the far party joined over a fresh unix-socket link */
let nIface = 0;
async function boot(I = require(path.join(REPO, 'src/interface/index.js')), opts = {}) {
  const iface = I.create(opts);
  const addr = await iface.listen(0, '127.0.0.1');
  const sock = path.join(T, `l${++nIface}.sock`);
  let link = null;
  const linkSrv = net.createServer((s) => { link = iface.attachLink(s); }).listen(sock);
  await new Promise((r) => linkSrv.once('listening', r));
  far.opens = []; far.chans = new Map(); far.mode = 'http'; far.acked = null; far.refused = false; far.certAcks = [];
  iface.admit({ party: 'hub', digest: HUB_DIGEST });   // the supervisor's admit line, written before the party starts
  await farJoin(sock);
  await until(() => iface.stats().linked);
  return { iface, port: addr.port, sock, link: () => link, close: async () => { try { far.mux.destroy(); } catch { } await iface.close(); linkSrv.close(); } };
}
const get = (port, p, { secure = false, headers = {} } = {}) => new Promise((resolve) => {
  const q = (secure ? https : http).get({ host: '127.0.0.1', port, path: p, headers, agent: false, rejectUnauthorized: false }, (res) => {
    const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(parts) }));
  });
  q.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
});
function rawClient(port) {
  return new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => resolve(s)); s.on('error', () => { }); });
}
async function roundTrips(port, n = 30) {
  const s = await rawClient(port); const times = [];
  let acc = '', waiter = null; s.on('data', (b) => { acc += b.toString(); if (acc.includes('PONG\n')) { acc = acc.replace('PONG\n', ''); const w = waiter; waiter = null; w && w(); } });
  for (let i = 0; i < n; i++) { const t0 = performance.now(); await new Promise((r) => { waiter = r; s.write('PING\n'); }); times.push(performance.now() - t0); }
  s.destroy();
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(n / 2)], p90: times[Math.floor(n * 0.9)] };
}

console.log('— ① THE MODULE GRAPH');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const graph = (entry, readFn = read) => {
    const seen = new Set(), builtins = new Set(), stack = [entry];
    while (stack.length) {
      const rel = stack.pop(); if (seen.has(rel)) continue; seen.add(rel);
      for (const m of strip(readFn(rel)).matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1];
        if (!spec.startsWith('.')) { builtins.add(spec.replace(/^node:/, '')); continue; }
        stack.push(path.relative(REPO, path.resolve(path.dirname(path.join(REPO, rel)), spec)).replace(/\\/g, '/'));
      }
    }
    return { files: [...seen].sort(), builtins: [...builtins].sort() };
  };
  const g = graph('src/interface/index.js');
  const FORBIDDEN = /engine|vault|secret|store|normali[sz]er|message-manager|accounts|channel|auth\b|session/;
  ok(JSON.stringify(g.files) === JSON.stringify(['src/agentd/mux.js', 'src/interface/admission.js', 'src/interface/front.js', 'src/interface/index.js', 'src/interface/owners.js', 'src/interface/relay.js', 'src/pairing-token.js']) && g.files.every((f) => !FORBIDDEN.test(f)),
    `its module graph: ${g.files.join(', ')} — no engine, vault, secret-box, store or normaliser module (src/pairing-token.js: the constant-time compare of the admission, crypto only)`, g.files);
  ok(JSON.stringify(g.builtins) === JSON.stringify(['crypto', 'net', 'tls']), `node built-ins only: ${g.builtins.join(', ')}`, g.builtins);
  const planted = graph('src/interface/index.js', (rel) => (rel === 'src/interface/relay.js' ? read(rel).replace("const crypto = require('crypto');", "const crypto = require('crypto'); require('../server/vault-engine.js');") : read(rel)));
  ok(planted.files.includes('src/server/vault-engine.js') && planted.files.some((f) => FORBIDDEN.test(f)), 'RED CONTROL — a vault module planted in the relay is caught by the walk', planted.files);
}

console.log('— ② NO SYNCHRONOUS DISK CALL once it listens');
const mkPair = (cn) => {
  const key = path.join(T, `${cn}.key.pem`), cert = path.join(T, `${cn}.cert.pem`);
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', `/CN=${cn}`], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
};
const pair = mkPair('localhost'), pair2 = mkPair('renewed');
const cp = require('child_process'), zlib = require('zlib');
async function syncCalls(I) {
  const B = await boot(I);
  let n = 0; const saved = [];
  for (const mod of [fs, cp, zlib]) for (const k of Object.keys(mod)) if (/Sync$/.test(k) && typeof mod[k] === 'function') { const f = mod[k]; saved.push([mod, k, f]); mod[k] = (...a) => { n++; return f(...a); }; }
  let rs;
  try {
    B.iface.useCertificate(pair);   // the certificate pushed, and renewed, inside the counted window
    rs = [];
    for (let i = 0; i < 10; i++) rs.push(await get(B.port, `/p/${i}`));
    for (let i = 0; i < 3; i++) rs.push(await get(B.port, `/s/${i}`, { secure: true }));
    B.iface.useCertificate(pair2);
    rs.push(await get(B.port, '/s/after-renewal', { secure: true }));
    rs.push(await get(B.port, '/big?n=2097152'));
  } finally { for (const [mod, k, f] of saved) mod[k] = f; }
  await B.close();
  return { n, ok: rs.every((r) => r.status === 200) && rs[rs.length - 1].body.length === 2097152 };
}
{
  const law = await syncCalls();
  ok(law.ok && law.n === 0, `10 plain and 4 TLS exchanges, a certificate pushed and renewed, a 2 MB answer: ${law.n} synchronous fs / child_process / zlib calls`, law);
  const files = fs.readdirSync(path.join(REPO, 'src/interface')).filter((f) => f.endsWith('.js'));
  const syncForms = [...files.map((f) => `src/interface/${f}`), 'src/start-pipe.js'].flatMap((rel) => [...read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').matchAll(/\b[A-Za-z]+Sync\b/g)].map((m) => `${rel}: ${m[0]}`));   // + the reader the interface shares with the hub
  ok(JSON.stringify(files.sort()) === JSON.stringify(['admission.js', 'front.js', 'index.js', 'main.js', 'owners.js', 'relay.js']) && syncForms.length === 0, `and read statically: no …Sync name in src/interface's ${files.length} files nor in src/start-pipe.js, the reader it shares (a reference taken at load is seen too)`, syncForms);
  const mutRelay = mutant('src/interface/relay.js', "      stats.toPage += buf.length;", "      stats.toPage += buf.length; require('fs').statSync(__filename);");
  const mut = await syncCalls(interfaceWith({ relay: mutRelay }));
  ok(mut.ok && mut.n > 0, `RED CONTROL — one stat planted on the relay's byte path: ${mut.n} counted`, mut);
}

console.log('— ③ THE LAW OF THE SOCKET\'S OWNER (a keystroke\'s echo in two pieces)');
/** what every accepted socket was told: a spy on net.Socket's two option calls while `n` pages connect */
async function optionsSeen(I, n = 4) {
  const B = await boot(I); far.mode = 'raw';
  const seen = { noDelay: 0, keepAlive: 0 }, P = net.Socket.prototype, nd = P.setNoDelay, ka = P.setKeepAlive;
  P.setNoDelay = function (on) { if (on === true || on === undefined) seen.noDelay++; return nd.apply(this, arguments); };
  P.setKeepAlive = function (on) { if (on === true) seen.keepAlive++; return ka.apply(this, arguments); };
  try { for (let i = 0; i < n; i++) { const s = await rawClient(B.port); s.write('PING\n'); await sleep(20); s.destroy(); } }
  finally { P.setNoDelay = nd; P.setKeepAlive = ka; }
  await B.close();
  return seen;
}
{
  const B = await boot(); far.mode = 'raw';
  const law = await roundTrips(B.port);
  await B.close();
  const mutFront = mutant('src/interface/front.js', '  socket.setNoDelay(true);\n', '  socket.setNoDelay(false);\n');
  const M = await boot(interfaceWith({ front: mutFront })); far.mode = 'raw';
  const nagle = await roundTrips(M.port);
  await M.close();
  ok(law.median * 3 < nagle.median, `30 keystroke round trips: median ${law.median.toFixed(2)} ms with the socket's options set here — RED CONTROL, the default left on (Nagle): ${nagle.median.toFixed(2)} ms`, { law, nagle });
  const opts = await optionsSeen();
  const bare = await optionsSeen(interfaceWith({ front: mutant('src/interface/front.js', '  socket.setNoDelay(true);\n  socket.setKeepAlive(true, 0);\n', '') }));
  ok(opts.noDelay >= 4 && opts.keepAlive >= 4 && bare.noDelay === 0 && bare.keepAlive === 0, `4 pages: every socket told no-delay (${opts.noDelay}) and keep-alive (${opts.keepAlive}) HERE — RED CONTROL, the options cut: ${bare.noDelay} / ${bare.keepAlive}`, { opts, bare });
}

console.log('— ④ UNDER CREDIT, BOTH WAYS');
const BIG = 64 * 1024 * 1024;   // far larger than any kernel's loopback buffers: what is held here cannot be the kernel's doing
async function stalledThenResumed(I, { resumeMs = 15000 } = {}) {
  const B = await boot(I); far.mode = 'raw';
  const s = await rawClient(B.port); s.pause();   // the page stops reading
  s.write(`BIG ${BIG}\n`);
  let last = -1, steady = 0, maxHeld = 0;
  for (let i = 0; i < 300 && steady < 10; i++) { await sleep(10); const h = B.iface.stats().held; maxHeld = Math.max(maxHeld, h); steady = h === last ? steady + 1 : 0; last = h; }
  const held = B.iface.stats().held;
  let got = 0; s.on('data', (b) => { got += b.length; }); s.resume();   // the page reads again
  await until(() => got >= BIG, resumeMs);
  s.destroy(); await B.close();
  return { held, maxHeld, got };
}
{
  const law = await stalledThenResumed();
  ok(law.maxHeld > 0 && law.held <= INITIAL_WINDOW + 65536, `a page that stops reading a 64 MB answer: ${law.held} bytes wait in the interface (seen above zero: ${law.maxHeld}) — one window (${INITIAL_WINDOW}) and at most one 64 KiB write below the socket's line; the rest waits in the party's own queue`, law);
  ok(law.got === BIG, `the page reads again: all ${law.got} bytes arrive (the withheld credit goes back at each drain)`, law);
  const onReceipt = await stalledThenResumed(interfaceWith({ relay: mutant('src/interface/relay.js', '        if (p.page.write(buf)) m.credit(chan, buf.length);\n        else { p.owed += buf.length; stats.withheld++; }', '        p.page.write(buf); m.credit(chan, buf.length);') }), { resumeMs: 15000 });
  ok(onReceipt.held > 4 * INITIAL_WINDOW, `RED CONTROL — credit given back for every byte received: ${onReceipt.held} bytes wait in the interface`, onReceipt.held);
  const noDrain = await stalledThenResumed(interfaceWith({ relay: mutant('src/interface/relay.js', "    page.on('drain', () => { if (p.owed && live()) { const n = p.owed; p.owed = 0; m.credit(chan, n); } });\n", '') }), { resumeMs: 1500 });
  ok(noDrain.got < BIG, `RED CONTROL — the drain's credit removed: the page reads again and gets ${noDrain.got} of ${BIG} bytes, then nothing`, noDrain);
}
async function uploadToDeafOwner(I) {
  const B = await boot(I); far.mode = 'raw';
  const s = await rawClient(B.port);
  s.write('SINK\n');
  await until(() => [...far.chans.values()].some((c) => c.sink));
  const chunk = Buffer.alloc(65536, 3); let sent = 0;
  const pump = () => { while (sent < 16 * 1024 * 1024) { sent += chunk.length; if (!s.write(chunk)) { s.once('drain', pump); return; } } };
  pump();
  let last = -1, steady = 0;
  for (let i = 0; i < 300 && steady < 10; i++) { await sleep(10); const t = B.iface.stats().toLink; steady = t === last ? steady + 1 : 0; last = t; }
  const st = B.iface.stats();
  s.destroy(); await B.close();
  return { toLink: st.toLink, paused: st.paused };
}
{
  const law = await uploadToDeafOwner();
  ok(law.paused >= 1 && law.toLink <= INITIAL_WINDOW + 2 * 65536, `a page uploads 16 MB to an owner that stopped reading: the page socket is paused (${law.paused}) and ${law.toLink} bytes were taken from it — one window and a chunk; the rest stays in the page's own buffers`, law);
  const noPause = await uploadToDeafOwner(interfaceWith({ relay: mutant('src/interface/relay.js', "    page.on('data', (b) => { stats.toLink += b.length; if (live() && !m.data(chan, b)) { page.pause(); stats.paused++; } });", "    page.on('data', (b) => { stats.toLink += b.length; if (live()) m.data(chan, b); });") }));
  ok(noPause.toLink > 8 * INITIAL_WINDOW, `RED CONTROL — no pause: ${noPause.toLink} bytes taken from the page and queued here for an owner that reads nothing`, noPause);
}

console.log('— ⑤ TLS, decrypted here with a pushed certificate');
const peerCN = (port) => new Promise((resolve) => { const c = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, () => { const cn = c.getPeerCertificate().subject.CN; c.destroy(); resolve(cn); }); c.on('error', () => resolve(null)); });
async function renewal(I) {
  const B = await boot(I); B.iface.useCertificate(pair);
  const before = await peerCN(B.port);
  B.iface.useCertificate(pair2);
  const after = await peerCN(B.port);
  await B.close();
  return { before, after };
}
{
  const B = await boot();
  const before = await new Promise((resolve) => { const c = tls.connect({ host: '127.0.0.1', port: B.port, rejectUnauthorized: false }); c.on('secureConnect', () => { c.destroy(); resolve('secure'); }); c.on('error', () => resolve('closed')); c.on('close', () => resolve('closed')); });
  ok(before === 'closed' && B.iface.stats().tls === false, `no certificate live: a ClientHello is closed (${before})`);
  B.iface.useCertificate(pair);
  const r = await get(B.port, '/hello', { secure: true });
  const open = far.opens[far.opens.length - 1];
  ok(r.status === 200 && JSON.parse(r.body).path === '/hello' && open.stamp.secure === true, 'a pushed certificate: the page\'s TLS ends here, the party gets the request with stamp.secure', { status: r.status, stamp: open && open.stamp });
  await B.close();
  const law = await renewal();
  ok(law.before === 'localhost' && law.after === 'renewed', `a renewal with ANOTHER certificate is served in place: ${law.before} → ${law.after}`, law);
  const ignored = await renewal(interfaceWith({ front: mutant('src/interface/front.js', '    } else tlsServer.setSecureContext({ cert: pem.cert, key: pem.key });   // a renewal: no restart', '    }') }));
  ok(ignored.after === 'localhost', `RED CONTROL — the renewal ignored: the page still sees ${ignored.after}`, ignored);
}

console.log('— ⑥ THE OPEN LINE');
{
  const B = await boot();
  const rs = [];
  for (let i = 0; i < 5; i++) rs.push(await get(B.port, `/x/${i}`, { headers: { 'x-vs-stamp': '{"secure":true,"who":"owner"}' } }));
  const o = far.opens[far.opens.length - 1];
  ok(rs.every((r) => r.status === 200) && far.opens.length === 5 && new Set(far.opens.map((x) => x.chan)).size === 5, `5 page connections: exactly 5 open lines, one per channel (${far.opens.length})`, far.opens.map((x) => x.chan));
  ok(JSON.stringify(Object.keys(o).sort()) === JSON.stringify(['chan', 'op', 'stamp', 'to', 'trace']) && o.to === 'hub' && o.stamp.secure === false && o.stamp.addr === '127.0.0.1' && typeof o.trace === 'string' && o.trace.length === 16,
    `each: {op, chan, to: '${o && o.to}' (the owner map's answer), trace, stamp: {secure: ${o && o.stamp.secure}, addr, port}}`, o);
  ok(JSON.parse(rs[4].body).stampHeader === '{"secure":true,"who":"owner"}' && far.opens.every((x) => x.stamp.secure === false && !('who' in x.stamp)), 'a page\'s own header claiming a stamp reaches the party as bytes — never as the stamp');
  await B.close();
}

console.log('— ⑦ CLOSES');
{
  const B = await boot(); far.mode = 'raw';
  const s = await rawClient(B.port); s.write('PING\n');
  await until(() => far.chans.size === 1);
  const c0 = far.closed || 0; s.end();
  ok(await until(() => (far.closed || 0) > c0), 'a page\'s end closes its channel at the party');
  const s2 = await rawClient(B.port); let ended = false; s2.on('end', () => { ended = true; }); s2.write('BYE\n');
  ok(await until(() => ended), 'the party\'s close ends the page');
  const s3 = await rawClient(B.port); let gone = false; s3.on('close', () => { gone = true; }); s3.resume(); s3.write('PING\n');   // a page that reads (a socket holding unread bytes never says close)
  await until(() => far.chans.size >= 3);
  far.mux.destroy();
  const wentAway = await until(() => gone), st = B.iface.stats();
  ok(wentAway && st.linked === false && st.channels === 0, `a dead link closes every page (page closed: ${wentAway}, linked: ${st.linked}, channels: ${st.channels})`, st);
  await B.close();
}

console.log('— ⑩ EVERY PAGE CONNECTION LEAVES NOTHING IN THE LINK\'S FRAME CODE');
async function connectionsLeave(I, N = 1000) {
  const B = await boot(I);   // HTTP: each page connection one exchange its server answers and closes (Connection: close)
  const before = { win: B.link()._sendWin.size, q: B.link()._sendQ.size };
  const one = () => new Promise((res) => { const t = setTimeout(res, 5000); get(B.port, '/c').then(() => { clearTimeout(t); res(); }); });
  for (let i = 0; i < N; i += 100) await Promise.all(Array.from({ length: Math.min(100, N - i) }, one));
  await until(() => B.iface.stats().channels === 0, 3000);
  const after = { win: B.link()._sendWin.size, q: B.link()._sendQ.size, channels: B.iface.stats().channels, opened: B.iface.stats().opened };
  await B.close();
  return { before, after };
}
{
  const law = await connectionsLeave();
  ok(law.after.opened === 1000 && law.after.channels === 0 && law.after.win === law.before.win && law.after.q === law.before.q, `1 000 page connections opened and closed: the link's frame code keeps ${law.after.win} send windows and ${law.after.q} queues (it started with ${law.before.win} / ${law.before.q}); every pair drop goes through closeChan, which forgets once its CLOSE is out`, law);
  const MUX = read('src/agentd/mux.js'), FORGET = /  forget\(chan\) \{[^\n]*\}/g;
  ok((MUX.match(FORGET) || []).length === 1, 'CONTROL needle present (exactly once): the frame code\'s forget(chan)');
  const todays = interfaceWith({ mux: compileAt('src/agentd/mux.js', MUX.replace(FORGET, '  forget(chan) { }')) });
  const red = await connectionsLeave(todays);
  ok(red.after.win >= 900, `RED CONTROL — the frame code that never forgets a channel: ${red.after.win} send windows kept after 1 000 connections`, red);
}

console.log('— ⑪ A CLOSE NEVER OVERTAKES ITS OWN BYTES');
async function uploadThenEnd(I) {
  // one write of a window and 1000 bytes, then the end, to an owner that holds its credit 200 ms: the 1000 bytes are still
  // queued in the interface's frame code when the page's end is read — the moment a close could overtake them
  const B = await boot(I); far.mode = 'raw';
  const s = await rawClient(B.port); s.resume();
  s.write('SLOW 200\n');
  await until(() => [...far.chans.values()].some((c) => c.slow));
  const total = INITIAL_WINDOW + 1000;
  s.end(Buffer.alloc(total, 5));
  const c = [...far.chans.values()].find((x) => x.slow);
  await until(() => c.gotAtClose !== undefined, 8000);
  await sleep(300);
  const r = { total, gotAtClose: c.gotAtClose, gotInAll: c.got };
  s.destroy(); await B.close();
  return r;
}
{
  const law = await uploadThenEnd();
  ok(law.gotAtClose === law.total, `a page uploads one window and 1000 bytes (${law.total}) to an owner that holds its credit, and ends: the owner has all ${law.gotAtClose} bytes when the close arrives`, law);
  const IDX = read('src/interface/index.js'), OPT = 'closeAfterQueue: true, ';
  ok(IDX.split(OPT).length === 2, 'CONTROL needle present (exactly once): the interface\'s link sets closeAfterQueue (src/interface/index.js)');
  const todays = interfaceWith({ index: IDX.replace(OPT, '') });
  const red = await uploadThenEnd(todays);
  ok(red.gotAtClose !== undefined && red.gotAtClose < red.total, `RED CONTROL — the interface's link without closeAfterQueue (the frame code's released close): the owner sees the close after ${red.gotAtClose} of ${red.total} bytes`, red);
}

console.log('— ⑧ THE LISTENER NEVER ENDS ON ITS OWN ERROR (judged in a child)');
{
  const child = path.join(T, 'accept-error.cjs');
  fs.writeFileSync(child, `'use strict';
const path = require('path'), fs = require('fs'), net = require('net'), Module = require('module');
const [repo, which] = process.argv.slice(2);
const file = path.join(repo, 'src/interface/front.js');
let src = fs.readFileSync(file, 'utf8');
if (which === 'cut') src = src.replace(/\\n  server\\.on\\('error', [^\\n]*\\n/, '\\n');
const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file);
const f = m.exports.create({ onPage: (s) => s.end('ok') });
f.server.listen(0, '127.0.0.1', () => {
  const e = Object.assign(new Error('accept failed (the file limit)'), { code: 'EMFILE' });
  f.server.emit('error', e);   // a failed accept, as the server reports it
  const c = net.connect(f.server.address().port, '127.0.0.1', () => c.write('x'));
  c.on('data', (b) => { console.log(JSON.stringify({ answered: String(b), counted: f.acceptErrors() })); c.destroy(); f.server.close(); });
  c.on('error', () => process.exit(3));
});
`);
  const run = (which) => { try { return { code: 0, out: execFileSync(process.execPath, [child, REPO, which], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }) }; } catch (e) { return { code: e.status, out: String(e.stdout || ''), err: String(e.stderr || '').split('\n').find((l) => /Error|error/.test(l)) || '' }; } };
  const law = run('law'), cut = run('cut');
  const j = (() => { try { return JSON.parse(law.out.trim()); } catch { return null; } })();
  ok(law.code === 0 && j && j.answered === 'ok' && j.counted.count === 1 && j.counted.last === 'EMFILE', `a failed accept emitted on the listening server: counted (${j && j.counted.count}, ${j && j.counted.last}) and the next page is still answered`, law);
  ok(cut.code !== 0 && /Unhandled 'error' event|EMFILE/.test(cut.err + cut.out), `RED CONTROL — without the permanent listener the process ENDS (exit ${cut.code}: ${cut.err.trim().slice(0, 90)})`, cut);
}

console.log('— ⑨ THE FIRST BYTE THAT NEVER COMES');
async function silent(I) {
  const iface = I.create({ firstByteMs: 60 });
  const addr = await iface.listen(0, '127.0.0.1');
  far.opens = [];
  const s = await rawClient(addr.port); let closed = false; s.on('close', () => { closed = true; });
  const gone = await until(() => closed, 400);
  s.destroy(); await iface.close();
  return { closed: gone, opens: far.opens.length };
}
{
  const law = await silent(require(path.join(REPO, 'src/interface/index.js')));
  ok(law.closed && law.opens === 0, `a connection that says nothing is dropped at the interface's own first-byte bound (60 ms here) and opens no channel`, law);
  const unbound = await silent(interfaceWith({ front: mutant('src/interface/front.js', '    socket.setTimeout(firstByteMs, drop);\n', '') }));
  ok(!unbound.closed, `RED CONTROL — the bound not set: the silent socket is still open`, unbound);
}

console.log('— ⑫ THE ADMISSION (piece B2b): a link is a party only once its hello is admitted by this start\'s secret');
/** an interface whose supervisor wrote `admits` (digests, in order) for the hub; a party then joins saying `secret` */
async function admission(I, secret, admits = [HUB_DIGEST], opts = {}) {
  const iface = I.create(opts); const addr = await iface.listen(0, '127.0.0.1');
  const sock = path.join(T, `a${++nIface}.sock`); let link = null;
  const srv = net.createServer((x) => { link = iface.attachLink(x); }).listen(sock); await new Promise((r) => srv.once('listening', r));
  for (const d of admits) iface.admit({ party: 'hub', digest: d });
  far.opens = []; far.chans = new Map(); far.mode = 'raw'; far.acked = null; far.refused = false; far.certAcks = [];
  await farJoin(sock, secret);
  await until(() => far.acked || far.refused || (link && link._dead), 3000);
  const page = await rawClient(addr.port); let pageClosed = false; page.on('close', () => { pageClosed = true; }); page.write('PING\n');
  await until(() => far.opens.length || pageClosed, 1000);
  const st = iface.stats();
  const r = { acked: !!far.acked, capabilities: far.acked && far.acked.capabilities, refused: far.refused, linkEnded: !!(link && link._dead), opens: far.opens.length, pageClosed, lastRefused: st.lastRefused };
  page.destroy(); try { far.mux.destroy(); } catch { } await iface.close(); srv.close();
  return r;
}
{
  const IDX = require(path.join(REPO, 'src/interface/index.js'));
  const right = await admission(IDX, HUB_SECRET);
  ok(right.acked && Array.isArray(right.capabilities) && right.opens === 1, `the admitted secret: hello-ack (${(right.capabilities || []).join(', ')}) and the page relayed`, right);
  const wrong = await admission(IDX, crypto.randomBytes(32).toString('hex'));
  ok(wrong.refused && wrong.linkEnded && wrong.opens === 0 && wrong.pageClosed && wrong.lastRefused === 'secret', `a wrong secret: auth-fail, the link ended, and a page arriving meanwhile closed at once with no link — nothing relayed (${wrong.lastRefused})`, wrong);
  const none = await admission(IDX, HUB_SECRET, []);
  ok(none.refused && none.lastRefused === 'not-admitted' && none.opens === 0, `no admit line for the hub: refused (${none.lastRefused})`, none);
  const S2 = crypto.randomBytes(32).toString('hex'), D2 = crypto.createHash('sha256').update(S2).digest('hex');
  const old = await admission(IDX, HUB_SECRET, [HUB_DIGEST, D2]);
  const fresh = await admission(IDX, S2, [HUB_DIGEST, D2]);
  ok(old.refused && old.lastRefused === 'secret' && fresh.acked, 'a later admit replaces the earlier: the PREVIOUS generation\'s secret is refused, this start\'s is admitted', { old, fresh });
  const silentParty = await admission(IDX, null, [HUB_DIGEST], { helloMs: 60 });
  ok(silentParty.linkEnded && !silentParty.acked && silentParty.lastRefused === 'no-hello', `a link that says no hello is ended at the interface's own bound (60 ms here; ${silentParty.lastRefused})`, silentParty);
  const ADM = 'src/interface/admission.js', CHECK = "    if (!tokenMatches(hello.secret, digest)) return { ok: false, why: 'secret' };   // a wrong secret, or a previous generation's\n";
  const lax = await admission(interfaceWith({ admission: mutant(ADM, CHECK, '') }), HUB_SECRET, [HUB_DIGEST, D2]);
  ok(lax.acked && lax.opens === 1, 'RED CONTROL — the secret\'s check cut: the PREVIOUS generation is admitted and pages are relayed to it', lax);
}

console.log('— ⑬ A RE-ATTACH: the old link goes first, and an old link\'s late death never empties the new link\'s pairs');
async function reattach(I, { lateDeath = false, bound = null } = {}) {
  const t0 = performance.now(), took = {};
  const Bt = await boot(I); far.mode = 'raw';
  const pA = await rawClient(Bt.port); let aClosed = false; pA.on('end', () => { aClosed = true; }); pA.on('close', () => { aClosed = true; }); pA.resume(); pA.write('PING\n');   // ended BY the interface: its FIN or its close (read, or no 'end' is ever emitted)
  await until(() => far.opens.length === 1);
  const far1 = far.mux; far.acked = null;
  await farJoin(Bt.sock, HUB_SECRET);   // the hub's next start joins as the same party
  await until(() => far.acked, 3000);
  const oldEnded = await until(() => far1._dead, bound ? bound.old : 3000); took.old = performance.now() - t0;
  if (oldEnded) await until(() => aClosed, 3000);   // its page's end arrives after the link's
  const pB = await rawClient(Bt.port); let got = ''; pB.on('data', (b) => { got += b; }); pB.write('PING\n');
  await until(() => got.includes('PONG'), 2000);
  if (lateDeath) { try { far1.destroy(); } catch { } await sleep(50); }   // the OLD link dies now, after the new one carries pages
  got = ''; const t1 = performance.now(); pB.write('PING\n'); const bAnswers = await until(() => got.includes('PONG'), bound ? bound.pong : 3000); took.pong = performance.now() - t1;
  const r = { oldEnded, aClosed, bAnswers, parties: Bt.iface.stats().parties, took };
  pA.destroy(); pB.destroy(); try { far1.destroy(); } catch { } await Bt.close();
  return r;
}
{
  const law = await reattach(require(path.join(REPO, 'src/interface/index.js')));
  const bound = { old: Math.max(50, 4 * law.took.old), pong: Math.max(50, 4 * law.took.pong) };   // the reds wait four times what the law needed, measured here
  ok(law.oldEnded && law.aClosed && law.bAnswers && JSON.stringify(law.parties) === '["hub"]', 'the same party joins again: its OLD link is ended first (and its page closed), the new link carries the pages', law);
  const IDXS = 'src/interface/index.js', FIRST = "          if (old && old !== link) { try { old.destroy(); } catch { } }   // a re-attach: the old link goes FIRST (its onDead ends its own pages)\n";
  const keeps = await reattach(interfaceWith({ index: (() => { const t = read(IDXS); if (t.split(FIRST).length !== 2) throw new Error('CONTROL needle: the re-attach line'); return t.replace(FIRST, ''); })() }), { lateDeath: true, bound });
  ok(!keeps.oldEnded && keeps.bAnswers, 'with the old link left alive (the «first» line cut) and dying only AFTER the new one carries pages: the new link\'s page still answers — the relay binds each link\'s death to its own pairs', keeps);
  ok(!keeps.oldEnded, 'RED CONTROL — the «first» line cut: the old link is NOT ended by a re-attach (two links for one party)', keeps);
  const RLY = 'src/interface/relay.js', BIND = '        if (mux === m) mux = null;   // only THIS link stops being the one pages open on\n        for (const [chan, p] of pairs) if (p.mux === m) {';
  const both = await reattach(interfaceWith({ index: read(IDXS).replace(FIRST, ''), relay: mutant(RLY, BIND, '        mux = null;\n        for (const [chan, p] of pairs) if (true) {') }), { lateDeath: true, bound });
  ok(!both.bAnswers, 'RED CONTROL — the relay\'s per-link death cut too: the old link\'s late death empties the NEW link\'s pairs (its page never answers)', both);
}

console.log('— ⑭ A PUSHED CERTIFICATE THAT CANNOT BE LOADED keeps the old context, and never throws out of the control callback');
async function pushes(I) {
  const Bt = await boot(I); const uncaught = []; const onU = (e) => uncaught.push(String(e && e.message)); process.on('uncaughtException', onU);
  far.mux.control({ op: 'certificate', cert: String(pair.cert), key: String(pair.key) }); await until(() => far.certAcks.length === 1, 2000);   // PEM text, as a party pushes it
  const before = await peerCN(Bt.port);
  far.mux.control({ op: 'certificate', cert: '-----BEGIN CERTIFICATE-----\nnot a certificate\n-----END CERTIFICATE-----\n', key: 'not a key' });
  await until(() => far.certAcks.length === 2 || uncaught.length, 2000); await sleep(20);
  const after = await peerCN(Bt.port);
  process.off('uncaughtException', onU);
  const r = { acks: far.certAcks.map((a) => a.ok), why: far.certAcks[1] && far.certAcks[1].why, before, after, uncaught: uncaught.length, linked: Bt.iface.stats().linked };
  await Bt.close();
  return r;
}
{
  const law = await pushes(require(path.join(REPO, 'src/interface/index.js')));
  ok(JSON.stringify(law.acks) === '[true,false]' && law.before === 'localhost' && law.after === 'localhost' && law.uncaught === 0 && law.linked, `a good pair pushed, then a malformed one: answered ok then {ok:false, why: ${law.why}}; TLS still serves the first (${law.after}); nothing thrown; the link lives`, law);
  const FRT = 'src/interface/front.js', JUDGE = "    try { tls.createSecureContext({ cert: pem.cert, key: pem.key }); }   // judged BEFORE it replaces anything\n    catch (e) { return { ok: false, why: (e && (e.code || e.message)) || 'unusable certificate' }; }   // the old context stays\n";
  const thrown = await pushes(interfaceWith({ front: mutant(FRT, JUDGE, '') }));
  ok(thrown.uncaught >= 1, `RED CONTROL — the judgement cut: the malformed pair throws out of the frame code's control callback (${thrown.uncaught} uncaught)`, thrown);
}

console.log('— ⑮ THE TLS STAGE STATES ITS OWN BOUND: a handshake that never finishes is dropped at HANDSHAKE_MS');
async function stalledHello(I, handshakeMs) {
  const Bt = await boot(I, { handshakeMs }); Bt.iface.useCertificate(pair);
  const s = await rawClient(Bt.port); let closed = false; s.on('close', () => { closed = true; });
  s.write(Buffer.from([0x16, 0x03, 0x01]));   // the start of a ClientHello, then nothing
  await until(() => closed, handshakeMs * 4);
  const r = { closed, opens: far.opens.length }; s.destroy(); await Bt.close(); return r;
}
{
  const FR = require(path.join(REPO, 'src/interface/front.js'));
  ok(FR.HANDSHAKE_MS === 120000, `the bound is said by name: HANDSHAKE_MS = ${FR.HANDSHAKE_MS} ms (Node's default, today's front's)`);
  const law = await stalledHello(require(path.join(REPO, 'src/interface/index.js')), 80);
  ok(law.closed && law.opens === 0, 'a ClientHello begun and never finished: dropped at the interface\'s own handshake bound (80 ms here), no channel opened', law);
  const unbound = await stalledHello(interfaceWith({ front: mutant('src/interface/front.js', ', handshakeTimeout: handshakeMs', '') }), 80);
  ok(!unbound.closed, 'RED CONTROL — the bound not passed: after four times the bound the stalled handshake is still open', unbound);
}

console.log('— ⑯ THE OWNER DESTROYS ITS CHANNEL MID-UPLOAD, THEN THE PAGE CLOSES — on the REAL socket-shaped channel');
async function midUpload(I, bound = null) {
  // the far end is today's hub's own road: src/server/interface-party.js join() — the REAL ChanSocket router behind an http.Server
  const iface = I.create(); const addr = await iface.listen(0, '127.0.0.1');
  const sock = path.join(T, `u${++nIface}.sock`); let link = null;
  const srv = net.createServer((x) => { link = iface.attachLink(x); }).listen(sock); await new Promise((r) => srv.once('listening', r));
  iface.admit({ party: 'hub', digest: HUB_DIGEST });
  let destroyedAt = 0;
  const hubServer = http.createServer((req, res) => { req.on('data', (c) => { destroyedAt += c.length; if (destroyedAt > 100000) req.socket.destroy(); }); req.on('error', () => { }); });
  const party = await require(path.join(REPO, 'src/server/interface-party.js')).join({ start: { party: 'hub', secret: HUB_SECRET, link: sock }, server: hubServer });
  // the page holds its side open after the interface's FIN (allowHalfOpen), so its going is a RESET, never an answered FIN
  const page = await new Promise((res) => { const x = net.connect({ port: addr.port, host: '127.0.0.1', allowHalfOpen: true }, () => res(x)); x.on('error', () => { }); });
  let ended = false; page.on('end', () => { ended = true; }); page.on('close', () => { ended = true; });
  page.write('POST /up HTTP/1.1\r\nHost: x\r\nContent-Length: 4000000\r\n\r\n');
  const chunk = Buffer.alloc(65536, 7); for (let i = 0; i < 8; i++) page.write(chunk);   // 512 KiB of a 4 MB upload
  await until(() => destroyedAt > 100000 && ended, 3000);
  await sleep(30); page.resetAndDestroy();   // the page goes too (an RST: no FIN — its close handler's road)
  const t0 = performance.now(); await until(() => iface.stats().channels === 0 && party.router.size === 0, bound || 3000); const took = performance.now() - t0; await sleep(20);
  const L = link;
  const r = { channels: iface.stats().channels, routerSize: party.router.size, held: { closeAfter: L._closeAfter.size, sendQ: L._sendQ.size, sendWin: L._sendWin.size }, took };
  try { party.mux.destroy(); } catch { } await iface.close(); srv.close(); hubServer.close();
  return r;
}
{
  const law = await midUpload(require(path.join(REPO, 'src/interface/index.js')));
  ok(law.channels === 0 && law.routerSize === 0 && law.held.closeAfter === 0 && law.held.sendQ === 0 && law.held.sendWin === 0, `the hub's socket destroyed after 100 KB of a 4 MB upload, then the page reset: no pair here, the hub's router empty (its sink removed by the interface's CLOSE), and the link's frame code holds nothing for the channel (held-close ${law.held.closeAfter}, queue ${law.held.sendQ}, window ${law.held.sendWin})`, law);
  const RLY = 'src/interface/relay.js', CLOSE = "    page.on('close', () => { if (!p.ended.page) { p.ended.page = true; if (live()) m.closeChan(chan); } p.ended.owner = true; pairs.delete(chan); });";
  const leaks = await midUpload(interfaceWith({ relay: mutant(RLY, CLOSE, "    page.on('close', () => { p.ended.owner = true; pairs.delete(chan); });") }), Math.max(50, 4 * law.took));
  ok(leaks.routerSize >= 1, `RED CONTROL — the page's close sends no CLOSE: the hub's router keeps the channel as a sink for good (${leaks.routerSize})`, leaks);
}

console.log('— the B2b cure 2: a page with NO address is closed at once and never stamped (the far side reads a null address as loopback)');
{
  const { EventEmitter } = await import('node:events');
  const run = (mod) => {
    const sent = [], R = mod.create({ ownerOf: () => 'hub' });
    R.attach({ control: (m) => sent.push(m), data: () => true, credit: () => { }, closeChan: () => { } });
    const page = Object.assign(new EventEmitter(), { destroyed: false, destroy() { this.destroyed = true; }, pause() { }, resume() { } });
    const chan = R.open(page, { secure: false, addr: null, port: null });
    const kept = Object.assign(new EventEmitter(), { destroyed: false, destroy() { this.destroyed = true; }, pause() { }, resume() { } });
    R.open(kept, { secure: false, addr: '203.0.113.7', port: 4100 });
    return { chan, destroyed: page.destroyed, opens: sent.filter((m) => m && m.op === 'open').map((m) => m.stamp), kept: !kept.destroyed };
  };
  const law = run(require(path.join(REPO, 'src/interface/relay.js')));
  ok(law.chan === null && law.destroyed && law.opens.length === 1 && law.opens[0].addr === '203.0.113.7' && law.kept, `a page whose address is unknown (already gone): closed, no open line; one with an address: stamped «${law.opens[0] && law.opens[0].addr}»`, law);
  const G = "    if (!facts.addr) { page.destroy(); return null; }   // no address: the page is already gone, and is never stamped (src/agentd/chan-socket.js reads a null address as loopback)\n";
  const red = run(mutant('src/interface/relay.js', G, ''));
  ok(red.opens.length === 2 && red.opens.some((s) => s.addr === null), 'RED CONTROL — the guard cut: the unknown page is stamped with a null address (loopback on the far side)', red);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
