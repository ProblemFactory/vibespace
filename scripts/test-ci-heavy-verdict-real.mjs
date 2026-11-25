#!/usr/bin/env node
// test-ci-heavy-verdict-real — THE HEAVY TWIN of test-ci-heavy-verdict (B-7e49, lane card-door-in-chat, 主开发 r2459 / r2496: a leg
// that starts a real child may go to a heavy twin; every pure verdict leg and every red control whose scene needs no real child
// stays fast). The legs whose scene IS a real child moved VERBATIM, with their marks:
//   §2 B-479e's runner side — four planted suites run as real node children (a green suite that skipped ITSELF); its wiring leg
//      (pure, over the source) stays in the fast file;
//   §4e / §4f — scripts/ci.mjs --status run as a child: an unreadable red listed, (iii) its row's file time, a marker path that is
//      a file; every other leg of those sections stays;
//   §5 B-737b — nine planted suites run as real node children through this tree's runSuiteAsync, and (its RED CONTROL) through the
//      release's reader (073cc4a1e) as a mutant copy; the PURE passed-count leg stays in the fast file;
//   §6 THE CLI — scripts/ci.mjs run as a child: the --heavy-verdict refusals and --check-heavy's three answers; the one-call-site
//      leg (pure, over the source) stays in the fast file;
//   §6b THE VERDICT THROUGH THE REAL COMMAND (主开发 r4344) — scripts/ci.mjs --heavy-verdict run as a child against a scratch repository
//      whose one commit holds the running ci.mjs, with a stand-in gh on PATH: a green run exits 0 and prints one line, a failed run exits
//      3 with its reason; RED CONTROL: the release's line (the green branch's return inside its trailing comment) exits 3 on a green run;
//   §7d THE DIFFERENTIAL ON REAL GIT — one fast-import history, both readers asking git through their own doors; master's reader is
//      the fast file's §7c copy (verbatim from 2056c98de), held byte for byte by the fast file's §T pin.
// The fast file's §T pins that this file holds these legs, that it runs none of them, and that this row is heavy. Its host is the
// derivation's own: hosted (node and git; no desktop program, no binary the hosted image lacks). Every scratch path of this run
// lives under ROOT, removed at exit (the fast file's §8 judges its own); the mutant copies remove themselves.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { heavyBlocker, markerShapeWhy, runSuiteAsync, markerCommitsOf, resolveShortNames, SELF_SKIP_TITLE } from './ci.mjs';
import { REPO, ok, git, report, GIT_ENV } from './ci-gate-kit.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `vs-civerdict-real-${process.pid}-`));   // EVERY scratch path of this run lives here
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });   // even when a leg throws
let seq = 0;
const scratch = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const empty = (d) => !fs.existsSync(d) || fs.readdirSync(d).length === 0;
const safely = (f) => { try { return f(); } catch (e) { return { threw: String(e && e.message) }; } };
const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
const M = mutantCopies('ci-heavy-verdict-real', REPO);

console.log('§2 B-479e — the runner side: planted suites RUN (moved from test-ci-heavy-verdict §2: a leg that starts a real child)');
{
  // the runner side: a green suite whose LAST line begins «SKIP» skipped itself (the tree's convention), the gate says so ONCE
  const sr = scratch('selfskip-root'); fs.mkdirSync(path.join(sr, 'scripts'));
  fs.writeFileSync(path.join(sr, 'scripts', 'test-zz-skips.mjs'), "console.log('§1 nothing to do here');\nconsole.log('SKIP: no chrome/chromium on this machine');\n");
  fs.writeFileSync(path.join(sr, 'scripts', 'test-zz-runs.mjs'), "console.log('SKIP: one leg skipped');\nconsole.log('ALL PASS (3)');\n");
  fs.writeFileSync(path.join(sr, 'scripts', 'test-zz-skipped.mjs'), "console.log('SKIPPED (evidence above)');\n");
  fs.writeFileSync(path.join(sr, 'scripts', 'test-zz-zero.mjs'), "console.log('SKIP: no chrome');\nconsole.log('ALL PASS (0) — SKIPPED');\n");
  const run1 = (name) => runSuiteAsync({ name, tier: 'heavy', why: 'slow — 1 s' }, { root: sr });
  const rs = await run1('test-zz-skips'), rr = await run1('test-zz-runs'), rk = await run1('test-zz-skipped'), rz = await run1('test-zz-zero');
  ok(rs.ok && /^SKIP: no chrome/.test(rs.selfSkip || '') && rk.ok && /^SKIPPED/.test(rk.selfSkip || '') && rz.ok && /^ALL PASS \(0\)/.test(rz.selfSkip || '') && rr.ok && rr.selfSkip === undefined,
    `a green suite whose last line says SKIP / SKIPPED / ALL PASS (0) skipped ITSELF (the tree's three endings); one that skipped a leg and then passed did not`);
}

