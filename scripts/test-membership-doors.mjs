#!/usr/bin/env node
// THE MEMBERSHIP ANSWER COSTS THE MAIN LOOP NO FILE CALL (B-55dc, from the owner's «the hub is laggy»). src/task-groups.js
// groupsForSession (THE DRAWING DOOR) answers from the last OFF-LOOP read of the file facts membership depends on (a discover
// row's kind, where a relative row resolves, a cwd's realpath — src/member-facts.js); groupsForSessionDecided (THE DECIDING
// DOOR, for what an agent is told or allowed) first waits, bounded, for the first read of every path the ask needs. Legs:
//   ① THE ORACLE: the release's answer (its own lines: membership's kind = _kindOf's statSync, the realpath = a
//     realpathSync — set back on an instance of this tree) against this tree's, record by record, over rooted / relative /
//     file / missing rows and a symlinked folder: on the DECIDING door at the FIRST ask of a store nothing was read in; on
//     the DRAWING door after one refresh. The drawing door's first answer differs ONLY where presence decides (named).
//   ② THE COUNT: synchronous fs calls on the main thread per ask = 0 on BOTH doors, at 10 groups and at 100 groups of 20
//     rows; RED control: the release's lines count them.
//   ③ THE BOUND: a stall PLACED in the reader (a SafeFs that never answers) — the deciding door answers when its bound
//     passes, with the «reading» answer, and the loop turned the whole time.
//   ④ THE NOTIFY: a first read that moves a membership sends ONE store signal; a first read that moves nothing sends none;
//     a store edit is seen at once (no refresh between).
//   ⑤ THE LAW «nobody loses anything on an answer still being read»: a conversation in a symlinked folder HOLDS an exit
//     forward through its group; the reader is stalled; the REAL re-judge (src/exit-proxy.js rejudgeAll) during the stall
//     keeps it; when the read lands the answer is the release's and ONE signal went out. RED: the same wiring without the
//     flag (the ids mapped plainly) drops the forward during the stall.
//   ⑥ a failed read is not a fact · ⑦ the settle fires with re-reads in flight (cure r1) · ⑧ THE CARRY: the four-row
//     scene of the coordinator's must against the release's answer, the settle of a failed first read, «unknown» at once
//     for a key in its back-off · ⑨ the no-inline form on a real SafeFs with no live worker (cure r2).
// Run: node scripts/test-membership-doors.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { TaskGroupManager, DECIDE_BOUND_MS } = require(path.join(REPO, 'src/task-groups.js'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-member-doors-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const { ok, report } = checker();

// ── a folder tree: dirs, a file, a missing path, a symlinked folder, a folder under home ─────────────────────────────────
const P = (...a) => path.join(ROOT, ...a);
const HOME = P('home');
for (const d of ['home/hsub/y', 'home/sub/q', 'A/sub/w', 'B/x', 'C']) fs.mkdirSync(P(d), { recursive: true });   // home/sub: the WIDE candidate of a relative 'sub' (cure r1, MUST 2)
fs.writeFileSync(P('F.txt'), 'x');
fs.symlinkSync(P('B'), P('L'));   // a cwd under L/ resolves into B/

