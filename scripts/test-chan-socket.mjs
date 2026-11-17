#!/usr/bin/env node
// THE SOCKET-SHAPED CHANNEL (cs M1 piece 1b, src/agentd/chan-socket.js): an http.Server takes ONE byte channel of a Mux as
// one connection — the shape today's hub needs to join the interface's link as one party. In process: two Muxes over an
// in-memory pair; the far side speaks HTTP on a channel. Legs: a request answered, the open line's stamp read as the
// socket's address and `encrypted`, keep-alive; a streamed response waits for the channel's credit (RED control: a socket
// whose write never waits — the Mux queues the whole response); bytes are credited only as the reader takes them; a server
// end closes the channel after its bytes. A CLOSE is a HALF-close (lane B's relay, 11-17): a far CLOSE after an upload ends
// the readable side and a reply written after it goes out whole (RED control: the as-built socket that refused it); this
// side's end still reads what the far side sends; a socket destroyed first credits and drops the far bytes until the far
// CLOSE (RED control: no sink — the far window stalls).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { Mux, INITIAL_WINDOW } = require(path.join(REPO, 'src/agentd/mux.js'));
const SOCKF = 'src/agentd/chan-socket.js';
const MUT = mutantCopies('chan-socket', REPO);
const pair = () => { const a = new EventEmitter(), b = new EventEmitter(); a.write = (d) => { setImmediate(() => b.emit('data', Buffer.from(d))); return true; }; b.write = (d) => { setImmediate(() => a.emit('data', Buffer.from(d))); return true; }; return [a, b]; };
const world = (lib) => {
  const [ea, eb] = pair();
  let router = null;
  const hub = new Mux(ea, { heartbeat: false, onData: (c, b) => router.onData(c, b), onWritable: (c) => router.onWritable(c), onClose: (c) => router.onClose(c) });
  router = lib.createChanSockets(hub);
  const got = new Map(), closed = new Set(); let manual = false;
  const far = new Mux(eb, { heartbeat: false, onData: (c, b) => { got.set(c, Buffer.concat([got.get(c) || Buffer.alloc(0), b])); if (!manual) far.credit(c, b.length); }, onClose: (c) => closed.add(c) });
  const server = http.createServer((req, res) => {
    if (req.url === '/big') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); let i = 0; const chunk = Buffer.alloc(65536, 5); const go = () => { while (i < 16) { i++; if (!res.write(chunk)) return res.once('drain', go); } res.end(); }; go(); return; }
    if (req.url === '/bye') { res.writeHead(200, { connection: 'close' }); res.end('bye'); return; }
    res.end(`hello ${req.url} from ${req.socket.remoteAddress} secure=${req.socket.encrypted}`);
  });
  return { hub, far, router, got, closed, server, setManual: (v) => { manual = v; }, lib };
};
const real = require(path.join(REPO, SOCKF));
const neverWaits = (() => { const src = fs.readFileSync(path.join(REPO, SOCKF), 'utf8'); const A = '    if (ok) cb(); else this._waitWrite = cb;   // resumed by drained()\n'; return src.includes(A) ? require(MUT.write(SOCKF, src.split(A).join('    cb();\n'), 'never-waits')) : null; })();

