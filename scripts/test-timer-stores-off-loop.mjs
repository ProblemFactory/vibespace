#!/usr/bin/env node
// test-timer-stores-off-loop — lane bl-loop-b, B-0248 step 2 unit 5 (主开发 r3320 / r4147): THE TIMERS' STORES LEAVE THE LOOP.
// Three saves a timer made ON THE MAIN THREAD (the page bl-loop-b/b0248-page.md, rows 9 and the slot ledger's read):
//   src/server/login-expiry-watch.js — the login warnings' record, rewritten by a temp + rename at EVERY 5-minute sweep;
//   src/sysinfo.js — the resource history's two rings (about 100 KB), rewritten by a temp + rename every 5 minutes;
//   src/slot-transitions.js — the trim check read the live ledger WHOLE (up to about 2.4 MB) at EVERY recorded re-point.
// The two saves are THE STORE WRITER's now (its thread: temp, write, rename); the trim check reads the file only when its line count
// is not known or has passed the bound. FAST, in-process, real modules over scratch folders; the stall is PLACED in the main thread's
// own fs calls (scripts/fixtures/fs-stall.cjs: Atomics.wait, never load), and a synchronous act's wall time IS the loop's hold.
//   ① the login record under a placed stall: one sweep stalls NO main-thread write; the record whole on disk after (mode 0600).
//     RED: the release's write at the call (temp + rename on the loop) holds the loop a stall's length or more.
//   ② the login record owed at a STOP is written by the writer's exit (server.js shutdown: exitFlush). RED: a save left to a timer
//     outside the writer — at the exit nothing is owed, and the record is lost.
//   UNIT 5's FOLLOW (主开发 r4231, the round wf_00e4a213-190's legs named missing), each with its RED:
//   ①b the temp file's mode read BEFORE its rename (on the writer's thread): 0600 from its first byte. RED: the mode not handed.
//   ②b a KILL with the login save still owed, then a restart over the same For-you store: the warning is the same item (its key).
//     RED: a filing with no key of its own — filed twice.
//   ②c a watch built while a save is OWED reads the writer's owed bytes: it files nothing twice. RED: the read of the owed bytes gone.
//   ③b no writer handed writes nothing — RED: the release's write as a no-writer fallback; and the rings stay owed when the hand-over
//     THROWS (the mark cleared only once the writer took them) — RED: the mark cleared before the hand-over.
//   ⑤b the count after a FAILED append is not known: the next re-point reads the file once and counts it right. RED: a count kept
//     across the failure (below the file's). ⑤c a line appended by ANOTHER HAND: the backstop's look drops the count. RED: a look
//     that drops the rows but keeps the count.
//   (HELD — nothing written over a record that could not be read — is scripts/test-login-expiry-held.mjs §1/§2, carried in this
//   unit: it awaits the writer before judging the bytes, and its no-hold red writes over the record.)
//   ③ the resource history under a placed stall: its save stalls NO main-thread write; the rings on disk after; with no writer handed
//     (the device agent bundles this module and has none) nothing is written. RED: the release's persistHistory (a copy, its temp +
//     rename on the loop).
//   ④ the slot ledger: forty re-points read the live file at most ONCE (the count is learned, then kept). RED: the release's trim
//     check on the instance — one whole read a re-point.
//   ⑤ the slot ledger's count is THE FILE's (every instance shares it): two instances writing one file past the bound trim it, no
//     row lost. RED: an instance with a count of its own — the other's appends unseen, the trim missed (the file past the bound).
//   ⑥ the history at the hub's STOP: the real startWatch handed the hub's writer, its stop asks persistHistory, and the writer's exit
//     writes the owed rings (the process's writer — the last leg on it: ⑦ below asks only stub writers); server.js hands the writer to startWatch and asks persistHistory
//     before the writer's last exitFlush (its text). REDS (of the two pins): the writer not handed; the ask moved after the exitFlush.
//   ⑦ B-f276 slice resource-history (r4991): the history's read under the store-read law — held (nothing written over the file), the
//     lift's merge (by time, a shared sample once), torn bytes kept aside once, no hold handed in (one owed flag); REDs in copies.
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
const home = scratchDir('timer-stores-off-loop');
const M = mutantCopies('timer-stores-off-loop', REPO);
const STALL = require(path.join(REPO, 'scripts/fixtures/fs-stall.cjs'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const quiet = { log() { }, warn() { }, error() { } };
const STALL_MS = 300;
let nD = 0;
const dirOf = (tag) => { const d = path.join(home, `${tag}-${++nD}`); fs.mkdirSync(d, { recursive: true }); return d; };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = performance.now(); while (!f()) { if (performance.now() - t0 > ms) return false; await sleep(5); } return true; };
const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs'));
const stalledOf = (S) => { const st = S.calls.filter((c) => c.kind === 'write' && c.stalled); return { stalled: st.length, fns: [...new Set(st.map((c) => c.fn))] }; };

// ── the login warnings' record (src/server/login-expiry-watch.js) ───────────────────────────────────────────────────────────────
const LEW = require(path.join(REPO, 'src/server/login-expiry-watch.js'));
const LE = require(path.join(REPO, 'src/login-expiry.js'));
const T0 = 1_800_000_000_000;
/** one subscription whose login ends in 20 h (the «24 h left» rung): its first sweep files one warning and records it */
const creds = (t) => ({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: t + 6 * 3600e3, refreshTokenExpiresAt: T0 + 20 * 3600e3, scopes: ['user:inference'] } });
const accounts = { list: () => ({ accounts: [{ id: 'sub-1', name: 'Work', type: 'subscription', backend: 'claude' }] }), decisionLoginStateOf: (id, t) => LE.loginState(creds(t), t) };
const todos = () => { const filed = []; return { filed, add: (k, i) => { filed.push(i); return i; }, resolve: () => { } }; };
/** the release's write AT THE CALL (its temp + rename on the loop), as a writer: the bytes made and written inside dirty() */
const atTheCall = { dirty: (file, o) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, o.produce(), o.mode != null ? { mode: o.mode } : undefined); fs.renameSync(tmp, file); }, durable: async () => true, owed: () => null };