// ONE REFRESH, to its end: a relative row reads its candidates in rounds (each landing starts the next), so «after one refresh»
// = until no read is in flight
const tick = () => new Promise((r) => setImmediate(() => setImmediate(r)));
async function refresh(tg) { for (let i = 0; i < 12; i++) { await tg._mfacts.settled(); await tick(); if (!tg._mfacts.busy() && !tg._mmTimer) return; } }   // no read in flight AND the store's landing flush ran
// a deciding ask whose bound timer is unref'd (the hub's loop keeps it alive; a suite's may not): the loop is held up to two
// bounds, so a door that WAITS its bound reports its red instead of ending the process on an unsettled await
const alive = (p) => { const h = setTimeout(() => { }, 2 * DECIDE_BOUND_MS); return p.finally(() => clearTimeout(h)); };
const ALL = [];   // every store this suite made (the count leg lets them all settle first: their landings run in its window)
let dn = 0;
function store(tasks, opts = {}) {
  const dataDir = P('data' + (++dn)); fs.mkdirSync(dataDir, { recursive: true });
  const signals = [];
  const tg = new TaskGroupManager({ dataDir, homeDir: HOME, onChange: (e) => signals.push(e), ...opts });
  tg._syncTaskMd = () => { };   // the mirror is not membership (and would write into the folders)
  tg._state.tasks = JSON.parse(JSON.stringify(tasks)); tg._save();
  signals.length = 0;
  ALL.push(tg);
  return { tg, signals };
}
// THE RELEASE'S LINES, set back on an instance of this tree: membership asked _kindOf (statSync for a local row) and a
// realpathSync per new cwd (cached) — the only two places this change moved
function releaseOf(tg) {
  tg._memberKindOf = (abs) => tg._kindOf(abs);
  tg._memberRes = (t) => tg._res(t);   // the release's foldersOf resolved EVERY row through _res (its sync stat)
  const cache = new Map();
  tg._realOf = (cwd, realCwd) => {
    let real = realCwd;
    if (!real && cwd) {
      if (cache.has(cwd)) real = cache.get(cwd);
      else { try { real = fs.realpathSync(cwd); } catch { real = null; } cache.set(cwd, real); }
    }
    return real;
  };
  return tg;
}
const row = (p, ...tags) => ({ path: p, tags });
const GROUPS = {
  'T-rooted':   { ctx: [row(P('A'), 'discover')] },                                   // a rooted folder
  'T-relprev':  { ctx: [row(P('A'), 'notes'), row('sub', 'discover')] },              // relative: the previous row's folder ⇒ A/sub
  'T-relhome':  { ctx: [row('hsub', 'discover')] },                                   // relative: home ⇒ home/hsub
  'T-relfile':  { ctx: [row(P('F.txt'), 'notes'), row('x', 'discover')] },            // relative after a FILE: its parent ⇒ ROOT/x (missing) … home/x (missing) ⇒ none
  'T-missing':  { ctx: [row(P('M'), 'discover')] },                                   // a missing rooted folder: matches by its string
  'T-file':     { ctx: [row(P('F.txt'), 'discover')] },                               // a FILE is no folder
  'T-linked':   { ctx: [row(P('B'), 'discover')] },                                   // the target of the symlinked cwd
  'T-first':    { ctx: [row(P('F.txt'), 'notes'), row(P('C'), 'notes'), row('w', 'discover')] },   // first = the first rooted DIR (C) ⇒ C/w (missing) … none
  'T-bound':    { ctx: [], sessions: ['claude:bound-1'] },                            // by its key
};
const tasksOf = (g) => Object.fromEntries(Object.entries(g).map(([id, x], i) => [id, { id, title: id, kind: 'task', createdAt: 1000 + i, archived: false, sessions: x.sessions || [], ctx: x.ctx }]));
const TASKS = tasksOf(GROUPS);
const ASKS = [
  { cwd: P('A/sub/w') }, { cwd: P('A') }, { cwd: P('L/x') }, { cwd: P('B/x') }, { cwd: path.join(HOME, 'hsub/y') },
  { cwd: P('M/z') }, { cwd: P('C') }, { cwd: '/opt/elsewhere' }, { sessionKey: 'claude:bound-1' },
  { sessionKey: 'claude:bound-1', cwd: P('L/x') }, { sessionKey: 'claude:none', cwd: P('A/sub/w'), initialGroupId: 'T-missing' },
  { cwd: P('L/x'), realCwd: P('B/x') },
  { cwd: P('home/sub/q') },   // cure r1 (MUST 2): T-relprev's 'sub' must never fall to the HOME candidate while its base /A is still being read
];
const view = (list) => JSON.stringify((list || []).map((t) => t));   // record by record, every field
const ids = (list) => (list || []).map((t) => t.id).join(',');

