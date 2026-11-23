#!/usr/bin/env node
// test-slot-ledger-reads — B-360d remainder (主开发 r1231 / r2850, lane chrome-157): THE SLOT LEDGER IS READ FROM MEMORY.
// The hub writes data/slot-transitions.jsonl through one SlotTransitions instance (src/accounts.js) and reads it through another
// (src/server/usage-pool-engine.js); the reader asked the file a synchronous stat at every call to learn of the writer's appends
// — ONE stat a stream record on a pooled conversation (measured on the test machine: on a share holding each ask 60 ms a
// 200-record turn held the loop 12 s). Now every instance of one FILE shares one state: a write of the hub lands in the kept rows
// in its own step, a read answers from memory, and a backstop look (off the loop, at most one out, no timer) catches a writer
// outside the hub. Each leg has its red copy (scripts/mutant-copy.mjs):
//   ① a record's reads make NO synchronous file call (red: a stat a call)
//   ② THE MONEY LAW: a move the writer recorded is in the reader's NEXT read, nothing between; a write that failed (a part of it
//      landed) is read back as the file holds it — never a row the file does not hold, never a miss of one it does (reds: the
//      write not landed in the kept rows; a failed write that keeps them)
//   ③ a trim, whole and failed half-way, is read back as the files hold it (red: the trim that drops nothing)
//   ④ THE BACKSTOP: an outside append is seen within the bound plus one look, never by a stat a call (red: no backstop)
//   ⑤ the engine: a reading is filed on the member its request went out on — a move after the request (its `movedAt`), and the
//      next request on the new member — with 0 file asks a record (red: the engine and the writer on a ledger whose writes do not
//      land in the kept rows)
//   ⑥ the look off the loop: a look that never answers holds no read and starts no second look (red: a look a bound)
//   ⑦ two ledgers side by side never wake each other; two spellings of one path are one file (red: one state for the process)
// Run: node scripts/test-slot-ledger-reads.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { markTimedOut } from './lib/timed-out.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { ok, report } = checker();   // ok(cond, name, detail): the condition first, a boolean (scripts/lib/check.mjs)
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-slotledger-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let dirN = 0; const dir = (tag) => { const d = path.join(ROOT, `${tag}-${++dirN}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ticks = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const waitFor = async (cond, ms, what) => { const t = Date.now() + ms; while (!cond() && Date.now() < t) await sleep(5); return cond() ? true : markTimedOut(false, ms, what); };

const SRC = read('src/slot-transitions.js');
const M = mutantCopies('slotledger', REPO);
let copyN = 0;
const copyOf = (src = SRC, tag = 'same') => M.load('src/slot-transitions.js', src, `${tag}-${++copyN}`, src === SRC ? { same: true } : {});
// the files as a FRESH reader holds them (its own module: its own state)
const fresh = (d) => new (copyOf()).SlotTransitions({ dataDir: d }).all();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SYNC = ['statSync', 'lstatSync', 'readFileSync', 'readdirSync', 'existsSync', 'openSync', 'fstatSync', 'accessSync', 'realpathSync', 'readlinkSync'];
const syncCalls = (fn) => { const orig = {}; let n = 0; for (const k of SYNC) { orig[k] = fs[k]; fs[k] = function (...a) { n++; return orig[k].apply(this, a); }; } try { return { v: fn(), n }; } finally { for (const k of SYNC) fs[k] = orig[k]; } };
const seamed = (mod) => { const s = { T: 1e12, looks: 0, last: null, stall: false }; mod._ledgerTestSeam({ now: () => s.T, stat: (f) => { s.looks++; s.last = s.stall ? new Promise(() => { }) : fs.promises.stat(f); return s.last; } }); return s; };
const row = (sessionId, from, to, when) => ({ sessionId, poolId: 'p', from, to, at: when });
const fileOf = (d) => path.join(d, 'slot-transitions.jsonl');

console.log('① a record\'s reads make no synchronous file call');
const askScene = (mod) => {
  seamed(mod);
  const D = dir('ask'), W = new mod.SlotTransitions({ dataDir: D }), R = new mod.SlotTransitions({ dataDir: D });
  for (let i = 0; i < 5; i++) W.record(row('s1', i % 2 ? 'a' : 'b', i % 2 ? 'b' : 'a', 1000 + i * 1000));
  R.all();   // the first read reads the file
  const { n } = syncCalls(() => { for (let i = 0; i < 200; i++) R.all(); });
  return { n, rows: R.all().length };
};
{
  const cure = askScene(copyOf());
  const red = askScene(copyOf(anchored(SRC, '    if (st.rows) { this._lookMaybe(); return st.rows; }', '    try { fs.statSync(this.file); } catch { }\n    if (st.rows) { this._lookMaybe(); return st.rows; }', 'a stat a call'), 'stat-a-call'));
  ok(!!(cure.n === 0 && cure.rows === 5), `two hundred reads after the first make ${cure.n} synchronous file calls (the reader instance, the writer another)`, cure);
  ok(!!(red.n === 200), `RED — the copy that stats at every read makes ${red.n}: the judge reads it red`, red);
}

console.log('② THE MONEY LAW: the writer\'s move is in the reader\'s next read; a failed write is read back as the file holds it');
const moneyScene = (mod) => {
  seamed(mod);
  const D = dir('money'), W = new mod.SlotTransitions({ dataDir: D }), R = new mod.SlotTransitions({ dataDir: D });
  W.record(row('s1', null, 'a', 1000)); W.record(row(null, null, 'a', 1500));
  R.all();
  W.record(row('s1', 'a', 'b', 2000));   // a move
  const next = syncCalls(() => R.all());
  const moved = { n: next.n, last: next.v[next.v.length - 1], eqFile: same(next.v, fresh(D)) };
  // a write behind the newest (a caller's own `at`): the read's order, as a read of the file gives it
  W.record(row(null, 'a', 'c', 1700));
  const back = { eqFile: same(R.all(), fresh(D)) };
  // A WRITE THAT FAILS with a part of it landed: the file ends in half a line
  const ap = fs.appendFileSync;
  fs.appendFileSync = function (f, data, ...a) { if (String(f) === fileOf(D)) { ap.call(this, f, String(data).slice(0, 25)); throw Object.assign(new Error('EIO'), { code: 'EIO' }); } return ap.call(this, f, data, ...a); };
  let failed; try { failed = W.record(row('s1', 'b', 'd', 3000)); } finally { fs.appendFileSync = ap; }
  const afterFail = { returned: failed, eqFile: same(R.all(), fresh(D)) };
  // the next write glues onto the half line: the file holds no parsable row for it, and neither does the reader
  W.record(row('s1', 'b', 'e', 4000));
  const glued = R.all(), file = fresh(D);
  const afterGlue = { eqFile: same(glued, file), hasE: glued.some((r) => r.to === 'e'), fileHasE: file.some((r) => r.to === 'e') };
  W.record(row('s1', 'b', 'f', 5000));   // and the write after that is a whole line again
  const later = R.all(), laterFile = fresh(D);
  return { moved, back, afterFail, afterGlue, later: { eqFile: same(later, laterFile), hasF: later.some((r) => r.to === 'f') } };
};
{
  const cure = moneyScene(copyOf());
  const noLand = moneyScene(copyOf(anchored(SRC, '        st.rows.push(back);\n', '', 'the write not landed'), 'no-land'));
  const keepOnFail = moneyScene(copyOf(anchored(SRC, '    } catch { st.rows = null; st.gen++; return null; }', '    } catch { return null; }', 'a failed write keeps the rows'), 'keep-on-fail'));
  const judgeMove = (x) => x.moved.n === 0 && x.moved.last && x.moved.last.to === 'b' && x.moved.eqFile && x.back.eqFile;
  const judgeFail = (x) => x.afterFail.returned === null && x.afterFail.eqFile && x.afterGlue.eqFile && x.afterGlue.hasE === x.afterGlue.fileHasE && x.later.eqFile && x.later.hasF;
  ok(!!(judgeMove(cure)), 'the writer\'s move is in the reader\'s NEXT read with nothing between (no file call), and a write behind the newest sits where a read of the file puts it', cure.moved);
  ok(!!(judgeFail(cure)), 'a write that FAILED with half a line landed: the reader holds what the file holds after it, after the next write glued onto that half (no row the file does not hold), and after the whole line that follows', { afterFail: cure.afterFail, afterGlue: cure.afterGlue, later: cure.later });
  ok(!!(!judgeMove(noLand) && noLand.moved.last && noLand.moved.last.to !== 'b'), 'RED — the copy whose write does not land in the kept rows: the reader\'s next read misses the move', noLand.moved);
  ok(!!(!judgeFail(keepOnFail) && keepOnFail.afterGlue.hasE && !keepOnFail.afterGlue.fileHasE), 'RED — the copy whose failed write keeps the rows: after the glued write the reader holds a row the file does not', keepOnFail.afterGlue);
}

console.log('③ a trim, whole and failed half-way, is read back as the files hold it');
const trimScene = (mod) => {
  seamed(mod);
  const D = dir('trim'), W = new mod.SlotTransitions({ dataDir: D, max: 6 }), R = new mod.SlotTransitions({ dataDir: D, max: 6 });
  R.all();
  for (let i = 0; i < 7; i++) W.record(row('s1', i % 2 ? 'a' : 'b', i % 2 ? 'b' : 'a', 1000 + i * 1000));   // the 7th line trims
  const whole = { n: R.all().length, eqFile: same(R.all(), fresh(D)), shards: fs.readdirSync(path.join(D, 'archive')).length };
  for (let i = 7; i < 9; i++) W.record(row('s1', i % 2 ? 'a' : 'b', i % 2 ? 'b' : 'a', 1000 + i * 1000));
  R.all();
  const rn = fs.renameSync; let threw = 0;
  fs.renameSync = function (a, b) { if (String(b) === fileOf(D) && !threw) { threw++; throw Object.assign(new Error('EIO'), { code: 'EIO' }); } return rn.call(this, a, b); };
  try { W.record(row('s1', 'a', 'b', 1000 + 9 * 1000)); } finally { fs.renameSync = rn; }   // its trim appends the archive, then fails to rewrite the live file
  const file = fresh(D), got = R.all();
  return { whole, failed: { threw, eqFile: same(got, file), got: got.length, file: file.length } };
};
{
  const cure = trimScene(copyOf());
  const red = trimScene(copyOf(anchored(SRC, '    this._st.rows = null; this._st.gen++;   // a trim', '    // (no drop)   // a trim', 'the trim that drops nothing'), 'trim-keeps'));
  const judge = (x) => x.whole.n === 7 && x.whole.eqFile && x.whole.shards === 1 && x.failed.threw === 1 && x.failed.eqFile;
  ok(!!(judge(cure)), `a whole trim (seven rows, one shard) and a trim that failed half-way (${cure.failed.file} rows in the files, the archive's half twice) are each read back as the files hold them`, cure);
  ok(!!(!judge(red) && !red.failed.eqFile), `RED — the copy whose trim drops nothing: after the failed trim the reader holds ${red.failed.got} rows, the files ${red.failed.file}`, red);
}

console.log('④ THE BACKSTOP: an outside append is seen within the bound plus one look, never by a stat a call');
const backScene = async (mod) => {
  const s = seamed(mod);
  const D = dir('back'), W = new mod.SlotTransitions({ dataDir: D }), R = new mod.SlotTransitions({ dataDir: D });
  W.record(row('s1', null, 'a', 1000)); W.record(row('s1', 'a', 'b', 2000));
  const T0 = s.T; R.all();
  fs.appendFileSync(fileOf(D), JSON.stringify(row('s9', 'x', 'y', 2500)) + '\n');   // a writer OUTSIDE the hub
  s.T = T0 + mod.LOOK_EVERY_MS / 2; const early = syncCalls(() => R.all());
  const beforeBound = { n: early.n, looks: s.looks, seen: early.v.some((r) => r.to === 'y') };
  s.T = T0 + mod.LOOK_EVERY_MS; const onBound = syncCalls(() => R.all());
  await ticks();   // the look starts in a microtask, off the read
  const atBound = { n: onBound.n, looks: s.looks, seen: onBound.v.some((r) => r.to === 'y') };
  if (s.last) { await s.last.catch(() => { }); await ticks(); }
  const after = R.all();
  return { beforeBound, atBound, afterLook: { seen: after.some((r) => r.to === 'y'), eqFile: same(after, fresh(D)) } };
};
{
  const cure = await backScene(copyOf());
  const red = await backScene(copyOf(anchored(SRC, '    if (st.rows) { this._lookMaybe(); return st.rows; }', '    if (st.rows) return st.rows;', 'no backstop'), 'no-backstop'));
  const judge = (x) => x.beforeBound.n === 0 && x.beforeBound.looks === 0 && !x.beforeBound.seen && x.atBound.n === 0 && x.atBound.looks === 1 && !x.atBound.seen && x.afterLook.seen && x.afterLook.eqFile;
  ok(!!(judge(cure)), 'an outside append: unseen and unasked before the bound; at the bound the read answers its rows NOW (no file call) and ONE look starts off the loop; after that look the next read holds the files\' rows', cure);
  ok(!!(!judge(red) && !red.afterLook.seen), 'RED — the copy with no backstop never sees the outside append', red.afterLook);
}

console.log('⑤ the engine: a reading is filed on the member its request went out on, with 0 file asks a record');
const engineScene = async (ledgerPath, tag) => {
  const accSrc = read('src/accounts.js'), engSrc = read('src/server/usage-pool-engine.js');
  const AM = ledgerPath ? M.load('src/accounts.js', anchored(accSrc, "const { SlotTransitions } = require('./slot-transitions.js');", `const { SlotTransitions } = require(${JSON.stringify(ledgerPath)});`, 'the writer on the copy'), 'acc-' + tag).AccountManager
    : require(path.join(REPO, 'src/accounts.js')).AccountManager;
  const ENG = ledgerPath ? M.load('src/server/usage-pool-engine.js', anchored(engSrc, "const { SlotTransitions } = require('../slot-transitions.js');", `const { SlotTransitions } = require(${JSON.stringify(ledgerPath)});`, 'the reader on the copy'), 'eng-' + tag)
    : require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const root = dir('eng-' + tag), dataDir = path.join(root, 'data');
  const am = new AM({ dataDir });
  const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }));
  const A = am.createSubscription({ name: 'Member A' }).id; login(A);
  const B = am.createSubscription({ name: 'Member B' }).id; login(B);
  const P = am.createPool({ name: 'Pool' }).id;
  am.setPoolTarget(P, A);
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const sessions = new Map();
  const eng = ENG.create({
    app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null,
  });
  const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'w-ledger-' + tag, claudeSessionId: 'c-ledger-' + tag, _accountId: P, pty: { write() { } }, name: 'w-ledger-' + tag };
  sessions.set(s._webuiId, s); am.ensureSessionPoolLink(P, s._webuiId, B);
  await sleep(3); s._lastRequestOutAt = Date.now(); await sleep(3);
  const onB = eng.readingSlotFor(s, Date.now());   // the common road: the request went out on B, nothing moved
  const asks = syncCalls(() => { for (let i = 0; i < 50; i++) eng.readingSlotFor(s, Date.now()); });
  am.ensureSessionPoolLink(P, s._webuiId, A); await sleep(3);   // the pool moves the conversation AFTER its request went out
  const afterMove = eng.readingSlotFor(s, Date.now());
  const movedAsks = syncCalls(() => { for (let i = 0; i < 50; i++) eng.readingSlotFor(s, Date.now()); });
  s._lastRequestOutAt = Date.now(); await sleep(3);   // the next request goes out on the new member
  const next = eng.readingSlotFor(s, Date.now());
  return { A, B, onB: onB && onB.key, asks: asks.n, afterMove: afterMove && afterMove.key, movedAt: !!(afterMove && afterMove.movedAt), movedAsks: movedAsks.n, next: next && next.key };
};
{
  const cure = await engineScene(null, 'real');
  const noLandPath = M.write('src/slot-transitions.js', anchored(SRC, '        st.rows.push(back);\n', '', 'the write not landed'), 'eng-no-land');
  const red = await engineScene(noLandPath, 'noland');
  const judge = (x) => x.onB === x.B && x.asks === 0 && x.afterMove === x.B && x.movedAt && x.movedAsks === 0 && x.next === x.A;
  ok(!!(judge(cure)), `the engine files a record on the member its request went out on: B before the move (${cure.asks} file asks over 50 records), still B after a move to A that came after the request (movedAt; ${cure.movedAsks} asks), A for the next request`, cure);
  ok(!!(!judge(red) && red.afterMove !== red.B), 'RED — the writer and the engine on a ledger whose writes do not land in the kept rows: the record after the move is filed on the wrong member', red);
}

