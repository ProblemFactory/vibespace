// scripts/ci-gate-kit.mjs — THE RELEASE GATE'S OWN GATE, the kit its parts share (lane fast-tier-ratchet, 2026-10-20).
//
// scripts/test-ci-gate.mjs ran its twenty sections in ONE process: 37 s alone on this box (its row said 7.8 s) — over THE
// TIER RULE's 10 s for a fast row, and a LAW row (architecture) stays in the fast tier whatever it costs. Its sections were
// already independent blocks, so they are now SEVEN suites of ≤ 10 s each (test-ci-gate, -push, -tiers, -shards, -reaper,
// -hang, -watchdog), every section's text unchanged; what they share lives here, MOVED VERBATIM from its head: the assert
// counter, the scratch dirs, a REAL git repository + commit, the stub gate repository, a marker writer. One process per
// part ⇒ this module's counter is that part's own, and `report()` is its verdict line.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitEnvFrom } from './git-env.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GIT_ENV = gitEnvFrom(process.env);
let pass = 0, fail = 0;
export const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
export const tmpDirs = [];
export const mktmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-cigate-${tag}-`)); tmpDirs.push(d); return d; };
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
  for (const f of ['scripts/scratch-sweep.mjs', 'scripts/scratch.mjs', 'src/fixture-guard.js', 'scripts/affected-model.mjs', 'scripts/i18n-extract.mjs', 'scripts/reach-model.mjs', 'scripts/hang-report.mjs']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(root, f)); }
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

/** the part's verdict line and exit code (the giant's last two lines) */
export function report() {
  console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}
