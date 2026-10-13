#!/usr/bin/env node
// lane desktop-v2-latency (design q-030 §4 + §6 P1 seed TESTS): THE QUALITY LADDER's PURE rules (src/desktop-quality.js) and
// the timing table's new half (src/desktop-screens.js).
//   §1 qualityPlan truth table: moving / settling / still × a normal / slow link, the bound itself, the hysteresis (slow until
//      SLOW_KBPS × FAST_AGAIN), an unmeasured link keeps the last verdict, the four rungs' levels
//   §2 pictureChanging (a full refresh or a blinking caret is not a moving picture) · sentInput (a hover is not input) ·
//      refreshRequest (the 10 bytes) · pasteChord · pasteText (CRLF → LF) · keyboardLockGate (a secure page only)
//   §3 clientCuts (offsets; QEMU's key) · updateTimer: kbps over updates of ≥ 32 KB timed from their first byte (the server's
//      hold left out), changes = answers to incremental requests in the last second
//   §4 RED CONTROLS: a copy where "settling" counts as still (sharp the instant input stops) and a copy without the hysteresis
//      each fail the §1 table
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const Q = require(path.join(REPO, 'src/desktop-quality.js'));
const S = require(path.join(REPO, 'src/desktop-screens.js'));
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 700) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// [input, rung, still, slow, why]
const TABLE = [
  [{}, 'sharp', true, false, 'still'],                                              // never moved: the first picture is sharp
  [{ moving: true, idleMs: 0 }, 'fluid', false, false, 'moving'],
  [{ idleMs: 499 }, 'fluid', false, false, 'settling'],                            // stopped 499 ms ago: still fluid
  [{ idleMs: 500 }, 'sharp', true, false, 'still'],                                // still 500 ms ⇒ sharp
  [{ moving: true, kbps: 1999 }, 'lean', false, true, 'moving'],                   // a slow link: one rung down
  [{ idleMs: 600, kbps: 1500 }, 'balanced', true, true, 'still'],
  [{ moving: true, kbps: 2000 }, 'fluid', false, false, 'moving'],                 // the bound itself is not slow
  [{ idleMs: 900, kbps: 2500, slow: true }, 'balanced', true, true, 'still'],      // slow stays slow below the bound × 1.5
  [{ idleMs: 900, kbps: 3000, slow: true }, 'sharp', true, false, 'still'],        // … and is normal again at it
  [{ moving: true, kbps: 2500, slow: false }, 'fluid', false, false, 'moving'],    // a normal link is not made slow by the band
  [{ moving: true, slow: true }, 'lean', false, true, 'moving'],                   // no measure yet: the last verdict stands
  [{ moving: true, slow: false }, 'fluid', false, false, 'moving'],
  [{ moving: true, idleMs: 5000 }, 'fluid', false, false, 'moving'],               // moving wins over an old idle
];
const table = (M) => TABLE.filter(([inp, rung, still, slow, why]) => { const p = M.qualityPlan(inp); return !(p.rung === rung && p.still === still && p.slow === slow && p.why === why); }).map(([inp]) => inp);

console.log('§1 qualityPlan');
ok(table(Q).length === 0, `the truth table: ${TABLE.length} rows (moving 3/1, settling < ${Q.STILL_MS} ms stays fluid, still ≥ ${Q.STILL_MS} ms ⇒ 8/2, a slow link < ${Q.SLOW_KBPS} kbps one rung down, back at ≥ ${Q.SLOW_KBPS * Q.FAST_AGAIN})`, table(Q));
const lv = Object.fromEntries(Q.RUNGS.map((r) => [r.rung, `${r.qualityLevel}/${r.compressionLevel}`]));
ok(same(lv, { sharp: '8/2', balanced: '6/4', fluid: '3/1', lean: '1/6' }) && Q.RUNGS.every((r, i) => i === 0 || r.qualityLevel < Q.RUNGS[i - 1].qualityLevel), 'the ladder, sharpest first: sharp 8/2 · balanced 6/4 · fluid 3/1 · lean 1/6 (quality falls rung by rung)', lv);
ok(same([Q.qualityPlan({ moving: true }).qualityLevel, Q.qualityPlan({ moving: true }).compressionLevel, Q.qualityPlan({ idleMs: 500 }).qualityLevel, Q.qualityPlan({ idleMs: 500 }).compressionLevel], [3, 1, 8, 2]), 'the design\'s two numbers: input / a changing picture ⇒ quality 3 / compression 1; still ⇒ 8 / 2');
ok(Q.qualityPlan({ moving: true, kbps: 'x' }).slow === false && Q.qualityPlan({ idleMs: -1 }).why === 'settling' && Q.qualityPlan().rung === 'sharp', 'odd inputs: a non-number kbps is no measure; no arguments = still');