console.log('⑥ the look off the loop: a look that never answers holds no read and starts no second look');
const stallScene = async (mod) => {
  const s = seamed(mod); s.stall = true;
  const D = dir('stall'), W = new mod.SlotTransitions({ dataDir: D }), R = new mod.SlotTransitions({ dataDir: D });
  W.record(row('s1', null, 'a', 1000));
  const T0 = s.T; R.all();
  let n = 0, rows = 0;
  for (let k = 1; k <= 3; k++) { s.T = T0 + k * mod.LOOK_EVERY_MS; const r = syncCalls(() => { let v; for (let i = 0; i < 50; i++) v = R.all(); return v; }); n += r.n; rows = r.v.length; await ticks(); }
  W.record(row('s1', 'a', 'b', 2000));   // the hub's own write still lands while the look is out
  return { looks: s.looks, n, rows, hubWrite: R.all().some((r) => r.to === 'b') };
};
{
  const cure = await stallScene(copyOf());
  const red = await stallScene(copyOf(anchored(SRC, 'if (st.lookOut || t - st.lookAt < LOOK_EVERY_MS) return;', 'if (t - st.lookAt < LOOK_EVERY_MS) return;', 'a look a bound'), 'look-a-bound'));
  const judge = (x) => x.looks === 1 && x.n === 0 && x.rows === 1 && x.hubWrite;
  ok(!!(judge(cure)), `a look that never answers: three bounds crossed, 150 reads answer at once with no file call, ${cure.looks} look out; the hub's own write still lands`, cure);
  ok(!!(!judge(red) && red.looks === 3), `RED — the copy that starts a look at every bound puts ${red.looks} out on the stalled share`, red);
}

