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
// printing its victims, three mutant-copy controls) · §2b THE TIER RULE
// (B-f4cb, 2026-09-27: every fast row names its kind + a measured time < 10 s,
// and boots / drives / runs nothing its row does not allow — grep-derived,
// with controls) · §10 the launcher ONCE, for real, in a stub repository (the
// push-blocking pin test-ci-heavy-launch carried before it moved to heavy).
//
// SPLIT (lane fast-tier-ratchet, 2026-10-20): the one process ran 37 s — over THE TIER RULE's 10 s, and this LAW row stays
// fast — so the sections are now seven suites, each ≤ 10 s, their text unchanged: THIS file keeps §1 and §2 (§2b–§2g);
// scripts/test-ci-gate-push.mjs §3–§5 · test-ci-gate-tiers.mjs §6–§8 + §8d · test-ci-gate-shards.mjs §8b–§8c ·
// test-ci-gate-reaper.mjs §9–§10 · test-ci-gate-hang.mjs §11 · test-ci-gate-watchdog.mjs §12; what they share is
// scripts/ci-gate-kit.mjs.
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

  // §2b THE TIER RULE (B-f4cb, 2026-09-27 — ci.mjs, above the table). The fast
  // tier had grown to 184 suites / ~1050 s here and > 15 min on the runner, one
  // reasonable exception at a time, because nothing but a running total said
  // what belonged in it. Now a RULE does, and it is asserted: every fast row's
  // why begins with its KIND and carries its measured time (< FAST_MAX_MS
  // unless it is the named EXCEPTION), and the grep-derived disqualifiers —
  // a scratch server, a browser, a checkout, a real external program — hit
  // only what its row explicitly `allow`s, each allowance used.
  const src = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } };
  const ruleBad = fast.map((s) => [s.name, fastRuleFindings(s, src(s.name))]).filter(([, r]) => r.problems.length);
  ok(!ruleBad.length, `every fast row obeys THE TIER RULE (${ruleBad.map(([n, r]) => `${n}: ${r.problems.join('; ')}`).join(' | ') || `${fast.length} rows clean`})`);
  const allowed = fast.filter((s) => (s.allow || []).length);
  ok(allowed.length > 0 && allowed.length <= 5 && allowed.every((s) => /^(LAW|EXCEPTION)\b/.test(s.why || '')),
    `the allowances are few and each on a named LAW / EXCEPTION row (${allowed.map((s) => `${s.name}[${s.allow.join(',')}]`).join(', ')})`);
  const exceptions = fast.filter((s) => /^EXCEPTION\b/.test(s.why || '')).map((s) => s.name);
  ok(exceptions.join() === 'test-chat-e2e', `there is ONE exception, the owner's real turn (${exceptions.join(', ') || 'none'})`);
  const measured = fast.map((s) => fastRuleFindings(s, '').measuredMs || 0);
  const budget = measured.reduce((a, b) => a + b, 0);
  ok(FAST_SUM_CAP_MS === 918 * 1000, `the fast tier's sum cap is 918 s (2026-10-31, int367: +4 s UP to the measured truth — the union of the .367 picks' measured fast deltas, +7.15 s on the .366 base's 910.54 s: vault-standing-request +3.00, passkey-browse-yourself +3.40, touch-chip-cause +0.75 — each lane alone under 914, the train 917.69 s; 914 s since 2026-10-27, int360: +4 s for the union of the .360 picks' measured new fast suites — 909.23 s on the .359 base + 3.42 s; 910 s since 2026-10-25, lane engine-distribution: +6 s for P4's measured legs — the restated sum 907 s; 904 s since 2026-10-20, lane fast-tier-ratchet: the honest restated sum 883.7 s + 20 s — UP to the truth from 640 s, DOWN by the speed-ups; 600 s by policy until 2.369.316, 480 s until 2.369.263) — moving it is a deliberate edit here (${FAST_SUM_CAP_MS / 1000} s)`);
  ok(budget < FAST_SUM_CAP_MS, `the fast tier's measured sum stays under ${FAST_SUM_CAP_MS / 1000} s (${Math.round(budget / 1000)} s over ${fast.length} suites — the rule's point, re-measured)`);
  // The census must be able to go red — every disqualifier through its own
  // shape, the non-shapes that must NOT trip it, and every why rule.
  // The shapes are ASSEMBLED from pieces so this file's own source does not
  // spell them — the census runs over this file too (its row allows only the
  // throwaway-repository checkout).
  const T = { vnc: ['vnc', 'Env'].join(''), onb: ['ONBOARDED', 'SOURCE'].join('_'), hl: '--' + 'headless=new', dbg: '--' + 'remote-debugging-port', wt: ['work', 'tree'].join(''),
    dt: ['dt', 'ach'].join(''), cv: ['command', '-v'].join(' '), cx: ['co', 'dex'].join(''), xs: ['startX', 'Server'].join('') };
  const hitsOf = (code) => fastRuleFindings({ why: 'PURE · 1 ms' }, code).hits.join();
  ok(hitsOf(`const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, ...(await ${T.vnc}()) } });`) === 'server', 'NEG: a server.js spawn (its §57 passport) is a server');
  ok(hitsOf(`execFileSync('git', ['-C', repo, '${T.wt}', 'add', '--detach', wt, 'HEAD']);`) === 'checkout', 'NEG: a git worktree add is a checkout');
  ok(hitsOf(`await page.evaluateOnNewDocument(${T.onb});`) === 'chrome' && hitsOf(`const c = spawn(CHROME, ['${T.hl}', '${T.dbg}=' + p]);`) === 'chrome',
    'NEG: a page suite (its §47 onboarded passport) and a hand-launched chrome are chrome');
  ok(hitsOf(`spawn('${T.dt}', ['-c', sock]);`) === 'binary' && hitsOf(`const w = execFileSync('sh', ['-c', '${T.cv} ${T.cx}']);`) === 'binary'
    && hitsOf(`await dm.openSession({ cmd: '${T.dt}', args: [] });`) === 'binary' && hitsOf(`await D.${T.xs}({ bin: 'Xvfb' });`) === 'binary',
    'NEG: a real program by name, a `command -v` probe for one, a cmd: field naming one and an X server started through desktop-display are binaries');
  ok(hitsOf(`// spawn(process.execPath, ['server.js'], { env: ${T.vnc}() }) — in a comment\n`) === ''
    && hitsOf(`const h = spawn(process.execPath, ['-e', FAKE_CHROME, '--', '${T.hl}']);`) === ''
    && hitsOf("execFileSync('git', ['ls-files', 'src', 'server.js']);") === '' && hitsOf('spawn(process.execPath, [wrapper, buf, meta, fakeCli]);') === '',
    'NON-HITS: a comment, a node FAKE handed --headless, a git ls-files naming server.js, our own wrapper under a stub CLI');
  const why = (w, extra = {}) => fastRuleFindings({ why: w, ...extra }, '').problems.join(' | ');
  ok(/names no kind/.test(why('fast · 1 ms')) && /no measured time/.test(why('PURE — no number')) && /≥ 10000 ms with no named debt/.test(why('in-process · 12.5 s'))
    && why('EXCEPTION (x) · 30 s — y') === '' && why('LAW money · 2.6 s') === '' && why('PURE · 40 ms') === '',
    'NEG: a kindless why, a missing time and a ≥ 10 s time with no over are red; an EXCEPTION may exceed the bound; the plain forms pass');
  // THE NAMED DEBT (lane fast-tier-ratchet, 主开发's ruling 2026-10-20): a ≥ 10 s PURE / in-process / LAW row stays fast only with
  // `over: '<why it is slow + its next-list item>'`, never on a row that boots / drives / runs anything — red both ways
  const DEBT = 'the suite folds 64 ledgers one worker at a time — next: run its deadline legs at once';
  ok(why('in-process · 12.5 s', { over: DEBT }) === '' && why('PURE · 25 s', { over: DEBT }) === '' && why('LAW money · 15 s', { over: DEBT }) === ''
    && /a paid debt: drop the over field/.test(why('in-process · 9.9 s', { over: DEBT })) && /names nothing/.test(why('in-process · 12 s', { over: 'slow' }))
    && /on the EXCEPTION row/.test(why('EXCEPTION (x) · 30 s', { over: DEBT })),
    'NEG: an over carries a ≥ 10 s row; an over under the bound (a paid debt), an over that names nothing and an over on the EXCEPTION are red');
  { const vSrc = `const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, ...(await ${['vnc', 'Env'].join('')}()) } });`;
    const r = fastRuleFindings({ why: 'in-process · 14 s', over: DEBT }, vSrc);
    ok(r.problems.some((p) => /heavy by THE TIER RULE, over or not/.test(p)), 'NEG: an over on a row that boots a server is red (a server / browser / binary row is heavy, over or not)', r.problems); }
  const slowRows = fast.filter((s) => { const f = fastRuleFindings(s, ''); return f.kind !== 'EXCEPTION' && f.measuredMs >= FAST_MAX_MS; }).map((s) => s.name).sort();
  const overRows = fast.filter((s) => s.over !== undefined).map((s) => s.name).sort();
  ok(JSON.stringify(slowRows) === JSON.stringify(overRows) && overRows.length <= 12,
    `the over-list == the fast rows ≥ 10 s by their stated time (${overRows.length}: ${overRows.join(', ') || 'none'}) — no silent slow row, no paid debt kept`);
  for (const s of fast.filter((x) => x.over !== undefined)) console.log(`      over · ${s.name} · ${(fastRuleFindings(s, '').measuredMs / 1000).toFixed(1)} s · ${s.over}`);
  ok(/only a LAW or an EXCEPTION/.test(why('PURE · 1 ms', { allow: ['binary'] })) && /dead allowance/.test(why('LAW architecture · 1 ms', { allow: ['binary'] })),
    'NEG: an allowance on a PURE row, and an allowance nothing needs, are red');
  // …and over REAL suites the rule moved out: each is caught by the shape it moved for.
  for (const [n, key] of [['test-client-boot', 'chrome'], ['test-restore-smoke', 'server'], ['test-restore-smoke', 'checkout'], ['test-agentd-session', 'binary'], ['test-desktop-display', 'binary']]) {
    const r = fastRuleFindings({ why: 'in-process · 1 ms' }, src(n));
    ok(r.hits.includes(key) && r.problems.length > 0, `CONTROL: ${n} as a fast row would be red — ${key} (${r.hits.join(',') || 'no hit'})`);
  }
  ok(FAST_DISQUALIFIERS.map((d) => d.key).join() === 'server,checkout,chrome,binary' && FAST_MAX_MS === 10000, 'the four disqualifiers and the 10 s bound are the ones the rule names');
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

