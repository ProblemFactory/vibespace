#!/usr/bin/env node
// THE MIRROR VERDICT (B-e381, lane ci-heavy-verdict r4, 2026-11-10). The CI mirror runs the HOSTED half of the heavy tier (ci.yml:
// `--host=hosted --shard i/n`, n read from the workflow); the self-hosted half runs on the box. `ci.mjs --heavy-verdict <sha> --gh-run <id>` writes the mirror's
// verified run as `<sha>.mirror.green` LISTING the hosted heavy suites of the commit's own plan, and heavyBlocker clears a red only when
// every suite that failed in it has since run green on a descendant (主开发's law). Every refusal writes NOTHING.
//   §1 THE JUDGE (pure) — every condition refused by name; every job of a needed name; a paged job list refused.
//   §2 THE WRITER — a real repository; the marker lists the hosted half (never «full»); the markers path, a symlink at the marker path,
//      the list read from the COMMIT (the skip-worktree move; a commit whose ci.mjs is not the running one); every refusal leaves
//      the marker dir EMPTY, and no directory behind.
//   §3 THE READER — the real ghApiJson against fake `gh` binaries (absent, 403, unauthenticated, a timeout); one call, no retry.
//   §4 THE UNION — the measured pair (a self-hosted failure is NOT cleared by a mirror verdict, IS cleared once a self-hosted green of
//      that suite exists on a descendant); production's 109-failure red; a FULL green alone; nothing clears on the red's own sha.
//   §4b LAW A — a marker that cannot be read as a record of its kind never opens the gate: nine broken forms × .green / .mirror.green /
//      .red, a string `failed`, the guard's answer to a throw (BLOCKED), no directory / an empty one (CLEAR).
//   §4c LAW B — a FULL green clears every red whatever its `absent`; a LIST-scoped green's `absent` covers nothing (slice / affected /
//      mirror), a non-list one fails closed; a green on a SIBLING branch counts for nothing (real git).
//   §4d pruning — by COMMITS: every file of a commit inside the window stays; an old unreadable file goes with its commit.
//   §4e the other readers see what the gate sees — the writer's refusal (nine broken forms × red / green), «already green», --status.
//   §5 NEGATIVE CONTROLS — a mutant without the per-job check; a mutant writer of r1's shape (a FULL `<sha>.green`) clears what it
//      must not; the shape-check line deleted (null / {} / [] greens fail §4b's legs BY NAME — never a crash; a reader that throws
//      fails the leg that asked); the guard's catch turned back to «not blocking»; the writer's refusal asked of readable markers only.
//   §6 THE CLI — known flags; refusals exit 3 and write nothing (a bad run id, `--markers <dir>` in the space form); one call site;
//      --check-heavy names an unreadable red, BLOCKS on a marker path it cannot read, is CLEAR with no directory.
//   §7 PARITY — production's 30 markers (shapes, scripts/fixtures/ci-heavy-markers-prod-2026-11-10.json): the union reader and the reader
//      it replaced agree on EVERY HEAD of that history (both run with ONE ancestry oracle in place of git; their decision code is real).
//   §8 nothing left behind — every scratch dir removed, no child alive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { judgeMirrorRun, heavyVerdict, ghApiJson, workflowShardsAt, repoSlugOf, hostedHeavyNamesAt, heavyBlocker, checkHeavy, pruneMarkers, markerShapeWhy, existingVerdictOf, heavyAlreadyGreen, hostPlan, SUITES, MIRROR_WORKFLOW } from './ci.mjs';
import { REPO, ok, git, writeMarker, report } from './ci-gate-kit.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `vs-civerdict-${process.pid}-`));   // EVERY scratch path of this run lives here (§8)
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });   // even when a leg throws (r4)
let seq = 0;
const scratch = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const makeRepo = (tag) => { const d = scratch(tag); git(d, ['init', '-q', '-b', 'main']); git(d, ['config', 'user.email', 'gate@test.local']); git(d, ['config', 'user.name', 'gate test']); git(d, ['config', 'commit.gpgsign', 'false']); return d; };
const commit = (repo, file, body, msg) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), body); git(repo, ['add', '-f', file]); git(repo, ['commit', '-q', '-m', msg]); return git(repo, ['rev-parse', 'HEAD']); };
const SLEEP_TAG = `5.${String(process.pid).padStart(6, '0')}`;   // the fake gh's sleep, findable in /proc

const SLUG = 'ProblemFactory/vibespace';
const WF = fs.readFileSync(path.join(REPO, MIRROR_WORKFLOW), 'utf-8');
const SH = workflowShardsAt(WF);
const SHA = 'a'.repeat(40);
const HOSTED = ['test-hosted-a', 'test-hosted-b'];
const runOf = (over = {}) => ({ id: 42745258349, run_attempt: 1, name: 'ci', path: MIRROR_WORKFLOW, event: 'push', head_branch: 'ci/cut388', head_sha: SHA,
  status: 'completed', conclusion: 'success', run_started_at: '2026-11-10T02:52:00Z', repository: { full_name: SLUG }, head_repository: { full_name: SLUG }, ...over });
const jobsOf = (n = SH ? SH.n : 6, over = {}) => ['fast', ...Array.from({ length: n }, (_, k) => `heavy ${k + 1}/${n}`), 'heavy']
  .map((name) => ({ name, status: 'completed', conclusion: over[name] === undefined ? 'success' : over[name] }))
  .filter((j) => j.conclusion !== null);
const judge = (o = {}) => judgeMirrorRun({ sha: SHA, slug: SLUG, run: runOf(o.run), jobs: o.jobs || jobsOf(), totalJobs: o.total, workflow: o.workflow || WF });
const refused = (v, re) => !v.ok && re.test(v.why || '');

