#!/usr/bin/env node
// test-auto-resume-record — R9 of row B-9a24 (lane lg-store-writes, the coordinator r3487 / r4350; B-574d): auto-resume.json is written
// by THE STORE WRITER, and A CONTINUE's RECORD IS ON DISK BEFORE ITS DELIVERY (src/server/auto-resume.js recordBeforeDelivery: the arm
// off and the fire noted, landed by the writer's synchronous road). FAST, in process + one child per kill: the real module over scratch
// folders, its writer thread a stand-in that runs the real writeJob after a held delay or fails the write
// (scripts/fixtures/store-stand-writer.cjs).
//   K. A REAL KILL inside the first continue's delivery (a child, scripts/fixtures/auto-resume-kill.cjs, SIGKILLed in sendToSession with
//      the writer's thread HELD): a fresh start continues nothing more — the conversation is continued at most once. RED copy: the
//      record only queued before the delivery — the fresh start continues it a second time.
//   L. A record that cannot land: nothing is delivered and the arm stands; the disk answering, the next tick continues it once. RED
//      copy: a landing that is not checked — the continue goes out with no record on disk.
//   D. A delivery that fails: the arm and the breaker are put back; the next tick continues it once. RED copy: no put-back — the
//      conversation is never continued. D2 (F2, 主开发 r4551): the put-back is ON DISK when the call returns (red: only queued); D3: a
//      put-back that cannot land says ONE journal line, a count and a code.
//   M. F1 (主开发 r4551): AT MOST ONE BOUNDED WAIT A TICK — three due arms, a writer whose thread holds past its bound: ONE flush asked in
//      the tick, nothing delivered, each spend hold given back once; the next tick, the stalled job still the lane's: no flush at all
//      (laneHeld, N); the job settled: three continues. RED copies: both guards removed (three waits); laneHeld's question removed.
//   B. the bulk resume's site: a record that cannot land — rec.failed «not-delivered», each batch hold given back once, nothing sent.
//      RED copy: the refused landing not checked there.
// Run: node scripts/test-auto-resume-record.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { scratch, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SW = require(path.join(REPO, 'src/store-writer.js'));
const AR = require(path.join(REPO, 'src/server/auto-resume.js'));
const { ok, report } = checker();
const ROOT = scratch('ar-record');
const quiet = { log() { }, warn() { }, error() { } };
const hush = (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w; } };
const SAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(path.join(ROOT, 'stand'));
const lives = [];
const mkW = (o = {}) => { const W = SW.create({ log: quiet, workerPath: SAND.path, durableMs: 1500, ...o }); lives.push(W); return W; };
let dn = 0;
const dirOf = (n) => { const d = path.join(ROOT, `${n}-${++dn}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sess = () => ({ mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false });
const fileOf = (d) => path.join(d, 'auto-resume.json');
const armOnDisk = (d) => { try { return !!((JSON.parse(fs.readFileSync(fileOf(d), 'utf8')).armed || {}).s1); } catch { return null; } };
/** one auto-resume over `d`: its own writer, a live conversation s1, a send that answers `deliver()` (true: delivered) */
const world = (Mod, d, W, deliver = () => true) => {
  const sent = [], sessions = new Map([['s1', sess()]]);
  const ar = hush(() => Mod.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
    sendToSession: (id, s, text) => { if (!deliver()) return false; sent.push({ id, text }); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W }));
  return { ar, sessions, sent };
};
const MUT = mutantCopies('ar-record', REPO);
const ARSRC = fs.readFileSync(path.join(REPO, 'src/server/auto-resume.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// THE WRITER FREE AGAIN (the legs whose bound is 200 ms): a landing a loaded disk answers past the bound refuses that tick (F1: one
// wait a tick) and the next tick tries again — so the leg ticks until every due arm is continued, each tick once the writer has
// nothing of the file in flight (r4340 law 1: the wait on the judged fact, its expiry named — 20 ticks), never one tick on a clock
const tickUntilFree = async (ar, W, F, at, want, sent) => {
  let n = 0, ticks = 0;
  while (sent.length < want && ticks < 20) {
    await waitFor(() => !W.laneHeld(F) && !W.stats().some((x) => x.file === F && x.inflight), 10000, 'the writer to have nothing of the file in flight before the next tick');
    n += hush(() => ar.tick(at + ticks)); ticks++;
  }
  return { n, ticks };
};
/** a wait ON THE FACT the leg judges, its expiry a NAMED harness line (r4340 law 1) */
const waitFor = async (pred, ms, what) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error(`the harness waited ${ms} ms for ${what} — it never came`); await sleep(10); } };
const LAND_CHECK = "    if (!landRecord(`the continue of ${id}`)) { back(); save(); return null; }";
// 主开发 r5135 law 1: A CONTROL IS JUDGED ON THE FACT THAT ITS PLANT WAS IN FORCE. Each red copy carries its WITNESS — the planted site
// marks itself when the product reaches it (MARK, counted here; the copy a CHILD runs appends its mark to a file — KMARK); a placed
// hold or refusal is witnessed by the stand-in thread that applied it (SAND.applied). A plant never read in the window is a NAMED
// SKIP the gate counts, never a red and never a green
const PLANTS = new Map();
globalThis.__arPlantRead = (n) => { PLANTS.set(n, (PLANTS.get(n) || 0) + 1); };
const MARK = (n) => ` globalThis.__arPlantRead && globalThis.__arPlantRead(${JSON.stringify(n)});`;
const KMARK_FILE = path.join(ROOT, 'k-plant-read');
const KMARK = ` require('fs').appendFileSync(${JSON.stringify(KMARK_FILE)}, 'K ');`;
const plantRead = (n) => PLANTS.get(n) || 0;
const applied = (kind) => SAND.applied('auto-resume.json').filter((x) => x === kind).length;
const plantWindow = () => { PLANTS.clear(); SAND.clearApplied('auto-resume.json'); };
const redIf = (inForce, witness, cond, words, detail) => { if (inForce) return ok(cond, words, detail); console.log(`  ⊘ SKIP: ${words} — NOT JUDGED: its plant was not read in the window (${witness}; 主开发 r5135 law 1)`); return true; };

console.log('K. a REAL KILL inside the first continue\'s delivery, then a fresh start');
{
  const KILL = path.join(REPO, 'scripts/fixtures/auto-resume-kill.cjs');
  const killRun = async (modPath) => {
    const d = dirOf('k'), W = mkW(), w = world(AR, d, W);
    const resets = Date.now() + 60000;
    hush(() => w.ar.armIfEnabled('s1', w.sessions.get('s1'), resets, '5h limit'));
    W.flushSync([fileOf(d)]);   // the wall's arm on disk, as a start finds it
    const armedBefore = armOnDisk(d);
    SAND.hold('auto-resume.json', 300);   // the child's writer thread is this suite's stand-in: its write waits 300 ms
    let r = null;
    try { r = spawnSync(process.execPath, [KILL, modPath, d, SAND.path, String(resets)], { encoding: 'utf8', timeout: 30000 }); } finally { SAND.unhold('auto-resume.json'); }
    const armAfterKill = armOnDisk(d);
    const fresh = world(AR, d, mkW());
    const again = hush(() => fresh.ar.tick(resets + AR.GRACE_MS + 120000));
    return { armedBefore, signal: r && r.signal, out: String((r && r.stdout) || '').trim().slice(0, 160), err: String((r && r.stderr) || '').trim().slice(-240), armAfterKill, again, sentAgain: fresh.sent.length };
  };
  const k = await killRun(path.join(REPO, 'src/server/auto-resume.js'));
  ok(k.armedBefore === true && k.signal === 'SIGKILL' && k.armAfterKill === false && k.again === 0 && k.sentAgain === 0, 'K1 a KILL inside the first continue\'s delivery: the record was on disk before it (the arm off), so the fresh start continues nothing more — at most once', k);
  const queued = MUT.write('src/server/auto-resume.js', anchored(ARSRC, LAND_CHECK, '    save();' + KMARK, 'record only queued'), 'record-queued');
  try { fs.unlinkSync(KMARK_FILE); } catch { }
  const kx = await killRun(queued);
  const kxRead = (() => { try { return fs.readFileSync(KMARK_FILE, 'utf8').split(' ').filter(Boolean).length; } catch { return 0; } })();
  redIf(kxRead > 0 && kx.signal === 'SIGKILL', `the copy's planted «record only queued» line read in the child ${kxRead} time(s) before its kill (${kx.signal})`, kx.signal === 'SIGKILL' && kx.armAfterKill === true && kx.again === 1 && kx.sentAgain === 1, 'RED CONTROL (the record only queued before the delivery, the release\'s order on the store writer): the same kill leaves the arm on disk — the fresh start continues it a SECOND time — red', kx);
  // K2 (r4551's should): a kill placed BEFORE the landing (in the spend authorizer the fire asks first): the arm is still on disk —
  // after the restart it is continued ONCE
  const kb = await (async () => {
    const d = dirOf('kb'), W = mkW(), w = world(AR, d, W);
    const resets = Date.now() + 60000;
    hush(() => w.ar.armIfEnabled('s1', w.sessions.get('s1'), resets, '5h limit'));
    W.flushSync([fileOf(d)]);
    const r = spawnSync(process.execPath, [KILL, path.join(REPO, 'src/server/auto-resume.js'), d, SAND.path, String(resets), 'before'], { encoding: 'utf8', timeout: 30000 });
    const armAfterKill = armOnDisk(d), fresh = world(AR, d, mkW());
    const again = hush(() => fresh.ar.tick(resets + AR.GRACE_MS + 120000));
    return { signal: r.signal, armAfterKill, again, sentAgain: fresh.sent.length };
  })();
  ok(kb.signal === 'SIGKILL' && kb.armAfterKill === true && kb.again === 1 && kb.sentAgain === 1, 'K2 a kill placed BEFORE the landing: the arm is still on disk, so after the restart the conversation is continued ONCE', kb);
}

console.log('L. a record that cannot land: nothing is delivered, the arm stands');
{
  const landRun = (Mod) => {
    const d = dirOf('l'), W = mkW({ durableMs: 300 }), auth = [], rel = [];
    const sessions = new Map([['s1', sess()]]), sent = [];
    const ar = hush(() => Mod.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
      sendToSession: (id, s2, text) => { sent.push({ id, text }); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W,
      authorizeSpend: (id, s2, ident, o) => { if (!(o && o.hold)) return { ok: true }; const h = { id, n: auth.length }; auth.push(h); return { ok: true, hold: h }; }, releaseSpend: (id, s2, h) => { rel.push(h); }, noteSpend: () => { } }));
    const w = { ar, sessions, sent };
    const resets = Date.now() + 60000;
    hush(() => w.ar.armIfEnabled('s1', w.sessions.get('s1'), resets, '5h limit'));
    W.flushSync([fileOf(d)]);
    SAND.failOn('auto-resume.json', true);
    let first = null;
    try { first = hush(() => w.ar.tick(resets + AR.GRACE_MS + 1)); } finally { SAND.failOn('auto-resume.json', false); }
    const sentWhileRefused = w.sent.length, armedWhileRefused = hush(() => w.ar.statusFor('s1')).armed === true;
    const second = hush(() => w.ar.tick(resets + AR.GRACE_MS + 2000));
    return { first, sentWhileRefused, armedWhileRefused, second, sent: w.sent.length, armOnDisk: armOnDisk(d), auth: auth.length, released: rel.length, releasedOnce: rel.length === 1 && rel[0] === auth[0] };
  };
  const l = landRun(AR);
  ok(l.auth === 2 && l.releasedOnce, 'L2 the refused landing\'s spend hold is given back EXACTLY once (the second, delivered, is charged)', l);
  ok(l.first === 0 && l.sentWhileRefused === 0 && l.armedWhileRefused && l.second === 1 && l.sent === 1 && l.armOnDisk === false, 'L1 a continue whose record cannot land is NOT delivered (the arm stands); with the disk answering the next tick continues it once, its record on disk', l);
  const AMun = MUT.load('src/server/auto-resume.js', anchored(ARSRC, "    const landed = !!r && !r.deferred && Array.isArray(r.written) && r.written.includes('auto-resume.write') && !(r.left || []).some((x) => x && x.file === file);", '    const landed = true;' + MARK('L'), 'landing unchecked'), 'landing-unchecked');
  plantWindow();
  const lx = landRun(AMun), lxW = { read: plantRead('L'), fail: applied('fail') };
  redIf(lxW.read > 0 && lxW.fail > 0, `the copy's unchecked landing read ${lxW.read} time(s), the placed refusal applied ${lxW.fail} time(s)`, lx.sentWhileRefused === 1, 'RED CONTROL (a landing that is not checked): the continue goes out while its record is not on disk — red', lx);
}

