#!/usr/bin/env node
// HEAVY (15.8 s: a REAL daemon on its own 3 s cadence). THE LOCKED MAC (lane mac-locked-capture — measured 2026-10-26 with the owner at the Mac, macOS 27.0.1, agent 2.369.358, helper
// vs-5d0cce28e54e: a capture started while the screen was LOCKED waited in ScreenCaptureKit's enumeration for good; a running one
// was interrupted 34 s after a display-on lock and the agent's capture again waited the same way; nothing healed at the unlock —
// the window stayed black under «串流中断：没能及时连上 — 正在重新连接…» until it was closed and opened again). The helper here is
// the FAKE (scripts/fixtures/stream/mac-fakes.mjs `lockFile`: while it exists the screen is locked — a capture ends `locked` at its
// start like the lane's helper, or WAITS for good with lockMode 'park' like the helper before it); the REAL source
// (src/agentd/stream-mac.js), daemon (data/bin — `npm run build` first), stream host and hub module (src/server/desktop-webrtc.js).
//   §1 PURE — LOCK_RULE + lockStep (a failed read is no unlock; past the bound it ends); endingVerdict's `locked` ⇒ the choice at once;
//      stallStep's `paused` (round 2) ⇒ no watch while locked, a fresh baseline at the unlock's first tick
//   §2 THE HELPER'S BOUNDS (its Swift as text — no compiler on this box; the Mac builds it): every ScreenCaptureKit wait carries a
//      named bound, a bound that fires names the lock or its wait, the lock is read before the first ScreenCaptureKit call; the
//      version moved (the agent installs the new helper by itself) — RED CONTROL: an unbounded wait / a late lock read fail it
//   §3 THE SOURCE over the fake (a quick rule: the facts every 120 ms, a 2.5 s bound, a 700 ms start bound): locked at the offer ⇒
//      no helper, paused, read on the cadence; the unlock ⇒ captured IN PLACE (a key frame first); locked mid-stream (the fake ends
//      display_gone — ScreenCaptureKit's interruption) ⇒ paused, no capture again while locked, the unlock ⇒ in place; the helper's
//      own `end locked` ⇒ paused; a helper that WAITS (the old one) ⇒ ended by the start bound, then paused (its process gone);
//      the bound ⇒ screen_locked; while locked the sound is refused by name and the rate is not judged; closed while locked ⇒ no
//      read after it; closed while a helper waits ⇒ its process gone (R4) — RED CONTROLS (the base's rule: the lock no state):
//      the session ENDS `locked` with the lane's helper, stays BLACK for good after the unlock with the old one, and the capture
//      again after the interruption is spawned BLIND onto the locked screen, where it waits
//   §4 END TO END — a REAL Mac-shaped daemon + the hub module + a werift stand-in browser (the daemon's own 3 s cadence): locked at
//      the offer ⇒ the hub's record and long poll say paused {why: locked}, ONE line `session <sid> stopped (locked) …`, no capture
//      ran; the unlock ⇒ the pictures reach the browser in the SAME session + `session <sid> resumed (locked N s)`; locked again
//      mid-stream ⇒ the two lines again; the window closed ⇒ no helper process of the session left — RED CONTROL: the hub without
//      the rule records and says nothing
//   §5 THE PAGE (round 2 — the stall watch): the REAL src/lib/stream-view.js (bundled for node: a fake clock, a fake <video>, a
//      fake RTCPeerConnection whose framesDecoded the leg sets) over the REAL hub module (a fake machine pushing `stream-stats`):
//      locked 14 s then unlocked with the machine's count moving BEFORE the page's first frame (the race forced to its bad
//      order) ⇒ no `stalled`, no reconnect — the same session, ONE `resumed (locked 14 s)`; the pictures in flight at the lock
//      (the machine counted 2 the page never decoded) ⇒ no `stalled` while locked; a real stall after the unlock still ends at
//      stallMs — RED CONTROL: the page without the two doors (the gate, the reset) ends both `stalled` (⇒ the shell's retry)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
import { flvBytes } from './fixtures/stream/screen-fakes.mjs';
import { writeFakeMacHelper, helperLog, MAC_FACTS } from './fixtures/stream/mac-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const T0 = Date.now();
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(25); } return false; };
const at = () => `[${((Date.now() - T0) / 1000).toFixed(1)} s] `;
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const SM = require(path.join(REPO, 'src/stream-model.js'));
const H = require(path.join(REPO, 'src/stream-h264.js'));
const MAC = require(path.join(REPO, 'src/agentd/stream-mac.js'));
const SRC = require(path.join(REPO, 'src/agentd/mac-helper-source.js'));
const AUS = H.accessUnits(H.splitNalus(fs.readFileSync(path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264'))));
const K0 = AUS.findIndex((a) => a.key);
const homes = [], cleanups = [];
const home = (n) => { const h = scratchHome(n, fs, ['.vibespace']); homes.push(h); return h; };
process.on('exit', () => { for (const f of cleanups) { try { f(); } catch { } } for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { } } });
const flvFile = (h) => { const f = path.join(h, 'desk.flv'); fs.writeFileSync(f, flvBytes(AUS.slice(K0), 30)); return f; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const lockOf = (file) => (on) => { if (on) fs.writeFileSync(file, '1'); else fs.rmSync(file, { force: true }); };
/** The capture runs of a fake's log: { pid, parked } — a run that met the lock logs {parked} beside its argv line. */
const capturesOf = (log) => helperLog(log).filter((l) => l.argv && l.argv[1] === 'capture').map((l) => l.pid);

// §4 runs BESIDE §1–§3 (its own home, helper, log and bundle copy; it sets process.env.HOME for ITS DeviceManager only — every
// source of §3 gets its env passed in), started first and awaited at the end
const e2e = endToEnd();

console.log(at() + '§1 PURE — THE LOCK\'s rule (src/stream-plan.js) and the window\'s answer to its bound (src/stream-model.js)');
{
  const R = SP.LOCK_RULE || {};
  ok(R.everyMs === 3000 && R.maxMs === 30 * 60000 && R.startMs === 20000 && Object.isFrozen(R), 'LOCK_RULE: the facts every 3 s (the brief\'s 2–5 s), 30 min at most, the agent\'s own start bound 20 s (> the helper\'s 5 s + 10 s)', R);
  const step = typeof SP.lockStep === 'function' ? SP.lockStep : () => 'missing';
  const rows = [[{ since: 0, now: 1000, locked: true }, 'watch'], [{ since: 0, now: 1000, locked: false }, 'resume'], [{ since: 0, now: 1000, locked: null }, 'watch'],
    [{ since: 0, now: R.maxMs - 1, locked: true }, 'watch'], [{ since: 0, now: R.maxMs, locked: true }, 'end'], [{ since: 0, now: R.maxMs, locked: null }, 'end'], [{ since: 0, now: R.maxMs + 5, locked: false }, 'resume']];
  const got = rows.map(([i]) => step(i));
  ok(got.every((g, i) => g === rows[i][1]), 'lockStep: a read that says unlocked resumes (even past the bound — the picture is there); a read that FAILED (null) is no unlock; maxMs since the lock ends it', got);
  const ev = (o) => SM.endingVerdict(o).act;
  ok(ev({ played: false, locked: true, now: 5 }) === 'ask' && ev({ played: true, step: 0, locked: true, now: 5 }) === 'ask' && ev({ played: false }) === 'fallback' && ev({ played: true, step: 0, now: 5 }) === 'retry',
    'endingVerdict: a stream that ended screen_locked (`locked`) ⇒ the person\'s choice at once, played or not — never a retry (it would wait out another bound) nor the VNC picture by itself; without it nothing moved', [ev({ played: false, locked: true }), ev({ played: true, locked: true })]);
  // round 2: THE STALL (src/stream-model.js stallStep) while the capture waits — the page's 1-s watch compares the page's decoded
  // count with the machine's sent count, two numbers sampled apart: a lock ≥ stallMs, then the machine's count first ⇒ `stalled`
  const S = SM.stallStep, T = SM.STREAM_LIMITS.stallMs;
  const w0 = S(null, { playing: true, pageFrames: 88, agentFrames: 88, now: 0 }).w;
  const inLock = S(w0, { playing: true, paused: true, pageFrames: 88, agentFrames: 90, now: T * 2 });
  const first = S(inLock.w, { playing: true, pageFrames: 88, agentFrames: 120, now: T * 2 + 1000 });
  const later = S(first.w, { playing: true, pageFrames: 88, agentFrames: 480, now: T * 3 + 1000 }), sooner = S(first.w, { playing: true, pageFrames: 88, agentFrames: 470, now: T * 3 + 999 });
  ok(!inLock.stalled && inLock.w === null && !first.stalled && first.w && first.w.at === T * 2 + 1000 && first.w.af === 120 && !sooner.stalled && later.stalled,
    'stallStep `paused`: no watch while the capture waits (nothing judged — not even the 2 pictures in flight at the lock); the unlock\'s first tick is a FRESH baseline (the machine\'s count moving before the page\'s first frame is the capture coming back); a real stall after it still ends at stallMs, not a millisecond before',
    { inLock, first, sooner: sooner.stalled, later: later.stalled });
}

console.log(at() + '§2 THE HELPER\'S BOUNDS — tools/vibespace-screen/vibespace-screen.swift as text (built on the Mac, not here)');
/** The census of a helper text → [red…]: every ScreenCaptureKit call inside a NAMED bounded wait, the bounds' names, the lock
 *  read before the first ScreenCaptureKit call of capture(). */
function boundsCensus(text) {
  const red = [];
  if (!text.includes('func wait<T>(_ bound: Double, _ f: (@escaping (T) -> Void) -> Void) -> T? {') || !/s\.wait\(timeout: \.now\(\) \+ bound\) == \.timedOut/.test(text)) red.push('the wait{} helper takes no bound');
  const calls = [...text.matchAll(/(?<![.\w])wait\s*(?:\(([^()]*)\))?\s*\{\s*k in/g)];
  if (calls.length !== 3) red.push(`${calls.length} ScreenCaptureKit waits (want 3: the row, the enumeration, startCapture)`);
  for (const c of calls) if (!/^(ENUM_S|START_S)$/.test(c[1] || '')) red.push(`an UNBOUNDED wait: ${c[0].slice(0, 40)}`);
  for (const l of text.split('\n')) if (/SCShareableContent\.getExcludingDesktopWindows|\bs\.startCapture\b/.test(l) && !/wait\((ENUM_S|START_S)\)/.test(l)) red.push(`a ScreenCaptureKit call outside a bounded wait: ${l.trim().slice(0, 60)}`);
  if (!/let ENUM_S = 5\.0, START_S = 10\.0/.test(text)) red.push('the bounds are not 5 s (the enumeration) and 10 s (startCapture)');
  if (!text.includes('boundFired("the shareable content", "enumeration_timeout", ENUM_S)') || !text.includes('boundFired("startCapture", "start_timeout", START_S)')) red.push('a bound that fires has no name');
  if (!/func boundFired[^\n]*\n\s*if locked\(\) \{ endWith\("locked"/.test(text)) red.push('a bound that fires on a locked screen does not say locked');
  const cap = text.indexOf('func capture() -> Never {'), lk = text.indexOf('if locked() { endWith("locked"', cap), sck = text.indexOf('SCShareableContent.', cap);
  if (cap < 0 || lk < 0 || sck < 0 || lk > sck) red.push('the lock is not read before the first ScreenCaptureKit call of capture()');
  return red;
}
{
  const swift = fs.readFileSync(path.join(REPO, 'tools/vibespace-screen/vibespace-screen.swift'), 'utf8');
  const red = boundsCensus(swift);
  ok(!red.length, 'every ScreenCaptureKit wait is BOUNDED and named — the enumeration (and the Settings row\'s) 5 s, startCapture 10 s; a bound that fires ends `locked` on a locked screen, else enumeration_timeout / start_timeout; `locked` is read before the first ScreenCaptureKit call', red);
  const ends = ['locked', 'enumeration_timeout', 'start_timeout'].every((c) => swift.includes(`endWith("${c}"`) || swift.includes(`"${c}", ENUM_S)`) || swift.includes(`"${c}", START_S)`));
  ok(ends && /end \{code\} \([^)]*locked, enumeration_timeout, start_timeout\)/.test(swift), 'the new end codes join the helper\'s documented `end` family (its stderr contract unchanged: started, frame, stats, end)');
  const unbounded = swift.replace('wait(START_S) { k in s.startCapture', 'wait { k in s.startCapture');
  const late = swift.replace(/\n  if locked\(\) \{ endWith\("locked", "the screen is locked — the capture starts once it is unlocked"\) \}[^\n]*/, '').replace('  let startGot', '  if locked() { endWith("locked", "late") }\n  let startGot');
  const r1 = boundsCensus(unbounded), r2 = boundsCensus(late);
  ok(unbounded !== swift && late !== swift && r1.some((x) => /UNBOUNDED|outside a bounded/.test(x)) && r2.some((x) => /before the first ScreenCaptureKit/.test(x)), 'RED CONTROL: the base\'s unbounded startCapture wait, and the lock read only after the enumeration, each fail the census', { r1, r2 });
  ok(SRC.SOURCE === swift && SRC.VERSION !== 'vs-5d0cce28e54e' && /^vs-[0-9a-f]{12}$/.test(SRC.VERSION) && SP.macHelperSourceFile(SRC.VERSION, SRC.SOURCE).includes('wait(ENUM_S)'),
    `the agent bundle carries THIS text at a NEW version (vs-5d0cce28e54e → ${SRC.VERSION}): a paired Mac's agent sees the version move and installs it itself — built there (the Command Line Tools) or the hub's prebuilt pushed — then asks for Screen Recording once more (helper_changed_regrant)`);
}

console.log(at() + '§3 THE SOURCE over the fake helper (src/agentd/stream-mac.js THE LOCK — a quick rule)');
const hS = home('slock-src'), logS = path.join(hS, 'helper.log'), LK = path.join(hS, 'locked');
const lock = lockOf(LK);
const FK = writeFakeMacHelper(hS, { pace: 240, version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'granted' }, log: logS, flv: flvFile(hS), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 }, lockFile: LK });
const envS = { HOME: hS, PATH: process.env.PATH };
const logs = () => helperLog(logS);
const capsOf = () => capturesOf(logS).length;
const factsOf = () => logs().filter((l) => l.argv && l.argv[1] === 'facts').length;
const QR = Object.freeze({ everyMs: 120, maxMs: 2500, startMs: 700 });
const lines = [];
const mk = (rule = QR, M = MAC) => M.createMacScreen({ spawn, execFile, env: envS, fs, log: (l) => lines.push(l), lockRule: rule });
const pausedOf = (o) => (o.src && typeof o.src.paused === 'function' ? o.src.paused() : undefined);
/** One display stream of `scr`: its pictures, its ending, every pause it told (start's third hook). */
const open = async (scr, { before = () => { } } = {}) => {
  const src = await scr.source({ sourceKind: 'screen' }, { maxKbps: 8000 });
  const o = { src, aus: [], ended: null, pauses: [] };
  if (!src.ok) return o;
  before();
  src.start((au) => o.aus.push(au), (code) => { o.ended = code; }, () => o.pauses.push(pausedOf(o)));
  return o;
};
{
  // LOCKED AT THE OFFER — the facts the offer read say locked
  lock(true);
  const c0 = capsOf(), f0 = factsOf();
  const a = await open(mk());
  await until(() => factsOf() - f0 >= 5 || a.ended, 3000);
  const pa = pausedOf(a), st0 = a.src.ok ? a.src.stats() : {};
  ok(a.src.ok && !a.ended && capsOf() === c0 && pa && pa.why === 'locked' && a.pauses.length === 1 && a.pauses[0] && a.pauses[0].why === 'locked' && a.aus.length === 0 && st0.locked && st0.locks === 1,
    `LOCKED AT THE OFFER: the offer goes out, NO capture helper is spawned onto the locked screen, the source is paused {why: locked} (told once), the facts read on the cadence (${factsOf() - f0} reads)`, { ended: a.ended, caps: capsOf() - c0, pa, pauses: a.pauses, aus: a.aus.length });
  const snd = a.src.ok ? await a.src.audio(() => { }).start() : null;
  const rate0 = a.src.ok ? JSON.stringify(a.src.stats().rate) : null;
  for (let i = 0; i < 6; i++) a.src.ok && a.src.setTargetKbps(1);
  ok(snd && snd.ok === false && snd.code === 'screen_locked' && a.src.ok && JSON.stringify(a.src.stats().rate) === rate0 && a.src.stats().rateChanges === 0, 'while locked: the sound is refused BY NAME (screen_locked — it comes with the picture) and no estimate is judged (nothing is sent: the rate is held for the unlock)', { snd, rate0, rate: a.src.ok && a.src.stats().rate });
  lock(false);
  await until(() => a.aus.length >= 20 || a.ended, 4000);
  const st1 = a.src.ok ? a.src.stats() : {};
  ok(!a.ended && a.aus.length >= 20 && a.aus[0].key && capsOf() - c0 === 1 && pausedOf(a) === null && a.pauses.length === 2 && a.pauses[1] === null && st1.locks === 1 && st1.resumes === 1 && st1.captureRestarts === 0,
    'THE UNLOCK: the first read that says unlocked captures IN PLACE — ONE helper, the same source, a key frame first, the pause told over (null)', { ended: a.ended, aus: a.aus.length, key: a.aus[0] && a.aus[0].key, caps: capsOf() - c0, pauses: a.pauses, st1 });
  // LOCKED MID-STREAM — ScreenCaptureKit interrupts the capture (the fake: display_gone), the judge's read says locked
  const c1 = capsOf();
  lock(true);
  await until(() => pausedOf(a) || a.ended, 3000);
  const f1 = factsOf();
  await until(() => factsOf() - f1 >= 4 || a.ended, 3000);
  ok(pausedOf(a) && pausedOf(a).why === 'locked' && !a.ended && capsOf() === c1 && a.pauses.length === 3 && a.src.stats().captureRestarts === 0,
    `LOCKED MID-STREAM: the helper's display_gone + the facts' locked ⇒ paused, the session goes on — NO capture again while locked (${factsOf() - f1} reads, 0 helpers: the measured capture-again waited there for good)`, { paused: pausedOf(a), ended: a.ended, caps: capsOf() - c1, st: a.src.stats() });
  const n2 = a.aus.length;
  lock(false);
  await until(() => a.aus.length >= n2 + 20 || a.ended, 4000);
  ok(!a.ended && a.aus.length >= n2 + 20 && a.aus[n2].key && capsOf() - c1 === 1 && pausedOf(a) === null && a.src.stats().resumes === 2 && a.aus.every((x, i) => !i || x.ts90k > a.aus[i - 1].ts90k),
    'its unlock: captured again IN PLACE (one helper), a key frame first, the timestamps still rising — one session through both locks', { ended: a.ended, more: a.aus.length - n2, caps: capsOf() - c1 });
  a.src.ok && a.src.stop();
  await sleep(150);
}
{
  // THE HELPER'S OWN WORD: the facts said unlocked, the screen locked before the helper ran ⇒ `end locked` (the lane's helper)
  const c0 = capsOf();
  const o = await open(mk(), { before: () => lock(true) });
  await until(() => pausedOf(o) || o.ended, 3000);
  const runs = logs().filter((l) => l.parked === false).length;
  ok(o.src.ok && !o.ended && pausedOf(o) && pausedOf(o).why === 'locked' && capsOf() - c0 === 1 && runs >= 1, 'the helper\'s own `end locked` (the lock came between the facts and the spawn) ⇒ paused, not ended', { ended: o.ended, paused: pausedOf(o), caps: capsOf() - c0 });
  lock(false);
  await until(() => o.aus.length >= 10 || o.ended, 4000);
  ok(!o.ended && o.aus.length >= 10 && capsOf() - c0 === 2, '…and its unlock captures in place', { ended: o.ended, aus: o.aus.length });
  o.src.ok && o.src.stop();
  await sleep(150);
}
{
  // A HELPER THAT WAITS — the helper before the lane (no bounds): the agent's own start bound ends it, the facts say locked
  FK.set({ lockMode: 'park' });
  const c0 = capsOf();
  const o = await open(mk(), { before: () => lock(true) });
  await until(() => pausedOf(o) || o.ended, 4000);
  const parked = logs().filter((l) => l.parked === true).map((l) => l.pid);
  await until(() => parked.every((p) => !alive(p)), 2000);
  ok(o.src.ok && !o.ended && pausedOf(o) && pausedOf(o).why === 'locked' && parked.length === 1 && !alive(parked[0]) && capsOf() - c0 === 1,
    'a helper that WAITS in ScreenCaptureKit (the old helper on a locked screen — no line, its stdin unread): ended by the agent\'s start bound (start_timeout), the facts say locked ⇒ paused — its process GONE, never left parked', { ended: o.ended, paused: pausedOf(o), parked, alive: parked.map(alive) });
  lock(false);
  await until(() => o.aus.length >= 10 || o.ended, 4000);
  ok(!o.ended && o.aus.length >= 10 && capsOf() - c0 === 2, '…and its unlock captures in place', { ended: o.ended, aus: o.aus.length });
  o.src.ok && o.src.stop();
  // the bound on an UNLOCKED screen: a helper that waits past it ends start_timeout BY NAME (the fake parks only when it starts
  // locked — so it starts locked, and the screen is unlocked once it waits: only the bound can end it)
  const src = await mk().source({ sourceKind: 'screen' }, { maxKbps: 8000 });
  const q = { ended: null, paused: [] };
  const parked0 = logs().filter((l) => l.parked === true).length;
  lock(true);
  src.start(() => { }, (c) => { q.ended = c; }, () => q.paused.push(src.paused()));
  await until(() => logs().filter((l) => l.parked === true).length > parked0, 3000);
  lock(false);
  await until(() => q.ended, 4000);
  ok(q.ended === 'start_timeout' && q.paused.length === 0, 'a helper that waits past the start bound on an UNLOCKED screen ends start_timeout — by name, never a park (and no lock is said)', q);
  src.stop();
  FK.set({ lockMode: null });
  await sleep(150);
}
{
  // THE BOUND: locked for good ⇒ screen_locked
  lock(true);
  const c0 = capsOf();
  const o = await open(mk({ ...QR, maxMs: 900 }));
  await until(() => o.ended, 4000);
  ok(o.ended === 'screen_locked' && capsOf() === c0 && o.aus.length === 0, 'THE BOUND: still locked past maxMs ⇒ the session ends screen_locked, its own name (the window asks — src/stream-model.js endingVerdict); no helper ran', { ended: o.ended, caps: capsOf() - c0 });
  // R4 — closed while locked: the watch ends with the session
  const p = await open(mk());
  await until(() => pausedOf(p), 2000);
  p.src.stop();
  await sleep(400); // a read spawned before the close logs its run first
  const f0 = factsOf();
  await sleep(QR.everyMs * 5);
  ok(pausedOf(p) !== undefined && factsOf() === f0 && !p.ended, 'closed while locked: no facts read after the close (the watch ended with it)', { reads: factsOf() - f0 });
  lock(false);
}
{
  // R4 — closed while a helper WAITS (today's measured cleanup, pinned): the parked process is ended
  FK.set({ lockMode: 'park' });
  const o = await open(mk({ ...QR, startMs: 60000 }), { before: () => lock(true) });
  await until(() => logs().some((l) => l.parked === true && alive(l.pid)), 3000);
  const pid = logs().filter((l) => l.parked === true).pop().pid;
  o.src.stop();
  const gone = await until(() => !alive(pid), 3000);
  ok(alive(pid) === false && gone, 'R4: the window closed while its helper waits in ScreenCaptureKit ⇒ that process ended (quit unread ⇒ the kill 1 s on)', { pid });
  lock(false); FK.set({ lockMode: null });
  await sleep(150);
  const left = capturesOf(logS).filter(alive);
  ok(left.length === 0, `R4: after every close, NO capture helper of any of §3's ${capsOf()} runs is alive`, left);
}

console.log(at() + '§3 RED CONTROLS — the base\'s rule (the lock is no state): src/agentd/stream-mac.js with THE LOCK\'s five doors shut');
{
  const macFile = path.join(REPO, 'src/agentd/stream-mac.js'), macText = fs.readFileSync(macFile, 'utf8');
  const DOORS = [["if (f.locked === true) lockedNow(", "if (false) lockedNow("], ["if (said && said.code === 'locked') {", "if (false) {"], ["if (first && first.ok && first.locked === true) {", "if (false) {"],
    ["if (x && x.ok && x.locked === true) lockedNow(", "if (false) lockedNow("], ["}, lockRule.startMs);", "}, 2147483647);"]];
  const found = DOORS.map(([a]) => macText.split(a).length - 1);
  let mut = macText; for (const [a, b] of DOORS) mut = mut.split(a).join(b);
  const Mod = (await import('node:module')).default;
  const m = new Mod(macFile, null); m.filename = macFile; m.paths = Mod._nodeModulePaths(path.dirname(macFile));
  m._compile(mut, macFile);
  ok(found.every((n) => n === 1), 'the five doors are found once each (the control is the base\'s rule, nothing else)', found);
  // (a) the lane's helper, locked at the offer
  lock(true);
  const a = await open(mk(QR, m.exports));
  await until(() => a.ended, 3000);
  lock(false);
  await sleep(QR.everyMs * 6);
  ok(a.ended === 'locked' && a.aus.length === 0, 'RED CONTROL (the lane\'s helper): the base\'s rule ENDS the session `locked` — the unlock brings nothing back (the window falls to its ending ladder)', { ended: a.ended, aus: a.aus.length });
  // (b) the old helper, locked at the offer: BLACK for good
  FK.set({ lockMode: 'park' });
  lock(true);
  const b = await open(mk(QR, m.exports));
  await sleep(QR.startMs * 2);
  lock(false);
  await sleep(QR.everyMs * 8);
  const parked = logs().filter((l) => l.parked === true).pop();
  ok(!b.ended && b.aus.length === 0 && parked && alive(parked.pid) && pausedOf(b) === null, 'RED CONTROL (the old helper — THE INCIDENT): the capture waits in ScreenCaptureKit for good — no picture after the unlock, no ending, nothing said (the black window)', { ended: b.ended, aus: b.aus.length, alive: parked && alive(parked.pid) });
  b.src.ok && b.src.stop();
  // (c) mid-stream: the capture again is spawned BLIND onto the locked screen
  const c = await open(mk(QR, m.exports));
  await until(() => c.aus.length >= 20, 3000);
  const c0 = capsOf();
  lock(true);
  await until(() => capsOf() > c0, 3000);
  await sleep(QR.startMs);
  lock(false);
  await sleep(QR.everyMs * 6);
  const n = c.aus.length;
  await sleep(300);
  ok(capsOf() > c0 && !c.ended && c.aus.length === n && logs().filter((l) => l.parked === true).length >= 2, 'RED CONTROL (mid-stream): the base\'s rule captures again IN PLACE onto the LOCKED screen (blind) — that capture waits there, the picture never comes back', { caps: capsOf() - c0, ended: c.ended, aus: c.aus.length - n });
  c.src.ok && c.src.stop();
  FK.set({ lockMode: null });
  await until(() => capturesOf(logS).every((p) => !alive(p)), 3000);
}

await thePage();
await e2e;
console.log(`\n${fail ? '✗' : '✓'} test-stream-locked: ${pass} passed, ${fail} failed`);
setTimeout(() => process.exit(fail ? 1 : 0), 50);

// ── §4 END TO END ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function endToEnd() {
  const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
  if (!fs.existsSync(BUNDLE)) { ok(false, '§4 needs the built agent bundle data/bin/vibespace-agentd.js (npm run build)'); return; }
  const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
  const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
  const w = require(path.join(REPO, 'node_modules/werift'));
  const bundleText = fs.readFileSync(BUNDLE, 'utf8');
  const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/, INJ = /(createInjector\(\{\s*)platform: process\.platform,/, SCR = /(createScreen\(\{\s*)platform: process\.platform,/;
  const macText = bundleText.replace(HELLO, '$1platform: "darwin",').replace(INJ, '$1platform: "darwin",').replace(SCR, '$1platform: "darwin",');
  const copyDir = scratch('slock-bundle'); fs.mkdirSync(path.join(copyDir, 'mac'), { recursive: true }); homes.push(copyDir);
  const macBundle = path.join(copyDir, 'mac', 'vibespace-agentd.js'); fs.writeFileSync(macBundle, macText);
  const hD = home('slock-daemon'), logD = path.join(hD, 'd.log'), LKD = path.join(hD, 'locked'), lockD = lockOf(LKD);
  writeFakeMacHelper(hD, { pace: 120, version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'granted' }, log: logD, flv: flvFile(hD), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 }, lockFile: LKD });
  const root = path.join(hD, 'agentd-root');
  process.env.HOME = hD; process.env.VIBESPACE_AGENTD_ROOT = root;
  const dataDir = path.join(hD, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath: macBundle, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  const peers = [];
  cleanups.push(() => { for (const p of peers) { try { p.close(); } catch { } } try { dm.stop(); } catch { } endDaemonsOf(root); });
  const conn = await dm.connect();
  const v = SM.streamRungVerdict({ capabilities: conn.info.capabilities, desktop: true, platform: conn.info.platform });
  const hubLines = [];
  const hub = DW.create({ access: { streamRung: async () => ({ ...v, dm, platform: 'darwin' }) }, relay: false, udpLeg: false, ips: () => ['127.0.0.1'], pollMaxMs: 400, log: { log: (l) => hubLines.push(String(l)), warn: () => { } } });
  const pc = new w.RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:9' }], iceStunGatherTimeout: 0.2, iceUseIpv6: false, codecs: { video: [new w.RTCRtpCodecParameters({ mimeType: SM.STREAM_CODEC.mimeType, clockRate: SM.STREAM_CODEC.clockRate, rtcpFeedback: SM.STREAM_CODEC.rtcpFeedback.map((f) => ({ ...f })), parameters: SM.STREAM_CODEC.fmtp })] } });
  peers.push(pc);
  const rtp = [];
  pc.onTrack.subscribe((t) => t.onReceiveRtp.subscribe((r) => { rtp.push(r.header.marker); }));
  const pics = () => rtp.filter(Boolean).length;
  const caps = () => capturesOf(logD).length;
  lockD(true); // LOCKED AT THE OFFER
  const r = await hub.start('host-dial-mac');
  const seen = { n: 0, seq: -1, last: null, ended: null, pausedSeen: 0 };
  let polling = r.take;
  const pollLoop = (async () => {
    while (polling) {
      const p = await hub.poll(r.key, seen.n, seen.seq, 300);
      for (const c of p.cands || []) if (c) pc.addIceCandidate(c).catch(() => { });
      seen.n = p.n || seen.n; seen.seq = p.seq; seen.last = p; if (p.paused) seen.pausedSeen++;
      if (p.ended) { seen.ended = p.ended; break; }
    }
  })();
  if (r.take) { await pc.setRemoteDescription(r.offer); await pc.setLocalDescription(await pc.createAnswer()); await hub.answer(r.key, pc.localDescription.sdp); }
  const stoppedRe = new RegExp(`\\[stream\\] host-dial-mac: session ${r.sid} stopped \\(locked\\)`), resumedRe = new RegExp(`\\[stream\\] host-dial-mac: session ${r.sid} resumed \\(locked \\d+ s\\)`);
  const count = (re) => hubLines.filter((l) => re.test(l)).length;
  await until(() => count(stoppedRe) >= 1 && seen.pausedSeen > 0, 10000);
  const rec0 = hub.facts('host-dial-mac')[0] || {};
  ok(r.take && count(stoppedRe) === 1 && rec0.paused && rec0.paused.why === 'locked' && seen.last && seen.last.paused && seen.last.paused.why === 'locked' && !seen.ended && caps() === 0 && pics() === 0,
    'END TO END, LOCKED AT THE OFFER: the hub\'s record and the long poll say paused {why: locked} (the window\'s words), ONE line `session <sid> stopped (locked) …`, no capture helper ran on the Mac', { take: r.take, lines: hubLines.filter((l) => /locked|resumed/.test(l)), paused: rec0.paused, caps: caps() });
  lockD(false);
  await until(() => pics() >= 20 && count(resumedRe) >= 1, 12000);
  const rec1 = hub.facts('host-dial-mac')[0] || {};
  ok(pics() >= 20 && count(resumedRe) === 1 && rec1.paused === null && rec1.resumes === 1 && rec1.sid === r.sid && !seen.ended && seen.last.paused === null && caps() === 1,
    `THE UNLOCK, end to end: the browser receives the pictures (${pics()}) in the SAME session without a new start, \`session <sid> resumed (locked N s)\`, the poll's paused is null`, { lines: hubLines.filter((l) => /resumed/.test(l)), rec1: { paused: rec1.paused, resumes: rec1.resumes }, caps: caps() });
  lockD(true); // LOCKED MID-STREAM
  await until(() => count(stoppedRe) >= 2, 12000);
  const p0 = pics(), k0 = caps();
  await sleep(1500);
  ok(count(stoppedRe) === 2 && (hub.facts('host-dial-mac')[0] || {}).paused && caps() === k0 && pics() - p0 <= 2, 'LOCKED MID-STREAM, end to end: the second `stopped (locked)` line, paused on the record; no capture spawned while locked', { caps: caps() - k0, pics: pics() - p0 });
  lockD(false);
  await until(() => pics() >= p0 + 20 && count(resumedRe) >= 2, 12000);
  ok(count(resumedRe) === 2 && pics() >= p0 + 20 && !seen.ended && (hub.facts('host-dial-mac')[0] || {}).resumes === 2, '…and resumed again in place: the pictures flow on in the same session', { pics: pics() - p0 });
  await hub.stop(r.key, 'closed');
  polling = false; await pollLoop;
  const pids = capturesOf(logD);
  await until(() => pids.every((p) => !alive(p)), 4000);
  ok(pids.length === 2 && pids.every((p) => !alive(p)) && count(/session \S+ stopped \(closed\)/) === 1, 'R4, end to end: the window closed ⇒ `stopped (closed)` and NO helper process of the session alive', { pids, alive: pids.map(alive) });
  // RED CONTROL: the hub without THE LOCK's line records and says nothing
  const dwFile = path.join(REPO, 'src/server/desktop-webrtc.js'), dwText = fs.readFileSync(dwFile, 'utf8'), DOOR = 'if (m.paused !== undefined) pausedNow(s, m.paused);';
  const Mod = (await import('node:module')).default;
  const both = [];
  for (const text of [dwText, dwText.replace(DOOR, '')]) {
    const m = new Mod(dwFile, null); m.filename = dwFile; m.paths = Mod._nodeModulePaths(path.dirname(dwFile)); m._compile(text, dwFile);
    let push = null; const said = [];
    const fdm = { streamOffer: async (msg, { onPush }) => { push = onPush; return { ok: true, sid: 'smv-red', offer: { type: 'offer', sdp: 'v=0\r\n' }, source: { kind: 'screen' } }; }, streamStop: async () => ({ stopped: true }) };
    const h2 = m.exports.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: fdm, platform: 'darwin' }) }, relay: false, udpLeg: false, ips: () => [], pollMaxMs: 50, log: { log: (l) => said.push(String(l)), warn: () => { } } });
    const k = await h2.start('host-red');
    push({ op: 'stream-stats', sid: 'smv-red', stats: {}, state: 'connected', paused: { why: 'locked', since: 1 } });
    const pr = await h2.poll(k.key, 0, -1, 10);
    both.push({ paused: pr.paused || null, lines: said.filter((l) => /stopped \(locked\)/.test(l)).length });
    await h2.stop(k.key, 'closed'); h2.shutdown();
  }
  ok(dwText.includes(DOOR) && both[0].paused && both[0].lines === 1 && !both[1].paused && both[1].lines === 0, 'RED CONTROL: the hub without THE LOCK\'s door — no paused in the poll, no line (the base: the window had nothing to say)', both);
  hub.shutdown(); dm.stop(); endDaemonsOf(root);
}

