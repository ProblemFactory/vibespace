#!/usr/bin/env node
// LANE LIVE-INPUT — the owner's report (2026-09-27, Chrome 152 on a Mac, the instance over plain http, the agent's
// NAMED profile "shopping" held by one chat, agent-browser 0.38.1 + chromium 151): "我似乎无法从外面复制文本进入那个
// 浏览器" (a paste never landed), "中文输入法也不 work" (an IME commit never landed), "按另一个窗口的大小 — 非常 confusing"
// (the fit chip), a second `record start` 106 ms after the first, "already holds" on every agent command and the
// page's full query string in the handback line. THE FAST GATE (PURE tables + the REAL bridge in-process):
//   §1 the CHUNKER (src/browser-stream.js textChunks): every chunk ≤ 3 UTF-16 units (MEASURED: Chrome refuses a key
//      text of 4+ — the root cause of both reports), never a split surrogate, the measured control-character rules
//      (a tab ends its chunk, a line break never travels alone) — applied to a MODEL of Chromium 151's `char`
//      behaviour (the table measured on the real binary; scripts/test-browser-live-input.mjs ① re-measures it) over a
//      seeded walk of 3 000 texts: the textarea ends up holding exactly the text.
//   §2 the viewer's verdicts: `input_text` is the holder's only; a key record whose text passes the cap is refused BY
//      NAME (`text_too_long`) — a direct lease's receipt is only the stream write, so it can never be silent again.
//   §3 THE MAC CHORD TABLE (src/browser-takeover.js macChord): ⌘A/C/X/Z/⇧Z … → Ctrl, no text; ⌘ itself → Control;
//      ⌘←/→ → Home/End; ⌥←/→ → Ctrl+←/→; ⌥-characters without Alt; identity for a non-Mac viewer or a Mac browser;
//      the copy chords; the journal's URL (origin + path, never the query).
//   §4 THE FIT CHIP (src/browser-fit.js): a CLAIM rules the page (the driver still wins during a takeover), the
//      place tags say WHERE the size comes from, `fitChipWords` in plain words (a jargon census) with zh + ja.
//   §5 THE RECORDING CHIP (src/browser-trace.js recordingChipWords / cleanRecordError).
//   §6 THE REAL BRIDGE (src/server/browser-stream.js) over a fake stream server that answers like Chromium 151: a paste
//      becomes ≤ 3-unit `char` records IN ORDER with the keys around it and ONE receipt; on a MEDIATED lease never
//      more than INPUT_WINDOW credits wait (the mediator keeps 256 for 1.2 s); a refused chunk stops the act and the
//      receipt says how much landed; COPY OUT: the page's copy reaches the HOLDER only, the watch follows the tab and
//      ends at the handback; a CLAIM makes the page follow that window and the fit record names its place.
//   §7 THE COPY WATCH over a fake CDP endpoint (src/server/browser-viewport.js watchCopies): the isolated world, the
//      per-arm binding, a foreign binding ignored.
//   §8 ONE `record start` at a time (src/server/browser-trace.js): an agent command's attach and the panel's
//      record-on fan-out at once ⇒ ONE exec, no refusal.
//   §9 WIRING PINS on the client (src/lib/browser-live-window.js) and the keeper's two journal lines.
// Every section carries its PATCHED-COPY CONTROL (scripts/mutant-copy.mjs): the pre-fix behaviour turns its leg red.
// The trusted end-to-end legs (a real click, the real paste chord with Ctrl and ⌘, a real composition from keyCode 229,
// a non-secure origin, both kinds of browser) are scripts/test-browser-live-input.mjs (heavy).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const S = require('../src/browser-stream.js');
const T = require('../src/browser-takeover.js');
const FIT = require('../src/browser-fit.js');
const TR = require('../src/browser-trace.js');
const BS = require('../src/server/browser-stream.js');
const VP = require('../src/server/browser-viewport.js');
const RT = require('../src/server/browser-trace.js');
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 10) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const ROOT = scratch('live-input');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const M = mutantCopies('live-input', REPO);
const cleanups = [];
const t0 = Date.now();

/** Chromium 151's `char` behaviour in a TEXTAREA as MEASURED on the real binary (2026-09-27, the lane's m2/m3 runs;
 *  re-measured by the heavy suite ①): a text of 4+ UTF-16 units is refused; "\n" alone inserts nothing; a text that
 *  STARTS with "\t" inserts the tab and drops the rest; one that starts with "\r" inserts a line break and drops the
 *  rest; anything else inserts whole. */
function chromeChar(value, text) {
  if (typeof text !== 'string' || !text || text.length > 3) return { value, refused: true };
  if (text === '\n') return { value, refused: false };
  if (text[0] === '\t') return { value: value + '\t', refused: false };
  if (text[0] === '\r') return { value: value + '\n', refused: false };
  return { value: value + text, refused: false };
}
const typeAll = (recs) => { let v = ''; let refused = 0; for (const r of recs) { const x = chromeChar(v, r.text); v = x.value; if (x.refused) refused++; } return { value: v, refused }; };

// ═══ §1 THE CHUNKER ══════════════════════════════════════════════════════════
console.log('§1 the chunker: ≤ 3 UTF-16 units a chunk, the measured control-character rules');
{
  ok(S.CHAR_TEXT_MAX_UNITS === 3, 'the measured cap is ONE constant: CHAR_TEXT_MAX_UNITS = 3');
  const TABLE = [
    ['hello world', ['hel', 'lo ', 'wor', 'ld']],
    ['你好世界', ['你好世', '界']],
    ['😀😀😀a', ['😀', '😀', '😀a']],
    ['ab\tc', ['ab\t', 'c']],
    ['\t\tz', ['\t', '\t', 'z']],
    ['abc\ndef', ['abc', '\nde', 'f']],
    ['a\n\n\nb', ['a', '\n\n\n', 'b']],
    ['abc\n', ['ab', 'c\n']],
    ['a\r\nb', ['a', '\nb']],
    ['x\u0000y', ['xy']],
  ];
  for (const [text, want] of TABLE) { const c = S.textChunks(text); ok(c.ok && JSON.stringify(c.chunks) === JSON.stringify(want), `textChunks(${JSON.stringify(text)}) = ${JSON.stringify(want)}`, JSON.stringify(c)); }
  const d1 = S.textChunks('x\t\n'), d2 = S.textChunks('\n');
  ok(d1.ok && d1.dropped === 1 && d1.chunks.join('') === 'x\t', 'a final line break after a tab cannot be typed alone — DROPPED and counted (the receipt says so)');
  ok(!d2.ok && d2.code === 'empty' && d2.dropped === 1, 'a text that IS one line break is refused by name (press Enter instead)');
  ok(S.textChunks('').code === 'empty' && S.textChunks('x'.repeat(S.TEXT_MAX + 1)).code === 'too_long' && S.textChunks('x'.repeat(S.TEXT_MAX)).ok, 'empty refused; past TEXT_MAX (20 000 code points) refused whole, never trimmed');
  // the seeded walk: 3 000 texts over the characters a paste / IME carries, applied to the measured model
  const ALPH = ['a', 'b', 'Z', ' ', '-', '1', '\n', '\n', '\t', '你', '好', '界', '😀', '👩‍👩‍👧', 'é', '́', '\r\n', '€'];
  let seed = 20260927; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let bad = 0, n = 0, maxUnits = 0; const bads = [];
  for (let k = 0; k < 3000; k++) {
    let t = ''; const len = 1 + Math.floor(rnd() * 40); for (let i = 0; i < len; i++) t += ALPH[Math.floor(rnd() * ALPH.length)];
    const r = S.textRecords(t); if (!r.ok) continue; n++;
    for (const x of r.records) maxUnits = Math.max(maxUnits, x.text.length);
    const got = typeAll(r.records);
    let want = t.replace(/\r\n?/g, '\n'); if (r.dropped) want = want.replace(/\n$/, '');
    if (got.value !== want || got.refused) { bad++; if (bads.length < 3) bads.push({ t, recs: r.records.map((x) => x.text), got: got.value }); }
  }
  ok(n > 2900 && bad === 0 && maxUnits <= 3, `a seeded walk of ${n} texts (CJK, emoji + ZWJ, combining marks, tabs, line breaks, CRLF): every chunk ≤ 3 units (max ${maxUnits}) and the measured browser types EXACTLY the text (${bad} wrong)`, JSON.stringify(bads));
  // NEGATIVE CONTROLS: the pre-fix chunker (200 code points a record) and a chunker without the tab rule
  const src = read('src/browser-stream.js');
  const PRE = "    if (cur.length + cp.length > cap || (cp === '\\n' && /[^\\n]/.test(cur))) flush();";
  const TAB = "    if (cp === '\\t') flush(); // a tab ENDS its chunk (one that starts with it drops the rest)";
  ok(src.split(PRE).length === 2 && src.split(TAB).length === 2, 'control setup: the chunk cut and the tab rule are each found once');
  const Spre = M.load('src/browser-stream.js', src.replace(PRE, "    if (Array.from(cur).length >= 200) flush();"), 'pre-fix-200');
  const pre = Spre.textRecords('hello world'); const preTyped = typeAll(pre.records);
  ok(pre.ok && pre.records.length === 1 && preTyped.refused === 1 && preTyped.value === '', `NEGATIVE CONTROL: the pre-fix chunk (${pre.records[0] && pre.records[0].text.length} units in ONE record) is refused by the measured browser — "hello world" lands as ${JSON.stringify(preTyped.value)} (the owner's report)`);
  const Stab = M.load('src/browser-stream.js', src.replace(TAB, ''), 'no-tab-rule');
  const tb = typeAll(Stab.textRecords('abc\tdef\tghi').records);
  ok(tb.value !== 'abc\tdef\tghi' && typeAll(S.textRecords('abc\tdef\tghi').records).value === 'abc\tdef\tghi', `NEGATIVE CONTROL: without the tab rule "abc\\tdef\\tghi" types as ${JSON.stringify(tb.value)} (a chunk that starts with a tab drops the rest)`);
}

