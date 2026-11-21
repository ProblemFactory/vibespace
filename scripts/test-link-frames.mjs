#!/usr/bin/env node
// THE LINK'S FRAME CODE (cs M1, piece 1 — the separation design, «The link»): back-pressure honoured and an inner link's
// bounds. (1) A Mux whose stream says write() === false holds every frame, in order, until 'drain': data() says false when
// the WIRE is full, and onWritable resumes the producer after the drain. (2) An inner link's bounds: a control line over
// `maxControl` is refused when sent and kills the link when received; a frame over `maxFrame` kills it. (3) A LINK INSIDE A
// LINK over a REAL daemon: an inner Mux pair rides one byte channel (the daemon's tcp-forward to a peer in this process);
// the peer stops reading, so the outer channel is starved of credit — the inner link lives (heartbeat off) and the outer
// channel's queue stays within one window plus one write. RED control (a mutant of mux.js that ignores the stream's answer,
// today's frame code): the inner producer is always told «writable» and the outer queue takes everything it writes.
// THE ACCEPTANCE'S CURE (主开发 2026-11-17, take-after-fixes): «onWritable after the drain» asserted (red: no waiter loop);
// 'drain' only after a false write — fifty small inner frames behind a held close tell no forgotten channel «writable» (red:
// the as-built drain); the queued close is OPT-IN (`closeAfterQueue`, the interface's link and an inner link) — without it
// today's device link sends a close at once with two windows queued (red: the reviewed tip that held every close); every
// wait is on its effect with a deadline; the scratch device agent's roots come from the tree's scratch helper, and it is
// stopped on every path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { endDaemonsAndWait, endDaemonsOf, scratch, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('ok(…): its name must be a string — a swapped call is refused'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a wait on an EFFECT with a deadline (never a fixed sleep: a leg's verdict is not the clock's — 主开发 2026-11-17)
const until = async (f, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(2); } return !!f(); };
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
  const m = new M(st, { heartbeat: false, closeAfterQueue: true, onWritable: (c) => writable.push(c) });
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
// «onWritable fires after the drain» — asserted (主开发 2026-11-17, must 5): a channel whose OWN write filled the wire has an
// empty queue, so only the waiter loop resumes it; RED CONTROL: a frame code without that loop never resumes its producer
const noWaiterLoop = (() => {
  const src = fs.readFileSync(path.join(REPO, MUXF), 'utf8');
  const A = '    for (const chan of waiting) if (!this._sendQ.get(chan)?.length) this.onWritable(chan);\n';
  return src.includes(A) ? require(MUT.write(MUXF, src.split(A).join(''), 'no-waiters')).Mux : null;
})();
for (const [name, M, want] of [['the frame code', Mux, true], ['RED CONTROL (no waiter loop after the drain)', noWaiterLoop, false]]) {
  if (!M) { ok(name + ': the mutant could be made', false); continue; }
  const st = new FakeStream(10); const writable = [];
  const m = new M(st, { heartbeat: false, onWritable: (c) => writable.push(c) });
  const went = m.data(5, Buffer.alloc(100, 5));            // its own write filled the wire: told false, nothing left queued
  const before = writable.length;
  st.drain();
  if (want) ok(`${name}: a channel with no close whose own write filled the wire is told false (${went}) and hears onWritable once, AFTER the drain (${JSON.stringify(writable)}, ${before} before)`, went === false && before === 0 && writable.length === 1 && writable[0] === 5, { went, before, writable });
  else ok(`${name}: the producer is never resumed (${JSON.stringify(writable)})`, went === false && writable.length === 0, { writable });
}
// «drain» only after a false write (must 2): an inner link whose many small frames wait behind a held close — the outer
// frame code says onWritable whenever a frame goes straight through; an adapter that turned each into a drain re-entered
// the inner flush from inside it and told a channel whose CLOSE had left (and was forgotten) that it may write again
const { ChanDuplex: CD } = require(path.join(REPO, 'src/agentd/chan-duplex.js'));
const asBuiltDrain = (() => {
  const ms = fs.readFileSync(path.join(REPO, MUXF), 'utf8'), ds = fs.readFileSync(path.join(REPO, 'src/agentd/chan-duplex.js'), 'utf8');
  const A1 = '    if (this._dead || !this._wireFull) return;   // a drain the wire did not ask for changes nothing (and never re-enters a flush)\n';
  const A2 = 'else { this._wireWaiters.delete(chan); this.onWritable(chan); }   // told once';
  const D1 = "  writable() { if (this.closedAt || !this._needDrain) return; this._needDrain = false; this.emit('drain'); }\n";
  if (!ms.includes(A1) || !ms.includes(A2) || !ds.includes(D1)) return null;
  return { Mux: require(MUT.write(MUXF, ms.split(A1).join('    if (this._dead) return;\n').split(A2).join('else this.onWritable(chan);'), 'drain-mux')).Mux,   // stale-pins: kept — the drain red's own release-era text
    ChanDuplex: require(MUT.write('src/agentd/chan-duplex.js', anchored(ds, D1, "  writable() { if (!this.closedAt) this.emit('drain'); }\n", 'drain after every write'), 'drain-duplex')).ChanDuplex };
})();
const pairA = () => { const a = new EventEmitter(), b = new EventEmitter(); a.write = (d) => { setImmediate(() => b.emit('data', Buffer.from(d))); return true; }; b.write = (d) => { setImmediate(() => a.emit('data', Buffer.from(d))); return true; }; return [a, b]; };
for (const [name, lib, want] of [['the frame code', { Mux, ChanDuplex: CD }, true], ['RED CONTROL (the as-built drain: every outer writable a drain)', asBuiltDrain, false]]) {
  if (!lib) { ok(name + ': the mutants could be made', false); continue; }
  const [oa, ob] = pairA(); let adapter = null;
  const A = new Mux(oa, { heartbeat: false, onWritable: (c) => { if (c === 7) adapter.writable(); } });
  let credit = false; const B = new Mux(ob, { heartbeat: false, onData: (c, b) => { if (credit) B.credit(c, b.length); } });
  adapter = new lib.ChanDuplex(A, 7);
  const told = [];
  const I = new lib.Mux(adapter, { heartbeat: false, closeAfterQueue: true, onWritable: (c) => told.push([c, I._sendWin.has(c)]) });
  I.data(1, Buffer.alloc(INITIAL_WINDOW, 1));              // fills the outer window: the inner wire is full
  for (let i = 0; i < 50; i++) I.data(3, Buffer.alloc(100, 3));   // fifty small frames wait in channel 3's own queue
  I.closeChan(3);                                          // its CLOSE held behind them
  const held = I._closeAfter.has(3) && (I._sendQ.get(3) || []).length === 50;
  credit = true; B.credit(7, 8 * INITIAL_WINDOW);          // the far side reads again
  await until(() => !I._closeAfter.has(3) && !I._sendWin.has(3));
  const ghost = told.filter(([c, known]) => c === 3 && !known).length;
  if (want) ok(`${name}: fifty small inner frames behind a held close go, the close leaves and the channel is forgotten — and no writable is told for it after (${ghost} for the forgotten channel; told ${JSON.stringify(told)})`, held && !I._sendWin.has(3) && ghost === 0 && told.every(([c]) => c !== 3), { held, told });
  else ok(`${name}: the inner flush re-enters itself and a channel whose CLOSE has left hears writable (${ghost} times)`, ghost > 0, { told: told.slice(0, 6) });
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
  const A = "  closeChan(chan) {\n    if (this._closeAfterQueue && this._sendQ.get(chan)?.length) { this._closeAfter.add(chan); return; }   // behind its own queued data\n    this._raw(T.CLOSE, chan);\n    this.forget(chan);\n  }\n";
  // TODAY'S RELEASE (2.369.414): its close at once and no forget; since B-beaf it already ignores a stale credit (G is its own
  // line now — the chain's move kept the release's text), so the red cuts the close alone
  return src.includes(A) ? require(MUT.write(MUXF, anchored(src, A, '  closeChan(chan) { this._raw(T.CLOSE, chan); }\n', 'today\'s close'), 'lifecycle')).Mux : null;
})();
// an in-memory pair of streams (each write reaches the other side on the next turn)
const pair = () => { const a = new EventEmitter(), b = new EventEmitter(); a.write = (d) => { setImmediate(() => b.emit('data', Buffer.from(d))); return true; }; b.write = (d) => { setImmediate(() => a.emit('data', Buffer.from(d))); return true; }; return [a, b]; };
const { encodeFrame: enc } = require(path.join(REPO, MUXF));
const dataBytes = (got) => got.filter((g) => g[0] === 'data').reduce((n, g) => n + g[1], 0);
for (const [name, M, want] of [['the frame code', Mux, true], ['RED CONTROL (today\'s channel lifecycle)', todaysLifecycle, false]]) {
  if (!M) { ok(name + ': the mutant could be made', false); continue; }
  const sink = { write: () => true, on() { } };
  const m = new M(sink, { heartbeat: false, closeAfterQueue: true });
  for (let c = 1; c <= 10000; c++) { m.data(c, Buffer.alloc(16)); m.closeChan(c); }
  const sizes = { win: m._sendWin.size, q: m._sendQ.size };
  m._onFrame(2, 42, Buffer.from([0, 0, 1, 0]));            // a late CREDIT for a forgotten channel
  m._onFrame(2, 20001, Buffer.from([0, 0, 1, 0]));         // …and one for a channel this side never wrote
  const after = m._sendWin.size;
  const [ea, eb] = pair(); const got = [];
  const A = new M(ea, { heartbeat: false, closeAfterQueue: true }), B = new M(eb, { heartbeat: false, onData: (c, b) => got.push(['data', b.length]), onClose: () => got.push(['close']) });
  A.data(7, Buffer.alloc(3 * INITIAL_WINDOW, 9)); A.closeChan(7);   // three windows with no credit, then the close
  await until(() => dataBytes(got) >= INITIAL_WINDOW);              // the first window arrived
  for (let i = 0; i < 2; i++) { const have = dataBytes(got); B.credit(7, INITIAL_WINDOW); await until(() => dataBytes(got) > have); }
  B.credit(7, INITIAL_WINDOW); await until(() => got.some((g) => g[0] === 'close'));
  const bytes = dataBytes(got), closeAt = got.findIndex((g) => g[0] === 'close');
  const lastData = got.map((g) => g[0]).lastIndexOf('data');
  const order = { bytes, closeAt, lastData, events: got.length, closeAfterAll: closeAt === got.length - 1 && closeAt > lastData && bytes === 3 * INITIAL_WINDOW };
  if (want) {
    ok(`ten thousand channels opened, written and dropped leave the send maps at their starting size (window ${sizes.win}, queue ${sizes.q}), and a late credit — for a forgotten channel or one never written — re-creates nothing (${after})`, sizes.win === 0 && sizes.q === 0 && after === 0, { sizes, after });
    ok(`WITH closeAfterQueue (the interface's link, an inner link): three windows written with no credit, then the close — the far side reads all three windows (${bytes} B) and THEN the close`, order.closeAfterAll, order);
  } else {
    ok(`${name}: the maps keep every channel (${sizes.win}; a late credit re-creates nothing there either since B-beaf: ${after}); the close OVERTAKES the queued windows (the close at event ${closeAt}, the last data at ${lastData})`, sizes.win === 10000 && after === 10000 && closeAt >= 0 && closeAt < lastData, { sizes, after, order });
  }
}
// TODAY'S DEVICE LINK KEEPS THE RELEASE'S CLOSE (主开发 2026-11-17, must 1): without the option a channel closed with two
// windows queued and no credit sends its CLOSE AT ONCE and forgets the channel (the agent destroys its socket on it — a
// close held behind a credit that far socket may never send would keep the socket open and the queue in the hub)
const holdsAlways = (() => {
  const src = fs.readFileSync(path.join(REPO, MUXF), 'utf8');
  const A = '    if (this._closeAfterQueue && this._sendQ.get(chan)?.length) { this._closeAfter.add(chan); return; }';
  return src.includes(A) ? require(MUT.write(MUXF, src.split(A).join('    if (this._sendQ.get(chan)?.length) { this._closeAfter.add(chan); return; }'), 'holds-always')).Mux : null;   // stale-pins: kept — the held-close red's own text
})();
for (const [name, M, want] of [['the frame code', Mux, true], ['RED CONTROL (the reviewed tip: every link held the close)', holdsAlways, false]]) {
  if (!M) { ok(name + ': the mutant could be made', false); continue; }
  const [ea, eb] = pair(); const got = [];
  const A = new M(ea, { heartbeat: false }), B = new M(eb, { heartbeat: false, onData: (c, b) => got.push(['data', b.length]), onClose: () => got.push(['close']) });
  A.data(9, Buffer.alloc(3 * INITIAL_WINDOW, 4));          // one window goes, two wait for a credit that never comes
  await until(() => dataBytes(got) >= INITIAL_WINDOW);
  A.closeChan(9);
  const closed = await until(() => got.some((g) => g[0] === 'close'), want ? 2000 : 300);
  if (want) ok(`WITHOUT the option (today's device link): a channel closed with two windows queued and no credit sends its CLOSE at once (${JSON.stringify(got.map((g) => g[0] === 'data' ? g[1] : 'close'))}) and forgets the channel (queue ${A._sendQ.has(9)}, window ${A._sendWin.has(9)})`, closed && dataBytes(got) === INITIAL_WINDOW && !A._sendQ.has(9) && !A._sendWin.has(9), { got });
  else ok(`${name}: the CLOSE waits behind two windows for a credit that never comes (${closed ? 'sent' : 'never sent'}; held ${A._closeAfter.has(9)})`, !closed && A._closeAfter.has(9), { got });
}

