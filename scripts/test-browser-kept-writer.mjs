#!/usr/bin/env node
// test-browser-kept-writer — lane bl-loop-b, B-0248 step 2 unit 2 (主开发 r3320 / r4232): THE KEPT BROWSERS' LIST IS THE STORE WRITER's.
// src/server/browser-kept.js wrote data/browser-kept.json (0600) by a temp + rename ON THE LOOP at every act and every 30 s while a kept
// browser's tabs moved (the page bl-loop-b/b0248-page.md, row 4); now its temp, write and rename are the store writer's, on its thread.
// FAST, in-process: the REAL kept store over a scratch data folder (a keeper that runs nothing), a writer of the leg's own (or a stand-in
// thread running the real writeJob, scripts/fixtures/store-stand-writer.cjs, where a write must be held); stalls PLACED in the main
// thread's own fs calls (scripts/fixtures/fs-stall.cjs), never load. Each leg with its RED (a copy of the module, scripts/mutant-copy.mjs):
//   ① an act under a 300 ms stall in every main-thread write under the data folder: NO write of the list stalled, the list on disk after
//     (0600). RED: the release's write at the call.
//   ② HELD (r3006 / r3585): a write OWED when a hold begins is never written over the list — its producer refuses (EHELD, kept owed).
//     RED: a producer that does not ask the hold.
//   ③ the tabs' 30 s: OWED meanwhile (the writer's debounce), so the hub's exit writes them. RED: the release's own timer — nothing owed at
//     the exit, the tabs lost (the store's shutdown, the only flush of that timer, has no caller in the hub).
//   ④ the person's Forget answers once the list is ON DISK (as the release's synchronous write was). RED: an answer before the landing.
//   ⑤ a second store over the file in ONE process, built while a write is owed, reads the owed bytes. RED: the owed bytes unread.
//   LINE 961's ROUND (主开发 r4278, the must — the writer keeps ONE debounce a file and the last call sets it): an act's write, once owed,
//   is never due later because of a tabs save.
//   ⑥ an act (a new row), then a tabs change inside the floor: the list is on disk with the act's row within the bound (the floor is
//     500 ms; the bound 2 s, said). CONTROL (the cure's line blinded: the tabs save always 30 s): the row is not on disk at the bound.
//   ⑦ the reverse: a remover's dropped row (an adopt), then a tabs change inside the floor: the file no longer names the folder within
//     the bound. CONTROL (blinded): the file still names it at the bound.
//   LINE 964's ROUND (r4283): the POSITIVE legs wait a generous 10 s bound (anything well under 30 s tells the floor from the tabs' 30 s;
//   a miss there says a HARNESS line by name: a loaded machine, not the product); the controls keep their 2 s bound.
//   ⑧ a PEEK (a second store built over the file in one process reads the writer's owed bytes — the producer runs, nothing is written)
//     does not mark the owed act taken: a tabs save after it still keeps the floor. RED: a producer that marks on a peek too.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const ROOT = scratchDir('browser-kept-writer');
const M = mutantCopies('browser-kept-writer', REPO);
const KS_REL = 'src/server/browser-kept.js';
const KSRC = fs.readFileSync(path.join(REPO, KS_REL), 'utf8');
const KS = require(path.join(REPO, KS_REL));
const KB = require(path.join(REPO, 'src/browser-kept.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const STALL = require(path.join(REPO, 'scripts/fixtures/fs-stall.cjs'));
const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs'));
const quiet = { log() { }, warn() { }, error() { } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = performance.now(); while (!f()) { if (performance.now() - t0 > ms) return false; await sleep(5); } return true; };
const KEYS = ['bk-0000a011', 'bk-0000b012'], K3 = 'bk-0000c013';
const GOOD = JSON.stringify({ version: 1, entries: Object.fromEntries(KEYS.map((k) => [k, { hasDir: true, tabs: [{ url: 'https://mail.example/' }], lastUsedAt: 1000 }])) });
const stoppedKeeper = () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, registeredDirs: () => [], list: () => ({ profiles: [] }) });
let wn = 0;
/** a data folder holding the list GOOD and each kept browser's profile folder (its sign-ins) */
const world = () => {
  const dir = path.join(ROOT, `w${++wn}`), file = path.join(dir, KB.KEPT_FILE);
  for (const k of KEYS) { fs.mkdirSync(path.join(dir, 'browser-profiles', k), { recursive: true }); fs.writeFileSync(path.join(dir, 'browser-profiles', k, 'Cookies'), 'a sign-in'); }
  fs.writeFileSync(file, GOOD);
  return { dir, file };
};
const mk = (Mod, dir, writer) => Mod.create({ dataDir: dir, keeper: stoppedKeeper, liveKeys: () => new Set(), log: quiet, sweepEveryMs: 0, thereEveryMs: 0, writer });
const rows = (file) => { try { return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).entries || {}); } catch { return null; } };
const stopHold = (S) => { try { S._hold.stop(); } catch { } };
/** the release's write AT THE CALL (its temp + rename on the loop), as a writer */
const atTheCall = { dirty: (file, o) => { const tmp = file + '.tmp'; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(tmp, o.produce(), o.mode != null ? { mode: o.mode } : undefined); fs.renameSync(tmp, file); }, durable: async () => true, owed: () => null, pending: () => false };

