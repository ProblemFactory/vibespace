#!/usr/bin/env node
// THE MIRROR VERDICT (B-e381, lane ci-heavy-verdict r4, 2026-11-10). The CI mirror runs the HOSTED half of the heavy tier (ci.yml:
// `--host=hosted --shard i/n`, n read from the workflow); the self-hosted half runs on the box. `ci.mjs --heavy-verdict <sha> --gh-run <id>` writes the mirror's
// verified run as `<sha>.mirror.green` LISTING the hosted heavy suites of the commit's own plan, and heavyBlocker clears a red only when
// every suite that failed in it has since run green on a descendant (主开发's law). Every refusal writes NOTHING.
//   §1 THE JUDGE (pure) — every condition refused by name; every job of a needed name; a paged job list refused.
//   §2 THE WRITER — a real repository; the marker lists the hosted half (never «full»); the markers path, a symlink at the marker path,
//      the list read from the COMMIT (the skip-worktree move; a commit whose ci.mjs is not the running one); every refusal leaves
//      the marker dir EMPTY, and no directory behind. B-18eb: a RE-RUN attempt — the recorded run (scripts/fixtures/
//      mirror-reattempt-410.json, its workflow shape pinned) verifies with each shard read at the attempt in which it RAN; a third
//      attempt reads each at the EARLIEST; twins by time are told apart by name; a copy with no original found still refuses.
//   §3 THE READER — the real ghApiJson against fake `gh` binaries (absent, 403, unauthenticated, a timeout); one call, no retry.
//   §4 THE UNION — the measured pair (a self-hosted failure is NOT cleared by a mirror verdict, IS cleared once a self-hosted green of
//      that suite exists on a descendant); production's 109-failure red; a FULL green alone; nothing clears on the red's own sha.
//   §4b LAW A — a marker that cannot be read as a record of its kind never opens the gate: nine broken forms × .green / .mirror.green /
//      .red, a string `failed`, the guard's answer to a throw (BLOCKED), no directory / an empty one (CLEAR).
//   §4c LAW B — a FULL green clears every red whatever its `absent`; a LIST-scoped green's `absent` covers nothing (slice / affected /
//      mirror), a non-list one fails closed; a green on a SIBLING branch counts for nothing (real git).
//   §4d pruning — by COMMITS: every file of a commit inside the window stays; an old unreadable file goes with its commit.
//   §4e the other readers see what the gate sees — the writer's refusal (nine broken forms × red / green), «already green», --status.
//   §4f the guard follow-ups — an AFFECTED run never overwrites a FULL / unreadable red; a marker's identity is its FILE NAME's commit;
//      --status prints an unreadable row's file time; a marker dir the writer cannot read / write is a named «no verdict».
//   §5 NEGATIVE CONTROLS — a mutant without the per-job check; B-18eb's base red (the writer before it refuses the recorded run by
//      heavy 4/7) and its newest-first and nameless mutants; a mutant writer of r1's shape (a FULL `<sha>.green`) clears what it
//      must not; the shape-check line deleted (null / {} / [] greens fail §4b's legs BY NAME — never a crash; a reader that throws
//      fails the leg that asked); the guard's catch turned back to «not blocking»; the writer's refusal asked of readable markers only.
//   §6 THE CLI — known flags; refusals exit 3 and write nothing (a bad run id, `--markers <dir>` in the space form); one call site;
//      --check-heavy names an unreadable red, BLOCKS on a marker path it cannot read, is CLEAR with no directory.
//   §7 PARITY — production's 30 markers (shapes, scripts/fixtures/ci-heavy-markers-prod-2026-11-10.json): the union reader and the reader
//      it replaced agree on EVERY HEAD of that history (both run with ONE ancestry oracle in place of git; their decision code is real).
//   §7b THE LAUNCH PATH (B-e381 part 2) — the tier a hook launches keeps the caller's env with a PATH that leaves out git's exec-path,
//      the launching checkout's own data/bin, entries on a mount the guard REFUSES (storage), relative and empty entries; node's dir
//      kept (by its resolved path; no entry is ever resolved), the launching checkout's mount is «home», an NFS home's dirs kept; the
//      launcher spawns with it, guarded and said. CONTROLS: no mount table and no checkout keep the dirs; the pre-fix spawn line fails
//      the wiring pin.
//   §7d THE DIFFERENTIAL ON REAL GIT (B-e56e's remainder) — one fast-import history with a name two commits answer to and one a commit
//      and a blob answer to (ids computed, then read back), an annotated and a lightweight tag; master's reader with its own git
//      lines and the reader of this tree ask real git, the law is read from the object list and the graph; a crafted scene, both
//      directions by name, seeded sets. RED CONTROL: the release's hinted question (`<x>^{commit}`) clears what master blocks.
//   §8 nothing left behind — every scratch dir removed, no child alive.
//   §T B-7e49 (lane card-door-in-chat, 主开发 r2496): the legs whose scene is a real child — §2 B-479e's and B-737b's planted-suite
//      runs (and B-737b's control), §4e / §4f's and §6's scripts/ci.mjs children, §7d — run in the HEAVY twin
//      scripts/test-ci-heavy-verdict-real.mjs, moved verbatim; every pure
//      verdict leg and every red control that needs no real child stays here. §T pins the twin: it holds them, this file runs none.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tableTiersOf, launchPath, launchEnvOf, judgeMirrorRun, heavyVerdict, ghApiJson, workflowShardsAt, workflowFastPartsAt, workflowHeavyNodesAt, heavyNodesFor, repoSlugOf, hostedHeavyNamesAt, heavyBlocker, checkHeavy, pruneMarkers, markerShapeWhy, existingVerdictOf, heavyAlreadyGreen, hostPlan, SUITES, MIRROR_WORKFLOW, settleHeavyMarker, SELF_SKIP_TITLE, SELF_SKIP_TAG, selfSkipBody, selfSkippedInNotes, heavyTableOf, passedCountOf, wholeSkipOf, heavyVerdictSaid, PLACED_TITLE } from './ci.mjs';
import { REPO, ok, git, writeMarker, report, GIT_ENV } from './ci-gate-kit.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import './scratch.mjs';   // its re-home at import, as before (the B-737b release reader's `anchored` moved to the heavy twin)

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `vs-civerdict-${process.pid}-`));   // EVERY scratch path of this run lives here (§8)
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });   // even when a leg throws (r4)
let seq = 0;
const scratch = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
// THE MAKING (B-7e49, lane card-door-in-chat): ONE repository is made once (init + its config: the same four git lines, and gc.auto 0 +
// maintenance.auto false so a scene's commit starts no auto-maintenance child) and each scene's is a COPY of it — the files git made;
// a commit's id is read from the ref git just wrote (rev-parse when it is not a loose ref)
let TEMPLATE = null;
const makeRepo = (tag) => { const d = scratch(tag); if (!TEMPLATE) { TEMPLATE = path.join(ROOT, 'repo-template'); fs.mkdirSync(TEMPLATE); git(TEMPLATE, ['init', '-q', '-b', 'main']); git(TEMPLATE, ['config', 'user.email', 'gate@test.local']); git(TEMPLATE, ['config', 'user.name', 'gate test']); git(TEMPLATE, ['config', 'commit.gpgsign', 'false']); git(TEMPLATE, ['config', 'gc.auto', '0']); git(TEMPLATE, ['config', 'maintenance.auto', 'false']); } fs.cpSync(path.join(TEMPLATE, '.git'), path.join(d, '.git'), { recursive: true }); return d; };
const headOf = (repo) => { try { const h = fs.readFileSync(path.join(repo, '.git', 'HEAD'), 'utf-8').trim(); const ref = /^ref: (refs\/heads\/[^\s]+)$/.exec(h); const id = ref ? fs.readFileSync(path.join(repo, '.git', ref[1]), 'utf-8').trim() : h; if (/^[0-9a-f]{40}$/.test(id)) return id; } catch { } return git(repo, ['rev-parse', 'HEAD']); };
const commit = (repo, file, body, msg) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), body); git(repo, ['add', '-f', file]); git(repo, ['commit', '-q', '-m', msg]); return headOf(repo); };
const SLEEP_TAG = `5.${String(process.pid).padStart(6, '0')}`;   // the fake gh's sleep, findable in /proc

const SLUG = 'ProblemFactory/vibespace';
const WF = fs.readFileSync(path.join(REPO, MIRROR_WORKFLOW), 'utf-8');
const SH = workflowShardsAt(WF);
const SHA = 'a'.repeat(40);
const HOSTED = ['test-hosted-a', 'test-hosted-b'];
const runOf = (over = {}) => ({ id: 42745258349, run_attempt: 1, name: 'ci', path: MIRROR_WORKFLOW, event: 'push', head_branch: 'ci/prep388', head_sha: SHA,
  status: 'completed', conclusion: 'success', run_started_at: '2026-11-10T02:52:00Z', repository: { full_name: SLUG }, head_repository: { full_name: SLUG }, ...over });
const FP = workflowFastPartsAt(WF), FAST_JOBS = ['fast 1/2', 'fast 1/2 node 24', 'fast 2/2', 'fast 2/2 node 24'];   // B-7353: the fast tier as its parts — the names written out, never read back from the parser under test; r117: × Node 22 (bare) / 24
// the default run is a DAILY PREP branch (ci/prep…): its heavy shards are Node 22's alone (r140); `heavyNodes` adds a major's shards by name
const jobsOf = (n = SH ? SH.n : 6, over = {}, fastJobs = FAST_JOBS, heavyNodes = [null]) => [...fastJobs, ...Array.from({ length: n }, (_, k) => heavyNodes.map((nd) => `heavy ${k + 1}/${n}${nd ? ` node ${nd}` : ''}`)).flat(), 'heavy']
  .map((name) => ({ name, status: 'completed', conclusion: over[name] === undefined ? 'success' : over[name] }))
  .filter((j) => j.conclusion !== null);
const judge = (o = {}) => judgeMirrorRun({ sha: SHA, slug: SLUG, run: runOf(o.run), jobs: o.jobs || jobsOf(), totalJobs: o.total, workflow: o.workflow || WF });
const refused = (v, re) => !v.ok && re.test(v.why || '');

console.log('§1 THE JUDGE — every condition, every refusal by name');
ok(!!SH && SH.n >= 1, `the workflow in this tree defines a readable heavy matrix (${SH ? SH.n : '?'} shards)`);
{ const v = judge(); ok(v.ok && v.jobs.length === (SH ? SH.n : 0) + FAST_JOBS.length + 1 && v.jobs.slice(0, FAST_JOBS.length).join() === FAST_JOBS.join() && v.jobs[v.jobs.length - 1] === 'heavy', `a green push run of the ci workflow on exactly the sha is ACCEPTED (${(v.jobs || []).join(', ')})`); }
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
ok(refused(judge({ jobs: jobsOf(undefined, { [FAST_JOBS[FAST_JOBS.length - 1]]: 'failure' }) }), new RegExp(`«${FAST_JOBS[FAST_JOBS.length - 1]}» is failure`)), `a failed fast job is refused (${FAST_JOBS[FAST_JOBS.length - 1]})`);
ok(refused(judge({ jobs: jobsOf(undefined, { [FAST_JOBS[0]]: 'failure' }) }), new RegExp(`«${FAST_JOBS[0]}» is failure`)), `…and so is the FIRST part failed alone (${FAST_JOBS[0]})`);
// r117 (part 3): the verdict reads EVERY job of the node axis by its name — production's major is a gate like the image's
ok(refused(judge({ jobs: jobsOf(undefined, { 'fast 2/2 node 24': 'failure' }) }), /«fast 2\/2 node 24» is failure, not success/) && refused(judge({ jobs: jobsOf(undefined, { 'fast 1/2 node 24': null }) }), /no job «fast 1\/2 node 24»/)
  && judge({ jobs: jobsOf(undefined, { 'fast 1/2 node 24': null, 'fast 2/2 node 24': null }), workflow: WF.replace(/\n {8}node: \[22, 24\]\n/, '\n        node: [22]\n').replace(/\$\{\{ matrix\.node != 22 && format\(' node \{0\}', matrix\.node\) \|\| '' \}\}/, '') }).ok,
  'r117: a Node 24 fast job that failed, or one MISSING, is refused by its name; a commit whose workflow runs Node 22 alone needs only the bare names (the axis is read at the sha)');
// B-7353 THE FAST TIER IN PARTS: the verdict reads the fast jobs from the workflow AT THE SHA — a part missing is refused; a
// workflow of ONE fast job (every commit before the split) still needs exactly «fast»
ok(FP && FP.n === 2 && FP.slots.join() === '1,2' && JSON.stringify(FP.nodes) === '[22,24]' && FP.primary === 22,
  `the workflow in this tree runs the fast tier as the jobs fast 1/2 and fast 2/2 on Node 22, and fast 1/2 node 24 and fast 2/2 node 24 (r117: production's major) — its parser reads ${JSON.stringify(FP)}`);
{ const job = (name, parts, next = '  heavy-shards:\n    runs-on: x\n') => `jobs:\n  fast:\n    name: ${name}\n    runs-on: ubuntu-24.04\n    strategy:\n      fail-fast: false\n      matrix:\n        part: [${parts}]\n    steps:\n      - run: x\n${next}`;
  const three = workflowFastPartsAt(job('fast ${{ matrix.part }}/3', '1, 2, 3')), gap = workflowFastPartsAt(job('fast ${{ matrix.part }}/3', '1, 3')), off = workflowFastPartsAt(job('fast ${{ matrix.part }}/2', '1, 2, 3')), other = workflowFastPartsAt(job('quick ${{ matrix.part }}/2', '1, 2'));
  ok(three && three.n === 3 && three.slots.join() === '1,2,3' && gap === null && off === null && other === null,
    `the parser over fixtures: a 3-part matrix is read (${JSON.stringify(three)}); slots that are not 1..n, a name whose n disagrees, another job name — none`);
  // r117: THE NODE AXIS — the primary major's jobs keep the bare name, every other major's carries « node <major>» by the name's expression
  const SUF = (p) => `$${'{'}{ matrix.node != ${p} && format(' node {0}', matrix.node) || '' }}`;
  const axis = (name, nodes) => job(name, '1, 2').replace('        part: [1, 2]\n', `        part: [1, 2]\n        node: [${nodes}]\n`);
  const two = workflowFastPartsAt(axis('fast ${{ matrix.part }}/2' + SUF(22), '22, 24')), bare = workflowFastPartsAt(axis('fast ${{ matrix.part }}/2', '22, 24'));
  const stray = workflowFastPartsAt(axis('fast ${{ matrix.part }}/2' + SUF(20), '22, 24')), noAxis = workflowFastPartsAt(job('fast ${{ matrix.part }}/2' + SUF(22), '1, 2'));
  const one = workflowFastPartsAt(axis('fast ${{ matrix.part }}/2', '24')), dup = workflowFastPartsAt(axis('fast ${{ matrix.part }}/2' + SUF(22), '22, 22'));
  ok(two && JSON.stringify(two.nodes) === '[22,24]' && two.primary === 22 && two.n === 2 && bare === null && stray === null && noAxis === null && one && one.primary === 24 && dup === null,
    `the node axis over fixtures: 2 parts × [22, 24] with the name's suffix is read (${JSON.stringify(two)}); the same axis with a BARE name (two jobs of one name), a suffix naming a major the axis lacks, a suffix with no axis, a duplicate major — none; a one-major axis needs no suffix (${JSON.stringify(one)})`); }
