#!/usr/bin/env node
// THE LINK'S FRAME CODE (cs M1, piece 1 — the separation design, «The link»): back-pressure honoured and an inner link's
// bounds. (1) A Mux whose stream says write() === false holds every frame, in order, until 'drain': data() says false when
// the WIRE is full, and onWritable resumes the producer after the drain. (2) An inner link's bounds: a control line over
// `maxControl` is refused when sent and kills the link when received; a frame over `maxFrame` kills it. (3) A LINK INSIDE A
// LINK over a REAL daemon: an inner Mux pair rides one byte channel (the daemon's tcp-forward to a peer in this process);
// the peer stops reading, so the outer channel is starved of credit — the inner link lives (heartbeat off) and the outer
// channel's queue stays within one window plus one write. RED control (a mutant of mux.js that ignores the stream's answer,
// today's frame code): the inner producer is always told «writable» and the outer queue takes everything it writes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { endDaemonsAndWait } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MUXF = 'src/agentd/mux.js';
const { Mux, INITIAL_WINDOW } = require(path.join(REPO, MUXF));
const { ChanDuplex } = require(path.join(REPO, 'src/agentd/chan-duplex.js'));
const MUT = mutantCopies('link-frames', REPO);
const mutantMux = (() => {
  const src = fs.readFileSync(path.join(REPO, MUXF), 'utf8');
  const A = 'this._honorsDrain = stream.emitsDrain === true;';
  return src.includes(A) ? require(MUT.write(MUXF, src.split(A).join('this._honorsDrain = false;'), 'no-drain')).Mux : null;
})();
// a stream that is full after `cap` bytes until drain() is called
class FakeStream extends EventEmitter {
  constructor(cap) { super(); this.cap = cap; this.held = 0; this.out = []; this.emitsDrain = true; }
  write(b) { this.out.push(Buffer.from(b)); this.held += b.length; return this.held <= this.cap; }
  drain() { this.held = 0; this.emit('drain'); }
}
const frames = (bufs) => { const all = Buffer.concat(bufs); const out = []; let o = 0; while (o + 9 <= all.length) { const len = all.readUInt32BE(o); out.push({ type: all.readUInt8(o + 4), chan: all.readUInt32BE(o + 5), size: len - 5 }); o += 4 + len; } return out; };

console.log('§1 THE STREAM\'S BACK-PRESSURE — a full wire holds every frame, in order, and data() says so');
for (const [name, M, want] of [['the frame code', Mux, true], ['RED CONTROL (the stream\'s answer ignored)', mutantMux, false]]) {
  if (!M) { ok(name + ': the mutant could be made', false); continue; }
  const st = new FakeStream(1000); const writable = [];
  const m = new M(st, { heartbeat: false, onWritable: (c) => writable.push(c) });
  const first = m.data(1, Buffer.alloc(1500, 1));          // fits the window; the wire says full after it
  const second = m.data(1, Buffer.alloc(100, 2));
  m.control({ op: 'after-the-data' });
  m.closeChan(1);                                            // its CLOSE must not pass its own held data
  const before = st.out.length, writableBefore = writable.length;
  st.drain();
  const fr = frames(st.out);
  const order = fr.map((f) => `${f.type}:${f.chan}:${f.size}`).join(' ');
  const ctl = JSON.stringify({ op: 'after-the-data' }).length + 1;
  const held = first === false && second === false && before === 1 && order === `0:1:1500 0:0:${ctl} 0:1:100 1:1:0` && writableBefore === 0;
  if (want) ok(`${name}: the write that filled the wire answers false, the next data, a control line and the channel's CLOSE WAIT (1 frame written of 4); after the drain they go, the CLOSE behind its own data — ${order}`, held, { first, second, before, order, writableBefore, writable });
  else ok(`${name}: the producer is told «writable» on a full wire and every frame is pushed into it (${before} frames written before any drain)`, !held && first === true && before === 4, { first, second, before });
}
{
  // a socket (it does not declare emitsDrain) keeps today's write-through: its windows already bound what it buffers
  const sock = { out: [], writableNeedDrain: true, write(b) { this.out.push(b); return false; }, on() { } };
  const m = new Mux(sock, { heartbeat: false });
  ok('…a socket-like stream (no emitsDrain) keeps today\'s write-through: nothing is held, its windows bound it', m.data(1, Buffer.alloc(10)) === true && sock.out.length === 1);
}

