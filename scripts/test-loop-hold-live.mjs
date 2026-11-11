#!/usr/bin/env node
// test-loop-hold-live — lane hub-loop-stalls, the LIVE legs of the hold sampler (HEAVY: real child processes, ONE at a
// time; the beat (20 ms) and the hold (100 ms) are injected so a planted hog is ~300 ms — never seconds of busy loop; the
// suite states the cpu seconds its children used). Each child runs the REAL watchdog (src/server/sync-fs-witness.js +
// its thread + src/server/loop-holds.js) over a scratch root whose src/hogs.js holds the planted hogs.
//   ① NAMED: a pure JS busy function, a sync zlib, a catastrophic regex — by function and file in the [loop-hold] line;
//      a JSON.parse of a large buffer — «no JavaScript frame» and «the first JavaScript after it» naming the parse's
//      caller; a sync child (execFileSync sleep) — in the kernel, «no JavaScript frame (the kernel: …)»; a collection
//      forced inside a hold — «garbage collection: mark-compact … inside the hold»; the scheduler's numbers, the memory
//      and the loop's utilization on every line; the while-held line of the watchdog thread carries the frames
//   ② THE BOOT is a hold: a main module busy before its first loop turn is sampled and said as the boot's — even with a
//      cap of 0 (outside the cap)
//   ③ THE CAP: a cap of 2 ⇒ 2 holds sampled, the rest «not sampled» and STILL measured (law A's numbers)
//   ④ THE OFF SWITCH and THE DEBUGGER: sampling off ⇒ «not sampled (sampling is off in Settings)» and NO inspector
//      session ever connects (an exit inside a hold prints Node's «Waiting for the debugger to disconnect…» only when one
//      is connected: present with sampling on — the control — absent off); a debugger port open ⇒ said once, stood down
//   ⑤ LAW C — A SAMPLE CHANGES NOTHING THE HELD CODE CAN OBSERVE, each against a run without sampling: pending
//      microtasks / nextTick / setImmediate / timers run in the same order and never early; an AsyncLocalStorage store
//      unchanged; no async-hooks init; nothing reaches uncaughtException / unhandledRejection; Error.prepareStackTrace and
//      stackTraceLimit as set — also inside the hub's own prepareStackTrace window and one frame from the stack limit (a
//      recursion hog: the sample throws there and restores in its finally)
//   ⑥ NOTHING RETAINED: 5 000 samples (the profile road at a 1 ms beat) leave the heap flat; nothing keeps the process
//      alive (a natural exit right after a hold); nothing delays an exit that comes while a sample is in flight
//   ⑦ LAW L: a short profile (1.5 s, a sample every 50 ms) — the hog's share by its frame, the idle share, its line
//   ⑧ NODE 22: legs ① (busy, sleep) and ⑤ under the binary named by VS_NODE22 — else «not run: no Node 22 given»
// B-1409 (2.369.394): a leg the BOX cannot feed — the watchdog thread itself late on two shared cores, too few asks inside a
// native call — sweeps again (at most twice) and then ends as a NAMED, COUNTED skip («ALL PASS (N, K skipped)» + the list;
// the release's self-hosted claim runs the same legs); (A)'s strict set takes only asks posted in state R; «waiting for a
// CPU» is the verdict only when the wait is the hold's larger part — else «it also waited N s for a CPU» beside its parts
// B-1409 follow-up: (B) judges only the runs whose asks ALL landed inside the sync child's own start / end stamps (an ask
// within JS_FAST_MS of its end counts as outside) — the rest a NAMED, COUNTED skip, with the asks and the child's stamps
// Run: node scripts/test-loop-hold-live.mjs        (VS_NODE22=/path/to/node22 for leg ⑧)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, cpuMs = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
// B-1409: a leg the BOX could not feed (the watchdog thread itself late on two shared cores: too few asks inside a native
// call) ends as a NAMED and COUNTED skip — never a green: the summary line prints the count, and the release's self-hosted
// claim runs the same legs on a box that can
const skipped = [];
const skip = (n, why) => { skipped.push(`${n} — ${why}`); console.log(`  ⊘ SKIP ${n} — ${why}`); };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lh-live-'));
fs.mkdirSync(path.join(ROOT, 'src'));
fs.writeFileSync(path.join(ROOT, 'src/hogs.js'), `'use strict';
function busyHog(ms) { const t = Date.now(); let x = 0; while (Date.now() - t < ms) x += Math.sqrt(x + 1); return x; }
function bootHog(ms) { return busyHog(ms); }
function afterParse(v) { return v.length; }
function jsonHog(s) { const v = JSON.parse(s); return afterParse(v); }
function zlibHog(buf) { return require('zlib').gzipSync(buf, { level: 9 }).length; }
function regexHog(n) { return /^(a+)+$/.test('a'.repeat(n) + 'b'); }
function sleepHog(s) { require('child_process').execFileSync('sleep', [String(s)]); return 1; }
function gcHog() { global.gc(); return 1; }
function spinChecked(ms, check) { const t = Date.now(); let bad = 0; while (Date.now() - t < ms) if (!check()) bad++; return bad; }
async function awaitHog(n) { let s = 0; for (let i = 0; i < n; i++) s += await i; return s; }
function slowPrep(ms) { const P = Error.prepareStackTrace; Error.prepareStackTrace = function slowPrepHook(e, cs) { busyHog(ms); return cs; }; try { return new Error().stack.length; } finally { Error.prepareStackTrace = P; } }
function deepSoak(stepIters, check) { let reached = 0, bad = 0, spun = 0;
  function rec(n, target) { reached = n; if (n < target) return rec(n + 1, target); spun++; for (let i = 0; i < stepIters; i++) if (Error.stackTraceLimit !== check.l || Error.prepareStackTrace !== check.p) bad++; return 0; }
  try { rec(0, Infinity); } catch (e) { } const max = reached;   // the deepest THIS function reaches (its own frame size)
  for (let j = 0; j <= 400; j += 20) { try { rec(0, max - 2 - j); } catch (e) { } } return { max, bad, spun }; }
function deepHog(iters, check) { let depth = 0, bad = 0; function deep(n) { try { return deep(n + 1); } catch (e) { depth = n; for (let i = 0; i < iters; i++) if (Error.stackTraceLimit !== check.l || Error.prepareStackTrace !== check.p) bad++; return 0; } } deep(0); return { depth, bad }; }
function monoHog(ms) { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += Math.sqrt(x + 1); return x; }
function computedSelf(key, ms) { const o = { [key]: function () { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += Math.sqrt(x + 1); return x; } }; return o[key](); }
class Hogs { member(ms) { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += Math.sqrt(x + 1); return x; } }
const arrowHog = (ms) => { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += Math.sqrt(x + 1); return x; };
const hogObj = { methodHog(ms) { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += Math.sqrt(x + 1); return x; } };
function anonHog(ms) { return (function () { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += Math.sqrt(x + 1); return x; })(); }
function pbkdfHog(iters, tailMs) { require('crypto').pbkdf2Sync('a', 'b', iters, 32, 'sha256'); const e = process.hrtime(), end = e[0] * 1e3 + e[1] / 1e6; const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < tailMs) x += Math.sqrt(x + 1); return end + 0 * x; }
function parseHog(s, tailMs) { const v = JSON.parse(s); const e = process.hrtime(), end = e[0] * 1e3 + e[1] / 1e6; const t = process.hrtime.bigint(); let x = v.length; while (Number(process.hrtime.bigint() - t) / 1e6 < tailMs) x += Math.sqrt(x + 1); return end + 0 * x; }
const strNamed = { ['strHog']: function (ms) { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += Math.sqrt(x + 1); return x; } };
function mixedHog(jsMs, childS, st) { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < jsMs) x += Math.sqrt(x + 1); const ms = () => Number(process.hrtime.bigint()) / 1e6; if (st) st.c0 = ms(); require('child_process').execFileSync('sleep', [String(childS)]); if (st) st.c1 = ms(); return x; }
async function awaitWorkHog(n) { let s = 0; for (let i = 0; i < n; i++) { s += await i; for (let j = 0; j < 200; j++) s = (s * 31 + j) | 0; } return s; }
module.exports = { awaitWorkHog, busyHog, bootHog, jsonHog, zlibHog, regexHog, sleepHog, gcHog, spinChecked, deepHog, awaitHog, slowPrep, deepSoak, monoHog, computedSelf, Hogs, arrowHog, hogObj, anonHog, pbkdfHog, parseHog, mixedHog, strNamed };
`);
// real repo files a vm script / a planted line may name (round 3 (6)): their own first lines spell no outside name
fs.writeFileSync(path.join(ROOT, 'src/loop-hold.js'), "'use strict';\n// a real file of this scratch repo\n");
fs.writeFileSync(path.join(ROOT, 'server.js'), "'use strict';\n");
// round 3 (4): 600 functions in ONE long-named module (a production profile has 600 samples; node_modules frames are repo frames)
{ const dir = path.join(ROOT, 'src', 'a-long-folder-name', 'another-long-folder-name', 'and-yet-another-folder', 'deeper-still', 'deepest-folder-here', 'the-last-one');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manyFunctionsInOneLongNamedModuleFile.js'), "'use strict';\n" + [...Array(600)].map((_, i) => `function f${i}(ms) { const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < ms) x += ${i}; return x; }`).join('\n') + '\nmodule.exports = [' + [...Array(600)].map((_, i) => 'f' + i).join(', ') + '];\n'); }
const MANY = path.join(ROOT, 'src', 'a-long-folder-name', 'another-long-folder-name', 'and-yet-another-folder', 'deeper-still', 'deepest-folder-here', 'the-last-one', 'manyFunctionsInOneLongNamedModuleFile.js');
// round 3 (2): the WALL CLOCK stepped (an NTP step, a person setting the date) in the main thread, the watchdog, or both — a preload, run in both threads
const STEPPER = path.join(ROOT, 'stepper.cjs');
fs.writeFileSync(STEPPER, `'use strict';
const { isMainThread } = require('worker_threads'); const side = process.env.STEP_SIDE || '', by = Number(process.env.STEP_BY || 0), at = Number(process.env.STEP_AT || 0);
if (by && (side === 'both' || (side === 'main') === isMainThread)) { const real = Date.now, born = process.uptime() * 1000; Date.now = () => real() + (process.uptime() * 1000 >= at ? by : 0); }
`);
// round 4: the sweeps' preload (run in BOTH threads — a worker inherits the process's execArgv): in the watchdog's thread
// it stamps every Runtime.evaluate it posts (LH_POSTWATCH) and can hold that thread's start for LH_WORKER_DELAY_MS (the
// watchdog starting late, inside the hold) — told to the main thread on a BroadcastChannel; ANY tree can be driven by it
const SWEEP_PRE = path.join(ROOT, 'sweep-pre.cjs');
fs.writeFileSync(SWEEP_PRE, `'use strict';
const { isMainThread, BroadcastChannel } = require('worker_threads');
const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
if (!isMainThread) {
  if (process.env.LH_WORKER_DELAY_MS) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.LH_WORKER_DELAY_MS)); const b = new BroadcastChannel('lh-posts'); b.postMessage({ ev: 'workerStart', at: mono() }); b.close(); }
  if (process.env.LH_SLOW_SRC_MS) {   // MUST 2's stand-in: every read of a repo source file (sync or async) takes LH_SLOW_SRC_MS
    const fs = require('fs'), ms = Number(process.env.LH_SLOW_SRC_MS), under = (p) => typeof p === 'string' && p.startsWith(process.env.LH_SLOW_ROOT + '/src/');
    const nap = new Int32Array(new SharedArrayBuffer(4));
    for (const k of ['readFileSync', 'statSync', 'realpathSync']) { const o = fs[k]; fs[k] = function (p, ...a) { if (under(p)) Atomics.wait(nap, 0, 0, ms); return o.call(this, p, ...a); }; }
    for (const k of ['readFile', 'stat', 'realpath']) { const o = fs.promises[k]; fs.promises[k] = async function (p, ...a) { if (under(p)) await new Promise((r) => setTimeout(r, ms)); return o.call(this, p, ...a); }; }
  }
  if (process.env.LH_POSTWATCH) { const insp = require('inspector'), b = new BroadcastChannel('lh-posts'); b.unref(); const orig = insp.Session.prototype.post;
    insp.Session.prototype.post = function (m, ...a) { if (m === 'Runtime.evaluate') b.postMessage({ ev: 'post', at: mono() }); return orig.call(this, m, ...a); }; }
}
`);
const KID = path.join(ROOT, 'kid.js');
const LH_KEYS_DEEP = '(deep recursion)';
const LATE_D = [-30, -15, -8, -5, -3, -2, -1, 0, 1, 2, 4];   // round 3 (1): the late watchdog's release around the hog's end (measured: ≤ −5 JS inside, 0 asked at its end, ≥ 5 unseen)
const HEAP_PER_EVAL_B = 400;   // round 3 (3): main-thread heap kept per REAL evaluate, at most (a constant text: measured ~? B; round 2: ~3 500)
const LH = (await import('node:module')).createRequire(import.meta.url)(path.join(REPO, 'src/loop-hold.js'));
// THE BOOT through the REAL boot-trace start (server.js's 6th line): the off switch read from data/settings.json BEFORE anything is asked
const BOOTKID = path.join(ROOT, 'bootkid.js');
fs.writeFileSync(BOOTKID, `'use strict';
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(process.argv[2]);
const dataDir = ${JSON.stringify(ROOT)} + '/data-' + process.pid; fs.mkdirSync(dataDir, { recursive: true });
if (cfg.setting !== undefined) fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ 'telemetry.loopHoldSampling': cfg.setting }));
let evals = 0; const g = Object.getOwnPropertyDescriptor; Object.getOwnPropertyDescriptor = function (o, k) { if (o === Error && k === 'prepareStackTrace') evals++; return g.call(Object, o, k); };
require(${JSON.stringify(path.join(REPO, 'src/server/boot-trace.js'))}).start({ dataDir });
const t = Date.now(); while (Date.now() - t < 1350);   // the main module's evaluation: a boot of 1.35 s
setTimeout(() => { const rep = require(${JSON.stringify(path.join(REPO, 'src/server/sync-fs-witness.js'))}).create().holds().report(); process.stdout.write(JSON.stringify({ evals, line: (rep.holds[0] || {}).line || null, cpuMs: (process.cpuUsage().user + process.cpuUsage().system) / 1000 })); process.exit(0); }, 1500);
`);
fs.writeFileSync(KID, `'use strict';
const cfg = JSON.parse(process.argv[2]);
const fs = require('fs'), cp = require('child_process');
if (cfg.plan === 'openPort' || cfg.openPortFirst) require('inspector').open(0, '127.0.0.1');   // a person opens a debugger port at run time (not at start)
// the REAL evaluates that reached this thread (the sample's first own call) — a sample unseen by the program, counted here
let evals = 0;
if (cfg.countEvals) { const g = Object.getOwnPropertyDescriptor; Object.getOwnPropertyDescriptor = function (o, k) { if (o === Error && k === 'prepareStackTrace') evals++; return g.call(Object, o, k); }; }
// a watchdog that is LATE on its own (its procfs reads block on a FIFO for a while) while this loop beats on
let fproc = null, feeder = null;
if (cfg.plan === 'lateWatchdog' || cfg.fifo) {
  fproc = ${JSON.stringify(ROOT)} + '/fproc-' + process.pid; const td = fproc + '/self/task/' + process.pid, real = '/proc/' + process.pid + '/task/' + process.pid + '/';
  fs.mkdirSync(td, { recursive: true }); fs.mkdirSync(fproc + '/pressure', { recursive: true });
  // the REAL files behind symlinks (the scheduler's facts stay true); stat becomes a FIFO at fifoAt (0 = from the start) until the release
  for (const f of ['schedstat', 'wchan', 'syscall']) fs.symlinkSync(real + f, td + '/' + f);
  for (const f of ['status', 'cgroup']) fs.symlinkSync('/proc/' + process.pid + '/' + f, fproc + '/self/' + f);
  // the release, ONCE: a read-write open of the FIFO lets the blocked reader through, the path becomes the real file's symlink, the close ends its read
  const arm = (inS) => { cp.execFileSync('mkfifo', [td + '/stat.fifo']); fs.renameSync(td + '/stat.fifo', td + '/stat');
    feeder = cp.spawn('bash', ['-c', 'sleep ' + Math.max(0, inS).toFixed(3) + '; ln -s ' + real + 'stat stat.lnk; exec 3<>stat; mv -T stat.lnk stat; sleep 0.1; exec 3>&-'], { cwd: td, stdio: 'ignore' }); feeder.unref(); };
  if (cfg.fifoAt) { fs.symlinkSync(real + 'stat', td + '/stat'); setTimeout(() => arm((cfg.blockS || 1.6) - cfg.fifoAt / 1000), cfg.fifoAt); } else arm(cfg.blockS || 1.6);
  process.on('exit', () => { try { feeder && feeder.kill('SIGKILL'); } catch { } });
}
const H = require(${JSON.stringify(path.join(ROOT, 'src/hogs.js'))});
// THE SUITE'S OWN MEASURE (主开发's ruling 2026-11-11 07:31Z): each CPU hog's span read by THIS harness from the main thread's
// own schedstat (on-CPU ns, run-queue wait ns) — never the product's readings — so a hold the suite measures as starved is
// ASSERTED «waiting for a CPU», and one the product calls starved that this does not show is red
const SPANS = [];
const SS0 = () => { try { const t = require('fs').readFileSync('/proc/self/task/' + process.pid + '/schedstat', 'utf8').split(' '); return [Number(t[0]), Number(t[1])]; } catch (e) { return [0, 0]; } };
const kmono0 = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
for (const k of ['busyHog', 'monoHog', 'pbkdfHog', 'parseHog', 'jsonHog', 'zlibHog', 'regexHog', 'gcHog']) if (typeof H[k] === 'function') {
  const f = H[k];
  H[k] = function (...a) { const s0 = SS0(), w0 = Date.now(), m0 = kmono0(); try { return f.apply(this, a); } finally { const s1 = SS0(); SPANS.push({ fn: k, wall: w0, ms: kmono0() - m0, waitMs: (s1[1] - s0[1]) / 1e6, ranMs: (s1[0] - s0[0]) / 1e6 }); } };
}
const make = () => require((cfg.tree || ${JSON.stringify(REPO)}) + '/src/server/sync-fs-witness.js').create({ rootDir: ${JSON.stringify(ROOT)}, armed: true, readMountinfo: () => '', fresh: true,
  beatMs: cfg.beatMs || 20, holdMs: 100, noAnswerMs: 50, liveMs: cfg.liveMs || 250, capPerHour: cfg.cap == null ? 20 : cfg.cap, samplingOn: () => cfg.sampling !== false, ...(cfg.samplesPerHold ? { samplesPerHold: cfg.samplesPerHold } : {}),
  ...(fproc ? { procRoot: fproc } : {}),
  profileEveryMs: cfg.profileEveryMs || 50, holdsOptions: { eluEveryMs: 50, eluBeforeMs: 500, profileMs: cfg.profileMs || 1500, gcMinMs: cfg.gcMinMs || 50, observeGc: !!cfg.observeGc, lostAfterMs: cfg.lostAfterMs || 30000,
    ...(cfg.fakeHeap ? { heap: () => ({ heapUsed: cfg.fakeHeap * 1e9, heapLimit: 1e9, external: 0 }) } : {}) },
  ...(cfg.heapHighAfterMs ? { heapStats: () => ({ used_heap_size: Date.now() - T0 >= cfg.heapHighAfterMs ? 95 : 10, heap_size_limit: 100 }) } : {}) }).start();
const T0 = Date.now();
let W = cfg.plan === 'late' ? null : make();
const recs = [];
if (W && cfg.record) W.wire({ record: (ev) => recs.push(ev) });
if (cfg.boot) H.bootHog(cfg.boot);
const out = { checks: {} };
const done = (ms = 900) => setTimeout(() => { out.report = W.holds().report(cfg.maxBytes ? { maxBytes: cfg.maxBytes } : {}); out.checks.evals = evals; out.checks.recs = recs; out.spans = SPANS; out.cpuMs = (process.cpuUsage().user + process.cpuUsage().system) / 1000; process.stdout.write(JSON.stringify(out)); W.stop(); }, ms);
const later = (ms, f) => setTimeout(f, ms);
const plan = cfg.plan;
const kmono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
if (plan === 'boot') done(600);
else if (plan === 'nativeSweep') {   // round 4 (A): a native call + a JavaScript tail in ONE function, once per N
  const { BroadcastChannel } = require('worker_threads'); const posts = [], bc = new BroadcastChannel('lh-posts'); bc.onmessage = (e) => posts.push(e.data);
  // THE CHILD'S OWN RECORD OF COLLECTIONS (主开发's ruling 08:30Z — never the product's): every gc entry on the hogs' clock
  const gcs = []; { const PH = require('perf_hooks'); const off = kmono() - PH.performance.now(); new PH.PerformanceObserver((l) => { for (const e of l.getEntries()) gcs.push([off + e.startTime, e.duration]); }).observe({ entryTypes: ['gc'] }); }
  let perMs = 0; { const t = kmono(); require('crypto').pbkdf2Sync('a', 'b', 20000, 32, 'sha256'); perMs = 20000 / Math.max(0.5, kmono() - t); }
  let jperMs = 0; if (cfg.kind === 'json') { const js = '[' + '1,'.repeat(1e6) + '1]'; const t = kmono(); JSON.parse(js); jperMs = 1e6 / Math.max(0.5, kmono() - t); }
  const runs = []; let i = 0;
  const next = () => {
    if (i >= cfg.ns.length) return later(300, () => { bc.close(); out.checks.runs = runs; out.checks.posts = posts.filter((x) => x.ev === 'post'); out.checks.gcs = gcs; done(300); });
    const N = cfg.ns[i++], js = cfg.kind === 'json' ? '[' + '1,'.repeat(Math.round(jperMs * N)) + '1]' : null;
    later(250, () => { const wall = Date.now(), start = kmono(); const nativeEnd = js ? H.parseHog(js, cfg.tail) : H.pbkdfHog(Math.round(perMs * N), cfg.tail); runs.push({ N, wall, start, nativeEnd, end: kmono() }); setTimeout(next, 50); });
  };
  later(300, next);
}
else if (plan === 'slowNames') {   // round 4 MUST 2: a 700 ms hold, then a 400 ms one — every repo source read 300 ms
  const { BroadcastChannel } = require('worker_threads'); const posts = [], bc = new BroadcastChannel('lh-posts'); bc.onmessage = (e) => posts.push(e.data);
  const holds = [];
  later(250, () => { const s1 = kmono(), w1 = Date.now(); H.busyHog(700); holds.push({ start: s1, wall: w1, end: kmono() });
    later(150, () => { const s2 = kmono(), w2 = Date.now(); H.busyHog(400); holds.push({ start: s2, wall: w2, end: kmono() });
      later(1500, () => { bc.close(); out.checks.holds = holds; out.checks.posts = posts.filter((x) => x.ev === 'post'); done(300); }); }); });
}
else if (plan === 'nameRoads') {   // round 4 (9): a name only in a string; a vm script under a repo symlink leading out; a vm script named node:…
  const vm = require('vm'), busy = 'const t = process.hrtime.bigint(); let x = 0; while (Number(process.hrtime.bigint() - t) / 1e6 < 300) x += Math.sqrt(x + 1);';
  later(250, () => { H.strNamed.strHog(300);
    later(200, () => { vm.runInThisContext('(function outsideHog() { ' + busy + ' })()', { filename: cfg.linkOut });
      later(200, () => { vm.runInThisContext('(function forgedInternal() { ' + busy + ' })()', { filename: 'node:internal/forged' }); done(900); }); }); });
}
else if (plan === 'heapFill') {   // round 4 (3): a REAL small old generation filled to 88 % of it, then the press
  const LHn = require(${JSON.stringify(path.join(REPO, 'src/loop-hold.js'))}), v8 = require('v8');
  const fill = () => LHn.heapFillOf({ stats: v8.getHeapStatistics(), spaces: v8.getHeapSpaceStatistics(), argv: LHn.nodeArgv(), nodeMajor: Number(process.versions.node.split('.')[0]) });
  const keep = []; let f = fill();
  // round 5: 256 KB arrays — each a large object (no scavenge copy, no compaction move): 40 000 arrays of 32 KB ran Node 24 out of memory at 86 % of 160 MB once in two runs
  // follow-up: a 256 KB array is born in the YOUNG large-object space, which heapFillOf does not count (it judges the old
  // generation against its own limit) — counted HERE for the fill's stop, else the fill overshot by what that space held
  // (Node 24's 64 MB semi-spaces: 7 of 8 children out of memory, on 82648e1f9 and on this sha alike); then short-lived
  // garbage until a scavenge has promoted every one of them, so the press reads the fill the leg made
  const youngLo = () => Number((v8.getHeapSpaceStatistics().find((x) => x.space_name === 'new_large_object_space') || {}).space_used_size) || 0;
  while (f.used + youngLo() < 0.86 * f.limit && keep.length < 4000) { keep.push(new Array(32768).fill(keep.length)); f = fill(); }   // just past the 85 % bound (88 % ran a 96 MB old generation out of memory)
  for (let i = 0; i < 4000 && youngLo() > 0; i++) { let g = []; for (let j = 0; j < 1000; j++) g.push({ j }); g = null; }
  later(400, () => { const r = W.holds().startProfile(1000); out.checks.heap = { usedMb: Math.round(fill().used / 1048576), limitMb: Math.round(fill().limit / 1048576), heapSizeLimitMb: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576), press: r }; keep.length = 0; done(200); });
}
else if (plan === 'mixedLate') {   // round 4 (B): JavaScript then a sync child, the watchdog's thread starting late inside it
  // B-1409 follow-up: node builds a channel's FIRST MessageEvent by loading undici (Node 22 and 24) — on this collector that
  // load ran in the mixed hold's tail, and a late watchdog's asks met it (the release gate's D 921: «JavaScript» 2 : 1, both
  // answers undici frames); loaded here, before the hold, the tail runs only the plan's own lines
  void globalThis.MessageEvent;
  const { BroadcastChannel } = require('worker_threads'); const evs = [], bc = new BroadcastChannel('lh-posts'); bc.onmessage = (e) => evs.push(e.data);
  later(150, () => { const wall = Date.now(), holdStart = kmono(), st = {}; H.mixedHog(cfg.jsMs, cfg.childS, st); const end = kmono(); later(500, () => { bc.close(); out.checks.run = { wall, holdStart, end, childStart: st.c0, childEnd: st.c1 }; out.checks.evs = evs; done(300); }); });
}
else if (plan === 'late') setTimeout(() => { W = make(); H.busyHog(300); done(); }, 2000);   // started AFTER the loop's first turn, then held at once
else if (plan === 'lateWatchdog') { let last = Date.now(), maxGap = 0; const t = setInterval(() => { const n = Date.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 20); setTimeout(() => { clearInterval(t); out.checks.mainMaxGap = maxGap; done(300); }, (cfg.blockS || 1.6) * 1000 + 1200); }
else if (plan === 'forge') later(600, () => {
  // an OUTSIDE function renamed with a tab-and-newline name that reads like a repo frame, holding the loop through a hog
  const outside = new Function('h', 'return h(320);');
  Object.defineProperty(outside, 'name', { value: 'sk_live_INJECTEDabc123\\t' + ${JSON.stringify(ROOT)} + '/src/x.js\\t7\\t0\\nzz' });
  outside(H.busyHog);
  setTimeout(() => {   // a vm script given a repo-looking file name that does not exist
    require('vm').runInThisContext('(function vmHogRepo(){ const t = Date.now(); while (Date.now() - t < 320); })()', { filename: ${JSON.stringify(ROOT)} + '/src/fake-vm.js' });
    done();
  }, 300);
});
else if (plan === 'stopRow') later(500, () => {
  const row = cfg.row;
  if (row === 'sigterm' || row === 'sigtermFlush') process.on('SIGTERM', () => { if (row === 'sigtermFlush') { H.busyHog(300); cp.execFileSync('sleep', ['0.5']); H.busyHog(300); } process.exit(0); });
  if (row === 'sigterm' || row === 'sigtermFlush') { process.stderr.write('[kid] ready\\n'); H.busyHog(cfg.row === 'sigterm' ? 600 : 50); setTimeout(() => {}, 5000); return; }
  if (row === 'exitInside') { H.busyHog(330); process.exit(0); }
  if (row === 'exitAfter') { H.busyHog(330); setImmediate(() => process.exit(0)); return; }
  if (row === 'throwInside') { H.busyHog(330); throw new Error('a fatal throw inside the hold'); }
  if (row === 'throwAfter') { H.busyHog(330); setImmediate(() => { throw new Error('a fatal throw right after the hold'); }); return; }
  if (row === 'exitNative') { H.sleepHog(0.35); process.exit(0); }
});
else if (plan === 'openSameTick') later(500, () => { require('inspector').open(0, '127.0.0.1'); H.busyHog(330); setTimeout(() => { require('inspector').close(); done(); }, 50); });
else if (plan === 'sigusr1') later(500, () => { process.stderr.write('[kid] ready\\n'); H.busyHog(600); done(); });
else if (plan === 'accessorHog') later(500, () => {   // round 5 (law A): a program that keeps an ACCESSOR on Error.prepareStackTrace
  let held; Object.defineProperty(Error, 'prepareStackTrace', { configurable: true, get() { return held; }, set(v) { held = v; } });
  H.busyHog(330); done();
});
else if (plan === 'pressRefuse') later(400, () => { out.checks.press = W.holds().startProfile(); done(100); });
else if (plan === 'deadWatchdog') later(300, () => { out.checks.press = W.holds().startProfile(400); W.stop(); setTimeout(() => { out.checks.after = W.holds().report().profile; done(50); }, 1000); });
else if (plan === 'telemetry') later(500, () => { H.busyHog(320); done(); });
else if (plan === 'busy') later(600, () => { H.busyHog(320); done(); });
else if (plan === 'json') { const s = '[' + new Array(1300000).fill('{"a":1,"b":"vvvvvv"}').join(',') + ']'; later(700, () => { H.jsonHog(s); done(); }); }
else if (plan === 'jsonMany') { const s = '[' + new Array(1300000).fill('{"a":1,"b":"vvvvvv"}').join(',') + ']'; let k = 0;   // round 5 (law B): many parse holds in one child
  const next = () => { if (k++ >= (cfg.n || 12)) return done(); H.jsonHog(s); setTimeout(next, 400); }; later(700, next); }
else if (plan === 'zlib') { const b = Buffer.alloc(40 << 20); for (let i = 0; i < b.length; i += 4096) b.writeUInt32LE((i * 2654435761) >>> 0, i); later(700, () => { H.zlibHog(b); done(); }); }
else if (plan === 'regex') later(600, () => { H.regexHog(cfg.n || 23); done(); });
else if (plan === 'sleep') later(600, () => { H.sleepHog(0.35); done(); });
else if (plan === 'gc') { const keep = []; for (let i = 0; i < 1500; i++) { const a = new Array(1000); for (let j = 0; j < a.length; j++) a[j] = { j, s: 'x' + j }; keep.push(a); } global.__keep = keep; later(700, () => { H.busyHog(120); H.gcHog(); H.gcHog(); H.busyHog(120); done(); }); }
else if (plan === 'cap') { let k = 0; const one = () => { H.busyHog(260); if (++k < 4) later(250, one); else done(); }; later(500, one); }
else if (plan === 'exit-in-hold') later(500, () => { H.busyHog(cfg.ms || 350); process.stderr.write('[kid] exiting inside the hold\\n'); process.exit(0); });
else if (plan === 'natural') later(500, () => { H.busyHog(300); process.stderr.write('[kid] hold over at ' + Date.now() + '\\n'); W.stop = () => {}; });
else if (plan === 'exit-inflight') later(500, () => { H.sleepHog(0.35); process.stderr.write('[kid] exit at ' + Date.now() + '\\n'); process.exit(0); });
else if (plan === 'lawC') {
  // everything the held code can observe, recorded while the hog holds the loop (samples land inside it)
  const ah = require('async_hooks'), { AsyncLocalStorage } = ah, als = new AsyncLocalStorage(), store = { id: 7 };
  let uncaught = 0; process.on('uncaughtException', () => { uncaught++; }); process.on('unhandledRejection', () => { uncaught++; });
  const hubHook = (_, cs) => cs, P0 = Error.prepareStackTrace, L0 = Error.stackTraceLimit;
  later(500, () => {
    const order = [];
    Promise.resolve().then(() => order.push('m1')); process.nextTick(() => order.push('t1')); setImmediate(() => order.push('i1')); setTimeout(() => order.push('T1'), 0); queueMicrotask(() => order.push('m2'));
    let inits = 0; const hook = ah.createHook({ init() { inits++; } }).enable();
    let early = 0, alsBad = 0, errBad = 0;
    als.run(store, () => {
      early += H.spinChecked(330, () => order.length === 0);
      alsBad += H.spinChecked(1, () => als.getStore() === store);
      // the hub's own window (user-todos.js / jobs.js): its hook and limit in place while samples land
      Error.prepareStackTrace = hubHook; Error.stackTraceLimit = 1;
      errBad += H.spinChecked(330, () => Error.prepareStackTrace === hubHook && Error.stackTraceLimit === 1 && als.getStore() === store);
      Error.prepareStackTrace = P0; Error.stackTraceLimit = L0;
    });
    const deep = H.deepHog(cfg.deepIters || 4e8, { l: L0, p: P0 });
    hook.disable();
    out.checks = { early, alsBad, errBad, deepBad: deep.bad, depth: deep.depth, initsInHold: inits, after: { p: Error.prepareStackTrace === P0, l: Error.stackTraceLimit === L0 } };
    setTimeout(() => { out.checks.order = order.join(','); out.checks.uncaught = uncaught; done(); }, 50);
  });
}
else if (plan === 'soak') {
  // ⑥: samples asked from an IDLE loop (the profile road, a 1 ms beat) — by value, the session keeps nothing
  later(300, () => { global.gc(); global.gc(); const h0 = process.memoryUsage().heapUsed; out.checks.h0 = h0;
    const r = W.holds().startProfile(cfg.profileMs);
    const wait = () => { const p = W.holds().report().profile; if (p.running) return setTimeout(wait, 100); global.gc(); global.gc(); out.checks.h1 = process.memoryUsage().heapUsed; out.checks.samples = p.last && p.last.samples; out.checks.idlePct = p.last && p.last.idlePct; done(50); };
    setTimeout(wait, cfg.profileMs);
  });
}
else if (plan === 'await') later(600, () => { (cfg.work ? H.awaitWorkHog : H.awaitHog)(cfg.n || 8000000).then(() => done()); });
else if (plan === 'prep') later(600, () => { H.slowPrep(320); done(); });
else if (plan === 'stopcont') later(500, () => { process.stderr.write('[kid] ready\\n'); setTimeout(() => done(300), 2400); });
else if (plan === 'openPort') later(600, () => { H.busyHog(320); setTimeout(() => { require('inspector').close(); done(); }, 50); });
else if (plan === 'stopNoLine') later(500, () => { H.busyHog(320); setTimeout(() => { process.stderr.write('[kid] an ordinary stop\\n'); process.exit(0); }, 900); });
else if (plan === 'deepSoak') later(300, () => { const P0 = Error.prepareStackTrace, L0 = Error.stackTraceLimit; W.holds().startProfile(cfg.profileMs); const r = H.deepSoak(cfg.stepIters || 6e7, { l: L0, p: P0 });
  out.checks = { ...r, after: { p: Error.prepareStackTrace === P0, l: Error.stackTraceLimit === L0, typeofStack: typeof new Error().stack } }; const w = () => (W.holds().report().profile.running ? setTimeout(w, 50) : done(50)); setTimeout(w, 100); });
else if (plan === 'heapRefuse') later(300, () => { out.checks.refusal = W.holds().startProfile(); done(100); });
else if (plan === 'heapStop') later(300, () => { W.holds().startProfile(); setTimeout(() => done(100), 2500); });
// ── round 3 ──
else if (plan === 'lateJs') { const tw = {}; later(cfg.hogAt || 500, () => { tw.start = Date.now(); H.monoHog(cfg.hogMs || 300); tw.end = Date.now(); out.checks.truth = tw; done(700); }); }
else if (plan === 'idleStep') later(cfg.idleMs || 1400, () => done(100));
else if (plan === 'monoAcrossStep') later(500, () => { const t0 = Date.now(), m0 = process.hrtime.bigint(); H.monoHog(300); out.checks.truthMs = Number(process.hrtime.bigint() - m0) / 1e6; out.checks.wall0 = t0; done(700); });
else if (plan === 'heapEvals') later(300, () => { global.gc(); global.gc(); out.checks.h0 = process.memoryUsage().heapUsed; const e0 = evals;
  W.holds().startProfile(cfg.profileMs || 20000);
  const chunk = () => { H.monoHog(4); if (evals - e0 < (cfg.want || 2200) && Date.now() - T0 < 25000) setImmediate(chunk); else setTimeout(() => { global.gc(); global.gc(); out.checks.h1 = process.memoryUsage().heapUsed; out.checks.realEvals = evals - e0; done(10); }, 300); };
  setImmediate(chunk); });
else if (plan === 'manyLocations') { const FNS = require(${JSON.stringify(MANY)}); later(300, () => { W.holds().startProfile(cfg.profileMs || 3000); let k = 0; const t1 = Date.now();
  const chunk = () => { const t = Date.now(); while (Date.now() - t < 150) FNS[(k++ * 7919) % 600](0.05); if (Date.now() - t1 < (cfg.profileMs || 3000) + 300) setTimeout(chunk, 5); else setTimeout(() => done(10), (cfg.lostAfterMs || 1000) + 500); };
  chunk(); }); }
else if (plan === 'stopDebugger') later(300, () => { W.holds().startProfile(2000); setTimeout(() => { require('inspector').open(0, '127.0.0.1'); setTimeout(() => { require('inspector').close(); done(100); }, 600); }, 400); });
else if (plan === 'names') later(500, () => {
  const steps = [
    () => require('vm').runInThisContext('(function sk_live_VMreal(){ const t = process.hrtime.bigint(); while (Number(process.hrtime.bigint() - t) / 1e6 < 320); })()', { filename: ${JSON.stringify(ROOT)} + '/src/loop-hold.js' }),
    () => require('vm').runInThisContext('(function johnSmithVm(){ const t = process.hrtime.bigint(); while (Number(process.hrtime.bigint() - t) / 1e6 < 320); })()', { filename: ${JSON.stringify(ROOT)} + '/server.js' }),
    () => H.computedSelf('sk_live_COMPUTEDabc', 320), () => H.computedSelf('john.smith', 320),
    () => { const outside = new Function('h', 'return h(320);'); Object.defineProperty(outside, 'name', { value: 'q\\n    at ' + ${JSON.stringify(ROOT)} + '/src/loop-hold.js:77:1\\nzz' });
      const P = Error.prepareStackTrace; Error.prepareStackTrace = function (e, cs) { outside(H.monoHog); return cs; }; try { void new Error().stack; } finally { Error.prepareStackTrace = P; } },
    () => new H.Hogs().member(320), () => H.arrowHog(320), () => H.hogObj.methodHog(320), () => H.anonHog(320),
  ];
  let i = 0; const next = () => { if (i >= steps.length) return done(); steps[i++](); setTimeout(next, 250); }; next(); });
else if (plan === 'exitNativeX') later(500, () => { cp.execFileSync('sleep', [String(cfg.x / 1000)]); process.exit(0); });
else if (plan === 'exitParseX') { const s = '[' + new Array(cfg.n || 600000).fill('{"a":1,"b":"vvvvvv"}').join(',') + ']'; later(500, () => { JSON.parse(s); process.exit(0); }); }
else if (plan === 'pressSameTick') later(400, () => { require('inspector').open(0, '127.0.0.1'); out.checks.press = W.holds().startProfile(); require('inspector').close(); done(100); });
else if (plan === 'deadPress') later(300, () => { out.checks.press = W.holds().startProfile(3000); W.stop(); setTimeout(() => { out.checks.mid = W.holds().report().profile; out.checks.press2 = W.holds().startProfile(3000); done(10); }, 200); });
else if (plan === 'twoUnseen') { const tw = []; const hog = (at) => later(at, () => { const s0 = Date.now(); H.monoHog(300); tw.push({ start: s0, end: Date.now() }); });
  hog(cfg.at1 || 300); hog(cfg.at2 || 750); later((cfg.blockS || 1.3) * 1000 + 700, () => { out.checks.truth = tw; done(10); }); }
else if (plan === 'profile') later(400, () => { W.holds().startProfile(); setTimeout(() => H.busyHog(300), 400); setTimeout(() => H.sleepHog(0.4), 900); setTimeout(() => done(100), 1900); });
`);

// THE BOX CAN STARVE A CHILD (the follow-up, 主开发's ruling 07:31Z). A hold whose own window shows ≥ 20 % run-queue wait
// is judged «waiting for a CPU» by the product — TRUE, and outside every leg's law about the asks. Measured (a lane probe,
// load 6–7): 120 busy windows of 300 ms, bare 0 starved; with this watchdog at the suite's 20 ms beat 2 (40–70 ms of
// run-queue wait). THE SUITE'S OWN COUNT decides, never the product's word: each hog's span's wait over its length
// (SPANS, read in the child by the harness). ≥ SUITE_STARVED ⇒ the product MUST say «waiting for a CPU»; the product saying
// it with < SUITE_CLEAR measured ⇒ red; between them (the product's window runs up to a beat past the span) neither is
// asserted. A hold is OUTSIDE the asks' law only when the product says «waiting for a CPU» AND the suite measured
// ≥ SUITE_CLEAR. THE FLOOR: ASKED_FLOOR of a child's holds judged by its asks (≥ 70 %: the ask legs' own count floors —
// (A)'s 8 of ~12–39 holds in native code — stay reachable, and the box's measured 2 % leaves a wide margin); under it the
// child reruns ONCE, then it is red by name «the box starved the suite: N of M». The count is printed every run.
const SUITE_STARVED = 0.25, SUITE_CLEAR = 0.1, ASKED_FLOOR = 0.7;
const STARVE = { holds: 0, waiting: 0, outside: 0, measured: 0, measuredStarved: 0, band: 0, disagree: [], reruns: [], red: [] };
/** each hold of a child with the suite's own measure of its span (null: no measured hog in it) */
function starveOf(r) {
  const holds = (r.out && r.out.report && r.out.report.holds) || [], spans = (r.out && r.out.spans) || [];
  return holds.map((h) => {
    const s = spans.filter((x) => x.wall >= h.at - 60 && x.wall <= h.at + 10 + (h.msHi || h.ms || 0)).sort((a, b) => b.ms - a.ms)[0] || null;
    const share = s && s.ms > 0 ? s.waitMs / s.ms : null, waiting = h.verdict === LH.V.waiting;
    // B-1409: a hold that waited ≥ 20 % but RAN more is said by its parts with «it also waited N s for a CPU» — the wait said
    const also = /; it also waited [\d.]+ s for a CPU/.test(h.line || '');
    return { h, share, waiting, also, outside: waiting && share != null && share >= SUITE_CLEAR };
  });
}
function account(rows, plan) {
  for (const x of rows) {
    STARVE.holds++; if (x.waiting) STARVE.waiting++; if (x.outside) STARVE.outside++;
    if (x.share == null) continue;
    STARVE.measured++;
    const pc = (100 * x.share).toFixed(0);
    if (x.share >= SUITE_STARVED) { STARVE.measuredStarved++; if (!x.waiting && !x.also) STARVE.disagree.push(`${plan}: the suite measured ${pc} % run-queue wait, the product said «${x.h.verdict}» and nothing of a wait`); }
    else if (x.share >= SUITE_CLEAR) STARVE.band++;
    else if (x.waiting) STARVE.disagree.push(`${plan}: the product said «waiting for a CPU», the suite measured ${pc} %`);
  }
}
async function run(cfg, opts = {}) {
  let r = await run1(cfg, opts), rows = starveOf(r);
  account(rows, cfg.plan);
  const under = (rs) => rs.length > 0 && (rs.length - rs.filter((x) => x.outside).length) / rs.length < ASKED_FLOOR;
  if (under(rows)) {
    STARVE.reruns.push(`${cfg.plan}: ${rows.filter((x) => x.outside).length} of ${rows.length}`);
    r = await run1(cfg, opts); rows = starveOf(r); account(rows, cfg.plan);
    if (under(rows)) STARVE.red.push(`${cfg.plan}: ${rows.filter((x) => x.outside).length} of ${rows.length}`);
  }
  r.starve = rows;
  return r;
}
function run1(cfg, { node = process.execPath, args = [], timeoutMs = 30000, onReady = null, env = {}, pin = null } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const c = pin != null ? spawn('taskset', ['-c', String(pin), node, ...args, KID, JSON.stringify(cfg)], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir(), ...env } })
      : spawn(node, [...args, KID, JSON.stringify(cfg)], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir(), ...env } });
    let out = '', err = '', exitAt = null, readied = false;
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; if (onReady && !readied && err.includes('[kid] ready')) { readied = true; onReady(c); } });
    const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, timeoutMs);
    c.on('exit', (code) => { exitAt = Date.now(); clearTimeout(kill); let j = null; try { j = JSON.parse(out); } catch { } if (j && j.cpuMs) cpuMs += j.cpuMs; resolve({ code, out: j, err, lines: err.split('\n').filter(Boolean), wallMs: exitAt - t0, exitAt }); });
  });
}
const holdLines = (r) => r.lines.filter((l) => l.startsWith('[loop-hold] the main loop was held') || l.startsWith('[loop-hold] the boot held'));
const lineWith = (r, re) => holdLines(r).find((l) => re.test(l));