console.log('D. a delivery that fails: the arm and the breaker are put back');
{
  const failRun = (Mod) => {
    const d = dirOf('d'); let tries = 0;
    const w = world(Mod, d, mkW(), () => (++tries > 1));   // the first delivery fails, the next succeeds
    const resets = Date.now() + 60000;
    hush(() => w.ar.armIfEnabled('s1', w.sessions.get('s1'), resets, '5h limit'));
    const first = hush(() => w.ar.tick(resets + AR.GRACE_MS + 1));
    const armedAfterFail = hush(() => w.ar.statusFor('s1')).armed === true;
    const second = hush(() => w.ar.tick(resets + AR.GRACE_MS + 2000));
    return { first, armedAfterFail, second, sent: w.sent.length, tries };
  };
  const dd = failRun(AR);
  ok(dd.first === 0 && dd.armedAfterFail && dd.second === 1 && dd.sent === 1, 'D1 a delivery that fails puts the arm and the breaker back: the next tick continues it once', dd);
  const AMnb = MUT.load('src/server/auto-resume.js', anchored(ARSRC, '      if (!ok) { putBack(); log(', '      if (!ok) {' + MARK('D') + ' log(', 'no put-back'), 'no-put-back');
  plantWindow();
  const dx = failRun(AMnb), dxW = plantRead('D');
  redIf(dxW > 0, `the copy's failed-delivery branch without its put-back read ${dxW} time(s)`, dx.sent === 0 && !dx.armedAfterFail, 'RED CONTROL (no put-back after a failed delivery): the conversation is never continued — red', dx);
}

