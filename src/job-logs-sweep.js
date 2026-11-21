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
//      collapse of pre-2.343.3 children) — runs in ONE child process (src/job-logs-sweep-worker.js), ONE A BATCH (B-323e:
//      started by THE STARTER, src/server/child-starter.js — no timer starts a program from the hub's main process, no IPC
//      channel), killed past its timeout by the starter (said once; a whole-dir batch is queued again once, a cut sweep waits
//      for its pass's rest).
// PURE here (the verdict, the keep set, the words) + the main-thread side of the worker (a queue; its ONE fs call: a batch's
// request file in the logs folder, written by temp + rename off the loop — B-323e).
// scripts/test-job-logs-sweep.mjs pins it.
const path = require('path');
const fsp = require('fs').promises;   // B-323e: a batch's request file only (never a removal, never a read)
const PI = require('./proc-identity.js');   // B-323e: a killed child's identity (pid + start), read once at its timeout — its end judged if its exit is never heard

const RETENTION_MS = 14 * 86400e3;   // a finished task's (src/jobs.js _gc): the same 14 days for a run no record lists
const PASS_MAX = 500;                // B — run dirs removed per pass (≈ 2 000 entries on the owner's shape)
const GAP_MS = 30_000;               // G — between two passes while a catch-up is open
const BOOT_DELAY_MS = 120_000;       // the first pass after a boot (a hub that restarts more often than hourly still sweeps)
const BATCH_TIMEOUT_MS = 120_000;    // a batch past this is killed and said once (a whole-dir batch queued again once; a sweep rests)
// B-323e: THE BATCH IN THE ARGUMENTS has a BYTE BOUND — a whole-dir batch's job folder NAMES only (each judged by JOB_NAME before it
// is handed: never a path, never a person's text), at most ARGV_MAX bytes of them (a design bound: the kernel's 128 KiB a string and
// ~2 MiB in all are not one); every other batch (a sweep's keep set, a record's file, a note's words, a suite's /proc) and a whole
// batch over the bound rides a REQUEST FILE of the remover's own in the logs folder (REQUEST_PREFIX, written by temp + rename),
// read with REQUEST_MAX and removed by the child that reads it — one left by a child that never started goes with the next sweep
const ARGV_MAX = 32 * 1024;
const REQUEST_PREFIX = '.jobs-remover-request-';
const REQUEST_NAME = /^\.jobs-remover-request-[0-9a-z]{1,40}-\d{1,12}\.json$/;
const REQUEST_MAX = 16 * 1024 * 1024;   // the child's heap is 96 MB
const ANSWER_MAX = 8 * 1024 * 1024;     // the child's ONE answer line (a whole batch's ids)
const OPS = Object.freeze(['whole', 'sweep', 'state', 'forget', 'note', 'count']);
// «KEPT UNTIL EVIDENCE» (round 3 §5): no clock — src/job-logs-sweep-worker.js namedRuns (a running process's argv naming the run dir)
// a remover whose hub ended stops between two run dirs and leaves what it removed in this file in the data dir (the next engine
// counts it ONCE: its name is kept in the record until the file is gone)
const ORPHAN_PREFIX = 'jobs-remover-orphan-';
// B-323e: a sweep's COUNT FILE is of that name (`<ORPHAN_PREFIX><the remover>-<seq>.json`): rewritten by temp + rename after every
// removal, read with COUNT_MAX (a missing or torn one is «unknown», never «nothing removed»), counted ONCE — its name kept in the
// record beside its count — and forgotten by a later batch
const COUNT_NAME = new RegExp(`^${ORPHAN_PREFIX}[0-9a-z-]{1,60}\\.json$`);
const COUNT_MAX = 4096;
const WEDGED_MS = 2000;              // a killed child not ended this long after is WEDGED (a syscall the storage never answers)
const JOB_NAME = /^jb-[0-9a-z]{1,40}$/;
const RUN_NAME = /^\d{1,16}$/;
// the corrupt-store recovery's skeleton (src/jobs.js _load) — its runs [] were never the job's runs
const RECOVERED_NOTE = 'recovered from corrupt store — resolve before reuse';
const isSkeleton = (j) => !!j && j.state === 'unverified' && j.note === RECOVERED_NOTE;
// round 4 §2: a record store's read that failed with nothing set aside leaves ONE NOTE per store, by a name that cannot multiply —
// `<store>.corrupt-unread` (written O_EXCL by the remover's child: EEXIST = a note already stands), {store, error, at} inside;
// recognised by that EXACT name (round 4 §3: a person's file that merely starts like it is not the note)
const NOTE_SUFFIX = '.corrupt-unread';
const NOTE_NAME = /^[\w.-]{1,80}\.json\.corrupt-unread$/;
/** the moment a failure happened, in words that need no translation (a For-you param): `2026-11-12 14:03 UTC` */
const whenOf = (at) => (Number.isFinite(Number(at)) && Number(at) > 0 ? new Date(Number(at)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'earlier');

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
  // B-c330 (主开发's ruling B, 2026-11-18): the steady passes of one UTC day, folded into ONE line, said at the day's first pass after it
  day: ({ day, removed, entries, passes }) => `[jobs] job-logs: on ${day} (UTC) ${n0(removed)} run dir(s) past the 14-day retention that no record lists were removed over ${n0(passes)} steady pass(es) (${n0(entries)} entries)`,
  // round 4 §3: the words follow the batch's real fate — only a whole-dir batch is queued again (once); a cut sweep waits for its
  // pass's rest; the record's, the note's and an orphan's ops are asked again by the next pass
  failed: ({ op, error, requeued }) => `[jobs] job-logs remover: a ${op} batch failed (${error}) — ${requeued ? 'queued again' : op === 'sweep' ? 'not repeated before the pass\'s rest' : op === 'whole' ? 'given up; it is owed, re-sent before the next pass' : op === 'count' ? 'its count stays in its file for the next start' : 'given up; the next pass asks again'}`,
};