// ── ① NAMED ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legNamed(tag, node) {
  console.log(`① the planted hogs are named (${tag})`);
  const busy = await run({ plan: 'busy' }, { node });
  const bl = lineWith(busy, /busyHog \(src\/hogs\.js:2\)/);
  ok(bl && / — JavaScript: the main thread ran \d+\.\d s of the \d+\.\d s measured \(user \d+\.\d, kernel \d+\.\d\); \d samples?: busyHog \(src\/hogs\.js:2\)/.test(bl) && /heap \d+\.\d of \d+\.\d GB, external \d+\.\d GB, rss \d+\.\d GB/.test(bl) && /the loop was \d+ % busy in the minute before/.test(bl),
    `a pure JS busy function: JavaScript, named by function + file, the scheduler's numbers, memory, utilization: ${bl}`, busy.lines);
  const live = busy.lines.find((l) => l.startsWith('[sync-fs] the main loop has been held'));
  ok(live && / — JavaScript: src\/hogs\.js:2/.test(live) && !/busyHog/.test(live), `the watchdog thread's while-held line carries the frames by LOCATION (round 4, MUST 2: no name is read while the loop is held — names come with the hold's own line after it): ${live}`, busy.lines);
  const tb = busy.out && busy.out.report.table.find((r) => r.frame === 'busyHog (src/hogs.js:2)');
  ok(tb && tb.verdict === 'JavaScript' && tb.count === 1 && busy.out.report.holds.some((h) => h.line === bl), 'the since-start table and the ring carry the same hold');
  if (tag !== 'Node 24') { const sl = await run({ plan: 'sleep' }, { node }); const l = lineWith(sl, /sleepHog/); ok(l && / — in the kernel \(blocked\): /.test(l) && /\d samples?: asleep: \S+ in \w+/.test(l), `a sync child: in the kernel, its sample asleep with the kernel's wait channel: ${l}`, sl.lines); return; }
  const js = await run({ plan: 'json' });
  const jl = lineWith(js, /the first JavaScript after it: .*jsonHog \(src\/hogs\.js:5\)/);
  ok(jl && / — (native code or garbage collection|on the CPU — JavaScript or native code, no sample of that part): /.test(jl) && !/ — in the kernel \(blocked\)/.test(jl) && /the first JavaScript after it: [^;]*afterParse \(src\/hogs\.js:4\)/.test(jl),
    `a JSON.parse of a large buffer: on the CPU, not JavaScript while it parsed (never «blocked» — round 5 law B), the first JavaScript after it names the parse's caller (afterParse ← jsonHog): ${jl}`, js.lines);
  const zl = await run({ plan: 'zlib' });
  const z = lineWith(zl, /zlibHog \(src\/hogs\.js:6\)/);
  ok(z && / — (native code or garbage collection|JavaScript)[:,]/.test(z) && !/ — in the kernel \(blocked\)/.test(z) && /zlibHog \(src\/hogs\.js:6\)/.test(z), `a sync zlib: native while it compressed (round 4: an ask is JavaScript only when answered at JavaScript speed — round 3's «named» was a late answer), zlibHog named: ${z}`, zl.lines);
  const rx = await run({ plan: 'regex' });
  const r = lineWith(rx, /regexHog \(src\/hogs\.js:7\)/);
  ok(r && / — JavaScript: /.test(r) && /\(built-in\) ← regexHog \(src\/hogs\.js:7\)/.test(r), `a catastrophic regex: the built-in under regexHog: ${r}`, rx.lines);
  const sl = await run({ plan: 'sleep' });
  const s = lineWith(sl, /sleepHog \(src\/hogs\.js:8\)/);
  ok(s && / — in the kernel \(blocked\): the main thread ran 0\.\d s of the 0\.\d s measured/.test(s) && /\d samples?: asleep: \S+ in \w+/.test(s) && /the first JavaScript after it: .*sleepHog \(src\/hogs\.js:8\)/.test(s),
    `a sync child (execFileSync sleep): in the kernel, its sample asleep with the kernel's wait channel, the first JavaScript after it: ${s}`, sl.lines);
  // law B, as shipped: NO gc observer (on Node 24 near the heap limit it alone ran a process out of memory with a third
  // less data) — the hold line carries the heap's size instead; the observer, opted in, names the collections
  const gcOff = await run({ plan: 'gc' }, { args: ['--expose-gc'] });
  const g0 = holdLines(gcOff).find((l) => l.startsWith('[loop-hold] the main loop was held'));
  ok(g0 && !/garbage collection/.test(g0) && /heap \d+\.\d of \d+\.\d GB, external \d+\.\d GB, rss \d+\.\d GB/.test(g0), `law B as shipped: no collection observer — the hold line carries the heap's size: ${g0}`, gcOff.lines);
  const gc = await run({ plan: 'gc', gcMinMs: 5, observeGc: true }, { args: ['--expose-gc'] });   // opted in; the ring's floor injected (5 ms): two forced mark-compacts of a ~75 MB heap
  const g = holdLines(gc).find((l) => l.startsWith('[loop-hold] the main loop was held') && /gcHog \(src\/hogs\.js:9\)|busyHog/.test(l) && /garbage collection: mark-compact \d+\.\d s \(2\)[^;]* inside the hold/.test(l));
  ok(g, `the observer opted in: a collection forced inside a hold is named: ${g}`, gc.lines);
}