// ── §2e NO FAST SUITE ASSERTS A WALL-CLOCK BOUND ON ITS OWN RUN (lane mirror-flake-hardening, 2.369.270) ──
// rel269's mirror (run 38549333465) went red on test-enter-census's `< 3 s` — 4335 ms on ubuntu-latest — and the fast
// tier stopped on it. scripts/wall-clock-census.mjs reads every fast suite with acorn and classifies each comparison of a
// measured span (wait / lower / guard / control / LITERAL): a LITERAL upper bound under 1 s is RED; one of ≥ 1 s is held
// only by the per-suite ratchet scripts/fixtures/wall-clock-baseline.json, which only falls. A cost claim is a census of
// the work or a ratio against a control in the same run (scripts/cost-ratio.mjs — CPU time); a wait is the mechanism's
// constant or the evidence it ended for its reason. Lane wall-clock-ratchet-down (2.369.271): THE RATCHET IS AT 0 — the
// 30 held bounds became evidence / stamps read between two marks / relative bounds, and the census also reads a span
// the PRODUCT (or a child script) measured and returned, through a tuple, a helper's parameter, a Map / Set.
console.log('\n§2e no fast suite asserts a wall-clock bound on its own run');
{
  const WC = await import('./wall-clock-census.mjs');
  const suites = WC.censusOver(SUITES);
  const baseline = JSON.parse(fs.readFileSync(WC.BASELINE, 'utf-8'));
  const v = WC.ratchetVerdict(suites, baseline);
  const by = {};
  for (const x of suites) for (const f of x.findings) by[f.kind] = (by[f.kind] || 0) + 1;
  const held = suites.flatMap((x) => x.findings.filter((f) => f.kind === 'LITERAL').map((f) => `${x.name}:${f.line} ${f.text}`));
  console.log(`    ${suites.length} fast suites · ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(' · ')}`);
  for (const h of held) console.log('      held by the ratchet: ' + h);
  const nFast = SUITES.filter((r) => r.tier === 'fast').length;
  ok(suites.length === nFast && nFast > 300, `the census read every fast suite (${suites.length} of ${nFast})`);
  ok(!v.problems.length, `no literal wall-clock bound under ${WC.LITERAL_FLOOR_MS} ms in a fast suite; the ≥ ${WC.LITERAL_FLOOR_MS} ms ones are the ratchet's (${held.length} in ${Object.keys(baseline).length} suites, only falling)${v.problems.length ? ' — ' + v.problems.join(' | ') : ''}`);
  ok(!held.length && !Object.keys(baseline).length, `THE RATCHET IS AT 0 (lane wall-clock-ratchet-down): no literal wall-clock bound held in any fast suite, the baseline empty — the next one is a NEW one, RED (${held.length} held, ${Object.keys(baseline).length} baseline rows)`);
  // THE RATIO (lane cpu-ratio-controls): no fast suite judges a growth on the clock — one measurement at two input sizes compared
  // through a factor (test-channel-facts' CPU-time growth legs were the last; test-exit-run's hrtime family is heavy, planted below)
  const growthRatios = suites.flatMap((x) => x.findings.filter((f) => f.kind === 'RATIO').map((f) => `${x.name}:${f.line} ${f.text}`));
  ok(!growthRatios.length && (by.RATIO || 0) === 0, `NO GROWTH RATIO ON THE CLOCK in a fast suite (lane cpu-ratio-controls): a complexity claim is a COUNT (scripts/work-meter.mjs; its backtrack charge for a regex) — ${growthRatios.length} found, the next one is RED${growthRatios.length ? ': ' + growthRatios.join(' | ') : ''}`);
  // PLANTS: every spelling of the class is LITERAL; every legitimate form is classified out of it
  const kinds = (src) => WC.wallClockFindings(src).map((f) => f.kind).join(',');
  // two spans measured in the run: a control and the thing judged against it
  const TWO = 'const t = performance.now(); a(); const ctl = performance.now() - t; const u = performance.now(); b(); const fix = performance.now() - u; ';
  const RED = {
    'Date.now() delta': "const t0 = Date.now(); run(); ok('fast', Date.now() - t0 < 3000);",
    'performance.now() span variable': "const t = performance.now(); run(); const ms = performance.now() - t; ok('fast', ms < 500);",
    'hrtime.bigint span': "const t = process.hrtime.bigint(); run(); const ms = Number(process.hrtime.bigint() - t) / 1e6; ok(ms < 100);",
    'an if-test failure (`if (ms > N) bad`)': "const t = performance.now(); run(); const ms = performance.now() - t; if (ms > 1500) bad.push('slow');",
    'a const used only as the bound': "const BUDGET_MS = 250; const t = Date.now(); run(); ok(Date.now() - t < BUDGET_MS);",
    'a const handed only to a watchdog timer': "const BUDGET_MS = 250; setTimeout(kill, BUDGET_MS + 1500); const t = Date.now(); run(); ok(Date.now() - t < BUDGET_MS);",
    'an object field': "const t0 = Date.now(); const r = { ms: Date.now() - t0 }; ok(r.ms < 50);",
    'a helper that returns a span': "const timeIt = (fn) => { const t = performance.now(); fn(); return performance.now() - t; }; ok(timeIt(run) < 100);",
    'a negated flag (`!(ms < B)`)': "const t = Date.now(); run(); const over = !(Date.now() - t < 1500); ok(!over);",
    'a .filter of violators': "const t = performance.now(); const times = [performance.now() - t]; const slow = times.filter((ms) => ms > 800); ok(!slow.length);",
    // lane oat-loop-gap-bound (.270): the spellings test-oat-materialize F13's `r13.maxGap < 50` hid behind
    "a helper's coerced field (F13: `maxGap: +maxGap.toFixed(1)`)": "const f13 = async () => { let maxGap = 0, last = performance.now(); const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }; tick(); return { maxGap: +maxGap.toFixed(1) }; }; const r13 = await f13(); ok(r13.maxGap < 50, 'stall');",
    'a sum across a loop (`total += span`)': "let total = 0; for (const x of xs) { const t = performance.now(); run(x); total += performance.now() - t; } ok(total < 500);",
    'the max of spans pushed across a loop (`Math.max(...gaps)`)': "const gaps = []; let last = Date.now(); const iv = setInterval(() => { const now = Date.now(); gaps.push(now - last); last = now; }, 5); await work(); clearInterval(iv); const worst = Math.max(...gaps, 0); ok(worst < 250);",
    'an element of a sorted span array': "const ms = []; for (const x of xs) { const t = Date.now(); run(x); ms.push(Date.now() - t); } ms.sort((a, b) => a - b); ok(ms[ms.length - 1] < 300);",
    'a destructured span field': "const timed = () => { const t = Date.now(); run(); return { ms: Date.now() - t }; }; const { ms } = timed(); ok(ms < 200);",
    "process.hrtime(t0)'s [s, ns]": "const t = process.hrtime(); run(); const [s, ns] = process.hrtime(t); ok(s * 1e3 + ns / 1e6 < 100);",
    // lane wall-clock-ratchet-down (.271): the BLIND spellings the census header named
    'a span inside a tuple (`[n, msOf(fn)]`)': "const msOf = (fn) => { const t = performance.now(); fn(); return performance.now() - t; }; const rows = fns.map((fn) => [fn.name, msOf(fn)]); ok(!rows.filter(([, ms]) => ms > 800).length);",
    "a span handed to a helper's parameter": "const fast = (ms, what) => ok(ms < 500, what); const t = Date.now(); run(); fast(Date.now() - t, 'run');",
    'a span in a Map (`m.set(k, span)`, `m.get(k)`)': "const by = new Map(); const t = Date.now(); run(); by.set('run', Date.now() - t); ok(by.get('run') < 300);",
    'a span in a Set, spread': "const s = new Set(); const t = Date.now(); run(); s.add(Date.now() - t); ok(Math.max(...s) < 300);",
    'a clock function (`const now = () => Date.now()`)': "const now = () => Date.now(); const t0 = now(); run(); ok(now() - t0 < 300);",
    'a for-of over an array of spans': "const times = []; for (const x of xs) { const t = Date.now(); run(x); times.push(Date.now() - t); } for (const ms of times) ok(ms < 300);",
    // lane reconnect-storm-band (.272): THE BAND — a bound relative to a control that adds a literal number of ms
    'a control plus a literal band (test-reconnect-storm (d) before .272)': TWO + 'const lband = Math.max(ctl * 0.25, 25); ok(fix <= ctl + lband);',
    'a control plus a bare literal': TWO + 'ok(fix <= ctl + 50);',
    'a literal floor under a scaled control': TWO + 'ok(fix <= Math.max(ctl * 1.25, 50));',
    'the band on the left (`ctl + 25 >= fix`)': TWO + 'ok(ctl + 25 >= fix);',
    'a band in an if-test failure': TWO + "if (fix > ctl + 40) bad.push('slow');",
    'a literal ms × an environment factor': "const slack = process.env.CI ? 4 : 1; const t = Date.now(); run(); ok(Date.now() - t < 250 * slack);",
    'a literal ms per item (× a count)': 'const t = Date.now(); run(rows); ok(Date.now() - t < 50 * rows.length);',
  };
  const OUT = {
    wait: ["const t0 = Date.now(); while (Date.now() - t0 < 5000 && !done()) await sleep(50);", 'wait'],
    'a poll deadline in a timer callback': ["const t0 = Date.now(); const iv = setInterval(() => { if (Date.now() - t0 > 20000) { clearInterval(iv); reject(new Error('timeout')); } }, 50);", 'wait'],
    'a lower bound': ["const t0 = Date.now(); await hold(); ok(Date.now() - t0 >= 600);", 'lower'],
    "the mechanism's constant × slack": ["const t0 = Date.now(); await probe(); ok(Date.now() - t0 < 2 * DP.DUP_PROBE_MS + 500);", 'control'],
    'a const the suite hands the fake': ["const HOLD = 300; fake.holdMs = HOLD; const t0 = Date.now(); await fake.run(); ok(Date.now() - t0 < 3 * HOLD);", 'control'],
    'a control measured in the run': ["const t = performance.now(); a(); const ta = performance.now() - t; const u = performance.now(); b(); const tb = performance.now() - u; ok(tb < 4 * ta);", 'control'],
    'a noise-floor conjunct': ["const t = performance.now(); a(); const ta = performance.now() - t; if (ta > 10 && other > 2.5) bad.push('x');", 'guard'],
    // lane reconnect-storm-band: the look-alikes of a band — the control scaled (a ratio), a band made of the control
    // itself, the mechanism's constant as the band, a band on a LOWER bound
    'K × the control': [TWO + 'ok(fix <= 2 * ctl);', 'control'],
    'a relative band (`ctl + ctl * 0.25`)': [TWO + 'ok(fix <= ctl + ctl * 0.25);', 'control'],
    "the mechanism's constant as the band": [TWO + 'const SLOT_MS = 250; prod.slotMs = SLOT_MS; ok(fix <= ctl + SLOT_MS);', 'control'],
    'a band on a lower bound': [TWO + 'ok(fix >= ctl + 50);', 'lower'],
    'a timestamp plus a number (a deadline, never a band)': ["const NOW = Date.now(); const T0 = NOW - 3 * 86400e3; const r = { at: Date.now() - 5 }; ok(Number(r.at) < T0 + 1000);", 'control'],
    "F13's form since .270 (a stall against a control loop of the same length)": ["const f13 = async () => { let maxGap = 0, last = performance.now(); const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }; tick(); const ctl = performance.now() - last; return { maxGap: +maxGap.toFixed(1), ctlGap: +ctl.toFixed(1) }; }; const r13 = await f13(); ok(r13.maxGap <= 3 * r13.ctlGap);", 'control'],
  };
  const redWrong = Object.entries(RED).filter(([, src]) => kinds(src) !== 'LITERAL').map(([n, src]) => `${n} → ${kinds(src) || 'not seen'}`);
  const outWrong = Object.entries(OUT).filter(([, [src, want]]) => kinds(src) !== want).map(([n, [src, want]]) => `${n} → ${kinds(src) || 'not seen'} (want ${want})`);
  ok(!redWrong.length, `PLANTS: ${Object.keys(RED).length} spellings of an absolute wall-clock bound are each LITERAL${redWrong.length ? ' — WRONG: ' + redWrong.join(' | ') : ''}`);
  ok(!outWrong.length, `PLANTS: ${Object.keys(OUT).length} legitimate forms are classified out of it (wait / lower / control / guard)${outWrong.length ? ' — WRONG: ' + outWrong.join(' | ') : ''}`);
  ok(kinds("const t = performance.now(); a(); const x = performance.now() - t; const u = performance.now(); b(); const y = performance.now() - u; ok(y / x <= 2.5);") === '', 'a ratio of two DIFFERENT measurements (a fix against its control) is dimensionless — no finding (relative by construction; one measurement at two sizes is THE RATIO below)');
  // THE RATIO (lane cpu-ratio-controls): every spelling of a growth judged on the clock is RATIO — the bestOf family's
  // `b / a <= 16`, a literal multiplier, a quadratic control's lower bound behind a noise floor, a named ratio, an if-test,
  // cost-ratio.mjs's growth() on CPU time; a ratio of two different measurements, the same call twice, a COUNT are not
  const HR = 'const timeOf = (n, k = 1) => { let b = Infinity; for (let i = 0; i < k; i++) { const t0 = process.hrtime.bigint(); run(n); b = Math.min(b, Number(process.hrtime.bigint() - t0) / 1e6); } return b; }; ';
  const PN = 'const timeOf = (x) => { const t = performance.now(); run(x); return performance.now() - t; }; ';
  const RATIO_RED = {
    "the bestOf family (test-exit-run before .273: `b / a <= 16` at ×8 input)": HR + 'const a = timeOf(8192, 3), b = timeOf(65536, 3); ok(b <= 1e9 || b / a <= 16);',
    'a literal multiplier (`b < 16 * a`)': PN + 'const a = timeOf(1024), b = timeOf(8192); ok(b < 16 * a);',
    "a quadratic CONTROL's lower bound behind a noise floor (`b / Math.max(0.05, a) >= 12`)": HR + 'const a = timeOf(8192, 3), b = timeOf(65536); ok(b / Math.max(0.05, a) >= 12);',
    'a floor and a scale on the small side (test-channel-thread before .209)': HR + 'const a = timeOf(64 * 1024), b = timeOf(512 * 1024); ok(b < Math.max(5, a) * 16);',
    'a ratio bound to a name': PN + 'const small = timeOf(4096), big = timeOf(32768); const r = big / small; ok(r <= 8.5);',
    'a ratio in an if-test failure': PN + "const a = timeOf(4096), b = timeOf(32768); if (b / a > 10) bad.push('superlinear');",
    "cost-ratio.mjs's growth() on CPU time (test-channel-facts before .273)": "import { growth } from './cost-ratio.mjs'; const g = growth((x) => run(x), small, big, { inner: 50 }); ok(g.ratio <= 24);",
    "growth()'s ratio as a quadratic control's lower bound": "import { growth } from './cost-ratio.mjs'; const gQ = growth(q, small, big, { inner: 1 }); ok(gQ.ratio > 24 && other);",
  };
  const RATIO_OUT = {
    'one helper over two DIFFERENT inputs at one size (a hostile text against a plain one)': [PN + 'const a = timeOf(plain), b = timeOf(hostile); ok(b <= 40 * a);', 'control'],
    'the same call twice (a determinism read)': [PN + 'const a = timeOf(8192), b = timeOf(8192); ok(b <= 2 * a);', 'control'],
    'a COUNT at two sizes (the work meter in a child)': ["const v = judgeInChild({ module, run, mk, n: 8192, kind: 'linear', backtracks: true, opts: { factor: 8 } }); ok(v.ok && v.r <= 8.8);", ''],
    "growth()'s other fields (a printed cost)": ["import { growth } from './cost-ratio.mjs'; const g = growth(f, small, big); console.log(g.smallMs, g.bigMs); ok(typeof g.bigMs === 'number');", ''],
  };
  const ratioWrong = Object.entries(RATIO_RED).filter(([, src]) => !kinds(src).split(',').includes('RATIO')).map(([n, src]) => `${n} → ${kinds(src) || 'not seen'}`);
  const ratioOutWrong = Object.entries(RATIO_OUT).filter(([, [src, want]]) => kinds(src) !== want).map(([n, [src, want]]) => `${n} → ${kinds(src) || 'not seen'} (want ${want || 'no finding'})`);
  ok(!ratioWrong.length, `PLANTS: ${Object.keys(RATIO_RED).length} spellings of a growth judged on the clock are each RATIO${ratioWrong.length ? ' — WRONG: ' + ratioWrong.join(' | ') : ''}`);
  ok(!ratioOutWrong.length, `PLANTS: ${Object.keys(RATIO_OUT).length} look-alikes are not (two different measurements, the same call twice, a count, growth()'s printed fields)${ratioOutWrong.length ? ' — WRONG: ' + ratioOutWrong.join(' | ') : ''}`);
  ok(kinds("const t0 = performance.now(); await sweep(); const took = performance.now() - t0; const until = performance.now() + took; while (performance.now() < until) await tick();") === '', 'a mark plus a span is a DEADLINE (a control loop as long as the sweep), not a span — no finding');
  // THE PRODUCT'S CLOCK (lane wall-clock-ratchet-down): a duration the product module the suite LOADS fills from a clock
  // (`ms: Date.now() - t0`, `{ fsMs, loopMs }` off a worker), or a child script prints (python `time.monotonic()`), is a
  // span on what the suite got back from a call — and only there: a module the suite hands its own `now`, an object the
  // suite built itself (a fake timer's `{ fn, ms }`), a module it reads as TEXT for a pin, are no source
  const MODS = {
    'src/server/tls.js': "function runChild(cmd) { const t0 = Date.now(); return new Promise((r) => r({ code: 0, ms: Date.now() - t0 })); } module.exports = { runChild };",
    'src/server/canary.js': "function create({ now = () => Date.now() } = {}) { return { async tick() { const sentAt = now(); const r = await post(); const gotAt = now(); const fsMs = Math.max(0, r.fsMs); const loopMs = gotAt - r.doneAt; return { fsMs, loopMs }; } }; } const w = 'canary-worker.js';",
    'src/server/canary-worker.js': "const startAt = Date.now(); const doneAt = Date.now(); post({ startAt, doneAt, fsMs: doneAt - startAt });",
    'scripts/fixtures/probe.py': "t = time.monotonic()\nout['ms'] = round((time.monotonic() - t) * 1000)\n",
  };
  const readPlant = (rel) => (rel in MODS ? MODS[rel] : null);
  const pkinds = (src) => WC.wallClockFindings(src, { fields: WC.productSpanFields(src, readPlant) }).map((f) => f.kind).join(',');
  const PRED = {
    "a product-returned field (tls.js runChild's `ms`)": "const TLS = require('../src/server/tls.js'); const t = await TLS.runChild('x'); ok(t.code === 0 && t.ms < 5000);",
    "a product field forwarded off its worker (the canary's `fsMs`)": "const C = require(path.join(REPO, 'src/server/canary.js')); const r = await C.create().tick(); ok(r.fsMs < 100);",
    "the product's own clock default (`now = () => Date.now()`)": "const C = require(path.join(REPO, 'src/server/canary.js')); const r = await C.create().tick(); ok(r.loopMs < 100);",
    "a child's JSON (secret-probe.py's `ms`)": "const PROBE = path.join(ROOT, 'scripts/fixtures/probe.py'); const r = JSON.parse(spawnSync('python3', [PROBE]).stdout); ok(r.ms < 3000);",
  };
  const POUT = {
    'a module the suite hands its own clock': "const C = require(path.join(REPO, 'src/server/canary.js')); let clock = 0; const r = await C.create({ now: () => clock }).tick(); ok(r.loopMs < 100);",
    "the suite's own object with the field's name (a fake timer)": "const TLS = require('../src/server/tls.js'); const caught = []; global.setTimeout = (fn, ms) => { caught.push({ fn, ms }); }; const t = await TLS.runChild('x'); ok(caught.filter((c) => c.ms > 60e3).length === 0);",
    'a module read as TEXT for a pin': "const src = read('src/server/tls.js'); const t = parse(src); ok(t.ms < 5000);",
  };
  const pWrong = Object.entries(PRED).filter(([, src]) => pkinds(src) !== 'LITERAL').map(([n, src]) => `${n} → ${pkinds(src) || 'not seen'}`);
  const poWrong = Object.entries(POUT).filter(([, src]) => pkinds(src) !== '').map(([n, src]) => `${n} → ${pkinds(src)}`);
  ok(!pWrong.length, `PLANTS: ${Object.keys(PRED).length} durations the PRODUCT or a child measured are each LITERAL${pWrong.length ? ' — WRONG: ' + pWrong.join(' | ') : ''}`);
  ok(!poWrong.length, `PLANTS: ${Object.keys(POUT).length} look-alikes are no finding (the suite's own clock handed in, its own fake-timer object, a module read as text)${poWrong.length ? ' — WRONG: ' + poWrong.join(' | ') : ''}`);
  // THE RATCHET AT 0: a ≥ 1 s literal bound anywhere is a NEW one, a sub-second one is RED by the floor, a baseline
  // above the truth and a baseline name that is no fast suite say "lower it" — each RED
  const plantSuite = (name, src) => [...suites.filter((x) => x.name !== name), { name, findings: WC.wallClockFindings(src, { fields: WC.productSpanFields(src) }) }];
  const lazySrc = fs.readFileSync(path.join(REPO, 'scripts', 'test-lazy.mjs'), 'utf-8');
  const pNew = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tP = Date.now(); ok(Date.now() - tP < 4000, 'planted');\n"), baseline).problems;
  const pSub = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tP = Date.now(); ok(Date.now() - tP < 200, 'planted');\n"), baseline).problems;
  const pHigh = WC.ratchetVerdict(suites, { ...baseline, 'test-lazy': 1 }).problems;
  const pGone = WC.ratchetVerdict(suites, { ...baseline, 'test-no-such-suite': 1 }).problems;
  ok(pNew.some((p) => p.startsWith('test-lazy') && /a NEW one/.test(p)) && pSub.some((p) => /test-lazy:\d+ asserts .* under 1000 ms/.test(p)) && pHigh.some((p) => p.startsWith('test-lazy') && /lower it/.test(p)) && pGone.some((p) => /test-no-such-suite/.test(p)),
    'CONTROLS: a 4 s bound planted in test-lazy is a NEW one, a 200 ms one is RED by the floor, a baseline above the truth and a baseline name that is no fast suite say "lower it" — all RED');
  // …and a GROWTH RATIO planted in the same copy is RED by the census (lane cpu-ratio-controls): no baseline holds one
  const pRatio = WC.ratchetVerdict(plantSuite('test-lazy', lazySrc + "\nconst tR = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++); return performance.now() - t0; }; const rA = tR(1e5), rB = tR(8e5); ok(rB / rA <= 16, 'planted');\n"), baseline).problems;
  ok(pRatio.some((p) => /^test-lazy:\d+ judges rB \/ rA <= 16 — one measurement at two input sizes/.test(p)), `CONTROL: a growth ratio planted in test-lazy (\`rB / rA <= 16\` over one timer at two sizes) is RED (${pRatio.filter((p) => p.startsWith('test-lazy')).length} problem)`, pRatio);
  // THE 30 THEMSELVES: rel270's copy of every suite the ratchet held reads RED against today's empty baseline (a
  // depth-1 checkout has no 25cd69aef: SKIP, said) — and its fs-canary / tls-pass / app-display-secrets (the product's
  // clock, unseen before) read RED with them
  const HELD270 = ['test-agentd-upgrade-loop', 'test-app-display-secrets', 'test-app-display-session-census', 'test-app-manifest', 'test-auto-resume', 'test-boot-phase', 'test-browser-disk', 'test-browser-display', 'test-browser-passkey', 'test-ci-gate', 'test-codex-0153', 'test-codex-pool', 'test-design-routes', 'test-dial-link-kept', 'test-egress-fence', 'test-key-file-law', 'test-mount-argv', 'test-notify-retry', 'test-opencode-serve', 'test-parked-ask-inbox', 'test-quota-source', 'test-raw-filename', 'test-usage-index-owner', 'test-vfs-cache-place', 'test-window-binding-model'];
  let rel270 = null;
  try { rel270 = Object.fromEntries([...HELD270, 'test-fs-canary', 'test-tls-pass'].map((n) => [n, git(REPO, ['show', `25cd69aef:scripts/${n}.mjs`])])); } catch { rel270 = null; }
  if (rel270 === null) console.log('    SKIP: 25cd69aef is not in this checkout (a depth-1 clone) — the ratchet-at-0 control needs rel270');
  else {
    const red = (n) => WC.ratchetVerdict(plantSuite(n, rel270[n]), baseline).problems.filter((p) => p.startsWith(n));
    const notRed = HELD270.filter((n) => !red(n).some((p) => /a NEW one/.test(p)));
    const canary = red('test-fs-canary'), tls = red('test-tls-pass');
    ok(!notRed.length && canary.length === 4 && canary.every((p) => /r\.(?:fs|loop)Ms < \d+/.test(p)) && tls.some((p) => /t\.ms < 5000/.test(p)),
      `CONTROL: rel270's copies read RED here — every one of the ${HELD270.length} suites the ratchet held (a NEW one each), test-fs-canary's 4 bounds on the canary's own fsMs / loopMs, test-tls-pass's \`t.ms < 5000\`${notRed.length ? ' — NOT RED: ' + notRed.join(', ') : ''} (${canary.length} + ${tls.length})`);
  }
  // THE INCIDENT ITSELF: rel269's test-enter-census reads RED here (a depth-1 checkout has no d419156bd: SKIP, said)
  let rel269 = null;
  try { rel269 = git(REPO, ['show', 'd419156bd:scripts/test-enter-census.mjs']); } catch { rel269 = null; }
  if (rel269 === null) console.log('    SKIP: d419156bd is not in this checkout (a depth-1 clone) — the incident control needs rel269');
  else {
    const pInc = WC.ratchetVerdict(plantSuite('test-enter-census', rel269), baseline).problems;
    ok(pInc.some((p) => p.startsWith('test-enter-census') && /ms < 3000/.test(p)), `CONTROL: rel269's test-enter-census (\`ms < 3000\`, the mirror's 4335 ms red) reads RED here (${pInc.filter((p) => p.startsWith('test-enter-census')).length} problem)`);
  }
  // THE SECOND INCIDENT (lane oat-loop-gap-bound): .270's candidate (run 38560509611) went red on test-oat-materialize
  // F13's `r13.maxGap < 50` — 59.4 ms on ubuntu-latest — a span this census could not see through the helper's
  // `maxGap: +maxGap.toFixed(1)`; that suite at a7321ff0e reads RED here, today's (a stall against a control) does not
  let a7321 = null;
  try { a7321 = git(REPO, ['show', 'a7321ff0e:scripts/test-oat-materialize.mjs']); } catch { a7321 = null; }
  if (a7321 === null) console.log('    SKIP: a7321ff0e is not in this checkout (a depth-1 clone) — the F13 incident control needs it');
  else {
    const pF13 = WC.ratchetVerdict(plantSuite('test-oat-materialize', a7321), baseline).problems.filter((p) => p.startsWith('test-oat-materialize'));
    ok(pF13.length === 1 && /r13\.maxGap < 50/.test(pF13[0]), `CONTROL: a7321ff0e's test-oat-materialize (\`r13.maxGap < 50\`, the 59.4 ms red) reads RED here (${pF13.length} problem${pF13.length === 1 ? '' : 's'})`);
  }
  // THE THIRD INCIDENT (lane reconnect-storm-band): .271's heavy shard 6/6 went red on test-reconnect-storm (d), `fix ≤
  // control + max(25 %, 25 ms)` on the server's loop delay — 61 vs 31 and 60 vs 25 on ubuntu-latest — a bound relative to
  // a control that ADDS a literal band. That suite is HEAVY (this census reads the fast tier) and its loop figures come
  // off the server's preload log under names that carry no unit (`loopMax`, `gapMax`, `visP95`): planted with those names
  // read as the durations they are, rel270's copy reads RED on (d)'s two banded legs and on (b)'s `+ 50`; today's holds none
  const STORM_FIELDS = ['loopMax', 'gapMax', 'visP95'];
  const stormNow = WC.wallClockFindings(fs.readFileSync(path.join(REPO, 'scripts', 'test-reconnect-storm.mjs'), 'utf-8'), { fields: STORM_FIELDS });
  ok(!stormNow.some((f) => f.kind === 'LITERAL') && stormNow.some((f) => f.kind === 'control'), `today's test-reconnect-storm, planted the same way, holds no literal band — (b) is a ratio to the control (${stormNow.map((f) => `${f.kind} :${f.line}`).join(' · ')})`);
  let storm270 = null;
  try { storm270 = git(REPO, ['show', '25cd69aef:scripts/test-reconnect-storm.mjs']); } catch { storm270 = null; }
  if (storm270 === null) console.log('    SKIP: 25cd69aef is not in this checkout (a depth-1 clone) — the reconnect-storm (d) control needs rel270');
  else {
    const pS = WC.ratchetVerdict([...suites, { name: 'test-reconnect-storm', findings: WC.wallClockFindings(storm270, { fields: STORM_FIELDS }) }], baseline).problems.filter((p) => p.startsWith('test-reconnect-storm'));
    ok(pS.length === 3 && [/F\.loopMax <= C\.loopMax \+ lband/, /F\.gapMax <= Math\.max\(C\.gapMax \+ band, 50\)/, /F\.visP95 <= C\.visP95 \+ 50/].every((re) => pS.some((p) => re.test(p) && /under 1000 ms/.test(p))),
      `CONTROL: 25cd69aef's test-reconnect-storm, planted, reads RED on (d)'s loop-delay and srv-loop-gap-ms bands and on (b)'s \`+ 50\` (${pS.length} problems)`);
  }
  // THE FOURTH AND FIFTH (lane cpu-ratio-controls, B-923c + B-e83c): rel271's test-exit-run — HEAVY, so planted — judged the
  // secret-shape regexes by hrtime ratios at ×4 / ×8 input (red 1 in 5 beside 32 spinners), and rel271's test-channel-facts its
  // decoder and V1 by CPU-time growth (its quadratic control read 17 × for 64 × beside a 12-wide fast tier): both read RED on
  // every growth leg here; today's copies hold none (a COUNT each)
  const exitNow = WC.wallClockFindings(fs.readFileSync(path.join(REPO, 'scripts', 'test-exit-run.mjs'), 'utf-8'));
  ok(!exitNow.some((f) => f.kind === 'RATIO'), `today's test-exit-run, planted, holds no growth ratio — its legs are counts (${exitNow.filter((f) => f.kind === 'RATIO').length} RATIO)`);
  let rel271 = null;
  try { rel271 = { exit: git(REPO, ['show', 'f57d1cbe9:scripts/test-exit-run.mjs']), facts: git(REPO, ['show', 'f57d1cbe9:scripts/test-channel-facts.mjs']) }; } catch { rel271 = null; }
  if (rel271 === null) console.log('    SKIP: f57d1cbe9 is not in this checkout (a depth-1 clone) — the clock-ratio controls need rel271');
  else {
    const pE = WC.ratchetVerdict([...suites, { name: 'test-exit-run', findings: WC.wallClockFindings(rel271.exit) }], baseline).problems.filter((p) => p.startsWith('test-exit-run:') && /a growth ratio/.test(p));
    const pF = WC.ratchetVerdict(plantSuite('test-channel-facts', rel271.facts), baseline).problems.filter((p) => p.startsWith('test-channel-facts:'));
    ok(pE.length === 10 && pE.filter((p) => /b \/ a <= (?:8|16)\b/.test(p)).length === 4 && pE.filter((p) => /b \/ Math\.max\(0\.05, a\) >= 12/.test(p)).length === 6
      && pF.length === 5 && ['gB.ratio <= 4', 'gWalk.ratio > 4', 'gW1.ratio <= 24', 'gW2.ratio <= 24', 'gQ.ratio > 24'].every((t) => pF.some((p) => p.includes(t))),
      `CONTROL: f57d1cbe9's test-exit-run, planted, reads RATIO on its 4 linear legs and 6 quadratic controls (${pE.length}); its test-channel-facts on V1 and the decoder's 5 growth reads (${pF.length})`);
  }
}

