#!/usr/bin/env node
// The health sweep's TWO QUESTIONS (lane mount-liveness, 2026-10-09 — the owner's OneDrive torn down 37× in 7 days by
// ONE `ls` that took over 6 s). src/mount-liveness.js is the verdict table (PURE); src/mounts.js only gathers witnesses.
//   ① the (attr, list, backend, cpuΔ, strikes) matrix → verdict, on fixtures FROM REAL DATA: the 10-08 20:34 profile
//     (listing hung, daemon alive, backend answers in 2 s ⇒ slow, never a teardown — the OLD single-ls first-strike rule
//     on the same fixture tears down), SIGSTOP (attr hung × strikes ⇒ dead), unreachable (both silent ⇒ blocked + said,
//     teardown only at the ceiling), daemon gone ⇒ died, wedged (backend answered twice ⇒ teardown)
//   ② every row's probe cell + the defaults (strikes ≥ 2; cephfs keeps 12 s / 2) · ③ the words en/zh/ja
//   ④ the REAL MountManager over stubbed probes: the verdict line + metric per strike, a named teardown, list().probe;
//     the child resolver (a drive child never reads the s3 row's flag)
//   ⑤ patched-copy controls: the verdict line removed ⇒ red · strikes 1 ⇒ red · the child resolver reverted ⇒ red
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const L = require(path.join(REPO, 'src/mount-liveness.js'));
const PROVIDERS = require(path.join(REPO, 'src/mount-providers/index.js'));
const cloud = PROVIDERS.rowOf('onedrive');
const W = (attr, list, backend, cpu = 0, now = 0) => ({ daemonAlive: true, now, cpuTicks: cpu,
  attr: { state: attr, ms: attr === 'hung' ? 6000 : 4 }, list: { state: list, ms: list === 'hung' ? 20000 : 1800 }, backend: { state: backend, ms: 2000 } });
const run = (Lx, seq, row = cloud) => { let st; return seq.map((w) => { const v = Lx.livenessStep(st, w, row); st = v.state; return v; }); };

