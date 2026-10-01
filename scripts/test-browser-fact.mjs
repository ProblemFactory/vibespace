#!/usr/bin/env node
// THE BROWSER FACT — ONE answer to "which browser is this conversation using right now" (lane S2, fast).
// Naive-user study 2 (2.369.186, docs: SharedContext/vibespace-naive-study-2.md, T4 / T5 / T7): Session Properties
// said pinned "work", the chip said "tester-b-scratch" then "(ephemeral) Second chat", the live view's tab said
// "ephemeral (no profile)"; a recreated profile left the live view on the old browser behind a red "not attached"
// overlay; typing during a takeover of a SHARED profile reached nothing and nothing said so; a deleted profile left
// conversations pinned to a raw id; the New Session dialog lost a recreated "work".
//   ①  PURE browserFactFor — the table over every combination (pinned / running / neither / mismatch / stale / gone /
//      cleared / several / remote / shared) ⇒ the ONE words (browserFactWords): the line, both names when they
//      differ, never a raw bp-/bk- id on the face, the digest moves with every printed field and never with a clock
//   ②  PURE liveFollowPlan — a view follows its session's browser (a stale target, a moved fact), never a view the
//      user pointed elsewhere, a helper's, one the user drives, or on the first snapshot
//   ③  PURE deletePinnedVerdict + the receipt book (src/browser-stream.js) + the mediator's credit rules
//   ④  the REAL keeper: factFor over its registry, a pinned profile's removal refused `pinned` and, with unpin, every
//      pin cleared WITH the mark the fact reads; the ONE unpin (routes/browser.js) over a live session: its record, its
//      meta, its env re-pointed off the directory, the agent's notice; the boot heal of a dangling pin
//   ⑤  THE MEDIATED TAKEOVER, end to end without a browser: the REAL bridge (src/server/browser-stream.js) → a fake
//      stream server that dispatches like 0.38.1 (ONE Input.* per record — measured) → the REAL mediator (paused: the
//      user drives) → a fake Chrome. The input RECEIPT is the browser's own reply; the user's input passes the paused
//      fence on the bridge's credit. CONTROL (as shipped before S2): no credit ⇒ Chrome never sees the input and the
//      bridge can only say "written" (the study's silent loss); a mediator copy without the credit rule ⇒ the receipt
//      says NOT DELIVERED (never silence)
//   ⑥  THE CENSUS: every surface prints the fact — no surface file reads the raw identity fields (browserProfileId /
//      browserProfileActive / browserLive / browserPinOrigin); the payload publishes `browserFact`; the live facts
//      table gates on its string digest. CONTROL: a patched copy of chat-view.js deriving its own answer is caught.
//   ⑦  B-f7ab: the KEYLESS fact — a live local session with no browser key yet says "no browser yet" (its first
//      browser command gets one), in the payload and in the live view; never "predates the feature"
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const ROOT = scratch('browser-fact');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

const BF = require('../src/browser-fact.js');
const S = require('../src/browser-stream.js');
const M = require('../src/browser-mediation.js');
const KEY = 'bk-0000000a';
const WORK = 'bp-00000001', PERS = 'bp-00000002', SCRATCH = 'bp-00000003', GONE = 'bp-000000ff';
const PROFILES = [{ id: WORK, label: 'work' }, { id: PERS, label: 'Personal' }, { id: SCRATCH, label: 'tester-b-scratch' }];
const W = (f) => BF.browserFactWords(f);
const noRawId = (s) => !/\b(bp|bk)-[0-9a-f]{8}\b/.test(String(s));

// ═══ ① the fact table ═══
console.log('— ① browserFactFor + browserFactWords: every combination ⇒ ONE answer, ONE spelling');
{
  const view = (o = {}) => ({ profiles: PROFILES, pin: null, attachments: [], browsers: {}, own: null, input: null, live: '', now: 1000000, ...o });
  const sess = (o = {}) => ({ browserKey: KEY, pinId: null, pinOrigin: null, active: null, variant: 'D', remote: false, ...o });
  ok(BF.browserFactFor(sess({ browserKey: null }), view()) === null && BF.browserFactWords(null) === null, 'no browser key ⇒ no fact (a session without browser isolation names no browser)');
  const rows = [
    // [name, session, view, expected {kind, id, state, differs, line, amber, show}]
    ['neither: no pin, nothing started', sess(), view(), { kind: 'own', state: 'not-started', differs: null, line: 'no profile (temporary browser)', show: false }],
    ['no pin, its own browser running', sess({ active: '' }), view({ own: { state: 'ready', startedAt: 10 }, live: 'ephemeral' }), { kind: 'own', state: 'running', differs: null, line: 'no profile (temporary browser)', show: true }],
    ['pinned work (rung D), its own browser opened it after the pin', sess({ pinId: WORK, pinOrigin: 'chosen', active: '' }), view({ pin: { profileId: WORK, origin: 'chosen', at: 50 }, own: { state: 'ready', startedAt: 60, lastVerbAt: 70 }, live: 'ephemeral' }), { kind: 'own', id: WORK, state: 'running', differs: null, line: 'work', show: true }],
    ['pinned work while its own browser was already running ⇒ applies from the next command', sess({ pinId: WORK, active: '' }), view({ pin: { profileId: WORK, origin: 'chosen', at: 500 }, own: { state: 'ready', startedAt: 60, lastVerbAt: 70 }, live: 'ephemeral' }), { kind: 'own', differs: 'pin_pending', line: 'pinned work · work applies from the agent’s next browser command' }],
    ['pinned work, its browser could not start — another browser holds the directory (the study\'s SingletonLock)', sess({ pinId: WORK, active: '' }), view({ pin: { profileId: WORK, origin: 'chosen', at: 50 }, own: { state: 'failed', startedAt: 60, lastError: 'the browser did not start: Chrome exited early … Failed to create …/vs-bp-00000001/SingletonLock: File exists (17)' } }), { kind: 'own', state: 'failed', differs: 'pin_failed', line: 'pinned work · running nothing — work could not start — another browser has it open', locked: true }],
    ['pinned work, its browser failed for another reason', sess({ pinId: WORK }), view({ pin: { profileId: WORK, at: 50 }, own: { state: 'failed', lastError: 'the browser did not start: no display' } }), { differs: 'pin_failed', line: 'pinned work · running nothing — work could not start', locked: false }],
    ['pinned work on rung N (the own browser cannot open a directory)', sess({ pinId: WORK, variant: 'N', active: '' }), view({ pin: { profileId: WORK, at: 50 }, own: { state: 'ready', startedAt: 60 }, live: 'ephemeral' }), { kind: 'own', id: null, differs: 'pin_unsupported', line: 'pinned work · running no profile (temporary browser) — this conversation’s browser cannot open a profile — attach it instead' }],
    ['pinned work, the agent attached tester-b-scratch (the study\'s T5)', sess({ pinId: WORK, active: SCRATCH }), view({ pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: SCRATCH, label: 'tester-b-scratch', isDefault: true }], browsers: { [SCRATCH]: { state: 'ready' } }, live: SCRATCH }), { kind: 'profile', id: SCRATCH, differs: 'other_attached', line: 'pinned work · running tester-b-scratch — tester-b-scratch is attached instead' }],
    ['pinned work + attached work & Personal, the agent still on Personal (§3.8 ③)', sess({ pinId: WORK, active: PERS }), view({ pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: WORK, label: 'work', isDefault: true }, { profileId: PERS, label: 'Personal', isDefault: false }], browsers: { [WORK]: { state: 'ready' }, [PERS]: { state: 'ready' } }, live: PERS }), { kind: 'profile', id: PERS, differs: 'agent_elsewhere', line: 'pinned work · running Personal — the agent is still on Personal' }],
    ['…and back on the pin', sess({ pinId: WORK, active: WORK }), view({ pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: WORK, label: 'work', isDefault: true }, { profileId: PERS, label: 'Personal' }], browsers: { [WORK]: { state: 'ready' } }, live: WORK }), { kind: 'profile', id: WORK, differs: null, line: 'work' }],
    ['no pin, the agent attached work (the study\'s A: strip "work (default)" vs menu "pinned: ephemeral")', sess({ active: WORK }), view({ attachments: [{ profileId: WORK, label: 'work', isDefault: true }], browsers: { [WORK]: { state: 'ready' } }, live: WORK }), { kind: 'profile', id: WORK, differs: null, line: 'work', pinned: 'none' }],
    ['the pinned profile no longer exists (a raw id left behind — the study\'s T7)', sess({ pinId: GONE, active: '' }), view({ pin: null, own: { state: 'ready', startedAt: 1 }, live: 'ephemeral' }), { kind: 'own', differs: 'pin_gone', line: 'pinned a deleted profile · running no profile (temporary browser) — the pinned profile was deleted' }],
    ['the pin was cleared because its profile was deleted (fresh mark)', sess({ active: '' }), view({ pin: { profileId: null, at: 999000, cleared: { id: GONE, label: 'work', at: 999000 } } }), { kind: 'own', differs: 'pin_cleared', line: 'work was deleted — its pin was cleared · running nothing' }],
    ['…a mark older than a day is just "no pin"', sess(), view({ pin: { profileId: null, cleared: { id: GONE, label: 'work', at: 1 } }, now: 1 + BF.PIN_CLEARED_MS + 5 }), { kind: 'own', differs: null, line: 'no profile (temporary browser)' }],
    ['several attachments, no default', sess(), view({ attachments: [{ profileId: WORK, label: 'work' }, { profileId: PERS, label: 'Personal' }], browsers: { [WORK]: { state: 'ready' } } }), { kind: 'several', differs: null, line: '2 browsers — the agent names one' }],
    ['a remote session (rung H) — not managed here', sess({ variant: 'H', remote: true }), view(), { kind: 'unmanaged', differs: null, line: 'the browser on its machine' }],
    ['the shared rung (isolation off)', sess({ variant: 'none' }), view(), { kind: 'unmanaged', differs: null, line: 'the machine’s shared browser' }],
    ['a starting own browser', sess({ active: '' }), view({ own: { state: 'starting' } }), { kind: 'own', state: 'starting', differs: null }],
    ['a closed-but-ready profile browser reads not running', sess({ active: WORK }), view({ attachments: [{ profileId: WORK, label: 'work', isDefault: true }], browsers: { [WORK]: { state: 'ready', closed: true } } }), { kind: 'profile', state: 'stopped' }],
  ];
  for (const [name, s, v, want] of rows) {
    const f = BF.browserFactFor(s, v);
    const w = W(f);
    const bad = [];
    if (want.kind !== undefined && f.using.kind !== want.kind) bad.push(`kind ${f.using.kind}`);
    if (want.id !== undefined && f.using.id !== want.id) bad.push(`id ${f.using.id}`);
    if (want.state !== undefined && f.using.state !== want.state) bad.push(`state ${f.using.state}`);
    if (want.differs !== undefined && f.differs !== want.differs) bad.push(`differs ${f.differs}`);
    if (want.line !== undefined && w.line !== want.line) bad.push(`line ${JSON.stringify(w.line)}`);
    if (want.pinned !== undefined && w.pinned !== want.pinned) bad.push(`pinned ${w.pinned}`);
    if (want.show !== undefined && w.show !== want.show) bad.push(`show ${w.show}`);
    if (want.locked !== undefined && f.using.locked !== want.locked) bad.push(`locked ${f.using.locked}`);
    if (!!f.differs !== w.amber) bad.push('amber');
    if (!noRawId(w.line) || !noRawId(w.name)) bad.push('a raw id on the face');
    if (!BF.DIFFERS.concat([null]).includes(f.differs) || !BF.USING_STATES.includes(f.using.state)) bad.push('an undeclared value');
    ok(!bad.length, `① ${name} ⇒ ${JSON.stringify(w.line)}`, bad.join('; ') + ' — ' + JSON.stringify(f));
  }
  // the words' tooltip carries the ids (never the face), the verbatim failure, the pin and the last use
  const failed = BF.browserFactFor(sess({ pinId: WORK }), view({ pin: { profileId: WORK, at: 50 }, own: { state: 'failed', lastError: 'the browser did not start: SingletonLock: File exists' } }));
  const tw = W(failed).tooltip;
  ok(/ids: bp-00000001 · bk-0000000a/.test(tw) && /Why it did not start: the browser did not start: SingletonLock/.test(tw) && /^Using: work — could not start/.test(tw) && /Pinned: work/.test(tw), '① the tooltip carries what the face does not: the failure verbatim, the pin, and the ids', tw);
  // the digest: every printed field moves it, a clock never does
  const base = BF.browserFactFor(sess({ pinId: WORK, active: WORK }), view({ pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: WORK, label: 'work', isDefault: true }], browsers: { [WORK]: { state: 'ready' } }, live: WORK }));
  const renamed = BF.browserFactFor(sess({ pinId: WORK, active: WORK }), view({ profiles: [{ id: WORK, label: 'Work account' }], pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: WORK, label: 'Work account', isDefault: true }], browsers: { [WORK]: { state: 'ready' } }, live: WORK }));
  const stopped = BF.browserFactFor(sess({ pinId: WORK, active: WORK }), view({ pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: WORK, label: 'work', isDefault: true }], browsers: { [WORK]: { state: 'stopped' } }, live: '' }));
  const later = BF.browserFactFor(sess({ pinId: WORK, active: WORK }), view({ pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: WORK, label: 'work', isDefault: true }], browsers: { [WORK]: { state: 'ready' } }, live: WORK, now: 99999999 }));
  const driven = BF.browserFactFor(sess({ pinId: WORK, active: WORK }), view({ pin: { profileId: WORK, at: 50 }, attachments: [{ profileId: WORK, label: 'work', isDefault: true }], browsers: { [WORK]: { state: 'ready' } }, live: WORK, input: 'user' }));
  ok(base.digest !== renamed.digest && base.digest !== stopped.digest && base.digest !== driven.digest && base.digest === later.digest && typeof base.digest === 'string', '① the digest moves with a rename, a stop and a takeover — never with the clock (one dirty signal per real change)');
  ok(BF.sessionFactsOf({ _browserKey: KEY, _browserProfileId: WORK, _browserPinOrigin: 'chosen', _browserProfileActive: '', _browserVariant: 'D', host: null }).active === '' && BF.sessionFactsOf({ _browserKey: KEY }).active === null && BF.sessionFactsOf({ _browserKey: KEY, hostId: 'h1' }).remote === true, '① sessionFactsOf projects the live record (\'\' = its own browser, undefined = never used, a host = remote)');
  // the words for a t() — the keys are what a translation sees (English-string-as-key)
  const seen = []; const tSpy = (s, p) => { seen.push(s); return s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? p[k] : m)); };
  BF.browserFactWords(failed, tSpy);
  ok(seen.includes('pinned {p} · running {r} — {why}') && seen.includes('{p} could not start — another browser has it open') && seen.includes('no profile (temporary browser)'), '① the words go through the caller\'s t() with English keys (the dictionaries translate them)');
}

