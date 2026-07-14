#!/usr/bin/env node
// Unit test for src/agentd/mux.js — framing round-trip, chan-0 JSON control,
// byte-channel data, and CREDIT flow control (a fat transfer must not starve a
// concurrent stream: the design's stated requirement). Uses an in-memory
// duplex pair. Run: node scripts/test-mux.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Mux, INITIAL_WINDOW } = require('../src/agentd/mux.js');
import { PassThrough } from 'node:stream';

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a duplex pair: a.write → b receives, b.write → a receives
function pair() {
  const a2b = new PassThrough(), b2a = new PassThrough();
  const a = { write: (d) => a2b.write(d), on: (ev, fn) => (ev === 'data' ? b2a.on('data', fn) : ev === 'close' ? b2a.on('close', fn) : null), destroy: () => { a2b.destroy(); } };
  const b = { write: (d) => b2a.write(d), on: (ev, fn) => (ev === 'data' ? a2b.on('data', fn) : ev === 'close' ? a2b.on('close', fn) : null), destroy: () => { b2a.destroy(); } };
  return [a, b];
}

console.log('— mux: control round-trip + framing across chunk splits —');
{
  const [sa, sb] = pair();
  const got = [];
  const A = new Mux(sa, { heartbeat: false });
  const B = new Mux(sb, { heartbeat: false, onControl: (o) => got.push(o) });
  A.control({ op: 'hello', n: 1 });
  A.control({ op: 'world', s: 'ünïcödé ✓' }); // multibyte across the frame
  await sleep(50);
  check('two control messages received in order', got.length === 2 && got[0].op === 'hello' && got[1].s === 'ünïcödé ✓', JSON.stringify(got));
  A.destroy(); B.destroy();
}

console.log('— mux: byte channel data + credit accounting —');
{
  const [sa, sb] = pair();
  const rx = [];
  const A = new Mux(sa, { heartbeat: false });
  const B = new Mux(sb, { heartbeat: false, onData: (chan, buf) => { rx.push([chan, buf.length]); B.credit(chan, buf.length); } });
  A.data(7, Buffer.alloc(1000, 1));
  A.data(7, Buffer.alloc(2000, 2));
  await sleep(50);
  check('byte-channel data delivered on the right channel', rx.length === 2 && rx[0][0] === 7 && rx[0][1] === 1000 && rx[1][1] === 2000, JSON.stringify(rx));
  A.destroy(); B.destroy();
}

console.log('— mux: credit flow control does not starve a concurrent stream —');
{
  // B never returns credit on chan 1 (the "fat, stuck" transfer) but DOES on
  // chan 2 — chan 2 must keep flowing past chan 1's exhausted window.
  const [sa, sb] = pair();
  const seen1 = { bytes: 0 }, seen2 = { bytes: 0 };
  const A = new Mux(sa, { heartbeat: false });
  const B = new Mux(sb, {
    heartbeat: false,
    onData: (chan, buf) => {
      if (chan === 1) { seen1.bytes += buf.length; /* NO credit — sender's window drains */ }
      else if (chan === 2) { seen2.bytes += buf.length; B.credit(2, buf.length); }
    },
  });
  // overfill chan 1 well past its window so its sender queues
  const big = Buffer.alloc(INITIAL_WINDOW + 500000, 9);
  A.data(1, big);
  // meanwhile push a lot on chan 2 — far more than one window, only possible if credits flow
  let ch2sent = 0;
  for (let i = 0; i < 20; i++) { A.data(2, Buffer.alloc(65536, 3)); ch2sent += 65536; await sleep(5); }
  await sleep(100);
  check('chan 1 delivered only up to its window (starved sender queued the rest)', seen1.bytes === INITIAL_WINDOW, `${seen1.bytes} vs ${INITIAL_WINDOW}`);
  check('chan 2 flowed fully despite chan 1 being stuck', seen2.bytes === ch2sent, `${seen2.bytes} vs ${ch2sent}`);
  A.destroy(); B.destroy();
}

console.log('— mux: queued data flushes when credit arrives —');
{
  const [sa, sb] = pair();
  let recv = 0;
  const A = new Mux(sa, { heartbeat: false });
  const B = new Mux(sb, { heartbeat: false, onData: (chan, buf) => { recv += buf.length; } });
  A.data(5, Buffer.alloc(INITIAL_WINDOW + 100000, 1)); // 100000 queued past the window
  await sleep(50);
  check('only the window delivered before credit', recv === INITIAL_WINDOW, String(recv));
  B.credit(5, 100000); // grant the rest
  await sleep(50);
  check('queued bytes flush after credit', recv === INITIAL_WINDOW + 100000, String(recv));
  A.destroy(); B.destroy();
}

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall mux tests passed');
process.exit(0);