console.log('D2. F2 (主开发 r4551): the put-back is ON DISK, or said');
{
  const putRun = (Mod) => {
    const d = dirOf('d2'), logs = [], sessions = new Map([['s1', sess()]]);
    let tries = 0;
    const ar = hush(() => Mod.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
      sendToSession: () => (++tries > 1), notify: () => { }, broadcast: () => { }, storeWriter: mkW(), log: (l) => logs.push(String(l)) }));
    const resets = Date.now() + 60000;
    hush(() => ar.armIfEnabled('s1', sessions.get('s1'), resets, '5h limit'));
    SAND.hold('auto-resume.json', 300);   // every write waits 300 ms on the thread: a queued put-back is NOT on disk when the call returns
    let first = null;
    try { first = hush(() => ar.tick(resets + AR.GRACE_MS + 1)); } finally { SAND.unhold('auto-resume.json'); }
    return { first, armOnDiskAtReturn: armOnDisk(d), said: logs.filter((l) => /had the wait put back in memory only/.test(l)).length };
  };
  const d2 = putRun(AR);
  ok(d2.first === 0 && d2.armOnDiskAtReturn === true && d2.said === 0, 'D2 a delivery that fails after a good landing: the arm and the breaker are put back ON DISK when the call returns (nothing to say)', d2);
  const AMq = MUT.load('src/server/auto-resume.js', anchored(ARSRC, "      if (landRecord(`the wait of ${id} put back`)) return;\n", '     ' + MARK('D2') + '\n', 'put-back only queued'), 'put-back-queued');
  plantWindow();
  const d2x = putRun(AMq), d2xW = { read: plantRead('D2'), hold: applied('hold') };
  redIf(d2xW.read > 0 && d2xW.hold > 0, `the copy's site of the removed put-back landing read ${d2xW.read} time(s), the placed hold applied ${d2xW.hold} time(s)`, d2x.armOnDiskAtReturn === false, 'RED CONTROL (the put-back only queued): the call returns while the file still has the arm off — red', d2x);
  // D3: the put-back cannot land (the storage starts refusing at the failed delivery): ONE journal line, a count and a code, no account
  const d = dirOf('d3'), logs = [], sessions = new Map([['s1', sess()]]);
  const ar = hush(() => AR.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
    sendToSession: () => { SAND.failOn('auto-resume.json', true); return false; }, notify: () => { }, broadcast: () => { }, storeWriter: mkW({ durableMs: 300 }), log: (l) => logs.push(String(l)) }));
  const resets = Date.now() + 60000;
  hush(() => ar.armIfEnabled('s1', sessions.get('s1'), resets, '5h limit'));
  try { hush(() => ar.tick(resets + AR.GRACE_MS + 1)); } finally { SAND.failOn('auto-resume.json', false); }
  const said = logs.filter((l) => /^\[auto-resume\] 1 continue not delivered had the wait put back in memory only \(not-durable\)/.test(l));
  ok(said.length === 1 && !/acct|account/i.test(said[0]) && hush(() => ar.statusFor('s1')).armed === true, 'D3 a put-back that cannot land is said ONCE in the journal, a count and a code (not-durable), no account — the arm stands in memory', { said, armed: ar.statusFor('s1').armed });
}