// ── ① THE ORACLE ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const rel = releaseOf(store(TASKS).tg);
  const bad = [], degraded = [], notSubset = [], unflagged = [];
  for (const a of ASKS) {
    const want = rel.groupsForSession(a);
    const mine = store(TASKS).tg;   // a store nothing was read in
    const got = await mine.groupsForSessionDecided(a);
    if (view(got) !== view(want)) bad.push(`${JSON.stringify(a)}: release [${ids(want)}] · decided [${ids(got)}]`);
    const fresh = store(TASKS).tg;
    const first = fresh.groupsForSession(a);
    if (ids(first) !== ids(want)) degraded.push(`${JSON.stringify(a)}: [${ids(first)}] → [${ids(want)}]`);
    // the «reading» answer can only UNDER-include: a conversation's folder is never a file nor a path that does not exist
    if (!first.every((t) => want.some((w) => w.id === t.id))) notSubset.push(`${JSON.stringify(a)}: [${ids(first)}] ⊄ [${ids(want)}]`);
    if (ids(first) !== ids(want) && !first.unread) unflagged.push(JSON.stringify(a));
    await refresh(fresh);
    const after = fresh.groupsForSession(a);
    if (view(after) !== view(want)) bad.push(`${JSON.stringify(a)} drawing after one refresh: release [${ids(want)}] · drawn [${ids(after)}]`);
  }
  ok(bad.length === 0, `the DECIDING door at the first ask, and the DRAWING door after one refresh, answer as the release — record by record, ${ASKS.length} asks over rooted / relative / file / missing rows and a symlinked folder`, bad);
  // the drawing door's first answer before any read: exactly the places presence decides (the named degradation)
  const want = [`{"cwd":"${P('A/sub/w')}"}`, `{"cwd":"${P('L/x')}"}`, `{"cwd":"${path.join(HOME, 'hsub/y')}"}`, `{"sessionKey":"claude:bound-1","cwd":"${P('L/x')}"}`, `{"sessionKey":"claude:none","cwd":"${P('A/sub/w')}","initialGroupId":"T-missing"}`];
  const seen = degraded.map((d) => d.slice(0, d.indexOf(': [')));
  ok(seen.length === want.length && want.every((w) => seen.includes(w)), `before its first read the DRAWING door differs only where presence decides — a relative row admits nothing until its bases and its candidate are read, the symlinked cwd matches without its realpath (${degraded.length} asks)`, degraded);
  ok(notSubset.length === 0, `every «reading» answer over the fixture is a SUBSET of the release's answer (${ASKS.length} asks) — a grant asked during a read is refused at worst, never given to a non-member`, notSubset);
  ok(unflagged.length === 0, 'every first answer that differs from the release carries the drawing door\'s `unread` flag (a revoking site can see it)', unflagged);
  // the release's own spellings held: a file is no folder, a missing rooted row is one, a relative row after a file finds none
  const r = (cwd) => ids(rel.groupsForSession({ cwd }));
  ok(r(P('F.txt')) === '' && r(P('M/z')) === 'T-missing' && r(P('A/sub/w')) === 'T-rooted,T-relprev' && r(P('L/x')) === 'T-linked' && r(path.join(HOME, 'hsub/y')) === 'T-relhome',
    'the fixture exercises each rule the oracle compares (file ⇒ none, missing ⇒ by its string, relative ⇒ prev / home, symlink ⇒ realpath)', { F: r(P('F.txt')), M: r(P('M/z')), A: r(P('A/sub/w')), L: r(P('L/x')) });
}

// ── ② THE COUNT ──────────────────────────────────────────────────────────────────────────────────────────────────────
const SYNC = ['statSync', 'lstatSync', 'fstatSync', 'realpathSync', 'existsSync', 'readdirSync', 'readFileSync', 'accessSync', 'openSync', 'readSync', 'opendirSync', 'readlinkSync'];
const real = {}; let counting = false, calls = 0; const where = [];
for (const k of SYNC) { real[k] = fs[k]; fs[k] = function (...a) { if (counting) { calls++; if (where.length < 6) where.push(k + ' ' + String(a[0]).slice(-40)); } return real[k].apply(this, a); }; }
real.native = fs.realpathSync.native;
fs.realpathSync.native = function (...a) { if (counting) calls++; return real.native.apply(this, a); };
function bigTasks(n) {
  const out = {};
  for (let g = 0; g < n; g++) {
    const base = P('big', 'g' + g);
    const ctx = [];
    for (let i = 0; i < 20; i++) {
      const d = path.join(base, 'r' + i);
      if (i < 18) fs.mkdirSync(d, { recursive: true });
      ctx.push(i % 5 === 4 ? row('r' + i, 'discover') : row(d, i % 3 ? 'discover' : 'notes'));   // rooted rows + relative ones, two missing
    }
    out['T-big' + g] = { id: 'T-big' + g, title: 'g' + g, kind: 'task', createdAt: 5000 + g, archived: false, sessions: [], ctx };
  }
  return out;
}
async function countAsks(tg, n, door) {
  const asks = Array.from({ length: 40 }, (_, i) => ({ sessionKey: 'claude:k' + (i % 7), cwd: P('big', 'g' + (i % n), 'r' + (i % 18), 'deep') }));
  let c = 0;
  for (const a of asks) {
    counting = true; calls = 0;
    if (door === 'decided') { const p = tg.groupsForSessionDecided(a); counting = false; c += calls; counting = true; calls = 0; await p; c += calls; }
    else tg.groupsForSession(a);
    counting = false; c += door === 'decided' ? 0 : calls;
  }
  return { c, asks: asks.length };
}
for (const tg of ALL) await refresh(tg);   // no landing of an earlier store may run inside a counted window
for (const n of [10, 100]) {
  const T = bigTasks(n);
  const sd = store(T).tg, sc = store(T).tg, warm = store(T).tg;
  for (const tg of [sd, sc, warm]) await refresh(tg);   // their boot reads (the store's own priming) land before the count
  sd._mfacts.clear(); sc._mfacts.clear(); warm._mfacts.clear();   // …then nothing read: the first asks are counted from cold
  const draw = await countAsks(sd, n, 'draw');
  await refresh(sd);
  const dec = await countAsks(sc, n, 'decided');
  await refresh(sc);
  await countAsks(warm, n, 'decided'); await refresh(warm);
  const again = await countAsks(warm, n, 'draw');
  ok(draw.c === 0 && dec.c === 0 && again.c === 0, `${n} groups × 20 rows: synchronous fs calls on the main thread per ask = 0 — the drawing door (first asks and after a refresh) and the deciding door (${draw.asks} asks each)`, { draw: draw.c, decided: dec.c, again: again.c, where });
  const rtg = store(T).tg; await refresh(rtg); releaseOf(rtg);
  const rel = await countAsks(rtg, n, 'draw');
  ok(rel.c > 0, `CONTROL (${n} groups): the release's lines make ${rel.c} synchronous fs calls over the same ${rel.asks} asks — the count can see one`, { where });
}
for (const k of SYNC) fs[k] = real[k];
fs.realpathSync.native = real.native;

