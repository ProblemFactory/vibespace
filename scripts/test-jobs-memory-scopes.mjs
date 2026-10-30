#!/usr/bin/env node
// THE MEMORY BOUND OF A BACKGROUND JOB (lane jobs-memory-bound, F6 of B-7f9e) — the HEAVY half: every leg here spawns REAL
// processes (the real engine + the real data/bin wrapper, a scratch dataDir per leg) and most of them REAL user-systemd scopes,
// so by the tier rule (B-f4cb) it is a heavy suite (acceptance round 6 split it from scripts/test-jobs-memory.mjs, which keeps
// the PURE and in-process rows). EVERY NAME IT CLAIMS IS ITS OWN RUN'S: a scope is `jobs-memory-bound-test-<pid>-…`, and the
// leak row and the cleanup touch that prefix alone (round 5's machine-wide prefix let two copies at once kill each other's live
// scopes and count them as leaks — 5 of 10 runs red under overlap).
//   §3 REAL  the wrapper PROVES the rung before the job runs and ENFORCES it: ① the cgroup rung (a scope of the user systemd,
//            where one answers — SKIP said elsewhere); ② the rlimit rung (forced) under THIS node; ③ a systemd-run that refuses
//            OOMPolicy (< 253) and ④ one that never answers ⇒ the job runs ONCE on the next rung; ⑤ a manager < 253; ⑥ the
//            instance's cap; ⑦ a stop ENDS THE JOB (a job deaf to SIGTERM, a wrapper killed alone); ⑧ a refused rung's timer;
//            ⑨ the cap is what CONTAINS the scope; ⑪ a stop's grace is its own; ⑫ what a job leaves running (the ruling);
//            ⑬ a replay awaits its predecessor's reap; ⑭ one flag, one meaning; ROUND 6: ㉑ a kill timer belongs to its run;
//            ㉒ a stop drains the group the way an end does (a pod's rung); ㉓ the record says what it could not see (setsid);
//            ㉔ the clear scans the group at clear time; ㉕ the keeper is known by its PID; ㉖ a record past its bound says so;
//            ㉗ a boot's reap past its bound is retried (a real scope); ㉘ a kept scope's stop under a held read SIGTERMs blind;
//            ㉙ every start of a service waits for what is pending; ROUND 7: ⑭ driven by STATE (the wrapper's own «stop:» line,
//            a 1 s grace — never a sleep); ㉟ a stop's intent written before its signal; ROUND 8: ㊱ A STOP HAS ONE CLOCK (at
//            the production ratio — the wrapper's grace = the engine's, 0.4 s, 2 s and 10 s at once: the wrapper's end comes
//            before the engine's kill step); ㊶ who signalled whom (a wrapper signalled alone, an intent nobody delivered);
//            ㊷ UNKNOWN blocks a spawn (a live service whose pid.json the next boot can never read); ROUND 9: ㊸ a main that
//            LEFT the wrapper's group (setsid) hears the engine's stop from the wrapper; ㊹ ONE SIGNAL PER PID PER STOP STEP (a
//            main whose cleanup a second signal cuts: the wrapper signalled alone, the engine's stop — the pod's rung and the
//            cgroup rung); ROUND 10: ㊺ A STOP GOES ONCE (Stop pressed twice; an agent's SIGINT, then the person's Stop; a Stop
//            while the wrapper drains what an ended task left; a SIGTERM to the wrapper then — both rungs); ㊻ THE MAIN IS THE
//            HANDLE the wrapper spawned (a reaped main's pid, held by another process since, is never signalled); ROUND 10c:
//            ㊱ at 0.1 s too — what got less than the full grace is counted OF WHAT IT LEFT, never more than it left
//   §4 REAL  the park law through the engine's own doors (a boot replay counts like a run; a restart resets it — a service, a cron)
//   §5 REAL  the boot's judge over a fake cgroup (the instance's OOM count rose; a rolling update; a SIGKILL from outside)
// RED on ef0012b5 (round 5): ㉑ the new run killed at the first stop's grace, labelled; ㉒ the deaf member survived the stop,
// unsaid; ㉓ nothing said, nothing kept; ㉔ the late child ran on; ㉕ the impostor taken for the keeper; ㉖ 6 of 70 survived; ㉗ the
// boot's reap dropped; ㉘ no SIGTERM, «10 s after its SIGTERM» said; ㉙ started beside the old scope. RED on 336761e5 (round 6):
// ⑭ waits for a «stop:» line no wrapper writes; ㉟ kept, no `cleared`; ㊱ the escapee's SIGTERM and SIGKILL 17 ms apart; its own
// copy of ⑭ (a 50 ms sleep into a 0.15 s window) red in 4 of 5 pairs started 0.25 s apart. RED on e7147b71 (round 7): ㊱ at 2 s
// and 10 s the engine killed the wrapper mid-drain (no exit.json, the escapee alive); ㊶ the helper never heard a SIGTERM (killed
// at the grace under words claiming one); ㊷ a second run beside the live one. RED on 887e8d66 = 4ef7e9494 (round 8, shipped in
// 2.369.363): ㊸ the setsid main never heard a SIGTERM — SIGKILLed at the grace under «did not end on SIGTERM»; ㊹ the main
// signalled twice — the pod's rung, a wrapper signalled alone (its forward, then its group loop 13 ms later); the cgroup rung,
// the engine's own stop and a SIGINT to the wrapper (the group's signal, then the scope's) — code 143 mid-cleanup. RED on
// 8ad58d8b (round 9, the hotfix's first cut): ㊺ a second signal on both rungs — the second press, the person's Stop after an
// agent's SIGINT, a Stop while a task's leftover drained (the engine's group signal again); a SIGTERM to the wrapper then, on
// the cgroup rung (the drain's `systemctl kill` unrecorded) — code 143 mid-cleanup; ㊻ the holder of the reaped main's pid
// SIGTERMed (+0.5 s), recorded «mainBy wrapper». RED on 63a311ad0 (round 10, the hotfix's second cut): ㊱ «short 4» of n 3 —
// `short` judged by 10 % of the grace over every SIGTERM of the run: the escapee the stop step reached 30–60 ms in and its
// first child (ended before the drain) counted; at 0.1 s always (10 ms), at 0.4 s once the scan passes 40 ms (115/2 here, 56
// ms). Earlier rounds: the report.
// Load: each job allocates ≤ 512 MB once (most far less, the cgroup legs stop at 256 MB), no busy loop; the legs run at once
// (the longest: ㊱'s 10 s grace — the production one — about 11 s); scratch dataDirs under os.tmpdir(), one per leg.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require('../src/job-model.js');
const { JobManager, WRAPPER_PROTO } = require('../src/jobs.js');   // lane vault-job-road: the wrapper is called with the server's own protocol
const L = await import(new URL('../src/lib/jobs-layout.js', import.meta.url));
// the wrapper's PURE judges: a require() with no ctl dir on argv (an older wrapper has none — and would exit: not required)
const WRAPPER_SRC = fs.readFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), 'utf8');
const JW = (() => { if (!/module\.exports = \{ allocationRefused/.test(WRAPPER_SRC)) return {}; const argv = process.argv.splice(2); try { return require('../data/bin/job-wrapper.js'); } finally { process.argv.push(...argv); } })();
let pass = 0, fail = 0, skip = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(step); } return false; };
const read = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const fn = (name) => (typeof M[name] === 'function' ? M[name] : () => ({})); // the base has none of these: its rows go RED, never a throw
const LF = (name) => (typeof L[name] === 'function' ? L[name] : () => '');
const WF = (name) => (typeof JW[name] === 'function' ? JW[name] : () => ({}));
const act = (E, m, ...a) => (typeof E[m] === 'function' ? E[m](...a) : {}); // an engine door the base lacks answers nothing
const MiB = 1024 * 1024;