console.log('§2 the small rules');
ok(Q.pictureChanging({ changes: 2, changeBytes: 24 * 1024 }) && !Q.pictureChanging({ changes: 1, changeBytes: 4e6 }) && !Q.pictureChanging({ changes: 10, changeBytes: 2000 }) && !Q.pictureChanging(null),
  'pictureChanging: ≥ 2 updates carrying ≥ 24 KB in a second — one big refresh is not, ten caret blinks are not');
const two = Uint8Array.from([3, 1, 0, 0, 0, 0, 0, 10, 0, 10, 5, 0, 0, 1, 0, 2, 5, 8, 0, 1, 0, 2]);
ok(Q.sentInput(4, null) && Q.sentInput(255, null) && !Q.sentInput(3, two, 0) && !Q.sentInput(5, two, 10) && Q.sentInput(5, two, 16) && !Q.sentInput(5, Uint8Array.from([5]), 0),
  'sentInput: a key (4, QEMU 255) and a press / wheel (5 with a mask bit) are input; a hover (mask 0) and a request are not');
ok(same([...Q.refreshRequest({ x: 1280, y: 0, w: 1280, h: 800 })], [3, 0, 5, 0, 0, 0, 5, 0, 3, 32]) && same([...Q.refreshRequest({ x: -5, y: 70000, w: 10.7, h: null })], [3, 0, 0, 0, 255, 255, 0, 10, 0, 0]),
  'refreshRequest: type 3, incremental 0, x y w h u16 big-endian (clamped to 0…65535)');
ok(same(Q.pasteChord({ ctrlKey: true, code: 'KeyV', key: 'v' }), { keysym: 0x76, code: 'KeyV' }) && same(Q.pasteChord({ metaKey: true, code: 'KeyV', key: 'v' }), { keysym: 0x76, code: 'KeyV' })
  && Q.pasteChord({ ctrlKey: true, shiftKey: true, code: 'KeyV', key: 'V' }).keysym === 0x56 && Q.pasteChord({ ctrlKey: true, key: 'v' }).keysym === 0x76
  && Q.pasteChord({ ctrlKey: true, altKey: true, code: 'KeyV' }) === null && Q.pasteChord({ code: 'KeyV', key: 'v' }) === null && Q.pasteChord({ ctrlKey: true, code: 'KeyC' }) === null && Q.pasteChord(null) === null,
  'pasteChord: Ctrl+V / ⌘V (⇧ ⇒ V) — never with Alt (AltGr on Windows), never a bare V or another letter');
ok(Q.pasteText('a\r\nb\rc\nd') === 'a\nb\nc\nd' && Q.pasteText('') === null && Q.pasteText(null) === null && Q.pasteText('héllo 你好') === 'héllo 你好',
  'pasteText: lines end with LF alone (RFB), nothing to paste ⇒ null, other text untouched (noVNC encodes it)');
const g = (o) => Q.keyboardLockGate(o);
ok(same(g({ secure: false, api: true, fullscreen: true, want: true }), { lock: false, why: 'insecure' }) && g({ secure: true, api: false, fullscreen: true }).why === 'no_api' && g({ secure: true, api: true, fullscreen: true, want: false }).why === 'off'
  && g({ secure: true, api: true, fullscreen: false }).why === 'not_fullscreen' && same(g({ secure: true, api: true, fullscreen: true }), { lock: true, why: 'ok' }),
  'keyboardLockGate: an http page never locks (its words), nor a browser without the API, a toggle that is off, or outside full screen');
ok(Q.NAGLE_REFERENCE.beforeMs === 42.0 && Q.NAGLE_REFERENCE.afterMs === 0.70 && Q.NAGLE_REFERENCE.lane === 'picture-path-nodelay', 'the comparison segment\'s reference = lane picture-path-nodelay\'s recorded 42.0 → 0.70 ms');