console.log('§1 THE JUDGE — every condition, every refusal by name');
ok(!!SH && SH.n >= 1, `the workflow in this tree defines a readable heavy matrix (${SH ? SH.n : '?'} shards)`);
{ const v = judge(); ok(v.ok && v.jobs.length === (SH ? SH.n : 0) + 2 && v.jobs[0] === 'fast' && v.jobs[v.jobs.length - 1] === 'heavy', `a green push run of the ci workflow on exactly the sha is ACCEPTED (${(v.jobs || []).join(', ')})`); }
ok(refused(judge({ run: { repository: { full_name: 'someone/vibespace' } } }), /belongs to someone\/vibespace, not ProblemFactory\/vibespace/), 'another repository\'s run is refused BY NAME');
ok(refused(judge({ run: { head_repository: { full_name: 'forker/vibespace' } } }), /head is forker\/vibespace \(a fork\)/), 'a fork\'s run is refused BY NAME');
ok(refused(judge({ run: { path: '.github/workflows/secret-scan.yml' } }), /workflow \.github\/workflows\/secret-scan\.yml, not \.github\/workflows\/ci\.yml/), 'another workflow is refused by its PATH');
ok(refused(judge({ run: { name: 'ci', path: '.github/workflows/other.yml' } }), /not \.github\/workflows\/ci\.yml/), '…a workflow merely NAMED ci at another path is refused too');
ok(refused(judge({ run: { event: 'pull_request' } }), /event is pull_request, not a push/), 'a pull_request run is refused');
ok(refused(judge({ run: { head_sha: 'a'.repeat(39) + 'b' } }), /headSha a{39}b is not a{40}/), 'a headSha one character off is refused (byte for byte)');
ok(refused(judgeMirrorRun({ sha: 'a'.repeat(9), slug: SLUG, run: runOf(), jobs: jobsOf(), workflow: WF }), /must be 40 hex/), 'an abbreviated sha is refused by the judge');
ok(refused(judge({ run: { status: 'in_progress', conclusion: null } }), /is in_progress, not completed/), 'a run in progress is refused');
ok(refused(judge({ run: { conclusion: 'failure' } }), /conclusion is failure, not success/), 'a failed run is refused');
ok(refused(judge({ run: { conclusion: 'cancelled' } }), /conclusion is cancelled/), 'a cancelled run is refused');
const N = SH ? SH.n : 6, hj = (k) => `heavy ${k}/${N}`;   // the shard jobs' names follow the tree's own matrix (int397: six → seven)
const ONE_FAILED = { jobs: jobsOf(undefined, { [hj(3)]: 'failure' }) };   // the run says success, the job list does not: only the per-job check sees it
ok(refused(judge(ONE_FAILED), new RegExp(`«heavy 3/${N}» is failure, not success`)), 'ONE failed heavy shard is refused by name — even under a run reading success (the per-job check)');
ok(refused(judge({ jobs: jobsOf(undefined, { [hj(5)]: 'skipped' }) }), new RegExp(`«heavy 5/${N}» is skipped`)), 'a SKIPPED shard is refused');
ok(refused(judge({ jobs: jobsOf(undefined, { [hj(N)]: null }) }), new RegExp(`no job «heavy ${N}/${N}»`)), 'a MISSING shard is refused');
ok(refused(judge({ jobs: jobsOf(undefined, { heavy: null }) }), /no job «heavy»/), 'a missing heavy GATE is refused');
ok(refused(judge({ jobs: jobsOf(undefined, { fast: 'failure' }) }), /«fast» is failure/), 'a failed fast job is refused');
{ const dupBad = [...jobsOf(), { name: hj(2), status: 'completed', conclusion: 'failure' }], dupOk = [...jobsOf(), { name: hj(2), status: 'completed', conclusion: 'success' }];
  ok(refused(judge({ jobs: dupBad }), new RegExp(`«heavy 2/${N}» is failure \\(one of 2 jobs of that name\\)`)), 'a DUPLICATE job name with one failure is refused — every job of a needed name must be success');
  ok(judge({ jobs: dupOk }).ok, '…two jobs of one name, both success, are accepted'); }
ok(refused(judge({ total: 120 }), /job list is paged \(\d+ of 120\)/), 'a PAGED job list (total_count above what came back) is refused — every job must be seen');
{ const four = WF.replace(/shard:\s*\[[\d,\s]+\]/, 'shard: [1, 2, 3, 4]').replace(/name:\s*heavy \$\{\{ matrix\.shard \}\}\/\d+/, 'name: heavy ${{ matrix.shard }}/4');
  ok(judge({ workflow: four, jobs: jobsOf(4) }).ok, 'the shard count is READ from the workflow at the sha: a 4-shard ci.yml with heavy 1/4…4/4 is accepted');
  ok(refused(judge({ jobs: jobsOf(4) }), new RegExp(`no job «heavy 1/${N}»`)), `…and the ${N}-shard workflow with 4 shards run is refused`); }
ok(refused(judge({ workflow: 'name: ci\njobs: {}\n' }), /defines no readable heavy matrix/), 'a workflow with no readable matrix is refused');
ok(repoSlugOf('git@github.com:ProblemFactory/vibespace.git') === SLUG && repoSlugOf('https://github.com/ProblemFactory/vibespace') === SLUG
  && repoSlugOf('ssh://git@github.com/ProblemFactory/vibespace.git') === SLUG && repoSlugOf('/srv/mirror/vibespace.git') === null, 'the origin\'s owner/name reads from ssh and https remotes; a non-GitHub path is none');

console.log('§2 THE WRITER — the hosted half, listed; every refusal writes NOTHING');
const R = makeRepo('verdict');
git(R, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
const base = commit(R, 'base.txt', 'base\n', 'base');
const tip = commit(R, MIRROR_WORKFLOW, WF, 'the ci workflow');
const ghFor = (run, jobs, calls, total) => (p) => { calls && calls.push(p); return /\/jobs\?/.test(p) ? { json: { total_count: total ?? jobs.length, jobs } } : { json: run }; };
const empty = (d) => !fs.existsSync(d) || fs.readdirSync(d).length === 0;
{ const dir = scratch('mk'), calls = [];
  const v = heavyVerdict({ sha: tip, runId: '42745258349', repoRoot: R, dir, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf(), calls), now: 1794280000000, by: 'gate' });
  const rec = v.ok ? JSON.parse(fs.readFileSync(v.file, 'utf-8')) : {};
  ok(v.ok && v.file === path.join(dir, `${tip}.mirror.green`) && !fs.existsSync(path.join(dir, `${tip}.green`)), `a verified run WRITES <markers>/<sha>.mirror.green — its own file, never the box's <sha>.green (${v.ok ? path.basename(v.file) : v.why})`);
  ok(rec.scope === 'hosted' && rec.source === 'mirror' && rec.hosts === 'hosted' && JSON.stringify(rec.selected) === JSON.stringify(HOSTED) && JSON.stringify(rec.partial) === JSON.stringify(HOSTED)
    && rec.ghRun === 42745258349 && rec.attempt === 1 && rec.verifiedAt === 1794280000000 && rec.result === 'green' && rec.scope !== 'full',
    'the marker LISTS what the mirror ran — { scope: hosted, source: mirror, selected = partial = the hosted names } — never «full»; `partial` keeps a reader that predates the union from counting it');
  ok(calls.length === 2 && calls[0] === `repos/${SLUG}/actions/runs/42745258349` && calls[1] === `repos/${SLUG}/actions/runs/42745258349/jobs?filter=latest&per_page=100`,
    'two bounded GETs on THIS repository\'s path; the jobs call asks filter=latest explicitly'); }
{ const dir = scratch('mk-abbr');
  const v = heavyVerdict({ sha: tip.slice(0, 12), runId: '7', repoRoot: R, dir, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf()) });
  ok(v.ok && v.rec.sha === tip, 'an abbreviated sha on the command line is resolved to the full 40 hex BEFORE it is compared'); }
