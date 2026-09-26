#!/usr/bin/env node
// THE RELEASE GATE'S OWN GATE (2026-09-07, B-4c5a — the fast/heavy split).
//
// The gate is now a machine with opinions: a tier table, a census, a detached
// background run, and a rule that BLOCKS a push based on git ancestry. Every
// one of those can be wrong in a way that is invisible (a census that cannot
// go red; a block rule that blocks forever; a hook that runs the two-minute
// tier before discovering it was going to refuse the push anyway; a detached
// child that inherits the hook's GIT_DIR and does `git worktree add` in
// somebody else's repository). So they are tested here, against REAL git
// history in throwaway repositories and against the REAL tracked hook file —
// never a mock of git and never a paraphrase of the hook.
//
// Sections: §1 census (+ negative controls) · §2 tier hygiene · §3 the block
// rule over real commits · §4 the hook's control flow end-to-end · §5 the git
// environment the detached child must NOT inherit (with the damage as the
// negative control) · §6 no FAST-tier suite claims a machine-global fixture,
// and every "no verdict" path says so up front and at the end (round 2) · §7 no
// literal date · §8 lanes / impact scope / full-tier clock (2026-09-15) · §9 the
// scratch-orphan reaper (2.369.104; lane H verify r1: candidacy is evidence,
// never a name — the agent-browser roots, the owned-shell control, `--reap`
// printing its victims, three mutant-copy controls).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SUITES, EXCLUDED, censusFindings, listSuiteFiles, heavyBlocker, machineGlobalFixtures, defaultLockPath, killedFromOutside, OUTSIDE_SIGNALS, scratchOrphans, SCRATCH_ROOT_RE, REAP_NAMES, reapReport, reapByHand, scratchRootsOf, ROOT_ENV, argvScratchRoots, PRODUCT_ROOT_RE } from './ci.mjs';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIT_ENV = gitEnvFrom(process.env);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const tmpDirs = [];
const mktmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-cigate-${tag}-`)); tmpDirs.push(d); return d; };
const git = (root, args, env = GIT_ENV) => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return (r.stdout || '').trim();
};

// A throwaway repository with REAL commits — the block rule is a statement
// about ancestry and there is no honest way to test it without one.
function makeRepo(tag) {
  const d = mktmp(tag);
  git(d, ['init', '-q', '-b', 'main']);
  git(d, ['config', 'user.email', 'gate@test.local']);
  git(d, ['config', 'user.name', 'gate test']);
  git(d, ['config', 'commit.gpgsign', 'false']);
  return d;
}
// `date` (optional) pins the COMMITTER date: the round-6 leg asserts which of
// several pushed shas is the newest, and commits made in the same second would
// make that a coin toss wearing a rule's clothes.
function commit(repo, file, body, msg, date) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), body);
  git(repo, ['add', '-f', file]);
  git(repo, ['commit', '-q', '-m', msg], date ? { ...GIT_ENV, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : GIT_ENV);
  return git(repo, ['rev-parse', 'HEAD']);
}
const writeMarker = (dir, sha, result, failed = [], partial = undefined, flaky = undefined) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sha}.${result}`), JSON.stringify({ sha, result, failed, partial, flaky, endedAt: Date.now(), ms: 1000, suites: 3 }));
};