// ── ③ THE BOUND (a stall PLACED in the reader, never load) ────────────────────────────────────────────────────────────
{
  const stalled = { call: () => new Promise(() => { }) };   // a mount that never answers
  const { tg } = store(TASKS, { mirrorFs: () => stalled });
  let ticks = 0; const iv = setInterval(() => { ticks++; }, 5);
  const t0 = performance.now();
  const BOUND = 300;   // the bound the suite HANDS the deciding door (the wall-clock census: a const handed to the mechanism × a slack)
  const got = await tg.groupsForSessionDecided({ cwd: P('A/sub/w') }, { boundMs: BOUND });
  const ms = performance.now() - t0; clearInterval(iv);
  ok(ms >= BOUND - 5 && ms < 2 * BOUND && ids(got) === ids(tg.groupsForSession({ cwd: P('A/sub/w') })) && ids(got) === 'T-rooted', `the deciding door answers when its bound passes (${Math.round(ms)} ms for a ${BOUND} ms bound) with the «reading» answer [${ids(got)}]`);
  ok(ticks >= 30, `…and the loop turned the whole time (${ticks} timer turns of 5 ms during the wait) — the release held the whole hub for as long as the mount hung`);
  ok(tg.memberIndexStats().bounded === 1, 'the store counts the ask that met its bound', tg.memberIndexStats());
  ok(DECIDE_BOUND_MS === 1500, `the production bound is DECIDE_BOUND_MS = ${DECIDE_BOUND_MS} ms (chosen from the measured first read, docs/kb-file-structure.md)`);
}

// ── ④ THE NOTIFY ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const flush = tick;
  const moving = store(tasksOf({ 'T-relprev': GROUPS['T-relprev'] }));
  await refresh(moving.tg); moving.tg._mfacts.clear(); moving.signals.length = 0;   // the boot's priming landed; then cold
  const a = { cwd: P('A/sub/w') };
  const before = ids(moving.tg.groupsForSession(a));
  await refresh(moving.tg);
  const after = ids(moving.tg.groupsForSession(a));
  ok(before === '' && after === 'T-relprev' && moving.signals.length === 1 && Array.isArray(moving.signals[0].ids) && moving.signals[0].ids.join() === 'T-relprev', `a first read that MOVES a membership (the relative row's folder) sends ONE store signal naming its group (${JSON.stringify(moving.signals)}) — [${before}] → [${after}]`, moving.signals);
  const still = store(tasksOf({ 'T-rooted': GROUPS['T-rooted'] }));
  await refresh(still.tg); still.tg._mfacts.clear(); still.signals.length = 0;
  still.tg.groupsForSession(a); await refresh(still.tg);
  ok(still.signals.length <= 1 && still.signals.every((e) => Array.isArray(e.ids) && e.ids.length === 0) && ids(still.tg.groupsForSession(a)) === 'T-rooted',
    `a first read that moves nothing (a rooted folder: «reading» already counted it) names no group — at most the one settle signal the KEEPING sites re-judge on, nothing broadcast (${JSON.stringify(still.signals)})`, still.signals);
  const link = store(tasksOf({ 'T-linked': GROUPS['T-linked'] }));
  await refresh(link.tg); link.tg._mfacts.clear(); link.signals.length = 0;
  const b0 = ids(link.tg.groupsForSession({ cwd: P('L/x') })); await refresh(link.tg);
  ok(b0 === '' && ids(link.tg.groupsForSession({ cwd: P('L/x') })) === 'T-linked' && link.signals.length === 1, `a symlinked cwd's realpath landing sends ONE signal (${link.signals.length}), then the cwd is a member`, link.signals);
  // a person's own edit through the store is seen at once — no refresh between
  const ed = store(TASKS).tg;
  ed.groupsForSession({ sessionKey: 'claude:new' });
  ed.update('T-rooted', { sessions: ['claude:new'] });
  ok(ids(ed.groupsForSession({ sessionKey: 'claude:new' })) === 'T-rooted', 'a store edit (a session bound) is seen at the very next ask');
}

