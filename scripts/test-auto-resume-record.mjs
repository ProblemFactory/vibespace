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
//      conversation is never continued.
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
const LAND_CHECK = "    if (!landRecord(`the continue of ${id}`)) { back(); save(); return null; }";

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
  const queued = MUT.write('src/server/auto-resume.js', anchored(ARSRC, LAND_CHECK, '    save();', 'record only queued'), 'record-queued');
  const kx = await killRun(queued);
  ok(kx.signal === 'SIGKILL' && kx.armAfterKill === true && kx.again === 1 && kx.sentAgain === 1, 'RED CONTROL (the record only queued before the delivery, the release\'s order on the store writer): the same kill leaves the arm on disk — the fresh start continues it a SECOND time — red', kx);
}

console.log('L. a record that cannot land: nothing is delivered, the arm stands');
{
  const landRun = (Mod) => {
    const d = dirOf('l'), W = mkW({ durableMs: 300 }), w = world(Mod, d, W);
    const resets = Date.now() + 60000;
    hush(() => w.ar.armIfEnabled('s1', w.sessions.get('s1'), resets, '5h limit'));
    W.flushSync([fileOf(d)]);
    SAND.failOn('auto-resume.json', true);
    let first = null;
    try { first = hush(() => w.ar.tick(resets + AR.GRACE_MS + 1)); } finally { SAND.failOn('auto-resume.json', false); }
    const sentWhileRefused = w.sent.length, armedWhileRefused = hush(() => w.ar.statusFor('s1')).armed === true;
    const second = hush(() => w.ar.tick(resets + AR.GRACE_MS + 2000));
    return { first, sentWhileRefused, armedWhileRefused, second, sent: w.sent.length, armOnDisk: armOnDisk(d) };
  };
  const l = landRun(AR);
  ok(l.first === 0 && l.sentWhileRefused === 0 && l.armedWhileRefused && l.second === 1 && l.sent === 1 && l.armOnDisk === false, 'L1 a continue whose record cannot land is NOT delivered (the arm stands); with the disk answering the next tick continues it once, its record on disk', l);
  const AMun = MUT.load('src/server/auto-resume.js', anchored(ARSRC, '    return !!r && !r.deferred && !(r.left || []).some((x) => x && x.file === file);', '    return true;', 'landing unchecked'), 'landing-unchecked');
  const lx = landRun(AMun);
  ok(lx.sentWhileRefused === 1, 'RED CONTROL (a landing that is not checked): the continue goes out while its record is not on disk — red', lx);
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
  const AMnb = MUT.load('src/server/auto-resume.js', anchored(ARSRC, '      if (!ok) { putBack(); log(', '      if (!ok) { log(', 'no put-back'), 'no-put-back');
  const dx = failRun(AMnb);
  ok(dx.sent === 0 && !dx.armedAfterFail, 'RED CONTROL (no put-back after a failed delivery): the conversation is never continued — red', dx);
}

for (const W of lives) { try { W.stop(); } catch { } }
report();