// ═══ §2 THE VIEWER'S VERDICTS ═════════════════════════════════════════════════
console.log('§2 the viewer\'s verdicts: input_text is the holder\'s; a key text past the cap is refused by name');
{
  const V = (msg, o) => S.viewerMessageVerdict(msg, { holder: 1, viewerId: 1, mode: 'takeover', ...o });
  ok(S.VIEWER_INPUT_TYPES.includes('input_text'), 'input_text is a viewer INPUT type (holder-only, like every input)');
  ok(V({ type: 'input_text', text: 'hello world' }).forward === true && V({ type: 'input_text', text: 'hello world' }).text === true, 'the holder\'s input_text is taken (the bridge cuts it)');
  ok(V({ type: 'input_text', text: 'x' }, { viewerId: 2 }).refusal.code === 'watch-mode' && V({ type: 'input_text', text: 'x' }, { mode: 'watch' }).refusal.code === 'watch-mode', 'another viewer\'s / a watcher\'s input_text is refused watch-mode');
  ok(V({ type: 'input_text', text: '' }).refusal.code === 'empty' && V({ type: 'input_text', text: 'y'.repeat(S.TEXT_MAX + 1) }).refusal.code === 'too_long' && V({ type: 'input_text' }).refusal.code === 'empty', 'an empty / too long / missing text is refused by name');
  const tl = V({ type: 'input_keyboard', eventType: 'char', text: 'abcd' });
  ok(tl.forward === false && tl.refusal.code === 'text_too_long' && V({ type: 'input_keyboard', eventType: 'char', text: 'abc' }).forward === true && V({ type: 'input_keyboard', eventType: 'keyDown', key: '😀', text: '😀' }).forward === true, 'a key record whose text is 4+ units is refused text_too_long (3 units and one emoji pass)');
  const src = read('src/browser-stream.js');
  const G = "    if (t === 'input_keyboard' && typeof msg.text === 'string' && msg.text.length > CHAR_TEXT_MAX_UNITS) return";
  ok(src.split(G).length === 2, 'control setup: the key-text guard is found once');
  const Sg = M.load('src/browser-stream.js', src.replace(G, '    if (false) return'), 'no-key-text-guard');
  ok(Sg.viewerMessageVerdict({ type: 'input_keyboard', eventType: 'char', text: 'abcd' }, { holder: 1, viewerId: 1, mode: 'takeover' }).forward === true, 'NEGATIVE CONTROL: without the guard a 4-unit key text is FORWARDED — Chrome refuses it and a direct lease\'s receipt says "sent"');
  // the receipt book: a text act waits as long as its chunks need
  ok(S.textReceiptMs(0) === S.INPUT_RECEIPT_MS && S.textReceiptMs(1000) === S.INPUT_RECEIPT_MS + 10000 && S.textReceiptMs(1e9) === 120000, 'a text act\'s receipt wait = 1.5 s + 10 ms a chunk, at most 2 min (the stream dispatches one record after the other)');
  const b = S.receiptBook(); S.noteInputSent(b, 0, { ms: 5000 });
  ok(S.sweepInputReceipts(b, 2000) === 0 && S.sweepInputReceipts(b, 5100) === 1 && b.failing.code === 'no_answer', 'the book honours a record\'s own wait (a long paste is not "no answer" at 1.5 s)');
  const b2 = S.receiptBook(); const rid = S.noteInputSent(b2, 0); S.noteInputReceipt(b2, { rid, ok: false, code: 'browser_refused', landed: 120 });
  ok(b2.failing && b2.failing.landed === 120, 'a failed text receipt keeps how many characters landed first (the echo says it)');
}

// ═══ §3 THE MAC CHORD TABLE ═══════════════════════════════════════════════════
console.log('§3 a Mac viewer\'s ⌘ chords on a non-Mac browser; the copy chords; the journal\'s URL');
{
  const mac = (k) => T.macChord(k, { viewerMac: true, remoteMac: false });
  const rec = (k) => { const m = mac(k); const r = S.keyRecord({ kind: 'down', key: m.key, code: m.code, modifiers: S.modifiersOf(m), keyCode: m.keyCode }); if (r && m.dropText) delete r.text; return r; };
  const ROWS = [
    [{ key: 'a', code: 'KeyA', keyCode: 65, metaKey: true }, { key: 'a', modifiers: 2, text: undefined }, '⌘A → Ctrl+A, no text'],
    [{ key: 'c', code: 'KeyC', keyCode: 67, metaKey: true }, { key: 'c', modifiers: 2, text: undefined }, '⌘C → Ctrl+C'],
    [{ key: 'x', code: 'KeyX', keyCode: 88, metaKey: true }, { key: 'x', modifiers: 2, text: undefined }, '⌘X → Ctrl+X'],
    [{ key: 'z', code: 'KeyZ', keyCode: 90, metaKey: true }, { key: 'z', modifiers: 2, text: undefined }, '⌘Z → Ctrl+Z'],
    [{ key: 'Z', code: 'KeyZ', keyCode: 90, metaKey: true, shiftKey: true }, { key: 'Z', modifiers: 10, text: undefined }, '⌘⇧Z → Ctrl+Shift+Z (redo)'],
    [{ key: 'Meta', code: 'MetaLeft', keyCode: 91, metaKey: true }, { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 }, '⌘ itself → Control held'],
    [{ key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, metaKey: true, shiftKey: true }, { key: 'Home', windowsVirtualKeyCode: 36, modifiers: 8 }, '⌘⇧← → Shift+Home'],
    [{ key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, metaKey: true }, { key: 'End', windowsVirtualKeyCode: 35, modifiers: 2 }, '⌘↓ → Ctrl+End'],
    [{ key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, altKey: true }, { key: 'ArrowRight', modifiers: 2 }, '⌥→ → Ctrl+→ (never Alt+→ = Back)'],
    [{ key: 'Backspace', code: 'Backspace', keyCode: 8, altKey: true }, { key: 'Backspace', modifiers: 2 }, '⌥⌫ → Ctrl+Backspace'],
    [{ key: '™', code: 'Digit2', keyCode: 50, altKey: true }, { key: '™', modifiers: 0, text: '™' }, '⌥2 (™) → the character, no Alt'],
    [{ key: 'v', code: 'KeyV', keyCode: 86 }, { key: 'v', modifiers: 0, text: 'v' }, 'a plain key is untouched'],
  ];
  for (const [k, want, name] of ROWS) { const r = rec(k); const bad = Object.entries(want).filter(([f, v]) => (v === undefined ? f in r : r[f] !== v)); ok(bad.length === 0, name, JSON.stringify(r)); }
  const id = { key: 'a', code: 'KeyA', keyCode: 65, metaKey: true };
  ok(T.macChord(id, { viewerMac: false, remoteMac: false }).metaKey === true && T.macChord(id, { viewerMac: true, remoteMac: true }).metaKey === true && T.macChord(id, { viewerMac: true, remoteMac: true }).rule === null, 'identity for a non-Mac viewer, and for a Mac browser (⌘ means ⌘ there)');
  ok(T.MAC_CHORD_ROWS.length >= 8 && T.MAC_CHORD_ROWS.every((r) => r.id && r.from && r.to && r.why), `the table is data: ${T.MAC_CHORD_ROWS.length} rows, each with from / to / why`);
  ok(T.keyRoute({ key: '\\', ctrlKey: true }).to === 'app' && T.keyRoute({ key: 'v', metaKey: true }).to === 'paste' && T.keyRoute({ key: 'a', metaKey: true }).to === 'page', 'reserved chords keep their route (keyRoute runs first): Ctrl+\\ is the app\'s, ⌘V the paste route, ⌘A the page\'s (then translated)');
  ok(T.isMacPlatform('MacIntel') && T.isMacPlatform('macOS') && T.isMacPlatform('darwin') && T.isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)') && !T.isMacPlatform('Linux x86_64') && !T.isMacPlatform('Win32') && !T.isMacPlatform(''), 'isMacPlatform: navigator.platform / userAgentData / node / a UA');
  ok(T.copyChordOf({ key: 'c', ctrlKey: true }) === 'copy' && T.copyChordOf({ key: 'c', metaKey: true }) === 'copy' && T.copyChordOf({ key: 'x', metaKey: true }) === 'cut' && T.copyChordOf({ key: 'Insert', ctrlKey: true }) === 'copy' && T.copyChordOf({ key: 'Delete', shiftKey: true }) === 'cut' && T.copyChordOf({ key: 'c' }) === null && T.copyChordOf({ key: 'c', ctrlKey: true, altKey: true }) === null, 'the copy-out chords: Ctrl/⌘+C, Ctrl+Insert copy; Ctrl/⌘+X, Shift+Delete cut; nothing else');
  // ── THE COPY-OUT DOOR (verify 2026-09-27, CONFIRMED on the real stack: a page's synthetic copy on a timer — or one the
  // agent planted with `eval` before the takeover — wrote the driving user's clipboard with nothing pressed on a secure
  // page and after any click on plain http). A copy leaves the server only on the holder's OWN gesture the bridge
  // forwarded: single-use, COPY_GESTURE_MS, fail closed; only a CHORD's copy is written by itself, a click's is the chip.
  const kd = (key, modifiers, extra = {}) => ({ type: 'input_keyboard', eventType: 'keyDown', key, modifiers, ...extra });
  const G = [
    [kd('c', 2), 'chord', 'Ctrl+C keyDown'], [kd('c', 4), 'chord', '⌘C keyDown (a Mac viewer\'s, before the table)'], [kd('x', 2), 'chord', 'Ctrl+X'], [kd('Insert', 2), 'chord', 'Ctrl+Insert'], [kd('Delete', 8), 'chord', 'Shift+Delete'],
    [kd('c', 0), null, 'a plain c'], [kd('c', 3), null, 'Ctrl+Alt+C'], [{ ...kd('c', 2), eventType: 'keyUp' }, null, 'a keyUp'], [{ type: 'input_keyboard', eventType: 'char', text: 'c', modifiers: 0 }, null, 'a text chunk'],
    [{ type: 'input_mouse', eventType: 'mousePressed', x: 1, y: 1, button: 'left' }, 'click', 'a press (the page\'s own Copy button)'], [{ type: 'input_mouse', eventType: 'mouseMoved', x: 1, y: 1 }, null, 'a move'], [{ type: 'input_mouse', eventType: 'mouseReleased', x: 1, y: 1 }, null, 'a release'],
    [{ type: 'input_touch', eventType: 'touchStart' }, null, 'a touch'], [null, null, 'nothing'],
  ];
  for (const [r, want, name] of G) ok(T.copyGestureOfRecord(r) === want, `copyGestureOfRecord: ${name} ⇒ ${JSON.stringify(want)}`, JSON.stringify(T.copyGestureOfRecord(r)));
  ok(T.armCopyGesture(null, kd('c', 2), 100).gesture === 'chord' && T.armCopyGesture({ gesture: 'chord', at: 100 }, kd('v', 2), 200).at === 100 && T.armCopyGesture({ gesture: 'chord', at: 100 }, { type: 'input_mouse', eventType: 'mousePressed' }, 200).gesture === 'click' && T.armCopyGesture(null, kd('v', 2), 5) === null, 'armCopyGesture: a gesture arms (the latest replaces), any other record leaves the arm');
  const V = [[null, 100, false, 'no-gesture'], [{ gesture: 'chord', at: 100 }, 100 + T.COPY_GESTURE_MS, true, null], [{ gesture: 'chord', at: 100 }, 101 + T.COPY_GESTURE_MS, false, 'stale'], [{ gesture: 'click', at: 100 }, 500, true, null], [{ gesture: 'chord', at: 500 }, 100, false, 'stale'], [{ gesture: 'timer', at: 100 }, 100, false, 'no-gesture']];
  for (const [arm, at, deliver, why] of V) { const v = T.copyDeliverVerdict(arm, at); ok(v.deliver === deliver && v.why === why && v.arm === null, `copyDeliverVerdict(${JSON.stringify(arm)}, ${at}) ⇒ ${deliver ? 'deliver ' + v.gesture : 'drop (' + why + ')'} — the arm is consumed either way`, JSON.stringify(v)); }
  const Wv = [[{ gesture: 'chord', chordAge: 100, secure: true, canWrite: true }, 'api'], [{ gesture: 'chord', chordAge: 100, secure: false }, 'gesture'], [{ gesture: 'chord', chordAge: 4999 }, 'gesture'], [{ gesture: 'chord', chordAge: 5001 }, 'chip'], [{ gesture: 'chord', chordAge: null, secure: true, canWrite: true }, 'chip'], [{ gesture: 'click', chordAge: 100, secure: true, canWrite: true }, 'chip'], [{ gesture: null, chordAge: 100 }, 'chip'], [{}, 'chip']];
  for (const [a, want] of Wv) ok(T.copyWriteVerdict(a) === want, `copyWriteVerdict(${JSON.stringify(a)}) = ${want}`, T.copyWriteVerdict(a));
  ok(T.COPY_GESTURE_MS >= 1500 && T.COPY_GESTURE_MS <= 3000 && T.COPY_GESTURES.join() === 'chord,click', `COPY_GESTURE_MS ${T.COPY_GESTURE_MS} (a page answers the key within it); the gestures are chord and click, nothing else`);
  const U = [['https://shop.example.com/checkout/pay?order=123&token=abc#frag', 'https://shop.example.com/checkout/pay?…'], ['http://127.0.0.1:3/a', 'http://127.0.0.1:3/a'], ['about:blank', 'about:blank'], ['data:text/html,<b>secret</b>', 'data:…'], ['', '']];
  for (const [u, w] of U) ok(T.urlForLog(u) === w, `urlForLog(${JSON.stringify(u).slice(0, 50)}) = ${JSON.stringify(w)}`);
  const src = read('src/browser-takeover.js');
  const C = "  if (!viewerMac || remoteMac) return f;";
  ok(src.split(C).length === 2, 'control setup: the Mac gate is found once');
  const Tid = M.load('src/browser-takeover.js', src.replace(C, '  return f;'), 'no-mac-map');
  const m0 = Tid.macChord({ key: 'a', code: 'KeyA', keyCode: 65, metaKey: true }, { viewerMac: true, remoteMac: false });
  const r0 = S.keyRecord({ kind: 'down', key: m0.key, code: m0.code, modifiers: S.modifiersOf(m0), keyCode: m0.keyCode });
  ok(r0.modifiers === 4 && r0.text === 'a', 'NEGATIVE CONTROL: without the table ⌘A reaches the page as Meta+A carrying the text "a" — MEASURED on Chromium 151 to TYPE the letter');
}

