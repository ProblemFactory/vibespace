#!/usr/bin/env node
// B-f276's remainder unit 2 (lane bl-windows, 主开发 r1702 / r2407) — «a parked wake dropped silently»: data/msg-retry.json (the
// deliverer's retry park) and data/desktop-apps-hosts.json (the desktop keeper's paired machines) under THE STORE READ.
// The release read a FAILED read (EIO, EACCES…) as an empty file: the next write went over it, and every wake the last run had
// parked (a billed send, a paced wake, a wake owed to an ended conversation) — or a machine's app records — was gone, unsaid.
// Now a read that failed is HELD, each leg with its red control:
//   ① a failed read at the start: the park HELD, a new wake parked in memory, the healthy file untouched byte for byte; read again
//     at the park's own road past the store read's gap — the last run's wake joins the park and the file holds both.
//     RED: the release's «fresh park» (the file written over, the last run's wake gone from disk).
//   ② torn bytes whose set-aside is refused: their only copy — held, kept. RED: a failed set-aside starts empty.
//   ③ torn bytes found by a READ AGAIN: set aside off the loop (kept), then lifted. RED: written over.
//   ④ never sooner than the store read's gap. RED: a read at every park.
//   ⑤ a read again that never settles: past the bound a new read may start, never more than two. RED: no bound / no cap.
//   ⑥ while a set-aside's rename is out, no read starts. RED: a read starts.
//   ⑦ desktop-apps-hosts.json: a failed read HELD — a save refused, the file kept; read again at the keeper's tick, its machines join.
//     RED: written over.  ⑧ its torn bytes set aside, never written over. RED: written over.
//   ⑨ B-0248 step 2, unit 3 (lane bl-loop-b, r3320): desktop-apps-hosts.json is written by the store writer, off the loop — a placed
//     400 ms stall in the main thread's writes holds nothing (RED: the release's temp + rename on the loop); a failed write is said
//     once and written again (RED: unsaid); the keeper's stop writes what is owed (RED: the stop flushes nothing).
//   line 494's follow (主开发 r2695), each with its red: ⑨ THE MONEY — the same paced wake and the same ended conversation in the file
//   and in memory: ONE frame, ONE resume (the file's ended wake folds into the resume made while held; the file's older entry first);
//   ⑩ a stop while held says what memory alone held; ⑪ the adopted entries' bound counts from the lift.
// In-process: the real deliverer and keeper over scratch data/, a manual clock; nothing is posted anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('mr-held');
const { ok, report } = checker();
const DELIVER0 = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const K0 = require(path.join(REPO, 'src/server/desktop-app-keeper.js'));
const D = require(path.join(REPO, 'src/desktop-display.js'));
const DSRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
const KSRC = fs.readFileSync(path.join(REPO, 'src/server/desktop-app-keeper.js'), 'utf8');
const MUT = mutantCopies('mr-held', REPO);
const T0 = 1_790_000_000_000;
const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'aaaaaaaa-0000-4000-8000-000000000002';
const stand = (code) => Object.assign(new Error(`${code}: stand-in`), { code });
const tick = () => new Promise((z) => setImmediate(z));

let wn = 0;
/** one deliverer over a scratch data/: `failBoot` = the start's read fails by that code, `asideFails` = the start's set-aside refused */
function world(DL = DELIVER0, { text = null, failBoot = null, asideFails = false, dir = null, posts = null, c: c0 = null, dead = [] } = {}) {
  const dataDir = dir || path.join(ROOT, `w${++wn}`); fs.mkdirSync(dataDir, { recursive: true });
  const file = path.resolve(path.join(dataDir, 'msg-retry.json'));
  if (text != null) fs.writeFileSync(file, text);
  const c = c0 || { now: T0, timers: [] }, logs = [];
  const realRead = fs.readFileSync, realRename = fs.renameSync;
  let boots = 0;
  if (failBoot) fs.readFileSync = function (p, ...a) { if (!boots && path.resolve(String(p)) === file) { boots++; throw stand(failBoot); } return realRead.call(this, p, ...a); };
  if (asideFails) fs.renameSync = function (a, b) { if (path.resolve(String(a)) === file) throw stand('EACCES'); return realRename.call(this, a, b); };
  let d;
  try {
    d = DL.create({ dataDir, activeSessions: new Map(), serverSetting: () => undefined, log: (...a) => logs.push(a.join(' ')),
      peerMsg: { findPeer: (cid) => (dead.includes(cid) ? null : { name: cid, socketPath: '/dev/null' }),   // `dead`: ENDED conversations (no inbox — a wake owed to one goes to the resume line)
                 postToPeer: async (peer, text) => { if (!posts) return { ok: false }; posts.push({ cid: peer.name, text }); return { ok: true, phase: 'written' }; }, postChannelEvent: async () => ({ ok: false }) },
      retryClock: { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + ms, fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } } });
  } finally { fs.readFileSync = realRead; fs.renameSync = realRename; }
  const park = (cid, key) => d.parkOwedWake(cid, { producer: 'test-held', key, retryInMs: 60_000, text: 'a wake held for the pace', meta: { k: key } });
  const settle = async () => { for (let i = 0; i < 4; i++) { const p = d._retryReading(); if (p) await p; await tick(); } };
  const onDisk = () => (fs.existsSync(file) ? realRead(file, 'utf8') : null);
  const asides = () => fs.readdirSync(dataDir).filter((f) => f.startsWith('msg-retry.json.corrupt-')).length;
  /** the manual clock moved to `to`, every timer fired in its order, each attempt settled */
  const advanceTo = async (to) => { for (;;) { c.timers.sort((x, y) => x.at - y.at); const t = c.timers[0]; if (!t || t.at > to) break; c.timers.shift(); c.now = Math.max(c.now, t.at); t.fn(); await d.settleRetries(2000); await tick(); } c.now = to; await d.settleRetries(2000); await tick(); };
  return { d, c, file, dataDir, logs, park, settle, onDisk, asides, advanceTo };
}
/** the last run's file: ONE paced wake owed to A (the money case: it was promised a wake) */
const OLD = JSON.stringify({ [A]: [{ id: 'rt-old-1', cid: A, text: 'a wake of the last run', kind: 'peer', spendReason: 'peer-message', producer: 'test-held', key: 'k-old', meta: { k: 'k-old' }, senders: [], held: { why: 'paced', reason: 'paced' }, attempts: [], firstAt: T0 - 600e3, nextAt: T0 + 60e3 }] });
const TORN = '{"' + A + '":[{"id":"rt-old-1","cid":';
const cut = (src, from, to, why, tag) => MUT.load('src/server/conversation-deliver.js', anchored(src, from, to, why), tag);