console.log('§4e / §4f --status — scripts/ci.mjs run as a child (moved from test-ci-heavy-verdict §4e / §4f)');
{ const S = 'a'.repeat(40);   // §4e's commit name
  const sdir = scratch('status'); fs.writeFileSync(path.join(sdir, `${S}.red`), 'null');
  const st = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--status', `--markers=${sdir}`], { cwd: REPO, encoding: 'utf-8', timeout: 60000 });
  ok(/UNREADABLE/.test(st.stdout) && /BLOCKS until a FULL green/.test(st.stdout), `--status lists an unreadable red as UNREADABLE (${(st.stdout.split('\n').find((l) => /UNREADABLE/.test(l)) || st.stdout.slice(0, 120)).trim()})`);
}
{ const S = 'd'.repeat(40);   // §4f's commit name
  // (iii) --status prints an unreadable row's FILE time
  const d7 = scratch('fu-status'); const f7 = path.join(d7, `${S}.red`); fs.writeFileSync(f7, 'null'); const t7 = Date.parse('2026-11-10T12:00:00Z') / 1000; fs.utimesSync(f7, t7, t7);
  const st = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--status', `--markers=${d7}`], { cwd: REPO, encoding: 'utf-8', timeout: 60000 });
  const row = (st.stdout.split('\n').find((l) => /UNREADABLE/.test(l)) || '');
  ok(row && !/1969|1970/.test(row) && row.includes(new Date(t7 * 1000).toLocaleString()), `(iii) --status prints an unreadable row with its FILE's time, never 1969 (${row.trim().slice(0, 90)})`);
}
{
  const notDir = path.join(scratch('fu-status-file'), 'markers'); fs.writeFileSync(notDir, 'x');
  const st = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), '--status', `--markers=${notDir}`], { cwd: REPO, encoding: 'utf-8', timeout: 60000 });
  ok(st.status === 1 && /marker directory .* cannot be read \(ENOTDIR\)/.test(st.stderr) && !/\n\s+at /.test(st.stderr), `--status on a marker path that is a FILE: a named line and exit 1, no stack trace (exit ${st.status}: ${st.stderr.trim().slice(0, 100)})`);
}

console.log('§5 B-737b — the planted suites RUN (moved from test-ci-heavy-verdict §5): a suite that ran no leg vouches for nothing');
// B-737b (主开发 r201, 2026-11-20): A SUITE THAT RAN NO LEG VOUCHES FOR NOTHING. Checkpoint 61's hosted run of 2.369.412 counted seven
// heavy suites that ran NO leg on the runner as run — each closing «ALL PASS (0, 1 skipped)» — so the mirror green vouched for them.
// A closing that states ZERO passed legs, in any wording, is a whole-suite skip; one passed leg or more is a run suite (its skipped
// legs said as before); an uncounted closing is read as its words claim; a ✓ leg line is never a count. Every fact judged is printed.
{ const sr = scratch('b737b-root'); fs.mkdirSync(path.join(sr, 'scripts'));
  const CASES = {
    'test-zz-noleg': [["  ⊘ SKIP the real agent-browser is not resolvable here", '', 'ALL PASS (0, 1 skipped)'], true],
    'test-zz-noleg-counted': [['  ⊘ SKIP no image here', '  ⊘ SKIP no image there', '', '0 passed, 0 failed, 2 skipped'], true],
    'test-zz-noleg-tagged': [['  ⊘ SKIP no T_HOST', '', '[zz] ALL PASS (0 passed, 0 failed, 1 skipped)'], true],
    'test-zz-skip-first': [['§1 nothing to do here', 'SKIP: no chrome/chromium on this machine'], true],
    'test-zz-zero': [['ALL PASS (0)'], true],
    'test-zz-mixed': [['  ✓ one leg ran', "  ⊘ SKIP the second leg's tool", '', 'ALL PASS (1, 1 skipped)'], false],
    'test-zz-mixed-counted': [['  ✓ legs', '  ⊘ SKIP one', '', '21 passed, 0 failed, 1 skipped'], false],
    'test-zz-words': [['  ✓ ① ran', '  ⊘ SKIP ② (no peer)', '', 'frp-like test passed (① only)'], false],
    'test-zz-legline': [['  ⊘ SKIP a side leg', '  ✓ the counter says 0 passed'], false],
  };
  for (const [n, [lines]] of Object.entries(CASES)) fs.writeFileSync(path.join(sr, 'scripts', n + '.mjs'), lines.map((l) => `console.log(${JSON.stringify(l)});`).join('\n') + '\n');
  const judgeWith = async (runner) => { const got = {}; for (const n of Object.keys(CASES)) { const r = await runner({ name: n, tier: 'heavy', why: 'slow — 1 s' }, { root: sr }); got[n] = { ok: r.ok, whole: !!r.selfSkip, said: r.selfSkip || null, skips: r.skips ? r.skips.n : 0 }; } return got; };
  const got = await judgeWith(runSuiteAsync);
  for (const [n, g] of Object.entries(got)) console.log(`    B-737b ${n}: green ${g.ok} · whole-suite skip ${g.whole}${g.said ? ` («${g.said}»)` : ''} · SKIP lines ${g.skips} — want ${CASES[n][1] ? 'whole' : 'run'}`);
  const bad = Object.keys(CASES).filter((n) => !got[n].ok || got[n].whole !== CASES[n][1]);
  ok(bad.length === 0, `B-737b: a closing that states ZERO passed legs is a whole-suite skip in every wording («ALL PASS (0, 1 skipped)», «0 passed, 0 failed, 2 skipped», «[tag] ALL PASS (0 passed, …)», «SKIP: …», «ALL PASS (0)»); one passed leg or more is a run suite, its skips still said; an uncounted closing reads as its words; a ✓ leg line is no count (${bad.length ? 'WRONG: ' + bad.join(', ') : 'all nine read as wanted'})`, got);
  // RED CONTROL: the release's reader (073cc4a1e: «SKIP…» or «ALL PASS (0)» only) counts the zero-leg suites as RUN — they vouch
  const REL = anchored(SRC, 'selfSkip = wholeSkipOf(stdout); // B-737b: zero legs passed, in any wording', "selfSkip = /^SKIP/.test(last) || /^ALL PASS \\(0\\)/.test(last) ? last.slice(0, 160) : undefined;", 'B-737b the release reader');
  const rel = await import(pathToFileURL(M.write('scripts/ci.mjs', REL, 'reader-073cc4a1e')).href);
  const gotRel = await judgeWith(rel.runSuiteAsync);
  console.log(`    B-737b CONTROL (the release's reader): ${Object.entries(gotRel).map(([n, g]) => `${n} ${g.whole ? 'whole' : 'run'}`).join(' · ')}`);
  ok(!gotRel['test-zz-noleg'].whole && !gotRel['test-zz-noleg-counted'].whole && !gotRel['test-zz-noleg-tagged'].whole && gotRel['test-zz-zero'].whole && gotRel['test-zz-skip-first'].whole,
    'CONTROL (the release\'s reader): «ALL PASS (0, 1 skipped)», «0 passed, …» and «[tag] ALL PASS (0 passed, …)» are counted as RUN — a suite that ran no leg vouches — RED for the law'); }

