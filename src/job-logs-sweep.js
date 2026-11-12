'use strict';
// THE JOB-LOGS REMOVER (lane job-logs-sweep, 2026-11-12 — found by the data-move rehearsal: the owner's hub held 123 523
// entries under data/job-logs, the largest store by entry count, because a job's record keeps its last 20 runs
// (src/jobs.js `_spawn`) and nothing ever removed the directory of a run the record dropped; a scheduled job fires ONE
// child task for ever, so the 14-day gc of a TASK never reached it).
//   data/job-logs/<jobId>/<runTs>/ — runTs = the run's start (ms) = runs[i].startedAt; spec.<runTs>.json (read once by the
//   wrapper, unlinked), pid.json (the wrapper's stamp), current.log (+ .1 at the 50 MB rotation), exit.json, bound.json,
//   pressure.json, stopping.json / stop.json, answers.jsonl.
// THE LAW:
//   1. what a job's record no longer lists is not kept past the retention: a run dir no record lists (the store's or the
//      archive's) is removed once 14 days have passed since its NEWEST entry was written (its end — a run's start is not its
//      age: a service that ran for weeks), whether its task lives on or not; a job dir no record names goes once emptied;
//   2. NEVER a run whose wrapper lives (its pid.json judged against /proc by proc-identity: pid + starttime + boot id, not a
//      zombie; a stamp that cannot be judged keeps its run), never a run a record lists, never a run the hub still holds
//      work for (a scope reap that has not finished), never a dir of a skeleton record (a corrupt store's recovery: its
//      empty run list is not «lists nothing»);
//   3. paced: at most PASS_MAX run dirs a pass; while more are owed the next pass follows after GAP_MS; the catch-up is said
//      twice (start with its count, done with its total) — src/jobs.js keeps its record (data/<the store's file>) through
//      the store writer;
//   4. NOTHING UNDER job-logs IS REMOVED ON THE MAIN THREAD: every removal — the sweep's, and the whole-directory removals
//      whose verdicts stay their callers' (the hourly gc's two legs, the archive cap, the ✕ on an archived row, the boot's
//      collapse of pre-2.343.3 children) — runs in ONE worker thread (src/job-logs-sweep-worker.js), started per batch,
//      gone when its queue is empty, terminated past its timeout (the batch said once and queued again).
// PURE here (the verdict, the keep set, the words) + the main-thread side of the worker (a queue; no fs call of its own).
// scripts/test-job-logs-sweep.mjs pins it.
const path = require('path');
const { fork } = require('child_process');   // the remover's child (round 2): a spawn site — scripts/spawn-env-census.mjs judges its built env

const RETENTION_MS = 14 * 86400e3;   // a finished task's (src/jobs.js _gc): the same 14 days for a run no record lists
const PASS_MAX = 500;                // B — run dirs removed per pass (≈ 2 000 entries on the owner's shape)
const GAP_MS = 30_000;               // G — between two passes while a catch-up is open
const BOOT_DELAY_MS = 120_000;       // the first pass after a boot (a hub that restarts more often than hourly still sweeps)
const BATCH_TIMEOUT_MS = 120_000;    // a batch past this is terminated, said once, queued again (≤ 2 tries)
const IDLE_MS = 1000;                // an idle worker lingers this long (unref'd) for the next batch, then is terminated
// «KEPT UNTIL EVIDENCE»: a stamp that cannot be judged names no live process only when it was written BEFORE THIS MACHINE'S BOOT BY
// MORE THAN A DAY. The stamp's time is the STORE's clock (a network mount stamps with its server's), the boot instant is this
// machine's and moves when its clock is set: a day is more than any time-zone mistake (≤ 14 h) and far past the store skew the
// data-move kit refuses (2 s, measured on this mount). In a CONTAINER the kernel's boot is the HOST's: a stamp from before a
// container restart is NOT «before boot» — that run is KEPT (the safe side), never a hole.
const EVIDENCE_MARGIN_MS = 86_400_000;
// a remover whose hub ended stops between two run dirs and leaves what it removed in this file in the data dir (the next engine
// counts it ONCE: its name is kept in the record until the file is gone)
const ORPHAN_PREFIX = 'jobs-remover-orphan-';
const WEDGED_MS = 2000;              // a terminated thread not ended this long after is WEDGED (a syscall the storage never answers)
const JOB_NAME = /^jb-[0-9a-z]{1,40}$/;
const RUN_NAME = /^\d{1,16}$/;
// the corrupt-store recovery's skeleton (src/jobs.js _load) — its runs [] were never the job's runs
const RECOVERED_NOTE = 'recovered from corrupt store — resolve before reuse';
const isSkeleton = (j) => !!j && j.state === 'unverified' && j.note === RECOVERED_NOTE;