ok(refused(judge({ jobs: jobsOf(undefined, { [FAST_JOBS[0]]: null }) }), new RegExp(`no job «${FAST_JOBS[0]}»`)), 'a MISSING fast part is refused by name');
// r117, THE RULING r140: the heavy shards run on Node 24 as well ONLY on a release's mirror (ci/cut…) and the block's proof run (ci/proof…)
{ const HN = workflowHeavyNodesAt(WF), N7 = SH ? SH.n : 7;
  ok(!!HN && HN.prefixes.join() === 'ci/cut,ci/proof' && JSON.stringify(HN.all) === '[22,24]' && JSON.stringify(HN.base) === '[22]' && HN.primary === 22,
    `the workflow in this tree runs the heavy shards on Node 22, and on 24 as well on a branch named ci/cut… or ci/proof… — its parser reads ${JSON.stringify(HN)}`);
  const majors = ['ci/cut414', 'ci/proof414', 'ci/prep414', 'master', 'ci/cutter', 'xci/cut414', ''].map((b) => [b, JSON.stringify(heavyNodesFor(HN, b))]);
  ok(majors.map(([, m]) => m).join(' ') === '[22,24] [22,24] [22] [22] [22,24] [22] [22]', `the majors by branch (a prefix of the NAME, as the workflow's startsWith): ${majors.map(([b, m]) => `${b || '(none)'} → ${m}`).join(' · ')}`);
  const cut = { head_branch: 'ci/cut414' }, ALL = [null, 24];
  const vCut = judge({ run: cut, jobs: jobsOf(undefined, {}, FAST_JOBS, ALL) }), vProof = judge({ run: { head_branch: 'ci/proof414' }, jobs: jobsOf(undefined, {}, FAST_JOBS, ALL) });
  ok(vCut.ok && vCut.jobs.length === FAST_JOBS.length + 2 * N7 + 1 && vCut.jobs.includes(`heavy ${N7}/${N7} node 24`) && vProof.ok,
    `a release mirror's run needs every shard on both majors — ${vCut.ok ? vCut.jobs.filter((x) => x.startsWith('heavy')).join(', ') : vCut.why} (the proof run's too: ${vProof.ok ? 'accepted' : vProof.why})`);
  ok(refused(judge({ run: cut }), new RegExp(`no job «heavy 1/${N7} node 24»`)) && refused(judge({ run: cut, jobs: jobsOf(undefined, { [`heavy 3/${N7} node 24`]: 'failure' }, FAST_JOBS, ALL) }), new RegExp(`«heavy 3/${N7} node 24» is failure`)),
    'a release mirror\'s run with its Node 24 shards MISSING, or one of them failed, is refused by the job\'s name');
  ok(judge({ jobs: jobsOf(undefined, {}, FAST_JOBS, ALL) }).ok && judge().ok, 'a daily prep run needs only the Node 22 shards (extra Node 24 jobs, had a run held them, are not asked for)');
  // the parser over fixtures (a heavy-shards job alone)
  const hj7 = (name, nodeLine) => `jobs:\n  heavy-shards:\n    name: ${name}\n    strategy:\n      matrix:\n        shard: [1, 2, 3, 4, 5, 6, 7]\n${nodeLine ? `        node: ${nodeLine}\n` : ''}    steps:\n      - run: x\n  heavy:\n    runs-on: x\n`;
  const SUF = (p) => `$${'{'}{ matrix.node != ${p} && format(' node {0}', matrix.node) || '' }}`, NAME = 'heavy ${{ matrix.shard }}/7';
  const EXPR = (pre, all, base) => `$${'{'}{ fromJSON((${pre.map((p) => `startsWith(github.ref_name, '${p}')`).join(' || ')}) && '[${all}]' || '[${base}]') }}`;
  const F = {
    'the tree\'s shape': [NAME + SUF(22), EXPR(['ci/cut', 'ci/proof'], '22, 24', '22')],
    'one prefix': [NAME + SUF(22), EXPR(['ci/cut'], '22, 24', '22')],
    'no axis, a bare name (every commit before r140)': [NAME, null],
    'a plain list of two majors (every branch)': [NAME + SUF(22), '[22, 24]'],
    'a suffix with no axis': [NAME + SUF(22), null],
    'a bare name over the axis (two jobs of one name)': [NAME, EXPR(['ci/cut'], '22, 24', '22')],
    'the suffix names another primary': [NAME + SUF(20), EXPR(['ci/cut'], '22, 24', '22')],
    'a base of two majors': [NAME + SUF(22), EXPR(['ci/cut'], '22, 24', '22, 24')],
    'a base major the full list lacks': [NAME + SUF(22), EXPR(['ci/cut'], '24, 26', '22')],
  };
  const read = Object.fromEntries(Object.entries(F).map(([k, [n, l]]) => [k, workflowHeavyNodesAt(hj7(n, l))]));
  const want = { 'the tree\'s shape': '{"prefixes":["ci/cut","ci/proof"],"all":[22,24],"base":[22],"primary":22}', 'one prefix': '{"prefixes":["ci/cut"],"all":[22,24],"base":[22],"primary":22}', 'no axis, a bare name (every commit before r140)': '{"prefixes":[],"all":null,"base":null,"primary":null}' };
  const wrong = Object.entries(read).filter(([k, v]) => JSON.stringify(v) !== (want[k] || 'null'));
  ok(wrong.length === 0, `the heavy axis parser over ${Object.keys(F).length} fixtures: the tree's shape, one prefix and the bare matrix are read; a plain two-major list, a suffix with no axis, a bare name over the axis, another primary, a base of two, a base the list lacks — none${wrong.length ? ' — WRONG: ' + wrong.map(([k, v]) => `${k} → ${JSON.stringify(v)}`).join(' · ') : ''}`);
  const OLD = WF.replace(/\n {8}node: \$\{\{ fromJSON[^\n]*\n/, '\n').replace(/(\n {4}name: heavy \$\{\{ matrix\.shard \}\}\/\d+)\$\{\{[^\n]*\}\}\n/, '$1\n');
  ok(OLD !== WF && JSON.stringify(workflowHeavyNodesAt(OLD)) === want['no axis, a bare name (every commit before r140)'] && judgeMirrorRun({ sha: SHA, slug: SLUG, run: runOf(cut), jobs: jobsOf(), workflow: OLD }).ok,
    'a commit whose workflow has no heavy axis (every commit before r140) needs only the bare shards, on a release mirror too');
  const BAD = WF.replace(/(\n {8}node: )\$\{\{ fromJSON[^\n]*\n/, '$1[22, 24]\n');
  ok(BAD !== WF && refused(judge({ workflow: BAD, jobs: jobsOf(undefined, {}, FAST_JOBS, ALL) }), /heavy Node axis the verdict cannot read/), 'an axis the parser cannot read is REFUSED by the judge, never read as Node 22 alone'); }
{ const ONE = WF.replace(/\n    name: fast \$\{\{ matrix\.part \}\}\/2[^\n]*\n/, '\n'), CUT = ONE.replace(/\n    strategy:\n      fail-fast: false\n      matrix:\n        part: \[1, 2\]\n/, '\n');
  ok(ONE !== WF && CUT !== ONE && workflowFastPartsAt(CUT) === null && workflowFastPartsAt(ONE) === null, 'fixture: the workflow of ONE fast job (the shape before the split) defines no fast parts');
  ok(judgeMirrorRun({ sha: SHA, slug: SLUG, run: runOf(), jobs: jobsOf(undefined, {}, ['fast']), workflow: CUT }).ok
    && refused(judgeMirrorRun({ sha: SHA, slug: SLUG, run: runOf(), jobs: jobsOf(), workflow: CUT }), /no job «fast»/),
    'a commit whose workflow has ONE fast job needs exactly «fast» (its parts are not its jobs); a run of parts under it is refused'); }
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
// B-479e (1): every heavy shard job carries ONE «ci-heavy-self-skipped» annotation — `notes(path)` answers a job's annotations (default: none skipped)
// one note per shard job, each beginning with its job's name (the writer matches it); the fixture answers every job with all of them
const NOTE0 = Array.from({ length: N }, (_, k) => ({ title: SELF_SKIP_TITLE, message: `heavy ${k + 1}/${N} (0):`, annotation_level: 'notice' }));
const ghFor = (run, jobs, calls, total, notes = () => NOTE0) => (p) => { calls && calls.push(p); return /\/annotations\?/.test(p) ? notes(p) && notes(p).err ? notes(p) : { json: notes(p) } : /\/jobs\?/.test(p) ? { json: { total_count: total ?? jobs.length, jobs } } : { json: run }; };
const empty = (d) => !fs.existsSync(d) || fs.readdirSync(d).length === 0;
// B-18eb: THE RECORDED TWO-ATTEMPT RUN (the 2.369.410 push, run 44368748819 — attempt 2 re-ran heavy 3/7 and the heavy gate; every other
// job of attempt 2 is a COPY: a new id, attempt 1's start and end, a check run with no annotation). Each shard is read where it RAN.
const RE_FX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'mirror-reattempt-410.json'), 'utf-8'));
// the recorded run's workflow shape, PINNED (7 heavy shards, the fast tier in 2 parts) — never the tree's ci.yml, whose matrix moves
const RE_WF = ['name: ci', 'on: push', 'jobs:', '  fast:', '    name: fast ${{ matrix.part }}/2', '    runs-on: ubuntu-24.04', '    strategy:', '      fail-fast: false',
  '      matrix:', '        part: [1, 2]', '    steps:', '      - run: node scripts/ci.mjs --fast-part=${{ matrix.part }}/2', '  heavy-shards:', '    name: heavy ${{ matrix.shard }}/7',
  '    runs-on: ubuntu-24.04', '    strategy:', '      fail-fast: false', '      matrix:', '        shard: [1, 2, 3, 4, 5, 6, 7]', '    steps:',
  '      - run: node scripts/ci.mjs --heavy --dirty-ok --host=hosted --shard ${{ matrix.shard }}/7', '  heavy:', '    runs-on: ubuntu-24.04', '    steps:', '      - run: node -e 0', ''].join('\n');
const RE_R = makeRepo('reattempt');
git(RE_R, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
const RE_TIP = commit(RE_R, MIRROR_WORKFLOW, RE_WF, 'the recorded run\'s workflow');
// the fake gh over a recording: the run (its latest attempt), the latest list, each attempt's list (a job's check_run_url built from its
// id — an Actions job IS its check run), the annotations by check-run id ('unreadable' = gh fails)
const reGh = (fx, calls) => (p) => {
  calls && calls.push(p);
  const last = String(Math.max(...Object.keys(fx.attempts).map(Number)));
  const listOf = (k) => ({ ...fx.attempts[k], jobs: fx.attempts[k].jobs.map((x) => ({ ...x, check_run_url: `https://api.github.com/repos/${SLUG}/check-runs/${x.id}` })) });
  const at = /\/attempts\/(\d+)\/jobs\?/.exec(p);
  if (at) return fx.attempts[at[1]] ? { json: listOf(at[1]) } : { err: 'gh failed: HTTP 404' };
  if (/\/jobs\?filter=latest/.test(p)) return { json: listOf(last) };
  const an = /\/check-runs\/(\d+)\/annotations\?/.exec(p);
  if (an) return fx.annotations[an[1]] === 'unreadable' ? { err: 'gh failed: HTTP 502' } : { json: fx.annotations[an[1]] || [] };
  return { json: runOf({ head_sha: RE_TIP, id: fx.runId, run_attempt: Number(last), ...(fx.run || {}) }) };
};
const reWrite = (fx, calls, mod = { heavyVerdict }) => { const dir = scratch('re'); return { v: mod.heavyVerdict({ sha: RE_TIP, runId: String(fx.runId), repoRoot: RE_R, dir, hosted: HOSTED, ghJson: reGh(fx, calls), now: 1795030000000, by: 'gate' }), dir }; };
const reClone = () => JSON.parse(JSON.stringify(RE_FX)), reJob = (fx, k, n) => fx.attempts[k].jobs.find((x) => x.name === n);
// a THIRD attempt: the heavy gate re-run alone (a new start and end) — every shard job copied AGAIN, with attempt 2's start and end
const reThree = () => { const fx = reClone(), a2 = fx.attempts['2'];
  fx.attempts['3'] = { ...a2, jobs: a2.jobs.map((x) => ({ ...x, id: x.id + 900000000, run_attempt: 3, ...(x.name === 'heavy' ? { started_at: '2026-11-18T20:10:00Z', completed_at: '2026-11-18T20:10:05Z' } : {}) })) };
  return fx; };
// TWINS: heavy 2/7 started AND ended in the same second as heavy 4/7 (listed before it in attempt 1) — in attempt 1 and in its copy
const reTwin = () => { const fx = reClone(), end = reJob(fx, '1', 'heavy 4/7').completed_at; reJob(fx, '1', 'heavy 2/7').completed_at = end; reJob(fx, '2', 'heavy 2/7').completed_at = end; return fx; };
{ const s7 = workflowShardsAt(RE_WF), f7 = workflowFastPartsAt(RE_WF);
  ok(s7 && s7.n === 7 && f7 && f7.n === 2, `fixture: the recorded run's workflow shape, pinned in the suite — 7 heavy shards, the fast tier in 2 parts (read ${JSON.stringify(s7)} · ${JSON.stringify(f7)})`);
  const calls = [], { v, dir } = reWrite(RE_FX, calls), rec = v.ok ? v.rec : {}, vb = rec.vouchedBy || {};
  ok(v.ok && v.file === path.join(dir, `${RE_TIP}.mirror.green`) && rec.attempt === 2 && vb['heavy 4/7'] && vb['heavy 4/7'].attempt === 1 && vb['heavy 4/7'].job === reJob(RE_FX, '1', 'heavy 4/7').id
    && vb['heavy 3/7'] && vb['heavy 3/7'].attempt === 2 && vb['heavy 3/7'].job === reJob(RE_FX, '2', 'heavy 3/7').id && Object.keys(vb).length === 7
    && JSON.stringify(rec.skippedOnRunner) === JSON.stringify(['test-graduate-dial', 'test-vault-run-wire']),
    `the RECORDED two-attempt run verifies: each copy read at attempt 1, where it ran, heavy 3/7 at attempt 2, its re-run; the marker names which attempt vouches for which shard (${v.ok ? JSON.stringify(vb) : v.why})`);
  const anns = calls.map((p) => (/\/check-runs\/(\d+)\/annotations\?/.exec(p) || [])[1]).filter(Boolean).sort();
  // U2 L4: the fast parts' annotations too (their PLACED notes), each read where it RAN — attempt 2's are copies of attempt 1's
  const want = ['heavy 1/7', 'heavy 2/7', 'heavy 4/7', 'heavy 5/7', 'heavy 6/7', 'heavy 7/7', 'fast 1/2', 'fast 2/2'].map((n) => String(reJob(RE_FX, '1', n).id)).concat(String(reJob(RE_FX, '2', 'heavy 3/7').id)).sort();
  ok(calls.filter((p) => /\/actions\/runs\/44368748819\/attempts\/1\/jobs\?per_page=100$/.test(p)).length === 1 && !calls.some((p) => /\/attempts\/2\/jobs/.test(p)) && JSON.stringify(anns) === JSON.stringify(want),
    `…its GETs: attempt 1's job list once; NINE annotation reads — one per shard and one per fast part (U2 L4: its PLACED note) — each at the job that ran it, never a copy's empty check run (${anns.length} reads)`);
  const three = reThree(), c3 = [], v3 = reWrite(three, c3).v, vb3 = v3.ok ? v3.rec.vouchedBy : {};
  const planted = three.attempts['3'].jobs.filter((x) => /^heavy \d/.test(x.name)).every((x) => { const o = reJob(three, '2', x.name); return o.conclusion === 'success' && o.started_at === x.started_at && o.completed_at === x.completed_at; });
  ok(planted && v3.ok && v3.rec.attempt === 3 && Object.entries(vb3).every(([n, w]) => n === 'heavy 3/7' ? w.attempt === 2 && w.job === reJob(three, '2', n).id : w.attempt === 1 && w.job === reJob(three, '1', n).id)
    && Object.keys(vb3).length === 7 && c3.filter((p) => /\/attempts\/1\/jobs\?/.test(p)).length === 1 && c3.filter((p) => /\/attempts\/2\/jobs\?/.test(p)).length === 1,
    `THE EARLIEST: a third attempt (the heavy gate re-run alone) copies every shard AGAIN — attempt 2 holds a successful job of each name with the same start and end, and each shard is still read where it RAN (six at attempt 1, heavy 3/7 at attempt 2) (${v3.ok ? JSON.stringify(vb3) : v3.why})`);
  const twin = reTwin(), vt = reWrite(twin).v, vbt = vt.ok ? vt.rec.vouchedBy : {};
  ok(reJob(twin, '1', 'heavy 2/7').started_at === reJob(twin, '1', 'heavy 4/7').started_at && reJob(twin, '1', 'heavy 2/7').completed_at === reJob(twin, '1', 'heavy 4/7').completed_at
    && vt.ok && vbt['heavy 2/7'].job === reJob(twin, '1', 'heavy 2/7').id && vbt['heavy 4/7'].job === reJob(twin, '1', 'heavy 4/7').id,
    `TWINS: two shards that started AND ended in the same second are each read at their OWN original — the name is part of the match (${vt.ok ? 'verified' : vt.why})`);
  // CONTROLS — each proves its plant first (the close's rule b), then refuses and writes nothing
  const NONE4 = /cannot verify heavy 4\/7's suites \(read at attempt 2\): no «ci-heavy-self-skipped» annotation for heavy 4\/7/;
  ok((RE_FX.annotations[String(reJob(RE_FX, '2', 'heavy 4/7').id)] || ['x']).length === 0, 'fixture: the copy of heavy 4/7 in attempt 2 was read by hand and carries NO annotation');
  const moved = reClone(); reJob(moved, '1', 'heavy 4/7').completed_at = '2026-11-18T18:53:31Z';
  const vm = reWrite(moved);
  ok(reJob(moved, '1', 'heavy 4/7').completed_at !== reJob(moved, '2', 'heavy 4/7').completed_at && !vm.v.ok && NONE4.test(vm.v.why) && empty(vm.dir),
    `CONTROL (the train's red): a copy whose original is NOT found (its end differs) is read as itself — no note — and REFUSES, writing nothing (${vm.v.why})`);
  const started = reClone(); reJob(started, '1', 'heavy 4/7').started_at = '2026-11-18T18:21:11Z';
  const vs = reWrite(started);
  ok(reJob(started, '1', 'heavy 4/7').started_at !== reJob(started, '2', 'heavy 4/7').started_at && reJob(started, '1', 'heavy 4/7').completed_at === reJob(started, '2', 'heavy 4/7').completed_at
    && !vs.v.ok && NONE4.test(vs.v.why) && empty(vs.dir), `CONTROL: the same end with ANOTHER start is no original either — refuses, writing nothing (${vs.v.why})`);
  const failed = reClone(); reJob(failed, '1', 'heavy 4/7').conclusion = 'failure';
  const vf = reWrite(failed);
  ok(reJob(failed, '1', 'heavy 4/7').conclusion === 'failure' && !vf.v.ok && NONE4.test(vf.v.why) && empty(vf.dir), `CONTROL: an earlier job that did not conclude success vouches for nothing — refuses, writing nothing (${vf.v.why})`);
  const unread = reClone(); unread.annotations[String(reJob(unread, '1', 'heavy 4/7').id)] = 'unreadable';
  const vu = reWrite(unread);
  ok(unread.annotations[String(reJob(unread, '1', 'heavy 4/7').id)] === 'unreadable' && !vu.v.ok && /cannot verify heavy 4\/7's suites \(read at attempt 1, where it ran\): its annotations could not be read \(gh failed: HTTP 502\)/.test(vu.v.why) && empty(vu.dir),
    `CONTROL: an ORIGINAL whose annotations cannot be read refuses, naming the attempt it was read at, writing nothing (${vu.v.why})`);
  const gone = reClone(); delete gone.attempts['1'];
  const vg = reWrite(gone);
  ok(!gone.attempts['1'] && !vg.v.ok && /attempt 1's jobs could not be read/.test(vg.v.why) && empty(vg.dir), `CONTROL: an earlier attempt's job list that cannot be read refuses, writing nothing (${vg.v.why})`);
  const untold = reClone(); delete untold.attempts['1'].total_count;
  const vt0 = reWrite(untold);
  ok(!('total_count' in untold.attempts['1']) && untold.attempts['1'].jobs.length === RE_FX.attempts['1'].jobs.length && !vt0.v.ok && /attempt 1's job list carries no total count/.test(vt0.v.why) && empty(vt0.dir),
    `CONTROL (主开发 21:55Z): an earlier attempt's job list with NO total count — every job still there — refuses by name, writing nothing (${vt0.v.why})`);
  // GREEN IN ATTEMPT 1, RE-RUN BY HAND IN ATTEMPT 2 AND RED (主开发 21:55Z): attempt 1 all success; attempt 2 re-runs heavy 4/7 alone (a new
  // start and end) and it FAILS. The latest attempt's job is the one judged: the original's success in attempt 1 vouches for nothing
  const byHand = (runReads) => { const fx = reClone(), a1 = fx.attempts['1'];
    for (const x of a1.jobs) x.conclusion = 'success';
    fx.attempts['2'] = { total_count: a1.jobs.length, jobs: a1.jobs.map((x) => ({ ...x, id: x.id + 800000000, run_attempt: 2,
      ...(x.name === 'heavy 4/7' ? { conclusion: 'failure', started_at: '2026-11-18T19:30:00Z', completed_at: '2026-11-18T19:58:00Z' } : {}),
      ...(x.name === 'heavy' ? { conclusion: 'skipped', started_at: '2026-11-18T19:58:03Z', completed_at: '2026-11-18T19:58:03Z' } : {}) })) };
    fx.run = runReads; return fx; };
  const hand = byHand({ conclusion: 'failure' }), vh = reWrite(hand), handOk = byHand({ conclusion: 'success' }), vh2 = reWrite(handOk);
  const byHandPlanted = (fx) => fx.attempts['1'].jobs.every((x) => x.conclusion === 'success') && reJob(fx, '2', 'heavy 4/7').conclusion === 'failure' && reJob(fx, '2', 'heavy 4/7').started_at !== reJob(fx, '1', 'heavy 4/7').started_at;
  ok(byHandPlanted(hand) && !vh.v.ok && /conclusion is failure, not success/.test(vh.v.why) && empty(vh.dir),
    `GREEN IN ATTEMPT 1, RED WHEN RE-RUN BY HAND IN ATTEMPT 2: the run as GitHub then reads it (conclusion failure) is refused by name, writing nothing (${vh.v.why})`);
  ok(byHandPlanted(handOk) && !vh2.v.ok && /«heavy 4\/7» is failure, not success/.test(vh2.v.why) && empty(vh2.dir),
    `…and with the run read as success, the latest attempt's job refuses by its own name — attempt 1's green original vouches for nothing (${vh2.v.why})`);
  const paged = reClone(); paged.attempts['1'].total_count = 101;
  const vp = reWrite(paged);
  ok(paged.attempts['1'].total_count > paged.attempts['1'].jobs.length && !vp.v.ok && /more than one page/.test(vp.v.why) && empty(vp.dir), `CONTROL: an earlier attempt that spans more than one page refuses, writing nothing (${vp.v.why})`);
  ok(/repos\/\$\{slug\}\/actions\/runs\/\$\{runId\}\/attempts\/\$\{k\}\/jobs\?per_page=100/.test(fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8')),
    'WIRING: the writer reads each EARLIER attempt\'s job list (runs/<id>/attempts/<k>/jobs)'); }
{ const dir = scratch('mk'), calls = [];
  const v = heavyVerdict({ sha: tip, runId: '42745258349', repoRoot: R, dir, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf(), calls), now: 1794280000000, by: 'gate' });
  const rec = v.ok ? JSON.parse(fs.readFileSync(v.file, 'utf-8')) : {};
  ok(v.ok && v.file === path.join(dir, `${tip}.mirror.green`) && !fs.existsSync(path.join(dir, `${tip}.green`)), `a verified run WRITES <markers>/<sha>.mirror.green — its own file, never the box's <sha>.green (${v.ok ? path.basename(v.file) : v.why})`);
  ok(rec.scope === 'hosted' && rec.source === 'mirror' && rec.hosts === 'hosted' && JSON.stringify(rec.selected) === JSON.stringify(HOSTED) && JSON.stringify(rec.partial) === JSON.stringify(HOSTED)
    && rec.ghRun === 42745258349 && rec.attempt === 1 && rec.verifiedAt === 1794280000000 && rec.result === 'green' && rec.scope !== 'full',
    'the marker LISTS what the mirror ran — { scope: hosted, source: mirror, selected = partial = the hosted names } — never «full»; `partial` keeps a reader that predates the union from counting it');
  const notesAsked = calls.slice(2);
  ok(calls[0] === `repos/${SLUG}/actions/runs/42745258349` && calls[1] === `repos/${SLUG}/actions/runs/42745258349/jobs?filter=latest&per_page=100`
    && notesAsked.length === N + FAST_JOBS.length && notesAsked.every((c) => new RegExp(`^repos/${SLUG}/check-runs/[^/]+/annotations\\?per_page=100$`).test(c)),
    `bounded GETs on THIS repository's path: the run, its jobs (filter=latest), then ONE annotations read per heavy shard job (B-479e) and per fast job (U2 L4: its PLACED note) — ${notesAsked.length} of ${N} + ${FAST_JOBS.length}, ${calls.length} in all`); }
// U2 L4 (主开发 r5567): A JOB THAT USED A PLACED LINE IS NEVER VOUCHED FOR AS A BARE GREEN — every job's «ci-placed-reds» note is read (the
// heavy shards' in the read B-479e already makes, every fast part's and every other node major's in one read each), the marker lists them
// by job, the verdict's line says PASSED WITH PLACED LINES; two notes for one job, or a count its names do not make, is a job it cannot verify
{ const pnote = (message) => ({ title: PLACED_TITLE, message, annotation_level: 'warning' });
  const withNotes = (...extra) => () => [...NOTE0, ...extra];
  const d = scratch('mk-placed'), v = heavyVerdict({ sha: tip, runId: '13', repoRoot: R, dir: d, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf(), null, undefined, withNotes(pnote(`heavy 2/${N} (2): ${HOSTED[0]}=2`), pnote('fast 1/2 (1): test-zz-f=1'))) });
  const pr = v.ok ? v.rec.placedOnRunner || [] : [], said = v.ok ? heavyVerdictSaid(v.rec, '13', v.file) : '';
  ok(v.ok && pr.some((x) => x.job === `heavy 2/${N}` && x.name === HOSTED[0] && x.n === 2) && pr.some((x) => x.job === 'fast 1/2' && x.name === 'test-zz-f' && x.n === 1)
    && pr.some((x) => x.job === 'fast 1/2 node 24' && x.name === 'test-zz-f') && /PASSED WITH PLACED LINES \(not a green of those suites\)/.test(said) && !/ is green for /.test(said),
    `U2 L4: a job's PLACED note reaches the mirror's marker by job, suite and count, and its line says PASSED WITH PLACED LINES, never «is green» (${v.ok ? JSON.stringify(pr) : v.why})`);
  const d0 = scratch('mk-placed-none'), v0 = heavyVerdict({ sha: tip, runId: '14', repoRoot: R, dir: d0, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf()) });
  ok(v0.ok && v0.rec.placedOnRunner === undefined && / is green for /.test(heavyVerdictSaid(v0.rec, '14', v0.file)), 'CONTROL: with no placed note the marker carries none and the line says «is green» as before');
  const no2 = (extra) => { const dd = scratch('mk-placed-no'); const vv = heavyVerdict({ sha: tip, runId: '15', repoRoot: R, dir: dd, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf(), null, undefined, withNotes(...extra)) }); return { vv, empty: empty(dd) }; };
  const twice = no2([pnote(`heavy 2/${N} (1): ${HOSTED[0]}=1`), pnote(`heavy 2/${N} (1): ${HOSTED[1]}=1`)]), badCount = no2([pnote('fast 2/2 (3): test-zz-f=1')]);
  ok(!twice.vv.ok && new RegExp(`cannot verify heavy 2/${N}'s suites .*2 «ci-placed-reds» annotations`).test(twice.vv.why) && twice.empty
    && !badCount.vv.ok && /cannot verify fast 2\/2's placed lines .*counts 3 but names 1/.test(badCount.vv.why) && badCount.empty,
    `CONTROLS: two placed notes for one job, or a note whose count its names do not make, is a job the writer cannot verify — it refuses and writes nothing (${twice.vv.why} · ${badCount.vv.why})`); }
