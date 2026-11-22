#!/usr/bin/env node
// A SIGNAL THE HEAVY GATE CAN SEE (B-1217 member 3, the coordinator's r1401 / r1427, 2026-11-21 — lane bl-ci). test-ci-heavy-launch's
// leg «…on SIGTERM it removes that checkout» went red then green on hosted runners. PLACED BY READING: everything heavyGate does between
// the scratch checkout and the build's spawnSync is synchronous, so a SIGTERM that lands there is only QUEUED; the question asked before
// the build (`abandoned()`) could not see it, the build — spawned after the signal, outside the group that got it — ran to its end, and
// the checkout went only after it (past the leg's bound). The same at the build's own start: the question after the build was blind
// too, and a lane started a suite before the handler ran. The cure: scripts/ci.mjs `loopTurn()` (one whole turn of the event loop)
// before BOTH questions — then the questions as before.
// THE WINDOWS ARE PLACED, never loaded: a copy of ci.mjs in a STUB repository (ci-gate-kit's shape: the real module, a stub heavy suite)
// stalls where an env-named file says (it writes <file>.in on entry; each scene says the stall was reached):
//   VS_SIG_STALL_PRE   right after the scratch checkout is made (`wt = addScratchWorktree(sha, 'heavy')`) — before the question;
//   VS_SIG_STALL_BUILD inside runBuild, right before its spawnSync — after the pre-build question, at the build's own start.
// The stub's build appends to a file and holds 3 s; its one suite appends to another and holds 3 s.
//   ①② THE WINDOW BEFORE THE BUILD: SIGTERM in the stall — the cure builds NOTHING and the checkout is gone at once; RED CONTROL
//       (the loop turn before the pre-build question cut): the build RUNS after the signal and the checkout outlives the cure's bound.
//   ③④ THE BUILD'S OWN START: SIGTERM in the stall — the cure starts NO suite after the build; RED CONTROL (the loop turn before the
//       post-build question cut): a lane starts the suite and the signal kills it («✗ test-eml FAILED»).
//   ⑤ THE CHECKOUT IS GONE ON THE THREE EXIT ROADS (r1427): a signal before the build (①), during it, after it — gone, unregistered,
//       the lock released, no verdict.
//   ⑥ the wiring: one loopTurn before each question, nothing else of heavyGate's order moved.
// Real processes: each scene a real `ci.mjs --heavy --isolate` over its own stub repository, lock and markers; all side by side.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mktmp, tmpDirs, git, GIT_ENV, REPO } from './ci-gate-kit.mjs';

const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 10000, step = 25) => { const t = Date.now() + ms; while (Date.now() < t) { if (pred()) return true; await sleep(step); } return !!pred(); };
const kids = [];
const alive = (c) => c.exitCode === null && c.signalCode === null;
// THE EXIT GUARD: every scene's gate is a detached group of OUR child — ended (the group) while its handle says it lives
const endAll = () => { for (const c of kids) if (alive(c)) { try { process.kill(-c.pid, 'SIGKILL'); } catch { } } };
process.on('exit', () => { endAll(); for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15]]) process.once(sig, () => { endAll(); process.exit(128 + n); });

// ── the copies ───────────────────────────────────────────────────────────
const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf8');
const stallOn = (env) => `{ const f = process.env.${env}; if (f && fs.existsSync(f)) { try { fs.writeFileSync(f + '.in', String(process.pid)); } catch { } while (fs.existsSync(f)) sleepSync(20); } }`;
const WT_LINE = "      wt = addScratchWorktree(sha, 'heavy');\n";
const BUILD_SPAWN = "  const r = spawnSync('npm', ['run', 'build'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000, encoding: 'utf-8', env: { ...env, npm_config_logs_dir: path.join(npmDir, 'logs'), npm_config_cache: path.join(npmDir, 'cache'), npm_config_update_notifier: 'false' } });\n";   // B-ba47 pick B: the build's npm writes its logs and cache in the run's own folders
const PRE_TURN = '    await loopTurn();\n    let abandonedWhy = abandoned();\n';
const POST_TURN = '    if (!abandonedWhy) await loopTurn();\n';
const planted = (src, tag) => anchored(anchored(src, WT_LINE, WT_LINE + '      ' + stallOn('VS_SIG_STALL_PRE') + '   // PLANTED: the window before the build\n', tag + ': pre'),
  BUILD_SPAWN, '  ' + stallOn('VS_SIG_STALL_BUILD') + '   // PLANTED: the build\'s own start\n' + BUILD_SPAWN, tag + ': build');
const CURE = planted(SRC, 'the cure');
const NO_PRE = planted(anchored(SRC, PRE_TURN, '    let abandonedWhy = abandoned();\n', 'no pre turn'), 'no pre turn');
const NO_POST = planted(anchored(SRC, POST_TURN, '', 'no post turn'), 'no post turn');