console.log('M. F1 (主开发 r4551): at most ONE bounded wait a tick');
{
  const stallRun = async (Mod) => {
    plantWindow(); const d = dirOf('m'), W = mkW({ graceMs: 600 });   // its bound: a third of the grace, 200 ms
    let flushes = 0; const f0 = W.flushSync; W.flushSync = (...a) => { flushes++; return f0(...a); };
    const auth = [], rel = [], sent = [], logs = [];
    const sessions = new Map(['m1', 'm2', 'm3'].map((k) => [k, sess()]));
    const ar = hush(() => Mod.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
      sendToSession: (id) => { sent.push(id); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W, log: (l) => logs.push(String(l)),
      authorizeSpend: (id, s2, ident, o) => { if (!(o && o.hold)) return { ok: true }; const h = { id, n: auth.length }; auth.push(h); return { ok: true, hold: h }; }, releaseSpend: (id, s2, h) => { rel.push(h); }, noteSpend: () => { } }));
    const resets = Date.now() + 60000;
    for (const k of sessions.keys()) hush(() => ar.armIfEnabled(k, sessions.get(k), resets, '5h limit'));
    f0([fileOf(d)]); flushes = 0;
    SAND.hold('auto-resume.json', 700);   // PLACED: the writer's thread holds its write 0.7 s, past the 200 ms bound
    const n1 = hush(() => ar.tick(resets + AR.GRACE_MS + 1));
    const t1 = { n: n1, flushes: flushes, sent: sent.length, auth: auth.length, released: rel.length, onceEach: rel.length === auth.length && new Set(rel).size === rel.length, plants: Object.fromEntries(PLANTS), held: applied('hold') };
    flushes = 0;
    const n2 = hush(() => ar.tick(resets + AR.GRACE_MS + 2));   // the next tick: the stalled job is still the lane's
    const t2 = { n: n2, flushes: flushes, sent: sent.length, plants: Object.fromEntries(PLANTS), said: logs.filter((l) => /could not be written to auto-resume\.json — nothing was sent \(tried again later\)/.test(l)).length };
    const snap = () => JSON.stringify({ s: W.stats().map(({ oldestAgeMs, maxAgeMs, ...x }) => x), p: W.pending(fileOf(d)), w: W.waits() });
    const before = snap(); for (let q = 0; q < 100; q++) W.laneHeld(fileOf(d));
    const readsOnly = snap() === before;
    SAND.unhold('auto-resume.json');
    await waitFor(() => !W.laneHeld(fileOf(d)), 10000, 'the stalled write to settle');
    const after = await tickUntilFree(ar, W, fileOf(d), resets + AR.GRACE_MS + 3, 3, sent);
    return { t1, t2, n3: after.n, ticks: after.ticks, sent: sent.length, once: new Set(sent).size === sent.length, readsOnly };
  };
  const m = await stallRun(AR);
  ok(m.t1.n === 0 && m.t1.flushes === 1 && m.t1.sent === 0 && m.t1.auth === 3 && m.t1.onceEach, 'M1 three due arms and a stalled writer: ONE bounded wait in the tick (one flush asked), nothing delivered, each spend hold given back once', m);
  ok(m.t2.n === 0 && m.t2.flushes === 0, 'N1 the next tick while the writer still reports that lane held: refused at once — no flush asked, no wait', m.t2);
  ok(m.n3 === 3 && m.sent === 3 && m.once, 'M2 the writer free again: the ticks that follow continue all three, each once (a landing a loaded disk answers past the bound waits for the next tick)', m);
  ok(m.t2.said === 1, 'N3 the stall is said ONCE in the journal — by the landing that waited; the tick\'s other refusals and the next tick\'s (the lane still held) waited on nothing and say nothing again (r5209)', m.t2);
  ok(m.readsOnly === true, 'N2 laneHeld only READS: asked a hundred times while the lane is held, the writer\'s state is the same as before (no store, no lane, no wait changed)', m.readsOnly);
  const both = anchored(anchored(ARSRC, '    if (landingRefused) return false;\n', '   ' + MARK('M') + '\n', 'no per-tick refusal'), "    if (typeof W.laneHeld === 'function' && W.laneHeld(file)) { landingRefused = true; refusedWhy = 'lane-held'; return false; }   // F1: the writer already reports that lane held — refused at once, without the wait\n", '', 'no lane question');
  const mx = await stallRun(MUT.load('src/server/auto-resume.js', both, 'f1-off'));
  redIf((mx.t1.plants.M || 0) >= 3 && mx.t1.held > 0, `the copy's site of the removed per-tick refusal read ${mx.t1.plants.M || 0} time(s) in the tick, the placed stall applied ${mx.t1.held} time(s)`, mx.t1.flushes === 3, 'RED CONTROL (F1\'s two guards removed): the tick waits once a due arm — three waits in a row — red', mx.t1);
  const lq = anchored(ARSRC, "    if (typeof W.laneHeld === 'function' && W.laneHeld(file)) { landingRefused = true; refusedWhy = 'lane-held'; return false; }   // F1: the writer already reports that lane held — refused at once, without the wait\n", '   ' + MARK('N') + '\n', 'no lane question');
  const nx = await stallRun(MUT.load('src/server/auto-resume.js', lq, 'lane-question-off'));
  redIf((nx.t2.plants.N || 0) - (nx.t1.plants.N || 0) > 0 && nx.t1.held > 0, `the copy's site of the removed lane question read ${(nx.t2.plants.N || 0) - (nx.t1.plants.N || 0)} time(s) in the next tick, the placed stall applied ${nx.t1.held} time(s)`, nx.t2.flushes === 1, 'RED CONTROL (laneHeld\'s question removed): the next tick waits its bound again on the same stalled job — red', nx.t2);
}

