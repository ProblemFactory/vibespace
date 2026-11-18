#!/usr/bin/env node
// test-ci-gate-tiers — a PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what the gate guards and why).
// lane fast-tier-ratchet (2026-10-20) split the one 37 s process into seven ≤ 10 s suites, every section's text unchanged;
// the shared kit is scripts/ci-gate-kit.mjs. This part: §6 no fast suite claims a machine-global fixture + no-verdict honesty · §7 no literal date · §7b a leg never passes by its name · §8 lanes / the serial table / the impact scope / the full-tier clock · §8d the xpra window family's parts.
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
//     tier is fail-fast (its one retry, B-3f38, runs beside the same squatter) and blocks the push directly, so one
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
    // lane race-sweep (B-2d49): the LAST EFFECT is the pipes' close — 'exit' may fire while the closing line is still in
    // flight to this process (node: "stdio streams might still be open"); the closing-line leg read it once under 4 lanes
    await new Promise((res) => child.on('close', (code) => res({ status: code })));
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

// ── §7b A LEG NEVER PASSES BY ITS NAME (B-1747, lane bl-tests-e, 2026-11-17) ──
// Lane fable-52-cli-321 r5 (2026-11-10): thirteen new legs of test-status-bar-chips called ok(name, condition) against a
// helper defined ok(condition, name) — a non-empty string is truthy, so the suite read ALL PASS (67) and four census plants
// stayed green. Both orders live in the tree, every suite with its own copy. This census reads every script's OWN
// assertion helper — every name in scripts/lib/check.mjs HELPER_NAMES: ok, check, and since B-1747's remainder (2.369.411) the
// ck / leg / assert a shape survey found — (its order = the parameter its body tests, helperDefs) and fails a call whose
// CONDITION slot holds a string literal while its name slot does not: on 2.369.407 eight such legs, in test-record-shape,
// test-queue-steer (the catch of ⑪'s browser leg: a THROWING leg passed), test-voice-follow-chrome and
// test-path-field-chrome. The one helper (scripts/lib/check.mjs checker) THROWS on a non-boolean condition and a
// non-string name; the inline helpers without such a guard only FALL — a new suite imports the lib, the rest follow by
// attrition. This file exempts ITSELF by name (its plants below spell helpers inside strings).
console.log('\n§7b a leg never passes by its name: no swapped call anywhere, one guarded helper, the unguarded only fall');
{
  const C = await import('./lib/check.mjs');
  // The inline helpers without the swap guard, BY FILE (scripts/fixtures/unguarded-helpers.json — 1020 in 1016 files on
  // 2.369.407; 1030 in 1026 at 2.369.410; + 80 in 32 files = 1110 in 1041 when the census learned ck / leg / assert at 2.369.411 —
  // a first reading of helpers the tree already held, none new). ONE-WAY (主开发 2026-11-17, the batch-36 readers): a file that ADDS one is red by name — a new suite takes
  // `import { checker } from './lib/check.mjs'` — and the red prints the row that admits it on purpose; a file whose helper is
  // gone or guarded is NEVER red (forty-six lanes merge suites into one train), its stale row is only said.
  const LISTED = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'unguarded-helpers.json'), 'utf-8')).files || {};
  const self = path.basename(fileURLToPath(import.meta.url));
  const dir = path.join(REPO, 'scripts');
  const files = [...fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== self), ...fs.readdirSync(path.join(dir, 'lib')).filter((f) => f.endsWith('.mjs')).map((f) => 'lib/' + f)];
  let defs = 0; const unguarded = [], swapped = [], perFile = {};
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf-8'), d = C.helperDefs(src);
    defs += d.length;
    for (const x of d) if (x.order !== 'unknown' && !x.guarded) { unguarded.push(`${f}:${x.line}`); (perFile[f] = perFile[f] || []).push(x.line); }
    for (const c of C.swappedCalls(src, d)) swapped.push(`${f}:${c.line} (a ${c.order} helper, :${c.defLine}) ${c.text.slice(0, 90)}`);
  }
  ok(files.length > 1000 && defs > 900, `${files.length} scripts read, ${defs} inline ${C.HELPER_NAMES.join(' / ')} helpers found (non-vacuous; this file exempts itself)`);
  ok(swapped.length === 0, `no call hands its own helper a string where the condition goes${swapped.length ? ' — ' + swapped.slice(0, 12).join(' · ') : ''}`);
  const added = Object.entries(perFile).filter(([f, ls]) => ls.length > (LISTED[f] || 0)), fell = Object.keys(LISTED).filter((f) => (perFile[f] || []).length < LISTED[f]);
  ok(Object.keys(LISTED).length > 900 && added.length === 0, `the inline helpers without the swap guard only fall (${unguarded.length} in ${Object.keys(perFile).length} files, the list ${Object.values(LISTED).reduce((a, b) => a + b, 0)})${added.length ? ' — ADDED by ' + added.map(([f, ls]) => `${f}:${ls.join(',')} (import { checker } from './lib/check.mjs', or give the helper a guard line — if (typeof c !== 'boolean') throw new TypeError(…); on purpose: "${f}": ${ls.length} in scripts/fixtures/unguarded-helpers.json)`).join(' · ') : ''}`);
  if (fell.length) console.log(`    (${fell.length} listed file(s) no longer carry an unguarded helper — not red; drop their rows when convenient: ${fell.slice(0, 8).join(', ')}${fell.length > 8 ? ', …' : ''})`);
  // the one-way rule over plants: an added helper is red by name, a removed one is not
  const judge = (per, listed) => ({ added: Object.entries(per).filter(([f, ls]) => ls.length > (listed[f] || 0)).map(([f]) => f), fell: Object.keys(listed).filter((f) => (per[f] || []).length < listed[f]) });
  const jA = judge({ 'test-new.mjs': [7], 'test-old.mjs': [3] }, { 'test-old.mjs': 1 }), jB = judge({ 'test-old.mjs': [3, 9] }, { 'test-old.mjs': 1 }), jC = judge({}, { 'test-old.mjs': 1 });
  ok(jA.added.join() === 'test-new.mjs' && jB.added.join() === 'test-old.mjs' && jC.added.length === 0 && jC.fell.join() === 'test-old.mjs', 'ONE-WAY: a new file with its own helper, or a second helper in a listed file, is named; a file whose helper went is only said');

  // the census over planted texts (a helper spelled in pieces so no scanner reads THIS file's strings as one)
  const K = 'const', NF = `${K} ok = (n, c, e) => { if (c) { pass++; } else { fail++; } };\n`, CF = `${K} ok = (c, n, e) => { if (c) { pass++; } else { fail++; } };\n`;
  const kinds = (s) => C.helperDefs(s).map((x) => `${x.order}${x.guarded ? '+guard' : ''}`).join();
  ok(kinds(NF) === 'name-first' && kinds(CF) === 'cond-first', 'the order is the parameter the body tests: (n, c) testing c = name-first, (c, n) testing c = cond-first');
  ok(kinds(`${K} check = (name, cond, extra) => {\n  if (cond) { passed++; }\n  else { failed++; }\n};\nconst z = !name;\n`) === 'name-first', 'a multi-line body is read to its own closing brace — a later `!name` in the file is not its test');
  ok(kinds(`${K} ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError('x'); if (c) pass++; };\n`) === 'cond-first+guard' && kinds(`${K} ok = (c, n) => { if (typeof n !== 'string') throw new Error('x'); if (c) pass++; };\n`) === 'cond-first+guard',
    'a guard is a typeof refusal of the condition (≠ boolean) or of the name (≠ string)');
  ok(kinds(`${K} check = (s, act, pv) => { const present = new Set(s.requests); for (const a of act) step(a); };\n`) === 'unknown', 'a non-assertion check (no parameter tested as a condition) is unknown, never judged');
  ok(kinds(`${K} ok = (c, n) => { if (typeof n !== 'string') n = String(n); if (c) pass++; };\n`) === 'cond-first', 'a typeof test that COERCES is no guard (the swap still passes) — a guard throws or counts a fail');
  const sw = (s) => C.swappedCalls(s).map((c) => c.line).join();
  ok(sw(NF + "ok(x === 1, 'the leg');\n") === '2' && sw(CF + "ok('the leg', x === 1);\n") === '2', 'NEG: the swap is found both ways (a name-first helper handed (cond, \'name\'), a condition-first one handed (\'name\', cond))');
  ok(sw(NF + "ok(false,'the leg ran',  String(e));\n") === '2' && sw(NF + 'ok(a && b,\n  `every row ${rows.map((r) => `${r.k}`).join()} is judged`);\n') === '2', 'NEG: the shapes the release carried — a literal false in a catch, a multi-line template name with nested ${…}');
  ok(sw(NF + "ok('the leg', x === 1);\n" + "ok(`leg ${n}`, y > 2, 'detail');\n") === '' && sw(CF + "ok(x === 1, 'the leg');\nok(/a'b\\(/.test(s), 'regex');\nok(s === \"it's\", `t ${f({ a: 1 })}`);\n") === '',
    'the right orders pass — a regex holding a quote and a paren, a template with an object in its ${…}, a string compared in the condition');
  ok(sw(CF + "ok(c, name);\nok(f('x'), 'leg');\n") === '', 'a variable or a call in the condition slot is not a swap (the runtime guard owns those)');
  // B-1747's remainder (2.369.411): the names the shape survey found are read — a ck, leg or assert helper handed a swap is found
  // as an ok one is. RED CONTROL: the library as it was (ok / check only), a copy built from its names line, misses all three —
  // and still finds an ok swap (the copy is the old census, never a copy that reads nothing)
  const CK = `${K} ck = (n, c) => { if (c) { pass++; } else { fail++; } };\n`, LG = 'function le' + 'g(c, n) { if (c) { pass++; } else { fail++; } }\n';
  const AS = `${K} assert = (cond, name) => {\n  if (!cond) failed++;\n};\n`;
  ok(C.HELPER_NAMES.join() === 'ok,check,ck,leg,assert' && sw(CK + "ck(x === 1, 'the leg');\n") === '2' && sw(LG + "leg('the leg', y);\n") === '2' && sw(AS + "assert('the leg', y);\n") === '4', 'NEG: a ck, leg or assert helper handed a swap is found (the names the shape survey found: ok, check, ck, leg, assert)');
  const LIB = fs.readFileSync(path.join(REPO, 'scripts', 'lib', 'check.mjs'), 'utf-8'), NAMES_LINE = "export const HELPER_NAMES = Object.freeze(['ok', 'check', 'ck', 'leg', 'assert']);";
  ok(LIB.split(NAMES_LINE).length === 2, 'the anchor of the RED CONTROL (the names line) is in the source (scripts/lib/check.mjs)');
  if (LIB.split(NAMES_LINE).length === 2) {
    const OLD = await import(pathToFileURL(mutantCopies('cigate7b-lib', REPO).write('scripts/lib/check.mjs', LIB.replace(NAMES_LINE, "export const HELPER_NAMES = Object.freeze(['ok', 'check']);"), 'old-names')).href);
    ok(OLD.swappedCalls(NF + "ok(x === 1, 'the leg');\n").length === 1, 'the RED CONTROL proves itself first: the old copy still finds an ok helper\'s swap (it is the census as it was, not a copy that reads nothing)');
    ok(OLD.swappedCalls(CK + "ck(x === 1, 'the leg');\n").length === 0 && OLD.swappedCalls(LG + "leg('the leg', y);\n").length === 0 && OLD.swappedCalls(AS + "assert('the leg', y);\n").length === 0, 'RED CONTROL: the census as it was (ok / check only) reads no ck, leg or assert helper — their swaps pass unseen');
  }
  ok(sw(NF + "ok('a' === x, 'the leg');\n") === '2' && sw(CF + "ok('the leg', 'a' === x);\n") === '2', 'NEG: a condition that OPENS with a quote is still found in the name\'s place — the slot is judged as one whole literal, not by its first character');
  ok(sw(CF + "ok('k' in o, label);\n// never write ok('the leg', cond)\n * ok('in a doc block', x)\n") === '' && sw(CF + "ok(f(() => { return /a'b(/.test(s); }), 'leg');\nok('swapped', y);\n") === '3',
    'a condition that only opens with a quote is no swap, a call quoted in a whole-line comment is skipped, and a regex after `return` holding a quote and a paren does not end the scan early');

  // the one helper's guard, behaviourally — and its RED control: the same file with the guard lines removed lets the swap pass
  const lines = [], codes = [];
  const H = C.checker({ log: (l) => lines.push(l), err: (l) => lines.push(l), exit: (c) => { codes.push(c); return c; } });
  H.ok(true, 'a'); H.ok(false, 'b', { why: 1 });
  const throws = (f) => { try { f(); return false; } catch (e) { return e instanceof TypeError; } };
  ok(H.counts.pass === 1 && H.counts.fail === 1 && lines.join('|') === '  ✓ a|  ✗ b — {"why":1}', 'checker(): «  ✓ name» / «  ✗ name — detail», one count each');
  ok(throws(() => H.ok('the leg', true)) && throws(() => H.ok(1, 'n')) && throws(() => H.ok({}, 'n')) && throws(() => H.ok(undefined, 'n')) && throws(() => H.ok(true, '')) && throws(() => H.ok(true, 5)),
    'the swap THROWS (a name where the condition goes, a value where a comparison belongs, an empty or missing name) — a crash with a stack, never a green leg');
  H.report();
  ok(codes.join() === '1' && /^\n1 FAILED \(1 passed\)$/.test(lines[lines.length - 1]), 'report(): «n FAILED (m passed)» and exit 1 on a red');
  const MC = mutantCopies('cigate7b-check', REPO), libSrc = fs.readFileSync(path.join(dir, 'lib/check.mjs'), 'utf-8');
  const unguardedSrc = libSrc.split('\n').filter((l) => !/^\s*if \(typeof (cond|name) !== /.test(l)).join('\n');
  ok(unguardedSrc.split('\n').length === libSrc.split('\n').length - 2, 'RED control: the copy without the two guard lines is the lib minus exactly two lines');
  const U = await import(pathToFileURL(MC.write('scripts/lib/check.mjs', unguardedSrc, 'unguarded')).href);
  const H2 = U.checker({ log: () => { }, err: () => { }, exit: () => { } });
  ok(!throws(() => H2.ok('the leg', true)) && H2.counts.pass === 1, 'RED control: without the guard the swapped call PASSES — the throw above is the guard\'s, not luck');
  ok(kinds(libSrc) === 'cond-first+guard' && kinds(unguardedSrc) === 'cond-first', 'the census reads the lib\'s own ok as a guarded condition-first helper, and the copy without the guard as an unguarded one');
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
  // THE SUITES' ONE HUB BOOT (lane boot-helper, 主开发 2026-11-17): a suite on scripts/hub-boot.mjs spawns no server.js itself —
  // the BOOT INPUTS reach it through the helper's own text (BOOTS_THE_PRODUCT matches its 'server.js'), which sits in every helper
  // suite's import closure. Pinned over the helper ALONE: a stub tree holding a suite that imports and calls startHub and the
  // helper's real bytes (its own imports absent, so nothing else is walked); the control is the same helper no longer spelling
  // the server's name — that suite then carries no boot input, the affected tier would never select it for a product change.
  {
    const hb = mktmp('helper-boot');
    const hw = (rel, body) => { fs.mkdirSync(path.dirname(path.join(hb, rel)), { recursive: true }); fs.writeFileSync(path.join(hb, rel), body); };
    const helperSrc = fs.readFileSync(path.join(REPO, 'scripts', 'hub-boot.mjs'), 'utf-8');
    hw('scripts/test-on-helper.mjs', "import { mintRoot, startHub } from './hub-boot.mjs';\nconst hub = startHub({ root: mintRoot('x'), tree: 't', port: 1 });\nawait hub.ready();\n");
    const bootOf = (helperText) => { hw('scripts/hub-boot.mjs', helperText); const { files, prefixes, via } = suiteInputs({ name: 'test-on-helper' }, { root: hb }); return { files: files.has('scripts/hub-boot.mjs'), boot: files.has('server.js') && ['src/', 'public/', 'data/bin/'].every((p) => prefixes.has(p)) && ['server.js', 'src/', 'public/', 'data/bin/'].every((p) => via.get(p) === 'boot') }; };
    const real = bootOf(helperSrc), blind = bootOf(helperSrc.replace(/server\.js/g, 'the-hub'));
    ok(real.files && real.boot && blind.files && !blind.boot,
      'a suite on the boot helper carries the BOOT INPUTS (server.js, src/, public/, data/bin/ — «boots the product») through scripts/hub-boot.mjs alone; CONTROL: the same helper no longer spelling the server\'s name — the suite still loads it and carries none', { real, blind });
  }
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

// ── §8e THE FAST TIER LISTS EVERY RED WITH --keep-going (B-6e71) ──
// The 2026-11-06 .382 cut: the fast tier stopped at one standing red (a date fixture) and three lane reds behind it were
// never reached — a re-cut each. runFastLanes is fastGate's loop; driven here over PLANTED suites through the REAL
// runSuiteAsync (real children, two lanes + the serial lane). A slow row waits on a FILE, never a clock: keep-going
// releases it when the first red is seen (it must finish, not be killed); fail-fast never releases it (it is SIGTERMed).
// The control is a patched copy of ci.mjs without the keep-going branch: its keep-going run lists ONE red.
console.log('\n§8e the fast tier lists every red with --keep-going (B-6e71)');
{
  const ci = await import('./ci.mjs');
  const root = mktmp('keepgoing');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const plant = (name, body) => fs.writeFileSync(path.join(root, 'scripts', name + '.mjs'), body);
  const release = path.join(root, 'release'); // ONE path (the runner's env is fixed at its import): each drive starts without it
  plant('test-kg-slow', `import fs from 'node:fs';\nconst t = setInterval(() => { if (fs.existsSync(${JSON.stringify(release)})) { clearInterval(t); console.log('ALL PASS (1)'); } }, 20);\n`);
  for (const n of ['test-kg-red1', 'test-kg-red2']) plant(n, `console.log('  ✗ planted ${n}');\nconsole.log('1 FAILED');\nprocess.exit(1);\n`);
  for (const n of ['test-kg-green1', 'test-kg-green2', 'test-kg-last']) plant(n, `console.log('ALL PASS (1)');\n`);
  const row = (name) => ({ name, tier: 'fast', budgetMs: 8000 });
  const plan = () => ({ parallel: ['test-kg-slow', 'test-kg-red1', 'test-kg-green1', 'test-kg-red2', 'test-kg-green2'].map(row), serial: [row('test-kg-last')] });
  const drive = async (M, tag, keepGoing) => {
    const failDir = path.join(root, `fail-${tag}`), rows = [], said = [], inflight = new Set();
    fs.rmSync(release, { force: true });
    const res = await M.runFastLanes(plan(), {
      lanes: 2, keepGoing, inflight, failDir, sha: 'kee9601e0000', log: (l) => said.push(l), refusal: () => 'the retry is §8f\'s (B-3f38)',
      run: (s, { lane }) => M.runSuiteAsync(s, { root, sha: 'kee9601e0000', lane, inflight }),
      after: async (r) => { rows.push(r.lines.join('\n')); if (keepGoing && /✗ test-kg-red1 FAILED/.test(r.lines[0])) fs.writeFileSync(release, '1'); },
    });
    return { ...res, rows, said, fails: fs.existsSync(failDir) ? fs.readdirSync(failDir).sort() : [] };
  };
  const kg = await drive(ci, 'kg', true);
  const names = (xs) => xs.map((t) => t.name).sort().join(',');
  ok(kg.reds.slice().sort().join(',') === 'test-kg-red1,test-kg-red2' && !kg.stoppedBy,
    `--keep-going: BOTH planted reds are listed by name (${kg.reds.join(', ')}), nothing stopped the tier`);
  ok(names(kg.timings) === 'test-kg-green1,test-kg-green2,test-kg-last,test-kg-slow' && !kg.rows.some((l) => /stopped \[lane/.test(l)) && !kg.said.some((l) => /\[ci\] stopping:/.test(l)),
    `…every green row ran — the slow one in flight at the first red FINISHED (not SIGTERMed), and the serial lane ran (${names(kg.timings)})`);
  ok(kg.fails.join(',') === 'kee9601e.test-kg-red1.1.log,kee9601e.test-kg-red2.1.log',
    `…and each red keeps its whole output in the fail-log dir (${kg.fails.join(', ')})`);
  const ff = await drive(ci, 'ff', false);
  ok(ff.reds.join(',') === 'test-kg-red1' && ff.stoppedBy === 'test-kg-red1' && ff.rows.some((l) => /test-kg-slow stopped \[lane 1\] — test-kg-red1 is red/.test(l))
    && !ff.rows.some((l) => /test-kg-red2|test-kg-last/.test(l)) && ff.said.some((l) => /\[ci\] stopping: test-kg-red1 is red — 1 suite\(s\) in flight/.test(l)),
    'FAIL-FAST stays the default (the push gate): the first red SIGTERMs the slow row («stopped», not judged), red2 and the serial lane never start');
  // the CONTROL: ci.mjs without the keep-going branch — the same keep-going run lists one red and stops
  const M = mutantCopies('ci-keepgoing', REPO);
  const src = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8'), CUT = '      if (!keepGoing && !stoppedBy) {\n';
  const mut = await import(pathToFileURL(M.write('scripts/ci.mjs', src.replace(CUT, '      if (!stoppedBy) {\n'), 'no-keep-going', { esm: true })).href);
  const kgMut = src.includes(CUT) ? await drive(mut, 'mut', true) : null;
  ok(!!kgMut && kgMut.reds.length === 1 && kgMut.stoppedBy === 'test-kg-red1',
    `CONTROL: a copy of ci.mjs without the keep-going branch lists ONE red under --keep-going (${kgMut ? kgMut.reds.join(', ') : 'the cut line is gone'}) — the legs above are red without the change`);
  // the flag reaches the tier: ci.mjs knows it (an unknown flag runs nothing) and main() hands it to fastGate
  const cli = (flag) => spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), flag, '--help'], { encoding: 'utf-8', env: { ...GIT_ENV, VS_NO_REAL_CLI: '1' }, timeout: 60000 });
  const known = cli('--keep-going'), typo = cli('--keep-goin');
  ok(known.status === 2 && !/does not know --keep-going/.test(known.stderr) && /--keep-going: every red listed/.test(known.stderr) && typo.status === 2 && /does not know --keep-goin /.test(typo.stderr),
    'ci.mjs KNOWS --keep-going (the usage says it; a typo of it is refused by name and runs nothing)');
  ok(/\n {2}fastGate\(\{ sha: str\('sha'\), isolate: !!arg\('isolate'\), keepGoing: !!arg\('keep-going'\), part \}\)/.test(src),   // B-7353: --fast-part's part rides the same call
    'WIRING: main() hands --keep-going to fastGate (and fastGate to runFastLanes — test-ci-gate §2i pins that line)');
  // B-d24c (3)'s follow-up (the coordinator's as-if-must): a keep-going part WITH a red still exits 1 — fastClosing is fastGate's
  // one closing road (a later edit gating that return on the flag would turn a red into a green); on the hosted runner ONE
  // `::error` line names every red on the run page, and only there
  const { fastClosing } = ci;
  const kgR = fastClosing({ reds: ['test-kg-red1', 'test-kg-red2'], keepGoing: true, ran: 6, hangDir: '/x', part: { i: 1, n: 2 }, env: { GITHUB_ACTIONS: 'true' } });
  const ffR = fastClosing({ reds: ['test-kg-red1'], keepGoing: false, ran: 6, hangDir: '/x', env: {} });
  const kgBox = fastClosing({ reds: ['test-kg-red1'], keepGoing: true, ran: 6, hangDir: '/x', env: {} });
  const kgG = fastClosing({ reds: [], flaky: ['test-kg-green1'], keepGoing: true, ran: 6, hangDir: '/x', env: { GITHUB_ACTIONS: 'true' } });
  const annOf = (r) => r.out.filter(([, l]) => l.startsWith('::error')).map(([, l]) => l);
  ok(kgR.code === 1 && ffR.code === 1 && kgBox.code === 1 && kgG.code === null && kgR.out.some(([w, l]) => w === 'err' && /--keep-going: 2 red of 6 suites that ran — test-kg-red1, test-kg-red2/.test(l)),
    'a planted red is EXIT 1 with --keep-going (on the runner and on a box) AND without — a part that ran to its end is never a green; no red, no exit code from the closing');
  ok(annOf(kgR).length === 1 && annOf(kgR)[0] === '::error title=fast 1/2::2 red: test-kg-red1, test-kg-red2' && !annOf(ffR).length && !annOf(kgBox).length && !annOf(kgG).length,
    'on the hosted runner ONE ::error line names every red on the run page (GITHUB_ACTIONS only; none on a box, none for a green)', annOf(kgR));
  // THE WIRING, from the lanes' end to the process's exit code (the adversarial read: the closing's three lines alone let an early
  // `return 0` before them, a dropped `env`/`part`, or main()'s `.then` swallowing a part's 1 stay green): fastGate hands EVERY
  // fact to fastClosing, nothing returns between the lanes' end and it, its 1 is returned, and main() exits with fastGate's code
  const wiredClosing = (x) => {
    const a = x.indexOf('} = await runFastLanes(plan, {'), b = x.indexOf('const closing = fastClosing(', a);
    return a > 0 && b > a && !/\breturn\b/.test(x.slice(a, b))
      && /\n\s*const closing = fastClosing\(\{ reds, flaky, skippedLegs, keepGoing, ran: fast\.length - absent\.length - skippedByName\.length, hangDir, part, env: process\.env \}\);\n\s*for \(const \[w, l\] of closing\.out\) \(w === 'err' \? console\.error : console\.log\)\(l\);\n\s*if \(closing\.code === 1\) return 1;\n/.test(x)
      && /\n {2}fastGate\(\{ sha: str\('sha'\), isolate: !!arg\('isolate'\), keepGoing: !!arg\('keep-going'\), part \}\)\n\s*\.then\(\(code\) => exitFlushed\(code\), /.test(x);
  };
  ok(wiredClosing(src), 'WIRING: fastGate hands every fact to fastClosing (env and part included), nothing returns between the lanes\' end and it, its 1 is returned, and main() exits with fastGate\'s code');
  // CONTROLS of the wiring pin — each mutant's anchor fails BY NAME when it is not in the source, and each mutant is refused
  const wiringMutants = [
    ['the exit on the flag', 'if (closing.code === 1) return 1;', 'if (closing.code === 1 && !keepGoing) return 1;'],
    ['an early return before the closing', '    const closing = fastClosing(', '    if (keepGoing) return 0;\n    const closing = fastClosing('],
    ['the annotation\'s env dropped', 'hangDir, part, env: process.env });', 'hangDir, part, env: {} });'],
    ['the part dropped', 'hangDir, part, env: process.env });', 'hangDir, part: null, env: process.env });'],
    ['the skipped legs dropped (B-4829 meets the closing here)', 'fastClosing({ reds, flaky, skippedLegs, keepGoing,', 'fastClosing({ reds, flaky, keepGoing,'],
    ['main() swallowing a part\'s 1', "part })\n    .then((code) => exitFlushed(code), ", "part })\n    .then((code) => exitFlushed(part ? 0 : code), "],
  ];
  for (const [what, from, to] of wiringMutants) {
    const there = src.split(from).length - 1 === 1;
    ok(there, `WIRING control «${what}»: its anchor is in scripts/ci.mjs once`, there ? undefined : 'the anchor of the control «' + what + '» is not in the source');
    ok(there && !wiredClosing(src.replace(from, to)), `WIRING control «${what}»: the mutant is refused by the pin`);
  }
  // the annotation's message escapes %, CR and LF (GitHub's workflow-command rule); control: the unescaped line is not what it prints
  const escR = fastClosing({ reds: ['a%b\nc\rd'], env: { GITHUB_ACTIONS: 'true' } });
  ok(annOf(escR).length === 1 && annOf(escR)[0] === '::error title=fast::1 red: a%25b%0Ac%0Dd' && annOf(escR)[0] !== '::error title=fast::1 red: a%b\nc\rd',
    'the ::error message escapes % → %25, LF → %0A, CR → %0D (a name can never break the workflow command)', annOf(escR));
}

// ── §8f A RED FAST SUITE IS RUN ONCE MORE, AND THE RETRY IS COUNTED (B-3f38) ──
// int361 2026-11-07: three load-sensitive fast legs reddened three master runs in a row, each green on a manual rerun;
// the heavy tier retries once and keeps a ledger, the fast tier stopped at the first red. Planted suites through the REAL
// runSuiteAsync: a flake (red on its first try only — a marker FILE, never a clock), a suite red on both tries, a red
// test-chat-e2e (the one real turn: never retried), a green. The control is a copy of ci.mjs whose retry is cut.
console.log('\n§8f a red fast suite runs once more — green again is FLAKY and counted, red again is red (B-3f38)');
{
  const ci = await import('./ci.mjs');
  const root = mktmp('fastretry');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const plant = (name, body) => fs.writeFileSync(path.join(root, 'scripts', name + '.mjs'), body);
  const once = path.join(root, 'flake-seen');
  plant('test-rr-flaky', `import fs from 'node:fs';\nif (!fs.existsSync(${JSON.stringify(once)})) { fs.writeFileSync(${JSON.stringify(once)}, '1'); console.log('  ✗ planted flake (first try)'); console.log('1 FAILED'); process.exit(1); }\nconsole.log('ALL PASS (1)');\n`);
  plant('test-rr-red', `console.log('  ✗ planted red (every try)');\nconsole.log('1 FAILED');\nprocess.exit(1);\n`);
  plant('test-chat-e2e', `console.log('  ✗ planted real-turn red');\nconsole.log('1 FAILED');\nprocess.exit(1);\n`);
  plant('test-rr-green', `console.log('ALL PASS (1)');\n`);
  // batch 24's reader: THE STOP LANDING DURING A RETRY, placed by FILES — cut-a is red on its first try and its retry then waits for
  // ever; cut-b's first try waits until cut-a's retry has started, then both its tries are red: fail-fast stops on cut-b while
  // cut-a's retry is in flight (SIGTERMed — «stopped», judged by nobody) and cut-a is still NAMED red
  const cutFirst = path.join(root, 'cut-a-first'), cutRetrying = path.join(root, 'cut-a-retrying'), cutBFirst = path.join(root, 'cut-b-first');
  plant('test-rr-cut-a', `import fs from 'node:fs';\nif (!fs.existsSync(${JSON.stringify(cutFirst)})) { fs.writeFileSync(${JSON.stringify(cutFirst)}, '1'); console.log('  ✗ planted cut-a (first try)'); console.log('1 FAILED'); process.exit(1); }\nfs.writeFileSync(${JSON.stringify(cutRetrying)}, '1');\nsetInterval(() => { }, 1000);\nsetTimeout(() => process.exit(1), 30000);\n`); // (its own bound: never an orphan past 30 s)
  plant('test-rr-cut-b', `import fs from 'node:fs';\nconst red = (w) => { console.log('  ✗ planted cut-b (' + w + ')'); console.log('1 FAILED'); process.exit(1); };\nif (fs.existsSync(${JSON.stringify(cutBFirst)})) red('retry');\nfs.writeFileSync(${JSON.stringify(cutBFirst)}, '1');\nconst t = setInterval(() => { if (fs.existsSync(${JSON.stringify(cutRetrying)})) { clearInterval(t); red('first try'); } }, 10);\n`);
  const row = (name) => ({ name, tier: 'fast', budgetMs: 60000 }); // (80 % of it — the retry's own budget rule — is far past any planted try)
  const drive = async (M, tag, { keepGoing = true, names = ['test-rr-flaky', 'test-rr-red', 'test-chat-e2e', 'test-rr-green'], lanes = 1 } = {}) => {
    const failDir = path.join(root, `fail-${tag}`), ledger = path.join(root, `ledger-${tag}`, 'reruns.jsonl'), said = [], rows = [], inflight = new Set(), runs = [];
    for (const f of [once, cutFirst, cutRetrying, cutBFirst]) fs.rmSync(f, { force: true });
    const res = await M.runFastLanes({ parallel: names.map(row), serial: [] }, {
      lanes, keepGoing, inflight, failDir, ledger, sha: 'f1a4e3f38000', log: (l) => said.push(l),
      run: (s, { lane, attempt = 1 }) => { runs.push(`${s.name}#${attempt}`); return M.runSuiteAsync(s, { root, sha: 'f1a4e3f38000', lane, inflight }); },
      after: async (r) => { rows.push(r.lines.join('\n')); },
    });
    let lines = []; try { lines = fs.readFileSync(ledger, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { }
    return { ...res, said, rows, runs, lines, fails: fs.existsSync(failDir) ? fs.readdirSync(failDir).sort() : [] };
  };
  const a = await drive(ci, 'kg');
  ok(a.flaky.join(',') === 'test-rr-flaky' && a.reds.slice().sort().join(',') === 'test-chat-e2e,test-rr-red' && a.timings.some((t) => t.name === 'test-rr-flaky'),
    `the flake is FLAKY (green on its retry, counted, not red); the suite red twice is red (flaky: ${a.flaky.join(', ')} · red: ${a.reds.join(', ')})`);
  ok(a.runs.join(' ') === 'test-rr-flaky#1 test-rr-flaky#2 test-rr-red#1 test-rr-red#2 test-chat-e2e#1 test-rr-green#1'
    && a.said.some((l) => /^ {2}· test-chat-e2e is not retried — the one real turn: a retry would bill a second one/.test(l)),
    `ONE retry each, on its lane — never the real turn (test-chat-e2e: not retried, said why) (${a.runs.join(' ')})`);
  const L = Object.fromEntries(a.lines.map((x) => [x.suite, x]));
  ok(a.lines.length === 2 && L['test-rr-flaky']?.again.ok === true && L['test-rr-red']?.again.ok === false && L['test-rr-flaky'].sha === 'f1a4e3f38000' && L['test-rr-flaky'].lane === '1'
    && /planted flake \(first try\)/.test(L['test-rr-flaky'].first.tail[0] || '') && Array.isArray(L['test-rr-red'].again.load) && !L['test-chat-e2e'],
    `the ledger: ONE line per retried red — the suite, the sha, its lane, the first try's ✗ line, both loads, the second outcome (${a.lines.map((x) => `${x.suite} → ${x.again.ok ? 'green' : 'red'}`).join(' · ')})`);
  ok(a.said.some((l) => /^ {2}\[ci\] RERUN LEDGER test-rr-flaky: red \(load [\d.]+→[\d.]+\) → GREEN — FLAKY, counted \(load [\d.]+→[\d.]+\) — \S+reruns\.jsonl$/.test(l)) && a.said.some((l) => /^ {2}\[ci\] RERUN LEDGER test-rr-red: red .* → red again /.test(l)),
    '…said on the log in the heavy tier\'s words (rerunSaid — the ledger line of both tiers is ONE shape, rerunRecord)');
  ok(a.fails.join(',') === 'f1a4e3f3.test-chat-e2e.1.log,f1a4e3f3.test-rr-flaky.1.log,f1a4e3f3.test-rr-red.1.log,f1a4e3f3.test-rr-red.2.log',
    `every red try keeps its whole output, the try in its name (${a.fails.join(', ')})`);
  const ff = await drive(ci, 'ff', { keepGoing: false, names: ['test-rr-flaky', 'test-rr-green'] });
  ok(!ff.reds.length && !ff.stoppedBy && ff.flaky.join(',') === 'test-rr-flaky' && ff.timings.map((x) => x.name).join(',') === 'test-rr-flaky,test-rr-green',
    'FAIL-FAST: a flake no longer stops the tier — it is retried, counted, and the next row runs');
  const cut = await drive(ci, 'cut', { keepGoing: false, names: ['test-rr-cut-a', 'test-rr-cut-b'], lanes: 2 });
  const Lc = Object.fromEntries(cut.lines.map((x) => [x.suite, x]));
  ok(cut.stoppedBy === 'test-rr-cut-b' && cut.reds.join(',') === 'test-rr-cut-b,test-rr-cut-a' && cut.runs.slice().sort().join(' ') === 'test-rr-cut-a#1 test-rr-cut-a#2 test-rr-cut-b#1 test-rr-cut-b#2'
    && cut.rows.some((l) => /test-rr-cut-a stopped \[lane 1\] — test-rr-cut-b is red/.test(l)) && cut.said.some((l) => /^ {2}· test-rr-cut-a: red on its first try; its retry was stopped — test-rr-cut-b is red$/.test(l))
    && Lc['test-rr-cut-b']?.again.ok === false && !Lc['test-rr-cut-a'],
    `FAIL-FAST, a stop during a retry (batch 24's reader): cut-b, red on both tries, stops the tier while cut-a's retry runs — that retry is «stopped» and judged by nobody, cut-a stays NAMED red (${cut.reds.join(', ')}); the ledger has cut-b's line only`);
  {   // …and its CONTROL: the cut2 branch that only breaks (the batch-24 tip) drops cut-a from the reds
    const src24 = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8'), NAMED = "        if (cut2) { reds.push(s.name); log(`  · ${s.name}: red on its first try; its retry was stopped — ${cut2} is red`); break; }\n";
    const M24 = src24.includes(NAMED) ? await import(pathToFileURL(mutantCopies('ci-cut2', REPO).write('scripts/ci.mjs', src24.replace(NAMED, '        if (cut2) break;\n'), 'cut2-drop', { esm: true })).href) : null;
    const cut0 = M24 ? await drive(M24, 'cut0', { keepGoing: false, names: ['test-rr-cut-a', 'test-rr-cut-b'], lanes: 2 }) : null;
    ok(!!cut0 && cut0.stoppedBy === 'test-rr-cut-b' && cut0.reds.join(',') === 'test-rr-cut-b', `CONTROL: the cut2 branch that only breaks names ONE red (${cut0 ? cut0.reds.join(', ') : 'the anchor is gone'}) — the leg above is red without the cure`);
  }
  ok(ci.fastRetryRefusal({ name: 'test-x', budgetMs: 10000 }, { status: 1, ms: 8500, lines: ['', '  ✗ a leg', ''] }).includes('of its 10 s budget')
    && ci.fastRetryRefusal({ name: 'test-x', budgetMs: 10000 }, { status: 1, ms: 500, lines: ['', '  ✗ TIMEOUT (3 s) — a short bound inside a leg', ''] }) === '',
    'a red that ran > 80 % of its budget is not retried (batch 24\'s reader); a quick red is — a short «✗ TIMEOUT» inside a leg included (the load-sensitive leg the retry exists for)');
  ok(ci.fastRetryRefusal({ name: 'test-x' }, { killedFromOutside: true }).includes('did not send') && ci.fastRetryRefusal({ name: 'test-x' }, { error: { code: 'ETIMEDOUT' } }).includes('hung') && ci.fastRetryRefusal({ name: 'test-x' }, { status: 1, hangReport: '/x/f1a4e3f3.test-x.1.hang.json' }).includes('own watchdog') && ci.fastRetryRefusal({ name: 'test-x' }, { status: 1 }) === ''
    && ci.FAST_NO_RETRY.every((r) => SUITES.some((s) => s.name === r.name && s.tier === 'fast') && r.why.length > 20),
    'fastRetryRefusal: a suite killed from outside (the run is being torn down) or hung — to its budget or to its own watchdog (a hang report kept) — is not retried; a plain red is; every FAST_NO_RETRY row names a fast suite and why');
  // the CONTROL: ci.mjs with the retry cut — the flake is RED and nothing is counted
  const M = mutantCopies('ci-fastretry', REPO);
  const src = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8'), CUT = "      const no = stoppedBy ? `${stoppedBy} is red — the tier is stopping` : refusal(s, r);\n";
  const mut = src.includes(CUT) ? await import(pathToFileURL(M.write('scripts/ci.mjs', src.replace(CUT, "      const no = 'the retry cut (the control)';\n"), 'no-retry', { esm: true })).href) : null;
  const b = mut ? await drive(mut, 'mut') : null;
  ok(!!b && b.reds.includes('test-rr-flaky') && !b.flaky.length && !b.lines.length,
    `CONTROL: a copy of ci.mjs without the retry calls the flake RED and counts nothing (${b ? b.reds.join(', ') : 'the cut line is gone'}) — the legs above are red without the change`);
  ok(/ledger: path\.join\(repo, \.\.\.FAST_RERUNS\.split\('\/'\)\)/.test(src) && ci.FAST_RERUNS === 'data/ci-fast/reruns.jsonl' && /hang: \{ dir: hangDir, attempt \} \}\)/.test(src)
    && /const line = rerunRecord\(\{ sha, suite: s\.name, lane, first, again \}\);/.test(src),
    'WIRING: fastGate keeps its ledger in data/ci-fast/reruns.jsonl, a retry\'s hang report is named by its try, and the heavy tier writes the same rerunRecord');
}
// ── §8g A VERSION BUMP IS NO DEPENDENCY CHANGE · EVERY SELECTION SAYS ITS ONE RULE (主开发 2026-11-17, the owner's «开发和测试太慢») ──
console.log('\n§8g a version-only bump is no global input; --rules names the one rule behind each selection');
{
  const { affectedSuites, versionOnlyChange, rulesReport } = await import('./ci.mjs');
  // ONE commit per state (a git spawn per file cost ~2 s here)
  const state = (repo, files, msg) => { for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), body); } git(repo, ['add', '-f', ...Object.keys(files)]); git(repo, ['commit', '-q', '-m', msg]); return git(repo, ['rev-parse', 'HEAD']); };
  const pj = (o = {}) => JSON.stringify({ name: 'x', version: '1.0.0', dependencies: { a: '1.0.0' }, scripts: { build: 'b' }, engines: { node: '>=22' }, ...o }, null, 2) + '\n';
  const lk = (v, dep = '1.0.0') => JSON.stringify({ name: 'x', version: v, lockfileVersion: 3, packages: { '': { name: 'x', version: v, dependencies: { a: dep } }, 'node_modules/a': { version: dep } } }, null, 2) + '\n';
  ok(versionOnlyChange('package.json', pj(), pj({ version: '1.0.1' })) && versionOnlyChange('package-lock.json', lk('1.0.0'), lk('1.0.1')),
    'PURE: a diff that moves only package.json\'s version — or the lock\'s two mirrored version lines — is version-only');
  ok(!versionOnlyChange('package.json', pj(), pj({ version: '1.0.1', dependencies: { a: '1.0.1' } })) && !versionOnlyChange('package.json', pj(), pj({ scripts: { build: 'c' } })) && !versionOnlyChange('package.json', pj(), pj({ engines: { node: '>=24' } }))
    && !versionOnlyChange('package-lock.json', lk('1.0.0'), lk('1.0.1', '1.0.1')) && !versionOnlyChange('package.json', pj(), '{ not json'),
    'PURE CONTROLS: a dependency, a script or an engine moved with the version, a lock whose dependency moved, a text that is not JSON — never version-only');
  // A REAL RANGE: the bump alone selects only the suite that DECLARES reads: package.json — never one whose product module loads it
  const vrepo = makeRepo('version');
  const v0 = state(vrepo, { 'src/a.js': "const v = require('../package.json').version;\nmodule.exports = v;\n", 'scripts/test-a.mjs': "import a from '../src/a.js';\nconsole.log(a);\n", 'scripts/test-b.mjs': "console.log('b');\n", 'package-lock.json': lk('1.0.0'), 'package.json': pj() }, 'the tree: a reads the version, test-a loads it');
  const v1 = state(vrepo, { 'package-lock.json': lk('1.0.1'), 'package.json': pj({ version: '1.0.1' }) }, 'the bump: package.json and its lock, the version only');
  const VS = [{ name: 'test-a' }, { name: 'test-b' }, { name: 'test-reads', reads: ['package.json'] }];
  const bump = affectedSuites({ range: `${v0}..${v1}`, suites: VS, root: vrepo });
  ok(bump.selected.map((s) => s.name).join() === 'test-reads' && bump.ruleOf.get('test-reads').rule === 'reads' && bump.ruleOf.get('test-reads').file === 'package.json',
    `a version-only bump of package.json AND its lock selects ONLY the suite that declares reads: package.json — not test-a, whose product module loads it (${bump.selected.map((s) => s.name).join() || 'nothing'})`);
  const v2 = state(vrepo, { 'package.json': pj({ version: '1.0.2', dependencies: { a: '2.0.0' } }) }, 'a dependency bump with the version');
  const dep = affectedSuites({ range: `${v1}..${v2}`, suites: VS, root: vrepo });
  ok(dep.selected.length === 3 && [...dep.ruleOf.values()].every((r) => r.rule === 'global' && r.file === 'package.json'), 'RED CONTROL: a dependency bump (with the version) still selects the WHOLE tier — every suite by the global rule');
  ok(affectedSuites({ range: v1, suites: VS, root: vrepo }).selected.length === 3, 'a lone-sha range has no single base to diff against: the global rule stands');
  // --rules: ONE rule per selected suite — own · closure · names · boot · reads · always (and global above)
  const rrepo = makeRepo('rules');
  const r0 = state(rrepo, { 'src/a.js': 'module.exports = 1;\n', 'src/b.js': 'module.exports = 2;\n', 'src/c.js': 'module.exports = 3;\n', 'scripts/test-closure.mjs': "import a from '../src/a.js';\nconsole.log(a);\n",
    'scripts/test-names.mjs': "const f = 'src/b.js';\nconsole.log(f);\n", 'scripts/test-boot.mjs': "const s = 'server.js';\nconsole.log(s);\n", 'scripts/test-own.mjs': "console.log(1);\n", 'scripts/test-reads.mjs': "console.log(1);\n" }, 'the suites');
  const r1 = state(rrepo, { 'src/a.js': 'module.exports = 11;\n', 'src/b.js': 'module.exports = 22;\n', 'src/c.js': 'module.exports = 33;\n', 'scripts/test-own.mjs': "console.log(2);\n" }, 'a, b, c and test-own move');
  const RS = [{ name: 'test-closure' }, { name: 'test-names' }, { name: 'test-boot' }, { name: 'test-own' }, { name: 'test-reads', reads: ['src/c.js'] }, { name: 'test-al', always: true }];
  const ru = affectedSuites({ range: `${r0}..${r1}`, suites: RS, root: rrepo, reach: false });
  const said = RS.map((s) => `${s.name}=${(ru.ruleOf.get(s.name) || {}).rule}`).join(' ');
  ok(said === 'test-closure=closure test-names=names test-boot=boot test-own=own test-reads=reads test-al=always' && ru.ruleOf.get('test-closure').file === 'src/a.js',
    `every selected suite carries the ONE rule that selected it and its input file (${said})`);
  const rep = rulesReport(['test-closure', 'test-own', 'test-al'], ru.ruleOf, { range: `${r0}..${r1}` });
  ok(JSON.stringify(rep.ruleLines) === JSON.stringify(['test-closure\tclosure\tsrc/a.js', 'test-own\town\tscripts/test-own.mjs', 'test-al\talways\t-']) && JSON.stringify(rep.ruleCount) === '{"closure":1,"own":1,"always":1}',
    'the --rules report: one «name · rule · file» line per suite and the count per rule');
  const ciSrc = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  ok(/const all = SUITES\.filter\(\(s\) => s\.tier === tier\);/.test(ciSrc) && /return rules \? \{ names, summary, \.\.\.rulesReport\(names, a\.ruleOf, \{ range \}\) \} : \{ names, summary \};/.test(ciSrc)
    && /tier: str\('tier'\) === 'fast' \? 'fast' : 'heavy', rules: !!arg\('rules'\)/.test(ciSrc) && /if \(l\.ruleLines\) \{[^\n]*console\.log\(l\.ruleLines\.join\('\\n'\)\); \} else console\.log\(l\.names\.join\(','\)\);/.test(ciSrc),
    'WIRING: --list-affected --tier=fast lists the FAST rows; --rules prints the report (the count on stderr); without it the comma-joined names as before');
}

