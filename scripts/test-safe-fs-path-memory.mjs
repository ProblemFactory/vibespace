#!/usr/bin/env node
// test-safe-fs-path-memory.mjs — B-23e5 (lane hub-loop-stalls): ONE DEAD THING, ONE CALL. The file-work pool (src/safe-fs.js) ends
// a worker at its call's deadline and respawns it at the first step (2.369.413). On a dead path the mount door does not cover (an
// UNREGISTERED mount: the door is fed only by the mount manager's 60 s liveness sweep), every call for that path goes to a FRESH
// worker and ends it again: each end parks one thread inside the hung syscall — a real one outlives terminate() — about 930 an hour
// across 4 slots (the coordinator's ruling, 2026-11-20: the pool must remember a path whose call ended at its deadline and refuse
// calls AT OR UNDER it by name, without a worker, for a bounded time).
//
// THE SCENE (a stall placed in the worker's op as the stand-in for a hung path — no mount of any kind): the REAL pool and worker
// (`__sleep`, VIBESPACE_SAFEFS_TEST=1) asked with a `path` under a planted dead folder; each call waits for a live worker first.
//   ① THE LAW: asked K times, the dead path ends ONE worker; the rest are REFUSED BY NAME (503, `path-hung`) without a worker; a
//      path beside it is answered meanwhile; after the bound the path is asked again (one more end). The count is asserted, never
//      a clock. (At the release this leg IS the proof: K ends.)
//   ① c / g / h / i / j / k / l / m — B-23e5's remainder (主开发 r1368 / r1378 / r1396): the mark's law over the real router (the header,
//      no bearer, not a foreign page), the door census and the STRUCTURAL press census, the symlink climb on an idle worker, the save law
//      and the close roads, one try means one (ten presses, one worker), not an access door, no preflight for the mark is granted.
//   ② THE COST, measured and printed (never asserted): the memory and the threads one more worker holds, and the container's
//      process limit where parked threads end.
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checker } from './lib/check.mjs';
import { anchored, scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
process.env.VIBESPACE_SAFEFS_TEST = '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SF = require(path.join(REPO, 'src/safe-fs.js'));
const DEAD = '/scratch-b23e5/dead-share', ALIVE = '/scratch-b23e5/alive';
// THE MOUNT TABLE the suite's pools read (the pool's own reader is /proc/self/mountinfo, off the loop): the root, and two mount
// POINTS inside one healthy folder (/scratch-b23e5/mnt/share1, share2) — mountinfo's own line shape
const MI = ['22 1 8:1 / / rw - ext4 /dev/sda1 rw', '40 22 0:40 / /scratch-b23e5/mnt/share1 rw - nfs4 nas:/one rw', '41 22 0:41 / /scratch-b23e5/mnt/share2 rw - nfs4 nas:/two rw'].join('\n') + '\n';
const mountsText = async () => MI;
const K = 6;

/** r4213: A WORKER BOOT HELD UNTIL THE SCENE LETS IT GO (the hosted run of 2.369.419: a fixed 400 ms from the spawn raced the main
 *  thread). The held script claims the next boot number (boot-<k>, made exclusively), waits on its own thread for go-<k> or open (5 ms
 *  naps in Atomics.wait, never load), marks loaded-<k>, then loads the held-call worker below (the real worker; r4293). Its bound is HOLD_BOUND_MS: a hold that runs out
 *  marks expired-<k> and loads (the scene says it by name, never a hang). Each hold has a fresh folder of its own. */
const HOLD_LET_MS = 400, HOLD_BOUND_MS = 60000;
function heldBoot(tag) {
  const dir = fs.mkdtempSync(path.join(scratchDir('safe-fs-path-memory-boot'), tag + '-'));
  const script = path.join(dir, 'held-boot-worker.js');
  fs.writeFileSync(script, [
    "const fs = require('fs'), path = require('path');",
    `const DIR = ${JSON.stringify(dir)}, BOUND_MS = ${HOLD_BOUND_MS};`,
    "let k = 1;",
    "for (;; k++) { try { fs.closeSync(fs.openSync(path.join(DIR, 'boot-' + k), 'wx')); break; } catch (e) { if (e.code !== 'EEXIST') throw e; } }",
    "const nap = new Int32Array(new SharedArrayBuffer(4)), t0 = Date.now();",
    "while (!fs.existsSync(path.join(DIR, 'go-' + k)) && !fs.existsSync(path.join(DIR, 'open'))) {",
    "  if (Date.now() - t0 > BOUND_MS) { fs.writeFileSync(path.join(DIR, 'expired-' + k), ''); break; }",
    "  Atomics.wait(nap, 0, 0, 5);",
    "}",
    "fs.writeFileSync(path.join(DIR, 'loaded-' + k), '');",
    `require(${JSON.stringify(DEADW.script)});`,
    '',
  ].join('\n'));
  const has = (f) => fs.existsSync(path.join(dir, f));
  const h = {
    script, warms: 0,
    let: (k) => fs.writeFileSync(path.join(dir, 'go-' + k), ''),
    open: () => fs.writeFileSync(path.join(dir, 'open'), ''),
    state: (k) => (has('loaded-' + k) ? 'loaded' : has('boot-' + k) ? 'held' : 'not started'),
    expired: () => fs.readdirSync(dir).filter((f) => f.startsWith('expired-')).map((f) => tag + ' boot ' + f.slice(8)),
  };
  HELD_ALL.push(h);   // r4305: the suite's last line names a held boot that ran out, as a held call
  return h;
}

/** r4293 (the third hosted run of 2.369.419): A HELD CALL — a call that runs until the scene lets it go, its own deadline ends it, or its
 *  worker is ended; never a fixed sleep raced against the main thread (a 4 s «dead path», a 2.5 s «live call», a 0.7 s «running op»).
 *  The stand-in worker is the real worker with ONE change, in the test-only __sleep alone: asked for HELD_MS, its wait is held ON ITS
 *  OWN THREAD until the hold's go file is there (5 ms naps in Atomics.wait, never load); any other ms sleeps as it was. Its bound is
 *  HOLD_BOUND_MS: a held call that runs out marks expired-<thread>-<t0> and the suite's last line says it by name, never a hang. */
const HELD_MS = 3600000;   // the ms a held __sleep is asked with (an hour: never reached — the go file, the call's deadline or its worker's end comes first)
const HELD_ALL = [];
function heldCalls(tag) {
  const dir = fs.mkdtempSync(path.join(scratchDir('safe-fs-path-memory-held'), tag + '-'));
  const script = path.join(dir, 'held-call-worker.js');
  fs.writeFileSync(script, [
    "const fs = require('fs'), path = require('path'), { threadId } = require('worker_threads');",
    `const DIR = ${JSON.stringify(dir)}, HELD_MS = ${HELD_MS}, BOUND_MS = ${HOLD_BOUND_MS};`,
    "const wait = Atomics.wait;",
    "Atomics.wait = function (ia, i, v, ms) {",
    "  if (ms !== HELD_MS) return wait.call(Atomics, ia, i, v, ms);",
    "  const t0 = Date.now();",
    "  while (!fs.existsSync(path.join(DIR, 'go'))) {",
    "    if (Date.now() - t0 > BOUND_MS) { fs.writeFileSync(path.join(DIR, 'expired-' + threadId + '-' + t0), ''); break; }",
    "    wait.call(Atomics, ia, i, v, 5);",
    "  }",
    "  return 'timed-out';",
    "};",
    `require(${JSON.stringify(path.join(REPO, 'src/safe-fs-worker.js'))});`,
    '',
  ].join('\n'));
  const h = {
    script,
    let: () => fs.writeFileSync(path.join(dir, 'go'), ''),
    expired: () => fs.readdirSync(dir).filter((f) => f.startsWith('expired-')).map((f) => tag + ' held call ' + f.slice(8)),
  };
  HELD_ALL.push(h);
  return h;
}
const DEADW = heldCalls('dead');   // the suite's DEAD PATHS: a held call never let go — only its deadline (or its worker's end) ends it

/** Wait for every worker of the pool to be live again (a respawn after an end), bounded and said by name at the bound. */
async function untilLive(pool, n, boundMs = 10000) {
  const t0 = Date.now();
  while (pool.stats().alive < n) { if (Date.now() - t0 > boundMs) throw new Error(`the pool never had ${n} live workers again within ${boundMs} ms`); await sleep(20); }
}

/** r4305 (r3409's fact, line 942's law, for every timed op that may be a fresh worker's first): THE WORKERS HAVE ANSWERED ONCE — n calls
 *  at once, one a worker (each goes to the least busy live worker, all idle), a 1 ms sleep under a long deadline each; with a held boot,
 *  it is let go HOLD_LET_MS after they are sent. → how many answered (the leg says a short count by a named line, never a silent read). */
async function warmAll(pool, n, hold = null) {
  const calls = [];
  for (let i = 0; i < n; i++) calls.push(pool.call('__sleep', { path: `/scratch-b23e5/warm/w${i}`, ms: 1 }, { timeoutMs: 15000 }).then(() => 1, () => 0));
  if (hold) setTimeout(() => hold.open(), HOLD_LET_MS);
  return (await Promise.all(calls)).reduce((a, b) => a + b, 0);
}

/** One request over node:http (the headers go exactly as written — a browser's Sec-Fetch-Site and Origin included) → status, headers, JSON. */
function httpAsk(port, p, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const rq = require('node:http').request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } resolve({ status: res.statusCode, headers: res.headers, json: j, body: b }); });
    });
    rq.on('error', reject); rq.end();
  });
}

/** The scene over a SafeFs module: K asks of the dead path (a held call: only its deadline ends it), each after the pool is whole again → the ends, the answers. */
async function scene(Mod, tag, k = K) {
  const pool = new Mod.SafeFs({ poolSize: 2, name: `path-memory-${tag}`, timeouts: { default: 15000, __sleep: 300 }, hungMs: 3000, mountsText, workerPath: DEADW.script });
  const answers = [];
  try {
    for (let i = 0; i < k; i++) {
      await untilLive(pool, 2);
      answers.push(await pool.call('__sleep', { path: `${DEAD}/file-${i}`, ms: HELD_MS }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code))));
    }
    return { ends: pool.stats().timeouts, answers };
  } finally { pool.close(); }
}

// B-4b9a (the fast tier's time, 主开发 r2545): THE POOL SCENES SIDE BY SIDE. Seven blocks whose seconds are real waits on the pool's
// own workers — ①, ①d, ①g, ①h, ①k, ①k2, ①o: deadlines run out, stalls, respawns, ①h's held call (2.5 s), every timer as it was —
// start together here, each on pools of its own (no state of src/safe-fs.js is shared between pools). A block's checks and lines
// are KEPT and told at the block's own place, in the suite's order; the rest of the suite (the reads, the router and its servers,
// the lifted legs) runs after all seven have ended, alone, as before. A block that threw is told up to its throw; the throw stands.
const sides = new Map();
function side(fn) {
  const said = [];
  const p = fn((...a) => { said.push(['ok', a]); return a[0]; }, { log: (...a) => { said.push(['log', a]); } });
  p.catch(() => {});   // told at its own place (below), never an unhandled rejection meanwhile
  sides.set(fn, { said, p });
}
async function told(fn) {
  const { said, p } = sides.get(fn);
  let thrown = null;
  try { await p; } catch (e) { thrown = e; }
  for (const [w, a] of said) (w === 'ok' ? ok : console.log)(...a);
  if (thrown) throw thrown;
}
for (const fn of [sideOne, sideD, sideG, sideH, sideK, sideK2, sideO]) side(fn);
await Promise.allSettled([...sides.values()].map((s) => s.p));

console.log('① asked K times, a dead path ends ONE worker; the rest are refused by name without a worker');
await told(sideOne);
async function sideOne(ok, console) {   // B-4b9a: started beside the other pool scenes (above), told here
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const NOTE = '    if (running) this._noteHung(running.payload, running.op, running !== call ? Math.max(call.timeoutMs || 0, monoNow() - (running.sentAt || monoNow())) : Math.min(running.timeoutMs || Infinity, monoNow() - (running.sentAt || monoNow())), { early: running !== call });   // the time since it was sent without an answer; ended EARLY by a queued call ⇒ only that long\n';
  const Rel = src.split(NOTE).length === 2 ? mutantCopies('safe-fs-path-memory', REPO).load('src/safe-fs.js', anchored(src, NOTE, '', 'release-no-memory'), 'release-no-memory') : null;
  const RK = 3;   // the release's road needs no more asks to show itself
  const redP = Rel ? scene(Rel, 'release', RK).catch((e) => ({ ends: -1, answers: [String(e && e.message)] })) : null;   // the release's road runs beside the leg (its own pool); a throw is a red, never an unhandled rejection
  let shift = 0; const clock = () => performance.now() + shift;   // r275 should 3: the memory's own clock, advanced by the leg (never a real 3 s wait)
  const pool = new SF.SafeFs({ poolSize: 2, name: 'path-memory', timeouts: { default: 15000, __sleep: 300 }, hungMs: 3000, mountsText, clock, workerPath: DEADW.script });
  const answers = [];
  try {
    for (let i = 0; i < K; i++) {
      await untilLive(pool, 2);
      answers.push(await pool.call('__sleep', { path: `${DEAD}/file-${i}`, ms: HELD_MS }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code))));
    }
    const ends = pool.stats().timeouts;
    await untilLive(pool, 2);
    const alive = await pool.call('__sleep', { path: `${ALIVE}/x`, ms: 1 }, { timeoutMs: 15000 }).then(() => 'answered', (e) => String(e && e.code));   // a fresh worker loads under a long deadline
    console.log(`  [measure] a dead folder asked ${K} times, file by file: worker ends ${ends}; answers ${answers.join(', ')}; a path beside it: ${alive}`);
    const besideAsked = !pool._hungOf({ path: `${ALIVE}/x` }, '__sleep', 300);   // at the dead path's own deadline: no entry reaches it
    ok(ends === 2 && answers[0] === 'deadline' && answers[1] === 'deadline' && answers.slice(2).every((a) => a === 'path-hung') && alive === 'answered' && besideAsked,
      `ONE DEAD THING: ${K} asks of files in a dead folder ended ${ends} workers — the second sibling names their folder (the law: 2), the rest refused by name (${answers.slice(2).join(', ')}); a path beside it answered (${alive})`, { ends, answers, alive });
    // after the bound the path is asked again — one more end, never a path refused for good
    shift += 3100; await untilLive(pool, 2);
    const again = await pool.call('__sleep', { path: `${DEAD}/file-again`, ms: HELD_MS }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code)));
    ok(again === 'deadline' && pool.stats().timeouts === ends + 1, `after its bound the dead path is asked again (${again}; ends ${pool.stats().timeouts})`, { again });
  } finally { pool.close(); }
  // THE SAME dead path asked K times: ONE end
  const same = new SF.SafeFs({ poolSize: 2, name: 'path-memory-same', timeouts: { default: 15000, __sleep: 300 }, hungMs: 3000, mountsText, workerPath: DEADW.script });
  try {
    const got = [];
    for (let i = 0; i < K; i++) { await untilLive(same, 2); got.push(await same.call('__sleep', { path: `${DEAD}/one-file`, ms: HELD_MS }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code)))); }
    ok(same.stats().timeouts === 1 && got.slice(1).every((a) => a === 'path-hung'), `ONE DEAD THING, ONE CALL: the same dead path asked ${K} times ended ${same.stats().timeouts} worker (${got.join(', ')})`, got);
  } finally { same.close(); }
  // RED CONTROL: the release's pool (a deadline end remembers nothing) — every ask of the dead path ends a fresh worker
  const red = await redP;
  console.log(`  [measure] the release: ${red && red.ends} worker ends for ${RK} asks (${red && red.answers.join(', ')})`);
  ok(!!red && red.ends === RK && red.answers.every((a) => a === 'deadline'), `RED CONTROL (the release's pool): every ask of the dead path ends a fresh worker (${red && red.ends} of ${RK})`, red);
}

console.log('①b the memory\'s shape: what it refuses, and what it never does');
{
  const os = require('node:os');
  const pool = new SF.SafeFs({ poolSize: 1, name: 'path-memory-shape', hungMs: 60000, mountsText });
  try {
    await untilLive(pool, 1);   // the folder rule looks at two dead children on an IDLE worker (no live worker in its bound: nothing named now)
    const at = (p, op = 'stat', ms = 15000) => !!pool._hungOf({ path: p }, op, ms);
    pool._noteHung({ path: '/scratch-b23e5/home' }, 'listDir', 15000);   // a listing that hung on ONE dead child
    pool._noteHung({ path: '/scratch-b23e5/nas/share' }, 'stat', 15000);   // one target that hung
    ok(at('/scratch-b23e5/home', 'listDir') && !at('/scratch-b23e5/home', 'stat') && !at('/scratch-b23e5/home/notes.txt') && at('/scratch-b23e5/nas/share') && at('/scratch-b23e5/nas/share/a/b', 'readText') && !at('/scratch-b23e5/nas/share-2') && !at('/scratch-b23e5/nas'),
      'a hung LISTING refuses only listings of that folder (its own stat and its healthy children stay asked); a hung target refuses it and what is under it — never a sibling, never its parent');
    pool._noteHung({ path: '/scratch-b23e5/slow' }, 'stat', 5000);   // a slow but ALIVE storage that missed a 5 s read
    ok(at('/scratch-b23e5/slow/x', 'stat', 5000) && !at('/scratch-b23e5/slow/x', 'listDir', 15000), 'a path that ran out a 5 s deadline refuses a 5 s caller — a caller that waits 15 s is asked again (a slow storage is still listed)');
    await pool._noteHung({ path: '/scratch-b23e5/box/a.txt' }, 'stat', 15000); const one = at('/scratch-b23e5/box/c.txt');
    await pool._noteHung({ path: '/scratch-b23e5/box/b.txt' }, 'stat', 15000);
    ok(!one && at('/scratch-b23e5/box/c.txt') && !at('/scratch-b23e5/elsewhere'), 'ONE dead file names only itself; a SECOND dead sibling names their folder (at or under) — never the folder above it');
    const H = os.homedir();
    await pool._noteHung({ path: H }, 'stat', 15000); await pool._noteHung({ path: `${H}/dead-a` }, 'stat', 15000); await pool._noteHung({ path: `${H}/dead-b` }, 'stat', 15000);
    await pool._noteHung({ path: '/' }, 'stat', 15000); await pool._noteHung({ path: `${H}/` }, 'stat', 15000);
    ok(!at(`${H}/notes.txt`) && !at('/etc/hosts') && at(`${H}/dead-a`), 'never the root or the home AT OR UNDER (either spelling, a trailing slash): two dead children of the home do not refuse the home (each refuses itself)');
    // (its delta read S3) the folders ABOVE the home are never named either: two dead children of the home's parent leave it asked
    const HP = path.dirname(H.replace(/\/+$/, ''));
    await pool._noteHung({ path: `${HP}/scratch-b23e5-u1` }, 'stat', 15000); await pool._noteHung({ path: `${HP}/scratch-b23e5-u2` }, 'stat', 15000);
    ok(!at(`${HP}/scratch-b23e5-u3`) && at(`${HP}/scratch-b23e5-u1`), `never a folder above the home: two dead children of ${HP} name only themselves`);
    // (its delta read S3) TWO DEAD MOUNT POINTS inside one healthy folder never name it — the folder is another storage; two dead
    // files of ONE mount still name their folder
    await pool._noteHung({ path: '/scratch-b23e5/mnt/share1' }, 'stat', 5000); await pool._noteHung({ path: '/scratch-b23e5/mnt/share2' }, 'stat', 5000);
    const mntAsked = !at('/scratch-b23e5/mnt/data/report.txt', 'stat', 5000);
    await pool._noteHung({ path: '/scratch-b23e5/mnt/share1/docs/a.txt' }, 'stat', 15000); await pool._noteHung({ path: '/scratch-b23e5/mnt/share1/docs/b.txt' }, 'stat', 15000);
    ok(mntAsked && at('/scratch-b23e5/mnt/share1/docs/c.txt'), 'two dead mount POINTS never name the healthy folder that holds them (another storage, by the mount table); two dead files of one mount name their folder');
    // (its delta read S2) a folder whose LISTING hung is still named by two dead files under it
    await pool._noteHung({ path: '/scratch-b23e5/listed' }, 'listDir', 15000);
    await pool._noteHung({ path: '/scratch-b23e5/listed/a.txt' }, 'stat', 15000); await pool._noteHung({ path: '/scratch-b23e5/listed/b.txt' }, 'stat', 15000);
    ok(at('/scratch-b23e5/listed/c.txt'), 'a folder whose listing hung is named by two dead files under it (the exact entry widens)');
    // (its NITs) one call's two paths are ONE sibling (a rename never names its folder alone); the same exact call is not asked again
    await pool._noteHung({ oldPath: '/scratch-b23e5/ren/a', newPath: '/scratch-b23e5/ren/b' }, 'rename', 15000);
    await pool._noteHung({ path: '/scratch-b23e5/props', entryCount: true }, 'stat', 15000);
    ok(!at('/scratch-b23e5/ren/c') && at('/scratch-b23e5/ren/a') && !!pool._hungOf({ path: '/scratch-b23e5/props', entryCount: true }, 'stat', 15000) && !at('/scratch-b23e5/props', 'readText') && !at('/scratch-b23e5/props/x'),
      'a hung rename names its two paths, never their folder on one end; a hung Properties stat (exact) refuses that same stat — never another op on the folder, never what is under it');
    // (its read 3) a full deadline end refuses callers up to 1.5 × that deadline, never more
    await pool._noteHung({ path: '/scratch-b23e5/full/a.txt' }, 'stat', 10000);
    ok(at('/scratch-b23e5/full/a.txt', 'stat', 15000) && !at('/scratch-b23e5/full/a.txt', 'stat', 15001), 'a full 10 s end refuses a 15 s caller and asks a 15.001 s one (1.5 ×)');
    // (its read 3 S2) an op whose end can come from SIZE on a healthy storage — a copy, a move, a removal — is never remembered
    for (const op of ['copy', 'move', 'remove', 'unlink', 'contextFiles', 'folderCensus']) await pool._noteHung({ src: '/scratch-b23e5/big/project', dest: '/scratch-b23e5/nas2/project', path: '/scratch-b23e5/big/project' }, op, 120000);
    ok(!at('/scratch-b23e5/big/project', 'listDir') && !at('/scratch-b23e5/big/project/x') && !at('/scratch-b23e5/nas2/project', 'listDir'), 'a copy / move / removal / context walk / census that ran out its deadline leaves no memory (a healthy, slow, big tree is asked again)');
    // (its read 3 NITs) a plain stat is not a Properties stat; two exact ops on one folder are both kept; an EARLY end never names a folder
    ok(!at('/scratch-b23e5/props', 'stat'), 'a hung Properties stat never refuses a plain stat of the folder');
    await pool._noteHung({ path: '/scratch-b23e5/both' }, 'listDir', 15000); await pool._noteHung({ path: '/scratch-b23e5/both', entryCount: true }, 'stat', 5000);
    const props = (ms) => !!pool._hungOf({ path: '/scratch-b23e5/both', entryCount: true }, 'stat', ms);
    ok(at('/scratch-b23e5/both', 'listDir') && props(5000) && !props(15000), 'a folder whose listing AND Properties stat hung refuses both again, each by its own bound (the stat\'s 5 s, never the listing\'s 15 s)');
    // (its read 4 NIT 6) an EARLY end never names a folder — neither the early note itself, nor as the sibling of a full one
    await pool._noteHung({ path: '/scratch-b23e5/early2/a.txt' }, 'readFile', 6000); await pool._noteHung({ path: '/scratch-b23e5/early2/b.txt' }, 'readFile', 6000, { early: true });
    await pool._noteHung({ path: '/scratch-b23e5/early3/a.txt' }, 'readFile', 6000, { early: true }); await pool._noteHung({ path: '/scratch-b23e5/early3/b.txt' }, 'readFile', 6000);
    ok(!at('/scratch-b23e5/early2/c.txt', 'stat', 5000) && !at('/scratch-b23e5/early3/c.txt', 'stat', 5000), 'an early end never names its folder — after a full end, or before one');
    // (its read 3 NIT) an exact listing WIDENED keeps the one-target ends' own bound — its long deadline never reaches what is under it
    await pool._noteHung({ path: '/scratch-b23e5/wide' }, 'listDir', 60000);
    await pool._noteHung({ path: '/scratch-b23e5/wide/a.txt' }, 'stat', 5000); await pool._noteHung({ path: '/scratch-b23e5/wide/b.txt' }, 'stat', 5000);
    ok(at('/scratch-b23e5/wide/c.txt', 'stat', 5000) && !at('/scratch-b23e5/wide/c.txt', 'stat', 15000) && at('/scratch-b23e5/wide', 'listDir', 15000) && at('/scratch-b23e5/wide', 'contextFiles', 60000),
      'the widened folder refuses a 5 s caller under it, asks a 15 s one (the listing\'s 60 s never reaches its children) — and keeps its OWN listing\'s proof: a 15 s or a 60 s listing of it is refused (its read 4 M1)');
    // (its delta read S1) the parse lane asks the memory and never adds to it (its end is its own runaway parse)
    await pool.lane('parse')._noteHung({ path: '/scratch-b23e5/book.xlsx' }, 'xlsxSheets', 60000);
    ok(!at('/scratch-b23e5/book.xlsx', 'stat', 15000) && pool.lane('parse')._hungMs === 0, 'a runaway parse leaves no memory: the workbook\'s stat and download stay asked');
    // (its delta read S1) an op ended EARLY by a call queued behind it refuses only callers that wait no longer than it ran (never 1.5×)
    await pool._noteHung({ path: '/scratch-b23e5/early/a.txt' }, 'readFile', 14000, { early: true });
    ok(at('/scratch-b23e5/early/a.txt', 'stat', 14000) && !at('/scratch-b23e5/early/a.txt', 'stat', 15000), 'an op ended early (14 s run) refuses a 14 s caller and asks a 15 s one');
    const lane = pool.lane('parse');
    ok(lane._hung === pool._hung && !!lane._hungOf({ path: '/scratch-b23e5/nas/share/book.xlsx' }, 'xlsxSheets', 15000), 'the pool and its lanes keep ONE memory (a parse of a file under a dead path is refused too)');
    let refused = null; try { await pool.call('stat', { path: '/scratch-b23e5/nas/share/x' }); } catch (e) { refused = e; }
    ok(!!refused && refused.code === 'path-hung' && refused.status === 503 && /^this folder or file did not answer in time and is not asked again for \d+ s: \/scratch-b23e5\/nas\/share$/.test(refused.message),
      `the refusal names the path and its bound: «${refused && refused.message}»`, refused && refused.message);
    for (let i = 0; i < 300; i++) pool._noteHung({ path: `/scratch-b23e5/many/${i}/x` }, 'stat', 15000);
    ok(pool._hung.size === 256 && !at('/scratch-b23e5/many/0/x') && at('/scratch-b23e5/many/299/x'), `bounded: at most 256 paths, the oldest leaves first (${pool._hung.size})`);
    const off = new SF.SafeFs({ poolSize: 1, name: 'path-memory-off', hungMs: 0 });
    try { off._noteHung({ path: '/scratch-b23e5/x' }, 'stat', 15000); ok(!off._hungOf({ path: '/scratch-b23e5/x' }, 'stat', 15000), 'hungMs: 0 turns the memory off (the mount canary keeps measuring)'); } finally { off.close(); }
    ok(/hungMs: 0,/.test(fs.readFileSync(path.join(REPO, 'src/server/fs-canary.js'), 'utf8')), 'the mount canary\'s pool asks every probe (hungMs: 0)');
  } finally { pool.close(); }
}

console.log('①f the mount table decides a climb: an automounter\'s folder is never named; what is under a named folder is refused with it; no table, no climb');
{
  const MI2 = MI + ['60 22 0:60 / /scratch-b23e5/nas rw - autofs auto.nas rw', '61 60 0:61 / /scratch-b23e5/nas/share3 rw - nfs4 nas:/three rw', '62 22 0:62 / /scratch-b23e5/hold/inner rw - nfs4 nas:/inner rw'].join('\n') + '\n';
  const pool = new SF.SafeFs({ poolSize: 1, name: 'path-memory-mounts', hungMs: 60000, mountsText: async () => MI2 });
  const blind = new SF.SafeFs({ poolSize: 1, name: 'path-memory-blind', hungMs: 60000, mountsText: async () => { throw new Error('no table'); } });
  try {
    await untilLive(pool, 1);
    const at = (P, p, op = 'stat', ms = 15000) => !!P._hungOf({ path: p }, op, ms);
    await pool._noteHung({ path: '/scratch-b23e5/nas/k1' }, 'stat', 15000); await pool._noteHung({ path: '/scratch-b23e5/nas/k2' }, 'stat', 15000);
    await pool._noteHung({ path: '/scratch-b23e5/hold/a' }, 'stat', 15000); await pool._noteHung({ path: '/scratch-b23e5/hold/b' }, 'stat', 15000);
    await blind._noteHung({ path: '/scratch-b23e5/x/a' }, 'stat', 15000); await blind._noteHung({ path: '/scratch-b23e5/x/b' }, 'stat', 15000);
    ok(!at(pool, '/scratch-b23e5/nas/share3/f') && !at(pool, '/scratch-b23e5/nas/k3') && at(pool, '/scratch-b23e5/nas/k1'), 'two dead keys of an automounter (no line of their own) never name its folder: a mounted share beside them stays asked');
    ok(at(pool, '/scratch-b23e5/hold/c') && at(pool, '/scratch-b23e5/hold/inner/f'), 'a folder named by two dead files refuses what is under it, a storage mounted beneath too — it is reached through the dead folder (its read 4 S1)');
    ok(!at(blind, '/scratch-b23e5/x/c') && at(blind, '/scratch-b23e5/x/a'), 'an unreadable mount table: no climb (each dead file names itself)');
  } finally { pool.close(); blind.close(); }
}

