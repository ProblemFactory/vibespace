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
import { inProcessWalker } from './lib/mark-walk-in-process.mjs';   // B-d8f4 (9): the engine's mark walk left the hub's loop — this suite's membersOf stub answers it in-process
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
import { stopScenes } from './lib/stop-scenes.mjs';
const { jobScene, timed, escScene, settleOn, quietOrGone, expired } = stopScenes({ D, mine, ROOT });

console.log('§1 B-d8f4 — the group rung\'s counts and words (the scenes run together)');
{
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
        return { after: async () => { await settleOn(id, `${tag}: the deaf escapee`); const alive = PI.aliveIdentity(id) === true; if (alive) PI.signalIdentity(id, 'SIGKILL'); return { alive, left: (job.runs[job.runs.length - 1] || {}).left || null }; } }; } });
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
  // 主开发 r1045 (THE LAW: every writer of the termed table says whether its signal landed): the ENGINE's group signal reaches a member of
  // the job's group, which then LEAVES the group (its TERM trap execs `setsid`: the same process, a session of its own) and ends during the
  // drain. The stop reached it — counted outside its group. CONTROL: the engine's mark on the group's members without its field (r1045's
  // shape: «not landed»: never counted)
  const leaverScene = timed(async (wrapperText, tag) => {
    const dd = path.join(D, tag); fs.mkdirSync(dd, { recursive: true });
    const LP = path.join(dd, 'leaver.pid'), LS = path.join(dd, 'leaver.sh');
    fs.writeFileSync(LS, `echo $$ > ${JSON.stringify(LP)}\ntrap 'sleep 0.15; exec setsid sleep 0.6' TERM\nwhile :; do sleep 0.05; done\n`);
    // the member is RE-PARENTED before the stop (its subshell exits) and stays in the job's group: in no tree the stop reads. It leaves the
    // group only 150 ms after the engine's signal (`exec setsid`, no child of its own) — the wrapper's stop step has read and marked it IN
    // the group by then (never an escapee there); the main ends 350 ms after it, so the drain's first scan finds the member outside
    return jobScene(wrapperText, tag, { deps: { memorySample: { stopMs: 1000 } }, argv: ['sh', '-c', `trap 'sleep 0.35; exit 0' TERM; (sh ${JSON.stringify(LS)} &); while :; do sleep 0.05; done`],
      ready: () => fs.existsSync(LP) && Number(fs.readFileSync(LP, 'utf8').trim()) > 1,
      before: ({ jm }) => { const id = PI.identityOf(Number(fs.readFileSync(LP, 'utf8').trim())); mine.push(id); const job = [...jm.jobs.values()][0];
        return { after: async () => { await until(() => PI.aliveIdentity(id) === false, 2000); const alive = PI.aliveIdentity(id) === true; if (alive) PI.signalIdentity(id, 'SIGKILL'); return { alive, left: (job.runs[job.runs.length - 1] || {}).left || null }; } }; } });
  });
  const ER = "if (p[2] === process.pid && !termed.has(termKey(p))) termed.set(termKey(p), { at, pass: 'stop', ok: true });";
  const engineRowsUnlanded = anchored(WRAP, ER, "if (p[2] === process.pid && !termed.has(termKey(p))) termed.set(termKey(p), { at, pass: 'stop' });   /* MUTANT: the field unset */", 'd8f4-engine-rows-landed');
  const [np, npx, nl, fo, fox, dp, dpx, ep, epx, lv, lvx] = await Promise.all([
    escScene(noProc, 'esc-no-proc'),
    escScene(noProcSilent, 'esc-no-proc-mut'),
    escScene(noList, 'esc-no-list'),
    foldScene(WRAP, 'fold'),
    foldScene(foldCut, 'fold-mut'),
    deafScene(WRAP, 'deaf'),
    deafScene(killFilterCut, 'deaf-mut'),
    escScene(epermOf(EP), 'esc-eperm', { deps: GRACE }),   // the escapee no signal reaches: the drain waits the grace, never the default 10 s
    escScene(epermOld, 'esc-eperm-mut', { deps: GRACE }),
    leaverScene(WRAP, 'leaver'),
    leaverScene(engineRowsUnlanded, 'leaver-mut')
  ]);
  console.log(`    facts (r1045 leaver) ${JSON.stringify({ leaver: lv.after, cut: lvx.after })}`);
  ok(lv.after && !lv.after.alive && lv.after.left && lv.after.left.outside === 1, 'B-d8f4 (主开发 r1045): a member the ENGINE\'s group signal reached, which then LEFT the group and ended during the drain, is the stop\'s — counted outside its group (every writer of the table says its signal landed)', lv.after);
  ok(lvx.after && !(lvx.after.left && lvx.after.left.outside), 'CONTROL (the engine\'s mark on the group without its field, in a copy): the member the stop reached is left out of what the stop reached — no count at all (red)', lvx.after);
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
  const NW = " + (mscan.unread ? ` — its mark's scan could not list the processes (${mscan.unread}): what left its group may be left` : '')";   // B-d8f4 (10) — (9) moved the line's end: the ended walk's words follow it
  ok(JSRC.split(NW).length === 2, 'control setup: the engine\'s words for a failed listing are found once in jobs.js');
  const noMark = MJ.load('src/jobs.js', anchored(JSRC, NW, " + ''   /* MUTANT: a failed listing unsaid */", 'd8f4-unread-words'), 'd8f4-unread-words');
  console.log('§2 B-d8f4 — the engine\'s mark kill (a force stop on the group rung): its exclusions, and its words for a cut scan and a failed listing');
  {
    // the engine's _killTree over a STUBBED scan (the same proc-identity module the engine requires): what it signals is recorded, nothing
    // real is signalled. The members its mark's scan returns: the job's WRAPPER (the caller's own signal), THE HUB (this process), a holder
    // another stop keeps out (PI.keptOut), and a stranger of this run's — only the stranger is the mark kill's. The fake pids sit above the
    // kernel's limit (4194304): no process can hold them. Each control takes ONE exclusion's input away (no copy loaded)
    const WRAPPER = 4194305, KEPT = 4194306, STR = 4194307;
    let seq12 = 0;
    const engineKill = async (Mod, tag, { members, scan, keptOut = [[KEPT, 1]], stampPid = WRAPPER, hubOff = false }) => {
      const dd = path.join(D, tag); fs.mkdirSync(dd, { recursive: true });
      const logs = [];
      const jm = new Mod.JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
      if (hubOff) jm._hubTest = () => () => false;
      const job = { id: 'jb-d8f4' + String(++seq12).padStart(4, '0'), kind: 'task', runs: [{ startedAt: 1700000000000 }] };
      const keep = {}; for (const k of ['treeOf', 'membersOf', 'signalIdentity', 'keptOut', 'pgidOf']) keep[k] = PI[k];
      const sent = [];
      PI.treeOf = () => []; PI.membersOf = () => Object.assign(members.map((pid) => ({ pid, starttime: 5, bootId: 'b' })), { scan }); PI.signalIdentity = (id) => { sent.push(id.pid); return { ok: true }; }; PI.keptOut = () => keptOut; PI.pgidOf = () => 0;
      const MW = require(path.join(ROOT, 'src/server/marked-walk.js')); MW.setRunImpl(inProcessWalker(PI));
      try { jm._killTree(job, { pid: stampPid, starttime: 1 }, { group: true }); if (typeof jm.markWalksSettled === 'function') await jm.markWalksSettled(); } finally { Object.assign(PI, keep); MW.setRunImpl(null); }   // B-d8f4 (9): the mark's kills land when its walk answers
      try { jm.shutdown(); } catch { }
      return { sent, said: logs.join(' | ') };
    };
    const ALL = [WRAPPER, process.pid, KEPT, STR], whole = { scanned: 4, total: 4, cut: false }, real = require(path.join(ROOT, 'src/jobs.js'));
    const ex = await engineKill(real, 'mark-excl', { members: ALL, scan: whole });
    ok(JSON.stringify(ex.sent) === JSON.stringify([STR]) && /1 process carrying its run's mark outside its group \(re-parented\)/.test(ex.said), 'B-d8f4 (8): the engine\'s mark kill signals only the stranger of this run — never its wrapper, the hub, or what another stop keeps out', ex);
    const exK = await engineKill(real, 'mark-excl-ko', { members: ALL, scan: whole, keptOut: [] });
    const exH = await engineKill(real, 'mark-excl-hub', { members: ALL, scan: whole, hubOff: true });
    const exW = await engineKill(real, 'mark-excl-wrap', { members: ALL, scan: whole, stampPid: 4194308 });
    ok(exK.sent.includes(KEPT) && exH.sent.includes(process.pid) && exW.sent.includes(WRAPPER), 'CONTROLS (each exclusion\'s input taken away): no keep-out — the held process is signalled; no hub test — the HUB is signalled; another wrapper stamp — this wrapper is signalled (red, each)', { keptOut: exK.sent, hub: exH.sent, wrapper: exW.sent });
    const cut = await engineKill(real, 'mark-cut', { members: [STR], scan: { scanned: 5, total: 9, cut: true } });
    ok(/its mark's scan read 5 of 9 processes: what left its group may be left/.test(cut.said), 'B-d8f4 (8): a mark scan cut at its bound is said with its count — «its mark\'s scan read 5 of 9 processes»', cut.said);
    const unread = await engineKill(real, 'mark-unread', { members: [], scan: { scanned: 0, total: 0, cut: false, unread: 'EMFILE' } });
    const HEAD = "what = [...(n ? [`${n} process${es(n)} it started outside its group (${[...new Set(killed)].join(', ') || '—'})`] : []), ...(escaped ? [`${escaped} process${es(escaped)} carrying its run's mark outside its group (re-parented)`] : [])], line = `its forced end${what.length ? ` killed ${what.join(' and ')}` : ''}`";
    const oldHead = MJ.load('src/jobs.js', anchored(JSRC, HEAD, "what = [], line = `its forced end killed ${[...(n || !escaped ? [`${n} process${es(n)} it started outside its group (${[...new Set(killed)].join(', ') || '—'})`] : []), ...(escaped ? [`${escaped} process${es(escaped)} carrying its run's mark outside its group (re-parented)`] : [])].join(' and ')}`   /* MUTANT: the old head */", 'd8f4-old-head'), 'd8f4-old-head');
    const unreadOld = await engineKill(oldHead, 'mark-unread-old', { members: [], scan: { scanned: 0, total: 0, cut: false, unread: 'EMFILE' } });
    ok(/its forced end killed 0 processes/.test(unreadOld.said), 'CONTROL (主开发 r1045: the old head, in a copy): a failed listing with nothing killed opens «killed 0 processes …» (red)', unreadOld.said);
    ok(/its forced end — its mark's scan could not list the processes \(EMFILE\): what left its group may be left/.test(unread.said) && !/killed 0/.test(unread.said), 'B-d8f4 (10): a force stop whose mark scan could not list the processes says so with its errno (the hub\'s log); 主开发 r902: nothing killed never opens with «killed 0»', unread.said);
    const unreadX = await engineKill(noMark, 'mark-unread-mut', { members: [], scan: { scanned: 0, total: 0, cut: false, unread: 'EMFILE' } });
    ok(!/could not list the processes/.test(unreadX.said), 'CONTROL (the words cut, in a copy): a failed listing and nothing said (red)', unreadX.said);
  }
}
// ── §11 (moved from scripts/test-stop-tree.mjs by the split of 主开发 r1529 (3), word for word): B-7ca1's group rung and B-d8f4 (7)/(8) ──
console.log('§11 B-7ca1 — the group rung (no scope): a TASK\'s stop ends what carries its mark outside its group, re-parented before the stop');
{
  // the reported shape where jobs have no scope (a container, a pod): a child that made its OWN group (setsid) and was re-parented
  // BEFORE the stop (its parent, a subshell, ended at once) — neither in the job's process group nor under the tree the stop reads;
  // it still carries the job's mark (VIBESPACE_JOB_ID, inherited). It writes its pid, so the scene can follow it
  // (a) a stop through the wrapper (its stop step and its drain)
  const VW = 'escaped: run.left.escaped || 0, outside: run.left.outside || 0, short: run.left.short || 0 } } : {})';
  const viewCut = MJ.load('src/jobs.js', anchored(fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8'), VW, 'escaped: run.left.escaped || 0, short: run.left.short || 0 } } : {})', 'b7ca1-view-cut'), 'b7ca1-view-cut');   // stale-pins: kept (the control plants the release's text in a copy)
  const TS = "  let taskStop = !keeps && !!stopping;", SS = "    for (const p of escapedOf()) if (keeps || p[2]) { if (termOnce(p) && !keeps) stopEsc.set(termKey(p), p); }";
  const LS = "  if (!taskStop && !keeps && stopping) {";   // B-d8f4 (its read, M1): the release had no late stop's branch either — without this cut the copy's road rode a race (the tree's timeout alive at the drain or not)
  const relEsc = anchored(anchored(anchored(WRAP, TS, "  let taskStop = false;   // MUTANT: the release — a task's escapees are said, not stopped", 'b7ca1-taskstop-cut'), SS, "    if (keeps) for (const p of escapedOf()) termOnce(p);", 'b7ca1-stopstep-cut'), LS, "  if (false) {", 'd8f4-late-cut');   // stale-pins: kept (the control plants the release's text in a copy)
  const OURS = "  const ours = (p) => !!p[2];";
  const anyRun = anchored(WRAP, OURS, "  const ours = () => true;   // MUTANT: the job's mark alone", 'b7ca1-run-mark-cut');
  // (b) a FORCE stop: the wrapper is SIGKILLed (its stop step never runs) — the ENGINE ends what carries THIS run's mark, beside the tree
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const MK = "      if (id.pid === Number(stamp.pid) || inTree.has(`${id.pid}:${id.starttime}`) || (!group && PI.pgidOf(id.pid) === Number(stamp.pid)) || hubs(id.pid) || ko.has(id.pid)) continue;";
  const RM = "mark: `VIBESPACE_JOB_RUN=${job.id}:${run0.startedAt}`";
  ok(JSRC.split(MK).length === 2 && JSRC.split(RM).length === 2, 'control setup: the engine\'s mark kill and its run\'s mark are found once each in jobs.js');
  const noMark = MJ.load('src/jobs.js', anchored(JSRC, MK, '      continue;   /* MUTANT: no mark kill */', 'b7ca1-engine-mark-cut'), 'b7ca1-engine-mark-cut');
  const jobMark = MJ.load('src/jobs.js', anchored(JSRC, RM, 'mark: `VIBESPACE_JOB_ID=${job.id}`', 'b7ca1-engine-runmark-cut'), 'b7ca1-engine-runmark-cut');
  // (c) its read r2 (S1): a task that restarted the hub with a LAUNCHER — `(setsid sh -c '<the hub> & echo $! > server.pid; wait' &)`:
  // the launcher carries this run's mark, sits in its own group, re-parented, and is the hub's PARENT (never under it): a stop of
  // this run never ends it (the engine's _hubAncestors; the wrapper's keptAncestors)
  const launchScene = timed(async (wrapperText, tag) => {
    const dd = path.join(D, tag), LP = path.join(dd, 'launcher.pid'), SP = path.join(dd, 'server.pid');
    const hub = `node -e "require('child_process').spawn('sleep', ['322'], { stdio: 'ignore' }); setInterval(() => { }, 1e9)"`;
    const argv = ['sh', '-c', `(setsid sh -c 'echo $$ > ${JSON.stringify(LP)}; ${hub.replace(/'/g, `'\\''`)} & echo $! > ${JSON.stringify(SP)}; wait' &); timeout 323 sleep 323 & wait`];
    return jobScene(wrapperText, tag, { argv, signalAlone: true,
      ready: (tree) => tree.some((m) => m.comm === 'timeout') && fs.existsSync(LP) && fs.existsSync(SP) && Number(fs.readFileSync(SP, 'utf8').trim()) > 1,
      before: () => {
        const lid = PI.identityOf(Number(fs.readFileSync(LP, 'utf8').trim())), hid = PI.identityOf(Number(fs.readFileSync(SP, 'utf8').trim())); mine.push(lid, hid);
        return { after: async () => { await settleOn(lid, `${tag}: the launcher`); await settleOn(hid, `${tag}: the hub`); const out = { launcher: PI.aliveIdentity(lid) === true, hub: PI.aliveIdentity(hid) === true };   // the run has ended: the stop's work is done (lesson (c): no fixed sleep)
          for (const x of [...PI.treeOf([hid.pid]), lid, hid]) if (PI.aliveIdentity(x) === true) PI.signalIdentity(x, 'SIGKILL'); return out; } };   // the stand-in's own sleep too (its read r3: it outlived the scene)
      } });
  });
  const KA = "    if ((kept && kept(e)) || anc.has(Number(e))) continue;";
  // B-d8f4 (7): THE «OUTSIDE» COUNT IS NEVER LOW — the escapee scene's `timeout` program is a member of the stop's TREE in a group of its own
  // (outside the job's group): the stop reaches it, so it is counted outside its group with the re-parented child (2). CONTROL: the count
  // before B-d8f4 (the first scan and the stop step only) — the tree's member outside the group is in n but not «outside» (1)
  const OC = "  const outsideReached = reachedKeys.length;";
  const oldCount = anchored(WRAP, OC, "  const outsideReached = runStopped.length; /* MUTANT: the count before B-d8f4 */", 'd8f4-outside-count');
  // the eight scenes are INDEPENDENT (their own folders, managers, marks and processes): they run together — the suite's time is the
  // slowest scene's, not their sum (it measured 9.9 s alone with them in a row; the fast tier's bound is 10 s)
  // 主开发 r902 (its round's race): the count the product keeps is what the stop step's signal HEARD — the line's total less its «(N could
  // not be signalled: gone, or not ours)» (the timeout program may end its sleep before the wrapper's own signal reads it again)
  const treeOutOf = (r) => { const m = ((r && r.log) || '').match(/stop: (\d+) process(?:es)? it started outside its group \([^)]*\) hears? it from the wrapper(?: \((\d+) could not be signalled)?/); return m ? Number(m[1]) - Number(m[2] || 0) : 0; };
  const [sa, sx, sr, fa, fx, fj, la, lx, ox, fjs, fjh] = await Promise.all([
    escScene(WRAP, 'esc-stop', { viewMod: viewCut }),
    escScene(relEsc, 'esc-stop-mut'),
    escScene(anyRun, 'esc-run-mut'),
    escScene(WRAP, 'esc-force', { force: true }),
    escScene(WRAP, 'esc-force-mut', { force: true, jobsMod: noMark }),
    escScene(WRAP, 'esc-force-jobmark', { force: true, jobsMod: jobMark }),
    launchScene(WRAP, 'esc-launcher'),
    launchScene(anchored(anchored(WRAP, KA, "    if (kept && kept(e)) continue;   // MUTANT: no ancestors kept", 'b7ca1-ancestors-cut'), '  const hub = Number(all.hub) || 0, above = hub > 1 && keep.has(hub) ? hubChain(hub, { stop: process.pid }).pids : new Set();\n', '  const hub = 0, above = new Set();   // MUTANT: no ancestors kept (r1263: nor the keep test\'s chain)\n', 'b7ca1-ancestors-cut-2'), 'esc-launcher-mut'),
    escScene(oldCount, 'esc-count-mut'),
    escScene(WRAP, 'esc-force-jobmark-stall', { force: true, jobsMod: jobMark, stall: true, settle: false }),   // 主开发 r1979: the stall placed, no settle
    escScene(WRAP, 'esc-force-jobmark-held', { force: true, jobsMod: jobMark, stall: true })   // the same stall, the scene held still
  ]);   // B-d8f4's other scenes (no /proc, the fold, the deaf escapee, EPERM) and its engine legs run in scripts/test-stop-rung.mjs (this suite's fast bound)
  // B-d8f4 (7): the stop step names the tree's members outside its group it signalled (`timeout` and its `sleep`, in timeout's own group) —
  // K, read from the job's log; «outside» = the re-parented child + those K, whatever the drain still finds alive, and never above n
  const kSa = treeOutOf(sa), kOx = treeOutOf(ox);
  console.log(`    facts (B-d8f4 (7)) ${JSON.stringify({ sa: { left: sa.after && sa.after.left, k: kSa }, ox: { left: ox.after && ox.after.left, k: kOx } })}`);
  ok(sa.after && !sa.after.inTree && sa.after.ownGroup && !sa.after.alive && sa.state === 'interrupted' && sa.after.left && kSa >= 1 && sa.after.left.outside === 1 + kSa && sa.after.left.outside <= sa.after.left.n,
    'B-7ca1: a task\'s STOP on the group rung ends the child that left its group and was re-parented before the stop (it carried THIS run\'s mark) — counted as stopped outside its group, never «not stopped»; B-d8f4 (7): with the K tree members the stop step heard outside its group (timeout, its sleep) — never above n', { left: sa.after && sa.after.left, k: kSa });
  ok(ox.after && !ox.after.alive && ox.after.left && kOx >= 1 && ox.after.left.outside === 1 && ox.after.left.outside < 1 + kOx, 'CONTROL (B-d8f4 (7), the count before it, in a copy — r1501: judged by its «outside» alone, never by how many of the tree the drain still found alive): the stop reached its tree\'s members outside the group, counted in n but NOT «outside» — the count low (red)', { left: ox.after && ox.after.left, k: kOx });
  ok(sa.after && sa.after.strangerOwn && sa.after.stranger && sa.after.left && sa.after.left.escaped === 1, 'B-7ca1 (its read\'s MUST): a process carrying the job\'s mark but ANOTHER run\'s (an earlier run\'s leftover\'s fork) is NOT ended by this run\'s stop — said «left its group — not stopped»', sa.after);
  ok(sa.after && sa.after.view && sa.after.view.outside === sa.after.left.outside, 'B-7ca1: the API\'s view of the run (the card\'s row) carries what was stopped outside its group — its walk found the view dropped it (a list of named fields)', sa.after && sa.after.view);
  ok(sa.after && sa.after.left && sa.after.left.outside >= 1 && sa.after.viewCut && !sa.after.viewCut.threw && sa.after.view && sa.after.viewCut.n === sa.after.view.n && !sa.after.viewCut.outside, 'CONTROL (the view without `outside`, in a copy — over the same run): the run records it but the card\'s row never sees it — RED', sa.after && sa.after.viewCut);
  ok(sx.after && sx.after.alive && sx.after.left && sx.after.left.escaped >= 1 && !sx.after.left.outside, 'CONTROL (the release\'s wrapper, in a copy): the re-parented child is LEFT RUNNING — said «left its group — not stopped» — RED', sx.after);
  ok(sr.after && sr.after.strangerOwn && !sr.after.stranger, 'CONTROL (the job\'s mark alone, in a copy): the STRANGER — another run\'s — is ended by this run\'s stop — RED', sr.after);
  ok(fa.after && !fa.after.alive && fa.after.stranger && /carrying its run's mark outside its group \(re-parented\)/.test(fa.said), 'B-7ca1: a FORCE stop (the wrapper SIGKILLed) — the engine kills the re-parented child carrying the run\'s mark, said in the log; the stranger (another run\'s) lives', { after: fa.after, said: fa.said.slice(0, 400) });
  ok(fx.after && fx.after.alive, 'CONTROL (the engine without its mark kill, in a copy): the force stop leaves the re-parented child RUNNING — RED', fx.after);
  ok(fj.after && fj.after.strangerOwn && !fj.after.stranger, 'CONTROL (the engine by the job\'s mark, in a copy): the force stop kills the STRANGER — another run\'s — RED', fj.after);
  // 主开发 r1979 (the control above read green once in a whole tier, UTC): its scene raced itself — the stranger counted ready by its pid
  // file, stopped before its exec landed. Each scene now holds still first; the stall below makes that window at will, with no load
  const notSettled = [sa, sx, sr, fa, fx, fj, ox, fjh].filter((r) => !(r.after && r.after.settled && r.after.settled.escapee && r.after.settled.stranger)).map((r) => r.after && r.after.settled);
  ok(!notSettled.length, 'r1979: every scene holds still before its stop — its escapee and its stranger SETTLED (their exec landed: `sleep`, state S, the mark read by the walk\'s own reader), never «ready» by a pid file alone', { notSettled });
  ok(fjs.after && fjs.after.strangerOwn && fjs.after.stranger && fjs.after.settled === null, 'r1979 THE PLACED STALL (in a copy, no load): a stranger stopped inside its window — its pid written, its mark not yet what the walk reads — is SPARED by the job-mark copy: that control reads green, the miss made at will', fjs.after);
  ok(fjh.after && fjh.after.strangerOwn && !fjh.after.stranger && fjh.after.settled && fjh.after.settled.stranger, 'r1979: the same stall with the scene held still — it waits until the window is released, and the job-mark copy kills the stranger (the control red as designed)', fjh.after);
  ok(la.after && la.after.launcher && la.after.hub, 'B-7ca1 (its read r2, S1): a task\'s stop never ends the hub\'s LAUNCHER (it carries this run\'s mark, re-parented, its own group — the hub\'s parent) nor the hub', { ...la.after, state: la.state, ms: la.ms });
  ok(lx.after && !lx.after.launcher, 'CONTROL (the hub\'s ancestors not kept, in a copy): the stop ends the hub\'s launcher — RED', lx.after);
  // a hub started INSIDE a job never hands that run's mark to what it starts (its env loses it at the engine's construction)
  // r2271: the drop is the hub's BOOT act (src/server/throwaway-root.js dropHandedAtBoot, before the jobs engine) — asked over a copy of the env
  const envOf = (Mod) => { const env = { ...process.env, VIBESPACE_JOB_RUN: 'jb-0000aaaa:1' }; let threw = null; try { Mod.dropHandedAtBoot({ env }); } catch (e) { threw = String((e && e.message) || e); } return threw ? `threw: ${threw}` : 'VIBESPACE_JOB_RUN' in env; };   // its round: an act that throws is a red, never «dropped»
  const TRSRC = fs.readFileSync(path.join(ROOT, 'src/server/throwaway-root.js'), 'utf8');
  const STRIP = "    const job = k.startsWith('VIBESPACE_JOB_');";   // B-2c5c (5): every job name, the run mark among them
  ok(envOf(require(path.join(ROOT, 'src/server/throwaway-root.js'))) === false && envOf(MJ.load('src/server/throwaway-root.js', anchored(TRSRC, STRIP, "    const job = false;   /* MUTANT: the mark kept */", 'b7ca1-env-strip-cut'), 'b7ca1-env-strip-cut')) === true,
    'B-7ca1 (its read r2, S1): the hub drops an inherited VIBESPACE_JOB_RUN (a hub started inside a job: its double-forked daemons never read as that run\'s escapees); CONTROL (the drop cut, in a copy): kept — RED');
}
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 0, label: 'B-d8f4 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
// r4294 THE KILL IN FLIGHT, PLACED (no load): a process with a fatal signal PENDING is the hosted runner's moment at will — a `sleep`,
// stopped (SIGSTOP), then sent SIGTERM: the signal waits until it runs again. The release's read (its life at once) calls it alive; the
// fact does not; the wait on the fact reads it gone once it runs (SIGCONT, 300 ms later). A spared process (asleep, nothing pending) is
// read at once: the wait costs a survivor nothing
{
  const pidOf = () => Number(String(spawnSync('sh', ['-c', 'sleep 341 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).stdout || '').trim());
  const vp = pidOf(), sp = pidOf(), vid = PI.identityOf(vp), sid = PI.identityOf(sp); mine.push(vid, sid);
  await until(() => PI.stateOf(sp) === 'S' && PI.stateOf(vp) === 'S', 3000);
  process.kill(vp, 'SIGSTOP'); await until(() => PI.stateOf(vp) === 'T', 3000);
  process.kill(vp, 'SIGTERM');
  const atOnce = PI.aliveIdentity(vid) === true, factNow = quietOrGone(vid), spared = quietOrGone(sid);
  setTimeout(() => { try { process.kill(vp, 'SIGCONT'); } catch { } }, 300);
  const t0 = Date.now(), settled = await settleOn(vid, 'r4294 placed: the kill in flight'), waited = Date.now() - t0, gone = PI.aliveIdentity(vid) !== true;
  const placed = { atOnce, factNow, settled, waited, gone, spared, sparedAlive: PI.aliveIdentity(sid) === true };
  for (const x of [vid, sid]) if (PI.aliveIdentity(x) === true) PI.signalIdentity(x, 'SIGKILL');
  ok(atOnce && !factNow && settled && gone && waited >= 200, 'r4294 THE KILL IN FLIGHT, PLACED: a process whose SIGTERM is pending (stopped, then signalled) reads ALIVE at once — the release\'s read, the hosted red made at will — while the fact reads it not yet quiet, and the wait on the fact reads it GONE once it runs (no fixed span)', placed);
  ok(spared && placed.sparedAlive, 'r4294: a spared process (asleep, nothing pending) is quiet at once — read alive without a wait', placed);
}
ok(!expired.length, 'r4294 HARNESS: every wait of the stop scenes met its fact inside its bound — a process read gone or quiet, the forced end\'s sentences in the job\'s log; an expiry is NAMED here, never read silently', expired);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