/** THE VERDICT over one run directory → 'listed' | 'held' | 'skeleton' | 'young' | 'alive' | 'unproven' | 'remove'.
 *  `newestMs` and `alive` may be thunks: the worker reads the disk and /proc only for a run every cheaper rule let through
 *  (a run that STARTED after the cutoff is young by its name alone — every file it wrote is younger still). */
function runVerdict(r) {
  if (r.listed) return 'listed';
  if (r.held) return 'held';
  if (r.skeleton) return 'skeleton';
  if (!(Number(r.startMs) < r.cutoff)) return 'young';
  const newest = typeof r.newestMs === 'function' ? r.newestMs() : r.newestMs;
  if (!(Number(newest) < r.cutoff)) return 'young';
  const alive = typeof r.alive === 'function' ? r.alive() : r.alive;
  if (alive === true) return 'alive';
  if (alive !== false) return 'unproven';
  return 'remove';
}
/** a whole-directory removal (its caller's verdict): every entry goes but a run whose wrapper lives or cannot be judged */
const wholeKeeps = (alive) => alive !== false;

/** THE KEEP SET, built on the main thread from memory (no disk): plain arrays (a structured clone to the worker).
 *  named = every id a record holds (store + archive); listed = `<id>/<runTs>` of every run a record lists; skeleton = ids
 *  of recovered skeletons; held = `<id>/<runTs>` of every run the hub holds work for. */
/** round 3 §3: a record whose `runs` is there but is not a list (an object, a number, a string) cannot say which runs it lists —
 *  «records that cannot be read»: every dir of that job is KEPT (it rides `skeleton`) and its id is in `unreadable` (said once);
 *  never a throw (one such record stopped every pass and the hourly gc's other work), never a quiet «lists nothing» */
function keepSetOf({ jobs = [], archive = [], held = [] } = {}) {
  const named = [], listed = [], skeleton = [], unreadable = [];
  for (const j of [...(Array.isArray(jobs) ? jobs : []), ...(Array.isArray(archive) ? archive : [])]) {
    if (!j || typeof j.id !== 'string') continue;
    named.push(j.id);
    if (isSkeleton(j)) skeleton.push(j.id);
    if (j.runs != null && !Array.isArray(j.runs)) { skeleton.push(j.id); unreadable.push(j.id); continue; }
    for (const r of j.runs || []) if (r && typeof r === 'object' && r.startedAt != null) listed.push(`${j.id}/${r.startedAt}`);
  }
  return { named, listed, skeleton, unreadable, held: (Array.isArray(held) ? held : []).filter((k) => typeof k === 'string') };
}

/** THE WORDS (the journal: ids and counts only, never a name) */
const n0 = (n) => Number(n || 0).toLocaleString('en-US');
const every = (ms) => (ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms)} ms`);
const words = {
  // round 2: the start counts BY NAME (run dirs that started more than 14 days ago and no record lists); the done line names the
  // SAME run dirs: removed + kept (young by their newest file, live, unjudgeable) = the start's count + what crossed the line since
  start: ({ counted, max, gapMs }) => `[jobs] job-logs catch-up: ${n0(counted)} run dir(s) that started more than 14 days ago and no record lists — removing at most ${max} per pass off the main thread, resting at least ${every(gapMs)} (ten times a pass's own time) between passes`,
  done: ({ removed, entries, jobDirs = 0, kept = 0, passes, startedAt }) => `[jobs] job-logs catch-up done: ${n0(removed)} run dir(s) removed (${n0(entries)} entries) and ${n0(jobDirs)} job dir(s) no record names; ${n0(kept)} kept (young by their newest file, live, or their stamp unjudgeable) — ${passes} pass(es) since ${Number.isFinite(Number(startedAt)) ? new Date(Number(startedAt)).toISOString() : 'an earlier boot'}`,
  pass: ({ removed, entries }) => `[jobs] job-logs: ${n0(removed)} run dir(s) past the 14-day retention that no record lists removed (${n0(entries)} entries)`,
  failed: ({ op, error, tries }) => `[jobs] job-logs remover: a ${op} batch failed (${error}) — ${tries < 2 ? 'queued again' : 'given up; the next pass retries'}`,
};