console.log('① a failed READ of the park at the start — held, a new wake in memory, read again at the park\'s own road');
const heldRun = async (DL) => {
  const w = world(DL, { text: OLD, failBoot: 'EIO' });
  const h = w.d.retryHeldState();
  const p1 = w.park(B, 'k-new');   // a new paced wake while held: parked in memory, its write refused
  const during = { code: h && h.code, parked: !!(p1 && p1.parked), memB: w.d.retryPeek(B).length, memA: w.d.retryPeek(A).length, kept: w.onDisk() === OLD };
  w.c.now = T0 + 31_000;   // past the store read's first gap
  w.park(B, 'k-new-2'); await w.settle();   // the park's own road reads the file again
  const disk = JSON.parse(w.onDisk() || '{}');
  return { during, after: { held: !!w.d.retryHeldState(), memA: w.d.retryPeek(A).length, oldBack: w.d.retryPeek(A).some((e) => e.id === 'rt-old-1'), diskA: (disk[A] || []).length, diskB: (disk[B] || []).length } };
};
const h1 = await heldRun(DELIVER0);
console.log(`    facts: ${JSON.stringify(h1)}`);
ok(h1.during.code === 'EIO' && h1.during.parked && h1.during.memB === 1 && h1.during.memA === 0 && h1.during.kept, 'the start\'s read FAILS (EIO): the park is HELD — a new wake is parked in memory, the healthy file untouched byte for byte (the last run\'s wake not taken for gone)', h1.during);
ok(!h1.after.held && h1.after.oldBack && h1.after.diskA === 1 && h1.after.diskB >= 1, 'READ AGAIN at the park\'s own road past the gap: the last run\'s wake joins the park, the hold lifts, and the file holds BOTH (the old wake and the new)', h1.after);
const h1x = await heldRun(cut(DSRC, "    else if (a.state === 'unreadable') holdRetry(a);\n", '', 'the release\'s «fresh park»', 'mr-fresh'));
ok(!h1x.during.kept && !h1x.after.oldBack && h1x.after.diskA === 0, 'RED CONTROL (the release\'s read: a failed read is a fresh park): the first new park WRITES OVER the file — the last run\'s wake is gone from disk', h1x);

console.log('② torn bytes whose set-aside is refused — their only copy, held');
const asideRun = (DL) => { const w = world(DL, { text: TORN, asideFails: true }); w.park(B, 'k-x'); const h = w.d.retryHeldState(); return { code: h && h.code, kept: w.onDisk() === TORN }; };
const a2 = asideRun(DELIVER0);
ok(a2.code === 'not set aside' && a2.kept, 'torn bytes whose set-aside is refused (EACCES): HELD, the bytes kept as they are — a new park never writes over their only copy', a2);
const a2x = asideRun(cut(DSRC, '      a = SR.afterSetAside(a, moved ? path.basename(aside) : null);\n', "      a = { state: 'missing' };\n", 'a failed set-aside starts empty', 'mr-aside-empty'));
ok(!a2x.code && !a2x.kept, 'RED CONTROL (a failed set-aside starts empty, the release\'s road): the next park writes over the only copy — red', a2x);

console.log('③ torn bytes found by a READ AGAIN — set aside off the loop, kept');
const tornAgainRun = async (DL) => {
  const w = world(DL, { text: OLD, failBoot: 'EIO' });
  fs.writeFileSync(w.file, TORN);   // the file is torn when it is read again
  const realRename = fs.renameSync;
  let sync = 0;
  fs.renameSync = function (a, b) { if (path.resolve(String(a)) === w.file) sync++; return realRename.call(this, a, b); };
  try { w.c.now = T0 + 31_000; w.park(B, 'k-t'); await w.settle(); } finally { fs.renameSync = realRename; }
  return { held: !!w.d.retryHeldState(), sync, asides: w.asides(), keptAside: w.asides() === 1 && fs.readFileSync(path.join(path.dirname(w.file), fs.readdirSync(path.dirname(w.file)).find((f) => f.startsWith('msg-retry.json.corrupt-'))), 'utf8') === TORN };
};
const t3 = await tornAgainRun(DELIVER0);
ok(!t3.held && t3.sync === 0 && t3.keptAside, 'torn bytes found by the read again: set aside by an ASYNC rename (no synchronous rename after the start), their bytes kept, the hold lifted', t3);
const t3x = await tornAgainRun(cut(DSRC, "    if (a.state === 'corrupt') {\n      retryAsiding = true;\n", "    if (false) {\n      retryAsiding = true;\n", 'the read again takes torn bytes for «not there»', 'mr-torn-over'));
ok(t3x.asides === 0, 'RED CONTROL (the read again takes torn bytes for «not there»): the park writes over them — nothing set aside — red', t3x);

console.log('④ never sooner than the store read\'s gap');
const gapRun = async (DL) => {
  const w = world(DL, { text: OLD, failBoot: 'EIO' });
  const realP = fs.promises.readFile;
  let reads = 0;
  fs.promises.readFile = async function (p, ...a) { if (path.resolve(String(p)) === w.file) { reads++; throw stand('EIO'); } return realP.call(this, p, ...a); };
  const out = {};
  try {
    w.c.now = T0 + 1_000; w.park(B, 'k-1'); await w.settle(); out.early = reads;
    w.c.now = T0 + 31_000; w.park(B, 'k-2'); await w.settle(); out.first = reads;
    w.c.now = T0 + 41_000; w.park(B, 'k-3'); await w.settle(); out.second = reads;   // the second try waits 60 s after the first
    w.c.now = T0 + 92_000; w.park(B, 'k-4'); await w.settle(); out.third = reads;
  } finally { fs.promises.readFile = realP; }
  out.held = !!w.d.retryHeldState();
  return out;
};
const g4 = await gapRun(DELIVER0);
ok(g4.early === 0 && g4.first === 1 && g4.second === 1 && g4.third === 2 && g4.held, 'a held park is read again at its own roads, never sooner than the store read\'s gap (30 s, then 60 s …) — a park storm reads nothing more', g4);
const g4x = await gapRun(cut(DSRC, '    else if (now - Number(H.readAt || 0) < SR.retryDelay(H.tries)) return null;\n', '', 'no gap', 'mr-no-gap'));
ok(g4x.early > 0, 'RED CONTROL (no gap): every park reads the storage that just failed — red', g4x);

