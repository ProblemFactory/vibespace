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
import { REPO, GIT_ENV, ok, tmpDirs, mktmp, git, makeRepo, commit, STUB_SLICE, stubGateRepo, writeMarker, report } from './ci-gate-kit.mjs'; // the shared kit (lane fast-tier-ratchet: the gate is seven ≤ 10 s parts)

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
  const repo = makeRepo('hook');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'data', 'ci-heavy'), { recursive: true });
  const realCi = path.join(REPO, 'scripts', 'ci.mjs').replace(/\\/g, '/');
  fs.writeFileSync(path.join(repo, 'scripts', 'ci.mjs'), `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
import { heavyBlocker } from ${JSON.stringify(realCi)};
const repo = ${JSON.stringify(repo)};
const dir = path.join(repo, 'data', 'ci-heavy');
const argv = process.argv.slice(2);
const note = (o) => fs.appendFileSync(path.join(repo, 'calls.ndjson'), JSON.stringify(o) + '\\n');
const headArg = (argv.find((a) => a.startsWith('--head=')) || '').slice(7) || null;
if (argv.includes('--check-heavy')) {
  note({ mode: 'check-heavy', head: headArg });
  const b = heavyBlocker({ dir, repoRoot: repo, head: headArg || undefined });
  if (b) { console.error('PUSH BLOCKED failed: ' + (b.failed || []).join(', ')); process.exit(1); }
  process.exit(0);
}
const li = argv.indexOf('--heavy-launch');
if (li >= 0) { note({ mode: 'heavy-launch', sha: argv[li + 1], range: (argv.find((a) => a.startsWith('--range=')) || '').slice(8) }); process.exit(0); }
note({ mode: 'fast', isolate: argv.includes('--isolate'), sha: (argv.find((a) => a.startsWith('--sha=')) || '').slice(6) || null });
process.exit(fs.existsSync(path.join(repo, 'FAST_RED')) ? 1 : 0);
`);
  fs.copyFileSync(path.join(REPO, 'scripts', 'git-hooks', 'pre-push'), path.join(repo, 'pre-push'));
  fs.chmodSync(path.join(repo, 'pre-push'), 0o755);
  fs.copyFileSync(path.join(REPO, 'scripts', 'secret-scan.mjs'), path.join(repo, 'scripts', 'secret-scan.mjs')); // B-89da: the hook's secret scan runs before every step below (test-secret-scan drives it)
  const ZERO = '0'.repeat(40);
  const calls = () => { try { return fs.readFileSync(path.join(repo, 'calls.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  // `hook` is a parameter so a PRE-FIX COPY of the real hook can be driven
  // through the exact same fixture: every round-4 leg below states the answer
  // the shipped hook gives AND the answer the defect gave, or it proves nothing.
  const runHookRefs = (stdin, env = {}, hook = path.join(repo, 'pre-push')) => {
    try { fs.unlinkSync(path.join(repo, 'calls.ndjson')); } catch {}
    const r = spawnSync('bash', [hook, 'origin', 'git@example.invalid:x/y.git'], {
      cwd: repo, input: stdin, encoding: 'utf-8', env: { ...GIT_ENV, ...env },
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), calls: calls() };
  };
  // A copy of the REAL hook with one guard reverted to the shape that caused
  // the finding. An anchor that no longer matches is a RED assert (not a
  // throw): a control that quietly becomes "the same hook twice" proves
  // nothing, and the suite still has to report the behavioural asserts around
  // it — that is what the mutation battery reads.
  const hookSrc = fs.readFileSync(path.join(REPO, 'scripts', 'git-hooks', 'pre-push'), 'utf-8');
  const preFixHook = (tag, ...edits) => {
    let patched = hookSrc;
    for (const [from, to] of edits) {
      const next = patched.replace(from, to);
      if (next === patched) {
        ok(false, `pre-fix control "${tag}": the anchor ${JSON.stringify(String(from).slice(0, 50))} is not in the shipped hook — the control would be a second copy of it, so its NEG leg proves nothing`);
        return null;
      }
      patched = next;
    }
    const p = path.join(repo, `pre-push.prefix-${tag}`);
    fs.writeFileSync(p, patched); fs.chmodSync(p, 0o755);
    return p;
  };
  // The docs-only block, verbatim, so the "it used to exit before asking"
  // control can put it back where it was instead of approximating it.
  const DOCS_ONLY_BLOCK = 'if [ "$only_docs" = "1" ] && [ "${#REFS[@]}" -gt 0 ]; then\n  echo "[ci] docs-only push — fast tier skipped" >&2\n  exit 0\nfi\n';
  const HEAVY_FIRST_ANCHOR = '# ── HEAVY-TIER VERDICT FIRST (2026-09-07) ─';
  const runHook = (localSha, remoteSha = ZERO, env = {}) =>
    runHookRefs(`refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`, env);

  const A = commit(repo, 'src/a.js', '//a\n', 'A');
  const r1 = runHook(A);
  ok(r1.status === 0, 'fast tier green ⇒ the push proceeds');
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
    const r11 = runHookRefs(badRefs);
    ok(r11.calls.some((c) => c.mode === 'fast'), 'a range git CANNOT read is never treated as docs-only');
    ok(/could not list the paths/.test(r11.out), '…and it says so out loud (§no-silent-failures), naming the command and git\'s own message');
    const preQuiet = preFixHook('quietfail', ['  if [ "$rc" != "0" ]; then', '  if false; then']);
    if (preQuiet) {
      const r11n = runHookRefs(badRefs, {}, preQuiet);
      ok(!r11n.calls.some((c) => c.mode === 'fast') && /docs-only/.test(r11n.out),
        'NEG: without the exit-status check the same push is "docs-only", silently');
    }
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
  {
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
    // `readCall.title === 'README.md'`.
    // BOTH TIERS, on purpose: a docs-only push exits before the heavy LAUNCH
    // too, so a heavy suite's doc input is exactly as unguarded.
    const LIT = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
    const WHOLE = /^(?:\$\{[^}]*\}[:/])?((?:docs\/[A-Za-z0-9._/-]+)|(?:[A-Za-z0-9][A-Za-z0-9._-]*\.md))$/;
    const READ_CTX = /readFileSync|readdirSync|createReadStream|copyFileSync|cpSync|existsSync|statSync|path\.join|\bread\s*\(|\bgit\s*\(/;
    const gateInputs = new Map();   // repo-relative path → suites that read it
    const noteInput = (p, who) => { if (!gateInputs.has(p)) gateInputs.set(p, new Set()); gateInputs.get(p).add(who); };
    const docLiterals = (src) => {
      const out = [];
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'));
      for (const line of code) {
        for (const m of line.matchAll(LIT)) {
          const w = WHOLE.exec(m[2]);
          if (!w) continue;
          if (!fs.existsSync(path.join(REPO, w[1]))) continue;
          out.push({ p: w[1], line, reads: READ_CTX.test(line) });
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
    const buildCmd = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8')).scripts.build || '';
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
      && namedBy('CLAUDE.md', 'test-readings-attribution')
      && namedBy('CHANGELOG.md', 'test-codex-effort-meta')
      && namedBy('docs/examples/hello-plugin', 'test-plugin-loader')
      && namedBy('docs/agent/msg-manual.md', 'test-agent-msg'),
      'the derivation finds the incident\'s own paths, attributed to the suites that read them');
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
      const docs = ['README.md', 'docs/sessions.md', 'docs/terminal.md', 'docs/screenshots/overview.png', 'docs/window-manager.md'];
      const dv = classifyWith(shipped, docs);
      ok(dv.every((v) => v === 'DOCS'), `real documentation is still documentation (${docs.join(', ')})`);
      ok(classifyWith(shipped, ['src/a.js', 'server.js', 'package.json']).every((v) => v === 'CODE'), 'and code is still code');
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
  {
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
  {
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
  {
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
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
