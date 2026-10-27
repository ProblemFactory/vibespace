#!/usr/bin/env node
// THE MEMORY BOUND OF A BACKGROUND JOB (lane jobs-memory-bound, F6 of B-7f9e, 2026-10-26). A fleet pod's cgroup has
// memory.oom.group=1: ONE process past the container's limit kills the WHOLE pod, the hub with it (the forensics of
// 2026-10-27: 638 restarts in 74 h) — and nothing bounded a job, nor did a boot ever count a run that died with the pod.
//   §1 PURE  THE LADDER (a job's own › the owner's setting, 0 = unbounded › the cluster's env › 4096), the size verdict
//            (an agent never 0), the rung record, the named end's words — the server's and the card's
//   §2 PURE  THE PARK LAW: an `oom` / `oom-bound` end counts, any other resets, 2 in a row park; THE BOOT'S JUDGE (the
//            wrapper's pressure sample: the instance full and this job holding most of it ⇒ `oom`); the base's
//            arithmetic as the control (onServiceExit never parks a job that dies of memory after a minute)
//   §3 REAL  the wrapper ENFORCES the bound — a tiny job allocating past a small bound under the real data/bin wrapper,
//            spawned by the real engine: ① the cgroup rung (a scope of the user systemd, where one answers — SKIP said
//            elsewhere): 256 MB bound, a 512 MB Buffer ⇒ «stopped: used more than 256 MB», the rung on the run; a stop is
//            still a stop; ② the rlimit rung (forced): RLIMIT_DATA refuses ⇒ the same named end, the rung rlimit-data
//   §4 REAL  the park law through the engine's own doors: a service's oom-bound end (1), its BOOT REPLAY's (2) ⇒ parked,
//            the next boot leaves it alone, the owner's start counts afresh
//   §5 REAL  the boot's judge: the wrapper's pressure sample (a fake cgroup at 95 %), the whole group SIGKILLed (no
//            exit.json — memory.oom.group), the next boot names the end `oom` and counts it; twice ⇒ parked
// RED on 6428c67e (the base): the job grows to 512 MB and ends `exit 0`; no rung, no named end, no park, a boot replays blind.
// Load: each job allocates ≤ 512 MB once (most far less), no busy loop; the four real legs run at once (≤ ~0.4 s, ≤ ~650 MB
// resident together at the peak); scratch dataDirs under os.tmpdir(), one per leg.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const M = require('../src/job-model.js');
const { JobManager } = require('../src/jobs.js');
const L = await import(new URL('../src/lib/jobs-layout.js', import.meta.url));
let pass = 0, fail = 0, skip = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(step); } return false; };
const read = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return ''; } };
const fn = (name) => (typeof M[name] === 'function' ? M[name] : () => ({})); // the base has none of these: its rows go RED, never a throw
const LF = (name) => (typeof L[name] === 'function' ? L[name] : () => '');
const act = (E, m, ...a) => (typeof E[m] === 'function' ? E[m](...a) : {}); // an engine door the base lacks answers nothing
const MiB = 1024 * 1024;