// ── the real engine over scratch dataDirs (one per leg), the worktree's REAL wrapper copied in (as test-jobs-engine does).
// The REAL legs are independent (a dataDir, a lock and engines of their own) and run AT ONCE; their rows print in order.
const PREFIX = `jobs-memory-bound-test-${process.pid}`; // THIS run's scopes are named so — and none outlives it (asserted at the end); never another run's
const said = [], logs = [], engines = [], dirs = [];
const owner = { conversation: { backend: 'claude', id: 'conv-M' }, sessionId: 'sess-M', sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [] };
const caller = { conversationId: 'conv-M', sessionId: 'sess-M', sessionCreatedAt: 1, groups: new Set() };
const scratch = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jobs-mem-'));
  fs.mkdirSync(path.join(d, 'bin'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'data/bin/job-wrapper.js'), path.join(d, 'bin', 'job-wrapper.js'));
  dirs.push(d);
  return d;
};
// a FAKE tool in a leg's <dataDir>/bin — first on the job's PATH (the engine puts it there), so the wrapper meets it
const fake = (dir, name, body) => fs.writeFileSync(path.join(dir, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
const realOf = (cmd) => String(spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).stdout || '').trim();
// THE INSTANCE every leg runs on unless it names its own: no memory.max (a host that caps nothing) — the suite's own cgroup
// may carry one (env.sh's scope: 24 GiB), and the cap would then lower an owner's 0; leg ⑥ names an 8 GiB instance
const NO_LIMIT = (() => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jobs-mem-nolimit-')); fs.writeFileSync(path.join(d, 'memory.max'), 'max\n'); dirs.push(d); return d; })();
const engineIn = (dir) => (extra = {}) => {
  const E = new JobManager({ dataDir: dir, broadcast: () => { }, notifyUser: (n) => said.push({ ...n, text: String(n.words.key).replace(/\{(\w+)\}/g, (m, k) => (n.words.params && n.words.params[k] !== undefined ? String(n.words.params[k]) : m)), i18n: { text: n.words } }), log: (...a) => logs.push(a.join(' ')), memoryUnitPrefix: PREFIX, memoryLimitDir: NO_LIMIT, ...extra });
  E.init();
  for (const t of E._timers) clearInterval(t); // the suite drives the sweep itself (no 5 s tick)
  E._timers = [];
  engines.push(E);
  return E;
};
const stopEngine = (E) => { for (const j of E.jobs.values()) j.desiredUp = false; E.shutdown(); }; // its backoff timers find nothing to restart
const ctlOf = (j) => path.dirname(j.runs[j.runs.length - 1].log);
// the run is over when its exit record exists AND its wrapper is gone (it writes exit.json, then exits — a sweep between the
// two sees it alive and judges nothing; the engine's own 5 s tick would judge it next)
const settle = async (E, j, ms = 8000) => { const done = await until(() => fs.existsSync(path.join(ctlOf(j), 'exit.json')) && !E._verifyAlive(E._readStamp(j)), ms, 10); await E._sweep(); return done; };
// a run is RUNNING its job once the wrapper proved the bound (bound.json confirmed — the go was said) and is alive
const running = (E, j, ms = 4000) => until(() => { const b = readJson(path.join(ctlOf(j), 'bound.json')); return b && b.confirmed && E._verifyAlive(E._readStamp(j)); }, ms, 10);
// the instance restarts under a run: its whole group SIGKILLed at once — no exit record (as under memory.oom.group)
const killGroup = async (E, j) => { const st = E._readStamp(j); try { process.kill(-st.pid, 'SIGKILL'); } catch { } return until(() => !E._verifyAlive(st), 3000, 10); };
const lastRun = (j) => j.runs[j.runs.length - 1] || {};
const NODE = process.execPath;
const GROW = 'const b=Buffer.alloc(512*1024*1024,1); console.log("survived", b.length)';                     // touches 512 MB (the cgroup legs stop it at 256)
const RESERVE = 'const a=Buffer.allocUnsafe(512*1024*1024), b=Buffer.allocUnsafe(512*1024*1024); console.log("survived", a.length + b.length)'; // maps 1 GB, touches ~0 (RLIMIT_DATA counts the mapping)
const HOLD = 'const b=Buffer.alloc(96*1024*1024,1); setInterval(()=>b[0]++, 60000)'; // ~110 MB anon, held
// RESERVE — or, while the flag file exists, sleep (a run the instance's restart cuts)
const SWITCH = (flag) => `if (require('fs').existsSync(${JSON.stringify(flag)})) setInterval(() => {}, 60000); else { ${RESERVE} }`;
const userSystemd = (() => { const r = spawnSync('systemctl', ['--user', 'show', '-p', 'ControlGroup', '--value'], { encoding: 'utf8', timeout: 3000 }); const cg = r.status === 0 ? String(r.stdout).trim() : ''; try { return cg && /\bmemory\b/.test(fs.readFileSync(`/sys/fs/cgroup${cg}/cgroup.controllers`, 'utf8')); } catch { return false; } })();
// the fake-manager legs need only a cgroup v2 root with a memory controller (the fake says the user systemd sits at «/») and prlimit
const fakeable = (() => { try { return /\bmemory\b/.test(fs.readFileSync('/sys/fs/cgroup/cgroup.controllers', 'utf8')) && !!realOf('prlimit'); } catch { return false; } })();
const FAKE_CTL_259 = 'case "$*" in\n  *"-p ControlGroup"*) echo /;;\n  *"-p Version"*) echo 259.5;;\n  *--version*) echo "systemd 259 (259.5)";;\n  *) exit 1;;\nesac';
const REFUSE_OOMPOLICY = 'for a in "$@"; do case "$a" in OOMPolicy=*) echo "Unknown assignment: $a" >&2; exit 1;; esac; done';
const fakeCgroup = (dir, { anonMb = 150, fileMb = 40, currentMb = 190, maxMb = 200 } = {}) => { // the container's cgroup as the wrapper reads it
  const cg = path.join(dir, 'fake-cgroup');
  fs.mkdirSync(cg);
  fs.writeFileSync(path.join(cg, 'memory.max'), maxMb ? String(maxMb * MiB) : 'max'); fs.writeFileSync(path.join(cg, 'memory.current'), String(currentMb * MiB));
  fs.writeFileSync(path.join(cg, 'memory.stat'), `anon ${anonMb * MiB}\nfile ${fileMb * MiB}\nkernel 1048576\n`); fs.writeFileSync(path.join(cg, 'memory.events'), 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0\n');
  return cg;
};
// a scope's processes NOW, read off the REAL manager by its unit (its ControlGroup) — [] once it is empty or gone; and the
// suite's own kill of a scope it made (a RED run's leftover never outlives the suite)
const CTL = realOf('systemctl') || 'systemctl';
const scopeProcs = (u) => { if (!u) return []; const r = spawnSync(CTL, ['--user', 'show', '-p', 'ControlGroup', '--value', u], { encoding: 'utf8', timeout: 3000 }); const cg = String(r.stdout || '').trim(); if (!cg) return []; try { return fs.readFileSync(`/sys/fs/cgroup${cg}/cgroup.procs`, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
const killScopeOf = (u) => { if (u && u.startsWith(PREFIX)) { spawnSync(CTL, ['--user', 'kill', '--signal=KILL', u], { timeout: 3000 }); spawnSync(CTL, ['--user', 'reset-failed', u], { timeout: 3000 }); } };
const FAKE_CTL_252 = (ctl) => `case "$*" in *"-p Version"*) echo 252.33-1~deb12u1; exit 0;; *--version*) echo "systemd 252 (252.33-1~deb12u1)"; exit 0;; esac\nexec ${ctl} "$@"`;
// the suite's OWN walk of what a scope shares with this process (independent of the wrapper's): the common ancestors
const sharedOf = (a, b) => { const pa = a.split('/').filter(Boolean), pb = b.split('/').filter(Boolean); let n = 0; while (n < pa.length && n < pb.length && pa[n] === pb[n]) n++; return Array.from({ length: n + 1 }, (_, i) => '/' + pa.slice(0, n - i).join('/')); };
const selfCgroup = (() => { try { return (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3) || '/'; } catch { return '/'; } })();
const bumpGroupKill = (cg) => { const p = path.join(cg, 'memory.events'), t = fs.readFileSync(p, 'utf8'); fs.writeFileSync(p, t.replace(/^oom_group_kill (\d+)$/m, (_, n) => `oom_group_kill ${Number(n) + 1}`)); };
const legs = [];
const leg = (title, body) => legs.push({ title, body, rows: [] });

leg('§3 REAL ① the cgroup rung — proven before the job runs, the bound enforced, the end named', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the cgroup rung: no user systemd with a memory controller answers here (a fleet pod, a CI runner) — the rlimit rung (②) is this host\'s'); return; }
  const A = engineIn(scratch())();
  const r = A.create({ kind: 'task', name: 'grow', cmd: { argv: [NODE, '-e', GROW] }, memoryMb: 256, owner }, caller);
  const j = A.jobs.get(r.job && r.job.id);
  ok(!!j && lastRun(j).memoryMb === 256, 'cgroup: a job created with memory 256 runs asking 256 MB', r.error);
  // a stop is still a stop: the scope holds the job, the engine's group kill still reaches it (started beside the first)
  const r2 = A.create({ kind: 'task', name: 'sleeper', cmd: { argv: ['sleep', '30'] }, memoryMb: 256, owner }, caller);
  const j2 = A.jobs.get(r2.job && r2.job.id);
  await settle(A, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.cause === 'oom-bound' && j.state === 'failed', `cgroup: 256 MB bound, a 512 MB Buffer ⇒ the job ends oom-bound, failed (base: grows to 512 MB, exit 0)`, { cause: run.cause, state: j.state, exit: run.exit });
  ok(run.memoryBound && run.memoryBound.by === 'cgroup' && run.memoryBound.mb === 256, 'cgroup: the run carries the rung it MEASURED — {mb 256, by cgroup, why}', run.memoryBound);
  ok(ex.memory && ex.memory.confirmed === true && ex.memory.maxBytes === 256 * MiB && /oom-kill/.test(ex.memory.how || ''), 'cgroup: the wrapper read the scope\'s memory.max (256 MiB) back off the child before the go, and the scope\'s Result oom-kill ended it', ex.memory);
  ok(A.events.some((e) => e.jobId === j.id && /stopped: used more than 256 MB/.test(e.what || '')) && logs.some((l) => l.includes(j.id) && /stopped: used more than 256 MB/.test(l)), 'cgroup: the job\'s journal and the server\'s log name the end «stopped: used more than 256 MB»');
  ok(/stopped: used more than 256 MB/.test(run.lastLine || ''), 'cgroup: the card\'s last line names it too (the wrapper\'s exit line)', run.lastLine);
  const snap = A.snapshot(j);
  ok(LF('memoryChip')(snap, (k) => k) === '256 MB · cgroup' && snap.memorySource === 'job', 'cgroup: the snapshot gives the card «256 MB · cgroup» (its own bound)', { chip: LF('memoryChip')(snap, (k) => k), src: snap.memorySource });
  ok(await until(() => { const b = readJson(path.join(ctlOf(j2), 'bound.json')); return b && b.confirmed; }, 3000, 10), 'cgroup: a running job\'s rung is confirmed while it runs (bound.json)');
  await A._sweep();
  ok(lastRun(j2).memoryBound && lastRun(j2).memoryBound.by === 'cgroup' && LF('memoryChip')(A.snapshot(j2), (k) => k) === '256 MB · cgroup', 'cgroup: the card says «256 MB · cgroup» WHILE it runs');
  A.stop(j2);
  await settle(A, j2);
  ok(lastRun(j2).cause === 'interrupted', 'cgroup: the owner\'s stop reaches the scoped job and stays a stop (never named a memory end)', lastRun(j2).cause);
  stopEngine(A);
});

leg(`§3 REAL ② the rlimit rung (forced — the pod's: no user systemd there) under THIS node (${process.version})`, async (ok) => {
  const B = engineIn(scratch())({ memoryRungs: ['rlimit-data'] });
  const r = B.create({ kind: 'task', name: 'reserve', cmd: { argv: [NODE, '-e', RESERVE] }, memoryMb: 1024, owner }, caller);
  const j = B.jobs.get(r.job && r.job.id);
  // the size the creator gave rides the run; an agent's 0 is refused at create, the user's is not (started beside the first)
  ok(/owner/.test(B.create({ kind: 'task', name: 'zero', cmd: { argv: ['true'] }, memoryMb: '0', owner }, caller).error || '') && /at least 256 MB/.test(B.create({ kind: 'task', name: 'tiny', cmd: { argv: ['true'] }, memoryMb: '512k', owner }, caller).error || ''), 'create: an agent\'s memory 0 (unbounded) and its 512k are refused by name');
  const u = B.create({ kind: 'task', name: 'user-zero', cmd: { argv: ['true'] }, memoryMb: '0', owner: { ...owner, createdBy: 'user' } }, { isUser: true, groups: new Set() });
  const ju = B.jobs.get(u.job && u.job.id);
  await settle(B, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.cause === 'oom-bound' && j.state === 'failed', `rlimit: 1 GB bound, 1 GB of Buffers ⇒ RLIMIT_DATA refuses, the end is oom-bound under node ${process.version} (base: exit 0; 0259f1ea under 24.22: error)`, { cause: run.cause, exit: run.exit, how: ex.memory && ex.memory.how });
  ok(run.memoryBound && run.memoryBound.by === 'rlimit-data' && ex.memory && ex.memory.confirmed === true && ex.memory.maxBytes === 1024 * MiB, 'rlimit: the rung rlimit-data, its limit read back off the child (/proc/<pid>/limits) before the go', ex.memory);
  ok(/RLIMIT_DATA/.test((ex.memory && ex.memory.how) || '') && /stopped: used more than 1 GB/.test(run.lastLine || ''), `rlimit: named by the job's last words (${(ex.memory && ex.memory.how) || 'none'}), the card's line «stopped: used more than 1 GB»`, run.lastLine);
  if (ju) await settle(B, ju);
  ok(ju && lastRun(ju).memoryBound && lastRun(ju).memoryBound.by === 'none' && /owner set 0/.test(lastRun(ju).memoryBound.why) && LF('memoryChip')(B.snapshot(ju), (k) => k) === 'unbounded — set by the owner', 'create: the user\'s 0 runs unbounded — said, never silent');
  const set = act(B, 'setMemory', ju || {}, '8G', { byUser: false });
  const evs = B.events.length, again = act(B, 'setMemory', ju || {}, '8192', { byUser: false });
  ok(set.ok && set.memoryMb === 8192 && set.memorySource === 'job' && again.ok && again.unchanged === true && B.events.length === evs, 'properties: the bound changes (8G ⇒ 8192, its own); the same value again changes nothing and writes nothing (no event)', again);
  ok(act(B, 'setMemory', ju, 'inherit').memorySource === 'default', 'properties: «inherit» goes back to the ladder');
  stopEngine(B);
});

leg('§3 REAL ③ a manager that refuses OOMPolicy= (systemd < 253: «Unknown assignment») — the job runs ONCE on the next rung', async (ok) => {
  if (!fakeable) { skip++; ok.say('  - SKIP the refused-rung leg: no cgroup v2 memory controller or no prlimit here'); return; }
  const dir = scratch();
  fake(dir, 'systemctl', FAKE_CTL_259);
  fake(dir, 'systemd-run', `${REFUSE_OOMPOLICY}\necho "fake systemd-run: not this call" >&2; exit 1`);
  const E = engineIn(dir)();
  const j = E.jobs.get((E.create({ kind: 'task', name: 'refused', cmd: { argv: ['sh', '-c', 'echo ran-once'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {}, log = fs.readFileSync(run.log, 'utf8');
  ok(run.cause === 'ok' && (log.match(/ran-once/g) || []).length === 1, 'refused: the job RAN, exactly once, and ended ok (0259f1ea: never ran — exit 1)', { cause: run.cause, exit: run.exit, log: log.slice(-200) });
  ok(ex.memory && ex.memory.by === 'rlimit-data' && ex.memory.confirmed === true && /^systemd-run refused: Unknown assignment: OOMPolicy=stop/.test(ex.memory.why || ''), 'refused: the rung is rlimit-data, proven, and its why says «systemd-run refused: Unknown assignment: OOMPolicy=stop» (0259f1ea: by cgroup)', ex.memory);
  ok(/\[job-wrapper\] the cgroup rung did not hold the job — systemd-run refused/.test(log), 'refused: the job\'s log says the cgroup rung did not hold it, and why');
  stopEngine(E);
});

leg('§3 REAL ④ a manager that never answers — the wait is bounded, the job runs ONCE on the next rung', async (ok) => {
  if (!fakeable) { skip++; ok.say('  - SKIP the silent-manager leg: no cgroup v2 memory controller or no prlimit here'); return; }
  const dir = scratch();
  fake(dir, 'systemctl', FAKE_CTL_259);
  fake(dir, 'systemd-run', 'exec sleep 5'); // a D-Bus call that hangs (the wrapper's wait: 3 s; the engine's test seam: 0.3 s)
  const E = engineIn(dir)({ memorySample: { gateMs: 300 } });
  const t0 = Date.now();
  const j = E.jobs.get((E.create({ kind: 'task', name: 'silent', cmd: { argv: ['sh', '-c', 'echo ran-once'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {}, log = fs.readFileSync(run.log, 'utf8');
  ok(run.cause === 'ok' && (log.match(/ran-once/g) || []).length === 1 && Date.now() - t0 >= 300, 'silent: the job ran exactly once, after the bounded wait (0259f1ea: never ran — the wrapper waits on the hung systemd-run)', { cause: run.cause, ms: Date.now() - t0 });
  ok(ex.memory && ex.memory.by === 'rlimit-data' && ex.memory.confirmed === true && /systemd-run did not answer in 0\.3 s/.test(ex.memory.why || ''), 'silent: rlimit-data, proven, «systemd-run did not answer in 0.3 s» in its why', ex.memory);
  stopEngine(E);
});

leg('§3 REAL ⑤ a manager < 253 — the scope WITHOUT OOMPolicy=, the end read from the scope\'s own memory.events', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the < 253 leg: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), ctl = realOf('systemctl'), run0 = realOf('systemd-run');
  // a 252 manager: its Version says so, its systemd-run refuses OOMPolicy= (the real one, under this 259, runs the scope with
  // OOMPolicy=continue — a scope with no OOM policy of its own, as before 253: the kernel's kill is the only end)
  fake(dir, 'systemctl', `case "$*" in *"-p Version"*) echo 252.33-1~deb12u1; exit 0;; *--version*) echo "systemd 252 (252.33-1~deb12u1)"; exit 0;; esac\nexec ${ctl} "$@"`);
  fake(dir, 'systemd-run', `${REFUSE_OOMPOLICY}\nexec ${run0} -p OOMPolicy=continue "$@"`);
  const E = engineIn(dir)();
  const j = E.jobs.get((E.create({ kind: 'task', name: 'grow-252', cmd: { argv: [NODE, '-e', GROW] }, memoryMb: 256, owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.cause === 'oom-bound' && j.state === 'failed', '< 253: 256 MB bound, a 512 MB Buffer ⇒ oom-bound (0259f1ea: OOMPolicy refused — exit 1, error)', { cause: run.cause, exit: run.exit });
  ok(ex.memory && ex.memory.by === 'cgroup' && ex.memory.confirmed === true && ex.memory.maxBytes === 256 * MiB && /systemd 252 has no OOMPolicy for a scope/.test(ex.memory.why || '') && /memory\.events: oom [1-9]\d*, oom_kill [1-9]\d* \(at MemoryMax\)/.test(ex.memory.how || ''), '< 253: the scope held it (memory.max read back), its why says 252 has no OOMPolicy, its end is the scope\'s own memory.events (oom ≥ 1 — the kernel may count a second while its victim dies — oom_kill ≥ 1)', ex.memory);
  stopEngine(E);
});

leg('§3 REAL ⑥ the instance\'s cap — a 16 GB job on an instance whose memory.max is 8 GiB runs at 6 GiB, and says so', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the cap leg: no prlimit here'); return; }
  const dir = scratch(), lim = path.join(dir, 'instance-cgroup');
  fs.mkdirSync(lim); fs.writeFileSync(path.join(lim, 'memory.max'), String(8 * 1024 * MiB)); // the pod's own memory.max: 8 GiB
  const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memoryLimitDir: lim });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'big', cmd: { argv: ['sh', '-c', 'echo capped-run'] }, memoryMb: '16G', owner }, caller).job || {}).id);
  await settle(E, j);
  const run = lastRun(j), ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(run.memoryMb === 6144 && run.memoryAskedMb === 16384 && run.memoryCap && run.memoryCap.limitMb === 8192 && run.memoryCap.hubMb === 2048, 'cap: the run asked 16 GB and runs at 6 GiB — both numbers and the cap on its record (8a2727c8: 16 GB)', { memoryMb: run.memoryMb, asked: run.memoryAskedMb, cap: run.memoryCap });
  ok(run.cause === 'ok' && ex.memory && ex.memory.by === 'rlimit-data' && ex.memory.mb === 6144 && ex.memory.maxBytes === 6144 * MiB, 'cap: the wrapper held it at the EFFECTIVE bound — RLIMIT_DATA 6 GiB read back off the child', ex.memory);
  const snap = E.snapshot(j), words = LF('memoryChip')(snap, (k, p) => (p ? k.replace(/\{(\w+)\}/g, (_, x) => p[x]) : k));
  ok(snap.memoryMb === 6144 && snap.memoryAskedMb === 16384 && words === '6 GB · rlimit · capped by the instance’s 8 GB limit', 'cap: the card says «6 GB · rlimit · capped by the instance’s 8 GB limit»', { words, snap: { mb: snap.memoryMb, asked: snap.memoryAskedMb, cap: snap.memoryCap } });
  // the engine's own read, without the seam: the tightest memory.max of its cgroup and every ancestor (here, whatever this
  // host gives the suite — env.sh's scope carries 24 GiB, a CI runner none) equals the suite's own walk of /proc/self/cgroup
  const own = (() => { let mb = null; const rel = (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3); const parts = rel.split('/').filter(Boolean);
    for (let i = parts.length; i >= 0; i--) { try { const v = fs.readFileSync(path.join('/sys/fs/cgroup', ...parts.slice(0, i), 'memory.max'), 'utf8').trim(); if (/^\d+$/.test(v)) mb = Math.min(mb === null ? Infinity : mb, Math.floor(Number(v) / MiB)); } catch { } } return mb; })();
  const H = engineIn(scratch())({ memoryLimitDir: undefined });
  // round 5: the engine's answer AS IT STATES IT — {mb: null, of: null} on a host with no limit (b8d2a3a0's row turned the null
  // into {} through a method round 4 removed: red on every uncapped host — a CI runner, this box's plain shell)
  const hubRead = act(H, '_instanceLimit');
  ok(hubRead && hubRead.mb === own && (own === null ? hubRead.of === null : typeof hubRead.of === 'string'), `cap: the engine reads its own cgroup's tightest memory.max (here ${own === null ? 'none — no cap' : own + ' MB'})`, hubRead);
  stopEngine(H);
  const four = act(E, 'setMemory', j, '4G'), back = act(E, 'setMemory', j, '16G');
  ok(four.memoryMb === 4096 && !four.memoryCap && back.memoryMb === 6144 && back.memoryAskedMb === 16384 && back.memoryCap && back.memoryCap.limitMb === 8192 && E.events.some((e) => e.jobId === j.id && /capped by the instance's 8 GB limit \(asked 16 GB\)/.test(e.what || '')), 'cap: the properties / CLI take the ASKED value and answer the effective one (4G stays 4 GB; 16G ⇒ 6 GB, capped, said in the journal)', { four, back });
  stopEngine(E);
});

leg('§3 REAL ⑦ a stop ENDS THE JOB, never just its holder — systemd < 253 (a fake 252 over the real manager), a job deaf to SIGTERM', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the stop legs: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), ctl = realOf('systemctl'), run0 = realOf('systemd-run');
  fake(dir, 'systemctl', FAKE_CTL_252(ctl));
  fake(dir, 'systemd-run', `${REFUSE_OOMPOLICY}\nexec ${run0} -p OOMPolicy=continue "$@"`);
  const DEAF = ['sh', '-c', 'trap "" TERM; exec sleep 9'];
  // ⓐ the owner's stop: SIGTERM to the wrapper's group — the job ignores it; the scope's drain bound (10 s) is the engine's
  // test seam here, 0.3 s
  const deaf = async () => {
    const E = engineIn(dir)({ memorySample: { stopMs: 300 } });
    const j = E.jobs.get((E.create({ kind: 'task', name: 'deaf', cmd: { argv: DEAF }, memoryMb: 256, owner }, caller).job || {}).id);
    const up = await running(E, j), b = readJson(path.join(ctlOf(j), 'bound.json')) || {};
    const before = scopeProcs(b.unit);
    E.stop(j);
    await until(() => !E._verifyAlive(E._readStamp(j)), 3000, 10);
    const atEnd = scopeProcs(b.unit);
    await E._sweep(); // the engine's own tick: a requested stop's kill step (222f7f5d: gated on the wrapper's life — it is gone)
    await until(() => !scopeProcs(b.unit).length, 1500, 25);
    return { E, j, up, b, before, atEnd, after: scopeProcs(b.unit), ex: readJson(path.join(ctlOf(j), 'exit.json')) || {}, run: lastRun(j) };
  };
  // ⓑ the engine's kill step never hangs on the wrapper's life: a wrapper killed ALONE (its job left in its scope — the real
  // manager, ≥ 253) — the owner's stop is said to the scope, and the sweep reaps what an ended run left there
  const orphan = async () => {
    const E = engineIn(scratch())();
    const k = E.jobs.get((E.create({ kind: 'task', name: 'orphan', cmd: { argv: DEAF }, memoryMb: 256, owner }, caller).job || {}).id);
    const up = await running(E, k), b = readJson(path.join(ctlOf(k), 'bound.json')) || {};
    try { process.kill(E._readStamp(k).pid, 'SIGKILL'); } catch { } // the wrapper alone — not its group
    await until(() => !E._verifyAlive(E._readStamp(k)), 2000, 10);
    const orphaned = scopeProcs(b.unit);
    E.stop(k);
    await E._sweep();
    await until(() => !scopeProcs(b.unit).length && !!lastRun(k).forced, 2000, 25); // (round 6: the reap goes on beside the judgment)
    return { E, k, up, b, orphaned, left: scopeProcs(b.unit) };
  };
  const [A, B] = await Promise.all([deaf(), orphan()]);
  ok(A.up && A.b.by === 'cgroup' && /systemd 252/.test(A.b.why || '') && A.before.length >= 1, `deaf: it runs in its scope on the < 253 rung (cgroup.procs before the stop: [${A.before.join(' ')}])`, A.b);
  ok(!A.atEnd.length && !A.after.length, `deaf: the stop ENDED the job — its scope's cgroup.procs when its wrapper ended: [${A.atEnd.join(' ')}], after the engine's step: [${A.after.join(' ')}] (222f7f5d: the holder died at once, the wrapper left, «sleep 9» stayed)`, { atEnd: A.atEnd, after: A.after });
  ok(A.ex.signal === 'SIGKILL' && A.ex.stop === 'SIGTERM' && /^stopped by force: it did not end on SIGTERM in 0\.3 s — its scope was killed$/.test(A.run.forced || ''), `deaf: exit.json names the job's OWN end (signal ${A.ex.signal}), the stop (${A.ex.stop}); the run «${A.run.forced || 'no force'}» — the wrapper's kill or the engine's, whichever lands first, in the same words (222f7f5d: the holder's SIGTERM, no force)`, { ex: A.ex, forced: A.run.forced });
  ok(A.run.cause === 'interrupted' && /stopped by force/.test(A.run.forced || '') && /stopped by force/.test(A.run.lastLine || '') && A.E.events.some((e) => e.jobId === A.j.id && /stopped by force/.test(e.what || '')), 'deaf: the run stays a stop (interrupted) and says «stopped by force» — its record, its last line, its journal', { cause: A.run.cause, forced: A.run.forced, lastLine: A.run.lastLine });
  ok(B.up && B.orphaned.length >= 1 && !B.left.length && /^stopped by force: its wrapper was gone and its scope still held 1 process — its scope was killed$/.test(lastRun(B.k).forced || ''), `a wrapper gone, its job not (cgroup.procs: [${B.orphaned.join(' ')}]) — the engine's step reached the SCOPE: [${B.left.join(' ')}], said on the run (222f7f5d: nothing reached it)`, { orphaned: B.orphaned, left: B.left, forced: lastRun(B.k).forced });
  for (const u of [A.b.unit, B.b.unit]) killScopeOf(u); // a RED run's orphans never outlive the suite
  stopEngine(A.E); stopEngine(B.E);
});

leg('§3 REAL ⑧ a timer belongs to its rung — a refused rung\'s proof never judges the next rung\'s child', async (ok) => {
  if (!fakeable) { skip++; ok.say('  - SKIP the late-refusal leg: no cgroup v2 memory controller or no prlimit here'); return; }
  const dir = scratch(), pl = realOf('prlimit');
  fake(dir, 'systemctl', FAKE_CTL_259);
  fake(dir, 'systemd-run', 'sleep 0.25; echo "Unknown assignment: OOMPolicy=stop" >&2; exit 1'); // refused LATE in its window
  fake(dir, 'prlimit', `sleep 0.2; exec ${pl} "$@"`); // the next rung: slow but sound — it proves well inside ITS OWN window
  const E = engineIn(dir)({ memorySample: { gateMs: 400 } });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'late', cmd: { argv: ['sh', '-c', 'echo ran-once'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  await settle(E, j);
  const ex = readJson(path.join(ctlOf(j), 'exit.json')) || {}, m = ex.memory || {}, log = fs.readFileSync(lastRun(j).log, 'utf8');
  ok(m.by === 'rlimit-data' && m.confirmed === true && m.why === 'systemd-run refused: Unknown assignment: OOMPolicy=stop — RLIMIT_DATA on the job instead' && (log.match(/ran-once/g) || []).length === 1, `late refusal: the next rung proves in its own window — ${m.by}, «${m.why}» (222f7f5d: the refused rung's timer judged prlimit by ITS deadline — by none, «prlimit did not answer»)`, m);
  stopEngine(E);
});

leg('§3 REAL ⑨ the cap is the limit that CONTAINS the job — a scope beside the hub is not inside the hub\'s own limit; a slice it shares is', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the containment leg: no user systemd with a memory controller answers here'); return; }
  // where this host puts a user scope (the manager's app.slice), and what that shares with this process — the suite's own walk
  const um = String(spawnSync(CTL, ['--user', 'show', '-p', 'ControlGroup', '--value'], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
  const shared = sharedOf(`${um}/app.slice/x.scope`, selfCgroup);
  const realLim = shared.map((d) => { try { const v = fs.readFileSync(path.join('/sys/fs/cgroup', d, 'memory.max'), 'utf8').trim(); return /^\d+$/.test(v) ? Math.floor(Number(v) / MiB) : null; } catch { return null; } }).filter((v) => v !== null).sort((x, y) => x - y)[0] ?? null;
  const want = realLim ? Math.min(16384, M.instanceCapOf(realLim).capMb) : 16384;
  // (a) the HUB's own cgroup holds 8 GiB (the seam stands for it — env.sh's scope, the hub's unit); a 16 GB job on the cgroup
  // rung lives in a scope BESIDE the hub: that limit does not contain it, nothing lowers it (the rlimit rung, inside the hub,
  // still is — leg ⑥)
  const dir = scratch(), lim = path.join(dir, 'hub-cgroup');
  fs.mkdirSync(lim); fs.writeFileSync(path.join(lim, 'memory.max'), String(8 * 1024 * MiB));
  const E = engineIn(dir)({ memoryLimitDir: lim });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'beside', cmd: { argv: ['sh', '-c', 'echo beside'] }, memoryMb: '16G', owner }, caller).job || {}).id);
  await settle(E, j);
  const bj = (readJson(path.join(ctlOf(j), 'exit.json')) || {}).memory || {}, rj = lastRun(j);
  ok(bj.by === 'cgroup' && bj.mb === want && bj.maxBytes === want * MiB && rj.memoryMb === want && (realLim ? !!rj.memoryCap : !rj.memoryCap), `beside: a 16 GB job whose hub holds 8 GiB runs at ${want} MB on the cgroup rung — its scope's memory.max read back ${bj.maxBytes}; the hub's own limit does not contain it (222f7f5d: 6 GiB, «capped by the instance's 8 GB»)`, { by: bj.by, mb: bj.mb, cap: rj.memoryCap });
  // (b) a limit the scope SHARES with the hub (a fake tree of memory.max files — the seam `limitRoot`; this host's real
  // user.slice holds the production hub and is never touched): 32 GiB there ⇒ a 48 GB job runs at 24 GiB, and the record
  // names WHICH limit
  const top = shared[shared.length - 2] || '/', base = top.split('/').filter(Boolean).pop() || '';
  const name = top === '/' ? 'instance' : /^user(-\d+)?\.slice$/.test(base) ? 'user slice' : base;
  const tree = path.join(dir, 'cgroup-tree');
  fs.mkdirSync(path.join(tree, top), { recursive: true }); fs.writeFileSync(path.join(tree, top, 'memory.max'), String(32 * 1024 * MiB));
  const F = engineIn(scratch())({ memorySample: { limitRoot: tree } });
  const k = F.jobs.get((F.create({ kind: 'task', name: 'shared', cmd: { argv: ['sh', '-c', 'echo shared'] }, memoryMb: '48G', owner }, caller).job || {}).id);
  await settle(F, k);
  const bk = (readJson(path.join(ctlOf(k), 'exit.json')) || {}).memory || {}, rk = lastRun(k);
  const tr = (key, p) => (p ? key.replace(/\{(\w+)\}/g, (_, x) => p[x]) : key), words = LF('memoryChip')(F.snapshot(k), tr);
  ok(bk.by === 'cgroup' && bk.mb === 24576 && bk.maxBytes === 24576 * MiB && rk.memoryMb === 24576 && rk.memoryAskedMb === 49152 && rk.memoryCap && rk.memoryCap.limitMb === 32768 && rk.memoryCap.of === name,
    `shared: ${top} at 32 GiB ⇒ a 48 GB job's scope is set to 24 GiB before the go (read back ${bk.maxBytes}); the run names the limit — «${name}» (222f7f5d: 48 GiB, nothing read off the scope)`, { by: bk.by, mb: bk.mb, cap: rk.memoryCap });
  const capName = name === 'instance' ? 'the instance’s' : name === 'user slice' ? 'the user slice’s' : `${name}’s`;
  const set64 = act(F, 'setMemory', k, '64G');
  ok(words === `24 GB · cgroup · capped by ${capName} 32 GB limit` && set64.memoryMb === 24576 && set64.memoryCap && set64.memoryCap.of === name && F.events.some((e) => e.jobId === k.id && e.what && e.what.includes(`capped by ${capName.replace('’', "'")} 32 GB limit (asked 64 GB)`)),
    `shared: the card says «${words}»; the next run's words follow what contains this host's scopes (a 64G ⇒ 24 GB, the journal names the limit)`, { words, set64 });
  stopEngine(E); stopEngine(F);
});

leg('§4 REAL — the park law through the engine\'s doors (a boot replay counts exactly like a run)', async (ok) => {
  const engine = engineIn(scratch());
  const C1 = engine({ memoryRungs: ['rlimit-data'] });
  const r = C1.create({ kind: 'service', name: 'hog-svc', cmd: { argv: [NODE, '-e', RESERVE] }, memoryMb: 1024, owner }, caller);
  const id = r.job && r.job.id;
  let j = C1.jobs.get(id);
  await settle(C1, j);
  ok(lastRun(j).cause === 'oom-bound' && (j.supervise || {}).oomEnds === 1 && j.state === 'down' && !(j.supervise || {}).parkedAt, 'service: its first oom-bound end counts 1 — down, not parked', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  ok(C1.events.some((e) => e.jobId === id && /stopped: used more than 1 GB — 1 more out-of-memory end parks it/.test(e.what || '')), 'service: the journal names the end and what the next one does');
  C1._save(); stopEngine(C1);
  const C2 = engine({ memoryRungs: ['rlimit-data'] }); // THE BOOT: the replay starts the desiredUp service (base: forever)
  j = C2.jobs.get(id);
  ok(lastRun(j).trigger === 'boot', 'boot: the replay starts it again (trigger boot)', lastRun(j).trigger);
  await settle(C2, j);
  const parkWords = 'parked: out of memory twice — raise its bound or fix the job';
  ok(lastRun(j).cause === 'oom-bound' && j.supervise.parkedAt && j.supervise.parkedFor === 'memory' && j.state === 'failed', 'boot: the REPLAY\'s oom-bound end is the second ⇒ parked by name (base: restarted again)', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  ok(said.some((n) => n.jobId === id && /parked — out of memory twice\. Raise its bound/.test(n.text) && n.i18n && n.i18n.text && /parked — out of memory twice/.test(n.i18n.text.key)) && C2.events.some((e) => e.jobId === id && e.what.includes(parkWords)), 'park: said to the owner in For you (worded per device) and in the job\'s journal');
  ok(LF('memoryEndWords')(C2.snapshot(j), (k) => k) === parkWords, 'park: the card says «parked: out of memory twice — raise its bound or fix the job»');
  const runs = j.runs.length;
  C2._save(); stopEngine(C2);
  const C3 = engine({ memoryRungs: ['rlimit-data'] }); // the next boot leaves a parked job alone
  j = C3.jobs.get(id);
  ok(j.runs.length === runs && j.state === 'failed', 'park: the next boot does NOT replay it (not restarted until the owner acts)', { runs: j.runs.length, was: runs, state: j.state });
  ok(C3.start(j).ok && lastRun(j).trigger === 'manual' && !j.supervise.oomEnds, 'park: the owner\'s start runs it again, counting afresh');
  await settle(C3, j);
  ok(lastRun(j).cause === 'oom-bound' && j.supervise.oomEnds === 1 && !j.supervise.parkedAt, 'park: after the owner acted, one more end is 1 of 2 — not parked yet', j.supervise);
  stopEngine(C3);
});

leg('§4 REAL ⓑ a non-memory end resets — oom → a restart → oom is NOT two in a row (a service)', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), flag = path.join(dir, 'sleep-instead');
  const deps = { memoryRungs: ['rlimit-data'] };
  const E1 = engine(deps);
  const id = (E1.create({ kind: 'service', name: 'svc-reset', cmd: { argv: [NODE, '-e', SWITCH(flag)] }, memoryMb: 1024, owner }, caller).job || {}).id;
  let j = E1.jobs.get(id);
  await settle(E1, j);
  ok(lastRun(j).cause === 'oom-bound' && (j.supervise || {}).oomEnds === 1, 'reset (service): run 1 ends oom-bound — 1 of 2', { cause: lastRun(j).cause, sup: j.supervise });
  fs.writeFileSync(flag, ''); E1._save(); stopEngine(E1);
  const E2 = engine(deps); // the boot replays it — this run sleeps, and the instance restarts under it
  j = E2.jobs.get(id);
  ok(await running(E2, j) && await killGroup(E2, j), 'reset (service): run 2 runs, and the instance restarts under it (its group killed, no exit record)');
  E2._save(); stopEngine(E2); fs.rmSync(flag, { force: true });
  const E3 = engine(deps); // the boot judges run 2 env-restart — then replays run 3 (an oom again)
  j = E3.jobs.get(id);
  const cut = j.runs[j.runs.length - 2] || {};
  ok(cut.cause === 'env-restart' && !(j.supervise || {}).oomEnds, 'reset (service): the boot ends run 2 env-restart and the count RESETS (0259f1ea: the run left open, still 1)', { cause: cut.cause, sup: j.supervise });
  await settle(E3, j);
  ok(lastRun(j).cause === 'oom-bound' && (j.supervise || {}).oomEnds === 1 && !(j.supervise || {}).parkedAt && j.state === 'down', 'reset (service): run 3 ends oom-bound — 1 of 2, NOT parked (0259f1ea: parked)', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  stopEngine(E3);
});

leg('§4 REAL ⓒ the same for a cron — fire 1 oom, fire 2 cut by a restart, fire 3 oom ⇒ still enabled', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), flag = path.join(dir, 'sleep-instead');
  const deps = { memoryRungs: ['rlimit-data'] };
  const E1 = engine(deps);
  const cid = (E1.create({ kind: 'cron', name: 'cron-reset', schedule: { at: Date.now() + 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: [NODE, '-e', SWITCH(flag)] }, memoryMb: 1024 } }, owner }, caller).job || {}).id;
  const kidOf = (E) => [...E.jobs.values()].find((x) => x.cronParent === cid);
  let cron = E1.jobs.get(cid);
  E1._fireCron(cron, 'schedule');
  let kid = kidOf(E1);
  await settle(E1, kid);
  ok(lastRun(kid).cause === 'oom-bound' && (kid.supervise || {}).oomEnds === 1, 'reset (cron): fire 1 ends oom-bound — its child counts 1', { cause: lastRun(kid).cause, sup: kid.supervise });
  fs.writeFileSync(flag, '');
  E1._fireCron(cron, 'schedule');
  kid = kidOf(E1);
  ok(await running(E1, kid) && await killGroup(E1, kid), 'reset (cron): fire 2 runs, and the instance restarts under it');
  E1._save(); stopEngine(E1); fs.rmSync(flag, { force: true });
  const E2 = engine(deps);
  cron = E2.jobs.get(cid); kid = kidOf(E2);
  ok(lastRun(kid).cause === 'env-restart' && !(kid.supervise || {}).oomEnds, 'reset (cron): the boot ends fire 2 env-restart — the count RESETS (0259f1ea: still 1)', { cause: lastRun(kid).cause, sup: kid.supervise });
  E2._fireCron(cron, 'schedule');
  kid = kidOf(E2);
  await settle(E2, kid);
  ok(lastRun(kid).cause === 'oom-bound' && (kid.supervise || {}).oomEnds === 1 && cron.desiredUp !== false && cron.state !== 'failed' && !(cron.supervise || {}).parkedFor, 'reset (cron): fire 3 ends oom-bound — 1 of 2, the cron stays ENABLED (0259f1ea: parked, disabled)', { cause: lastRun(kid).cause, sup: kid.supervise, cron: { desiredUp: cron.desiredUp, state: cron.state } });
  stopEngine(E2);
});

leg('§5 REAL ⓐ the boot\'s judge: the instance\'s OOM count ROSE and the job held most of its anon (memory.oom.group took the wrapper too)', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), cg = fakeCgroup(dir); // the container's cgroup: 150 of 200 MiB anon, 40 MiB of cache
  const deps = { memoryRungs: ['rlimit-data'], memorySample: { sampleDir: cg, sampleMs: 50 } };
  const D1 = engine(deps);
  const id = (D1.create({ kind: 'service', name: 'pod-killer', cmd: { argv: [NODE, '-e', HOLD] }, owner }, caller).job || {}).id;
  const cycle = async (E, n) => {
    const j = E.jobs.get(id);
    const seen = await until(() => { const p = readJson(path.join(ctlOf(j), 'pressure.json')); return p && (p.jobAnonMb >= 90 || p.jobMb >= 100); }, 6000, 10);
    ok(seen, `pressure ${n}: the wrapper samples the instance's anon and the job's share (pressure.json)`);
    bumpGroupKill(cg); // the container's own OOM kill — memory.oom.group: every process of it at once
    await killGroup(E, j);
    ok(!fs.existsSync(path.join(ctlOf(j), 'exit.json')), `pressure ${n}: no exit record survives (as under memory.oom.group)`);
    E._save(); stopEngine(E);
  };
  await cycle(D1, 1);
  const D2 = engine(deps);
  let j = D2.jobs.get(id);
  const prev = j.runs[j.runs.length - 2] || {}, mj = prev.memoryJudge || {};
  ok(prev.cause === 'oom' && mj.jobAnonMb >= 90 && mj.anonMb === 150 && mj.limitMb === 200 && mj.oomKills === 1 && /OOM-killed/.test(mj.why || ''), 'boot 1: the run that died with the instance is judged `oom` — its count rose, the job held most of the anon; the numbers and the reason ride the run', { cause: prev.cause, mj });
  ok(j.supervise.oomEnds === 1 && lastRun(j).trigger === 'boot', 'boot 1: counted 1 of 2 — the replay runs it once more', { sup: j.supervise, trigger: lastRun(j).trigger });
  await cycle(D2, 2);
  const D3 = engine(deps);
  j = D3.jobs.get(id);
  ok(lastRun(j).cause === 'oom' && j.supervise.parkedFor === 'memory' && j.state === 'failed', 'boot 2: the second death with the instance ⇒ parked by name (base: replayed every boot — 638 times in 74 h)', { cause: lastRun(j).cause, sup: j.supervise, state: j.state });
  const n = j.runs.length;
  stopEngine(D3);
  const D4 = engine(deps);
  ok(D4.jobs.get(id).runs.length === n && D4.jobs.get(id).state === 'failed' && !D4._verifyAlive(D4._readStamp(D4.jobs.get(id))), 'boot 3: a parked job is not replayed (failed, nothing alive)', { runs: D4.jobs.get(id).runs.length, was: n, state: D4.jobs.get(id).state });
  stopEngine(D4);
});

leg('§5 REAL ⓑ a rolling update of a pod full of cache — no OOM kill ⇒ env-restart, never counted (page cache is not pressure)', async (ok) => {
  const dir = scratch(), engine = engineIn(dir), cg = fakeCgroup(dir); // memory.current at 95 % of the limit: what round 1 called «full»
  const deps = { memoryRungs: ['rlimit-data'], memorySample: { sampleDir: cg, sampleMs: 50 } };
  const R1 = engine(deps);
  const id = (R1.create({ kind: 'service', name: 'healthy-svc', cmd: { argv: [NODE, '-e', HOLD] }, owner }, caller).job || {}).id;
  let j = R1.jobs.get(id);
  ok(await until(() => { const p = readJson(path.join(ctlOf(j), 'pressure.json')); return p && (p.jobAnonMb >= 90 || p.jobMb >= 100); }, 6000, 10), 'rolling: the wrapper samples the instance (95 % of its limit in use)');
  await killGroup(R1, j); // the update's restart: no OOM kill in the instance's count
  R1._save(); stopEngine(R1);
  const R2 = engine(deps);
  j = R2.jobs.get(id);
  const prev = j.runs[j.runs.length - 2] || {};
  ok(prev.cause === 'env-restart' && !(j.supervise || {}).oomEnds && /no OOM kill/.test((prev.memoryJudge || {}).why || '') && lastRun(j).trigger === 'boot', 'rolling: the boot judges it env-restart — not counted, its reason in the record, the replay runs it (0259f1ea: oom, counted 1)', { cause: prev.cause, sup: j.supervise, judge: prev.memoryJudge });
  stopEngine(R2);
});

leg('§5 REAL ⓒ a SIGKILL from outside is never named an OOM off the hub\'s whole-subtree counter', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the outside-kill leg: no prlimit here'); return; }
  const dir = scratch(), cg = fakeCgroup(dir, { maxMb: 0 }); // the hub's cgroup (no limit — no sample) whose oom_kill another process raises
  const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memorySample: { sampleDir: cg, sampleMs: 50 } });
  const j = E.jobs.get((E.create({ kind: 'task', name: 'killed-outside', cmd: { argv: [NODE, '-e', 'setInterval(() => {}, 60000)'] }, memoryMb: 1024, owner }, caller).job || {}).id);
  ok(await running(E, j), 'outside: the job runs');
  const st = E._readStamp(j), kid = Number((fs.readFileSync(`/proc/${st.pid}/task/${st.pid}/children`, 'utf8').trim().split(/\s+/))[0]);
  fs.writeFileSync(path.join(cg, 'memory.events'), 'low 0\nhigh 0\nmax 0\noom 1\noom_kill 3\noom_group_kill 0\n'); // something ELSE of the hub's was OOM-killed meanwhile
  try { process.kill(kid, 'SIGKILL'); } catch { }
  await settle(E, j);
  const ex = readJson(path.join(ctlOf(j), 'exit.json')) || {};
  ok(lastRun(j).cause === 'error' && !(ex.memory || {}).cause, 'outside: the job SIGKILLed from outside ends an error — not «killed: out of memory» off the hub\'s counter (0259f1ea: oom)', { cause: lastRun(j).cause, memory: ex.memory });
  stopEngine(E);
});

