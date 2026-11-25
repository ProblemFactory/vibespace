#!/usr/bin/env node
// test-stop-tree — B-c134 (lane bl-jobs, 2026-11-18): A STOP ENDS THE WHOLE TREE IT STARTED. src/proc-identity.js childTreeOf /
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
import { stopScenes, forcedLanded } from './lib/stop-scenes.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PI = require(path.join(ROOT, 'src/proc-identity.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(condition, name): the name is no string — a swapped call'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(20); } return !!(await fn()); };
// r4294: a spawned process is READ — its kernel name (its exec landed), its first child — never assumed after a fixed span
const commOf = (pid) => { try { return Number(pid) > 1 ? fs.readFileSync(`/proc/${Number(pid)}/comm`, 'utf8').trim() : ''; } catch { return ''; } };
const childOf = (pid) => { try { return Number(String(fs.readFileSync(`/proc/${Number(pid)}/task/${Number(pid)}/children`, 'utf8')).trim().split(/\s+/)[0]) || 0; } catch { return 0; } };
const mine = [];   // every identity this suite made or found under its own children — ended at exit, by identity
const endMine = () => { for (const id of mine) { try { if (id) PI.signalIdentity(id, 'SIGKILL'); } catch { } } };
process.on('exit', endMine);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { endMine(); process.exit(1); });
const have = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const TOOLS = ['setsid', 'timeout', 'env', 'flock'].filter((c) => !have(c));
if (TOOLS.length) { console.log(`SKIP (by name): this machine has no ${TOOLS.join(', ')}`); process.exit(0); }
const D = scratch('stop-tree'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
process.on('exit', () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
// THE SHAPES a mistake makes: a child in a session + group of its own with NO environ (setsid env -i — on the release it carries
// neither the group nor the job's mark), and a child under the timeout program (its own group, the environ kept)
const SCENE = `setsid env -i sleep 301 & timeout 302 sleep 302 & wait`;
const started = (cmd) => { const c = spawn('sh', ['-c', cmd], { stdio: 'ignore' }); mine.push(PI.identityOf(c.pid)); return c; };
const names = (l) => l.map((m) => m.comm).sort().join(',');
const pgOf = (pid) => { const t = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(t.slice(t.lastIndexOf(')') + 2).split(' ')[2]); };

console.log('§1 the tree under a root, by the parent chain — what the group walk and the environ mark cannot see');
{
  const P = started(SCENE);
  let tree = [];
  // the names settle once each exec is done (setsid → env → sleep; timeout → sleep): wait for the SHAPE, never a count
  await until(() => { tree = PI.treeOf([P.pid], { since: PI.identityOf(P.pid).starttime }); return names(tree) === 'sleep,sleep,timeout'; });
  mine.push(...tree);
  const pg = pgOf(P.pid);
  ok(names(tree) === 'sleep,sleep,timeout' && tree.every((m) => m.pgid !== pg && m.bootId && m.starttime > 0) && !tree.cut, 'treeOf: the setsid env -i child and the timeout program with its child — each in a group not the parent\'s, as identities', tree.map((m) => [m.comm, m.pgid === pg]));
  // RED CONTROL: the release's member walk (the job's group + its environ mark VIBESPACE_JOB_ID=…): the setsid env -i child is in
  // neither (the timeout program keeps the environ — a job's mark would find IT; the env -i one escapes both)
  const group = PI.membersOf({ pgid: pg, mark: 'VIBESPACE_JOB_ID=jb-st0p7ree', first: [P.pid] });
  const seen = new Set(group.map((m) => m.pid));
  ok(tree.every((m) => !seen.has(m.pid)), 'CONTROL (the release\'s walk: the group and the environ mark) — finds NONE of the three', group.map((m) => m.pid));
  const r = await PI.endTree(tree, { graceMs: 2000 });
  // r306 (主开发 16:45Z; the hosted red of run 44774335413 at load 6, PLACED as the leg's): the timeout program FORWARDS its SIGTERM to
  // its child — on a loaded runner the child ended by itself before endTree's own act on it: «stale» (no longer ours at the act),
  // never counted as ended by us. THE LAW: every member gone, nothing left, ended + stale = the members, the line counts exactly
  // what WE ended (the stale path itself is pinned below, its race PLACED)
  const line = PI.treeLine(r, { cut: tree.cut });
  ok(!r.left.length && r.ended.length + r.stale === tree.length && r.ended.length >= 2 && tree.every((m) => PI.aliveIdentity(m) === false), 'endTree: each member ended through its identity — nothing of it left; one that ended by itself first is stale, never «ended»', r);
  ok(line.startsWith(`ended ${r.ended.length} process${r.ended.length === 1 ? '' : 'es'} it started (`) && r.ended.every((n) => line.includes(n)) && !line.includes('could not end'), 'treeLine: ONE line — the count of what WE ended and the names', { line, ended: r.ended, stale: r.stale });
  await until(() => P.exitCode !== null || P.signalCode !== null, 3000);
}
{
  // THE STALE PATH, ITS RACE PLACED (r306): the timeout program and its child; endTree signals timeout FIRST, and the injected kill
  // waits there for what happens — timeout forwards the SIGTERM, its child ends — before endTree reaches the child: stale 1, the
  // child never counted as ended by us, the line «ended 1 process it started (timeout)»
  const race = async (PIm, tag) => {
    const P2 = started('timeout 303 sleep 303 & wait');
    let t2 = [];
    await until(() => { t2 = PI.treeOf([P2.pid], { since: PI.identityOf(P2.pid).starttime }); return names(t2) === 'sleep,timeout'; });
    mine.push(...t2);
    const to = t2.find((m) => m.comm === 'timeout'), ch = t2.find((m) => m.comm === 'sleep');
    let stalled = null;
    const kill = (pid, sig) => { process.kill(pid, sig); if (pid === to.pid) { const t0 = Date.now(); while (PI.aliveIdentity(ch) === true && Date.now() - t0 < 3000) spawnSync('sleep', ['0.01']); stalled = PI.aliveIdentity(ch) !== true; } };   // a wait for what happened (the child's end), bounded
    const r2 = await PIm.endTree([to, ch], { graceMs: 2000 }, { kill });
    await until(() => P2.exitCode !== null || P2.signalCode !== null, 3000);
    return { tag, stalled, r2, line2: PIm.treeLine(r2, {}) };
  };
  const rr = await race(PI, 'real');
  ok(rr.stalled === true && JSON.stringify(rr.r2.ended) === '["timeout"]' && rr.r2.stale === 1 && !rr.r2.left.length && rr.line2 === 'ended 1 process it started (timeout)',
    'endTree, the race placed: the child its timeout ended before our act is stale — never counted as ended by us; the line says the ONE we ended', rr);
  const MJ1 = mutantCopies('stop-tree-r306', ROOT), PIS1 = fs.readFileSync(path.join(ROOT, 'src/proc-identity.js'), 'utf8');
  const STALE = "else if (r.why === 'not-ours') refused.push(m); else stale++; }";
  const rx = await race(MJ1.load('src/proc-identity.js', anchored(PIS1, STALE, "else if (r.why === 'not-ours') refused.push(m); else sent.push(m); }", 'r306-stale-as-ended'), 'r306-stale-as-ended'), 'mut');
  ok(rx.stalled === true && rx.r2.ended.includes('sleep') && /^ended 2 processes/.test(rx.line2), 'CONTROL (a stale member counted as ended, in a copy): the line says «ended 2» — one of them ended by its parent before our act — RED', rx);
  for (const c of copiesCensus(MJ1.files, MJ1.dir, ROOT, { minCopies: 0, label: 'r306 ' })) ok(c.pass, c.name + (c.pass ? '' : ' — ' + c.detail));
}

console.log('§2 what does not end in its grace ends by force; a refused signal is said');
{
  const P = started(`setsid sh -c 'trap "" TERM; while :; do sleep 1; done' & wait`);
  let tree = [];
  await until(() => { tree = PI.treeOf([P.pid]).filter((m) => m.comm === 'sh'); return tree.length >= 1; });
  mine.push(...tree);
  const r = await PI.endTree(tree, { graceMs: 300 });
  ok(r.ended.includes('sh') && !r.left.length && tree.every((m) => PI.aliveIdentity(m) === false), 'a member that IGNORES SIGTERM is killed after the grace, and counted as ended', r);
  const Q = started('exec sleep 306'); await until(() => PI.aliveIdentity(PI.identityOf(Q.pid)) === true);
  const q = { ...PI.identityOf(Q.pid), comm: 'sleep' };
  const rr = await PI.endTree([q], { graceMs: 10 }, { kill: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); } });
  ok(rr.left.join() === 'sleep (not ours to signal)' && !rr.ended.length && /could not end 1 \(sleep \(not ours to signal\)\)/.test(PI.treeLine(rr, {})), 'a member the hub may not signal (EPERM) is SAID as not ended — never «ended», never silent', rr);
  PI.signalIdentity(q, 'SIGKILL');
}

console.log('§3 a recycled pid is never signalled; no /proc reads nothing; a cut read is said');
{
  const P = started('exec sleep 303');
  await until(() => PI.aliveIdentity(PI.identityOf(P.pid)) === true);
  const real = PI.identityOf(P.pid), calls = [];
  const kill = (p, s) => { calls.push([p, s]); };
  const r = await PI.endTree([{ ...real, starttime: real.starttime + 1 }], { graceMs: 50 }, { kill });
  ok(!calls.length && r.stale === 1 && !r.ended.length && PI.aliveIdentity(real) === true, 'a member whose start time is another (its pid recycled) is NEVER signalled — counted stale', { calls, r });
  const blind = PI.treeOf([P.pid], {}, { procRoot: path.join(D, 'no-proc-here') });
  ok(blind.length === 0 && !blind.cut, 'no process table: the tree is empty — NOTHING to signal');
  const Q = started('sleep 307 & sleep 308 & wait');
  await until(() => PI.treeOf([Q.pid]).length >= 2);
  const cut = PI.treeOf([Q.pid], { maxRows: 1 }), twinCut = PI.childTreeOf(Q.pid, { maxRows: 1 });
  mine.push(...PI.treeOf([Q.pid]));
  ok(cut.cut === true && cut.length === 1 && twinCut.cut === true && twinCut.rows.length === 1 && /read only in part \(past its bound\)/.test(PI.treeLine({ ended: [], left: [] }, { cut: true })), 'a walk past its bound is CUT and said — a cut walk proves nothing (the hub\'s form and the wrapper\'s twin alike)', { n: cut.length, cut: cut.cut, twin: twinCut.rows.length });
  PI.signalIdentity(real, 'SIGKILL');
}

console.log('§3b THE SHIPPED TWIN — the wrapper carries childTreeOf byte-for-byte');
const twinOf = (t) => { const a = t.indexOf('// ── SHIPPED TWIN (B-c134) BEGIN'), b = t.indexOf('// ── SHIPPED TWIN (B-c134) END ──'); return a >= 0 && b > a ? t.slice(a, b) : null; };
const PIsrc = fs.readFileSync(path.join(ROOT, 'src/proc-identity.js'), 'utf8'), WRAP = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8');
ok(twinOf(PIsrc) && twinOf(PIsrc) === twinOf(WRAP), 'data/bin/job-wrapper.js carries src/proc-identity.js childTreeOf byte-for-byte (the wrapper cannot require src/)');

console.log('§4 THE JOB DOOR — the wrapper\'s one table: a stopped job leaves nothing of its tree, each heard ONCE, its queue marker free');
const { jobScene, timed, escScene, expired } = stopScenes({ D, mine, ROOT });   // B-d8f4 (r1045): the scene builders live in scripts/lib/stop-scenes.mjs (one file for both stop suites)
const real = await jobScene(WRAP, 'job');
ok(real.tree.length >= 4 && real.held && real.state === 'interrupted', 'the scene: the job\'s tree holds the setsid env -i flock + its waiter and the timeout + its sleep, the queue\'s lock HELD', { tree: names(real.tree), held: real.held, state: real.state });
ok(!real.left.length && real.free, 'B-c134: the job\'s STOP leaves NOTHING of its tree running — and its queue marker is free', { left: names(real.left), free: real.free });
ok(real.intent && Array.isArray(real.intent.tree) && real.intent.tree.some((r) => r[3] === 'flock'), 'B-c134: the ENGINE read the tree before its signal and handed it to the wrapper in its intent (stop.json) — the group\'s signal reaches the main and the wrapper at once, so a tree read in the wrapper may already have lost the main\'s children', real.intent && real.intent.tree);
ok(real.terms === 1, 'B-c134: ONE signal a process — the setsid waiter heard SIGTERM exactly once (it cleans up on the first; a second would cut its cleanup)', real.terms);
ok(/\[job-wrapper\] stop: \d+ process(es)? it started outside its group \([^)]*flock[^)]*\) hears? it from the wrapper/.test(real.log), 'B-c134: the job\'s log SAYS what it started outside its group and that the wrapper ended it', real.log.split('\n').filter((l) => /job-wrapper\] stop/.test(l)));
// CONTROL (a patched copy of the release's wrapper, in the control's own data folder): its stop table without the tree
const MJ = mutantCopies('stop-tree-c134', ROOT);
const anchorOr = (t, a, what) => { if (!t.includes(a)) throw new Error(`the anchor of the control «${what}» is not in the source: ${a.slice(0, 80)}`); return t; };
const relWrap = (() => {
  let t = WRAP;
  const a = t.indexOf('// ── SHIPPED TWIN (B-c134) BEGIN'), b = t.indexOf("let stopTree = [];\n");
  if (a < 0 || b < 0) throw new Error('the anchor of the control «the release\'s stop table» is not in the source: the twin block / stopTree');
  // B-d8f4 (主开发 r2215): the twin now holds envOf too (the escapee scan's ONE rule) — the release's copy keeps it: this control judges the TREE
  const ea = t.indexOf('function envOf(root, pid, rest) {'), eb = ea < 0 ? -1 : t.indexOf('\n// ── SHIPPED TWIN (B-c134) END ──', ea);
  if (ea < 0 || eb < 0) throw new Error('the anchor of the control «the release\'s stop table» is not in the source: the twin\'s envOf');
  t = t.slice(0, a) + t.slice(ea, eb) + '\nlet stopTree = [];\n' + t.slice(b + "let stopTree = [];\n".length);
  const TREE = '  const ko = keptOutHere(), tree = childTreeOf(process.pid, { since: Number(stamp.starttime) || 0, exclude: ko });';
  anchorOr(t, TREE, 'the release reads no tree'); t = t.replace(TREE, '  const ko = [], tree = { rows: [], cut: false };   // MUTANT: the release — no tree');
  return t.replace(/  const fromIntent = [^\n]*\n/, '  const fromIntent = { rows: [], cut: false };   // MUTANT: the release reads no tree from the intent\n');
})();
ok(!/childTreeOf\(process\.pid/.test(relWrap) && /MUTANT: the release reads no tree from the intent/.test(relWrap), 'control setup: the release\'s stop table (no tree, none read from the intent) in a copy');
const ctl = await jobScene(relWrap, 'job-mut');
ok(ctl.held && ctl.left.some((m) => m.comm === 'flock' || m.comm === 'sh') && !ctl.free, 'CONTROL (the release\'s wrapper): the setsid env -i waiter is LEFT RUNNING with the queue\'s lock held', { left: names(ctl.left), free: ctl.free });
// THE FORCE STOP: the wrapper is SIGKILLed — its stop step never runs; the ENGINE ends the tree (read first) — nothing left
const fz = await jobScene(WRAP, 'job-force', { force: true });
ok(fz.held && !fz.left.length && fz.free && /its forced end killed \d+ process(es)? it started outside its group/.test(fz.said), 'B-c134: a FORCE stop (the wrapper SIGKILLed) — the engine reads the tree first and kills it, said in the log; nothing left', { left: names(fz.left), said: fz.said });   // stale-pins: kept — the engine's line still opens «its forced end killed N» whenever it killed any (B-d8f4 r902 builds it in two parts)
ok(/\[jobs\] stop: its forced end killed \d+ process(es)? it started outside its group \([^)]*\)/.test(fz.log), 'B-c134 cure (MUST B): the FORCE stop\'s line is in the job\'s OWN log — where the person reads it (the wrapper is dead; the engine writes it)', fz.log.split('\n').filter((l) => /\[jobs\]/.test(l)));
// r3888 (the MUST B item, placed by reading — r3876): the force scene waits on its FACT — every forced-end sentence the journal holds for
// the job is in its log (forcedLanded). The red run's own state, placed: the journal holds the «killed» sentence and the log only the
// other one — the release's wait (the first sentence's landing) read there; the fact's wait does not
{
  const JID = 'jb-made0901', K = `[jobs] ${JID}: its forced end killed 2 processes it started outside its group (sleep, sleep)`, U = `[jobs] ${JID}: its forced end — its mark could not be read in 1 process of ours (in uninterruptible sleep, inside an exec, or not dumpable): what carries its mark there may be left`;
  const inLog = (l) => `\n[jobs] stop: ${l.slice(l.indexOf('its forced end'))}\n`, part = inLog(U), whole = inLog(U) + inLog(K);
  const releaseWait = (log) => log.includes('[jobs] stop: its forced end');   // the release's wait, as stop-scenes.mjs had it
  ok(!forcedLanded([K, U], JID, part) && forcedLanded([K, U], JID, whole) && forcedLanded([K], JID, inLog(K)) && !forcedLanded([], JID, whole), 'r3888: the force scene reads the job\'s log once EVERY forced-end sentence the journal holds for the job is in it — the red run\'s state (the «killed» sentence not yet landed) is not yet');
  ok(releaseWait(part), 'RED CONTROL — the release\'s wait (the first sentence\'s landing): it reads the red run\'s state as landed, before the «killed» sentence');
}
// r3888 (law 3 of r3735, the engine's own lines): ONE ordered road a run's log — two engine lines, a STALL placed on the first append:
// the log holds them in the order they were written. RED: the separate appends (the release's _runLogLine, in a copy)
{
  const JSRCr = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const ROAD = "    const next = (road.get(file) || Promise.resolve()).then(() => fs.promises.appendFile(file, `\\n${text}\\n`)).catch(() => { });\n    road.set(file, next);\n";
  const MJr = mutantCopies('stop-tree-runlog', ROOT);
  const JMx = MJr.load('src/jobs.js', editAnchor(JSRCr, ROAD, "    fs.promises.appendFile(file, `\\n${text}\\n`).catch(() => { }); const next = Promise.resolve();   /* MUTANT: the release — separate appends */\n", 'src/jobs.js')).JobManager;
  const order = async (JM, tag) => {
    const f = path.join(D, tag + '.log'); fs.writeFileSync(f, '');
    const pa = fs.promises.appendFile; let release = null, n = 0;
    fs.promises.appendFile = function (p, ...a) { if (String(p) === f && n++ === 0) return new Promise((res, rej) => { release = () => pa.call(fs.promises, p, ...a).then(res, rej); }); return pa.call(fs.promises, p, ...a); };   // THE STALL: the first append waits
    try {
      const self = {};
      JM.prototype._runLogLine.call(self, f, '[jobs] stop: the first line'); JM.prototype._runLogLine.call(self, f, '[jobs] stop: the second line');
      // r4294 (the family's law): every wait here is on its FACT with a generous bound, its expiry NAMED — never a count of loop turns (a
      // red at the train's tip, box zone: the road read 20 turns after both lines landed, its last append's own callback not yet run)
      const has = (re) => re.test(fs.readFileSync(f, 'utf8')), W = 20000;
      if (!(await until(() => !!release, W))) expired.push(`${tag}: the first append was never asked (${W / 1000} s)`);
      // THE FACT that splits the two roads: how many appends are ASKED while the first is stalled — the ordered road asks the second only
      // once the first has landed (1); separate appends ask it at once (2). A second append asked is waited for until its line has landed
      const asked = n;
      if (asked >= 2 && !(await until(() => has(/second line/), W))) expired.push(`${tag}: the second append was asked, its line not landed in ${W / 1000} s`);
      const during = fs.readFileSync(f, 'utf8');
      if (release) release();
      if (!(await until(() => has(/first line/) && has(/second line/), W))) expired.push(`${tag}: the two lines did not both land in ${W / 1000} s`);
      if (!(await until(() => !(self._runLogRoad && self._runLogRoad.size), W))) expired.push(`${tag}: the road did not end in ${W / 1000} s after its last line`);   // the road ends with its last line: its own callback
      const after = fs.readFileSync(f, 'utf8');
      return { asked, during: during.trim(), ordered: after.indexOf('the first line') >= 0 && after.indexOf('the first line') < after.indexOf('the second line'), road: !!(self._runLogRoad && self._runLogRoad.size) };
    } finally { fs.promises.appendFile = pa; }
  };
  const { JobManager: JMr } = require(path.join(ROOT, 'src/jobs.js'));
  const o = await order(JMr, 'runlog-road'), ox = await order(JMx, 'runlog-road-ctl');
  ok(o.asked === 1 && o.ordered && o.during === '' && !o.road, 'r3888: the engine\'s own lines in a job\'s log go by ONE ordered road — the first append STALLED, the second is not even asked while it waits (r4294: judged by that fact), and the log holds them in the order they were written (the road ends with its last line)', o);
  ok(ox.asked === 2 && !ox.ordered && /second line/.test(ox.during), 'RED CONTROL — the release\'s separate appends (in a copy): the second append is asked at once and its line lands while the first is stalled — the log holds them reversed', ox);
  for (const r of copiesCensus(MJr.files, MJr.dir, ROOT, { minCopies: 1, label: 'r3888 ' })) ok(r.pass, r.name, r.detail);
}
ok(real.heldOut, 'B-c134 cure (MUST A): the engine keeps each live job\'s wrapper OUT of every other stop\'s walk (PI.keptOut names it) — and its own stop walks it (the root)', real.heldOut);
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 0, label: 'B-c134 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