console.log('① B-0248 unit 2: an act of the kept list never waits for its write (a placed stall in the main thread\'s writes)');
{
  const STALL_MS = 300;
  const scene = async ({ release = false } = {}) => {
    const w = world(), W = SW.create({ log: quiet });
    try {
      const S = mk(KS, w.dir, release ? atTheCall : W);
      S.has(KEYS[0]);   // the list read
      const Sx = STALL.install({ under: w.dir, ms: STALL_MS });
      const t0 = performance.now(); let held = null;
      try { S.noteStart(K3, { hasDir: false, label: 'a leg\'s browser' }); } finally { held = Math.round(performance.now() - t0); Sx.restore(); }
      const listStalls = Sx.calls.filter((c) => c.kind === 'write' && c.stalled && c.path.startsWith(KB.KEPT_FILE));
      const landed = await S.whenWritten();
      let mode = null; try { mode = fs.statSync(w.file).mode & 0o777; } catch { }
      stopHold(S);
      return { held, stalled: listStalls.length, fns: [...new Set(listStalls.map((c) => c.fn))], landed, rows: rows(w.file), mode };
    } finally { W.stop(); }
  };
  const A = await scene();
  ok(A.stalled === 0 && A.landed && A.rows && A.rows.includes(K3) && A.rows.length === 3 && A.mode === 0o600, `① THE PLACED STALL (${STALL_MS} ms in every main-thread write under the data folder): the act wrote NOTHING of the list on the loop; the list on disk after it (three rows, 0600)`, A);
  const AX = await scene({ release: true });
  ok(AX.stalled >= 2 && AX.held >= STALL_MS, `① RED control (the release's write at the call): the act held the loop ${AX.held} ms (${AX.stalled} writes of the list stalled: ${AX.fns.join(', ')}) (red)`, AX);
}

console.log('② HELD: a write OWED when a hold begins is never written over the list (its producer refuses: EHELD)');
{
  const NO_ASK = (src) => anchored(src, "produce: () => { if (isHeld()) throw namedError('EHELD',", "produce: () => { if (false) throw namedError('EHELD',", 'a-producer-that-does-not-ask-the-hold');
  const scene = async (Mod) => {
    const w = world(), W = SW.create({ log: quiet });
    try {
      const S = mk(Mod, w.dir, W);
      S.has(KEYS[0]);
      S.noteStart(K3, { hasDir: false, label: 'owed' });   // a change owed to the writer…
      const owed = W.pending(w.file);
      S._hold.start({ state: 'unreadable', error: { code: 'EIO' } });   // …and a hold begins in the same turn (as a rebuild that does not finish holds again)
      const tried = await until(() => { const r = W.stats().find((x) => x.file === w.file); return !!r && (r.failures >= 1 || r.writes >= 1); });
      const same = fs.readFileSync(w.file, 'utf8') === GOOD;
      stopHold(S);
      return { owed, tried, same };
    } finally { W.stop(); }
  };
  const B = await scene(KS);
  ok(B.owed && B.tried && B.same, '② HELD WITH A WRITE OWED: the writer\'s attempt came and its producer refused (EHELD) — the list on disk is the bytes it held, nothing written over them', B);
  const BX = await scene(M.load(KS_REL, NO_ASK(KSRC), 'no-ask'));
  ok(BX.owed && BX.tried && !BX.same, '② RED control (a producer that does not ask the hold): the owed write landed over the held list (red)', BX);
}