// ═══ §4 THE FIT CHIP ══════════════════════════════════════════════════════════
console.log('§4 the fit chip: a claim rules the page; the words say where the size comes from and what a click does');
{
  const fits = [{ viewerId: 1, width: 1400, height: 900 }, { viewerId: 2, width: 700, height: 450 }];
  ok(FIT.fitTarget({ fits }).viewerId === 1 && FIT.fitTarget({ fits, claim: 2 }).viewerId === 2 && FIT.fitTarget({ fits, claim: 2 }).rule === 'claimed', 'the largest rules, until a view CLAIMS the page ("Fit here")');
  ok(FIT.fitTarget({ fits, claim: 2, mode: 'takeover', holder: 1 }).rule === 'holder' && FIT.fitTarget({ fits: [fits[0], { ...fits[1], visible: false }], claim: 2 }).viewerId === 1 && FIT.fitTarget({ fits, claim: 9 }).viewerId === 1, 'the driver still wins during a takeover; a hidden or gone claimant never rules');
  ok(FIT.fitVerdict({ fits, claim: 2, baseline: { width: 1280, height: 720 } }).viewerId === 2, 'fitVerdict passes the claim through');
  const rep = FIT.fitReport({ width: 700, height: 450, claim: true, place: { page: 'pAbc123', device: 'dXyz789', evil: '<b>' } });
  ok(rep.claim === true && rep.place.page === 'pAbc123' && rep.place.device === 'dXyz789' && !('evil' in rep.place) && FIT.fitReport({ width: 7, height: 4, place: { page: '<script>' } }).place === null, 'fitReport keeps a claim and the two place tags (random ids — anything else dropped)');
  const mine = { page: 'pMine01', device: 'dDev001' };
  const fit = (place, extra = {}) => ({ state: 'fitted', width: 1400, height: 900, viewerId: 2, rule: 'largest', place, ...extra });
  const chip = (f, pane = { width: 700, height: 450 }) => FIT.fitChipState({ fit: f, you: 3, place: mine, pane });
  ok(chip(fit({ page: 'pMine01', device: 'dDev001' })).where === 'this-page' && chip(fit({ page: 'pOther1', device: 'dDev001' })).where === 'this-device' && chip(fit({ page: 'pOther1', device: 'dOther1' })).where === 'other-device' && chip(fit(null)).where === null, 'WHERE: this page / another tab of this browser / another device / unknowable (never a guess)');
  ok(chip(fit(null)).how === 'smaller' && chip(fit(null), { width: 2800, height: 1800 }).how === 'larger' && chip(fit(null), { width: 1400, height: 900 }).how === null && chip(fit(null)).act === 'claim', 'HOW: smaller / larger than here (from this view\'s own window); the act is `claim`');
  const W = (c) => FIT.fitChipWords(c);
  const other = W(chip(fit({ page: 'pOther1', device: 'dDev001' })));
  ok(other.text === 'Sized for your other tab · Fit here' && /1400×900/.test(other.title) && /another tab or window of yours on this device/.test(other.title) && /shown smaller/.test(other.title) && /Click to make the page fit this window instead/.test(other.title), `the words (en): "${other.text}" — "${other.title}"`);
  const drv = W(chip(fit({ page: 'pOther1', device: 'dOther1' }, { rule: 'holder' })));
  ok(/whoever is driving it/.test(drv.title) && /once that window hands back/.test(drv.title) && drv.text === 'Sized for another device · Fit here', 'while somebody else drives, the words say the page follows the driver and the claim applies at the handback');
  const kinds = [chip(fit({ page: 'pMine01' })), chip(fit({ page: 'x1234', device: 'dDev001' })), chip(fit({ device: 'dElse01', page: 'p0000001' })), chip(fit(null)), FIT.fitChipState({ fit: { state: 'agent', width: 800, height: 600 } }), FIT.fitChipState({ fit: { state: 'agent', width: 390, height: 844, device: 'iPhone 12' } }), FIT.fitChipState({ fit: { state: 'fitted', width: 500, height: 974, viewerId: 1, floor: 500, drawScale: 0.78 }, you: 1 }), FIT.fitChipState({ fit: { state: 'unavailable', width: 1280, height: 577, error: 'the page did not take the size' } })];
  const all = kinds.map(W);
  ok(all.every((w) => w.text && w.title) && all.every((w) => !/\b(viewport|pane|lease|rule)\b/i.test(w.text + ' ' + w.title)), `every kind has words, none of them jargon (no viewport / pane / lease / rule) — ${all.length} kinds`);
  // every literal key the words use has zh + ja entries
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const keysOf = (rel, fn) => { const s = read(rel); const body = s.slice(s.indexOf(fn)); return [...body.slice(0, body.indexOf('\n}\n')).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => new Function(`return '${m[1]}'`)()); };
  const fk = keysOf('src/browser-fit.js', 'function fitChipWords'), rk = keysOf('src/browser-trace.js', 'function recordingChipWords');
  const missing = [...fk, ...rk].filter((k) => !zh[k] || !ja[k]);
  ok(fk.length >= 20 && rk.length >= 10 && missing.length === 0, `every literal of the chip words (${fk.length} fit + ${rk.length} recording) has zh + ja entries`, missing.join(' | '));
  ok(zh['Sized for your other tab · Fit here'] === '网页大小跟随你的另一个标签页 · 点此适配本窗口', 'the owner\'s language says it plainly: "网页大小跟随你的另一个标签页 · 点此适配本窗口"');
  // builder r2 (the reality verifier's words, 2026-09-27): read in the owner's language, sentence by sentence
  const tr = (dict) => (s, p) => { let x = dict[s] || s; if (p) x = x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)); return x; };
  const Z = (c) => FIT.fitChipWords(c, { t: tr(zh) }), J = (c) => FIT.fitChipWords(c, { t: tr(ja) });
  const agentDev = FIT.fitChipState({ fit: { state: 'agent', width: 390, height: 844, device: 'iPhone 15' } });
  ok(W(agentDev).title.startsWith('The agent set this page to the iPhone 15 size (390×844). This window') && !/ a iPhone/.test(W(agentDev).title), `en: "${W(agentDev).title.slice(0, 70)}…" (never "the size of a iPhone 15")`);
  ok(/（390×844）。这个窗口/.test(Z(agentDev).title) && /にしました。この/.test(J(agentDev).title) && !/\. /.test(Z(agentDev).title + J(agentDev).title), `zh / ja: the full stop is inside the sentence, no ASCII ". " — "${Z(agentDev).title}"`);
  const holderZ = Z(chip(fit({ page: 'pOther1', device: 'dDev001' }, { rule: 'holder' })));
  const holderJ = J(chip(fit({ page: 'pOther1', device: 'dDev001' }, { rule: 'holder' })));
  ok(/照着正在操作它的那个窗口/.test(holderZ.title) && !/排的/.test(holderZ.title) && /等那个窗口交还控制/.test(holderZ.title) && !/对方/.test(holderZ.title), `zh: "照着…调的", "等那个窗口交还控制" (never 排的 / 对方 — the driver is usually your own other tab): "${holderZ.title}"`);
  ok(/そのウィンドウが操作を戻したあと/.test(holderJ.title) && !/相手/.test(holderJ.title), `ja: "そのウィンドウが操作を戻したあと" (never 相手): "${holderJ.title}"`);
  const zhTitles = kinds.map((c) => Z(c).title).concat([holderZ.title]);
  ok(zhTitles.every((x) => !/[。？！] /.test(x)) && kinds.map((c) => J(c).title).every((x) => !/[。？！] /.test(x)), 'zh / ja: no space after a full stop in any chip sentence (joined by the translated "{first} {then}")');
  const raw = 'CDP error (Emulation.setDeviceMetricsOverride): browser_interrupted: The user took over this browser — your operation was interrupted';
  const un = FIT.fitChipState({ fit: { state: 'unavailable', width: 698, height: 435, error: raw, code: 'viewport_failed' } });
  ok(!/CDP|Emulation|browser_interrupted|Details/.test(W(un).title) && Z(un).title === '网页没法按这个窗口调整大小，所以按比例缩放显示。', `unavailable: never the raw error in the tooltip — zh "${Z(un).title}"`);
  const heldMine = FIT.fitChipState({ fit: { state: 'unavailable', width: 1398, height: 835, error: raw, code: 'held_while_driving' }, mine: true });
  const heldOther = FIT.fitChipState({ fit: { state: 'unavailable', width: 1398, height: 835, error: raw, code: 'held_while_driving' }, mine: false });
  ok(Z(heldMine).text === '网页 1398×835 · 交还控制后再调整大小' && /^你在操作这个共享浏览器/.test(Z(heldMine).title) && /^有人在操作这个共享浏览器/.test(Z(heldOther).title) && !/CDP|Emulation|interrupted/.test(W(heldMine).title + W(heldOther).title), `a shared browser held while somebody drives: "${Z(heldMine).text}" — "${Z(heldMine).title}" / the watcher: "${Z(heldOther).title}"`);
  ok(zh['Copied in the page — click to copy'] === '已在网页里复制 — 点这里放进剪贴板' && zh['Video off'] === '未开录像', 'zh: the copy chip "已在网页里复制 — 点这里放进剪贴板", the recording chip "未开录像"');
  const recZ = TR.recordingChipWords({ refused: { code: 'record_failed', error: 'Error: recording already in progress' } }, { t: tr(zh) });
  ok(/再打开。详情：Error/.test(recZ.title), `the recording chip's detail joins without a space too ("${recZ.title}")`);
  // NEGATIVE CONTROLS: the pre-fix join ("who + '. ' + …" / spaces between zh sentences) and the raw error in the tooltip
  const fsrc = read('src/browser-fit.js');
  const CJ = "  const join = (...parts) => parts.filter(Boolean).reduce((a, b) => t('{first} {then}', { first: a, then: b }));";
  const CU = "    return { text: t('Page {w}×{h} · could not resize', size), title: t('The page could not be resized to this window, so it is shown scaled.') };";
  ok(fsrc.split(CJ).length === 2 && fsrc.split(CU).length === 2, 'control setup: the sentence join and the unavailable words are each found once');
  const Fj = M.load('src/browser-fit.js', fsrc.replace(CJ, "  const join = (...parts) => parts.filter(Boolean).join(' ');").replace(CU, "    return { text: t('Page {w}×{h} · could not resize', size), title: t('The page could not be resized to this window, so it is shown scaled.') + (c.error ? ' ' + t('Details: {why}', { why: String(c.error).slice(0, 200) }) : '') };"), 'pre-words');
  const zj = Fj.fitChipWords(Fj.fitChipState({ fit: { state: 'agent', width: 390, height: 844, device: 'iPhone 15' } }), { t: tr(zh) }).title;
  const zu = Fj.fitChipWords(Fj.fitChipState({ fit: { state: 'unavailable', width: 698, height: 435, error: raw } }), { t: tr(zh) }).title;
  ok(/。 这个窗口/.test(zj) && /CDP error/.test(zu), `NEGATIVE CONTROL: the pre-fix words put a space after 。 ("${zj}") and the agent's CDP refusal in the tooltip`);
  const src = read('src/browser-fit.js');
  const C = "  if (claim !== null && claim !== undefined) { // lane live-input: the pane a viewer asked for by its own click (\"Fit here\")";
  ok(src.split(C).length === 2, 'control setup: the claim rule is found once');
  const Fno = M.load('src/browser-fit.js', src.replace(C, '  if (false) {'), 'no-claim');
  ok(Fno.fitTarget({ fits, claim: 2 }).viewerId === 1, 'NEGATIVE CONTROL: without the claim rule "Fit here" changes nothing — the largest window keeps the page');
}

