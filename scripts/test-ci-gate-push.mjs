#!/usr/bin/env node
// test-ci-gate-push — a PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what the gate guards and why).
// lane fast-tier-ratchet (2026-10-20) split the one 37 s process into seven ≤ 10 s suites, every section's text unchanged;
// the shared kit is scripts/ci-gate-kit.mjs. This part: §3 the block rule over real commits · §4 the pre-push hook's control flow end to end · §5 the git environment the detached child must NOT inherit.
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
import { REPO, GIT_ENV, ok, tmpDirs, mktmp, git, makeRepo, commit, STUB_SLICE, stubGateRepo, writeMarker, hookRig, report } from './ci-gate-kit.mjs'; // the shared kit (lane fast-tier-ratchet: the gate is seven ≤ 10 s parts)

// THE HEAVY TWIN (B-e381 r6 — 主开发 r1063: each gate row states what it reads ALONE and stands under 10 s; this one read ~15.9 s
// alone on the test machine — §4's ~35 runs of the real hook at ~0.3 s each — its deepest legs going to a heavy twin as the
// consent-road suite did): §4's round 5 (a) (the gate-input docs derived from the table's own suite sources, ~1.6 s), round 5 (b)
// (a gate-input doc push runs the tier, five hook runs, ~1.5 s), round 5 (c) (the commit being pushed is what the tier gates,
// ~0.8 s) and round 6 (one fast subject per push — the multi-ref pushes, ~4 s) run only under CI_GATE_PUSH_DEEP=1, which scripts/test-ci-gate-push-deep.mjs (a HEAVY row) sets before it runs this whole
// file. Each is a block over branches made from SIDE (round 6 reads round 5 (c)'s — both deep; no FAST leg reads what they leave;
// round 4 (d) stays fast: its exclude file and HEAD are read after it); the fast run says, at each place, where it runs.
const DEEP = process.env.CI_GATE_PUSH_DEEP === '1';
const inTwin = (what) => console.log(`    (${what}: in the heavy twin test-ci-gate-push-deep — B-e381 r6)`);