// B-479e (1) A SUITE THAT SKIPPED ITSELF ON THE RUNNER IS NOT ON THE LIST: every shard job's «ci-heavy-self-skipped» note is read
{ const notesWith = (names) => () => [{ title: 'another note', message: 'x' }, ...NOTE0.slice(1), { title: SELF_SKIP_TITLE, message: `heavy 1/${N} ${selfSkipBody(names)}` }];
  const d1 = scratch('mk-skip'), v1 = heavyVerdict({ sha: tip, runId: '11', repoRoot: R, dir: d1, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf(), null, undefined, notesWith([HOSTED[1]])) });
  ok(v1.ok && JSON.stringify(v1.rec.selected) === JSON.stringify([HOSTED[0]]) && JSON.stringify(v1.rec.partial) === JSON.stringify([HOSTED[0]]) && JSON.stringify(v1.rec.skippedOnRunner) === JSON.stringify([HOSTED[1]]),
    `a hosted suite that SKIPPED ITSELF on the runner leaves the mirror green's list — selected = partial = ${JSON.stringify(v1.rec && v1.rec.selected)}, skippedOnRunner ${JSON.stringify(v1.rec && v1.rec.skippedOnRunner)}`);
  const refusedW = (notes) => { const d = scratch('mk-skip-no'); const v = heavyVerdict({ sha: tip, runId: '12', repoRoot: R, dir: d, hosted: HOSTED, ghJson: ghFor(runOf({ head_sha: tip }), jobsOf(), null, undefined, notes) }); return { v, empty: empty(d) }; };
  const nNone = refusedW(() => [{ title: 'another note', message: 'x' }]), nErr = refusedW(() => ({ err: 'gh failed: HTTP 404' })), nBad = refusedW(() => [...NOTE0.slice(1), { title: SELF_SKIP_TITLE, message: `heavy 1/${N} (2): only-one` }]);
  const nNested = refusedW(() => [...NOTE0, { title: SELF_SKIP_TITLE, message: `heavy 1/${N} (0):` }]), nOther = refusedW(() => NOTE0.slice(1));
  const nAll = refusedW(notesWith(HOSTED));
  ok(!nNested.v.ok && /2 «ci-heavy-self-skipped» annotations for heavy 1\//.test(nNested.v.why) && !nOther.v.ok && /no «ci-heavy-self-skipped» annotation for heavy 1\//.test(nOther.v.why),
    'a job whose note is not ITS OWN (none naming its shard, or two — a nested run\'s note in a red tail) is refused');
  ok(!nNone.v.ok && /no «ci-heavy-self-skipped» annotation/.test(nNone.v.why) && nNone.empty && !nErr.v.ok && /annotations could not be read \(gh failed: HTTP 404\)/.test(nErr.v.why) && nErr.empty
    && !nBad.v.ok && /counts 2 but names 1/.test(nBad.v.why) && nBad.empty && !nAll.v.ok && /every hosted heavy suite skipped itself/.test(nAll.v.why) && nAll.empty,
    'a shard job with NO self-skip note, one whose notes cannot be read, an unreadable note, and a run where every hosted suite skipped: each REFUSED, nothing written');
  ok(selfSkippedInNotes([{ title: SELF_SKIP_TITLE, message: 'heavy 2/7 (0):' }], 'heavy 2/7').names.length === 0 && selfSkippedInNotes([{ title: SELF_SKIP_TITLE, message: 'heavy 2/7 (1): test-a' }, { title: SELF_SKIP_TITLE, message: 'heavy 2/7 (0):' }], 'heavy 2/7').err && selfSkippedInNotes({}, 'heavy 2/7').err
    && selfSkippedInNotes([{ title: SELF_SKIP_TITLE, message: 'heavy 3/7 (1): test-a' }], 'heavy 2/7').err && selfSkippedInNotes([{ title: SELF_SKIP_TITLE, message: 'heavy 2/7 (1): test-a' }], 'heavy 2/7').names.join() === 'test-a'
    && selfSkipBody(['test-b', 'test-a']) === '(2): test-a test-b' && selfSkipBody([]) === '(0):', 'PURE: the note is «heavy i/n (k): names sorted», read for ITS job only; two notes, another shard\'s, or notes that are no list are a job that cannot be verified');
  // the runner side's planted suites RUN as real children: in the heavy twin test-ci-heavy-verdict-real (B-7e49); the wiring stays here
  console.log('    B-479e: the four planted suites run as real children in the heavy twin test-ci-heavy-verdict-real');
  const CI = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/if \(r\.ok && r\.selfSkip\) selfSkipped\.push\(s\.name\);/.test(CI) && /skipped: selfSkipped\.length \? selfSkipped\.slice\(\)\.sort\(\) : undefined,/.test(CI)
    && /console\.log\(`\$\{SELF_SKIP_TAG\} \$\{selfSkipBody\(selfSkipped\)\}`\);\n\s*if \(process\.env\.GITHUB_ACTIONS\) console\.log\(`::notice title=\$\{SELF_SKIP_TITLE\}::\$\{shard \? `heavy \$\{shard\.i\}\/\$\{shard\.n\}` : 'heavy'\} \$\{selfSkipBody\(selfSkipped\)\}`\);/.test(CI),
    'WIRING: the heavy gate collects the self-skipped names into its marker, prints them ONCE, and on the Actions runner as ONE annotation the writer reads'); }
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
  ok(/else if \(affected && !partial\) \{[\s\S]{0,900}m\.kind === 'red'[\s\S]{0,300}if \(reds\.length\) noVerdict =/.test(SRC4) && /else if \(partial\) \{[\s\S]{0,200}existing = existingVerdictOf\(dir, sha\);[\s\S]{0,200}if \(existing\) noVerdict =/.test(SRC4) && /partial: !!\(only \|\| shard \|\| host\), affected: scope === 'affected'/.test(SRC4), 'WIRING: the partial / affected refusal (settleHeavyMarker) asks existingVerdictOf');
  const now = Date.now();
  const g = { kind: 'green', sha: S, scope: 'full', failed: [], mtimeMs: now - 1000 }, u = { kind: 'red', sha: S, unreadable: 'not a JSON object (null)', file: `/m/${S}.red`, failed: [], mtimeMs: 1 };
  const a1 = heavyAlreadyGreen({ markers: [g], sha: S, full: S, commitTimeMs: now - 60000, scope: 'full', now });
  const a2 = heavyAlreadyGreen({ markers: [g, u], sha: S, full: S, commitTimeMs: now - 60000, scope: 'full', now });
  ok(a1.skip === true && a2.skip === false && /UNREADABLE/.test(a2.why), `«already green» is never answered while an unreadable marker of that commit sits beside the green (${a2.why})`);
  ok(/readMarkers\(dir, \{ withUnreadable: true \}\)\.filter\(\(m\) => m\.kind === 'green' \|\| m\.kind === 'red'\)/.test(SRC4), 'WIRING: the launcher hands heavyAlreadyGreen the unreadable markers too');
  console.log('    §4e: scripts/ci.mjs --status run as a child (an unreadable red listed) runs in the heavy twin test-ci-heavy-verdict-real'); }

console.log('§4f the guard follow-ups (on r4): the writer, identity by file name, status time, an unreadable dir');
{ const S = 'd'.repeat(40), rec = { sha: S, result: 'green', failed: [], startedAt: 1, endedAt: 2, scope: 'affected', selected: ['test-x'] };
  const d1 = scratch('fu-aff'); fs.writeFileSync(path.join(d1, `${S}.red`), JSON.stringify(goodRec(S, 'red', { failed: ['test-x'] })));
  const r1 = settleHeavyMarker({ dir: d1, sha: S, rec, affected: true });
  const d2 = scratch('fu-aff-u'); fs.writeFileSync(path.join(d2, `${S}.red`), 'null');
  const r2 = settleHeavyMarker({ dir: d2, sha: S, rec, affected: true });
  const d3 = scratch('fu-aff-none'), r3 = settleHeavyMarker({ dir: d3, sha: S, rec, affected: true });
  ok(/affected run — keeping the existing RED/.test(r1.noVerdict) && fs.existsSync(path.join(d1, `${S}.red`)) && !fs.existsSync(path.join(d1, `${S}.green`)), `(i) an AFFECTED run at the red's own commit keeps its FULL red («${r1.noVerdict}»)`);
  ok(/UNREADABLE RED/.test(r2.noVerdict) && fs.readFileSync(path.join(d2, `${S}.red`), 'utf-8') === 'null', '…and an UNREADABLE red');
  { const dp = scratch('fu-aff-p'); fs.writeFileSync(path.join(dp, `${S}.red`), JSON.stringify(goodRec(S, 'red', { failed: ['test-x'], partial: ['test-x'] })));
    const rp = settleHeavyMarker({ dir: dp, sha: S, rec, affected: true });
    const dr = scratch('fu-aff-r'); fs.writeFileSync(path.join(dr, `${S}.red`), JSON.stringify(goodRec(S, 'red', { failed: ['test-x', 'test-y'] })));
    const rr = settleHeavyMarker({ dir: dr, sha: S, rec: { ...rec, result: 'red', failed: ['test-x'] }, affected: true });
    const dg = scratch('fu-aff-g'); fs.writeFileSync(path.join(dg, `${S}.green`), JSON.stringify(goodRec(S, 'green', { scope: 'affected', selected: ['test-z'], range: 'm..a' })));
    const rg = settleHeavyMarker({ dir: dg, sha: S, rec: { ...rec, result: 'red', failed: ['test-x'] }, affected: true });
    ok(/PARTIAL RED/.test(rp.noVerdict) && JSON.parse(fs.readFileSync(path.join(dp, `${S}.red`), 'utf-8')).partial
      && /keeping the existing RED/.test(rr.noVerdict) && JSON.parse(fs.readFileSync(path.join(dr, `${S}.red`), 'utf-8')).failed.length === 2
      && !rg.noVerdict && rg.file && fs.existsSync(path.join(dg, `${S}.red`)) && !fs.existsSync(path.join(dg, `${S}.green`)),
      `(i) as B-e56e's read put it: an affected run keeps a PARTIAL red too, never shrinks a red's failed list with its own, and a GREEN never stops it — its red replaces an affected green (${[rp.noVerdict, rr.noVerdict, rg.noVerdict || 'written'].map((x) => x.slice(0, 40)).join(' · ')})`); }
  ok(!r3.noVerdict && r3.file && fs.existsSync(r3.file), '…with no verdict there it writes its marker');
  // (ii) a marker's identity is its FILE NAME's commit
  const G = makeRepo('fu-ident'); const A = commit(G, 'a.txt', 'a\n', 'A'), X = commit(G, 'x.txt', 'x\n', 'X'); git(G, ['checkout', '-q', '-b', 'side', A]); const head = commit(G, 'h.txt', 'h\n', 'HEAD on side');
  const d4 = scratch('fu-short'); fs.writeFileSync(path.join(d4, `${A}.red`), JSON.stringify(goodRec(A.slice(0, 12), 'red', { failed: ['test-x'] })));
  const e4 = safely(() => existingVerdictOf(d4, A));
  ok(e4 && e4.kind === 'red' && !e4.unreadable && blockedBy(d4, head, G) === A, `(ii) a readable red whose sha FIELD is a short prefix is an EXISTING verdict to the writer, as it blocks the gate (${e4 && e4.sha})`);
  const d5 = scratch('fu-shortname'); fs.writeFileSync(path.join(d5, `${A.slice(0, 12)}.red`), 'null');
  const e5 = safely(() => existingVerdictOf(d5, A)), now = Date.now();
  const ag = heavyAlreadyGreen({ markers: [{ kind: 'green', sha: A, scope: 'full', failed: [], mtimeMs: now - 1000 }, { kind: 'red', sha: A.slice(0, 12), unreadable: 'not a JSON object (null)', file: `/m/${A.slice(0, 12)}.red`, failed: [], mtimeMs: 1 }], sha: A, full: A, commitTimeMs: now - 60000, scope: 'full', now });
  ok(e5 && e5.unreadable && ag.skip === false && /UNREADABLE/.test(ag.why), '…a BROKEN marker whose FILE NAME is a short sha is that commit\'s: the writer keeps it, «already green» is not answered');
  const d6 = scratch('fu-other'); fs.writeFileSync(path.join(d6, `${A}.red`), JSON.stringify(goodRec(X, 'red', { failed: ['test-x'] })));
  const b6 = heavyBlocker({ dir: d6, head, repoRoot: G });
  ok(b6 && b6.sha === A && b6.unreadable && /not the file's commit/.test(b6.unreadable), `…a red whose sha FIELD names another commit speaks for the commit its FILE NAME says — here A (an ancestor of HEAD), UNREADABLE, blocking (${b6 && b6.unreadable})`);
  const d6b = scratch('fu-other2'); fs.writeFileSync(path.join(d6b, `${X}.red`), JSON.stringify(goodRec(A, 'red', { failed: ['test-x'] })));
  const b6b = safely(() => heavyBlocker({ dir: d6b, head, repoRoot: G }));
  ok(b6b && !b6b.threw && b6b.sha === X && b6b.commit === A && b6b.unreadable, `THE FINAL LAW (B-e56e): a red NAMED for a commit off HEAD's line (X) whose sha FIELD names A — an ancestor of HEAD — BLOCKS on A: a red speaks for every commit its name OR field names, as master read the field (${b6b && (b6b.commit || b6b.threw || '').slice(0, 12)})`);
  { const d6c = scratch('fu-green-two'); fs.writeFileSync(path.join(d6c, `${A}.red`), JSON.stringify(goodRec(A, 'red', { failed: ['test-x'] }))); fs.writeFileSync(path.join(d6c, `${head}.green`), JSON.stringify(goodRec(X, 'green')));
    ok(blockedBy(d6c, head, G) === A, '…and a GREEN whose name (HEAD) and field (X) name two commits covers NOTHING: the red on A still blocks (a green speaks for one commit, only when name and field agree)'); }
  // (ii) round 2: a marker's COMMIT is the commit its file name RESOLVES to — compared as commits (主开发's skeptic: a short-named red
  // and a full-named green of the SAME commit were taken for two commits, and the green on the red's own commit cleared it)
  const R2 = makeRepo('fu-resolve'); const A2 = commit(R2, 'a.txt', 'a\n', 'A'), B2 = commit(R2, 'b.txt', 'b\n', 'B');
  const blk = (files, head) => { const d = scratch('fu-res'); for (const [n, rec] of files) fs.writeFileSync(path.join(d, n), JSON.stringify(rec)); const b = safely(() => heavyBlocker({ dir: d, head, repoRoot: R2 })); return b && !b.threw ? b.commit : (b && b.threw) || null; };
  const fullG = (n) => goodRec(n, 'green'), redT = (n) => goodRec(n, 'red', { failed: ['t1'] });
  const v1 = blk([[`${A2.slice(0, 12)}.red`, redT(A2)], [`${A2}.green`, fullG(A2)]], B2);
  const v2 = blk([[`${A2.slice(0, 12)}.red`, redT(A2)], [`${A2}.green`, fullG(A2)]], A2);
  const v3 = blk([[`${A2}.red`, redT(A2)], [`${A2.slice(0, 12)}.green`, fullG(A2)]], B2);
  const v4 = blk([[`${A2.slice(0, 7)}.red`, redT(A2)], [`${A2}.green`, { ...fullG(A2), scope: 'affected', selected: ['t1'] }]], B2);
  const vc = blk([[`${A2.slice(0, 12)}.red`, redT(A2)], [`${B2}.green`, fullG(B2)]], B2);
  ok(v1 === A2 && v2 === A2 && v3 === A2 && v4 === A2, `(ii) a short-named red and a full-named green of the SAME commit (or the reverse, at HEAD = B or A, or an affected green) are ONE commit: the green on the red's own commit clears nothing — BLOCKED ×4 (${[v1, v2, v3, v4].map((x) => (x || 'CLEAR').slice(0, 8)).join(' ')})`);
  ok(vc === null, '…CONTROL: a short-named red and a FULL green on a strict DESCENDANT — CLEAR');
  // the FINAL identity law (r3): a readable record's full sha FIELD wins over its name — the measured case: a short name git cannot
  // resolve (an AMBIGUOUS prefix answers «missing»), driven here with a resolver that finds nothing for any short name
  const none = () => new Map();
  const blkR = (files, head) => { const d = scratch('fu-res3'); for (const [n, body] of files) fs.writeFileSync(path.join(d, n), typeof body === 'string' ? body : JSON.stringify(body)); const b = safely(() => heavyBlocker({ dir: d, head, repoRoot: R2, resolveShort: none })); return b && !b.threw ? b.commit : (b && b.threw) || null; };
  const amb = blkR([[`${A2.slice(0, 7)}.red`, redT(A2)]], B2);
  ok(amb === A2, `(ii) final: a readable red whose FILE NAME is a short prefix git cannot resolve (ambiguous ⇒ «missing») and whose sha FIELD is the full commit speaks for the FIELD — BLOCKED, as master (${String(amb).slice(0, 12)})`);
  const lost = blkR([[`${A2.slice(0, 7)}.red`, 'null']], B2);
  ok(lost === null, '…a short name that resolves to NO commit, with no readable field, speaks for no commit — ignored, as master');
  const twin = blkR([[`${A2.slice(0, 7)}.red`, redT(A2)], [`${A2}.green`, fullG(A2)]], B2);
  ok(twin === A2, '…and a green on the field\'s own commit does not clear it (one commit, not two)');
  const dp = scratch('fu-prune'); const old = (n, t, k) => fs.writeFileSync(path.join(dp, `${n}.${k}`), JSON.stringify(goodRec(n.length === 40 ? n : A2, k, { endedAt: t })));
  old(A2.slice(0, 12), 300, 'red'); old(A2, 100, 'green'); old(B2, 200, 'green');
  safely(() => pruneMarkers(dp, 1, { repoRoot: R2 }));
  const leftP = fs.readdirSync(dp).sort();
  ok(leftP.length === 2 && leftP.includes(`${A2.slice(0, 12)}.red`) && leftP.includes(`${A2}.green`), `…prune groups by COMMIT: keep 1 keeps both files of the newest commit (a short and a full name of A), B goes (${leftP.map((f) => f.slice(0, 12)).join(' ')})`);
  // THE FINAL LAW's small one: a full TAG-object name is peeled like a short one — both name the tagged commit
  { const T = makeRepo('fu-tag'); const tA = commit(T, 'a.txt', 'a\n', 'A'), tB = commit(T, 'b.txt', 'b\n', 'B'); git(T, ['tag', '-a', '-m', 'an annotated tag on A', 'vA', tA]);
    let tagObj = null; try { tagObj = git(T, ['rev-parse', 'vA']); } catch { }   // §75: an old-object read behind a guard
    const dt = scratch('fu-tag-m'), dts = scratch('fu-tag-s');
    fs.writeFileSync(path.join(dt, `${tagObj}.red`), JSON.stringify(goodRec(tagObj, 'red', { failed: ['t1'] }))); fs.writeFileSync(path.join(dt, `${tA}.green`), JSON.stringify(goodRec(tA, 'green')));
    fs.writeFileSync(path.join(dts, `${tagObj.slice(0, 12)}.red`), JSON.stringify(goodRec(tagObj.slice(0, 12), 'red', { failed: ['t1'] }))); fs.writeFileSync(path.join(dts, `${tA}.green`), JSON.stringify(goodRec(tA, 'green')));
    const bt = safely(() => heavyBlocker({ dir: dt, head: tB, repoRoot: T })), bts = safely(() => heavyBlocker({ dir: dts, head: tB, repoRoot: T }));
    ok(tagObj !== tA && bt && bt.commit === tA && bts && bts.commit === tA, `a red named by a full TAG-object sha and one named by its short form both speak for the TAGGED commit — the green on that commit is the red's own and clears neither (${[bt, bts].map((b) => (b && (b.commit || b.threw)) || 'CLEAR').map((x) => String(x).slice(0, 10)).join(' ')})`); }
  // (iii) --status (scripts/ci.mjs run as a child) prints an unreadable row's FILE time: in the heavy twin test-ci-heavy-verdict-real (B-7e49)
  // (iv) a marker directory the writer cannot read, or write: a named «no verdict» line, never a crash
  const notDir = path.join(scratch('fu-notdir'), 'markers'); fs.writeFileSync(notDir, 'x');
  const r8 = safely(() => settleHeavyMarker({ dir: notDir, sha: S, rec, partial: true })), r9 = safely(() => settleHeavyMarker({ dir: notDir, sha: S, rec }));
  ok(!r8.threw && /marker directory cannot be read/.test(r8.noVerdict) && r8.writeFailed === true && !r9.threw && /could not be written/.test(r9.noVerdict) && r9.writeFailed === true, `(iv) a marker directory it cannot read or write ends in a NAMED no-verdict line, not a crash («${r8.noVerdict}» · «${r9.noVerdict}»)`); }

{ const SRCF = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/const \{ noVerdict, writeFailed \} = settleHeavyMarker\(/.test(SRCF) && /if \(writeFailed\) return 1;/.test(SRCF), 'a GREEN tier whose marker could not be written exits NON-ZERO (the run existed to write its verdict) — the gate reads writeFailed');
  console.log('    §4f: scripts/ci.mjs --status run as a child ((iii) the file time, a marker path that is a FILE) runs in the heavy twin test-ci-heavy-verdict-real'); }

console.log('§4g THE TABLE A FULL GREEN WAS RUN BY (B-479e) — it covers a failed suite only if that table knew it');
{ // the green's commit carries a table (B-479e's must: «is X still to be run» asks that commit's OWN scripts/ci.mjs row)
  const TABLE = (moved = 'heavy') => `export const SUITES = [\n  { name: 'test-new', tier: 'heavy', why: 'x · 1 s' },\n  { name: 'test-old', tier: 'heavy', why: 'x · 1 s' },\n  { name: 'test-moved', tier: '${moved}', why: 'x · 1 s' },\n];\n`;
  const T = makeRepo('table'); commit(T, 'scripts/ci.mjs', TABLE(), 'the table'); const a = commit(T, 'scripts/test-new.mjs', '// a suite\n', 'A adds test-new'), b = commit(T, 'b.txt', 'b\n', 'B'), h = commit(T, 'h.txt', 'h\n', 'HEAD');
  const dirOf = (green, failed = ['test-new'], extra = null) => { const d = scratch('tbl'); fs.writeFileSync(path.join(d, `${a}.red`), JSON.stringify(goodRec(a, 'red', { failed })));
    fs.writeFileSync(path.join(d, `${b}.green`), JSON.stringify(goodRec(b, 'green', green))); if (extra) fs.writeFileSync(path.join(d, `${h}.green`), JSON.stringify(goodRec(h, 'green', extra))); return d; };
  const knows = { table: { digest: 'x', heavy: ['test-new', 'test-old'] } }, older = { table: { digest: 'y', heavy: ['test-old'] } };
  ok(blockedBy(dirOf(older), h, T) === a, 'a FULL green whose table never knew the failed suite (an OLDER table — it never ran it) does NOT clear the red');
  ok(blockedBy(dirOf(knows), h, T) === null && blockedBy(dirOf({}), h, T) === null, '…one whose table knew it clears it; one with NO table (written before this) is read as before — it clears');
  ok(blockedBy(dirOf({ table: { heavy: 'test-new' } }), h, T) === a && blockedBy(dirOf({ table: null }), h, T) === a, '…a table that is not a list of names covers no failed name (fail closed)');
  ok(blockedBy(dirOf(older, ['test-new', 'test-old'], { scope: 'affected', selected: ['test-new'] }), h, T) === null, '…and the UNION still holds: the older FULL green covers test-old, an affected green listing test-new covers the rest');
  ok(blockedBy(dirOf(older, ['test-gone']), h, T) === null && blockedBy(dirOf(older, ['npm run build']), h, T) === null,
    '…but a failed name that is NO heavy suite at the green\'s commit (renamed or deleted since, or «npm run build») has nothing left to run: the FULL green covers it — else no run of the current tree could ever clear it');
  // THE MUST (B-479e, 主开发 08:53Z): a suite MOVED to the fast tier keeps its file — the file never says it is still to be run, the
  // commit's own row does. Moved: the FULL green at the commit that rows it fast clears its red (no list run can name a fast suite,
  // so nothing else ever could); CONTROL, the same history with the row still heavy at that commit: the older table's green does not.
  for (const tier of ['fast', 'heavy']) {
    const R = makeRepo(`moved-${tier}`); commit(R, 'scripts/ci.mjs', TABLE(), 'the table'); commit(R, 'scripts/test-moved.mjs', '// a suite\n', 'the suite');
    const rc = commit(R, 'r.txt', 'r\n', 'C: red on test-moved'), dc = commit(R, 'scripts/ci.mjs', TABLE(tier) + `// D: test-moved is ${tier}\n`, `D: test-moved is ${tier}`), hc = commit(R, 'h.txt', 'h\n', 'HEAD');
    const d = scratch(`moved-${tier}`); fs.writeFileSync(path.join(d, `${rc}.red`), JSON.stringify(goodRec(rc, 'red', { failed: ['test-moved'] })));
    fs.writeFileSync(path.join(d, `${dc}.green`), JSON.stringify(goodRec(dc, 'green', older)));
    let fileStays = false; try { fileStays = String(git(R, ['cat-file', '-t', `${dc}:scripts/test-moved.mjs`])).trim() === 'blob'; } catch { }
    ok(fileStays && blockedBy(d, hc, R) === (tier === 'fast' ? null : rc), tier === 'fast'
      ? '…a red on a suite MOVED to the fast tier since (its file stays) is cleared by the FULL green at the commit whose OWN table rows it fast — the door the block names opens it'
      : 'CONTROL: the same history with test-moved still a HEAVY row at the green\'s commit — the older table\'s FULL green does not clear its red');
  }
  { const N = makeRepo('no-table'); const nr = commit(N, 'r.txt', 'r\n', 'R'), nd = commit(N, 'd.txt', 'd\n', 'D'), nh = commit(N, 'h.txt', 'h\n', 'HEAD');
    const d = scratch('no-table'); fs.writeFileSync(path.join(d, `${nr}.red`), JSON.stringify(goodRec(nr, 'red', { failed: ['test-gone'] }))); fs.writeFileSync(path.join(d, `${nd}.green`), JSON.stringify(goodRec(nd, 'green', older)));
    ok(blockedBy(d, nh, N) === nr, '…and a green\'s commit whose table cannot be read keeps every failed name heavy (fail closed): its older table covers nothing it did not list'); }
  // THE READER FAILS CLOSED ON A SHAPE IT DOES NOT KNOW (the cure's read, 主开发 09:32Z): tableTiersOf gives a name's tier only for the
  // one-line row `{ name: 'x', tier: 'y'`; a name in another shape is null — heavy to the gate — and a name outside SUITES is no key
  { const T2 = (rows) => `export const SUITES = [\n${rows}\n];\nexport const EXCLUDED = [\n  { name: 'test-ex', why: 'manual' },\n];\n`;
    const tt = tableTiersOf(T2("  { name: 'test-a', tier: 'heavy', why: 'x · 1 s' },\n  { name: 'test-b', tier: 'fast', reads: ['src/'], why: 'x · 1 s' },\n  { name: 'test-c', reads: ['src/'], tier: 'fast', why: 'x' },\n  {\n    name: 'test-d',\n    tier: 'fast',\n  },\n  { name: \"test-e\", tier: 'fast' },"));
    ok(tt.ok && tt.tiers.get('test-a') === 'heavy' && tt.tiers.get('test-b') === 'fast' && tt.tiers.get('test-c') === null && tt.tiers.get('test-d') === 'fast' && tt.tiers.get('test-e') === null && !tt.tiers.has('test-ex') && tableTiersOf('const X = 1;\n').ok === false,
      `PURE tableTiersOf: a row's tier when it follows its name (a row over two lines too); a field between name and tier, or double quotes → null (a shape it does not know); EXCLUDED's names no key; no SUITES → not ok (${JSON.stringify([...tt.tiers])})`);
    const R = makeRepo('moved-drift'); commit(R, 'scripts/ci.mjs', TABLE(), 'the table'); commit(R, 'scripts/test-moved.mjs', '// a suite\n', 'the suite');
    const rc = commit(R, 'r.txt', 'r\n', 'C: red on test-moved'), dc = commit(R, 'scripts/ci.mjs', TABLE().replace("{ name: 'test-moved', tier: 'heavy',", "{ name: 'test-moved', reads: ['src/'], tier: 'fast',"), 'D: test-moved fast, in a shape the reader does not know'), hc = commit(R, 'h.txt', 'h\n', 'HEAD');
    const d = scratch('moved-drift'); fs.writeFileSync(path.join(d, `${rc}.red`), JSON.stringify(goodRec(rc, 'red', { failed: ['test-moved'] }))); fs.writeFileSync(path.join(d, `${dc}.green`), JSON.stringify(goodRec(dc, 'green', older)));
    ok(blockedBy(d, hc, R) === rc, '…so a row whose shape drifted keeps its suite HEAVY to the gate (fail closed): the older table\'s FULL green does not clear its red');
    const real = tableTiersOf(fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8')), unknown = [...real.tiers].filter(([, t]) => t === null).map(([n]) => n);
    ok(real.ok && real.tiers.size > 500 && unknown.length === 0 && SUITES.every((x) => real.tiers.get(x.name) === x.tier),
      `CENSUS: every SUITES row of this ci.mjs is the one-line shape the gate reads, its tier the table's own (${real.tiers.size} rows${unknown.length ? ' — NOT READ: ' + unknown.join(', ') : ''}) — a drifted row is red here, never a silent over-defence`); }
  ok(blockedBy(dirOf({ ...knows, skipped: ['test-new'] }), h, T) === a && blockedBy(dirOf(older, ['test-new'], { scope: 'affected', selected: ['test-new'], skipped: ['test-new'] }), h, T) === a,
    '…and a green in which the suite SKIPPED ITSELF does not vouch for it (B-479e (1) on the box\'s own markers): neither a FULL green nor a list');
  const du = scratch('tbl-u'); fs.writeFileSync(path.join(du, `${a}.red`), 'null'); fs.writeFileSync(path.join(du, `${b}.green`), JSON.stringify(goodRec(b, 'green', older)));
  ok(blockedBy(du, h, T) === null, '…an UNREADABLE red (no failed list to ask about) is still cleared by a FULL green, whatever its table (LAW B)');
  const t1 = heavyTableOf([{ name: 'test-b', tier: 'heavy' }, { name: 'test-a', tier: 'heavy' }, { name: 'test-f', tier: 'fast' }]), t2 = heavyTableOf([{ name: 'test-a', tier: 'heavy' }, { name: 'test-b', tier: 'heavy' }]);
  ok(t1.heavy.join() === 'test-a,test-b' && /^[0-9a-f]{16}$/.test(t1.digest) && t1.digest === t2.digest && heavyTableOf([{ name: 'test-a', tier: 'heavy' }]).digest !== t1.digest,
    'PURE heavyTableOf: the heavy names sorted (fast rows left out) and one digest per table, whatever the table order');
  const CIT = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/table: scope !== 'affected' && !only && !shard && !host \? heavyTableOf\(SUITES\) : undefined,/.test(CIT) && /const covers = \(g, f\) => ranIn\(g, f\) && \(\(fullOf\(g\) && tableKnows\(g, f\)\) \|\| listOf\(g\)\.includes\(f\)\);/.test(CIT),
    'WIRING: a FULL box run writes the table it ran by into its marker; the gate asks it before a FULL green covers a failed suite');
  ok(/spawnSync\('git', \['-C', repoRoot, 'show', `\$\{c\}:scripts\/ci\.mjs`\]/.test(CIT) && /\(g\.table\.heavy\.includes\(f\) \|\| !heavyAt\(g\.commit, f\)\)/.test(CIT) && !/isSuiteAt/.test(CIT),
    'WIRING: «nothing left to run» is asked of the green commit\'s OWN table (git show <commit>:scripts/ci.mjs), never of whether the suite\'s file exists'); }

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
const UNION_AT = SRC.indexOf("  const greens = all.filter((m) => m.kind === 'green' && !m.unreadable && m.commit);\n"), UNION_END = SRC.indexOf('  return null;\n}', UNION_AT);
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
  // (B-e56e: a {} or [] green has no sha field, so THE FINAL LAW alone makes it cover nothing — the shape check is the only guard for a
  // green whose name and field agree but whose record is not a green's: a «red» result, a `failed` that is no list)
  for (const body of ['null', JSON.stringify({ sha: rel, result: 'red', failed: [], endedAt: 2 }), JSON.stringify({ sha: rel, result: 'green', failed: 'test-x', endedAt: 2 })]) {
    const dir = scratch('mut-shape'); writeMarker(dir, red, 'red', ['test-x']); fs.writeFileSync(path.join(dir, `${rel}.green`), body);
    const b = blockedBy(dir, rel, G, mod.heavyBlocker);
    ok(b !== red && blockedBy(dir, rel, G) === red, `CONTROL: with the shape-check line deleted, §4b's leg for a ${body.slice(0, 40)} green fails BY NAME (${b === null ? 'the red is cleared' : String(b).slice(0, 60)}) — never a crash`);
  } }
{ const CATCH = "    console.error(`\\n[ci] PUSH BLOCKED — the heavy-gate markers cannot be read (${(e && e.message) || e}): a marker that cannot be read never opens the gate.`);\n    console.error('     Fix the marker directory, or — with a written word — VIBESPACE_SKIP_CI=1 git push\\n');\n    return 1;\n";
  ok(SRC.split(CATCH).length === 2, 'the guard\'s answer to a throw is ONE block (the mutant turns it back to «not blocking»)');
  const mod = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(CATCH, "    console.error(`[ci] WARNING: could not read the heavy-gate markers (${e.message}) — not blocking`);\n    return 0;\n"), 'notblocking')).href);
  const notDir = path.join(scratch('mut-catch'), 'markers'); fs.writeFileSync(notDir, 'x');
  ok(mod.checkHeavy({ dir: notDir, head: 'HEAD' }) === 0 && checkHeavy({ dir: notDir, head: 'HEAD' }) === 1, 'CONTROL: the catch turned back to «not blocking» answers 0 on an unreadable marker path; the real guard answers 1 — §4b\'s leg is the one that reds'); }
{ const REF = "  const all = readMarkers(dir, { withUnreadable: true }).filter((m) => m.kind === 'green' || m.kind === 'red');\n";
  ok(SRC.split(REF).length === 2, 'the writer\'s refusal question is ONE line (the mutant asks it of the readable markers only, as round 3 did)');
  const mod = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(REF, "  const all = readMarkers(dir).filter((m) => (m.kind === 'green' || m.kind === 'red') && !m.partial);\n"), 'refusal-r3')).href);
  const S = 'b'.repeat(40), dir = scratch('mut-refuse'); fs.writeFileSync(path.join(dir, `${S}.red`), 'null');
  const mv = safely(() => mod.existingVerdictOf(dir, S)), rv = safely(() => existingVerdictOf(dir, S));
  ok(mv === null && rv !== null && !rv.threw, 'CONTROL: round 3\'s question sees no verdict where a broken red sits (the partial run would erase it); the real one does — §4e\'s legs are the ones that red'); }
{ // B-18eb — the writer before this cure (every shard read at the latest attempt), a newest-first search, the name left out of the match
  const RAN = '    const { attempt: at, job: src } = ranIn(job);\n', ORDER = '    for (const { k, jobs } of earlier) {\n', NAME = 'x && x.name === job.name && ';
  ok(SRC.split(RAN).length === 2 && SRC.split(ORDER).length === 2 && SRC.split(NAME).length === 2, 'B-18eb: where a shard is read, the order the earlier attempts are searched in and the name in the match are ONE place each (the mutants swap exactly them)');
  const pre = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(RAN, '    const at = attempt, src = job;\n'), 'pre18eb')).href);
  const vpre = reWrite(RE_FX, null, pre);
  ok(!vpre.v.ok && /cannot verify heavy 4\/7's suites \(read at attempt 2\): no «ci-heavy-self-skipped» annotation for heavy 4\/7/.test(vpre.v.why) && empty(vpre.dir) && reWrite(RE_FX).v.ok,
    `BASE RED: the writer before this cure (every shard read at the latest attempt) refuses the RECORDED run by heavy 4/7, the first copy in its list — the push's red (${vpre.v.why}); the real writer verifies it`);
  const newest = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(ORDER, '    for (const { k, jobs } of [...earlier].reverse()) {\n'), 'newest18eb')).href);
  const vn = reWrite(reThree(), null, newest).v;
  ok(!vn.ok && /cannot verify heavy \d\/7's suites \(read at attempt 2, where it ran\): no «ci-heavy-self-skipped» annotation/.test(vn.why) && reWrite(reThree()).v.ok,
    `CONTROL: a writer that searches the NEWEST earlier attempt first lands on attempt 2's empty copy and refuses the third attempt (${vn.why}); the real one verifies it — §2's THE EARLIEST is the leg that reds`);
  const noname = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(NAME, 'x && '), 'noname18eb')).href);
  const vnn = reWrite(reTwin(), null, noname).v;
  ok(!vnn.ok && /cannot verify heavy 2\/7's suites/.test(vnn.why) && reWrite(reTwin()).v.ok,
    `CONTROL: a match without the name reads heavy 4/7's original for heavy 2/7 (the same start and end) and refuses (${vnn.why}); the real one verifies it — §2's TWINS is the leg that reds`); }
