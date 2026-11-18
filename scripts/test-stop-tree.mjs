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
import { scratch } from './scratch.mjs';
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
  ok(r.ended.sort().join() === 'sleep,sleep,timeout' && !r.left.length && !r.stale && tree.every((m) => PI.aliveIdentity(m) === false), 'endTree: each member ended through its identity — nothing of it left', r);
  ok(/^ended 3 processes it started \((sleep ×2, timeout|timeout, sleep ×2)\)$/.test(PI.treeLine(r, { cut: tree.cut })), 'treeLine: ONE line — the count and the names', PI.treeLine(r, { cut: tree.cut }));
  await until(() => P.exitCode !== null || P.signalCode !== null, 3000);
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
const jobScene = async (wrapperText, tag, { force = false, argv = null, signalAlone = false, before = null, ready = null } = {}) => {
  const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), wrapperText);
  const marker = path.join(dd, 'queue.lock'), heard = path.join(dd, 'heard');
  const { JobManager } = require(path.join(ROOT, 'src/jobs.js'));
  const logs = [];
  const jm = new JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: (...a) => logs.push(a.join(' ')), apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
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
  t = t.slice(0, a) + 'let stopTree = [];\n' + t.slice(b + "let stopTree = [];\n".length);
  const TREE = '  const ko = keptOutHere(), tree = childTreeOf(process.pid, { since: Number(stamp.starttime) || 0, exclude: ko });';
  anchorOr(t, TREE, 'the release reads no tree'); t = t.replace(TREE, '  const ko = [], tree = { rows: [], cut: false };   // MUTANT: the release — no tree');
  return t.replace(/  const fromIntent = [^\n]*\n/, '  const fromIntent = { rows: [], cut: false };   // MUTANT: the release reads no tree from the intent\n');
})();
ok(!/childTreeOf\(process\.pid/.test(relWrap) && /MUTANT: the release reads no tree from the intent/.test(relWrap), 'control setup: the release\'s stop table (no tree, none read from the intent) in a copy');
const ctl = await jobScene(relWrap, 'job-mut');
ok(ctl.held && ctl.left.some((m) => m.comm === 'flock' || m.comm === 'sh') && !ctl.free, 'CONTROL (the release\'s wrapper): the setsid env -i waiter is LEFT RUNNING with the queue\'s lock held', { left: names(ctl.left), free: ctl.free });
// THE FORCE STOP: the wrapper is SIGKILLed — its stop step never runs; the ENGINE ends the tree (read first) — nothing left
const fz = await jobScene(WRAP, 'job-force', { force: true });
ok(fz.held && !fz.left.length && fz.free && /its forced end killed \d+ process(es)? it started outside its group/.test(fz.said), 'B-c134: a FORCE stop (the wrapper SIGKILLed) — the engine reads the tree first and kills it, said in the log; nothing left', { left: names(fz.left), said: fz.said });
ok(/\[jobs\] stop: its forced end killed \d+ process(es)? it started outside its group \([^)]*\)/.test(fz.log), 'B-c134 cure (MUST B): the FORCE stop\'s line is in the job\'s OWN log — where the person reads it (the wrapper is dead; the engine writes it)', fz.log.split('\n').filter((l) => /\[jobs\]/.test(l)));
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
// wrapper's own walk can reach it)
const hubArgv = (dd) => ['sh', '-c', `setsid sh -c 'sleep 313 & wait' & echo $! > ${JSON.stringify(path.join(dd, 'server.pid'))}; timeout 314 sleep 314 & wait`];
const hubReady = (tree) => tree.some((m) => m.comm === 'timeout') && tree.filter((m) => m.comm === 'sleep').length >= 2;
const hubBefore = (expectEnded) => ({ dd }) => {
  let hubPid = 0; try { hubPid = Number(fs.readFileSync(path.join(dd, 'server.pid'), 'utf8').trim()); } catch { }
  const hub = hubPid > 1 ? [{ ...PI.identityOf(hubPid), comm: 'sh' }, ...PI.treeOf([hubPid])] : [];
  mine.push(...hub);
  const alive = () => hub.filter((m) => PI.aliveIdentity(m) === true).length;
  return { keep: expectEnded ? new Set() : new Set(hub.map((m) => m.pid)), after: async () => { if (expectEnded) await until(() => alive() === 0, 3000); return { hub: hub.length, alive: alive() }; } };
};
{
  const ddOf = (tag) => path.join(D, tag);
  const hs = await jobScene(WRAP, 'job-hub', { argv: hubArgv(ddOf('job-hub')), signalAlone: true, before: hubBefore(false), ready: hubReady });
  ok(/\[job-wrapper\] stop: its tree walk left alone 1 process it does not own/.test(hs.log), 'cure 2 (its reading): the wrapper\'s own line SAYS what its walk left alone (a stop it heard alone, no engine intent)', hs.log.split('\n').filter((l) => /job-wrapper\] stop/.test(l)));
  ok(hs.after && hs.after.hub === 2 && hs.after.alive === 2 && hs.tree.some((m) => m.comm === 'timeout') && !hs.left.some((m) => m.comm === 'timeout'), 'the wrapper\'s own walk keeps out the HUB of data/server.pid — the stand-in hub and its child live on; the job\'s own timeout ended', { after: hs.after, left: names(hs.left) });
  const KO = 'exclude: ko });';
  if (!WRAP.includes(KO)) ok(false, 'the anchor of the control «the wrapper keeps nothing out» is not in the source');
  else {
    const hc = await jobScene(WRAP.replace(KO, 'exclude: [] });   // MUTANT: keeps nothing out'), 'job-hub-mut', { argv: hubArgv(ddOf('job-hub-mut')), signalAlone: true, before: hubBefore(true), ready: hubReady });
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
  ok(/const treeCut = tree\.cut \|\| all\.length > rows\.length;/.test(js) && /\.\.\.\(treeCut \? \{ treeCut: true \} : \{\}\)/.test(js) && /_runLogFile\(job\) \{[\s\S]{0,200}?run\.log \|\| path\.join\(this\._ctlDir\(job, run\.startedAt\), 'current\.log'\)/.test(js) && /fs\.promises\.appendFile\(file, `\\n\$\{text\}\\n`\)\.catch\(\(\) => \{ \}\);/.test(js), 'the intent\'s row cap (256) is a CUT the wrapper says; the engine\'s line is appended to the run\'s log off the loop');
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
  ok(/await D\(\)\.endSession\(\{ sessionId: hit\.id \}, \{ reply: \(m\) => answers\.push\(m\), actBy: SPEC\.actByOf\(by\), endTree: endTree === true \}\);/.test(ops) && /const r = await O\(\)\.endConversation\(\{ webuiId: f\.id \}, byOf\(caller, keyId\), \{ endTree: true \}\);/.test(ops) && /const r = await O\(\)\.endConversation\(\{ webuiId: t\.id \}, byOf\(ctx\.caller, ctx\.keyId\)\);/.test(ops), 'the automation verbs: ARCHIVE ends the background tree; END does not; an automation key\'s own kill frame never asks it (the target is rebuilt)');
}

console.log('§5 THE CONVERSATION DOOR — wiring (read before the first signal; survivors only, after the teardown)');
{
  const ws = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8');
  const iRead = ws.indexOf('if (ownTree) readTree(dpid);'), iKill = ws.indexOf("try { process.kill(dpid, 'SIGTERM'); } catch {}"), iLocal = ws.indexOf('if (localPty) readTree(localPty);'), iPty = ws.indexOf('      if (session.pty) session.pty.kill();'), iEnd = ws.indexOf('PI.endTree(left, { graceMs: 5000 })');
  ok(iRead > 0 && iKill > iRead && iLocal > iKill && iPty > iLocal && iEnd > iLocal && iEnd < iPty, 'ws-handler kill: each dtach master\'s tree is read BEFORE its SIGTERM, a chat conversation\'s BEFORE the pty\'s kill; ended through PI.endTree', { iRead, iKill, iLocal, iPty, iEnd });
  ok(/const ownTree = \(endTree === true \|\| data\.endTree === true\) && !capsOf\(session\.backend\)\.terminalOnly;/.test(ws) && /session\.pty\.constructor\.name !== 'Object'/.test(ws) && /treeRoots\.filter\(\(m\) => PI\.aliveIdentity\(m\) === true\)/.test(ws) && /\}, 3000\);/.test(ws), 'ws-handler kill: never a plain shell\'s (the declared row terminalOnly — never an id), an OpenCode serve\'s or a pipe conversation\'s (a shim pty: the remainder); only what SURVIVED the teardown hears the stop, 3 s on (never a second signal)');
  const js = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(/live = !!\(st && this\._verifyAlive\(st\)\), tree = live \? PI\.treeOf\(\[Number\(st\.pid\)\]/.test(js) && /\.\.\.\(rows\.length \? \{ tree: rows \} : \{\}\)/.test(js) && /if \(sig === 'SIGKILL'\) this\._killTree\(job, stamp\);/.test(js) && !/treeOfAsync|_termRunTree/.test(js) && /if \(!k\) \{ const st = this\._readStamp\(job\); if \(this\._verifyAlive\(st\)\) this\._killTree\(job, st\); \}/.test(js) && !/_stopTree|PI\.endTree/.test(js), 'jobs: the engine sends NO stop SIGTERM of its own to the tree (the wrapper\'s one table does); its SIGKILLs (a force stop, the kill step) end the tree first');
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
      job.zzProbe = 1; J._save();
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
  const R = await svcScene(MJ9.load('src/jobs.js', JSRC.replace(PEND, '    if (false /* MUTANT: the release — a start during a stop is «already running» */) {'), 'release'), 'job-start-during-stop-mut');
  const rx = await R.press('start', { settle: true });
  await R.end();
  // the release (measured on the test machine, 2.369.411 base): its start sets desiredUp BEFORE the «already running» refusal, so at
  // the stop's end the service is DOWN with no new run and the crash policy's timer brings it back 5 s on, COUNTED as a crash
  // (six such presses park it); with `restart: 'never'` nothing brings it back — by reading src/job-model.js onServiceExit (the row's
  // «a second start was needed»)
  ok(R.up && rx.answer && /is already running/.test(rx.answer.error || '') && rx.ended && rx.state === 'down' && rx.newRuns === 0 && rx.fails === 1, 'B-cac2 CONTROL (the release, in a copy): the start answers «already running»; at the stop\'s end the service is DOWN with no new run, and what brings it back is the crash policy (counted: 1 toward the park) — never the start', rx);
  // its control: the line that clears it cut (a copy) — the remembered start survives the second stop (read off the record, no wait)
  const CLR = '    delete job._startAfterStop;   // B-cac2: a stop pressed after a remembered start (or a restart) means stopped — it starts no more\n';
  ok(JSRC.split(CLR).length === 2, 'B-cac2 control setup: the anchor of the control «a later stop clears the remembered start» is in the source');
  const C = await svcScene(MJ9.load('src/jobs.js', JSRC.replace(CLR, '    /* MUTANT: a later stop leaves the remembered start */\n'), 'no-clear'), 'job-start-stop-mut');
  const cx = await C.press('start-stop');
  await C.end();
  ok(C.up && cx.answer && cx.answer.pending === true && cx.flagAfter === true, 'B-cac2 CONTROL (the clear cut, in a copy): the remembered start SURVIVES the second stop — it would start when the run ends', cx);
  // 主开发 21:46Z (a): the asked start's MEMORY-PARK road and its two GUARDS (a job removed meanwhile, the engine's end) —
  // in-process, nothing spawned: the engine's own start / touch / owner message recorded on the instance
  const guardScene = (Mod, tag) => {
    const dd = path.join(D, tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dd, 'bin', 'job-wrapper.js'), WRAP);
    const J = new Mod.JobManager({ dataDir: dd, broadcast() { }, notifyUser() { return { ok: true }; }, log: () => { }, apiBase: 'http://127.0.0.1:9', memoryRungs: [] });
    J.init();
    const job = { id: 'jb-c4c20001', kind: 'task', name: 'asked start', state: 'up', owner: {}, access: { view: 'session', control: 'session' }, runs: [{ startedAt: Date.now() - 1000 }], createdAt: 1, cmd: { argv: ['true'] } };
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
    const Px = guardScene(MJ9.load('src/jobs.js', JSRC.replace(PARKA, '      if (memPark && memPark.park) { this._parkForMemory(job, run); this._startAskedAtStop(job, startAsked); return; }   /* MUTANT: the park undone */'), 'park-undone'), 'cac2-park-mut');
    Px.job._startAfterStop = true;
    try { Px.J._finalizeRun(Px.job, Px.job.runs[0], { code: 137, endedAt: Date.now() }, 'sweep'); } catch { }
    await flush();
    ok(Px.out.starts === 1, 'B-cac2 CONTROL (the park road without its refusal, in a copy): the asked start UNDOES the park', Px.out);
    Px.J.shutdown();
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
    const Gx = guardScene(MJ9.load('src/jobs.js', JSRC.replace(GUARD, '      /* MUTANT: no guard */\n'), 'no-guard'), 'cac2-guards-mut');
    Gx.J._startAskedAtStop(Gx.job, true); Gx.J.jobs.delete(Gx.job.id); await flush();
    const xRemoved = Gx.out.starts;
    Gx.J.jobs.set(Gx.job.id, Gx.job); Gx.J._startAskedAtStop(Gx.job, true); Gx.J._unreadStopped = true; await flush();
    ok(xRemoved === 1 && Gx.out.starts === 2, 'B-cac2 CONTROL (no guard, in a copy): the asked start STARTS a removed job, and starts after the engine\'s end', { xRemoved, all: Gx.out.starts });
    Gx.J._unreadStopped = false; Gx.J.shutdown();
  }
  for (const r of copiesCensus(MJ9.files, MJ9.dir, ROOT, { minCopies: 4, label: 'B-cac2 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  const ar = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), cli = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf8');
  ok(/const needsControl = \[[^\]]*'restart'[^\]]*\];/.test(ar) && /else if \(act === 'restart'\) r = a\.jm\.restart\(job\);/.test(ar) && /case 'restart': \{/.test(cli) && /vibespace-job restart <id>/.test(cli) && /else if \(r\.pending\) console\.log\(`not started yet: /.test(cli), 'WIRING: the agent route\'s restart needs control; the CLI has `restart <id>` (in its usage) and says a pending start as one');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
