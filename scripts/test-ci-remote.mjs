#!/usr/bin/env node
// scripts/ci-remote.mjs — the second heavy runner (lane heavy-runner-aidev, 2026-10-13). No ssh, no second machine:
//   ① parseArgs: every refusal by name (a bad --shard, --only with --range, no --snapshot, no --host outside --list)
//   ② loadRule: the box's LOAD RULE at its edges (40 / 25 GB)
//   ③ selectSlice over THIS tree's ci.mjs: the n slices of an affected selection PARTITION it (none in two, none in
//     none), the serial group whole in slice 1, longest-first by a marker's timings; an unknown --only name refused
//   ④ the same cut as `ci.mjs --list-affected` (the hub half) — names AND order, over the same marker dir
//   ⑤ runScript: --only=<slice> --sha=<head>, a private HOME / XDG_RUNTIME_DIR / bus (TMPDIR=/tmp: the scratch law),
//     the run id in every child's env, the LOAD RULE printed; the snapshot = a git worktree at the head on the box
//     (the build's censuses read git ls-files), the missing commits as one bundle
//   ⑥ teardownScript for real on this machine: a process carrying the run id, one whose cwd is under the snap and one
//     naming the snap in its argv are killed and named; an unrelated sleeper survives (CONTROL: a copy keyed on another
//     id kills nothing of the run)
//   ⑦ THE DESKTOP BATCH (lane ci-aidev-desktop-batch, q-038 step ①): --batch refusals; the batch LOAD RULE (8 at
//     ≥ 40 GB); the batch = THIS tree's ci.mjs HOSTS self-hosted set (desktop + binary) — and cut by an affected range
//     inside it; a tree with no host rule is refused, never guessed; its run script hands ci.mjs a private env per
//     lane (VIBESPACE_CI_LANE_ROOT) + the serial lane beside the floor suite + the memory line (CONTROL: a non-batch
//     run carries none of it); the box's measured GTK row against the tree's rows (match / no row / disagree / none)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const R = await import(path.join(REPO, 'scripts/ci-remote.mjs'));
const CI = await import(path.join(REPO, 'scripts/ci.mjs'));
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ci-remote-'));
try {
  // ①
  const a = R.parseArgs(['--host', 'aidev', '--snapshot=/t', '--range', 'a..b', '--shard', '2/3', '--lanes=2', '--keep']);
  ok(a.host === 'aidev' && a.snapshot === '/t' && a.range === 'a..b' && a.shard.i === 2 && a.shard.n === 3 && a.lanes === '2' && a.keep, '① parseArgs: both spellings, the shard parsed');
  ok(throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--shard', '3/2']), /--shard wants/) && throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--shard', '0/2']), /--shard wants/), '① a shard outside 1..n refused');
  ok(throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--range', 'a..b', '--only', 'x']), /do not combine/), '① --only with --range refused (--only IS the selection)');
  ok(throws(() => R.parseArgs(['--host', 'h']), /--snapshot/) && throws(() => R.parseArgs(['--snapshot', '/t']), /--host/) && R.parseArgs(['--snapshot', '/t', '--list']).list, '① no --snapshot refused; no --host refused unless --list');
  ok(throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--lanes', '0']), /--lanes/) && throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--frob']), /unknown argument/), '① --lanes 0 and an unknown flag refused');
  // ②
  ok([45, 40, 39, 25, 24, 0].map(R.loadRule).join() === '4,4,2,2,1,1', '② LOAD RULE: ≥ 40 GB ⇒ 4 · ≥ 25 ⇒ 2 · else 1');
  // ③ a selection over a fixed change list (a heavy suite's own file ⇒ it + its importers) and the global input
  const heavy = CI.SUITES.filter((s) => s.tier === 'heavy');
  const changed = ['package.json'];
  const full = R.selectSlice(CI, { tree: REPO, changed, range: 'x..y' });
  ok(full.names.length === heavy.length, '③ a global input selects the whole tier', `${full.names.length}/${heavy.length}`);
  for (const n of [2, 3]) {
    const slices = Array.from({ length: n }, (_, k) => R.selectSlice(CI, { tree: REPO, changed, range: 'x..y', shard: { i: k + 1, n } }));
    const seen = new Map(); let dup = 0;
    slices.forEach((s, k) => s.names.forEach((x) => { if (seen.has(x)) dup++; seen.set(x, k); }));
    ok(dup === 0 && seen.size === full.names.length, `③ ${n} slices partition the selection (${slices.map((s) => s.names.length).join(' + ')} = ${full.names.length})`, `dup ${dup}, union ${seen.size}`);
    const ser = CI.scheduleLanes(heavy, { keepOrder: true, sourceOf: (x) => { try { return fs.readFileSync(path.join(REPO, 'scripts', x + '.mjs'), 'utf-8'); } catch { return ''; } } }).serial.map((s) => s.name);
    ok(ser.length > 0 && ser.every((x) => seen.get(x) === 0), `③ the serial group (${ser.length}) is whole in slice 1 of ${n}`);
  }
  const md = path.join(D, 'markers'); fs.mkdirSync(md);
  const two = heavy.slice(0, 2).map((s) => s.name);
  fs.writeFileSync(path.join(md, 'abcdef1.green'), JSON.stringify({ sha: 'abcdef1', endedAt: 1, timings: [{ name: two[0], ms: 5 }, { name: two[1], ms: 9000 }] }));
  const ord = R.selectSlice(CI, { tree: REPO, only: two, timingDirs: [md] });
  ok(ord.names.join() === [two[1], two[0]].join() && ord.measured === 2, '③ longest-first by the marker\'s timings (9000 ms before 5 ms)');
  const un = R.selectSlice(CI, { tree: REPO, only: two, timingDirs: [] });
  ok(un.names.join() === [two[1], two[0]].join(), '③ unmeasured: late-in-table first (the table runs cheap → expensive)');
  ok(throws(() => R.selectSlice(CI, { tree: REPO, only: ['test-not-a-suite'] }), /not a heavy suite/), '③ an unknown --only name refused before any rsync');
  // ④ the hub half cuts the same list
  for (const k of [2]) {
    const mine = R.selectSlice(CI, { tree: REPO, changed: ['src/server.js'], range: 'x..y', shard: { i: k, n: 2 }, timingDirs: [md] });
    const hub = CI.listAffected({ range: 'x..y', shard: { i: k, n: 2 }, dir: md, changed: ['src/server.js'] });
    ok(mine.names.length > 0 && mine.names.join() === hub.names.join(), `④ slice ${k}/2 = ci.mjs --list-affected's (${mine.names.length} names, same order)`);
  }
  const cli = spawnSync(process.execPath, [path.join(REPO, 'scripts/ci.mjs'), '--list-affected', '--shard', '2/2', `--markers=${md}`], { encoding: 'utf-8', cwd: REPO });
  const want = CI.listAffected({ shard: { i: 2, n: 2 }, dir: md }).names.join(',');
  ok(cli.status === 0 && cli.stdout.trim() === want && /shard 2\/2/.test(cli.stderr), '④ the CLI: comma-joined on stdout (an --only value), the reasons on stderr');
  // ⑤
  const rs = R.runScript({ snap: '/var/tmp/vibespace-ci/snap-x', id: 'RID1', names: ['test-a', 'test-b'], head: 'f'.repeat(40), lanes: null });
  ok(/--only=test-a,test-b --sha=f{40} --markers="\$S\/markers"/.test(rs) && /--lock="\$CI\/heavy.lock"/.test(rs), '⑤ the box runs the tree\'s ci.mjs on the slice, for the head, its own markers + lock');
  ok(/HOME="\$S\/home"/.test(rs) && /XDG_RUNTIME_DIR="\$S\/run"/.test(rs) && /TMPDIR=\/tmp /.test(rs) && /chmod 700 "\$S\/run"/.test(rs) && /dbus-run-session --/.test(rs) && /env -i /.test(rs), '⑤ a private HOME, runtime dir (0700) and session bus under a clean env; TMPDIR=/tmp (scratch roots are /tmp/vs-*)');
  ok(/VIBESPACE_CI_REMOTE_RUN="\$ID"/.test(rs) && /VIBESPACE_SKIP_AGENT_HOOKS=1/.test(rs) && /VIBESPACE_CI_DIR_SWEEP=off/.test(rs), '⑤ the run id in every child\'s env; agent hooks + the dir sweep off');
  ok(/ge 40 \]; then echo 4; elif \[ \$avail -ge 25 \]; then echo 2; else echo 1/.test(rs) && /LOAD RULE/.test(rs) && /VIBESPACE_CI_LANES=3 \(--lanes\)|lanes=3/.test(R.runScript({ snap: '/s', id: 'i', names: ['t'], head: 'h', lanes: '3' })), '⑤ the LOAD RULE read on the box and printed; --lanes overrides');
  const src = fs.readFileSync(path.join(REPO, 'scripts/ci-remote.mjs'), 'utf-8');
  ok(/'bundle', 'create', '-q', bf, 'HEAD', \.\.\.\(not\.length \? \['--not', \.\.\.not\]/.test(src) && /worktree add -q --detach \$\{sh\(snap \+ '\/tree'\)\} \$\{head\}/.test(src) && !/'--exclude=\/data/.test(src), '⑤ the box checks out a WORKTREE at the head (the commits it lacks as a bundle) — no node_modules / data/ ever shipped');
  // ⑥ for real: three marked processes + one bystander
  const snap = path.join(D, 'snap'); fs.mkdirSync(path.join(snap, 'tree'), { recursive: true });
  const kids = [
    spawn('sleep', ['300'], { env: { ...process.env, VIBESPACE_CI_REMOTE_RUN: 'RID-T' }, detached: true, stdio: 'ignore' }),
    spawn('sleep', ['301'], { cwd: path.join(snap, 'tree'), env: { PATH: process.env.PATH }, detached: true, stdio: 'ignore' }),
    spawn('bash', ['-c', 'sleep 302; : ' + snap + '/tree'], { env: { PATH: process.env.PATH }, detached: true, stdio: 'ignore' }),
  ];
  const by = spawn('sleep', ['303'], { env: { PATH: process.env.PATH }, detached: true, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 300));
  const alive = (p) => { try { return !/^\d+ \([^)]*\) Z/.test(fs.readFileSync(`/proc/${p}/stat`, 'utf-8')); } catch { return false; } };
  const ctl = spawnSync('bash', ['-s'], { input: R.teardownScript(path.join(D, 'other'), 'RID-OTHER'), encoding: 'utf-8' });
  ok(kids.every((k) => alive(k.pid)) && /no process of the run left/.test(ctl.stdout), 'CONTROL ⑥ a teardown for another run id + snap kills none of these');
  const td = spawnSync('bash', ['-s'], { input: R.teardownScript(snap, 'RID-T', { graceS: 0.3 }), encoding: 'utf-8' });
  await new Promise((r) => setTimeout(r, 300));
  ok(kids.every((k) => !alive(k.pid)), '⑥ the run\'s processes are gone (by env, by cwd, by argv)', td.stdout.trim().slice(0, 300));
  ok(['env', 'cwd', 'argv'].every((w) => td.stdout.includes(`(by ${w})`)) && /3 process\(es\) TERMed/.test(td.stdout), '⑥ each one named with what tied it to the run');
  ok(alive(by.pid), '⑥ the bystander survives');
  for (const k of [...kids, by]) { try { process.kill(k.pid, 'SIGKILL'); } catch { } }
  // ⑦ the desktop batch
  const b = R.parseArgs(['--host', 'aidev', '--snapshot', '/t', '--batch', 'desktop', '--lanes', '8', '--range', 'a..b']);
  ok(b.batch === 'desktop' && b.lanes === '8' && b.range === 'a..b', '⑦ parseArgs: --batch desktop (with --lanes and an affected --range)');
  ok(throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--batch', 'laptop']), /--batch wants desktop/)
    && throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--batch', 'desktop', '--only', 'x']), /--batch IS the selection/)
    && throws(() => R.parseArgs(['--host', 'h', '--snapshot', '/t', '--batch', 'desktop', '--shard', '1/2']), /--batch IS the selection/),
    '⑦ an unknown batch, --batch with --only and --batch with --shard are refused by name');
  ok([45, 40, 39, 25, 24].map((g) => R.loadRule(g, { batch: true })).join() === '8,8,4,4,2' && R.loadRule(45) === 4, '⑦ the batch LOAD RULE: ≥ 40 GB ⇒ 8 · ≥ 25 ⇒ 4 · else 2 (the tier\'s stays 4 / 2 / 1)');
  const srcOf = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf-8'); } catch { return ''; } };
  const self = CI.hostPlan(heavy, { sourceOf: srcOf }).self.map((s) => s.name).sort();
  const bt = R.selectSlice(CI, { tree: REPO, batch: 'desktop' });
  ok(self.length > 20 && bt.names.slice().sort().join() === self.join() && /--batch desktop: the \d+ self-hosted/.test(bt.summary),
    `⑦ the batch IS the tree's self-hosted set (${bt.names.length} of ${heavy.length}: ci.mjs hostPlan .self)`);
  const bta = R.selectSlice(CI, { tree: REPO, batch: 'desktop', changed: ['package.json'], range: 'x..y' });
  ok(bta.names.slice().sort().join() === self.join(), '⑦ an affected batch selects inside the self-hosted set (a global input ⇒ all of it, none of the hosted)');
  ok(throws(() => R.selectSlice({ SUITES: CI.SUITES }, { tree: REPO, batch: 'desktop' }), /no HOSTS rule/), 'CONTROL ⑦ a tree whose ci.mjs predates the host rule is refused (never a guessed list)');
  const brs = R.runScript({ snap: '/s', id: 'RID', names: ['test-a'], head: 'h', lanes: null, batch: 'desktop' });
  const nrs = R.runScript({ snap: '/s', id: 'RID', names: ['test-a'], head: 'h', lanes: null });
  ok(/VIBESPACE_CI_LANE_ROOT="\$S\/lanes"/.test(brs) && /--serial-overlap=1/.test(brs) && /then echo 8; elif \[ \$avail -ge 25 \]; then echo 4/.test(brs) && /MemAvailable lowest/.test(brs),
    '⑦ the batch run script: a private env per lane (VIBESPACE_CI_LANE_ROOT), the serial lane beside the floor suite, the batch LOAD RULE, the memory line');
  ok(!/VIBESPACE_CI_LANE_ROOT|--serial-overlap/.test(nrs) && /then echo 4; elif/.test(nrs), 'CONTROL ⑦ a non-batch run script carries none of the batch\'s lane env');
  const rows = { '4.22': { calculator: '50.0', calcSize2x: [720, 1232], calcMin2x: [720, 1232], calcButtonBound: true, pushButtonRole: 'button' }, '4.14': { calculator: '46.3', calcSize2x: [720, 1004], calcMin2x: [694, 980], calcButtonBound: false, pushButtonRole: 'push button' } };
  const box = (o) => JSON.stringify({ gtk: '4.14.5', calculator: '46.3', atspi: '2.52.0', calcSize2x: [720, 1004], calcMinFirst2x: [694, 1004], calcMin2x: [694, 980], calcButtonBound: false, pushButtonRole: 'push button', ...o });
  ok(R.gtkRowVerdict(box({}), rows).ok, '⑦ the GTK row: a box measuring what the tree\'s "4.14" row says is accepted');
  ok(!R.gtkRowVerdict(box({ gtk: '4.18.1' }), rows).ok && /NO row[\s\S]*under "4\.18"/.test(R.gtkRowVerdict(box({ gtk: '4.18.1' }), rows).why), '⑦ a GTK the tree has no row for is refused, naming the row to check in');
  ok(/disagrees[\s\S]*calcMin2x/.test(R.gtkRowVerdict(box({ calcMin2x: [694, 1004] }), rows).why) && /pushButtonRole/.test(R.gtkRowVerdict(box({ pushButtonRole: 'button' }), rows).why) && R.gtkRowVerdict(box({ calcMinFirst2x: [694, 980] }), rows).ok,
    '⑦ a box that measures differently from its row is refused (the field named)');
  ok(!R.gtkRowVerdict('', rows).ok && /ci-provision-aidev\.sh/.test(R.gtkRowVerdict('', rows).why), '⑦ a box that never measured is refused, naming the provision step');
  const fx = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'gtk-rows.json'), 'utf-8')).rows;
  ok(fx['4.22'] && fx['4.14'] && fx['4.22'].calcMin2x.join() === '720,1232' && fx['4.22'].calcButtonBound === true && fx['4.14'].calcMin2x.join() === '694,980' && fx['4.14'].pushButtonRole === 'push button',
    '⑦ the checked-in rows carry the hub (4.22) and AIDev (4.14), as measured inside xpra');
} finally {
  fs.rmSync(D, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