// ── ROUND 5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const BOOT = (() => { try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch { return ''; } })();
const procState = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2)[0]; } catch { return ''; } };
const alive = (pid) => !!pid && !['', 'Z', 'X'].includes(procState(pid));
const procsOfCg = (cg) => { try { return fs.readFileSync(`/sys/fs/cgroup${cg}/cgroup.procs`, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
const deadPid = () => Number(String(spawnSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout).trim());
const exitOf = (j) => path.join(ctlOf(j), 'exit.json');
const leftPids = (j) => ((/left ([\d ]+)/.exec(fs.readFileSync(lastRun(j).log, 'utf8')) || [])[1] || '').trim().split(/\s+/).filter(Boolean).map(Number);
const journal = (E, j, re) => E.events.some((e) => e.jobId === j.id && re.test(e.what || ''));
// a run a hub left behind, written by hand (the reviewer's df2 shape): its wrapper gone (a dead pid stamp), its bound naming a scope
const deadRun = (dir, job, b, exit) => {
  const ctl = path.join(dir, 'job-logs', job.id, String(job.runs[0].startedAt));
  fs.mkdirSync(ctl, { recursive: true });
  job.runs[0].log = path.join(ctl, 'current.log');
  fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid: deadPid(), starttime: 1, bootId: BOOT, startedAt: job.runs[0].startedAt }));
  fs.writeFileSync(path.join(ctl, 'bound.json'), JSON.stringify(b));
  if (exit) fs.writeFileSync(path.join(ctl, 'exit.json'), JSON.stringify(exit));
  return job;
};