// ── ⑥ A FAILED READ IS NOT A FACT (cure r1, MUST 1): a realpath whose read FAILS (a worker timeout) stays UNKNOWN — flagged,
//      said in the journal by name, read again after a back-off — and then answers as the release; an ENOENT is a fact ──
{
  const MF = require(path.join(REPO, 'src/member-facts.js'));
  const logs = [];
  let calls = 0;
  const flaky = { call: async (op, payload) => { if (op === 'realpath' && payload.path === P('L/x') && ++calls === 1) throw Object.assign(new Error('timed out'), { safeFsTimeout: true }); if (op === 'realpath') return { path: await fs.promises.realpath(payload.path) }; const st = await fs.promises.stat(payload.path); return { isDirectory: st.isDirectory(), isFile: st.isFile() }; } };
  const { tg, signals } = store(tasksOf({ 'T-linked': GROUPS['T-linked'] }), { mirrorFs: () => flaky });
  tg._mfacts = MF.create({ reader: () => flaky, onMoved: (op, p, v) => tg._memberMoved(op, p, v), log: (m) => logs.push(m), backoffMs: 30 });
  const a = { cwd: P('L/x') };
  const g0 = tg.groupsForSession(a);
  await refresh(tg);
  const g1 = tg.groupsForSession(a);   // the read failed: still unknown, still flagged — never «no realpath» for good
  ok(ids(g0) === '' && ids(g1) === '' && g1.unread === true && tg._mfacts.unknown() === 1 && logs.some((l) => l.includes(`realpath of ${P('L/x')} could not be read (timeout) — UNKNOWN`)),
    'a realpath read that TIMES OUT is UNKNOWN, not «no realpath»: the answer stays flagged, the journal names the path and the failure', { g1: ids(g1), unread: g1.unread, logs });
  await new Promise((r) => setTimeout(r, 40)); tg.groupsForSession(a); await refresh(tg);   // past the back-off the next ask reads again
  const g2 = tg.groupsForSession(a);
  ok(ids(g2) === 'T-linked' && !g2.unread && calls === 2 && logs.some((l) => l.includes('read again after 1 failure(s)')) && signals.some((e) => Array.isArray(e.ids) && e.ids.join() === 'T-linked'),
    `…read again after its back-off it answers as the release [${ids(g2)}], the recovery said, ONE signal naming the group it added`, { g2: ids(g2), calls, logs, signals });
  const gone = store(tasksOf({ 'T-linked': GROUPS['T-linked'] }), { mirrorFs: () => ({ call: async (op) => { throw Object.assign(new Error('no such file'), { code: 'ENOENT' }); } }) });
  gone.tg.groupsForSession({ cwd: P('L/y') }); await refresh(gone.tg);
  ok(gone.tg._mfacts.real(P('L/y')) === null && gone.tg._mfacts.unknown() === 0, 'an ENOENT is a FACT (no realpath — the release\'s throwing realpathSync), kept, never retried');
}

