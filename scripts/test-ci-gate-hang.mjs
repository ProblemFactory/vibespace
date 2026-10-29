#!/usr/bin/env node
// test-ci-gate-hang — a PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what the gate guards and why).
// lane fast-tier-ratchet (2026-10-20) split the one 37 s process into seven ≤ 10 s suites, every section's text unchanged;
// the shared kit is scripts/ci-gate-kit.mjs. This part: §11 a hang leaves a report (scripts/hang-report.mjs).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SUITES, EXCLUDED, censusFindings, listSuiteFiles, heavyBlocker, machineGlobalFixtures, defaultLockPath, killedFromOutside, OUTSIDE_SIGNALS, scratchOrphans, judgeScratch, liveScratchPaths, SCRATCH_ROOT_RE, REAP_NAMES, reapReport, reapByHand, scratchRootsOf, ROOT_ENV, argvScratchRoots, PRODUCT_ROOT_RE, FAST_DISQUALIFIERS, FAST_MAX_MS, fastRuleFindings, FAST_SUM_CAP_MS } from './ci.mjs';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';
import { REPO, GIT_ENV, ok, tmpDirs, mktmp, git, makeRepo, commit, STUB_SLICE, stubGateRepo, writeMarker, report } from './ci-gate-kit.mjs'; // the shared kit (lane fast-tier-ratchet: the gate is seven ≤ 10 s parts)