console.log('§3 A LINK INSIDE A LINK, over a REAL daemon — the outer channel starved of credit');
// device #0 constructed as server.js does (test-local-device's recipe): a SCRATCH DEVICE AGENT (the built
// data/bin/vibespace-agentd.js, started detached by the DeviceManager) in its own roots from THE TREE'S SCRATCH HELPER
// (scratch.mjs scratch(): /tmp/vs-<name>-<pid>, the shape the identity stop accepts — never a path this suite spells, the gate's
// census), the daemon root env the agent prefers REMOVED and HOME pointed at the scratch root BEFORE the manager is built; the
// agent is stopped on EVERY path — the end, an exit, a signal. The stop is registered BEFORE the first mint, so at an exit it
// runs before the helper removes the roots (a daemon never outlives its root).
let root = null, dataDir = null, scratchEnded = false;
const endScratch = () => { if (scratchEnded || !root) return; scratchEnded = true; try { endDaemonsOf(root); } catch { } for (const d of [root, dataDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', endScratch);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { endScratch(); process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGTERM' ? 15 : 1)); });
root = scratch('linkframes'); dataDir = scratch('linkframes-data');
fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(dataDir, { recursive: true });
delete process.env.VIBESPACE_DEVICE_ROOT;                    // the agent takes it before VIBESPACE_AGENTD_ROOT (agentd.js ROOT)
process.env.VIBESPACE_AGENTD_ROOT = path.join(root, 'agentd');
process.env.HOME = root;
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: require(path.join(REPO, 'package.json')).version, nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
let farSock = null; const far = { bytes: 0, controls: [] };
const server = net.createServer((sock) => {
  farSock = sock;
  // the far end of the inner link: it consumes (and credits) every byte it reads
  const B = new Mux(sock, { heartbeat: false, maxControl: 65536, closeAfterQueue: true, onControl: (o) => far.controls.push(o), onData: (c, b) => { far.bytes += b.length; B.credit(c, b.length); } });
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
  const A = new M(adapter, { heartbeat: false, maxControl: 65536, closeAfterQueue: true, onControl: (o) => near.controls.push(o) });
  await until(() => !!farSock, 1000);
  A.control({ op: 'hello-inner' });
  await until(() => far.controls.length > 0, 1000);
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
  // settle on the EFFECT: every producer has stalled (or reached its cap) and nothing moves for ten looks
  const outerLen = () => (dm._conn?.mux?._sendQ?.get(handle.chan) || []).reduce((n, b) => n + b.length, 0);
  { let last = '', same = 0; const t0 = Date.now(); while (Date.now() - t0 < 5000) { const sig = `${total()}:${outerLen()}:${stalls}`; if (sig === last) { if (++same >= 10 && (stalls >= K || total() >= K * CAP)) break; } else { same = 0; last = sig; } await sleep(20); } }
  const outerQ = (dm._conn?.mux?._sendQ?.get(handle.chan) || []).reduce((n, b) => n + b.length, 0);
  const innerQ = [...(A._sendQ?.values() || [])].flat().reduce((n, b) => n + b.length, 0) + (A._wireQ || []).reduce((n, f) => n + f.length, 0);
  const sentWhileStarved = total();
  starving = false; om._onFrame = origFrame;                 // the credit comes back: the inner link must still be there
  om._sendWin.set(handle.chan, (om._sendWin.get(handle.chan) || 0) + withheld); om._flush(handle.chan);
  const reached = await until(() => total() >= K * CAP && far.bytes >= K * CAP, 10000);   // every producer RESUMED to its cap
  const sent = total();
  far.mux.control({ op: 'still-here' });
  await until(() => near.controls.some((o) => o.op === 'still-here'), 1000);
  const r = { greeted, sentWhileStarved, outerQ, innerQ, stalls, delivered: far.bytes, sent, all: K * CAP, reached, back: near.controls.some((o) => o.op === 'still-here'), innerHeartbeat: !!A._hb };
  try { handle.close(); } catch { }
  return r;
};
let real = null, red = null;
try { await dm.connect(); real = await nested(Mux); if (mutantMux) red = await nested(mutantMux); } catch (e) { real = real || { error: e.message }; }
const WIN = INITIAL_WINDOW;
ok(`the inner link greets across the real daemon's channel; EIGHT inner channels write while it is starved (settled when all stall) — the outer channel's queue stays within one write (${real && real.outerQ} B), each inner channel waits on its own queue (${real && real.innerQ} B held in all), every producer told to wait (${real && real.stalls} stalls)`,
  !!real && real.greeted && real.outerQ <= 65536 + 64 && real.innerQ <= 8 * 65536 && real.stalls >= 8, real);
ok(`…and it LIVES: the far peer reads again, every producer is resumed to its cap and every byte arrives before the deadline (${real && real.delivered} of ${real && real.all}) and a control line comes back; the inner Mux runs without a heartbeat`,
  !!real && real.reached && real.sent === real.all && real.delivered === real.all && real.back && real.innerHeartbeat === false, real);
ok(`RED CONTROL (today's frame code, the stream's answer ignored): each inner producer is told «writable» until its own inner window is spent, so the outer channel queues several windows (${red && red.outerQ} B; one window is ${WIN})`,
  !!red && red.outerQ > 4 * WIN, red);
try { dm.stop?.(); } catch { }
server.close();
const end = endDaemonsAndWait(root);
ok('the scratch daemon ends on SIGTERM and is gone before its root is removed', end.pids.length >= 1 && end.gone && !end.killed, end);
endScratch();
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