// ── ⑦ THE SETTLE FIRES (cure r1, MUST 3): the landing that completes a flagged answer sends the settle signal even while the
//      re-derive's own RE-READS of known facts are in flight (only first reads hold it) ──
{
  let hold = false; const held = [];
  const reader = { call: (op, payload) => { const go = async () => { if (op === 'realpath') return { path: await fs.promises.realpath(payload.path) }; const st = await fs.promises.stat(payload.path); return { isDirectory: st.isDirectory(), isFile: st.isFile() }; }; return hold && op === 'stat' ? new Promise((res, rej) => held.push(() => go().then(res, rej))) : go(); } };
  const MF = require(path.join(REPO, 'src/member-facts.js'));
  let skew = 0; const clock = () => Date.now() + skew;
  const { tg, signals } = store(tasksOf({ 'T-relprev': GROUPS['T-relprev'] }), { mirrorFs: () => reader });
  tg._mfacts = MF.create({ reader: () => reader, onMoved: (op, p, v) => tg._memberMoved(op, p, v), now: clock });
  tg.groupsForSession({ cwd: P('M/z') }); await refresh(tg); signals.length = 0;   // the rows read
  skew = 5000; hold = true;                    // the rows' facts are now OLD: the next asks re-read them, and those re-reads hang
  tg._mresCache && tg._mresCache.clear(); tg._rowsUnread = null;   // the store's derive caches run on the real clock: re-derive now
  const b = { cwd: P('C/w2') };                // a NEW cwd: its realpath is a FIRST read, the answer handed out flagged
  const ans = tg.groupsForSession(b);
  await new Promise((r) => setTimeout(r, 30));
  const reReads = tg._mfacts.busy() - tg._mfacts.pending();
  ok(ans.unread === true && reReads > 0 && signals.length === 1 && Array.isArray(signals[0].ids) && signals[0].ids.length === 0,
    `the realpath landed while ${reReads} RE-READ(s) of known facts were still in flight: the settle signal went out anyway (${JSON.stringify(signals)}) — only first reads hold it`, { unread: ans.unread, reReads, signals });
  for (const f of held.splice(0)) f();
}

