#!/usr/bin/env node
// test-ci-gate-reaper — a PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what the gate guards and why).
// lane fast-tier-ratchet (2026-10-20) split the one 37 s process into seven ≤ 10 s suites, every section's text unchanged;
// the shared kit is scripts/ci-gate-kit.mjs. This part: §9 the scratch-orphan reaper · §9b the singleton Desktop's X server · §9c a scratch root off the arguments · §9d the directory sweep · §10 the launcher once, for real.
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

// ── §9 THE SCRATCH-ORPHAN REAPER (2.369.104) — decided over a FAKE proc root ──
// 2026-09-16: 504 leaked vibespace-device daemons + 552 scratch node processes
// + 2,137 orphaned dtach clients (86 GB, load 15) — every worktree server a
// suite boots spawns a DETACHED device daemon the suite's teardown never sees.
// The rule is evidence-based (a scratch root under /tmp/vs-* AND either the dir
// is gone or every member is unowned and stale); each branch has a row here.
// THE OWNER'S HOME in the reaper fixtures (§9–§9c) is a literal outside /tmp, never `os.homedir()` ("Clear content…"
// verify r3, 2026-09-28): a gate run under a SCRATCH HOME of the product's own /tmp/vs-* shape (the round's rule for
// zero vendor calls) made every "production" process in these fixtures rooted in an EXISTING scratch dir — spared,
// and the reaper leg red on a machine-dependent fact (the runner's HOME), never on the product
const HOME_OF_OWNER = '/home/cigate-owner';
console.log('\n§9 the scratch-orphan reaper');
{
  const root = mktmp('procroot');
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'cigate9-plain-')); tmpDirs.push(plain);   // a tmp dir WITHOUT the vs- prefix (this suite's own mktmp dirs are scratch-shaped, deliberately)
  // the scratch dirs are minted under literal /tmp with the vs- prefix (per pid — never a shared name)
  const scratch = (tag) => { const d = fs.mkdtempSync(`/tmp/vs-cigate9-${tag}-${process.pid}-`); tmpDirs.push(d); return d; };
  const sLive = scratch('live'), sOld = scratch('old'), sYoung = scratch('young');
  const sGone = `/tmp/vs-cigate9-gone-${process.pid}-nowhere`;
  ok(SCRATCH_ROOT_RE.test(sLive) && SCRATCH_ROOT_RE.test(sGone) && SCRATCH_ROOT_RE.test(root) && !SCRATCH_ROOT_RE.test(plain), 'the scratch-root shape is the one scripts/scratch.mjs mints (this suite\'s own mktmp dirs included; a tmp dir without the prefix is not it)');
  const NOW = Date.now(), OLD = NOW - 30 * 60 * 1000;
  const mk = (pid, { name, argv, ppid, cwd, env = {}, born = NOW }) => {
    const d = path.join(root, String(pid)); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`);
    fs.writeFileSync(path.join(d, 'cmdline'), (argv || [name]).join('\0') + '\0');
    fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
    fs.symlinkSync(cwd, path.join(d, 'cwd'));
    fs.utimesSync(d, born / 1000, born / 1000);
  };
  mk(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
  mk(100, { name: 'vibespace-device', argv: ['vibespace-device'], ppid: 1, cwd: sGone, env: { HOME: sGone, VIBESPACE_AGENTD_ROOT: sGone + '/agentd-root' }, born: OLD });   // dir gone ⇒ reap (B-1d08: once past the stale floor)
  mk(101, { name: 'vibespace-device', argv: ['vibespace-device'], ppid: 1, cwd: sGone, env: { HOME: sGone } });   // B-1d08 (c): the same shape, YOUNG — a run in flight that removed its dir first, or a stray a suite planted ⇒ spared
  mk(201, { name: 'node', argv: ['node', '/tmp/x/scripts/ci.mjs', '--heavy'], ppid: 1, cwd: sLive, born: OLD });   // a gate RUNNER in its own isolated worktree: never a candidate
  mk(200, { name: 'node', argv: ['node', 'server.js'], ppid: 201, cwd: sLive, born: OLD });                       // its suite's server ⇒ owned ⇒ keep
  mk(202, { name: 'vibespace-device', argv: ['vibespace-device'], ppid: 1, cwd: sLive, env: { HOME: sLive }, born: OLD });   // that server's detached daemon: same root, group has a live member ⇒ keep
  mk(300, { name: 'node', argv: ['node', 'server.js'], ppid: 1, cwd: sOld, born: OLD });                          // dir exists, reparented, 30 min ⇒ reap
  mk(310, { name: 'node', argv: ['node', 'wrapper.js'], ppid: 300, cwd: sOld, born: OLD });                       // child of an orphan (depth 2) ⇒ reap with it
  mk(301, { name: 'node', argv: ['node', 'server.js'], ppid: 1, cwd: sYoung });                                   // reparented but YOUNG ⇒ may be a run in flight ⇒ keep
  const prodCwd = path.join(HOME_OF_OWNER, 'workspace', 'vibespace');   // a checkout under the home dir — NOT `REPO`, which is itself a /tmp/vs-* scratch worktree when this suite runs inside one (an integration worktree, the isolated heavy tier)
  mk(400, { name: 'node', argv: ['node', 'server.js'], ppid: 1, cwd: prodCwd, env: { HOME: HOME_OF_OWNER }, born: OLD });   // PRODUCTION shape: no scratch root ⇒ never a candidate
  mk(500, { name: 'dtach', argv: ['dtach', '-a', sGone + '/data/sockets/cw-1'], ppid: 1, cwd: '/', env: { HOME: sGone }, born: OLD });   // orphan attach client, root via HOME ⇒ reap
  // LANE H VERIFY r1 (2026-09-25): CANDIDACY IS EVIDENCE, NEVER A NAME. The field: two leaked
  // `agent-browser-linux-x64` daemons (ppid systemd --user, cwd a checkout, AGENT_BROWSER_SOCKET_DIR
  // under a GONE /tmp/vs-browser-live-*) and a `headless_shell` were dropped by a name gate that ran
  // BEFORE the roots were read, while `--reap` said "no scratch orphans" (1045 daemons/Chromes, 47 GB).
  const sGone2 = `/tmp/vs-cigate9-gone2-${process.pid}-nowhere`, sGone3 = `/tmp/vs-cigate9-gone3-${process.pid}-nowhere`, sGone4 = `/tmp/vs-cigate9-gone4-${process.pid}-nowhere`;
  mk(601, { name: 'sleep', argv: ['sleep', '3600'], ppid: 1, cwd: sGone, born: OLD });                            // an unlisted name, orphaned under a GONE root ⇒ reap (evidence, whatever the name)
  mk(700, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: sGone, born: OLD });   // the leaked daemon, rooted by its cwd ⇒ reap
  mk(701, { name: 'headless_shell', argv: ['/opt/chrome/headless_shell', '--headless', `--user-data-dir=${sGone2}/prof`, '--no-sandbox'], ppid: 1, cwd: '/', born: OLD });   // a Chrome: cwd `/`, its ONLY root the --user-data-dir ⇒ reap
  mk(702, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: prodCwd, env: { HOME: HOME_OF_OWNER, AGENT_BROWSER_SOCKET_DIR: sGone3 + '/sock', AGENT_BROWSER_PROFILE: sGone3 + '/prof', AGENT_BROWSER_CONFIG: sGone3 + '/cfg.json' }, born: OLD });   // the FIELD shape: cwd a checkout, only the env roots ⇒ reap
  mk(703, { name: 'chrome', argv: ['/opt/chrome/chrome', '--type=renderer'], ppid: 701, cwd: '/', env: { AGENT_BROWSER_SOCKET_DIR: sGone2 + '/sock' }, born: OLD });   // a Chrome child: walks up through its fellow member to init ⇒ reap
  // THE OWNED-SHELL CONTROL (the pin that used to say "an unlisted executable is never a candidate
  // even under a gone scratch root", flipped): a user's shell whose cwd is a deleted scratch dir,
  // parented by a LIVE terminal outside the group, is owned by somebody alive ⇒ never listed.
  mk(610, { name: 'gnome-terminal-server', argv: ['/usr/libexec/gnome-terminal-server'], ppid: 1, cwd: HOME_OF_OWNER, env: { HOME: HOME_OF_OWNER } });
  mk(600, { name: 'zsh', argv: ['zsh'], ppid: 610, cwd: sGone4, env: { HOME: HOME_OF_OWNER }, born: OLD });
  // a suite IN FLIGHT whose own scratch dir is already gone: its server is owned by the live runner ⇒ spared
  mk(110, { name: 'node', argv: ['node', 'server.js'], ppid: 201, cwd: sGone4, born: OLD });
  // the dir EXISTS and the group is stale + unowned: only the executables a suite starts (the name allowlist
  // survives ONLY for this rule — the dir is still there, the name is the one extra fact that it is a suite's)
  mk(320, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: sOld, born: OLD });
  const list = scratchOrphans({ procRoot: root, now: NOW, self: 999999 });
  const pids = list.map((o) => o.pid).sort((a, b) => a - b);
  const EXPECT = [100, 300, 310, 500, 601, 700, 701, 702, 703];
  ok(JSON.stringify(pids) === JSON.stringify(EXPECT), `reaped exactly the gone-dir daemon, the stale orphan tree, the orphan dtach client, the orphans of every name under a gone root and the agent-browser/Chrome shapes (got ${JSON.stringify(pids)})`);
  ok(JSON.stringify(scratchRootsOf({ cwd: '/', env: { AGENT_BROWSER_CONFIG: '/tmp/vs-a-1/c.json', HOME: '/tmp/vs-h-1' }, argv: ['x', '--user-data-dir', '/tmp/vs-u-1/p'] })) === JSON.stringify(['/tmp/vs-h-1', '/tmp/vs-a-1', '/tmp/vs-u-1']) && ROOT_ENV.includes('AGENT_BROWSER_SOCKET_DIR') && ROOT_ENV.includes('AGENT_BROWSER_PROFILE') && ROOT_ENV.includes('AGENT_BROWSER_CONFIG'), 'the ROOTS a process names: cwd, HOME, the device/agentd roots, AGENT_BROWSER_SOCKET_DIR/_PROFILE/_CONFIG and a --user-data-dir (both spellings), in that order');
  ok(['agent-browser-linux-x64', 'headless_shell'].every((n) => list.some((o) => o.name === n && o.why === 'scratch dir gone')) && list.find((o) => o.pid === 702).root === sGone3 && list.find((o) => o.pid === 701).root === sGone2, 'the agent-browser daemon and the headless_shell are BOTH listed \'scratch dir gone\' — one rooted only by env AGENT_BROWSER_SOCKET_DIR (cwd a checkout), one only by --user-data-dir (cwd /)');
  ok(!pids.includes(600), 'THE OWNED-SHELL CONTROL: a `zsh` under a gone scratch root whose parent is a LIVE process outside the group (its terminal) is owned ⇒ never listed');
  ok(!pids.includes(110), 'a gone root lists only what nobody alive outside the group owns: a server its live runner still parents is spared (the next sweep after the runner exits takes it)');
  ok(pids.includes(300) && !pids.includes(320), 'the name allowlist survives ONLY for the not-gone/stale rule: a stale unowned group under an EXISTING dir gives up its node processes, never an unlisted executable');
  ok(list.find((o) => o.pid === 100).why === 'scratch dir gone' && /^orphaned 30 min/.test(list.find((o) => o.pid === 300).why), 'each verdict says which rule fired');
  ok(!pids.includes(200) && !pids.includes(202) && !pids.includes(201), 'a suite in flight (owned by a live runner) keeps its server AND its detached daemon');
  ok(!pids.includes(301), 'a reparented process younger than the stale floor is a possible run in flight and is spared');
  ok(!pids.includes(101) && /^young: /.test((judgeScratch({ procRoot: root, now: NOW, self: 999999 }).spared.find((o) => o.pid === 101) || {}).why || ''), 'B-1d08 (c): a reparented process under a GONE root that is younger than the stale floor is spared too, and says why (incident ①: one fast tier reaped the stray another run\'s suite had just planted under a dir it had already removed)');
  ok(!pids.includes(400), 'the production server (cwd in a checkout, HOME the real home) is never a candidate');
  ok(pids.includes(601) && !REAP_NAMES.has('sleep') && !REAP_NAMES.has('agent-browser-linux-x64'), 'an unlisted executable IS a candidate under a gone scratch root when nobody alive owns it (the name is not evidence; the root and the ownership are)');
  const spared = scratchOrphans({ procRoot: root, now: NOW, self: 999999, staleMs: 24 * 3600 * 1000 });
  ok(!spared.some((o) => o.pid === 300) && !spared.some((o) => o.pid === 100) && !spared.length, 'the stale floor is a parameter, and every rule answers to it (B-1d08 (c)): a 24 h floor spares the reparented tree AND the 30-min-old rows under a gone dir');
  const asSelf = scratchOrphans({ procRoot: root, now: NOW, self: 310 });
  ok(!asSelf.some((o) => o.pid === 310 || o.pid === 300), 'this process and its ancestors are never candidates (a reaper does not reap itself)');
  const wired = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  // lane fast-budget (2026-10-04): the fast tier runs over lanes too — its laneWorker sweeps after every suite like the heavy one,
  // and the sync runner this pin used to hold (`const ms = Date.now() - t; try { reapScratchOrphans({}); }`) is gone
  const fastAt = wired.indexOf('async function fastGate('), fastBody = fastAt < 0 ? '' : wired.slice(fastAt, wired.indexOf('\n}\n', fastAt));
  ok(/runSuiteAsync\(/.test(fastBody) && /console\.log\(r\.lines\.join\('\\n'\)\);\n(?:\s*\/\/[^\n]*\n)*\s*try \{ await reapScratchOrphansAsync\(\{\}\); \}/.test(fastBody) && !/function runSuite\(/.test(wired), 'WIRING: every suite of the FAST tier\'s lanes is followed by a sweep (the async twin), and no sync suite runner is left to skip one');
  ok(/function heavyLaunch\(sha, \{ dir, only, lock, lockWaitMs, range \} = \{\}\) \{\n\s*const d = markerDir\(dir\);\n\s*try \{ reapScratchOrphans\(/.test(wired), 'WIRING: a heavy launch sweeps before it starts');
  // …AND THE LANES (2026-09-16): the heavy tier runs every suite through runSuiteAsync from laneWorker, never through runSuite — the sync pin above would stay green while the lanes reaped nothing (the verifier's integration finding)
  ok(/console\.log\(r\.lines\.join\('\\n'\)\);\n(?:\s*\/\/[^\n]*\n)*\s*try \{ await reapScratchOrphansAsync\(\{\}\); \}/.test(wired), 'WIRING: every LANE sweeps after each suite completes (the async twin — the sync reaper would block the other lanes)');
  ok(typeof (await import('./ci.mjs')).reapScratchOrphansAsync === 'function', '…and the async twin is exported');
  ok(/if \(arg\('reap'\)\)/.test(wired), 'WIRING: `--reap` runs the sweep by hand');
  // B-a965 (2026-09-24): a sweep NAMES EVERY PID IT KILLS. A stray `ci.mjs --help` reaped
  // 34 processes under 22 roots (one of them a lane's own detached servers under
  // /tmp/vs-work) and the log said only which roots — nothing to attribute a dead
  // server to. Each victim carries its command head + ppid; both reapers print
  // one line per pid through the ONE report function.
  const report = reapReport(list);
  ok(report.length === list.length + 1 && /^\[ci\] reaping 9 scratch orphan process\(es\) from 4 finished scratch dir\(s\)/.test(report[0]), `the report is the head line + one line per victim (got ${report.length} lines for ${list.length} victims: ${report[0]})`);
  ok(list.every((o) => report.some((l) => l.includes(`pid ${o.pid} `) && l.includes(o.root) && l.includes(o.why))), 'every victim line names the pid, its root and the rule that fired');
  ok(report.some((l) => /pid 500 \(ppid 1\) dtach: dtach -a \S+cw-1 — root/.test(l)), 'a victim line carries the command head (argv[0..3]) — what the dead process WAS, not only its name');
  ok(/export function reapScratchOrphans\([^)]*\) \{\n\s*const seam = opts\.procRoot \? null : procRootSeam\(\);[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*const table = seam \|\| opts\.procRoot;[^\n]*\n\s*if \(!hasProcRoot\(table\)\) return \[\];[^\n]*\n\s*const lock = acquireReaperLock\(\{ lockPath, waitMs: lockWaitMs \}\);\n\s*if \(!lock\.ok\) \{ log\(skipLine\(lock\.why\)\);[^\n]*\n\s*if \(seam\) log\(seamLine\(seam\)\);\n\s*try \{\n\s*const list = scratchOrphans\(\{ \.\.\.opts, procRoot: table \}\);\n\s*if \(!list\.length\) return list;\n\s*for \(const line of reapReport\(list\)\) log\(line\);/.test(wired) && /export async function reapScratchOrphansAsync\([^)]*\) \{\n\s*const seam = opts\.procRoot \? null : procRootSeam\(\);[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*const table = seam \|\| opts\.procRoot;[^\n]*\n\s*if \(!hasProcRoot\(table\)\) return \[\];[^\n]*\n\s*const lock = await acquireReaperLockAsync\(\{ lockPath, waitMs: lockWaitMs \}\);\n\s*if \(!lock\.ok\) \{ log\(skipLine\(lock\.why\)\);[^\n]*\n\s*if \(seam\) log\(seamLine\(seam\)\);\n\s*try \{\n\s*const list = scratchOrphans\(\{ \.\.\.opts, procRoot: table \}\);\n\s*if \(!list\.length\) return list;\n\s*for \(const line of reapReport\(list\)\) log\(line\);/.test(wired), 'WIRING: BOTH reapers (sync + the lanes\' async twin) resolve the test seam first (a refused one throws — verify r1 K7), hand that ONE resolution to the judge (verify r3 T3: announced = judged), take the sweep lock (a skip is said), announce a fake table, then print the per-pid report before the first SIGTERM (B-1d08)');
  // `--reap` BY HAND PRINTS EVERY VICTIM (lane H verify r1): the operator sees what it killed. Driven over a
  // fake proc root whose ONE victim is a real process this suite started (never anything else on the box):
  // a detached `sleep` (reparented, so its reaper is init, not us), named as the field daemon.
  const victim = Number(spawnSync('bash', ['-c', 'sleep 120 >/dev/null 2>&1 & echo $!'], { encoding: 'utf-8' }).stdout.trim());
  const root2 = mktmp('procroot-reap');
  const mk2 = (pid, { name, argv, ppid, cwd, env = {} }) => { const d = path.join(root2, String(pid)); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`); fs.writeFileSync(path.join(d, 'cmdline'), (argv || [name]).join('\0') + '\0'); fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0'); fs.symlinkSync(cwd, path.join(d, 'cwd')); fs.utimesSync(d, OLD / 1000, OLD / 1000); };
  const lock2 = path.join(root2, 'reaper.lock');   // this leg's OWN sweep lock (B-1d08) — never contends with a real tier's sweep
  mk2(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
  if (Number.isInteger(victim) && victim > 1) {
    mk2(victim, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: prodCwd, env: { AGENT_BROWSER_SOCKET_DIR: sGone3 + '/sock' } });
    const dryLines = []; reapByHand({ dryRun: true, procRoot: root2, self: 999999, log: (m) => dryLines.push(m) });
    const aliveNow = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
    ok(dryLines.some((l) => l.includes(`pid ${victim} (ppid 1) agent-browser-linux-x64: /opt/ab/bin/agent-browser-linux-x64 — root ${sGone3} — scratch dir gone`)) && /--dry-run: 1 process\(es\) listed above, none signalled/.test(dryLines[dryLines.length - 1]) && aliveNow(victim), '`--reap --dry-run` prints the per-pid report and signals nothing (the victim still runs)', dryLines);
    const lines = []; reapByHand({ procRoot: root2, self: 999999, log: (m) => lines.push(m), graceMs: 2000, lockPath: lock2 });
    let dead = false; for (let i = 0; i < 40 && !(dead = !aliveNow(victim)); i++) spawnSync('sleep', ['0.05']);
    ok(/^\[ci\] reaping 1 scratch orphan process\(es\) from 1 finished scratch dir\(s\)/.test(lines[0] || '') && lines.some((l) => l.includes(`pid ${victim} (ppid 1) agent-browser-linux-x64`) && l.includes('scratch dir gone')) && /^\[ci\] reaped 1 of 1 scratch orphan process\(es\)$/.test(lines[lines.length - 1] || '') && dead, `\`--reap\` BY HAND names every pid it kills (head + one line per victim, before the first SIGTERM) and closes with the count — the victim is gone`, lines);
    try { process.kill(victim, 'SIGKILL'); } catch { }
  } else ok(false, `could not start the reap leg's own victim process (got ${JSON.stringify(victim)})`);
  ok(/if \(arg\('reap'\)\) \{ process\.exit\(reapByHand\(\{ dryRun: !!arg\('dry-run'\) \}\)\); \}/.test(wired) && /export function reapByHand\([^)]*\) \{[\s\S]{0,400}for \(const line of verdictReport\(judgeScratch\(\{ \.\.\.opts, procRoot: seam \|\| opts\.procRoot \}\)\)\) log\(line\);[\s\S]{0,200}const list = reapScratchOrphans\(\{ log, \.\.\.opts \}\);/.test(wired), 'WIRING: `--reap` goes through reapByHand — the verdicts printed through the operator\'s log on both paths, `--dry-run` signalling nothing');
  // NEGATIVE CONTROLS (scripts/mutant-copy.mjs, each copy ONE edit, loaded beside the real modules): the legs above can go red.
  const M9 = mutantCopies('cigate9-reaper', REPO);
  const src9 = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  const mutant9 = async (tag, from, to) => { if (!src9.includes(from)) return { missing: from }; const f = M9.write('scripts/ci.mjs', src9.replace(from, to), tag); return import(pathToFileURL(f).href); };
  const pidsOf = (mod) => (mod && mod.scratchOrphans ? mod.scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).map((o) => o.pid).sort((a, b) => a - b) : null);
  const cA = await mutant9('name-gate', "    const claims = scratchRootClaims(i); if (!claims.length) continue;", "    if (!reapNamed(i.a0)) continue; const claims = scratchRootClaims(i); if (!claims.length) continue;");
  const pA = pidsOf(cA);
  ok(pA && !pA.includes(700) && !pA.includes(701) && !pA.includes(702) && !pA.includes(601) && pA.includes(100), `CONTROL (a): the pre-fix NAME GATE before the evidence (a copy) drops the agent-browser daemons, the headless_shell and the unlisted orphan — exactly the field leak (got ${JSON.stringify(pA || cA)})`);
  const cB = await mutant9('old-roots', "export const ROOT_ENV = ['HOME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT', 'AGENT_BROWSER_SOCKET_DIR', 'AGENT_BROWSER_PROFILE', 'AGENT_BROWSER_CONFIG'];", "export const ROOT_ENV = ['HOME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT'];");
  const pB = pidsOf(cB);
  ok(pB && !pB.includes(702) && pB.includes(700), `CONTROL (b): a copy whose roots are the pre-fix four (cwd/HOME/device/agentd) never sees the field daemon rooted only by AGENT_BROWSER_SOCKET_DIR (got ${JSON.stringify(pB || cB)})`);
  // (verify r2: the flag is ALSO read off the joined cmdline now — this control drops BOTH readings, one copy)
  const uddNul = "if (a.startsWith('--user-data-dir=')) cands.push({ p: a.slice('--user-data-dir='.length), via: '--user-data-dir', dir: true });", uddJoined = "  if (joined) for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push({ p: m[1], via: '--user-data-dir', dir: true });\n";
  // (2.369.180, lanes N + H integrated: lane N's argv roots are a THIRD reading of the same flag — `--user-data-dir=<scratch>`
  // is a `<flag>=` element — so the copy drops that line too; without it the control proves nothing)
  const argvRootsLine = "  cands.push(...argvScratchClaims(argv, { joined })); // lane N: a root named only in the arguments (dtach / pty-wrapper)\n";
  const cU = src9.includes(uddNul) && src9.includes(uddJoined) && src9.includes(argvRootsLine) ? await import(pathToFileURL(M9.write('scripts/ci.mjs', src9.replace(uddNul, 'if (false) cands.push(a);').replace(uddJoined, '').replace(argvRootsLine, ''), 'no-udd')).href) : { missing: 'a --user-data-dir reading line' };
  const pU = pidsOf(cU);
  ok(pU && !pU.includes(701) && pU.includes(700), `CONTROL (c): a copy that ignores --user-data-dir never sees the headless_shell whose cwd is / (got ${JSON.stringify(pU || cU)})`);
  const cO = await mutant9('gone-lists-all', "          if (!orphaned(i)) kept.push(at(i, { why: 'owned by a live process outside the root' }));", "          if (false) kept.push(at(i, { why: 'owned by a live process outside the root' }));");
  const pO = pidsOf(cO);
  ok(pO && pO.includes(600) && pO.includes(110), `CONTROL (d): a copy whose gone rule lists every member regardless of ownership reaps the user's owned shell and the in-flight server — the owned-shell leg can go red (got ${JSON.stringify(pO || cO)})`);
  // ── LANE H VERIFY r2 (2026-09-25): three more holes in the evidence ──────────────────────────────────────────
  // M2: the product's OWN socket-dir fallback `/tmp/vs-ab-<uid>` (src/browser-profiles.js socketDirDecision, the long-home
  //     remedy) has the scratch shape, and AGENT_BROWSER_SOCKET_DIR is a ROOT — a production browser rooted there was a
  //     candidate (listed 'scratch dir gone' when a tmp cleaner took the dir, 'orphaned' by name when it did not).
  // L3: a Chrome that rewrote its process title has ONE space-joined /proc cmdline (a CfT build: 1 NUL, measured on 12 of
  //     this box's Chromes) — its --user-data-dir root was invisible, and /usr/bin/google-chrome's a0 fails the `chrome*` rule.
  // L7: a sub-agent's browser under one gone root whose parent is itself a victim under ANOTHER gone root was spared for a sweep.
  {
    const CI = await import('./ci.mjs');
    const root3 = mktmp('procroot-r2');
    const mk3 = (pid, { name, argv, raw = null, comm = null, ppid, cwd, env = {}, born = OLD }) => {
      const d = path.join(root3, String(pid)); fs.mkdirSync(d);
      fs.writeFileSync(path.join(d, 'stat'), `${pid} (${(comm || name).slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`);
      fs.writeFileSync(path.join(d, 'cmdline'), raw != null ? raw : (argv || [name]).join('\0') + '\0');   // `raw` = a title-rewritten Chrome: ONE string, no NUL at all
      if (comm) fs.writeFileSync(path.join(d, 'comm'), comm + '\n');
      fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
      fs.symlinkSync(cwd, path.join(d, 'cwd'));
      fs.utimesSync(d, born / 1000, born / 1000);
    };
    const PROD_AB = '/tmp/vs-ab-4242';   // the product's fallback shape for a uid no one on this box has — never created, never deleted; its presence is the `exists` parameter
    const sGone5 = `/tmp/vs-cigate9-gone5-${process.pid}-nowhere`, sGone6 = `/tmp/vs-cigate9-gone6-${process.pid}-nowhere`, sGone7 = `/tmp/vs-cigate9-gone7-${process.pid}-nowhere`, sGone8 = `/tmp/vs-cigate9-gone8-${process.pid}-nowhere`;
    const sOld3 = scratch('old3');
    mk3(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
    // M2: a production daemon + its Chrome whose ONLY root is the product's socket-dir fallback (cwd a checkout, 20 min old, ppid systemd)
    mk3(801, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: prodCwd, env: { HOME: HOME_OF_OWNER, AGENT_BROWSER_SOCKET_DIR: PROD_AB } });
    mk3(802, { name: 'chrome', argv: ['/opt/google/chrome/chrome', '--headless=new', '--user-data-dir=/tmp/agent-browser-chrome-0000'], ppid: 801, cwd: prodCwd, env: { HOME: HOME_OF_OWNER, AGENT_BROWSER_SOCKET_DIR: PROD_AB } });
    mk3(803, { name: 'chrome', argv: ['/opt/google/chrome/chrome'], ppid: 1, cwd: prodCwd, env: { AGENT_BROWSER_SOCKET_DIR: '/tmp/vs-ab-u' } });
    // L3: a CfT Chrome's title-rewritten cmdline (no NUL) rooted ONLY by its --user-data-dir under a gone root, both spellings
    mk3(811, { name: 'chrome', raw: `/home/u/.agent-browser/browsers/chrome-151.0.7922.34/chrome --headless=new --no-first-run --user-data-dir=${sGone5}/prof --window-size=1280,720`, ppid: 1, cwd: prodCwd });
    mk3(813, { name: 'chrome', raw: `/opt/cft/chrome --headless --user-data-dir ${sGone6}/prof --no-sandbox`, ppid: 1, cwd: '/' });
    // L3: /usr/bin/google-chrome under an EXISTING stale scratch dir: a0 'google-chrome', its /proc comm 'chrome' — the name rule
    mk3(812, { name: 'google-chrome', comm: 'chrome', argv: ['/usr/bin/google-chrome', '--headless=new', `--user-data-dir=${sOld3}/prof`], ppid: 1, cwd: prodCwd });
    // L7: a parent (agent-browser under gone root 7) and its Chrome child (only root: its --user-data-dir under gone root 8)
    mk3(140, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: sGone7 });
    mk3(141, { name: 'chrome', argv: ['/opt/google/chrome/chrome', `--user-data-dir=${sGone8}/prof`], ppid: 140, cwd: prodCwd });
    const present = (d) => d === PROD_AB || d === '/tmp/vs-ab-u' || fs.existsSync(d);
    const absent = (d) => (d === PROD_AB || d === '/tmp/vs-ab-u') ? false : fs.existsSync(d);
    const list3 = (mod, exists) => mod.scratchOrphans({ procRoot: root3, now: NOW, self: 999999, exists });
    const r3p = list3(CI, present), r3g = list3(CI, absent);
    const ids = (l) => l.map((o) => o.pid).sort((a, b) => a - b);
    ok(![801, 802, 803].some((p) => ids(r3p).includes(p)) && ![801, 802, 803].some((p) => ids(r3g).includes(p)), `r2 M2: a production daemon + Chrome rooted ONLY in the product's socket-dir fallback /tmp/vs-ab-<uid> (and /tmp/vs-ab-u) is never listed — dir present (got ${JSON.stringify(ids(r3p))}) AND dir gone (got ${JSON.stringify(ids(r3g))})`);
    const B0 = createRequire(import.meta.url)('../src/browser-profiles.js');
    const prodDir = B0.socketDirDecision({ browserKey: 'bk-00000001', home: '/home/' + 'x'.repeat(60), uid: 1000 }).dir;
    ok(JSON.stringify(scratchRootsOf({ env: { AGENT_BROWSER_SOCKET_DIR: '/tmp/vs-ab-1000' } })) === '[]' && JSON.stringify(scratchRootsOf({ env: { AGENT_BROWSER_SOCKET_DIR: prodDir } })) === '[]' && prodDir === '/tmp/vs-ab-1000' && JSON.stringify(scratchRootsOf({ cwd: '/tmp/vs-ab-1000/namespaces/vs-bk-1/run' })) === '[]', `r2 M2: scratchRootsOf answers [] for the product's own root — the literal AND the one browser-profiles.socketDirDecision computes (${prodDir}), a path under it too`);
    ok(JSON.stringify(scratchRootsOf({ cwd: '/tmp/vs-abc-77' })) === '["/tmp/vs-abc-77"]' && JSON.stringify(scratchRootsOf({ cwd: '/tmp/vs-ab-1000x' })) === '["/tmp/vs-ab-1000x"]', 'r2 M2: …only the product\'s exact shape is excluded (a `vs-abc-<n>` / `vs-ab-<n>x` scratch dir is still scratch)');
    let scratchAbThrew = false; try { (await import('./scratch.mjs')).scratch('ab'); } catch { scratchAbThrew = true; }
    ok(scratchAbThrew, 'r2 M2: scripts/scratch.mjs refuses to mint `vs-ab-<pid>` — a suite can never take the product\'s shape');
    const o811 = r3g.find((o) => o.pid === 811), o813 = r3g.find((o) => o.pid === 813), o812 = r3g.find((o) => o.pid === 812);
    ok(o811 && o811.name === 'chrome' && o811.root === sGone5 && o811.why === 'scratch dir gone' && o813 && o813.root === sGone6, `r2 L3: a title-rewritten Chrome (ONE space-joined cmdline, no NUL) is rooted by its --user-data-dir (both spellings) and named 'chrome' — listed 'scratch dir gone' (got ${JSON.stringify([o811, o813])})`);
    ok(o812 && o812.name === 'google-chrome' && /^orphaned/.test(o812.why), `r2 L3: /usr/bin/google-chrome (a0 'google-chrome', /proc comm 'chrome') passes the stale rule's name check through its comm (got ${JSON.stringify(o812)})`);
    ok(ids(r3g).includes(140) && ids(r3g).includes(141), `r2 L7: a Chrome under one gone root whose parent is itself a victim under ANOTHER gone root is listed in the SAME sweep (got ${JSON.stringify(ids(r3g))})`);
    // CONTROLS (M9, one edit each): the pre-fix rules
    const cE = await mutant9('admits-vs-ab', '    if (!m || PRODUCT_ROOT_RE.test(m[0])) continue;', '    if (!m) continue;');
    const pE = cE && cE.scratchOrphans ? ids(list3(cE, absent)) : null;
    ok(pE && pE.includes(801) && pE.includes(802), `CONTROL (e): a copy whose root rule admits /tmp/vs-ab-<uid> lists the production daemon and its Chrome when the dir is gone (got ${JSON.stringify(pE || cE)})`);
    // (2.369.180: the copy also reads lane N's argv roots EXACTLY — their joined branch reads a title's words too)
    const cF = src9.includes(uddJoined) && src9.includes(argvRootsLine) ? await import(pathToFileURL(M9.write('scripts/ci.mjs', src9.replace(uddJoined, '').replace(argvRootsLine, argvRootsLine.replace('{ joined }', '{ joined: false }')), 'no-joined')).href) : { missing: 'the joined --user-data-dir / argv-roots reading line' };
    const pF = cF && cF.scratchOrphans ? ids(list3(cF, absent)) : null;
    ok(pF && !pF.includes(811) && pF.includes(141), `CONTROL (f): a copy that reads --user-data-dir off NUL-separated argv only never sees the title-rewritten Chrome (got ${JSON.stringify(pF || cF)})`);
    const cG = await mutant9('no-comm', 'const reapNamedProc = (i) => reapNamed(i.a0) || (!!i.comm && reapNamed(i.comm));', 'const reapNamedProc = (i) => reapNamed(i.a0);');
    const pG = cG && cG.scratchOrphans ? ids(list3(cG, absent)) : null;
    ok(pG && !pG.includes(812) && pG.includes(811), `CONTROL (g): a copy whose name rule reads only argv[0] spares /usr/bin/google-chrome under the stale rule (got ${JSON.stringify(pG || cG)})`);
    const cH = await mutant9('one-pass', 'if (!inGroup.has(p.pid)) return victimPids.has(p.pid);', 'if (!inGroup.has(p.pid)) return false;');
    const pH = cH && cH.scratchOrphans ? ids(list3(cH, absent)) : null;
    ok(pH && pH.includes(140) && !pH.includes(141), `CONTROL (h): a copy whose ownership walk does not know this sweep's victims spares the child for a sweep (got ${JSON.stringify(pH || cH)})`);
  }
  // ── LANE H VERIFY r3 (2026-09-25) ──────────────────────────────────────────────────────────────────────────────
  // MINOR 2: a NUL-separated argv is read EXACTLY — the joined-string scan (a title-rewritten Chrome, ONE string) runs
  //          only when the cmdline has NO NUL; a flag merely MENTIONED inside another argument (`sh -c '…'`, a script's
  //          code) roots nothing (r2 ran the joined scan over every argv).
  // LOW 4:   the fixpoint is bounded by the candidates — a chain of 10 gone groups is listed in ONE sweep (a cap of 8
  //          listed 8, the rest the next sweep).
  {
    const CI = await import('./ci.mjs');
    const root4 = mktmp('procroot-r3');
    const mk4 = (pid, { name, argv, raw = null, ppid, cwd, env = {}, born = OLD }) => {
      const d = path.join(root4, String(pid)); fs.mkdirSync(d);
      fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`);
      fs.writeFileSync(path.join(d, 'cmdline'), raw != null ? raw : (argv || [name]).join('\0') + '\0');
      fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
      fs.symlinkSync(cwd, path.join(d, 'cwd'));
      fs.utimesSync(d, born / 1000, born / 1000);
    };
    const g4 = (n) => `/tmp/vs-cigate9-r3gone${n}-${process.pid}-nowhere`;
    mk4(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
    for (let i = 0; i < 10; i++) mk4(900 + i, { name: 'sleep', argv: ['sleep', '600'], ppid: i === 0 ? 1 : 899 + i, cwd: g4(i) });
    mk4(950, { name: 'sh', argv: ['sh', '-c', `exec chrome --user-data-dir=${g4(50)}/p`], ppid: 1, cwd: prodCwd });   // MENTIONS the flag inside ONE argument
    mk4(951, { name: 'chrome', raw: `/opt/chrome --headless --user-data-dir=${g4(51)}/p --window-size=1`, ppid: 1, cwd: prodCwd });   // a title-rewritten Chrome (no NUL)
    mk4(952, { name: 'chrome', argv: ['/opt/chrome', `--user-data-dir=${g4(52)}/pro file`, '--headless'], ppid: 1, cwd: prodCwd });   // NUL argv, a SPACE in the value
    const ids4 = (mod) => (mod && mod.scratchOrphans ? mod.scratchOrphans({ procRoot: root4, now: NOW, self: 999999, exists: (d) => fs.existsSync(d) }).map((o) => o.pid).sort((a, b) => a - b) : null);
    const l4 = ids4(CI);
    const chain = Array.from({ length: 10 }, (_, i) => 900 + i);
    ok(l4 && chain.every((p) => l4.includes(p)), `r3 LOW 4: a chain of 10 gone groups (each one's parent the previous one's victim) is listed in ONE sweep — ${l4 ? chain.filter((p) => l4.includes(p)).length : 0} of 10 (got ${JSON.stringify(l4)})`);
    ok(l4 && !l4.includes(950) && l4.includes(951) && l4.includes(952), `r3 MINOR 2: a NUL-separated argv that only MENTIONS --user-data-dir inside one argument (sh -c '…') roots nothing; a title-rewritten Chrome (no NUL) is still rooted off its words; a NUL argv whose value has a space is rooted by the exact element (got ${JSON.stringify(l4)})`);
    const eq4 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    ok(eq4(scratchRootsOf({ argv: ['sh', '-c', 'exec chrome --user-data-dir=/tmp/vs-q-1/p'] }), []) && eq4(scratchRootsOf({ argv: ['/opt/chrome --user-data-dir=/tmp/vs-q-1/p --x'] }), ['/tmp/vs-q-1']) && eq4(scratchRootsOf({ argv: ['/opt/chrome', '--user-data-dir=/tmp/vs-q-2/a b'] }), ['/tmp/vs-q-2']) && eq4(scratchRootsOf({ argv: ['x', 'y --user-data-dir=/tmp/vs-q-3/p'], joined: true }), ['/tmp/vs-q-3']), 'r3 MINOR 2: scratchRootsOf reads the words of a cmdline only when it was ONE string (`joined`; default: a one-element argv), the exact elements otherwise');
    // CONTROLS (M9, one edit each)
    const cI = await mutant9('cap-8', 'const maxRounds = [...groups.values()].reduce((n, m) => n + m.length, 0) + 1;', 'const maxRounds = 8;');
    const pI = ids4(cI);
    ok(pI && chain.filter((p) => pI.includes(p)).length === 8, `r3 LOW 4 CONTROL: a copy capped at 8 rounds lists ${pI ? chain.filter((p) => pI.includes(p)).length : '?'} of the chain of 10 in one sweep — the leg above can go red (got ${JSON.stringify(pI || cI)})`);
    const cJ = await mutant9('joined-always', "  if (joined) for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push({ p: m[1], via: '--user-data-dir', dir: true });", "  for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push({ p: m[1], via: '--user-data-dir', dir: true });");
    const pJ = ids4(cJ);
    ok(pJ && pJ.includes(950), `r3 MINOR 2 CONTROL: a copy that scans the joined words of EVERY argv (r2) roots the sh -c that only mentions the flag and lists it (got ${JSON.stringify(pJ || cJ)})`);
  }
  for (const r of copiesCensus(M9.files, M9.dir, REPO, { minCopies: 6, label: '§9 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

// ── §9b THE SINGLETON DESKTOP'S X SERVER IS A DISPLAY SERVER LIKE ANY OTHER (2026-09-25, the heavy RED on 69720f2b) ──
// src/vnc.js starts `Xtigervnc` — its argv[0] on Debian (`Xvnc` is only a symlink) — so a scratch server's leaked
// singleton under a GONE scratch dir was never a candidate: observed live, pid 3490924 (`/usr/bin/Xtigervnc :7`,
// cwd a deleted /tmp/vs-deskapp-smoke-*) held the machine-global :7/5901 and another run's server adopted it 40 s
// later. The incident's shape over a fake proc root, the stale rule (where the NAME is still the one extra fact)
// with the pre-fix name set in a patched copy as the control, and one DRY RUN on the real /proc: a reparented
// process whose argv[0] is Xtigervnc under a scratch dir whose owner is gone is LISTED once past the stale floor
// (scratchOrphans signals nothing; B-1d08: the dir is kept, its run record names an exited owner).
console.log('\n§9b the reaper judges the singleton Desktop\'s X server (Xtigervnc)');
{
  const root = mktmp('procroot9b');
  const sc = (tag) => { const d = fs.mkdtempSync(`/tmp/vs-cigate9b-${tag}-${process.pid}-`); tmpDirs.push(d); return d; };
  const sStale = sc('stale'), sLive = sc('live');
  const sGone = `/tmp/vs-cigate9b-gone-${process.pid}-nowhere`, hGone = `/tmp/vs-cigate9b-gonehome-${process.pid}-nowhere`;
  const NOW = Date.now(), OLD = NOW - 30 * 60 * 1000;
  const mk = (pid, { name, argv, ppid, cwd, env = {}, born = NOW }) => {
    const d = path.join(root, String(pid)); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`);
    fs.writeFileSync(path.join(d, 'cmdline'), (argv || [name]).join('\0') + '\0');
    fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
    fs.symlinkSync(cwd, path.join(d, 'cwd'));
    fs.utimesSync(d, born / 1000, born / 1000);
  };
  const XARGV = (disp, port) => ['/usr/bin/Xtigervnc', disp, '-localhost', '-SecurityTypes', 'None', '-UseBlacklist', '0', '-rfbport', String(port), '-geometry', '1920x1080', '-depth', '24'];
  mk(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
  mk(700, { name: 'Xtigervnc', argv: XARGV(':7', 5901), ppid: 1, cwd: sGone, env: { HOME: hGone }, born: OLD });                 // THE INCIDENT: a leaked singleton, its scratch dir gone ⇒ reap
  mk(710, { name: 'Xtigervnc', argv: XARGV(':15021', 34021), ppid: 1, cwd: sStale, env: { HOME: sStale }, born: OLD });        // dir exists, reparented, 30 min ⇒ reap BY NAME (the stale rule)
  mk(731, { name: 'node', argv: ['node', 'scripts/test-desktop-app-window.mjs'], ppid: 1, cwd: '/home/u/checkout', born: OLD }); // a live suite …
  mk(730, { name: 'node', argv: ['node', 'server.js'], ppid: 731, cwd: sLive, born: OLD });                                     // … its server …
  mk(732, { name: 'Xtigervnc', argv: XARGV(':15022', 34022), ppid: 1, cwd: sLive, env: { HOME: sLive }, born: OLD });           // … and the Xvnc that server started (detached): the group has a live member ⇒ keep
  mk(740, { name: 'Xtigervnc', argv: XARGV(':7', 5901), ppid: 1, cwd: path.join(HOME_OF_OWNER, 'workspace', 'vibespace'), env: { HOME: HOME_OF_OWNER }, born: OLD }); // PRODUCTION's singleton: no scratch root ⇒ never
  const pids = scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).map((o) => o.pid).sort((a, b) => a - b);
  ok(REAP_NAMES.has('Xtigervnc') && REAP_NAMES.has('Xvnc') && REAP_NAMES.has('Xvfb') && REAP_NAMES.has('x11vnc'), 'every X/picture server a suite can start is a judged name (Xtigervnc, Xvnc, Xvfb, x11vnc)');
  ok(JSON.stringify(pids) === JSON.stringify([700, 710]), `reaped exactly the incident's leaked singleton (gone dir) and the stale reparented one (got ${JSON.stringify(pids)})`);
  ok(!pids.includes(732) && !pids.includes(740), 'a live suite\'s Xvnc and the PRODUCTION singleton (cwd a checkout, HOME the real home) are never candidates');
  // CONTROL: the pre-fix name set in a patched copy of ci.mjs — the stale row is invisible to it
  const M = mutantCopies('cigate9b', REPO);
  const ciSrc = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf8');
  const preFix = ciSrc.replace("'Xvnc', 'Xtigervnc', 'x11vnc'", "'Xvnc', 'x11vnc'");
  ok(preFix !== ciSrc, 'CONTROL: the patched copy really drops Xtigervnc from REAP_NAMES');
  const pre = await import(M.write('scripts/ci.mjs', preFix, 'no-xtigervnc', { esm: true }));
  const prePids = pre.scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).map((o) => o.pid);
  ok(!prePids.includes(710) && !pre.REAP_NAMES.has('Xtigervnc'), `CONTROL: without the name the stale leaked Xtigervnc is never a candidate (pre-fix listed ${JSON.stringify(prePids.sort((a, b) => a - b))})`);
  // THE DRY RUN on the real /proc: a process whose argv[0] IS Xtigervnc (a `sleep` under that name — nothing is
  // started on a display), reparented through a short-lived parent, rooted in a scratch dir whose OWNER is gone.
  // B-1d08: the root STAYS, with a run record naming a process that has exited — a suite never plants a process
  // under a root it has removed (every sweep on the box, another lane's fast tier or a tier on older code, would take
  // it at once: incident ①). The listing moves the CLOCK past the stale floor instead; with the real clock the same
  // seconds-old process is spared.
  const dry = sc('dry');
  const deadOwner = Number(String(spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8', timeout: 10000 }).stdout || '').trim());
  fs.writeFileSync(path.join(dry, '.vs-run.json'), JSON.stringify({ v: 1, run: 'cigate9b-dead-owner', pid: deadOwner, starttime: 1, bootId: '', createdAt: Date.now() }) + '\n');
  const kid = spawnSync(process.execPath, ['-e', "const c = require('child_process').spawn('sleep', ['60'], { argv0: 'Xtigervnc', cwd: process.argv[1], detached: true, stdio: 'ignore' }); c.unref(); console.log(c.pid);", dry], { encoding: 'utf8', timeout: 10000 });
  const dpid = Number(String(kid.stdout || '').trim());
  try {
    const argv0 = (() => { try { return fs.readFileSync(`/proc/${dpid}/cmdline`, 'utf8').split('\0')[0]; } catch { return null; } })();
    const listed = scratchOrphans({ now: Date.now() + 11 * 60 * 1000 }).find((o) => o.pid === dpid);
    ok(deadOwner > 0 && dpid > 0 && argv0 === 'Xtigervnc' && !!listed && listed.name === 'Xtigervnc' && /^owner gone: run cigate9b-dead-owner pid \d+ (is gone|was reused)/.test(listed.why) && listed.root === dry,
      `DRY RUN on the real /proc, the clock past the stale floor: the reparented "Xtigervnc" (pid ${dpid}) under ${dry}, whose run record names an exited owner, is listed — ${listed ? listed.why : 'NOT listed'} (nothing signalled)`);
    const young = judgeScratch({}).spared.find((o) => o.pid === dpid);
    ok(!!young && /^young: /.test(young.why), `…and with the real clock the same seconds-old process is SPARED (${young ? young.why : 'not among the spared'}): a young orphan may be a run in flight or a stray planted on purpose`);
    let alive = true; try { process.kill(dpid, 0); } catch { alive = false; }
    ok(alive, '…and listing signalled nothing: the process is still alive until this suite ends it');
  } finally { if (dpid > 0) { try { process.kill(dpid, 'SIGKILL'); } catch { } } }
}

// ── §9c A ROOT NAMED ONLY IN THE ARGUMENTS (2026-09-25, test-browser-resources' leak) ──
// A worktree server's terminal sessions run with the REAL HOME and cwd `/` or `/tmp`: their scratch root is only in
// their argv (`dtach -c /tmp/vs-browser-res-<pid>/wt/data/sockets/cw-…`, `node …/wt/data/bin/pty-wrapper.js …`) —
// 140 of them from 20 runs were alive and never a candidate. The rule reads a root off any argv token (its start or
// after `=`, a space-joined title too) and never the product's own `/tmp/vs-ab-<uid>`; CONTROL = a patched copy of
// ci.mjs without the argv roots, where the incident's rows are invisible again.
console.log('\n§9c the reaper reads a scratch root off the arguments (dtach / pty-wrapper with the real HOME)');
{
  const root = mktmp('procroot9c');
  const sGone = `/tmp/vs-cigate9c-gone-${process.pid}-nowhere`;
  const sLive = fs.mkdtempSync(`/tmp/vs-cigate9c-live-${process.pid}-`); tmpDirs.push(sLive);
  const NOW = Date.now(), OLD = NOW - 30 * 60 * 1000, REALHOME = HOME_OF_OWNER;
  const mk = (pid, { name, argv, ppid, cwd, env = {}, born = NOW }) => {
    const d = path.join(root, String(pid)); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`);
    fs.writeFileSync(path.join(d, 'cmdline'), (argv || [name]).join('\0') + '\0');
    fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
    fs.symlinkSync(cwd, path.join(d, 'cwd'));
    fs.utimesSync(d, born / 1000, born / 1000);
  };
  mk(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
  mk(800, { name: 'dtach', argv: ['/usr/bin/dtach', '-c', `${sGone}/wt/data/sockets/cw-1-1790380819409`, '-E', '-r', 'none', '-z', 'node', `${sGone}/wt/data/bin/pty-wrapper.js`], ppid: 1, cwd: '/', env: { HOME: REALHOME }, born: OLD });   // THE LEAK: dir gone, root only in argv ⇒ listed
  mk(810, { name: 'node', argv: ['node', `${sGone}/wt/data/bin/pty-wrapper.js`, `${sGone}/wt/data/session-buffers/cw-1.buf`], ppid: 800, cwd: '/tmp', env: { HOME: REALHOME }, born: OLD });                  // its pty-wrapper ⇒ listed with it
  mk(820, { name: 'dtach', argv: ['/usr/bin/dtach', '-c', `${sLive}/wt/data/sockets/cw-2-1790380819410`], ppid: 1, cwd: '/', env: { HOME: REALHOME } });                                                // dir PRESENT + young (a run in flight) ⇒ not
  mk(830, { name: 'chrome', argv: ['/opt/google/chrome/chrome', '--type=renderer', `--user-data-dir=/tmp/vs-ab-${process.getuid?.() ?? 1000}/profiles/x`, '--lang=en-US'], ppid: 1, cwd: '/', env: { HOME: REALHOME }, born: OLD }); // PRODUCTION's socket-dir root ⇒ never
  mk(840, { name: 'node', argv: ['node', 'server.js'], ppid: 1, cwd: path.join(REALHOME, 'workspace', 'vibespace'), env: { HOME: REALHOME }, born: OLD });                                                  // production server ⇒ never
  const pids = scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).map((o) => o.pid).sort((a, b) => a - b);
  ok(JSON.stringify(argvScratchRoots(['dtach', '-c', `${sGone}/wt/data/sockets/cw-1`])) === JSON.stringify([sGone])
    && JSON.stringify(argvScratchRoots([`/opt/chrome --user-data-dir=${sGone}/p --x`])) === JSON.stringify([sGone])
    && JSON.stringify(argvScratchRoots(['chrome', '--user-data-dir', sGone])) === JSON.stringify([sGone])
    && argvScratchRoots(['x', '/tmp/vs-ab-1000/s', '/tmp/vs-ab-u/t', '/home/u/tmp/vs-q-1', 'a/tmp/vs-q-2']).length === 0
    && argvScratchRoots(['sh', '-c', 'exec chrome --user-data-dir=/tmp/vs-q-1/p']).length === 0 && JSON.stringify(argvScratchRoots(['x', '-auth=/tmp/vs-q-4/a'])) === '["/tmp/vs-q-4"]'
    && PRODUCT_ROOT_RE.test('/tmp/vs-ab-1000') && !PRODUCT_ROOT_RE.test('/tmp/vs-abc-1'),
    'argvScratchRoots: an element\'s START or a `<flag>=` element, a space-joined title word by word; never a path MENTIONED inside another argument (lane H r3 MINOR 2, 2.369.180), never the product\'s /tmp/vs-ab-<uid>, never mid-path');
  ok(JSON.stringify(pids) === JSON.stringify([800, 810]), `the leaked dtach and its pty-wrapper (real HOME, root only in argv, dir gone) are listed — and nothing else (got ${JSON.stringify(pids)})`);
  ok(!pids.includes(820) && !pids.includes(830) && !pids.includes(840), 'a young session under a PRESENT scratch dir, a production Chrome under /tmp/vs-ab-<uid> and the production server are never candidates');
  // CONTROL: ci.mjs without the argv roots (the pre-fix candidate set) — the incident's rows are invisible
  const M = mutantCopies('cigate9c', REPO);
  const ciSrc = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf8');
  const preFix = ciSrc.replace('  cands.push(...argvScratchClaims(argv, { joined })); // lane N: a root named only in the arguments (dtach / pty-wrapper)\n', ''); // scratchRootClaims without the argv roots (2.369.180: lane H's function carries them)
  ok(preFix !== ciSrc, 'CONTROL: the patched copy really drops the argv roots from the candidate roots');
  const pre = await import(M.write('scripts/ci.mjs', preFix, 'no-argv-roots', { esm: true }));
  const prePids = pre.scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).map((o) => o.pid);
  ok(!prePids.includes(800) && !prePids.includes(810), `CONTROL: without the argv roots the leaked dtach + pty-wrapper are never candidates (pre-fix listed ${JSON.stringify(prePids)})`);
  // CONTROL: without the product-root exclusion the production Chrome row IS listed (so the row above proves the exclusion)
  const noExcl = ciSrc.replace('if (!PRODUCT_ROOT_RE.test(r) && !out.some((c) => c.p === r + slash))', 'if (!out.some((c) => c.p === r + slash))').replace('    if (!m || PRODUCT_ROOT_RE.test(m[0])) continue;', '    if (!m) continue;');
  ok(noExcl.split('PRODUCT_ROOT_RE.test(').length === ciSrc.split('PRODUCT_ROOT_RE.test(').length - 2, 'CONTROL: the second patched copy really drops BOTH /tmp/vs-ab-<uid> exclusions (argv roots + the candidate roots)');
  const ne = await import(M.write('scripts/ci.mjs', noExcl, 'no-product-root', { esm: true }));
  ok(ne.scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).some((o) => o.pid === 830), 'CONTROL: without the exclusion the production Chrome under /tmp/vs-ab-<uid> would be reaped');
}

// ── §9d THE DIRECTORY SWEEP (B-60d2, 2026-10-07) — the dirs the reaper's evidence frees, and a suite ends what it made ──
// /tmp (tmpfs = RAM + swap) held 30 of 62 GB: 13 986 `vs-*` dirs older than a day. The process reaper never touched a
// directory. scripts/scratch-sweep.mjs dirVerdict is PURE (the table below); its driver runs over a fixture tree here
// (prefixes = a fixture root, `now` shifted a day on); patched copies prove each keep rule is load-bearing.
console.log('\n§9d the directory sweep (B-60d2)');
{
  const SW = await import('./scratch-sweep.mjs');
  const SC = await import('./scratch.mjs');
  const NOW = Date.now(), H = 3600 * 1000, OLD = NOW - 25 * H;
  const base = { now: NOW, mtimeMs: OLD, liveRoots: [] };
  const V = (o) => SW.dirVerdict({ ...base, ...o });
  ok(V({ path: '/tmp/vs-leak-12', name: 'vs-leak-12' }).verdict === 'reap', 'a minted, unheld dir whose newest write is a day old ⇒ reap');
  ok(V({ path: '/tmp/vs-work/verify-quota-r3', name: 'verify-quota-r3' }).verdict === 'reap', 'a verify workspace /tmp/vs-work/<lane> is a declared unit (scratch.mjs SCRATCH_SWEEP)');
  ok(/no minted prefix/.test(V({ path: '/tmp/other-12', name: 'other-12' }).why) && /no minted prefix/.test(V({ path: '/var/tmp/vs-x-1', name: 'vs-x-1' }).why) && /no minted prefix/.test(V({ path: '/tmp/vs-a/b', name: 'b' }).why), 'no minted prefix under a declared root ⇒ keep (a name, /var/tmp, a nested dir)');
  for (const p of ['/tmp/vs-ab-1000', '/tmp/vs-ab-u', '/tmp/vs-dev-1000', '/tmp/vs-work']) ok(/production root/.test(V({ path: p, name: path.basename(p) }).why), `a production root is never reaped: ${p}`);
  ok(/production root/.test(V({ path: '/tmp/vs-wt-1', name: 'vs-wt-1', keepList: ['/tmp/vs-wt-1/repo'] }).why), 'a dir CONTAINING the repo (keepList) ⇒ keep');
  ok(/^held/.test(V({ path: '/tmp/vs-x-1', name: 'vs-x-1', liveRoots: ['/tmp/vs-x-1/home/.cache'] }).why) && V({ path: '/tmp/vs-x-1', name: 'vs-x-1', liveRoots: ['/tmp/vs-x-10'] }).verdict === 'reap', 'a live process naming a path beneath it ⇒ keep (a sibling sharing the name head holds nothing)');
  ok(/^young/.test(V({ path: '/tmp/vs-x-1', name: 'vs-x-1', mtimeMs: NOW - 23 * H }).why), 'a newest write < 24 h ago ⇒ keep');
  ok(/symlink/.test(V({ path: '/tmp/vs-x-1', name: 'vs-x-1', symlink: true, isDir: false }).why) && /not a directory/.test(V({ path: '/tmp/vs-x-1', name: 'vs-x-1', isDir: false }).why), 'a symlink / a file ⇒ keep');
  ok(/owner is alive/.test(V({ path: '/tmp/vs-x-1', name: 'vs-x-1', owner: { alive: true, why: 'pid 7 alive' } }).why), "its run record's owner alive ⇒ keep");
  ok(/unknown/.test(V({ path: '/tmp/vs-x-1', name: 'vs-x-1', mtimeMs: null }).why), 'an unreadable tree ⇒ keep');
  // THE DRIVER over a fixture root, `now` a day on: the leak reaped; the held, the young-inside, the symlink, the unprefixed kept
  const FX = mktmp('sweep9d');
  const mkd = (n, files = 1) => { const d = path.join(FX, n); fs.mkdirSync(path.join(d, 'sub'), { recursive: true }); for (let i = 0; i < files; i++) fs.writeFileSync(path.join(d, 'sub', `f${i}`), 'x'.repeat(5000)); return d; };
  const leak = mkd('vs-leak-1', 3), held = mkd('vs-held-1'), youngIn = mkd('vs-younginside-1'), plainD = mkd('notvs-1');
  const TARGET = mktmp('sweep9d-target'); fs.writeFileSync(path.join(TARGET, 'precious'), 'keep me');
  fs.symlinkSync(TARGET, path.join(FX, 'vs-link-1'));
  const LATER = NOW + 25 * H;
  fs.utimesSync(path.join(youngIn, 'sub', 'f0'), LATER / 1000, LATER / 1000);   // its dir is old, one file beneath it is new
  const prefixes = [{ under: FX, prefix: 'vs-' }];
  const lines = [];
  const dry = SW.sweepScratchDirs({ prefixes, production: [], now: LATER + 1000, liveRoots: [held + '/sub'], dryRun: true, log: (l) => lines.push(l), readOwner: () => null });
  ok(dry.reaped.length === 1 && fs.existsSync(leak) && /dry run, nothing removed/.test(lines.at(-1)), 'the dry run names the one leak and removes nothing');
  lines.length = 0;
  const res = SW.sweepScratchDirs({ prefixes, production: [], now: LATER + 1000, liveRoots: [held + '/sub'], log: (l) => lines.push(l), readOwner: () => null });
  ok(!fs.existsSync(leak) && fs.existsSync(held) && fs.existsSync(youngIn) && fs.existsSync(plainD) && fs.existsSync(path.join(TARGET, 'precious')) && fs.lstatSync(path.join(FX, 'vs-link-1')).isSymbolicLink(), 'the driver reaps the leak only: held, young-inside (newest mtime in the TREE), unprefixed and the symlink (and what it points at) stay');
  ok(new RegExp(`^\\[ci\\] reaped dir ${leak.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — newest write \\d+ h ago, no live process names it — \\d+ KB$`).test(lines[0] || ''), `ONE line per reaped root: ${lines[0]}`);
  ok(/^\[ci\] dir sweep: reaped 1 dir\(s\), \d+ KB \(vs-leak 1 \/ \d+ KB\); kept 3 /.test(lines.at(-1) || ''), `the summary line: ${lines.at(-1)}`);
  let refused = ''; try { SW.removeUnit(path.join(FX, 'vs-link-1'), { prefixes }); } catch (e) { refused = e.message; }
  ok(/symlink/.test(refused) && fs.existsSync(path.join(TARGET, 'precious')), 'removeUnit refuses a symlink even when told to');
  // CONTROLS — patched copies of the module, each without one keep rule, reap what it must not
  const SWSRC = fs.readFileSync(path.join(REPO, 'scripts/scratch-sweep.mjs'), 'utf8');
  const MUT = mktmp('sweep9d-mut'), M9d = mutantCopies('cigate9d', REPO);
  const mutant = async (tag, from, to) => {
    ok(SWSRC.includes(from), `CONTROL ${tag}: the patched line is in scratch-sweep.mjs`);
    return import(pathToFileURL(M9d.write('scripts/scratch-sweep.mjs', SWSRC.replace(from, to), tag)).href);
  };
  const CISRC = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  const mutant9 = async (tag, from, to) => { ok(CISRC.includes(from), `CONTROL ${tag}: the patched line is in ci.mjs`); return import(pathToFileURL(M9d.write('scripts/ci.mjs', CISRC.replace(from, to), tag)).href); };
  const mAge = await mutant('no-age', "if (age < staleMs) return keep(", "if (false) return keep(");
  ok(mAge.dirVerdict({ ...base, path: '/tmp/vs-x-1', name: 'vs-x-1', mtimeMs: NOW - H }).verdict === 'reap', 'CONTROL: without the age rule a dir written an hour ago is reaped (red)');
  const mHeld = await mutant('no-held', "if (held) return keep(", "if (false) return keep(");
  ok(mHeld.dirVerdict({ ...base, path: '/tmp/vs-x-1', name: 'vs-x-1', liveRoots: ['/tmp/vs-x-1/home'] }).verdict === 'reap', 'CONTROL: without the held rule a dir a live process names is reaped (red)');
  const mLink = await mutant('follows', "if (symlink) return keep(", "if (false) return keep(");
  ok(mLink.dirVerdict({ ...base, path: '/tmp/vs-x-1', name: 'vs-x-1', symlink: true }).verdict === 'reap', 'CONTROL: without the symlink rule a link is judged as its target (red)');
  const mTree = await mutant('own-mtime', "if (st.isDirectory()) for (const e of fs.readdirSync(d)) stack.push(path.join(d, e));", "");
  ok(mTree.treeFacts(youngIn, { stopAt: LATER - H }).young === false && SW.treeFacts(youngIn, { stopAt: LATER - H }).young === true, "CONTROL: judging the dir's OWN mtime misses the new file beneath it (red); the tree walk sees it");
  // A SUITE ENDS WHAT IT MADE: scratch.mjs registers a suite's mint and removes it at exit; keepScratch opts out; a helper is never a suite
  const scratchUrl = pathToFileURL(path.join(REPO, 'scripts/scratch.mjs')).href;
  const body = (tag) => `import { scratchDir, keepScratch } from ${JSON.stringify(scratchUrl)};\nconst a = scratchDir('cigate9d-${tag}-a'), b = keepScratch(scratchDir('cigate9d-${tag}-b'));\nconsole.log(JSON.stringify([a, b]));\n${tag === 'throw' ? "throw new Error('a red suite');" : ''}`;
  for (const [file, tag, ends] of [['test-fx9d.mjs', 'ok', true], ['test-fx9d-red.mjs', 'throw', true], ['helper-fx9d.mjs', 'helper', false]]) {
    const f = path.join(MUT, file); fs.writeFileSync(f, body(tag));
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 20000 });
    let made = []; try { made = JSON.parse(r.stdout.trim().split('\n')[0]); } catch { }
    ok(made.length === 2 && fs.existsSync(made[0]) === !ends && fs.existsSync(made[1]), `${file}: ${ends ? 'its scratch dir is gone after exit' + (tag === 'throw' ? ' (a throw too)' : '') + ', the keepScratch one stays' : 'a helper (not a scripts/test-*.mjs) keeps what it made'}`);
    for (const d of made) tmpDirs.push(d);
  }
  let refusedEnd = ''; try { SC.endScratchAtExit('/home/someone/data'); } catch (e) { refusedEnd = e.message; }
  ok(/not a \/tmp\/vs-\* scratch dir/.test(refusedEnd), 'endScratchAtExit refuses a path that is not a scratch dir');
  // THE EVIDENCE: a live process's cwd and XDG_RUNTIME_DIR are held paths (real /proc); a private session bus under a
  // record-less root is a suite's executable; a verify workspace's lane dir is its own root (item 4: dpi-measure)
  const hc = mktmp('sweep9d-heldcwd'), hx = mktmp('sweep9d-heldxdg');
  const sl = spawn('sleep', ['30'], { cwd: hc, env: { PATH: process.env.PATH, XDG_RUNTIME_DIR: hx + '/run' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 150));
  const live = liveScratchPaths({ procRoot: '/proc' });
  sl.kill('SIGKILL');
  ok(live.includes(hc) && live.includes(hx + '/run'), 'liveScratchPaths (real /proc) carries a live process\'s cwd and its XDG_RUNTIME_DIR');
  ok(JSON.stringify(scratchRootsOf({ cwd: '/', env: { HOME: '/tmp/vs-work/dpi-measure/run-1/home', XDG_RUNTIME_DIR: '/tmp/vs-work/dpi-measure/run-1/xdg' } })) === '["/tmp/vs-work/dpi-measure"]' && JSON.stringify(scratchRootsOf({ cwd: '/tmp/vs-work' })) === '["/tmp/vs-work"]', 'a verify workspace lane dir is its own root (/tmp/vs-work/<lane>), XDG_RUNTIME_DIR names it');
  const proc9d = mktmp('procroot9d'), dpi = mktmp('dpi9d');
  const mkp = (pid, { name, ppid, cwd = '/', env = {}, born = NOW - 30 * 60 * 1000 }) => {
    const d = path.join(proc9d, String(pid)); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`);
    fs.writeFileSync(path.join(d, 'cmdline'), `/usr/bin/${name}\0`); fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
    fs.symlinkSync(cwd, path.join(d, 'cwd')); fs.utimesSync(d, born / 1000, born / 1000);
  };
  mkp(1, { name: 'systemd', ppid: 0 });
  const xdgEnv = { HOME: HOME_OF_OWNER, XDG_RUNTIME_DIR: dpi + '/run-1/xdg' };
  mkp(50, { name: 'dbus-run-session', ppid: 1, env: xdgEnv }); mkp(51, { name: 'xdg-desktop-portal', ppid: 1, env: xdgEnv }); mkp(52, { name: 'gvfsd', ppid: 1, env: xdgEnv }); mkp(53, { name: 'sleep', ppid: 1, env: xdgEnv });
  const j = judgeScratch({ procRoot: proc9d, now: NOW, self: 999999 });
  const vp = j.victims.map((o) => o.pid).sort();
  ok(JSON.stringify(vp) === '[50,51,52]' && j.spared.some((o) => o.pid === 53), `a stale private session bus rooted only by XDG_RUNTIME_DIR under a record-less scratch root is reaped (dbus-run-session / xdg-desktop-portal / gvfsd); the name still narrows (sleep spared): ${vp}`);
  const preBus = await mutant9('no-bus', "ROOT_ENV.push('XDG_RUNTIME_DIR');", '');
  ok(!preBus.scratchOrphans({ procRoot: proc9d, now: NOW, self: 999999 }).length, 'CONTROL: without XDG_RUNTIME_DIR as a root the session bus names no root — nothing reaped, its dir held for ever (red)');
}

// ── §10 THE LAUNCHER, ONCE, FOR REAL (B-f4cb, 2026-09-27) ────────────────
// test-ci-heavy-launch (131 s: eight real launches, each a worktree + a real
// build + a suite) moved to the heavy tier by THE TIER RULE. Its header named
// why it had been fast: the launcher is a SILENT-FAILURE path — if detaching
// breaks, nothing throws, the heavy tier simply never runs again and
// `ci:status` stays empty, which looks exactly like "nobody pushed lately"; a
// guard for that has to run on every push, not in the tier it guards. This is
// that guard, kept on every push at stub cost: the REAL `--heavy-launch` in a
// stub repository returns at once, names a SEPARATE detached child in a pid
// file, and that child checks out an isolated worktree, runs the slice, writes
// a green marker naming the sha, removes its pid file and its worktree.
console.log('\n§10 the launcher, once, for real (a stub repository)');
{
  ok(SUITES.some((s) => s.name === STUB_SLICE && s.tier === 'heavy'), `${STUB_SLICE} is a heavy-tier name (the stub legs run it through --only)`);
  ok(SUITES.some((s) => s.name === 'test-ci-heavy-launch' && s.tier === 'heavy'), 'the full launcher battery lives in the heavy tier (this is its push-blocking pin)');
  const st = stubGateRepo('launch');
  const md = path.join(st.root, 'data', 'ci-heavy');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(st.root, 'scripts', 'ci.mjs'), '--heavy-launch', st.sha, '--only=' + STUB_SLICE, '--lock=' + path.join(st.root, 'lock'), '--lock-wait-ms=20000'],
    { cwd: st.root, encoding: 'utf-8', env: GIT_ENV, timeout: 60000 });
  const launchMs = Date.now() - t0;
  ok(r.status === 0 && /launched the FULL tier/.test(r.stderr || ''), `--heavy-launch detaches a run and returns (exit ${r.status}, ${launchMs} ms: ${(r.stderr || '').trim().split('\n').pop()})`);
  const pidFile = path.join(md, `${st.sha}.pid`);
  let pidRec = null; try { pidRec = JSON.parse(fs.readFileSync(pidFile, 'utf-8')); } catch { }
  ok(!!pidRec && pidRec.pid > 0 && pidRec.pid !== process.pid, `a pid file names the SEPARATE detached child (pid ${pidRec && pidRec.pid})`);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const markerOf = () => ['green', 'red'].map((k) => path.join(md, `${st.sha}.${k}`)).find((f) => fs.existsSync(f));
  for (let i = 0; i < 1200 && !markerOf(); i++) await sleep(50);
  const found = markerOf();
  let rec = null; try { rec = JSON.parse(fs.readFileSync(found, 'utf-8')); } catch { }
  ok(!!rec && rec.result === 'green' && rec.sha === st.sha && rec.isolated === true && (rec.partial || []).join() === STUB_SLICE,
    `the detached child wrote a GREEN marker naming the sha, isolated, the slice it ran (${Math.round((Date.now() - t0) / 100) / 10} s; ${rec ? `${rec.result} ${String(rec.sha).slice(0, 8)} isolated=${rec.isolated} partial=${(rec.partial || []).join()}` : 'no marker'})`);
  for (let i = 0; i < 600 && fs.existsSync(pidFile); i++) await sleep(50);
  ok(!fs.existsSync(pidFile), 'the pid file is removed when the run ends (a dead pid must never read as "in flight")');
  const ourWt = pidRec ? `vs-ci-heavy-${st.sha.slice(0, 8)}-${pidRec.pid}` : '(none)';
  let wtGone = false;
  for (let i = 0; i < 600 && !wtGone; i++) {
    const listed = spawnSync('git', ['-C', st.root, 'worktree', 'list'], { encoding: 'utf-8', env: GIT_ENV }).stdout || '';
    wtGone = !listed.includes(ourWt) && !fs.existsSync(path.join(os.tmpdir(), ourWt));
    if (!wtGone) await sleep(50);
  }
  ok(wtGone, `the child's isolated worktree is cleaned up (${ourWt}: no registration, no directory)`);
  if (pidRec) { try { process.kill(-pidRec.pid, 'SIGKILL'); } catch { } try { fs.rmSync(path.join(os.tmpdir(), ourWt), { recursive: true, force: true }); } catch { } }
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
