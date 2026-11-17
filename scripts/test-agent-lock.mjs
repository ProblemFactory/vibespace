#!/usr/bin/env node
// THE AGENT'S ONE-INSTANCE LOCK (主开发 2026-11-17, found by the pod design's skeptic): the lock file lives in the agent's
// state folder — in a fleet pod the home volume, which outlives the container. A killed container's agent dies without
// its exit handler and the lock keeps its pid; the next container's FRESH process table can hand the new agent THE SAME
// pid, and the agent read its own lock as «a genuine second instance» and refused to start, for good. A lock that names
// THIS process is stale by definition. Each leg starts the REAL agent (src/agentd/agentd.js) in its own scratch root.
// RED control: the release's agent (a mutant without the own-pid test) refuses its own pid.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AGENT = 'src/agentd/agentd.js';
const MUT = mutantCopies('agent-lock', REPO);
const releaseAgent = (() => {
  const src = fs.readFileSync(path.join(REPO, AGENT), 'utf8');
  const A = "        if (pid === process.pid) { fs.unlinkSync(LOCK); continue; }\n";
  return src.includes(A) ? MUT.write(AGENT, src.split(A).join(''), 'release') : null;
})();
const roots = [];
const mkRoot = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentlock-')); roots.push(r); fs.mkdirSync(path.join(r, 'agentd', 'state'), { recursive: true }); return r; };
const envOf = (root) => ({ PATH: process.env.PATH, HOME: root, VIBESPACE_AGENTD_ROOT: path.join(root, 'agentd'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1' });
const lockOf = (root) => path.join(root, 'agentd', 'state', 'agentd.lock');
// start the agent; «started» = it holds the lock under its own pid and still runs; «refused» = it exited (code 3)
const run = async (root, child) => {
  let exit = null, err = ''; child.stderr.on('data', (d) => { err += d; }); child.on('exit', (c) => { exit = c; });
  for (let t = 0; t < 100 && exit === null; t++) {
    let held = ''; try { held = fs.readFileSync(lockOf(root), 'utf8').trim(); } catch { }
    if (held === String(child.pid) && t >= 4) break;
    await sleep(50);
  }
  const started = exit === null;
  if (started) { try { process.kill(child.pid, 'SIGTERM'); } catch { } for (let t = 0; t < 60 && exit === null; t++) await sleep(50); }   // ours: we started it and hold its pid
  return { started, exit, refusedSaid: /already running/.test(err) };
};
// THE AGENT'S OWN PID IN THE LOCK: a shell writes its pid into the lock and EXECS the agent, which keeps that pid
const ownPid = (agentFile) => { const root = mkRoot(); return run(root, spawn('/bin/sh', ['-c', 'echo $$ > "$1"; exec "$2" "$3"', 'sh', lockOf(root), process.execPath, agentFile], { env: envOf(root), stdio: ['ignore', 'ignore', 'pipe'] })); };
const agentIn = (root, agentFile) => spawn(process.execPath, [agentFile], { env: envOf(root), stdio: ['ignore', 'ignore', 'pipe'] });

console.log('§1 a lock that names THIS process is stale — the agent takes it and starts');
const own = await ownPid(path.join(REPO, AGENT));
ok(`the agent handed the pid its lock already names STARTS (it removes the lock and takes it) — ${JSON.stringify(own)}`, own.started && !own.refusedSaid, own);
const red = releaseAgent ? await ownPid(releaseAgent) : null;
ok(`RED CONTROL (the release's agent, without the own-pid test): the same start REFUSES — «already running», exit 3 — ${JSON.stringify(red)}`, !!red && !red.started && red.exit === 3 && red.refusedSaid, red);

console.log('§2 the other two answers stand');
{
  const root = mkRoot();
  const gone = spawn('/bin/true'); const deadPid = gone.pid; await new Promise((r) => gone.on('exit', r));
  fs.writeFileSync(lockOf(root), String(deadPid));
  const r = await run(root, agentIn(root, path.join(REPO, AGENT)));
  ok(`a lock holding a DEAD pid (${deadPid}) — the agent takes it and starts`, r.started && !r.refusedSaid, r);
}
{
  const root = mkRoot();
  // a live sibling agent: a process whose command line names an agent (as the lock check reads it)
  const sib = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'vibespace-agentd-sibling'], { stdio: 'ignore' });
  await sleep(100);
  fs.writeFileSync(lockOf(root), String(sib.pid));
  const r = await run(root, agentIn(root, path.join(REPO, AGENT)));
  try { process.kill(sib.pid, 'SIGTERM'); } catch { }   // ours: we started it and hold its pid
  ok(`a lock holding a LIVE sibling agent (pid ${sib.pid}) — the agent still refuses, «already running», exit 3`, !r.started && r.exit === 3 && r.refusedSaid, r);
}
for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { } }
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