console.log('⑤ a read again that never settles — bounded');
const stuckRun = async (DL) => {
  const w = world(DL, { text: OLD, failBoot: 'EIO' });
  const realP = fs.promises.readFile;
  let reads = 0;
  fs.promises.readFile = function (p, ...a) { if (path.resolve(String(p)) === w.file) { reads++; return new Promise(() => { }); } return realP.call(this, p, ...a); };   // a dead mount: never answers
  const out = {};
  try {
    w.c.now = T0 + 31_000; w.park(B, 'k-1'); out.first = reads;
    w.park(B, 'k-2'); out.within = reads;   // inside the bound: it rides the read in flight
    w.c.now = T0 + 62_000; w.park(B, 'k-3'); out.past = reads;   // past the bound: one more read may start (still held)
    w.c.now = T0 + 93_000; w.park(B, 'k-4'); out.max = reads;   // …never more than two at once
    out.held = !!w.d.retryHeldState();
  } finally { fs.promises.readFile = realP; }
  return out;
};
const BOUND = '    if (retryReading) { if (now - retryReadAt < RETRY_REREAD_BOUND_MS || retryReads >= RETRY_REREADS_MAX) return retryReading; }\n';
const s5 = await stuckRun(DELIVER0);
ok(s5.first === 1 && s5.within === 1 && s5.past === 2 && s5.max === 2 && s5.held, 'a read again that never settles: inside the bound the park rides it, past the bound one more may start — still held, never more than two at once', s5);
const s5x = await stuckRun(cut(DSRC, BOUND, '    if (retryReading) return retryReading;\n', 'one read for ever', 'mr-stuck-forever'));
ok(s5x.past === 1, 'RED CONTROL (no bound): a hung read keeps the park from ever reading again — red', s5x);
const s5m = await stuckRun(cut(DSRC, BOUND, '    if (retryReading) { if (now - retryReadAt < RETRY_REREAD_BOUND_MS) return retryReading; }\n', 'no cap', 'mr-stuck-nomax'));
ok(s5m.max === 3, 'RED CONTROL (no cap): hung reads pile up on the threads every file read shares — red', s5m);

console.log('⑥ while a set-aside\'s rename is out, no read starts');
const asidingRun = async (DL) => {
  const w = world(DL, { text: OLD, failBoot: 'EIO' });
  fs.writeFileSync(w.file, TORN);
  const realP = fs.promises.readFile, realR = fs.promises.rename;
  let reads = 0, land = null;
  fs.promises.readFile = function (p, ...a) { if (path.resolve(String(p)) === w.file) reads++; return realP.call(this, p, ...a); };
  fs.promises.rename = function (a, b) { if (path.resolve(String(a)) === w.file) return new Promise((z) => { land = () => z(realR.call(fs.promises, a, b)); }); return realR.call(this, a, b); };
  const out = {};
  try {
    w.c.now = T0 + 31_000; w.park(B, 'k-1'); { const end = Date.now() + 5000; while (!land && Date.now() < end) await new Promise((z) => setTimeout(z, 5)); }   // the real read answers, then the rename starts (the bound is a red line, never the wait)
    out.renaming = !!land; out.first = reads;
    w.c.now = T0 + 400_000; w.park(B, 'k-2'); await tick(); out.during = reads;   // past every gap and bound: still nothing while the rename is out
    if (land) land(); await w.settle(); await tick();
    out.held = !!w.d.retryHeldState(); out.asides = w.asides();
  } finally { fs.promises.readFile = realP; fs.promises.rename = realR; }
  return out;
};
const r6 = await asidingRun(DELIVER0);
ok(r6.renaming && r6.first === 1 && r6.during === 1 && !r6.held && r6.asides === 1, 'while a set-aside\'s rename is out no read starts (its own outcome settles the hold): set aside, lifted', r6);
const r6x = await asidingRun(cut(DSRC, "    if (retryAsiding) return retryReading;   // a set-aside's rename is out: its own outcome settles the hold — no read starts meanwhile (r2550 (1)(2), carried)\n", '', 'a read during the rename', 'mr-aside-read'));
ok(r6x.during > r6x.first, 'RED CONTROL (a read starts while the rename is out): a second read meets the file mid-move — red', r6x);

