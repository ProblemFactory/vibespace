// scripts/ci-gate-kit.mjs — THE RELEASE GATE'S OWN GATE, the kit its parts share (lane fast-tier-ratchet, 2026-10-20).
//
// scripts/test-ci-gate.mjs ran its twenty sections in ONE process: 37 s alone on this box (its row said 7.8 s) — over THE
// TIER RULE's 10 s for a fast row, and a LAW row (architecture) stays in the fast tier whatever it costs. Its sections were
// already independent blocks, so they are now SEVEN suites of ≤ 10 s each (test-ci-gate, -push, -tiers, -shards, -reaper,
// -hang, -watchdog), every section's text unchanged; what they share lives here, MOVED VERBATIM from its head: the assert
// counter, the scratch dirs, a REAL git repository + commit, the stub gate repository, a marker writer — and, since B-e381 r6
// (an eighth part, test-ci-gate-hook-env), the pre-push hook rig test-ci-gate-push §4 built. One process per
// part ⇒ this module's counter is that part's own, and `report()` is its verdict line.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitEnvFrom } from './git-env.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GIT_ENV = gitEnvFrom(process.env);
let pass = 0, fail = 0;
export const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
export const tmpDirs = [];
// B-7f97: the kit's dirs are minted where scripts/scratch.mjs mints its roots (fixture-guard's TMP_ROOTS[0], /tmp), NEVER under
// os.tmpdir(): a test machine that gives each suite a private TMPDIR (/tmp/vt-XXXXXX) moved them out of the /tmp/vs-* shape the
// reaper legs judge (test-ci-gate-reaper §9) — three legs went red on the machine's temp setting, not on the tree
const SCRATCH_TMP = createRequire(import.meta.url)('../src/fixture-guard.js').TMP_ROOTS[0];
export const mktmp = (tag) => { const d = fs.mkdtempSync(path.join(SCRATCH_TMP, `vs-cigate-${tag}-`)); tmpDirs.push(d); return d; };
export const git = (root, args, env = GIT_ENV) => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return (r.stdout || '').trim();
};

// A throwaway repository with REAL commits — the block rule is a statement
// about ancestry and there is no honest way to test it without one.
export function makeRepo(tag) {
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
export function commit(repo, file, body, msg, date) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), body);
  git(repo, ['add', '-f', file]);
  git(repo, ['commit', '-q', '-m', msg], date ? { ...GIT_ENV, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : GIT_ENV);
  return git(repo, ['rev-parse', 'HEAD']);
}
// A STUB GATE REPOSITORY (B-f4cb, 2026-09-27; the shape test-ci-heavy-launch
// drives its A/Bs in): scripts/ci.mjs is the REAL module, the build is
// `node -e 0`, and the one suite is a stub under a name the table puts in the
// HEAVY tier — so `--only=` accepts it and a run costs well under a second
// instead of a real build + a real suite. The name is asserted to be heavy, so
// a table change cannot quietly turn these legs into something else.
export const STUB_SLICE = 'test-eml';
export function stubGateRepo(tag) {
  const root = mktmp('stub-' + tag);
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'scripts', 'ci.mjs'), path.join(root, 'scripts', 'ci.mjs'));
  fs.copyFileSync(path.join(REPO, 'scripts', 'git-env.mjs'), path.join(root, 'scripts', 'git-env.mjs'));
  fs.copyFileSync(path.join(REPO, 'scripts', 'scratch-run.mjs'), path.join(root, 'scripts', 'scratch-run.mjs')); // ci.mjs's other sibling (B-1d08: the run record its reaper reads)
  // B-60d2: the directory sweep (scratch-sweep.mjs) and the unit declarations it reads (scratch.mjs ← src/fixture-guard.js)
  // lane affected-heavy-deps: the shared tables' rules (affected-model.mjs ← i18n-extract.mjs's one dictionary parser)
  // lane affected-static-reach: the static reach (reach-model.mjs, PURE)
  // lane ci-hang-report: the deadline's ask + the digest (hang-report.mjs)
  for (const f of ['scripts/scratch-sweep.mjs', 'scripts/scratch.mjs', 'src/fixture-guard.js', 'src/temp-sweepers.js', 'src/mount-path-class.js', 'scripts/affected-model.mjs', 'scripts/i18n-extract.mjs', 'scripts/reach-model.mjs', 'scripts/hang-report.mjs']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(root, f)); }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.0', private: true, scripts: { build: 'node -e "0"' } }) + '\n');
  fs.writeFileSync(path.join(root, 'scripts', STUB_SLICE + '.mjs'), "console.log('ALL PASS (1)');\n");
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'gate@test.local']);
  git(root, ['config', 'user.name', 'gate test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'stub gate']);
  return { root, sha: git(root, ['rev-parse', 'HEAD']) };
}
export const writeMarker = (dir, sha, result, failed = [], partial = undefined, flaky = undefined) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sha}.${result}`), JSON.stringify({ sha, result, failed, partial, flaky, endedAt: Date.now(), ms: 1000, suites: 3 }));
};

// THE PRE-PUSH HOOK RIG — test-ci-gate-push §4's fixture, MOVED here (B-e381 r6, 主开发 r1063: the hook's own-env legs
// are their own suite, test-ci-gate-hook-env, over the same rig): a real repository whose scripts/ci.mjs is a STUB recording
// every call (its mode, flags, PATH and env names) in calls.ndjson and answering --check-heavy with the REAL heavyBlocker, the
// REAL hook and secret scan copied in, the tiers' private node folder (B-e381) in this run's scratch. runHookRefs(stdin, env,
// hook) drives the hook (or a pre-fix copy) with a push's stdin; preFixHook(tag, ...edits) writes a copy of the REAL hook.
// Its one change in the move: the stub imports the real ci.mjs (1.3 MB) only for --check-heavy — its fast and heavy-launch
// calls never read it, and each hook run made both (~70 ms a run, the suites drive it ~50 times).
export function hookRig(tag) {
  const repo = makeRepo(tag);
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'data', 'ci-heavy'), { recursive: true });
  const realCi = path.join(REPO, 'scripts', 'ci.mjs').replace(/\\/g, '/');
  fs.writeFileSync(path.join(repo, 'scripts', 'ci.mjs'), `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const repo = ${JSON.stringify(repo)};