// ── ② – ④ ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legBootCapSwitch() {
  console.log('② the boot is a hold (outside the cap)');
  const b = await run({ plan: 'boot', boot: 350, cap: 0 });
  const bl = holdLines(b).find((l) => l.startsWith('[loop-hold] the boot held the main loop'));
  ok(bl && /before its first turn — JavaScript: /.test(bl) && /bootHog \(src\/hogs\.js:3\)/.test(bl) && b.out && b.out.report.counts.boot === 1, `the main module busy before its first turn is sampled and said as the boot's, with a cap of 0: ${bl}`, b.lines);
  const late = await run({ plan: 'late' });
  const ll = holdLines(late);
  ok(ll.length === 1 && /^\[loop-hold\] the main loop was held 0\.[2-4] s — JavaScript: /.test(ll[0]) && late.out && late.out.report.counts.boot === 0, `a witness started AFTER the loop's first turn (2 s into the process) then held at once: an ordinary hold timed from its own start, never «the boot» of the process's age: ${ll[0]}`, late.lines);
  console.log('③ the cap (2 an hour here) — the rest still measured');
  const c = await run({ plan: 'cap', cap: 2 });
  const hl = holdLines(c), sampled = hl.filter((l) => / \d samples?: /.test(l)), capped = hl.filter((l) => /not sampled \(\d+ holds were sampled in the last hour\)/.test(l));
  ok(hl.length === 4 && sampled.length === 2 && capped.length === 2 && capped.every((l) => /ran \d+\.\d s of the \d+\.\d s measured/.test(l) && / — on the CPU in user mode — JavaScript or native code, not sampled: /.test(l)), `4 holds: 2 sampled, 2 «not sampled» past the cap, every one with law A's numbers`, hl);
  console.log('④ the off switch, the debugger');
  // the off switch asks NOTHING: the real evaluates that reached the main thread, counted (a session is now connected only
  // for one ask at a time, so an exit no longer shows one — the count is the evidence)
  const offE = await run({ plan: 'busy', sampling: false, countEvals: true }), onE = await run({ plan: 'busy', countEvals: true });
  ok(offE.out && offE.out.checks.evals === 0 && onE.out && onE.out.checks.evals >= 1, `the off switch: a sampled hold drew ${onE.out && onE.out.checks.evals} real evaluates, the same hold with sampling OFF drew ${offE.out && offE.out.checks.evals}`);
  const offB = await run({ plan: 'busy', sampling: false });
  const ol = holdLines(offB)[0];
  ok(ol && /not sampled \(sampling is off in Settings\)/.test(ol) && /ran \d+\.\d s of/.test(ol) && !/busyHog/.test(ol), `sampling off: «not sampled (sampling is off in Settings)», law A's numbers still said: ${ol}`, offB.lines);
  const dbg = await run({ plan: 'busy' }, { args: ['--inspect=127.0.0.1:0'] });
  const dl = holdLines(dbg)[0], said = dbg.lines.filter((l) => l.startsWith('[loop-hold] a debugger port is open'));
  ok(said.length === 1 && dl && /not sampled \(a debugger is attached\)/.test(dl), `a debugger port open: said once, the sampler stands down: ${said[0]} / ${dl}`, dbg.lines);
}