// ═══ §5 THE RECORDING CHIP ════════════════════════════════════════════════════
console.log('§5 the recording chip: three states a person can act on; a failed start without its command line');
{
  const raw = 'Command failed: agent-browser record start /home/u/vibespace/data/browser-recordings/bp-1/sess-1-179.webm\nError: A recording is already in progress for /tmp/x/y.webm';
  ok(TR.cleanRecordError(raw) === 'Error: A recording is already in progress for …', `cleanRecordError keeps the CLI's own sentence, not its command line or paths ("${TR.cleanRecordError(raw)}")`);
  const W = (o) => TR.recordingChipWords(o);
  ok(W({ recording: { file: 'x' }, since: '17:25' }).state === 'on' && /since 17:25/.test(W({ recording: { file: 'x' }, since: '17:25' }).title) && !/\.webm|bp-/.test(W({ recording: { file: 'bp-1/s-1.webm' }, since: 't' }).title), 'on: "Recording video" + since when — never a file path');
  ok(W({}).state === 'off' && W({}).text === 'Video off' && /Actions/.test(W({}).title) && W({ hasProfile: false }).state === 'none', 'off: "Video off" + what a click does (the action list is kept either way); a temporary browser says it has no profile to record under');
  const ref = W({ refused: { code: 'record_failed', error: raw } });
  ok(ref.state === 'refused' && ref.text === 'Video did not start' && /Turn video off and on again/.test(ref.title) && /already in progress/.test(ref.title) && !/Command failed|\/home\//.test(ref.title), `refused: a sentence with its remedy, the detail after it ("${ref.title}")`);
  ok(/Update it/.test(W({ refused: { code: 'recording_floor', error: 'x' } }).title) && !/Details/.test(W({ refused: { code: 'recording_floor', error: 'x' } }).title), 'a known refusal is said by its code alone');
}

// ═══ §6 THE REAL BRIDGE over a fake stream server that answers like Chromium 151 ═══
console.log('§6 the real bridge: a paste in order, the mediated window, a refused chunk, copy out, the claim');
/** The fake stream server: every input record recorded in arrival order; a `char` / key text applied to a textarea by
 *  the MEASURED model (a refused one changes nothing, like the real daemon, which answers nothing). */
async function fakeUpstream() {
  const port = await freePort();
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  const wss = new WebSocketServer({ server: srv });
  const U = { port, got: [], value: '', refused: 0, clients: new Set() };
  U.emit = (o) => { for (const c of U.clients) if (c.readyState === 1) c.send(JSON.stringify(o)); };
  wss.on('connection', (ws) => {
    U.clients.add(ws); ws.on('close', () => U.clients.delete(ws));
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } if (m.type === 'config') return; U.got.push(m); if (m.type === 'input_keyboard' && typeof m.text === 'string' && (m.eventType === 'char' || m.eventType === 'keyDown')) { const x = chromeChar(U.value, m.text); U.value = x.value; if (x.refused) U.refused++; } });
    ws.send(JSON.stringify({ type: 'status', connected: true, screencasting: true }));
    ws.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', active: true, url: 'https://a.test/', title: 'a', targetId: 'TGT1' }] }));
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  U.close = () => new Promise((r) => { for (const c of U.clients) { try { c.terminate(); } catch { } } wss.close(); srv.close(() => r()); });
  return U;
}
function stubKeeper(U, { mediated = false, creditMs = 5, failAt = -1 } = {}) {
  const K = { credits: 0, maxOut: 0, out: 0, watches: [], copies: [] };
  const k = {
    setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }),
    streamPortFor: async () => ({ ok: true, port: U.port }),
  };
  if (mediated) k.creditUserInput = () => {
    const n = K.credits++; K.out++; K.maxOut = Math.max(K.maxOut, K.out);
    return new Promise((r) => setTimeout(() => { K.out--; r(n === failAt ? { ok: false, code: 'browser_refused', error: "Invalid 'text' parameter" } : { ok: true }); }, creditMs));
  };
  k.watchCopiesFor = async (target, { targetId, onCopy, onEnd }) => { const w = { targetId, onCopy, onEnd, closed: false }; K.watches.push(w); return { ok: true, targetId, close: () => { w.closed = true; } }; };
  return { k, K };
}
async function bridgeOn(BSmod, keeper, opts = {}) {
  const activeSessions = new Map([['s1', { _browserKey: 'bk-0000000a', _browserEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a'] }]]);
  const logs = [];
  const bridge = BSmod.create({ keeper, activeSessions, requestAuthed: () => true, log: { warn: (m) => logs.push(m), log: (m) => logs.push(m) }, platform: 'linux', ...opts });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
  return { bridge, P, logs, close: () => new Promise((r) => { bridge.shutdown(); srv.close(() => r()); }) };
}
function viewer(P) {
  const ws = new WebSocket(`ws://127.0.0.1:${P}${S.STREAM_PATH}?session=s1`);
  const V = { ws, msgs: [], you: null, hello: null };
  ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } V.msgs.push(m); if (m.type === 'hello') { V.you = m.you; V.hello = m; } });
  V.send = (o) => ws.send(JSON.stringify(o));
  V.ready = () => until(() => V.you !== null && V.msgs.some((m) => m.type === 'status' && m.state === 'upstream-open'), 4000);
  V.receipts = () => V.msgs.filter((m) => m.type === 'input-receipt');
  V.close = () => new Promise((r) => { if (ws.readyState === 3) return r(); ws.once('close', r); ws.close(); });
  return V;
}
const takeover = async (V) => { V.send({ type: 'takeover' }); return until(() => V.msgs.some((m) => m.type === 'mode' && m.mode === 'takeover' && m.mine), 3000); };
/** ONE world: a paste between two keys; returns what the stream server got. */
async function pasteLeg(BSmod, { mediated = false, text = 'hello world', failAt = -1 } = {}) {
  const U = await fakeUpstream(); const { k, K } = stubKeeper(U, { mediated, failAt, creditMs: 3 }); const B = await bridgeOn(BSmod, k);
  const V = viewer(B.P); await V.ready(); await takeover(V);
  V.send({ type: 'input_keyboard', eventType: 'keyDown', key: 'x', code: 'KeyX', text: 'x', windowsVirtualKeyCode: 88, modifiers: 0, rid: 1 });
  V.send({ type: 'input_text', text, rid: 2 });
  V.send({ type: 'input_keyboard', eventType: 'keyDown', key: 'y', code: 'KeyY', text: 'y', windowsVirtualKeyCode: 89, modifiers: 0, rid: 3 });
  await until(() => V.receipts().length >= 3, 15000);
  await until(() => U.got.length >= 2 + Math.ceil(text.length / 3), 3000);
  await sleep(50);
  const out = { value: U.value, refused: U.refused, got: U.got.map((m) => m.text), receipts: V.receipts(), maxOut: K.maxOut, credits: K.credits, hello: V.hello, stats: B.bridge.stats()[0] };
  await V.close(); await B.close(); await U.close();
  return out;
}
{
  const a = await pasteLeg(BS, { text: 'hello world' });
  ok(a.hello && a.hello.platform === 'linux', 'the hello names the browser\'s OS (a Mac viewer translates its ⌘ chords for it)');
  ok(a.value === 'xhello worldy' && a.refused === 0 && a.got.every((t) => t.length <= 3), `a paste of 11 characters between two keys lands WHOLE and IN ORDER (${JSON.stringify(a.value)}; records ${JSON.stringify(a.got)})`);
  const r2 = a.receipts.find((r) => r.rid === 2);
  ok(a.receipts.length === 3 && r2 && r2.ok && r2.via === 'stream' && a.receipts.every((r) => r.ok), 'ONE receipt for the whole paste (via stream on a direct lease), one per key');
  ok(a.stats.textActs === 1 && a.stats.textChunks === 4 && a.stats.input && a.stats.input.queued === 0, `the bridge counts the act and its chunks (${a.stats.textActs} act, ${a.stats.textChunks} chunks, queue empty)`);
  const cjk = await pasteLeg(BS, { text: '我想买这个东西然后付款吧😀\n第二行\t完' });
  ok(cjk.value === 'x我想买这个东西然后付款吧😀\n第二行\t完y' && cjk.refused === 0, 'CJK + emoji + a line break + a tab land exactly (the IME\'s 12-character commit that died before)');
  const big = 'The quick brown fox 狐狸 😀 jumps.\n'.repeat(60);
  const med = await pasteLeg(BS, { mediated: true, text: big });
  ok(med.value === 'x' + big + 'y' && med.refused === 0, `a MEDIATED lease: a ${Array.from(big).length}-character paste (${med.credits - 2} chunks) lands whole and in order`);
  ok(med.maxOut <= BS.INPUT_WINDOW && med.maxOut >= 2, `…never more than INPUT_WINDOW (${BS.INPUT_WINDOW}) credits waiting at once (max ${med.maxOut}; the mediator keeps 256 for 1.2 s)`);
  const hole = await pasteLeg(BS, { mediated: true, text: 'abcdefghijklmnopqrstuvwxyz', failAt: 4 }); // credit #4 = the 4th chunk of the paste ("jkl")
  const hr = hole.receipts.find((r) => r.rid === 2);
  ok(hr && !hr.ok && hr.code === 'browser_refused' && hr.landed === 9, `a chunk the browser refused stops the act: the receipt says browser_refused and that 9 characters landed first (${JSON.stringify(hr)})`);
  ok(hole.receipts.find((r) => r.rid === 3) && hole.receipts.find((r) => r.rid === 3).ok && hole.value.endsWith('y'), 'the key typed after it still goes (the act\'s tail is not typed around the hole)');
  // NEGATIVE CONTROLS
  const src = read('src/server/browser-stream.js');
  const C1 = '    const r = S.textRecords(text);';
  const C2 = '      if (relay.inflight >= inputWindow) return; // a settling credit pumps again';
  ok(src.split(C1).length === 2 && src.split(C2).length === 2, 'control setup: the chunking call and the window are each found once');
  const pre = await pasteLeg(M.load('src/server/browser-stream.js', src.replace(C1, '    const r = S.textRecords(text, { units: 400 });'), 'pre-fix-chunks'), { text: 'hello world' });
  const preR = pre.receipts.find((r) => r.rid === 2);
  ok(pre.value === 'xy' && pre.refused === 1 && preR && preR.ok && preR.via === 'stream', `NEGATIVE CONTROL: the pre-fix record (the whole text in one \`char\`) is refused by the browser — the page holds ${JSON.stringify(pre.value)} while the receipt says ok via stream (the owner's silent loss)`);
  const nowin = await pasteLeg(M.load('src/server/browser-stream.js', src.replace(C2, ''), 'no-window'), { mediated: true, text: big });
  ok(nowin.maxOut > BS.INPUT_WINDOW, `NEGATIVE CONTROL: without the window ${nowin.maxOut} credits wait at once (the mediator's 256 / 1.2 s would evict the paste's first chunks)`);
}
{
  // COPY OUT + THE CLAIM
  const world = async (BSmod) => {
    const U = await fakeUpstream(); const { k, K } = stubKeeper(U); const B = await bridgeOn(BSmod, k);
    const A = viewer(B.P), W = viewer(B.P); await A.ready(); await W.ready();
    return { U, K, B, A, W, close: async () => { await A.close(); await W.close(); await B.close(); await U.close(); } };
  };
  const w = await world(BS);
  ok(w.K.watches.length === 0, 'no copy watch while nobody drives');
  await takeover(w.A); await until(() => w.K.watches.length === 1, 2000);
  ok(w.K.watches.length === 1 && w.K.watches[0].targetId === 'TGT1', 'a takeover arms ONE copy watch on the tab on show (the stream\'s active targetId)');
  // verify (2026-09-27): a copy the page fires with NO gesture of the holder's is DROPPED at the bridge — nothing leaves
  w.K.watches[0].onCopy({ kind: 'copy', text: 'HIJACK-1', length: 8 }); await sleep(60);
  const clips = () => w.A.msgs.filter((m) => m.type === 'clipboard');
  ok(clips().length === 0 && w.B.bridge.stats()[0].copiesDropped === 1 && w.B.bridge.stats()[0].copies === 0, 'a copy the page fires with NO gesture of the holder\'s (a timer, a planted script) never leaves the server — dropped and counted');
  // the holder's own Ctrl+C (forwarded as a key record) arms ONE delivery
  w.A.send({ type: 'input_keyboard', eventType: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2, rid: 11 });
  await until(() => w.U.got.some((m) => m.key === 'c'), 2000);
  w.K.watches[0].onCopy({ kind: 'copy', text: 'Order #A-1234 可选', length: 16 });
  await until(() => clips().length === 1, 2000); await sleep(40);
  const ca = clips()[0];
  ok(ca && ca.text === 'Order #A-1234 可选' && ca.kind === 'copy' && ca.gesture === 'chord' && !w.W.msgs.some((m) => m.type === 'clipboard'), 'the page\'s copy after the holder\'s Ctrl+C reaches the HOLDER, named `gesture: chord` — the other viewer gets nothing');
  ok(!w.B.logs.some((l) => /A-1234/.test(l)), 'the copied text is never a journal line');
  w.K.watches[0].onCopy({ kind: 'copy', text: 'Order #A-1234 可选', length: 16 }); await sleep(40);
  ok(clips().length === 1, 'the same copy reported twice within the dedup span is one copy');
  w.K.watches[0].onCopy({ kind: 'copy', text: 'HIJACK-2', length: 8 }); await sleep(40);
  ok(clips().length === 1 && w.B.bridge.stats()[0].copiesDropped === 2, 'the chord is SINGLE-USE: a second copy right after it is dropped');
  // a press (the page's own Copy button) arms a delivery the viewer shows as the chip
  w.A.send({ type: 'input_mouse', eventType: 'mousePressed', x: 10, y: 10, button: 'left', clickCount: 1, modifiers: 0, rid: 12 });
  await until(() => w.U.got.some((m) => m.eventType === 'mousePressed'), 2000);
  w.K.watches[0].onCopy({ kind: 'copy', text: 'from the Copy button', length: 20 });
  await until(() => clips().length === 2, 2000); await sleep(40);
  ok(clips().length === 2 && clips()[1].gesture === 'click', 'a copy after the holder\'s press reaches the holder named `gesture: click` (the viewer makes it the chip, never a silent write)');
  // a stale arm: the chord older than COPY_GESTURE_MS
  w.A.send({ type: 'input_keyboard', eventType: 'keyDown', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, modifiers: 2, rid: 13 });
  await until(() => w.U.got.some((m) => m.key === 'x'), 2000); await sleep(T.COPY_GESTURE_MS + 150);
  w.K.watches[0].onCopy({ kind: 'cut', text: 'late cut', length: 8 }); await sleep(40);
  ok(clips().length === 2 && w.B.bridge.stats()[0].copiesDropped === 3, `a copy ${T.COPY_GESTURE_MS} ms after the chord is stale — dropped`);
  w.U.emit({ type: 'tabs', tabs: [{ tabId: 't2', active: true, url: 'https://b.test/', title: 'b', targetId: 'TGT2' }] });
  await until(() => w.K.watches.length === 2, 2000);
  ok(w.K.watches[0].closed && w.K.watches[1].targetId === 'TGT2', 'the watch follows the tab on show (the old one closed)');
  w.A.send({ type: 'handback' }); await until(() => w.A.msgs.some((m) => m.type === 'mode' && m.mode === 'watch'), 2000); await sleep(30);
  ok(w.K.watches[1].closed, 'the handback ends the watch');
  const before = w.A.msgs.filter((m) => m.type === 'clipboard').length; w.K.watches[1].onCopy({ kind: 'copy', text: 'late', length: 4 }); await sleep(40);
  ok(w.A.msgs.filter((m) => m.type === 'clipboard').length === before, 'a copy after the handback is nobody\'s');
  // the claim
  w.A.send({ type: 'fit', width: 1400, height: 900, dpr: 1, visible: true, place: { page: 'pAAAAAA', device: 'dSame01' } });
  w.W.send({ type: 'fit', width: 700, height: 450, dpr: 1, visible: true, place: { page: 'pWWWWWW', device: 'dSame01' } });
  await sleep(40);
  ok(w.B.bridge.stats()[0].input.claim === null, 'no claim until somebody asks');
  w.W.send({ type: 'fit', width: 700, height: 450, dpr: 1, visible: true, claim: true, place: { page: 'pWWWWWW', device: 'dSame01' } });
  await sleep(40);
  ok(w.B.bridge.stats()[0].input.claim === w.W.you, '"Fit here" = a claim held by that view');
  w.W.send({ type: 'fit', width: 700, height: 450, dpr: 1, visible: false, place: { page: 'pWWWWWW', device: 'dSame01' } }); await sleep(40);
  ok(w.B.bridge.stats()[0].input.claim === null, 'hiding ends the claim (the largest window rules again)');
  await w.close();
  // a watch that cannot arm (no CDP endpoint) is said ONCE and left — never re-armed in a storm
  {
    const U2 = await fakeUpstream(); const { k: k2 } = stubKeeper(U2); let arms = 0;
    k2.watchCopiesFor = async (_t, { onEnd }) => { arms++; try { onEnd('error'); } catch { } return { ok: false, error: 'no CDP endpoint for this browser' }; };
    const B2 = await bridgeOn(BS, k2); const A2 = viewer(B2.P); await A2.ready(); await takeover(A2); await sleep(800); // past the 500 ms re-arm delay an ARMED watch would take
    ok(arms === 1 && B2.logs.filter((l) => /copying out of the page is not available/.test(l)).length === 1, `a watch that cannot arm is said once in the journal and not retried (${arms} arm, ${B2.logs.filter((l) => /copying out/.test(l)).length} line)`);
    await A2.close(); await B2.close(); await U2.close();
  }
  // NEGATIVE CONTROL: the copy delivered to every viewer; and no watch armed at all
  const src = read('src/server/browser-stream.js');
  const C3 = '  function armCopyWatch(relay) {';
  ok(src.split(C3).length === 2, 'control setup: the watch arming is found once');
  const nw = await world(M.load('src/server/browser-stream.js', src.replace(C3, C3 + ' return;'), 'no-copy-watch'));
  await takeover(nw.A); await sleep(80);
  ok(nw.K.watches.length === 0, 'NEGATIVE CONTROL: without the arming a copy in the page never leaves it (no watch — the pre-lane view had no path out at all)');
  await nw.close();
  const C4 = '    const g = T.copyDeliverVerdict(relay.copyArm, t);';
  ok(src.split(C4).length === 2, 'control setup: the copy-out door is found once');
  const ng = await world(M.load('src/server/browser-stream.js', src.replace(C4, "    const g = { deliver: true, gesture: 'chord', arm: null };"), 'no-copy-gate'));
  await takeover(ng.A); await until(() => ng.K.watches.length === 1, 2000);
  ng.K.watches[0].onCopy({ kind: 'copy', text: 'HIJACK-3', length: 8 });
  await until(() => ng.A.msgs.some((m) => m.type === 'clipboard'), 2000);
  ok(ng.A.msgs.some((m) => m.type === 'clipboard' && m.text === 'HIJACK-3'), 'NEGATIVE CONTROL: without the door a copy the page fired on its own reaches the holder (the pre-verify bridge — the real-stack hijack)');
  await ng.close();
}
{
  // the fit record names the ruling window's place, with the real fit machinery (a keeper that sets the size)
  const U = await fakeUpstream();
  const { k } = stubKeeper(U);
  const sets = [];
  k.setViewportFor = async (_t, { width, height }) => { sets.push([width, height]); return { ok: true }; };
  k.viewportFor = async () => ({ ok: true, clientWidth: 1280, clientHeight: 577 });
  const B = await bridgeOn(BS, k);
  const A = viewer(B.P), Wv = viewer(B.P); await A.ready(); await Wv.ready();
  U.emit({ type: 'frame', seq: 1, data: Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x41, 0x05, 0x00, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]).toString('base64'), metadata: {} });
  A.send({ type: 'fit', width: 1400, height: 900, dpr: 1, visible: true, place: { page: 'pAAAAAA', device: 'dSame01' } });
  Wv.send({ type: 'fit', width: 700, height: 450, dpr: 1, visible: true, place: { page: 'pWWWWWW', device: 'dSame01' } });
  await until(() => Wv.msgs.some((m) => m.type === 'fit' && m.state === 'fitted' && m.viewerId === A.you), 6000);
  const f1 = Wv.msgs.filter((m) => m.type === 'fit').at(-1);
  ok(f1 && f1.viewerId === A.you && f1.place && f1.place.page === 'pAAAAAA' && FIT.fitChipState({ fit: f1, you: Wv.you, place: { page: 'pWWWWWW', device: 'dSame01' }, pane: { width: 700, height: 450 } }).where === 'this-device', 'the fit record names the ruling window\'s place ⇒ the smaller view\'s chip says "your other tab"', JSON.stringify(f1));
  Wv.send({ type: 'fit', width: 700, height: 450, dpr: 1, visible: true, claim: true, place: { page: 'pWWWWWW', device: 'dSame01' } });
  await until(() => sets.some((s) => s.join() === '700,450'), 4000);
  await until(() => A.msgs.some((m) => m.type === 'fit' && m.state === 'fitted' && m.viewerId === Wv.you), 3000);
  ok(sets.at(-1).join() === '700,450' && A.msgs.filter((m) => m.type === 'fit').at(-1).viewerId === Wv.you, `the click ("Fit here") makes the page follow THAT window: set ${JSON.stringify(sets.at(-1))}, and now the big one's chip says the page follows the other window`);
  await A.close(); await Wv.close(); await B.close(); await U.close();
}

