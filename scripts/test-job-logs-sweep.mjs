#!/usr/bin/env node
// test-job-logs-sweep — lane job-logs-sweep (2026-11-12, found by the data-move rehearsal): A RUN THE HUB FORGOT STILL OWNED
// A DIRECTORY FOR EVER. A job's record keeps its last 20 runs (src/jobs.js _spawn); the directory of a run it drops stayed in
// data/job-logs/<id>/<runTs>/ for ever — the 14-day gc ages a TASK, and a scheduled job fires ONE child task for ever (the
// owner's hub: 123 523 entries, 16 696 run dirs past the retention that no record lists). THE LAW (src/job-logs-sweep.js):
// what no record lists leaves 14 days after its newest file; never a live run, never a listed one; paced, said twice; every
// removal under job-logs off the main thread (the remover's worker). FAST: the real JobManager, the real cron fire road and
// the real data/bin/job-wrapper.js in a scratch dir, seeded trees for the catch-up. Each pin is red on the release by name.
//   P1 a cron fired 30× · P2 a dropped run alive past the retention · P3 a job removed with a run alive · P4 the catch-up
//   over 5 000 seeded dropped runs (paced, off the loop, said twice) · P5 a restart in the middle · the rules (age = newest
//   file, skeleton, reap-held, archive) · the five removers through the worker (the ✕ answered after the disk) · the PURE
//   verdict + its mutant copies · the static census of jobs.js.
process.env.VIBESPACE_JOBS_GRACE_MS = '1000';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
let LS = null; try { LS = require(path.join(ROOT, 'src/job-logs-sweep.js')); } catch { /* the release: no remover — its legs are red by name */ }

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 10) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(step); } return false; };
const DAY = 864e5;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jls-'));
const engines = [], kids = [];
const caller = { conversationId: 'conv-L', sessionId: 'sess-L', sessionCreatedAt: 1, groups: new Set(['T-l']) };
const owner = { conversation: { backend: 'claude', id: 'conv-L' }, sessionId: 'sess-L', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: ['T-l'] };
const mkDir = (name) => { const dir = path.join(tmp, name); fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), path.join(dir, 'bin', 'job-wrapper.js')); return dir; };
const boot = (dir, sweep = {}, extra = {}) => {
  const logs = [], items = [];
  const jm = new JobManager({ dataDir: dir, broadcast() { }, notifyUser(n) { items.push(n); return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), memoryRungs: [], logsSweep: { bootDelayMs: 3600e3, restFactor: 1, ...sweep }, ...extra });   // restFactor 1: the suite's pace (the product rests 10× a pass — §P pins it)
  jm.init(); engines.push(jm);
  return { jm, logs, items };
};
const settle = async (jm) => { if (typeof jm.logsSettled === 'function') await jm.logsSettled(); };
// THE LAW's pass at a clock (the release has none: its hourly gc, which removes no dropped run, stands in — red by name)
const sweepAt = async (jm, at) => { if (typeof jm.sweepLogs === 'function') await jm.sweepLogs({ now: at }); else await jm._gc({ now: at }); await settle(jm); };
const gcAt = async (jm, at) => { await jm._gc({ now: at }); await settle(jm); };   // THE HOURLY ROAD with its clock
const T0 = Date.now(); const lap = (name) => console.log(`${name}  (+${Date.now() - T0} ms)`);
// A SLOW STORAGE (the owner's data/ is a network mount): the REAL worker, every rmSync made to cost SLOW_MS on the thread that
// calls it — the worker's thread in the product's shape, the main thread in the control's
const SLOW_MS = 0.2;
const slowWorker = path.join(tmp, 'slow-storage-worker.cjs');
fs.writeFileSync(slowWorker, `const fs = require('fs'); const rm = fs.rmSync; fs.rmSync = function (...a) { const t = performance.now() + ${SLOW_MS}; while (performance.now() < t) { } return rm.apply(this, a); };\nrequire(${JSON.stringify(path.join(ROOT, 'src/job-logs-sweep-worker.js'))});\n`);
const runsOn = (dir, id) => { try { return fs.readdirSync(path.join(dir, 'job-logs', id)).filter((n) => /^\d+$/.test(n)).sort((a, b) => a - b); } catch { return []; } };
const has = (...p) => fs.existsSync(path.join(...p));
const stampOf = (pid) => { const id = PI.identityOf(pid); return { ...id, argvHash: 'x', startedAt: Date.now() }; };
const deadStamp = () => ({ pid: 4194301, starttime: 1, bootId: 'another-boot-of-this-machine', startedAt: 1 });   // no process: another boot
const seedRun = (dir, id, ts, { stamp = deadStamp(), ageMs = null, files = ['current.log'] } = {}) => {
  const d = path.join(dir, 'job-logs', id, String(ts)); fs.mkdirSync(d, { recursive: true });
  if (stamp) fs.writeFileSync(path.join(d, 'pid.json'), JSON.stringify(stamp));
  for (const f of files) fs.writeFileSync(path.join(d, f), 'line\n');
  if (ageMs != null) { const t = (Date.now() - ageMs) / 1000; for (const f of fs.readdirSync(d)) fs.utimesSync(path.join(d, f), t, t); }
  return d;
};
const wrapperOf = (dir, id, ts) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'job-logs', id, String(ts), 'pid.json'), 'utf8')); } catch { return null; } };
/** end a run's wrapper and its group — only after its cmdline names THIS scratch dir's wrapper (never a pid taken on trust) */
const endWrapper = (stamp, ctl) => {
  let cmd = ''; try { cmd = fs.readFileSync(`/proc/${stamp.pid}/cmdline`, 'utf8'); } catch { return false; }
  if (!(stamp.pid > 1 && cmd.includes('job-wrapper.js') && cmd.includes(ctl) && PI.aliveIdentity(stamp) === true)) return false;
  try { process.kill(-stamp.pid, 'SIGKILL'); } catch { try { process.kill(stamp.pid, 'SIGKILL'); } catch { } }
  return true;
};

