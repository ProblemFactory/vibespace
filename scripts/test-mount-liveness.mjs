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
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  ok(verdictOf(many.every((x) => x.verdict === 'slow' && !x.teardown)), '① a slow listing forever, with no backend comparison between, never tears down (the wedged chain breaks)');
}
{
  const [a, b] = run(L, [W('hung', 'skipped', 'skipped', 0), W('hung', 'skipped', 'skipped', 0)]);
  ok(a.verdict === 'dead' && !a.teardown && a.blockMs > 0 && a.strikes.n === 1 && a.strikes.N === 2, '① SIGSTOP strike 1: the path is blocked from strike 1, no teardown', JSON.stringify(a));
  ok(b.verdict === 'dead' && gateOf(b.teardown) && verdictOf(/did not answer a root check 2 sweeps/.test(b.reason)), '① SIGSTOP strike 2 ⇒ dead: teardown with a named cause', b.reason);
  const [, c] = run(L, [W('hung', 'skipped', 'skipped', 0), W('ok', 'ok', 'skipped', 0)]);
  ok(c.verdict === 'alive' && gateOf(c.unblock) && c.state.silent === 0, '① one silent sweep then an answer ⇒ alive, unblocked, strikes reset');
  const [d] = run(L, [W('hung', 'skipped', 'skipped', 40)]);
  ok(d.verdict === 'slow' && d.words.key === 'busy' && d.strikes.n === 0, '① the 10-04 CPU guard as a witness: attr hung while the daemon burns CPU ⇒ never a dead strike');
}
{
  const CEIL = L.probeCell(cloud).unreachableCeilingMs;
  const v = run(L, [W('ok', 'hung', 'hung', 0, 1000), W('ok', 'hung', 'hung', 0, 1000 + CEIL / 2), W('ok', 'hung', 'hung', 0, 1000 + CEIL)]);
  ok(v[0].verdict === 'unreachable' && !v[0].teardown && v[0].blockMs > 0 && v[0].words.key === 'unreachable', '① unreachable (listing + fresh check silent) ⇒ kept mounted, blocked, said');
  ok(!v[1].teardown && gateOf(v[2].teardown) && v[2].words.key === 'gone', '① …torn down only at the unreachable ceiling (the dead-host defense survives)', JSON.stringify(v.map((x) => x.teardown)));
}
{
  const v = L.livenessStep(undefined, { daemonAlive: false }, cloud);
  ok(v.verdict === 'died' && gateOf(v.teardown) && v.words.key === 'died', '① daemon gone ⇒ died');
  const [a, b] = run(L, [W('ok', 'hung', 'ok'), W('ok', 'hung', 'error')]);
  ok(a.verdict === 'slow' && !a.teardown && b.verdict === 'wedged' && gateOf(b.teardown) && verdictOf(/backend answered each time/.test(b.reason)), '① wedged: the listing hung twice while the backend answered (an auth error is an answer) ⇒ teardown');
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
  ok(gateOf(L.wordsFor('slow', 'zh', { s: 20 }).includes('20 秒')) && verdictOf(L.wordsFor('slow', 'xx', { s: 20 }).startsWith('storage slow')), '③ wordsFor fills placeholders; an unknown language falls back to en');
  const line = L.verdictLine('OneDrive', L.livenessStep(undefined, PROFILE, cloud), PROFILE);
  ok(verdictOf(/^\[mounts\] OneDrive slow: attr 4ms · list hung · backend 2000ms · cpu \+1 · strike 1\/2$/.test(line)), '③ the journal line carries every witness', line);
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
ok(real.r1.unmounts === 0 && real.r1.lines.length === 1 && verdictOf(/od slow: attr 4ms · list hung · backend \d+ms/.test(real.r1.lines[0])), '④ sweep 1: ONE verdict line, no teardown', real.r1.lines.join(' | '));
ok(gateOf(real.r1.probe) && real.r1.probe.verdict === 'slow' && real.r1.probe.strikes === 1 && verdictOf(real.r1.blocked), '④ list() carries probe {verdict, strikes, lastMs}; the path is blocked', JSON.stringify(real.r1.probe));
ok(real.r2.unmounts === 1 && verdictOf(/od wedged: .* — TEARDOWN: the listing hung 2 sweeps in a row while the backend answered/.test(real.r2.lines[1] || '')), '④ sweep 2: wedged — the teardown line names its cause', real.r2.lines[1]);
ok(real.r2.metrics.length === 2 && verdictOf(real.r2.metrics.every(([n, , d]) => n === 'mount-probe-ms' && /^mount=od verdict=(slow|wedged)$/.test(d))), '④ ONE mount-probe-ms metric per strike / teardown', JSON.stringify(real.r2.metrics));
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
  ok(verdictOf(src.includes(from)), '⑤ the verdict-line anchor exists');
  const m = await legs(require(MC.write('src/mounts.js', src.replace(from, 'void 0;'), 'noline')), 'noline');
  ok(m.r1.lines.length === 0, '⑤ CONTROL: the verdict line removed ⇒ the ④ line assert is red (no journal line)');
  const from2 = 'const rowFor = (x, m) => rowOf((m && !m.type && m.parentId && x?._state?.mounts?.find((r) => r.id === m.parentId)) || m);';
  ok(verdictOf(src.includes(from2)), '⑤ the child-resolver anchor exists');
  const m2 = await legs(require(MC.write('src/mounts.js', src.replace(from2, 'const rowFor = (x, m) => rowOf(m);'), 'norowfor')), 'norowfor');
  ok(m2.childS3 === true, '⑤ CONTROL: the child resolver reverted ⇒ a drive child reads the s3 row (red)');
}
{
  const lsrc = fs.readFileSync(path.join(REPO, 'src/mount-liveness.js'), 'utf8');
  const one = editAnchor(editAnchor(lsrc, '  strikes: 2,  ', '  strikes: 1,  ', "src/mount-liveness.js"), "const FLOORS = Object.freeze({ strikes: 2, wedgedStrikes: 2 });", "const FLOORS = Object.freeze({ strikes: 1, wedgedStrikes: 1 });", "src/mount-liveness.js");
  ok(one !== lsrc, '⑤ the strikes anchors exist');
  const L1 = require(MC.write('src/mount-liveness.js', one, 'strikes1'));
  const [a] = run(L1, [W('hung', 'skipped', 'skipped', 0)]);
  ok(a.teardown === true, '⑤ CONTROL: strikes 1 ⇒ the SIGSTOP strike-1 assert is red (one silent sweep tears down)');
}