leg('§3 REAL ⑪ a stop\'s GRACE is the stop\'s own — a tick never cuts it short, and a force says its bound (a rung without a scope: a pod\'s)', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the grace leg: no prlimit here'); return; }
  const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 600 } }); // the grace (10 s) is the seam here: 0.6 s
  const g = E.jobs.get(E.create({ kind: 'task', name: 'graceful', cmd: { argv: [NODE, '-e', "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 150)); console.log('ready'); setInterval(() => {}, 1e5)"] }, memoryMb: 1024, owner }, caller).job.id);
  const d = E.jobs.get(E.create({ kind: 'task', name: 'deaf-pod', cmd: { argv: ['sh', '-c', 'trap "" TERM; echo ready; exec sleep 9'] }, memoryMb: 1024, owner }, caller).job.id);
  const ready = (j) => { try { return fs.readFileSync(lastRun(j).log, 'utf8').includes('ready'); } catch { return false; } };
  await until(() => ready(g) && ready(d), 4000, 10);
  const stamps = [E._readStamp(g), E._readStamp(d)], t0 = Date.now(), goneAt = [0, 0], esc = [];
  const e0 = E._escalate.bind(E);
  E._escalate = (...a) => { esc.push(Date.now() - t0); return e0(...a); }; // every kill step the engine takes, and when
  E.stop(g); E.stop(d);
  await sleep(30);
  await E._sweep(); // a tick 30 ms after the stop (b8d2a3a0: its kill step — SIGKILL at once)
  const atTick = esc.length;
  await until(() => { stamps.forEach((s, i) => { if (!goneAt[i] && !E._verifyAlive(s)) goneAt[i] = Date.now() - t0; }); return goneAt.every(Boolean); }, 3000, 5);
  await E._sweep();
  const gx = readJson(exitOf(g)) || {}, dr = lastRun(d);
  ok(atTick === 0, `a tick 30 ms after the stop kills nothing — the engine took no kill step in their grace (b8d2a3a0: the tick's kill step SIGKILLed them at once)`, { atTick, esc });
  ok(gx.code === 0 && !gx.signal && !gx.forced && !lastRun(g).forced && goneAt[0] < 600, `a job that ends gracefully gets to: exit 0 by its own hand ${goneAt[0]} ms after the stop, nothing «by force»`, { gx, goneAt });
  ok(goneAt[1] >= 590 && dr.cause === 'interrupted' && dr.forced === 'stopped by force: it did not end on SIGTERM in 0.6 s — its process group was killed' && journal(E, d, /stopped by force: it did not end on SIGTERM in 0\.6 s/), `a job deaf to SIGTERM is killed when its grace is out (${goneAt[1]} ms) and its end says the bound: «${dr.forced || 'nothing'}» (b8d2a3a0: at the tick, nothing said on a rung without a scope)`, { goneAt, forced: dr.forced });
  stopEngine(E);
});

