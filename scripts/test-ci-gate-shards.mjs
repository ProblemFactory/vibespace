#!/usr/bin/env node
// test-ci-gate-shards — a PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what the gate guards and why).
// lane fast-tier-ratchet (2026-10-20) split the one 37 s process into seven ≤ 10 s suites, every section's text unchanged;
// the shared kit is scripts/ci-gate-kit.mjs. This part: §8b shards — every heavy suite in exactly one slice · §8c hosts — the self-hosted batch + the hosted shards partition the tier.
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

// ── §8b SHARDS: the Actions mirror runs the heavy tier as n slices (lane mirror-green r2, 2026-10-03) ──
console.log('\n§8b shards — every heavy suite in exactly one slice, the serial group whole, the matrix runs every slice');
{
  const { shardPlan, shardCensus, parseShard, SERIAL } = await import('./ci.mjs');
  const heavy = SUITES.filter((s) => s.tier === 'heavy');
  const srcOf = (name) => { try { return fs.readFileSync(path.join(REPO, 'scripts', name + '.mjs'), 'utf-8'); } catch { return ''; } };
  for (const n of [1, 2, 3, 4, 6]) {
    const p = shardPlan(heavy, n, { sourceOf: srcOf });
    const problems = shardCensus(heavy, p.shards, p.serial);
    ok(p.shards.length === n && !problems.length && p.shards.every((s) => s.length),
      `n=${n}: ${p.shards.map((s) => s.length).join(' + ')} = ${heavy.length} heavy suites, each in exactly one shard, none empty${problems.length ? ' — ' + problems.slice(0, 3).join('; ') : ''}`);
  }
  const p4 = shardPlan(heavy, 4, { sourceOf: srcOf });
  ok(SERIAL.every((r) => p4.serial.includes(r.name)) && p4.serial.every((name) => p4.shards[0].some((s) => s.name === name)),
    `the serial group (${p4.serial.join(', ')}) is whole in shard 1`);
  const split = (p) => p.shards.map((s) => s.map((x) => x.name).sort().join()).join('|');
  ok(split(shardPlan([...heavy].reverse(), 4, { sourceOf: srcOf })) === split(p4), 'the SAME table gives the SAME split — a function of the names and n, not of the table order');
  const grown = shardPlan([...heavy, { name: 'test-zz-added-suite', tier: 'heavy' }], 4, { sourceOf: srcOf });
  ok(grown.shards.every((s, k) => p4.shards[k].every((x) => s.some((y) => y.name === x.name))), 'adding a suite moves NO other suite (a hash of the name, not a position)');
  // CONTROLS: the census is red for each way a split can lose or double a suite
  const victim = p4.shards[2][0].name;
  const dropped = p4.shards.map((s, k) => (k === 2 ? s.slice(1) : s));
  ok(shardCensus(heavy, dropped, p4.serial).some((x) => x.includes(victim) && /NO shard/.test(x)), `CONTROL: ${victim} dropped from every shard is RED (no mirror job would run it)`);
  const twice = p4.shards.map((s, k) => (k === 3 ? [...s, p4.shards[2][0]] : s));
  ok(shardCensus(heavy, twice, p4.serial).some((x) => x.includes(victim) && /AND shard/.test(x)), 'CONTROL: a suite in two shards is RED');
  ok(shardCensus([{ name: 'a' }, { name: 'b' }], [[{ name: 'a' }], [{ name: 'b' }]], ['a', 'b']).some((x) => /serial group is split/.test(x)), 'CONTROL: a serial group split over two shards is RED');
  ok(parseShard('2/4')?.i === 2 && parseShard('4/4')?.n === 4 && !parseShard('0/4') && !parseShard('5/4') && !parseShard('1/0') && !parseShard('x') && !parseShard(''),
    'parseShard: <i>/<n> with 1 ≤ i ≤ n; anything else refused');
  // THE CLI, end to end (every call is a --dry-run: a refusal that failed would otherwise start a real tier)
  const cli = (args) => spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), ...args], { cwd: REPO, encoding: 'utf-8', env: { ...process.env, ...GIT_ENV } });
  const listed = [];
  for (let i = 1; i <= 4; i++) {
    const r = cli(['--heavy', '--shard', `${i}/4`, '--dry-run']);
    if (r.status === 0) listed.push(...r.stdout.split('\n').filter((l) => /^  test-/.test(l)).map((l) => l.trim())); else listed.push(`(shard ${i}/4 exit ${r.status})`);
  }
  ok(listed.length === heavy.length && new Set(listed).size === heavy.length && heavy.every((s) => listed.includes(s.name)),
    `--heavy --shard i/4 --dry-run × 4 lists ${listed.length} names = the ${heavy.length} heavy suites, each once`);
  const bad = cli(['--heavy', '--shard', '5/4', '--dry-run']);
  ok(bad.status === 2 && /--shard/.test(bad.stderr), '--shard 5/4 is a loud exit 2 (never a run of nothing)');
  ok(cli(['--heavy', '--shard', '1/4', '--only=' + heavy[0].name, '--dry-run']).status === 2, '--shard with --only is refused (a shard slices the FULL tier)');
  // THE WORKFLOW: the matrix runs every slice its denominator names, and one aggregate job is the tier's status
  const wf = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf-8');
  const mat = /shard:\s*\[([\d,\s]+)\]/.exec(wf);
  const den = /--shard \$\{\{ matrix\.shard \}\}\/(\d+)/.exec(wf);
  const slots = mat ? mat[1].split(',').map((x) => Number(x.trim())) : [];
  ok(!!den && slots.length === Number(den[1]) && slots.every((v, k) => v === k + 1), `ci.yml's heavy matrix runs shards [${slots.join(', ')}] of ${den ? den[1] : '?'} — every slice, once`);
  ok(/needs:\s*heavy-shards/.test(wf) && /if:\s*always\(\)/.test(wf) && /test "\$\{\{ needs\.heavy-shards\.result \}\}" = success/.test(wf),
    'one aggregate `heavy` job needs the matrix, runs always() and is green only when needs.heavy-shards.result is success');
  // CONTROL of that census: a matrix that drops a slice is red
  const short = wf.replace(/shard:\s*\[[\d,\s]+\]/, 'shard: [1, 2, 3]');
  const sm = /shard:\s*\[([\d,\s]+)\]/.exec(short)[1].split(',').map((x) => Number(x.trim()));
  ok(!(sm.length === Number(den ? den[1] : 0)), 'CONTROL: a matrix of [1, 2, 3] under --shard …/4 fails the matrix census');
}