// ── shared by §2g and §2h: a red names what it saw; a workflow's jobs → steps, line-based (no YAML parser in this tree) ──
const okd = (c, n, d) => ok(c, c || !d ? n : `${n}\n      ${String(d).trim().split('\n').join('\n      ')}`);
// a step is a `- ` item under a `steps:` key, up to the next item at its indent; each job's step list also carries the
// job's key (`job`) and its own timeout-minutes (`bound`), read between the job's key line and its `steps:`
const jobsOf = (text) => {
  const lines = text.split('\n'), jobs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)steps:\s*$/.exec(lines[i]);
    if (!m) continue;
    const steps = [];
    let at = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j], ind = l.length - l.trimStart().length, note = !l.trim() || /^\s*#/.test(l);
      if (!note && ind <= m[1].length) break;
      if (!note && /^\s*- /.test(l) && (at < 0 || ind === at)) { at = ind; steps.push([l.slice(0, ind) + '  ' + l.slice(ind + 2)]); continue; }
      if (steps.length) steps[steps.length - 1].push(l);
    }
    let h = i - 1;
    while (h > 0 && !new RegExp(`^ {${Math.max(0, m[1].length - 2)}}[\\w-]+:\\s*$`).test(lines[h])) h--;
    const jobBound = lines.slice(h + 1, i).map((l) => new RegExp(`^ {${m[1].length}}timeout-minutes:\\s*(\\S+)`).exec(l)).find(Boolean);
    jobs.push(Object.assign(steps.map((ls) => {
      const ind = ls[0].length - ls[0].trimStart().length, key = (k) => ls.findIndex((l) => new RegExp(`^ {${ind}}${k}:`).test(l));
      const val = (k) => { const at = key(k); return at < 0 ? null : ls[at].slice(ind + k.length + 1).trim(); };
      const r = key('run');
      let run = r < 0 ? null : ls[r].slice(ind + 'run:'.length).trim();
      if (r >= 0 && /^[|>][-+]?$/.test(run)) { // a block scalar: every line deeper than its key (a `#` line too), then the next key
        const body = [];
        for (const l of ls.slice(r + 1)) { if (l.trim() && l.length - l.trimStart().length <= ind) break; body.push(l); }
        const cut = Math.min(...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
        run = body.map((l) => l.slice(cut)).join('\n').trim();
      }
      const bound = val('timeout-minutes');
      return { text: ls.filter((l) => l.trim() && !/^\s*#/.test(l)).join('\n'), run, uses: key('uses') >= 0, cont: key('continue-on-error') >= 0,
        action: val('uses'), bound: bound === null ? null : Number(bound), label: val('name') || val('uses') || (run || '').split('\n')[0] };
    }), { job: (/^\s*([\w-]+):/.exec(lines[h]) || [])[1] || '?', bound: jobBound ? Number(jobBound[1]) : null }));
  }
  return jobs;
};