console.log('§6 THE CLI — known flags; refusals exit 3 and write nothing (moved from test-ci-heavy-verdict §6: ci.mjs run as a child)');
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

console.log('§6b THE VERDICT THROUGH THE REAL COMMAND (主开发 r4344): a green run exits 0 with its one line; a failed one exits 3 with its reason');
{ // THE WORLD: a scratch repository whose ONE commit holds a mirror workflow (7 heavy shards, the fast tier in 2 parts) and the running
  // ci.mjs's own bytes (hostedHeavyNamesAt reads the plan from the commit and wants the RUNNING file's blob there); its scripts/ is a folder
  // of links to this tree's scripts but ci.mjs, a real file of those bytes (the tree's, or for the control the release's line), src/ and
  // node_modules links. The child runs ITS scripts/ci.mjs (--preserve-symlinks-main: the tool's repo root is the scratch repository),
  // asking GitHub through a stand-in gh on PATH that answers made-up JSON by its API path and 404s every other.
  const SLUG = 'made-up-owner/made-up-repo', RUN_OK = '4344001', RUN_RED = '4344002';
  const WF = ['name: ci', 'on: push', 'jobs:', '  fast:', '    name: fast ${{ matrix.part }}/2', '    runs-on: ubuntu-24.04', '    strategy:', '      fail-fast: false',
    '      matrix:', '        part: [1, 2]', '    steps:', '      - run: node scripts/ci.mjs --fast-part=${{ matrix.part }}/2', '  heavy-shards:', '    name: heavy ${{ matrix.shard }}/7',
    '    runs-on: ubuntu-24.04', '    strategy:', '      fail-fast: false', '      matrix:', '        shard: [1, 2, 3, 4, 5, 6, 7]', '    steps:',
    '      - run: node scripts/ci.mjs --heavy --dirty-ok --host=hosted --shard ${{ matrix.shard }}/7', '  heavy:', '    runs-on: ubuntu-24.04', '    steps:', '      - run: node -e 0', ''].join('\n');
  const ID_ENV = { ...GIT_ENV, GIT_AUTHOR_NAME: 'made-up', GIT_AUTHOR_EMAIL: 'made-up@example.invalid', GIT_COMMITTER_NAME: 'made-up', GIT_COMMITTER_EMAIL: 'made-up@example.invalid' };
  const gitIn = (W, args, input) => { const r = spawnSync('git', ['-C', W, ...args], { input, env: ID_ENV, maxBuffer: 64 << 20 }); if (r.status !== 0) throw new Error(`git ${args[0]}: ${String(r.stderr || '').trim()}`); return String(r.stdout || '').trim(); };
  const world = (tag, ciBytes) => {
    const W = scratch(tag);
    gitIn(W, ['init', '-q']); gitIn(W, ['remote', 'add', 'origin', `git@github.com:${SLUG}.git`]);
    const bWf = gitIn(W, ['hash-object', '-w', '--stdin'], Buffer.from(WF)), bCi = gitIn(W, ['hash-object', '-w', '--stdin'], ciBytes);
    gitIn(W, ['update-index', '--add', '--cacheinfo', `100644,${bWf},.github/workflows/ci.yml`]);
    gitIn(W, ['update-index', '--add', '--cacheinfo', `100644,${bCi},scripts/ci.mjs`]);
    const sha = gitIn(W, ['commit-tree', gitIn(W, ['write-tree']), '-m', 'the mirror commit']);
    fs.mkdirSync(path.join(W, 'scripts'));
    for (const n of fs.readdirSync(path.join(REPO, 'scripts'))) if (n !== 'ci.mjs') fs.symlinkSync(path.join(REPO, 'scripts', n), path.join(W, 'scripts', n));
    fs.writeFileSync(path.join(W, 'scripts', 'ci.mjs'), ciBytes);
    for (const n of ['src', 'node_modules', 'package.json']) if (fs.existsSync(path.join(REPO, n))) fs.symlinkSync(path.join(REPO, n), path.join(W, n));
    return { W, sha };
  };
  // the made-up GitHub answers of one run (its jobs all success, each heavy shard's one «self-skipped» note naming no suite)
  const answers = (sha, runId, conclusion) => {
    const names = ['fast 1/2', 'fast 2/2', ...Array.from({ length: 7 }, (_, k) => `heavy ${k + 1}/7`), 'heavy'];
    const jobs = names.map((name, k) => ({ id: Number(runId) * 100 + k, name, status: 'completed', conclusion: 'success', started_at: '2026-11-25T00:00:00Z', completed_at: '2026-11-25T00:30:00Z',
      check_run_url: `https://api.github.com/repos/${SLUG}/check-runs/${Number(runId) * 100 + k}` }));
    const out = {
      [`repos/${SLUG}/actions/runs/${runId}`]: { id: Number(runId), repository: { full_name: SLUG }, head_repository: { full_name: SLUG }, path: '.github/workflows/ci.yml', event: 'push',
        head_sha: sha, head_branch: 'ci/made-up', status: 'completed', conclusion, run_attempt: 1, run_started_at: '2026-11-25T00:00:00Z' },
      [`repos/${SLUG}/actions/runs/${runId}/jobs?filter=latest&per_page=100`]: { total_count: jobs.length, jobs },
    };
    for (const j of jobs.filter((x) => /^heavy \d+\/7$/.test(x.name))) out[`repos/${SLUG}/check-runs/${j.id}/annotations?per_page=100`] = [{ title: SELF_SKIP_TITLE, message: `${j.name} (0):`, annotation_level: 'notice' }];
    return out;
  };
  const BIN = scratch('fake-gh-bin');
  fs.writeFileSync(path.join(BIN, 'gh'), ['#!/usr/bin/env node', "const fs = require('fs');", "const map = JSON.parse(fs.readFileSync(process.env.VS_FAKE_GH_MAP, 'utf8'));",
    'const a = process.argv.slice(2);', "if (a[0] !== 'api' || !Object.prototype.hasOwnProperty.call(map, a[1])) { process.stderr.write('gh: HTTP 404 Not Found ' + a.join(' ')); process.exit(1); }",
    'process.stdout.write(JSON.stringify(map[a[1]]));', ''].join('\n'), { mode: 0o755 });
  const verdict = (w, runId, map) => {
    const mapFile = path.join(w.W, `gh-${runId}.json`); fs.writeFileSync(mapFile, JSON.stringify(map));
    const markers = scratch('markers');
    const r = spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', path.join(w.W, 'scripts', 'ci.mjs'), '--heavy-verdict', w.sha, '--gh-run', runId, `--markers=${markers}`],
      { cwd: w.W, encoding: 'utf-8', timeout: 180000, env: { ...process.env, PATH: `${BIN}:${process.env.PATH}`, VS_FAKE_GH_MAP: mapFile } });
    const lines = String(r.stdout || '').split('\n').filter((l) => l.trim());
    return { status: r.status, lines, err: String(r.stderr || '').trim(), wrote: fs.existsSync(markers) ? fs.readdirSync(markers) : [] };
  };
  const CURED = "ranEarlier)); // B-737b: the names that ran no leg on the runner, where the cut is read\n      return exitFlushed(0);";
  const RELEASE = "ranEarlier)); // B-737b: the names that ran no leg on the runner, where the cut is read return exitFlushed(0);";
  const tree = world('verdict-tree', fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs')));
  const g = verdict(tree, RUN_OK, answers(tree.sha, RUN_OK, 'success'));
  ok(g.status === 0 && g.lines.length === 1 && /^✓ heavy verdict: CI mirror run 4344001 \(attempt 1\) is green for /.test(g.lines[0]) && !/REFUSED|undefined/.test(g.err) && g.wrote.includes(`${tree.sha}.mirror.green`),
    `a GREEN run through the real command: exit ${g.status}, ${g.lines.length} line(s) on stdout, its marker ${g.wrote.join(', ') || 'NOT written'}; stderr «${g.err.slice(0, 160)}»`);
  const f = verdict(tree, RUN_RED, answers(tree.sha, RUN_RED, 'failure'));
  ok(f.status === 3 && new RegExp(`heavy verdict REFUSED for ${tree.sha}: the run's conclusion is failure, not success — nothing written`).test(f.err) && !/undefined/.test(f.err) && f.lines.length === 0 && f.wrote.length === 0,
    `a FAILED run through the real command: exit ${f.status}, its reason «${f.err.slice(0, 200)}», nothing written (${f.wrote.length})`);
  // RED CONTROL: the release's line — the green branch's return inside its trailing comment — in a world of its own (its commit holds
  // that file's bytes): the same green run exits 3 and says «undefined»
  const SRC_NOW = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  const rel = SRC_NOW.includes(CURED) ? world('verdict-release', Buffer.from(SRC_NOW.replace(CURED, RELEASE))) : null;
  const c = rel ? verdict(rel, RUN_OK, answers(rel.sha, RUN_OK, 'success')) : null;
  ok(!!c && c.status === 3 && /heavy verdict REFUSED for [0-9a-f]{40}: undefined — nothing written/.test(c.err),
    `CONTROL (the release's line, r4344): the same green run exits ${c ? c.status : '(no copy: the cured lines are not in the file)'} and says «${c ? c.err.slice(-120) : ''}» — RED`); }