// ── ⑤ LAW C ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legLawC(tag, node) {
  console.log(`⑤ law C — a sample changes nothing the held code can observe (${tag})`);
  const runs = { on: [], off: [] };
  for (let i = 0; i < 3; i++) { runs.on.push(await run({ plan: 'lawC' }, { node })); runs.off.push(await run({ plan: 'lawC', sampling: false }, { node })); }
  const C = (r) => (r.out && r.out.checks) || {};
  const sampledOn = runs.on.map((r) => holdLines(r).reduce((n, l) => n + Number((/ (\d) samples?: /.exec(l) || [0, 0])[1]), 0));
  ok(sampledOn.every((n) => n >= 3), `the ON runs were really sampled inside their holds (${sampledOn.join(', ')} samples)`, runs.on.map((r) => holdLines(r)));
  const orders = new Set([...runs.on, ...runs.off].map((r) => C(r).order));
  ok(orders.size === 1 && /^t1,m1,m2,/.test([...orders][0]), `pending nextTick / microtasks / timers / immediates run in ONE order over ${runs.on.length + runs.off.length} runs, sampled or not (${[...orders].join(' | ')})`);
  ok([...runs.on, ...runs.off].every((r) => C(r).early === 0), 'none of them ran early (inside the hold) — with samples landing there');
  ok(runs.on.every((r) => C(r).alsBad === 0 && C(r).initsInHold === 0 && C(r).uncaught === 0) && runs.off.every((r) => C(r).initsInHold === 0),
    'the AsyncLocalStorage store unchanged; no async-hooks init (no promise, no resource); nothing reached uncaughtException / unhandledRejection', runs.on.map(C));
  ok(runs.on.every((r) => C(r).errBad === 0 && C(r).after && C(r).after.p && C(r).after.l), 'inside the hub\'s own prepareStackTrace window: its hook and its limit stay in place while samples land', runs.on.map(C));
  const deepLines = runs.on.map((r) => holdLines(r).find((l) => /deep recursion|deepHog/.test(l)) || '');
  const atLimit = deepLines.map((l) => (/(the stack was nearly full \(deep recursion\)|deepHog \(src\/hogs\.js:\d+\)[^,;]*) ×\d/.exec(l) || [])[0]);
  ok(runs.on.every((r) => C(r).deepBad === 0 && C(r).depth > 1000) && atLimit.every(Boolean), `one frame from the stack limit (depth ${C(runs.on[0]).depth}): a sample landed there (${atLimit.join(' | ')}) and prepareStackTrace / stackTraceLimit were never seen changed`, { checks: runs.on.map(C), lines: deepLines });
}

// ── ⑥ – ⑦ ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function legRetainExitProfile() {
  console.log('⑥ nothing retained, nothing kept alive, no exit delayed');
  const s = await run({ plan: 'soak', beatMs: 1, profileEveryMs: 1, profileMs: 9000 }, { args: ['--expose-gc'], timeoutMs: 60000 });
  const k = (s.out && s.out.checks) || {};
  ok(k.samples >= 5000 && k.h1 - k.h0 < 1024 * 1024, `${k.samples} samples by value from an idle loop: the heap moved ${((k.h1 - k.h0) / 1024).toFixed(0)} KB (< 1 MB — a remote object a sample would be a leak)`, k);
  const nat = await run({ plan: 'natural' });
  const over = Number((/hold over at (\d+)/.exec(nat.err) || [])[1]);
  ok(nat.code === 0 && over && nat.exitAt - over < 1500, `a natural exit right after a sampled hold: the process ends by itself ${nat.exitAt - over} ms after the hold (the watchdog keeps nothing alive)`, nat.lines);
  const inf = await run({ plan: 'exit-inflight' });
  const at = Number((/exit at (\d+)/.exec(inf.err) || [])[1]);
  ok(inf.code === 0 && at && inf.exitAt - at < 1000, `process.exit() while a sample is in flight (a sync child held the loop): it exits ${inf.exitAt - at} ms later — never delayed`, inf.lines);
  console.log('⑦ law L — a short profile');
  const p = await run({ plan: 'profile' });
  const last = p.out && p.out.report.profile.last;
  const pl = p.lines.find((l) => l.startsWith('[loop-hold] profile of'));
  ok(last && last.samples >= 15 && last.idlePct > 0 && last.noJsPct > 0 && last.top.some((x) => x.frame === 'busyHog (src/hogs.js:2)' && x.pct > 0) && pl && /busyHog \(src\/hogs\.js:2\) \d+(\.\d)? %/.test(pl),
    `a 1.5 s profile (a sample every 50 ms): the hog's share by its frame, the idle share, the no-JavaScript share of a sync child's 0.4 s (counted per lost interval, one ask in flight); its line: ${pl}`, last);
}