console.log('⑦ two ledgers side by side never wake each other; two spellings of one path are one file');
const sideScene = (mod) => {
  seamed(mod);
  const Da = dir('side-a'), Db = dir('side-b');
  const Wa = new mod.SlotTransitions({ dataDir: Da }), Rb = new mod.SlotTransitions({ dataDir: Db });
  const Ra = new mod.SlotTransitions({ dataDir: path.relative(process.cwd(), Da) });   // another spelling of the same folder
  Wa.record(row('s1', null, 'a', 1000)); Rb.all(); Ra.all();
  Wa.record(row('s1', 'a', 'b', 2000));
  const a = syncCalls(() => Ra.all()), b = syncCalls(() => Rb.all());
  return { aSees: a.v.some((r) => r.to === 'b'), aCalls: a.n, bRows: b.v.length, bCalls: b.n, bEqFile: same(b.v, fresh(Db)) };
};
{
  const cure = sideScene(copyOf());
  const red = sideScene(copyOf(anchored(SRC, '  const k = path.resolve(file);', "  const k = 'one';", 'one state for the process'), 'one-state'));
  const judge = (x) => x.aSees && x.aCalls === 0 && x.bRows === 0 && x.bEqFile;
  ok(!!(judge(cure)), 'a write in ledger A is in A\'s reader (another spelling of A\'s folder: the same file, no file call), and ledger B\'s reader holds only B\'s file', cure);
  ok(!!(!judge(red) && red.bRows > 0), 'RED — the copy with one state for the process: B\'s reader holds rows B\'s file does not', red);
}

console.log('⑧ pins: the census still counts the ledger\'s reader sites; the kb says the law');
{
  const kb = read('docs/kb-file-structure.md');
  ok(!!(/fs\.promises\.stat\(this\.file\)/.test(SRC) && !/fs\.statSync\(this\.file\)/.test(SRC)), 'the backstop\'s look is a counted reader site (fs.promises.stat named, not hidden behind an alias)', 'src/slot-transitions.js');
  ok(!!(/THE LEDGER IS READ FROM MEMORY/.test(kb) && /test-slot-ledger-reads/.test(kb)), 'kb-file-structure says the ledger is read from memory, the money law and the backstop');
}

report();