// ── §8c HOSTS: the heavy tier on two runners (lane ci-aidev-desktop-batch, design q-038 step ①, 2026-10-14) ──
// The hosted Actions shards run what a hosted runner can; the self-hosted DESKTOP batch (AIDev, ci-remote.mjs --batch
// desktop) runs the suites that drive xpra / Xvfb / x11vnc / LibreOffice or a real binary the hosted image lacks. The
// split is DERIVED from each suite's code (ci.mjs hostOf) — this section holds it to a partition, every self-hosted
// suite to the program that put it there, the provision script to a row per program, the 6 hosted shards to an LPT
// balance over the checked-in runner times, the hub to its LOAD RULE (4 lanes; no full tier by day), the lanes to their
// private env; and PRINTS the derivation against the design's census with a computed reason per differing name.
console.log('\n§8c hosts — the self-hosted desktop batch + the 6 hosted shards partition the tier; the hub\'s LOAD RULE');
{
  const C = await import('./ci.mjs');
  const heavy = SUITES.filter((s) => s.tier === 'heavy');
  const srcOf = (name) => { try { return fs.readFileSync(path.join(REPO, 'scripts', name + '.mjs'), 'utf-8'); } catch { return ''; } };
  const readR = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } };
  const names = (l) => l.map((s) => s.name);
  const plan = C.hostPlan(heavy, { sourceOf: srcOf });
  const three = [...names(plan.desktop), ...names(plan.binary), ...names(plan.hosted)];
  ok(three.length === heavy.length && new Set(three).size === heavy.length && heavy.every((s) => three.includes(s.name)) && plan.self.length === plan.desktop.length + plan.binary.length,
    `the hosts PARTITION the heavy tier: ${plan.desktop.length} desktop + ${plan.binary.length} binary (self-hosted ${plan.self.length}) + ${plan.hosted.length} hosted = ${heavy.length}, each once`);
  ok(plan.desktop.length >= 25 && plan.binary.length >= 5 && plan.hosted.length >= 200 && names(plan.desktop).filter((n) => /^test-desktop-xpra-window-/.test(n)).length >= 4 && names(plan.binary).includes('test-opencode-s9'),
    'non-vacuous: the xpra giant\'s parts are desktop, the real opencode serve is binary, most of the tier is hosted');
  ok(!plan.problems.length, `no row's host declaration is refused (${plan.problems.join(' | ') || 'none declared wrong'})`);
  const unnamed = plan.self.filter((s) => { const v = plan.verdicts.get(s.name); return v.declared ? !v.why : !v.programs.length; });
  ok(!unnamed.length, `every self-hosted suite names the program that puts it there (or declares what it reaches) — ${unnamed.map((s) => s.name).join(', ') || plan.self.length + ' suites'}`);
  // the provision script: a PROGRAMS row for every program the self-hosted set runs
  const prov = readR('scripts/ci-provision-aidev.sh');
  const rowsOf = (txt) => { const m = /PROGRAMS='([^']*)'/.exec(txt); return m ? m[1].split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean) : []; };
  const needed = [...new Set(plan.self.flatMap((s) => plan.verdicts.get(s.name).programs))].sort();
  ok(needed.length >= 6 && needed.every((p) => rowsOf(prov).includes(p)), `scripts/ci-provision-aidev.sh has a PROGRAMS row for every program the self-hosted set runs (${needed.join(', ')}${needed.filter((p) => !rowsOf(prov).includes(p)).length ? ' — MISSING ' + needed.filter((p) => !rowsOf(prov).includes(p)).join(', ') : ''})`);
  const XP = ['xp', 'ra'].join('');
  const cut = prov.replace(new RegExp(`(PROGRAMS='|\\n)${XP} ${XP}\\n`), '$1');
  ok(rowsOf(cut).length > 5 && needed.filter((p) => !rowsOf(cut).includes(p)).join() === XP, `CONTROL: the provision list without its ${XP} row is red for ${XP} alone`);
  ok(/apparmor_restrict_unprivileged_userns = 0/.test(prov) && /\/etc\/sysctl\.d\//.test(prov) && /apt-mark hold/.test(prov) && /fonts-noto-core/.test(prov),
    'the provision persists the ONE sysctl (B-4260 userns), pins + holds xpra, installs the hub\'s default sans (fonts-noto-core)');
  // the design's census, printed with a computed reason per differing name
  const q = readR('scripts/fixtures/ci-hosts-q038.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const diff = C.hostDesignDiff(plan, q);
  for (const x of diff.onlyThere) console.log(`    − ${x.name}: ${x.why}`);
  for (const x of diff.onlyHere) console.log(`    + ${x.name}: ${x.why}`);
  for (const x of diff.split) console.log(`    = ${x.name}: split by § into ${x.parts.join(', ')}`);
  ok(q.length === 67 && [...diff.onlyThere, ...diff.onlyHere].every((x) => x.why && !/not a heavy suite/.test(x.why)),
    `the design's census (${q.length}) vs the derivation: ${diff.onlyThere.length} there only, ${diff.onlyHere.length} here only — each with its computed reason (printed above)`);
  const xw = diff.split.find((x) => x.name === 'test-desktop-xpra-window');
  ok(!!xw && xw.parts.length >= 4 && xw.parts.every((p) => names(plan.desktop).includes(p)) && !diff.onlyHere.some((x) => xw.parts.includes(x.name)),
    `the design's xpra giant reads as SPLIT (q-038 ②): ${xw ? xw.parts.length + ' parts, each desktop, none listed as a newer suite' : 'NOT FOUND'}`);
  const gone = C.hostDesignDiff(plan, [...q, 'test-not-a-suite-anywhere']).onlyThere.find((x) => x.name === 'test-not-a-suite-anywhere');
  const offSide = C.hostDesignDiff({ ...plan, self: plan.self.filter((s) => s.name !== (xw && xw.parts[0])) }, q).onlyThere.find((x) => x.name === 'test-desktop-xpra-window');
  ok(!!gone && /not a heavy suite/.test(gone.why) && !!offSide && /NOT self-hosted/.test(offSide.why),
    'CONTROL: a listed name with no suite and no family is still "not a heavy suite"; a family part off the self-hosted side is named');
  // the rule through its own shapes — ASSEMBLED, so this file's text runs none of them (THE TIER RULE reads it too)
  const P_ = { cx: ['co', 'dex'].join(''), oc: ['open', 'code'].join(''), bw: ['bw', 'rap'].join(''), rc: ['rcl', 'one'].join(''), fz: '/dev/' + 'fuse', cv: ['command', '-v'].join(' '), xs: ['startX', 'Server'].join('') };
  const H = (code, row = {}) => C.hostOf(row, code);
  ok(H(`const p = spawn('${XP}', ['start', ':9']);`).host === 'desktop' && H(`await D.${P_.xs}({ bin: 'X' });`).host === 'desktop',
    'NEG: a suite whose code names a desktop program (or starts an X server through desktop-display) is desktop');
  ok(H(`execSync('${P_.cv} ${P_.cx}');`).programs.join() === P_.cx && H(`spawn('${P_.oc}', ['serve']);`).programs.join() === P_.oc && H(`dm.open({ cmd: '${P_.bw}' });`).programs.join() === P_.bw
    && H(`const R = path.join(repo, 'data/bin/${P_.rc}');`).programs.join() === P_.rc && H(`fs.existsSync('${P_.fz}')`).programs.join() === P_.rc && H(`execSync('${P_.cv} ${P_.cx}');`).host === 'binary',
    'NEG: a binary by a probe, a literal command, a cmd: field, a path ending in it, /dev/fuse — binary');
  const cmt = H(`// no ${XP} on this box\nconst a = 1;`);
  ok(cmt.host === 'hosted' && cmt.mentions.includes(XP) && H(`effortDisplay('${P_.cx}', 'ultra'); const m = { backend: '${P_.oc}' };`).host === 'hosted',
    'NON-HITS: a program named only in a comment, a harness id, a backend name — hosted (the design census\'s over-reads)');
  ok(H('', { host: 'desktop', hostWhy: 'reaches it through src/desktop-display.js' }).host === 'desktop'
    && /toward the self-hosted side only/.test(H(`spawn('${XP}');`, { host: 'hosted' }).problems.join()) && H(`spawn('${XP}');`, { host: 'hosted' }).host === 'desktop'
    && /without a hostWhy/.test(H('', { host: 'binary' }).problems.join()) && /none of/.test(H('', { host: 'laptop', hostWhy: 'x' }).problems.join()),
    'a DECLARED host moves a suite toward the self-hosted side only; \'hosted\' over a derived verdict, a reasonless or unknown host is a problem (and moves nothing)');
  for (const [n, h] of [['test-desktop-xpra-window-open', 'desktop'], ['test-opencode-s9', 'binary'], ['test-node-bootstrap', 'binary'], ['test-channels-i18n', 'hosted'], ['test-toast-pass-through', 'hosted']]) {
    ok(plan.verdicts.get(n) && plan.verdicts.get(n).host === h, `CONTROL: ${n} is ${h} (${plan.verdicts.get(n) && (plan.verdicts.get(n).programs.join(',') || 'names none it runs')})`);
  }
  // the hosted half: 6 shards, LPT over the checked-in runner times
  const tm = C.shardTimings(REPO);
  const hosted = plan.hosted;
  ok(tm && hosted.filter((s) => s.name in tm).length >= hosted.length * 0.9, `scripts/fixtures/ci-shard-timings.json times the hosted set (${tm ? hosted.filter((s) => s.name in tm).length : 0} of ${hosted.length})`);
  const lp = C.shardPlan(hosted, 6, { sourceOf: srcOf, timings: tm || {} });
  const fnv = C.shardPlan(hosted, 6, { sourceOf: srcOf });
  const loadOf = (sh) => sh.reduce((a, s) => a + (tm && tm[s.name] || 0), 0);
  ok(!C.shardCensus(hosted, lp.shards, lp.serial).length && lp.serial.every((n) => lp.shards[0].some((s) => s.name === n)) && lp.shards.every((x) => x.length),
    `6 hosted shards (LPT): ${lp.shards.map((x) => x.length).join(' + ')} = ${hosted.length}, each once, the serial group (${lp.serial.join(', ')}) whole in shard 1`);
  ok(Math.max(...lp.loads) / Math.min(...lp.loads) < 1.1, `LPT balances them: ${lp.loads.map((x) => Math.round(x / 1000)).join(' / ')} s of suites (max/min < 1.1)`);
  ok(Math.max(...fnv.shards.map(loadOf)) > Math.max(...lp.loads), `CONTROL: the name-hash split of the same set is worse (max ${Math.round(Math.max(...fnv.shards.map(loadOf)) / 1000)} s vs ${Math.round(Math.max(...lp.loads) / 1000)} s)`);
  const sp = (p) => p.shards.map((x) => x.map((y) => y.name).sort().join()).join('|');
  ok(sp(C.shardPlan([...hosted].reverse(), 6, { sourceOf: srcOf, timings: tm || {} })) === sp(lp), 'the SAME table and times give the SAME split (every matrix job agrees) — not a function of the table order');
  const grown = C.shardPlan([...hosted, { name: 'test-zz-added-suite', tier: 'heavy' }], 6, { sourceOf: srcOf, timings: tm || {} });
  ok(grown.shards.every((x, k) => lp.shards[k].every((y) => x.some((z) => z.name === y.name))), 'an UNMEASURED new suite takes its name-hash slot and moves no measured one');
  // the two runners together: the hosted shards + the self-hosted batch = the tier, each suite once
  const together = [...lp.shards.flat().map((s) => s.name), ...names(plan.self)];
  ok(together.length === heavy.length && new Set(together).size === heavy.length, `the 6 hosted shards + the desktop batch run ${together.length} = the ${heavy.length} heavy suites, each exactly once`);
  const wf = readR('.github/workflows/ci.yml');
  const hostedRun = /node scripts\/ci\.mjs --heavy --dirty-ok --host=hosted --shard \$\{\{ matrix\.shard \}\}\/6/;
  ok(hostedRun.test(wf) && /shard:\s*\[1, 2, 3, 4, 5, 6\]/.test(wf) && /branches: \[master, 'ci\/\*\*'\]/.test(wf), 'ci.yml runs the HOSTED half as 6 shards (and a ci/** push gets the same mirror)');
  ok(!hostedRun.test(wf.replace('--host=hosted ', '')), 'CONTROL: a workflow without --host=hosted fails that census (it would rerun the self-hosted suites as skips)');
  // the hub's LOAD RULE: 4 lanes, forced or not; only a second machine's run goes past it
  ok(C.HUB_MAX_LANES === 4 && C.laneCount({ cpus: 32, env: { VIBESPACE_CI_LANES: '8' } }) === 4 && C.laneCount({ cpus: 128, env: {} }) === 4
    && C.laneCount({ cpus: 32, env: { VIBESPACE_CI_LANES: '3' } }) === 3 && C.laneCount({ cpus: 32, env: { VIBESPACE_CI_LANES: '8', VIBESPACE_CI_REMOTE_RUN: 'r1' } }) === 8,
    'the hub\'s LOAD RULE: at most 4 lanes even when VIBESPACE_CI_LANES asks 8; a second machine\'s run (VIBESPACE_CI_REMOTE_RUN) takes its 8');
  const at = (h) => new Date(2026, 9, 14, h, 30);
  ok(/--allow-hub-full/.test(C.hubFullRefusal({ full: true, env: {}, now: at(13) }) || '') && C.hubFullRefusal({ full: true, env: {}, now: at(7) }) !== null
    && C.hubFullRefusal({ full: true, env: {}, now: at(23) }) !== null && C.hubFullRefusal({ full: true, env: {}, now: at(6) }) === null && C.hubFullRefusal({ full: true, env: {}, now: at(0) }) === null,
    'a FULL tier on the hub by day (07:00–24:00 local) is refused, naming --allow-hub-full; at night it runs');
  ok([C.hubFullRefusal({ full: false, env: {}, now: at(13) }), C.hubFullRefusal({ full: true, allow: true, env: {}, now: at(13) }), C.hubFullRefusal({ full: true, env: { VIBESPACE_CI_REMOTE_RUN: 'r' }, now: at(13) }), C.hubFullRefusal({ full: true, env: { GITHUB_ACTIONS: 'true' }, now: at(13) })].every((x) => x === null),
    'NON-HITS: a scoped run, --allow-hub-full, a second machine\'s run, a hosted runner');
  const ciSrc = readR('scripts/ci.mjs');
  const gateAt = ciSrc.indexOf('hubFullRefusal({ full: !only && !shard && !host && !range'), lockAt = ciSrc.indexOf('const held = acquireMachineLock(lockPath');
  ok(gateAt > 0 && lockAt > gateAt && /if \(dayNo && range\) \{ scope = 'affected'/.test(ciSrc),
    'the gate refuses at t=0 (before the machine lock / a build); the push launcher runs the AFFECTED tier by day instead of a due FULL one');
  // a lane's private env (the desktop batch's VIBESPACE_CI_LANE_ROOT)
  const LR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ci-gate-lane-'));
  try {
    const base = { PATH: '/bin', HOME: '/home/real', DISPLAY: ':0', WAYLAND_DISPLAY: 'w-0', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', XDG_RUNTIME_DIR: '/run/user/1000' };
    const e = C.laneEnv(3, { root: LR, env: base });
    ok(e.HOME === path.join(LR, 'lane-3', 'home') && e.XDG_RUNTIME_DIR === path.join(LR, 'lane-3', 'run') && (fs.statSync(e.XDG_RUNTIME_DIR).mode & 0o777) === 0o700
      && !('DISPLAY' in e) && !('WAYLAND_DISPLAY' in e) && !('DBUS_SESSION_BUS_ADDRESS' in e) && e.PATH === '/bin',
      'a lane\'s env: its own HOME + XDG_RUNTIME_DIR (0700), no DISPLAY, and never the caller\'s session bus when its own is not up');
    fs.writeFileSync(path.join(LR, 'lane-3', 'run', 'bus'), '');
    ok(C.laneEnv(3, { root: LR, env: base }).DBUS_SESSION_BUS_ADDRESS === 'unix:path=' + path.join(LR, 'lane-3', 'run', 'bus') && C.laneEnv(1, { root: '', env: base }) === base,
      '…its own bus once up; with no lane root the env is the caller\'s, untouched');
  } finally { fs.rmSync(LR, { recursive: true, force: true }); }
  // the CLI: --hosts prints the partition + the diff; a bad --host is a loud exit 2 (never a run of nothing)
  const cli = (args) => spawnSync(process.execPath, [path.join(REPO, 'scripts', 'ci.mjs'), ...args], { cwd: REPO, encoding: 'utf-8', env: { ...process.env, ...GIT_ENV } });
  const hr = cli(['--hosts']);
  ok(hr.status === 0 && new RegExp(`hosts: ${heavy.length} heavy suites = ${plan.desktop.length} desktop \\+ ${plan.binary.length} binary`).test(hr.stdout) && /the design's census \(q-038, 67 names\)/.test(hr.stdout),
    '`ci.mjs --hosts` prints the partition and the design diff (exit 0)');
  ok(cli(['--heavy', '--host=laptop', '--shard', '1/6', '--dry-run']).status === 2, '--host=laptop is a loud exit 2');
  // ONE slice through the CLI is enough to hold it to the in-process split above (the partition is asserted there)
  const d4 = cli(['--heavy', '--host=hosted', '--shard', '4/6', '--dry-run']);
  const listed4 = d4.status === 0 ? d4.stdout.split('\n').filter((l) => /^  test-/.test(l)).map((l) => l.trim()) : [];
  ok(listed4.length > 20 && listed4.slice().sort().join() === names(lp.shards[3]).sort().join() && /\(--host=hosted\) — LPT: \d+ s of suites/.test(d4.stdout),
    `--heavy --host=hosted --shard 4/6 --dry-run lists exactly LPT slice 4 (${listed4.length} suites) — the matrix job and this gate cut the same split`);
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

report();
