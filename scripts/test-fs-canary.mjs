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
//   §7 THE BLOCKED LOOP NAMES ITS BLOCKER (lane vault-slow-load addendum — the owner's inc-mvk5ues0: «the main loop held the
//      probe's answer 5892ms» and nothing about what): src/server/loop-blame.js keeps every slow SYNC fs call of the main
//      thread (call, file, bytes, ms, the src/ frame); a loop held by a sync read of a FIFO a child fills after 1.3 s ⇒ the
//      canary's line names readFileSync, the file, the bytes and the caller; a CPU block ⇒ the line says CPU work; the PURE
//      words; server.js installs it before anything; CONTROL: the canary without the blame (the base) names nothing
//   §8 THE WITNESS NAMES THE HOLD (lane hub-fuse-sync-guard — 6.5 min held on an rclone mount, named by nothing): a 300 ms
//      sync call on a MOUNT path ⇒ the canary names fn + path + ms + mount + caller with no probe in flight and the For-you
//      fact carries the call site beside who presses the mount (one item per mount); a LOCAL path ⇒ named, no item; a probe
//      in flight ⇒ the same call, one line; THE GUARD: a storage row refused by name before the syscall, said once per
//      site, log-only by the setting, never before the first loop turn; CONTROL: the base-shaped canary names nothing;
//      the watchdog thread names a call still in flight (a child), with the kernel's wchan + syscall
//   §9 A VIEW IS CLASSED BY WHAT IT SHOWS (lane mount-class-by-source — the owner's workspace bindfs over NFS was 'home'
//      while the instance lived on it and 'storage' once it moved to the local disk): the two real rows, before and after
//      the move — home, then network, and a project path's existsSync / statSync / realpathSync never refused, nor the old
//      checkout path through the view; CONTROLS refused: rclone, a bindfs over rclone, a bindfs whose source row is absent,
//      a product storage row on a bindfs; every storageRootOf caller of src/ a row (census) + the transcript-folder decode;
//      THE HOLD WORDS on each of the three view rows (over NFS, over storage with the guard off, over the local disk — a
//      watched 'disk' root, never refused): three real 120 ms holds, the canary line and the For-you tail of each;
//      ROUND 2: an rclone and a product row BELOW the NFS source, reached through the view — all five sync calls refused, named
//   §10 B-1425 A PATH DIR ON A MOUNT IS NEVER STATTED FROM THE MAIN THREAD (src/desktop-display.js binOnPath — a production
//      checkout's data/bin on NFS rides the hub's PATH when a person launches it from a shell): the sync walk stats only the
//      local dirs; an NFS dir answers from the async walk (hostFacts awaits it), its answer spawns; a storage dir is never
//      read nor an answer; tmuxOnPath stats no mount dir; no refusal. CONTROLS: the old walk (statSyncs into the storage
//      dir, refused, and the NFS view), the storage dir answered (its spawn's re-stat refused)
//   §11 A STOP WITH THE WATCHDOG'S SESSION KEPT (主开发 2026-11-18 20:20Z — test-loop-hold-live leg 5's residual): a child whose
//      exit finds the watchdog's kind of session attached prints Node's one line and does NOT wait; its store's flush stands
//      before the line; RED CONTROL (an inspector port open: Node waits for the session) proves its plant first
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
import { anchored } from './scratch.mjs';   // B-75ba's control: B-0d3e's one door

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  ok(gateOf(r0) && gateOf(r) && r.where === 'worker' && !r.timedOut && r.strike === 0, `timed in its own worker: fs ${r && r.fsMs} ms, loop ${r && r.loopMs} ms`);
  ok(H.recs.length === 0 && H.lines.length === 0, 'a healthy probe records and says nothing (anomalies only)');
}