// ── ⑩ THE ACCEPTANCE'S ROUND (a25a60def: «a wrong cause is worse than no cause») ───────────────────────────────────────
async function legAcceptance() {
  console.log('⑩ the acceptance\'s must-fix');
  // 1. a LATE watchdog invents no hold: its own procfs reads block 1.6 s while the main loop beats every 20 ms
  const lw = await run({ plan: 'lateWatchdog', blockS: 1.6 });
  ok(lw.code === 0 && lw.out && lw.out.checks.mainMaxGap < 300 && holdLines(lw).length === 0 && lw.out.report.counts.holds === 0,
    `1 — the watchdog thread alone blocked 1.6 s while the main loop beat on (its largest gap ${lw.out && lw.out.checks.mainMaxGap} ms): NO hold, no table row, no metric — a hold exists only when the main thread's own beats say so`, { code: lw.code, counts: lw.out && lw.out.report.counts, wall: lw.wallMs, err: lw.err.slice(-600) });
  // 2. a hold nobody sampled is not «native»
  const ns = await run({ plan: 'busy', sampling: false });
  const nl = holdLines(ns)[0];
  ok(nl && / — on the CPU in user mode — JavaScript or native code, not sampled: /.test(nl) && /not sampled \(sampling is off in Settings\)/.test(nl) && ns.out.report.table[0].verdict === LH.V.unsampled,
    `2 — a JavaScript loop nobody sampled: the verdict says «not sampled» (the line, the table key) — never «native code or garbage collection»: ${nl}`, ns.lines);
  const cap = await run({ plan: 'cap', cap: 0 });
  ok(holdLines(cap).length === 4 && holdLines(cap).every((l) => / — on the CPU in user mode — JavaScript or native code, not sampled: /.test(l)), '2 — past the hourly cap: every JavaScript hold says «not sampled», none «native»', holdLines(cap));
  // 3. no name forges a frame; a vm script with a repo-looking name is not a repo frame
  const fg = await run({ plan: 'forge', record: true });
  const fl = holdLines(fg), sinks = JSON.stringify({ lines: fl, table: fg.out && fg.out.report.table, recs: fg.out && fg.out.checks.recs });
  ok(fl.length === 2 && !/sk_live|INJECTED|src\/x\.js|fake-vm/.test(sinks) && /busyHog \(src\/hogs\.js:2\)/.test(fl[0]) && /\(outside the repo\)/.test(fl[1]),
    `3 — a function renamed «sk_live…\\t…/src/x.js\\t7…» and a vm script named …/src/fake-vm.js: no forged name, no non-existent repo file in the lines, the table or the telemetry — the outside frames «(outside the repo)»: ${fl.map((l) => l.slice(0, 200)).join(' | ')}`, fl);
  // 4. off from the first instruction: the REAL boot-trace start reads the setting before anything is asked
  const offBoot = await new Promise((r) => { const c = spawn(process.execPath, [BOOTKID, JSON.stringify({ setting: false })], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir() } }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => { let j = null; try { j = JSON.parse(o); } catch { } if (j) cpuMs += j.cpuMs; r(j); }); });
  const onBoot = await new Promise((r) => { const c = spawn(process.execPath, [BOOTKID, JSON.stringify({})], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir() } }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => { let j = null; try { j = JSON.parse(o); } catch { } if (j) cpuMs += j.cpuMs; r(j); }); });
  ok(offBoot && offBoot.evals === 0 && /the boot held the main loop/.test(offBoot.line || '') && /not sampled \(sampling is off in Settings\)/.test(offBoot.line) && onBoot && onBoot.evals >= 1 && /\d samples?: /.test(onBoot.line || ''),
    `4 — the setting OFF in data/settings.json: a 1.35 s boot through the REAL boot-trace start is asked NOTHING (${offBoot && offBoot.evals} evaluates; the control with no setting: ${onBoot && onBoot.evals}) and still said: ${offBoot && offBoot.line}`, { offBoot, onBoot });
  // 5. no «Waiting for the debugger to disconnect…» at a stop — also the stop of a held hub (the verifier's seven rows)
  const rows = ['exitInside', 'exitAfter', 'throwInside', 'throwAfter', 'sigterm', 'sigtermFlush', 'exitNative'];
  const seen = {};
  for (const row of rows) for (let i = 0; i < 2; i++) {
    const r = await run({ plan: 'stopRow', row }, { onReady: (c) => { setTimeout(() => { try { c.kill('SIGTERM'); } catch { } }, 120); } });
    seen[row] = (seen[row] || 0) + (r.err.includes('Waiting for the debugger') ? 1 : 0);
  }
  ok(rows.every((r) => seen[r] === 0), `5 — the seven stop rows, twice each (exit / throw inside and right after a sampled hold, SIGTERM inside one, a SIGTERM handler's 1.1 s flush, an exit right after a native hold with an ask abandoned): no «Waiting for the debugger…» line (${JSON.stringify(seen)})`);
  // 6. a debugger that arrives DURING the hold stands the sampler down (the sample checks it on the main thread)
  // ROUND 5 (law A): AN ASK THE SAMPLER WITHDREW IS NOT A SAMPLE — each of the three stand-downs, three times, over a PURE
  // JavaScript hog: «not sampled (why)», or «JavaScript» from ANOTHER ask that was really answered — never «native» / «on the
  // CPU, not in JavaScript» (round 4 said so 8 of 8 times: the withdrawn ask was judged «running, no fast answer»)
  const NATIVE_WORDS = /native code or garbage collection|on the CPU, not in JavaScript/;
  const st6 = [], su6 = [], ac6 = [];
  for (let i = 0; i < 3; i++) {
    st6.push(holdLines(await run({ plan: 'openSameTick', countEvals: true }))[0]);
    su6.push(holdLines(await run({ plan: 'sigusr1' }, { args: ['--inspect-port=127.0.0.1:0'], onReady: (c) => { try { process.kill(c.pid, 'SIGUSR1'); } catch { } } }))[0]);
    ac6.push(holdLines(await run({ plan: 'accessorHog' }))[0]);
  }
  ok(st6.every((l) => l && /not sampled \(a debugger is attached\)/.test(l) && !NATIVE_WORDS.test(l)), `6 — a port opened in the same tick as a hold, 3 runs: the sample itself answers «stand down» — «not sampled (a debugger is attached)», never native: ${st6[0]}`, st6);
  ok(su6.every((l) => l && (/not sampled \(a debugger is attached\)/.test(l) || / — JavaScript: .*then a debugger is attached: the sampler stood down/.test(l)) && !NATIVE_WORDS.test(l)), `6 — SIGUSR1 inside a held loop (how a person attaches to a stuck hub), 3 runs: stood down — never native: ${su6[0]}`, su6);
  ok(ac6.every((l) => l && (/not sampled \(Error\.prepareStackTrace is an accessor here/.test(l) || / — JavaScript: /.test(l)) && !NATIVE_WORDS.test(l)), `6 — an accessor on Error.prepareStackTrace (round 5 law A), 3 runs: «not sampled (… an accessor …)», never native: ${ac6[0]}`, ac6);
  // 7. THE RATE WHERE IT RUNS: the real evaluates of a hold never exceed the schedule's bound for its length
  const rb = await run({ plan: 'busy', countEvals: true });
  const rh = rb.out && rb.out.report.holds[0];
  ok(rh && rb.out.checks.evals >= 1 && rb.out.checks.evals <= LH.samplesBound(rh.msHi || rh.ms, 100), `7 — a ${rh && rh.ms} ms hold drew ${rb.out && rb.out.checks.evals} real evaluates — at most the schedule's ${rh && LH.samplesBound(rh.msHi || rh.ms, 100)} (a worker that asks at every check goes red here)`, rb.out && rb.out.checks);
  // smaller: the press refuses AT THE PRESS; a dead watchdog leaves no profile running; the telemetry name; the byte bound
  const p1 = await run({ plan: 'pressRefuse', sampling: false }), p2 = await run({ plan: 'pressRefuse', openPortFirst: true }), p3 = await run({ plan: 'pressRefuse', fakeHeap: 0.9 });
  const e = (r) => r.out && r.out.checks.press && r.out.checks.press.error;
  ok(e(p1) === 'sampling_off' && e(p2) === 'debugger_attached' && e(p3) === 'heap_near_limit', `(a) a refused profile answers AT THE PRESS by name: ${e(p1)} / ${e(p2)} / ${e(p3)}`);
  const dw = await run({ plan: 'deadWatchdog', lostAfterMs: 200 });
  const da = dw.out && dw.out.checks.after;
  ok(da && da.running === null && da.last && da.last.refused === 'lost', `(a) the watchdog thread gone mid-profile: no profile «running» for ever — «the watchdog thread stopped» (${JSON.stringify(da && da.last && da.last.refused)})`);
  const tm = await run({ plan: 'telemetry', record: true, maxBytes: 2048 });
  const rec = tm.out && tm.out.checks.recs.find((x) => x.name === 'srv-loop-hold-ms');
  ok(rec && rec.kind === 'metric' && rec.value > 0 && /^JavaScript · busyHog \(src\/hogs\.js:2\)$/.test(rec.detail) && Buffer.byteLength(JSON.stringify(tm.out.report)) <= 2048,
    `(d) the telemetry row is srv-loop-hold-ms with «verdict · frame» (${rec && rec.detail}); a report asked with a byte bound keeps it (${tm.out && Buffer.byteLength(JSON.stringify(tm.out.report))} ≤ 2048)`);
}

// ── ⑨ THE INDEPENDENT CHECK'S CONDITIONS (addendum 2) ───────────────────────────────────────────────────────────────
async function legConditions() {
  console.log('⑨ the independent check\'s conditions');
  // round 5: each job does ~1 µs of JavaScript (awaitWorkHog: 400 000 jobs ≈ 0.47 s) — a bare `await` loop spends nearly all its time between jobs,
  // where an ask finds no JavaScript frame and round 4's law calls it the loop's own machinery (the claim on 9530a1999 read
  // «not sampled» once in two runs); with work in the job an ask lands in it
  const aw = await run({ plan: 'await', n: 400000, work: true });
  // the chain's jobs run from V8's microtask queue: a sample lands BETWEEN them (no JavaScript frame on the stack —
  // «between JavaScript frames») or inside the drain Node runs them from (runNextTicks / processTicksAndRejections)
  const al = holdLines(aw).find((l) => /between JavaScript frames|task_queues|awaitHog|awaitWorkHog/.test(l));
  ok(al && / — JavaScript: /.test(al) && !/no JavaScript frame|idle/.test(al), `condition 3: a loop held by an await chain — JavaScript (between its jobs, or in the drain that runs them), never «idle», never «no JavaScript frame»: ${al}`, aw.lines);
  const pr = await run({ plan: 'prep' });
  const pl = holdLines(pr).find((l) => /src\/hogs\.js:12/.test(l));
  ok(pl && !pl.includes(ROOT) && / — JavaScript: /.test(pl) && !/slowPrepHook/.test(pl), `condition 2: a hold inside the program's own stack formatting — V8's string form read for LOCATIONS only (a name there cannot be told from the text around it), repo-relative, no absolute path: ${pl}`, pr.lines);
  const sc = await run({ plan: 'stopcont' }, { onReady: (c) => { setTimeout(() => { try { process.kill(c.pid, 'SIGSTOP'); } catch { } setTimeout(() => { try { process.kill(c.pid, 'SIGCONT'); } catch { } }, 1300); }, 100); } });
  const sl = holdLines(sc).find((l) => /not running \(stopped, frozen or blocked\)/.test(l));
  ok(sl && /^\[loop-hold\] the main loop was held 1\.[0-5](–1\.[0-5])? s — not running \(stopped, frozen or blocked\): the main thread ran 0\.0 s of the 1\.\d s measured/.test(sl), `condition 9: a process stopped 1.3 s (SIGSTOP / SIGCONT — a paused container or VM) ⇒ the fifth verdict, not running: ${sl}`, sc.lines);
  const op = await run({ plan: 'openPort' });
  const said = op.lines.filter((l) => l.startsWith('[loop-hold] a debugger port is open')), ol = holdLines(op)[0];
  ok(said.length === 1 && ol && /not sampled \(a debugger is attached\)/.test(ol), `condition 4: a loopback port opened at RUN time (inspector.open) — the main thread's beat says it once, the sampler stands down: ${ol}`, op.lines);
  const st = await run({ plan: 'stopNoLine' });
  const sampled = holdLines(st).some((l) => / \d samples?: busyHog/.test(l));
  ok(sampled && st.code === 0 && st.err.includes('[kid] an ordinary stop') && !st.err.includes('Waiting for the debugger'), 'condition 5: after a SAMPLED hold, an ordinary stop (process.exit) prints no «Waiting for the debugger to disconnect…» — the session lives only while the hold does', st.err.slice(-400));
  const ds = await run({ plan: 'deepSoak', beatMs: 1, profileEveryMs: 1, profileMs: 2500 }, { timeoutMs: 60000 });
  const k = (ds.out && ds.out.checks) || {}, pl2 = ds.out && ds.out.report.profile.last;
  const deepN = pl2 ? (pl2.top.find((x) => x.frame === LH_KEYS_DEEP) || { n: 0 }).n : 0;
  ok(k.max > 1000 && k.spun >= 15 && k.bad === 0 && k.after && k.after.p && k.after.l && k.after.typeofStack === 'string' && pl2 && pl2.samples >= 1000 && deepN > 0,
    `condition 1: 21 depths from the stack limit down 400 frames (max ${k.max}) under ${pl2 && pl2.samples} samples (one a ms; ${deepN} answered «the stack was nearly full», the rest in frames): Error.prepareStackTrace / stackTraceLimit never seen changed, identical after, err.stack still a string`, { k, pl2 });
  const hr = await run({ plan: 'heapRefuse', fakeHeap: 0.9 });
  const rf = hr.out && hr.out.checks.refusal;
  ok(rf && rf.ok === false && rf.error === 'heap_near_limit', `condition 6: heap used at 90 % of its limit ⇒ the profile is REFUSED by name (${JSON.stringify(rf)})`);
  const hs = await run({ plan: 'heapStop', heapHighAfterMs: 1100 });
  const hl = hs.out && hs.out.report.profile.last, hline = hs.lines.find((l) => l.startsWith('[loop-hold] profile of'));
  ok(hl && hl.stopped === 'heap' && hl.samples > 0 && / — It stopped early: the server’s memory neared its limit\.$/.test(hline || ''), `condition 6: the heap passing 85 % while a profile runs ⇒ it stops by itself, said: ${hline}`, hl);
}

