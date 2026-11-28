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
//   ⑥ THE REAL PATH (主开发's two green mutants on 5ae1677c9): a cwd that EXISTS through a symlink into a discover folder
//     belongs by its real path only; the remote shape — one cwd asked with two different given real paths, one inside a
//     folder and one outside — answers each by its own real path; both ≡ the walk, asked in both orders;
//   ⑦ THE RESOLVER'S CACHE HOLDS WHAT THE STORE HAS: at 260 and 600 groups (each its own discover + notes row) a warm ask
//     stats nothing (a fixed 256 cleared whole: ~780 / ~1 800 stats an ask);
//   ⑧ THE BENCH at the owner's shape (7 Task Groups of ~200 conversations, 6 discover rows, 36 live): µs per ask.
//   ⑨ B-df5f (a folder is resolved on the machine it belongs to, or not at all): a conversation of ANOTHER machine (hostId)
//     whose cwd exists on the hub as a symlink into a discover folder is not that group's by the hub's real path; the same
//     cwd of this machine is; another machine's cwd written inside ITS OWN row (`host::/path`, B-06de), or a real path that
//     machine resolved, is; another machine's conversation never joins a HUB row (B-06de) —
//     index ≡ walk; ⑨b every caller handing a conversation's cwd hands its machine (a census of src/ + server.js; an
//     argument handed as a VARIABLE is read at its nearest declaration before the call; one it cannot read — a spread, a
//     parameter — is a red); ⑨c THE BOARD AND THE SERVER ANSWER THE SAME MEMBERSHIP: over rows built as the page's merge
//     (sidebar _merge) builds them — a shared home's hub row of a remote live conversation + its host — task-membership
//     membershipCwds (the page's cwds) agrees with the REAL groupsForSession (RED control: the hub's real path kept for every
//     row); the row builder's guard (no hub real path on a row that names another machine; no producer makes one today).
// Red controls: PATCHES THIS SUITE CARRIES on this tree's src/task-groups.js (master has no index to be red on) — the
// signature check out (a rev change keeps a stale index), the identity check out, the 4 s bound out, the cap out, the
// doubt's fallback out, another machine's path through the hub's realpath (B-df5f) — each RED at its own leg; ⑨c carries two more
// through mutant copies: task-membership's membershipCwds keeping the hub's real path for every row, the row builder without
// its guard; an anchor no longer in the file is a RED, never a skip.
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
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
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + String(detail).slice(0, 700)}`); } return !!c; }
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

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
    // B-55dc: membership's file facts are OFF-LOOP reads — an ask starts the (re)read, the next ask after it landed sees it
    const at = async (label) => { tg.groupsForSession(ask); for (let k = 0; k < 12; k++) { await tg._mfacts.settled(); await new Promise((r) => setImmediate(() => setImmediate(r))); if (!tg._mfacts.busy()) break; } const i = tg.groupsForSession(ask), w = tg._groupsForSessionWalk(ask); return { label, i: ids(i), w: ids(w), same: same(i, w) }; };
    const s0 = await at('before');
    fs.mkdirSync(later);
    skew = 1500; const s1 = await at('+1.5 s');
    skew = 4100; const s2 = await at('+4.1 s');
    // cleared facts are read again at once (the next ask starts the read)
    fs.rmSync(later, { recursive: true });
    tg._mfacts.clear();
    const s3 = await at('removed, facts cleared');
    skew = 0;
    const steps = [s0, s1, s2, s3];
    const okv = steps.every((x) => x.same) && s0.i === '' && s1.i === '' && s2.i === 'T-fb' && s3.i === '';
    return { ok: okv, detail: steps.map((x) => `${x.label}: index [${x.i}] walk [${x.w}]`).join(' · ') + ' (a folder created on disk is seen within ONE REFRESH — the 4 s bound, then its off-loop read — the index ≡ the walk at every step)' };
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
  async 'real-path'(T) {
    const base = path.join(ROOT, 'real' + (++mn)), D = path.join(base, 'folder'), out = path.join(base, 'outside');
    fs.mkdirSync(path.join(D, 'sub', 'w'), { recursive: true }); fs.mkdirSync(out, { recursive: true });
    fs.symlinkSync(path.join(D, 'sub'), path.join(base, 'via'));   // base/via → folder/sub: a cwd outside the folder by its path
    const tasks = () => ({ 'T-rp': { id: 'T-rp', title: 'rp', kind: 'task', createdAt: 1, sessions: [], ctx: [{ path: D, tags: ['discover'] }], progress: [] } });
    const said = [];
    const ask = async (tg, a) => { tg.groupsForSession(a); for (let k = 0; k < 12; k++) { await tg._mfacts.settled(); await new Promise((r) => setImmediate(() => setImmediate(r))); if (!tg._mfacts.busy()) break; } const i = tg.groupsForSession(a), w = tg._groupsForSessionWalk(a); said.push(`${JSON.stringify(a.realCwd ? { cwd: a.cwd, realCwd: a.realCwd } : a.cwd)} → index [${ids(i)}] walk [${ids(w)}]`); return same(i, w) ? ids(i) : 'DIFFERS'; };
    // (i) a cwd that exists THROUGH a symlink: it belongs by its real path only
    const t1 = manager(T).tg; t1._state.tasks = tasks(); t1._save();
    const viaCwd = path.join(base, 'via', 'w');
    const i1 = await ask(t1, { sessionKey: 'claude:rp', cwd: viaCwd });
    // (ii) the remote shape: one cwd, two given real paths — inside, then outside; and outside, then inside
    const remote = '/remote-host/home/proj';
    const t2 = manager(T).tg; t2._state.tasks = tasks(); t2._save();
    const a1 = await ask(t2, { sessionKey: 'claude:rp', cwd: remote, realCwd: path.join(D, 'x') }), a2 = await ask(t2, { sessionKey: 'claude:rp', cwd: remote, realCwd: out });
    const t3 = manager(T).tg; t3._state.tasks = tasks(); t3._save();
    const b1 = await ask(t3, { sessionKey: 'claude:rp', cwd: remote, realCwd: out }), b2 = await ask(t3, { sessionKey: 'claude:rp', cwd: remote, realCwd: path.join(D, 'x') });
    const okv = i1 === 'T-rp' && a1 === 'T-rp' && a2 === '' && b1 === '' && b2 === 'T-rp';
    return { ok: okv, detail: said.join(' · ') };
  },
  // ⑨ B-df5f — A FOLDER IS RESOLVED ON THE MACHINE IT BELONGS TO, OR NOT AT ALL: a conversation of another machine (hostId)
  // whose cwd EXISTS ON THE HUB as a symlink into a group's discover folder is NOT that group's by the hub's real path; the
  // same cwd of a conversation of this machine is (its realpath); another machine's cwd written inside ITS OWN row of the folder
  // (`host-dial-far::<D>` — B-06de: a folder row is its machine's), or a real path that machine resolved itself (realCwd), still
  // belongs; that machine's conversation never joins the HUB row of the same spelling — index ≡ walk, both orders
  async 'other-machine'(T) {
    const base = path.join(ROOT, 'om' + (++mn)), D = path.join(base, 'folder');
    fs.mkdirSync(path.join(D, 'sub', 'w'), { recursive: true });
    fs.symlinkSync(path.join(D, 'sub'), path.join(base, 'link'));   // base/link → folder/sub ON THE HUB
    const tasks = () => ({ 'T-om': { id: 'T-om', title: 'om', kind: 'task', createdAt: 1, sessions: [], ctx: [{ path: D, tags: ['discover'] }, { path: 'host-dial-far::' + D, tags: ['discover'] }], progress: [] } });
    const hubOnly = () => ({ 'T-om': { id: 'T-om', title: 'om', kind: 'task', createdAt: 1, sessions: [], ctx: [{ path: D, tags: ['discover'] }], progress: [] } });
    const said = [];
    // B-55dc: the hub's realpath is an OFF-LOOP fact — the first ask starts its read; the answer compared is the one once read
    const ask = async (tg, a) => { tg.groupsForSession(a); for (let k = 0; k < 12; k++) { await tg._mfacts.settled(); await new Promise((r) => setImmediate(() => setImmediate(r))); if (!tg._mfacts.busy() && !tg._mmTimer) break; } const i = tg.groupsForSession(a), w = tg._groupsForSessionWalk(a); said.push(`${a.hostId ? a.hostId + ':' : 'here:'}${a.cwd}${a.realCwd ? ' (real ' + a.realCwd + ')' : ''} → index [${ids(i)}] walk [${ids(w)}]`); return same(i, w) ? ids(i) : `index ${ids(i)} ≠ walk ${ids(w)}`; };
    const linked = path.join(base, 'link', 'w');
    const t1 = manager(T).tg; t1._state.tasks = tasks(); t1._save();
    const remote1 = await ask(t1, { sessionKey: 'claude:om1', cwd: linked, hostId: 'host-dial-far' }), local1 = await ask(t1, { sessionKey: 'claude:om2', cwd: linked });
    const t2 = manager(T).tg; t2._state.tasks = tasks(); t2._save();   // the other order (the result map keyed per ask)
    const local2 = await ask(t2, { sessionKey: 'claude:om2', cwd: linked }), remote2 = await ask(t2, { sessionKey: 'claude:om1', cwd: linked, hostId: 'host-dial-far' });
    const written = await ask(t2, { sessionKey: 'claude:om3', cwd: path.join(D, 'sub', 'w'), hostId: 'host-dial-far' });
    const ownReal = await ask(t2, { sessionKey: 'claude:om4', cwd: '/far/home/proj', realCwd: path.join(D, 'sub'), hostId: 'host-dial-far' });
    const t3 = manager(T).tg; t3._state.tasks = hubOnly(); t3._save();   // B-06de: the hub row alone — the far machine's conversation written inside it never joins
    const hubRowFar = await ask(t3, { sessionKey: 'claude:om5', cwd: path.join(D, 'sub', 'w'), hostId: 'host-dial-far' });
    said.push(`hub row + far cwd: ${JSON.stringify(hubRowFar)}`);
    const okv = remote1 === '' && remote2 === '' && local1 === 'T-om' && local2 === 'T-om' && written === 'T-om' && ownReal === 'T-om' && hubRowFar === '';
    return { ok: okv, detail: said.join(' · ') };
  },
  async 'cache-cliff'(T) {
    const out = [];
    let okAll = true;
    for (const N of [260, 600]) {
      const { tg } = manager(T);
      const base = path.join(ROOT, 'cliff' + N + '-' + (++mn));
      const tasks = {};
      for (let i = 0; i < N; i++) { const d = path.join(base, 'g' + i); fs.mkdirSync(d, { recursive: true }); tasks['T-c' + i] = { id: 'T-c' + i, title: 'g' + i, kind: 'task', createdAt: i + 1, sessions: [], ctx: [{ path: d, tags: ['discover'] }, { path: d, tags: ['notes'] }], progress: [] }; }
      tg._state.tasks = tasks; tg._save();
      // B-55dc: membership asks no stat for these rooted rows at all — what the cliff costs now is its resolver RE-DERIVING
      // every group: the table resolutions per warm ask (the tree's own task-context module, the one task-groups calls)
      const TCm = createRequire(path.join(T, 'package.json'))('./src/task-context.js');
      let stats = 0; const resolveRows0 = TCm.resolveRows; TCm.resolveRows = (...a) => { stats++; return resolveRows0(...a); };
      const asks = Array.from({ length: 40 }, (_, i) => ({ sessionKey: 'claude:c' + i, cwd: path.join(base, 'g' + ((i * 7) % N), 'w') }));
      tg.groupsForSession(asks[0]);   // warm
      stats = 0;
      let bad = 0;
      for (const a of asks) { const i = tg.groupsForSession(a); if (i.length !== 1) bad++; }
      const per = stats / asks.length;
      if (!(per === 0 && bad === 0)) okAll = false;
      TCm.resolveRows = resolveRows0;
      out.push(`${N} groups: ${per.toFixed(0)} tables re-derived per warm ask${bad ? `, ${bad} wrong` : ''}`);
    }
    return { ok: okAll, detail: out.join(' · ') + ' (each group its own discover + notes row)' };
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
  'no-bound': ["      if (e !== undefined && e === g.resEntry && e.gen === this._mfacts.gen() && now - e.at < 4000) continue;\n", "      if (g.resKey !== null) continue;\n", 'folder-bound', 'the folders never re-derived (the 4 s bound out)'],
  'no-cap': ["if (ix.results.size >= MEMBER_RESULTS_MAX) {", 'if (false) {', 'result-bound', 'the result map unbounded (the cap out)'],
  'no-real-path': ["    const real = this._realHere(cwd, realCwd, hostId);\n    const cwds = [cwd, real && real !== cwd ? real : null].filter(Boolean);\n    const key = ", "    const real = this._realHere(cwd, realCwd, hostId);\n    const cwds = [cwd].filter(Boolean);\n    const key = ", 'real-path', 'the cwds reduced to the cwd alone (主开发\'s mutant a)'],
  'no-real-in-key': ["const key = JSON.stringify([sessionKey || '', cwds, spawned]);", "const key = JSON.stringify([sessionKey || '', [cwd || ''], spawned]);", 'real-path', 'the result key built without the real path (主开发\'s mutant b)'],
  'cache-256': ["if (this._mresCache.size > Math.max(256, 2 * Object.keys(this._state.tasks || {}).length + 64)) this._mresCache.clear();", "if (this._mresCache.size > 256) this._mresCache.clear();", 'cache-cliff', 'the resolver\'s cache back at a fixed 256 cleared whole'],
  'hub-real-for-remote': ["    if (!onOtherMachine(hostId)) return this._realOf(cwd, realCwd);", "    return this._realOf(cwd, realCwd);", 'other-machine', 'another machine\'s path resolved by the hub\'s realpath (the checkpoint as it was, B-df5f)'],
  'no-fallback': ["try { ans = this._memberAnswer(args || {}); } catch { ans = null; }", 'ans = this._memberAnswer(args || {});', 'doubts', 'a throw of the index reaches the caller (the fallback out)'],
};
function patched(tag) {
  const [from, to] = PATCHES[tag];
  if (TG.split(from).length !== 2) return null;
  const M = path.join(ROOT, 'patch-' + tag);
  fs.mkdirSync(path.join(M, 'src'), { recursive: true });
  for (const e of fs.readdirSync(path.join(REPO, 'src'))) { const dst = path.join(M, 'src', e); if (e === 'task-groups.js') fs.writeFileSync(dst, editAnchor(TG, from, to, "src/task-groups.js")); else fs.symlinkSync(path.join(REPO, 'src', e), dst); }
  for (const f of ['package.json', 'node_modules']) fs.symlinkSync(path.join(REPO, f), path.join(M, f));
  return M;
}

const run = async (name, T) => { const t = performance.now(); try { const r = await LEGS[name](T); r.detail += ` [${(performance.now() - t).toFixed(0)} ms]`; return r; } catch (e) { return { ok: false, detail: `threw: ${(e && e.stack) || e}`.slice(0, 600) }; } finally { skew = 0; } };
say('this tree');
for (const leg of Object.keys(LEGS)) { const r = await run(leg, REPO); ok(verdictOf(r.ok), `${leg}: ${r.detail}`); }
say('RED CONTROLS — patches this suite carries on this tree\'s src/task-groups.js (each RED at its own leg)');
for (const [tag, [, , leg, what]] of Object.entries(PATCHES)) {
  const M = patched(tag);
  if (!ok(!!M, `the patch «${tag}» applies to this tree's task-groups.js (its anchor is there once)`)) continue;
  const r = await run(leg, M); ok(!r.ok, `${what} ⇒ RED at ${leg}: ${r.detail}`);
}
// ⑨b B-df5f THE CALLERS: every call that hands a conversation's cwd to the store — groupsForSession, and the create's
// Task-Group facts (taskGroupDefaultFor / taskGroupCapFor / stampGroupCap) — hands its machine too (src/ + server.js). Each call's
// OWN argument is cut by bracket matching (multi-line calls included; a hostId of a later call on the same line never counts).
{
  // the restack for 2.369.412 (the meeting with B-55dc): B-55dc's DECIDING doors hand a conversation's cwd too — membershipRead,
  // groupsForSessionDecided, memberIds (the drawing door's ids, its flag kept) and the keeper's taskGroupReadFor (the create's)
  // + the seam's helper (2.369.411 × .412, lane bl-windows): grantMemberIds(tasks, facts, …) — its callers hand the facts (its SECOND
  // argument), and its own memberIds(a) is ONE declared pass-through (the helper's line, below)
  const CALLS = /\b(groupsForSession|groupsForSessionDecided|membershipRead|memberIds|taskGroupDefaultFor|taskGroupCapFor|stampGroupCap|taskGroupReadFor|grantMemberIds)\(/g;
  const inside = (t, open, o, c) => { let d = 0, q = null; for (let k = open; k < t.length; k++) { const ch = t[k];
    if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === o) d++; else if (ch === c) { d--; if (d === 0) return t.slice(open + 1, k); } } return null; };
  const argOf = (t, open) => inside(t, open, '(', ')');
  // the call's arguments split at its top-level commas; the FACTS are the first (stampGroupCap: the second, after the key)
  const argsOf = (a) => { const out = []; let d = 0, q = null, from = 0; for (let k = 0; k < a.length; k++) { const ch = a[k];
    if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (ch === ',' && d === 0) { out.push(a.slice(from, k).trim()); from = k + 1; } }
    out.push(a.slice(from).trim()); return out; };
  // the facts a call hands: its own object literal, or (cure, 主开发 09:43Z) a VARIABLE read at its object literal — its NEAREST
  // declaration before the call in the same file (`const groupFacts = { cwd: …, hostId: … }` — the browser key's). A name with
  // no declaration before the call, a literal holding a spread (`{ ...facts }`), or any other expression in the facts' place
  // is UNSEEN — a red, never a pass; a default parameter (`facts = {}`) is a definition.
  // → { facts } (text holding a cwd) · { unseen } · null (no cwd handed: a key-only ask, a definition)
  const litOf = (x, via) => (/\.\.\./.test(x) ? { unseen: `${via || 'a literal'} holds a spread` } : /\bcwd\b/.test(x) ? { facts: x, via } : null);
  const factsOf = (t, name, a, at = t.length) => {
    const x = argsOf(a)[name === 'stampGroupCap' || name === 'grantMemberIds' ? 1 : 0] || '';
    if (x.startsWith('{')) return litOf(x);
    if (/^[A-Za-z_$][\w$]*\s*=/.test(x) || x === '') return null;
    if (!/^[A-Za-z_$][\w$]*$/.test(x)) return { unseen: x };
    const re = new RegExp('\\b(?:const|let|var)\\s+' + x.replace(/\$/g, '\\$') + '\\s*=\\s*\\{', 'g');
    let d = null, e; while ((e = re.exec(t)) && e.index < at) d = e;
    if (!d) return { unseen: x };
    const o = inside(t, d.index + d[0].length - 1, '{', '}');
    return o == null ? { unseen: x } : litOf(o, x); };
  // a machine HANDED: a hostId key whose value is not a literal null / undefined
  const handsMachine = (f) => /\bhostId\b/.test(f) && !/\bhostId\s*:\s*(?:null|undefined)\s*[,}]/.test(f + '}');
  // THE STORE'S OWN RE-ENTRY (B-55dc): inside src/task-groups.js a door that calls another door with its own facts parameter
  // (`this.groupsForSession(args)`) hands what ITS caller handed — that caller is a row of this census; only there, only `this.`
  // with a bare name: anywhere else the same shape is UNSEEN (a red — the control below)
  let reentries = 0;
  const reentry = (t, file, m, a) => file === 'src/task-groups.js' && t.slice(Math.max(0, m.index - 5), m.index) === 'this.' && /^[A-Za-z_$][\w$]*$/.test(argsOf(a)[0] || '');
  // THE SEAM'S HELPER (2.369.411 × .412): src/server/mounts-plugins-wiring.js `const grantMemberIds = (tasks, a, …) =>` hands its
  // callers' facts to memberIds / groupIdsForGrant — its callers are rows of this census (grantMemberIds is a CALL above); only
  // that line, only a bare parameter: the same shape anywhere else is UNSEEN (the control below)
  let passes = 0;
  const lineOf = (t, at) => t.slice(t.lastIndexOf('\n', at) + 1, (t.indexOf('\n', at) + 1 || t.length + 1) - 1);
  const helperPass = (t, file, m, a) => file === path.join('src', 'server', 'mounts-plugins-wiring.js') && m[1] === 'memberIds' && /^const grantMemberIds = \(tasks, a(?:, [A-Za-z_$][\w$]*)?\) => /.test(lineOf(t, m.index)) && argsOf(a)[0] === 'a';
  // THE OWED PIN'S GROUP FACTS (lane bl-jobs, the browser registry unit — block line 236; checkpoint 60's red): a create the HELD profile
  // registry could not judge OWES its pin, and its Task-Group facts travel WITH the owe — built ONCE where the create is held
  // (src/ws-create.js `const gf = { cwd, hostId: data.hostId || null, … }`, carried as `groupFacts: gf`), persisted WHOLE in the
  // conversation's record (`browserPinOwed`) and re-owed whole at the boot; at the read they are handed on as they are. Two declared
  // hand-ons — only these two calls, only this argument, and only while that builder hands the machine (the controls below)
  const WSC = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8'), builtIn = (w) => /const gf = \{ cwd, hostId: data\.hostId \|\| null, /.test(w) && /, groupFacts: gf, /.test(w), OWED_BUILT = builtIn(WSC);
  const OWED_PASS = [['src/server/browser-keeper.js', 'stampGroupCap', 1, 'owed.groupFacts'], ['src/server/browser-key.js', 'taskGroupCapFor', 0, 'o.groupFacts || {}']];
  let owedPasses = 0;
  const owedPass = (t, file, m, a, built = OWED_BUILT) => built && OWED_PASS.some(([f, n, i, arg]) => file === f && m[1] === n && (argsOf(a)[i] || '').trim() === arg);
  // THE KEEPER'S WAITING CAP (lane bl-windows, the B-f276 follow's owed items): src/server/browser-keeper.js re-stamps a key whose
  // cap read waited for the Task Groups store with the facts ITS OWN stampGroupCap was handed (`capWaiting.set(bk, facts || {})`) —
  // that first call is a row of this census; only on retryWaitingCaps' line, only a bare name: the same shape anywhere else is UNSEEN
  let waits = 0;
  const waitPass = (t, file, m, a) => file === path.join('src', 'server', 'browser-keeper.js') && m[1] === 'stampGroupCap' && /^\s*function retryWaitingCaps\(\) \{/.test(lineOf(t, m.index)) && /^[A-Za-z_$][\w$]*$/.test(argsOf(a)[1] || '') && /capWaiting\.set\(bk, facts \|\| \{\}\)/.test(t);
  const missing = (t, file = '') => { const out = []; let m; CALLS.lastIndex = 0;
    while ((m = CALLS.exec(t))) { const a = argOf(t, m.index + m[0].length - 1); if (a != null && reentry(t, file, m, a)) { reentries++; continue; } if (a != null && helperPass(t, file, m, a)) { passes++; continue; } if (a != null && owedPass(t, file, m, a)) { owedPasses++; continue; } if (a != null && waitPass(t, file, m, a)) { waits++; continue; } const f = a != null && factsOf(t, m[1], a, m.index); if (!f) continue;
      if (f.unseen) out.push(`${m[1]}(${a.replace(/\s+/g, ' ').slice(0, 80)}) — «${f.unseen}» UNSEEN (no object literal of it in this file)`);
      else if (!handsMachine(f.facts)) out.push(`${m[1]}(${(f.via ? f.via + ' = ' : '') + f.facts.replace(/\s+/g, ' ').slice(0, 100)})`); }
    return out; };
  const files = ['server.js'], walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js')) files.push(r); } };
  walk('src');
  const bad = [];
  let calls = 0, viaVar = 0;
  for (const f of files) { const t = fs.readFileSync(path.join(REPO, f), 'utf8'); let m; CALLS.lastIndex = 0; while ((m = CALLS.exec(t))) { const a = argOf(t, m.index + m[0].length - 1); const x = a != null && factsOf(t, m[1], a, m.index); if (x && x.facts) { calls++; if (x.via) viaVar++; } } for (const x of missing(t, f)) bad.push(`${f}: ${x}`); }
  ok(calls >= 26 && viaVar >= 2 && bad.length === 0 && reentries === 4 && passes === 1 && waits === 1, `B-df5f: every call handing the store a conversation's cwd hands its machine (hostId) — ${calls} calls in src/ + server.js (groupsForSession, B-55dc's deciding doors and the create's Task-Group facts; the store's own ${reentries} re-entries pass their caller's facts — 2.369.411's groupIdsForGrant among them; the seam's ONE helper grantMemberIds passes ${passes}, its callers rows here; the keeper's waiting cap re-stamps ${waits} time (retryWaitingCaps) with the facts its own first call was handed), ${viaVar} of them through a variable read at its object literal${bad.length ? ' · MISSING: ' + bad.join(' | ') : ''}`);
  { const before = waits, KPF = path.join('src', 'server', 'browser-keeper.js'), SEEN = "  function retryWaitingCaps() { for (const [k, f] of [...capWaiting]) stampGroupCap(k, f); }\n  function stampGroupCap(browserKey, facts = {}) { capWaiting.set(bk, facts || {}); }";
    ok(missing(SEEN, KPF).length === 0 && gateOf(/UNSEEN/.test(missing(SEEN, 'src/server/other.js').join(''))) && verdictOf(/UNSEEN/.test(missing("  const later = () => { for (const [k, f] of [...capWaiting]) stampGroupCap(k, f); };\n  function stampGroupCap(browserKey, facts = {}) { capWaiting.set(bk, facts || {}); }", KPF).join(''))),
      'CONTROL (the keeper\'s waiting cap): its re-stamp with the facts the first call handed passes ONLY on the line of retryWaitingCaps in the keeper (another file, another line: UNSEEN, a red)');
    waits = before; }
  ok(missing("x = tasks.groupsForSession({\n  sessionKey: k,\n  cwd: s.cwd,\n  initialGroupId: s._initialGroupId,\n});").length === 1, 'CONTROL: a planted MULTI-LINE call that hands a cwd without its machine is caught');
  { const before = passes, MPF = path.join('src', 'server', 'mounts-plugins-wiring.js');
    ok(gateOf(/UNSEEN/.test(missing("const grantMemberIds = (tasks, a) => tasks.memberIds(a);", 'src/server/other.js').join(''))) && gateOf(/UNSEEN/.test(missing("const otherHelper = (tasks, a) => tasks.memberIds(a);", MPF).join('')))
      && missing("const grantMemberIds = (tasks, a, reader) => (tasks.isHeldUnread() ? tasks.groupIdsForGrant(a, reader) : tasks.memberIds(a));", MPF).length === 0
      && missing("x = grantMemberIds(tasks, { sessionKey: k, cwd: s.cwd });", MPF).length === 1 && missing("x = grantMemberIds(tasks, { sessionKey: k, cwd: s.cwd, hostId: s.host || null });", MPF).length === 0,
      'CONTROL (the seam\'s helper): its memberIds(a) passes ONLY on its own line in the wiring (the same line in another file, another name: UNSEEN, a red); a CALLER of it that hands a cwd without its machine is caught, one with it passes');
    passes = before; }
  ok(gateOf(OWED_BUILT) && owedPasses === 2, `the owed pin's group facts: built ONCE with the machine (src/ws-create.js: gf = { cwd, hostId: data.hostId || null, … } → groupFacts: gf) and handed on as they are at the read — ${owedPasses} declared hand-ons (the keeper's stampGroupCap, the key module's taskGroupCapFor)`);
  { const before = owedPasses;
    ok(gateOf(/UNSEEN/.test(missing("function f(owed) { return kc.stampGroupCap(k, owed.groupFacts, {}); }", 'src/server/other.js').join(''))) && gateOf(/UNSEEN/.test(missing("function f(o) { return kc.taskGroupCapFor(o.facts || {}); }", 'src/server/browser-key.js').join('')))
      && verdictOf(OWED_PASS.every(([f, n, i, arg]) => owedPass('', f, [null, n], i ? `k, ${arg}, {}` : arg) && !owedPass('', f, [null, n], i ? `k, ${arg}, {}` : arg, builtIn(WSC.replace('const gf = { cwd, hostId: data.hostId || null, ', 'const gf = { cwd, '))))),
    'CONTROLS: the same hand-on in ANOTHER file, or another argument in the key module, is UNSEEN (a red); each declared hand-on passes only while its builder hands the machine — a builder copy without hostId fails both (a red)');
    owedPasses = before; }

  ok(missing("a = kc.taskGroupCapFor({ cwd, initialGroupId: g }); b = tasks.groupsForSession({ cwd: s.cwd, hostId: s.host || null });").length === 1, 'CONTROL: a hostId of a LATER call on the same line does not cover an earlier one');
  ok(missing("const facts = { cwd: s.cwd, initialGroupId: g };\nconst d = kc.taskGroupDefaultFor(facts); kc.stampGroupCap(k, facts, {});").length === 2, 'CONTROL: a planted VARIABLE whose object literal hands a cwd without its machine is caught at each call that hands it');
  ok(verdictOf(/UNSEEN/.test(missing("function f(a) { return tasks.groupsForSession(a); }").join(''))), 'CONTROL: a variable the census cannot read at an object literal (a parameter) is UNSEEN — a red');
  { const before = reentries;
    ok(gateOf(/UNSEEN/.test(missing("function f(a) { return this.membershipRead(a); }", 'src/server/other.js').join(''))) && missing("x = tasks.membershipRead({ sessionKey: k, cwd: s.cwd });").length === 1 && missing("function f(a) { return this.groupsForSession(a); }", 'src/task-groups.js').length === 0,
      'CONTROL: a `this.` re-entry with a bare parameter passes ONLY in the store itself (another file: UNSEEN, a red); a deciding door handed a cwd without its machine is caught');
    reentries = before; }
  ok(missing("function g() { const facts = { cwd, hostId: h }; } function f(s) { const facts = { cwd: s.cwd }; return kc.taskGroupDefaultFor(facts); }").length === 1, 'CONTROL: the NEAREST declaration before the call judges it (another function\'s literal of the same name does not cover it)');
  ok(gateOf(/spread/.test(missing("x = tasks.groupsForSession({ ...facts, sessionKey: k });").join(''))) && missing("x = tasks.groupsForSession({ sessionKey: k, cwd: s.cwd, hostId: null });").length === 1, 'CONTROL: a spread in the facts is UNSEEN; a literal `hostId: null` hands no machine');
}