// ── §2f THE MIRROR'S ONE APT DOOR (lane mirror-flake-hardening: rel269's heavy 2/4 died in `apt-get update`, exit 100,
// on packages.microsoft.com — a repository the runner ships and we never install from — answering only over IPv6) ──
console.log('\n§2f ci.yml installs through scripts/ci-apt.sh (a repository we do not need never fails a job)');
{
  const wf = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8');
  const runs = wf.split('\n').filter((l) => /^\s*run:/.test(l));
  const bare = runs.filter((l) => /\bapt(?:-get)?\b/.test(l) && !/scripts\/ci-apt\.sh/.test(l));
  const door = runs.filter((l) => /scripts\/ci-apt\.sh/.test(l));
  ok(!bare.length && door.length >= 2, `every apt step in ci.yml goes through scripts/ci-apt.sh (${door.length} steps${bare.length ? '; BARE: ' + bare.map((l) => l.trim()).join(' | ') : ''})`);
  const sh = fs.readFileSync(path.join(REPO, 'scripts', 'ci-apt.sh'), 'utf-8');
  ok(/Acquire::ForceIPv4=true/.test(sh) && /--no-install-recommends/.test(sh), 'the door speaks IPv4 and installs only the packages named');
  ok(/-o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30/.test(sh) && /timeout -k \d+ "\$BOUND" \$SUDO/.test(sh) && /^BOUND=\$\{CI_APT_BOUND:-80\}$/m.test(sh),
    'the door is BOUNDED (lane ci-cjk-fonts): a stalled connection gives up after 30 s, every apt call runs under `timeout` (80 s, sized for dtach)');
  // the selection over a fixture sources.list.d: the runner's microsoft lists moved aside (printed), ubuntu.sources kept
  const dir = path.join(mktmp('apt'), 'sources.list.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ubuntu.sources'), 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates\nComponents: main universe\n');
  fs.writeFileSync(path.join(dir, 'microsoft-prod.list'), 'deb [arch=amd64,armhf,arm64] https://packages.microsoft.com/ubuntu/24.04/prod noble main\n');
  fs.writeFileSync(path.join(dir, 'azure-cli.sources'), 'Types: deb\nURIs: https://packages.microsoft.com/repos/azure-cli/\nSuites: noble\n');
  const r = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { PATH: process.env.PATH, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_ECHO: '1' } });
  const left = fs.readdirSync(dir).sort().join(), aside = fs.existsSync(dir + '.off') ? fs.readdirSync(dir + '.off').sort().join() : '';
  ok(r.status === 0 && left === 'ubuntu.sources' && aside === 'azure-cli.sources,microsoft-prod.list' && /moved aside microsoft-prod\.list — https:\/\/packages\.microsoft\.com/.test(r.stdout) && /kept ubuntu\.sources/.test(r.stdout),
    `the runner's packages.microsoft.com lists are moved aside BY NAME, the Ubuntu archive kept (left: ${left}; aside: ${aside})`);
  const OPTS = '-o Acquire::ForceIPv4=true -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30';
  okd(r.stdout.includes(`\ntimeout 80 apt-get ${OPTS} update\n`) && r.stdout.endsWith(`timeout 80 apt-get ${OPTS} install -y --no-install-recommends dtach\n`), 'then update + install of exactly the named package, IPv4 forced, each call bounded', r.stdout);
  const noUpd = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), '--no-update', 'dtach'], { encoding: 'utf-8', env: { PATH: process.env.PATH, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_ECHO: '1', CI_APT_BOUND: '200' } });
  ok(noUpd.status === 0 && !/ update\n/.test(noUpd.stdout) && /^timeout 200 apt-get .* install -y --no-install-recommends dtach$/m.test(noUpd.stdout), '--no-update installs on the index the first step fetched; CI_APT_BOUND sizes the bound for a larger package');
  // the bound itself, over a stub apt-get that never answers (a stalled mirror): the call is killed, the step red BY NAME
  const stub = path.join(mktmp('aptstub'), 'bin');
  fs.mkdirSync(stub);
  fs.writeFileSync(path.join(stub, 'apt-get'), '#!/bin/bash\nexec sleep 30\n', { mode: 0o755 });
  const hung = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-apt.sh'), 'dtach'], { encoding: 'utf-8', env: { PATH: `${stub}:${process.env.PATH}`, CI_APT_SOURCES_DIR: dir, CI_APT_SUDO: '', CI_APT_BOUND: '0.3' } });
  okd(hung.status === 124 && /^::error::ci-apt: apt-get … update passed its 0\.3 s bound \(a stalled mirror\)$/m.test(hung.stderr) && !/install -y/.test(hung.stdout + hung.stderr),
    `an apt call past its bound is killed and the step goes red naming it — the install never starts (exit ${hung.status})`, hung.stdout + hung.stderr);
}