const cases = [
  ['the judge: ONE failed shard', { gh: ghFor(runOf({ head_sha: tip }), jobsOf(undefined, { [hj(2)]: 'failure' })) }, new RegExp(`«heavy 2/${N}» is failure`)],
  ['the judge: another repository', { gh: ghFor(runOf({ head_sha: tip, repository: { full_name: 'x/y' } }), jobsOf()) }, /belongs to x\/y/],
  ['the judge: headSha of another commit', { gh: ghFor(runOf({ head_sha: base }), jobsOf()) }, /headSha [0-9a-f]{40} is not/],
  ['the judge: a paged job list', { gh: ghFor(runOf({ head_sha: tip }), jobsOf(), null, 140) }, /paged/],
  ['gh absent', { gh: () => ({ err: 'gh is not installed' }) }, /cannot verify: gh is not installed/],
  ['gh 403 / rate-limited', { gh: () => ({ err: 'gh refused (unauthenticated or rate-limited): HTTP 403: API rate limit exceeded' }) }, /cannot verify: gh refused/],
  ['gh timing out', { gh: () => ({ err: 'gh timed out after 30 s' }) }, /cannot verify: gh timed out/],
  ['the jobs call failing after the run call', { gh: (p) => (/jobs/.test(p) ? { err: 'gh failed: HTTP 502' } : { json: runOf({ head_sha: tip }) }) }, /cannot verify: gh failed: HTTP 502/],
  ['a run id that is not a number', { runId: '12;rm', gh: ghFor(runOf({ head_sha: tip }), jobsOf()) }, /wants a run id/],
  ['a sha that is no commit here', { sha: 'f'.repeat(40), gh: ghFor(runOf({ head_sha: 'f'.repeat(40) }), jobsOf()) }, /is no commit/],
  ['an empty hosted list', { hosted: [], gh: ghFor(runOf({ head_sha: tip }), jobsOf()) }, /lists no hosted heavy suite/],
];
for (const [label, c, re] of cases) {
  const dir = scratch('mk-no');
  const v = heavyVerdict({ sha: c.sha || tip, runId: c.runId || '99', repoRoot: R, dir, hosted: c.hosted || HOSTED, ghJson: c.gh });
  ok(!v.ok && re.test(v.why) && empty(dir), `REFUSED and nothing written — ${label} (${v.why})`);
}
{ const file = path.join(scratch('mk-file'), 'not-a-dir'); fs.writeFileSync(file, 'x');
  const v = heavyVerdict({ sha: tip, runId: '1', repoRoot: R, dir: file, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf()) });
  ok(!v.ok && /is not a directory/.test(v.why) && fs.readFileSync(file, 'utf-8') === 'x', `--markers naming a FILE is a named refusal, the file untouched (${v.why})`); }
{ const dir = scratch('mk-link'), target = path.join(scratch('mk-target'), 'victim'); fs.writeFileSync(target, 'victim\n');
  fs.symlinkSync(target, path.join(dir, `${tip}.mirror.green`));
  const v = heavyVerdict({ sha: tip, runId: '1', repoRoot: R, dir, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf()) });
  ok(v.ok && fs.readFileSync(target, 'utf-8') === 'victim\n' && !fs.lstatSync(v.file).isSymbolicLink(), 'a SYMLINK standing at the marker path is removed, never written through (its target untouched)'); }
{ const parent = path.join(ROOT, 'never-made', 'markers');
  const v = heavyVerdict({ sha: tip, runId: '1', repoRoot: R, dir: parent, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf(undefined, { [hj(1)]: 'failure' })) });
  ok(!v.ok && !fs.existsSync(parent) && !fs.existsSync(path.dirname(parent)), 'a REFUSED verdict leaves no directory behind (the marker dir is made only to write)'); }
{ const R2 = makeRepo('noorigin'); const t2 = commit(R2, MIRROR_WORKFLOW, WF, 'wf'); const dir = scratch('mk-no2');
  const v = heavyVerdict({ sha: t2, runId: '1', repoRoot: R2, dir, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: t2 }), jobsOf()) });
  ok(!v.ok && /origin remote \(none\) is no GitHub repository/.test(v.why) && empty(dir), 'a repository with no GitHub origin: refused, nothing written'); }