{
  // builder r2 (the reality verifier's A + B, 2026-09-27): THE PAGE SIZE WHILE SOMEBODY DRIVES — (A1) a failed set's command
  // mirror that lands AFTER the CLI returned is still OURS, never "the agent's size"; (A2) a SHARED browser held while
  // somebody drives (`held_while_driving`) is not a failure to remember — the handback re-fits at once; (B) the page is
  // never resized under the driver's held button, and a takeover fits at once (no 250 ms debounce under the first press).
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x41, 0x05, 0x00, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]).toString('base64'); // 1280×577
  const fitWorld = async (BSmod, { setImpl }) => {
    const U = await fakeUpstream(); const { k } = stubKeeper(U);
    const sets = []; const K = { driving: false, sets };
    k.setViewportFor = async (_t, { width, height }) => { const at = Date.now(); sets.push({ w: width, h: height, at }); return setImpl ? setImpl({ width, height, K, U }) : { ok: true }; };
    k.viewportFor = async () => ({ ok: true, clientWidth: 1280, clientHeight: 577 });
    const B = await bridgeOn(BSmod, k);
    const A = viewer(B.P), Wv = viewer(B.P); await A.ready(); await Wv.ready();
    U.emit({ type: 'frame', seq: 1, data: JPEG, metadata: {} });
    const fitOf = () => B.bridge.stats()[0].fit;
    const report = (V, w, h) => V.send({ type: 'fit', width: w, height: h, dpr: 1, visible: true, place: { page: V === A ? 'pAAAAAA' : 'pWWWWWW', device: 'dSame01' } });
    const setTo = (w, h) => until(() => sets.some((s) => s.w === w && s.h === h), 4000);
    return { U, B, A, Wv, K, sets, fitOf, report, setTo, close: async () => { await A.close(); await Wv.close(); await B.close(); await U.close(); } };
  };
  const src = read('src/server/browser-stream.js');
  // (A1) a late mirror of our own failed set
  const lateLeg = async (BSmod) => {
    const w = await fitWorld(BSmod, { setImpl: ({ width, height, U }) => { setTimeout(() => { U.emit({ type: 'command', action: 'viewport', id: 'r-late-1', params: { action: 'viewport', width, height } }); U.emit({ type: 'result', action: 'viewport', id: 'r-late-1', success: false }); }, 40); return { ok: false, code: 'viewport_failed', error: 'CDP error (Emulation.setDeviceMetricsOverride): browser_interrupted: The user took over' }; } });
    w.report(w.A, 1100, 700);
    await until(() => w.sets.length >= 1, 4000); await sleep(200);
    const out = { sets: w.sets.length, agent: w.fitOf().agent, states: w.A.msgs.filter((m) => m.type === 'fit').map((m) => m.state), last: w.A.msgs.filter((m) => m.type === 'fit').at(-1) };
    await w.close(); return out;
  };
  // (A2) a shared browser held while somebody drives
  const heldLeg = async (BSmod) => {
    const w = await fitWorld(BSmod, { setImpl: ({ K }) => (K.driving ? { ok: false, code: 'held_while_driving', error: '"medshop" is a shared browser — its size is kept while it is driven by hand' } : { ok: true }) });
    w.report(w.A, 1400, 900);
    await w.setTo(1400, 900);
    w.K.driving = true; await takeover(w.A);
    w.report(w.A, 1000, 700);
    await w.setTo(1000, 700);
    await until(() => w.A.msgs.some((m) => m.type === 'fit' && m.state === 'unavailable'), 3000);
    const during = w.A.msgs.filter((m) => m.type === 'fit').at(-1);
    const n0 = w.sets.filter((s) => s.w === 1000).length;
    w.K.driving = false; w.A.send({ type: 'handback' });
    await until(() => w.sets.filter((s) => s.w === 1000).length > n0, 600); // the handback's fit runs at once (no debounce) — measured ≤ 5 ms; 600 ms is ample
    await sleep(80);
    const after = w.A.msgs.filter((m) => m.type === 'fit').at(-1);
    const out = { during, after, retried: w.sets.filter((s) => s.w === 1000).length > n0, logs: w.B.logs.slice() };
    await w.close(); return out;
  };
  // (B) never under a held button; the takeover fits at once
  const pressLeg = async (BSmod) => {
    const w = await fitWorld(BSmod, {});
    w.report(w.A, 1400, 900); w.report(w.Wv, 700, 450);
    await w.setTo(1400, 900);
    const tTake = Date.now(); await takeover(w.Wv); // the smaller view drives ⇒ its pane rules
    await w.setTo(700, 450);
    const takeMs = (w.sets.find((s) => s.w === 700) || { at: Infinity }).at - tTake;
    w.Wv.send({ type: 'input_mouse', eventType: 'mousePressed', x: 20, y: 200, button: 'left', clickCount: 1, modifiers: 0 });
    await until(() => w.U.got.some((m) => m.eventType === 'mousePressed'), 2000);
    w.report(w.Wv, 900, 560); // the driver's window changes size MID-DRAG
    await sleep(FIT.FIT_DEBOUNCE_MS + 100); // past the report's debounce: an unheld fit would have run by now
    const duringDrag = w.sets.some((s) => s.w === 900);
    w.Wv.send({ type: 'input_mouse', eventType: 'mouseMoved', x: 200, y: 200, button: 'left', buttons: 1, clickCount: 0, modifiers: 0 });
    await sleep(100);
    const stillHeld = !w.sets.some((s) => s.w === 900);
    const tUp = Date.now(); w.Wv.send({ type: 'input_mouse', eventType: 'mouseReleased', x: 300, y: 200, button: 'left', clickCount: 1, modifiers: 0 });
    await w.setTo(900, 560);
    const upMs = (w.sets.find((s) => s.w === 900) || { at: Infinity }).at - tUp;
    // a release the view could not map (outside the picture) — the next buttonless move lets a held fit go
    w.Wv.send({ type: 'input_mouse', eventType: 'mousePressed', x: 20, y: 200, button: 'left', clickCount: 1, modifiers: 0 });
    await until(() => w.U.got.filter((m) => m.eventType === 'mousePressed').length >= 2, 2000);
    w.report(w.Wv, 800, 500); await sleep(FIT.FIT_DEBOUNCE_MS + 100);
    const heldAgain = !w.sets.some((s) => s.w === 800);
    w.Wv.send({ type: 'input_mouse', eventType: 'mouseMoved', x: 30, y: 30, button: 'none', clickCount: 0, modifiers: 0 });
    const freed = await w.setTo(800, 500);
    const out = { takeMs, duringDrag, stillHeld, upMs, heldAgain, freed };
    await w.close(); return out;
  };
  // the six worlds are independent (each its own fake stream server, bridge and ports) — run at once (the fast tier's budget)
  const CA1 = "      setAsideOwn(fs);\n      // …and a SHARED browser held";
  const CA2 = '      if (!held) fs.failed = { width: v.width, height: v.height, at: now() };';
  const CB1 = "    if (FIT.fitHoldVerdict({ down: relay.btnDown.size, downAt: relay.btnDownAt, now: now(), maxMs: FIT_HOLD_MAX_MS }) === 'hold') {";
  const CB2 = "    if (relay.fits.size) scheduleFit(relay, 'mode', { delay: 0 });";
  ok(src.split(CA1).length === 2, 'control setup: the failure path\'s set-aside is found once');
  ok(src.split(CA2).length === 2, 'control setup: the held-size exemption is found once');
  ok(src.split(CB1).length === 2 && src.split(CB2).length === 2, 'control setup: the hold and the at-once takeover fit are each found once');
  const [a1, a1pre, a2, a2pre, b, bpre] = await Promise.all([
    lateLeg(BS),
    lateLeg(M.load('src/server/browser-stream.js', src.replace(CA1, "      fs.pending = null;\n      // …and a SHARED browser held"), 'late-mirror-agent')),
    heldLeg(BS),
    heldLeg(M.load('src/server/browser-stream.js', src.replace(CA2, '      fs.failed = { width: v.width, height: v.height, at: now() };'), 'held-remembered')),
    pressLeg(BS),
    pressLeg(M.load('src/server/browser-stream.js', src.replace(CB1, '    if (false) {').replace(CB2, "    if (relay.fits.size) scheduleFit(relay, 'mode');"), 'no-button-hold')),
  ]);
  ok(a1.sets >= 1 && !a1.agent && !a1.states.includes('agent') && a1.last && a1.last.state === 'unavailable', `A1: a failed set whose command mirror lands AFTER the CLI returned is still OURS — never "the agent's size" (states ${JSON.stringify(a1.states)})`);
  ok(a1pre.agent && a1pre.states.includes('agent'), `NEGATIVE CONTROL: the pre-fix failure path (pending dropped) reads our own late mirror as the agent's (states ${JSON.stringify(a1pre.states)} — the verifier's "Agent's size 1398×835")`);
  ok(a2.during && a2.during.state === 'unavailable' && a2.during.code === 'held_while_driving', `A2: while somebody drives a shared browser the fit record says \`held_while_driving\` (${JSON.stringify(a2.during && { state: a2.during.state, code: a2.during.code })})`);
  ok(a2.retried && a2.after && a2.after.state === 'fitted' && a2.after.width === 1000, `A2: the handback re-fits AT ONCE — a held size is no failure to remember (after: ${JSON.stringify(a2.after && { state: a2.after.state, w: a2.after.width })})`);
  ok(a2.logs.filter((l) => /keeps its size while the user drives/.test(l)).length === 1 && !a2.logs.some((l) => /could not be sized/.test(l)), 'A2: the journal says it once per takeover, never as a warning');
  ok(!a2pre.retried && a2pre.after && a2pre.after.state === 'unavailable', 'NEGATIVE CONTROL: a held size remembered as a failure keeps the page "could not resize" after the handback (FIT_RETRY_MS — the verifier\'s stuck chip)');
  ok(b.takeMs < FIT.FIT_DEBOUNCE_MS, `B: a takeover fits the driver's window AT ONCE (${b.takeMs} ms — never the ${FIT.FIT_DEBOUNCE_MS} ms debounce that put the resize under the first press)`);
  ok(!b.duringDrag && b.stillHeld, 'B: the driver\'s window changing size while a button is held does NOT resize the page mid-drag');
  ok(b.upMs < 200, `B: …the held resize runs at the release (${b.upMs} ms after it)`);
  ok(b.heldAgain && b.freed, 'B: a release that happened outside the picture (never forwarded) ends the hold at the next buttonless move');
  ok(bpre.duringDrag && bpre.takeMs >= FIT.FIT_DEBOUNCE_MS, `NEGATIVE CONTROL: without the hold the page is resized MID-DRAG, and the takeover's fit waits ${bpre.takeMs} ms (the verifier's y=232 → y=361 jump)`);
  // PURE: the button table
  const st = (recs) => recs.reduce((d, r) => FIT.buttonStep(d, r) || d, new Set());
  ok([...st([{ type: 'input_mouse', eventType: 'mousePressed', button: 'left' }])].join() === 'mouse:left'
    && st([{ type: 'input_mouse', eventType: 'mousePressed', button: 'left' }, { type: 'input_mouse', eventType: 'mouseReleased', button: 'left' }]).size === 0
    && st([{ type: 'input_mouse', eventType: 'mousePressed', button: 'left' }, { type: 'input_mouse', eventType: 'mouseMoved', button: 'left', buttons: 1 }]).size === 1
    && st([{ type: 'input_mouse', eventType: 'mousePressed', button: 'left' }, { type: 'input_mouse', eventType: 'mouseMoved', button: 'none' }]).size === 0
    && st([{ type: 'input_touch', eventType: 'touchStart' }]).has('touch') && st([{ type: 'input_touch', eventType: 'touchStart' }, { type: 'input_touch', eventType: 'touchEnd' }]).size === 0
    && FIT.buttonStep(new Set(), { type: 'input_keyboard', eventType: 'keyDown' }) === null
    && FIT.buttonStep(new Set(), { type: 'input_mouse', eventType: 'mouseWheel' }) === null, 'PURE buttonStep: press / release / a held move / a buttonless move / touch / keys and wheels say nothing');
  ok(FIT.fitHoldVerdict({ down: 1, downAt: 0, now: 100, maxMs: 15000 }) === 'hold' && FIT.fitHoldVerdict({ down: 1, downAt: 0, now: 15000, maxMs: 15000 }) === 'go' && FIT.fitHoldVerdict({ down: 0 }) === 'go', 'PURE fitHoldVerdict: hold while a button is down, never past FIT_HOLD_MAX_MS (a release that never came)');
}