/** THE MAIN-THREAD SIDE: one queue, ONE CHILD A BATCH (B-323e: started by THE STARTER — src/server/child-starter.js, which this
 *  module only calls; no warm child is kept), a timeout per batch. whole(ids) → Promise<{removed, entries, keptAlive}>; sweep(args)
 *  → Promise<answer>; settled() → Promise once nothing is queued or in flight. A stopped remover answers {error:'stopped'} and starts
 *  nothing. `runImpl` is a suite's stand-in for the starter's run (the same call, the same answer). */
let removers = 0;
function createRemover({ logsDir, log = () => { }, timeoutMs = BATCH_TIMEOUT_MS, wedgedMs = WEDGED_MS, workerPath = path.join(__dirname, 'job-logs-sweep-worker.js'), runImpl = null, filterWhole = null, procRoot = null } = {}) {
  // round 2 law «the hub's exit never waits for the remover»: a CHILD PROCESS, not a worker thread — a process's exit joins its
  // threads (one wedged in a storage call held a standalone exit until it was killed), never its children
  const queue = [];
  const me = `${process.pid.toString(36)}${Date.now().toString(36)}r${(++removers).toString(36)}`;   // this remover's name in its files (a pid reused by a later boot never meets it; two removers of one process never share it)
  let cur = null, seq = 0, stopped = false;
  // a child the starter killed past its timeout that has not ENDED yet — wedged in a syscall (a storage that stopped answering: an
  // uninterruptible wait even SIGKILL cannot end): no second child is started beside it; past wedgedMs the batches answer `held`.
  // Its end is the starter's onLateExit. A run the starter cannot answer (`unknown`: its process failed) hears no end: the queue
  // waits wedgedMs, then goes on (that child's own parent check stops it between two run dirs)
  let wedged = null, wedgedPast = false, wedgedT = null, heldSaid = false;
  const idle = [];
  const settleIdle = () => { if (!cur && !queue.length) while (idle.length) idle.shift()(); };
  const run = (cmd, args, o) => (runImpl ? runImpl(cmd, args, o) : require('./server/child-starter.js').childStarter().run(cmd, args, o));
  const once = (f) => { let done = false; const g = (x) => { if (done) return; done = true; f(x); }; g.done = () => done; return g; };
  const finish = (it, ans) => {
    if (cur !== it) return; cur = null;
    if (it.named && ans && !ans.error) ans = { ...ans, keptWhy: { ...(ans.keptWhy || {}), ...Object.fromEntries(it.named.map((id) => [id, 'named'])) } };
    it.resolve(ans);
    next();
  };
  const wedge = (it, grace) => {
    wedged = it; wedgedPast = false; heldSaid = false;
    wedgedT = setTimeout(() => {
      wedgedT = null; if (wedged !== it) return;
      if (grace) { wedged = null; next(); return; }
      wedgedPast = true;
      if (it.cutDone) it.cutDone({ partialUnknown: 'its child has not ended — its count stays in its file for the next start', countLeft: it.msg.countName });
      next();
    }, wedgedMs);   // REF'D (≤ WEDGED_MS): a cut sweep's answer is owed until its child's end or the hold — an answer owed keeps the loop, as a batch in flight does
  };
  /** the starter's onLateExit: a child killed past its bound has ENDED — removals go on; a cut sweep's count is read now */
  // the fresh read's find 1: the starter's timeout and exit lines can arrive in ONE read — its onLateExit runs before this batch's
  // timedOut answer reaches fail(): an end heard before the wedge is KEPT on the batch (fail() then wedges nothing)
  const lateExit = (it) => {
    if (wedged !== it) { it.ended = true; return; }
    wedged = null; wedgedPast = false; if (wedgedT) { clearTimeout(wedgedT); wedgedT = null; }
    if (heldSaid) { try { log('[jobs] job-logs remover: its last child has ended — removals go on'); } catch { } }
    countSoon(it);
    next();
  };
  /** a cut sweep's count, read once its child has ended (a `count` batch, first in the queue) */
  const countSoon = (it) => { if (it.cutDone && !it.cutDone.done() && !stopped) queue.unshift({ internal: true, msg: { op: 'count', dir: it.msg.orphanDir, name: it.msg.countName, seq: ++seq }, resolve: (a) => it.cutDone(a && a.count ? { partial: a.count, countFile: it.msg.countName } : { partialUnknown: (a && (a.why || a.error)) || 'its count could not be read', countLeft: it.msg.countName }) }); };
  // the fresh read's find 2: a starter that fails while a killed child is awaited never says that child's end — at the next ask
  // the child is judged by the identity read at its timeout (gone, a zombie, another process under its pid = ended; /proc
  // unreadable = still awaited, the safe side)
  // r1283 (1): NO /proc IS NO EVIDENCE — a machine with none (macOS) reads every pid as gone; there the starter's late exit is the only release
  const procOpts = procRoot != null ? { procRoot } : undefined;
  const endedUnheard = (it) => { const k = it && it.killed; if (!k || !k.pid) return false; if (!PI.hasProc(procOpts)) return false; const s = PI.statOf(k.pid, procOpts); return s === null || (!!s && (s[0] === 'Z' || (k.start != null && s[1] !== k.start))); };
  const fail = (it, error, { timedOut = false, unknown = false, ended = false } = {}) => {
    if (cur !== it) return; cur = null;
    if (timedOut && !it.ended) wedge(it, false); else if (unknown) wedge(it, true);
    it.tries = (it.tries || 0) + 1;
    // round 2 law 3: only a WHOLE-dir batch (its caller's verdict) is retried at once; a cut SWEEP is never repeated before its rest
    // (the pass's failure arms it) — it answers what it removed before it was ended, read from its count file once its child ended
    const requeued = it.tries < 2 && !stopped && it.msg.op === 'whole';
    try { log(words.failed({ op: it.msg.op, error, requeued })); } catch { }
    if (requeued) queue.unshift(it);
    else if (it.msg.op === 'sweep' && (timedOut || unknown || ended)) {   // a child that RAN: what it removed is in its count file
      it.cutDone = once((x) => it.resolve({ error, ...x }));
      if (unknown || !it.msg.countName) it.cutDone({ partialUnknown: unknown ? 'the starter could not say — its count stays in its file for the next start' : 'it kept no count file', ...(unknown && it.msg.countName ? { countLeft: it.msg.countName } : {}) });
      else if (ended || it.ended) countSoon(it);   // the fresh read's find 4: it has ENDED (no answer, a crash, its heap) — its count is read now, never «nothing removed»
    } else it.resolve({ error });
    next();
  };
  /** the batch in the arguments: a whole-dir batch's job folder names, each judged, within ARGV_MAX — else null (its request file) */
  const namesOf = (msg) => {
    if (msg.op !== 'whole' || msg.procRoot != null) return null;
    const ids = (Array.isArray(msg.ids) ? msg.ids : []).filter((id) => typeof id === 'string' && JOB_NAME.test(id));
    let n = 0; for (const id of ids) n += Buffer.byteLength(id) + 1;
    return n <= ARGV_MAX ? ids : null;
  };
  const within = (p, ms) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); t.unref?.(); p.then(() => { clearTimeout(t); resolve(true); }, (e) => { clearTimeout(t); resolve(String((e && (e.code || e.message)) || e)); }); });
  let writing = null;   // the fresh read's find 6: a request file write past its bound that has not returned — none is started beside it (a dead mount holds one pool thread, never more)
  const writeRequest = async (f, body) => { await fsp.mkdir(path.dirname(f), { recursive: true }); await fsp.writeFile(f + '.tmp', body, { mode: 0o600 }); await fsp.rename(f + '.tmp', f); };
  /** ONE batch, ONE child, started by THE STARTER (never a fork of the hub): its env BUILT whole — PATH alone, as the fork's was since
   *  round 2 (the hub's environment and its secrets never reach it); the hub's pid HANDED (round 3 §4); a bounded heap */
  async function handOver(it) {
    const tmo = it.timeoutMs || timeoutMs, t0 = Date.now();
    let tail = namesOf(it.msg);
    if (tail) tail = ['whole', '--names', ...tail];
    else {
      if (writing) return { notStarted: true, error: 'the logs folder has not answered its last request file write — nothing is started until it does' };
      const name = `${REQUEST_PREFIX}${me}-${it.msg.seq}.json`;
      const wp = writeRequest(path.join(logsDir, name), JSON.stringify(it.msg)); writing = wp;
      const clear = () => { if (writing === wp) writing = null; }; wp.then(clear, clear);
      const w = await within(wp, tmo);
      if (w !== true) return { notStarted: true, error: w === null ? `its request file was not written in ${Math.round(tmo / 1000)} s` : `its request file could not be written (${w})` };
      if (cur !== it) return { notStarted: true, error: 'stopped' };   // a stop meanwhile: nothing is started (its file goes with the next sweep)
      tail = [it.msg.op, '--request', name];
    }
    return run(process.execPath, ['--max-old-space-size=96', workerPath, logsDir, String(process.pid), '--once', ...tail], { timeoutMs: Math.max(1, tmo - (Date.now() - t0)), capture: true, maxBuffer: ANSWER_MAX, wholeEnv: true, env: { PATH: process.env.PATH || '/usr/bin:/bin' }, onTimeout: (pid) => { it.killed = { pid: Number(pid) || 0, start: pid ? ((PI.statOf(pid, procOpts) || [])[1] || null) : null }; }, onLateExit: () => lateExit(it) });
  }
  /** the child's ONE answer: the last line of its stdout, an object — else null */
  const answerOf = (out) => { const ls = String(out || '').split('\n').filter(Boolean); let a = null; try { a = JSON.parse(ls[ls.length - 1]); } catch { } return a && typeof a === 'object' && !Array.isArray(a) ? a : null; };
  const settleRun = (it, r) => {
    const tmo = it.timeoutMs || timeoutMs;
    if (!r || r.notStarted) return fail(it, (r && r.error) || 'its batch was not handed over');
    if (r.unknown) return fail(it, `the starter could not say (${r.why || 'no answer'})`, { unknown: true });
    if (r.timedOut) return fail(it, `no answer in ${Math.round(tmo / 1000)} s`, { timedOut: true });
    if (r.overflow) return fail(it, `its answer passed ${ANSWER_MAX} bytes`, { ended: true });
    const ans = answerOf(r.stdout);
    if (!ans) return r.started === false || r.error ? fail(it, `the remover could not be started (${r.error || 'no start'})`) : fail(it, `the remover exited (${r.code != null ? r.code : r.signal}) with no answer`, { ended: true });
    finish(it, ans);
  };
  function next() {
    if (stopped) { while (queue.length) queue.shift().resolve({ error: 'stopped' }); settleIdle(); return; }
    if (cur) return;
    if (!queue.length) { settleIdle(); return; }
    if (wedged) {   // its end is awaited; past WEDGED_MS it is HELD: every queued batch answers at once, nothing is started, said once
      if (!wedgedPast) return;
      if (endedUnheard(wedged)) { lateExit(wedged); return; }   // find 2: its end was never said (a starter that failed meanwhile)
      if (!heldSaid) { heldSaid = true; try { log('[jobs] job-logs remover: HELD — its last child was killed past its timeout and has not ended yet (the storage is not answering); nothing is removed until it does'); } catch { } }
      while (queue.length) queue.shift().resolve({ error: 'held', held: true });
      settleIdle(); return;
    }
    cur = queue.shift();
    // THE VERDICT IS TAKEN WHEN THE REMOVAL RUNS (round 2): a whole-dir batch drops, now, every id a live record names again
    if (cur.msg.op === 'whole' && typeof filterWhole === 'function') {
      let keepIds = []; try { keepIds = filterWhole(cur.msg.ids) || []; } catch { keepIds = cur.msg.ids; }
      const named = new Set(cur.msg.ids.filter((id) => !keepIds.includes(id)));
      if (named.size) { cur.named = [...named]; cur.msg = { ...cur.msg, ids: cur.msg.ids.filter((id) => !named.has(id)) }; }
      if (!cur.msg.ids.length) { const it = cur; cur = null; it.resolve({ removed: 0, entries: 0, keptAlive: 0, gone: [], kept: [], keptWhy: Object.fromEntries((it.named || []).map((id) => [id, 'named'])) }); next(); return; }
    }
    if (procRoot != null) cur.msg = { ...cur.msg, procRoot };   // a suite's stand-in for /proc (the product's: /proc)
    const it = cur;
    let p; try { p = handOver(it); } catch (e) { p = Promise.reject(e); }
    p.then((r) => settleRun(it, r), (e) => fail(it, (e && e.message) || String(e)));
  }
  const ask = (msg, { timeoutMs: t = null } = {}) => new Promise((resolve) => {
    if (stopped) { resolve({ error: 'stopped' }); return; }
    const s = ++seq;
    queue.push({ msg: { ...msg, seq: s, ...(msg.op === 'sweep' ? { countName: `${ORPHAN_PREFIX}${me}-${s}.json` } : {}) }, resolve, timeoutMs: t });
    next();
  });
  return {
    whole: (ids) => ask({ op: 'whole', ids: [...new Set((Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === 'string' && JOB_NAME.test(id)))] }),
    sweep: (args, opts) => ask({ op: 'sweep', ...args }, opts),   // opts.timeoutMs: the counting pass walks the whole tree
    state: (stateFile, orphanDir = null) => ask({ op: 'state', stateFile, orphanDir }),   // the catch-up's record (+ what an orphaned remover left), read off the main thread
    forget: (dir, names) => ask({ op: 'forget', dir, names }),   // count files, once the record that counted them is on disk
    note: (dir, notes) => ask({ op: 'note', dir, notes }),   // round 4 §1: a store's NOTE (O_EXCL), written off the main thread
    settled: () => (cur || queue.length ? new Promise((r) => idle.push(r)) : Promise.resolve()),
    busy: () => !!cur || queue.length > 0,
    held: () => !!wedged,
    // a stop never waits for the child and signals none (B-323e: the starter holds it — and ends it at the hub's exit, its pipe
    // closed): the in-flight sweep's count stays in its count file, counted ONCE by the next engine (its name is not in the record).
    // It returns nothing to count (round 4 §3's count now rides that file)
    stop() {
      stopped = true; if (wedgedT) { clearTimeout(wedgedT); wedgedT = null; }
      const w = wedged; if (w && w.cutDone) w.cutDone({ partialUnknown: 'stopped — its count stays in its file for the next start', countLeft: w.msg.countName });
      const it = cur; cur = null; if (it) it.resolve({ error: 'stopped' });
      next(); return null;
    },
  };
}

module.exports = { RETENTION_MS, PASS_MAX, GAP_MS, BOOT_DELAY_MS, BATCH_TIMEOUT_MS, WEDGED_MS, ORPHAN_PREFIX, COUNT_NAME, COUNT_MAX, ARGV_MAX, REQUEST_PREFIX, REQUEST_NAME, REQUEST_MAX, ANSWER_MAX, OPS, JOB_NAME, RUN_NAME, RECOVERED_NOTE, NOTE_SUFFIX, NOTE_NAME, whenOf, isSkeleton, runVerdict, wholeKeeps, keepSetOf, words, createRemover };
