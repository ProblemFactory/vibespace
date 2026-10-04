#!/usr/bin/env node
// B-442c (2026-10-02, the 16:23 OOM that stopped the production service): THE DAEMON'S FS WORKER POOL IS BOUNDED.
// A scratch vibespace-device whose bundle had been deleted under it lost one worker to a deadline; every respawn then
// crashed at load (MODULE_NOT_FOUND), a crashed Worker emits 'error' AND 'exit', the pre-fix pool ran die() on both —
// `live` went negative, the size cap stopped binding, each crash scheduled two respawns — and the pool doubled to
// 45.7 GB anon RSS in under two minutes. Here the REAL src/agentd/worker-pool.js runs over a scratch worker file,
// the file is deleted, one job overruns its deadline, and the pool is watched: the fix stays at its size and backs
// off, the pre-fix shape (a patched copy: no once-only death, no backoff) storms. Every pool runs in a CHILD node
// (this suite's own `--child` mode) that exits when measured, so a storming control dies with it.
// Run: node scripts/test-agentd-worker-pool.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const threadsNow = () => { try { return Number(/Threads:\s+(\d+)/.exec(fs.readFileSync('/proc/self/status', 'utf8'))[1]); } catch { return null; } };

// ── child mode: one pool, measured, then exit (its workers end with the process) ──
if (process.argv[2] === '--child') {
  const [modPath, workerFile, mode, windowMs, stopAt] = process.argv.slice(3);
  const { createWorkerPool } = require(modPath);
  const lines = [];
  const pool = createWorkerPool({ file: workerFile, workerData: { role: 'leg' }, size: 2, respawnMs: 20, respawnMaxMs: 320, log: (m) => lines.push(m) });
  const out = { mode, baseThreads: threadsNow() };
  // BOTH workers answer first (one job in flight per worker): a worker still loading when the file goes would crash at load and
  // take the deadline job with it (`worker died` — seen once on a loaded box)
  out.echo = await Promise.all([pool.run('echo', { v: 7 }, 3000), pool.run('echo', { v: 7 }, 3000)]).then(([m]) => m.v, (e) => e.message);
  const src = fs.readFileSync(workerFile, 'utf8');
  if (mode !== 'pace') fs.unlinkSync(workerFile);   // the incident's precondition: the file every respawn loads is gone
  out.hang = await pool.run('hang', { ms: 10000 }, 50).then(() => 'answered', (e) => e.message);
  const t0 = Date.now(); let peakThreads = 0, maxLive = 0;
  while (Date.now() - t0 < Number(windowMs)) {
    await sleep(5);
    const s = pool.stats(); maxLive = Math.max(maxLive, s.live); peakThreads = Math.max(peakThreads, threadsNow() || 0);
    if (s.spawned >= Number(stopAt)) break;
  }
  out.elapsedMs = Date.now() - t0;
  Object.assign(out, pool.stats(), { maxLiveSeen: maxLive, peakThreads, lines: lines.slice(0, 2), lineCount: lines.length });
  if (mode === 'fix') {   // the file comes back: the next respawn starts, a job is answered, the backoff is over
    out.crashesInRowBefore = pool.stats().crashesInRow;
    out.siblingAnswer = await pool.run('echo', { v: 5 }, 1000).then((m) => m.v, (e) => e.message);   // the healthy sibling answers…
    out.crashesInRowAfterSibling = pool.stats().crashesInRow;                                          // …and that ends no backoff
    fs.writeFileSync(workerFile, src);
    const t1 = Date.now();
    while (Date.now() - t1 < 2000 && pool.stats().live < 2) await sleep(10);
    const both = await Promise.all([pool.run('echo', { v: 9 }, 1000), pool.run('echo', { v: 9 }, 1000)].map((p) => p.then((m) => m.v, (e) => e.message)));
    Object.assign(out, { recovered: both, liveBack: pool.stats().live, recoveredMs: Date.now() - t1, crashesInRowAfter: pool.stats().crashesInRow });
  }
  if (mode === 'pace') out.after = await pool.run('echo', { v: 8 }, 3000).then((m) => m.v, (e) => e.message);
  out.liveEnd = pool.stats().live;
  console.log(JSON.stringify(out));
  process.exit(0);
}
// verify r1 (2026-10-02): a worker blocked IN A SYSCALL (open() of a FIFO with no writer — a hung mount's shape) outlives its
// terminate; the pre-fix pool held its slot, kept alive() true and queued every later job with no deadline — forever
if (process.argv[2] === '--wedge') {
  const [modPath, workerFile, fifo] = process.argv.slice(3);
  const { createWorkerPool } = require(modPath);
  const lines = [], out = {};
  const T = (p, ms) => { const t0 = Date.now(); return Promise.race([p.then((m) => 'answered ' + m.v, (e) => e.message), sleep(ms).then(() => 'NO ANSWER')]).then((r) => ({ r, ms: Date.now() - t0 })); };
  const pool = createWorkerPool({ file: workerFile, workerData: { role: 'leg' }, size: 2, respawnMs: 20, wedgeMs: 150, maxWedged: 2, log: (m) => lines.push(m) });
  out.echo = (await T(pool.run('echo', { v: 1 }, 2000), 3000)).r;
  const hung = [pool.run('fifo', { path: fifo }, 60), pool.run('fifo', { path: fifo }, 60)].map((h) => T(h, 400).then((x) => x.r));
  out.queued = await T(pool.run('echo', { v: 2 }, 120), 500);                  // both slots blocked: a queued job meets ITS deadline
  out.hung = await Promise.all(hung);
  await sleep(300);
  out.afterTwo = pool.stats();
  out.served = await T(pool.run('echo', { v: 3 }, 300), 500);                  // the refilled slots serve
  const more = [pool.run('fifo', { path: fifo }, 60), pool.run('fifo', { path: fifo }, 60)];
  await Promise.all(more.map((h) => T(h, 400)));
  await sleep(300);
  out.afterFour = pool.stats(); out.aliveExhausted = pool.alive();
  out.exhausted = await T(pool.run('echo', { v: 4 }, 300), 500);               // past the cap: failed BY NAME, at once
  out.threadsWedged = threadsNow();
  for (let k = 0; k < 4; k++) { try { fs.closeSync(fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)); } catch { } }   // the "mount" returns
  const t1 = Date.now();
  while (Date.now() - t1 < 1500 && (pool.stats().wedged || pool.stats().live < 2)) await sleep(20);
  out.recovered = pool.stats(); out.back = await T(pool.run('echo', { v: 5 }, 500), 700);
  out.lines = lines;
  console.log(JSON.stringify(out));
  process.kill(process.pid, 'SIGKILL');   // process.exit JOINS every worker thread — the control's re-wedged one would hold it to the timeout
}
// verify r1: process.exit JOINS every worker thread — with one blocked in the kernel it never returns; pool.exit does
if (process.argv[2] === '--exit') {
  const [modPath, workerFile, fifo, marker, how] = process.argv.slice(3);
  const { createWorkerPool } = require(modPath);
  const lines = [];
  const pool = createWorkerPool({ file: workerFile, workerData: { role: 'leg' }, size: 2, respawnMs: 20, wedgeMs: 100, log: (m) => lines.push(m) });
  await pool.run('echo', { v: 1 }, 2000);
  await pool.run('fifo', { path: fifo }, 60).catch(() => { });
  await sleep(250);
  process.on('exit', () => fs.writeFileSync(marker, JSON.stringify({ stuck: pool.stats().stuck, wedged: pool.stats().wedged, lines })));
  if (how === 'pool') pool.exit(0); else process.exit(0);
}
// verify r1: a worker that loads and EXITS on its own (a bundle that parses but serves nothing) is a crash, not a pace
if (process.argv[2] === '--clean') {
  const [modPath, workerFile] = process.argv.slice(3);
  const { createWorkerPool } = require(modPath);
  const lines = [];
  const pool = createWorkerPool({ file: workerFile, workerData: { role: 'leg' }, size: 2, respawnMs: 20, respawnMaxMs: 320, log: (m) => lines.push(m) });
  await sleep(1000);
  const out = { ...pool.stats(), lines: lines.slice(0, 2), lineCount: lines.length };
  console.log(JSON.stringify(out));
  process.exit(0);
}