// ═══ §7 THE COPY WATCH over a fake CDP endpoint ═══════════════════════════════
console.log('§7 the copy watch: an isolated world + a per-arm binding over one page socket');
{
  const port = await freePort();
  const srv = http.createServer((q, res) => { if (q.url === '/json/list') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([{ id: 'OTHER', type: 'page', url: 'https://x.test/', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/OTHER` }, { id: 'TGT1', type: 'page', url: 'https://a.test/', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/TGT1` }])); return; } res.statusCode = 404; res.end(); });
  const wss = new WebSocketServer({ server: srv });
  const calls = []; let sock = null; let path0 = '';
  wss.on('connection', (ws, req) => { sock = ws; path0 = req.url; ws.on('message', (d) => { const m = JSON.parse(d); calls.push(m); const result = m.method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'F0' }, childFrames: [{ frame: { id: 'F1' } }] } } : m.method === 'Page.createIsolatedWorld' ? { executionContextId: 70 + calls.length } : m.method === 'Page.addScriptToEvaluateOnNewDocument' ? { identifier: '1' } : {}; ws.send(JSON.stringify({ id: m.id, result })); }); });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const got = [];
  const w = await VP.watchCopies(`ws://127.0.0.1:${port}/devtools/browser/x`, { targetId: 'TGT1', onCopy: (c) => got.push(c), nonce: 'abc123' });
  ok(w.ok && w.targetId === 'TGT1' && path0 === '/devtools/page/TGT1', 'the watch opens the stream\'s ACTIVE tab by its targetId (not the first page)');
  const m = (name) => calls.filter((c) => c.method === name);
  ok(m('Runtime.addBinding').length === 1 && m('Runtime.addBinding')[0].params.name === '__vsCopy_abc123' && m('Runtime.addBinding')[0].params.executionContextName === 'vs-copy-abc123', 'one binding, per arm, exposed ONLY to the isolated world (the page never sees it)');
  const add = m('Page.addScriptToEvaluateOnNewDocument')[0];
  ok(add && add.params.worldName === 'vs-copy-abc123' && add.params.runImmediately === true && /'copy', 'cut'/.test(add.params.source) && /password/.test(add.params.source), 'the script runs in that world on every new document: copy + cut listeners, never a password field');
  ok(m('Page.createIsolatedWorld').length === 2 && m('Runtime.evaluate').every((c) => c.params.contextId >= 70), 'the frames already there get the world too (the main frame and a same-origin one)');
  sock.send(JSON.stringify({ method: 'Runtime.bindingCalled', params: { name: '__vsCopy_abc123', payload: JSON.stringify({ kind: 'copy', text: '订单号 123', length: 6 }) } }));
  sock.send(JSON.stringify({ method: 'Runtime.bindingCalled', params: { name: '__vsCopy_zzz', payload: JSON.stringify({ kind: 'copy', text: 'forged', length: 6 }) } }));
  sock.send(JSON.stringify({ method: 'Runtime.bindingCalled', params: { name: '__vsCopy_abc123', payload: 'not json' } }));
  await until(() => got.length >= 1, 1000); await sleep(30);
  ok(got.length === 1 && got[0].text === '订单号 123', 'the page\'s copy arrives once; another arm\'s binding and a malformed payload are ignored');
  w.close(); wss.close(); srv.close();
}