console.log('§2 AN INNER LINK\'S BOUNDS — a control line over 64 KiB, a frame over its maximum');
{
  const BOUND = 65536;
  const a = new FakeStream(1e9);
  const m = new Mux(a, { heartbeat: false, maxControl: BOUND });
  let refused = null; try { m.control({ op: 'big', pad: 'x'.repeat(BOUND) }); } catch (e) { refused = e.code; }
  ok('control() refuses to SEND a line over the link\'s bound (code control_too_long) and a line within it goes', refused === 'control_too_long' && (() => { try { m.control({ op: 'small' }); return true; } catch { return false; } })());
  let dead = null; const r = new EventEmitter(); r.write = () => true;
  const rx = new Mux(r, { heartbeat: false, maxControl: BOUND, onDead: (why) => { dead = why; } });
  const line = Buffer.from(JSON.stringify({ op: 'big', pad: 'x'.repeat(BOUND) }) + '\n');
  const { encodeFrame } = require(path.join(REPO, MUXF));
  r.emit('data', encodeFrame(0, 0, line));
  ok(`RECEIVING a control line over the bound kills the link, named («${dead}»)`, /control line over 65536 bytes/.test(String(dead)));
  let dead2 = null; const r2 = new EventEmitter(); r2.write = () => true;
  new Mux(r2, { heartbeat: false, maxControl: BOUND, onDead: (why) => { dead2 = why; } });
  r2.emit('data', encodeFrame(0, 0, Buffer.alloc(BOUND + 10, 0x61)));   // no newline yet: the partial line alone is over it
  ok(`…and so does a partial line that grows past it before its newline («${dead2}»)`, /control line over 65536 bytes/.test(String(dead2)));
  let dead3 = null; const r3 = new EventEmitter(); r3.write = () => true;
  new Mux(r3, { heartbeat: false, maxFrame: 1024, onDead: (why) => { dead3 = why; } });
  r3.emit('data', encodeFrame(0, 5, Buffer.alloc(2048)));
  ok(`a frame over the link's maxFrame kills it («${dead3}»)`, /bad frame length/.test(String(dead3)));
  let alive = true; const r4 = new EventEmitter(); r4.write = () => true;
  new Mux(r4, { heartbeat: true, onDead: () => { alive = false; } });
  r4.emit('data', encodeFrame(0, 0, line));
  ok('the OUTER link keeps today\'s unbounded control line (the census moves the growable payloads first — piece 2)', alive);
}