console.log('M3. the per-tick refusal ends at the next tick\'s start — a fact of the tick, never a clock of its own');
{
  const d = dirOf('m3'), W = mkW({ durableMs: 300 }); let flushes = 0; const f0 = W.flushSync; W.flushSync = (...a) => { flushes++; return f0(...a); };
  const sessions = new Map([['p1', sess()], ['p2', sess()]]), sent = [];
  const ar = hush(() => AR.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
    sendToSession: (id) => { sent.push(id); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W }));
  const resets = Date.now() + 60000;
  hush(() => ar.armIfEnabled('p1', sessions.get('p1'), resets, '5h limit'));
  f0([fileOf(d)]); flushes = 0;
  SAND.failOn('auto-resume.json', true);   // PLACED: the write fails at once (no stall)
  let first = null; try { first = hush(() => ar.tick(resets + AR.GRACE_MS + 1)); } finally { SAND.failOn('auto-resume.json', false); }
  const f1 = flushes;
  // the writer answers again — but no tick has started: a continue asked outside the tick (a pool move's fireNow) is still refused at once
  hush(() => ar.armIfEnabled('p2', sessions.get('p2'), Date.now() + 3600e3, '5h limit'));
  const moved = hush(() => ar.fireNow('p2', 'a pool move')), f2 = flushes;
  const next = hush(() => ar.tick(resets + AR.GRACE_MS + 2)), f3 = flushes;   // the next tick's start ends it
  ok(first === 0 && f1 === 1 && moved === false && f2 === 1 && next === 1 && f3 === 2 && sent.join() === 'p1', 'M3 after a refused landing the writer answers again, yet a continue asked before the next tick starts is refused at once (no flush); the next tick\'s start ends the refusal and its continue goes', { first, f1, moved, f2, next, f3, sent });
}

console.log('B. the bulk resume\'s site: a record that cannot land');
{
  const bulkRun = async (Mod, two = false) => {
    const d = dirOf('b'), rel = [], sent = [], taken = [];
    const stoppedRow = (name) => ({ backend: 'claude', mode: 'chat', pty: {}, name, _slot: 'A', _stoppedBy: { kind: 'quota', at: Date.now() - 60000, resetsAt: Date.now() - 1000 } });
    const rows = new Map([['b', stoppedRow('B1')], ...(two ? [['c', stoppedRow('C1')]] : [])]);
    const W = mkW({ durableMs: 300 }); let flushes = 0; const f0 = W.flushSync; W.flushSync = (...a) => { flushes++; return f0(...a); };
    const ar = hush(() => Mod.create({ dataDir: d, activeSessions: rows, serverSetting: () => false, sendToSession: (id) => { sent.push(id); return true; }, storeWriter: W,
      fireIdentity: (id, s2) => ({ key: s2._slot, name: s2._slot }),
      authorizeSpendBatch: (items) => { const holds = items.map((x) => ({ sessionId: x.id, identity: x.identity, hold: 'h' + (taken.push(null)) })); taken.splice(taken.length - holds.length, holds.length, ...holds.map((x) => x.hold)); return { ok: true, holds }; },   // every hold its own name (the row re-asks the gate: a new hold)
      renewSpend: () => { }, releaseSpend: (id, s2, h) => { rel.push(h); }, noteBatchSpend: () => { }, wallVerdict: () => ({ usable: true, blockedUntil: 0 }),
      bulkPaceMs: 5, bulkGateWaitMs: 20, bulkGateHoldMs: 40 }));
    SAND.failOn('auto-resume.json', true);
    let st = null;
    try {
      const r0 = hush(() => ar.resumeBatch({}));
      await waitFor(() => { st = ar.batchStatus(r0.batchId); return !!(st && st.done); }, 10000, 'the bulk resume to end');
    } finally { SAND.failOn('auto-resume.json', false); }
    const eachOnce = rel.length === taken.length && new Set(rel).size === rel.length && taken.every((x) => rel.includes(x));
    return { sent: sent.length, failed: ((st && st.failed) || []).map((f) => f.why), taken: taken.slice(), released: rel.slice(), eachOnce, flushes };
  };
  const b = await bulkRun(AR);
  ok(b.sent === 0 && b.failed.join() === 'storage-busy' && b.eachOnce, 'B1 the bulk resume\'s continue whose record cannot land: not delivered, said by its row (rec.failed «storage-busy»), its batch hold given back ONCE, nothing sent', b);
  // B2 (主开发 r4555 (2)): A PERSON's PRESS IS ANSWERED AT ONCE — after the first refused landing the next row is answered at once
  // (no landing tried: one flush in all), each row said by its reason
  const b2 = await bulkRun(AR, true);
  ok(b2.sent === 0 && b2.failed.join() === 'storage-busy,storage-busy' && b2.flushes === 1 && b2.eachOnce, 'B2 a person\'s bulk press the storage refuses: the first row waits ONCE, the next is answered at once (one flush in all), both rows said «storage-busy», every hold taken given back exactly once (nothing spent)', b2);
  // the person's words for that row, with their zh and ja (the dialog draws them by row: src/lib/bulk-resume.js)
  const KEYW = '«{name}» was not resumed: the storage is busy and its record could not be written — try again in a moment.';
  const said = ['src/lib/bulk-resume.js', 'src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8').includes(KEYW));
  ok(said.every(Boolean), 'B3 the row\'s words — the storage is busy, try again — are drawn by the dialog and carry their zh and ja', said);
  plantWindow();
  const bx = await bulkRun(MUT.load('src/server/auto-resume.js', anchored(ARSRC, "        if (!putBack) { log(`[auto-resume] ${e.id}: the record of this continue could not be written to auto-resume.json — nothing was sent (the bulk resume ${batchId})`); giveBack(); busy = true; rec.failed.push({ id: e.id, name: e.name, why: 'storage-busy' }); continue; }   // (a hold begun mid-batch too: answered at once, its row said)\n", '        ' + MARK('B') + '\n', 'bulk landing unchecked'), 'bulk-unchecked'));
  const bxW = { read: plantRead('B'), fail: applied('fail') };
  redIf(bxW.read > 0 && bxW.fail > 0, `the copy's site of the removed bulk check read ${bxW.read} time(s), the placed refusal applied ${bxW.fail} time(s)`, bx.sent === 1, 'RED CONTROL (the bulk site\'s refused landing not checked): the continue goes out with no record on disk — red', bx);
}