// ═══ §8 ONE record start at a time ════════════════════════════════════════════
console.log('§8 one `record start` at a time: an agent command\'s attach + the panel\'s record-on at once');
async function recLeg(Rmod) {
  const DATA = path.join(ROOT, 'rec-' + Math.random().toString(36).slice(2, 8)); fs.mkdirSync(DATA, { recursive: true });
  const P1 = 'bp-0000abcd', KEY = 'bk-00000001';
  const prof = { id: P1, label: 'shopping', provider: 'chromium', record: true, host: null, dir: path.join(DATA, 'p') };
  const leaseFns = new Set(); const execs = []; let busy = false; const bc = [];
  const keeper = {
    profile: (id) => (id === P1 ? prof : null), browserOf: () => ({ state: 'ready', pid: 1 }), leasesOn: () => [{ profileId: P1, browserKey: KEY, sessionId: 's1' }],
    onLease: (fn) => { leaseFns.add(fn); return () => leaseFns.delete(fn); }, addDigest: () => () => { }, list: () => ({ profiles: [prof] }),
    _facts: { lastVersion: () => '0.38.1' },
    leaseCliOpts: async () => { await sleep(3); return { session: 'vs-' + KEY, extraEnv: { AGENT_BROWSER_CDP: 'ws://127.0.0.1:1/devtools/browser/x' } }; },
    // the daemon: ONE recording per session — a second start while one runs fails (the owner's journal)
    // the daemon: ONE recording per session — the first start answers after 60 ms, a second one started meanwhile is
    // refused a moment later (the owner's journal: "recording … → …332.webm", then "record start failed … 438.webm")
    _runtime: { exec: async (ns, argv) => { if (argv[0] !== 'record') return { ok: true, json: {} }; execs.push(argv.slice()); const first = !busy; busy = true; await sleep(first ? 60 : 70); return first ? { ok: true, json: { success: true } } : { ok: false, error: `Command failed: agent-browser record start ${argv[2]}\nError: a recording is already in progress` }; } },
  };
  const trace = Rmod.create({ dataDir: DATA, homeDir: DATA, keeper, bridge: { tap: async () => ({ ok: false, code: 'x' }), broadcastTo: () => 0 }, serverSetting: () => true, broadcast: (m) => bc.push(m), log: { log: () => { }, warn: () => { } }, now: Date.now, execFileImpl: (c, a, o, cb) => cb(null, '', ''), sweepEveryMs: 0 });
  trace.install();
  for (const fn of leaseFns) { fn({ kind: 'profile-updated', profileId: P1, changed: { record: { was: false, now: true } } }); fn({ kind: 'attach', browserKey: KEY, profileId: P1, sessionId: 's1' }); }
  const again = await trace.maybeStartRecording(P1, KEY, 's1');
  await sleep(150);
  const d = trace.digest();
  try { trace.shutdown(); } catch { }
  return { execs: execs.length, recording: !!d.recording[P1], refused: d.recordingRefused[P1] || null, again, broadcasts: bc.filter((m) => m.type === 'browser-profiles-updated').length };
}
{
  const r = await recLeg(RT);
  ok(r.execs === 1 && r.recording && !r.refused, `the attach, the record-on fan-out and a third ask at once ⇒ ONE \`record start\` (${r.execs}), recording, NO refusal`, JSON.stringify(r));
  ok(r.again && r.again.ok && r.again.already === true, 'a second ask while the first is starting answers with THAT start (already: true)');
  const src = read('src/server/browser-trace.js');
  const C = '    if (recStarting.has(key)) return recStarting.get(key).then((x) => (x && x.ok ? { ...x, already: true } : x));';
  ok(src.split(C).length === 2, 'control setup: the single flight is found once');
  const G = '      if (!recordings.has(key)) { recordingRefusals.set(profileId, { code, error, at: now() });';
  ok(src.split(G).length === 2, 'control setup: the real-refusal guard is found once');
  const c = await recLeg(M.load('src/server/browser-trace.js', src.replace(C, '').replace(G, '      if (true) { recordingRefusals.set(profileId, { code, error, at: now() });'), 'pre-fix-recording'));
  ok(c.execs >= 2 && c.recording && c.refused && c.refused.code === 'record_failed', `NEGATIVE CONTROL: the pre-fix start (no single flight, a loser's failure always written) — ${c.execs} starts race and the digest carries a refusal BESIDE the live recording (the owner's journal: "record start failed" 106 ms after "recording …")`, JSON.stringify(c));
}