console.log('§3 the timing table');
const cut = Uint8Array.from([3, 1, 0, 0, 0, 0, 0, 10, 0, 10, 255, 0, 0, 1, 0, 0, 0, 0x76, 0, 0, 0, 47, 4, 1, 0, 0, 0, 0, 0, 0x76]);
ok(same(S.clientCuts(cut), [{ type: 3, at: 0 }, { type: 255, at: 10 }, { type: 4, at: 22 }]) && same(S.clientMessages(cut), [3, 255, 4]), 'clientCuts: each message with its offset (QEMU\'s 12-byte key cut too); clientMessages keeps the types', S.clientCuts(cut));
let t = S.updateTimer();
t.request(0, false); t.received(5, 100000); t.received(55, 100000); t.request(60, true);
let st = t.stats(60);
ok(st.kbps === Math.round(200000 * 8 / 55) && st.changes === 0, `kbps over an update of ≥ 32 KB from its first byte: 200 000 B in 55 ms = ${st.kbps} kbps; a non-incremental answer is not a change`, st);
t.received(1000, 30000); t.request(1010, true); t.received(1100, 1000); t.request(1105);
st = t.stats(1105);
ok(st.changes === 2 && st.changeBytes === 31000 && st.kbps === Math.round(200000 * 8 / 55), 'answers to incremental requests count as changes (2, 31 000 B); updates < 32 KB are not timed for the rate', st);
ok(t.stats(2200).changes === 0, 'changes older than a second drop out');
t = S.updateTimer();
t.request(0, true); t.received(5000, 40000); t.received(5050, 40000); t.request(5060);
st = t.stats(5060);
ok(st.kbps === Math.round(80000 * 8 / 60) && st.roundTripMs === null, `the server's 5 s hold is not the link: 80 000 B from the first byte = ${st.kbps} kbps (and no round trip — an idle screen)`, st);
t = S.updateTimer();
t.request(3000); t.received(3100, 65536); t.received(4100, 65536); t.request(4200);
ok(t.stats(4200).kbps === Math.round(131072 * 8 / 1100), `a slow update: 128 KB over 1.1 s = ${t.stats(4200).kbps} kbps (< ${Q.SLOW_KBPS})`);
t = S.updateTimer();
t.request(0, false); t.received(1, 8e6); t.request(81, true);                                   // the first full frame, fast
for (let i = 0; i < 3; i++) { const t0 = 1000 + i * 2000; t.received(t0, 65536); t.received(t0 + 1000, 65536); ok(t.request(t0 + 1100, true) === true, `request() answers it closed a change (#${i + 1})`); }
ok(t.stats(7200).kbps === Math.round(131072 * 8 / 1100), `the MEDIAN of the last 5: one fast 8 MB frame + 3 slow updates reads slow (${t.stats(7200).kbps} kbps), not the byte-weighted ~${Math.round((8e6 + 3 * 131072) * 8 / (80 + 3 * 1100))}`);
t = S.updateTimer(); t.received(10, 99999);
ok(t.stats(10).kbps === null && t.stats(10).changes === 0, 'bytes before any request are no sample');

console.log('§4 RED controls');
const dir = scratchDir('tqp');
const mutant = (name, from, to) => {
  const src = fs.readFileSync(path.join(REPO, 'src/desktop-quality.js'), 'utf8');
  if (src.split(from).length !== 2) return null;
  const f = path.join(dir, `${name}.js`);
  fs.writeFileSync(f, src.replace(from, to));
  return require(f);
};
const m1 = mutant('settle-sharp', "(why === 'still' ? 0 : 2)", "(why === 'moving' ? 2 : 0)");
ok(m1 && table(m1).length > 0, `RED CONTROL: "settling counts as still" (sharp the instant input stops) fails ${m1 ? table(m1).length : '?'} row(s)`, m1 && table(m1));
const m2 = mutant('no-hysteresis', 'slow ? k < SLOW_KBPS * FAST_AGAIN : k < SLOW_KBPS', 'k < SLOW_KBPS');
ok(m2 && table(m2).length > 0, `RED CONTROL: no hysteresis (a link at the bound flaps) fails ${m2 ? table(m2).length : '?'} row(s)`, m2 && table(m2));

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