console.log('①e the pool\'s own mount reading is local-index\'s (parity: the pool does not require that module — the device bundle carries the pool)');
{
  const LI = require(path.join(REPO, 'src/local-index.js'));
  const tables = [MI, MI + '50 22 0:50 / /scratch-b23e5/with\\040space rw - fuse.sshfs h:/x rw\n', '', 'garbage line\n22 1 8:1 / / rw - ext4 /dev/sda1 rw\n'];
  const paths = ['/', '/scratch-b23e5', '/scratch-b23e5/mnt', '/scratch-b23e5/mnt/share1', '/scratch-b23e5/mnt/share1/a/b', '/scratch-b23e5/mnt/share10/x', '/scratch-b23e5/with space/f', 'relative/x', ''];
  const off = [];
  for (const t of tables) for (const p of paths) { const a = SF.mountFactsOf(p, t), m = LI.mountOf(p, t); if ((a ? a.target : null) !== (m ? m.target : null) || (a ? a.fstype : null) !== (m ? m.fstype : null) || SF.mountTargetOf(p, t) !== (m ? m.target : null)) off.push({ p, a, m }); }
  ok(!off.length, `the pool's mountTargetOf reads every table as local-index's mountOf, its mount point and its type (${tables.length} tables × ${paths.length} paths${off.length ? '; OFF: ' + JSON.stringify(off.slice(0, 3)) : ''})`, off);
}

console.log('①d the call the worker was RUNNING is the dead one — never a call queued behind it');
await told(sideD);
async function sideD(ok, console) {   // B-4b9a: started beside the other pool scenes (above), told here
  // r4293 (the third hosted run of 2.369.419, Node 22, load 7.4): THE RED's PATIENT CALLER WAS THE HEALTHY RUN's — its probe (the
  // healthy run's bound + 50 ms) was judged against the copy's OWN run: the healthy run's queued deadline fired 211 ms late (it ran 511
  // ms), the copy's on time (300 ms ⇒ 1.5 × 300 = 450 < 561): the patient caller got through and the control said green for the fault.
  // Now each run is judged by ITS OWN run: `ranMs` is what the scene saw of this run — the queued call's deadline (QUEUED_MS) or the time
  // from the hung call's send to the queued call's end, whichever is longer (the product's own measure, bracketed from outside: never
  // shorter than it); the copy's caller is that + 50 ms. And the hung call is a HELD call (only the queued call's deadline ends it)
  const QUEUED_MS = 300;
  const run = async (Mod) => {
    const pool = new Mod.SafeFs({ poolSize: 1, name: 'path-memory-queue', timeouts: { default: 15000 }, hungMs: 60000, workerPath: DEADW.script });
    try {
      let endedAt = null; const t0 = performance.now();
      const A = pool.call('__sleep', { path: '/scratch-b23e5/q/dead', ms: HELD_MS }, { timeoutMs: 5000 }).catch(() => {});   // the hung one (held), long deadline
      const B = pool.call('__sleep', { path: '/scratch-b23e5/q/healthy/f', ms: 1 }, { timeoutMs: QUEUED_MS }).catch(() => { endedAt = performance.now(); });   // queued behind it in the same worker: its deadline ends the worker
      await Promise.all([A, B]);
      const m = pool._hung.get('/scratch-b23e5/q/dead'), bound = m ? m.under : null, probe = Number.isFinite(bound) ? Math.ceil(bound) + 50 : 400;
      const ranMs = endedAt == null ? null : Math.max(QUEUED_MS, endedAt - t0), ranProbe = ranMs == null ? null : Math.ceil(ranMs) + 50;
      // (its delta read S1) ended EARLY by the queued call's deadline, it refuses only callers that wait no longer than it ran — a caller
      // 50 ms more patient than that is asked again (the 1.5× slack is for an op that ran out its OWN deadline)
      // asked by a caller no more patient than the queued call (200 ms ≤ its 300 ms deadline; the early bound is the ~300 ms it ran)
      const refused = (ms) => (ms == null ? null : !!pool._hungOf({ path: '/scratch-b23e5/q/dead' }, '__sleep', ms));
      return { dead: !!pool._hungOf({ path: '/scratch-b23e5/q/dead' }, '__sleep', 200), healthy: !!pool._hungOf({ path: '/scratch-b23e5/q/healthy/f' }, '__sleep', 200), bound, probe, patientRefused: refused(probe), ranMs, ranProbe, ranRefused: refused(ranProbe) };
    } finally { pool.close(); }
  };
  const nowP = run(SF);
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const RUN = '    if (running) this._noteHung(running.payload, running.op, running !== call ? Math.max(call.timeoutMs || 0, monoNow() - (running.sentAt || monoNow())) : Math.min(running.timeoutMs || Infinity, monoNow() - (running.sentAt || monoNow())), { early: running !== call });   // the time since it was sent without an answer; ended EARLY by a queued call ⇒ only that long\n';
  const Q = src.split(RUN).length === 2 ? mutantCopies('safe-fs-path-memory-q', REPO).load('src/safe-fs.js', anchored(src, RUN, '    this._noteHung(call.payload, call.op, call.timeoutMs);\n', 'blame-the-queued'), 'blame-the-queued') : null;
  const [now, red] = await Promise.all([nowP, Q ? run(Q) : null]);
  ok(now.dead && !now.healthy && !now.patientRefused, `the queued call's deadline ended the worker; the RUNNING call's path is remembered (${now.dead}), the queued one's is not (${now.healthy}); ended early after ${now.bound && Math.round(now.bound)} ms, a ${now.probe} ms caller is asked again (${!now.patientRefused})`, now);
  ok(!!red && red.healthy && !red.dead, `RED CONTROL (the timed-out call blamed): the healthy queued path is remembered and the dead one is not (${JSON.stringify(red)})`, red);
  const EARLY = ', { early: running !== call });';
  const E = src.split(EARLY).length === 2 ? mutantCopies('safe-fs-path-memory-e', REPO).load('src/safe-fs.js', anchored(src, EARLY, ', { early: false });', 'early-as-full'), 'early-as-full') : null;
  const redE = E ? await run(E) : null;
  ok(now.ranMs != null && now.ranMs >= now.bound && !now.ranRefused, `each run judged by its OWN run: the scene's measure of this run (${now.ranMs != null && now.ranMs.toFixed(1)} ms) is never shorter than the pool's own (${now.bound && Math.round(now.bound)} ms), and its ${now.ranProbe} ms caller is asked again too (${!now.ranRefused})`, now);
  ok(!!redE && redE.dead && redE.ranRefused, `RED CONTROL (an early end taken as a full deadline, 1.5×): the ${redE && redE.ranProbe} ms caller of a path that ran only ${redE && redE.ranMs != null && redE.ranMs.toFixed(1)} ms (ITS OWN run) is refused (${JSON.stringify(redE)})`, redE);
}

console.log('①g 主开发\'s r275: a person\'s own press is tried; a path that replies is forgiven; a repeat end doubles its time');
await told(sideG);
async function sideG(ok, console) {   // B-4b9a: started beside the other pool scenes (above), told here
  // THE FACT THE TIMED PRESSES WAIT FOR (主开发 r3409, the hosted mirror of 2.369.417 on Node 24.22.3): a pool marks a worker LIVE at its
  // construction, before its script has loaded — the scene's 300 ms deadline must be the op's own, never the boot's: the worker has
  // ANSWERED once (a 1 ms sleep on a path of its own, with the pool's long deadline) before a timed press is asked
  const ready = async (pool, warm, hold = null) => {
    await untilLive(pool, 1);
    if (!warm) return null;
    // r4213: a HELD boot (the slow leg) is let go only HOLD_LET_MS after this first call is SENT — the boot provably outlives the 300 ms
    // deadline of a timed press, whatever the main thread did between the spawn and this call (the time it took is the leg's print)
    const t0 = performance.now(), k = hold ? ++hold.warms : 0;
    if (hold) setTimeout(() => hold.let(k), HOLD_LET_MS);
    await pool.call('__sleep', { path: '/scratch-b23e5/ready/x', ms: 1 }, { timeoutMs: 15000 }).catch(() => { });
    return Math.round(performance.now() - t0);
  };
  const run = async (Mod, { workerPath = null, warm = true, hold = null } = {}) => {
    let shift = 0; const clock = () => performance.now() + shift;
    const pool = new Mod.SafeFs({ poolSize: 1, name: 'path-memory-press', timeouts: { default: 15000, __sleep: 300 }, hungMs: 30000, mountsText, clock, workerPath: workerPath || DEADW.script });   // r4293: the dead press is a held call
    const out = {};
    try {
      out.warmMs = [await ready(pool, warm, hold)];
      const word = (p) => p.then(() => 'answered', (e) => (e && e.code === 'path-hung' ? (e.tried ? 'path-hung, tried' : 'path-hung') : e && e.safeFsTimeout ? 'deadline' : String(e && e.code)));
      // THE PRESS AFTER A RECOVERY: a path remembered dead, then mended — the person's press is asked at once, answers, and is forgiven
      await pool._noteHung({ path: '/scratch-b23e5/mended/x' }, 'stat', 15000);
      out.unmarked0 = await word(pool.call('__sleep', { path: '/scratch-b23e5/mended/x', ms: 1 }));
      out.press = await word(pool.call('__sleep', { path: '/scratch-b23e5/mended/x', ms: 1 }, { attended: true }));
      // r4213 (the RED control's hold): the press has SETTLED — its 300 ms deadline fired while boot 1 was still held (the scene lets no
      // boot of this pool go before this line); every later boot goes at once. The press after it is sent in the same turn's microtasks:
      // the pool's respawn (a timer) cannot have run, so the dead press below finds NO live worker by construction (aliveAtDeadPress)
      if (hold && !warm) { out.bootAtPress = hold.state(1); hold.open(); }
      out.after = await word(pool.call('__sleep', { path: '/scratch-b23e5/mended/x', ms: 1 }));
      // THE PRESS ON A STILL-DEAD PATH: tried once — it ends ONE worker, the memory is renewed, and its words say so
      await pool._noteHung({ path: '/scratch-b23e5/still/x' }, 'stat', 15000);
      const ends0 = pool.stats().timeouts, until0 = (pool._hung.get('/scratch-b23e5/still/x') || {}).until;
      out.aliveAtDeadPress = pool.stats().alive;
      out.deadPress = await word(pool.call('__sleep', { path: '/scratch-b23e5/still/x', ms: HELD_MS }, { attended: true }));
      out.deadEnds = pool.stats().timeouts - ends0;
      out.renewed = ((pool._hung.get('/scratch-b23e5/still/x') || {}).until || 0) > (until0 || 0);
      out.warmMs.push(await ready(pool, warm, hold));   // the worker the dead press ended comes back: its first op after a fresh boot is a timed one too
      if (hold) hold.open();   // the leg's held boots are done: any later boot goes at once
      out.unmarked = await word(pool.call('__sleep', { path: '/scratch-b23e5/still/x', ms: HELD_MS }));
      out.unmarkedEnds = pool.stats().timeouts - ends0;
      // r316 MUST 1: a LISTING's entry (the path itself) is forgiven only by a listing that replies at exactly that path — never by the
      // folder's own other op, nor by a reply under it
      await pool._noteHung({ path: '/scratch-b23e5/lst' }, 'listDir', 15000);
      out.otherOp = await word(pool.call('__sleep', { path: '/scratch-b23e5/lst', ms: 1 }));
      out.under = await word(pool.call('__sleep', { path: '/scratch-b23e5/lst/notes.txt', ms: 1 }));
      out.listingKept = !!pool._hungOf({ path: '/scratch-b23e5/lst' }, 'listDir', 15000);
      out.listingPress = await word(pool.call('listDir', { path: '/scratch-b23e5/lst' }, { attended: true }));   // the stand-in path: the file system's own error — a reply
      out.listingForgiven = !pool._hungOf({ path: '/scratch-b23e5/lst' }, 'listDir', 15000);
      // r316's should: two presses of the same thing at once are ONE call in flight
      const seq0 = pool._seq;
      const [pa, pb] = await Promise.all([word(pool.call('__sleep', { path: '/scratch-b23e5/twice', ms: 50 }, { attended: true })), word(pool.call('__sleep', { path: '/scratch-b23e5/twice', ms: 50 }, { attended: true }))]);
      out.joined = { sent: pool._seq - seq0, pa, pb };
      // A REPEAT END doubles the time, capped (30 s, 60 s … 16 × at most); a reply starts it over
      const span = () => { const m = pool._hung.get('/scratch-b23e5/rep/x'); return m ? 1000 * Math.round((m.until - clock()) / 1000) : null; };   // whole seconds: a loaded runner's microtask never decides
      const spans = [];
      for (let i = 0; i < 6; i++) { await pool._noteHung({ path: '/scratch-b23e5/rep/x' }, 'stat', 5000); spans.push(span()); shift += 2 * 1000 * 30 * Math.pow(2, i) - 1000; }
      out.spans = spans;
    } finally { pool.close(); }
    return out;
  };
  const nowP = run(SF);   // the scene and its RED copies run side by side (each its own pool)
  // r3409: THE HOSTED RED, PLACED — a worker whose boot is slow: with the wait on the fact the scene holds; without it the hosted red
  // comes back. r4213 (the hosted run of 2.369.419: the control came back as the healthy scene): the boot was a FIXED 400 ms from the
  // spawn, raced against the main thread's work before the first press (the mutant copies below, the other scenes' starts) — now the
  // boot is HELD until the scene lets it go (a file the held script waits for, on the worker's own thread, never load): the RED
  // control lets boot 1 go only after its first timed press has settled; the slow leg lets each boot go HOLD_LET_MS after its first
  // call was sent. A hold whose bound (HOLD_BOUND_MS) runs out says so by a named line below, never a hang
  const slowHold = heldBoot('slow'), redHold = heldBoot('red');
  const slowP = run(SF, { workerPath: slowHold.script, hold: slowHold }), slowRedP = run(SF, { workerPath: redHold.script, warm: false, hold: redHold });
  // RED CONTROLS, each over the copy without its rule
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const ATT = '    if (hp && !opts.attended) return Promise.reject(pathHungRefusal(hp.path, hp.ms));\n', FGV = '    this._forgive(call.payload, call.op);   // r275 / r316: the path answered — what its entry\'s kind lets this reply clear leaves\n';
  const noAtt = src.split(ATT).length === 2 ? mutantCopies('safe-fs-path-memory-att', REPO).load('src/safe-fs.js', anchored(src, ATT, '    if (hp) return Promise.reject(pathHungRefusal(hp.path, hp.ms));\n', 'press-refused'), 'press-refused') : null;   // stale-pins: kept (the RED's planted line: the memory refusing a press)
  const noFgv = src.split(FGV).length === 2 ? mutantCopies('safe-fs-path-memory-fgv', REPO).load('src/safe-fs.js', anchored(src, FGV, '', 'never-forgiven'), 'never-forgiven') : null;
  const WIDE_FGV = "        if (p === h && m.self) for (const sk of Object.keys(m.self)) if (sk === key || (wide && WIDE_OPS.has(sk))) { delete m.self[sk]; changed = true; }\n";
  const tooWide = src.split(WIDE_FGV).length === 2 ? mutantCopies('safe-fs-path-memory-wide', REPO).load('src/safe-fs.js', anchored(src, WIDE_FGV, "        if (p === h || p.startsWith(h.endsWith('/') ? h : h + '/')) { this._hung.delete(h); continue; }\n", 'forgiven-too-wide'), 'forgiven-too-wide') : null;   // stale-pins: kept (r275's wide rule, the RED's copy)
  const [now, r1, r2, r3, slow, slowRed] = await Promise.all([nowP, noAtt ? run(noAtt) : null, noFgv ? run(noFgv) : null, tooWide ? run(tooWide) : null, slowP, slowRedP]);
  ok(slow.press === 'answered' && slow.after === 'answered' && slow.deadPress === 'path-hung, tried' && slow.deadEnds === 1 && slow.renewed, `a worker whose boot is SLOW (held: let go ${HOLD_LET_MS} ms after the scene's first call was sent): the scene waits for its first answer — the press answers (${slow.press}), the dead press ends ONE worker (${slow.deadEnds}), the memory renewed (${slow.renewed})`, slow);
  ok(slow.warmMs.length === 2 && slow.warmMs.every((ms) => ms > 300), `the slow leg's HELD WINDOW: each boot (the first, and the one after the dead press) outlived a timed press's 300 ms deadline — the scene's first call waited ${slow.warmMs.join(' ms, ')} ms`, slow.warmMs);
  ok(slowRed.bootAtPress !== 'loaded' && slowRed.aliveAtDeadPress === 0, `the RED control's HELD WINDOW: when the first timed press settled, boot 1 was ${slowRed.bootAtPress} (never loaded); the dead press was sent with ${slowRed.aliveAtDeadPress} live worker (in the pool's respawn window)`, { bootAtPress: slowRed.bootAtPress, aliveAtDeadPress: slowRed.aliveAtDeadPress });
  ok(slowRed.press === 'path-hung, tried' && slowRed.deadPress === 'no-worker' && slowRed.deadEnds === 0 && !slowRed.renewed, `RED CONTROL (no wait on the fact): the HOSTED RED's own answers, reproduced by a HELD boot — the first timed press carries the worker's boot and overruns its 300 ms (${slowRed.press}), then the dead press falls in the pool's respawn window (${slowRed.deadPress}), ${slowRed.deadEnds} worker ended, the memory renewed: ${slowRed.renewed}`, slowRed);
  const expired = [...slowHold.expired(), ...redHold.expired()];
  ok(expired.length === 0, `no held boot ran out its bound (${HOLD_BOUND_MS / 1000} s): the scene let each one go itself${expired.length ? ' — RAN OUT: ' + expired.join(', ') : ''}`, expired);
  console.log(`  [measure] ${JSON.stringify(now)}`);
  ok(now.unmarked0 === 'path-hung' && now.press === 'answered' && now.after === 'answered', `the press after a recovery: an unmarked call is refused (${now.unmarked0}); the person's press is asked at once (${now.press}); answered, the path is forgiven — the next unmarked call is asked too (${now.after})`, now);
  ok(now.deadPress === 'path-hung, tried' && now.deadEnds === 1 && now.renewed && now.unmarked === 'path-hung' && now.unmarkedEnds === 1, `the press on a still-dead path is tried once — ONE worker ends (${now.deadEnds}), the memory renewed (${now.renewed}), its words the memory's own (${now.deadPress}); an unmarked caller after it is refused, no worker (${now.unmarked})`, now);
  ok(now.otherOp === 'answered' && now.under === 'answered' && now.listingKept && now.listingPress !== 'path-hung' && now.listingForgiven,
    `r316 MUST 1: a listing's entry survives the folder's own other op (${now.otherOp}) and a reply under it (${now.under}) — still refused (${now.listingKept}); a listing that replies at that path forgives it (${now.listingPress} ⇒ ${now.listingForgiven})`, now);
  ok(now.joined.sent === 1 && now.joined.pa === 'answered' && now.joined.pb === 'answered', `two presses of the same thing at once are ONE call in flight (${now.joined.sent} sent; both ${now.joined.pa})`, now.joined);
  ok(JSON.stringify(now.spans) === JSON.stringify([30000, 60000, 120000, 240000, 480000, 480000]), `a path that ends a worker again is kept twice as long each time, at most 16 × (${now.spans.map((x) => x / 1000 + ' s').join(', ')})`, now.spans);
  ok(!!r3 && !r3.listingKept, `RED CONTROL (r275's rule — any reply at or under clears every kind): the folder's own other op clears its listing's entry (${r3 && r3.listingKept})`, r3);
  ok(!!r1 && r1.press === 'path-hung', `RED CONTROL (no attended rule): the person's press after a recovery is refused (${r1 && r1.press})`, r1);
  ok(!!r2 && r2.press === 'answered' && r2.after === 'path-hung', `RED CONTROL (never forgiven): the press answers, yet the next unmarked call is still refused (${r2 && r2.after})`, r2);
  // the refusal's words fit the 120 characters the folder field shows: a long path cut in its middle, the whole path kept apart
  const LONG = '/scratch-b23e5/' + 'a-very-long-folder-name/'.repeat(8) + 'the-file.txt', E = SF.pathHungRefusal(LONG, 30000);
  ok(E.message.length <= 120 && E.message.includes('…') && E.message.endsWith('the-file.txt') && E.hungPath === LONG && SF.pathHungRefusal('/scratch-b23e5/short', 30000).message.endsWith(': /scratch-b23e5/short'),
    `the refusal fits 120 characters (${E.message.length}): «${E.message}» — its path whole in hungPath`, E.message);
}