const heavy = SUITES.filter((s) => s.tier === 'heavy');
const planNow = hostPlan(heavy, { sourceOf: (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } } });
const SELF = new Set(planNow.self.map((s) => s.name));
// LAW B (r3): the hosted list is read from the COMMIT — its ci.mjs must be the running one byte for byte; its suite sources by git cat-file
const SELF_SUITE = 'test-desktop-xpra', SELF_SRC = fs.readFileSync(path.join(REPO, 'scripts', SELF_SUITE + '.mjs'), 'utf-8');
const CIJS = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'));
{ const C = makeRepo('commitplan'); git(C, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
  fs.mkdirSync(path.join(C, 'scripts'), { recursive: true }); fs.writeFileSync(path.join(C, 'scripts', 'ci.mjs'), CIJS); git(C, ['add', '-f', 'scripts/ci.mjs']);
  commit(C, MIRROR_WORKFLOW, WF, 'the workflow'); const at = commit(C, `scripts/${SELF_SUITE}.mjs`, SELF_SRC, 'the ci table + one self-hosted suite');
  const h = hostedHeavyNamesAt({ repoRoot: C, sha: at });
  ok(!h.err && SELF.has(SELF_SUITE) && !h.names.includes(SELF_SUITE) && h.names.length > 0, `the list is the COMMIT's plan: ${SELF_SUITE} (self-hosted at the commit) is not on it (${h.err || h.names.length + ' hosted names'})`);
  // THE VERIFIER'S MOVE: the suite edited in the working tree to look hosted, hidden from git status by skip-worktree
  fs.writeFileSync(path.join(C, 'scripts', SELF_SUITE + '.mjs'), '// an edit that names no binary\nconsole.log("ok");\n');
  git(C, ['update-index', '--skip-worktree', `scripts/${SELF_SUITE}.mjs`]);
  const clean = git(C, ['status', '--porcelain']) === '';
  const fromTree = hostPlan(heavy, { sourceOf: (n) => { try { return fs.readFileSync(path.join(C, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } } }).hosted.map((s) => s.name);
  const h2 = hostedHeavyNamesAt({ repoRoot: C, sha: at });
  ok(clean && fromTree.includes(SELF_SUITE) && !h2.err && !h2.names.includes(SELF_SUITE) && JSON.stringify(h2.names) === JSON.stringify(h.names),
    'the skip-worktree move: git status is clean and the WORKING TREE would list the suite as hosted — the commit\'s list does not move');
  const dir = scratch('mk-commitplan');
  const v = heavyVerdict({ sha: at, runId: '3', repoRoot: C, dir, ghJson: ghFor(runOf({ head_sha: at }), jobsOf()) });
  ok(v.ok && JSON.stringify(v.rec.selected) === JSON.stringify(h.names), `the writer's default list is the commit's (${v.ok ? v.rec.selected.length : v.why})`);
  const C2 = makeRepo('commitplan-other'); git(C2, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
  commit(C2, MIRROR_WORKFLOW, WF, 'wf'); const at2 = commit(C2, 'scripts/ci.mjs', CIJS.toString('utf-8') + '\n// another table\n', 'a ci.mjs that is not the running one');
  const h3 = hostedHeavyNamesAt({ repoRoot: C2, sha: at2 }); const dir3 = scratch('mk-otherci');
  const v3 = heavyVerdict({ sha: at2, runId: '3', repoRoot: C2, dir: dir3, ghJson: ghFor(runOf({ head_sha: at2 }), jobsOf()) });
  ok(!!h3.err && /is not the commit's/.test(h3.err) && !v3.ok && empty(dir3), `a commit whose ci.mjs is not the running one: no list, no marker (${h3.err})`); }

console.log('§3 THE READER — the real ghApiJson: absent, refused, timing out = «cannot verify», one call, no retry');
{ const bin = scratch('gh'), PATH0 = process.env.PATH, counter = path.join(bin, 'calls');
  const fake = (body) => { fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\n${body}\n`); fs.chmodSync(path.join(bin, 'gh'), 0o755); };
  try {
    process.env.PATH = path.join(bin, 'none');
    ok(ghApiJson('repos/x/y/actions/runs/1').err === 'gh is not installed', 'gh ABSENT from PATH: «gh is not installed»');
    process.env.PATH = bin + path.delimiter + PATH0;
    fake(`echo x >> '${counter}'; echo 'HTTP 403: API rate limit exceeded (https://api.github.com/repos/x/y)' >&2; exit 1`);
    const b = ghApiJson('repos/x/y/actions/runs/1');
    ok(/^gh refused \(unauthenticated or rate-limited\): HTTP 403/.test(b.err || '') && fs.readFileSync(counter, 'utf-8').trim().split('\n').length === 1, `a 403 is «${b.err}» — after ONE call (no retry)`);
    fake(`echo 'To get started with GitHub CLI, please run:  gh auth login' >&2; exit 4`);
    ok(/^gh refused \(unauthenticated/.test(ghApiJson('repos/x/y/actions/runs/1').err || ''), 'unauthenticated is «gh refused (unauthenticated …)»');
    fake(`exec sleep ${SLEEP_TAG}`);   // exec: the sleep IS gh, so the bound's kill ends it (no orphan)
    const d = ghApiJson('repos/x/y/actions/runs/1', { timeoutMs: 300 });   // the bound is spawnSync's own timeout (no wall-clock assert: the fast-tier ratchet)
    ok(/^gh timed out after/.test(d.err || ''), `a hung gh is cut at its bound: «${d.err}»`);
    fake(`echo '{"id": 7, "head_sha": "abc"}'`);
    const e = ghApiJson('repos/x/y/actions/runs/7');
    ok(!e.err && e.json && e.json.id === 7, 'a gh that answers JSON is read');
    fake(`echo 'not json'`);
    ok(/not JSON/.test(ghApiJson('repos/x/y/actions/runs/7').err || ''), 'an answer that is not JSON cannot verify anything');
  } finally { process.env.PATH = PATH0; } }

console.log('§4 THE UNION — a marker vouches for exactly the suites that ran; a red clears only when every failed suite has run green since');
const verdictOn = (repo, sha, dir, hosted) => heavyVerdict({ sha, runId: '5', repoRoot: repo, dir, hosted, ghJson: ghFor(runOf({ head_sha: sha }), jobsOf()) });
// a reader that THROWS fails the leg that asked, by name — it never takes the suite down with it (r4: deleting the shape check crashed
// the run on `rec.sha` of null and leaked its scratch)
const safely = (f) => { try { return f(); } catch (e) { return { threw: String(e && e.message) }; } };
const blockedBy = (dir, head, repo, blocker = heavyBlocker) => { try { const b = blocker({ dir, head, repoRoot: repo }); return b ? b.sha : null; } catch (e) { return `threw: ${e && e.message}`; } };
{ const G = makeRepo('guard'); git(G, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
  const red = commit(G, MIRROR_WORKFLOW, WF, 'R: its box run red on a SELF-HOSTED suite');
  const rel = commit(G, 'rel.txt', 'next\n', 'a descendant, mirrored green');
  const hostedHere = [...HOSTED, 'test-hosted-c'];
  const dir = scratch('mk-pair');
  writeMarker(dir, red, 'red', ['test-remoteapp-launch']);
  ok(blockedBy(dir, rel, G) === red, 'before anything: the red on an ancestor blocks');
  ok(verdictOn(G, rel, dir, hostedHere).ok && blockedBy(dir, rel, G) === red, 'THE MEASURED PAIR ①: a mirror verdict on the descendant (the hosted half) does NOT clear a red whose failure is self-hosted');
  writeMarker(dir, rel, 'green', [], ['test-remoteapp-launch']);   // the box's self-hosted run of that suite, a partial green on the descendant
  ok(blockedBy(dir, rel, G) === null, '…② it IS cleared once a self-hosted green of that suite exists on a descendant');
  const dir2 = scratch('mk-mixed'); writeMarker(dir2, red, 'red', ['test-hosted-a', 'test-remoteapp-launch']);
  verdictOn(G, rel, dir2, hostedHere);
  ok(blockedBy(dir2, rel, G) === red, 'a red with one hosted and one self-hosted failure stays blocked on the mirror alone');
  writeMarker(dir2, rel, 'green', [], ['test-remoteapp-launch']);
  ok(blockedBy(dir2, rel, G) === null, '…and clears on the UNION: the mirror\'s hosted list + the box\'s self-hosted green');
  const dir3 = scratch('mk-full'); writeMarker(dir3, red, 'red', ['test-remoteapp-launch', 'test-anything']); writeMarker(dir3, rel, 'green', []);
  ok(blockedBy(dir3, rel, G) === null, 'a FULL green (no partial) on a descendant clears alone, as before');
  const dir4 = scratch('mk-same'); writeMarker(dir4, rel, 'red', ['test-hosted-a']); verdictOn(G, rel, dir4, hostedHere);
  ok(blockedBy(dir4, rel, G) === rel, 'nothing clears a red on its OWN sha — the green must be a descendant\'s (the reader\'s rule, unchanged)');
  const dir5 = scratch('mk-empty'); writeMarker(dir5, red, 'red', []); writeMarker(dir5, rel, 'green', [], ['test-x']); verdictOn(G, rel, dir5, hostedHere);
  ok(blockedBy(dir5, rel, G) === red, 'a red with NO failed list clears only by a FULL green — never by lists');
  // PRODUCTION'S RED (the 2026-11-01 run, 109 failed): its self-hosted failures under this tree's plan
  const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'ci-heavy-markers-prod-2026-11-10.json'), 'utf-8'));
  const prodRed = FIX.markers.filter((m) => m.kind === 'red').sort((a, b) => b.failed.length - a.failed.length)[0];
  const selfFailed = prodRed.failed.filter((f) => SELF.has(f)), hostedAll = planNow.hosted.map((s) => s.name);
  const dir6 = scratch('mk-prod'); writeMarker(dir6, red, 'red', prodRed.failed);
  verdictOn(G, rel, dir6, hostedAll);
  ok(prodRed.failed.length === 109 && selfFailed.length > 0 && blockedBy(dir6, rel, G) === red,
    `production's red (${prodRed.failed.length} failed, ${selfFailed.length} self-hosted under this plan) stays BLOCKED after a mirror verdict alone`);
  writeMarker(dir6, rel, 'green', [], selfFailed);
  ok(blockedBy(dir6, rel, G) === null, `…and clears after the mirror + a self-hosted green covering the ${selfFailed.length}`); }

console.log('§4b LAW A — a marker that cannot be read as a record of its kind never opens the gate');
const goodRec = (sha, kind, extra = {}) => ({ sha, result: kind, failed: [], scope: 'full', startedAt: 1, endedAt: 2, ...extra });
const BROKEN = [['null', 'null'], ['a number', '42'], ['a string', '"green"'], ['an array', '[]'], ['an empty object', '{}'], ['an empty file', ''], ['garbage', '{"sha": '], ['a directory', null], ['a dangling symlink', undefined]];
const plant = (dir, name, body) => { const f = path.join(dir, name); if (body === null) fs.mkdirSync(f); else if (body === undefined) fs.symlinkSync(path.join(dir, 'nowhere'), f); else fs.writeFileSync(f, body); };
{ const G = makeRepo('lawA'); git(G, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
  const red = commit(G, 'r.txt', 'r\n', 'R'), rel = commit(G, 'd.txt', 'd\n', 'a descendant');
  for (const [what, body] of BROKEN) {
    for (const ext of ['green', 'mirror.green']) {
      const dir = scratch('lawA'); writeMarker(dir, red, 'red', ['test-x']); plant(dir, `${rel}.${ext}`, body);
      ok(blockedBy(dir, rel, G) === red, `a .${ext} that is ${what}, on a descendant, covers NOTHING: the red still blocks`);
    }
    const dir = scratch('lawA-red'); plant(dir, `${red}.red`, body);
    let b; try { b = heavyBlocker({ dir, head: rel, repoRoot: G }); } catch (e) { b = { sha: null, unreadable: `threw: ${e && e.message}` }; }
    ok(b && b.sha === red && !!b.unreadable, `a .red that is ${what} still BLOCKS, named unreadable (${b && b.unreadable})`);
    fs.writeFileSync(path.join(dir, `${rel}.green`), JSON.stringify(goodRec(rel, 'green', { partial: ['test-x'] })));
    ok(blockedBy(dir, rel, G) === red, `…a slice green on a descendant does not clear it (its failures are unknown)`);
    fs.writeFileSync(path.join(dir, `${rel}.green`), JSON.stringify(goodRec(rel, 'green')));
    ok(blockedBy(dir, rel, G) === null, '…a FULL green on a descendant does');
  }
  const dir = scratch('lawA-str'); fs.writeFileSync(path.join(dir, `${red}.red`), JSON.stringify(goodRec(red, 'red', { failed: 'test-x' })));
  ok(blockedBy(dir, rel, G) === red, 'a red whose `failed` is a STRING blocks with no green');
  fs.writeFileSync(path.join(dir, `${rel}.green`), JSON.stringify(goodRec(rel, 'green', { partial: ['test-x'] })));
  ok(blockedBy(dir, rel, G) === red, '…and with a slice green naming that string (it is no list)');
  const dir2 = scratch('lawA-badlist'); writeMarker(dir2, red, 'red', ['test-x']);
  fs.writeFileSync(path.join(dir2, `${rel}.green`), JSON.stringify(goodRec(rel, 'green', { partial: 'test-x' })));
  ok(blockedBy(dir2, rel, G) === red, 'a green whose `partial` is a string is no list: it covers nothing (and is not FULL)');
  ok(markerShapeWhy(goodRec(red, 'red'), 'red', red) === null && /result/.test(markerShapeWhy(goodRec(red, 'green'), 'red', red)) && /sha/.test(markerShapeWhy(goodRec(rel, 'red'), 'red', red)),
    'the minimum shape: sha = the file\'s commit, result = its kind, a failed list, a scope, start / end times');
  const none = path.join(ROOT, 'no-markers-here'), emptyDir = scratch('lawA-empty');
  ok(blockedBy(none, rel, G) === null && blockedBy(emptyDir, rel, G) === null, 'a marker directory that does not exist, or is empty, stays CLEAR');
  const notDir = path.join(scratch('lawA-file'), 'markers'); fs.writeFileSync(notDir, 'x');
  let threw = null; try { heavyBlocker({ dir: notDir, head: rel, repoRoot: G }); } catch (e) { threw = e.code || e.message; }
  ok(threw === 'ENOTDIR', `a marker path that exists and cannot be read as a directory THROWS (${threw}) — never read as «no markers»`);
  ok(checkHeavy({ dir: notDir, head: rel }) === 1, '…and the guard\'s answer to that throw is BLOCKED (1), never «not blocking»'); }

console.log('§4c LAW B — exactly the suites that ran: `absent` is subtracted from LIST-scoped greens; a FULL green clears every red (r4)');
{ const G = makeRepo('lawB'); git(G, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
  const red = commit(G, 'r.txt', 'r\n', 'R'), rel = commit(G, 'd.txt', 'd\n', 'desc');
  const box = (dir, sha, extra) => fs.writeFileSync(path.join(dir, `${sha}.green`), JSON.stringify({ sha, result: 'green', failed: [], startedAt: 1, endedAt: 2, ms: 1, suites: 3, isolated: false, host: 'box', scope: 'full', ...extra }));
  const d1 = scratch('lawB1'); writeMarker(d1, red, 'red', ['test-x']); box(d1, rel, { absent: ['test-x'] });
  ok(blockedBy(d1, rel, G) === null, 'a FULL green (the box writer\'s shape) CLEARS the red even when its `absent` names the failed suite — as 2056c98de: its table no longer ran that suite, everything it knows ran green');
  const d2 = scratch('lawB2'); writeMarker(d2, red, 'red', ['test-x']); box(d2, rel, { absent: ['test-y'] });
  ok(blockedBy(d2, rel, G) === null, '…and with an `absent` naming another suite');
  const d4 = scratch('lawB4'); writeMarker(d4, red, 'red', []); box(d4, rel, { absent: ['test-z'] });
  ok(blockedBy(d4, rel, G) === null, 'a red with no failed list is cleared by a FULL green whatever its `absent`');
  const d4b = scratch('lawB4b'); fs.writeFileSync(path.join(d4b, `${red}.red`), 'null'); box(d4b, rel, { absent: ['test-z'] });
  ok(blockedBy(d4b, rel, G) === null, 'an UNREADABLE red is cleared by a FULL green whatever its `absent` (LAW A: «only a FULL green clears it»)');
  const d3 = scratch('lawB3'); writeMarker(d3, red, 'red', ['test-x']); box(d3, rel, { partial: ['test-x'], absent: ['test-x'] });
  ok(blockedBy(d3, rel, G) === red, 'a SLICE listing the suite AND naming it absent covers nothing (the list claims a name that did not run)');
  const d3b = scratch('lawB3b'); writeMarker(d3b, red, 'red', ['test-x']); box(d3b, rel, { scope: 'affected', selected: ['test-x'], absent: ['test-x'] });
  ok(blockedBy(d3b, rel, G) === red, '…an AFFECTED green selecting it and naming it absent covers nothing');
  const d3c = scratch('lawB3c'); writeMarker(d3c, red, 'red', ['test-x']);
  fs.writeFileSync(path.join(d3c, `${rel}.mirror.green`), JSON.stringify({ sha: rel, result: 'green', failed: [], scope: 'hosted', source: 'mirror', selected: ['test-x'], partial: ['test-x'], absent: ['test-x'], startedAt: 1, endedAt: 2 }));
  ok(blockedBy(d3c, rel, G) === red, '…a MIRROR verdict listing it and naming it absent covers nothing');
  const d3d = scratch('lawB3d'); writeMarker(d3d, red, 'red', ['test-x']); box(d3d, rel, { scope: 'affected', selected: ['test-x'], absent: 'test-y' });
  ok(blockedBy(d3d, rel, G) === red, 'a list-scoped green whose `absent` is not a list of names counts for NOTHING (fail closed, like failed / selected / partial)');
  const d3e = scratch('lawB3e'); writeMarker(d3e, red, 'red', ['test-x']); box(d3e, rel, { absent: 'test-y' });
  ok(blockedBy(d3e, rel, G) === null, '…on a FULL green a non-list `absent` changes nothing (a FULL green clears)');
  // a green on a SIBLING branch (real git): it is no descendant of the red, so it counts for nothing
  const S = makeRepo('sibling'); const base = commit(S, 'b.txt', 'b\n', 'base');
  git(S, ['checkout', '-q', '-b', 'side']); const side = commit(S, 's.txt', 's\n', 'side');
  git(S, ['checkout', '-q', 'main']); const r = commit(S, 'r.txt', 'r\n', 'R on main'), head = commit(S, 'h.txt', 'h\n', 'HEAD on main');
  const d5 = scratch('lawB5'); writeMarker(d5, r, 'red', ['test-x']); box(d5, side, {});
  ok(base && blockedBy(d5, head, S) === r, 'a FULL green on a SIBLING branch (no descendant of the red) does not count — real git');
  box(d5, head, {}); ok(blockedBy(d5, head, S) === null, '…the same green on a descendant does'); }

console.log('§4d pruning — a mirror verdict goes with its sha\'s other markers');
{ const dir = scratch('prune');
  for (let k = 0; k < 4; k++) { const sha = String(k).repeat(40); fs.writeFileSync(path.join(dir, `${sha}.green`), JSON.stringify(goodRec(sha, 'green', { endedAt: 10 + k }))); }
  const old = '9'.repeat(40); fs.writeFileSync(path.join(dir, `${old}.mirror.green`), JSON.stringify({ ...goodRec(old, 'green', { endedAt: 1 }), scope: 'hosted', source: 'mirror', selected: ['test-a'], partial: ['test-a'] }));
  safely(() => pruneMarkers(dir, 3));
  ok(!fs.existsSync(path.join(dir, `${old}.mirror.green`)) && fs.readdirSync(dir).length === 3, `keep 3: the oldest — a mirror verdict — is pruned like any marker (${fs.readdirSync(dir).length} left)`); }

{ const dir = scratch('prune-commits'), h = (i) => (i + 1).toString(16).padStart(40, '0'), X = 'f'.repeat(40);
  for (let i = 0; i < 35; i++) {   // i = 0 newest
    fs.writeFileSync(path.join(dir, `${h(i)}.green`), JSON.stringify(goodRec(h(i), 'green', { endedAt: 100000 + (35 - i) * 100 })));
    fs.writeFileSync(path.join(dir, `${h(i)}.log`), 'log\n');
  }
  fs.writeFileSync(path.join(dir, `${h(5)}.mirror.green`), JSON.stringify({ ...goodRec(h(5), 'green', { endedAt: 1 }), scope: 'hosted', source: 'mirror', selected: ['test-a'], partial: ['test-a'] }));
  fs.writeFileSync(path.join(dir, `${X}.green`), ''); fs.utimesSync(path.join(dir, `${X}.green`), 1, 1);   // an UNREADABLE file, older than the window
  safely(() => pruneMarkers(dir));
  const left = fs.readdirSync(dir), shas = new Set(left.map((f) => f.slice(0, 40)));
  ok(shas.size === 30 && [0, 1, 29].every((i) => shas.has(h(i))) && ![30, 34].some((i) => shas.has(h(i))), `prune keeps the 30 newest COMMITS, not 30 entries (${shas.size} commits left)`);
  ok(['green', 'log', 'mirror.green'].every((e) => left.includes(`${h(5)}.${e}`)), 'a commit inside the window keeps EVERY file — its old mirror verdict does not take its green and log with it');
  ok(!left.includes(`${X}.green`), 'an unreadable file older than the window goes with its commit'); }

console.log('§4e the other readers see what the gate sees (r4)');
{ const S = 'a'.repeat(40);
  for (const [what, body] of BROKEN) for (const kind of ['red', 'green']) {
    const dir = scratch('refuse'); plant(dir, `${S}.${kind}`, body);
    const e = safely(() => existingVerdictOf(dir, S));
    ok(!!e && !e.threw && !!e.unreadable && e.kind === kind, `THE WRITER: a <sha>.${kind} that is ${what} is an EXISTING verdict a partial run must not overwrite`);
  }
  const dir = scratch('refuse-ok');
  ok(safely(() => existingVerdictOf(dir, S)) === null, '…an empty marker dir holds none');
  fs.writeFileSync(path.join(dir, `${S}.green`), JSON.stringify(goodRec(S, 'green', { partial: ['test-x'] })));
  ok(safely(() => existingVerdictOf(dir, S)) === null, '…a readable PARTIAL green is no full verdict (a later slice may replace it)');
  fs.writeFileSync(path.join(dir, `${S}.red`), JSON.stringify(goodRec(S, 'red', { failed: ['test-x'] })));
  ok((safely(() => existingVerdictOf(dir, S)) || {}).kind === 'red', '…a readable FULL red is one');
  const SRC4 = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/const existing = existingVerdictOf\(dir, sha\);/.test(SRC4) && /\(only \|\| shard \|\| host\) && existing\) noVerdict =/.test(SRC4), 'WIRING: the partial-run refusal asks existingVerdictOf');
  const now = Date.now();
  const g = { kind: 'green', sha: S, scope: 'full', failed: [], mtimeMs: now - 1000 }, u = { kind: 'red', sha: S, unreadable: 'not a JSON object (null)', file: `/m/${S}.red`, failed: [], mtimeMs: 1 };
  const a1 = heavyAlreadyGreen({ markers: [g], sha: S, full: S, commitTimeMs: now - 60000, scope: 'full', now });
  const a2 = heavyAlreadyGreen({ markers: [g, u], sha: S, full: S, commitTimeMs: now - 60000, scope: 'full', now });
  ok(a1.skip === true && a2.skip === false && /UNREADABLE/.test(a2.why), `«already green» is never answered while an unreadable marker of that commit sits beside the green (${a2.why})`);
  ok(/readMarkers\(dir, \{ withUnreadable: true \}\)\.filter\(\(m\) => m\.kind === 'green' \|\| m\.kind === 'red'\)/.test(SRC4), 'WIRING: the launcher hands heavyAlreadyGreen the unreadable markers too');
  const sdir = scratch('status'); fs.writeFileSync(path.join(sdir, `${S}.red`), 'null');
  const st = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--status', `--markers=${sdir}`], { cwd: REPO, encoding: 'utf-8', timeout: 60000 });
  ok(/UNREADABLE/.test(st.stdout) && /BLOCKS until a FULL green/.test(st.stdout), `--status lists an unreadable red as UNREADABLE (${(st.stdout.split('\n').find((l) => /UNREADABLE/.test(l)) || st.stdout.slice(0, 120)).trim()})`); }

console.log('§5 NEGATIVE CONTROLS — the per-job check, and r1\'s FULL marker');
const M = mutantCopies('ci-heavy-verdict', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
// THE READER PRODUCTION RUNS TODAY: this file with heavyBlocker's decision block put back verbatim from 2056c98de (the union replaced it)
const OLD_BLOCK = [
    "  const greens = all.filter((m) => m.kind === 'green' && !m.partial && exists(m.sha));",
    "  const coversRed = (g, red) => g.scope !== 'affected' || (red.failed || []).every((f) => Array.isArray(g.selected) && g.selected.includes(f));",
    "  for (const red of reds) {",
    "    if (!isAncestor(red.sha, HEAD)) continue;",
    "    const cleared = greens.some((g) => g.sha !== red.sha && isAncestor(red.sha, g.sha) && isAncestor(g.sha, HEAD) && coversRed(g, red));",
    "    if (!cleared) return red;",
    "  }",
  ].join('\n') + '\n';
const UNION_AT = SRC.indexOf("  const greens = all.filter((m) => m.kind === 'green' && !m.unreadable && exists(m.sha));\n"), UNION_END = SRC.indexOf('  return null;\n}', UNION_AT);
const READ_ALL = '  const all = readMarkers(dir, { withMirror: true, withUnreadable: true });\n';
ok(UNION_AT > 0 && UNION_END > UNION_AT && SRC.split(READ_ALL).length === 2, 'the union block and the reader\'s call are where the old-reader twin expects them (the twin swaps exactly them)');
const OLD_READER_SRC = (SRC.slice(0, UNION_AT) + OLD_BLOCK + SRC.slice(UNION_END)).replace(READ_ALL, '  const all = readMarkers(dir);\n');
{ const CHECK = "    if (j) return no(`the job «${name}» is ${j.conclusion || j.status || '?'}${these.length > 1 ? ` (one of ${these.length} jobs of that name)` : ''}, not success`); // THE PER-JOB CHECK\n";
  ok(SRC.split(CHECK).length === 2, 'the per-job check is ONE line in ci.mjs (the mutant removes exactly it)');
  const mod = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(CHECK, ''), 'perjob')).href);
  ok(mod.judgeMirrorRun({ sha: SHA, slug: SLUG, run: runOf(), jobs: ONE_FAILED.jobs, workflow: WF }).ok === true && !judge(ONE_FAILED).ok,
    'CONTROL: without the per-job check a run with one failed shard is ACCEPTED; the real judge refuses it — §1\'s leg is the one that reds'); }
{ const SHAPE = "  const rec = { sha: full, result: 'green', failed: [], scope: 'hosted', source: 'mirror', hosts: 'hosted', selected: list, partial: list, ghRun: Number(runId), attempt: r.json.run_attempt,\n";
  const FILE = "  const file = path.join(d, `${full}.mirror.green`);\n";
  ok(SRC.split(SHAPE).length === 2 && SRC.split(FILE).length === 2, 'the marker\'s shape and file name are ONE line each (the r1-shape mutant swaps exactly them)');
  const r1 = SRC.replace(SHAPE, "  const rec = { sha: full, result: 'green', failed: [], scope: 'full', source: 'mirror', ghRun: Number(runId), attempt: r.json.run_attempt,\n").replace(FILE, "  const file = path.join(d, `${full}.green`);\n");
  const mod = await import(pathToFileURL(M.write('scripts/ci.mjs', r1, 'r1shape')).href);
  const G = makeRepo('guard-r1'); git(G, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
  const red = commit(G, MIRROR_WORKFLOW, WF, 'R'), rel = commit(G, 'rel.txt', 'x\n', 'desc');
  const dir = scratch('mk-r1'); writeMarker(dir, red, 'red', ['test-remoteapp-launch']);
  const w = mod.heavyVerdict({ sha: rel, runId: '5', repoRoot: G, dir, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: rel }), jobsOf()) });
  const listed = (v) => v.ok && /\.mirror\.green$/.test(v.file) && v.rec.scope === 'hosted' && Array.isArray(v.rec.partial) && v.rec.partial.length > 0;
  ok(w.ok && !listed(w) && /scope: full|\.green$/.test(`scope: ${w.rec.scope} ${w.file}`), `CONTROL: r1's writer (scope full, <sha>.green, no partial) FAILS the listed-shape check §2 holds — by name: scope ${w.rec.scope}, ${path.basename(w.file)}`);
  const oldReader = await import(pathToFileURL(M.write('scripts/ci.mjs', OLD_READER_SRC, 'reader-2056c98de')).href);
  const oldVerdict = oldReader.heavyBlocker({ dir, head: rel, repoRoot: G });
  ok(oldVerdict === null, 'CONTROL: under the reader production runs today (2056c98de\'s), r1\'s marker CLEARS the self-hosted red — the laundering the verifier measured');
  ok(blockedBy(dir, rel, G) === red, '…and the union reader still blocks it: a record whose source is the mirror is never FULL, whatever its scope says'); }
{ const SHAPE_CALL = "    if (!why) why = markerShapeWhy(rec, kind, m[1], mirror);\n";
  ok(SRC.split(SHAPE_CALL).length === 2, 'the shape check is ONE line in readMarkers (the mutant removes exactly it)');
  const mod = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(SHAPE_CALL, ''), 'noshape')).href);
  const G = makeRepo('mut-shape'); const red = commit(G, 'r.txt', 'r\n', 'R'), rel = commit(G, 'd.txt', 'd\n', 'desc');
  for (const body of ['null', '{}', '[]']) {
    const dir = scratch('mut-shape'); writeMarker(dir, red, 'red', ['test-x']); fs.writeFileSync(path.join(dir, `${rel}.green`), body);
    const b = blockedBy(dir, rel, G, mod.heavyBlocker);
    ok(b !== red && blockedBy(dir, rel, G) === red, `CONTROL: with the shape-check line deleted, §4b's leg for a ${body} green fails BY NAME (${b === null ? 'the red is cleared' : b}) — never a crash`);
  } }
{ const CATCH = "    console.error(`\\n[ci] PUSH BLOCKED — the heavy-gate markers cannot be read (${(e && e.message) || e}): a marker that cannot be read never opens the gate.`);\n    console.error('     Fix the marker directory, or — with a written word — VIBESPACE_SKIP_CI=1 git push\\n');\n    return 1;\n";
  ok(SRC.split(CATCH).length === 2, 'the guard\'s answer to a throw is ONE block (the mutant turns it back to «not blocking»)');
  const mod = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(CATCH, "    console.error(`[ci] WARNING: could not read the heavy-gate markers (${e.message}) — not blocking`);\n    return 0;\n"), 'notblocking')).href);
  const notDir = path.join(scratch('mut-catch'), 'markers'); fs.writeFileSync(notDir, 'x');
  ok(mod.checkHeavy({ dir: notDir, head: 'HEAD' }) === 0 && checkHeavy({ dir: notDir, head: 'HEAD' }) === 1, 'CONTROL: the catch turned back to «not blocking» answers 0 on an unreadable marker path; the real guard answers 1 — §4b\'s leg is the one that reds'); }
{ const REF = "  return readMarkers(dir, { withUnreadable: true }).find((m) => m.sha === sha && (m.kind === 'green' || m.kind === 'red') && (m.unreadable || !m.partial)) || null;\n";
  ok(SRC.split(REF).length === 2, 'the writer\'s refusal question is ONE line (the mutant asks it of the readable markers only, as round 3 did)');
  const mod = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(REF, "  return readMarkers(dir).find((m) => m.sha === sha && (m.kind === 'green' || m.kind === 'red') && !m.partial) || null;\n"), 'refusal-r3')).href);
  const S = 'b'.repeat(40), dir = scratch('mut-refuse'); fs.writeFileSync(path.join(dir, `${S}.red`), 'null');
  const mv = safely(() => mod.existingVerdictOf(dir, S)), rv = safely(() => existingVerdictOf(dir, S));
  ok(mv === null && rv !== null && !rv.threw, 'CONTROL: round 3\'s question sees no verdict where a broken red sits (the partial run would erase it); the real one does — §4e\'s legs are the ones that red'); }
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 6, label: '§5 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