console.log('③ the tabs\' 30 s: OWED meanwhile (the writer\'s debounce), so the hub\'s exit writes them');
{
  const OWN_TIMER = (src) => anchored(src, '  function saveSoon() {\n', '  let __t = null; function saveSoon() { if (__t) return; __t = setTimeout(() => { __t = null; save(); }, PERSIST_TABS_MS); if (__t.unref) __t.unref(); return;\n', 'the-release-own-30s-timer');
  const scene = async (Mod) => {
    const w = world(), W = SW.create({ log: quiet });
    try {
      const S = mk(Mod, w.dir, W);
      S.noteStart(K3, { hasDir: false, label: 'tabs' });
      await S.whenWritten();   // the start's row on disk
      S.noteTabs(K3, [{ targetId: 't1', url: 'https://tabs.example/', title: 'Tabs', active: true }]);
      const tabsOf = () => { try { return (JSON.parse(fs.readFileSync(w.file, 'utf8')).entries[K3].tabs || []).length; } catch { return null; } };
      const before = tabsOf(), owed = W.pending(w.file);
      W.beginExit(); W.exitFlush();   // the hub's stop (server.js shutdown): the writer's exit, in the same synchronous run
      const after = tabsOf();
      stopHold(S);
      return { before, owed, after };
    } finally { W.stop(); }
  };
  const C = await scene(KS);
  ok(C.before === 0 && C.owed && C.after === 1, '③ THE TABS AT A STOP: owed to the writer (due 30 s on, not yet on disk), and the writer\'s exit wrote them', C);
  const CX = await scene(M.load(KS_REL, OWN_TIMER(KSRC), 'own-timer'));
  ok(CX.before === 0 && !CX.owed && CX.after === 0, '③ RED control (the release\'s own 30 s timer): nothing owed at the exit — the moving tabs lost at a stop (red)', CX);
}

console.log('④ the person\'s Forget answers once the list is ON DISK');
{
  const EARLY = (src) => anchored(src, '    const listSaved = await whenWritten();\n', '    const listSaved = true;\n', 'an-answer-before-the-landing');
  const scene = async (Mod) => {
    const w = world(), ctl = path.join(ROOT, `ctl${++wn}`), St = STAND.make(ctl);
    St.hold(KB.KEPT_FILE, 600);   // the list's write held on its thread
    const W = SW.create({ log: quiet, workerPath: St.path });
    try {
      const S = mk(Mod, w.dir, W);
      S.has(KEYS[0]);
      let r = null, err = null; try { r = await S.forget(KEYS[0]); } catch (e) { err = e && (e.code || e.message); }
      const atAnswer = rows(w.file);
      St.unhold(KB.KEPT_FILE); await S.whenWritten();
      stopHold(S);
      return { err, saved: r && r.listSaved, namedAtAnswer: !!atAnswer && atAnswer.includes(KEYS[0]), dirGone: r && r.dirGone, after: rows(w.file) };
    } finally { W.stop(); }
  };
  const [D, DX] = await Promise.all([scene(KS), scene(M.load(KS_REL, EARLY(KSRC), 'early-answer'))]);
  ok(!D.err && D.saved === true && D.dirGone && !D.namedAtAnswer && D.after && !D.after.includes(KEYS[0]), '④ FORGET: its answer came once the list was on disk — at the answer the file no longer names the browser (its write held 600 ms on the writer\'s thread)', D);
  ok(!DX.err && DX.namedAtAnswer, '④ RED control (an answer before the landing): at the answer the file still names the forgotten browser (red)', DX);
}

console.log('⑤ a second store built while a write is OWED reads the owed bytes (one process: a restart in a suite)');
{
  const NO_OWED = (src) => anchored(src, '    let read; const owed = owedNow();', '    let read; const owed = null;', 'the-owed-bytes-unread');
  const scene = (Mod) => {
    const w = world(), W = SW.create({ log: quiet });
    try {
      const S1 = mk(KS, w.dir, W);
      S1.noteStart(K3, { hasDir: false, label: 'owed' });
      const owed = W.pending(w.file) && !rows(w.file).includes(K3);
      const S2 = mk(Mod, w.dir, W);   // the same turn: still owed
      const has = S2.has(K3);
      stopHold(S1); stopHold(S2);
      return { owed, has };
    } finally { W.stop(); }
  };
  const E = scene(KS);
  ok(E.owed && E.has, '⑤ THE OWED BYTES: a second store built before the first one\'s write landed knows the browser it noted', E);
  const EX = scene(M.load(KS_REL, NO_OWED(KSRC), 'no-owed'));
  ok(EX.owed && !EX.has, '⑤ RED control (the owed bytes unread — the older file read): the browser just noted is not known (red)', EX);
}