// ── ⑧ THE CARRY (cure r2, the coordinator's law «unknown is carried forward by every row resolved over it»): the four-row
//      scene of the must, as written — [1] /B rooted (a dir, read) · [2] /A rooted (its stat TIMES OUT: UNKNOWN through
//      its back-off) · [3] x relative, NOT discover · [4] sub relative discover; on disk /A/x/sub AND /B/x/sub; the ask
//      under the WRONG base, /B/x/sub/q — and the second must's shape (a notes row between an unread rooted row and a
//      relative discover row). THE ORACLE = the release's answer: during the read and through the back-off every answer
//      is a SUBSET of it, flagged; once read, equal. The same scene drives the shoulds taken: a first read that FAILS
//      sends the settle; a key in its back-off answers «unknown» AT ONCE on the deciding door, never the whole bound ──
{
  for (const d of ['S/A/x/sub/q', 'S/B/x/sub/q', 'W/a/docs/x/q', 'W/b/docs/x/q']) fs.mkdirSync(P(d), { recursive: true });
  const SCENE = tasksOf({
    'T-four': { ctx: [row(P('S/B'), 'notes'), row(P('S/A'), 'notes'), row('x', 'notes'), row('sub', 'discover')] },
    'T-w':    { ctx: [row(P('W/a'), 'notes'), row(P('W/b'), 'discover'), row('docs', 'notes'), row('x', 'discover')] },
  });
  const ASK8 = [{ cwd: P('S/B/x/sub/q') }, { cwd: P('S/A/x/sub/q') }, { cwd: P('W/a/docs/x/q') }, { cwd: P('W/b/docs/x/q') }];
  const rel = releaseOf(store(SCENE).tg);
  const want = ASK8.map((a) => rel.groupsForSession(a));
  ok(ids(want[0]) === '' && ids(want[1]) === 'T-four' && ids(want[2]) === '' && ids(want[3]) === 'T-w',
    `the release places the scene's relative rows under the base being read (/A/x/sub, /W/b/docs/x): [${want.map(ids).join('] [')}]`);
  const MF = require(path.join(REPO, 'src/member-facts.js'));
  const SLOW = new Set([P('S/A'), P('W/b')]);
  const parked = [], live = new Set(), logs = [];
  let up = false, skew = 0;
  const readNow = async (op, p) => { if (op === 'realpath') return { path: await fs.promises.realpath(p) }; const st = await fs.promises.stat(p); return { isDirectory: st.isDirectory(), isFile: st.isFile() }; };
  const reader = { call: (op, payload) => {
    if (op === 'stat' && SLOW.has(payload.path) && !up) return new Promise((res, rej) => parked.push(() => rej(Object.assign(new Error('timed out'), { safeFsTimeout: true }))));
    const pr = readNow(op, payload.path); live.add(pr); pr.then(() => live.delete(pr), () => live.delete(pr)); return pr;
  } };
  let rd = { call: () => new Promise(() => { }) };   // the boot's priming reads go nowhere: the leg's own facts start cold
  const { tg, signals } = store(SCENE, { mirrorFs: () => rd });
  rd = reader;
  tg._mfacts = MF.create({ reader: () => rd, onMoved: (op, p, v) => tg._memberMoved(op, p, v), log: (m) => logs.push(m), now: () => Date.now() + skew });
  // «quiet» with reads parked: every read that is not parked has landed and the store's landing flush ran (no settled():
  // it would wait for the parked ones)
  const quiet = async () => { for (let i = 0; i < 40; i++) { if (live.size) await Promise.allSettled([...live]); await tick(); if (!live.size && !tg._mmTimer) return; } };
  for (const a of ASK8) tg.groupsForSession(a);
  await quiet();
  const during = ASK8.map((a) => tg.groupsForSession(a));
  const wide = (got) => ASK8.map((a, i) => (got[i].every((t) => want[i].some((w) => w.id === t.id)) ? null : `${a.cwd.slice(ROOT.length)}: [${ids(got[i])}] ⊄ release [${ids(want[i])}]`)).filter(Boolean);
  const unflag = (got) => ASK8.filter((a, i) => ids(got[i]) !== ids(want[i]) && !got[i].unread).map((a) => a.cwd.slice(ROOT.length));
  ok(parked.length === 2 && wide(during).length === 0 && unflag(during).length === 0,
    `while /A and /W/b are still being read, the relative rows resolved over them carry «unknown» — whatever their tag — and no answer is wider than the release's (${parked.length} reads parked)`, { wide: wide(during), unflagged: unflag(during), during: during.map(ids) });
  const before = signals.length;
  for (const f of parked.splice(0)) f();   // the two stats TIME OUT: UNKNOWN, backing off
  await quiet();
  const after = ASK8.map((a) => tg.groupsForSession(a));
  ok(wide(after).length === 0 && unflag(after).length === 0 && tg._mfacts.unknown() === 2 && logs.filter((l) => l.includes('could not be read (timeout) — UNKNOWN')).length === 2,
    'through the back-off of a timed-out base (the must\'s own scene) the answer stays a subset, flagged; the journal names both failures', { wide: wide(after), logs });
  const settle = signals.slice(before);
  ok(settle.length === 1 && Array.isArray(settle[0].ids) && settle[0].ids.length === 0,
    `a first read that FAILS sends the settle (${JSON.stringify(settle)}): the sites that kept on «still being read» re-judge now, not at the next ask`, settle);
  const t0 = performance.now();
  const dec = await alive(tg.groupsForSessionDecided(ASK8[0]));
  const ms = performance.now() - t0, st = tg.memberIndexStats();
  ok(st.unknownNow === 1 && st.bounded === 0 && ms < DECIDE_BOUND_MS && ids(dec) === '' && dec.unread === true,
    `a key in its back-off with no read in flight: the deciding door answers «unknown» AT ONCE (${Math.round(ms)} ms, never its ${DECIDE_BOUND_MS} ms bound) — a subset, flagged`, { st, ms, dec: ids(dec) });
  up = true; skew = 1500;   // past the back-off the mount answers: the next DECIDING ask reads again (the drawing door's derive is kept 4 s)
  const fresh = await Promise.all(ASK8.map((a) => tg.groupsForSessionDecided(a)));
  await refresh(tg);
  const read = ASK8.map((a) => view(tg.groupsForSession(a)));
  ok(read.every((v, i) => v === view(want[i])) && fresh.every((g, i) => view(g) === view(want[i])) && tg._mfacts.unknown() === 0,
    `once /A and /W/b are read, both doors answer as the release, record by record: [${ASK8.map((a, i) => ids(fresh[i])).join('] [')}]`, { read, want: want.map(view) });
}