console.log('① B-0248 unit 5: the login warnings\' record is the store writer\'s — a sweep never waits for its write');
{
  const scene = async ({ release = false } = {}) => {
    const dir = dirOf('login'), file = path.join(dir, 'login-expiry.json');
    const W = SW.create({ log: quiet });
    try {
      const t = todos(), w = LEW.create({ accounts, userTodos: t, dataDir: dir, now: () => T0, log: () => { }, writer: release ? atTheCall : W });
      const S = STALL.install({ under: dir, ms: STALL_MS });
      let held = null, err = null;
      const t0 = performance.now();
      try { w.sweep(); } catch (e) { err = e && e.message; } finally { held = Math.round(performance.now() - t0); S.restore(); }
      const landed = await w.whenWritten();
      const rec = readJson(file);
      let mode = null; try { mode = fs.statSync(file).mode & 0o777; } catch { }
      return { held, err, landed, ...stalledOf(S), filed: t.filed.length, since: rec && rec.since, member: !!(rec && rec.members && rec.members['sub-1']), mode };
    } finally { W.stop(); }
  };
  const A = await scene();
  ok(A.stalled === 0 && A.held < STALL_MS && A.landed && A.filed === 1 && A.since === T0 && A.member && A.mode === 0o600 && !A.err, `① THE PLACED STALL (${STALL_MS} ms in every main-thread write under the data folder): one sweep filed its warning in ${A.held} ms with NO main-thread write stalled; the record whole on disk after it (its birth, the member's row, mode 0600)`, A);
  const AX = await scene({ release: true });
  ok(AX.held >= STALL_MS && AX.stalled >= 2, `① RED control (the release's write at the call: temp + rename on the loop): the sweep held the loop ${AX.held} ms (${AX.stalled} main-thread writes stalled: ${AX.fns.join(', ')}) (red)`, AX);
}