const dir = path.join(repo, 'data', 'ci-heavy');
const argv = process.argv.slice(2);
const KNOWN = ['keep-going'];   // B-6e71: the real ci.mjs's CI_FLAGS row the hook greps for before it passes the flag
const note = (o) => fs.appendFileSync(path.join(repo, 'calls.ndjson'), JSON.stringify(o) + '\\n');
const headArg = (argv.find((a) => a.startsWith('--head=')) || '').slice(7) || null;
if (argv.includes('--check-heavy')) {
  note({ mode: 'check-heavy', head: headArg });
  const { heavyBlocker } = await import(${JSON.stringify(realCi)});   // B-e381 r6: read only here — the fast and heavy-launch calls never need the 1.3 MB module
  const b = heavyBlocker({ dir, repoRoot: repo, head: headArg || undefined });
  if (b) { console.error('PUSH BLOCKED failed: ' + (b.failed || []).join(', ')); process.exit(1); }
  process.exit(0);
}
const li = argv.indexOf('--heavy-launch');
if (li >= 0) { note({ mode: 'heavy-launch', sha: argv[li + 1], range: (argv.find((a) => a.startsWith('--range=')) || '').slice(8), path: process.env.PATH, keys: Object.keys(process.env).sort() }); process.exit(0); }
note({ mode: 'fast', isolate: argv.includes('--isolate'), keepGoing: argv.includes('--keep-going'), sha: (argv.find((a) => a.startsWith('--sha=')) || '').slice(6) || null, path: process.env.PATH, keys: Object.keys(process.env).sort() });
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
  const hookNodeDir = path.join(mktmp('e381-hook-node'), 'root');
  const runHookRefs = (stdin, env = {}, hook = path.join(repo, 'pre-push')) => {
    try { fs.unlinkSync(path.join(repo, 'calls.ndjson')); } catch {}
    const r = spawnSync('bash', [hook, 'origin', 'git@example.invalid:x/y.git'], {
      cwd: repo, input: stdin, encoding: 'utf-8', env: { ...GIT_ENV, VIBESPACE_HOOK_NODE_DIR: hookNodeDir, ...env },   // B-e381: the tiers' node folder in this run's scratch, never the machine's
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
  const runHook = (localSha, remoteSha = ZERO, env = {}) =>
    runHookRefs(`refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`, env);
  return { repo, ZERO, calls, hookNodeDir, runHookRefs, runHook, hookSrc, preFixHook };
}

/** the part's verdict line and exit code (the giant's last two lines) */
export function report() {
  console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}