{ // MASTER'S READER, verbatim from 2056c98de — the fast file's §7c copy, held byte for byte there (§T)
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
  console.log('§7d THE DIFFERENTIAL ON REAL GIT (B-e56e) — one fast-import history; both readers ask git through their own doors; the law is read from the object list and the graph');
  {
    // THE HISTORY. Every id is computed here first (git's object format: «<type> <length>\0<body>», sha1), then ONE `git fast-import`
    // builds it and git's ids are read back. Two ROOT commits share 7 hex digits (TWIN7: a name two commits answer to); X, a child of
    // their merge, shares 7 hex digits with a BLOB in the same repository (XB7: a name a commit and a blob answer to). The numbers came
    // from a birthday search over these exact bodies («twin <i>» roots; «x <i>» children of the merge against the blobs «b<j>»,
    // j < 2^15), kept as constants so the leg costs a few hashes, never a search; the leg proves each shared name twice: by the ids it
    // computes and by git's own.
    const sha1 = (type, body) => createHash('sha1').update(Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body])).digest('hex');
    const WHO = 'gate test <gate@test.local> 1700000000 +0000';
    const BLOB_F = sha1('blob', Buffer.from('f\n')), TREE = sha1('tree', Buffer.concat([Buffer.from('100644 f\0'), Buffer.from(BLOB_F, 'hex')]));
    const commitId = (parents, msg) => sha1('commit', Buffer.from(`tree ${TREE}\n${parents.map((p) => `parent ${p}\n`).join('')}author ${WHO}\ncommitter ${WHO}\n\n${msg}`));
    const TWIN_A = 'twin 14501\n', TWIN_B = 'twin 21205\n', X_MSG = 'x 2622\n', XB_BODY = 'b16761\n';
    const rootA = commitId([], TWIN_A), rootB = commitId([], TWIN_B), merge = commitId([rootA, rootB], 'merge\n'), x = commitId([merge], X_MSG), xBlob = sha1('blob', Buffer.from(XB_BODY));
    const TWIN7 = rootA.slice(0, 7), XB7 = x.slice(0, 7);
    ok(rootB.startsWith(TWIN7) && !rootB.startsWith(rootA.slice(0, 8)) && xBlob.startsWith(XB7) && !xBlob.startsWith(x.slice(0, 8)),
      `the computed ids share exactly what the leg needs: two commits answer to ${TWIN7}, a commit and a blob to ${XB7} (one digit more tells each pair apart)`);
    const RG = scratch('real-git');
    git(RG, ['init', '-q', '--object-format=sha1', '-b', 'main']);
    // the repository's own word: a machine's core.disambiguate would move what a bare short name answers to (master and the reader alike); the law below reads «none»
    git(RG, ['config', 'core.disambiguate', 'none']);
    const data = (s) => `data ${Buffer.byteLength(s)}\n${s}`;
    const cm = (ref, mark, msg, from = []) => `commit refs/heads/${ref}\nmark :${mark}\nauthor ${WHO}\ncommitter ${WHO}\n${data(msg)}${from.map((f, k) => `${k ? 'merge' : 'from'} :${f}\n`).join('')}`;
    const stream = [`blob\nmark :1\n${data('f\n')}`, cm('ra', 2, TWIN_A) + 'M 100644 :1 f\n', cm('rb', 3, TWIN_B) + 'M 100644 :1 f\n', cm('main', 4, 'merge\n', [2, 3]),
      cm('main', 5, X_MSG, [4]), cm('main', 6, 'c1\n', [5]), cm('main', 7, 'c2\n', [6]), cm('main', 8, 'c3\n', [7]), cm('side', 9, 'side\n', [4]),
      `blob\nmark :10\n${data(XB_BODY)}`, `tag ann\nfrom :6\ntagger ${WHO}\n${data('ann\n')}`, 'reset refs/tags/light\nfrom :7\n'].join('\n') + '\n';
    const fi = spawnSync('git', ['-C', RG, 'fast-import', '--quiet'], { input: stream, encoding: 'utf-8', env: GIT_ENV });
    let back = [], objs = new Map(), readBack = '';
    if (fi.status === 0) {
      try {   // the leg's OWN repository read back (every git object read of a suite sits behind a guard: test-architecture §75)
        back = git(RG, ['rev-parse', 'ra', 'rb', 'main~4', 'main~3', 'main~2', 'main~1', 'main', 'side', 'refs/tags/ann', 'refs/tags/light']).split('\n');
        objs = new Map(git(RG, ['cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)']).split('\n').map((l) => l.split(' ')));
      } catch (e) { back = []; readBack = `: the read-back failed (${String(e && e.message).slice(0, 200)})`; }
    }
    const [, , , , c1, c2, c3, side, TAGOBJ, light] = back;
    const kinds = [...objs.values()].sort().join(' ');
    const built = fi.status === 0 && back.slice(0, 4).join() === [rootA, rootB, merge, x].join() && light === c2 && objs.get(xBlob) === 'blob' && objs.get(TAGOBJ) === 'tag'
      && kinds === 'blob blob commit commit commit commit commit commit commit commit tag tree';
    ok(built, `ONE fast-import built the history the leg computed: git's ids of the two roots, their merge and X are the computed ones; 12 objects (8 commits, 2 blobs, a tree, an annotated tag) and a lightweight tag${fi.status === 0 ? ` (${kinds})${readBack}` : `: ${String(fi.stderr).trim()}`}`);
    if (built) {
      // MASTER'S DOORS, verbatim from 2056c98de (its gitIn and its two git questions), asked of this repository
      const repoRoot = RG;
      const gitIn = (root, args) => { const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env: GIT_ENV }); return r.status === 0 ? (r.stdout || '').trim() : null; };
      const exists = (sha) => gitIn(repoRoot, ['cat-file', '-e', sha + '^{commit}']) !== null;
      const isAncestor = (a, b) => spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', a, b], { env: GIT_ENV }).status === 0;
      const asked = (n, form) => gitIn(repoRoot, ['rev-parse', '--verify', '-q', '--end-of-options', n + form]);
      ok(exists(XB7) && !isAncestor(XB7, c3) && isAncestor(x, c3) && asked(XB7, '^{commit}') === x && asked(XB7, '^{object}^{commit}') === null && !exists(TWIN7) && asked(TWIN7, '^{commit}') === null,
        `real git, as each door asks it: master's «cat-file -e ${XB7}^{commit}» says it exists, master's merge-base REFUSES ${XB7} (a commit and a blob answer to it), «rev-parse ${XB7}^{commit}» picks the commit (a commit hint), «${XB7}^{object}^{commit}» names none; ${TWIN7} (two commits) names none at every door`);
      // THE LAW, read from the object list and the graph (no door of either reader): a name is git's PLAIN resolution — a ref of this
      // repository, else a hex string (4 to 40 digits, either case) that exactly ONE object's id starts with — peeled to its commit
      const parents = new Map([[rootA, []], [rootB, []], [merge, [rootA, rootB]], [x, [merge]], [c1, [x]], [c2, [c1]], [c3, [c2]], [side, [merge]]]);
      const tagOf = new Map([[TAGOBJ, c1]]), refs = new Map([['ann', c1], ['light', c2], ['main', c3], ['side', side], ['ra', rootA], ['rb', rootB]]);
      const peel = (o) => (objs.get(o) === 'commit' ? o : objs.get(o) === 'tag' ? peel(tagOf.get(o)) : null);
      const lawName = (x0) => {
        if (x0 === null || x0 === undefined) return null;
        const s = String(x0);
        if (refs.has(s)) return refs.get(s);
        if (!/^[0-9a-fA-F]{4,40}$/.test(s)) return null;
        const hits = [...objs.keys()].filter((o) => o.startsWith(s.toLowerCase()));
        return hits.length === 1 ? peel(hits[0]) : null;
      };
      const anc = (a, b) => a === b || (parents.get(b) || []).some((p) => anc(a, p));
      const strL = (xs) => Array.isArray(xs) && xs.every((v) => typeof v === 'string');
      const marksOf = (files) => { const seen = new Map(); for (const f of files) seen.set(f.fname, f); return [...seen.values()].map((f) => { let rec = null; try { rec = JSON.parse(f.body); } catch { } return { ...f, rec, readable: !markerShapeWhy(rec, f.kind, f.name, f.mirror) }; }); };
      const fullG = (g) => !g.m.rec.partial && g.m.rec.scope !== 'affected' && g.m.rec.scope !== 'hosted' && g.m.rec.source !== 'mirror';
      const listG = (g) => { const r = g.m.rec; if (r.absent !== undefined && !strL(r.absent)) return []; const ab = new Set(r.absent || []); return [].concat(strL(r.selected) ? r.selected : [], strL(r.partial) ? r.partial : []).filter((f) => !ab.has(f)); };
      const greensOf = (marks) => marks.filter((m) => m.kind === 'green' && m.readable).map((m) => { const c = lawName(m.name); return { m, c: c && c === lawName(m.rec.sha) ? c : null }; }).filter((g) => g.c);
      const redCommits = (m) => { const fld = m.rec && typeof m.rec === 'object' && !Array.isArray(m.rec) && m.rec.sha ? String(m.rec.sha) : null; return [...new Set([lawName(m.name), fld === null ? null : lawName(fld)].filter(Boolean))]; };
      const lawBlocks = (marks, head, onlyRed = null) => {
        const gs = greensOf(marks);
        for (const m of marks.filter((r) => r.kind === 'red' && (!onlyRed || r === onlyRed))) for (const c of redCommits(m)) {
          if (!anc(c, head)) continue;
          const failed = m.readable && strL(m.rec.failed) ? m.rec.failed : [];
          const desc = gs.filter((g) => g.c !== c && anc(c, g.c) && anc(g.c, head));
          if (!(failed.length ? failed.every((f) => desc.some((g) => fullG(g) || listG(g).includes(f))) : desc.some(fullG))) return { m, c };
        }
        return null;
      };
      const put = (dir, files, name, kind, rec, { mirror = false, body = JSON.stringify(rec) } = {}) => { const fname = `${name}${mirror ? '.mirror' : ''}.${kind}`; fs.writeFileSync(path.join(dir, fname), body); files.push({ fname, name, kind, mirror, body }); };
      // ONE VERDICT, judged as §7c judges it: the reader IS the law; every «master BLOCKED → reader CLEAR» is an honest union
      const tallyG = { judged: 0, mBlocked: 0, nBlocked: 0, loosened: 0, tightened: 0, masterThrew: 0 }, badG = [];
      const judgeAt = (tag, dir, files, head, reader = heavyBlocker) => {
        const marks = marksOf(files);
        tallyG.judged++;
        let mv = null; try { mv = masterBlocker({ dir, head, exists, isAncestor }); } catch { tallyG.masterThrew++; mv = null; }
        const nv = safely(() => reader({ dir, head, repoRoot: RG }));
        const sv = lawBlocks(marks, head);
        const v = { master: !!mv, reader: !!nv && !nv.threw, law: !!sv };
        if (nv && nv.threw) { badG.push({ tag, head, why: `the reader threw: ${nv.threw}`, files }); return v; }
        if (mv) tallyG.mBlocked++; if (nv) tallyG.nBlocked++;
        if (!!nv !== !!sv) { badG.push({ tag, head, why: `the reader says ${nv ? 'BLOCKED' : 'CLEAR'}, the law says ${sv ? 'BLOCKED' : 'CLEAR'}`, files }); return v; }
        if (!mv && nv) tallyG.tightened++;
        if (mv && !nv) {
          tallyG.loosened++;
          const Rm = marks.find((m) => path.join(dir, m.fname) === mv.file), gs = greensOf(marks);
          const cs = Rm ? redCommits(Rm).filter((c) => anc(c, head)) : [];
          const failedR = Rm && Rm.readable && strL(Rm.rec.failed) ? Rm.rec.failed : [];
          const listHelps = cs.some((c) => failedR.some((f) => gs.some((g) => !fullG(g) && listG(g).includes(f) && g.c !== c && anc(c, g.c) && anc(g.c, head))));
          if (!Rm || !cs.length || lawBlocks(marks, head, Rm) || !listHelps) badG.push({ tag, head, why: `master BLOCKED on ${path.basename(String(mv.file))}, the reader CLEARS — not an honest union of list-scoped greens`, files });
        }
        return v;
      };
      const sceneOf = (tag, build) => { const dir = scratch(`real-git-${tag}`), files = []; build((name, kind, rec, o) => put(dir, files, name, kind, rec, o)); return { dir, files }; };
      // THE CRAFTED SCENE: a red on the merge (t1 failed), and a FULL green on X named by 9 digits whose sha field is XB7
      const loose = sceneOf('loose', (p) => { p(merge, 'red', { sha: merge, result: 'red', failed: ['t1'], startedAt: 1, endedAt: 1 }); p(x.slice(0, 9), 'green', { sha: XB7, result: 'green', failed: [], scope: 'full', startedAt: 2, endedAt: 2 }); });
      const vLoose = judgeAt('loose', loose.dir, loose.files, c3);
      ok(vLoose.master && vLoose.reader && vLoose.law, `a FULL green whose sha field is ${XB7} (a commit and a blob answer to it) clears NOTHING: master BLOCKED (its merge-base refuses the name), the reader BLOCKED, the law BLOCKED`);
      const plain = sceneOf('plain', (p) => { p(merge, 'red', { sha: merge, result: 'red', failed: ['t1'], startedAt: 1, endedAt: 1 }); p(x.slice(0, 9), 'green', { sha: x.slice(0, 8), result: 'green', failed: [], scope: 'full', startedAt: 2, endedAt: 2 }); });
      const vPlain = judgeAt('plain', plain.dir, plain.files, c3);
      ok(!vPlain.master && !vPlain.reader && !vPlain.law, '…and with ONE digit more in that field (a name only X answers to) all three CLEAR: the scene turns on the shared name alone');
      // RED CONTROL: the release's question (`<x>^{commit}`, a commit hint) planted back on a copy CLEARS the crafted scene master blocks
      const CURED = "['rev-parse', '--verify', '-q', '--end-of-options', `${n}^{object}^{commit}`]";
      ok(SRC.split(CURED).length === 2, 'the reader resolves a short name by ONE question: the plain name, then the peel');
      const HINTED = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(CURED, CURED.replace('^{object}^{commit}', '^{commit}')), 'real-git-hinted')).href);
      const vHinted = safely(() => HINTED.heavyBlocker({ dir: loose.dir, head: c3, repoRoot: RG }));
      ok(vHinted === null, `RED CONTROL: the release's question planted back (a commit hint) CLEARS the crafted scene — master BLOCKED it: looser than master, on real git (${vHinted && vHinted.threw ? 'it threw: ' + vHinted.threw : vHinted ? 'it blocked' : 'it cleared'})`);
      // BOTH DIRECTIONS, by name: a union of list-scoped greens (master never counts a partial green) and a red master's merge-base refuses
      const union = sceneOf('union', (p) => { p(x, 'red', { sha: x, result: 'red', failed: ['t1', 't2'], startedAt: 1, endedAt: 1 }); p(c1, 'green', { sha: c1, result: 'green', failed: [], scope: 'full', partial: ['t1'], startedAt: 2, endedAt: 2 }); p(c2, 'green', { sha: c2, result: 'green', failed: [], scope: 'full', partial: ['t2'], startedAt: 3, endedAt: 3 }); });
      const vUnion = judgeAt('union', union.dir, union.files, c3);
      ok(vUnion.master && !vUnion.reader && !vUnion.law, 'a red on X (t1, t2) and partial greens on c1 (t1) and c2 (t2): master BLOCKED, the reader and the law CLEAR — the honest union, on real git');
      const refused = sceneOf('refused', (p) => p(c1, 'red', { sha: XB7, result: 'red', failed: ['t3'], startedAt: 1, endedAt: 1 }));
      const vRefused = judgeAt('refused', refused.dir, refused.files, c3);
      ok(!vRefused.master && vRefused.reader && vRefused.law, `a red NAMED c1 whose sha field is ${XB7}: master CLEAR (it reads the field, and its merge-base refuses the name), the reader and the law BLOCK on the name's commit`);
      // A RED NAMED BY A SHARED NAME (主开发 r1398's small, said in the kb): name AND field both XB7 — it names NOTHING, as on master
      // (its merge-base refuses the name); the release's hinted question had blocked on it: stricter by accident, never a law
      const sharedRed = sceneOf('shared-red', (p) => p(XB7, 'red', { sha: XB7, result: 'red', failed: ['t1'], startedAt: 1, endedAt: 1 }));
      const vShared = judgeAt('shared-red', sharedRed.dir, sharedRed.files, c3);
      const vSharedHinted = safely(() => HINTED.heavyBlocker({ dir: sharedRed.dir, head: c3, repoRoot: RG }));
      ok(!vShared.master && !vShared.reader && !vShared.law && !!vSharedHinted && !vSharedHinted.threw,
        `a red whose name AND field are ${XB7} (a commit and a blob answer to it) names nothing: master CLEAR, the reader CLEAR, the law CLEAR — as before the release; the release's hinted question BLOCKED on it (stricter by accident, not a law)`);
      // THE GREEN's FIELD RULE (主开发 r1398's small): a green's field reaches git only when it is hex, 7 to 40 digits — at the door,
      // for any caller that hands markerCommitsOf a marker (the shape law upstream refuses such a FILE; the door no longer leans on it).
      // A red's field is still asked whatever its text, as master did (a red only blocks more).
      const doorAsk = (mod) => {
        const asked = [], mk = [{ kind: 'green', sha: c3.slice(0, 9), field: 'main' }, { kind: 'green', sha: side.slice(0, 9), field: 'side' }, { kind: 'red', sha: c1, field: 'light' }];
        const got = mod.markerCommitsOf(RG, mk, { resolveShort: (names) => { asked.push(...names); return mod.resolveShortNames(RG, names); } });
        return { asked, g0: got.get(mk[0]), g1: got.get(mk[1]), r: got.get(mk[2]) };
      };
      const door = doorAsk({ markerCommitsOf, resolveShortNames });
      ok(door.g0.length === 0 && door.g1.length === 0 && !door.asked.includes('main') && !door.asked.includes('side') && door.asked.includes('light') && door.r.join() === [c1, c2].join(),
        `a GREEN whose field is a revision word («main», «side») covers NOTHING and git is never asked the word; a RED's field «light» is asked and speaks for its commit (the red: c1 by its name, c2 by its field) — asked: ${door.asked.join(' ')}`);
      const RULE = "!m.unreadable && typeof m.field === 'string' && HEX.test(m.field) ? m.field : null";
      ok(SRC.split(RULE).length === 2, 'the green\'s field rule is ONE condition at the door (markerCommitsOf)');
      const NORULE = await import(pathToFileURL(M.write('scripts/ci.mjs', SRC.replace(RULE, RULE.replace(' && HEX.test(m.field)', '')), 'green-field-door')).href);
      const doorOld = doorAsk(NORULE);
      ok(doorOld.g0.join() === c3 && doorOld.g1.join() === side && doorOld.asked.includes('main'),
        `RED CONTROL: without the rule the same greens reach git and speak for c3 and the side commit (${(doorOld.g0 || []).map((x) => x.slice(0, 9)).join() || 'none'} · ${(doorOld.g1 || []).map((x) => x.slice(0, 9)).join() || 'none'})`);
      // THE SEEDED SETS, §7c's generator over this history's names (fewer sets: every verdict asks real git)
      let gs7 = 0x5eed3d7 >>> 0;
      const gRnd = () => { gs7 = (gs7 + 0x6D2B79F5) >>> 0; let t = gs7; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const gPick = (a) => a[Math.floor(gRnd() * a.length)], gSub = (a) => a.filter(() => gRnd() < 0.5);
      const HIST = [rootA, rootB, merge, x, c1, c2, c3, side], LINE = [rootA, merge, x, c1, c2, c3], T3 = ['t1', 't2', 't3'], NOWHERE = '0123456789abcdef'.repeat(3).slice(0, 40);
      const SETS = 8;
      for (let c = 0; c < SETS && badG.length < 3; c++) {
        const dir = scratch(`real-git-set-${c}`), files = [];
        for (let i = 0, n = 1 + Math.floor(gRnd() * 5); i < n; i++) {
          const kind = gRnd() < 0.55 ? 'red' : 'green', t = gRnd() < 0.1 ? gPick([NOWHERE, xBlob, TAGOBJ]) : gPick(HIST), other = gPick(HIST);
          const name = gRnd() < 0.4 ? t : gRnd() < 0.6 ? t.slice(0, 7 + Math.floor(gRnd() * 6)) : gPick([TWIN7, XB7, x.slice(0, 9), TAGOBJ, TAGOBJ.slice(0, 9)]);
          const field = gPick([name, t, t.slice(0, 7 + Math.floor(gRnd() * 6)), other, other.slice(0, 8), undefined, 7, [t], t.slice(0, 10).toUpperCase(), Number.parseInt(t.slice(0, 7), 16), t.slice(0, 5), 'light', 'ann', XB7, TWIN7, TAGOBJ.slice(0, 9), xBlob]);
          const mirror = kind === 'green' && gRnd() < 0.15, scope = mirror ? 'hosted' : gPick(['full', 'full', 'affected', 'partial']);
          const rec = { ...(field === undefined ? {} : { sha: field }), result: kind, failed: kind === 'red' ? (gRnd() < 0.85 ? gSub(T3).concat(gPick(T3)) : []) : [], startedAt: i + 1, endedAt: i + 1,
            ...(scope === 'partial' ? { scope: 'full', partial: gSub(T3).concat(gPick(T3)) } : scope === 'affected' ? { scope: 'affected', selected: gSub(T3).concat(gPick(T3)) } : { scope }),
            ...(mirror ? { source: 'mirror', selected: gSub(T3).concat(gPick(T3)) } : {}), ...(gRnd() < 0.1 ? { absent: gSub(T3) } : {}) };
          if (mirror) rec.partial = rec.selected;
          put(dir, files, name, kind, rec, { mirror, body: gRnd() < 0.08 ? gPick(['null', '{"sha":', '[]']) : JSON.stringify(rec) });
        }
        if (c % 2 === 0) {   // every other set carries a union scene on the main line
          const k = Math.floor(gRnd() * (LINE.length - 2)), j1 = k + 1 + Math.floor(gRnd() * (LINE.length - k - 1)), j2 = k + 1 + Math.floor(gRnd() * (LINE.length - k - 1));
          put(dir, files, LINE[k], 'red', { sha: LINE[k], result: 'red', failed: ['t1', 't2'], startedAt: 90, endedAt: 90 });
          put(dir, files, LINE[j1], 'green', { sha: LINE[j1], result: 'green', failed: [], scope: 'full', partial: ['t1'], startedAt: 91, endedAt: 91 });
          put(dir, files, j2 !== j1 ? LINE[j2] : LINE[j1].slice(0, 12), 'green', { sha: LINE[j2], result: 'green', failed: [], scope: 'full', partial: ['t2'], startedAt: 92, endedAt: 92 });
        }
        for (const head of [c3, side, gPick([x, c1, c2])]) judgeAt(`set ${c}`, dir, files, head);
      }
      for (const b of badG) console.log(`    ${b.tag} at HEAD ${b.head.slice(0, 9)}: ${b.why}\n${b.files.map((f) => `      ${f.fname}  ${f.body}`).join('\n')}`);
      ok(!badG.length && tallyG.judged === 5 + SETS * 3, `${SETS} seeded marker sets × 3 HEADs + the 5 crafted scenes (${tallyG.judged} verdicts, every one asking real git): the reader IS the law everywhere, and every «master BLOCKED → reader CLEAR» (${tallyG.loosened}) is an honest union of list-scoped greens — master blocked ${tallyG.mBlocked}, the reader ${tallyG.nBlocked}, stricter than master ${tallyG.tightened}; master's reader threw ${tallyG.masterThrew}× (its guard answered «not blocking»)`);
      ok(tallyG.loosened > 0 && tallyG.tightened > 0, `both directions are reached on real git (looser by an honest union: ${tallyG.loosened} · stricter: ${tallyG.tightened}) — the leg is not vacuous`);
    }
  }
}

report();
