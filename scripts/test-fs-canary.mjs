#!/usr/bin/env node
// test-fs-canary — design 011 lane 1 (store-timing, 2026-10-03): the threadpool canary (2.108.6) no longer reads a
// blocked event loop as a slow mount. No suite covered the canary before. Over the REAL module + its REAL one-worker
// SafeFs (src/server/fs-canary.js + fs-canary-worker.js):
//   §1 a healthy probe: timed off the main thread, nothing recorded
//   §2 a BLOCKED LOOP: the stat's own time stays small, the wait is the loop's fact (srv-loop-canary-ms), no strike —
//      also when the block outlasts the 5 s-class deadline (the old code struck there)
//   §3 a SLOW POOL is still seen: the shared libuv pool saturated from the main thread → srv-fs-canary-ms; past the
//      deadline three times → the wedged event + the health-sweep kick
//   §4 a probe that gets no answer (the SafeFs backstop) is said and counted, never a strike
//   §5 CONTROL (scripts/mutant-copy.mjs, never src/): the stat timed on the main thread again → §2's blocked loop
//      reads as a slow mount; the copies census
//   §6 pins: server.js runs the canary through createFsCanary and no main-thread stat remains; the probe is the pool's
// Run: node scripts/test-fs-canary.mjs
// before the first pool use: §3 saturates a pool of TWO — PINNED, never inherited (lane race-sweep, B-2d49: a VibeSpace agent
// session's env carries UV_THREADPOOL_SIZE=32, the 12-job saturation then never queued the stat — fs 0 ms, 3 FAILED)
process.env.UV_THREADPOOL_SIZE = '2';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const spin = (ms) => { const t = Date.now(); while (Date.now() - t < ms); };
const FILE = path.join(REPO, 'package.json');
const SRC = fs.readFileSync(path.join(REPO, 'src/server/fs-canary.js'), 'utf8');
const { createFsCanary } = require(path.join(REPO, 'src/server/fs-canary.js'));