console.log('⑨ line 494\'s follow (r2695 (1)) THE MONEY: the same owed wake and the same ended conversation in both sets — ONE frame, ONE resume');
const C = 'aaaaaaaa-0000-4000-8000-000000000003';
const twinsRun = async (DL) => {
  const w1 = world(DL, { dead: [C] });   // the last run: one paced wake owed to A, one wake owed to the ended conversation C — on disk
  const fileOwed = w1.d.parkOwedWake(A, { producer: 'test-held', key: 'k-twin', retryInMs: 60_000, sender: 'S1', text: 'a wake held for the pace', meta: { k: 'k-twin' } });
  w1.d.parkEndedWake(C, { producer: 'test-ended', spendReason: 'peer-message', kind: 'peer', fromName: 'Stand-in', sender: 'S1', reason: 'a job ended' });
  w1.d.closeRetries();
  const fileC = w1.d.retryPeek(C).length;
  const posts = [], resumes = [];
  const w = world(DL, { dir: w1.dataDir, failBoot: 'EIO', posts, dead: [C] });   // this start's read FAILS: held
  w.d.registerWakePacer(() => { const m = () => true; m.force = () => ({ ok: true }); m.refund = () => { }; return m; });
  w.d.registerOwedWake('test-held', { render: () => ({ text: 'the words of the wake', kind: 'peer', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { } });
  w.d.registerEndedWake((cid, e) => { resumes.push({ cid, id: e.id }); return Promise.resolve({ outcome: 'delivered' }); });
  w.d.parkOwedWake(A, { producer: 'test-held', key: 'k-twin', retryInMs: 60_000, sender: 'S1', text: 'a wake held for the pace', meta: { k: 'k-twin' } });   // its twin, in memory
  w.d.parkEndedWake(C, { producer: 'test-ended', spendReason: 'peer-message', kind: 'peer', fromName: 'Stand-in', sender: 'S1', reason: 'a peer message' });   // C's wake, in memory
  await w.advanceTo(T0 + 5_000);   // memory's ended wake RESUMES C while the file is held (delivered)
  const during = { fileC, held: !!w.d.retryHeldState(), resumes: resumes.length };
  w.c.now = T0 + 31_000;
  w.d.parkOwedWake(B, { producer: 'test-held', key: 'k-trig', retryInMs: 60_000, sender: 'S2', text: 'a wake held for the pace', meta: { k: 'k-trig' } });   // the park's road reads the file again
  await w.settle();
  const firstA = (w.d.retryPeek(A)[0] || {}).id || null;
  await w.advanceTo(T0 + 600_000);
  return { during, held: !!w.d.retryHeldState(), fileOwed: fileOwed && fileOwed.id, firstA, resumes: resumes.length, postsA: posts.filter((p) => p.cid === A).length };
};
const tw = await twinsRun(DELIVER0);
console.log(`    facts: ${JSON.stringify(tw)}`);
ok(tw.during.fileC === 1 && tw.during.held && tw.during.resumes === 1 && !tw.held && tw.resumes === 1, 'the file\'s wake owed to the ended conversation C folds into the resume made while the file was held — ONE resume, never a second billed turn for the same words', tw);
ok(tw.firstA === tw.fileOwed && tw.postsA === 1, 'the same paced wake in the file and in memory: the file\'s (older) entry first in the queue, ONE frame posted', tw);
const twx = await twinsRun(cut(DSRC, '          if (isEnded(e) && (live || settled === \'delivered\' || settled === \'running\')) {\n', '          if (false) {\n', 'the file\'s ended wake handed to the line again', 'mr-fold-cut'));
ok(twx.resumes === 2, 'RED CONTROL (the lift appends the file\'s ended wake unfolded, as before): C is resumed a SECOND time — red', twx);
const two = await twinsRun(cut(DSRC, '        retry[cid] = [...keep, ...mem];', '        retry[cid] = [...mem, ...keep];', 'memory\'s first', 'mr-order-mem'));
ok(two.firstA !== two.fileOwed && two.postsA === 1, 'RED CONTROL (memory\'s entries first, as before): still ONE frame, but the newer twin leads — the older wake\'s first miss is lost — red', two);

console.log('⑨b line 529\'s small (r2795): THE RECORD IS STICKY AND COMPLETE — a delivery while held is said until the lift, by every road');
// (a) the line answers that its bound passed (failed), and its late road then reports DELIVERED; (b) a delivery, then a later wake for the
// same conversation fails — either way the file's older wake for C folds at the lift: ONE resume
const recordRun = async (DL, mode) => {
  const w1 = world(DL, { dead: [C] });
  w1.d.parkEndedWake(C, { producer: 'test-ended', spendReason: 'peer-message', kind: 'peer', fromName: 'Stand-in', sender: 'S1', reason: 'a job ended' });
  w1.d.closeRetries();
  const resumes = [];
  let handed = null, answers = mode === 'late' ? ['failed'] : ['delivered', 'failed'];
  const w = world(DL, { dir: w1.dataDir, failBoot: 'EIO', dead: [C] });
  w.d.registerEndedWake((cid, e) => { handed = e; resumes.push({ cid, id: e.id }); const o = answers.shift() || 'delivered'; return Promise.resolve(o === 'failed' ? { outcome: 'failed', why: mode === 'late' ? 'the line\'s bound passed' : 'the account is at its limit' } : { outcome: o }); });
  w.d.parkEndedWake(C, { producer: 'test-ended', spendReason: 'peer-message', kind: 'peer', fromName: 'Stand-in', sender: 'S1', reason: 'a peer message' });
  await w.advanceTo(T0 + 5_000);   // memory's wake goes to the line while held
  if (mode === 'late') w.d.noteLateWake(C, handed, { outcome: 'delivered' });   // (a) its rest delivered after the bound
  else { w.d.parkEndedWake(C, { producer: 'test-ended', spendReason: 'peer-message', kind: 'peer', fromName: 'Stand-in', sender: 'S1', reason: 'another message' }); await w.advanceTo(T0 + 10_000); }   // (b) a later one fails
  const during = resumes.length;
  w.c.now = T0 + 31_000;
  w.d.parkOwedWake(B, { producer: 'test-held', key: 'k-trig', retryInMs: 60_000, sender: 'S2', text: 'a wake held for the pace', meta: { k: 'k-trig' } });   // the park's road reads the file again
  await w.settle();
  await w.advanceTo(T0 + 600_000);
  return { during, held: !!w.d.retryHeldState(), resumes: resumes.length };
};
const ra = await recordRun(DELIVER0, 'late');
ok(ra.during === 1 && !ra.held && ra.resumes === 1, '(a) the line answers its bound passed, then its late road reports DELIVERED: the record says delivered — the file\'s older wake folds, ONE resume', ra);
const rax = await recordRun(cut(DSRC, '    if (r.outcome === \'delivered\' || r.outcome === \'running\') noteSettledHeld(cid, r.outcome);   // line 529\'s small (r2795 (a)): a resume whose rest delivered AFTER the line\'s bound is a delivery for the record too\n', '', 'the late road writes no record', 'mr-late-norecord'), 'late');
ok(rax.resumes === 2, 'RED CONTROL (today\'s record: the late road writes nothing): the file\'s wake resumes C a SECOND time — red', rax);
const rb = await recordRun(DELIVER0, 'later');
ok(rb.during === 2 && !rb.held && rb.resumes === 2, '(b) a delivery, then a later wake for C fails: the record stays «delivered» — the file\'s older wake folds (two resumes made while held, none more)', rb);
const rbx = await recordRun(cut(DSRC, '    if (was === \'delivered\' || was === \'running\') return;   // sticky: a later failure never writes over a delivery\n', '', 'a later outcome writes over the delivery', 'mr-not-sticky'), 'later');
ok(rbx.resumes === 3, 'RED CONTROL (not sticky: the later failure writes over «delivered»): the file\'s wake resumes C once more — red', rbx);

console.log('⑩ line 494\'s follow (r2695 (2)): a stop while held says what memory alone held');
const stopRun = (DL) => { const w = world(DL, { text: OLD, failBoot: 'EIO' }); w.park(B, 'k-s'); w.d.closeRetries(); return { said: w.logs.some((l) => /stops HELD .*1 delivery parked during the hold lived in memory only/.test(l)), kept: w.onDisk() === OLD }; };
const st = stopRun(DELIVER0);
ok(st.said && st.kept, 'a stop while held: one journal line with the count of what memory alone held; the file kept as it is', st);
const stx = stopRun(cut(DSRC, '    if (retryHeld) { const n = Object.values(retry).reduce((a, q) => a + (Array.isArray(q) ? q.length : 0), 0); if (n) log(`[deliver] the retry park stops HELD (data/msg-retry.json could not be read): ${n} deliver${n === 1 ? \'y\' : \'ies\'} parked during the hold lived in memory only and ${n === 1 ? \'is\' : \'are\'} not written — the file is kept as it is`); }\n', '', 'the stop says nothing', 'mr-stop-quiet'));
ok(!stx.said, 'RED CONTROL (the stop says nothing, as before): the memory-only wakes go with no word — red', stx);

console.log('⑪ line 494\'s follow (r2695 (3)): the adopted entries\' bound counts from the lift');
const boundRun = async (DL) => {
  const w1 = world(DL);
  w1.d.parkOwedWake(A, { producer: 'test-held', key: 'k-b', retryInMs: 60_000, sender: 'S1', text: 'a wake held for the pace', meta: { k: 'k-b' } });
  w1.d.closeRetries();
  const w = world(DL, { dir: w1.dataDir, failBoot: 'EIO' });
  let forced = 0, asked = 0;
  w.d.registerWakePacer(() => { const m = () => { asked++; return { reason: 'the floor', retryInMs: 60_000 }; }; m.force = () => { forced++; return { ok: true }; }; m.refund = () => { }; return m; });
  w.d.registerOwedWake('test-held', { render: () => ({ text: 'the words', kind: 'peer', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { } });
  w.c.now = T0 + 2 * 3600e3;   // a LONG hold: the file reads only now
  w.d.parkOwedWake(B, { producer: 'test-held', key: 'k-trig', retryInMs: 60_000, sender: 'S2', text: 'a wake held for the pace', meta: { k: 'k-trig' } });
  await w.settle();
  await w.advanceTo(T0 + 2 * 3600e3 + 30_000);
  return { held: !!w.d.retryHeldState(), forced, asked };
};
const bd = await boundRun(DELIVER0);
ok(!bd.held && bd.forced === 0 && bd.asked >= 1, 'after a two-hour hold the adopted paced wake is paced from the lift (asked, never forced past a bound it has not had) — «paced out from now» is true', bd);
const bdx = await boundRun(cut(DSRC, '        for (const e of q) if (e && typeof e === \'object\') e.boundFrom = liftAt;\n', '', 'the bound from the boot', 'mr-bound-boot'));
ok(bdx.forced >= 1, 'RED CONTROL (the bound counted from the boot, as before): the adopted wake is overdue at its first attempt and forced past the pace — red', bdx);

console.log('⑦ desktop-apps-hosts.json — a failed read held, read again at the keeper\'s tick');
const quiet = { log() { }, warn() { }, error() { } };
const fakeDisplay = { ...D, hostFacts: async () => ({ hostId: 'local', bins: {}, xpra: null }), binOnPath: () => null };
const HOSTS = JSON.stringify({ hosts: { 'dev-off': { apps: { 'da-1': { id: 'da-1', label: 'XTerm', state: 'running', hostId: 'local' } }, hub: {}, online: false } } });
const keeperWorld = (KM, { text, failBoot = null }) => {
  const kdir = path.join(ROOT, `k${++wn}`); fs.mkdirSync(kdir, { recursive: true });
  const file = path.resolve(path.join(kdir, KM.REMOTE_FILE));
  fs.writeFileSync(file, text);
  const clock = { t: T0 };
  const realRead = fs.readFileSync;
  let boots = 0;
  if (failBoot) fs.readFileSync = function (p, ...a) { if (!boots && path.resolve(String(p)) === file) { boots++; throw stand(failBoot); } return realRead.call(this, p, ...a); };
  let k;
  try {
    k = KM.create({ dataDir: kdir, env: () => ({ PATH: '/usr/bin:/bin', HOME: kdir }), broadcast: () => { }, serverSetting: () => undefined, display: fakeDisplay, log: quiet, serverNotice: () => 1,
      access: () => ({ call: async () => ({ ok: true, apps: [] }) }), hostLabel: (h) => h, remoteHosts: () => [], now: () => clock.t });
  } finally { fs.readFileSync = realRead; }
  return { k, clock, file, kdir, onDisk: () => realRead(file, 'utf8') };
};
const keeperRun = async (KM) => {
  const w = keeperWorld(KM, { text: HOSTS, failBoot: 'EIO' });
  const h = w.k._remoteHeld();
  w.k.noteInstalled('dev-x', { platform: 'win32', rows: [{ name: 'Notepad' }], total: 1, truncated: false, listedAt: T0 });   // a save while held
  await w.k.whenRemoteWritten();   // B-0248 unit 3: the file is the store writer's (off the loop) — on disk once its owed write lands (a save that writes over the file lands before «kept» is read)
  const during = { code: h && h.code, kept: w.onDisk() === HOSTS, off: !!w.k._remote().hosts['dev-off'] };
  w.clock.t = T0 + 31_000;
  await w.k.tick(); { const p = w.k._remoteReading(); if (p) await p; } await tick(); await w.k.whenRemoteWritten();
  const disk = JSON.parse(w.onDisk());
  return { during, after: { held: !!w.k._remoteHeld(), off: !!w.k._remote().hosts['dev-off'], diskOff: !!(disk.hosts || {})['dev-off'], diskX: !!(disk.installed || {})['dev-x'] } };
};
const k7 = await keeperRun(K0);
ok(k7.during.code === 'EIO' && k7.during.kept && !k7.during.off, 'the keeper\'s start read FAILS (EIO): HELD — a save is refused, the file kept byte for byte', k7.during);
ok(!k7.after.held && k7.after.off && k7.after.diskOff && k7.after.diskX, 'read again at the keeper\'s tick past the gap: the machine the file named joins (an offline machine\'s app kept), and the file holds it AND what was noted while held', k7.after);
const k7x = await keeperRun(MUT.load('src/server/desktop-app-keeper.js', anchored(KSRC, "    else if (a.state === 'unreadable') holdRemote(a);\n", '', 'the release\'s empty start'), 'mr-keeper-empty'));
ok(!k7x.during.kept && !k7x.after.diskOff, 'RED CONTROL (the release\'s read: a failed read is an empty file): the first save writes over it — the offline machine\'s app record is gone — red', k7x);

console.log('⑧ desktop-apps-hosts.json — torn bytes set aside, never written over');
const TORNK = '{"hosts":{"dev-off":{"apps":';
const tornKeeperRun = async (KM) => {
  // r3985 (lane bl-loop-b): THE RACE PLACED, never a fixed wait. The keeper sets the torn bytes aside by an async rename; the scene
  // HOLDS that rename (fs.promises.rename of the keeper's file waits on a gate) until the save has been made and judged, so the save
  // meets the set-aside out by construction, and «never written over» is ONE read (its bytes; ENOENT once moved) — the scene's old
  // existsSync-then-read let the rename land between the two (red twice under load in other lanes' runs, green alone)
  let release; const gate = new Promise((r) => { release = r; });
  const realRename = fs.promises.rename;
  fs.promises.rename = async function (a, b) { if (String(a).endsWith(KM.REMOTE_FILE)) await gate; return realRename.call(this, a, b); };
  let w, during = false;
  try {
    w = keeperWorld(KM, { text: TORNK });
    w.k.noteInstalled('dev-x', { platform: 'win32', rows: [], total: 0, truncated: false, listedAt: T0 });   // a save while the set-aside is out (held): it waits
    await w.k.whenRemoteWritten();   // whatever that save owes the writer has landed (nothing, when it waits for the set-aside)
    try { during = w.onDisk() === TORNK; } catch (e) { during = !!(e && e.code === 'ENOENT'); }   // still the torn bytes (or moved) — never written over
    release();
    { const p = w.k._remoteAsiding && w.k._remoteAsiding(); if (p) await p; } await tick(); await w.k.whenRemoteWritten();
  } finally { release(); fs.promises.rename = realRename; }
  const names = fs.readdirSync(w.kdir).filter((f) => f.startsWith(KM.REMOTE_FILE + '.corrupt-'));
  const disk = fs.existsSync(w.file) ? JSON.parse(fs.readFileSync(w.file, 'utf8')) : {};
  return { during, asides: names.length, keptAside: names.length === 1 && fs.readFileSync(path.join(w.kdir, names[0]), 'utf8') === TORNK, diskX: !!(disk.installed || {})['dev-x'], held: !!w.k._remoteHeld() };
};
const k8 = await tornKeeperRun(K0);
ok(k8.during && k8.keptAside && k8.diskX && !k8.held, 'torn bytes at the keeper\'s start: set aside OFF the loop (their bytes kept), a save made meanwhile waits for it, then the keeper writes a fresh file', k8);
const k8x = await tornKeeperRun(MUT.load('src/server/desktop-app-keeper.js', anchored(KSRC, "    else if (a.state === 'corrupt') asideRemote(a);\n", '', 'torn bytes written over'), 'mr-keeper-torn'));
ok(k8x.asides === 0, 'RED CONTROL (torn bytes not set aside, the release\'s road): the next save writes over them — red', k8x);
// r3985: the placed race's own red — a copy whose save does NOT wait for the set-aside (both guards cut: saveRemote's and the
// producer's): with the rename held, that save writes a fresh file over the torn bytes before they are moved — red
const k8w = await tornKeeperRun(MUT.load('src/server/desktop-app-keeper.js', anchored(anchored(KSRC, '    if (remoteHeld || remoteAsiding) { remoteDirty = true; if (remoteHeld && !remoteHeld.said) {', '    if (remoteHeld) { remoteDirty = true; if (remoteHeld && !remoteHeld.said) {', 'the save not waiting for the set-aside'), '        produce: () => { if (remoteHeld || remoteAsiding) { remoteDirty = true; return null; }', '        produce: () => { if (remoteHeld) { remoteDirty = true; return null; }', 'the producer not waiting for the set-aside'), 'mr-keeper-torn-nowait'));
ok(!k8w.during, 'RED CONTROL (the save not waiting for the set-aside, the race placed: the set-aside\'s rename held): the save writes over the torn bytes before they are moved — red', k8w);

// ── ⑨ B-0248 step 2, unit 3 (lane bl-loop-b, 主开发 r3320 / r3651): the paired machines' file is written by THE STORE WRITER ─
// The release wrote it by a synchronous temp + rename on the loop (the 5 s tick while a machine's app or a viewer's input moved):
// on the tree's slow-storage road that held the loop for the rename's whole delay (the page bl-loop-b/b0248-page.md, row 3)
console.log('⑨ B-0248 unit 3: desktop-apps-hosts.json written off the loop; a failed write said and written again; the stop writes what is owed');
{
  const STALL = require(path.join(REPO, 'scripts/fixtures/fs-stall.cjs'));
  const SW = require(path.join(REPO, 'src/store-writer.js')), STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs'));
  const STALL_MS = 400, TICK_MS = 10;
  const lateMeter = () => { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - TICK_MS); last = n; }, TICK_MS); return { stop() { clearInterval(t); return Math.round(worst); } }; };
  const listed = (n) => ({ platform: 'win32', rows: [{ name: 'App ' + n }], total: 1, truncated: false, listedAt: T0 + n });
  const installedOn = (text) => { try { return JSON.parse(text).installed || {}; } catch { return {}; } };
  // (a) THE PLACED STALL: every synchronous write-family call of THIS thread under the keeper's data folder held STALL_MS
  // (scripts/fixtures/fs-stall.cjs; the writer's thread loads its own fs, never held); four saves 150 ms apart
  const stallRun = async (KM, n = 4) => {   // n saves under the stall: the red copy needs ONE to hold the loop (the suite's time)
    const w = keeperWorld(KM, { text: HOSTS });
    await w.k.whenRemoteWritten();
    const S = STALL.install({ under: w.kdir, ms: STALL_MS }), meter = lateMeter();
    let late = null, landed = null;
    try {
      for (let i = 0; i < n; i++) { w.k.noteInstalled('dev-s' + i, listed(i)); await new Promise((r) => setTimeout(r, 150)); }
      landed = await w.k.whenRemoteWritten();
    } finally { late = meter.stop(); S.restore(); }
    const last = !!installedOn(w.onDisk())['dev-s' + (n - 1)];
    try { w.k.shutdown(); } catch { }
    return { late, landed, last, stalled: S.calls.filter((c) => c.kind === 'write' && c.stalled).length };
  };
  const A9 = await stallRun(K0);
  ok(A9.late < STALL_MS && A9.stalled === 0 && A9.landed === true && A9.last, `⑨a THE PLACED STALL (${STALL_MS} ms in every main-thread write under the keeper's folder): four saves of the paired machines' file, the loop's worst lateness ${A9.late} ms < one stall, NO main-thread write stalled, the last on disk`, A9);
  const REL9 = MUT.load('src/server/desktop-app-keeper.js', anchored(KSRC, "    remoteDirty = false;\n    try {\n      remoteWriter.dirty(remoteFile, {",
    "    remoteDirty = false;\n    { const tmp = remoteFile + '.tmp'; fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(remote, null, 2)); fs.renameSync(tmp, remoteFile); }\n    try {\n      if (false) remoteWriter.dirty(remoteFile, {",
    'the release\'s write on the loop'), 'mr-keeper-sync-write');
  const A9x = await stallRun(REL9, 1);   // one save held by the release's write on the loop is the red
  ok(A9x.late >= STALL_MS && A9x.stalled > 0, `⑨a RED control (the release's write: temp + rename on the loop): the loop is held a stall's length or more (${A9x.late} ms; ${A9x.stalled} main-thread writes stalled) (red)`, A9x);

  // (b) A FAILED WRITE IS SAID (once), the file stays owed and is written again at the next save
  const failRun = async (KM, { full = true } = {}) => {
    const kdir = path.join(ROOT, `k${++wn}`); fs.mkdirSync(kdir, { recursive: true }); fs.writeFileSync(path.join(kdir, KM.REMOTE_FILE), HOSTS);
    // the writer's own clock is PLACED and stepped past each refusal's backoff before the next save, so that save's urgent write is
    // due by the writer's own reckoning; every save is asked through whenRemoteWritten() (durable: urgent, so the debounce never
    // waits on the placed clock). A retry the writer ALREADY ARMED before the step still waits its real time — stepping the clock
    // re-arms no timer (lane bl-mail's measure, r3931: 1000–1006 ms real) — so each refusal here costs about a second of the suite
    const wclock = { t: 1e9 }, S = STAND.make(kdir + '-stand'), wr = SW.create({ log: quiet, workerPath: S.path, now: () => wclock.t }), said = [];
    const log = { log: (...a) => said.push(a.join(' ')), warn: (...a) => said.push(a.join(' ')), error() { } };
    const k = KM.create({ dataDir: kdir, env: () => ({ PATH: '/usr/bin:/bin', HOME: kdir }), broadcast: () => { }, serverSetting: () => undefined, display: fakeDisplay, log, serverNotice: () => 1,
      access: () => ({ call: async () => ({ ok: true, apps: [] }) }), hostLabel: (h) => h, remoteHosts: () => [], now: () => T0, writer: wr });
    S.failOn(KM.REMOTE_FILE, true);
    k.noteInstalled('dev-f1', listed(1)); const r1 = await k.whenRemoteWritten();
    if (!full) { const n = said.filter((l) => /could not write desktop-apps-hosts\.json/.test(l)).length; try { k.shutdown(); } catch { } try { wr.stop(); } catch { } return { r1, failSaid: n }; }   // the red copy: its first refusal only
    wclock.t += 600000; k.noteInstalled('dev-f2', listed(2)); const r2 = await k.whenRemoteWritten();
    const failSaid = said.filter((l) => /could not write desktop-apps-hosts\.json/.test(l)).length;
    S.failOn(KM.REMOTE_FILE, false);
    wclock.t += 600000; k.noteInstalled('dev-f3', listed(3)); const r3 = await k.whenRemoteWritten();
    const disk = installedOn(fs.readFileSync(path.join(kdir, KM.REMOTE_FILE), 'utf8'));
    const again = said.some((l) => /desktop-apps-hosts\.json is written again/.test(l));
    try { k.shutdown(); } catch { } try { wr.stop(); } catch { }
    return { r1, r2, failSaid, r3, again, all: ['dev-f1', 'dev-f2', 'dev-f3'].every((h) => !!disk[h]) };
  };
  const F9 = await failRun(K0);
  ok(F9.r1 === false && F9.r2 === false && F9.failSaid === 1 && F9.r3 === true && F9.again && F9.all, '⑨b A FAILED WRITE IS SAID once (two refused writes, one line), kept in memory, and written again: the next save lands all three machines\' lists and says so', F9);
  const F9x = await failRun(MUT.load('src/server/desktop-app-keeper.js', anchored(KSRC, "          if (!remoteWriteFailed) { remoteWriteFailed = true; log.warn?.(", "          if (false) { remoteWriteFailed = true; log.warn?.(", 'a failed write unsaid'), 'mr-keeper-fail-unsaid'), { full: false });
  ok(F9x.failSaid === 0, '⑨b RED control (the failure not said): no line names the refused write (red)', F9x);

  // (c) THE STOP WRITES WHAT IS OWED: a save the writer's debounce still holds is on disk when the keeper's shutdown returns
  const stopRun = async (KM) => {
    const w = keeperWorld(KM, { text: HOSTS });
    await w.k.whenRemoteWritten();
    w.k.noteInstalled('dev-z', listed(9));
    const before = !!installedOn(w.onDisk())['dev-z'];
    w.k.shutdown();
    return { before, after: !!installedOn(w.onDisk())['dev-z'] };
  };
  const C9 = await stopRun(K0);
  ok(!C9.before && C9.after, '⑨c THE STOP WRITES WHAT IS OWED: a save still in the writer\'s debounce is on disk when the keeper\'s shutdown returns (the writer\'s flushSync)', C9);
  const C9x = await stopRun(MUT.load('src/server/desktop-app-keeper.js', anchored(KSRC, "if (remoteDirty) saveRemote(); flushRemote(); }", "if (remoteDirty) saveRemote(); }", 'the stop flushes nothing'), 'mr-keeper-stop-noflush'));
  ok(!C9x.after, '⑨c RED control (the stop hands the write and returns): the file does not hold it when the stop returns (red)', C9x);
}

console.log('⑫ 主开发 r5164 (2), a silence of the release: the park\'s FAILED write — said ONCE a spell with its count, written again on the park\'s own clock (the stash\'s 30 s form)');
{
  const RELEASE_CATCH = "    try { fs.writeFileSync(retryFile + '.tmp', JSON.stringify(out)); fs.renameSync(retryFile + '.tmp', retryFile); return true; }\n    catch (e) { log('[deliver] retry park persist failed:', e.message); return false; }\n  };\n";   // stale-pins: kept (the release's text — this red control's own)
  const NEW_CATCH = "    try {\n      fs.writeFileSync(retryFile + '.tmp', JSON.stringify(out)); fs.renameSync(retryFile + '.tmp', retryFile);\n      if (parkFailing) { log(`[deliver] the retry park is on disk again (${parkFailing.n} failed write${parkFailing.n === 1 ? '' : 's'} since ${new Date(parkFailing.at).toISOString()})`); parkFailing = null; }\n      if (parkRetryTimer) { clock.clearTimeout(parkRetryTimer); parkRetryTimer = null; }   // healed by another write: no retry left behind\n      return true;\n    } catch (e) {\n      // 主开发 r5164 (2), a silence of the release: the park's failed write was a log line at every call with NO retry clock (the stash has\n      // its own 30 s one). Now said ONCE A SPELL with what it holds, and written again on its own clock — the stash's form\n      if (!parkFailing) {\n        parkFailing = { at: clock.now(), n: 0 };\n        const n = Object.values(out).reduce((k, q) => k + (Array.isArray(q) ? q.length : 0), 0);\n        log(`[deliver] the retry park could not be saved to disk (${(e && e.code) || 'an error'}) — its ${n} parked entr${n === 1 ? 'y is' : 'ies are'} held in memory only: ${retryClosed ? 'the stop\\'s own write, so they are lost with this stop' : `lost if VibeSpace restarts before it is written; written again every ${STASH_RETRY_MS / 1000} s`} (counted at this first failure)`);\n      }\n      parkFailing.n++;\n      if (!parkRetryTimer && !retryClosed) parkRetryTimer = clock.setTimeout(() => { parkRetryTimer = null; if (!retryClosed) writeRetryNow(); }, STASH_RETRY_MS);   // the park's own clock (unref'd); never after the stop\n      return false;\n    }\n  };\n";
  const failRun = async (DL) => {
    const w = world(DL), realRename = fs.renameSync; let refused = 0, failing = true, writes = 0;
    // the plant: the park's rename refused (EIO) while `failing`; `refused` is its WITNESS (r5135 law 1: a plant never read is a skip)
    fs.renameSync = function (a, b, ...x) { if (path.resolve(String(b)) === w.file) { writes++; if (failing) { refused++; throw stand('EIO'); } } return realRename.call(this, a, b, ...x); };
    try {
      w.park(B, 'k-f1'); w.park(B, 'k-f2');   // two parks: two failed writes
      const said = w.logs.filter((l) => /the retry park could not be saved to disk/.test(l)).length, before = w.onDisk();
      failing = false; const w0 = writes;
      await w.advanceTo(w.c.now + 31_000);   // the park's own clock moves past one retry (its due wake at 60 s is not reached)
      const disk = JSON.parse(w.onDisk() || '{}');
      return { refused, said, before, windowWrites: writes - w0, healed: (disk[B] || []).length, back: w.logs.some((l) => /the retry park is on disk again/.test(l)) };
    } finally { fs.renameSync = realRename; }
  };
  const f = await failRun(DELIVER0);
  if (!(f.refused >= 1)) console.log(`  SKIP ⑫: the placed refusal was never read (${JSON.stringify(f)})`);
  else {
    ok(f.said === 1 && f.before === null, '⑫ the park\'s failed write is said ONCE for the spell (two failed writes, one line naming what it holds) — nothing on disk meanwhile', f);
    ok(f.healed === 2 && f.back, '⑫ …and written again on the park\'s own clock: past 30 s both parked wakes are on disk, the heal said', f);
    ok(f.windowWrites === 1, '⑫ …by ONE timer: two failed writes, ONE retry write in its window (no pile-up)', f);
  }
  const fp = await failRun(cut(DSRC, "      if (!parkRetryTimer && !retryClosed) parkRetryTimer = clock.setTimeout(", "      if (!retryClosed) parkRetryTimer = clock.setTimeout(", 'a timer armed at every failed write', 'mr-park-pile'));
  if (!(fp.refused >= 2)) console.log(`  SKIP ⑫ PILE RED: the placed refusal was not read twice (${JSON.stringify(fp)})`);
  else ok(fp.windowWrites >= 2, '⑫ RED CONTROL (a timer armed at EVERY failed write): two retry writes in one window', fp);
  const fx = await failRun(cut(DSRC, NEW_CATCH, RELEASE_CATCH, 'the release\'s catch: a log line, no retry clock', 'mr-park-noclock'));
  if (!(fx.refused >= 1)) console.log(`  SKIP ⑫ RED: the placed refusal was never read (${JSON.stringify(fx)})`);
  else ok(fx.healed === 0 && fx.said === 0, '⑫ RED CONTROL (the release\'s catch: a log line per call, no clock): nothing is written again — the parked wakes stay in memory only', fx);
  // ⑫b THE STOP while failing: its own last write is tried, its failure said by name, and NO retry after it (the park's clock ends at closeRetries)
  const stopRun = async (DL) => {
    const w = world(DL), realRename = fs.renameSync; let refused = 0;
    fs.renameSync = function (a, b, ...x) { if (path.resolve(String(b)) === w.file) { refused++; throw stand('EIO'); } return realRename.call(this, a, b, ...x); };
    try {
      w.park(B, 'k-s1');   // the spell begins (a refused write), its retry armed
      w.d.closeRetries();   // the stop
      const atStop = refused, said = w.logs.some((l) => /the retry park stops NOT on disk: its last write failed — 1 parked entry held in memory only is lost with this stop/.test(l));
      await w.advanceTo(w.c.now + 61_000);
      return { refused, atStop, after: refused - atStop, said };
    } finally { fs.renameSync = realRename; }
  };
  const s1 = await stopRun(DELIVER0);
  if (!(s1.atStop >= 2)) console.log(`  SKIP ⑫b: the placed refusal was not read at the park and at the stop (${JSON.stringify(s1)})`);
  else ok(s1.said && s1.after === 0, '⑫b the STOP while failing: its last write tried and its failure SAID by name (what is lost with the stop); no retry after it', s1);
  const s1x = await stopRun(cut(DSRC, "      if (!parkRetryTimer && !retryClosed) parkRetryTimer = clock.setTimeout(() => { parkRetryTimer = null; if (!retryClosed) writeRetryNow(); }, STASH_RETRY_MS);", "      if (!parkRetryTimer) parkRetryTimer = clock.setTimeout(() => { parkRetryTimer = null; writeRetryNow(); }, STASH_RETRY_MS);", 'a retry armed after the stop', 'mr-park-afterstop'));
  if (!(s1x.atStop >= 2)) console.log(`  SKIP ⑫b RED: the placed refusal was not read at the park and at the stop (${JSON.stringify(s1x)})`);
  else ok(s1x.after >= 1, '⑫b RED CONTROL (the retry armed with no stop guard): a write is tried AFTER the stop', s1x);
  const s1y = await stopRun(cut(DSRC, "    if (parkFailing && !retryHeld && (flushedNow ? parkFailing.n > failedBefore : !writeRetryNow())) {", "    if (false) {", 'the stop neither writes nor says', 'mr-park-stopsilent'));
  if (!(s1y.atStop >= 1)) console.log(`  SKIP ⑫b RED 2: the placed refusal was never read (${JSON.stringify(s1y)})`);
  else ok(!s1y.said && s1y.atStop === 1, '⑫b RED CONTROL (the stop neither writes nor says): what memory alone held is lost with no word', s1y);
}

report();