try {

// ── §11 A HANG LEAVES A REPORT (lane ci-hang-report, 2026-10-15) ─────────
// rel280's mirror: test-cache-bounds hung 300 s twice on the hosted runner and
// the ✗ row was ONE stdout line (`§1 PURE cache-bounds`, load 4.8→0.2). Every
// suite a tier spawns now runs with Node's diagnostic report armed on SIGUSR2;
// at the budget the runner ASKS (≤ 2 s for a complete file in the run's
// fail-log dir), THEN SIGTERMs, and the ✗ row names the file + its digest.
// Planted suites under a 3 s budget, run at once (one wall for all five):
// an idle hang (a read nobody answers on a unix socket, an interval, a worker
// stuck in Atomics.wait), the same on a Node without --report-exclude-env, a
// main thread blocked synchronously (no report can come), a worker blocked in a
// syscall (the report stops part-way), and the OLD path (no `hang`) as control.
console.log('\n§11 a hang leaves a report (scripts/hang-report.mjs)');
{
  const HR = await import('./hang-report.mjs');
  const { runSuiteAsync } = await import('./ci.mjs');
  // token SHAPES, built at runtime (GitHub push protection refuses the literals): what a report must never carry
  const SHAPES = [['sk', 'ant'].join('-'), 'xo' + 'xb-', 'vs' + 'st_', 'jb' + 't_'];
  const planted = SHAPES.map((x, i) => x + 'planted' + i + 'Q'.repeat(24)).join(' ');
  const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'hang-report.sample.json'), 'utf-8'));

  // PURE: the name, the flags, the digest over a real report's shape (the fixture: the planted hang below, trimmed)
  ok(HR.hangReportName('abcdef01', 'test-x', 2) === 'abcdef01.test-x.2.hang.json', 'the report is named like the fail log: <sha8>.<suite>.<try>.hang.json');
  const all = new Set(['--report-on-signal', '--report-signal', '--report-directory', '--report-filename', '--report-exclude-env', '--report-exclude-network']);
  const a1 = HR.hangReportArgv({ dir: '/d', filename: 'f.json', flags: all });
  ok(a1.armed && a1.envExcluded && a1.argv.join(' ') === '--report-on-signal --report-signal=SIGUSR2 --report-directory=/d --report-filename=f.json --report-exclude-env --report-exclude-network',
    `armed: ${a1.argv.join(' ')}`);
  const a20 = HR.hangReportArgv({ dir: '/d', filename: 'f.json', flags: new Set([...all].filter((f) => f !== '--report-exclude-env')) });
  ok(a20.armed && !a20.envExcluded && !a20.argv.includes('--report-exclude-env'), 'a Node without --report-exclude-env (< 22.13: the README floor is 18) is still armed — the tier strips the env from the file instead');
  ok(!HR.hangReportArgv({ dir: '/d', filename: 'f.json', flags: new Set() }).armed && !HR.hangReportArgv({ filename: 'f.json', flags: all }).armed, 'no --report-on-signal (or no dir) ⇒ not armed, no flags: the old kill');
  const own = HR.hangReportArgv({ dir: '/d', filename: 'f.json' });
  ok(own.armed, `this Node (${process.version}) arms it from its own flag list${own.envExcluded ? ', env left out by the flag' : ', env stripped after the fact'}`);
  const dg = HR.hangDigest(FX, { root: '/ROOT' });
  ok(dg.length <= HR.HANG_MAX_LINES && dg.some((l) => /JS main: idle at the signal/.test(l)), `the fixture's digest: the main thread idle at the signal (a signal-asked report has no main JS stack when the loop waits) — ${dg.length} lines`);
  ok(dg.some((l) => /JS worker \d+: at waitForever · scripts\/test-planted-hang\.mjs:\d+$/.test(l)) && dg.some((l) => /^\s*\[hang\]\s+at stuckFold · scripts\/test-planted-hang\.mjs:\d+/.test(l)),
    'a stuck worker\'s frames, top first, as fn · file:line under the run root');
  ok(dg.some((l) => /handles holding the loop: .*timer ×1.*pipe ×\d/.test(l) && /workers ×1/.test(l)) && dg.some((l) => /cpu user \d+\.\d\d s · sys \d+\.\d\d s · maxRSS \d+ MB/.test(l)),
    'the handles holding the loop (timer, pipe, the worker) and the resource usage');
  ok(dg.some((l) => /pipe ×\d \([^)]*→ scripts\/test-planted-hang\.sock/.test(l)), 'a unix-socket pipe names its peer (under the run root)');
  console.log(dg.map((l) => '      ' + l).join('\n'));
  // the line budget: 20 frames and a crowd of handles still make ≤ 12 lines, ≤ 8 frames, node:internal dropped
  const many = { javascriptStack: { stack: [...Array.from({ length: 20 }, (_, i) => `at f${i} (/ROOT/src/x.js:${i + 1}:2)`), 'at runMain (node:internal/modules/run_main:1:1)'] },
    libuv: Array.from({ length: 30 }, (_, i) => ({ type: i % 2 ? 'tcp' : 'pipe', is_active: true, is_referenced: true, fd: i, localEndpoint: i % 2 ? { ip4: '192.0.2.1', port: 4000 + i } : null, remoteEndpoint: i % 2 ? { ip4: '192.0.2.2', port: 5000 + i } : null })),
    resourceUsage: { userCpuSeconds: 1.5, kernelCpuSeconds: 0.25, maxRss: 104857600 }, workers: [] };
  const dm = HR.hangDigest(many, { root: '/ROOT', snapshot: { threads: [{ main: true, comm: 'MainThread', state: 'R', wchan: '0' }], children: [{ pid: 7, comm: 'sleep', state: 'S', wchan: 'hrtimer_nanosleep' }] } });
  const frameLines = dm.filter((l) => /\bat f\d+ · src\/x\.js:\d+/.test(l));
  ok(dm.length <= 12 && frameLines.length === 8 && /JS main: at f0 · src\/x\.js:1$/.test(frameLines[0]) && !dm.some((l) => /node:internal\/modules/.test(l)),
    `the line budget: ${dm.length} lines, ${frameLines.length} frames (top first), node:internal frames left out`);
  ok(dm.some((l) => /tcp ×15 \(192\.0\.2\.1:4001 → 192\.0\.2\.2:5001, .*\+12\)/.test(l)) && dm.some((l) => /threads at the deadline: main R/.test(l)) && dm.some((l) => /children: 7 sleep S hrtimer_nanosleep/.test(l)),
    'a socket names its peer (3 shown, the rest counted); /proc\'s threads + children ride along');
  ok(HR.threadsLine({ threads: [{ main: true, comm: 'MainThread', state: 'S', wchan: 'ep_poll' }, { comm: 'V8Worker', state: 'S', wchan: 'futex_do_wait' }, { comm: 'V8Worker', state: 'S', wchan: 'futex_do_wait' }, { comm: 'WorkerThread', state: 'S', wchan: 'wait_for_partner' }] })
    === 'main S ep_poll · WorkerThread S wait_for_partner — +2 idle helpers', 'threadsLine: the main thread first, V8\'s idle helpers counted not listed');
  // a PARTIAL file (the writer stopped for a worker that never answered): whole sections kept, the handles before the cut too
  const text = JSON.stringify(FX, null, 2) + '\n', inUv = text.indexOf('"type": "pipe"');
  const pp = HR.parseReport(text.slice(0, inUv + 20));
  ok(pp.partial && pp.cutIn === 'libuv' && pp.report && pp.report.resourceUsage && Array.isArray(pp.report.libuv) && pp.report.libuv.length >= 1 && pp.report.libuv.length < FX.libuv.length,
    `a report cut inside "libuv" keeps the sections before it and ${pp.report && pp.report.libuv ? pp.report.libuv.length : 0} whole handles of ${FX.libuv.length}`);
  ok(/report PARTIAL \(\d+ bytes, cut in "libuv"\)/.test(HR.hangDigest(text.slice(0, inUv + 20), { bytes: inUv + 20 })[0]), 'the digest says PARTIAL, how much, and where it stopped');
  ok(HR.parseReport(text.slice(0, 40)).report === null && /no report to read/.test(HR.hangDigest(text.slice(0, 40))[0]), 'a file cut inside its header is no report — said so, never a crash');
  // the env: stripped from a whole report, cut off a partial one
  const withEnv = JSON.stringify({ ...FX, workers: FX.workers.map((w) => ({ ...w, environmentVariables: { VS_PLANTED_TOKENS: planted } })), environmentVariables: { VS_PLANTED_TOKENS: planted } }, null, 2);
  ok(!HR.withoutEnv(withEnv).includes('environmentVariables') && !HR.withoutEnv(withEnv).includes(SHAPES[0]) && JSON.parse(HR.withoutEnv(withEnv)).libuv.length === FX.libuv.length && JSON.parse(HR.withoutEnv(withEnv)).workers.length === FX.workers.length,
    'withoutEnv: a whole report loses environmentVariables — its own AND each worker sub-report\'s copy — and nothing else');
  ok(!HR.withoutEnv(withEnv.slice(0, withEnv.length - 10)).includes(SHAPES[0]), 'withoutEnv: a text that does not parse is cut before the key');

  // REAL: five planted suites under a 3 s budget, at once
  const root = mktmp('hang'), hangDir = path.join(root, 'fail-logs'), sha = 'abcdef0123456789';
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const IDLE = (name) => `import { Worker, isMainThread } from 'node:worker_threads';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
function waitForever() { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }
function stuckFold() { waitForever(); }
if (!isMainThread) stuckFold();
else {
  process.env.VS_PLANTED_TOKENS = ${JSON.stringify(planted)};
  const sock = path.join(path.dirname(fileURLToPath(import.meta.url)), ${JSON.stringify(name + '.sock')});
  try { fs.unlinkSync(sock); } catch { }
  net.createServer((c) => c.on('data', () => {})).listen(sock, () => { net.connect(sock).on('data', () => {}); });
  setInterval(() => {}, 1000);
  new Worker(new URL(import.meta.url));
  console.log('§1 planted: a read nobody answers + an interval + a stuck worker');
}
`;
  const SYNC = `function blockMain() { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }
console.log('§1 planted: the main thread blocked in a synchronous call');
blockMain();
`;
  const PARTIAL = `import { Worker, isMainThread } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
function readsStorage() { spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 6000)']); }
if (!isMainThread) readsStorage();
else { setInterval(() => {}, 1000); new Worker(new URL(import.meta.url)); console.log('§1 planted: a worker blocked in a syscall'); }
`;
  const plant = { 'test-planted-hang': IDLE('test-planted-hang'), 'test-planted-hang20': IDLE('test-planted-hang20'), 'test-planted-sync': SYNC, 'test-planted-partial': PARTIAL, 'test-planted-old': IDLE('test-planted-old') };
  for (const [n, src] of Object.entries(plant)) fs.writeFileSync(path.join(root, 'scripts', n + '.mjs'), src);
  const row = (name) => ({ name, tier: 'fast', budgetMs: 3000 });
  const flags20 = new Set([...process.allowedNodeEnvironmentFlags].filter((f) => f !== '--report-exclude-env'));
  const [hang, h20, sync, part, old] = await Promise.all([
    runSuiteAsync(row('test-planted-hang'), { root, sha, lane: 1, hang: { dir: hangDir, attempt: 1 } }),
    runSuiteAsync(row('test-planted-hang20'), { root, sha, lane: 2, hang: { dir: hangDir, attempt: 1, flags: flags20 } }),
    runSuiteAsync(row('test-planted-sync'), { root, sha, lane: 3, hang: { dir: hangDir, attempt: 1 } }),
    runSuiteAsync(row('test-planted-partial'), { root, sha, lane: 4, hang: { dir: hangDir, attempt: 2 } }),
    runSuiteAsync(row('test-planted-old'), { root, sha, lane: 5 }),
  ]);
  const file = path.join(hangDir, 'abcdef01.test-planted-hang.1.hang.json');
  const head = hang.lines[0].split('\n').filter(Boolean);
  console.log(head.map((l) => '      ' + l).join('\n'));
  ok(!hang.ok && /ETIMEDOUT, SIGTERM\)/.test(head[0]) && head[0].endsWith(` — hang report: ${file}`) && hang.hangReport === file && fs.existsSync(file),
    'a timed-out suite\'s ✗ line names its report — <run fail-log dir>/<sha8>.<suite>.<try>.hang.json — and the file is there');
  ok(head.some((l) => /JS worker \d+: at waitForever · scripts\/test-planted-hang\.mjs:\d+/.test(l)) && head.some((l) => /handles holding the loop: .*timer ×1.*pipe ×\d/.test(l)) && head.length - 1 <= 12,
    `…and its digest under it: the stuck worker's frames, the pipe + the timer holding the loop (${head.length - 1} lines)`);
  ok(/\[hang\] JS worker/.test(hang.full || '') && hang.lines[1].includes('§1 planted') && !/\[hang\]/.test(hang.lines[1] + hang.lines[2]),
    'the digest is in the whole output (the fail log) too, and lines[1]/[2] stay the stdout tail / stderr the rerun ledger reads');
  const f20 = path.join(hangDir, 'abcdef01.test-planted-hang20.1.hang.json'), t20 = fs.existsSync(f20) ? fs.readFileSync(f20, 'utf-8') : '';
  ok(h20.lines[0].includes(`hang report: ${f20}`) && t20 && !('environmentVariables' in JSON.parse(t20)) && !t20.includes(SHAPES[0]),
    'a Node without --report-exclude-env: the report is written WITH the env, then stripped by the tier before anyone reads it');
  ok(/ — no hang report \(asked with SIGUSR2, nothing written in \d+ ms\)/.test(sync.lines[0]) && /\[hang\] no report to read — the JS thread never answered/.test(sync.lines[0]) && /threads at the deadline: main S/.test(sync.lines[0]),
    `a main thread blocked synchronously answers nothing — the row says so and /proc names the wait (${(sync.lines[0].match(/threads at the deadline: [^\n]*/) || [''])[0]})`);
  const namesThreads = (() => { try { return fs.readFileSync(`/proc/self/task/${process.pid}/comm`, 'utf-8').trim() === 'MainThread'; } catch { return false; } })(); // Node 24 names its threads, 20 / 22 do not
  ok(/abcdef01\.test-planted-partial\.2\.hang\.json|no hang report/.test(part.lines[0]) && /report PARTIAL|no report to read/.test(part.lines[0]) && /threads at the deadline: main S/.test(part.lines[0]) && (!namesThreads || /threads at the deadline: [^\n]*WorkerThread S/.test(part.lines[0])),
    `a worker blocked in a syscall stops the report part-way (the try-2 name) and /proc names the worker's wait (${(part.lines[0].match(/threads at the deadline: [^\n]*/) || [''])[0]})`);
  ok(!old.ok && /ETIMEDOUT, SIGTERM\)/.test(old.lines[0]) && old.lines[0].trim().split('\n').length === 1 && !/hang report|\[hang\]/.test(old.lines.join('\n')) && !fs.readdirSync(hangDir).some((f) => f.includes('test-planted-old')),
    'CONTROL (RED): the old path (no `hang`) — one ✗ line, no report, no digest: the hang is the stdout tail and nothing else');
  // THE CENSUS: no report the tier leaves carries an environment or a token shape; the control proves the census can see one
  const reports = fs.readdirSync(hangDir).filter((f) => f.endsWith('.hang.json'));
  const leaks = reports.filter((f) => { const t = fs.readFileSync(path.join(hangDir, f), 'utf-8'); return SHAPES.some((x) => t.includes(x)) || /"environmentVariables": \{\s*"/.test(t); });
  ok(reports.length >= 3 && !leaks.length, `CENSUS: ${reports.length} reports (${reports.join(', ')}), none with an environment or a ${SHAPES.length}-shape token${leaks.length ? ' — LEAK: ' + leaks.join(', ') : ''}`);
  const rawDir = path.join(root, 'raw');
  const raw = spawn(process.execPath, ['--report-on-signal', '--report-signal=SIGUSR2', `--report-directory=${rawDir}`, '--report-filename=raw.json', path.join(root, 'scripts', 'test-planted-old.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((res) => { raw.stdout.on('data', res); setTimeout(res, 5000); });
  fs.mkdirSync(rawDir, { recursive: true });
  raw.kill('SIGUSR2');
  let rawText = '';
  for (let i = 0; i < 100 && !/\}\s*$/.test(rawText); i++) { await new Promise((res) => setTimeout(res, 50)); try { rawText = fs.readFileSync(path.join(rawDir, 'raw.json'), 'utf-8'); } catch { } }
  raw.kill('SIGKILL');
  ok(SHAPES.every((x) => rawText.includes(x)), 'CONTROL (RED): the same suite reported WITHOUT --report-exclude-env carries the planted token shapes — the census reads what it claims to');
  // WIRING: both tiers arm every suite, the heavy one per try, into the run's fail-log dir
  const CI = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/const hangDir = fastFailDir\(\);/.test(CI) && /await runSuiteAsync\(s, \{ root: runRoot, absentIsSkip: !!isolate, sha, lane, inflight, hang: \{ dir: hangDir, attempt: 1 \} \}\)/.test(CI),
    'WIRING: the fast tier arms every suite (its reports in its own fail-log dir, data/ci-fast/fail-logs — beside a red suite\'s whole output)');
  ok(/runSuiteAsync\(s, \{ root: runRoot, absentIsSkip: !!isolate, sha, lane, inflight, hang: \{ dir: path\.join\(d, 'fail-logs'\), attempt: 1 \} \}\)/.test(CI) && /runSuiteAsync\(s, \{ root: runRoot, sha, lane, inflight, hang: \{ dir: path\.join\(d, 'fail-logs'\), attempt: 2 \} \}\)/.test(CI),
    'WIRING: the heavy tier arms try 1 and the in-row retry (try 2) into <markers>/fail-logs — hub, hosted, the AIDev batch (ci-remote copies fail-logs back)');
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