// ── ⑪ ROUND 3 (d174ac207: six laws, each against the red control the verifiers measured) ──────────────────────────────
const within = (h, truth, slack = 6) => h && truth >= h.ms - slack && truth <= (h.msHi != null ? h.msHi : h.ms) + slack;
async function legRound3(node, tag) {
  console.log(`⑪ round 3 (${tag})`);
  // (1) «NATIVE» ONLY FROM A SAMPLE THAT LANDED INSIDE: a pure JavaScript hog whose watchdog wakes in its last ms (the
  // watchdog's own procfs read blocked on a FIFO until then) — round 2 said «native code or garbage collection» there
  { const res = [];
    const D = String(process.env.VS_LH_LATE_D || '').split(',').filter(Boolean).map(Number);
    for (const d of D.length ? D : LATE_D) {   // the FIFO's reader is let through ~0.1 s after its release starts (the feeder's close): its next check — and its ask — lands in the hog's last ms
      const r = await run({ plan: 'lateJs', fifo: true, fifoAt: 350, blockS: (680 + d) / 1000, hogAt: 500, hogMs: 300 }, { node });
      const hs = (r.out && r.out.report.holds) || [], truth = r.out && r.out.checks.truth ? r.out.checks.truth.end - r.out.checks.truth.start : null;
      const how = (l) => (/ — JavaScript: /.test(l) ? 'JS inside' : / — on the CPU — JavaScript or native code, no sample of that part/.test(l) ? 'on the CPU, an asleep sample' : /no sample landed inside it — asked/.test(l) ? 'asked, ' + ((/the answer came (at its end|after it)/.exec(l) || [, 'no answer'])[1]) : /the watchdog was not running either|none of its checks came after/.test(l) ? 'unseen' : l.slice(0, 80));
      res.push({ d, verdicts: hs.filter((h) => !(r.starve || []).some((y) => y.h === h && y.outside)).map((h) => h.verdict), how: holdLines(r).map(how).join('+'), contains: hs.length ? hs.every((h) => within(h, truth)) : null, truth, lines: holdLines(r) });
    }
    const native = res.filter((x) => x.verdicts.includes(LH.V.native));
    const okv = res.every((x) => x.verdicts.length && x.verdicts.every((v) => v === LH.V.js || v === LH.V.unsampled || v === LH.V.cpu));
    ok(!native.length && okv && res.every((x) => x.contains !== false),
      `(1) a JavaScript hog whose watchdog wakes in its last ms (${res.length} runs, d = ${Math.min(...res.map((x) => x.d))} … +${Math.max(...res.map((x) => x.d))} ms): never «native» — JavaScript when a sample landed inside, else «on the CPU in user mode … not sampled» with the asks said; every held range contains the truth (${res.map((x) => x.how).join(' · ')})`, res.filter((x) => native.includes(x) || !x.verdicts.length || x.contains === false)); }
  // (2) EVERY LENGTH FROM A CLOCK THAT CANNOT STEP: the wall clock stepped by ±2 s and ±1 h in the main thread, the watchdog, both — an idle loop
  { const bad = [];
    for (const by of [2000, -2000, 3600000, -3600000]) for (const side of ['main', 'worker', 'both']) {
      const r = await run({ plan: 'idleStep', record: true, idleMs: 1400 }, { node, args: ['-r', STEPPER], env: { STEP_SIDE: side, STEP_BY: String(by), STEP_AT: '700' } });
      const rep = r.out && r.out.report, metric = ((r.out && r.out.checks.recs) || []).filter((e) => e.name === 'srv-loop-hold-ms');
      if (!rep || rep.holds.length || rep.table.length || metric.length || holdLines(r).length) bad.push({ by, side, holds: rep && rep.holds.map((h) => h.line), metric });
    }
    ok(!bad.length, '(2) the date stepped +2 s, −2 s, +1 h, −1 h — in the main thread, in the watchdog, in both (12 runs, an idle loop): no hold, no table row, no metric', bad);
    const r = await run({ plan: 'monoAcrossStep', record: true }, { node, args: ['-r', STEPPER], env: { STEP_SIDE: 'both', STEP_BY: '3600000', STEP_AT: '650' } });
    const hs = (r.out && r.out.report.holds) || [], truth = r.out && r.out.checks.truthMs;
    ok(hs.length === 1 && within(hs[0], truth) && hs[0].verdict === LH.V.js, `(2) a real ${truth && truth.toFixed(0)} ms hold across a +1 h step of the date in both threads: ONE hold of ${hs[0] && hs[0].ms}–${hs[0] && hs[0].msHi} ms (its range contains the truth), dated once`, hs.map((h) => [h.at, h.ms, h.msHi, h.line])); }
  // (3) A SAMPLE COSTS THE HELD PROGRAM NOTHING IT KEEPS: main-thread heap per REAL evaluate (counted at the sample's own first call)
  { const r = await run({ plan: 'heapEvals', beatMs: 1, profileEveryMs: 1, countEvals: true, want: 2200, profileMs: 20000 }, { node, args: ['--expose-gc'], timeoutMs: 60000 });
    const k = (r.out && r.out.checks) || {}, per = k.realEvals ? (k.h1 - k.h0) / k.realEvals : null;
    ok(k.realEvals >= 2000 && per != null && per <= HEAP_PER_EVAL_B, `(3) ${k.realEvals} REAL evaluates (counted at the sample's own first call, forced collections before and after): the main thread's heap moved ${per != null ? per.toFixed(0) : '?'} B per evaluate (bound ${HEAP_PER_EVAL_B} B; round 2's text new at each ask kept ~3 500 B)`, k); }
  // (4) A PROFILE THAT RAN IS NEVER «LOST»: 600 functions in one long-named module, rotated through a profile
  { const r = await run({ plan: 'manyLocations', beatMs: 10, profileEveryMs: 10, profileMs: 3000, lostAfterMs: 1000 }, { node, timeoutMs: 40000 });
    const p = r.out && r.out.report.profile, l = p && p.last, sum = l ? Math.round(10 * (l.idlePct + l.betweenPct + l.noJsPct + l.notSampledPct + l.top.reduce((a, x) => a + x.pct, 0))) / 10 : null;
    ok(l && !l.refused && !p.running && l.samples >= 100 && l.locations >= 100 && l.top.some((x) => x.other) && sum === 100,
      `(4) a profile over ${l && l.locations} distinct locations of one long-named module: its result kept (${l && l.samples} samples, the top ${l && l.top.length - 1} + «(other)», shares summing to ${sum} %) — never «running» past its end, never «lost»`, p); }
  // (5) THE LINE NAMES THE CAUSE THAT STOPPED IT: a debugger port opened while a profile runs
  { const r = await run({ plan: 'stopDebugger' }, { node });
    const l = r.out && r.out.report.profile.last, pl = r.lines.find((x) => x.startsWith('[loop-hold] profile of'));
    const dw = (LH.PROFILE_STOPPED || {}).debugger;   // (a red control runs these legs against an older tree: no table there)
    ok(l && dw && l.stopped === 'debugger' && l.stoppedWords === dw && !/memory/.test(l.stoppedWords) && pl && (pl.endsWith(' — ' + dw) || pl.endsWith(' — ' + dw + ' — ' + (LH.PROFILE_UNSAMPLED || {}).debugger)),
      `(5) a profile stopped by a debugger says so — in the result Diagnostics shows and in the journal line, the same sentence: ${pl}`, l); }
  // (6) NO NAME THE REPO'S OWN SOURCE DOES NOT SPELL AT THAT PLACE — the verifiers' three plants beside four honest names
  { const r = await run({ plan: 'names', record: true }, { node, timeoutMs: 40000 });
    const rep = r.out && r.out.report, all = JSON.stringify({ lines: r.lines, table: rep && rep.table, holds: rep && rep.holds, recs: r.out && r.out.checks.recs });
    const hl = holdLines(r);
    ok(rep && !/sk_live|john|smith/i.test(all) && !all.includes('src/loop-hold.js:77'),
      '(6) a vm script compiled under a REAL repo file\'s name, a repo function named by a runtime value (a computed key), and an outside name planting a repo location line in the string form: no outside name and no planted culprit in the journal, the ring, the table or the telemetry', hl);
    const rows = (rep && rep.table) || [], computedRows = rows.filter((x) => /^src\/hogs\.js:\d+$/.test(x.frame));
    ok(hl.some((l) => /samples?: [^;]*\bsrc\/loop-hold\.js:1 ← /.test(l)) && hl.some((l) => /samples?: [^;]*\bserver\.js:1 ← /.test(l)) && hl.filter((l) => /samples?: [^;]*\bsrc\/hogs\.js:\d+ ← computedSelf \(src\/hogs\.js:\d+\)/.test(l)).length === 2 && computedRows.length >= 1 && computedRows.every((x) => x.count === 2) && hl.some((l) => l.includes(LH.WORDS.formatting)),
      '(6) …said by LOCATION alone (the vm scripts at src/loop-hold.js:1 / server.js:1, the computed-key function at its line), and the planted string form as «frames unreadable (inside the program\'s own stack formatting)»', hl);
    ok(['member', 'arrowHog', 'methodHog', '\\(anonymous\\)'].every((n) => hl.some((l) => new RegExp(`${n} \\(src/hogs\\.js:\\d+\\)`).test(l))),
      '(6) HONEST NAMES STAY: a class member, an arrow assigned to a const, a method, an anonymous function — each a real repo function whose name its own line spells', hl.filter((l) => /member|arrowHog|methodHog|anonymous/.test(l))); }
  // (7) NO DEBUGGER LINE: a sync child held the loop and the process exited right after it — swept across the ask (round 2: 28 of 56 inside the session's 50 ms)
  { const hits = [];
    for (let x = 90; x <= 220; x += 10) { const r = await run({ plan: 'exitNativeX', x }, { node }); if (/Waiting for the debugger/.test(r.err)) hits.push(x); }
    ok(!hits.length, `(7) a sync child of X ms (X = 90 … 220, across the ask at ~100 ms and its old 50 ms window) then process.exit(): «Waiting for the debugger to disconnect…» 0 of 14 — an ask of a main thread asleep in a call keeps NO session`, hits); }
  // (8) THE PRESS: a debugger port opened in the same tick, and a watchdog that died
  { const r = await run({ plan: 'pressSameTick' }, { node });
    const pr = r.out && r.out.checks.press;
    ok(pr && pr.ok === false && pr.error === 'debugger_attached', `(8) a press in the same tick a debugger port opened: refused AT the press by name (${JSON.stringify(pr)}) — never a success toast then nothing`);
    const d = await run({ plan: 'deadPress' }, { node });
    const k = (d.out && d.out.checks) || {};
    ok(k.mid && !k.mid.running && k.mid.last && k.mid.last.refused === 'lost' && k.press2 && k.press2.error === 'no_watchdog',
      `(8) the watchdog died 0.2 s into a 3 s profile: at once «lost — the watchdog thread stopped» (never «running» for the profile's length + 30 s), and a second press is refused no_watchdog`, k); }
  // (10, 13a) TWO HOLDS WHILE THE WATCHDOG SLEPT: both said (the main thread's gap ring loses none), each dated at its own gap's end, each range containing the truth
  { const r = await run({ plan: 'twoUnseen', fifo: true, blockS: 1.3, at1: 300, at2: 750 }, { node });
    const hs = ((r.out && r.out.report.holds) || []).slice().reverse(), tw = (r.out && r.out.checks.truth) || [];
    const dated = hs.map((h, i) => (tw[i] ? Math.abs(h.at - tw[i].start) : null));
    ok(hs.length === 2 && tw.length === 2 && hs.every((h) => /not sampled \(the watchdog was not running either\)/.test(h.line)) && dated.every((x) => x != null && x <= 60) && hs.every((h, i) => within(h, tw[i].end - tw[i].start)),
      `(10) two holds while the watchdog slept 1.3 s: both said (round 2's handshake kept only the largest), each dated at its own gap (${dated.map((x) => (x == null ? '?' : x.toFixed(0) + ' ms')).join(', ')} from the truth), each range containing it`, { holds: hs.map((h) => [h.at, h.ms, h.msHi]), truth: tw }); }
}

// ── ⑫ ROUND 4: A SAMPLE SPEAKS FOR WHERE THE THREAD WAS WHEN IT WAS ASKED — the two live sweeps (the verifiers' shapes) ──
// ── ROUND 5 (law B): THE VERDICT NEVER CONTRADICTS THE SCHEDULER'S WINDOW — a native JSON.parse on Node 24 (round 4: 23 of 65
//    read «in the kernel (blocked) … asleep: futex_do_wait» beside «the main thread ran 1.4 s of the 1.7 s measured»): ≥ 30
//    parse holds, none «blocked» — an ask that landed while the thread joined V8's collection helpers is a sample, never the hold
async function legRound5(node, tag) {
  console.log(`⑭ round 5 — law B: the window says how much, a sample says where (${tag})`);
  const say = (x) => console.log('  · ' + x);
  const lines = [];
  for (let i = 0; i < 3 && lines.length < 30; i++) { const r = await run({ plan: 'jsonMany', n: 12 }, { node, timeoutMs: 60000 }); lines.push(...holdLines(r).filter((l) => /afterParse|jsonHog/.test(l) || / — /.test(l))); }
  const by = {}; for (const l of lines) { const v = (/ — ([^:]+?)(?: for \d|: )/.exec(l) || [, '?'])[1]; by[v] = (by[v] || 0) + 1; }
  const blocked = lines.filter((l) => /^\[loop-hold\] the main loop was held [\d.–]+ s — in the kernel \(blocked\)/.test(l));
  const asleepSeen = lines.filter((l) => /asleep: /.test(l)).length;
  say(`(law B) ${tag}: ${lines.length} parse holds — ${Object.entries(by).map(([v, n]) => `${n} × «${v}»`).join(', ')}; ${asleepSeen} carried an asleep sample (printed as a sample)`);
  ok(lines.length >= 30 && !blocked.length, `(law B) ${tag}: ${lines.length} JSON.parse holds — none «in the kernel (blocked)» (an asleep sample of a hold the window says RAN never names it; ${asleepSeen} carried one)`, blocked.slice(0, 3));
  return { holds: lines.length, by, asleepSeen };
}
/** (A) THE SWEEP: pbkdf2 / JSON.parse followed by a JavaScript tail of 0 / 5 / 50 ms IN THE SAME FUNCTION, one ask a hold;
 *  its POST (stamped in the watchdog's own thread) against the native call's own end: x = end − post; `gc`: a collection in
 *  the ask's window by the child's OWN record. `sets` narrows it (the mutants' legs). */