console.log('M4. r4812 M1: the stalled job is the FILE\'s OWN write, already in flight before the tick — the next tick waits no more');
{
  const inflightRun = async (Mod) => {
    const d = dirOf('m4'), W = mkW({ graceMs: 600 });   // its bound: 200 ms
    let flushes = 0; const f0 = W.flushSync; W.flushSync = (...a) => { flushes++; return f0(...a); };
    const sessions = new Map([['q1', sess()], ['q2', sess()]]), sent = [];
    const ar = hush(() => Mod.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
      sendToSession: (id) => { sent.push(id); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W }));
    const resets = Date.now() + 60000;
    hush(() => ar.armIfEnabled('q1', sessions.get('q1'), resets, '5h limit'));
    f0([fileOf(d)]); flushes = 0;
    SAND.hold('auto-resume.json', 700);   // PLACED: the thread holds the file's next write 0.7 s
    hush(() => ar.armIfEnabled('q2', sessions.get('q2'), Date.now() + 3600e3, '5h limit'));   // a save: the file's OWN async write …
    W.durable(fileOf(d)).catch(() => { });                                                     // … posted at once
    await waitFor(() => W.stats().some((x) => x.file === fileOf(d) && x.inflight), 5000, 'the file\'s own write to be in flight');
    const n1 = hush(() => ar.tick(resets + AR.GRACE_MS + 1)), f1 = flushes;   // its landing gives up on THAT job (the bound)
    const n2 = hush(() => ar.tick(resets + AR.GRACE_MS + 2)), f2 = flushes - f1;   // the job still in flight: refused at once
    SAND.unhold('auto-resume.json');
    await waitFor(() => !W.stats().some((x) => x.file === fileOf(d) && x.inflight), 10000, 'the stalled write to settle');
    const after = await tickUntilFree(ar, W, fileOf(d), resets + AR.GRACE_MS + 3, 1, sent);
    return { n1, f1, n2, f2, n3: after.n, ticks: after.ticks, sent: sent.join() };
  };
  const m4 = await inflightRun(AR);
  ok(m4.n1 === 0 && m4.f1 === 1 && m4.n2 === 0 && m4.f2 === 0 && m4.n3 === 1 && m4.sent === 'q1', 'M4 the file\'s own write in flight when the tick comes: ONE wait, then every later landing is refused at once until THAT job settles (no flush asked); settled, it continues once', m4);
  const SWSRC = fs.readFileSync(path.join(REPO, 'src/store-writer.js'), 'utf8');
  const SWx = MUT.write('src/store-writer.js', anchored(SWSRC, '{ held.add(l); l.heldBy = l.inflight; const s0 = stores.get(busy.name);', '{ held.add(l);' + MARK('M4') + ' const s0 = stores.get(busy.name);', 'in-flight job not marked'), 'inflight-unmarked');   // stale-pins: kept (the red copy plants the pre-cure form on purpose)
  const SWm = require(SWx);
  const redRun = async () => {   // the same scene over a writer made from the copy (the tip before this cure)
    plantWindow(); const d = dirOf('m4x'), W = SWm.create({ log: quiet, workerPath: SAND.path, durableMs: 1500, graceMs: 600 }); lives.push(W);
    let flushes = 0; const f0 = W.flushSync; W.flushSync = (...a) => { flushes++; return f0(...a); };
    const sessions = new Map([['q1', sess()], ['q2', sess()]]);
    const ar = hush(() => AR.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined), sendToSession: () => true, notify: () => { }, broadcast: () => { }, storeWriter: W }));
    const resets = Date.now() + 60000;
    hush(() => ar.armIfEnabled('q1', sessions.get('q1'), resets, '5h limit'));
    f0([fileOf(d)]); flushes = 0;
    SAND.hold('auto-resume.json', 700);
    hush(() => ar.armIfEnabled('q2', sessions.get('q2'), Date.now() + 3600e3, '5h limit')); W.durable(fileOf(d)).catch(() => { });
    await waitFor(() => W.stats().some((x) => x.file === fileOf(d) && x.inflight), 5000, 'the file\'s own write to be in flight (red)');
    hush(() => ar.tick(resets + AR.GRACE_MS + 1)); const f1 = flushes;
    hush(() => ar.tick(resets + AR.GRACE_MS + 2)); const f2 = flushes - f1;
    SAND.unhold('auto-resume.json');
    await waitFor(() => !W.stats().some((x) => x.file === fileOf(d) && x.inflight), 10000, 'the stalled write to settle (red)');
    return { f1, f2, read: plantRead('M4'), held: applied('hold') };
  };
  const m4x = await redRun();
  redIf(m4x.read > 0 && m4x.held > 0, `the writer copy's unmarked give-up read ${m4x.read} time(s), the placed hold applied ${m4x.held} time(s)`, m4x.f2 === 1, 'RED CONTROL (the in-flight job given up on not marked held — this unit\'s tip): the next tick waits its bound again — red', m4x);
}