console.log('§4 A CHANNEL\'S LIFE — its close leaves after its own queue, and the side that drops it forgets it (主开发 2026-11-17, from the interface\'s acceptance)');
const todaysLifecycle = (() => {
  const src = fs.readFileSync(path.join(REPO, MUXF), 'utf8');
  const A = "  closeChan(chan) {\n    if (this._sendQ.get(chan)?.length) { this._closeAfter.add(chan); return; }   // behind its own queued data\n    this._raw(T.CLOSE, chan);\n    this.forget(chan);\n  }\n";
  const G = "        if (!this._sendWin.has(chan)) break;   // a channel this side never wrote, or forgot: a late credit re-creates nothing\n";
  return src.includes(A) && src.includes(G) ? require(MUT.write(MUXF, src.split(A).join('  closeChan(chan) { this._raw(T.CLOSE, chan); }\n').split(G).join(''), 'lifecycle')).Mux : null;
})();
// an in-memory pair of streams (each write reaches the other side on the next turn)
const pair = () => { const a = new EventEmitter(), b = new EventEmitter(); a.write = (d) => { setImmediate(() => b.emit('data', Buffer.from(d))); return true; }; b.write = (d) => { setImmediate(() => a.emit('data', Buffer.from(d))); return true; }; return [a, b]; };
const { encodeFrame: enc } = require(path.join(REPO, MUXF));
for (const [name, M, want] of [['the frame code', Mux, true], ['RED CONTROL (today\'s channel lifecycle)', todaysLifecycle, false]]) {
  if (!M) { ok(name + ': the mutant could be made', false); continue; }
  const sink = { write: () => true, on() { } };
  const m = new M(sink, { heartbeat: false });
  for (let c = 1; c <= 10000; c++) { m.data(c, Buffer.alloc(16)); m.closeChan(c); }
  const sizes = { win: m._sendWin.size, q: m._sendQ.size };
  m._onFrame(2, 42, Buffer.from([0, 0, 1, 0]));            // a late CREDIT for a forgotten channel
  m._onFrame(2, 20001, Buffer.from([0, 0, 1, 0]));         // …and one for a channel this side never wrote
  const after = m._sendWin.size;
  const [ea, eb] = pair(); const got = [];
  const A = new M(ea, { heartbeat: false }), B = new M(eb, { heartbeat: false, onData: (c, b) => got.push(['data', b.length]), onClose: () => got.push(['close']) });
  A.data(7, Buffer.alloc(3 * INITIAL_WINDOW, 9)); A.closeChan(7);   // three windows with no credit, then the close
  await sleep(5);
  for (let i = 0; i < 3; i++) { B.credit(7, INITIAL_WINDOW); await sleep(5); }
  const bytes = got.filter((g) => g[0] === 'data').reduce((n, g) => n + g[1], 0), closeAt = got.findIndex((g) => g[0] === 'close');
  const order = { bytes, closeAt, events: got.length, closeAfterAll: closeAt === got.length - 1 && bytes === 3 * INITIAL_WINDOW };
  if (want) {
    ok(`ten thousand channels opened, written and dropped leave the send maps at their starting size (window ${sizes.win}, queue ${sizes.q}), and a late credit — for a forgotten channel or one never written — re-creates nothing (${after})`, sizes.win === 0 && sizes.q === 0 && after === 0, { sizes, after });
    ok(`three windows written with no credit, then the close: the far side reads all three windows (${bytes} B) and THEN the close`, order.closeAfterAll, order);
  } else {
    ok(`${name}: the maps keep every channel (${sizes.win}) and a late credit re-creates one (${after}); the close overtakes the queued windows (read ${bytes} B, close at event ${closeAt})`, sizes.win === 10000 && after === 10001 && !order.closeAfterAll, { sizes, after, order });
  }
}