leg('§3 REAL ⑫ what a job LEAVES running (the ruling of 2026-10-27): a task\'s is stopped and said at once; a service keeps its own until it stops or starts again', async (ok) => {
  const NOHUP = ['sh', '-c', 'nohup sleep 30 >/dev/null 2>&1 & echo "left $!"'];
  const TWO = ['sh', '-c', 'nohup sleep 30 >/dev/null 2>&1 & a=$!; (trap "" TERM; exec sleep 30) >/dev/null 2>&1 & echo "left $a $!"'];
  const gone = (pids, ms = 2000) => until(() => pids.every((p) => !alive(p)), ms, 10);
  const tasks = [];
  // (a) a TASK that nohups a sleeper, in its scope (the cgroup rung): stopped at once (SIGTERM — no force), said
  if (userSystemd) tasks.push((async () => {
    const E = engineIn(scratch())({ memorySample: { stopMs: 150 } });
    const j = E.jobs.get(E.create({ kind: 'task', name: 'nohup-task', cmd: { argv: NOHUP }, memoryMb: 256, owner }, caller).job.id);
    await settle(E, j);
    const ex = readJson(exitOf(j)) || {}, pids = leftPids(j), b = readJson(path.join(ctlOf(j), 'bound.json')) || {}, run = lastRun(j), snap = E.snapshot(j);
    const out = { E, j, ex, pids, run, snap, b, gone: await gone(pids, 500), procs: procsOfCg(b.cgroup) };
    for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { } }
    killScopeOf(b.unit);
    return ['a', out];
  })());
  // (b) a SERVICE that nohups a sleeper (restart never — it stays desired up): kept past the drain bound; its stop stops it
  if (userSystemd) tasks.push((async () => {
    const E = engineIn(scratch())({ memorySample: { stopMs: 150 } });
    const j = E.jobs.get(E.create({ kind: 'service', name: 'nohup-svc', cmd: { argv: NOHUP }, restart: 'never', memoryMb: 256, owner }, caller).job.id);
    await settle(E, j);
    const ex = readJson(exitOf(j)) || {}, pid = leftPids(j)[0], b = readJson(path.join(ctlOf(j), 'bound.json')) || {};
    await sleep(200); // past the drain bound (0.15 s from its end): a task's would be gone
    const kept = alive(pid);
    E.stop(j);
    const stopped = await gone([pid], 1500) && await until(() => journal(E, j, /stopped what its last run left running \(1 process\)/), 500, 10);
    try { process.kill(pid, 'SIGKILL'); } catch { }
    killScopeOf(b.unit);
    return ['b', { E, j, ex, kept, stopped, pid }];
  })());
  // (b2) the owner's START of such a service: what its last run kept is stopped FIRST — the old scope empty at the new spawn
  if (userSystemd) tasks.push((async () => {
    const E = engineIn(scratch())({ memorySample: { stopMs: 150 } });
    const j = E.jobs.get(E.create({ kind: 'service', name: 'nohup-svc-again', cmd: { argv: NOHUP }, restart: 'never', memoryMb: 256, owner }, caller).job.id);
    await settle(E, j);
    const pid1 = leftPids(j)[0], b = readJson(path.join(ctlOf(j), 'bound.json')) || {}, first = lastRun(j).startedAt;
    let atSpawn = null;
    const sp = E._spawn.bind(E);
    E._spawn = (job, trig) => { if (atSpawn === null) atSpawn = procsOfCg(b.cgroup); return sp(job, trig); };
    const st = E.start(j);
    await until(() => lastRun(j).startedAt !== first, 3000, 10);
    E._spawn = sp;
    const firstGone = !alive(pid1);
    await settle(E, j);
    const pid2 = leftPids(j)[0], b2 = readJson(path.join(ctlOf(j), 'bound.json')) || {};
    E.stop(j);
    await gone([pid2], 1500);
    for (const p of [pid1, pid2]) { try { process.kill(p, 'SIGKILL'); } catch { } }
    killScopeOf(b.unit); killScopeOf(b2.unit);
    return ['b2', { E, j, st, atSpawn, firstGone }];
  })());
  // (c) a TASK on a rung WITHOUT a scope (a pod's): what it left in its process group — one deaf to SIGTERM — is stopped, by force
  if (realOf('prlimit')) tasks.push((async () => {
    const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 150 } });
    const j = E.jobs.get(E.create({ kind: 'task', name: 'two-left-pod', cmd: { argv: TWO }, memoryMb: 1024, owner }, caller).job.id);
    await settle(E, j);
    const pg = E._readStamp(j).pid;
    const ex = readJson(exitOf(j)) || {}, pids = leftPids(j);
    const out = { E, j, ex, pids, gone: await gone(pids, 500), run: lastRun(j) };
    try { process.kill(-pg, 'SIGKILL'); } catch { } // a RED run's leftovers never outlive the suite
    return ['c', out];
  })());
  // (d) a SERVICE on a rung without a scope: kept, named by identity; its stop stops it
  if (realOf('prlimit')) tasks.push((async () => {
    const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 150 } });
    const j = E.jobs.get(E.create({ kind: 'service', name: 'nohup-svc-pod', cmd: { argv: NOHUP }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
    await settle(E, j); // (it ends at once: no `running` to wait for)
    const pg = E._readStamp(j).pid, ex = readJson(exitOf(j)) || {}, pid = leftPids(j)[0];
    await sleep(250);
    const kept = alive(pid);
    E.stop(j);
    const stopped = await gone([pid], 1500) && await until(() => journal(E, j, /stopped what its last run left running/), 500, 10);
    try { process.kill(-pg, 'SIGKILL'); } catch { }
    return ['d', { E, j, ex, pid, kept, stopped }];
  })());
  const R = Object.fromEntries(await Promise.all(tasks));
  const TASK_WORDS = 'the job left 1 process running — it was stopped; to keep a daemon, run it as a service job';
  if (R.a) {
    const { E, j, ex, pids, run, snap } = R.a;
    ok(ex.left && ex.left.n === 1 && !ex.left.force && !ex.left.kept && ex.scopeEmpty === true && R.a.gone && !R.a.procs.length, `a task's nohup'd sleeper: stopped at its end by SIGTERM (no force), the end written on an EMPTY scope (cgroup.procs [${R.a.procs.join(' ')}]) — b8d2a3a0: waited out the bound, killed by force, said in generic words`, { left: ex.left, scopeEmpty: ex.scopeEmpty, pids });
    ok((run.lastLine || '').endsWith(TASK_WORDS) && journal(E, j, new RegExp(`done exit=0 ok .* — ${TASK_WORDS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)) && snap.run.endWords === TASK_WORDS && snap.run.left && snap.run.left.n === 1,
      `said where the job is: its last line, its journal («${TASK_WORDS}»), show / poll and the card (run.left)`, { lastLine: run.lastLine, endWords: snap.run.endWords });
  }
  if (R.b) {
    const { E, j, ex } = R.b;
    ok(ex.left && ex.left.n === 1 && ex.left.kept === true && ex.scopeEmpty === false && R.b.kept && journal(E, j, /it left 1 process running — kept: a service's own until it is stopped or started again/), 'a SERVICE keeps what its run left: its sleeper still runs past the drain bound, said «kept» (b8d2a3a0: killed by force like a task\'s)', { left: ex.left, kept: R.b.kept });
    ok(R.b.stopped, 'its stop stops what its last run kept, said', R.b.pid);
  }
  if (R.b2) {
    const { E, j } = R.b2;
    ok(R.b2.st.ok && Array.isArray(R.b2.atSpawn) && !R.b2.atSpawn.length && R.b2.firstGone && journal(E, j, /stopped what its last run left running \(1 process\)/), `its next start stops what it kept FIRST — the old scope at the new run's spawn: [${(R.b2.atSpawn || []).join(' ')}] — then runs (b8d2a3a0: nothing was kept to stop)`, { atSpawn: R.b2.atSpawn, st: R.b2.st });
  }
  if (R.c) {
    const { E, j, ex, run } = R.c;
    const W2 = 'the job left 2 processes running — they were stopped by force; to keep a daemon, run it as a service job';
    ok(ex.left && ex.left.n === 2 && ex.left.force === true && R.c.gone && /^stopped by force: 1 process it left was still running 0\.15 s after its SIGTERM — killed$/.test(ex.forced || '') && journal(E, j, new RegExp(W2)) && (run.lastLine || '').endsWith(W2),
      `a rung WITHOUT a scope (a pod's): what the task left in its process group is stopped too — the sleeper by SIGTERM, the deaf one by force — and said (b8d2a3a0: both survived, nothing said)`, { left: ex.left, forced: ex.forced, gone: R.c.gone });
  }
  if (R.d) {
    const { E, j, ex } = R.d;
    ok(ex.left && ex.left.kept === true && Array.isArray(ex.left.pids) && ex.left.pids.some((p) => p[0] === R.d.pid) && R.d.kept && R.d.stopped && journal(E, j, /stopped what its last run left running \(1 process\)/), 'a service on a rung without a scope keeps it too — named by identity (pid, start); its stop stops it (b8d2a3a0: kept for ever, its stop reached nothing)', { left: ex.left, kept: R.d.kept, stopped: R.d.stopped });
  }
  if (!R.a && !R.c) { skip++; ok.say('  - SKIP the leftovers legs: neither a user systemd nor prlimit here'); }
  for (const r of Object.values(R)) stopEngine(r.E);
});

leg('§3 REAL ⑬ a service\'s REPLAY awaits the reap of its predecessor\'s scope — never a run started beside what still holds its port', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the replay leg: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), unit = `${PREFIX}-old-${process.pid}`;
  const old = spawn(realOf('systemd-run'), ['--user', '--scope', '--quiet', `--unit=${unit}`, '--', 'sleep', '60'], { detached: true, stdio: 'ignore' });
  old.unref();
  await until(() => scopeProcs(`${unit}.scope`).length === 1, 3000, 10);
  const cg = String(spawnSync(CTL, ['--user', 'show', '-p', 'ControlGroup', '--value', `${unit}.scope`], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
  // the record a hub left: the service up, its wrapper gone, its bound naming the old scope (its job still in it), no exit record
  const startedAt = Date.now() - 60000;
  const job = deadRun(dir, { id: 'jb-replay01', name: 'replayed', kind: 'service', cmd: { argv: ['sleep', '30'] }, state: 'up', desiredUp: true, restart: 'always', memoryMb: 256, supervise: { consecutiveFails: 0, parkedAt: null }, owner, access: { view: 'group', control: 'session' }, runs: [{ startedAt, trigger: 'manual' }], createdAt: startedAt },
    { by: 'cgroup', mb: 256, askedMb: 256, confirmed: true, maxBytes: 256 * MiB, unit: `${unit}.scope`, cgroup: cg }, null);
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([job]));
  const E = new JobManager({ dataDir: dir, broadcast: () => { }, notifyUser: (n) => said.push({ ...n, text: String(n.words.key).replace(/\{(\w+)\}/g, (m, k) => (n.words.params && n.words.params[k] !== undefined ? String(n.words.params[k]) : m)), i18n: { text: n.words } }), log: (...a) => logs.push(a.join(' ')), memoryUnitPrefix: PREFIX, memoryLimitDir: NO_LIMIT });
  let atSpawn = null;
  const sp = E._spawn.bind(E);
  E._spawn = (j, trig) => { if (atSpawn === null) atSpawn = procsOfCg(cg); return sp(j, trig); };
  E.init();
  for (const t of E._timers) clearInterval(t);
  E._timers = []; engines.push(E);
  const j = E.jobs.get(job.id);
  await until(() => lastRun(j).startedAt !== startedAt, 3000, 10);
  ok(Array.isArray(atSpawn) && !atSpawn.length && lastRun(j).trigger === 'boot' && journal(E, j, /stopped by force: its wrapper was gone and its scope still held 1 process — its scope was killed/),
    `the boot replays the service once its predecessor's scope is EMPTY — oldScopeProcsAtSpawn ${atSpawn ? atSpawn.length : '?'} (b8d2a3a0: 1 — the new run started while the old job held its port)`, { atSpawn, trigger: lastRun(j).trigger });
  await running(E, j);
  E.stop(j);
  await until(() => !E._verifyAlive(E._readStamp(j)), 2000, 10);
  killScopeOf(`${unit}.scope`);
  stopEngine(E);
});

leg('§3 REAL ⑭ one flag, one meaning — a job SIGKILLed ALONE mid-stop killed no scope: what it left is still drained, the end written on an empty scope, its words say which kill (round 7: driven by STATE — the kill lands once the wrapper is SEEN holding the stop, inside a 1 s grace; 336761e5 slept 50 ms into a 0.15 s window: red under a second copy 0.25 s apart, 5 of 5)', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the two-facts leg: no user systemd with a memory controller answers here'); return; }
  const one = async (argv, procs) => {
    const E = engineIn(scratch())({ memorySample: { stopMs: 1000 } });
    E._graceMs = () => 5000; // this leg reads the WRAPPER's drain: the engine's own kill step stays out of its window
    const j = E.jobs.get(E.create({ kind: 'task', name: 'killed-alone', cmd: { argv }, memoryMb: 256, owner }, caller).job.id);
    await running(E, j);
    const b = readJson(path.join(ctlOf(j), 'bound.json')) || {}, st = E._readStamp(j);
    await until(() => procsOfCg(b.cgroup).length >= procs, 3000, 5); // the job and what it started, in its scope
    const main = Number(fs.readFileSync(`/proc/${st.pid}/task/${st.pid}/children`, 'utf8').trim().split(/\s+/)[0]);
    const t0 = Date.now();
    E.stop(j);
    const heard = await until(() => fs.readFileSync(lastRun(j).log, 'utf8').includes('[job-wrapper] stop: SIGTERM'), 3000, 5); // the wrapper HOLDS the stop — its own line
    const gap = Date.now() - t0;
    try { process.kill(main, 'SIGKILL'); } catch { } // an agent's kill -9 of the job alone, mid-stop
    let atExit = null;
    await until(() => { if (fs.existsSync(exitOf(j))) { atExit = procsOfCg(b.cgroup); return true; } return false; }, 5000, 5);
    const ex = readJson(exitOf(j)) || {};
    killScopeOf(b.unit);
    await until(() => !E._verifyAlive(st), 2000, 10);
    stopEngine(E);
    return { ex, atExit: atExit || ['?'], gap, heard };
  };
  const [A, B] = await Promise.all([one(['sh', '-c', 'trap "" TERM; (exec sleep 9) & exec sleep 9'], 2), one(['sh', '-c', 'trap "" TERM; exec sleep 9'], 1)]);
  ok(A.heard && A.ex.signal === 'SIGKILL' && A.ex.scopeEmpty === true && !A.atExit.length && A.ex.forced === 'stopped by force: 1 process was still in its scope 1 s after the stop — its scope was killed',
    `its child deaf to the stop is still drained — the end written on an EMPTY scope (cgroup.procs at exit.json: [${A.atExit.join(' ')}]), «${A.ex.forced || 'no force'}»; the kill ${A.gap} ms after the stop, once the wrapper said it holds it (b8d2a3a0: written while the child ran, «it did not end on SIGTERM — its scope was killed»)`, { ex: A.ex, atExit: A.atExit, gap: A.gap, heard: A.heard });
  ok(B.heard && B.ex.signal === 'SIGKILL' && !B.ex.forced && B.ex.scopeEmpty === true && !B.atExit.length, `nothing left: no «by force» — we killed nothing (the kill ${B.gap} ms after the stop; b8d2a3a0: «${'it did not end on SIGTERM — its scope was killed'}» for a kill that was not ours)`, { ex: B.ex, gap: B.gap });
});


// ── ROUND 6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const GATE_KEEP_SRC = ((/^const GATE_KEEP = '(.*)';$/m.exec(WRAPPER_SRC) || [])[1] || '').replace(/\\'/g, "'"); // the tree's own keeper text
const ready = (j) => { try { return fs.readFileSync(lastRun(j).log, 'utf8').includes('ready'); } catch { return false; } };
const ended = (E, j, ms = 3000) => until(() => fs.existsSync(exitOf(j)) && !E._verifyAlive(E._readStamp(j)), ms, 10);

leg('§3 REAL ㉑ A KILL TIMER BELONGS TO ITS RUN — a service stopped, ended on its SIGTERM and started again at once: the first stop\'s kill step never reaches the new run (a pod\'s rung)', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the stale-timer leg: no prlimit here'); return; }
  const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 300 } }); // the grace (10 s) is the seam: 0.3 s
  const j = E.jobs.get(E.create({ kind: 'service', name: 'web', cmd: { argv: ['sh', '-c', 'echo ready; exec sleep 30'] }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
  await until(() => ready(j), 4000, 10);
  const t0 = Date.now();
  E.stop(j);
  await ended(E, j);
  await E._sweep(); // judged: down
  const st = E.start(j), second = lastRun(j);
  await until(() => ready(j), 3000, 10);
  const stamp2 = E._readStamp(j), startedIn = Date.now() - t0;
  await sleep(Math.max(0, 1600 - (Date.now() - t0))); // past the first stop's grace AND the engine's backstop a second later
  await E._sweep();
  ok(st.ok && E._verifyAlive(stamp2) && lastRun(j) === second && !second.endedAt && !second.forced && !logs.some((l) => l.includes(j.id) && /stopped by force/.test(l)),
    `the new run (started ${startedIn} ms after the stop) still runs past the first stop's grace — no SIGKILL, no «stopped by force» on a run nobody stopped (ef0012b5: killed at 0.3 s, cause error, «it did not end on SIGTERM in 0.3 s — its process group was killed»; b8d2a3a0: killed at 10 s, unsaid)`, { alive: E._verifyAlive(stamp2), cause: second.cause, forced: second.forced });
  E.stop(j); await ended(E, j); await E._sweep();
  stopEngine(E);
});

leg('§3 REAL ㉒ A STOP DRAINS THE GROUP THE WAY AN END DOES — a pod\'s rung: the job ends on its SIGTERM, a member of its group deaf to it is killed at the grace and said (task and service)', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the pod-stop leg: no prlimit here'); return; }
  const DEAF = ['sh', '-c', '(trap "" TERM; exec sleep 30) >/dev/null 2>&1 & echo "left $!"; echo ready; exec sleep 30'];
  const one = async (kind) => {
    const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 300 } });
    const j = E.jobs.get(E.create({ kind, name: `deaf-left-${kind}`, cmd: { argv: DEAF }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
    await until(() => ready(j), 4000, 10);
    const pid = leftPids(j)[0], pg = E._readStamp(j).pid;
    E.stop(j);
    await ended(E, j);
    const survived = alive(pid); // the moment the wrapper is gone — nothing else will reach it after this
    await E._sweep();
    const out = { E, j, kind, pid, survived, ex: readJson(exitOf(j)) || {}, run: lastRun(j), snap: E.snapshot(j) };
    try { process.kill(-pg, 'SIGKILL'); } catch { } try { process.kill(pid, 'SIGKILL'); } catch { } // a RED run's survivor never outlives the suite
    return out;
  };
  const [T, S] = await Promise.all([one('task'), one('service')]);
  ok(!T.survived && T.ex.stop === 'SIGTERM' && T.ex.left && T.ex.left.n === 1 && T.ex.left.force === true && T.run.cause === 'interrupted' && T.snap.run.endWords === 'the job left 1 process running — it was stopped by force; to keep a daemon, run it as a service job' && journal(T.E, T.j, /it was stopped by force; to keep a daemon/),
    `a task: the deaf member is gone when its wrapper ends — exit.json left ${JSON.stringify(T.ex.left)}, «${T.snap.run.endWords}» (ef0012b5 and b8d2a3a0: it survived the stop for ever, no left, no forced)`, { survived: T.survived, left: T.ex.left, forced: T.ex.forced });
  ok(!S.survived && S.ex.left && S.ex.left.kept === true && S.ex.left.cleared > 0 && /^it left 1 process running — stopped at \d\d:\d\d$/.test(S.snap.run.endWords || '') && S.j.state === 'down',
    `a service: what it kept is its own, stopped WITH it — recorded the way an end records it (kept, by identity) and «${S.snap.run.endWords}» (ef0012b5: it survived, unsaid)`, { survived: S.survived, left: S.ex.left, end: S.snap.run.endWords });
  stopEngine(T.E); stopEngine(S.E);
});