// ── ① the matrix on real fixtures ──
console.log('① verdicts');
// the 10-08 20:34 profile: 41 threads futex-waiting, +0–1 CPU ticks, the listing past the probe, Graph answering a fresh lsf in ~2 s
const PROFILE = W('ok', 'hung', 'ok', 1);
const oldRule = (w, row) => w.list.state === 'hung' && !(w.cpuTicks >= 30) && 1 >= (row.hungStrikes || 0);   // base 4135dd64e: first hung ls tears down a cloud row
{
  const [v] = run(L, [PROFILE]);
  ok(v.verdict === 'slow' && !v.teardown && v.blockMs > 0 && v.words.key === 'slow', '① the 10-08 20:34 profile ⇒ slow: kept connected, path blocked, said — never a teardown', JSON.stringify(v));
  ok(oldRule(PROFILE, cloud) === true, '① CONTROL: the old single-ls first-strike rule on the SAME fixture tears down (the 37 disconnects)');
  const many = run(L, [PROFILE, W('ok', 'hung', 'skipped', 0), PROFILE, W('ok', 'hung', 'skipped', 0)]);
  ok(many.every((x) => x.verdict === 'slow' && !x.teardown), '① a slow listing forever, with no backend comparison between, never tears down (the wedged chain breaks)');
}
{
  const [a, b] = run(L, [W('hung', 'skipped', 'skipped', 0), W('hung', 'skipped', 'skipped', 0)]);
  ok(a.verdict === 'dead' && !a.teardown && a.blockMs > 0 && a.strikes.n === 1 && a.strikes.N === 2, '① SIGSTOP strike 1: the path is blocked from strike 1, no teardown', JSON.stringify(a));
  ok(b.verdict === 'dead' && b.teardown && /did not answer a root check 2 sweeps/.test(b.reason), '① SIGSTOP strike 2 ⇒ dead: teardown with a named cause', b.reason);
  const [, c] = run(L, [W('hung', 'skipped', 'skipped', 0), W('ok', 'ok', 'skipped', 0)]);
  ok(c.verdict === 'alive' && c.unblock && c.state.silent === 0, '① one silent sweep then an answer ⇒ alive, unblocked, strikes reset');
  const [d] = run(L, [W('hung', 'skipped', 'skipped', 40)]);
  ok(d.verdict === 'slow' && d.words.key === 'busy' && d.strikes.n === 0, '① the 10-04 CPU guard as a witness: attr hung while the daemon burns CPU ⇒ never a dead strike');
}
{
  const CEIL = L.probeCell(cloud).unreachableCeilingMs;
  const v = run(L, [W('ok', 'hung', 'hung', 0, 1000), W('ok', 'hung', 'hung', 0, 1000 + CEIL / 2), W('ok', 'hung', 'hung', 0, 1000 + CEIL)]);
  ok(v[0].verdict === 'unreachable' && !v[0].teardown && v[0].blockMs > 0 && v[0].words.key === 'unreachable', '① unreachable (listing + fresh check silent) ⇒ kept mounted, blocked, said');
  ok(!v[1].teardown && v[2].teardown && v[2].words.key === 'gone', '① …torn down only at the unreachable ceiling (the dead-host defense survives)', JSON.stringify(v.map((x) => x.teardown)));
}
{
  const v = L.livenessStep(undefined, { daemonAlive: false }, cloud);
  ok(v.verdict === 'died' && v.teardown && v.words.key === 'died', '① daemon gone ⇒ died');
  const [a, b] = run(L, [W('ok', 'hung', 'ok'), W('ok', 'hung', 'error')]);
  ok(a.verdict === 'slow' && !a.teardown && b.verdict === 'wedged' && b.teardown && /backend answered each time/.test(b.reason), '① wedged: the listing hung twice while the backend answered (an auth error is an answer) ⇒ teardown');
  const [, c] = run(L, [W('ok', 'hung', 'ok'), W('ok', 'error', 'skipped')]);
  ok(c.verdict === 'alive' && !c.teardown, '① a listing that answers with an error is alive here (the access-error path judges it)');
}
// ── ② cells ──
console.log('② probe cells');
{
  const d = L.probeCell({});
  ok(d.attrMs === 6000 && d.listMs === 20000 && d.strikes === 2 && d.wedgedStrikes === 2, '② a row that declares nothing gets the table defaults (attr 6 s, list 20 s, strikes 2)');
  ok(L.probeCell({ probe: { strikes: 1, wedgedStrikes: 0 } }).strikes === 2, '② strikes never below 2 (a row asking for 1 gets 2)');
  const ceph = L.probeCell(PROVIDERS.rowOf('cephfs'));
  ok(ceph.attrMs === 12000 && ceph.listMs === 12000 && ceph.strikes === 2, '② cephfs keeps its 12 s / 2 strikes through the same cell');
  const bad = [];
  for (const r of PROVIDERS.rows) {
    if (r.filesystem === false) continue;
    if (r.probe) for (const p of L.cellProblems(r.probe)) bad.push(`${r.id}: ${p}`);
    if (r.probeMs !== undefined || r.hungStrikes !== undefined) bad.push(`${r.id}: a legacy probeMs/hungStrikes cell`);
    if (L.probeCell(r).strikes < 2) bad.push(`${r.id}: strikes < 2`);
  }
  ok(bad.length === 0 && PROVIDERS.rows.length >= 10, `② row census: every filesystem row's probe cell valid, strikes ≥ 2 (${PROVIDERS.rows.length} rows)`, bad.join('; '));
}
// ── ③ words ──
console.log('③ words');
{
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  const bad = Object.entries(L.WORDS).filter(([, w]) => !w.en || !w.zh || !w.ja || holes(w.en) !== holes(w.zh) || holes(w.en) !== holes(w.ja)).map(([k]) => k);
  ok(bad.length === 0 && Object.keys(L.WORDS).length >= 8, '③ every verdict sentence in en/zh/ja with the same placeholders', bad.join());
  ok(L.wordsFor('slow', 'zh', { s: 20 }).includes('20 秒') && L.wordsFor('slow', 'xx', { s: 20 }).startsWith('storage slow'), '③ wordsFor fills placeholders; an unknown language falls back to en');
  const line = L.verdictLine('OneDrive', L.livenessStep(undefined, PROFILE, cloud), PROFILE);
  ok(/^\[mounts\] OneDrive slow: attr 4ms · list hung · backend 2000ms · cpu \+1 · strike 1\/2$/.test(line), '③ the journal line carries every witness', line);
}