// B-737b (主开发 r201, 2026-11-20): A SUITE THAT RAN NO LEG VOUCHES FOR NOTHING. Checkpoint 61's hosted run of 2.369.412 counted seven
// heavy suites that ran NO leg on the runner as run — each closing «ALL PASS (0, 1 skipped)» — so the mirror green vouched for them.
// A closing that states ZERO passed legs, in any wording, is a whole-suite skip; one passed leg or more is a run suite (its skipped
// legs said as before); an uncounted closing is read as its words claim; a ✓ leg line is never a count. Every fact judged is printed.
// THE PLANTED SUITES' RUNS — nine planted suites run as real node children through this tree's reader, and through the release's
// (its RED CONTROL) — are the heavy twin's: scripts/test-ci-heavy-verdict-real.mjs (B-7e49, 主开发 r2496: a leg that starts a real
// child). The passed count read from the closing forms is PURE and stays here.
{ console.log('    B-737b: the nine planted suites run as real children in the heavy twin test-ci-heavy-verdict-real');
  const table = [['ALL PASS (0, 1 skipped)', 0], ['ALL PASS (197 passed, 0 failed, 1 skipped)', 197], ['[design-window] ALL PASS (199, 2 skipped) · ended', 199], ['ALL PASS (91; 52 red controls SKIPPED — not in this clone)', 91], ['test-oat-add-door-chrome: 20 passed, 0 failed', 20], ['PASS — 0 passed, 0 failed', 0], ['frp plugin test passed (① only)', null], ['ALL PASS — 4 s', null], ['✓ the counter says 0 passed', null]];
  const tbad = table.filter(([l, n]) => passedCountOf(l) !== n);
  console.log(`    B-737b passedCountOf: ${table.map(([l]) => `«${l}» → ${passedCountOf(l)}`).join(' · ')}`);
  ok(tbad.length === 0 && wholeSkipOf('x\nALL PASS (0, 1 skipped)\n') === 'ALL PASS (0, 1 skipped)' && wholeSkipOf('ALL PASS (3)') === undefined, 'B-737b PURE: the passed count read from the tree\'s closing forms (the hosted run\'s measured endings), none from a ✓ line or an uncounted closing', tbad);
}
// B-737b (主开发 r372): THE PERSON WHO CUTS IS TOLD WHICH SUITES RAN NO LEG ON THE RUNNER — the verdict's success line names them
{ const rec = { sha: 'a'.repeat(40), attempt: 1, selected: ['test-hosted-a'], jobs: ['heavy 1/2', 'heavy 2/2'], skippedOnRunner: ['test-browser-live-fit', 'test-app-install'] };
  const said = heavyVerdictSaid(rec, '44774335413', '/m/x.mirror.green'), none = heavyVerdictSaid({ ...rec, skippedOnRunner: undefined }, '7', '/m/y');
  console.log(`    B-737b the verdict's line: «${said}» · with none: «${none}»`);
  const CI737 = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/these 2 ran no leg there: prove them elsewhere: test-browser-live-fit, test-app-install/.test(said) && /1 heavy suites/.test(said) && /every hosted heavy suite ran a leg there/.test(none) && !/prove them elsewhere/.test(none)
    && CI737.includes('console.log(heavyVerdictSaid(v.rec, vRun, v.file, ranEarlier));'),
    'B-737b: the verdict\'s success line names the suites that ran no leg on the runner («these N ran no leg there: prove them elsewhere: …»), says so when there are none, and IS the line the CLI prints');
  // CONTROL: the release's line (a count only) names none of them
  const rel = `✓ heavy verdict: CI mirror run 44774335413 (attempt 1) is green for ${rec.sha} — the HOSTED half: ${rec.selected.length} heavy suites (${rec.jobs.join(', ')}) — wrote /m/x.mirror.green`;
  ok(!/test-browser-live-fit/.test(rel) && /test-browser-live-fit/.test(said), 'CONTROL: the release\'s success line (a count only) names no suite that ran no leg — the cut was decided without the list'); }