/** THE MAIN-THREAD SIDE: one queue, one CHILD at a time (started for a batch; idle, it lingers IDLE_MS unref'd, then goes), a
 *  timeout per batch. whole(ids) → Promise<{removed, entries, keptAlive}>; sweep(args) → Promise<answer>; settled() →
 *  Promise once nothing is queued or in flight. A stopped remover answers {error:'stopped'} and starts nothing. */
function createRemover({ logsDir, log = () => { }, timeoutMs = BATCH_TIMEOUT_MS, idleMs = IDLE_MS, wedgedMs = WEDGED_MS, workerPath = path.join(__dirname, 'job-logs-sweep-worker.js'), forkImpl = null, filterWhole = null, bootTimeMs = null } = {}) {
  // round 2 law «the hub's exit never waits for the remover»: a CHILD PROCESS, not a worker thread — a process's exit joins its
  // threads (one wedged in a storage call held a standalone exit until it was killed), never its children
  const queue = [];
  let worker = null, cur = null, timer = null, idleT = null, seq = 0, stopped = false;
  // a child killed past its timeout that has not ENDED yet — wedged in a syscall (a storage that stopped answering: an
  // uninterruptible wait even SIGKILL cannot end): no second child is started beside it; the batches meanwhile answer `held`
  let wedged = null, wedgedPast = false, wedgedT = null, heldSaid = false;
  const idle = [];
  const settleIdle = () => { if (!cur && !queue.length) while (idle.length) idle.shift()(); };
  const finish = (ans) => {
    const it = cur; cur = null; if (timer) { clearTimeout(timer); timer = null; }
    if (it && it.named && ans && !ans.error) ans = { ...ans, keptWhy: { ...(ans.keptWhy || {}), ...Object.fromEntries(it.named.map((id) => [id, 'named'])) } };
    if (it) it.resolve(ans);
    next();
  };
  const fail = (error) => {
    const it = cur; cur = null; if (timer) { clearTimeout(timer); timer = null; }
    const w = worker; worker = null;
    if (w) {
      wedged = w; wedgedPast = false; heldSaid = false;
      wedgedT = setTimeout(() => { wedgedT = null; if (wedged === w) { wedgedPast = true; next(); } }, wedgedMs); wedgedT.unref?.();
      w.once('exit', () => { if (wedged !== w) return; wedged = null; wedgedPast = false; if (wedgedT) { clearTimeout(wedgedT); wedgedT = null; } if (heldSaid) { try { log('[jobs] job-logs remover: its last child has ended — removals go on'); } catch { } } next(); });
      try { w.kill('SIGKILL'); } catch { }
    }
    if (it) {
      it.tries = (it.tries || 0) + 1;
      try { log(words.failed({ op: it.msg.op, error, tries: it.tries })); } catch { }
      // round 2 law 3: only a WHOLE-dir batch (its caller's verdict) is retried at once; a cut SWEEP is never repeated before
      // its rest (the pass's failure arms it) — it answers what it removed before it was ended
      if (it.tries < 2 && !stopped && it.msg.op === 'whole') queue.unshift(it); else it.resolve({ error, ...(it.progress ? { partial: it.progress } : {}) });
    }
    next();
  };
  /** the remover's child: our own script, its env BUILT (a PATH only — the hub's environment and its secrets never reach it),
   *  an IPC channel and nothing else, a bounded heap */
  function startChild() {
    const w = forkImpl ? forkImpl(workerPath, [logsDir], {}) : fork(workerPath, [logsDir], { env: { PATH: process.env.PATH || '/usr/bin:/bin' }, execArgv: ['--max-old-space-size=96'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    w.on('message', (m) => {
      if (w === worker && cur && m && m.seq === cur.msg.seq) { if (m.progress && !('removed' in m && 'more' in m)) { cur.progress = m.progress; return; } finish(m); }
    });
    w.on('error', (e) => { if (w === worker) fail((e && e.message) || String(e)); });
    w.on('exit', (code, sig) => { if (w === worker) { worker = null; if (cur) fail(`the remover exited (${code != null ? code : sig})`); } });
    return w;
  }
  const refs = (w, on) => { try { if (on) { w.ref(); w.channel && w.channel.ref(); } else { w.unref(); w.channel && w.channel.unref(); } } catch { } };
  function next() {
    if (stopped) { while (queue.length) queue.shift().resolve({ error: 'stopped' }); settleIdle(); return; }
    if (cur) return;
    if (!queue.length) {
      if (worker && !idleT) { refs(worker, false); idleT = setTimeout(() => { idleT = null; if (!cur && !queue.length) { const w = worker; worker = null; try { w && w.kill('SIGKILL'); } catch { } } }, idleMs); idleT.unref?.(); }
      settleIdle(); return;
    }
    if (wedged) {   // its exit is awaited; past WEDGED_MS it is HELD: every queued batch answers at once, nothing is started, said once
      if (!wedgedPast) return;
      if (!heldSaid) { heldSaid = true; try { log('[jobs] job-logs remover: HELD — its last child was killed past its timeout and has not ended yet (the storage is not answering); nothing is removed until it does'); } catch { } }
      while (queue.length) queue.shift().resolve({ error: 'held', held: true });
      settleIdle(); return;
    }
    if (idleT) { clearTimeout(idleT); idleT = null; }
    cur = queue.shift();
    // THE VERDICT IS TAKEN WHEN THE REMOVAL RUNS (round 2): a whole-dir batch drops, now, every id a live record names again
    if (cur.msg.op === 'whole' && typeof filterWhole === 'function') {
      let keepIds = []; try { keepIds = filterWhole(cur.msg.ids) || []; } catch { keepIds = cur.msg.ids; }
      const named = new Set(cur.msg.ids.filter((id) => !keepIds.includes(id)));
      if (named.size) { cur.named = [...named]; cur.msg = { ...cur.msg, ids: cur.msg.ids.filter((id) => !named.has(id)) }; }
      if (!cur.msg.ids.length) { const it = cur; cur = null; it.resolve({ removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: Object.fromEntries((it.named || []).map((id) => [id, 'named'])) }); next(); return; }
    }
    if (bootTimeMs != null) cur.msg = { ...cur.msg, bootTimeMs };   // a suite's machine-boot instant (the product's: the child reads /proc/stat)
    try { if (!worker) worker = startChild(); else refs(worker, true); } catch (e) { const it = cur; cur = null; it.resolve({ error: e.message }); next(); return; }
    const tmo = cur.timeoutMs || timeoutMs;
    timer = setTimeout(() => fail(`no answer in ${Math.round(tmo / 1000)} s`), tmo);
    timer.unref?.();
    try { worker.send(cur.msg); } catch (e) { fail((e && e.message) || String(e)); return; }
  }
  const ask = (msg, { timeoutMs: t = null } = {}) => new Promise((resolve) => {
    if (stopped) { resolve({ error: 'stopped' }); return; }
    queue.push({ msg: { ...msg, seq: ++seq }, resolve, timeoutMs: t });
    next();
  });
  return {
    whole: (ids) => ask({ op: 'whole', ids: [...new Set((Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === 'string' && JOB_NAME.test(id)))] }),
    sweep: (args, opts) => ask({ op: 'sweep', ...args }, opts),   // opts.timeoutMs: the counting pass walks the whole tree
    state: (stateFile, orphanDir = null) => ask({ op: 'state', stateFile, orphanDir }),   // the catch-up's record (+ what an orphaned remover left), read off the main thread
    forget: (dir, names) => ask({ op: 'forget', dir, names }),   // an orphan's counts, once the record that counted them is on disk
    settled: () => (cur || queue.length ? new Promise((r) => idle.push(r)) : Promise.resolve()),
    busy: () => !!cur || queue.length > 0,
    held: () => !!wedged,
    // a stop never waits for the child: it is killed and left to the kernel (a child wedged in a storage call ends when the call
    // does; the hub's own exit does not join it)
    stop() { stopped = true; const w = worker; worker = null; if (timer) { clearTimeout(timer); timer = null; } if (idleT) { clearTimeout(idleT); idleT = null; } if (wedgedT) { clearTimeout(wedgedT); wedgedT = null; } try { w && w.kill('SIGKILL'); } catch { } try { w && refs(w, false); } catch { } const it = cur; cur = null; if (it) it.resolve({ error: 'stopped' }); next(); },
  };
}

module.exports = { RETENTION_MS, PASS_MAX, GAP_MS, BOOT_DELAY_MS, BATCH_TIMEOUT_MS, IDLE_MS, WEDGED_MS, EVIDENCE_MARGIN_MS, ORPHAN_PREFIX, JOB_NAME, RUN_NAME, RECOVERED_NOTE, isSkeleton, runVerdict, wholeKeeps, keepSetOf, words, createRemover };
