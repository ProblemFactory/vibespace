#!/usr/bin/env node
// test-stop-rung — B-d8f4 (lane bl-jobs, 2026-11-21; moved out of test-stop-tree for its fast bound): a task's stop on the GROUP RUNG
// (no scope) — its counts and its words, on the REAL wrapper and engine: no /proc placed (two errnos), the drain's early return, an
// escapee that ignores SIGTERM, a signal that does not land (EPERM, placed), the engine's mark kill over a stubbed scan.
// (the header below is test-stop-tree's: the same helpers) src/proc-identity.js childTreeOf /
// treeOf read the tree under a root by the PARENT CHAIN (the children lists: the tree's own cost, synchronous) BEFORE the first
// signal; endTree ends members through the identity-checked signal, the grace, the hard signal; treeLine says it. The doors: a
// job's stop through its WRAPPER's one table (data/bin/job-wrapper.js carries childTreeOf as a SHIPPED TWIN — pinned here), the
// engine's SIGKILL of a force stop / its kill step (_killTree), a local conversation's kill (ws-handler, survivors only).
// FAST, in-process: every process is this suite's own child (sh, sleep, setsid, env, timeout, flock), each ended at exit.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(condition, name): the name is no string — a swapped call'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(20); } return !!(await fn()); };
const mine = [];   // every identity this suite made or found under its own children — ended at exit, by identity
const endMine = () => { for (const id of mine) { try { if (id) PI.signalIdentity(id, 'SIGKILL'); } catch { } } };
process.on('exit', endMine);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { endMine(); process.exit(1); });
const have = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const TOOLS = ['setsid', 'timeout', 'env', 'flock'].filter((c) => !have(c));
if (TOOLS.length) { console.log(`SKIP (by name): this machine has no ${TOOLS.join(', ')}`); process.exit(0); }
const D = scratch('stop-rung'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
process.on('exit', () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
const WRAP = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8');
const MJ = mutantCopies('stop-rung', ROOT);
const jobScene = async (wrapperText, tag, { force = false, argv = null, signalAlone = false, before = null, ready = null, jobsMod = null, deps = {} } = {}) => {
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
  const pre = before ? before({ dd, stamp, tree, jm }) : null;
  const heldOut = !!stamp && PI.keptOut([]).some((x) => x[0] === Number(stamp.pid));   // the engine keeps its wrappers out of other stops' walks
  if (signalAlone) process.kill(Number(stamp.pid), 'SIGTERM'); else jm.stop(job, { force });
  await until(async () => { await jm._sweep(); return ['interrupted', 'failed', 'done'].includes(job.state); }, 8000);
  const kept = (m) => !!(pre && pre.keep && pre.keep.has(m.pid));   // what the scene expects to live on (never waited for)
  await until(() => tree.filter((m) => !kept(m)).every((m) => PI.aliveIdentity(m) === false), 4000);
  const after = pre && pre.after ? await pre.after() : null;   // read before this scene ends what is left
  const left = tree.filter((m) => PI.aliveIdentity(m) === true);
  const free = spawnSync('flock', ['-n', marker, 'true']).status === 0;
  const terms = (() => { try { return fs.readFileSync(heard, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } })();
  const readLog = () => { try { const run = job.runs[job.runs.length - 1]; return fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'current.log'), 'utf8'); } catch { return ''; } };
  if (force) await until(() => readLog().includes('[jobs] stop: its forced end'), 3000);   // the engine's line lands off the loop
  const log = readLog();
  const said = logs.filter((l) => l.includes(job.id)).join(' | ');
  let intent = null; try { const run = job.runs[job.runs.length - 1]; intent = JSON.parse(fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'stop.json'), 'utf8')); } catch { }
  for (const m of left) PI.signalIdentity(m, 'SIGKILL');
  try { jm.shutdown(); } catch { }
  return { tree, left, held, free, terms, state: job.state, log, said, intent, heldOut, after };
};

