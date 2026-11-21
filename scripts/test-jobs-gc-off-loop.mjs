#!/usr/bin/env node
// THE JOBS' COLLECTION PASS ASKS ITS FILES OFF THE LOOP (B-360d, lane bl-keys-misc — the coordinator's r707, its round r821). On the
// owner's hub (2.369.413, 878 jobs, the data folder on a network mount) the hourly collection pass (src/jobs.js _gc) held the main
// loop twice in 2.5 h, 1.2 and 1.4 s, at the stamp read — a synchronous open of each job's pid.json, blocked on the mount. THE LAW: no
// synchronous file call of that pass on the hub's loop; each ask off it (fs.promises), ONE at a time — a read that has not come back
// is never started again beside itself — the pass bounded by GC_FILES_MS; an ask that does not answer, or FAILS with anything but
// «not there», is UNKNOWN, and the pass collects nothing on an unknown (never a guess). The stamp decides only for a record the pass
// would collect: only those are read. THE RECORDS FIRST, then the spill folder, and each walk starts after the last one it reached.
// A pass in flight at the engine's stop ends there. An unknown is said, and said again once a day while it lasts.
//   ① THE HOLD PLACED, NEVER ANSWERED: a candidate's pid.json is a FIFO with no writer (the open never returns — no mount needed):
//      the loop keeps turning, the pass ends at its budget, that record and the one after it are UNKNOWN (kept), the one before it is
//      collected; the spill folder (after the records) is not asked while the read is out; a non-candidate's FIFO stamp is never asked
//   ② ONE READ IN FLIGHT: a pass while that read is out asks nothing and is not said again — until a day has gone; once the read
//      answers, the next pass starts where the last one stopped and collects both, then the spill folder's old file goes
//   ③ RED CONTROL — the release's read (a copy): the same FIFO answered after WRITER_MS by a writer holds the release's loop that
//      long; this tree's loop does not stop
//   ④ A FAILED READ IS UNKNOWN: a stamp read that fails (EISDIR, as a stale handle or an input error would) keeps its record; RED: a
//      copy that takes every error as «no stamp» collects it
//   ⑤ THE ORDER IS FAIR: a head whose stamp never answers is asked LAST by the next pass, so the records behind it are collected; RED:
//      a copy that starts every pass at the head collects none of them
//   ⑥ A RECORD THAT COMES ALIVE WHILE ITS STAMP IS OUT is kept; RED: the re-check after the await cut
//   ⑦ A PASS IN FLIGHT AT THE STOP ENDS THERE (nothing removed after the engine's stop); RED: a copy that never sees the stop
//   ⑧ CENSUS: no synchronous file call left in the pass's body; the records before the spill folder; «not there» alone is a reply
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`); } return c; }
// THE SHARED WATCHDOG (scripts/suite-watchdog.mjs): fires before the gate's budget (capped at 40 s), names the leg it was in (each
// leg's own header, or WD.section) and its last line, then ends the suite. An engine arms timers, so the suite ends by process.exit —
// and NO read is left parked on a FIFO and no writer child left blocked at the end, on the red path too: the exit handler answers
// every FIFO made (a pool thread parked in an open holds the process's exit), unlinks it and kills every writer child still there
const WD = armWatchdog({ capMs: 40e3 });
const dirs = [], fifos = [], writers = new Set();
const freeFifo = (f) => { try { const fd = fs.openSync(f, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.closeSync(fd); return true; } catch { return false; } };   // the parked reader gets its end of file
process.on('exit', () => {
  for (const w of writers) { try { w.kill('SIGKILL'); } catch { } }
  for (const f of fifos) { freeFifo(f); try { fs.unlinkSync(f); } catch { } }
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
});
const D = 86400e3, T0 = Date.now(), ENDED = T0 - 20 * D;
const policy = { doneAfterHours: 0, failedAfterDays: 7 };   // «never archive»: the records reach the collection pass
const acc = { view: 'session', control: 'session' };
const task = (id, state = 'done') => ({ id, kind: 'task', name: id, state, owner: {}, access: acc, runs: [{ startedAt: ENDED, endedAt: ENDED + 1000, exit: 0 }], createdAt: ENDED });
const mkfifo = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const r = spawnSync('mkfifo', [f]); if (r.status !== 0) throw new Error(`mkfifo ${f}: ${String(r.stderr || r.error || '').trim()}`); fifos.push(f); };
const ctl = (dir, id) => path.join(dir, 'job-logs', id, String(ENDED));
const stampOf = (w, id) => path.join(ctl(w.dir, id), 'pid.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function world(tag, mod, { gcFilesMs }) {
  const dir = scratch('jobs-gc-offloop-' + tag); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([task('jb-gc00a1'), task('jb-gc00b1'), task('jb-gc00a2'), { ...task('jb-gc00s1'), kind: 'service', state: 'down' }]));
  const spill = path.join(dir, 'job-notifications-read'); fs.mkdirSync(spill, { recursive: true });
  fs.writeFileSync(path.join(spill, 'old.json'), '{}'); fs.utimesSync(path.join(spill, 'old.json'), new Date(ENDED), new Date(ENDED));
  fs.writeFileSync(path.join(spill, 'young.json'), '{}');
  const logs = [];
  const jm = new mod.JobManager({ dataDir: dir, broadcast: () => { }, notifyUser: () => ({ ok: true }), log: (...a) => logs.push(a.join(' ')), archivePolicy: () => policy, gcFilesMs });
  jm.init();
  return { dir, jm, logs, spill };
}
const kept = (w) => [...w.jm.jobs.keys()].sort().join(',');
const saidOf = (w) => w.logs.filter((l) => /the collection pass: \d+ file read\(s\) did not answer in time or failed/.test(l));
// the loop's turns while `fn` runs: the longest gap between two 5 ms ticks
async function loopGap(fn) {
  let last = Date.now(), max = 0;
  const t = setInterval(() => { const n = Date.now(); max = Math.max(max, n - last); last = n; }, 5);
  const t0 = Date.now();
  try { await fn(); } finally { clearInterval(t); }
  max = Math.max(max, Date.now() - last);
  return { max, took: Date.now() - t0 };
}
// a FIFO's writer end held open once its reader is parked (the read waits for data or the end of file): → the fd (close it = answer)
async function holdWriter(f) {
  for (let i = 0; i < 400; i++) { try { return fs.openSync(f, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); } catch { await sleep(5); } }
  throw new Error(`no reader ever opened ${f}`);
}
async function slotFree(jm) { for (let i = 0; i < 400 && jm._gcOut; i++) await sleep(5); return !jm._gcOut; }
// THE BOUNDS ARE THE MECHANISM'S OWN (scripts/wall-clock-census.mjs): the pass's budget handed to the product, and the release's hold
// measured in the same run — never a literal number of ms
const A_BUDGET_MS = 800, SHORT_MS = 300, WRITER_MS = 1000;

const JOBS = require(path.join(ROOT, 'src/jobs.js'));
const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
const MJ = mutantCopies('jobs-gc-offloop', ROOT);
const mutant = (anchor, edit, tag) => { ok(JSRC.split(anchor).length === 2, `control setup (${tag}): its line is in the pass once`); return MJ.load('src/jobs.js', anchored(JSRC, anchor, edit, tag), tag); };

say('① THE HOLD PLACED, NEVER ANSWERED (a FIFO no one writes)');
WD.section('①');
const A = world('a', JOBS, { gcFilesMs: A_BUDGET_MS });
const fifoB = stampOf(A, 'jb-gc00b1'), fifoS = stampOf(A, 'jb-gc00s1');
mkfifo(fifoB); mkfifo(fifoS);
const g1 = await loopGap(() => A.jm._gc({ now: T0 }));
ok(g1.max < A_BUDGET_MS && g1.took >= A_BUDGET_MS * 0.8, `the loop keeps turning while a stamp's open never returns: its longest gap ${g1.max} ms, under the pass's budget (${A_BUDGET_MS} ms — the release's read would hold it for good); the pass waited its budget and ended (${g1.took} ms)`);
ok(kept(A) === 'jb-gc00a2,jb-gc00b1,jb-gc00s1',
  'the record before it is collected; it and the one after it are UNKNOWN — kept (nothing collected on an unknown); the down service is no candidate', kept(A));
ok(A.jm._gcFrom === 'jb-gc00a2', `the next pass starts at the first record not asked (${A.jm._gcFrom})`);
ok(saidOf(A).length === 1 && /: 3 file read\(s\)/.test(saidOf(A)[0]), `said, counting three unknowns (the stamp out, the record after it, the spill folder after the records) — the non-candidate's FIFO stamp was never asked: «${(saidOf(A)[0] || '').slice(0, 200)}»`);
ok(fs.existsSync(path.join(A.spill, 'old.json')) && fs.existsSync(path.join(A.spill, 'young.json')), 'the spill folder comes after the records: not asked while the read is out (both files kept)');

say('② ONE READ IN FLIGHT · said again once a day');
WD.section('②');
const out1 = A.jm._gcOut;
await A.jm._gc({ now: T0 });
ok(!!out1 && A.jm._gcOut === out1 && kept(A) === 'jb-gc00a2,jb-gc00b1,jb-gc00s1', 'a pass while that read is out asks nothing — no second read beside it (the same read still holds the slot; both records kept)', kept(A));
ok(saidOf(A).length === 1, 'and it is not said again the same day');
A.jm._gcUnknownSaidAt -= JOBS.GC_SAY_AGAIN_MS;   // a day goes by with the read still out
await A.jm._gc({ now: T0 });
ok(saidOf(A).length === 2 && /until it comes back or the hub restarts/.test(saidOf(A)[1]), `a day later it is said again (a long outage stays in the journal): «${(saidOf(A)[1] || '').slice(0, 220)}»`);
ok(freeFifo(fifoB), 'the FIFO\'s writer comes (its parked reader is answered)');
ok(await slotFree(A.jm), 'the slot frees when the read answers — never before');
fs.unlinkSync(fifoB);   // the stamp is gone now (an open of the FIFO again would park a new read: never left behind)
await A.jm._gc({ now: T0 });
ok(kept(A) === 'jb-gc00s1', 'the next pass asks again and collects both (an empty stamp is no live work)', kept(A));
ok(!fs.existsSync(path.join(A.spill, 'old.json')) && fs.existsSync(path.join(A.spill, 'young.json')) && saidOf(A).length === 2 && A.jm._gcUnknownSaidAt === 0,
  'then the spill folder\'s 20-day-old file goes, the young one stays; nothing unknown, nothing said');
A.jm.shutdown();

// ③ RED CONTROL — the release's read, in a copy: the stamp read synchronously on the loop. A writer answers the FIFO after WRITER_MS
// (a child, started and ready before the pass), so the release's loop is held that long and comes back; this tree's is not held
say(`③ RED CONTROL — the release's read (a copy) against the same FIFO, answered after ${WRITER_MS} ms`);
WD.section('③');
const READ_LINE = "      const got = await this._gcAsk(() => fs.promises.readFile(path.join(this._ctlDir(job, run.startedAt), 'pid.json'), 'utf-8'), until);\n";
const REL = mutant(READ_LINE, "      const got = { v: (() => { try { return fs.readFileSync(path.join(this._ctlDir(job, run.startedAt), 'pid.json'), 'utf-8'); } catch { return null; } })() };   // MUTANT: the release's read — synchronous, on the loop\n", 'gc-release-read');
async function delayed(mod, tag) {
  const w = world(tag, mod, { gcFilesMs: 3 * WRITER_MS });
  const f = stampOf(w, 'jb-gc00a1'); mkfifo(f);
  const writer = spawn(process.execPath, ['-e', `process.stdout.write('ready\\n'); setTimeout(() => { const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(f)}, 'w'); fs.closeSync(fd); }, ${WRITER_MS});`], { stdio: ['ignore', 'pipe', 'inherit'] });
  writers.add(writer); writer.once('exit', () => writers.delete(writer));
  await new Promise((r, j) => { writer.stdout.once('data', r); writer.once('error', j); });
  const g = await loopGap(() => w.jm._gc({ now: T0 }));
  await new Promise((r) => (writer.exitCode != null ? r() : writer.once('exit', r)));
  const gone = !w.jm.jobs.has('jb-gc00a1');
  w.jm.shutdown();
  return { ...g, gone };
}
const rel = await delayed(REL, 'rel'), mine = await delayed(JOBS, 'mine');
ok(rel.max >= WRITER_MS * 0.8, `CONTROL (the release's read, in a copy): the loop is HELD while the open waits — its longest gap ${rel.max} ms (the writer answered at ${WRITER_MS} ms)`);
ok(mine.max < rel.max / 3 && mine.gone && rel.gone, `this tree, the same FIFO: the longest gap ${mine.max} ms, under a third of the release's ${rel.max} ms measured in this run; both collect the record once the read answers`);

say('④ A FAILED READ IS UNKNOWN (r821 1: only «not there» is a reply)');
WD.section('④');
const ANSWERED = "    const answered = (got) => !!got && !(got.e && got.e.code !== 'ENOENT');\n";
const ANY_ERR = mutant(ANSWERED, "    const answered = (got) => !!got;   // MUTANT: every error read as «no stamp»\n", 'gc-any-error');
async function failedRead(mod, tag) {
  const w = world(tag, mod, { gcFilesMs: SHORT_MS });
  fs.mkdirSync(stampOf(w, 'jb-gc00a1'), { recursive: true });   // its pid.json is a folder: the read FAILS (EISDIR), as a stale handle or EIO would
  await w.jm._gc({ now: T0 });
  const r = { kept: kept(w), said: saidOf(w) };
  w.jm.shutdown();
  return r;
}
const fr = await failedRead(JOBS, 'failed'), frM = await failedRead(ANY_ERR, 'failed-m');
ok(fr.kept === 'jb-gc00a1,jb-gc00s1' && fr.said.length === 1 && /: 1 file read\(s\)/.test(fr.said[0]), 'a stamp read that fails keeps its record (UNKNOWN, said); the records whose stamp is not there are collected', fr);
ok(frM.kept === 'jb-gc00s1', 'RED CONTROL (a copy that reads every error as «no stamp»): the record whose read failed is collected', frM);

say('⑤ THE ORDER IS FAIR (r821 2: each pass starts after the last record it reached)');
WD.section('⑤');
const ROTATE = "    const cands = rotate([...this.jobs].filter(([, job]) => collectable(job)), ([id]) => id, this._gcFrom);\n";
const AT_HEAD = mutant(ROTATE, "    const cands = [...this.jobs].filter(([, job]) => collectable(job));   // MUTANT: every pass starts at the head\n", 'gc-at-head');
async function fair(mod, tag) {
  const w = world(tag, mod, { gcFilesMs: SHORT_MS });
  const f = stampOf(w, 'jb-gc00a1'); mkfifo(f);
  await w.jm._gc({ now: T0 });   // the head's stamp never answers: it eats the budget, the two behind it are not asked
  const first = { kept: kept(w), from: w.jm._gcFrom };
  freeFifo(f); const freed = await slotFree(w.jm); fs.unlinkSync(f); mkfifo(f);   // the head stays a stamp that never answers
  await w.jm._gc({ now: T0 });
  const second = kept(w);
  freeFifo(f); await slotFree(w.jm);
  w.jm.shutdown();
  return { first, freed, second };
}
const fa = await fair(JOBS, 'fair'), faM = await fair(AT_HEAD, 'fair-m');
ok(fa.first.kept === 'jb-gc00a1,jb-gc00a2,jb-gc00b1,jb-gc00s1' && fa.first.from === 'jb-gc00b1' && fa.freed, 'the first pass: the head\'s stamp eats the budget; the two behind it are not asked (kept), and the next pass starts at the first of them', fa.first);
ok(fa.second === 'jb-gc00a1,jb-gc00s1', 'the next pass asks the records behind the head first and collects them; the head (still not answering) is asked last and kept', fa.second);
ok(faM.second === 'jb-gc00a1,jb-gc00a2,jb-gc00b1,jb-gc00s1', 'RED CONTROL (a copy that starts every pass at the head): the same head eats the budget again — nothing behind it is ever collected', faM.second);

say('⑥ A RECORD THAT COMES ALIVE WHILE ITS STAMP IS OUT');
WD.section('⑥');
const RECHECK = "      if (this.jobs.get(id) !== job || !collectable(job)) continue;   // the record moved while its stamp was read (a restart, a removal)\n";
const NO_RECHECK = mutant(RECHECK, "      /* MUTANT: no re-check after the await */\n", 'gc-no-recheck');
async function alive(mod, tag) {
  const w = world(tag, mod, { gcFilesMs: 3 * WRITER_MS });
  const f = stampOf(w, 'jb-gc00a1'); mkfifo(f);
  const pass = w.jm._gc({ now: T0 });
  const fd = await holdWriter(f);   // its stamp read is out (parked on the FIFO, the writer end held)
  const job = w.jm.jobs.get('jb-gc00a1');
  job.state = 'running'; job.runs.push({ startedAt: Date.now() });   // a restart while the stamp is out
  fs.closeSync(fd);   // the read answers: an empty stamp
  await pass;
  const r = kept(w);
  w.jm.shutdown();
  return r;
}
const al = await alive(JOBS, 'alive'), alM = await alive(NO_RECHECK, 'alive-m');
ok(al === 'jb-gc00a1,jb-gc00s1', 'the record restarted while its stamp was out is KEPT (checked again after the await, against the live one); the two behind it are collected', al);
ok(alM === 'jb-gc00s1', 'RED CONTROL (the re-check after the await cut, in a copy): the running record is collected', alM);

say('⑦ A PASS IN FLIGHT AT THE STOP ENDS THERE (r821 4)');
WD.section('⑦');
const STOPPED = "    const stopped = () => this._logsStopped;\n";
const NO_STOP = mutant(STOPPED, "    const stopped = () => false;   // MUTANT: the pass never sees the engine's stop\n", 'gc-no-stop');
async function atStop(mod, tag) {
  const w = world(tag, mod, { gcFilesMs: 3 * WRITER_MS });
  const f = stampOf(w, 'jb-gc00a1'); mkfifo(f);
  const pass = w.jm._gc({ now: T0 });
  const fd = await holdWriter(f);
  w.jm.shutdown();   // the hub stops while the read is out: the flush and the unlock happen now
  fs.closeSync(fd);
  await pass.catch((e) => say(`    (the pass after the stop threw: ${e && e.message})`));   // a copy that goes on may trip on the stopped engine
  return kept(w);
}
const st = await atStop(JOBS, 'stop'), stM = await atStop(NO_STOP, 'stop-m');
ok(st === 'jb-gc00a1,jb-gc00a2,jb-gc00b1,jb-gc00s1', 'the pass returns when its read answers after the stop: nothing removed, nothing saved after the unlock', st);
ok(stM === 'jb-gc00s1', 'RED CONTROL (a copy that never sees the stop): the pass goes on after the stop and removes all three', stM);
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 5, label: 'B-360d ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say('⑧ CENSUS — the pass\'s body');
WD.section('⑧');
{
  const a = JSRC.indexOf('  async _gc({ now: at = now() } = {}) {'), b = JSRC.indexOf('\n  // ── data/job-logs: THE REMOVER', a);
  const bodyText = a > 0 && b > a ? JSRC.slice(a, b) : '';
  const sync = (bodyText.match(/\bfs\.[a-zA-Z]+Sync\(|this\._readStamp\(/g) || []);
  ok(bodyText.length > 500 && sync.length === 0, `the collection pass's body holds ${sync.length} synchronous file call(s) (${bodyText.length} characters read)`, sync);
  const rec = bodyText.indexOf("'pid.json'"), spill = bodyText.indexOf("'job-notifications-read'");
  ok(rec > 0 && spill > rec, 'the records\' stamps are asked before the spill folder');
  const asks = (bodyText.match(/await this\._gcAsk\(/g) || []).length, guards = (bodyText.match(/if \(stopped\(\)\) return;/g) || []).length;
  ok(asks === 4 && guards === asks, `after each of the pass's ${asks} asks, a stopped engine returns (${guards} guards)`);
  ok(bodyText.includes("_gcSpillFrom") && bodyText.includes(ANSWERED.trim()), 'the spill walk starts after the last file it reached too; «not there» alone is a reply');
}
say(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);
