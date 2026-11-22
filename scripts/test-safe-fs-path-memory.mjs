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
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const NOTE = '    if (running) this._noteHung(running.payload, running.op, running !== call ? Math.max(call.timeoutMs || 0, monoNow() - (running.sentAt || monoNow())) : Math.min(running.timeoutMs || Infinity, monoNow() - (running.sentAt || monoNow())), { early: running !== call });   // the time since it was sent without an answer; ended EARLY by a queued call ⇒ only that long\n';
  const Rel = src.split(NOTE).length === 2 ? mutantCopies('safe-fs-path-memory', REPO).load('src/safe-fs.js', anchored(src, NOTE, '', 'release-no-memory'), 'release-no-memory') : null;
  const RK = 3;   // the release's road needs no more asks to show itself
  const redP = Rel ? scene(Rel, 'release', RK).catch((e) => ({ ends: -1, answers: [String(e && e.message)] })) : null;   // the release's road runs beside the leg (its own pool); a throw is a red, never an unhandled rejection
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
  const nowP = run(SF);
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const RUN = '    if (running) this._noteHung(running.payload, running.op, running !== call ? Math.max(call.timeoutMs || 0, monoNow() - (running.sentAt || monoNow())) : Math.min(running.timeoutMs || Infinity, monoNow() - (running.sentAt || monoNow())), { early: running !== call });   // the time since it was sent without an answer; ended EARLY by a queued call ⇒ only that long\n';
  const Q = src.split(RUN).length === 2 ? mutantCopies('safe-fs-path-memory-q', REPO).load('src/safe-fs.js', anchored(src, RUN, '    this._noteHung(call.payload, call.op, call.timeoutMs);\n', 'blame-the-queued'), 'blame-the-queued') : null;
  const [now, red] = await Promise.all([nowP, Q ? run(Q) : null]);
  ok(now.dead && !now.healthy && !now.patientRefused, `the queued call's deadline ended the worker; the RUNNING call's path is remembered (${now.dead}), the queued one's is not (${now.healthy}); ended early after ${now.bound && Math.round(now.bound)} ms, a ${now.probe} ms caller is asked again (${!now.patientRefused})`, now);
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
  const nowP = run(SF);   // the scene and its RED copies run side by side (each its own pool)
  // RED CONTROLS, each over the copy without its rule
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const ATT = '    if (hp && !opts.attended) return Promise.reject(pathHungRefusal(hp.path, hp.ms));\n', FGV = '    this._forgive(call.payload, call.op);   // r275 / r316: the path answered — what its entry\'s kind lets this reply clear leaves\n';
  const noAtt = src.split(ATT).length === 2 ? mutantCopies('safe-fs-path-memory-att', REPO).load('src/safe-fs.js', anchored(src, ATT, '    if (hp) return Promise.reject(pathHungRefusal(hp.path, hp.ms));\n', 'press-refused'), 'press-refused') : null;   // stale-pins: kept (the RED's planted line: the memory refusing a press)
  const noFgv = src.split(FGV).length === 2 ? mutantCopies('safe-fs-path-memory-fgv', REPO).load('src/safe-fs.js', anchored(src, FGV, '', 'never-forgiven'), 'never-forgiven') : null;
  const WIDE_FGV = "        if (p === h && m.self) for (const sk of Object.keys(m.self)) if (sk === key || (wide && WIDE_OPS.has(sk))) { delete m.self[sk]; changed = true; }\n";
  const tooWide = src.split(WIDE_FGV).length === 2 ? mutantCopies('safe-fs-path-memory-wide', REPO).load('src/safe-fs.js', anchored(src, WIDE_FGV, "        if (p === h || p.startsWith(h.endsWith('/') ? h : h + '/')) { this._hung.delete(h); continue; }\n", 'forgiven-too-wide'), 'forgiven-too-wide') : null;   // stale-pins: kept (r275's wide rule, the RED's copy)
  const [now, r1, r2, r3] = await Promise.all([nowP, noAtt ? run(noAtt) : null, noFgv ? run(noFgv) : null, tooWide ? run(tooWide) : null]);
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
      ['src/lib/code-editor.js', "import { fsErrorText, ATTENDED_HEADERS } from './file-explorer-ops.js';", 'its import'],
      ['src/lib/code-editor.js', "pressed ? { headers: ATTENDED_HEADERS } : undefined);", 'the code editor\'s open by a press (its first load, once)'],
      ['src/lib/code-editor.js', "opts.auto ? undefined : { headers: ATTENDED_HEADERS });", 'the code editor\'s PRESSED reload (the button, the disk chip — never the watch\'s {auto})'],
      ['src/lib/code-editor.js', "headers:{'Content-Type':'application/json', ...ATTENDED_HEADERS}, body:JSON.stringify({path:this.filePath,content", 'the code editor\'s save (the button, Mod-s, save-and-close)'],
      ['src/lib/doc-window-ui.js', "import { fsErrorText, ATTENDED_HEADERS } from './file-explorer-ops.js';", 'its import'],
      ['src/lib/doc-window-ui.js', "const chk = await fetch('/api/file/info?' + q(host, path), { headers: ATTENDED_HEADERS })", 'the document window\'s save, its OWN CHECK — the press\'s one try (refused ⇒ no write)'],
      ['src/lib/doc-window-ui.js', "headers: { 'Content-Type': 'application/json', ...ATTENDED_HEADERS }, body: JSON.stringify({ path, content: text", 'the document window\'s save'],
      ['src/lib/external-editor.js', "import { fsErrorText, ATTENDED_HEADERS } from './file-explorer-ops.js';", 'its import'],
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
      ['src/lib/file-explorer.js', "if (this._startPath) this.navigate(this._startPath, { attended: this._startPressed });", 'a new window\'s first listing — marked only when a press opened it (never a restore or a replay)'],
      ['src/lib/file-viewer.js', "{ headers: ATTENDED_HEADERS }).then((r) => (r.status === 503 ? r.json().catch(() => ({})) : null), () => null);", 'the viewers\' ⟳ Reload: its first call, the file\'s info'],
      ['src/lib/doc-window.js', "return new CodeEditor(sub, p, name, app, { host: h, attended }); };", 'the document window\'s Raw pane opened by a press (its first load once)'],
      ['src/lib/doc-window-ui.js', "showRaw({ pressed: true }); return; }", 'the Raw press (rich → raw)'],
      ['src/lib/doc-window-ui.js', "showRich(); await load({ pressed: true });", 'the Raw press back (raw → rich)'],
      ['src/lib/doc-window-ui.js', "setDirty(false); load({ pressed: true }); }, { signal });", 'the conflict bar\'s Reload pressed'],
    ];
    // a marked site: the header's constant or name, or a navigate / an open that passes `attended:` (the files' own mark — never the
    // spending ceiling's attended turns, another meaning)
    const TOKENS = ['X-VibeSpace-Attended', 'ATTENDED_HEADERS', 'refresh({ attended: true })', 'read({ pressed: true })', 'load({ pressed: true })', 'showRaw({ pressed: true })'];   // stale-pins: kept (the census's own tokens)
    const OPENS = ['navigate(', 'navigateUp(', 'openFile(', 'openEditor(', 'openDoc(', 'CodeEditor(', 'mountDocWindow(', 'openFileExplorer('];
    const marked = (line) => TOKENS.some((t) => line.includes(t)) || /(?<!function )\b(load|read|showRaw)\(\{[^}]*\bpressed(?::(?!\s*false\b)|\s*[,}])/.test(line) || (OPENS.some((o) => line.includes(o)) && /\battended(\s*:(?!\s*false\b)|\s*[,}])/.test(line));   // `attended: …` (never `attended: false`) or handed on as `{ …, attended }`
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
    const PRESS = /(\.onclick\s*=|addEventListener\(\s*'(?:click|dblclick|pointerup|keydown)'|\baction:\s*(?:async\s*)?\([^)]*\)\s*=>|\bact:\s*(?:async\s*)?\([^)]*\)\s*=>|\brun:\s*(?:async\s*)?\([^)]*\)\s*=>|onCommit:|\btool\('[\w-]+',[^\n]*\(\) =>)/;   // tool(…): the document window's toolbar
    const OPENCALL = /\b(navigate|navigateUp|refresh|openFile|openEditor|openDoc|openFileExplorer|reloadFromDisk|renderInto|load|toggleRaw|showRaw)\(/g;
    const SURFACE = ['file-explorer.js', 'file-explorer-ops.js', 'file-explorer-uploads.js', 'phone-files.js', 'path-field.js', 'explorer-listing.js', 'file-viewer.js', 'hex-viewer.js', 'code-editor.js', 'doc-window.js', 'doc-window-ui.js', 'external-editor.js'].map((n) => 'src/lib/' + n);
    const EXCEPT = [
      ['src/lib/code-editor.js', "run: () => this.reloadFromDisk() },", 'reloadFromDisk marks its own read unless {auto} (its DOORS row: the PRESSED reload)'],
      ['src/lib/code-editor.js', 'btnReload.onclick = () => this.reloadFromDisk();', 'reloadFromDisk marks its own read unless {auto} (its DOORS row: the PRESSED reload)'],
      ['src/lib/file-viewer.js', 'await FileViewer.renderInto(container, filePath, fileName, app, host);', 'the ⟳ Reload\'s re-render rides its first call, the marked info check above it (images and media load by src: no header can ride them)'],
      ['src/lib/doc-window-ui.js', '() => toggleRaw()', 'toggleRaw marks its own reads (showRaw({ pressed: true }) / load({ pressed: true }) — DOORS rows)'],
    ];
    const libFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((n) => n.endsWith('.js')).map((n) => 'src/lib/' + n);
    const pressSites = (rd, files) => {
      const out = [];
      for (const f of files) {
        const L = rd(f).split('\n');
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
    const plantedPress = pressSites((f) => (f === 'src/lib/file-explorer-ops.js' ? readSrc(f) + "\n    items.push({ label: t('Open'), action: () => this.navigate(fullPath, { attended: false }) });\n    row.addEventListener('dblclick', () => {\n      if (ok) this.app.openFile(p, n, { host });\n    });\n" : readSrc(f)), SURFACE).filter((x) => !x.marked && !excepted(x));   // stale-pins: kept (the planted RED presses: `attended: false` is no mark)
    const outside = pressSites(readSrc, libFiles.filter((f) => !SURFACE.includes(f))).filter((x) => !x.marked && /^(openFile|openEditor|openDoc|openFileExplorer|navigate)$/.test(x.call));
    console.log(`    the press census: ${sitesNow.length} opening calls inside press handlers of the Files window, its viewers and editors — ${sitesNow.filter((x) => x.marked).length} marked, ${sitesNow.filter(excepted).length} excepted`);
    console.log(`    OUTSIDE this unit (r1442: the next unit marks them through their helpers), seen directly: ${outside.map((x) => `${x.f.split('/').pop()}:${x.at} ${x.call}`).join(', ') || 'none'} — through helpers (no direct call here): chat-renderers.js _openLinkTarget (a chat path link), search-window.js activate, an artifact card's open`);
    ok(sitesNow.length >= 20 && !unmarkedPress.length && !deadExcept.length && plantedPress.length === 2 && plantedPress.every((x) => x.f === 'src/lib/file-explorer-ops.js'),
      `THE PRESS CENSUS (structural, r1396 / r1442 (b)): every opening call inside a press handler of the Files window, its viewers and its editors carries the mark or is an exception with its reason — unmarked: ${unmarkedPress.map((x) => `${x.f}:${x.at} ${x.call}`).join(', ') || 'none'}; dead exception rows: ${deadExcept.length}; RED by name: a planted menu Open with \`attended: false\` and a planted double-click open (${plantedPress.map((x) => `${x.f.split('/').pop()}:${x.at} ${x.call}`).join(', ')})`, { unmarkedPress, deadExcept, plantedPress });
    // r316 MUST 2: ONE PRESS, ONE WORKER — the listing a press sends carries the mark; the file-info probe after its refusal never does
    const fe = readSrc('src/lib/file-explorer.js'), fr = readSrc('src/routes/files.js');
    ok(fe.includes("const { data, info } = await listingAndProbe(fetch, `/api/files?path=${encodeURIComponent(dirPath)}${this._hp()}`, `/api/file/info?path=${encodeURIComponent(dirPath)}${this._hp()}`, init);") && fe.includes("if (info && !info.isDirectory) { this.app.openFile(")
      && fe.includes("  refresh({ attended = false } = {}) { this.navigate(this.currentPath, { attended }); }") && fe.includes("this._startPressed = !!winInfo._explorerPressed;") && fr.includes("return attendedOf(req) ? { call: (op, payload, opts = {}) => pool.call(op, payload, { ...opts, attended: true }) } : pool;")
      && fr.includes("call: (op, payload, opts) => sfsPlain(req).call(op, payload, opts),") && readSrc('src/server/dir-slice.js').includes("const IDLE_ONLY = Object.freeze({ idleOnly: true });"),
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
{
  const os = require('os');
  const ROOTMI = '22 1 0:22 / / rw - ext4 /dev/root rw\n';   // one storage: the path text alone would name the folder
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'b23e5-links-')), X = path.join(T, 'x'), Y = path.join(T, 'y');
  try {
    fs.mkdirSync(X); fs.mkdirSync(Y);
    fs.symlinkSync('/scratch-b23e5/dead-mount-a', path.join(X, 'a')); fs.symlinkSync('/scratch-b23e5/dead-mount-b', path.join(X, 'b'));
    const run = async (Mod, tag) => {
      const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-links-${tag}`, hungMs: 60000, mountsText: async () => ROOTMI });
      try {
        await untilLive(pool, 1);
        await pool._noteHung({ path: path.join(X, 'a') }, 'stat', 15000); await pool._noteHung({ path: path.join(X, 'b') }, 'stat', 15000);
        await pool._noteHung({ path: path.join(Y, 'a.txt') }, 'stat', 15000); await pool._noteHung({ path: path.join(Y, 'b.txt') }, 'stat', 15000);
        const at = (q) => !!pool._hungOf({ path: q }, 'stat', 15000);
        return { linkFolder: at(path.join(X, 'c.txt')), linkSelf: at(path.join(X, 'a')), realFolder: at(path.join(Y, 'c.txt')) };
      } finally { pool.close(); }
    };
    const r = await run(SF, 'now');
    const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
    const LOOK = '        if (!r.timedOut && !(Array.isArray(r.links) && r.links.filter((x) => !x).length >= 2)) return;\n';
    const cut = src.split(LOOK).length === 2 ? mutantCopies('safe-fs-path-memory-links', REPO).load('src/safe-fs.js', anchored(src, LOOK, '', 'look-cut'), 'look-cut') : null;
    const rc = cut ? await run(cut, 'cut') : null;
    console.log('    the facts judged: ' + JSON.stringify({ now: r, release: rc }));
    ok(!r.linkFolder && r.linkSelf && r.realFolder, 'two dead children reached through SYMLINKS (into dead mounts) never name their healthy folder — each names itself; two real dead children of one storage still name theirs (the look answered on an idle worker)');
    ok(!!rc && rc.linkFolder === true, 'RED CONTROL (the links\' answer not read, in a copy): the two links name their healthy folder — everything under it refused', rc);
    // THE LOOK TAKES AN IDLE WORKER ONLY (its read; r1378 (4)): with the one worker held by a live call, the look never queues behind it
    // (its 1.5 s deadline would end that call's worker) — the folder is not named now (a later sibling names it); the held call answers
    const busy = async (Mod, tag) => {
      const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-busy-${tag}`, timeouts: { default: 15000 }, hungMs: 60000, mountsText: async () => ROOTMI });
      try {
        await untilLive(pool, 1);
        const ends0 = pool.stats().timeouts;
        const held = pool.call('__sleep', { path: '/scratch-b23e5/busy/x', ms: 2500 }, { timeoutMs: 6000 }).then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && (e.code || e.message))));
        await sleep(50);
        await pool._noteHung({ path: path.join(Y, 'a.txt') }, 'stat', 15000); await pool._noteHung({ path: path.join(Y, 'b.txt') }, 'stat', 15000);
        return { named: !!pool._hungOf({ path: path.join(Y, 'c.txt') }, 'stat', 15000), held: await held, ends: pool.stats().timeouts - ends0 };
      } finally { pool.close(); }
    };
    const bP = busy(SF, 'now');   // the scene and its RED copy side by side
    const LI = "    const once = () => this.call('lstatKinds', payload, { timeoutMs: CLIMB_LOOK_MS, look: true, idleOnly: true })";
    const queued = src.split(LI).length === 2 ? mutantCopies('safe-fs-path-memory-busy', REPO).load('src/safe-fs.js', anchored(src, LI, "    const once = () => this.call('lstatKinds', payload, { timeoutMs: CLIMB_LOOK_MS, look: true })", 'look-queued'), 'look-queued') : null;
    const [b, bq] = await Promise.all([bP, queued ? busy(queued, 'queued') : null]);
    console.log('    the busy worker: ' + JSON.stringify({ now: b, queued: bq }));
    ok(!b.named && b.held === 'answered' && b.ends === 0, `the look takes an IDLE worker only: the one worker held by a live call, the folder is not named now (${b.named}) and the held call answers (${b.held}; ${b.ends} worker ended)`, b);
    ok(!!bq && bq.held !== 'answered' && bq.ends >= 1, `RED CONTROL (the look queued behind the live call, in a copy): its short deadline ends the worker under the held call (${bq && bq.held}; ${bq && bq.ends} ended)`, bq);
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
  const ds = fs.readFileSync(path.join(REPO, 'src/server/dir-slice.js'), 'utf8'), src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
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
  const NEWW = "      this.saveIndicator.textContent = '✕ ' + t('{name} is not saved — {why}', { name: String(this.filePath).split('/').pop() || this.filePath, why: err.message || t('Error') }); this.saveIndicator.style.color = 'var(--red)';\n";
  const sv = saveBody ? await runSave(saveBody) : null;
  const svR = saveBody && saveBody.includes(NEWW) ? await runSave(saveBody.replace(NEWW, "      this.saveIndicator.textContent = `✕ ${err.message || t('Error')}`; this.saveIndicator.style.color = 'var(--red)';\n")) : null;   // stale-pins: kept (the release's words planted back in a lifted copy)
  console.log('    the save, the facts judged: ' + JSON.stringify({ now: sv, release: svR }));
  ok(!!sv && sv.out === false && sv.modified === true && sv.marked && /^✕ notes\.md is not saved — this folder or file did not answer in time/.test(sv.text) && sv.title.startsWith('/scratch-b23e5/dead/notes.md is not saved')
      && /^notes\.md is not saved — .*\. Your text is still here, unsaved: save again, or copy it to keep it elsewhere\.$/.test(sv.toast),
    'THE SAVE LAW (the code editor, r1378 (3)): a save that meets a dead path is a marked press; the person\'s text stays (still unsaved — the dirty mark), the editor stays open (save-and-close hears false), the words name WHERE it is not saved (the file, the whole path on hover) and say where the text IS and what to do (a toast)', sv);
  ok(!!svR && !/is not saved/.test(svR.text), 'RED CONTROL (the release\'s words, in a lifted copy): the refusal names nothing — where the text was not saved is not said', svR);
  // r1733 (6): Mod-s twice on a remembered path — the second is refused «still trying» while the first may still land: ONE true sentence
  const TRYING = { error: 'this folder or file is still being tried — wait for the answer to the first press', code: 'storage_path_trying' };
  const svT = saveBody ? await runSave(saveBody, TRYING) : null;
  const TRY_LINE = (saveBody || '').split('\n').find((l) => l.includes("data.code === 'storage_path_trying'")) || '';
  const svTR = saveBody && TRY_LINE ? await runSave(saveBody.replace(TRY_LINE, ''), TRYING) : null;   // stale-pins: kept (the line cut)
  ok(!!svT && svT.out === false && svT.modified === true && /^… notes\.md: the save before this one is still being tried — wait for its answer$/.test(svT.text) && !svT.toast && !!svTR && /is not saved/.test(svTR.toast),
    `THE WORDS (r1733 (6)): a second save refused «still trying» says one true sentence («${svT && svT.text}») — no «not saved» toast while the first may still land; the text stays unsaved; RED (the line cut, lifted): «not saved» beside a save that may land`, { svT, svTR });
  // the document window's and the pane editor's saves: the same law, read from their source — the FULL words (where the text IS and what
  // to do); the pane keeps them (no reset) and never signals the CLI over a refused save
  const FULL = "t('{name} is not saved — {why}. Your text is still here, unsaved: save again, or copy it to keep it elsewhere.', { name: String(";
  ok(dw.includes("} catch (e) { say(" + FULL + "path).split('/').pop() || path, why: e.message })); }") && /throw new Error\(data\.error \? fsErrorText\(data\) : `HTTP \$\{res\.status\}`\);/.test(dw)
      && /saveBtn\.textContent = '✕ ' \+ t\('\{name\} is not saved — \{why\}'/.test(ee) && ee.includes('pathSpan.textContent = ' + FULL + 'filePath).split(\'/\').pop() || filePath')
      && /if \(!res\.ok \|\| data\.error\) throw new Error\(data\.error \? fsErrorText\(data\) : `HTTP \$\{res\.status\}`\);[^\n]*\n\s*await fetch\('\/api\/editor\/signal'/.test(ee) && !/setTimeout\(\(\) => \{ saveBtn\.textContent/.test(ee),   // stale-pins: kept (the release's 4 s reset — a deliberate absence check)
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
      else if (kind === 'pane') fn = new Function('t', 'showConfirmDialog', 'prevAsk', 'unsavedPane', 'app', 'targetWinInfo', `return function (o) {\n${body}\n};`)(tt, ask, undefined, () => (dirty ? { name: 'notes.txt' } : null), { wm }, { id: 'w1' });
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
    const install = new Function('targetWinInfo', 'editorView', 'content', 'filePath', 'showConfirmDialog', 't', 'app', block);
    const view = (text) => ({ dom: { isConnected: true }, state: { doc: { toString: () => text } } });
    const A = view('typed in A'), B = view('B as loaded'), C = view('typed in C');
    install(win, A, 'A as loaded', '/scratch-b23e5/a.md', (q) => { asked.push(q.message); return Promise.resolve(false); }, tt, { wm });
    const guard1 = win.onCloseRequest;
    install(win, B, 'B as loaded', '/scratch-b23e5/b.md', (q) => { asked.push(q.message); return Promise.resolve(false); }, tt, { wm });
    const once = win.onCloseRequest === guard1;
    const r1 = win.onCloseRequest({}), d1 = win._editorDirty();
    install(win, C, 'C as loaded', '/scratch-b23e5/c.md', (q) => { asked.push(q.message); return Promise.resolve(false); }, tt, { wm });
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
  const redG = cg ? await drive('code', cg.replace('(o && o.discardAsked)', '(o && (o.discardAsked || o.asked))')) : null;
  const redGd = dg ? await drive('doc', dg.replace('(o && o.discardAsked)', '(o && (o.discardAsked || o.asked))')) : null, redGp = pg ? await drive('pane', pg.replace('!(o && o.discardAsked)', '!(o && (o.discardAsked || o.asked))')) : null;   // stale-pins: kept (the planted REDs)
  ok(!!redG && redG.find((r) => r.what.includes('group')).go === true && !!redGd && redGd.find((r) => r.what.includes('group')).go === true && !!redGp && redGp.find((r) => r.what.includes('group')).go === true,
    'RED CONTROLS (the group\'s «asked» taken as the person\'s Discard, in lifted copies of each of the three guards): an unsaved window closes at a group\'s close-all unasked — a silent loss', { redG, redGd, redGp });
  ok(/requestClose\(tid, \{ asked: true \}\)/.test(rd('src/lib/tab-group.js')) && /go = win\.onCloseRequest\(opts\) !== false;/.test(rd('src/lib/window.js')),
    'PIN: a group\'s close-all closes each member through requestClose (asked), and requestClose hears the window\'s answer');
}

console.log('①k r1378 (2) / r1442 (A): ONE TRY A REMEMBERED PATH — ten presses on a remembered dead folder start ONE worker; a press the memory does not refuse is never held');
{
  const word = (p) => p.then(() => 'answered', (e) => (e && e.code === 'path-trying' ? 'still trying' : e && e.code === 'path-hung' ? (e.tried ? 'path-hung, tried' : 'path-hung') : e && e.safeFsTimeout ? 'deadline' : String(e && e.code)));
  const run = async (Mod, tag) => {
    const pool = new Mod.SafeFs({ poolSize: 4, name: `path-memory-ten-${tag}`, timeouts: { default: 15000, __sleep: 400 }, hungMs: 60000, mountsText });
    try {
      await untilLive(pool, 4);
      await pool._noteHung({ path: '/scratch-b23e5/ten' }, 'stat', 15000);   // remembered dead: an unmarked call is refused, a press is tried
      const seq0 = pool._seq, ends0 = pool.stats().timeouts;
      // THE PERSON'S TEN PRESSES while the first is out: Open on the folder five times (one call: they join), then five files in it
      // (another call each, refused by the same remembered path: told «still trying»)
      const presses = [];
      for (let i = 0; i < 5; i++) presses.push(word(pool.call('__sleep', { path: '/scratch-b23e5/ten', ms: 4000 }, { attended: true })));
      for (let i = 0; i < 5; i++) presses.push(word(pool.call('__sleep', { path: `/scratch-b23e5/ten/f-${i}`, ms: 4000 }, { attended: true })));
      const words = await Promise.all(presses);
      const sent = pool._seq - seq0, ends = pool.stats().timeouts - ends0, trying = pool._trying ? pool._trying.size : 0;
      // A HEALTHY press out on a folder (its listing; a dead child mount holds such a listing its whole deadline): a PRESS under it (a
      // save, an open) and an unmarked read under it are asked — never held for it (the read's H1)
      await untilLive(pool, 4);
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
      const two = await Promise.all(['a.txt', 'b.txt', 'c.txt'].map((n) => word(pool.call('__sleep', { path: `/scratch-b23e5/two/${n}`, ms: 4000 }, { attended: true }))));
      return { sent, ends, words, trying, pressUnder, readUnder, writesSent, held, named2, twoSent: pool._seq - s2, two };
    } finally { pool.close(); }
  };
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
{
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
      out.deadline = await say(pool.call('__sleep', { path: '/scratch-b23e5/slow-x', ms: 4000 }, { attended: true }));   // a 4 s stall, a 300 ms bound: a widened deadline would ANSWER
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
{
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
    const pool = new Mod.SafeFs({ poolSize: 1, name: `path-memory-hold-${tag}`, timeouts: { default: 15000 }, hungMs: 60000, mountsText });
    try {
      await untilLive(pool, 1);
      await pool._noteHung({ path: '/scratch-b23e5/held' }, 'stat', 15000);
      const p = pool.call('__sleep', { path: '/scratch-b23e5/held', ms: 4000 }, { attended: true, timeoutMs: 15000 }).catch((e) => String(e && e.message));
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