console.log('§6 B-c134 cure MUST A — THE WALK NEVER ENTERS A PROCESS THE STOP DOES NOT OWN (pruned, not filtered)');
// a stand-in process table (procfs shape: <pid>/stat, <pid>/task/<pid>/children) — the scenes no real test can make (the hub's
// own pid as a grandchild of a conversation)
const FP = path.join(D, 'fakeproc');
const fakeProc = (tree) => {
  fs.rmSync(FP, { recursive: true, force: true });
  for (const [pid, p] of Object.entries(tree)) {
    fs.mkdirSync(path.join(FP, pid, 'task', pid), { recursive: true });
    fs.writeFileSync(path.join(FP, pid, 'stat'), `${pid} (${p.comm}) S 1 ${p.pgid || pid} ${Array(16).fill(0).join(' ')} ${p.start} 0 0\n`);
    fs.writeFileSync(path.join(FP, pid, 'task', pid, 'children'), (p.kids || []).join(' ') + (p.kids && p.kids.length ? ' ' : ''));
  }
};
const popts = { procRoot: FP };
{
  fakeProc({ 7001: { comm: 'sh', start: 100, kids: [7002] }, 7002: { comm: 'node', start: 110, kids: [7003] }, 7003: { comm: 'sleep', start: 120 } });
  const pr = PI.childTreeOf(7001, { procRoot: FP, exclude: [[7002, 110]] }), all = PI.childTreeOf(7001, { procRoot: FP });
  ok(pr.rows.length === 0 && pr.pruned === 1 && all.rows.map((r) => r[0]).join() === '7002,7003', 'the root\'s child is an EXCLUDED identity with a grandchild: neither is in the tree — the walk never enters it (without the exclusion: both)', { pr, all: all.rows });
  ok(PI.childTreeOf(7001, { procRoot: FP, exclude: [[7002, 0]] }).rows.length === 0 && PI.childTreeOf(7001, { procRoot: FP, exclude: [[7002, 999]] }).rows.length === 2, 'by IDENTITY: a start of 0 keeps that pid out whatever its start; another start time (a recycled pid) is walked as any process');
  // RED CONTROL: f12c94d6c's rule — filtered from the OUTPUT, still walked into (its children joined the tree)
  const FILT_A = '{ pruned++; continue; }', twin = twinOf(PIsrc);
  if (!twin || !twin.includes(FILT_A)) ok(false, 'the anchor of the control «filtered, not pruned» is not in the source');
  else {
    const filtered = new Function('fs', twin.replace(FILT_A, '{ pruned++; queue.push(c); continue; }') + '\nreturn childTreeOf;')(fs);
    ok(filtered(7001, { procRoot: FP, exclude: [[7002, 110]] }).rows.map((r) => r[0]).join() === '7003', 'CONTROL (filtered, not pruned — the readers\' must): the excluded process\'s grandchild JOINS the tree');
  }
}
{
  // THE READERS' SCENE: a hub restarted from INSIDE a conversation (no systemd; «restart from inside a Claude session») — the hub is
  // now under that conversation's dtach master, and every session and job it made since is under the hub
  const H = process.pid;
  fakeProc({ 7101: { comm: 'dtach', start: 100, kids: [7102] }, 7102: { comm: 'claude', start: 110, kids: [7103] }, 7103: { comm: 'bash', start: 120, kids: [H] },
    [H]: { comm: 'node', start: 130, kids: [7105, 7106] }, 7105: { comm: 'dtach', start: 140, kids: [7107] }, 7107: { comm: 'claude', start: 150 }, 7106: { comm: 'node', start: 141, kids: [7108] }, 7108: { comm: 'sleep', start: 160 } });
  const t = PI.treeOf([7101], { since: 100 }, popts);
  ok(t.map((m) => m.comm).join() === 'claude,bash' && t.pruned === 1 && t.keptOut.some((x) => x[0] === H && x[1] === 130), 'a conversation whose tree holds a RESTARTED HUB ends NOTHING under that hub — its own processes only (the hub kept out by its pid AND start)', { tree: t.map((m) => `${m.pid}:${m.comm}`), pruned: t.pruned });
  const release = PI.childTreeOf(7101, { since: 100, procRoot: FP }).rows.filter((r) => r[0] !== H).map((r) => r[0]);
  ok([7105, 7106, 7107, 7108].every((p) => release.includes(p)), 'CONTROL (f12c94d6c: the hub filtered from the output only): every session holder and job wrapper under the hub WOULD be ended', release);
  // A ROAD THAT HOLDS A PROCESS names it: another conversation's holder that sits under this root (not under the hub) is kept out too
  fakeProc({ 7201: { comm: 'dtach', start: 100, kids: [7202] }, 7202: { comm: 'chat-wrapper', start: 110, kids: [7203] }, 7203: { comm: 'claude', start: 120 } });
  const off = PI.keepOut('test-holders', () => [[7202, 0]]);
  const kept = PI.treeOf([7201], {}, popts), own = PI.treeOf([7202], {}, popts);
  off();
  const freed = PI.treeOf([7201], {}, popts);
  ok(kept.length === 0 && own.map((m) => m.pid).join() === '7203' && freed.map((m) => m.pid).join() === '7202,7203', 'PI.keepOut: what a road holds is never entered by ANOTHER stop — its own stop (the root) walks it; off() returns it to the walk', { kept: kept.length, own: own.map((m) => m.pid), freed: freed.map((m) => m.pid) });
  const offBad = PI.keepOut('test-throws', () => { throw new Error('boom'); }); const w0 = console.warn; let warned = ''; console.warn = (m) => { warned += m; };
  const still = PI.treeOf([7201], {}, popts); console.warn = w0; offBad();
  ok(still.length === 2 && /could not be read — its processes are not kept out/.test(warned), 'a road whose list throws is SAID (journal) and the walk goes on with the rest', warned);
  // the wiring: the two roads that hold processes register them
  const wsSrc = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8'), jsSrc = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(/PI\.keepOut\('conversations', \(\) => \{ const out = \[\]; for \(const s of activeSessions\.values\(\)\) \{ const p = Number\(s && s\.pty && s\.pty\.pid\); if \(p > 1 && !s\.host\) out\.push\(\[p, 0\]\); \} return out; \}\);/.test(wsSrc) && /PI\.keepOut\('device-agent', \(\) => \{ devRead\(\); return devPid > 1 \? \[\[devPid, 0\]\] : \[\]; \}\);/.test(wsSrc) && /fsp\.readFile\(require\('path'\)\.join\(process\.env\.VIBESPACE_DEVICE_ROOT \|\| process\.env\.VIBESPACE_AGENTD_ROOT \|\| require\('path'\)\.join\(require\('os'\)\.homedir\(\), '\.vibespace', 'agentd'\), 'state', 'agentd\.pid'\)/.test(wsSrc)
    && /this\._keepOutOff = PI\.keepOut\('jobs', \(\) => this\._wrappersHeld\(\)\);/.test(jsSrc) && /keepOut: tree\.keptOut\.slice\(0, 512\)/.test(jsSrc), 'WIRING: every live conversation\'s holder (ws-handler) and every live job\'s wrapper (the engine) is kept out; the intent hands the list to the wrapper', null);
}
// THE WRAPPER'S TWIN, with what it knows: the hub's pid (data/server.pid, written at the hub's boot) — a job that restarted the hub
// (a job running the server's own start script) ends nothing under it. The scene: a stand-in «hub» the job started (setsid, its own
// sleep), its pid in the scratch data folder's server.pid; the stop is a signal to the WRAPPER ALONE (no engine intent: only the
// wrapper's own walk can reach it). B-7ca1: the stand-in is NODE, as a hub is — a task's stop now ends what left its group carrying
// its run's mark, and the wrapper keeps out a server.pid root only while it is not PROVEN no hub (B-2c5c r2: a root that is not node
// at all is a recycled pid); an `sh` stand-in was spared only because a task's escapees were never stopped
const hubArgv = (dd) => ['sh', '-c', `setsid node -e "require('child_process').spawn('sleep', ['313'], { stdio: 'ignore' }); setInterval(() => { }, 1e9)" & echo $! > ${JSON.stringify(path.join(dd, 'server.pid'))}; timeout 314 sleep 314 & wait`];
const hubReady = (tree) => tree.some((m) => m.comm === 'timeout') && tree.filter((m) => m.comm === 'sleep').length >= 2;
const hubBefore = (expectEnded) => ({ dd }) => {
  let hubPid = 0; try { hubPid = Number(fs.readFileSync(path.join(dd, 'server.pid'), 'utf8').trim()); } catch { }
  const hub = hubPid > 1 ? [{ ...PI.identityOf(hubPid), comm: 'node' }, ...PI.treeOf([hubPid])] : [];
  mine.push(...hub);
  const alive = () => hub.filter((m) => PI.aliveIdentity(m) === true).length;
  return { keep: expectEnded ? new Set() : new Set(hub.map((m) => m.pid)), after: async () => { if (expectEnded) await until(() => alive() === 0, 3000); return { hub: hub.length, alive: alive() }; } };
};
{
  const ddOf = (tag) => path.join(D, tag);
  // r1263 (b), THE ONE RECOGNISER: this job's main STARTED the hub of data/server.pid as its child (beside its own work) — it LEADS TO
  // the hub (the hub's own parent chain reaches the job through it), so the stop it heard alone is REFUSED by the main door, by name,
  // as the engine's main door answers the same shape; its walk never runs and nothing is signalled
  const HP = path.join(ddOf('job-held'), 'held.pid');
  const KO = 'exclude: ko });', NOKO = 'function keptOutHere() {\n';
  // the three scenes are INDEPENDENT (their own folders, managers and processes): they run together — the suite's time is the slowest's
  const [hs, hh, hc] = await Promise.all([
    jobScene(WRAP, 'job-hub', { argv: hubArgv(ddOf('job-hub')), signalAlone: true, before: hubBefore(false), ready: hubReady, refusal: /stop: SIGTERM refused — this job is the running VibeSpace/ }),
    jobScene(WRAP, 'job-held', { argv: ['sh', '-c', `setsid sleep 315 & echo $! > ${JSON.stringify(HP)}; timeout 316 sleep 316 & wait`], signalAlone: true,   // its own group: only the walk meets it
    ready: (tree) => tree.some((m) => m.comm === 'timeout') && fs.existsSync(HP),
    before: ({ jm }) => {
      const id = PI.identityOf(Number(fs.readFileSync(HP, 'utf8').trim())); mine.push(id);
      const job = [...jm.jobs.values()][0], run = job.runs[job.runs.length - 1];
      fs.writeFileSync(path.join(jm._ctlDir(job, run.startedAt), 'stop.json'), JSON.stringify({ sig: 'SIGTERM', at: Date.now(), alone: true, keepOut: [[id.pid, id.starttime]] }));   // the engine's intent, as it writes it
      return { keep: new Set([id.pid]), after: async () => ({ held: PI.aliveIdentity(id) === true }) };
    } }),
    WRAP.includes(KO) ? jobScene(anchored(WRAP.replace(KO, 'exclude: [] });   // MUTANT: keeps nothing out'), NOKO, 'function keptOutHere() { return [];   // MUTANT: keeps nothing out\n', 'b7ca1-keeps-nothing'), 'job-hub-mut', { argv: hubArgv(ddOf('job-hub-mut')), signalAlone: true, before: hubBefore(true), ready: hubReady }) : null,
  ]);
  ok(/\[job-wrapper\] stop: SIGTERM refused — this job is the running VibeSpace: it is not stopped here \(its main process is the VibeSpace hub, or what started it, as this job\)/.test(hs.log) && !/left alone/.test(hs.log),
    'r1263 (b): a main that started the hub of data/server.pid as its child LEADS TO the hub — the stop it heard alone is refused by name (the main door, as the engine\'s), its walk never runs', hs.log.split('\n').filter((l) => /job-wrapper\] stop/.test(l)));
  ok(hs.after && hs.after.hub === 2 && hs.after.alive === 2 && hs.left.some((m) => m.comm === 'timeout'), '…nothing is signalled: the stand-in hub, its child and the job\'s own work live on (a stop of VibeSpace itself ends them)', { after: hs.after, left: names(hs.left) });
  // cure 2 (its reading): the wrapper's own line SAYS what its walk left alone — met where the ENGINE's stop reaches the wrapper ALONE
  // (its intent, `alone`) naming a process under the job's main that it keeps out (a holder it holds); the main lives, so the wrapper's
  // own walk meets it. The job's own timeout ended
  ok(/\[job-wrapper\] stop: its tree walk left alone 1 process it does not own/.test(hh.log) && hh.after && hh.after.held === true && hh.tree.some((m) => m.comm === 'timeout') && !hh.left.some((m) => m.comm === 'timeout'),
    'cure 2 (its reading): the wrapper\'s own line SAYS what its walk left alone (a process the engine keeps out, under the job\'s main, its stop reaching the wrapper alone) — it lives on; the job\'s own timeout ended', { said: hh.log.split('\n').filter((l) => /job-wrapper\] stop/.test(l)), after: hh.after, left: names(hh.left) });
  if (!WRAP.includes(KO)) ok(false, 'the anchor of the control «the wrapper keeps nothing out» is not in the source');
  else {
    // B-7ca1: the stand-in is node, kept by the walk's exclusion AND the keep test — «keeps nothing out» cuts every keep-out
    ok(hc.after && hc.after.hub === 2 && hc.after.alive === 0 && !/left alone/.test(hc.log), 'CONTROL (the wrapper keeps nothing out): the stand-in hub and its child are ENDED by the job\'s stop — and nothing is said left alone', hc.after);
  }
}