async function sweepA(node, tag, tree = null, sets = null) {
  const A = [];
  for (const [kind, ns, tails] of sets || [['pbkdf2', [90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190], [0, 5, 50]], ['json', [105, 120, 135, 150], [0, 5, 50]]]) for (const tail of tails) {
    const r = await run({ plan: 'nativeSweep', kind, tail, ns, samplesPerHold: 1, cap: 100, tree }, { node, args: ['-r', SWEEP_PRE], env: { LH_POSTWATCH: '1' }, timeoutMs: 90000 });
    const c = r.out && r.out.checks;
    if (!c || !c.runs) { ok(false, `(A) ${kind}, tail ${tail} ms: the child answered (${tag})`, r.err.slice(-800)); continue; }
    const holds = r.out.report.holds || [];
    for (const x of c.runs) {
      const post = c.posts.find((p) => p.at >= x.start - 25 && p.at <= x.end);
      const h = holds.find((y) => y.at >= x.wall - 60 && y.at <= x.wall + 10);
      const sv = h && r.starve ? r.starve.find((y) => y.h === h) : null;
      // THE ASK'S LATENCY WINDOW, from the hog's own timing: posted while the native call ran it lands at the first
      // JavaScript after it — [post, nativeEnd + JS_FAST_MS + 1]; posted inside the tail it answers within JS_FAST_MS unless
      // something holds it — [post, post + JS_FAST_MS + 1]; a collection inside it, by the child's OWN record
      const winEnd = post ? Math.max(post.at, post.at < x.nativeEnd ? x.nativeEnd : post.at) + LH.JS_FAST_MS + 1 : null;
      const gc = !!post && (c.gcs || []).some(([gs, gd]) => gs < winEnd && gs + gd > post.at);
      // B-1409: the ask's kernel state AT THE POST, as the product's own line says it — an ask posted ASLEEP (state S / D) is
      // not on the product's road to «native» (that road is an ask posted in state R) and stays out of the strict set
      const asleepAsk = !!(h && h.line && /(?:samples?|where it was \(\d+ samples?\)): [^;]*\basleep(?:: | at the ask)/.test(h.line));
      A.push({ kind, tail, N: x.N, x: post ? +(x.nativeEnd - post.at).toFixed(2) : null, verdict: h ? h.verdict : null, line: h ? h.line : null, outside: !!(sv && sv.outside), gc, asleepAsk });
    }
  }
  return A;
}
async function legRound4(node, tag, tree = null) {
  console.log(`⑫ round 4 — the two sweeps (${tag}${tree ? ', the tree ' + tree + ': a REPORT' : ''})`);
  const say = (x) => console.log('  · ' + x);
  // (A) pbkdf2 / JSON.parse followed by a JavaScript tail of 0 / 5 / 50 ms IN THE SAME FUNCTION, one ask a hold; its POST
  //     (stamped in the watchdog's own thread) against the native call's own end: x = end − post
  let A = await sweepA(node, tag, tree);
  const fast = LH.JS_FAST_MS;
  // THE COLLECTOR, BY THE CHILD'S OWN RECORD (主开发's ruling 08:30Z): a hold whose ask's LATENCY window (sweepA) holds a
  // collection leaves (A)'s two strict legs and its sentence is ASSERTED to be one of the TRUE forms for that case;
  // a hold the record shows no collection for stays strict. THE FLOOR: STRICT_FLOOR of (A)'s judged holds strict AND at
  // least 3 strict asks in the tail — measured, the record took 48–52 % of the judged holds here (JSON.parse allocates its
  // result, pbkdf2 its buffers: a collection inside a 15–20 ms native window is common); under it the sweep runs ONCE more,
  // then it is red by name «the collector took the suite». «Never JavaScript» holds for BOTH kinds in native code (the
  // collection's true forms exclude it): the count floors (8 asks, 6 of them 5–55 ms) are over all of them
  const STRICT_FLOOR = 0.25;
  const judged = (a) => a.x != null && a.verdict && !a.outside;
  const strictShare = (L) => { const j = L.filter(judged); const tail = j.filter((a) => !a.gc && a.x <= -1 && a.tail + a.x >= 2).length; return j.length && tail >= 3 ? j.filter((a) => !a.gc).length / j.length : 0; };
  let rerunA = false;
  if (!tree && strictShare(A) < STRICT_FLOOR) { rerunA = true; say(`(A) the collector took ${A.filter((a) => judged(a) && a.gc).length} of ${A.filter(judged).length} judged holds (under the floor ${100 * STRICT_FLOOR} % strict) — the sweep runs once more`); A = await sweepA(node, tag, tree); }
  // B-1409: THE COUNT FLOORS (8 asks inside the native call, 6 of them 5–55 ms before its end) — the watchdog thread
  // itself can be late on a box of two shared cores (its asks land in the tail): the sweep runs AGAIN, at most twice,
  // its holds added, until the floors are met; else the count is a named, counted SKIP (the laws on what was asked still run)
  const inNativeOf = (L) => L.filter((a) => a.x != null && a.x >= LH.JS_FAST_MS + 1 && a.verdict && !a.outside && !a.asleepAsk);
  const floorOf = (L) => { const nat = inNativeOf(L); return { n: nat.length, band: nat.filter((a) => a.x >= 5 && a.x <= 55).length }; };
  let fl = floorOf(A), extraA = 0;
  while (!tree && (fl.n < 8 || fl.band < 6) && extraA < 2) { extraA++; say(`(A) ${fl.n} of 8 asks posted inside the native call (${fl.band} of 6 in 5–55 ms) — the watchdog was late on this box: the sweep runs again (${extraA} of 2), its holds added`); A = A.concat(await sweepA(node, tag, tree)); fl = floorOf(A); }
  if (!tree) ok(strictShare(A) >= STRICT_FLOOR, `(A) ${tag}: the collector took the suite? ${A.filter((a) => judged(a) && a.gc).length} of ${A.filter(judged).length} judged holds had a collection in the ask's window by the child's own record — ${Math.round(100 * strictShare(A))} % judged strictly (the floor ${100 * STRICT_FLOOR} %${rerunA ? '; after ONE rerun' : ''})`);
  const gcHolds = A.filter((a) => judged(a) && a.gc);
  const gcNative = gcHolds.filter((a) => a.x >= fast + 1), gcTail = gcHolds.filter((a) => a.x <= -1 && a.tail + a.x >= 2);
  const TRUE_NATIVE = [LH.V.native, LH.V.cpu], TRUE_TAIL = [LH.V.js, LH.V.native, LH.V.cpu];
  const gcLies = [...gcNative.filter((a) => !TRUE_NATIVE.includes(a.verdict)), ...gcTail.filter((a) => !TRUE_TAIL.includes(a.verdict))];
  say(`(A) the child's own record: ${gcHolds.length} of ${A.filter(judged).length} judged holds had a collection in the ask's window — ${gcNative.length} posted in native code, ${gcTail.length} in the tail — judged by their TRUE forms`);
  if (!tree) ok(!gcLies.length, `(A) ${tag}: a hold with a collection in its ask's window (the child's own record) says one of its TRUE forms — posted in native code: «${LH.V.native}» or «${LH.V.cpu}»; posted in the JavaScript tail: those or «${LH.V.js}» (${gcNative.length} + ${gcTail.length} holds)`, gcLies.slice(0, 3));

  // THE STRICT LEGS: the holds the box did not starve AND the child's own record shows no collection for
  const inNative = A.filter((a) => a.x != null && a.x >= fast + 1 && a.verdict && !a.outside && !a.gc && !a.asleepAsk), inTail = A.filter((a) => a.x != null && a.x <= -1 && a.tail + a.x >= 2 && a.verdict && !a.outside && !a.gc);
  say(`(A) the box starved ${A.filter((a) => a.outside).length} of ${A.length} holds («waiting for a CPU», the suite's own count agreeing) — outside the asks' law`);
  const wrongJs = inNative.filter((a) => a.verdict !== LH.V.native), wrongTail = inTail.filter((a) => a.verdict !== LH.V.js);
  const nativeAll = [...inNative, ...gcNative.filter((a) => !a.asleepAsk)], saidJs = nativeAll.filter((a) => a.verdict === LH.V.js);   // never «JavaScript», strict or not
  const named = inNative.filter((a) => a.tail >= 5), namedOk = named.filter((a) => /the first JavaScript after it: [^;]*\b(pbkdfHog|parseHog) \(src\/hogs\.js:\d+\)/.test(a.line || ''));
  const xs = inNative.map((a) => a.x);
  say(`(A) ${A.length} holds: asked while the native call ran (x = ${xs.length ? Math.min(...xs).toFixed(1) : '–'}…${xs.length ? Math.max(...xs).toFixed(1) : '–'} ms before its end) ${inNative.length} — ${inNative.length - wrongJs.length} «native», ${inNative.filter((a) => a.verdict === LH.V.js).length} «JavaScript»; asked inside the tail ${inTail.length} — ${inTail.length - wrongTail.length} «JavaScript»`);
  if (!tree) {
    const floorMet = nativeAll.length >= 8 && nativeAll.filter((a) => a.x >= 5 && a.x <= 55).length >= 6;
    if (!floorMet) skip(`(A) ${tag}: the count floor (8 asks inside the native call, 6 of them 5–55 ms)`, `the watchdog was late on this box: ${nativeAll.length} of 8 asks inside the native call (${nativeAll.filter((a) => a.x >= 5 && a.x <= 55).length} of 6 in 5–55 ms) after ${1 + extraA} sweeps`);
    ok(!saidJs.length && !wrongJs.length, `(A) ${tag}: an ask POSTED while pbkdf2 / JSON.parse still ran (${nativeAll.length} holds, x from ${fast + 1} ms up, ${nativeAll.filter((a) => a.x >= 5 && a.x <= 55).length} in the verifiers' 5–55 ms) is never «JavaScript», whatever the tail (0 / 5 / 50 ms) — the ${inNative.length} with NO collection in its window (the child's own record) «native code or garbage collection» exactly, the ${gcNative.length} with one a TRUE form`, [...saidJs, ...wrongJs].slice(0, 3));
    if (!named.length) skip(`(A) ${tag}: the late answer's «first JavaScript after it»`, 'the watchdog was late on this box: no ask inside the native call with a tail ≥ 5 ms');
    else ok(namedOk.length >= Math.ceil(0.8 * named.length), `(A) ${tag}: its late answer names the tail as «the first JavaScript after it: … pbkdfHog / parseHog (src/hogs.js:…)» — the chain from the first frame that ran (${namedOk.length} of ${named.length})`, named.filter((a) => !namedOk.includes(a)).slice(0, 2));
    ok(inTail.length >= 3 && !wrongTail.length, `(A) ${tag}: an ask posted INSIDE the JavaScript tail (${inTail.length} holds) is «JavaScript» — the law cuts both ways`, wrongTail.slice(0, 3));
  }
  // (B) the MIXED hold: 0.75 s of JavaScript then 0.75 s in a sync child, the watchdog's thread starting D ms into it (its
  //     scheduler window then covers less than half the hold from D = 750 on — round 3's regression said «native» there)
  const B = [];
  for (const D of [400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300]) {
    const r = await run({ plan: 'mixedLate', jsMs: 750, childS: 0.75, tree }, { node, args: ['-r', SWEEP_PRE], env: { LH_WORKER_DELAY_MS: String(D + 150), LH_POSTWATCH: '1' }, timeoutMs: 30000 });
    const c = r.out && r.out.checks;
    if (!c || !c.run) { ok(false, `(B) D = ${D}: the child answered (${tag})`, r.err.slice(-800)); continue; }
    const st = (c.evs || []).find((e) => e.ev === 'workerStart'), h = (r.out.report.holds || []).find((y) => y.at >= c.run.wall - 60 && y.at <= c.run.wall + 10);
    // B-1409 follow-up: the hold's asks (posted from its start to its end) against the sync child's OWN stamps — an ask
    // posted before the child began, or within JS_FAST_MS of its end, can be answered by the JavaScript around it
    const { holdStart, end, childStart: c0, childEnd: c1 } = c.run;
    const asks = (c.evs || []).filter((e) => e.ev === 'post' && e.at >= holdStart && e.at <= end + 50).map((e) => Math.round(e.at - holdStart));
    const outside = c0 == null || c1 == null ? asks : asks.filter((x) => x + holdStart < c0 || x + holdStart > c1 - LH.JS_FAST_MS);
    B.push({ D, measured: st ? Math.round(st.at - holdStart) : null, verdict: h ? h.verdict : null, line: h ? h.line : null, asks, outside, child: c0 == null ? null : [Math.round(c0 - holdStart), Math.round(c1 - holdStart)] });
  }
  say(`(B) ${B.map((b) => `D ${b.measured}: ${b.verdict || 'no hold'} (asks ${b.asks.join('/') || 'none'}, the child ${b.child ? b.child.join('–') : '?'} ms)`).join(' · ')}`);
  if (!tree) {
    const started = B.filter((b) => b.measured != null && b.measured >= 800 && b.measured <= 1400);
    // B-1409 follow-up: the leg judges only the runs whose asks ALL landed inside the child's own stamps — a late watchdog
    // on a loaded box also asks after the child ended, where node's own JavaScript answers (a release gate's D 921 on
    // Node 24: two asks answered by undici's lazy load, «JavaScript» 2 : 1) — the rest a NAMED, COUNTED skip like (A)'s
    const child = started.filter((b) => b.asks.length && !b.outside.length), unjudged = started.filter((b) => !child.includes(b));
    ok(B.length === 10 && B.every((b) => b.verdict && b.verdict !== LH.V.native), `(B) ${tag}: the mixed hold is never «native code or garbage collection», wherever the watchdog started (D = 400…1300 ms)`, B.filter((b) => !b.verdict || b.verdict === LH.V.native).slice(0, 2));
    if (unjudged.length) skip(`(B) ${tag}: ${unjudged.length} of ${started.length} runs whose watchdog started inside the sync child`, `the watchdog was late on this box: an ask outside the child's own stamps — ${unjudged.map((b) => `D ${b.measured}: asks at ${b.asks.join('/') || 'none'} ms, the child ${b.child ? b.child.join('–') : '?'} ms`).join('; ')}`);
    if (child.length < 4) skip(`(B) ${tag}: the count floor (4 runs with every ask inside the sync child)`, `the watchdog was late on this box: ${child.length} of 4`);
    if (child.length) ok(child.every((b) => b.verdict === LH.V.blocked && /asleep: \S/.test(b.line || '')), `(B) ${tag}: the watchdog started inside the sync child (${child.length} runs, every ask inside the child's own stamps, its window covering less than half the hold) ⇒ «in the kernel (blocked)» with the wait channel the ask found`, child.filter((b) => b.verdict !== LH.V.blocked || !/asleep: \S/.test(b.line || '')).slice(0, 2));
  }
  // (C) MUST 2 — THE WATCHDOG'S OWN FILE READS NEVER DELAY A CHECK: every read of a repo source takes 300 ms (sync or async,
  //     in the watchdog's own thread); a 700 ms hold is asked at held ≈ 100, 200, 400 ms ON TIME, the next hold too, and
  //     the frames whose files were not read are said by location, with why
  const C = await run({ plan: 'slowNames', tree }, { node, args: ['-r', SWEEP_PRE], env: { LH_POSTWATCH: '1', LH_SLOW_SRC_MS: '300', LH_SLOW_ROOT: ROOT }, timeoutMs: 30000 });
  const cc = C.out && C.out.checks;
  const lag = cc ? cc.holds.map((x) => cc.posts.filter((p) => p.at >= x.start - 25 && p.at <= x.end).map((p) => Math.round(p.at - x.start))) : [];
  const lines = cc ? (C.out.report.holds || []).map((y) => y.line) : [];
  say(`(C) the asks of the two holds, ms after each began: ${JSON.stringify(lag)}; ${lines.filter((l) => /said by location alone/.test(l)).length} of ${lines.length} lines say frames by location`);
  if (!tree) {
    const due = [100, 200, 400], first = lag[0] || [];
    ok(!!cc && first.length >= 3 && due.every((d, i) => first[i] != null && first[i] <= d + 60) && (lag[1] || [])[0] != null && lag[1][0] <= 160, `(C) ${tag}: with every source read taking 300 ms, the 700 ms hold is asked at ${first.join(' / ')} ms (due 100 / 200 / 400 + one check) and the next hold at ${(lag[1] || [])[0]} ms — no read delays a check`, { lag, err: C.err.slice(-400) });
    ok(lines.length >= 2 && lines.every((l) => /said by location alone \((the source files answered slowly|the time for reading names was spent)/.test(l)) && lines.every((l) => /src\/hogs\.js:\d+/.test(l) && !/busyHog \(src\/hogs/.test(l)),
      `(C) ${tag}: their frames are said by location alone (src/hogs.js:…, no name), and the line says why`, lines.slice(0, 2));
  }
  // (D) THE NAME ROADS (9): a name only inside a string on its line; a vm script under a repo path that is a symlink leading
  //     OUT of the repo; a vm script calling itself «node:internal/…»
  const outside = path.join(os.tmpdir(), `lh-outside-${process.pid}.js`); fs.writeFileSync(outside, 'function outsideHog() {}\n');
  const linkOut = path.join(ROOT, 'src', 'link-out.js'); try { fs.unlinkSync(linkOut); } catch { } fs.symlinkSync(outside, linkOut);
  const D = await run({ plan: 'nameRoads', tree, linkOut }, { node, timeoutMs: 30000 });
  try { fs.unlinkSync(linkOut); fs.unlinkSync(outside); } catch { }
  const dl = D.out ? (D.out.report.holds || []).slice().reverse().map((y) => y.line) : [];
  say(`(D) ${dl.map((l) => (/: (?:\d+ samples?|where it was[^:]*): ([^;]*)/.exec(l) || [])[1] || l.slice(0, 120)).join(' · ')}`);
  if (!tree) {
    ok(dl.length === 3 && /src\/hogs\.js:\d+/.test(dl[0]) && !/strHog/.test(dl[0]), `(D) ${tag}: a name V8 took from a computed key whose own line spells it only INSIDE a string is said by its location alone`, dl[0]);
    ok(dl.length === 3 && /\(outside the repo\)/.test(dl[1]) && !/outsideHog|link-out/.test(dl[1]), `(D) ${tag}: a repo path that is a symlink leading OUT of the repo is «(outside the repo)» — no name, no path`, dl[1]);
    ok(dl.length === 3 && /node:internal\/forged/.test(dl[2]) && !/forgedInternal/.test(dl[2]), `(D) ${tag}: a vm script named «node:internal/forged» is said by its location alone — never with its name`, dl[2]);
  }
  // (E) THE HEAP THAT FILLS (3), with REAL heap statistics: a process under --max-old-space-size=96 filled to 88 % of its OLD
  //     generation — the press is refused by name (round 3 judged 85 % of heap_size_limit, 288 MB on Node 24: never reached)
  // round 5: 96 MB ran Node 24 out of memory at 86 % in the gate (its own allocation room is a fixed few MB) — 160 MB, the same share
  const E = await run({ plan: 'heapFill', tree }, { node, args: ['--max-old-space-size=160'], timeoutMs: 30000 });
  const eh = E.out && E.out.checks && E.out.checks.heap;
  say(`(E) ${eh ? `old generation ${eh.usedMb} of ${eh.limitMb} MB used (heap_size_limit ${eh.heapSizeLimitMb} MB) — the press: ${JSON.stringify(eh.press)}` : 'no answer: ' + E.err.split('\n').filter((l) => /FATAL|heap|Error/.test(l)).slice(0, 3).join(' | ').slice(0, 400)}`);
  if (!tree) ok(!!eh && eh.limitMb === 160 && eh.press && eh.press.error === 'heap_near_limit', `(E) ${tag}: filled to 86 % of a 160 MB old generation, the press is refused «heap_near_limit» — the process stays alive`, eh);
  return { A, B, C: lag, D: dl, E: eh };
}

// ── ⑬ ROUND 4 (11): THE NEAR-LIMIT SENTENCE, RE-MEASURED — the near-heap-limit ramp (--max-old-space-size=96, the retained
//     set grows 100 × ~20 KB a step with 300 ms of churn) with and without the watchdog at default, INTERLEAVED, ≥ 10 runs a
//     side a Node; the last step each reached. NOT in the gate (≈ 130 cpu-s a Node): VS_LH_LEGS=ramp, its own claim ──
const RAMP = path.join(ROOT, 'ramp.cjs');
fs.writeFileSync(RAMP, `'use strict';
const fs = require('fs'); const [TREE, cond] = process.argv.slice(2);
if (cond === 'watchdog') require(TREE + '/src/server/sync-fs-witness.js').create({ rootDir: TREE, armed: true, readMountinfo: () => '', fresh: true, log: { warn() {}, log() {} } }).start();
const keep = []; let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
const mk = (kb) => { const a = new Array(kb * 8); for (let i = 0; i < a.length; i++) a[i] = { i, s: 'v' + (i & 1023) }; return a; };
let step = 0;
setTimeout(() => { const tick = () => { for (let k = 0; k < 100; k++) keep.push(mk(64)); const t = Date.now(); while (Date.now() - t < 300) { const j = rnd() % keep.length; keep[j] = mk(16); }
  fs.writeSync(1, (++step) + '\\n'); if (step > 60) process.exit(0); setTimeout(tick, 120); }; setTimeout(tick, 200); }, 300);
`);
async function legRamp(node, tag, runs = 10, tree = REPO) {
  console.log(`⑬ round 4 (11) — the near-limit ramp, ${runs} interleaved runs a side (${tag})`);
  const one = (cond) => new Promise((r) => { const c = spawn(node, ['--max-old-space-size=96', RAMP, tree, cond], { stdio: ['ignore', 'pipe', 'ignore'], env: { PATH: process.env.PATH, HOME: process.env.HOME } }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => { const st = o.trim().split('\n').filter(Boolean); r(Number(st[st.length - 1]) || 0); }); });
  const res = { none: [], watchdog: [] };
  for (let i = 0; i < runs; i++) for (const cond of i % 2 ? ['watchdog', 'none'] : ['none', 'watchdog']) res[cond].push(await one(cond));
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
  const load = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
  console.log(`  · ${tag}: without the watchdog ${res.none.join(' ')} (median ${med(res.none)}); with it at default ${res.watchdog.join(' ')} (median ${med(res.watchdog)}); load ${load}`);
  ok(res.none.length === runs && res.watchdog.length === runs && res.none.every((x) => x > 5) && res.watchdog.every((x) => x > 5), `⑬ ${tag}: ${runs} interleaved runs a side reached the ramp's end by abort (a number for the kb's near-limit sentence)`, res);
  return { ...res, medNone: med(res.none), medWatchdog: med(res.watchdog), load };
}

// VS_LH_LEGS=named,boot,lawC,retain,conditions,acceptance,round3,round4,round5,starved,gclies,ramp,node22 — a maintainer's re-run of some legs (unset = every leg but ramp: the gate)
// --tree <dir> (or VS_LH_TREE=<dir> through ci's claim): ONLY the round-4 sweeps against another tree's watchdog (a report —
// the red control on the round-3 sha; LH_REPORT=<file> keeps its numbers)
// ── ⑭ THE STARVED HOLD IS A LEG OF ITS OWN (the follow-up, 主开发's ruling 07:31Z): a TRUE starved hold — the child and a
//     spinner pinned to ONE cpu (taskset): the suite's own count must see it starved and the product must say «waiting for
//     a CPU»; then the two lies each red by name — a product that never says it (WAIT_SHARE out of reach) on the starved
//     scene, and one that always says it (WAIT_SHARE 0) on a calm one ──────────────────────────────────────────────────
function agreeOf(rows) {
  const bad = [];
  for (const x of rows) {
    if (x.share == null) continue;
    if (x.share >= SUITE_STARVED && !x.waiting && !x.also) bad.push(`measured ${(100 * x.share).toFixed(0)} %, said «${x.h.verdict}» and nothing of a wait`);
    else if (x.share < SUITE_CLEAR && x.waiting) bad.push(`said «waiting for a CPU», measured ${(100 * x.share).toFixed(0)} %`);
  }
  return bad;
}
async function legStarved() {
  console.log('⑭ the starved hold: the suite\'s own count and the product\'s verdict, each lie red by name');
  const say = (x) => console.log('  · ' + x);
  const cpu = Math.max(0, os.cpus().length - 1);
  const mutTree = (name, from, to) => {
    const t = path.join(ROOT, 'mut-' + name); fs.cpSync(path.join(REPO, 'src'), path.join(t, 'src'), { recursive: true });
    const f = path.join(t, 'src/loop-hold.js'), x = fs.readFileSync(f, 'utf8'); if (!x.includes(from)) throw new Error('mutant anchor: ' + from);
    fs.writeFileSync(f, x.replace(from, to)); return t;
  };
  const starvedRun = async (tree = null) => {   // TWO spinners on the same cpu for the child's life — B-1409: «waiting for a CPU» is the
    // verdict only when the wait is the hold's larger part, and one spinner makes it a 50 / 50 coin; two leave the child a third
    const spins = [0, 1].map(() => spawn('taskset', ['-c', String(cpu), process.execPath, '-e', 'const t = Date.now(); while (Date.now() - t < 6000);'], { stdio: 'ignore' }));
    try { return await run1({ plan: 'busy', ...(tree ? { tree } : {}) }, { pin: cpu }); } finally { for (const sp of spins) { try { sp.kill('SIGKILL'); } catch { } } }
  };
  const S = await starvedRun(), sr = starveOf(S), sh = sr.find((x) => x.share != null);
  say(`⑭ the starved scene (cpu ${cpu} shared with two spinners): the suite measured ${sh ? (100 * sh.share).toFixed(0) : '?'} % run-queue wait; the product said «${sh ? sh.h.verdict : '?'}»`);
  ok(sh && sh.share >= SUITE_STARVED && sh.waiting && !agreeOf(sr).length, `a TRUE starved hold (one cpu, two spinners beside it): the suite's own count ≥ ${100 * SUITE_STARVED} % and the product says «waiting for a CPU» — they agree`, sr.map((x) => ({ share: x.share, v: x.h.verdict })));
  const never = await starvedRun(mutTree('never', 'WAIT_SHARE = 0.2,', 'WAIT_SHARE = 99,'));
  const nb = agreeOf(starveOf(never));
  ok(nb.length > 0 && /said «/.test(nb[0]), `MUTANT «never waiting» (WAIT_SHARE out of reach) on the starved scene is RED by name: ${nb[0] || 'no disagreement found'}`);
  const always = await run1({ plan: 'busy', tree: mutTree('always', 'if (waitedMuch(d) && d.waitMs >= d.ranMs) return V.waiting;', 'if (d.waitMs != null) return V.waiting;') });
  const ab = agreeOf(starveOf(always));
  ok(ab.length > 0 && /said «waiting for a CPU», measured/.test(ab[0]), `MUTANT «always waiting» (any wait the verdict) on a calm scene is RED by name: ${ab[0] || 'no disagreement found'}`);
}

// ── ⑮ THE COLLECTOR'S TWO LIES (主开发's ruling 08:30Z), beside ⑭'s: a product that ALWAYS says «native code or garbage
//     collection» (JS_FAST_MS −1: every answer late) and one that NEVER does (JS_FAST_MS 10⁹: every answer «JavaScript»), each
//     on a small sweep, each red by name — the strict legs (no collection by the child's own record) or the true forms ──
async function legGcLies(node, tag) {
  console.log(`⑮ the collector's two lies, each red by name (${tag})`);
  const mutTree = (name, to) => {
    const t = path.join(ROOT, 'mut-gc-' + name); fs.cpSync(path.join(REPO, 'src'), path.join(t, 'src'), { recursive: true });
    const f = path.join(t, 'src/loop-hold.js'), x = fs.readFileSync(f, 'utf8'), from = 'const JS_FAST_MS = 2;';
    if (!x.includes(from)) throw new Error('mutant anchor: ' + from);
    fs.writeFileSync(f, x.replace(from, `const JS_FAST_MS = ${to};`)); return t;
  };
  // asks land in the tail when the native call ends before the hold's first ask (≈ 100 ms held): pbkdf2 under 100 ms, a 50 ms tail
  const fast = LH.JS_FAST_MS, SETS = [['pbkdf2', [55, 60, 65, 70, 75, 80, 85, 90, 120, 150], [50]], ['json', [120, 135], [50]]];
  const judge = (A) => {
    const j = A.filter((a) => a.x != null && a.verdict && !a.outside);
    const sN = j.filter((a) => !a.gc && a.x >= fast + 1 && !a.asleepAsk), sT = j.filter((a) => !a.gc && a.x <= -1 && a.tail + a.x >= 2);
    const gN = j.filter((a) => a.gc && a.x >= fast + 1 && !a.asleepAsk), gT = j.filter((a) => a.gc && a.x <= -1 && a.tail + a.x >= 2);
    return { strictNativeSaidJs: sN.filter((a) => a.verdict === LH.V.js).length, strictTailNotJs: sT.filter((a) => a.verdict !== LH.V.js).length, gcNativeSaidJs: gN.filter((a) => a.verdict === LH.V.js).length, n: j.length, sN: sN.length, gN: gN.length, sT: sT.length };
  };
  const always = judge(await sweepA(node, tag, mutTree('always', -1)));   // the whole sweep: its tail asks are what this lie fails on
  ok(always.strictTailNotJs > 0, `MUTANT «always garbage collection» (JS_FAST_MS −1) is RED by name: ${always.strictTailNotJs} of ${always.sT} asks posted inside the JavaScript tail with NO collection in their window (the child's own record) said «${LH.V.native}»`, always);
  const neverTree = mutTree('never', 1e9);
  let never = judge(await sweepA(node, tag, neverTree, SETS));
  if (never.sN + never.gN === 0) never = judge(await sweepA(node, tag, neverTree, SETS));   // B-1409: once more when the box fed it no ask inside the native call
  if (never.sN + never.gN === 0) skip('MUTANT «never garbage collection» (JS_FAST_MS 10⁹)', `the watchdog was late on this box: 0 asks inside the native call in 2 sweeps — the mutant has nothing to be red on (${JSON.stringify(never)})`);
  else ok(never.strictNativeSaidJs + never.gcNativeSaidJs > 0, `MUTANT «never garbage collection» (JS_FAST_MS 10⁹) is RED by name: ${never.strictNativeSaidJs + never.gcNativeSaidJs} asks posted while the native call ran said «JavaScript» (${never.gcNativeSaidJs} of them with a collection in their window)`, never);
}

const LEGS = String(process.env.VS_LH_LEGS || '').split(',').filter(Boolean), leg = (n) => !LEGS.length || LEGS.includes(n);
if (LEGS.length) console.log(`(only the legs ${LEGS.join(', ')} — VS_LH_LEGS; the gate runs every leg)`);
const TI = process.argv.indexOf('--tree'), OTHER = TI > 0 ? path.resolve(process.argv[TI + 1]) : process.env.VS_LH_TREE ? path.resolve(process.env.VS_LH_TREE) : null;   // VS_LH_TREE = the same through ci's claim
if (OTHER) {
  try { const r = await legRound4(process.execPath, 'Node ' + process.versions.node.split('.')[0], OTHER); fs.writeFileSync(process.env.LH_REPORT || path.join(os.tmpdir(), 'lh-round4-report.json'), JSON.stringify(r, null, 1)); } finally { fs.rmSync(ROOT, { recursive: true, force: true }); }
  console.log(`\nREPORT (the tree ${OTHER}; ${path.join(os.tmpdir(), 'lh-round4-report.json')}) — the children used ${(cpuMs / 1000).toFixed(1)} cpu seconds`);
  process.exit(0);
}
try {
  if (leg('named')) await legNamed('Node 24', process.execPath);
  if (leg('boot')) await legBootCapSwitch();
  if (leg('lawC')) await legLawC('Node 24', process.execPath);
  if (leg('retain')) await legRetainExitProfile();
  if (leg('conditions')) await legConditions();
  if (leg('acceptance')) await legAcceptance();
  if (leg('round3')) await legRound3(process.execPath, 'Node 24');
  const rep4 = {};   // LH_REPORT=<file>: the round-4 / ramp numbers kept for a report (ci keeps a green suite's output nowhere)
  if (leg('round4')) rep4.round4n24 = await legRound4(process.execPath, 'Node 24');
  if (leg('round5')) rep4.round5n24 = await legRound5(process.execPath, 'Node 24');
  if (leg('starved')) await legStarved();
  if (leg('gclies')) await legGcLies(process.execPath, 'Node 24');
  if (LEGS.includes('ramp')) { const r24 = await legRamp(process.execPath, 'Node 24'); const n22r = process.env.VS_NODE22; const r22 = n22r && fs.existsSync(n22r) ? await legRamp(n22r, 'Node 22') : null; fs.writeFileSync(path.join(os.tmpdir(), 'lh-ramp-report.json'), JSON.stringify({ r24, r22 }, null, 1)); rep4.ramp = { r24, r22 }; }
  const n22 = process.env.VS_NODE22;
  if (!leg('node22')) { }
  else if (n22 && fs.existsSync(n22)) {
    console.log('⑧ Node 22 (' + n22 + ')');
    await legNamed('Node 22', n22);
    await legLawC('Node 22', n22);
    await legRound3(n22, 'Node 22');
    rep4.round4n22 = await legRound4(n22, 'Node 22');
  } else console.log('⑧ not run: no Node 22 given (VS_NODE22=/path/to/node22)');
  // the starved ledger kept OUTSIDE the suite (ci.mjs keeps nothing of a green suite): the report's counts, every run
  rep4.starve = { holds: STARVE.holds, waiting: STARVE.waiting, outside: STARVE.outside, measured: STARVE.measured, measuredStarved: STARVE.measuredStarved, band: STARVE.band, reruns: STARVE.reruns.slice(), red: STARVE.red.slice(), disagree: STARVE.disagree.length };
  if (process.env.LH_REPORT) { try { fs.writeFileSync(process.env.LH_REPORT, JSON.stringify(rep4, null, 1)); } catch { } }
} finally {
  fs.rmSync(ROOT, { recursive: true, force: true });
}
console.log(`\nTHE BOX AND THE SUITE: ${STARVE.waiting} of ${STARVE.holds} holds judged «waiting for a CPU» (${STARVE.outside} outside the asks' law, the suite's own count agreeing); measured by the suite ${STARVE.measured}: starved (≥ ${100 * SUITE_STARVED} %) ${STARVE.measuredStarved}, the band (${100 * SUITE_CLEAR}–${100 * SUITE_STARVED} %) ${STARVE.band}; children rerun once: ${STARVE.reruns.length ? STARVE.reruns.join(', ') : 'none'}`);
if (!process.env.VS_LH_TREE && process.argv.indexOf('--tree') < 0) {
  ok(!STARVE.disagree.length, `the product's «waiting for a CPU» agrees with the suite's OWN count of each hold's run-queue wait: ${STARVE.measuredStarved} measured starved (≥ ${100 * SUITE_STARVED} %), every one said so (the verdict, or «it also waited» beside its parts — B-1409); no hold said starved under ${100 * SUITE_CLEAR} % measured`, STARVE.disagree.slice(0, 5));
  ok(!STARVE.red.length, `the box starved the suite: ${STARVE.red.length ? STARVE.red.join(', ') : 'no child under the floor after its one rerun'} (the floor: ${100 * ASKED_FLOOR} % of a child's holds judged by its asks)`, STARVE.red);
}
console.log(`\nthe children used ${(cpuMs / 1000).toFixed(1)} cpu seconds`);
if (skipped.length) console.log(`\nSKIPPED BY THE BOX (${skipped.length} — the release's self-hosted claim runs them): ${skipped.join(' · ')}`);
const sk = skipped.length ? `, ${skipped.length} skipped` : '';
console.log(fail ? `\n${fail} FAILED (${pass} passed${sk})` : `\nALL PASS (${pass}${sk})`);
process.exit(fail ? 1 : 0);