console.log('①b unit 5\'s follow (r4231): the temp file is 0600 BEFORE its rename (read on the writer\'s own thread)');
{
  // a stand-in writer thread (scripts/fixtures/store-stand-writer.cjs, the REAL writeJob) whose renameSync first records the temp's mode
  const scene = async ({ noMode = false } = {}) => {
    const dir = dirOf('login-mode'), ctl = dirOf('login-mode-ctl'), file = path.join(dir, 'login-expiry.json'), mark = path.join(ctl, 'mode-before-rename');
    const S = STAND.make(ctl);
    const src = fs.readFileSync(S.path, 'utf8'), at = "const path = require('path');\n";
    if (src.split(at).length !== 2) throw new Error('the stand-in thread\'s header moved: ' + at.trim());
    fs.writeFileSync(S.path, src.replace(at, at + `const __rn = fs.renameSync; fs.renameSync = function (a, b) { try { if (path.basename(String(b)) === 'login-expiry.json') fs.writeFileSync(${JSON.stringify(mark)}, String(fs.statSync(a).mode & 0o777)); } catch { } return __rn.apply(this, arguments); };\n`));
    const W = SW.create({ log: quiet, workerPath: S.path });
    // the RED: a view of the writer whose dirty() drops the mode — the temp is made with the process's default
    const writer = noMode ? new Proxy(W, { get: (t, k) => (k === 'dirty' ? (f, o) => t.dirty(f, { ...o, mode: undefined }) : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }) : W;
    try {
      const w = LEW.create({ accounts, userTodos: todos(), dataDir: dir, now: () => T0, log: () => { }, writer });
      w.sweep();
      const landed = await w.whenWritten();
      let before = null; try { before = Number(fs.readFileSync(mark, 'utf8')); } catch { }
      let after = null; try { after = fs.statSync(file).mode & 0o777; } catch { }
      return { landed, before, after };
    } finally { W.stop(); }
  };
  const [F, FX] = await Promise.all([scene(), scene({ noMode: true })]);
  ok(F.landed && F.before === 0o600 && F.after === 0o600, `①b THE TEMP's MODE before its rename is 0600 (read on the writer's thread at the rename), and the record's after it`, F);
  ok(FX.landed && FX.before != null && FX.before !== 0o600, `①b RED control (the mode not handed to the writer): the temp was ${FX.before != null ? FX.before.toString(8) : 'unread'} before its rename (red)`, FX);
}

console.log('② the login record OWED at a stop is written by the writer\'s exit (server.js shutdown: exitFlush)');
{
  const scene = ({ deferred = false } = {}) => {
    const dir = dirOf('login-stop'), file = path.join(dir, 'login-expiry.json');
    const W = SW.create({ log: quiet });
    // the RED: a save left to a timer OUTSIDE the writer (as a store's own debounce timer was) — at the exit nothing is owed yet
    const writer = deferred ? new Proxy(W, { get: (t, k) => (k === 'dirty' ? (f, o) => { const h = setTimeout(() => { try { t.dirty(f, o); } catch { } }, 2000); h.unref?.(); } : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }) : W;
    try {
      const w = LEW.create({ accounts, userTodos: todos(), dataDir: dir, now: () => T0, log: () => { }, writer });
      w.sweep();
      const owedBefore = W.pending(file);
      W.beginExit(); W.exitFlush();   // the same synchronous run: the hub's stop (server.js shutdown) before any writer turn
      const rec = readJson(file);
      return { owedBefore, since: rec && rec.since, member: !!(rec && rec.members && rec.members['sub-1']) };
    } finally { W.stop(); }
  };
  const B = scene();
  ok(B.owedBefore && B.since === T0 && B.member, '② THE STOP: the sweep\'s record, owed to the writer at the stop, is on disk after its exit (the hub\'s exitFlush) — never lost', B);
  const BX = scene({ deferred: true });
  ok(!BX.owedBefore && BX.since == null, '② RED control (a save left to a timer outside the writer): nothing owed at the exit, no record on disk (red)', BX);
}

const LE_REL = 'src/server/login-expiry-watch.js';
const LE_SRC = fs.readFileSync(path.join(REPO, LE_REL), 'utf8');
console.log('②b unit 5\'s follow (r4231): a KILL with the login save still owed, then a restart over the same For-you store — never filed twice');
{
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const T1 = T0 + 3 * 3600e3;   // a later life: the same «24 h left» rung, its words moved with the clock
  const NO_KEY = (src) => anchored(src, "          itemKey: `login-expiry:${a.id}:${emit}:${lexp ?? 'none'}`,\n", '', 'filed-with-no-key');
  const scene = async (Mod) => {
    const dir = dirOf('login-kill'), file = path.join(dir, 'login-expiry.json');
    const todos1 = new UserTodoManager({ dataDir: dir, onChange: () => { }, expirySweepMs: 0, now: () => T0 });
    const W1 = SW.create({ log: quiet });
    const w1 = Mod.create({ accounts, userTodos: todos1, dataDir: dir, now: () => T0, log: () => { }, writer: W1 });
    w1.sweep();
    const owed = W1.pending(file);
    W1.stop();   // THE KILL, in the sweep's own turn (inside the writer's half second): the record is never written
    await todos1.whenWritten();   // For you's own write is its own (the item on disk)
    const recordOnDisk = fs.existsSync(file);
    const logs = [], W2 = SW.create({ log: quiet });
    const todos2 = new UserTodoManager({ dataDir: dir, onChange: () => { }, expirySweepMs: 0, now: () => T1 });
    try {
      const w2 = Mod.create({ accounts, userTodos: todos2, dataDir: dir, now: () => T1, log: (...a) => logs.push(a.join(' ')), writer: W2 });
      w2.sweep();
      await w2.whenWritten(); await todos2.whenWritten();
      return { owed, recordOnDisk, items: todos2.forSession([LEW.INBOX_KEY]).length, same: logs.some((l) => /already in For you — the same item/.test(l)), recordAfter: !!readJson(file) };
    } finally { W2.stop(); }
  };
  const K = await scene(LEW);
  ok(K.owed && !K.recordOnDisk && K.items === 1 && K.same && K.recordAfter, '②b THE KILL with the record owed (never on disk): the restart over the same For-you store files the warning as THE SAME item (its key) — one item, never two; the record written by the second life', K);
  const KX = await scene(M.load(LE_REL, NO_KEY(LE_SRC), 'no-key'));
  ok(KX.owed && !KX.recordOnDisk && KX.items === 2, `②b RED control (a filing with no key of its own): after the kill the same warning is filed twice (${KX.items} items) (red)`, KX);
}

console.log('②c unit 5\'s follow (r4231): a watch built while a save is OWED reads the writer\'s owed bytes — it files nothing twice');
{
  const NO_OWED = (src) => anchored(src, '{ let read; const owed = owedNow();', '{ let read; const owed = null;', 'the-owed-bytes-unread');
  const scene = (Mod) => {
    const dir = dirOf('login-owed'), file = path.join(dir, 'login-expiry.json'), t = todos(), W = SW.create({ log: quiet });
    try {
      const w1 = LEW.create({ accounts, userTodos: t, dataDir: dir, now: () => T0, log: () => { }, writer: W });
      w1.sweep();
      const owed = W.pending(file) && !fs.existsSync(file);
      const w2 = Mod.create({ accounts, userTodos: t, dataDir: dir, now: () => T0 + 60e3, log: () => { }, writer: W });   // the same turn: still owed
      w2.sweep();
      return { owed, filed: t.filed.length, since: w2.watchingSince(), sent: ((w2.ledger()['sub-1'] || {}).sent || []).length };
    } finally { W.stop(); }
  };
  const O = scene(LEW);
  ok(O.owed && O.filed === 1 && O.since === T0 && O.sent >= 1, '②c THE OWED BYTES: a second watch built before the first one\'s save landed reads it (its birth, the rung sent) — its sweep files nothing twice', O);
  const OX = scene(M.load(LE_REL, NO_OWED(LE_SRC), 'no-owed'));
  ok(OX.owed && OX.filed === 2, `②c RED control (the writer's owed bytes unread: the older file — none — read): the same warning filed again (${OX.filed}) (red)`, OX);
}

// ── the resource history (src/sysinfo.js) ─────────────────────────────────────────────────────────────────────────────────────
const SI_REL = 'src/sysinfo.js';
const SI_SRC = fs.readFileSync(path.join(REPO, SI_REL), 'utf8');
const SI = require(path.join(REPO, SI_REL));
const RELEASE_HISTORY = (src) => anchored(src,
  "  try { writer.dirty(_histFile, { name: 'sysinfo-history.write', produce: () => JSON.stringify({ fine: _hist.fine, coarse: _hist.coarse }) }); _histDirty = false; } catch { }",
  "  try { const tmp = _histFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ fine: _hist.fine, coarse: _hist.coarse })); fs.renameSync(tmp, _histFile); _histDirty = false; } catch { }",
  'the-release-history-write');

console.log('③ the resource history is the store writer\'s — its 5-minute save never waits for its write');
{
  const scene = async (Mod, writer = SW.storeWriter()) => {
    const dir = dirOf('history'), file = path.join(dir, 'sysinfo-history.json');
    Mod.loadHistory(dir);
    Mod.recordSample({ used: 512, limit: 1024 }, 0.25);
    const S = STALL.install({ under: dir, ms: STALL_MS });
    let held = null; const t0 = performance.now();
    try { Mod.persistHistory(writer); } finally { held = Math.round(performance.now() - t0); S.restore(); }
    const landed = await SW.storeWriter().durable(file);
    const rec = readJson(file);
    return { held, ...stalledOf(S), landed, fine: rec && Array.isArray(rec.fine) ? rec.fine.length : null, last: rec && rec.fine && rec.fine[rec.fine.length - 1] };
  };
  const C = await scene(SI);
  ok(C.stalled === 0 && C.held < STALL_MS && C.landed && C.fine >= 1 && C.last && C.last.m === 512, `③ THE PLACED STALL: the history's save in ${C.held} ms with NO main-thread write stalled; its rings on disk after it (${C.fine} fine point(s), the sample's memory)`, C);
  const CN = await scene(M.load(SI_REL, SI_SRC, 'no-writer', { same: true }), null);   // a deliberate unpatched copy: its own module state, no writer handed
  ok(CN.stalled === 0 && CN.fine === null, '③ CONTROL: no writer handed (the device agent bundles this module and has no store writer): nothing written, no write on the loop', CN);
  // ③b (r4231): the no-writer control's RED — the release's write kept as a fallback when no writer is handed
  const NO_WRITER_FALLBACK = (src) => anchored(src, '  if (!_histFile || !_histDirty || !writer) return;',
    "  if (!_histFile || !_histDirty) return;\n  if (!writer) { try { const tmp = _histFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ fine: _hist.fine, coarse: _hist.coarse })); fs.renameSync(tmp, _histFile); _histDirty = false; } catch { } return; }",
    'a-no-writer-fallback');
  const CNX = await scene(M.load(SI_REL, NO_WRITER_FALLBACK(SI_SRC), 'no-writer-fallback'), null);
  ok(CNX.stalled >= 2 && CNX.fine !== null, `③b RED control of the no-writer CONTROL (the release's write as a fallback): ${CNX.stalled} main-thread writes, the rings on disk (red)`, CNX);
  const CX = await scene(M.load(SI_REL, RELEASE_HISTORY(SI_SRC), 'release-history'));
  ok(CX.held >= STALL_MS && CX.stalled >= 2, `③ RED control (the release's persistHistory: temp + rename on the loop): the save held the loop ${CX.held} ms (${CX.stalled} main-thread writes stalled: ${CX.fns.join(', ')}) (red)`, CX);
}

console.log('③b unit 5\'s follow (r4231): the rings stay OWED when the hand-over to the writer throws — the next save hands them');
{
  const CLEARED_FIRST = (src) => anchored(src,
    "  try { writer.dirty(_histFile, { name: 'sysinfo-history.write', produce: () => JSON.stringify({ fine: _hist.fine, coarse: _hist.coarse }) }); _histDirty = false; } catch { }",
    "  _histDirty = false;\n  try { writer.dirty(_histFile, { name: 'sysinfo-history.write', produce: () => JSON.stringify({ fine: _hist.fine, coarse: _hist.coarse }) }); } catch { }",
    'the-mark-cleared-before-the-hand-over');
  const scene = async (Mod) => {
    const dir = dirOf('history-throw'), file = path.join(dir, 'sysinfo-history.json');
    Mod.loadHistory(dir);
    Mod.recordSample({ used: 333, limit: 1024 }, 0.1);
    let asked = 0;
    Mod.persistHistory({ dirty: () => { asked++; throw Object.assign(new Error('the writer refused the hand-over (placed)'), { code: 'EPLACED' }); } });
    const P = SW.storeWriter();
    Mod.persistHistory(P);   // the next 5-minute save, no new sample between
    const owed = P.pending(file);
    await P.durable(file);
    const rec = readJson(file);
    return { asked, owed, fine: rec && rec.fine ? rec.fine.length : null };
  };
  const H = await scene(M.load(SI_REL, SI_SRC, 'mark-after', { same: true }));
  ok(H.asked === 1 && H.owed && H.fine >= 1, '③b A HAND-OVER THAT THROWS leaves the rings owed: the next save (no new sample) hands them, on disk after it', H);
  const HX = await scene(M.load(SI_REL, CLEARED_FIRST(SI_SRC), 'mark-before'));
  ok(HX.asked === 1 && !HX.owed && HX.fine === null, '③b RED control (the mark cleared before the hand-over): the next save hands nothing — the rings unwritten until a new sample (red)', HX);
}

// ── the slot ledger's trim check (src/slot-transitions.js) ──────────────────────────────────────────────────────────────────────
const { SlotTransitions } = require(path.join(REPO, 'src/slot-transitions.js'));
/** the release's _maybeTrim, whole (one whole read of the live file at EVERY record) */
function releaseMaybeTrim() {
  let txt; try { txt = fs.readFileSync(this.file, 'utf-8'); } catch { return; }
  const lines = txt.split('\n').filter(Boolean);
  if (lines.length <= this.max) return;
  const cut = Math.floor(lines.length / 2);
  try {
    fs.mkdirSync(this.archiveDir, { recursive: true });
    const out = path.join(this.archiveDir, `slot-transitions-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`);
    fs.appendFileSync(out, lines.slice(0, cut).join('\n') + '\n');
    fs.writeFileSync(this.file + '.tmp', lines.slice(cut).join('\n') + '\n');
    fs.renameSync(this.file + '.tmp', this.file);
  } catch { }
  this._st.rows = null; this._st.gen++;
}
const move = (i) => ({ sessionId: 'sess-' + i, poolId: 'pool-1', from: 'sub-a', to: 'sub-b', at: T0 + i * 1000, why: 'leg' });
const liveLines = (dir) => { try { return fs.readFileSync(path.join(dir, 'slot-transitions.jsonl'), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
const shardLines = (dir) => { try { return fs.readdirSync(path.join(dir, 'archive')).reduce((n, f) => n + fs.readFileSync(path.join(dir, 'archive', f), 'utf8').split('\n').filter(Boolean).length, 0); } catch { return 0; } };

console.log('④ the slot ledger: forty re-points read the live file at most once (its line count is kept)');
{
  const scene = ({ release = false } = {}) => {
    const dir = dirOf('slots'), live = 'slot-transitions.jsonl';   // fs-stall names a call's path from the folder it watches
    const L = new SlotTransitions({ dataDir: dir, max: 1000 });
    if (release) L._maybeTrim = releaseMaybeTrim;   // the RED: the release's trim check on this instance
    const S = STALL.install({ under: dir, ms: 0 });   // counts the reads (never stalls one)
    let wrote = 0; try { for (let i = 0; i < 40; i++) if (L.record(move(i))) wrote++; } finally { S.restore(); }
    return { wrote, reads: S.calls.filter((c) => c.fn === 'readFileSync' && c.path === live).length, rows: L.all().length, lines: liveLines(dir) };
  };
  const D = scene();
  ok(D.wrote === 40 && D.reads <= 1 && D.rows === 40 && D.lines === 40, `④ FORTY RE-POINTS: ${D.reads} whole read(s) of the live file (the count learned once, then kept); every row written and read back (${D.rows})`, D);
  const DX = scene({ release: true });
  ok(DX.reads === 40, `④ RED control (the release's trim check: the live file read whole at every re-point): ${DX.reads} whole reads (red)`, DX);
}

console.log('⑤ the count is THE FILE\'s: two instances writing one file past the bound trim it, and no row is lost');
{
  const scene = ({ own = false } = {}) => {
    const dir = dirOf('slots-two');
    const A = new SlotTransitions({ dataDir: dir, max: 10 }), B = new SlotTransitions({ dataDir: dir, max: 10 });
    // the RED: B keeps a count (and rows) of its own — A's appends unseen by B, B's by A
    if (own) B._st = { rows: null, bytes: -1, clean: true, seen: null, lookAt: 0, lookOut: false, gen: 0, lines: null };
    let i = 0;
    for (let k = 0; k < 5; k++) A.record(move(i++));
    for (let k = 0; k < 5; k++) B.record(move(i++));
    for (let k = 0; k < 5; k++) A.record(move(i++));
    A._cache = null;   // read both files fresh: every row, live and archived
    const all = A.all();
    return { live: liveLines(dir), archived: shardLines(dir), rows: all.length, distinct: new Set(all.map((r) => r.sessionId)).size };
  };
  const E = scene();
  ok(E.live <= 10 && E.archived > 0 && E.rows === 15 && E.distinct === 15, `⑤ ONE COUNT A FILE: fifteen re-points through two instances (bound 10) — trimmed (${E.live} live, ${E.archived} archived), all fifteen rows once each`, E);
  const EX = scene({ own: true });
  ok(EX.live > 10 && EX.archived === 0, `⑤ RED control (a count of its own on one instance): the other's appends unseen — no trim, ${EX.live} lines in the live file past its bound of 10 (red)`, EX);
}

const ST_REL = 'src/slot-transitions.js';
const ST_SRC = fs.readFileSync(path.join(REPO, ST_REL), 'utf8');
console.log('⑤b unit 5\'s follow (r4231): after a FAILED append the count is not known — the next re-point reads the file once and counts it right');
{
  const KEPT = (src) => anchored(src, '    const counted = st.lines; st.lines = null;', '    const counted = st.lines;', 'the-count-kept-across-a-failure');
  const scene = (Mod) => {
    const dir = dirOf('slots-fail'), live = path.join(dir, 'slot-transitions.jsonl');
    const L = new Mod.SlotTransitions({ dataDir: dir, max: 1000 });
    for (let i = 0; i < 3; i++) L.record(move(i));
    // THE FAILURE, placed: the append's bytes land, then the call throws (a write that fails after a part — here all — of it landed)
    const real = fs.appendFileSync; let failed = false;
    fs.appendFileSync = function (p, ...a) { if (!failed && path.resolve(String(p)) === path.resolve(live)) { failed = true; real.call(this, p, ...a); throw Object.assign(new Error('EIO (placed, after the bytes)'), { code: 'EIO' }); } return real.call(this, p, ...a); };
    let rec3 = 'x'; try { rec3 = L.record(move(3)); } finally { fs.appendFileSync = real; }
    const S = STALL.install({ under: dir, ms: 0 });
    try { L.record(move(4)); } finally { S.restore(); }
    return { failed, rec3, reads: S.calls.filter((c) => c.fn === 'readFileSync' && c.path === 'slot-transitions.jsonl').length, count: L._st.lines, file: liveLines(dir) };
  };
  const G = scene({ SlotTransitions });
  ok(G.failed && G.rec3 === null && G.reads === 1 && G.count === G.file && G.file === 5, `⑤b A FAILED APPEND: the count was not kept — the next re-point read the file once and counts ${G.count}, the file's own`, G);
  const GX = scene(M.load(ST_REL, KEPT(ST_SRC), 'count-kept'));
  ok(GX.failed && GX.reads === 0 && GX.count < GX.file, `⑤b RED control (a count kept across the failure): no read, the count ${GX.count} below the file's ${GX.file} (red)`, GX);
}

console.log('⑤c unit 5\'s follow (r4231): a line appended by ANOTHER HAND — the backstop\'s look drops the count, the next re-point counts it');
{
  const LOOK_KEEPS = (src) => anchored(src, '{ st.rows = null; st.lines = null; st.gen++; return; }   // changed outside the hub', '{ st.rows = null; st.gen++; return; }   // changed outside the hub', 'a-look-that-keeps-the-count');
  const scene = async (Mod) => {
    let clock = 1_000_000;
    Mod._ledgerTestSeam({ now: () => clock });
    try {
      const dir = dirOf('slots-hand'), live = path.join(dir, 'slot-transitions.jsonl');
      const L = new Mod.SlotTransitions({ dataDir: dir, max: 1000 });
      for (let i = 0; i < 3; i++) L.record(move(i));
      L.all();   // the rows kept, the count learned (3), the look's clock set
      fs.appendFileSync(live, JSON.stringify(move(50)) + '\n');   // ANOTHER HAND (a tool, a second process): one line the hub never wrote
      clock += Mod.LOOK_EVERY_MS + 1;
      L.all();   // a read answered from memory starts the look (off the loop)
      const dropped = await until(() => L._st.rows == null, 2000);
      const S = STALL.install({ under: dir, ms: 0 });
      try { L.record(move(5)); } finally { S.restore(); }
      return { dropped, reads: S.calls.filter((c) => c.fn === 'readFileSync' && c.path === 'slot-transitions.jsonl').length, count: L._st.lines, file: liveLines(dir) };
    } finally { Mod._ledgerTestSeam({}); }
  };
  const Hh = await scene({ SlotTransitions, LOOK_EVERY_MS: require(path.join(REPO, ST_REL)).LOOK_EVERY_MS, _ledgerTestSeam: require(path.join(REPO, ST_REL))._ledgerTestSeam });
  ok(Hh.dropped && Hh.reads === 1 && Hh.count === Hh.file && Hh.file === 5, `⑤c ANOTHER HAND's line: the look dropped the count with the rows; the next re-point read the file once and counts ${Hh.count}, the file's own`, Hh);
  const HhX = await scene(M.load(ST_REL, LOOK_KEEPS(ST_SRC), 'look-keeps-count'));
  ok(HhX.dropped && HhX.reads === 0 && HhX.count < HhX.file, `⑤c RED control (a look that drops the rows but keeps the count): no read, the count ${HhX.count} below the file's ${HhX.file} (red)`, HhX);
}

console.log('⑥ the history at the hub\'s STOP: the real startWatch handed the hub\'s writer, its stop asks the save, the writer\'s exit writes it');
{
  const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const HANDS = "writer: require('./src/store-writer.js').storeWriter(), onSample: (mem) => memoryPressure.onSample(mem)";
  const handed = (text) => { const at = text.indexOf('sysinfo.startWatch({'); return at >= 0 && text.indexOf(HANDS, at) > at && text.indexOf(HANDS, at) < text.indexOf('});', at); };
  const order = (text) => { const sd = text.indexOf('function shutdown('); const ask = text.indexOf('sysinfo.persistHistory();', sd); const last = text.indexOf("storeWriter().exitFlush({ debtMs", sd); return sd >= 0 && ask > sd && last > ask; };
  const ASK = '  try { sysinfo.persistHistory(); } catch {} // resource-history ring (2.223.0)\n';
  // the ask moved to the line AFTER the writer's last exitFlush (the shutdown's closing brace follows that line)
  const swapped = anchored(anchored(SV, ASK, '', 'the-ask-removed'), "\n}\nprocess.on('SIGINT', () => {", '\n' + ASK + "}\nprocess.on('SIGINT', () => {", 'the-ask-after-the-last-exitFlush');
  const unhanded = anchored(SV, HANDS, 'onSample: (mem) => memoryPressure.onSample(mem)', 'the-writer-not-handed');
  const dir = dirOf('history-stop'), file = path.join(dir, 'sysinfo-history.json');
  const P = SW.storeWriter();
  const stop = SI.startWatch({ dataDir: dir, intervalMs: 3600e3, writer: P, broadcast: () => { } });   // its sampler an hour away: the leg's own sample below
  SI.recordSample({ used: 777, limit: 1024 }, 0.5);
  stop();   // the watch's stop: its timers cleared, persistHistory asked (the module's handed writer)
  const owed = P.pending(file);
  P.beginExit(); P.exitFlush();   // …then the writer's exit, in the same synchronous run (server.js shutdown)
  const rec = readJson(file), last = rec && rec.fine && rec.fine[rec.fine.length - 1];
  ok(owed && !!last && last.m === 777, '⑥ THE STOP: the watch\'s stop asked the save of its handed writer, owed at the exit, and the writer\'s exitFlush wrote the rings (the newest sample on disk)', { owed, last });
  ok(handed(SV) && order(SV), '⑥ server.js hands the hub\'s writer to startWatch, and its shutdown asks persistHistory before the writer\'s last exitFlush', { handed: handed(SV), order: order(SV) });
  ok(!handed(unhanded) && !order(swapped), '⑥ RED controls (of the two pins: the writer not handed; the ask moved after the last exitFlush): each pin fails (red)');
}

// ── ⑦ B-f276 slice resource-history (lane nl-paired, 主开发 r4991): THE HISTORY'S READ UNDER THE STORE-READ LAW ──────────────
// The release read a failed read or torn bytes as EMPTY rings and the next persist wrote that over the file. Now the read answers to
// a HOLD the hub's start hands in (startWatch's `hold`, as the writer — the module is in the device agent's bundle; the law's answer is
// the PURE src/store-read.js, already in that bundle).
// Each scene a FRESH copy of src/sysinfo.js (its rings are the module's). A PLACED EIO of the read call (never a mode or a mount).
console.log('⑦ the history\'s read under the store-read law: held (nothing written over the file), the lift\'s merge, torn bytes kept aside once, no hold handed in');
{
  const HOLDm = require(path.join(REPO, 'src/store-read-hold.js'));
  let nCopy = 0;
  const fresh = (text = SI_SRC, tag = 'si') => M.load(SI_REL, text, `${tag}-${++nCopy}`, { same: text === SI_SRC });
  const placeRead = (file, code, fn) => { const r0 = fs.readFileSync; fs.readFileSync = function (p, ...a) { if (String(p) === file) throw Object.assign(new Error(`${code}: a placed read refusal`), { code }); return r0.call(this, p, ...a); }; try { return fn(); } finally { fs.readFileSync = r0; } };
  const at = (t, fn) => { const n0 = Date.now; Date.now = () => t; try { return fn(); } finally { Date.now = n0; } };
  const stubWriter = () => { const asked = []; return { asked, dirty: (f, o) => asked.push({ f, bytes: o.produce() }) }; };
  const T = Date.now() - 3600e3;   // an hour ago: inside the fine ring's 24 h (history(range) serves the COARSE ring past 24 h)
  const FINE = 24 * 3600e3;
  const F0 = JSON.stringify({ fine: [{ t: T - 2000, m: 1 }, { t: T - 1000, m: 2 }, { t: T, m: 3 }], coarse: [{ t: T - 3600e3, m: 9 }] });
  // HELD, then LIFTED: (a) nothing written over the file while held, (b) the merge's count and order, the first write holds both
  const heldScene = async (Mod) => {
    const dir = dirOf('hist-held'), file = path.join(dir, 'sysinfo-history.json'); fs.writeFileSync(file, F0);
    const said = [];
    placeRead(file, 'EIO', () => Mod.loadHistory(dir, { hold: HOLDm, log: (l) => said.push(String(l)) }));
    const heldAt = Mod.historyHeld();
    at(T, () => Mod.recordSample({ used: 500, limit: 1024 }, 0.5)); at(T + 1000, () => Mod.recordSample({ used: 600, limit: 1024 }, 0.6));
    const inMemory = Mod.history(FINE).length;
    const wh = stubWriter(); Mod.persistHistory(wh);
    const bytesHeld = fs.readFileSync(file, 'utf8') === F0;
    const lifted = await Mod.historyReadAgain();
    const fine = Mod.history(FINE).map((x) => `${x.t - T}:${x.m}`);
    const wl = stubWriter(); Mod.persistHistory(wl);
    let written = null; try { written = wl.asked[0] && JSON.parse(wl.asked[0].bytes); } catch { written = null; }
    return { held: heldAt && heldAt.code, inMemory, persistedWhileHeld: wh.asked.length, bytesHeld, lifted, fine: fine.join(' '), after: Mod.historyHeld(),
      firstWrite: written ? { fine: written.fine.map((x) => `${x.t - T}:${x.m}`).join(' '), coarse: written.coarse.length } : null };
  };
  const h = await heldScene(fresh());
  ok(h.held === 'sysinfo_history_unread' && h.inMemory === 2 && h.persistedWhileHeld === 0 && h.bytesHeld,
    '⑦ (a) a history whose read FAILED (EIO, placed) is HELD: the samples are taken in memory (the chart shows them) and a persist writes NOTHING over the file — its bytes byte for byte', h);
  ok(h.lifted === true && h.after === null && h.fine === '-2000:1 -1000:2 0:500 1000:600' && !!h.firstWrite && h.firstWrite.fine === '-2000:1 -1000:2 0:500 1000:600' && h.firstWrite.coarse === 2,
    '⑦ (b) THE LIFT\'S MERGE: the file\'s rings come back UNDER the samples taken meanwhile — by time, four points in order, the sample present in both (its t) kept ONCE (the one in memory), and the first write after the lift holds both rings', h);
  const xg = await heldScene(fresh(anchored(SI_SRC, "  if (_histUnread || (_histHold && !_histHold.writable('a write of the CPU and memory history'))) return;\n", '', 'si-no-hold-check'), 'no-hold-check'));
  ok(xg.persistedWhileHeld === 1, `⑦ RED control (the persist without its hold check, in a copy): a held history's persist hands its rings to the writer — written over the file (${xg.persistedWhileHeld}) (red)`, xg);
  const xm = await heldScene(fresh(anchored(SI_SRC, "  if (d && HIST_SHAPE(d)) { _hist.fine = mergeRing(d.fine, _hist.fine, FINE_MAX); _hist.coarse = mergeRing(d.coarse, _hist.coarse, COARSE_MAX); }\n", "  if (d && HIST_SHAPE(d)) takeRings(d);   // MUTANT: the file's rings over the samples taken meanwhile\n", 'si-no-merge'), 'no-merge'));
  ok(xm.lifted === true && xm.fine === '-2000:1 -1000:2 0:3', `⑦ RED control (the lift without the merge, in a copy): the file's rings take the place of the samples taken meanwhile — ${xm.fine} (red)`, xm);
  // (c) TORN: kept aside ONCE, byte for byte, as sysinfo-history.json.corrupt-<ms>; the same bytes again make no second copy; other torn bytes
  // take a name of their own, never one over the first
  const tornScene = async (dir, bytes) => {
    const file = path.join(dir, 'sysinfo-history.json'); fs.writeFileSync(file, bytes);
    const Mod = fresh(SI_SRC, 'torn');
    Mod.loadHistory(dir, { hold: HOLDm, log: () => { } });
    const lifted = await until(() => !Mod.historyHeld(), 3000);
    const copies = fs.readdirSync(dir).filter((n) => n.startsWith('sysinfo-history.json.corrupt-')).sort();
    return { lifted, copies, bytesOf: (n) => fs.readFileSync(path.join(dir, n), 'utf8') };
  };
  const tdir = dirOf('hist-torn');
  const t1 = await tornScene(tdir, '{"fine": [ torn'), t2 = await tornScene(tdir, '{"fine": [ torn'), t3 = await tornScene(tdir, 'other torn bytes');
  const nameOk = (n) => /^sysinfo-history\.json\.corrupt-\d+(-\d+)?$/.test(n);
  ok(t1.lifted && t1.copies.length === 1 && nameOk(t1.copies[0]) && t1.bytesOf(t1.copies[0]) === '{"fine": [ torn' && t2.lifted && JSON.stringify(t2.copies) === JSON.stringify(t1.copies)
    && t3.lifted && t3.copies.length === 2 && t3.copies.includes(t1.copies[0]) && t3.bytesOf(t1.copies[0]) === '{"fine": [ torn' && t3.copies.every(nameOk),
    `⑦ (c) TORN bytes are kept aside ONCE, byte for byte, as sysinfo-history.json.corrupt-<ms> (${t1.copies[0]}); the same bytes torn again make no second copy; other torn bytes take a name of their own, the first copy untouched`, { t1: t1.copies, t2: t2.copies, t3: t3.copies });
  // NO HOLD HANDED IN (a suite, a caller of tomorrow): a failed read never lets a persist write over the file in that run — one owed flag, said once
  const noHoldScene = (Mod) => {
    const dir = dirOf('hist-nohold'), file = path.join(dir, 'sysinfo-history.json'); fs.writeFileSync(file, F0);
    const said = [];
    placeRead(file, 'EIO', () => Mod.loadHistory(dir, { log: (l) => said.push(String(l)) }));
    Mod.recordSample({ used: 700, limit: 1024 }, 0.7);
    const w = stubWriter(); Mod.persistHistory(w); Mod.persistHistory(w);
    return { asked: w.asked.length, bytes: fs.readFileSync(file, 'utf8') === F0, said: said.filter((l) => /could not be read \(EIO\) — nothing is written over it in this run/.test(l)).length, held: Mod.historyHeld() };
  };
  const nh = noHoldScene(fresh());
  ok(nh.asked === 0 && nh.bytes && nh.said === 1 && nh.held === null, '⑦ (a) NO HOLD HANDED IN: a failed read (EIO, placed) still never lets a persist write over the file in that run — one owed flag, said once (never the release\'s silent empty start)', nh);
  const xo = noHoldScene(fresh(anchored(SI_SRC, "  _histUnread = String(a.code || 'unreadable').slice(0, 40);\n", "  _histUnread = null;   // MUTANT: the release's silent empty start\n", 'si-no-owed'), 'no-owed'));
  ok(xo.asked === 1, `⑦ RED control (no owed flag, in a copy): the empty-started rings are handed to the writer over a file that could not be read (${xo.asked}) (red)`, xo);
  // a history that reads: as at the release (loaded, then written as before)
  { const Mod = fresh(); const dir = dirOf('hist-data'), file = path.join(dir, 'sysinfo-history.json');
    const F1 = JSON.parse(F0); F1.fine.push({ t: null, m: 4 }, null); fs.writeFileSync(file, JSON.stringify(F1));   // a point with no time (and a null) is no point
    Mod.loadHistory(dir, { hold: HOLDm, log: () => { } }); const n = Mod.history(FINE).length; at(T + 5000, () => Mod.recordSample({ used: 1, limit: 2 }, 0.1)); const w = stubWriter(); Mod.persistHistory(w);
    ok(n === 3 && Mod.historyHeld() === null && w.asked.length === 1, '⑦ a history that READS loads as at the release (its three points — a point with no time dropped at the start, as at a lift) and the persist hands it to the writer', { n, asked: w.asked.length }); }
  // the panel and the hub's start: the held words in the chart's own place (en, zh, ja); the hold handed in; the route answers it
  const RAIL = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-rail.js'), 'utf8'), SVR = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const HW = "The CPU and memory history could not be read just now — VibeSpace reads it again by itself; nothing in it was lost or changed. The charts show what was measured since this start.";
  ok(RAIL.includes("const heldNote = d?.held ? `<div class=\"empty-hint empty-hint-inline\">${escHtml(tr('The CPU and memory history could not be read just now") && RAIL.includes('if (note) note.innerHTML = heldNote;')
    && ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].every((f) => fs.readFileSync(path.join(REPO, f), 'utf8').includes(JSON.stringify(HW) + ':'))
    && SVR.includes("dataDir: path.join(__dirname, 'data'), hold: require('./src/store-read-hold.js'), ") && SVR.includes('held: sysinfo.historyHeld()'),
    '⑦ (d) THE PANEL: a held history is said in the chart\'s own place beside its points (sidebar-rail\'s .sys-hist-note; en, zh, ja — no tray item, no toast); server.js hands the hold in and the history route answers `held`');
}

report();