function harness(createFn, opts = {}) {
  const recs = [], lines = [];
  let wedged = 0;
  const c = createFn({ file: FILE, record: (ev) => recs.push(ev), log: (l) => lines.push(l), onWedged: () => { wedged++; }, slowMs: 100, deadlineMs: 1000, ...opts });
  return { c, recs, lines, wedged: () => wedged, names: () => recs.map((r) => r.name) };
}
// A DETERMINISTIC libuv-threadpool wedge (lane quiet-box-flakes, B-c820). The pre-fix §3 made the pool "slow" by racing
// pbkdf2 jobs sized off a startup calibration (`saturate`): on a quiet / turbo box the jobs drained before the canary's
// stat ever queued, the stat answered in < slowMs and §3 went RED — while loaded it passed (the box was slower than the
// jobs). The wedge is now a MECHANISM, not a race: both pool workers (UV_THREADPOOL_SIZE = 2, pinned above, before the
// first pool op) block on a read of an empty FIFO that only the test writes to. The process-global libuv pool's queue is
// FIFO and the canary's stat is submitted a cross-thread round-trip later (tick → its SafeFs worker → fs.promises.stat),
// so the stat is ALWAYS behind the two blocked reads and waits exactly as long as the test holds the wedge — fast box
// as slow. The hold is the slow pool's duration (the test chooses it), never a guess about the machine.
const HOLD_MS = 300; // §3's P leg: the slow pool lasts this long (well past slowMs = 100), then answers — not a timeout
function poolWedge() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-wedge-'));
  const fifo = path.join(dir, 'pipe');
  execFileSync('mkfifo', [fifo]);
  const fd = fs.openSync(fifo, 'r+'); // O_RDWR: opens at once and never EOFs (its own writer); a read of it blocks while empty
  const buf = Buffer.alloc(1);
  for (let i = 0; i < 2; i++) fs.read(fd, buf, 0, 1, null, () => {}); // occupy BOTH pool workers
  return {
    release() { try { fs.writeSync(fd, Buffer.from('xxxx')); } catch {} }, // wakes both reads ⇒ the queued stat(s) run
    close() { try { fs.closeSync(fd); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

console.log('§1 a healthy probe');
const H = harness(createFsCanary);
{
  const r0 = await H.c.tick(); // spawns the worker
  const r = await H.c.tick();
  // (lane wall-clock-ratchet-down: the old `fsMs < 100 && loopMs < 100` judged the machine with the canary's own
  // slowMs — "healthy" is the canary's verdict: no strike, and the next line: nothing recorded)
  ok(r0 && r && r.where === 'worker' && !r.timedOut && r.strike === 0, `timed in its own worker: fs ${r && r.fsMs} ms, loop ${r && r.loopMs} ms`);
  ok(H.recs.length === 0 && H.lines.length === 0, 'a healthy probe records and says nothing (anomalies only)');
}

console.log('§2 a blocked loop is not a slow mount');
{
  const p = H.c.tick(); // posted now; the worker answers while the main thread spins
  spin(1500);
  const r = await p;
  // the stat's time is a SMALL PART of the hold (lane wall-clock-ratchet-down: `fsMs < 300` judged the machine): the
  // worker's clock reads under a quarter of what the main loop held — §5's main-clock copy reads the stat ≥ the hold
  ok(r && r.fsMs * 4 < r.loopMs && r.loopMs >= 1200 && r.strike === 0, `the stat ${r && r.fsMs} ms (worker clock), the loop held its answer ${r && r.loopMs} ms, no strike`);
  ok(JSON.stringify(H.names()) === '["srv-loop-canary-ms"]' && H.recs[0].value >= 1200 && H.c.counts.slowLoop === 1 && H.c.counts.slowFs === 0,
    `counted as the loop's fact only (${JSON.stringify(H.recs)})`);
  ok(H.lines.length === 1 && /main loop held the probe's answer \d+ms .*not a slow mount/.test(H.lines[0]), `said by name: ${H.lines[0]}`);
  H.recs.length = 0; H.lines.length = 0;
  const p2 = H.c.tick(); // blocked LONGER than the deadline (1000 ms here): the old main-thread deadline struck
  spin(1800);
  const r2 = await p2;
  ok(r2 && !r2.timedOut && r2.strike === 0 && !H.names().includes('srv-fs-canary-ms') && !H.names().includes('srv-threadpool-wedged') && H.c.counts.timedOut === 0,
    `a block past the deadline is no strike and no srv-fs-canary-ms (${JSON.stringify(H.recs)})`);
}

console.log('§3 a slow pool is still seen');
{
  // its own canary, its deadline far past the wedge (lane wall-clock-ratchet-down: H's 1 s deadline is §2's subject):
  // the leg is WHICH fact a slow pool's stat is counted as. The pool is wedged by MECHANISM (poolWedge above), not by
  // racing pbkdf2 against a quiet / turbo box (B-c820): the stat is mechanically behind the two blocked workers.
  const P = harness(createFsCanary, { deadlineMs: 60e3 });
  await P.c.tick(); // spawns its worker
  const wedge = poolWedge();
  const probe = P.c.tick(); // its stat queues behind the two blocked reads — the pool is now slow, deterministically
  const held = setTimeout(() => wedge.release(), HOLD_MS); // the slow pool lasts HOLD_MS, then answers (never a timeout)
  const r = await probe;
  clearTimeout(held); wedge.release(); wedge.close();
  // the loop's part is SMALL against the stat's wait (the loop stayed free through the hold): a busy pool reads as fs
  ok(r && r.fsMs >= 100 && r.loopMs * 4 < r.fsMs && !r.timedOut, `the stat waited for the shared pool: fs ${r && r.fsMs} ms, loop ${r && r.loopMs} ms`);
  ok(P.names().join() === 'srv-fs-canary-ms' && P.c.counts.slowFs === 1 && /took \d+ms off the main thread/.test(P.lines[0] || ''), `counted as the fs fact (${JSON.stringify(P.recs)}; ${P.lines[0]})`);
  P.c.close();

  const W = harness(createFsCanary, { deadlineMs: 60 });
  await W.c.tick();
  const wedgeW = poolWedge(); // stays wedged across the three ticks — each stat is held past the 60 ms deadline
  const strikes = [];
  for (let i = 0; i < 3; i++) strikes.push(await W.c.tick()); // the worker's own 60 ms timer fires while the stat is queued ⇒ a strike
  wedgeW.release(); wedgeW.close(); // the abandoned stats drain; the pool is free for the healthy tick below
  ok(strikes.map((s) => s && s.strike).join() === '1,2,3' && W.wedged() === 1 && W.names().filter((n) => n === 'srv-fs-canary-ms').length === 3 && W.names().includes('srv-threadpool-wedged'),
    `three stats past the deadline in a row: strikes ${strikes.map((s) => s && s.strike).join()}, the wedged event, the health sweep kicked once (${W.names().join()})`);
  const after = await W.c.tick();
  ok(after && after.strike === 0 && !after.timedOut, 'a healthy stat after the wedge resets the strikes');
  W.c.close();
}

console.log('§3 CONTROL: a pool that is NOT wedged answers fast (the quiet box the old timed wedge raced)');
{
  // The pre-fix wedge (`saturate`) papered a race: when its pbkdf2 jobs drained before the stat queued — a quiet / fast
  // box — the pool was effectively FREE, the stat answered in < slowMs, and §3's "slow pool" reads went red. With NO
  // wedge the canary records NOTHING: so §3 above is non-vacuous only because the wedge is a real, held mechanism.
  const Q = harness(createFsCanary, { deadlineMs: 60e3 });
  await Q.c.tick(); // spawns its worker
  const r = await Q.c.tick(); // a FREE pool: the stat sails through
  ok(r && !r.timedOut && r.strike === 0 && Q.c.counts.slowFs === 0 && Q.names().length === 0,
    `CONTROL: a free pool records nothing (fs ${r && r.fsMs} ms, loop ${r && r.loopMs} ms) — §3's slow-pool reads need a real wedge, not one raced against the box`);
  Q.c.close();
}

console.log('§4 a probe that gets no answer');
{
  const L = harness(createFsCanary, { probe: { call: () => Promise.reject(Object.assign(new Error('Storage not responding (operation timed out).'), { status: 503 })) } });
  const r = await L.c.tick();
  ok(r && r.lost && L.c.counts.lost === 1 && L.names().join() === 'srv-fs-canary-lost' && /not counted as a slow mount/.test(L.lines[0] || ''), `lost: said, counted, no strike (${L.lines[0]})`);
  let release;
  const S = harness(createFsCanary, { probe: { call: () => new Promise((res) => { release = res; }) } });
  const first = S.c.tick();
  ok((await S.c.tick()) === null, 'a probe still in flight: the next tick does nothing');
  release({ startAt: Date.now(), doneAt: Date.now(), fsMs: 0, timedOut: false, ok: true, where: 'worker' });
  await first;
}

console.log('§5 CONTROL: the stat timed on the main thread again');
const M = mutantCopies('fs-canary', REPO);
{
  const from = 'const fsMs = Math.max(0, r.fsMs);';
  ok(SRC.split(from).length === 2, 'the patch point is one line of the module');
  const mut = M.load('src/server/fs-canary.js', SRC.replace(from, 'const fsMs = Math.max(0, gotAt - sentAt);'), 'main-clock');
  const C = harness(mut.createFsCanary);
  await C.c.tick();
  const p = C.c.tick();
  spin(1500);
  const r = await p;
  ok(r && r.fsMs >= 1200 && C.names().includes('srv-fs-canary-ms'), `CONTROL: with the main thread's clock the same blocked loop reads as a ${r && r.fsMs} ms stat (${C.names().join()}) — §2 would be red`);
  C.c.close();
  for (const row of copiesCensus(M.files, M.dir, REPO)) ok(row.pass, row.name + (row.pass ? '' : ' — ' + row.detail));
}
H.c.close();

console.log('§6 pins');
{
  const server = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/require\('\.\/src\/server\/fs-canary\.js'\)\.createFsCanary\(\{\n    file: path\.join\(__dirname, 'package\.json'\),/.test(server) && /onWedged: \(\) => \{ try \{ mounts\._healthSweep\(\)/.test(server),
    'server.js runs the canary through createFsCanary over the checkout\'s package.json, the wedge kicks the mount health sweep');
  ok(!/CANARY_FILE|fs\.promises\.stat\(/.test(server), 'no stat of the canary is timed on the main thread any more');
  const worker = fs.readFileSync(path.join(REPO, 'src/server/fs-canary-worker.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  ok(/fs\.promises\.stat\(p\)/.test(worker) && !/statSync|readFileSync/.test(worker), 'the probe is an ASYNC stat — it goes through the shared pool, the thing the canary watches');
  ok(/poolSize: 1,/.test(SRC) && /timeouts: \{ probe: deadlineMs \* 3 \}/.test(SRC), 'its own one-worker SafeFs (never queued behind a file route), a backstop past the probe\'s own deadline');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