leg('§3 REAL ㉓ THE RECORD SAYS WHAT IT COULD NOT SEE — a process that left the job\'s group (setsid) on a pod\'s rung: a task\'s said, not stopped; a service keeps it and its stop stops it', async (ok) => {
  if (!realOf('prlimit') || !realOf('setsid')) { skip++; ok.say('  - SKIP the setsid leg: no prlimit or setsid here'); return; }
  const ESC = ['sh', '-c', 'setsid sleep 30 >/dev/null 2>&1 </dev/null & echo "left $!"'];
  const one = async (kind) => {
    const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 150 } });
    const j = E.jobs.get(E.create({ kind, name: `escaped-${kind}`, cmd: { argv: ESC }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
    await settle(E, j);
    const pid = leftPids(j)[0], ex = readJson(exitOf(j)) || {}, snap = E.snapshot(j), run = lastRun(j);
    const aliveAtEnd = alive(pid);
    let stopped = null;
    if (kind === 'service') { E.stop(j); stopped = await until(() => !alive(pid), 1500, 10) && await until(() => journal(E, j, /stopped what its last run left running \(1 process\)/), 500, 10); }
    try { process.kill(pid, 'SIGKILL'); } catch { } // (the suite's own: never outlives it)
    return { E, j, pid, ex, snap, run, aliveAtEnd, stopped };
  };
  const [T, S] = await Promise.all([one('task'), one('service')]);
  const W = '1 process left its group — not stopped; run it as a service job';
  ok(T.ex.left && T.ex.left.n === 0 && T.ex.left.escaped === 1 && T.aliveAtEnd && T.snap.run.endWords === W && (T.run.lastLine || '').endsWith(W) && journal(T.E, T.j, new RegExp(W)),
    `a task: what left its group is found by the job's mark in its environ and SAID — «${T.snap.run.endWords}», left ${JSON.stringify(T.ex.left)} (ef0012b5: nothing — the record could not see it and said nothing)`, { left: T.ex.left, end: T.snap.run.endWords });
  ok(S.ex.left && S.ex.left.kept === true && S.ex.left.escaped === 1 && S.ex.left.pids && S.ex.left.pids.some((p) => p[0] === S.pid) && S.stopped,
    `a service keeps it with the rest (by identity — «${S.snap.run && S.snap.run.endWords}») and its stop stops it, said (ef0012b5: never kept, its stop never reached it)`, { left: S.ex.left, stopped: S.stopped });
  stopEngine(T.E); stopEngine(S.E);
});

leg('§3 REAL ㉔ THE CLEAR SCANS THE GROUP AT CLEAR TIME — a kept process that forks after its run\'s record: its stop stops the child too (a pod\'s rung)', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the fork-after-record leg: no prlimit here'); return; }
  const dir = scratch(), late = path.join(dir, 'late.pid');
  const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 150 } });
  const FORK = ['sh', '-c', `(sleep 0.3; sleep 30 & echo $! > ${late}; wait) >/dev/null 2>&1 </dev/null & echo "left $!"`];
  const j = E.jobs.get(E.create({ kind: 'service', name: 'forks-later', cmd: { argv: FORK }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
  await settle(E, j);
  const parent = leftPids(j)[0], ex = readJson(exitOf(j)) || {};
  await until(() => fs.existsSync(late) && Number(fs.readFileSync(late, 'utf8')) > 1, 2000, 10);
  const child = Number(fs.readFileSync(late, 'utf8'));
  const recordedChild = ((ex.left && ex.left.pids) || []).some((p) => p[0] === child);
  E.stop(j);
  const gone = await until(() => !alive(parent) && !alive(child), 1500, 10) && await until(() => journal(E, j, /stopped what its last run left running/), 500, 10);
  for (const p of [parent, child]) { try { process.kill(p, 'SIGKILL'); } catch { } }
  ok(!recordedChild && gone && journal(E, j, /stopped what its last run left running \(\d+ process(es)?\)/), `the child forked after the record (pid ${child}, not in its rows) is stopped with its parent — the group is read again at clear time (ef0012b5: the recorded list alone — the child ran on, unsaid)`, { recordedChild, gone, child: alive(child) });
  stopEngine(E);
});

leg('§3 REAL ㉕ THE KEEPER IS KNOWN BY ITS PID — a child of the job\'s carrying the gate\'s exact command line is what the job left, never the keeper (< 253: a fake 252 over the real manager)', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the keeper-identity leg: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), ctl = realOf('systemctl'), run0 = realOf('systemd-run');
  fake(dir, 'systemctl', FAKE_CTL_252(ctl));
  fake(dir, 'systemd-run', `${REFUSE_OOMPOLICY}\nexec ${run0} -p OOMPolicy=continue "$@"`);
  const E = engineIn(dir)({ memorySample: { stopMs: 150 } });
  // an impostor: `sh -c <the gate's keeper text> sh`, its fd 3 a fifo it holds both ends of — it waits in `read` for ever
  const IMP = ['sh', '-c', 'f=$(mktemp -u); mkfifo "$f"; sh -c "$1" sh 3<>"$f" & echo "left $!"; sleep 0.1; rm -f "$f"', 'sh', GATE_KEEP_SRC];
  const j = E.jobs.get(E.create({ kind: 'task', name: 'impostor', cmd: { argv: IMP }, memoryMb: 256, owner }, caller).job.id);
  await settle(E, j);
  const ex = readJson(exitOf(j)) || {}, run = lastRun(j), b = readJson(path.join(ctlOf(j), 'bound.json')) || {}, imp = leftPids(j)[0];
  ok(b.by === 'cgroup' && /systemd 252/.test(b.why || '') && GATE_KEEP_SRC && ex.left && ex.left.n === 1 && !ex.forced && !alive(imp) && ex.scopeEmpty === true && (run.lastLine || '').endsWith('the job left 1 process running — it was stopped; to keep a daemon, run it as a service job'),
    `the impostor is what the job LEFT — stopped by its SIGTERM and said; no «after the stop» for an end with no stop (ef0012b5: taken for the keeper by its command line, then «${'1 process was still in its scope 0.15 s after the stop — its scope was killed'}»)`, { left: ex.left, forced: ex.forced, lastLine: run.lastLine });
  try { process.kill(imp, 'SIGKILL'); } catch { }
  killScopeOf(b.unit);
  stopEngine(E);
});

leg('§3 REAL ㉖ A RECORD PAST ITS BOUND SAYS SO — a service that leaves 70 processes on a pod\'s rung: «64 of 70 recorded», and its stop stops all 70', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the 70-process leg: no prlimit here'); return; }
  const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 150 } });
  const MANY = ['sh', '-c', 'i=0; while [ $i -lt 70 ]; do sleep 30 >/dev/null 2>&1 </dev/null & i=$((i+1)); done; echo ready'];
  const j = E.jobs.get(E.create({ kind: 'service', name: 'seventy', cmd: { argv: MANY }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
  await settle(E, j);
  const ex = readJson(exitOf(j)) || {}, pg = E._readStamp(j).pid, snap = E.snapshot(j);
  const inGroup = () => fs.readdirSync('/proc').filter((e) => /^\d+$/.test(e)).filter((e) => { try { const s = fs.readFileSync(`/proc/${e}/stat`, 'utf8'); const r = s.slice(s.lastIndexOf(')') + 2).split(' '); return Number(r[2]) === pg && r[0] !== 'Z'; } catch { return false; } });
  const before = inGroup().length;
  E.stop(j);
  const gone = await until(() => !inGroup().length, 2000, 20) && await until(() => journal(E, j, /stopped what its last run left running/), 500, 10);
  const n = inGroup().length;
  for (const p of inGroup()) { try { process.kill(Number(p), 'SIGKILL'); } catch { } }
  ok(ex.left && ex.left.n === 70 && ex.left.pids.length === 64 && ex.left.recorded === 64 && /\(64 of 70 recorded\)$/.test(snap.run.endWords || ''), `the record names 64 of the 70 it left, and says so — «${snap.run.endWords}» (ef0012b5: «it left 70 processes running — kept…», 64 named, the rest unsaid)`, ex.left && { n: ex.left.n, pids: ex.left.pids.length, recorded: ex.left.recorded });
  ok(before === 70 && gone && journal(E, j, /stopped what its last run left running \(70 processes\)/), `its stop stops all ${before} (the group read at clear time): ${n} left (ef0012b5: 6 survived)`, { before, after: n });
  stopEngine(E);
});

leg('§3 REAL ㉗ A REAP THAT DID NOT FINISH IS ALWAYS RETRIED — the boot meets a busy threadpool (this scope\'s read AND kill held past their bound): a later tick reaps a real scope, said', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the boot-reap leg: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), unit = `${PREFIX}-boot-${process.pid}`;
  const old = spawn(realOf('systemd-run'), ['--user', '--scope', '--quiet', `--unit=${unit}`, '--', 'sleep', '60'], { detached: true, stdio: 'ignore' });
  old.unref();
  await until(() => scopeProcs(`${unit}.scope`).length === 1, 3000, 10);
  const cg = String(spawnSync(CTL, ['--user', 'show', '-p', 'ControlGroup', '--value', `${unit}.scope`], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
  const startedAt = Date.now() - 60000;
  const job = deadRun(dir, { id: 'jb-bootrp01', name: 'boot-reaped', kind: 'task', cmd: { argv: ['sleep', '30'] }, state: 'up', memoryMb: 256, owner, access: { view: 'group', control: 'session' }, runs: [{ startedAt, trigger: 'manual' }], createdAt: startedAt },
    { by: 'cgroup', mb: 256, askedMb: 256, confirmed: true, maxBytes: 256 * MiB, unit: `${unit}.scope`, cgroup: cg }, { code: 0, signal: null, endedAt: Date.now() - 30000 });
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([job]));
  const rr = fs.promises.readFile, rw = fs.promises.writeFile;
  let held = true, release = null;
  const gate = new Promise((r) => { release = r; }); // this scope's reads and writes wait here until the threadpool is free again
  fs.promises.readFile = function (p, ...a) { return String(p).includes(unit) && held ? gate.then(() => rr.call(fs.promises, p, ...a)) : rr.call(fs.promises, p, ...a); };
  fs.promises.writeFile = function (p, ...a) { return String(p).includes(unit) && held ? gate.then(() => rw.call(fs.promises, p, ...a)) : rw.call(fs.promises, p, ...a); };
  let atBoot = null, procsAt = [];
  try {
    const E = new JobManager({ dataDir: dir, broadcast: () => { }, notifyUser: (n) => said.push({ ...n, text: String(n.words.key).replace(/\{(\w+)\}/g, (m, k) => (n.words.params && n.words.params[k] !== undefined ? String(n.words.params[k]) : m)), i18n: { text: n.words } }), log: (...a) => logs.push(a.join(' ')), memoryUnitPrefix: PREFIX, memoryLimitDir: NO_LIMIT, reapReadMs: 50 });
    E.init(); for (const t of E._timers) clearInterval(t); E._timers = []; engines.push(E);
    const j = E.jobs.get(job.id);
    await until(() => E._reapLater.size === 1, 2000, 5); // its read and its kill past their bound (0.05 s each): enqueued
    atBoot = { pending: E._reapLater.size, state: j.state, procs: procsOfCg(cg).length };
    held = false; release(); // the threadpool is free again — the held kill lands (late: still ours, said by the attempt that sees it)
    for (let i = 0; i < 3; i++) { await E._sweep(); await sleep(100); } // later ticks
    procsAt = procsOfCg(cg);
    ok(atBoot.pending === 1 && atBoot.state === 'done' && !procsAt.length && /^stopped by force: its wrapper was gone and its scope (still held 1 process|did not answer a read in 0\.05 s) — its scope was killed$/.test(j.runs[0].forced || '') && journal(E, j, /its scope was killed/),
      `the boot judged it (${atBoot.state}) and its reap, past the bound, ENQUEUED ITSELF (${atBoot.pending}); a later tick reaped the real scope: [${procsAt.join(' ')}] — «${j.runs[0].forced || 'nothing'}» (ef0012b5: dropped — the scope kept its process after three ticks, nothing said; b8d2a3a0 waited for the read)`, { atBoot, after: procsAt, forced: j.runs[0].forced });
    stopEngine(E);
  } finally {
    fs.promises.readFile = rr; fs.promises.writeFile = rw;
    killScopeOf(`${unit}.scope`);
  }
});

leg('§3 REAL ㉘ A KEPT SCOPE\'S STOP UNDER A READ PAST ITS BOUND — SIGTERM blind to what the run recorded, the grace, then force; the words say which (choice 4: a service\'s kept processes get their grace)', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the blind-SIGTERM leg: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), flag = path.join(dir, 'got-term');
  const E = engineIn(dir)({ memorySample: { stopMs: 300 } });
  const KEPT = ['sh', '-c', `(trap 'echo term > ${flag}; kill $s 2>/dev/null; exit 0' TERM; sleep 30 & s=$!; wait $s) >/dev/null 2>&1 </dev/null & echo "left $!"`];
  const j = E.jobs.get(E.create({ kind: 'service', name: 'kept-db', cmd: { argv: KEPT }, restart: 'never', memoryMb: 256, owner }, caller).job.id);
  await settle(E, j);
  const ex = readJson(exitOf(j)) || {}, b = readJson(path.join(ctlOf(j), 'bound.json')) || {}, oldDir = path.join('/sys/fs/cgroup', b.cgroup || '/nowhere'), pid = leftPids(j)[0];
  const real = E._scopeProcs.bind(E);
  E._scopeProcs = (s) => (s.dir === oldDir ? Promise.resolve(null) : real(s)); // this scope's read: past its bound, every time
  E.stop(j);
  const words = await until(() => journal(E, j, /stopped what its last run left running/), 2500, 10);
  const what = (E.events.filter((e) => e.jobId === j.id && /stopped what its last run left running/.test(e.what || ''))[0] || {}).what || '';
  E._scopeProcs = real;
  ok(ex.left && ex.left.kept === true && Array.isArray(ex.left.pids) && ex.left.pids.some((p) => p[0] === pid) && words && fs.existsSync(flag) && /SIGTERM \(sent to what it recorded: its scope did not answer a read\)/.test(what),
    `the kept process got its SIGTERM (it said so) though its scope never answered a read — «${what}» (ef0012b5: no SIGTERM, killed at once, «by force, 10 s after its SIGTERM» — a SIGTERM that was never sent)`, { term: fs.existsSync(flag), what, left: ex.left });
  try { process.kill(pid, 'SIGKILL'); } catch { }
  killScopeOf(b.unit);
  stopEngine(E);
});

leg('§3 REAL ㉙ EVERY START OF A SERVICE WAITS FOR WHAT IS PENDING — the owner\'s start after a dead wrapper\'s reap was deferred never starts beside its old scope', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the manual-start leg: no user systemd with a memory controller answers here'); return; }
  const E = engineIn(scratch())({ memorySample: { stopMs: 300 } });
  const j = E.jobs.get(E.create({ kind: 'service', name: 'svc', cmd: { argv: ['sleep', '60'] }, restart: 'never', memoryMb: 256, owner }, caller).job.id);
  await running(E, j);
  const b1 = readJson(path.join(ctlOf(j), 'bound.json')) || {}, oldDir = path.join('/sys/fs/cgroup', b1.cgroup || '/nowhere');
  const real = E._scopeProcs.bind(E);
  E._scopeProcs = (s) => (s.dir === oldDir ? Promise.resolve(null) : real(s)); // the old scope's read: past its bound
  const st = E._readStamp(j); try { process.kill(st.pid, 'SIGKILL'); } catch { } // the wrapper alone dies; its job stays in its scope
  await until(() => !E._verifyAlive(st), 3000, 10);
  await E._sweep();
  let atSpawn = null;
  const sp = E._spawn.bind(E);
  E._spawn = (job, trig) => { if (atSpawn === null) atSpawn = procsOfCg(b1.cgroup); return sp(job, trig); };
  const r = E.start(j);
  const sync = atSpawn !== null;
  await until(() => atSpawn !== null, 3000, 10);
  E._spawn = sp; E._scopeProcs = real;
  const b2 = readJson(path.join(ctlOf(j), 'bound.json')) || {};
  ok(r.ok && !sync && Array.isArray(atSpawn) && !atSpawn.length, `the start waited for the old scope (its read never answered — killed all the same, its own run's): [${(atSpawn || []).join(' ')}] at the new spawn (ef0012b5: spawned at once, beside it — both scopes held a sleep)`, { answer: r, sync, atSpawn });
  await running(E, j);
  E.stop(j); await ended(E, j); await E._sweep();
  for (const u of [b1.unit, b2.unit]) killScopeOf(u);
  stopEngine(E);
});

