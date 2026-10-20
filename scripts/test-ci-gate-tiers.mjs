#!/usr/bin/env node
// test-ci-gate-tiers — a PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what the gate guards and why).
// lane fast-tier-ratchet (2026-10-20) split the one 37 s process into seven ≤ 10 s suites, every section's text unchanged;
// the shared kit is scripts/ci-gate-kit.mjs. This part: §6 no fast suite claims a machine-global fixture + no-verdict honesty · §7 no literal date · §8 lanes / the serial table / the impact scope / the full-tier clock · §8d the xpra window family's parts.
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

// ── §6 MACHINE-GLOBAL FIXTURES + "NO VERDICT" HONESTY (round 2) ──────────
// Two rules the round-2 findings turned into asserts.
//
// (a) A FAST-tier suite must not claim a name the whole BOX shares. The fast
//     tier is fail-fast, has no retry and blocks the push directly, so one
//     squatter from any of this machine's ~160 checkouts of this repo turns an
//     unrelated push red. Measured: with a bare listener on :3991,
//     test-attach-ack — which the fast tier reached through the launcher
//     self-test's slice — hung to its budget. The rule covers the slice that
//     test-ci-heavy-launch launches too: it is fast-tier cost by transitivity.
// (b) A run that writes no verdict must say so at the START (so nobody spends
//     sixteen minutes to be told) and must not print "HEAVY GATE GREEN" at the
//     end (a claim about a commit that nobody recorded).
console.log('\n§6 machine-global fixtures + no-verdict honesty');
{
  const srcOf = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } };
  // EVERY tier since 2.369.76 — the heavy tier's machine lock serialises HEAVY
  // RUNS, but the thing that turned 40ad936d red was not a second heavy run:
  // a verifier agent ran test-chat-paging from its own checkout while the
  // heavy tier ran it too, and both claimed `/tmp/vs-chatpage-smoke` + :3990
  // (one's `git worktree remove --force` deleted the other's tree mid-esbuild;
  // the retry's `worktree add` hit the path the other had just recreated).
  // A lock cannot cover a process that never takes it; a name nobody shares
  // can. scripts/scratch.mjs is the shared idiom (per-pid paths, free ports).
  const scanned = SUITES.filter((s) => s.tier === 'fast' || s.tier === 'heavy');
  const offenders = scanned.map((s) => ({ s, f: machineGlobalFixtures(srcOf(s.name)) }))
    .filter(({ f }) => f.ports.length || f.paths.length);
  ok(!offenders.length, `no gated suite (either tier) claims a fixed port or /tmp path (${offenders.map(({ s, f }) => `${s.name}: ${[...f.ports, ...f.paths].join(' ')}`).join('; ') || `${scanned.length} suites clean`})`);
  ok(scanned.some((s) => s.tier === 'heavy') && scanned.some((s) => s.name === 'test-chat-paging'),
    'the scan covers the heavy tier (the suite that collided is in the scanned set)');

  const launcherSrc = srcOf('test-ci-heavy-launch');
  const slice = (/const SLICE = '([^']+)'/.exec(launcherSrc) || [])[1];
  ok(!!slice && SUITES.some((s) => s.name === slice && s.tier === 'heavy'), `the launcher self-test's slice is a heavy suite (${slice})`);
  const sliceF = machineGlobalFixtures(srcOf(slice));
  ok(!sliceF.ports.length && !sliceF.paths.length,
    `…and it claims nothing machine-global either — the FAST tier pays for it (${[...sliceF.ports, ...sliceF.paths].join(' ') || 'clean'})`);
  ok(/--lock=/.test(launcherSrc), '…and it drives its OWN machine lock, so it never queues behind a real heavy run');

  // THE MACHINE LOCK MUST NAME THE MACHINE. `os.tmpdir()` follows TMPDIR, so a
  // lock derived from it is per-PROCESS-environment: two agents with different
  // TMPDIRs would each take "the machine lock" and neither would wait, while
  // the things it protects (a bound port, the literal `/tmp` checkouts the
  // suites claim) do not move with TMPDIR at all.
  const beforeTmp = process.env.TMPDIR;
  const lockDefault = defaultLockPath();
  try {
    process.env.TMPDIR = path.join(mktmp('tmpdir'), 'elsewhere');
    ok(defaultLockPath() === lockDefault, `TMPDIR does not move the machine lock (${lockDefault})`);
  } finally { if (beforeTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = beforeTmp; }
  ok(/(^|\/)vibespace-ci-heavy-\d+\.lock$/.test(lockDefault) && os.tmpdir !== undefined,
    '…and it is per-uid, so two users never fight over one file neither can unlink');

  // NEGATIVE CONTROLS — the detector must fire on the exact shapes that caused
  // the incident and stay quiet on the ones that replaced them. They live in
  // scripts/fixtures/machine-global-shapes/ rather than inline because the
  // assert above scans every fast-tier suite's SOURCE and this file is one:
  // a verbatim `const PORT = 3991` control made the suite report ITSELF as an
  // offender (first run of this section — a control has to read as data).
  const shape = (n) => fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'machine-global-shapes', n), 'utf-8');
  const flagged = machineGlobalFixtures(shape('flagged.js.txt'));
  ok(flagged.ports.includes(3991) && flagged.paths.includes('/tmp/vs-ack-smoke'),
    `NEG: the pre-fix test-attach-ack shape (fixed :3991 + a fixed /tmp worktree it force-removes) is detected (${flagged.paths.join(' ')})`);
  ok(flagged.ports.includes(18941) && flagged.ports.includes(18942),
    'NEG: a comma-declared fixed pair (the pre-fix test-proxy-post shape) is detected');
  ok(flagged.ports.includes(3993) && flagged.ports.includes(3989),
    'NEG: a literal bound through a NAME — listened on, or handed to a child as PORT — is detected too');
  const clean = machineGlobalFixtures(shape('clean.js.txt'));
  ok(!clean.ports.length && !clean.paths.length,
    `NEG: the replacement shapes (freePort, mkdtemp, per-pid paths) AND the two that must never be flagged (a /tmp fixture VALUE, a lowercase port: config field) are all quiet (${[...clean.ports, ...clean.paths].join(' ') || 'clean'})`);

  // "KILLED FROM OUTSIDE" MUST NOT LAUNDER A HANG — OR A CRASH (round 4).
  // A heavy run refuses to write a verdict when a child died on a signal it
  // did not send: that is how a superseded or Ctrl-C'd run stops stamping a
  // RED built from its own interruption. Two things must not get in under
  // that rule:
  //   · a suite that HANGS is killed by our own budget with the same SIGTERM,
  //     and that one IS a red — spawnSync reports ETIMEDOUT for its own kill;
  //   · a suite that CRASHES dies on a signal nobody sent it, and that is the
  //     most literal possible fact about the code under test. Measured on this
  //     box (scripts/ci.mjs quotes the numbers): a V8 heap-limit OOM exits
  //     {status:null, signal:'SIGABRT'} and an external-memory OOM is taken by
  //     the kernel as {status:null, signal:'SIGKILL'}. Reading either as
  //     supersession abandoned the tier at that suite and exited 0.
  // So OUTSIDE is an ALLOWLIST of the signals a supersede or an operator
  // sends, and everything else is a verdict about the suite.
  ok(killedFromOutside({ signal: 'SIGTERM' }) === true, 'a child killed by SIGTERM with no error of ours reads as killed from OUTSIDE (this is what supersession sends)');
  ok(killedFromOutside({ signal: 'SIGINT' }) === true && killedFromOutside({ signal: 'SIGHUP' }) === true,
    '…SIGINT (Ctrl-C) and SIGHUP (the terminal went away) too');
  ok(killedFromOutside({ signal: 'SIGABRT' }) === false,
    'NEG: SIGABRT does NOT — that is how a V8 heap-limit OOM dies, i.e. a fact about the code under test (measured: {status:null, signal:"SIGABRT"})');
  ok(killedFromOutside({ signal: 'SIGKILL' }) === false,
    'NEG: nor SIGKILL — the kernel OOM killer\'s signal; an operator\'s kill -9 is indistinguishable from here, and a wrong RED costs one re-run while a wrong "abandoned" is a silent green');
  ok(['SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGFPE'].every((s) => killedFromOutside({ signal: s }) === false),
    'NEG: nor any native crash signal (SIGSEGV/SIGBUS/SIGILL/SIGFPE)');
  ok(killedFromOutside({ signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } }) === false,
    'NEG: our OWN budget kill (ETIMEDOUT) does NOT — a hung suite is a red, never a "no verdict"');
  ok(killedFromOutside({ status: 1 }) === false && killedFromOutside({ status: 0 }) === false && killedFromOutside(null) === false,
    'NEG: an ordinary failure, an ordinary pass and a missing result are not signals');
  // The allowlist is the thing under test, so it is READ from the module
  // rather than re-spelled here: a signal added to it tomorrow has to be one
  // of the three a supersede/operator sends, and this states that out loud.
  ok(OUTSIDE_SIGNALS.join(',') === 'SIGTERM,SIGINT,SIGHUP',
    `the OUTSIDE set is exactly the signals somebody SENDS this run (${OUTSIDE_SIGNALS.join(', ')})`);
  ok(OUTSIDE_SIGNALS.every((s) => killedFromOutside({ signal: s }) === true),
    '…and every member of it really reads as outside (the list is not decorative)');

  // (b) THE DIRTY-TREE PATH, FOR REAL. A probe file makes this checkout dirty
  //     for the length of two runs; `finally` removes it.
  // THIS LEG DIRTIES THE REPOSITORY, so it must clean up on SIGNALS too, not
  // only in `finally`. Learned the hard way in this very round: a killed
  // process does not run `finally` (or `process.on('exit')`), and ci.mjs's own
  // per-suite budget kill is a SIGTERM — a stray probe then leaves the tree
  // dirty, which blocks the fast tier's green marker AND makes the next
  // in-place `npm run ci:heavy` refuse. It also self-heals a stale one, because
  // the previous run may have been the one that was killed.
  const probe = path.join(REPO, '.ci-gate-dirty-probe');
  const rmProbe = () => { try { fs.unlinkSync(probe); } catch {} };
  rmProbe();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { rmProbe(); process.exit(143); });
  process.on('exit', rmProbe);
  const mdir = mktmp('dirty');
  try {
    fs.writeFileSync(probe, 'round-2 dirty-tree probe\n');
    const porcelain = spawnSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf-8', env: GIT_ENV }).stdout || '';
    ok(porcelain.includes('.ci-gate-dirty-probe'), 'the probe really makes this tree dirty (the two legs below are non-vacuous)');
    const t0 = Date.now();
    const refused = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--heavy', '--markers=' + mdir, '--only=test-eml'],
      { cwd: REPO, encoding: 'utf-8', env: GIT_ENV, timeout: 120000 });
    const rout = (refused.stdout || '') + (refused.stderr || '');
    ok(refused.status === 2 && /REFUSED/.test(rout), `a dirty in-place heavy run is REFUSED (exit ${refused.status})`);
    // UP FRONT is the run's FIRST word (lane wall-clock-ratchet-down: `< 15000 ms` judged the machine): nothing precedes
    // the refusal in its output — no build, no suite line; the ms are information
    ok(rout.trim().startsWith('[ci:heavy] REFUSED'), `…UP FRONT, before the build and the suites — the refusal is the first line it says (${Date.now() - t0}ms — the whole point)`);
    ok(!/npm run build/.test(rout), '…so it does not spend a build first');
    ok(/--isolate|ci:heavy/.test(rout), '…and the refusal names the way to get a real verdict');
    ok(!fs.readdirSync(mdir).length, '…and writes no marker');

    rmProbe(); // the REAL checkout is dirty only for the refusal above (a spawn that stops before its build)

    // --dirty-ok RUNS the tier (build + suites) and so is driven in a STUB
    // repository whose scripts/ci.mjs is the real module, whose build is
    // `node -e 0` and whose one suite is a stub under a heavy-tier name
    // (B-f4cb, 2026-09-27: in this checkout the leg paid a real `npm run
    // build` — 5.9 s of a fast-tier suite — and kept the REAL tree dirty until
    // the child had captured it, the hazard the probe's signal handlers exist
    // for). What is under test is the gate's honesty about a dirty tree, which
    // is the same module in either repository.
    const stub = stubGateRepo('dirty-ok');
    fs.writeFileSync(path.join(stub.root, '.ci-gate-dirty-probe'), 'round-2 dirty-tree probe\n');
    const child = spawn(process.execPath, [path.join(stub.root, 'scripts', 'ci.mjs'), '--heavy', '--dirty-ok', '--markers=' + mdir, '--only=' + STUB_SLICE, '--lock=' + path.join(mdir, 'lock')],
      { cwd: stub.root, env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let aout = '';
    child.stdout.on('data', (d) => { aout += d; });
    child.stderr.on('data', (d) => { aout += d; });
    await new Promise((res) => child.on('exit', (code) => res({ status: code })));
    ok(/--dirty-ok: this tree is dirty/.test(aout), 'the run announces the dirty tree as soon as it captures it');
    ok(/NO VERDICT will be written/i.test(aout), '--dirty-ok says NO VERDICT at the START of the run');
    ok(/NO VERDICT WRITTEN/.test(aout) && !/HEAVY GATE GREEN/.test(aout),
      '…and the closing line says NO VERDICT WRITTEN instead of "HEAVY GATE GREEN"');
    ok(new RegExp(STUB_SLICE).test(aout) && /npm run build/.test(aout), '…after really running the tier (the build and the suite ran — the leg is non-vacuous)');
    ok(!fs.existsSync(path.join(mdir, 'x')) && !fs.readdirSync(mdir).some((f) => /\.(green|red)$/.test(f)),
      '…and still writes no green/red marker');
  } finally { try { fs.unlinkSync(probe); } catch {} }

  // MARKER KINDS HAVE THREE READERS. ci.mjs writes them and names them in one
  // regex, GET /api/ci-heavy (src/server/ops-routes.js) re-spells that regex to
  // serve them, and the Diagnostics report renders the verdict words. `skipped`
  // was added in round 2, and a kind that only ever reaches the CLI is a
  // verdict the UI silently DROPS — the absence looks exactly like "nobody has
  // pushed lately", which is the failure mode invariant ⑪ exists to kill. So the
  // API leg is derived from ci.mjs's own list (a FIFTH kind added tomorrow has
  // to be served too), while the RENDERER leg names `skipped` on purpose: `pid`
  // is not a verdict there (an in-flight run is the RUNNING row), so "render
  // every kind" would be the wrong rule.
  {
    // ONE detector, used by the real files and by the controls below — a
    // negative control has to exercise the code under test, not a paraphrase.
    const readsKind = (src, k) => new RegExp(`\\(([a-z|]*\\|)?${k}(\\||\\))`).test(src);
    const ciSrc = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
    const kinds = (/\\\.\(([a-z|]+)\)\$/.exec(ciSrc) || [, ''])[1].split('|').filter(Boolean);
    ok(kinds.includes('green') && kinds.includes('red') && kinds.includes('skipped') && kinds.includes('pid'),
      `ci.mjs reads the marker kinds it writes (${kinds.join(', ') || 'NONE FOUND — the regex moved'})`);
    const ops = fs.readFileSync(path.join(REPO, 'src', 'server', 'ops-routes.js'), 'utf-8');
    const missing = kinds.filter((k) => !readsKind(ops, k));
    ok(!missing.length, `GET /api/ci-heavy reads every marker kind ci.mjs writes (missing: ${missing.join(', ') || 'none'})`);
    const rendersSkipped = (src) => /'skipped'/.test(src) && /SKIP/.test(src);
    const flows = fs.readFileSync(path.join(REPO, 'src', 'lib', 'setup-flows.js'), 'utf-8');
    ok(rendersSkipped(flows), 'the Diagnostics report renders the skipped kind (a verdict-less run is visible, not dropped)');

    // NEGATIVE CONTROLS. Both asserts above are greps, and a grep that matches
    // anything is not an assert: mutate each source the way the defect would
    // and require the SAME detector to name the missing kind.
    const opsPreFix = ops.replace(/\(green\|red\|pid\|skipped\)/g, '(green|red|pid)');
    ok(opsPreFix !== ops && kinds.filter((k) => !readsKind(opsPreFix, k)).join(',') === 'skipped',
      'NEG: an /api/ci-heavy that still reads only the pre-round-2 kinds is caught, and named ("skipped")');
    ok(!rendersSkipped(flows.replace(/'skipped'/g, "'green'")),
      'NEG: a Diagnostics renderer with the skipped branch removed is caught (that row would silently vanish from the report)');

    // …AND SO DOES THE `absent` FIELD (round 6). It is not a kind, it is what
    // makes `suites` mean something else: a run is isolated at a sha, and this
    // gate's table can name suites that sha never contained (measured: 42 of 97
    // at master~300), so a green row printing the total contradicts its own
    // record. Same three readers, same rule — one detector per reader, each with
    // the mutation that would drop it.
    const writesAbsent = (src) => /absent: absent\.length \? absent : undefined/.test(src);
    const servesAbsent = (src) => /absent: Array\.isArray\(rec\.absent\) \? rec\.absent\.length : 0/.test(src);
    const rendersAbsent = (src) => /r\.absent \?/.test(src) && /\{n\} not present at that commit/.test(src);
    ok(writesAbsent(ciSrc), 'ci.mjs records the suites the gated commit did not contain (marker field `absent`)');
    ok(servesAbsent(ops), '…GET /api/ci-heavy serves it');
    ok(rendersAbsent(flows), '…and the Diagnostics report renders it (a field that only reaches the CLI is the marker-kind lesson again)');
    ok(!servesAbsent(ops.replace(/absent: Array\.isArray\(rec\.absent\) \? rec\.absent\.length : 0, /, '')),
      'NEG: a route that drops the field is caught');
    ok(!rendersAbsent(flows.replace(/\$\{r\.absent \?/g, '${false ?')),
      'NEG: …as is a report that has the number and does not print it');
    // The CLI is the FOURTH reader, and it is the one an operator actually runs
    // — so this leg is FUNCTIONAL rather than a grep: a real marker through the
    // real `--status`, with a marker that has no absent list as the control.
    {
      const sdir = mktmp('status-absent');
      const sha = (spawnSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf-8', env: GIT_ENV }).stdout || '').trim();
      fs.mkdirSync(sdir, { recursive: true });
      fs.writeFileSync(path.join(sdir, `${sha}.green`), JSON.stringify({ sha, result: 'green', failed: [], suites: 97, absent: ['test-a', 'test-b'], endedAt: Date.now(), ms: 1000 }));
      const run = () => {
        const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--status', '--markers=' + sdir, '--head=' + sha], { cwd: REPO, encoding: 'utf-8', env: GIT_ENV });
        return (r.stdout || '') + (r.stderr || '');
      };
      const withAbsent = run();
      ok(/97 suites/.test(withAbsent) && /2 not present at that commit/.test(withAbsent),
        'ci:status prints the absent count beside the suite total (the number is what makes "97 suites" true or false)');
      fs.writeFileSync(path.join(sdir, `${sha}.green`), JSON.stringify({ sha, result: 'green', failed: [], suites: 97, endedAt: Date.now(), ms: 1000 }));
      ok(!/not present at that commit/.test(run()),
        'CONTROL: a marker with no absent list says nothing about absence (the row is not decorated unconditionally)');
    }
  }

  // The block message must point at something REACHABLE. It used to offer "or
  // wait for the next push's background run" — but that run is launched BY a
  // push, and the push is what is being refused.
  // The red has to name a commit THIS repository knows (a marker for an
  // unknown sha is ignored on purpose), so it is HEAD — with the markers in a
  // temp dir, so no real push is ever blocked by this assert.
  const bdir = mktmp('blockmsg');
  const bA = (spawnSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf-8', env: GIT_ENV }).stdout || '').trim();
  writeMarker(bdir, bA, 'red', ['test-client-boot']);
  const blocked = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--check-heavy', '--markers=' + bdir, '--head=' + bA],
    { cwd: REPO, encoding: 'utf-8', env: GIT_ENV });
  const bout = (blocked.stdout || '') + (blocked.stderr || '');
  ok(blocked.status === 1 && /PUSH BLOCKED/.test(bout), 'the block message is produced by a real red marker');
  ok(/npm run ci:heavy/.test(bout), '…and names npm run ci:heavy');
  ok(!/wait for the next push/.test(bout), '…and no longer offers the unreachable "wait for the next push\'s background run"');
}
// ── §7 NO GATE SUITE PINS A CALENDAR DATE THE PRODUCT COMPARES AGAINST NOW ──
// Third strike (2026-09-14): test-auto-resume ⑫ (2.369.93), test-quota-source
// (2.369.94) and test-codex-p2-wrapper (2.369.95) each carried the codex
// prose "try again at Sep 13th, 2026 8:36 PM" as a LITERAL, and each went red
// in a gate tier the day that instant passed — the parser answers 0 for a
// past reset, so the assert saw 1970 with nothing about the product changed.
// The fixed shape derives the instant from the clock and reproduces the
// prose; this census fails the next literal at build time instead of on the
// calendar. Whole-line comments are blanked first (two suites quote the old
// literal in prose); an inline `//` is NOT stripped because the sentence
// itself carries `https://`.
console.log('\n§7 no gate suite pins the codex prose reset as a literal date');
{
  const LITERAL = /try again at [A-Z][a-z]{2} \d{1,2}(st|nd|rd|th), \d{4} \d{1,2}:\d{2} (AM|PM)/;
  // A line may keep a literal ONLY with a declared reason on the same line
  // (`literal-date-ok: …`): a PAST date the parser must refuse, a parse handed
  // its OWN `now`, or an assert that never reads the instant. The exemption is
  // per LINE, never per file, and this census exempts ITSELF by name (its
  // controls below spell both shapes — since the gate's split, lane fast-tier-ratchet, ITSELF is this part's file).
  const codeOnly = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l) && !/literal-date-ok:/.test(l)).join('\n');
  const files = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f) && f !== path.basename(fileURLToPath(import.meta.url)));
  const offenders = files.filter((f) => LITERAL.test(codeOnly(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf-8'))));
  ok(files.length > 100, `${files.length} suites censused (non-vacuous; this file exempts itself)`);
  ok(offenders.length === 0, `no suite pins the codex prose reset as a literal date${offenders.length ? ' — ' + offenders.join(', ') : ''}`);
  const derived = files.filter((f) => /try again at " \+ [A-Z_]+/.test(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf-8')));   // `+ WHEN` / `+ SIX_DAYS_OUT`: the instant is a NAME, not a date
  ok(derived.length >= 3, `POSITIVE CONTROL: the three defused suites derive the instant (${derived.join(', ')})`);
  const declared = files.filter((f) => /literal-date-ok:/.test(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf-8')));
  ok(declared.length >= 1, `declared per-line exceptions exist and are named (${declared.join(', ')}) — an exemption is paid for with a reason on the line`);
  ok(LITERAL.test(codeOnly('const WIRE = "… or try again at Sep 13th, 2026 8:36 PM.";')), 'NEG: a literal in code is flagged');
  ok(!LITERAL.test(codeOnly('  // said "try again at Sep 13th, 2026 8:36 PM", which was')), 'NEG: the same sentence in a whole-line comment is not');
  ok(!LITERAL.test(codeOnly('const WIRE = "… https://chatgpt.com/x or try again at " + WHEN + ".";')), 'NEG: the derived shape (with its https:// intact) is not');
}

// ── §8 LANES, THE SERIAL TABLE, THE IMPACT SCOPE, THE FULL-TIER CLOCK (2026-09-15) ──
console.log('\n§8 lanes, the serial table, the impact scope, the full-tier clock');
{
  const ci = await import('./ci.mjs');
  const { SERIAL, laneCount, scheduleLanes, affectedSuites, suiteInputs, changedFiles, fullTierDue, FULL_EVERY_MS } = ci;
  const heavy = SUITES.filter((s) => s.tier === 'heavy');
  ok(laneCount({ cpus: 32, env: {} }) === 4 && laneCount({ cpus: 64, env: {} }) === 4 && laneCount({ cpus: 16, env: {} }) === 2 && laneCount({ cpus: 4, env: {} }) === 2,
    'laneCount = clamp(cpus/8, 2, 4) (32 cpus ⇒ 4, 16 ⇒ 2, a 4-cpu runner ⇒ 2)');
  ok(laneCount({ cpus: 32, env: { VIBESPACE_CI_LANES: '1' } }) === 1 && laneCount({ cpus: 32, env: { VIBESPACE_CI_LANES: 'x' } }) === 4,
    'VIBESPACE_CI_LANES overrides it (1 = the sequential tier); a non-number is ignored');
  ok(SERIAL.length >= 1 && SERIAL.every((s) => heavy.some((h) => h.name === s.name) && (s.why || '').length > 20),
    `every SERIAL row names a HEAVY suite and says what machine-wide thing it claims (${SERIAL.map((s) => s.name).join(', ')})`);
  const plan = scheduleLanes(heavy, { timings: { 'test-eml': 50000 }, sourceOf: () => '' });
  ok(plan.parallel[0].name === 'test-eml', 'the previous marker\'s longest suite is scheduled FIRST');
  ok(plan.serial.length === SERIAL.length && plan.serial.every((s) => SERIAL.some((r) => r.name === s.name)) && plan.parallel.every((s) => !SERIAL.some((r) => r.name === s.name)),
    'the SERIAL rows are the serial lane and nothing else is');
  // FAST LANES (lane fast-budget, 2026-10-04): the fast tier's lane count, its serial lane and its closing report
  {
    const { fastLaneCount, scheduleFastLanes, fastTimingReport, FAST_SERIAL } = ci;
    const fastRows = SUITES.filter((s) => s.tier === 'fast');
    ok(fastLaneCount({ cpus: 32, env: {} }) === 4 && fastLaneCount({ cpus: 4, env: {} }) === 4 && fastLaneCount({ cpus: 2, env: {} }) === 2 && fastLaneCount({ cpus: 1, env: {} }) === 1
      && fastLaneCount({ cpus: 32, env: { VIBESPACE_CI_FAST_LANES: '1' } }) === 1 && fastLaneCount({ cpus: 32, env: { VIBESPACE_CI_FAST_LANES: 'x' } }) === 4,
      'fastLaneCount = min(4, cpus) — 4 on the 4-cpu runner — and VIBESPACE_CI_FAST_LANES overrides it (1 = the sequential tier; a non-number is ignored)');
    ok(FAST_SERIAL.every((r) => fastRows.some((s) => s.name === r.name) && (r.why || '').length > 20) && new Set(FAST_SERIAL.map((r) => r.name)).size === FAST_SERIAL.length,
      `every FAST_SERIAL row names a FAST suite once and says why it runs alone (${FAST_SERIAL.length} rows)`);
    const fp = scheduleFastLanes(fastRows, { sourceOf: () => '' });
    const timed = (s) => fastRuleFindings(s, '').measuredMs || 0;
    ok(fp.parallel.length + fp.serial.length === fastRows.length && fp.parallel.every((s) => !FAST_SERIAL.some((r) => r.name === s.name)) && FAST_SERIAL.every((r) => fp.serial.some((s) => s.name === r.name)),
      'the FAST_SERIAL rows are the fast serial lane, the rest are parallel, nothing dropped');
    ok(fp.serial[fp.serial.length - 1].name === 'test-fixture-isolation' && timed(fp.parallel[0]) === Math.max(...fp.parallel.map(timed)),
      `test-fixture-isolation runs LAST, and the parallel lanes start with the longest measured row (${fp.parallel[0].name})`);
    const rep = fastTimingReport([{ name: 'a', ms: 12000 }, { name: 'b', ms: 500 }, { name: 'c', ms: 10000 }]);
    ok(/the 3 slowest fast suites: a 12\.0 s · c 10\.0 s · b 0\.5 s/.test(rep[0]) && rep.length === 2 && /WARNING: a took 12\.0 s/.test(rep[1]),
      'the closing report names the slowest first and warns once per fast suite OVER 10 s (10.0 s is not over)');
  }
  // the flagged SHAPE comes from the fixture file, not a literal here — §6
  // scans this suite's own source (a verbatim control made it report itself)
  const flaggedSrc = fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'machine-global-shapes', 'flagged.js.txt'), 'utf-8');
  const flagged = scheduleLanes([{ name: 'test-x', tier: 'heavy' }], { serial: [], sourceOf: () => flaggedSrc });
  ok(flagged.serial.length === 1 && /machine-global fixture/.test(flagged.serial[0].serialWhy), 'a suite machineGlobalFixtures flags runs serially, with the reason');
  ok(scheduleLanes([{ name: 'a' }, { name: 'b' }], { serial: [], timings: { a: 1, b: 100 }, keepOrder: true }).parallel.map((s) => s.name).join() === 'a,b',
    '--only keeps the order given');
  ok(scheduleLanes([{ name: 'a' }, { name: 'b' }], { serial: [] }).parallel.map((s) => s.name).join() === 'b,a',
    'with no measurement the table order is read backwards (cheap→expensive ⇒ the late row first)');

  // IMPACT SCOPE over a stub tree: the graph, a literal, a prefix, reads:,
  // always:, a global input, and "could not tell".
  const root = mktmp('impact');
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body); };
  w('src/a.js', "const b = require('./b.js');\nmodule.exports = b;\n");
  w('src/b.js', 'module.exports = 1;\n');
  w('src/r/q.js', 'module.exports = 2;\n');
  w('docs/x.md', '# x\n');
  w('server.js', '// boot\n');
  w('scripts/test-a.mjs', "import a from '../src/a.js';\nconsole.log(a);\n");
  w('scripts/test-c.mjs', "import fs from 'node:fs';\nconsole.log(fs.readFileSync('docs/x.md', 'utf8'));\n");
  w('scripts/test-boot.mjs', "// spawns server.js in a worktree\nconsole.log('server.js');\n");
  w('scripts/test-d.mjs', "console.log('pure');\n");
  w('scripts/test-always.mjs', "console.log('smoke');\n");
  w('scripts/test-r.mjs', "console.log('reads src/r by segments');\n");
  const S = [{ name: 'test-a' }, { name: 'test-c' }, { name: 'test-boot' }, { name: 'test-d' }, { name: 'test-always', always: true }, { name: 'test-r', reads: ['src/r/'] }];
  const sel = (changed) => affectedSuites({ suites: S, root, changed, range: 'x..y' }).selected.map((s) => s.name).sort().join(',');
  ok(sel(['src/b.js']) === 'test-a,test-always,test-boot', `a change two hops down the require graph selects the importer, the boot smoke (src/ is its input) and the always row (${sel(['src/b.js'])})`);
  ok(sel(['docs/x.md']) === 'test-always,test-c', 'a fixture named as a repo-relative literal selects its reader');
  const how = affectedSuites({ suites: S, root, changed: ['src/b.js'], range: 'x..y' }).why;
  ok(/^loads src\/b\.js/.test(how.get('test-a')) && /^boots the product \(src\/b\.js changed under src\/\)/.test(how.get('test-boot')) && /^always/.test(how.get('test-always')),
    `each selection says HOW the suite depends on the change, never a bare "reads" for a file it never opens (${how.get('test-a')} · ${how.get('test-boot')})`);
  ok(sel(['src/r/q.js']) === 'test-always,test-boot,test-r', 'a declared reads: prefix selects the suite whose path is built from segments');
  ok(sel(['README.md']) === 'test-always', 'a file nothing reads selects only the always rows');
  // lane affected-static-reach (q-036 P0): the BOOT reason narrows by static reach — a booting suite that derives no
  // reach runs on every product change ('all', said), the reach: false switch is the old rule, and THE BOOT SENTINEL is
  // ONE heavy row with always: true (every affected run carries it; it is in no other tier and not excluded)
  const rw = affectedSuites({ suites: S, root, changed: ['src/b.js'], range: 'x..y', why: true }).summary;
  ok(/✓ test-boot ← boots the product \(src\/b\.js changed under src\/\) — reach 'all' \(undeclared, derived empty\) ∩ src\/b\.js/.test(rw) && sel(['src/b.js']) === affectedSuites({ suites: S, root, changed: ['src/b.js'], range: 'x..y', reach: false }).selected.map((s) => s.name).sort().join(','),
    'a booting suite that derives no reach runs on every product change and --why says so; here the reach selects what the old rule does');
  const sentinelRows = SUITES.filter((s) => s.name === 'test-boot-sentinel');
  ok(sentinelRows.length === 1 && sentinelRows[0].tier === 'heavy' && sentinelRows[0].always === true && !EXCLUDED.some((e) => e.name === 'test-boot-sentinel') && fs.existsSync(path.join(REPO, 'scripts/test-boot-sentinel.mjs')),
    'THE BOOT SENTINEL is in exactly one tier — heavy, always: true — and not excluded');
  ok(sel(['package-lock.json']) === S.map((s) => s.name).sort().join(','), 'a dependency bump is a global input: everything runs');
  const unknown = affectedSuites({ suites: S, root, changed: null, range: 'x..y' });
  ok(unknown.selected.length === S.length && /could not be listed/.test(unknown.summary), '"could not tell" selects EVERYTHING and says so (never "nothing changed")');
  // THE LOADER SHAPES THE WALK MISSED (2026-09-16, verifier): `require(REPO +
  // '/src/x.js')` is how 9 heavy suites load the module they test, and the
  // literal scan wanted the quote to be followed by `src/` — so a change to
  // src/conversation-index.js selected 67 suites and NOT test-conversation-index.
  w('scripts/test-cc.mjs', "const REPO = '.';\nconst { X } = require(REPO + '/src/b.js');\nconsole.log(X);\n");
  w('scripts/test-ct.mjs', "const REPO = '.';\nconst { X } = require(`${REPO}/src/b.js`);\nconsole.log(X);\n");
  w('scripts/test-ci.mjs', "const REPO = '.';\nconst m = await import(REPO + '/src/b.js');\nconsole.log(m);\n");
  w('scripts/test-cr.mjs', "const p = require.resolve('../src/b.js');\nconsole.log(p);\n");
  w('scripts/test-cq.mjs', "import { createRequire } from 'node:module';\nconst { X } = createRequire(import.meta.url)('../src/b.js');\nconsole.log(X);\n");
  const L = [{ name: 'test-cc' }, { name: 'test-ct' }, { name: 'test-ci' }, { name: 'test-cr' }, { name: 'test-cq' }, { name: 'test-d' }];
  const lsel = affectedSuites({ suites: L, root, changed: ['src/b.js'], range: 'x..y' });
  ok(lsel.selected.map((s) => s.name).sort().join() === 'test-cc,test-ci,test-cq,test-cr,test-ct',
    `require(REPO + '/src/x'), require(\`\${REPO}/src/x\`), import(REPO + '/src/x'), require.resolve('../src/x') and createRequire(...)('../src/x') all select the suite (${lsel.selected.map((s) => s.name).sort().join()})`);
  ok(['test-cc', 'test-ct', 'test-ci', 'test-cr', 'test-cq'].every((n) => /^loads src\/b\.js/.test(lsel.why.get(n) || '')), 'each says "loads" (a load, walked), never "names"');
  // …over the REAL table: the four measured misses, by name, and a census that
  // every heavy row without always:/reads: has at least one PRODUCT input
  // (src/, server.js, data/bin/) — a row with none is a suite the affected
  // tier can never select for a product change, so it would only ever run in
  // the 24 h full tier. Non-vacuity: the same predicate over a stub row that
  // reads nothing says so.
  const realHeavy = SUITES.filter((s) => s.tier === 'heavy');
  const realMemo = new Map(); // ONE walk + ONE reach context for the four real-table selections (an unchanged tree)
  for (const [changedFile, suite] of [['src/conversation-index.js', 'test-conversation-index'], ['src/normalizers.js', 'test-session-brain-dark'], ['src/machine-probes.js', 'test-machine-probes'], ['src/routes/persistence.js', 'test-layout-history']]) {
    if (!realHeavy.some((s) => s.name === suite)) continue; // the row may leave the tier; the stub legs above pin the shapes
    const why = affectedSuites({ suites: realHeavy, changed: [changedFile], range: 'x..y', memo: realMemo }).why.get(suite);
    ok(!!why && /^loads /.test(why), `${changedFile} selects ${suite} (${why || 'MISSED — the measured defect'})`);
  }
  const isProduct = (p) => p === 'server.js' || p.startsWith('src/') || p.startsWith('data/bin/');
  const walkMemo = new Map(); // ONE walk of the table (ci.mjs suiteInputs: a memo lives for one computation over an unchanged tree)
  const inputless = (s, r) => { const { files, prefixes } = suiteInputs(s, { root: r, memo: walkMemo }); return ![...files, ...prefixes].some(isProduct); };
  const silent = realHeavy.filter((s) => !s.always && !(s.reads && s.reads.length) && inputless(s, REPO)).map((s) => s.name);
  ok(silent.length === 0, `every heavy row without always:/reads: has a PRODUCT input the affected tier can match (silent rows: ${silent.join(', ') || 'none'})`);
  ok(inputless({ name: 'test-d' }, root) && !inputless({ name: 'test-a' }, root), 'CONTROL: the census predicate flags a suite that reads no product file and passes one that does');
  // changedFiles over real history: a..b is the diff, a lone sha is its unpublished range.
  const repo = makeRepo('range');
  const A = commit(repo, 'src/one.js', '1\n', 'A');
  const B = commit(repo, 'src/two.js', '2\n', 'B');
  ok((changedFiles(`${A}..${B}`, repo).files || []).join() === 'src/two.js', 'changedFiles(a..b) lists what b changed since a');
  ok((changedFiles(B, repo).files || []).sort().join() === 'src/one.js,src/two.js', 'changedFiles(<sha>) with no remote-tracking ref lists the whole unpublished range');
  ok(changedFiles('nope..nope', repo).files === null, 'an unresolvable range answers null (the caller runs everything)');
  // THE GRAPH IS THE GATED COMMIT'S (2026-09-16, verifier): master checked out
  // with test-x importing src/a.js; branch feat rewires test-x to src/b.js (c1)
  // and then changes src/b.js (c2). Read from the CHECKOUT, c1..c2 selects
  // nothing — the defect; read from a worktree AT c2 (the range still answered
  // by the repository's objects) it selects test-x.
  const grepo = makeRepo('graph');
  commit(grepo, 'src/a.js', 'module.exports = 1;\n', 'a');
  commit(grepo, 'src/b.js', 'module.exports = 2;\n', 'b');
  commit(grepo, 'scripts/test-x.mjs', "import a from '../src/a.js';\nconsole.log(a);\n", 'test-x reads a');
  git(grepo, ['checkout', '-q', '-b', 'feat']);
  const c1 = commit(grepo, 'scripts/test-x.mjs', "import b from '../src/b.js';\nconsole.log(b);\n", 'c1: test-x now reads b');
  const c2 = commit(grepo, 'src/b.js', 'module.exports = 3;\n', 'c2: b changes');
  git(grepo, ['checkout', '-q', 'main']);
  const TX = [{ name: 'test-x' }];
  ok(affectedSuites({ range: `${c1}..${c2}`, suites: TX, root: grepo }).selected.length === 0,
    'CONTROL (the defect): read from the CHECKOUT (main), c1..c2 selects nothing — test-x@main imports src/a.js');
  const gwt = path.join(mktmp('graph-wt'), 'at-c2');
  git(grepo, ['worktree', 'add', '-q', '--detach', gwt, c2]);
  const atSha = affectedSuites({ range: `${c1}..${c2}`, suites: TX, root: gwt, gitRoot: grepo });
  ok(atSha.selected.map((s) => s.name).join() === 'test-x' && /^loads src\/b\.js/.test(atSha.why.get('test-x') || ''),
    `read from the tree AT the sha (root = the scratch worktree, gitRoot = the repository) the same range selects test-x (${atSha.why.get('test-x')})`);
  try { git(grepo, ['worktree', 'remove', '--force', gwt]); } catch { }
  const ciSrc = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/wt = addScratchWorktree\(sha, 'heavy'\);[\s\S]*?impact = affectedSuites\(\{ range, suites: all, root: runRoot, gitRoot: repo(?:, why)? \}\);/.test(ciSrc)
    && !/impact = affectedSuites\(\{ range, suites: all \}\);/.test(ciSrc),
    'WIRING: heavyGate selects AFTER the scratch worktree exists, from root: runRoot with gitRoot: repo (never from the checkout up front)');

  // THE FULL-TIER CLOCK + THE BLOCK RULE FOR AN AFFECTED GREEN.
  const mdir = mktmp('full-clock');
  const write = (sha, kind, rec) => fs.writeFileSync(path.join(mdir, `${sha}.${kind}`), JSON.stringify({ sha, result: kind, failed: [], ...rec }));
  ok(fullTierDue(mdir).due === true, 'no marker ⇒ a FULL run is due');
  write('a'.repeat(40), 'green', { scope: 'affected', selected: ['x'], endedAt: Date.now() });
  ok(fullTierDue(mdir).due === true, 'an AFFECTED green does not count as the full run');
  write('b'.repeat(40), 'green', { endedAt: Date.now() - FULL_EVERY_MS - 60000 });
  ok(fullTierDue(mdir).due === true && /h old/.test(fullTierDue(mdir).why), 'a full green older than 24 h ⇒ due, saying its age');
  write('c'.repeat(40), 'green', { scope: 'full', endedAt: Date.now() - 60000 });
  ok(fullTierDue(mdir).due === false, 'a full green younger than 24 h ⇒ not due (the next push runs the affected tier)');
  // …AND IT MUST HAVE JUDGED EVERY SUITE IT NAMED, ON THIS LINE OF HISTORY
  // (2026-09-16, verifier): a full run at an old tag in which 108 of 110
  // suites were absent judged two, and a green on an unrelated branch says
  // nothing about the push — either used to satisfy the 24 h safety net.
  const adir = mktmp('full-absent');
  const aw = (sha, rec) => fs.writeFileSync(path.join(adir, `${sha}.green`), JSON.stringify({ sha, result: 'green', failed: [], scope: 'full', ...rec }));
  aw('d'.repeat(40), { suites: 110, absent: Array.from({ length: 108 }, (_, i) => `test-${i}`), endedAt: Date.now() - 60000 });
  ok(fullTierDue(adir).due === true && /judged 2 of 110 suites \(108 absent/.test(fullTierDue(adir).why),
    `a full green in which 108 of 110 suites were ABSENT is not the safety net, and says how many it judged (${fullTierDue(adir).why})`);
  aw('e'.repeat(40), { suites: 110, endedAt: Date.now() - 30000 });
  ok(fullTierDue(adir).due === false, 'CONTROL: a COMPLETE full green beside it counts');
  const lrepo = makeRepo('full-line');
  const L1 = commit(lrepo, 'src/l1.js', '1\n', 'L1');
  const L2 = commit(lrepo, 'src/l2.js', '2\n', 'L2');
  git(lrepo, ['checkout', '-q', '-b', 'other', L1]);
  const O = commit(lrepo, 'src/o.js', 'o\n', 'O (another line)');
  const ldir = mktmp('full-line-markers');
  const lw = (sha, rec) => fs.writeFileSync(path.join(ldir, `${sha}.green`), JSON.stringify({ sha, result: 'green', failed: [], scope: 'full', suites: 3, endedAt: Date.now() - 60000, ...rec }));
  lw(O);
  const otherLine = fullTierDue(ldir, Date.now(), { sha: L2, repoRoot: lrepo });
  ok(otherLine.due === true && /another line of history/.test(otherLine.why), `a full green on ANOTHER branch is not the safety net for this push (${otherLine.why})`);
  ok(fullTierDue(ldir).due === false, 'CONTROL: with no sha to relate it to (ci:status without --head), ancestry is not asked');
  lw(L1, { endedAt: Date.now() - 120000 });
  ok(fullTierDue(ldir, Date.now(), { sha: L2, repoRoot: lrepo }).due === false, 'an older full green on an ANCESTOR of the push counts (the newest QUALIFYING green is the one that matters)');
  const ddir = mktmp('full-desc-markers');
  fs.writeFileSync(path.join(ddir, `${L2}.green`), JSON.stringify({ sha: L2, result: 'green', failed: [], scope: 'full', suites: 3, endedAt: Date.now() - 60000 }));
  ok(fullTierDue(ddir, Date.now(), { sha: L1, repoRoot: lrepo }).due === false, '…and so does one on a DESCENDANT');
  ok(fullTierDue(ddir, Date.now(), { sha: 'f'.repeat(40), repoRoot: lrepo }).due === true, 'a push the repository cannot relate to the green (unknown sha) is due a full run');
  const launcherSrc = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/const due = fullTierDue\(dir, Date\.now\(\), \{ sha \}\);/.test(launcherSrc), 'WIRING: heavyLaunch asks fullTierDue about the sha being pushed');
  const brepo = makeRepo('affected-block');
  const R = commit(brepo, 'src/r.js', '//r\n', 'R');
  const G = commit(brepo, 'src/g.js', '//g\n', 'G');
  const bdir = mktmp('affected-block-markers');
  const bw = (sha, kind, rec) => fs.writeFileSync(path.join(bdir, `${sha}.${kind}`), JSON.stringify({ sha, result: kind, failed: [], endedAt: Date.now(), ...rec }));
  bw(R, 'red', { failed: ['test-x'] });
  bw(G, 'green', { scope: 'affected', selected: ['test-y'] });
  ok(heavyBlocker({ dir: bdir, head: G, repoRoot: brepo })?.sha === R, 'an affected green that did NOT run the failing suite does not clear the red');
  bw(G, 'green', { scope: 'affected', selected: ['test-x', 'test-y'] });
  ok(heavyBlocker({ dir: bdir, head: G, repoRoot: brepo }) === null, '…an affected green that ran it does');
  bw(G, 'red', { scope: 'affected', selected: ['test-z'], failed: ['test-z'] });
  try { fs.unlinkSync(path.join(bdir, `${G}.green`)); } catch {}
  ok(heavyBlocker({ dir: bdir, head: G, repoRoot: brepo })?.sha === G, 'an affected RED blocks exactly like a full red');
}