console.log('§7 B-c134 cure MUST B — A STOP THAT COULD NOT END EVERYTHING TELLS THE PERSON, ON BOTH DOORS');
{
  const nl = PI.treeNotice({ ended: ['sleep'], left: ['make (not ours to signal)', 'cc1'], stale: 0 }, { cut: false }, 'build box');
  const nc = PI.treeNotice({ ended: [], left: [], stale: 0 }, { cut: true }, 'build box'), nb = PI.treeNotice({ ended: [], left: ['cc1'], stale: 0 }, { cut: true }, 'x');
  ok(nl && nl.key === PI.TREE_NOTICE.left && nl.params.n === 2 && nl.params.names === 'make, cc1' && nl.text === '"build box" ended, but 2 of the processes it started could not be stopped (make, cc1) — they may still be running.', 'treeNotice: what could not be stopped — counted and named (a refused signal\'s name with them, no English inside the names)', nl);
  ok(nc && nc.key === PI.TREE_NOTICE.cut && nb.key === PI.TREE_NOTICE.leftCut && PI.treeNotice({ ended: ['a'], left: [], stale: 0 }, { cut: false }, 'x') === null, 'a CUT walk is said even when all it read has ended; both at once is one sentence; all ended = no notice (the journal line alone)');
  const zh = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
  ok(Object.values(PI.TREE_NOTICE).every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')), 'the three sentences have their zh and ja rows');
  const ws = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8');
  const PIN = (t) => /if \(treeRoots\.length \|\| treeCut\) \{/.test(t) && /if \(!left\.length && !treeCut\) return;/.test(t) && /const tn = PI\.treeNotice\(r, \{ cut: treeCut \}, treeName\);\s*if \(tn\) \{ try \{ ctx\.serverNotice\?\.\(`tree-left:\$\{data\.sessionId\}`, tn\.text, \{ level: 2, i18n: \{ key: tn\.key, params: tn\.params \} \}\); \} catch \{ \} \}/.test(t);
  ok(PIN(ws), 'the conversation\'s door: what is left — or a cut walk with nothing left — goes to the PERSON through the end path\'s notice (every page toasts it, in the person\'s words), the journal line kept');
  // RED CONTROLS from the source itself (never a sha off this branch — test-ci-gate's sha law), each proving its plant first:
  const CUT_A = 'if (treeRoots.length || treeCut) {', LEFT_A = 'if (!left.length && !treeCut) return;', NOTE_A = "ctx.serverNotice?.(`tree-left:${data.sessionId}`";
  const plants = [CUT_A, LEFT_A, NOTE_A].map((a) => ws.split(a).length === 2);
  ok(plants.every(Boolean), 'control setup: the three lines the controls cut are each in ws-handler once', plants);
  const journalOnly = ws.replace(NOTE_A, 'void (`tree-left:${data.sessionId}`').replace(LEFT_A, 'if (!left.length) return;');   // the unit as first lined   // stale-pins: kept — the control writes the OLD form back into a copy of the source
  ok(journalOnly !== ws && !journalOnly.includes(NOTE_A) && !PIN(journalOnly), 'CONTROL (the unit as first lined, from the source): the line went to the journal only, and a cut walk with nothing left returned unsaid');
  const rowsOnly = ws.replace(CUT_A, 'if (treeRoots.length) {');   // the cure as taken   // stale-pins: kept — the control writes the OLD form back into a copy of the source
  ok(rowsOnly !== ws && rowsOnly.includes('if (treeRoots.length) {') && !PIN(rowsOnly), 'CONTROL (the cure as taken, from the source): a walk CUT before its first row reached nothing — the timer ran only for a read row');   // stale-pins: kept — the control writes the OLD form back into a copy of the source
  // the job's door: a refused signal named, a cut said, the line into the job's own log (the force stop's wrapper is dead)
  const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
  const drive = (fn) => {
    const said = [], into = [], sig0 = PI.signalIdentity, tree0 = PI.treeOf;
    PI.treeOf = () => Object.assign([{ pid: 9101, starttime: 1, pgid: 9101, comm: 'make' }, { pid: 9102, starttime: 1, pgid: 9102, comm: 'sleep' }, { pid: 9103, starttime: 1, pgid: 9103, comm: 'cc1' }], { cut: true, pruned: 0, keptOut: [] });   // cc1: its pid recycled (it had ended)
    PI.signalIdentity = (m) => (m.comm === 'make' ? { ok: false, why: 'not-ours' } : m.comm === 'cc1' ? { ok: false, why: 'pid-recycled' } : { ok: true });
    try { fn.call({ d: { log: (l) => said.push(l) }, _runLogFile: () => '/the/run/current.log', _runLogLine: (f, l) => into.push(l) }, { id: 'jb-t' }, { pid: 9100, starttime: 1 }); } finally { PI.signalIdentity = sig0; PI.treeOf = tree0; }
    return { said: said.join(' | '), into: into.join(' | ') };
  };
  const kt = drive(JobManager.prototype._killTree);
  ok(/^\[jobs\] stop: its forced end killed 1 process it started outside its group \(sleep\); could not end 1 \(make: not ours to signal\) — its tree was read only in part: what it started may be left$/.test(kt.into) && kt.said.includes('could not end 1 (make: not ours to signal)'), 'the force stop: ITS OWN LOG says what it killed, names the REFUSED signal, and says a cut walk — the hub\'s log too', kt);
  const REF = "else if (r.why === 'not-ours') refused.push(m.comm);", KSRC = JobManager.prototype._killTree.toString();
  if (!KSRC.includes(REF)) ok(false, 'the anchor of the control «a refused signal unsaid» is not in the source');
  else {
    const mut = new Function('PI', 'return function ' + KSRC.replace(REF, '') + ';')(PI);
    ok(!/not ours to signal/.test(drive(mut).into), 'CONTROL (the refused signal not collected): the job\'s log is silent about it');
  }
  const js = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(/const treeCut = tree\.cut \|\| all\.length > rows\.length;/.test(js) && /\.\.\.\(treeCut \? \{ treeCut: true \} : \{\}\)/.test(js) && /_runLogFile\(job\) \{[\s\S]{0,200}?run\.log \|\| path\.join\(this\._ctlDir\(job, run\.startedAt\), 'current\.log'\)/.test(js) && /\.then\(\(\) => fs\.promises\.appendFile\(file, `\\n\$\{text\}\\n`\)\)\.catch\(\(\) => \{ \}\);/.test(js), 'the intent\'s row cap (256) is a CUT the wrapper says; the engine\'s line is appended to the run\'s log off the loop — r3888: by its ONE ordered road');
}

console.log('§8 B-c134 cure — WHICH END ENDS THE BACKGROUND TREE (the coordinator\'s question, every caller counted)');
{
  // THE DOORS of a conversation's end on the page: each killSession call, judged. END = a person's Terminate or an archive (the
  // kill carries endTree: true); KEEP = an end a resume follows, or a helper's own terminal — what runs in the background stays
  const DOORS = [
    // restacked on 2.369.410 with B-70f9: a person's end goes through endConversation (the kill + its jobs' notice), carrying the door's { endTree }
    ['src/lib/session-card.js', "if (s.webuiId) c.app.endConversation(s.webuiId, undefined, { endTree: true })", 'END', 'the card menu\'s Terminate (a confirm dialog first)'],
    ['src/lib/session-card.js', "if (s.webuiId) app.endConversation(s.webuiId, undefined, { endTree: true })", 'END', 'the card detail\'s Terminate button (a confirm dialog first)'],
    ['src/lib/taskbar.js', "c.app.endConversation(c.s.webuiId, undefined, { endTree: true })", 'END', 'the taskbar\'s Terminate session'],
    ['src/lib/sidebar-workbench.js', "this.app.killSession(s.webuiId, undefined, { endTree: true })", 'END', 'the batch bar\'s terminate-and-archive'],
    ['src/lib/session-lifecycle.js', "this.endConversation(msg.sessionId, undefined, { endTree: this._personClose() })", 'END', 'a chat window\'s close under window.closeBehavior = terminate (the person\'s own setting: the close IS their Terminate) — a RESUME\'s or a RECORD\'s close KEEPS (_personClose)'],
    ['src/lib/session-lifecycle.js', "this.endConversation(serverId, undefined, { endTree: this._personClose() })", 'END', 'an attached chat window\'s close, the same setting and rule'],
    ['src/lib/session-lifecycle.js', "this.endConversation(sessionId, undefined, { endTree: !ephemeral && this._personClose() })", 'END', 'a terminal window\'s close under the same setting — an automation helper\'s own (ephemeral) terminal, a resume\'s or a record\'s close KEEP'],
    ['src/lib/session-lifecycle.js', 'this.killSession(webuiId, backendSessionId, opts);', 'END', 'endConversation\'s kill: it carries the door\'s own { endTree } (each END door above)'],
    ['src/lib/session-lifecycle.js', 'if ((this._fenceOpen || 0) > 0) { this.killSession(webuiId, backendSessionId); return; }', 'KEEP', 'endConversation inside a resume\'s fence: the kill as before, no tree, no notice'],
    ['src/lib/session-lifecycle.js', 'this.killSession(webuiId, cid);', 'KEEP', 'restartConversationInPlace: kill → resume of the same conversation'],
    ['src/lib/session-lifecycle.js', 'this.killSession(live.webuiId, backendSessionId);', 'KEEP', 'the account switch: kill → resume on the other account'],
    ['src/lib/chat-view.js', 'this.app.killSession(this.sessionId, backendSessionId);', 'KEEP', 'the permission switch: kill → resume with the new mode'],
    ['src/lib/chat-view.js', 'try { this.app.killSession?.(sid, backendSessionId); } catch { }', 'KEEP', 'the sign-in wall\'s kill-then-resend: the same conversation resumes to take the sent text again'],
    ['src/lib/manage-agents.js', 'this.killSession(sess.serverId, sess.backendSessionId);', 'KEEP', 'a pool\'s cold restart: kill → resume on the pool\'s account'],
    ['src/lib/setup-flows.js', 'try { this.killSession(sid); } catch {}', 'KEEP', 'a sign-in setup flow\'s own terminal (its modal closed)'],
    ['src/lib/setup-flows.js', 'try { this.killSession(msg.sessionId); } catch {}', 'KEEP', 'a setup flow\'s terminal whose modal is gone'],
  ];
  const sites = [];
  const pageFiles = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pageFiles(`${dir}/${e.name}`) : /\.m?js$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  for (const rel of ['src/client.js', ...pageFiles('src/lib')].filter((f) => fs.existsSync(path.join(ROOT, f)))) {   // every page file — a new door anywhere is judged
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const line of t.split('\n')) if (/\b(killSession|endConversation)(\?\.)?\(/.test(line) && !/^\s*(killSession|endConversation)\(webuiId, backendSessionId/.test(line) && !/^\s*(\/\/|\*)/.test(line)) sites.push({ rel, line });   // a kill or a person's end (restack: B-70f9's endConversation)   // an optional call (?.) is a door too (its own read F9)
  }
  const judge = (ss) => { const unknown = [], used = new Set(); for (const s of ss) { const d = DOORS.filter(([f, snip]) => f === s.rel && s.line.includes(snip)); if (d.length !== 1) unknown.push(`${s.rel}: ${s.line.trim().slice(0, 100)}`); else used.add(d[0]); } return { unknown, dead: DOORS.filter((d) => !used.has(d)).map((d) => d[1]) }; };
  const j = judge(sites), ends = DOORS.filter((d) => d[2] === 'END').length;
  ok(sites.length === 16 && !j.unknown.length && !j.dead.length && ends === 8, `every page door of a conversation's end is judged (16: ${ends} END the background tree — a person's Terminate, a close under the terminate setting, the terminate-and-archive, endConversation's kill carrying them; ${16 - ends} KEEP it — a restart in place, an account / permission / pool switch, the sign-in wall's resend, a setup flow's terminal, a resume's fence)`, j);
  ok(DOORS.filter((d) => d[2] === 'KEEP').every((d) => !/endTree|, opts\)/.test(d[1])) && DOORS.filter((d) => d[2] === 'END').every((d) => /endTree: (true|!ephemeral && this\._personClose\(\)|this\._personClose\(\))|backendSessionId, opts\);/.test(d[1])) && DOORS.filter((d) => d[0] === 'src/lib/session-lifecycle.js' && d[2] === 'END' && /^this\.endConversation/.test(d[1])).every((d) => d[1].includes('this._personClose()')), 'an END door passes endTree; a KEEP door never does');
  ok(judge([...sites, { rel: 'src/lib/session-card.js', line: '      this.app.killSession(x.webuiId);' }]).unknown.length === 1, 'CONTROL: a NEW kill door no row judges is red by name');
  const L = fs.readFileSync(path.join(ROOT, 'src/lib/session-lifecycle.js'), 'utf8'), ws = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8'), ops = fs.readFileSync(path.join(ROOT, 'src/server/conversation-ops.js'), 'utf8');
  ok(/_personClose\(\) \{ return !\(\(this\._fenceOpen \|\| 0\) > 0 \|\| this\.layoutManager\?\._restoring \|\| this\.layoutManager\?\._applying\); \}/.test(L), 'a window close is a person\'s Terminate only when a PERSON closed it: never inside a resume\'s fence, never a record\'s close (a layout apply, a desktop\'s restore)');
  ok(/killSession\(webuiId, backendSessionId\) \{\s*if \(!webuiId\) return;\s*const tree = arguments\[2\] && arguments\[2\]\.endTree === true \? \{ endTree: true \} : \{\};/.test(L) && /if \(backendSessionId\) this\.ws\.send\(\{ type: 'kill', sessionId: webuiId, backendSessionId, \.\.\.tree \}\);\s*const msg = \{ type: 'kill', sessionId: webuiId, \.\.\.tree \};/.test(L), 'the page\'s kill carries endTree only when the door asks (both frames)');
  ok(/const endSessionBody = async \(data, \{ reply, actBy, endTree = false \} = \{\}\) => \{/.test(ws) && /const ownTree = \(endTree === true \|\| data\.endTree === true\) && !capsOf\(session\.backend\)\.terminalOnly;/.test(ws), 'the hub reads and ends the tree ONLY for an end that asks (the page\'s frame or the verb)');
  ok(/await D\(\)\.endSession\(\{ sessionId: hit\.id \}, \{ reply: \(m\) => answers\.push\(m\), actBy: SPEC\.actByOf\(by\), endTree: endTree === true \}\);/.test(ops) && /const r = await O\(\)\.endConversation\(\{ webuiId: f\.id \}, \{ \.\.\.byOf\(caller, keyId\), \.\.\.\(cutA \? \{ forced: true \} : \{\}\) \}, \{ endTree: true \}\);/.test(ops) && /const r = await O\(\)\.endConversation\(\{ webuiId: t\.id \}, \{ \.\.\.byOf\(ctx\.caller, ctx\.keyId\), \.\.\.\(cut \? \{ forced: true \} : \{\}\) \}\);/.test(ops), 'the automation verbs: ARCHIVE ends the background tree; END does not; an automation key\'s own kill frame never asks it (the target is rebuilt)');
}

console.log('§5 THE CONVERSATION DOOR — wiring (read before the first signal; survivors only, after the teardown)');
{
  const ws = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8');
  const iRead = ws.indexOf('if (ownTree) readTree(dpid);'), iKill = ws.indexOf("try { process.kill(dpid, 'SIGTERM'); } catch {}"), iLocal = ws.indexOf('if (localPty) readTree(localPty);'), iPty = ws.indexOf('      if (session.pty) session.pty.kill();'), iEnd = ws.indexOf('PI.endTree(left, { graceMs: 5000 })');
  ok(iRead > 0 && iKill > iRead && iLocal > iKill && iPty > iLocal && iEnd > iLocal && iEnd < iPty, 'ws-handler kill: each dtach master\'s tree is read BEFORE its SIGTERM, a chat conversation\'s BEFORE the pty\'s kill; ended through PI.endTree', { iRead, iKill, iLocal, iPty, iEnd });
  ok(/const ownTree = \(endTree === true \|\| data\.endTree === true\) && !capsOf\(session\.backend\)\.terminalOnly;/.test(ws) && /session\.pty\.constructor\.name !== 'Object'/.test(ws) && /treeRoots\.filter\(\(m\) => PI\.aliveIdentity\(m\) === true\)/.test(ws) && /\}, 3000\);/.test(ws), 'ws-handler kill: never a plain shell\'s (the declared row terminalOnly — never an id), an OpenCode serve\'s or a pipe conversation\'s (a shim pty: the remainder); only what SURVIVED the teardown hears the stop, 3 s on (never a second signal)');
  const js = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(/live = !!\(st && this\._verifyAlive\(st\)\), hubInGroup = live && PI\.pgidOf\(process\.pid\) === Number\(st\.pid\);/.test(js) && /const tree = live \? PI\.treeOf\(\[Number\(st\.pid\)\]/.test(js) && /\.\.\.\(rows\.length \? \{ tree: rows \} : \{\}\)/.test(js) && /if \(sig === 'SIGKILL'\) this\._killTree\(job, stamp, \{ group: inGroup \}\);/.test(js) && !/treeOfAsync|_termRunTree/.test(js) && /if \(!k\) \{ const st = this\._readStamp\(job\); if \(this\._verifyAlive\(st\)\) this\._killTree\(job, st\); \}/.test(js) && !/_stopTree|PI\.endTree/.test(js), 'jobs: the engine sends NO stop SIGTERM of its own to the tree (the wrapper\'s one table does); its SIGKILLs (a force stop, the kill step) end the tree first');
}

console.log('§9 B-cac2 (batch 8): a START during a stop is remembered and done when the stop ends; restart = stop, wait, start');
// ONE real service a scene (its stop takes a moment — its own cleanup on SIGTERM: the window a second press lands in); the presses
// run on it one after another. `press` → its answer, then a NEW live run once the stop ended (`comeback`); `settle` (the control)
// reads the job AT THE RUN'S END instead — the release's comeback, if any, is the crash policy's timer (5 s on), never the start
const svcScene = async (Mod, tag) => {
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), WRAP);
  const J = new Mod.JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: () => { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
  J.init();
  const caller = { conversationId: 'conv-st', sessionId: 'sess-st', sessionCreatedAt: 1, groups: new Set() };
  const owner = { conversation: { backend: 'claude', id: 'conv-st' }, sessionId: 'sess-st', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
  // READY once its trap is set (the box-zone gate of c8e92613b: a stop that landed before the trap — the run outlived the 8 s wait); a
  // press waits for it, and every wait for a run's end covers the kill step (~11 s): a stop ends the run, by its TERM or its kill
  const ready = path.join(dd, 'ready');
  const r = J.create({ kind: 'service', name: 'svc-' + tag, cmd: { argv: ['sh', '-c', `trap "sleep 0.3; exit 0" TERM; : > '${ready}'; while :; do sleep 0.1; done`] }, owner }, caller);
  const job = J.jobs.get(r.job.id);
  const live = () => { const st = J._readStamp(job); return !!st && J._verifyAlive(st); };
  const keep = () => { const st = J._readStamp(job); if (st) mine.push(st, ...PI.treeOf([Number(st.pid)])); };
  const up = await until(async () => { await J._sweep(); return live() && fs.existsSync(ready); }, 8000);
  keep();
  const fails = () => (job.supervise && job.supervise.consecutiveFails) || 0;
  const press = async (how, { settle = false } = {}) => {
    await until(async () => fs.existsSync(ready), 8000); fs.rmSync(ready, { force: true });   // its trap is set: the stop's window is the trap's
    const first = job.runs.length, run = job.runs[first - 1];
    let answer;
    let flagAfter;
    if (how === 'restart') answer = J.restart(job);
    else if (how === 'start-stop') { J.stop(job); answer = J.start(job); J.stop(job); flagAfter = job._startAfterStop; }   // the person changes their mind
    else {
      J.stop(job); answer = J.start(job);   // the second press, inside the stop's grace
      // its read r2 (N1): the asked start is RUNTIME only — never in jobs.json (a stale one re-ran a finished job after a restart);
      // the plant: a plain key written beside it IS read back (the check can see a field)
      job.zzProbe = 1; J._save(); (J.d.writer || createRequire(import.meta.url)('../src/store-writer.js').storeWriter()).flushSync();   // lane lg-store-writes U4 (a meeting met at the census's gate): jobs.json is the store writer's — landed before the file is read
      const rec = (JSON.parse(fs.readFileSync(path.join(dd, 'jobs.json'), 'utf8')) || []).find((x) => x && x.id === job.id) || {};
      delete job.zzProbe;
      flagAfter = { inMemory: job._startAfterStop === true, onDisk: Object.keys(rec).filter((k) => /startAfterStop/.test(k)), plantRead: rec.zzProbe === 1 };
    }
    if (how === 'start-stop' && !settle) return { answer, flagAfter };
    if (settle) {
      const ended = await until(async () => { await J._sweep(); return !!run.endedAt; }, 20000);
      await new Promise((r) => setImmediate(r)); await J._sweep();   // a start the run's end scheduled has had its turn
      return { answer, ended, flagAfter, state: job.state, newRuns: job.runs.length - first, fails: fails() };
    }
    const comeback = await until(async () => { await J._sweep(); return job.runs.length === first + 1 && live() && fs.existsSync(ready); }, 20000);
    keep();
    return { answer, comeback, flagAfter, newRuns: job.runs.length - first, fails: fails(), state: job.state };
  };
  const end = async () => { delete job._startAfterStop; try { J.stop(job, { force: true }); } catch { }   // never a start left behind (a control's copy keeps it)
    await until(async () => { await J._sweep(); return !live(); }, 4000); J.shutdown(); };
  return { up, press, end };
};
{
  const S = await svcScene(require(path.join(ROOT, 'src/jobs.js')), 'job-start-during-stop');
  const sd = await S.press('start');
  ok(S.up && sd.answer && sd.answer.pending === true && /^still stopping \(\d+ s left\) — it starts when the stop ends \(a VibeSpace restart before then forgets it: start it again\)$/.test(sd.answer.words || '') && sd.comeback && sd.fails === 0 && sd.flagAfter && sd.flagAfter.inMemory && sd.flagAfter.plantRead && sd.flagAfter.onDisk.length === 0, 'B-cac2: a START pressed while the stop\'s grace runs answers «still stopping (k s left) — it starts when the stop ends» and DOES start when it ends (a new live run, no crash counted); the ask is runtime only — never in jobs.json (read r2)', sd);
  const rs = await S.press('restart');
  ok(rs.answer && rs.answer.pending === true && /it starts again when the stop ends \(a VibeSpace restart before then forgets it: start it again\)$/.test(rs.answer.words || '') && rs.comeback && rs.fails === 0, 'B-cac2: restart = stop, wait, start — ONE answer, and a new live run after the stop ends (no crash counted)', rs);
  // the adversarial read r1 (MUST 1): stop, start (remembered), then STOP again — the person changed their mind: nothing starts
  const ss = await S.press('start-stop', { settle: true });
  ok(ss.answer && ss.answer.pending === true && ss.flagAfter === undefined && ss.ended && ss.state === 'down' && ss.newRuns === 0, 'B-cac2: a STOP pressed after the remembered start clears it — the service ends DOWN, no new run (the CLI\'s «stopped» is true)', ss);
  await S.end();
  const JSRC = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8'), PEND = '    if ((job._termAt || job._stopForce) && this._runLive(job, run0)) {';
  ok(JSRC.split(PEND).length === 2, 'B-cac2 control setup: the remembered start is one line in jobs.js (the plant the control cuts) — the anchor of the control is in the source');
  const MJ9 = mutantCopies('stop-tree-cac2', ROOT);
  const R = await svcScene(MJ9.load('src/jobs.js', editAnchor(JSRC, PEND, '    if (false /* MUTANT: the release — a start during a stop is «already running» */) {', "src/jobs.js"), 'release'), 'job-start-during-stop-mut');
  const rx = await R.press('start', { settle: true });
  await R.end();
  // the release (measured on the test machine, 2.369.412 base): its start sets desiredUp BEFORE the «already running» refusal, so at
  // the stop's end the service is DOWN with no new run and the crash policy's timer brings it back 5 s on, COUNTED as a crash
  // (six such presses park it); with `restart: 'never'` nothing brings it back — by reading src/job-model.js onServiceExit (the row's
  // «a second start was needed»)
  ok(R.up && rx.answer && /is already running/.test(rx.answer.error || '') && rx.ended && rx.state === 'down' && rx.newRuns === 0 && rx.fails === 1, 'B-cac2 CONTROL (the release, in a copy): the start answers «already running»; at the stop\'s end the service is DOWN with no new run, and what brings it back is the crash policy (counted: 1 toward the park) — never the start', rx);
  // its control: the line that clears it cut (a copy) — the remembered start survives the second stop (read off the record, no wait)
  const CLR = '    delete job._startAfterStop;   // B-cac2: a stop pressed after a remembered start (or a restart) means stopped — it starts no more\n';
  ok(JSRC.split(CLR).length === 2, 'B-cac2 control setup: the anchor of the control «a later stop clears the remembered start» is in the source');
  const C = await svcScene(MJ9.load('src/jobs.js', editAnchor(JSRC, CLR, '    /* MUTANT: a later stop leaves the remembered start */\n', "src/jobs.js"), 'no-clear'), 'job-start-stop-mut');
  const cx = await C.press('start-stop');
  await C.end();
  ok(C.up && cx.answer && cx.answer.pending === true && cx.flagAfter === true, 'B-cac2 CONTROL (the clear cut, in a copy): the remembered start SURVIVES the second stop — it would start when the run ends', cx);
  // 主开发 21:46Z (a): the asked start's MEMORY-PARK road and its two GUARDS (a job removed meanwhile, the engine's end) —
  // in-process, nothing spawned: the engine's own start / touch / owner message recorded on the instance
  const guardScene = (Mod, tag, kind = 'task') => {
    const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), WRAP);
    const J = new Mod.JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: () => { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
    J.init();
    const job = { id: 'jb-c4c20001', kind, name: 'asked start', state: 'up', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: Date.now() - 1000 }], createdAt: 1, cmd: { argv: ['true'] } };
    J.jobs.set(job.id, job);
    const out = { starts: 0, said: [], told: [], parked: 0 };
    J.start = () => { out.starts++; return { ok: true }; };
    J._touch = (j, ev) => { if (ev && ev.what) out.said.push(ev.what); };
    J._notifyOwner = (j, ev) => { if (ev && ev.what) out.told.push(ev.what); };
    J._countEnd = () => ({ count: 2, park: true });   // its run ends out of memory, the second time: the park law parks it
    J._parkForMemory = () => { out.parked++; };
    return { J, job, out };
  };
  const flush = () => new Promise((r) => setImmediate(r));
  {
    // the ROAD: a task whose run ends parked for memory while a start was asked — the park is never undone; it is SAID
    const P = guardScene(require(path.join(ROOT, 'src/jobs.js')), 'cac2-park');
    P.job._startAfterStop = true;
    let threw = null; try { P.J._finalizeRun(P.job, P.job.runs[0], { code: 137, endedAt: Date.now() }, 'sweep'); } catch (e) { threw = String(e && e.message); }
    await flush();
    ok(!threw && P.out.parked === 1 && P.out.starts === 0 && P.out.said.some((w) => /the start asked during its stop was not done: it ended out of memory and is parked/.test(w)) && P.out.told.some((w) => /out of memory and is parked/.test(w)),
      'B-cac2 (主开发 21:46Z a): an asked start that meets an OUT-OF-MEMORY PARK is not done — the park stands, the job\'s events and its owner are told why', { threw, ...P.out });
    P.J.shutdown();
    const PARKA = '      if (memPark && memPark.park) { this._parkForMemory(job, run); this._startAskedAtStop(job, startAsked, PARKED_NO_START); return; }';
    ok(JSRC.split(PARKA).length === 2, 'B-cac2 control setup: the anchor of the control «the park road» is in jobs.js');
    const Px = guardScene(MJ9.load('src/jobs.js', editAnchor(JSRC, PARKA, '      if (memPark && memPark.park) { this._parkForMemory(job, run); this._startAskedAtStop(job, startAsked); return; }   /* MUTANT: the park undone */', "src/jobs.js"), 'park-undone'), 'cac2-park-mut');
    Px.job._startAfterStop = true;
    try { Px.J._finalizeRun(Px.job, Px.job.runs[0], { code: 137, endedAt: Date.now() }, 'sweep'); } catch { }
    await flush();
    ok(Px.out.starts === 1, 'B-cac2 CONTROL (the park road without its refusal, in a copy): the asked start UNDOES the park', Px.out);
    Px.J.shutdown();
    // its read (b8f S1): a SERVICE's park road — the likelier one (a restart whose run ends out of memory before the stop reaches
    // it) — runs to the finalize's end, where the refusal rides the last call
    const Ps = guardScene(require(path.join(ROOT, 'src/jobs.js')), 'cac2-park-svc', 'service');
    Ps.job._startAfterStop = true; Ps.job.desiredUp = false;
    let threwS = null; try { Ps.J._finalizeRun(Ps.job, Ps.job.runs[0], { code: 137, endedAt: Date.now() }, 'sweep'); } catch (e) { threwS = String(e && e.message); }
    await flush();
    ok(!threwS && Ps.out.parked === 1 && Ps.out.starts === 0 && Ps.out.said.some((w) => /the start asked during its stop was not done: it ended out of memory and is parked/.test(w)),
      'B-cac2 (its read): a SERVICE whose run ends parked for memory while a start was asked — the park stands and is said (the finalize\'s last call carries the refusal)', { threwS, ...Ps.out });
    Ps.J.shutdown();
    const PARKS = '    this._startAskedAtStop(job, startAsked, memPark && memPark.park ? PARKED_NO_START : null);';
    ok(JSRC.split(PARKS).length === 2, 'B-cac2 control setup: the anchor of the control «the service park road» is in jobs.js');
    const Psx = guardScene(MJ9.load('src/jobs.js', editAnchor(JSRC, PARKS, '    this._startAskedAtStop(job, startAsked, null);   /* MUTANT: the service park undone */', "src/jobs.js"), 'park-undone-svc'), 'cac2-park-svc-mut', 'service');
    Psx.job._startAfterStop = true; Psx.job.desiredUp = false;
    try { Psx.J._finalizeRun(Psx.job, Psx.job.runs[0], { code: 137, endedAt: Date.now() }, 'sweep'); } catch { }
    await flush();
    ok(Psx.out.starts === 1, 'B-cac2 CONTROL (the service road without its refusal, in a copy): the asked start UNDOES the park', Psx.out);
    Psx.J.shutdown();
    // the GUARDS: removed meanwhile, the engine's end
    const G = guardScene(require(path.join(ROOT, 'src/jobs.js')), 'cac2-guards');
    G.J._startAskedAtStop(G.job, true); G.J.jobs.delete(G.job.id); await flush();
    const afterRemoved = G.out.starts;
    G.J.jobs.set(G.job.id, G.job); G.J._startAskedAtStop(G.job, true); G.J._unreadStopped = true; await flush();
    const afterEnd = G.out.starts;
    G.J._unreadStopped = false; G.J._startAskedAtStop(G.job, true); await flush();
    ok(afterRemoved === 0 && afterEnd === 0 && G.out.starts === 1, 'B-cac2 (主开发 21:46Z a): the asked start is NOT done for a job removed meanwhile nor after the engine\'s end — and is done otherwise', { afterRemoved, afterEnd, then: G.out.starts });
    G.J.shutdown();
    const GUARD = '      if (this._unreadStopped || this.jobs.get(job.id) !== job) return;   // the engine ended, or the job was removed meanwhile\n';
    ok(JSRC.split(GUARD).length === 2, 'B-cac2 control setup: the anchor of the control «the two guards» is in jobs.js');
    const Gx = guardScene(MJ9.load('src/jobs.js', editAnchor(JSRC, GUARD, '      /* MUTANT: no guard */\n', "src/jobs.js"), 'no-guard'), 'cac2-guards-mut');
    Gx.J._startAskedAtStop(Gx.job, true); Gx.J.jobs.delete(Gx.job.id); await flush();
    const xRemoved = Gx.out.starts;
    Gx.J.jobs.set(Gx.job.id, Gx.job); Gx.J._startAskedAtStop(Gx.job, true); Gx.J._unreadStopped = true; await flush();
    ok(xRemoved === 1 && Gx.out.starts === 2, 'B-cac2 CONTROL (no guard, in a copy): the asked start STARTS a removed job, and starts after the engine\'s end', { xRemoved, all: Gx.out.starts });
    Gx.J._unreadStopped = false; Gx.J.shutdown();
  }
  for (const r of copiesCensus(MJ9.files, MJ9.dir, ROOT, { minCopies: 5, label: 'B-cac2 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf8');
  ok(/const needsControl = \[[^\]]*'restart'[^\]]*\];/.test(ar) && /else if \(act === 'restart'\) r = a\.jm\.restart\(job, \{ caller: a\.caller \}\);/.test(ar) && /case 'restart': \{/.test(cli) && /vibespace-job restart <id>/.test(cli) && /else if \(r\.pending\) console\.log\(`not started yet: /.test(cli), 'WIRING: the agent route\'s restart needs control; the CLI has `restart <id>` (in its usage) and says a pending start as one');
}

// ── §10 B-2c5c: a hub started by hand INSIDE a job — its scope, its process group and its mark hold the hub — is never ended by the
// job's stop: no whole-scope kill (the manager's or cgroup.kill) while it holds the hub; the job's own processes one by one ──
console.log('§10 B-2c5c — the job\'s stop never ends a hub that runs inside it (or what that hub runs)');
{
  const PI10 = require(path.join(ROOT, 'src/proc-identity.js'));
  // (a) the parent chain — a fake /proc: the hub 4100 (start 50) ← 4101 ← 4102; a job member 4200 under 4000 (not the hub's)
  const PR = path.join(D, 'proc10'); fs.mkdirSync(PR, { recursive: true });
  const stat = (pid, comm, ppid, start) => { fs.mkdirSync(path.join(PR, String(pid)), { recursive: true }); fs.writeFileSync(path.join(PR, String(pid), 'stat'), `${pid} (${comm}) S ${ppid} ${pid} ${pid} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0 0`); };
  stat(4000, 'bash', 1, 10); stat(4100, 'node', 4000, 50); stat(4101, 'claude', 4100, 60); stat(4102, 'sh', 4101, 70); stat(4200, 'sleep', 4000, 80);
  stat(4300, 'node', 4100, 90); stat(4301, 'bash', 4300, 91); stat(4400, 'node', 4301, 92); stat(4401, 'sh', 4400, 93);   // a job's wrapper 4300 the hub spawned; its main 4301; a hub 4400 booting inside it
  const keep = new Map([[4100, 50]]), K = (pid, k = keep, f = PI10.keptByChain) => f(pid, k, { procRoot: PR });
  ok(K(4100) && K(4101) && K(4102) && !K(4200) && !K(4000) && !K(4102, new Map([[4100, 51]])) && K(4102, new Map([[4100, 0]])),
    'keptByChain: the hub and everything under it by the parent chain are kept; a job member beside it, the shell above it and a recycled pid (another start) are not', { a: K(4101), b: K(4200) });
  // its read r1 (M1): the hub spawned every wrapper — the walk STOPS at the job's wrapper, else every job process is «the hub's»;
  // (M4): a hub not yet in server.pid is named by its shape (isRoot)
  const W1 = new Set([4300]);
  ok(!K(4301, keep, (p, k, o) => PI10.keptByChain(p, k, { ...o, stop: W1 })) && K(4301) && K(4401, new Map(), (p, k, o) => PI10.keptByChain(p, k, { ...o, stop: W1, isRoot: (x) => x === 4400 })) && !K(4301, new Map(), (p, k, o) => PI10.keptByChain(p, k, { ...o, stop: W1, isRoot: (x) => x === 4400 })),
    'keptByChain stops at the job\'s wrapper (its main is the JOB\'s, though the hub spawned the wrapper); a hub booting inside the job is named by its shape before its pid file', { m1: K(4301) });
  const PISRC = fs.readFileSync(path.join(ROOT, 'src/proc-identity.js'), 'utf8');
  const HIT = '    if ((keep.has(p) && (!keep.get(p) || keep.get(p) === Number(r[19]))) || (isRoot && isRoot(p))) return true;\n';
  const chainCut = MJ.load('src/proc-identity.js', anchored(PISRC, HIT, '', 'kept-chain-cut'), 'kept-chain-cut');
  ok(!K(4101, keep, chainCut.keptByChain) && !K(4100, keep, chainCut.keptByChain), 'CONTROL (the match cut, in a copy): the hub\'s own processes read as the job\'s — RED');
  const STOPL = '    if (stop && stop.has(p)) return false;\n';
  const stopCut = MJ.load('src/proc-identity.js', anchored(PISRC, STOPL, '', 'kept-chain-no-stop'), 'kept-chain-no-stop');
  ok(K(4301, keep, (p, k, o) => stopCut.keptByChain(p, k, { ...o, stop: W1 })), 'CONTROL (the stop at the wrapper cut, in a copy): the job\'s own main reads as the hub\'s — no stop ends it (the read\'s M1) — RED');
  // (b) the wrapper's doors, compiled from its own source with the scope's facts stubbed (nothing is signalled)
  const W = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8');
  const fnOf = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('not found: ' + head); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } throw new Error('unclosed: ' + head); };
  const forceOf = (src, scope) => {
    const calls = [];
    const env = { scopeDir: '/fake/scope', keptTest: () => (scope.hub ? (p) => String(p) === '4100' : null), procsOf: () => scope.procs.slice(), procsOrNull: () => (scope.unread ? null : scope.procs.slice()), keptInScope: () => scope.inside || 0,
      scopeRows: () => scope.procs.filter((p) => p !== '4100').map((p) => [Number(p), 1, 1]), killNow: (r) => { calls.push('kill ' + r[0]); return true; },
      scopeKill: async (sig) => { calls.push('scope ' + sig); return true; }, sayKept: (n, w, u) => calls.push(`said ${n} ${w}${u ? ' unread' : ''}`),
      fs: { writeFileSync: (f) => calls.push('write ' + path.basename(f)) }, path };
    const f = new Function(...Object.keys(env), `let forced = null; ${fnOf(src, 'async function forceScope(why) {')}\nreturn forceScope;`)(...Object.values(env));   // eslint-disable-line no-new-func
    return f('it did not end').then(() => calls);
  };
  const withHub = await forceOf(W, { hub: true, procs: ['4100', '4200'] }), noHub = await forceOf(W, { hub: false, procs: ['4200'] }), blind = await forceOf(W, { hub: true, unread: true, inside: 1, procs: [] });
  ok(withHub.join() === 'said 1 its kill,kill 4200' && noHub[0] === 'scope SIGKILL' && blind.join() === 'said 1 its kill unread', 'the wrapper\'s forced end of a scope that holds the hub: never the manager\'s kill nor cgroup.kill — the job\'s process killed alone, said; a list that cannot be read is no proof the hub is gone (its cgroup file says it is there: nothing whole); a scope without it is killed whole as before', { withHub, noHub, blind });
  const GUARD = "  if (held) { sayKept(held, 'its kill', list === null); let n = 0; for (const p of scopeRows() || []) if (killNow(p)) n++; if (n && !forced) forced = why.replace(/its scope was killed$/, 'its own processes were killed one by one (the VibeSpace hub in its scope left alone)'); return n > 0; }   // the end says what was DONE: «by force» only when one was killed\n";
  const wx = await forceOf(anchored(W, GUARD, '', 'force-scope-hub-cut'), { hub: true, procs: ['4100', '4200'] });
  ok(wx.includes('scope SIGKILL'), 'CONTROL (the guard cut, in a copy): the manager kills the WHOLE scope — the hub with it — RED', wx);
  // the manager's scope signal when the list cannot be read: never while the hub lives in the scope (its own cgroup file)
  const termOf = (src, inside) => { const calls = []; const env = { keptInScope: () => inside, sayKept: (n, w, u) => calls.push(`said ${n} ${w}${u ? ' unread' : ''}`), scopeKill: (sig) => { calls.push('scope ' + sig); return Promise.resolve(true); } };
    const i = src.indexOf('const scopeTerm = (sig) => {'), j = src.indexOf('\n', i);
    const f = new Function(...Object.keys(env), `let scopeSent = 0; ${src.slice(i, j)}\nreturn scopeTerm;`)(...Object.values(env));   // eslint-disable-line no-new-func
    return f('SIGTERM').then(() => calls); };
  const t1 = await termOf(W, 1), t0 = await termOf(W, 0);
  const TG = "const inside = keptInScope(); if (inside) { sayKept(inside, 'its stop', true); return Promise.resolve(false); } ";
  const tx = await termOf(anchored(W, TG, '', 'scope-term-hub-cut'), 1);
  ok(t1.join() === 'said 1 its stop unread' && t0.join() === 'scope SIGTERM' && tx.join() === 'scope SIGTERM', 'the manager\'s scope signal (its list unread) is never sent while the hub lives in the scope — said; CONTROL (the guard cut, in a copy): the whole scope signalled — RED', { t1, t0, tx });
  // the rows a stop signals one by one: never the hub's (the scope's, the group's, the mark's)
  ok(/!isKeeper\(l\) && !\(kept && kept\(l\)\)\)\.map\(rowOf\)/.test(W) && /r\[0\] !== 'Z' && !\(kept && kept\(e\)\)\) out\.push/.test(W) && /if \(\(kept && kept\(e\)\) \|\| anc\.has\(Number\(e\)\)\) continue;\n\s+look\(e, r, false\);/.test(W)
    && /own = \(\) => procsOf\(scopeDir\)\.filter\(\(p\) => !\(kept && kept\(p\)\)\)/.test(W) && (fnOf(W, 'async function drainScope() {').match(/procsOf\(scopeDir\)/g) || []).length === 2,
  'WIRING: the scope\'s rows, the group\'s rows and the marked escapees skip the hub\'s processes; the drain counts, waits on and kills only the job\'s (own())');
  // (c) the engine: its group signal never reaches a group the hub is in (compiled from its own source, PI stubbed — nothing signalled)
  const JS = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  const groupOf = (src, inGroup) => {
    const calls = [], stamp = { pid: 4321, starttime: 9 };
    const PIs = { pgidOf: () => (inGroup ? 4321 : 999), signalIdentity: (st, sig, o) => { calls.push(`${sig} group=${!!(o && o.group)}`); return { ok: true }; } };
    const self = { _hubIsMain: () => false, _readStamp: () => stamp, _verifyAlive: () => true, _killTree: (j, st, o) => calls.push(`tree group=${!!(o && o.group)}`), d: { log: () => calls.push('said') } };
    const f = new Function('PI', `return function ${fnOf(src, '  _killGroup(job, sig) {').trim()};`)(PIs);   // eslint-disable-line no-new-func
    f.call(self, { id: 'jb-2c5c0001' }, 'SIGTERM'); f.call(self, { id: 'jb-2c5c0001' }, 'SIGKILL');
    return calls;
  };
  const gIn = groupOf(JS, true), gOut = groupOf(JS, false);
  const GS = '    return PI.signalIdentity(stamp, sig, { group: !inGroup, what: `job ${job.id}` }).ok;';
  const gx = groupOf(anchored(JS, GS, '    return PI.signalIdentity(stamp, sig, { group: true, what: `job ${job.id}` }).ok;', 'group-signal-hub-cut'), true);   // stale-pins: kept — the control plants the older group signal in a copy
  ok(gIn.join() === 'said,SIGTERM group=false,tree group=true,SIGKILL group=false' && gOut.join() === 'SIGTERM group=true,tree group=false,SIGKILL group=true',
    'the engine\'s stop of a job whose process group holds this hub: the wrapper ALONE hears it (said once), a SIGKILL ends the whole tree by identity (the group\'s members too, the hub\'s pruned); otherwise the group as before', { gIn, gOut });
  ok(gx.includes('SIGTERM group=true'), 'CONTROL (the group signal back, in a copy): the job\'s group signal reaches the hub — RED', gx);
  // (d) the engine's one test, by the REAL parent chain: this process (the stand-in hub) and its own child are the hub's; pid 1 is not
  const JM = require(path.join(ROOT, 'src/jobs.js')).JobManager, own = (pid, wrappers = [], wrapper = 0) => JM.prototype._hubsOwn.call({ _wrappersHeld: () => wrappers }, pid, wrapper);
  const kid = spawn('sleep', ['30'], { stdio: 'ignore' });
  if (!(await until(() => commOf(kid.pid) === 'sleep', 20000))) expired.push('(d) the stand-in child never read as `sleep` (20 s)');   // r4294: its exec landed — the fact, never a span
  const wrap = spawn('sh', ['-c', 'sleep 30; true'], { stdio: 'ignore' });   // a stand-in job wrapper (ours) and its job's process
  if (!(await until(() => commOf(childOf(wrap.pid)) === 'sleep', 20000))) expired.push('(d) the stand-in wrapper\'s child never read as `sleep` (20 s)');
  let jobKid = 0; try { jobKid = Number(String(fs.readFileSync(`/proc/${wrap.pid}/task/${wrap.pid}/children`, 'utf8')).trim().split(/\s+/)[0]) || 0; } catch { }
  const kidOwn = own(kid.pid), selfOwn = own(process.pid), initOwn = own(1), jobOwn = jobKid ? own(jobKid, [[wrap.pid, 0]]) : null, jobNoStop = jobKid ? own(jobKid, []) : null;
  // its read r2 (R1): `kid` stands for ANOTHER job's wrapper the hub spawned (it sits in this job's scope once the hub runs inside it): with
  // THIS job's wrapper named it is the hub's; with every held wrapper as the stop (r1's form) it read as this job's — killed with it
  const otherOwn = own(kid.pid, [[kid.pid, 0], [wrap.pid, 0]], wrap.pid), otherR1 = own(kid.pid, [[kid.pid, 0], [wrap.pid, 0]]), jobOwnW = jobKid ? own(jobKid, [], wrap.pid) : null;
  try { kid.kill('SIGKILL'); } catch { } try { if (jobKid) process.kill(jobKid, 'SIGKILL'); } catch { } try { wrap.kill('SIGKILL'); } catch { }
  ok(otherOwn === true && otherR1 === false && jobOwnW === false, 'the engine\'s _hubsOwn with the run\'s OWN wrapper: another job\'s wrapper the hub spawned stays the hub\'s (r1\'s every-held-wrapper stop read it as this job\'s — CONTROL, RED); this job\'s process is the job\'s', { otherOwn, otherR1, jobOwnW });
  ok(selfOwn && kidOwn && !initOwn && jobKid > 0 && jobOwn === false && jobNoStop === true, 'the engine\'s _hubsOwn: the hub and a process it started are the hub\'s; a JOB\'s process (under its wrapper, which the hub spawned) is the job\'s — the walk stops at the wrapper (without that stop it read as the hub\'s: the read\'s M1); pid 1 is not', { selfOwn, kidOwn, initOwn, jobOwn, jobNoStop });
  // (e) its read r2 (R6): the WRAPPER's own test — compiled from its source, over REAL processes this suite started: the suite is the hub
  // (the server.pid root), `wrap2` (sh, ours) the wrapper, its child the job's process; and hubShaped over real node processes
  const wrap2 = spawn('sh', ['-c', 'sleep 30; true'], { stdio: 'ignore' }), hubKid2 = spawn('sleep', ['30'], { stdio: 'ignore' });   // the wrapper stand-in; a process the «hub» (this suite) runs
  if (!(await until(() => commOf(childOf(wrap2.pid)) === 'sleep' && commOf(hubKid2.pid) === 'sleep', 20000))) expired.push('(e) the wrapper stand-in\'s child and the hub\'s sleep never both read as `sleep` (20 s)');   // r4294: on the fact
  let job2 = 0; try { job2 = Number(String(fs.readFileSync(`/proc/${wrap2.pid}/task/${wrap2.pid}/children`, 'utf8')).trim().split(/\s+/)[0]) || 0; } catch { }
  // hubShaped over a STAND-IN /proc table (no process named like the hub is started here — test-architecture §57 keeps hub boots in
  // scripts/hub-boot.mjs): its argv and its cwd, as the kernel would answer them
  const D10 = path.join(D, 'hub10'), PROC10 = { 1001: [`node\0${D10}/server.js\0`, '/'], 1002: ['node\0server.js\0', D10], 1003: [`node\0${D10}/other.js\0`, D10], 1004: ['node\0server.js\0', '/var/empty'], 1005: ['sh\0-c\0sleep 30\0', D10] };
  const fs10 = { readFileSync: (f) => { const m = /^\/proc\/(\d+)\/cmdline$/.exec(f); if (!m || !PROC10[m[1]]) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return PROC10[m[1]][0]; },
    readlinkSync: (f) => { const m = /^\/proc\/(\d+)\/cwd$/.exec(f); if (!m || !PROC10[m[1]]) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return PROC10[m[1]][1]; } };
  const shapedOf = (src) => new Function('fs', 'path', 'CHECKOUT', 'SERVER_JS', 'nodeOrUnknown', `${fnOf(src, 'function hubShaped(pid) {')}\nreturn hubShaped;`)(fs10, path, D10, path.join(D10, 'server.js'), (p) => !(PROC10[p] && PROC10[p][2] === 'tail'));   // eslint-disable-line no-new-func
  const keptOf = (src, shaped) => new Function('keptOutHere', 'hubShaped', 'nodeOrUnknown', 'keptByChain', 'hubChain', 'process', `${fnOf(src, 'function keptTest() {')}\nreturn keptTest();`)(() => [[process.pid, 0]], shaped, () => true, PI10.keptByChain, PI10.hubChain, { pid: wrap2.pid });   // eslint-disable-line no-new-func
  PROC10[1007] = ['tail\0-f\0server.js\0', D10, 'tail'];   // its read (SHOULD 6): a tail of server.js in the checkout — not node
  const sh = shapedOf(W), shapes = { abs: sh(1001), rel: sh(1002), other: sh(1003), relElsewhere: sh(1004), shell: sh(1005), gone: sh(1006), tail: sh(1007) };
  const k2 = keptOf(W, () => false), wk = { job: job2 ? k2(job2) : null, hub: k2(process.pid), hubKid: k2(hubKid2.pid) };
  const STOPW = 'stop = new Set([process.pid]);';
  const wkx = keptOf(anchored(W, STOPW, 'stop = null;', 'wrapper-kept-no-stop'), () => false), shx = shapedOf(anchored(W, '  if (args.includes(SERVER_JS)) return true;\n', '', 'hub-shaped-abs-cut'));
  const ctl = { job: job2 ? wkx(job2) : null, abs: shx(1001), tail: shapedOf(anchored(W, '  if (!nodeOrUnknown(pid)) return false;', '', 'hub-shaped-exe-cut'))(1007) };
  try { hubKid2.kill('SIGKILL'); } catch { } try { if (job2) process.kill(job2, 'SIGKILL'); } catch { } try { wrap2.kill('SIGKILL'); } catch { }
  ok(job2 > 0 && wk.job === false && wk.hub === true && wk.hubKid === true && shapes.abs === true && shapes.rel === true && shapes.other === false && shapes.relElsewhere === false && shapes.shell === false && shapes.gone === false && shapes.tail === false,
    'the WRAPPER\'s hub test over real processes: the job\'s own process is the job\'s (the walk stops at the wrapper itself), the hub and what it runs are kept; a hub of this checkout is known by its argv (its server.js by path, or server.js with the checkout as cwd) — another script, server.js elsewhere, a shell, a gone pid are not', { wk, shapes });
  ok(ctl.job === true && ctl.abs === false && ctl.tail === true, 'CONTROLS (each cut, in a copy): without the wrapper\'s own stop the job\'s process reads as the hub\'s (no stop ends it); without the argv\'s path a hub booting by its absolute path is not known; without the executable\'s check a `tail -f server.js` is «the hub» (its stop refused) — each RED', ctl);
  ok(/const hubs = this\._hubTest\(ownW\); for \(const id of ids\) if \(id && !sent\.has\(id\.pid\) && !hubs\(id\.pid\) && PI\.aliveIdentity\(id\) === true/.test(JS) && /hubs = this\._hubTest\(ownW\), found = marked\.filter\(\(id\) => !hubs\(id\.pid\)\)/.test(JS) && (JS.match(/ownOf\(await this\._scopeProcs\(scope\)\)/g) || []).length === 2 && /const ownOf = \(ps\) => \{ const hubs = this\._hubTest\(ownW\); return ps && ps\.filter\(\(x\) => !hubs\(x\)\); \};/.test(JS)
    && /if \(r === 'hub'\) \{ run\._scopeEmpty = true; return this\._reapSaid\(job, run, scope, r, k\.out\); \}/.test(JS) && /else if \(r === 'hub'\) said\(this\._hubScopeWords\(ko\)\)/.test(JS)
    && /const hubsL = this\._hubTest\(ownW\), late = sent\.size \? \(await scan\(\)\)\.filter\(\(id\) => !sent\.has\(id\.pid\) && !hubsL\(id\.pid\)\)/.test(JS) && /\.\.\.\(hubInGroup \? \{ hub: true \} : \{\}\)/.test(JS) && /alone = !!this\._ctlJson\(job, run, 'stopping\.json'\) \|\| hubInGroup;/.test(JS)
    && /engine \? \(s\.alone \? \(s\.hub \? 'alone-hub' : 'alone'\) : 'engine'\)/.test(W) && /by === 'engine' \|\| by === 'intent' \|\| by === 'alone' \|\| by === 'alone-hub' \? intentTree\(\)/.test(W),
  'WIRING: the clear of kept processes (both walks) and the stop of a doubted run never signal the hub\'s (its mark is the job\'s); the reap and the stop ladder take a scope killed around the hub as done, said; a hub in the job\'s group makes the intent say `alone` + `hub` and the wrapper signals the job\'s processes itself (the read\'s M3)');
  // ── (f) round wwa7r2uc1 — THE MAIN DOOR: a hub that IS the job's main process (VibeSpace started AS the job: its command became the
  // hub, the job's wrapper its parent). The wrapper's main door asks the SAME kept test as every other door — compiled from its source
  // over a stand-in /proc (the wrapper 4500, its main 4501 a hub of this checkout by its argv; the wrapper 4600, its main 4601 a shell
  // — the job's own); nothing is signalled (process.kill and the handle's kill are recorders)
  stat(4500, 'node', 4100, 100); stat(4501, 'node', 4500, 101); stat(4502, 'node', 4500, 104); stat(4600, 'node', 4100, 102); stat(4601, 'sh', 4600, 103);
  PROC10[4501] = [`node\0${D10}/server.js\0`, '/']; PROC10[4502] = ['node\0.\0', D10]; PROC10[4601] = ['sh\0-c\0sleep 30\0', D10];   // 4502: a hub run as `node .` — known by its pid file only
  const keptFor = (src, wrapperPid, ko) => new Function('keptOutHere', 'hubShaped', 'nodeOrUnknown', 'keptByChain', 'hubChain', 'process', `${fnOf(src, 'function keptTest() {')}\nreturn keptTest;`)(() => ko, shapedOf(src), () => true, (p, k, o) => PI10.keptByChain(p, k, { ...o, procRoot: PR }), (h, o) => PI10.hubChain(h, { ...o, procRoot: PR }), { pid: wrapperPid });   // eslint-disable-line no-new-func
  const DOOR0 = 'const HUB_MAIN_WORDS = ', DOOR1 = 'const termMain = (p, sig) => {';
  const doorOf = (src, mainPid, wrapperPid, ko = []) => {
    const calls = [], log = [];
    const i = src.indexOf(DOOR0), j = src.indexOf('\n', src.indexOf(DOOR1));
    if (i < 0 || j < i) throw new Error('the main door is not found');
    const env = { mainLive: () => true, keptTest: keptFor(src, wrapperPid, ko), child: { pid: mainPid, kill: (s) => { calls.push('kill ' + s); return true; } }, fs: { writeSync: (fd, b) => log.push(String(b)) }, logFd: 9, logOpen: () => 9,   // (B-15ac follow: the wrapper's own lines ask logOpen() — the log's number, reopened when it has none)
      sayOwn: (t) => log.push(String(t).replace(/^\n+|\n+$/g, '') + '\n'),   // r3732: the wrapper's own lines go out by sayOwn (its queue's line, as written)
      termed: new Map(), termKey: ([p, st]) => `${p}:${st}`, process: { pid: wrapperPid, kill: (p, s) => { calls.push(`signal ${p} ${s}`); } } };
    const d = new Function(...Object.keys(env), `${src.slice(i, j)}\nreturn { termMain, killMain };`)(...Object.values(env));   // eslint-disable-line no-new-func
    const t = d.termMain([mainPid, 101, 4500], 'SIGTERM'), k = d.killMain();
    return { t, k, calls: calls.join(), log: log.join('') };
  };
  const hubMain = doorOf(W, 4501, 4500), hubMainPid = doorOf(W, 4502, 4500, [[4502, 0]]), jobMain = doorOf(W, 4601, 4600);
  const TERMK = 'if (mainKept()) { sayMainKept(sig); return false; } ', KILLK = "const killMain = () => { if (mainKept()) { sayMainKept('SIGKILL'); return false; } ";
  const tCut = doorOf(anchored(W, TERMK, '', 'main-door-term-cut'), 4501, 4500), kCut = doorOf(anchored(W, KILLK, 'const killMain = () => { ', 'main-door-kill-cut'), 4501, 4500);
  ok(hubMain.t === false && hubMain.k === false && hubMain.calls === '' && (hubMain.log.match(/this job is the running VibeSpace: it is not stopped here/g) || []).length === 1 && hubMainPid.t === false && hubMainPid.calls === ''
    && jobMain.t === true && jobMain.calls === 'signal 4601 SIGTERM,kill SIGKILL' && jobMain.log === '',
  'THE MAIN DOOR (wrapper): a main that IS the hub (a hub of this checkout by its argv while it boots, or by its pid file alone — run as `node .`) is never signalled — neither the stop\'s SIGTERM nor the grace\'s SIGKILL — refused by name in the job\'s log, once; a job\'s own main hears both', { hubMain, hubMainPid, jobMain });
  ok(tCut.calls === 'signal 4501 SIGTERM' && kCut.calls === 'kill SIGKILL', 'CONTROLS (each door\'s kept test cut alone, in a copy): the stop\'s SIGTERM reaches the hub that is the main; the grace\'s SIGKILL reaches it — each RED', { tCut, kCut });
  // the stop REFUSED WHOLE while the main is the hub (nothing here is the stop's), and its intent not taken up again at the end
  ok(/function onStop\(sig, at, by\) \{\n  if \(stopping\) return;\n(?:  \/\/[^\n]*\n)+  if \(mainKept\(\)\) \{ sayMainKept\(sig\); refusedAt = Math\.max\(refusedAt, at\); return; \}\n(?:  \/\/[^\n]*\n)+  if \(mainWasHub\) \{ sayHubLeft\(sig\); refusedAt = Math\.max\(refusedAt, at\); return; \}\n  stopping = sig;/.test(W)
    && /const s0 = stopIntent\(\), s = s0 && s0\.at > refusedAt \? s0 : null;/.test(W) && /its process group was killed`; killMain\(\); \}, left\);/.test(W) && !/child\.kill\('SIGKILL'\)/.test(W.slice(W.indexOf('const killMain = ')) .replace(/^const killMain = [^\n]*\n/, '')),
  'WIRING: the wrapper\'s stop is refused whole while its main is the hub (before it marks itself stopping), that refused intent is no stop at the end, and the grace\'s kill of the main goes through the main door only');
  // (g) THE MAIN DOOR (engine): its parent IS the run's wrapper by its stamp — every road refuses by name before anything changes. A
  // REAL engine over a stand-in wrapper (a sleep of ours, its identity stamped as pid.json); every signal the engine would send is
  // RECORDED (proc-identity's signalIdentity swapped for the leg — nothing is signalled), the kill doors wrapped to see who calls them
  const JSRC10 = JS, sent10 = [], realSig = PI10.signalIdentity;
  const standIn = spawn('sleep', ['120'], { stdio: 'ignore' }); if (!(await until(() => commOf(standIn.pid) === 'sleep', 20000))) expired.push('the main door\'s stand-in never read as `sleep` (20 s)');   // r4294: on the fact
  const wid = PI10.identityOf(standIn.pid); mine.push(wid);
  let seq10 = 0;
  const scene = async (Mod, tag, act) => {
    const dd = path.join(D, 'main-door-' + tag); fs.mkdirSync(dd, { recursive: true });
    const J = new Mod.JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: () => { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [], hubParentPid: wid.pid });
    J.init();
    const T = Date.now() - 60000, kind = act === 'timeout' ? 'task' : 'service';
    const job = { id: 'jb-2c5c' + String(++seq10).padStart(4, '0'), kind, name: 'vibespace-restart', state: 'up', desiredUp: kind === 'service', createdAt: T, cmd: { argv: ['node', 'server.js'] },
      owner: { createdBy: 'user', groupsSnapshot: [] }, access: { view: 'session', control: 'session' }, runs: [{ startedAt: T }], ...(act === 'timeout' ? { timeoutMs: 1000 } : {}) };
    J.jobs.set(job.id, job);
    const ctl = J._ctlDir(job, T); fs.mkdirSync(ctl, { recursive: true });
    fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: wid.pid, starttime: wid.starttime, bootId: wid.bootId, argvHash: '0', startedAt: T }));
    const doors = [];
    for (const k of ['_termRun', '_killGroup', '_escalate']) { const f = J[k]; J[k] = function (...a) { doors.push(k); return f.apply(this, a); }; }
    let answer = null;
    if (act === 'stop') answer = J.stop(job);
    else if (act === 'force') answer = J.stop(job, { force: true });
    else if (act === 'rm') answer = J.rm(job, { stop: true });
    else if (act === 'term') answer = J._termRun(job, job.runs[0]);
    else if (act === 'group') answer = J._killGroup(job, 'SIGKILL');
    else if (act === 'escalate') answer = J._escalate(job, null, 'it did not end', job.runs[0]);
    else if (act === 'timeout') { await J._sweep(); answer = { termAt: !!job._termAt }; }
    const logged = () => { try { return fs.readFileSync(path.join(ctl, 'current.log'), 'utf8'); } catch { return ''; } };
    if (J._hubMainSaid && J._hubMainSaid.get(job.runs[0])) await until(async () => logged().includes('this job is the running VibeSpace: it is not stopped here'), 1500);   // the run log's append (off the loop) — awaited only where a refusal was said (a control that says nothing never waits)
    const runLog = logged();
    const out = { answer, doors: doors.join(), desiredUp: job.desiredUp, stopRequested: !!job._stopRequested, termAt: !!job._termAt, listed: J.jobs.has(job.id), intent: fs.existsSync(path.join(ctl, 'stop.json')), said: runLog.includes('this job is the running VibeSpace: it is not stopped here'), onRow: J.events.some((e) => e.jobId === job.id && /refused — this job is the running VibeSpace: it is not stopped here/.test(e.what || '')), timedOut: !!job._timedOut };
    for (const t of job._killSteps || []) clearTimeout(t);   // a kill step a control armed: never fired after the leg
    for (const t of J._timers || []) { clearInterval(t); clearTimeout(t); }   // its read: the engine's own ticks end with the leg
    J.shutdown(); return out;
  };
  const ENTRY = "    { const run0 = job.runs && job.runs[job.runs.length - 1]; if (this._runLive(job, run0) && this._hubIsMain(job, run0)) return this._hubMainRefusal(job, run0, force ? 'a forced stop' : 'the stop'); }\n";
  const TRG = "    if (this._hubIsMain(job, run)) { this._hubMainRefusal(job, run, job._timedOut ? 'its time limit' : job._untilHit ? 'its until-marker' : 'the stop'); delete job._stopRequested; return false; }\n";
  const KGG = "    if (this._hubIsMain(job, run0)) { this._hubMainRefusal(job, run0, sig === 'SIGKILL' ? 'its kill' : 'the stop'); return false; }   // B-2c5c: THE MAIN DOOR\n";
  const ESG = "    if (this._hubIsMain(job, run)) { this._hubMainRefusal(job, run, 'its kill'); return false; }   // B-2c5c: THE MAIN DOOR — never its scope, never its wrapper\n";
  const TOG = "        if (this._hubIsMain(job, run)) { run._limitRefused = true; this._hubMainRefusal(job, run, 'its time limit'); }\n        else { job._timedOut = true; this._termRun(job, run); job._termAt = job._termAt || now(); this._armKillStep(job, run, this._runScope(job, run)); }\n";
  const RMG = "    if (alive && stop) { const s = this.stop(job, { force: false }); if (s && s.code === 'hub-is-main') return s; }   // B-2c5c: never removed while it runs as this hub\n";
  ok([ENTRY, TRG, KGG, ESG, TOG, RMG].every((x) => JSRC10.split(x).length === 2), 'control setup: the engine\'s six main-door guards are found once each');
  const JM10 = require(path.join(ROOT, 'src/jobs.js'));
  const cut = (anchor, to, tag) => MJ.load('src/jobs.js', anchored(JSRC10, anchor, to, tag), tag);
  let g = {};
  PI10.signalIdentity = (id, sig, o = {}) => { sent10.push(`${sig} ${id && id.pid}${o.group ? ' group' : ''}`); return { ok: true }; };
  try {
    g = { stop: await scene(JM10, 'stop', 'stop'), force: await scene(JM10, 'force', 'force'), rm: await scene(JM10, 'rm', 'rm'), term: await scene(JM10, 'term', 'term'), group: await scene(JM10, 'group', 'group'),
      escalate: await scene(JM10, 'esc', 'escalate'), timeout: await scene(JM10, 'tmo', 'timeout') };
    g.sentReal = sent10.splice(0).join();
    g.x = { stop: await scene(cut(ENTRY, '', 'main-door-entry-cut'), 'stopx', 'stop'), term: await scene(cut(TRG, '', 'main-door-term-cut2'), 'termx', 'term'), group: await scene(cut(KGG, '', 'main-door-group-cut'), 'grpx', 'group'),
      escalate: await scene(cut(ESG, '', 'main-door-esc-cut'), 'escx', 'escalate'), timeout: await scene(cut(TOG, "        job._timedOut = true; this._termRun(job, run); job._termAt = job._termAt || now(); this._armKillStep(job, run, this._runScope(job, run));\n", 'main-door-timeout-cut'), 'tmox', 'timeout'),
      rm: await scene(cut(RMG, "    if (alive && stop) this.stop(job, { force: false });\n", 'main-door-rm-cut'), 'rmx', 'rm') };   // stale-pins: kept — the control plants the older form in a copy
    g.sentCut = sent10.splice(0).join();
  } finally { PI10.signalIdentity = realSig; }
  const refused = (r) => !!r && r.answer && r.answer.code === 'hub-is-main' && r.answer.error === 'this job is the running VibeSpace: it is not stopped here' && r.said && !r.intent;
  ok(refused(g.stop) && g.stop.doors === '' && g.stop.desiredUp === true && !g.stop.stopRequested && refused(g.force) && g.force.doors === '' && refused(g.rm) && g.rm.listed
    && g.term.answer === false && !g.term.intent && g.term.said && g.group.answer === false && g.escalate.answer === false && g.escalate.doors === '_escalate' && g.timeout.answer.termAt === false && g.timeout.said && g.timeout.onRow && g.timeout.timedOut === false && g.stop.onRow && g.term.onRow && g.sentReal === '',
  'THE MAIN DOOR (engine): its parent is the run\'s wrapper by its stamp — the stop, a forced stop and rm --stop answer «this job is the running VibeSpace: it is not stopped here» (hub-is-main) before anything changes (no intent, no kill door, the service not marked down, the record kept); the term, group and scope doors and the time limit refuse too; said in the run\'s log AND on the row (its readers\' should: a refused limit left the row silent), a refused limit leaving no «timed out» (its end never reads «timeout»); NOTHING signalled', g);
  ok(!g.x.stop.answer.error && g.x.stop.desiredUp === false && g.x.term.intent && g.x.term.doors.includes('_killGroup') && g.x.group.answer === true && g.x.escalate.doors.includes('_killGroup') && g.x.timeout.termAt === true && g.x.rm.listed === false && /SIGKILL/.test(g.sentCut),
  'CONTROLS (each guard cut ALONE, in a copy): the press is taken (the service marked down); the term door writes the intent and calls the group door; the group door SIGKILLs; the scope door calls the group door; the time limit arms its kill step; rm --stop removes the running record — each RED', g.x);
  ok(/if \(this\._hubIsMain\(job, run\)\) \{ this\._hubMainRefusal\(job, run, 'its until-marker'\); return; \} this\._termRun\(job, run\);/.test(JSRC10) && /if \(this\._hubIsMain\(job, run\)\) \{ run\._untilRefused = true; this\._hubMainRefusal\(job, run, 'its until-marker'\); return; \}[^\n]*\n\s+job\._untilHit = true;\n\s+this\._event\(job, 'until-marker hit/.test(JSRC10) && /const seam = Number\(this\.d\.hubParentPid\);/.test(JSRC10) && /job\.untilOutput && run && !job\._untilHit && !run\._untilRefused\) this\._untilScan\(job, run\);/.test(JSRC10),
  'WIRING: the until-marker asks the main door at its hit, BEFORE it is marked hit (a refused marker marks the RUN: its scan of the hub\'s own log stops) (never said «completing», its end never «until-output») and again at its timer; the engine\'s parent chain is the process\'s own (a suite\'s stand-in only by `hubParentPid`)');
  // its read (SHOULD 8 + 2 + 3): the engine's proof itself — FALSE for the right pid with another start and for a parent that is not the
  // stamp's; the REAL road (no stand-in): this process's own parent chain — the suite's parent stamped as the wrapper (the hub IS the
  // main) and its grandparent (the hub runs UNDER the main: `./run.sh`, `npm start`) are proven, a child of ours is not; once proven,
  // it holds for the run (a wrapper killed later moves our parent, not the fact). Nothing here signals: _hubIsMain only reads
  const mainOf = (Mod, stamp, seam) => { const self = { d: { hubParentPid: seam }, _readStamp: () => stamp(), _verifyAlive: (st) => Mod.JobManager.prototype._verifyAlive.call({}, st) }; const run = { startedAt: 1 }; return () => Mod.JobManager.prototype._hubIsMain.call(self, {}, run); };
  const ppid10 = (pid) => { try { const t = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(t.slice(t.lastIndexOf(')') + 2).split(' ')[1]); } catch { return 0; } };
  const parentId = PI10.identityOf(process.ppid), gp = ppid10(process.ppid), grandId = gp > 1 ? PI10.identityOf(gp) : null;
  const wrongStart = mainOf(JM10, () => ({ ...wid, starttime: wid.starttime + 1 }), wid.pid)(), otherParent = mainOf(JM10, () => wid, process.pid)();
  const realParent = mainOf(JM10, () => parentId, undefined)(), realGrand = grandId ? mainOf(JM10, () => grandId, undefined)() : null, ourChild = mainOf(JM10, () => wid, undefined)();
  let latchStamp = parentId; const latched = mainOf(JM10, () => latchStamp, undefined), first = latched(); latchStamp = null; const after = latched();
  const CHAIN = '    const yes = seam ? seam === Number(st.pid) && this._verifyAlive(st) : PI.hubChain(process.pid, { stop: Number(st.pid), stopStart: Number(st.starttime) || -1 }).reached;';   // r1263 (b): the one recogniser
  const JMchain = cut(CHAIN, '    const yes = seam ? seam === Number(st.pid) && this._verifyAlive(st) : Number(st.pid) === process.ppid && this._verifyAlive(st);', 'main-door-parent-only');
  const grandX = grandId ? mainOf(JMchain, () => grandId, undefined)() : null;
  ok(wrongStart === false && otherParent === false && realParent === true && (realGrand === true || grandId === null) && ourChild === false && first === true && after === true,
    'the engine\'s main-door proof: another start or another parent is no proof; over the REAL parent chain the hub that IS the main and the hub UNDER the main (a launcher) are proven, a process of ours is not; proven once, it holds for the run', { wrongStart, otherParent, realParent, realGrand, ourChild, first, after });
  ok(grandX === false || grandId === null, 'CONTROL (the parent alone, as the first form, in a copy): a hub UNDER the job\'s main (`./run.sh`, `npm start`) is not seen — its launcher\'s stop ends or orphans it — RED', { grandX });
  try { standIn.kill('SIGKILL'); } catch { }
  // (h) SMALLS — (1) a STALE <data>/server.pid: its pid started AFTER the file's own time names no hub (a recycled pid)
  const SPF = fnOf(W, 'function startedBy(pid, atMs) {');
  const startedOf = (src, st) => new Function('statOf', 'fs', `${src}\nreturn startedBy;`)(() => (st == null ? null : Array.from({ length: 22 }, (_, k) => (k === 19 ? String(st) : '0'))), { readFileSync: () => 'cpu 1 2 3\nbtime 1000\n' });   // eslint-disable-line no-new-func
  const koOf = (src, mtimeMs, st, shaped = false) => new Function('fs', 'path', '__dirname', 'process', 'ctlDir', 'startedBy', 'hubShaped', `${fnOf(src, 'function keptOutHere() {')}\nreturn keptOutHere;`)(
    { readFileSync: (f) => { if (String(f).endsWith('server.pid')) return '4700\n'; throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }, statSync: () => ({ mtimeMs }) }, path, path.join(D10, 'data', 'bin'), { pid: 4500 }, path.join(D10, 'ctl'), startedOf(SPF, st), () => shaped)();   // eslint-disable-line no-new-func
  // the boot at 1000 s; the process started 5 s after it (st 500 ticks): a file written at 1006 s keeps it, one written at 1002 s does not
  const fresh = koOf(W, 1006000, 500), stale = koOf(W, 1002000, 500), edge = koOf(W, 1004500, 500), unreadable = koOf(W, 1002000, null), staleShaped = koOf(W, 1002000, 500, true);
  const staleX = koOf(anchored(W, ' && (startedBy(p, fs.statSync(f).mtimeMs) || hubShaped(p))) out.push([p, 0]);', ') out.push([p, 0]);', 'server-pid-stale-cut'), 1002000, 500);
  ok(JSON.stringify(fresh) === '[[4700,0]]' && JSON.stringify(stale) === '[]' && JSON.stringify(edge) === '[[4700,0]]' && JSON.stringify(unreadable) === '[[4700,0]]' && JSON.stringify(staleShaped) === '[[4700,0]]',
    'small 1: a <data>/server.pid whose process started no later than the file\'s own time (to the second) is the hub\'s root; a pid that started AFTER the file (recycled) is not; a start that cannot be read keeps it; and its read (SHOULD 5): one that looks stale but has a hub\'s argv stays (the wall clock may have stepped since the file)', { fresh, stale, edge, unreadable, staleShaped });
  ok(JSON.stringify(staleX) === '[[4700,0]]', 'CONTROL (the start check cut, in a copy): a stale file\'s recycled pid is kept as the hub — what runs under it is never stopped — RED', staleX);
  // (2) a scope list that CANNOT be read while the hub is inside: nothing is ended, and the end is not «empty» — said
  // 主开发 01:57Z (the hosted run's red, 44652784592): the END measured through the REAL procsOrNull and its errno classes, compiled from
  // the source over a stub fs — a list that EXISTS and cannot be read (EACCES) is unread, named; a list that no longer exists (ENOENT
  // by its path, ENODEV through an fd opened while the scope lived — seen on a real user scope) is an EMPTY scope: the plain end
  const drainOf = async (src, err) => {
    const fsx = { readFileSync: () => { if (err) throw Object.assign(new Error(err), { code: err }); return ''; } };
    const env = { fs: fsx, path, keptTest: () => (p) => String(p) === '4100', procsOf: () => [], rung: { policy: true }, keeperSaid: null, keeper: null, child: null, nap: async () => { }, isKeeper: () => false,
      stopping: 'SIGTERM', keeps: false, statOf: () => null, bootId: () => 'b', scopeRows: () => null, termOnce: () => false, scopeTerm: async () => false, stopAt: 0, stopMs: 1, forceScope: async () => { }, stopTree: [], same: () => false, scopeDir: '/fake/scope', mainWasHub: false };
    const gone = src.slice(src.indexOf('const GONE_LIST = new Set('), src.indexOf('\n', src.indexOf('const GONE_LIST = new Set(')));
    return new Function(...Object.keys(env), `let listUnread = ''; ${gone}\n${fnOf(src, 'function procsOrNull(dir) {')}\n${fnOf(src, 'async function drainScope() {')}\nreturn drainScope;`)(...Object.values(env))();   // eslint-disable-line no-new-func
  };
  const rowsOf = (src, err) => new Function('fs', 'path', 'scopeDir', 'keptTest', 'isKeeper', 'rowOf', `let listUnread = ''; ${src.slice(src.indexOf('const GONE_LIST = new Set('), src.indexOf('\n', src.indexOf('const GONE_LIST = new Set(')))}\n${fnOf(src, 'function scopeRows() {')}\nreturn scopeRows;`)(   // eslint-disable-line no-new-func
    { readFileSync: () => { throw Object.assign(new Error(err), { code: err }); } }, path, '/fake/scope', () => null, () => false, () => null)();
  const FIN = "  const fin = procsOrNull(scopeDir), unread = fin === null;\n  return { ...(left ? { left: { n: left, ...(still && forcedNow ? { force: true } : {}) } } : {}), scopeEmpty: !unread && !fin.filter((p) => !(kept && kept(p))).length, ...(unread ? { scopeUnread: listUnread || true } : {}) };\n";
  const dr = await drainOf(W, 'EACCES'), drGone = await drainOf(W, 'ENOENT'), drDev = await drainOf(W, 'ENODEV');
  const drx = await drainOf(anchored(W, FIN, "  return { ...(left ? { left: { n: left, ...(still ? { force: true } : {}) } } : {}), scopeEmpty: !own().length };\n", 'drain-unread-cut'), 'EACCES');   // stale-pins: kept — the control plants the older form in a copy
  const BLANKET = 'if (e && GONE_LIST.has(e.code)) return []; ';
  const WB = anchored(W, BLANKET, '', 'gone-list-blanket', { count: 2 }), drB = await drainOf(WB, 'ENOENT'), rowsB = rowsOf(WB, 'ENOENT');
  const rowsGone = rowsOf(W, 'ENOENT'), rowsUnread = rowsOf(W, 'EACCES');
  const sayOf = (src) => { const out = []; const f = new Function('fs', 'logFd', 'logOpen', 'sayOwn', `let keptSaid = false; ${fnOf(src, 'function sayKept(n, what, unread = false) {')}\nreturn sayKept;`)({ writeSync: (fd, b) => out.push(String(b)) }, 9, () => 9, (t) => out.push(String(t)));   /* r3732: + sayOwn */ return (n, w, u) => { f(n, w, u); return out.join(''); }; };   // eslint-disable-line no-new-func
  const wordsU = sayOf(W)(1, 'its kill', true), wordsK = sayOf(W)(1, 'its kill', false);
  ok(dr.scopeEmpty === false && dr.scopeUnread === 'EACCES' && /could not be read: nothing of it was ended — what the job started may still run/.test(wordsU) && !/ended one by one/.test(wordsU) && /ended one by one/.test(wordsK)
    && W.includes("(drained.scopeUnread ? ` — its scope's list could not be read${typeof drained.scopeUnread === 'string' ? ` (${drained.scopeUnread})` : ''}: what it started may still run` : '')") && W.includes('...(unread ? { scopeUnread: listUnread || true } : {})'),
  'small 2: a scope list that EXISTS and cannot be read (EACCES) ends nothing — the end is NOT «empty» (the engine reaps it), the job\'s log says «could not be read (EACCES): … may still run» — its errno named —, never «ended one by one»', { dr, wordsU });
  ok(drGone.scopeEmpty === true && drGone.scopeUnread === undefined && drDev.scopeEmpty === true && drDev.scopeUnread === undefined && Array.isArray(rowsGone) && rowsGone.length === 0 && rowsUnread === null,
    '主开发 01:57Z: a scope whose list no longer EXISTS — systemd removed the emptied scope: its path reads ENOENT, a list opened while it lived ENODEV — is an EMPTY scope: the plain end, no warning; the stop\'s rows of a gone list are none (an unread one: null, as before)', { drGone, drDev, rowsGone, rowsUnread });
  ok(drx.scopeEmpty === true && drB.scopeEmpty === false && drB.scopeUnread === 'ENOENT' && rowsB === null, 'CONTROLS (each in a copy): the end measured as before — an unread list reads as an EMPTY scope (RED); the blanket catch back — a list that is simply GONE reads as «could not be read (ENOENT)», the hosted run\'s words on a clean stop, and the stop\'s rows as unread (RED)', { drx, drB, rowsB });
  ok(W.includes("...(drained.scopeUnread ? { scopeUnread: drained.scopeUnread } : {})"), 'the end record carries the unread list\'s errno (exit.json scopeUnread), as the end line does');
  // its read (round wwa7r2uc1, MUST): the forced end says what was DONE — around a hub, the job's own processes one by one (never «its
  // scope was killed»); its list unread, nothing (no «stopped by force» at all: the end says «could not be read: may still run»)
  const forcedOf = async (src, scope) => {
    const env = { scopeDir: '/fake/scope', keptTest: () => (scope.hub ? (p) => String(p) === '4100' : null), procsOf: () => scope.procs.slice(), procsOrNull: () => (scope.unread ? null : scope.procs.slice()), keptInScope: () => scope.inside || 0,
      scopeRows: () => (scope.unread ? null : scope.procs.filter((p) => p !== '4100').map((p) => [Number(p), 1, 1])), killNow: () => true, scopeKill: async () => true, sayKept: () => { }, fs: { writeFileSync: () => { } }, path };
    const o = new Function(...Object.keys(env), `let forced = ''; ${fnOf(src, 'async function forceScope(why) {')}\nreturn { f: forceScope, forced: () => forced };`)(...Object.values(env));   // eslint-disable-line no-new-func
    await o.f('it did not end on SIGTERM in 10 s — its scope was killed'); return o.forced();
  };
  const fAround = await forcedOf(W, { hub: true, procs: ['4100', '4200'] }), fBlind = await forcedOf(W, { hub: true, unread: true, inside: 1, procs: [] }), fWhole = await forcedOf(W, { hub: false, procs: ['4200'] }), fGone = await forcedOf(W, { hub: false, procs: [] });
  const FGONE = "  if (list !== null && !list.length) return false;   // its fresh read (SHOULD 3): the list GONE or empty — nothing of the job is left: no kill, never «its scope was killed»\n";
  const fGoneX = await forcedOf(anchored(W, FGONE, '', 'force-gone-cut'), { hub: false, procs: [] });
  const FSET = "  if (!forced) forced = why; // the first kill's why — and every call kills (round 5: a label is never the guard)\n  await scopeKill('SIGKILL');";
  const fAroundX = await forcedOf(anchored(W, "  // its read (round wwa7r2uc1, MUST): the end says what was DONE", "  if (!forced) forced = why;\n  // its read (round wwa7r2uc1, MUST): the end says what was DONE", 'forced-before-hold'), { hub: true, procs: ['4100', '4200'] });
  ok(fAround === 'it did not end on SIGTERM in 10 s — its own processes were killed one by one (the VibeSpace hub in its scope left alone)' && fBlind === '' && fWhole === 'it did not end on SIGTERM in 10 s — its scope was killed' && W.split(FSET).length === 2,
    'MUST (its read): a forced end around the hub says the job\'s own processes were killed one by one; its list unread, no «stopped by force» (nothing was killed); a scope without the hub, «its scope was killed» as before', { fAround, fBlind, fWhole });
  ok(fAroundX === 'it did not end on SIGTERM in 10 s — its scope was killed', 'CONTROL (the words set before the hold, as before, in a copy): «its scope was killed» for a scope never killed whole — RED', fAroundX);
  ok(fGone === '' && fGoneX === 'it did not end on SIGTERM in 10 s — its scope was killed', 'a forced end whose list is GONE or empty (the job ended meanwhile): nothing killed, no «stopped by force»; CONTROL (the early answer cut, in a copy): «its scope was killed» for a scope that was gone — RED', { fGone, fGoneX });
  // its read (SHOULD 8): onStop's refusal as BEHAVIOUR — compiled from its source with the main the hub: nothing is marked stopping;
  // CONTROL (the refusal cut, in a copy): the stop goes on (marked — the stub stops the rest there)
  const onStopOf = (src, kept) => {
    const seen = [];
    const env = { seen, mainKept: () => kept, sayMainKept: (sig) => seen.push('said ' + sig), mainWasHub: false, sayHubLeft: (sig) => seen.push('hub-left ' + sig), markStopping: () => { throw new Error('MARKED'); } };   // B-2c5c unit 1: the latch, off here (test-job-hub-main drives it)
    const f = new Function(...Object.keys(env), `let stopping = null, stopAt = 0, stopBy = '', refusedAt = 0; ${fnOf(src, 'function onStop(sig, at, by) {')}\nreturn (s, a, b) => { try { onStop(s, a, b); } catch (e) { seen.push(e.message); } return { seen: seen.join(), stopping, refusedAt }; };`)(...Object.values(env));   // eslint-disable-line no-new-func
    return f('SIGTERM', 1234, 'signal');
  };
  const osHub = onStopOf(W, true), osJob = onStopOf(W, false);
  const osX = onStopOf(anchored(W, '  if (mainKept()) { sayMainKept(sig); refusedAt = Math.max(refusedAt, at); return; }\n', '', 'onstop-refusal-cut'), true);
  ok(osHub.seen === 'said SIGTERM' && osHub.stopping === null && osHub.refusedAt === 1234 && osJob.seen === 'MARKED' && osX.seen === 'MARKED',
    'THE MAIN DOOR (wrapper, behaviour): a stop while the main is the hub is refused WHOLE — said, never marked stopping, its moment kept so its intent is no stop at the end; a job\'s own main goes on to its stop; CONTROL (the refusal cut, in a copy): marked stopping — RED', { osHub, osJob, osX });
  // (3) a hub BOOTING inside the job (not yet in server.pid) and outside the wrapper's group: the wrapper's own stop tree holds it out
  ok(/  const kt = keptTest\(\);[^\n]*\n  stopTree = \[\.\.\.keyed\.values\(\)\]\.filter\(\(r\) => !\(kt && kt\(r\[0\]\)\)\);/.test(W),
    'small 3 (WIRING): the wrapper\'s stop tree (its own walk and the engine\'s intent) skips what the kept test holds — a hub booting outside its group by its shape, and what it runs (the test itself: (e) above)');
  // (4) the engine's hub test, memoised one pass at a time
  let walks = 0; const memo = JM10.JobManager.prototype._hubTest.call({ _hubsOwn: (p) => { walks++; return Number(p) === 1; }, _hubAncestors: () => new Set() }, 0);
  const answers = [memo(5), memo(5), memo('5'), memo(1), memo(1)].join();
  ok(answers === 'false,false,false,true,true' && walks === 2 && (JSRC10.match(/this\._hubsOwn\(/g) || []).length === 1,
    'small 4: the engine\'s hub test walks each pid ONCE a pass (a memo, as the wrapper\'s keptTest) — and every pass asks it through that memo (no bare walk left)', { answers, walks });
  // (i) 主开发 01:57Z — THE ENGINE reads a scope's list by the same law: a list that no longer EXISTS is EMPTY (the reap of an end written
  // «not empty» reads the gone scope as empty and stops: nothing killed, nothing said); one that exists and cannot be read is null (unread:
  // retried, said) — every error read as «empty» before. Over a stand-in scope folder (no cgroup: cgroup.procs a plain file / a folder)
  const SP0 = "(e) => { if (e && GONE_LIST.has(e.code)) { if (this._listErr) this._listErr.delete(scope.dir); return []; } (this._listErr || (this._listErr = new Map())).set(scope.dir, (e && e.code) || ''); return null; });";
  ok(JSRC10.split(SP0).length === 2, 'control setup: the engine\'s list read\'s errno law is found once');
  const procsOf10 = async (Mod, dir, words = null) => { const self = Object.create(Mod.JobManager.prototype); self.d = { reapReadMs: 2000 }; const r = await self._scopeProcs({ dir, unit: 'x.scope' }); if (words) words.push(self._listWords({ dir }, '2 s')); return r; };
  const SD = path.join(D, 'scope10'), SDok = path.join(SD, 'ok'), SDdir = path.join(SD, 'unreadable');
  fs.mkdirSync(SDok, { recursive: true }); fs.writeFileSync(path.join(SDok, 'cgroup.procs'), '4242\n4243\n');
  fs.mkdirSync(path.join(SDdir, 'cgroup.procs'), { recursive: true });   // it EXISTS and cannot be read as a list (EISDIR) — no chmod, root-proof
  const SDfile = path.join(SD, 'not-a-folder'); fs.writeFileSync(SDfile, 'x');   // a component of the path no folder: ENOTDIR
  const said10 = [];
  const sp = { listed: await procsOf10(JM10, SDok), gone: await procsOf10(JM10, path.join(SD, 'gone')), notdir: await procsOf10(JM10, SDfile), unread: await procsOf10(JM10, SDdir, said10) };
  const W10 = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8'), setOf = (src) => { const m = /const GONE_LIST = new Set\((\[[^\]]*\])\);/.exec(src); return m ? JSON.stringify(JSON.parse(m[1].replace(/'/g, '"')).sort()) : null; };
  const JMsp = cut(SP0, '() => []);', 'engine-list-blanket');
  const spx = { unread: await procsOf10(JMsp, SDdir) };
  ok(JSON.stringify(sp.listed) === '[4242,4243]' && Array.isArray(sp.gone) && sp.gone.length === 0 && Array.isArray(sp.notdir) && sp.notdir.length === 0 && sp.unread === null && said10[0] === 'could not be read (EISDIR)'
    && setOf(JSRC10) === '["ENODEV","ENOENT","ENOTDIR"]' && setOf(W10) === setOf(JSRC10),
    'the engine\'s read of a scope\'s list: a list that no longer exists (ENOENT) is EMPTY — the reap of an end written «not empty» reads the gone scope as empty and stops (nothing killed, nothing said); one that exists and cannot be read is UNREAD (null: retried, said by its errno — «could not be read (EISDIR)»); the wrapper and the engine hold ONE set of «gone» errnos', { sp, said10 });
  ok(Array.isArray(spx.unread) && spx.unread.length === 0, 'CONTROL (every error as «empty», as before, in a copy): a list that exists and cannot be read reads as an empty scope — the reap stops while what the run left may still run — RED', spx);
  // (j) its readers' should: the hub's own ANCESTORS (a launcher — ./run.sh, npm start — and what started it) are the hub's: a reap after a
  // killed wrapper never kills them one by one. The REAL chain: this suite's parent stands for the launcher; a child of ours is not one
  const kid10 = spawn('sleep', ['30'], { stdio: 'ignore' }); if (!(await until(() => commOf(kid10.pid) === 'sleep', 20000))) expired.push('(j) the child never read as `sleep` (20 s)'); mine.push(PI10.identityOf(kid10.pid));   // r4294: on the fact
  const ancOf = (Mod) => Mod.JobManager.prototype._hubTest.call({ _hubsOwn: () => false, _hubAncestors: Mod.JobManager.prototype._hubAncestors }, 0);
  const an = ancOf(JM10), anc = { parent: an(process.ppid), child: an(kid10.pid), self: an(process.pid), init: an(1) };
  const anx = ancOf(cut(' || (anc || (anc = this._hubAncestors())).has(p)', '', 'hub-ancestor-cut'));   // stale-pins: kept — the control plants the older form in a copy
  const ancx = { parent: anx(process.ppid) };
  try { kid10.kill('SIGKILL'); } catch { }
  ok(anc.parent === true && anc.child === false && anc.self === false && anc.init === false,
    'the engine\'s hub test keeps the hub\'s own ANCESTORS (its launcher and what started it — the real parent chain), never a process of its own making, itself (its own test) or init', anc);
  ok(ancx.parent === false, 'CONTROL (the ancestor test cut, in a copy): the hub\'s launcher reads as the job\'s — a reap after a killed wrapper kills it one by one, the hub left with no supervisor — RED', ancx);
  // (k) its readers' should: the press's answer in the reader's language is bound to the ENGINE's code by a pin (a rename of the code
  // or the key fell back to the English error, silently): the code the refusal carries, the page's two readers of it, the zh / ja rows
  const PANEL = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8'), LIFE = fs.readFileSync(path.join(ROOT, 'src/lib/session-lifecycle.js'), 'utf8');
  const ZH10 = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), JA10 = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
  const KEY10 = 'This job is the running VibeSpace: it is not stopped here';
  const pinOf = (js) => { const m = /return \{ error: HUB_MAIN_WORDS, code: '([a-z-]+)' \};/.exec(js); const code = m && m[1];
    return !!code && PANEL.includes(`if (r?.code === '${code}') r.error = t('${KEY10}');`) && LIFE.includes(`bad[0].a.code === '${code}' ? t('${KEY10}')`)
      && ZH10.includes(JSON.stringify(KEY10) + ':') && JA10.includes(JSON.stringify(KEY10) + ':') && js.includes(`const HUB_MAIN_WORDS = '${KEY10.charAt(0).toLowerCase() + KEY10.slice(1)}';`); };
  const PINC = "return { error: HUB_MAIN_WORDS, code: 'hub-is-main' };";
  ok(JSRC10.split(PINC).length === 2 && pinOf(JSRC10), 'the page words the engine\'s refusal by ITS code (hub-is-main): the Background Work press and «Stop these too» read that code into the reader\'s words; the key has its zh and ja rows; the engine\'s words are the key\'s');
  ok(!pinOf(anchored(JSRC10, PINC, "return { error: HUB_MAIN_WORDS, code: 'hub-main' };", 'refusal-code-renamed')), 'CONTROL (the code renamed in a copy of the engine): the pin fails — the page would fall back to the English error — RED');
  // (l) 主开发 02:46Z — the follow-up. 1: THE FORCE'S RACE — the drain counts what is still there and hands the count to the force; the
  // last processes may end between that count and the force's own read: the force then acts on nothing and SAYS it (it answers false),
  // and the end never says «stopped by force». The REAL drainScope over a stub scope (a natural end: one process left, gone by the force)
  const FORCED = '...(still && forcedNow ? { force: true } : {})';
  ok(W.split(FORCED).length === 2, 'control setup: the end\'s «by force» asks the force\'s own answer — found once');
  const raceOf = async (src) => {
    const env = { fs: { readFileSync: () => '4200\n' }, path, keptTest: () => null, procsOf: () => ['4200'], rung: { policy: true }, keeperSaid: null, keeper: null, child: null, nap: async () => { }, isKeeper: () => false,
      stopping: null, keeps: false, statOf: () => null, bootId: () => 'b', scopeRows: () => [], termOnce: () => true, scopeTerm: async () => false, stopAt: 0, stopMs: 1, forceScope: async () => false, stopTree: [], same: () => false, scopeDir: '/fake/scope', mainWasHub: false };
    const gone = src.slice(src.indexOf('const GONE_LIST = new Set('), src.indexOf('\n', src.indexOf('const GONE_LIST = new Set(')));
    return new Function(...Object.keys(env), `let listUnread = ''; ${gone}\n${fnOf(src, 'function procsOrNull(dir) {')}\n${fnOf(src, 'async function drainScope() {')}\nreturn drainScope;`)(...Object.values(env))();   // eslint-disable-line no-new-func
  };
  const rc = await raceOf(W), rcx = await raceOf(anchored(W, FORCED, '...(still ? { force: true } : {})', 'force-race-cut'));
  ok(rc.left && rc.left.n === 1 && !rc.left.force, 'the force\'s race: the last process ended between the drain\'s count and the force\'s own read — the force acted on nothing (it answered so) and the end never says «by force»', rc);
  ok(rcx.left && rcx.left.force === true, 'CONTROL (the count alone decides, as before, in a copy): «they were stopped by force» for a kill that never happened — RED', rcx);
  // 2: the engine's errno of a list it could not read is CLEARED when the list later reads GONE, and a TIME-OUT says a time-out —
  // never an older read's errno. A stand-in scope folder (its list a folder: EISDIR), then gone; a read that never answers
  // r268 (主开发 16:07Z): the engine keeps ONE read in flight a list — a call while a read is pending JOINS it. The scene waits for each
  // read to SETTLE (its slot empties — what happened), bounded and red by name: the first reads of a LOCAL scratch folder answer at
  // once, so their bound is the scene's own 5 s (no loaded runner meets it: the hosted red of run 44755316257 met the old 20 ms and its
  // second ask joined the first read); the 20 ms (`reapReadMs`) only for the read that never answers
  const errOf = async (Mod) => {
    const self = Object.create(Mod.JobManager.prototype); self.d = { reapReadMs: 20 };
    const LONG = 5000, unsettled = [];
    const settle = async (sc, what) => { const t0 = Date.now(); while (self._procReads && self._procReads.has(sc.dir)) { if (Date.now() - t0 > LONG) { unsettled.push(what); return; } await sleep(5); } };
    const d = path.join(D, 'scope10-err-' + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(path.join(d, 'cgroup.procs'), { recursive: true });
    const sc = { dir: d, unit: 'x.scope' };
    const first = await self._scopeProcs(sc, LONG); await settle(sc, 'the first read (EISDIR)');
    const out = { first, words1: self._listWords(sc, '2 s') };
    fs.rmSync(d, { recursive: true, force: true });
    out.gone = await self._scopeProcs(sc, LONG); await settle(sc, 'the read of the gone list'); out.words2 = self._listWords(sc, '2 s');
    fs.mkdirSync(path.join(d, 'cgroup.procs'), { recursive: true }); await self._scopeProcs(sc, LONG); await settle(sc, 'the read unread again');   // unread again (EISDIR)…
    const real = fs.promises.readFile; fs.promises.readFile = (f, ...a) => (String(f).startsWith(d) ? new Promise(() => { }) : real.call(fs.promises, f, ...a));
    try { self._procReads = new Map(); out.hang = await self._scopeProcs(sc); out.words3 = self._listWords(sc, '0.02 s'); } finally { fs.promises.readFile = real; }
    if (unsettled.length) out.unsettled = unsettled;
    return out;
  };
  const GONE_CLEAR = '{ if (this._listErr) this._listErr.delete(scope.dir); return []; }';
  ok(JSRC10.split(GONE_CLEAR).length === 2, 'control setup: the gone branch\'s clear is found once');
  const er = await errOf(JM10), erx = await errOf(cut(GONE_CLEAR, 'return [];', 'list-err-gone-cut'));
  ok(!er.unsettled && er.first === null && er.words1 === 'could not be read (EISDIR)' && Array.isArray(er.gone) && er.words2 === 'did not answer a read in 2 s' && er.hang === null && er.words3 === 'did not answer a read in 0.02 s',
    'the engine\'s list words follow its LATEST read: unread — «could not be read (EISDIR)»; then GONE — no old errno left; a read that never answers — «did not answer a read», never the older errno', er);
  ok(erx.words2 === 'could not be read (EISDIR)', 'CONTROL (the clear on GONE cut, in a copy): a scope that has gone still «could not be read (EISDIR)» — RED', erx);
}

// §11 (B-7ca1's group rung, B-d8f4 (7)/(8)) MOVED to scripts/test-stop-rung.mjs — the split of 主开发 r1529 (3): this suite sat at the fast bound (10.3 s alone)

ok(!expired.length, 'r4294 HARNESS: every wait of the stop scenes met its fact inside its bound (the force scene: every forced-end sentence the journal holds is in the job\'s log); an expiry is NAMED here, never read silently', expired);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
