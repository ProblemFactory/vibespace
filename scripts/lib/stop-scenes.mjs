// scripts/lib/stop-scenes.mjs — B-d8f4 (lane bl-jobs, 主开发 r1045): THE SCENE BUILDERS of the stop suites in ONE file (test-stop-tree,
// test-stop-rung): a job of the REAL engine and wrapper, its tree read, stopped, its run's record read. Two copies of a builder that
// spawns and ends processes would drift. Each suite hands its own scratch dir (D) and its cleanup list (mine): every identity a scene
// makes or finds is pushed there and ended at the suite's exit.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

/** r3888 (the MUST B item, placed by reading — r3876): ONE force stop can say TWO forced-end sentences (the kill road asked again before
 *  the wrapper had ended). The scene reads the job's log once EVERY forced-end sentence the journal holds for the job is in it — its
 *  fact — never at the first one's landing. `journal`: the engine's journal lines; `log`: the job's log text */
export function forcedLanded(journal, jobId, log) {
  const want = (journal || []).filter((l) => l.includes(jobId) && l.includes('its forced end')).map((l) => '[jobs] stop: ' + l.slice(l.indexOf('its forced end')));
  return want.length > 0 && want.every((s) => String(log || '').includes(s));
}
export function stopScenes({ D, mine, ROOT }) {
const require = createRequire(path.join(ROOT, 'scripts', 'lib', 'stop-scenes.mjs'));
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(20); } return !!(await fn()); };
// r4294 (主开发, THE FORCED-STOP FAMILY — one placement for test-stop-tree and test-stop-rung): between a stop's signal and a judgment the
// scenes read a process's life AT ONCE (the stranger, the hub's launcher) or after a FIXED span (the escapee 200 ms, the deaf escapee
// 300 ms), and the force scene's log after a 3 s wait that ended SILENTLY. A signalled process is not dead the instant its signal is sent:
// the kernel ends it when it next runs (a loaded machine: milliseconds, or more). THE FACT a judgment reads instead (`quietOrGone`): the
// process is GONE (or a zombie), or QUIET — asleep (state S), no signal pending to it or its process, not exiting (PF_EXITING) — so
// nothing sent before the read can still end it. Every such wait is on its fact with a generous bound; an expiry is a NAMED harness line
// (`expired`), which each suite judges in one leg — never a silent read of whatever is there
const PF_EXITING = 0x4, SETTLE_MS = 20000, FORCED_MS = 20000;
const expired = [];
const quietOrGone = (id) => {
  if (PI.aliveIdentity(id) !== true) return true;
  try {
    const st = fs.readFileSync(`/proc/${Number(id.pid)}/stat`, 'utf8'), f = st.slice(st.lastIndexOf(')') + 2).split(' ');
    const status = fs.readFileSync(`/proc/${Number(id.pid)}/status`, 'utf8');
    const pending = ['SigPnd', 'ShdPnd'].some((k) => { const m = status.match(new RegExp(`^${k}:\\s*([0-9a-f]+)`, 'm')); return !m || BigInt('0x' + m[1]) !== 0n; });
    return f[0] === 'S' && (Number(f[6]) & PF_EXITING) === 0 && !pending;
  } catch { return PI.aliveIdentity(id) !== true; }
};
const settleOn = async (id, what) => {
  if (await until(() => quietOrGone(id), SETTLE_MS)) return true;
  let st = null; try { st = fs.readFileSync(`/proc/${Number(id.pid)}/status`, 'utf8').split('\n').filter((l) => /^(State|SigPnd|ShdPnd):/.test(l)).join('; '); } catch { }
  expired.push(`${what}: neither gone nor quiet ${SETTLE_MS / 1000} s after the stop answered (${st || 'unreadable'})`);
  return false;
};
const jobScene = async (wrapperText, tag, { force = false, argv = null, signalAlone = false, before = null, ready = null, jobsMod = null, deps = {}, refusal = null } = {}) => {
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), wrapperText);
  const marker = path.join(dd, 'queue.lock'), heard = path.join(dd, 'heard');
  const { JobManager } = jobsMod || require(path.join(ROOT, 'src/jobs.js'));   // B-7ca1: a control's copy of the engine
  const logs = [];
  const jm = new JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [], ...deps });   // deps: B-d8f4's grace seam (memorySample.stopMs)
  jm.init();
  const caller = { conversationId: 'conv-st', sessionId: 'sess-st', sessionCreatedAt: 1, groups: new Set() };
  const owner = { conversation: { backend: 'claude', id: 'conv-st' }, sessionId: 'sess-st', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
  // the pipeline's shape: a waiter holding the queue's lock in a session of its own with no environ (it cleans up on its first
  // SIGTERM and writes each one it hears), a child under timeout
  const waiter = `trap 'echo TERM >> ${JSON.stringify(heard)}; sleep 0.3; exit 0' TERM; while :; do sleep 0.1; done`;
  const cmd = argv || ['sh', '-c', `setsid env -i flock ${JSON.stringify(marker)} sh -c ${JSON.stringify(waiter)} & timeout 305 sleep 305 & wait`];
  const r = jm.create({ kind: 'task', name: 'pipeline', cmd: { argv: cmd }, owner }, caller);
  const job = jm.jobs.get(r.job.id);
  let tree = [];
  let stamp = null;
  await until(async () => { const st = jm._readStamp(job); if (!st || !jm._verifyAlive(st)) return false; stamp = st; tree = PI.treeOf([Number(st.pid)], { since: Number(st.starttime) || 0 }); return ready ? ready(tree) : tree.some((m) => m.comm === 'flock') && tree.filter((m) => m.comm === 'sleep').length >= 2; }, 8000);
  mine.push(...tree);
  const held = spawnSync('flock', ['-n', marker, 'true']).status !== 0;
  const pre = before ? await before({ dd, stamp, tree, jm }) : null;   // r1979: a scene's before may wait on its own state (escScene's settle)
  const heldOut = !!stamp && PI.keptOut([]).some((x) => x[0] === Number(stamp.pid));   // the engine keeps its wrappers out of other stops' walks
  if (signalAlone) process.kill(Number(stamp.pid), 'SIGTERM'); else jm.stop(job, { force });
  const logNow = () => { try { const run = job.runs[job.runs.length - 1]; return fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'current.log'), 'utf8'); } catch { return ''; } };
  if (refusal) await until(() => refusal.test(logNow()), 4000);   // B-2c5c r1263: a REFUSED stop is read by its line — the job runs on (never waited out)
  else {
    await until(async () => { await jm._sweep(); return ['interrupted', 'failed', 'done'].includes(job.state); }, 8000);
    const kept = (m) => !!(pre && pre.keep && pre.keep.has(m.pid));   // what the scene expects to live on (never waited for)
    await until(() => tree.filter((m) => !kept(m)).every((m) => PI.aliveIdentity(m) === false), 4000);
    // B-d8f4 (9): the forced end's mark kill lands when its walk ANSWERS (a child through the starter, off the hub's thread) — the scene
    // judges after that answer, never inside it (a wait on the engine's own state: markWalksSettled; the release's copies have none)
    if (typeof jm.markWalksSettled === 'function') await jm.markWalksSettled();
  }
  const after = pre && pre.after ? await pre.after() : null;   // read before this scene ends what is left
  const left = tree.filter((m) => PI.aliveIdentity(m) === true);
  const free = spawnSync('flock', ['-n', marker, 'true']).status === 0;
  const terms = (() => { try { return fs.readFileSync(heard, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } })();
  const readLog = () => { try { const run = job.runs[job.runs.length - 1]; return fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'current.log'), 'utf8'); } catch { return ''; } };
  if (force && !(await until(() => forcedLanded(logs, job.id, readLog()), FORCED_MS))) {   // r4294: the wait on its fact, generous — its expiry NAMED
    expired.push(`${tag}: the forced end's sentences the journal holds did not all reach the job's log in ${FORCED_MS / 1000} s — the journal: ${JSON.stringify(logs.filter((l) => l.includes(job.id) && l.includes('its forced end')))}; the log's [jobs] lines: ${JSON.stringify(readLog().split('\n').filter((l) => l.startsWith('[jobs]')))}`);
  }   // the engine's lines land off the loop — r3888: every one the journal holds
  const log = readLog();
  const said = logs.filter((l) => l.includes(job.id)).join(' | ');
  let intent = null; try { const run = job.runs[job.runs.length - 1]; intent = JSON.parse(fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'stop.json'), 'utf8')); } catch { }
  for (const m of left) PI.signalIdentity(m, 'SIGKILL');
  try { jm.shutdown(); } catch { }
  return { tree, left, held, free, terms, state: job.state, log, said, intent, heldOut, after };
};
const timed = (fn) => async (...a) => { const t0 = Date.now(), r = await fn(...a); r.ms = Date.now() - t0; console.log(`  · ${a[1]}: ${r.ms} ms, the job ${r.state}`); return r; };   // each scene's own time, printed
const escScene = timed(async (wrapperText, tag, opts = {}) => {
  const ESC = path.join(D, tag, 'esc.pid');
  const argv = ['sh', '-c', `(setsid sh -c 'echo $$ > ${JSON.stringify(ESC)}; exec sleep 318' &); timeout 319 sleep 319 & wait`];
  return jobScene(wrapperText, tag, { ...opts, argv,
    ready: (tree) => tree.some((m) => m.comm === 'timeout') && fs.existsSync(ESC) && fs.readFileSync(ESC, 'utf8').trim().length > 0,
    before: async ({ tree, jm }) => {
      const pid = Number(fs.readFileSync(ESC, 'utf8').trim()), id = PI.identityOf(pid); mine.push(id);
      const job = [...jm.jobs.values()][0], ownGroup = PI.pgidOf(pid) === pid, inTree = tree.some((m) => m.pid === pid);   // read BEFORE the stop (its read's NIT)
      // its read's MUST: a STRANGER carrying the job's mark but ANOTHER run's (an earlier run's leftover forks it during this run) —
      // started after the wrapper, outside its group: a stop of THIS run never ends it
      // its read r2 (MUST): the stranger is NOT the hub's child (this suite is the hub: the keep-out would spare it by its parent chain,
      // and the run's mark would go untested) — a subshell that exits re-parents it, as an earlier run's leftover's fork is
      const STR = path.join(D, tag, 'stranger.pid');
      // 主开发 r1979 (THE PLACED STALL, no load): opts.stall — the stranger writes its pid, then waits on a FIFO UNMARKED, then execs into
      // its marked sleep: its window (pid written, its mark not yet what the walk reads) held open at will
      const FIFO = path.join(D, tag, 'stranger.go'), MARKS = [`VIBESPACE_JOB_ID=${job.id}`, `VIBESPACE_JOB_RUN=${job.id}:1`];
      const bare = { ...process.env }; delete bare.VIBESPACE_JOB_ID; delete bare.VIBESPACE_JOB_RUN;
      if (opts.stall) spawnSync('mkfifo', [FIFO]);
      const body = opts.stall ? `echo $$ > ${JSON.stringify(STR)}; read go < ${JSON.stringify(FIFO)}; exec env ${MARKS.join(' ')} sleep 320` : `echo $$ > ${JSON.stringify(STR)}; exec sleep 320`;
      spawnSync('sh', ['-c', `(setsid sh -c '${body}' &)`], { env: opts.stall ? bare : { ...process.env, VIBESPACE_JOB_ID: job.id, VIBESPACE_JOB_RUN: `${job.id}:1` }, stdio: 'ignore' });
      let spid = 0; for (let k = 0; k < 100 && !(spid > 1); k++) { try { spid = Number(fs.readFileSync(STR, 'utf8').trim()); } catch { } if (!(spid > 1)) spawnSync('sleep', ['0.02']); }
      const sid = PI.identityOf(spid); mine.push(sid);
      const strangerOwn = PI.ppidOf(spid) !== process.pid && PI.pgidOf(spid) === spid;   // re-parented, its own group
      // 主开发 r1979: THE SCENE HOLDS STILL before its stop — a pid file says a process began, not that it is what the stop's walk will
      // read: between its `echo $$` and its `exec sleep`, exec pages the binary in (D state: membersOf never reads it, by law) and builds
      // the new image (its environ reads EMPTY: not even counted unread). Settled = its exec landed (`sleep`), state S, and its mark
      // read by the walk's OWN reader (membersOf over that one process). A wait on state: the guard only ends a wait that never comes
      const settledNow = (p, mark) => { try { return PI.stateOf(p) === 'S' && fs.readFileSync(`/proc/${p}/comm`, 'utf8').trim() === 'sleep' && PI.membersOf({ mark, first: [p], maxRows: 0 }).some((m) => Number(m.pid) === p); } catch { return false; } };
      let released = false;
      const release = () => { if (released) return; released = true; spawnSync('timeout', ['3', 'sh', '-c', `echo go > ${JSON.stringify(FIFO)}`], { stdio: 'ignore' }); };
      if (opts.stall && opts.settle !== false) setTimeout(release, 300);   // the window held open 300 ms by the leg, then released (the stall placed)
      const settled = opts.settle === false ? null : { escapee: await until(() => settledNow(pid, MARKS[0]), 5000), stranger: await until(() => settledNow(spid, MARKS[0]), 5000) };
      return { after: async () => {
        await settleOn(id, `${tag}: the escapee`); await settleOn(sid, `${tag}: the stranger`);   // r4294: each read on its fact (gone, or quiet), never at once
        const alive = PI.aliveIdentity(id) === true, stranger = PI.aliveIdentity(sid) === true, run = job && job.runs[job.runs.length - 1];
        if (alive) PI.signalIdentity(id, 'SIGKILL');
        if (stranger) PI.signalIdentity(sid, 'SIGKILL');
        let view = null; try { view = ((jm.snapshot(job) || {}).run || {}).left || null; } catch (e) { view = { threw: String(e && e.message) }; }   // the API's view (the card's row reads it)
        let viewCut = null; if (opts.viewMod) { try { viewCut = ((opts.viewMod.JobManager.prototype.snapshot.call(jm, job) || {}).run || {}).left || null; } catch (e) { viewCut = { threw: String(e && e.message) }; } }   // the control's view, over THIS run (no scene of its own)
        return { pid, alive, stranger, strangerOwn, inTree, ownGroup, left: (run && run.left) || null, view, viewCut, settled };
      } };
    } });
});
return { jobScene, timed, escScene, settleOn, quietOrGone, expired };
}
