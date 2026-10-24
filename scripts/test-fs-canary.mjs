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

console.log('§7 the blocked loop names its blocker (lane vault-slow-load)');
{
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-blame-'));
  fs.mkdirSync(path.join(ROOT, 'src'));
  fs.writeFileSync(path.join(ROOT, 'src', 'slow-reader.js'), "'use strict';\nconst fs = require('fs');\nfunction readAll(p) { return fs.readFileSync(p); }\nmodule.exports = { readAll };\n");
  // int343: what each wrapped call carries BEFORE the install (its own properties — fs.realpathSync.native is one)
  const ownOf = (f) => Reflect.ownKeys(f).filter((k) => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(k)).map(String).sort();
  const BEFORE = Object.fromEntries(LB.SYNC_FNS.filter((fn) => typeof fs[fn] === 'function').map((fn) => [fn, Object.fromEntries(ownOf(fs[fn]).map((k) => [k, fs[fn][k]]))]));
  const nativeBefore = fs.realpathSync.native;
  ok(LB.install({ root: ROOT }) === true && LB.isWrapped(fs.readFileSync) && LB.install({ root: ROOT }) === false, 'install wraps the main thread\'s sync fs calls once');
  // int343 — A WRAPPER OVER A LIBRARY FUNCTION CARRIES THAT FUNCTION'S OWN PROPERTIES. The first wrapper dropped
  // fs.realpathSync.native: on a hub every automation-key open was refused «does not exist» (automation-engine's folder
  // judge) and browser-facts' real paths read null. THE CENSUS: every fs call the wrapper touches keeps every own property.
  // lane hub-fuse-sync-guard: realpathSync.native is a synchronous call of its own — the wrapper now WITNESSES it too (a
  // wrapper of the same function, which answers the same): kept = present and the same value, or that value wrapped
  const lost = (mod, before) => Object.entries(before).flatMap(([fn, props]) => Object.entries(props).filter(([k, v]) => !(k in mod[fn]) || (mod[fn][k] !== v && !(typeof v === 'function' && LB.isWrapped(mod[fn][k])))).map(([k]) => `${fn}.${k}`));
  ok(Object.keys(BEFORE).length === LB.SYNC_FNS.length && Object.values(BEFORE).some((p) => Object.keys(p).length) && !lost(fs, BEFORE).length,
    `CENSUS: every one of the ${LB.SYNC_FNS.length} wrapped fs calls keeps its own properties (${Object.entries(BEFORE).filter(([, p]) => Object.keys(p).length).map(([fn, p]) => `${fn}.${Object.keys(p).join('/')}`).join(', ')})`, lost(fs, BEFORE));
  ok(typeof fs.realpathSync.native === 'function' && LB.isWrapped(fs.realpathSync.native) && fs.realpathSync.native(ROOT) === nativeBefore(ROOT),
    'fs.realpathSync.native still answers after the install — witnessed like every sync call (the automation keys\' folder judge, browser-facts)');
  { // THE RED CONTROL: the wrapper as it first shipped (the property copy cut) ⇒ the census names realpathSync.native lost
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/loop-blame.js'), 'utf8');
    const CUT = /\n    for \(const k of Reflect\.ownKeys\(orig\)\)[^\n]*\n/;
    const pre = path.join(ROOT, 'loop-blame-pre.js');
    fs.writeFileSync(pre, SRC.replace(CUT, '\n'));
    const mk = () => ({ realpathSync: Object.assign(function realpathSync(p) { return p; }, { native: (p) => p }), readFileSync: function readFileSync() { return ''; } });
    const mPre = mk(), bPre = { realpathSync: { native: mPre.realpathSync.native } };
    require(pre).install({ fsMod: mPre });
    const mNow = mk(), bNow = { realpathSync: { native: mNow.realpathSync.native } };
    require(path.join(REPO, 'src/server/loop-blame.js')).install({ fsMod: mNow });
    ok(CUT.test(SRC) && lost(mPre, bPre).join() === 'realpathSync.native' && !lost(mNow, bNow).length && mNow.realpathSync.native('/x') === '/x',
      'RED CONTROL: the wrapper without the property copy loses realpathSync.native (the census names it); the shipped wrapper keeps it — on a module object handed in', { pre: lost(mPre, bPre), now: lost(mNow, bNow) });
  }
  const reader = require(path.join(ROOT, 'src', 'slow-reader.js'));
  const fifo = path.join(ROOT, 'pipe');
  execFileSync('mkfifo', [fifo]);
  const { spawn } = await import('node:child_process');
  const B = harness(createFsCanary);
  await B.c.tick();
  const p = B.c.tick();
  spawn('sh', ['-c', `sleep 1.3; printf 'four' > '${fifo}'`], { stdio: 'ignore' });
  const got = reader.readAll(fifo);   // the loop is held HERE: a sync read of a FIFO nobody has written yet
  const r = await p;
  const line = B.lines.find((l) => /a blocked loop/.test(l)) || '';
  ok(got.length === 4 && r && r.loopMs >= 1000, `the loop was held by the sync read (${r && r.loopMs} ms)`);
  ok(/; in that window: readFileSync 4 B pipe \d{4,} ms ← src\/slow-reader\.js:3 (Object\.)?readAll$/.test(line), `the canary's line names the call, the bytes, the file and the caller: ${line}`);
  ok(r.blockedBy && r.blockedBy.startsWith('readFileSync'), 'the probe\'s facts carry the same words (blockedBy)');
  B.lines.length = 0;
  const p2 = B.c.tick();
  spin(1300);
  await p2;
  ok(/; in that window: no sync fs call over 20 ms in that window — CPU work on the main thread/.test(B.lines.find((l) => /a blocked loop/.test(l)) || ''), `a CPU block is said as CPU work: ${B.lines[0]}`);
  B.c.close();
  // PURE
  ok(LB.bytesOf('readFileSync', [], Buffer.alloc(7)) === 7 && LB.bytesOf('readFileSync', [], 'héllo') === 6 && LB.bytesOf('readSync', [], 512) === 512 && LB.bytesOf('writeFileSync', ['f', 'abc']) === 3 && LB.bytesOf('statSync', ['f'], {}) === null, 'bytesOf: a read\'s result, a write\'s data, nothing for a stat');
  ok(LB.callerOf(`Error\n    at wrapped (${REPO}/src/server/loop-blame.js:9:1)\n    at sha256Head (${REPO}/src/incident.js:80:22)\n    at x (${REPO}/server.js:5:1)`, REPO) === 'src/incident.js:80 sha256Head' && LB.callerOf(`Error\n    at y (${REPO}/node_modules/z/i.js:1:1)\n    at x (${REPO}/server.js:5:1)`, REPO) === 'server.js:5 x' && LB.callerOf('Error\n    at y (node:fs:1:1)', REPO) === null, 'callerOf: the first frame of the hub\'s own code, never this module\'s, never node_modules');
  ok(LB.blameWords([{ fn: 'readSync', bytes: 1073741824, path: path.join(REPO, 'home/x.jsonl'), ms: 15220, caller: 'src/incident.js:80 sha256Head' }], REPO) === 'readSync 1024 MB home/x.jsonl 15220 ms ← src/incident.js:80 sha256Head', 'blameWords: the call, the size, the path under the root, the ms, the caller');
  const at = Date.now();
  const win = LB.blame(at, at + 10, { entries: [{ at: at - 5000, ms: 100, fn: 'old' }, { at: at - 50, ms: 200, fn: 'spans' }, { at: at + 2, ms: 30, fn: 'in' }, { at: at + 50, ms: 999, fn: 'after' }] }).map((e) => e.fn).join();
  ok(win === 'spans,in', `blame keeps the calls that overlap the window, the longest first (${win})`);
  const server = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), trace = fs.readFileSync(path.join(REPO, 'src/server/boot-trace.js'), 'utf8');
  const lines5 = server.split('\n').slice(0, 6).join('\n');
  ok(/require\('\.\/src\/server\/boot-trace\.js'\)\.start\(/.test(lines5) && /function start\(\{ dataDir,[^\n]*\{\n(?:\s*\/\/[^\n]*\n)*\s*try \{ if \(dataDir\) require\('\.\/loop-blame\.js'\)\.install\(\{ root: path\.dirname\(dataDir\) \}\); \} catch \{ \}/.test(trace), 'installed by the boot trace\'s start() — server.js\'s first lines, before the modules that destructure fs');
  // CONTROL: the base canary (no blame) — the same sync-read block, and the line names nothing
  const from = "log(`[canary] the main loop held the probe's answer ${loopMs}ms (the stat itself took ${fsMs}ms ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'}) — a blocked loop, not a slow mount${by ? `; in that window: ${by}` : ''}`);";
  ok(SRC.split(from).length === 2, 'CONTROL premise: the line\'s patch point is one line of the module');
  const base = M.load('src/server/fs-canary.js', SRC.replace(from, "log(`[canary] the main loop held the probe's answer ${loopMs}ms (the stat itself took ${fsMs}ms ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'}) — a blocked loop, not a slow mount`);"), 'no-blame');
  const C = harness(base.createFsCanary);
  await C.c.tick();
  const fifo2 = path.join(ROOT, 'pipe2');
  execFileSync('mkfifo', [fifo2]);
  const p3 = C.c.tick();
  spawn('sh', ['-c', `sleep 1.3; printf 'four' > '${fifo2}'`], { stdio: 'ignore' });
  reader.readAll(fifo2);
  await p3;
  const cl = C.lines.find((l) => /a blocked loop/.test(l)) || '';
  ok(!!cl && !/in that window|readFileSync/.test(cl), `CONTROL: the base canary's line for the same block names nothing (the owner's journal): ${cl}`);
  C.c.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
}

console.log('§8 THE WITNESS NAMES THE HOLD — and the guard refuses a storage mount (lane hub-fuse-sync-guard)');
{ // 2026-10-23 21:56 PT: 6.5 min held in a sync fs call on an rclone mount, and the canary named nothing (no probe was in
  // flight; the call was outside loop-blame's 18). The witness rides loop-blame's ONE wrapper (installed in §7).
  const SW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  const MHW = require(path.join(REPO, 'src/server/mount-health-watch.js'));
  const { spawn } = await import('node:child_process');
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-witness-'));
  fs.mkdirSync(path.join(ROOT, 'src'));
  fs.writeFileSync(path.join(ROOT, 'src', 'row-reader.js'), "'use strict';\nconst fs = require('fs');\nfunction readRow(p) { return fs.readFileSync(p); }\nfunction peek(p) { return fs.statSync(p); }\nmodule.exports = { readRow, peek };\n");
  const MNTS = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-mounts-'));   // outside the instance's own tree (that is never a mount path)
  const NAS = path.join(MNTS, 'NAS'), LOC = path.join(MNTS, 'local'), STORE = path.join(MNTS, 'OneDrive');
  for (const d of [NAS, LOC, STORE]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(STORE, 'row.md'), 'x');
  const reader = require(path.join(ROOT, 'src', 'row-reader.js'));
  let n = 0;
  // a sync call that takes ~300 ms: a FIFO read a child fills 0.3 s later (the "stub sync call sleeps 300 ms")
  const hold = (dir, ms = 300) => { const p = path.join(dir, `pipe${++n}`); execFileSync('mkfifo', [p]); spawn('sh', ['-c', `sleep ${ms / 1000}; printf 'row' > '${p}'`], { stdio: 'ignore' }); reader.readRow(p); return p; };
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));
  const wlog = [];
  // the NAS is a hand-made network mount (witnessed, never refused: the hold HAPPENS); OneDrive a product storage row
  const w = SW.create({ rootDir: ROOT, dataDir: path.join(ROOT, 'data'), fresh: true, armed: true, live: false, heldMs: 200, log: { warn: (l) => wlog.push(l) },
    readMountinfo: () => `900 42 0:73 / ${NAS} rw,relatime - nfs4 192.0.2.10:/v rw\n`, registry: () => [{ mountpoint: STORE, name: 'OneDrive', id: 'mnt-1' }] });
  w.start();
  const filed = [], mlog = [];
  const todos = { add: (k, it) => { filed.push({ k, ...it }); return { id: `u-${filed.length}` }; }, get: () => ({ status: 'open' }) };
  const who = [{ pid: 4242, ppid: 1, comm: 'localsearch-3', argv: ['/usr/libexec/localsearch-3'], cwd: null, fdHits: 3 }];
  const mh = MHW.create({ file: FILE, getUserTodos: () => todos, procTable: async () => who, ownerIds: async () => ({}), log: { warn: (l) => mlog.push(l) }, mountinfo: () => '' });
  const H = harness(createFsCanary, { witness: w, onHeld: (e) => mh.onHeld(e), episodeMs: 250 });
  const p1 = hold(NAS);
  await tick(150);
  const line = H.lines.find((l) => /the main loop was held/.test(l)) || '';
  ok(new RegExp(`^\\[canary\\] the main loop was held (\\d+) ms — the sync fs call that returned as it resumed: readFileSync\\(${p1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\) \\d{3,} ms, under the network mount «${NAS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}» \\(witnessed, never refused\\) ← src/row-reader\\.js:3 (Object\\.)?readRow$`).test(line),
    `a 300 ms hold on a MOUNT path: the canary names the call, its path, its ms, its mount and the caller — no probe in flight: ${line}`);
  ok(H.recs.some((r) => r.name === 'srv-sync-fs-held-ms' && r.value >= 250 && /fn=readFileSync class=mount/.test(r.detail)), 'counted: srv-sync-fs-held-ms (fn + class)');
  ok(filed.length === 1 && filed[0].origin === 'server' && filed[0].k === MHW.INBOX_KEY && new RegExp(`waited \\d+ s on the folder .*NAS — readFileSync on .*pipe1 from src/row-reader\\.js:3`).test(filed[0].text)
    && /localsearch-3|1 process/.test(filed[0].detail) && /The call came from:/.test(filed[0].detail) && filed[0].i18n && filed[0].i18n.text.params.call === 'readFileSync',
    `the For-you fact (origin server, «This machine») carries the call site beside who presses the mount: ${filed[0] && filed[0].text}`, filed[0]);
  hold(NAS);
  await tick(150);
  ok(filed.length === 1 && mlog.some((l) => /held the main loop again .* its For-you item is still open/.test(l)), 'a second hold on the same mount while its item is open: ONE item, a journal line');
  H.lines.length = 0;
  const p2 = hold(LOC);
  await tick(150);
  const l2 = H.lines.find((l) => /the main loop was held/.test(l)) || '';
  ok(l2.includes(`readFileSync(${p2})`) && /, not under a mount ← src\/row-reader\.js:3/.test(l2) && filed.length === 1, `a LOCAL path: named, not under a mount, no For-you item: ${l2}`);
  // the late probe: a probe in flight across the hold names the SAME call once (the witness's hand-over said it)
  H.lines.length = 0;
  const pr = H.c.tick();
  hold(NAS, 1200);
  const facts = await pr;
  await tick(100);
  const said = H.lines.filter((l) => /the main loop was held/.test(l));
  ok(facts && facts.loopMs > 100 && /^readFileSync\(.*pipe\d+\) \d+ ms, under the network mount/.test(facts.blockedBy || '') && said.length === 1, `a probe in flight across the hold: its facts name the call, ONE line for the hold (${said.length})`, said);
  // THE GUARD: a storage row is refused BEFORE the syscall, said once per call site, counted; the setting turns it to log-only
  let err = null;
  try { reader.peek(path.join(STORE, 'row.md')); } catch (e) { err = e; }
  try { reader.peek(path.join(STORE, 'row.md')); } catch { }
  ok(err && err.code === 'EVSMOUNTSYNC' && err.path === path.join(STORE, 'row.md') && err.mount === STORE && err.message === SW.REFUSAL, `a sync call on a STORAGE row is refused by name: ${err && err.code} ${err && err.mount}`);
  ok(wlog.filter((l) => l.startsWith('[mount-guard] statSync(')).length === 1 && /from src\/row-reader\.js:4 (Object\.)?peek refused — use SafeFs\/async; the mount «.*OneDrive»$/.test(wlog.find((l) => l.startsWith('[mount-guard]')) || '') && w.counts.refused === 2,
    `said ONCE per call site (refused twice): ${wlog.find((l) => l.startsWith('[mount-guard]'))}`);
  w.setGuard(() => false);
  ok(reader.peek(path.join(STORE, 'row.md')).size === 1 && w.counts.allowed === 1 && wlog.some((l) => /mounts\.mainThreadSyncGuard is off \(log only\)/.test(l)), 'mounts.mainThreadSyncGuard = false: the call runs and is said (log only)');
  w.setGuard(() => true);
  ok(fs.statSync(LOC).isDirectory() && fs.statSync(path.join(ROOT, 'data', '..')).isDirectory(), 'a local path and the instance\'s own tree are never refused');
  { let threw = null, got;   // a fault inside the witness (here: a path-like whose toString throws) never reaches the caller
    try { got = fs.existsSync({ length: 1, toString() { throw new Error('witness fault'); } }); } catch (e) { threw = e; }
    ok(!threw && got === false, `a witness fault never breaks the call: the call runs unwitnessed (${threw ? threw.message : 'existsSync → ' + got})`); }
  { const w2 = SW.create({ rootDir: ROOT, dataDir: path.join(ROOT, 'data'), fresh: true, armed: false, live: false, registry: () => [{ mountpoint: STORE }], readMountinfo: () => '' });
    w2.start(); let e2 = null; try { reader.peek(path.join(STORE, 'row.md')); } catch (e) { e2 = e; } w2.stop();
    ok(!e2, 'before the first loop turn (the main-module evaluation) the guard only witnesses — a refusal there would stop every boot'); }
  w.start();
  // RED CONTROL: the canary as the base wired it — no witness — over the same hold says NOTHING (the owner's journal)
  LB.setHook(null);
  const C = harness(createFsCanary);
  hold(NAS);
  await tick(150);
  ok(!C.lines.length && filed.length === 1, `CONTROL: the base-shaped canary (no witness) names nothing for the same hold (${C.lines.length} lines)`);
  C.c.close(); H.c.close(); w.stop();
  // THE WATCHDOG THREAD: a call still in flight is named WHILE it holds (a child: the witness's own thread writes fd 2)
  const kid = path.join(ROOT, 'kid.js');
  fs.writeFileSync(kid, `const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
require(${JSON.stringify(path.join(REPO, 'src/server/loop-blame.js'))}).install({ root: ${JSON.stringify(ROOT)} });
const w = require(${JSON.stringify(path.join(REPO, 'src/server/sync-fs-witness.js'))}).create({ rootDir: ${JSON.stringify(ROOT)}, armed: true, liveMs: 700, readMountinfo: () => '' }).start();
const p = path.join(${JSON.stringify(ROOT)}, 'kidpipe'); require('child_process').execFileSync('mkfifo', [p]);
spawn('sh', ['-c', "sleep 2.2; printf x > '" + p + "'"], { stdio: 'ignore' });
setTimeout(() => { fs.readFileSync(p); w.stop(); }, 300);
`);
  const out = await new Promise((r) => { const c = spawn(process.execPath, [kid], { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; c.stderr.on('data', (d) => { e += d; }); c.on('exit', () => r(e)); });
  ok(/\[sync-fs\] the main thread has waited [12] s in readFileSync\(.*kidpipe\) — the kernel: \S+ in (openat|open|syscall \d+)/.test(out), `a hold still in flight is named by the watchdog thread while it holds, with the kernel's wchan + syscall: ${out.trim().split('\n')[0]}`);
  const KW = require(path.join(REPO, 'src/server/sync-fs-witness-worker.js'));
  ok(KW.kernelWords('request_wait_answer\n', '262 0xffffff9c 0x7f 0x7ffd 0x0 0x0 0x0 0x0 0x0\n', 'x64') === 'request_wait_answer in newfstatat' && KW.kernelWords('0', 'running', 'x64') === 'on the CPU (JavaScript or native work)'
    && KW.kernelWords('do_epoll_wait', '232 0x3', 'arm64') === 'do_epoll_wait in syscall 232', 'the kernel words: a FUSE wait in newfstatat, on the CPU, an unknown architecture by number');
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.rmSync(MNTS, { recursive: true, force: true });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