console.log('§1 PURE — THE LADDER, the size verdict, the rung record, the named end');
{
  const of = fn('memoryMbOf');
  const rows = [
    ['nothing set ⇒ 4096 (the default)', of({}, {}), { mb: 4096, source: 'default' }],
    ['the cluster\'s env (a string) ⇒ its value', of({}, { cluster: '2048' }), { mb: 2048, source: 'cluster' }],
    ['the cluster\'s 0 is NOT unbounded (never the default) ⇒ 4096', of({}, { cluster: '0' }), { mb: 4096, source: 'default' }],
    ['the owner\'s setting over the cluster\'s', of({}, { setting: 8192, cluster: '2048' }), { mb: 8192, source: 'setting' }],
    ['the owner\'s explicit 0 = unbounded', of({}, { setting: 0, cluster: '2048' }), { mb: 0, source: 'setting' }],
    ['a job\'s own over every default', of({ memoryMb: 512 }, { setting: 8192, cluster: '2048' }), { mb: 512, source: 'job' }],
    ['an unset setting (undefined) falls through', of({}, { setting: undefined }), { mb: 4096, source: 'default' }],
    ['a broken value (NaN / negative) falls through', of({ memoryMb: -1 }, { setting: NaN, cluster: 'x' }), { mb: 4096, source: 'default' }],
  ];
  for (const [n, got, want] of rows) ok(JSON.stringify(got) === JSON.stringify(want), `ladder: ${n}`, got);
  const v = fn('memoryValueVerdict');
  ok(v('8G').mb === 8192 && v('512M').mb === 512 && v('1.5g').mb === 1536 && v('4096').mb === 4096 && v(2048).mb === 2048 && v('8GB').mb === 8192 && v('2GiB').mb === 2048, 'size: 8G · 512M · 1.5g · 4096 (MB) · 8GB · 2GiB read as MB');
  ok(v('0').ok === false && /owner/.test(v('0').error || '') && v('0', { byUser: true }).ok === true && v('0', { byUser: true }).mb === 0, 'size: 0 (unbounded) is the user\'s alone — an agent is refused by name');
  ok(v('100M').ok === false && v('lots').ok === false && v('-1G').ok === false && /not a size/.test(v('lots').error || ''), 'size: under 256 MB, words, a negative — refused, said');
  const br = fn('boundRecord');
  ok(JSON.stringify(br({ mb: 4096, by: 'cgroup', why: 'scope' })) === JSON.stringify({ mb: 4096, by: 'cgroup', why: 'scope' }) && br({ by: 'teleport' }).by === 'none' && /did not say/.test(br({}).why || ''), 'the rung record: {mb, by, why}; an unknown rung is `none`, said');
  const w = fn('memoryEndWhat');
  ok(w({ cause: 'oom-bound', memoryBound: { mb: 4096 } }) === 'stopped: used more than 4 GB' && /ran out of memory/.test(w({ cause: 'oom' })) && w({ cause: 'error' }) === '', 'the journal\'s named end: «stopped: used more than 4 GB» · the instance\'s OOM · nothing for another end');
  const t = (k, p) => (p ? k.replace(/\{(\w+)\}/g, (_, x) => p[x]) : k);
  const chip = LF('memoryChip'), ends = LF('memoryEndWords');
  ok(chip({ state: 'up', memoryMb: 4096, memoryBound: { mb: 4096, by: 'cgroup' } }, t) === '4 GB · cgroup' && chip({ state: 'up', memoryMb: 4096, memoryBound: { mb: 4096, by: 'rlimit-data' } }, t) === '4 GB · rlimit'
    && chip({ state: 'up', memoryMb: 4096, memoryBound: { mb: 4096, by: 'none', why: 'no rung' } }, t) === 'unbounded — this host cannot enforce a bound' && chip({ state: 'down', memoryMb: 0 }, t) === 'unbounded — set by the owner' && chip({ state: 'down' }, t) === '',
  'the card\'s chip: «4 GB · cgroup» / «4 GB · rlimit» / «unbounded — this host cannot enforce a bound» / the owner\'s 0 / nothing from an older hub');
  ok(ends({ run: { cause: 'oom-bound' }, memoryBound: { mb: 256 } }, t) === 'stopped: used more than 256 MB' && ends({ parkedFor: 'memory', run: { cause: 'oom-bound' } }, t) === 'parked: out of memory twice — raise its bound or fix the job'
    && ends({ run: { cause: 'oom' } }, t) === 'killed: the instance ran out of memory' && ends({ run: { cause: 'ok' } }, t) === '', 'the card\'s named end: the bound, the park first, the instance\'s OOM, nothing else');
  // the words exist in every language the card speaks (the i18n tables carry each key)
  const keys = ['stopped: used more than {size}', 'parked: out of memory twice — raise its bound or fix the job', 'killed: the instance ran out of memory', 'unbounded — this host cannot enforce a bound', '{name}: parked — out of memory twice. Raise its bound or fix the job, then start it again', 'Memory bound of a background job (MB)'];
  for (const lang of ['zh', 'ja']) { const src = read(`src/lib/i18n-${lang}.js`); const miss = keys.filter((k) => !src.includes(JSON.stringify(k) + ':')); ok(!miss.length, `the named end, the park and the setting speak ${lang}`, miss); }
}

