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
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
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
const jobScene = async (wrapperText, tag, { force = false, argv = null } = {}) => {
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
  await until(async () => { const st = jm._readStamp(job); if (!st || !jm._verifyAlive(st)) return false; tree = PI.treeOf([Number(st.pid)], { since: Number(st.starttime) || 0 }); return tree.some((m) => m.comm === 'flock') && tree.filter((m) => m.comm === 'sleep').length >= 2; }, 8000);
  mine.push(...tree);
  const held = spawnSync('flock', ['-n', marker, 'true']).status !== 0;
  jm.stop(job, { force });
  await until(async () => { await jm._sweep(); return ['interrupted', 'failed', 'done'].includes(job.state); }, 8000);
  await until(() => tree.every((m) => PI.aliveIdentity(m) === false), 4000);
  const left = tree.filter((m) => PI.aliveIdentity(m) === true);
  const free = spawnSync('flock', ['-n', marker, 'true']).status === 0;
  const terms = (() => { try { return fs.readFileSync(heard, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } })();
  let log = ''; try { const run = job.runs[job.runs.length - 1]; log = fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'current.log'), 'utf8'); } catch { }
  const said = logs.filter((l) => l.includes(job.id)).join(' | ');
  let intent = null; try { const run = job.runs[job.runs.length - 1]; intent = JSON.parse(fs.readFileSync(path.join(dd, 'job-logs', job.id, String(run.startedAt), 'stop.json'), 'utf8')); } catch { }
  for (const m of left) PI.signalIdentity(m, 'SIGKILL');
  try { jm.shutdown(); } catch { }
  return { tree, left, held, free, terms, state: job.state, log, said, intent };
};
const real = await jobScene(WRAP, 'job');
ok(real.tree.length >= 4 && real.held && real.state === 'interrupted', 'the scene: the job\'s tree holds the setsid env -i flock + its waiter and the timeout + its sleep, the queue\'s lock HELD', { tree: names(real.tree), held: real.held, state: real.state });
ok(!real.left.length && real.free, 'B-c134: the job\'s STOP leaves NOTHING of its tree running — and its queue marker is free', { left: names(real.left), free: real.free });
ok(real.intent && Array.isArray(real.intent.tree) && real.intent.tree.some((r) => r[3] === 'flock'), 'B-c134: the ENGINE read the tree before its signal and handed it to the wrapper in its intent (stop.json) — the group\'s signal reaches the main and the wrapper at once, so a tree read in the wrapper may already have lost the main\'s children', real.intent && real.intent.tree);
ok(real.terms === 1, 'B-c134: ONE signal a process — the setsid waiter heard SIGTERM exactly once (it cleans up on the first; a second would cut its cleanup)', real.terms);
ok(/\[job-wrapper\] stop: \d+ process(es)? it started outside its group \([^)]*flock[^)]*\) hears? it from the wrapper/.test(real.log), 'B-c134: the job\'s log SAYS what it started outside its group and that the wrapper ended it', real.log.split('\n').filter((l) => /job-wrapper\] stop/.test(l)));
// CONTROL (a patched copy of the release's wrapper, in the control's own data folder): its stop table without the tree
const MJ = mutantCopies('stop-tree-c134', ROOT);
const relWrap = (() => { let t = WRAP; const a = t.indexOf('// ── SHIPPED TWIN (B-c134) BEGIN'), b = t.indexOf("let stopTree = [];\n"); t = t.slice(0, a) + 'let stopTree = [];\n' + t.slice(b + "let stopTree = [];\n".length); return t.replace(/  const tree = childTreeOf\(process\.pid, \{ since: Number\(stamp\.starttime\) \|\| 0 \}\);[^\n]*\n/, '  const tree = { rows: [], cut: false };   // MUTANT: the release — no tree\n').replace(/  const fromIntent = [^\n]*\n/, '  const fromIntent = { rows: [], cut: false };   // MUTANT: the release reads no tree from the intent\n'); })();
ok(!/childTreeOf\(process\.pid/.test(relWrap) && /MUTANT: the release reads no tree from the intent/.test(relWrap), 'control setup: the release\'s stop table (no tree, none read from the intent) in a copy');
const ctl = await jobScene(relWrap, 'job-mut');
ok(ctl.held && ctl.left.some((m) => m.comm === 'flock' || m.comm === 'sh') && !ctl.free, 'CONTROL (the release\'s wrapper): the setsid env -i waiter is LEFT RUNNING with the queue\'s lock held', { left: names(ctl.left), free: ctl.free });
// THE FORCE STOP: the wrapper is SIGKILLed — its stop step never runs; the ENGINE ends the tree (read first) — nothing left
const fz = await jobScene(WRAP, 'job-force', { force: true });
ok(fz.held && !fz.left.length && fz.free && /its forced end killed \d+ process(es)? it started outside its group/.test(fz.said), 'B-c134: a FORCE stop (the wrapper SIGKILLed) — the engine reads the tree first and kills it, said in the log; nothing left', { left: names(fz.left), said: fz.said });
for (const r of copiesCensus(MJ.files, MJ.dir, ROOT, { minCopies: 0, label: 'B-c134 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

console.log('§5 THE CONVERSATION DOOR — wiring (read before the first signal; survivors only, after the teardown)');
{
  const ws = fs.readFileSync(path.join(ROOT, 'src/ws-handler.js'), 'utf8');
  const iRead = ws.indexOf('if (ownTree) readTree(dpid);'), iKill = ws.indexOf("try { process.kill(dpid, 'SIGTERM'); } catch {}"), iLocal = ws.indexOf('if (localPty) readTree(localPty);'), iPty = ws.indexOf('      if (session.pty) session.pty.kill();'), iEnd = ws.indexOf('PI.endTree(left, { graceMs: 5000 })');
  ok(iRead > 0 && iKill > iRead && iLocal > iKill && iPty > iLocal && iEnd > iLocal && iEnd < iPty, 'ws-handler kill: each dtach master\'s tree is read BEFORE its SIGTERM, a chat conversation\'s BEFORE the pty\'s kill; ended through PI.endTree', { iRead, iKill, iLocal, iPty, iEnd });
  ok(/const ownTree = !capsOf\(session\.backend\)\.terminalOnly;/.test(ws) && /session\.pty\.constructor\.name !== 'Object'/.test(ws) && /treeRoots\.filter\(\(m\) => PI\.aliveIdentity\(m\) === true\)/.test(ws) && /\}, 3000\);/.test(ws), 'ws-handler kill: never a plain shell\'s (the declared row terminalOnly — never an id), an OpenCode serve\'s or a pipe conversation\'s (a shim pty: the remainder); only what SURVIVED the teardown hears the stop, 3 s on (never a second signal)');
  const js = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(/tree = st && this\._verifyAlive\(st\) \? PI\.treeOf\(\[Number\(st\.pid\)\]/.test(js) && /\.\.\.\(rows\.length \? \{ tree: rows \} : \{\}\)/.test(js) && /if \(sig === 'SIGKILL'\) this\._killTree\(job, stamp\);/.test(js) && !/treeOfAsync|_termRunTree/.test(js) && /if \(!k\) \{ const st = this\._readStamp\(job\); if \(this\._verifyAlive\(st\)\) this\._killTree\(job, st\); \}/.test(js) && !/_stopTree|PI\.endTree/.test(js), 'jobs: the engine sends NO stop SIGTERM of its own to the tree (the wrapper\'s one table does); its SIGKILLs (a force stop, the kill step) end the tree first');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