try {

// ── §3 THE BLOCK RULE, OVER REAL COMMITS ─────────────────────────────────
console.log('\n§3 the block rule (real git history)');
{
  const repo = makeRepo('block');
  const A = commit(repo, 'src/a.js', '//a\n', 'A');
  const B = commit(repo, 'src/b.js', '//b\n', 'B');
  const C = commit(repo, 'src/c.js', '//c\n', 'C');
  git(repo, ['checkout', '-q', '-b', 'side', A]);
  const S = commit(repo, 'src/s.js', '//s\n', 'S on a side branch');
  git(repo, ['checkout', '-q', 'main']);
  const at = (head, ...markers) => {
    const dir = mktmp('markers');
    for (const [sha, res, failed, partial, flaky] of markers) writeMarker(dir, sha, res, failed || [], partial, flaky);
    return heavyBlocker({ dir, head, repoRoot: repo });
  };
  ok(at(C, [A, 'red', ['test-client-boot']])?.sha === A, 'a RED on an ancestor of HEAD blocks');
  ok(at(A, [A, 'red', ['test-client-boot']])?.sha === A, 'a RED on HEAD itself blocks');
  ok(at(C, [A, 'red'], [B, 'green']) === null, 'a GREEN on a later commit clears the earlier red');
  ok(at(C, [B, 'red'], [A, 'green']) === null || at(C, [B, 'red'], [A, 'green']).sha === B, 'an EARLIER green does not clear a later red');
  ok(at(C, [B, 'red'], [A, 'green'])?.sha === B, '…and the later red still blocks');
  ok(at(C, [S, 'red']) === null, 'a RED on a divergent branch does not block this history');
  ok(at(C, ['deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'red']) === null, 'a RED for a commit this repo does not know is ignored (amended/rebased away)');
  ok(at(C, [A, 'green'], [B, 'green']) === null, 'greens alone never block');
  // A `--only=` re-run proves one suite, not the tier. If a partial green
  // could clear a block, re-running the suite you just fixed would unlock a
  // commit the rest of the tier never saw.
  ok(at(C, [A, 'red', ['boom']], [B, 'green', [], ['test-attach-ack']])?.sha === A,
    'a PARTIAL green does not clear a red (it is not evidence the tier passed)');
  ok(at(C, [A, 'red', ['boom'], ['test-attach-ack']])?.sha === A, 'a PARTIAL red still blocks (a suite really did fail there)');
  // FLAKY is a full green with a note: a suite that failed and passed on the
  // retry did not fail the tier, so the marker clears the block; the note
  // rides along so nobody has to pretend it never failed.
  ok(at(C, [A, 'red', ['boom']], [B, 'green', [], undefined, ['test-desktop-drop']]) === null,
    'a green that records FLAKY suites still clears the block (it is a full run)');
  ok(at(C, [A, 'red', ['x']]).failed.join() === 'x', 'the blocker carries the failing suite names for the message');
  // The clearing green must be on OUR history too: a green on a side branch
  // that descends from nothing we are pushing must not unlock anything.
  const sideGreenRepo = mktmp('markers');
  writeMarker(sideGreenRepo, A, 'red', ['boom']);
  writeMarker(sideGreenRepo, S, 'green');
  ok(heavyBlocker({ dir: sideGreenRepo, head: C, repoRoot: repo })?.sha === A,
    'a green on a DIVERGENT descendant does not clear a red on this branch');
}

// ── §4 THE HOOK'S CONTROL FLOW, END TO END ───────────────────────────────
// The REAL tracked scripts/git-hooks/pre-push, driven with real pre-push
// stdin, in a throwaway repo whose scripts/ci.mjs is a RECORDING stub that
// delegates the verdict to the REAL heavyBlocker. What is under test is the
// hook's control flow — the order of its steps, what it refuses, what it
// launches — so the fast tier is the only thing stubbed.
console.log('\n§4 the pre-push hook, end to end');
{
  const { repo, ZERO, runHookRefs, runHook, hookSrc, preFixHook } = hookRig('hook');   // the kit's rig (moved there — B-e381 r6: test-ci-gate-hook-env drives it too)
  // The docs-only block, verbatim, so the "it used to exit before asking"
  // control can put it back where it was instead of approximating it.
  const DOCS_ONLY_BLOCK = 'if [ "$only_docs" = "1" ] && [ "${#REFS[@]}" -gt 0 ]; then\n  echo "[ci] docs-only push — fast tier skipped" >&2\n  exit 0\nfi\n';
  const HEAVY_FIRST_ANCHOR = '# ── HEAVY-TIER VERDICT FIRST (2026-09-07) ─';

  const A = commit(repo, 'src/a.js', '//a\n', 'A');
  const r1 = runHook(A);
  ok(r1.status === 0, 'fast tier green ⇒ the push proceeds');
  // B-6e71: EVERY fast call the hook makes runs the WHOLE tier and names every red at its end (`--keep-going`) — a first
  // red no longer hides the ones behind it; the verdict is unchanged (any red is exit 1 = GATE RED; the marker is written by
  // an all-green whole in-place run only — test-ci-gate-tiers §8e). The three calls: a push of HEAD (in place), a pushed tip
  // that is not HEAD (--isolate, its leg below), and a push that names no sha at all (the fallback).
  const fastOf = (r) => r.calls.filter((c) => c.mode === 'fast');
  ok(fastOf(r1).length === 1 && fastOf(r1)[0].keepGoing === true && !fastOf(r1)[0].isolate,
    'B-6e71: the fast call for a push of HEAD runs in place WITH --keep-going (every red named)', r1.calls);
  const rNone = runHookRefs('');
  ok(rNone.status === 0 && fastOf(rNone).length === 1 && fastOf(rNone)[0].keepGoing === true && !fastOf(rNone)[0].isolate && !fastOf(rNone)[0].sha,
    'B-6e71: a push whose stdin names no sha gates the tree it has (the fallback) — WITH --keep-going', { status: rNone.status, calls: rNone.calls });
  fs.writeFileSync(path.join(repo, 'FAST_RED'), 'red\n');
  const rRed = runHook(A);
  try { fs.unlinkSync(path.join(repo, 'FAST_RED')); } catch { }
  ok(rRed.status === 1 && /GATE RED — push blocked/.test(rRed.out) && fastOf(rRed).length === 1 && fastOf(rRed)[0].keepGoing === true,
    'B-6e71: a red under --keep-going still BLOCKS the push (exit 1, «GATE RED — push blocked») — the mode lists reds, it never passes one', { status: rRed.status });
  // the STATIC census: every line of the hook that CALLS scripts/ci.mjs (anywhere on a non-comment line — `if node …`, `x=$(node …)`
  // too) without a heavy verb is a FAST call and carries the flag (`$kg`) in its command, before its `||` — a fourth call added
  // tomorrow without it is red by name; the control drops the flag from one call
  const fastCallsOf = (src) => src.split('\n').filter((l) => !/^\s*#/.test(l) && /\bnode scripts\/ci\.mjs\b/.test(l) && !/--(check-heavy|heavy-launch|heavy)\b/.test(l.split('||')[0]));
  const bare = (src) => fastCallsOf(src).filter((l) => !/ \$kg\b/.test(l.split('||')[0]));
  ok(fastCallsOf(hookSrc).length === 3 && bare(hookSrc).length === 0 && /\n {2}if grep -qF "'keep-going'" scripts\/ci\.mjs 2>\/dev\/null; then kg="--keep-going"\n/.test(hookSrc),
    `B-6e71 census: the hook's fast calls are ${fastCallsOf(hookSrc).length}, each carries the flag ($kg — set when this checkout's ci.mjs knows it)`, bare(hookSrc));
  const dropped = hookSrc.replace('node scripts/ci.mjs --isolate $kg --sha="$sha"', 'node scripts/ci.mjs --isolate --sha="$sha"');
  ok(dropped !== hookSrc && bare(dropped).length === 1 && /--isolate --sha=/.test(bare(dropped)[0]),
    'B-6e71 census CONTROL: the hook with the flag dropped from its isolated call is refused, naming that line');
  // AN OLDER CHECKOUT (the installed hook is shared by every worktree): its ci.mjs does not know the flag — the hook passes none
  // (a refused flag would be exit 2, a false GATE RED) and says the tier stops at its first red
  const stubPath = path.join(repo, 'scripts', 'ci.mjs'), stubSrc = fs.readFileSync(stubPath, 'utf8');
  fs.writeFileSync(stubPath, stubSrc.replace("const KNOWN = ['keep-going'];", 'const KNOWN = [];'));
  const rOld = runHook(A);
  fs.writeFileSync(stubPath, stubSrc);
  ok(stubSrc.includes("const KNOWN = ['keep-going'];") && rOld.status === 0 && fastOf(rOld).length === 1 && fastOf(rOld)[0].keepGoing === false && /has no --keep-going \(an older tree\) — its fast tier stops at the first red/.test(rOld.out),
    'B-6e71: a checkout whose ci.mjs predates the flag runs the fast tier WITHOUT it (no false GATE RED) and says so', { status: rOld.status, calls: rOld.calls });
  ok(r1.calls.map((c) => c.mode).join(',') === 'check-heavy,fast,heavy-launch',
    `the hook checks the heavy verdict FIRST, then runs fast, then launches heavy (got: ${r1.calls.map((c) => c.mode).join(',')})`);
  ok(r1.calls.find((c) => c.mode === 'heavy-launch')?.sha === A, 'the heavy run is launched for the sha being PUSHED');
  ok(r1.calls.find((c) => c.mode === 'heavy-launch')?.range === A,
    `…with the range it publishes — a NEW branch with NO remote-tracking ref to anchor on hands the lone sha (its whole unpublished range) (got ${JSON.stringify(r1.calls.find((c) => c.mode === 'heavy-launch')?.range)})`);

  // …the background heavy run comes back RED for A.
  writeMarker(path.join(repo, 'data', 'ci-heavy'), A, 'red', ['test-client-boot', 'test-fold-ux']);
  const B = commit(repo, 'src/b.js', '//b\n', 'B (built on the red commit)');
  const r2 = runHook(B, A);
  ok(r2.status === 1, 'a RED heavy result on an ancestor BLOCKS the next push');
  ok(/test-client-boot/.test(r2.out) && /test-fold-ux/.test(r2.out), 'the refusal names the failing suites');
  ok(r2.calls.map((c) => c.mode).join(',') === 'check-heavy',
    'and it refuses BEFORE spending the fast tier (no fast run, no launch)');

  // …a green heavy run on the newer commit clears it.
  writeMarker(path.join(repo, 'data', 'ci-heavy'), B, 'green');
  const r3 = runHook(B, A);
  ok(r3.status === 0, 'a GREEN heavy run on a newer commit unblocks the push');
  ok(r3.calls.map((c) => c.mode).join(',') === 'check-heavy,fast,heavy-launch', 'and the full flow runs again');
  ok(r3.calls.find((c) => c.mode === 'heavy-launch')?.range === `${A}..${B}`,
    `…and an existing ref hands \`<remote>..<local>\` as the impact range (got ${JSON.stringify(r3.calls.find((c) => c.mode === 'heavy-launch')?.range)})`);

  // A red fast tier must block AND must not launch anything.
  fs.writeFileSync(path.join(repo, 'FAST_RED'), '1');
  const C = commit(repo, 'src/c.js', '//c\n', 'C');
  writeMarker(path.join(repo, 'data', 'ci-heavy'), C, 'green'); // keep §4's older red cleared
  const r4 = runHook(C, B);
  ok(r4.status === 1, 'a RED fast tier blocks the push');
  ok(!r4.calls.some((c) => c.mode === 'heavy-launch'), 'a RED fast tier launches NO heavy run (nothing is being pushed)');
  fs.unlinkSync(path.join(repo, 'FAST_RED'));

  // The two documented escape hatches still behave.
  const D = commit(repo, 'docs/x.md', '# x\n', 'docs only');
  const r5 = runHook(D, C);
  ok(r5.status === 0 && !r5.calls.some((c) => c.mode === 'fast') && !r5.calls.some((c) => c.mode === 'heavy-launch'),
    'a docs-only push skips the fast tier (and launches nothing new to test)');
  ok(r5.calls.some((c) => c.mode === 'check-heavy' && c.head === D),
    '…but the heavy VERDICT is still asked about it (round 4: a red ancestor is red whether or not this push carries code)');
  const E = commit(repo, 'src/e.js', '//e\n', 'E');
  writeMarker(path.join(repo, 'data', 'ci-heavy'), E, 'red', ['boom']);
  const r6 = runHook(E, D, { VIBESPACE_SKIP_CI: '1' });
  ok(r6.status === 0 && !r6.calls.length, 'VIBESPACE_SKIP_CI=1 bypasses even a blocking red');

  // ── THE VERDICT IS ABOUT THE REFS BEING PUSHED (2026-09-07 round 2) ────
  // Reproduced before the fix: the hook asked `--check-heavy` with no --head,
  // so the answer was about the CHECKED-OUT commit. `git push origin main`
  // from a different branch therefore shipped a commit riding on a heavy-red
  // ancestor with no block and no message.
  // E's red belonged to the bypass leg above; leave it there and this leg is
  // asking about two reds at once.
  try { fs.unlinkSync(path.join(repo, 'data', 'ci-heavy', `${E}.red`)); } catch {}
  git(repo, ['checkout', '-q', '-b', 'shipping', E]);
  const R = commit(repo, 'src/r.js', '//r\n', 'R — the commit that will go red');
  const RIDER = commit(repo, 'src/rider.js', '//rider\n', 'RIDER — rides on the red, and is what we push');
  git(repo, ['checkout', '-q', '-b', 'elsewhere', E]);
  const SIDE = commit(repo, 'src/side.js', '//side\n', 'the branch we are STANDING on — unrelated to the red');
  writeMarker(path.join(repo, 'data', 'ci-heavy'), R, 'red', ['test-fold-ux']);
  // Non-vacuity, stated as the two answers the fix is choosing between.
  ok(heavyBlocker({ dir: path.join(repo, 'data', 'ci-heavy'), head: SIDE, repoRoot: repo }) === null,
    'the checked-out branch is NOT blocked (this is what the hook used to ask about)');
  ok(heavyBlocker({ dir: path.join(repo, 'data', 'ci-heavy'), head: RIDER, repoRoot: repo })?.sha === R,
    '…while the ref being pushed IS blocked (this is what it must ask about)');
  const r7 = runHookRefs(`refs/heads/shipping ${RIDER} refs/heads/shipping ${R}\n`);
  ok(r7.status === 1, 'pushing a ref whose tip is NOT HEAD is blocked by a red in THAT ref\'s history');
  ok(r7.calls.every((c) => c.mode !== 'fast'), '…and refused before the fast tier, like every other block');
  ok(r7.calls.some((c) => c.mode === 'check-heavy' && c.head === RIDER), `…because the hook asked about the pushed sha (${(r7.calls[0] || {}).head || 'HEAD'})`);
  // Every pushed ref is asked about, not just the first.
  git(repo, ['branch', '-f', 'clean-branch', SIDE]);
  const r8 = runHookRefs(`refs/heads/clean-branch ${SIDE} refs/heads/clean-branch ${ZERO}\nrefs/heads/shipping ${RIDER} refs/heads/shipping ${R}\n`);
  ok(r8.status === 1 && r8.calls.filter((c) => c.mode === 'check-heavy').length >= 2,
    'a multi-ref push asks about EVERY ref (a clean one first does not excuse the red one)');

  // ── ROUND 4 (a): A DOCS-ONLY PUSH IS STILL SUBJECT TO A RED ANCESTOR ───
  // The docs-only skip used to be the hook's FIRST decision, so a red heavy
  // verdict on an ancestor was never even asked about. The block exists to
  // stop more work being stacked on a known-broken commit, and a docs commit
  // is more work.
  {
    git(repo, ['checkout', '-q', '-b', 'docsred', SIDE]);
    const DR = commit(repo, 'src/dr.js', '//code that will go red\n', 'DR');
    const DRDOCS = commit(repo, 'docs/dr.md', '# notes\n', 'docs on top of the red commit');
    writeMarker(path.join(repo, 'data', 'ci-heavy'), DR, 'red', ['test-fold-ux']);
    const r9 = runHookRefs(`refs/heads/docsred ${DRDOCS} refs/heads/docsred ${DR}\n`);
    ok(r9.status === 1 && /PUSH BLOCKED/.test(r9.out),
      'a DOCS-ONLY push riding on a heavy-red ancestor is blocked (the verdict is asked before the docs-only exit)');
    ok(!r9.calls.some((c) => c.mode === 'fast'), '…and still without spending the fast tier');
    // The control is the hook with the docs-only exit MOVED BACK above the
    // verdict — the literal pre-round-4 file, not an approximation of it.
    const preSkip = preFixHook('docsfirst',
      [DOCS_ONLY_BLOCK, ''],
      [HEAVY_FIRST_ANCHOR, DOCS_ONLY_BLOCK + '\n' + HEAVY_FIRST_ANCHOR]);
    if (preSkip) {
      const r9n = runHookRefs(`refs/heads/docsred ${DRDOCS} refs/heads/docsred ${DR}\n`, {}, preSkip);
      ok(r9n.status === 0 && !r9n.calls.length,
        'NEG: a hook that exits on docs-only BEFORE asking ships the same commit on top of the same red, silently');
    }
    try { fs.unlinkSync(path.join(repo, 'data', 'ci-heavy', `${DR}.red`)); } catch {}
  }

  // ── ROUND 4 (b): A NEW BRANCH PUBLISHES ITS WHOLE RANGE ────────────────
  // `remote_sha` is zeros for a new branch and the hook inspected only the TIP
  // commit, so [code commit][docs commit] pushed as a new branch printed
  // "docs-only push — gate skipped" with ZERO gate calls. This branch's own
  // history has that shape.
  {
    // A remote-tracking ref, so "the range being published" is really the two
    // new commits and not the whole history — otherwise this leg would pass
    // for the wrong reason (any repo without remotes lists everything).
    git(repo, ['update-ref', 'refs/remotes/origin/main', SIDE]);
    git(repo, ['checkout', '-q', '-b', 'newbranch', SIDE]);
    commit(repo, 'src/nb.js', '//code — the commit the tip-only look could not see\n', 'NB code');
    const NBTIP = commit(repo, 'docs/nb.md', '# docs\n', 'NB docs (the tip)');
    const published = git(repo, ['log', '--name-only', '--format=', NBTIP, '--not', '--remotes']).split('\n').filter(Boolean).sort();
    ok(published.join(',') === 'docs/nb.md,src/nb.js',
      `the published range is exactly the two new commits' paths (${published.join(', ') || 'EMPTY'}) — not the whole history, and not just the tip`);
    const refs = `refs/heads/newbranch ${NBTIP} refs/heads/newbranch ${ZERO}\n`;
    const r10 = runHookRefs(refs);
    ok(r10.calls.some((c) => c.mode === 'fast'),
      'a NEW BRANCH whose TIP is docs but whose RANGE carries code runs the fast tier');
    ok(r10.status === 0 && r10.calls.some((c) => c.mode === 'heavy-launch'), '…and its heavy run is launched');
    const preTip = preFixHook('tiponly',
      ['range_cmd=(git log --name-only --format= "$local_sha" --not --remotes)',
        'range_cmd=(git show --name-only --format= "$local_sha")']);
    if (preTip) {
      const r10n = runHookRefs(refs, {}, preTip);
      ok(!r10n.calls.some((c) => c.mode === 'fast') && /docs-only/.test(r10n.out),
        'NEG: the tip-only approximation calls exactly that push docs-only and runs nothing');
    }

    // ── ROUND 4 (c): "WE COULD NOT TELL" IS NOT "NOTHING CHANGED" ────────
    // An unresolvable range (a remote sha this checkout never fetched) makes
    // git exit non-zero with an EMPTY list, which the pre-fix hook read as
    // "no code path changed".
    const UNFETCHED = 'f'.repeat(39) + '1';
    const badRefs = `refs/heads/newbranch ${NBTIP} refs/heads/newbranch ${UNFETCHED}\n`;
    ok(spawnSync('git', ['-C', repo, 'diff', '--name-only', `${UNFETCHED}..${NBTIP}`], { encoding: 'utf-8', env: GIT_ENV }).status !== 0,
      'the unfetched-remote-sha range really does fail (the leg below is non-vacuous)');
    // bl-ci 2026-11-19 (the test kit's scan check): the REAL scanner, copied into this fixture, refuses a range whose base is not a
    // commit here — exit 2 by name — so the push is BLOCKED at the secret scan, before any tier and before any docs-only verdict
    const r11 = runHookRefs(badRefs);
    ok(r11.status !== 0 && /the secret scan could not read what \S+ publishes \(exit 2\)/.test(r11.out) && /the range's base f{39}1 is not a commit in this repository/.test(r11.out)
      && !r11.calls.some((c) => c.mode === 'fast') && !/docs-only push/.test(r11.out),   // («NOT treating it as docs-only» is the path listing's own line)
      'a range git CANNOT read is REFUSED at the secret scan (exit 2, named) — the push is blocked before any tier, never docs-only', r11.out);
    // THE PATH LISTING'S OWN GUARD, judged with the scanner stood in as clean — the scan's refusal above must not mask it
    const SCANNER = path.join(repo, 'scripts', 'secret-scan.mjs'), realScanner = fs.readFileSync(SCANNER);
    fs.writeFileSync(SCANNER, 'process.exit(0);\n');
    try {
      const r11b = runHookRefs(badRefs);
      ok(r11b.calls.some((c) => c.mode === 'fast'), 'a range git CANNOT read is never treated as docs-only (the scanner stood in as clean)');
      ok(/could not list the paths/.test(r11b.out), '…and it says so out loud (§no-silent-failures), naming the command and git\'s own message');
      const preQuiet = preFixHook('quietfail', ['  if [ "$rc" != "0" ]; then', '  if false; then']);
      if (preQuiet) {
        const r11n = runHookRefs(badRefs, {}, preQuiet);
        ok(!r11n.calls.some((c) => c.mode === 'fast') && /docs-only/.test(r11n.out),
          'NEG: without the exit-status check the same push is "docs-only", silently');
      }
    } finally { fs.writeFileSync(SCANNER, realScanner); }
  }

  // ── ROUND 4 (d): THE .git/ci-green SHORTCUT IS ABOUT THE PUSHED REFS ───
  // Keyed to HEAD alone, `git push origin <other-branch>` skipped the WHOLE
  // fast tier for a never-gated commit — and said "fast gate already GREEN on
  // this exact tree" while doing it. Today NO test drives the marker branch at
  // all, which is how it survived round 2 (which fixed exactly this defect for
  // `--check-heavy --head`).
  {
    // The shortcut also requires a CLEAN tree, so git is told to ignore the
    // files this fixture itself writes into the throwaway checkout.
    fs.writeFileSync(path.join(repo, '.git', 'info', 'exclude'),
      ['calls.ndjson', 'FAST_RED', 'scripts/', 'data/', 'pre-push', 'pre-push.prefix-*', ''].join('\n'));
    git(repo, ['checkout', '-q', '-b', 'marked', SIDE]);
    const G = commit(repo, 'src/g.js', '//gated\n', 'G — the commit the green marker names');
    git(repo, ['checkout', '-q', '-b', 'ungated', G]);
    const F = commit(repo, 'src/broken.js', '//never gated by anything\n', 'F — pushed from another branch');
    git(repo, ['checkout', '-q', 'marked']);
    ok(git(repo, ['status', '--porcelain']) === '' && git(repo, ['rev-parse', 'HEAD']) === G,
      'the fixture is in the shape the shortcut needs: clean tree, HEAD = the marker\'s sha');
    fs.writeFileSync(path.join(repo, '.git', 'ci-green'), `${G} ${Date.now()}\n`);

    const r12 = runHookRefs(`refs/heads/marked ${G} refs/heads/marked ${SIDE}\n`);
    ok(r12.status === 0 && /already GREEN/.test(r12.out) && !r12.calls.some((c) => c.mode === 'fast'),
      'a fresh green marker naming EVERY pushed sha skips the in-hook fast run (the marker branch, exercised at last)');
    ok(r12.calls.some((c) => c.mode === 'heavy-launch'), '…and the heavy tier is still launched for it');

    const otherRefs = `refs/heads/ungated ${F} refs/heads/ungated ${ZERO}\n`;
    const r13 = runHookRefs(otherRefs);
    ok(r13.calls.some((c) => c.mode === 'fast'),
      'NEG-by-behaviour: pushing a DIFFERENT branch\'s tip runs the fast tier — the marker says nothing about that commit');
    ok(!/already GREEN/.test(r13.out), '…and never claims the tree it did not gate is already green');
    const preHeadOnly = preFixHook('markerhead', [' && [ "$pushed_all_marked" = "1" ]', '']);
    if (preHeadOnly) {
      const r13n = runHookRefs(otherRefs, {}, preHeadOnly);
      ok(!r13n.calls.some((c) => c.mode === 'fast') && /already GREEN/.test(r13n.out),
        'NEG: keyed to HEAD alone, the same push skips the whole fast tier for a never-gated commit');
    }

    // A marker for a commit nobody is pushing must not unlock anything either.
    fs.writeFileSync(path.join(repo, '.git', 'ci-green'), `${F} ${Date.now()}\n`);
    const r14 = runHookRefs(`refs/heads/marked ${G} refs/heads/marked ${SIDE}\n`);
    ok(r14.calls.some((c) => c.mode === 'fast'), '…and a marker naming some OTHER commit does not skip this push either');
    // U2 L4 (主开发 r5567): A MARKER OF A RUN THAT USED PLACED LINES says so — the shortcut names them by count, never «already GREEN»;
    // a third field of another shape is a marker the hook cannot read (no shortcut)
    fs.writeFileSync(path.join(repo, '.git', 'ci-green'), `${G} ${Date.now()} placed:3:test-zz-a=2,test-zz-b=1\n`);
    const r15 = runHookRefs(`refs/heads/marked ${G} refs/heads/marked ${SIDE}\n`);
    ok(r15.status === 0 && /fast gate PLACED on this exact tree \([0-9a-f]{8}, \d+ min ago\): 3 placed line\(s\) in test-zz-a \(2\), test-zz-b \(1\) — NOT a green/.test(r15.out)
      && !/already GREEN/.test(r15.out) && !r15.calls.some((c) => c.mode === 'fast'),
      'U2 L4: a marker naming PLACED lines skips the in-hook run SAYING them by name and count — never «already GREEN»');
    fs.writeFileSync(path.join(repo, '.git', 'ci-green'), `${G} ${Date.now()} placed-by-hand\n`);
    const r16 = runHookRefs(`refs/heads/marked ${G} refs/heads/marked ${SIDE}\n`);
    ok(r16.calls.some((c) => c.mode === 'fast') && !/already GREEN|fast gate PLACED/.test(r16.out),
      'CONTROL: a third field of another shape is a marker the hook cannot read — no shortcut, the fast tier runs');
    try { fs.unlinkSync(path.join(repo, '.git', 'ci-green')); } catch {}
  }

  // ── ROUND 5 (a): A .md PATH THE GATE READS IS A CODE PATH ─────────────
  // The docs-only classifier said "not code" for `docs/*|*.md`, which is a
  // statement about how a path LOOKS. Several such paths are GATE INPUTS, so
  // a "docs-only" push shipped a tree the gate would have refused — and THIS
  // BRANCH'S OWN TIP (docs/kb-file-structure.md alone) is that shape.
  // The list in the hook is not trusted: it is DERIVED here from the tier
  // table's own suite sources plus src/agent-routes.js's AGENT_DOC_TOPICS, and
  // classified by running the hook's OWN `is_code_path` — no re-spelling of
  // the pattern, so drift in either direction is caught.
  if (!DEEP) inTwin('round 5 (a): the gate-input docs derived from the table\'s own suite sources and classified by the hook\'s own is_code_path'); else {
    const scratch = mktmp('classify');
    /** The `name() { … }` function, verbatim, out of the tracked hook. */
    const hookFn = (name, src) => {
      const start = src.indexOf(`${name}() {`);
      if (start < 0) return null;
      const end = src.indexOf('\n}\n', start);
      return end < 0 ? null : src.slice(start, end + 2);
    };
    /** Run a bash classifier over paths → ['CODE'|'DOCS', …]. */
    const classifyWith = (fnSrc, paths) => {
      const f = path.join(scratch, 'classify-' + crypto.randomBytes(4).toString('hex') + '.sh');
      fs.writeFileSync(f, `${fnSrc}\nfor p in "$@"; do if is_code_path "$p"; then echo CODE; else echo DOCS; fi; done\n`);
      const r = spawnSync('bash', [f, ...paths], { encoding: 'utf-8' });
      return (r.stdout || '').trim().split('\n').filter(Boolean);
    };
    // THE DERIVATION. Every gated suite's source is scanned for repo-relative
    // `docs/…` / `*.md` literals. The literal must be the WHOLE string (a
    // `${x}:` / `${x}/` prefix allowed — the version pin reads
    // `${REF}:CHANGELOG.md`), because a path that merely appears INSIDE a
    // sentence or a fixture VALUE is not a path this repo reads: '/w/README.md'
    // and 'please read README.md and fix the typo' are fixture data in
    // test-image-cards / test-opencode-serve, and pulling the root README.md
    // into the code set would kill the escape hatch entirely (measured: the
    // loose version derived it, the anchored one does not). A bare name with
    // no directory component additionally has to sit on a line that reads
    // something — that is what separates `read('CLAUDE.md')` from
    // `readCall.title === 'README.md'`. A doc OUTSIDE docs/ is named by its
    // whole repo-relative path, WHATEVER its directory (lane frp-token-proof r3c;
    // r3 had added `tools/…/*.md` alone, and deploy/README.md + three
    // scripts/fixtures docs that suites read stayed docs to the hook): a
    // `<dir>/…/*.md` literal is that doc, and a `<dir>/…` literal naming a
    // DIRECTORY is every `.md` it holds (test-doc-wheel reads
    // scripts/fixtures/doc-wheel whole). Only a `.md` matters out there — any
    // other path outside docs/ is code to the hook already. (r3: test-frps-plugin
    // spelled `path.join(DIR, 'README.md')`, derived as the ROOT README.md, and a
    // push of the plugin README alone skipped the gate.)
    // BOTH TIERS, on purpose: a docs-only push exits before the heavy LAUNCH
    // too, so a heavy suite's doc input is exactly as unguarded.
    const LIT = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
    const WHOLE = /^(?:\$\{[^}]*\}[:/])?((?:docs\/[A-Za-z0-9._/-]+)|(?:[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+)|(?:[A-Za-z0-9][A-Za-z0-9._-]*\.md))$/;
    const READ_CTX = /readFileSync|readdirSync|createReadStream|copyFileSync|cpSync|existsSync|statSync|path\.join|\bread\s*\(|\bgit\s*\(/;
    const gateInputs = new Map();   // repo-relative path → suites that read it
    const noteInput = (p, who) => { if (!gateInputs.has(p)) gateInputs.set(p, new Set()); gateInputs.get(p).add(who); };
    /** The `.md` files a directory outside docs/ holds (its dot-dirs and node_modules not entered, symlinks not followed). */
    const mdUnder = (root, dir) => {
      const out = [];
      const walk = (rel) => {
        for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          if (e.isDirectory()) walk(rel + '/' + e.name);
          else if (e.isFile() && e.name.endsWith('.md')) out.push(rel + '/' + e.name);
        }
      };
      walk(dir);
      return out;
    };
    const docLiterals = (src, root = REPO) => {
      const out = [];
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'));
      for (const line of code) {
        for (const m of line.matchAll(LIT)) {
          const w = WHOLE.exec(m[2]);
          if (!w) continue;
          const abs = path.join(root, w[1]);
          if (!fs.existsSync(abs)) continue;
          const reads = READ_CTX.test(line);
          if (w[1].startsWith('docs/') || !w[1].includes('/')) { out.push({ p: w[1], line, reads }); continue; }
          // outside docs/ (r3c): a .md by its path, a directory by the .md files it holds; anything else is code already
          if (/^node_modules\//.test(w[1])) continue;
          const st = fs.statSync(abs);
          if (st.isFile() && w[1].endsWith('.md')) out.push({ p: w[1], line, reads });
          else if (st.isDirectory()) for (const p of mdUnder(root, w[1].replace(/\/+$/, ''))) out.push({ p, line, reads });
        }
      }
      return out;
    };
    // THIS suite is the one file that TALKS about doc paths without reading
    // them — its own controls below hand `docs/sessions.md` and friends
    // to the classifier, and scanning itself made the derivation demand that
    // the hook call them code, which would have emptied the escape hatch.
    // The exclusion is MEASURED, not assumed: if this suite ever really
    // reads a doc, the assert right here says so. (lane fast-tier-ratchet: since the gate's split the file whose controls
    // hand doc paths over is THIS part, test-ci-gate-push — the other parts, test-ci-gate itself included, are scanned)
    const SELF = path.basename(fileURLToPath(import.meta.url), '.mjs');
    const selfReads = docLiterals(fs.readFileSync(path.join(REPO, 'scripts', SELF + '.mjs'), 'utf-8')).filter((h) => h.reads);
    ok(!selfReads.length, `${SELF} itself reads no documentation, so excluding it from the scan is a measurement${selfReads.length ? ' — it reads ' + selfReads.map((h) => h.p).join(', ') : ''}`);
    // THE SCAN SET IS "EVERY SCRIPT THE GATE RUNS", and the FAST tier is
    // `build + suites` — so the scripts `npm run build` chains are gate inputs
    // exactly like a suite is, even though they are in ci.mjs's EXCLUDED list
    // (`chained by npm run build`) and therefore not in SUITES. They read no
    // documentation TODAY (measured: 0 of the five), which is a fact that can
    // change with one commit, and the derivation is the thing that would
    // notice.
    const buildCmd = (({ scripts: s }) => [s['build:bundles'], s.build].filter(Boolean).join(' && '))(JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8')));   // B-c27e: the whole chain
    const buildScripts = [...new Set([...String(buildCmd).matchAll(/scripts\/([A-Za-z0-9._-]+)\.mjs/g)].map((m) => m[1]))];
    ok(buildScripts.length >= 4 && buildScripts.includes('test-architecture'),
      `\`npm run build\`'s own chained scripts are in the scan set (${buildScripts.length}: ${buildScripts.join(', ')}) — the fast tier is build + suites`);
    for (const name of [...SUITES.map((s) => s.name), ...buildScripts]) {
      if (name === SELF) continue;
      let src; try { src = fs.readFileSync(path.join(REPO, 'scripts', name + '.mjs'), 'utf-8'); } catch { continue; }
      for (const h of docLiterals(src)) {
        if (!h.p.includes('/') && !h.reads) continue;
        noteInput(h.p, name);
      }
    }
    // …plus the agent manuals, which are RUNTIME PRODUCT DATA: src/agent-routes.js
    // serves them from the running checkout (`GET /api/agent/docs/:topic`) — the
    // topics are the rows of src/agent-cli-registry.js (PURE) since lane cli-registry.
    const REGISTRY = createRequire(import.meta.url)(path.join(REPO, 'src', 'agent-cli-registry.js'));
    const manuals = [...new Set(REGISTRY.ROWS.flatMap((r) => [].concat(r.manual)))].map((f) => 'docs/agent/' + f);
    for (const p of manuals) if (fs.existsSync(path.join(REPO, p))) noteInput(p, 'src/agent-cli-registry.js AGENT_DOC_TOPICS');
    ok(manuals.length >= 5 && manuals.includes('docs/agent/msg-manual.md'),
      `AGENT_DOC_TOPICS read off src/agent-cli-registry.js (${manuals.length} manuals — the read is non-vacuous)`);

    const derived = [...gateInputs.keys()].sort();
    console.log(`     derived gate inputs (${derived.length}): ${derived.join(' ')}`);
    // NON-VACUITY: the derivation really did find the paths the incident named,
    // attributed to the suites that read them. A derivation that quietly stops
    // finding anything would make every assert below pass.
    const namedBy = (p, suite) => gateInputs.has(p) && gateInputs.get(p).has(suite);
    ok(namedBy('docs/kb-file-structure.md', 'test-codex-effort-meta')
      && namedBy('CLAUDE.md', 'test-readings-attribution-pins')
      && namedBy('CHANGELOG.md', 'test-codex-effort-meta')
      && namedBy('docs/examples/hello-plugin', 'test-plugin-loader')
      && namedBy('docs/agent/msg-manual.md', 'test-agent-msg'),
      'the derivation finds the incident\'s own paths, attributed to the suites that read them');
    ok(namedBy('tools/frps-login-plugin/README.md', 'test-frps-plugin'),
      'a doc outside docs/ is named by its PATH (tools/frps-login-plugin/README.md ← test-frps-plugin), never by its basename as the root README.md');
    ok(!gateInputs.has('README.md'),
      'and it does NOT drag in the root README.md (a fixture VALUE in test-image-cards / test-opencode-serve, not a path they read) — the escape hatch has to keep meaning something');

    const shipped = hookFn('is_code_path', hookSrc);
    ok(!!shipped, 'the tracked hook defines is_code_path (the classifier is extractable, so this leg runs the hook\'s OWN pattern)');
    if (shipped) {
      const verdicts = classifyWith(shipped, derived);
      const stillDocs = derived.filter((p, i) => verdicts[i] !== 'CODE');
      ok(verdicts.length === derived.length && !stillDocs.length,
        `every derived gate input is a CODE path to the shipped hook (${derived.length} paths)${stillDocs.length ? ' — STILL DOCS: ' + stillDocs.join(', ') + ' (add it to is_code_path)' : ''}`);
      // …and ordinary documentation still skips, or the escape hatch is gone.
      // (docs/getting-started.md left this list in 2.369.166: test-xpra-client reads its "## HTTPS for seamless copy"
      // section — the link target of the desktop copy hint — so it is a gate input now, derived above.)
      // (deploy/frp/README.md + scripts/api-specs/SOURCES.md, r3c: documentation OUTSIDE docs/ that no suite reads still skips —
      // the general rule below names docs by what suites READ, never by the directory they sit in)
      const docs = ['README.md', 'docs/sessions.md', 'docs/terminal.md', 'docs/screenshots/overview.png', 'docs/window-manager.md', 'deploy/frp/README.md', 'scripts/api-specs/SOURCES.md'];
      const dv = classifyWith(shipped, docs);
      ok(dv.every((v) => v === 'DOCS'), `real documentation is still documentation (${docs.join(', ')})`);
      ok(classifyWith(shipped, ['src/a.js', 'server.js', 'package.json']).every((v) => v === 'CODE'), 'and code is still code');
      // THE RULE IS GENERAL — one row per doc OUTSIDE docs/ a suite reads (lane frp-token-proof r3c; r3 named only
      // tools/, and each of these four was documentation to the hook — a push touching only it skipped the suites that
      // read it): derived by its whole path, attributed to its readers, and CODE to the shipped hook.
      const OUTSIDE = [
        ['deploy/README.md', ['test-helm-render', 'test-integration-registry']],
        ['scripts/fixtures/doc-print/lane-brief.md', ['test-doc-window', 'test-doc-window-width']],
        ['scripts/fixtures/doc-wheel/31-table-inline-html.md', ['test-doc-window', 'test-doc-window-width']],
        ['scripts/fixtures/doc-wheel/32-table-placeholder-cells.md', ['test-doc-window']],
      ];
      const ov = classifyWith(shipped, OUTSIDE.map(([p]) => p));
      OUTSIDE.forEach(([p, by], i) => {
        const missed = by.filter((s) => !namedBy(p, s));
        ok(!missed.length && ov[i] === 'CODE',
          `a doc outside docs/ is a gate input by its path: ${p} ← ${by.join(', ')}${missed.length ? ' — NOT derived for ' + missed.join(', ') : ''} — ${ov[i]} to the shipped hook`);
      });
      // …a doc read through its DIRECTORY too: test-doc-wheel reads scripts/fixtures/doc-wheel whole (its 30-odd fixtures).
      const wheel = [...gateInputs.keys()].filter((p) => p.startsWith('scripts/fixtures/doc-wheel/') && namedBy(p, 'test-doc-wheel')).sort();
      const wv = classifyWith(shipped, wheel), wheelDocs = wheel.filter((p, i) => wv[i] !== 'CODE');
      ok(wheel.length >= 30 && !wheelDocs.length,
        `a doc read through its DIRECTORY is a gate input too: test-doc-wheel reads scripts/fixtures/doc-wheel — ${wheel.length} fixtures derived${wheel.length < 30 ? ' (the directory read is NOT expanded to its docs)' : wheelDocs.length ? ', STILL DOCS: ' + wheelDocs.join(', ') : ', every one CODE to the shipped hook'}`);
      // …and the rule is no list of directories: a README planted where no rule has ever looked, read by a scratch
      // suite, is derived by its path — and the shipped hook calls it documentation until it is attributed.
      const plant = mktmp('plant');
      // (spelled by its whole path even here: a bare 'README.md' on a path.join line is the ROOT README to the rule, and
      // this suite's own scan above would say it reads one)
      fs.mkdirSync(path.join(plant, 'zz-planted/notes'), { recursive: true });
      fs.writeFileSync(path.join(plant, 'zz-planted/notes/README.md'), '# planted\n');
      const planted = docLiterals("const RD = fs.readFileSync(path.join(REPO, 'zz-planted/notes/README.md'), 'utf8');", plant).map((h) => h.p);
      const attributed = shipped.replace('case "$1" in\n', 'case "$1" in\n    zz-planted/notes/README.md) return 0 ;;\n');
      const plv = [...classifyWith(shipped, planted), ...classifyWith(attributed, planted)];
      ok(planted.join() === 'zz-planted/notes/README.md' && plv.join() === 'DOCS,CODE',
        `a README planted in a directory no rule names (zz-planted/notes/README.md, read by a scratch suite) is derived by its path${planted.length ? ` and is ${plv[0]} to the shipped hook until it is attributed, then ${plv[1]}` : ' — NOT derived'}`);
      // NEGATIVE CONTROL — the pre-round-5 classifier, verbatim: every one of
      // those gate inputs was documentation to it, which is the defect.
      const preFix = 'is_code_path() {\n  case "$1" in\n    docs/*|*.md) return 1 ;;\n  esac\n  return 0\n}\n';
      const pv = classifyWith(preFix, derived);
      const missed = derived.filter((p, i) => pv[i] !== 'CODE');
      ok(missed.length === derived.length,
        `NEG: the pre-round-5 pattern called ALL ${derived.length} of them documentation (so a push touching only one skipped both tiers)`);
    }
  }

  // ── ROUND 5 (b): A GATE-INPUT DOC PUSH RUNS THE TIER, END TO END ──────
  if (!DEEP) inTwin('round 5 (b): a gate-input doc push runs the tier, end to end (four pushes and the NEG copy)'); else {
    git(repo, ['checkout', '-q', '-b', 'docsinput', SIDE]);
    const BASE5 = commit(repo, 'src/base5.js', '//base\n', 'the commit the docs legs below sit on');
    const KB = commit(repo, 'docs/kb-file-structure.md', '# kb\n', 'kb only — this branch\'s own tip shape');
    const rKB = runHookRefs(`refs/heads/docsinput ${KB} refs/heads/docsinput ${BASE5}\n`);
    ok(rKB.calls.some((c) => c.mode === 'fast'),
      'a push touching ONLY docs/kb-file-structure.md runs the FAST tier (it is source-pinned by test-codex-effort-meta)');
    ok(rKB.calls.some((c) => c.mode === 'heavy-launch'), '…and its heavy run is launched too');
    const MAN = commit(repo, 'docs/agent/msg-manual.md', '# manual\n', 'an agent manual — runtime product data');
    ok(runHookRefs(`refs/heads/docsinput ${MAN} refs/heads/docsinput ${KB}\n`).calls.some((c) => c.mode === 'fast'),
      'a push touching ONLY docs/agent/msg-manual.md runs the FAST tier (the server serves that file)');
    const EX = commit(repo, 'docs/examples/hello-plugin/vibespace-plugin.json', '{}\n', 'the shipped example plugin');
    ok(runHookRefs(`refs/heads/docsinput ${EX} refs/heads/docsinput ${MAN}\n`).calls.some((c) => c.mode === 'fast'),
      'a push touching ONLY docs/examples/hello-plugin/** runs the FAST tier (three plugin suites cpSync it)');
    // …and a REAL docs-only push still skips, or the escape hatch is gone.
    const RM = commit(repo, 'README.md', '# readme\n', 'genuinely docs-only');
    const rRM = runHookRefs(`refs/heads/docsinput ${RM} refs/heads/docsinput ${EX}\n`);
    ok(rRM.status === 0 && !rRM.calls.some((c) => c.mode === 'fast') && /docs-only/.test(rRM.out),
      'a genuinely docs-only push (README.md) still skips the fast tier');
    const preDocs = preFixHook('gateinputs',
      ['    CLAUDE.md|CHANGELOG.md|docs/kb-*.md|docs/design-*.md|docs/agent/*|docs/examples/*) return 0 ;;\n', ''],
      ['    docs/README.md|docs/plugins.md|docs/settings.md|docs/keyboard-shortcuts.md) return 0 ;;\n', '']);
    if (preDocs) {
      const n = runHookRefs(`refs/heads/docsinput ${KB} refs/heads/docsinput ${BASE5}\n`, {}, preDocs);
      ok(!n.calls.some((c) => c.mode === 'fast') && /docs-only/.test(n.out),
        'NEG: without the gate-input arm the same kb-only push skips BOTH tiers (the shape this branch\'s own tip has)');
    }
  }

  // ── ROUND 5 (c): THE FAST TIER GATES THE COMMIT BEING PUSHED ──────────
  // Invariant ⑭ in the last place it had not reached. Round 2 fixed the heavy
  // VERDICT and round 4 the marker SHORTCUT; the fast RUN still executed in
  // the working tree. Reproduced: standing on `marked`, pushing `ungated`
  // (tip F adds src/broken.js) ⇒ the tier ran in a tree without that file and
  // said ALL GREEN. r13 above proved a fast run HAPPENED — never its SUBJECT.
  if (!DEEP) inTwin('round 5 (c): the fast tier gates the commit being pushed (a tip that is not HEAD, --isolate, its NEG copy)'); else {
    git(repo, ['checkout', '-q', '-b', 'elsewhere5', SIDE]);
    const STANDING = commit(repo, 'src/standing.js', '//the tree we have checked out\n', 'STANDING — where the developer is');
    git(repo, ['checkout', '-q', '-b', 'ungated5', SIDE]);
    const UNGATED = commit(repo, 'src/broken5.js', '//never gated by anything\n', 'UNGATED — the tip being pushed');
    git(repo, ['checkout', '-q', 'elsewhere5']);
    ok(git(repo, ['rev-parse', 'HEAD']) === STANDING && !fs.existsSync(path.join(repo, 'src', 'broken5.js')),
      'the fixture is the incident\'s shape: HEAD is STANDING and the working tree does NOT contain the pushed commit\'s file');
    const rIso = runHookRefs(`refs/heads/ungated5 ${UNGATED} refs/heads/ungated5 ${ZERO}\n`);
    const fastCall = rIso.calls.find((c) => c.mode === 'fast');
    ok(!!fastCall && fastCall.isolate === true && fastCall.sha === UNGATED,
      `pushing a ref whose tip is NOT HEAD gates THAT COMMIT (--isolate --sha=${UNGATED.slice(0, 8)}), not the tree you have checked out`);
    ok(!!fastCall && fastCall.keepGoing === true, 'B-6e71: …and the isolated fast call runs WITH --keep-going (every red at that commit named)', fastCall);
    ok(/is NOT the commit you have checked out/.test(rIso.out), '…and says so, naming the ref and the sha (§no-silent-failures)');
    // The ordinary push is untouched — this must not cost every push a worktree.
    const rPlain = runHookRefs(`refs/heads/elsewhere5 ${STANDING} refs/heads/elsewhere5 ${SIDE}\n`);
    const plainCall = rPlain.calls.find((c) => c.mode === 'fast');
    ok(!!plainCall && !plainCall.isolate,
      'the ordinary push (every pushed sha IS HEAD) still runs in place — the ≤2 min budget is untouched');
    // Two refs at the SAME sha are one run, not two.
    git(repo, ['branch', '-f', 'twin5', UNGATED]);
    const rTwin = runHookRefs(`refs/heads/ungated5 ${UNGATED} refs/heads/ungated5 ${ZERO}\nrefs/heads/twin5 ${UNGATED} refs/heads/twin5 ${ZERO}\n`);
    ok(rTwin.calls.filter((c) => c.mode === 'fast').length === 1, 'two refs pointing at ONE commit run the fast tier once');
    const preSubject = preFixHook('fastsubject', ['    if [ "$sha" = "$head_sha" ]; then', '    if true; then']);
    if (preSubject) {
      const n = runHookRefs(`refs/heads/ungated5 ${UNGATED} refs/heads/ungated5 ${ZERO}\n`, {}, preSubject);
      const nf = n.calls.find((c) => c.mode === 'fast');
      ok(!!nf && !nf.isolate && !nf.sha,
        'NEG: before the fix the same push ran the tier against the WORKING TREE and said ALL GREEN about it');
    }
  }

  // ── ROUND 6: ONE FAST SUBJECT PER PUSH ────────────────────────────────
  // Round 5 made the fast run a LOOP over the distinct pushed shas, so the
  // ≤2 min budget — and the real billed haiku turn inside it — was multiplied
  // by the number of refs, inside the live SSH session. Reproduced with this
  // fixture before the fix: a three-ref push ⇒ THREE fast runs. `git push
  // --all` in this repository is 315 branches and `git push --tags` is 41.
  // The other refs are not ungated: `--heavy-launch` still runs for every
  // pushed sha, which is the tier that gives a multi-ref push its per-commit
  // coverage — and the hook SAYS which commits the fast tier did not look at.
  if (!DEEP) inTwin('round 6: one fast subject per push (the multi-ref pushes and their NEG copy)'); else {
    git(repo, ['checkout', '-q', '-b', 'multi6', SIDE]);
    const M_HEAD = commit(repo, 'src/m-head.js', '//head\n', 'M_HEAD — the commit we are standing on');
    git(repo, ['checkout', '-q', '-b', 'multi6b', SIDE]);
    // Explicit committer dates: the subject for a push that does NOT include
    // HEAD is the NEWEST of the pushed shas, and `git rev-list --no-walk` sorts
    // by COMMITTER date — two commits made in the same second would make that
    // assert a coin toss dressed up as a rule.
    const M_OLD = commit(repo, 'src/m-old.js', '//old\n', 'M_OLD — older by committer date', '2026-01-01T00:00:00 +0000');
    git(repo, ['checkout', '-q', '-b', 'multi6c', SIDE]);
    const M_NEW = commit(repo, 'src/m-new.js', '//new\n', 'M_NEW — newer by committer date', '2026-06-01T00:00:00 +0000');
    git(repo, ['checkout', '-q', 'multi6']);
    const threeRefs = `refs/heads/multi6 ${M_HEAD} refs/heads/multi6 ${ZERO}\nrefs/heads/multi6b ${M_OLD} refs/heads/multi6b ${ZERO}\nrefs/heads/multi6c ${M_NEW} refs/heads/multi6c ${ZERO}\n`;
    ok(git(repo, ['rev-parse', 'HEAD']) === M_HEAD, 'the fixture stands on M_HEAD, and the push carries three distinct commits');
    const rMulti = runHookRefs(threeRefs);
    const fastCalls = rMulti.calls.filter((c) => c.mode === 'fast');
    ok(fastCalls.length === 1, `a three-ref push runs the fast tier ONCE (got ${fastCalls.length}) — not three builds, three tiers and three billed chat turns inside the SSH session`);
    ok(fastCalls.length === 1 && !fastCalls[0].isolate,
      '…in place, because HEAD is one of the pushed shas (the ordinary push is unchanged: same cost as a single-ref push)');
    ok(rMulti.calls.filter((c) => c.mode === 'heavy-launch').length === 3,
      '…while the HEAVY tier is still launched for EVERY pushed sha (that is where the other refs are covered)');
    ok(/publishes 2 other commit\(s\)/.test(rMulti.out) && rMulti.out.includes(M_OLD.slice(0, 8)) && rMulti.out.includes(M_NEW.slice(0, 8)),
      '…and the hook NAMES the commits the fast tier did not look at (a silent one-of-three would read as "all of them were gated")');
    ok(rMulti.status === 0, 'and the push proceeds');

    // HEAD not being pushed at all: still ONE run, isolated, at the NEWEST.
    git(repo, ['checkout', '-q', 'elsewhere5']);
    const rMultiAway = runHookRefs(`refs/heads/multi6b ${M_OLD} refs/heads/multi6b ${ZERO}\nrefs/heads/multi6c ${M_NEW} refs/heads/multi6c ${ZERO}\n`);
    const awayFast = rMultiAway.calls.filter((c) => c.mode === 'fast');
    ok(awayFast.length === 1 && awayFast[0].isolate === true && awayFast[0].sha === M_NEW,
      `a multi-ref push with HEAD not among the pushed shas gates ONE of them — the newest (${M_NEW.slice(0, 8)}), isolated (got ${awayFast.length} run(s) at ${(awayFast[0] || {}).sha || '-'})`);
    ok(/refs\/heads\/multi6c tips at/.test(rMultiAway.out) && /publishes 1 other commit\(s\)/.test(rMultiAway.out),
      '…named by its ref, with the one it did not cover named too');

    // A one-ref push says nothing about "other commits" — the message is a
    // statement of fact, not decoration.
    git(repo, ['checkout', '-q', 'multi6']);
    const rOne = runHookRefs(`refs/heads/multi6 ${M_HEAD} refs/heads/multi6 ${ZERO}\n`);
    ok(rOne.calls.filter((c) => c.mode === 'fast').length === 1 && !/other commit\(s\)/.test(rOne.out),
      'a single-ref push is byte-for-byte the old behaviour: one in-place run, and no claim about commits it skipped');

    // NEGATIVE CONTROL: the selection put back to "every distinct sha", which
    // is the round-5 hook's behaviour verbatim (the loop below it is unchanged).
    const preOne = preFixHook('onesubject', ['  fast_subjects="$subject"', '  fast_subjects="$distinct"']);
    if (preOne) {
      const n = runHookRefs(threeRefs, {}, preOne);
      ok(n.calls.filter((c) => c.mode === 'fast').length === 3,
        `NEG: with the selection reverted the same push runs the whole fast tier THREE times (got ${n.calls.filter((c) => c.mode === 'fast').length}) — N× the budget and N billed turns`);
    }
  }

  // ── THE NEW-BRANCH RANGE IS RESOLVED BEFORE THE PUSH (2026-09-16, verifier).
  // The hook handed the child a lone sha, and the child resolved it with
  // `git log <sha> --not --remotes` AFTER the pack transfer had started — once
  // refs/remotes/origin/<branch> was updated the range was EMPTY and the
  // affected tier ran the two always rows for a push full of code. Now the
  // hook resolves the boundary itself (the merge base with every remote-
  // tracking ref) and hands `<boundary>..<tip>`, a diff the ref update cannot
  // change. The race is made deterministic here: the ref is updated by hand
  // and both spellings are asked afterwards.
  {
    const anchorSha = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['update-ref', 'refs/remotes/origin/main', anchorSha]);
    git(repo, ['checkout', '-q', '-b', 'newbranch7']);
    commit(repo, 'src/n1.js', '//n1\n', 'N1');
    const N2 = commit(repo, 'src/n2.js', '//n2\n', 'N2');
    writeMarker(path.join(repo, 'data', 'ci-heavy'), N2, 'green'); // keep the heavy verdict clear for this leg
    const rNew = runHookRefs(`refs/heads/newbranch7 ${N2} refs/heads/newbranch7 ${ZERO}\n`);
    const rangeNew = rNew.calls.find((c) => c.mode === 'heavy-launch')?.range;
    ok(rangeNew === `${anchorSha}..${N2}`,
      `a NEW branch with a remote-tracking ref to anchor on hands \`<boundary>..<tip>\` — the merge base, resolved BEFORE the push (got ${JSON.stringify(rangeNew)})`);
    git(repo, ['update-ref', 'refs/remotes/origin/newbranch7', N2]); // what the push does, a moment later
    const { changedFiles: cf } = await import('./ci.mjs');
    ok((cf(N2, repo).files || []).length === 0, 'CONTROL (the defect): the lone sha resolved AFTER the push lists NOTHING — the affected tier would have run only the always rows');
    ok((cf(rangeNew, repo).files || []).sort().join() === 'src/n1.js,src/n2.js', '…the fixed spelling still lists both files after the push');
    git(repo, ['update-ref', '-d', 'refs/remotes/origin/newbranch7']);
    git(repo, ['update-ref', '-d', 'refs/remotes/origin/main']);
  }
}

// ── §5 THE GIT ENVIRONMENT THE DETACHED CHILD MUST NOT INHERIT ───────────
// A pre-push hook process exports GIT_DIR / GIT_INDEX_FILE / GIT_PREFIX, and
// the heavy tier's very first act is `git worktree add`. Inheriting them means
// creating a worktree of whatever repository the environment names. This is
// the same class as test-architecture §42 rounds 6-7 and shares its ONE list
// (scripts/git-env.mjs) — here it is proven on the operation the heavy gate
// actually performs, with the damage as the negative control.
console.log('\n§5 the detached child\'s git environment');
{
  const decoy = makeRepo('decoy');
  commit(decoy, 'x.txt', 'x\n', 'decoy');
  const stamp = (root) => {
    const out = [];
    (function walk(dir, rel) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(p, r);
        else { try { out.push(`${r}:${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`); } catch { out.push(`${r}:?`); } }
      }
    })(path.join(root, '.git'), '');
    return out.join('\n');
  };
  const ours = makeRepo('ours');
  commit(ours, 'y.txt', 'y\n', 'ours');
  const hostile = {
    ...process.env,
    GIT_DIR: path.join(decoy, '.git'),
    GIT_WORK_TREE: decoy,
    GIT_INDEX_FILE: path.join(decoy, '.git', 'index'),
  };
  const before = stamp(decoy);
  ok(GIT_REDIRECTORS.includes('GIT_DIR') && GIT_REDIRECTORS.includes('GIT_INDEX_FILE') && GIT_REDIRECTORS.length >= 25,
    `the shared sanitizer covers the hook's own exports (${GIT_REDIRECTORS.length} names)`);

  const wt1 = path.join(mktmp('wt'), 'guarded');
  const guarded = spawnSync('git', ['-C', ours, 'worktree', 'add', '--detach', wt1, 'HEAD'], { encoding: 'utf-8', env: gitEnvFrom(hostile) });
  ok(guarded.status === 0 && fs.existsSync(path.join(wt1, 'y.txt')),
    'with the sanitized environment, `git worktree add` checks out OUR repository');
  ok(stamp(decoy) === before, '…and the decoy repository is byte-identical afterwards');

  const wt2 = path.join(mktmp('wt'), 'raw');
  const raw = spawnSync('git', ['-C', ours, 'worktree', 'add', '--detach', wt2, 'HEAD'], { encoding: 'utf-8', env: hostile });
  const decoyTouched = stamp(decoy) !== before;
  ok(decoyTouched || raw.status !== 0,
    `NEGATIVE CONTROL: the SAME command with the hook's environment inherited does not do the same thing (decoy touched: ${decoyTouched}, exit ${raw.status})`);
  ok(!fs.existsSync(path.join(wt2, 'y.txt')),
    'NEGATIVE CONTROL: …and it certainly does not check out OUR commit (this is the damage the sanitizer prevents)');
  // Leave no worktree registrations behind in the throwaway repos.
  for (const [root, wt] of [[ours, wt1], [ours, wt2], [decoy, wt2]]) { try { spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', wt], { env: GIT_ENV }); } catch {} }
}
  // B-c27e (lane bl-ci, 主开发 r4377): THE BUILD's TWO HALVES. `build:bundles` holds every step that WRITES an output (the i18n check, the
  // build version, the bundles, noVNC, the device bundle); `build` is it followed by the four chained CHECKS and nothing else, so a
  // person's `npm run build`, the installer and the updater do exactly what they did. A suite that builds in a worktree of its own asks
  // `build:bundles` (the checks write nothing; each tier runs them once, inside its own `npm run build`).
  console.log('\n§B-c27e the build\'s two halves — build:bundles writes, build checks; no suite builds whole in a worktree of its own');
  {
    const CHECKS = ['node scripts/test-bundle-globals.mjs', 'node scripts/test-architecture.mjs', 'node scripts/test-ws-contract.mjs', 'node scripts/test-session-schema.mjs'];
    const halves = (sc) => {
      const out = [], steps = String((sc && sc['build:bundles']) || '').split(' && ');
      if ((sc && sc.build) !== ['npm run build:bundles', ...CHECKS].join(' && ')) out.push(`build is not «npm run build:bundles» followed by the four checks alone: ${String(sc && sc.build).slice(0, 160)}`);
      if (steps.some((x) => /^node scripts\/test-/.test(x))) out.push('a check stands inside build:bundles');
      if (!steps.some((x) => /^esbuild src\/client\.js\s/.test(x)) || !steps.includes('npm run build:agentd') || !steps.includes('node scripts/i18n-check.mjs')) out.push('build:bundles lacks a writer it must hold (the client bundle, the device bundle, the i18n check)');
      return out;
    };
    const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8'));
    const now = halves(PKG.scripts), planted = halves({ ...PKG.scripts, build: PKG.scripts.build + ' && esbuild src/x-entry.js --bundle --outfile=public/x.js' });
    ok(now.length === 0, `(1) THE TWO HALVES: build ≡ build:bundles then the four checks and nothing else; every writer stands in build:bundles (${String(PKG.scripts['build:bundles'] || '').split(' && ').length} steps)${now.length ? ' — ' + now.join(' · ') : ''}`);
    ok(planted.length === 1 && /four checks alone/.test(planted[0]), `(1) CONTROL: a writer added to build alone is red by name (${planted.length})`);
    // and each other red branch (the take round's should on line 1011): a check put inside build:bundles; build:bundles without a writer it must hold
    const inside = halves({ ...PKG.scripts, 'build:bundles': PKG.scripts['build:bundles'] + ' && node scripts/test-zz-planted.mjs' });
    const lacking = halves({ ...PKG.scripts, 'build:bundles': String(PKG.scripts['build:bundles'] || '').split(' && ').filter((x) => x !== 'npm run build:agentd').join(' && ') });
    ok(inside.some((x) => /a check stands inside build:bundles/.test(x)) && lacking.some((x) => /lacks a writer/.test(x)),
      `(1) CONTROL: a check put inside build:bundles is red (${inside.length}), and build:bundles without the device bundle is red (${lacking.length})`);
    // (2) THE CENSUS: a suite — or a module a suite imports, at any depth (B-c27e follow, 主开发 r5141: scripts/xpra-window-boot.mjs built
    // whole for seven heavy suites, unseen by a census of the suites alone) — that runs the WHOLE build script (`npm run build`, the chain
    // with its checks) with a cwd of its own is red by name: a worktree or scratch asks build:bundles. The cwd is read to the call's own
    // closing parenthesis (options on the next line too); REPO and repo alone are the tree's own root (ROOT is a scratch root in suites);
    // a shell form (a cd into a folder that is not the tree's own root, then the whole build) is a whole build too. NEEDS_CHECKS would name a suite that truly needs the
    // checks there, with its reason: none today. (A planted text — a string — whose call has no `cwd:` of its own is no call of this census.)
    const NEEDS_CHECKS = {};
    const BUILD_HEAD = /(?:execSync|execFileSync|spawnSync|spawn|execFile|exec)\(\s*(?:(['"`])npm run build\1|['"]npm['"]\s*,\s*\[\s*['"]run['"]\s*,\s*['"]build['"]\s*\])/g;
    const SHELL_BUILD = /\bcd ([^'"`;&]{1,80})&& npm run build(?![:\w])/g;
    const BUNDLES_CALL = /(?:execSync|execFileSync|spawnSync|spawn|execFile|exec)\(\s*(?:(['"`])npm run build:bundles\1|['"]npm['"]\s*,\s*\[\s*['"]run['"]\s*,\s*['"]build:bundles['"]\s*\])/g;
    // A COMMENT LINE says nothing of a call. The rest of a call is read to its OWN closing parenthesis (quotes and nesting kept, at most
    // 4000 characters): a later statement's cwd is never its own, and a `;` inside a string or a long options object hides nothing.
    const code = (src) => src.split('\n').map((l) => (/^\s*(?:\/\/|\*|\/\*)/.test(l) ? '' : l)).join('\n');
    const restOfCall = (src, at) => {
      let depth = 0, q = null;
      for (let i = at; i < Math.min(src.length, at + 4000); i++) {
        const ch = src[i];
        if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
        if (ch === "'" || ch === '"' || ch === '`') q = ch;
        else if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) { if (depth === 0) return src.slice(at, i); depth--; }
      }
      return src.slice(at, at + 4000);
    };
    const ROOTS = /^(?:REPO|repo)$/, ROOT_CD = /^"?\$\{(?:REPO|repo)\}"?$/;
    const whole = (name, src) => {
      const t = code(src);
      return [...[...t.matchAll(BUILD_HEAD)].filter((m) => { const c = /\bcwd:\s*([A-Za-z_$][\w$.]*)/.exec(restOfCall(t, m.index + m[0].length)); return !!c && !ROOTS.test(c[1]); }),
        ...[...t.matchAll(SHELL_BUILD)].filter((m) => !ROOT_CD.test(m[1].trim()))].map(() => name);
    };
    // the suites and every scripts/ module they import BY A LITERAL PATH, at any depth — a static or a bare import at a line's start,
    // import(), require() (a computed specifier cannot be followed); a comment line is not read; a path outside scripts/ is not read
    const IMPORT_SPEC = /^\s*import\b[^;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]|\brequire\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
    const reach = (tests, readRel) => {
      const seen = new Map(), todo = [];
      for (const f of tests) { seen.set(f, readRel(f) || ''); todo.push(f); }
      while (todo.length) {
        const f = todo.pop();
        for (const m of code(seen.get(f)).matchAll(IMPORT_SPEC)) {
          const g = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1] || m[2] || m[3] || m[4]));
          if (g.startsWith('..') || seen.has(g)) continue;
          const t = readRel(g);
          if (t !== null) { seen.set(g, t); todo.push(g); }
        }
      }
      return seen;
    };
    const nameOf = (f) => (/^test-[^/]*\.mjs$/.test(f) ? f.slice(0, -4) : `scripts/${f}`);
    const readScripts = (rel) => { try { return fs.readFileSync(path.join(REPO, 'scripts', rel), 'utf-8'); } catch { return null; } };
    const files = fs.readdirSync(path.join(REPO, 'scripts')).filter((n) => /^test-.*\.mjs$/.test(n));
    const read = reach(files, readScripts), mods = [...read.keys()].filter((f) => !files.includes(f));
    let calls = 0; const red = [];
    for (const [f, src] of read) { calls += (src.match(BUNDLES_CALL) || []).length; for (const w of whole(nameOf(f), src)) if (!NEEDS_CHECKS[w]) red.push(w); }
    ok(red.length === 0 && calls >= 40 && mods.includes('xpra-window-boot.mjs'), `(2) THE CENSUS: ${files.length} suites and the ${mods.length} scripts/ modules they import read — ${calls} build:bundles calls in a worktree of their own, ${red.length} building the whole chain there${red.length ? ': ' + [...new Set(red)].join(', ') : ''}; needing the checks there: ${Object.keys(NEEDS_CHECKS).length}`);
    const PLANT = "const wt = 'x';\nexecSync('npm run " + "build', { cwd: wt, stdio: 'ignore' });\n";
    ok(whole('test-zz-planted', PLANT).length === 1, '(2) CONTROL: a planted suite that runs the whole build in its worktree is red by name');
    // the follow's controls (r5141): a module a suite imports (two deep) is read and named; the options on the next line; ROOT is no root;
    // the shell form; and the tree's own root stays clean
    const B = "execSync('npm run " + "build'";
    const TREE = { 'test-zz-planted.mjs': "import { boot } from './zz-boot.mjs';\n", 'zz-boot.mjs': "import { cut } from './lib/zz-deep.mjs';\n", 'lib/zz-deep.mjs': PLANT };
    const viaHelper = [...reach(['test-zz-planted.mjs'], (r) => (r in TREE ? TREE[r] : null))].flatMap(([f, src]) => whole(nameOf(f), src));
    const shapes = { nextLine: `${B},\n    { cwd: wt, stdio: 'ignore' });`, root: `${B}, { cwd: ROOT, stdio: 'ignore' });`, shell: "execSync(`cd ${wt} " + "&& npm run " + "build`, { stdio: 'ignore' });" };
    const own = whole('test-zz-planted', `${B}, { cwd: REPO, stdio: 'ignore' });`);
    ok(JSON.stringify(viaHelper) === JSON.stringify(['scripts/lib/zz-deep.mjs']) && Object.values(shapes).every((t) => whole('x', t).length === 1) && own.length === 0,
      `(2) CONTROL: a module two imports deep that builds whole in a worktree is named (${viaHelper.join(', ') || 'none'}); options on the next line, a cwd ROOT and the shell form are each red; the tree's own root is not`);
    // the follow's read round: a `;` inside a string and a long options object hide no cwd; a later statement's cwd is not the call's; a
    // comment and a cd into the tree's own root are no whole build; a bare import and a require are followed, an import in a comment is not
    const more = {
      semicolon: `${B}, { env: { PS4: '+; ' }, cwd: wt, stdio: 'ignore' })`,
      long: `${B}, { env: { NOTE: '${'x'.repeat(400)}' }, cwd: wt, stdio: 'ignore' })`,
    };
    const clean = {
      laterStatement: `${B}, { stdio: 'ignore' })\nexecSync(next, { cwd: wt })`,
      comment: '  // by hand: cd /tmp/vs-zz ' + '&& npm run ' + 'build',
      rootCd: "execSync(`cd ${REPO} " + "&& npm run " + "build`, { stdio: 'ignore' });",
    };
    const TREE2 = { 'test-zz-planted.mjs': "import './zz-side.mjs';\nconst h = require('./zz-req.cjs');\n// import { x } from './zz-commented.mjs';\n", 'zz-side.mjs': '', 'zz-req.cjs': PLANT, 'zz-commented.mjs': PLANT };
    const viaForms = [...reach(['test-zz-planted.mjs'], (r) => (r in TREE2 ? TREE2[r] : null))].flatMap(([f, src]) => whole(nameOf(f), src));
    ok(Object.values(more).every((t) => whole('x', t).length === 1) && Object.values(clean).every((t) => whole('x', t).length === 0) && JSON.stringify(viaForms) === JSON.stringify(['scripts/zz-req.cjs']),
      `(2) CONTROL: a ; in a string and a long options object hide no cwd; a later statement's cwd, a comment and a cd into the tree's own root are clean; a bare import and a require are followed, a commented import is not (${viaForms.join(', ') || 'none'})`);
    // (3) EACH TIER RUNS THE FOUR CHECKS ONCE, BY NAME: ci.mjs runBuild spawns the whole `npm run build`; the fast gate and the heavy gate
    // each call it once on their tree (the hosted jobs run those gates)
    const CI = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
    ok(CI.includes("const r = spawnSync('npm', ['run', " + "'build'], { cwd,") &&   // (the anchor in two pieces: this file's own census reads no call in it)
       (CI.match(/\brunBuild\(\{ cwd: runRoot\b/g) || []).length === 2 && !CI.includes('build:bundles'),
      '(3) EACH TIER RUNS THE FOUR CHECKS ONCE: runBuild spawns the whole «npm run build» (its chain ends in the four checks), the fast and the heavy gate each call it on their tree, and the gate never asks build:bundles');
  }
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