console.log('§2 PURE — THE PARK LAW, THE BOOT\'S JUDGE (and the base\'s arithmetic as the control)');
{
  const on = fn('onMemoryEnd');
  const walk = (causes) => { let sup = { consecutiveFails: 0, parkedAt: null }, parkedAt = null; for (const [i, c] of causes.entries()) { const r = on(sup, c, 1000 + i); sup = r.supervise || sup; if (r.park && parkedAt === null) parkedAt = i; } return { parkedAt, sup }; };
  ok(walk(['oom-bound', 'oom-bound']).parkedAt === 1 && walk(['oom-bound', 'oom-bound']).sup.parkedFor === 'memory', 'two oom-bound ends in a row ⇒ parked at the second, by name (parkedFor memory)');
  ok(walk(['oom', 'oom-bound']).parkedAt === 1, 'an `oom` (a kill from outside) counts like its own bound');
  ok(walk(['oom-bound', 'ok', 'oom-bound', 'error', 'oom-bound']).parkedAt === null, 'any other end resets the count — never parked for ends that were not in a row');
  ok(walk(['oom-bound', 'env-restart', 'oom-bound']).parkedAt === null, 'an unattributed restart of the instance resets it too (it was not this job\'s)');
  // the boot replay is no exception: the ends a boot judges go through the SAME function — a boot's `oom` then a sweep's
  ok(walk(['oom' /* the boot's judge */, 'oom-bound' /* the replayed run, judged live */]).parkedAt === 1, 'a BOOT\'s judged end counts exactly like a run\'s (the replay is the second end ⇒ parked)');
  // CONTROL — the base's only law: onServiceExit parks after 6 FAST fails (uptime < 60 s); a job that grows for minutes, then
  // takes the pod down, is restarted forever (and a boot that finds no exit record never calls it at all)
  let sup = { consecutiveFails: 0, parkedAt: null }, basePark = false;
  for (let i = 0; i < 10; i++) { const d = M.onServiceExit({ desiredUp: true, supervise: sup }, { uptimeMs: 5 * 60e3, now: i }); sup = d.supervise; basePark = basePark || !!d.park; }
  ok(basePark === false, 'CONTROL: the base\'s arithmetic never parks a service that dies of memory after five minutes, ten times running');
  const judge = fn('bootEndCause');
  ok(judge({ at: 9, jobMb: 30000, usedMb: 33000, limitMb: 32768 }).cause === 'oom' && judge({ at: 9, jobMb: 30000, usedMb: 33000, limitMb: 32768 }).jobMb === 30000, 'boot judge: the instance at its limit and THIS job holding most of it ⇒ `oom`');
  ok(judge({ jobMb: 57, usedMb: 33000, limitMb: 32768 }).cause === 'env-restart', 'boot judge: full, but the job held 57 MB (an innocent web service beside the runaway) ⇒ not this job\'s — env-restart');
  ok(judge({ jobMb: 9000, usedMb: 10000, limitMb: 32768 }).cause === 'env-restart' && judge(null).cause === 'env-restart' && judge({ jobMb: 9, usedMb: 9 }).cause === 'env-restart', 'boot judge: far from the limit, no sample, no limit ⇒ env-restart (the base\'s word)');
}