// ── ROUND 7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
leg('§3 REAL ㉟ A STOP\'S INTENT IS WRITTEN BEFORE ITS SIGNAL — a pod\'s service whose job ends on its SIGTERM before the wrapper\'s own handler runs (the job\'s signal first, the wrapper\'s 0.1 s later): what it left is still stopped with it and said (336761e5: kept, no `cleared` — ㉒ in 1 pair of 12)', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the stop-intent leg: no prlimit here'); return; }
  const DEAF = ['sh', '-c', '(trap "" TERM; exec sleep 30) >/dev/null 2>&1 & echo "left $!"; echo ready; exec sleep 30'];
  const E = engineIn(scratch())({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 300 } });
  const j = E.jobs.get(E.create({ kind: 'service', name: 'intent', cmd: { argv: DEAF }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
  await until(() => ready(j), 4000, 10);
  const pid = leftPids(j)[0], st = E._readStamp(j);
  const main = Number(fs.readFileSync(`/proc/${st.pid}/task/${st.pid}/children`, 'utf8').trim().split(/\s+/)[0]);
  // THE RACE, made certain: the engine's SIGTERM reaches the job first, the wrapper's group 0.1 s later — the wrapper handles its
  // child's end before its own handler runs (the order a busy box gives at random)
  const kg = E._killGroup.bind(E);
  E._killGroup = (jj, sig) => { if (jj !== j || sig !== 'SIGTERM') return kg(jj, sig); try { process.kill(main, 'SIGTERM'); } catch { } setTimeout(() => kg(jj, sig), 100); return true; };
  E.stop(j);
  await ended(E, j);
  const survived = alive(pid), ex = readJson(exitOf(j)) || {};
  await E._sweep();
  const snap = E.snapshot(j);
  ok(!survived && ex.stop === 'SIGTERM' && ex.left && ex.left.kept === true && ex.left.cleared > 0 && /^it left 1 process running — stopped at \d\d:\d\d$/.test(snap.run.endWords || '') && j.state === 'down',
    `the wrapper knew the stop from its intent: what the service left is stopped WITH it at the grace — exit.json left ${JSON.stringify(ex.left && { ...ex.left, pids: undefined })}, «${snap.run.endWords}» (336761e5: kept, no cleared — «kept» until the engine's own clear a tick and a grace later)`, { survived, stop: ex.stop, left: ex.left, end: snap.run.endWords });
  try { process.kill(-st.pid, 'SIGKILL'); } catch { } try { process.kill(pid, 'SIGKILL'); } catch { }
  stopEngine(E);
});

leg('§3 REAL ㊱ A STOP HAS ONE CLOCK — a pod\'s service whose main is deaf to the stop and whose setsid process forks again on its SIGTERM, at the PRODUCTION ratio (the wrapper\'s grace IS the engine\'s, its kill step a second later — no override; 0.1 s, 0.4 s, 2 s and 10 s at once): the setsid process hears the stop with the main, what it forks after gets only what is LEFT of the grace and is said — of what it LEFT, never more than it left — and the wrapper ends — exit.json written, all of it dead — before the engine\'s kill step (e7147b71: a fresh grace at the drain ran to twice the grace, the engine killed the wrapper mid-drain — no exit.json, the escapee alive for ever; 336761e5: SIGTERM and SIGKILL back to back; 63a311ad0: «short» judged by a clock — 10 % of the grace — over every SIGTERM of the run: the escapee our scan reached 30–60 ms into a 0.1 s or 0.4 s grace and its first child, ended before the drain, counted — «short 4» of n 3, the cut of 2.369.364)', async (ok) => {
  if (!realOf('prlimit') || !realOf('setsid')) { skip++; ok.say('  - SKIP the one-clock leg: no prlimit or setsid here'); return; }
  const one = async (grace) => {
    const dir = scratch(), termF = path.join(dir, 'esc.term'), pidF = path.join(dir, 'esc.pid');
    // the escapee starts BEFORE the main ignores TERM (a signal ignored on entry cannot be trapped); it notes each SIGTERM and forks on
    const ESC = `setsid sh -c 'echo $$ > ${pidF}; trap "date +%s%N >> ${termF}" TERM; while :; do sleep 30 & wait $!; done' >/dev/null 2>&1 </dev/null &`;
    const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: grace } }); // ONE grace: the wrapper's and the engine's
    const j = E.jobs.get(E.create({ kind: 'service', name: `deaf-main-${grace}`, cmd: { argv: ['sh', '-c', `${ESC} trap "" TERM; echo ready; exec sleep 60`] }, restart: 'never', memoryMb: 1024, owner }, caller).job.id);
    await until(() => ready(j) && fs.existsSync(pidF), 4000, 10);
    const esc = Number(fs.readFileSync(pidF, 'utf8')), st = E._readStamp(j), step = E._killStepMs();
    const t0 = Date.now();
    E.stop(j);
    let deadAt = 0, exitAt = 0, goneAt = 0;
    while (Date.now() - t0 < grace + 3000) { // the sweep ticks (the engine's ladder) — until the wrapper is gone and the kill step passed
      await sleep(Math.min(250, grace / 4));
      if (!deadAt && !alive(esc)) deadAt = Date.now();
      if (!exitAt && fs.existsSync(exitOf(j))) exitAt = Date.now();
      if (!goneAt && !alive(st.pid)) goneAt = Date.now();
      await E._sweep();
      if (goneAt && Date.now() - t0 > step + 300) break;
    }
    const terms = (() => { try { return fs.readFileSync(termF, 'utf8').trim().split('\n').map((l) => Math.round(Number(l) / 1e6)); } catch { return []; } })();
    const ex = readJson(exitOf(j)) || {}, snap = E.snapshot(j), escAlive = alive(esc);
    try { process.kill(esc, 'SIGKILL'); } catch { } try { process.kill(-st.pid, 'SIGKILL'); } catch { }
    stopEngine(E);
    return { grace, step, termIn: terms.length ? terms[0] - t0 : -1, deadIn: deadAt ? deadAt - t0 : -1, exitIn: exitAt ? exitAt - t0 : -1, goneIn: goneAt ? goneAt - t0 : -1, escAlive, stopBy: ex.stopBy || null, left: ex.left ? { ...ex.left, pids: undefined } : null, end: (snap.run && snap.run.endWords) || '' };
  };
  for (const r of await Promise.all([100, 400, 2000, 10000].map(one))) {
    ok(r.exitIn > 0 && r.exitIn < r.step && r.goneIn > 0 && r.goneIn < r.step && !r.escAlive && r.termIn >= 0 && r.termIn < 300 && r.deadIn >= r.grace * 0.9 && r.deadIn < r.step && r.stopBy === 'engine' && !!r.left && r.left.cleared > 0 && r.left.escaped >= 1 && r.left.short >= 1 && r.left.short < r.left.n && /\(\d+ process(es)? got less than the full grace\)$/.test(r.end),
      `grace ${r.grace / 1000} s, the engine's kill step at ${r.step / 1000} s: the escapee's SIGTERM ${r.termIn} ms after the stop (with the main), its end ${r.deadIn} ms; exit.json at ${r.exitIn} ms, the wrapper gone at ${r.goneIn} ms — before the step; «${r.end}» (e7147b71 at 2 s and 10 s: no exit.json, the escapee alive at the end; 63a311ad0: «short 4» of n 3 — at 0.1 s always, at 0.4 s once the scan passes 40 ms)`, r);
  }
});

leg('§3 REAL ㊶ WHO SIGNALLED WHOM — a pod\'s task whose helper ends cleanly on SIGTERM: its WRAPPER signalled alone (an agent\'s `kill <wrapper pid>`) sends the SIGTERM on to its group; the engine\'s intent with no signal after it (a stop nobody delivered) is delivered by the wrapper; exit.json and the job\'s log say who (e7147b71: the members marked «sent SIGTERM», nothing sent — killed at the grace under words claiming a SIGTERM)', async (ok) => {
  if (!realOf('prlimit')) { skip++; ok.say('  - SKIP the who-signalled leg: no prlimit here'); return; }
  const one = async (how) => {
    const dir = scratch(), termF = path.join(dir, 'member.term'), pidF = path.join(dir, 'member.pid');
    const MEMBER = `sh -c 'echo $$ > ${pidF}; trap "date +%s%N > ${termF}; exit 0" TERM; while :; do sleep 0.1; done' &`;
    const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 2000 } });
    const j = E.jobs.get(E.create({ kind: 'task', name: `who-${how}`, cmd: { argv: ['sh', '-c', `${MEMBER} echo ready; ${how === 'alone' ? 'exec sleep 30' : 'sleep 0.5'}`] }, memoryMb: 1024, owner }, caller).job.id);
    await until(() => ready(j) && fs.existsSync(pidF), 4000, 10);
    const member = Number(fs.readFileSync(pidF, 'utf8')), st = E._readStamp(j), t0 = Date.now();
    if (how === 'alone') process.kill(st.pid, 'SIGTERM'); // the wrapper ALONE — never its group
    else fs.writeFileSync(path.join(ctlOf(j), 'stop.json'), JSON.stringify({ sig: 'SIGTERM', at: t0 })); // the engine's intent; its signal never left
    let goneAt = 0;
    await until(() => { if (!alive(member)) { goneAt = Date.now(); return true; } return false; }, 4000, 5);
    await until(() => fs.existsSync(exitOf(j)) && !alive(st.pid), 4000, 10);
    const termAt = (() => { try { return Math.round(Number(fs.readFileSync(termF, 'utf8').trim()) / 1e6); } catch { return 0; } })();
    const ex = readJson(exitOf(j)) || {}, said = (fs.readFileSync(lastRun(j).log, 'utf8').match(/\[job-wrapper\] stop: [^\n]*/) || [''])[0];
    try { process.kill(member, 'SIGKILL'); } catch { } try { process.kill(-st.pid, 'SIGKILL'); } catch { }
    stopEngine(E);
    return { how, heardIn: termAt ? termAt - t0 : -1, goneIn: goneAt ? goneAt - t0 : -1, stopBy: ex.stopBy || null, left: ex.left || null, forced: ex.forced || null, said };
  };
  const [A, I] = await Promise.all([one('alone'), one('intent')]);
  ok(A.heardIn >= 0 && A.heardIn < 300 && A.goneIn >= 0 && A.goneIn < 600 && A.stopBy === 'signal' && !A.forced && !(A.left && A.left.force) && /\(a signal to the wrapper alone — the wrapper signals its group\)$/.test(A.said),
    `the wrapper signalled alone: its helper heard SIGTERM ${A.heardIn} ms after and ended cleanly — «${A.said}», stopBy ${A.stopBy}, nothing by force (e7147b71: no SIGTERM ever, killed at the grace — «… after its SIGTERM — killed»)`, A);
  ok(I.heardIn >= 0 && I.heardIn < 1500 && I.stopBy === 'intent' && !I.forced && !(I.left && I.left.force) && /\(the engine's stop never reached its group — the wrapper signals it; its main process had already ended\)$/.test(I.said),
    `an intent with no signal after it: the wrapper delivers it — the helper heard SIGTERM ${I.heardIn} ms after the intent (the job ended at 0.5 s; a signal waited for ≤ 0.5 s), stopBy ${I.stopBy}; round 10: its main had ended — said, never signalled by pid (e7147b71: marked, never sent — killed at the grace)`, I);
});

leg('§3 REAL ㊷ UNKNOWN BLOCKS A SPAWN — a live service on the cgroup rung whose pid.json the next boot can never read: its replay never starts beside it, said, ONE For-you notice; its scope keeps its process (e7147b71: «did not answer» of a scope that answered — two wrappers, two scopes)', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the unknown-blocks leg: no user systemd with a memory controller answers here'); return; }
  const dir = scratch(), mk = () => engineIn(dir)({ reapReadMs: 50, reapTries: 3, reapConfirmMs: 50, memorySample: { stopMs: 500 } });
  const E = mk();
  const j = E.jobs.get(E.create({ kind: 'service', name: 'live-unread', cmd: { argv: ['sh', '-c', 'echo ready; exec sleep 60'] }, memoryMb: 256, restart: 'never', owner }, caller).job.id);
  await running(E, j);
  const b = readJson(path.join(ctlOf(j), 'bound.json')) || {}, st = E._readStamp(j), pj = path.join(ctlOf(j), 'pid.json');
  E.shutdown(); // the hub goes; the service runs on
  fs.renameSync(pj, pj + '.away'); // the next boot cannot read it — and never will
  const E2 = mk(), j2 = E2.jobs.get(j.id);
  for (let i = 0; i < 12; i++) { await E2._sweep(); await sleep(100); }
  const notes = said.filter((n) => n.jobId === j.id && /cannot prove the previous run is gone/.test(n.text || '')), procs = procsOfCg(b.cgroup);
  const words = E2.events.filter((e) => e.jobId === j.id && /^cannot prove the previous run is gone \(pid\.json unreadable\) — not restarted; if it is gone: systemctl --user kill --signal=KILL /.test(e.what || '')).length;
  ok(j2.runs.length === 1 && E2._verifyAlive(st) && procs.length >= 1 && words === 1 && notes.length === 1 && !E2.events.some((e) => e.jobId === j.id && /did not answer/.test(e.what || '')),
    `the live run stays the only one (runs ${j2.runs.length}, its wrapper alive, its scope ${procs.length} process${procs.length === 1 ? '' : 'es'}); said once, ONE notice (e7147b71: a second run, trigger boot — two scopes)`, { runs: j2.runs.length, procs, words, notes: notes.length });
  try { process.kill(-st.pid, 'SIGKILL'); } catch { }
  killScopeOf(b.unit);
  stopEngine(E2);
});

leg('§3 REAL ㊸ A SIGNAL GOES TO A PROVEN IDENTITY — a pod\'s task whose MAIN left the wrapper\'s process group (`setsid` execs in place): the engine\'s stop signals the wrapper\'s group, the wrapper finds its main outside it and signals it itself; it ends cleanly, the record names the sender (887e8d66: the main never heard a SIGTERM — SIGKILLed at the grace under «did not end on SIGTERM», none sent)', async (ok) => {
  if (!realOf('prlimit') || !realOf('setsid')) { skip++; ok.say('  - SKIP the setsid-main leg: no prlimit or setsid here'); return; }
  const dir = scratch(), termF = path.join(dir, 'main.term');
  const E = engineIn(dir)({ memoryRungs: ['rlimit-data'], memorySample: { stopMs: 2000 } });
  const j = E.jobs.get(E.create({ kind: 'task', name: 'setsid-main', cmd: { argv: ['setsid', 'sh', '-c', `trap 'date +%s%N > ${termF}; exit 0' TERM; echo ready; while :; do sleep 0.1; done`] }, memoryMb: 1024, owner }, caller).job.id);
  await until(() => ready(j), 4000, 10);
  const st = E._readStamp(j), main = Number((() => { try { return fs.readFileSync(`/proc/${st.pid}/task/${st.pid}/children`, 'utf8').trim().split(/\s+/)[0]; } catch { return 0; } })());
  const mainPgrp = (() => { try { const t = fs.readFileSync(`/proc/${main}/stat`, 'utf8'); return Number(t.slice(t.lastIndexOf(')') + 2).split(' ')[2]); } catch { return 0; } })();
  const t0 = Date.now();
  E.stop(j);
  await until(() => fs.existsSync(exitOf(j)) && !alive(st.pid), 5000, 10);
  const termAt = (() => { try { return Math.round(Number(fs.readFileSync(termF, 'utf8').trim()) / 1e6); } catch { return 0; } })();
  const ex = readJson(exitOf(j)) || {}, said = (fs.readFileSync(lastRun(j).log, 'utf8').match(/\[job-wrapper\] stop: [^\n]*/) || [''])[0];
  if (alive(main)) { try { process.kill(main, 'SIGKILL'); } catch { } }
  stopEngine(E);
  const R = { main, mainPgrp, wrapper: st.pid, heardIn: termAt ? termAt - t0 : -1, code: ex.code, signal: ex.signal, stopBy: ex.stopBy, mainBy: ex.mainBy, forced: ex.forced || null, said };
  ok(main > 0 && mainPgrp === main && R.heardIn >= 0 && R.heardIn < 1000 && ex.code === 0 && !ex.signal && !ex.forced && ex.stopBy === 'engine' && ex.mainBy === 'wrapper' && /\(the engine signalled its process group; its main process had left that group — the wrapper signals it\)$/.test(said),
    `its main (its own group ${mainPgrp}, the wrapper's ${st.pid}) heard SIGTERM ${R.heardIn} ms after the stop and ended cleanly — code ${ex.code}, stopBy ${ex.stopBy}, mainBy ${ex.mainBy}: «${said}» (887e8d66: never heard — SIGKILL at 2 s, «did not end on SIGTERM»)`, R);
});