console.log('§1 B-d8f4 — the group rung\'s counts and words (the scenes run together)');
{
  const timed = (fn) => async (...a) => { const t0 = Date.now(), r = await fn(...a); r.ms = Date.now() - t0; console.log(`  · ${a[1]}: ${r.ms} ms, the job ${r.state}`); return r; };   // each scene's own time, printed
  const escScene = timed(async (wrapperText, tag, opts = {}) => {
    const ESC = path.join(D, tag, 'esc.pid');
    const argv = ['sh', '-c', `(setsid sh -c 'echo $$ > ${JSON.stringify(ESC)}; exec sleep 318' &); timeout 319 sleep 319 & wait`];
    return jobScene(wrapperText, tag, { ...opts, argv,
      ready: (tree) => tree.some((m) => m.comm === 'timeout') && fs.existsSync(ESC) && fs.readFileSync(ESC, 'utf8').trim().length > 0,
      before: ({ tree, jm }) => {
        const pid = Number(fs.readFileSync(ESC, 'utf8').trim()), id = PI.identityOf(pid); mine.push(id);
        const job = [...jm.jobs.values()][0], ownGroup = PI.pgidOf(pid) === pid, inTree = tree.some((m) => m.pid === pid);   // read BEFORE the stop (its read's NIT)
        // its read's MUST: a STRANGER carrying the job's mark but ANOTHER run's (an earlier run's leftover forks it during this run) —
        // started after the wrapper, outside its group: a stop of THIS run never ends it
        // its read r2 (MUST): the stranger is NOT the hub's child (this suite is the hub: the keep-out would spare it by its parent chain,
        // and the run's mark would go untested) — a subshell that exits re-parents it, as an earlier run's leftover's fork is
        const STR = path.join(D, tag, 'stranger.pid');
        spawnSync('sh', ['-c', `(setsid sh -c 'echo $$ > ${JSON.stringify(STR)}; exec sleep 320' &)`], { env: { ...process.env, VIBESPACE_JOB_ID: job.id, VIBESPACE_JOB_RUN: `${job.id}:1` }, stdio: 'ignore' });
        let spid = 0; for (let k = 0; k < 100 && !(spid > 1); k++) { try { spid = Number(fs.readFileSync(STR, 'utf8').trim()); } catch { } if (!(spid > 1)) spawnSync('sleep', ['0.02']); }
        const sid = PI.identityOf(spid); mine.push(sid);
        const strangerOwn = PI.ppidOf(spid) !== process.pid && PI.pgidOf(spid) === spid;   // re-parented, its own group
        return { after: async () => {
          await until(() => PI.aliveIdentity(id) === false, 200);   // the drain (or the engine's SIGKILL) ended it before the run's end — its reaping by the subreaper is what is left: milliseconds
          const alive = PI.aliveIdentity(id) === true, stranger = PI.aliveIdentity(sid) === true, run = job && job.runs[job.runs.length - 1];
          if (alive) PI.signalIdentity(id, 'SIGKILL');
          if (stranger) PI.signalIdentity(sid, 'SIGKILL');
          let view = null; try { view = ((jm.snapshot(job) || {}).run || {}).left || null; } catch (e) { view = { threw: String(e && e.message) }; }   // the API's view (the card's row reads it)
          let viewCut = null; if (opts.viewMod) { try { viewCut = ((opts.viewMod.JobManager.prototype.snapshot.call(jm, job) || {}).run || {}).left || null; } catch (e) { viewCut = { threw: String(e && e.message) }; } }   // the control's view, over THIS run (no scene of its own)
          return { pid, alive, stranger, strangerOwn, inTree, ownGroup, left: (run && run.left) || null, view, viewCut };
        } };
      } });
  });
  const LS = "  if (!taskStop && !keeps && stopping) {";
  // B-d8f4 (10): WHERE THERE IS NO /proc the sweep cannot run — said in the job's log, never silent. The absence is PLACED in a copy: its
  // escapee scan lists a /proc path that does not exist (every other /proc read of the wrapper stays real). CONTROL: the copy without the line
  const NP = "  try { ents = fs.readdirSync('/proc').filter((e) => /^\\d+$/.test(e))";
  const noProc = anchored(WRAP, NP, "  try { ents = fs.readdirSync('/proc/b-d8f4-none').filter((e) => /^\\d+$/.test(e))", 'd8f4-no-proc');
  const noList = anchored(WRAP, NP, "  try { ents = fs.readdirSync('/proc/self/stat').filter((e) => /^\\d+$/.test(e))", 'd8f4-no-list');   // r902: the OTHER branch — a listing that fails with another errno (placed: ENOTDIR)
  const NPW = "    if (o && o.none && stopping && !saidNone) {";
  const noProcSilent = anchored(noProc, NPW, "    if (false) {", 'd8f4-no-proc-silent');
  // r902: the drain's early returns — nothing alive at the drain (a tree member in a group of its own that the stop step's SIGTERM ended at
  // once: a bare sleep has no handler), and the exit record still counts what the stop reached. CONTROL: the fold cut (the release's returns)
  const foldScene = timed(async (wrapperText, tag) => jobScene(wrapperText, tag, { argv: ['sh', '-c', 'setsid sleep 337 & wait'],
    ready: (tree) => tree.some((m) => m.comm === 'sleep'),
    before: ({ jm }) => { const job = [...jm.jobs.values()][0]; return { after: async () => ({ left: (job && job.runs[job.runs.length - 1] || {}).left || null }) }; } }));
  const FOLD = "  if (!left.length && !out.length && !stepReached.length) return {};";
  const foldCut = anchored(WRAP, FOLD, "  if (!left.length && !out.length) return {};   /* MUTANT: the release's early return */", 'd8f4-fold-cut');
  // B-d8f4 UNIT 2 — (8)'s legs on the REAL wrapper, a 400 ms grace (the engine's seam: memorySample.stopMs)
  const GRACE = { memorySample: { stopMs: 400 } };
  // (8a) THE KILL PASS'S OWN FILTER: an escapee of this run that IGNORES the polite signal (SIG_IGN survives its exec) — the stop step's
  // SIGTERM does nothing, the drain waits the grace, the kill pass ends it (killed: counted outside). CONTROL: the kill pass without its
  // escapees (the filter cut) — it is left running
  const deafScene = timed(async (wrapperText, tag) => {
    const E = path.join(D, tag, 'deaf.pid');
    return jobScene(wrapperText, tag, { deps: GRACE, argv: ['sh', '-c', `(setsid sh -c 'trap "" TERM; echo $$ > ${JSON.stringify(E)}; exec sleep 343' &); sleep 344 & wait`],
      ready: () => fs.existsSync(E) && Number(fs.readFileSync(E, 'utf8').trim()) > 1,
      before: ({ jm }) => { const id = PI.identityOf(Number(fs.readFileSync(E, 'utf8').trim())); mine.push(id); const job = [...jm.jobs.values()][0];
        return { after: async () => { await until(() => PI.aliveIdentity(id) === false, 300); const alive = PI.aliveIdentity(id) === true; if (alive) PI.signalIdentity(id, 'SIGKILL'); return { alive, left: (job.runs[job.runs.length - 1] || {}).left || null }; } }; } });
  });
  const KF = "    const esc = mine ? rawE : taskStop ? rawE.filter(ours) : [];";
  const killFilterCut = anchored(WRAP, KF, "    const esc = mine ? rawE : [];   /* MUTANT: the kill pass without this run's escapees */", 'd8f4-kill-filter');
  // (unit 1's round, lens 1) A SIGTERM THAT DID NOT LAND (EPERM) never makes a process «reached»: PLACED in a copy — both its signals to
  // the re-parented escapee throw EPERM (the pid is read from the scene's own file). It is left running, said «not stopped», never counted
  // outside. CONTROL: the copy counting by «termed» alone (the unit-1 count)
  const EP = path.join(D, 'esc-eperm', 'esc.pid'), EPX = path.join(D, 'esc-eperm-mut', 'esc.pid');
  const epermOf = (pidFile) => {
    const T1 = "try { process.kill(p[0], 'SIGTERM'); rec.ok = true; return true; } catch { return false; } };";
    const T2 = "const killNow = (p) => { if (!same(p)) return false; try { process.kill(p[0], 'SIGKILL'); return true; } catch { return false; } };";
    const thrower = `(() => { let x = ''; try { x = fs.readFileSync(${JSON.stringify(pidFile)}, 'utf8').trim(); } catch { } if (String(p[0]) === x) throw Object.assign(new Error('EPERM (placed)'), { code: 'EPERM' }); })(); `;
    return anchored(anchored(WRAP, T1, `try { ${thrower}process.kill(p[0], 'SIGTERM'); rec.ok = true; return true; } catch { return false; } };`, 'd8f4-eperm-term'), T2, `const killNow = (p) => { if (!same(p)) return false; try { ${thrower}process.kill(p[0], 'SIGKILL'); return true; } catch { return false; } };`, 'd8f4-eperm-kill');
  };
  const HEARD = "const landed = (k) => !!(termed.get(k) || {}).ok;";
  const epermOld = anchored(epermOf(EPX), HEARD, "const landed = (k) => termed.has(k);   /* MUTANT: «termed» alone */", 'd8f4-heard-cut');
  const treeOutOf = (r) => { const m = ((r && r.log) || '').match(/stop: (\d+) process(?:es)? it started outside its group \([^)]*\) hears? it from the wrapper(?: \((\d+) could not be signalled)?/); return m ? Number(m[1]) - Number(m[2] || 0) : 0; };
  const [np, npx, nl, fo, fox, dp, dpx, ep, epx] = await Promise.all([
    escScene(noProc, 'esc-no-proc'),
    escScene(noProcSilent, 'esc-no-proc-mut'),
    escScene(noList, 'esc-no-list'),
    foldScene(WRAP, 'fold'),
    foldScene(foldCut, 'fold-mut'),
    deafScene(WRAP, 'deaf'),
    deafScene(killFilterCut, 'deaf-mut'),
    escScene(epermOf(EP), 'esc-eperm', { deps: GRACE }),   // the escapee no signal reaches: the drain waits the grace, never the default 10 s
    escScene(epermOld, 'esc-eperm-mut', { deps: GRACE })
  ]);
  ok(np.after && np.after.alive && /this machine has no process file system \(\/proc\)/.test(np.log), 'B-d8f4 (10): where the escapee scan cannot list /proc (placed: the copy\'s path does not exist) the re-parented child is not found — and the job\'s log SAYS so', { alive: np.after && np.after.alive, log: (np.log || '').slice(-400) });
  ok(npx.after && npx.after.alive && !/no process file system/.test(npx.log || ''), 'CONTROL (B-d8f4 (10), the line cut, in a copy): the child is left running and nothing says why (red)', { alive: npx.after && npx.after.alive });
  ok(nl.after && nl.after.alive && /it could not list the processes in \/proc \(ENOTDIR\) — what left its group cannot be found/.test(nl.log || ''), 'B-d8f4 (10, 主开发 r902): a listing that fails with ANOTHER errno (placed: ENOTDIR) — said with its errno, never as «no process file system»', { alive: nl.after && nl.after.alive, log: (nl.log || '').slice(-300) });
  const kFo = treeOutOf(fo), kFox = treeOutOf(fox);
  console.log(`    facts (r902 fold) ${JSON.stringify({ fo: { left: fo.after && fo.after.left, k: kFo }, fox: { left: fox.after && fox.after.left, k: kFox } })}`);
  ok(fo.after && kFo === 1 && fo.after.left && fo.after.left.n === 1 && fo.after.left.outside === 1, 'B-d8f4 (主开发 r902): nothing alive at the drain — the stop step\'s SIGTERM ended the tree\'s member in a group of its own at once — and the exit record still counts it (n 1, outside 1)', { left: fo.after && fo.after.left, k: kFo });
  ok(fox.after && kFox === 1 && !(fox.after.left && fox.after.left.n), 'CONTROL (the fold cut, in a copy): the release\'s early return — the record has no count at all (red)', { left: fox.after && fox.after.left, k: kFox });
  console.log(`    facts (B-d8f4 unit 2) ${JSON.stringify({ deaf: dp.after, deafCut: dpx.after, eperm: ep.after && ep.after.left, epermOld: epx.after && epx.after.left })}`);
  ok(dp.after && !dp.after.alive && dp.after.left && dp.after.left.outside === 1 && dp.after.left.force, 'B-d8f4 (8): an escapee of this run that IGNORES the polite signal is ended by the kill pass at the grace — counted outside its group, the stop said «by force»', dp.after);
  ok(dpx.after && dpx.after.alive, 'CONTROL (the kill pass without this run\'s escapees, in a copy): the deaf escapee is left running (red)', dpx.after);
  const kEp = treeOutOf(ep), kEpx = treeOutOf(epx);
  ok(ep.after && ep.after.alive && ep.after.left && ep.after.left.outside === kEp && (ep.after.left.escaped || 0) >= 1, 'B-d8f4 (unit 1\'s round): an escapee whose signals did not land (EPERM, placed) is left running and said «not stopped» — never counted outside its group', { left: ep.after && ep.after.left, k: kEp });
  ok(epx.after && epx.after.left && epx.after.left.outside === kEpx + 1, 'CONTROL (the count by «termed» alone, in a copy): the escapee no signal reached is counted outside (red)', { left: epx.after && epx.after.left, k: kEpx });
  // §2's words control: the engine copy with its failed-listing words cut (§2 below reads it)
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const NW = " + (mscan.unread ? ` — its mark's scan could not list the processes (${mscan.unread}): what left its group may be left` : '');";   // B-d8f4 (10)
  ok(JSRC.split(NW).length === 2, 'control setup: the engine\'s words for a failed listing are found once in jobs.js');
  const noMark = MJ.load('src/jobs.js', anchored(JSRC, NW, ";   /* MUTANT: a failed listing unsaid */", 'd8f4-unread-words'), 'd8f4-unread-words');
  console.log('§2 B-d8f4 — the engine\'s mark kill (a force stop on the group rung): its exclusions, and its words for a cut scan and a failed listing');
  {
    // the engine's _killTree over a STUBBED scan (the same proc-identity module the engine requires): what it signals is recorded, nothing
    // real is signalled. The members its mark's scan returns: the job's WRAPPER (the caller's own signal), THE HUB (this process), a holder
    // another stop keeps out (PI.keptOut), and a stranger of this run's — only the stranger is the mark kill's. The fake pids sit above the
    // kernel's limit (4194304): no process can hold them. Each control takes ONE exclusion's input away (no copy loaded)
    const WRAPPER = 4194305, KEPT = 4194306, STR = 4194307;
    let seq12 = 0;
    const engineKill = (Mod, tag, { members, scan, keptOut = [[KEPT, 1]], stampPid = WRAPPER, hubOff = false }) => {
      const dd = path.join(D, tag); fs.mkdirSync(dd, { recursive: true });
      const logs = [];
      const jm = new Mod.JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
      if (hubOff) jm._hubTest = () => () => false;
      const job = { id: 'jb-d8f4' + String(++seq12).padStart(4, '0'), kind: 'task', runs: [{ startedAt: 1700000000000 }] };
      const keep = {}; for (const k of ['treeOf', 'membersOf', 'signalIdentity', 'keptOut', 'pgidOf']) keep[k] = PI[k];
      const sent = [];
      PI.treeOf = () => []; PI.membersOf = () => Object.assign(members.map((pid) => ({ pid, starttime: 5, bootId: 'b' })), { scan }); PI.signalIdentity = (id) => { sent.push(id.pid); return { ok: true }; }; PI.keptOut = () => keptOut; PI.pgidOf = () => 0;
      try { jm._killTree(job, { pid: stampPid, starttime: 1 }, { group: true }); } finally { Object.assign(PI, keep); }
      try { jm.shutdown(); } catch { }
      return { sent, said: logs.join(' | ') };
    };
    const ALL = [WRAPPER, process.pid, KEPT, STR], whole = { scanned: 4, total: 4, cut: false }, real = require(path.join(ROOT, 'src/jobs.js'));
    const ex = engineKill(real, 'mark-excl', { members: ALL, scan: whole });
    ok(JSON.stringify(ex.sent) === JSON.stringify([STR]) && /1 process carrying its run's mark outside its group \(re-parented\)/.test(ex.said), 'B-d8f4 (8): the engine\'s mark kill signals only the stranger of this run — never its wrapper, the hub, or what another stop keeps out', ex);
    const exK = engineKill(real, 'mark-excl-ko', { members: ALL, scan: whole, keptOut: [] });
    const exH = engineKill(real, 'mark-excl-hub', { members: ALL, scan: whole, hubOff: true });
    const exW = engineKill(real, 'mark-excl-wrap', { members: ALL, scan: whole, stampPid: 4194308 });
    ok(exK.sent.includes(KEPT) && exH.sent.includes(process.pid) && exW.sent.includes(WRAPPER), 'CONTROLS (each exclusion\'s input taken away): no keep-out — the held process is signalled; no hub test — the HUB is signalled; another wrapper stamp — this wrapper is signalled (red, each)', { keptOut: exK.sent, hub: exH.sent, wrapper: exW.sent });
    const cut = engineKill(real, 'mark-cut', { members: [STR], scan: { scanned: 5, total: 9, cut: true } });
    ok(/its mark's scan read 5 of 9 processes: what left its group may be left/.test(cut.said), 'B-d8f4 (8): a mark scan cut at its bound is said with its count — «its mark\'s scan read 5 of 9 processes»', cut.said);
    const unread = engineKill(real, 'mark-unread', { members: [], scan: { scanned: 0, total: 0, cut: false, unread: 'EMFILE' } });
    ok(/its forced end — its mark's scan could not list the processes \(EMFILE\): what left its group may be left/.test(unread.said) && !/killed 0/.test(unread.said), 'B-d8f4 (10): a force stop whose mark scan could not list the processes says so with its errno (the hub\'s log); 主开发 r902: nothing killed never opens with «killed 0»', unread.said);
    const unreadX = engineKill(noMark, 'mark-unread-mut', { members: [], scan: { scanned: 0, total: 0, cut: false, unread: 'EMFILE' } });
    ok(!/could not list the processes/.test(unreadX.said), 'CONTROL (the words cut, in a copy): a failed listing and nothing said (red)', unreadX.said);
  }
}
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 0, label: 'B-d8f4 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