// ── the real engine over scratch dataDirs (one per leg), the worktree's REAL wrapper copied in (as test-jobs-engine does).
// The four REAL legs are independent (a dataDir, a lock and engines of their own) and run AT ONCE; their rows print in order.
const PREFIX = 'jobs-memory-bound-test'; // every scope this suite makes is named so — and none outlives it (asserted at the end)
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
const engineIn = (dir) => (extra = {}) => {
  const E = new JobManager({ dataDir: dir, broadcast: () => { }, notifyUser: (n) => said.push(n), log: (...a) => logs.push(a.join(' ')), memoryUnitPrefix: PREFIX, ...extra });
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
const settle = async (E, j) => { const done = await until(() => fs.existsSync(path.join(ctlOf(j), 'exit.json')) && !E._verifyAlive(E._readStamp(j)), 8000, 10); await E._sweep(); return done; };
const lastRun = (j) => j.runs[j.runs.length - 1] || {};
const NODE = process.execPath;
const GROW = 'const b=Buffer.alloc(512*1024*1024,1); console.log("survived", b.length)';                     // touches 512 MB (the cgroup leg)
const RESERVE = 'const a=Buffer.allocUnsafe(512*1024*1024), b=Buffer.allocUnsafe(512*1024*1024); console.log("survived", a.length + b.length)'; // maps 1 GB, touches ~0 (RLIMIT_DATA counts the mapping)
const userSystemd = (() => { const r = spawnSync('systemctl', ['--user', 'show', '-p', 'ControlGroup', '--value'], { encoding: 'utf8', timeout: 3000 }); const cg = r.status === 0 ? String(r.stdout).trim() : ''; try { return cg && /\bmemory\b/.test(fs.readFileSync(`/sys/fs/cgroup${cg}/cgroup.controllers`, 'utf8')); } catch { return false; } })();
const legs = [];
const leg = (title, body) => legs.push({ title, body, rows: [] });

leg('§3 REAL ① the cgroup rung — the wrapper enforces the bound and names the end', async (ok) => {
  if (!userSystemd) { skip++; ok.say('  - SKIP the cgroup rung: no user systemd with a memory controller answers here (a fleet pod, a CI runner) — the rlimit rung (②) is this host\'s'); return; }
  const A = engineIn(scratch())();
  const r = A.create({ kind: 'task', name: 'grow', cmd: { argv: [NODE, '-e', GROW] }, memoryMb: 256, owner }, caller);
  const j = A.jobs.get(r.job && r.job.id);
  ok(!!j && lastRun(j).memoryMb === 256, 'cgroup: a job created with memory 256 runs asking 256 MB', r.error);
  // a stop is still a stop: the scope holds the job, the engine's group kill still reaches it (started beside the first)
  const r2 = A.create({ kind: 'task', name: 'sleeper', cmd: { argv: ['sleep', '30'] }, memoryMb: 256, owner }, caller);
  const j2 = A.jobs.get(r2.job && r2.job.id);
  await settle(A, j);
  const run = lastRun(j), ex = JSON.parse(fs.readFileSync(path.join(ctlOf(j), 'exit.json'), 'utf8'));
  ok(run.cause === 'oom-bound' && j.state === 'failed', `cgroup: 256 MB bound, a 512 MB Buffer ⇒ the job ends oom-bound, failed (base: grows to 512 MB, exit 0)`, { cause: run.cause, state: j.state, exit: run.exit });
  ok(run.memoryBound && run.memoryBound.by === 'cgroup' && run.memoryBound.mb === 256, 'cgroup: the run carries the rung it MEASURED — {mb 256, by cgroup, why}', run.memoryBound);
  ok(ex.memory && ex.memory.confirmed === true && ex.memory.maxBytes === 256 * MiB && /oom-kill/.test(ex.memory.how || ''), 'cgroup: the wrapper saw the child IN its scope at memory.max 256 MiB, and the scope\'s Result oom-kill ended it', ex.memory);
  ok(A.events.some((e) => e.jobId === j.id && /stopped: used more than 256 MB/.test(e.what || '')) && logs.some((l) => l.includes(j.id) && /stopped: used more than 256 MB/.test(l)), 'cgroup: the job\'s journal and the server\'s log name the end «stopped: used more than 256 MB»');
  ok(/stopped: used more than 256 MB/.test(run.lastLine || ''), 'cgroup: the card\'s last line names it too (the wrapper\'s exit line)', run.lastLine);
  const snap = A.snapshot(j);
  ok(LF('memoryChip')(snap, (k) => k) === '256 MB · cgroup' && snap.memorySource === 'job', 'cgroup: the snapshot gives the card «256 MB · cgroup» (its own bound)', { chip: LF('memoryChip')(snap, (k) => k), src: snap.memorySource });
  ok(await until(() => { const b = JSON.parse(fs.readFileSync(path.join(ctlOf(j2), 'bound.json'), 'utf8')); return b && b.confirmed; }, 3000, 10), 'cgroup: a running job\'s rung is confirmed while it runs (bound.json)');
  await A._sweep();
  ok(lastRun(j2).memoryBound && lastRun(j2).memoryBound.by === 'cgroup' && LF('memoryChip')(A.snapshot(j2), (k) => k) === '256 MB · cgroup', 'cgroup: the card says «256 MB · cgroup» WHILE it runs');
  A.stop(j2);
  await settle(A, j2);
  ok(lastRun(j2).cause === 'interrupted', 'cgroup: the owner\'s stop reaches the scoped job and stays a stop (never named a memory end)', lastRun(j2).cause);
  stopEngine(A);
});

leg('§3 REAL ② the rlimit rung (forced — the pod\'s: no user systemd there)', async (ok) => {
  const B = engineIn(scratch())({ memoryRungs: ['rlimit-data'] });
  const r = B.create({ kind: 'task', name: 'reserve', cmd: { argv: [NODE, '-e', RESERVE] }, memoryMb: 1024, owner }, caller);
  const j = B.jobs.get(r.job && r.job.id);
  // the size the creator gave rides the run; an agent's 0 is refused at create, the user's is not (started beside the first)
  ok(/owner/.test(B.create({ kind: 'task', name: 'zero', cmd: { argv: ['true'] }, memoryMb: '0', owner }, caller).error || ''), 'create: an agent\'s memory 0 (unbounded) is refused by name');
  const u = B.create({ kind: 'task', name: 'user-zero', cmd: { argv: ['true'] }, memoryMb: '0', owner: { ...owner, createdBy: 'user' } }, { isUser: true, groups: new Set() });
  const ju = B.jobs.get(u.job && u.job.id);
  await settle(B, j);
  const run = lastRun(j), ex = JSON.parse(fs.readFileSync(path.join(ctlOf(j), 'exit.json'), 'utf8'));
  ok(run.cause === 'oom-bound' && j.state === 'failed', 'rlimit: 1 GB bound, 1 GB of Buffers ⇒ RLIMIT_DATA refuses, the end is oom-bound (base: exit 0)', { cause: run.cause, exit: run.exit });
  ok(run.memoryBound && run.memoryBound.by === 'rlimit-data' && ex.memory && ex.memory.confirmed === true && ex.memory.maxBytes === 1024 * MiB, 'rlimit: the rung rlimit-data, its limit read back off the child (/proc/<pid>/limits)', ex.memory);
  ok(/RLIMIT_DATA/.test((ex.memory && ex.memory.how) || '') && /stopped: used more than 1 GB/.test(run.lastLine || ''), 'rlimit: named by the job\'s last words (an allocation refused), the card\'s line «stopped: used more than 1 GB»', run.lastLine);
  if (ju) await settle(B, ju);
  ok(ju && lastRun(ju).memoryBound && lastRun(ju).memoryBound.by === 'none' && /owner set 0/.test(lastRun(ju).memoryBound.why) && LF('memoryChip')(B.snapshot(ju), (k) => k) === 'unbounded — set by the owner', 'create: the user\'s 0 runs unbounded — said, never silent');
  const set = act(B, 'setMemory', ju || {}, '8G', { byUser: false });
  ok(set.ok && set.memoryMb === 8192 && set.memorySource === 'job' && act(B, 'setMemory', ju, 'inherit').memorySource === 'default', 'properties: the bound changes (8G ⇒ 8192, its own), «inherit» goes back to the ladder');
  stopEngine(B);
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
  ok(said.some((n) => n.jobId === id && n.text.includes(parkWords) && n.i18n && n.i18n.text && /parked — out of memory twice/.test(n.i18n.text.key)) && C2.events.some((e) => e.jobId === id && e.what.includes(parkWords)), 'park: said to the owner in For you (worded per device) and in the job\'s journal');
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

leg('§5 REAL — the boot\'s judge: the instance\'s OOM took the wrapper too (memory.oom.group), the pressure sample names it', async (ok) => {
  const dir = scratch(), engine = engineIn(dir);
  const cg = path.join(dir, 'fake-cgroup'); // the container's cgroup as the wrapper reads it: at 95 % of a 200 MiB limit
  fs.mkdirSync(cg); fs.writeFileSync(path.join(cg, 'memory.max'), String(200 * MiB)); fs.writeFileSync(path.join(cg, 'memory.current'), String(190 * MiB)); fs.writeFileSync(path.join(cg, 'memory.events'), 'oom 0\noom_kill 0\n');
  const HOLD = 'const b=Buffer.alloc(96*1024*1024,1); setInterval(()=>b[0]++, 60000)'; // holds ~140 MB of the 190 in use
  const deps = { memoryRungs: ['rlimit-data'], memorySample: { sampleDir: cg, sampleMs: 50 } };
  const D1 = engine(deps);
  const r = D1.create({ kind: 'service', name: 'pod-killer', cmd: { argv: [NODE, '-e', HOLD] }, owner }, caller);
  const id = r.job && r.job.id;
  const cycle = async (E, n) => {
    const j = E.jobs.get(id);
    const pressure = path.join(ctlOf(j), 'pressure.json');
    const seen = await until(() => { const p = JSON.parse(fs.readFileSync(pressure, 'utf8')); return p.jobMb >= 100; }, 6000, 10);
    ok(seen, `pressure ${n}: the wrapper samples the instance at 95 % and the job's share (pressure.json, ≥ 100 MB of it)`);
    const stamp = E._readStamp(j);
    try { process.kill(-stamp.pid, 'SIGKILL'); } catch { } // the whole group at once — the wrapper never writes exit.json
    await until(() => !E._verifyAlive(stamp), 3000, 10);
    ok(!fs.existsSync(path.join(ctlOf(j), 'exit.json')), `pressure ${n}: no exit record survives (as under memory.oom.group)`);
    E._save(); stopEngine(E);
  };
  await cycle(D1, 1);
  const D2 = engine(deps);
  let j = D2.jobs.get(id);
  const prev = j.runs[j.runs.length - 2] || {};
  ok(prev.cause === 'oom' && prev.memoryPressure && prev.memoryPressure.jobMb >= 100 && prev.memoryPressure.limitMb === 200, 'boot 1: the run that died with the instance is judged `oom` — it held most of it (base: env-restart, never counted)', { cause: prev.cause, p: prev.memoryPressure });
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

try {
  await Promise.all(legs.map(async (g) => {
    const rec = (c, n, e) => g.rows.push(['row', c, n, e]);
    rec.say = (line) => g.rows.push(['say', line]);
    try { await g.body(rec); } catch (e) { g.rows.push(['row', false, `${g.title.slice(0, 12)}: the leg threw`, String(e && e.stack || e).slice(0, 400)]); }
  }));
  for (const g of legs) { console.log(g.title); for (const [k, a, b, c] of g.rows) if (k === 'say') console.log(a); else ok(a, b, c); }

  console.log('§6 the doors where the job is — the CLI, the routes, the setting, the chart');
  {
    const cli = read('data/bin/vibespace-job'), wiring = read('src/server/jobs-wiring.js'), routes = read('src/agent-routes.js'), schema = read('src/lib/settings-schema.js'), chart = read('deploy/helm/vibespace-user/templates/main.yaml'), panel = read('src/lib/jobs-panel.js');
    ok(/memoryMb: typeof flags\.memory === 'string' \? flags\.memory : undefined/.test(cli) && /case 'memory': \{/.test(cli) && /\[--memory 8G\]/.test(cli), 'CLI: `vibespace-job run --memory 8G` carries it, `memory <id> <size>` changes it, the usage says so');
    ok(/memoryMb: b\.memoryMb/.test(routes) && /act === 'memory'\) r = a\.jm\.setMemory\(job, req\.body\?\.value \?\? null, \{ byUser: false \}\)/.test(routes) && /act === 'memory' \|\| act === 'notify'|act === 'notify' \|\| act === 'memory'/.test(routes), 'agent routes: create carries memoryMb; `memory` is the owner conversation\'s (canEdit) and never 0');
    ok(/act === 'memory'\) r = jm\.setMemory\(job, req\.body\?\.value \?\? null, \{ byUser: true \}\)/.test(wiring) && /memoryCtx: \(\) => \(\{ setting: serverSetting\('jobs\.memoryMb'\), cluster: process\.env\.VIBESPACE_JOBS_MEMORY_MB \}\)/.test(wiring), 'jobs-wiring: the panel\'s properties set it (the user may say 0); the ladder reads the setting AS STORED and the chart\'s env');
    ok(/'jobs\.memoryMb': \{\s*\n\s*type: 'number', default: 4096, min: 0,/.test(schema), 'the setting jobs.memoryMb lives in the schema (default 4096, 0 = unbounded)');
    ok(/name: VIBESPACE_JOBS_MEMORY_MB/.test(chart) && /fetchJson\(`\/api\/jobs\/\$\{j\.id\}\/memory`/.test(panel), 'the chart renders the cluster\'s default; the card\'s properties post the bound');
  }
} finally {
  // nothing this suite started outlives it — a live job group (a RED run on a base that replays blind) is killed by its stamp
  for (const E of engines) for (const j of E.jobs.values()) { try { const st = E._readStamp(j); if (E._verifyAlive(st)) process.kill(-st.pid, 'SIGKILL'); } catch { } }
  const left = spawnSync('systemctl', ['--user', 'list-units', '--all', '--no-legend', '--plain', `${PREFIX}-*`], { encoding: 'utf8', timeout: 3000 });
  if (userSystemd) ok(left.status === 0 && !String(left.stdout || '').trim(), 'no scope this suite made outlives it (failed ones are reset by the wrapper that read them)', String(left.stdout || '').trim());
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}

console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped (said above)` : ''}`);
process.exit(fail ? 1 : 0);