// ⑥ B-afc4 (lane mount-readers-blocked): a BLOCKED path is answered by every door in ms, never read. The fake FUSE is a
// reader that records the ask and NEVER resolves — a door that reads first would hang (or record) instead of answering.
{
  const DOOR = require(path.join(REPO, 'src/mount-door.js'));
  const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
  const DFS = require(path.join(REPO, 'src/design-fs.js'));
  const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
  const CTX = require(path.join(REPO, 'src/ctx-sync.js'));
  const { runUsageWalk } = require(path.join(REPO, 'src/usage-walker.js'));
  const os = require('node:os');
  const tmp6 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-door-'));
  const MP = path.join(tmp6, 'od'), PROJ = path.join(tmp6, 'projects'), PD = path.join(PROJ, '-home-x-proj');
  fs.mkdirSync(path.join(MP, 'ctx'), { recursive: true }); fs.mkdirSync(PD, { recursive: true });
  fs.writeFileSync(path.join(PD, 's1.jsonl'), '');
  const roots = [MP, PD];
  DOOR.register({ pathBlocked: (p) => roots.find((r) => p === r || p.startsWith(r + '/')) || false });
  const asked = [], warn = [];
  const fsp = fs.promises, rd0 = fsp.readdir, rds0 = fs.readdirSync, w0 = console.warn;
  fsp.readdir = (p, ...a) => { asked.push(String(p)); return new Promise(() => {}); };   // the silent FUSE
  fs.readdirSync = (p, ...a) => { if (String(p).startsWith(tmp6)) asked.push(String(p)); return rds0(p, ...a); };
  console.warn = (...a) => warn.push(a.join(' '));
  // the door answers BEFORE THE EVENT LOOP TURNS — no read, no worker, no timer (a door that read first would never
  // answer: the fake FUSE never resolves); that is the evidence, never a wall-clock bound (lane mirror-flake-hardening:
  // the old `< 50 ms` judged the machine). The ms are printed for information.
  const timed = async (fn) => { const t0 = performance.now(), r = {}; const p = (async () => { try { r.v = await fn(); } catch (x) { r.e = x; } })(); r.inTurn = await Promise.race([p.then(() => true), new Promise((res) => setImmediate(() => res(false)))]); r.ms = performance.now() - t0; return r; };
  // SafeFs: the pool's door — a pool whose pick records and whose worker never answers
  const sfs = Object.create(SafeFs.prototype);
  let picked = 0;
  Object.assign(sfs, { _closed: false, _blockedOf: DOOR.blocked, timeouts: { default: 60000 }, _pick: () => { picked++; return null; }, _inlineRun: () => new Promise(() => {}) });
  const sf = await timed(() => sfs.call('listDir', { path: path.join(MP, 'Docs') }));
  const sm = await timed(() => sfs.call('move', { src: '/var/tmp/x', dest: path.join(MP, 'x') }));
  ok(sf.e?.status === 503 && sf.e.code === 'storage-blocked' && sf.e.message === DOOR.SENTENCE && sm.e?.code === 'storage-blocked' && picked === 0 && gateOf(sf.inTurn) && verdictOf(sm.inTurn),
    `⑥ SafeFs refuses a blocked path at the pool door: 503 storage-blocked by the files route's sentence before the loop turned (${sf.ms.toFixed(1)} / ${sm.ms.toFixed(1)} ms; a move's dest too), no worker picked (${picked})`);
  const df = await timed(() => DFS.run('read', { dir: path.join(MP, 'design') }));
  ok(df.v?.ok === false && df.v.code === 'storage_blocked' && gateOf(df.inTurn) && !asked.some((p) => p.startsWith(MP)), `⑥ the design folder read answers storage_blocked before the loop turned (${df.ms.toFixed(1)} ms), never read (${df.v?.code})`);
  const tg = { _isPathShadowed: () => null, renderTaskMd() { asked.push('render'); return ''; }, contextDirOf: (t) => t.contextDir };   // lane task-group-context: _syncTaskMd asks the store for the 记笔记 row's folder
  const tt = await timed(() => { TaskGroupManager.prototype._syncTaskMd.call(tg, { id: 'T-1', contextDir: path.join(MP, 'ctx') }); TaskGroupManager.prototype._syncTaskMd.call(tg, { id: 'T-1', contextDir: path.join(MP, 'ctx') }); });
  ok(!asked.includes('render') && !fs.existsSync(path.join(MP, 'ctx', '.vibespace')) && warn.filter((l) => l.includes('TASK.md for T-1 skipped')).length === 1 && verdictOf(tt.inTurn),
    `⑥ the TASK.md writer skips a context folder under a blocked mount, said ONCE over two passes, before the loop turned (${tt.ms.toFixed(1)} ms)`);
  let dialled = 0;
  const cx = await timed(() => CTX.syncGroupCtxOverDevice({ hosts: { deviceBounded: () => { dialled++; return new Promise(() => {}); } }, hostId: 'h', group: { contextDir: path.join(MP, 'ctx') }, remoteDir: '/r' }));
  ok(cx.e?.code === 'storage-blocked' && dialled === 0 && verdictOf(cx.inTurn), `⑥ the group context sync is refused by name before the device is dialled, before the loop turned (${cx.ms.toFixed(1)} ms, dialled ${dialled})`);
  const cur = path.join(tmp6, 'cursors.json');
  const uw = await timed(() => { runUsageWalk({ projectsDir: PROJ, cursorFile: cur, home: tmp6 }); runUsageWalk({ projectsDir: PROJ, cursorFile: cur, home: tmp6 }); });
  ok(!uw.e && !asked.includes(PD) && warn.filter((l) => l.includes('[usage] walk skipped') && l.includes(PD)).length === 1 && verdictOf(uw.inTurn),
    `⑥ the usage walk skips a blocked project folder, said ONCE over two walks, before the loop turned (${uw.ms.toFixed(1)} ms${uw.e ? ', ' + uw.e.message : ''})`);
  // CONTROL: no manager registered (a worker / a process with no mounts) ⇒ the same asks reach the reader
  DOOR.register(null);
  asked.length = 0;
  sfs.call('listDir', { path: path.join(MP, 'Docs') }).catch(() => {});   // B-3b03: with no live worker the pool refuses by name — the PICK is what this control reads
  const dctl = await timed(() => DFS.run('read', { dir: path.join(MP, 'design') }));
  ok(picked === 1 && verdictOf(asked.includes(path.join(MP, 'design'))), '⑥ CONTROL: with no blocked root the SafeFs pick and the design readdir ARE reached (the legs above prove the door, not a dead reader)');
  ok(dctl.inTurn === false, '⑥ CONTROL: …and that read is still unanswered when the loop turns (the fake FUSE never resolves) — "before the loop turned" separates a door from a read');
  fsp.readdir = rd0; fs.readdirSync = rds0; console.warn = w0;
  fs.rmSync(tmp6, { recursive: true, force: true });
}
// ⑦ B-5ce7 (the owner's OneDrive 10-23/24: three wedged teardowns in a night, each reconnected in 2 min and wedged again in
// 10–30 min, 20+ hub stalls between): a WEDGE PARKS — no automatic reconnect, a For-you item with its Reconnect door — and the
// wedged chain is HELD (never reset to 0/0) while the listing is the same hung probe («list hung (still)») and the backend's
// answer is inconclusive. Every record here has its mount point under the scratch dir (customPath) and the rclone install road
// stubbed (round 2: a record without one resolves under HOME, and restore() may install rclone).
console.log('⑦ B-5ce7: a wedged mount is parked and said; the wedged chain is held while the listing is still hung');
const H = (backend, now = 0) => ({ ...W('ok', 'hung', backend, 0, now), list: { state: 'hung', ms: 80000, held: true } });
const heldSeq = (Lx) => run(Lx, [W('ok', 'hung', 'ok'), H('skipped'), H('skipped'), H('ok')]);
// ⑦'s mounts.js controls share ONE patched copy (one compile, not three): each edit is guarded by its own switch, set only
// while its control runs — A: the park removed (the backoff instead), B: the auto-remount's park check removed, K: the alive
// branch's resolve of the stopped-process notice removed, F: Reconnect's freshness rule removed. Each anchor must exist or its control is red by name.
const MUT7 = { A: ["        if (v.park) this._park(live, v, w);\n", "        if (v.park && !globalThis.__vsMut7.A) this._park(live, v, w);\n"],
  B: ["    if (m.parked) return;   // B-5ce7: a parked mount waits", "    if (m.parked && !globalThis.__vsMut7.B) return;   // B-5ce7: a parked mount waits"],
  K: ["      if (first || this._killedSaid?.has(m.id)) {", "      if (!globalThis.__vsMut7.K && (first || this._killedSaid?.has(m.id))) {"],
  F: ["    if (ok !== 'starting' && lv && lv.verdict === 'alive' && lv.seq > s0) return", "    if (ok !== 'starting' && (globalThis.__vsMut7.F ? (!lv || lv.verdict === 'alive') : (lv && lv.verdict === 'alive' && lv.seq > s0))) return"] };