// ── ⑨ THE NO-INLINE FORM ITSELF (cure r2): a REAL SafeFs whose worker never starts (no live worker, ever) refuses a
//      `noInline` call by name and never runs its inline door; the CONTROL — the same pool asked plainly — runs inline;
//      and a store whose mirror is that pool reads membership through it: UNKNOWN, flagged, said, the inline door untouched ──
{
  const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
  let inl = 0;
  const inlineRun = (op, payload) => { inl++; const st = fs.statSync(payload.path); return { result: { isDirectory: st.isDirectory(), isFile: st.isFile() } }; };
  const sf = new SafeFs({ workerPath: 'no-such-worker.js', poolSize: 1, inlineRun });   // not a worker path: the pool never gets a live worker
  let refused = null;
  try { await sf.call('stat', { path: P('A') }, { noInline: true }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'no-worker' && inl === 0, `SafeFs.call(…, { noInline: true }) with no live worker is refused by name (${refused && refused.code}), the inline door never run (${inl})`);
  const plain = await sf.call('stat', { path: P('A') });
  ok(inl === 1 && plain && plain.isDirectory === true, `CONTROL: the same pool asked without noInline runs the op inline on the main thread (${inl}) — the rig really has no worker`);
  inl = 0;
  const said = [], keep = console.log;
  console.log = (...a) => { if (String(a[0]).startsWith('[task-groups]')) said.push(a.join(' ')); else keep(...a); };
  try {
    const { tg } = store(tasksOf({ 'T-relprev': GROUPS['T-relprev'] }), { mirrorFs: () => sf });   // the store's OWN facts (the constructor's wiring)
    const a = { cwd: P('A/sub/w') };
    tg.groupsForSession(a); await refresh(tg);
    const g = tg.groupsForSession(a);
    const d = await alive(tg.groupsForSessionDecided(a));
    ok(inl === 0 && ids(g) === '' && g.unread === true && ids(d) === '' && tg.memberIndexStats().unknownNow === 1 && tg._mfacts.unknown() > 0 && said.some((l) => l.includes('could not be read (no-worker)')),
      `a store whose mirror is that pool: membership's facts are UNKNOWN (said: no-worker), the answer a flagged subset at once on both doors, the inline door run ${inl} times`, { inl, g: ids(g), said });
  } finally { console.log = keep; sf.close(); }
}

// ── ⑤ THE LAW: nobody loses anything on an answer still being read (the REAL exit re-judge, a stand-in holder) ─────────
{
  const flush = () => new Promise((r) => setImmediate(() => setImmediate(r)));
  const { ExitProxyManager } = require(path.join(REPO, 'src/exit-proxy.js'));
  const ACCESS = { use: { mode: 'only', who: [{ kind: 'group', id: 'T-linked' }] }, run: { mode: 'nobody' } };
  async function leg(withFlag) {
    let release = () => { };
    const gate = new Promise((r) => { release = r; });
    // the stall PLACED in the reader: a SafeFs stand-in that answers only when the leg releases it
    const reader = { call: async (op, payload) => { await gate; if (op === 'realpath') return { path: await fs.promises.realpath(payload.path) }; const st = await fs.promises.stat(payload.path); return { isDirectory: st.isDirectory(), isFile: st.isFile() }; } };
    const st = store(tasksOf({ 'T-linked': GROUPS['T-linked'] }), { mirrorFs: () => reader });
    const sessions = new Map([['w-held', { name: 'held', backend: 'claude', claudeSessionId: 'c-held', cwd: P('L/x') }]]);
    const facts = (s) => ({ sessionKey: 'claude:c-held', cwd: s.cwd });
    // server.js's wiring (tasks.memberIds), and the RED form: the same answer's ids mapped plainly (the flag gone)
    const groupsOf = withFlag ? (s) => st.tg.memberIds(facts(s)) : (s) => st.tg.groupsForSession(facts(s)).map((g) => g.id);
    const ex = new ExitProxyManager({ hosts: { list: () => [] }, log: () => { }, sessionsMap: () => sessions, groupsOf, grants: () => null });
    ex.access = () => ACCESS; ex.stop = async () => { }; ex._dropCred = () => { };
    ex._live.set('h1', { users: new Set(['w-held']), creds: new Map(), bySession: new Map(), sockets: new Set() });
    const during = ex.rejudgeAll('task-groups');
    const keptDuring = !!ex._live.get('h1') && ex._live.get('h1').users.has('w-held');
    release(); await refresh(st.tg);
    const after = withFlag ? ex.rejudgeAll('task-groups') : null;
    return { keptDuring, stoppedDuring: during.stopped.length, keptAfter: !!ex._live.get('h1') && ex._live.get('h1').users.has('w-held'), stoppedAfter: after ? after.stopped.length : -1, signals: st.signals.length, answer: ids(st.tg.groupsForSession(facts({ cwd: P('L/x') }))) };
  }
  const law = await leg(true);
  ok(law.keptDuring && law.stoppedDuring === 0, `during the stall the real exit re-judge KEEPS the forward of a conversation in a symlinked folder (${law.stoppedDuring} stopped)`, law);
  ok(law.answer === 'T-linked' && law.signals === 1 && law.keptAfter && law.stoppedAfter === 0, `when the read lands: the release's answer [${law.answer}], ONE store signal (${law.signals}), and the re-judge at that signal keeps it`, law);
  const red = await leg(false);
  ok(!red.keptDuring && red.stoppedDuring === 1, `RED: the same wiring without the flag DROPS the forward during the stall (${red.stoppedDuring} stopped)`, red);
}

report();