// ── §8d THE XPRA WINDOW FAMILY (lane xpra-window-split, design q-038 step ②, 2026-10-14) ──
// test-desktop-xpra-window (3 207 lines; 1 385 s alone on the hub, 1 481–1 500 s on AIDev) was the desktop batch's FLOOR:
// no lane count moved the batch's wall below it. It is a FAMILY now — heavy parts split by §, each ≤ 8 min measured alone on
// the hub under a private display, on ONE boot (scripts/xpra-window-boot.mjs). Held here: every part is a heavy desktop row
// whose budget is 2× and whose why carries its wall from the checked-in batch table (ci-shard-timings.json `desktop`, ≤ 8 min);
// every part boots through the helper exactly once under its own name and re-implements none of the boot; every § marker of
// the giant is in exactly one part; the giant's name is gone. CONTROLS: each planted fault is named.
console.log('\n§8d the xpra window family — parts ≤ 8 min on one boot, every § in exactly one part');
{
  const C = await import('./ci.mjs');
  const readR = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } };
  const PART_MAX_MS = 8 * 60 * 1000;
  // the giant's § markers at its last sha (051622351): `// ── (n)`, `// ── §n`, `console.log('§n` — (2) never had one
  const GIANT = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const marks = (t) => new Set([...t.matchAll(/(?:\/\/ ── \(|\/\/ ── §|console\.log\('§)(\d+)\b/g)].map((m) => Number(m[1])));
  const familyFaults = (parts, tm, { helper = '' } = {}) => {
    const out = [];
    if (parts.length < 4) out.push(`only ${parts.length} parts`);
    for (const p of parts) {
      const ms = tm[p.name];
      if (!p.row || p.row.tier !== 'heavy') out.push(`${p.name}: not a heavy row`);
      else if (typeof ms !== 'number') out.push(`${p.name}: no measured time in the batch table`);
      else {
        if (ms > PART_MAX_MS) out.push(`${p.name}: ${Math.round(ms / 1000)} s — over 8 min (split it again)`);
        if (Math.abs(Number(p.row.budgetMs) - 2 * ms) > 1000) out.push(`${p.name}: budgetMs ${p.row.budgetMs} is not 2× its measured ${ms} ms`);
        if (!new RegExp(`\\b${Math.round(ms / 1000)} s\\b`).test(p.row.why || '')) out.push(`${p.name}: its why does not carry its measured ${Math.round(ms / 1000)} s`);
      }
      if (!/^import \{ bootXpraWindow \} from '\.\/xpra-window-boot\.mjs';$/m.test(p.text)) out.push(`${p.name}: does not import the boot helper`);
      const boots = [...p.text.matchAll(/\bbootXpraWindow\(\s*'([^']*)'\s*\)/g)];
      if (boots.length !== 1 || boots[0][1] !== p.name) out.push(`${p.name}: boots ${boots.length}× (${boots.map((b) => b[1]).join(', ')}) — once, under its own name`);
      for (const [re, what] of [[/--remote-debugging-port/, 'launches its own chrome'], [/scratch\('deskxpra-smoke'\)/, 'makes its own main worktree'], [/process\.on\('exit'/, 'tears down by itself']]) if (re.test(p.text)) out.push(`${p.name}: ${what} — the boot is the helper's`);
    }
    const where = new Map();
    for (const p of parts) for (const n of marks(p.text)) where.set(n, [...(where.get(n) || []), p.name]);
    for (const n of GIANT) { const w = where.get(n) || []; if (w.length !== 1) out.push(`§${n} is in ${w.length} parts${w.length ? ' (' + w.join(', ') + ')' : ''}`); }
    for (const n of where.keys()) if (!GIANT.includes(n)) out.push(`§${n} is no § of the giant`);
    if (!/^export async function bootXpraWindow\(/m.test(helper) || !/\bendRootedProcesses\(/.test(helper)) out.push('the helper exports no bootXpraWindow or never ends what its servers started (§57b)');
    return out;
  };
  const table = C.batchTimings(REPO) || {};
  const helper = readR('scripts/xpra-window-boot.mjs');
  const parts = SUITES.filter((s) => /^test-desktop-xpra-window-/.test(s.name)).map((row) => ({ name: row.name, row, text: readR(`scripts/${row.name}.mjs`) }));
  const disk = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-desktop-xpra-window-.*\.mjs$/.test(f)).map((f) => f.replace(/\.mjs$/, '')).sort();
  const faults = familyFaults(parts, table, { helper });
  ok(parts.length >= 4 && disk.join() === parts.map((p) => p.name).sort().join() && !faults.length,
    `the family: ${parts.length} heavy parts (${parts.map((p) => `${p.name.replace('test-desktop-xpra-window-', '')} ${Math.round((table[p.name] || 0) / 1000)} s`).join(', ')}), every § of the giant in exactly one, one boot each${faults.length ? ' — ' + faults.join(' | ') : ''}`);
  const longest = Math.max(...parts.map((p) => table[p.name] || 0));
  ok(longest > 60000 && longest <= PART_MAX_MS, `the family's floor: the longest part measured ${Math.round(longest / 1000)} s alone (≤ 480 s)`);
  ok(!SUITES.some((s) => s.name === 'test-desktop-xpra-window') && !fs.existsSync(path.join(REPO, 'scripts', 'test-desktop-xpra-window.mjs')),
    'the giant is gone: no row, no file (a runner would be a test-*.mjs the census must tier — and any tier runs the family twice)');
  ok(parts.every((p) => C.hostOf(p.row, p.text).host === 'desktop'), 'every part is DERIVED desktop from its own code (its ladder check names xpra) — the batch runs all of them');
  // CONTROLS: each planted fault is named
  if (parts.length >= 2) {
    const [a, b] = parts;
    const n0 = [...marks(a.text)][0];
    const dup = familyFaults([a, { ...b, text: b.text + `\n  // ── §${n0} a copy\n` }, ...parts.slice(2)], table, { helper });
    const own = familyFaults([{ ...a, text: a.text + "\nspawn(CHROME, ['--headless=new', '--remote-debugging-port=1']);\n" }, ...parts.slice(1)], table, { helper });
    const two = familyFaults([{ ...a, text: a.text.replace(/^import \{ bootXpraWindow \} from '\.\/xpra-window-boot\.mjs';$/m, '') }, ...parts.slice(1)], table, { helper });
    const over = familyFaults(parts, { ...table, [a.name]: 500000 }, { helper });
    const budget = familyFaults([{ ...a, row: { ...a.row, budgetMs: 3 * table[a.name] } }, ...parts.slice(1)], table, { helper });
    const lost = familyFaults(parts.slice(1), table, { helper });
    const noEnd = familyFaults(parts, table, { helper: helper.replace(/\bendRootedProcesses\(/g, 'endNothing(') });
    ok(dup.some((f) => new RegExp(`§${n0} is in 2 parts`).test(f)) && own.some((f) => /launches its own chrome/.test(f)) && two.some((f) => /does not import the boot helper/.test(f))
      && over.some((f) => /over 8 min/.test(f)) && budget.some((f) => /not 2×/.test(f)) && lost.some((f) => /is in 0 parts/.test(f)) && noEnd.some((f) => /§57b/.test(f)),
      'CONTROLS: a § in two parts, a part launching its own chrome, a part without the helper, a part over 8 min, a budget not 2×, a lost part\'s §§, a helper that ends nothing — each named');
  }
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