// ── §5 THE PAGE (round 2 — the stall watch over a lock) ─────────────────────────────────────────────────────────────────
/** The page's world for ONE run: a clock that moves only when the leg says (its timers run in order), a <video> that fires what
 *  the leg fires, an RTCPeerConnection whose framesDecoded is the leg's number, and a fetch that is the routes over the hub. */
function pageWorld(hub) {
  let t = 1000, id = 0; const q = new Map();
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
  const clock = {
    now: () => t,
    setTimeout: (f, ms) => { q.set(++id, { at: t + Math.max(0, Number(ms) || 0), f, every: 0 }); return id; },
    setInterval: (f, ms) => { q.set(++id, { at: t + ms, f, every: ms }); return id; },
    clear: (k) => { q.delete(k); },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let k = null; for (const [i, x] of q) if (x.at <= end && (k == null || x.at < q.get(k).at)) k = i;
        if (k == null) break;
        const x = q.get(k); t = x.at; if (x.every) x.at += x.every; else q.delete(k);
        try { x.f(); } catch { }
        await settle();
      }
      t = end; await settle();
    },
  };
  const el = () => { const ls = {}; return { style: {}, setAttribute() { }, removeAttribute() { }, addEventListener(type, f) { (ls[type] = ls[type] || []).push(f); }, fire(type, e = {}) { for (const f of ls[type] || []) f(e); }, remove() { }, focus() { }, play: () => Promise.resolve(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), videoWidth: 1920, videoHeight: 1080 }; };
  const counts = { pf: 0 }, pcs = [], starts = [], stops = [];
  function FakePC() {
    const pc = { connectionState: 'new', localDescription: null, close() { pc.connectionState = 'closed'; }, getTransceivers: () => [], setRemoteDescription: async () => { }, createAnswer: async () => ({ type: 'answer', sdp: 'v=0\r\n' }), setLocalDescription: async (d) => { pc.localDescription = d; }, addIceCandidate: async () => { },
      getStats: async () => new Map([['v', { id: 'v', type: 'inbound-rtp', kind: 'video', framesDecoded: counts.pf, bytesReceived: counts.pf * 4000 }]]) };
    pcs.push(pc); return pc;
  }
  const BASE = '/api/desktop/machine-desktop/stream';
  const answerOf = async (f) => { try { return await f(); } catch (e) { return { error: String((e && e.message) || e), code: (e && e.code) || 'failed' }; } };
  async function fetch(url, o = {}) { // the routes of src/routes/desktop-apps.js over the hub module
    const u = new URL(url, 'http://hub'), b = o.body ? JSON.parse(o.body) : {}, p = u.pathname.startsWith(BASE) ? u.pathname.slice(BASE.length) : u.pathname;
    let r;
    if (p === '/start') { starts.push(b.host); r = await answerOf(() => hub.start(b.host, { source: b.source == null ? null : b.source })); }
    else if (p === '/answer') r = await answerOf(() => hub.answer(b.key, b.sdp));
    else if (p === '/candidate') r = await answerOf(() => hub.candidate(b.key, b.candidate));
    else if (p === '/watch') r = await hub.poll(u.searchParams.get('key'), Number(u.searchParams.get('n')) || 0, Number(u.searchParams.get('seq') ?? -1));
    else if (p === '/stop') { stops.push(b.why); r = await hub.stop(b.key, String(b.why || 'stopped')); }
    else r = { error: `no route ${p}` };
    return { json: async () => r };
  }
  const env = { performance: { now: clock.now }, setTimeout: clock.setTimeout, clearTimeout: clock.clear, setInterval: clock.setInterval, clearInterval: clock.clear,
    document: { createElement: el, visibilityState: 'visible' }, RTCPeerConnection: FakePC, MediaStream: function MediaStream(t) { this.tracks = t; }, fetch };
  return { clock, counts, pcs, starts, stops, env };
}