// THE TREE'S CLOSING WORDS (B-737b, the class): a suite that prints its OWN words for «nothing ran» says SKIP in them, else the reader
// cannot see it. Every top-level (unindented) printed literal of scripts/test-*.mjs that says nothing / no leg ran carries SKIP or a
// zero count — measured at f550f07e1: none does otherwise (the one indented «Ⓓ DID NOT RUN» is a leg's line with its red above it)
{ const NOTHING = /^(?=[^\s\\]).{0,80}?\b(?:nothing (?:ran|was run|to (?:do|run|test))|no legs? ran|zero legs|none ran|did not run)\b/i;
  // a printer that BEGINS a statement only (a fixture's printer inside a string literal is no closing of this suite)
  const said = (dir) => { const out = []; for (const f of fs.readdirSync(dir).filter((x) => /^test-.*\.mjs$/.test(x))) { const t = fs.readFileSync(path.join(dir, f), 'utf-8'); for (const m of t.matchAll(/(?:^|[;{)]\s*)console\.(?:log|error)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/gm)) { const lit = m[2].replace(/^(?:\\n)+/, ''); if (NOTHING.test(lit) && !/SKIP|ALL PASS \(0|\b0 passed\b/.test(lit)) out.push(`${f}: «${lit.slice(0, 80)}»`); } } return out; };
  const tree = said(path.join(REPO, 'scripts'));
  const pl = scratch('b737b-plant'); fs.writeFileSync(path.join(pl, 'test-zz-own-words.mjs'), "console.log('\\nnothing ran here: the tool is absent');\n");
  const plant = said(pl);
  console.log(`    B-737b the tree's own «nothing ran» closings without «SKIP»: ${tree.length ? tree.join(' · ') : 'none'} · the planted one: ${plant.join(' · ') || 'NOT FOUND'}`);
  ok(tree.length === 0 && plant.length === 1, 'B-737b: no suite of the tree closes on its own «nothing ran» words without SKIP (the reader would miss it); CONTROL: a planted one is found by name', { tree, plant }); }
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 6, label: '§5 ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

console.log('§6 THE CLI — known flags; refusals exit 3 and write nothing; it runs only when asked');
console.log('    §6: scripts/ci.mjs run as a child (its refusals, --check-heavy) runs in the heavy twin test-ci-heavy-verdict-real');
{ const calls = (SRC.match(/\bheavyVerdict\(/g) || []).length, defs = (SRC.match(/export function heavyVerdict\(/g) || []).length;
  ok(defs === 1 && calls === 2 && /if \(arg\('heavy-verdict'\) !== undefined\) \{[\s\S]{0,600}heavyVerdict\(\{ sha: vSha, runId: vRun, dir \}\)/.test(SRC),
    `the verdict runs only when asked: ONE call site, the --heavy-verdict branch (no timer, no hook, no launcher) — ${calls - defs} call(s)`); }

// r4344 (THE CLASS of 1f763b01c): no line of the dispatcher (ci.mjs main) carries a statement INSIDE its trailing comment. That commit
// appended words after «return exitFlushed(0);» with a «//» before them: the return became comment text, and every GREEN verdict fell
// through to «REFUSED … undefined» and exited 3. A census by reading, string-aware (a «//» in a quoted text is no comment).
{ const commentOf = (l) => { let q = null; for (let i = 0; i < l.length - 1; i++) { const c = l[i]; if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; } else if (c === "'" || c === '"' || c === '`') q = c; else if (c === '/' && l[i + 1] === '/') return l.slice(i + 2); } return null; };
  const CODE_IN = /\breturn\s+[\w.]+\(|\bexitFlushed\(|\bprocess\.exit\(/;
  const census = (text) => { const a = text.indexOf('\nfunction main(argv) {\n'), b = a < 0 ? -1 : text.indexOf('\n}\n', a); if (b < 0) return null;
    const lines = text.slice(a + 1, b).split('\n'), withComment = lines.filter((l) => commentOf(l) !== null);
    return { lines: lines.length, withComment: withComment.length, swallowed: withComment.filter((l) => CODE_IN.test(commentOf(l))).map((l) => l.trim()) }; };
  const now = census(SRC);
  const CURED = "ranEarlier)); // B-737b: the names that ran no leg on the runner, where the cut is read\n      return exitFlushed(0);";
  const RELEASE = "ranEarlier)); // B-737b: the names that ran no leg on the runner, where the cut is read return exitFlushed(0);";
  const red = SRC.includes(CURED) ? census(SRC.replace(CURED, RELEASE)) : null;
  ok(!!now && now.lines > 40 && now.withComment > 10 && now.swallowed.length === 0 && !!red && red.swallowed.length === 1 && /where the cut is read return exitFlushed\(0\);/.test(red.swallowed[0]),
    `THE DISPATCHER's CENSUS (r4344): ${now ? `${now.lines} lines, ${now.withComment} with a trailing comment, ${now.swallowed.length} holding a statement in it` : 'main() not found'}; CONTROL: the release's line (the verdict's return in its comment) is found by its text${red ? ` (${red.swallowed.length})` : ' — the cured lines are not in the file'}`); }

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

console.log('§7b THE LAUNCH PATH (B-e381 part 2) — never the pushing shell\'s PATH');
{
  // the measured shape (2026-11-01, the FULL tier a hook launched for 160045063): git's exec-path in front, the launching
  // checkout's own data/bin (on the workspace — a bindfs view over NFS), node from a version manager, the system dirs; plus a
  // home's ~/.local/bin on NFS (watched by the guard, never refused — it must stay) and a dir on an rclone mount (refused — it goes)
  const MI = [
    '22 1 8:1 / / rw,relatime shared:1 - ext4 /dev/sda1 rw',
    '36 22 0:32 / /srv/ws-nfs rw,relatime shared:9 - nfs4 store:/export rw,vers=4.2',
    '37 22 0:33 / /home/u/workspace rw,relatime shared:10 - fuse.bindfs /srv/ws-nfs rw,user_id=0',
    '38 22 0:34 / /mnt/r rw,relatime shared:11 - fuse.rclone remote: rw',
  ].join('\n') + '\n';
  const REPO_DIR = '/home/u/workspace/vibespace', PROD_BIN = REPO_DIR + '/data/bin', NODE = '/home/u/.nvm/versions/node/v24/bin', HOMEBIN = '/srv/ws-nfs/u/.local/bin';
  const HOOK_PATH = ['/usr/lib/git-core', PROD_BIN, NODE, HOMEBIN, '/usr/local/bin', '/usr/bin', '', '.', '/usr/bin/', '/mnt/r/tools/bin', '/bin'].join(':');
  const env = { PATH: HOOK_PATH, GIT_EXEC_PATH: '/usr/lib/git-core', VS_NO_REAL_CLI: '1' };
  const born = launchEnvOf(env, { mountinfo: MI, nodeDir: NODE, repoDir: REPO_DIR });
  const why = (d) => (born.dropped.find((x) => x.dir === d) || {}).why || '';
  ok(born.env.PATH === [NODE, HOMEBIN, '/usr/local/bin', '/usr/bin', '/bin'].join(':') && born.env.VS_NO_REAL_CLI === '1' && born.env.GIT_EXEC_PATH === '/usr/lib/git-core',
    `launchEnvOf: the hook's PATH is born as node + an NFS home's ~/.local/bin + the system dirs, the rest of the env kept (${born.env.PATH})`);
  ok(/exec-path/.test(why('/usr/lib/git-core')) && /launching checkout's own data\/bin/.test(why(PROD_BIN)) && /fuse\.rclone mount \/mnt\/r \(the guard refuses it\)/.test(why('/mnt/r/tools/bin')) && /relative/.test(why('.')) && /empty/.test(why('')) && !why(HOMEBIN),
    `…each drop said: ${born.dropped.map((x) => `${x.dir || '«»'} (${x.why})`).join(' · ')}`);
  const onMount = launchPath('/mnt/r/node/bin:/usr/bin', { mountinfo: MI, nodeDir: '/mnt/r/node/bin' });
  ok(onMount.path === '/mnt/r/node/bin:/usr/bin', 'node\'s own dir is kept even on a refused mount (the tier runs on it)');
  // node's dir spelled through a link whose target sits on a refused mount: kept by its resolved spelling — and NO entry is ever resolved
  const asked = [], viaLink = launchPath('/mnt/r/node/bin:/mnt/r/other/bin:/usr/bin', { mountinfo: MI, nodeDir: '/opt/node-link/bin', real: (d) => { asked.push(d); return d === '/opt/node-link/bin' ? '/mnt/r/node/bin' : d; } });
  ok(viaLink.path === '/mnt/r/node/bin:/usr/bin' && JSON.stringify(asked) === JSON.stringify(['/opt/node-link/bin']), `node's dir is matched by its resolved path (a version-manager link onto a refused mount is kept) and only node's own dir is resolved — never an entry (asked: ${asked.join(', ')})`);
  const SSHFS = MI + '39 22 0:35 / /home/u/workspace/sub rw - fuse.sshfs h:/x rw\n', SUBBIN = '/home/u/workspace/sub/tools/bin';
  const homeRoot = launchPath(`${SUBBIN}:/usr/bin`, { mountinfo: SSHFS, repoDir: '/home/u/workspace/sub/vibespace' }), noRoot = launchPath(`${SUBBIN}:/usr/bin`, { mountinfo: SSHFS });
  ok(homeRoot.path === `${SUBBIN}:/usr/bin` && noRoot.path === '/usr/bin', 'the launching checkout\'s own mount is the instance\'s «home» (the guard\'s class, never refused): an entry on it stays (CONTROL: with no checkout named, the same sshfs entry is storage and goes)');
  const bare = launchPath(HOOK_PATH, { mountinfo: '', gitExecPath: '/usr/lib/git-core', nodeDir: NODE });
  ok(bare.path.split(':').includes('/mnt/r/tools/bin') && bare.path.split(':').includes(PROD_BIN) && bare.judgedMounts === false,
    'CONTROL: with no mount table and no launching checkout the rclone dir and the data/bin stay — the two rules are what leave them out; the launch line then says the mounts were not judged');
  // (an EMPTIED seam is red by the first leg itself: it drives the exported launchEnvOf and checks the exact PATH)
  // WIRING: the launcher's detached child is spawned with launchEnvOf's env, never the bare GIT_ENV, and a failure is said
  const launcher = (src) => { const i = src.indexOf('function heavyLaunch('); return i < 0 ? '' : src.slice(i, src.indexOf('\nexport function checkHeavy(', i)); };
  const wired = (src) => { const f = launcher(src); return /try \{ born = launchEnvOf\(GIT_ENV\); \} catch \(e\) \{ born = \{ env: GIT_ENV/.test(f) && /the tier's PATH was NOT rebuilt/.test(f) && /spawn\(process\.execPath, args, \{ cwd: repo, detached: true, stdio: \['ignore', fd, fd\], env: born\.env \}\)/.test(f) && !/detached: true[^\n]*env: GIT_ENV/.test(f); };
  const PRE = SRC.replace("env: born.env });", "env: GIT_ENV });");
  ok(wired(SRC) && PRE !== SRC && !wired(PRE), 'WIRING: heavyLaunch spawns its detached tier with launchEnvOf(GIT_ENV), guarded and said (CONTROL: the pre-fix spawn line, env: GIT_ENV, fails the pin)');
}


console.log('§7c THE DIFFERENTIAL (B-e56e) — seeded marker sets: every «master BLOCKED → new CLEAR» is an honest union of list-scoped greens');
{ // MASTER'S READER, verbatim from 2056c98de (readMarkers + heavyBlocker's decision), its two git questions handed to the oracle
  const masterBlocker = ({ dir, head, exists, isAncestor }) => {
    const all = []; let files = [];
    try { files = fs.readdirSync(dir); } catch { return null; }
    for (const f of files) {
      const m = /^([0-9a-f]{7,40})\.(green|red|pid|skipped)$/.exec(f);
      if (!m) continue;
      let rec = {};
      try { rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch {}
      all.push({ ...rec, sha: rec.sha || m[1], kind: m[2], file: path.join(dir, f) });
    }
    all.sort((a, b) => (b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0));
    const reds = all.filter((m) => m.kind === 'red' && exists(m.sha));
    const greens = all.filter((m) => m.kind === 'green' && !m.partial && exists(m.sha));
    const coversRed = (g, red) => g.scope !== 'affected' || (red.failed || []).every((f) => Array.isArray(g.selected) && g.selected.includes(f));
    for (const red of reds) {
      if (!isAncestor(red.sha, head)) continue;
      const cleared = greens.some((g) => g.sha !== red.sha && isAncestor(red.sha, g.sha) && isAncestor(g.sha, head) && coversRed(g, red));
      if (!cleared) return red;
    }
    return null;
  };
  // THE NEW READER, the same oracle in place of its two git questions (and of the short-name / tag resolvers)
  const EX = "  const exists = (sha) => gitIn(repoRoot, ['cat-file', '-e', sha + '^{commit}']) !== null;\n";
  const IA = "  const isAncestor = (a, b) => spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', a, b], { env: GIT_ENV }).status === 0;\n";
  ok(SRC.split(EX).length === 2 && SRC.split(IA).length === 2, 'the new reader asks git exactly two questions, each ONE line (the oracle swaps exactly them)');
  const NEWR = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(EX, '  const exists = (sha) => globalThis.__CIV_DIFF.exists(sha);\n').replace(IA, '  const isAncestor = (a, b) => globalThis.__CIV_DIFF.isAncestor(a, b);\n'), 'differential')).href);
  let seed = 0x5eed389 >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)], hex = (n) => Array.from({ length: n }, () => pick([...'0123456789abcdef'])).join('');
  const sub = (a) => a.filter(() => rnd() < 0.5);
  const SUITES3 = ['t1', 't2', 't3'];
  const CASES = 300, dirD = scratch('differential');
  let mBlocked = 0, nBlocked = 0, loosened = 0, tightened = 0, judged = 0, masterThrew = 0;
  const bad = [];
  for (let c = 0; c < CASES && bad.length < 3; c++) {
    // a linear history; half the cases put two commits on one 9-character prefix (an AMBIGUOUS short name)
    const K = 4 + Math.floor(rnd() * 3), twin = rnd() < 0.5 ? hex(9) : null;
    const hist = Array.from({ length: K }, (_, k) => (twin && k >= K - 2 ? twin + hex(31) : hex(40)));
    const ord = new Map(hist.map((h, k) => [h, k]));
    // git's view of a name, as both readers hand it over: coerced to text (master passed a number or an array straight to git)
    const resolveO = (x0) => { if (x0 === null || x0 === undefined) return null; const x = String(x0); if (!/^[0-9a-f]{4,40}$/.test(x)) return null; const m = hist.filter((h) => h.startsWith(x)); return m.length === 1 ? m[0] : null; };
    globalThis.__CIV_DIFF = { exists: (x) => resolveO(x) !== null, isAncestor: (a, b) => { const x = resolveO(a), y = resolveO(b); return x !== null && y !== null && ord.get(x) <= ord.get(y); } };
    fs.rmSync(dirD, { recursive: true, force: true }); fs.mkdirSync(dirD, { recursive: true });
    const files = [];
    for (let i = 0, n = 1 + Math.floor(rnd() * 5); i < n; i++) {
      const kind = rnd() < 0.55 ? 'red' : 'green', target = rnd() < 0.1 ? hex(40) : pick(hist);
      const name = rnd() < 0.5 ? target : target.slice(0, 7 + Math.floor(rnd() * 5)), other = pick(hist);
      const field = pick([name, target, target.slice(0, 7 + Math.floor(rnd() * 5)), other, other.slice(0, 8), undefined, 7, [target], target.slice(0, 10).toUpperCase(), Number.parseInt(target.slice(0, 7), 16), target.slice(0, 5)]);
      const mirror = kind === 'green' && rnd() < 0.15, scope = mirror ? 'hosted' : pick(['full', 'full', 'affected', 'partial']);
      const rec = { ...(field === undefined ? {} : { sha: field }), result: kind, failed: kind === 'red' ? (rnd() < 0.85 ? sub(SUITES3).concat(pick(SUITES3)) : []) : [], startedAt: i + 1, endedAt: i + 1,
        ...(scope === 'partial' ? { scope: 'full', partial: sub(SUITES3).concat(pick(SUITES3)) } : scope === 'affected' ? { scope: 'affected', selected: sub(SUITES3).concat(pick(SUITES3)) } : { scope }),
        ...(mirror ? { source: 'mirror', selected: sub(SUITES3).concat(pick(SUITES3)) } : {}), ...(rnd() < 0.1 ? { absent: sub(SUITES3) } : {}) };
      if (mirror) rec.partial = rec.selected;
      const body = rnd() < 0.08 ? pick(['null', '{"sha":', '[]']) : JSON.stringify(rec);
      const fname = `${name}${mirror ? '.mirror' : ''}.${kind}`;
      fs.writeFileSync(path.join(dirD, fname), body);
      files.push({ fname, name, kind, mirror, body });
    }
    // …and in about a third of the sets a crafted UNION scene: a red failing t1 and t2, and two PARTIAL greens on later commits naming
    // one each (master never counts a partial green, so it blocks; the new reader may clear by the union — the leg's other direction)
    if (rnd() < 0.35 && K >= 3) {
      const k = Math.floor(rnd() * (K - 2)), j1 = k + 1 + Math.floor(rnd() * (K - k - 1)), j2 = k + 1 + Math.floor(rnd() * (K - k - 1));
      const put = (name, kind, rec) => { const body = JSON.stringify(rec), fname = `${name}.${kind}`; fs.writeFileSync(path.join(dirD, fname), body); files.push({ fname, name, kind, mirror: false, body }); };
      put(hist[k], 'red', { sha: hist[k], result: 'red', failed: ['t1', 't2'], startedAt: 90, endedAt: 90 });
      put(hist[j1], 'green', { sha: hist[j1], result: 'green', failed: [], scope: 'full', partial: ['t1'], startedAt: 91, endedAt: 91 });
      put(j2 !== j1 ? hist[j2] : hist[j1].slice(0, 12), 'green', { sha: hist[j2], result: 'green', failed: [], scope: 'full', partial: ['t2'], startedAt: 92, endedAt: 92 });
    }
    // THE SPEC — the final law written out on its own: a red speaks for its name's AND its field's commit; a green for one, when
    // readable and its name and field agree; a red clears when the union of list-scoped greens (or a FULL green) on strict
    // descendants up to HEAD covers every failed name (a red with no readable list: a FULL green only)
    const full40 = (x) => typeof x === 'string' && /^[0-9a-f]{40}$/.test(x);
    const nameOf = (x) => (full40(x) ? x : resolveO(x));
    const seen = new Map(); for (const f of files) seen.set(f.fname, f); // a later file of one name replaced the earlier
    const marks = [...seen.values()].map((f) => { let rec = null; try { rec = JSON.parse(f.body); } catch { } const why = markerShapeWhy(rec, f.kind, f.name, f.mirror); return { ...f, rec, readable: !why }; });
    const strL = (x) => Array.isArray(x) && x.every((v) => typeof v === 'string');
    const greensS = marks.filter((m) => m.kind === 'green' && m.readable).map((m) => ({ m, c: nameOf(m.name) && nameOf(m.name) === nameOf(m.rec.sha) ? nameOf(m.name) : null })).filter((g) => g.c);
    const fullG = (g) => !g.m.rec.partial && g.m.rec.scope !== 'affected' && g.m.rec.scope !== 'hosted' && g.m.rec.source !== 'mirror';
    const listG = (g) => { const r = g.m.rec; if (r.absent !== undefined && !strL(r.absent)) return []; const ab = new Set(r.absent || []); return [].concat(strL(r.selected) ? r.selected : [], strL(r.partial) ? r.partial : []).filter((x) => !ab.has(x)); };
    const redCommits = (m) => { const fld = m.rec && typeof m.rec === 'object' && !Array.isArray(m.rec) && m.rec.sha ? String(m.rec.sha) : null; return [...new Set([nameOf(m.name), fld === null ? null : nameOf(fld)].filter(Boolean))]; };
    const specBlocks = (head, onlyRed = null) => {
      for (const m of marks.filter((x) => x.kind === 'red' && (!onlyRed || x === onlyRed))) for (const c of redCommits(m)) {
        if (!ord.has(c) || ord.get(c) > ord.get(head)) continue;
        const failed = m.readable && strL(m.rec.failed) ? m.rec.failed : [];
        const desc = greensS.filter((g) => ord.has(g.c) && ord.get(g.c) > ord.get(c) && ord.get(g.c) <= ord.get(head));
        if (!(failed.length ? failed.every((f) => desc.some((g) => fullG(g) || listG(g).includes(f))) : desc.some(fullG))) return { m, c, desc };
      }
      return null;
    };
    for (const head of hist) {
      judged++;
      // master's reader THROWS on a `null` body (rec.sha of null); its guard answered «not blocking» (exit 0) — that answer is master's here
      let mv = null; try { mv = masterBlocker({ dir: dirD, head, ...globalThis.__CIV_DIFF }); } catch { masterThrew++; mv = null; }
      const nv = safely(() => NEWR.heavyBlocker({ dir: dirD, head, resolveShort: (names) => new Map(names.map((x) => [x, resolveO(x)])), peelFull: (names) => new Map(names.map((x) => [x, x])) }));
      if (nv && nv.threw) { bad.push({ c, head: head.slice(0, 9), why: `the new reader threw: ${nv.threw}`, files }); break; }
      const sv = specBlocks(head);
      if (mv) mBlocked++; if (nv) nBlocked++;
      if (!!nv !== !!sv) { bad.push({ c, head: head.slice(0, 9), why: `the new reader says ${nv ? 'BLOCKED' : 'CLEAR'}, the law says ${sv ? 'BLOCKED' : 'CLEAR'}`, files }); break; }
      if (!mv && nv) tightened++;
      if (mv && !nv) {   // LOOSER than master: must be an honest union — master's red, read by the law, is covered and a list-scoped green helps
        loosened++;
        const R = marks.find((x) => path.join(dirD, x.fname) === mv.file);
        const cs = R ? redCommits(R).filter((c) => ord.has(c) && ord.get(c) <= ord.get(head)) : [];
        const failedR = R && R.readable && strL(R.rec.failed) ? R.rec.failed : [];
        const listHelps = cs.some((c) => failedR.some((f) => greensS.some((g) => !fullG(g) && listG(g).includes(f) && ord.get(g.c) > ord.get(c) && ord.get(g.c) <= ord.get(head))));
        if (!R || !cs.length || specBlocks(head, R) || !listHelps) { bad.push({ c, head: head.slice(0, 9), why: `master BLOCKED on ${mv.file && path.basename(mv.file)}, the new reader CLEARS — not an honest union of list-scoped greens`, files }); break; }
      }
    }
  }
  for (const b of bad) console.log(`    CASE ${b.c} at HEAD ${b.head}: ${b.why}\n${b.files.map((f) => `      ${f.fname}  ${f.body}`).join('\n')}`);
  ok(!bad.length && judged >= CASES * 4, `${CASES} seeded marker sets × every HEAD of their history (${judged} verdicts): the new reader IS the final law everywhere, and every «master BLOCKED → new CLEAR» (${loosened}) is an honest union of list-scoped greens covering every failed name — master blocked ${mBlocked}, the new reader ${nBlocked}, stricter than master ${tightened}; master's reader threw ${masterThrew}× (a null body — its guard's «not blocking»)`);
  ok(loosened > 0 && tightened > 0, `the sets reach both directions (looser by an honest union: ${loosened} · stricter: ${tightened}) — the leg is not vacuous`);

  // §7d THE DIFFERENTIAL ON REAL GIT is the heavy twin's (scripts/test-ci-heavy-verdict-real.mjs, B-7e49): every verdict there asks real git
  console.log('§7d THE DIFFERENTIAL ON REAL GIT — runs in the heavy twin test-ci-heavy-verdict-real (every verdict there asks real git)');
}

console.log('§T THE HEAVY TWIN (B-7e49, 主开发 r2496) — the legs whose scene is a real child run in scripts/test-ci-heavy-verdict-real.mjs');
{ const TWIN = 'test-ci-heavy-verdict-real', read = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } };
  const TW = read(TWIN), ME = read('test-ci-heavy-verdict');
  // each moved leg by a line of its own (spelled in two parts here, so this file's text never holds one whole)
  const HOLDS = [['§7d THE DIFFERENTIAL ON REAL GIT', ' (B-e56e) — one fast-import history'], ['const got = await judgeWith(', 'runSuiteAsync);'],
    ['const gotRel = await judgeWith(', 'rel.runSuiteAsync);'], ['const cli = (args) => spawnSync(', "process.execPath, [path.join(REPO, 'scripts', 'ci.mjs')"],
    ["const fi = spawnSync('git', ['-C', RG, ", "'fast-import', '--quiet']"], ['const run1 = (name) => ', "runSuiteAsync({ name, tier: 'heavy'"],
    ["spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), ", "'--status'"]].map((p) => p.join(''));
  const held = HOLDS.filter((h) => TW.includes(h)), here = HOLDS.filter((h) => ME.includes(h));
  ok(held.length === HOLDS.length && here.length === 0,
    `the twin holds the moved legs (§2 B-479e's planted runs, §4e / §4f's --status children, B-737b's planted runs and their control, §6's CLI children, §7d) and this file runs none of them — held ${held.length} of ${HOLDS.length}, here ${here.length}`);
  const MB = (t) => { const a = t.indexOf('  const masterBlocker = ({ dir, head, exists, isAncestor }) => {\n'), b = a < 0 ? -1 : t.indexOf('\n  };\n', a); return b < 0 ? null : t.slice(a, b + 5); };
  ok(MB(ME) !== null && MB(TW) === MB(ME), 'master\'s reader in the twin (its §7d asks it of real git) is this file\'s §7c copy, byte for byte');
  const row = SUITES.find((s) => s.name === TWIN);
  ok(!!row && row.tier === 'heavy', `the twin is a HEAVY row of the tier (${row ? row.tier : 'no row'}): it runs in every whole heavy tier and where a change selects it`); }

console.log('§8 nothing left behind');
fs.rmSync(ROOT, { recursive: true, force: true });
const leftovers = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(`vs-civerdict-${process.pid}-`));
const children = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).filter((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf-8').includes(SLEEP_TAG); } catch { return false; } });
ok(leftovers.length === 0 && children.length === 0, `0 scratch dirs and 0 children left (${leftovers.length} dirs, ${children.length} processes)`);
report();