console.log('§3 A LINK INSIDE A LINK, over a REAL daemon — the outer channel starved of credit');
// device #0 constructed as server.js does (test-local-device's recipe): its own scratch root, ended by identity at the end
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-linkframes-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-linkframes-data-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(root, 'agentd');
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: require(path.join(REPO, 'package.json')).version, nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
let farSock = null; const far = { bytes: 0, controls: [] };
const server = net.createServer((sock) => {
  farSock = sock;
  // the far end of the inner link: it consumes (and credits) every byte it reads
  const B = new Mux(sock, { heartbeat: false, maxControl: 65536, onControl: (o) => far.controls.push(o), onData: (c, b) => { far.bytes += b.length; B.credit(c, b.length); } });
  far.mux = B;
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const nested = async (M) => {
  far.bytes = 0; far.controls = []; farSock = null;
  const handle = await dm.tcpForward(port);
  const adapter = new ChanDuplex({ data: (c, b) => handle.write(b), closeChan: () => handle.close() }, handle.chan);
  handle.onData = (b) => adapter.push(b);
  handle.onClose = () => adapter.closed();
  handle.onWritable = () => adapter.writable();
  const near = { controls: [] };
  const A = new M(adapter, { heartbeat: false, maxControl: 65536, onControl: (o) => near.controls.push(o) });
  for (let t = 0; t < 50 && !farSock; t++) await sleep(20);
  A.control({ op: 'hello-inner' });
  for (let t = 0; t < 50 && !far.controls.length; t++) await sleep(20);
  const greeted = far.controls.some((o) => o.op === 'hello-inner');
  // THE OUTER CHANNEL STARVED OF CREDIT: the daemon's CREDIT frames for this channel are withheld on the hub's side (a
  // loopback socket's kernel buffers would absorb megabytes before the far peer's pause reached the window)
  const om = dm._conn.mux, origFrame = om._onFrame.bind(om); let starving = true, withheld = 0;
  om._onFrame = (type, chan, payload) => { if (starving && type === 2 && chan === handle.chan && payload.length === 4) { withheld += payload.readUInt32BE(0); return; } return origFrame(type, chan, payload); };
  // EIGHT inner channels, each writing until it is told to wait (today's frame code tells each of them «writable» until
  // its OWN inner window is spent, so the outer queue takes up to eight windows)
  const K = 8, CHUNK = Buffer.alloc(65536, 7), CAP = 4 * 65536;   // per channel
  const sentBy = new Map(); let stalls = 0;
  const pump = (c) => { let n = sentBy.get(c) || 0; while (n < CAP) { n += CHUNK.length; sentBy.set(c, n); if (!A.data(c, CHUNK)) { stalls++; return; } } };
  A.onWritable = (c) => { if (c >= 1 && c <= K) pump(c); };
  for (let c = 1; c <= K; c++) pump(c);
  const total = () => [...sentBy.values()].reduce((a, b) => a + b, 0);
  await sleep(2500);
  const outerQ = (dm._conn?.mux?._sendQ?.get(handle.chan) || []).reduce((n, b) => n + b.length, 0);
  const innerQ = [...(A._sendQ?.values() || [])].flat().reduce((n, b) => n + b.length, 0) + (A._wireQ || []).reduce((n, f) => n + f.length, 0);
  const sentWhileStarved = total();
  starving = false; om._onFrame = origFrame;                 // the credit comes back: the inner link must still be there
  om._sendWin.set(handle.chan, (om._sendWin.get(handle.chan) || 0) + withheld); om._flush(handle.chan);
  for (let t = 0; t < 400 && (far.bytes < total() || total() < K * CAP); t++) await sleep(25);
  const sent = total();
  far.mux.control({ op: 'still-here' });
  for (let t = 0; t < 50 && !near.controls.some((o) => o.op === 'still-here'); t++) await sleep(20);
  const r = { greeted, sentWhileStarved, outerQ, innerQ, stalls, delivered: far.bytes, sent, back: near.controls.some((o) => o.op === 'still-here'), innerHeartbeat: !!A._hb };
  try { handle.close(); } catch { }
  return r;
};
let real = null, red = null;
try { await dm.connect(); real = await nested(Mux); if (mutantMux) red = await nested(mutantMux); } catch (e) { real = real || { error: e.message }; }
const WIN = INITIAL_WINDOW;
ok(`the inner link greets across the real daemon's channel; EIGHT inner channels write while it is starved for 2.5 s — the outer channel's queue stays within one write (${real && real.outerQ} B), each inner channel waits on its own queue (${real && real.innerQ} B held in all), every producer told to wait (${real && real.stalls} stalls)`,
  !!real && real.greeted && real.outerQ <= 65536 + 64 && real.innerQ <= 8 * 65536 && real.stalls >= 8, real);
ok(`…and it LIVES: the far peer reads again, every byte arrives (${real && real.delivered} of ${real && real.sent}) and a control line comes back; the inner Mux runs without a heartbeat`,
  !!real && real.delivered === real.sent && real.back && real.innerHeartbeat === false, real);
ok(`RED CONTROL (today's frame code, the stream's answer ignored): each inner producer is told «writable» until its own inner window is spent, so the outer channel queues several windows (${red && red.outerQ} B; one window is ${WIN})`,
  !!red && red.outerQ > 4 * WIN, red);
try { dm.stop?.(); } catch { }
server.close();
const end = endDaemonsAndWait(root);
ok('the scratch daemon ends on SIGTERM and is gone before its root is removed', end.pids.length >= 1 && end.gone && !end.killed, end);
fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