// ═══ ② liveFollowPlan ═══
console.log('— ② liveFollowPlan: a view follows its session\'s browser');
{
  const U = (kind, id = null, state = 'running') => ({ using: { kind, id, state } });
  const cases = [
    ['a view on the recreated profile\'s OLD id, refused not_attached (the study\'s red overlay)', { view: { ref: WORK, shown: WORK, errorCode: 'not_attached' }, prev: null, next: U('profile', PERS) }, 'retarget', PERS],
    ['a view that asked for the session\'s default follows a moved fact', { view: { ref: '', shown: S.EPHEMERAL_REF }, prev: U('own'), next: U('profile', WORK) }, 'retarget', WORK],
    ['a view showing the browser the fact named before follows it', { view: { ref: WORK, shown: WORK }, prev: U('profile', WORK), next: U('profile', PERS) }, 'retarget', PERS],
    ['a view the user pointed at another browser that still exists stays', { view: { ref: SCRATCH, shown: SCRATCH }, prev: U('own'), next: U('profile', WORK) }, 'none'],
    ['a helper\'s view never follows its parent', { view: { ref: KEY + '.1', shown: KEY + '.1' }, prev: U('own'), next: U('profile', WORK) }, 'none'],
    ['a view the user DRIVES is never moved', { view: { ref: WORK, shown: WORK, driving: true }, prev: U('profile', WORK), next: U('profile', PERS) }, 'none'],
    ['the first fact is a snapshot, not a move', { view: { ref: '', shown: S.EPHEMERAL_REF }, prev: null, next: U('profile', WORK) }, 'none'],
    ['a following view already on the browser, its last word an error, reconnects when it runs', { view: { ref: WORK, shown: WORK, errorCode: 'browser_stopped' }, prev: U('profile', WORK, 'stopped'), next: U('profile', WORK) }, 'reconnect'],
    ['…but not while it is still stopped', { view: { ref: WORK, shown: WORK, errorCode: 'browser_stopped' }, prev: U('profile', WORK, 'running'), next: U('profile', WORK, 'stopped') }, 'none'],
    ['Reconnect on a stale target re-resolves it (force)', { view: { ref: WORK, shown: WORK, errorCode: 'not_attached' }, prev: U('profile', PERS), next: U('profile', PERS), force: true }, 'retarget', PERS],
    ['Reconnect on a live target reconnects', { view: { ref: WORK, shown: WORK, errorCode: 'upstream-closed' }, prev: U('profile', WORK), next: U('profile', WORK), force: true }, 'reconnect'],
    ['an ended session never moves', { view: { ref: '', shown: WORK, sessionEnded: true }, prev: U('profile', WORK), next: U('profile', PERS) }, 'none'],
    ['several attachments: nothing single to follow', { view: { ref: '', shown: WORK }, prev: U('profile', WORK), next: U('several') }, 'none'],
  ];
  for (const [name, args, act, ref] of cases) {
    const p = BF.liveFollowPlan(args);
    ok(p.act === act && (ref === undefined || p.ref === ref), `② ${name} ⇒ ${p.act}${p.ref !== undefined ? ' ' + p.ref : ''}`, JSON.stringify(p));
  }
}

