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
import { stopScenes } from './lib/stop-scenes.mjs';
const { jobScene, timed, escScene } = stopScenes({ D, mine, ROOT });

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
  // 主开发 r1045 (THE LAW: every writer of the termed table says whether its signal landed): the ENGINE's group signal reaches a member of
  // the job's group, which then LEAVES the group (its TERM trap execs `setsid`: the same process, a session of its own) and ends during the
  // drain. The stop reached it — counted outside its group. CONTROL: the engine's mark on the group's members without its field (r1045's
  // shape: «not landed»: never counted)
  const leaverScene = timed(async (wrapperText, tag) => {
    const dd = path.join(D, tag); fs.mkdirSync(dd, { recursive: true });
    const LP = path.join(dd, 'leaver.pid'), LS = path.join(dd, 'leaver.sh');
    fs.writeFileSync(LS, `echo $$ > ${JSON.stringify(LP)}\ntrap 'exec setsid sh -c "sleep 0.6"' TERM\nwhile :; do sleep 0.05; done\n`);
    return jobScene(wrapperText, tag, { deps: { memorySample: { stopMs: 1000 } }, argv: ['sh', '-c', `trap 'sleep 0.25; exit 0' TERM; sh ${JSON.stringify(LS)} & wait`],
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
  ok(lvx.after && lvx.after.left && !lvx.after.left.outside, 'CONTROL (the engine\'s mark on the group without its field, in a copy): the member the stop reached is left out of what the stop reached (red)', lvx.after);
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
    const HEAD = "what = [...(n ? [`${n} process${es(n)} it started outside its group (${[...new Set(killed)].join(', ') || '—'})`] : []), ...(escaped ? [`${escaped} process${es(escaped)} carrying its run's mark outside its group (re-parented)`] : [])], line = `its forced end${what.length ? ` killed ${what.join(' and ')}` : ''}`";
    const oldHead = MJ.load('src/jobs.js', anchored(JSRC, HEAD, "what = [], line = `its forced end killed ${[...(n || !escaped ? [`${n} process${es(n)} it started outside its group (${[...new Set(killed)].join(', ') || '—'})`] : []), ...(escaped ? [`${escaped} process${es(escaped)} carrying its run's mark outside its group (re-parented)`] : [])].join(' and ')}`   /* MUTANT: the old head */", 'd8f4-old-head'), 'd8f4-old-head');
    const unreadOld = engineKill(oldHead, 'mark-unread-old', { members: [], scan: { scanned: 0, total: 0, cut: false, unread: 'EMFILE' } });
    ok(/its forced end killed 0 processes/.test(unreadOld.said), 'CONTROL (主开发 r1045: the old head, in a copy): a failed listing with nothing killed opens «killed 0 processes …» (red)', unreadOld.said);
    ok(/its forced end — its mark's scan could not list the processes \(EMFILE\): what left its group may be left/.test(unread.said) && !/killed 0/.test(unread.said), 'B-d8f4 (10): a force stop whose mark scan could not list the processes says so with its errno (the hub\'s log); 主开发 r902: nothing killed never opens with «killed 0»', unread.said);
    const unreadX = engineKill(noMark, 'mark-unread-mut', { members: [], scan: { scanned: 0, total: 0, cut: false, unread: 'EMFILE' } });
    ok(!/could not list the processes/.test(unreadX.said), 'CONTROL (the words cut, in a copy): a failed listing and nothing said (red)', unreadX.said);
  }
}
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 0, label: 'B-d8f4 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