console.log('§2 a blocked loop is not a slow mount');
{
  const p = H.c.tick(); // posted now; the worker answers while the main thread spins
  spin(1500);
  const r = await p;
  // the stat's time is a SMALL PART of the hold (lane wall-clock-ratchet-down: `fsMs < 300` judged the machine): the
  // worker's clock reads under a quarter of what the main loop held — §5's main-clock copy reads the stat ≥ the hold
  ok(gateOf(r) && r.fsMs * 4 < r.loopMs && r.loopMs >= 1200 && r.strike === 0, `the stat ${r && r.fsMs} ms (worker clock), the loop held its answer ${r && r.loopMs} ms, no strike`);
  ok(JSON.stringify(H.names()) === '["srv-loop-canary-ms"]' && H.recs[0].value >= 1200 && H.c.counts.slowLoop === 1 && H.c.counts.slowFs === 0,
    `counted as the loop's fact only (${JSON.stringify(H.recs)})`);
  ok(H.lines.length === 1 && verdictOf(/main loop held the probe's answer \d+ms .*not a slow mount/.test(H.lines[0])), `said by name: ${H.lines[0]}`);
  H.recs.length = 0; H.lines.length = 0;
  const p2 = H.c.tick(); // blocked LONGER than the deadline (1000 ms here): the old main-thread deadline struck
  spin(1800);
  const r2 = await p2;
  ok(gateOf(r2) && !r2.timedOut && r2.strike === 0 && !H.names().includes('srv-fs-canary-ms') && !H.names().includes('srv-threadpool-wedged') && H.c.counts.timedOut === 0,
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
  ok(gateOf(r) && r.fsMs >= 100 && r.loopMs * 4 < r.fsMs && !r.timedOut, `the stat waited for the shared pool: fs ${r && r.fsMs} ms, loop ${r && r.loopMs} ms`);
  ok(P.names().join() === 'srv-fs-canary-ms' && P.c.counts.slowFs === 1 && verdictOf(/took \d+ms off the main thread/.test(P.lines[0] || '')), `counted as the fs fact (${JSON.stringify(P.recs)}; ${P.lines[0]})`);
  P.c.close();

  const W = harness(createFsCanary, { deadlineMs: 60 });
  await W.c.tick();
  const wedgeW = poolWedge(); // stays wedged across the three ticks — each stat is held past the 60 ms deadline
  const strikes = [];
  for (let i = 0; i < 3; i++) strikes.push(await W.c.tick()); // the worker's own 60 ms timer fires while the stat is queued ⇒ a strike
  wedgeW.release(); wedgeW.close(); // the abandoned stats drain; the pool is free for the healthy tick below
  ok(strikes.map((s) => s && s.strike).join() === '1,2,3' && W.wedged() === 1 && W.names().filter((n) => n === 'srv-fs-canary-ms').length === 3 && verdictOf(W.names().includes('srv-threadpool-wedged')),
    `three stats past the deadline in a row: strikes ${strikes.map((s) => s && s.strike).join()}, the wedged event, the health sweep kicked once (${W.names().join()})`);
  const after = await W.c.tick();
  ok(gateOf(after) && after.strike === 0 && !after.timedOut, 'a healthy stat after the wedge resets the strikes');
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
  ok(gateOf(r) && !r.timedOut && r.strike === 0 && Q.c.counts.slowFs === 0 && Q.names().length === 0,
    `CONTROL: a free pool records nothing (fs ${r && r.fsMs} ms, loop ${r && r.loopMs} ms) — §3's slow-pool reads need a real wedge, not one raced against the box`);
  Q.c.close();
}

console.log('§4 a probe that gets no answer');
{
  const L = harness(createFsCanary, { probe: { call: () => Promise.reject(Object.assign(new Error('Storage not responding (operation timed out).'), { status: 503 })) } });
  const r = await L.c.tick();
  ok(gateOf(r) && gateOf(r.lost) && L.c.counts.lost === 1 && L.names().join() === 'srv-fs-canary-lost' && verdictOf(/not counted as a slow mount/.test(L.lines[0] || '')), `lost: said, counted, no strike (${L.lines[0]})`);
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
  const mut = M.load('src/server/fs-canary.js', editAnchor(SRC, from, 'const fsMs = Math.max(0, gotAt - sentAt);', "src/server/fs-canary.js"), 'main-clock');
  const C = harness(mut.createFsCanary);
  await C.c.tick();
  const p = C.c.tick();
  spin(1500);
  const r = await p;
  ok(gateOf(r) && r.fsMs >= 1200 && verdictOf(C.names().includes('srv-fs-canary-ms')), `CONTROL: with the main thread's clock the same blocked loop reads as a ${r && r.fsMs} ms stat (${C.names().join()}) — §2 would be red`);
  C.c.close();
  for (const row of copiesCensus(M.files, M.dir, REPO)) ok(verdictOf(row.pass), row.name + (row.pass ? '' : ' — ' + row.detail));
}
H.c.close();

console.log('§6 pins');
{
  const server = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(gateOf(/require\('\.\/src\/server\/fs-canary\.js'\)\.createFsCanary\(\{\n    file: path\.join\(__dirname, 'package\.json'\),/.test(server)) && verdictOf(/onWedged: \(\) => \{ try \{ mounts\._healthSweep\(\)/.test(server)),
    'server.js runs the canary through createFsCanary over the checkout\'s package.json, the wedge kicks the mount health sweep');
  ok(!/CANARY_FILE|fs\.promises\.stat\(/.test(server), 'no stat of the canary is timed on the main thread any more');
  const worker = fs.readFileSync(path.join(REPO, 'src/server/fs-canary-worker.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  ok(gateOf(/fs\.promises\.stat\(p\)/.test(worker)) && !/statSync|readFileSync/.test(worker), 'the probe is an ASYNC stat — it goes through the shared pool, the thing the canary watches');
  ok(gateOf(/poolSize: 1,/.test(SRC)) && verdictOf(/timeouts: \{ probe: deadlineMs \* 3 \}/.test(SRC)), 'its own one-worker SafeFs (never queued behind a file route), a backstop past the probe\'s own deadline');
}

console.log('§10 THE INSTRUMENT\'S OWN COST IS COUNTED (B-9169) — clock reads, path judgements and path encodes per wrapped call');
{ // B-9169 (measured by lane hub-loop-stalls on Node 22 + 24): loop-blame's wrapper + the witness's hook cost ~1.1 µs a
  // wrapped call — two hrtime.bigint reads + a Date.now in the wrapper, a process.hrtime array for the live slot, the path
  // classified (MPC.rootOf) and encoded into the slot on EVERY call; 13 112 wrapped calls in the busiest second of 38
  // sessions restoring. THE CENSUS COUNTS what one call does, never its time: every clock is patched to count
  // (performance.now to a fake that steps a set length per read, so a call's length is the census's choice), MPC.rootOf,
  // the own-tree test (its `indexOf('/..')`) and TextEncoder#encodeInto to count; a fake fs module object carries the calls
  // (no syscall). Nothing is said while the clocks count (a line to a file stdout is a wrapped fs.writeSync).
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  const SW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
  const MPC = require(path.join(REPO, 'src/mount-path-class.js'));
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-cost-'));
  const NFS = '/srv/fscan-cost-nfs', OUT = `${NFS}/a/b.json`, IN = path.join(ROOT, 'src', 'x.json');   // the fixture's mount: never reached
  const MI = `900 42 0:73 / ${NFS} rw,relatime - nfs4 192.0.2.10:/v rw\n`;
  const quiet = { warn() {}, log() {} };
  const fakeFs = () => { const F = { statSync: (p) => ({ p }), existsSync: () => true, openSync: () => 7, closeSync: () => {}, renameSync: () => {} };
    F.readFileSync = (p) => { F.closeSync(F.openSync(p)); return 'x'; };   // two INNER wrapped calls
    return F; };
  const PERF = globalThis.performance, perfOwn = Object.getOwnPropertyDescriptor(PERF, 'now');
  const count = (step, run) => {
    const n = { hrtime: 0, bigint: 0, perf: 0, date: 0, rootOf: 0, own: 0, encode: 0 };
    const keep = { hr: process.hrtime, date: Date.now, rootOf: MPC.rootOf, enc: TextEncoder.prototype.encodeInto, idx: String.prototype.indexOf };
    let fake = 1e6;
    process.hrtime = Object.assign(function (...a) { n.hrtime++; return keep.hr.apply(this, a); }, { bigint: () => { n.bigint++; return keep.hr.bigint(); } });
    PERF.now = () => { n.perf++; return (fake += step); };
    Date.now = () => { n.date++; return 5e12; };
    MPC.rootOf = function (...a) { n.rootOf++; return keep.rootOf.apply(this, a); };
    TextEncoder.prototype.encodeInto = function (...a) { n.encode++; return keep.enc.apply(this, a); };
    String.prototype.indexOf = function (x, ...a) { if (x === '/..') n.own++; return keep.idx.call(this, x, ...a); };   // eslint-disable-line no-extend-native
    try { run(); } finally {
      process.hrtime = keep.hr; Date.now = keep.date; MPC.rootOf = keep.rootOf; TextEncoder.prototype.encodeInto = keep.enc; String.prototype.indexOf = keep.idx;   // eslint-disable-line no-extend-native
      if (perfOwn) Object.defineProperty(PERF, 'now', perfOwn); else delete PERF.now;
    }
    return n;
  };
  const K = 50, times = (k, f) => { for (let i = 0; i < k; i++) f(i); };
  const rig = (W = SW, L = LB) => { const F = fakeFs(); L.install({ fsMod: F, root: ROOT });
    const w = W.create({ rootDir: ROOT, dataDir: path.join(ROOT, 'data'), fresh: true, armed: false, live: false, log: quiet, readMountinfo: () => MI });
    w.refresh(); L.setHook(w.hook); return { F, w }; };
  const { F, w } = rig();
  const out = count(0.001, () => times(K, () => F.statSync(OUT)));
  const inTree = count(0.001, () => times(K, () => F.statSync(IN)));
  const nested = count(0.001, () => times(K, () => F.readFileSync(OUT)));
  const two = count(0.001, () => times(K, () => F.renameSync(OUT, IN)));
  w.refresh();
  const refreshed = count(0.001, () => times(K, () => F.statSync(OUT)));
  const per = (n) => `${n.perf / K} performance.now, ${n.hrtime / K} hrtime, ${n.bigint / K} hrtime.bigint, ${n.date / K} Date.now a call; ${n.rootOf} classed by mount, ${n.own} own-tree tests, ${n.encode} encoded over ${K}`;
  ok(out.perf === 2 * K && out.hrtime === 0 && out.bigint === 0 && out.date === 0,
    `CENSUS: a wrapped call shorter than ${LB.AT_MS} ms reads TWO clocks — performance.now at its start and its end — no hrtime, no hrtime.bigint, no wall clock (${per(out)})`, out);
  ok(out.rootOf === 1 && out.own === 1 && out.encode === 1 && w.roots().length === 1,
    `CENSUS: ${K} calls on ONE path outside the tree judge it once (its verdict kept per path until the roots refresh) and encode it into the live slot once (${per(out)})`, out);
  ok(inTree.rootOf === 0 && inTree.own === 1 && inTree.encode === 1 && inTree.perf === 2 * K, `CENSUS: a path in the instance's own tree is tested once (its verdict kept too), never classed by mount; encoded once (${per(inTree)})`, inTree);
  ok(nested.perf === 2 * K && nested.date === 0 && nested.hrtime + nested.bigint === 0 && nested.rootOf === 0 && nested.encode === 1,
    `CENSUS: the two calls a wrapped call makes inside it (readFileSync's openSync + closeSync) read no clock and reach no hook (${per(nested)})`, nested);
  ok(two.perf === 2 * K && two.rootOf === 0 && two.encode === 0,
    `CENSUS: a call of two paths judges each from the kept answers (the own-tree one never) and shows the one under the mount — the path the slot already holds, never encoded again (${per(two)})`, two);
  ok(refreshed.rootOf === 1, `CENSUS: a roots refresh drops the kept answers — the path is judged once more (${refreshed.rootOf})`, refreshed);
  { // the kept answers are BOUNDED (the oldest leaves first)
    const P = (i) => `${NFS}/many/${i}`;
    const fill = count(0.001, () => times(SW.ROOT_MEMO_MAX + 1, (i) => F.statSync(P(i))));
    const again = count(0.001, () => { F.statSync(P(SW.ROOT_MEMO_MAX)); F.statSync(P(0)); });
    ok(fill.rootOf === SW.ROOT_MEMO_MAX + 1 && again.rootOf === 1, `the kept answers are bounded at ${SW.ROOT_MEMO_MAX} paths: the newest is still kept, the oldest was dropped and is judged again (${again.rootOf})`, { fill: fill.rootOf, again: again.rootOf });
    // …and in bytes: a path longer than ROOT_MEMO_PATH_MAX is judged every time, never kept (the batch-78 readers' should)
    const LONG = `${NFS}/${'d/'.repeat(SW.ROOT_MEMO_PATH_MAX)}f`, AT = `${NFS}/${'e'.repeat(SW.ROOT_MEMO_PATH_MAX - NFS.length - 1)}`;
    const long = count(0.001, () => times(3, () => F.statSync(LONG))), edge = count(0.001, () => times(3, () => F.statSync(AT)));
    ok(LONG.length > SW.ROOT_MEMO_PATH_MAX && AT.length === SW.ROOT_MEMO_PATH_MAX && long.rootOf === 3 && edge.rootOf === 1, `a path past ${SW.ROOT_MEMO_PATH_MAX} characters is judged at every call, never kept (3 of 3); one of exactly ${SW.ROOT_MEMO_PATH_MAX} is kept (1 of 3)`, { long: long.rootOf, edge: edge.rootOf });
  }
  { // a refresh that THROWS leaves no verdict standing behind a context that still matches (the batch-78 readers' should)
    const MPCm = MPC, realRoots = MPCm.rootsOf;
    count(0.001, () => times(2, () => F.statSync(IN)));   // kept: the own-tree verdict
    MPCm.rootsOf = () => { throw new Error('a planted roots fault'); };
    let threw = false; try { w.refresh(); } catch { threw = true; } finally { MPCm.rootsOf = realRoots; }
    const after = count(0.001, () => times(2, () => F.statSync(IN)));
    ok(gateOf(threw) && after.own === 1, `a refresh that throws (the planted fault) clears the kept verdicts first — the own-tree path is judged once more, then kept (${after.own} of 2)`, after);
  }
  { // a call of AT_MS or longer is dated on the wall clock: its end less its length (the fake wall clock reads 5e12)
    const slow = count(60, () => times(5, () => F.statSync(OUT)));
    const e = w.ring().at(-1), b = LB.blame(0, Infinity, { k: Infinity }).find((x) => x.fn === 'statSync' && x.path === OUT);
    ok(slow.date === 5 && slow.perf === 10 && slow.hrtime + slow.bigint === 0 && gateOf(e) && e.at === 5e12 - 60 && e.ms === 60 && gateOf(b) && b.at === 5e12 - 60 && b.ms === 60,
      `a 60 ms call reads the wall clock ONCE, after it — its start is its end less its length, in the witness's ring and in loop-blame's (${slow.date} for 5 calls; at ${e && e.at})`, { slow, e, b });
  }
  { // the live slot's start is the wrapper's own start put on the monotonic clock (the watchdog's): read DURING a call
    const T = new Float64Array(w.slot, SW.SLOT_INTS * 4, SW.SLOT_FLOATS);
    const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
    let seen = null;
    F.lstatSync = (p) => { seen = { start: T[0], inside: mono(), inflight: w.inflight() }; return { p }; };
    LB.install({ fsMod: F, root: ROOT });
    F.lstatSync(OUT);
    ok(gateOf(seen) && seen.start <= seen.inside && seen.inside - seen.start < SW.LIVE_MS && gateOf(seen.inflight) && seen.inflight.fn === 'lstatSync' && seen.inflight.path === OUT && seen.inflight.root === NFS && seen.inflight.store === null && w.inflight() === null,
      `the live slot's start is on the monotonic clock, before the call's own first line (the wrapper's start + one offset read at load); inflight() names fn, path, root and store from the hook's fields`, seen);
  }
  // THE RED CONTROLS — each cut put back alone (scripts/mutant-copy.mjs, never src/): its own count is red
  const LSRC = fs.readFileSync(path.join(REPO, 'src/server/loop-blame.js'), 'utf8'), WSRC = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness.js'), 'utf8');
  const cut = (src, from, to) => (src.split(from).length === 2 ? src.replace(from, to) : null);
  // THE ONE-PATH FAST ROAD JUDGES AS THE LOOP DOES (the batch-78 readers' follow-up): every one-path call × every kind of
  // path, its verdict on the fast road (inflight() read DURING the call) against the same path through the loop
  // (renameSync(p, p) — the pathsOf road); a two-path call judged by the path that hits; the moved OWN-DATA-ON-A-MOUNT
  // branch (a data dir on its own network mount ⇒ its paths are the 'home' hit, never refused)
  const ONE = ['statSync', 'lstatSync', 'existsSync', 'readFileSync', 'readdirSync', 'accessSync', 'realpathSync', 'mkdirSync', 'openSync', 'writeFileSync', 'appendFileSync', 'rmSync', 'unlinkSync', 'chmodSync', 'utimesSync'];
  const DATA2 = path.join(ROOT, 'data'), STORE2 = `${ROOT}-store/S`, NFS2 = '/srv/fscan-cost-nfs2';
  const MI2 = `900 42 0:73 / ${NFS2} rw,relatime - nfs4 192.0.2.10:/v rw\n901 42 0:74 / ${DATA2} rw,relatime - nfs4 192.0.2.11:/d rw\n`;
  const PATHS = { ownSelf: DATA2, ownData: path.join(DATA2, 'x.json'), ownTree: IN, nfs: `${NFS2}/a/b`, storage: `${STORE2}/b.md`, climbs: `${ROOT}/../${path.basename(ROOT)}-store/S/c.md`,
    relative: 'rel/x.json', buffer: Buffer.from(`${NFS2}/buf`), url: new URL(`file://${STORE2}/u.md`) };
  const eqRun = (W) => {
    const F2 = {}, seen = [];
    const w2 = W.create({ rootDir: ROOT, dataDir: DATA2, fresh: true, armed: false, live: false, log: quiet, readMountinfo: () => MI2, registry: () => [{ mountpoint: STORE2, name: 'S', id: 'mnt-s' }] });
    for (const fn of [...ONE, 'renameSync']) F2[fn] = function () { seen.push(w2.inflight()); };
    LB.install({ fsMod: F2, root: ROOT }); w2.refresh(); LB.setHook(w2.hook);
    const at = (fn, ...a) => { seen.length = 0; F2[fn](...a); return seen[0] || null; };
    const bad = [];
    for (const [kind, p] of Object.entries(PATHS)) {
      const loop = at('renameSync', p, p);
      for (const fn of ONE) { const fast = at(fn, p); if (!fast || !loop || fast.root !== loop.root || fast.path !== loop.path) bad.push(`${fn}(${kind}): fast ${fast && fast.root} / loop ${loop && loop.root}`); }
    }
    const r = { bad, rename: (at('renameSync', IN, `${STORE2}/x.md`) || {}).root, fromHome: (at('renameSync', PATHS.ownData, `${STORE2}/y.md`) || {}).root, fromNfs: (at('renameSync', `${NFS2}/a`, `${STORE2}/b.md`) || {}).root, data: (at('statSync', PATHS.ownData) || {}).root, store: (at('statSync', PATHS.storage) || {}).root, nfs: (at('statSync', PATHS.nfs) || {}).root };
    w2.stop(); LB.setHook(null);
    return r;
  };
  const EQ = eqRun(SW);
  ok(!EQ.bad.length && EQ.store === STORE2 && EQ.nfs === NFS2, `the one-path fast road judges as the loop does: ${ONE.length} calls × ${Object.keys(PATHS).length} kinds of path (the data folder itself, own data, own tree, a network mount, a storage row, a path that climbs into storage, relative, a Buffer, a URL) — same root, same shown path`, EQ.bad.slice(0, 6));
  ok(EQ.rename === STORE2 && EQ.fromHome === STORE2 && EQ.fromNfs === STORE2, `a call of two paths INTO a storage row is judged by the path that hits — the loop's road, never the first path alone: from the own tree (no hit), from the own data on its mount (a 'home' hit) and from a network mount (a network hit), a later storage hit wins (${EQ.rename} · ${EQ.fromHome} · ${EQ.fromNfs})`, EQ);
  ok(EQ.data === DATA2, `THE OWN DATA ON ITS OWN MOUNT (a data dir on an nfs4 mount): its paths are the 'home' hit — named by that mount (${EQ.data})`, EQ);
  // …and NEVER REFUSED — on an ARMED witness (eqRun's is disarmed: it refuses nothing), beside a storage row that IS refused
  // in the same rig (the cure readers' should: a hit of another kind there would refuse every write of an NFS data dir)
  const armedRun = (W) => {
    const F3 = {};
    const w3 = W.create({ rootDir: ROOT, dataDir: DATA2, fresh: true, armed: true, live: false, log: quiet, readMountinfo: () => MI2, registry: () => [{ mountpoint: STORE2, name: 'S', id: 'mnt-s' }] });
    for (const fn of ['statSync', 'writeFileSync', 'renameSync']) F3[fn] = function () { return true; };
    LB.install({ fsMod: F3, root: ROOT }); w3.refresh(); LB.setHook(w3.hook);
    const refused = (fn, ...a) => { try { F3[fn](...a); return false; } catch (e) { return e && e.code === 'EVSMOUNTSYNC' ? e.mount : `threw ${e && e.code}`; } };
    const r = { data: refused('statSync', PATHS.ownData), write: refused('writeFileSync', PATHS.ownData, 'x'), store: refused('statSync', PATHS.storage), into: refused('renameSync', PATHS.ownData, `${STORE2}/z.md`) };
    w3.stop(); LB.setHook(null);
    return r;
  };
  const AR = armedRun(SW);
  ok(AR.data === false && AR.write === false && AR.store === STORE2 && AR.into === STORE2, `ARMED: the own data on its own mount is never refused (a stat and a write run), while a storage row in the same rig is refused (${AR.store}) and so is a rename from the data dir INTO it (${AR.into})`, AR);
  { // their RED CONTROLS: the fast road misjudging, a two-path call taken for a one-path one, the own-mount hit dropped
    const eqMut = (from, to, tag) => { const ws = cut(WSRC, from, to); return ws ? eqRun(M.load('src/server/sync-fs-witness.js', ws, tag)) : null; };
    const skipOwn = eqMut('{ p0 = args[0]; hit = verdictOf(p0); }', '{ p0 = args[0]; hit = MPC.rootOf(p0, CTX); }', 'fast-skips-own');
    const twoAsOne = eqMut("FNS.filter((f) => !f.startsWith('Dir.') && !FD_FNS.has(f) && !TWO_PATH.has(f))", "FNS.filter((f) => !f.startsWith('Dir.') && !FD_FNS.has(f))", 'two-as-one');
    const noHome = eqMut('(ownHit && p.startsWith(DATA_SLASH) ? ownHit : null)', 'null', 'no-home');
    // the loop given back its own inline compare (the old one: the data folder's only for a path that starts with the folder plus a
    // slash) while the one-path road keeps the helper: the parity table's data-folder row disagrees
    const loopOld = eqMut("            const o = ownVerdict(p);\n            if (o !== undefined) { if (o && !hit) { hit = o; hp = p; } continue; }   // the own tree: never refused, worded by ownVerdict\n",
      "            if (ownPath(p)) { if (ownHit && !hit && p.startsWith(DATA_SLASH)) { hit = ownHit; hp = p; } continue; }\n", 'loop-old-compare');   // stale-pins: kept — the loop's old compare, planted back as the RED
    const firstWins = eqMut("if (r && (!hit || (r.kind === 'storage' && hit.kind !== 'storage'))) { hit = r; hp = p; }", 'if (r && !hit) { hit = r; hp = p; }', 'first-hit-wins');
    const wsStorage = cut(WSRC, "Object.freeze({ kind: 'home',", "Object.freeze({ kind: 'storage',");
    const asStorage = wsStorage ? armedRun(M.load('src/server/sync-fs-witness.js', wsStorage, 'home-as-storage')) : null;
    ok(gateOf(firstWins) && firstWins.fromHome === DATA2 && firstWins.fromNfs === NFS2 && gateOf(asStorage) && asStorage.data === DATA2 && asStorage.write === DATA2,
      `RED CONTROLS: the first hit kept (a later storage hit never wins) names the data dir and the network mount, never the storage row (${firstWins && firstWins.fromHome} · ${firstWins && firstWins.fromNfs}); the own-mount hit made a storage hit refuses the data dir's own stat and write (${asStorage && asStorage.data})`, { firstWins, asStorage });
    ok(gateOf(skipOwn) && skipOwn.bad.length > 0 && gateOf(twoAsOne) && twoAsOne.rename !== STORE2 && gateOf(noHome) && noHome.data !== DATA2,
      `RED CONTROLS: a fast road that skips the own-tree verdict disagrees with the loop (${skipOwn && skipOwn.bad.length} calls); renameSync taken as one path misses the storage row (${twoAsOne && twoAsOne.rename}); the own-mount hit dropped names nothing (${noHome && noHome.data})`, { skipOwn: skipOwn && skipOwn.bad.slice(0, 2), twoAsOne: twoAsOne && twoAsOne.rename, noHome: noHome && noHome.data });
    ok(!!loopOld && loopOld.bad.length > 0 && verdictOf(loopOld.bad.every((x) => x.includes('(ownSelf)'))),
      `RED CONTROL: the loop given back its old compare — the parity table's data-folder row disagrees, and only it (${loopOld && loopOld.bad.length} of ${ONE.length} calls: ${loopOld && loopOld.bad.slice(0, 2).join(' · ')})`, loopOld && loopOld.bad.slice(0, 6));
  }
  // THE DATA FOLDER ITSELF IS A PATH OF THE DATA FOLDER. A folder's own sync opens it by path.dirname, no slash at its end
  // (src/secret-file.js replaceShredding: the atomic replace that writes data/instance.json at a first start ends with a sync of the
  // folder). HELD, it is worded by the data folder's own mount on both roads, as a file inside it is: (1) a one-path call on the
  // folder; (2) the folder opened and its descriptor synced (the fd road, pathsOf); (3) a path of the checkout beside it — the
  // checkout's own file, and a sibling whose name only begins with the folder's — keeps its words; (4) a data folder handed
  // unresolved ('/./', '//', a trailing slash): the folder itself still named (the compare is built from the resolved folder).
  // Every call reads 60 ms on the counted clock (count's step), past heldMs: each is held; the witness is ARMED (a 'home' hit is
  // witnessed, never refused). REDS: the old compare (the data folder's only for a path that starts with the folder plus a slash)
  // put back through the helper: red on (1) and (2); the compare built from the folder as handed: red on (4)
  const selfRun = (W, dataDir = DATA2) => {
    const F4 = {}; let fdN = 40;
    const w4 = W.create({ rootDir: ROOT, dataDir, fresh: true, armed: true, live: false, heldMs: 50, ringMs: 50, log: quiet, readMountinfo: () => MI2, registry: () => [{ mountpoint: STORE2, name: 'S', id: 'mnt-s' }] });
    F4.statSync = function () { return true; }; F4.openSync = function () { return ++fdN; }; F4.fsyncSync = function () { }; F4.closeSync = function () { };
    LB.install({ fsMod: F4, root: ROOT }); w4.refresh(); LB.setHook(w4.hook);
    const held = (f) => { const n0 = w4.ring().length; let threw = null; try { count(60, f); } catch (e) { threw = (e && e.code) || 'threw'; }
      return { threw, calls: w4.ring().slice(n0).map((e) => ({ fn: e.fn, path: e.path, ms: e.ms, words: SW.callWords(e) })) }; };
    const one = held(() => F4.statSync(DATA2));
    const fdRoad = held(() => { const fd = F4.openSync(DATA2, 'r'); try { F4.fsyncSync(fd); } finally { F4.closeSync(fd); } });
    const beside = held(() => { F4.statSync(IN); F4.statSync(`${DATA2}-old`); });
    w4.stop(); LB.setHook(null);
    return { one, fdRoad, beside };
  };
  const HOME_WORDS = `under the nfs4 mount «${DATA2}» this instance lives on (witnessed, never refused)`;
  const named = (r) => !!r && !r.threw && r.calls.length > 0 && r.calls.every((c) => c.ms >= 50 && c.words.includes(HOME_WORDS));
  const SELF = selfRun(SW), UNRESOLVED = `${ROOT}/./data//`, SELFU = selfRun(SW, UNRESOLVED);
  ok(gateOf(named(SELF.one)) && SELF.one.calls.length === 1 && SELF.one.calls[0].path === DATA2,
    `THE DATA FOLDER ITSELF (1): a held one-path call on the folder names its mount — ${SELF.one.calls.map((c) => c.words).join(' | ')}`, SELF.one);
  ok(gateOf(named(SELF.fdRoad)) && SELF.fdRoad.calls.map((c) => c.fn).join() === 'openSync,fsyncSync,closeSync' && verdictOf(SELF.fdRoad.calls.every((c) => c.path === DATA2)),
    `THE DATA FOLDER ITSELF (2): the folder opened and its descriptor synced, held — each of the three names its mount (the fd road): ${SELF.fdRoad.calls.map((c) => `${c.fn} ${c.words.includes(HOME_WORDS) ? 'names it' : 'NOT'}`).join(' · ')}`, SELF.fdRoad);
  ok(!SELF.beside.threw && SELF.beside.calls.length === 2 && verdictOf(SELF.beside.calls.every((c) => c.words.includes('not under a mount'))),
    `THE DATA FOLDER ITSELF (3): a path of the checkout beside the folder keeps its words — ${SELF.beside.calls.map((c) => c.words).join(' | ')}`, SELF.beside);
  ok(gateOf(named(SELFU.one)) && verdictOf(named(SELFU.fdRoad)),
    `THE DATA FOLDER ITSELF (4): the data folder handed unresolved (${UNRESOLVED.slice(ROOT.length)}) — the folder itself still names its mount on both roads (${SELFU.one.calls.map((c) => c.words.includes(HOME_WORDS) ? 'named' : 'NOT').join()} · ${SELFU.fdRoad.calls.map((c) => c.words.includes(HOME_WORDS) ? 'named' : 'NOT').join()})`, SELFU);
  { // ITS RED CONTROLS: the old compare put back through the anchored helper (the data folder itself no longer its own) — red on (1) and
    // (2); the folder-itself compare built from the folder as handed (its trailing slashes cut, never resolved) — red on (4)
    const wsOld = cut(WSRC, '    if (DATA_SELF !== null && p === DATA_SELF) return ownHit;   // the data folder itself (its own sync opens it by path.dirname), by its own mount\n', '');
    const ROld = wsOld ? selfRun(M.load('src/server/sync-fs-witness.js', wsOld, 'data-self-old-compare')) : null;
    const said = (r) => (r ? r.calls.filter((c) => c.words.includes('not under a mount')).map((c) => c.fn) : []);
    ok(!!ROld && said(ROld.one).join() === 'statSync' && gateOf(said(ROld.fdRoad).includes('fsyncSync')) && !named(ROld.one) && !named(ROld.fdRoad),
      `RED CONTROL: the old compare put back — the data folder itself is worded «not under a mount» on the one-path road (${said(ROld.one).join() || 'none'}) and on the fd road (${said(ROld.fdRoad).join(', ') || 'none'})`, ROld);
    const wsHanded = cut(WSRC, "  const DATA_SELF = typeof dataDir === 'string' && dataDir[0] === '/' && path.resolve(dataDir) !== '/' ? path.resolve(dataDir) : null;\n",
      "  const DATA_SELF = DATA_SLASH && DATA_SLASH[0] === '/' && DATA_SLASH.length > 1 ? DATA_SLASH.slice(0, -1) : null;\n");   // stale-pins: kept — the compare as first built, planted back as the RED
    const RHanded = wsHanded ? selfRun(M.load('src/server/sync-fs-witness.js', wsHanded, 'data-self-as-handed'), UNRESOLVED) : null;
    ok(!!RHanded && said(RHanded.one).join() === 'statSync' && !named(RHanded.one),
      `RED CONTROL: the folder-itself compare built from the folder as handed — the unresolved data folder is worded «not under a mount» (${said(RHanded.one).join() || 'none'})`, RHanded);
  }
  const noKept = cut(WSRC, "if (typeof p !== 'string' || p.length > ROOT_MEMO_PATH_MAX) return judged(p);", 'return judged(p);');
  const muts = {
    'every call dated': [cut(LSRC, 'const at = ms >= datedFrom ? Math.round(now() - ms) : NaN;', 'const at = now();'), null, 'date', OUT],
    'the slot reads its own clock': [null, cut(WSRC, 'T[0] = typeof t0 === \'number\' && now === mono ? t0 + PERF_TO_MONO : now();', 'T[0] = now();'), 'hrtime', OUT],
    'no kept verdicts (outside the tree)': [null, noKept, 'rootOf', OUT],
    'no kept verdicts (the own tree)': [null, noKept, 'own', IN],
    'the path encoded every call': [null, cut(WSRC, 'if (p !== encP) { encLen = enc.encodeInto(p, P).written; encP = p; }', '{ encLen = enc.encodeInto(p, P).written; encP = p; }'), 'encode', OUT],
    // every call sent through the loop (the fast road cut): the own-tree test runs at every call again
    'every call through the loop': [null, cut(WSRC, "if (ONE_PATH.has(fn) && typeof args[0] !== 'number') { p0 = args[0]; hit = verdictOf(p0); }", "if (false) { }"), 'own', IN],
    // an inner call (readFileSync's openSync + closeSync) taken through the outer road again: it reads the clock and the hook
    'inner calls read the clock': [cut(LSRC, '      if (depth !== 0) { depth++; try { return orig.apply(this, args); } finally { depth--; } }   // an inner call: no clock, no hook\n', ''), null, 'perf', OUT, 'readFileSync', 2 * K],
  };
  const reds = Object.entries(muts).map(([tag, [l, ws, key, at, fn = 'statSync', over = 0]]) => {
    if ((l === null) === (ws === null)) return [tag, null];
    const r = rig(ws ? M.load('src/server/sync-fs-witness.js', ws, tag.replace(/\W+/g, '-')) : SW, l ? M.load('src/server/loop-blame.js', l, tag.replace(/\W+/g, '-')) : LB);
    const n = count(0.001, () => times(K, () => r.F[fn](at)));
    r.w.stop();
    return [tag, n[key] >= K && n[key] > over ? n[key] : null];
  });
  { // RED CONTROL of the throwing refresh: the verdicts cleared only AFTER the roots are rebuilt (as at a70fdfef0)
    const CTXL = '    CTX = { mountRoots: roots, rootDir, dataDir, home, cwd };\n';
    const ws0 = cut(WSRC, '    rootMemo.clear(); memoCtx = null;\n', '');
    const ws = ws0 && cut(ws0, CTXL, CTXL + '    rootMemo.clear(); memoCtx = CTX;\n');   // a70fdfef0's refresh: the clear after the rebuild (stale-pins: kept — the red control rebuilds it)
    const r = ws ? rig(M.load('src/server/sync-fs-witness.js', ws, 'clear-after-rebuild')) : null;
    let stale = null, clean = null, threw = false;
    if (r) {
      count(0.001, () => times(2, () => r.F.statSync(IN)));
      r.w.refresh();   // no fault: this copy DOES clear at a refresh (the own-tree path is judged once more)
      clean = count(0.001, () => times(2, () => r.F.statSync(IN))).own;
      const realRoots = MPC.rootsOf; MPC.rootsOf = () => { throw new Error('a planted roots fault'); };
      try { r.w.refresh(); } catch { threw = true; } finally { MPC.rootsOf = realRoots; }
      stale = count(0.001, () => times(2, () => r.F.statSync(IN))).own;
      r.w.stop();
    }
    ok(clean === 1 && gateOf(threw) && stale === 0, `RED CONTROL: with the clear after the rebuild (as at a70fdfef0) — which does clear at a refresh that runs (${clean}) — a refresh that throws leaves the old own-tree verdict standing (${stale} own-tree tests after it)`, { clean, threw, stale });
  }
  ok(verdictOf(reds.every(([, v]) => v !== null)), `RED CONTROLS: each cut put back alone reads its count per call again — ${reds.map(([t, v]) => `${t}: ${v === null ? 'NOT RED' : v + ' over ' + K}`).join('; ')}`, reds);
  LB.setHook(null);
  fs.rmSync(ROOT, { recursive: true, force: true });
}

console.log('§11 a stop with the watchdog\'s session kept — one line, no wait (主开发 2026-11-18 20:20Z)');
{
  // The watchdog keeps its inspector session to the main thread for at most SESSION_MS (20 ms) when an ask finds the thread ON THE
  // CPU (src/server/sync-fs-witness-worker.js post()); a stop inside those 20 ms meets the session attached and Node prints
  // «Waiting for the debugger to disconnect…» — the stated residual (test-loop-hold-live leg 5). THE PIN OF ITS HARM, by MECHANISM
  // and never by a clock: a child whose worker connects the watchdog's kind of session (connectToMainThread + one
  // Runtime.evaluate) and NEVER closes it; the main thread waits for the session (Atomics.wait, its result checked), writes its
  // store's flush, and exits. Were Node to wait for that session it would wait forever — so THE LAW is that the child exits by
  // itself (code 0, never the suite's 15 s kill), with the line printed (PLANT, proved first: a session WAS attached), the flush
  // whole and its stamp before the line. A NO-SESSION control prints no line. RED CONTROL: an inspector PORT open — its plant
  // proved (the port open, the line printed) — makes Node WAIT for the session: its worker's closer (CLOSE_MS, there only to end
  // that wait) speaks after the flush, then the child exits. The worker ticks on fd 2 every 10 ms: the ticks after the flush are
  // PRINTED for each child, never asserted. MEASURED on the lane's box 2026-11-18 (Node 24.22.1 and 22.23.4): the exit took 5–9 ms
  // with the session kept, 5–8 ms with none (0 ticks each); with a port open, until the closer. The watchdog stands down on a
  // debugger at its next step (FLAG_DEBUGGER, re-read every step), so a port opened mid-hold meets a kept session for SESSION_MS at most
  const { spawn } = await import('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-exit-')), KID = path.join(D, 'kid.cjs'), WK = path.join(D, 'worker.cjs'), CLOSE_MS = 300;
  const LINE = 'Waiting for the debugger to disconnect', CLOSER = '[closer] spoke', FLUSHED = '[kid] flushed';
  try {
    fs.writeFileSync(WK, [
      "'use strict';",
      "const { workerData } = require('worker_threads'); const inspector = require('inspector'); const fs = require('fs');",
      "const s = new inspector.Session(); s.connectToMainThread();",
      "s.post('Runtime.evaluate', { expression: '1 + 1', silent: true }, () => { });",
      "if (workerData.mode === 'closed') s.disconnect();",
      "if (workerData.mode === 'port') setTimeout(() => { fs.writeSync(2, '[closer] spoke\\n'); try { s.disconnect(); } catch { } }, workerData.closeMs);",
      "setInterval(() => { fs.writeSync(2, '[tick]\\n'); }, 10);",
      "Atomics.store(workerData.flag, 0, 1); Atomics.notify(workerData.flag, 0);",
    ].join('\n'));
    fs.writeFileSync(KID, [
      "'use strict';",
      "const { Worker } = require('worker_threads'); const fs = require('fs');",
      "const [wk, mode, flushPath, closeMs] = process.argv.slice(2);",
      "if (mode === 'port') { const insp = require('inspector'); try { insp.open(0, '127.0.0.1'); } catch { } fs.writeSync(2, '[kid] port open: ' + (insp.url() ? 'yes' : 'no') + '\\n'); }",
      "const flag = new Int32Array(new SharedArrayBuffer(4));",
      "new Worker(wk, { workerData: { flag, mode, closeMs: Number(closeMs) } });",
      "fs.writeSync(2, '[kid] wait: ' + Atomics.wait(flag, 0, 0, 5000) + '\\n');",
      "fs.writeFileSync(flushPath, 'flushed'); fs.writeSync(2, '[kid] flushed\\n');",
      "process.exit(0);",
    ].join('\n'));
    const runKid = (mode) => new Promise((resolve) => {
      const flush = path.join(D, `flush-${mode}`);
      const c = spawn(process.execPath, [KID, WK, mode, flush, String(CLOSE_MS)], { stdio: ['ignore', 'ignore', 'pipe'], env: { PATH: process.env.PATH } });
      let err = '', killed = false;
      c.stderr.on('data', (d) => { err += d; });
      const k = setTimeout(() => { killed = true; try { c.kill('SIGKILL'); } catch { } }, 15000);
      c.on('close', (code) => { clearTimeout(k); let fl = null; try { fl = fs.readFileSync(flush, 'utf8'); } catch { }   // 'close': its stderr read whole
        const at = err.indexOf(FLUSHED), after = at < 0 ? null : (err.slice(at).match(/\[tick\]/g) || []).length;
        resolve({ code, killed, err, flush: fl, after, waited: /\[kid\] wait: (?:ok|not-equal)/.test(err) }); });
    });
    const kept = await runKid('keep'), none = await runKid('closed'), port = await runKid('port');
    const before = (e, a, b) => e.indexOf(a) >= 0 && e.indexOf(b) > e.indexOf(a);
    console.log(`  · the worker's 10 ms ticks after the flush — kept ${kept.after}, no session ${none.after}, port ${port.after} (printed, never asserted)`);
    ok(gateOf(kept.waited) && gateOf(kept.err.includes(LINE)) && gateOf(none.waited) && !none.err.includes(LINE), `PLANT: the child's exit found the watchdog's kind of session attached — Node printed «${LINE}…»; the no-session control printed none`);
    ok(kept.code === 0 && !kept.killed && !kept.err.includes(CLOSER) && kept.flush === 'flushed' && verdictOf(before(kept.err, FLUSHED, LINE)),
      `ONE line, NO WAIT: with a session that is NEVER closed the child exited by itself (code ${kept.code}, not the suite's kill) — Node did not wait for it; the store's flush whole («${kept.flush}») and its stamp before the line`);
    ok(gateOf(port.waited) && gateOf(port.err.includes('[kid] port open: yes')) && gateOf(port.err.includes(LINE)) && port.code === 0 && !port.killed && verdictOf(before(port.err, FLUSHED, CLOSER)),
      `RED CONTROL (an inspector port open${port.err.includes('[kid] port open: no') ? ' — REFUSED: the box allowed no loopback port' : ''}): its plant took (the port open, the line printed) and the exit WAITED for the session — its closer spoke after the flush: a Node that waited would read here`);
  } finally { fs.rmSync(D, { recursive: true, force: true }); }
}

// ── §T THE TWIN HOLDS §7, §8 AND §9 (B-7e49, lane artifacts-by-intent, 主开发 r3761: a leg cannot fall between the two files) ──────────────────
// §7, §8 and §9 moved VERBATIM to the heavy twin scripts/test-fs-canary-holds.mjs: their holds are FIFOs real children fill and the watchdog
// thread a child process runs, and §9 rides the loop-blame wrapper §7 installs (about 10 s of this file's 17 on the second machine). This file runs none of them. RED: a twin whose child-filled FIFO
// is gone is no longer the moved §7.
console.log('§T the heavy twin holds §7, §8 and §9');
{
  const twinRel = 'scripts/test-fs-canary-holds.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ["console.log('§7 the blocked loop names its blocker", "console.log('§8 THE WITNESS NAMES THE HOLD", "spawn('sh', ['-c', `sleep 1.3; printf 'four' > '${fifo}'`], { stdio: 'ignore' });", "const kid = path.join(ROOT, 'kid.js');", "console.log('§9 A VIEW IS CLASSED BY WHAT IT SHOWS"];
  const holds = (t) => MOVED.every((h) => t.includes(h));
  ok(gateOf(holds(twin)) && verdictOf(MOVED.every((h) => here.split(h).length === 2)), '§T the heavy twin holds §7, §8 and §9 — their headings, the FIFO a child fills after 1.3 s, the watchdog thread\'s child — and this file runs none of them');
  ok(verdictOf(/\{ name: 'test-fs-canary-holds', tier: 'heavy',/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8'))), '§T the twin is a HEAVY row of the tier');
  ok(!holds(twin.replace(MOVED[2], '')), 'RED CONTROL — a twin whose child-filled FIFO is gone is no longer the moved §7: §T goes red');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
