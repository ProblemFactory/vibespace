#!/usr/bin/env node
// THE JOBS' COLLECTION PASS ASKS ITS FILES OFF THE LOOP (B-360d, lane bl-keys-misc — the coordinator's r707). On the owner's hub
// (2.369.413, 878 jobs, the data folder on a network mount) the hourly collection pass (src/jobs.js _gc) held the main loop twice in
// 2.5 h, 1.2 and 1.4 s, at the stamp read — a synchronous open of each job's pid.json, blocked on the mount. THE LAW: no
// synchronous file call of that pass on the hub's loop; each ask off it (fs.promises), ONE at a time — a read that has not come back
// is never started again beside itself — the pass bounded by GC_FILES_MS; an ask that does not answer is UNKNOWN, and the pass
// collects nothing on an unknown (never a guess). The stamp decides only for a record the pass would collect: only those are read.
//   ① THE HOLD PLACED, NEVER ANSWERED: a candidate's pid.json is a FIFO with no writer (the open never returns — no mount needed):
//      the loop keeps turning inside the bound, the pass ends at its budget, that record and the one after it are UNKNOWN (kept), the
//      one before it is collected, said once; a non-candidate's FIFO stamp is never asked; the spill folder's old file goes
//   ② ONE READ IN FLIGHT: a pass while that read is out asks nothing; once the read answers, the next pass collects both
//   ③ RED CONTROL — the release's read (a copy): the same FIFO answered after 400 ms by a writer holds the release's loop that long;
//      this tree's loop does not stop
//   ④ CENSUS: no synchronous file call left in the pass's body
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
// THE SHARED WATCHDOG (scripts/suite-watchdog.mjs): fires before the gate's budget (capped at 30 s), names the leg it was in (each
// leg's own header, or WD.section) and its last line, then ends the suite. An engine arms timers, so the suite ends by process.exit —
// and NO read is left parked on a FIFO at the end (a pool thread parked in an open holds the process's exit: every FIFO is answered)
const WD = armWatchdog({ capMs: 30e3 });
const dirs = [];
process.on('exit', () => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const D = 86400e3, T0 = Date.now(), ENDED = T0 - 20 * D;
const policy = { doneAfterHours: 0, failedAfterDays: 7 };   // «never archive»: the records reach the collection pass
const acc = { view: 'session', control: 'session' };
const task = (id, state = 'done') => ({ id, kind: 'task', name: id, state, owner: {}, access: acc, runs: [{ startedAt: ENDED, endedAt: ENDED + 1000, exit: 0 }], createdAt: ENDED });
const mkfifo = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const r = spawnSync('mkfifo', [f]); if (r.status !== 0) throw new Error(`mkfifo ${f}: ${String(r.stderr || r.error || '').trim()}`); };
const ctl = (dir, id) => path.join(dir, 'job-logs', id, String(ENDED));
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
// the loop's turns while `fn` runs: the longest gap between two 5 ms ticks
async function loopGap(fn) {
  let last = Date.now(), max = 0;
  const t = setInterval(() => { const n = Date.now(); max = Math.max(max, n - last); last = n; }, 5);
  const t0 = Date.now();
  try { await fn(); } finally { clearInterval(t); }
  max = Math.max(max, Date.now() - last);
  return { max, took: Date.now() - t0 };
}
const freeFifo = (f) => { try { const fd = fs.openSync(f, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.closeSync(fd); return true; } catch { return false; } };   // the parked reader gets its end of file
// THE BOUNDS ARE THE MECHANISM'S OWN (scripts/wall-clock-census.mjs): the pass's budget handed to the product, and the release's hold
// measured in the same run — never a literal number of ms
const A_BUDGET_MS = 300, WRITER_MS = 400;

const JOBS = require(path.join(ROOT, 'src/jobs.js'));
say('① THE HOLD PLACED, NEVER ANSWERED (a FIFO no one writes)');
WD.section('①');
const A = world('a', JOBS, { gcFilesMs: A_BUDGET_MS });
const fifoB = path.join(ctl(A.dir, 'jb-gc00b1'), 'pid.json'), fifoS = path.join(ctl(A.dir, 'jb-gc00s1'), 'pid.json');
mkfifo(fifoB); mkfifo(fifoS);
const g1 = await loopGap(() => A.jm._gc({ now: T0 }));
const said = A.logs.filter((l) => /the collection pass: \d+ file read\(s\) did not answer in time/.test(l));
ok(g1.max < A_BUDGET_MS && g1.took < 3 * A_BUDGET_MS, `the loop keeps turning while a stamp's open never returns: its longest gap ${g1.max} ms, under the pass's whole budget (${A_BUDGET_MS} ms — a held loop would wait at least that), and the pass ended in ${g1.took} ms`);
ok(!A.jm.jobs.has('jb-gc00a1') && A.jm.jobs.has('jb-gc00b1') && A.jm.jobs.has('jb-gc00a2') && A.jm.jobs.has('jb-gc00s1'),
  'the record before it is collected; it and the one after it are UNKNOWN — kept (nothing collected on an unknown); the down service is no candidate',
  [...A.jm.jobs.keys()]);
ok(said.length === 1 && /: 2 file read\(s\)/.test(said[0]), `said once, counting the two unknowns — the non-candidate's FIFO stamp was never asked: «${(said[0] || '').slice(0, 160)}»`);
ok(!fs.existsSync(path.join(A.spill, 'old.json')) && fs.existsSync(path.join(A.spill, 'young.json')), 'the spill folder\'s 20-day-old file goes, the young one stays (asked off the loop)');

say('② ONE READ IN FLIGHT');
WD.section('②');
const out1 = A.jm._gcOut;
await A.jm._gc({ now: T0 });
ok(!!out1 && A.jm._gcOut === out1 && A.jm.jobs.has('jb-gc00b1') && A.jm.jobs.has('jb-gc00a2'), 'a pass while that read is out asks nothing — no second read beside it (the same read still holds the slot; both records kept)');
ok(A.logs.filter((l) => /the collection pass:/.test(l)).length === 1, 'and it is not said again');
ok(freeFifo(fifoB), 'the FIFO\'s writer comes (its parked reader is answered)');
for (let i = 0; i < 200 && A.jm._gcOut; i++) await new Promise((r) => setTimeout(r, 10));
ok(!A.jm._gcOut, 'the slot frees when the read answers — never before');
fs.unlinkSync(fifoB);   // the stamp is gone now (an open of the FIFO again would park a new read: never left behind)
await A.jm._gc({ now: T0 });
ok(!A.jm.jobs.has('jb-gc00b1') && !A.jm.jobs.has('jb-gc00a2') && A.jm.jobs.has('jb-gc00s1'), 'the next pass asks again and collects both (an empty stamp is no live work)', [...A.jm.jobs.keys()]);
fs.unlinkSync(fifoS);   // never opened by a reader: nothing parked on it
A.jm.shutdown();

// ③ RED CONTROL — the release's read, in a copy: the stamp read synchronously on the loop. A writer answers the FIFO after 400 ms
// (a child, started and ready before the pass), so the release's loop is held that long and comes back; this tree's is not held
say('③ RED CONTROL — the release\'s read (a copy) against the same FIFO, answered after 400 ms');
WD.section('③');
const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8');
const ANCHOR = "      const got = await this._gcAsk(() => fs.promises.readFile(path.join(this._ctlDir(job, run.startedAt), 'pid.json'), 'utf-8'), until);\n";
ok(JSRC.split(ANCHOR).length === 2, 'control setup: the pass reads its stamp on one line');
const MJ = mutantCopies('jobs-gc-offloop', ROOT);
const REL = MJ.load('src/jobs.js', anchored(JSRC, ANCHOR, "      const got = { v: (() => { try { return fs.readFileSync(path.join(this._ctlDir(job, run.startedAt), 'pid.json'), 'utf-8'); } catch { return null; } })() };   // MUTANT: the release's read — synchronous, on the loop\n", 'gc-release-read'));
async function delayed(mod, tag) {
  const w = world(tag, mod, { gcFilesMs: 3000 });
  const f = path.join(ctl(w.dir, 'jb-gc00a1'), 'pid.json'); mkfifo(f);
  const writer = spawn(process.execPath, ['-e', `process.stdout.write('ready\\n'); setTimeout(() => { const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(f)}, 'w'); fs.closeSync(fd); }, ${WRITER_MS});`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r, j) => { writer.stdout.once('data', r); writer.once('error', j); });
  const g = await loopGap(() => w.jm._gc({ now: T0 }));
  await new Promise((r) => (writer.exitCode != null ? r() : writer.once('exit', r)));
  const gone = !w.jm.jobs.has('jb-gc00a1');
  w.jm.shutdown();
  return { ...g, gone };
}
const rel = await delayed(REL, 'rel'), mine = await delayed(JOBS, 'mine');
ok(rel.max >= WRITER_MS * 0.8, `CONTROL (the release's read, in a copy): the loop is HELD while the open waits — its longest gap ${rel.max} ms (the writer answered at ${WRITER_MS} ms)`);
ok(mine.max < rel.max / 4 && mine.gone && rel.gone, `this tree, the same FIFO: the longest gap ${mine.max} ms, under a quarter of the release's ${rel.max} ms measured in this run; both collect the record once the read answers`);
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 1, label: 'B-360d ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say('④ CENSUS — no synchronous file call left in the pass\'s body');
WD.section('④');
{
  const a = JSRC.indexOf('  async _gc({ now: at = now() } = {}) {'), b = JSRC.indexOf('\n  // ── data/job-logs: THE REMOVER', a);
  const bodyText = a > 0 && b > a ? JSRC.slice(a, b) : '';
  const sync = (bodyText.match(/\bfs\.[a-zA-Z]+Sync\(|this\._readStamp\(/g) || []);
  ok(bodyText.length > 500 && sync.length === 0, `the collection pass's body holds ${sync.length} synchronous file call(s) (${bodyText.length} characters read)`, sync);
}
say(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);