console.log('M5. r4812 M2: while the store is held nothing touches the arms — a person\'s press, then the lift: the file\'s arm stands');
{
  const PRESS = require(path.join(REPO, 'src/write-origin.js')).pressOf({ headers: { 'sec-fetch-site': 'same-origin' } });
  const heldPress = async (Mod) => {
    const d = dirOf('m5'), F = fileOf(d), now = Date.now();
    fs.writeFileSync(F, JSON.stringify({ armed: { w1: { at: now - 60e3, resetsAt: now + 3600e3, reason: '5h limit', fired: false } }, fires: {} }));
    const sw = { backend: 'claude', mode: 'chat', pty: {}, name: 'W1', _slot: 'A', _stoppedBy: { kind: 'quota', at: now - 60000, resetsAt: now - 1000 } };
    const rs0 = fs.readFileSync;   // PLACED: the module's start read of its file answers EIO — the store starts HELD
    fs.readFileSync = function (p2, ...a) { if (String(p2) === F) throw Object.assign(new Error('EIO: a placed refusal'), { code: 'EIO' }); return rs0.call(this, p2, ...a); };
    let ar = null;
    try {
      ar = hush(() => Mod.create({ dataDir: d, activeSessions: new Map([['w1', sw]]), serverSetting: () => false, sendToSession: () => true, storeWriter: mkW(),
        fireIdentity: (id, s2) => ({ key: s2._slot, name: s2._slot }), authorizeSpendBatch: (items) => ({ ok: true, holds: items.map((x, i) => ({ sessionId: x.id, identity: x.identity, hold: 'p' + i })) }),
        renewSpend: () => { }, releaseSpend: () => { }, noteBatchSpend: () => { }, wallVerdict: () => ({ usable: true, blockedUntil: 0 }), bulkPaceMs: 5, bulkGateWaitMs: 20, bulkGateHoldMs: 40 }));
    } finally { fs.readFileSync = rs0; }
    const heldAtPress = !!ar._hold.held();
    const r0 = hush(() => ar.resumeBatch({ pressed: PRESS }));
    if (r0 && r0.batchId) await waitFor(() => { const st = ar.batchStatus(r0.batchId); return !!(st && st.done); }, 10000, 'the pressed batch to end');
    const lifted = await ar._hold.again();
    await sleep(50);
    let onDisk = null; try { onDisk = !!(JSON.parse(fs.readFileSync(F, 'utf8')).armed || {}).w1; } catch { onDisk = null; }
    return { heldAtPress, refused: !!(r0 && r0.ok === false && r0.code === 'auto_resume_unread'), lifted, armInMemory: ar._armed.has('w1'), onDisk };
  };
  const m5 = await heldPress(AR);
  ok(m5.heldAtPress && m5.refused && m5.lifted && m5.armInMemory && m5.onDisk === true, 'M5 a person\'s press while the store is held is refused up front by its code (the hold\'s words); at the lift the arm the file held stands — in memory and on disk', m5);
  let red = anchored(ARSRC, "    if (hold.held()) return { ok: false, why: 'held', code: 'auto_resume_unread', error: hold.words() };", "    if (hold.held() && !isPress(pressed)) return { ok: false, why: 'held', code: 'auto_resume_unread', error: hold.words() };" + MARK('M5press'), 'a press passes the hold');   // stale-pins: kept (the red copy plants the pre-cure form on purpose)
  red = anchored(red, "    if (hold.held()) { refusedWhy = 'held'; return null; }\n", '   ' + MARK('M5rec') + '\n', 'the record step touches arms while held');
  plantWindow();
  const m5x = await heldPress(MUT.load('src/server/auto-resume.js', red, 'held-press-touches')), m5xW = { press: plantRead('M5press'), rec: plantRead('M5rec') };
  redIf(m5xW.press > 0 && m5xW.rec > 0 && m5x.heldAtPress, `the copy's press past the hold read ${m5xW.press} time(s), its record step without the held refusal ${m5xW.rec} time(s), the placed unreadable start ${m5x.heldAtPress ? 'in force' : 'NOT in force'}`, m5x.lifted && m5x.armInMemory === false, 'RED CONTROL (this unit\'s tip: a press passes the hold and the record step takes the arm off): at the lift the file\'s arm is deleted — red', m5x);
}

console.log('M6. r4812 REQUIRED 2: landed means WRITTEN — a flush that wrote nothing and left nothing is no landing');
{
  const nothingRun = (Mod) => {
    const d = dirOf('m6'), W = mkW(), logs = [];
    const d0 = W.dirty; let broken = false;
    W.dirty = function (f, o) { if (broken && path.basename(String(f)) === 'auto-resume.json') throw new Error('placed: the hand-over throws'); return d0.call(this, f, o); };
    const sessions = new Map([['n1', sess()]]), sent = [];
    const ar = hush(() => Mod.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
      sendToSession: (id) => { sent.push(id); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W, log: (l) => logs.push(String(l)) }));
    const resets = Date.now() + 60000;
    hush(() => ar.armIfEnabled('n1', sessions.get('n1'), resets, '5h limit'));
    W.flushSync([fileOf(d)]);
    broken = true;   // PLACED: the save's hand-over to the writer throws (save logs it) — the flush then has nothing to write and nothing left
    let n = null; try { n = hush(() => ar.tick(resets + AR.GRACE_MS + 1)); } finally { broken = false; }
    return { n, sent: sent.length, persistFailed: logs.some((l) => /persist failed/.test(l)) };
  };
  const m6 = nothingRun(AR);
  ok(m6.n === 0 && m6.sent === 0 && m6.persistFailed, 'M6 the save\'s hand-over throws: the flush writes nothing and leaves nothing — NOT a landing: nothing is sent', m6);
  plantWindow();
  const m6x = nothingRun(MUT.load('src/server/auto-resume.js', anchored(ARSRC, "    const landed = !!r && !r.deferred && Array.isArray(r.written) && r.written.includes('auto-resume.write') && !(r.left || []).some((x) => x && x.file === file);", '    const landed = !!r && !r.deferred && !(r.left || []).some((x) => x && x.file === file);' + MARK('M6'), 'not-left read as landed'), 'not-left-landed'));   // stale-pins: kept (the red copy plants the pre-cure form on purpose)
  const m6xW = plantRead('M6');
  redIf(m6xW > 0 && m6x.persistFailed, `the copy's «not left» landing read ${m6xW} time(s), the placed hand-over throw ${m6x.persistFailed ? 'in force' : 'NOT in force'}`, m6x.sent === 1, 'RED CONTROL (this unit\'s tip: «not among the files left» read as landed): the continue goes out on a record only memory holds — red', m6x);
}