// ── §8h A SKIP IS NOT A GREEN (B-4829) ──
// 2026-11-18: on a test machine with no sshd two heavy suites skipped their real road and ended rc 0 — and the green row
// kept only the LAST stdout line (80 characters), so a skip said mid-output read as a green and only a SKIP on the last
// line could be named. Planted suites through the REAL runSuiteAsync + runFastLanes: one says two SKIPs in the MIDDLE and
// ends ALL PASS; one says «<leg> SKIPPED: why» on stdout and its SKIP on stderr; one is red on its first try and green with
// a SKIP on its retry; one is a plain green whose lines carry SKIP inside a word or a sentence. The shapes are the tree's:
// a walk of every printed literal in scripts/ (a fixed-string scan of the tracked files) — every SKIP line counted, the
// sentences ABOUT a skip a one-way fixture. The control is a copy of ci.mjs whose green row is today's last-line rule.
console.log('\n§8h a green suite\'s SKIP lines are counted on its row and named at the close — a skip is never a green (B-4829)');
{
  const ci = await import('./ci.mjs');
  const { anchored } = await import('./scratch.mjs');
  const root = mktmp('skiplegs');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const plant = (name, body) => fs.writeFileSync(path.join(root, 'scripts', name + '.mjs'), body);
  const once = path.join(root, 'flaky-seen');
  plant('test-sk-mid', "console.log('§1 planted');\nconsole.log('  ✓ leg one');\nconsole.log('  ⊘ SKIP the real road — no sshd on this machine');\nconsole.log('  ✓ leg three');\nconsole.log('  · SKIP (leg four: no xpra here)');\nconsole.log('\\nALL PASS (2)');\n");
  plant('test-sk-err', "console.log('  – corpus smoke SKIPPED: no rollouts on this machine');\nconsole.error('SKIP: no chrome binary on this machine');\nconsole.log('ALL PASS (0)');\n");
  plant('test-sk-flaky', `import fs from 'node:fs';\nif (!fs.existsSync(${JSON.stringify(once)})) { fs.writeFileSync(${JSON.stringify(once)}, '1'); console.log('  ✗ planted flake (first try)'); console.log('1 FAILED'); process.exit(1); }\nconsole.log('  ○ SKIP the retry leg — no dtach here');\nconsole.log('ALL PASS (1)');\n`);
  plant('test-sk-green', "console.log('  ✓ SKIP_AGENT_HOOKS is set in the child env');\nconsole.log('  ✓ a row the list scrolled away is SKIPPED by name, never sampled');\nconsole.log('  ✓ the wrapper record is SKIPPED (declared): no card');\nconsole.log('  ✓ a depth-1 read degrades to a named SKIP (the census)');\nconsole.log('ALL PASS (4)');\n");
  const row = (name) => ({ name, tier: 'fast', budgetMs: 8000 });
  const SHA = '5c1b4829a0000000';
  const drive = async (M, tag, names = ['test-sk-mid', 'test-sk-err', 'test-sk-flaky', 'test-sk-green']) => {
    const failDir = path.join(root, `fail-${tag}`), said = [], rows = [], inflight = new Set();
    fs.rmSync(once, { force: true });
    const res = await M.runFastLanes({ parallel: names.map(row), serial: [] }, {
      lanes: 1, keepGoing: true, inflight, failDir, sha: SHA, log: (l) => said.push(l), refusal: (s) => (s.name === 'test-sk-flaky' ? '' : 'no retry here (§8f\'s)'),
      run: (s, { lane }) => M.runSuiteAsync(s, { root, sha: SHA, lane, inflight }),
      after: async (r) => { rows.push(r.lines.join('\n')); },
    });
    return { ...res, failDir, said, rows, fails: fs.existsSync(failDir) ? fs.readdirSync(failDir).sort() : [] };
  };
  const rowOf = (x, n) => (x.rows.filter((l) => l.includes(`✓ ${n} (`)).pop() || '').trim();
  const a = await drive(ci, 'now');
  ok(/ — ALL PASS \(2\) · SKIP 2: the real road — no sshd on this machine$/.test(rowOf(a, 'test-sk-mid')),
    `a SKIP said in the MIDDLE of a green suite's output is on its ✓ row: «… — ALL PASS (2) · SKIP 2: first reason» (${rowOf(a, 'test-sk-mid')})`);
  const errOk = / — ALL PASS \(0\) · SKIP 2: corpus smoke SKIPPED: no rollouts on this machine$/.test(rowOf(a, 'test-sk-err')) && / — ALL PASS \(4\)$/.test(rowOf(a, 'test-sk-green'));
  ok(errOk, `…and a leg «SKIPPED» with its reason after a colon counts, and so does a SKIP said on stderr; a green whose lines carry SKIP only inside a word or a sentence keeps its plain row${errOk ? '' : ` (${rowOf(a, 'test-sk-err')} | ${rowOf(a, 'test-sk-green')})`}`);
  ok(a.flaky.join(',') === 'test-sk-flaky' && / — ALL PASS \(1\) · SKIP 1: the retry leg — no dtach here$/.test(rowOf(a, 'test-sk-flaky')),
    `…and a suite green on its RETRY is judged by the retry's output (${rowOf(a, 'test-sk-flaky')})`);
  ok(a.skippedLegs.map((x) => `${x.name}:${x.n}`).join(',') === 'test-sk-mid:2,test-sk-err:2,test-sk-flaky:1' && !a.reds.length && a.timings.length === 4,
    `runFastLanes NAMES every green that skipped a leg, with its count (${a.skippedLegs.map((x) => `${x.name} (${x.n})`).join(', ')}) — still green (4 timings, no red), never folded into the plain greens`);
  const midLog = path.join(a.failDir, '5c1b4829.test-sk-mid.skip.1.log'), errLog = path.join(a.failDir, '5c1b4829.test-sk-err.skip.1.log');
  ok(a.fails.join(',') === '5c1b4829.test-sk-err.skip.1.log,5c1b4829.test-sk-flaky.1.log,5c1b4829.test-sk-flaky.skip.2.log,5c1b4829.test-sk-mid.skip.1.log'
    && fs.readFileSync(midLog, 'utf-8').includes('  ✓ leg one\n  ⊘ SKIP the real road') && fs.readFileSync(errLog, 'utf-8').includes('── stderr ──\nSKIP: no chrome binary')
    && a.said.includes(`  [ci] test-sk-mid skipped 2 leg(s) — its whole output (try 1): ${midLog}`) && a.skippedLegs[0].file === midLog,
    `…and keeps each one's WHOLE output beside the red tries' (<sha8>.<suite>.skip.<try>.log — the retry's by its try: ${a.fails.join(', ')}), said on its own line; the plain green keeps none`);
  // the closing lines' words, both tiers (one door each: skipCount on the verdict line, skippedLegsSaid after it)
  ok(ci.skipCount(a.skippedLegs) === ' · SKIP 5 leg(s) in 3 suite(s): test-sk-mid (2), test-sk-err (2), test-sk-flaky (1)' && ci.skipCount([]) === ''
    && ci.skippedLegsSaid('ci:heavy', a.skippedLegs)[0] === `[ci:heavy] SKIPPED LEG(S) test-sk-mid (2): the real road — no sshd on this machine — its whole output: ${midLog}`,
    `the closing line carries the count BY SUITE («${ci.skipCount(a.skippedLegs).trim()}»), and one line per suite names its first reason and its kept output`);
  // a skip log is bounded with its commit's other files (pruneFailLogs reads «<suite>.skip» as the suite part)
  {
    const pd = mktmp('skipprune'), T0 = Date.now() / 1000 - 3600, K = ci.FAIL_LOGS_KEEP;
    for (let i = 0; i <= K; i++) { const n = path.join(pd, `${(0xb0000000 + i).toString(16)}.test-sk.skip.1.log`); fs.writeFileSync(n, 'x'); fs.utimesSync(n, T0 + i * 10, T0 + i * 10); }
    const gone = ci.pruneFailLogs(pd).map((f) => path.basename(f));
    ok(gone.join(',') === 'b0000000.test-sk.skip.1.log' && fs.readdirSync(pd).length === K, `a skip log is BOUNDED like a red's: ${K + 1} commits ⇒ the oldest one's file goes (${gone.join(', ')})`);
  }
  // THE TREE'S SHAPES (a walk, never a hand list): every printed literal in scripts/ that says SKIP / SKIPPED as a word —
  // (i) one whose first word (after at most one token with no letter in it: a bullet, «§3», «④») is SKIP is COUNTED by the
  // launcher; (ii) one the launcher does not count is a sentence ABOUT a skip and its file's row in
  // scripts/fixtures/skip-sentences.json holds it (ONE-WAY: a file that adds one is red by name, a fall is said);
  // (iii) a lowercase «— skipping …» line is the old shape of a skip: none may stay uncounted
  {
    const g = spawnSync('git', ['-c', 'grep.threads=2', 'grep', '-n', '-F', '-i', 'skip', '--', 'scripts/*.mjs'], { cwd: REPO, encoding: 'utf-8', env: GIT_ENV, maxBuffer: 64 << 20 });
    if (g.status !== 0) console.log(`  · SKIP the tree's SKIP shapes: git could not list this tree (${String(g.stderr || g.error || '').trim().slice(0, 120)})`);
    else {
      const WORD = /(?<![\w-])SKIP(?:PED)?(?![\w-])/, LOWER = /(?:^\s*\(?|[—–]\s*)skipping\b/, LIT = /([`'"])((?:\\.|(?!\1).)*)\1/g;
      const firstWord = (x) => { const t = x.trim().split(/\s+/); const i = t.length > 1 && !/[A-Za-z]/.test(t[0]) ? 1 : 0; return /^SKIP(?:PED)?(?![\w-])/.test(t[i] || ''); };
      const own = new Set(['scripts/ci.mjs', 'scripts/test-ci-gate-tiers.mjs']); // the rule's own file and this leg's planted near-misses
      let lead = 0, counted = 0; const missed = [], lower = [], sentences = {}, sentenceAt = {};
      for (const l of g.stdout.split('\n')) {
        const m1 = /^([^:]+):(\d+):(.*)$/.exec(l);
        if (!m1 || own.has(m1[1])) continue;
        for (const m of m1[3].matchAll(LIT)) {
          const okMsg = /\bok\w*\(\s*[^,]{0,40},\s*$/.test(m1[3].slice(0, m.index));
          const all = m[2].replace(/\$\{[^}]*\}/g, 'x').split('\\n').map((x, i) => (okMsg && !i ? '  ✓ ' : '') + x);
          for (const x of all) if (LOWER.test(x) && !ci.isSkipLine(x)) lower.push(`${m1[1]} line ${m1[2]} «${x.trim().slice(0, 70)}»`);
          const printed = all.filter((x) => WORD.test(x));
          if (!printed.length) continue;
          const heads = printed.filter(firstWord);
          if (heads.length) { lead++; for (const x of heads) if (!ci.isSkipLine(x)) missed.push(`${m1[1]} line ${m1[2]} «${x.trim().slice(0, 70)}»`); }
          if (printed.some((x) => ci.isSkipLine(x))) counted++;
          else { sentences[m1[1]] = (sentences[m1[1]] || 0) + 1; (sentenceAt[m1[1]] ||= []).push(`line ${m1[2]} «${printed[0].trim().slice(0, 70)}»`); }
        }
      }
      let FIX = {}; try { FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'skip-sentences.json'), 'utf-8')).files || {}; } catch (e) { FIX = { '(unreadable)': e.message }; }
      const over = Object.entries(sentences).filter(([f, n]) => n > (FIX[f] || 0)).map(([f, n]) => `${f}: ${n} (its row ${FIX[f] || 0}) — ${sentenceAt[f].join('; ')}`);
      const fell = Object.entries(FIX).filter(([f, n]) => (sentences[f] || 0) < n).map(([f, n]) => `${f} ${n}→${sentences[f] || 0}`);
      const total = Object.values(sentences).reduce((x, y) => x + y, 0);
      console.log(`    the tree prints ${counted} SKIP literal(s) the launcher counts (${lead} with SKIP as the first word); ${total} sentence(s) about a skip in ${Object.keys(sentences).length} file(s)${fell.length ? `; FELL (only said — lower the rows): ${fell.join(', ')}` : ''}`);
      ok(lead >= 300 && !missed.length, `every SKIP line the tree's suites print is COUNTED by the launcher's rule (${lead} with SKIP first, by a walk of scripts/)${missed.length ? ` — NOT COUNTED: ${missed.slice(0, 12).join(' | ')}` : ''}`);
      ok(!over.length && typeof FIX['scripts/test-architecture.mjs'] === 'number', `…every literal it does NOT count is a sentence ABOUT a skip, held by its file's row of scripts/fixtures/skip-sentences.json — a new one is red by name (lead a skip with SKIP, or put its reason after «SKIPPED» and a colon)${over.length ? ` — NEW: ${over.join(' | ')} — live ${JSON.stringify(sentences)}` : ''}`);
      ok(!lower.length, `…and no lowercase «— skipping …» line is left uncounted (a skip says «· SKIP <leg>: <why>»)${lower.length ? ` — ${lower.slice(0, 12).join(' | ')}` : ''}`);
    }
  }
  // the CONTROL: ci.mjs with today's last-line rule — the mid-output SKIP vanishes from the row, nothing is named or kept
  const M = mutantCopies('ci-skiplegs', REPO);
  const src = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  let mutSrc = null, gone = '';
  try {
    mutSrc = anchored(src, /      if \(status === 0\) \{\n        const sk = skipsOf\(stdout, stderr\);[^\n]*\n[^\n]*\n        return;\n      \}\n/,
      () => "      if (status === 0) { resolve({ ok: true, ms, load, selfSkip, lines: [`  ✓ ${s.name} (${ms}ms) ${tag} ${ld} — ${(last || 'ok').slice(0, 80)}`] }); return; }\n", 'the green row (B-4829)');   // the release's last-line rule (2.369.410: B-479e's selfSkip beside it)
  } catch (e) { gone = e.message; }
  const mut = mutSrc ? await import(pathToFileURL(M.write('scripts/ci.mjs', mutSrc, 'last-line-rule', { esm: true })).href) : null;
  const b = mut ? await drive(mut, 'mut', ['test-sk-mid']) : null; // the control judges the mid-output skipper alone (one child, not five)
  ok(!!b && !rowOf(b, 'test-sk-mid').includes('SKIP') && / — ALL PASS \(2\)$/.test(rowOf(b, 'test-sk-mid')) && !b.skippedLegs.length && !b.fails.some((f) => f.includes('.skip.')),
    `CONTROL: a copy of ci.mjs on today's last-line rule prints the mid-output skipper as a plain green (${b ? rowOf(b, 'test-sk-mid') : gone}) and names and keeps nothing — the legs above are red without the change`);
  // WIRING: both tiers' closing lines carry the count; the heavy tier records every green that skipped (try 1 or the retry)
  // (the fast closing's two skip lines live in fastClosing since the keep-going cure moved onto 2.369.411 — read by behaviour:
  // a planted green with a skipped leg prints its SKIPPED LEG(S) line and no exit code; a planted red carries the count)
  const skSaid = ci.fastClosing({ skippedLegs: [{ name: 'test-sk-mid', n: 2, first: 'the real road', file: '' }], env: {} });
  const skRed = ci.fastClosing({ reds: ['test-sk-red'], skippedLegs: [{ name: 'test-sk-mid', n: 2, first: 'the real road', file: '' }], env: {} });
  ok(/ suites ran; \$\{absent\.length\} not present at that commit` : ''\}\$\{skipCount\(skippedLegs\)\}`\);/.test(src)
    && skSaid.code === null && skSaid.out.some(([w, l]) => w === 'log' && l === '\n[ci] SKIPPED LEG(S) test-sk-mid (2): the real road')
    && skRed.code === 1 && skRed.out.some(([w, l]) => w === 'err' && l === '\n✗ test-sk-red — release gate is RED, do not push · SKIP 2 leg(s) in 1 suite(s): test-sk-mid (2)\n')
    && /release gate is RED, do not push\$\{skipCount\(skippedLegs\)\}/.test(src)
    && /failed: \$\{failed\.join\(', '\)\}\$\{skipCount\(skippedLegs\)\}`/.test(src) && /not present at that commit` : ''\}\)\$\{skipCount\(skippedLegs\)\}`;/.test(src)
    && /if \(r\.ok && r\.skips\) skippedLegs\.push\(\{ name: s\.name, n: r\.skips\.n, first: r\.skips\.first, file: keepSkipLog\(s, r, tried\) \}\);/.test(src)
    && /r = again; tried = 2;/.test(src) && /for \(const l of skippedLegsSaid\('ci:heavy', skippedLegs\)\) console\.log\(l\);/.test(src) && /skippedLegs: skippedLegs\.length \?/.test(src),
    'WIRING: ALL GREEN, the fast RED line and the heavy GREEN / RED lines end with the count, a line per skipping suite follows, the heavy loop keeps the try that stood, the heavy marker carries skippedLegs');
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