// ── §2g AN INSTALL MAY BE RETRIED, A SUITE NEVER (lane ci-npm-retry, B-fa5e: .330's heavy 6/6 — run 39462417012 — died in
// `npm ci` on a registry reset mid-download, «npm error network read ECONNRESET», exit 152; npm's own fetch-retries
// covers a request only until its headers) ──
// Every npm install in every workflow goes through scripts/ci-npm.sh (3 fresh attempts, 20 s apart, a ::warning:: each);
// every job that runs scripts/ci.mjs installs through the door's `ci` form first; a step that names scripts/ci.mjs is
// ONE plain `node scripts/ci.mjs …` line, once per job — no loop, no `||`, no retry action, no second `if: failure()`
// run, no continue-on-error. Read line-based (no YAML parser in this tree — the lane read the same jobs / steps / run
// values with the `yaml` package); the controls are mutant copies of ci.yml.
console.log('\n§2g an install may be retried (scripts/ci-npm.sh), a suite never');
{
  const WF_DIR = path.join(REPO, '.github', 'workflows');
  const DOOR = /^bash scripts\/ci-npm\.sh (?:ci|install -g(?: [@\w./-]+)+)$/;
  const INSTALL = /\bnpm\s+(?:ci|i|install|add)\b/;
  const SUITE_LINE = /^node scripts\/ci\.mjs(?: [^;&|<>`()\n]*)?$/;
  const verdictOf = (files) => {
    const bad = [];
    let doorSteps = 0, suiteSteps = 0;
    for (const [name, text] of files) {
      for (const [k, steps] of jobsOf(text).entries()) {
        let ciAt = -1, suites = 0;
        for (const [s, st] of steps.entries()) {
          const run = st.run ?? '';
          if (DOOR.test(run)) { doorSteps++; if (/ ci$/.test(run) && ciAt < 0) ciAt = s; } else if (INSTALL.test(st.text)) bad.push(`${name} job ${k + 1}: an install outside the door: ${(st.run ?? st.text).split('\n')[0].trim()}`);
          if (!/scripts\/ci\.mjs/.test(st.text)) continue;
          suites++; suiteSteps++;
          const bare = run.replace(/\$\{\{[^}]*\}\}/g, 'X');
          if (st.uses || st.cont || !SUITE_LINE.test(bare)) bad.push(`${name} job ${k + 1}: a suite step that is not ONE plain line: ${st.text.trim().split('\n').map((l) => l.trim()).join(' ⏎ ')}`);
          if (ciAt < 0) bad.push(`${name} job ${k + 1}: scripts/ci.mjs with no \`scripts/ci-npm.sh ci\` before it`);
        }
        if (suites > 1) bad.push(`${name} job ${k + 1}: scripts/ci.mjs runs in ${suites} steps (a second run is a retry)`);
      }
    }
    return { bad, doorSteps, suiteSteps };
  };
  const files = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => [f, fs.readFileSync(path.join(WF_DIR, f), 'utf-8')]);
  const v = verdictOf(files);
  ok(files.length >= 3 && files.reduce((n, [, t]) => n + jobsOf(t).length, 0) >= 4, `the walk reads every workflow (${files.map(([f]) => f).join(', ')}) and every job's steps`);
  okd(!v.bad.length && v.doorSteps === 4 && v.suiteSteps === 2,
    `every npm install goes through scripts/ci-npm.sh (${v.doorSteps} steps: the claude CLI + npm ci in fast and heavy) and both scripts/ci.mjs steps are one plain line, once per job, after the door's npm ci (${v.suiteSteps})`, v.bad.join('\n'));
  // the controls: mutant copies of ci.yml, each RED for its own reason
  const ci = files.find(([f]) => f === 'ci.yml')[1];
  const FAST_RUN = '      - run: node scripts/ci.mjs\n', HEAVY_RUN = /( {6}- run: )(node scripts\/ci\.mjs --heavy [^\n]*)/;
  const MUTANTS = [
    ['the fast job\'s npm ci bare again', (t) => t.replace('run: bash scripts/ci-npm.sh ci', 'run: npm ci'), /an install outside the door: npm ci$/m],
    ['the claude CLI installed bare', (t) => t.replace('run: bash scripts/ci-npm.sh install -g', 'run: npm i -g'), /an install outside the door: npm i -g @anthropic-ai\/claude-code/],
    ['an `npm install` fallback after the door', (t) => t.replace('run: bash scripts/ci-npm.sh ci', 'run: bash scripts/ci-npm.sh ci || npm install'), /an install outside the door: bash scripts\/ci-npm\.sh ci \|\| npm install/],
    ['ci.mjs in a for loop', (t) => t.replace(FAST_RUN, '      - run: for i in 1 2 3; do node scripts/ci.mjs && break; sleep 20; done\n'), /not ONE plain line: run: for i in 1 2 3/],
    ['the heavy shard run twice by ||', (t) => t.replace(HEAVY_RUN, '$1$2 || $2'), /not ONE plain line: run: node scripts\/ci\.mjs --heavy .* \|\| node/],
    ['an until loop in a run block', (t) => t.replace(FAST_RUN, '      - run: |\n          until node scripts/ci.mjs; do sleep 20; done\n'), /not ONE plain line: run: \| ⏎ until node scripts\/ci\.mjs/],
    ['a retry action around ci.mjs', (t) => t.replace(FAST_RUN, '      - uses: nick-fields/retry@v3\n        with:\n          max_attempts: 3\n          command: node scripts/ci.mjs\n'), /not ONE plain line: uses: nick-fields\/retry@v3/],
    ['a second ci.mjs step if: failure()', (t) => t.replace(FAST_RUN, FAST_RUN + '        env:\n          VIBESPACE_CI_OAT: x\n      - if: failure()\n        run: node scripts/ci.mjs\n'), /job 1: scripts\/ci\.mjs runs in 2 steps/],
    ['continue-on-error on the suite step', (t) => t.replace(FAST_RUN, FAST_RUN + '        continue-on-error: true\n'), /not ONE plain line: run: node scripts\/ci\.mjs ⏎ continue-on-error: true/],
    ['ci.mjs handed to the door', (t) => t.replace(FAST_RUN, '      - run: bash scripts/ci-npm.sh node scripts/ci.mjs\n'), /not ONE plain line: run: bash scripts\/ci-npm\.sh node scripts\/ci\.mjs/],
    ['the door\'s npm ci moved after ci.mjs', (t) => t.replace(/( {6}- name: npm ci \(3 attempts on a registry blip\)\n(?: {8}.*\n)+)( {6}- run: node scripts\/ci\.mjs\n)/, '$2$1'), /job 1: scripts\/ci\.mjs with no `scripts\/ci-npm\.sh ci` before it/],
  ];
  const reds = MUTANTS.map(([label, edit, why]) => {
    const t = edit(ci), mv = verdictOf(files.map(([f, x]) => [f, f === 'ci.yml' ? t : x]));
    return { label, applied: t !== ci, red: mv.bad.some((b) => why.test(b)), bad: mv.bad };
  });
  const missed = reds.filter((r) => !r.applied || !r.red);
  okd(!missed.length, `CONTROL: ${reds.length} mutant copies of ci.yml each go RED for their own reason (${reds.map((r) => r.label).join(' · ')})`,
    missed.map((r) => `${r.label}: ${r.applied ? 'GREEN — ' + JSON.stringify(r.bad) : 'the edit did not apply'}`).join('\n'));

  // THE DOOR ITSELF over a stub npm + a stub sleep (each records its argv): attempts, the pause, the exit code, the refusals
  const dir = mktmp('npm'), bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/bash\necho "$*" >> "$STUB/npm.log"\nn=$(( $(cat "$STUB/n" 2>/dev/null || echo 0) + 1 )); echo $n > "$STUB/n"\nif [ "$n" -le "${STUB_FAILS:-0}" ]; then echo "npm error network read ECONNRESET" >&2; exit "${STUB_CODE:-152}"; fi\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/bash\necho "$*" >> "$STUB/sleep.log"\n', { mode: 0o755 });
  const door = (args, fails, code) => {
    for (const f of ['npm.log', 'sleep.log', 'n']) fs.rmSync(path.join(dir, f), { force: true });
    const r = spawnSync('bash', [path.join(REPO, 'scripts', 'ci-npm.sh'), ...args], { encoding: 'utf-8', env: { PATH: `${bin}:${process.env.PATH}`, STUB: dir, STUB_FAILS: String(fails), STUB_CODE: String(code ?? 152) } });
    const rd = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf-8').trim().split('\n').filter(Boolean); } catch { return []; } };
    return { status: r.status, out: r.stdout + r.stderr, npm: rd('npm.log'), sleep: rd('sleep.log') };
  };
  const KNOBS = '--fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=60000';
  const twoBlips = door(['ci'], 2);
  okd(twoBlips.status === 0 && twoBlips.npm.length === 3 && twoBlips.npm.every((a) => a === `ci ${KNOBS}`) && twoBlips.sleep.join() === '20,20'
    && ['1/3', '2/3', '3/3'].every((n) => twoBlips.out.includes(`install attempt ${n}: npm ci ${KNOBS}`)) && (twoBlips.out.match(/^::warning::install attempt [12]\/3 failed \(npm exit 152\)/gm) || []).length === 2,
  'two blips then a clean install: three FRESH `npm ci` (npm\'s fetch-retry knobs on each, never an `npm install`), «install attempt N/3», a 20 s pause and a ::warning:: between, green', twoBlips.out);
  const down = door(['ci'], 9);
  okd(down.status === 152 && down.npm.length === 3 && down.sleep.join() === '20,20' && /^::error::install failed 3 times \(npm exit 152\)/m.test(down.out),
    `a registry that stays down: exactly 3 attempts, no pause after the third, the step RED with npm's own exit code (${down.status})`, down.out);
  const clean = door(['ci'], 0), other = door(['ci'], 9, 1);
  ok(clean.status === 0 && clean.npm.length === 1 && !clean.sleep.length && other.status === 1, 'a clean install is one attempt and no pause; npm\'s exit code is the step\'s (1 stays 1)');
  const cli = door(['install', '-g', '@anthropic-ai/claude-code'], 1);
  okd(cli.status === 0 && cli.npm.length === 2 && cli.npm.every((a) => a === `install -g ${KNOBS} @anthropic-ai/claude-code`), 'the claude CLI\'s global install takes the same door', cli.npm.join(' | '));
  const refused = [[], ['install'], ['install', '-g'], ['ci', '--legacy-peer-deps'], ['i'], ['node', 'scripts/ci.mjs']].map((a) => ({ a, r: door(a, 0) }));
  ok(refused.every(({ r }) => r.status === 2 && !r.npm.length && /usage: ci-npm\.sh ci \| install -g/.test(r.out)),
    `the door runs only \`npm ci\` or a global install — a local \`npm install\`, extra flags or anything else is refused before npm runs (${refused.map(({ a, r }) => `[${a.join(' ')}] ${r.status}`).join(', ')})`);
}
// ── §2h EVERY SETUP STEP IS BOUNDED, THE FONTS HAVE ONE ROAD (lane ci-cjk-fonts, 2.369.346: .345's master mirror was
// CANCELLED at 45 min — heavy 4/6 sat 21 min in `apt install fonts-noto-cjk`, the azure mirror serving 61 MB at 45.8 kB/s,
// and 4 of the branch run's 6 shards spent 11–21 min there) ──
// Every ci.yml job carries its own timeout-minutes and every step but its suite step one under it (the suite step's
// bound is its job's): a stall is a red that names its step. The heavy tier's zh / ja fonts come from ONE road — ONE plain
// `bash scripts/ci-fonts.sh --system` step, bounded ≤ 6 min, an actions/cache of its dir in front keyed on that file (the
// pins), a stalled restore a miss — and never from apt, in any step, in any form (no fallback: a second road hides the
// first one's failure). ci-fonts.sh pins its tag and a sha256 per file, bounds curl, and is run here over a fixture (a
// file:// base serving the wrong bytes: red by name, nothing installed). The controls are mutant copies of both files.
console.log('\n§2h every setup step is bounded; the fonts have one road (scripts/ci-fonts.sh, cached, pinned)');
{
  const FONTS_SH = path.join(REPO, 'scripts', 'ci-fonts.sh'), CACHE_DIR = '~/.local/share/fonts/noto-cjk';
  const verdictOf = (yml, sh) => {
    const bad = [], jobs = jobsOf(yml);
    let bounded = 0, roads = 0;
    for (const steps of jobs) {
      if (!(steps.bound > 0)) bad.push(`job ${steps.job}: no timeout-minutes of its own`);
      for (const st of steps) {
        if (/fonts-noto-cjk/.test(st.run || '')) bad.push(`job ${steps.job}: fonts through apt: ${st.run.split('\n')[0]}`);
        if (/scripts\/ci\.mjs/.test(st.text)) continue; // the suite step: its job's bound is its bound
        if (!(st.bound > 0)) bad.push(`job ${steps.job}: «${st.label}» has no timeout-minutes`);
        else if (st.bound >= steps.bound) bad.push(`job ${steps.job}: «${st.label}» is bounded at ${st.bound}, not under its job's ${steps.bound}`);
        else bounded++;
      }
      const suite = steps.findIndex((st) => /^node scripts\/ci\.mjs --heavy\b/.test(st.run || ''));
      if (suite < 0) continue; // only the heavy tier drives the chrome suites that measure zh / ja text
      const road = steps.findIndex((st) => /scripts\/ci-fonts\.sh/.test(st.run || ''));
      if (road < 0) { bad.push(`job ${steps.job}: runs the heavy tier with no scripts/ci-fonts.sh step`); continue; }
      roads++;
      const r = steps[road], cache = steps.findIndex((st) => /^actions\/cache@v\d+$/.test(st.action || '') && new RegExp(`^\\s*path:\\s*${CACHE_DIR.replace(/[.]/g, '\\.')}\\s*$`, 'm').test(st.text));
      if (r.run !== 'bash scripts/ci-fonts.sh --system' || r.cont || r.uses) bad.push(`job ${steps.job}: the fonts step is not ONE plain \`bash scripts/ci-fonts.sh --system\`: ${r.text.split('\n').map((l) => l.trim()).join(' ⏎ ')}`);
      if (!(r.bound > 0 && r.bound <= 6)) bad.push(`job ${steps.job}: the fonts step's bound is ${r.bound} (≤ 6 min)`);
      if (road > suite) bad.push(`job ${steps.job}: the fonts step runs after the suites`);
      if (cache < 0) { bad.push(`job ${steps.job}: no actions/cache of ${CACHE_DIR} in front of the fonts step`); continue; }
      const c = steps[cache], key = (/^\s*key:\s*(.+)$/m.exec(c.text) || [])[1] || '', seg = Number((/SEGMENT_DOWNLOAD_TIMEOUT_MINS:\s*(\d+)/.exec(c.text) || [])[1]);
      if (cache > road) bad.push(`job ${steps.job}: the fonts cache comes after the fonts step`);
      if (!key.includes("hashFiles('scripts/ci-fonts.sh')")) bad.push(`job ${steps.job}: the fonts cache is not keyed on scripts/ci-fonts.sh (the pins): key ${key}`);
      if (/^\s*restore-keys:/m.test(c.text)) bad.push(`job ${steps.job}: the fonts cache has restore-keys (another pin set's files)`);
      if (!(seg > 0 && seg < c.bound)) bad.push(`job ${steps.job}: a stalled fonts-cache restore is no miss before the step's bound (SEGMENT_DOWNLOAD_TIMEOUT_MINS ${seg || 'unset'}, bound ${c.bound})`);
    }
    if (!roads) bad.push('no job takes the fonts road');
    // ci-fonts.sh: a tag, a 64-hex sha256 on every PINS entry (the two Sans TTCs at least), curl bounded, no apt anywhere
    const code = sh.replace(/^\s*#.*$/gm, '');
    const tag = (/^TAG=(\S+)$/m.exec(code) || [])[1];
    const entries = ((/^PINS=\(\n([\s\S]*?)\n\)$/m.exec(code) || [])[1] || '').split('\n').filter((l) => l.trim());
    const pins = entries.map((l) => /^\s*'([0-9a-f]{64}) ((?:Sans|Serif)\/OTC\/Noto(?:Sans|Serif)CJK-(?:Regular|Bold)\.ttc)'$/.exec(l)).filter(Boolean).map((m) => m[2]);
    if (!tag) bad.push('ci-fonts.sh pins no tag');
    for (const f of ['Sans/OTC/NotoSansCJK-Regular.ttc', 'Sans/OTC/NotoSansCJK-Bold.ttc']) if (!pins.includes(f)) bad.push(`ci-fonts.sh pins no sha256 for ${f}`);
    if (entries.length !== pins.length) bad.push(`ci-fonts.sh: ${entries.length - pins.length} PINS entr${entries.length - pins.length === 1 ? 'y' : 'ies'} without a 64-hex sha256`);
    if (!/\bBASE=\$\{CI_FONTS_BASE:-https:\/\/raw\.githubusercontent\.com\/notofonts\/noto-cjk\/\$TAG\}/.test(code)) bad.push('ci-fonts.sh does not fetch from the pinned tag');
    if (!/^dir=\$\{CI_FONTS_DIR:-\$HOME\/\.local\/share\/fonts\/noto-cjk\}$/m.test(code)) bad.push(`ci-fonts.sh installs somewhere the cache (${CACHE_DIR}) does not keep`);
    if (!/curl [^\n]*--retry 5 [^\n]*--max-time \d+/.test(code)) bad.push('ci-fonts.sh: curl is not bounded (--retry 5 … --max-time)');
    if (/\bapt(?:-get)?\b|ci-apt/.test(code)) bad.push('ci-fonts.sh: an apt road inside the fonts road');
    return { bad, bounded, roads, pins, tag };
  };
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8'), sh = fs.readFileSync(FONTS_SH, 'utf-8');
  const v = verdictOf(yml, sh);
  okd(!v.bad.length && v.bounded >= 14 && v.roads === 1 && v.pins.length === 4,
    `every ci.yml job and every setup step is bounded (${v.bounded} steps; the 2 suite steps by their job), the heavy job takes ONE fonts road — a cache keyed on scripts/ci-fonts.sh in front, ≤ 6 min, no apt — and ci-fonts.sh pins ${v.tag} + a sha256 per file (${v.pins.length})`, v.bad.join('\n'));
  // the controls: mutant copies of ci.yml and ci-fonts.sh, each RED for its own reason
  const FONTS_RUN = '        run: bash scripts/ci-fonts.sh --system\n';
  const STEP = (head) => `( {6}- name: ${head}[^\\n]*\\n(?: {8}.*\\n)+)`;
  const MUTANTS = [
    ['the fonts back on apt', 'yml', (t) => t.replace('run: bash scripts/ci-fonts.sh --system', 'run: bash scripts/ci-apt.sh --no-update fonts-noto-cjk'), /fonts through apt: bash scripts\/ci-apt\.sh --no-update fonts-noto-cjk/],
    ['an apt fallback after the road', 'yml', (t) => t.replace('run: bash scripts/ci-fonts.sh --system', 'run: bash scripts/ci-fonts.sh --system || bash scripts/ci-apt.sh fonts-noto-cjk'), /fonts through apt: bash scripts\/ci-fonts\.sh --system \|\| bash scripts\/ci-apt\.sh fonts-noto-cjk/],
    ['the road without --system (one HOME\'s fonts)', 'yml', (t) => t.replace(FONTS_RUN, '        run: bash scripts/ci-fonts.sh\n'), /the fonts step is not ONE plain `bash scripts\/ci-fonts\.sh --system`: name: Install CJK fonts .* ⏎ run: bash scripts\/ci-fonts\.sh ⏎/],
    ['the road continue-on-error', 'yml', (t) => t.replace(FONTS_RUN, FONTS_RUN + '        continue-on-error: true\n'), /the fonts step is not ONE plain .* ⏎ continue-on-error: true/],
    ['the cache step gone', 'yml', (t) => t.replace(new RegExp(STEP('Cache the pinned CJK fonts')), ''), /no actions\/cache of ~\/\.local\/share\/fonts\/noto-cjk in front of the fonts step/],
    ['the cache after the road', 'yml', (t) => t.replace(new RegExp(STEP('Cache the pinned CJK fonts') + STEP('Install CJK fonts')), '$2$1'), /the fonts cache comes after the fonts step/],
    ['the cache keyed on a constant', 'yml', (t) => t.replace("key: noto-cjk-${{ hashFiles('scripts/ci-fonts.sh') }}", 'key: noto-cjk-v1'), /the fonts cache is not keyed on scripts\/ci-fonts\.sh \(the pins\): key noto-cjk-v1/],
    ['restore-keys on the cache', 'yml', (t) => t.replace("          key: noto-cjk-${{ hashFiles('scripts/ci-fonts.sh') }}\n", "          key: noto-cjk-${{ hashFiles('scripts/ci-fonts.sh') }}\n          restore-keys: noto-cjk-\n"), /the fonts cache has restore-keys/],
    ['a cache restore that may stall to its bound', 'yml', (t) => t.replace(new RegExp(STEP('Cache the pinned CJK fonts')), (m) => m.replace('          SEGMENT_DOWNLOAD_TIMEOUT_MINS: 2\n', '')), /a stalled fonts-cache restore is no miss .*unset/],   // the FONTS cache's line (int365 seam: the fast job's gh cache, earlier in the file, carries the same line)
    ['the fonts step unbounded', 'yml', (t) => t.replace(FONTS_RUN + '        timeout-minutes: 6\n', FONTS_RUN), /job heavy-shards: «Install CJK fonts [^»]*» has no timeout-minutes/],
    ['the fonts step bounded at 30', 'yml', (t) => t.replace(FONTS_RUN + '        timeout-minutes: 6\n', FONTS_RUN + '        timeout-minutes: 30\n'), /the fonts step's bound is 30 \(≤ 6 min\)/],
    ['dtach unbounded', 'yml', (t) => t.replace('        run: bash scripts/ci-apt.sh dtach\n        timeout-minutes: 3\n', '        run: bash scripts/ci-apt.sh dtach\n'), /job fast: «Install dtach [^»]*» has no timeout-minutes/],
    ['checkout unbounded', 'yml', (t) => t.replace('      - uses: actions/checkout@v4\n        timeout-minutes: 3\n', '      - uses: actions/checkout@v4\n'), /job fast: «actions\/checkout@v4» has no timeout-minutes/],
    ['npm ci bounded at the job\'s 45', 'yml', (t) => t.replace(/(run: bash scripts\/ci-npm\.sh ci\n {8}timeout-minutes: )6\n([\s\S]*run: bash scripts\/ci-npm\.sh ci\n {8}timeout-minutes: )6\n/, '$16\n$245\n'), /job heavy-shards: «npm ci \(3 attempts on a registry blip\)» is bounded at 45, not under its job's 45/],
    ['a job with no bound of its own', 'yml', (t) => t.replace('    timeout-minutes: 5\n    steps:', '    steps:'), /job heavy: no timeout-minutes of its own/],
    ['a Sans pin dropped', 'sh', (t) => t.replace(/^ {2}'[0-9a-f]{64} Sans\/OTC\/NotoSansCJK-Bold\.ttc'\n/m, ''), /ci-fonts\.sh pins no sha256 for Sans\/OTC\/NotoSansCJK-Bold\.ttc/],
    ['a pin without its sha256', 'sh', (t) => t.replace(/'[0-9a-f]{64} (Serif\/OTC\/NotoSerifCJK-Bold\.ttc)'/, "'$1'"), /ci-fonts\.sh: 1 PINS entry without a 64-hex sha256/],
    ['the tag unpinned (a branch)', 'sh', (t) => t.replace('/notofonts/noto-cjk/$TAG}', '/notofonts/noto-cjk/main}'), /ci-fonts\.sh does not fetch from the pinned tag/],
    ['curl unbounded', 'sh', (t) => t.replace(/ --max-time \d+/, ''), /ci-fonts\.sh: curl is not bounded/],
    ['an apt fallback inside the script', 'sh', (t) => t.replace('  mv -f "$f.part" "$f"\n', '  mv -f "$f.part" "$f"\n  bash scripts/ci-apt.sh --no-update fonts-noto-cjk || true\n'), /ci-fonts\.sh: an apt road inside the fonts road/],
  ];
  const reds = MUTANTS.map(([label, which, edit, why]) => {
    const t = edit(which === 'yml' ? yml : sh), mv = which === 'yml' ? verdictOf(t, sh) : verdictOf(yml, t);
    return { label, applied: t !== (which === 'yml' ? yml : sh), red: mv.bad.some((b) => why.test(b)), bad: mv.bad };
  });
  const missed = reds.filter((r) => !r.applied || !r.red);
  okd(!missed.length, `CONTROL: ${reds.length} mutant copies of ci.yml / ci-fonts.sh each go RED for their own reason (${reds.map((r) => r.label).join(' · ')})`,
    missed.map((r) => `${r.label}: ${r.applied ? 'GREEN — ' + JSON.stringify(r.bad) : 'the edit did not apply'}`).join('\n'));
  // THE ROAD ITSELF over a fixture: a file:// base that serves the wrong bytes under the pinned name, a cached file from
  // another pin set — the cached one is refetched, the fetched one fails its sha256: red BY NAME, nothing unverified installed
  const fx = mktmp('fonts'), base = path.join(fx, 'base'), dest = path.join(fx, 'dest');
  fs.mkdirSync(path.join(base, 'Sans', 'OTC'), { recursive: true });
  fs.mkdirSync(dest);
  const WRONG = 'not the pinned font\n', STALE = 'a cached file of another pin set\n';
  fs.writeFileSync(path.join(base, 'Sans', 'OTC', 'NotoSansCJK-Regular.ttc'), WRONG);
  fs.writeFileSync(path.join(dest, 'NotoSansCJK-Regular.ttc'), STALE);
  const road = (args) => spawnSync('bash', [FONTS_SH, ...args], { encoding: 'utf-8', env: { PATH: process.env.PATH, HOME: fx, CI_FONTS_BASE: `file://${base}`, CI_FONTS_DIR: dest, CI_FONTS_SUDO: '', CI_FONTS_CONF: path.join(fx, 'conf') } });
  const wrong = road(['--system']), sha = crypto.createHash('sha256').update(WRONG).digest('hex'), pin = sh.match(/'([0-9a-f]{64}) Sans\/OTC\/NotoSansCJK-Regular\.ttc'/)?.[1];
  okd(wrong.status === 1 && /^::warning::ci-fonts: the cached NotoSansCJK-Regular\.ttc is not the pinned file — fetching it again$/m.test(wrong.stdout)
    && wrong.stderr.includes(`::error::ci-fonts: NotoSansCJK-Regular.ttc sha256 ${sha}, pinned ${pin} (`)
    && fs.readdirSync(dest).join() === 'NotoSansCJK-Regular.ttc' && fs.readFileSync(path.join(dest, 'NotoSansCJK-Regular.ttc'), 'utf-8') === STALE && !fs.existsSync(path.join(fx, 'conf')),
  'the wrong bytes under a pinned name: a red naming the file, its sha256 and the pin — nothing installed, no .part left, no fontconfig registered', wrong.stdout + wrong.stderr);
  const refused = [['--user'], ['--system', 'x'], ['x']].map((a) => ({ a, r: road(a) }));
  ok(refused.every(({ r }) => r.status === 2 && /usage: ci-fonts\.sh \[--system\]/.test(r.stderr)), `the road takes only [--system] (${refused.map(({ a, r }) => `[${a.join(' ')}] ${r.status}`).join(', ')})`);
}

// ── §2i A RED NAMES ITS LEGS (lane ci-mirror-hygiene, 2.369.362: 2.369.361's mirror fast job printed «test-pool-auto
// 4 FAILED (667 passed)» and no leg — its ✗ lines sat above the 40 lines a row keeps, the fast job uploaded nothing, and
// the cause, the depth-1 clone, took an hour of guessing) ──
// A red suite's ✗ entry carries every ✗ line of its output BEFORE the tail (≤ FAIL_LINES_MAX, the count said), inside
// lines[0] like the hang digest — lines[1] / lines[2] stay the tail / stderr the rerun ledger reads; the fast tier keeps
// the red suite's whole output in FAST_FAIL_LOGS and ci.yml's fast job uploads it: after the suites, failure only, the
// heavy shards' retention (§2h bounds it). Planted suites run for real through runSuiteAsync; the workflow is read with
// §2h's parser and its controls are mutant copies of ci.yml.
console.log('\n§2i a red names its legs: every ✗ line before the tail; the fast job ships its fail logs');
{
  const CI = await import('./ci.mjs');
  const root = mktmp('legs'), sha = 'c0ffee0123456789';
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const say = (lines) => lines.map((l) => `console.log(${JSON.stringify(l)});`).join('\n') + '\nprocess.exit(1);\n';
  const ticks = (n, tag) => Array.from({ length: n }, (_, i) => `  ✓ ${tag} ${i + 1}`);
  const N = CI.FAIL_LINES_MAX + 5;
  // the runner's shape (one ✗ far above the 40-line tail, one inside it); more ✗ lines than the bound; a crash with none
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-legs.mjs'), say(['§1 planted', '  ✗ leg one — far above the tail', ...ticks(60, 'a'), '  ✗ leg two — inside the tail', ...ticks(5, 'b'), '', '2 FAILED']));
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-many.mjs'), say([...Array.from({ length: N }, (_, i) => `  ✗ leg ${i + 1}`), '', `${N} FAILED`]));
  fs.writeFileSync(path.join(root, 'scripts', 'test-planted-crash.mjs'), "console.log('§1 planted');\nthrow new Error('planted: no verdict');\n");
  const [legs, many, crash] = await Promise.all(['test-planted-legs', 'test-planted-many', 'test-planted-crash'].map((name, i) => CI.runSuiteAsync({ name, tier: 'fast', budgetMs: 8000 }, { root, sha, lane: i + 1 })));
  const head = legs.lines[0];
  okd(!legs.ok && !legs.lines[1].includes('leg one') && legs.lines[1].includes('  ✗ leg two'), 'PREMISE: the 40-line tail alone names leg two and NOT leg one (2.369.361\'s row)', legs.lines[1]);
  okd(/\n {2}\[ci\] its ✗ lines: 2 \(/.test(head) && head.endsWith('\n  ✗ leg one — far above the tail\n  ✗ leg two — inside the tail'),
    'a red suite\'s ✗ entry says its ✗ lines (2) and prints every one, in its order, before the tail', head);
  okd(legs.lines[1].includes('2 FAILED') && !/\[ci\] its ✗ lines/.test(legs.lines[1] + legs.lines[2]), 'lines[1] / lines[2] stay the tail / stderr the rerun ledger reads', legs.lines[1]);
  const mh = many.lines[0];
  okd(mh.includes(`[ci] its ✗ lines: ${N} — the first ${CI.FAIL_LINES_MAX} (`) && mh.includes(`\n  ✗ leg ${CI.FAIL_LINES_MAX}\n`) && !mh.includes(`  ✗ leg ${CI.FAIL_LINES_MAX + 1}`) && mh.endsWith(`\n  [ci] … ${N - CI.FAIL_LINES_MAX} more ✗ line(s) not shown`),
    `bounded: ${N} ✗ lines ⇒ the first ${CI.FAIL_LINES_MAX} + «${N - CI.FAIL_LINES_MAX} more», the count said`, mh);
  okd(!crash.ok && crash.lines[0].trim().split('\n').length === 1, 'a red with no ✗ line (a crash) adds nothing to its row — the tail and stderr are what it has', crash.lines[0]);
  // its whole output is kept where ci.yml uploads it from
  const dir = path.join(root, ...CI.FAST_FAIL_LOGS.split('/')), said = [];
  const f = CI.writeFailLog(dir, sha, { name: 'test-planted-legs' }, legs, 1, { log: (l) => said.push(l) });
  okd(f === path.join(dir, 'c0ffee01.test-planted-legs.1.log') && fs.readFileSync(f, 'utf-8') === legs.full && legs.full.includes('leg one') && said.join('\n') === `  [ci] the whole output of test-planted-legs (try 1): ${f}` && CI.writeFailLog(dir, sha, { name: 'test-planted-green' }, { ok: true }, 1, { log: () => {} }) === null,
    `its whole output is kept: ${CI.FAST_FAIL_LOGS}/<sha8>.<suite>.<try>.log, said on its own line (a green suite keeps none)`, f);
  const SRC = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  ok(/const hangDir = fastFailDir\(\);/.test(SRC) && /\n {10}red = s\.name;\n {10}writeFailLog\(hangDir, sha, s, r, 1\);/.test(SRC),
    'WIRING: the fast tier keeps its red suite\'s whole output in FAST_FAIL_LOGS (its hang reports beside it)');
  // ci.yml: the fast job uploads FAST_FAIL_LOGS on a red, as the heavy shards upload theirs
  const uploadOf = (yml) => {
    const bad = [], jobs = jobsOf(yml), fast = jobs.find((j) => j.job === 'fast'), heavy = jobs.find((j) => j.job === 'heavy-shards');
    if (!fast || !heavy) return { bad: [`no ${fast ? 'heavy-shards' : 'fast'} job`] };
    const isUpload = (st) => /^actions\/upload-artifact@v\d+$/.test(st.action || '');
    const field = (st, k) => (new RegExp(`^\\s*${k}:\\s*(.+?)\\s*$`, 'm').exec(st.text) || [])[1] ?? null;
    const suite = fast.findIndex((st) => st.run === 'node scripts/ci.mjs'), at = fast.findIndex((st) => isUpload(st) && st.text.split('\n').some((l) => l.trim() === `path: ${CI.FAST_FAIL_LOGS}/*.log`));
    const hu = heavy.find((st) => isUpload(st) && /data\/ci-heavy\/fail-logs\/\*\.log/.test(st.text));
    if (suite < 0) bad.push('the fast job runs no plain `node scripts/ci.mjs`');
    if (at < 0) { bad.push(`the fast job uploads no ${CI.FAST_FAIL_LOGS}/*.log`); return { bad }; }
    const up = fast[at];
    if (at < suite) bad.push('the fast job\'s upload runs before its suites');
    if (field(up, 'if') !== 'failure()') bad.push(`the fast job's upload is not failure-only (if: ${field(up, 'if')})`);
    if (!hu) bad.push('the heavy shards upload no data/ci-heavy/fail-logs/*.log (no retention to match)');
    else if (field(up, 'retention-days') !== field(hu, 'retention-days')) bad.push(`the fast job keeps its fail logs ${field(up, 'retention-days')} day(s), the heavy shards ${field(hu, 'retention-days')}`);
    return { bad, days: field(up, 'retention-days') };
  };
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8'), v = uploadOf(yml);
  okd(!v.bad.length, `ci.yml's fast job uploads ${CI.FAST_FAIL_LOGS}/*.log after its suites — failure only, the heavy shards' retention${v.days ? ` (${v.days} days)` : ''}`, v.bad.join('\n'));
  const UP = /( {6}- name: Upload the failed fast suite[^\n]*\n(?: {8}.*\n)+)/;
  const MUTANTS = [
    ['the upload step gone', (t) => t.replace(UP, ''), /the fast job uploads no data\/ci-fast\/fail-logs\/\*\.log/],
    ['the heavy tier\'s dir uploaded instead', (t) => t.replace(`path: ${CI.FAST_FAIL_LOGS}/*.log`, 'path: data/ci-heavy/fail-logs/*.log'), /the fast job uploads no data\/ci-fast\/fail-logs\/\*\.log/],
    ['not failure-only', (t) => t.replace(UP, (m) => m.replace('        if: failure()\n', '')), /not failure-only \(if: null\)/],
    ['kept 1 day', (t) => t.replace(UP, (m) => m.replace('retention-days: 7', 'retention-days: 1')), /keeps its fail logs 1 day\(s\), the heavy shards 7/],
    ['before the suites', (t) => t.replace(UP, '').replace('      - run: node scripts/ci.mjs\n', (m) => UP.exec(t)[1] + m), /the fast job's upload runs before its suites/],
  ];
  const reds = MUTANTS.map(([label, edit, why]) => { const t = edit(yml), m = uploadOf(t); return { label, applied: t !== yml, red: m.bad.some((b) => why.test(b)), bad: m.bad }; });
  const missed = reds.filter((r) => !r.applied || !r.red);
  okd(!missed.length, `CONTROL: ${reds.length} mutant copies of ci.yml each go RED for their own reason (${reds.map((r) => r.label).join(' · ')})`,
    missed.map((r) => `${r.label}: ${r.applied ? 'GREEN — ' + JSON.stringify(r.bad) : 'the edit did not apply'}`).join('\n'));
}

} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