console.log('O. r5209: LANDED is WRITTEN and NOT LEFT — an older job of the file written, the current version left at the bound');
{
  const olderRun = async (Mod) => {
    plantWindow();
    const d = dirOf('o'), W = mkW({ graceMs: 600 }), F = fileOf(d), BUSY = path.join(d, 'busy.json');   // the bound: 200 ms
    let answer = null; const f0 = W.flushSync; W.flushSync = (...a) => { const r = f0(...a); if (Array.isArray(a[0]) && a[0].includes(F)) answer = r; return r; };
    const auth = [], rel = [], sent = [], sessions = new Map([['o1', sess()]]);
    const ar = hush(() => Mod.create({ dataDir: d, activeSessions: sessions, serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? true : undefined),
      sendToSession: (id) => { sent.push(id); return true; }, notify: () => { }, broadcast: () => { }, storeWriter: W,
      authorizeSpend: (id, s2, ident, o) => { if (!(o && o.hold)) return { ok: true }; const h = { id, n: auth.length }; auth.push(h); return { ok: true, hold: h }; }, releaseSpend: (id, s2, h) => { rel.push(h); }, noteSpend: () => { } }));
    // PLACED: another store's write holds the whole-write lane 100 ms; auto-resume.json's FIRST job of this writer, made meanwhile by
    // the other lane, waits for it MADE (parked) — the older job
    SAND.hold('busy.json', 100);
    W.dirty(BUSY, { name: 'busy.write', produce: () => '{}' }); W.durable(BUSY).catch(() => { });
    await waitFor(() => W.stats().some((x) => x.file === BUSY && x.inflight), 5000, 'the other store\'s write to hold the lane');
    const resets = Date.now() + 60000;
    hush(() => ar.armIfEnabled('o1', sessions.get('o1'), resets, '5h limit')); W.durable(F).catch(() => { });
    await waitFor(() => W.stats().some((x) => x.file === F && x.inflight && !x.dirty), 5000, 'auto-resume.json\'s first job to wait for the lane, made');
    const parked = W.stats().some((x) => x.file === BUSY && x.inflight);
    // the loop held here, no turn of it: the other store's job ends on its thread, its answer unread — the older job stays parked
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    SAND.holdSeq('auto-resume.json', [0, 400]);   // PLACED: the older job writes at once; the CURRENT version's write holds past the bound
    const n = hush(() => ar.tick(resets + AR.GRACE_MS + 1));
    SAND.unhold('auto-resume.json'); SAND.unhold('busy.json');
    await waitFor(() => !W.stats().some((x) => x.file === F && x.inflight), 10000, 'the held write to settle');
    const formed = parked && !!answer && (answer.written || []).includes('auto-resume.write') && (answer.left || []).some((x) => x && x.file === F);
    return { parked, formed, written: answer && answer.written, left: answer && (answer.left || []).map((x) => x.name), n, sent: sent.length, auth: auth.length, releasedOnce: rel.length === 1 && rel[0] === auth[0], read: plantRead('O'), holds: applied('hold') };
  };
  const o = await olderRun(AR);
  redIf(o.formed, `the scene: the older job parked behind the busy lane (${o.parked}), the flush wrote it and left the current version (written ${JSON.stringify(o.written)}, left ${JSON.stringify(o.left)}, holds applied ${o.holds})`,
    o.n === 0 && o.sent === 0 && o.auth === 1 && o.releasedOnce, 'O1 an older job of the file written and the CURRENT version left: NOT landed — nothing sent, the spend hold given back once', o);
  const ox = await olderRun(MUT.load('src/server/auto-resume.js', anchored(ARSRC, "    const landed = !!r && !r.deferred && Array.isArray(r.written) && r.written.includes('auto-resume.write') && !(r.left || []).some((x) => x && x.file === file);", "    const landed = !!r && !r.deferred && Array.isArray(r.written) && r.written.includes('auto-resume.write');" + MARK('O'), 'left unchecked'), 'left-unchecked'));   // stale-pins: kept (the red copy plants the lined tip's form on purpose)
  redIf(ox.formed && ox.read > 0, `the copy's «written» alone read ${ox.read} time(s); the scene formed: written ${JSON.stringify(ox.written)}, left ${JSON.stringify(ox.left)}`,
    ox.sent === 1, 'RED CONTROL (the lined tip d88407e80: «written» alone read as landed): the continue goes out while the current record is left unwritten — red', ox);
  // r4784 on every push (a source pin; the heavy loop suite judges the line itself): the continue's journal line names no account
  ok(ARSRC.includes("${moved ? ' (landed on another account)' : ''} — continued immediately") && !/landed on \$\{/.test(ARSRC), 'O2 the continue\'s journal line names no account — «(landed on another account)», never a name (r4784)');
}

for (const W of lives) { try { W.stop(); } catch { } }
report();