// ── ④ the real MountManager over stubbed probes ──
async function managerLegs(MM, Lx, tag) {
  const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || '/tmp', 'vs-mlive-' + tag + '-'));
  const mm = new MM({ dataDir: D, broadcast: () => {} });
  mm._state.mounts.push({ id: 'od', name: 'OneDrive', type: 'onedrive', desired: 'mounted' }, { id: 'p', name: 'G', type: 'drive', kind: 'credential' }, { id: 'c', name: 'Gc', parentId: 'p' });
  const lines = [], metrics = [], calls = [];
  const warn = console.warn; console.warn = (s) => lines.push(String(s));
  global.__vsMetric = (n, v, d) => metrics.push([n, v, d]);
  mm.isMounted = (m) => m.id === 'od'; mm._daemonAlive = () => true; mm._daemonPids = () => []; mm._kindOf = (m) => m.kind === 'credential' ? 'credential' : 'mount';
  mm._probeMountpoint = async (mp, ms, verb) => verb === 'attr' ? { health: 'ok', ms: 4 } : { health: 'hung', ms };
  mm._probeBackendAccess = async () => 'ok';
  mm.unmount = async (id) => { calls.push(id); }; mm._killMountDaemon = () => {}; mm._noteReconnectBackoff = () => {}; mm._maybeAutoRemount = async () => {};
  try {
    await mm._healthSweep();
    const r1 = { lines: lines.slice(), unmounts: calls.length, probe: mm.list().find((x) => x.id === 'od').probe, blocked: !!mm.pathBlocked(mm.pathOf(mm._get('od'))) };
    await mm._healthSweep();
    const r2 = { lines: lines.slice(), unmounts: calls.length, metrics: metrics.slice() };
    let childS3 = null;
    try { const { rowFor } = MM.__module || {}; childS3 = (rowFor || (() => null))(mm, mm._get('c'))?.s3Backend ? true : false; } catch {}
    return { r1, r2, childS3, lx: Lx };
  } finally { console.warn = warn; delete global.__vsMetric; fs.rmSync(D, { recursive: true, force: true }); }
}
console.log('④ the real MountManager');
const MOUNTS = path.join(REPO, 'src/mounts.js');
const mod = require(MOUNTS);
const legs = async (m, tag) => { m.MountManager.__module = m; return managerLegs(m.MountManager, L, tag); };
const real = await legs(mod, 'real');
ok(real.r1.unmounts === 0 && real.r1.lines.length === 1 && /od slow: attr 4ms · list hung · backend \d+ms/.test(real.r1.lines[0]), '④ sweep 1: ONE verdict line, no teardown', real.r1.lines.join(' | '));
ok(real.r1.probe && real.r1.probe.verdict === 'slow' && real.r1.probe.strikes === 1 && real.r1.blocked, '④ list() carries probe {verdict, strikes, lastMs}; the path is blocked', JSON.stringify(real.r1.probe));
ok(real.r2.unmounts === 1 && /od wedged: .* — TEARDOWN: the listing hung 2 sweeps in a row while the backend answered/.test(real.r2.lines[1] || ''), '④ sweep 2: wedged — the teardown line names its cause', real.r2.lines[1]);
ok(real.r2.metrics.length === 2 && real.r2.metrics.every(([n, , d]) => n === 'mount-probe-ms' && /^mount=od verdict=(slow|wedged)$/.test(d)), '④ ONE mount-probe-ms metric per strike / teardown', JSON.stringify(real.r2.metrics));
ok(real.childS3 === false, '④ a drive CHILD reads its parent\'s row: no s3 flag (the /mnt/gdrive_39ai_shared live proof)');
{
  const src = fs.readFileSync(MOUNTS, 'utf8');
  const bare = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /(?<![\w.])rowOf\(/.test(l) && !/^const (rowOf|rowFor) = /.test(l));
  ok(bare.length === 0 && (src.match(/rowFor\(this, /g) || []).length >= 35, `④ census: every row read in src/mounts.js goes through rowFor(this, …) (${(src.match(/rowFor\(this, /g) || []).length} sites; PROVIDERS.rowOf(<type>) is a type lookup)`, bare.map(([n, l]) => n + ': ' + l.trim().slice(0, 80)).join(' | '));
  ok((src.match(/rowFor\(this, m\)\.s3Backend\?\.\(m\.parentId \? this\._connOf\(m\) : m\)/g) || []).length === 2, '④ census: both s3-flag sites (the argv, the backend probe) read the effective row with the connection');
}

// ── ⑤ patched-copy controls ──
console.log('⑤ controls');
const MC = mutantCopies('mount-liveness', REPO);
{
  const src = fs.readFileSync(MOUNTS, 'utf8');
  const from = 'console.warn(LIVENESS.verdictLine(m.id, v, w));';
  ok(src.includes(from), '⑤ the verdict-line anchor exists');
  const m = await legs(require(MC.write('src/mounts.js', src.replace(from, 'void 0;'), 'noline')), 'noline');
  ok(m.r1.lines.length === 0, '⑤ CONTROL: the verdict line removed ⇒ the ④ line assert is red (no journal line)');
  const from2 = 'const rowFor = (x, m) => rowOf((m && !m.type && m.parentId && x?._state?.mounts?.find((r) => r.id === m.parentId)) || m);';
  ok(src.includes(from2), '⑤ the child-resolver anchor exists');
  const m2 = await legs(require(MC.write('src/mounts.js', src.replace(from2, 'const rowFor = (x, m) => rowOf(m);'), 'norowfor')), 'norowfor');
  ok(m2.childS3 === true, '⑤ CONTROL: the child resolver reverted ⇒ a drive child reads the s3 row (red)');
}
{
  const lsrc = fs.readFileSync(path.join(REPO, 'src/mount-liveness.js'), 'utf8');
  const one = lsrc.replace('  strikes: 2,  ', '  strikes: 1,  ').replace("const FLOORS = Object.freeze({ strikes: 2, wedgedStrikes: 2 });", "const FLOORS = Object.freeze({ strikes: 1, wedgedStrikes: 1 });");
  ok(one !== lsrc, '⑤ the strikes anchors exist');
  const L1 = require(MC.write('src/mount-liveness.js', one, 'strikes1'));
  const [a] = run(L1, [W('hung', 'skipped', 'skipped', 0)]);
  ok(a.teardown === true, '⑤ CONTROL: strikes 1 ⇒ the SIGSTOP strike-1 assert is red (one silent sweep tears down)');
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