// ── a stub repository: the module, its siblings, a build and a suite that say when they run ──
const STUB_SLICE = 'test-eml';   // a name the table puts in the HEAVY tier (ci-gate-kit's stub)
const SIBLINGS = ['scripts/git-env.mjs', 'scripts/scratch-run.mjs', 'scripts/scratch-sweep.mjs', 'scripts/scratch.mjs', 'src/fixture-guard.js', 'src/mount-path-class.js', 'scripts/affected-model.mjs', 'scripts/i18n-extract.mjs', 'scripts/reach-model.mjs', 'scripts/hang-report.mjs'];
function stub(tag, ciText) {
  const dir = mktmp('sig-' + tag), root = path.join(dir, 'repo');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'ci.mjs'), ciText);
  for (const f of SIBLINGS) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(root, f)); }
  const built = path.join(dir, 'built'), suite = path.join(dir, 'suite');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.0', private: true, scripts: { build: `node -e "require('fs').appendFileSync('${built}','b');setTimeout(()=>{},3000)"` } }) + '\n');
  fs.writeFileSync(path.join(root, 'scripts', STUB_SLICE + '.mjs'), `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(suite)}, 's');\nsetTimeout(() => console.log('ALL PASS (1)'), 3000);\n`);
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'gate@test.local']);
  git(root, ['config', 'user.name', 'gate test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'stub gate']);
  return { dir, root, sha: git(root, ['rev-parse', 'HEAD']), built, suite, lock: path.join(dir, 'lock'), markers: path.join(dir, 'm'), out: path.join(dir, 'out.log') };
}
const wtOf = (st) => (spawnSync('git', ['-C', st.root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8', env: GIT_ENV }).stdout || '').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9)).find((p) => path.resolve(p) !== path.resolve(st.root)) || null;
function launch(st, env = {}) {
  const fd = fs.openSync(st.out, 'a');
  const c = spawn(process.execPath, [path.join(st.root, 'scripts', 'ci.mjs'), '--heavy', '--sha=' + st.sha, '--isolate', '--markers=' + st.markers, '--only=' + STUB_SLICE, '--lock=' + st.lock],
    { cwd: st.root, env: { ...GIT_ENV, ...env }, detached: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  kids.push(c);
  return { c, exited: new Promise((r) => c.on('exit', () => r(true))) };
}
const sigterm = (k) => { if (alive(k.c)) { try { process.kill(-k.c.pid, 'SIGTERM'); } catch { } } };
const verdictIn = (st) => { try { return fs.readdirSync(st.markers).filter((f) => /\.(green|red)$/.test(f)); } catch { return []; } };
const said = (st) => { try { return fs.readFileSync(st.out, 'utf8'); } catch { return ''; } };
/** after the signal: how long until the checkout is gone (null: not within `ms`), then the exit facts */
async function settle(st, k, wt, ms) {
  const t0 = Date.now();
  const gone = await until(() => !!wt && !fs.existsSync(wt), ms);
  const goneMs = gone ? Date.now() - t0 : null;
  await Promise.race([k.exited, sleep(ms)]);
  const r = { goneMs, unregistered: !wtOf(st), lockGone: !fs.existsSync(st.lock), verdict: verdictIn(st), built: fs.existsSync(st.built), suiteRan: fs.existsSync(st.suite), out: said(st) };
  if (alive(k.c)) { try { process.kill(-k.c.pid, 'SIGKILL'); } catch { } await Promise.race([k.exited, sleep(2000)]); }
  if (wt && fs.existsSync(wt)) { try { fs.rmSync(wt, { recursive: true, force: true }); } catch { } }
  spawnSync('git', ['-C', st.root, 'worktree', 'prune'], { env: GIT_ENV });
  return r;
}
const BOUND = 2000;   // the cure's bound: the checkout gone this soon after the signal (the build alone holds 3 s)

/** ①–④: a SIGTERM while the gate sits in a placed stall */
async function stalled(ciText, tag, env) {
  const st = stub(tag, ciText), stall = path.join(st.dir, 'stall');
  fs.writeFileSync(stall, 'hold');
  const k = launch(st, { [env]: stall });
  const inStall = await until(() => fs.existsSync(stall + '.in'), 20000);
  console.log(`  · ${tag}: the placed stall (${env}) — ${inStall ? 'REACHED' : 'NOT reached'}`);
  const wt = wtOf(st), builtBefore = fs.existsSync(st.built);
  sigterm(k);
  await sleep(100);   // the signal is delivered (queued in the stalled, synchronous gate)
  fs.unlinkSync(stall);
  return { tag, inStall, wt: !!wt, builtBefore, ...(await settle(st, k, wt, 8000)) };
}
/** ⑤ the exit roads with no stall: a signal while the build runs, and while the suite runs */
async function road(tag, when) {
  const st = stub(tag, CURE);
  const k = launch(st);
  const reached = await until(() => fs.existsSync(when === 'build' ? st.built : st.suite), 20000);
  console.log(`  · ${tag}: the ${when} is running — ${reached ? 'REACHED' : 'NOT reached'}`);
  const wt = wtOf(st);
  sigterm(k);
  return { tag, reached, wt: !!wt, ...(await settle(st, k, wt, 8000)) };
}

console.log('the scenes, side by side (each stall or step said when reached):');
const [preCure, preCtl, startCure, startCtl, during, after] = await Promise.all([
  stalled(CURE, 'pre-cure', 'VS_SIG_STALL_PRE'), stalled(NO_PRE, 'pre-no-turn', 'VS_SIG_STALL_PRE'),
  stalled(CURE, 'start-cure', 'VS_SIG_STALL_BUILD'), stalled(NO_POST, 'start-no-turn', 'VS_SIG_STALL_BUILD'),
  road('during-build', 'build'), road('after-build', 'suite'),
]);
const brief = (r) => ({ ...r, out: r.out.split('\n').filter((l) => /stopping|✗|FAILED|build|VERDICT|ABORT/.test(l)).slice(0, 8) });

console.log('①② the window before the build');
for (const s of [preCure, preCtl]) ok(s.inStall && s.wt && !s.builtBefore, `${s.tag}: the scene was made — the gate stalled right after its scratch checkout, before any build, and was SIGTERMed there`, brief(s));
ok(!preCure.built && preCure.goneMs !== null && preCure.goneMs < BOUND && preCure.unregistered && preCure.lockGone && preCure.verdict.length === 0 && /stopping: this run was terminated from outside \(SIGTERM\)/.test(preCure.out),
  `① THE CURE: one whole loop turn before the pre-build question — the queued SIGTERM is SEEN: NO build, the checkout gone in ${preCure.goneMs} ms (< ${BOUND}), unregistered, the lock released, no verdict, and the run says why`, brief(preCure));
ok(preCtl.built && (preCtl.goneMs === null || preCtl.goneMs >= BOUND),
  `② RED CONTROL (the loop turn before the pre-build question cut, as released): the build RUNS after the signal and the checkout outlives ${BOUND} ms (${preCtl.goneMs === null ? 'not gone in 8 s' : preCtl.goneMs + ' ms'}) — the leg's red, made at will`, brief(preCtl));

console.log('③④ the build\'s own start');
for (const s of [startCure, startCtl]) ok(s.inStall && s.wt && !s.builtBefore && s.built, `${s.tag}: the scene was made — the gate stalled inside runBuild before its spawn, was SIGTERMed there, and the build (spawned after the signal) ran`, brief(s));
ok(!startCure.suiteRan && !/✗ test-eml FAILED/.test(startCure.out) && startCure.goneMs !== null && startCure.unregistered && startCure.lockGone && startCure.verdict.length === 0,
  '③ THE CURE: one whole loop turn before the post-build question — NO lane starts a suite for a run that is over; the checkout gone, unregistered, the lock released, no verdict', brief(startCure));
ok(/✗ test-eml FAILED/.test(startCtl.out) || startCtl.suiteRan,
  '④ RED CONTROL (the loop turn before the post-build question cut, as released): a lane STARTS the suite after the build and the signal kills it — «✗ test-eml FAILED»', brief(startCtl));

console.log('⑤ the checkout is gone on the three exit roads');
for (const s of [during, after]) ok(s.reached && s.wt && s.goneMs !== null && s.goneMs < BOUND + 3000 && s.unregistered && s.lockGone && s.verdict.length === 0,
  `${s.tag}: a SIGTERM while the ${s.tag === 'during-build' ? 'build' : 'suite'} runs — the checkout gone in ${s.goneMs} ms, unregistered, the lock released, no verdict`, brief(s));
ok(!!preCure.goneMs, '…and before the build: ① above');

console.log('⑥ the wiring');
{
  const hg = SRC.slice(SRC.indexOf('async function heavyGate('), SRC.indexOf('\n}\n', SRC.indexOf('async function heavyGate(')));
  const preAt = hg.indexOf(PRE_TURN), buildAt = hg.indexOf('noteChildResult(runBuild('), postAt = hg.indexOf(POST_TURN), askAt = hg.indexOf('abandonedWhy = abandonedWhy || abandoned();'), laneAt = hg.indexOf('const laneWorker = async');
  ok(/export const loopTurn = \(\) => new Promise\(\(res\) => setImmediate\(\(\) => setImmediate\(res\)\)\);/.test(SRC) && (hg.match(/await loopTurn\(\)/g) || []).length === 2,
    'ONE helper, loopTurn (two check phases: a whole poll phase between them), awaited twice in heavyGate');
  ok(preAt > 0 && preAt < buildAt && buildAt < postAt && postAt < askAt && askAt < laneAt,
    'its places: before the pre-build question, and after the build before the post-build question — before any lane; nothing else of heavyGate\'s order moved');
}
report();
