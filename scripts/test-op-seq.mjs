#!/usr/bin/env node
// THE PER-SESSION OP SEQUENCE (chat pipeline perf lane, chunk D — the one wire
// change). src/op-seq.js is PURE: the ring the broadcast choke point stamps
// `seq` from (src/server/session-broadcast.js), the resume rung the attach
// handler picks from it, the `lagged` verdict the cut decides by, and the
// verbatim splice that puts the ring's frames into an `attached` payload.
// Table-tested here; the wiring (real normalizers + the real broadcast + fake
// ws clients) is test-attach-rebuild's §④, the browser end test-reconnect-storm.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };

const modPath = path.join(REPO, 'src/op-seq.js');
if (!fs.existsSync(modPath)) { console.error('  ✗ src/op-seq.js does not exist — no op sequence, every reconnect ships a slab'); console.log('\n1 FAILED (0 passed)'); process.exit(1); }
const { OP_RING, LAGGED_LIMIT_BYTES, OP_SEQ_CAP, createOpRing, laggedVerdict, resumeVerdict, attachedWithReplay } = require(modPath);
const src = fs.readFileSync(modPath, 'utf8');

console.log('— the module is PURE');
ok('imports nothing (no require / import)', !/\brequire\s*\(/.test(src.replace(/\/\/.*$/gm, '')) && !/^\s*import\s/m.test(src));
ok(`defaults: cap ${OP_RING.cap} frames, ${OP_RING.maxBytes} bytes; lagged limit ${LAGGED_LIMIT_BYTES}; capability '${OP_SEQ_CAP}'`,
  OP_RING.cap === 2000 && OP_RING.maxBytes === 4 * 1048576 && LAGGED_LIMIT_BYTES === 4 * 1048576 && OP_SEQ_CAP === 'op-seq');

const op = (i, extra = {}) => ({ type: 'msg', sessionId: 's', op: 'create', message: { id: 's:' + i, role: 'assistant', content: [{ type: 'text', text: 'x' + i }] }, ...extra });

console.log('— push: monotonic seq, the frame is the stamped text');
{
  const r = createOpRing();
  const a = r.push(op(1)), b = r.push(op(2)), c = r.push({ type: 'msg', sessionId: 's', op: 'edit', id: 's:1', fields: { content: [] } });
  ok('seq starts at 1 and increments by one per push', a.seq === 1 && b.seq === 2 && c.seq === 3 && r.seq === 3);
  ok('the frame is JSON of the message WITH its seq', JSON.parse(a.frame).seq === 1 && JSON.parse(c.frame).op === 'edit' && JSON.parse(c.frame).seq === 3);
  const m = op(9); r.push(m);
  ok('the caller\'s object is not mutated (a shallow copy is stamped)', !('seq' in m));
  ok('size / oldest / bytes track what is held', r.size === 4 && r.oldest === 1 && r.bytes === [a, b, c].reduce((n, x) => n + x.frame.length, 0) + JSON.stringify({ ...m, seq: 4 }).length);
}

console.log('— since: inside the ring ⇒ exactly the frames after it');
{
  const r = createOpRing({ cap: 100 });
  const sent = []; for (let i = 1; i <= 10; i++) sent.push(r.push(op(i)).frame);
  const s4 = r.since(4);
  ok('since(4) = frames 5..10 in order, byte-identical to what push returned', Array.isArray(s4.ops) && s4.ops.length === 6 && s4.ops.join('\n') === sent.slice(4).join('\n') && s4.seq === 10);
  ok('since(0) on a ring still holding seq 1 = everything', r.since(0).ops.length === 10);
  ok('since(current) = [] (nothing missed — a HELD resume with an empty replay)', Array.isArray(r.since(10).ops) && r.since(10).ops.length === 0);
  ok('since(a future seq) is NOT covered (not one of ours ⇒ the full attach)', r.since(11).ops === null && r.since(11).lagged === true);
  ok('since(garbage) is not covered', r.since(-1).ops === null && r.since('x').ops === null && r.since(2.5).ops === null && r.since(undefined).ops === null);
}

console.log('— cap eviction: older than the ring ⇒ lagged with the oldest held');
{
  const r = createOpRing({ cap: 5 });
  for (let i = 1; i <= 12; i++) r.push(op(i));
  ok('holds the newest cap frames (8..12)', r.size === 5 && r.oldest === 8 && r.seq === 12);
  const old = r.since(6);
  ok('since(6) — frame 7 fell off — is lagged, naming oldest 8', old.ops === null && old.lagged === true && old.oldest === 8 && old.seq === 12);
  const edge = r.since(7);
  ok('since(7) — the frame right before the oldest — is covered (8..12)', Array.isArray(edge.ops) && edge.ops.length === 5 && JSON.parse(edge.ops[0]).seq === 8);
  // many pushes: the amortized head compaction keeps order
  const big = createOpRing({ cap: 50 });
  for (let i = 1; i <= 5000; i++) big.push(op(i));
  const t = big.since(4990);
  ok('5000 pushes through a 50-frame ring: order and numbering stay exact after compaction', big.size === 50 && big.oldest === 4951 && t.ops.length === 10 && t.ops.map((f) => JSON.parse(f).seq).join() === '4991,4992,4993,4994,4995,4996,4997,4998,4999,5000');
}

console.log('— the byte bound (a streamed edit restates the whole content each time)');
{
  const r = createOpRing({ cap: 1000, maxBytes: 10000 });
  for (let i = 1; i <= 20; i++) r.push({ type: 'msg', sessionId: 's', op: 'edit', id: 's:1', fields: { content: [{ type: 'text', text: 'y'.repeat(1000) }] } });
  ok(`bytes stay ≤ maxBytes (${r.bytes} ≤ 10000) by evicting the oldest`, r.bytes <= 10000 && r.size < 20 && r.size > 0);
  const huge = r.push({ type: 'msg', sessionId: 's', op: 'create', message: { id: 'big', content: 'z'.repeat(50000) } });
  ok('a single frame larger than maxBytes is still held (the newest frame is never evicted)', r.size === 1 && r.oldest === huge.seq && r.since(huge.seq - 1).ops.length === 1);
}

console.log('— reset on a new epoch');
{
  const r = createOpRing();
  for (let i = 1; i <= 5; i++) r.push(op(i));
  r.reset();
  ok('reset forgets every frame', r.size === 0 && r.bytes === 0);
  ok('seq stays monotonic across a reset (a number is never reused)', r.seq === 5 && r.oldest === 6 && r.push(op(6)).seq === 6);
  ok('a client resuming from before the reset is not covered', r.since(3).ops === null && r.since(3).oldest === 6);
  ok('…but from the reset point it is', r.since(5).ops.length === 1);
}

console.log('— laggedVerdict table');
{
  const rows = [
    [{ bufferedAmount: 0 }, false],
    [{ bufferedAmount: LAGGED_LIMIT_BYTES }, false],
    [{ bufferedAmount: LAGGED_LIMIT_BYTES + 1 }, true],
    [{ bufferedAmount: 900, limitBytes: 1000 }, false],
    [{ bufferedAmount: 1001, limitBytes: 1000 }, true],
    [{ bufferedAmount: 1001, limitBytes: 0 }, false],          // a non-positive limit falls back to the default
    [{ bufferedAmount: undefined }, false],                    // a socket without the reading keeps delivery
    [{ bufferedAmount: 'lots' }, false],
    [{ bufferedAmount: -5 }, false],
    [{}, false],
    [undefined, false],
  ];
  const bad = rows.filter(([inp, want]) => laggedVerdict(inp).lagged !== want);
  ok(`${rows.length} rows: strictly above the limit, a missing reading is never a verdict`, bad.length === 0, bad.map(([i]) => JSON.stringify(i)).join(' '));
  const v = laggedVerdict({ bufferedAmount: 5e6 });
  ok('the verdict names the reading and the limit it was judged against (the telemetry detail)', v.bufferedAmount === 5e6 && v.limitBytes === LAGGED_LIMIT_BYTES);
}

console.log('— resumeVerdict: the attach rung');
{
  const r = createOpRing({ cap: 10 });
  for (let i = 1; i <= 15; i++) r.push(op(i));
  const E = 1788550000000;
  const held = resumeVerdict({ ring: r, normEpoch: E, sinceSeq: 12, sinceEpoch: E });
  ok('same epoch, inside the ring ⇒ held with the frames after it and opSeq', held.held === true && held.replay.length === 3 && held.opSeq === 15);
  const rows = [
    [{ ring: r, normEpoch: E }, 'no-since'],
    [{ ring: r, normEpoch: E, sinceSeq: 12 }, 'no-since'],
    [{ ring: r, normEpoch: E, sinceSeq: 12, sinceEpoch: E + 1 }, 'epoch'],
    [{ ring: r, normEpoch: 0, sinceSeq: 12, sinceEpoch: 0 }, 'epoch'],
    [{ ring: null, normEpoch: E, sinceSeq: 0, sinceEpoch: E }, 'no-ring'],
    [{ ring: r, normEpoch: E, sinceSeq: 2, sinceEpoch: E }, 'outside-ring'],
    [{ ring: r, normEpoch: E, sinceSeq: 99, sinceEpoch: E }, 'outside-ring'],
  ];
  const bad = rows.filter(([inp, why]) => { const v = resumeVerdict(inp); return v.held !== false || v.why !== why || typeof v.opSeq !== 'number'; });
  ok(`${rows.length} full-attach rows name why (and still carry opSeq — the capability advert)`, bad.length === 0, bad.map(([i, w]) => w).join(' '));
  ok('sinceSeq 0 is a real number (a client that saw opSeq 0), not "absent"', resumeVerdict({ ring: createOpRing(), normEpoch: E, sinceSeq: 0, sinceEpoch: E }).held === true);
}

console.log('— attachedWithReplay: the frames spliced in verbatim');
{
  const r = createOpRing();
  const frames = [r.push(op(1)).frame, r.push({ type: 'msg', sessionId: 's', op: 'edit', id: 's:1', fields: { content: [{ type: 'text', text: 'ünïcødé   "q"' }] } }).frame];
  const text = attachedWithReplay({ type: 'attached', sessionId: 's', slab: 'held', opSeq: 2 }, frames);
  const parsed = JSON.parse(text);
  ok('the payload parses, carries its own keys and a replay array', parsed.type === 'attached' && parsed.slab === 'held' && parsed.opSeq === 2 && Array.isArray(parsed.replay) && parsed.replay.length === 2);
  ok('each replayed op re-serializes to the EXACT text the ring sent (byte-compare)', parsed.replay.map((x) => JSON.stringify(x)).join('\n') === frames.join('\n'));
  ok('no `messages` key (a held resume is not a slab)', !('messages' in parsed));
  ok('an empty replay is an empty array', JSON.parse(attachedWithReplay({ type: 'attached' }, [])).replay.length === 0);
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