// ⑨c B-df5f cure — THE BOARD AND THE SERVER ANSWER THE SAME MEMBERSHIP (主开发 09:43Z; its reader's must): the page's own copy
// of the folder rule (src/lib/sidebar-tasks.js _sessionFolderMatch) matches a row's cwd and the realCwd the HUB stamped on
// /api/sessions rows. The road where they disagreed is the page's own merge (src/lib/sidebar.js _merge): a shared home makes
// the hub's discovery row of a REMOTE live conversation (no host, the hub's realCwd), and the merge lays the live session's
// `host` over it. ONE rule now — task-membership membershipCwds (the page's cwds: a hub real path only for the hub's own) and
// onOtherMachine (the server's _realHere, the row builder) — driven here over rows built as the merge builds them, against
// the REAL groupsForSession; the page's code is held to calling it (text). RED control: a membershipCwds that keeps the hub's
// real path for every row (the page before) — board member, server not. The row builder's guard (no hub real path on a row
// that names another machine — no producer makes such a row today) with its own red control.
{
  const req = createRequire(import.meta.url);
  const TM = req(path.join(REPO, 'src/task-membership.js'));
  // B-891e (the sweep, met at 2.369.412's second checkpoint): the row builder lives in src/sessions-assemble.js — ONE copy for
  // the hub's thread and the sweep's worker; src/routes/sessions.js re-exports it (the guard rides the builder there)
  const SRC = fs.readFileSync(path.join(REPO, 'src/sessions-assemble.js'), 'utf8');
  const PAGE = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-tasks.js'), 'utf8'), MERGE = fs.readFileSync(path.join(REPO, 'src/lib/sidebar.js'), 'utf8'), APP = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8');
  const base = path.join(ROOT, 'board'), D = path.join(base, 'folder');
  fs.mkdirSync(path.join(D, 'sub', 'w'), { recursive: true });
  fs.symlinkSync(path.join(D, 'sub'), path.join(base, 'link'));   // base/link → folder/sub ON THE HUB (a shared home's link)
  const linked = path.join(base, 'link', 'w'), rec = TM.folderOf(D), realW = fs.realpathSync(path.join(D, 'sub', 'w'));
  const { tg } = manager(REPO); tg._state.tasks = { 'T-bd': { id: 'T-bd', title: 'bd', kind: 'task', createdAt: 1, sessions: [], ctx: [{ path: D, tags: ['discover'] }], progress: [] } }; tg._save();
  const serverSays = (row) => tg.groupsForSession({ sessionKey: row.sessionKey, cwd: row.cwd, hostId: row.host || null }).some((t) => t.id === 'T-bd');   // as every caller asks (no caller hands a realCwd)
  const boardBy = (cwdsOf) => (row) => cwdsOf({ cwd: row.cwd, realCwd: row.realCwd, host: row.host }).some((c) => TM.insideFolder(c, rec));
  ok(typeof TM.membershipCwds === 'function' && typeof TM.onOtherMachine === 'function', 'task-membership carries the ONE rule: membershipCwds (the page\'s cwds) and onOtherMachine (none and \'local\' are the hub)');
  ok(gateOf(/const cwds = membershipCwds\(\{ cwd: stripCwdHostLabel\(s\.cwd\), realCwd: s\.realCwd, hostRealCwd: s\.hostRealCwd, host: s\.host \}\);/.test(PAGE)) && !/\[stripCwdHostLabel\(s\.cwd\), s\.realCwd\]/.test(PAGE) && verdictOf(/host: wm\?\.host \|\| null,/.test(MERGE)),   // stale-pins: kept — the deliberate absence check: the old cwds line is gone
    'the page\'s folder match (sidebar-tasks _sessionFolderMatch) takes its cwds from membershipCwds with the row\'s host — the host the merge (sidebar _merge) lays over a hub row');
  ok(gateOf(/const under = membershipCwds\(\{ cwd: s\.cwd, realCwd: s\.realCwd, host: s\.host \}\)\.some\(\(c\) => insideFolder\(c, rec\)\);/.test(APP)) && !/insideFolder\(s\.cwd, rec\) \|\| \(s\.realCwd && insideFolder\(s\.realCwd, rec\)\)/.test(APP),   // stale-pins: kept — the deliberate absence check: the chips' own copy is gone
    'cure 2: the New Session folder chips (app.js _taskCwdSuggestions) take their cwds from the same membershipCwds — the page holds ONE copy of the rule');
  {   // (on a tree without membershipCwds the page's rule before is judged — the scene goes red BY NAME, never skipped)
    const cwdsOf = typeof TM.membershipCwds === 'function' ? TM.membershipCwds : ({ cwd, realCwd }) => [cwd, realCwd].filter(Boolean);
    // the hub's discovery row of the conversation (the route stamps the hub's real path), then the page's merge
    const hubRow = { backend: 'claude', sessionId: 'bd-1', sessionKey: 'claude:bd-1', cwd: linked, realCwd: realW };
    const mergedFar = { ...hubRow, host: 'host-dial-far', hostName: 'far' }, mergedHere = { ...hubRow, host: null }, mergedLocalWord = { ...hubRow, host: 'local' };
    // B-55dc: the server's answer is read OFF the loop (the hub's realpath of the link): each row asked once, the reads landed
    for (const r of [mergedFar, mergedHere, mergedLocalWord]) serverSays(r);
    for (let k = 0; k < 12; k++) { await tg._mfacts.settled(); await new Promise((r) => setImmediate(() => setImmediate(r))); if (!tg._mfacts.busy() && !tg._mmTimer) break; }
    const board = boardBy(cwdsOf);
    const seen = [mergedFar, mergedHere, mergedLocalWord].map((r) => `${r.host || 'none'}: board ${board(r)} / server ${serverSays(r)}`);
    ok(board(mergedFar) === false && serverSays(mergedFar) === false && board(mergedHere) === true && serverSays(mergedHere) === true && board(mergedLocalWord) === true && serverSays(mergedLocalWord) === true,
      `B-df5f cure: over rows built as the page's merge builds them, the board ≡ the server — another machine's conversation through the hub's link is a member of NEITHER, the hub's own of BOTH ('local' is the hub) — ${seen.join(' · ')}`);
    // RED CONTROL: the page's rule before (the hub's real path for every row)
    const TMS = fs.readFileSync(path.join(REPO, 'src/task-membership.js'), 'utf8');
    const A = '  for (const c of [cwd, onOtherMachine(host) ? hostRealCwd : realCwd]) ';
    let red = null;
    if (ok(TMS.split(A).length === 2, 'the anchor of the control «hub-real-for-every-row» is in src/task-membership.js once')) {
      const { mutantCopies } = await import('./mutant-copy.mjs');
      const MUT = mutantCopies('member-index-board', REPO);
      const TMr = req(MUT.write('src/task-membership.js', editAnchor(TMS, A, '  for (const c of [cwd, realCwd]) ', "src/task-membership.js"), 'hub-real-for-every-row'));
      red = { board: boardBy(TMr.membershipCwds)(mergedFar), server: serverSays(mergedFar) };
    }
    ok(!!red && red.board === true && red.server === false, `RED CONTROL: the page's rule keeping the hub's real path for every row (the page before) — another machine's conversation: the board says member, the server not — ${JSON.stringify(red)}`);
    // B-16d7: another machine's conversation matched by ITS OWN machine's real folder (its discovery's R fact) — the live row
    // carries it (hostRealCwd), the store reads the same per-host map (hostRealOf): the board ≡ the server, BOTH member
    // THE MEETING B-16d7 × B-06de (lane bl-windows, line 59 moved onto int413): a HUB row gathers only the hub's conversations — another
    // machine's real folder matches that machine's OWN row (`host::/path`), so for these legs the group names the far machine's folder
    const keepCtx = tg._state.tasks['T-bd'].ctx;
    tg._state.tasks['T-bd'].ctx = [{ path: `host-dial-far::${D}`, tags: ['discover'] }]; tg._save();
    const farLive = { ...mergedFar, hostRealCwd: realW };
    // the BOARD half by the page's REAL rule on the SAME row the server judges (the move check's must 3): the far machine's own row —
    // folderOnHost first, then the folder test over the page's cwds (membershipCwds with the machine's real folder)
    const recFar = { path: rec.path, recursive: true, host: 'host-dial-far' };
    const boardHR = (row) => TM.folderOnHost(recFar, row.host) && TM.membershipCwds({ cwd: row.cwd, realCwd: row.realCwd, hostRealCwd: row.hostRealCwd, host: row.host }).some((c) => TM.insideFolder(c, recFar));
    const keepHR = tg._hostRealOf;
    tg._hostRealOf = (h, c) => (h === 'host-dial-far' && c === linked ? realW : null);
    const hr = { board: boardHR(farLive), server: serverSays(farLive) };
    tg._hostRealOf = () => null;   // RED CONTROL: the store with no machine-resolved folder (as released)
    const hr0 = { board: boardHR(farLive), server: tg.groupsForSession({ sessionKey: 'claude:bd-hr0', cwd: linked, hostId: 'host-dial-far' }).some((t) => t.id === 'T-bd') };
    tg._hostRealOf = keepHR;
    // the map moved (a sweep said the real folder): the store names the group it adds and fans the change out (onChange: the
    // exit re-judge, the roster) — the sites that kept a «not member» answer re-judge. THE LAW (the move check's must 2): a moved real
    // folder names ONLY the groups whose row is on THAT machine — a hub-only group (T-hub, the hub row D) is never named by the far
    // machine's pair, the far row's group (T-bd) is; and the mirror (the hub's own realpath move: T-hub named, T-bd not)
    tg._state.tasks['T-hub'] = { id: 'T-hub', title: 'hub', kind: 'task', createdAt: 2, sessions: [], ctx: [{ path: D, tags: ['discover'] }], progress: [] }; tg._save();
    const keepNotify = tg._notify; let notified = null;
    const namedBy = async (move) => { notified = null; move(); for (let k = 0; k < 4 && notified === null; k++) await new Promise((r) => setImmediate(r)); return notified || []; };
    tg._notify = (ids) => { notified = ids; };
    const farNamed = await namedBy(() => tg.hostRealMoved([[linked, realW]], 'host-dial-far'));
    const hubNamed = await namedBy(() => tg._memberMoved('realpath', linked, realW));   // the hub's own realpath (member-facts' road: no machine)
    tg._notify = keepNotify;
    delete tg._state.tasks['T-hub'];
    tg._state.tasks['T-bd'].ctx = keepCtx; tg._save();
    ok(gateOf(farNamed.includes('T-bd')) && !farNamed.includes('T-hub') && gateOf(hubNamed.includes('T-hub')) && !hubNamed.includes('T-bd'), `B-16d7 × B-06de: a machine's real folder that moved names the group it adds ON THAT MACHINE only — the far pair names T-bd (its own row), never T-hub (a hub row); the hub's own move names T-hub, never T-bd (far ${JSON.stringify(farNamed)} · hub ${JSON.stringify(hubNamed)})`);
    ok(hr.board === true && hr.server === true, `B-16d7: another machine's conversation at a link whose target is the group's folder, by ITS machine's real folder — on that machine's OWN row (B-06de: a hub row gathers the hub's only): the board AND the server say member — ${JSON.stringify(hr)}`);
    ok(hr0.board === true && hr0.server === false, `RED CONTROL (the store reading no machine-resolved folder, as released): the board says member, the server not ⇒ RED — ${JSON.stringify(hr0)}`);
  }
  // the row builder's guard: a row that names another machine is never stamped with the hub's real path
  const { withSessionKey } = req(path.join(REPO, 'src/routes/sessions.js'));
  if (ok(typeof withSessionKey === 'function', 'src/routes/sessions.js exports its row builder (withSessionKey)')) {
    const rowsOf = (W) => [W({ backend: 'claude', sessionId: 'bd-far', cwd: linked, host: 'host-dial-far' }), W({ backend: 'claude', sessionId: 'bd-here', cwd: linked })];
    const [far, here] = rowsOf(withSessionKey);
    ok(!far.realCwd && here.realCwd === realW, `B-df5f cure: the row builder stamps no hub real path on a row that names another machine (${JSON.stringify(far.realCwd || null)}), a row of the hub keeps its own (${JSON.stringify(here.realCwd || null)}) — a guard: no producer of the route makes such a row today`);
    const A = "const rc = namesOtherMachine(session) ? null : realCwdOf(session.cwd);";
    let red = null;
    if (ok(SRC.split(A).length === 2, 'the anchor of the control «hub-real-on-remote-row» is in src/sessions-assemble.js once')) {
      const { mutantCopies } = await import('./mutant-copy.mjs');
      const MUT = mutantCopies('member-index-rows', REPO);
      const copy = MUT.write('src/sessions-assemble.js', editAnchor(SRC, A, 'const rc = realCwdOf(session.cwd);', "src/sessions-assemble.js"), 'hub-real-on-remote-row');   // the checkpoint's line, on purpose — stale-pins: kept
      red = rowsOf(req(copy).withSessionKey)[0].realCwd || null;
    }
    ok(red === realW, `RED CONTROL: the row builder without the guard (the checkpoint) stamps the hub's real path on another machine's row — ${JSON.stringify(red)}`);
  }
}
const b = bench(REPO);
say(`THE BENCH at the owner's shape (7 Task Groups × 200 bound conversations, 6 discover rows, 36 live, ${36 * 300} asks): the walk ${b.walk.toFixed(2)} µs per ask, the index ${b.index.toFixed(2)} µs; a store write that moves nothing membership reads costs the next ask ${b.sigUs.toFixed(0)} µs (the signature)`);
ok(b.index < b.walk, `the index answers faster than the walk at the owner's shape (${b.index.toFixed(2)} < ${b.walk.toFixed(2)} µs)`);
say(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