let mut7mod = null;
const mut7 = () => {
  if (mut7mod) return mut7mod;
  let src = fs.readFileSync(MOUNTS, 'utf8');
  for (const [k, [a, b]] of Object.entries(MUT7)) { ok(verdictOf(src.includes(a)), `⑦ the control anchor ${k} exists in src/mounts.js`); src = src.replace(a, b); }
  globalThis.__vsMut7 = {};
  return (mut7mod = require(MC.write('src/mounts.js', src, 'mut7')));
};
const withMut7 = async (k, fn) => { mut7(); globalThis.__vsMut7 = { [k]: true }; try { return await fn(); } finally { globalThis.__vsMut7 = {}; } };
{
  const [a, b] = run(L, [W('ok', 'hung', 'ok'), W('ok', 'hung', 'ok')]);
  ok(a.park === false && gateOf(b.teardown) && b.park === true && b.words.key === 'wedged' && verdictOf(/Reconnect in For you/.test(L.wordsFor('wedged', 'en', { N: 2 }))), '⑦ the wedged teardown PARKS (no automatic reconnect) and its words name the doors (Connect, Reconnect in For you)', JSON.stringify(b));
  const [, dn] = run(L, [W('ok', 'hung', 'error'), W('ok', 'hung', 'error')]);
  ok(dn.verdict === 'wedged' && gateOf(dn.teardown) && dn.park === false && dn.words.key === 'wedgedRetry', '⑦ a wedge whose provider REFUSED (a dead token: the fresh lsf says 401) is torn down but NOT parked — the reconnect meets the refusal and says its re-authorize words (r1 #3)', JSON.stringify(dn));
  const CEIL = L.probeCell(cloud).unreachableCeilingMs;
  const others = [run(L, [W('hung', 'skipped', 'skipped'), W('hung', 'skipped', 'skipped')])[1], L.livenessStep(undefined, { daemonAlive: false }, cloud), run(L, [W('ok', 'hung', 'hung', 0, 1000), W('ok', 'hung', 'hung', 0, 1000 + CEIL)])[1]];
  ok(verdictOf(others.every((v) => v.teardown && v.park === false)), '⑦ …and only an answered wedge: the dead / died / unreachable-ceiling teardowns keep the reconnect with backoff', JSON.stringify(others.map((v) => [v.verdict, v.park])));
  const held = heldSeq(L);
  ok(held[1].state.wedged === 1 && held[1].strikes.n === 1 && held[1].strikes.N === 2 && held[2].state.wedged === 1 && !held[1].teardown && !held[2].teardown && gateOf(held[3].teardown) && verdictOf(held[3].park),
    '⑦ «list hung (still)»: an inconclusive (skipped) backend neither advances nor resets the chain — never 0/0; the next answered sweep parks', JSON.stringify(held.map((v) => [v.verdict, v.strikes, v.state.wedged])));
  const outage = run(L, [W('ok', 'hung', 'ok'), H('hung'), H('ok')]);
  ok(outage[1].state.wedged === 0 && !outage.some((v) => v.teardown), '⑦ an OUTAGE (the backend silent too) breaks the chain even under «hung (still)» — the storage, not the daemon (r1 #12)', JSON.stringify(outage.map((v) => [v.verdict, v.state.wedged])));
  const fresh = run(L, [W('ok', 'hung', 'ok'), W('ok', 'hung', 'skipped'), W('ok', 'hung', 'ok')]);
  ok(!fresh.some((v) => v.teardown) && fresh[1].state.wedged === 0, '⑦ a FRESH hung listing with no backend answer still breaks the chain (the ① law: no comparison between ⇒ never a teardown)');
  const line = L.verdictLine('od', held[1], H('skipped'));
  ok(gateOf(/list hung \(still\)/.test(line)) && verdictOf(/strike 1\/2$/.test(line)), '⑦ the journal line says «hung (still)» · strike 1/2 (it read 0/0)', line);
}
const scratchRec = (D, extra = {}) => ({ id: 'od', name: 'OneDrive', type: 'onedrive', desired: 'mounted', customPath: path.join(D, 'mnt', 'od'), ...extra });
const noInstall = (mm) => { mm.maybeUpgradePinnedRclone = () => {}; mm.rcloneAvailable = () => true; return mm; };
async function parkLegs(MM, tag, { upTo = null, race = false } = {}) {   // upTo 'noRemount': a control stops after the sweeps it tests
  const os = require('node:os');
  const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-mlive-park-' + tag + '-'));
  const out = {};
  const parks = [], unparks = [], removedSaid = [], calls = { mount: 0, backoff: 0, internal: 0 };
  const listing = { hung: true, check: false };
  const warn = console.warn; console.warn = () => {};
  const stubbed = (mm, mounted) => {
    noInstall(mm);
    mm.isMounted = (m) => m.id === 'od' && mounted.v; mm._daemonAlive = () => mounted.v; mm._daemonPids = () => []; mm._kindOf = () => 'mount';   // its daemon lives while it is mounted
    mm._probeMountpoint = async (mp, ms, verb) => verb === 'attr' ? { health: 'ok', ms: 4 } : (listing.hung ? { health: 'hung', ms } : { health: 'ok', ms: 900 });
    mm._probeBackendAccess = async () => 'ok'; mm._accessErrorFor = async () => null;
    // the connect: the REAL first check (_afterMounted: _probeLiveness → _livenessApply) when `listing.check`, else none (a
    // mount() that returns without one — the isMounted early return)
    mm._killMountDaemon = () => {}; mm._mountInner = async (id) => { calls.mount++; mounted.v = true; if (listing.check) { const r = mm._state.mounts.find((x) => x.id === id); return mm._afterMounted(r, mm.pathOf(r)); } return true; };
    const nb = mm._noteReconnectBackoff.bind(mm); mm._noteReconnectBackoff = (id) => { calls.backoff++; nb(id); };
    mm.onPark = (m, info) => parks.push([m.id, info]); mm.onUnpark = (m, why) => unparks.push([m.id, why]); mm.onRemoved = (m) => removedSaid.push(m.id);
    return mm;
  };
  try {
    const mounted = { v: true };
    const mm = stubbed(new MM({ dataDir: D, broadcast: () => {} }), mounted);
    mm._state.mounts.push(scratchRec(D));
    const rec = () => mm._state.mounts.find((x) => x.id === 'od');
    // the teardown's internal unmount (stubbed: no fusermount); `race` = the person's Unmount lands while it is awaited
    mm.unmount = async (id, o) => { if (o && o.internal) { calls.internal++; mounted.v = false; if (race) rec().desired = 'unmounted'; } };
    await mm._healthSweep(); await mm._healthSweep();
    out.parked = { parked: rec() && rec().parked ? { verdict: rec().parked.verdict, strikes: rec().parked.strikes } : null, internal: calls.internal, backoff: calls.backoff, parks: parks.map(([id, i]) => [id, i.verdict, i.strikes]), row: mm.list().find((x) => x.id === 'od'), blocked: !!mm.pathBlocked(mm.pathOf(rec())) };
    if (race) return out;
    // two minutes later (the owner's journal: the remount came 2 min after each teardown): the backoff and EVERY path block
    // (the park's own too) are lifted here — so only the park check can stop the sweep's dead-mount branch
    mm._reconnects?.clear(); try { mm.unblockPath(mm.pathOf(rec())); } catch { }
    await mm._healthSweep(); await mm._healthSweep();   // the sweep's dead-mount branch: no reconnect for a parked record
    out.noRemount = { mount: calls.mount, still: !!(rec() && rec().parked) };
    if (upTo === 'noRemount') return out;
    const p0 = parks.length;
    await mm.restore();
    out.restore = { mount: calls.mount, still: !!(rec() && rec().parked), error: mm.list().find((x) => x.id === 'od').error, refiled: parks.length === p0 + 1, blocked: !!mm.pathBlocked(mm.pathOf(rec())),
      provider: [parks[0] && parks[0][1].provider, parks[p0] && parks[p0][1].provider] };
    const mm2 = stubbed(new MM({ dataDir: D, broadcast: () => {} }), { v: false });   // a RESTART: the park is on disk
    const restored2 = mm2.restore();
    const blockedAtBoot = !!mm2.pathBlocked(mm2.pathOf(mm2._state.mounts.find((x) => x.id === 'od')));   // before ANY await of the boot
    await restored2;
    out.restart = { mount: calls.mount, still: !!(mm2._state.mounts.find((x) => x.id === 'od') || {}).parked, blockedAtBoot };
    delete mm.unmount;
    // the cure (主开发's must): a PARKED mount's folder is refused with ITS words naming its doors — never «try again in a moment»
    const DOOR = require(path.join(REPO, 'src/mount-door.js'));
    const mpOd = mm.pathOf(rec());
    DOOR.register(mm);
    try {
      const eP = DOOR.refusal(DOOR.blocked(mpOd + '/Docs/a.txt'));
      out.refusal = { message: eP.message, sentence: DOOR.sentenceFor(mpOd + '/Docs/a.txt'), parked: eP.parked, at: mm.parkedAt(mpOd + '/Docs') && mm.parkedAt(mpOd + '/Docs').id, sibling: mm.parkedAt(mpOd + '-other') };
      listing.hung = false; listing.check = true;   // the storage answers now, and the connect runs its REAL first check
      const RC = await mm.reconnect('od');   // the person's Reconnect (the For-you door's route)
      out.reconnect = { state: RC.state, ok: RC.ok, mount: calls.mount, parked: !!rec().parked, unparks: unparks.filter((u) => u[1] !== 'boot'), error: mm.list().find((x) => x.id === 'od').error, blocked: !!mm.pathBlocked(mm.pathOf(rec())) };
      out.refusalAfter = mm.parkedAt(mpOd);
    } finally { DOOR.register(null); }
    // the other two answers: a connect that ran NO check of its own, and one whose listing still hangs — both 'checking'
    const PVx = L.livenessStep({ wedged: 1, silent: 0, slow: 1, unreachableSince: 0 }, W('ok', 'hung', 'ok'), cloud);
    mm._park(rec(), PVx, {}); mounted.v = false; listing.check = false;
    out.noCheck = (await mm.reconnect('od')).state;
    mm._park(rec(), PVx, {}); mounted.v = false; listing.check = true; listing.hung = true;
    const RH = await mm.reconnect('od'); out.stillHung = RH.state;
    listing.check = false;
    const PV = L.livenessStep({ wedged: 1, silent: 0, slow: 1, unreachableSince: 0 }, W('ok', 'hung', 'ok'), cloud);
    mm._park(rec(), PV, {}); mounted.v = false;
    await mm.unmount('od');   // the person's Unmount (the real road: its mount point is under the scratch dir)
    out.unmount = { parked: !!rec().parked, desired: rec().desired, last: unparks[unparks.length - 1] };
    mm._park(rec(), PV, {});
    await mm.remove('od');
    out.remove = { gone: !mm._state.mounts.some((x) => x.id === 'od'), last: unparks[unparks.length - 1], removedSaid: removedSaid.slice() };
    // an EDIT that moves a parked record's folder: the park is still found at the path it was blocked at, and ends there
    mm._state.mounts.push(scratchRec(D, { id: 'mv', name: 'Moved' }));
    const mv = mm._state.mounts.find((x) => x.id === 'mv'); const oldMp = mm.pathOf(mv);
    mm._park(mv, PV, {}); mv.customPath = path.join(D, 'mnt', 'moved-elsewhere');
    out.moved = { found: (mm.parkedAt(oldMp) || {}).id, blocked: !!mm.pathBlocked(oldMp) };
    mm._unpark(mv, 'reconnect'); out.moved.after = !!mm.pathBlocked(oldMp);
  } catch (e) { out.err = String(e && e.stack || e); }
  finally { console.warn = warn; fs.rmSync(D, { recursive: true, force: true }); }
  return out;
}
{
  const P = await parkLegs(mod.MountManager, 'real');
  ok(!P.err && gateOf(P.parked.parked) && P.parked.parked.verdict === 'wedged' && P.parked.parked.strikes === 2 && P.parked.internal === 1 && P.parked.backoff === 0 && JSON.stringify(P.parked.parks) === JSON.stringify([['od', 'wedged', 2]]),
    '⑦ the manager: two wedged sweeps ⇒ ONE internal teardown, the record PARKED on disk (no reconnect backoff armed), the producer told once', JSON.stringify(P.parked || P.err));
  ok(gateOf(P.parked) && gateOf(P.parked.row) && gateOf(P.parked.row.parked) && P.parked.row.parked.verdict === 'wedged' && gateOf(/Reconnect in For you/.test(P.parked.row.error || '')) && verdictOf(P.parked.blocked), '⑦ list(): the row carries `parked` and says why, with its doors; its path is BLOCKED while parked (the hub\'s own doors answer — r1 #6)', JSON.stringify(P.parked && P.parked.row && { parked: P.parked.row.parked, error: P.parked.row.error, blocked: P.parked.blocked }));
  ok(gateOf(P.noRemount) && P.noRemount.mount === 0 && verdictOf(P.noRemount.still), '⑦ the sweep\'s dead-mount branch never reconnects a parked mount, even with every block lifted (the flap loop is gone)', JSON.stringify(P.noRemount));
  ok(gateOf(P.restore) && P.restore.mount === 0 && gateOf(P.restore.still) && gateOf(/Reconnect in For you/.test(P.restore.error || '')) && gateOf(P.restore.refiled) && verdictOf(P.restore.blocked), '⑦ restore() keeps it disconnected, says why, blocks its path and re-files its item (merged by its key — r1 #16)', JSON.stringify(P.restore));
  ok(gateOf(P.restore) && gateOf(P.restore.provider[0]) && P.restore.provider[0] === P.restore.provider[1], '⑦ the cure: the item names the SAME provider at the park and at every restore (kept on the record)', JSON.stringify(P.restore && P.restore.provider));
  { const DOOR = require(path.join(REPO, 'src/mount-door.js'));
    ok(gateOf(P.refusal) && P.refusal.message === DOOR.parkedSentence('OneDrive') && P.refusal.sentence === P.refusal.message && gateOf(/press Connect on its row, or Reconnect in For you/.test(P.refusal.message)) && P.refusal.message !== DOOR.SENTENCE && P.refusal.parked === 'od' && P.refusal.at === 'od' && P.refusal.sibling === null,
      '⑦ the cure (the must): a PARKED mount\'s folder is refused with ITS words — it is kept disconnected, press Connect on its row or Reconnect in For you — never «try again in a moment»; a sibling path is not it', JSON.stringify(P.refusal)); }
  ok(gateOf(P.restart) && P.restart.mount === 0 && gateOf(P.restart.still) && verdictOf(P.restart.blockedAtBoot), '⑦ a RESTART keeps the park (persisted on the record; the new manager\'s restore connects nothing) and its path is blocked BEFORE any connect of the boot is awaited (cure r2)', JSON.stringify(P.restart));
  ok(gateOf(P.reconnect) && P.reconnect.mount === 1 && !P.reconnect.parked && JSON.stringify(P.reconnect.unparks) === JSON.stringify([['od', 'reconnect']]) && !P.reconnect.error && !P.reconnect.blocked && P.refusalAfter === null, '⑦ the person\'s Reconnect (any mount()) ends the park — the producer told, the words cleared, the path unblocked, no parked refusal left', JSON.stringify(P.reconnect));
  { const FA = require(path.join(REPO, 'src/foryou-actions.js'));
    ok(gateOf(P.reconnect) && P.reconnect.ok === true && P.reconnect.state === 'pass' && FA.ROW_OF['mount-reconnect'].checkSaid.done === 'Reconnected — the storage answers again',
      '⑦ the cure: Reconnect on a parked mount whose storage answers — through the REAL first check (_afterMounted) — answers «pass»: the client says «Reconnected — the storage answers again»', JSON.stringify({ state: P.reconnect && P.reconnect.state }));
    ok(P.noCheck === 'checking' && P.stillHung === 'checking', '⑦ …and only then: a connect that ran no check of its own, or whose listing still hangs, answers «checking» — never the success words (cure r2: a verdict from before the press is not this connect\'s answer)', JSON.stringify({ noCheck: P.noCheck, stillHung: P.stillHung })); }
  ok(gateOf(P.moved) && P.moved.found === 'mv' && gateOf(P.moved.blocked) && P.moved.after === false, '⑦ an edit that moves a parked record\'s folder: the park is still found at the path it was blocked at, and its end unblocks THAT path (cure r2)', JSON.stringify(P.moved));
  ok(gateOf(P.unmount) && !P.unmount.parked && P.unmount.desired === 'unmounted' && JSON.stringify(P.unmount.last) === JSON.stringify(['od', 'unmounted']), '⑦ the person\'s Unmount ends the park', JSON.stringify(P.unmount));
  ok(gateOf(P.remove) && gateOf(P.remove.gone) && JSON.stringify(P.remove.last) === JSON.stringify(['od', 'removed']) && JSON.stringify(P.remove.removedSaid) === JSON.stringify(['od']), '⑦ removing the record ends the park and tells the producer (every item of it resolves)', JSON.stringify(P.remove));
  const R = await parkLegs(mod.MountManager, 'race', { race: true });
  ok(!R.err && gateOf(R.parked) && !R.parked.parked && R.parked.parks.length === 0 && R.parked.backoff === 0, '⑦ the person\'s Unmount landing while the teardown was awaited wins: no park, no item, no backoff (r1 #10)', JSON.stringify(R.parked || R.err));
}
{ // the producer over the REAL For-you store: ONE item per mount (its itemKey), origin server, its door; resolved at the end
  const os = require('node:os');
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const MP = require(path.join(REPO, 'src/server/mount-for-you.js'));
  const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-mlive-fy-'));
  const u = new UserTodoManager({ dataDir: D, onChange: () => {}, expirySweepMs: 0 });
  try {
    const pk = MP.create({ getUserTodos: () => u });
    const m = { id: 'od', name: 'Work OneDrive' };
    pk.park(m, { strikes: 2, provider: 'OneDrive' }); pk.park({ ...m, name: 'Work OneDrive (renamed)' }, { strikes: 3, provider: 'OneDrive' });
    const open = u.forSession([MP.ITEM_KEY]);
    const it = open[0] || {};
    ok(open.length === 1 && it.origin === 'server' && it.kind === 'action' && gateOf(it.action) && it.action.type === 'mount-reconnect' && it.action.mountId === 'od'
      && it.text === 'Storage Work OneDrive (renamed) is kept disconnected: its listing hung 3 times in a row while OneDrive answered' && gateOf(it.i18n) && it.i18n.text.key === MP.TEXT,
      '⑦ the producer: a re-park with OTHER words (a renamed mount, another count) updates the ONE open item — its itemKey (r1 #18) — origin server, action mount-reconnect {mountId}', JSON.stringify(open.map((x) => ({ origin: x.origin, kind: x.kind, action: x.action, text: x.text }))));
    const FA = require(path.join(REPO, 'src/foryou-actions.js'));
    const row = FA.ROW_OF['mount-reconnect'] || {};
    ok(row.checkRoute === '/api/mounts/{mountId}/reconnect' && row.checkLabel === 'Reconnect' && gateOf(FA.CHECK_AGAIN_TYPES.includes('mount-reconnect')) && FA.ACTION_IDENTITY['mount-reconnect'] === 'mountId', '⑦ its registry row declares the door (the route with {mountId}, the verb Reconnect) and the merge identity');
    const n = pk.unpark(m, 'reconnect');
    ok(n === 1 && u.forSession([MP.ITEM_KEY]).length === 0 && u.get(it.id).status === 'done', '⑦ the park ends ⇒ the item resolves itself');
    const noLabel = MP.itemOf({ id: 'od', name: 'X', type: 'onedrive' }, { strikes: 2 });
    ok(noLabel.i18n.text.key === MP.TEXT_NOPROV && !('provider' in noLabel.i18n.text.params) && !/onedrive/.test(noLabel.text), '⑦ the cure: no provider label ⇒ a WHOLE sentence of its own (translated as one) — never a protocol value or an English filler inside a zh / ja one', JSON.stringify(noLabel.i18n.text));
    pk.park(m, { strikes: 2, provider: 'OneDrive' }); pk.killed(m); pk.stranded(m, { dest: '/x/s', path: '/x' });
    const nR = pk.removed(m);
    ok(nR === 3 && u.forSession([MP.ITEM_KEY]).length === 0, '⑦ the record removed ⇒ every open item of it resolves (park, stopped process, stranded files — the cap counts live records)', JSON.stringify({ nR }));
    const capOf = (count) => { const D2 = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-mlive-cap-')); const u2 = new UserTodoManager({ dataDir: D2, onChange: () => {}, expirySweepMs: 0 }); try { const f2 = MP.create({ getUserTodos: () => u2, mountCount: () => count }); let filed = 0; for (let i = 0; i < 25; i++) { try { if (f2.park({ id: 'm' + i, name: 'S' + i }, { strikes: 2, provider: 'OneDrive' })) filed++; } catch { } } return filed; } finally { try { u2.stop(); } catch { } fs.rmSync(D2, { recursive: true, force: true }); } };
    const c25 = capOf(25), c0 = capOf(0);
    ok(c25 === 25 && c0 === 20, '⑦ the cure: the key\'s open cap is sized by the number of mounts (25 parked mounts ⇒ 25 items); with no count it is the store\'s 20 (the 21st refused as full — the control)', JSON.stringify({ c25, c0 }));
  } finally { try { u.stop(); } catch { } fs.rmSync(D, { recursive: true, force: true }); }
}
async function killedLegs(MM, tag) {   // the merged B-f230: a hung process stopped ⇒ the person knows it until the mount answers again
  const os = require('node:os');
  const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-mlive-kill-' + tag + '-'));
  const said = [], warn = console.warn; console.warn = () => {};
  const out = {};
  try {
    const mounted = { v: true }, attr = { v: 'hung' };
    const mm = noInstall(new MM({ dataDir: D, broadcast: () => {} }));
    mm._state.mounts.push(scratchRec(D));
    mm.isMounted = (m) => m.id === 'od' && mounted.v; mm._daemonAlive = () => mounted.v; mm._daemonPids = () => []; mm._kindOf = () => 'mount'; mm._cpuTicks = () => 0;
    mm._probeMountpoint = async (mp, ms, verb) => verb === 'attr' ? (attr.v === 'hung' ? { health: 'hung', ms } : { health: 'ok', ms: 4 }) : { health: 'ok', ms: 900 };
    mm._probeBackendAccess = async () => 'ok'; mm._killMountDaemon = () => {};
    mm._mountInner = async () => { mounted.v = true; return true; };
    mm.unmount = async (id, o) => { if (o && o.internal) mounted.v = false; };
    Object.assign(mm, { onKilled: (m) => said.push(['killed', m.id]), onAnswered: (m) => said.push(['answered', m.id]), onStranded: (m, i) => said.push(['stranded', m.id, i.dest, i.path]) });
    await mm._healthSweep(); await mm._healthSweep();   // the root check silent twice, no CPU progress ⇒ dead: stopped
    out.killed = said.slice();
    attr.v = 'ok'; mm._reconnects?.clear(); try { mm.unblockPath(mm.pathOf(mm._get('od'))); } catch { }
    await mm._healthSweep();   // the sweep reconnects it (not parked: a stopped process is no wedge)
    await mm._healthSweep();   // …and it answers
    out.answered = said.slice();
    mm._noteStranded(mm._get('od'), '/x/od.stranded-20261117T2340');
    out.stranded = said[said.length - 1];
  } catch (e) { out.err = String(e && e.stack || e); }
  finally { console.warn = warn; fs.rmSync(D, { recursive: true, force: true }); }
  return out;
}
{
  const K = await killedLegs(mod.MountManager, 'real');
  ok(!K.err && JSON.stringify(K.killed) === JSON.stringify([['killed', 'od']]), '⑦ (B-f230) its hung process stopped (the dead teardown) ⇒ ONE stopped-process notice', JSON.stringify(K.killed || K.err));
  ok(!K.err && JSON.stringify(K.answered) === JSON.stringify([['killed', 'od'], ['answered', 'od']]), '⑦ (B-f230) …reconnected by itself (no park), and the notice resolves at its next answer', JSON.stringify(K.answered || K.err));
  ok(!K.err && gateOf(K.stranded) && K.stranded[0] === 'stranded' && K.stranded[2] === '/x/od.stranded-20261117T2340' && typeof K.stranded[3] === 'string' && K.stranded[3].length > 0, '⑦ (B-f230) stranded files moved aside ⇒ the producer told where (kept in For-you, not a toast only)', JSON.stringify(K.stranded || K.err));
  const msrc = fs.readFileSync(MOUNTS, 'utf8');
  ok(gateOf(/console\.warn\(`\[mounts\] \$\{r\} daemon on \$\{mp\} \(never mounted\) — killed`\);\n\s*await this\._killMountDaemon\(mp\);\n\s*this\._noteReconnectBackoff\(id\);\n\s*this\._saidKilled\(m\);/.test(msrc))
    && gateOf(/if \(v\.verdict === 'dead' \|\| v\.verdict === 'unreachable'\) this\._saidKilled\(live\);/.test(msrc)) && verdictOf(/const dest = await this\._ensureMountpointDir\(mp, \{ quarantine: true \}\)\.catch\(\(e\) => \{ this\._strandedRefused\(m, e\); this\._errors\.set\(id, this\._sayE\(id, e\)\); this\._notify\(\); throw e; \}\);[^\n]*\n\s*if \(dest\) this\._noteStranded\(m, dest\);/.test(msrc)),
    '⑦ (B-f230) every road that stops a mount\'s process says it: the STARTING hung / ceiling kill, the dead and the unreachable-ceiling teardowns; a CephFS mount\'s stranded files too (r1 #4, #19)');
  const os = require('node:os');
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const MP = require(path.join(REPO, 'src/server/mount-for-you.js'));
  const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-mlive-fyk-'));
  const u = new UserTodoManager({ dataDir: D, onChange: () => {}, expirySweepMs: 0 });
  try {
    const fy = MP.create({ getUserTodos: () => u });
    const m = { id: 'od', name: 'Work OneDrive' };
    fy.killed(m); fy.killed(m); fy.stranded(m, { dest: '/x/od.stranded-1', path: '/x/od' }); fy.stranded(m, { dest: '/x/od.stranded-2', path: '/x/od' });
    const open = u.forSession([MP.ITEM_KEY]);
    const k = open.filter((i) => i.facts && i.facts.why === 'killed'), st = open.filter((i) => i.facts && i.facts.why === 'stranded');
    ok(k.length === 1 && k[0].kind === 'notice' && k[0].origin === 'server' && gateOf(/^Storage Work OneDrive stopped answering and was disconnected/.test(k[0].text)) && st.length === 1 && st[0].text === 'Files written into /x/od while storage Work OneDrive was disconnected were moved to /x/od.stranded-2 — nothing was deleted',
      '⑦ (B-f230) the producer: ONE stopped-process notice per mount; ONE stranded notice per mount, naming the latest folder (r1 #15: the key\'s open items are capped)', JSON.stringify(open.map((i) => [i.kind, i.text])));
    ok(fy.answered(m) === 1 && u.forSession([MP.ITEM_KEY]).filter((i) => i.facts && i.facts.why === 'killed').length === 0 && verdictOf(u.forSession([MP.ITEM_KEY]).some((i) => i.facts && i.facts.why === 'stranded')), '⑦ (B-f230) the answer resolves the stopped-process notice only (the stranded one is the person\'s)');
  } finally { try { u.stop(); } catch { } fs.rmSync(D, { recursive: true, force: true }); }
  const KC = await withMut7('K', () => killedLegs(mut7().MountManager, 'noanswer'));
  ok(gateOf(KC) && JSON.stringify(KC.answered) === JSON.stringify([['killed', 'od']]), '⑦ CONTROL: the alive branch\'s resolve removed ⇒ the stopped-process notice outlives the answer (red)', JSON.stringify(KC && (KC.answered || KC.err)));
}
{ // the door on the page and the wiring: the route's {mountId} filled from the item, the verb named by the row, its words in zh / ja
  const dict = (f) => { const txt = fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8'); return new Proxy({}, { get: (_, k) => txt.includes('\n  ' + JSON.stringify(String(k)) + ': "') }); };
  const Z = dict('i18n-zh.js'), J = dict('i18n-ja.js');
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const MP = require(path.join(REPO, 'src/server/mount-for-you.js'));
  const row = FA.ROW_OF['mount-reconnect'] || { checkSaid: {} };
  const keys = [row.checkAgain, row.checkLabel, ...['done', 'started', 'none', 'failed'].map((k) => row.checkSaid[k]), MP.TEXT, MP.TEXT_NOPROV, MP.DETAIL, MP.KILLED, MP.STRANDED, MP.STRANDED_MAYBE, require(path.join(REPO, 'src/mount-door.js')).PARKED];
  const miss = keys.filter((k) => typeof k !== 'string' || !Z[k] || !J[k]);
  ok(miss.length === 0, '⑦ every word of the mounts\' items and the door is in the zh and ja dictionaries', miss.join(' | '));
  const UTA = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf8');
  const FILL = "const route = checkRow.checkRoute.replace(/\\{(\\w+)\\}/g, (_, k) => encodeURIComponent(String((rec.action && rec.action[k]) || '')));";
  ok(gateOf(UTA.includes(FILL)) && verdictOf(/const r = await fetchJson\(route, \{ method: 'POST'/.test(UTA)), '⑦ the client posts the row\'s route with the item\'s own field filled in, encoded (a row for one mount among many)');
  const IW = fs.readFileSync(path.join(REPO, 'src/lib/inbox-window.js'), 'utf8'), IWL = fs.readFileSync(path.join(REPO, 'src/lib/inbox-window-layout.js'), 'utf8');
  ok(gateOf(IW.includes("FY_ROW[ty].checkLabel ? t(FY_ROW[ty].checkLabel) : t('Check again')")) && verdictOf(IWL.includes("i.action.type === 'mount-reconnect'")), '⑦ the For-you window draws the parked item\'s verb (Reconnect, the row\'s label) in the check-again family');
  const WIRE = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(gateOf(/Object\.assign\(mounts, \{ onPark: \(m, info\) => fy\.park\(m, info\), onUnpark: \(m\) => fy\.unpark\(m\), onKilled: \(m, info\) => fy\.killed\(m, info\), onAnswered: \(m\) => fy\.answered\(m\), onStranded: \(m, info\) => fy\.stranded\(m, info\), onRemoved: \(m\) => fy\.removed\(m\), onClientSwaps: \(g, memos\) => fy\.clientSwaps\(g, memos\) \}\);/.test(WIRE))
    && gateOf(/app\.post\('\/api\/mounts\/:id\/reconnect', async \(req, res\) => \{\n  try \{ res\.json\(await mounts\.reconnect\(req\.params\.id\)\); \}/.test(WIRE)) && gateOf(/mountCount: \(\) => mounts\._state\.mounts\.length/.test(WIRE))
    && verdictOf(/const pk = mounts\.parkedAt\?\.\(p\);\n\s*if \(pk\) return res\.status\(503\)\.json\(\{ error: require\('\.\.\/mount-door\.js'\)\.parkedSentence\(pk\.name\)/.test(fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8'))),
    '⑦ the wiring: the manager\'s hooks are the producer\'s (mounts-plugins-wiring); the Reconnect route is MountManager.reconnect; the files route answers a parked folder with its words (r1 #17)');
  // THE DOOR CENSUS (cure r2): no reader spells the blocked sentence itself — every one asks DOOR.sentenceFor / refusal, so a
  // parked mount's words reach it; the 503 catches keep the door's own words
  const { execFileSync } = require('node:child_process');
  const srcFiles = execFileSync('git', ['ls-files', 'src'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js'));
  const SENT = require(path.join(REPO, 'src/mount-door.js')).SENTENCE;
  const spellsIt = (t) => t.includes('DOOR.SENTENCE') || t.includes(SENT);   // the name or the words themselves (the cure's readers: files.js wrote the words)
  const spells = srcFiles.filter((f) => f !== 'src/mount-door.js' && spellsIt(fs.readFileSync(path.join(REPO, f), 'utf8')));
  const DOORS = ['src/design-fs.js', 'src/server/agent-tool-generators.js', 'src/server/root-facts.js', 'src/server/frame-host.js', 'src/server/published-pages.js', 'src/server/vault-run-door.js', 'src/webdav.js'];   // B-ba47 shape H: the boot's own read of the hub's tree (root-facts.js) asks the door too; every conversation's root keeps the ORCH's own reader and its door (B-1425)
  const asks = DOORS.filter((f) => fs.readFileSync(path.join(REPO, f), 'utf8').includes('DOOR.sentenceFor('));
  const FH = fs.readFileSync(path.join(REPO, 'src/server/frame-host.js'), 'utf8'), FR = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
  const keeps = FH.includes("e.code === 'storage-blocked' && e.message ? e.message : 'Storage not responding — try again in a moment.'") && (FR.match(/e\.code === 'storage-blocked' && e\.message \? e\.message : 'Storage not responding — try again in a moment\.'/g) || []).length === 2;
  const filesAsks = FR.includes("return res.status(503).json({ error: require('../mount-door.js').sentenceFor(p) });");
  ok(spells.length === 0 && asks.length === DOORS.length && gateOf(keeps) && verdictOf(filesAsks), `⑦ the door census: no src file but mount-door.js spells the blocked sentence, by name or by its words (${spells.join(', ') || 'none'}); the ${DOORS.length} doors ask DOOR.sentenceFor, the files route's 503 sentenceFor; the 503 catches of frame-host and files keep the door's own words`, JSON.stringify({ spells, asks, filesAsks }));
  ok(verdictOf(spellsIt(FR.replace("require('../mount-door.js').sentenceFor(p)", JSON.stringify(SENT).replace(/"/g, "'")))), '⑦ CONTROL: the files route writing the words itself again (the release\'s 503) ⇒ the census names it (red)');
}
{ // ⑦ controls
  const PA = await withMut7('A', () => parkLegs(mut7().MountManager, 'nopark', { upTo: 'noRemount' }));
  ok(gateOf(PA.parked) && !PA.parked.parked && PA.parked.backoff === 1 && gateOf(PA.noRemount) && PA.noRemount.mount === 1, '⑦ CONTROL: the park removed ⇒ the wedged mount is reconnected by the sweep (the flap loop — red)', JSON.stringify({ parked: PA.parked && PA.parked.parked, backoff: PA.parked && PA.parked.backoff, noRemount: PA.noRemount, err: PA.err }));
  const PB = await withMut7('B', () => parkLegs(mut7().MountManager, 'remounts', { upTo: 'noRemount' }));
  ok(gateOf(PB.noRemount) && PB.noRemount.mount === 1 && !PB.noRemount.still, '⑦ CONTROL: the auto-remount\'s park check removed ⇒ the sweep reconnects it (red)', JSON.stringify(PB.noRemount || PB.err));
  const PF = await withMut7('F', () => parkLegs(mut7().MountManager, 'nofresh'));
  ok(PF.noCheck === 'pass', '⑦ CONTROL: the freshness rule removed (no verdict ⇒ pass, round 1\'s) ⇒ a connect that ran no check says the success words (red)', JSON.stringify({ noCheck: PF.noCheck, err: PF.err }));
  const lsrc = fs.readFileSync(path.join(REPO, 'src/mount-liveness.js'), 'utf8');
  const fromC = "  const still = !!(w && w.list && w.list.state === 'hung' && w.list.held);";
  ok(verdictOf(lsrc.includes(fromC)), '⑦ the held-chain anchor exists');
  const LC = require(MC.write('src/mount-liveness.js', editAnchor(lsrc, fromC, '  const still = false;', "src/mount-liveness.js"), 'noheld'));
  const hc = heldSeq(LC);
  ok(hc[1].state.wedged === 0 && hc[1].strikes.n === 0 && !hc[3].teardown, '⑦ CONTROL: the held chain removed ⇒ «hung (still)» resets to 0/0 and the wedge never parks (red)', JSON.stringify(hc.map((v) => [v.verdict, v.strikes])));
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
