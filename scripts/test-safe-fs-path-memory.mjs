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
//   ② THE COST, measured and printed (never asserted): the memory and the threads one more worker holds, and the container's
//      process limit where parked threads end.
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
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

/** Wait for every worker of the pool to be live again (a respawn after an end), bounded and said by name at the bound. */
async function untilLive(pool, n, boundMs = 10000) {
  const t0 = Date.now();
  while (pool.stats().alive < n) { if (Date.now() - t0 > boundMs) throw new Error(`the pool never had ${n} live workers again within ${boundMs} ms`); await sleep(20); }
}

/** The scene over a SafeFs module: K asks of the dead path, each after the pool is whole again → the ends, the answers, a path beside it. */
async function scene(Mod, tag, k = K) {
  const pool = new Mod.SafeFs({ poolSize: 2, name: `path-memory-${tag}`, timeouts: { default: 15000, __sleep: 300 }, hungMs: 3000, mountsText });
  const answers = [];
  try {
    for (let i = 0; i < k; i++) {
      await untilLive(pool, 2);
      answers.push(await pool.call('__sleep', { path: `${DEAD}/file-${i}`, ms: 4000 }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code))));
    }
    return { ends: pool.stats().timeouts, answers };
  } finally { pool.close(); }
}

console.log('① asked K times, a dead path ends ONE worker; the rest are refused by name without a worker');
{
  let shift = 0; const clock = () => performance.now() + shift;   // r275 should 3: the memory's own clock, advanced by the leg (never a real 3 s wait)
  const pool = new SF.SafeFs({ poolSize: 2, name: 'path-memory', timeouts: { default: 15000, __sleep: 300 }, hungMs: 3000, mountsText, clock });
  const answers = [];
  try {
    for (let i = 0; i < K; i++) {
      await untilLive(pool, 2);
      answers.push(await pool.call('__sleep', { path: `${DEAD}/file-${i}`, ms: 4000 }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code))));
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
    const again = await pool.call('__sleep', { path: `${DEAD}/file-again`, ms: 4000 }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code)));
    ok(again === 'deadline' && pool.stats().timeouts === ends + 1, `after its bound the dead path is asked again (${again}; ends ${pool.stats().timeouts})`, { again });
  } finally { pool.close(); }
  // THE SAME dead path asked K times: ONE end
  const same = new SF.SafeFs({ poolSize: 2, name: 'path-memory-same', timeouts: { default: 15000, __sleep: 300 }, hungMs: 3000, mountsText });
  try {
    const got = [];
    for (let i = 0; i < K; i++) { await untilLive(same, 2); got.push(await same.call('__sleep', { path: `${DEAD}/one-file`, ms: 4000 }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.code)))); }
    ok(same.stats().timeouts === 1 && got.slice(1).every((a) => a === 'path-hung'), `ONE DEAD THING, ONE CALL: the same dead path asked ${K} times ended ${same.stats().timeouts} worker (${got.join(', ')})`, got);
  } finally { same.close(); }
  // RED CONTROL: the release's pool (a deadline end remembers nothing) — every ask of the dead path ends a fresh worker
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const NOTE = '    if (running) this._noteHung(running.payload, running.op, running !== call ? Math.max(call.timeoutMs || 0, monoNow() - (running.sentAt || monoNow())) : Math.min(running.timeoutMs || Infinity, monoNow() - (running.sentAt || monoNow())), { early: running !== call });   // the time since it was sent without an answer; ended EARLY by a queued call ⇒ only that long\n';
  const Rel = src.split(NOTE).length === 2 ? mutantCopies('safe-fs-path-memory', REPO).load('src/safe-fs.js', anchored(src, NOTE, '', 'release-no-memory'), 'release-no-memory') : null;
  const RK = 3;   // the release's road needs no more asks to show itself
  const red = Rel ? await scene(Rel, 'release', RK) : null;
  console.log(`  [measure] the release: ${red && red.ends} worker ends for ${RK} asks (${red && red.answers.join(', ')})`);
  ok(!!red && red.ends === RK && red.answers.every((a) => a === 'deadline'), `RED CONTROL (the release's pool): every ask of the dead path ends a fresh worker (${red && red.ends} of ${RK})`, red);
}