leg('§3 REAL ㊹ ONE SIGNAL PER PID PER STOP STEP — a main that cleans up 0.3 s on its first signal and dies on a second: a wrapper signalled alone (SIGINT, SIGTERM) and the engine\'s own stop, on the pod\'s rung and the cgroup rung — each main hears ONE signal and ends cleanly (887e8d66: the pod\'s rung signalled alone — the forward, then the group loop 13 ms later; the cgroup rung — the group\'s signal, then the scope\'s: code 143 mid-cleanup)', async (ok) => {
  const rungs = [...(realOf('prlimit') ? ['rlimit-data'] : []), ...(userSystemd ? ['cgroup'] : [])];
  if (!rungs.length) { skip++; ok.say('  - SKIP the one-signal leg: neither prlimit nor a user systemd here'); return; }
  const SIGMAIN = (f) => `const fs=require('fs'),f=${JSON.stringify(f)},log=(s)=>fs.appendFileSync(f,Date.now()+' '+s+'\\n');let g=false;for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,()=>{log(s);if(g){log('hard-exit');process.exit(143)}g=true;setTimeout(()=>{log('graceful-exit');process.exit(0)},300)});console.log('ready');setInterval(()=>{},1000)`;
  const one = async (rung, how) => {
    const dir = scratch(), f = path.join(dir, 'main.signals'), calls = path.join(dir, 'systemctl.calls');
    // the scope rung: a FAKE manager over the real one (the job's PATH meets it first) — every call the wrapper makes logged, then
    // passed through: the stop step's delivery is pinned by what the wrapper ASKED, not only by what the main lived to hear
    if (rung === 'cgroup') fake(dir, 'systemctl', `printf '%s\\n' "$*" >> ${calls}\nexec ${CTL} "$@"`);
    const E = engineIn(dir)({ memoryRungs: [rung], memorySample: { stopMs: 2000 } });
    const j = E.jobs.get(E.create({ kind: 'task', name: `one-${how}`, cmd: { argv: [NODE, '-e', SIGMAIN(f)] }, memoryMb: 1024, owner }, caller).job.id);
    await until(() => ready(j), 6000, 10);
    const st = E._readStamp(j), b = readJson(path.join(ctlOf(j), 'bound.json')) || {};
    if (how === 'engine') E.stop(j); else process.kill(st.pid, how); // the engine's stop — or the wrapper ALONE
    await until(() => fs.existsSync(exitOf(j)) && !alive(st.pid), 5000, 10);
    const heard = (() => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => l.split(' ')[1]); } catch { return []; } })();
    const ex = readJson(exitOf(j)) || {};
    const scopeKills = (() => { try { return fs.readFileSync(calls, 'utf8').split('\n').filter((l) => /^--user kill --signal=SIG(TERM|INT|HUP) /.test(l)).length; } catch { return 0; } })();
    try { process.kill(-st.pid, 'SIGKILL'); } catch { }
    killScopeOf(b.unit);
    stopEngine(E);
    return { rung: b.by || rung, how, heard: heard.join(','), code: ex.code, stopBy: ex.stopBy || null, mainBy: ex.mainBy || null, scopeKills };
  };
  const R = await Promise.all(rungs.flatMap((r) => (r === 'cgroup' ? ['engine', 'SIGINT'] : ['SIGINT', 'SIGTERM', 'engine']).map((how) => one(r, how))));
  for (const r of R) {
    const sig = r.how === 'engine' ? 'SIGTERM' : r.how;
    ok(r.heard === `${sig},graceful-exit` && r.code === 0 && r.stopBy === (r.how === 'engine' ? 'engine' : 'signal') && r.mainBy === (r.how === 'engine' ? 'engine' : 'wrapper') && !r.scopeKills,
      `${r.rung}, ${r.how === 'engine' ? "the engine's stop" : `${r.how} to the wrapper alone`}: its main heard ${r.heard} — code ${r.code}, stopBy ${r.stopBy}, mainBy ${r.mainBy}${r.rung === 'cgroup' ? `; the scope-wide kill asked of the manager at the stop step: ${r.scopeKills}` : ''} (887e8d66: ${r.rung === 'cgroup' ? `${sig} twice, 3 ms apart — the scope's \`systemctl --user kill --signal=${sig}\` after the group's` : r.how === 'engine' ? 'one (the control)' : `${sig}, then SIGTERM 13 ms later`}${r.rung === 'rlimit-data' && r.how === 'engine' ? '' : ' — code 143 mid-cleanup'})`, r);
  }
});

leg('§3 REAL ㊺ A STOP GOES ONCE — a process that cleans up 0.3 s on its first signal and dies on a second: Stop pressed twice (the second press says «already stopping»); an agent\'s SIGINT to the wrapper, then the person\'s Stop; a Stop while the wrapper drains what an ended task left (the engine signals the wrapper ALONE — its stopping.json); a SIGTERM to the wrapper then — the pod\'s rung and the cgroup rung, the scope rung behind a logging systemctl (8ad58d8b: the engine\'s group signal again, and the drain\'s scope kill unrecorded — code 143 mid-cleanup)', async (ok) => {
  const rungs = [...(realOf('prlimit') ? ['rlimit-data'] : []), ...(userSystemd ? ['cgroup'] : [])];
  if (!rungs.length) { skip++; ok.say('  - SKIP the stop-goes-once leg: neither prlimit nor a user systemd here'); return; }
  const SIGPROC = (f) => `const fs=require('fs'),f=${JSON.stringify(f)},log=(s)=>fs.appendFileSync(f,Date.now()+' '+s+'\\n');let g=false;for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,()=>{log(s);if(g){log('hard-exit');process.exit(143)}g=true;setTimeout(()=>{log('graceful-exit');process.exit(0)},300)});console.log('ready');setInterval(()=>{},1000)`;
  const one = async (rung, how) => {
    const dir = scratch(), f = path.join(dir, 'proc.signals'), calls = path.join(dir, 'systemctl.calls'), prog = path.join(dir, 'proc.js');
    fs.writeFileSync(prog, SIGPROC(f));
    if (rung === 'cgroup') fake(dir, 'systemctl', `printf '%s\\n' "$*" >> ${calls}\nexec ${CTL} "$@"`);
    const E = engineIn(dir)({ memoryRungs: [rung], memorySample: { stopMs: 2000 } });
    const drain = how.startsWith('drain'); // the main ends at 0.4 s leaving the process; the wrapper's drain SIGTERMs it
    const argv = drain ? ['sh', '-c', `(exec ${NODE} ${prog}) & sleep 0.4; exit 0`] : [NODE, prog];
    const j = E.jobs.get(E.create({ kind: 'task', name: `once-${how}`, cmd: { argv }, memoryMb: 1024, owner }, caller).job.id);
    await until(() => ready(j), 6000, 10);
    const st = E._readStamp(j), b = readJson(path.join(ctlOf(j), 'bound.json')) || {}, heard = () => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split(' ')[1]); } catch { return []; } };
    let second = null;
    if (how === 'twice') { E.stop(j); await sleep(150); second = E.stop(j); }
    else if (how === 'agent-person') { process.kill(st.pid, 'SIGINT'); await sleep(50); E.stop(j); }
    else { await until(() => heard().length, 6000, 5); await sleep(100); if (how === 'drain-engine') E.stop(j); else process.kill(st.pid, 'SIGTERM'); } // 100 ms into its cleanup
    await until(() => fs.existsSync(exitOf(j)) && !alive(st.pid), 6000, 10);
    const ex = readJson(exitOf(j)) || {};
    const scopeKills = (() => { try { return fs.readFileSync(calls, 'utf8').split('\n').filter((l) => /^--user kill --signal=SIG(TERM|INT|HUP) /.test(l)).length; } catch { return 0; } })();
    try { process.kill(-st.pid, 'SIGKILL'); } catch { }
    killScopeOf(b.unit);
    stopEngine(E);
    return { rung: b.by || rung, how, heard: heard().join(','), code: ex.code, stopBy: ex.stopBy || null, mainBy: ex.mainBy || null, scopeKills, already: second && second.already };
  };
  const R = await Promise.all(rungs.flatMap((r) => ['twice', 'agent-person', 'drain-engine', 'drain-alone'].map((how) => one(r, how))));
  const want = { twice: ['SIGTERM', 'engine', 'engine'], 'agent-person': ['SIGINT', 'signal', 'wrapper'], 'drain-engine': ['SIGTERM', 'alone', 'ended'], 'drain-alone': ['SIGTERM', 'signal', 'ended'] };
  for (const r of R) {
    const [sig, by, main] = want[r.how];
    ok(r.heard === `${sig},graceful-exit` && r.code === 0 && r.stopBy === by && r.mainBy === main && !r.scopeKills && (r.how !== 'twice' || /^already stopping \(\d+ s left\)$/.test(r.already || '')),
      `${r.rung}, ${{ twice: 'Stop pressed twice', 'agent-person': "an agent's SIGINT, then the person's Stop", 'drain-engine': 'a Stop while it drained what the task left', 'drain-alone': 'a SIGTERM to the wrapper while it drained' }[r.how]}: heard ${r.heard} — code ${r.code}, stopBy ${r.stopBy}, mainBy ${r.mainBy}${r.already ? `, the second press «${r.already}»` : ''}${r.rung === 'cgroup' ? `; scope-wide kills asked: ${r.scopeKills}` : ''} (8ad58d8b: ${sig}, then SIGTERM — code 143 mid-cleanup)`, r);
  }
});

leg('§3 REAL ㊻ THE MAIN IS THE HANDLE THE WRAPPER SPAWNED — once its main is reaped, a stop never reads its pid again: a Stop that races the job\'s own end (the intent, no signal) and a SIGTERM to the wrapper while it drains — the reaped pid made to look reused by a held process (a preload answers /proc/<pid>/stat with the holder\'s, and points a kill of that pid at it); the holder hears nothing, the record says the main had already ended (8ad58d8b: the holder SIGTERMed +0.5 s after the reap, «mainBy wrapper»)', async (ok) => {
  const PRE = `const cp=require('child_process'),fs=require('fs'),LOG=process.env.REUSE_LOG,HOLDER=Number(process.env.REUSE_HOLDER);let main=null,reaped=0;const log=(s)=>{try{fs.appendFileSync(LOG,s+'\\n')}catch{}};
const oS=cp.spawn;cp.spawn=function(...a){const c=oS.apply(this,a);if(!main){main=c;c.on('exit',()=>{reaped=Date.now();log('main-exit '+c.pid)})}return c};
const oR=fs.readFileSync;fs.readFileSync=function(p,...r){if(main&&reaped&&p==='/proc/'+main.pid+'/stat'){log('read-reaped');return oR.call(fs,'/proc/'+HOLDER+'/stat',...r)}return oR.call(fs,p,...r)};
const oK=process.kill;process.kill=function(pid,sig){if(main&&reaped&&pid===main.pid){log('kill-reaped '+sig);return oK.call(process,HOLDER,sig)}return oK.call(process,pid,sig)};`;
  const one = async (how) => {
    const dir = scratch(), ctl = path.join(dir, 'ctl'), pre = path.join(dir, 'reuse.cjs'), logF = path.join(dir, 'reuse.log'); fs.mkdirSync(ctl); fs.writeFileSync(pre, PRE);
    const holder = spawn('sleep', ['30'], { stdio: 'ignore' }); let heard = null; holder.on('exit', (c, sg) => { heard = sg || `code ${c}`; });
    const argv = how === 'intent' ? ['sh', '-c', 'sleep 0.4'] : ['sh', '-c', '(trap "" TERM; exec sleep 3) & sleep 0.2; exit 0'];
    const specPath = path.join(ctl, 'spec.json');
    fs.writeFileSync(specPath, JSON.stringify({ argv, cwd: dir, env: { PATH: process.env.PATH, VIBESPACE_JOB_ID: `jb-reuse-${how}` }, kind: 'task', memory: { mb: 0, askedMb: 0, rungs: [], stopMs: 2000 } }));
    const w = spawn(NODE, ['-r', pre, path.join(dir, 'bin', 'job-wrapper.js'), ctl, specPath, '--proto=' + WRAPPER_PROTO], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, HOME: dir, VIBESPACE_SKIP_AGENT_HOOKS: '1', REUSE_LOG: logF, REUSE_HOLDER: String(holder.pid) } });
    let wEnd = false; w.on('exit', () => { wEnd = true; });
    if (how === 'intent') { await sleep(150); fs.writeFileSync(path.join(ctl, 'stop.json'), JSON.stringify({ sig: 'SIGTERM', at: Date.now() })); } // the engine's intent; its group signal never comes
    else { await until(() => { try { return fs.readFileSync(logF, 'utf8').includes('main-exit'); } catch { return false; } }, 4000, 10); await sleep(300); try { process.kill(w.pid, 'SIGTERM'); } catch { } } // while it drains the deaf leftover
    await until(() => wEnd, 6000, 10); await sleep(100);
    const ex = readJson(path.join(ctl, 'exit.json')) || {}, line = ((() => { try { return fs.readFileSync(path.join(ctl, 'current.log'), 'utf8'); } catch { return ''; } })().match(/\[job-wrapper\] stop: [^\n]*/) || [''])[0];
    const pl = (() => { try { return fs.readFileSync(logF, 'utf8').trim().split('\n'); } catch { return []; } })();
    if (!heard) holder.kill('SIGKILL'); // ours, by its handle
    if (!wEnd) { try { process.kill(-w.pid, 'SIGKILL'); } catch { } }
    return { how, holderHeard: heard, mainBy: ex.mainBy || null, stopBy: ex.stopBy || null, line, kills: pl.filter((l) => l.startsWith('kill-reaped')), reads: pl.filter((l) => l === 'read-reaped').length };
  };
  for (const r of await Promise.all(['intent', 'drain'].map(one))) {
    ok(!r.holderHeard && !r.kills.length && !r.reads && r.mainBy === 'ended' && /its main process had already ended\)$/.test(r.line),
      `${r.how === 'intent' ? 'a Stop racing the job\'s own end' : 'a SIGTERM to the wrapper while it drained'}: the reaped main's pid never read nor signalled — the holder heard ${r.holderHeard || 'nothing'}, mainBy ${r.mainBy}, «${r.line}» (8ad58d8b: the holder SIGTERMed, «mainBy wrapper»)`, r);
  }
});

try {
  await Promise.all(legs.map(async (g) => {
    const rec = (c, n, e) => g.rows.push(['row', c, n, e]);
    rec.say = (line) => g.rows.push(['say', line]);
    try { await g.body(rec); } catch (e) { g.rows.push(['row', false, `${g.title.slice(0, 14)}: the leg threw`, String(e && e.stack || e).slice(0, 400)]); }
  }));
  for (const g of legs) { console.log(g.title); for (const [k, a, b, c] of g.rows) if (k === 'say') console.log(a); else ok(a, b, c); }
} finally {
  // nothing this suite started outlives it — a live job group (a RED run on a base that replays blind) is killed by its stamp
  for (const E of engines) for (const j of E.jobs.values()) { try { const st = E._readStamp(j); if (E._verifyAlive(st)) process.kill(-st.pid, 'SIGKILL'); } catch { } }
  // THIS run's scopes only (round 6): another copy's — a lane's fast tier, a reviewer's — are never listed, counted nor killed
  const left = spawnSync('systemctl', ['--user', 'list-units', '--all', '--no-legend', '--plain', `${PREFIX}-*`], { encoding: 'utf8', timeout: 3000 });
  if (userSystemd) ok(left.status === 0 && !String(left.stdout || '').trim(), `no scope this run made (${PREFIX}-*) outlives it (failed ones are reset by the wrapper that read them)`, String(left.stdout || '').trim());
  for (const l of String(left.stdout || '').split('\n')) killScopeOf(l.trim().split(/\s+/)[0]); // said above, then gone — never left running
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}

console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped (said above)` : ''}`);
process.exit(fail ? 1 : 0);