console.log('§1 an http.Server takes a channel as a connection');
{
  const W = world(real);
  const s = W.router.open(3, { secure: true, addr: '203.0.113.9', port: 51000 });
  W.server.emit('connection', s);
  W.far.data(3, Buffer.from('GET /a HTTP/1.1\r\nHost: x\r\n\r\n'));
  for (let t = 0; t < 100 && !/hello \/a/.test(String(W.got.get(3) || '')); t++) await sleep(5);
  const one = String(W.got.get(3) || '');
  ok(`a request on the channel is answered, and the open line's stamp is the socket's address and «encrypted» — ${JSON.stringify(one.split('\r\n\r\n')[1])}`, /200 OK/.test(one) && /hello \/a from 203\.0\.113\.9 secure=true/.test(one));
  W.far.data(3, Buffer.from('GET /b HTTP/1.1\r\nHost: x\r\n\r\n'));
  for (let t = 0; t < 100 && !/hello \/b/.test(String(W.got.get(3) || '')); t++) await sleep(5);
  ok('…and a second request on the SAME channel (keep-alive) is answered too', /hello \/b/.test(String(W.got.get(3) || '')));
  W.far.data(3, Buffer.from('GET /bye HTTP/1.1\r\nHost: x\r\n\r\n'));
  for (let t = 0; t < 100 && !W.closed.has(3); t++) await sleep(5);
  W.far.closeChan(3); await sleep(20);                 // the far side's own CLOSE (the interface's, once its page has closed)
  ok(`a server that ends the connection closes the channel AFTER its bytes (the far side read «bye», then the close), and once the far side has closed too the hub holds nothing (router ${W.router.size}, window entry ${W.hub._sendWin.has(3)})`, W.closed.has(3) && /bye(\r\n0\r\n\r\n)?$/.test(String(W.got.get(3) || '')) && W.router.size === 0 && !W.hub._sendWin.has(3), { closed: W.closed.has(3), tail: JSON.stringify(String(W.got.get(3) || '').slice(-40)) });
}
console.log('§2 a streamed response waits for the channel\'s credit');
for (const [name, lib, want] of [['the socket-shaped channel', real, true], ['RED CONTROL (a socket whose write never waits)', neverWaits, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib); W.setManual(true);              // the far side credits nothing until we say so
  const s = W.router.open(5, {}); W.server.emit('connection', s);
  W.far.data(5, Buffer.from('GET /big HTTP/1.1\r\nHost: x\r\n\r\n'));
  await sleep(60);
  const queued = (W.hub._sendQ.get(5) || []).reduce((n, b) => n + b.length, 0);
  // now the far reader takes and credits everything, a window at a time
  for (let t = 0; t < 200 && (W.got.get(5) || Buffer.alloc(0)).length < 16 * 65536; t++) { const have = (W.got.get(5) || Buffer.alloc(0)).length; W.far.credit(5, INITIAL_WINDOW); await sleep(5); if ((W.got.get(5) || Buffer.alloc(0)).length === have && t > 100) break; }
  const body = (W.got.get(5) || Buffer.alloc(0)).length;
  if (want) ok(`with no credit the hub queues at most one write for the channel (${queued} B queued of a 1 MiB response) — the server's own write waits; credit comes back and the whole response arrives (${body} B)`, queued <= 65536 + 1024 && body >= 16 * 65536, { queued, body });
  else ok(`${name}: the Mux queues the response the window could not take (${queued} B)`, queued > 8 * 65536, { queued });
}
console.log('§3 bytes are credited only as the reader takes them; a far close ends the connection');
{
  const W = world(real);
  const s = W.router.open(9, {});
  const sent = []; let creditSeen = 0;
  const orig = W.hub.credit.bind(W.hub); W.hub.credit = (c, n) => { if (c === 9) creditSeen += n; return orig(c, n); };
  s.pause();                                            // the reader takes nothing yet
  W.far.data(9, Buffer.alloc(100000, 1)); await sleep(30);
  const before = creditSeen;
  const read = []; s.on('data', (d) => read.push(d.length)); s.resume(); await sleep(30);
  ok(`a paused reader credits nothing (${before} B credited while 100000 B sat unread); reading credits what it took (${creditSeen} B)`, before === 0 && creditSeen === 100000, { before, creditSeen });
  let ended = false; s.on('end', () => { ended = true; });
  W.far.closeChan(9); await sleep(30);
  ok(`a far close ends the connection's readable side, the socket then ends its own (allowHalfOpen false, as a net.Socket) and the hub holds nothing (router ${W.router.size}, window entry ${W.hub._sendWin.has(9)})`, ended && W.router.size === 0 && !W.hub._sendWin.has(9));
}
console.log('§4 a CLOSE is a half-close (the interface relays a page\'s end as one)');
const asBuilt = (() => { const src = fs.readFileSync(path.join(REPO, SOCKF), 'utf8'); const A = "  remoteClosed() { if (this._farClosed) return; this._farClosed = true; this.push(null); }"; return src.includes(A) ? require(MUT.write(SOCKF, src.split(A).join("  remoteClosed() { this._farClosed = true; this._sentClose = true; try { this.mux.forget(this.chan); } catch { } this.push(null); }"), 'as-built')) : null; })();
const noSink = (() => { const src = fs.readFileSync(path.join(REPO, SOCKF), 'utf8'); const A = 'if (!s._farClosed) sinks.add(chan);'; return src.includes(A) ? require(MUT.write(SOCKF, src.split(A).join('void sinks;'), 'no-sink')) : null; })();
const namedWritable = (() => { const src = fs.readFileSync(path.join(REPO, SOCKF), 'utf8'); return src.includes('  drained() {') && src.includes('s.drained();') ? require(MUT.write(SOCKF, src.split('  drained() {').join('  writable() {').split('s.drained();').join('s.writable();'), 'named-writable')) : null; })();
const REPLY = 3 * INITIAL_WINDOW;                       // a reply larger than the window: it must drain under credit after the far CLOSE
for (const [name, lib, want] of [['the half-close', real, true], ['RED CONTROL (the as-built socket: a far CLOSE closed both ways)', asBuilt, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib);
  const s = W.router.open(11, {});
  const up = []; let errs = 0; s.on('error', () => { errs++; });
  s.on('data', (d) => up.push(d));
  s.on('end', () => { s.write(Buffer.alloc(REPLY, 7)); });   // the owner answers once the upload has ended (allowHalfOpen false then ends this side)
  W.far.data(11, Buffer.alloc(INITIAL_WINDOW, 1)); W.far.data(11, Buffer.alloc(1000, 2)); W.far.closeChan(11);   // lane B's leg ⑪: one window + 1000 B, then the end
  for (let t = 0; t < 200 && !W.closed.has(11) && !(errs && t > 10); t++) await sleep(5);   // the as-built socket errs at once: no full wait
  const got = (W.got.get(11) || Buffer.alloc(0)).length, upN = up.reduce((n, b) => n + b.length, 0);
  if (want) ok(`the upload reached the owner whole (${upN} B of ${INITIAL_WINDOW + 1000}), and its reply written AFTER the far CLOSE arrived whole (${got} B of ${REPLY}), then this side's CLOSE; the hub holds nothing after (router ${W.router.size}, window entry ${W.hub._sendWin.has(11)})`, upN === INITIAL_WINDOW + 1000 && got === REPLY && W.closed.has(11) && W.router.size === 0 && !W.hub._sendWin.has(11), { upN, got, errs });
  else ok(`${name}: the reply is refused (${got} B arrived of ${REPLY})`, got < REPLY, { got, errs });
}
for (const [name, lib, want] of [['this side\'s end', real, true], ['RED CONTROL (the drain route named `writable` — the stream\'s own property)', namedWritable, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib);
  const s = W.router.open(13, {}); const got = []; s.on('data', (d) => got.push(d));
  let creditSeen = 0; const orig = W.hub.credit.bind(W.hub); W.hub.credit = (c, n) => { if (c === 13) creditSeen += n; return orig(c, n); };
  s.end('done'); for (let t = 0; t < 100 && !W.closed.has(13); t++) await sleep(5);
  W.far.data(13, Buffer.alloc(50000, 3)); await sleep(30);
  const n = got.reduce((a, b) => a + b.length, 0);
  W.far.closeChan(13); await sleep(30);
  if (want) ok(`this side's end sends its CLOSE after «done» (${JSON.stringify(String(W.got.get(13) || ''))}), and the far side's later bytes are still read and credited (${n} B read, ${creditSeen} B credited); its CLOSE then leaves nothing held (router ${W.router.size}; the socket's own \`writable\` is ${s.writable})`, String(W.got.get(13) || '') === 'done' && W.closed.has(13) && n === 50000 && creditSeen === 50000 && W.router.size === 0 && s.writable === false);
  else ok(`${name}: a socket ended both ways is never destroyed and never leaves its router (router ${W.router.size}, destroyed ${s.destroyed})`, W.router.size === 1 && !s.destroyed);
}
for (const [name, lib, want] of [['the sink', real, true], ['RED CONTROL (no sink)', noSink, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib);
  const s = W.router.open(15, {}); s.on('error', () => { });
  s.destroy(); for (let t = 0; t < 100 && !W.closed.has(15); t++) await sleep(5);
  for (let i = 0; i < 3; i++) W.far.data(15, Buffer.alloc(INITIAL_WINDOW, 4));
  await sleep(80);
  const stalled = (W.far._sendQ.get(15) || []).reduce((n, b) => n + b.length, 0);
  W.far.closeChan(15); await sleep(30);
  if (want) ok(`a socket destroyed before the far CLOSE leaves a sink: three far windows are credited and dropped (${stalled} B left waiting at the far side), and the far CLOSE ends it (router ${W.router.size})`, W.closed.has(15) && stalled === 0 && W.router.size === 0, { stalled });
  else ok(`${name}: the far side's bytes wait for a credit that never comes (${stalled} B stalled)`, stalled >= INITIAL_WINDOW, { stalled });
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