console.log('①b the memory\'s shape: what it refuses, and what it never does');
{
  const os = require('node:os');
  const pool = new SF.SafeFs({ poolSize: 1, name: 'path-memory-shape', hungMs: 60000, mountsText });
  try {
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
{
  const run = async (Mod, probeMs = null) => {
    const pool = new Mod.SafeFs({ poolSize: 1, name: 'path-memory-queue', timeouts: { default: 15000 }, hungMs: 60000 });
    try {
      const A = pool.call('__sleep', { path: '/scratch-b23e5/q/dead', ms: 4000 }, { timeoutMs: 5000 }).catch(() => {});   // the hung one, long deadline
      const B = pool.call('__sleep', { path: '/scratch-b23e5/q/healthy/f', ms: 1 }, { timeoutMs: 300 }).catch(() => {});   // queued behind it in the same worker
      await Promise.all([A, B]);
      const m = pool._hung.get('/scratch-b23e5/q/dead'), bound = m ? m.under : null, probe = probeMs || (Number.isFinite(bound) ? Math.ceil(bound) + 50 : 400);
      // (its delta read S1) ended EARLY by the queued call's deadline, it refuses only callers that wait no longer than it ran — a caller
      // 50 ms more patient than that is asked again (the 1.5× slack is for an op that ran out its OWN deadline)
      // asked by a caller no more patient than the queued call (200 ms ≤ its 300 ms deadline; the early bound is the ~300 ms it ran)
      return { dead: !!pool._hungOf({ path: '/scratch-b23e5/q/dead' }, '__sleep', 200), healthy: !!pool._hungOf({ path: '/scratch-b23e5/q/healthy/f' }, '__sleep', 200), bound, probe, patientRefused: !!pool._hungOf({ path: '/scratch-b23e5/q/dead' }, '__sleep', probe) };
    } finally { pool.close(); }
  };
  const now = await run(SF);
  ok(now.dead && !now.healthy && !now.patientRefused, `the queued call's deadline ended the worker; the RUNNING call's path is remembered (${now.dead}), the queued one's is not (${now.healthy}); ended early after ${now.bound && Math.round(now.bound)} ms, a ${now.probe} ms caller is asked again (${!now.patientRefused})`, now);
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const RUN = '    if (running) this._noteHung(running.payload, running.op, running !== call ? Math.max(call.timeoutMs || 0, monoNow() - (running.sentAt || monoNow())) : Math.min(running.timeoutMs || Infinity, monoNow() - (running.sentAt || monoNow())), { early: running !== call });   // the time since it was sent without an answer; ended EARLY by a queued call ⇒ only that long\n';
  const Q = src.split(RUN).length === 2 ? mutantCopies('safe-fs-path-memory-q', REPO).load('src/safe-fs.js', anchored(src, RUN, '    this._noteHung(call.payload, call.op, call.timeoutMs);\n', 'blame-the-queued'), 'blame-the-queued') : null;
  const red = Q ? await run(Q) : null;
  ok(!!red && red.healthy && !red.dead, `RED CONTROL (the timed-out call blamed): the healthy queued path is remembered and the dead one is not (${JSON.stringify(red)})`, red);
  const EARLY = ', { early: running !== call });';
  const E = src.split(EARLY).length === 2 ? mutantCopies('safe-fs-path-memory-e', REPO).load('src/safe-fs.js', anchored(src, EARLY, ', { early: false });', 'early-as-full'), 'early-as-full') : null;
  const redE = E ? await run(E, now.probe) : null;
  ok(!!redE && redE.dead && redE.patientRefused, `RED CONTROL (an early end taken as a full deadline, 1.5×): the ${now.probe} ms caller of a path that ran only ${now.bound && Math.round(now.bound)} ms is refused (${JSON.stringify(redE)})`, redE);
}

console.log('①g 主开发\'s r275: a person\'s own press is tried; a path that replies is forgiven; a repeat end doubles its time');
{
  const run = async (Mod) => {
    let shift = 0; const clock = () => performance.now() + shift;
    const pool = new Mod.SafeFs({ poolSize: 1, name: 'path-memory-press', timeouts: { default: 15000, __sleep: 300 }, hungMs: 30000, mountsText, clock });
    const out = {};
    try {
      await untilLive(pool, 1);
      const word = (p) => p.then(() => 'answered', (e) => (e && e.code === 'path-hung' ? (e.tried ? 'path-hung, tried' : 'path-hung') : e && e.safeFsTimeout ? 'deadline' : String(e && e.code)));
      // THE PRESS AFTER A RECOVERY: a path remembered dead, then mended — the person's press is asked at once, answers, and is forgiven
      await pool._noteHung({ path: '/scratch-b23e5/mended/x' }, 'stat', 15000);
      out.unmarked0 = await word(pool.call('__sleep', { path: '/scratch-b23e5/mended/x', ms: 1 }));
      out.press = await word(pool.call('__sleep', { path: '/scratch-b23e5/mended/x', ms: 1 }, { attended: true }));
      out.after = await word(pool.call('__sleep', { path: '/scratch-b23e5/mended/x', ms: 1 }));
      // THE PRESS ON A STILL-DEAD PATH: tried once — it ends ONE worker, the memory is renewed, and its words say so
      await pool._noteHung({ path: '/scratch-b23e5/still/x' }, 'stat', 15000);
      const ends0 = pool.stats().timeouts, until0 = (pool._hung.get('/scratch-b23e5/still/x') || {}).until;
      out.deadPress = await word(pool.call('__sleep', { path: '/scratch-b23e5/still/x', ms: 4000 }, { attended: true }));
      out.deadEnds = pool.stats().timeouts - ends0;
      out.renewed = ((pool._hung.get('/scratch-b23e5/still/x') || {}).until || 0) > (until0 || 0);
      await untilLive(pool, 1);
      out.unmarked = await word(pool.call('__sleep', { path: '/scratch-b23e5/still/x', ms: 4000 }));
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
  const now = await run(SF);
  console.log(`  [measure] ${JSON.stringify(now)}`);
  ok(now.unmarked0 === 'path-hung' && now.press === 'answered' && now.after === 'answered', `the press after a recovery: an unmarked call is refused (${now.unmarked0}); the person's press is asked at once (${now.press}); answered, the path is forgiven — the next unmarked call is asked too (${now.after})`, now);
  ok(now.deadPress === 'path-hung, tried' && now.deadEnds === 1 && now.renewed && now.unmarked === 'path-hung' && now.unmarkedEnds === 1, `the press on a still-dead path is tried once — ONE worker ends (${now.deadEnds}), the memory renewed (${now.renewed}), its words the memory's own (${now.deadPress}); an unmarked caller after it is refused, no worker (${now.unmarked})`, now);
  ok(now.otherOp === 'answered' && now.under === 'answered' && now.listingKept && now.listingPress !== 'path-hung' && now.listingForgiven,
    `r316 MUST 1: a listing's entry survives the folder's own other op (${now.otherOp}) and a reply under it (${now.under}) — still refused (${now.listingKept}); a listing that replies at that path forgives it (${now.listingPress} ⇒ ${now.listingForgiven})`, now);
  ok(now.joined.sent === 1 && now.joined.pa === 'answered' && now.joined.pb === 'answered', `two presses of the same thing at once are ONE call in flight (${now.joined.sent} sent; both ${now.joined.pa})`, now.joined);
  ok(JSON.stringify(now.spans) === JSON.stringify([30000, 60000, 120000, 240000, 480000, 480000]), `a path that ends a worker again is kept twice as long each time, at most 16 × (${now.spans.map((x) => x / 1000 + ' s').join(', ')})`, now.spans);
  // RED CONTROLS, each over the copy without its rule
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const ATT = '    const hp = opts.attended ? null : this._hungOf(payload, op, timeoutMs);\n', FGV = '    this._forgive(call.payload, call.op);   // r275 / r316: the path answered — what its entry\'s kind lets this reply clear leaves\n';
  const noAtt = src.split(ATT).length === 2 ? mutantCopies('safe-fs-path-memory-att', REPO).load('src/safe-fs.js', anchored(src, ATT, '    const hp = this._hungOf(payload, op, timeoutMs);\n', 'press-refused'), 'press-refused') : null;
  const noFgv = src.split(FGV).length === 2 ? mutantCopies('safe-fs-path-memory-fgv', REPO).load('src/safe-fs.js', anchored(src, FGV, '', 'never-forgiven'), 'never-forgiven') : null;
  const WIDE_FGV = "        if (p === h && m.self) for (const sk of Object.keys(m.self)) if (sk === key || (wide && WIDE_OPS.has(sk))) { delete m.self[sk]; changed = true; }\n";
  const tooWide = src.split(WIDE_FGV).length === 2 ? mutantCopies('safe-fs-path-memory-wide', REPO).load('src/safe-fs.js', anchored(src, WIDE_FGV, "        if (p === h || p.startsWith(h.endsWith('/') ? h : h + '/')) { this._hung.delete(h); continue; }\n", 'forgiven-too-wide'), 'forgiven-too-wide') : null;   // stale-pins: kept (r275's wide rule, the RED's copy)
  const r1 = noAtt ? await run(noAtt) : null, r2 = noFgv ? await run(noFgv) : null, r3 = tooWide ? await run(tooWide) : null;
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
    const base = `http://127.0.0.1:${srv.address().port}/api/file/info?path=${encodeURIComponent('/scratch-b23e5/route-dead/a.txt')}`;
    const rp = await fetch(base, { headers: { 'X-VibeSpace-Attended': '1' } }); const jp = await rp.json().catch(() => null);   // stale-pins: kept (the request a press sends, made here)
    const ru = await fetch(base); const ju = await ru.json().catch(() => null);
    ok(!(jp && jp.code === 'storage_path_hung') && rp.status !== 503 && !(ju && ju.code === 'storage_path_hung'), `the files router: a marked press is asked (${rp.status} ${jp && (jp.code || jp.error)}), answered, forgiven — an unmarked request after it is asked too (${ru.status})`, { jp, ju });
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
    ];
    const TOKENS = ['X-VibeSpace-Attended', 'ATTENDED_HEADERS', 'refresh({ attended: true })'];   // + a navigate that passes the mark (below)   // stale-pins: kept (the census's own tokens)
    const census = (read) => {
      const found = [];
      for (const f of fs.readdirSync(path.join(REPO, 'src/lib')).filter((n) => n.endsWith('.js')).map((n) => 'src/lib/' + n)) {
        for (const line of read(f).split('\n')) if ((TOKENS.some((t) => line.includes(t)) || (line.includes('navigate(') && line.includes('attended: true'))) && !/^\s*(\/\/|\*|\/\*\*)/.test(line)) found.push([f, line]);
      }
      return found.filter(([f, line]) => !DOORS.some(([df, text]) => df === f && line.includes(text)));
    };
    const readSrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
    const strays = census(readSrc), missing = DOORS.filter(([f, text]) => !readSrc(f).includes(text));
    const planted = census((f) => (f === 'src/lib/code-editor.js' ? readSrc(f) + "\nfetch('/api/file/write', { headers: { ...ATTENDED_HEADERS } });\n" : readSrc(f)));   // stale-pins: kept (the census's planted RED site)
    ok(!strays.length && !missing.length && planted.length === 1 && planted[0][0] === 'src/lib/code-editor.js',
      `THE DOOR CENSUS (r316 / r336): the mark is set at ${DOORS.length} rows — the constant, its import, the marked listing, and the ONE door (Refresh, pressed: the button, the folded menu, the context menu); no site without a row (${strays.length}), no row gone (${missing.length}); RED (a planted marked save in the code editor): named (${planted.length})`, { strays, missing, planted });
    // r316 MUST 2: ONE PRESS, ONE WORKER — the listing a press sends carries the mark; the file-info probe after its refusal never does
    const fe = readSrc('src/lib/file-explorer.js'), fr = readSrc('src/routes/files.js');
    ok(fe.includes("const { data, info } = await listingAndProbe(fetch, `/api/files?path=${encodeURIComponent(dirPath)}${this._hp()}`, `/api/file/info?path=${encodeURIComponent(dirPath)}${this._hp()}`, init);") && fe.includes("if (info && !info.isDirectory) { this.app.openFile(")
      && fe.includes("  refresh({ attended = false } = {}) { this.navigate(this.currentPath, { attended }); }") && fe.includes("if (this._startPath) this.navigate(this._startPath);") && fr.includes("return attendedOf(req) ? { call: (op, payload, opts = {}) => pool.call(op, payload, { ...opts, attended: true }) } : pool;")
      && fr.includes("call: (op, payload) => sfsPlain(req).call(op, payload),"),
      'PIN (r316 / r336): the explorer lists and probes through explorer-listing; a refresh after a delete or a host change carries no mark; a restored window none; the router hands the mark to the pool; the folder field\'s dir slice, built once, never reads the mark of the request it closed over');
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

report();
