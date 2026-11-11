#!/usr/bin/env node
// MEMBERSHIP IS AN INDEX (lane groups-sweep-on-change commit 2). src/task-groups.js groupsForSession answers from an index of
// what membership reads; the walk it replaced is kept as `_groupsForSessionWalk`, and every leg holds the index to it —
// the same records, in the same order, over the REAL TaskGroupManager of this tree on its own data dir and folder trees:
//   ① EQUALITY: 40 seeded stores (bound / folder / spawned-into / archived / nested and symlinked cwds / missing folders /
//     a file row / createdAt ties) × every call shape the callers use ⇒ ≡ the walk, first ask and the cached one;
//   ② EVERY WRITER: create, update (title / sessions / ctx / archived), remove, bind, unbindKeys, addProgress, clearProgress,
//     importBundle (an equal copy replaces a record — the answer is the NEW object), importFromFile, migrateContextRows,
//     a fresh load ⇒ ≡ the walk after each; the writers that move nothing membership reads (a title, a progress line, a
//     clear) KEEP the index (no rebuild), the rest rebuild it;
//   ③ THE 4 s BOUND: a discover folder created on disk is seen within _res's own bound, at the same ask as the walk (a
//     virtual clock); a cleared _res cache is seen at once;
//   ④ THE RESULT MAP'S BOUND: 5 000 distinct asks between two rebuilds ⇒ never more than MEMBER_RESULTS_MAX entries;
//   ⑤ THE DOUBTS, each the walk's answer, said nowhere, never a throw: a stat that throws (EACCES), a symlink loop as a cwd,
//     a cwd that no longer exists, a record whose createdAt is not a number, the index itself throwing;
//   ⑥ THE BENCH at the owner's shape (7 Task Groups of ~200 conversations, 6 discover rows, 36 live): µs per ask.
// Red controls: PATCHES THIS SUITE CARRIES on this tree's src/task-groups.js (master has no index to be red on) — the
// signature check out (a rev change keeps a stale index), the identity check out, the 4 s bound out, the cap out, the
// doubt's fallback out — each RED at its own leg; an anchor no longer in the file is a RED, never a skip.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-member-index-'));
const locked = [];
process.on('exit', () => { for (const d of locked) { try { fs.chmodSync(d, 0o755); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + String(detail).slice(0, 700)}`); } return !!c; }

// a virtual clock for the 4 s bound (the store's caches read Date.now)
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;

let mn = 0;
function manager(T, dataDir = null) {
  const { TaskGroupManager, MEMBER_RESULTS_MAX } = createRequire(path.join(T, 'package.json'))('./src/task-groups.js');
  const dir = dataDir || path.join(ROOT, 'd' + (++mn));
  fs.mkdirSync(dir, { recursive: true });
  const tg = new TaskGroupManager({ dataDir: dir, homeDir: path.join(ROOT, 'home') });
  tg._syncTaskMd = () => { };   // the mirror is not membership (and would write into the seeded folders)
  return { tg, dir, MAX: MEMBER_RESULTS_MAX };
}
const ids = (a) => (Array.isArray(a) ? a.map((t) => t && t.id).join(',') : `not a list: ${a}`);
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((t, i) => t === b[i]);
// every call shape the callers use (src/task-groups.js groupsForSession's caller list): a key + cwd (prompt context, the
// roster), + the spawned-into ids (spawn, the roster before the bind lands), a key alone (msg endpoints), a cwd alone,
// a given realpath (the remote group-ctx sync)
const SHAPES = (s) => [
  { sessionKey: s.key, cwd: s.cwd },
  { sessionKey: s.key, cwd: s.cwd, initialGroupId: s.spawned, initialGroupIds: s.spawnedList },
  { sessionKey: s.key },
  { cwd: s.cwd },
  { sessionKey: s.key, cwd: s.cwd, realCwd: s.real },
];
function check(tg, asks) {
  const bad = [];
  for (const s of asks) for (const a of SHAPES(s)) {
    const i1 = tg.groupsForSession(a), i2 = tg.groupsForSession(a), w = tg._groupsForSessionWalk(a);
    if (!same(i1, w) || !same(i2, w)) bad.push(`${JSON.stringify(a)}: index [${ids(i1)}] / again [${ids(i2)}] / walk [${ids(w)}]`);
  }
  return bad;
}

// ── a seeded store: its own folder tree, groups with every kind of row, sessions to ask ─────────────────────────────────
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seeded(T, seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
  const base = path.join(ROOT, 'tree' + seed + '-' + (++mn));   // its own tree per call (a control re-runs the store)
  const dirs = ['a', 'a/sub', 'a/sub/deep', 'b', 'c', 'c/x'].map((d) => path.join(base, d));
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
  fs.symlinkSync(path.join(base, 'b'), path.join(base, 'link-b'));   // a cwd under it resolves into b
  fs.writeFileSync(path.join(base, 'file.txt'), 'x');
  const rowsOf = [
    () => ({ path: pick(dirs), tags: ['discover'] }),
    () => ({ path: path.join(base, 'link-b'), tags: ['discover'] }),
    () => ({ path: path.join(base, 'missing'), tags: ['discover'] }),
    () => ({ path: path.join(base, 'file.txt'), tags: ['discover'] }),
    () => ({ path: pick(dirs), tags: ['notes'] }),
  ];
  const keys = Array.from({ length: 20 }, (_, i) => `claude:${seed}-k${i}`);
  const { tg } = manager(T);
  const n = 2 + Math.floor(r() * 5), tasks = {};
  for (let i = 0; i < n; i++) {
    const id = `T-s${seed}g${i}`;
    tasks[id] = { id, title: 'group ' + i, kind: 'task', createdAt: 1000 + Math.floor(r() * 3) * 10, archived: r() < 0.2, sessions: keys.filter(() => r() < 0.25), ctx: Array.from({ length: Math.floor(r() * 4) }, () => pick(rowsOf)()), progress: [] };
  }
  tg._state.tasks = tasks; tg._save();
  const cwds = [...dirs, path.join(base, 'a/sub/deep/z'), path.join(base, 'link-b/inner'), path.join(base, 'missing/q'), '/opt/elsewhere', undefined];
  const gids = Object.keys(tasks);
  const asks = Array.from({ length: 12 }, () => { const cwd = pick(cwds); return { key: r() < 0.85 ? pick([...keys, 'claude:unbound-1', 'claude:unbound-2']) : undefined, cwd, spawned: r() < 0.3 ? pick([...gids, 'T-nope']) : undefined, spawnedList: r() < 0.3 ? [pick(gids), pick(gids)] : undefined, real: r() < 0.3 && cwd ? cwd : undefined }; });
  return { tg, asks, base, dirs, keys, gids };
}

// ── the legs: (T) → { ok, detail } ────────────────────────────────────────────────────────────────────────────────────
const LEGS = {
  async equality(T) {
    const bad = []; let n = 0;
    for (let seed = 1; seed <= 40; seed++) { const s = seeded(T, seed); const b = check(s.tg, s.asks); n += s.asks.length * 5; bad.push(...b.map((x) => `store ${seed}: ${x}`)); }
    return { ok: bad.length === 0, detail: `40 seeded stores × 12 sessions × 5 call shapes (${n} asks, each asked twice): ${bad.length} differ from the walk${bad.length ? ' — ' + bad.slice(0, 2).join(' | ') : ''}` };
  },
  async writers(T) {
    const s = seeded(T, 101), tg = s.tg, out = [];
    const step = (name, fn, { keeps }) => {
      const b0 = tg.memberIndexStats().builds; check(tg, s.asks);   // the index is built and asked before the write
      const b1 = tg.memberIndexStats().builds;
      fn();
      const bad = check(tg, s.asks);
      const rebuilt = tg.memberIndexStats().builds > b1;
      const shapeOk = keeps ? !rebuilt : rebuilt;
      out.push({ name, ok: bad.length === 0 && shapeOk, said: `${name}: ${bad.length ? 'DIFFERS ' + bad[0] : '≡ the walk'}, ${rebuilt ? 'rebuilt' : 'kept'}${shapeOk ? '' : ` (expected ${keeps ? 'kept' : 'rebuilt'})`}` });
      void b0;
    };
    const g0 = s.gids[0], g1 = s.gids[1];
    step('update(title)', () => tg.update(g0, { title: 'renamed' }), { keeps: true });
    step('addProgress ×50', () => { for (let i = 0; i < 50; i++) tg.addProgress(g0, { note: 'line ' + i, session: s.keys[0] }); }, { keeps: true });
    step('clearProgress', () => { const p = (tg._state.tasks[g0].progress || [])[0]; tg.clearProgress(g0, [p.id]); }, { keeps: true });
    step('bind', () => tg.bind(g1, 'claude:unbound-1'), { keeps: false });
    step('unbindKeys', () => tg.unbindKeys([s.keys[3], 'claude:unbound-1']), { keeps: false });
    step('update(sessions)', () => tg.update(g0, { sessions: [s.keys[5], s.keys[6]] }), { keeps: false });
    step('update(ctx)', () => tg.update(g1, { ctx: [{ path: s.dirs[0], tags: ['discover'] }] }), { keeps: false });
    step('update(archived)', () => tg.update(g0, { archived: true }), { keeps: false });
    step('create', () => tg.create({ title: 'new one', sessions: [s.keys[7]], ctx: [{ path: s.dirs[3], tags: ['discover'] }] }), { keeps: false });
    step('remove', () => tg.remove(g1), { keeps: false });
    const copies = () => ({ tasks: Object.values(tg._state.tasks).map((t) => JSON.parse(JSON.stringify(t))) });
    step('importBundle', () => tg.importBundle(copies()), { keeps: false });
    // the bundle's own records again: equal copies (the same content the signature reads) replace every record — only
    // the records' identity moved, and the answer must be the store's NEW objects
    step('importBundle of equal copies', () => tg.importBundle(copies()), { keeps: false });
    const file = path.join(ROOT, 'imp101.md');
    fs.writeFileSync(file, '---\nvibespace_task: T-imported101\ntitle: Imported\nkind: task\n---\n\n## Objective\n\nfrom a file\n');
    step('importFromFile', () => tg.importFromFile(file), { keeps: false });
    step('migrateContextRows', () => { const t = tg._state.tasks[s.gids[2]] || Object.values(tg._state.tasks)[0]; delete t.ctx; tg._legacy.set(t.id, { folders: [s.dirs[4]] }); tg.migrateContextRows(); }, { keeps: false });
    // a fresh load of the same file: its own index, ≡ its own walk
    const fresh = manager(T, tg._file ? path.dirname(tg._file) : null).tg;
    const badLoad = check(fresh, s.asks);
    out.push({ name: 'load', ok: badLoad.length === 0, said: `a fresh load: ${badLoad.length ? 'DIFFERS ' + badLoad[0] : '≡ the walk'}` });
    return { ok: out.every((o) => o.ok), detail: out.map((o) => o.said).join(' · ') };
  },
  async 'folder-bound'(T) {
    skew = 0;
    const { tg } = manager(T);
    const base = path.join(ROOT, 'fb' + (++mn)), later = path.join(base, 'later');
    fs.mkdirSync(base, { recursive: true });
    // a RELATIVE discover row resolves against the table's first folder by what is on disk (task-context resolveRows): while
    // «later» does not exist the row points nowhere; once it is made, the row is a folder — at _res's 4 s bound
    tg._state.tasks = { 'T-fb': { id: 'T-fb', title: 'fb', kind: 'task', createdAt: 1, sessions: [], ctx: [{ path: base, tags: ['notes'] }, { path: 'later', tags: ['discover'] }], progress: [] } }; tg._save();
    const ask = { sessionKey: 'claude:fb', cwd: path.join(later, 'work') };
    const at = (label) => { const i = tg.groupsForSession(ask), w = tg._groupsForSessionWalk(ask); return { label, i: ids(i), w: ids(w), same: same(i, w) }; };
    const s0 = at('before');
    fs.mkdirSync(later);
    skew = 1500; const s1 = at('+1.5 s');
    skew = 4100; const s2 = at('+4.1 s');
    // a cleared _res cache is read at once (test-seen-marks clears it to make every turn read)
    fs.rmSync(later, { recursive: true });
    tg._resCache && tg._resCache.clear();
    const s3 = at('removed, cache cleared');
    skew = 0;
    const steps = [s0, s1, s2, s3];
    const okv = steps.every((x) => x.same) && s0.i === '' && s1.i === '' && s2.i === 'T-fb' && s3.i === '';
    return { ok: okv, detail: steps.map((x) => `${x.label}: index [${x.i}] walk [${x.w}]`).join(' · ') + ' (a folder created on disk is seen within the 4 s bound, at the same ask as the walk)' };
  },
  async 'result-bound'(T) {
    const s = seeded(T, 202), tg = s.tg;
    let maxSeen = 0, bad = 0;
    const max = tg.memberIndexStats().max;
    for (let i = 0; i < 5000; i++) {
      const a = { sessionKey: `claude:many-${i}`, cwd: s.dirs[i % s.dirs.length] };
      const got = tg.groupsForSession(a);
      const n = tg.memberIndexStats().results; if (n > maxSeen) maxSeen = n;
      if (i % 50 === 0 && !same(got, tg._groupsForSessionWalk(a))) bad++;
    }
    const st = tg.memberIndexStats();
    return { ok: maxSeen <= max && bad === 0 && st.cleared >= 2, detail: `5 000 distinct asks between two rebuilds: the result map never held more than ${maxSeen} (MEMBER_RESULTS_MAX ${max}), cleared ${st.cleared}×; every 50th ≡ the walk (${bad} differ)` };
  },
  async doubts(T) {
    const { tg } = manager(T);
    const base = path.join(ROOT, 'doubt' + (++mn));
    const dir = path.join(base, 'ok'), lockedDir = path.join(base, 'locked'), inner = path.join(lockedDir, 'inner'), gone = path.join(base, 'gone');
    for (const d of [dir, inner, gone]) fs.mkdirSync(d, { recursive: true });
    fs.symlinkSync(path.join(base, 'loop-b'), path.join(base, 'loop-a')); fs.symlinkSync(path.join(base, 'loop-a'), path.join(base, 'loop-b'));
    tg._state.tasks = {
      'T-d1': { id: 'T-d1', title: 'ok', kind: 'task', createdAt: 1, sessions: ['claude:d'], ctx: [{ path: dir, tags: ['discover'] }], progress: [] },
      'T-d2': { id: 'T-d2', title: 'behind a stat that throws', kind: 'task', createdAt: 2, sessions: [], ctx: [{ path: inner, tags: ['discover'] }], progress: [] },
      'T-d3': { id: 'T-d3', title: 'the gone cwd', kind: 'task', createdAt: 3, sessions: [], ctx: [{ path: gone, tags: ['discover'] }], progress: [] },
    };
    tg._save();
    fs.chmodSync(lockedDir, 0o000); locked.push(lockedDir);   // stat(locked/inner) ⇒ EACCES (the store's _kindOf ⇒ missing)
    let statThrows = false; try { fs.statSync(inner); } catch (e) { statThrows = e.code === 'EACCES'; }
    fs.rmSync(gone, { recursive: true });
    const said = [];
    const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    const cases = [
      ['a stat that throws (EACCES under a discover row)', { sessionKey: 'claude:x', cwd: path.join(inner, 'w') }],
      ['a symlink loop as the cwd', { sessionKey: 'claude:d', cwd: path.join(base, 'loop-a') }],
      ['a cwd that no longer exists', { sessionKey: 'claude:x', cwd: path.join(gone, 'w') }],
    ];
    const res = [];
    for (const [k, fn] of Object.entries(orig)) console[k] = (...a) => said.push(`${k}: ${a.join(' ')}`);
    try {
      for (const [name, a] of cases) { let i, w, threw = null; try { i = tg.groupsForSession(a); w = tg._groupsForSessionWalk(a); } catch (e) { threw = e.message; } res.push({ name, ok: !threw && same(i, w), said: `${name}: ${threw ? 'THREW ' + threw : `index [${ids(i)}] walk [${ids(w)}]`}` }); }
      // a record whose createdAt is not a number: the index declines, the walk answers
      tg._state.tasks['T-d4'] = { id: 'T-d4', title: 'odd', kind: 'task', createdAt: 'yesterday', sessions: ['claude:d'], ctx: [], progress: [] }; tg._save();
      { const a = { sessionKey: 'claude:d', cwd: dir }; const w0 = tg.memberIndexStats().walks; let i, w, threw = null; try { i = tg.groupsForSession(a); w = tg._groupsForSessionWalk(a); } catch (e) { threw = e.message; } const walked = tg.memberIndexStats().walks > w0; res.push({ name: 'createdAt', ok: !threw && same(i, w) && walked, said: `a record whose createdAt is not a number: ${threw ? 'THREW ' + threw : `the walk answered ${walked} [${ids(i)}]`}` }); }
      delete tg._state.tasks['T-d4']; tg._save();
      // the index itself throwing (any throw while it is read or built)
      { const a = { sessionKey: 'claude:d', cwd: dir }; const keep = tg._memberIndex; tg._memberIndex = () => { throw new Error('an index that throws'); }; let i, w, threw = null; try { i = tg.groupsForSession(a); w = tg._groupsForSessionWalk(a); } catch (e) { threw = e.message; } tg._memberIndex = keep; res.push({ name: 'throw', ok: !threw && same(i, w) && i.length === 1, said: `the index throwing: ${threw ? 'THREW into the caller: ' + threw : `the walk answered [${ids(i)}]`}` }); }
    } finally { Object.assign(console, orig); }
    try { fs.chmodSync(lockedDir, 0o755); } catch { }
    return { ok: statThrows && res.every((r) => r.ok) && said.length === 0, detail: `${res.map((r) => r.said).join(' · ')} · said: ${said.length ? said.join(' | ') : 'nothing'}${statThrows ? '' : ' · (the EACCES stat did not throw here — running as root?)'}` };
  },
};

// ── the bench at the owner's shape ────────────────────────────────────────────────────────────────────────────────────
function bench(T) {
  const { tg } = manager(T);
  const base = path.join(ROOT, 'bench'); fs.mkdirSync(base, { recursive: true });
  const tasks = {}, live = [];
  for (let i = 0; i < 7; i++) {
    const d = path.join(base, 't' + i); fs.mkdirSync(path.join(d, 'sub'), { recursive: true });
    tasks['T-b' + i] = { id: 'T-b' + i, title: 'Task ' + i, kind: 'task', createdAt: i + 1, sessions: Array.from({ length: 200 }, (_, j) => `claude:b${i}-${j}`), ctx: [...(i < 6 ? [{ path: d, tags: ['discover'] }] : []), { path: d, tags: ['notes'] }], progress: [] };
  }
  tg._state.tasks = tasks; tg._save();
  for (let i = 0; i < 36; i++) live.push({ sessionKey: i % 3 ? `claude:b${i % 7}-${i}` : `claude:live-${i}`, cwd: path.join(base, 't' + (i % 7), i % 2 ? 'sub' : '') });
  const N = 300;
  const time = (fn) => { for (const a of live) fn(a); const t0 = performance.now(); for (let r = 0; r < N; r++) for (const a of live) fn(a); return ((performance.now() - t0) * 1000) / (N * live.length); };
  const walk = time((a) => tg._groupsForSessionWalk(a));
  const index = time((a) => tg.groupsForSession(a));
  // a store write that moves nothing membership reads (a progress line): the signature, then the cached answers
  const t0 = performance.now(); const M = 40;
  for (let i = 0; i < M; i++) { tg._rev++; tg.groupsForSession(live[0]); }
  const sigUs = ((performance.now() - t0) * 1000) / M;
  return { walk, index, sigUs };
}

// ── the red controls: patches this suite carries ─────────────────────────────────────────────────────────────────────
const TG = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8');
const PATCHES = {
  'no-signature': ["memberSig(tasks) === ix.sig && ", '', 'writers', 'a rev change keeps the index whatever moved (the signature check out)'],
  'no-identity': [" && ix.groups.every((g) => tasks[g.key] === g.t)", '', 'writers', 'an equal copy keeps the old record (the identity check out)'],
  'no-bound': ["      if (e !== undefined && e === g.resEntry && now - e.at < 4000) continue;\n", "      if (g.resKey !== null) continue;\n", 'folder-bound', 'the folders never re-derived (the 4 s bound out)'],
  'no-cap': ["if (ix.results.size >= MEMBER_RESULTS_MAX) {", 'if (false) {', 'result-bound', 'the result map unbounded (the cap out)'],
  'no-fallback': ["try { ans = this._memberAnswer(args || {}); } catch { ans = null; }", 'ans = this._memberAnswer(args || {});', 'doubts', 'a throw of the index reaches the caller (the fallback out)'],
};
function patched(tag) {
  const [from, to] = PATCHES[tag];
  if (TG.split(from).length !== 2) return null;
  const M = path.join(ROOT, 'patch-' + tag);
  fs.mkdirSync(path.join(M, 'src'), { recursive: true });
  for (const e of fs.readdirSync(path.join(REPO, 'src'))) { const dst = path.join(M, 'src', e); if (e === 'task-groups.js') fs.writeFileSync(dst, TG.replace(from, to)); else fs.symlinkSync(path.join(REPO, 'src', e), dst); }
  for (const f of ['package.json', 'node_modules']) fs.symlinkSync(path.join(REPO, f), path.join(M, f));
  return M;
}

const run = async (name, T) => { const t = performance.now(); try { const r = await LEGS[name](T); r.detail += ` [${(performance.now() - t).toFixed(0)} ms]`; return r; } catch (e) { return { ok: false, detail: `threw: ${(e && e.stack) || e}`.slice(0, 600) }; } finally { skew = 0; } };
say('this tree');
for (const leg of Object.keys(LEGS)) { const r = await run(leg, REPO); ok(r.ok, `${leg}: ${r.detail}`); }
say('RED CONTROLS — patches this suite carries on this tree\'s src/task-groups.js (each RED at its own leg)');
for (const [tag, [, , leg, what]] of Object.entries(PATCHES)) {
  const M = patched(tag);
  if (!ok(!!M, `the patch «${tag}» applies to this tree's task-groups.js (its anchor is there once)`)) continue;
  const r = await run(leg, M); ok(!r.ok, `${what} ⇒ RED at ${leg}: ${r.detail}`);
}
const b = bench(REPO);
say(`THE BENCH at the owner's shape (7 Task Groups × 200 bound conversations, 6 discover rows, 36 live, ${36 * 300} asks): the walk ${b.walk.toFixed(2)} µs per ask, the index ${b.index.toFixed(2)} µs; a store write that moves nothing membership reads costs the next ask ${b.sigUs.toFixed(0)} µs (the signature)`);
ok(b.index < b.walk, `the index answers faster than the walk at the owner's shape (${b.index.toFixed(2)} < ${b.walk.toFixed(2)} µs)`);
say(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