/** ONE window over a lock — `inFlight`: the machine counted 2 pictures the page never decoded (in flight when the screen locked).
 *  → { stalledIn: null | 'lock' | 'unlock' | 'after-unlock', … the facts the legs read } */
async function pageRun(mod, DW, { inFlight = false, tag = 'p' } = {}) {
  const SID = `smv-page-${tag}`, HOST = 'host-dial-mac', EPOCH = Date.UTC(2026, 9, 26, 12, 0, 0);
  let push = null; const lines = [];
  const fdm = { streamOffer: async (msg, o = {}) => { push = o.onPush; return { ok: true, sid: SID, offer: { type: 'offer', sdp: 'v=0\r\n' }, source: { kind: 'screen' } }; }, streamAnswer: async () => ({ ok: true }), streamStop: async () => ({ stopped: true }) };
  let world = null;
  const hub = DW.create({ access: { streamRung: async () => ({ take: true, source: 'screen', dm: fdm, platform: 'darwin' }) }, relay: false, udpLeg: false, ips: () => [], pollMaxMs: 100, now: () => EPOCH + (world ? world.clock.now() : 0), log: { log: (l) => lines.push(String(l)), warn: () => { } } });
  world = pageWorld(hub);
  globalThis.__lockPage.cur = world.env;
  const statuses = [], acts = [], pausedSaid = [];
  const host = { append() { } };
  const view = mod.createStreamView(host, { hostId: HOST, onStatus: (s, c) => statuses.push([s, c]), onPaused: (p) => pausedSaid.push(p),
    onFallback: (code) => acts.push(SM.endingVerdict({ played: view.played, step: 0, now: world.clock.now(), locked: code === 'screen_locked' }).act) }); // the shell's NEVER SILENT answer
  const C = world.counts; let af = 0, stalledIn = null, phase = 'play';
  const ended = () => statuses.some(([s]) => s === 'fallback');
  const tick = async () => { await world.clock.advance(1000); if (!stalledIn && ended()) stalledIn = phase; };
  const say = async (paused) => { // the machine's stats push (the daemon sends `paused` on every one) — heard by the page before the next tick
    if (ended()) return; // the window fell to its ladder: nobody polls any more
    push({ op: 'stream-stats', sid: SID, stats: { frames: af }, state: 'connected', paused });
    await until(() => { const a = view.agent(); return a && a.frames === af && (paused ? !!view.paused : view.paused === null); }, 3000);
  };
  view.connect();
  await until(() => view.state === 'connecting', 3000);
  const pc = world.pcs[0];
  pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); view.video.fire('playing');
  const key0 = view.key, playing0 = view.state;
  for (let i = 0; i < 3; i++) { af += 30; await say(null); C.pf += 30; await tick(); } // playing: both counts move
  phase = 'lock';
  if (inFlight) af += 2;
  const LOCKED = { why: 'locked', since: EPOCH + world.clock.now() };
  await say(LOCKED);
  for (let i = 0; i < 14; i++) { if (i % 3 === 2) await say(LOCKED); await tick(); } // 14 s locked: the machine repeats its push, nothing moves
  const lockedState = view.state;
  phase = 'unlock';
  af += 30; await say(null); // THE BAD ORDER: the capture is back and the machine counted 30 pictures — the page has decoded none yet
  await tick();
  for (let i = 0; i < 3; i++) { C.pf += 30; af += 30; await say(null); await tick(); }
  const after = { state: view.state, key: view.key, rec: (hub.facts(HOST)[0] || null), starts: world.starts.length, stops: [...world.stops], acts: [...acts] };
  phase = 'after-unlock'; // a REAL stall after the unlock: the machine sends, the page decodes nothing — still judged, at stallMs
  let stallTicks = 0;
  while (!ended() && stallTicks < 14) { af += 30; await say(null); await tick(); stallTicks++; }
  const res = { stalledIn, playing0, lockedState, key0, after, stallTicks, stalledCode: (statuses.find(([s]) => s === 'fallback') || [])[1] || null, statuses: statuses.map((x) => x.join(':')), pausedSaid: pausedSaid.map((p) => (p ? p.why : null)), lines, sid: SID, acts };
  try { view.dispose(); } catch { }
  await sleep(150);
  hub.shutdown();
  return res;
}