try {
  // ── §A THE PURE VERDICT (src/job-logs-sweep.js runVerdict) ────────────────────────────────────────────────────────────
  lap('§A the verdict');
  ok(!!LS && typeof LS.runVerdict === 'function', 'src/job-logs-sweep.js: THE verdict over a run directory exists');
  const ROWS = [
    [{ listed: true, startMs: 1, newestMs: 1, alive: false }, 'listed', 'a run a record lists stays, however old'],
    [{ held: true, startMs: 1, newestMs: 1, alive: false }, 'held', 'a run the hub holds work for (a scope reap) stays'],
    [{ skeleton: true, startMs: 1, newestMs: 1, alive: false }, 'skeleton', 'a skeleton record\'s dir stays (its runs [] were never its runs)'],
    [{ startMs: 200, newestMs: 1, alive: false }, 'young', 'a run that STARTED after the cutoff is young by its name'],
    [{ startMs: 1, newestMs: 150, alive: false }, 'young', 'a run that started long ago but wrote within the retention is young (its NEWEST file is its age)'],
    [{ startMs: 1, newestMs: 1, alive: true }, 'alive', 'a run whose wrapper lives stays'],
    [{ startMs: 1, newestMs: 1, alive: null }, 'unproven', 'a stamp that cannot be judged keeps its run'],
    [{ startMs: 1, newestMs: 1, alive: false }, 'remove', 'unlisted, past the retention by its newest file, its wrapper gone ⇒ removed'],
  ];
  const table = (V) => ROWS.map(([r, want]) => V({ cutoff: 100, ...r }) === want);
  if (LS) ROWS.forEach(([, want, name], i) => ok(table(LS.runVerdict)[i], `verdict: ${name} (${want})`));
  if (LS) {
    let thunks = 0; LS.runVerdict({ cutoff: 100, startMs: 200, newestMs: () => { thunks++; return 1; }, alive: () => { thunks++; return false; } });
    LS.runVerdict({ cutoff: 100, listed: true, startMs: 1, newestMs: () => { thunks++; return 1; }, alive: () => { thunks++; return false; } });
    ok(thunks === 0, 'the verdict reads no disk and no /proc for a run its name or its record already decides');
    // MUTANT COPIES: the module text patched, compiled at a scratch path, the same table RED
    const src = fs.readFileSync(path.join(ROOT, 'src/job-logs-sweep.js'), 'utf8');
    const mutant = (label, from, to) => {
      ok(src.includes(from), `mutant «${label}»: its anchor is in the module`);
      const f = path.join(tmp, `mut-${label.replace(/\W+/g, '-')}.cjs`); fs.writeFileSync(f, src.replace(from, to).replace(/require\('\.\//g, `require('${ROOT}/src/`));
      const V = require(f).runVerdict; ok(table(V).some((x) => !x), `CONTROL: the verdict with «${label}» fails the table`);
    };
    mutant('alive ignored', "if (alive === true) return 'alive';", '');
    mutant('age by the start', "if (!(Number(newest) < r.cutoff)) return 'young';", '');
    mutant('listed ignored', "if (r.listed) return 'listed';", '');
    mutant('unproven removed', "if (alive !== false) return 'unproven';", '');
  }

  // ── P1 A SCHEDULED JOB THAT FIRED 30 TIMES (the real fire road: ONE child reused, the real wrapper) ───────────────────
  lap('P1 a cron fired 30 times');
  const d1 = mkDir('p1'); const { jm: J1 } = boot(d1);
  const r1 = J1.create({ kind: 'cron', name: 'every-15-min', schedule: { at: Date.now() + 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['sh', '-c', 'echo fired'] } } }, owner }, caller);
  // fired in three waves of ten (the cron's singleRun off — runs may overlap, as the product allows): the real fire road, ONE
  // child reused, a real wrapper per run; each wave waited to its end, the 5 s tick asked now
  const cron = J1.jobs.get(r1.job.id); cron.schedule = { everyMs: 900e3 }; cron.singleRun = false;
  let child = null; const fired = [];
  for (let wave = 0; wave < 3; wave++) {
    const these = [];
    for (let i = 0; i < 10; i++) {
      const t = Date.now(); while (Date.now() === t || fired.includes(Date.now())) await sleep(1);
      J1._fireCron(cron, 'cron');
      child = child || [...J1.jobs.values()].find((x) => x.cronParent === cron.id);
      const run = child.runs[child.runs.length - 1]; fired.push(run.startedAt); these.push(run.startedAt);
    }
    await until(() => these.every((ts) => has(d1, 'job-logs', child.id, String(ts), 'exit.json')), 15000, 5);
    await until(() => !J1._verifyAlive(J1._readStamp(child)), 5000, 5);
    await J1._sweep();
  }
  const listed1 = child.runs.map((r) => String(r.startedAt)), dropped1 = fired.slice(0, 10).map(String);
  ok(child.runs.length === 20 && runsOn(d1, child.id).length === 30 && dropped1.every((t) => !listed1.includes(t)), 'the child holds its last 20 runs; 30 run dirs on disk (10 dropped by the record)', `${child.runs.length} listed, ${runsOn(d1, child.id).length} on disk`);
  await sweepAt(J1, Date.now());
  ok(runsOn(d1, child.id).length === 30, 'inside the retention nothing is removed (a dropped run is kept 14 days)');
  await sweepAt(J1, Date.now() + 15 * DAY);
  const left1 = runsOn(d1, child.id);
  ok(dropped1.every((t) => !left1.includes(t)), 'past the retention the 10 runs the record dropped are GONE', `${left1.filter((t) => dropped1.includes(t)).length} of 10 still on disk`);
  ok(listed1.every((t) => left1.includes(t)), 'the 20 runs the record lists stay');
  ok(/fired/.test(J1.snapshot(child, { tail: 5 }).logTail || ''), 'the job\'s page still serves its last run\'s log');

  // ── P2 A DROPPED RUN STILL ALIVE PAST THE RETENTION ────────────────────────────────────────────────────────────────────
  lap('P2 a dropped run alive past the retention');
  const live = spawn('sleep', ['60'], { stdio: 'ignore' }); kids.push(live);
  await until(() => PI.identityOf(live.pid) != null, 3000);
  const liveTs = fired[0] - 5000, liveDir = seedRun(d1, child.id, liveTs, { stamp: stampOf(live.pid) });
  const badTs = fired[0] - 6000, badDir = seedRun(d1, child.id, badTs, { stamp: null }); fs.writeFileSync(path.join(badDir, 'pid.json'), '{"pid": 12');
  await sweepAt(J1, Date.now() + 15 * DAY);
  ok(has(liveDir), 'a run no record lists whose wrapper LIVES stays past the retention');
  ok(has(badDir), 'a run whose stamp cannot be read stays (it cannot be proven gone)');
  live.kill('SIGKILL'); await until(() => PI.aliveIdentity(stampOf(live.pid) || { pid: live.pid, starttime: -1 }) !== true, 3000);
  await sleep(50);
  await sweepAt(J1, Date.now() + 15 * DAY);
  ok(!has(liveDir), '…and goes once its process has ended');

  // ── P3 A JOB REMOVED WITH A RUN ALIVE ──────────────────────────────────────────────────────────────────────────────────
  lap('P3 a job removed with a run alive');
  const r3 = J1.create({ kind: 'task', name: 'long-one', cmd: { argv: ['sleep', '60'] }, owner }, caller);
  const j3 = J1.jobs.get(r3.job.id);
  await until(() => j3.runs && j3.runs.length && J1._verifyAlive(J1._readStamp(j3)), 10000);
  const ts3 = j3.runs[0].startedAt, ctl3 = path.join(d1, 'job-logs', j3.id, String(ts3));
  ok(J1.rm(j3, { orphan: true }).ok && !J1.jobs.has(j3.id), 'rm --orphan: the record is gone while its run lives');
  await sweepAt(J1, Date.now() + 15 * DAY);
  ok(has(ctl3), 'the removed job\'s live run dir stays past the retention');
  const w3 = wrapperOf(d1, j3.id, ts3);
  ok(w3 && endWrapper(w3, ctl3), 'its wrapper ended (cmdline checked: this scratch dir\'s job-wrapper.js)');
  await until(() => PI.aliveIdentity(w3) !== true, 5000); await sleep(50);
  await sweepAt(J1, Date.now() + 15 * DAY);
  ok(!has(ctl3) && !has(d1, 'job-logs', j3.id), '…once it ended: past the retention its run dir AND the job dir no record names are gone');

  // ── THE RULES ON DISK ──────────────────────────────────────────────────────────────────────────────────────────────────
  lap('§R the rules on disk');
  const longTs = Date.now() - 20 * DAY, longDir = seedRun(d1, child.id, longTs, { ageMs: 2 * DAY });
  const oldTs = Date.now() - 21 * DAY, oldDir = seedRun(d1, child.id, oldTs, { ageMs: 20 * DAY });
  const emptyTs = Date.now() - 22 * DAY, emptyDir = path.join(d1, 'job-logs', child.id, String(emptyTs)); fs.mkdirSync(emptyDir);
  const heldTs = Date.now() - 23 * DAY, heldDir = seedRun(d1, child.id, heldTs, { ageMs: 23 * DAY });
  J1._reapLater.set({ startedAt: heldTs }, { job: child, tries: 0 });
  fs.mkdirSync(path.join(d1, 'job-logs', child.id, 'notes'), { recursive: true });
  await sweepAt(J1, Date.now());
  ok(has(longDir), 'a run that started 20 days ago but wrote 2 days ago stays (its age is its newest file — the owner\'s 10 long runs)');
  ok(!has(oldDir) && !has(emptyDir), 'a dropped run whose newest file is 20 days old goes; an EMPTY run dir is aged by its start');
  ok(has(heldDir), 'a dropped run the hub holds a reap for stays');
  ok(has(d1, 'job-logs', child.id, 'notes'), 'an entry of another name in a job dir is never the sweep\'s');
  const svc = 'jb-5e7f1ce0'; J1.jobs.set(svc, { id: svc, kind: 'service', name: 'a-service', state: 'up', desiredUp: true, owner, access: { view: 'all', control: 'session' }, runs: [{ startedAt: Date.now() - 3 * DAY }] });
  const svcDropped = seedRun(d1, svc, Date.now() - 30 * DAY, { ageMs: 25 * DAY }), svcListed = seedRun(d1, svc, Date.now() - 3 * DAY, { stamp: null });
  await gcAt(J1, Date.now());
  ok(!has(svcDropped) && has(svcListed) && J1.jobs.has(svc), 'THE HOURLY ROAD (the real clock): the gc runs the law\'s pass — a service\'s run its record dropped 25 days ago is gone, its listed run and its record stay');

  // ── THE FIVE REMOVERS: their verdicts theirs, the removal off the main thread ─────────────────────────────────────────
  lap('§W the removers through the worker');
  const arcId = 'jb-a1c0ffee';
  J1.archive = [{ id: arcId, kind: 'task', name: 'archived-one', state: 'done', owner, access: { view: 'all', control: 'session' }, runs: [{ startedAt: Date.now() - 2 * DAY, endedAt: Date.now() - 2 * DAY }], archivedAt: Date.now() - DAY, archivedWhy: 'done' }, ...(J1.archive || [])];
  J1._writeArchive(J1.archive);
  const arcRun = seedRun(d1, arcId, Date.now() - 2 * DAY);
  const rmA = J1.rmArchived(arcId);
  const stillThere = has(arcRun);
  ok(rmA.ok && stillThere, 'the ✕ answers its record\'s removal with the dir still there — no removal on the main thread', `ok=${rmA.ok} there=${stillThere}`);
  ok(typeof J1.logsGone === 'function' && (await J1.logsGone(arcId)) === true && !has(d1, 'job-logs', arcId), '…and logsGone() resolves once the remover\'s worker has removed it (the routes answer the person then)');
  // a whole-dir verdict never takes a live run: the gc's leg (a) over a done task past 14 days with a live stray run
  const gcT = 'jb-9c0de0aa', live2 = spawn('sleep', ['60'], { stdio: 'ignore' }); kids.push(live2);
  await until(() => PI.identityOf(live2.pid) != null, 3000);
  J1.jobs.set(gcT, { id: gcT, kind: 'task', name: 'done-long-ago', state: 'done', owner, access: { view: 'all', control: 'session' }, runs: [{ startedAt: Date.now() - 30 * DAY, endedAt: Date.now() - 30 * DAY, exit: 0 }] });
  const gcDead = seedRun(d1, gcT, Date.now() - 30 * DAY), gcLive = seedRun(d1, gcT, Date.now() - 40 * DAY, { stamp: stampOf(live2.pid) });
  await gcAt(J1, Date.now());
  ok(!J1.jobs.has(gcT) && !has(gcDead) && has(gcLive), 'the gc\'s leg (a): record gone, its finished run removed by the worker, a run whose wrapper lives kept');
  live2.kill('SIGKILL'); await until(() => PI.aliveIdentity(stampOf(live2.pid) || { pid: live2.pid, starttime: -1 }) !== true, 3000); await sleep(50);
  await sweepAt(J1, Date.now() + 15 * DAY);
  ok(!has(gcLive) && !has(d1, 'job-logs', gcT), 'WHO REMOVES WHAT A WHOLE-DIR VERDICT LEFT: the law\'s pass — once that run ended and its newest file aged past the retention, its dir and the job dir no record names are gone');
  // a whole-dir removal the storage did not take (HELD) is owed: re-sent before the next pass
  if (typeof J1._logsRemover === 'function') {
  const realRm = J1._logsRemover(), arc3 = 'jb-a3c0ffee';
  J1._writeArchive([{ id: arc3, kind: 'task', name: 'archived-three', state: 'done', owner, access: { view: 'all', control: 'session' }, runs: [{ startedAt: Date.now() - DAY, endedAt: Date.now() - DAY }], archivedAt: Date.now(), archivedWhy: 'done' }]);
  const arc3Run = seedRun(d1, arc3, Date.now() - DAY);
  J1._logsRm = { whole: async () => ({ error: 'held', held: true, gone: [] }), sweep: (...a) => realRm.sweep(...a), settled: () => realRm.settled(), busy: () => realRm.busy(), held: () => true, stop() { } };
  J1.rmArchived(arc3); const gone3 = await J1.logsGone(arc3);
  ok(gone3 === false && has(arc3Run) && J1._logsOwed && J1._logsOwed.has(arc3), 'a ✕ the remover could not do (HELD): answered false (the routes say logsPending), its dir owed');
  J1._logsRm = realRm; await sweepAt(J1, Date.now());
  ok(!has(d1, 'job-logs', arc3) && !J1._logsOwed.has(arc3), '…and the next pass re-sends it first: gone, nothing owed');
  } else ok(false, 'a ✕ the remover could not do is owed and re-sent (no remover on this tree)');
  // the ARCHIVE the hub has not loaded is read by the worker (never _loadArchive's synchronous read on the main thread)
  const arc2 = 'jb-a2c0ffee', arc2Ts = Date.now() - 20 * DAY;
  fs.writeFileSync(path.join(d1, 'jobs-archive.json'), JSON.stringify([{ id: arc2, kind: 'task', name: 'archived-two', state: 'done', owner, access: { view: 'all', control: 'session' }, runs: [{ startedAt: arc2Ts, endedAt: arc2Ts + 1000 }], archivedAt: Date.now() - DAY, archivedWhy: 'done' }]));
  const arc2Run = seedRun(d1, arc2, arc2Ts, { ageMs: 20 * DAY }), arc2Dropped = seedRun(d1, arc2, arc2Ts - DAY, { ageMs: 21 * DAY });
  J1.archive = null;
  await sweepAt(J1, Date.now());
  ok(J1.archive === null && has(arc2Run) && !has(arc2Dropped), 'an archive the hub has not loaded is read in the worker: its listed run stays, its dropped run goes — and the main thread loaded nothing');
  fs.writeFileSync(path.join(d1, 'jobs-archive.json'), '[{ torn');
  const orphanOld = seedRun(d1, 'jb-0e1a0001', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
  await sweepAt(J1, Date.now());
  ok(has(orphanOld), 'an archive that cannot be read removes NOTHING (a record it names could be lost) — the pass fails and says so');
  fs.writeFileSync(path.join(d1, 'jobs-archive.json'), '[]');
  // A WEDGED THREAD: a storage that never answers (a FIFO's open never returns) — the batch times out, no second thread is
  // started beside it, the remover is HELD (said once), and goes on once the thread has ended
  if (LS) {
    const fifo = path.join(tmp, 'wedge.fifo'), mark = path.join(tmp, 'wedge.released'); execFileSync('mkfifo', [fifo]);
    const hang = path.join(tmp, 'wedged-worker.cjs');
    fs.writeFileSync(hang, `const fs = require('fs'); const { parentPort } = require('worker_threads');\nparentPort.on('message', (m) => { if (!fs.existsSync(${JSON.stringify(mark)})) fs.readFileSync(${JSON.stringify(fifo)}); parentPort.postMessage({ seq: m.seq, removed: 0, entries: 0, more: false }); });\n`);
    let started = 0; const { Worker } = await import('node:worker_threads');
    class Counted extends Worker { constructor(...a) { super(...a); started++; } }
    const said = [], R = LS.createRemover({ logsDir: path.join(tmp, 'nowhere'), log: (l) => said.push(l), timeoutMs: 150, wedgedMs: 300, workerPath: hang, WorkerImpl: Counted });
    const a1 = await R.sweep({ keep: {}, cutoff: 0, max: 1 });
    const a2 = await R.sweep({ keep: {}, cutoff: 0, max: 1 });
    ok(a1.error && !a1.held && a2.held && started === 1 && R.held(), `a sweep past its timeout answers its timeout (never repeated); its thread cannot end ⇒ HELD — the next batch answers at once and NO second thread is started (${started} started)`);
    ok(said.filter((l) => /HELD/.test(l)).length === 1, 'the hold is said ONCE', said);
    fs.writeFileSync(mark, '1'); { const fd = fs.openSync(fifo, 'w'); fs.closeSync(fd); }
    await until(() => !R.held(), 5000);
    const a3 = await R.sweep({ keep: {}, cutoff: 0, max: 1 });
    ok(!R.held() && !a3.error && started === 2 && said.some((l) => /has ended — removals go on/.test(l)), 'once the wedged thread ends the remover goes on (a new thread answers), and says so');
    R.stop();
  } else ok(false, 'a wedged thread holds the remover (no remover on this tree)');

  // ── THE STATIC CENSUS OF jobs.js ───────────────────────────────────────────────────────────────────────────────────────
  lap('§S static');
  const JS = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(!/\bfs\.(rmSync|rmdirSync|unlinkSync|promises\.rm)\([^)]*logsDir/.test(JS) && !/rmSync\(/.test(JS), 'jobs.js removes nothing under job-logs itself (no rmSync left): every removal is the remover\'s');
  const wholeSites = (JS.replace(/async _logsPass\([\s\S]*?\n  \}\n/, '').match(/this\._logsWhole\(/g) || []).length;   // the pass's own re-send of what is owed is not a verdict
  ok(wholeSites === 4, 'the whole-dir verdicts reach the remover at exactly four sites (the gc\'s two legs, the archive cap, the ✕, the boot collapse)', wholeSites);
  const WW = fs.readFileSync(path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8'), AR = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), CLI = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf8'), PANEL = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8');
  ok(/jm\.logsGone\(rec\.id\)\.then\(\(gone\) => res\.json\(\{ success: true, \.\.\.r, \.\.\.\(gone \? \{\} : \{ logsPending: true \}\) \}\)\)/.test(WW) && /a\.jm\.logsGone\(arc\.id\)\.then\(\(gone\) => res\.json\(\{ success: true, \.\.\.r, \.\.\.\(gone \? \{\} : \{ logsPending: true \}\) \}\)\)/.test(AR), 'both ✕ routes (the owner\'s and the agent\'s) answer after logsGone, `logsPending` past its bound');
  ok(/if \(rmAns && rmAns\.logsPending\) \{[^\n]*\n\s*console\.log\('removed — its log files are still being deleted in the background'\);\n\s*\} else console\.log\('removed'\);/.test(CLI) && /act === 'rm' && r\?\.logsPending\) showToast\(t\('Removed\. Its log files are still being deleted in the background\.'\)\)/.test(PANEL), 'what the person reads past the bound: the panel\'s toast «Removed. Its log files are still being deleted in the background.», the CLI\'s «removed — its log files are still being deleted in the background»');
  ok(!/_loadArchive\(/.test((JS.match(/async _logsPass\([\s\S]*?\n  \}\n/) || [''])[0]) && /async _logsPass\(/.test(JS), 'the pass never calls _loadArchive (its synchronous read): the archive from memory, or the worker reads it');
  const WK = (() => { try { return fs.readFileSync(path.join(ROOT, 'src/job-logs-sweep-worker.js'), 'utf8'); } catch { return ''; } })();
  ok(/if \(isMainThread\) throw/.test(WK) && /lstatSync/.test(WK) && !/statSync\(/.test(WK.replace(/lstatSync/g, '')), 'the worker throws on the main thread and calls no stat that follows a link (that a link is never FOLLOWED is §G\'s legs, driven)');


  // ── §G THE GUARDS, EACH DRIVEN (round 2 §2: nine mutants left the suite green while a deletion changed) ───────────────
  lap('§G the guards');
  if (LS) {
    const g = path.join(tmp, 'guards'), GL = path.join(g, 'job-logs'), out = path.join(tmp, 'outside');
    fs.mkdirSync(GL, { recursive: true }); fs.mkdirSync(out, { recursive: true });
    const OLD = Date.now() - 40 * DAY, age = (p, ms) => { const t = (Date.now() - ms) / 1000; fs.utimesSync(p, t, t); };
    const canary = (name) => { const c = path.join(out, name), r = path.join(c, String(OLD)); fs.mkdirSync(r, { recursive: true }); fs.writeFileSync(path.join(r, 'pid.json'), JSON.stringify(deadStamp())); fs.writeFileSync(path.join(c, 'person.txt'), 'mine'); for (const f of [path.join(r, 'pid.json'), path.join(c, 'person.txt')]) age(f, 40 * DAY); return c; };
    const intact = (c) => has(c, 'person.txt') && has(c, String(OLD), 'pid.json');
    const seedAt = (dir, files = { 'pid.json': JSON.stringify(deadStamp()), 'current.log': 'x\n' }) => { fs.mkdirSync(dir, { recursive: true }); for (const [f, b] of Object.entries(files)) { fs.writeFileSync(path.join(dir, f), b); age(path.join(dir, f), 30 * DAY); } return dir; };
    const R = LS.createRemover({ logsDir: GL });
    // 1. links: a linked job dir under the sweep; a linked run dir inside an unnamed job dir — the canaries outside stay whole
    const c1 = canary('c1'), c2 = canary('c2');
    fs.symlinkSync(c1, path.join(GL, 'jb-11110001'));
    fs.mkdirSync(path.join(GL, 'jb-11110002')); fs.symlinkSync(path.join(c2, String(OLD)), path.join(GL, 'jb-11110002', String(OLD + 1))); { const t = (Date.now() - 30 * DAY) / 1000; fs.lutimesSync(path.join(GL, 'jb-11110002', String(OLD + 1)), t, t); }
    // 2. names that are not the sweep's, aged 30 days
    const bk = seedAt(path.join(GL, 'backup', String(OLD))); fs.mkdirSync(path.join(GL, 'lost+found')); age(path.join(GL, 'lost+found'), 30 * DAY);
    const hexRun = seedAt(path.join(GL, 'jb-11110003', '0x10')), expRun = seedAt(path.join(GL, 'jb-11110003', '1e3'));
    // 3. stamps that cannot be judged — and a dead run sorted AFTER the null stamp (a stamp of any shape never stops the walk)
    const J5 = path.join(GL, 'jb-11110005'), stampFile = path.join(out, 'dead-stamp.json'); fs.writeFileSync(stampFile, JSON.stringify(deadStamp()));
    const stDir = seedAt(path.join(J5, String(OLD + 1)), { 'current.log': 'x\n' }); fs.mkdirSync(path.join(stDir, 'pid.json')); age(path.join(stDir, 'pid.json'), 30 * DAY);
    const stLink = seedAt(path.join(J5, String(OLD + 2)), { 'current.log': 'x\n' }); fs.symlinkSync(stampFile, path.join(stLink, 'pid.json')); { const t = (Date.now() - 30 * DAY) / 1000; fs.lutimesSync(path.join(stLink, 'pid.json'), t, t); }   // old ENTRIES: only the stamp's judge decides
    const stObj = seedAt(path.join(J5, String(OLD + 3)), { 'pid.json': '{}', 'current.log': 'x\n' });
    const stNull = seedAt(path.join(J5, String(OLD + 4)), { 'pid.json': 'null', 'current.log': 'x\n' });
    const deadAfter = seedAt(path.join(J5, String(OLD + 5)));
    const stNoStart = seedAt(path.join(J5, String(OLD + 6)), { 'pid.json': JSON.stringify({ pid: process.pid }), 'current.log': 'x\n' });
    const stPid1 = seedAt(path.join(J5, String(OLD + 7)), { 'pid.json': JSON.stringify({ pid: 1 }), 'current.log': 'x\n' });
    // 4. a run whose only young file sits two levels down
    const nested = seedAt(path.join(GL, 'jb-11110006', String(OLD))); fs.mkdirSync(path.join(nested, 'a', 'b'), { recursive: true }); fs.writeFileSync(path.join(nested, 'a', 'b', 'young.txt'), 'now'); age(path.join(nested, 'a'), 30 * DAY);
    // 5. a YOUNG empty unnamed job dir (a spawn between its two mkdirs) and an old empty NAMED one
    fs.mkdirSync(path.join(GL, 'jb-11110007')); fs.mkdirSync(path.join(GL, 'jb-11110008')); age(path.join(GL, 'jb-11110008'), 30 * DAY);
    const gAns = await R.sweep({ keep: { named: ['jb-11110008'], listed: [], skeleton: [], held: [] }, cutoff: Date.now() - 14 * DAY, max: 1000 });
    ok(!gAns.error && intact(c1) && (() => { try { return fs.lstatSync(path.join(GL, 'jb-11110001')).isSymbolicLink(); } catch { return false; } })(), 'a job dir that is a LINK is never walked: the canary outside the tree is whole, the link stays');
    const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
    ok(intact(c2) && isLink(path.join(GL, 'jb-11110002', String(OLD + 1))), 'a run dir that is a LINK is never the sweep\'s: the link stays, the canary it points at is whole');
    ok(has(bk) && has(GL, 'lost+found') && has(hexRun) && has(expRun), 'names that are not the sweep\'s stay at 30 days: backup/<ts>, lost+found, 0x10 and 1e3 inside a job dir');
    ok(has(stDir) && has(stLink) && has(stObj) && has(stNull) && has(stNoStart) && has(stPid1), 'stamps that cannot be judged keep their run: a directory, a link to a dead stamp (never followed), {}, null, a pid without a start time, pid 1');
    ok(!has(deadAfter), 'a dead run sorted AFTER the null stamp is removed in the same pass (a stamp of any shape never stops the walk)');
    ok(has(nested), 'a run whose only young file is two levels down stays (its newest entry is its age, at any depth)');
    ok(has(GL, 'jb-11110007') && has(GL, 'jb-11110008'), 'a young empty unnamed job dir stays (a spawn between its mkdirs); an empty job dir a record names stays');
    // 6. whole() ALONE over a link (its own guard — a second door out of the tree) and over a job dir holding a run link
    const c3 = canary('c3'), c4 = canary('c4');
    fs.symlinkSync(c3, path.join(GL, 'jb-11110009'));
    fs.mkdirSync(path.join(GL, 'jb-1111000a')); fs.symlinkSync(path.join(c4, String(OLD)), path.join(GL, 'jb-1111000a', String(OLD)));
    const wAns = await R.whole(['jb-11110009', 'jb-1111000a']);
    ok(intact(c3) && !fs.existsSync(path.join(GL, 'jb-11110009')) && (wAns.gone || []).includes('jb-11110009'), 'whole() over a job dir that is a LINK unlinks the link alone (as the release did) — the canary outside is whole, the id is gone');
    ok(intact(c4) && !has(GL, 'jb-1111000a'), 'whole() over a job dir holding a run LINK unlinks the link alone — its target stays whole');
    R.stop();
  } else ok(false, 'the guards are driven (no remover on this tree)');


  // ── §H «NO RECORD NAMES IT» IS A FACT THE HUB HOLDS (round 2 law 1): a set-aside or unread record store holds the pass ──
  lap('§H the held fact');
  {
    const W = require(path.join(ROOT, 'src/store-writer.js'));
    const tornArchive = (dir, id, ts) => fs.writeFileSync(path.join(dir, 'jobs-archive.json'), `[{"id":"${id}","kind":"task","runs":[{"startedAt":${ts}`);
    const setAsides = (dir) => fs.readdirSync(dir).filter((n) => /\.corrupt-/.test(n));
    const heldItems = (items) => items.filter((n) => n && n.fact === 'records-held');
    // H1 THE HOURLY ROAD: the gc's own leg loads the torn archive first (the product sets it aside), then the law's pass
    const h1 = mkDir('h1'); const a1Ts = Date.now() - 20 * DAY; tornArchive(h1, 'jb-a4c0ffee', a1Ts);
    const h1Listed = seedRun(h1, 'jb-a4c0ffee', a1Ts, { ageMs: 20 * DAY }), h1Orphan = seedRun(h1, 'jb-0e1a0002', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const { jm: JH1, logs: LH1, items: IH1 } = boot(h1);
    await gcAt(JH1, Date.now()); await gcAt(JH1, Date.now());
    ok(setAsides(h1).length === 1 && has(h1Listed) && has(h1Orphan), 'THE HOURLY ROAD: the gc sets the torn archive aside, and its law\'s pass removes NOTHING (the set-aside bytes could name any run)', { setAside: setAsides(h1), listed: has(h1Listed), orphan: has(h1Orphan) });
    ok(LH1.filter((l) => /job-logs clean-up HELD: jobs-archive\.json\.corrupt-\d+ in the data dir/.test(l)).length === 1, 'the hold is said ONCE in the journal over two passes');
    ok(heldItems(IH1).length === 1 && /could not be read/.test(heldItems(IH1)[0].words.key) && /jobs-archive\.json\.corrupt-\d+$/.test(heldItems(IH1)[0].words.params.file), 'ONE For-you item, filed at the set-aside: «Job records in <file> could not be read» first, the clean-up second');
    // H2 ANY LOAD FIRST: one archive list (the panel, an agent route) before a pass
    const h2 = mkDir('h2'); tornArchive(h2, 'jb-a5c0ffee', a1Ts);
    const h2Listed = seedRun(h2, 'jb-a5c0ffee', a1Ts, { ageMs: 20 * DAY }), h2Orphan = seedRun(h2, 'jb-0e1a0003', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const { jm: JH2 } = boot(h2);
    JH2.archivedList(); await sweepAt(JH2, Date.now());
    ok(has(h2Listed) && has(h2Orphan), 'A LIST FIRST, THEN A PASS: nothing removed');
    // H3 PASS, THEN GC: the first pass refuses the torn file, the gc in the same process sets it aside — still nothing
    const h3 = mkDir('h3'); tornArchive(h3, 'jb-a6c0ffee', a1Ts);
    const h3Listed = seedRun(h3, 'jb-a6c0ffee', a1Ts, { ageMs: 20 * DAY }), h3Orphan = seedRun(h3, 'jb-0e1a0004', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const { jm: JH3 } = boot(h3);
    await sweepAt(JH3, Date.now()); const afterPass = has(h3Listed) && has(h3Orphan);
    await gcAt(JH3, Date.now());
    ok(afterPass && has(h3Listed) && has(h3Orphan) && setAsides(h3).length === 1, 'A PASS, THEN THE GC: the pass refuses the torn file, the gc sets it aside, and its pass removes nothing');
    // H4 THE STORE, ACROSS A RESTART: a torn jobs.json (a live service listing a 20-day-old run) → skeletons at boot 1 (never
    // written back) → boot 2 loads an EMPTY store; its boot pass removes nothing while the set-aside file is there; moved ⇒ resumes
    const h4 = mkDir('h4'); const s4Ts = Date.now() - 20 * DAY;
    fs.writeFileSync(path.join(h4, 'jobs.json'), `[{"id":"jb-5e7f1ce4","kind":"service","state":"up","runs":[{"startedAt":${s4Ts}},{"startedAt":${Date.now()}`);
    const h4Run = seedRun(h4, 'jb-5e7f1ce4', s4Ts, { ageMs: 20 * DAY });
    const { jm: A4, items: IA4 } = boot(h4);
    if (A4._logsStateP) await A4._logsStateP;
    await W.storeWriter().durable(path.join(h4, 'jobs-logs-sweep.json'));
    const scItems = IA4.filter((n) => n && n.fact === 'store-corrupt');
    ok(scItems.length === 1 && /old job logs are not cleaned up until that file is moved or deleted/.test(scItems[0].words.key) && /jobs\.json\.corrupt-\d+$/.test(scItems[0].words.params.file), 'ONE CAUSE, ONE ITEM: the torn store\'s own For-you item names the set-aside file and says the clean-up holds');
    A4.shutdown();
    const { jm: B4, logs: LB4, items: IB4 } = boot(h4, { bootDelayMs: 20 });
    await until(() => B4._logsState && B4._logsState.last || LB4.some((l) => /HELD/.test(l)), 5000, 10); await settle(B4);
    ok(B4.jobs.size === 0 && has(h4Run) && LB4.some((l) => /job-logs clean-up HELD: jobs\.json\.corrupt-\d+/.test(l)), 'AFTER A RESTART the store loads empty (no skeletons) — and the boot pass removes NOTHING: the set-aside file is the fact, on disk', { jobs: B4.jobs.size, run: has(h4Run) });
    ok(heldItems(IB4).length === 0 && IB4.filter((n) => n && n.fact === 'store-corrupt').length === 0, '…and nothing is said twice across the restart (the file\'s item is «said» in the record, written durably)');
    const moved = path.join(tmp, 'moved-by-a-person'); fs.mkdirSync(moved, { recursive: true });
    for (const f of setAsides(h4)) fs.renameSync(path.join(h4, f), path.join(moved, f));
    await sweepAt(B4, Date.now());
    ok(!has(h4Run) && LB4.some((l) => /job-logs clean-up resumes/.test(l)), 'the file MOVED by a person lifts the hold by itself: the next pass removes what no record lists, and says it resumes');
    // H5 A PARSED ARCHIVE THAT IS NOT A LIST: set aside like a torn one (the release read it as [] and kept no bytes) — held
    const h5 = mkDir('h5'); fs.writeFileSync(path.join(h5, 'jobs-archive.json'), '{"records":[]}');
    const h5Orphan = seedRun(h5, 'jb-0e1a0005', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const { jm: JH5 } = boot(h5);
    await sweepAt(JH5, Date.now()); const h5Worker = has(h5Orphan);
    JH5._loadArchive(); await sweepAt(JH5, Date.now());
    ok(h5Worker && setAsides(h5).length === 1 && has(h5Orphan), 'an archive that parses to a non-list: the worker refuses it, the load sets it aside (bytes kept), the pass removes nothing');
    const h5b = mkDir('h5b'); fs.writeFileSync(path.join(h5b, 'jobs-archive.json'), '"not a list"');
    const h5bOrphan = seedRun(h5b, 'jb-0e1a0015', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const { jm: JH5b } = boot(h5b); await sweepAt(JH5b, Date.now());
    ok(has(h5bOrphan), 'the worker refuses an archive that parses to a non-list even when it iterates (a JSON string) — nothing removed');
    // H6 A READ THAT FAILED WITH NO SET-ASIDE (a stand-in in code: EIO on the read, the rename refused) — this process holds,
    // and the next pass reads the file again in the worker: a read that succeeds keeps its records by itself
    const h6 = mkDir('h6'); const a6Ts = Date.now() - 20 * DAY;
    fs.writeFileSync(path.join(h6, 'jobs-archive.json'), JSON.stringify([{ id: 'jb-a7c0ffee', kind: 'task', state: 'done', runs: [{ startedAt: a6Ts, endedAt: a6Ts + 1 }] }]));
    const h6Listed = seedRun(h6, 'jb-a7c0ffee', a6Ts, { ageMs: 20 * DAY }), h6Orphan = seedRun(h6, 'jb-0e1a0006', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const { jm: JH6, logs: LH6 } = boot(h6);
    const AF = path.join(h6, 'jobs-archive.json'), rf = fs.readFileSync, rn = fs.renameSync;
    fs.readFileSync = function (f, ...a) { if (String(f) === AF) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, f, ...a); };
    fs.renameSync = function (f, ...a) { if (String(f) === AF) throw Object.assign(new Error('EIO: i/o error, rename'), { code: 'EIO' }); return rn.call(this, f, ...a); };
    try { JH6.archive = null; JH6._loadArchive(); } finally { fs.readFileSync = rf; fs.renameSync = rn; }
    ok(JH6._logsUnread && JH6._logsUnread.archive === 'EIO' && setAsides(h6).length === 0 && JH6.archive.length === 0, 'an EIO read whose set-aside also failed: no file is left behind — the process notes it (law: only «not there» means «no records»)');
    fs.chmodSync(AF, 0o000);
    await sweepAt(JH6, Date.now());
    ok(has(h6Listed) && has(h6Orphan), 'while the worker cannot read it either, the pass removes NOTHING');
    fs.chmodSync(AF, 0o644);
    await sweepAt(JH6, Date.now());
    ok(has(h6Listed) && !has(h6Orphan), 'the read that succeeds at the next pass lifts it by itself: the file\'s listed run stays, a run no record names goes');
    ok(LH6.filter((l) => /archive could not be read: EACCES/.test(l)).length <= 1, 'the same failure is said once, not every pass');
    // H7 THE STORE READ FAILED WITH NO SET-ASIDE: a stand-in EIO at boot whose stat failed too (nothing to set aside, no
    // skeletons) — the worker reads the store at the pass
    const h7 = mkDir('h7'); const s7Ts = Date.now() - 20 * DAY;
    fs.writeFileSync(path.join(h7, 'jobs.json'), JSON.stringify([{ id: 'jb-5e7f1ce7', kind: 'service', state: 'up', desiredUp: true, owner, access: { view: 'all', control: 'session' }, runs: [{ startedAt: s7Ts }] }]));
    const h7Listed = seedRun(h7, 'jb-5e7f1ce7', s7Ts, { ageMs: 20 * DAY }), h7Orphan = seedRun(h7, 'jb-0e1a0007', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const SF = path.join(h7, 'jobs.json');
    const ex = fs.existsSync;
    fs.readFileSync = function (f, ...a) { if (String(f) === SF) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return rf.call(this, f, ...a); };
    fs.existsSync = function (f, ...a) { if (String(f) === SF) return false; return ex.call(this, f, ...a); };
    let JH7; try { JH7 = boot(h7).jm; } finally { fs.readFileSync = rf; fs.existsSync = ex; }
    await sweepAt(JH7, Date.now());
    ok(JH7._logsUnread.store === 'EIO' && JH7.jobs.size === 0 && setAsides(h7).length === 0 && has(h7Listed) && !has(h7Orphan), 'a STORE read that failed at boot with no set-aside (memory holds no record of it): the worker reads the store at the pass — its listed run stays, a run no record names goes');
  }


  // ── §P THE PACE FOLLOWS THE STORAGE, AND A PERSON CAN STOP IT (round 2 law 3) ─────────────────────────────────────────
  lap('§P pace and pause');
  {
    const seedOld = (dir, n, { youngEvery = 0 } = {}) => {
      fs.mkdirSync(path.join(dir, 'job-logs'), { recursive: true });
      const base = Date.now() - 50 * DAY;
      for (let i = 0; i < n; i++) { const young = youngEvery && i % youngEvery === 0; seedRun(dir, 'jb-0ld00001', base + i * 1000, { ageMs: young ? DAY : 30 * DAY }); }
    };
    // a. the rest after a pass is ≥ 10 × that pass's own time (the product's factor), never only the gap
    const pa = mkDir('pa'); seedOld(pa, 600);
    const ansA = [];
    const { jm: PA } = boot(pa, { max: 200, gapMs: 20, restFactor: 10, workerPath: slowWorker });
    const oa = PA.sweepLogs.bind(PA); PA.sweepLogs = (o) => { const pr = oa(o); pr.then((a) => ansA.push(a)); return pr; };
    await PA.sweepLogs({ why: 'boot' });
    ok(ansA[0] && ansA[0].removed === 200 && PA._logsRestMs >= Math.max(20, 10 * ansA[0].ms) && ansA[0].ms >= 40, `A SLOW PASS EARNS A LONGER REST: a pass of ${ansA[0] && ansA[0].ms} ms rests ${PA._logsRestMs} ms (≥ 10× its own time, ≥ the gap)`);
    PA.shutdown();
    // b. the count BY NAME reconciles: 600 runs started > 14 days ago, 60 of them young by their newest file — start 600, done 540 + 60 kept
    const pb = mkDir('pb'); seedOld(pb, 600, { youngEvery: 10 });
    const { jm: PB, logs: LPB } = boot(pb, { max: 200, gapMs: 15, bootDelayMs: 20 });
    await until(() => PB._logsState && PB._logsState.last && !PB._logsState.catchUp && LPB.some((l) => /catch-up done/.test(l)), typeof PB.sweepLogs === 'function' ? 15000 : 1000, 10);
    const jb = LPB.filter((l) => /job-logs catch-up/.test(l));
    ok(jb.length === 2 && /catch-up: 600 run dir\(s\) that started more than 14 days ago/.test(jb[0]) && /done: 540 run dir\(s\) removed .*; 60 kept \(young by their newest file/.test(jb[1]), 'THE COUNT IS BY NAME and the done line names the same run dirs: 600 at the start = 540 removed + 60 kept (young by their newest file)', jb);
    // c. a cut SWEEP batch is never repeated before its rest; a cut WHOLE-dir batch is retried once (its caller's verdict)
    if (LS) {
      const slowF = path.join(tmp, 'slow-answer-worker.cjs');
      fs.writeFileSync(slowF, "const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000); parentPort.postMessage({ seq: m.seq, removed: 0, entries: 0, more: false, gone: [] }); });\n");
      let started = 0; const { Worker } = await import('node:worker_threads');
      class Counted extends Worker { constructor(...a) { super(...a); started++; } }
      const R = LS.createRemover({ logsDir: path.join(tmp, 'nowhere2'), timeoutMs: 150, wedgedMs: 2000, workerPath: slowF, WorkerImpl: Counted });
      const t0 = Date.now(); const cut = await R.sweep({ keep: {}, cutoff: 0, max: 1 }); const tookMs = Date.now() - t0, sweepStarts = started;
      await until(() => !R.held(), 3000);
      const w = await R.whole(['jb-12340001']);
      ok(cut.error && sweepStarts === 1 && tookMs < 1500, `A CUT SWEEP IS NOT REPEATED at once: one thread, one timeout (${tookMs} ms), answered — the pass's rest comes next`);
      ok(w.error && started === 3, `…while a cut WHOLE-dir batch (a caller's verdict) is retried once (${started - sweepStarts} threads)`);
      R.stop();
    }
    // c2. the REAL worker's progress: a pass over a slow storage (1 ms a removal) cut at its timeout answers what it removed so far
    if (LS) {
      const slow1 = path.join(tmp, 'slow1-worker.cjs');
      fs.writeFileSync(slow1, `const fs = require('fs'); const rm = fs.rmSync; fs.rmSync = function (...a) { const t = performance.now() + 1; while (performance.now() < t) { } return rm.apply(this, a); };\nrequire(${JSON.stringify(path.join(ROOT, 'src/job-logs-sweep-worker.js'))});\n`);
      const pc = path.join(tmp, 'pc'); fs.mkdirSync(path.join(pc, 'job-logs'), { recursive: true });
      const base = Date.now() - 50 * DAY; for (let i = 0; i < 600; i++) seedRun(pc, 'jb-0ld0000c', base + i * 1000, { ageMs: 30 * DAY });
      const R2 = LS.createRemover({ logsDir: path.join(pc, 'job-logs'), timeoutMs: 350, wedgedMs: 2000, workerPath: slow1 });
      const cutAns = await R2.sweep({ keep: { named: ['jb-0ld0000c'], listed: [], skeleton: [], held: [] }, cutoff: Date.now() - 14 * DAY, max: 1000 });
      const goneOnDisk = 600 - runsOn(pc, 'jb-0ld0000c').length;
      ok(cutAns.error && cutAns.partial && cutAns.partial.removed >= 100 && cutAns.partial.removed <= goneOnDisk && goneOnDisk - cutAns.partial.removed < 100, `the REAL worker's progress: a pass cut at its timeout answers what it removed so far (${cutAns.partial && cutAns.partial.removed} said, ${goneOnDisk} gone — said to the last hundred)`);
      R2.stop();
    }
    // d. a pass cut at its timeout RESTS (≥ 5 min, ≥ 10× its timeout) and keeps the count of what it removed before it was ended
    if (typeof PB._logsRemover === 'function') {
      const pd = mkDir('pd'); const { jm: PD, logs: LPD } = boot(pd, { timeoutMs: 1000, restFactor: 10 });
      PD._logsState = { catchUp: { startedAt: Date.now(), counted: 900, removed: 0, entries: 0, jobDirs: 0, passes: 1 }, last: null, heldSaid: [] };
      const real = PD._logsRemover(); PD._logsRm = { ...real, sweep: async () => ({ error: 'no answer in 1 s', partial: { removed: 3, entries: 9, jobDirs: 0 } }), whole: (...a) => real.whole(...a), settled: () => real.settled(), busy: () => real.busy(), held: () => false, stop: () => real.stop() };
      await PD.sweepLogs({ why: 'catch-up' });
      ok(PD._logsRestMs >= 300000 && PD._logsRestMs >= 10 * 1000 && PD._logsState.catchUp.removed === 3 && LPD.some((l) => /3 run dir\(s\) were removed before it was ended/.test(l)), `A CUT PASS RESTS (${PD._logsRestMs} ms) and keeps the count of what it removed before it was ended (3)`);
      clearTimeout(PD._logsGapT); PD._logsGapT = null; PD._logsRm = real;
    } else ok(false, 'a cut pass rests and keeps its count (no law on this tree)');
    // e. THE PAUSE: the setting off — the boot pass, the hourly one and an open catch-up remove nothing (said once); the removals a
    // record or a person asks for still run; on again ⇒ the next hourly pass resumes
    const pe = mkDir('pe'); let on = false;
    const peRun = seedRun(pe, 'jb-0e1a00e1', Date.now() - 30 * DAY, { ageMs: 30 * DAY });
    const { jm: PE, logs: LPE } = boot(pe, { bootDelayMs: 20 }, { logsSweepOn: () => on });
    await sleep(120); await sweepAt(PE, Date.now()); await gcAt(PE, Date.now());
    ok(has(peRun) && LPE.filter((l) => /job-logs clean-up paused by the setting jobs\.logsSweep/.test(l)).length === 1, 'PAUSED (the setting off): the boot pass, a direct pass and the hourly gc remove nothing — said ONCE');
    const peArc = 'jb-a8c0ffee'; PE._writeArchive([{ id: peArc, kind: 'task', name: 'arch', state: 'done', owner, access: { view: 'all', control: 'session' }, runs: [{ startedAt: Date.now() - DAY, endedAt: Date.now() - DAY }], archivedAt: Date.now(), archivedWhy: 'done' }]);
    seedRun(pe, peArc, Date.now() - DAY); PE.rmArchived(peArc);
    ok(typeof PE.logsGone === 'function' && (await PE.logsGone(peArc)) === true && !has(pe, 'job-logs', peArc), '…while the ✕ (a removal a person asks for) still removes its logs');
    on = true; await gcAt(PE, Date.now());
    ok(!has(peRun), 'turned ON again: the next hourly pass resumes and removes');
    const SCH = fs.readFileSync(path.join(ROOT, 'src/lib/settings-schema.js'), 'utf8'), WIR = fs.readFileSync(path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8');
    ok(/'jobs\.logsSweep': \{\n\s*type: 'boolean', default: true,/.test(SCH) && /logsSweepOn: \(\) => \{ try \{ return serverSetting\('jobs\.logsSweep'\) !== false; \}/.test(WIR), 'the pause is ONE schema row (boolean, default on) and its reader in jobs-wiring');
    ok(!/4 \* cfg\.timeoutMs/.test(fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8')), 'the counting pass has the normal timeout (past B it reads directories only)');
  }

  // ── P4 THE CATCH-UP over 5 000 seeded dropped runs ─────────────────────────────────────────────────────────────────────
  lap('P4 the catch-up');
  const seedTree = (dir, n) => {
    const id = 'jb-5eed0001', listed = [];
    for (let i = 0; i < 20; i++) listed.push({ startedAt: Date.now() - DAY + i * 1000, endedAt: Date.now() - DAY + i * 1000 + 500, exit: 0, trigger: 'cron' });
    fs.mkdirSync(path.join(dir, 'job-logs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([
      { id: 'jb-5eedc404', kind: 'cron', name: 'often', state: 'scheduled', schedule: { everyMs: 900e3 }, nextFireAt: Date.now() + 3600e3, action: { type: 'notify', text: 'x' }, owner, access: { view: 'all', control: 'session' }, runs: [] },
      { id, kind: 'task', name: 'often run', cronParent: 'jb-5eedc404', state: 'done', owner, access: { view: 'all', control: 'session' }, runs: listed }]));
    for (const r of listed) seedRun(dir, id, r.startedAt);
    const base = Date.now() - 60 * DAY;
    for (let i = 0; i < n; i++) seedRun(dir, id, base + i * 900e3 % (40 * DAY) + i, { ageMs: 30 * DAY });
    return { id, listed: listed.map((r) => String(r.startedAt)) };
  };
  const d4 = mkDir('p4'); const t4 = seedTree(d4, 5000);
  ok(runsOn(d4, t4.id).length === 5020, 'seeded: 5 000 dropped runs (30 days old) + 20 listed');
  const answers4 = [], h = monitorEventLoopDelay({ resolution: 5 });
  const { jm: J4, logs: L4 } = boot(d4, { max: 500, gapMs: 25, bootDelayMs: 20, workerPath: slowWorker });
  const law = typeof J4.sweepLogs === 'function';
  if (typeof J4.sweepLogs === 'function') { const orig = J4.sweepLogs.bind(J4); J4.sweepLogs = (o) => { const p = orig(o); p.then((a) => answers4.push({ at: Date.now(), ...a })); return p; }; }
  h.enable();
  const done4 = await until(() => runsOn(d4, t4.id).length === 20 && J4._logsState && !J4._logsState.catchUp, law ? 30000 : 1500, 10);
  h.disable();
  const worstMs = h.max / 1e6;
  ok(done4, 'the hub catches up BY ITSELF: the 5 000 dropped runs are gone, the 20 listed stay', `${runsOn(d4, t4.id).length} left`);
  ok(t4.listed.every((t) => has(d4, 'job-logs', t4.id, t)), 'nothing a record lists was touched');
  const real4 = answers4.filter((a) => !a.skipped && !a.error);
  ok(real4.length >= 10 && real4.every((a) => a.removed <= 500), `PACED: at most 500 a pass (${real4.length} passes: ${real4.map((a) => a.removed).join(' ')})`);
  ok(real4.length >= 2 && real4.slice(1).every((a, i) => a.at - real4[i].at >= 25), 'each pass after the gap (≥ 25 ms between passes here; 30 s in the product)');
  ok(done4 && worstMs < 60, `OFF THE LOOP (a slow storage: ${SLOW_MS} ms a removal): the main loop's worst delay over the whole catch-up ${worstMs.toFixed(1)} ms (< 60 ms; a pass of 500 is ≥ ${500 * SLOW_MS} ms of removals)`);
  const jl4 = L4.filter((l) => /job-logs/.test(l));
  ok(jl4.length === 2 && /catch-up: 5,000 run dir\(s\) that started more than 14 days ago and no record lists — removing at most 500 per pass off the main thread, resting at least 25 ms/.test(jl4[0]) && /catch-up done: 5,000 run dir\(s\) removed \(15,000 entries\) and 0 job dir\(s\) no record names; 0 kept .* — \d+ pass\(es\)/.test(jl4[1]), 'SAID TWICE: once at the start with the count, once when done with the total — nothing in between', jl4);
  // CONTROL: ONE pass of the same removals ON the main thread (the release's shape: a synchronous rm per dir), the same slow
  // storage — the loop is held past the bound
  {
    const dc = mkDir('p4c'); const tc = seedTree(dc, 500); const hc = monitorEventLoopDelay({ resolution: 5 }); hc.enable();
    await sleep(20);
    for (const r of runsOn(dc, tc.id)) if (!tc.listed.includes(r)) { const t = performance.now() + SLOW_MS; while (performance.now() < t) { } fs.rmSync(path.join(dc, 'job-logs', tc.id, r), { recursive: true, force: true }); }
    await sleep(20); hc.disable();
    ok(hc.max / 1e6 >= 60, `CONTROL: one pass of the same removals on the main thread holds the loop ${(hc.max / 1e6).toFixed(0)} ms (≥ 60: the bound bites)`);
  }

  // ── P5 A RESTART IN THE MIDDLE OF THE CATCH-UP ─────────────────────────────────────────────────────────────────────────
  lap('P5 a restart in the middle');
  const d5 = mkDir('p5'); const t5 = seedTree(d5, 5000);
  const { jm: A, logs: LA } = boot(d5, { max: 500, gapMs: 60, bootDelayMs: 20 });
  const mid = await until(() => A._logsState && A._logsState.catchUp && A._logsState.catchUp.passes >= 3, typeof A.sweepLogs === 'function' ? 20000 : 1500, 5);
  A.shutdown();
  if (mid) await require(path.join(ROOT, 'src/store-writer.js')).storeWriter().durable(A.logsSweepFile);
  const leftAtRestart = runsOn(d5, t5.id).length - 20;
  ok(mid && leftAtRestart > 0 && leftAtRestart < 5000, `the first engine stopped mid catch-up (${5000 - leftAtRestart} removed, ${leftAtRestart} left)`);
  const { jm: B, logs: LB } = boot(d5, { max: 500, gapMs: 25, bootDelayMs: 20 });
  const done5 = await until(() => runsOn(d5, t5.id).length === 20 && B._logsState && !B._logsState.catchUp, typeof B.sweepLogs === 'function' ? 20000 : 1500, 10);
  const jlA = LA.filter((l) => /job-logs/.test(l)), jlB = LB.filter((l) => /job-logs/.test(l));
  ok(done5, 'the restarted hub resumes by itself and finishes');
  ok(jlA.length === 1 && /catch-up: 5,000/.test(jlA[0]) && jlB.length === 1 && /catch-up done: 5,000 run dir\(s\) removed/.test(jlB[0]), 'said twice across the restart: the start once (the first engine), the done once with the WHOLE total (the second)', { A: jlA, B: jlB });
  ok(t5.listed.every((t) => has(d5, 'job-logs', t5.id, t)), 'nothing a record lists was touched across the restart');
  let rec5 = null; try { rec5 = JSON.parse(fs.readFileSync(path.join(d5, 'jobs-logs-sweep.json'), 'utf8')); } catch { }
  await require(path.join(ROOT, 'src/store-writer.js')).storeWriter().durable(path.join(d5, 'jobs-logs-sweep.json'));
  try { rec5 = JSON.parse(fs.readFileSync(path.join(d5, 'jobs-logs-sweep.json'), 'utf8')); } catch { }
  ok(rec5 && rec5.catchUp === null && rec5.last && rec5.last.more === false, 'the catch-up\'s record (through the store writer) closes: catchUp null');
  // a pass that FAILS inside an open catch-up never stalls it: the retry is re-armed (5 min in the product)
  if (typeof B.sweepLogs === 'function') {
    B._logsState.catchUp = { startedAt: Date.now(), counted: 1, countedEntries: 1, removed: 0, entries: 0, passes: 0 };
    const realRm5 = B._logsRemover(); B._logsRm = { ...realRm5, sweep: async () => ({ error: 'held', held: true }), whole: (...a) => realRm5.whole(...a), settled: () => realRm5.settled(), busy: () => realRm5.busy(), held: () => true, stop: () => realRm5.stop() };
    if (B._logsGapT) { clearTimeout(B._logsGapT); B._logsGapT = null; }
    await B.sweepLogs({ why: 'catch-up' });
    ok(!!B._logsGapT && B._logsState.catchUp, 'a failed pass inside an open catch-up re-arms its retry (the catch-up never stalls)');
    clearTimeout(B._logsGapT); B._logsGapT = null; B._logsRm = realRm5;
    await B._gc();
    ok(!B._logsState.catchUp || !!B._logsGapT, '…and with no timer armed, the hourly gc picks the catch-up up itself');
  } else ok(false, 'a failed pass never stalls a catch-up (no law on this tree)');

  // ── a SKELETON registry keeps everything; a READ-ONLY engine removes nothing ──────────────────────────────────────────
  lap('§K skeleton + read-only');
  const d6 = mkDir('p6'); fs.writeFileSync(path.join(d6, 'jobs.json'), '{ not json');
  const skRun = seedRun(d6, 'jb-5ce1e7a1', Date.now() - 40 * DAY, { ageMs: 40 * DAY });
  const { jm: K } = boot(d6);
  ok(K.jobs.has('jb-5ce1e7a1') && K.jobs.get('jb-5ce1e7a1').state === 'unverified', 'a corrupt store recovers a skeleton from the job dir');
  await sweepAt(K, Date.now() + 15 * DAY);
  ok(has(skRun), 'the skeleton\'s run dir stays (its empty run list is not «lists nothing»)');
  const ro = Object.assign(Object.create(JobManager.prototype), { readOnly: true, d: { log() { } } });
  const roAns = typeof ro.sweepLogs === 'function' ? await ro.sweepLogs() : null;
  ok(roAns && roAns.skipped === 'read-only', 'a read-only engine runs no pass');
} catch (e) {
  fail++; console.error('  ✗ the suite threw — ' + (e && e.stack || e));
} finally {
  for (const k of kids) { try { k.kill('SIGKILL'); } catch { } }
  for (const jm of engines) { try { jm.shutdown(); } catch { } for (const t of jm._timers || []) clearInterval(t); }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
}
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