const { scratchDir } = await import('./scratch.mjs');
const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d !== undefined ? ' — ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''}`); } };
const DIR = scratchDir('worker-pool');
process.on('exit', () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { } });

// the worker every pool loads: answers `echo`, and `hang` busy-loops (a JS loop, so the deadline's terminate ends it)
const WORKER = `const { parentPort } = require('worker_threads');
parentPort.on('message', (m) => {
  if (m.action === 'hang') { const end = Date.now() + m.ms; while (Date.now() < end) { } }
  if (m.action === 'fifo') require('fs').readFileSync(m.path);   // blocks in open(): terminate cannot end it
  parentPort.postMessage({ id: m.id, v: m.v });
});
`;
const POOL = path.join(REPO, 'src/agentd/worker-pool.js');
const run = (modPath, mode, windowMs, stopAt) => {
  const wf = path.join(DIR, `worker-${mode}-${path.basename(path.dirname(modPath))}.js`);
  fs.writeFileSync(wf, WORKER);
  const r = spawnSync(process.execPath, [SELF, '--child', modPath, wf, mode, String(windowMs), String(stopAt)], { encoding: 'utf8', timeout: 20000 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { error: `child exit ${r.status} ${r.signal || ''}: ${(r.stderr || r.stdout || '').slice(-400)}` }; }
};

console.log('— §1 the fixed pool, its worker file deleted, one deadline: bounded —');
const F = run(POOL, 'fix', 1200, 1000);
ok(F.echo === 7 && /fs deadline \(hang\)/.test(F.hang || ''), 'setup: the pool answered a job, then a job overran its deadline (the death that starts it)', F);
ok(F.crashes >= 3 && /MODULE_NOT_FOUND/.test((F.lines || [])[0] || ''), `REACHED: the respawns really crashed at load (${F.crashes} crashes, MODULE_NOT_FOUND) — the bound below is not vacuous`, F.lines);
ok(F.maxLiveSeen <= 2 && F.maxLive <= 2 && F.live >= 0, `FIX: live never above the pool size and never negative (max ${F.maxLiveSeen}, end ${F.live})`);
ok(F.spawned <= 2 + 1 + F.crashes && F.spawned <= 12, `FIX: ${F.spawned} spawns in ${F.elapsedMs} ms — one per death, never two (deaths ${F.deaths}, crashes ${F.crashes})`);
ok(F.crashes <= 10 && /in a row, the next respawn in/.test((F.lines || [])[0] || ''), `FIX: consecutive crashes BACK OFF (${F.crashes} in 1.2 s at a 20 ms base, doubling to 320 ms) and each one is SAID`, F.lines);
ok(F.siblingAnswer === 5 && F.crashesInRowAfterSibling === F.crashesInRowBefore && F.crashesInRowBefore > 0, `FIX: the healthy sibling's answer ends no backoff (crashes in a row ${F.crashesInRowBefore} → ${F.crashesInRowAfterSibling}: it proves nothing about the file a respawn loads)`, F);
ok(F.liveBack === 2 && JSON.stringify(F.recovered) === '[9,9]' && F.crashesInRowAfter === 0, `FIX: the file back, the pool is at its size again within ${F.recoveredMs} ms, both workers answer, and the backoff is over (crashes in a row: ${F.crashesInRowAfter})`, F);

console.log('— §2 a deadline with the file present keeps the R2 pace (terminate → respawn, no backoff) —');
const P = run(POOL, 'pace', 300, 1000);
ok(/fs deadline \(hang\)/.test(P.hang || '') && P.crashes === 0 && P.deaths === 1, `a deadline is a death, not a crash (deaths ${P.deaths}, crashes ${P.crashes})`, P);
ok(P.after === 8 && P.liveEnd === 2 && P.spawned === 3, `the pool is back at its size and answers (spawned ${P.spawned}, live ${P.liveEnd})`, P);

console.log('— §3 CONTROL: the pre-fix pool shape storms under the same trigger —');
const M = mutantCopies('worker-pool', REPO);
const src = fs.readFileSync(POOL, 'utf8');
const pre = src
  .replace("if (w._dead) return; // a failed Worker emits 'error' THEN 'exit': ONE death (the pre-fix pool counted two)", '/* pre-fix: every event is a death */')
  .replace('if (error) crashed(error); else if (!w._terminated) crashed(`exited on its own, code ${code}`); else later(respawnMs);', 'later(respawnMs);');
ok(pre !== src && !pre.includes('if (w._dead) return;') && !pre.includes('if (error) crashed(error)'), 'PATCH LANDED: the control dies on every event and respawns every death at the base pace');
const C = run(M.write('src/agentd/worker-pool.js', pre, 'prefix'), 'control', 3000, 24);
ok(C.spawned >= 24 && C.elapsedMs < 3000, `CONTROL: the pre-fix shape reached ${C.spawned} spawns of a size-2 pool in ${C.elapsedMs} ms (stopped there) — the storm`, C);
ok(C.live < 0 || C.maxLiveSeen <= 2, `CONTROL: …while its own count said ${C.live} live (the double decrement: the size cap could not see them)`, C);

console.log('— §5 verify r1: a worker wedged IN A SYSCALL (a FIFO with no writer) — slots refilled, ops fail by name, never queued forever —');
const { execFileSync } = await import('node:child_process');
const wedgeRun = (modPath, tag) => {
  const wf = path.join(DIR, `worker-wedge-${tag}.js`), fifo = path.join(DIR, `wedge-${tag}.fifo`);
  fs.writeFileSync(wf, WORKER); execFileSync('mkfifo', [fifo]);
  const r = spawnSync(process.execPath, [SELF, '--wedge', modPath, wf, fifo], { encoding: 'utf8', timeout: 20000 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { error: `child exit ${r.status} ${r.signal || ''}: ${(r.stderr || r.stdout || '').slice(-400)}` }; }
};
const G = wedgeRun(POOL, 'fix');
ok(G.echo === 'answered 1' && (G.hung || []).every((h) => /fs deadline \(fifo\)/.test(h)), 'setup: two jobs blocked in open() of a FIFO overran their deadlines', G);
ok(/fs deadline \(echo\): never started/.test(G.queued?.r || '') && G.queued.ms < 600, `FIX: a job queued behind them fails BY NAME at its own deadline (${G.queued?.ms} ms: ${G.queued?.r})`, G.queued);
ok(G.afterTwo?.wedged === 2 && G.afterTwo.live === 2 && G.afterTwo.abandoned === 2, `REACHED + FIX: both terminated workers were still alive past the grace (wedged ${G.afterTwo?.wedged}) — their slots refilled (live ${G.afterTwo?.live})`, G.afterTwo);
ok(G.served?.r === 'answered 3', `FIX: the refilled pool keeps serving (${G.served?.r})`, G.served);
ok(G.afterFour?.wedged === 4 && G.afterFour.live === 0 && G.aliveExhausted === true, `FIX: past the cap (2) a wedged slot stays empty — ${G.afterFour?.wedged} wedged, live ${G.afterFour?.live}, threads bounded, alive() stays true (runFs must not go inline onto the hung path)`, G.afterFour);
ok(/fs pool exhausted \(echo\): 4 workers wedged in the kernel \(last on fifo /.test(G.exhausted?.r || '') && G.exhausted.ms < 100, `FIX: with every slot wedged an op fails BY NAME at once (${G.exhausted?.ms} ms)`, G.exhausted);
ok((G.lines || []).filter((l) => /wedged in the kernel on fifo .* (is refilled|stays empty)/.test(l)).length === 4, 'FIX: each wedge is SAID (four lines: two refilled, two past the cap)', G.lines);
ok(G.recovered?.wedged === 0 && G.recovered.live === 2 && G.back?.r === 'answered 5', `FIX: when the syscall returns the wedged threads exit and the pool is whole again (wedged ${G.recovered?.wedged}, live ${G.recovered?.live}, ${G.back?.r})`, G.recovered);
const pre5 = src.replace("w._grace = setTimeout(() => abandon(w, `${job.msg.action} ${job.msg.path || ''}`.trim()), wedgeMs);\n      w._grace.unref?.();", '/* lane head: the slot waits for the exit */')
  .replace("if (!w && live === 0 && !pending) return reject(", 'if (false) return reject(')
  .replace("        job.qt = setTimeout(() => {", "        if (false) job.qt = setTimeout(() => {");
ok(pre5 !== src && !pre5.includes('abandon(w, `') && pre5.includes('if (false) job.qt'), 'PATCH LANDED: the control never abandons a wedged worker and gives a queued job no deadline (the lane head 8bd219dd)');
const GC = wedgeRun(M.write('src/agentd/worker-pool.js', pre5, 'wedge'), 'control');
ok(GC.queued?.r === 'NO ANSWER' && GC.served?.r === 'NO ANSWER' && GC.afterTwo?.live === 2 && !GC.afterTwo?.abandoned, `CONTROL: the head's pool holds both wedged slots (live ${GC.afterTwo?.live}) and a queued job — even a plain echo — gets NO answer, no error, no line (lines: ${(GC.lines || []).length})`, GC);

console.log('— §6 verify r1: a worker that exits on its own is a CRASH (backoff, said), not a 500 ms pace forever —');
const cleanRun = (modPath, tag) => {
  const wf = path.join(DIR, `worker-clean-${tag}.js`);
  fs.writeFileSync(wf, '// a bundle that parses and serves nothing: the thread exits with code 0, no error\n');
  const r = spawnSync(process.execPath, [SELF, '--clean', modPath, wf], { encoding: 'utf8', timeout: 20000 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { error: `child exit ${r.status} ${r.signal || ''}: ${(r.stderr || r.stdout || '').slice(-400)}` }; }
};
const K = cleanRun(POOL, 'fix');
ok(K.deaths >= 2 && K.crashes >= 2 && K.spawned <= 12 && /exited on its own, code 0/.test((K.lines || [])[0] || ''), `FIX: ${K.spawned} spawns in 1 s at a 20 ms base, ${K.crashes} crashes said ("${(K.lines || [])[0] || ''}")`, K);
const pre6 = src.replace("else if (!w._terminated) crashed(`exited on its own, code ${code}`); ", '');
ok(pre6 !== src, 'PATCH LANDED: the control respawns an unasked exit at the base pace (the lane head 8bd219dd)');
const KC = cleanRun(M.write('src/agentd/worker-pool.js', pre6, 'clean'), 'control');
ok(KC.spawned >= 25 && KC.crashes === 0 && KC.lineCount === 0, `CONTROL: the head's shape spawned ${KC.spawned} workers in 1 s, 0 crashes, 0 lines — a silent CPU loop`, KC);

console.log('— §7 verify r1: the daemon\'s exit is not held by a worker blocked in the kernel (process.exit joins every thread) —');
const exitRun = (how, timeout) => {
  const wf = path.join(DIR, `worker-exit-${how}.js`), fifo = path.join(DIR, `exit-${how}.fifo`), marker = path.join(DIR, `exit-${how}.json`);
  fs.writeFileSync(wf, WORKER); execFileSync('mkfifo', [fifo]);
  const t0 = Date.now(), r = spawnSync(process.execPath, [SELF, '--exit', POOL, wf, fifo, marker, how], { encoding: 'utf8', timeout });
  let m = null; try { m = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch { }
  return { ms: Date.now() - t0, status: r.status, signal: r.signal, marker: m };
};
const X = exitRun('pool', 10000);
ok(X.ms < 3000 && X.signal === 'SIGKILL' && X.marker && X.marker.stuck === 1 && X.marker.wedged === 1, `FIX: pool.exit with a worker wedged in open() ends the process in ${X.ms} ms (by SIGKILL), its exit handlers RAN first (stuck ${X.marker && X.marker.stuck})`, X);
ok(/exit 0: 1 fs worker\(s\) blocked in the kernel would hold process\.exit forever/.test(((X.marker && X.marker.lines) || []).join('\n')), 'FIX: …and it is SAID', X.marker);
const XC = exitRun('process', 2500);
ok(XC.signal === 'SIGTERM' && XC.ms >= 2400 && XC.marker && XC.marker.stuck === 1, `CONTROL: plain process.exit(0) with the same wedged worker ran its handlers and then HUNG until the harness killed it at ${XC.ms} ms (the daemon's SIGTERM / re-exec path before this round)`, XC);

console.log('— §4 the daemon runs THIS pool —');
const agentd = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
ok(/require\('\.\/worker-pool\.js'\)\.createWorkerPool\(\{ file: __filename, workerData: \{ role: 'agentd-worker' \}/.test(agentd), "WIRING PIN: agentd.js builds its pool with createWorkerPool over its OWN bundle (__filename, role 'agentd-worker')");
ok(!/new wt\.Worker\(/.test(agentd), 'WIRING PIN: agentd.js spawns no Worker of its own (one pool implementation, the bounded one)');
ok(/handOver\(\{ server, log, exit: exitDaemon, spawnNext: /.test(agentd) && /try \{ spawnNext\(\); \} finally \{ exit\(0\); \}/.test(fs.readFileSync(path.join(REPO, 'src/agentd/reexec.js'), 'utf8')) && /SIGTERM — exiting \(sessions unaffected by design\)'\); exitDaemon\(0\);/.test(agentd) && /function exitDaemon\(code\) \{ if \(workerPool\) workerPool\.exit\(code\);/.test(agentd),
  'WIRING PIN (verify r1): the self-upgrade\'s re-exec (reexec.js handOver: spawnNext, then exit = exitDaemon — int206) and SIGTERM exit through exitDaemon → pool.exit (a wedged worker cannot hold them)');

console.log('\n§tree the patched copy never touches the tree');
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(r.pass, r.name, r.detail);

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