// ═══ §9 WIRING PINS ═══════════════════════════════════════════════════════════
console.log('§9 wiring pins: the client and the keeper\'s journal');
{
  const lw = read('src/lib/browser-live-window.js');
  const pins = [
    [/const r = inputTextRecord\(text\);/, 'a paste / an IME commit is ONE input_text record (inputTextRecord)'],
    [/sendInput\(r\.record, true, \{ receipt: true, receiptMs: textReceiptMs\(r\.chunks\) \}\);/, '…with a receipt that waits as long as its chunks need'],
    [/const k = macChord\(e, \{ viewerMac: viewerIsMac\(\), remoteMac: isMacPlatform\(st\.remotePlatform\) \}\);/, 'every key the page gets passes the Mac chord table (viewer vs the browser\'s OS from the hello)'],
    [/if \(rec && k\.dropText\) delete rec\.text;/, 'a translated chord carries no text'],
    [/const was = st\.pressed\.get\(e\.code \|\| e\.key\);\n\s+if \(was\) \{/, 'a keyup reaches the page only after its keydown did (an IME commit\'s Enter / Space keyup never arrives alone)'],
    [/if \(cc\) armCopyAnswer\(cc\);/, 'a copy / cut chord waits for the page\'s copy (and says when none came)'],
    [/case 'clipboard': onPageCopied\(m\); break;/, 'the bridge\'s clipboard record reaches onPageCopied'],
    [/const how = copyWriteVerdict\(\{ gesture: m\.gesture, chordAge, secure, canWrite: !!\(cb && typeof cb\.writeText === 'function'\), windowMs: GESTURE_WINDOW_MS \}\);/, 'a delivered copy is written by itself ONLY when it answers the user\'s own chord (PURE copyWriteVerdict; a click\'s copy is the chip)'],
    [/if \(how !== 'chip'\) st\.copyAt = 0;/, 'the chord is spent on the copy it answers (single-use on the viewer too)'],
    [/kbd\.addEventListener\('blur', \(\) => \{/, 'the sink takes the focus back after a click elsewhere in the view (an IME needs it at the first key)'],
    [/open: 2, fit: 2, copy: 2, bind: 3/, 'the fit chip and the copy chip fold with the URL (priority 2) — after bind / viewers / recording'],
    [/send\(\{ type: 'fit', [^\n]*claim: claim && vis, place: st\.place \}\);/, 'the pane report carries the claim ("Fit here") and this view\'s place'],
    [/const w = fitChipWords\(c, \{ t \}\);/, 'the fit chip\'s words come from PURE fitChipWords'],
    [/const w = recordingChipWords\(\{ recording: rec, refused, hasProfile: !!pid,/, 'the recording chip\'s words come from PURE recordingChipWords'],
    // builder r2 (the reality verifier's words + A)
    [/else if \(key === 'fit'\) \{ const c = fitChipNow\(\); rows\.push\(c\.act \? \{ label: fitChip\.textContent,/, 'folded into ⋯, the fit row keeps the chip\'s own words (why the page looks small AND what a click does)'],
    [/error: m\.error \|\| null, code: m\.code \|\| null,/, 'the fit record\'s CODE reaches the chip (a shared browser held while somebody drives is worded by it)'],
    [/fitChipState\(\{ fit: st\.fit, you: st\.you, place: st\.place, pane: paneNow\(\), mine: st\.mode === 'takeover' && !!st\.mine \}\)/, 'the chip knows whether THIS view drives'],
    [/renderMode\(\); renderFit\(\); \/\/ builder r2/, 'a mode change re-words the fit chip'],
    [/echo\(true, t\('copied in the page — use the button on the bar to put it on your clipboard'\)/, 'the copy echo points at the button, never a half-quote of it'],
  ];
  for (const [re, name] of pins) ok(re.test(lw), name);
  ok(!/textRecords\(/.test(lw) && !/FIT_WORDS/.test(lw), 'the pre-fix paths are gone (the client never cuts text into char records; the old chip words)');
  ok(!/gestureAt/.test(lw) && !/clipboardDelivery/.test(lw), 'verify: a press stamps NO copy gesture on the client (the pre-verify `gestureAt` / clipboardDelivery path is gone — any click had opened a 5 s window for a page\'s copy)');
  // the negative control: the pre-lane client's paste path (a patched copy of the text) fails the first pin
  const pre = lw.replace('const r = inputTextRecord(text);', 'const r = textRecords(text);');
  ok(!/const r = inputTextRecord\(text\);/.test(pre), 'NEGATIVE CONTROL: the pre-fix paste path (textRecords in the client) is caught by the pin');
  const kp = read('src/server/browser-keeper.js');
  ok(/if \(d\.created \|\| d\.resumed\) log\.log\?\.\(`\[browser\] \$\{browserKey\}/.test(kp) && !/'already holds'/.test(kp), 'the journal says a lease only when the holder CHANGES (never "already holds" on every agent command)');
  ok(/\$\{d\.state\.url \? ' at ' \+ T\.urlForLog\(d\.state\.url\) : ''\}/.test(kp), 'the handback line prints the page\'s origin + path (urlForLog), never its query');
  ok(!/'Fit the page to this window'/.test(lw), 'the folded fit row\'s old words are gone');
  ok(/\.browser-live-bar > \.file-tool-btn\.browser-live-copy \{ color: var\(--accent\); border-color:/.test(read('public/style.css')), 'the copy chip is drawn as a button to press (the accent border of an actionable fit chip)');
  const vh = kp.indexOf("const held = { ok: false, code: 'held_while_driving'"), vx = kp.indexOf('r = await rt.exec(M.mediatedNamespace(p.id, bk), argv');
  ok(vh > 0 && vx > vh && /if \(inputStateFor\(bk, p\.id\)\.input === 'user'\) return held;/.test(kp.slice(vh, vx)), 'the keeper answers `held_while_driving` for a SHARED browser somebody drives BEFORE spawning a CLI the fence would refuse');
  ok(/\.includes\(M\.INTERRUPTED_CODE\)\) return held;/.test(kp), '…and a set the takeover interrupted in flight gets the same verdict');
}

for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 10, label: 'live-input controls: ' })) ok(c.pass, c.name, c.detail);
for (const fn of cleanups) { try { await fn(); } catch { } }
console.log(`\n(${Date.now() - t0} ms)`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