try {
// ── §1 THE CENSUS ────────────────────────────────────────────────────────
console.log('\n§1 census');
{
  const disk = listSuiteFiles(REPO);
  const f = censusFindings(disk);
  ok(disk.length > 100, `${disk.length} scripts/test-*.mjs on disk (scope is non-vacuous)`);
  ok(!f.unclassified.length, `every suite is tiered or excluded (${f.unclassified.slice(0, 5).join(', ') || 'none missing'})`);
  ok(!f.ghosts.length && !f.inBoth.length && !f.duplicated.length && !f.badTier.length && !f.reasonless.length,
    'no ghosts / double listings / duplicates / bad tiers / reasonless entries');
  ok(f.counted.fast + f.counted.heavy + f.counted.excluded === f.counted.disk,
    `the three buckets EXACTLY partition the disk set (${f.counted.fast}+${f.counted.heavy}+${f.counted.excluded}=${f.counted.disk})`);
  // THIS suite must itself be in the census — a gate that forgets to gate
  // itself is the exact failure mode this file exists for.
  ok(SUITES.some((s) => s.name === 'test-ci-gate'), 'test-ci-gate is in a tier (the gate gates itself)');

  // NEGATIVE CONTROLS — an assert that cannot fail is not an assert.
  const nc1 = censusFindings([...disk, 'test-brand-new-and-unlisted']);
  ok(nc1.unclassified.includes('test-brand-new-and-unlisted'), 'NEG: a new unlisted suite is reported as unclassified');
  const nc2 = censusFindings(disk, [...SUITES, { name: 'test-not-on-disk', tier: 'heavy', why: 'chrome' }]);
  ok(nc2.ghosts.includes('test-not-on-disk'), 'NEG: a table entry with no file is reported as a ghost');
  const nc3 = censusFindings(disk, [...SUITES, { name: SUITES[0].name, tier: 'heavy', why: 'x' }]);
  ok(nc3.duplicated.includes(SUITES[0].name), 'NEG: a suite listed twice is reported');
  const nc4 = censusFindings(disk, [...SUITES.filter((s) => s.tier !== 'heavy'), { name: SUITES.find((s) => s.tier === 'heavy').name, tier: 'heavy' }]);
  ok(nc4.reasonless.length === 1, 'NEG: a heavy entry with no stated reason is reported');
  const nc5 = censusFindings(disk, SUITES, [...EXCLUDED, { name: SUITES[0].name, why: 'x' }]);
  ok(nc5.inBoth.includes(SUITES[0].name), 'NEG: a suite both tiered and excluded is reported');
}

// ── §2 TIER HYGIENE ──────────────────────────────────────────────────────
console.log('\n§2 tier hygiene');
{
  const fast = SUITES.filter((s) => s.tier === 'fast');
  const heavy = SUITES.filter((s) => s.tier === 'heavy');
  ok(fast.length >= 20 && heavy.length >= 20, `both tiers are real batteries (${fast.length} fast / ${heavy.length} heavy)`);
  ok(heavy.every((s) => /chrome|server|cli|binary|slow|adopted/.test(s.why || '')),
    'every heavy row names a category (chrome/server/cli/binary/slow/adopted)');
  ok(heavy.every((s) => /\d/.test(s.why || '')), 'every heavy row carries a measured number (tiering is a measurement, not an opinion)');
  // The documented exception: one real chat turn costs ~10s and real quota,
  // so by the rule it is heavy — it stays fast because it is the only proof in
  // the whole battery that a real turn works.
  ok(fast.some((s) => s.name === 'test-chat-e2e'), 'the ONE real haiku turn stays in the FAST tier (owner decision)');
  // A chrome suite in the fast tier would silently reintroduce the 70s+ cost
  // the split exists to remove.
  const chromeInFast = fast.filter((s) => /chrome/.test(s.why || ''));
  ok(!chromeInFast.length, `no chrome suite in the fast tier (${chromeInFast.map((s) => s.name).join(', ') || 'clean'})`);
  ok(EXCLUDED.every((e) => (e.why || '').length > 15), 'every EXCLUDED entry gives a real reason, not a shrug');

  // WIRING. A tier table nobody invokes is documentation. These pins live HERE
  // and not in test-architecture §43 on purpose: §43 runs inside `npm run
  // build`, and several browser suites build a PARTIAL COPY of the tree
  // (test-window-menu copies src+public+server.js+scripts onto a HEAD
  // checkout), so a build-time assert that reads package.json or .github fails
  // there for reasons unrelated to the code under test — measured, that pin
  // turned test-window-menu into a 300 s timeout.
  const read = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } };
  const hook = read('scripts/git-hooks/pre-push');
  const wf = read('.github/workflows/ci.yml');
  const pkg = read('package.json');
  ok(hook.includes('--check-heavy') && hook.includes('--heavy-launch'),
    'the tracked pre-push hook checks the heavy verdict AND launches the heavy tier');
  ok(hook.indexOf('--check-heavy') < hook.indexOf('node scripts/ci.mjs ||'),
    'the hook asks for the heavy verdict BEFORE it spends the fast tier');
  ok(/node scripts\/ci\.mjs\s*$/m.test(wf) && wf.includes('node scripts/ci.mjs --heavy'),
    'the Actions mirror runs BOTH tiers');
  ok(/"ci:heavy"\s*:/.test(pkg) && /"ci:status"\s*:/.test(pkg), 'package.json exposes ci:heavy + ci:status');
  // `npm run ci:heavy` is the command the block message tells a blocked
  // developer to run, so it has to be able to WRITE the marker that clears the
  // block. In place it can only do that on a clean tree; --isolate always can
  // (round 2: the manual path used to run 16 minutes and then refuse silently).
  ok(/"ci:heavy"\s*:\s*"[^"]*--isolate/.test(pkg), 'ci:heavy runs ISOLATED, so the recovery command always earns a marker');
  ok(read('.gitignore').includes('data/ci-heavy'), 'the marker directory is gitignored');
}

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
    // The exclusion is MEASURED, not assumed: if test-ci-gate ever really
    // reads a doc, the assert right here says so.
    const selfReads = docLiterals(fs.readFileSync(path.join(REPO, 'scripts', 'test-ci-gate.mjs'), 'utf-8')).filter((h) => h.reads);
    ok(!selfReads.length, `test-ci-gate itself reads no documentation, so excluding it from the scan is a measurement${selfReads.length ? ' — it reads ' + selfReads.map((h) => h.p).join(', ') : ''}`);
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
      if (name === 'test-ci-gate') continue;
      let src; try { src = fs.readFileSync(path.join(REPO, 'scripts', name + '.mjs'), 'utf-8'); } catch { continue; }
      for (const h of docLiterals(src)) {
        if (!h.p.includes('/') && !h.reads) continue;
        noteInput(h.p, name);
      }
    }
    // …plus the agent manuals, which are RUNTIME PRODUCT DATA: src/agent-routes.js
    // serves them from the running checkout (`GET /api/agent/docs/:topic`).
    const routes = fs.readFileSync(path.join(REPO, 'src', 'agent-routes.js'), 'utf-8');
    const topics = /const AGENT_DOC_TOPICS = \{([^}]*)\}/.exec(routes);
    const manuals = topics ? [...topics[1].matchAll(/'([^']+\.md)'/g)].map((m) => 'docs/agent/' + m[1]) : [];
    for (const p of manuals) if (fs.existsSync(path.join(REPO, p))) noteInput(p, 'src/agent-routes.js AGENT_DOC_TOPICS');
    ok(manuals.length >= 5 && manuals.includes('docs/agent/msg-manual.md'),
      `AGENT_DOC_TOPICS parsed out of src/agent-routes.js (${manuals.length} manuals — the parse is non-vacuous)`);

    const derived = [...gateInputs.keys()].sort();
    console.log(`     derived gate inputs (${derived.length}): ${derived.join(' ')}`);
    // NON-VACUITY: the derivation really did find the paths the incident named,
    // attributed to the suites that read them. A derivation that quietly stops
    // finding anything would make every assert below pass.
    const namedBy = (p, suite) => gateInputs.has(p) && gateInputs.get(p).has(suite);
    ok(namedBy('docs/kb-file-structure.md', 'test-codex-effort-meta')
      && namedBy('CLAUDE.md', 'test-opencode-serve')
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
    ok(Date.now() - t0 < 15000, `…UP FRONT, before the build and the suites (${Date.now() - t0}ms — the whole point)`);
    ok(!/npm run build/.test(rout), '…so it does not spend a build first');
    ok(/--isolate|ci:heavy/.test(rout), '…and the refusal names the way to get a real verdict');
    ok(!fs.readdirSync(mdir).length, '…and writes no marker');

    // The dirty tree only has to exist until the run CAPTURES it (heavyGate
    // reads `git status` once, at t=0, and announces it on the next line), so
    // the probe is removed as soon as the child says it saw one. That keeps the
    // repository dirty for ~200 ms instead of for the whole run — the window in
    // which killing this suite would strand the probe, dirty the tree, and cost
    // the next push its green marker. Belt and braces with the self-heal above:
    // shrink the hazard, then clean up after it anyway.
    const child = spawn(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--heavy', '--dirty-ok', '--markers=' + mdir, '--only=test-eml', '--lock=' + path.join(mdir, 'lock')],
      { cwd: REPO, env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let aout = '';
    child.stdout.on('data', (d) => { aout += d; });
    child.stderr.on('data', (d) => { aout += d; });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 600 && !/--dirty-ok: this tree is dirty/.test(aout); i++) await sleep(50);
    ok(/--dirty-ok: this tree is dirty/.test(aout), 'the run announces the dirty tree as soon as it captures it (so the probe can go)');
    rmProbe();
    const anyway = await new Promise((res) => child.on('exit', (code) => res({ status: code })));
    ok(/NO VERDICT will be written/i.test(aout), '--dirty-ok says NO VERDICT at the START of the run');
    ok(/NO VERDICT WRITTEN/.test(aout) && !/HEAVY GATE GREEN/.test(aout),
      '…and the closing line says NO VERDICT WRITTEN instead of "HEAVY GATE GREEN"');
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
  // controls below spell both shapes).
  const codeOnly = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l) && !/literal-date-ok:/.test(l)).join('\n');
  const files = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f) && f !== 'test-ci-gate.mjs');
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
  for (const [changedFile, suite] of [['src/conversation-index.js', 'test-conversation-index'], ['src/normalizers.js', 'test-session-brain-dark'], ['src/machine-probes.js', 'test-machine-probes'], ['src/routes/persistence.js', 'test-layout-history']]) {
    if (!realHeavy.some((s) => s.name === suite)) continue; // the row may leave the tier; the stub legs above pin the shapes
    const why = affectedSuites({ suites: realHeavy, changed: [changedFile], range: 'x..y' }).why.get(suite);
    ok(!!why && /^loads /.test(why), `${changedFile} selects ${suite} (${why || 'MISSED — the measured defect'})`);
  }
  const isProduct = (p) => p === 'server.js' || p.startsWith('src/') || p.startsWith('data/bin/');
  const inputless = (s, r) => { const { files, prefixes } = suiteInputs(s, { root: r }); return ![...files, ...prefixes].some(isProduct); };
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
  ok(/wt = addScratchWorktree\(sha, 'heavy'\);[\s\S]*?impact = affectedSuites\(\{ range, suites: all, root: runRoot, gitRoot: repo \}\);/.test(ciSrc)
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

// ── §9 THE SCRATCH-ORPHAN REAPER (2.369.104) — decided over a FAKE proc root ──
// 2026-09-16: 504 leaked vibespace-device daemons + 552 scratch node processes
// + 2,137 orphaned dtach clients (86 GB, load 15) — every worktree server a
// suite boots spawns a DETACHED device daemon the suite's teardown never sees.
// The rule is evidence-based (a scratch root under /tmp/vs-* AND either the dir
// is gone or every member is unowned and stale); each branch has a row here.
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
  mk(100, { name: 'vibespace-device', argv: ['vibespace-device'], ppid: 1, cwd: sGone, env: { HOME: sGone, VIBESPACE_AGENTD_ROOT: sGone + '/agentd-root' } });   // dir gone ⇒ reap
  mk(201, { name: 'node', argv: ['node', '/tmp/x/scripts/ci.mjs', '--heavy'], ppid: 1, cwd: sLive, born: OLD });   // a gate RUNNER in its own isolated worktree: never a candidate
  mk(200, { name: 'node', argv: ['node', 'server.js'], ppid: 201, cwd: sLive, born: OLD });                       // its suite's server ⇒ owned ⇒ keep
  mk(202, { name: 'vibespace-device', argv: ['vibespace-device'], ppid: 1, cwd: sLive, env: { HOME: sLive }, born: OLD });   // that server's detached daemon: same root, group has a live member ⇒ keep
  mk(300, { name: 'node', argv: ['node', 'server.js'], ppid: 1, cwd: sOld, born: OLD });                          // dir exists, reparented, 30 min ⇒ reap
  mk(310, { name: 'node', argv: ['node', 'wrapper.js'], ppid: 300, cwd: sOld, born: OLD });                       // child of an orphan (depth 2) ⇒ reap with it
  mk(301, { name: 'node', argv: ['node', 'server.js'], ppid: 1, cwd: sYoung });                                   // reparented but YOUNG ⇒ may be a run in flight ⇒ keep
  const prodCwd = path.join(os.homedir(), 'workspace', 'vibespace');   // a checkout under the home dir — NOT `REPO`, which is itself a /tmp/vs-* scratch worktree when this suite runs inside one (an integration worktree, the isolated heavy tier)
  mk(400, { name: 'node', argv: ['node', 'server.js'], ppid: 1, cwd: prodCwd, env: { HOME: os.homedir() }, born: OLD });   // PRODUCTION shape: no scratch root ⇒ never a candidate
  mk(500, { name: 'dtach', argv: ['dtach', '-a', sGone + '/data/sockets/cw-1'], ppid: 1, cwd: '/', env: { HOME: sGone }, born: OLD });   // orphan attach client, root via HOME ⇒ reap
  // LANE H VERIFY r1 (2026-09-25): CANDIDACY IS EVIDENCE, NEVER A NAME. The field: two leaked
  // `agent-browser-linux-x64` daemons (ppid systemd --user, cwd a checkout, AGENT_BROWSER_SOCKET_DIR
  // under a GONE /tmp/vs-browser-live-*) and a `headless_shell` were dropped by a name gate that ran
  // BEFORE the roots were read, while `--reap` said "no scratch orphans" (1045 daemons/Chromes, 47 GB).
  const sGone2 = `/tmp/vs-cigate9-gone2-${process.pid}-nowhere`, sGone3 = `/tmp/vs-cigate9-gone3-${process.pid}-nowhere`, sGone4 = `/tmp/vs-cigate9-gone4-${process.pid}-nowhere`;
  mk(601, { name: 'sleep', argv: ['sleep', '3600'], ppid: 1, cwd: sGone, born: OLD });                            // an unlisted name, orphaned under a GONE root ⇒ reap (evidence, whatever the name)
  mk(700, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: sGone });   // the leaked daemon, rooted by its cwd ⇒ reap
  mk(701, { name: 'headless_shell', argv: ['/opt/chrome/headless_shell', '--headless', `--user-data-dir=${sGone2}/prof`, '--no-sandbox'], ppid: 1, cwd: '/' });   // a Chrome: cwd `/`, its ONLY root the --user-data-dir ⇒ reap
  mk(702, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: prodCwd, env: { HOME: os.homedir(), AGENT_BROWSER_SOCKET_DIR: sGone3 + '/sock', AGENT_BROWSER_PROFILE: sGone3 + '/prof', AGENT_BROWSER_CONFIG: sGone3 + '/cfg.json' } });   // the FIELD shape: cwd a checkout, only the env roots ⇒ reap
  mk(703, { name: 'chrome', argv: ['/opt/chrome/chrome', '--type=renderer'], ppid: 701, cwd: '/', env: { AGENT_BROWSER_SOCKET_DIR: sGone2 + '/sock' } });   // a Chrome child: walks up through its fellow member to init ⇒ reap
  // THE OWNED-SHELL CONTROL (the pin that used to say "an unlisted executable is never a candidate
  // even under a gone scratch root", flipped): a user's shell whose cwd is a deleted scratch dir,
  // parented by a LIVE terminal outside the group, is owned by somebody alive ⇒ never listed.
  mk(610, { name: 'gnome-terminal-server', argv: ['/usr/libexec/gnome-terminal-server'], ppid: 1, cwd: os.homedir(), env: { HOME: os.homedir() } });
  mk(600, { name: 'zsh', argv: ['zsh'], ppid: 610, cwd: sGone4, env: { HOME: os.homedir() }, born: OLD });
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
  ok(!pids.includes(400), 'the production server (cwd in a checkout, HOME the real home) is never a candidate');
  ok(pids.includes(601) && !REAP_NAMES.has('sleep') && !REAP_NAMES.has('agent-browser-linux-x64'), 'an unlisted executable IS a candidate under a gone scratch root when nobody alive owns it (the name is not evidence; the root and the ownership are)');
  const spared = scratchOrphans({ procRoot: root, now: NOW, self: 999999, staleMs: 24 * 3600 * 1000 });
  ok(!spared.some((o) => o.pid === 300) && spared.some((o) => o.pid === 100), 'the stale floor is a parameter: a wider floor spares the reparented tree, the gone-dir rule still fires');
  const asSelf = scratchOrphans({ procRoot: root, now: NOW, self: 310 });
  ok(!asSelf.some((o) => o.pid === 310 || o.pid === 300), 'this process and its ancestors are never candidates (a reaper does not reap itself)');
  const wired = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  ok(/const ms = Date\.now\(\) - t;\n\s*try \{ reapScratchOrphans\(\{\}\); \}/.test(wired), 'WIRING: every suite run of the SYNC runner (the fast tier) is followed by a sweep');
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
  ok(/export function reapScratchOrphans\([^)]*\) \{\n\s*const list = scratchOrphans\(opts\);\n\s*if \(!list\.length\) return list;\n\s*for \(const line of reapReport\(list\)\) log\(line\);/.test(wired) && /export async function reapScratchOrphansAsync\([^)]*\) \{\n\s*const list = scratchOrphans\(opts\);\n\s*if \(!list\.length\) return list;\n\s*for \(const line of reapReport\(list\)\) log\(line\);/.test(wired), 'WIRING: BOTH reapers (sync + the lanes\' async twin) print the per-pid report before the first SIGTERM');
  // `--reap` BY HAND PRINTS EVERY VICTIM (lane H verify r1): the operator sees what it killed. Driven over a
  // fake proc root whose ONE victim is a real process this suite started (never anything else on the box):
  // a detached `sleep` (reparented, so its reaper is init, not us), named as the field daemon.
  const victim = Number(spawnSync('bash', ['-c', 'sleep 120 >/dev/null 2>&1 & echo $!'], { encoding: 'utf-8' }).stdout.trim());
  const root2 = mktmp('procroot-reap');
  const mk2 = (pid, { name, argv, ppid, cwd, env = {} }) => { const d = path.join(root2, String(pid)); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'stat'), `${pid} (${name.slice(0, 15)}) S ${ppid} ${pid} ${pid} 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0 0`); fs.writeFileSync(path.join(d, 'cmdline'), (argv || [name]).join('\0') + '\0'); fs.writeFileSync(path.join(d, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0'); fs.symlinkSync(cwd, path.join(d, 'cwd')); };
  mk2(1, { name: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 0, cwd: '/' });
  if (Number.isInteger(victim) && victim > 1) {
    mk2(victim, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: prodCwd, env: { AGENT_BROWSER_SOCKET_DIR: sGone3 + '/sock' } });
    const dryLines = []; reapByHand({ dryRun: true, procRoot: root2, self: 999999, log: (m) => dryLines.push(m) });
    const aliveNow = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
    ok(dryLines.some((l) => l.includes(`pid ${victim} (ppid 1) agent-browser-linux-x64: /opt/ab/bin/agent-browser-linux-x64 — root ${sGone3} — scratch dir gone`)) && /--dry-run: 1 process\(es\) listed above, none signalled/.test(dryLines[dryLines.length - 1]) && aliveNow(victim), '`--reap --dry-run` prints the per-pid report and signals nothing (the victim still runs)', dryLines);
    const lines = []; reapByHand({ procRoot: root2, self: 999999, log: (m) => lines.push(m), graceMs: 2000 });
    let dead = false; for (let i = 0; i < 40 && !(dead = !aliveNow(victim)); i++) spawnSync('sleep', ['0.05']);
    ok(/^\[ci\] reaping 1 scratch orphan process\(es\) from 1 finished scratch dir\(s\)/.test(lines[0] || '') && lines.some((l) => l.includes(`pid ${victim} (ppid 1) agent-browser-linux-x64`) && l.includes('scratch dir gone')) && /^\[ci\] reaped 1 of 1 scratch orphan process\(es\)$/.test(lines[lines.length - 1] || '') && dead, `\`--reap\` BY HAND names every pid it kills (head + one line per victim, before the first SIGTERM) and closes with the count — the victim is gone`, lines);
    try { process.kill(victim, 'SIGKILL'); } catch { }
  } else ok(false, `could not start the reap leg's own victim process (got ${JSON.stringify(victim)})`);
  ok(/if \(arg\('reap'\)\) \{ process\.exit\(reapByHand\(\{ dryRun: !!arg\('dry-run'\) \}\)\); \}/.test(wired) && /export function reapByHand\([^)]*\) \{[\s\S]{0,400}for \(const line of reapReport\(list\)\) log\(line\);[\s\S]{0,200}const list = reapScratchOrphans\(\{ log, \.\.\.opts \}\);/.test(wired), 'WIRING: `--reap` goes through reapByHand — the report printed through the operator\'s log on both paths, `--dry-run` signalling nothing');
  // NEGATIVE CONTROLS (scripts/mutant-copy.mjs, each copy ONE edit, loaded beside the real modules): the legs above can go red.
  const M9 = mutantCopies('cigate9-reaper', REPO);
  const src9 = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8');
  const mutant9 = async (tag, from, to) => { if (!src9.includes(from)) return { missing: from }; const f = M9.write('scripts/ci.mjs', src9.replace(from, to), tag); return import(pathToFileURL(f).href); };
  const pidsOf = (mod) => (mod && mod.scratchOrphans ? mod.scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).map((o) => o.pid).sort((a, b) => a - b) : null);
  const cA = await mutant9('name-gate', "const root = scratchRootsOf(i)[0]; if (!root) continue;", "if (!reapNamed(i.a0)) continue; const root = scratchRootsOf(i)[0]; if (!root) continue;");
  const pA = pidsOf(cA);
  ok(pA && !pA.includes(700) && !pA.includes(701) && !pA.includes(702) && !pA.includes(601) && pA.includes(100), `CONTROL (a): the pre-fix NAME GATE before the evidence (a copy) drops the agent-browser daemons, the headless_shell and the unlisted orphan — exactly the field leak (got ${JSON.stringify(pA || cA)})`);
  const cB = await mutant9('old-roots', "export const ROOT_ENV = ['HOME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT', 'AGENT_BROWSER_SOCKET_DIR', 'AGENT_BROWSER_PROFILE', 'AGENT_BROWSER_CONFIG'];", "export const ROOT_ENV = ['HOME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT'];");
  const pB = pidsOf(cB);
  ok(pB && !pB.includes(702) && pB.includes(700), `CONTROL (b): a copy whose roots are the pre-fix four (cwd/HOME/device/agentd) never sees the field daemon rooted only by AGENT_BROWSER_SOCKET_DIR (got ${JSON.stringify(pB || cB)})`);
  // (verify r2: the flag is ALSO read off the joined cmdline now — this control drops BOTH readings, one copy)
  const uddNul = "if (a.startsWith('--user-data-dir=')) cands.push(a.slice('--user-data-dir='.length));", uddJoined = "  if (joined) for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push(m[1]);\n";
  // (2.369.180, lanes N + H integrated: lane N's argv roots are a THIRD reading of the same flag — `--user-data-dir=<scratch>`
  // is a `<flag>=` element — so the copy drops that line too; without it the control proves nothing)
  const argvRootsLine = "  cands.push(...argvScratchRoots(argv, { joined })); // lane N: a root named only in the arguments (dtach / pty-wrapper)\n";
  const cU = src9.includes(uddNul) && src9.includes(uddJoined) && src9.includes(argvRootsLine) ? await import(pathToFileURL(M9.write('scripts/ci.mjs', src9.replace(uddNul, 'if (false) cands.push(a);').replace(uddJoined, '').replace(argvRootsLine, ''), 'no-udd')).href) : { missing: 'a --user-data-dir reading line' };
  const pU = pidsOf(cU);
  ok(pU && !pU.includes(701) && pU.includes(700), `CONTROL (c): a copy that ignores --user-data-dir never sees the headless_shell whose cwd is / (got ${JSON.stringify(pU || cU)})`);
  const cO = await mutant9('gone-lists-all', 'victims = members.filter(orphaned);', 'victims = members;');
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
    mk3(801, { name: 'agent-browser-linux-x64', argv: ['/opt/ab/bin/agent-browser-linux-x64'], ppid: 1, cwd: prodCwd, env: { HOME: os.homedir(), AGENT_BROWSER_SOCKET_DIR: PROD_AB } });
    mk3(802, { name: 'chrome', argv: ['/opt/google/chrome/chrome', '--headless=new', '--user-data-dir=/tmp/agent-browser-chrome-0000'], ppid: 801, cwd: prodCwd, env: { HOME: os.homedir(), AGENT_BROWSER_SOCKET_DIR: PROD_AB } });
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
    const cE = await mutant9('admits-vs-ab', 'if (m && !PRODUCT_ROOT_RE.test(m[0]) && !out.includes(m[0])) out.push(m[0]);', 'if (m && !out.includes(m[0])) out.push(m[0]);');
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
    const cJ = await mutant9('joined-always', "  if (joined) for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push(m[1]);", "  for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push(m[1]);");
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
// process whose argv[0] is Xtigervnc under a removed scratch dir is LISTED (scratchOrphans signals nothing).
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
  mk(740, { name: 'Xtigervnc', argv: XARGV(':7', 5901), ppid: 1, cwd: path.join(os.homedir(), 'workspace', 'vibespace'), env: { HOME: os.homedir() }, born: OLD }); // PRODUCTION's singleton: no scratch root ⇒ never
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
  // started on a display), reparented through a short-lived parent, rooted in a scratch dir that is then removed
  const dry = sc('dry');
  const kid = spawnSync(process.execPath, ['-e', "const c = require('child_process').spawn('sleep', ['60'], { argv0: 'Xtigervnc', cwd: process.argv[1], detached: true, stdio: 'ignore' }); c.unref(); console.log(c.pid);", dry], { encoding: 'utf8', timeout: 10000 });
  const dpid = Number(String(kid.stdout || '').trim());
  try {
    const argv0 = (() => { try { return fs.readFileSync(`/proc/${dpid}/cmdline`, 'utf8').split('\0')[0]; } catch { return null; } })();
    fs.rmSync(dry, { recursive: true, force: true });
    const listed = scratchOrphans({}).find((o) => o.pid === dpid);
    ok(dpid > 0 && argv0 === 'Xtigervnc' && !!listed && listed.name === 'Xtigervnc' && listed.why === 'scratch dir gone' && listed.root === dry,
      `DRY RUN on the real /proc: the reparented "Xtigervnc" (pid ${dpid}) under the removed ${dry} is listed — ${listed ? listed.why : 'NOT listed'} (nothing signalled)`);
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
  const NOW = Date.now(), OLD = NOW - 30 * 60 * 1000, REALHOME = os.homedir();
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
  const preFix = ciSrc.replace('  cands.push(...argvScratchRoots(argv, { joined })); // lane N: a root named only in the arguments (dtach / pty-wrapper)\n', ''); // scratchRootsOf without the argv roots (2.369.180: lane H's function carries them)
  ok(preFix !== ciSrc, 'CONTROL: the patched copy really drops the argv roots from the candidate roots');
  const pre = await import(M.write('scripts/ci.mjs', preFix, 'no-argv-roots', { esm: true }));
  const prePids = pre.scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).map((o) => o.pid);
  ok(!prePids.includes(800) && !prePids.includes(810), `CONTROL: without the argv roots the leaked dtach + pty-wrapper are never candidates (pre-fix listed ${JSON.stringify(prePids)})`);
  // CONTROL: without the product-root exclusion the production Chrome row IS listed (so the row above proves the exclusion)
  const noExcl = ciSrc.replace('if (!PRODUCT_ROOT_RE.test(r) && !out.includes(r))', 'if (!out.includes(r))').replace('if (m && !PRODUCT_ROOT_RE.test(m[0]) && !out.includes(m[0])) out.push(m[0]);', 'if (m && !out.includes(m[0])) out.push(m[0]);');
  ok(noExcl.split('PRODUCT_ROOT_RE.test(').length === ciSrc.split('PRODUCT_ROOT_RE.test(').length - 2, 'CONTROL: the second patched copy really drops BOTH /tmp/vs-ab-<uid> exclusions (argv roots + the candidate roots)');
  const ne = await import(M.write('scripts/ci.mjs', noExcl, 'no-product-root', { esm: true }));
  ok(ne.scratchOrphans({ procRoot: root, now: NOW, self: 999999 }).some((o) => o.pid === 830), 'CONTROL: without the exclusion the production Chrome under /tmp/vs-ab-<uid> would be reaped');
}

} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