console.log('⑥ ⑦ line 961\'s round (r4278): an act\'s write, once owed, is never due later because of a tabs save (one debounce a file)');
{
  const BOUND_MS = 2000, POSITIVE_MS = 10000;   // the floor is 500 ms (SAVE_GAP_MS), the tabs' debounce 30 s: the controls' 2 s bound; the positive legs' 10 s (line 964's round: a loaded machine's slow landing never reads as the product's red)
  const BLIND = (src) => anchored(src, '    try { owe(actOwed ? SAVE_GAP_MS : PERSIST_TABS_MS); }', '    try { owe(PERSIST_TABS_MS); }', 'the-cure-blinded-a-tabs-save-always-30s');
  const K4 = 'bk-0000d014';
  const scene = async (Mod, { reverse = false, peek = false, bound = BOUND_MS } = {}) => {
    const w = world(), W = SW.create({ log: quiet });
    try {
      const S = mk(Mod, w.dir, W);
      S.noteStart(K3, { hasDir: false, label: 'running' });   // a running kept browser whose tabs move
      if (reverse) S.noteStart(K4, { hasDir: false, label: 'to adopt' });
      await S.whenWritten();   // both rows on disk: the act below is the only change owed
      const t0 = performance.now();
      if (reverse) S.adopted(K4); else S.noteStart(K4, { hasDir: false, label: 'the act' });   // THE ACT: owed at the floor
      if (peek) { const S2 = mk(Mod, w.dir, W); S2.has(K4); stopHold(S2); }   // ⑧ THE PEEK: a second store's read of the owed bytes (the producer runs, nothing written)
      S.noteTabs(K3, [{ targetId: 't1', url: 'https://tabs.example/moved', title: 'Moved', active: true }]);   // …a tabs save inside the floor
      const landed = await until(() => { const r = rows(w.file); return !!r && (reverse ? !r.includes(K4) : r.includes(K4)); }, bound);
      const ms = Math.round(performance.now() - t0);
      stopHold(S);
      return { landed, ms, rows: rows(w.file) };
    } finally { W.stop(); }
  };
  const MARKS_ON_PEEK = (src) => anchored(src, 'if (!PEEKING.has(file)) { actTaken = actOwed; actOwed = false; }', '{ actTaken = actOwed; actOwed = false; }', 'a-producer-that-marks-on-a-peek');
  const [G, GX, H, HX, P, PX] = await Promise.all([scene(KS, { bound: POSITIVE_MS }), scene(M.load(KS_REL, BLIND(KSRC), 'blind-6')), scene(KS, { reverse: true, bound: POSITIVE_MS }), scene(M.load(KS_REL, BLIND(KSRC), 'blind-7'), { reverse: true }),
    scene(KS, { peek: true, bound: POSITIVE_MS }), scene(M.load(KS_REL, MARKS_ON_PEEK(KSRC), 'marks-on-peek'), { peek: true })]);
  const harness = (leg) => `HARNESS (${leg}): nothing landed within the generous ${POSITIVE_MS / 1000} s bound — the machine's load, not the product (the floor is 500 ms, the tabs' 30 s)`;
  ok(G.landed, G.landed ? `⑥ AN ACT THEN A TABS SAVE INSIDE THE FLOOR: the list was on disk with the act's row within the ${POSITIVE_MS / 1000} s bound (in ${G.ms} ms) — the tabs rode the act's write` : harness('⑥'), G);
  ok(!GX.landed, `⑥ CONTROL (the cure's line blinded: a tabs save always 30 s): the act's row was NOT on disk at the ${BOUND_MS / 1000} s bound — the tabs save pushed it to 30 s (red)`, GX);
  ok(H.landed, H.landed ? `⑦ THE REVERSE — A REMOVER's DROPPED ROW (an adopt), THEN A TABS SAVE: the file no longer named the folder within the ${POSITIVE_MS / 1000} s bound (in ${H.ms} ms)` : harness('⑦'), H);
  ok(!HX.landed, `⑦ CONTROL (blinded): the file still named the dropped folder at the ${BOUND_MS / 1000} s bound (red)`, HX);
  ok(P.landed, P.landed ? `⑧ A PEEK BETWEEN THE ACT AND THE TABS SAVE (a second store read the owed bytes): the act stayed owed at the floor — its row on disk within the bound (in ${P.ms} ms)` : harness('⑧'), P);
  ok(!PX.landed, `⑧ RED control (a producer that marks the act taken on a peek): the tabs save after the peek pushed the act's row past the ${BOUND_MS / 1000} s bound (red)`, PX);
}

report();