console.log('①c the person\'s words: the files router says a remembered dead path in the reader\'s language (storage_path_hung)');
{
  const express = require('express');
  const pool = new SF.SafeFs({ poolSize: 1, name: 'path-memory-route', hungMs: 60000 });
  const app = express(); app.use(express.json()); app.locals.safeFs = pool;
  app.use(require(path.join(REPO, 'src/routes/files.js')));
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r));
  try {
    pool._noteHung({ path: '/scratch-b23e5/route-dead' }, 'stat', 15000);
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/file/info?path=${encodeURIComponent('/scratch-b23e5/route-dead/a.txt')}`);
    const j = await r.json().catch(() => null);
    ok(r.status === 503 && j && j.code === 'storage_path_hung' && j.params && j.params.s >= 1 && j.params.s <= 60 && /^this folder or file did not answer in time — try again in \d+ s$/.test(j.error),
      `the files router: 503 storage_path_hung «${j && j.error}» (its seconds a param the page words in zh / ja)`, j);
    // r275: the request a person's press marks (X-VibeSpace-Attended) is asked despite the memory — the stand-in path answers with the file
    // system's own error, so the path is forgiven and the next unmarked request is asked too
    // B-23e5's remainder (r1368 / 主开发 r1396): THE MARK = THE HEADER, AND NO BEARER, AND NOT A FOREIGN PAGE (write-origin.js
    // foreignPageWhy): a stated site must be same-origin, a stated origin ours; where the browser states neither (a plain-http LAN
    // address, a same-origin read) the custom header and no token are the proof. Each road asked over the real router (node:http — the
    // headers go as written), the dead path noted again before each (an asked press forgives it)
    const port = srv.address().port, P = `/api/file/info?path=${encodeURIComponent('/scratch-b23e5/route-dead/a.txt')}`, OURS = `http://127.0.0.1:${port}`;
    const MARK1 = { 'X-VibeSpace-Attended': '1' };   // stale-pins: kept (the request a press sends, made here)
    const REFUSED = [
      ['the mark with a BEARER (an agent\'s, a job\'s, a key\'s token)', { ...MARK1, 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer vsst_x' }],
      ['the mark from another site (cross-site stated)', { ...MARK1, 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' }],
      ['the mark from a sibling of the fleet (same-site stated)', { ...MARK1, 'Sec-Fetch-Site': 'same-site' }],
      ['the mark with a foreign Origin, no site stated', { ...MARK1, Origin: 'https://evil.example' }],
      ['the mark from a sandboxed frame (Origin null)', { ...MARK1, Origin: 'null' }],
      ['no mark', {}],
      ['a mark that is not «1»', { 'X-VibeSpace-Attended': 'yes' }],
    ];
    const ASKED = [
      ['our page with the site stated (https, localhost)', { ...MARK1, 'Sec-Fetch-Site': 'same-origin' }],
      ['our page on a plain-http LAN address (nothing stated: the custom header is the proof)', { ...MARK1 }],
      ['an old browser on our page (our Origin, no site)', { ...MARK1, Origin: OURS }],
    ];
    const roadsOf = async (prt) => {
      const out = [];
      for (const [what, headers] of [...REFUSED, ...ASKED]) {
        await pool._noteHung({ path: '/scratch-b23e5/route-dead' }, 'stat', 15000);
        const r1 = await httpAsk(prt, P, headers);
        const r2 = await httpAsk(prt, P, {});   // the unmarked request after it: asked only if the press was asked (and forgave)
        out.push({ what, hung: !!(r1.json && r1.json.code === 'storage_path_hung'), after: !!(r2.json && r2.json.code === 'storage_path_hung') });
      }
      return out;
    };
    const markRoads = await roadsOf(port);
    const wrong = markRoads.filter((x, i) => (i < REFUSED.length ? !x.hung || !x.after : x.hung || x.after));
    console.log('    the roads judged: ' + markRoads.map((x) => `${x.what} → ${x.hung ? 'refused' : 'ASKED'}`).join(' · '));
    ok(!wrong.length, `THE MARK's LAW (r1396), over the real router: ${REFUSED.length} roads are no press — refused by the memory as built (a bearer, another site, a sibling, a foreign or null Origin, no mark, a mark not «1»); ${ASKED.length} are a press — asked, answered, the path forgiven (our page with the site stated, a plain-http address with nothing stated, an old browser with our Origin)`, wrong);
    // RED CONTROLS, each over a copy of the router without one third of the law
    const fsrc = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
    const FOREIGN = '  && !pressBearer(req.headers) && !foreignPageWhy(req.headers, ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) })));';
    const routeCopy = async (tag, to) => {
      if (fsrc.split(FOREIGN).length !== 2) return null;
      const R = mutantCopies('safe-fs-path-memory-route-' + tag, REPO).load('src/routes/files.js', anchored(fsrc, FOREIGN, to, tag), tag);
      const a2 = express(); a2.use(express.json()); a2.locals.safeFs = pool; a2.use(R);
      const s2 = a2.listen(0, '127.0.0.1'); await new Promise((r) => s2.once('listening', r));
      try { return await roadsOf(s2.address().port); } finally { s2.close(); }
    };
    const noForeign = await routeCopy('no-foreign', '  && !pressBearer(req.headers));');
    const noBearer = await routeCopy('no-bearer', '  && !foreignPageWhy(req.headers, ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) })));');
    ok(!!noForeign && !noForeign[1].hung && !noForeign[3].hung && noForeign[0].hung, `RED CONTROL (the foreign verdict cut, in a copy of the router): another site's mark and a foreign Origin's are ASKED (${noForeign && noForeign.slice(1, 5).map((x) => (x.hung ? 'refused' : 'asked')).join(' / ')})`, noForeign);
    ok(!!noBearer && !noBearer[0].hung && noBearer[1].hung, `RED CONTROL (the bearer rule cut, in a copy): the mark with an agent's token is ASKED (${noBearer && (noBearer[0].hung ? 'refused' : 'asked')})`, noBearer);
    const ops = fs.readFileSync(path.join(REPO, 'src/lib/file-explorer-ops.js'), 'utf8');
    ok(ops.includes("if (d && d.code === 'storage_path_hung') return t('this folder or file did not answer in time — try again in {s} s', { s: (d.params && d.params.s) || 30 });"), 'the page words it through fsErrorText (the Files window, a file\'s view, the chat\'s link-open, downloads)');
    // r316: THE DOOR CENSUS — every place in the page that sets the mark is a row, its door named as a person's press; a site with no
    // row is red; the header's name comes from the ONE constant (file-explorer-ops ATTENDED_HEADERS)
    const DOORS = [
      ['src/lib/file-explorer-ops.js', "export const ATTENDED_HEADERS = Object.freeze({ 'X-VibeSpace-Attended': '1' });", 'the ONE constant'],
      ['src/lib/file-explorer.js', "import { installExplorerOps, fsErrorText, ATTENDED_HEADERS } from './file-explorer-ops.js';", 'its import'],
      ['src/lib/file-explorer.js', "    const init = attended ? { headers: ATTENDED_HEADERS } : undefined;", 'the listing a marked navigate sends'],
      ['src/lib/file-explorer.js', "btnRefresh.onclick = () => this.refresh({ attended: true });", 'THE DOOR: the Refresh button pressed'],
      ['src/lib/file-explorer.js', "act: () => this.refresh({ attended: true }) },", 'THE DOOR: Refresh from the folded toolbar menu, pressed'],
      ['src/lib/file-explorer-ops.js', "items.push({ label: t('Refresh'), action: () => this.refresh({ attended: true }) });", 'THE DOOR: Refresh from the context menu, pressed (r336)'],
      // B-23e5's remainder (r1368): THE OTHER DOORS A PERSON PRESSES — each its own row
      ['src/lib/file-explorer.js', "btnUp.onclick = () => this.navigateUp({ attended: true });", 'Up, the button pressed'],
      ['src/lib/file-explorer.js', "up: { el: btnUp, word: t('Go up'), act: () => this.navigateUp({ attended: true }) },", 'Up from the folded toolbar menu, pressed'],
      ['src/lib/file-explorer.js', "item.onclick = () => { this.setHost(bkHost, { navigate: false }); this.navigate(bk.path, { attended: true }); };", 'a bookmark pressed'],
      ['src/lib/file-explorer.js', "{ label: t('Open'), action: () => { this.setHost(bkHost, { navigate: false }); this.navigate(bk.path, { attended: true }); } },", 'a bookmark\'s menu Open, pressed'],
      ['src/lib/file-explorer.js', "if (item.isDirectory) this.navigate(fullPath, { attended: true });", 'a folder opened by a double-click (the grid and the list)'],
      ['src/lib/file-explorer.js', "else this.app.openFile(fullPath, item.name, { host: this._host || undefined, attended: true });", 'a file opened by a double-click (the grid and the list) — the code editor\'s open'],
      ['src/lib/file-explorer.js', "this.navigate(info.path, { attended: info.how === 'enter' || info.how === 'pick' });", 'the path field\'s Enter or a picked row (never its blur, never an api set)'],
      ['src/lib/file-explorer-ops.js', "action: () => this.navigate(fullPath, { attended: true }) });", 'the context menu\'s Open of a folder'],
      ['src/lib/file-explorer-ops.js', "this.app.openFile(fullPath, dataset.name, { host: this._host || undefined, attended: true }) });", 'the context menu\'s Open of a file'],
      ['src/lib/file-explorer-ops.js', "this.app.openEditor(fullPath, dataset.name, { host: this._host || undefined, attended: true }) });", 'the context menu\'s Edit'],
      ['src/lib/file-explorer-ops.js', "{ hex: true, host: this._host || undefined, attended: true }) });", 'the context menu\'s Open as Hex'],
      ['src/lib/code-editor.js', "import { fsErrorText, ATTENDED_HEADERS, namesText, stillSavingWords } from './file-explorer-ops.js';", 'its import'],
      ['src/lib/code-editor.js', "pressed ? { headers: ATTENDED_HEADERS } : undefined);", 'the code editor\'s open by a press (its first load, once)'],
      ['src/lib/code-editor.js', "opts.auto ? undefined : { headers: ATTENDED_HEADERS });", 'the code editor\'s PRESSED reload (the button, the disk chip — never the watch\'s {auto})'],
      ['src/lib/code-editor.js', "headers:{'Content-Type':'application/json', ...ATTENDED_HEADERS}, body:JSON.stringify({path:this.filePath,content", 'the code editor\'s save (the button, Mod-s, save-and-close)'],
      ['src/lib/doc-window-ui.js', "import { fsErrorText, ATTENDED_HEADERS, stillSavingWords } from './file-explorer-ops.js';", 'its import'],
      ['src/lib/doc-window-ui.js', "const chk = await fetch('/api/file/info?' + q(host, path), { headers: ATTENDED_HEADERS })", 'the document window\'s save, its OWN CHECK — the press\'s one try (refused ⇒ no write)'],
      ['src/lib/doc-window-ui.js', "headers: { 'Content-Type': 'application/json', ...ATTENDED_HEADERS }, body: JSON.stringify({ path, content: text", 'the document window\'s save'],
      ['src/lib/external-editor.js', "import { fsErrorText, ATTENDED_HEADERS, namesText, stillSavingWords } from './file-explorer-ops.js';", 'its import'],
      ['src/lib/external-editor.js', "headers:{'Content-Type':'application/json', ...ATTENDED_HEADERS}, body: JSON.stringify({ path: filePath, content: newContent", 'the pane editor\'s save (the button, Mod-s / Mod-g, the terminal\'s Ctrl+G finish)'],
      // the rebuild (r1396): the open's FIRST call for every viewer, and the presses its first build missed
      ['src/lib/file-viewer.js', "import { ATTENDED_HEADERS } from './file-explorer-ops.js';", 'its import'],
      ['src/lib/file-viewer.js', "opts.attended ? { headers: ATTENDED_HEADERS } : undefined);", 'THE OPEN\'S FIRST CALL — the file\'s info, for every viewer behind it (hex, HTML, the rendered ones, the editor); a storage refusal ends the open there'],
      ['src/lib/file-viewer.js', "new CodeEditor(winInfo, filePath, fileName, app, { host, line: opts.line, view: !opts.line, attended: !!opts.attended });", 'an HTML file\'s editor rides the press'],
      ['src/lib/file-viewer.js', "...(host ? { host } : {}), attended: true });", 'an archive\'s entry pressed (its extracted copy opened)'],
      ['src/lib/app.js', "...(opts.attended ? { attended: true } : {}) });", 'a .md opened by a press: the document window hears it'],
      ['src/lib/doc-window.js', "signal, deps, attended }); } },", 'the document window mounted with the press'],
      ['src/lib/doc-window-ui.js', "const r = await fetchJson('/api/file/content?' + q(host, path), pressed ? { headers: ATTENDED_HEADERS } : undefined);", 'the document window\'s read, marked only when pressed'],
      ['src/lib/doc-window-ui.js', "const a = await read({ pressed: true });", 'the document window\'s FIRST read when a press opened it (alone; its info after it)'],
      ['src/lib/file-explorer.js', "{ host: this._host || undefined, attended }); return; }", 'a pressed path that is a file opens by the same press'],
      ['src/lib/file-explorer.js', "navigateUp({ attended = false } = {}) { this.navigate(this.currentPath.replace(/\\/[^/]+\\/?$/, '') || '/', { attended }); }", 'Up hands its press on'],
      ['src/lib/file-explorer.js', "  refresh({ attended = false } = {}) { this.navigate(this.currentPath, { attended }); }", 'Refresh hands its press on (a refresh after a file op: none)'],
      ['src/lib/phone-files.js', "ex.navigate(c.dataset.path, { attended: true });", 'a breadcrumb pressed (the phone)'],
      ['src/lib/file-explorer-uploads.js', "this.app.openFile(entry.path, entry.name, { attended: true });", 'an upload\'s row pressed'],
      ['src/lib/file-explorer-ops.js', "this.app.openFileExplorer(fullPath, { attended: true }) });", 'the context menu\'s Open in new window, pressed'],
      ['src/lib/file-explorer.js', "this.app.openFileExplorer(bk.path, { host: bkHost || undefined, attended: true }) },", 'a bookmark\'s Open in new window, pressed'],
      ['src/lib/file-explorer.js', "if (this._startPath) this.navigate(this._startPath, { attended: startPressed });", 'a new window\'s first listing — marked only when a press opened it, ONCE (never a restore, a replay, a later host change)'],
      ['src/lib/file-explorer.js', "else this._loadHome({ attended: startPressed });", 'a window a press opened with no folder: its home listing, that press once'],
      ['src/lib/file-viewer.js', "{ headers: ATTENDED_HEADERS }).then((r) => (r.status === 503 ? r.json().catch(() => ({})) : null), () => null);", 'the viewers\' ⟳ Reload: its first call, the file\'s info'],
      ['src/lib/doc-window.js', "return new CodeEditor(sub, p, name, app, { host: h, attended }); };", 'the document window\'s Raw pane opened by a press (its first load once)'],
      ['src/lib/doc-window-ui.js', "showRaw({ pressed: true }); return; }", 'the Raw press (rich → raw)'],
      ['src/lib/doc-window-ui.js', "showRich(); await load({ pressed: true });", 'the Raw press back (raw → rich)'],
      ['src/lib/doc-window-ui.js', "setDirty(false); load({ pressed: true }); }, { signal });", 'the conflict bar\'s Reload pressed'],
      // B-23e5 (a) (r1442): the helper-opened presses, marked through their helpers
      ['src/lib/app.js', "this.openFileExplorer(undefined, { attended: true }));   // B-23e5 (a): pressed", 'the welcome screen\'s Files, pressed'],
      ['src/lib/artifact-card.js', "action: () => app.openFileExplorer(dir, { host: b.host || undefined, attended: true }) });", 'an artifact card\'s Show in Files, pressed'],
      ['src/lib/artifacts-window.js', "if (cv) return cv._openArtifact(b, { pressed });", 'an Artifacts row hands its press to the chat\'s one door'],
      ['src/lib/artifacts-window.js', "openArtifactRow(app, sessionId, r._afRow, { pressed: true }); });", 'an Artifacts row pressed'],
      ['src/lib/chat-renderers.js', "import { fsErrorText, ATTENDED_HEADERS } from './file-explorer-ops.js';", 'its import'],   // stale-pins: kept (chat-renderers.js's own import — the text the editors' imports no longer hold)
      ['src/lib/chat-renderers.js', "{ host: b.host || undefined, attended: true, from: this._sourceWinId()", 'an artifact card\'s open with no chat door (the card pressed)'],
      ['src/lib/chat-renderers.js', "const open = () => rel ? this._openRelTarget(link, rel, { pressed: true }) : this._openLinkTarget(link, url, fp, { pressed: true });", 'a chat path link pressed (Ctrl+click, the touch menu\'s Open)'],
      ['src/lib/chat-renderers.js', "action: () => rel ? this._openRelTarget(link, rel, { pressed: true }) : this._openLinkTarget(link, url, fp, { pressed: true }) },", 'a chat path link\'s context menu Open'],
      ['src/lib/chat-renderers.js', "spend ? { headers: ATTENDED_HEADERS } : undefined);", 'a relative link\'s candidate probe — the press SPENT at the first storage refusal'],
      ['src/lib/chat-renderers.js', "if (info.isDirectory) this.app.openFileExplorer(c, { host, from, attended: spend });", 'a relative link\'s folder opened by the press (unspent)'],
      ['src/lib/chat-renderers.js', "else this.app.openFile(c, c.split('/').pop(), { host, from, attended: spend });", 'a relative link\'s file opened by the press (unspent)'],
      ['src/lib/chat-renderers.js', "const openHit = (h) => { const from = this._sourceWinId(); return type === 'd' ? this.app.openFileExplorer(h, { host, from, attended: spend })", 'a located hit opened by the press (unspent)'],
      ['src/lib/chat-renderers.js', "pressed ? { headers: ATTENDED_HEADERS } : undefined)", 'a path link\'s FIRST call — the file\'s info, marked when pressed'],
      ['src/lib/chat-renderers.js', "this.app.openFileExplorer(cleanPath, { host, from: this._sourceWinId(), attended: pressed });", 'a path link\'s folder opened by the press'],
      ['src/lib/chat-renderers.js', "this.app.openFile(cleanPath, cleanPath.split('/').pop(), { line: lineNum, host, from: this._sourceWinId(), attended: pressed });", 'a path link\'s file opened by the press'],
      ['src/lib/chat-view.js', "onOpenArtifact: (b) => this._openArtifact(b, { pressed: true }), // lane artifacts-model", 'the Artifacts chip\'s row, pressed'],
      ['src/lib/chat-view.js', "onOpenArtifact: (b) => this._openArtifact(b, { pressed: true }), // lane artifacts-registries", 'an artifact card pressed (the card and the chip\'s row share ONE door)'],
      ['src/lib/chat-view.js', "...(pressed && !quiet ? { attended: true } : {}) });", 'the chat\'s artifact door: marked only when pressed — never the auto open (quiet)'],
      ['src/lib/command-mode.js', "run: (c) => c.app.openFileExplorer(undefined, { attended: true }) });", 'the command «Open file explorer» (a person\'s command)'],
      ['src/lib/design-home.js', "action: () => app.openFileExplorer(d.dir, { host: d.host || undefined, attended: true }) },", 'the design home\'s Show in Files, pressed'],
      ['src/lib/file-explorer.js', "this.navigate(d.home || '/', { attended });", 'the home listing hands on the press it was given (only the window\'s opening press gives one)'],
      ['src/lib/search-window.js', "const activate = (hit, { pressed = false } = {}) => {", 'the search window\'s hit door — marked only when pressed'],
      ['src/lib/search-window.js', "activate(row._hit, { pressed: true }); };", 'a search hit\'s row pressed'],
      ['src/lib/search-window.js', "if (r) activate(r._hit, { pressed: true });", 'a search hit chosen by Enter'],
      ['src/lib/session-card.js', "run: (c) => c.app.openFileExplorer(c.s.cwd, { host: c.s.host || undefined, attended: true }) });", 'the command «Open working directory» (a person\'s command)'],
      ['src/lib/setup-flows.js', "content.querySelector('#welcome-files')?.addEventListener('click', () => this.openFileExplorer(undefined, { attended: true }));", 'the setup welcome\'s Files, pressed'],
      ['src/lib/setup-flows.js', "done(); this.openFileExplorer(undefined, { attended: true }); };", 'the onboarding\'s Files, pressed'],
      ['src/lib/sidebar-mounts.js', "ibtn(MI.folder, 'Browse in file explorer', () => { this.app.openFileExplorer(m.path, { attended: true }); }),", 'a mount row\'s Browse button, pressed'],
      ['src/lib/sidebar-mounts.js', "if (m.mounted) { this.app.openFileExplorer(m.path, { attended: true }); return; }", 'a mounted row pressed'],
      ['src/lib/sidebar-mounts.js', "open.onclick = () => this.app.openFileExplorer(m.mountpoint, { attended: true });", 'a storage row\'s Open, pressed'],
      ['src/lib/phone-files.js', "return app.openFileExplorer(path || undefined, pressed ? { attended: true } : undefined);", 'the phone\'s Files door: marked only when a tap opened it'],
      ['src/lib/phone-files.js', "return openFilesDoor(app, { pressed: true }); };", 'the phone nav\'s Files, tapped'],
      ['src/lib/phone-files.js', "openFilesDoor(app, { path: c.path, pressed: true }); };", 'a For-you Files chip (a mount\'s too), tapped'],
      ['src/lib/trailing-bar.js', "run: (app) => openFilesDoor(app, { pressed: true })", 'the trailing bar\'s Files, pressed'],
      ['src/lib/chat-renderers.js', "{ from: this._sourceWinId(), attended: true });   // B-23e5 (a): the toast's Search by name, pressed", 'a missing link\'s toast: Search by name, pressed'],
      ['src/lib/chat-renderers.js', "this.app.openFileExplorer(d, { host, from: this._sourceWinId(), attended: true }); return d; }", 'a missing link\'s toast: Open the nearest folder, pressed'],
      ['src/lib/artifacts-window.js', "onOpen: (x) => openArtifactRow(app, sessionId, x, { pressed: true }) })); });", 'an Artifacts row\'s ⋯ Open beside, pressed'],
      ['src/lib/artifacts-window.js', "if (b.path && app.openFile) app.openFile(b.path, b.name || b.path.split('/').pop(), { host: b.host || undefined, attended: pressed });", 'an Artifacts row with no chat door: its file, the row\'s press'],
    ];
    // a marked site: the header's constant or name, or a navigate / an open that passes `attended:` (the files' own mark — never the
    // spending ceiling's attended turns, another meaning)
    const TOKENS = ['X-VibeSpace-Attended', 'ATTENDED_HEADERS', 'refresh({ attended: true })', 'read({ pressed: true })', 'load({ pressed: true })', 'showRaw({ pressed: true })'];   // stale-pins: kept (the census's own tokens)
    const OPENS = ['navigate(', 'navigateUp(', 'openFile(', 'openEditor(', 'openDoc(', 'CodeEditor(', 'mountDocWindow(', 'openFileExplorer('];
    const marked = (line) => TOKENS.some((t) => line.includes(t)) || /(?<!function )\b(load|read|showRaw|_openLinkTarget|_openRelTarget|_openArtifact|openArtifactRow|openFilesDoor|activate)\([^()]*\{[^}]*\bpressed(?::(?!\s*false\b)|\s*[,}])/.test(line) || (OPENS.some((o) => line.includes(o)) && /\battended(\s*:(?!\s*false\b)|\s*[,}])/.test(line));   // `attended: …` (never `attended: false`) or handed on as `{ …, attended }`
    const census = (read) => {
      const found = [];
      for (const f of fs.readdirSync(path.join(REPO, 'src/lib')).filter((n) => n.endsWith('.js')).map((n) => 'src/lib/' + n)) {
        for (const line of read(f).split('\n')) if (marked(line) && !/^\s*(\/\/|\*|\/\*\*)/.test(line)) found.push([f, line]);
      }
      return found.filter(([f, line]) => !DOORS.some(([df, text]) => df === f && line.includes(text)));
    };
    const readSrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
    const strays = census(readSrc), missing = DOORS.filter(([f, text]) => !readSrc(f).includes(text));
    const planted = census((f) => (f === 'src/lib/code-editor.js' ? readSrc(f) + "\nfetch('/api/file/write', { headers: { ...ATTENDED_HEADERS } });\n" : f === 'src/lib/doc-window-ui.js' ? readSrc(f) + "\n  btnX.addEventListener('click', () => load({ pressed }));\n" : readSrc(f)));   // stale-pins: kept (the census's planted RED site)
    ok(!strays.length && !missing.length && planted.length === 2 && planted.some(([pf]) => pf === 'src/lib/code-editor.js') && planted.some(([pf]) => pf === 'src/lib/doc-window-ui.js'),
      `THE DOOR CENSUS (r316 / r336 / r1368): the mark is set at ${DOORS.length} rows — the constant, its imports, the marked listing, Refresh, and every other door a person presses (a folder, a bookmark, the path field, Up, the context menu\'s Open / Edit / Hex, the code editor\'s open / pressed reload / save, the document window\'s and the pane editor\'s saves); no site without a row (${strays.length}), no row gone (${missing.length}); RED (a planted marked save in the code editor, a planted \`load({ pressed })\` in the doc window): named (${planted.length})`, { strays, missing, planted });
    // B-23e5's remainder (r1368): A DOOR WITH NO MARK is red by name (a door's row whose site lost it), and A BACKGROUND READ that carries
    // it is red by name — the mark is a person's press and nothing else (a timer, a watch, an auto reload, a restore, a refresh after a
    // file op, the folder field's completion)
    const BACKGROUND = [
      ['src/lib/code-editor.js', "else await this.reloadFromDisk({ auto: true });", 'the freshness watch\'s auto reload'],
      ['src/lib/code-editor.js', "const res = await fetch(`/api/file/info?path=${encodeURIComponent(this.filePath)}", 'the editor\'s baseline and watch reads'],
      ['src/lib/doc-window-ui.js', "S.base = await info();", 'the document window\'s baseline after a load and a save'],
      ['src/lib/doc-window-ui.js', "const disk = await info();", 'the document window\'s check timer'],
      ['src/lib/doc-window-ui.js', "if (S.waiting) { if (!S.busy && await info()) await endWait(); return; }", 'the document window\'s wait for its file'],
      ['src/lib/file-explorer-ops.js', "    this.refresh();", 'the explorer\'s refresh after a file op'],
      ['src/lib/app.js', "action: 'openFileExplorer', replay: (app, spec, { syncId } = {}) => app.openFileExplorer(spec.path, { syncId, host: spec.host }),", 'a Files window\'s replay / restore (it never passes the press)'],
      ['src/lib/path-field.js', "'/api/dir-complete') + qs", 'the folder field\'s completion'],
      ['src/lib/file-explorer.js', "    if (navigate) this._loadHome();", 'a host change\'s home listing (the window\'s press was used once)'],
      ['src/lib/doc-window-ui.js', "    await load({ first: true });", 'the document window\'s load when the file it waited for lands'],
      ['src/lib/doc-window-ui.js', "if (v === 'repaint') await load();", 'the document window\'s repaint after a change on disk'],
      ['src/lib/doc-window-ui.js', "if (S.mode !== 'raw') showRaw(); else", 'the document window\'s automatic raw view (a file the rich editor cannot keep)'],
    ];
    const bgOf = (read) => BACKGROUND.map(([f, text, why]) => { const lines = read(f).split('\n').filter((l) => l.includes(text)); return { f, why, found: lines.length, marked: lines.filter(marked).length }; });
    const bg = bgOf(readSrc), bgBad = bg.filter((b) => !b.found || b.marked);
    const bgPlant = bgOf((f) => (f === 'src/lib/code-editor.js' ? readSrc(f).replace("else await this.reloadFromDisk({ auto: true });", "else await this.reloadFromDisk({ auto: true }); fetch(u, { headers: ATTENDED_HEADERS });") : readSrc(f))).filter((b) => b.marked);   // stale-pins: kept (the planted RED)
    const doorCut = DOORS.filter(([f, text]) => !(f === 'src/lib/code-editor.js' ? readSrc(f).replace("opts.auto ? undefined : { headers: ATTENDED_HEADERS });", "undefined);") : readSrc(f)).includes(text));
    ok(!bgBad.length && bgPlant.length === 1 && bgPlant[0].why === 'the freshness watch\'s auto reload' && doorCut.length === 1 && /PRESSED reload/.test(doorCut[0][2]),
      `B-23e5's remainder: ${BACKGROUND.length} background reads carry NO mark (${bg.map((b) => `${b.why}: ${b.found}`).join(' · ')}); RED by name: a mark planted on the watch's auto reload, and the pressed reload with its mark cut («${doorCut[0] && doorCut[0][2]}»)`, { bgBad, bgPlant, doorCut: doorCut.map((d) => d[2]) });
    // B-23e5's remainder (r1396 / r1442): THE PRESS CENSUS, STRUCTURAL — every press handler (an onclick, a click / dblclick / keydown
    // listener, a menu `action`, a toolbar `act`, a door's `run`, the path field's onCommit) in THE FILES WINDOW, ITS VIEWERS AND ITS EDITORS
    // whose body opens a file or a folder (navigate / navigateUp / refresh / openFile / openEditor / openDoc / openFileExplorer /
    // reloadFromDisk / renderInto) carries the mark ON THAT CALL, or is an EXCEPTION row with its reason — a press with no mark is red BY
    // NAME. The presses OUTSIDE that surface (the chat's path links, the search window, artifact cards…) are r1442's next unit: printed here
    const PRESS = /(\.onclick\s*=|addEventListener\(\s*'(?:click|dblclick|pointerup|keydown)'|\baction:\s*(?:async\s*)?\([^)]*\)\s*=>|\bact:\s*(?:async\s*)?\([^)]*\)\s*=>|\brun:\s*(?:async\s*)?\([^)]*\)\s*=>|onCommit:|\btool\('[\w-]+',[^\n]*\(\) =>|\bopen:\s*\(b\)\s*=>|\bonOpenArtifact:\s*\(b\)\s*=>)/;   // tool(…): the document window's toolbar; open / onOpenArtifact: an artifact card's and the chip's press
    // r1442 (a): THE CENSUS FOLLOWS THE NAMED HELPERS over all of src/lib — a chat path link (_openLinkTarget / _openRelTarget), the chat's
    // artifact door (_openArtifact), an Artifacts row (openArtifactRow), and, in their own files only, the search window's hit door
    // (activate), the document window's reads (load / toggleRaw / showRaw) and the Files window's refresh
    const OWN = { 'src/lib/search-window.js': ['activate'], 'src/lib/doc-window-ui.js': ['load', 'toggleRaw', 'showRaw'], 'src/lib/file-explorer.js': ['refresh'], 'src/lib/file-explorer-ops.js': ['refresh'], 'src/lib/phone-files.js': ['refresh'], 'src/lib/file-explorer-uploads.js': ['refresh'] };
    const callsOf = (f) => new RegExp(`\\b(navigate|navigateUp|openFile|openEditor|openDoc|openFileExplorer|reloadFromDisk|renderInto|_openLinkTarget|_openRelTarget|_openArtifact|openArtifactRow|openFilesDoor${(OWN[f] || []).map((x) => '|' + x).join('')})\\(`, 'g');
    const SURFACE = fs.readdirSync(path.join(REPO, 'src/lib')).filter((n) => n.endsWith('.js')).map((n) => 'src/lib/' + n);
    const EXCEPT = [
      ['src/lib/code-editor.js', "run: () => this.reloadFromDisk() },", 'reloadFromDisk marks its own read unless {auto} (its DOORS row: the PRESSED reload)'],
      ['src/lib/code-editor.js', 'btnReload.onclick = () => this.reloadFromDisk();', 'reloadFromDisk marks its own read unless {auto} (its DOORS row: the PRESSED reload)'],
      ['src/lib/file-viewer.js', 'await FileViewer.renderInto(container, filePath, fileName, app, host);', 'the ⟳ Reload\'s re-render rides its first call, the marked info check above it (images and media load by src: no header can ride them)'],
      ['src/lib/doc-window-ui.js', '() => toggleRaw()', 'toggleRaw marks its own reads (showRaw({ pressed: true }) / load({ pressed: true }) — DOORS rows)'],
    ];
    const libFiles = SURFACE;
    const pressSites = (rd, files) => {
      const out = [];
      for (const f of files) {
        const L = rd(f).split('\n'), OPENCALL = callsOf(f);
        L.forEach((l, i) => {
          if (!PRESS.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
          const ind = l.length - l.trimStart().length, body = [l];
          if (/\{\s*$/.test(l)) for (let j = i + 1; j < Math.min(i + 30, L.length); j++) { const lj = L[j]; if (!lj.trim()) continue; if (lj.length - lj.trimStart().length <= ind) break; body.push(lj); }
          for (const b of body) if (!/^\s*\/\//.test(b)) for (const m of b.matchAll(OPENCALL)) if (!(m[1] === 'navigate' && /\bnavigate\(urlInput/.test(b))) out.push({ f, at: i + 1, call: m[1], text: b.trim(), marked: marked(b) });
        });
      }
      return out;
    };
    const sitesNow = pressSites(readSrc, SURFACE), excepted = (x) => EXCEPT.some(([ef, text]) => ef === x.f && x.text.includes(text));
    const unmarkedPress = sitesNow.filter((x) => !x.marked && !excepted(x)), deadExcept = EXCEPT.filter(([ef, text]) => !sitesNow.some((x) => x.f === ef && x.text.includes(text)));
    const plantedPress = pressSites((f) => (f === 'src/lib/file-explorer-ops.js' ? readSrc(f) + "\n    items.push({ label: t('Open'), action: () => this.navigate(fullPath, { attended: false }) });\n    row.addEventListener('dblclick', () => {\n      if (ok) this.app.openFile(p, n, { host });\n    });\n    items.push({ label: t('Open'), action: () => this._openLinkTarget(link, url, fp) });\n" : readSrc(f)), SURFACE).filter((x) => !x.marked && !excepted(x));   // stale-pins: kept (the planted RED presses: `attended: false` is no mark)
    console.log(`    the press census: ${sitesNow.length} opening calls inside press handlers of src/lib (the named helpers followed) — ${sitesNow.filter((x) => x.marked).length} marked, ${sitesNow.filter(excepted).length} excepted`);
    ok(sitesNow.length >= 20 && !unmarkedPress.length && !deadExcept.length && plantedPress.length === 3 && plantedPress.every((x) => x.f === 'src/lib/file-explorer-ops.js') && plantedPress.some((x) => x.call === '_openLinkTarget'),
      `THE PRESS CENSUS (structural, r1396 / r1442 (a)(b)): every opening call inside a press handler of src/lib — the named helpers followed (a chat path link, the chat's artifact door, an Artifacts row, the search window's hit) — carries the mark or is an exception with its reason — unmarked: ${unmarkedPress.map((x) => `${x.f}:${x.at} ${x.call}`).join(', ') || 'none'}; dead exception rows: ${deadExcept.length}; RED by name: a planted menu Open with \`attended: false\` and a planted double-click open (${plantedPress.map((x) => `${x.f.split('/').pop()}:${x.at} ${x.call}`).join(', ')})`, { unmarkedPress, deadExcept, plantedPress });
    // r316 MUST 2: ONE PRESS, ONE WORKER — the listing a press sends carries the mark; the file-info probe after its refusal never does
    const fe = readSrc('src/lib/file-explorer.js'), fr = readSrc('src/routes/files.js');
    ok(fe.includes("const { data, info } = await listingAndProbe(fetch, `/api/files?path=${encodeURIComponent(dirPath)}${this._hp()}`, `/api/file/info?path=${encodeURIComponent(dirPath)}${this._hp()}`, init);") && fe.includes("if (info && !info.isDirectory) { this.app.openFile(")
      && fe.includes("  refresh({ attended = false } = {}) { this.navigate(this.currentPath, { attended }); }") && fe.includes("this._startPressed = !!winInfo._explorerPressed;") && fr.includes("return attendedOf(req) ? { call: (op, payload, opts = {}) => pool.call(op, payload, { ...opts, attended: true }) } : pool;")
      && fr.includes("call: (op, payload, opts) => sfsPlain(req).call(op, payload, opts),") && readSrc('src/dir-collect.js').includes("const IDLE_ONLY = Object.freeze({ idleOnly: true });"),
      'PIN (r316 / r336): the explorer lists and probes through explorer-listing; a refresh after a delete or a host change carries no mark; a restored window none (its press only from openFileExplorer\'s own word); the router hands the mark to the pool; the folder field\'s dir slice, built once, never reads the mark of the request it closed over (B-d833: its calls carry idleOnly only, never a mark)');
    // r336: ONE PRESS, ONE WORKER at the page's own level — the explorer's listing step over a STAND-IN fetch: a storage refusal of the
    // listing is followed by NO second call; a plain error («not a folder») still asks the probe, unmarked; its RED control
    const EL = await import(pathToFileURL(path.join(REPO, 'src/lib/explorer-listing.js')).href);
    const stand = (listing) => { const calls = []; const f = async (url, init) => { calls.push({ url, marked: !!(init && init.headers && init.headers['X-VibeSpace-Attended']) }); return url.startsWith('/api/files') ? { status: listing.status, ok: listing.status < 400, json: async () => listing.body } : { status: 200, ok: true, json: async () => ({ isDirectory: false }) }; }; return { f, calls }; };   // stale-pins: kept (the stand-in fetch's own request)
    const MARK = { headers: { 'X-VibeSpace-Attended': '1' } };   // stale-pins: kept (the stand-in fetch's own request)
    const roads = [
      ['the remembered dead path (503 storage_path_hung)', { status: 503, body: { error: 'this folder or file did not answer in time — try again in 30 s', code: 'storage_path_hung', params: { s: 30 } } }, 1],
      ['the deadline (503, no code)', { status: 503, body: { error: 'Storage not responding (operation timed out).' } }, 1],
      ['no worker (503 storage_no_worker)', { status: 503, body: { error: 'the file readers are restarting — try again in a moment', code: 'storage_no_worker' } }, 1],
      ['not a folder (400)', { status: 400, body: { error: 'ENOTDIR: not a directory' } }, 2],
      ['a listing (200)', { status: 200, body: { path: '/x', items: [] } }, 1],
    ];
    const walk = async (M) => { const out = []; for (const [n, listing, want] of roads) { const st = stand(listing); await M.listingAndProbe(st.f, '/api/files?path=%2Fx', '/api/file/info?path=%2Fx', MARK); out.push({ n, calls: st.calls.length, want, probeMarked: st.calls.slice(1).some((c) => c.marked), listMarked: st.calls[0] && st.calls[0].marked }); } return out; };
    const got = await walk(EL), wrongRoads = got.filter((x) => x.calls !== x.want || x.probeMarked || !x.listMarked);
    const ELsrc = fs.readFileSync(path.join(REPO, 'src/lib/explorer-listing.js'), 'utf8'), RULE = "export const probeAfterListing = (status, data) => !(status === 503 || /^storage_/.test(String((data && data.code) || '')));";
    let redGot = null;
    if (ELsrc.split(RULE).length !== 2) ok(false, 'the anchor of the control «probe-always» is not in src/lib/explorer-listing.js (once)');
    else redGot = await walk(await import('data:text/javascript,' + encodeURIComponent(anchored(ELsrc, RULE, 'export const probeAfterListing = () => true;', 'probe-always'))));
    ok(!wrongRoads.length && !!redGot && redGot[0].calls === 2,
      `r336, at the page's level (a stand-in fetch): a storage refusal of the marked listing asks NO second call (${got.slice(0, 3).map((x) => x.calls).join(' / ')}); «not a folder» still asks the probe, unmarked (${got[3].calls}); a listing, nothing more (${got[4].calls}); RED (the probe always asked): the dead path's press asks twice (${redGot && redGot[0].calls})`, { got, redGot });

  } finally { srv.close(); pool.close(); }
}

console.log('①h B-23e5\'s remainder (b): two SYMLINKS into dead mounts never name their healthy folder; two real dead children still do');
await told(sideH);
async function sideH(ok, console) {   // B-4b9a: started beside the other pool scenes (above), told here
  const os = require('os');
  const ROOTMI = '22 1 0:22 / / rw - ext4 /dev/root rw\n';   // one storage: the path text alone would name the folder
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'b23e5-links-')), X = path.join(T, 'x'), Y = path.join(T, 'y');
  try {
    fs.mkdirSync(X); fs.mkdirSync(Y);
    fs.symlinkSync('/scratch-b23e5/dead-mount-a', path.join(X, 'a')); fs.symlinkSync('/scratch-b23e5/dead-mount-b', path.join(X, 'b'));
    // r4305: the look's 1.5 s deadline is the look's own, never a boot's — the worker has ANSWERED once (warmAll) before the first climb.
    // `hold` (the race at will, below): the pool's boots are HELD; with `warm` false (the old wait: live = constructed) the first climb's
    // look is sent inside the held boot; the boots go once that climb has concluded
    const run = async (Mod, tag, { hold = null, warm = true } = {}) => {
      const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-links-${tag}`, hungMs: 60000, mountsText: async () => ROOTMI, ...(hold ? { workerPath: hold.script } : {}) });
      try {
        await untilLive(pool, 1);
        const warmed = warm ? await warmAll(pool, 1, hold) : null;
        await pool._noteHung({ path: path.join(X, 'a') }, 'stat', 15000); await pool._noteHung({ path: path.join(X, 'b') }, 'stat', 15000);
        if (hold) hold.open();
        await pool._noteHung({ path: path.join(Y, 'a.txt') }, 'stat', 15000); await pool._noteHung({ path: path.join(Y, 'b.txt') }, 'stat', 15000);
        const at = (q) => !!pool._hungOf({ path: q }, 'stat', 15000);
        return { warmed, linkFolder: at(path.join(X, 'c.txt')), linkSelf: at(path.join(X, 'a')), realFolder: at(path.join(Y, 'c.txt')) };
      } finally { pool.close(); }
    };
    const raceP = Promise.all([run(SF, 'held-old', { hold: heldBoot('links-old'), warm: false }), run(SF, 'held-new', { hold: heldBoot('links-new') })]);
    raceP.catch(() => {});   // read below (a throw is told there, never an unhandled rejection meanwhile)
    const r = await run(SF, 'now');
    const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
    const LOOK = '        if (!r.timedOut && !(Array.isArray(r.links) && r.links.filter((x) => !x).length >= 2)) return;\n';
    const cut = src.split(LOOK).length === 2 ? mutantCopies('safe-fs-path-memory-links', REPO).load('src/safe-fs.js', anchored(src, LOOK, '', 'look-cut'), 'look-cut') : null;
    const rc = cut ? await run(cut, 'cut') : null;
    console.log('    the facts judged: ' + JSON.stringify({ now: r, release: rc }));
    ok(!r.linkFolder && r.linkSelf && r.realFolder, 'two dead children reached through SYMLINKS (into dead mounts) never name their healthy folder — each names itself; two real dead children of one storage still name theirs (the look answered on an idle worker)');
    ok(!!rc && rc.linkFolder === true, 'RED CONTROL (the links\' answer not read, in a copy): the two links name their healthy folder — everything under it refused', rc);
    ok(r.warmed === 1, `harness: the links pool's worker answered its first call (the warm, 15 s bound) before the first climb (${r.warmed} of 1)`, r);
    // THE LOOK TAKES AN IDLE WORKER ONLY (its read; r1378 (4)): with the one worker held by a live call, the look never queues behind it
    // (its 1.5 s deadline would end that call's worker) — the folder is not named now (a later sibling names it); the held call answers
    // r4293: the live call is a HELD call (its own hold, one a run), let go by the scene only once the climb's look has CONCLUDED — no
    // idle worker within its window (the law), or its own deadline queued behind the call (the copy) — never a 2.5 s sleep raced against
    // the look's 1.5 s window and whatever the main thread did between the call's send and the look's
    const busy = async (Mod, tag) => {
      const hold = heldCalls(`busy-${tag}`);
      const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-busy-${tag}`, timeouts: { default: 15000 }, hungMs: 60000, mountsText: async () => ROOTMI, workerPath: hold.script });
      try {
        await untilLive(pool, 1);
        const ends0 = pool.stats().timeouts;
        const held = pool.call('__sleep', { path: '/scratch-b23e5/busy/x', ms: HELD_MS }, { timeoutMs: 6000 }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && (e.code || e.message))));
        await sleep(50);
        await pool._noteHung({ path: path.join(Y, 'a.txt') }, 'stat', 15000); await pool._noteHung({ path: path.join(Y, 'b.txt') }, 'stat', 15000);   // the climb (its look) has concluded
        const named = !!pool._hungOf({ path: path.join(Y, 'c.txt') }, 'stat', 15000), outAtLook = pool.stats().inflight;
        hold.let();
        return { named, outAtLook, held: await held, ends: pool.stats().timeouts - ends0 };
      } finally { pool.close(); }
    };
    const bP = busy(SF, 'now');   // the scene and its RED copy side by side
    const LI = "    const once = () => this.call('lstatKinds', payload, { timeoutMs: CLIMB_LOOK_MS, look: true, idleOnly: true })";
    const queued = src.split(LI).length === 2 ? mutantCopies('safe-fs-path-memory-busy', REPO).load('src/safe-fs.js', anchored(src, LI, "    const once = () => this.call('lstatKinds', payload, { timeoutMs: CLIMB_LOOK_MS, look: true })", 'look-queued'), 'look-queued') : null;
    const [b, bq] = await Promise.all([bP, queued ? busy(queued, 'queued') : null]);
    console.log('    the busy worker: ' + JSON.stringify({ now: b, queued: bq }));
    ok(!b.named && b.outAtLook === 1 && b.held === 'answered' && b.ends === 0, `the look takes an IDLE worker only: the one worker held by a live call (still out when the look concluded: ${b.outAtLook}), the folder is not named now (${b.named}) and the held call answers once let go (${b.held}; ${b.ends} worker ended)`, b);
    ok(!!bq && bq.held !== 'answered' && bq.ends >= 1, `RED CONTROL (the look queued behind the live call, in a copy): its short deadline ends the worker under the held call (${bq && bq.held}; ${bq && bq.ends} ended)`, bq);
    // the race at will (r4305, started beside the links scene above) is read here: its old wait runs out the look's 1.5 s beside the busy scene's own
    const [rOld, rNew] = await raceP;
    ok(rOld.linkFolder === true && rNew.warmed === 1 && !rNew.linkFolder && rNew.linkSelf && rNew.realFolder,
      `THE RACE AT WILL (r4305, a HELD boot): with the old wait the look's 1.5 s deadline runs out inside the boot and the links' healthy folder is named (${rOld.linkFolder}); with the warm the look is the worker's own and it is not (${rNew.linkFolder}; each link names itself: ${rNew.linkSelf}; the real dead children name theirs: ${rNew.realFolder})`, { rOld, rNew });
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
}

console.log('①h2 the folder rule reads its look: a link keeps the folder asked; no answer in time names it; no look at all (no idle worker) names nothing now; the look\'s own hang is remembered and never climbs');
{
  const pool = new SF.SafeFs({ poolSize: 1, name: 'path-memory-look', hungMs: 60000, mountsText });
  try {
    const rows = [['links: one of the two', { links: [true, false] }, false], ['links: neither (a file, nothing there)', { links: [false, false] }, true], ['no answer in its time (dead storage)', { links: [], timedOut: true }, true], ['no idle worker within the bound', null, false]];
    const got = [];
    for (const [i, [what, ans, want]] of rows.entries()) {
      pool._lookIdle = async () => ans;
      const d = `/scratch-b23e5/look-${i}`;
      await pool._noteHung({ path: `${d}/a` }, 'stat', 15000); await pool._noteHung({ path: `${d}/b` }, 'stat', 15000);
      got.push({ what, named: !!pool._hungOf({ path: `${d}/c` }, 'stat', 15000), want });
    }
    ok(got.every((x) => x.named === x.want), `the climb reads its look: ${got.map((x) => `${x.what} ⇒ ${x.named ? 'named' : 'asked'}`).join(' · ')}`, got);
    // a LINK among the dead siblings never stops two REAL dead children from naming their folder: every remembered sibling is looked at
    const sibs = async (P) => {
      P._lookIdle = async ({ paths }) => ({ links: paths.map((q) => q.endsWith('/lnk')) });
      await P._noteHung({ path: '/scratch-b23e5/mix/lnk' }, 'stat', 15000); await P._noteHung({ path: '/scratch-b23e5/mix/f1' }, 'stat', 15000);
      const afterTwo = !!P._hungOf({ path: '/scratch-b23e5/mix/z' }, 'stat', 15000);
      await P._noteHung({ path: '/scratch-b23e5/mix/f2' }, 'stat', 15000);
      return { afterTwo, afterThree: !!P._hungOf({ path: '/scratch-b23e5/mix/z' }, 'stat', 15000) };
    };
    const mix = await sibs(pool);
    // the other order (a link between the two real dead children): «only the newest sibling» would pair f2 with the link
    pool._lookIdle = async ({ paths }) => ({ links: paths.map((q) => q.endsWith('/lnk')) });
    await pool._noteHung({ path: '/scratch-b23e5/mix2/f1' }, 'stat', 15000); await pool._noteHung({ path: '/scratch-b23e5/mix2/lnk' }, 'stat', 15000);
    const mid2 = !!pool._hungOf({ path: '/scratch-b23e5/mix2/z' }, 'stat', 15000);
    await pool._noteHung({ path: '/scratch-b23e5/mix2/f2' }, 'stat', 15000);
    const mix2 = { mid2, after: !!pool._hungOf({ path: '/scratch-b23e5/mix2/z' }, 'stat', 15000) };
    // two ends LANDING TOGETHER beside a remembered link: the second climb waits for the first look, then looks with all three
    let release, looks = 0; const gate = new Promise((r) => { release = r; });
    pool._lookIdle = ({ paths }) => { looks++; return (looks === 1 ? gate : Promise.resolve()).then(() => ({ links: paths.map((q) => q.endsWith('/lnk')) })); };
    await pool._noteHung({ path: '/scratch-b23e5/mix3/lnk' }, 'stat', 15000);
    const c1 = pool._noteHung({ path: '/scratch-b23e5/mix3/f1' }, 'stat', 15000), c2 = pool._noteHung({ path: '/scratch-b23e5/mix3/f2' }, 'stat', 15000);
    await sleep(20); const lookingAtOnce = looks; release(); await Promise.all([c1, c2]);
    const mix3 = { lookingAtOnce, looks, named: !!pool._hungOf({ path: '/scratch-b23e5/mix3/z' }, 'stat', 15000) };
    const srcM = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
    // THE NEWEST SEVEN: eight old links, then two real dead children — the look takes the newest siblings (the new child among them)
    const seven = async (P, d) => {
      P._lookIdle = async ({ paths }) => ({ links: paths.map((q) => /\/lnk\d$/.test(q)) });
      for (let i = 1; i <= 8; i++) await P._noteHung({ path: `/scratch-b23e5/${d}/lnk${i}` }, 'stat', 15000);
      await P._noteHung({ path: `/scratch-b23e5/${d}/f1` }, 'stat', 15000); await P._noteHung({ path: `/scratch-b23e5/${d}/f2` }, 'stat', 15000);
      return !!P._hungOf({ path: `/scratch-b23e5/${d}/z` }, 'stat', 15000);
    };
    const sevenNow = await seven(pool, 'seven');
    const SPL = '        qs.splice(0, Math.max(0, qs.length - 7));';
    const oldest = srcM.split(SPL).length === 2 ? mutantCopies('safe-fs-path-memory-oldest', REPO).load('src/safe-fs.js', anchored(srcM, SPL, '        qs.splice(7);', 'oldest-seven'), 'oldest-seven') : null;
    const P3 = oldest ? new oldest.SafeFs({ poolSize: 1, name: 'path-memory-oldest-red', hungMs: 60000, mountsText }) : null;
    let sevenRed = null; try { sevenRed = P3 ? await seven(P3, 'seven-red') : null; } finally { if (P3) P3.close(); }
    ok(sevenNow === true && sevenRed === false, `the newest seven siblings: eight old links never crowd out two new real dead children (named: ${sevenNow}); RED (the oldest seven, in a copy): never named (${sevenRed})`, { sevenNow, sevenRed });
    // A LOOK's OWN HANG strikes no path already remembered (its spans never double for a look nobody asked of them)
    const strike = async (P) => {
      await P._noteHung({ path: '/scratch-b23e5/strike/a' }, 'stat', 15000);
      const before = P._hung.get('/scratch-b23e5/strike/a').until;
      await P._noteHung({ paths: ['/scratch-b23e5/strike/a'] }, 'lstatKinds', 1500);
      return P._hung.get('/scratch-b23e5/strike/a').until === before;
    };
    const strikeNow = await strike(pool);
    const SKP = '      if (look && this._hung.has(p)) continue;';
    const struck = srcM.split(SKP).length === 2 ? mutantCopies('safe-fs-path-memory-strike', REPO).load('src/safe-fs.js', anchored(srcM, SKP, '', 'look-strikes'), 'look-strikes') : null;
    const P4 = struck ? new struck.SafeFs({ poolSize: 1, name: 'path-memory-strike-red', hungMs: 60000, mountsText }) : null;
    let strikeRed = null; try { strikeRed = P4 ? await strike(P4) : null; } finally { if (P4) P4.close(); }
    ok(strikeNow === true && strikeRed === false, `a look's own hang strikes no remembered path (its span unchanged: ${strikeNow}); RED (the skip cut, in a copy): its span renewed (${strikeRed})`, { strikeNow, strikeRed });
    ok(!mix2.mid2 && mix2.after && mix3.lookingAtOnce === 1 && mix3.named, `the other order names the folder too (${JSON.stringify(mix2)}); two ends landing together: one look at a time (${mix3.lookingAtOnce}), the second waits and names the folder (${mix3.named}, ${mix3.looks} looks)`, { mix2, mix3 });
    const QS = "        const qs = []; for (const [q, m] of this._hung) if (q !== p && !mine.has(q) && m.under != null && !m.early && m.until > now && path.dirname(q) === dir) qs.push(q);\n";
    const firstOnly = srcM.split(QS).length === 2 ? mutantCopies('safe-fs-path-memory-mix', REPO).load('src/safe-fs.js', anchored(srcM, QS, "        const qs = []; for (const [q, m] of this._hung) if (q !== p && !mine.has(q) && m.under != null && !m.early && m.until > now && path.dirname(q) === dir) { qs.push(q); break; }\n", 'first-sibling-only'), 'first-sibling-only') : null;
    const P2 = firstOnly ? new firstOnly.SafeFs({ poolSize: 1, name: 'path-memory-mix-red', hungMs: 60000, mountsText }) : null;
    let mixR = null; try { mixR = P2 ? await sibs(P2) : null; } finally { if (P2) P2.close(); }
    ok(!mix.afterTwo && mix.afterThree && !!mixR && !mixR.afterThree, `a link and a real dead child name nothing (${mix.afterTwo}); a second real dead child names the folder, the link beside them (${mix.afterThree}); RED (the first sibling only, in a copy — its read's #5): never named (${mixR && mixR.afterThree})`, { mix, mixR });
    // r1378 (4): the look's OWN hang is remembered like any op (its two paths) — and never climbs, a third dead sibling beside it or not
    delete pool._lookIdle;
    await pool._noteHung({ path: '/scratch-b23e5/lk/c' }, 'stat', 15000);
    await pool._noteHung({ paths: ['/scratch-b23e5/lk/a', '/scratch-b23e5/lk/b'] }, 'lstatKinds', 1500);
    const lk = (q, ms = 1500) => !!pool._hungOf({ path: q }, 'stat', ms);
    ok(lk('/scratch-b23e5/lk/a') && lk('/scratch-b23e5/lk/b') && !lk('/scratch-b23e5/lk/d'), 'the look\'s own hang is remembered (its two paths refused) and names no folder (a third dead sibling beside it)');
  } finally { pool.close(); }
}

console.log('①i B-23e5\'s remainder (c), REVERTED (r1396): the folder field\'s calls name their folder by `path` — the memory has seen them since the release');
{
  const ds = fs.readFileSync(path.join(REPO, 'src/dir-collect.js'), 'utf8'), src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  ok(ds.includes("call('dirSlice', { path: a, dirs: [{ path: a, known: base && !base.entry.racy ? base.entry.mtime : undefined }]") && ds.includes("call('dirSlice', { path: a, dirs: [], probes: [a] }, IDLE_ONLY)") && ds.includes("call('dirIndex', { path: root, roots: [root],")
      && src.includes("const pathsOf = (payload, keys = PATH_KEYS) => [...keys.map((k) => payload[k]), ...(Array.isArray(payload.paths) ? payload.paths : [])]") && !/LIST_KEYS/.test(src) && !SF.WIDE_OPS.has('dirSlice') && !SF.WIDE_OPS.has('dirIndex'),
    'PIN: the slice and the walk carry `path` (dir-slice.js) — asked and remembered by it as at the release; the first build\'s list keys (dirs / roots / probes) and its listing class are gone (they refused healthy calls)');
}

console.log('①j B-23e5\'s remainder (a): the doors pressed, driven over stand-ins — the path field\'s Enter, and a save that meets a dead path');
{
  const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const fe = rd('src/lib/file-explorer.js'), ce = rd('src/lib/code-editor.js'), dw = rd('src/lib/doc-window-ui.js'), ee = rd('src/lib/external-editor.js');
  // the path field's commit: its Enter and a picked row are a press; leaving the field (blur) and an api set are not
  const oc = (fe.match(/onCommit: (\(info\) => \{[^\n]*\}),\n/) || [])[1];
  const calls = [], stub = { currentPath: '/scratch-b23e5/here', navigate: (q, o) => calls.push([q, !!(o && o.attended)]) };
  const onCommit = oc ? new Function(`return (${oc});`).call(stub) : null;
  if (onCommit) for (const how of ['enter', 'pick', 'blur', 'api']) onCommit({ path: '/scratch-b23e5/' + how, how });
  ok(!!onCommit && calls.map((c) => c[1]).join() === 'true,true,false,false', `the path field: Enter and a picked row are marked, a blur and an api set are not (${calls.map((c) => c.join(':')).join(' · ')})`, calls);
  // the code editor's save, LIFTED from its source, over a stand-in fetch that answers a dead path: marked; the text stays, the editor
  // stays (it answers false to save-and-close), and the words say WHERE it is not saved; RED: the release's words name nothing
  const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const saveBody = (ce.match(/\n  async save\(\) \{\n([\s\S]*?)\n  \}\n\n  \/\/ lane artifacts-model/) || [])[1];
  const runSave = async (body, answer = { error: 'this folder or file did not answer in time — try again in 30 s', code: 'storage_path_hung', params: { s: 30 } }) => {
    const inits = [], fetchStub = async (url, init) => { inits.push(init); return { ok: false, status: 503, json: async () => answer }; };
    const ed = { editorView: { state: { doc: { toString: () => 'the person\'s text' } } }, saveIndicator: { textContent: '', style: {}, title: '' }, filePath: '/scratch-b23e5/dead/notes.md', _host: '', _diskChip: { style: {} }, _noteArtifactSave() {}, _baselineMtime() {}, modified: true };
    const toasts = [];
    const save = new Function('t', 'fsErrorText', 'ATTENDED_HEADERS', 'fetch', 'setTimeout', 'showToast', `return async function save() {\n${body}\n};`)(tt, (d) => d.error, { 'X-VibeSpace-Attended': '1' }, fetchStub, () => 0, (m) => toasts.push(m));
    const out = await save.call(ed);
    return { out, modified: ed.modified, text: ed.saveIndicator.textContent, title: ed.saveIndicator.title, toast: toasts[0] || '', marked: !!(inits[0] && inits[0].headers && inits[0].headers['X-VibeSpace-Attended'] === '1') };
  };
  const NEWW = "      this.saveIndicator.textContent = '✕ ' + t('{name} is not saved — {why}', { name, why }); this.saveIndicator.style.color = 'var(--red)';\n";
  const sv = saveBody ? await runSave(saveBody) : null;
  const svR = saveBody && saveBody.includes(NEWW) ? await runSave(saveBody.replace(NEWW, "      this.saveIndicator.textContent = `✕ ${why}`; this.saveIndicator.style.color = 'var(--red)';\n")) : null;   // stale-pins: kept (the release's words planted back in a lifted copy)
  console.log('    the save, the facts judged: ' + JSON.stringify({ now: sv, release: svR }));
  ok(!!sv && sv.out === false && sv.modified === true && sv.marked && /^✕ notes\.md is not saved — this folder or file did not answer in time/.test(sv.text) && sv.title.startsWith('/scratch-b23e5/dead/notes.md is not saved')
      && /^notes\.md is not saved — .*\. Your text is still here, unsaved: save again, or copy it to keep it elsewhere\.$/.test(sv.toast),
    'THE SAVE LAW (the code editor, r1378 (3)): a save that meets a dead path is a marked press; the person\'s text stays (still unsaved — the dirty mark), the editor stays open (save-and-close hears false), the words name WHERE it is not saved (the file, the whole path on hover) and say where the text IS and what to do (a toast)', sv);
  ok(!!svR && !/is not saved/.test(svR.text), 'RED CONTROL (the release\'s words, in a lifted copy): the refusal names nothing — where the text was not saved is not said', svR);
  // r1733 (6) → r2198 (laws 1–3): a second press while a save is out, a save refused «still trying» — driven in ①p
  // the document window's and the pane editor's saves: the same law, read from their source — the FULL words (where the text IS and what
  // to do); the pane keeps them (no reset) and never signals the CLI over a refused save
  const FULL = "t('{name} is not saved — {why}. Your text is still here, unsaved: save again, or copy it to keep it elsewhere.', { name: String(";
  ok(dw.includes("say(e && e.name === 'AbortError' ? t('{name}: no reply — it may still have been saved', { name: String(path).split('/').pop() || path }) : " + FULL + "path).split('/').pop() || path, why: e.message })); }") && /throw new Error\(data\.error \? fsErrorText\(data\) : `HTTP \$\{res\.status\}`\);/.test(dw)
      && !/saveBtn\.textContent = '✕/.test(ee) /* stale-pins: kept (a deliberate absence: the button keeps its label) */ && ee.includes("say(t('{name} is not saved — {why}. Your text is still here, unsaved: save again, or copy it to keep it elsewhere.', { name, why }), 'var(--red)');")   // r2198: the pane's words on its path line, its button keeps its label
      && ee.indexOf("if (!res.ok || data.error) throw new Error(data.error ? fsErrorText(data) : `HTTP ${res.status}`);") > 0 && ee.indexOf("if (!res.ok || data.error) throw new Error(data.error ? fsErrorText(data) : `HTTP ${res.status}`);") < ee.indexOf("const sig = await fetch('/api/editor/signal'") && !/setTimeout\(\(\) => \{ saveBtn\.textContent/.test(ee),   // stale-pins: kept (the release's 4 s reset — a deliberate absence check)
    'the document window\'s and the pane editor\'s saves: a refusal says the file, where the text is and what to do (the window stays; the pane keeps its words — no reset — and does not signal the CLI)');
  // r1442 (C) THE DOCUMENT WINDOW's SAVE, LIFTED from its source and driven over a stand-in fetch: its OWN CHECK is the press's one try
  // (marked); refused by the storage (503) the save ends there with the words — never a write after it — and the text stays unsaved
  const dws = (dw.match(/\n  async function save\(\) \{\n([\s\S]*?)\n  \}\n/) || [])[1];
  const runDocSave = async (body, { infoOk = false, typeDuringWrite = false } = {}) => {
    const calls = [], said = [];
    let edJson = { doc: 'the person\'s text' };
    const fetchStub = async (url, init) => { calls.push({ url, marked: !!(init && init.headers && init.headers['X-VibeSpace-Attended']) }); if (url.startsWith('/api/file/info')) return infoOk ? { ok: true, status: 200, json: async () => ({ modified: 0 }) } : { ok: false, status: 503, json: async () => ({ error: 'this folder or file did not answer in time — try again in 30 s', code: 'storage_path_hung', params: { s: 30 } }) }; if (typeDuringWrite) edJson = { doc: 'the person\'s text, and more typed while the save was out' }; return { ok: true, status: 200, json: async () => ({ success: true }) }; };
    const S = { mode: 'rich', ed: { getJSON: () => edJson }, busy: false, source: 'old text', loaded: {}, base: 0, confirmed: 0, dirty: true };
    const fn = new Function('S', 'M', 'saveDoc', 'current', 'say', 'fidelityWords', 'fetch', 'fsErrorText', 'ATTENDED_HEADERS', 't', 'showConfirmDialog', 'q', 'host', 'path', 'loadDoc', 'info', 'hhmm', 'renderStatus', 'noteEdit', 'conflict', `return async function save() {\n${body}\n};`)(
      S, { saveVerdict: () => 'write' }, () => ({ ok: true, text: 'the person\'s text' }), () => ({}), (m) => said.push(m), () => '', fetchStub, (d) => d.error, { 'X-VibeSpace-Attended': '1' }, tt, async () => true, () => 'path=x', '', '/scratch-b23e5/dead/notes.md', () => ({}), async () => 0, () => '00:00', () => {}, () => {}, {});
    await fn();
    return { calls: calls.map((c) => `${c.url.split('?')[0]}${c.marked ? ' (marked)' : ''}`), said: said[0] || '', dirty: S.dirty, busy: S.busy };
  };
  const ds = dws ? await runDocSave(dws) : null;
  // r1733 (1): a save that LANDS clears the unsaved mark only if the box still holds what it sent (text typed meanwhile stays unsaved)
  const dsTyped = dws ? await runDocSave(dws, { infoOk: true, typeDuringWrite: true }) : null, dsClean = dws ? await runDocSave(dws, { infoOk: true }) : null;
  const DIRTY = "S.dirty = JSON.stringify(S.ed.getJSON()) !== sentJson;";
  const dsTypedR = dws && dws.includes(DIRTY) ? await runDocSave(dws.replace(DIRTY, 'S.dirty = false;'), { infoOk: true, typeDuringWrite: true }) : null;   // stale-pins: kept (the release cleared the mark)
  ok(!!dsTyped && dsTyped.dirty === true && !!dsClean && dsClean.dirty === false && !!dsTypedR && dsTypedR.dirty === false,
    `THE DOCUMENT WINDOW's SAVE (r1733 (1)): text typed while the save was out stays UNSAVED when the save lands (${dsTyped && dsTyped.dirty}) — so a close asks; a save of what the box holds clears it (${dsClean && dsClean.dirty}); RED (the release's clear, lifted): the late text marked saved (${dsTypedR && dsTypedR.dirty})`, { dsTyped, dsClean, dsTypedR });
  const CHK = "      if (chk && chk.status === 503) throw new Error(chk.body && chk.body.error ? fsErrorText(chk.body) : t('the server did not answer'));\n";
  const dsR = dws && dws.includes(CHK) ? await runDocSave(dws.replace(CHK, '')) : null;   // stale-pins: kept (the rebuild's road: the check's refusal not read)
  console.log('    the document window\'s save: ' + JSON.stringify({ now: ds, rebuild: dsR }));
  ok(!!ds && ds.calls.join() === '/api/file/info (marked)' && /^notes\.md is not saved — this folder or file did not answer in time.*Your text is still here, unsaved/.test(ds.said) && ds.dirty === true && ds.busy === false,
    `THE DOCUMENT WINDOW's SAVE (r1442 (C)): its own check is the one try (${ds && ds.calls.join(' → ')}); refused, the save ends there with the words («${ds && ds.said.slice(0, 60)}…») and the text stays unsaved`, ds);
  ok(!!dsR && dsR.calls.length === 2 && /\/api\/file\/write \(marked\)/.test(dsR.calls[1]), `RED CONTROL (the rebuild's save: the check's refusal not read, in a lifted copy): the marked write follows — a second try for one press (${dsR && dsR.calls.join(' → ')})`, dsR);
  // r1378 (3) THE CLOSE ROADS: a window holding unsaved text ASKS before it closes — its ✕ (and a tab\'s, the menu\'s, the phone\'s:
  // requestClose), a group\'s close-all (requestCloseGroup asks a question that names no unsaved text, then requestClose(…, { asked })),
  // never on its own word; save-and-close windows ask by their doors (every ✕ saves first; a refused save asks — test-safe-fs-no-inline
  // ⑥ drives it). Each guard LIFTED from its source and driven: the code editor\'s, the document window\'s
  const guardOf = (kind, srcText) => {
    if (kind === 'code') { const m = /this\.winInfo\.onCloseRequest = \(o\) => \{\n([\s\S]*?)\n    \}; \}/.exec(srcText); return m ? m[1] : null; }
    if (kind === 'pane') { const m = /        targetWinInfo\.onCloseRequest = \(o\) => \{\n([\s\S]*?)\n        \};\n      \}\n/.exec(srcText); return m ? m[1] : null; }
    const m = /winInfo\.onCloseRequest = \(o\) => \{\n([\s\S]*?)\n  \};\n  return winInfo;/.exec(srcText); return m ? m[1] : null;
  };
  const drive = async (kind, body) => {
    const rows = [['clean, its ✕', false, {}], ['unsaved, its ✕ — Discard', true, {}, true], ['unsaved, its ✕ — Cancel', true, {}, false], ['unsaved, a group\'s close-all', true, { asked: true }, false], ['unsaved, after its own Discard', true, { discardAsked: true }]];
    const out = [];
    for (const [what, dirty, o, answer] of rows) {
      const asked = [], closes = [], safe = [];
      const ask = (q) => { asked.push(q.message); safe.push(q.cancelDefault === true); return Promise.resolve(answer); };
      const wm = { requestClose: (id, op) => closes.push([id, op && op.discardAsked]) };
      let fn;
      if (kind === 'code') fn = new Function('t', 'showConfirmDialog', 'prevAsk', `return function (o) {\n${body}\n};`)(tt, ask, undefined).bind({ modified: dirty, filePath: '/scratch-b23e5/dead/notes.txt', winInfo: { id: 'w1' }, app: { wm } });
      else if (kind === 'pane') fn = new Function('t', 'showConfirmDialog', 'prevAsk', 'unsavedPane', 'busyPane', 'app', 'targetWinInfo', `return function (o) {\n${body}\n};`)(tt, ask, undefined, () => (dirty ? { name: 'notes.txt' } : null), () => null, { wm }, { id: 'w1' });   // r2221 LAW C: no save out here (①p drives it)
      else fn = new Function('t', 'showConfirmDialog', 'winInfo', 'name', 'app', `return function (o) {\n${body}\n};`)(tt, ask, { id: 'w1', _editorDirty: () => dirty }, 'notes.md', { wm });
      const go = fn(o); await sleep(0);
      out.push({ what, go, asked: asked.length ? asked[0] : '', closed: closes.length ? closes[0][1] : null, safe: safe.every(Boolean) });
    }
    return out;
  };
  const want = (r) => (r.what.startsWith('clean') || r.what.includes('after its own') ? r.go === true && !r.asked : r.go === false && /has unsaved changes — they are only in this window/.test(r.asked) && r.safe && (r.what.endsWith('Discard') ? r.closed === true : r.closed === null));   // r1733 (2): every ask keeps on Enter (cancelDefault)
  const cg = guardOf('code', ce), dg = guardOf('doc', rd('src/lib/doc-window.js')), pg = guardOf('pane', ee);
  const cOut = cg ? await drive('code', cg) : null, dOut = dg ? await drive('doc', dg) : null, pOut = pg ? await drive('pane', pg) : null;
  const roadsSaid = (o) => o && o.map((r) => `${r.what}: ${r.go ? 'closes' : 'asks'}${r.closed ? ' → closed' : ''}`);
  console.log('    the close roads: ' + JSON.stringify({ code: roadsSaid(cOut), doc: roadsSaid(dOut), pane: roadsSaid(pOut) }));
  ok(!!cOut && !!dOut && !!pOut && cOut.every(want) && dOut.every(want) && pOut.every(want), 'THE CLOSE ROADS (the code editor\'s, the document window\'s and — r1442 (D) — the terminal window holding the Ctrl+G pane\'s guards, lifted): a clean window closes; an unsaved one ASKS (the tree\'s own dialog) at its ✕ and at a group\'s close-all (whose question named no unsaved text) — Discard closes it, Cancel keeps it; after its own Discard it closes', { cOut, dOut, pOut });
  ok(/import \{ showConfirmDialog \} from '\.\/utils\.js';/.test(ee) && !/\bconfirm\(/.test(ee), 'PIN: the pane\'s ask is the tree\'s own dialog, never a native one');
  // ONE GUARD A WINDOW over every pane it holds (its delta read: a pane left behind must still ask; a later pane's save must not strip the
  // guard): the install block LIFTED and run twice on one window — two panes, the left-behind one unsaved, then removed
  const inst = (ee.match(/\n(      const panes = targetWinInfo\._editorPanes[\s\S]*?\n      \}\n)/) || [])[1];
  const twoPanes = (block) => {
    const asked = [], win = { id: 'w1' }, wm = { requestClose: () => {} };
    const install = new Function('targetWinInfo', 'editorView', 'marked', 'filePath', 'showConfirmDialog', 't', 'app', 'saveOut', 'pathSpan', 'stillSavingWords', block);   // r2221 LAW C: no save out here (①p drives it)   // r2198 law 2: each pane's own mark (`marked`, set by its keystrokes)
    const view = (text) => ({ dom: { isConnected: true }, state: { doc: { toString: () => text } } });
    const A = view('typed in A'), B = view('B as loaded'), C = view('typed in C');
    install(win, A, true, '/scratch-b23e5/a.md', (q) => { asked.push(q.message); return Promise.resolve(false); }, tt, { wm });
    const guard1 = win.onCloseRequest;
    install(win, B, false, '/scratch-b23e5/b.md', (q) => { asked.push(q.message); return Promise.resolve(false); }, tt, { wm });
    const once = win.onCloseRequest === guard1;
    const r1 = win.onCloseRequest({}), d1 = win._editorDirty();
    install(win, C, true, '/scratch-b23e5/c.md', (q) => { asked.push(q.message); return Promise.resolve(false); }, tt, { wm });
    win.onCloseRequest({}); const both = asked[asked.length - 1] || '';
    C.dom.isConnected = false;
    A.dom.isConnected = false;   // the left-behind pane removed (its save landed, or the window closed it)
    const r2 = win.onCloseRequest({}), d2 = win._editorDirty();
    return { once, r1, d1, r2, d2, asked, both };
  };
  const tp = inst ? twoPanes(inst) : null;
  const tpR = inst ? twoPanes(inst.replace('dirty: () => editorView.dom.isConnected && ', 'dirty: () => ').replace('if (!x.view.dom.isConnected) panes.delete(x); else if (x.dirty()) names.push(x.name);', 'if (x.dirty()) names.push(x.name);')) : null;   // stale-pins: kept (a removed pane still counted)
  console.log('    two panes in one window: ' + JSON.stringify({ now: tp, red: tpR && { r2: tpR.r2 } }));
  ok(!!tp && tp.once && tp.r1 === false && tp.d1 === true && /^a\.md has unsaved changes/.test(tp.asked[0] || '') && /^a\.md, c\.md has unsaved changes/.test(tp.both) && tp.r2 === true && tp.d2 === false,
    'ONE GUARD A WINDOW (r1442 (D), its delta read): a second pane installs no second guard; a pane LEFT BEHIND with unsaved text still asks, by its name — two unsaved panes are both named; once removed it asks nothing (the window closes)', tp);
  // the CLI's close of a pane removes THAT pane (by its data-signal) — never an older one left behind with unsaved text: lifted and driven
  const cee = (ee.match(/\nexport function closeExternalEditor\(app, signalPath\) \{\n([\s\S]*?)\n\}\n/) || [])[1];
  const cliClose = (body) => {
    const removed = [], pane = (sig) => ({ dataset: { signal: sig }, remove() { removed.push(sig); } });
    const win = { _editorState: null, content: { style: {}, querySelectorAll: (q) => (q === '.editor-container' ? [pane('sig-A'), pane('sig-B')] : []), querySelector: (q) => (q === '.editor-container' ? pane('sig-A') : null) } };   // A's save cleared the state; B still shows
    new Function('app', 'signalPath', body)({ wm: { windows: new Map([['w1', win]]) }, sessions: new Map() }, 'sig-B');
    return removed;
  };
  const cc = cee ? cliClose(cee) : null;
  const OLDQ = "    if (!editorPane) continue;";
  const ccR = cee && cee.includes(OLDQ) ? cliClose(cee.replace(OLDQ, "    if (!editorPane || win._editorState?.signalPath !== signalPath) continue;")) : null;   // stale-pins: kept (the release matched the window by its state)
  const PICK = ".find((el) => el.dataset.signal === signalPath);";
  const ccR2 = cee && cee.includes(PICK) ? cliClose(cee.replace(PICK, "[0];")) : null;   // stale-pins: kept (the first pane in the window)
  ok(!!cc && cc.join() === 'sig-B' && !!ccR && ccR.join() === '' && !!ccR2 && ccR2.join() === 'sig-A',
    `B-23e5's LEFT (1): the CLI's close removes ITS pane even after an older pane's save cleared the window's state (${cc && cc.join()}); REDs (lifted): the window matched by its state finds none (${ccR && (ccR.join() || 'none')}), the first pane picked removes the left-behind one (${ccR2 && ccR2.join()})`, { cc, ccR, ccR2 });
  ok(!!tpR && tpR.r2 === false, 'RED CONTROL (a removed pane still counted, in a lifted copy): the window asks forever about text that is gone', tpR);
  const redG = cg ? await drive('code', cg.replace('if (!this.modified || (o && o.discardAsked))', 'if (!this.modified || (o && (o.discardAsked || o.asked)))')) : null;
  const redGd = dg ? await drive('doc', dg.replace('(o && o.discardAsked)', '(o && (o.discardAsked || o.asked))')) : null, redGp = pg ? await drive('pane', pg.replace('!(o && o.discardAsked)', '!(o && (o.discardAsked || o.asked))')) : null;   // stale-pins: kept (the planted REDs)
  ok(!!redG && redG.find((r) => r.what.includes('group')).go === true && !!redGd && redGd.find((r) => r.what.includes('group')).go === true && !!redGp && redGp.find((r) => r.what.includes('group')).go === true,
    'RED CONTROLS (the group\'s «asked» taken as the person\'s Discard, in lifted copies of each of the three guards): an unsaved window closes at a group\'s close-all unasked — a silent loss', { redG, redGd, redGp });
  ok(/requestClose\(tid, \{ asked: true \}\)/.test(rd('src/lib/tab-group.js')) && /go = win\.onCloseRequest\(opts\) !== false;/.test(rd('src/lib/window.js')),
    'PIN: a group\'s close-all closes each member through requestClose (asked), and requestClose hears the window\'s answer');
}

console.log('①k r1378 (2) / r1442 (A): ONE TRY A REMEMBERED PATH — ten presses on a remembered dead folder start ONE worker; a press the memory does not refuse is never held');
await told(sideK);
async function sideK(ok, console) {   // B-4b9a: started beside the other pool scenes (above), told here
  const word = (p) => p.then(() => 'answered', (e) => (e && e.code === 'path-trying' ? 'still trying' : e && e.code === 'path-hung' ? (e.tried ? 'path-hung, tried' : 'path-hung') : e && e.safeFsTimeout ? 'deadline' : String(e && e.code)));
  const run = async (Mod, tag) => {
    const pool = new Mod.SafeFs({ poolSize: 4, name: `path-memory-ten-${tag}`, timeouts: { default: 15000, __sleep: 400 }, hungMs: 60000, mountsText, workerPath: DEADW.script });   // r4293: the dead presses are held calls
    try {
      await untilLive(pool, 4);
      await pool._noteHung({ path: '/scratch-b23e5/ten' }, 'stat', 15000);   // remembered dead: an unmarked call is refused, a press is tried
      const seq0 = pool._seq, ends0 = pool.stats().timeouts;
      // THE PERSON'S TEN PRESSES while the first is out: Open on the folder five times (one call: they join), then five files in it
      // (another call each, refused by the same remembered path: told «still trying»)
      const presses = [];
      for (let i = 0; i < 5; i++) presses.push(word(pool.call('__sleep', { path: '/scratch-b23e5/ten', ms: HELD_MS }, { attended: true })));
      for (let i = 0; i < 5; i++) presses.push(word(pool.call('__sleep', { path: `/scratch-b23e5/ten/f-${i}`, ms: HELD_MS }, { attended: true })));
      const words = await Promise.all(presses);
      const sent = pool._seq - seq0, ends = pool.stats().timeouts - ends0, trying = pool._trying ? pool._trying.size : 0;
      // A HEALTHY press out on a folder (its listing; a dead child mount holds such a listing its whole deadline): a PRESS under it (a
      // save, an open) and an unmarked read under it are asked — never held for it (the read's H1)
      await untilLive(pool, 4);
      const warmed = await warmAll(pool, 4);   // r4305: the worker the dead press ended came back — every worker has answered once before a 400 ms press
      const hold = pool.call('__sleep', { path: '/scratch-b23e5/well', ms: 300 }, { attended: true, timeoutMs: 10000 });   // its own long deadline: a loaded runner never ends it
      await sleep(20);
      const pressUnder = await word(pool.call('__sleep', { path: '/scratch-b23e5/well/notes.txt', ms: 1, content: 'the person\'s text' }, { attended: true }));
      const readUnder = await word(pool.call('__sleep', { path: '/scratch-b23e5/well/x', ms: 1 }));
      // a WRITE never joins (r1442 (E)): two saves of the same text at once are two calls (named by op and paths, never by content)
      const s0 = pool._seq;
      await Promise.all([word(pool.call('__sleep', { path: '/scratch-b23e5/well/a.txt', ms: 30, content: 'same' }, { attended: true })), word(pool.call('__sleep', { path: '/scratch-b23e5/well/a.txt', ms: 30, content: 'same' }, { attended: true }))]);
      const writesSent = pool._seq - s0;
      const held = await word(hold);
      // TWO remembered paths refuse one press (a dead file AND the folder its climb named): a press on its sibling hears «still trying»
      await untilLive(pool, 4);
      await pool._noteHung({ path: '/scratch-b23e5/two/a.txt' }, 'stat', 15000); await pool._noteHung({ path: '/scratch-b23e5/two/b.txt' }, 'stat', 15000);
      const named2 = !!pool._hungOf({ path: '/scratch-b23e5/two/c.txt' }, 'stat', 15000), s2 = pool._seq;
      const two = await Promise.all(['a.txt', 'b.txt', 'c.txt'].map((n) => word(pool.call('__sleep', { path: `/scratch-b23e5/two/${n}`, ms: HELD_MS }, { attended: true }))));
      return { warmed, sent, ends, words, trying, pressUnder, readUnder, writesSent, held, named2, twoSent: pool._seq - s2, two };
    } finally { pool.close(); }
  };
  // r4305 (law 3: the race made red AT WILL): a fresh worker's first timed op — a pool whose boot is HELD; with the old wait (live =
  // constructed) a 1 ms press under the 400 ms deadline runs inside the boot and never answers; with the warm (warmAll) it answers
  const fresh = async (warm) => {
    const hold = heldBoot(`fresh-${warm ? 'warm' : 'old'}`);
    const pool = new SF.SafeFs({ poolSize: 1, name: `path-memory-fresh-${warm ? 'warm' : 'old'}`, timeouts: { default: 15000, __sleep: 400 }, hungMs: 60000, mountsText, workerPath: hold.script });
    try {
      await untilLive(pool, 1);
      const warmed = warm ? await warmAll(pool, 1, hold) : null;
      const press = await word(pool.call('__sleep', { path: '/scratch-b23e5/fresh/notes.txt', ms: 1 }, { attended: true }));
      hold.open();
      return { warmed, press };
    } finally { pool.close(); }
  };
  const freshP = Promise.all([fresh(false), fresh(true)]);
  freshP.catch(() => {});   // read below (a throw is told there, never an unhandled rejection meanwhile)
  const nowP = run(SF, 'now');   // the scene and its RED copies run side by side (each its own pool)
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const TRY = '    if (busy) return Promise.reject(pathTryingRefusal(busy.path));\n';
  const cut = src.split(TRY).length === 2 ? mutantCopies('safe-fs-path-memory-ten', REPO).load('src/safe-fs.js', anchored(src, TRY, '', 'second-press-sent'), 'second-press-sent') : null;
  // the rebuild's own rule planted back (its read's H1): EVERY press held, every press at or under it refused
  const HELD = "    const held = hp ? [...new Map(this._hungAll(payload, op, timeoutMs).map((x) => [x.path, x])).values()] : [];   // each remembered path refusing this press, once\n";
  const BUSY = "    const busy = this._trying ? held.find((x) => this._trying.has(x.path)) : null;\n";
  const every = src.split(HELD).length === 2 && src.split(BUSY).length === 2 ? mutantCopies('safe-fs-path-memory-every', REPO).load('src/safe-fs.js', anchored(anchored(src, HELD, "    const held = opts.attended ? [{ path: (hp && hp.path) || pathsOf(payload)[0] }] : [];\n", 'every-press-held-a'), BUSY, "    const busy = opts.attended && this._trying ? [...this._trying.keys()].map((tp) => ({ path: tp })).find((x) => pathsOf(payload).some((q) => q === x.path || q.startsWith(x.path + '/'))) : null;\n", 'every-press-held'), 'every-press-held') : null;
  // one remembered path a press (the first build of rule A — its read's #1): the file and its named folder each hold a different press
  const one = src.split(HELD).length === 2 ? mutantCopies('safe-fs-path-memory-onepath', REPO).load('src/safe-fs.js', anchored(src, HELD, '    const held = hp ? [hp] : [];\n', 'one-path-held'), 'one-path-held') : null;
  const [now, red, redO, redE] = await Promise.all([nowP, cut ? run(cut, 'cut') : null, one ? run(one, 'one') : null, every ? run(every, 'every') : null]);
  console.log('    the facts judged: ' + JSON.stringify(now));
  ok(now.sent === 1 && now.ends === 1 && now.words.slice(0, 5).every((w) => w === 'path-hung, tried') && now.words.slice(5).every((w) => w === 'still trying') && now.trying === 0,
    `ONE TRY A REMEMBERED PATH: ten presses on a remembered dead folder sent ${now.sent} call and ended ${now.ends} worker — the five on the folder joined it (${now.words[0]}), the five on files in it were told «still trying» (${now.words[5]}); nothing held after the answer (${now.trying})`, now);
  ok(now.named2 && now.twoSent === 1 && now.two[0] === 'path-hung, tried' && now.two.slice(1).every((w) => w === 'still trying'),
    `two remembered paths refuse one press (a dead file and its named folder): presses on a.txt, b.txt, c.txt sent ${now.twoSent} call — the first tried (${now.two[0]}), the others told «still trying» (${now.two.slice(1).join(', ')})`, now);
  ok(now.pressUnder === 'answered' && now.readUnder === 'answered' && now.held === 'answered' && now.writesSent === 2,
    `a press the memory does not refuse is never held: a press and a read under a folder whose healthy listing press is out are asked (${now.pressUnder}, ${now.readUnder}); two writes of the same text at once are two calls (${now.writesSent} — a write never joins)`, now);
  ok(now.warmed === 4, `harness: the four workers answered once (the warm, 15 s bound) before the healthy presses (${now.warmed} of 4)`, now);
  const [fOld, fNew] = await freshP;
  ok(fOld.press !== 'answered' && fNew.warmed === 1 && fNew.press === 'answered', `THE RACE AT WILL (r4305, a HELD boot): with the old wait a 1 ms press under the 400 ms deadline runs inside the boot (${fOld.press}); with the warm it answers (${fNew.press})`, { fOld, fNew });
  console.log('    the controls: ' + JSON.stringify({ noTry: red && { sent: red.sent, words: red.words.slice(5, 6) }, every: redE && { pressUnder: redE.pressUnder }, onePath: redO && { twoSent: redO.twoSent, two: redO.two } }));
  ok(!!red && red.sent === 6 && red.words.slice(5).every((w) => w !== 'still trying'), `RED CONTROL (no «still trying», in a copy): the five file presses each take a worker into the dead folder — ${red && red.sent} calls sent`, red);
  ok(!!redE && redE.pressUnder === 'still trying', `RED CONTROL (the rebuild's every-press rule planted back, in a copy — its read's H1): a press under a healthy folder whose listing press is out is refused (${redE && redE.pressUnder})`, redE);
  ok(!!redO && redO.twoSent === 3, `RED CONTROL (one remembered path a press, in a copy — its read's #1): the three presses on a dead share each take a worker (${redO && redO.twoSent} sent)`, redO);
  // the words a person reads: the router's code and the page's sentence (en here; zh / ja by the i18n net)
  const fr = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8'), ops = fs.readFileSync(path.join(REPO, 'src/lib/file-explorer-ops.js'), 'utf8');
  ok(SF.pathTryingRefusal('/scratch-b23e5/ten').code === 'path-trying' && SF.pathTryingRefusal('/scratch-b23e5/ten').status === 503
      && fr.includes("body.error.startsWith(PATH_TRYING_HEAD)) body = { ...body, error: STORAGE_PATH_TRYING, code: 'storage_path_trying' };")
      && ops.includes("if (d && d.code === 'storage_path_trying') return t('this folder or file is still being tried — wait for the answer to the first press');"),
    'the words: 503 path-trying at the pool, storage_path_trying at the router, «this folder or file is still being tried — wait for the answer to the first press» on the page');
}

console.log('①k2 r1442 (E): the look never shares a worker — no other call is placed on a worker while a look runs there; one look a folder at a time');
await told(sideK2);
async function sideK2(ok, console) {   // B-4b9a: started beside the other pool scenes (above), told here
  const run = async (Mod) => {
    const pool = new Mod.SafeFs({ poolSize: 2, name: 'path-memory-share', timeouts: { default: 15000 }, hungMs: 60000, mountsText });
    try {
      await untilLive(pool, 2);
      const look = pool.call('__sleep', { ms: 300 }, { look: true, timeoutMs: 5000 });   // stands in for the look (its worker flagged as looking)
      const lookRec = pool._workers.find((r) => r.looking);
      const others = [0, 1, 2].map(() => pool.call('__sleep', { ms: 50 }, { timeoutMs: 5000 }));
      const onLook = lookRec ? lookRec.inflight.size : -1;
      await Promise.all([look, ...others]);
      return { onLook, cleared: !!lookRec && !lookRec.looking };
    } finally { pool.close(); }
  };
  const now = await run(SF);
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8'), SKIP = '      if (rec.looking) continue;';
  const shared = src.split(SKIP).length === 2 ? mutantCopies('safe-fs-path-memory-share', REPO).load('src/safe-fs.js', anchored(src, SKIP, '      if (false) continue;', 'look-shared'), 'look-shared') : null;
  const red = shared ? await run(shared) : null;
  ok(now.onLook === 1 && now.cleared && !!red && red.onLook > 1, `the look's worker takes no other call while it is out (${now.onLook} call on it; the flag clears at its answer: ${now.cleared}); RED (the skip cut, in a copy): calls placed beside the look (${red && red.onLook})`, { now, red });
  // one look a folder at a time: a third dead sibling while the first look is out adds no second look
  const pool = new SF.SafeFs({ poolSize: 1, name: 'path-memory-onelook', hungMs: 60000, mountsText });
  try {
    let looks = 0, release; const gate = new Promise((r) => { release = r; });
    pool._lookIdle = () => { looks++; return gate.then(() => ({ links: [false, false] })); };
    pool._noteHung({ path: '/scratch-b23e5/one/a' }, 'stat', 15000);
    const c1 = pool._noteHung({ path: '/scratch-b23e5/one/b' }, 'stat', 15000);
    const c2 = pool._noteHung({ path: '/scratch-b23e5/one/c' }, 'stat', 15000);
    await sleep(20); const during = looks; release(); await Promise.all([c1, c2]);
    ok(during === 1 && !!pool._hungOf({ path: '/scratch-b23e5/one/d' }, 'stat', 15000), `one look a folder at a time: three dead siblings, ${during} look while it was out; its answer named the folder`, { during });
  } finally { pool.close(); }
}

console.log('①l r1378 (1): the mark is NOT an access door — a marked call is refused exactly as an unmarked one; it widens no deadline, size or count');
{
  const os = require('os'), express = require('express');
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'b23e5-door-'));
  const big = path.join(T, 'big.txt'); fs.writeFileSync(big, ''); fs.truncateSync(big, 11 * 1024 * 1024);   // sparse: over the 10 MB a text read takes, no disk
  const shut = path.join(T, 'shut.txt'); fs.writeFileSync(shut, 'x'); fs.chmodSync(shut, 0o000);
  const parked = (p) => (String(p).startsWith('/scratch-b23e5/parked') ? '/scratch-b23e5/parked' : false);   // the mount door's stand-in: a parked mount
  const say = (p) => p.then((r) => 'answered' + (r && typeof r.content === 'string' ? ` (${r.content.length} chars)` : ''), (e) => [e && e.status, e && e.code, e && (e.safeFsTimeout || e.deadline) ? 'deadline' : '', String((e && e.message) || '').slice(0, 70)].filter(Boolean).join(' '));
  const run = async (Mod, tag) => {
    const pool = new Mod.SafeFs({ poolSize: 2, name: `path-memory-door-${tag}`, timeouts: { default: 15000, __sleep: 300 }, hungMs: 60000, mountsText, blocked: parked });
    try {
      await untilLive(pool, 2);
      const out = {};
      for (const [k, op, payload] of [['a parked mount', 'stat', { path: '/scratch-b23e5/parked/a' }], ['a file over the bound', 'readText', { path: big, maxSize: 10 * 1024 * 1024 }], ['a file the person may not read', 'readText', { path: shut, maxSize: 1024 }], ['a folder read as a file', 'readText', { path: T, maxSize: 1024 }]]) {
        out[k] = [await say(pool.call(op, payload)), await say(pool.call(op, payload, { attended: true }))];
      }
      out.deadline = await say(pool.call('__sleep', { path: '/scratch-b23e5/slow-x', ms: 4000 }, { attended: true }));   // a 4 s stall, a 300 ms bound: a widened deadline would ANSWER (r4293: kept a SLEEP, never a held call — its power is that answer)
      out.workers = pool._workers.length;
      return out;
    } finally { pool.close(); }
  };
  const nowP = run(SF, 'now');   // the scene and its RED copies run side by side (each its own pool)
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const DOORL = '    const mp = this._blocked(payload);\n    if (mp) return Promise.reject(DOOR.refusal(mp));\n';
  const open = src.split(DOORL).length === 2 ? mutantCopies('safe-fs-path-memory-door', REPO).load('src/safe-fs.js', anchored(src, DOORL, '    const mp = opts.attended ? false : this._blocked(payload);\n    if (mp) return Promise.reject(DOOR.refusal(mp));\n', 'mark-opens-door'), 'mark-opens-door') : null;
  const CALL0 = '  call(op, payload = {}, opts = {}) {\n';
  const wide = src.split(CALL0).length === 2 ? mutantCopies('safe-fs-path-memory-size', REPO).load('src/safe-fs.js', anchored(src, CALL0, CALL0 + '    if (opts.attended && payload && payload.maxSize) payload = { ...payload, maxSize: payload.maxSize * 2 };\n', 'mark-widens-size'), 'mark-widens-size') : null;
  const [now, red, redW] = await Promise.all([nowP, open ? run(open, 'open') : null, wide ? run(wide, 'wide') : null]);
  console.log('    the facts judged: ' + JSON.stringify(now));
  const pairs = Object.entries(now).filter(([, v]) => Array.isArray(v)), apart = pairs.filter(([, [u, m]]) => u !== m);
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;   // as root the unreadable file reads: that row compares two answers, it cannot refuse
  ok(!apart.length && /storage-blocked/.test(now['a parked mount'][1]) && /deadline/.test(now.deadline) && !/^answered/.test(now.deadline) && now.workers === 2,
    `NOT AN ACCESS DOOR: ${pairs.length} refusals the same marked and unmarked (${pairs.map(([k, [u]]) => `${k}: ${u.slice(0, 40)}`).join(' · ')})${asRoot ? ' — as root, the unreadable file\'s row compares two answers' : ''}; a marked 4 s stall ends at its own 300 ms deadline, never answered (${now.deadline.slice(0, 40)}); the pool keeps its ${now.workers} workers`, { apart, now });
  ok(!!red && red['a parked mount'][0] !== red['a parked mount'][1], `RED CONTROL (the mark lets a call past the mount door, in a copy): the parked mount answers the two apart (${red && red['a parked mount'].join(' | ')})`, red);
  ok(!!redW && redW['a file over the bound'][0] !== redW['a file over the bound'][1], `RED CONTROL (the mark widens the size bound, in a copy): the file over the bound answers the two apart (${redW && redW['a file over the bound'].map((x) => x.slice(0, 30)).join(' | ')})`, redW);
  // the same over the real router: a marked read is refused as an unmarked one; a marked chunk is cut to the route's 1 MB too
  const pool = new SF.SafeFs({ poolSize: 1, name: 'path-memory-door-route', hungMs: 60000 });
  const app = express(); app.use(express.json()); app.locals.safeFs = pool; app.use(require(path.join(REPO, 'src/routes/files.js')));
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r));
  try {
    const prt = srv.address().port, M = { 'X-VibeSpace-Attended': '1' };   // stale-pins: kept (a press over plain http: nothing else stated)
    const c = `/api/file/content?path=${encodeURIComponent(big)}`, bn = `/api/file/binary?path=${encodeURIComponent(big)}&length=${5 * 1048576}`;
    const [cu, cm, bu, bm] = [await httpAsk(prt, c), await httpAsk(prt, c, M), await httpAsk(prt, bn), await httpAsk(prt, bn, M)];
    ok(cu.status === cm.status && cu.status >= 400 && JSON.stringify(cu.json) === JSON.stringify(cm.json) && bu.headers['x-bytes-read'] === bm.headers['x-bytes-read'] && Number(bm.headers['x-bytes-read']) === 1048576,
      `the router: a marked read of a file over the bound is refused as an unmarked one (${cu.status} = ${cm.status}: «${cu.json && String(cu.json.error).slice(0, 60)}»); a marked chunk is cut to 1 MB as an unmarked one (${bu.headers['x-bytes-read']} = ${bm.headers['x-bytes-read']})`, { cu: cu.json, cm: cm.json });
  } finally { srv.close(); pool.close(); try { fs.chmodSync(shut, 0o600); } catch { } fs.rmSync(T, { recursive: true, force: true }); }
}

console.log('①m r1396: no other site\'s page can send the mark — a preflight asking for it from another origin is refused, on the main port\'s routes and on the frame host');
{
  const express = require('express');
  // the browser's own rule for a preflight: an ok status, the origin allowed, the asked header allowed
  const admits = (r, origin, header) => r.status >= 200 && r.status < 300 && [origin, '*'].includes(r.headers['access-control-allow-origin'])
    && String(r.headers['access-control-allow-headers'] || '').toLowerCase().split(',').map((x) => x.trim()).some((x) => x === '*' || x === header);
  const serve = async (plant) => {
    const a = express(); if (plant) a.use(plant); a.use(express.json());
    a.use(require(path.join(REPO, 'src/routes/files.js'))); require(path.join(REPO, 'src/server/frame-host.js')).register(a);
    const s = a.listen(0, '127.0.0.1'); await new Promise((r) => s.once('listening', r)); return s;
  };
  const PATHS = ['/api/file/info?path=%2Fscratch-b23e5%2Fx', '/api/files?path=%2Fscratch-b23e5', '/api/file/content?path=%2Fscratch-b23e5%2Fx', '/frame-host?kind=preview', '/frame-host/f/' + 'a'.repeat(24) + '/page.js'];
  const ORIGINS = ['https://evil.example', 'null'];   // another site, and the preview's own opaque frame (an agent's page)
  const askAll = async (s) => { const out = []; for (const p of PATHS) for (const o of ORIGINS) { const r = await httpAsk(s.address().port, p, { Origin: o, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-vibespace-attended' }, 'OPTIONS'); out.push({ p, o, status: r.status, admitted: admits(r, o, 'x-vibespace-attended') }); } return out; };
  const s1 = await serve(null);
  let got, planted;
  try { got = await askAll(s1); } finally { s1.close(); }
  const s2 = await serve((req, res, next) => { res.set({ 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Headers': 'X-VibeSpace-Attended' }); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });   // stale-pins: kept (the planted RED: a later change that grants it)
  try { planted = await askAll(s2); } finally { s2.close(); }
  ok(got.every((x) => !x.admitted) && planted.every((x) => x.admitted), `THE PREFLIGHT: ${got.length} asks for the mark from another site and from the opaque frame (${PATHS.length} addresses: the files routes, the frame host and its folder) — none admitted (${[...new Set(got.map((x) => x.status))].join('/')}); RED (a planted middleware that grants it): all ${planted.filter((x) => x.admitted).length} admitted`, { got, planted: planted.filter((x) => !x.admitted) });
  // THE CENSUS over the hub tree (server.js and src/): no line grants a header across origins; the one line that answers another origin
  // is a row with its reason — a later change that grants a preflight anywhere is red by name
  const hub = ['server.js', ...fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter((n) => /\.(c|m)?js$/.test(n)).map((n) => 'src/' + n)];
  const CORS = /access-control-allow-|\bcors\s*\(|require\(\s*['"]cors['"]\s*\)/i;
  const ROWS = [['src/server/frame-host.js', "res.set('Access-Control-Allow-Origin', '*');", 'the preview folder\'s GET answers (its module scripts, fonts and fetch() from the opaque frame) — an origin and no header: no preflight for a custom header passes']];
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const censusOf = (rd) => { const hits = []; for (const f of hub) rd(f).split('\n').forEach((l, i) => { const t = l.trim(); if (!/^(\/\/|\*|\/\*)/.test(t) && CORS.test(l)) hits.push([f, i + 1, t]); }); return hits; };
  const hits = censusOf(read), strays = hits.filter(([f, , t]) => !ROWS.some(([rf, text]) => rf === f && t.includes(text))), dead = ROWS.filter(([rf, text]) => !hits.some(([f, , t]) => f === rf && t.includes(text)));
  const plantedHits = censusOf((f) => (f === 'server.js' ? read(f) + "\napp.use((req, res, next) => { res.set('Access-Control-Allow-Headers', '*'); next(); });\n" : read(f))).filter(([f]) => f === 'server.js');   // stale-pins: kept (the planted RED)
  ok(!strays.length && !dead.length && plantedHits.length === 1, `THE CORS CENSUS (${hub.length} files): ${hits.length} line answers another origin, a row with its reason («${ROWS[0][2].slice(0, 60)}…»); no stray (${strays.length}), no dead row (${dead.length}); RED (a planted Allow-Headers in server.js): named (${plantedHits.length})`, { strays, dead });
}

console.log('①o r1733 (4)(5)(6): the rules its round found with no leg — each driven, each with its RED');
await told(sideO);
async function sideO(ok, console) {   // B-4b9a: started beside the other pool scenes (above), told here
  const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const fv = rd('src/lib/file-viewer.js'), ce = rd('src/lib/code-editor.js'), dwu = rd('src/lib/doc-window-ui.js'), src = rd('src/safe-fs.js');
  const H = { 'X-VibeSpace-Attended': '1' };   // stale-pins: kept (the constant's value, handed to lifted bodies)
  // (4a) THE OPEN's SPENT PRESS: its first call refused (503) ⇒ the rest of the open goes unmarked — lifted from FileViewer.open
  const FIRST = (fv.match(/\n(    let fileInfo = \{ size: 0, isBinary: false \};\n    try \{\n[\s\S]*?\n    \} catch \{\}\n)/) || [])[1];
  const spent = async (block, status) => new Function('fetch', 'ATTENDED_HEADERS', 'filePath', 'hq', 'opts', `return (async () => {\n${block}\nreturn opts; })();`)(async () => ({ status, json: async () => (status === 503 ? { error: 'did not answer', code: 'storage_path_hung' } : { size: 3 }) }), H, '/scratch-b23e5/dead/a.html', '', { attended: true });
  const SPENT = '      if (res.status === 503 && opts.attended) opts = { ...opts, attended: false };';
  const sp503 = FIRST ? await spent(FIRST, 503) : null, sp200 = FIRST ? await spent(FIRST, 200) : null;
  const spR = FIRST && FIRST.includes(SPENT) ? await spent(FIRST.replace(SPENT, ''), 503) : null;   // stale-pins: kept (the line cut)
  ok(!!sp503 && sp503.attended === false && !!sp200 && sp200.attended === true && !!spR && spR.attended === true,
    `THE OPEN's SPENT PRESS (lifted from FileViewer.open): refused by the storage, the rest of the open goes unmarked (${sp503 && sp503.attended}); answered, the press rides on (${sp200 && sp200.attended}); RED (the line cut): the editor's first load would be a second try (${spR && spR.attended})`, { sp503, sp200, spR });
  // (4b) «THE FIRST READ IS MARKED ONCE» — the code editor's load and the document window's
  const CE2 = (ce.match(/\n(        const pressed = this\._openPressed; this\._openPressed = false;\n        const res = await fetch\([^\n]*\n)/) || [])[1];
  const twice = async (block) => { const marks = []; const self = { _openPressed: true, filePath: '/scratch-b23e5/proj/a.js', _host: '' }; const fn = new Function('fetch', 'ATTENDED_HEADERS', `return async function () {\n${block}\nreturn res; };`)(async (u, init) => { marks.push(!!(init && init.headers && init.headers['X-VibeSpace-Attended'])); return {}; }, H); await fn.call(self); await fn.call(self); return marks.join(); };
  const ceNow = CE2 ? await twice(CE2) : null, ceRed = CE2 ? await twice(CE2.replace(' this._openPressed = false;', '')) : null;   // stale-pins: kept (the reset cut)
  const DW2 = "      const pressed = (first && pressedFirst) || byPress; pressedFirst = false;   // a press: the window opened by one, its Reload, the way back from Raw";
  const dwOnce = (line) => { let pressedFirst = true; const seen = []; const f1 = new Function('getPF', 'setPF', 'first', 'byPress', `let pressedFirst = getPF();\n${line}\nsetPF(pressedFirst); return pressed;`); for (let i = 0; i < 2; i++) seen.push(f1(() => pressedFirst, (v) => { pressedFirst = v; }, true, false)); return seen.join(); };
  const dwNow = dwu.includes(DW2) ? dwOnce(DW2) : null, dwRed = dwu.includes(DW2) ? dwOnce(DW2.replace(' pressedFirst = false;', '')) : null;   // stale-pins: kept (the reset cut)
  ok(ceNow === 'true,false' && ceRed === 'true,true' && dwNow === 'true,false' && dwRed === 'true,true',
    `«THE FIRST READ IS MARKED ONCE»: the code editor's two loads ${ceNow}, the document window's two first loads ${dwNow}; REDs (each reset cut, lifted): every load marked (${ceRed} · ${dwRed})`, { ceNow, ceRed, dwNow, dwRed });
  // (4c) THE HOLD RELEASED when the worker DIES or the send FAILS (not only an answer or a deadline)
  const hold = async (Mod, tag) => {
    const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-hold-${tag}`, timeouts: { default: 15000 }, hungMs: 60000, mountsText, workerPath: DEADW.script });   // r4293: the held press is a held call (only the worker's death ends it)
    try {
      await untilLive(pool, 1);
      await pool._noteHung({ path: '/scratch-b23e5/held' }, 'stat', 15000);
      const p = pool.call('__sleep', { path: '/scratch-b23e5/held', ms: HELD_MS }, { attended: true, timeoutMs: 15000 }).catch((e) => String(e && e.message));
      await sleep(50); const during = pool._trying ? pool._trying.size : 0;
      pool._workers[0].worker.terminate();   // the worker DIES under the held press
      const died = await p; await sleep(20); const afterDeath = pool._trying ? pool._trying.size : 0;
      await untilLive(pool, 1);
      const w = pool._workers[0].worker, post = w.postMessage; w.postMessage = () => { throw new Error('the send failed (planted)'); };   // stale-pins: kept (a planted dispatch fault)
      const p2 = await pool.call('__sleep', { path: '/scratch-b23e5/held', ms: 1 }, { attended: true }).then(() => 'answered', (e) => String(e && e.message));
      w.postMessage = post; const afterSend = pool._trying ? pool._trying.size : 0;
      return { during, died: died && died.slice(0, 40), afterDeath, p2: p2.slice(0, 40), afterSend };
    } finally { pool.close(); }
  };
  const hNowP = hold(SF, 'now');   // the scene and its RED copy side by side
  const OFF = "    if (held.length) { const off = () => { for (const x of held) if (this._trying && this._trying.get(x.path) === sent) this._trying.delete(x.path); }; for (const x of held) (this._trying = this._trying || new Map()).set(x.path, sent); sent.then(off, off); }\n";
  const leak = src.split(OFF).length === 2 ? mutantCopies('safe-fs-path-memory-hold', REPO).load('src/safe-fs.js', anchored(src, OFF, OFF.replace('sent.then(off, off);', 'sent.then(off, () => {});'), 'hold-kept-on-a-fault'), 'hold-kept-on-a-fault') : null;
  const [hNow, hRed] = await Promise.all([hNowP, leak ? hold(leak, 'red') : null]);
  console.log('    the hold: ' + JSON.stringify({ now: hNow, red: hRed }));
  ok(hNow.during === 1 && hNow.afterDeath === 0 && /send failed/.test(hNow.p2) && hNow.afterSend === 0 && !!hRed && hRed.afterDeath === 1,
    `THE HOLD IS RELEASED on a worker's death (${hNow.afterDeath} held after it) and on a failed send (${hNow.afterSend}), not only on an answer or a deadline; RED (released on an answer only, in a copy): the dead worker's press holds the path for good (${hRed && hRed.afterDeath})`, { hNow, hRed });
  // (5) A SERIAL LANE NEVER CLIMBS (its look would queue behind the one op it runs — the law: an idle worker only)
  const laneClimb = async (Mod, tag) => {
    const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-lane-${tag}`, hungMs: 60000, mountsText });
    try {
      const lane = pool.lane('history'); let looks = 0; lane._lookIdle = async () => { looks++; return { links: [false, false] }; };
      await lane._noteHung({ path: '/scratch-b23e5/hist/a' }, 'stat', 15000); await lane._noteHung({ path: '/scratch-b23e5/hist/b' }, 'stat', 15000);
      return { looks, named: !!lane._hungOf({ path: '/scratch-b23e5/hist/c' }, 'stat', 15000), serial: !!lane._serial };
    } finally { pool.close(); }
  };
  const lNow = await laneClimb(SF, 'now');
  const SER = '    if (this._serial) return Promise.resolve();\n';
  const lc = src.split(SER).length === 2 ? mutantCopies('safe-fs-path-memory-lane', REPO).load('src/safe-fs.js', anchored(src, SER, '', 'lane-climbs'), 'lane-climbs') : null;
  const lRed = lc ? await laneClimb(lc, 'red') : null;
  ok(lNow.serial && lNow.looks === 0 && !lNow.named && !!lRed && lRed.looks === 1, `A SERIAL LANE NEVER CLIMBS: two dead children on the history lane, ${lNow.looks} look, nothing named (each names itself); RED (the skip cut, in a copy): the lane looks (${lRed && lRed.looks})`, { lNow, lRed });
  // (6) THE WORDS: looks holding every worker answer «busy» — never «the file readers are restarting»
  const busyWord = async (Mod, tag) => {
    const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-busy-word-${tag}`, timeouts: { default: 15000 }, hungMs: 60000 });
    try {
      await untilLive(pool, 1);
      const look = pool.call('__sleep', { ms: 300 }, { look: true, timeoutMs: 5000 });
      const code = await pool.call('__sleep', { ms: 1 }).then(() => 'answered', (e) => String(e && e.code));
      await look; return code;
    } finally { pool.close(); }
  };
  const bNowP = busyWord(SF, 'now');
  const BUSY = "      if ((this._workers || []).some((r) => r.alive && r.worker && r.looking)) return Promise.reject(noIdleRefusal(this._words));";
  const bc = src.split(BUSY).length === 2 ? mutantCopies('safe-fs-path-memory-busyword', REPO).load('src/safe-fs.js', anchored(src, BUSY, '', 'busy-as-restarting'), 'busy-as-restarting') : null;
  const [bNow, bRed] = await Promise.all([bNowP, bc ? busyWord(bc, 'red') : null]);
  const fr = rd('src/routes/files.js'), ops = rd('src/lib/file-explorer-ops.js');
  ok(bNow === 'no-idle-worker' && bRed === 'no-worker' && fr.includes("body.error.startsWith(NO_IDLE_HEAD)) body = { ...body, error: STORAGE_BUSY, code: 'storage_busy' };") && ops.includes("if (d && d.code === 'storage_busy') return t('the file readers are all busy — try again in a moment');"),
    `THE WORDS: a call while every worker is out on a look is refused «busy» (${bNow} ⇒ storage_busy, «the file readers are all busy — try again in a moment»); RED (the line cut, in a copy): «the file readers are restarting» (${bRed})`, { bNow, bRed });
}

console.log('①n r1442 (a): the helper-opened presses, driven lifted from source — a chat path link, a relative link, the chat\'s artifact door');
{
  const cr = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8'), cvs = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  const bodyOf = (text, head) => { const i = text.indexOf('\n' + head + '\n'); if (i < 0) return null; const j = text.indexOf('\n  }\n', i + 1); return j < 0 ? null : text.slice(i + head.length + 2, j); };
  const LINK = '  _openLinkTarget(link, url, fp, { pressed = false } = {}) {', REL = '  async _openRelTarget(link, rel, { pressed = false } = {}) {';
  const ART = '  _openArtifact(b, { quiet = false, pressed = false } = {}) {';
  const DEAD503 = { status: 503, body: { error: 'this folder or file did not answer in time — try again in 30 s', code: 'storage_path_hung', params: { s: 30 } } };
  const OKFILE = { status: 200, body: { isDirectory: false, size: 3 } };
  const world = (answers) => {
    const calls = [], opened = [], missing = [];
    const fetchStub = async (url, init) => { const p = decodeURIComponent((/path=([^&]*)/.exec(url) || [])[1] || ''); calls.push({ url, p, marked: !!(init && init.headers && init.headers['X-VibeSpace-Attended']) }); const a = answers[p] || { status: 404, body: { error: 'ENOENT: no such file' } }; return { status: a.status, ok: a.status < 400, json: async () => a.body }; };   // stale-pins: kept (the stand-in fetch reads the mark)
    const self = { _sessionCtx: () => ({ cwd: '/scratch-b23e5/proj', host: '' }), _sourceWinId: () => 'w1', _linkOp() {}, _linkMissing: (l, x) => missing.push(x.why), winInfo: { id: 'w1' }, sessionId: 's1',
      app: { openFile: (p, n, o) => opened.push({ p, attended: !!(o && o.attended), quiet: !!(o && o.quiet) }), openFileExplorer: (p, o) => opened.push({ p, dir: true, attended: !!(o && o.attended) }) } };
    return { calls, opened, missing, fetchStub, self };
  };
  const H = { 'X-VibeSpace-Attended': '1' };   // stale-pins: kept (the constant's value, handed to the lifted body)
  // a chat PATH link: its first call (the file's info) carries the press; refused, the press is spent and nothing else is asked
  const lb = bodyOf(cr, LINK);
  const runLink = async (body, pressed, answers) => { const w = world(answers); const fn = new Function('fetch', 'ATTENDED_HEADERS', 'fsErrorText', 'window', `return function (link, url, fp, { pressed = false } = {}) {\n${body}\n};`)(w.fetchStub, H, (d) => d.error, { open() {} }); await fn.call(w.self, {}, null, '/scratch-b23e5/dead/a.md', { pressed }); await sleep(0); return w; };
  const P_OK = lb ? await runLink(lb, true, { '/scratch-b23e5/dead/a.md': OKFILE }) : null, P_DEAD = lb ? await runLink(lb, true, { '/scratch-b23e5/dead/a.md': DEAD503 }) : null, U_OK = lb ? await runLink(lb, false, { '/scratch-b23e5/dead/a.md': OKFILE }) : null;
  const LCUT = 'pressed ? { headers: ATTENDED_HEADERS } : undefined)';
  const R_LINK = lb && lb.includes(LCUT) ? await runLink(lb.replace(LCUT, 'undefined)'), true, { '/scratch-b23e5/dead/a.md': OKFILE }) : null;   // stale-pins: kept (the release: the link's probe unmarked)
  const said = (w) => w && { calls: w.calls.map((c) => (c.marked ? 'marked' : 'plain')).join(), opened: w.opened.map((o) => (o.attended ? 'attended' : 'plain')).join(), missing: w.missing.join() };
  console.log('    a path link: ' + JSON.stringify({ pressedOk: said(P_OK), pressedDead: said(P_DEAD), plainOk: said(U_OK), red: said(R_LINK) }));
  ok(!!P_OK && P_OK.calls.length === 1 && P_OK.calls[0].marked && P_OK.opened.length === 1 && P_OK.opened[0].attended
      && !!P_DEAD && P_DEAD.calls.length === 1 && P_DEAD.calls[0].marked && !P_DEAD.opened.length && P_DEAD.missing.join() === 'error'
      && !!U_OK && !U_OK.calls[0].marked && !U_OK.opened[0].attended && !!R_LINK && !R_LINK.calls[0].marked,
    'A CHAT PATH LINK PRESSED (Ctrl+click, the menu\'s Open): its first call carries the mark and so does the open; refused by the storage, it is said and nothing else is asked; not pressed, nothing is marked; RED (the release\'s probe, lifted): unmarked', { P_OK: said(P_OK), P_DEAD: said(P_DEAD), U_OK: said(U_OK), R_LINK: said(R_LINK) });
  // a RELATIVE link: its candidates probed one by one — the press SPENT at the first the storage refuses; the rest go unmarked
  const rb = bodyOf(cr, REL);
  const CANDS = ['/scratch-b23e5/proj/a/x.md', '/scratch-b23e5/proj/x.md'];
  const runRel = async (body, answers) => { const w = world(answers); const fn = new Function('fetch', 'ATTENDED_HEADERS', 'relCandidates', 'showContextMenu', 'fsErrorText', `return async function (link, rel, { pressed = false } = {}) {\n${body}\n};`)(w.fetchStub, H, () => CANDS, () => {}, (d) => (d && d.error) || ''); await fn.call(w.self, { getBoundingClientRect: () => ({ left: 0, bottom: 0 }) }, 'x.md', { pressed: true }); return w; };
  const REL1 = rb ? await runRel(rb, { [CANDS[0]]: DEAD503, [CANDS[1]]: OKFILE }) : null;
  const RCUT = '        if (r.status === 503) spend = false;\n';
  const R_REL = rb && rb.includes(RCUT) ? await runRel(rb.replace(RCUT, ''), { [CANDS[0]]: DEAD503, [CANDS[1]]: OKFILE }) : null;   // stale-pins: kept (the press never spent)
  // the first candidate answers: the press rides on to the open (marked); every candidate refused by the storage: SAID, no search after
  const REL_OK = rb ? await runRel(rb, { [CANDS[0]]: OKFILE }) : null, REL_ALL = rb ? await runRel(rb, { [CANDS[0]]: DEAD503, [CANDS[1]]: DEAD503 }) : null;
  const REFUSED_LINE = (rb || '').split('\n').find((l) => l.startsWith('    if (refused) { this._linkMissing(')) || '';
  const R_ALL = rb && REFUSED_LINE ? await runRel(rb.replace(REFUSED_LINE + '\n', ''), { [CANDS[0]]: DEAD503, [CANDS[1]]: DEAD503 }) : null;   // stale-pins: kept (the refusal said as «not found», a search after it)
  console.log('    a relative link: ' + JSON.stringify({ now: said(REL1), red: said(R_REL), ok: said(REL_OK), all: said(REL_ALL), redAll: R_ALL && { locate: R_ALL.calls.some((c) => /locate/.test(c.url)), missing: R_ALL.missing.join() } }));
  ok(!!REL_OK && REL_OK.calls.length === 1 && REL_OK.calls[0].marked && REL_OK.opened.length === 1 && REL_OK.opened[0].attended
      && !!REL_ALL && !REL_ALL.calls.some((c) => /locate/.test(c.url)) && REL_ALL.missing.join() === 'error' && !REL_ALL.opened.length && !!R_ALL && R_ALL.calls.some((c) => /locate/.test(c.url)),
    'A RELATIVE LINK: its first candidate answering, the open carries the press; every candidate refused by the storage, it is SAID («error», the storage\'s words) and nothing else is asked; RED (the refusal line cut, lifted): a search into the same storage and «not found»', { REL_OK: said(REL_OK), REL_ALL: said(REL_ALL) });
  ok(!!REL1 && REL1.calls.map((c) => c.marked).join() === 'true,false' && REL1.opened.length === 1 && REL1.opened[0].p === CANDS[1] && !REL1.opened[0].attended
      && !!R_REL && R_REL.calls.map((c) => c.marked).join() === 'true,true',
    'A RELATIVE LINK PRESSED: its first candidate carries the press; refused by the storage the press is SPENT — the next candidate and the open go unmarked (one press, one try); RED (never spent, lifted): the next candidate is tried marked too', { REL1: said(REL1), R_REL: said(R_REL) });
  // the chat's artifact door: marked only when pressed (the card, the chip's row) — never the auto open (quiet)
  const ab = bodyOf(cvs, ART);
  const runArt = (body, o) => { const w = world({}); const fn = new Function('serviceOpenSpec', 'serviceHref', 'location', `return function (b, { quiet = false, pressed = false } = {}) {\n${body}\n};`)(() => ({}), () => '', { origin: 'http://x' }); fn.call(w.self, { kind: 'file', path: '/scratch-b23e5/proj/report.md', name: 'report.md' }, o); return w.opened[0] || null; };
  const art = ab ? { pressed: runArt(ab, { pressed: true }), auto: runArt(ab, { quiet: true, pressed: true }), plain: runArt(ab, {}) } : null;
  ok(!!art && !!art.pressed && !!art.auto && !!art.plain && art.pressed.attended && !art.auto.attended && art.auto.quiet && !art.plain.attended, `THE CHAT'S ARTIFACT DOOR: a card or a chip's row pressed opens marked (${art && art.pressed.attended}); the AUTO open (quiet) never (${art && art.auto.attended}), nor a call that is no press (${art && art.plain.attended})`, art);
}

console.log('①p r2006 / r2198 / r2221 / r2222 (the save\'s laws): A one write of a file at a time at the hub; B no pane with typing removed unasked; C a save out answers every press; the reply names its text; the typed load; the viewers\' Reload');
{
  const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const ce = rd('src/lib/code-editor.js'), ee = rd('src/lib/external-editor.js'), fv = rd('src/lib/file-viewer.js'), ops = rd('src/lib/file-explorer-ops.js'), fwSrc = rd('src/server/file-writes.js');
  const fr = rd('src/routes/files.js'), edr = rd('src/routes/editor.js'), sfsSrc = rd('src/safe-fs.js'), DOORS_SRC = rd('src/lib/refusal-doors.js');
  const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const H = { 'X-VibeSpace-Attended': '1' };   // stale-pins: kept (the constant's value, handed to lifted bodies)
  const tick = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
  const stuck = (p) => Promise.race([p, sleep(300).then(() => 'stuck')]);
  const cut = (body, a, b) => (body && body.split(a).length === 2 ? body.replace(a, b) : null);
  const FW = createRequire(import.meta.url)(path.join(REPO, 'src/server/file-writes.js'));
  // the page's own digest and «names the text» test, LIFTED from src/lib/file-explorer-ops.js (an ES module that loads the page's i18n)
  const TD = (ops.match(/\nexport function textDigest\(text\) \{\n([\s\S]*?)\n\}\n/) || [])[1];
  const pageDigest = TD ? new Function('text', TD) : null;
  const NT = (ops.match(/\nexport const namesText = (\(data, text\) => [^\n]*);\n/) || [])[1];
  const namesText = NT && pageDigest ? new Function('textDigest', `return ${NT};`)(pageDigest) : null;
  const SSW = (ops.match(/\nexport const stillSavingWords = (\(name\) => [^\n]*);\n/) || [])[1];
  const stillSavingWords = SSW ? new Function('t', `return ${SSW};`)(tt) : null;
  const STILL = 'notes.md: still saving…', NOREPLY = 'notes.md: no reply — it may still have been saved';
  const ANOTHER = 'another press on this file or its folder is still being tried';
  const STILL_HERE = '. Your text is still here, unsaved: save again, or copy it to keep it elsewhere.';
  const TYPED_ON = 'notes.md is saved as it was when you pressed save — what you typed after is not saved yet: save again';
  const fsErr = (d) => d && d.error;   // the real one's branches are pinned below
  // (0) THE DIGEST — the hub's (src/server/file-writes.js digestOf) and the page's agree on every text, the long and the astral too
  const samples = ['', 'a', 'the person\'s text', '中文 ✓ 🙂 — «Ω»', 'x'.repeat(50000) + '\n\u{1F600}'];
  const same = !!pageDigest && samples.every((x) => pageDigest(x) === FW.digestOf(x));
  const TDR = TD && TD.includes('0xdeadbeef') ? new Function('text', TD.replace('0xdeadbeef', '0xdeadbeee')) : null;   // stale-pins: kept (RED: another seed)
  ok(same && !!namesText && namesText({ saved: FW.savedOf('héllo') }, 'héllo') && !namesText({ saved: FW.savedOf('héllo') }, 'hello') && !namesText({}, '') && !!TDR && TDR('a') !== FW.digestOf('a'),
    'THE REPLY NAMES ITS TEXT (r2221 item 6): the hub\'s digest and the page\'s agree on every sample (empty, CJK, astral, 50 000 chars); a reply naming another text, or none, is no «saved»; RED (another seed on the page): the two differ', { same });
  // (1) LAW A (final, r2299) — THE HUB's ONE QUEUE A FILE (the real module): the first write held, the second does not start; the first
  // ends — landed, or UNKNOWN (A2: an unknown end releases the file too) — and only then the second lands; a third lands after it.
  // RED (no queue, a copy): the second runs at once and the older text lands over the newer
  const queueRun = async (M, firstEnds = 'land') => {
    const disk = { text: 'the text on disk' }, said = (p) => p.then((v) => `saved ${v}`, (e) => `${M.outcomeOf(e)}`);
    let release = null; const held = new Promise((r) => { release = r; }); const key = `scratch-b23e5\n/scratch-b23e5/notes-${Math.random()}.md`;
    const w1 = said(M.orderedWrite(key, async () => { await held; if (firstEnds === 'unknown') throw Object.assign(new Error('storage worker restarted'), { mayHaveRun: true }); disk.text = 'A (older)'; return 'A'; })); await tick();
    const w2 = said(M.orderedWrite(key, async () => { disk.text = 'B (newer)'; return 'B'; })); await tick();
    const beforeFirst = disk.text;
    release(); const w1a = await stuck(w1), w2a = await stuck(w2), afterBoth = disk.text;
    const w3 = await stuck(said(M.orderedWrite(key, async () => { disk.text = 'C (third)'; return 'C'; })));
    return { beforeFirst, w1a, w2a, afterBoth, w3, end: disk.text };
  };
  const QLINE = '  const answer = prev.then(() => run());';
  const noQueue = fwSrc.split(QLINE).length === 2 ? mutantCopies('safe-fs-path-memory-fw', REPO).load('src/server/file-writes.js', anchored(fwSrc, QLINE, '  const answer = Promise.resolve().then(() => run());', 'no-queue'), 'no-queue') : null;
  // A1 / A5 on the real pool: a call that ran out its deadline WHILE QUEUED never started; the one the worker was running may have run
  const poolMarks = async (Mod, tag) => {
    const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-marks-${tag}`, timeouts: { default: 15000 }, hungMs: 60000, mountsText, workerPath: DEADW.script });   // r4293: the running op is a held call (only the queued call's deadline ends it)
    try {
      await untilLive(pool, 1);
      const pa = pool.call('__sleep', { ms: HELD_MS }, { timeoutMs: 5000 }).then(() => null, (e) => e);
      const pb = pool.call('__sleep', { ms: 1 }, { timeoutMs: 150 }).then(() => null, (e) => e);
      const [a1, b1] = await Promise.all([pa, pb]);
      return { a: a1 && { msg: String(a1.message).slice(0, 40), mayHaveRun: !!a1.mayHaveRun, out: FW.outcomeOf(a1) }, b: b1 && { msg: String(b1.message).slice(0, 40), neverStarted: !!b1.neverStarted, out: FW.outcomeOf(b1) } };
    } finally { pool.close(); }
  };
  const MARKLINE = '      if (running === undefined ? oldest : call === running) e.mayHaveRun = true; else e.neverStarted = true;';
  const unmarked = sfsSrc.split(MARKLINE).length === 2 ? mutantCopies('safe-fs-path-memory-marks', REPO).load('src/safe-fs.js', anchored(sfsSrc, MARKLINE, '', 'marks-cut'), 'marks-cut') : null;
  const [qNow, qUnk, qR, pmNow, pmR] = await Promise.all([queueRun(FW), queueRun(FW, 'unknown'), noQueue ? queueRun(noQueue) : null, poolMarks(SF, 'now'), unmarked ? poolMarks(unmarked, 'red') : null]);
  const ans = (e) => { const a = FW.answerOf(e, 'this machine'); return a ? `${a.status} ${a.body.code}` : 'failed: the road\'s words'; };
  const answers = { never: ans({ neverStarted: true }), sibling: ans({ mayHaveRun: true }), deadline: ans({ deadline: true }), device: ans({ writeUnknown: true }), storage: ans(new Error('EACCES: permission denied')) };
  console.log('    law A: ' + JSON.stringify({ qNow, qUnk, qR, pmNow, pmR, answers }));
  ok(qNow.beforeFirst === 'the text on disk' && qNow.w1a === 'saved A' && qNow.w2a === 'saved B' && qNow.afterBoth === 'B (newer)' && qNow.w3 === 'saved C' && qNow.end === 'C (third)'
      && qUnk.w1a === 'unknown' && qUnk.w2a === 'saved B' && qUnk.afterBoth === 'B (newer)' && !!qR && qR.w2a === 'saved B' && qR.afterBoth === 'A (older)',
    `LAW A (the hub's queue, src/server/file-writes.js): a second write of one file does not start while the first is out; the first lands, then the second (the file ends «${qNow.afterBoth}»), a third after; an UNKNOWN end releases the file too (A2: «${qUnk.w1a}» then «${qUnk.w2a}»); RED (no queue, a copy): the newer lands, then the OLDER over it («${qR && qR.afterBoth}»)`, { qNow, qUnk, qR });
  ok(!!pmNow.a && pmNow.a.mayHaveRun && pmNow.a.out === 'unknown' && !!pmNow.b && pmNow.b.neverStarted && pmNow.b.out === 'never' && !!pmR && pmR.a && pmR.a.out === 'failed'
      && answers.never === '503 write_never_started' && answers.sibling === '503 write_unknown' && answers.deadline === '503 write_unknown' && answers.device === '503 write_unknown' && answers.storage === 'failed: the road\'s words'
      && fr.includes("FW.orderedWrite(`${R.host}\\n${p}`, () => R.fs.write(R.host, p, Buffer.from(content)))") && fr.includes("FW.orderedWrite(`\\n${p}`, () => sfs(req).call('writeFile', { path: p, content }))")
      && (fr.match(/res\.json\(\{ success: true, saved: FW\.savedOf\(content\) \}\)/g) || []).length === 2 && (fr.match(/FW\.answerOf\(/g) || []).length === 2,
    `LAW A1 / A5 (the real pool, the module's answers): a call that ran out its deadline while QUEUED never started («${pmNow.b && pmNow.b.out}» ⇒ «not saved: it never started»); the one its worker was running may have run («${pmNow.a && pmNow.a.out}» ⇒ «may have been saved»); a sibling's restart, a deadline, a device timer are UNKNOWN, a storage's own error FAILED; RED (the marks cut, a copy): the running write said «failed» — «not saved» over a write that may have landed`, { pmNow, pmR, answers });
  // A4 + ★7 on a paired machine — remote-fs's write and its «not there», LIFTED: a sent device write the hub gave up on never takes the ssh
  // road; the file's OWN stat says «not there», never a folder listing
  const rfsSrc = rd('src/remote-fs.js');
  const NS = (rfsSrc.match(/\nconst writeNotSent = ([^\n]*);\n/) || [])[1], WM = (rfsSrc.match(/\nconst writeMarked = ([^\n]*);\n/) || [])[1];
  const writeNotSent = NS ? new Function(`return ${NS};`)() : null, writeMarked = WM && writeNotSent ? new Function('writeNotSent', `return ${WM};`)(writeNotSent) : null;
  const WRITE = (rfsSrc.match(/\n  async write\(id, filePath, contentBuffer\) \{\n([\s\S]*?)\n  \}\n/) || [])[1];
  const devWrite = async (body, err) => { const roads = []; const self = { _win: async () => null, _dev: async () => ({ fsWrite: async () => { roads.push('device'); throw err; } }), _devAbs: async () => '/scratch-b23e5/dead/notes.md', _actBy: 'human:scratch', hosts: { get: () => ({ transport: 'ssh' }) }, _sshWrite: async () => { roads.push('ssh'); return { success: true }; } };
    const out = await new Function('writeNotSent', 'writeMarked', `return async function (id, filePath, contentBuffer) {\n${body}\n};`)(writeNotSent, writeMarked).call(self, 'm1', '/scratch-b23e5/dead/notes.md', Buffer.from('x')).then(() => 'answered', (e) => FW.outcomeOf(e));
    return { roads: roads.join('+'), out }; };
  const A4 = '        if (abs !== null && !writeNotSent(e)) throw writeMarked(e);';
  const WM_4a94 = "(e) => { if (e && typeof e === 'object' && !writeNotSent(e) && (/ timeout$/.test(String(e.message)) || /^device link lost/.test(String(e.message)))) { try { e.writeUnknown = true; } catch { } } return e; }";   // stale-pins: kept (4a94eb1a4's mark, planted in the RED)
  const writeMarked4a94 = writeNotSent ? new Function('writeNotSent', `return ${WM_4a94};`)(writeNotSent) : null;
  const devAnswer = (mark, msg) => { const e = mark(new Error(msg)); const a = FW.answerOf(e, 'm1'); return a ? `${a.status} ${a.body.code}` : `failed: ${e.message}`; };
  const DEADLINE = 'fs deadline (write)', NEVER = 'fs deadline (write): never started — 1 worker(s) busy, 0 wedged in the kernel';
  const [dTimer, dLost, dNotSent, dOwn, dTimerR] = await Promise.all([
    WRITE ? devWrite(WRITE, new Error('fs-op timeout')) : null, WRITE ? devWrite(WRITE, new Error('device link lost')) : null,
    WRITE ? devWrite(WRITE, Object.assign(new Error('not connected'), { stage: 'connect' })) : null, WRITE ? devWrite(WRITE, new Error('EACCES: permission denied, open \'/scratch-b23e5/dead/notes.md\'')) : null,
    WRITE && WRITE.split(A4).length === 2 ? devWrite(WRITE.replace(A4 + '\n', ''), new Error('fs-op timeout')) : null,   // stale-pins: kept (RED: the release's fallback after a sent write)
  ]);
  const NT0 = (rfsSrc.match(/\n  async _notThere\(id, filePath\) \{\n([\s\S]*?)\n  \}\n/) || [])[1];
  const notThere = async (body, statErr, listing) => new Function('shq', `return async function (id, filePath) {\n${body}\n};`)((x) => `'${x}'`).call({ _win: async () => null, _dev: async () => ({ fsStat: async () => { if (statErr) throw statErr; return { stat: { size: 3 } }; }, fsList: async () => ({ entries: listing || [] }) }), _devAbs: async () => '/scratch-b23e5/tmp/prompt.md', _run: async () => Buffer.from('there') }, 'm1', '/scratch-b23e5/tmp/prompt.md');
  const LISTING = "      const abs = await this._devAbs(id, dm, filePath); const l = await dm.fsList(abs.slice(0, abs.lastIndexOf('/'))); return Array.isArray(l && l.entries) && !l.entries.some((x) => x && x.name === abs.slice(abs.lastIndexOf('/') + 1));";   // 767bde791's listing, planted
  const STATLINE = (NT0 || '').split('\n').find((l) => l.startsWith('      try { await dm.fsStat(')) || '';
  const capped = Array.from({ length: 5000 }, (_, i) => ({ name: `f-${i}` }));
  const [ntGone, ntThere, ntHiccup, ntR] = await Promise.all([NT0 ? notThere(NT0, new Error('ENOENT: no such file or directory, stat \'/scratch-b23e5/tmp/prompt.md\'')) : null, NT0 ? notThere(NT0, null, capped) : null,
    NT0 ? notThere(NT0, new Error('fs-op timeout')) : null, NT0 && STATLINE ? notThere(NT0.replace(STATLINE, LISTING), null, capped) : null]);   // stale-pins: kept (RED: 767bde791's capped listing)
  const dDead = writeMarked ? devAnswer(writeMarked, DEADLINE) : null, dNever = writeMarked ? devAnswer(writeMarked, NEVER) : null, dDeadR = writeMarked4a94 ? devAnswer(writeMarked4a94, DEADLINE) : null;
  console.log('    a paired machine: ' + JSON.stringify({ dTimer, dLost, dNotSent, dOwn, dTimerR, ntGone, ntThere, ntHiccup, ntR, dDead, dNever, dDeadR }));
  ok(dDead === '503 write_unknown' && dNever === '503 write_never_started' && dDeadR === 'failed: fs deadline (write)'
      && rfsSrc.includes("const bound = setTimeout(() => { ended = true; try { child.kill('SIGTERM'); } catch { } }, SSH_WRITE_MS);") && rfsSrc.includes("if (ended) return reject(Object.assign(new Error(`the write over ssh did not answer in ${SSH_WRITE_MS / 1000} s`), { writeUnknown: true }));"),
    `r2411 THE MUST (A1 on the device road): the machine's OWN storage pool's deadline on a RUNNING write («${DEADLINE}») is UNKNOWN (${dDead}) — the page's unknown words and standing line, never «not saved»; its never-started form stays FAILED (${dNever} «not saved: it never started»); (3) an ssh write past the device road's 30 s ends UNKNOWN and releases its file; RED (4a94eb1a4's mark): the deadline read «${dDeadR}» — «not saved» over a write that may still land`, { dDead, dNever, dDeadR });
  ok(!!dTimer && dTimer.roads === 'device' && dTimer.out === 'unknown' && !!dLost && dLost.roads === 'device' && dLost.out === 'unknown' && !!dNotSent && dNotSent.roads === 'device+ssh' && dNotSent.out === 'answered'
      && !!dOwn && dOwn.roads === 'device' && dOwn.out === 'failed' && !!dTimerR && dTimerR.roads === 'device+ssh'
      && ntGone === true && ntThere === false && ntHiccup === false && ntR === true
      && rfsSrc.includes("reject(said || Object.assign(new Error(err.trim() || `write failed (${code})`), code === 255 ? { writeUnknown: true } : {}));"),
    `A4 + ★7 (a paired machine, lifted): a device write the hub's timer gave up on, or whose link broke, is UNKNOWN and takes NO second road; only a write refused before sending goes the ssh road; the machine's own error is FAILED; «not there» comes from the file's OWN stat (a hiccup is no verdict); REDs: the release's fallback (an ssh write after a sent one); 767bde791's capped listing («not there» for a file that is there)`, { dTimer, dTimerR, ntGone, ntThere, ntR });
  ok(edr.includes("boundTimer = setTimeout(() => answer(504, { error: 'not told yet — it may still arrive', code: 'telling_out' }), require('../server/file-writes').BOUND_MS);") && edr.includes("    answer(200, { success: true });") && FW.BOUND_MS === 30000
      && /if \(d && d\.code === 'write_unknown'\) return t\('the write did not reply — it may have been saved'\);/.test(ops) && /if \(d && d\.code === 'write_never_started'\) return t\('it never started'\);/.test(ops) && /if \(d && d\.code === 'file_not_there'\) return t\('there is no such file yet'\);/.test(ops),
    'the telling\'s ANSWER is bounded at the hub\'s 30 s («not told yet — it may still arrive», never stopped); the page words UNKNOWN, «never started» and «not there» in the reader\'s words');
  // (2) THE CODE EDITOR — its save LIFTED and driven over a stand-in hub whose writes NAME their text (law 2, item 6)
  const named = (content) => ({ ok: true, status: 200, json: async () => ({ success: true, saved: FW.savedOf(content) }) });
  const hub = () => {
    const q = [], gates = [], writes = []; let open = 0, overlap = 0;
    const write = (content, signal) => new Promise((resolve, reject) => {
      writes.push(content); open++; if (open > 1) overlap++;
      let settled = false; const done = (v, err) => { if (settled) return; settled = true; open--; if (err) reject(v); else resolve(v); };
      if (signal) signal.addEventListener('abort', () => done(Object.assign(new Error('aborted'), { name: 'AbortError' }), true), { once: true });
      const a = q.shift() || 'land';
      const answer = () => done(a.endsWith('refuse') ? { ok: false, status: 503, json: async () => ({ error: 'still tried', code: 'storage_path_trying' }) }
        : a.endsWith('unknown') ? { ok: false, status: 503, json: async () => ({ error: 'the write to this machine did not answer — it may have been saved', code: 'write_unknown', params: { machine: 'this machine' } }) }
        : a.endsWith('unnamed') ? { ok: true, status: 200, json: async () => { throw new Error('the body could not be read'); } }
        : a.endsWith('fail') ? { ok: false, status: 500, json: async () => ({ error: 'EIO: i/o error' }) }
        : a.endsWith('proxy') ? { ok: false, status: 502, json: async () => { throw new Error('a proxy\'s page, not JSON'); } } : named(content));
      if (a === 'never') return;
      if (a === 'rejected') return done(new TypeError('Failed to fetch'), true);   // the hub restarted / the link dropped mid-request
      if (a.startsWith('hold')) gates.push(answer); else answer();
    });
    return { q, writes, write, release: () => { const g = gates.shift(); if (g) g(); }, overlap: () => overlap };
  };
  const saveBody = (ce.match(/\n  async save\(\) \{\n([\s\S]*?)\n  \}\n\n  \/\/ lane artifacts-model/) || [])[1];
  const edWorld = (body, { modified = true } = {}) => {
    const h = hub(), timers = [], toasts = []; let doc = 'the person\'s text';
    const ed = { editorView: { state: { doc: { toString: () => doc } } }, saveIndicator: { textContent: '', style: {}, title: '' }, filePath: '/scratch-b23e5/dead/notes.md', _host: '', _diskChip: { style: {} }, _noteArtifactSave() {}, _baselineMtime() {}, modified, _onDisk: 'the person\'s text', _unknownLine: { style: { display: 'none' } } };
    const save = new Function('t', 'fsErrorText', 'ATTENDED_HEADERS', 'fetch', 'setTimeout', 'showToast', 'namesText', 'stillSavingWords', `return async function save() {\n${body}\n};`)(tt, fsErr, H, (url, init) => h.write(JSON.parse(init.body).content, init.signal), (f, ms) => { timers.push([f, ms]); return 0; }, (m, o) => toasts.push([m, o && o.type]), namesText, stillSavingWords);
    return { h, ed, timers, toasts, press: () => save.call(ed), type: (more) => { doc += more; ed.modified = true; }, words: () => ed.saveIndicator.textContent };
  };
  const fire = (timers, ms) => { for (const [f, m] of timers.splice(0)) if (m === ms) f(); };
  const ceSecond = async (body) => { const w = edWorld(body); w.h.q.push('hold'); const p1 = w.press(); await tick(); const o2 = await stuck(w.press()); const during = w.words(), sent = w.h.writes.length; w.h.release(); await p1; return { o2, during, sent, writes: w.h.writes.length, overlap: w.h.overlap() }; };
  const ceRefuseTyped = async (body) => { const w = edWorld(body); w.h.q.push('hold-refuse'); const p = w.press(); await tick(); w.type(' — a word typed while it was out'); w.h.release(); await p; return { words: w.words(), modified: w.ed.modified }; };
  const ceUnnamed = async (body) => { const w = edWorld(body); w.h.q.push('unnamed'); await w.press(); return { words: w.words(), modified: w.ed.modified, toasts: w.toasts.length, standing: w.ed._unknownLine.style.display }; };
  const ceEnded = async (body) => { const w = edWorld(body); w.h.q.push('never'); const p = w.press(); await tick(); fire(w.timers, 45000); const o = await stuck(p); const words1 = w.words(), mark1 = w.ed.modified; await stuck(w.press()); return { o, words1, mark1, writes: w.h.writes.length, words2: w.words() }; };
  const ceUnknown = async (body) => { const w = edWorld(body); w.h.q.push('unknown'); const out = await w.press(); return { out, words: w.words(), modified: w.ed.modified, color: w.ed.saveIndicator.style.color, standing: w.ed._unknownLine.style.display, unknown: !!w.ed._saveUnknown }; };
  const ceLanded = async (body) => { const w = edWorld(body); await w.press(); return { words: w.words(), modified: w.ed.modified }; };
  const ceAnswer = async (body, kind) => { const w = edWorld(body); w.h.q.push(kind); await w.press(); return { words: w.words(), modified: w.ed.modified, standing: w.ed._unknownLine.style.display }; };
  const TRANSIT = ".catch((e) => { throw Object.assign(e && typeof e === 'object' ? e : new Error(String(e)), { noReply: true }); })";
  const FOREIGN = "      if (!res.ok && !(data && typeof data.error === 'string')) throw Object.assign(new Error('no reply'), { noReply: true });   // r2411 (2): a reply that is not the hub's own (a proxy's page) is no reply\n";
  const LAW1 = (saveBody || '').split('\n').find((l) => l.startsWith('    if (this._saveOut) {')) || '';
  const NAMED = '      if (!namesText(data, content)) throw Object.assign(new Error(\'no reply\'), { noReply: true });';
  const OTHER = "      if (data && data.code === 'storage_path_trying') throw new Error(t('another press on this file or its folder is still being tried'));";
  const CAPTURED = "      if (data && data.code === 'storage_path_trying' && content === this._onDisk) { this.modified = false; this.saveIndicator.textContent = t('{name} has no unsaved changes', { name }); return true; }\n";   // 929f015a5's captured-box test, planted
  const ENDLINE = 'const ctl = new AbortController(), end = setTimeout(() => ctl.abort(), 45000);';
  const UNKNOWNLINE = "      if (data && data.code === 'write_unknown') throw Object.assign(new Error('unknown'), { noReply: true });   // r2299 A1/A3: the hub could not know — said as unknown\n";
  const [c2, cRT, cUN, cEN, cEA, cLA, c2R, cRTR, cUNR, cENR, cEAR] = await Promise.all([
    saveBody ? ceSecond(saveBody) : null, saveBody ? ceRefuseTyped(saveBody) : null, saveBody ? ceUnnamed(saveBody) : null, saveBody ? ceEnded(saveBody) : null, saveBody ? ceUnknown(saveBody) : null, saveBody ? ceLanded(saveBody) : null,
    LAW1 && cut(saveBody, LAW1 + '\n', '') ? ceSecond(cut(saveBody, LAW1 + '\n', '')) : null,   // stale-pins: kept (RED: law 1's line cut)
    cut(saveBody, OTHER, CAPTURED + OTHER) ? ceRefuseTyped(cut(saveBody, OTHER, CAPTURED + OTHER)) : null,   // stale-pins: kept (RED: 929f015a5's captured-box test planted)
    cut(saveBody, NAMED + '   // r2221 item 6: «saved» names the text it saved; a body that does not is no reply', '') ? ceUnnamed(cut(saveBody, NAMED + '   // r2221 item 6: «saved» names the text it saved; a body that does not is no reply', '')) : null,   // stale-pins: kept (RED: an unnamed reply taken as saved)
    cut(saveBody, ENDLINE, 'const ctl = new AbortController(), end = 0;') ? ceEnded(cut(saveBody, ENDLINE, 'const ctl = new AbortController(), end = 0;')) : null,   // stale-pins: kept (RED: no end)
    cut(saveBody, UNKNOWNLINE, '') ? ceUnknown(cut(saveBody, UNKNOWNLINE, '')) : null,   // stale-pins: kept (RED: the hub's UNKNOWN said as «not saved»)
  ]);
  console.log('    the code editor: ' + JSON.stringify({ c2, cRT, cUN, cEN, cEA, cLA, c2R, cRTR, cUNR, cENR, cEAR }));
  ok(!!c2 && c2.o2 === false && c2.during === STILL && c2.sent === 1 && c2.writes === 1 && c2.overlap === 0 && !!c2R && c2R.overlap === 1
      && !!cRT && cRT.modified === true && cRT.words === '✕ notes.md is not saved — ' + ANOTHER && !!cRTR && cRTR.modified === false
      && !!cEA && cEA.out === false && cEA.words === NOREPLY && cEA.color === 'var(--yellow)' && cEA.modified === true && cEA.standing === '' && cEA.unknown && !!cEAR && /^✕ notes\.md is not saved — /.test(cEAR.words) && !!cLA && cLA.words === '✓ Saved' && cLA.modified === false,
    `LAWS 1–3 (the code editor, lifted): a press while its save is out sends nothing — «${c2 && c2.during}»; a refusal keeps the mark over a word typed meanwhile; the hub's UNKNOWN is said as unknown («${cEA && cEA.words}», its own colour, the mark kept) with the standing line (A3); a reply naming its text is «${cLA && cLA.words}»; REDs: law 1's line cut (two writes out); 929f015a5's captured-box test (the mark cleared over typing); the UNKNOWN line cut («not saved» over a save that may have landed)`, { c2, c2R, cRT, cRTR, cEA, cEAR, cLA });
  const [cTr, cPx, cOwn, cTrR, cPxR] = await Promise.all([saveBody ? ceAnswer(saveBody, 'rejected') : null, saveBody ? ceAnswer(saveBody, 'proxy') : null, saveBody ? ceAnswer(saveBody, 'fail') : null,
    cut(saveBody, TRANSIT, '') ? ceAnswer(cut(saveBody, TRANSIT, ''), 'rejected') : null,   // stale-pins: kept (RED: a request that died in transit said «not saved»)
    cut(saveBody, FOREIGN, '') ? ceAnswer(cut(saveBody, FOREIGN, ''), 'proxy') : null]);   // stale-pins: kept (RED: a proxy's page said «not saved — HTTP 502»)
  console.log('    the page\'s no-reply class: ' + JSON.stringify({ cTr, cPx, cOwn, cTrR, cPxR }));
  ok(!!cTr && cTr.words === NOREPLY && cTr.standing === '' && cTr.modified && !!cPx && cPx.words === NOREPLY && cPx.standing === '' && !!cOwn && cOwn.words === '✕ notes.md is not saved — EIO: i/o error' && cOwn.standing === 'none'
      && !!cTrR && cTrR.words === '✕ notes.md is not saved — Failed to fetch' && !!cPxR && cPxR.words === '✕ notes.md is not saved — HTTP 502'
      && ee.includes("signal: ctl.signal })" + TRANSIT + ";   // B-23e5") && ee.includes("if (!res.ok && !(data && typeof data.error === 'string')) throw Object.assign(new Error('no reply'), { noReply: true });   // r2411 (2): a reply that is not the hub's own is no reply")
      && rd('src/lib/doc-window-ui.js').includes("signal: ctl.signal }).catch(() => { throw Object.assign(new Error('no reply'), { name: 'AbortError' }); });   // r2411 (2): died in transit = no reply"),
    `r2411 (2), A1 at the PAGE (lifted): a save whose request died in transit («${cTr && cTr.words}») or met a page that is not the hub's own (a proxy's 502) is NO REPLY — the unknown words and the standing line, on the code editor, the pane and the document window; CONTROL: the hub's own refusal still says «${cOwn && cOwn.words}»; REDs (each line cut): «not saved — Failed to fetch», «not saved — HTTP 502»`, { cTr, cPx, cOwn, cTrR, cPxR });
  ok(!!cUN && cUN.words === NOREPLY && cUN.modified === true && cUN.toasts === 0 && cUN.standing === '' && !!cUNR && cUNR.words === '✓ Saved' && cUNR.modified === false
      && !!cEN && cEN.o === false && cEN.words1 === NOREPLY && cEN.mark1 === true && cEN.writes === 2 && cEN.words2 === '✓ Saved' && !!cENR && cENR.o === 'stuck' && cENR.writes === 1,
    `ITEM 6 + THE PAGE's LAST GUARD (lifted): a 2xx whose body names no text is no reply — «${cUN && cUN.words}», the mark kept; a request with no reply is ended at 45 s, said the same, and the next press is sent; REDs: the reply test cut (an unread body taken as «✓ Saved», the mark cleared); no end (presses dead behind it)`, { cUN, cUNR, cEN, cENR });
  // (3) LAW C — every other press a save still out answers first: the code editor's Reload, its ✕, the save-and-close doors (the standalone
  // Ctrl+G window's close), the pane's ✕ — each sends nothing and says the one sentence (stillSavingWords); typing keeps the saving word
  const RELOAD = (ce.match(/\n  async reloadFromDisk\(opts = \{\}\) \{\n([\s\S]*?)\n  \}\n/) || [])[1];
  const reloadWhileOut = async (body) => { const calls = []; const ed = { _saveOut: true, _reloading: false, editorView: {}, modified: true, filePath: '/scratch-b23e5/dead/notes.md', saveIndicator: { textContent: '', style: {} } };
    const fn = new Function('t', 'fetch', 'showConfirmDialog', 'stillSavingWords', 'fsErrorText', 'ATTENDED_HEADERS', 'EditorSelection', `return async function (opts = {}) {\n${body}\n};`)(tt, async (u) => { calls.push(u); return { json: async () => ({ content: 'x' }) }; }, async () => { calls.push('asked'); return true; }, stillSavingWords, fsErr, H, { cursor: () => ({}) });
    await fn.call(ed, {}).catch(() => {}); return { calls: calls.length, words: ed.saveIndicator.textContent }; };
  const RLAW = (RELOAD || '').split('\n').find((l) => l.startsWith('    if (this._saveOut) {')) || '';
  const GUARD = (ce.match(/this\.winInfo\.onCloseRequest = \(o\) => \{\n([\s\S]*?)\n    \}; \}/) || [])[1];
  const guardWhileOut = (body) => { const asked = []; const ed = { modified: true, _saveOut: true, filePath: '/scratch-b23e5/dead/notes.md', winInfo: { id: 'w1' }, app: { wm: { requestClose() {} } }, saveIndicator: { textContent: '', style: {} } };
    const go = new Function('t', 'showConfirmDialog', 'prevAsk', 'stillSavingWords', `return function (o) {\n${body}\n};`)(tt, (q) => { asked.push(q.message); return Promise.resolve(false); }, undefined, stillSavingWords).call(ed, {}); return { go, asked: asked.length, words: ed.saveIndicator.textContent }; };
  const GLAW = (GUARD || '').split('\n').find((l) => l.startsWith('      if (this._saveOut && !(o && o.discardAsked)) {')) || '';
  const MC = mutantCopies('safe-fs-path-memory-doors', REPO);
  const doorsWhileOut = async (D) => { let saves = 0, asked = 0, closed = 0, said = ''; const d = D.saveCloseDoors({ save: async () => { saves++; return false; }, busy: () => true, sayBusy: () => { said = STILL; }, text: () => 'x', signal() {}, close: () => { closed++; }, ready: () => true, confirmDiscard: async () => { asked++; return false; } });
    const go = d.onCloseRequest(); await tick(); await sleep(10); return { go, saves, asked, closed, said }; };
  const BUSY = (DOORS_SRC.split('\n').find((l) => l.startsWith("      if (typeof ed.busy === 'function' && ed.busy()) {")) || '') + '\n';
  // ★14: a close while a save is out WAITS on that save's answer and tells the terminal when it landed (never a second save, never silence)
  const closeWhileOut = async (D) => { let signals = 0, saves = 0; const d = D.saveCloseDoors({ save: async () => { saves++; return false; }, busy: () => true, sayBusy() {}, settled: () => Promise.resolve(true), text: () => 'x', signal: () => { signals++; }, close() {}, ready: () => true, confirmDiscard: async () => false }); await d.onClose(); return { signals, saves }; };
  const ONCLOSE = (DOORS_SRC.split('\n').find((l) => l.startsWith("      if (!closing && typeof ed.busy === 'function' && ed.busy() && typeof ed.settled === 'function')")) || '') + '\n';
  const [rlNow, rlR, gNow, gR, dNow, dR, cwNow, cwR] = await Promise.all([
    RELOAD ? reloadWhileOut(RELOAD) : null, RLAW && cut(RELOAD, RLAW + '\n', '') ? reloadWhileOut(cut(RELOAD, RLAW + '\n', '')) : null,   // stale-pins: kept (RED: the Reload not answered by the save out)
    GUARD ? guardWhileOut(GUARD) : null, GLAW && cut(GUARD, GLAW + '\n', '') ? guardWhileOut(cut(GUARD, GLAW + '\n', '')) : null,   // stale-pins: kept (RED: the ✕ answered by the mark)
    import(pathToFileURL(path.join(REPO, 'src/lib/refusal-doors.js')).href).then(doorsWhileOut),
    BUSY.trim() && DOORS_SRC.split(BUSY).length === 2 ? import(MC.write('src/lib/refusal-doors.js', anchored(DOORS_SRC, BUSY, '', 'doors-no-busy'), 'doors-no-busy', { esm: true })).then(doorsWhileOut) : null,   // stale-pins: kept (RED: the doors' busy line cut)
    import(pathToFileURL(path.join(REPO, 'src/lib/refusal-doors.js')).href).then(closeWhileOut),
    ONCLOSE.trim() && DOORS_SRC.split(ONCLOSE).length === 2 ? import(MC.write('src/lib/refusal-doors.js', anchored(DOORS_SRC, ONCLOSE, '', 'doors-close-no-wait'), 'doors-close-no-wait', { esm: true })).then(closeWhileOut) : null,   // stale-pins: kept (RED: the close does not wait — the terminal never told)
  ]);
  console.log('    law C, the code editor\'s presses: ' + JSON.stringify({ rlNow, rlR, gNow, gR, dNow, dR, cwNow, cwR }));
  ok(!!rlNow && rlNow.calls === 0 && rlNow.words === STILL && !!rlR && rlR.calls > 0
      && !!gNow && gNow.go === false && gNow.asked === 0 && gNow.words === STILL && !!gR && gR.asked === 1
      && !!dNow && dNow.go === false && dNow.saves === 0 && dNow.asked === 0 && dNow.closed === 0 && dNow.said === STILL && !!dR && dR.saves === 1
      && !!cwNow && cwNow.signals === 1 && cwNow.saves === 0 && !!cwR && cwR.signals === 0 && cwR.saves === 1
      && ce.includes("self.saveIndicator.textContent = self._saveOut ? '● ' + t('Saving…') : '● ' + t('Unsaved');"),
    `LAW C (lifted): while a save is out, the Reload, the code editor's ✕ and the save-and-close doors (the standalone Ctrl+G window's close) each send nothing, ask nothing and say «${STILL}»; typing keeps the saving word; a close while a save is out waits on it and tells the terminal when it landed (★14); REDs (each line cut): the Reload reads the file; the ✕ asks by the mark; the doors save again; the close does not wait (the terminal never told)`, { rlNow, rlR, gNow, gR, dNow, dR, cwNow, cwR });
  // (4) THE Ctrl+G PANE — its save LIFTED with its declarations; closePane, the lock and the hub stand in
  const doSaveBody = (ee.match(/\n      const doSave = async \(\) => \{\n([\s\S]*?)\n      \};\n\n      saveBtn\.onclick = doSave;/) || [])[1];
  const DECL = ee.split('\n').find((l) => l.startsWith('      let marked = false, saveOut = false, handing = false, orphaned = false;')) || '';
  const paneWorld = (body) => {
    const h = hub(), calls = [], timers = []; let doc = 'the person\'s text', locked = false, signalHook = null;
    const editorView = { state: { doc: { toString: () => doc } }, dispatch: ({ effects }) => { locked = !!(effects && effects.lock === true); } };
    const fetchStub = async (url, init) => { if (url === '/api/editor/signal') { calls.push('signal'); return (signalHook && (await signalHook(init))) || { ok: true, status: 200, json: async () => ({ success: true }) }; } return h.write(JSON.parse(init.body).content, init.signal); };
    const pathSpan = { textContent: '/scratch-b23e5/dead/notes.md', style: {} }, unknownSpan = { style: { display: 'none' } };
    const made = new Function('openClock', 'editorView', 'filePath', 'fetch', 'ATTENDED_HEADERS', 'host', 't', 'fsErrorText', 'signalPath', 'pathSpan', 'closePane', 'lockComp', 'EditorState', 'setTimeout', 'namesText', 'stillSavingWords', 'unknownSpan',
      `${DECL}\nconst doSave = async () => {\n${body}\n};\nreturn { doSave, mark: () => { marked = true; }, orphan: () => { orphaned = true; }, marked: () => marked };`)(
      () => 0, editorView, '/scratch-b23e5/dead/notes.md', fetchStub, H, '', tt, fsErr, '/scratch-b23e5/sig', pathSpan, () => calls.push('close'), { reconfigure: (x) => ({ lock: x }) }, { readOnly: { of: (v) => v } }, (f, ms) => { timers.push([f, ms]); return 0; }, namesText, stillSavingWords, unknownSpan);
    const said = () => ({ path: pathSpan.textContent, signals: calls.filter((c) => c === 'signal').length, closed: calls.includes('close'), writes: h.writes.length, overlap: h.overlap(), unsaved: made.marked(), locked, standing: unknownSpan.style.display });
    return { h, timers, made, press: made.doSave, type: (more) => { if (!locked) { doc += more; made.mark(); } }, onSignal: (f) => { signalHook = f; }, said, path: () => pathSpan.textContent };
  };
  const pT = (body) => { const w = paneWorld(body); w.type(' — typed'); return w; };
  const pAll = async (body) => { const w = pT(body); await w.press(); return w.said(); };
  const pRef = async (body) => { const w = pT(body); w.h.q.push('refuse'); await w.press(); return w.said(); };
  const pFail = async (body) => { const w = pT(body); w.h.q.push('fail'); await w.press(); return w.said(); };
  const pDuring = async (body) => { const w = pT(body); w.h.q.push('hold'); const p = w.press(); await tick(); w.type(' — and more'); w.h.release(); await p; return w.said(); };
  const pTold = async (body, hook) => { const w = pT(body); w.onSignal(hook); const p = w.press(); await tick(); fire(w.timers, 45000); await stuck(p); return w.said(); };
  const pSecond = async (body) => { const w = pT(body); w.h.q.push('hold'); const p1 = w.press(); await tick(); await w.press(); const during = w.said(); w.h.release(); await p1; return { during, after: w.said() }; };
  const pHand = async (body) => { const w = pT(body); let at = '', box = ''; w.onSignal(async () => { await w.press(); at = w.path(); w.type(' — typed while the terminal was told'); box = String(w.said().unsaved); return null; }); await w.press(); return { at, typedTook: box, ...w.said() }; };
  const pUnnamed = async (body) => { const w = pT(body); w.h.q.push('unnamed'); await w.press(); return w.said(); };
  const pOrphan = async (body) => { const w = pT(body); w.made.orphan(); await w.press(); return w.said(); };
  const NOTSAVED = "          if (!res.ok || data.error) throw new Error(data.error ? fsErrorText(data) : `HTTP ${res.status}`);   // B-3b03 follow-up: a refusal in the reader's language\n";
  const PNAMED = (doSaveBody || '').split('\n').find((l) => l.startsWith('          if (!namesText(data, newContent)) throw')) || '';
  const KEEP = (doSaveBody || '').split('\n').find((l) => l.startsWith('          if (editorView.state.doc.toString() !== newContent) {')) || '';
  const SIGOK = (doSaveBody || '').split('\n').find((l) => l.startsWith('          if (!sig.ok) {')) || '';
  const POUT = (doSaveBody || '').split('\n').find((l) => l.startsWith('        if (saveOut) {')) || '';
  const LOCK = 'handing = true; editorView.dispatch({ effects: lockComp.reconfigure(EditorState.readOnly.of(true)) });';
  const ORPH = '          if (orphaned) { closePane(at); return; }';
  const pc = (a, b) => cut(doSaveBody, a, b);
  const json400 = async () => ({ ok: false, status: 400, json: async () => ({ error: 'EACCES: permission denied' }) });
  const json504 = async () => ({ ok: false, status: 504, json: async () => ({ error: 'not told yet — it may still arrive', code: 'telling_out' }) });
  const neverTold = (init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
  const [pa, pr, pf, pd, p400, p504, pNo, p2, ph, pu, po, prR, pdR, p400R, p2R, phR, phLockR, poR] = await Promise.all([
    doSaveBody ? pAll(doSaveBody) : null, doSaveBody ? pRef(doSaveBody) : null, doSaveBody ? pFail(doSaveBody) : null, doSaveBody ? pDuring(doSaveBody) : null, doSaveBody ? pTold(doSaveBody, json400) : null, doSaveBody ? pTold(doSaveBody, json504) : null, doSaveBody ? pTold(doSaveBody, neverTold) : null,
    doSaveBody ? pSecond(doSaveBody) : null, doSaveBody ? pHand(doSaveBody) : null, doSaveBody ? pUnnamed(doSaveBody) : null, doSaveBody ? pOrphan(doSaveBody) : null,
    PNAMED && cut(pc(NOTSAVED, ''), PNAMED + '\n', '') ? pFail(cut(pc(NOTSAVED, ''), PNAMED + '\n', '')) : null,   // stale-pins: kept (RED: the release's road — the not-saved and named-reply checks cut: a failed write closes the pane)
    KEEP && pc(KEEP + '\n', '') ? pDuring(pc(KEEP + '\n', '')) : null,   // stale-pins: kept (RED: line 262's close over later text)
    SIGOK && pc(SIGOK + '\n', '') ? pTold(pc(SIGOK + '\n', ''), json400) : null,   // stale-pins: kept (RED: the hub's refusal unread)
    POUT && pc(POUT + '\n', '') ? pSecond(pc(POUT + '\n', '')) : null,   // stale-pins: kept (RED: law 1's line cut)
    pc('if (saveOut) { if (!handing) say(', 'if (saveOut) { if (true) say(') ? pHand(pc('if (saveOut) { if (!handing) say(', 'if (saveOut) { if (true) say(')) : null,   // stale-pins: kept (RED: «still saving…» over the hand-back)
    pc(LOCK, 'handing = true;') ? pHand(pc(LOCK, 'handing = true;')) : null,   // stale-pins: kept (RED: the lock cut)
    pc(ORPH + '   // r2221 LAW B: its terminal took the text already — «Save again» saved the rest; nobody to tell', '') ? pOrphan(pc(ORPH + '   // r2221 LAW B: its terminal took the text already — «Save again» saved the rest; nobody to tell', '')) : null,   // stale-pins: kept (RED: «Save again» tells the terminal again)
  ]);
  console.log('    the Ctrl+G pane: ' + JSON.stringify({ pa, pr, pf, pd, p400, p504, pNo, p2, ph, pu, po, prR, pdR, p400R, p2R, phR, phLockR, poR }));
  ok(!!DECL && !!pa && pa.closed && pa.signals === 1 && pa.unsaved === false
      && !!pr && !pr.closed && pr.unsaved && pr.path === 'notes.md is not saved — ' + ANOTHER + STILL_HERE && !!pf && !pf.closed && pf.unsaved && pf.path === 'notes.md is not saved — EIO: i/o error' + STILL_HERE && !!pd && !pd.closed && !pd.signals && pd.unsaved && pd.path === '● ' + TYPED_ON
      && !!p400 && !p400.closed && p400.path === 'notes.md is saved, but the terminal was not told — EACCES: permission denied' && !p400.locked
      && !!p504 && !p504.closed && p504.path === 'notes.md is saved — the terminal is not told yet; it may still arrive' && !!pNo && !pNo.closed && pNo.path === 'notes.md is saved — the terminal is not told yet; it may still arrive'
      && !!prR && prR.closed && !!pdR && pdR.closed && !!p400R && p400R.closed,
    `LAW 5 (the pane, lifted): it closes ONLY when all three hold (saved, the box = what was saved, the terminal told with a good reply); EACH ALONE FAILING keeps it — refused («${pr && pr.path.slice(0, 40)}…»), failed («${pf && pf.path.slice(0, 40)}…»), typed during the save, the telling refused / still in flight at the hub's bound («${p504 && p504.path}») / with no reply; REDs: the release's road (a failed write closes); line 262's close over later text; the hub's refusal unread`, { pa, pr, pf, pd, p400, p504, pNo, prR, pdR, p400R });
  ok(!!p2 && p2.during.path === STILL && p2.during.writes === 1 && p2.after.writes === 1 && p2.after.closed && !!p2R && p2R.after.overlap === 1
      && !!ph && ph.at === '✓ notes.md is saved — handing it back to the terminal…' && ph.closed && ph.typedTook === 'false' && !!phR && phR.at === STILL && !!phLockR && phLockR.typedTook === 'true'
      && !!pu && !pu.closed && pu.unsaved && pu.path === NOREPLY && pu.standing === '' && !!po && po.closed && po.signals === 0 && !!poR && poR.signals === 1,
    `LAWS 1, 5, B (the pane): a press while its save is out says «${p2 && p2.during.path}» and sends nothing; the hand-back keeps its words and takes no key; an unnamed reply is no reply («${pu && pu.path}»); after law B's orphaning «Save again» saves and closes WITHOUT telling the terminal again; REDs: law 1's line cut; «still saving…» over the hand-back; the lock cut; «Save again» tells the terminal again`, { p2, p2R, ph, phR, phLockR, pu, po, poR });
  // LAW B — an editor-close that arrives (late, another device's, the terminal's own) never removes a pane holding typing: it stays, says so,
  // offers «Save again» and «Discard»; LAW C — the terminal window's ✕ while its pane's save is out: nothing asked, the one sentence
  const cee = (ee.match(/\nexport function closeExternalEditor\(app, signalPath\) \{\n([\s\S]*?)\n\}\n/) || [])[1];
  const closeArrives = (body, unsaved) => { const removed = [], orphaned = []; const pane = { dataset: { signal: 'sig-A' }, remove() { removed.push('A'); }, _vsUnsaved: () => unsaved, _vsOrphan: () => orphaned.push('A') };
    const win = { _editorState: null, content: { style: {}, querySelectorAll: (q) => (q === '.editor-container' ? (removed.length ? [] : [pane]) : []), querySelector: () => null } };
    new Function('app', 'signalPath', body)({ wm: { windows: new Map([['w1', win]]) }, sessions: new Map() }, 'sig-A'); return { removed: removed.length, orphaned: orphaned.length }; };
  const BLINE = (cee || '').split('\n').find((l) => l.startsWith("    if (typeof editorPane._vsUnsaved === 'function' && editorPane._vsUnsaved()) {")) || '';
  const ORPHB = (ee.match(/\n      editorPane\._vsOrphan = \(\) => \{\n([\s\S]*?)\n      \};\n/) || [])[1];
  const orphanSays = (body) => { let locked = true, veil = 'on'; const pathSpan = { textContent: '', style: {} }, saveBtn = { textContent: 'Save & Close' }, discardBtn = { style: { display: 'none' } };
    const win = { _editorState: { signalPath: '/scratch-b23e5/sig' }, _editorDoSave: () => {}, _editorTermVeil: { remove: () => { veil = 'gone'; } } };
    new Function('t', 'editorView', 'lockComp', 'pathSpan', 'saveBtn', 'discardBtn', 'targetWinInfo', 'signalPath', `let orphaned = false, handing = true;\n${body}\nreturn orphaned;`)(tt, { dispatch: ({ effects }) => { locked = effects.lock === true; } }, { reconfigure: (x) => ({ lock: x }) }, pathSpan, saveBtn, discardBtn, win, '/scratch-b23e5/sig');
    return { words: pathSpan.textContent, btn: saveBtn.textContent, discard: discardBtn.style.display, locked, state: win._editorState, binding: win._editorDoSave, veil }; };
  const RELEASE4 = (ORPHB || '').split('\n').find((l) => l.startsWith('        if (targetWinInfo._editorState && targetWinInfo._editorState.signalPath === signalPath) {')) || '';
  // ★5 / ★11: «Discard» and the window's ✕ answered by a save out — the hand-back keeps its own words (lifted lines)
  const SBP = ee.split('\n').find((l) => l.startsWith('      const sayBusyPane = () => {')) || '';
  const DISC = ee.split('\n').find((l) => l.startsWith('      discardBtn.onclick = () => {')) || '';
  const paneSmall = (sbp, disc, { saveOut, handing }) => { const pathSpan = { textContent: '✓ notes.md is saved — handing it back to the terminal…', style: {} }, discardBtn = {}; let closed = 0;
    new Function('filePath', 'pathSpan', 'stillSavingWords', 'discardBtn', 'closePane', 'openClock', 'saveOut', 'handing', `${sbp}\n${disc}`)('/scratch-b23e5/dead/notes.md', pathSpan, stillSavingWords, discardBtn, () => { closed++; }, () => 0, saveOut, handing);
    discardBtn.onclick(); return { path: pathSpan.textContent, closed }; };
  const inst = (ee.match(/\n(      const panes = targetWinInfo\._editorPanes[\s\S]*?\n      \}\n)/) || [])[1];
  const paneXWhileOut = (block) => { const asked = [], win = { id: 'w1' }; let said = 0;
    new Function('targetWinInfo', 'editorView', 'marked', 'filePath', 'showConfirmDialog', 't', 'app', 'saveOut', 'pathSpan', 'stillSavingWords', 'sayBusyPane', block)(win, { dom: { isConnected: true }, state: { doc: { toString: () => 'x' } } }, true, '/scratch-b23e5/dead/notes.md', (q) => { asked.push(q.message); return Promise.resolve(false); }, tt, { wm: { requestClose() {} } }, true, { style: {} }, stillSavingWords, () => { said++; });
    const go = win.onCloseRequest({}); return { go, asked: asked.length, said }; };
  const XLINE = (inst || '').split('\n').find((l) => l.startsWith('          const b = busyPane(); if (b) {')) || '';
  const bNow = cee ? closeArrives(cee, true) : null, bClean = cee ? closeArrives(cee, false) : null, bR = BLINE && cut(cee, BLINE + '\n', '') ? closeArrives(cut(cee, BLINE + '\n', ''), true) : null;   // stale-pins: kept (RED: the law B line cut)
  const oNow = ORPHB ? orphanSays(ORPHB) : null;
  const oR = RELEASE4 ? orphanSays(ORPHB.replace(RELEASE4 + '\n', '')) : null;   // stale-pins: kept (RED: the orphan left as the terminal's editor)
  const dOut = SBP && DISC ? paneSmall(SBP, DISC, { saveOut: true, handing: false }) : null, dHand = SBP && DISC ? paneSmall(SBP, DISC, { saveOut: true, handing: true }) : null, dIdle = SBP && DISC ? paneSmall(SBP, DISC, { saveOut: false, handing: false }) : null;
  const discR = SBP && DISC ? paneSmall(SBP, "      discardBtn.onclick = () => closePane(openClock());", { saveOut: true, handing: false }) : null;   // stale-pins: kept (RED: 767bde791's Discard)
  const hR = SBP && DISC ? paneSmall(SBP.replace('if (handing) return; ', ''), DISC, { saveOut: true, handing: true }) : null;   // stale-pins: kept (RED: the hand-back's words overwritten)
  const xNow = inst ? paneXWhileOut(inst) : null, xR = XLINE && cut(inst, XLINE + '\n', '') ? paneXWhileOut(cut(inst, XLINE + '\n', '')) : null;   // stale-pins: kept (RED: the pane's ✕ asked by the mark)
  console.log('    law B / the pane\'s ✕: ' + JSON.stringify({ bNow, bClean, bR, oNow, oR, xNow, xR, dOut, dHand, dIdle, discR, hR }));
  ok(!!bNow && bNow.removed === 0 && bNow.orphaned === 1 && !!bClean && bClean.removed === 1 && !!bR && bR.removed === 1
      && !!oNow && oNow.words === 'the terminal took the saved text — what you typed after is only here' && oNow.btn === 'Save again' && oNow.discard === '' && oNow.locked === false && oNow.state === null && oNow.binding === null && oNow.veil === 'gone' && !!oR && oR.state !== null
      && !!xNow && xNow.go === false && xNow.asked === 0 && xNow.said === 1 && !!xR && xR.asked === 1
      && !!dOut && dOut.closed === 0 && dOut.path === STILL && !!dHand && dHand.closed === 0 && dHand.path === '✓ notes.md is saved — handing it back to the terminal…' && !!dIdle && dIdle.closed === 1 && !!discR && discR.closed === 1 && !!hR && hR.path === STILL,
    `LAW B (lifted): an editor-close that arrives over a pane holding typing leaves it — «${oNow && oNow.words}», «${oNow && oNow.btn}» and «Discard» offered, the box open; a pane with nothing unsaved closes; LAW C: the terminal window's ✕ while its pane's save is out asks nothing and says «${STILL}»; and it is no longer the terminal's editor (★4: its window state, Ctrl+G binding and veil released); «Discard» and the ✕ while a save is out say «${STILL}» (★5) and the hand-back keeps its words (★11); REDs: the law B line cut (the typing removed unasked); the orphan left as the terminal's editor; the ✕ asked by the mark; 767bde791's Discard (closes under a save out); the hand-back's words overwritten`, { bNow, bClean, bR, oNow, oR, xNow, xR, dOut, dHand, dIdle, discR, hR });
  // (5) THE TYPED LOAD (r2221 ★7): only the read's own «not there» (typed by the hub) opens an empty pane; every other failure, the door
  const HEAD = (ee.match(/\n    \.then\(data => \{\n((?:      \/\/[^\n]*\n)*      if \(data && data\.error && [^\n]*\n      const content = data\.content \|\| '';\n)/) || [])[1];
  const CATCH = (ee.match(/\n    \.catch\(\(err\) => \{\n([\s\S]*?)\n    \}\);\n\}/) || [])[1];
  const loadRoad = async (head, answer) => { const urls = [], pathSpan = { textContent: '', style: {} }, saveBtn = { textContent: 'Save & Close', style: {}, onclick: null };
    const run = new Function('fetch', 'fsErrorText', 'pathSpan', 'saveBtn', 'openClock', 'signalPath', 'filePath', 'host', 'targetWinInfo', 'editorPane', 'contentEl', 'splitResizer', 'termContainer', 'termSession', 'lateFocus', 'setTimeout', 't', 'answer',
      `return Promise.resolve(answer).then(data => {\n${head}\nreturn 'a pane over «' + content + '»';\n}).catch((err) => {\n${CATCH}\nreturn 'the door';\n});`)(
      async (u) => { urls.push(u); return { ok: true }; }, (d) => d.error, pathSpan, saveBtn, () => 0, '/scratch-b23e5/sig', '/scratch-b23e5/dead/prompt.md', '', {}, { remove() {} }, { querySelectorAll: () => [], style: {} }, { destroy() {} }, { style: {} }, null, () => {}, () => {}, tt, answer);
    const road = await run; if (saveBtn.onclick) await saveBtn.onclick(); return { road, words: pathSpan.textContent, btn: saveBtn.textContent, urls }; };
  const IFLINE = (HEAD || '').split('\n').find((l) => l.startsWith('      if (data && data.error && ')) || '';
  const REGEX_HEAD = "      if (data && data.error && !/ENOENT|no such file/i.test(String(data.error))) throw new Error(fsErrorText(data));";   // stale-pins: kept (1f5173b72's head, planted in a RED)
  const NOTYET = { error: 'ENOENT: no such file or directory', code: 'file_not_there' }, ENOENT_WORDS = { error: 'spawn ssh ENOENT' }, SAID = { error: 'this folder or file did not answer in time — try again in 30 s', code: 'storage_path_hung' };
  const [ldNew, ldWords, ldSaid, ldOk, ldR] = await Promise.all([HEAD ? loadRoad(HEAD, NOTYET) : null, HEAD && CATCH ? loadRoad(HEAD, ENOENT_WORDS) : null, HEAD && CATCH ? loadRoad(HEAD, SAID) : null, HEAD ? loadRoad(HEAD, { content: 'the CLI\'s text' }) : null,
    HEAD && CATCH && IFLINE ? loadRoad(HEAD.replace(IFLINE, REGEX_HEAD), ENOENT_WORDS) : null]);   // stale-pins: kept (RED: 1f5173b72's words test)
  console.log('    the pane\'s load: ' + JSON.stringify({ ldNew, ldWords, ldSaid, ldOk, ldR }));
  ok(!!ldNew && ldNew.road === 'a pane over «»' && !!ldWords && ldWords.road === 'the door' && ldWords.urls.join() === '/api/editor/signal' && !!ldSaid && ldSaid.road === 'the door' && ldSaid.btn === 'Close editor' && !!ldOk && ldOk.road === 'a pane over «the CLI\'s text»'
      && !!ldR && ldR.road === 'a pane over «»'
      && fr.includes("...(err && err.code === 'ENOENT' ? { code: 'file_not_there' } : {})") && rd('src/remote-fs.js').includes("if (gone) throw Object.assign(new Error(`${filePath}: no such file yet`), { code: 'file_not_there' });"),
    `THE TYPED LOAD (r2221 ★7, lifted): the read's own «not there» opens an empty pane to create the file; any other failure — words that only mention ENOENT («spawn ssh ENOENT»), a storage's refusal — takes the door, which writes nothing; RED (1f5173b72's words test): «spawn ssh ENOENT» opens an empty pane over a file that may be there`, { ldNew, ldWords, ldSaid, ldOk, ldR });
  // (6) THE VIEWERS' ⟳ RELOAD, LIFTED: refused by the storage it says its words (typed error) and leaves the view as it was
  const RL = (fv.match(/\n    btnReload\.onclick = async \(\) => \{\n([\s\S]*?)\n    \};\n/) || [])[1];
  const reload = async (body, status) => {
    const toasts = [], renders = [], container = { innerHTML: 'the view as it was' };
    const fn = new Function('fetch', 'filePath', 'host', 'ATTENDED_HEADERS', 'showToast', 't', 'fileName', 'fsErrorText', 'container', 'FileViewer', 'btnDownload', 'winInfo', 'app', `return async () => {\n${body}\n};`)(
      async () => ({ status, json: async () => (status === 503 ? { error: 'this folder or file did not answer in time — try again in 30 s', code: 'storage_path_hung' } : { size: 3 }) }), '/scratch-b23e5/dead/a.png', '', H,
      (m, o) => toasts.push([m, o && o.type]), tt, 'a.png', (d) => d.error, container, { renderInto: async () => { renders.push(1); return true; }, _seatDownload() {} }, {}, { content: {} }, {});
    await fn(); const [toast = '', type] = toasts[0] || [];
    return { toast, type, view: container.innerHTML, renders: renders.length };
  };
  const RET = "{ type: 'error' }); return; }";
  const [rlNo, rlOk, rlRed] = await Promise.all([RL ? reload(RL, 503) : null, RL ? reload(RL, 200) : null, RL && RL.split(RET).length === 2 ? reload(RL.replace(RET, "{ type: 'error' }); }"), 503) : null]);   // stale-pins: kept (RED: the return cut)
  console.log('    the viewers\' Reload: ' + JSON.stringify({ rlNo, rlOk, rlRed }));
  ok(!!rlNo && rlNo.toast === 'a.png was not reloaded — this folder or file did not answer in time — try again in 30 s; the view shows it as before' && rlNo.type === 'error' && rlNo.view === 'the view as it was' && rlNo.renders === 0
      && !!rlOk && rlOk.renders === 1 && !!rlRed && rlRed.renders === 1 && rlRed.view === '',
    `THE VIEWERS' REFUSED ⟳ RELOAD (lifted): «${rlNo && rlNo.toast}» (typed ${rlNo && rlNo.type}) and the view stays as it was; answered, it re-renders; RED (the return cut): the view is emptied under the refusal`, { rlNo, rlOk, rlRed });
}

console.log('② the cost of one parked thread, measured (printed, never asserted)');
{
  const status = () => { try { return fs.readFileSync('/proc/self/status', 'utf8'); } catch { return ''; } };
  const field = (k) => { const m = new RegExp('^' + k + ':\\s+(\\d+)', 'm').exec(status()); return m ? Number(m[1]) : null; };
  global.gc?.();
  const rss0 = process.memoryUsage().rss, th0 = field('Threads');
  const N = 8;
  const pool = new SF.SafeFs({ poolSize: N, name: 'path-memory-cost', timeouts: { default: 15000 } });
  try {
    await Promise.all(Array.from({ length: N }, () => pool.call('__sleep', { ms: 1 })));
    await untilLive(pool, N);
    const rss1 = process.memoryUsage().rss, th1 = field('Threads');
    let pidsMax = null; try { pidsMax = fs.readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(); } catch { }
    console.log(`  [measure] one worker holds ≈ ${((rss1 - rss0) / N / 1048576).toFixed(1)} MiB of RSS and ${th1 != null && th0 != null ? ((th1 - th0) / N).toFixed(1) : '?'} OS thread(s) (${N} workers: RSS ${(rss0 / 1048576).toFixed(0)} → ${(rss1 / 1048576).toFixed(0)} MiB, threads ${th0} → ${th1}); this cgroup's pids.max: ${pidsMax || 'unread'} (Node ${process.versions.node})`);
    ok(true, 'the cost is printed (a measure, never a bound)');
  } finally { pool.close(); }
}

// r4293: no HELD call of the suite ran out its bound (a held call is let go, ended by its deadline, or ended with its worker)
{ const ran = HELD_ALL.flatMap((h) => h.expired()); ok(ran.length === 0, `no held call or held boot ran out its bound (${HOLD_BOUND_MS / 1000} s): each was let go or ended by its deadline or its worker's end${ran.length ? ' — RAN OUT: ' + ran.join(', ') : ''}`, ran); }
report();
