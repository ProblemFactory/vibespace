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
// §5 (主开发 2026-11-17): a destroyed paused socket credits the window it held unread, so the far side's queued bytes and its
// CLOSE arrive (RED: a destroy that credits nothing); the link's death ends every socket — a held write released, the
// response closed, the router empty (RED: no dead()); the router refuses a Mux built without closeAfterQueue. Every wait is
// on its effect with a deadline.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // the ONE door for a red control's edit (B-0d3e)
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('ok(…): its name must be a string — a swapped call is refused'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// waits on an EFFECT with a deadline — never a fixed sleep (主开发 2026-11-17, must 6)
const until = async (f, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(2); } return !!f(); };
const quiet = async (f, ms = 2000, n = 8) => { const t0 = Date.now(); let last, same = 0; while (Date.now() - t0 < ms) { const v = f(); if (v === last) { if (++same >= n) return v; } else { same = 0; last = v; } await sleep(3); } return f(); };
const queuedOn = (mux, c) => (mux._sendQ.get(c) || []).reduce((n, b) => n + b.length, 0);
const { Mux, INITIAL_WINDOW } = require(path.join(REPO, 'src/agentd/mux.js'));
const SOCKF = 'src/agentd/chan-socket.js';
const MUT = mutantCopies('chan-socket', REPO);
const pair = () => { const a = new EventEmitter(), b = new EventEmitter(); a.write = (d) => { setImmediate(() => b.emit('data', Buffer.from(d))); return true; }; b.write = (d) => { setImmediate(() => a.emit('data', Buffer.from(d))); return true; }; return [a, b]; };
const world = (lib) => {
  const [ea, eb] = pair();
  let router = null;
  // the interface's link: both ends hold a CLOSE behind the channel's own queue (closeAfterQueue); the hub's onDead ends the router
  const hub = new Mux(ea, { heartbeat: false, closeAfterQueue: true, onData: (c, b) => router.onData(c, b), onWritable: (c) => router.onWritable(c), onClose: (c) => router.onClose(c), onDead: () => router.dead?.() });
  router = lib.createChanSockets(hub);
  const got = new Map(), closed = new Set(); let manual = false;
  const far = new Mux(eb, { heartbeat: false, closeAfterQueue: true, onData: (c, b) => { got.set(c, Buffer.concat([got.get(c) || Buffer.alloc(0), b])); if (!manual) far.credit(c, b.length); }, onClose: (c) => closed.add(c) });
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
  W.far.closeChan(3); await until(() => W.router.size === 0);   // the far side's own CLOSE (the interface's, once its page has closed)
  ok(`a server that ends the connection closes the channel AFTER its bytes (the far side read «bye», then the close), and once the far side has closed too the hub holds nothing (router ${W.router.size}, window entry ${W.hub._sendWin.has(3)})`, W.closed.has(3) && /bye(\r\n0\r\n\r\n)?$/.test(String(W.got.get(3) || '')) && W.router.size === 0 && !W.hub._sendWin.has(3), { closed: W.closed.has(3), tail: JSON.stringify(String(W.got.get(3) || '').slice(-40)) });
}
console.log('§2 a streamed response waits for the channel\'s credit');
for (const [name, lib, want] of [['the socket-shaped channel', real, true], ['RED CONTROL (a socket whose write never waits)', neverWaits, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib); W.setManual(true);              // the far side credits nothing until we say so
  const s = W.router.open(5, {}); W.server.emit('connection', s);
  W.far.data(5, Buffer.from('GET /big HTTP/1.1\r\nHost: x\r\n\r\n'));
  const queued = await quiet(() => queuedOn(W.hub, 5));   // the server has written all it could: the hub's queue stops moving
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
  W.far.data(9, Buffer.alloc(100000, 1)); await until(() => s.readableLength >= 100000);
  const before = creditSeen;
  const read = []; s.on('data', (d) => read.push(d.length)); s.resume(); await until(() => creditSeen >= 100000);
  ok(`a paused reader credits nothing (${before} B credited while 100000 B sat unread); reading credits what it took (${creditSeen} B)`, before === 0 && creditSeen === 100000, { before, creditSeen });
  let ended = false; s.on('end', () => { ended = true; });
  W.far.closeChan(9); await until(() => ended && W.router.size === 0);
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
  W.far.data(13, Buffer.alloc(50000, 3)); await until(() => got.reduce((a, b) => a + b.length, 0) >= 50000);
  const n = got.reduce((a, b) => a + b.length, 0);
  W.far.closeChan(13); await until(() => W.router.size === 0, want ? 2000 : 300);
  if (want) ok(`this side's end sends its CLOSE after «done» (${JSON.stringify(String(W.got.get(13) || ''))}), and the far side's later bytes are still read and credited (${n} B read, ${creditSeen} B credited); its CLOSE then leaves nothing held (router ${W.router.size}; the socket's own \`writable\` is ${s.writable})`, String(W.got.get(13) || '') === 'done' && W.closed.has(13) && n === 50000 && creditSeen === 50000 && W.router.size === 0 && s.writable === false);
  else ok(`${name}: a socket ended both ways is never destroyed and never leaves its router (router ${W.router.size}, destroyed ${s.destroyed})`, W.router.size === 1 && !s.destroyed);
}
for (const [name, lib, want] of [['the sink', real, true], ['RED CONTROL (no sink)', noSink, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib);
  const s = W.router.open(15, {}); s.on('error', () => { });
  s.destroy(); for (let t = 0; t < 100 && !W.closed.has(15); t++) await sleep(5);
  for (let i = 0; i < 3; i++) W.far.data(15, Buffer.alloc(INITIAL_WINDOW, 4));
  await until(() => queuedOn(W.far, 15) === 0, want ? 2000 : 300);
  const stalled = queuedOn(W.far, 15);
  W.far.closeChan(15); await until(() => W.router.size === 0, want ? 2000 : 300);
  if (want) ok(`a socket destroyed before the far CLOSE leaves a sink: three far windows are credited and dropped (${stalled} B left waiting at the far side), and the far CLOSE ends it (router ${W.router.size})`, W.closed.has(15) && stalled === 0 && W.router.size === 0, { stalled });
  else ok(`${name}: the far side's bytes wait for a credit that never comes (${stalled} B stalled)`, stalled >= INITIAL_WINDOW, { stalled });
}
console.log('§5 a destroyed socket gives back its unread window; the link\'s death ends every socket (主开发 2026-11-17, musts 3 and 4)');
const noDestroyCredit = (() => { const src = fs.readFileSync(path.join(REPO, SOCKF), 'utf8'); const A = '    if (owed > 0 && !this._farClosed) { this._credited += owed; try { this.mux.credit(this.chan, owed); } catch { } }\n'; return src.includes(A) ? require(MUT.write(SOCKF, src.split(A).join(''), 'no-destroy-credit')) : null; })();
for (const [name, lib, want] of [['the destroy', real, true], ['RED CONTROL (a destroy that credits nothing unread)', noDestroyCredit, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib);
  const s = W.router.open(17, {}); s.on('error', () => { }); s.pause();   // a paused keep-alive socket: nothing is read
  W.far.data(17, Buffer.alloc(INITIAL_WINDOW, 5)); W.far.data(17, Buffer.alloc(INITIAL_WINDOW, 6));   // one window sits unread, the next waits at the far side
  await until(() => s.readableLength >= INITIAL_WINDOW);
  W.far.closeChan(17);                                     // the far CLOSE waits behind its own queued window
  const before = { unread: s.readableLength, farQ: queuedOn(W.far, 17), held: W.far._closeAfter.has(17) };
  s.destroy();
  await until(() => W.router.size === 0 && queuedOn(W.far, 17) === 0, want ? 2000 : 300);
  if (want) ok(`${name}: a paused socket holding a whole window unread (${before.unread} B, ${before.farQ} B more waiting far), destroyed — the unread bytes are credited, the far side's queued window and its CLOSE arrive (far queue ${queuedOn(W.far, 17)} B) and the router holds nothing (${W.router.size})`, before.unread === INITIAL_WINDOW && before.held && queuedOn(W.far, 17) === 0 && !W.far._closeAfter.has(17) && W.router.size === 0, before);
  else ok(`${name}: the far side stalls for good — its window and its CLOSE wait (far queue ${queuedOn(W.far, 17)} B, close held ${W.far._closeAfter.has(17)}, router ${W.router.size})`, queuedOn(W.far, 17) > 0 && W.far._closeAfter.has(17) && W.router.size === 1, before);
}
const noDead = (() => { const src = fs.readFileSync(path.join(REPO, SOCKF), 'utf8'); const A = "    dead(reason = 'link lost') {"; return src.includes(A) ? require(MUT.write(SOCKF, src.split(A).join("    deadUnused(reason = 'link lost') {"), 'no-dead')) : null; })();
for (const [name, lib, want] of [['the router', real, true], ['RED CONTROL (no road for the link\'s death)', noDead, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = world(lib); W.setManual(true);                 // the far side credits nothing: the response's write is held
  let resClosed = false, sockClosed = false, sockErr = null;
  W.server.on('request', (req, res) => res.on('close', () => { resClosed = true; }));
  const s = W.router.open(19, {}); W.server.emit('connection', s);
  s.on('close', () => { sockClosed = true; }); s.on('error', (e) => { sockErr = e.message; });
  W.far.data(19, Buffer.from('GET /big HTTP/1.1\r\nHost: x\r\n\r\n'));   // keep-alive: a streamed response
  await until(() => !!s._waitWrite);
  const heldWrite = !!s._waitWrite;
  W.hub.stream.emit('close');                              // the link dies under it
  await until(() => sockClosed && resClosed && W.router.size === 0, want ? 2000 : 300);
  if (want) ok(`${name}: the link killed under a keep-alive socket with a held write (${heldWrite}) — the socket is ended and destroyed («${sockErr}»), the response closes, the held write is released and the router holds nothing (${W.router.size})`, heldWrite && sockClosed && resClosed && sockErr === 'link lost' && !s._waitWrite && W.router.size === 0, { heldWrite, sockClosed, resClosed, sockErr });
  else ok(`${name}: the socket, its held write and the response stay for ever (closed ${sockClosed}, router ${W.router.size})`, heldWrite && !sockClosed && W.router.size === 1, { sockClosed, resClosed });
}
// B-55e4 (主开发 r1341): A SOCKET NO ONE LISTENS ON FOR ERRORS NEVER THROWS AT THE LINK'S DEATH. An upgraded socket has no 'error'
// listener left (http.Server let go of it), and a stream's 'error' with no listener throws uncaught: one page's upgrade ended the hub
// with its link. The error goes only where it is heard; the rest are destroyed plainly. RED CONTROL: every socket destroyed with it.
const LOUD = "try { s._deadReason = reason; s.destroy(s.listenerCount('error') > 0 ? new Error(reason) : undefined); } catch { }";
const loudDead = (() => { const src = fs.readFileSync(path.join(REPO, SOCKF), 'utf8'); return require(MUT.write(SOCKF, anchored(src, LOUD, 'try { s.destroy(new Error(reason)); } catch { }', 'every socket destroyed with the error'), 'loud-dead')); })();   // stale-pins: kept — the release-era death, the red's text
for (const [name, lib, want] of [['the router', real, true], ['RED CONTROL (every socket destroyed with the error)', loudDead, false]]) {
  const W = world(lib);
  const s = W.router.open(21, {});                         // NO 'error' listener: an upgraded socket's state
  let closed = false; s.on('close', () => { closed = true; });
  let uncaught = null; const onUncaught = (e) => { uncaught = e; };
  process.on('uncaughtException', onUncaught);
  W.hub.stream.emit('close');                              // the link dies under it
  await until(() => closed || !!uncaught, 1000); await sleep(20);   // the red throws before its 'close' (an unheard error ends the emit): wait for either
  process.removeListener('uncaughtException', onUncaught);
  if (want) ok(`${name}: a channel socket no one listens on for errors (an upgraded one) is destroyed at the link's death and nothing is thrown (closed ${closed}, uncaught ${uncaught ? uncaught.message : 'none'})`, closed && !uncaught && W.router.size === 0);
  else ok(`${name}: the link's death throws «${uncaught && uncaught.message}» uncaught — one page's upgrade ends the hub with its link`, !!uncaught && uncaught.message === 'link lost');
}
{
  let refused = null; try { real.createChanSockets(new Mux(new EventEmitter(), { heartbeat: false })); } catch (e) { refused = e.message; }
  ok(`the router refuses a link built without closeAfterQueue — a socket's end would drop its queued reply («${String(refused).slice(0, 70)}…»)`, /closeAfterQueue/.test(String(refused)));
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