console.log('§6 THE CLI — known flags; refusals exit 3 and write nothing; it runs only when asked');
const cli = (args) => spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), ...args], { cwd: REPO, encoding: 'utf-8', timeout: 60000 });
{ const dir = scratch('cli');
  const r = cli(['--heavy-verdict', 'HEAD', '--gh-run', 'not-a-number', `--markers=${dir}`]);
  ok(r.status === 3 && /heavy verdict REFUSED for HEAD: --gh-run wants a run id/.test(r.stderr) && /nothing written/.test(r.stderr) && empty(dir) && !/does not know/.test(r.stderr),
    `--heavy-verdict HEAD --gh-run not-a-number: exit ${r.status}, nothing written`); }
{ const dir = scratch('cli-space');
  const r = cli(['--heavy-verdict', 'HEAD', '--gh-run', '1', '--markers', dir]);
  ok(r.status === 3 && /write --markers=<dir>/.test(r.stderr) && empty(dir), `--markers <dir> in the SPACE form is refused by name (exit ${r.status}) — a marker never lands in the default directory by mistake`); }
{ const dir = scratch('cli-unreadable'); const head = git(REPO, ['rev-parse', 'HEAD']);   // HEAD only: a depth-1 checkout has no older object
  fs.writeFileSync(path.join(dir, `${head}.red`), 'null');   // a red on HEAD itself blocks HEAD (a commit is its own ancestor)
  const r = cli(['--check-heavy', `--markers=${dir}`, `--head=${head}`]);
  ok(head && r.status === 1 && /PUSH BLOCKED/.test(r.stderr) && /is UNREADABLE \(not a JSON object \(null\)\)/.test(r.stderr), `--check-heavy: an unreadable red on HEAD BLOCKS (exit ${r.status}) and the block line names the file as UNREADABLE`);
  const nd = path.join(scratch('cli-notdir'), 'markers'); fs.writeFileSync(nd, 'x');
  const r2 = cli(['--check-heavy', `--markers=${nd}`, `--head=${head}`]);
  ok(r2.status === 1 && /heavy-gate markers cannot be read/.test(r2.stderr) && !/not blocking/.test(r2.stderr), `--check-heavy on a marker path it cannot read: BLOCKED (exit ${r2.status}), never «not blocking»`);
  const r3 = cli(['--check-heavy', `--markers=${path.join(ROOT, 'absent-dir')}`, `--head=${head}`]);
  ok(r3.status === 0, `--check-heavy with no marker directory: CLEAR (exit ${r3.status})`); }
{ const calls = (SRC.match(/\bheavyVerdict\(/g) || []).length, defs = (SRC.match(/export function heavyVerdict\(/g) || []).length;
  ok(defs === 1 && calls === 2 && /if \(arg\('heavy-verdict'\) !== undefined\) \{[\s\S]{0,600}heavyVerdict\(\{ sha: vSha, runId: vRun, dir \}\)/.test(SRC),
    `the verdict runs only when asked: ONE call site, the --heavy-verdict branch (no timer, no hook, no launcher) — ${calls - defs} call(s)`); }

console.log('§7 PARITY — production\'s 30 markers: the union reader and the reader it replaced agree on every HEAD of that history');
{
  const i = UNION_AT, j = UNION_END;
  const ORACLE = (src) => src
    .replace("  const exists = (sha) => gitIn(repoRoot, ['cat-file', '-e', sha + '^{commit}']) !== null;\n", '  const exists = (sha) => globalThis.__CIV_ORDER.has(sha);\n')
    .replace("  const isAncestor = (a, b) => spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', a, b], { env: GIT_ENV }).status === 0;\n", '  const isAncestor = (a, b) => globalThis.__CIV_ORDER.get(a) <= globalThis.__CIV_ORDER.get(b);\n');
  const NEW_SRC = ORACLE(SRC), OLD_SRC = ORACLE(OLD_READER_SRC);
  ok(i > 0 && j > i && NEW_SRC !== SRC && OLD_SRC.includes('coversRed') && !OLD_SRC.includes(READ_ALL) && OLD_SRC.includes('  const all = readMarkers(dir);\n'), 'the two readers differ ONLY in their decision block (the reader it replaced: verbatim from 2056c98de); one ancestry oracle in place of git for both');
  const NEW = await import(pathToFileURL(M.write('scripts/ci.mjs', NEW_SRC, 'parity-new')).href), OLD = await import(pathToFileURL(M.write('scripts/ci.mjs', OLD_SRC, 'parity-old')).href);
  const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'ci-heavy-markers-prod-2026-11-10.json'), 'utf-8'));
  const pos = [...new Set(FIX.markers.map((m) => m.pos))].sort((a, b) => a - b);
  const shaOf = (p) => p.toString(16).padStart(40, 'c');
  const dir = scratch('parity');
  for (const m of FIX.markers) fs.writeFileSync(path.join(dir, `${shaOf(m.pos)}.${m.kind}`), JSON.stringify({ sha: shaOf(m.pos), result: m.kind, scope: m.scope || undefined, partial: m.partial || undefined, selected: m.selected || undefined, failed: m.failed, startedAt: m.pos, endedAt: m.pos }) + '\n');
  const heads = [...new Set([...pos, ...pos.map((p) => p + 1), pos[pos.length - 1] + 1000])].sort((a, b) => a - b);
  globalThis.__CIV_ORDER = new Map([...pos, ...heads].map((p) => [shaOf(p), p]));
  const diff = [], blockedAt = [];
  for (const h of heads) {
    const a = OLD.heavyBlocker({ dir, head: shaOf(h) }), b = NEW.heavyBlocker({ dir, head: shaOf(h) });
    const va = a ? a.sha : null, vb = b ? b.sha : null;
    if (va !== vb) diff.push({ head: h, old: va, new: vb });
    if (vb) blockedAt.push(h);
  }
  ok(FIX.markers.length === 30 && diff.length === 0, `on production's 30 markers (${FIX.markers.filter((m) => m.kind === 'red').length} red, ${FIX.markers.filter((m) => m.kind === 'green').length} green, ${FIX.markers.filter((m) => m.scope === 'affected').length} affected) the verdict of all ${heads.length} HEADs is UNCHANGED${diff.length ? ' — ' + JSON.stringify(diff.slice(0, 3)) : ''}`);
  ok(blockedAt.length > 0 && blockedAt[blockedAt.length - 1] === pos[pos.length - 1] + 1000, `…and today's master (a descendant of every marker) is BLOCKED by both, as production is (${blockedAt.length} blocked HEADs)`); }

console.log('§8 nothing left behind');
fs.rmSync(ROOT, { recursive: true, force: true });
const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(`vs-civerdict-${process.pid}-`));
const children = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).filter((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf-8').includes(SLEEP_TAG); } catch { return false; } });
ok(leftovers.length === 0 && children.length === 0, `0 scratch dirs and 0 children left (${leftovers.length} dirs, ${children.length} processes)`);
report();