// ═══ ③ the delete verdict, the receipt book, the mediator's credit rules ═══
console.log('— ③ deletePinnedVerdict · the receipt book · the credit rules');
{
  const v0 = BF.deletePinnedVerdict({ label: 'work', pinnedBy: [] });
  const v1 = BF.deletePinnedVerdict({ label: 'work', pinnedBy: [{ browserKey: KEY, name: 'Second chat' }, { browserKey: 'bk-0000000b', name: 'Lark test' }, { browserKey: KEY, name: 'Second chat' }] });
  const v2 = BF.deletePinnedVerdict({ label: 'work', pinnedBy: [{ browserKey: KEY }], unpin: true });
  ok(v0.ok && !v1.ok && v1.code === 'pinned' && v1.count === 2 && /2 conversations use "work" as their pin — unpin them first/.test(v1.error) && v2.ok && v2.unpin.length === 1, '③ a pinned profile is refused `pinned` with the count (keys, not rows) and the names; with unpin it proceeds', JSON.stringify(v1));
  const b = S.receiptBook();
  const r1 = S.noteInputSent(b, 1000), r2 = S.noteInputSent(b, 1001), r3 = S.noteInputSent(b, 1002);
  S.noteInputReceipt(b, { rid: r1, ok: true });
  ok(b.delivered === 1 && b.failing === null && b.pending.size === 2, '③ a receipt settles its record (delivered)');
  S.noteInputReceipt(b, { rid: r2, ok: false, code: 'browser_refused', error: 'x' });
  ok(b.failing && b.failing.code === 'browser_refused' && b.failed === 1, '③ a failed receipt makes the book FAILING (the bar says "not delivered")');
  ok(S.sweepInputReceipts(b, 1002 + S.INPUT_RECEIPT_MS - 1) === 0 && S.sweepInputReceipts(b, 1002 + S.INPUT_RECEIPT_MS + 1) === 1 && b.failing.code === 'no_answer' && b.pending.size === 0, `③ a record with no receipt in ${S.INPUT_RECEIPT_MS} ms is NOT DELIVERED (no_answer)`);
  ok(!S.noteInputReceipt(b, { rid: r3, ok: true }) && b.failing.code === 'no_answer', '③ a late / duplicate receipt changes nothing');
  const r4 = S.noteInputSent(b, 5000); S.noteInputReceipt(b, { rid: r4, ok: true });
  ok(b.failing === null, '③ the next delivered input clears FAILING');
  ok(JSON.stringify(S.withoutRid({ type: 'input_mouse', x: 1, rid: 7 })) === '{"type":"input_mouse","x":1}' && S.withoutRid({ type: 'x' }).type === 'x', '③ the rid never reaches the stream server');
  // (VERIFY S2: a credit is BOUND to its record's call — without a matching Input.* nothing is spent; expired ones still leave and are told)
  const q = [{ at: 100 }, { at: 900 }, { at: 1000 }];
  const t1 = M.takeCredit(q, 100 + M.INPUT_CREDIT_MS + 50);
  ok(t1.expired.length === 1 && t1.credit === null && q.length === 2, '③ an expired credit leaves (its waiter is told); a live one is spent only by the Input.* it was minted for');
  ok(M.takeCredit([], 0).credit === null && M.isInputMethod('Input.dispatchKeyEvent') && !M.isInputMethod('Page.reload'), '③ only Input.* spends a credit');
  // VERIFY S2 (2026-09-26): a credit is BOUND to the CDP call its record becomes — the fields 0.38.1 relays verbatim (measured)
  {
    const click = { type: 'input_mouse', eventType: 'mousePressed', x: 10, y: 20, button: 'left', clickCount: 1, modifiers: 0 };
    const key = { type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 0, text: 'a' };
    const touch = { type: 'input_touch', eventType: 'touchStart', touchPoints: [{ x: 60, y: 70 }] };
    const ec = M.creditExpectation(click), ek = M.creditExpectation(key), et = M.creditExpectation(touch);
    ok(ec && ec.method === 'Input.dispatchMouseEvent' && ec.params.type === 'mousePressed' && ec.params.x === 10 && ec.params.button === 'left' && ek.method === 'Input.dispatchKeyEvent' && ek.params.text === 'a' && ek.params.windowsVirtualKeyCode === 65 && et.method === 'Input.dispatchTouchEvent' && et.params.touchPoints.length === 1, '③ creditExpectation = the CDP call the record becomes (method by kind, params.type = eventType, the fields the record carries)');
    ok(M.creditExpectation({ type: 'config', maxFps: 5 }) === null && M.creditExpectation(null) === null && M.creditExpectation({ type: 'input_mouse' }) === null, '③ a record that becomes no Input.* call has no expectation (not creditable)');
    const asRelayed = (m) => ({ id: 1, method: m.method, params: { deltaX: 0, deltaY: 0, ...m.params } }); // the stream server's defaults ride along
    ok(M.creditMatches(ec, asRelayed(ec)) && M.creditMatches(ek, { method: 'Input.dispatchKeyEvent', params: { ...ek.params } }) && M.creditMatches(et, { method: 'Input.dispatchTouchEvent', params: { modifiers: 0, ...et.params } }), '③ the relayed call matches its record (extra default params tolerated)');
    ok(!M.creditMatches(ec, { method: 'Input.dispatchMouseEvent', params: { ...ec.params, x: 999 } }) && !M.creditMatches(ec, { method: 'Input.dispatchKeyEvent', params: ec.params }) && !M.creditMatches(ec, { method: 'Input.insertText', params: { text: 'x' } }) && !M.creditMatches(ek, { method: 'Input.dispatchKeyEvent', params: { ...ek.params, text: 'b', key: 'b' } }) && !M.creditMatches(ek, { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown' } }) && !M.creditMatches(null, asRelayed(ec)), '③ a different point, key, method, a bare type, or no expectation at all never matches');
    // verify r2 (2026-09-26): the credit is bound to the TAB the user is looking at too — an Input.* spends it only on a
    // PAGE session the lease was handed whose target IS that tab (measured 0.38.1: every dispatch rides a page sessionId)
    const scope = (s) => ({ S1: 'T1', S2: 'T2', SB: null })[s]; // the lease's sessions: S1 on tab T1, S2 on T2, SB = the browser session
    const on = (sid, method, params) => ({ id: 1, sessionId: sid, method, params });
    const ekT = M.creditExpectation(key, { targetId: 'T1' }), ecT = M.creditExpectation(click, { targetId: 'T1' });
    ok(ekT.targetId === 'T1' && M.creditExpectation(key).targetId === null && M.creditExpectation(key, { targetId: '' }).targetId === null, '③ r2: the expectation names the tab the user is looking at (null when the stream did not name it)');
    ok(M.creditSessionOk(ekT, 'S1', 'T1') && !M.creditSessionOk(ekT, 'S2', 'T2') && !M.creditSessionOk(ekT, 'S9', undefined) && !M.creditSessionOk(ekT, 'SB', null) && !M.creditSessionOk(ekT, null, 'T1') && M.creditSessionOk(M.creditExpectation(key), 'S2', 'T2') && !M.creditSessionOk(M.creditExpectation(key), 'S9', undefined), '③ r2: a page session of the lease on the credit\'s tab spends it; another tab, an unhanded session, the browser session, no session never do; a credit naming no tab takes any handed page session');
    const q = [{ at: 0, expect: ecT }, { at: 0, expect: ekT }];
    const t1 = M.takeCredit(q, 10, { msg: on('S1', 'Input.dispatchKeyEvent', ek.params), sessionTarget: scope });
    ok(t1.credit && t1.credit.expect === ekT && q.length === 1 && q[0].expect === ecT, '③ takeCredit spends the MATCHING credit, not the head');
    const t2 = M.takeCredit(q, 10, { msg: on('S1', 'Input.dispatchMouseEvent', { ...ec.params, x: 999 }), sessionTarget: scope });
    ok(t2.credit === null && q.length === 1, '③ an Input.* matching no credit takes none (the agent\'s own click burns nothing)');
    const t3 = M.takeCredit([{ at: 0, expect: ecT }, { at: 5000, expect: ekT }], 5000, { msg: on('S1', 'Input.dispatchKeyEvent', ek.params), sessionTarget: scope });
    ok(t3.expired.length === 1 && t3.expired[0].expect === ecT && t3.credit && t3.credit.expect === ekT, '③ an expired credit leaves wherever it sits and its waiter is told');
    const q2 = [{ at: 0, expect: ekT }];
    const miss = [on('S2', 'Input.dispatchKeyEvent', ek.params), on('S9', 'Input.dispatchKeyEvent', ek.params), on('SB', 'Input.dispatchKeyEvent', ek.params), { id: 1, method: 'Input.dispatchKeyEvent', params: ek.params }].map((m) => M.takeCredit(q2, 10, { msg: m, sessionTarget: scope }).credit);
    ok(miss.every((c) => c === null) && q2.length === 1, '③ r2: the exact key on ANOTHER tab of the lease, on a session never handed out, on the browser session, or with no session spends nothing (the agent\'s mirror burns nothing)');
    ok(M.takeCredit(q2, 10, { msg: on('S1', 'Input.dispatchKeyEvent', ek.params) }).credit === null && q2.length === 1 && M.takeCredit(q2, 10, { msg: on('S1', 'Input.dispatchKeyEvent', ek.params), sessionTarget: () => { throw new Error('x'); } }).credit === null, '③ r2: FAIL CLOSED — no session→tab reader (or one that throws) spends nothing');
    ok(M.takeCredit(q2, 10, { msg: on('S1', 'Input.dispatchKeyEvent', ek.params), sessionTarget: scope }).credit && q2.length === 0, '③ r2: …and the same key on the user\'s own tab spends it');
    const q3 = [{ at: 0, expect: M.creditExpectation(key) }];
    ok(M.takeCredit(q3, 10, { msg: on('S2', 'Input.dispatchKeyEvent', ek.params), sessionTarget: scope }).credit && M.takeCredit([{ at: 0, expect: M.creditExpectation(key) }], 10, { msg: on('S9', 'Input.dispatchKeyEvent', ek.params), sessionTarget: scope }).credit === null, '③ r2: a credit that names no tab (a stream server whose tabs carry no targetId) takes any handed page session, never an unhanded one');
  }
  // VERIFY r3 (2026-09-26): a matching call on ANOTHER tab MARKS the credit (never burns it); an expired credit says what was seen
  {
    const key = { type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 0, text: 'a' };
    const click = { type: 'input_mouse', eventType: 'mousePressed', x: 10, y: 20, button: 'left', clickCount: 1, modifiers: 0 };
    const scope = (s) => ({ S1: 'T1', S2: 'T2', SB: null })[s];
    const on = (sid, method, params) => ({ id: 1, sessionId: sid, method, params });
    const ek = M.creditExpectation(key), ekT = M.creditExpectation(key, { targetId: 'T1' }), ec = M.creditExpectation(click);
    const q4 = [{ at: 0, expect: ekT }];
    const t = M.takeCredit(q4, 10, { msg: on('S2', 'Input.dispatchKeyEvent', ek.params), sessionTarget: scope });
    ok(t.credit === null && Array.isArray(t.otherTab) && t.otherTab.length === 1 && t.otherTab[0] === q4[0] && q4.length === 1, '③ r3: the exact key on ANOTHER tab spends nothing and is reported as otherTab — the mediator MARKS it, the queue keeps it');
    ok(M.takeCredit(q4, 10, { msg: on('S1', 'Input.dispatchKeyEvent', ek.params), sessionTarget: scope }).credit === t.otherTab[0] && q4.length === 0, '③ r3: …and the user\'s own dispatch on their tab still spends the marked credit (a hostile mirror never costs the user their key)');
    ok(M.takeCredit([{ at: 0, expect: ekT }], 10, { msg: on('S1', 'Input.dispatchMouseEvent', { ...ec.params, x: 999 }), sessionTarget: scope }).otherTab.length === 0 && M.takeCredit([], 10).otherTab.length === 0, '③ r3: a call matching no credit marks nothing');
    ok(M.creditExpiryReceipt({ otherTab: true }).code === 'other_tab' && M.creditExpiryReceipt({ spent: true }).code === 'no_reply' && M.creditExpiryReceipt({ spent: true, otherTab: true }).code === 'no_reply' && M.creditExpiryReceipt({}).code === 'not_dispatched' && M.creditExpiryReceipt(null).code === 'not_dispatched', '③ r3: an expired credit says what was seen — no_reply (spent, the browser never answered: a hidden tab), other_tab (a matching call refused on another tab), else not_dispatched');
  }
  // VERIFY r3: the receipt book remembers what the last delivered receipt PROVED (via) — the bar's words follow it (r2 F3)
  { const b2 = S.receiptBook();
    ok(b2.via === null, '③ r3: a fresh book proved nothing yet');
    const x = S.noteInputSent(b2, 1); S.noteInputReceipt(b2, { rid: x, ok: true, via: 'stream' }); ok(b2.via === 'stream', '③ r3: a delivered receipt via the stream (a direct lease) is remembered as "sent"');
    const y = S.noteInputSent(b2, 2); S.noteInputReceipt(b2, { rid: y, ok: true, via: 'browser' }); ok(b2.via === 'browser', '③ r3: …via the browser (a mediated lease) as "goes"');
    const z = S.noteInputSent(b2, 3); S.noteInputReceipt(b2, { rid: z, ok: false, code: 'other_tab' }); ok(b2.via === 'browser' && b2.failing.code === 'other_tab', '③ r3: a failed receipt leaves the proof and sets failing');
    const w = S.noteInputSent(b2, 4); S.noteInputReceipt(b2, { rid: w, ok: true, via: 'bogus' }); ok(b2.via === null, '③ r3: an unknown via proves nothing'); }
  // VERIFY r3: a takeover is ANCHORED to the tab it began on (the bridge refuses an agent's switch; PURE takeoverAnchorStep)
  { const a0 = S.takeoverAnchor('T1', 1000);
    ok(a0.target === 'T1' && a0.at === 1000 && a0.switched === null && S.takeoverAnchor(null, 5).target === null && S.takeoverAnchor('', 5).target === null, '③ r3: the anchor is the tab on show at the takeover (none when the stream named none yet)');
    const g1 = S.takeoverAnchorStep(a0, { activeTarget: 'T2', now: 1000 + S.TAKEOVER_ANCHOR_GRACE_MS });
    ok(g1.target === 'T2' && g1.switched === null && g1.at === 1000, `③ r3: a tabs record within the first ${S.TAKEOVER_ANCHOR_GRACE_MS} ms re-anchors silently (the in-flight switch that raced the takeover — measured: the daemon's tabs record lands 11–45 ms after its switch, ahead of its first dispatch)`);
    const sw = S.takeoverAnchorStep(a0, { activeTarget: 'T2', now: 1000 + S.TAKEOVER_ANCHOR_GRACE_MS + 1 });
    ok(sw.target === 'T1' && sw.switched && sw.switched.from === 'T1' && sw.switched.to === 'T2' && sw.switched.at === 1000 + S.TAKEOVER_ANCHOR_GRACE_MS + 1, '③ r3: a tabs record naming another tab after that marks the takeover SWITCHED (from → to)');
    ok(S.takeoverAnchorStep(sw, { activeTarget: 'T1', now: 3000 }).switched === null && S.takeoverAnchorStep(sw, { activeTarget: null, now: 3000 }) === sw && S.takeoverAnchorStep(sw, { activeTarget: 'T3', now: 3000 }).switched.to === 'T3' && S.takeoverAnchorStep(a0, { activeTarget: 'T1', now: 9000 }) === a0, '③ r3: the anchor\'s own tab coming back clears the mark; a record naming no tab judges nothing; a further switch re-names the destination; the same tab changes nothing');
    ok(S.takeoverAnchorStep(S.takeoverAnchor(null, 1), { activeTarget: 'T9', now: 9000 }).target === 'T9' && S.takeoverAnchorStep(null, { activeTarget: 'T9', now: 1 }) === null && S.takeoverAnchorStep('x', { activeTarget: 'T9', now: 1 }) === null, '③ r3: an anchor with no tab yet adopts the first named one (a takeover already on when the relay is born); no anchor stays none');
    // VERIFY r4 (2026-09-27): THE GRACE IS A MEASURED CONSTANT — 3 × the p99 of the CLI-to-`tabs`-record latency (scripts/measure-anchor-grace.mjs,
    // 2 × 100 real switches on 0.38.1 + Chrome 153.0.8010.47: p99 15.37 / 20.37 ms), never a round second (r3 F6: a whole second in which a switch was followed)
    ok(S.TABS_RECORD_LATENCY_P99_MS >= 20.37 && S.TAKEOVER_ANCHOR_GRACE_MS === Math.ceil(3 * S.TABS_RECORD_LATENCY_P99_MS) && S.TAKEOVER_ANCHOR_GRACE_MS <= 100, `③ r4: the grace is 3 × the measured p99 (${S.TABS_RECORD_LATENCY_P99_MS} ms ⇒ ${S.TAKEOVER_ANCHOR_GRACE_MS} ms), at most 100 ms — lowering the p99 or growing the grace needs a new measurement`);
    ok(S.takeoverAnchorStep(a0, { activeTarget: 'T2', now: 1000 + 63 }).switched !== null && S.takeoverAnchorStep(a0, { activeTarget: 'T2', now: 1000 + 62 }).switched === null, '③ r4: a record 63 ms into the takeover is a switch (refused); at 62 ms it is the in-flight one (followed)');
    const rc = S.tabSwitchedReceipt(sw);
    ok(rc.ok === false && rc.code === 'tab_switched' && rc.from === 'T1' && rc.to === 'T2' && /hand back and take over again/.test(rc.error) && S.tabSwitchedReceipt(null).code === 'tab_switched', '③ r3: the receipt names the switch and the way out'); }
  // VERIFY S2: an attachment whose profile record is gone (a lease outliving its record) never puts its raw id on the face
  { const f = BF.browserFactFor({ browserKey: KEY, pinId: null, pinOrigin: null, active: 'bp-0000gone', variant: 'D', remote: false }, { profiles: [], pin: null, attachments: [{ profileId: 'bp-0000gone', alias: 'x', label: '', isDefault: true }], browsers: {}, own: null, input: null, live: '', now: 1 });
    ok(f.using.id === 'bp-0000gone' && f.using.label === null && W(f).line === 'a profile' && noRawId(W(f).line), '③ an attachment with no record left: the face says "a profile", the id only in the tooltip', JSON.stringify({ line: W(f).line, tip: W(f).tooltip })); }
  ok(M.creditReceipt({ id: 1, result: {} }).ok && M.creditReceipt({ id: 1, error: { message: 'boom' } }).code === 'browser_refused' && M.creditReceipt(null).code === 'no_reply', '③ the receipt is the browser\'s own reply');
}

// ═══ ④ the REAL keeper + the ONE unpin ═══
console.log('— ④ the REAL keeper: factFor, the pinned delete, the unpin, the boot heal');
{
  const K = require('../src/server/browser-keeper.js');
  const DATA = path.join(ROOT, 'data'), HOME = path.join(ROOT, 'home');
  fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
  const changes = [];
  const k = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: '/nonexistent', HOME }), log: { log() { }, warn() { }, error() { } }, tickMs: 3600e3, install: false });
  k.onChange(() => changes.push(Date.now()));
  const work = k.createProfile({ label: 'work' }, { owner: { kind: 'instance', id: null } });
  const pers = k.createProfile({ label: 'Personal' }, { owner: { kind: 'instance', id: null } });
  ok(changes.length >= 2, '④ every registry commit fans out to onChange (the fact re-publish hook)');
  k.setPin(KEY, work.id, { origin: 'chosen' });
  const s1 = { _browserKey: KEY, _browserProfileId: work.id, _browserPinOrigin: 'chosen', _browserVariant: 'D', webuiName: 'Second chat' };
  const f1 = k.factFor(BF.sessionFactsOf(s1));
  ok(f1 && f1.pinned && f1.pinned.label === 'work' && f1.using.kind === 'own' && f1.using.label === 'work' && W(f1).line === 'work', '④ factFor over the real registry: pinned work, its own browser opens it, the line is "work"', JSON.stringify(f1));
  ok(k.pinnedBy(work.id).length === 1 && k.pinnedBy(pers.id).length === 0, '④ pinnedBy names the conversation pinning a profile');
  let threw = null; try { k.removeProfile(work.id); } catch (e) { threw = e; }
  ok(threw && threw.code === 'pinned' && threw.pinnedCount === 1 && k.profile(work.id), '④ removing a PINNED profile is refused `pinned` (the record stays)', threw && threw.message);
  // the ONE unpin over a live session, through the routes module (the pin route's own path)
  const R = require('../src/routes/browser.js');
  const persisted = [], notices = [], repoints = [];
  const active = new Map([['sess-1', s1]]);
  R.setup({ keeper: k, activeSessions: active, persistPin: (s, id, o) => persisted.push({ id, o }), notice: (sid, s, n) => notices.push(n), browserEnv: () => ({ repointPin: (bk, dir) => { repoints.push({ bk, dir }); return { ok: true }; } }) });
  const g = R.pinGuardFor(work.id, false);
  ok(g && g.code === 'pinned' && g.count === 1 && g.names.includes('Second chat'), '④ the route\'s guard counts the conversation and names it', JSON.stringify(g));
  const u = R.unpinProfile(work.id);
  ok(u.cleared === 1 && u.sessions[0] === 'sess-1' && s1._browserProfileId === null && s1._browserPinOrigin === 'harness', '④ unpin: the live session\'s own record is cleared', JSON.stringify({ u, pin: s1._browserProfileId }));
  // integration 2.369.192: under owner ruling A a live conversation's env never names a profile's directory (a pin is a
  // default ATTACHMENT), so the unpin re-points nothing ONTO a directory — any re-point there is is OFF one (dir null)
  ok(persisted.some((p) => p.id === null) && repoints.every((r) => r.dir === null) && notices.some((n) => n.kind === 'browser-pin' && n.was === 'work'), '④ …its meta is persisted, its env never left on a directory (never an empty profile recreated at the old path), the agent is told "work → none"', JSON.stringify({ persisted, repoints, notices }));
  const rm = k.removeProfile(work.id, { unpin: true });
  const f2 = k.factFor(BF.sessionFactsOf(s1));
  ok(rm.removed === work.id && !k.profile(work.id) && f2.differs === 'pin_cleared' && W(f2).line === 'work was deleted — its pin was cleared · running nothing' && noRawId(W(f2).line), '④ the profile goes; the conversation\'s fact says "work was deleted — its pin was cleared" (no raw id, no dangling pin)', JSON.stringify(f2));
  // a stopped conversation's pin (no live session) is cleared in the keeper with the same mark
  const KEY_B = 'bk-0000000b';
  k.setPin(KEY_B, pers.id, { origin: 'chosen' });
  R.unpinProfile(pers.id);
  const markB = k._reg().pins[KEY_B];
  ok(markB && markB.profileId === null && markB.cleared && markB.cleared.label === 'Personal' && repoints.some((r) => r.bk === KEY_B && r.dir === null), '④ a stopped conversation\'s pin: cleared in the keeper (with its mark) and its env re-pointed');
  // the boot heal: a live session whose pin names a profile that is gone
  const s2 = { _browserKey: 'bk-0000000c', _browserProfileId: 'bp-0000dead', _browserPinOrigin: 'chosen', _browserVariant: 'D', webuiName: 'Old chat' };
  active.set('sess-2', s2);
  const before = k.factFor(BF.sessionFactsOf(s2));
  const n = R.healDanglingPins();
  const after = k.factFor(BF.sessionFactsOf(s2));
  ok(before.differs === 'pin_gone' && n === 1 && s2._browserProfileId === null && after.differs === 'pin_cleared' && W(after).line === 'a deleted profile was deleted — its pin was cleared · running nothing', '④ the boot heal: a dangling pin (pin_gone) is cleared, the fact says so — no raw id', JSON.stringify({ before: W(before).line, after: W(after).line }));
  // the keeper's view: the own browser's last verb is stamped (pin_pending ends at the agent's next command)
  ok(typeof k.factView === 'function' && k.factView(KEY).pin && k.factView(KEY).now > 0, '④ factView is the one registry read the fact is computed over');
  // THE DELETE ROUTE over the real router: leased first (no unpin for a removal that cannot happen), then pinned, then unpin
  {
    const express = require('express');
    const app = express(); app.use(express.json()); app.use(R.router);
    const P = await freePort(); const srv = app.listen(P, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
    const call = async (method, url, body) => { const res = await fetch(`http://127.0.0.1:${P}${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
    const team = k.createProfile({ label: 'Team' }, { owner: { kind: 'instance', id: null } });
    const s3 = { _browserKey: 'bk-0000000d', _browserProfileId: team.id, _browserPinOrigin: 'chosen', _browserVariant: 'D', webuiName: 'Third chat' };
    active.set('sess-3', s3); k.setPin('bk-0000000d', team.id, { origin: 'chosen' });
    k._reg().leases.push({ profileId: team.id, browserKey: 'bk-0000000e', sessionId: 'x', since: 1, input: 'agent', viewers: 0 }); // another conversation attached it
    const r0 = await call('DELETE', `/api/browser/profiles/${team.id}?unpin=1`);
    ok(r0.status === 409 && r0.json.code === 'leased' && s3._browserProfileId === team.id && k.pinnedBy(team.id).length === 1, '④ DELETE of a LEASED + pinned profile: refused `leased` FIRST — the pin is untouched (never an unpin for a removal that cannot happen)', JSON.stringify(r0));
    k._reg().leases = k._reg().leases.filter((l) => l.profileId !== team.id);
    const r1 = await call('DELETE', `/api/browser/profiles/${team.id}`);
    ok(r1.status === 409 && r1.json.code === 'pinned' && r1.json.count === 1 && r1.json.names.includes('Third chat'), '④ DELETE without unpin: 409 `pinned` with the count and the name (the UI\'s question)', JSON.stringify(r1));
    const r2 = await call('DELETE', `/api/browser/profiles/${team.id}?unpin=1`);
    ok(r2.status === 200 && r2.json.removed === team.id && r2.json.unpinned === 1 && s3._browserProfileId === null && W(k.factFor(BF.sessionFactsOf(s3))).line === 'Team was deleted — its pin was cleared · running nothing', '④ DELETE ?unpin=1: removed, 1 pin cleared, the conversation\'s fact says so', JSON.stringify(r2));
    await new Promise((r) => srv.close(() => r()));
  }
  k.shutdown();
}

// ═══ ⑤ the mediated takeover end to end: bridge → stream server → mediator → Chrome ═══
console.log('— ⑤ the mediated takeover: every input has a receipt; the user\'s own input passes the paused fence on a credit');
{
  const MED = require('../src/server/cdp-mediator.js');
  const BS = require('../src/server/browser-stream.js');
  const chromeSaw = []; let chromeMode = 'ok';
  const chromePort = await freePort();
  const chrome = new WebSocketServer({ port: chromePort, host: '127.0.0.1' });
  await new Promise((r) => chrome.on('listening', r));
  chrome.on('connection', (ws) => ws.on('message', (d) => { const m = JSON.parse(d); chromeSaw.push(m.method); if (chromeMode === 'silent' && /^Input\./.test(m.method)) return; ws.send(JSON.stringify(chromeMode === 'ok' ? { id: m.id, result: m.method === 'Target.attachToTarget' ? { sessionId: 'S-' + (m.params && m.params.targetId) } : {} } : { id: m.id, error: { code: -32000, message: 'Input dispatch failed' } })); })); // verify r2: a session per attach, as Chrome
  const upstreamUrl = `ws://127.0.0.1:${chromePort}/devtools/browser/fake`;
  // a fake 0.38.1 stream server: status + tabs + frames on connect; each viewer input record ⇒ ONE Input.* call on the
  // daemon's CDP connection (the MEDIATED url) — measured 1:1 on the real binary (6 of 6 kinds); it answers nothing back
  const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
  const mkWorld = async (MEDmod, { credit = true, BSmod = BS } = {}) => {
    const med = MEDmod.create({ log: { log() { }, warn() { } } }); await med.listen();
    const grant = await med.grantFor({ profileId: WORK, browserKey: KEY, upstream: upstreamUrl, targetIds: ['T1', 'T2'], paused: () => true }); // the user drives; the lease's tabs T1 (the one they look at) and T2 (the agent's other tab)
    const cdp = new WebSocket(grant.url); await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    const cdpReplies = []; cdp.on('message', (d) => cdpReplies.push(JSON.parse(d)));
    // verify r2: the daemon holds a PAGE session on T1 and dispatches on it (measured 0.38.1: every Input.* rides a page sessionId)
    cdp.send(JSON.stringify({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'T1', flatten: true } }));
    await until(() => cdpReplies.some((r) => r.id === 1 && r.result && r.result.sessionId === 'S-T1'), 3000);
    cdp.send(JSON.stringify({ id: 2, method: 'Target.attachToTarget', params: { targetId: 'T2', flatten: true } })); // verify r3: the daemon holds T2's session too (it dispatches there after a switch)
    await until(() => cdpReplies.some((r) => r.id === 2 && r.result && r.result.sessionId === 'S-T2'), 3000);
    let nextId = 3; const upSaw = []; let hold = null; let dispatchSid = 'S-T1'; // verify r3: which tab's session the fake daemon dispatches on
    const spPort = await freePort();
    const sp = new WebSocketServer({ port: spPort, host: '127.0.0.1' });
    await new Promise((r) => sp.on('listening', r));
    sp.on('connection', (ws) => {
      ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(JSON.stringify({ ...FIX.server_to_client.tabs, tabs: FIX.server_to_client.tabs.tabs.map((t) => ({ ...t, targetId: 'T1' })) })); ws.send(JSON.stringify(FIX.server_to_client.frame)); // verify r2: 0.38.1's tabs record names each tab's CDP targetId
      // measured on 0.38.1 (scripts/measure-input-receipts.mjs): params = the record's fields verbatim + the server's defaults, params.type = eventType, ON the active tab's page session
      const cdpParams = (m) => { const { type, eventType, rid, ...rest } = m; return type === 'input_mouse' ? { deltaX: 0, deltaY: 0, ...rest, type: eventType } : type === 'input_keyboard' ? { windowsVirtualKeyCode: 0, ...rest, type: eventType } : { modifiers: 0, ...rest, type: eventType }; };
      ws.on('message', (d) => { const m = JSON.parse(d); upSaw.push(m); if (/^input_/.test(m.type)) { const go = () => cdp.send(JSON.stringify({ id: nextId++, sessionId: dispatchSid, method: M.CREDIT_METHODS[m.type], params: cdpParams(m) })); if (hold) hold.push(go); else go(); } });
    });
    const sessions = new Map([['sess-m', { _browserKey: KEY, _browserEnv: null, name: 'Lark test' }]]);
    const keeper = {
      setFor: () => ({ attachments: [{ profileId: WORK, alias: 'work', label: 'work', isDefault: true }], children: [] }),
      list: () => ({ profiles: [{ id: WORK, label: 'work' }] }),
      streamPortFor: async () => ({ ok: true, port: spPort }),
      ...(credit ? { creditUserInput: (target, record, opts) => (target && target.profileId === WORK ? med.creditInput({ profileId: WORK, browserKey: KEY, record, targetId: opts && opts.targetId || null }) : null) } : {}), // verify r2: the tab the user looks at rides along (the real keeper passes it)
    };
    const bridge = BSmod.create({ keeper, activeSessions: sessions, requestAuthed: () => true, log: { warn() { }, log() { } } });
    const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
    srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
    const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
    const v = new WebSocket(`ws://127.0.0.1:${P}${S.STREAM_PATH}?session=sess-m&profile=${WORK}`);
    const got = []; v.on('message', (d) => got.push(JSON.parse(d)));
    await new Promise((r, e) => { v.on('open', r); v.on('error', e); });
    await until(() => got.some((m) => m.type === 'hello') && got.some((m) => m.type === 'frame'), 5000);
    v.send(JSON.stringify({ type: 'takeover' }));
    await until(() => got.some((m) => m.type === 'mode' && m.mode === 'takeover' && m.mine), 3000);
    const close = async () => { try { v.close(); } catch { } bridge.shutdown(); await new Promise((r) => srv.close(() => r())); try { cdp.close(); } catch { } for (const c of sp.clients) { try { c.terminate(); } catch { } } await new Promise((r) => sp.close(() => r())); med.shutdown(); };
    // verify r3: the fake daemon moves its dispatch to another tab's session / re-says its tabs record (an agent's `tab <n>`)
    const tabsNaming = (targetId) => ({ ...FIX.server_to_client.tabs, tabs: FIX.server_to_client.tabs.tabs.map((t) => ({ ...t, targetId })) });
    const emitTabs = (targetId) => { for (const c of sp.clients) c.send(JSON.stringify(tabsNaming(targetId))); };
    return { v, got, upSaw, cdp, cdpReplies, close, grantUrl: grant.url, hold: (on) => { if (on) hold = []; else { const q = hold || []; hold = null; q.forEach((fn) => fn()); } }, receipt: (rid) => got.find((m) => m.type === 'input-receipt' && m.rid === rid), dispatchOn: (sid) => { dispatchSid = sid; }, emitTabs, mode: () => [...got].reverse().find((m) => m.type === 'mode') };
  };
  // (a) the S2 world: credits
  {
    const w = await mkWorld(MED);
    chromeSaw.length = 0; chromeMode = 'ok';
    w.v.send(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: 10, y: 10, button: 'left', clickCount: 1, modifiers: 0, rid: 1 }));
    w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', rid: 2 }));
    await until(() => w.receipt(1) && w.receipt(2), 4000);
    ok(w.receipt(1)?.ok === true && w.receipt(1)?.via === 'browser' && w.receipt(2)?.ok === true && chromeSaw.filter((x) => /^Input\./.test(x)).length === 2, '⑤ while the user DRIVES a mediated browser, their click and key reach Chrome (on the bridge\'s credits) and each is RECEIPTED by Chrome\'s own reply (via browser)', JSON.stringify({ r: w.got.filter((m) => m.type === 'input-receipt'), chromeSaw }));
    ok(w.upSaw.filter((m) => /^input_/.test(m.type)).every((m) => m.rid === undefined), '⑤ the stream server received the records WITHOUT the view\'s rid');
    // an Input.* with NO credit while the user drives (an agent driving the scoped url directly) ⇒ still refused
    chromeSaw.length = 0; w.cdpReplies.length = 0;
    w.cdp.send(JSON.stringify({ id: 9001, method: 'Input.dispatchKeyEvent', params: { type: 'keyDown' } }));
    await until(() => w.cdpReplies.some((r) => r.id === 9001), 3000);
    ok(M.refusalCodeOf(w.cdpReplies.find((r) => r.id === 9001)) === 'browser_interrupted' && !chromeSaw.length, '⑤ an Input.* WITHOUT a credit (an agent driving the url directly) is still refused browser_interrupted while the user drives');
    // VERIFY S2 (2026-09-26, the credit theft): a credit is BOUND to the record's own CDP call. The user's click is
    // forwarded (its credit minted) but the stream server has not dispatched it yet — the AGENT's own click elsewhere,
    // an Input.insertText and an Enter from a SECOND socket of the lease race it to the mediator: every one refused
    // browser_interrupted, none burns the credit; the user's click then lands and is receipted
    {
      chromeSaw.length = 0; w.cdpReplies.length = 0;
      const other = new WebSocket(w.grantUrl); const otherReplies = []; other.on('message', (d) => otherReplies.push(JSON.parse(d))); await new Promise((r, e) => { other.on('open', r); other.on('error', e); });
      w.hold(true);
      w.v.send(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: 10, y: 10, button: 'left', clickCount: 1, modifiers: 0, rid: 11 }));
      await until(() => w.upSaw.some((m) => m.eventType === 'mousePressed' && m.x === 10 && m.rid === undefined), 3000);
      w.cdp.send(JSON.stringify({ id: 9101, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 999, y: 999, button: 'left', clickCount: 1, modifiers: 0, deltaX: 0, deltaY: 0 } }));
      w.cdp.send(JSON.stringify({ id: 9102, method: 'Input.insertText', params: { text: 'agent' } }));
      other.send(JSON.stringify({ id: 9103, method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, modifiers: 0 } }));
      await until(() => w.cdpReplies.some((r) => r.id === 9101) && w.cdpReplies.some((r) => r.id === 9102) && otherReplies.some((r) => r.id === 9103), 3000);
      const codes = [9101, 9102].map((i) => M.refusalCodeOf(w.cdpReplies.find((r) => r.id === i))).concat(M.refusalCodeOf(otherReplies.find((r) => r.id === 9103)));
      ok(codes.every((c) => c === 'browser_interrupted') && !chromeSaw.length, '⑤ FENCE: while the user\'s click waits on the stream server, the agent\'s own click / insertText / an Enter from a second socket of the lease are all refused browser_interrupted and reach no Chrome (' + codes.join(',') + ')', JSON.stringify({ codes, chromeSaw }));
      w.hold(false);
      await until(() => w.receipt(11), 4000);
      ok(w.receipt(11)?.ok === true && w.receipt(11)?.via === 'browser' && chromeSaw.filter((x) => /^Input\./.test(x)).length === 1, '⑤ …and the user\'s own click then lands on its credit and is receipted (the agent burnt nothing)', JSON.stringify({ r: w.receipt(11), chromeSaw }));
      other.close();
    }
    // VERIFY r2 (2026-09-26): the credit is bound to the TAB the user is looking at. The agent's OWN socket, on a
    // session of ITS tab T2, mirrors the user's exact Enter while the user's record waits on the stream server —
    // refused browser_interrupted, nothing burnt; a mirror on a session never handed out, and a bare one, burn nothing
    // either; each time the user's own Enter then lands on T1 and is receipted
    {
      const other = new WebSocket(w.grantUrl); const otherReplies = []; other.on('message', (d) => otherReplies.push(JSON.parse(d))); await new Promise((r, e) => { other.on('open', r); other.on('error', e); });
      other.send(JSON.stringify({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'T2', flatten: true } }));
      await until(() => otherReplies.some((r) => r.id === 1 && r.result && r.result.sessionId === 'S-T2'), 3000);
      const KEY_CDP = { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, modifiers: 0 };
      const KEY_REC = { type: 'input_keyboard', eventType: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, modifiers: 0 };
      const attempt = async (rid, sock, replies, msg) => {
        chromeSaw.length = 0; w.cdpReplies.length = 0; otherReplies.length = 0;
        w.hold(true);
        const n0 = w.upSaw.length; w.v.send(JSON.stringify({ ...KEY_REC, rid })); await until(() => w.upSaw.length > n0, 3000);
        sock.send(JSON.stringify(msg)); await until(() => replies.some((r) => r.id === msg.id), 3000);
        const code = M.refusalCodeOf(replies.find((r) => r.id === msg.id)) || 'admitted';
        const during = chromeSaw.filter((x) => /^Input\./.test(x)).length;
        w.hold(false); await until(() => w.receipt(rid), 4000);
        return { code, during, after: chromeSaw.filter((x) => /^Input\./.test(x)).length, receipt: w.receipt(rid) };
      };
      const a = await attempt(31, other, otherReplies, { id: 9301, sessionId: 'S-T2', method: 'Input.dispatchKeyEvent', params: KEY_CDP });
      ok(a.code === 'browser_interrupted' && a.during === 0 && a.after === 1 && a.receipt?.ok === true, '⑤ r2 FENCE: the agent\'s own socket on ITS tab (a handed session on T2) mirroring the user\'s exact Enter is refused browser_interrupted and burns nothing — the user\'s Enter lands on the tab they look at and is receipted', JSON.stringify(a));
      const b = await attempt(32, other, otherReplies, { id: 9302, sessionId: 'S-nope', method: 'Input.dispatchKeyEvent', params: KEY_CDP });
      ok(b.code === 'session_out_of_scope' && b.during === 0 && b.after === 1 && b.receipt?.ok === true, '⑤ r2: a mirror on a session the lease was never handed burns nothing (under r1 it spent the credit and the user\'s key was refused)', JSON.stringify(b));
      const c = await attempt(33, w.cdp, w.cdpReplies, { id: 9303, method: 'Input.dispatchKeyEvent', params: KEY_CDP });
      ok(c.code === 'browser_interrupted' && c.during === 0 && c.after === 1 && c.receipt?.ok === true, '⑤ r2: a BARE mirror (no CDP session — a call Chrome could not run) burns nothing', JSON.stringify(c));
      other.close();
    }
    // VERIFY r3 (2026-09-26): (i) the LAG — the daemon dispatches on T2 while the bridge's last tabs record still names T1
    // (measured on 0.38.1 the record lands first; on a slower box it may not): the key is refused on T2 and its receipt SAYS
    // `other_tab`, never "never asked"; (ii) an agent's `tab <n>` while the user drives — the tabs record now names T2 as
    // active — marks the takeover SWITCHED: the user's next key is answered `tab_switched` and NEVER forwarded (the stream
    // server sees no record); hand back + take over again (consent) re-anchors to T2 and the key lands there; (iii) a SPENT
    // credit whose dispatch Chrome never answers is not mis-reported `not_dispatched` at 1.3 s (a hidden tab's mouse input)
    {
      chromeSaw.length = 0; w.dispatchOn('S-T2');
      const n0 = w.upSaw.length;
      w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81, modifiers: 0, text: 'q', rid: 51 }));
      await until(() => w.receipt(51), 4000);
      ok(w.receipt(51)?.ok === false && w.receipt(51)?.code === 'other_tab' && w.upSaw.length > n0 && !chromeSaw.some((x) => /^Input\./.test(x)), '⑤ r3 LAG: the daemon dispatching the user\'s key on another tab than the one the bridge saw active ⇒ refused there, receipt says other_tab (never "never asked")', JSON.stringify({ r: w.receipt(51), chromeSaw }));
      w.dispatchOn('S-T1');
      w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82, modifiers: 0, text: 'r', rid: 52 }));
      await until(() => w.receipt(52), 4000);
      ok(w.receipt(52)?.ok === true && chromeSaw.filter((x) => /^Input\./.test(x)).length === 1, '⑤ r3 …and once the daemon is back on the user\'s tab the next key lands and is receipted');
      // (ii) the switch
      chromeSaw.length = 0; w.emitTabs('T2'); await sleep(150);
      const n1 = w.upSaw.length;
      w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 0, text: 's', rid: 53 }));
      await until(() => w.receipt(53), 3000);
      ok(w.receipt(53)?.ok === false && w.receipt(53)?.code === 'tab_switched' && w.receipt(53)?.error && /hand back and take over again/.test(w.receipt(53).error) && w.upSaw.length === n1 && !chromeSaw.length, '⑤ r3 SWITCH: the stream naming another active tab while the user drives ⇒ their next key is answered tab_switched and NEVER forwarded (the stream server saw no record, Chrome nothing)', JSON.stringify({ r: w.receipt(53), forwarded: w.upSaw.length - n1, chromeSaw }));
      w.v.send(JSON.stringify({ type: 'handback' })); await until(() => w.mode() && w.mode().mode === 'watch', 3000);
      w.v.send(JSON.stringify({ type: 'takeover' })); await until(() => w.mode() && w.mode().mode === 'takeover' && w.mode().mine, 3000);
      w.dispatchOn('S-T2'); chromeSaw.length = 0;
      w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, modifiers: 0, text: 't', rid: 54 }));
      await until(() => w.receipt(54), 4000);
      ok(w.receipt(54)?.ok === true && w.receipt(54)?.via === 'browser' && chromeSaw.filter((x) => /^Input\./.test(x)).length === 1, '⑤ r3 …hand back + take over again = consent to drive what is on show: the takeover re-anchors to T2 and the key lands there', JSON.stringify({ r: w.receipt(54), chromeSaw }));
      // back to the shape the later legs expect: T1 on show, dispatch on T1, a fresh takeover
      w.v.send(JSON.stringify({ type: 'handback' })); await until(() => w.mode() && w.mode().mode === 'watch', 3000);
      w.emitTabs('T1'); w.dispatchOn('S-T1'); await sleep(150);
      w.v.send(JSON.stringify({ type: 'takeover' })); await until(() => w.mode() && w.mode().mode === 'takeover' && w.mode().mine, 3000);
      // (iii) a spent credit Chrome never answers
      chromeMode = 'silent'; chromeSaw.length = 0;
      w.v.send(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: 30, y: 30, button: 'left', clickCount: 1, modifiers: 0, rid: 55 }));
      await until(() => chromeSaw.some((x) => x === 'Input.dispatchMouseEvent'), 3000); await sleep(M.INPUT_CREDIT_MS + 500);
      ok(chromeSaw.some((x) => x === 'Input.dispatchMouseEvent') && !w.receipt(55), `⑤ r3 a credit SPENT on a dispatch Chrome has not answered is not settled "never asked" at ${M.INPUT_CREDIT_MS + 100} ms (it waits for the browser; the view's own 1.5 s sweep says no_answer)`, JSON.stringify({ r: w.receipt(55), chromeSaw }));
      chromeMode = 'ok';
    }
    chromeMode = 'error';
    w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'b', code: 'KeyB', rid: 3 }));
    await until(() => w.receipt(3), 4000);
    ok(w.receipt(3) && w.receipt(3).ok === false && w.receipt(3).code === 'browser_refused', '⑤ Chrome refusing the dispatch ⇒ the receipt says NOT DELIVERED (browser_refused)', JSON.stringify(w.receipt(3)));
    chromeMode = 'ok';
    // watch mode: an input from a viewer that does not drive is answered, never silent
    w.v.send(JSON.stringify({ type: 'handback' }));
    await until(() => w.got.some((m) => m.type === 'mode' && m.mode === 'watch'), 3000);
    w.v.send(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: 1, y: 1, button: 'left', clickCount: 1, rid: 4 }));
    await until(() => w.receipt(4), 3000);
    ok(w.receipt(4) && w.receipt(4).ok === false && w.receipt(4).code === 'watch-mode', '⑤ an input sent in Watch mode is answered not delivered (watch-mode)');
    await w.close();
  }
  // (b) CONTROL — as shipped before S2: no credit. Chrome never sees the user's input (the mediator's paused fence
  // refused it) and the bridge can only say it WROTE the record — the study's silent loss, made visible here
  {
    const w = await mkWorld(MED, { credit: false });
    chromeSaw.length = 0;
    w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', rid: 1 }));
    await until(() => w.receipt(1), 3000); await sleep(300);
    const refused = w.cdpReplies.some((r) => M.refusalCodeOf(r) === 'browser_interrupted');
    ok(w.receipt(1)?.via === 'stream' && !chromeSaw.some((x) => /^Input\./.test(x)) && refused, '⑤ CONTROL (no credit, the pre-S2 bridge): the user\'s key never reaches Chrome — the mediator refused it browser_interrupted — while the bridge could only say "written" (the study\'s silent loss)', JSON.stringify({ receipt: w.receipt(1), chromeSaw, refused }));
    await w.close();
  }
  // (c) CONTROL — a mediator copy WITHOUT the credit rule: the credit is never spent ⇒ the receipt says NOT DELIVERED
  {
    const MUT = mutantCopies('browser-fact', REPO);
    const src = fs.readFileSync(path.join(REPO, 'src/server/cdp-mediator.js'), 'utf8');
    const needle = "if (M.isInputMethod(msg.method) && g.credits && g.credits.length) {";
    ok(src.includes(needle), '⑤ control setup: the credit admission is found in src/server/cdp-mediator.js');
    const mutMed = MUT.load('src/server/cdp-mediator.js', src.replace(needle, 'if (false) {'), 'nocredit');
    const w = await mkWorld(mutMed);
    chromeSaw.length = 0;
    w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', rid: 1 }));
    await until(() => w.receipt(1), 4000);
    ok(w.receipt(1) && w.receipt(1).ok === false && ['not_dispatched', 'browser_refused'].includes(w.receipt(1).code) && !chromeSaw.some((x) => /^Input\./.test(x)), `⑤ CONTROL (a mediator without the credit rule): the key is refused — and the receipt SAYS not delivered (${w.receipt(1) && w.receipt(1).code}), never silence`, JSON.stringify(w.receipt(1)));
    await w.close();
    // (d) CONTROL — the mediator as built before the verify round (the HEAD credit, whatever the call): the agent's own
    //     click during the takeover spends the user's credit and lands, and the user's key is refused browser_interrupted
    {
      const needle2 = "const tc = M.takeCredit(g.credits, now(), { msg, sessionTarget: (sid) => g.scope.sessions.get(sid) });";
      ok(src.includes(needle2), '⑤ control setup: the bound takeCredit is found in src/server/cdp-mediator.js');
      const mutHead = MUT.load('src/server/cdp-mediator.js', src.replace(needle2, 'const tc = { credit: g.credits.shift(), expired: [] };'), 'headcredit');
      const w = await mkWorld(mutHead);
      chromeSaw.length = 0; w.cdpReplies.length = 0;
      w.hold(true);
      w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 0, text: 'a', rid: 21 }));
      await until(() => w.upSaw.some((m) => m.eventType === 'keyDown' && m.key === 'a'), 3000);
      w.cdp.send(JSON.stringify({ id: 9201, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 999, y: 999, button: 'left', clickCount: 1, modifiers: 0, deltaX: 0, deltaY: 0 } }));
      await until(() => w.cdpReplies.some((r) => r.id === 9201), 3000);
      w.hold(false);
      await until(() => w.receipt(21), 4000); await sleep(200);
      const agentLanded = chromeSaw.some((x) => x === 'Input.dispatchMouseEvent'); const userLanded = chromeSaw.some((x) => x === 'Input.dispatchKeyEvent');
      ok(agentLanded && !userLanded && w.receipt(21)?.ok === true, '⑤ CONTROL (the head-credit mediator): the agent\'s click lands during the takeover, the user\'s key is refused, and the receipt says delivered — the attack the bound credit closes', JSON.stringify({ chromeSaw, r: w.receipt(21) }));
      await w.close();
    }
    // (e) CONTROL — the r1 binding (the call's method + params, NOT its tab: any handed session answers the credit's
    //     own tab): the agent's socket on ITS tab spends the user's credit with the exact key — a trusted Enter lands
    //     on T2, the user's Enter is refused, and the receipt says delivered (verify r2 on the real 0.38.1)
    {
      const needle3 = "sessionTarget: (sid) => g.scope.sessions.get(sid)";
      ok(src.includes(needle3), '⑤ control setup: the session→tab read is found in src/server/cdp-mediator.js');
      const mutR1 = MUT.load('src/server/cdp-mediator.js', src.replace(needle3, "sessionTarget: (sid) => (g.scope.sessions.has(sid) ? ((g.credits[0] && g.credits[0].expect.targetId) || 'T1') : undefined)"), 'r1credit');
      const w = await mkWorld(mutR1);
      const other = new WebSocket(w.grantUrl); const otherReplies = []; other.on('message', (d) => otherReplies.push(JSON.parse(d))); await new Promise((r, e) => { other.on('open', r); other.on('error', e); });
      other.send(JSON.stringify({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'T2', flatten: true } }));
      await until(() => otherReplies.some((r) => r.id === 1 && r.result && r.result.sessionId === 'S-T2'), 3000);
      chromeSaw.length = 0; w.hold(true);
      w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, modifiers: 0, rid: 41 }));
      await until(() => w.upSaw.some((m) => m.eventType === 'keyDown' && m.key === 'Enter'), 3000);
      other.send(JSON.stringify({ id: 9401, sessionId: 'S-T2', method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, modifiers: 0 } }));
      await until(() => otherReplies.some((r) => r.id === 9401), 3000);
      const stolen = !otherReplies.find((r) => r.id === 9401).error && chromeSaw.filter((x) => /^Input\./.test(x)).length === 1;
      w.hold(false); await until(() => w.receipt(41), 4000); await sleep(200);
      ok(stolen && chromeSaw.filter((x) => /^Input\./.test(x)).length === 1 && w.receipt(41)?.ok === true, '⑤ CONTROL (the r1 binding): the agent\'s mirrored Enter on its OWN tab lands, the user\'s Enter is refused, and the receipt says delivered — the theft the tab-bound credit closes', JSON.stringify({ chromeSaw, r: w.receipt(41), reply: otherReplies.find((r) => r.id === 9401) }));
      other.close(); await w.close();
    }
    // (f) CONTROL (verify r3) — a bridge copy WITHOUT the takeover anchor: the daemon's `tab <n>` while the user drives is
    //     FOLLOWED — the user's key is forwarded, dispatched on the agent's tab, and receipted "delivered"
    {
      const bsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
      const needleB = "      if (v.forward && relay.anchor && relay.anchor.switched) { receipt(S.tabSwitchedReceipt(relay.anchor)); return; }";
      ok(bsrc.includes(needleB), '⑤ control setup: the anchor refusal is found in src/server/browser-stream.js');
      const mutBS = MUT.load('src/server/browser-stream.js', bsrc.replace(needleB, ''), 'noanchor');
      const w = await mkWorld(MED, { BSmod: mutBS });
      await sleep(S.TAKEOVER_ANCHOR_GRACE_MS + 100);
      chromeSaw.length = 0; w.emitTabs('T2'); w.dispatchOn('S-T2'); await sleep(150);
      w.v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'u', code: 'KeyU', windowsVirtualKeyCode: 85, modifiers: 0, text: 'u', rid: 61 }));
      await until(() => w.receipt(61), 4000);
      ok(w.receipt(61)?.ok === true && chromeSaw.filter((x) => /^Input\./.test(x)).length === 1, '⑤ CONTROL (a bridge without the anchor): the agent\'s switch is followed — the user\'s key lands on the agent\'s tab and the receipt says delivered (the hole the anchor closes)', JSON.stringify({ r: w.receipt(61), chromeSaw }));
      await w.close();
    }
    for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { label: '⑤ controls: ' })) ok(c.pass, c.name, c.detail);
  }
  await new Promise((r) => chrome.close(() => r()));
}