async function thePage() {
  console.log(at() + '§5 THE PAGE (round 2) — src/lib/stream-view.js\'s stall watch over a lock, the race forced to its bad order');
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const { pathToFileURL } = await import('node:url');
  const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
  const VIEW = path.join(REPO, 'src/lib/stream-view.js'), viewText = fs.readFileSync(VIEW, 'utf8');
  const GATE = 'paused: !!paused, ', RESET = /\n {4}stall = null; \/\/ THE STALL's watch starts again[^\n]*/;
  const dir = scratch('slock-page'); homes.push(dir);
  globalThis.__lockPage = { cur: null };
  const banner = 'const __LP = globalThis.__lockPage; const performance = { now: () => __LP.cur.performance.now() }, setTimeout = (f, ms) => __LP.cur.setTimeout(f, ms), clearTimeout = (k) => __LP.cur.clearTimeout(k), setInterval = (f, ms) => __LP.cur.setInterval(f, ms), clearInterval = (k) => __LP.cur.clearInterval(k), document = { createElement: (n) => __LP.cur.document.createElement(n), get visibilityState() { return __LP.cur.document.visibilityState; } }, RTCPeerConnection = function (c) { return __LP.cur.RTCPeerConnection(c); }, MediaStream = function (t) { this.tracks = t; }, fetch = (u, o) => __LP.cur.fetch(u, o);';
  const stubUtils = { name: 'stub-utils', setup(b) { b.onResolve({ filter: /^\.\/utils\.js$/ }, () => ({ path: 'utils', namespace: 'slock' })); b.onLoad({ filter: /.*/, namespace: 'slock' }, () => ({ contents: 'export async function fetchJson(url, opts) { try { const res = await fetch(url, opts); return await res.json(); } catch { return null; } }', loader: 'js' })); } };
  const shut = { name: 'shut-doors', setup(b) { b.onLoad({ filter: /stream-view\.js$/ }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8').replace(GATE, '').replace(RESET, ''), loader: 'js' })); } };
  const build = async (name, plugins) => { const f = path.join(dir, name); await esbuild.build({ entryPoints: [VIEW], bundle: true, format: 'esm', platform: 'browser', target: 'es2020', outfile: f, banner: { js: banner }, logLevel: 'error', plugins }); return import(pathToFileURL(f).href); };
  const lane = await build('view.mjs', [stubUtils]), red = await build('view-shut.mjs', [stubUtils, shut]);
  const T = SM.STREAM_LIMITS.stallMs;
  const a = await pageRun(lane, DW, { tag: 'a' });
  const stoppedRe = new RegExp(`session ${a.sid} stopped \\(locked\\)`), resumedRe = new RegExp(`session ${a.sid} resumed \\(locked (\\d+) s\\)`);
  const resumed = a.lines.filter((l) => resumedRe.test(l)), n = resumed.length ? Number(resumed[0].match(resumedRe)[1]) : null;
  ok(a.playing0 === 'playing' && a.lockedState === 'playing' && a.stalledIn !== 'lock' && a.stalledIn !== 'unlock' && a.after.state === 'playing' && a.after.key === a.key0 && a.after.starts === 1 && a.after.stops.length === 0 && a.after.acts.length === 0
    && a.after.rec && a.after.rec.sid === a.sid && !a.after.rec.ended && a.after.rec.resumes === 1 && a.lines.filter((l) => stoppedRe.test(l)).length === 1 && resumed.length === 1 && n >= 14 && T * 1.1 < n * 1000,
    `LOCKED ${n} s (> stallMs ${T / 1000} s), then the unlock with the machine's count FIRST (the bad order, forced): no \`stalled\`, no reconnect — the same session (one start, no stop), ONE \`resumed (locked ${n} s)\``, { stalledIn: a.stalledIn, after: { ...a.after, rec: a.after.rec && { sid: a.after.rec.sid, ended: a.after.rec.ended, resumes: a.after.rec.resumes } }, lines: a.lines.filter((l) => /locked|stalled/.test(l)) });
  ok(a.pausedSaid.join() === 'locked,' && a.stalledIn === 'after-unlock' && a.stalledCode === 'stalled' && a.stallTicks === T / 1000,
    `…and THE STALL still watches after the unlock: a picture that decodes nothing while the machine sends ends \`stalled\` at stallMs (${a.stallTicks} ticks) — the shell was told locked, then null`, { said: a.pausedSaid, stalledIn: a.stalledIn, code: a.stalledCode, ticks: a.stallTicks });
  const b = await pageRun(lane, DW, { inFlight: true, tag: 'b' });
  ok(b.stalledIn === 'after-unlock' && b.lockedState === 'playing' && b.after.state === 'playing' && b.after.starts === 1 && b.after.stops.length === 0,
    'the pictures IN FLIGHT at the lock (the machine counted 2 the page never decoded): 14 s locked ⇒ no `stalled` while locked — nothing is judged while the capture waits', { stalledIn: b.stalledIn, locked: b.lockedState, after: b.after.state, stops: b.after.stops });
  // RED CONTROL: the page without the two doors (the stall gate, the reset at the unlock) — what 244f8e2a did
  const ra = await pageRun(red, DW, { tag: 'ra' }), rb = await pageRun(red, DW, { inFlight: true, tag: 'rb' });
  ok(viewText.includes(GATE) && RESET.test(viewText) && ra.stalledIn === 'unlock' && ra.after.stops.includes('stalled') && ra.after.acts[0] === 'retry' && rb.stalledIn === 'lock' && rb.after.stops.includes('stalled'),
    'RED CONTROL: the page without THE LOCK\'s stall doors — the unlock ends `stalled` (⇒ the shell\'s retry: a NEW session instead of the in-place resume), and the pictures in flight at the lock end it `stalled` in the middle of the lock', { gate: viewText.includes(GATE), reset: RESET.test(viewText), ra: { in: ra.stalledIn, stops: ra.after.stops, acts: ra.after.acts }, rb: { in: rb.stalledIn, stops: rb.after.stops } });
}