// ═══ ⑥ THE CENSUS ═══
console.log('— ⑥ the census: every surface prints THE fact, none derives its own');
const SURFACES = ['src/lib/chat-view.js', 'src/lib/chat-status-bar.js', 'src/lib/session-props.js', 'src/lib/browser-profile-picker.js', 'src/lib/session-card.js', 'src/lib/browser-live-window.js'];
const RAW = /([\w$]*)\.(browserProfileId|browserProfileActive|browserLive|browserPinOrigin)\b(?!\s*[:(])/g;
/** Findings: a surface reading a raw identity field of a SESSION ROW (never the fact). Comments are skipped; so are
 *  a Task Group's own default (`group.browserProfileId` — a group field, not the session's answer), the glyph
 *  (`UI_ICONS.browserLive`), a live-view window's API handle (`w._browserLive`) and a command id inside a string. */
function censusOf(file, text) {
  const out = [];
  text.split('\n').forEach((ln, i) => {
    const code = ln.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (const m of code.matchAll(RAW)) {
      const recv = m[1] || '';
      if (['group', 'UI_ICONS', 'task', 'g'].includes(recv)) continue;
      const before = code.slice(0, m.index);
      if (((before.match(/'/g) || []).length % 2) === 1) continue; // inside a '…' literal (a command id like 'session.browserLive')
      out.push(`${file}:${i + 1}: ${m[0]}`);
    }
  });
  return out;
}
{
  const findings = [];
  for (const f of SURFACES) findings.push(...censusOf(f, fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok(findings.length === 0, `⑥ no surface reads a raw identity field (${SURFACES.length} files: browserProfileId / browserProfileActive / browserLive / browserPinOrigin)`, findings.join('\n'));
  const readsFact = SURFACES.filter((f) => !/browserFact|browserFactWords|browserPinSummaryHtml|_browserProfile\.words|\{ fact: f, words: w \}/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok(readsFact.length === 0, '⑥ every surface reads the fact (browserFact / browserFactWords)', readsFact.join(', '));
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/browserFact: \(\(\) => \{ try \{ return s\._browserKey && browserKeeper\?\.factFor \? browserKeeper\.factFor\(require\('\.\/src\/browser-fact\.js'\)\.sessionFactsOf\(s\)\)/.test(srv), '⑥ the active-sessions payload publishes `browserFact` computed by the keeper (the ONE choke point)');
  const payloadLine = srv.split('\n').find((l) => l.includes('browserFact: (() =>')) || '';
  ok(payloadLine.indexOf('browserFact: (() =>') < (payloadLine.indexOf('//') === -1 ? Infinity : payloadLine.indexOf('//')), '⑥ …and the key sits BEFORE the line\'s `//` comment (code after a mid-line // is a comment — the 2.369.134 lesson)');
  const sb = fs.readFileSync(path.join(REPO, 'src/lib/sidebar.js'), 'utf8');
  ok(/browserFact: \{ digest: \(v\) => \(v && typeof v === 'object' \? String\(v\.digest \|\| ''\) : ''\) \}/.test(sb), '⑥ LIVE_SESSION_FACTS carries the fact with a STRING digest (the card re-renders when it moves)');
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/browserKeeper\.onChange\(/.test(wiring) && /if \(moved\) \{ try \{ broadcastActiveSessions/.test(wiring), '⑥ a registry change re-publishes active-sessions only when a fact digest moved');
  // CONTROL: a patched copy of chat-view.js that derives its own answer from the raw pair again is caught
  const MUT = mutantCopies('browser-fact-census', REPO);
  const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  const anchor = "    const fact = row.browserFact || null;";
  ok(cv.includes(anchor), '⑥ control setup: the chip\'s fact read is found in chat-view.js');
  const mutPath = MUT.write('src/lib/chat-view.js', cv.replace(anchor, anchor + "\n    const pinnedOwn = row.browserProfileId || ''; const activeOwn = row.browserProfileActive;"), 'derives');
  const caught = censusOf('chat-view (patched copy)', fs.readFileSync(mutPath, 'utf8'));
  ok(caught.length === 2, `⑥ CONTROL: a chat-view copy that reads browserProfileId / browserProfileActive again is caught (${caught.length} finding(s))`, caught.join('\n'));
  for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { label: '⑥ controls: ' })) ok(c.pass, c.name, c.detail);
}

// ═══ ⑦ THE KEYLESS FACT (B-f7ab) ═══
// A live local session with no browser key YET (it started before per-session browsers, or while they were off) gets
// one on its first browser command (src/server/browser-key.js) — so every surface says "no browser yet", never
// "predates the feature" and never nothing at all where a key is on its way.
console.log('— ⑦ the keyless fact: "no browser yet" where the first browser command gets one');
{
  const f = BF.keylessFact();
  const w = BF.browserFactWords(f);
  ok(f.key === '' && f.keyless === true && f.using.kind === 'none' && f.using.state === 'not-started' && !f.live && !f.differs && !f.pinned && typeof f.digest === 'string' && f.digest.length > 0,
    '⑦ keylessFact: no key, nothing in use, nothing live, nothing pinned — a string digest (the sidebar\'s LIVE_SESSION_FACTS row re-renders when the key arrives)', JSON.stringify(f));
  ok(w.line === 'no browser yet' && w.name === 'no browser yet' && w.state === 'not started yet' && w.show === false && w.amber === false && /first browser command gets one, no restart needed/.test(w.tooltip) && noRawId(w.tooltip) && !/predates/.test(w.tooltip + w.line),
    '⑦ its words: "no browser yet", the tooltip says the first browser command gets one (no restart), never "predates", no raw id; show false (the status-bar chip stays hidden — it needs a key)', JSON.stringify(w));
  const translated = BF.browserFactWords(f, (x) => '<' + x + '>');
  ok(translated.line === '<no browser yet>' && /^<This session has no browser yet/.test(translated.tooltip), '⑦ every word goes through the caller\'s t() (literal keys — the extractor finds them)');
  ok(f.digest !== BF.factDigest(BF.browserFactFor({ browserKey: KEY, variant: 'D', remote: false }, { profiles: PROFILES, now: 1 })), '⑦ the keyless digest differs from the first real fact (the key\'s arrival moves every surface)');
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/sessionFactsOf\(s\)\) : \(browserKeys\?\.keylessFactOf\?\.\(s\) \|\| null\); \} catch \{ return null; \} \}\)\(\),/.test(srv), '⑦ the active-sessions payload publishes the keyless fact for a session with no key (the late-key engine decides where one is on its way)');
  const stream = require('../src/browser-stream.js');
  const nk = stream.streamTargetFor({ browserKey: '' });
  ok(nk.code === 'no-key' && /no browser yet/.test(nk.error) && !/predates/.test(nk.error), '⑦ the live view of such a session says "no browser yet" too (a view never starts a browser nor mints a key)', nk.error);
}

// ═══ ⑧ lane browser-resume B (§3.9): WHAT IS KEPT rides THE fact — the Resume every surface offers reads it here ═══
console.log('— ⑧ lane browser-resume B: the kept fact, ownResumable, the stopped line\'s words');
{
  const view = (o = {}) => ({ profiles: PROFILES, pin: null, attachments: [], browsers: {}, own: { profileId: 'bp-00000009', state: 'stopped' }, input: null, live: '', now: 1000000, ...o });
  const sess = (o = {}) => ({ browserKey: KEY, pinId: null, pinOrigin: null, active: '', variant: 'D', remote: false, ...o });
  const kf = BF.browserFactFor(sess(), view({ kept: { tabs: 3, kind: 'full', stoppedWhy: 'turn-idle', restoreBy: 'auto', handedBack: false, waiting: 0 } }));
  ok(kf.own && kf.own.kept && kf.own.kept.tabs === 3 && kf.own.kept.kind === 'full' && kf.own.kept.why === 'turn-idle' && BF.ownResumable(kf), '⑧ a stopped own browser with 3 kept tabs: `own.kept` rides the fact and it is resumable', JSON.stringify(kf.own));
  const running = BF.browserFactFor(sess(), view({ own: { profileId: 'bp-00000009', state: 'ready' }, kept: { tabs: 3, kind: 'full' } }));
  const none = BF.browserFactFor(sess(), view({ kept: null }));
  const empty = BF.browserFactFor(sess(), view({ kept: { tabs: 0, kind: 'tabs-only' } }));
  const loginsOnly = BF.browserFactFor(sess(), view({ kept: { tabs: 0, kind: 'full' } }));
  const remote = BF.browserFactFor(sess({ remote: true }), view({ kept: { tabs: 3, kind: 'full' } }));
  ok(!BF.ownResumable(running) && !BF.ownResumable(none) && !BF.ownResumable(empty) && BF.ownResumable(loginsOnly) && !BF.ownResumable(remote) && !BF.ownResumable(null), '⑧ ownResumable: never while it runs, never with nothing kept (no directory, no tab), never for a session on another machine; its logins alone are enough');
  ok(kf.digest !== none.digest && kf.digest !== BF.browserFactFor(sess(), view({ kept: { tabs: 3, kind: 'full', restoreBy: 'user' } })).digest && BF.browserFactFor(sess(), view({ kept: { tabs: 3, kind: 'full', restoreBy: 'user' } })).digest !== BF.browserFactFor(sess(), view({ kept: { tabs: 3, kind: 'full', restoreBy: 'user', handedBack: true } })).digest, '⑧ the digest moves with what is kept (a Forget, a Resume, a hand-back re-render every surface)');
  const words = BF.keptLineWords(kf);
  const fenced = BF.keptLineWords(BF.browserFactFor(sess(), view({ kept: { tabs: 2, kind: 'fenced' } })));
  ok(/3 tab\(s\) and its logins are kept/.test(words) && /fenced to allowed domains/.test(fenced) && /its logins are kept/.test(BF.keptLineWords(loginsOnly)) && BF.keptLineWords(none) === '', '⑧ the stopped line says what is kept (tabs + logins / tabs only because fenced / logins only); nothing kept ⇒ no line', [words, fenced]);
  ok(/^<Stopped/.test(BF.keptLineWords(kf, (x) => '<' + x + '>')), '⑧ …through the caller\'s t() (literal keys)');
  const kb = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ok(/let kept = null; if \(B\.isBrowserKey\(bk\)\) \{ try \{ const ks = keptStore\(\); kept = ks \? ks\.brief\(bk\) : null; \}/.test(kb) && /browsers, own, input, live, now: now\(\), stuck, kept \};/.test(kb), '⑧ the keeper\'s factView reads the kept store\'s brief (the ONE fact — no surface reads the store itself)');
  const lw = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  const cr = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
  ok(/if \(ref === EPHEMERAL_REF \|\| \(!ref && !st\.target && f && f\.using && f\.using\.kind === 'own'\)\) return ownResumable\(f\);/.test(lw) && /if \(!fact \|\| fact\.key !== key \|\| !ownResumable\(fact\)\) return false;/.test(cr), '⑧ the live view\'s Resume and the chat end card\'s Resume both ask ownResumable over THE fact (no second derivation)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
